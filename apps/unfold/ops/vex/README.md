# OpenVEX statements

Reviewed exploitability statements for findings the release gate should not count. Each statement is scoped to one image at one digest, carries a status and a justification from the OpenVEX vocabulary, and is attested onto the image by the signing step. Harbor's project allowlist stays empty; a suppression without a statement here does not exist.

Both images have a budget of zero critical and zero high findings in `enforce` mode, as recorded in [ops/security/cve-budgets.yaml](../security/cve-budgets.yaml). No statements are in force.

When a fix is in Alpine but not yet in dhi.io's repository, the [agent image](../agent/Dockerfile) installs the fixed package from Alpine's signed repository with a minimum-version constraint, and that line goes once dhi.io carries the fix. Add a statement only when a rebuild on a patched base cannot remove the finding and the vulnerable code is unreachable in the image, and follow the [infrastructure VEX guide](https://forgejo.webgrip.dev/webgrip/infrastructure/src/branch/main/ops/vex/README.md) for the file shape.
