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
  containment: () => import('./containment.stories.js'),
  meaning: () => import('./meaning.stories.js'),
  'run-health': () => import('./run-health.stories.js'),
  'fleet-board': () => import('./fleet-board.stories.js'),
  'work-kit': () => import('./work-kit.stories.js'),
  'work-pages': () => import('./work-pages.stories.js'),
  'time-picker': () => import('../../controls/stories/time-picker.stories.js'),
};

/**
 * Renders one story the way Storybook's HTML renderer would: the meta's `render` with the merged args, wrapped by its
 * decorators. Returns the markup, the merged story description and the story's `play` function, which the workbench
 * runs after the markup is in the page to make it act and to drive and assert an interaction.
 * @param {object} module A story file's module.
 * @param {string} name The story's export name.
 * @param {object} [overrides] Args that replace the story's own.
 * @returns {{ html: string, args: object, title: string, parameters: object, play: Function|null }}
 */
export function renderStory(module, name, overrides = {}) {
  const fileMeta = module.default;
  const story = module[name];
  if (!fileMeta || !story || name === 'default') throw new Error(`No story ${name} in ${fileMeta?.title ?? 'this file'}`);
  const args = { ...fileMeta.args, ...story.args, ...overrides };
  const render = story.render ?? fileMeta.render;
  const decorators = [...(story.decorators ?? []), ...(fileMeta.decorators ?? [])];
  const html = decorators.reduce((inner, decorate) => () => decorate(inner, { args }), () => render(args))();
  return { html, args, title: `${fileMeta.title}/${story.name ?? name}`, parameters: { ...fileMeta.parameters, ...story.parameters }, play: story.play ?? fileMeta.play ?? null };
}

/** The export names of a story file that are stories. */
export const storyNames = module => Object.keys(module).filter(name => name !== 'default' && /^[A-Z]/.test(name));
