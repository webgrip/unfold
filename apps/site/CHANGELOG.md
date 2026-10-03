## [unfold-site-v0.1.0-rc.8](https://forgejo.webgrip.dev/webgrip/unfold/compare/unfold-site-v0.1.0-rc.7...unfold-site-v0.1.0-rc.8) (2026-10-03)

### Added

* **site:** serve the recorded Vloer replay at /demo ([66ffe3f](https://forgejo.webgrip.dev/webgrip/unfold/commit/66ffe3faa75e609ab5814870effdf8f1c54855b8)), references [#app](https://forgejo.webgrip.dev/webgrip/unfold/issues/app)
* **site:** turn the site into a landing page with sign-ups, pricing and the demo ([3c19c4d](https://forgejo.webgrip.dev/webgrip/unfold/commit/3c19c4d349a16d6e54cde3e3f397f22bddc6a340))

### Fixed

* **site:** cap the sign-up body by bytes read, not Content-Length ([4769b7a](https://forgejo.webgrip.dev/webgrip/unfold/commit/4769b7a35caeda1121fdcf15c3df11c94bcbdf4f))
* **site:** link the replay at /demo/ once its recording exists, and renumber the sign-up ADR ([dfd0f28](https://forgejo.webgrip.dev/webgrip/unfold/commit/dfd0f2832d21832ee8268083525cd49497ccbed6)), references [#122](https://forgejo.webgrip.dev/webgrip/unfold/issues/122)
* **site:** set the sign-up database id ([00b36b6](https://forgejo.webgrip.dev/webgrip/unfold/commit/00b36b66f84676317a4451c4cf10820ab4f46dc5))
* **vloer:** refuse the inner world's route in the hosted demo replay ([7897f61](https://forgejo.webgrip.dev/webgrip/unfold/commit/7897f61e2148f863f3f149e4df21308dd142c6ec)), references [#122](https://forgejo.webgrip.dev/webgrip/unfold/issues/122)

### Docs

* point commit references at the rewritten history ([2bb2e6b](https://forgejo.webgrip.dev/webgrip/unfold/commit/2bb2e6b3595bae1be8ca9fe30e4117330a0c47c2))

### Internal

* **site:** re-record the demo replay with Run card KPIs ([39e500c](https://forgejo.webgrip.dev/webgrip/unfold/commit/39e500c64c842f09123c94ade919797918410f9a))

## [unfold-site-v0.1.0-rc.7](https://forgejo.webgrip.dev/webgrip/glide/compare/unfold-site-v0.1.0-rc.6...unfold-site-v0.1.0-rc.7) (2026-10-01)

### Added

* **site:** apply the Unfold brand ([b3dc446](https://forgejo.webgrip.dev/webgrip/glide/commit/b3dc44634b437ae1e70d08a617e4292cfa325c3d))

## [unfold-site-v0.1.0-rc.6](https://forgejo.webgrip.dev/webgrip/glide/compare/unfold-site-v0.1.0-rc.5...unfold-site-v0.1.0-rc.6) (2026-10-01)

### Changed

* rename the product from Glide to Unfold ([b627d5f](https://forgejo.webgrip.dev/webgrip/glide/commit/b627d5f5316213a08bca393481b979cfd9d89168))

### Build

* **site:** clear the wrangler advisories and move to TypeScript 6 and pnpm 12 ([d3ab4a1](https://forgejo.webgrip.dev/webgrip/glide/commit/d3ab4a104eaa3c297e7713c64fcdd5c36a852f21))
* **site:** move the Worker compatibility date to 2026-09-26 ([a90527e](https://forgejo.webgrip.dev/webgrip/glide/commit/a90527e1a8d34c2b61e5447d5ca420f1c343cb65))

## [glide-site-v0.1.0-rc.5](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-site-v0.1.0-rc.4...glide-site-v0.1.0-rc.5) (2026-10-01)

### Fixed

* **deps:** update pnpm ( 11.28.1 ➔ 11.28.2 ) ([badcd13](https://forgejo.webgrip.dev/webgrip/glide/commit/badcd13e58e807c8b3e92b4a6f1ee8701ee6706a))

## [glide-site-v0.1.0-rc.4](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-site-v0.1.0-rc.3...glide-site-v0.1.0-rc.4) (2026-10-01)

### Added

* **deps:** update all non-major dependencies ([904208d](https://forgejo.webgrip.dev/webgrip/glide/commit/904208d3bf6e3c7f93fe3b983ee350cf8092f24a))

## [glide-site-v0.1.0-rc.3](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-site-v0.1.0-rc.2...glide-site-v0.1.0-rc.3) (2026-10-01)

### Added

* **deps:** update pnpm ( 11.8.0 ➔ 11.11.0 ) [security] ([cfd3112](https://forgejo.webgrip.dev/webgrip/glide/commit/cfd31122d8a0dd3b03e41ca07451808eaa152cfe))

## [glide-site-v0.1.0-rc.2](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-site-v0.1.0-rc.1...glide-site-v0.1.0-rc.2) (2026-10-01)

### Added

* **deps:** update all non-major dependencies ([bdf17f1](https://forgejo.webgrip.dev/webgrip/glide/commit/bdf17f13970bb01f11c31ff3e711049961c7eaaf))
* **deps:** update dependency astro ( 7.1.6 ➔ 7.2.8 ) [security] ([7054760](https://forgejo.webgrip.dev/webgrip/glide/commit/70547607e03db9344fec38c92b02bcfc7b6d90f0))

### Fixed

* **ci:** never skip the site gate job so Glide releases publish ([f7d0a81](https://forgejo.webgrip.dev/webgrip/glide/commit/f7d0a8190a7c087b1a80236e7c7ace2d95771dbb))

## [glide-site-v0.1.0-rc.1](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-site-v0.0.0...glide-site-v0.1.0-rc.1) (2026-10-01)

### Added

* **site:** add the bilingual static marketing site scaffold ([2309159](https://forgejo.webgrip.dev/webgrip/glide/commit/2309159b446d8bf1fce2a16f6de628f7d0807d7c))
* **site:** serve from workers.dev and stay unindexed there ([75316ae](https://forgejo.webgrip.dev/webgrip/glide/commit/75316ae8876feee06c2fd2b6687abf1b2ff30870))
* **site:** take the site URL from the build environment ([c4a33e1](https://forgejo.webgrip.dev/webgrip/glide/commit/c4a33e199abf8f17966184d5189a04cb8f9d5bbf))

### Docs

* **site:** record the separate site release and deploy in ADR-0012 ([7df82f9](https://forgejo.webgrip.dev/webgrip/glide/commit/7df82f935487ba86e92d8df734dfa5c61f6280a6))

### Build

* **site:** give the site its own glide-site-v release train ([d8b59ca](https://forgejo.webgrip.dev/webgrip/glide/commit/d8b59ca3b4e5478623e50dd7661747e681720a12))
* **site:** switch the site to pnpm and pin wrangler ([4ab487b](https://forgejo.webgrip.dev/webgrip/glide/commit/4ab487b012940cc38a06c45420b87e0b8e452352))

### CI

* **site:** release the site on its own train and deploy it to workers.dev ([b6adee9](https://forgejo.webgrip.dev/webgrip/glide/commit/b6adee95b144c7bb1da852a7780313676eb1f2a2))
