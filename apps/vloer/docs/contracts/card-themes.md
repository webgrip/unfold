# Card themes

A card theme gives a project's or client's Run cards their own look on top of a shipped skin pack: colours, the forge's frame, a default foil pattern, art, a set symbol and a card back. It is layer 4 of the card runtime ([ADR 0026](../adrs/0026-run-cards-render-in-a-card-runtime-with-skin-packs-and-themes.md)). [ADR 0031](../adrs/0031-card-themes-a-card-designer-and-generated-art.md) records the decision; the whole feature is proposed. This page is the contract as implemented.

## Format v1

A theme is a JSON object. [`card-theme.v1.schema.json`](card-theme.v1.schema.json) states its shape; [`src/card-themes.ts`](../../src/card-themes.ts) `validateTheme` is the authority and refuses anything the format or the skin does not allow, with a reason. Nothing is dropped silently.

```json
{
  "schemaVersion": 1,
  "id": "acme",
  "name": "Acme 2026",
  "extends": "forge",
  "tokens": { "--forge-frame": "#c0392b", "--gc-accent": "#5b8cff", "--gc-radius": "16px" },
  "frame": "fullart",
  "foilPattern": "gold",
  "art": { "shader": "3f0c…64 hex characters" },
  "setSymbol": "9a1b…",
  "cardBack": null,
  "soundBank": null
}
```

| Field | Rule |
| --- | --- |
| `schemaVersion` | `1` |
| `id` | Lowercase letters, digits and dashes, up to 64 characters. It is what a Work Target names as `cardStyle.theme` in Ploeg's configuration |
| `name` | 1 to 80 characters, no control characters |
| `extends` | A skin pack Vloer ships: `forge` or `vloer-native`. Custom code skins are not supported |
| `tokens` | Only custom properties the skin's manifest lists in `themeTokens`. Colours are `#rgb` or `#rrggbb`; `--gc-radius` is a whole number of pixels from `0px` to `32px`. No other CSS value is accepted |
| `frame` | One of the skin's `theme.frames`. The forge has `classic`, `fullart` (the art fills the face under translucent panels) and `slab` (the card sits in a grading slab, "Not graded yet" without a grade). `null` is classic |
| `foilPattern` | One of the skin's `theme.foilPatterns`, or `null` for a pattern picked per card. A pack pull still overrides it, and the earned finish still decides how much of the card the foil covers |
| `art` | Exactly one of `{ "preset": id }` (one of `theme.artPresets`), `{ "shader": asset }` or `{ "media": asset }` (an image or a video), or `null` for art picked per card |
| `setSymbol` | A set symbol asset (a sanitized SVG), or `null` |
| `cardBack` | A card back asset (PNG, JPEG or WebP), or `null` |
| `soundBank` | One of the skin's `theme.soundBanks`. No shipped skin lists a bank, so it must be `null` until the effects director exists (proposed) |

