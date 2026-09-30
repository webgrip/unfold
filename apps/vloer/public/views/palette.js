import { $, escape } from '../core/dom.js';
import { keyLabel } from '../core/keys.js';

function openPalette() {
  const dialog = $('#palette');
  if (!dialog || dialog.open) return;
  dialog.innerHTML = `<form method="dialog" class="palette-stub"><header class="dialog-header"><h2 id="palette-title">Search and commands</h2><button class="palette-close" value="close" aria-label="Close search">Close</button></header><div class="dialog-body"><p><strong>Coming soon.</strong> Jump to any page, Work Item or command from here with ${escape(keyLabel('Mod'))} K or /.</p><p class="form-help">Until then, use the navigation or the g shortcuts: press ? to see them.</p></div></form>`;
  dialog.showModal();
}

/** The command palette placeholder: `palette-open` opens `#palette` with a "Coming soon" note. The palette itself is proposed. */
export default {
  id: 'palette',
  actions: { 'palette-open': openPalette },
};
