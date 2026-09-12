# 0020 — The name and mark are trademarks under a usage policy, not CC-licensed artwork

Date: 2026-09-11. Status: accepted for 0.3.0; the policy and its CI check ship with the identity.

## Context

De Vloer now has a visual identity in [docs/brand/](../brand/README.md): a mark, a wordmark,
lockups, colour tokens and a generator that writes them. The repository is
[Apache-2.0](../../LICENSE), which answers copyright for source. A mark raises a second question
the code licence does not: may a fork ship under the De Vloer name and mark, and may a vendor
put them on a page that implies endorsement?

The obvious reflex is to put a Creative Commons licence on the artwork files. That is the wrong
instrument, for reasons that are worth recording before the identity is published anywhere it
can be copied.

A CC licence is irrevocable. De Vloer is pre-1.0 and may yet move to a different steward. A
policy file can be tightened, loosened or reassigned; a CC grant, once made, cannot be withdrawn
from anyone who already has it. Creative Commons themselves advise against applying their
licences to trademarks, on the grounds that doing so can cost the right altogether — a mark
identifies origin, and a copyright permission to modify it undercuts exactly that function.
Share-alike would be worse still: it attaches a viral obligation to material that merely
reproduces the logo, discouraging the README badges, integration listings and conference slides
a young project wants.

The risk here is misattribution, not copying. Nobody is harmed by an article reproducing the
mark. The harm is a fork or a vendor implying that what they ship is De Vloer, or that De Vloer
endorses it. Copyright is the wrong tool for that and trademark is the right one. Apache-2.0 §6
already grants no licence to the licensor's trade names or marks, so the repository licence and
a trademark reservation compose without conflict and the artwork files need no second copyright
answer.

Ploeg settled the same question the same way in
[its ADR-0022](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/main/docs/adrs/0022-the-name-and-mark-are-trademarks-not-cc-licensed-artwork.md).
Two sibling products reached for the same reasoning independently; keeping the two answers
identical is worth more than a locally clever variation.

## Decision

"De Vloer" and the mark are reserved as trademarks under a usage policy at
[docs/brand/TRADEMARK.md](../brand/TRADEMARK.md). The artwork files stay under the repository's
existing Apache-2.0, with no second licence file beside them.

The policy grants, without asking: reproduction of the unmodified mark to refer to the project,
truthful compatibility statements, linking, scaling, and redistribution of an unmodified De
Vloer. It withholds, pending written permission: shipping a modified or forked distribution
under the name or mark, implying endorsement or affiliation, adopting the name or a confusingly
similar one as your own, and altering the mark.

[scripts/brand-marks.sh](../../scripts/brand-marks.sh) confirms the decision in CI: it fails if
the policy goes missing, if a second copyright answer appears beside the assets, or if the
policy stops being reachable from the repository's front door.

## Consequences

Forks keep every freedom Apache-2.0 gives them over the code and have to pick their own name,
which is the intended outcome. Anyone reproducing the mark to talk about the project needs no
permission and no notification.

The permissions are revocable in principle. That is the point of choosing a policy over a
licence, and it is also the thing a downstream user has to trust us about; the policy says
plainly that withdrawing permission from someone acting in good faith is not something we plan
to do.

The typeface is not covered either way. Chivo is Héctor Gatti / Omnibus-Type under
[SIL OFL 1.1](https://openfontlicense.org/), and if the font is ever shipped inside a docs site
the OFL text ships with it.

## Reconsider when

The project changes stewardship, a foundation asks for an assignable mark, or someone needs a
permission this policy withholds often enough that the default is wrong.
