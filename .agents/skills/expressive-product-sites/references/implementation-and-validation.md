# Implementation and validation

Use the project's existing stack unless its constraints justify a change. Prefer semantic server-rendered content and small progressive enhancements where they meet the design. CSS or SVG geometry can support a spatial story without a 3D runtime; use heavier rendering only when its visible contribution earns the cost.

## Interaction contract

For each interactive scene, record:

| Decision | Questions to resolve |
| --- | --- |
| Purpose | What relationship or consequence does movement explain? |
| Trigger and end | Does it begin on arrival, intent or direct selection? Where does it settle? |
| Selection | Which single state controls the visual, content, URL fragment and accessible state? |
| Interruption | Can a visitor stop and inspect? What happens on focus, hidden page or offscreen content? |
| Alternatives | What remains with reduced motion, no scripting, touch and a narrow viewport? |
| Controls | Do labels and availability still match the behavior in every variant? |

Avoid delaying essential text for an entrance. A replay button does not pause an automatic presentation. Automatic updating information needs separate consideration from decorative movement; do not assume a short duration exempts all updates from accessibility requirements.

Prefer transform and opacity when suitable, then profile the actual effect. Avoid continuous work at rest and permanent layer promotion without evidence that it helps. Loading benchmarks and animation smoothness are different checks.

## Regression traps from actual work

| Failure | Practical correction |
| --- | --- |
| A focused desktop panel becomes the hidden mobile panel after resize. | Synchronize selection when a panel receives focus; reflow must preserve the focused content. |
| A replay button remains after mobile CSS disables the animation. | Hide or replace the control when its effect is unavailable, including reduced motion. |
| Hydration collapses a tall stack into one panel and shifts the page. | Reserve stable first-paint geometry for enhanced mode while retaining a readable no-script stack. |
| A breakpoint works at normal text size but clips enlarged text. | Combine intrinsic sizing or container-aware layout with narrow-screen and enlarged-text testing. |
| Translation or code expands the page sideways. | Use real localized copy, allow flexible children to shrink, wrap prose and confine code scrolling to a labelled region. |
| Visual restructuring breaks a definition list or heading hierarchy. | Recheck semantic markup after composition changes, not just the original content. |
| The browser silently uses reduced motion. | Read the active preference; exercise normal and reduced states separately or disclose which remains untested. |

These are failure modes, not mandates for a particular DOM structure or breakpoint.

## Final-build matrix

Choose dimensions and states from the actual product; include combinations where failures are likely.

- Desktop, intermediate and narrow mobile compositions; both sides of interaction-changing breakpoints.
- Real locales and themes; 200% text and text-spacing overrides, including on narrow screens.
- Keyboard order, visible focus, direct selection, deep links, rapid changes, interruption and responsive reflow while focused.
- Touch without hover, normal motion, reduced motion and a readable no-script fallback.
- Forms and error/success states using safe test data in a local or dedicated test environment.
- Production-build accessibility scans, browser errors, CSP and appropriate repository checks.
- Representative mobile/desktop loading measurements with tool version, throttling and origin recorded; inspect layout shift after enhancement and interaction separately.

Retain the commit/build identity, commands or harness configuration, concise results and meaningful limitations. Distinguish an automated scan, source review, browser exercise and physical-device test. Do not report an unexercised state as passed. Do not turn a single lab score into a universal budget or invent unavailable field data.

Primary references to check when relevant: [W3C pause, stop, hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html), [interaction animation](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html), [reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), [web.dev animation performance](https://web.dev/articles/animations-guide) and [Web Vitals](https://web.dev/articles/vitals). Verify current guidance rather than treating this reference as a frozen standard.
