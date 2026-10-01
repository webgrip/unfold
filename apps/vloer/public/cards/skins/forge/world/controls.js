import { lockedReason, objectUnlocked, timeUnlocked, timesOfDay, weathers, worldChoices, worldLabel, worldObjects } from './rules.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

/**
 * The inner world's controls as markup, all hidden until the forge gives the card a world: the flatten and decorate
 * buttons for the card's action row, and the decoration panel, the world's description and its announcer.
 */
export function worldActionsMarkup() {
  return `<button type="button" class="forge-turn" data-forge-action="flat" aria-pressed="false" aria-keyshortcuts="F" hidden>Flatten art</button><button type="button" class="forge-turn" data-forge-action="decorate" aria-expanded="false" aria-controls="forge-decor" hidden>Decorate</button>`;
}

/** The decoration panel and the world's screen reader text, hidden until the forge gives the card a world. */
export function worldPanelMarkup() {
  return `<section class="forge-decor" id="forge-decor" data-forge-decor aria-label="Decorate your copy" hidden></section><p class="sr-only" id="forge-world-description" data-world-description></p><p class="sr-only" aria-live="polite" data-world-announce></p>`;
}

function option(value, label, selected, disabled = false) {
  return `<option value="${escape(value)}"${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}>${escape(label)}</option>`;
}

/**
 * The decoration panel's markup for a card with `facts`: the world, time of day and weather a person may pick, a
 * chip per placeable thing (locked ones say what unlocks them), the eraser, the save status and the reset.
 * @param {{ kind: string, tod: string, weather: string }} config
 * @param {{ days: number | null, merged: boolean, condition: string | null }} facts
 * @param {{ tool: string | null, status: string, demo: boolean, count: number }} state
 */
export function panelMarkup(config, facts, { tool, status, demo, count }) {
  const kinds = worldChoices.map(key => option(key, key === 'off' ? 'Off · the card’s art' : worldLabel(key), config.kind === key)).join('');
  const times = [option('auto', 'Auto · follows days live', config.tod === 'auto'), ...timesOfDay.map(step => option(step.key, timeUnlocked(step.key, facts) ? step.label : `${step.label} · at ${step.days} days live`, config.tod === step.key, !timeUnlocked(step.key, facts)))].join('');
  const skies = weathers.map(entry => option(entry.key, entry.label, config.weather === entry.key)).join('');
  const off = config.kind === 'off';
  const chips = worldObjects.map(item => {
    const open = objectUnlocked(item.type, facts);
    const why = lockedReason(item.type, facts);
    return `<button type="button" class="forge-chip" data-decor-tool="${escape(item.type)}" aria-pressed="${tool === item.type}"${open && !off ? '' : ' disabled'}${open ? '' : ` aria-describedby="forge-why-${escape(item.type)}"`}>${escape(item.label)}${open ? '' : `<span class="forge-chip-why" id="forge-why-${escape(item.type)}">${escape(why)}</span>`}</button>`;
  }).join('');
  return `<div class="forge-decor-fields">
      <label class="forge-decor-field"><span>World</span><select data-decor-field="kind">${kinds}</select></label>
      <label class="forge-decor-field"><span>Time of day</span><select data-decor-field="tod"${off ? ' disabled' : ''}>${times}</select></label>
      <label class="forge-decor-field"><span>Weather</span><select data-decor-field="weather"${off ? ' disabled' : ''}>${skies}</select></label>
    </div>
    <div class="forge-decor-tools" role="group" aria-label="Place a thing, then click the ground in the art or press Enter on the art">${chips}<button type="button" class="forge-chip" data-decor-tool="erase" aria-pressed="${tool === 'erase'}"${off ? ' disabled' : ''}>Eraser</button></div>
    <p class="forge-decor-status" role="status" data-decor-status>${escape(status || `${count} placed`)}</p>
    <div class="forge-decor-foot"><button type="button" class="forge-turn" data-decor-action="reset">Use the card’s own world</button></div>
    <p class="forge-decor-note">Only you see how you decorate your copy. It never changes the grade, the finish, pulls or odds.${demo ? ' Demo card · illustrative.' : ''}</p>`;
}

