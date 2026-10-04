import { strict as assert } from 'node:assert';
import { describe, test, type TestContext } from 'node:test';

import { initShiftExplorers } from './shift-explorer.ts';

type Scheduled = { at: number; callback: () => void };
type ObserverEntry = { isIntersecting: boolean; target: FakeElement };

type FakeElement = EventTarget & {
  dataset: Record<string, string>;
  hidden: boolean;
  id: string;
  textContent: string;
  href: string;
  hash: string;
  parentElement: FakeElement | null;
  children: FakeElement[];
  append(...children: FakeElement[]): void;
  querySelector(selector: string): FakeElement | null;
  querySelectorAll(selector: string): FakeElement[];
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  removeAttribute(name: string): void;
  contains(element: unknown): boolean;
  closest(selector: string): FakeElement | null;
  focus(): void;
  click(): void;
  emit(type: string, properties?: Record<string, unknown>): Event;
};

function mount(t: TestContext, options: { reduced?: boolean; hash?: string } = {}) {
  let now = 0;
  let nextTimer = 0;
  const scheduled = new Map<number, Scheduled>();
  const location = new URL(`https://unfold.example/${options.hash ?? ''}`);
  const document = Object.assign(new EventTarget(), {
    hidden: false,
    activeElement: null as FakeElement | null,
    querySelectorAll: (_selector: string) => [root],
    querySelector: (selector: string) => root.querySelector(selector),
  });
  const reduced = Object.assign(new EventTarget(), {
    matches: options.reduced ?? false,
  });
  const history = {
    replaceState(_state: unknown, _unused: string, url?: string | URL | null) {
      if (url != null) location.href = new URL(String(url), location).href;
    },
  };
  const window = Object.assign(new EventTarget(), {
    matchMedia: () => reduced,
    location,
    history,
  });

  class Element extends EventTarget implements FakeElement {
    dataset: Record<string, string> = {};
    hidden = false;
    id = '';
    textContent = '';
    parentElement: FakeElement | null = null;
    children: FakeElement[] = [];
    private attributes = new Map<string, string>();
    private tagName: string;

    constructor(tagName = 'div') {
      super();
      this.tagName = tagName;
    }

    get href() {
      return new URL(this.getAttribute('href') ?? '', location).href;
    }

    set href(value: string) {
      this.setAttribute('href', value);
    }

    get hash() {
      return new URL(this.href).hash;
    }

    append(...children: FakeElement[]) {
      children.forEach((child) => {
        child.parentElement = this;
        this.children.push(child);
      });
    }

    private matches(selector: string): boolean {
      const data = /^\[data-([a-z-]+)\]$/.exec(selector)?.[1];
      if (data) {
        const key = data.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
        return key in this.dataset;
      }
      return selector.startsWith('#') ? this.id === selector.slice(1) : this.tagName === selector;
    }

    querySelectorAll(selector: string): FakeElement[] {
      return this.children.flatMap((child) => [
        ...((child as Element).matches(selector) ? [child] : []),
        ...child.querySelectorAll(selector),
      ]);
    }

    querySelector(selector: string) {
      return this.querySelectorAll(selector)[0] ?? null;
    }

    setAttribute(name: string, value: string) {
      this.attributes.set(name, value);
    }

    getAttribute(name: string) {
      return this.attributes.get(name) ?? null;
    }

    removeAttribute(name: string) {
      this.attributes.delete(name);
    }

    contains(element: unknown): boolean {
      return element === this || this.children.some((child) => child.contains(element));
    }

    closest(selector: string): FakeElement | null {
      return this.matches(selector) ? this : (this.parentElement?.closest(selector) ?? null);
    }

    emit(type: string, properties: Record<string, unknown> = {}) {
      const event = Object.assign(new Event(type, { bubbles: true, cancelable: true }), properties);
      Object.defineProperty(event, 'target', { value: this });
      this.dispatchEvent(event);
      let parent = this.parentElement;
      while (parent) {
        parent.dispatchEvent(event);
        parent = parent.parentElement;
      }
      return event;
    }

    click() {
      this.emit('click');
    }

    focus() {
      document.activeElement = this;
      this.emit('focusin');
    }
  }

  const observers: Array<{
    callback: (entries: ObserverEntry[]) => void;
    target?: FakeElement;
  }> = [];
  class Observer {
    private entry: (typeof observers)[number];
    constructor(callback: (entries: ObserverEntry[]) => void) {
      this.entry = { callback };
      observers.push(this.entry);
    }
    observe(target: FakeElement) {
      this.entry.target = target;
    }
    unobserve() {}
    disconnect() {}
  }

  Object.assign(window, { IntersectionObserver: Observer });

  const root = new Element();
  root.dataset = {
    explorer: '',
    play: 'Play',
    pause: 'Pause',
    replay: 'Replay',
    complete: 'Ready for human review',
  };
  const play = new Element('button');
  play.dataset['shiftPlay'] = '';
  play.hidden = true;
  const announcement = new Element('p');
  announcement.dataset['shiftAnnouncement'] = '';
  const links = ['Work item', 'Implement', 'Review', 'Human decision'].map((title, index) => {
    const link = new Element('a');
    link.dataset = { stageControl: '', stage: String(index) };
    link.href = `#shift-stage-${index}`;
    link.textContent = title;
    return link;
  });
  const panels = [0, 2000, 5000, 8000].map((at, index) => {
    const panel = new Element('section');
    panel.id = `shift-stage-${index}`;
    panel.dataset = { stagePanel: '', at: String(at) };
    const heading = new Element('h3');
    heading.textContent = links[index]?.textContent ?? '';
    panel.append(heading);
    return panel;
  });
  const code = new Element('pre');
  panels[1]?.append(code);
  root.append(play, ...links, ...panels, announcement);

  const replacements: Record<string, unknown> = {
    window,
    document,
    location,
    history,
    HTMLElement: Element,
    IntersectionObserver: Observer,
    performance: { now: () => now },
    setTimeout: (callback: () => void, delay = 0) => {
      const id = ++nextTimer;
      scheduled.set(id, { at: now + delay, callback });
      return id;
    },
    clearTimeout: (id: number) => scheduled.delete(id),
  };
  const originals = Object.fromEntries(
    Object.keys(replacements).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  for (const [key, value] of Object.entries(replacements)) {
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    });
  }
  t.after(() => {
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });

  const advance = (milliseconds: number) => {
    const until = now + milliseconds;
    for (let count = 0; count < 100; count++) {
      const next = [...scheduled.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > until) {
        now = until;
        return;
      }
      scheduled.delete(next[0]);
      now = next[1].at;
      next[1].callback();
    }
    assert.fail('Playback did not settle within 100 timer callbacks');
  };
  const selected = () => {
    const visible = panels.flatMap((panel, index) => (panel.hidden ? [] : [index]));
    assert.equal(visible.length, 1, 'Exactly one stage must be visible after enhancement');
    assert.deepEqual(
      links.flatMap((link, index) => (link.getAttribute('aria-current') === 'step' ? [index] : [])),
      visible,
      'The current-step cue must match the visible content',
    );
    return visible[0];
  };
  initShiftExplorers();
  return {
    play,
    links,
    panels,
    code,
    announcement,
    location,
    document,
    advance,
    selected,
    motion(value: boolean) {
      reduced.matches = value;
      reduced.dispatchEvent(new Event('change'));
    },
    navigate(hash: string) {
      location.hash = hash;
      window.dispatchEvent(new Event('hashchange'));
    },
    leaveViewport() {
      for (const { callback, target } of observers) {
        if (target) callback([{ isIntersecting: false, target }]);
      }
    },
  };
}

