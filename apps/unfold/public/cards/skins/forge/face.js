/** The face canvases' size in pixels: 63:88, the card's own proportions. */
export const faceSize = Object.freeze({ width: 1024, height: Math.round(1024 * 88 / 63) });
/** The slab label canvas's size in pixels. */
export const labelSize = Object.freeze({ width: 1024, height: 300 });
/** The fonts the face is painted with: Unfold's own Archivo and the system monospace. */
export const faceFonts = Object.freeze(['800 46px Archivo', '600 24px Archivo', '500 24px Archivo']);

const W = faceSize.width;
const H = faceSize.height;
const sans = 'Archivo, "Helvetica Neue", Arial, sans-serif';
const mono = 'ui-monospace, "SFMono-Regular", Menlo, Consolas, "DejaVu Sans Mono", monospace';
const inset = 34;
const tones = { neutral: '#cfd8da', live: '#7fd3ff', attention: '#ffcf6b', review: '#b4c2ff', success: '#6fe3a5', danger: '#ff8a7a', severe: '#ff6b8a' };
const height = level => { const v = Math.round(Math.max(0, Math.min(1, level)) * 255); return `rgb(${v},${v},${v})`; };
const relief = Object.freeze({ base: 0.5, frame: 0.76, engraved: 0.64, hatch: 0.72, panel: 0.57, art: 0.3, title: 0.84, text: 0.62, debossed: 0.34, numeral: 0.8 });

/** The classic art window in face pixels: left, top, right, bottom. The shader reads it as uv to place the art. */
export const artWindow = Object.freeze({ x0: 66, y0: 196, x1: W - 66, y1: 752, radius: 14 });
/** The full-art window: the whole face inside the frame, under translucent panels. */
export const fullArtWindow = Object.freeze({ x0: inset, y0: inset, x1: W - inset, y1: H - inset, radius: 30 });

/** The art window a card's facts call for: a full-art frame or a full-art pull fills the face, the classic and slab frames keep the window. */
export function artWindowFor(facts) {
  return facts?.frame === 'fullart' || facts?.variant?.fullArt ? fullArtWindow : artWindow;
}