/**
 * Wires the inner world's controls on one drawn front. `handlers` receive the person's choices: `flat()`, `decorate()`,
 * `tool(type)`, `field(name, value)` and `reset()`. `sync(state)` shows, hides and fills them; the runtime redraws the
 * front on every refresh, so the forge binds a new set each time and syncs it from its own state.
 */
export class WorldControls {
  constructor(front, handlers) {
    this.front = front;
    this.handlers = handlers;
    this.flatButton = front.querySelector('[data-forge-action="flat"]');
    this.decorateButton = front.querySelector('[data-forge-action="decorate"]');
    this.panel = front.querySelector('[data-forge-decor]');
    this.description = front.querySelector('[data-world-description]');
    this.announcer = front.querySelector('[data-world-announce]');
    this.onClick = event => this.click(event);
    this.onChange = event => this.change(event);
    front.addEventListener('click', this.onClick);
    front.addEventListener('change', this.onChange);
  }

  click(event) {
    const target = event.target instanceof Element ? event.target.closest('[data-forge-action="flat"], [data-forge-action="decorate"], [data-decor-tool], [data-decor-action]') : null;
    if (!target || target.disabled) return;
    if (target.dataset.forgeAction === 'flat') this.handlers.flat();
    else if (target.dataset.forgeAction === 'decorate') this.handlers.decorate();
    else if (target.dataset.decorTool) this.handlers.tool(target.dataset.decorTool);
    else if (target.dataset.decorAction === 'reset') this.handlers.reset();
  }

  change(event) {
    const field = event.target instanceof Element ? event.target.closest('[data-decor-field]') : null;
    if (field) this.handlers.field(field.dataset.decorField, field.value);
  }

  /**
   * Shows the controls for the world's state: `active` when a world draws, `flat`, whether the person `holds` a copy
   * and so may decorate, whether the panel is `open`, and what fills it.
   */
  sync({ active, flat, holds, open, config, facts, tool, status, demo, description }) {
    if (this.flatButton) {
      this.flatButton.hidden = !active;
      this.flatButton.setAttribute('aria-pressed', String(Boolean(flat)));
      this.flatButton.textContent = flat ? 'Make it 3D' : 'Flatten art';
    }
    if (this.decorateButton) {
      this.decorateButton.hidden = !holds;
      this.decorateButton.setAttribute('aria-expanded', String(Boolean(holds && open)));
    }
    if (this.panel) {
      const show = Boolean(holds && open && config);
      const focused = this.panel.contains(this.front.getRootNode?.()?.activeElement) ? this.front.getRootNode().activeElement : null;
      const key = focused ? (focused.dataset.decorTool ? `[data-decor-tool="${focused.dataset.decorTool}"]` : focused.dataset.decorField ? `[data-decor-field="${focused.dataset.decorField}"]` : focused.dataset.decorAction ? `[data-decor-action="${focused.dataset.decorAction}"]` : null) : null;
      this.panel.hidden = !show;
      if (show) this.panel.innerHTML = panelMarkup(config, facts, { tool, status, demo, count: config.objects.length });
      if (key) this.panel.querySelector(key)?.focus({ preventScroll: true });
    }
    if (this.description) this.description.textContent = description ?? '';
  }

  /** Updates the save status line without redrawing the panel. */
  status(text) {
    const line = this.panel?.querySelector('[data-decor-status]');
    if (line) line.textContent = text;
  }

  /** Says `text` to screen readers. */
  announce(text) {
    if (!this.announcer || !text) return;
    this.announcer.textContent = '';
    this.announcer.textContent = text;
  }

  unbind() {
    this.front.removeEventListener('click', this.onClick);
    this.front.removeEventListener('change', this.onChange);
  }
}
