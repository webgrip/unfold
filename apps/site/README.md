# Unfold site

The public marketing site for [Unfold](../../README.md): one landing page and a 404, in English (`/`) and Dutch (`/nl`). It is a static [Astro](https://astro.build) build for Cloudflare Workers Static Assets, released and deployed on its own `unfold-site-v…` train.

```sh
mise install
mise exec -- corepack pnpm install --frozen-lockfile
mise exec -- corepack pnpm dev      # http://localhost:4321
mise exec -- corepack pnpm build    # dist/, with CSP validation
```

The gates are `format:check`, `lint`, `typecheck`, `test` and `build`; `mise run verify` from the Unfold root runs them. The [architecture](docs/architecture.md) explains the layout, the brand seam and the security headers. [Deploy](docs/deploy.md) explains the release, the deploy, the temporary hostname and what is still missing.

The site is not part of the Unfold version ([ADR-0012](../../docs/adr/adr-0012-the-marketing-site-releases-and-deploys-on-its-own.md)). Scope its commits `site` so they never bump `unfold-v…`.

Code is [Apache-2.0](LICENSE). The bundled Archivo typeface is under the [SIL Open Font License 1.1](public/fonts/OFL.txt); see [NOTICE](NOTICE).