function canvas(width, heightPx) {
  const element = document.createElement('canvas');
  element.width = width;
  element.height = heightPx;
  return element;
}

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function hex(color) {
  const value = parseInt(color.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function mix(color, target, amount) {
  const a = hex(color);
  const b = hex(target);
  return `#${a.map((channel, index) => Math.round(channel + (b[index] - channel) * amount).toString(16).padStart(2, '0')).join('')}`;
}

function wrap(g, text, maxWidth, lines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const out = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (g.measureText(next).width > maxWidth && current) { out.push(current); current = word; }
    else current = next;
  }
  if (current) out.push(current);
  if (out.length > lines) {
    const kept = out.slice(0, lines);
    let last = kept[lines - 1];
    while (last.length > 1 && g.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1).trimEnd();
    kept[lines - 1] = `${last}…`;
    return kept;
  }
  return out;
}

function fit(g, text, maxWidth) {
  let value = String(text);
  if (g.measureText(value).width <= maxWidth) return value;
  while (value.length > 1 && g.measureText(`${value}…`).width > maxWidth) value = value.slice(0, -1).trimEnd();
  return `${value}…`;
}

const longHex = color => (/^#[0-9a-fA-F]{3}$/.test(color) ? `#${[...color.slice(1)].map(digit => digit + digit).join('')}` : color);

/**
 * The frame metal for a card's coverage and art: graphite while matte, tinted by the art once it earns foil, gold once
 * gilded. A theme's `--forge-frame` replaces the art's tint (a matte card gets a darker, quieter version of it) and its
 * `--forge-accent` the accent lines; gilded stays gold.
 */
export function framePalette(facts) {
  const tokens = facts.theme?.tokens ?? {};
  const themed = tokens['--forge-frame'] ? longHex(tokens['--forge-frame']) : null;
  const accent = tokens['--forge-accent'] ? longHex(tokens['--forge-accent']) : null;
  if (facts.coverage.gilded) return { stops: ['#f2c35b', '#6b4a10', '#ffe08a', '#3d2a08', '#f2c35b'], accent: accent ?? '#ffe08a', line: '#f2c35b' };
  if (facts.coverage.level === 0 && !themed) return { stops: ['#59646a', '#3a4247', '#6d7a80', '#2a3034', '#59646a'], accent: accent ?? '#cfd8da', line: accent ?? '#9aa6a8' };
  const tint = themed ? (facts.coverage.level === 0 ? mix(themed, '#2a3034', 0.45) : themed) : longHex(facts.art.tint);
  return { stops: [mix(tint, '#ffffff', 0.45), mix(tint, '#000000', 0.1), mix(tint, '#ffffff', 0.62), mix(tint, '#000000', 0.45), mix(tint, '#ffffff', 0.45)], accent: accent ?? mix(tint, '#ffffff', 0.62), line: accent ?? mix(tint, '#ffffff', 0.5) };
}

function rarityPaint(g, rarity, x0, y0, x1, y1) {
  if (rarity.symbol === 'spectrum') {
    const paint = g.createLinearGradient(x0, y0, x1, y1);
    ['#ff6a3d', '#ffd24a', '#5ce1a0', '#5cb8ff', '#b48cff', '#ff6ad0'].forEach((stop, index, all) => paint.addColorStop(index / (all.length - 1), stop));
    return paint;
  }
  const paint = g.createLinearGradient(x0, y0, x1, y1);
  paint.addColorStop(0, rarity.symbol[0]);
  paint.addColorStop(1, rarity.symbol[1]);
  return paint;
}

function gemPath(c, cx, cy, r) {
  c.beginPath();
  c.moveTo(cx, cy - r);
  c.lineTo(cx + r, cy - r * 0.28);
  c.lineTo(cx + r * 0.62, cy + r);
  c.lineTo(cx - r * 0.62, cy + r);
  c.lineTo(cx - r, cy - r * 0.28);
  c.closePath();
}

function cover(g, image, x, y, w, h) {
  const iw = image.naturalWidth || image.videoWidth || image.width;
  const ih = image.naturalHeight || image.videoHeight || image.height;
  if (!iw || !ih) return;
  const scale = Math.max(w / iw, h / ih);
  const sw = w / scale;
  const sh = h / scale;
  g.drawImage(image, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
}

function contain(g, image, x, y, w, h) {
  const iw = image.naturalWidth || image.width || w;
  const ih = image.naturalHeight || image.height || h;
  const scale = Math.min(w / iw, h / ih);
  g.drawImage(image, x + (w - iw * scale) / 2, y + (h - ih * scale) / 2, iw * scale, ih * scale);
}

/**
 * Paints the front of a card into three canvases of `faceSize`: `face` (colour; the art window is transparent),
 * `mask` (red marks the art window, green the frame metal, blue the text panels) and `height` (the relief: raised
 * frame and title, engraved border lines, a domed cost coin, a recessed art window, a debossed set symbol and slightly
 * raised panels; mid grey is the card's surface). A card's rarity colours the set symbol in its tier's colour once
 * revealed (dashed in the tier's ink while predicted) and prints the tier's word with its gem on the type line; the
 * frame metal itself is the front shader's.
 * @param {{ face: HTMLCanvasElement, mask: HTMLCanvasElement, height: HTMLCanvasElement }} target
 * @param {ReturnType<import('./forge-model.js').faceFacts>} facts
 */
export function paintFace(target, facts) {
  const g = target.face.getContext('2d');
  const m = target.mask.getContext('2d');
  const h = target.height.getContext('2d');
  const palette = framePalette(facts);
  g.clearRect(0, 0, W, H);
  m.fillStyle = '#000';
  m.fillRect(0, 0, W, H);
  h.fillStyle = height(relief.base);
  h.fillRect(0, 0, W, H);
  const both = (fill, level, path) => { m.fillStyle = fill; path(m); m.fill(); if (level !== null) { h.fillStyle = height(level); path(h); h.fill(); } };

  const metal = g.createLinearGradient(0, 0, W, H);
  palette.stops.forEach((stop, index) => metal.addColorStop(index / (palette.stops.length - 1), stop));
  g.fillStyle = metal;
  rr(g, 0, 0, W, H, 52);
  g.fill();
  both('rgb(0,255,0)', relief.frame, c => rr(c, 0, 0, W, H, 52));

  g.save();
  rr(g, 0, 0, W, H, 52);
  g.clip();
  g.globalAlpha = 0.1;
  g.strokeStyle = '#fff';
  g.lineWidth = 1;
  h.save();
  rr(h, 0, 0, W, H, 52);
  h.clip();
  h.strokeStyle = height(relief.hatch);
  h.lineWidth = 2;
  for (let i = -H; i < W; i += 9) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + H, H); g.stroke();
    h.beginPath(); h.moveTo(i, 0); h.lineTo(i + H, H); h.stroke();
  }
  g.restore();
  h.restore();

  h.strokeStyle = height(relief.engraved);
  h.lineWidth = 4;
  rr(h, 16, 16, W - 32, H - 32, 40);
  h.stroke();
  g.strokeStyle = 'rgba(0,0,0,0.28)';
  g.lineWidth = 3;
  rr(g, 16, 16, W - 32, H - 32, 40);
  g.stroke();

  g.fillStyle = '#0b0f13';
  rr(g, inset, inset, W - inset * 2, H - inset * 2, 30);
  g.fill();
  m.fillStyle = '#000';
  rr(m, inset, inset, W - inset * 2, H - inset * 2, 30);
  m.fill();
  h.fillStyle = height(relief.base);
  rr(h, inset, inset, W - inset * 2, H - inset * 2, 30);
  h.fill();
  if (facts.coverage.gilded) {
    g.strokeStyle = palette.line;
    g.lineWidth = 4;
    rr(g, inset - 7, inset - 7, W - (inset - 7) * 2, H - (inset - 7) * 2, 36);
    g.stroke();
    h.strokeStyle = height(relief.numeral);
    h.lineWidth = 4;
    rr(h, inset - 7, inset - 7, W - (inset - 7) * 2, H - (inset - 7) * 2, 36);
    h.stroke();
  }

  const full = facts.frame === 'fullart' || Boolean(facts.variant?.fullArt);
  const { x0, y0, x1, y1, radius } = artWindowFor(facts);
  g.save();
  g.globalCompositeOperation = 'destination-out';
  rr(g, x0, y0, x1 - x0, y1 - y0, radius);
  g.fill();
  g.restore();
  both('rgb(255,0,0)', relief.art, c => rr(c, x0, y0, x1 - x0, y1 - y0, radius));
  if (!full) {
    g.strokeStyle = palette.accent;
    g.globalAlpha = 0.7;
    g.lineWidth = 4;
    rr(g, x0 - 4, y0 - 4, x1 - x0 + 8, y1 - y0 + 8, radius + 3);
    g.stroke();
    g.globalAlpha = 1;
    h.strokeStyle = height(relief.frame);
    h.lineWidth = 6;
    rr(h, x0 - 4, y0 - 4, x1 - x0 + 8, y1 - y0 + 8, radius + 3);
    h.stroke();
  }

  const panel = (x, y, w, ph, r = 18) => {
    g.fillStyle = full ? 'rgba(10,14,18,0.74)' : 'rgba(14,19,24,0.94)';
    rr(g, x, y, w, ph, r);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.09)';
    g.lineWidth = 2;
    g.stroke();
    both('rgb(0,0,255)', relief.panel, c => rr(c, x, y, w, ph, r));
  };
  const text = (value, x, y, font, color, level, align = 'left') => {
    for (const c of [g, h]) { c.font = font; c.textAlign = align; c.textBaseline = 'alphabetic'; }
    g.fillStyle = color;
    g.fillText(value, x, y);
    if (level !== null) { h.fillStyle = height(level); h.fillText(value, x, y); }
  };

  if (facts.variant?.altArt) {
    const sw = 168;
    const sx0 = artWindow.x1 - sw - 16;
    const sy0 = artWindow.y0 + 16;
    g.fillStyle = 'rgba(10,14,18,0.84)';
    rr(g, sx0, sy0, sw, 42, 21);
    g.fill();
    g.strokeStyle = '#ffe08a';
    g.lineWidth = 3;
    rr(g, sx0, sy0, sw, 42, 21);
    g.stroke();
    both('rgb(0,0,255)', 0.8, c => rr(c, sx0, sy0, sw, 42, 21));
    text('ALT ART', sx0 + sw / 2, sy0 + 29, `800 20px ${mono}`, '#ffe08a', relief.numeral, 'center');
  }

  panel(60, 60, W - 120, 118);
  g.font = `800 ${facts.title.length > 34 ? 36 : 44}px ${sans}`;
  const titleLines = wrap(g, facts.title, W - 340, 2);
  const two = titleLines.length > 1;
  titleLines.forEach((line, index) => text(line, 92, two ? 104 + index * 40 : 124, g.font, '#f3f5f4', relief.title));
  g.font = `600 ${two ? 18 : 21}px ${mono}`;
  text(fit(g, facts.sub.toUpperCase(), W - 340), 92, two ? 164 : 160, g.font, '#9aa6a8', relief.text);

  const cx = W - 128;
  const cy = 119;
  const cr = 54;
  const demoCoin = facts.coin.status === 'demo';
  const coin = g.createRadialGradient(cx - 18, cy - 20, 6, cx, cy, cr);
  if (demoCoin) { coin.addColorStop(0, '#e9f0f4'); coin.addColorStop(0.5, '#9fb0bb'); coin.addColorStop(1, '#4b5a63'); }
  else { coin.addColorStop(0, '#fff3c4'); coin.addColorStop(0.45, '#e3b648'); coin.addColorStop(1, '#7a5410'); }
  g.fillStyle = coin;
  g.beginPath(); g.arc(cx, cy, cr, 0, Math.PI * 2); g.fill();
  g.strokeStyle = demoCoin ? 'rgba(20,30,36,0.55)' : 'rgba(40,25,5,0.6)';
  g.lineWidth = 3;
  g.setLineDash([4, 5]);
  g.beginPath(); g.arc(cx, cy, cr - 9, 0, Math.PI * 2); g.stroke();
  g.setLineDash([]);
  const dome = h.createRadialGradient(cx - 10, cy - 12, 4, cx, cy, cr);
  dome.addColorStop(0, height(0.98));
  dome.addColorStop(0.75, height(0.82));
  dome.addColorStop(1, height(0.62));
  h.fillStyle = dome;
  h.beginPath(); h.arc(cx, cy, cr, 0, Math.PI * 2); h.fill();
  h.strokeStyle = height(0.7);
  h.lineWidth = 3;
  h.beginPath(); h.arc(cx, cy, cr - 9, 0, Math.PI * 2); h.stroke();
  const ink = demoCoin ? '#1a252c' : '#2a1a05';
  g.font = `800 15px ${mono}`;
  text(facts.coin.top, cx, cy - 16, g.font, ink, 0.92, 'center');
  g.font = `800 ${facts.coin.main.length > 5 ? 22 : 28}px ${sans}`;
  text(fit(g, facts.coin.main, cr * 1.7), cx, cy + 14, g.font, ink, 0.94, 'center');
  if (facts.coin.caption) { g.font = `700 11px ${mono}`; text(fit(g, facts.coin.caption.toUpperCase(), cr * 1.5), cx, cy + 32, g.font, ink, 0.9, 'center'); }

  const typeY = 784;
  panel(60, typeY, W - 120, 66, 14);
  const stateColor = tones[facts.state.tone] ?? tones.neutral;
  g.font = `800 25px ${sans}`;
  const stateText = facts.state.label.toUpperCase();
  text(stateText, 90, typeY + 43, g.font, stateColor, relief.text);
  if (facts.condition) {
    const start = 90 + g.measureText(stateText).width + 22;
    g.font = `800 22px ${mono}`;
    text(`· ${facts.condition.label.toUpperCase()}`, start, typeY + 42, g.font, facts.condition.state === 'mended' ? '#ffd27a' : '#ff8a7a', relief.text);
  }
  g.font = `600 21px ${mono}`;
  text(facts.finishLine.toUpperCase(), W - 90, typeY + 42, g.font, palette.accent, relief.text, 'right');
  if (facts.rarity) {
    const rarity = facts.rarity;
    const predicted = rarity.state === 'predicted';
    const end = W - 90 - g.measureText(facts.finishLine.toUpperCase()).width - 28;
    g.font = `800 21px ${mono}`;
    const word = fit(g, rarity.word.toUpperCase(), 250);
    const width = g.measureText(word).width;
    text(word, end, typeY + 42, g.font, rarity.ink, relief.text, 'right');
    const gx = end - width - 20;
    const gy = typeY + 34;
    g.save();
    g.globalAlpha = predicted ? 0.55 : 1;
    gemPath(g, gx, gy, 12);
    g.fillStyle = rarityPaint(g, rarity, gx - 12, gy - 12, gx + 12, gy + 12);
    g.fill();
    g.restore();
    g.strokeStyle = predicted ? rarity.ink : rarity.rim;
    g.lineWidth = 2;
    if (predicted) g.setLineDash([3, 3]);
    gemPath(g, gx, gy, 12);
    g.stroke();
    g.setLineDash([]);
    h.fillStyle = height(relief.numeral);
    gemPath(h, gx, gy, 12);
    h.fill();
  }

  const kpis = facts.kpis ?? [];
  let boxY = typeY + 84;
  if (kpis.length) {
    const gap = 12;
    const cellW = (W - 120 - gap * (kpis.length - 1)) / kpis.length;
    kpis.forEach((entry, index) => {
      const x = 60 + index * (cellW + gap);
      panel(x, boxY, cellW, 72, 12);
      g.font = `700 15px ${mono}`;
      text(fit(g, entry.label.toUpperCase(), cellW - 32), x + 16, boxY + 26, g.font, '#9aa6a8', relief.text);
      g.font = `800 ${kpis.length > 3 ? 27 : 30}px ${sans}`;
      const value = fit(g, entry.value, cellW - 32);
      const valueColor = entry.tone === 'attention' ? '#ffcf6b' : '#f3f5f4';
      text(value, x + 16, boxY + 60, g.font, valueColor, relief.numeral);
      const used = g.measureText(value).width;
      if (entry.detail && entry.tone !== 'neutral') {
        g.font = `700 14px ${mono}`;
        const room = cellW - 32 - used - 10;
        if (room > 40) text(fit(g, entry.detail.toUpperCase(), room), x + 16 + used + 10, boxY + 59, g.font, entry.tone === 'success' ? '#6fe3a5' : '#ffcf6b', null);
      }
    });
    boxY += 84;
  }
  const dense = facts.rows.length > 5 || kpis.length > 0;
  const rowHeight = dense ? 42 : 50;
  panel(60, boxY, W - 120, facts.rows.length * rowHeight + 30, 16);
  facts.rows.forEach(([label, value], index) => {
    const y = boxY + (dense ? 46 : 52) + index * rowHeight;
    g.font = `800 ${dense ? 23 : 25}px ${sans}`;
    text(label, 92, y, g.font, '#f3f5f4', relief.text);
    g.font = `500 ${dense ? 22 : 24}px ${sans}`;
    text(fit(g, value, W - 100 - 262), 262, y, g.font, '#b4bec0', null);
  });

  const lowY = boxY + facts.rows.length * rowHeight + 48;
  panel(60, lowY, 268, 112, 14);
  g.font = `700 17px ${mono}`;
  text('GRADE', 84, lowY + 32, g.font, palette.accent, relief.text);
  if (facts.grade) {
    g.font = `800 62px ${sans}`;
    text(facts.grade.text, 84, lowY + 96, g.font, facts.grade.label === 'black' || facts.grade.label === 'gold' ? '#ffe08a' : '#ffffff', relief.numeral);
    const numberWidth = g.measureText(facts.grade.text).width;
    g.font = `700 15px ${mono}`;
    text(facts.grade.word, 84 + numberWidth + 14, lowY + 72, g.font, '#9aa6a8', null);
    if (facts.grade.qualifiers) text(facts.grade.qualifiers, 84 + numberWidth + 14, lowY + 94, g.font, '#ffb08a', null);
  } else {
    g.font = `600 24px ${sans}`;
    text('Not graded yet', 84, lowY + 84, g.font, '#7f8b8e', null);
  }
  panel(346, lowY, W - 406, 112, 14);
  g.font = `600 16px ${mono}`;
  text('STEWARD', 372, lowY + 30, g.font, '#9aa6a8', relief.text);
  if (facts.steward.detail) text(fit(g, facts.steward.detail.toUpperCase(), 330), W - 84, lowY + 30, g.font, '#6f7b7d', null, 'right');
  if (facts.steward.signed) {
    g.save();
    g.textAlign = 'left';
    h.textAlign = 'left';
    g.font = `italic 600 50px ${sans}`;
    g.transform(1, 0, -0.22, 1, 0, 0);
    const signature = fit(g, facts.steward.name, W - 470);
    if (facts.variant?.goldSignature) {
      const ink = g.createLinearGradient(384, lowY + 50, W - 90, lowY + 100);
      ink.addColorStop(0, '#fff1b8');
      ink.addColorStop(0.45, '#e9b949');
      ink.addColorStop(1, '#a8741c');
      g.fillStyle = ink;
      g.shadowColor = 'rgba(255,200,90,0.55)';
      g.shadowBlur = 10;
    } else g.fillStyle = '#dfe6e5';
    g.fillText(signature, 384 + (lowY + 92) * 0.22, lowY + 92);
    g.restore();
    h.save();
    h.font = `italic 600 50px ${sans}`;
    h.transform(1, 0, -0.22, 1, 0, 0);
    h.fillStyle = height(facts.variant?.goldSignature ? relief.numeral : relief.text);
    h.fillText(signature, 384 + (lowY + 92) * 0.22, lowY + 92);
    h.restore();
  } else {
    g.strokeStyle = facts.variant?.goldSignature ? '#e9b949' : '#4a5558';
    g.lineWidth = 2;
    g.setLineDash([8, 7]);
    g.beginPath(); g.moveTo(372, lowY + 86); g.lineTo(W - 90, lowY + 86); g.stroke();
    g.setLineDash([]);
    g.font = `600 24px ${sans}`;
    text('Unsigned', 372, lowY + 76, g.font, '#7f8b8e', null);
  }

  const footY = lowY + 168;
  g.font = `600 20px ${mono}`;
  text(fit(g, facts.ids.toUpperCase(), W - (facts.set ? 420 : 330)), 72, footY, g.font, '#8a979a', relief.text);
  if (facts.demoLine) { g.font = `800 17px ${mono}`; text(facts.demoLine.toUpperCase(), 72, footY + 30, g.font, '#ffcf6b', relief.text); }
  const sx = W - 108;
  const sy = footY - 22;
  if (facts.images?.symbol) {
    const plate = c => rr(c, sx - 30, sy - 30, 60, 60, 12);
    g.fillStyle = full ? 'rgba(5,8,11,0.78)' : '#05080b';
    plate(g); g.fill();
    g.strokeStyle = facts.rarity?.state === 'revealed' ? facts.rarity.ink : palette.line;
    g.lineWidth = 2;
    plate(g); g.stroke();
    contain(g, facts.images.symbol, sx - 24, sy - 24, 48, 48);
    h.fillStyle = height(relief.debossed);
    plate(h); h.fill();
  } else {
    const symbol = c => { c.beginPath(); c.moveTo(sx - 24, sy - 24); c.lineTo(sx + 24, sy - 24); c.lineTo(sx + 24, sy + 4); c.lineTo(sx + 4, sy + 24); c.lineTo(sx - 24, sy + 24); c.closePath(); };
    const revealedRarity = facts.rarity?.state === 'revealed' ? facts.rarity : null;
    g.fillStyle = revealedRarity ? rarityPaint(g, revealedRarity, sx - 24, sy - 24, sx + 24, sy + 24) : '#05080b';
    symbol(g); g.fill();
    g.strokeStyle = revealedRarity ? revealedRarity.rim : facts.rarity ? facts.rarity.ink : palette.line;
    g.lineWidth = 3;
    if (facts.rarity && !revealedRarity) g.setLineDash([6, 5]);
    symbol(g); g.stroke();
    g.setLineDash([]);
    g.beginPath(); g.moveTo(sx + 24, sy + 4); g.lineTo(sx + 4, sy + 4); g.lineTo(sx + 4, sy + 24); g.stroke();
    h.fillStyle = height(relief.debossed);
    symbol(h); h.fill();
    h.strokeStyle = height(relief.engraved);
    h.lineWidth = 3;
    h.beginPath(); h.moveTo(sx + 24, sy + 4); h.lineTo(sx + 4, sy + 4); h.lineTo(sx + 4, sy + 24); h.stroke();
  }
  if (facts.set) {
    g.font = `800 20px ${mono}`;
    text(fit(g, facts.set.symbol, 190), sx - 38, sy + 8, g.font, facts.set.complete ? '#ffe08a' : palette.accent, relief.engraved, 'right');
  }
  g.textAlign = 'left';
  h.textAlign = 'left';
}

