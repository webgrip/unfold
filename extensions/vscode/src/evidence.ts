import * as vscode from 'vscode';
import type { Artifact } from './types.js';

export const evidenceScheme = 'vloer-evidence';

export type ArtifactResolver = (sessionId: string, artifactId: string) => Promise<Artifact | undefined>;

function safeSegment(value: string): string { return value.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 100) || 'document'; }

export function artifactLanguage(artifact: Artifact): string {
  if (artifact.kind === 'diff') return 'diff';
  if (artifact.kind === 'summary') return 'markdown';
  if (artifact.kind === 'test') return 'log';
  return 'plaintext';
}

export function artifactText(artifact: Artifact): string {
  return artifact.content || (artifact.url ? `Evidence link: ${artifact.url}\n` : 'This artifact contains no retained text.');
}

export function patchFileLine(patch: string, file: string): number {
  const lines = patch.split('\n');
  const index = lines.findIndex(line => line.startsWith('diff --git ') && (line.endsWith(` b/${file}`) || line.endsWith(` ${file}`)));
  return index < 0 ? 0 : index;
}

export class EvidenceDocuments implements vscode.TextDocumentContentProvider, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.changed.event;
  private readonly content = new Map<string, string>();
  private readonly resolver: ArtifactResolver;
  constructor(resolver: ArtifactResolver) { this.resolver = resolver; }

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const cached = this.content.get(uri.toString());
    if (cached !== undefined) return cached;
    const match = uri.path.match(/^\/session\/([a-zA-Z0-9_-]+)\/artifact\/([a-zA-Z0-9_-]+)\//);
    if (!match) return 'This evidence document has expired. Reopen it from the remote session.';
    try {
      const artifact = await this.resolver(match[1], match[2]);
      return artifact ? artifactText(artifact) : 'This evidence item is no longer available. Refresh the session.';
    } catch (error) { return `The evidence could not be loaded: ${error instanceof Error ? error.message : 'unknown error'}`; }
  }

  async openArtifact(sessionId: string, artifact: Artifact, options: { line?: number; preview?: boolean } = {}): Promise<vscode.TextEditor> {
    const uri = vscode.Uri.from({ scheme: evidenceScheme, path: `/session/${sessionId}/artifact/${artifact.id}/${safeSegment(artifact.name)}` });
    this.content.delete(uri.toString());
    this.changed.fire(uri);
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.languages.setTextDocumentLanguage(document, artifactLanguage(artifact));
    const line = Math.min(Math.max(0, options.line ?? 0), Math.max(0, document.lineCount - 1));
    const editor = await vscode.window.showTextDocument(document, { preview: options.preview ?? false, selection: new vscode.Range(line, 0, line, 0) });
    if (line) editor.revealRange(new vscode.Range(line, 0, line, 0), vscode.TextEditorRevealType.AtTop);
    return editor;
  }

  async openText(sessionId: string, name: string, content: string, language: string): Promise<void> {
    const uri = vscode.Uri.from({ scheme: evidenceScheme, path: `/session/${safeSegment(sessionId)}/text/${safeSegment(name)}` });
    this.content.set(uri.toString(), content);
    if (this.content.size > 100) this.content.delete(this.content.keys().next().value!);
    this.changed.fire(uri);
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.languages.setTextDocumentLanguage(document, language);
    await vscode.window.showTextDocument(document, { preview: false });
  }

  dispose() { this.changed.dispose(); this.content.clear(); }
}
