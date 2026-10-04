## [unfold-v0.4.0-rc.38](https://forgejo.webgrip.dev/webgrip/unfold/compare/unfold-v0.4.0-rc.37...unfold-v0.4.0-rc.38) (2026-10-04)

### Added

* **vloer:** read Ploeg's budget held by unsettled runs close reason ([df1452f](https://forgejo.webgrip.dev/webgrip/unfold/commit/df1452f3708605c55d99b48ffb96c6fa43dee403)), references [ploeg-hq/ploeg#59](https://forgejo.webgrip.dev/ploeg-hq/ploeg/issues/59)
* **vloer:** show when a waiting pull request conflicts with its base ([21eb72d](https://forgejo.webgrip.dev/webgrip/unfold/commit/21eb72db68dffde87bcec7e41faf1fc58fff6e56)), references [ploeg-hq/ploeg#55](https://forgejo.webgrip.dev/ploeg-hq/ploeg/issues/55)

### Fixed

* **vloer:** drop the roadmap note from the VS Code task view too ([70db898](https://forgejo.webgrip.dev/webgrip/unfold/commit/70db898714259e46d0b960f86de52e90e8429c3d))
* **vloer:** say when a budget stop was only held, and count work in Runs ([47849bc](https://forgejo.webgrip.dev/webgrip/unfold/commit/47849bc401a6ba2c52047f90ad6e2125653f08e5))

### Docs

* **vloer:** describe held budget stops, Run counts and when Cancel shows ([8932639](https://forgejo.webgrip.dev/webgrip/unfold/commit/8932639c4cd1057a748ff18038bad32e4b16e258))

### Build

* **ploeg:** pin Ploeg v0.2.0-rc.1 and follow its releases ([5b3073e](https://forgejo.webgrip.dev/webgrip/unfold/commit/5b3073e9ca4adaad757b4f9f1f4cf1184a04171e))
* **ploeg:** pin Ploeg v0.2.0-rc.2 ([8ee2764](https://forgejo.webgrip.dev/webgrip/unfold/commit/8ee276497abc2d49dacddf7fbf5537a21f04113b)), references [ploeg-hq/ploeg#55](https://forgejo.webgrip.dev/ploeg-hq/ploeg/issues/55) [#56](https://forgejo.webgrip.dev/webgrip/unfold/issues/56) [#59](https://forgejo.webgrip.dev/webgrip/unfold/issues/59)

### Internal

* **release:** unfold-site-v0.1.0-rc.11 [skip ci] ([9de2dab](https://forgejo.webgrip.dev/webgrip/unfold/commit/9de2dab432a10d15366fd29b1beb12a8ccfa615e))

## [unfold-v0.4.0-rc.37](https://forgejo.webgrip.dev/webgrip/unfold/compare/unfold-v0.4.0-rc.36...unfold-v0.4.0-rc.37) (2026-10-04)

### Added

* **deps:** update all non-major dependencies ([dbf4083](https://forgejo.webgrip.dev/webgrip/unfold/commit/dbf40833cd26b1eb22be87209cee74829eca2ddf))
* **unfold:** show tasks Ploeg could not start under Needs you ([501a018](https://forgejo.webgrip.dev/webgrip/unfold/commit/501a018f54dec06c3bfdf0f75a6dd4c595ba2159))
* **unfold:** warn when Runs hold budget Ploeg cannot release ([46819e9](https://forgejo.webgrip.dev/webgrip/unfold/commit/46819e97232b19a34964d4ed47095a9861e9fdb4))

### Fixed

* **unfold:** default the chart and image builds to public registries ([14e7581](https://forgejo.webgrip.dev/webgrip/unfold/commit/14e7581ab909ceb35ae583757df6252131bbaf84))
* **unfold:** make editor sign-in need approval and issue its own credential ([9ada416](https://forgejo.webgrip.dev/webgrip/unfold/commit/9ada416ab39fe42346eda2a5a57bd7a0d952f143))
* **unfold:** mark a pull request whose reviewer kept failing as unreviewed ([d842853](https://forgejo.webgrip.dev/webgrip/unfold/commit/d84285390ccbae928835ca17bb6184aa721d7080))
* **unfold:** say the agent stopped responding when an ACP watchdog stopped it ([d263ce6](https://forgejo.webgrip.dev/webgrip/unfold/commit/d263ce6de9a91bca89bda94ab7b5c274a425239c))

### Docs

* **unfold:** accept ADR-0037 an editor signs in only after its person approves it ([072e3ee](https://forgejo.webgrip.dev/webgrip/unfold/commit/072e3ee340fbdbb292722590676e39fb9034f11f))

### Tests

* **unfold:** give the relay test's timed exec a load-scaled budget ([a05d947](https://forgejo.webgrip.dev/webgrip/unfold/commit/a05d94726fd1eaf567d2ba0d96edfbcb1b3f6e47)), references [#207](https://forgejo.webgrip.dev/webgrip/unfold/issues/207) [#212](https://forgejo.webgrip.dev/webgrip/unfold/issues/212)

### Build

* **ploeg:** pin Ploeg main at 611b3f18 to keep verification provenance ([9f3e9e9](https://forgejo.webgrip.dev/webgrip/unfold/commit/9f3e9e92638aa4fcb0816458ba1ebdf0297fbdf6)), references [ploeg-hq/ploeg#53](https://forgejo.webgrip.dev/ploeg-hq/ploeg/issues/53) [ploeg-hq/ploeg#47](https://forgejo.webgrip.dev/ploeg-hq/ploeg/issues/47) [ploeg-hq/ploeg#54](https://forgejo.webgrip.dev/ploeg-hq/ploeg/issues/54)
* **ploeg:** pin Ploeg main at 611b3f18 to let only the worker report delivery ([047d605](https://forgejo.webgrip.dev/webgrip/unfold/commit/047d605894566a1d925dc0623a37c05178ceb585)), references [ploeg-hq/ploeg#49](https://forgejo.webgrip.dev/ploeg-hq/ploeg/issues/49) [ploeg-hq/ploeg#47](https://forgejo.webgrip.dev/ploeg-hq/ploeg/issues/47) [ploeg-hq/ploeg#54](https://forgejo.webgrip.dev/ploeg-hq/ploeg/issues/54)
* **ploeg:** pin Ploeg main at 611b3f18 to list Runs whose spend cannot settle ([721af5b](https://forgejo.webgrip.dev/webgrip/unfold/commit/721af5b8671188e53e5558d22d397e7bdc305c47)), references [ploeg-hq/ploeg#50](https://forgejo.webgrip.dev/ploeg-hq/ploeg/issues/50) [ploeg-hq/ploeg#47](https://forgejo.webgrip.dev/ploeg-hq/ploeg/issues/47) [ploeg-hq/ploeg#54](https://forgejo.webgrip.dev/ploeg-hq/ploeg/issues/54)
* **ploeg:** pin Ploeg main at 611b3f18 to make the chart portable ([800abf7](https://forgejo.webgrip.dev/webgrip/unfold/commit/800abf77d9f399b9576dca1cae5009c0c1709309)), references [ploeg-hq/ploeg#52](https://forgejo.webgrip.dev/ploeg-hq/ploeg/issues/52) [ploeg-hq/ploeg#47](https://forgejo.webgrip.dev/ploeg-hq/ploeg/issues/47) [ploeg-hq/ploeg#54](https://forgejo.webgrip.dev/ploeg-hq/ploeg/issues/54)
* **ploeg:** pin Ploeg main at 611b3f18 to name the ACP watchdog that stopped a Run ([94b5e81](https://forgejo.webgrip.dev/webgrip/unfold/commit/94b5e815c72cd71ba47b4ef2ea4b9ccc17ddacea)), references [ploeg-hq/ploeg#48](https://forgejo.webgrip.dev/ploeg-hq/ploeg/issues/48) [ploeg-hq/ploeg#47](https://forgejo.webgrip.dev/ploeg-hq/ploeg/issues/47) [ploeg-hq/ploeg#54](https://forgejo.webgrip.dev/ploeg-hq/ploeg/issues/54)
* **ploeg:** pin Ploeg main at 611b3f18 to retry a failed reviewer ([fe47d57](https://forgejo.webgrip.dev/webgrip/unfold/commit/fe47d57523ed13d339cd8abcbd4263189660a6e4)), references [ploeg-hq/ploeg#47](https://forgejo.webgrip.dev/ploeg-hq/ploeg/issues/47) [ploeg-hq/ploeg#47](https://forgejo.webgrip.dev/ploeg-hq/ploeg/issues/47) [ploeg-hq/ploeg#54](https://forgejo.webgrip.dev/ploeg-hq/ploeg/issues/54)
* **site:** lock pnpm 12.8.2 in the site's pnpm-lock.yaml ([c707135](https://forgejo.webgrip.dev/webgrip/unfold/commit/c707135ef10a4fb63674edac24166eb9bb32dec5))

### CI

* **site:** record the /demo replay in the site build instead of committing it ([b10b6c0](https://forgejo.webgrip.dev/webgrip/unfold/commit/b10b6c01086d8a44f49f79df4dec985785bd0e3e))

### Internal

* **release:** unfold-site-v0.1.0-rc.10 [skip ci] ([59823dd](https://forgejo.webgrip.dev/webgrip/unfold/commit/59823dd6bb2fe1f9f589fe93946a387c9d19db36))

## [unfold-v0.4.0-rc.36](https://forgejo.webgrip.dev/webgrip/unfold/compare/unfold-v0.4.0-rc.35...unfold-v0.4.0-rc.36) (2026-10-04)

### Added

* **deps:** update all non-major dependencies ([711a481](https://forgejo.webgrip.dev/webgrip/unfold/commit/711a481495b8e797432be1102b57c38304ad78a7))
* **ploeg:** expose who asked for changes on a pull request ([b3a3a5c](https://forgejo.webgrip.dev/webgrip/unfold/commit/b3a3a5c7661246b85ae4a76a80056bf6578f11e4))

### Fixed

* **ploeg:** correct first deploys reported out of order and finish deploy checks without a new deploy ([50ab325](https://forgejo.webgrip.dev/webgrip/unfold/commit/50ab325bb5d32dcbba4af3fa96a9460913d9246c))
* **ploeg:** grade rework rather than review and say which inputs a grade missed ([8182249](https://forgejo.webgrip.dev/webgrip/unfold/commit/8182249e382cb05f6fa65204fa8966065c3f1943))
* **ploeg:** read a writer's branch on the forge before it counts as no change or updated ([7fc6f8d](https://forgejo.webgrip.dev/webgrip/unfold/commit/7fc6f8d988e5d7d68107e84be128f777f231353f)), references [#177](https://forgejo.webgrip.dev/webgrip/unfold/issues/177)
* **ploeg:** settle stopped Work Items whose tracker task was closed ([4dd9849](https://forgejo.webgrip.dev/webgrip/unfold/commit/4dd98497675c9973ed43100262a020d3b9b40775))
* **site:** name the configuration each security and execution claim needs ([3ddf79e](https://forgejo.webgrip.dev/webgrip/unfold/commit/3ddf79e5a2c96ebf161206b67430fe355f991390))
* **unfold:** describe grade formula 2026.3 and show the inputs a grade missed ([4a81f47](https://forgejo.webgrip.dev/webgrip/unfold/commit/4a81f472e6ce8a64a00ecd993d64b1d7c83e6278))
* **unfold:** point the extension's repository links at webgrip/unfold ([43e07e9](https://forgejo.webgrip.dev/webgrip/unfold/commit/43e07e927ff481a22c3e22d916ed576f69be54a8))

### Docs

* record that Unfold pins Ploeg and releases only Unfold ([1bca2ac](https://forgejo.webgrip.dev/webgrip/unfold/commit/1bca2ac69bafccf733c3d1ab1d513da0d457183a))

### Build

* **ploeg:** consume Ploeg from ploeg-hq/ploeg as a submodule pinned at v0.1.0 ([26a27b6](https://forgejo.webgrip.dev/webgrip/unfold/commit/26a27b683dacf0ebd9ce8d2fa706682d8fd714d3))

### CI

* **release:** stop versioning and publishing Ploeg from Unfold ([52a7c89](https://forgejo.webgrip.dev/webgrip/unfold/commit/52a7c89f354213be7fa1a723fbe84816afdbae1c))

### Style

* **ploeg:** gofmt the changesRequestedBy query concatenation ([25c0d26](https://forgejo.webgrip.dev/webgrip/unfold/commit/25c0d268e078165073804407048cec61f6523600))

### Internal

* **release:** unfold-site-v0.1.0-rc.9 [skip ci] ([13b17d5](https://forgejo.webgrip.dev/webgrip/unfold/commit/13b17d5c4e28b46169aab6b12621fb5ba8577345))
* **site:** re-record the demo replay with the grade formula 2026.3 card model ([20be172](https://forgejo.webgrip.dev/webgrip/unfold/commit/20be1721c2902e2a1b7c586289ee52701334a46f))

## [unfold-v0.4.0-rc.35](https://forgejo.webgrip.dev/webgrip/unfold/compare/unfold-v0.4.0-rc.34...unfold-v0.4.0-rc.35) (2026-10-03)

### Added

* **site:** deploy candidates to staging.unfoldhq.dev and manage the zone as code ([f6c5e9e](https://forgejo.webgrip.dev/webgrip/unfold/commit/f6c5e9e5900a190644b1afdf4f18a50df9287417))
* **site:** give Unfold an expressive folded-paper identity ([5a16666](https://forgejo.webgrip.dev/webgrip/unfold/commit/5a166663a931f34d6892be843f9275b75b2b6232))
* **site:** redesign Unfold around inspectable agent work ([5e75e71](https://forgejo.webgrip.dev/webgrip/unfold/commit/5e75e7195f6b637d4463e76c140b8a9cf9d852c3))
* **site:** serve the site on unfoldhq.dev ([8a3915b](https://forgejo.webgrip.dev/webgrip/unfold/commit/8a3915b474e4a85a738c479417c306d5a83cd8d0))

### Fixed

* **ploeg:** back off managed accounts the sweep cannot resolve ([15924f7](https://forgejo.webgrip.dev/webgrip/unfold/commit/15924f7f9fde221b976a02f9a013820df27ee6a4))
* **ploeg:** decode forge proxy paths and limit them to what the Role needs ([1be4a65](https://forgejo.webgrip.dev/webgrip/unfold/commit/1be4a650c6b39f85651fb4f80e0363996699ea33))
* **ploeg:** keep edited but unpublished writer work from counting as done ([2392960](https://forgejo.webgrip.dev/webgrip/unfold/commit/2392960e1a7736a98d59cef9839857e51e9b96b8))
* **ploeg:** replay a finished outcome that carries a checkpoint ([ed241ee](https://forgejo.webgrip.dev/webgrip/unfold/commit/ed241eed7add9607805a92fbcb22573aa815b11c))
* **ploeg:** route ClickUp work by tags and withdraw it when the task closes ([0330f0f](https://forgejo.webgrip.dev/webgrip/unfold/commit/0330f0f5038d3a2b4618c3323216559a79d59ce1))
* **ploeg:** settle late gateway charges after the first settlement ([746ad48](https://forgejo.webgrip.dev/webgrip/unfold/commit/746ad482094a6fbf0ec508fb7396d644280ef4de))
* **ploeg:** tie per-Run forge tokens to a live Lease and always revoke them ([da2f3a2](https://forgejo.webgrip.dev/webgrip/unfold/commit/da2f3a2240323bde57f9b714fd5bd392865ee9d2))
* **release:** publish to webgrip/unfold and fail fast on dead addresses ([4637099](https://forgejo.webgrip.dev/webgrip/unfold/commit/4637099afba5c122512f8647fd72a6a8112ff96a))
* **unfold:** list every waiting Work Item on Now or say how many are hidden ([7d5331a](https://forgejo.webgrip.dev/webgrip/unfold/commit/7d5331a7cb03563482ccf9c973c635bff0796767))
* **unfold:** say what actually happened when a session completes ([04e6ccf](https://forgejo.webgrip.dev/webgrip/unfold/commit/04e6ccf10b09419bb2107890f3149b1a978152e8))
* **unfold:** serve the agent host's WebSocket through ws ([5b20156](https://forgejo.webgrip.dev/webgrip/unfold/commit/5b20156eae83455bd4fedd004ef8897f78ba14df))
* **unfold:** stop the whole process tree before capturing a candidate ([4d279ab](https://forgejo.webgrip.dev/webgrip/unfold/commit/4d279abbc1875ad0faaf1c390e87fe1aaf64d360))

### Docs

* **ploeg:** propose ADR-0059 delivery facts come from the forge ([6169e40](https://forgejo.webgrip.dev/webgrip/unfold/commit/6169e403a8c3e6f3a1e5448b2e84073b27d1f873)), references [#152](https://forgejo.webgrip.dev/webgrip/unfold/issues/152)
* **ploeg:** propose ADR-0060 durable webhook inbox and publication outbox ([28876b5](https://forgejo.webgrip.dev/webgrip/unfold/commit/28876b5513a6cf32173ba34130d154f801655569))
* **site:** preserve design research and reusable product-site skill ([0d3e30d](https://forgejo.webgrip.dev/webgrip/unfold/commit/0d3e30d5d3260cd54b14f75a6a6f102a9ea79cee))

### Tests

* **ploeg:** make the claimable-index plan test independent of statistics ([0d70c43](https://forgejo.webgrip.dev/webgrip/unfold/commit/0d70c43441ee5f9dddfda24ec5203eee0084cd7f))

### Internal

* **ploeg:** retire the legacy Compose demo ([58beb86](https://forgejo.webgrip.dev/webgrip/unfold/commit/58beb86f86d9df92b989fc107fbd8d1c33ef87a6))
* **site:** re-record the demo replay with complete Now waiting lists ([f29fb23](https://forgejo.webgrip.dev/webgrip/unfold/commit/f29fb236f9389cfc5e13928b16a49d6ae2764159))
* **site:** re-record the demo replay with the truthful completion message ([26b8d85](https://forgejo.webgrip.dev/webgrip/unfold/commit/26b8d85f15dd09149013301ce6a9ebdae77d90c7))

## [unfold-v0.4.0-rc.34](https://forgejo.webgrip.dev/webgrip/unfold/compare/unfold-v0.4.0-rc.33...unfold-v0.4.0-rc.34) (2026-10-03)

### Fixed

* **ploeg:** keep a writer's problem and solution when Claude stdout is malformed ([f77d8d3](https://forgejo.webgrip.dev/webgrip/unfold/commit/f77d8d3ac39d4f241ccc1886a4a6dda03b4f9ad5))
* **unfold:** record CVE-2026-93748 as not affecting the agent image ([211e857](https://forgejo.webgrip.dev/webgrip/unfold/commit/211e857e40331130ab106bdc9a37620d491e8eb8))
* **unfold:** stop every release from staling the demo replay ([6af67f3](https://forgejo.webgrip.dev/webgrip/unfold/commit/6af67f3932e19771eee3b58eaedc03889ee8dd42))

### Internal

* **release:** unfold-site-v0.1.0-rc.8 [skip ci] ([54f7336](https://forgejo.webgrip.dev/webgrip/unfold/commit/54f733681486ce2f3b5a352d375e1dd4e60a0a59))

## [unfold-v0.4.0-rc.33](https://forgejo.webgrip.dev/webgrip/unfold/compare/unfold-v0.4.0-rc.32...unfold-v0.4.0-rc.33) (2026-10-03)

### Dependencies

* **deps:** update node.js ( 98fb607 ➔ baf0afb ) ([1131b48](https://forgejo.webgrip.dev/webgrip/unfold/commit/1131b48c21210ad92ef4f946690f6d7cde41b4a9))

### Added

* **deps:** update dependency three ( 0.165.0 ➔ 0.186.1 ) ([df8a166](https://forgejo.webgrip.dev/webgrip/unfold/commit/df8a16685e9250fa5022847b58a94cb42842a096))
* **ploeg:** crack and mend run cards through human-confirmed attribution ([cce1dd2](https://forgejo.webgrip.dev/webgrip/unfold/commit/cce1dd2d3d6dd5003127abb4f4863e270edbbbfd))
* **ploeg:** give Run cards a rarity measured by their challenge ([d98d4d7](https://forgejo.webgrip.dev/webgrip/unfold/commit/d98d4d7986df26271d00785eff88ddbc21b659c8))
* **ploeg:** keep one run card comment with a card image on the pull request ([897a087](https://forgejo.webgrip.dev/webgrip/unfold/commit/897a087aac71923baa7c23b9deb522a15b6f3e4c))
* **ploeg:** let registered GitLab targets pass the readiness gate ([58ae4d3](https://forgejo.webgrip.dev/webgrip/unfold/commit/58ae4d38d3ee6aba3bfe2d1d052830269cbb6e2e))
* **ploeg:** list run cards by roster login for binders and packs ([4cf6713](https://forgejo.webgrip.dev/webgrip/unfold/commit/4cf6713bb5163f56893828acde747a352f4d2ceb))
* **ploeg:** put pull request, CI and change-shape figures on the Run card ([764feda](https://forgejo.webgrip.dev/webgrip/unfold/commit/764feda1cdd93faf4dfbf6ec2467d48cfa3973c3))
* **ploeg:** put tracker flow, queue and delivery timings on the Run card ([65afed7](https://forgejo.webgrip.dev/webgrip/unfold/commit/65afed7fdb90cc94e34aa120f6f838a88f0fc71b))
* **ploeg:** read epics from tracker relations and give run cards a set ([fec31b4](https://forgejo.webgrip.dev/webgrip/unfold/commit/fec31b4b8a01077b8aa2297684833c393e3c611c))
* **site:** serve the recorded Unfold replay at /demo ([66ffe3f](https://forgejo.webgrip.dev/webgrip/unfold/commit/66ffe3faa75e609ab5814870effdf8f1c54855b8)), references [#app](https://forgejo.webgrip.dev/webgrip/unfold/issues/app)
* **site:** turn the site into a landing page with sign-ups, pricing and the demo ([3c19c4d](https://forgejo.webgrip.dev/webgrip/unfold/commit/3c19c4d349a16d6e54cde3e3f397f22bddc6a340))
* **unfold:** add card themes and a card designer with generated art ([f5977db](https://forgejo.webgrip.dev/webgrip/unfold/commit/f5977dbd7265562e55135541916685ee2f513ec2))
* **unfold:** add holo, loot, arcade, ticker and patch card skins ([b9725a3](https://forgejo.webgrip.dev/webgrip/unfold/commit/b9725a347625c36b2eddf7c818949af6113a2cac))
* **unfold:** add recording seams to the deterministic demo ([611972d](https://forgejo.webgrip.dev/webgrip/unfold/commit/611972dcccfe112ec3d6ee97ab063d3b2d7d98e5))
* **unfold:** collect run cards in a private binder and rip sprint packs ([d86acab](https://forgejo.webgrip.dev/webgrip/unfold/commit/d86acab5c7877506dba2bc554ca8a72d8044ad8c)), references [#binder](https://forgejo.webgrip.dev/webgrip/unfold/issues/binder) [#packs](https://forgejo.webgrip.dev/webgrip/unfold/issues/packs) [#season](https://forgejo.webgrip.dev/webgrip/unfold/issues/season)
* **unfold:** give Run cards an inner world you can tilt, flatten and decorate ([c38e543](https://forgejo.webgrip.dev/webgrip/unfold/commit/c38e5433743d2b5c2a49fc59d5481000c8000650))
* **unfold:** link a Run by URL, show Grafana links, announce the URL to Ploeg ([65b1e71](https://forgejo.webgrip.dev/webgrip/unfold/commit/65b1e71702aa760501edc8eceac0dd7076145a63))
* **unfold:** play run card moments through an effects director ([84f850b](https://forgejo.webgrip.dev/webgrip/unfold/commit/84f850b01db0a4f09edf66518f2dbf514e4982d0))
* **unfold:** record the deterministic demo and replay it in the browser ([ffe10ed](https://forgejo.webgrip.dev/webgrip/unfold/commit/ffe10ed4549383106017f30cab2cd9cd2d87233f))
* **unfold:** render run cards in 3D with the forge skin ([2a50752](https://forgejo.webgrip.dev/webgrip/unfold/commit/2a507527d2f12a394f0789b392f26c816cba2b53))
* **unfold:** show flow, review, CI and change KPIs on Run cards ([4a70b87](https://forgejo.webgrip.dev/webgrip/unfold/commit/4a70b8786f6b1cf8e78e7a5dcadc92751f82b179))
* **unfold:** show gates, cracks and sets on run cards and trace bugs ([7004c6f](https://forgejo.webgrip.dev/webgrip/unfold/commit/7004c6ff827cc1a6a0b0888a0e44b98697f9d86b))
* **unfold:** show Run card rarity with frame metal and a reveal ceremony ([9c912ae](https://forgejo.webgrip.dev/webgrip/unfold/commit/9c912aee7d0d1ccd78b57a5a4a3b3aec160535cd)), references [#121](https://forgejo.webgrip.dev/webgrip/unfold/issues/121)

### Fixed

* **agent:** update opencode ( 1.18.33 ➔ 1.18.34 ) ([86006b3](https://forgejo.webgrip.dev/webgrip/unfold/commit/86006b306abd674962d74f943ecf46ae551eb992))
* **deps:** update dependency @types/node ( 24.19.0 ➔ 24.19.1 ) ([4c72d18](https://forgejo.webgrip.dev/webgrip/unfold/commit/4c72d18c79f9bd2398c9afc46c5a82744705786a))
* **ploeg:** bound request body reads and idle connections in ploegd ([fdb59cb](https://forgejo.webgrip.dev/webgrip/unfold/commit/fdb59cbe62f4577700a2a58af76d74d1053aeb2b))
* **ploeg:** close a Shift and settle its Work Item in one transaction ([98f58d4](https://forgejo.webgrip.dev/webgrip/unfold/commit/98f58d4bb10bdabb0ff0c06c8a1679167057bf85))
* **ploeg:** fail a reviewer that cannot fetch the branch under review ([1b0b544](https://forgejo.webgrip.dev/webgrip/unfold/commit/1b0b544e1c2b841aa28a8436716e5eee70547281))
* **ploeg:** keep a valid Claude review when its stdout is malformed ([4497c86](https://forgejo.webgrip.dev/webgrip/unfold/commit/4497c8616445dfe045dd85323aad26cfe098ac95))
* **ploeg:** keep the legacy claim off Work Items a live Shift owns ([c31b804](https://forgejo.webgrip.dev/webgrip/unfold/commit/c31b804c2ba777fb7f6bc589b9d364fb62e23977))
* **ploeg:** read every page of Forgejo pull requests and GitLab checks ([1d6e004](https://forgejo.webgrip.dev/webgrip/unfold/commit/1d6e0045e4194b6e705d786c541c92df825e8c32))
* **ploeg:** reject tracker webhooks when no signing secret is set ([347bc77](https://forgejo.webgrip.dev/webgrip/unfold/commit/347bc775c4c2e6e0c79b83036df50b94fd9d80ab))
* **ploeg:** serialize schema migrations with an advisory lock ([68891e4](https://forgejo.webgrip.dev/webgrip/unfold/commit/68891e44ee7e34c699be7211e8001f5a57396abe))
* **ploeg:** show verification from the worker's record, not agent prose ([7bfd8a3](https://forgejo.webgrip.dev/webgrip/unfold/commit/7bfd8a34fb05feda20be8f0154b7906129117f0e))
* **ploeg:** verify forge webhook signatures before recording the delivery ([86477f7](https://forgejo.webgrip.dev/webgrip/unfold/commit/86477f7ded3ed2a54060e47287a3e6881f754f4b))
* **site:** cap the sign-up body by bytes read, not Content-Length ([4769b7a](https://forgejo.webgrip.dev/webgrip/unfold/commit/4769b7a35caeda1121fdcf15c3df11c94bcbdf4f))
* **site:** link the replay at /demo/ once its recording exists, and renumber the sign-up ADR ([dfd0f28](https://forgejo.webgrip.dev/webgrip/unfold/commit/dfd0f2832d21832ee8268083525cd49497ccbed6)), references [#122](https://forgejo.webgrip.dev/webgrip/unfold/issues/122)
* **site:** set the sign-up database id ([00b36b6](https://forgejo.webgrip.dev/webgrip/unfold/commit/00b36b66f84676317a4451c4cf10820ab4f46dc5))
* **unfold:** accept the editor's synced core imports in the source check ([de477de](https://forgejo.webgrip.dev/webgrip/unfold/commit/de477de995ea060b0e811604ba3641836e9948bf))
* **unfold:** bind OIDC sign-in and account links to the starting browser ([9998836](https://forgejo.webgrip.dev/webgrip/unfold/commit/999883628f2bd8ba69018ed123d8357727b6a10b))
* **unfold:** clear a stale Run notice on every Work navigation ([fac09aa](https://forgejo.webgrip.dev/webgrip/unfold/commit/fac09aa2ca639555d455c442f2377a9bf2f8af68))
* **unfold:** keep health probes constant-cost and page event replay ([850c3fb](https://forgejo.webgrip.dev/webgrip/unfold/commit/850c3fbba75fe19e6cc069cdba3ddbef5164ebda))
* **unfold:** let the forge stage fill the Run card page head ([b20d049](https://forgejo.webgrip.dev/webgrip/unfold/commit/b20d0493dc1778dd8f9c76386654d592a59aa9ad))
* **unfold:** match checkouts by forge host and full repo path ([255dbf4](https://forgejo.webgrip.dev/webgrip/unfold/commit/255dbf4a3777ab2294116a245bcac28d6bc4b402))
* **unfold:** pin a cold sandbox's base and require a healthy workspace ([84f4dd9](https://forgejo.webgrip.dev/webgrip/unfold/commit/84f4dd980a89308d1c4ace78988ff4755ca62163))
* **unfold:** pin three back to the vendored 0.165.0 and keep Renovate off it ([7baa63a](https://forgejo.webgrip.dev/webgrip/unfold/commit/7baa63afe9ed9c83dd922214da99b5358ce65d49)), references [#119](https://forgejo.webgrip.dev/webgrip/unfold/issues/119)
* **unfold:** pin three to the vendored 0.186.1 ([10bb764](https://forgejo.webgrip.dev/webgrip/unfold/commit/10bb76477da7aee9929d8815f7194091261cabf6)), closes [#119](https://forgejo.webgrip.dev/webgrip/unfold/issues/119) [#126](https://forgejo.webgrip.dev/webgrip/unfold/issues/126), references [#122](https://forgejo.webgrip.dev/webgrip/unfold/issues/122)
* **unfold:** refuse the inner world's route in the hosted demo replay ([7897f61](https://forgejo.webgrip.dev/webgrip/unfold/commit/7897f61e2148f863f3f149e4df21308dd142c6ec)), references [#122](https://forgejo.webgrip.dev/webgrip/unfold/issues/122)
* **unfold:** send the ClickUp token exchange in the request body ([0f827b3](https://forgejo.webgrip.dev/webgrip/unfold/commit/0f827b3e0d549cb406cf2055bbb2b15c13268474))
* **unfold:** vendor three.js 0.186.1 to match the pinned devDependency ([23e63c2](https://forgejo.webgrip.dev/webgrip/unfold/commit/23e63c24e7e7f1c7bf2acc36cdad555ffc7b7a4f)), references [#119](https://forgejo.webgrip.dev/webgrip/unfold/issues/119)

### Changed

* **unfold:** resolve static assets relative to the page ([3465022](https://forgejo.webgrip.dev/webgrip/unfold/commit/34650223b194ae5f58765a8e57d1d1d2d928b041))

### Docs

* date the hosted replay pages in UTC ([60340b1](https://forgejo.webgrip.dev/webgrip/unfold/commit/60340b1603cbd1fd2662d736968bd5835adaa948))
* point commit references at the rewritten history ([2bb2e6b](https://forgejo.webgrip.dev/webgrip/unfold/commit/2bb2e6b3595bae1be8ca9fe30e4117330a0c47c2))
* **unfold:** describe the hosted replay of the demo ([b642cd5](https://forgejo.webgrip.dev/webgrip/unfold/commit/b642cd528a24928c7c6843976615580e840394d6))

### Tests

* **unfold:** match the work page browser checks to the Run card page head ([a58e682](https://forgejo.webgrip.dev/webgrip/unfold/commit/a58e68293bab414735053c5be1c0f03bf73a3cc9))

### CI

* **deps:** update all non-major dependencies ([6ca1a9a](https://forgejo.webgrip.dev/webgrip/unfold/commit/6ca1a9a1434ff79b87a1342c7898b7dbdb0a9def))

### Internal

* neutralise employer-specific fixtures and docs ([09a54f7](https://forgejo.webgrip.dev/webgrip/unfold/commit/09a54f7ca0db1d41924f6fb114b0d5eac164e4e1))
* **site:** re-record the demo replay with Run card KPIs ([39e500c](https://forgejo.webgrip.dev/webgrip/unfold/commit/39e500c64c842f09123c94ade919797918410f9a))

## [unfold-v0.4.0-rc.32](https://forgejo.webgrip.dev/webgrip/glide/compare/unfold-v0.4.0-rc.31...unfold-v0.4.0-rc.32) (2026-10-01)

### Added

* **ploeg:** grade run cards and record delivery gates ([f24a4cd](https://forgejo.webgrip.dev/webgrip/glide/commit/f24a4cdab1c2b8690299961daa26f60d7d76aae9))
* **unfold:** make the Run card the head of the Work Item page ([bd35bb3](https://forgejo.webgrip.dev/webgrip/glide/commit/bd35bb3113119e24a200bddaf8d3ab377fc560f4))

### Docs

* record the run cards research, concept and works council pack ([df6a47a](https://forgejo.webgrip.dev/webgrip/glide/commit/df6a47a9f59bc4c7a43699a9122365403e6a5cd8))

### Internal

* **release:** unfold-site-v0.1.0-rc.7 [skip ci] ([665dc63](https://forgejo.webgrip.dev/webgrip/glide/commit/665dc6382e6eb25d92102ae7ffe28a113be5df8c))

## [unfold-v0.4.0-rc.31](https://forgejo.webgrip.dev/webgrip/glide/compare/unfold-v0.4.0-rc.30...unfold-v0.4.0-rc.31) (2026-10-01)

### Added

* **site:** apply the Unfold brand ([b3dc446](https://forgejo.webgrip.dev/webgrip/glide/commit/b3dc44634b437ae1e70d08a617e4292cfa325c3d))

### Fixed

* **ploeg:** link the Loop dashboard by its real uid and new title ([f03a536](https://forgejo.webgrip.dev/webgrip/glide/commit/f03a5368f3b36f065f4f6e786c013534944b52ef))

### Internal

* **release:** unfold-site-v0.1.0-rc.6 [skip ci] ([bf72bf1](https://forgejo.webgrip.dev/webgrip/glide/commit/bf72bf1a2d0463043f0549ea45ee2fc3a1de7dc4))

## [unfold-v0.4.0-rc.30](https://forgejo.webgrip.dev/webgrip/glide/compare/unfold-v0.4.0-rc.29...unfold-v0.4.0-rc.30) (2026-10-01)

### Added

* **unfold:** check out a Work Item's branch from the browser or VS Code ([b7be09a](https://forgejo.webgrip.dev/webgrip/glide/commit/b7be09a4ba881cff88c8dd3b823a3c90ab7aa88a))

### Fixed

* **unfold:** show queued and running Ploeg work in Linked Tasks ([e85a4f8](https://forgejo.webgrip.dev/webgrip/glide/commit/e85a4f82d99df7ba3d0a9d7eac2936c20e4ba787))

### Changed

* rename the product from Glide to Unfold ([b627d5f](https://forgejo.webgrip.dev/webgrip/glide/commit/b627d5f5316213a08bca393481b979cfd9d89168))

### Tests

* **unfold:** match the checkout title to the renamed fixture branch ([bf2e225](https://forgejo.webgrip.dev/webgrip/glide/commit/bf2e225cc39a0206049c8c32f49d1453e5676627)), references [#100](https://forgejo.webgrip.dev/webgrip/glide/issues/100)

### Internal

* **release:** restore the rc.29 release metadata that the rename reverted ([6a522a8](https://forgejo.webgrip.dev/webgrip/glide/commit/6a522a8520e812a2ef6afad8e37990e01d3fb5a1))

## [glide-v0.4.0-rc.29](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.4.0-rc.28...glide-v0.4.0-rc.29) (2026-10-01)

### Added

* **ploeg:** report a running Run's usage so far on its card ([ba7027e](https://forgejo.webgrip.dev/webgrip/glide/commit/ba7027e5bcc9f7a6ecc57948dc69271729a39ccb))
* **unfold:** give the editor the browser's vocabulary, formatter and status tones ([6477888](https://forgejo.webgrip.dev/webgrip/glide/commit/647788840535f58bd533b944faa643ff153b2486)), references [#work](https://forgejo.webgrip.dev/webgrip/glide/issues/work) [#ploeg](https://forgejo.webgrip.dev/webgrip/glide/issues/ploeg)
* **unfold:** lead the editor's Work Item panel with state, reason and next action ([1a4d6b8](https://forgejo.webgrip.dev/webgrip/glide/commit/1a4d6b8aa34c1604ee40ca84bde886ca38cea910))
* **unfold:** name a tracker token without write access when a hand-off fails ([ada2ecd](https://forgejo.webgrip.dev/webgrip/glide/commit/ada2ecd05ea76babd33af46605f2b679980a6fe4))
* **unfold:** open the editor sidebar on Now ([9dc87ff](https://forgejo.webgrip.dev/webgrip/glide/commit/9dc87ff2fab9333ed754f1eeefae65a41871fc4e))
* **unfold:** show cost, tokens and run time so far on a running Run's card ([d33fc71](https://forgejo.webgrip.dev/webgrip/glide/commit/d33fc715f8215d185686566ed6edce6f965a7feb))

### Docs

* **ploeg:** regenerate the configuration reference for the new runner and dind images ([5718bbe](https://forgejo.webgrip.dev/webgrip/glide/commit/5718bbe50ec33f47af10083f1bfe7eaa1d4c4e8c))
* **unfold:** list the editor redesign's follow-ups in ADR-0027 ([799a08c](https://forgejo.webgrip.dev/webgrip/glide/commit/799a08ccb1ca7fcab4ac053cee6080adbcae4894))

### Build

* **site:** move the Worker compatibility date to 2026-09-26 ([a90527e](https://forgejo.webgrip.dev/webgrip/glide/commit/a90527e1a8d34c2b61e5447d5ca420f1c343cb65))

### Internal

* **renovate:** extend the shared preset at v1.12.2 and regenerate Ploeg's configuration reference on chart bumps ([fb1c713](https://forgejo.webgrip.dev/webgrip/glide/commit/fb1c713714c69f0bbc4bc9fb96b12730faa9970e))

## [glide-v0.4.0-rc.28](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.4.0-rc.27...glide-v0.4.0-rc.28) (2026-10-01)

### Added

* **deps:** update all non-major dependencies ([df62371](https://forgejo.webgrip.dev/webgrip/glide/commit/df623712e2cd1f9d124e071894bf843207c711bd))

### Fixed

* **build:** lock openspec once so mise stops reinstalling it ([a4aeb47](https://forgejo.webgrip.dev/webgrip/glide/commit/a4aeb4721b70e98e7b98ac9623d541d062744ef7))
* **unfold:** run the extension tests without Node's module-type notice ([770ae9e](https://forgejo.webgrip.dev/webgrip/glide/commit/770ae9e5fbebc07ba2f8dbf3776a1bf279729401))

### Build

* **ploeg:** name the Go toolchain and move images to Debian 13 ([fe9660f](https://forgejo.webgrip.dev/webgrip/glide/commit/fe9660f9c287a9b92450c4513320f2c96829ce44))
* **release:** keep the released agent image references on the release version ([eb1b8e2](https://forgejo.webgrip.dev/webgrip/glide/commit/eb1b8e28d6d33093cc3f35bf3cfce25271c2232b))
* **site:** clear the wrangler advisories and move to TypeScript 6 and pnpm 12 ([d3ab4a1](https://forgejo.webgrip.dev/webgrip/glide/commit/d3ab4a104eaa3c297e7713c64fcdd5c36a852f21))
* **unfold:** build both images on Node 24.21.0 ([e5b40b8](https://forgejo.webgrip.dev/webgrip/glide/commit/e5b40b83fed977abd7ff581762476d3a8a4abf76))
* **unfold:** package the extension with vsce 4 ([b9323a3](https://forgejo.webgrip.dev/webgrip/glide/commit/b9323a359365a019d2a10393ff9596577dab3743))

### Internal

* load marked 18 in the landscape build and point the domain generator at uv ([03f11ce](https://forgejo.webgrip.dev/webgrip/glide/commit/03f11ce983e82b39647cda4e412361b268f3539c))
* **release:** glide-site-v0.1.0-rc.5 [skip ci] ([2dffb21](https://forgejo.webgrip.dev/webgrip/glide/commit/2dffb215d162ce166da275e75cbb2d6255530eb5))

## [glide-v0.4.0-rc.27](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.4.0-rc.26...glide-v0.4.0-rc.27) (2026-10-01)

### Added

* **ploeg:** assemble a run card per work item from stored facts ([9ddaf41](https://forgejo.webgrip.dev/webgrip/glide/commit/9ddaf41e3e2523db7d2103dbe719129cf77b68ac))
* **ploeg:** learn where a merged change is deployed ([94927a2](https://forgejo.webgrip.dev/webgrip/glide/commit/94927a2f23063648b84f6a6b59fe8ae76caf8c60))
* **unfold:** show days live and the finish ladder on run cards ([40967f6](https://forgejo.webgrip.dev/webgrip/glide/commit/40967f652437ea6cdfc24bf58ec1fc2faa18e953))

## [glide-v0.4.0-rc.26](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.4.0-rc.25...glide-v0.4.0-rc.26) (2026-10-01)

### Added

* **unfold:** show a run card on the work item page ([ae05d26](https://forgejo.webgrip.dev/webgrip/glide/commit/ae05d26173673f5de8199cd90bc30f0be62a920b))

### Fixed

* **deps:** update pnpm ( 11.28.1 ➔ 11.28.2 ) ([badcd13](https://forgejo.webgrip.dev/webgrip/glide/commit/badcd13e58e807c8b3e92b4a6f1ee8701ee6706a))

### Internal

* **release:** glide-site-v0.1.0-rc.4 [skip ci] ([bfe04df](https://forgejo.webgrip.dev/webgrip/glide/commit/bfe04df4d33e2d940ebd3a23bc8507b29730d462))

## [glide-v0.4.0-rc.25](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.4.0-rc.24...glide-v0.4.0-rc.25) (2026-10-01)

### Added

* **deps:** update all non-major dependencies ([904208d](https://forgejo.webgrip.dev/webgrip/glide/commit/904208d3bf6e3c7f93fe3b983ee350cf8092f24a))
* **ploeg:** keep every run usage figure and merge and review fact ([35d62fd](https://forgejo.webgrip.dev/webgrip/glide/commit/35d62fd1960ee3b23f9b24f7029e9a947ac82a5e))

### Fixed

* **release:** drop the duplicate rc.24 release commit ([479893c](https://forgejo.webgrip.dev/webgrip/glide/commit/479893c9196f66c4d7e516c69f746aa95ebf7090)), references [#73](https://forgejo.webgrip.dev/webgrip/glide/issues/73) [73-#75](https://forgejo.webgrip.dev/73-/issues/75)
* **release:** drop the second duplicate rc.24 release commit ([72cf34d](https://forgejo.webgrip.dev/webgrip/glide/commit/72cf34d129887caddb0fa0a419d0f52d58fcfdaf))
* **unfold:** keep each AHP client to its own user's sessions ([5ecd610](https://forgejo.webgrip.dev/webgrip/glide/commit/5ecd610e2548802f65c08ac2e26d18564c5b381c))
* **unfold:** let VS Code 1.140 create and follow an AHP session ([78d4d6f](https://forgejo.webgrip.dev/webgrip/glide/commit/78d4d6fd29c9e5a19a8677a0ca0104a71a615231))

### Docs

* record the VS Code 1.140 fit and the shared-surface plan ([a77b19a](https://forgejo.webgrip.dev/webgrip/glide/commit/a77b19a6e572222946eb47ee3ff60f9c4f2ea22f))

### Internal

* **release:** glide-site-v0.1.0-rc.3 [skip ci] ([fff1611](https://forgejo.webgrip.dev/webgrip/glide/commit/fff16112f97f67530d414badacffdefe2538d51b))
* **release:** glide-v0.4.0-rc.24 [skip ci] ([878869a](https://forgejo.webgrip.dev/webgrip/glide/commit/878869a78985c79ab137daee98208391deb1ee6e))
* **release:** glide-v0.4.0-rc.24 [skip ci] ([95bdf58](https://forgejo.webgrip.dev/webgrip/glide/commit/95bdf584a09b9b14539a7b6c3290a60d93bf8e8e))

## [glide-v0.4.0-rc.24](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.4.0-rc.23...glide-v0.4.0-rc.24) (2026-10-01)

### Added

* **deps:** update pnpm ( 11.8.0 ➔ 11.11.0 ) [security] ([cfd3112](https://forgejo.webgrip.dev/webgrip/glide/commit/cfd31122d8a0dd3b03e41ca07451808eaa152cfe))

### Fixed

* **agent:** update opencode ( 1.18.30 ➔ 1.18.33 ) ([a2bbf4c](https://forgejo.webgrip.dev/webgrip/glide/commit/a2bbf4cd8c6417be7558ae2d575786ea17c0a5c9))
* **unfold:** read the probed OpenCode version from the agent image pin ([9eadab5](https://forgejo.webgrip.dev/webgrip/glide/commit/9eadab506ea929f21ced805fc1d98edf50833fbb))

### Internal

* **release:** glide-site-v0.1.0-rc.2 [skip ci] ([41a95d5](https://forgejo.webgrip.dev/webgrip/glide/commit/41a95d58a8885bfdf550c55faf9a60af05b5252e))

## [glide-v0.4.0-rc.23](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.4.0-rc.22...glide-v0.4.0-rc.23) (2026-10-01)

### Added

* **deps:** update all non-major dependencies ([bdf17f1](https://forgejo.webgrip.dev/webgrip/glide/commit/bdf17f13970bb01f11c31ff3e711049961c7eaaf))
* **deps:** update dependency astro ( 7.1.6 ➔ 7.2.8 ) [security] ([7054760](https://forgejo.webgrip.dev/webgrip/glide/commit/70547607e03db9344fec38c92b02bcfc7b6d90f0))

### Fixed

* **ci:** bound the Markdown fence match and keep the mise cache warm ([5fa31c5](https://forgejo.webgrip.dev/webgrip/glide/commit/5fa31c5b5d4a22eed788c6191710a46b1edf8777))
* **ci:** never skip the site gate job so Glide releases publish ([f7d0a81](https://forgejo.webgrip.dev/webgrip/glide/commit/f7d0a8190a7c087b1a80236e7c7ace2d95771dbb))

### Docs

* **ploeg:** accept ADR-0043 and ADR-0044 ([2621b2e](https://forgejo.webgrip.dev/webgrip/glide/commit/2621b2efb008f98c69bf58dd22bdb06ba6d1acfc))

### Internal

* **release:** glide-site-v0.1.0-rc.1 [skip ci] ([f0ada8c](https://forgejo.webgrip.dev/webgrip/glide/commit/f0ada8cb5c3e7df86315a2a4ff2e898f487b4613))

## [glide-v0.4.0-rc.22](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.4.0-rc.21...glide-v0.4.0-rc.22) (2026-10-01)

### Added

* **deps:** update all non-major dependencies ([99f5867](https://forgejo.webgrip.dev/webgrip/glide/commit/99f58670ec9a1ed8dfe0657c79e5b625329f6833))
* **site:** add the bilingual static marketing site scaffold ([2309159](https://forgejo.webgrip.dev/webgrip/glide/commit/2309159b446d8bf1fce2a16f6de628f7d0807d7c))
* **site:** serve from workers.dev and stay unindexed there ([75316ae](https://forgejo.webgrip.dev/webgrip/glide/commit/75316ae8876feee06c2fd2b6687abf1b2ff30870))
* **site:** take the site URL from the build environment ([c4a33e1](https://forgejo.webgrip.dev/webgrip/glide/commit/c4a33e199abf8f17966184d5189a04cb8f9d5bbf))
* **unfold:** show a task's Ploeg status and hand it off from the Tasks page ([7ee10ba](https://forgejo.webgrip.dev/webgrip/glide/commit/7ee10baa1130c7948f77bea9fd7656481d6756c0))

### Fixed

* **ploeg:** point the usage report links at dashboards that exist ([3885307](https://forgejo.webgrip.dev/webgrip/glide/commit/3885307c12803bd87679634cebcfe27617a91417))
* **unfold:** reap an orphaned bridge whose pid arrives after its supervisor exits ([9a39191](https://forgejo.webgrip.dev/webgrip/glide/commit/9a391916a94a45b0f96fb813218e886c58be3431))

### Docs

* **site:** record the separate site release and deploy in ADR-0012 ([7df82f9](https://forgejo.webgrip.dev/webgrip/glide/commit/7df82f935487ba86e92d8df734dfa5c61f6280a6))

### Tests

* **unfold:** scale the pathological-input time bounds with the runner load ([fa422d5](https://forgejo.webgrip.dev/webgrip/glide/commit/fa422d5d521454156732fa5f6f30f27ecedb6468))

### Build

* pin Go 1.26.8 for the updated golang.org/x modules ([cc2d9f8](https://forgejo.webgrip.dev/webgrip/glide/commit/cc2d9f8b5919f33d0a5f18d30ec261e5d887b677))
* **release:** keep site commits out of the Glide version ([f12bb75](https://forgejo.webgrip.dev/webgrip/glide/commit/f12bb75c34cb1e7fb8d163c3e364a8f5715b9ebb))
* **site:** give the site its own glide-site-v release train ([d8b59ca](https://forgejo.webgrip.dev/webgrip/glide/commit/d8b59ca3b4e5478623e50dd7661747e681720a12))
* **site:** switch the site to pnpm and pin wrangler ([4ab487b](https://forgejo.webgrip.dev/webgrip/glide/commit/4ab487b012940cc38a06c45420b87e0b8e452352))

### CI

* **site:** release the site on its own train and deploy it to workers.dev ([b6adee9](https://forgejo.webgrip.dev/webgrip/glide/commit/b6adee95b144c7bb1da852a7780313676eb1f2a2))

## [glide-v0.4.0-rc.21](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.4.0-rc.20...glide-v0.4.0-rc.21) (2026-09-30)

### Dependencies

* **deps:** lock file maintenance ([d13c232](https://forgejo.webgrip.dev/webgrip/glide/commit/d13c232979201eff13e5f16f2de8bf35f4eb252b))

### Added

* **deps:** update docker.io/golang docker tag ( 1.26 ➔ 1.27 ) ([36fae64](https://forgejo.webgrip.dev/webgrip/glide/commit/36fae64362ab14937cdb66bf5c0c6014961ce8f8))

### Docs

* **adr-0037:** accept per-team registry egress through a logged allowlist proxy ([996ffa9](https://forgejo.webgrip.dev/webgrip/glide/commit/996ffa9cc2a0d40f9c51420232d84c2aa9df2923))
* **ploeg:** propose ADR-0037, per-team registry egress through a logged allowlist proxy ([49c60c3](https://forgejo.webgrip.dev/webgrip/glide/commit/49c60c34e7d8b04948d514bded38253dc28f4a38))
* **ploeg:** record the owner's ADR-0037 decisions of 2026-09-28 ([2b8107b](https://forgejo.webgrip.dev/webgrip/glide/commit/2b8107b8532f2d90a9d4eb62731fb03ae8cb8d67))

## [glide-v0.4.0-rc.20](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.4.0-rc.19...glide-v0.4.0-rc.20) (2026-09-30)

### Added

* **ploeg:** have a writing Run report the problem and solution a reviewer reads ([2083ba6](https://forgejo.webgrip.dev/webgrip/glide/commit/2083ba6085ac4030576a06acf90a555b79b58253))
* **ploeg:** post a usage and evidence report on every agent pull request ([b1e9f24](https://forgejo.webgrip.dev/webgrip/glide/commit/b1e9f2433223fa6dbc6cc4958d3048a360c90c27))
* **ploeg:** report pull request and review state per work item ([846dee2](https://forgejo.webgrip.dev/webgrip/glide/commit/846dee2267593ca2f5f0f9ccbf3c8fc3e3584bbc))
* **ploeg:** report team tracker assignees and find work by tracker task ([f9957f3](https://forgejo.webgrip.dev/webgrip/glide/commit/f9957f3c5b0d63e06612222d879ab61b7c5cb23a))
* **ploeg:** report which tracker boards are pinned to each team ([eab1e16](https://forgejo.webgrip.dev/webgrip/glide/commit/eab1e163e6f067a022e7e26e2b7b926ceb24bedd))
* **ploeg:** route a tracker item by its repo label among registered targets ([c106f79](https://forgejo.webgrip.dev/webgrip/glide/commit/c106f79e136052f65d7ca11400f4fca2e83fdccb))
* **unfold:** draw the problem and solution as a before-and-after panel ([4803af9](https://forgejo.webgrip.dev/webgrip/glide/commit/4803af97ad1e8aa68727675cb97474a077eee6f3))
* **unfold:** hand a tracker task to a Ploeg team from the workbench ([627f6b0](https://forgejo.webgrip.dev/webgrip/glide/commit/627f6b098fe870561b445e7029b57968cc1e04f2))
* **unfold:** open linked tasks in a task view and hand them to Ploeg ([46a5040](https://forgejo.webgrip.dev/webgrip/glide/commit/46a5040680b36e8f87d24300b379fd7d7e3b09cd))
* **unfold:** show idle stops and number retried Runs ([6b66a68](https://forgejo.webgrip.dev/webgrip/glide/commit/6b66a68d4b162a2a95f88cd5a76e45ed36a63a70))
* **unfold:** show the writer's problem and solution under the Work Item title ([579dad5](https://forgejo.webgrip.dev/webgrip/glide/commit/579dad5898b625f51b30547bb76ef27eee08bd89))

### Fixed

* **ploeg:** count model traffic as harness activity and report idle stops as idle ([6ff1359](https://forgejo.webgrip.dev/webgrip/glide/commit/6ff135978cb7a86e2165ca5c658df4b6eb069d08))
* **unfold:** check every team before handing a task over or taking it back ([d095b45](https://forgejo.webgrip.dev/webgrip/glide/commit/d095b451a7e26f57d65c81230415353ebd996a60))
* **unfold:** make the task view robust to races, long tasks and escapes ([63e4de5](https://forgejo.webgrip.dev/webgrip/glide/commit/63e4de54997983e2a363911de52eb0e6cc06422b))
* **unfold:** show work awaiting review in the VS Code Ploeg tree ([47c62cb](https://forgejo.webgrip.dev/webgrip/glide/commit/47c62cb97d12b83055fb950a35f46a9a99a8bd86))

### Docs

* **adr:** accept ADR-0011 with the remote phase in scope ([a2292af](https://forgejo.webgrip.dev/webgrip/glide/commit/a2292af77a928cfda75de85efbd645574205f081))
* **glide:** research MCP access and propose ADR-0011 ([71f601a](https://forgejo.webgrip.dev/webgrip/glide/commit/71f601a0e43856f8a54368bc43b1d1549a8cddfd))
* **ploeg:** ADR-0040 shows a conflict on an awaiting_review pull request ([cc87fc1](https://forgejo.webgrip.dev/webgrip/glide/commit/cc87fc13787f6859249d3f8d352322081bc1058b)), references [#45](https://forgejo.webgrip.dev/webgrip/glide/issues/45)
* **ploeg:** how to route a board that serves several repositories ([a52f799](https://forgejo.webgrip.dev/webgrip/glide/commit/a52f7996d6f83917632cbc682d14a2214d3d8086))
* **ploeg:** propose ADR-0040, a conflicted pull request becomes a priority ticket ([9988750](https://forgejo.webgrip.dev/webgrip/glide/commit/99887504719b95fd43a4943d53d0104e45f0e18d))
* **ploeg:** propose retrying a failed reviewer and restarting from a chosen Round ([2f608d2](https://forgejo.webgrip.dev/webgrip/glide/commit/2f608d2f98901e6a9af0efd1fc57dfd6ab7db2b8)), references [#45](https://forgejo.webgrip.dev/webgrip/glide/issues/45)
* **ploeg:** record the OpenAI Agents API fit and propose ADR-0039 ([693be37](https://forgejo.webgrip.dev/webgrip/glide/commit/693be377defddd852af3baeb5632d07501bac78b))

### Tests

* **ploeg:** regenerate the Helm goldens for PLOEG_USAGE_REPORT ([c52a37c](https://forgejo.webgrip.dev/webgrip/glide/commit/c52a37ce10742c563391c972bfa75729a85bf368))

## [glide-v0.4.0-rc.19](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.4.0-rc.18...glide-v0.4.0-rc.19) (2026-09-30)

### Added

* **ploeg:** report reserved models and observed spend for running Runs ([36ddc03](https://forgejo.webgrip.dev/webgrip/glide/commit/36ddc0388ec635f6bd96a23b41224df29fdca501))

### Docs

* **ploeg:** plan credential isolation for the cluster ([c4207fc](https://forgejo.webgrip.dev/webgrip/glide/commit/c4207fcdb525619b7c298b6d2117c834034b9edb))

### Tests

* **unfold:** count a zombie as a reaped bridge on Linux ([db49e45](https://forgejo.webgrip.dev/webgrip/glide/commit/db49e45150175d3a460432c6f3fb961ac4242871))
* **unfold:** remove the conflict markers 375c504 committed ([45db471](https://forgejo.webgrip.dev/webgrip/glide/commit/45db4712eb5b85a31001b71bb10adcf93afca069))

## [glide-v0.4.0-rc.18](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.4.0-rc.17...glide-v0.4.0-rc.18) (2026-09-30)

### Added

* **unfold:** add design tokens with light and dark themes ([826aba4](https://forgejo.webgrip.dev/webgrip/glide/commit/826aba4067b28dc37c55755b2a3f05e7275f5389))
* **unfold:** add formatting, state vocabulary and needs-you reasons ([0e24cd7](https://forgejo.webgrip.dev/webgrip/glide/commit/0e24cd7f7293bfb761bb4f30e29dd1a7b89d27cf))
* **unfold:** add preferences, live updates and keyboard shortcuts ([9515062](https://forgejo.webgrip.dev/webgrip/glide/commit/951506217a3719512ee93aa6455bf3bfe1ad72c8)), references [#shortcuts](https://forgejo.webgrip.dev/webgrip/glide/issues/shortcuts) [#palette](https://forgejo.webgrip.dev/webgrip/glide/issues/palette)
* **unfold:** add reason fields to Now items ([8cbf09f](https://forgejo.webgrip.dev/webgrip/glide/commit/8cbf09f786a3cac50ea04c1f77f066027bbbe346))
* **unfold:** add the component library and its string builders ([8a93236](https://forgejo.webgrip.dev/webgrip/glide/commit/8a93236e1a43af6729b8c1b9a6493e9c61ad93a3))
* **unfold:** add the living style guide at [#design](https://forgejo.webgrip.dev/webgrip/glide/issues/design) ([a185d57](https://forgejo.webgrip.dev/webgrip/glide/commit/a185d5708089bb955b8d4a0be7678107c4f9aede))
* **unfold:** convert tracker HTML descriptions to Markdown for display ([8918b8e](https://forgejo.webgrip.dev/webgrip/glide/commit/8918b8e354adaa78b5b8353a78e4b56df76258a4))
* **unfold:** fit Runs to laptops and tighten Proposed, Activity and Insights ([1fb777a](https://forgejo.webgrip.dev/webgrip/glide/commit/1fb777a004619b71ba4d3f73ea9b2d7bcd5718a5))
* **unfold:** format days and shares for the feeds ([aca9331](https://forgejo.webgrip.dev/webgrip/glide/commit/aca93313144bc0c960b6aa01f217af1e227563d1))
* **unfold:** group Needs you by reason and put the next step in the decision box ([0d70d15](https://forgejo.webgrip.dev/webgrip/glide/commit/0d70d15fb04b68bc78e25ee16dc59f534bd4b138))
* **unfold:** list sessions by what they need, with honest review labels ([1f319c6](https://forgejo.webgrip.dev/webgrip/glide/commit/1f319c66bf080dacdb4f80e0c043de21c344db83))
* **unfold:** make the Ploeg demo exercise every needs-you reason ([de59d66](https://forgejo.webgrip.dev/webgrip/glide/commit/de59d66a3cc63dba15f8fcd35d0d46bca1040c28))
* **unfold:** name checkpoints, audit events, actors and close reasons in plain words ([66ed55f](https://forgejo.webgrip.dev/webgrip/glide/commit/66ed55f4e007bbe38fd8080a9d3f4292b45a8b89))
* **unfold:** one vocabulary, one grouping rule and one chrome across every screen ([c039058](https://forgejo.webgrip.dev/webgrip/glide/commit/c039058c92d688037c66684f174a5ecb6290237d)), references [#settings](https://forgejo.webgrip.dev/webgrip/glide/issues/settings)
* **unfold:** open on a cross-team Now page ([d50c838](https://forgejo.webgrip.dev/webgrip/glide/commit/d50c83884871dd7d6d42c124b0beef018e383bc9)), references [#now](https://forgejo.webgrip.dev/webgrip/glide/issues/now)
* **unfold:** pass Ploeg cancel results through ([e2cc151](https://forgejo.webgrip.dev/webgrip/glide/commit/e2cc151231e4846fc130e7468f611752864e6302))
* **unfold:** rebuild Now as the morning triage page ([8a1a3f0](https://forgejo.webgrip.dev/webgrip/glide/commit/8a1a3f0509468a1a476226a99bc69931240099d5))
* **unfold:** rebuild the session dialogs on the dialog components ([86a3a0b](https://forgejo.webgrip.dev/webgrip/glide/commit/86a3a0b8c5f25b9536f93cf7a067505fbfe3893f))
* **unfold:** rebuild the session workspace around the decision it waits on ([651d630](https://forgejo.webgrip.dev/webgrip/glide/commit/651d63075d324f8a5cc0de42f6c1da1b2027a3ba))
* **unfold:** rebuild the shell with grouped navigation, status strip and theme switch ([ba6b23a](https://forgejo.webgrip.dev/webgrip/glide/commit/ba6b23a85c91ae90de7492c2b889fa70ba96f7af))
* **unfold:** rebuild Work as a lane list beside a Work Item decision page ([4b6ccdb](https://forgejo.webgrip.dev/webgrip/glide/commit/4b6ccdb9e3e494a3f10c250ec1c10adcf040b33b))
* **unfold:** redesign Proposed, Runs, Activity and Insights ([eab149a](https://forgejo.webgrip.dev/webgrip/glide/commit/eab149afca0ebd0103208776814db7d8cc7ef029))
* **unfold:** redesign Tasks as a list beside the selected task ([1d06412](https://forgejo.webgrip.dev/webgrip/glide/commit/1d06412b130270b28e5ee8a87167aa92d8c43f39))
* **unfold:** remember the last Work team per browser ([9d06e77](https://forgejo.webgrip.dev/webgrip/glide/commit/9d06e7726dd809110da695af4cf8527e2ef14881))
* **unfold:** render tracker Markdown with line breaks, lists, quotes and emphasis ([480035c](https://forgejo.webgrip.dev/webgrip/glide/commit/480035ce388b406ebd67a4a1bfec4dbafc11d3f9))
* **unfold:** replace the palette placeholder with a fuzzy command palette ([e178c49](https://forgejo.webgrip.dev/webgrip/glide/commit/e178c49f0ade64cb2b39b81afe2ea7f90aeb90b0))
* **unfold:** route the new information architecture with redirects from old links ([88ed148](https://forgejo.webgrip.dev/webgrip/glide/commit/88ed148167449217acc17c7b5ea515dd82bf58d8)), references [#work](https://forgejo.webgrip.dev/webgrip/glide/issues/work) [#proposed](https://forgejo.webgrip.dev/webgrip/glide/issues/proposed) [#runs](https://forgejo.webgrip.dev/webgrip/glide/issues/runs) [#activity](https://forgejo.webgrip.dev/webgrip/glide/issues/activity) [#insights](https://forgejo.webgrip.dev/webgrip/glide/issues/insights) [#ploeg](https://forgejo.webgrip.dev/webgrip/glide/issues/ploeg) [#insights](https://forgejo.webgrip.dev/webgrip/glide/issues/insights) [#account](https://forgejo.webgrip.dev/webgrip/glide/issues/account) [#system](https://forgejo.webgrip.dev/webgrip/glide/issues/system) [#sessions](https://forgejo.webgrip.dev/webgrip/glide/issues/sessions) [#now](https://forgejo.webgrip.dev/webgrip/glide/issues/now) [#page-title](https://forgejo.webgrip.dev/webgrip/glide/issues/page-title) [#announcement](https://forgejo.webgrip.dev/webgrip/glide/issues/announcement)
* **unfold:** say why each Work Item waits on Now and group Needs you by reason ([8ba7188](https://forgejo.webgrip.dev/webgrip/glide/commit/8ba7188be5d383ce4b47a9fae3be08cb18989f72))
* **unfold:** Settings with an Environment checklist, Linked accounts and Preferences ([f432e1c](https://forgejo.webgrip.dev/webgrip/glide/commit/f432e1cd714f2d0e9f0f6e2e06ad735d1736fbae))
* **unfold:** signal what waits on you with a favicon dot and opt-in desktop notifications ([89348d0](https://forgejo.webgrip.dev/webgrip/glide/commit/89348d0b27db2541fa6245c8cbc094949b4c400b))
* **unfold:** split sign-in page with the outlined lockup ([0d4d83f](https://forgejo.webgrip.dev/webgrip/glide/commit/0d4d83fc5813526dfa9356696707202980933ffa))

### Fixed

* **unfold:** align Work ghost actions to the text edge and name the All lane ([bcb6bee](https://forgejo.webgrip.dev/webgrip/glide/commit/bcb6beec377c3aca12eba448a651b7769e7ae39a))
* **unfold:** calm the palette rows, rank short queries sensibly and stop stale failures ([9c6a3a9](https://forgejo.webgrip.dev/webgrip/glide/commit/9c6a3a97ef125971007596089b31956814a73357)), references [#id](https://forgejo.webgrip.dev/webgrip/glide/issues/id)
* **unfold:** drop another account's recent list from the browser when the palette reads it ([3d49298](https://forgejo.webgrip.dev/webgrip/glide/commit/3d49298af1279d0c2de26a11674c9ae373173281))
* **unfold:** explain "Not routed" in the approve dialog ([82878ae](https://forgejo.webgrip.dev/webgrip/glide/commit/82878ae342224c9081a79e4c528b30fe74e0bc15))
* **unfold:** fit the Round ladder at 1280 and keep Ploeg capitalised in Activity ([a5c59eb](https://forgejo.webgrip.dev/webgrip/glide/commit/a5c59eb5425861d762c73749fa6d3b9ca3f0f6e3))
* **unfold:** forget the signed-out person everywhere and keep decision prompts literal ([39e1c39](https://forgejo.webgrip.dev/webgrip/glide/commit/39e1c399987d44acc063275b74bdafe33b487e72))
* **unfold:** give the page title room in the top bar at laptop widths ([e1fc2e3](https://forgejo.webgrip.dev/webgrip/glide/commit/e1fc2e3d818dc87215b05b5ad076800624366dc3))
* **unfold:** give the sign-in split a real contrast and a steady reveal toggle ([e8d6684](https://forgejo.webgrip.dev/webgrip/glide/commit/e8d6684dae67b951ba75f6012bbd97993f4fcbb3))
* **unfold:** give the theme previews a visible edge in dark mode ([8bf7e49](https://forgejo.webgrip.dev/webgrip/glide/commit/8bf7e49175bb16abb6f2a53e80b455eb7da684d1))
* **unfold:** give the waiting list the full width on Now ([4c99ea9](https://forgejo.webgrip.dev/webgrip/glide/commit/4c99ea96750f0e488229994bf8b17b6689686509))
* **unfold:** group Runs as table row groups and drop a needless tab stop ([39feaa0](https://forgejo.webgrip.dev/webgrip/glide/commit/39feaa0694ed4a591b7ecf80345c3360d0f7fbf1))
* **unfold:** keep Create session in reach and tighten the Tasks list ([a70365d](https://forgejo.webgrip.dev/webgrip/glide/commit/a70365d58174145bc8307c64510ac28088557fbd)), references [#id](https://forgejo.webgrip.dev/webgrip/glide/issues/id)
* **unfold:** keep demo spend at zero and DEMO-1's free-text escalation ([0510900](https://forgejo.webgrip.dev/webgrip/glide/commit/0510900383187a4ce7dc4c372921e2333ed734ce))
* **unfold:** keep every waiting item on Now and align its grid ([68e6dd7](https://forgejo.webgrip.dev/webgrip/glide/commit/68e6dd7acbe6f7e5abed506f0316d71df65ca2fb))
* **unfold:** keep focus visible under fixed chrome and name pages, regions and filters for assistive tech ([1c8e638](https://forgejo.webgrip.dev/webgrip/glide/commit/1c8e638ce0eb6fb30ece40c336af400a3885a680))
* **unfold:** keep keyboard focus on Now and paint it before the summary ([0d57057](https://forgejo.webgrip.dev/webgrip/glide/commit/0d5705757804894c87aef26e54f4add9a4655332))
* **unfold:** keep links and code out of a Markdown link's address ([25b2a5b](https://forgejo.webgrip.dev/webgrip/glide/commit/25b2a5b632cc7a279a7ce3479dc05ad53d6c3497))
* **unfold:** keep meter tracks and skeletons visible on dialogs ([e92b7c2](https://forgejo.webgrip.dev/webgrip/glide/commit/e92b7c2700aa672b40960c8ddc3faefc0c99d19b))
* **unfold:** keep the palette's recent items and Work Item search to the signed-in user ([ee61b77](https://forgejo.webgrip.dev/webgrip/glide/commit/ee61b77756b60f9c8d06f0070f4b3af80840750a))
* **unfold:** keep the Sessions list steady while it refreshes and name the delivery gate honestly ([d17ee58](https://forgejo.webgrip.dev/webgrip/glide/commit/d17ee58c8d4a034978f0ccd901a402dd9d0bbbd8))
* **unfold:** keep the task row focus ring inside the list card ([21e3111](https://forgejo.webgrip.dev/webgrip/glide/commit/21e3111a7743320c5ef58892b5cd96a14931bed2))
* **unfold:** keep Work calm while it refreshes itself ([67cf224](https://forgejo.webgrip.dev/webgrip/glide/commit/67cf224228c64f7188e8e920330ccbc2b0373c4c))
* **unfold:** keep Work focus rings inside their lists and drop the last legacy spacing ([58c78f4](https://forgejo.webgrip.dev/webgrip/glide/commit/58c78f4c126a39942009339b041fed7e98bba53e))
* **unfold:** let the error toast keep the component's danger style ([fc4740f](https://forgejo.webgrip.dev/webgrip/glide/commit/fc4740f8b12ae55cc8bf11b105bb1645ce9c58f9))
* **unfold:** make every session state answer what to do, and keep focus and answers through live updates ([63f74a8](https://forgejo.webgrip.dev/webgrip/glide/commit/63f74a81fc09eb6f98d3da6befc2b95ef4933f8e))
* **unfold:** make palette results quieter and keep focus after redraws ([d8e624c](https://forgejo.webgrip.dev/webgrip/glide/commit/d8e624c9b84d70642d65be3c788b095ebed5e433))
* **unfold:** make the favicon dot big and bright enough to notice in a tab strip ([23edaa1](https://forgejo.webgrip.dev/webgrip/glide/commit/23edaa1f4bfdd8bd24007ffea5ac6e98b179ac3c))
* **unfold:** one Settings width, an honest Environment and calmer Preferences ([8f26354](https://forgejo.webgrip.dev/webgrip/glide/commit/8f2635467061a7b0312daaf3070c10b7397a22ae))
* **unfold:** print the page without the shell chrome ([97975bf](https://forgejo.webgrip.dev/webgrip/glide/commit/97975bfed123d447146ecd99ca061a189efdaa43))
* **unfold:** read state badges from states.js and keep formats and links on the shared helpers ([2278603](https://forgejo.webgrip.dev/webgrip/glide/commit/2278603a6d69e78c9cb0585e721d1334b2aecb90)), references [#design](https://forgejo.webgrip.dev/webgrip/glide/issues/design)
* **unfold:** refresh the Ploeg feeds only with data Unfold read ([5795cc4](https://forgejo.webgrip.dev/webgrip/glide/commit/5795cc408188fb97b03e34a4194ff7b6dc25209c))
* **unfold:** refuse in-app links that resolve to another host ([b1447da](https://forgejo.webgrip.dev/webgrip/glide/commit/b1447dab13ad974d71790da8033bd61c11673dde))
* **unfold:** retire the broken session Compare view ([f39fbc8](https://forgejo.webgrip.dev/webgrip/glide/commit/f39fbc8c3bebba8224840ba5183849334dcb4dc9)), references [#sessions](https://forgejo.webgrip.dev/webgrip/glide/issues/sessions)
* **unfold:** say what search covers above the no-match next step ([b0a6be8](https://forgejo.webgrip.dev/webgrip/glide/commit/b0a6be8bd6761b9a22be407e420d3925a85accaf))
* **unfold:** say who decides once and let the stale notice wrap on phones ([60a810b](https://forgejo.webgrip.dev/webgrip/glide/commit/60a810bd5a2b18b6851e82a8b2a78c8ce95c6cc5))
* **unfold:** scope the session dialogs' styles and open each on its first field ([2180b46](https://forgejo.webgrip.dev/webgrip/glide/commit/2180b46f409e69b0d8384ab19763537347ffd1bb))
* **unfold:** show "Updated" only for the page on screen ([18013c6](https://forgejo.webgrip.dev/webgrip/glide/commit/18013c62362c03702914501401ec1734af4391c8))
* **unfold:** state-aware Shift notes and left-aligned phone tools on Work ([786a9b2](https://forgejo.webgrip.dev/webgrip/glide/commit/786a9b26c210ecdcdf907d082215baae3c5eae87))
* **unfold:** title the sign-in page ([aed3ff5](https://forgejo.webgrip.dev/webgrip/glide/commit/aed3ff599a5ec763bec7327555390bc0ef2e78a4))
* **unfold:** use the browser's state vocabulary in the VS Code extension ([6139d40](https://forgejo.webgrip.dev/webgrip/glide/commit/6139d4040ab6805b0126c39ba8b739e350d530ce))
* **unfold:** write tracker Markdown in the subset the browser renderer reads ([80d8b87](https://forgejo.webgrip.dev/webgrip/glide/commit/80d8b87486202972cc7feb7355cd0dbc21ba1985))

### Performance

* **unfold:** serve static assets with ETag and gzip ([2ff9ade](https://forgejo.webgrip.dev/webgrip/glide/commit/2ff9ade8a8c333a847f85b7c4a472c4cfc4f13dc))

### Changed

* **unfold:** apply the screens' shared requests to the shell, core and components ([c0df122](https://forgejo.webgrip.dev/webgrip/glide/commit/c0df122ec0e44fbb0cc4ef1f0ddd8f0420e52482))
* **unfold:** draw the shell from the design tokens without hex fallbacks ([7cbd225](https://forgejo.webgrip.dev/webgrip/glide/commit/7cbd2250a85e5779100891d93e689c57f3be66a1))
* **unfold:** move the stylesheet into cascade layers ([a805777](https://forgejo.webgrip.dev/webgrip/glide/commit/a805777395f3412f3062b7641e7bf4579bcb4c48))
* **unfold:** retire legacy.css ([db00d9a](https://forgejo.webgrip.dev/webgrip/glide/commit/db00d9a7b2a63abd66891f9fcf00978d7e4524fa))
* **unfold:** split the browser app into core, shell and view modules ([404f69a](https://forgejo.webgrip.dev/webgrip/glide/commit/404f69a6240f4048175781a7eb73489d71432598)), references [#app](https://forgejo.webgrip.dev/webgrip/glide/issues/app) [#now](https://forgejo.webgrip.dev/webgrip/glide/issues/now)

### Docs

* point the guides at Now, the Ploeg pages and Cancel Work Item ([6528462](https://forgejo.webgrip.dev/webgrip/glide/commit/6528462227a283a8e2af09e18176aa63d1559d98))
* point the guides at the built Now, Work Item page and Cancel Work Item ([f5eaf4d](https://forgejo.webgrip.dev/webgrip/glide/commit/f5eaf4dd98a72c48b6c5363f9b52b8096a955c55))
* **unfold:** describe the application palette as token roles and status tones ([730874f](https://forgejo.webgrip.dev/webgrip/glide/commit/730874fa0dd9782a31e3a342f35a9c8e4dc1ae88))
* **unfold:** describe the rebuilt screens in the browser UI reference ([7dd7523](https://forgejo.webgrip.dev/webgrip/glide/commit/7dd75232302a47aa8d04705cdacdb089f738750b))
* **unfold:** document the Ploeg proxy routes, Now fields, cancel result and static caching ([3072b9f](https://forgejo.webgrip.dev/webgrip/glide/commit/3072b9f6dc13430127549ce19cf8b7b65e6b1d05))
* **unfold:** list the browser UI reference in llms.txt ([de8ec80](https://forgejo.webgrip.dev/webgrip/glide/commit/de8ec8037e544ed1d1c95ee46db34ddd8fdf3315))
* **unfold:** propose ADR 0024 and add the browser UI reference ([045a087](https://forgejo.webgrip.dev/webgrip/glide/commit/045a0870e01135909ab10f11c38a445c284eb695)), references [#design](https://forgejo.webgrip.dev/webgrip/glide/issues/design)
* **unfold:** record ADR 0024 as implemented and still proposed ([4f41104](https://forgejo.webgrip.dev/webgrip/glide/commit/4f4110440af9a6055e648b990d8cd7006a82ca7e))
* **unfold:** state what the legacy screens, tokens and API do today ([b5e890e](https://forgejo.webgrip.dev/webgrip/glide/commit/b5e890e51dc49ea1f9b15a645f70f23fb7425037))

### Tests

* **unfold:** count a killed bridge left as a zombie as gone ([71ad105](https://forgejo.webgrip.dev/webgrip/glide/commit/71ad1059e8779f8569ed40da8e500f219ff15f71))
* **unfold:** count the richer Ploeg demo in the feed and summary checks ([f75d76b](https://forgejo.webgrip.dev/webgrip/glide/commit/f75d76b52ef8bf27e801fdc588033e2348f3fd2a))
* **unfold:** count ui.js builder actions as markup in the registry check ([68a2954](https://forgejo.webgrip.dev/webgrip/glide/commit/68a2954171995fe4d9273f3fa64087432cefc2e7))
* **unfold:** split the browser check into per-area flows ([3e9ab23](https://forgejo.webgrip.dev/webgrip/glide/commit/3e9ab23580db3ad56e3c8b1eae87804d2da66eb5)), references [#16](https://forgejo.webgrip.dev/webgrip/glide/issues/16)

### Style

* **unfold:** drop the duplicate Esc hint from the palette footer ([efbe1aa](https://forgejo.webgrip.dev/webgrip/glide/commit/efbe1aa794c893c6cbc81cab0acdd289c23b1183))
* **unfold:** lay the budget dialog's figures out in two columns ([7630133](https://forgejo.webgrip.dev/webgrip/glide/commit/7630133ba381fd6a07c0aae102765a61b5d8adda))
* **unfold:** line up the shortcut help with labels left and keys right ([0709d25](https://forgejo.webgrip.dev/webgrip/glide/commit/0709d25eaebf0718fc3da202554e2e09d499027a))
* **unfold:** polish the session callouts and cards at phone width ([fded080](https://forgejo.webgrip.dev/webgrip/glide/commit/fded0804b0dc5f88d40451a3e5368eb783074805))

## [glide-v0.4.0-rc.17](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.4.0-rc.16...glide-v0.4.0-rc.17) (2026-09-30)

### Fixed

* **unfold:** settle a command turn when its supervisor dies before the bridge ([96ea78d](https://forgejo.webgrip.dev/webgrip/glide/commit/96ea78ddee4f9d2d8467b239defb4585f3a98b00))

## [glide-v0.4.0-rc.16](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.4.0-rc.15...glide-v0.4.0-rc.16) (2026-09-30)

### Fixed

* **unfold:** patch npm's bundled brace-expansion and undici in the workspace image ([24e3d85](https://forgejo.webgrip.dev/webgrip/glide/commit/24e3d85f3b729f93f82a2f946e71bee9c9385084))

## [glide-v0.4.0-rc.15](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.4.0-rc.14...glide-v0.4.0-rc.15) (2026-09-30)

### Added

* **ploeg:** split a Run's settled spend and tokens per model ([853eda3](https://forgejo.webgrip.dev/webgrip/glide/commit/853eda3e738a3095637602050db4264dbcf8a9c1))

### Fixed

* **ploeg:** keep claude-code subagents and the advisor on the Run's model ([d9af860](https://forgejo.webgrip.dev/webgrip/glide/commit/d9af86070aa610763d5750e0589ead4ffa1c90c7))

### Docs

* **ploeg:** propose ADR-0039 on multi-model Runs and the advisor tool ([5802d1a](https://forgejo.webgrip.dev/webgrip/glide/commit/5802d1a855f58f3742578a7174f88388f239db82))

### Tests

* **ploeg:** give the idle-watchdog test room for a slow exec ([ad7bbcc](https://forgejo.webgrip.dev/webgrip/glide/commit/ad7bbcc409c54516a5fb4dcec8a18430b02ac2a6))
* **ploeg:** run the talking harness inline so a file scan cannot stall it ([dee6fd3](https://forgejo.webgrip.dev/webgrip/glide/commit/dee6fd366cc4db98e4d7cd9b756a0626e9887180))
* **unfold:** fail a test that never settles and accept a concurrency cap ([f7f9ff7](https://forgejo.webgrip.dev/webgrip/glide/commit/f7f9ff70965d524e3fe63f5b0f60f4359de95a06))
* **unfold:** run the API demo at 100 ms per step instead of 1 s ([553600b](https://forgejo.webgrip.dev/webgrip/glide/commit/553600b710d0e3c083019b23cb2f75b771b59959))
* **unfold:** write the stop-signal child's pid file atomically ([21125f2](https://forgejo.webgrip.dev/webgrip/glide/commit/21125f28f52acc917a825f63ff139625e796ff90))

## [glide-v0.4.0-rc.14](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.4.0-rc.13...glide-v0.4.0-rc.14) (2026-09-29)

### Fixed

* **ploeg:** write OpenHands agent settings so its ACP session starts ([24e3a05](https://forgejo.webgrip.dev/webgrip/glide/commit/24e3a054f9c2258d9daf7a109f30397deca606fa))

### Internal

* **ploeg:** commit the mise.lock that lockfile = true expects ([caa2a3a](https://forgejo.webgrip.dev/webgrip/glide/commit/caa2a3a737bbf071870ae79be4c2884c24f8a2a6))

## [glide-v0.4.0-rc.13](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.4.0-rc.12...glide-v0.4.0-rc.13) (2026-09-29)

### Fixed

* **ploeg:** parse YAML with the maintained go.yaml.in/yaml/v3 ([bdea64d](https://forgejo.webgrip.dev/webgrip/glide/commit/bdea64dd640d6c90dd11423da4d31d9d39d2409e))

### Docs

* **ploeg:** record the Work Item 138 incident and its non-golden paths ([ce7d726](https://forgejo.webgrip.dev/webgrip/glide/commit/ce7d72628c1d2a0ea9a9e74f77939521238fd8f8))
* **ploeg:** state what each archived OpenSpec capability is for ([d5975f9](https://forgejo.webgrip.dev/webgrip/glide/commit/d5975f939a3226d9e84a5c472623854290592e98))

### Tests

* **ploeg:** ignore helm's blank line before document separators in chart goldens ([6855e14](https://forgejo.webgrip.dev/webgrip/glide/commit/6855e14060144e57c0e11b4dc952ccaf6855182f))
* **unfold:** scale the VS Code extension test timeouts on a loaded runner ([c817ca5](https://forgejo.webgrip.dev/webgrip/glide/commit/c817ca5f88a5f62168bf6b7f78ea957b5424b879))

## [glide-v0.4.0-rc.12](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.4.0-rc.11...glide-v0.4.0-rc.12) (2026-09-29)

### Added

* **ploeg:** add an openhands ACP profile ([fc6eef9](https://forgejo.webgrip.dev/webgrip/glide/commit/fc6eef9574bcd44d689332ad34b1650798c1e3c0))

### Fixed

* **unfold:** stop counting reviewed sessions as ready for review ([6478cb3](https://forgejo.webgrip.dev/webgrip/glide/commit/6478cb366f57def0a26ceea03a152036ecab114c))

## [glide-v0.4.0-rc.11](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.4.0-rc.10...glide-v0.4.0-rc.11) (2026-09-28)

### Added

* **ploeg:** withdraw a Work Item whose ticket closes before work starts ([5ab862e](https://forgejo.webgrip.dev/webgrip/glide/commit/5ab862ec259f752ca37de617dc9f59801f1dcd76))

## [glide-v0.4.0-rc.10](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.4.0-rc.9...glide-v0.4.0-rc.10) (2026-09-28)

### Fixed

* **ploeg:** fail a Run as infra_node when its sandbox never starts ([afadc5f](https://forgejo.webgrip.dev/webgrip/glide/commit/afadc5f92825435d765c147e0bf87410732e9c0d))

### Docs

* **adr-0038:** accept with the owner's 2026-09-28 routing decisions ([499da03](https://forgejo.webgrip.dev/webgrip/glide/commit/499da031d3015af57502166c4599e5e1b810d647))
* **adr-0038:** propose repo-label hints over a derived target registry ([8dc711b](https://forgejo.webgrip.dev/webgrip/glide/commit/8dc711bccc3057b848d02d750ebd5a3bf9ebed87)), references [#11](https://forgejo.webgrip.dev/webgrip/glide/issues/11)
* **ploeg:** address review of the run-usage report plan ([86bf6c1](https://forgejo.webgrip.dev/webgrip/glide/commit/86bf6c164c9759809d0dfe2713406465786ea765))
* **ploeg:** plan the PR run-usage report as an OpenSpec change ([af4251e](https://forgejo.webgrip.dev/webgrip/glide/commit/af4251ec803200a0e0684cde8d29bc398dd0fe45)), references [#1305](https://forgejo.webgrip.dev/webgrip/glide/issues/1305)

### Tests

* **unfold:** make time-bound API tests readiness-based and load-tolerant ([aff26b7](https://forgejo.webgrip.dev/webgrip/glide/commit/aff26b7a5331b0097560a0a688ced01552fead02))

## [glide-v0.4.0-rc.9](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.4.0-rc.8...glide-v0.4.0-rc.9) (2026-09-28)

### Added

* **ploeg:** give ploegd its own forge URL with executor.forgejo.publicUrl ([3a211aa](https://forgejo.webgrip.dev/webgrip/glide/commit/3a211aa930e5c814e42e3bd3cce4064a39b54702))

## [glide-v0.4.0-rc.8](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.4.0-rc.7...glide-v0.4.0-rc.8) (2026-09-28)

### Fixed

* **ploeg:** delete a sandbox claim that never becomes ready ([4d45655](https://forgejo.webgrip.dev/webgrip/glide/commit/4d45655a5d7862bbc384189a4c8bd244024bff42))

### Docs

* **ploeg:** correct sandbox executor qualification and split its remaining work ([e69bef1](https://forgejo.webgrip.dev/webgrip/glide/commit/e69bef167cd3919d27be7092ca35dfc27e54c0ff)), references [#58](https://forgejo.webgrip.dev/webgrip/glide/issues/58) [#126](https://forgejo.webgrip.dev/webgrip/glide/issues/126) [#127](https://forgejo.webgrip.dev/webgrip/glide/issues/127) [#89](https://forgejo.webgrip.dev/webgrip/glide/issues/89)
* **ploeg:** drop an anchor link that strict mkdocs rejects ([e92557a](https://forgejo.webgrip.dev/webgrip/glide/commit/e92557a76328944ad34234aaa264ab8cefda7327)), references [#127](https://forgejo.webgrip.dev/webgrip/glide/issues/127) [#58](https://forgejo.webgrip.dev/webgrip/glide/issues/58) [#58](https://forgejo.webgrip.dev/webgrip/glide/issues/58)
* **ploeg:** propose ADR-0036, the escalation ladder for stuck Work Items ([fbfe04b](https://forgejo.webgrip.dev/webgrip/glide/commit/fbfe04b70a6b4f523fa472df728d402b03574d96)), references [#3](https://forgejo.webgrip.dev/webgrip/glide/issues/3)
* **ploeg:** record the kind runner blocker for the sandbox e2e ([e628d02](https://forgejo.webgrip.dev/webgrip/glide/commit/e628d02c9453464de4527e87835e5e05b24e65bf)), references [#127](https://forgejo.webgrip.dev/webgrip/glide/issues/127)
* **ploeg:** record the owner's 2026-09-28 decisions in ADR-0036 ([1ca31e1](https://forgejo.webgrip.dev/webgrip/glide/commit/1ca31e1e1ed6e18c7be12b8b6985af63ef3491ca))

### Tests

* **ploeg:** pin the LLM undercut guard at the column rounding boundary ([71b946a](https://forgejo.webgrip.dev/webgrip/glide/commit/71b946ae65828e7ec4b7430edea985871de8041f))
* **ploeg:** start embedded Postgres on an OS-assigned port ([143a7d7](https://forgejo.webgrip.dev/webgrip/glide/commit/143a7d70cf45a7b2993f46251ff4c051a11b3b30))

## [glide-v0.4.0-rc.7](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.4.0-rc.6...glide-v0.4.0-rc.7) (2026-09-28)

### Fixed

* **ploeg:** name the sandbox claim apart from the launcher pod ([a386f97](https://forgejo.webgrip.dev/webgrip/glide/commit/a386f9707250b4f082e5b7f2f281ae8938d7a731))

### Docs

* **adr-0035:** state exactly what a Run's worker pod can reach on the network ([6ba68ca](https://forgejo.webgrip.dev/webgrip/glide/commit/6ba68caee286b22dd81bf953f290a7ba47343946))

## [glide-v0.4.0-rc.6](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.4.0-rc.5...glide-v0.4.0-rc.6) (2026-09-28)

### Added

* **ploeg:** per-team and per-role sandbox RuntimeClass ([2393847](https://forgejo.webgrip.dev/webgrip/glide/commit/23938479f962f22361105f28aa226f68c27e9de7))

### Fixed

* **ploeg:** settle blocked LLM accounts at run_llm_accounts' column precision ([a6e5854](https://forgejo.webgrip.dev/webgrip/glide/commit/a6e58545eeaa479b02fb1ee41cd36a2f6778e123))

### Docs

* **unfold:** note current GAP-17 status in the gap register ([3e55d61](https://forgejo.webgrip.dev/webgrip/glide/commit/3e55d6159bd9d99ce5cf9c894a81547e27037852))

### Tests

* **ploeg:** refuse a non-string sandbox RuntimeClass ([f2d73c8](https://forgejo.webgrip.dev/webgrip/glide/commit/f2d73c8f29d148df2b9f051889d75f313690b85f))

## [glide-v0.4.0-rc.5](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.4.0-rc.4...glide-v0.4.0-rc.5) (2026-09-27)

### Fixed

* **ploeg:** give the harness the configured model name, prefix intact ([901a466](https://forgejo.webgrip.dev/webgrip/glide/commit/901a466121b79ba5e182b0a6663d0ef09c8d8e87))

### Tests

* **unfold:** give the HTTP demo session room on a contended runner ([27f6f7d](https://forgejo.webgrip.dev/webgrip/glide/commit/27f6f7dd5153dbd869911111821ad8b075aabcd2))

## [glide-v0.4.0-rc.4](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.4.0-rc.3...glide-v0.4.0-rc.4) (2026-09-27)

### Added

* **ploeg:** add qwen-code and goose ACP profiles ([5467350](https://forgejo.webgrip.dev/webgrip/glide/commit/54673502202b6a31959b42c59516812dcd946dc3))
* **ploeg:** execute a Work Item from the OpenSpec change it names ([df7cd0d](https://forgejo.webgrip.dev/webgrip/glide/commit/df7cd0d18e4c966d38dc81178d705123f1edc4e6))
* **ploeg:** give Runs mounted toolchains, Ploeg skills and a worker-run verification ([853d797](https://forgejo.webgrip.dev/webgrip/glide/commit/853d797edac2ecf569c8b5422655897084483256))

### Fixed

* **ploeg:** close an approved review loop as approved ([02f0467](https://forgejo.webgrip.dev/webgrip/glide/commit/02f0467850e4c798e28bacfd216fe598988232ad)), references [#115](https://forgejo.webgrip.dev/webgrip/glide/issues/115)
* **ploeg:** mint per-run Forgejo tokens that reach only the Run's repository ([8c37e41](https://forgejo.webgrip.dev/webgrip/glide/commit/8c37e4127b1a2f55786764eda3541fbb549c9c16))
* **ploeg:** reject forge webhooks when no secret is configured ([8edfc53](https://forgejo.webgrip.dev/webgrip/glide/commit/8edfc5341f18a203ae3b20507b0e11fa1ed8e2ca))

### Docs

* **ploeg:** cite the pushed commit in close-the-review-loop task 5.1 ([3e4d23b](https://forgejo.webgrip.dev/webgrip/glide/commit/3e4d23baa784bb7d3449b9512bd1ab9c1f07c7bb))
* **ploeg:** propose executing a Work Item from the OpenSpec change it names ([a4dafac](https://forgejo.webgrip.dev/webgrip/glide/commit/a4dafacfe58cbb1249b4688b04c952af5b347382))
* **ploeg:** record ADR-0035 and the toolchain-and-checks runbook ([d1a6ca3](https://forgejo.webgrip.dev/webgrip/glide/commit/d1a6ca35ad2d9f984b162452f99d43559aa32736))
* **ploeg:** record close-the-review-loop progress ([730e5a7](https://forgejo.webgrip.dev/webgrip/glide/commit/730e5a7f6e2c356bccd5450592e133c9b41c4134))

### Tests

* **ploeg:** pin infra_node on a failed push-credential mint and document each failure reason's writers ([c07192c](https://forgejo.webgrip.dev/webgrip/glide/commit/c07192c0d1c85faa46bbb39fb7704d7d2ba58b9b))

## [glide-v0.4.0-rc.3](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.4.0-rc.2...glide-v0.4.0-rc.3) (2026-09-27)

### Added

* **ploeg:** let one team run under the sandbox executor ([58a5ee5](https://forgejo.webgrip.dev/webgrip/glide/commit/58a5ee58a4c9dadd93d6121693045de364924a7a))

### Docs

* **ploeg:** archive the add-agent-sandbox-executor change ([cb9872b](https://forgejo.webgrip.dev/webgrip/glide/commit/cb9872b287a506dc180b603bc2331ad4d9bc4b63))

## [glide-v0.4.0-rc.2](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.4.0-rc.1...glide-v0.4.0-rc.2) (2026-09-27)

### Fixed

* **unfold:** record the zlib CVE-2026-85091 exposure of the workspace image and enforce it ([4036286](https://forgejo.webgrip.dev/webgrip/glide/commit/4036286b348681d160946c7180afd6190c527614))

## [glide-v0.4.0-rc.1](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.3.0...glide-v0.4.0-rc.1) (2026-09-27)

### Added

* **docs:** enforce page front matter and report stale pages ([04ac8ec](https://forgejo.webgrip.dev/webgrip/glide/commit/04ac8ec3245f75255110c0678aaa2569bdca5654))
* **docs:** publish Glide through Zensical with source exports ([7fc4da7](https://forgejo.webgrip.dev/webgrip/glide/commit/7fc4da7a7c8e192777206b4b6f81c5fbdec408fe))
* **ploeg:** act on failed checks and requested changes behind a team switch ([ecd6034](https://forgejo.webgrip.dev/webgrip/glide/commit/ecd6034a4ab3f3b9259004c4e0debf9451ba3c66))
* **ploeg:** add an experimental agent-sandbox executor ([d136491](https://forgejo.webgrip.dev/webgrip/glide/commit/d1364911d51df248a4cc322741cd3406557731da))
* **ploeg:** add operator activity summary, Run list and newest-first events ([bba3657](https://forgejo.webgrip.dev/webgrip/glide/commit/bba36577056dca17263eecb6b10e658b27fb85d6))
* **ploeg:** add optional ServiceMonitor and PrometheusRule to the chart ([f700f2b](https://forgejo.webgrip.dev/webgrip/glide/commit/f700f2b88c3426d3d61d0f1ae85654c55cbe9254)), references [#39](https://forgejo.webgrip.dev/webgrip/glide/issues/39)
* **ploeg:** cap running Runs per team and drop the unused queue depth route ([d0bd049](https://forgejo.webgrip.dev/webgrip/glide/commit/d0bd0492d21c7173343b84c321160d0bd54119ce))
* **ploeg:** expose operational gauges at GET /metrics ([d4e54d0](https://forgejo.webgrip.dev/webgrip/glide/commit/d4e54d02b1a6af79434f59a977b509ae1de2da05)), references [#39](https://forgejo.webgrip.dev/webgrip/glide/issues/39)
* **ploeg:** keep a writer's forge token out of the harness ([6066cb6](https://forgejo.webgrip.dev/webgrip/glide/commit/6066cb6409a652d6e2025656c633d68a5b0770c9))
* **ploeg:** keep the per-Run model key out of the harness ([7f77fa4](https://forgejo.webgrip.dev/webgrip/glide/commit/7f77fa426c202b5841cd7b82461b10d05d3d4fc9))
* **ploeg:** let a Run create Work Items that wait for approval ([8971081](https://forgejo.webgrip.dev/webgrip/glide/commit/89710817f46d880854cfdb7787911f0ed2a837e8))
* **ploeg:** let sandbox Runs carry an egress allowlist ([eee198e](https://forgejo.webgrip.dev/webgrip/glide/commit/eee198e246558f330ec009391a4eaa1c942b11ac))
* **ploeg:** never hand a reading Role the read-write forge token ([bd1848e](https://forgejo.webgrip.dev/webgrip/glide/commit/bd1848e9f914c0e4e066e74d0431da1caccbb525))
* **ploeg:** rank repository instructions below the delivery contract in the worker prompt ([7dbaae6](https://forgejo.webgrip.dev/webgrip/glide/commit/7dbaae6ffd178142253c99c9064c9882f37092b6))
* **ploeg:** record gateway tokens and models on settled Runs ([92c1cb7](https://forgejo.webgrip.dev/webgrip/glide/commit/92c1cb79aa2fe2d4a34f11ff01442adfea5d5f86))
* **ploeg:** report Vikunja projects that have no Ploeg webhook ([cf782df](https://forgejo.webgrip.dev/webgrip/glide/commit/cf782df5f94f63354866556076537d57983a045c))
* **ploeg:** say so when a Shift runs out of budget ([0e9faa9](https://forgejo.webgrip.dev/webgrip/glide/commit/0e9faa95ecd6c6b9ba7f9a9c9c8e3c5e4fb30634))
* **ploeg:** scan agent instruction files before the harness runs ([cb62c69](https://forgejo.webgrip.dev/webgrip/glide/commit/cb62c69a4ead3d024bdebb589976103ad622f051))
* **ploeg:** settle awaiting_review items when their pull request merges or closes ([d63e7cb](https://forgejo.webgrip.dev/webgrip/glide/commit/d63e7cb5a2f81751fbfa5f584af2ab92c9b2e46c))
* **ploeg:** settle successful Shifts as awaiting_review ([7a6afed](https://forgejo.webgrip.dev/webgrip/glide/commit/7a6afedfe5b723fc87f47b63b5355d00f719bac6))
* **ploeg:** stop target repository hooks and MCP servers under claude-code ([f340805](https://forgejo.webgrip.dev/webgrip/glide/commit/f340805c65b27cb6d8de4a0ed9d1f44c1f993e2b))
* **ploeg:** withdraw tracker work on unassignment or operator cancel ([d28f906](https://forgejo.webgrip.dev/webgrip/glide/commit/d28f9064f0ca1ec9dd0681404ebf1b8c14d6e6f0))
* **unfold:** accept Ploeg's awaiting_review work item state ([c7b4a1c](https://forgejo.webgrip.dev/webgrip/glide/commit/c7b4a1c241da8dcffd005424f0d92e7e5a10a9f8))
* **unfold:** accept the proposed Ploeg work-item state ([fa2f00d](https://forgejo.webgrip.dev/webgrip/glide/commit/fa2f00dea3461e3759c9336020f333c62e824f3e))
* **unfold:** accept the withdrawn Ploeg work-item state ([91253ea](https://forgejo.webgrip.dev/webgrip/glide/commit/91253ea7861505277584dd7cfce7abd7c20f739d))
* **unfold:** add an Awaiting review lane and a read-only review screen ([4f22e0d](https://forgejo.webgrip.dev/webgrip/glide/commit/4f22e0d3edc1f8686f0e2c2a84db86fe9024ac3e))
* **unfold:** show what Ploeg has been doing ([d0d3309](https://forgejo.webgrip.dev/webgrip/glide/commit/d0d3309efc09f3f685781154dcc8d91890029d76))

### Fixed

* **adr:** make the Unfold ledger pass the consistency validator ([d15c343](https://forgejo.webgrip.dev/webgrip/glide/commit/d15c3436167d8ce726f99bd7e60d9ff634c78b61))
* **ploeg:** bound hung harness runs with a timeout and an idle watchdog ([dd064ce](https://forgejo.webgrip.dev/webgrip/glide/commit/dd064ceac24b9c6ac5af99ecaf9624b5c8553945))
* **ploeg:** call the unit of work a Work Item in the agent prompt ([1885d5c](https://forgejo.webgrip.dev/webgrip/glide/commit/1885d5c58c4d73661237014f26a88e5f3fc31b34))
* **ploeg:** cancel operator admissions that expire unstarted ([767078c](https://forgejo.webgrip.dev/webgrip/glide/commit/767078cd426b9e6c8bdad091a997312ad46f7cce))
* **ploeg:** check the harness program exists before claiming ([8b4e2b8](https://forgejo.webgrip.dev/webgrip/glide/commit/8b4e2b8ae96886569806ae218f2de059897c24cf))
* **ploeg:** default the chart's lease TTL to 5m ([660f689](https://forgejo.webgrip.dev/webgrip/glide/commit/660f6895bb81b3d8b33cb70eff1c723cdaa2d8ec))
* **ploeg:** derive the work branch from the item's tracker ([fb9cb4d](https://forgejo.webgrip.dev/webgrip/glide/commit/fb9cb4d5fcb541745e43ff5cd103eddc70c8ab39))
* **ploeg:** fund managed Runs on Shifts without a budget pool ([1700ddd](https://forgejo.webgrip.dev/webgrip/glide/commit/1700ddd0a6aaf851531d4e7482677ea2d5643d3d))
* **ploeg:** hide the worker's environment from the harness it starts ([19f085c](https://forgejo.webgrip.dev/webgrip/glide/commit/19f085c35f566e97ded9a3de3bbef9e7c431740a))
* **ploeg:** name Glide as the Helm chart's source ([c60db9e](https://forgejo.webgrip.dev/webgrip/glide/commit/c60db9e00dd7e7c69d4a1e68929c2c5fd5576c93))
* **ploeg:** park an exhausted plan whose last review asked for changes ([4dc7091](https://forgejo.webgrip.dev/webgrip/glide/commit/4dc709136f5ebff1a4fe2920acf47d7e0c48f122)), references [webgrip/ploeg#43](https://forgejo.webgrip.dev/webgrip/ploeg/issues/43)
* **ploeg:** put only a minted forge token in a claim response ([fbe1f19](https://forgejo.webgrip.dev/webgrip/glide/commit/fbe1f19a6d82b8d427cdc28033dc2a23e99db21d)), references [webgrip/ploeg#45](https://forgejo.webgrip.dev/webgrip/ploeg/issues/45)
* **ploeg:** record why a Run that opened a PR then failed ([58b1a01](https://forgejo.webgrip.dev/webgrip/glide/commit/58b1a0170132670ba9c378430c948917f46b13ca)), references [webgrip/ploeg#45](https://forgejo.webgrip.dev/webgrip/ploeg/issues/45)
* **ploeg:** repair only pull requests that are still awaiting review ([0dd34d4](https://forgejo.webgrip.dev/webgrip/glide/commit/0dd34d48fc20953d3b1c3ab127509a7f63adeffd))
* **ploeg:** report only webhook coverage counts on the unauthenticated readiness probe ([e25cda0](https://forgejo.webgrip.dev/webgrip/glide/commit/e25cda0efd7f71a5c46167ebfdd77d630aa5f954))
* **ploeg:** settle finished managed inference accounts from the controller ([9d825d5](https://forgejo.webgrip.dev/webgrip/glide/commit/9d825d5a253aa89de71b16b162bf68c82546c636))
* **ploeg:** settle managed accounts from LiteLLM spend logs ([e95ba87](https://forgejo.webgrip.dev/webgrip/glide/commit/e95ba87f99baa02c84075f6c5cd1e8b012000332))
* **release:** publish verified Glide artifacts to internal and public registries ([957565d](https://forgejo.webgrip.dev/webgrip/glide/commit/957565d566d4255b79411bc0f50e103abba1b457))
* **unfold:** bound agent host connection tokens and revoke them on sign-out ([6d79090](https://forgejo.webgrip.dev/webgrip/glide/commit/6d79090ee4f549a92b1c04c45f54e5af2e5454e5))
* **unfold:** give the demo core test room on a contended runner ([9cac30a](https://forgejo.webgrip.dev/webgrip/glide/commit/9cac30a089f06db8a5c0ed8e4c617e6446d25638))
* **unfold:** keep sessions with a persisted Ploeg admission intent managed ([d393b62](https://forgejo.webgrip.dev/webgrip/glide/commit/d393b626846a6278280f8aa983da8ef51df53593))
* **unfold:** let the stop-signal test observe the child's exit on a busy runner ([05291bc](https://forgejo.webgrip.dev/webgrip/glide/commit/05291bcce75e702ef4818326c0ef40d3af07d3af))
* **unfold:** name Glide as the Helm chart's source ([7cb584a](https://forgejo.webgrip.dev/webgrip/glide/commit/7cb584a4cdd64c59ed55a05b9ce0b4aa749e3054))
* **unfold:** refuse standalone budget increases while a model key is live ([5cf4bba](https://forgejo.webgrip.dev/webgrip/glide/commit/5cf4bbac100e3403cac3fe2e35a027277459164b))
* **unfold:** reject an external OpenCode endpoint in live configuration ([414baa8](https://forgejo.webgrip.dev/webgrip/glide/commit/414baa86e708f4619bc2ad98e2ba051ad973a7c0))

### Changed

* **ploeg:** remove the unused CanTransition lifecycle table ([13c4b15](https://forgejo.webgrip.dev/webgrip/glide/commit/13c4b158e60fa655db62e064ae3425b36f9483d6)), references [#11](https://forgejo.webgrip.dev/webgrip/glide/issues/11)

### Docs

* **adr:** record the 2026-09-17 agent host roadmap sweep ([52999da](https://forgejo.webgrip.dev/webgrip/glide/commit/52999dad9ef0e1961e62ee3c185ca48da1b114b7)), references [AHP#266](https://forgejo.webgrip.dev/AHP/issues/266)
* **agents:** trim instruction files to non-inferable rules and bridge CLAUDE.md ([714b036](https://forgejo.webgrip.dev/webgrip/glide/commit/714b0360c8256cd9b3448c87fc85b9557d36ef9a))
* align Unfold pages with ADR-0002 and the combined glossary ([af7ac46](https://forgejo.webgrip.dev/webgrip/glide/commit/af7ac463c62bcfa2ebd970bb2e84549242e2b8e9))
* describe forge events that create and return work ([1c68194](https://forgejo.webgrip.dev/webgrip/glide/commit/1c68194a702eeb950fab6f35c60ff9a23b518919))
* **domain:** unify the glossaries under Ploeg's execution vocabulary ([d29acfa](https://forgejo.webgrip.dev/webgrip/glide/commit/d29acfa8e0f475e58c7287993881e654553c8502))
* link real pages instead of redirect stubs and archived repositories ([57475eb](https://forgejo.webgrip.dev/webgrip/glide/commit/57475eb92a7c45e87e9c640557de066cd913d49f))
* make the Work Item the unit of work and let work create work ([c27d0c6](https://forgejo.webgrip.dev/webgrip/glide/commit/c27d0c6438663e27f639ba0ea74f33b60280e492))
* mark the Ploeg and Unfold backlogs as frozen planning records ([7123444](https://forgejo.webgrip.dev/webgrip/glide/commit/712344400552f2e0946df033a0032acca6996ef0))
* **ploeg:** add operator runbooks as how-to pages ([cde4881](https://forgejo.webgrip.dev/webgrip/glide/commit/cde48813a423e47f73e920a20fc6db8dc8874fb6))
* **ploeg:** describe the metrics and what to check for each alert ([e277518](https://forgejo.webgrip.dev/webgrip/glide/commit/e2775184ef378cda49de32a68372f558bfa39380)), references [#39](https://forgejo.webgrip.dev/webgrip/glide/issues/39)
* **ploeg:** generate the configuration reference from source and chart ([8ddafe0](https://forgejo.webgrip.dev/webgrip/glide/commit/8ddafe0b5b6a73885e819be89beeb65739db9b14))
* **ploeg:** propose ADRs 0032 and 0033 from the landscape survey ([3d2dac4](https://forgejo.webgrip.dev/webgrip/glide/commit/3d2dac4a20091a3349428c939a670e942552faa6))
* **ploeg:** propose ranking target repository instructions below the delivery contract ([f8039b8](https://forgejo.webgrip.dev/webgrip/glide/commit/f8039b809677a96cd46d231bfc795c00ef9476a1))
* **ploeg:** record the 20k-star agent-orchestration landscape fit survey ([b2ac80c](https://forgejo.webgrip.dev/webgrip/glide/commit/b2ac80c191974286f04f7a2fb9b878387894b1e8))
* **ploeg:** regenerate the configuration reference after merges ([508d523](https://forgejo.webgrip.dev/webgrip/glide/commit/508d5239c1809b85171e28a9a53f7816f4d3562e))
* **ploeg:** regenerate the configuration reference for concurrency caps ([ff122d6](https://forgejo.webgrip.dev/webgrip/glide/commit/ff122d62fcb0a09e0d6dde42796137432b275a51))
* **ploeg:** regenerate the configuration reference for metrics settings ([44ac075](https://forgejo.webgrip.dev/webgrip/glide/commit/44ac0755c905f38e46cfb16a5a0b92b2392a145f))
* record how Runs create Work Items and the open owner questions ([596c283](https://forgejo.webgrip.dev/webgrip/glide/commit/596c283ca679fbf95655a053eae765c4bb91d5c0))
* **research:** add gateway budget enforcement and AG2 Network to the BAND survey ([a09a679](https://forgejo.webgrip.dev/webgrip/glide/commit/a09a6790a6bb516d847b3ecc9da8d838f122bef0))
* **research:** correct two overstated claims in the BAND survey ([ef52b06](https://forgejo.webgrip.dev/webgrip/glide/commit/ef52b06e5602bd2e1a943330b32bedd86623addf))
* **research:** refresh the coding-agent workbench category and correct Kandev ([8e99317](https://forgejo.webgrip.dev/webgrip/glide/commit/8e99317f0061c560598a9c919be42400de4f9471))
* **research:** survey BAND and the agent interaction layer ([7355fbd](https://forgejo.webgrip.dev/webgrip/glide/commit/7355fbdcd429d4d1762b4f2afdaa7992ec8eb0ae))
* **research:** verify the MCP absences against the normative schema ([b91abd5](https://forgejo.webgrip.dev/webgrip/glide/commit/b91abd59a0801a3a2e5b46d6564dfa9f72e2fd07))
* **unfold:** align the HTTP contract and architecture map with the code ([1661d33](https://forgejo.webgrip.dev/webgrip/glide/commit/1661d33e918927eff3e49bf6816fb595230158a0))
* **unfold:** propose Unfold as Ploeg's front end ([3a9ad7d](https://forgejo.webgrip.dev/webgrip/glide/commit/3a9ad7d5eefeb3e5b4af24d03980d5ccade47d80))
* **unfold:** remove the duplicate product model and its moved-page stubs ([34b44ae](https://forgejo.webgrip.dev/webgrip/glide/commit/34b44ae7366e7941337dbc2793be4201af446cb0))

### Tests

* **integration:** mint and block managed keys against a fake LiteLLM ([e394fca](https://forgejo.webgrip.dev/webgrip/glide/commit/e394fca1031e8865674ba1cfca8f3ab93d2c2777))
* **ploeg:** add opt-in canary conformance for harness instruction loading ([bb90cf6](https://forgejo.webgrip.dev/webgrip/glide/commit/bb90cf6d7ef5c8ba2a548a4c8de77116c12cdce3))
* **ploeg:** drain launcher output before noise assertions ([a350052](https://forgejo.webgrip.dev/webgrip/glide/commit/a3500528fef85eb20a2b5646bc292b7be231ed2d))
* **ploeg:** let parallel runs offset the embedded Postgres ports ([91d2ee5](https://forgejo.webgrip.dev/webgrip/glide/commit/91d2ee59ffff5aeacddd5cda3ee47782d5167034))
* **ploeg:** run a fake claude to prove target hooks and MCP servers stay off ([41d2927](https://forgejo.webgrip.dev/webgrip/glide/commit/41d292712a964cc4aa37b5561a903349da647a82))

### Build

* **unfold:** install OpenCode only for the tasks that run it ([e489be9](https://forgejo.webgrip.dev/webgrip/glide/commit/e489be9a08af9649f5bb1ca8fe7dafbe6e5663f4))

### CI

* align Glide with Webgrip workflow entry points ([2bface8](https://forgejo.webgrip.dev/webgrip/glide/commit/2bface847d63c5ceb2590b22132389df9db3f93d))
* hold the Ploeg image to a CVE budget before signing ([17e05df](https://forgejo.webgrip.dev/webgrip/glide/commit/17e05df1dd891e6c3d309b0659892b40eed67311))
* **release:** hold Unfold at zero-major and watch the imported release notes ([ed6d631](https://forgejo.webgrip.dev/webgrip/glide/commit/ed6d6312819db0dfba61947e55f7383cc2577251))
* **release:** release Unfold and Ploeg under one Glide version ([3316717](https://forgejo.webgrip.dev/webgrip/glide/commit/33167174070c50c5d3f09f16d6f58b4db1134e5d))

### Internal

* **ci:** remove the application workflow symlinks ([ef15e68](https://forgejo.webgrip.dev/webgrip/glide/commit/ef15e68805ea64e5bd635f7fab9e7aade4365e9c))
* drop application mise tasks that duplicate root tasks ([f8fdf9e](https://forgejo.webgrip.dev/webgrip/glide/commit/f8fdf9e5de311157a46a41d5404efa7b3d7d1cc3))
* **ploeg:** archive the six completed OpenSpec changes ([f09fdbc](https://forgejo.webgrip.dev/webgrip/glide/commit/f09fdbc4d9f7aae2be223c639d11b2822896a3a0))
* **ploeg:** remove the uncalled Worker.Run shim ([fa1e9a7](https://forgejo.webgrip.dev/webgrip/glide/commit/fa1e9a7bdbd8557cf4167507878e25ed87c91e38))
* remove duplicated and orphaned files left by the import ([5c055c2](https://forgejo.webgrip.dev/webgrip/glide/commit/5c055c2ee82521c233e9f336c06146a0ffe86732))
* **unfold:** remove AgentHost.revokeToken, which no route reaches ([49b4cc0](https://forgejo.webgrip.dev/webgrip/glide/commit/49b4cc006a4559fe5e022ef272d1eaf5efa60f2c))
* **unfold:** remove the unapplied Ploeg patch ([5d1f59d](https://forgejo.webgrip.dev/webgrip/glide/commit/5d1f59dfca0722772a128b2547e8aad629b1f5c4))
* **unfold:** remove the uncalled LiteLLMBroker.revokeSession ([bd13d7a](https://forgejo.webgrip.dev/webgrip/glide/commit/bd13d7a4ae490e111d1cff5a0c371851e9276ae8))
* **unfold:** remove the unused broker extend operation ([dcaa678](https://forgejo.webgrip.dev/webgrip/glide/commit/dcaa678d276ca8f9c5e22487f922ce40ee85d05b))