/** Softens the relief so its finite-difference normals read as bevels, not stair steps. */
export function softenHeight(source, radius = 2) {
  const soft = canvas(source.width, source.height);
  const g = soft.getContext('2d');
  if ('filter' in g) { g.filter = `blur(${radius}px)`; g.drawImage(source, 0, 0); g.filter = 'none'; }
  else g.drawImage(source, 0, 0);
  return soft;
}

/**
 * Paints the card's back: the Unfold mark on deep blue, guilloché rings and the Work Item it belongs to. A theme's card
 * back image replaces the mark and rings; its `--forge-back` colour replaces the blue glow.
 */
export function paintBack(target, facts) {
  const g = target.getContext('2d');
  g.clearRect(0, 0, W, H);
  if (facts.images?.back) {
    g.save();
    rr(g, 0, 0, W, H, 52);
    g.clip();
    g.fillStyle = '#04070e';
    g.fillRect(0, 0, W, H);
    cover(g, facts.images.back, 0, 0, W, H);
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 6;
    rr(g, 40, 40, W - 80, H - 80, 36);
    g.stroke();
    g.fillStyle = 'rgba(4,7,14,0.62)';
    rr(g, 120, H - 160, W - 240, 76, 20);
    g.fill();
    g.font = `600 24px ${mono}`;
    g.fillStyle = 'rgba(230,238,255,0.86)';
    g.textAlign = 'center';
    g.fillText(fit(g, facts.ids.toUpperCase(), W - 280), W / 2, H - 112);
    g.textAlign = 'left';
    return;
  }
  const glow = g.createRadialGradient(W / 2, H * 0.45, 40, W / 2, H / 2, H * 0.72);
  const backColor = facts.theme?.tokens?.['--forge-back'] ? longHex(facts.theme.tokens['--forge-back']) : null;
  glow.addColorStop(0, backColor ?? '#2f6fd0');
  glow.addColorStop(0.58, '#0d1a3a');
  glow.addColorStop(1, '#04070e');
  g.fillStyle = glow;
  rr(g, 0, 0, W, H, 52);
  g.fill();
  g.save();
  rr(g, 0, 0, W, H, 52);
  g.clip();
  g.strokeStyle = 'rgba(160,190,255,0.16)';
  g.lineWidth = 2;
  for (let i = 0; i < 44; i++) { g.beginPath(); g.arc(W / 2, H / 2, 36 + i * 21, 0, Math.PI * 2); g.stroke(); }
  g.strokeStyle = 'rgba(160,190,255,0.08)';
  for (let i = 0; i < 24; i++) { g.beginPath(); g.ellipse(W / 2, H / 2, 420, 140, (i / 24) * Math.PI, 0, Math.PI * 2); g.stroke(); }
  g.restore();
  g.strokeStyle = 'rgba(200,220,255,0.55)';
  g.lineWidth = 6;
  rr(g, 40, 40, W - 80, H - 80, 36);
  g.stroke();
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.font = `800 132px ${sans}`;
  g.shadowColor = '#3d84e8';
  g.shadowBlur = 42;
  g.fillText('UNFOLD', W / 2, H / 2 + 36);
  g.shadowBlur = 0;
  g.font = `600 30px ${mono}`;
  g.fillStyle = '#a9c2ff';
  g.fillText('R U N   C A R D', W / 2, H / 2 + 104);
  g.font = `600 24px ${mono}`;
  g.fillStyle = 'rgba(169,194,255,0.7)';
  g.fillText(fit(g, facts.ids.toUpperCase(), W - 200), W / 2, H - 110);
  g.textAlign = 'left';
}

