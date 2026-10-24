---
type: how-to
audience: [owner, operator]
owner: unfold
last_verified: 2026-10-24
verified_by: "Talos patches in apps/unfold/ops/cluster/sandbox-runtimes/talos validated with talosctl 1.13.4 validate --mode metal; Talos VolumeConfig and disk-encryption docs for v1.13 and Longhorn 1.10 volume-encryption docs read on 2026-10-24; apps/unfold/src/store.ts read for the internal-state key; TPM presence read with talosctl ls /sys/class/tpm on the homelab's six nodes. The rolling wipe under step 2 and the encryptionProvider check were not run on any cluster."
---

# Protect data at rest and in transit

To keep a stolen disk or a tapped network from exposing what agents work on, encrypt three things: every node's disks, traffic between nodes, and the volumes that hold repositories and databases. Unfold and Ploeg encrypt only a little themselves, so most of this is the cluster's job. [How agent code is contained](../concepts/how-agent-code-is-contained.md#encryption) explains what each layer protects against and what it does not.

Do this before the first real repository reaches the cluster. On Talos, encrypting a disk that is already in use means wiping it.

## What needs protecting

| Data | Where it lives | Holds |
| --- | --- | --- |
| Agent workspaces | Unfold's workspace PersistentVolumeClaims (`workspaceStorageClass`), Ploeg workers' and Unfold's `emptyDir` scratch on the node's ephemeral disk | Cloned source code, build output, anything an agent wrote, including secrets it found in a repository |
| Unfold's state | `unfold.sqlite` on the application volume, with its `unfold.sqlite.key` next to it | Sessions, events, action records; linked-account tokens encrypted with AES-256-GCM under that key |
| Ploeg's state | Its PostgreSQL database | Runs, Shifts, outcomes, findings, budgets |
| Kubernetes Secrets | etcd | Forge tokens, the gateway master key, database passwords |
| Backups | Your object store | Copies of all of the above |
| Traffic | Between nodes, and from the cluster to the forge, the model gateway and the tracker | All of the above in motion, plus prompts and model output |

Unfold's own encryption of linked-account tokens keeps them out of a copied database file, but the key sits on the same volume. A copy of the whole volume, or of the disk under it, holds both, so the disk still needs encrypting.

## 1. Check what each node can seal a key with

A disk key is only as strong as what guards it. Three options exist on Talos:

| Key | Guards against | Needs |
| --- | --- | --- |
| `tpm` | A stolen disk, and a stolen machine that boots something else | A TPM 2.0 chip or firmware TPM. Bound to PCR 7 (the Secure Boot state) by default; strongest with Secure Boot on |
| `kms` | A stolen disk or machine, as long as the key server is out of reach | A key server reachable over the network at boot |
| `nodeID` | A disk that leaves the building on its own: sold, returned for repair, thrown away | Nothing. The key is derived from the machine's UUID, so whoever has the machine has the key |

`static` (a passphrase in the machine configuration) is not listed: the passphrase sits in cleartext next to the disk for STATE.

See which nodes have a TPM:

```sh
talosctl -n <node> ls /sys/class/tpm
```

A `tpm0` entry means a TPM is present. Many desktop and older boards ship with a firmware TPM (Intel PTT, AMD fTPM) turned off; turn it on in the firmware settings and check again before falling back to `nodeID`.

## 2. Encrypt the node disks (Talos)

Talos encrypts two system volumes with LUKS2: STATE, which holds the machine configuration, and EPHEMERAL, which holds `/var`: container images, `emptyDir` volumes, logs and, on most installations, Longhorn's `/var/lib/longhorn`.

1. Pick the patch for the node: [`volume-encryption-tpm.yaml`](../../apps/unfold/ops/cluster/sandbox-runtimes/talos/volume-encryption-tpm.yaml) or [`volume-encryption-nodeid.yaml`](../../apps/unfold/ops/cluster/sandbox-runtimes/talos/volume-encryption-nodeid.yaml). Both set `lockToState: true` on EPHEMERAL, so EPHEMERAL cannot be opened without the STATE it was created with.
2. Add it to the node's patches and check the result:

    ```sh
    talosctl machineconfig patch worker.yaml --patch @volume-encryption-tpm.yaml -o worker-encrypted.yaml
    talosctl validate --config worker-encrypted.yaml --mode metal
    ```

3. For a node that is not installed yet, install it with that configuration and you are done. For a node already in use, read the next section first.

### Encrypt a node that is already running

Talos cannot encrypt a partition that holds data. The partition is wiped, and encrypted on the next boot. Do one node at a time:

1. If the node stores Longhorn replicas, check in the Longhorn UI that every volume on it has a healthy replica on another node. A volume with one replica loses its data.
2. Drain the node: `kubectl drain <node> --ignore-daemonsets --delete-emptydir-data`.
3. Stage the new configuration: `talosctl -n <node> apply-config --file worker-encrypted.yaml --mode staged`.
4. Wipe EPHEMERAL and reboot: `talosctl -n <node> reset --system-labels-to-wipe EPHEMERAL --reboot`.
5. STATE holds the configuration itself, so wiping it puts the node in maintenance mode: `talosctl -n <node> reset --system-labels-to-wipe STATE`, then `talosctl -n <node> apply-config --insecure --file worker-encrypted.yaml`.
6. Check that both volumes are encrypted: `talosctl -n <node> get volumestatus STATE -o yaml` and the same for `EPHEMERAL` show `encryptionProvider: luks2`.
7. Uncordon the node, wait until Longhorn reports every volume healthy again, then go on to the next node.

A control-plane node also holds an etcd member. Remove nothing from etcd by hand; wipe one control-plane node at a time and wait for `talosctl -n <node> etcd status` to show it back in the cluster.

## 3. Encrypt traffic between nodes

With Cilium, turn on transparent WireGuard encryption in its Helm values:

```yaml
encryption:
  enabled: true
  type: wireguard
```

Every pod-to-pod packet that leaves a node is then encrypted, including Longhorn's replication, which runs between pods. Cilium creates and rotates the per-node keys itself. Host-network traffic and NodePorts stay outside it unless you also set `nodeEncryption: true`, which has its own trade-offs in Cilium's documentation; agent pods never use the host network, so they are covered either way. Other network plugins: Calico and Flannel both offer WireGuard modes.

Traffic that leaves the cluster (to GitHub, a model provider) is TLS from the client. Inside the cluster, Unfold reaches Ploeg, the forge and the gateway at the URLs you configure; give anything that crosses an untrusted network an `https://` URL.

## 4. Encrypt the Kubernetes Secrets in etcd

Talos encrypts Secrets in etcd by default (`secretbox`). On another distribution, set an `EncryptionConfiguration` on the API server: k3s has `--secrets-encryption`, kubeadm takes `--encryption-provider-config`. Managed clusters encrypt etcd themselves; EKS, GKE and AKS can add a key from their key management service.

## 5. Encrypt volumes and backups

Disk encryption already covers every volume on that disk. Add per-volume encryption when backups leave the cluster, or when the storage nodes are not the nodes you control:

* **Longhorn.** A StorageClass with `encrypted: "true"` and the `csi.storage.k8s.io/*-secret-name` and `-namespace` parameters encrypts each volume with LUKS, and Longhorn's backups of it are encrypted too. The Secret holds `CRYPTO_KEY_VALUE` and `CRYPTO_KEY_PROVIDER: secret`; `${pvc.name}` in the secret name gives each volume its own key. The node needs the `dm_crypt` module, which Talos has. Point Unfold's workspaces at it with `workspaceStorageClass`. Longhorn documents no key rotation, so a lost key is a lost volume: keep it in your vault, not only in the cluster.
* **Unfold's application volume.** Back up `unfold.sqlite.key` apart from the database copy, so one stolen backup is not both.
* **PostgreSQL.** Encrypt the backup target or the backup tool's output; CloudNativePG's object-store backups support server-side encryption on S3-compatible stores.

## 6. Know what stays unencrypted

* **Memory.** A process with root on the node can read the memory of every pod, including a Kata VM's. Encrypting memory against the host takes confidential computing hardware (AMD SEV-SNP or Intel TDX); [How agent code is contained](../concepts/how-agent-code-is-contained.md#encryption) says where that stands.
* **What agents send to models.** Prompts and repository content reach your model provider. Choose the provider, and its region, on that basis; the gateway's configuration is where that choice lives.
* **Logs.** Container logs sit on EPHEMERAL and are encrypted with it; a log shipper's destination is encrypted only if you set it up that way.
