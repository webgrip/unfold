import assert from 'node:assert/strict';

const tagPattern = /<(\/?)([a-z0-9]+)([^>]*)>/g;
const allowed = {
  p: /^$/, br: /^$/, ul: /^$/, ol: /^(?: start="\d+")?$/, li: /^(?: class="md-task")?$/, strong: /^$/, em: /^$/, del: /^$/, code: /^$/, hr: /^$/, blockquote: /^$/,
  h3: /^$/, h4: /^$/, h5: /^$/, h6: /^$/,
  pre: /^ class="md-code"(?: data-lang="[a-z0-9_-]+")?$/,
  span: /^ class="(?:md-check(?: done)?" aria-hidden="true"|sr-only")$/,
  a: /^ href="https?:\/\/[^"\s<>]+" target="_blank" rel="noopener noreferrer"$/,
  div: /^ class="md-table"$/, table: /^$/, thead: /^$/, tbody: /^$/, tr: /^$/,
  th: /^(?: class="md-align-(?:left|center|right)")? scope="col"$/,
  td: /^(?: class="md-align-(?:left|center|right)")?$/,
};

/** Fails unless `html`, the browser Markdown renderer's output, holds only the tags and attributes it is allowed to make. */
export function assertInert(html, label) {
  const tags = [...html.matchAll(tagPattern)];
  for (const [, closing, tag, attributes] of tags) {
    assert(Object.hasOwn(allowed, tag), `${label}: emitted <${closing}${tag}>`);
    if (!closing) assert.match(attributes, allowed[tag], `${label}: <${tag}${attributes}>`);
  }
  assert.equal(html.split('<').length - 1, tags.length, `${label}: a stray angle bracket reached the markup`);
}
