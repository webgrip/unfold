# Glide site

The public marketing site for [Glide](../../README.md): one landing page and a 404, in English (`/`) and Dutch (`/nl`). It is a static [Astro](https://astro.build) build meant for Cloudflare Workers Static Assets. It is not deployed yet.

```sh
mise install
mise exec -- npm ci
mise exec -- npm run dev      # http://localhost:4321
mise exec -- npm run build    # dist/, with CSP validation
```

The gates are `format:check`, `lint`, `typecheck`, `test` and `build`; `mise run verify` from the Glide root runs them. The [architecture](docs/architecture.md) explains the layout, the brand seam and the security headers. [Deploy](docs/deploy.md) explains why nothing publishes the site yet.

The site is not part of Glide's release: it has no version, no image and no chart, and its commits do not bump the Glide version.

Code is [Apache-2.0](LICENSE). The bundled Archivo typeface is under the [SIL Open Font License 1.1](public/fonts/OFL.txt); see [NOTICE](NOTICE).
