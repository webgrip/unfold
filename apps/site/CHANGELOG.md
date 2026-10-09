## [unfold-site-v1.0.0-rc.3](https://forgejo.webgrip.dev/webgrip/unfold/compare/unfold-site-v1.0.0-rc.2...unfold-site-v1.0.0-rc.3) (2026-10-09)

### Added

* **deps:** update all non-major dependencies ([85f09c5](https://forgejo.webgrip.dev/webgrip/unfold/commit/85f09c54418cee86ac853a3ff06e26d9892e5eab))

### Fixed

* **ci:** adopt the pnpm 12.9.1, marked 18.1.0 and workflows v2.8.1 updates ([41434f2](https://forgejo.webgrip.dev/webgrip/unfold/commit/41434f29483461ffdfe470fd7500f412d4ebcd16))

## [unfold-site-v1.0.0-rc.2](https://forgejo.webgrip.dev/webgrip/unfold/compare/unfold-site-v1.0.0-rc.1...unfold-site-v1.0.0-rc.2) (2026-10-06)

### Added

* **actions:** Update all non-major dependencies ([ed00933](https://forgejo.webgrip.dev/webgrip/unfold/commit/ed009336fe77f424806121ee8b1943cdc7674c52))
* **deps:** update all non-major dependencies ([41c3ba0](https://forgejo.webgrip.dev/webgrip/unfold/commit/41c3ba07be77273ac4e2650cd9baa9a6ae28515f))

### Fixed

* **ci:** repair development after Renovate [#247](https://forgejo.webgrip.dev/webgrip/unfold/issues/247) and [#248](https://forgejo.webgrip.dev/webgrip/unfold/issues/248) ([d033d22](https://forgejo.webgrip.dev/webgrip/unfold/commit/d033d227d95f76671ab765450a29160309971fa4))

## [unfold-site-v1.0.0-rc.1](https://forgejo.webgrip.dev/webgrip/unfold/compare/unfold-site-v0.1.0-rc.11...unfold-site-v1.0.0-rc.1) (2026-10-04)

### ⚠ BREAKING CHANGES

* **unfold:** deployments must switch to the unfold image and chart and
  rename VLOER_* environment variables to UNFOLD_* (homelab: VIK-1856). The
  default OIDC groups are now unfold-admins, unfold-operators and
  unfold-viewers.

### Added

* **deps:** update all non-major dependencies ([a14ac65](https://forgejo.webgrip.dev/webgrip/unfold/commit/a14ac65cec518da8a992d67f604f21bae9ef5268))
* **site:** release the site to unfoldhq.dev from main ([6c724a2](https://forgejo.webgrip.dev/webgrip/unfold/commit/6c724a283476dcd15f48f35da64100d8fe859c31))
* **site:** unfoldhq.dev handles no mail; drop the registrar's forwarding ([28264b5](https://forgejo.webgrip.dev/webgrip/unfold/commit/28264b5d4bdd852be2a12f6357116605677c6b0a))

### Fixed

* **site:** declare DNSControl's MX and TXT for the linter ([dd97fa6](https://forgejo.webgrip.dev/webgrip/unfold/commit/dd97fa6d48cd5f7f7fdff43d6188e7b7047e036d)), references [#230](https://forgejo.webgrip.dev/webgrip/unfold/issues/230)
* **site:** run the DNS preview in a direct job so it gets an OIDC token ([92ecf1e](https://forgejo.webgrip.dev/webgrip/unfold/commit/92ecf1e928425ac311bac0990fa0569f8895f226)), references [#222](https://forgejo.webgrip.dev/webgrip/unfold/issues/222)

### Changed

* **unfold:** retire the name Vloer; the application is Unfold ([fa7ebda](https://forgejo.webgrip.dev/webgrip/unfold/commit/fa7ebda02af9ec29c6c06048ccff1e9edfdc0dd7))

### CI

* **site:** preview unfoldhq.dev DNS with a read-only token from OpenBao ([1b8453d](https://forgejo.webgrip.dev/webgrip/unfold/commit/1b8453deda50292659c792b6963a52a6d3e7dd98))

## [unfold-site-v0.1.0-rc.11](https://forgejo.webgrip.dev/webgrip/unfold/compare/unfold-site-v0.1.0-rc.10...unfold-site-v0.1.0-rc.11) (2026-10-04)

### Added

* **deps:** update all non-major dependencies ([dbf4083](https://forgejo.webgrip.dev/webgrip/unfold/commit/dbf40833cd26b1eb22be87209cee74829eca2ddf))

### Build

* **site:** lock pnpm 12.8.2 in the site's pnpm-lock.yaml ([c707135](https://forgejo.webgrip.dev/webgrip/unfold/commit/c707135ef10a4fb63674edac24166eb9bb32dec5))

### CI

* **site:** record the /demo replay in the site build instead of committing it ([b10b6c0](https://forgejo.webgrip.dev/webgrip/unfold/commit/b10b6c01086d8a44f49f79df4dec985785bd0e3e))

## [unfold-site-v0.1.0-rc.10](https://forgejo.webgrip.dev/webgrip/unfold/compare/unfold-site-v0.1.0-rc.9...unfold-site-v0.1.0-rc.10) (2026-10-04)

### Added

* **deps:** update all non-major dependencies ([711a481](https://forgejo.webgrip.dev/webgrip/unfold/commit/711a481495b8e797432be1102b57c38304ad78a7))

### Fixed

* **site:** name the configuration each security and execution claim needs ([3ddf79e](https://forgejo.webgrip.dev/webgrip/unfold/commit/3ddf79e5a2c96ebf161206b67430fe355f991390))

### Internal

* **site:** re-record the demo replay with the grade formula 2026.3 card model ([20be172](https://forgejo.webgrip.dev/webgrip/unfold/commit/20be1721c2902e2a1b7c586289ee52701334a46f))

## [unfold-site-v0.1.0-rc.9](https://forgejo.webgrip.dev/webgrip/unfold/compare/unfold-site-v0.1.0-rc.8...unfold-site-v0.1.0-rc.9) (2026-10-03)

### Added

* **site:** deploy candidates to staging.unfoldhq.dev and manage the zone as code ([f6c5e9e](https://forgejo.webgrip.dev/webgrip/unfold/commit/f6c5e9e5900a190644b1afdf4f18a50df9287417))
* **site:** give Unfold an expressive folded-paper identity ([5a16666](https://forgejo.webgrip.dev/webgrip/unfold/commit/5a166663a931f34d6892be843f9275b75b2b6232))
* **site:** redesign Unfold around inspectable agent work ([5e75e71](https://forgejo.webgrip.dev/webgrip/unfold/commit/5e75e7195f6b637d4463e76c140b8a9cf9d852c3))
* **site:** serve the site on unfoldhq.dev ([8a3915b](https://forgejo.webgrip.dev/webgrip/unfold/commit/8a3915b474e4a85a738c479417c306d5a83cd8d0))

### Docs

* **site:** preserve design research and reusable product-site skill ([0d3e30d](https://forgejo.webgrip.dev/webgrip/unfold/commit/0d3e30d5d3260cd54b14f75a6a6f102a9ea79cee))

### Internal

* **site:** re-record the demo replay with complete Now waiting lists ([f29fb23](https://forgejo.webgrip.dev/webgrip/unfold/commit/f29fb236f9389cfc5e13928b16a49d6ae2764159))
* **site:** re-record the demo replay with the truthful completion message ([26b8d85](https://forgejo.webgrip.dev/webgrip/unfold/commit/26b8d85f15dd09149013301ce6a9ebdae77d90c7))

## [unfold-site-v0.1.0-rc.8](https://forgejo.webgrip.dev/webgrip/unfold/compare/unfold-site-v0.1.0-rc.7...unfold-site-v0.1.0-rc.8) (2026-10-03)

### Added

* **site:** serve the recorded Unfold replay at /demo ([66ffe3f](https://forgejo.webgrip.dev/webgrip/unfold/commit/66ffe3faa75e609ab5814870effdf8f1c54855b8)), references [#app](https://forgejo.webgrip.dev/webgrip/unfold/issues/app)
* **site:** turn the site into a landing page with sign-ups, pricing and the demo ([3c19c4d](https://forgejo.webgrip.dev/webgrip/unfold/commit/3c19c4d349a16d6e54cde3e3f397f22bddc6a340))

### Fixed

* **site:** cap the sign-up body by bytes read, not Content-Length ([4769b7a](https://forgejo.webgrip.dev/webgrip/unfold/commit/4769b7a35caeda1121fdcf15c3df11c94bcbdf4f))
* **site:** link the replay at /demo/ once its recording exists, and renumber the sign-up ADR ([dfd0f28](https://forgejo.webgrip.dev/webgrip/unfold/commit/dfd0f2832d21832ee8268083525cd49497ccbed6)), references [#122](https://forgejo.webgrip.dev/webgrip/unfold/issues/122)
* **site:** set the sign-up database id ([00b36b6](https://forgejo.webgrip.dev/webgrip/unfold/commit/00b36b66f84676317a4451c4cf10820ab4f46dc5))
* **unfold:** refuse the inner world's route in the hosted demo replay ([7897f61](https://forgejo.webgrip.dev/webgrip/unfold/commit/7897f61e2148f863f3f149e4df21308dd142c6ec)), references [#122](https://forgejo.webgrip.dev/webgrip/unfold/issues/122)

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
