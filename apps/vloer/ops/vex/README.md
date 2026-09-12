# OpenVEX statements

Reviewed exploitability statements for findings the release gate should not count. Each statement is scoped to one image at one digest, carries a status and a justification from the OpenVEX vocabulary, and is attested onto the image by the signing step. Harbor's project allowlist stays empty; a suppression without a statement here does not exist.

Both images start at a budget of zero critical and zero high findings in `enforce` mode, as recorded in [ops/security/cve-budgets.yaml](../security/cve-budgets.yaml). The measured state on 2026-09-10 was zero findings at every severity, so this directory is empty. Add a statement only after a rebuild on a patched base cannot remove the finding, and reference the [infrastructure VEX guide](https://forgejo.webgrip.dev/webgrip/infrastructure/src/branch/main/ops/vex/README.md) for the file shape.
