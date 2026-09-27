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
