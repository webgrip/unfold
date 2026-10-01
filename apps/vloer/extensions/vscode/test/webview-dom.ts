import { readFileSync } from 'node:fs';
import { createContext, runInContext, runInThisContext } from 'node:vm';

class StubNode {
  childNodes: StubNode[] = [];
  parentNode?: StubNode;
  get textContent(): string { return this.childNodes.map(node => node.textContent).join(''); }
  set textContent(value: string) { this.childNodes = value ? [new StubText(value)] : []; }
  append(...items: (StubNode | string)[]) {
    for (const item of items) {
      const node = typeof item === 'string' ? new StubText(item) : item;
      if (node instanceof StubFragment) { this.append(...node.childNodes.splice(0)); continue; }
      node.parentNode?.remove(node);
      node.parentNode = this;
      this.childNodes.push(node);
    }
  }
  remove(node: StubNode) { this.childNodes = this.childNodes.filter(child => child !== node); }
  replaceChildren(...items: (StubNode | string)[]) { this.childNodes = []; this.append(...items); }
  descendants(): StubElement[] { return this.childNodes.flatMap(node => node instanceof StubElement ? [node, ...node.descendants()] : node.descendants()); }
  querySelector(): null { return null; }
  querySelectorAll(): StubElement[] { return []; }
}

class StubText extends StubNode {
  data: string;
  constructor(data: string) { super(); this.data = data; }
  override get textContent(): string { return this.data; }
  override set textContent(value: string) { this.data = value; }
}

class StubFragment extends StubNode {}

export class StubElement extends StubNode {
  tagName: string;
  namespace?: string;
  attributes = new Map<string, string>();
  className = '';
  id = '';
  open = false;
  disabled = false;
  checked = false;
  value = '';
  dataset: Record<string, string> = {};
  constructor(tagName: string, namespace?: string) { super(); this.tagName = tagName.toLowerCase(); this.namespace = namespace; }
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
    if (name === 'id') this.id = value;
    if (name === 'class') this.className = value;
    if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())] = value;
  }
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }
  find(tagName: string): StubElement[] { return this.descendants().filter(node => node.tagName === tagName); }
  withClass(name: string): StubElement[] { return this.descendants().filter(node => node.className.split(/\s+/).includes(name)); }
  focus() {}
  scrollIntoView() {}
}

export type Webview = Record<string, any> & { posted: unknown[]; document: any };

function environment(dataset: Record<string, string>) {
  const posted: unknown[] = [];
  const body = new StubElement('body');
  Object.assign(body.dataset, dataset);
  const document = {
    body,
    activeElement: null,
    createElement: (tag: string) => new StubElement(tag),
    createElementNS: (namespace: string, tag: string) => new StubElement(tag, namespace),
    createTextNode: (text: string) => new StubText(text),
    createDocumentFragment: () => new StubFragment(),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => undefined,
  };
  const globals: Record<string, any> = {
    document,
    window: { addEventListener: () => undefined, scrollY: 0, scrollTo: () => undefined },
    HTMLDetailsElement: class {},
    acquireVsCodeApi: () => ({ getState: () => ({}), setState: () => undefined, postMessage: (message: unknown) => { posted.push(message); } }),
  };
  return { posted, document, globals };
}

export function loadWebview(script = 'session.js', dataset: Record<string, string> = { sessionId: 'session-under-test' }): Webview {
  const { posted, globals } = environment(dataset);
  const context: Record<string, any> = { ...globals, URL, console };
  createContext(context);
  for (const file of ['common.js', script]) runInContext(readFileSync(new URL(`../media/${file}`, import.meta.url), 'utf8'), context, { filename: file });
  context.posted = posted;
  return context as Webview;
}

let moduleLoads = 0;

/**
 * Loads a webview that is an ES module (it imports `media/core/*`) into this process: the DOM stub and
 * `common.js` become globals, and the result reads the module exports, then those globals, plus the messages it posted.
 */
export async function loadModuleWebview(script: string, dataset: Record<string, string>): Promise<Webview> {
  const { posted, document, globals } = environment(dataset);
  Object.assign(globalThis, globals);
  runInThisContext(readFileSync(new URL('../media/common.js', import.meta.url), 'utf8'), { filename: 'common.js' });
  const exports = await import(`${new URL(`../media/${script}`, import.meta.url).href}?load=${++moduleLoads}`);
  return Object.assign(Object.create(globalThis), exports, { posted, document }) as Webview;
}
