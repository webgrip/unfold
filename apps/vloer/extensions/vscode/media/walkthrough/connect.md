# Connect once, work anywhere

De Vloer runs agents, model calls and repository checkouts on your workbench server. The extension is a thin client of its authenticated API.

- Enter the HTTPS origin of your team server, or `http://127.0.0.1:4080` for the local demo.
- Sign in with your Vloer account. The password is used once; the opaque session cookie is stored in VS Code SecretStorage.
- The activity bar shows a badge whenever a session needs you. The status bar turns amber when a decision is waiting and opens it on click.

Nothing on your laptop is uploaded by connecting.