/** Paints the grading slab's label: Unfold Grading, the card, its grade, the subgrades and the formula version. */
export function paintLabel(target, facts) {
  const g = target.getContext('2d');
  const grade = facts.grade;
  const black = grade?.label === 'black';
  const gold = grade?.label === 'gold';
  const LW = labelSize.width;
  g.fillStyle = black ? '#0a0a0a' : gold ? '#efe2b8' : '#e9edef';
  g.fillRect(0, 0, LW, labelSize.height);
  g.fillStyle = black ? '#c9a24a' : '#3d84e8';
  g.fillRect(0, 0, LW, 16);
  g.fillRect(0, labelSize.height - 16, LW, 16);
  const ink = black ? '#e5c26a' : '#15191c';
  const quiet = black ? '#c9a24a' : '#3a4247';
  g.textAlign = 'left';
  g.fillStyle = ink;
  g.font = `800 50px ${sans}`;
  g.fillText('UNFOLD GRADING', 40, 84);
  g.font = `600 27px ${mono}`;
  g.fillStyle = quiet;
  g.fillText(fit(g, facts.title.toUpperCase(), 620), 40, 140);
  g.fillText(fit(g, facts.ids.toUpperCase(), 620), 40, 182);
  if (grade) {
    g.font = `600 22px ${mono}`;
    g.fillText(fit(g, [grade.formula ? `FORMULA ${grade.formula}` : '', grade.qualifiers].filter(Boolean).join(' · '), 620), 40, 236);
    g.textAlign = 'right';
    g.fillStyle = ink;
    g.font = `800 118px ${sans}`;
    g.fillText(grade.text, 990, 150);
    g.font = `800 28px ${sans}`;
    g.fillText(grade.word, 990, 200);
    g.font = `600 22px ${mono}`;
    g.fillStyle = quiet;
    g.fillText(fit(g, grade.subgrades, 420), 990, 244);
  }
  g.textAlign = 'left';
}

/** Creates the canvases one card paints into. */
export function faceCanvases() {
  return { face: canvas(W, H), mask: canvas(W, H), height: canvas(W, H), back: canvas(W, H), label: canvas(labelSize.width, labelSize.height) };
}
