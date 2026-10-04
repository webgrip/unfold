const rows = 7;

const source = {
  A: '.###.|#...#|#...#|#####|#...#|#...#|#...#',
  B: '####.|#...#|#...#|####.|#...#|#...#|####.',
  C: '.###.|#...#|#....|#....|#....|#...#|.###.',
  D: '####.|#...#|#...#|#...#|#...#|#...#|####.',
  E: '#####|#....|#....|####.|#....|#....|#####',
  F: '#####|#....|#....|####.|#....|#....|#....',
  G: '.###.|#...#|#....|#.###|#...#|#...#|.####',
  H: '#...#|#...#|#...#|#####|#...#|#...#|#...#',
  I: '###|.#.|.#.|.#.|.#.|.#.|###',
  J: '..###|...#.|...#.|...#.|...#.|#..#.|.##..',
  K: '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#',
  L: '#....|#....|#....|#....|#....|#....|#####',
  M: '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#',
  N: '#...#|#...#|##..#|#.#.#|#..##|#...#|#...#',
  O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.',
  P: '####.|#...#|#...#|####.|#....|#....|#....',
  Q: '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#',
  R: '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
  S: '.####|#....|#....|.###.|....#|....#|####.',
  T: '#####|..#..|..#..|..#..|..#..|..#..|..#..',
  U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.',
  V: '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..',
  W: '#...#|#...#|#...#|#.#.#|#.#.#|#.#.#|.#.#.',
  X: '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
  Y: '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..',
  Z: '#####|....#|...#.|..#..|.#...|#....|#####',
  0: '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.',
  1: '..#..|.##..|..#..|..#..|..#..|..#..|.###.',
  2: '.###.|#...#|....#|...#.|..#..|.#...|#####',
  3: '#####|...#.|..#..|...#.|....#|#...#|.###.',
  4: '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.',
  5: '#####|#....|####.|....#|....#|#...#|.###.',
  6: '..##.|.#...|#....|####.|#...#|#...#|.###.',
  7: '#####|....#|...#.|..#..|.#...|.#...|.#...',
  8: '.###.|#...#|#...#|.###.|#...#|#...#|.###.',
  9: '.###.|#...#|#...#|.####|....#|...#.|.##..',
  ' ': '...|...|...|...|...|...|...',
  '.': '..|..|..|..|..|##|##',
  ',': '..|..|..|..|.#|.#|#.',
  ':': '..|##|##|..|##|##|..',
  ';': '..|##|##|..|.#|.#|#.',
  '/': '....#|....#|...#.|..#..|.#...|#....|#....',
  '-': '....|....|....|####|....|....|....',
  '+': '.....|..#..|..#..|#####|..#..|..#..|.....',
  '#': '.#.#.|.#.#.|#####|.#.#.|#####|.#.#.|.#.#.',
  '!': '#|#|#|#|#|.|#',
  '?': '.###.|#...#|....#|...#.|..#..|.....|..#..',
  '·': '..|..|..|##|##|..|..',
  '×': '.....|.....|#...#|.#.#.|..#..|.#.#.|#...#',
  '%': '##..#|##..#|...#.|..#..|.#...|#..##|#..##',
  "'": '#|#|.|.|.|.|.',
  '(': '.#|#.|#.|#.|#.|#.|.#',
  ')': '#.|.#|.#|.#|.#|.#|#.',
  '_': '.....|.....|.....|.....|.....|.....|#####',
  '=': '....|....|####|....|####|....|....',
  '<': '...#|..#.|.#..|#...|.#..|..#.|...#',
  '>': '#...|.#..|..#.|...#|..#.|.#..|#...',
  '*': '.....|#.#.#|.###.|#####|.###.|#.#.#|.....',
  '&': '.##..|#..#.|#.#..|.#...|#.#.#|#..#.|.##.#',
};

/** The bitmap glyphs, 7 cells tall and up to 5 wide, as rows of `#` (lit) and `.` (dark). */
export const glyphs = Object.freeze(Object.fromEntries(Object.entries(source).map(([char, art]) => [char, Object.freeze(art.split('|'))])));

const aliases = { '−': '-', '–': '-', '—': '-', '‒': '-', '‘': "'", '’': "'", '•': '·' };

function glyphFor(char) {
  const upper = char.toUpperCase();
  if (glyphs[upper]) return glyphs[upper];
  if (aliases[char] && glyphs[aliases[char]]) return glyphs[aliases[char]];
  const plain = upper.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return glyphs[plain] ?? glyphs['?'];
}

/**
 * Draws `text` in the bitmap font as one SVG of `<rect>` cells in `currentColor`. Lowercase draws as uppercase, and a
 * character the font lacks draws as `?`. The SVG is hidden from assistive technology: put the same text in an
 * `sr-only` span or show it elsewhere. Its width and height attributes are in cells, so CSS can size it by height alone.
 * @param {string | number} text
 * @param {string} [className]
 * @returns {string}
 */
export function pixelText(text, className = '') {
  let x = 0;
  let cells = '';
  for (const char of String(text ?? '')) {
    const glyph = glyphFor(char);
    glyph.forEach((row, y) => {
      for (let start = row.indexOf('#'); start !== -1; start = row.indexOf('#', start)) {
        let end = start;
        while (row[end] === '#') end++;
        cells += `<rect x="${x + start}" y="${y}" width="${end - start}" height="1"/>`;
        start = end;
      }
    });
    x += glyph[0].length + 1;
  }
  const width = Math.max(1, x - 1);
  return `<svg class="ac-glyphs${className ? ` ${className}` : ''}" viewBox="0 0 ${width} ${rows}" width="${width}" height="${rows}" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true" focusable="false">${cells}</svg>`;
}

/**
 * Draws a sprite from rows of palette keys as one SVG of `<rect>` cells. A key missing from the palette is transparent;
 * the colour `currentColor` follows the text colour.
 * @param {string[]} art Rows of equal length.
 * @param {Record<string, string>} palette Key to fill colour.
 * @param {string} [className]
 * @returns {string}
 */
export function sprite(art, palette, className = '') {
  const width = art[0].length;
  let cells = '';
  art.forEach((row, y) => {
    let start = 0;
    while (start < width) {
      const key = row[start];
      let end = start + 1;
      while (end < width && row[end] === key) end++;
      if (palette[key]) cells += `<rect x="${start}" y="${y}" width="${end - start}" height="1" fill="${palette[key]}"/>`;
      start = end;
    }
  });
  return `<svg class="ac-sprite${className ? ` ${className}` : ''}" viewBox="0 0 ${width} ${art.length}" width="${width}" height="${art.length}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${cells}</svg>`;
}
