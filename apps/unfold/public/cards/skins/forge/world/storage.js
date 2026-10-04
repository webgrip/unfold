import { api } from '../../../../core/api.js';

const workItem = /^[1-9][0-9]{0,19}$/;
const path = id => `/api/cards/${encodeURIComponent(id)}/world`;

/**
 * Reads the signed-in person's decoration of a card (`GET /api/cards/:id/world`): whether they hold a copy, the
 * decoration they saved (null when none) and whether the card is a demo card. Answers null for a card without a Work
 * Item id (the designer's sample) or when Unfold cannot answer, so the card shows its theme's world.
 * @param {string} id
 * @returns {Promise<{ holds: boolean, world: object | null, demo: boolean, reason?: string } | null>}
 */
export async function loadDecoration(id) {
  if (!workItem.test(String(id ?? ''))) return null;
  try { return await api(path(id)); } catch { return null; }
}

/** Saves the person's decoration of their copy (`PUT`); rejects with the server's reason when it refuses it. */
export function saveDecoration(id, world) {
  return api(path(id), { method: 'PUT', body: JSON.stringify({ world }) });
}

/** Forgets the person's decoration (`DELETE`), so their copy shows the theme's world again. */
export function resetDecoration(id) {
  return api(path(id), { method: 'DELETE' });
}
