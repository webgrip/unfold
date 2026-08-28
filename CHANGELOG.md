## [0.2.1-rc.1](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.2.0...v0.2.1-rc.1) (2026-08-28)

### Fixed

* **brand:** clip the Klei under the steel so it can't bleed through the edges ([0abd5e8](https://forgejo.webgrip.dev/webgrip/ploeg/commit/0abd5e8eab6ebe8eee2a6c12c0e729dae1174915))

### Docs

* **agents:** stop telling agents to docker-pull the gate toolchain ([df312cb](https://forgejo.webgrip.dev/webgrip/ploeg/commit/df312cbf44b64e99a8756b98ed709532bdbbfa9e))
* **changelog:** backfill 28 empty entries — the notes toolchain dropped every commit line ([debf0cb](https://forgejo.webgrip.dev/webgrip/ploeg/commit/debf0cb53355f010ef7337452ffe2dd50c3eda13)), references [#10](https://forgejo.webgrip.dev/webgrip/ploeg/issues/10) [#57](https://forgejo.webgrip.dev/webgrip/ploeg/issues/57) [#131](https://forgejo.webgrip.dev/webgrip/ploeg/issues/131)

## [0.2.0](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.1.0...v0.2.0) (2026-08-27)

### Added

* **api:** role-scoped claim, findings on the outcome, role-filtered depth ([41b497d](https://forgejo.webgrip.dev/webgrip/ploeg/commit/41b497d52a2c6b83aeb205801acadef6a20f6a67))
* bind the work target to the work item, not to the team ([79a7ac9](https://forgejo.webgrip.dev/webgrip/ploeg/commit/79a7ac9b8a9b62c7735f9aa23e3c305b1e002f03)), references [#97](https://forgejo.webgrip.dev/webgrip/ploeg/issues/97) [97/#103](https://forgejo.webgrip.dev/webgrip/ploeg/issues/103) [#104-108](https://forgejo.webgrip.dev/webgrip/ploeg/issues/104-108)
* **chart:** one workload per (team, Role), and a waiver keyed to the hazard ([ac34700](https://forgejo.webgrip.dev/webgrip/ploeg/commit/ac34700a20e66c42acaff29b59d3d5e5be03ea6d))
* **chart:** worker ServiceAccount and per-Role resources ([12896f5](https://forgejo.webgrip.dev/webgrip/ploeg/commit/12896f5c6c7e144efb86eb504cb6ba04940d4a6a))
* **config:** routing and roster as a file, and push rights minted per Run ([3c455da](https://forgejo.webgrip.dev/webgrip/ploeg/commit/3c455dac3b2b9f067dd8d58cc034bd57c8e0e80e)), references [#26](https://forgejo.webgrip.dev/webgrip/ploeg/issues/26)
* **deps:** update docker.io/golang docker tag ( 1.24 ➔ 1.26 ) ([999eda8](https://forgejo.webgrip.dev/webgrip/ploeg/commit/999eda8942e83d47c31d8144171fbb4fc511417d))
* **deps:** Update postgres Docker tag ( 17 ➔ 18 ) ([41cba65](https://forgejo.webgrip.dev/webgrip/ploeg/commit/41cba65819694ce00ed58ae7c0e764eada76d4c4))
* **dispatch:** every queued item gets a Shift, behind a kill switch ([c9ccf55](https://forgejo.webgrip.dev/webgrip/ploeg/commit/c9ccf55c16b0dc240402943cd066c72f0de716ec))
* **harness:** ACP driver, client half, and the coder/acp-go-sdk dependency ([864249a](https://forgejo.webgrip.dev/webgrip/ploeg/commit/864249aabf13cd071033228a96a19e9958b1e39a))
* **harness:** ACP event and stop-reason semantics (no SDK, no process) ([eceee69](https://forgejo.webgrip.dev/webgrip/ploeg/commit/eceee69a3013563955f02d08e950d47e124780d2)), references [#64](https://forgejo.webgrip.dev/webgrip/ploeg/issues/64)
* **harness:** ACP permission policy for unattended runs ([a6285f7](https://forgejo.webgrip.dev/webgrip/ploeg/commit/a6285f7d2930f0fbe7b9f7b4e633ca04c9ec9ad7))
* **harness:** ACP subprocess layer — process groups, stdout demux, async stdin ([a0530d6](https://forgejo.webgrip.dev/webgrip/ploeg/commit/a0530d640f0c2afb6e7610e55dc60705360a2aaf))
* **httpapi:** forge webhook ingest — verified, deduplicated, audited ([c70208d](https://forgejo.webgrip.dev/webgrip/ploeg/commit/c70208d7357118c459108788911515616e3314a7)), references [#2](https://forgejo.webgrip.dev/webgrip/ploeg/issues/2) [#3](https://forgejo.webgrip.dev/webgrip/ploeg/issues/3) [#107](https://forgejo.webgrip.dev/webgrip/ploeg/issues/107) [#9](https://forgejo.webgrip.dev/webgrip/ploeg/issues/9)
* **plan:** team plan config, parsed at boot, rendered dark from the chart ([67206d7](https://forgejo.webgrip.dev/webgrip/ploeg/commit/67206d75420b4cde28286eba8880c6d2464098db))
* pluggable harness, agent image, LLM broker, and executor seams ([08c40ea](https://forgejo.webgrip.dev/webgrip/ploeg/commit/08c40ea3fde02ff146573a48b293cfc254b6073c)), references [66/#69](https://forgejo.webgrip.dev/webgrip/ploeg/issues/69)
* **provider:** findings reach the pull request, and a person is asked to merge ([a8539db](https://forgejo.webgrip.dev/webgrip/ploeg/commit/a8539db202d704737964a78bd8f49e9fbb23c3f5))
* **provider:** GitLab forge and ClickUp tracker providers ([794eafc](https://forgejo.webgrip.dev/webgrip/ploeg/commit/794eafc056e5c5899e53179904e463eab42aa307))
* run forensics survive pod/job cleanup — node+pod identity in logs+checkpoints, failure-reason taxonomy, VIK-586 fix ([ec2f000](https://forgejo.webgrip.dev/webgrip/ploeg/commit/ec2f000b634e3ce7d226192f01567ab3669021a8))
* **shiftengine:** open, advance, close and park Shifts ([10e2972](https://forgejo.webgrip.dev/webgrip/ploeg/commit/10e29721c43b4fc83737233d9521f77645b66f33))
* **shiftengine:** verdict-driven fix rounds, bounded by pool then cap ([2c5ba9d](https://forgejo.webgrip.dev/webgrip/ploeg/commit/2c5ba9d19477f9db60b04e20cf1649762679efb0))
* **store:** settlement, per-Run liveness, and the round-completion signal ([6ee978c](https://forgejo.webgrip.dev/webgrip/ploeg/commit/6ee978ce2fdafefbf036f7b2fa044a53c18bd18f))
* **store:** shift lifecycle completions and shift-run plumbing fixes ([3b5bf76](https://forgejo.webgrip.dev/webgrip/ploeg/commit/3b5bf76d468c04f3aaefa52049e2ce5ba4b01da6))
* **store:** Shifts — rounds, reader/writer runs, and pooled budgets ([dd0b8ca](https://forgejo.webgrip.dev/webgrip/ploeg/commit/dd0b8ca2e7f4c7ee1b703fc57f2ab188637a1ed4))
* **worker:** role-aware runs — claim, prompt, budget, findings drop box ([c40f985](https://forgejo.webgrip.dev/webgrip/ploeg/commit/c40f9858d0b9b20dde1113b13c9a08f206da7be0)), references [#9](https://forgejo.webgrip.dev/webgrip/ploeg/issues/9)
* **worker:** select the ACP harness from the registry, env and chart ([57d225e](https://forgejo.webgrip.dev/webgrip/ploeg/commit/57d225edd3207318c325723193fc707a66257aee))

### Fixed

* **adrs:** revert the ADR-0017 index edit — upstream had already resolved it ([721630d](https://forgejo.webgrip.dev/webgrip/ploeg/commit/721630de5623062a84e0c80e15bf7eac5083da30))
* apply PR review round 2 — ExpectsLLM, VIK-586 heuristic, gofmt, FailureReason naming ([dbb10da](https://forgejo.webgrip.dev/webgrip/ploeg/commit/dbb10dac8b3f124a9fffb9f01ea71f3ac7c1ee3b))
* assignment webhooks revive finished work items ([30558e5](https://forgejo.webgrip.dev/webgrip/ploeg/commit/30558e5f3ff032c161d41665ae5b121f32764284))
* **chart:** three defects found by running rc.13 in production ([11d2284](https://forgejo.webgrip.dev/webgrip/ploeg/commit/11d2284ebe54411285fa0c0b7092145d6888f4a9))
* **ci:** adopt the shared forgejo-distribute reusable for the Forgejo mirror ([5d524a9](https://forgejo.webgrip.dev/webgrip/ploeg/commit/5d524a9b5cd57cd28eadf1d2858e035187fc242d))
* **ci:** assert image labels on parsed JSON, not on rendered text ([34fb522](https://forgejo.webgrip.dev/webgrip/ploeg/commit/34fb5224276e51e1f5f98e29c3565ca6333e6a4a))
* **ci:** bypass the dead Docker Hub proxy so a release can distribute again ([9070844](https://forgejo.webgrip.dev/webgrip/ploeg/commit/90708449afb3758c3da119953768b77e1d4af7e4))
* **ci:** correct the stale single-reusable-chain comment; cut v0.1.0-rc.11 ([4a7d78e](https://forgejo.webgrip.dev/webgrip/ploeg/commit/4a7d78eaba0fdc9f3413bce533a8d5ef6a223d56))
* **ci:** finish the proxy bypass — syft scanner and buildkit come direct too ([2862920](https://forgejo.webgrip.dev/webgrip/ploeg/commit/286292050d28b9d634658d51fdf6a2534897551a))
* **ci:** mirror image and chart to the Forgejo registry and link them to the repo ([0ad0ced](https://forgejo.webgrip.dev/webgrip/ploeg/commit/0ad0ced79b82c4092c5c7e0280af6f6fad131e33))
* **ci:** pin semantic-release to v1.2.0 now that PR [#40](https://forgejo.webgrip.dev/webgrip/ploeg/issues/40) is released ([77a5f3c](https://forgejo.webgrip.dev/webgrip/ploeg/commit/77a5f3c0ea6266ea657f6eb5b52fbcc183b56255))
* **ci:** pin webgrip/workflows to v1.0.0 instead of [@main](https://forgejo.webgrip.dev/main) ([a3a1175](https://forgejo.webgrip.dev/webgrip/ploeg/commit/a3a1175d9f5fca6a38ee6fbe44a081b3436cf95b)), references [#40](https://forgejo.webgrip.dev/webgrip/ploeg/issues/40) [#40](https://forgejo.webgrip.dev/webgrip/ploeg/issues/40)
* **ci:** prove the container release path end to end, on a probed toolchain ([31d92ad](https://forgejo.webgrip.dev/webgrip/ploeg/commit/31d92add5a09edde249f82bb309a703a35e5f4b4))
* **ci:** re-pin the semrel action to a commit the server can still resolve ([2943b03](https://forgejo.webgrip.dev/webgrip/ploeg/commit/2943b032e57bf0cde91f2b9d6a7fba6dd1d7e09c))
* **ci:** release and publish as the webgrip-ci bot, not the per-job token ([8a5a994](https://forgejo.webgrip.dev/webgrip/ploeg/commit/8a5a994c05228017e363da8e446a5ac1231f72e1))
* **ci:** reopen the GitHub track — mirror, Releases and GHCR via github-distribute ([2f64ae8](https://forgejo.webgrip.dev/webgrip/ploeg/commit/2f64ae8630ea47fc68df90ee69076bfa9acb1113)), references [#48](https://forgejo.webgrip.dev/webgrip/ploeg/issues/48)
* **ci:** skip the Harbor build when the version is already published ([5a7fa89](https://forgejo.webgrip.dev/webgrip/ploeg/commit/5a7fa89fe60eb8d9fe5ccee35d958e93c4d0fe10))
* **ci:** substitute the chart version out of the helm goldens ([c827f9f](https://forgejo.webgrip.dev/webgrip/ploeg/commit/c827f9fe5cf54f7e69f86a26b092d61ec171cf3e))
* **config:** per-team routing on one project is valid, not a duplicate ([ab8536b](https://forgejo.webgrip.dev/webgrip/ploeg/commit/ab8536b46adffc3911ad7507009790d9340f24e4))
* **config:** reject an assignee shared by two teams ([60c836b](https://forgejo.webgrip.dev/webgrip/ploeg/commit/60c836bdc3adbc7eef61c6923601cfcac585fd79))
* **deps:** clear the nine CVEs Harbor flags on the ploegd image ([427ea3a](https://forgejo.webgrip.dev/webgrip/ploeg/commit/427ea3ad2ea657bdf597d507c46b49d66dae2574))
* **deps:** update harbor.webgrip.dev/webgrip/agent-runner docker tag ( 1.0.1 ➔ 1.0.2 ) ([2cfdc01](https://forgejo.webgrip.dev/webgrip/ploeg/commit/2cfdc01c767ff5cf9d8c87a54a210d00d3160839))
* Guaranteed QoS for every factory pod — out of the OOMController's kill zone ([cbde89d](https://forgejo.webgrip.dev/webgrip/ploeg/commit/cbde89d4625a0e55a95673646e3a16d9caff67c2))
* **harness,worker:** a reading Run's review must survive every harness ([7e78a59](https://forgejo.webgrip.dev/webgrip/ploeg/commit/7e78a59e15fd92cf289a3dc198608fac3a5d558c))
* **harness:** flush the agent's stderr before building an ACP failure reason ([eafd621](https://forgejo.webgrip.dev/webgrip/ploeg/commit/eafd621247d2cebfec4e41f6474df9f492c424ad))
* **helm:** default worker CPU to 1 core (single-threaded cold import ([cd0cb23](https://forgejo.webgrip.dev/webgrip/ploeg/commit/cd0cb237c999840e7ab7f1acdd9208be7abf0c6d))
* **httpapi:** close the failure taxonomy at the API boundary ([c7c5ed6](https://forgejo.webgrip.dev/webgrip/ploeg/commit/c7c5ed64547d3c2a7ec8c3c900f5088be1fdff42))
* infra failures don't burn attempt budget (backoff + infra_failures) ([71bbb1a](https://forgejo.webgrip.dev/webgrip/ploeg/commit/71bbb1af903354a41e372f11d5859045b29558a6))
* ploeg-worker owns the per-run LiteLLM key lifecycle (mint + always-revoke) ([450ec5f](https://forgejo.webgrip.dev/webgrip/ploeg/commit/450ec5f67f821e24e7e8b20a0ea6c56d9bb7f7de))
* **ploegd:** register a forge under the ID its Work Target carries ([38e3b27](https://forgejo.webgrip.dev/webgrip/ploeg/commit/38e3b27c138b23a098b1ca4186c683ac1f5fa058))
* **ploegd:** safe Alias() helper, sweeper key revoke, boot orphan sweep ([4814851](https://forgejo.webgrip.dev/webgrip/ploeg/commit/4814851e8ab7fc8eff35c206fb07fddebd41d908))
* **release:** annotate the index and mirror cosign's accessories to GHCR ([da548a1](https://forgejo.webgrip.dev/webgrip/ploeg/commit/da548a145e9d5ae7a7fe51002be1852c86150b51)), references [#53](https://forgejo.webgrip.dev/webgrip/ploeg/issues/53)
* **release:** drop the yq appVersion prepareCmd — the shared config bumps both keys ([18f441b](https://forgejo.webgrip.dev/webgrip/ploeg/commit/18f441b2cdbdbdd88ba9aa8420020a1932cdc51a))
* **release:** link the image and chart to the repo on GHCR ([1440917](https://forgejo.webgrip.dev/webgrip/ploeg/commit/1440917b6e5c1db241258ef048ae4c6485437575))
* **release:** reject zero-time release timestamps, not just Go's spelling ([08dfd2f](https://forgejo.webgrip.dev/webgrip/ploeg/commit/08dfd2ff15e34880ded07ba8bd0b9ab6a4f3ce8f))
* **release:** sign the Forgejo mirror too ([90badd4](https://forgejo.webgrip.dev/webgrip/ploeg/commit/90badd4e83563042d1d041370387dc75eeab6b71))
* **shiftengine,store:** a failed writing Run re-opens its Round ([107d5f7](https://forgejo.webgrip.dev/webgrip/ploeg/commit/107d5f760fe3ce6316ed25340d3a78d8c503c05f)), references [#35](https://forgejo.webgrip.dev/webgrip/ploeg/issues/35)
* **shiftengine,worker,litellm:** close the loop the reviews were falling out of ([a1bccea](https://forgejo.webgrip.dev/webgrip/ploeg/commit/a1bccea573e143b7ee9a1ff19ad4e1ae16a21d99)), references [erfbeeld#9](https://forgejo.webgrip.dev/erfbeeld/issues/9)
* **shiftengine:** a successful review must not read as a stoppage ([7deab6a](https://forgejo.webgrip.dev/webgrip/ploeg/commit/7deab6a64602e73870b6b82f6618e19ace8d74c1))
* **shiftengine:** write back to the tracker on every terminal settle ([30d9ce3](https://forgejo.webgrip.dev/webgrip/ploeg/commit/30d9ce309003b5a3caba8495149591de5fc457de)), references [#30](https://forgejo.webgrip.dev/webgrip/ploeg/issues/30)
* worker owns the per-run LiteLLM key lifecycle (mint + always-revoke) ([1edb4af](https://forgejo.webgrip.dev/webgrip/ploeg/commit/1edb4af494130c06450763dfd288d9cb283cd951))
* worker targets a configurable base branch end to end ([18f80de](https://forgejo.webgrip.dev/webgrip/ploeg/commit/18f80de7314e11df8521f3eb5897f17924fa273c)), references [#6](https://forgejo.webgrip.dev/webgrip/ploeg/issues/6)
* **worker,httpapi:** tell the truth about the forge credential, log routing ([f58c261](https://forgejo.webgrip.dev/webgrip/ploeg/commit/f58c26119b31c811d63f052587ab1b142017228f))
* **worker,shiftengine:** a killed run reports its own death, and does not spend the agent's budget ([df5dc9f](https://forgejo.webgrip.dev/webgrip/ploeg/commit/df5dc9f3e348d278ef91580e74bbd03117eab408))
* **worker:** a reading Round may run before any branch exists ([1c55e74](https://forgejo.webgrip.dev/webgrip/ploeg/commit/1c55e74785cc63b5e2fe84255ee010c442dc4fa0))
* **worker:** give a reader the work, and take away the credential ([8045b6d](https://forgejo.webgrip.dev/webgrip/ploeg/commit/8045b6df9b17afaed2dfd3db1b4c02023cd85112))
* **worker:** stop a failed run inheriting the previous run's PR ([6141f27](https://forgejo.webgrip.dev/webgrip/ploeg/commit/6141f27e9307d5c1da89dded5727fe070789c56e))

### Changed

* **ci:** bring the composite pins onto the plain-text diagnostics ([eb16361](https://forgejo.webgrip.dev/webgrip/ploeg/commit/eb163615a0c589dbd6ff98f88bc9f9d5d3ac1bad))
* **ci:** drop the last GitHub-only annotation command ([b66a4db](https://forgejo.webgrip.dev/webgrip/ploeg/commit/b66a4dbaae1a8c7e51f886b47603dd6813817612))
* **harnesstest:** make the conformance kernel adapter-shaped ([0b04b6e](https://forgejo.webgrip.dev/webgrip/ploeg/commit/0b04b6efcd2c53b57bd3d12c928d16b44b1248d2)), references [#64](https://forgejo.webgrip.dev/webgrip/ploeg/issues/64)

### Docs

* **adr:** consolidate docs/adr into docs/adrs — one gated ledger ([245b90d](https://forgejo.webgrip.dev/webgrip/ploeg/commit/245b90d626ee2a87cfe8e9a60621722f0ab59377)), references [#97](https://forgejo.webgrip.dev/webgrip/ploeg/issues/97)
* **adr:** record why published artifacts name the mirror as their source ([e509e22](https://forgejo.webgrip.dev/webgrip/ploeg/commit/e509e22649b2cde85bc343950ab3e603e595f1d0))
* **adrs:** ADR-0018 — the drop box is every harness's return path ([0ee2890](https://forgejo.webgrip.dev/webgrip/ploeg/commit/0ee2890f9f4e1a2dc12819342db238b5b71ec4e1))
* **adr:** Shift owns the item, Lease owns the branch (0010-0012) ([e682a9b](https://forgejo.webgrip.dev/webgrip/ploeg/commit/e682a9bd8bfd1f7cec6a6b1c904a053b289f26c7))
* **adrs:** migrate design.md §8/§9 into an enforced MADR 4.0 ledger ([d546a2c](https://forgejo.webgrip.dev/webgrip/ploeg/commit/d546a2c737e5bee99c012c93d5705c047def5af8))
* **adr:** the Lease becomes a capability, not a note (0013) ([70d054b](https://forgejo.webgrip.dev/webgrip/ploeg/commit/70d054b4a172e935742d348db47b329d4daf82a4)), references [forgejo#8837](https://forgejo.webgrip.dev/forgejo/issues/8837)
* **agents:** correct migrations path to pkg/store/migrations ([b561521](https://forgejo.webgrip.dev/webgrip/ploeg/commit/b5615210485055cfd209bbe115e9d8425f02f615))
* **agents:** record the multi-session staging discipline ([6c325bc](https://forgejo.webgrip.dev/webgrip/ploeg/commit/6c325bc64a9dbb5f10b823062fa7d8470cc397ec))
* archive run-multi-agent-shifts and correct the divergence list ([6b4b90c](https://forgejo.webgrip.dev/webgrip/ploeg/commit/6b4b90c19ebdaafd2952df1a06d6385323467d78))
* **brand:** a visual identity for Ploeg, and terms for its mark ([b9c9b2c](https://forgejo.webgrip.dev/webgrip/ploeg/commit/b9c9b2ce09930e109cb923b0f30260a30c23cfec)), references [#E4572E](https://forgejo.webgrip.dev/webgrip/ploeg/issues/E4572E)
* **brand:** transparent PNG exports of every logo variant ([a48abdf](https://forgejo.webgrip.dev/webgrip/ploeg/commit/a48abdf47e395a736a95e5bc2aa152a4a2416d45))
* **changelog:** drop duplicate 1.0.0-rc.1 section ([5d88389](https://forgejo.webgrip.dev/webgrip/ploeg/commit/5d883894f71849fafe6161d7598972fab222d4d5))
* **ci:** name the helm-version trap in the golden check's own advice ([29bd394](https://forgejo.webgrip.dev/webgrip/ploeg/commit/29bd394618dde4d1b71c25e404480fa9dbe58551))
* cite model.yaml entities by name, not by line number ([cca8e85](https://forgejo.webgrip.dev/webgrip/ploeg/commit/cca8e85568a3551fc58ab39fc4a92886ba40d95c))
* close out the ACP work in the backlog, design §5 and the divergence list ([4793d1a](https://forgejo.webgrip.dev/webgrip/ploeg/commit/4793d1a376aed175f3e14cdc967bc4a2aba68ed4)), references [#64](https://forgejo.webgrip.dev/webgrip/ploeg/issues/64) [#63](https://forgejo.webgrip.dev/webgrip/ploeg/issues/63) [#64](https://forgejo.webgrip.dev/webgrip/ploeg/issues/64) [#44](https://forgejo.webgrip.dev/webgrip/ploeg/issues/44) [#69](https://forgejo.webgrip.dev/webgrip/ploeg/issues/69)
* current-state architecture of the dark factory (mermaid: context, run sequence, states, key layers) ([9a3c5ff](https://forgejo.webgrip.dev/webgrip/ploeg/commit/9a3c5ff4f2fc481a050f11d6054c2225ef60b499))
* **domain:** model the Work Target, Forge, Scope and Routing Rule axes ([9b2b259](https://forgejo.webgrip.dev/webgrip/ploeg/commit/9b2b259c8d10dd9a03d1103011a993ec21754f1c))
* **domain:** regenerate the domain views for Shift and Round ([0128ff3](https://forgejo.webgrip.dev/webgrip/ploeg/commit/0128ff3fbe3975eda44b03ad3f44f4a4636c630d))
* make docs/adrs the only ledger, and gate it in go test ([34c4ff6](https://forgejo.webgrip.dev/webgrip/ploeg/commit/34c4ff601d2a05047e96e5fe0f06223273cdc805))
* **openspec:** adopt the spec-driven-with-adr workflow ([7091561](https://forgejo.webgrip.dev/webgrip/ploeg/commit/7091561351748b4cf7c0e93665dcbc368de99e42))
* **openspec:** design, adr manifest and tasks for run-multi-agent-shifts ([8d824b1](https://forgejo.webgrip.dev/webgrip/ploeg/commit/8d824b1f0e4d369157f1abb0c7600d6d421d40c8))
* **openspec:** propose close-the-review-loop, and ADR-0017 behind it ([26364d6](https://forgejo.webgrip.dev/webgrip/ploeg/commit/26364d6a74e84f17ecf0a6b39b90f69004827144)), references [#107](https://forgejo.webgrip.dev/webgrip/ploeg/issues/107)
* **openspec:** propose run-multi-agent-shifts ([0dbe737](https://forgejo.webgrip.dev/webgrip/ploeg/commit/0dbe7376c22ecadae2d778c2e918239c35768d9f))
* reconcile ADR-0010/0012 with the implementation; architecture §10 with diagrams ([e8d4298](https://forgejo.webgrip.dev/webgrip/ploeg/commit/e8d429841580b2806181bcbc1f026f64bffbdb57))
* record 2026-07-27 AHP sweep verdict — session-sync layer above ploeg, ACP stays the harness seam ([6ccacf7](https://forgejo.webgrip.dev/webgrip/ploeg/commit/6ccacf7db7ce7b3b8b61a80afa7460077024b3e7))
* record 2026-07-28 A2A sweep — wrong layer for the factory, north-facade watchlisted ([457e931](https://forgejo.webgrip.dev/webgrip/ploeg/commit/457e9314c7cd67ffd92124c241450cd209128c64)), references [#102](https://forgejo.webgrip.dev/webgrip/ploeg/issues/102) [#31](https://forgejo.webgrip.dev/webgrip/ploeg/issues/31)
* **research:** correct the rc.15 claim — it published; the release job is what broke ([816fd67](https://forgejo.webgrip.dev/webgrip/ploeg/commit/816fd67f068febe713de2ee5f5bce9984527f38b))
* **research:** how many trials, computed rather than asserted ([d162878](https://forgejo.webgrip.dev/webgrip/ploeg/commit/d16287854967f6d29551ff0e285db98ceed93587))
* **research:** probe results — the gateway keeps its aliases, and rc.14 keeps no cost ([4ce4ff1](https://forgejo.webgrip.dev/webgrip/ploeg/commit/4ce4ff14b9803b9989ca5d3f3c80943375fdc8f6))
* **research:** survey and design for benchmarking the whole loop ([f0fa2b5](https://forgejo.webgrip.dev/webgrip/ploeg/commit/f0fa2b5bc91ddd8c3ceaaf428ff8c8675cc372a8))
* rewrite AGENTS.md as a router, land research and ops knowledge in-repo ([53f0c01](https://forgejo.webgrip.dev/webgrip/ploeg/commit/53f0c013cf4470fb1eae27471d75534815ad4c45)), references [#103](https://forgejo.webgrip.dev/webgrip/ploeg/issues/103)
* update README status — executors ship in the chart ([451fdbb](https://forgejo.webgrip.dev/webgrip/ploeg/commit/451fdbb22c2dd3980ed6b2de1d97c0d00e754d29))

### Tests

* **acp:** a zombie grandchild is not a surviving one ([914baf2](https://forgejo.webgrip.dev/webgrip/ploeg/commit/914baf246e4c173819661544e6dc37851a8d067a))
* **litellm:** strict fake emits [] not null for empty lists; gofmt ([ead01f1](https://forgejo.webgrip.dev/webgrip/ploeg/commit/ead01f1990529e945c03e49a7bc6ca55925dddbb))
* **store:** unused var + gofmt — reviewer gate pass ([539b95a](https://forgejo.webgrip.dev/webgrip/ploeg/commit/539b95a7df3e6de90282dc8aca459495bcf08d4d))
* **worker:** pin the spend-settling loop in both directions ([03eda86](https://forgejo.webgrip.dev/webgrip/ploeg/commit/03eda86e665fb47dc36562a97c46741b88ee8075))

### CI

* **actions:** Pin dependencies ([27ddc29](https://forgejo.webgrip.dev/webgrip/ploeg/commit/27ddc2964426da2ef01581c22fa9893ac59c6e28))
* **actions:** Update dependency helm ( v3.18.4 ➔ v4.2.3 ) ([c72b289](https://forgejo.webgrip.dev/webgrip/ploeg/commit/c72b289ef7a09a304151a037d0e2fa52bbbb17d0))
* **actions:** Update https://github.com/actions/setup-go action ( v6.5.0 ➔ v7.0.0 ) ([6a97b93](https://forgejo.webgrip.dev/webgrip/ploeg/commit/6a97b93da496e36927dc94b4fd11c1215935329d))
* adopt @webgrip/semantic-release-config ([ab021b7](https://forgejo.webgrip.dev/webgrip/ploeg/commit/ab021b7ec1cfd72fd36b1f50e0a2427a6b528b00))
* drop the manual release dispatch — bot-cut releases fire the release event natively ([ffa5158](https://forgejo.webgrip.dev/webgrip/ploeg/commit/ffa515890c296161ca9eb782458688f4ec0bbae5))
* **release:** build the image once — Forgejo distribute mirrors Harbor by digest ([b086784](https://forgejo.webgrip.dev/webgrip/ploeg/commit/b08678436c8dfe50a22bf43e37f9ac57bb89930e))
* **release:** bump cosign-sign-attest to v1.11.2 ([845e062](https://forgejo.webgrip.dev/webgrip/ploeg/commit/845e06234ccbb3525b367d03a370566234fe7264))
* **release:** bump github-distribute to v1.11.1 ([9b0cdc4](https://forgejo.webgrip.dev/webgrip/ploeg/commit/9b0cdc4b26c119c50fc67464ad57a8c8e24d36ba))
* **release:** bump github-distribute to v1.9.1 ([33fa76c](https://forgejo.webgrip.dev/webgrip/ploeg/commit/33fa76c0e406028ef1873f205d7b673c58ffb9f8))
* **release:** bump github-distribute to v1.9.2 ([d1c6e66](https://forgejo.webgrip.dev/webgrip/ploeg/commit/d1c6e66239c92ab5f460e64ba70e6dfdc9d6067a))
* **release:** bump reusables to v1.10.0 and publish the chart to GHCR ([b90299d](https://forgejo.webgrip.dev/webgrip/ploeg/commit/b90299d6fda87a376ab90c0ee3a6b61a956e210d))
* **release:** drop the local semantic-release toolchain — the shared config pins it ([faad578](https://forgejo.webgrip.dev/webgrip/ploeg/commit/faad5783e5010f438c7785bc98ce078b34c4227b))
* **release:** run the release in the toolchain image ([dbf4414](https://forgejo.webgrip.dev/webgrip/ploeg/commit/dbf4414b8c78d974051cb1afcd76eda584d04a54))
* **release:** sign and attest ploegd on Harbor via the shared cosign composite ([d85f084](https://forgejo.webgrip.dev/webgrip/ploeg/commit/d85f0845a4b054c32a9bbec0387fe9eaf534684c))
* retire the pin comment that outlived the pin ([c5b9f89](https://forgejo.webgrip.dev/webgrip/ploeg/commit/c5b9f89c2f54e3a7e49cf8aa6ac9fa3cfecc8ac4)), references [#40](https://forgejo.webgrip.dev/webgrip/ploeg/issues/40) [#40](https://forgejo.webgrip.dev/webgrip/ploeg/issues/40) [#40](https://forgejo.webgrip.dev/webgrip/ploeg/issues/40)
* retrigger release job (composite now falls back to setup-node on node<22.14 hosts) ([c39fd88](https://forgejo.webgrip.dev/webgrip/ploeg/commit/c39fd88ed43f99009c6122f791b5df6240c0124e))
* retrigger release train (rc release died on missing yq, now fixed) ([4dcbf12](https://forgejo.webgrip.dev/webgrip/ploeg/commit/4dcbf129442e945804d7a8588236f8cc7a17a83f))

### Style

* **worker:** gofmt the appended regression tests ([63e5101](https://forgejo.webgrip.dev/webgrip/ploeg/commit/63e5101d0506ae992b8da1e530ccf461afa69c63))

### Internal

* **helm:** refresh chart goldens for v0.2.0-rc.10 ([c55f446](https://forgejo.webgrip.dev/webgrip/ploeg/commit/c55f446c8e5121508254b68f0d5cc236094fa870))
* retrigger the release ([c505e69](https://forgejo.webgrip.dev/webgrip/ploeg/commit/c505e6992dd3f8ac75775f75673141720e275eaf))

## [0.2.0-rc.31](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.2.0-rc.30...v0.2.0-rc.31) (2026-08-26)

### Fixed

* **release:** sign the Forgejo mirror too ([90badd4](https://forgejo.webgrip.dev/webgrip/ploeg/commit/90badd4e83563042d1d041370387dc75eeab6b71))

### CI

* **release:** bump cosign-sign-attest to v1.11.2 ([845e062](https://forgejo.webgrip.dev/webgrip/ploeg/commit/845e06234ccbb3525b367d03a370566234fe7264))
* **release:** bump github-distribute to v1.11.1 ([9b0cdc4](https://forgejo.webgrip.dev/webgrip/ploeg/commit/9b0cdc4b26c119c50fc67464ad57a8c8e24d36ba))

## [0.2.0-rc.30](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.2.0-rc.29...v0.2.0-rc.30) (2026-08-26)

### Fixed

* **release:** reject zero-time release timestamps, not just Go's spelling ([08dfd2f](https://forgejo.webgrip.dev/webgrip/ploeg/commit/08dfd2ff15e34880ded07ba8bd0b9ab6a4f3ce8f))

## [0.2.0-rc.29](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.2.0-rc.28...v0.2.0-rc.29) (2026-08-26)

### Fixed

* **release:** annotate the index and mirror cosign's accessories to GHCR ([da548a1](https://forgejo.webgrip.dev/webgrip/ploeg/commit/da548a145e9d5ae7a7fe51002be1852c86150b51)), references [#53](https://forgejo.webgrip.dev/webgrip/ploeg/issues/53)

## [0.2.0-rc.28](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.2.0-rc.27...v0.2.0-rc.28) (2026-08-26)

### Fixed

* **adrs:** revert the ADR-0017 index edit — upstream had already resolved it ([721630d](https://forgejo.webgrip.dev/webgrip/ploeg/commit/721630de5623062a84e0c80e15bf7eac5083da30))
* **worker,shiftengine:** a killed run reports its own death, and does not spend the agent's budget ([df5dc9f](https://forgejo.webgrip.dev/webgrip/ploeg/commit/df5dc9f3e348d278ef91580e74bbd03117eab408))

### Style

* **worker:** gofmt the appended regression tests ([63e5101](https://forgejo.webgrip.dev/webgrip/ploeg/commit/63e5101d0506ae992b8da1e530ccf461afa69c63))

## [0.2.0-rc.27](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.2.0-rc.26...v0.2.0-rc.27) (2026-08-25)

### Fixed

* **release:** link the image and chart to the repo on GHCR ([1440917](https://forgejo.webgrip.dev/webgrip/ploeg/commit/1440917b6e5c1db241258ef048ae4c6485437575))

### Docs

* **adr:** record why published artifacts name the mirror as their source ([e509e22](https://forgejo.webgrip.dev/webgrip/ploeg/commit/e509e22649b2cde85bc343950ab3e603e595f1d0))

## [0.2.0-rc.26](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.2.0-rc.25...v0.2.0-rc.26) (2026-08-25)

### Added

* **provider:** GitLab forge and ClickUp tracker providers ([794eafc](https://forgejo.webgrip.dev/webgrip/ploeg/commit/794eafc056e5c5899e53179904e463eab42aa307))

## [0.2.0-rc.25](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.2.0-rc.24...v0.2.0-rc.25) (2026-08-25)

### Changed

* **ci:** bring the composite pins onto the plain-text diagnostics ([eb16361](https://forgejo.webgrip.dev/webgrip/ploeg/commit/eb163615a0c589dbd6ff98f88bc9f9d5d3ac1bad))

## [0.2.0-rc.24](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.2.0-rc.23...v0.2.0-rc.24) (2026-08-25)

### Changed

* **ci:** drop the last GitHub-only annotation command ([b66a4db](https://forgejo.webgrip.dev/webgrip/ploeg/commit/b66a4dbaae1a8c7e51f886b47603dd6813817612))

### CI

* **release:** bump github-distribute to v1.9.2 ([d1c6e66](https://forgejo.webgrip.dev/webgrip/ploeg/commit/d1c6e66239c92ab5f460e64ba70e6dfdc9d6067a))
* **release:** bump reusables to v1.10.0 and publish the chart to GHCR ([b90299d](https://forgejo.webgrip.dev/webgrip/ploeg/commit/b90299d6fda87a376ab90c0ee3a6b61a956e210d))

## [0.2.0-rc.23](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.2.0-rc.22...v0.2.0-rc.23) (2026-08-25)

### Fixed

* **ci:** assert image labels on parsed JSON, not on rendered text ([34fb522](https://forgejo.webgrip.dev/webgrip/ploeg/commit/34fb5224276e51e1f5f98e29c3565ca6333e6a4a))

## [0.2.0-rc.22](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.2.0-rc.21...v0.2.0-rc.22) (2026-08-25)

### Fixed

* **ci:** skip the Harbor build when the version is already published ([5a7fa89](https://forgejo.webgrip.dev/webgrip/ploeg/commit/5a7fa89fe60eb8d9fe5ccee35d958e93c4d0fe10))

## [0.2.0-rc.21](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.2.0-rc.20...v0.2.0-rc.21) (2026-08-25)

### Fixed

* **deps:** clear the nine CVEs Harbor flags on the ploegd image ([427ea3a](https://forgejo.webgrip.dev/webgrip/ploeg/commit/427ea3ad2ea657bdf597d507c46b49d66dae2574))

### CI

* **release:** bump github-distribute to v1.9.1 ([33fa76c](https://forgejo.webgrip.dev/webgrip/ploeg/commit/33fa76c0e406028ef1873f205d7b673c58ffb9f8))

## [0.2.0-rc.20](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.2.0-rc.19...v0.2.0-rc.20) (2026-08-25)

### Fixed

* **ci:** finish the proxy bypass — syft scanner and buildkit come direct too ([2862920](https://forgejo.webgrip.dev/webgrip/ploeg/commit/286292050d28b9d634658d51fdf6a2534897551a))

## [0.2.0-rc.19](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.2.0-rc.18...v0.2.0-rc.19) (2026-08-25)

### Fixed

* **ci:** bypass the dead Docker Hub proxy so a release can distribute again ([9070844](https://forgejo.webgrip.dev/webgrip/ploeg/commit/90708449afb3758c3da119953768b77e1d4af7e4))

## [0.2.0-rc.18](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.2.0-rc.17...v0.2.0-rc.18) (2026-08-24)

### Fixed

* **ci:** reopen the GitHub track — mirror, Releases and GHCR via github-distribute ([2f64ae8](https://forgejo.webgrip.dev/webgrip/ploeg/commit/2f64ae8630ea47fc68df90ee69076bfa9acb1113)), references [#48](https://forgejo.webgrip.dev/webgrip/ploeg/issues/48)

### CI

* retire the pin comment that outlived the pin ([c5b9f89](https://forgejo.webgrip.dev/webgrip/ploeg/commit/c5b9f89c2f54e3a7e49cf8aa6ac9fa3cfecc8ac4)), references [#40](https://forgejo.webgrip.dev/webgrip/ploeg/issues/40) [#40](https://forgejo.webgrip.dev/webgrip/ploeg/issues/40) [#40](https://forgejo.webgrip.dev/webgrip/ploeg/issues/40)

## [0.2.0-rc.17](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.2.0-rc.16...v0.2.0-rc.17) (2026-08-09)

### Fixed

* **ci:** pin semantic-release to v1.2.0 now that PR [#40](https://forgejo.webgrip.dev/webgrip/ploeg/issues/40) is released ([77a5f3c](https://forgejo.webgrip.dev/webgrip/ploeg/commit/77a5f3c0ea6266ea657f6eb5b52fbcc183b56255))

## [0.2.0-rc.16](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.2.0-rc.15...v0.2.0-rc.16) (2026-08-09)

### Fixed

* **ci:** pin webgrip/workflows to v1.0.0 instead of [@main](https://forgejo.webgrip.dev/main) ([a3a1175](https://forgejo.webgrip.dev/webgrip/ploeg/commit/a3a1175d9f5fca6a38ee6fbe44a081b3436cf95b)), references [#40](https://forgejo.webgrip.dev/webgrip/ploeg/issues/40) [#40](https://forgejo.webgrip.dev/webgrip/ploeg/issues/40)
* **ci:** re-pin the semrel action to a commit the server can still resolve ([2943b03](https://forgejo.webgrip.dev/webgrip/ploeg/commit/2943b032e57bf0cde91f2b9d6a7fba6dd1d7e09c))
* **harness,worker:** a reading Run's review must survive every harness ([7e78a59](https://forgejo.webgrip.dev/webgrip/ploeg/commit/7e78a59e15fd92cf289a3dc198608fac3a5d558c))
* **shiftengine,store:** a failed writing Run re-opens its Round ([107d5f7](https://forgejo.webgrip.dev/webgrip/ploeg/commit/107d5f760fe3ce6316ed25340d3a78d8c503c05f)), references [#35](https://forgejo.webgrip.dev/webgrip/ploeg/issues/35)
* **shiftengine,worker,litellm:** close the loop the reviews were falling out of ([a1bccea](https://forgejo.webgrip.dev/webgrip/ploeg/commit/a1bccea573e143b7ee9a1ff19ad4e1ae16a21d99)), references [erfbeeld#9](https://forgejo.webgrip.dev/erfbeeld/issues/9)

### Docs

* **adrs:** ADR-0018 — the drop box is every harness's return path ([0ee2890](https://forgejo.webgrip.dev/webgrip/ploeg/commit/0ee2890f9f4e1a2dc12819342db238b5b71ec4e1))
* **ci:** name the helm-version trap in the golden check's own advice ([29bd394](https://forgejo.webgrip.dev/webgrip/ploeg/commit/29bd394618dde4d1b71c25e404480fa9dbe58551))
* **research:** correct the rc.15 claim — it published; the release job is what broke ([816fd67](https://forgejo.webgrip.dev/webgrip/ploeg/commit/816fd67f068febe713de2ee5f5bce9984527f38b))
* **research:** how many trials, computed rather than asserted ([d162878](https://forgejo.webgrip.dev/webgrip/ploeg/commit/d16287854967f6d29551ff0e285db98ceed93587))
* **research:** probe results — the gateway keeps its aliases, and rc.14 keeps no cost ([4ce4ff1](https://forgejo.webgrip.dev/webgrip/ploeg/commit/4ce4ff14b9803b9989ca5d3f3c80943375fdc8f6))
* **research:** survey and design for benchmarking the whole loop ([f0fa2b5](https://forgejo.webgrip.dev/webgrip/ploeg/commit/f0fa2b5bc91ddd8c3ceaaf428ff8c8675cc372a8))

### Tests

* **worker:** pin the spend-settling loop in both directions ([03eda86](https://forgejo.webgrip.dev/webgrip/ploeg/commit/03eda86e665fb47dc36562a97c46741b88ee8075))

### Internal

* retrigger the release ([c505e69](https://forgejo.webgrip.dev/webgrip/ploeg/commit/c505e6992dd3f8ac75775f75673141720e275eaf))

## [0.2.0-rc.15](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.2.0-rc.14...v0.2.0-rc.15) (2026-07-31)

### Fixed

* **ci:** prove the container release path end to end, on a probed toolchain ([31d92ad](https://forgejo.webgrip.dev/webgrip/ploeg/commit/31d92add5a09edde249f82bb309a703a35e5f4b4))

### CI

* **release:** run the release in the toolchain image ([dbf4414](https://forgejo.webgrip.dev/webgrip/ploeg/commit/dbf4414b8c78d974051cb1afcd76eda584d04a54))

## 0.2.0-rc.14 (2026-07-30)

* Merge pull request 'fix(worker,shiftengine,chart): make a reading Role able to review — and unable t ([5371fff](https://forgejo.webgrip.dev/webgrip/ploeg/commit/5371fff)), closes [#32](https://forgejo.webgrip.dev/webgrip/ploeg/issues/32)
* fix(chart): three defects found by running rc.13 in production ([11d2284](https://forgejo.webgrip.dev/webgrip/ploeg/commit/11d2284))
* fix(shiftengine): a successful review must not read as a stoppage ([7deab6a](https://forgejo.webgrip.dev/webgrip/ploeg/commit/7deab6a))
* fix(worker): a reading Round may run before any branch exists ([1c55e74](https://forgejo.webgrip.dev/webgrip/ploeg/commit/1c55e74))
* fix(worker): give a reader the work, and take away the credential ([8045b6d](https://forgejo.webgrip.dev/webgrip/ploeg/commit/8045b6d))

## 0.2.0-rc.13 (2026-07-30)

* fix(worker,httpapi): tell the truth about the forge credential, log routing ([f58c261](https://forgejo.webgrip.dev/webgrip/ploeg/commit/f58c261))
* Merge pull request 'fix(shiftengine): tell the board when a Shift finishes' (#31) from fix/tracker-w ([0e9c3e1](https://forgejo.webgrip.dev/webgrip/ploeg/commit/0e9c3e1)), closes [#31](https://forgejo.webgrip.dev/webgrip/ploeg/issues/31)
* feat(chart): worker ServiceAccount and per-Role resources ([12896f5](https://forgejo.webgrip.dev/webgrip/ploeg/commit/12896f5))
* fix(config): reject an assignee shared by two teams ([60c836b](https://forgejo.webgrip.dev/webgrip/ploeg/commit/60c836b))
* fix(shiftengine): write back to the tracker on every terminal settle ([30d9ce3](https://forgejo.webgrip.dev/webgrip/ploeg/commit/30d9ce3)), closes [#30](https://forgejo.webgrip.dev/webgrip/ploeg/issues/30)

## 0.2.0-rc.12 (2026-07-30)

* fix(ci): substitute the chart version out of the helm goldens ([c827f9f](https://forgejo.webgrip.dev/webgrip/ploeg/commit/c827f9f))

## 0.2.0-rc.11 (2026-07-30)

* Merge pull request 'fix(config): per-team routing on one project is valid, not a duplicate' (#29) fr ([c725b8d](https://forgejo.webgrip.dev/webgrip/ploeg/commit/c725b8d)), closes [#29](https://forgejo.webgrip.dev/webgrip/ploeg/issues/29)
* chore(helm): refresh chart goldens for v0.2.0-rc.10 ([c55f446](https://forgejo.webgrip.dev/webgrip/ploeg/commit/c55f446))
* fix(config): per-team routing on one project is valid, not a duplicate ([ab8536b](https://forgejo.webgrip.dev/webgrip/ploeg/commit/ab8536b))

## 0.2.0-rc.10 (2026-07-29)

* Merge pull request 'feat(config): routing and roster as a file, and push rights minted per Run' (#27 ([cda5095](https://forgejo.webgrip.dev/webgrip/ploeg/commit/cda5095)), closes [#27](https://forgejo.webgrip.dev/webgrip/ploeg/issues/27)
* feat(config): routing and roster as a file, and push rights minted per Run ([3c455da](https://forgejo.webgrip.dev/webgrip/ploeg/commit/3c455da))

## [0.2.0-rc.9](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.2.0-rc.8...v0.2.0-rc.9) (2026-07-29)

### Added

* **chart:** one workload per (team, Role), and a waiver keyed to the hazard ([ac34700](https://forgejo.webgrip.dev/webgrip/ploeg/commit/ac34700a20e66c42acaff29b59d3d5e5be03ea6d))
* **dispatch:** every queued item gets a Shift, behind a kill switch ([c9ccf55](https://forgejo.webgrip.dev/webgrip/ploeg/commit/c9ccf55c16b0dc240402943cd066c72f0de716ec))
* **httpapi:** forge webhook ingest — verified, deduplicated, audited ([c70208d](https://forgejo.webgrip.dev/webgrip/ploeg/commit/c70208d7357118c459108788911515616e3314a7)), references [#2](https://forgejo.webgrip.dev/webgrip/ploeg/issues/2) [#3](https://forgejo.webgrip.dev/webgrip/ploeg/issues/3) [#107](https://forgejo.webgrip.dev/webgrip/ploeg/issues/107) [#9](https://forgejo.webgrip.dev/webgrip/ploeg/issues/9)
* **provider:** findings reach the pull request, and a person is asked to merge ([a8539db](https://forgejo.webgrip.dev/webgrip/ploeg/commit/a8539db202d704737964a78bd8f49e9fbb23c3f5))
* **shiftengine:** verdict-driven fix rounds, bounded by pool then cap ([2c5ba9d](https://forgejo.webgrip.dev/webgrip/ploeg/commit/2c5ba9d19477f9db60b04e20cf1649762679efb0))

### Fixed

* **ploegd:** register a forge under the ID its Work Target carries ([38e3b27](https://forgejo.webgrip.dev/webgrip/ploeg/commit/38e3b27c138b23a098b1ca4186c683ac1f5fa058))

### Docs

* archive run-multi-agent-shifts and correct the divergence list ([6b4b90c](https://forgejo.webgrip.dev/webgrip/ploeg/commit/6b4b90c19ebdaafd2952df1a06d6385323467d78))
* **openspec:** propose close-the-review-loop, and ADR-0017 behind it ([26364d6](https://forgejo.webgrip.dev/webgrip/ploeg/commit/26364d6a74e84f17ecf0a6b39b90f69004827144)), references [#107](https://forgejo.webgrip.dev/webgrip/ploeg/issues/107)

## [0.2.0-rc.8](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.2.0-rc.7...v0.2.0-rc.8) (2026-07-29)

### Added

* **api:** role-scoped claim, findings on the outcome, role-filtered depth ([41b497d](https://forgejo.webgrip.dev/webgrip/ploeg/commit/41b497d52a2c6b83aeb205801acadef6a20f6a67))
* **harness:** ACP driver, client half, and the coder/acp-go-sdk dependency ([864249a](https://forgejo.webgrip.dev/webgrip/ploeg/commit/864249aabf13cd071033228a96a19e9958b1e39a))
* **harness:** ACP event and stop-reason semantics (no SDK, no process) ([eceee69](https://forgejo.webgrip.dev/webgrip/ploeg/commit/eceee69a3013563955f02d08e950d47e124780d2)), references [#64](https://forgejo.webgrip.dev/webgrip/ploeg/issues/64)
* **harness:** ACP permission policy for unattended runs ([a6285f7](https://forgejo.webgrip.dev/webgrip/ploeg/commit/a6285f7d2930f0fbe7b9f7b4e633ca04c9ec9ad7))
* **harness:** ACP subprocess layer — process groups, stdout demux, async stdin ([a0530d6](https://forgejo.webgrip.dev/webgrip/ploeg/commit/a0530d640f0c2afb6e7610e55dc60705360a2aaf))
* **plan:** team plan config, parsed at boot, rendered dark from the chart ([67206d7](https://forgejo.webgrip.dev/webgrip/ploeg/commit/67206d75420b4cde28286eba8880c6d2464098db))
* **shiftengine:** open, advance, close and park Shifts ([10e2972](https://forgejo.webgrip.dev/webgrip/ploeg/commit/10e29721c43b4fc83737233d9521f77645b66f33))
* **store:** settlement, per-Run liveness, and the round-completion signal ([6ee978c](https://forgejo.webgrip.dev/webgrip/ploeg/commit/6ee978ce2fdafefbf036f7b2fa044a53c18bd18f))
* **store:** shift lifecycle completions and shift-run plumbing fixes ([3b5bf76](https://forgejo.webgrip.dev/webgrip/ploeg/commit/3b5bf76d468c04f3aaefa52049e2ce5ba4b01da6))
* **store:** Shifts — rounds, reader/writer runs, and pooled budgets ([dd0b8ca](https://forgejo.webgrip.dev/webgrip/ploeg/commit/dd0b8ca2e7f4c7ee1b703fc57f2ab188637a1ed4))
* **worker:** role-aware runs — claim, prompt, budget, findings drop box ([c40f985](https://forgejo.webgrip.dev/webgrip/ploeg/commit/c40f9858d0b9b20dde1113b13c9a08f206da7be0)), references [#9](https://forgejo.webgrip.dev/webgrip/ploeg/issues/9)
* **worker:** select the ACP harness from the registry, env and chart ([57d225e](https://forgejo.webgrip.dev/webgrip/ploeg/commit/57d225edd3207318c325723193fc707a66257aee))

### Fixed

* **harness:** flush the agent's stderr before building an ACP failure reason ([eafd621](https://forgejo.webgrip.dev/webgrip/ploeg/commit/eafd621247d2cebfec4e41f6474df9f492c424ad))
* **httpapi:** close the failure taxonomy at the API boundary ([c7c5ed6](https://forgejo.webgrip.dev/webgrip/ploeg/commit/c7c5ed64547d3c2a7ec8c3c900f5088be1fdff42))
* **worker:** stop a failed run inheriting the previous run's PR ([6141f27](https://forgejo.webgrip.dev/webgrip/ploeg/commit/6141f27e9307d5c1da89dded5727fe070789c56e))

### Changed

* **harnesstest:** make the conformance kernel adapter-shaped ([0b04b6e](https://forgejo.webgrip.dev/webgrip/ploeg/commit/0b04b6efcd2c53b57bd3d12c928d16b44b1248d2)), references [#64](https://forgejo.webgrip.dev/webgrip/ploeg/issues/64)

### Docs

* **adr:** consolidate docs/adr into docs/adrs — one gated ledger ([245b90d](https://forgejo.webgrip.dev/webgrip/ploeg/commit/245b90d626ee2a87cfe8e9a60621722f0ab59377)), references [#97](https://forgejo.webgrip.dev/webgrip/ploeg/issues/97)
* **adr:** Shift owns the item, Lease owns the branch (0010-0012) ([e682a9b](https://forgejo.webgrip.dev/webgrip/ploeg/commit/e682a9bd8bfd1f7cec6a6b1c904a053b289f26c7))
* **adrs:** migrate design.md §8/§9 into an enforced MADR 4.0 ledger ([d546a2c](https://forgejo.webgrip.dev/webgrip/ploeg/commit/d546a2c737e5bee99c012c93d5705c047def5af8))
* **adr:** the Lease becomes a capability, not a note (0013) ([70d054b](https://forgejo.webgrip.dev/webgrip/ploeg/commit/70d054b4a172e935742d348db47b329d4daf82a4)), references [forgejo#8837](https://forgejo.webgrip.dev/forgejo/issues/8837)
* **agents:** record the multi-session staging discipline ([6c325bc](https://forgejo.webgrip.dev/webgrip/ploeg/commit/6c325bc64a9dbb5f10b823062fa7d8470cc397ec))
* close out the ACP work in the backlog, design §5 and the divergence list ([4793d1a](https://forgejo.webgrip.dev/webgrip/ploeg/commit/4793d1a376aed175f3e14cdc967bc4a2aba68ed4)), references [#64](https://forgejo.webgrip.dev/webgrip/ploeg/issues/64) [#63](https://forgejo.webgrip.dev/webgrip/ploeg/issues/63) [#64](https://forgejo.webgrip.dev/webgrip/ploeg/issues/64) [#44](https://forgejo.webgrip.dev/webgrip/ploeg/issues/44) [#69](https://forgejo.webgrip.dev/webgrip/ploeg/issues/69)
* **domain:** regenerate the domain views for Shift and Round ([0128ff3](https://forgejo.webgrip.dev/webgrip/ploeg/commit/0128ff3fbe3975eda44b03ad3f44f4a4636c630d))
* make docs/adrs the only ledger, and gate it in go test ([34c4ff6](https://forgejo.webgrip.dev/webgrip/ploeg/commit/34c4ff601d2a05047e96e5fe0f06223273cdc805))
* **openspec:** adopt the spec-driven-with-adr workflow ([7091561](https://forgejo.webgrip.dev/webgrip/ploeg/commit/7091561351748b4cf7c0e93665dcbc368de99e42))
* **openspec:** design, adr manifest and tasks for run-multi-agent-shifts ([8d824b1](https://forgejo.webgrip.dev/webgrip/ploeg/commit/8d824b1f0e4d369157f1abb0c7600d6d421d40c8))
* **openspec:** propose run-multi-agent-shifts ([0dbe737](https://forgejo.webgrip.dev/webgrip/ploeg/commit/0dbe7376c22ecadae2d778c2e918239c35768d9f))
* reconcile ADR-0010/0012 with the implementation; architecture §10 with diagrams ([e8d4298](https://forgejo.webgrip.dev/webgrip/ploeg/commit/e8d429841580b2806181bcbc1f026f64bffbdb57))

### Tests

* **acp:** a zombie grandchild is not a surviving one ([914baf2](https://forgejo.webgrip.dev/webgrip/ploeg/commit/914baf246e4c173819661544e6dc37851a8d067a))

## [0.2.0-rc.7](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.2.0-rc.6...v0.2.0-rc.7) (2026-07-29)

### Added

* bind the work target to the work item, not to the team ([79a7ac9](https://forgejo.webgrip.dev/webgrip/ploeg/commit/79a7ac9b8a9b62c7735f9aa23e3c305b1e002f03)), references [#97](https://forgejo.webgrip.dev/webgrip/ploeg/issues/97) [97/#103](https://forgejo.webgrip.dev/webgrip/ploeg/issues/103) [#104-108](https://forgejo.webgrip.dev/webgrip/ploeg/issues/104-108)

### Docs

* cite model.yaml entities by name, not by line number ([cca8e85](https://forgejo.webgrip.dev/webgrip/ploeg/commit/cca8e85568a3551fc58ab39fc4a92886ba40d95c))
* **domain:** model the Work Target, Forge, Scope and Routing Rule axes ([9b2b259](https://forgejo.webgrip.dev/webgrip/ploeg/commit/9b2b259c8d10dd9a03d1103011a993ec21754f1c))
* rewrite AGENTS.md as a router, land research and ops knowledge in-repo ([53f0c01](https://forgejo.webgrip.dev/webgrip/ploeg/commit/53f0c013cf4470fb1eae27471d75534815ad4c45)), references [#103](https://forgejo.webgrip.dev/webgrip/ploeg/issues/103)
* update README status — executors ship in the chart ([451fdbb](https://forgejo.webgrip.dev/webgrip/ploeg/commit/451fdbb22c2dd3980ed6b2de1d97c0d00e754d29))

## [0.2.0-rc.6](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.2.0-rc.5...v0.2.0-rc.6) (2026-07-28)

### Added

* run forensics survive pod/job cleanup — node+pod identity in logs+checkpoints, failure-reason taxonomy, VIK-586 fix ([ec2f000](https://forgejo.webgrip.dev/webgrip/ploeg/commit/ec2f000b634e3ce7d226192f01567ab3669021a8))

### Fixed

* apply PR review round 2 — ExpectsLLM, VIK-586 heuristic, gofmt, FailureReason naming ([dbb10da](https://forgejo.webgrip.dev/webgrip/ploeg/commit/dbb10dac8b3f124a9fffb9f01ea71f3ac7c1ee3b))

### Docs

* record 2026-07-28 A2A sweep — wrong layer for the factory, north-facade watchlisted ([457e931](https://forgejo.webgrip.dev/webgrip/ploeg/commit/457e9314c7cd67ffd92124c241450cd209128c64)), references [#102](https://forgejo.webgrip.dev/webgrip/ploeg/issues/102) [#31](https://forgejo.webgrip.dev/webgrip/ploeg/issues/31)

## [0.2.0-rc.5](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.2.0-rc.4...v0.2.0-rc.5) (2026-07-28)

### Added

* pluggable harness, agent image, LLM broker, and executor seams ([08c40ea](https://forgejo.webgrip.dev/webgrip/ploeg/commit/08c40ea3fde02ff146573a48b293cfc254b6073c)), references [66/#69](https://forgejo.webgrip.dev/webgrip/ploeg/issues/69)

### Docs

* **agents:** correct migrations path to pkg/store/migrations ([b561521](https://forgejo.webgrip.dev/webgrip/ploeg/commit/b5615210485055cfd209bbe115e9d8425f02f615))
* current-state architecture of the dark factory (mermaid: context, run sequence, states, key layers) ([9a3c5ff](https://forgejo.webgrip.dev/webgrip/ploeg/commit/9a3c5ff4f2fc481a050f11d6054c2225ef60b499))
* record 2026-07-27 AHP sweep verdict — session-sync layer above ploeg, ACP stays the harness seam ([6ccacf7](https://forgejo.webgrip.dev/webgrip/ploeg/commit/6ccacf7db7ce7b3b8b61a80afa7460077024b3e7))

## [0.2.0-rc.4](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.2.0-rc.3...v0.2.0-rc.4) (2026-07-28)

### Fixed

* infra failures don't burn attempt budget (backoff + infra_failures) ([71bbb1a](https://forgejo.webgrip.dev/webgrip/ploeg/commit/71bbb1af903354a41e372f11d5859045b29558a6))

### Tests

* **store:** unused var + gofmt — reviewer gate pass ([539b95a](https://forgejo.webgrip.dev/webgrip/ploeg/commit/539b95a7df3e6de90282dc8aca459495bcf08d4d))

## [0.2.0-rc.3](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.2.0-rc.2...v0.2.0-rc.3) (2026-07-27)

### Fixed

* **ploegd:** safe Alias() helper, sweeper key revoke, boot orphan sweep ([4814851](https://forgejo.webgrip.dev/webgrip/ploeg/commit/4814851e8ab7fc8eff35c206fb07fddebd41d908))

### Tests

* **litellm:** strict fake emits [] not null for empty lists; gofmt ([ead01f1](https://forgejo.webgrip.dev/webgrip/ploeg/commit/ead01f1990529e945c03e49a7bc6ca55925dddbb))

## [0.2.0-rc.2](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.2.0-rc.1...v0.2.0-rc.2) (2026-07-27)

### Fixed

* **helm:** default worker CPU to 1 core (single-threaded cold import ([cd0cb23](https://forgejo.webgrip.dev/webgrip/ploeg/commit/cd0cb237c999840e7ab7f1acdd9208be7abf0c6d))

### CI

* **release:** build the image once — Forgejo distribute mirrors Harbor by digest ([b086784](https://forgejo.webgrip.dev/webgrip/ploeg/commit/b08678436c8dfe50a22bf43e37f9ac57bb89930e))
* **release:** sign and attest ploegd on Harbor via the shared cosign composite ([d85f084](https://forgejo.webgrip.dev/webgrip/ploeg/commit/d85f0845a4b054c32a9bbec0387fe9eaf534684c))

## [0.2.0-rc.1](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.1.0...v0.2.0-rc.1) (2026-07-27)

### Added

* **deps:** update docker.io/golang docker tag ( 1.24 ➔ 1.26 ) ([999eda8](https://forgejo.webgrip.dev/webgrip/ploeg/commit/999eda8942e83d47c31d8144171fbb4fc511417d))
* **deps:** Update postgres Docker tag ( 17 ➔ 18 ) ([41cba65](https://forgejo.webgrip.dev/webgrip/ploeg/commit/41cba65819694ce00ed58ae7c0e764eada76d4c4))

### Fixed

* assignment webhooks revive finished work items ([30558e5](https://forgejo.webgrip.dev/webgrip/ploeg/commit/30558e5f3ff032c161d41665ae5b121f32764284))
* **ci:** adopt the shared forgejo-distribute reusable for the Forgejo mirror ([5d524a9](https://forgejo.webgrip.dev/webgrip/ploeg/commit/5d524a9b5cd57cd28eadf1d2858e035187fc242d))
* **ci:** correct the stale single-reusable-chain comment; cut v0.1.0-rc.11 ([4a7d78e](https://forgejo.webgrip.dev/webgrip/ploeg/commit/4a7d78eaba0fdc9f3413bce533a8d5ef6a223d56))
* **ci:** mirror image and chart to the Forgejo registry and link them to the repo ([0ad0ced](https://forgejo.webgrip.dev/webgrip/ploeg/commit/0ad0ced79b82c4092c5c7e0280af6f6fad131e33))
* **ci:** release and publish as the webgrip-ci bot, not the per-job token ([8a5a994](https://forgejo.webgrip.dev/webgrip/ploeg/commit/8a5a994c05228017e363da8e446a5ac1231f72e1))
* **deps:** update harbor.webgrip.dev/webgrip/agent-runner docker tag ( 1.0.1 ➔ 1.0.2 ) ([2cfdc01](https://forgejo.webgrip.dev/webgrip/ploeg/commit/2cfdc01c767ff5cf9d8c87a54a210d00d3160839))
* Guaranteed QoS for every factory pod — out of the OOMController's kill zone ([cbde89d](https://forgejo.webgrip.dev/webgrip/ploeg/commit/cbde89d4625a0e55a95673646e3a16d9caff67c2))
* ploeg-worker owns the per-run LiteLLM key lifecycle (mint + always-revoke) ([450ec5f](https://forgejo.webgrip.dev/webgrip/ploeg/commit/450ec5f67f821e24e7e8b20a0ea6c56d9bb7f7de))
* **release:** drop the yq appVersion prepareCmd — the shared config bumps both keys ([18f441b](https://forgejo.webgrip.dev/webgrip/ploeg/commit/18f441b2cdbdbdd88ba9aa8420020a1932cdc51a))
* worker owns the per-run LiteLLM key lifecycle (mint + always-revoke) ([1edb4af](https://forgejo.webgrip.dev/webgrip/ploeg/commit/1edb4af494130c06450763dfd288d9cb283cd951))
* worker targets a configurable base branch end to end ([18f80de](https://forgejo.webgrip.dev/webgrip/ploeg/commit/18f80de7314e11df8521f3eb5897f17924fa273c)), references [#6](https://forgejo.webgrip.dev/webgrip/ploeg/issues/6)

### Docs

* **changelog:** drop duplicate 1.0.0-rc.1 section ([5d88389](https://forgejo.webgrip.dev/webgrip/ploeg/commit/5d883894f71849fafe6161d7598972fab222d4d5))

### CI

* **actions:** Pin dependencies ([27ddc29](https://forgejo.webgrip.dev/webgrip/ploeg/commit/27ddc2964426da2ef01581c22fa9893ac59c6e28))
* **actions:** Update dependency helm ( v3.18.4 ➔ v4.2.3 ) ([c72b289](https://forgejo.webgrip.dev/webgrip/ploeg/commit/c72b289ef7a09a304151a037d0e2fa52bbbb17d0))
* **actions:** Update https://github.com/actions/setup-go action ( v6.5.0 ➔ v7.0.0 ) ([6a97b93](https://forgejo.webgrip.dev/webgrip/ploeg/commit/6a97b93da496e36927dc94b4fd11c1215935329d))
* adopt @webgrip/semantic-release-config ([ab021b7](https://forgejo.webgrip.dev/webgrip/ploeg/commit/ab021b7ec1cfd72fd36b1f50e0a2427a6b528b00))
* drop the manual release dispatch — bot-cut releases fire the release event natively ([ffa5158](https://forgejo.webgrip.dev/webgrip/ploeg/commit/ffa515890c296161ca9eb782458688f4ec0bbae5))
* **release:** drop the local semantic-release toolchain — the shared config pins it ([faad578](https://forgejo.webgrip.dev/webgrip/ploeg/commit/faad5783e5010f438c7785bc98ce078b34c4227b))
* retrigger release job (composite now falls back to setup-node on node<22.14 hosts) ([c39fd88](https://forgejo.webgrip.dev/webgrip/ploeg/commit/c39fd88ed43f99009c6122f791b5df6240c0124e))
* retrigger release train (rc release died on missing yq, now fixed) ([4dcbf12](https://forgejo.webgrip.dev/webgrip/ploeg/commit/4dcbf129442e945804d7a8588236f8cc7a17a83f))

## [1.0.0-rc.1](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.1.0...v1.0.0-rc.1) (2026-07-26)

### ⚠ BREAKING CHANGES

* **deps:** Update postgres Docker tag ( 17 ➔ 18 )

### Added

* **deps:** update docker.io/golang docker tag ( 1.24 ➔ 1.26 ) ([999eda8](https://forgejo.webgrip.dev/webgrip/ploeg/commit/999eda8942e83d47c31d8144171fbb4fc511417d))
* **deps:** Update postgres Docker tag ( 17 ➔ 18 ) ([41cba65](https://forgejo.webgrip.dev/webgrip/ploeg/commit/41cba65819694ce00ed58ae7c0e764eada76d4c4))

### Fixed

* assignment webhooks revive finished work items ([30558e5](https://forgejo.webgrip.dev/webgrip/ploeg/commit/30558e5f3ff032c161d41665ae5b121f32764284))
* **ci:** adopt the shared forgejo-distribute reusable for the Forgejo mirror ([5d524a9](https://forgejo.webgrip.dev/webgrip/ploeg/commit/5d524a9b5cd57cd28eadf1d2858e035187fc242d))
* **ci:** mirror image and chart to the Forgejo registry and link them to the repo ([0ad0ced](https://forgejo.webgrip.dev/webgrip/ploeg/commit/0ad0ced79b82c4092c5c7e0280af6f6fad131e33))
* **ci:** release and publish as the webgrip-ci bot, not the per-job token ([8a5a994](https://forgejo.webgrip.dev/webgrip/ploeg/commit/8a5a994c05228017e363da8e446a5ac1231f72e1))
* **deps:** update harbor.webgrip.dev/webgrip/agent-runner docker tag ( 1.0.1 ➔ 1.0.2 ) ([2cfdc01](https://forgejo.webgrip.dev/webgrip/ploeg/commit/2cfdc01c767ff5cf9d8c87a54a210d00d3160839))
* Guaranteed QoS for every factory pod — out of the OOMController's kill zone ([cbde89d](https://forgejo.webgrip.dev/webgrip/ploeg/commit/cbde89d4625a0e55a95673646e3a16d9caff67c2))
* ploeg-worker owns the per-run LiteLLM key lifecycle (mint + always-revoke) ([450ec5f](https://forgejo.webgrip.dev/webgrip/ploeg/commit/450ec5f67f821e24e7e8b20a0ea6c56d9bb7f7de))
* worker owns the per-run LiteLLM key lifecycle (mint + always-revoke) ([1edb4af](https://forgejo.webgrip.dev/webgrip/ploeg/commit/1edb4af494130c06450763dfd288d9cb283cd951))
* worker targets a configurable base branch end to end ([18f80de](https://forgejo.webgrip.dev/webgrip/ploeg/commit/18f80de7314e11df8521f3eb5897f17924fa273c)), closes [#6](https://forgejo.webgrip.dev/webgrip/ploeg/issues/6)

### CI

* **actions:** Pin dependencies ([27ddc29](https://forgejo.webgrip.dev/webgrip/ploeg/commit/27ddc2964426da2ef01581c22fa9893ac59c6e28))
* **actions:** Update dependency helm ( v3.18.4 ➔ v4.2.3 ) ([c72b289](https://forgejo.webgrip.dev/webgrip/ploeg/commit/c72b289ef7a09a304151a037d0e2fa52bbbb17d0))
* **actions:** Update https://github.com/actions/setup-go action ( v6.5.0 ➔ v7.0.0 ) ([6a97b93](https://forgejo.webgrip.dev/webgrip/ploeg/commit/6a97b93da496e36927dc94b4fd11c1215935329d))
* adopt @webgrip/semantic-release-config ([ab021b7](https://forgejo.webgrip.dev/webgrip/ploeg/commit/ab021b7ec1cfd72fd36b1f50e0a2427a6b528b00))
* drop the manual release dispatch — bot-cut releases fire the release event natively ([ffa5158](https://forgejo.webgrip.dev/webgrip/ploeg/commit/ffa515890c296161ca9eb782458688f4ec0bbae5))
* **release:** drop the local semantic-release toolchain — the shared config pins it ([faad578](https://forgejo.webgrip.dev/webgrip/ploeg/commit/faad5783e5010f438c7785bc98ce078b34c4227b))
* retrigger release train (rc release died on missing yq, now fixed) ([4dcbf12](https://forgejo.webgrip.dev/webgrip/ploeg/commit/4dcbf129442e945804d7a8588236f8cc7a17a83f))

### Internal

* **release:** v0.1.0-rc.5 [skip ci] ([ec87f95](https://forgejo.webgrip.dev/webgrip/ploeg/commit/ec87f950ecd8e9df2708457fc7ab8aebdac3912e))
* **release:** v0.1.0-rc.6 [skip ci] ([e54e015](https://forgejo.webgrip.dev/webgrip/ploeg/commit/e54e015a37125af130e6e0d59156d3242664de32))
* **release:** v0.1.0-rc.7 [skip ci] ([5191286](https://forgejo.webgrip.dev/webgrip/ploeg/commit/51912865704ce97db6c044e946976650b5893026))
* **release:** v0.1.0-rc.8 [skip ci] ([de8c498](https://forgejo.webgrip.dev/webgrip/ploeg/commit/de8c4988e0a887ccc9c9cf5cdfe7ae949a94c281))
* **release:** v0.1.0-rc.9 [skip ci] ([4e84645](https://forgejo.webgrip.dev/webgrip/ploeg/commit/4e84645a92538895650f912037e67da23cf54252))
* **release:** v1.0.0-rc.1 [skip ci] ([08963a6](https://forgejo.webgrip.dev/webgrip/ploeg/commit/08963a652cd09a24396549ecf04dc213c8746e48))

## [0.1.0-rc.9](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.1.0-rc.8...v0.1.0-rc.9) (2026-07-26)

### Fixed

* **ci:** release and publish as the webgrip-ci bot, not the per-job token ([8a5a994](https://forgejo.webgrip.dev/webgrip/ploeg/commit/8a5a994c05228017e363da8e446a5ac1231f72e1))

## [0.1.0-rc.8](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.1.0-rc.7...v0.1.0-rc.8) (2026-07-25)

### Fixed

* **ci:** mirror image and chart to the Forgejo registry and link them to the repo ([0ad0ced](https://forgejo.webgrip.dev/webgrip/ploeg/commit/0ad0ced79b82c4092c5c7e0280af6f6fad131e33))

## [0.1.0-rc.7](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.1.0-rc.6...v0.1.0-rc.7) (2026-07-25)

### Fixed

* ploeg-worker owns the per-run LiteLLM key lifecycle (mint + always-revoke) ([450ec5f](https://forgejo.webgrip.dev/webgrip/ploeg/commit/450ec5f67f821e24e7e8b20a0ea6c56d9bb7f7de))

## [0.1.0-rc.6](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.1.0-rc.5...v0.1.0-rc.6) (2026-07-25)

### Fixed

* Guaranteed QoS for every factory pod — out of the OOMController's kill zone ([cbde89d](https://forgejo.webgrip.dev/webgrip/ploeg/commit/cbde89d4625a0e55a95673646e3a16d9caff67c2))

## [0.1.0-rc.5](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.1.0-rc.4...v0.1.0-rc.5) (2026-07-25)

### Fixed

* assignment webhooks revive finished work items ([30558e5](https://forgejo.webgrip.dev/webgrip/ploeg/commit/30558e5f3ff032c161d41665ae5b121f32764284))
* worker targets a configurable base branch end to end ([18f80de](https://forgejo.webgrip.dev/webgrip/ploeg/commit/18f80de7314e11df8521f3eb5897f17924fa273c)), closes [#6](https://forgejo.webgrip.dev/webgrip/ploeg/issues/6)

### Docs

* AGENTS.md + team-silver repo skill — make the repo factory-workable ([c7fbfc9](https://forgejo.webgrip.dev/webgrip/ploeg/commit/c7fbfc97335076701dbf0a307808489f3dd4839f))

## [0.1.0](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.0.0...v0.1.0) (2026-07-25)

### Added

* **executor:** OpenHands worker, Helm chart, and chart publishing ([f0956b6](https://forgejo.webgrip.dev/webgrip/ploeg/commit/f0956b6e1accc2b43ba09e849a98532ff8b8c2bc))
* **ploegd:** working dispatch-plane prototype — ingest, leases, run API ([7b69724](https://forgejo.webgrip.dev/webgrip/ploeg/commit/7b69724cf0ccbbe8a2b35e224a53f8d3ff084c38)), closes [#31](https://forgejo.webgrip.dev/webgrip/ploeg/issues/31) [#49](https://forgejo.webgrip.dev/webgrip/ploeg/issues/49)
* **work:** align WorkItem with domain model — needs_human state, origin, priority ([b71f2b7](https://forgejo.webgrip.dev/webgrip/ploeg/commit/b71f2b76062ca72c83ed7cfa32c9d4ccd9169e1b)), closes [#12](https://forgejo.webgrip.dev/webgrip/ploeg/issues/12)

### Fixed

* **chart:** default the KEDA scaler host to a namespace-qualified FQDN ([31f81e9](https://forgejo.webgrip.dev/webgrip/ploeg/commit/31f81e9af716906a87e5c98c63a13c814b97f72b))
* never lose a run's outcome to the links constraint ([3b1f5c8](https://forgejo.webgrip.dev/webgrip/ploeg/commit/3b1f5c89003bc9df5983c1c432e172b15340b940))
* **ploegd:** retry database connectivity at startup instead of crash-looping ([02877cf](https://forgejo.webgrip.dev/webgrip/ploeg/commit/02877cf28d4387646e229b38bad399848fbd512d))
* **release:** pin notes toolchain so release notes render sections ([7feecd6](https://forgejo.webgrip.dev/webgrip/ploeg/commit/7feecd6476fbe6984feeae0c56a7da873984c7e9))

## [0.1.0-rc.4](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.1.0-rc.3...v0.1.0-rc.4) (2026-07-24)

### Fixed

* **chart:** default the KEDA scaler host to a namespace-qualified FQDN ([31f81e9](https://forgejo.webgrip.dev/webgrip/ploeg/commit/31f81e9af716906a87e5c98c63a13c814b97f72b))
* never lose a run's outcome to the links constraint ([3b1f5c8](https://forgejo.webgrip.dev/webgrip/ploeg/commit/3b1f5c89003bc9df5983c1c432e172b15340b940))
* **ploegd:** retry database connectivity at startup instead of crash-looping ([02877cf](https://forgejo.webgrip.dev/webgrip/ploeg/commit/02877cf28d4387646e229b38bad399848fbd512d))

## [0.1.0-rc.3](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.1.0-rc.2...v0.1.0-rc.3) (2026-07-23)

### Added

* **executor:** OpenHands worker, Helm chart, and chart publishing ([f0956b6](https://forgejo.webgrip.dev/webgrip/ploeg/commit/f0956b6e1accc2b43ba09e849a98532ff8b8c2bc))

## [0.1.0-rc.2](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.1.0-rc.1...v0.1.0-rc.2) (2026-07-23)

### Added

* **ploegd:** working dispatch-plane prototype — ingest, leases, run API ([7b69724](https://forgejo.webgrip.dev/webgrip/ploeg/commit/7b69724cf0ccbbe8a2b35e224a53f8d3ff084c38)), closes [#31](https://forgejo.webgrip.dev/webgrip/ploeg/issues/31) [#49](https://forgejo.webgrip.dev/webgrip/ploeg/issues/49)

### Fixed

* **release:** pin notes toolchain so release notes render sections ([7feecd6](https://forgejo.webgrip.dev/webgrip/ploeg/commit/7feecd6476fbe6984feeae0c56a7da873984c7e9))

## [0.1.0-rc.1](https://forgejo.webgrip.dev/webgrip/ploeg/compare/v0.0.0...v0.1.0-rc.1) (2026-07-23)

### Added

* **work:** align WorkItem with domain model — needs_human state, origin, priority ([b71f2b7](https://forgejo.webgrip.dev/webgrip/ploeg/commit/b71f2b76062ca72c83ed7cfa32c9d4ccd9169e1b)), references [#12](https://forgejo.webgrip.dev/webgrip/ploeg/issues/12)

### CI

* development branch cuts rc prereleases; :latest reserved for stable ([42918de](https://forgejo.webgrip.dev/webgrip/ploeg/commit/42918de366eec519f023b599020438e6810cc1fe))
* park GHCR publish while GitHub is out of scope ([bdd0a57](https://forgejo.webgrip.dev/webgrip/ploeg/commit/bdd0a578084224d27e21b048980344c951ef0970))
* set up release train (semantic-release, ploegd image, publish workflows) ([f6a6d7b](https://forgejo.webgrip.dev/webgrip/ploeg/commit/f6a6d7b0ebeb4a360ee9f3ba48ac973971766fb9))
