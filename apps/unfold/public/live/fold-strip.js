import { icon } from '../core/icons.js';
import { cx, escape, span } from './parts.js';

/** The glyph each stage carries in the fold strip. */
export const stageGlyphs = Object.freeze({ ask: 'inbox', wait: 'clock', build: 'code', pr: 'pull-request', review: 'eye', merge: 'branch', production: 'globe' });

/** Who acts at each stage: a person, or Ploeg, an agent or the delivery pipeline. A person's fold points down. */
export const stageActors = Object.freeze({ ask: 'person', wait: 'system', build: 'system', pr: 'system', review: 'person', merge: 'person', production: 'system' });

const statusWords = { done: 'done', current: 'now', next: 'ahead', unknown: 'not tracked' };

function note(model, stage) {
  if (stage.id === 'ask') return model.time.lead !== null ? `${span(model.time.lead)} ago` : '';
  if (stage.id === 'wait') return model.time.waiting !== null ? span(model.time.waiting) : '';
  if (stage.id === 'build' && stage.status === 'current') {
    const attempt = model.attempts.at(-1);
    const parts = [attempt ? `attempt ${attempt.n}` : '', model.running ? span(model.running.seconds) : '', model.lost.runs ? `${model.lost.runs} lost` : ''].filter(Boolean);
    return parts.join(' · ');
  }
  if (stage.id === 'pr' && model.pullRequest?.number) return `#${model.pullRequest.number}`;
  return '';
}

/**
 * The stages as a strip of folds, each with its glyph (a check once done): done folds are paper, the current fold lies open and wide, the folds ahead stay
 * dark, and your review is the red fold. `mini` is the same strip at row height for a Work list: glyphs, and the
 * current stage's name, with every word kept for screen readers. In a narrow container only the current fold keeps its words; the others show their
 * glyph and keep their words for screen readers.
 * @param {object} model A `liveModel` result.
 * @param {{ size?: 'full'|'mini' }} [options]
 * @returns {string}
 */
export function foldStrip(model, { size = 'full' } = {}) {
  const current = model.stages.find(stage => stage.status === 'current');
  const label = `Stage ${current ? model.stages.indexOf(current) + 1 : model.stages.length} of ${model.stages.length}: ${current?.label ?? 'done'}`;
  const folds = model.stages.map(stage => {
    const words = `${stage.label}, ${statusWords[stage.status]}, ${stageActors[stage.id] === 'person' ? 'a person acts here' : 'Ploeg or an agent acts here'}`;
    const detail = size === 'full' ? note(model, stage) : '';
    const glyph = stage.status === 'done' && stage.id !== 'review' ? 'check' : stageGlyphs[stage.id];
    const body = size === 'full' ? `<span class="lv-fold-icon" aria-hidden="true">${icon(glyph)}</span><span class="lv-fold-text"><span class="lv-fold-name">${escape(stage.label)}</span>${detail ? `<span class="lv-fold-note">${escape(detail)}</span>` : ''}</span>` : `<span class="lv-fold-icon" aria-hidden="true">${icon(glyph)}</span>${stage.status === 'current' ? `<span class="lv-fold-name" aria-hidden="true">${escape(stage.label)}</span>` : ''}<span class="sr-only">${escape(words)}</span>`;
    return `<li class="${cx('lv-fold', `is-${stage.status}`, stageActors[stage.id] === 'person' ? 'is-down' : 'is-up', stage.you ? 'is-you' : '', stage.tone ? `lv-tone-${stage.tone}` : '')}"${stage.status === 'current' ? ' aria-current="step"' : ''}${size === 'full' ? ` title="${escape(words)}"` : ''}>${body}</li>`;
  }).join('');
  return `<ol class="${cx('lv-folds', `lv-folds-${size}`)}" aria-label="${escape(label)}">${folds}</ol>`;
}
