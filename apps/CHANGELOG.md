## [glide-v0.4.0-rc.21](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.4.0-rc.20...glide-v0.4.0-rc.21) (2026-09-30)

### Dependencies

* **deps:** lock file maintenance ([d393fba](https://forgejo.webgrip.dev/webgrip/glide/commit/d393fba42a4e2f266d74dfe6b3e251527a3f35c4))

### Added

* **deps:** update docker.io/golang docker tag ( 1.26 ➔ 1.27 ) ([21794a0](https://forgejo.webgrip.dev/webgrip/glide/commit/21794a0e7f5995b950bedfcc2be548e2de9d23fa))

### Docs

* **adr-0037:** accept per-team registry egress through a logged allowlist proxy ([f1b16b9](https://forgejo.webgrip.dev/webgrip/glide/commit/f1b16b97647ff9409fee410e10405a5543581e58))
* **ploeg:** propose ADR-0037, per-team registry egress through a logged allowlist proxy ([1d024b8](https://forgejo.webgrip.dev/webgrip/glide/commit/1d024b8964616b78c6220b7d776a2c8baeb42a6b))
* **ploeg:** record the owner's ADR-0037 decisions of 2026-09-28 ([25e9d7e](https://forgejo.webgrip.dev/webgrip/glide/commit/25e9d7e04bcfd28036913e4115b03e876e8ed65d))

## [glide-v0.4.0-rc.20](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.4.0-rc.19...glide-v0.4.0-rc.20) (2026-09-30)

### Added

* **ploeg:** have a writing Run report the problem and solution a reviewer reads ([eb459ca](https://forgejo.webgrip.dev/webgrip/glide/commit/eb459caabed50b832031afdcb361455112c3ffde))
* **ploeg:** post a usage and evidence report on every agent pull request ([e9df8a4](https://forgejo.webgrip.dev/webgrip/glide/commit/e9df8a479bf503a8b80e6bdd7a48ccafc7e91f4b))
* **ploeg:** report pull request and review state per work item ([27551a1](https://forgejo.webgrip.dev/webgrip/glide/commit/27551a16b35159d61df1a9d308df02ea4d568b49))
* **ploeg:** report team tracker assignees and find work by tracker task ([2985ee8](https://forgejo.webgrip.dev/webgrip/glide/commit/2985ee8da0fa3f8c3528e246a3118e3ed7def695))
* **ploeg:** report which tracker boards are pinned to each team ([135cb2d](https://forgejo.webgrip.dev/webgrip/glide/commit/135cb2d152a4300ae2cc240a2fe8b1e38de95004))
* **ploeg:** route a tracker item by its repo label among registered targets ([67939c6](https://forgejo.webgrip.dev/webgrip/glide/commit/67939c6531b7ea8d7f0b119552439fce81704daa))
* **vloer:** draw the problem and solution as a before-and-after panel ([c4cc0cf](https://forgejo.webgrip.dev/webgrip/glide/commit/c4cc0cf54e82d0312897b170b2cf2837e768886a))
* **vloer:** hand a tracker task to a Ploeg team from the workbench ([877143b](https://forgejo.webgrip.dev/webgrip/glide/commit/877143b3fb0744bed94bb41756dee47e4b3e97d0))
* **vloer:** open linked tasks in a task view and hand them to Ploeg ([12c7552](https://forgejo.webgrip.dev/webgrip/glide/commit/12c7552c962edc49ff71661b3414b7384cc681ba))
* **vloer:** show idle stops and number retried Runs ([d6fb54e](https://forgejo.webgrip.dev/webgrip/glide/commit/d6fb54ed8858113d7dae8ab0eb0fe727f17a30c6))
* **vloer:** show the writer's problem and solution under the Work Item title ([2682ff3](https://forgejo.webgrip.dev/webgrip/glide/commit/2682ff3440e613b0f18e7c99343f832fe59658dc))

### Fixed

* **ploeg:** count model traffic as harness activity and report idle stops as idle ([a7c86f1](https://forgejo.webgrip.dev/webgrip/glide/commit/a7c86f1dd06066859b9b725ad9c3d49fd1613c4d))
* **vloer:** check every team before handing a task over or taking it back ([ad72b77](https://forgejo.webgrip.dev/webgrip/glide/commit/ad72b779621cd5913e13b32812a57928973baf05))
* **vloer:** make the task view robust to races, long tasks and escapes ([4b5dea2](https://forgejo.webgrip.dev/webgrip/glide/commit/4b5dea29f14e072d41d5f3463a1a0801f4b7c1e7))
* **vloer:** show work awaiting review in the VS Code Ploeg tree ([c23f0a4](https://forgejo.webgrip.dev/webgrip/glide/commit/c23f0a497a6176a1dfd7ff0ab5510b36fe4a8f5a))

### Docs

* **adr:** accept ADR-0011 with the remote phase in scope ([dd00f38](https://forgejo.webgrip.dev/webgrip/glide/commit/dd00f385fbd7e19b65eefc7f21475df40f7b913f))
* **glide:** research MCP access and propose ADR-0011 ([7a2d57c](https://forgejo.webgrip.dev/webgrip/glide/commit/7a2d57c667422992fb54e45deee853720134c16a))
* **ploeg:** ADR-0040 shows a conflict on an awaiting_review pull request ([7042fc5](https://forgejo.webgrip.dev/webgrip/glide/commit/7042fc5f121079dab9eb493f5b234d45ffb55a13)), references [#45](https://forgejo.webgrip.dev/webgrip/glide/issues/45)
* **ploeg:** how to route a board that serves several repositories ([59bb910](https://forgejo.webgrip.dev/webgrip/glide/commit/59bb91046922f27deedbc169d3fd806244074acc))
* **ploeg:** propose ADR-0040, a conflicted pull request becomes a priority ticket ([4cb6142](https://forgejo.webgrip.dev/webgrip/glide/commit/4cb6142cfd9a5215e321924762ce8430baedcec5))
* **ploeg:** propose retrying a failed reviewer and restarting from a chosen Round ([033e948](https://forgejo.webgrip.dev/webgrip/glide/commit/033e948f0413fb5e7d599abcbff538776abf7f5c)), references [#45](https://forgejo.webgrip.dev/webgrip/glide/issues/45)
* **ploeg:** record the OpenAI Agents API fit and propose ADR-0039 ([c1fb89d](https://forgejo.webgrip.dev/webgrip/glide/commit/c1fb89dc8eb8bb7aaa723e80de961996f23cd080))

### Tests

* **ploeg:** regenerate the Helm goldens for PLOEG_USAGE_REPORT ([93b88b8](https://forgejo.webgrip.dev/webgrip/glide/commit/93b88b818eafec7004c815bd273e3e9a468802f2))

## [glide-v0.4.0-rc.19](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.4.0-rc.18...glide-v0.4.0-rc.19) (2026-09-30)

### Added

* **ploeg:** report reserved models and observed spend for running Runs ([57b75d7](https://forgejo.webgrip.dev/webgrip/glide/commit/57b75d7e0f210ce147c70f2e857c7544b6d4acc5))

### Docs

* **ploeg:** plan credential isolation for the cluster ([560e495](https://forgejo.webgrip.dev/webgrip/glide/commit/560e49534e13595ea36a046f4af256b5fffa0967))

### Tests

* **vloer:** count a zombie as a reaped bridge on Linux ([375c504](https://forgejo.webgrip.dev/webgrip/glide/commit/375c5045822bf0d30ab0a2d65b60162449df5cff))
* **vloer:** remove the conflict markers 375c504 committed ([ad3941e](https://forgejo.webgrip.dev/webgrip/glide/commit/ad3941ef091b764ca07780851f14b865ceeea4b9))

## [glide-v0.4.0-rc.18](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.4.0-rc.17...glide-v0.4.0-rc.18) (2026-09-30)

### Added

* **vloer:** add design tokens with light and dark themes ([12cdb8d](https://forgejo.webgrip.dev/webgrip/glide/commit/12cdb8d9d09f7ef3c83e5dfb07ea22b47ba31419))
* **vloer:** add formatting, state vocabulary and needs-you reasons ([126f5c4](https://forgejo.webgrip.dev/webgrip/glide/commit/126f5c454247dd1917548d21f8cfd3879e152291))
* **vloer:** add preferences, live updates and keyboard shortcuts ([59bcd04](https://forgejo.webgrip.dev/webgrip/glide/commit/59bcd04c363811484e3cd08900304ec6f8c9ad0c)), references [#shortcuts](https://forgejo.webgrip.dev/webgrip/glide/issues/shortcuts) [#palette](https://forgejo.webgrip.dev/webgrip/glide/issues/palette)
* **vloer:** add reason fields to Now items ([f63b3e3](https://forgejo.webgrip.dev/webgrip/glide/commit/f63b3e3d9638ee7b989113bebb56aaecfbb185f5))
* **vloer:** add the component library and its string builders ([2f23cc4](https://forgejo.webgrip.dev/webgrip/glide/commit/2f23cc473777b559642e909d47ac085162d90548))
* **vloer:** add the living style guide at [#design](https://forgejo.webgrip.dev/webgrip/glide/issues/design) ([8367e09](https://forgejo.webgrip.dev/webgrip/glide/commit/8367e0973109243e41e8f2467a16ba63b3cc3522))
* **vloer:** convert tracker HTML descriptions to Markdown for display ([6aab101](https://forgejo.webgrip.dev/webgrip/glide/commit/6aab101dff66ea2720a09724f0652cad0b48260e))
* **vloer:** fit Runs to laptops and tighten Proposed, Activity and Insights ([d4a3826](https://forgejo.webgrip.dev/webgrip/glide/commit/d4a38265916e34cdbd645282bf0e3cea7a4d8c61))
* **vloer:** format days and shares for the feeds ([1d965b9](https://forgejo.webgrip.dev/webgrip/glide/commit/1d965b991cac9670c864a65e438cd0a3f79cef3a))
* **vloer:** group Needs you by reason and put the next step in the decision box ([5de40d9](https://forgejo.webgrip.dev/webgrip/glide/commit/5de40d93e9694c90fe2a25fa47ea18f0e45d4f8c))
* **vloer:** list sessions by what they need, with honest review labels ([8deb69d](https://forgejo.webgrip.dev/webgrip/glide/commit/8deb69d675ed0ccefb230e1d4e581af4d927f4ac))
* **vloer:** make the Ploeg demo exercise every needs-you reason ([403776f](https://forgejo.webgrip.dev/webgrip/glide/commit/403776f38b209a00f5d6fecc003095c3b5999632))
* **vloer:** name checkpoints, audit events, actors and close reasons in plain words ([002393a](https://forgejo.webgrip.dev/webgrip/glide/commit/002393ac5dee3aa7af8280d5d64326dc639ce466))
* **vloer:** one vocabulary, one grouping rule and one chrome across every screen ([6775d21](https://forgejo.webgrip.dev/webgrip/glide/commit/6775d21dfc3f582d9ce3be5c58b955ef605fbc91)), references [#settings](https://forgejo.webgrip.dev/webgrip/glide/issues/settings)
* **vloer:** open on a cross-team Now page ([f6e9aab](https://forgejo.webgrip.dev/webgrip/glide/commit/f6e9aab56cdc40b1048bcff0e1d74d604abe6075)), references [#now](https://forgejo.webgrip.dev/webgrip/glide/issues/now)
* **vloer:** pass Ploeg cancel results through ([c7b71e1](https://forgejo.webgrip.dev/webgrip/glide/commit/c7b71e1280be5a4973a155d726c93e05040ac5b3))
* **vloer:** rebuild Now as the morning triage page ([0db5868](https://forgejo.webgrip.dev/webgrip/glide/commit/0db586880615eb82a201640d5fa7c5dd3075346a))
* **vloer:** rebuild the session dialogs on the dialog components ([17c1577](https://forgejo.webgrip.dev/webgrip/glide/commit/17c157778ad886e0142901c64f2a3e0b1063a725))
* **vloer:** rebuild the session workspace around the decision it waits on ([559efc4](https://forgejo.webgrip.dev/webgrip/glide/commit/559efc407cff3ba3dddfe9aa689026b5b0a2bf5e))
* **vloer:** rebuild the shell with grouped navigation, status strip and theme switch ([ebfacee](https://forgejo.webgrip.dev/webgrip/glide/commit/ebfacee6dcf24237c8b9c2b4b4cd9ea2b14365f2))
* **vloer:** rebuild Work as a lane list beside a Work Item decision page ([e815f24](https://forgejo.webgrip.dev/webgrip/glide/commit/e815f2423d5ca5bbb5dee3bb45d3777ac715761e))
* **vloer:** redesign Proposed, Runs, Activity and Insights ([643b1ba](https://forgejo.webgrip.dev/webgrip/glide/commit/643b1ba6f4cb4c9a714c450d369b3dbcec3adc0b))
* **vloer:** redesign Tasks as a list beside the selected task ([ef6313d](https://forgejo.webgrip.dev/webgrip/glide/commit/ef6313d899c1fa11600b77d78e81c3a7f9dbbe14))
* **vloer:** remember the last Work team per browser ([bb42066](https://forgejo.webgrip.dev/webgrip/glide/commit/bb42066d07553bb48e18d48b00dfb6605b7e3395))
* **vloer:** render tracker Markdown with line breaks, lists, quotes and emphasis ([5c060ef](https://forgejo.webgrip.dev/webgrip/glide/commit/5c060efd9862444774a4e65aee13184289a76b4d))
* **vloer:** replace the palette placeholder with a fuzzy command palette ([94c32cb](https://forgejo.webgrip.dev/webgrip/glide/commit/94c32cb800e31cbd53a296f16dcc57fe84ec86f9))
* **vloer:** route the new information architecture with redirects from old links ([650b491](https://forgejo.webgrip.dev/webgrip/glide/commit/650b4918ac0f662ddf865c6973994f1972080f74)), references [#work](https://forgejo.webgrip.dev/webgrip/glide/issues/work) [#proposed](https://forgejo.webgrip.dev/webgrip/glide/issues/proposed) [#runs](https://forgejo.webgrip.dev/webgrip/glide/issues/runs) [#activity](https://forgejo.webgrip.dev/webgrip/glide/issues/activity) [#insights](https://forgejo.webgrip.dev/webgrip/glide/issues/insights) [#ploeg](https://forgejo.webgrip.dev/webgrip/glide/issues/ploeg) [#insights](https://forgejo.webgrip.dev/webgrip/glide/issues/insights) [#account](https://forgejo.webgrip.dev/webgrip/glide/issues/account) [#system](https://forgejo.webgrip.dev/webgrip/glide/issues/system) [#sessions](https://forgejo.webgrip.dev/webgrip/glide/issues/sessions) [#now](https://forgejo.webgrip.dev/webgrip/glide/issues/now) [#page-title](https://forgejo.webgrip.dev/webgrip/glide/issues/page-title) [#announcement](https://forgejo.webgrip.dev/webgrip/glide/issues/announcement)
* **vloer:** say why each Work Item waits on Now and group Needs you by reason ([13f861c](https://forgejo.webgrip.dev/webgrip/glide/commit/13f861cc00c5fe65139c42c1200295ab58fcc17d))
* **vloer:** Settings with an Environment checklist, Linked accounts and Preferences ([dd75ac3](https://forgejo.webgrip.dev/webgrip/glide/commit/dd75ac32308afd25b0d3b60f1978971a6a87154b))
* **vloer:** signal what waits on you with a favicon dot and opt-in desktop notifications ([532a111](https://forgejo.webgrip.dev/webgrip/glide/commit/532a111d4458a2913423618a7d93a17fd7788c96))
* **vloer:** split sign-in page with the outlined lockup ([91ccbbe](https://forgejo.webgrip.dev/webgrip/glide/commit/91ccbbeeaaeeb8ef62126dfa4c0157f49d39b187))

### Fixed

* **vloer:** align Work ghost actions to the text edge and name the All lane ([5a595a0](https://forgejo.webgrip.dev/webgrip/glide/commit/5a595a0d4ba3462f708939d03e0998a8ae4d4a4d))
* **vloer:** calm the palette rows, rank short queries sensibly and stop stale failures ([00ba2bb](https://forgejo.webgrip.dev/webgrip/glide/commit/00ba2bb6685f46e088bb64227a35ea550a739bec)), references [#id](https://forgejo.webgrip.dev/webgrip/glide/issues/id)
* **vloer:** drop another account's recent list from the browser when the palette reads it ([8ed1c04](https://forgejo.webgrip.dev/webgrip/glide/commit/8ed1c040aa8ed6bb86fca9646a18acdd88d7a44c))
* **vloer:** explain "Not routed" in the approve dialog ([b6788cd](https://forgejo.webgrip.dev/webgrip/glide/commit/b6788cdec085cae18ec4c9834ea9ad199df2c7a2))
* **vloer:** fit the Round ladder at 1280 and keep Ploeg capitalised in Activity ([6e0981f](https://forgejo.webgrip.dev/webgrip/glide/commit/6e0981f1c0b0cb1681695250edcae05cbc1bce01))
* **vloer:** forget the signed-out person everywhere and keep decision prompts literal ([317ae06](https://forgejo.webgrip.dev/webgrip/glide/commit/317ae065cc1cc712b1e78de80bef0382b6122d87))
* **vloer:** give the page title room in the top bar at laptop widths ([f6224a3](https://forgejo.webgrip.dev/webgrip/glide/commit/f6224a3a1698b027d4814621a7822ea8e888a8db))
* **vloer:** give the sign-in split a real contrast and a steady reveal toggle ([fa51d68](https://forgejo.webgrip.dev/webgrip/glide/commit/fa51d6809dd498f91f6e924ee0dbd777a8ad66e2))
* **vloer:** give the theme previews a visible edge in dark mode ([6102732](https://forgejo.webgrip.dev/webgrip/glide/commit/6102732527c6900ee7bbfe22146f6f7f854704c8))
* **vloer:** give the waiting list the full width on Now ([1029612](https://forgejo.webgrip.dev/webgrip/glide/commit/1029612513247e4b85cb6b99629045487d8d1943))
* **vloer:** group Runs as table row groups and drop a needless tab stop ([d0716bc](https://forgejo.webgrip.dev/webgrip/glide/commit/d0716bc0768f6907a465deffc8c89c79bde69937))
* **vloer:** keep Create session in reach and tighten the Tasks list ([03748aa](https://forgejo.webgrip.dev/webgrip/glide/commit/03748aaaa3d4e61ab951dc5a18c230935af48b91)), references [#id](https://forgejo.webgrip.dev/webgrip/glide/issues/id)
* **vloer:** keep demo spend at zero and DEMO-1's free-text escalation ([ac6006c](https://forgejo.webgrip.dev/webgrip/glide/commit/ac6006c86623b3f021e503d3b4403066f60230c8))
* **vloer:** keep every waiting item on Now and align its grid ([44b4044](https://forgejo.webgrip.dev/webgrip/glide/commit/44b404462d36c8c40d4e5652c5871782c285371d))
* **vloer:** keep focus visible under fixed chrome and name pages, regions and filters for assistive tech ([efa4281](https://forgejo.webgrip.dev/webgrip/glide/commit/efa42817f5d267940f9d78161e6f8ccbaa3ad515))
* **vloer:** keep keyboard focus on Now and paint it before the summary ([3cdae50](https://forgejo.webgrip.dev/webgrip/glide/commit/3cdae50a756f3cefd4664cb45e9efa1c7814d290))
* **vloer:** keep links and code out of a Markdown link's address ([826ebd9](https://forgejo.webgrip.dev/webgrip/glide/commit/826ebd93dd5cc29a47a87c5e9ab5ce751b4b4bc7))
* **vloer:** keep meter tracks and skeletons visible on dialogs ([5a55df7](https://forgejo.webgrip.dev/webgrip/glide/commit/5a55df77d4b0732801615f5ff7b6a23d79974b97))
* **vloer:** keep the palette's recent items and Work Item search to the signed-in user ([dd17b47](https://forgejo.webgrip.dev/webgrip/glide/commit/dd17b47c697214443fce4e8563d3187a4f0632ff))
* **vloer:** keep the Sessions list steady while it refreshes and name the delivery gate honestly ([9c08a76](https://forgejo.webgrip.dev/webgrip/glide/commit/9c08a76fcba7059592884e4d3477c0f36d82e9fa))
* **vloer:** keep the task row focus ring inside the list card ([c199ea7](https://forgejo.webgrip.dev/webgrip/glide/commit/c199ea7e45206df903fd28818778d3500e1ad3a9))
* **vloer:** keep Work calm while it refreshes itself ([22ba30c](https://forgejo.webgrip.dev/webgrip/glide/commit/22ba30c0e3e4f90e6f1498abf7764a336c2cf24a))
* **vloer:** keep Work focus rings inside their lists and drop the last legacy spacing ([40c3f52](https://forgejo.webgrip.dev/webgrip/glide/commit/40c3f524b7e70e7ccf2105bfd5f21570cfc3a8f1))
* **vloer:** let the error toast keep the component's danger style ([68c90cf](https://forgejo.webgrip.dev/webgrip/glide/commit/68c90cf3bc60eeb2541f7168f60b6d088a28f03a))
* **vloer:** make every session state answer what to do, and keep focus and answers through live updates ([e350630](https://forgejo.webgrip.dev/webgrip/glide/commit/e3506306bdaef2eb64c28dca1a4e43d38228c635))
* **vloer:** make palette results quieter and keep focus after redraws ([63932f6](https://forgejo.webgrip.dev/webgrip/glide/commit/63932f694add6ec040b9f7b712fa501c7fc51661))
* **vloer:** make the favicon dot big and bright enough to notice in a tab strip ([7e4ba44](https://forgejo.webgrip.dev/webgrip/glide/commit/7e4ba441c5ffeb3c282e2740e08b017cf5c83d0c))
* **vloer:** one Settings width, an honest Environment and calmer Preferences ([62999c0](https://forgejo.webgrip.dev/webgrip/glide/commit/62999c009a5692d36eea5a5378d0b210628a8723))
* **vloer:** print the page without the shell chrome ([8dde758](https://forgejo.webgrip.dev/webgrip/glide/commit/8dde758d8bbc921ccbd869aab6f44f545dfd6ff3))
* **vloer:** read state badges from states.js and keep formats and links on the shared helpers ([5216e8f](https://forgejo.webgrip.dev/webgrip/glide/commit/5216e8fd74acdfd7428e44c19d85b4877d39a4de)), references [#design](https://forgejo.webgrip.dev/webgrip/glide/issues/design)
* **vloer:** refresh the Ploeg feeds only with data Vloer read ([3e755ed](https://forgejo.webgrip.dev/webgrip/glide/commit/3e755ed23ffd146fc28eae8de062feaf9a5a41b8))
* **vloer:** refuse in-app links that resolve to another host ([12d94de](https://forgejo.webgrip.dev/webgrip/glide/commit/12d94de4c96c14e2ddf6380fdedadb8041c1d434))
* **vloer:** retire the broken session Compare view ([309c2fb](https://forgejo.webgrip.dev/webgrip/glide/commit/309c2fb4bea35e82c858c485ecdee143dc4d60e1)), references [#sessions](https://forgejo.webgrip.dev/webgrip/glide/issues/sessions)
* **vloer:** say what search covers above the no-match next step ([5025600](https://forgejo.webgrip.dev/webgrip/glide/commit/50256008c613fc3d7e79c4738013ebe94447a59e))
* **vloer:** say who decides once and let the stale notice wrap on phones ([1635874](https://forgejo.webgrip.dev/webgrip/glide/commit/16358747a15f08c7b066407a87b4cf16bd7a3f2f))
* **vloer:** scope the session dialogs' styles and open each on its first field ([a147d67](https://forgejo.webgrip.dev/webgrip/glide/commit/a147d67b346596550a862bb1d1d50b5bef39aac5))
* **vloer:** show "Updated" only for the page on screen ([4e90514](https://forgejo.webgrip.dev/webgrip/glide/commit/4e905145086693b7bb2d1c987edd151667130d64))
* **vloer:** state-aware Shift notes and left-aligned phone tools on Work ([518c921](https://forgejo.webgrip.dev/webgrip/glide/commit/518c921008cb1661fefdd1ec5db429606900eb53))
* **vloer:** title the sign-in page ([b8ba60b](https://forgejo.webgrip.dev/webgrip/glide/commit/b8ba60b4d6aae45fb4e9207b2d080c9ed9b06980))
* **vloer:** use the browser's state vocabulary in the VS Code extension ([4563ca7](https://forgejo.webgrip.dev/webgrip/glide/commit/4563ca7bd889f61352f08eec99b3b40573dd3a3a))
* **vloer:** write tracker Markdown in the subset the browser renderer reads ([b5c53f7](https://forgejo.webgrip.dev/webgrip/glide/commit/b5c53f7d751c93ceb53d430b70c260340470d396))

### Performance

* **vloer:** serve static assets with ETag and gzip ([67676c5](https://forgejo.webgrip.dev/webgrip/glide/commit/67676c5cdd0c690bd960d58240d98d549b9cb629))

### Changed

* **vloer:** apply the screens' shared requests to the shell, core and components ([c15e079](https://forgejo.webgrip.dev/webgrip/glide/commit/c15e0793c863353a3abbabff20facdcfa58a61af))
* **vloer:** draw the shell from the design tokens without hex fallbacks ([51855fa](https://forgejo.webgrip.dev/webgrip/glide/commit/51855fac7d5567454eef484e7e349a726ba51ae4))
* **vloer:** move the stylesheet into cascade layers ([d146354](https://forgejo.webgrip.dev/webgrip/glide/commit/d1463549efb84e729b02ce8e2a3cfe1c6722cfa7))
* **vloer:** retire legacy.css ([91754db](https://forgejo.webgrip.dev/webgrip/glide/commit/91754db7f5f4fe57f420d81553e343df3e9f290a))
* **vloer:** split the browser app into core, shell and view modules ([16e2bbb](https://forgejo.webgrip.dev/webgrip/glide/commit/16e2bbb9d60ea009a476d1fa533396a2ba8b9551)), references [#app](https://forgejo.webgrip.dev/webgrip/glide/issues/app) [#now](https://forgejo.webgrip.dev/webgrip/glide/issues/now)

### Docs

* point the guides at Now, the Ploeg pages and Cancel Work Item ([e8e87d4](https://forgejo.webgrip.dev/webgrip/glide/commit/e8e87d4e6a900c3db00ae73e562b25036c530f20))
* point the guides at the built Now, Work Item page and Cancel Work Item ([43e8a7c](https://forgejo.webgrip.dev/webgrip/glide/commit/43e8a7c9204a24f086c1c4ddace98ffd2fa657ee))
* **vloer:** describe the application palette as token roles and status tones ([6f336c2](https://forgejo.webgrip.dev/webgrip/glide/commit/6f336c2e3389d293c6f93a1606c7af563b9d4d09))
* **vloer:** describe the rebuilt screens in the browser UI reference ([fee0fb5](https://forgejo.webgrip.dev/webgrip/glide/commit/fee0fb59d5f8c1ddda48a362b80a3599842c5f10))
* **vloer:** document the Ploeg proxy routes, Now fields, cancel result and static caching ([16043ef](https://forgejo.webgrip.dev/webgrip/glide/commit/16043efa6cd2e128d32e4e512ed7564ac3a0f609))
* **vloer:** list the browser UI reference in llms.txt ([13a23df](https://forgejo.webgrip.dev/webgrip/glide/commit/13a23df6a5b47dfeb873b3cde254ab3120b39cc1))
* **vloer:** propose ADR 0024 and add the browser UI reference ([48c7a61](https://forgejo.webgrip.dev/webgrip/glide/commit/48c7a61d26bb05d67b7370cc4e3673a42149cd0a)), references [#design](https://forgejo.webgrip.dev/webgrip/glide/issues/design)
* **vloer:** record ADR 0024 as implemented and still proposed ([9b1949e](https://forgejo.webgrip.dev/webgrip/glide/commit/9b1949e3462a166b2462313affd8838b5c5717b2))
* **vloer:** state what the legacy screens, tokens and API do today ([6e910b0](https://forgejo.webgrip.dev/webgrip/glide/commit/6e910b03c0cbc327b4188bab73c03f440ef59924))

### Tests

* **vloer:** count a killed bridge left as a zombie as gone ([0adc544](https://forgejo.webgrip.dev/webgrip/glide/commit/0adc5447efb2dcbe8f15de567bfff3416a89b49b))
* **vloer:** count the richer Ploeg demo in the feed and summary checks ([3506e94](https://forgejo.webgrip.dev/webgrip/glide/commit/3506e94e356989d721838a7c9afe683c10592920))
* **vloer:** count ui.js builder actions as markup in the registry check ([f11ae92](https://forgejo.webgrip.dev/webgrip/glide/commit/f11ae92b3fb446f90cd830d80ac8c9c8fe066955))
* **vloer:** split the browser check into per-area flows ([3fc0413](https://forgejo.webgrip.dev/webgrip/glide/commit/3fc04138e08b64e631479a1b54c6d1379bcb1009)), references [#16](https://forgejo.webgrip.dev/webgrip/glide/issues/16)

### Style

* **vloer:** drop the duplicate Esc hint from the palette footer ([ce536a2](https://forgejo.webgrip.dev/webgrip/glide/commit/ce536a256eaf82c39ebc194a003aa69111323ed6))
* **vloer:** lay the budget dialog's figures out in two columns ([67cef3c](https://forgejo.webgrip.dev/webgrip/glide/commit/67cef3cd84a78ce0b969cdc676a83f18836a350d))
* **vloer:** line up the shortcut help with labels left and keys right ([cce4a77](https://forgejo.webgrip.dev/webgrip/glide/commit/cce4a779bb8a2ec487865504fb3b44206f02216b))
* **vloer:** polish the session callouts and cards at phone width ([9a6e3fc](https://forgejo.webgrip.dev/webgrip/glide/commit/9a6e3fcfacf679b09677686894eada642b2a650e))

## [glide-v0.4.0-rc.17](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.4.0-rc.16...glide-v0.4.0-rc.17) (2026-09-30)

### Fixed

* **vloer:** settle a command turn when its supervisor dies before the bridge ([ac050ff](https://forgejo.webgrip.dev/webgrip/glide/commit/ac050ffb715c42be290b65d0bdd4f20363bec323))

## [glide-v0.4.0-rc.16](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.4.0-rc.15...glide-v0.4.0-rc.16) (2026-09-30)

### Fixed

* **vloer:** patch npm's bundled brace-expansion and undici in the workspace image ([e8c8d45](https://forgejo.webgrip.dev/webgrip/glide/commit/e8c8d45a6c3adbc4ccf7ba11bf747b8725d03690))

## [glide-v0.4.0-rc.15](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.4.0-rc.14...glide-v0.4.0-rc.15) (2026-09-30)

### Added

* **ploeg:** split a Run's settled spend and tokens per model ([0587669](https://forgejo.webgrip.dev/webgrip/glide/commit/05876692abc5aca65e22f44376fe44cc1aeb21f4))

### Fixed

* **ploeg:** keep claude-code subagents and the advisor on the Run's model ([2c8f8a0](https://forgejo.webgrip.dev/webgrip/glide/commit/2c8f8a0662315dbbab91d91c7a2f21fbca174508))

### Docs

* **ploeg:** propose ADR-0039 on multi-model Runs and the advisor tool ([2b73770](https://forgejo.webgrip.dev/webgrip/glide/commit/2b73770274860bb9cbf5ecded33a467d1f8b5262))

### Tests

* **ploeg:** give the idle-watchdog test room for a slow exec ([47ff826](https://forgejo.webgrip.dev/webgrip/glide/commit/47ff8262e508379022eee9c517946ac8fb53c791))
* **ploeg:** run the talking harness inline so a file scan cannot stall it ([6c9b358](https://forgejo.webgrip.dev/webgrip/glide/commit/6c9b358f88b97712cd0724d8c705ef9f1ba0292f))
* **vloer:** fail a test that never settles and accept a concurrency cap ([cece343](https://forgejo.webgrip.dev/webgrip/glide/commit/cece3433de8e4062c4faf8443190302fefeea3fb))
* **vloer:** run the API demo at 100 ms per step instead of 1 s ([b34a598](https://forgejo.webgrip.dev/webgrip/glide/commit/b34a598c7c8ea66d0a505afc5a65c51a7f5c4044))
* **vloer:** write the stop-signal child's pid file atomically ([3f73be4](https://forgejo.webgrip.dev/webgrip/glide/commit/3f73be4a2ba18503d5a0badcd11b0af9ed9510b2))

## [glide-v0.4.0-rc.14](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.4.0-rc.13...glide-v0.4.0-rc.14) (2026-09-29)

### Fixed

* **ploeg:** write OpenHands agent settings so its ACP session starts ([964d61e](https://forgejo.webgrip.dev/webgrip/glide/commit/964d61e785eee6f66f95c520f9130012f77953cb))

### Internal

* **ploeg:** commit the mise.lock that lockfile = true expects ([6150dd0](https://forgejo.webgrip.dev/webgrip/glide/commit/6150dd067158bcf10d8a45547e8e585868ce3062))

## [glide-v0.4.0-rc.13](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.4.0-rc.12...glide-v0.4.0-rc.13) (2026-09-29)

### Fixed

* **ploeg:** parse YAML with the maintained go.yaml.in/yaml/v3 ([56ff6fb](https://forgejo.webgrip.dev/webgrip/glide/commit/56ff6fb48b84960104e9baf2e9ead5ecb42109e7))

### Docs

* **ploeg:** record the Work Item 138 incident and its non-golden paths ([94a1e51](https://forgejo.webgrip.dev/webgrip/glide/commit/94a1e514b636e3563254c3f87de7517908663a49))
* **ploeg:** state what each archived OpenSpec capability is for ([a389dfa](https://forgejo.webgrip.dev/webgrip/glide/commit/a389dfade9e9ea229f002f238d865cbf4b6acb6e))

### Tests

* **ploeg:** ignore helm's blank line before document separators in chart goldens ([2dddb70](https://forgejo.webgrip.dev/webgrip/glide/commit/2dddb707b2fd548a8f9e4bcecc16b9a372eee159))
* **vloer:** scale the VS Code extension test timeouts on a loaded runner ([1dc24df](https://forgejo.webgrip.dev/webgrip/glide/commit/1dc24df149c7e947979ec9876127a5e5003f8cb8))

## [glide-v0.4.0-rc.12](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.4.0-rc.11...glide-v0.4.0-rc.12) (2026-09-29)

### Added

* **ploeg:** add an openhands ACP profile ([050fa3b](https://forgejo.webgrip.dev/webgrip/glide/commit/050fa3bee5913c0aa45ad174ab0307f0e79f1c2d))

### Fixed

* **vloer:** stop counting reviewed sessions as ready for review ([b88f389](https://forgejo.webgrip.dev/webgrip/glide/commit/b88f3892945866dc9584ed852e1e42ea13bcb3d6))

## [glide-v0.4.0-rc.11](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.4.0-rc.10...glide-v0.4.0-rc.11) (2026-09-28)

### Added

* **ploeg:** withdraw a Work Item whose ticket closes before work starts ([9b79d3c](https://forgejo.webgrip.dev/webgrip/glide/commit/9b79d3c4282408e38d947cea39cce120f13325c1))

## [glide-v0.4.0-rc.10](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.4.0-rc.9...glide-v0.4.0-rc.10) (2026-09-28)

### Fixed

* **ploeg:** fail a Run as infra_node when its sandbox never starts ([d380f52](https://forgejo.webgrip.dev/webgrip/glide/commit/d380f528aac8788f0667cb312e9a7d5e37de858d))

### Docs

* **adr-0038:** accept with the owner's 2026-09-28 routing decisions ([ca7d440](https://forgejo.webgrip.dev/webgrip/glide/commit/ca7d440da4111250eba98e69bb2b615c52a1d07a))
* **adr-0038:** propose repo-label hints over a derived target registry ([138311e](https://forgejo.webgrip.dev/webgrip/glide/commit/138311e3fe5b7f223c66f7261df2de19df57fd9c)), references [#11](https://forgejo.webgrip.dev/webgrip/glide/issues/11)
* **ploeg:** address review of the run-usage report plan ([d85151a](https://forgejo.webgrip.dev/webgrip/glide/commit/d85151a9062005c4e60e7415640592d65a9083ae))
* **ploeg:** plan the PR run-usage report as an OpenSpec change ([ad90a5c](https://forgejo.webgrip.dev/webgrip/glide/commit/ad90a5c6d16e76abc390970d465b9a8f8c01658e)), references [#1305](https://forgejo.webgrip.dev/webgrip/glide/issues/1305)

### Tests

* **vloer:** make time-bound API tests readiness-based and load-tolerant ([7a11286](https://forgejo.webgrip.dev/webgrip/glide/commit/7a112862e8798533fac53c00eeee836ec8e8ee0e))

## [glide-v0.4.0-rc.9](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.4.0-rc.8...glide-v0.4.0-rc.9) (2026-09-28)

### Added

* **ploeg:** give ploegd its own forge URL with executor.forgejo.publicUrl ([8b81996](https://forgejo.webgrip.dev/webgrip/glide/commit/8b81996dad2549053140115d957fbddd1b5dc2f6))

## [glide-v0.4.0-rc.8](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.4.0-rc.7...glide-v0.4.0-rc.8) (2026-09-28)

### Fixed

* **ploeg:** delete a sandbox claim that never becomes ready ([cde904a](https://forgejo.webgrip.dev/webgrip/glide/commit/cde904a606896df4c5b7ffec8695f7749a31b6ed))

### Docs

* **ploeg:** correct sandbox executor qualification and split its remaining work ([e7c596f](https://forgejo.webgrip.dev/webgrip/glide/commit/e7c596f3a81c1819febea84375d6f91f2a516faf)), references [#58](https://forgejo.webgrip.dev/webgrip/glide/issues/58) [#126](https://forgejo.webgrip.dev/webgrip/glide/issues/126) [#127](https://forgejo.webgrip.dev/webgrip/glide/issues/127) [#89](https://forgejo.webgrip.dev/webgrip/glide/issues/89)
* **ploeg:** drop an anchor link that strict mkdocs rejects ([d85c0d0](https://forgejo.webgrip.dev/webgrip/glide/commit/d85c0d084e1f42550ec9b5dbb4f82f0aec598836)), references [#127](https://forgejo.webgrip.dev/webgrip/glide/issues/127) [#58](https://forgejo.webgrip.dev/webgrip/glide/issues/58) [#58](https://forgejo.webgrip.dev/webgrip/glide/issues/58)
* **ploeg:** propose ADR-0036, the escalation ladder for stuck Work Items ([e6857c9](https://forgejo.webgrip.dev/webgrip/glide/commit/e6857c9384c533fd068ff96d87deb301d702741b)), references [#3](https://forgejo.webgrip.dev/webgrip/glide/issues/3)
* **ploeg:** record the kind runner blocker for the sandbox e2e ([8fa3440](https://forgejo.webgrip.dev/webgrip/glide/commit/8fa34402dbb82565351359a65cbd5b41f41928a2)), references [#127](https://forgejo.webgrip.dev/webgrip/glide/issues/127)
* **ploeg:** record the owner's 2026-09-28 decisions in ADR-0036 ([d039b3c](https://forgejo.webgrip.dev/webgrip/glide/commit/d039b3cf5cb3e37d17d842de72b8d140bde8fce8))

### Tests

* **ploeg:** pin the LLM undercut guard at the column rounding boundary ([9ab3ae1](https://forgejo.webgrip.dev/webgrip/glide/commit/9ab3ae1cc7fbab72bfa88cfcd7c7a6db88806635))
* **ploeg:** start embedded Postgres on an OS-assigned port ([4623bd1](https://forgejo.webgrip.dev/webgrip/glide/commit/4623bd14fb247881ba25e75d45ff491c28262ea2))

## [glide-v0.4.0-rc.7](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.4.0-rc.6...glide-v0.4.0-rc.7) (2026-09-28)

### Fixed

* **ploeg:** name the sandbox claim apart from the launcher pod ([c360b7f](https://forgejo.webgrip.dev/webgrip/glide/commit/c360b7f0913fded682244ea2f1278a473d64e097))

### Docs

* **adr-0035:** state exactly what a Run's worker pod can reach on the network ([7705d2b](https://forgejo.webgrip.dev/webgrip/glide/commit/7705d2be7e5c6c394968f51e71faba65534c97cb))

## [glide-v0.4.0-rc.6](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.4.0-rc.5...glide-v0.4.0-rc.6) (2026-09-28)

### Added

* **ploeg:** per-team and per-role sandbox RuntimeClass ([23f7e44](https://forgejo.webgrip.dev/webgrip/glide/commit/23f7e44f655bc6e194879be777cf4c835a5055e4))

### Fixed

* **ploeg:** settle blocked LLM accounts at run_llm_accounts' column precision ([13ef6d2](https://forgejo.webgrip.dev/webgrip/glide/commit/13ef6d2aa586e85f2fe8cdd3572aea62d59541d4))

### Docs

* **vloer:** note current GAP-17 status in the gap register ([7acee0c](https://forgejo.webgrip.dev/webgrip/glide/commit/7acee0c976b0479846edbe7f4417e92910ba5692))

### Tests

* **ploeg:** refuse a non-string sandbox RuntimeClass ([327f548](https://forgejo.webgrip.dev/webgrip/glide/commit/327f5482b3b7f1e5cb0829c1ba8eb5a15b53d4ea))

## [glide-v0.4.0-rc.5](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.4.0-rc.4...glide-v0.4.0-rc.5) (2026-09-27)

### Fixed

* **ploeg:** give the harness the configured model name, prefix intact ([7dd8506](https://forgejo.webgrip.dev/webgrip/glide/commit/7dd850632e1be8ba4e94f63884a0ddb56a9f05ab))

### Tests

* **vloer:** give the HTTP demo session room on a contended runner ([1673e2b](https://forgejo.webgrip.dev/webgrip/glide/commit/1673e2b2e12470c4f0d1351829e5c3b74e7865af))

## [glide-v0.4.0-rc.4](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.4.0-rc.3...glide-v0.4.0-rc.4) (2026-09-27)

### Added

* **ploeg:** add qwen-code and goose ACP profiles ([fca571a](https://forgejo.webgrip.dev/webgrip/glide/commit/fca571ad03eabd1fcd7c56a8851f3e90032411d9))
* **ploeg:** execute a Work Item from the OpenSpec change it names ([5032aed](https://forgejo.webgrip.dev/webgrip/glide/commit/5032aedd5f5fd7eb76bc604cbb992e73cb97a502))
* **ploeg:** give Runs mounted toolchains, Ploeg skills and a worker-run verification ([e92913e](https://forgejo.webgrip.dev/webgrip/glide/commit/e92913eeda3351a774039291b2feec089b4ef0b0))

### Fixed

* **ploeg:** close an approved review loop as approved ([34ba8ad](https://forgejo.webgrip.dev/webgrip/glide/commit/34ba8ad90b357d1caffc26314a83a5953e0193d2)), references [#115](https://forgejo.webgrip.dev/webgrip/glide/issues/115)
* **ploeg:** mint per-run Forgejo tokens that reach only the Run's repository ([bc7603a](https://forgejo.webgrip.dev/webgrip/glide/commit/bc7603aed26da5925b4aedbcf85c09bf4b8e6be7))
* **ploeg:** reject forge webhooks when no secret is configured ([6c4a4a5](https://forgejo.webgrip.dev/webgrip/glide/commit/6c4a4a5ab60c81618bb565ebc750683f61fdd30b))

### Docs

* **ploeg:** cite the pushed commit in close-the-review-loop task 5.1 ([eb5cd11](https://forgejo.webgrip.dev/webgrip/glide/commit/eb5cd113358ecd42d37ab1614253f2449581cdeb))
* **ploeg:** propose executing a Work Item from the OpenSpec change it names ([407eaab](https://forgejo.webgrip.dev/webgrip/glide/commit/407eaab725e3dcae351bc498eabe9dc3c07897b4))
* **ploeg:** record ADR-0035 and the toolchain-and-checks runbook ([c44419a](https://forgejo.webgrip.dev/webgrip/glide/commit/c44419ad3c80725a4daccd493fd2779433b71bf3))
* **ploeg:** record close-the-review-loop progress ([2191afb](https://forgejo.webgrip.dev/webgrip/glide/commit/2191afb7e1e52de6c6525c3525a76aab1c3ef133))

### Tests

* **ploeg:** pin infra_node on a failed push-credential mint and document each failure reason's writers ([62d9729](https://forgejo.webgrip.dev/webgrip/glide/commit/62d9729f8a6da6186a198e94768d9381c6d75f4e))

## [glide-v0.4.0-rc.3](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.4.0-rc.2...glide-v0.4.0-rc.3) (2026-09-27)

### Added

* **ploeg:** let one team run under the sandbox executor ([b40cfd5](https://forgejo.webgrip.dev/webgrip/glide/commit/b40cfd58673ff3a46e75aa491fc93a6b9456f454))

### Docs

* **ploeg:** archive the add-agent-sandbox-executor change ([2edcbde](https://forgejo.webgrip.dev/webgrip/glide/commit/2edcbdee86d1cb36a60da4c721a8e4107b9a090a))

## [glide-v0.4.0-rc.2](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.4.0-rc.1...glide-v0.4.0-rc.2) (2026-09-27)

### Fixed

* **vloer:** record the zlib CVE-2026-85091 exposure of the workspace image and enforce it ([657c522](https://forgejo.webgrip.dev/webgrip/glide/commit/657c5228244501e79ce6c4af91520fa039a1be95))

## [glide-v0.4.0-rc.1](https://forgejo.webgrip.dev/webgrip/glide/compare/glide-v0.3.0...glide-v0.4.0-rc.1) (2026-09-27)

### Added

* **docs:** enforce page front matter and report stale pages ([dd481b2](https://forgejo.webgrip.dev/webgrip/glide/commit/dd481b2ec4ee0a2bc4945a937a9e189d78fe1600))
* **docs:** publish Glide through Zensical with source exports ([b5c38f0](https://forgejo.webgrip.dev/webgrip/glide/commit/b5c38f047097797546364388ddd8bee250dbd0a6))
* **ploeg:** act on failed checks and requested changes behind a team switch ([5083412](https://forgejo.webgrip.dev/webgrip/glide/commit/508341292dab0f48dedd60485beed80fa2a6940c))
* **ploeg:** add an experimental agent-sandbox executor ([29b13e3](https://forgejo.webgrip.dev/webgrip/glide/commit/29b13e349e4e1de2bc8c8e1413a46fe79d62d83c))
* **ploeg:** add operator activity summary, Run list and newest-first events ([5a83779](https://forgejo.webgrip.dev/webgrip/glide/commit/5a8377963174646fc988324b6a708fc0b3007ff6))
* **ploeg:** add optional ServiceMonitor and PrometheusRule to the chart ([b2c6283](https://forgejo.webgrip.dev/webgrip/glide/commit/b2c62832ad548bac6b8d4e075ca2b15e87ca728b)), references [#39](https://forgejo.webgrip.dev/webgrip/glide/issues/39)
* **ploeg:** cap running Runs per team and drop the unused queue depth route ([1161be9](https://forgejo.webgrip.dev/webgrip/glide/commit/1161be95dac1957d58bf50c3f994c347415db76f))
* **ploeg:** expose operational gauges at GET /metrics ([6ee3a09](https://forgejo.webgrip.dev/webgrip/glide/commit/6ee3a095bb915929aa9e880d32728e01c0ea4b5e)), references [#39](https://forgejo.webgrip.dev/webgrip/glide/issues/39)
* **ploeg:** keep a writer's forge token out of the harness ([042cf08](https://forgejo.webgrip.dev/webgrip/glide/commit/042cf08c9198b24ad3ea7593857ca165bb66df05))
* **ploeg:** keep the per-Run model key out of the harness ([10d98b1](https://forgejo.webgrip.dev/webgrip/glide/commit/10d98b1aee80ef2d5abdc8de9e7c358a5a85223d))
* **ploeg:** let a Run create Work Items that wait for approval ([a8e986e](https://forgejo.webgrip.dev/webgrip/glide/commit/a8e986ee8ce0148a24a7415055c14b5f6e19ac89))
* **ploeg:** let sandbox Runs carry an egress allowlist ([af06bbc](https://forgejo.webgrip.dev/webgrip/glide/commit/af06bbc701c8cadde0afa96cf4f088583671a68f))
* **ploeg:** never hand a reading Role the read-write forge token ([3f836e0](https://forgejo.webgrip.dev/webgrip/glide/commit/3f836e054f1010c320c8dfe0098ca7f656d1534a))
* **ploeg:** rank repository instructions below the delivery contract in the worker prompt ([1b0f21f](https://forgejo.webgrip.dev/webgrip/glide/commit/1b0f21f2c9183a5e98f8ce941251c9e86768c284))
* **ploeg:** record gateway tokens and models on settled Runs ([8148c1d](https://forgejo.webgrip.dev/webgrip/glide/commit/8148c1d495027fc6257bb7a5b82acad10134e7ba))
* **ploeg:** report Vikunja projects that have no Ploeg webhook ([3913543](https://forgejo.webgrip.dev/webgrip/glide/commit/3913543d3d23a4bd20727558787e27e6e723d503))
* **ploeg:** say so when a Shift runs out of budget ([b7e5157](https://forgejo.webgrip.dev/webgrip/glide/commit/b7e515786895600af311ef13578f79e88acb34d9))
* **ploeg:** scan agent instruction files before the harness runs ([1a4cedd](https://forgejo.webgrip.dev/webgrip/glide/commit/1a4cedd61e74d4b86fd5ddc4ae6f2b7538e2b618))
* **ploeg:** settle awaiting_review items when their pull request merges or closes ([cfd6ec4](https://forgejo.webgrip.dev/webgrip/glide/commit/cfd6ec41ffbcc2bb74403e1769b6b03885119a49))
* **ploeg:** settle successful Shifts as awaiting_review ([8af4b75](https://forgejo.webgrip.dev/webgrip/glide/commit/8af4b755ec491b86efcf2b8ede72ea296d1e39cc))
* **ploeg:** stop target repository hooks and MCP servers under claude-code ([74c925f](https://forgejo.webgrip.dev/webgrip/glide/commit/74c925f00cae9c26040d77335bdccc5c5fd4985d))
* **ploeg:** withdraw tracker work on unassignment or operator cancel ([bcec68c](https://forgejo.webgrip.dev/webgrip/glide/commit/bcec68c94169af293e702f0a7dadbfaa461716a2))
* **vloer:** accept Ploeg's awaiting_review work item state ([9a6d8e4](https://forgejo.webgrip.dev/webgrip/glide/commit/9a6d8e4650248ceeba1388d91eb7e1a303cf0614))
* **vloer:** accept the proposed Ploeg work-item state ([5cd6741](https://forgejo.webgrip.dev/webgrip/glide/commit/5cd67417100c8a586f1148f42163ad21a9963029))
* **vloer:** accept the withdrawn Ploeg work-item state ([9b2a0eb](https://forgejo.webgrip.dev/webgrip/glide/commit/9b2a0ebedf7a3c82c00c2acc40ee297c3d63dd0b))
* **vloer:** add an Awaiting review lane and a read-only review screen ([695cc21](https://forgejo.webgrip.dev/webgrip/glide/commit/695cc214f62e907167b35e9017f8b0e5c912500c))
* **vloer:** show what Ploeg has been doing ([e7080a2](https://forgejo.webgrip.dev/webgrip/glide/commit/e7080a26f488a507820c764650219145c1653ec2))

### Fixed

* **adr:** make the Vloer ledger pass the consistency validator ([1a5089a](https://forgejo.webgrip.dev/webgrip/glide/commit/1a5089a17710b5536d99a988dcf78241644decd1))
* **ploeg:** bound hung harness runs with a timeout and an idle watchdog ([76494d1](https://forgejo.webgrip.dev/webgrip/glide/commit/76494d17a22b93c56884239b8c867ca76e49044a))
* **ploeg:** call the unit of work a Work Item in the agent prompt ([d8dbe1c](https://forgejo.webgrip.dev/webgrip/glide/commit/d8dbe1c13e3115bbfb51854dd9a8a7fcdc6f9a29))
* **ploeg:** cancel operator admissions that expire unstarted ([4e081cf](https://forgejo.webgrip.dev/webgrip/glide/commit/4e081cff42d5a0f496c34a9384eba2902768aef1))
* **ploeg:** check the harness program exists before claiming ([1a10e6a](https://forgejo.webgrip.dev/webgrip/glide/commit/1a10e6a5af0f957985c55a49f33a3d8fef8edde0))
* **ploeg:** default the chart's lease TTL to 5m ([7695f95](https://forgejo.webgrip.dev/webgrip/glide/commit/7695f9554436bafc3c1cb618957d04fd5f09e245))
* **ploeg:** derive the work branch from the item's tracker ([2b8f094](https://forgejo.webgrip.dev/webgrip/glide/commit/2b8f094b22db4dce9f053679deabb0679db366a1))
* **ploeg:** fund managed Runs on Shifts without a budget pool ([2a733ce](https://forgejo.webgrip.dev/webgrip/glide/commit/2a733cefb16bed37d27f4af437b53c052f22f777))
* **ploeg:** hide the worker's environment from the harness it starts ([8f0f641](https://forgejo.webgrip.dev/webgrip/glide/commit/8f0f64148ffc0f7c8ed290ee17cadc7931ce350c))
* **ploeg:** name Glide as the Helm chart's source ([aea663f](https://forgejo.webgrip.dev/webgrip/glide/commit/aea663ff7981673fea4aee623145df63bba5131b))
* **ploeg:** park an exhausted plan whose last review asked for changes ([121b345](https://forgejo.webgrip.dev/webgrip/glide/commit/121b345b7024443a25db5d64a2e4ad3ea34a2785)), references [webgrip/ploeg#43](https://forgejo.webgrip.dev/webgrip/ploeg/issues/43)
* **ploeg:** put only a minted forge token in a claim response ([0dc8c1a](https://forgejo.webgrip.dev/webgrip/glide/commit/0dc8c1ab61806f57d65b388917e8fec505509ea5)), references [webgrip/ploeg#45](https://forgejo.webgrip.dev/webgrip/ploeg/issues/45)
* **ploeg:** record why a Run that opened a PR then failed ([9ee3ce4](https://forgejo.webgrip.dev/webgrip/glide/commit/9ee3ce468de97e53b18948779641d22c7089434c)), references [webgrip/ploeg#45](https://forgejo.webgrip.dev/webgrip/ploeg/issues/45)
* **ploeg:** repair only pull requests that are still awaiting review ([5afc6d2](https://forgejo.webgrip.dev/webgrip/glide/commit/5afc6d2d2ae14d6d2bc35abbe649ec9731c1eeba))
* **ploeg:** report only webhook coverage counts on the unauthenticated readiness probe ([1da5d8e](https://forgejo.webgrip.dev/webgrip/glide/commit/1da5d8ea8d4446cefac8c7184a4ea89acc57d73d))
* **ploeg:** settle finished managed inference accounts from the controller ([7b5054c](https://forgejo.webgrip.dev/webgrip/glide/commit/7b5054c9168ade6d6185546f2ba84bf730ba426c))
* **ploeg:** settle managed accounts from LiteLLM spend logs ([dc0fbfe](https://forgejo.webgrip.dev/webgrip/glide/commit/dc0fbfeccae1da0247665097961cad06dfe98eae))
* **release:** publish verified Glide artifacts to internal and public registries ([d0de432](https://forgejo.webgrip.dev/webgrip/glide/commit/d0de4329e2fef32864ac8bf1c1eaa6533f5b457f))
* **vloer:** bound agent host connection tokens and revoke them on sign-out ([d21c384](https://forgejo.webgrip.dev/webgrip/glide/commit/d21c384813607d160fcc0d87cf6fe456b62ce6bf))
* **vloer:** give the demo core test room on a contended runner ([083cec6](https://forgejo.webgrip.dev/webgrip/glide/commit/083cec608606e8fc115b750c6bdfe1496441f32c))
* **vloer:** keep sessions with a persisted Ploeg admission intent managed ([a5161dc](https://forgejo.webgrip.dev/webgrip/glide/commit/a5161dc121bc3eb815c8b0f7533b7823b76ead42))
* **vloer:** let the stop-signal test observe the child's exit on a busy runner ([2b2e02d](https://forgejo.webgrip.dev/webgrip/glide/commit/2b2e02de231057986520fa9c4cff45efeca4ec4f))
* **vloer:** name Glide as the Helm chart's source ([45525b1](https://forgejo.webgrip.dev/webgrip/glide/commit/45525b1734dc156ae8352f3159d36c8940488fe8))
* **vloer:** refuse standalone budget increases while a model key is live ([2826085](https://forgejo.webgrip.dev/webgrip/glide/commit/2826085427d06257403dc40db7eecd42a91e9172))
* **vloer:** reject an external OpenCode endpoint in live configuration ([bcd17c8](https://forgejo.webgrip.dev/webgrip/glide/commit/bcd17c8aeabcab5aed82a4cee2862c2dd17b958d))

### Changed

* **ploeg:** remove the unused CanTransition lifecycle table ([3177c18](https://forgejo.webgrip.dev/webgrip/glide/commit/3177c189fa054ed85c3e2c0716450dcca3c9435d)), references [#11](https://forgejo.webgrip.dev/webgrip/glide/issues/11)

### Docs

* **adr:** record the 2026-09-17 agent host roadmap sweep ([d070083](https://forgejo.webgrip.dev/webgrip/glide/commit/d070083a1a3d40b0963887ec5365941160339490)), references [AHP#266](https://forgejo.webgrip.dev/AHP/issues/266)
* **agents:** trim instruction files to non-inferable rules and bridge CLAUDE.md ([fff967a](https://forgejo.webgrip.dev/webgrip/glide/commit/fff967af93ee4672da3e26c2df2114eba4ef8fc4))
* align Vloer pages with ADR-0002 and the combined glossary ([ad05791](https://forgejo.webgrip.dev/webgrip/glide/commit/ad057917a423d1aa04569c8d47f25a4aaed89508))
* describe forge events that create and return work ([5aa118c](https://forgejo.webgrip.dev/webgrip/glide/commit/5aa118cd65681a72283d48ddf0285eb6a3a5f51e))
* **domain:** unify the glossaries under Ploeg's execution vocabulary ([35d5f83](https://forgejo.webgrip.dev/webgrip/glide/commit/35d5f83b4bd2d61428e3d8dc84e9ca0a02c9112c))
* link real pages instead of redirect stubs and archived repositories ([5c3cab4](https://forgejo.webgrip.dev/webgrip/glide/commit/5c3cab48f5f79ca1053179b48dfcaf3fd0caee69))
* make the Work Item the unit of work and let work create work ([efa9999](https://forgejo.webgrip.dev/webgrip/glide/commit/efa99993eaa7ffb83e3f8eae7a67bb17856d8383))
* mark the Ploeg and Vloer backlogs as frozen planning records ([4f63bb5](https://forgejo.webgrip.dev/webgrip/glide/commit/4f63bb5e862f76a97a2c9b7395948bfb04f58a1c))
* **ploeg:** add operator runbooks as how-to pages ([373e3b4](https://forgejo.webgrip.dev/webgrip/glide/commit/373e3b4f201fdb11369db6a56f1e76b2b68020ce))
* **ploeg:** describe the metrics and what to check for each alert ([74fdb49](https://forgejo.webgrip.dev/webgrip/glide/commit/74fdb49e197c7b391636db575dd5563f9ffbe526)), references [#39](https://forgejo.webgrip.dev/webgrip/glide/issues/39)
* **ploeg:** generate the configuration reference from source and chart ([0cd0d40](https://forgejo.webgrip.dev/webgrip/glide/commit/0cd0d403982df1c3e68063a744f6c2aa96bbfbda))
* **ploeg:** propose ADRs 0032 and 0033 from the landscape survey ([901672c](https://forgejo.webgrip.dev/webgrip/glide/commit/901672caef5bb2d53f8b8cb610103208f8751677))
* **ploeg:** propose ranking target repository instructions below the delivery contract ([90bf7e9](https://forgejo.webgrip.dev/webgrip/glide/commit/90bf7e9b39d369f5e99fc4b1b137d9f93a30a860))
* **ploeg:** record the 20k-star agent-orchestration landscape fit survey ([8c14229](https://forgejo.webgrip.dev/webgrip/glide/commit/8c14229acb5cfc07df00a767ec8b2ab7ce968d47))
* **ploeg:** regenerate the configuration reference after merges ([89a419e](https://forgejo.webgrip.dev/webgrip/glide/commit/89a419e0ff8f7e71a0357d50d04680f8427d44dc))
* **ploeg:** regenerate the configuration reference for concurrency caps ([c3c22f2](https://forgejo.webgrip.dev/webgrip/glide/commit/c3c22f226234af7ad2b34f1b48b2ba494d74d008))
* **ploeg:** regenerate the configuration reference for metrics settings ([960b3b5](https://forgejo.webgrip.dev/webgrip/glide/commit/960b3b5673a632eb4b7da02b4c41a63e2f974465))
* record how Runs create Work Items and the open owner questions ([276b4f6](https://forgejo.webgrip.dev/webgrip/glide/commit/276b4f6e18b701eddcabd5034742c79087a5e010))
* **research:** add gateway budget enforcement and AG2 Network to the BAND survey ([a5284ab](https://forgejo.webgrip.dev/webgrip/glide/commit/a5284abfd957937ebc548e59fd8076a15e453adb))
* **research:** correct two overstated claims in the BAND survey ([6c79455](https://forgejo.webgrip.dev/webgrip/glide/commit/6c794553b3cc54d5136ca3946efbe761e49d9ea1))
* **research:** refresh the coding-agent workbench category and correct Kandev ([a1af030](https://forgejo.webgrip.dev/webgrip/glide/commit/a1af030fcd64fec84171ff1ec699016693c43847))
* **research:** survey BAND and the agent interaction layer ([4a0f922](https://forgejo.webgrip.dev/webgrip/glide/commit/4a0f92231da4f78dc862c9c6c98577277c20441a))
* **research:** verify the MCP absences against the normative schema ([7e11295](https://forgejo.webgrip.dev/webgrip/glide/commit/7e11295d323cc99e9f43d3b99da6b73e5d9d83c2))
* **vloer:** align the HTTP contract and architecture map with the code ([0554ba7](https://forgejo.webgrip.dev/webgrip/glide/commit/0554ba77284fcbeb18a744cecc67e05291336408))
* **vloer:** propose Vloer as Ploeg's front end ([c0c74f6](https://forgejo.webgrip.dev/webgrip/glide/commit/c0c74f6ce656644d48b27a929aea1c1c43e63595))
* **vloer:** remove the duplicate product model and its moved-page stubs ([a9db6c3](https://forgejo.webgrip.dev/webgrip/glide/commit/a9db6c3e46ab50b0488b582a2afae8bd824149a9))

### Tests

* **integration:** mint and block managed keys against a fake LiteLLM ([b647359](https://forgejo.webgrip.dev/webgrip/glide/commit/b64735985715d019a3a93583d530fa58d7724629))
* **ploeg:** add opt-in canary conformance for harness instruction loading ([88eff28](https://forgejo.webgrip.dev/webgrip/glide/commit/88eff280b889f39c66370e3ec8651e237fa5bafe))
* **ploeg:** drain launcher output before noise assertions ([ac0d4a3](https://forgejo.webgrip.dev/webgrip/glide/commit/ac0d4a37012c10ed107f8860f076782590160ee6))
* **ploeg:** let parallel runs offset the embedded Postgres ports ([352fa52](https://forgejo.webgrip.dev/webgrip/glide/commit/352fa52df121070d69072b64daa99bb8d1350ba0))
* **ploeg:** run a fake claude to prove target hooks and MCP servers stay off ([29d3c7e](https://forgejo.webgrip.dev/webgrip/glide/commit/29d3c7ed805d2ae72cb75ee90d8176d27fd22dac))

### Build

* **vloer:** install OpenCode only for the tasks that run it ([09ef2f7](https://forgejo.webgrip.dev/webgrip/glide/commit/09ef2f7c864584e3c2a6c559a8c1529e85f5e094))

### CI

* align Glide with Webgrip workflow entry points ([f1de145](https://forgejo.webgrip.dev/webgrip/glide/commit/f1de145a22a747e3e6379380b8d7cff1d9d265da))
* hold the Ploeg image to a CVE budget before signing ([97bd509](https://forgejo.webgrip.dev/webgrip/glide/commit/97bd5099022b96ca714749177fb5a8fc614f8ec7))
* **release:** hold Vloer at zero-major and watch the imported release notes ([17d1770](https://forgejo.webgrip.dev/webgrip/glide/commit/17d17708ca60f691fdd555207bd9eebfe596278e))
* **release:** release Vloer and Ploeg under one Glide version ([01abe06](https://forgejo.webgrip.dev/webgrip/glide/commit/01abe0623c38441cad3c79552512b6314f8cf678))

### Internal

* **ci:** remove the application workflow symlinks ([8b54056](https://forgejo.webgrip.dev/webgrip/glide/commit/8b54056639f84c7ac55d954993ceee3eafeffc1d))
* drop application mise tasks that duplicate root tasks ([475aafd](https://forgejo.webgrip.dev/webgrip/glide/commit/475aafd79d7ac6b7ce004abf316e989fe807e18d))
* **ploeg:** archive the six completed OpenSpec changes ([84885af](https://forgejo.webgrip.dev/webgrip/glide/commit/84885afc0052caba53ffa7c298012ea36cdb601b))
* **ploeg:** remove the uncalled Worker.Run shim ([ba82736](https://forgejo.webgrip.dev/webgrip/glide/commit/ba82736c9f6c6cb77d4a871dd8ad2df104611813))
* remove duplicated and orphaned files left by the import ([b0947f6](https://forgejo.webgrip.dev/webgrip/glide/commit/b0947f6ef8b2f8b5cd15d20b7d442175debbf932))
* **vloer:** remove AgentHost.revokeToken, which no route reaches ([abeacfb](https://forgejo.webgrip.dev/webgrip/glide/commit/abeacfbf662f7bb2b963d382325490d12d65e560))
* **vloer:** remove the unapplied Ploeg patch ([b23fa65](https://forgejo.webgrip.dev/webgrip/glide/commit/b23fa650401b02dee3159891254ade2ac94ea683))
* **vloer:** remove the uncalled LiteLLMBroker.revokeSession ([2733157](https://forgejo.webgrip.dev/webgrip/glide/commit/27331572aa0a1a333ca5ea51a16f8bb373b0729e))
* **vloer:** remove the unused broker extend operation ([87cd2a2](https://forgejo.webgrip.dev/webgrip/glide/commit/87cd2a266c88c20f5b91a55b097b2aa85acda761))
