# October 2026 site redesign

The accepted design makes Unfold's actual work inspectable through an oversized paper composition. The first pass improved clarity but felt too restrained to the requester. The second pass changed scale, asymmetry and chapter rhythm; the requester approved the rendered implementation on 3 October 2026.

## Research and visual decisions

The design combines a memorable premise, a plain category statement and real evidence. Physical-product references supplied selective exaggeration: [Teenage Engineering](https://teenage.engineering/products/op-1), [Nothing](https://nothing.tech/) and [Daylight](https://daylightcomputer.com/) give one object a dominant silhouette. [Stripe Sessions](https://stripesessions.com/) supplied a useful example of large continuous form and contrasting typography. These are observed composition techniques, not proof of conversion improvements.

[Kernel](https://www.kernel.sh/), [Zed](https://zed.dev/) and [Warp](https://www.warp.dev/) informed the combination of a compact hook, explicit product category and inspectable technical detail. [Sentry's design account](https://blog.sentry.io/sentry-has-a-bold-new-look/) showed how an established visual language can become more tactile. [Vercel's product tour](https://vercel.com/blog/designing-the-vercel-virtual-product-tour) supported self-paced inspection and a separately composed mobile experience. [Stripe's historical Connect account](https://stripe.com/blog/connect-front-end-experience) demonstrated spatial explanation with browser primitives. No other product's maturity or performance claims were transferred to Unfold.

The result uses giant Archivo type, a connected paper dossier, a dark evidence chapter, a short red human-decision chapter, a larger architecture diagram and the original outlined wordmark at closing scale. The generated brand geometry and approved palette remain authoritative. Strong still frames carry the identity; motion reveals the same object rather than supplying the whole visual effect.

## Product evidence and boundaries

The [recorded fixture](../../src/data/demo-timeline.json) supplies the Work Item, rounding change, diff and checks. It records one changed file, zero model calls, zero spend and no merge. The site labels it a deterministic local demonstration. Its duration is not a productivity benchmark and its spend is not a production price.

Ploeg authorizes and coordinates managed work; Vloer is the workbench. The accepted single-engine migration remains incomplete. Ploeg's unattended worker can publish a pull request; Vloer's managed candidate path does not publish one yet. Self-hosted 0.x status is explicit. Hosted access, agency features, preview environments and pricing remain planned, with no invented prices, customers or testimonials. See the [site architecture](../architecture.md) for implementation details.

## Interaction and accessibility decisions

The hero has a finite 1.6-second desktop fold, with replay only where that effect exists. Narrow screens present manually selectable paper panels. The explorer uses one selection state for content and controls, supports direct links and keyboard navigation, and pauses playback when focus enters evidence, the page becomes hidden or the scene leaves view. Reduced motion retains the complete composition and manual inspection.

Verification caught responsive focus loss, a mobile replay control with no effect, enhancement-induced layout shift, enlarged-text overflow and invalid semantic grouping. The corrections preserve focused panels across resize, match control availability to behavior, reserve first-paint geometry and adapt content intrinsically. These lessons are captured in the reusable [expressive-product-sites skill](../../../../.agents/skills/expressive-product-sites/SKILL.md).

## Validation record

The approved implementation is recorded in commits `5e75e71` and `5a16666`. It was then merged with the current `development` branch before delivery. The following measurements belong to the approved local production build at `5a16666`, not to an unmeasured deployed environment.

| Check                     | Recorded result                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| Repository verification   | All application, site, brand and cross-application qualification gates passed              |
| Site gates                | Formatting, lint, type checking, 65 tests, production build and CSP validation passed      |
| Accessibility scan        | Ten pages; zero blocking and zero advisory axe findings                                    |
| Documentation             | 499 sources and 3,242 repository links checked                                             |
| Lighthouse mobile         | Performance 100, accessibility 100, best practices 100; LCP 1,877 ms, CLS 0.0152, TBT 0 ms |
| Lighthouse desktop        | Performance 100, accessibility 100, best practices 100; LCP 443 ms, CLS 0.0006, TBT 0 ms   |
| Initial measured transfer | 146,214 bytes in both retained Lighthouse samples                                          |

Lighthouse ran against the static production build at a local origin with headless Brave/Chromium; mobile used the tool's default mobile simulation, desktop its desktop preset. SEO scored 66 because local and workers.dev origins intentionally carry `noindex`. The video is manual and does not preload. Scores are individual lab samples, not field guarantees or a formal accessibility-conformance claim.

Rendered checks covered English and Dutch, both themes, 320/390/768/1440-pixel widths, reduced motion, 200% text, text-spacing overrides, keyboard selection, anchors and focused-content continuity during resize. The local Worker sign-up path was exercised with synthetic test data. The interactive browser used reduced motion; normal motion was checked through implementation review and default lab execution. No physical-device study, Safari/Firefox run, screen-reader user study, field INP or browser-disabled-JavaScript exercise was claimed. The no-script fallback was source-reviewed.

The principal standards consulted were [W3C contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [pause/stop/hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html), [interaction animation](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html), [web.dev animation performance](https://web.dev/articles/animations-guide) and [Web Vitals](https://web.dev/articles/vitals).
