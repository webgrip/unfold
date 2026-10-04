/** The largest set symbol SVG Unfold accepts, in bytes. */
export const maxSvgBytes = 32 * 1024;

export class SvgError extends Error {
  status = 400;
  code = 'svg_rejected';
}

type Node = { name: string; attributes: [string, string][]; children: Node[] };

const svgNamespace = 'http://www.w3.org/2000/svg';
const xlinkNamespace = 'http://www.w3.org/1999/xlink';
const number = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const length = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?(?:px|%)?$/;
const numberList = /^[\d\s,.eE+-]*$/;
const identifier = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const namedColor = /^[a-z]{3,20}$/;
const hexColor = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const rgbColor = /^rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(?:,\s*[\d.]+%?\s*)?\)$/;
const localUrl = /^url\(\s*#([A-Za-z][A-Za-z0-9_-]{0,63})\s*\)$/;
const pathData = /^[MmLlHhVvCcSsQqTtAaZz\d\s,.eE+-]*$/;
const transform = /^(?:\s*(?:matrix|translate|scale|rotate|skewX|skewY)\s*\([\d\s,.eE+-]*\)\s*,?)*\s*$/;

const paint = (value: string) => value === 'none' || value === 'currentColor' || hexColor.test(value) || rgbColor.test(value) || namedColor.test(value) || localUrl.test(value);
const oneOf = (...values: string[]) => (value: string) => values.includes(value);
const presentation: Record<string, (value: string) => boolean> = {
  fill: paint, stroke: paint, 'stroke-width': length.test.bind(length), 'stroke-linecap': oneOf('butt', 'round', 'square'), 'stroke-linejoin': oneOf('miter', 'round', 'bevel', 'arcs', 'miter-clip'),
  'stroke-miterlimit': number.test.bind(number), 'stroke-dasharray': value => value === 'none' || numberList.test(value), 'stroke-dashoffset': length.test.bind(length),
  opacity: number.test.bind(number), 'fill-opacity': number.test.bind(number), 'stroke-opacity': number.test.bind(number), 'fill-rule': oneOf('nonzero', 'evenodd'), 'clip-rule': oneOf('nonzero', 'evenodd'),
  transform: value => transform.test(value) && value.length <= 512, 'clip-path': value => localUrl.test(value), id: identifier.test.bind(identifier),
};
const geometry = (...names: string[]) => Object.fromEntries(names.map(name => [name, length.test.bind(length)]));
const units = oneOf('userSpaceOnUse', 'objectBoundingBox');
const spread = oneOf('pad', 'reflect', 'repeat');
const elements: Record<string, Record<string, (value: string) => boolean>> = {
  svg: { ...presentation, xmlns: value => value === svgNamespace, 'xmlns:xlink': value => value === xlinkNamespace, version: oneOf('1.0', '1.1'), viewBox: value => /^\s*[+-]?[\d.eE+-]+(?:[\s,]+[+-]?[\d.eE+-]+){3}\s*$/.test(value), width: length.test.bind(length), height: length.test.bind(length), preserveAspectRatio: value => /^(?:none|x(?:Min|Mid|Max)Y(?:Min|Mid|Max))(?:\s+(?:meet|slice))?$/.test(value) },
  g: presentation,
  defs: { id: identifier.test.bind(identifier) },
  clipPath: { id: identifier.test.bind(identifier), clipPathUnits: units, transform: presentation.transform },
  path: { ...presentation, d: value => pathData.test(value) && value.length <= 20000 },
  circle: { ...presentation, ...geometry('cx', 'cy', 'r') },
  ellipse: { ...presentation, ...geometry('cx', 'cy', 'rx', 'ry') },
  rect: { ...presentation, ...geometry('x', 'y', 'width', 'height', 'rx', 'ry') },
  line: { ...presentation, ...geometry('x1', 'y1', 'x2', 'y2') },
  polyline: { ...presentation, points: value => numberList.test(value) && value.length <= 20000 },
  polygon: { ...presentation, points: value => numberList.test(value) && value.length <= 20000 },
  linearGradient: { id: identifier.test.bind(identifier), ...geometry('x1', 'y1', 'x2', 'y2'), gradientUnits: units, gradientTransform: presentation.transform, spreadMethod: spread },
  radialGradient: { id: identifier.test.bind(identifier), ...geometry('cx', 'cy', 'r', 'fx', 'fy', 'fr'), gradientUnits: units, gradientTransform: presentation.transform, spreadMethod: spread },
  stop: { offset: length.test.bind(length), 'stop-color': value => value === 'currentColor' || hexColor.test(value) || rgbColor.test(value) || namedColor.test(value), 'stop-opacity': number.test.bind(number) },
};
const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function reject(message: string): never { throw new SvgError(message); }

function decode(value: string): string {
  return value.replace(/&(#x[0-9a-fA-F]{1,6}|#\d{1,7}|[A-Za-z]+);?/g, (match, entity: string) => {
    if (!match.endsWith(';')) reject('The SVG has an unterminated character reference.');
    if (entity.startsWith('#')) {
      const code = entity[1] === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      if (!Number.isFinite(code) || code < 0x20 || code > 0x10ffff) reject('The SVG has a character reference outside the printable range.');
      return String.fromCodePoint(code);
    }
    if (!Object.hasOwn(entities, entity)) reject(`The SVG uses the entity &${entity};, which is not allowed.`);
    return entities[entity];
  });
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function parse(source: string): Node {
  let index = 0;
  const stack: Node[] = [];
  let root: Node | undefined;
  let count = 0;
  const skipSpace = () => { while (index < source.length && /\s/.test(source[index])) index++; };
  if (source.startsWith('﻿')) index = 1;
  skipSpace();
  if (source.startsWith('<?xml', index)) {
    const end = source.indexOf('?>', index);
    if (end < 0) reject('The SVG has an unterminated XML declaration.');
    if (!/^<\?xml(?:\s+(?:version|encoding|standalone)\s*=\s*(?:"[^"<>]*"|'[^'<>]*'))*\s*\?>$/.test(source.slice(index, end + 2))) reject('The SVG has an XML declaration Unfold does not accept.');
    index = end + 2;
  }
  while (index < source.length) {
    if (source.startsWith('<!--', index)) {
      const end = source.indexOf('-->', index + 4);
      if (end < 0) reject('The SVG has an unterminated comment.');
      index = end + 3;
      continue;
    }
    if (source.startsWith('<!', index)) reject('The SVG declares a DOCTYPE, an entity or a CDATA section, which are not allowed.');
    if (source.startsWith('<?', index)) reject('The SVG has a processing instruction, which is not allowed.');
    if (source.startsWith('</', index)) {
      const match = /^<\/([A-Za-z][A-Za-z0-9:_-]*)\s*>/.exec(source.slice(index));
      if (!match) reject('The SVG has a malformed closing tag.');
      const open = stack.pop();
      if (!open || open.name !== match[1]) reject(`The SVG closes <${match[1]}> without opening it.`);
      index += match[0].length;
      continue;
    }
    if (source[index] === '<') {
      const name = /^<([A-Za-z][A-Za-z0-9:_-]*)/.exec(source.slice(index));
      if (!name) reject('The SVG has a malformed tag.');
      index += name[0].length;
      if (!Object.hasOwn(elements, name[1])) reject(`The SVG uses <${name[1]}>, which is not allowed. Use shapes, paths, groups and gradients only.`);
      if (++count > 2000) reject('The SVG has more than 2000 elements.');
      const node: Node = { name: name[1], attributes: [], children: [] };
      const allowed = elements[name[1]];
      const seen = new Set<string>();
      for (;;) {
        skipSpace();
        if (source.startsWith('/>', index)) { index += 2; break; }
        if (source[index] === '>') { index++; stack.push(node); break; }
        const attribute = /^([A-Za-z_:][A-Za-z0-9_:.-]*)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/.exec(source.slice(index));
        if (!attribute) reject(`The SVG has a malformed attribute on <${name[1]}>.`);
        index += attribute[0].length;
        const key = attribute[1];
        const value = decode(attribute[2] ?? attribute[3] ?? '').trim();
        if (/^on/i.test(key)) reject(`The SVG has an event handler (${key}), which is not allowed.`);
        if (/href$/i.test(key)) reject(`The SVG links to another resource (${key}), which is not allowed.`);
        if (key === 'style') reject('The SVG has a style attribute, which is not allowed. Use presentation attributes such as fill and stroke.');
        if (!Object.hasOwn(allowed, key)) reject(`The SVG uses the attribute ${key} on <${name[1]}>, which is not allowed.`);
        if (seen.has(key)) reject(`The SVG repeats the attribute ${key}.`);
        seen.add(key);
        if (/javascript:|data:|expression\(|@import/i.test(value) || !allowed[key](value)) reject(`The SVG gives ${key} a value Unfold does not accept.`);
        if (key !== 'xmlns' && key !== 'xmlns:xlink') node.attributes.push([key, value]);
      }
      const parent = stack.at(node === stack.at(-1) ? -2 : -1);
      if (parent && parent !== node) parent.children.push(node);
      else if (!root) root = node;
      else reject('The SVG has more than one root element.');
      if (stack.length > 32) reject('The SVG nests elements more than 32 deep.');
      continue;
    }
    const next = source.indexOf('<', index);
    const text = source.slice(index, next < 0 ? source.length : next);
    if (text.trim()) reject('The SVG has text content, which is not allowed. Convert text to paths.');
    index = next < 0 ? source.length : next;
  }
  if (stack.length) reject(`The SVG leaves <${stack.at(-1)!.name}> open.`);
  if (!root) reject('The file has no SVG element.');
  if (root.name !== 'svg') reject('The SVG must start with an <svg> element.');
  return root;
}

function references(node: Node, ids: Set<string>, used: Set<string>): void {
  for (const [key, value] of node.attributes) {
    if (key === 'id') { if (ids.has(value)) reject(`The SVG repeats the id ${value}.`); ids.add(value); }
    const local = localUrl.exec(value);
    if (local) used.add(local[1]);
  }
  for (const child of node.children) references(child, ids, used);
}

function serialize(node: Node): string {
  const attributes = node.attributes.map(([key, value]) => ` ${key}="${escapeAttribute(value)}"`).join('');
  const namespace = node.name === 'svg' ? ` xmlns="${svgNamespace}"` : '';
  return node.children.length ? `<${node.name}${namespace}${attributes}>${node.children.map(serialize).join('')}</${node.name}>` : `<${node.name}${namespace}${attributes}/>`;
}

/**
 * Checks a set symbol SVG against a strict allow-list and returns a clean copy rebuilt from what it parsed. Only shapes,
 * paths, groups, clip paths and gradients with presentation attributes pass; a script, a style, an event handler, any
 * link (`href`), an external or `javascript:`/`data:` reference, text, an entity, a DOCTYPE or anything else the list
 * does not name is refused with a reason, never silently dropped. Comments are left out of the copy.
 * @param input The uploaded file.
 */
export function sanitizeSvg(input: Buffer | string): string {
  const bytes = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  if (bytes.length > maxSvgBytes) reject(`The SVG is larger than ${maxSvgBytes / 1024} KiB.`);
  const source = bytes.toString('utf8');
  if (!Buffer.from(source, 'utf8').equals(bytes)) reject('The SVG is not valid UTF-8.');
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(source)) reject('The SVG contains control characters.');
  const root = parse(source);
  const ids = new Set<string>();
  const used = new Set<string>();
  references(root, ids, used);
  for (const id of used) if (!ids.has(id)) reject(`The SVG refers to #${id}, which it does not define.`);
  return serialize(root);
}
