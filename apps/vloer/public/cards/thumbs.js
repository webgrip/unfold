import { cardView } from './card-model.js';
import { webglSupport } from './registry.js';
import { faceFacts, factsSignature } from './skins/forge/forge-model.js';

const idleMs = 4000;
const cacheLimit = 80;
const cache = new Map();
let renderer = null;
let queue = Promise.resolve();
let idle = 0;

/** Whether this browser can draw forge thumbnails: it needs WebGL2, hardware or software. */
export function thumbnailsSupported() {
  return webglSupport() !== 'none';
}

async function stage() {
  if (renderer) return renderer;
  const engine = await import('./skins/forge/engine.js');
  const { faceFonts } = await import('./skins/forge/face.js');
  await engine.fontsReady(faceFonts);
  const canvas = document.createElement('canvas');
  renderer = { engine, stage: new engine.ForgeStage(canvas), scene: null };
  return renderer;
}

function release() {
  if (!renderer) return;
  renderer.scene?.dispose();
  renderer.stage.dispose();
  renderer = null;
}

/**
 * Draws one card as a still forge frame into `canvas` at its CSS size. Every thumbnail on a page shares one WebGL
 * renderer and one scene, drawn one after another and copied into each 2D canvas, so a binder of many cards holds one
 * context and one set of face canvases. Frames are cached by what they show. Resolves false when the card could not be drawn.
 * @param {HTMLCanvasElement} canvas
 * @param {object} card A card object, as `<unfold-card>` takes it.
 * @param {{ asOf?: number }} [options]
 */
export function drawThumbnail(canvas, card, { asOf } = {}) {
  const job = queue.then(async () => {
    const box = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(box.width || canvas.clientWidth || 200));
    const height = Math.max(1, Math.round(box.height || canvas.clientHeight || 280));
    const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
    const facts = faceFacts(cardView(card, asOf ? { now: asOf } : {}));
    const key = `${factsSignature(facts)}|${width}x${height}@${ratio}`;
    let frame = cache.get(key);
    if (!frame) {
      clearTimeout(idle);
      const current = await stage();
      if (!current.scene) current.scene = new current.engine.ForgeScene(facts, { motion: 'still' });
      else current.scene.setFacts(facts, { ceremony: false });
      current.scene.settle();
      current.stage.setSize(width, height);
      current.stage.render(current.scene);
      if (current.stage.failed) throw new Error(current.stage.failed);
      frame = document.createElement('canvas');
      frame.width = Math.round(width * ratio);
      frame.height = Math.round(height * ratio);
      frame.getContext('2d').drawImage(current.stage.canvas, 0, 0, frame.width, frame.height);
      cache.set(key, frame);
      if (cache.size > cacheLimit) cache.delete(cache.keys().next().value);
    }
    canvas.width = frame.width;
    canvas.height = frame.height;
    canvas.getContext('2d').drawImage(frame, 0, 0);
    clearTimeout(idle);
    idle = setTimeout(release, idleMs);
    return true;
  });
  queue = job.catch(() => false);
  return queue;
}
