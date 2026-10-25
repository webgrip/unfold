'use strict';

const { execFileSync } = require('node:child_process');

const YQ_OUTPUT_LIMIT_BYTES = 256 * 1024 * 1024;

function yqAsJson(expression, file) {
  return JSON.parse(execFileSync('yq', ['--output-format=json', '--indent=0', expression, file], { encoding: 'utf8', maxBuffer: YQ_OUTPUT_LIMIT_BYTES }));
}

const readYaml = (file) => yqAsJson('.', file);

const readFirstYamlDocument = (file) => yqAsJson('select(document_index == 0)', file);

module.exports = { readYaml, readFirstYamlDocument };
