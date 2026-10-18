# Use Unfold from the Agents window

VS Code's Agents window lists your Unfold sessions next to your other agents. Signing in to Unfold adds the workbench there on its own; no settings to edit.

- **Open the Agents window** with the command on the left. It connects within seconds, and the status bar then shows **Unfold · Agents window ✓**.
- **Start a session**: choose **New**, open **Workspace ▾**, choose **Folders (Unfold)** and pick the repository's folder. The first message starts the team on the workbench.
- **Find your sessions** grouped as **Unfold · <repository> [Unfold]**. A failed session says why.
- **Jump to one session**: right-click a session or Work Item in the **Now** or **Sessions** view and choose **Open in Agents Window**, or use the same button on its page in the browser. This needs VS Code 1.142 or later.

If the status bar says **not connected**, click it: it offers **Reconnect** and a troubleshooting guide. The Agents window's **Agent Host** output channel says why a connection failed.

The Agents window needs VS Code 1.141 or later, and asks for GitHub sign-in before it shows anything.
