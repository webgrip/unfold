'use strict';

const { trainCommits } = require('./train.cjs');

async function generateNotes(pluginConfig, context) {
  const { train, ...notesConfig } = pluginConfig;
  const commits =
    train === undefined ? context.commits : trainCommits(context.commits, { cwd: context.cwd, path: train.path }).commits;
  const { generateNotes: generate } = await import('@semantic-release/release-notes-generator');
  return generate(notesConfig, { ...context, commits });
}

module.exports = { generateNotes };