A field the skin does not draw must be left out or `null`: Vloer Native takes tokens only. Each skin declares what a theme may choose in its `manifest.json`: `themeTokens` and a `theme` section with `frames`, `foilPatterns`, `artPresets`, `art` (the art kinds), `soundBanks`, `setSymbol` and `cardBack`. The runtime knows six tokens: `--gc-accent`, `--gc-surface`, `--gc-radius`, `--forge-frame` (the frame metal), `--forge-accent` (accent lines and finish text) and `--forge-back` (the back's glow).

## Assets

Uploaded files are theme assets. Vloer decides each file's type from its bytes, never from its name or the upload header, and stores it in its SQLite store under the SHA-256 of what it stores, so a second upload of the same file is the same asset.

| Purpose | Accepted | Limit |
| --- | --- | --- |
| `art` | PNG, JPEG, WebP; MP4 (ISO brands), WebM | Images 2 MiB and 4096 px a side; video 8 MiB. The designer also refuses a clip longer than 15 seconds; the server checks bytes only |
| `back` | PNG, JPEG, WebP | 2 MiB, 4096 px a side |
| `symbol` | SVG | 32 KiB |
| `shader` | GLSL ES 3.0 text | 16 KiB |

* **SVG.** [`svg-sanitize.ts`](../../src/svg-sanitize.ts) parses the file against an allow-list and stores a copy rebuilt from what it parsed. Only `svg`, `g`, `defs`, `clipPath`, `path`, `circle`, `ellipse`, `rect`, `line`, `polyline`, `polygon`, `linearGradient`, `radialGradient` and `stop` pass, with presentation attributes whose values are checked (colours, numbers, path data, transforms, `url(#local-id)` references to ids the file defines). A script, a style element or attribute, an event handler, any `href`, an external, `javascript:` or `data:` reference, text, an entity, a DOCTYPE, CDATA or a processing instruction is refused with the reason. Comments are left out of the copy.
* **Shader.** The source must define `vec3 art_custom(vec2 uv, float t)` in printable ASCII and bring no `#` directive, `uniform`, sampler, texture read, `main`, `precision`, global `in` or `out`, or `discard`. Vloer cannot compile GLSL, so these rules are what the server enforces; the browser compiles every shader before it uploads it (see [Generated art](#generated-art)).
* **Quota.** All stored assets together stay within `cardThemes.assetQuotaMb` (256 MiB by default); an upload beyond it answers 507 `asset_quota`.
* **Serving.** `GET /api/card-assets/:id` answers the stored type (a shader as `text/plain`), `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, `Cross-Origin-Resource-Policy: same-origin` and an immutable private cache, and honours a single byte range for video.

## Storage and the mounted folder

Themes live in Vloer's store (`card_themes`), and every save is kept as a version (`card_theme_versions`). A save names the version it was edited from (`baseVersion`, `0` for a new theme); a save over a newer version answers 409 `theme_changed`, so two administrators never overwrite each other silently.

`cardThemes.directory` optionally points at a folder of `<id>.json` themes and an `assets/` subfolder. Its themes are read-only (409 `theme_managed` on a save or delete) and win over a stored theme with the same id. A folder theme may name an asset by its file name in `assets/` (`"setSymbol": "acme.svg"`); Vloer checks the file for the purpose it is used for, exactly like an upload, and keeps it in memory. A file the checks refuse, a file whose name is not its `id`, or invalid JSON is left out and listed for administrators in the designer. The folder is read at start-up.

## Resolution

Ploeg's card carries `style: { skin, theme }`, from the Work Target's `cardStyle` (Ploeg's configuration; Vloer never changes it). The runtime ([`public/cards/themes.js`](../../public/cards/themes.js), [`unfold-card.js`](../../public/cards/unfold-card.js)):

1. reads the theme named by `style.theme` with `GET /api/card-themes/:id`, cached for 30 seconds per page. A missing theme, a 404 or an unreachable Vloer leaves the card without a theme;
2. draws the skin the theme `extends`, or `style.skin` without a theme, falling back as before (Vloer Native without WebGL2);
3. sets each token the drawn skin lists on the `<unfold-card>` element with `style.setProperty`, after checking the value again, and removes every other known token. The markup never gets a `style` attribute, so the CSP stays `style-src 'self'`;
4. hands the skin `view.theme`: the frame, foil pattern, art (the preset, the shader's GLSL fetched from its asset, or the image or video URL), the set symbol and card back URLs and the tokens, each limited to what the drawn skin's manifest lists. The element reflects the theme as `data-theme`.

The forge paints the frame metal and accent lines from `--forge-frame` and `--forge-accent` (gilded stays gold), the back from the card back image or the `--forge-back` glow, the set symbol into the footer plate, and the art window from the preset, the shader or the uploaded texture (a video plays muted on a loop only while the card renders live). A shader this GPU refuses falls back to the card's derived preset and the card reads `data-art-fallback="compile"`.

## HTTP routes

Every route needs a sign-in. Reads are open to every role, because every role sees cards. Writes are for administrators only and need the request marker header, like every mutation.

| Method and path | Who | Response |
| --- | --- | --- |
| `GET /api/card-themes` | Everyone | `{themes, canEdit, skins, limits, art, directory}`. `themes` lists `{id, name, extends, version, updatedAt, updatedBy, source}`; `skins` each skin's theme rules; `art` `{configured, model, maxAttempts, demo}` (the model only for administrators); `directory` the refused folder files, for administrators |
| `GET /api/card-themes/:id` | Everyone | The theme with `version`, `updatedAt`, `updatedBy`, `source` (`store` or `directory`) and `assets`, the metadata of every asset it names |
| `PUT /api/card-themes/:id` | Administrators | `{theme, baseVersion}` → the saved theme, 201 when new. 400 with the reason for an invalid theme or an id that does not match the path; 409 `theme_changed` or `theme_managed` |
| `DELETE /api/card-themes/:id` | Administrators | Deletes a stored theme and its versions. Cards that name it draw their skin without a theme |
| `GET /api/card-themes/:id/versions`, `/versions/:n` | Everyone | `{versions: [{version, savedAt, savedBy}]}`, newest first; one version's theme |
| `POST /api/card-assets?purpose=` | Administrators | The raw file as `application/octet-stream` → 201 `{id, purpose, mediaType, bytes}`. 400 with the reason, 413 too large, 415 another content type, 507 over the quota |
| `GET /api/card-assets/:id` | Everyone | The asset; see [Assets](#assets) |
| `POST /api/card-art/generate` | Administrators | `{prompt, attempt?, compilerLog?}` → `{code, problems, attempt, model}`; see below |

Operators and viewers get 403 `forbidden` on every write.

## Generated art

Optional, live mode only, behind `cardThemes.ai` ([live operation](../operations/live.md#card-themes-and-generated-art)). Vloer calls an OpenAI-compatible `POST {baseUrl}/chat/completions` with `Authorization: Bearer` the key in the `VLOER_` environment variable `keyEnv` names. Use a virtual key made for Vloer with a small budget, for example on the LiteLLM gateway; Vloer refuses to start, and refuses each request, when that key equals `LITELLM_MASTER_KEY`. A `VLOER_` variable can never be passed to an agent workspace (`runtime.agentEnvironment`), and the key is redacted from every response.

The prompt is the Card Forge generator template ([`src/card-art.ts`](../../src/card-art.ts) `artPromptTemplate`) with the administrator's subject (at most 500 characters). Vloer takes the first fenced GLSL block from the answer and returns it with the server's rule `problems`. The browser ([`art-generator.js`](../../public/cards/art-generator.js), [`art-compiler.js`](../../public/cards/skins/forge/art-compiler.js)) compiles it with WebGL2, first on its own so the log counts lines from the shader's first line, then inside the forge's full front shader, renders a 64 × 48 probe at t = 0 and t = 10 and refuses a flat picture. On a failure it asks again with `attempt` 2 or 3 and the log as `compilerLog`, at most twice. A shader that compiles is uploaded as a `shader` asset and becomes the theme's art; one that never compiles stays in the editor and the card keeps its art. The code only ever reaches the GPU's compiler; nothing evaluates it as JavaScript.

Each administrator may make `requestsPerHour` requests (30 by default); more answer 429. An unreachable or failing endpoint answers 502 `art_gateway`; no configuration, or the demo, answers 409 `art_unconfigured`. The designer then explains how to enable it and still accepts a pasted shader.
