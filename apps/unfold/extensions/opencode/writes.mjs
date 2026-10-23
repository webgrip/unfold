import { patchWrites } from '../shared/linked-report.mjs';

const editTexts = {
  write: args => String(args?.content ?? ''),
  edit: args => String(args?.newString ?? ''),
  multiedit: args => (Array.isArray(args?.edits) ? args.edits : []).map(edit => String(edit?.newString ?? '')).join('\n'),
};

/**
 * The text each file edit wrote, from an OpenCode 1.x tool call's arguments: `write`, `edit`, `multiedit`, and the
 * `patch`/`apply_patch` tools' patch text.
 */
export function openCodeWrites(tool, args) {
  if (editTexts[tool]) return args?.filePath ? [{ path: String(args.filePath), text: editTexts[tool](args) }] : [];
  if (tool === 'patch' || tool === 'apply_patch') return patchWrites(args?.patchText ?? args?.patch ?? '');
  return [];
}
