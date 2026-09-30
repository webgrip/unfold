import { state, disconnect } from './state.js';
import { api } from './api.js';

const entry = { render: () => {}, boot: async () => {} };

/** Installs the entry's `render` and `boot` so views can call them without importing the entry. */
export function useNavigation({ render, boot }) { entry.render = render; entry.boot = boot; }

/** Renders the view named by `state.view`, or the login page while signed out. */
export function render() { return entry.render(); }

/** Reads the bootstrap again and routes to the current hash. */
export function boot() { return entry.boot(); }

/** The shared entry for a page view: stops live updates, makes `id` current, reloads the session list and renders. */
export async function openPage(id) {
  disconnect(); state.session = null; state.view = id;
  state.sessions = await api('/api/sessions'); render();
}
