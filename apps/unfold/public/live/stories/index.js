/**
 * Every live story file, by the name the workbench and the story checks use. A story's id is `<file>--<export>`.
 * @type {Record<string, () => Promise<object>>}
 */
export const storyFiles = {
  'flight-path': () => import('./flight-path.stories.js'),
  instruments: () => import('./instruments.stories.js'),
  answers: () => import('./answers.stories.js'),
  'fold-strip': () => import('./fold-strip.stories.js'),
  dial: () => import('./dial.stories.js'),
  trace: () => import('./trace.stories.js'),
  layouts: () => import('./layouts.stories.js'),
};

/**
 * Renders one story the way Storybook's HTML renderer would: the meta's `render` with the merged args, wrapped by its
 * decorators. Returns the markup and the merged story description.
 * @param {object} module A story file's module.
 * @param {string} name The story's export name.
 * @param {object} [overrides] Args that replace the story's own.
 * @returns {{ html: string, args: object, title: string, parameters: object }}
 */
export function renderStory(module, name, overrides = {}) {
  const fileMeta = module.default;
  const story = module[name];
  if (!fileMeta || !story || name === 'default') throw new Error(`No story ${name} in ${fileMeta?.title ?? 'this file'}`);
  const args = { ...fileMeta.args, ...story.args, ...overrides };
  const render = story.render ?? fileMeta.render;
  const decorators = [...(story.decorators ?? []), ...(fileMeta.decorators ?? [])];
  const html = decorators.reduce((inner, decorate) => () => decorate(inner, { args }), () => render(args))();
  return { html, args, title: `${fileMeta.title}/${story.name ?? name}`, parameters: { ...fileMeta.parameters, ...story.parameters } };
}

/** The export names of a story file that are stories. */
export const storyNames = module => Object.keys(module).filter(name => name !== 'default' && /^[A-Z]/.test(name));
