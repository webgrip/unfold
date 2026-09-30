/**
 * Handles a click on an element carrying `data-action="<name>"`. `element` is the closest `[data-action]`
 * ancestor-or-self of the click target and is never disabled. A thrown error re-enables `element` and shows
 * its message in the toast.
 * @callback ActionHandler
 * @param {HTMLElement} element
 * @param {MouseEvent} event
 * @returns {void | Promise<void>}
 */

/**
 * Handles the submission of a form carrying `data-form="<name>"`. The entry has already prevented the default
 * submission, collected `data` with `Object.fromEntries(new FormData(form))` and disabled the form's submit
 * button; it re-enables that button afterwards. A thrown error shows its message in the toast.
 * @callback FormHandler
 * @param {Record<string, FormDataEntryValue>} data
 * @param {HTMLFormElement} form
 * @param {SubmitEvent} event
 * @returns {void | Promise<void>}
 */

/**
 * Handles an `input` or `change` event whose target is inside, or is, an element matching the handler's CSS
 * selector key. `element` is that matching element. The handler runs synchronously and is not awaited.
 * @callback FieldHandler
 * @param {HTMLElement} element
 * @param {Event} event
 * @returns {void}
 */

/**
 * Inspects a `keydown` on the document. Returns true when it handled the key, which stops later bindings.
 * @callback KeyBinding
 * @param {KeyboardEvent} event
 * @returns {boolean}
 */

/**
 * Describes one screen area of the browser workbench. Every property except `id` is optional.
 *
 * Routing: a view with `match` owns the hashes for which `match(hash)` returns a params object (the hash has no
 * leading `#`). With `enter`, the router awaits `enter(params)` and the view does everything itself. Without
 * `enter`, the view is a page: the router runs the shared page entry (`openPage(id)` in core/navigation.js)
 * and then awaits `load()` of every page, in registry order, whose id still equals `state.view`.
 *
 * Rendering: `render()` draws the view when `state.view` equals its `id`. The view `login` draws while signed
 * out and the view `sessions` draws for an unknown `state.view`.
 *
 * Events: `actions`, `forms`, `inputs` and `changes` map a name or selector to a handler. Each action and form
 * name belongs to exactly one view, and so does each input or change selector. `keys` are tried in registry
 * order until one returns true.
 * @typedef {object} ViewDescriptor
 * @property {string} id
 * @property {(hash: string) => (object | null)} [match]
 * @property {(params: object) => Promise<void>} [enter]
 * @property {() => Promise<void>} [load]
 * @property {() => void} [render]
 * @property {Record<string, ActionHandler>} [actions]
 * @property {Record<string, FormHandler>} [forms]
 * @property {Record<string, FieldHandler>} [inputs]
 * @property {Record<string, FieldHandler>} [changes]
 * @property {KeyBinding[]} [keys]
 */

/**
 * The dispatch tables built from the view descriptors.
 * @typedef {object} Registry
 * @property {Map<string, ViewDescriptor>} views
 * @property {ViewDescriptor[]} routes
 * @property {ViewDescriptor[]} pages
 * @property {Map<string, { owner: string, handler: ActionHandler }>} actions
 * @property {Map<string, { owner: string, handler: FormHandler }>} forms
 * @property {Map<string, { owner: string, handler: FieldHandler }>} inputs
 * @property {Map<string, { owner: string, handler: FieldHandler }>} changes
 * @property {KeyBinding[]} keys
 */

const tables = [['actions', 'action'], ['forms', 'form'], ['inputs', 'input selector'], ['changes', 'change selector']];

/**
 * Builds the dispatch tables from `views`, in order. Throws when two views share an id, an action, a form or a
 * field selector, when a handler is not a function, or when a view has `load` without being a page.
 * @param {ViewDescriptor[]} views
 * @returns {Registry}
 */
export function createRegistry(views) {
  const registry = { views: new Map(), routes: [], pages: [], actions: new Map(), forms: new Map(), inputs: new Map(), changes: new Map(), keys: [] };
  for (const view of views) {
    if (!view || typeof view.id !== 'string' || !view.id) throw new Error('Every view descriptor needs a string id.');
    if (registry.views.has(view.id)) throw new Error(`Two views share the id "${view.id}".`);
    registry.views.set(view.id, view);
    if (view.match) registry.routes.push(view);
    if (view.match && !view.enter) registry.pages.push(view);
    if (view.load && (!view.match || view.enter)) throw new Error(`The view "${view.id}" has load but is not a page: pages have match and no enter.`);
    for (const [table, kind] of tables) {
      for (const [name, handler] of Object.entries(view[table] || {})) {
        const existing = registry[table].get(name);
        if (existing) throw new Error(`The ${kind} "${name}" is registered by both "${existing.owner}" and "${view.id}".`);
        if (typeof handler !== 'function') throw new Error(`The ${kind} "${name}" of "${view.id}" is not a function.`);
        registry[table].set(name, { owner: view.id, handler });
      }
    }
    for (const binding of view.keys || []) {
      if (typeof binding !== 'function') throw new Error(`A key binding of "${view.id}" is not a function.`);
      registry.keys.push(binding);
    }
  }
  return registry;
}

/**
 * Finds the first view whose `match` accepts `hash`, with the params it returned, or null.
 * @param {Registry} registry
 * @param {string} hash
 * @returns {{ view: ViewDescriptor, params: object } | null}
 */
export function findRoute(registry, hash) {
  for (const view of registry.routes) {
    const params = view.match(hash);
    if (params) return { view, params };
  }
  return null;
}
