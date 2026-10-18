"""Builds the VS Code extension's product-icon font from the Unfold mark in docs/brand.

Run with `python3 scripts/build-icon-font.py` from apps/unfold after the mark changes; it needs fontTools.
"""

import re
from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.svgLib.path import parse_path

app = Path(__file__).resolve().parent.parent
mark = (app / "../../docs/brand/mark-mono.svg").read_text()
paths = re.findall(r'<path d="([^"]+)"', mark)

units = 1024
scale = units / 64
codepoint = 0xE000

pen = TTGlyphPen(None)
for d in paths:
    parse_path(d, TransformPen(Cu2QuPen(pen, max_err=1, reverse_direction=True), (scale, 0, 0, -scale, 0, units)))
glyph = pen.glyph()

builder = FontBuilder(units, isTTF=True)
builder.setupGlyphOrder([".notdef", "unfold"])
builder.setupCharacterMap({codepoint: "unfold"})
builder.setupGlyf({".notdef": TTGlyphPen(None).glyph(), "unfold": glyph})
builder.setupHorizontalMetrics({".notdef": (units, 0), "unfold": (units, 0)})
builder.setupHorizontalHeader(ascent=units, descent=0)
builder.setupNameTable({"familyName": "Unfold Icons", "styleName": "Regular"})
builder.setupOS2(sTypoAscender=units, sTypoDescender=0, usWinAscent=units, usWinDescent=0)
builder.setupPost()
builder.font.flavor = "woff"
builder.save(app / "extensions/vscode/media/unfold-icons.woff")
print(f"Built extensions/vscode/media/unfold-icons.woff: the Unfold mark at U+{codepoint:04X}.")
