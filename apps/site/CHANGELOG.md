## [unfold-site-v0.1.0-rc.6](https://forgejo.webgrip.dev/webgrip/glide/compare/unfold-site-v0.1.0-rc.5...unfold-site-v0.1.0-rc.6) (2026-10-01)

### Changed

* rename the product from Glide to Unfold ([dc45dac](https://forgejo.webgrip.dev/webgrip/glide/commit/dc45dacb00b52de6d16b4379776d0bb077a9563e))

### Build

* **site:** clear the wrangler advisories and move to TypeScript 6 and pnpm 12 ([504e2f4](https://forgejo.webgrip.dev/webgrip/glide/commit/504e2f4ca40e0efd69ef9774a3ee5564ec05c767))
* **site:** move the Worker compatibility date to 2026-09-26 ([8881e1c](https://forgejo.webgrip.dev/webgrip/glide/commit/8881e1cad4856d6fbdfb734b45ccd792200dc0fa))

## [glide-site-v0.1.0-rc.5](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-site-v0.1.0-rc.4...glide-site-v0.1.0-rc.5) (2026-10-01)

### Fixed

* **deps:** update pnpm ( 11.28.1 ➔ 11.28.2 ) ([4485b49](https://forgejo.webgrip.dev/webgrip/glide/commit/4485b49837b3bba5c8c4791536fabe35bfa1804e))

## [glide-site-v0.1.0-rc.4](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-site-v0.1.0-rc.3...glide-site-v0.1.0-rc.4) (2026-10-01)

### Added

* **deps:** update all non-major dependencies ([fd90985](https://forgejo.webgrip.dev/webgrip/glide/commit/fd909857de6d0162d32a147841d10773ca9907a4))

## [glide-site-v0.1.0-rc.3](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-site-v0.1.0-rc.2...glide-site-v0.1.0-rc.3) (2026-10-01)

### Added

* **deps:** update pnpm ( 11.8.0 ➔ 11.11.0 ) [security] ([071f0ac](https://forgejo.webgrip.dev/webgrip/glide/commit/071f0ac2cdffc79ba3686bdab45d4d4e9e1302e5))

## [glide-site-v0.1.0-rc.2](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-site-v0.1.0-rc.1...glide-site-v0.1.0-rc.2) (2026-10-01)

### Added

* **deps:** update all non-major dependencies ([2631513](https://forgejo.webgrip.dev/webgrip/glide/commit/263151325d068621fd671658880d0267f01c6ba4))
* **deps:** update dependency astro ( 7.1.6 ➔ 7.2.8 ) [security] ([943f0a6](https://forgejo.webgrip.dev/webgrip/glide/commit/943f0a6a6caa1155a4b10b8bf665faddbf3f395c))

### Fixed

* **ci:** never skip the site gate job so Glide releases publish ([4059721](https://forgejo.webgrip.dev/webgrip/glide/commit/405972179bd3e8b3cb852e0943aff5986008bd11))

## [glide-site-v0.1.0-rc.1](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-site-v0.0.0...glide-site-v0.1.0-rc.1) (2026-10-01)

### Added

* **site:** add the bilingual static marketing site scaffold ([b75d939](https://forgejo.webgrip.dev/webgrip/glide/commit/b75d93927d294e965d4bd95c154508c21d1bca96))
* **site:** serve from workers.dev and stay unindexed there ([26ad16a](https://forgejo.webgrip.dev/webgrip/glide/commit/26ad16aa3903b7c1c1fd24be742aac758f58ddcd))
* **site:** take the site URL from the build environment ([4c2b9ab](https://forgejo.webgrip.dev/webgrip/glide/commit/4c2b9ab3e892614563cea0ac1d19b0ac058b205b))

### Docs

* **site:** record the separate site release and deploy in ADR-0012 ([3e17a4c](https://forgejo.webgrip.dev/webgrip/glide/commit/3e17a4c4caa09a09c712200f5d2291bf6aa9348e))

### Build

* **site:** give the site its own glide-site-v release train ([e8a1a0a](https://forgejo.webgrip.dev/webgrip/glide/commit/e8a1a0ac08797da1bd86e6b49cae7993815ec11f))
* **site:** switch the site to pnpm and pin wrangler ([755a089](https://forgejo.webgrip.dev/webgrip/glide/commit/755a089165c512cd65318c85454476609ed5df47))

### CI

* **site:** release the site on its own train and deploy it to workers.dev ([7f7241c](https://forgejo.webgrip.dev/webgrip/glide/commit/7f7241cabc78bd0efee600f675316b10d6bcd7c7))