describe('the recorded Shift explorer', { concurrency: false }, () => {
  test('waits for the visitor, then directly selects and announces a stage', (t) => {
    const view = mount(t);
    view.advance(30_000);
    assert.equal(view.selected(), 0);
    assert.equal(view.announcement.textContent, '');
    view.links[2]?.click();
    assert.equal(view.selected(), 2);
    assert.equal(view.announcement.textContent, 'Review');
    assert.equal(view.location.hash, '#shift-stage-2');
    view.advance(30_000);
    assert.equal(view.selected(), 2);
  });

  test('pauses for as long as needed and resumes the remaining stage time', (t) => {
    const view = mount(t);
    view.play.click();
    assert.equal(view.play.textContent, 'Pause');
    view.advance(700);
    view.play.click();
    assert.equal(view.play.textContent, 'Play');
    view.advance(30_000);
    assert.equal(view.selected(), 0);
    view.play.click();
    view.advance(1299);
    assert.equal(view.selected(), 0);
    view.advance(1);
    assert.equal(view.selected(), 1);
    view.advance(6000);
    assert.equal(view.selected(), 3);
    assert.equal(view.play.textContent, 'Replay');
    assert.equal(view.announcement.textContent, 'Ready for human review');
  });

  test('direct selection interrupts playback instead of advancing behind the visitor', (t) => {
    const view = mount(t);
    view.play.click();
    view.advance(500);
    view.links[1]?.click();
    view.advance(30_000);
    assert.equal(view.selected(), 1);
    assert.equal(view.play.textContent, 'Play');
  });

  test('keyboard selection moves focus, updates the stage, and stops playback', (t) => {
    const view = mount(t);
    view.play.click();
    view.links[0]?.emit('keydown', { key: 'ArrowRight' });
    assert.equal(view.selected(), 1);
    assert.equal(view.document.activeElement, view.links[1]);
    view.advance(30_000);
    assert.equal(view.selected(), 1);
    view.links[1]?.emit('keydown', { key: 'End' });
    assert.equal(view.selected(), 3);
    assert.equal(view.document.activeElement, view.links[3]);
    view.links[3]?.emit('keydown', { key: 'Home' });
    assert.equal(view.selected(), 0);
  });

  test('reduced motion keeps direct exploration available without timed playback', (t) => {
    const view = mount(t, { reduced: true });
    assert.equal(view.play.hidden, true);
    view.links[1]?.click();
    view.advance(30_000);
    assert.equal(view.selected(), 1);
    assert.equal(view.announcement.textContent, 'Implement');
    view.motion(false);
    assert.equal(view.play.hidden, false);
    view.advance(30_000);
    assert.equal(view.selected(), 1, 'Disabling reduced motion must not start playback');
    view.play.click();
    view.advance(3000);
    assert.equal(view.selected(), 2);
  });

  test('enabling reduced motion stops active playback and preserves the chosen stage', (t) => {
    const view = mount(t);
    view.play.click();
    view.advance(2500);
    assert.equal(view.selected(), 1);
    view.motion(true);
    assert.equal(view.play.hidden, true);
    view.advance(30_000);
    assert.equal(view.selected(), 1);
    view.motion(false);
    assert.equal(view.play.hidden, false);
    view.advance(30_000);
    assert.equal(view.selected(), 1);
  });

  test('focusing the code pauses playback so the focused content stays visible', (t) => {
    const view = mount(t);
    view.play.click();
    view.advance(2500);
    view.code.focus();
    view.advance(30_000);
    assert.equal(view.selected(), 1);
    assert.equal(view.document.activeElement, view.code);
    assert.equal(view.panels[1]?.hidden, false);
    assert.equal(view.play.textContent, 'Play');
  });

  test('loads a stage deep link and follows later fragment navigation', (t) => {
    const view = mount(t, { hash: '#shift-stage-2' });
    assert.equal(view.selected(), 2);
    view.play.click();
    view.navigate('#shift-stage-1');
    assert.equal(view.selected(), 1);
    view.advance(30_000);
    assert.equal(view.selected(), 1);
    view.navigate('#unrelated-section');
    assert.equal(view.selected(), 1, 'Unrelated navigation must not reset the explorer');
  });

  test('ignores an invalid initial stage fragment', (t) => {
    const view = mount(t, { hash: '#shift-stage-99' });
    assert.equal(view.selected(), 0);
  });

  test('stops when the browser tab becomes hidden', (t) => {
    const view = mount(t);
    view.play.click();
    view.advance(500);
    view.document.hidden = true;
    view.document.dispatchEvent(new Event('visibilitychange'));
    view.advance(30_000);
    assert.equal(view.selected(), 0);
    view.document.hidden = false;
    view.document.dispatchEvent(new Event('visibilitychange'));
    view.advance(30_000);
    assert.equal(view.selected(), 0, 'Returning to the tab must not resume without consent');
  });

  test('stops when the explorer leaves the viewport', (t) => {
    const view = mount(t);
    view.play.click();
    view.advance(500);
    view.leaveViewport();
    view.advance(30_000);
    assert.equal(view.selected(), 0);
    assert.equal(view.play.textContent, 'Play');
  });
});
