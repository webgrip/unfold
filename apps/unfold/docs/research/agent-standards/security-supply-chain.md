# Security and supply chain

Generated from [`standards.yaml`](standards.yaml); see the [catalogue](index.md).

## C2PA Content Credentials specification { #c2pa }

Not to be confused with: Provenance manifests embedded in media assets. It is not agent action logging.

| | |
| --- | --- |
| Steward | Coalition for Content Provenance and Authenticity (Linux Foundation JDF) (consortium) |
| Status | stable |
| Latest | [2.3 (last GitHub release); spec site lists 2.4 and 2.5 without dates (not verified) 2026-01-11](https://github.com/c2pa-org/specifications/releases/tag/2.3) |
| Radar | **assess**: Legal obligation decided it: Article 50(2) machine-readable marking reaches synthetic images, and Unfold generates card art, but the fit is limited to that one path. |
| Moves when | Generated card art is enabled on a hosted Tenant, or counsel confirms Article 50(2) applies to Run Card images. |
| Competes with | — |
| Complements | [EU Artificial Intelligence Act, Regulation (EU) 2024/1689, as amended by Regulation (EU) 2026/1744 (Digital Omnibus on AI)](governance.md#eu-ai-act) |
| Builds on | — |
| Superseded by | — |
| Decisions | [0031-card-themes-a-card-designer-and-generated-art](../../../../../apps/unfold/docs/adrs/0031-card-themes-a-card-designer-and-generated-art.md), [0055-ploeg-keeps-one-card-comment-with-a-static-card-image-on-the-pull-request](../../../../../apps/ploeg/docs/adrs/0055-ploeg-keeps-one-card-comment-with-a-static-card-image-on-the-pull-request.md), [2026-09-29-agency-pricing-strategy](../../../../../docs/research/2026-09-29-agency-pricing-strategy.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Mark generated Run Card art | Run Card | Proposed: embed a C2PA manifest in generated card art (Unfold ADR-0031), because Article 50(2) of the AI Act asks providers to mark synthetic images in a machine-readable way and the AI-marking contract covers text only. | M | Closes the one image path that the current text markers do not mark. |
| Mark the static card image on pull requests | Ploeg card comment | Proposed: add Content Credentials to the static card image posted on a pull request (Ploeg ADR-0055) when it contains generated art. | S | An image copied out of the forge keeps its provenance. |
| Not for code or pull requests | Run evidence | Keep code and pull request marking on the marker, label and trailers of apps/unfold/docs/contracts/ai-marking.md, since C2PA targets media assets. | S | No mismatch between format and content. |
| Agency transparency notice | Agency contract | Proposed: an Agency's notice can point to C2PA on images and the AI-marking contract on text; whether this meets its duties needs counsel. | S | A complete answer for every output type. |
| Preview Environment screenshots | Preview Environment | Proposed: if Runs ever generate images for a Client's site, mark them with C2PA before they reach a preview. | M | Agencies do not ship unmarked synthetic images to Clients. |

**Shipped adoption:** Spec portal (https://spec.c2pa.org/specifications/specifications/2.3/index.html); 2.4 April 2026 [secondary] (https://softwareseni.com/c2pa-adoption-in-2026-hardware-platforms-and-verification-reality)

**Open problems:** Version ambiguity: 2.4/2.5 are listed with no release record on GitHub (https://spec.c2pa.org/specifications/specifications/2.5/index.html)

**Watched:** github-releases `c2pa-org/specifications` at 2.3, changelog-page `https://spec.c2pa.org/specifications/specifications/2.5/index.html`

## CNCF ModelPack model-spec (OCI model artifacts), with KitOps and Harbor CNAI support { #cncf-modelpack }

Not to be confused with: An OCI artifact media-type spec for models. KitOps ModelKit is a sibling format, and Kit can pack ModelPack with --use-model-pack. Harbor's CNAI model processor reads this spec.

| | |
| --- | --- |
| Steward | CNCF ModelPack (Sandbox, accepted 2025-05-13) (foundation) |
| Status | draft |
| Latest | [v0.0.7 (tag) 2025-07-21](https://github.com/modelpack/model-spec) |
| Radar | **hold**: Maturity and fit decided it: the spec is pre-1.0 with no tag since 2025-07, and Unfold ships no model. |
| Moves when | ModelPack tags v1.0, or Unfold ships a model artifact such as the decider of system ADR-0042. |
| Competes with | — |
| Complements | [OpenSSF Model Signing (OMS) specification and sigstore/model-transparency (model_signing)](security-supply-chain.md#openssf-model-signing), [CycloneDX (ECMA-424) ML-BOM / AI-BOM - modelCard, data components, formulation](security-supply-chain.md#cyclonedx-mlbom), [SLSA (Supply-chain Levels for Software Artifacts) applied to ML models](security-supply-chain.md#slsa-models) |
| Builds on | — |
| Superseded by | — |
| Decisions | [adr-0043-an-unfold-release-is-one-chart-that-carries-the-ploeg-it-was-tested-with](../../../../../docs/adr/adr-0043-an-unfold-release-is-one-chart-that-carries-the-ploeg-it-was-tested-with.md), [adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire](../../../../../docs/adr/adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Ship the decider model as an OCI artifact | release pipeline | Proposed: push decider weights to Harbor as a ModelPack artifact next to the images, copied to GHCR and Forgejo with regctl like the images (docs/operations/artifacts.md). | M | Models get the same registry, digest and copy rules as images. |
| Chart pins the model by digest | Helm chart | Proposed: the chart that carries the tested Ploeg (system ADR-0043) could also pin the decider model by digest. | S | A release names every artifact it was tested with. |
| Self-hosted Agencies pull models offline | hosted Tenant | Proposed: an Agency running its own cluster mirrors models with its usual OCI tooling instead of a Hugging Face download. | S | Fits air-gapped and EU-only setups. |
| Signature and SBOM by referrers | release pipeline | Proposed: attach cosign signatures and a BOM as referrers, since the spec defines no signing link itself. | S | Reuses existing referrer copying. |
| KitOps as a packer | release pipeline | Proposed: use kit pack --use-model-pack rather than a home-grown packer if this is adopted. | S | No custom tooling. |

**Shipped adoption:** CNCF project page (https://www.cncf.io/projects/modelpack/); Harbor v2.13.0 (2025-04-10) CNAI model processor and AI Model artifact type (https://github.com/goharbor/harbor/releases/tag/v2.13.0); Harbor v2.16.0-rc1 (2026-10-27) migrates the dependency to the modelpack org (https://github.com/goharbor/harbor/releases/tag/v2.16.0-rc1); KitOps v1.16.0, 2026-09-29 (https://github.com/kitops-ml/kitops/releases/tag/v1.16.0)

**Open problems:** Pre-1.0 versioning with no tag since 2025-07; Schema validation bug (https://github.com/modelpack/model-spec/pull/191); absence: no signing or SBOM linkage defined in the spec

**Watched:** github-tags `modelpack/model-spec` at v0.0.7, github-releases `kitops-ml/kitops` at v1.16.0, github-releases `goharbor/harbor` at v2.15.4

## CoSAI Model Context Protocol (MCP) Security white paper / threat taxonomy { #cosai-mcp-security }

Not to be confused with: An OASIS-hosted Coalition for Secure AI (Workstream 4) taxonomy of 12 threat categories and roughly 40 threats. It is not SAFE-MCP.

| | |
| --- | --- |
| Steward | CoSAI (OASIS Open Project) (consortium) |
| Status | stable |
| Latest | [white paper 2026-01-27](https://www.oasis-open.org/2026/01/27/coalition-for-secure-ai-releases-extensive-taxonomy-for-model-context-protocol-security) |
| Radar | **trial**: Fit decided it: a static paper, but a cheap and directly relevant checklist for two MCP servers. |
| Moves when | CoSAI publishes a machine-readable catalogue or a newer version, or the review finds nothing the OWASP lists did not. |
| Competes with | — |
| Complements | [OWASP Top 10 for Agentic Applications 2026 (with OWASP Top 10 for LLM Applications 2026 and Agent Control Standard)](security-supply-chain.md#owasp-agentic-top10), [MITRE ATLAS (Adversarial Threat Landscape for AI Systems)](security-supply-chain.md#mitre-atlas), [SEP-2809: Attested Tool-Server Admission (ATSA)](security-supply-chain.md#mcp-sep-2809-atsa) |
| Builds on | — |
| Superseded by | — |
| Decisions | [2026-09-30-mcp-server-patterns](../../../../../docs/research/2026-09-30-mcp-server-patterns.md), [0152-ploeg-mcp-signs-each-confirmation-and-acts-on-it-once](../../../../../apps/ploeg/docs/adrs/0152-ploeg-mcp-signs-each-confirmation-and-acts-on-it-once.md), [0174-ploeg-mcp-accepts-a-token-only-for-its-own-resource-from-an-https-issuer](../../../../../apps/ploeg/docs/adrs/0174-ploeg-mcp-accepts-a-token-only-for-its-own-resource-from-an-https-issuer.md), [0078-runs-reach-read-only-mcp-tools-only-through-the-gateway-bounded-by-a-litellm-team](../../../../../apps/ploeg/docs/adrs/0078-runs-reach-read-only-mcp-tools-only-through-the-gateway-bounded-by-a-litellm-team.md) |
| Watchlist | T30, T34 |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Review checklist for unfold-mcp | unfold-mcp | Proposed: walk the 12 threat categories against unfold-mcp and record the result beside the 2026-09-30 security evidence. | S | A second, independent checklist for the server that faces people's clients. |
| Review ploeg-mcp confirmations | ploeg-mcp | Proposed: check signed single-use confirmations (Ploeg ADR-0152) and audience checks (Ploeg ADR-0174) against the taxonomy's authorization threats. | S | Shows gaps in the action path. |
| Gateway tools for Runs | Ploeg gateway | Proposed: use the tool-poisoning and rug-pull categories to judge the read-only MCP tools Runs reach through the gateway (Ploeg ADR-0078). | S | Covers the path where model-directed code meets third-party tools. |
| Interceptor requirements | Ploeg gateway | Proposed: derive what an MCP interceptor would need to block (watchlist T34) from the taxonomy. | S | Clear requirements before choosing tooling. |
| Agency answer sheet | Agency contract | Proposed: publish the category-by-category result for Agencies that ask how MCP is secured. | S | A ready answer for a common question. |

**Shipped adoption:** Press release (https://www.oasis-open.org/2026/01/27/coalition-for-secure-ai-releases-extensive-taxonomy-for-model-context-protocol-security)

**Open problems:** Static paper; no machine-readable catalogue verified (not verified)

**Watched:** changelog-page `https://github.com/cosai-oasis`

## CycloneDX (ECMA-424) ML-BOM / AI-BOM - modelCard, data components, formulation { #cyclonedx-mlbom }

Not to be confused with: CycloneDX components of type machine-learning-model and data with modelCard. ML-BOM has existed since 1.5. 1.7 added citations, TLP distribution marking, patents and a broader formulation scope (https://github.com/CycloneDX/specification/releases/tag/1.7).

| | |
| --- | --- |
| Steward | OWASP CycloneDX / Ecma TC54 (sdo) |
| Status | stable |
| Latest | [1.7.2 (1.7 GA 2025-10-21) 2026-09-17](https://github.com/CycloneDX/specification/releases/tag/1.7.2) |
| Radar | **assess**: Fit decided it: CycloneDX itself is stable and already used for image attestations, but Unfold ships no model of its own and consumers ignore modelCard. |
| Moves when | An Agency or its Client asks for an AI-BOM of the hosted service, or the decider of system ADR-0042 ships a self-hosted model. |
| Competes with | [SPDX 3.0 AI and Dataset profiles](security-supply-chain.md#spdx3-ai-dataset) |
| Complements | [OWASP GenAI Security Project AIBOM Initiative and AIBOM Generator](security-supply-chain.md#owasp-aibom), [Dependency-Track support for ML-BOM](security-supply-chain.md#dependency-track-mlbom), [OpenSSF Model Signing (OMS) specification and sigstore/model-transparency (model_signing)](security-supply-chain.md#openssf-model-signing), [CNCF ModelPack model-spec (OCI model artifacts), with KitOps and Harbor CNAI support](security-supply-chain.md#cncf-modelpack) |
| Builds on | — |
| Superseded by | — |
| Decisions | [0145-a-release-publishes-no-image-over-its-cve-budget-and-attaches-signed-openvex-to-every-digest](../../../../../apps/ploeg/docs/adrs/0145-a-release-publishes-no-image-over-its-cve-budget-and-attaches-signed-openvex-to-every-digest.md), [0091-each-run-records-the-model-harness-plan-and-ploegd-version-it-was-configured-with](../../../../../apps/ploeg/docs/adrs/0091-each-run-records-the-model-harness-plan-and-ploegd-version-it-was-configured-with.md), [0057-a-delivery-brief-is-one-evidence-backed-record-rendered-per-audience](../../../../../apps/unfold/docs/adrs/0057-a-delivery-brief-is-one-evidence-backed-record-rendered-per-audience.md), [adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire](../../../../../docs/adr/adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Per-Tenant AI-BOM of models used | hosted Tenant | Proposed: generate a CycloneDX document with machine-learning-model components for every Model a Tenant's Roles may call, from the model and harness each Run records (Ploeg ADR-0091). | M | Gives an Agency the model inventory its own AI Act and Client questionnaires ask for. |
| Extend the image attestations | release pipeline | Unfold images already carry CycloneDX attestations checked by scripts/release_registry.py (docs/operations/artifacts.md); proposed: add the decider model as an ML component when system ADR-0042 ships one. | S | One BOM format covers code and model. |
| Model card fields in the Delivery Brief | Run evidence | Proposed: link each Run's model to a modelCard entry so the Delivery Brief (Unfold ADR-0057) can name model, provider and known limits. | M | Reviewers see which model wrote the change and its documented limits. |
| Formulation for the Run | Ploeg ledger | Proposed: express the Run configuration (harness, model, plan, skills by digest per Ploeg ADR-0092) as a CycloneDX formulation so it travels with the candidate. | L | A standard record of how a change was produced. |
| VEX alignment | release pipeline | Ploeg ADR-0145 defers CycloneDX VEX until a CycloneDX SBOM is published; proposed: decide both together so Unfold and Ploeg emit one format. | S | Avoids two VEX formats across the two applications. |

**Shipped adoption:** OWASP AIBOM Generator emits CycloneDX 1.6 (https://github.com/GenAI-Security-Project/aibom-generator); Dependency-Track ingests the CycloneDX 1.7 proto (https://github.com/DependencyTrack/dependency-track/pull/6237)

**Open problems:** Consumers mostly ignore modelCard; DT persists no modelCard (see dependency-track-mlbom); AgBOM (agentic BOM) is still only a planned OWASP framework [secondary] (https://monoist.itmedia.co.jp/mn/articles/2609/11/news021_2.html)

**Watched:** github-releases `CycloneDX/specification` at 1.7.2

## Dependency-Track support for ML-BOM { #dependency-track-mlbom }

Not to be confused with: Tool support, not a standard. DT v5 has MACHINE_LEARNING_MODEL and DATA classifiers (https://github.com/DependencyTrack/dependency-track/blob/main/apiserver/src/main/java/org/dependencytrack/model/Classifier.java). absence: GitHub code search found no getModelCard handling, so modelCard data is parsed via proto but not persisted or analysed.

| | |
| --- | --- |
| Steward | OWASP Dependency-Track (foundation) |
| Status | stabilising |
| Latest | [5.2.1 (also 4.14.6); 5.0.0 GA 2026-06-07 2026-10-25](https://github.com/DependencyTrack/dependency-track/releases/tag/5.2.1) |
| Radar | **hold**: Maturity decided it for the ML-BOM part: classifiers exist but modelCard data is neither persisted nor analysed, and Unfold runs no Dependency-Track today. |
| Moves when | Dependency-Track persists modelCard data or adds a model risk feed, or the owner decides to run it as the SBOM sink. |
| Competes with | — |
| Complements | [CycloneDX (ECMA-424) ML-BOM / AI-BOM - modelCard, data components, formulation](security-supply-chain.md#cyclonedx-mlbom), [OWASP GenAI Security Project AIBOM Initiative and AIBOM Generator](security-supply-chain.md#owasp-aibom) |
| Builds on | [CycloneDX (ECMA-424) ML-BOM / AI-BOM - modelCard, data components, formulation](security-supply-chain.md#cyclonedx-mlbom) |
| Superseded by | — |
| Decisions | [0145-a-release-publishes-no-image-over-its-cve-budget-and-attaches-signed-openvex-to-every-digest](../../../../../apps/ploeg/docs/adrs/0145-a-release-publishes-no-image-over-its-cve-budget-and-attaches-signed-openvex-to-every-digest.md), [0010-one-release-train-with-zero-cve-images](../../../../../apps/unfold/docs/adrs/0010-one-release-train-with-zero-cve-images.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| SBOM sink for Unfold releases | release pipeline | Proposed: upload each release's CycloneDX SBOM to a Dependency-Track instance so new CVEs against published Unfold images are noticed after release, not only at the CVE gate of Unfold ADR-0010. | M | Catches vulnerabilities disclosed after a release shipped. |
| VEX that Dependency-Track reads | release pipeline | Ploeg ADR-0145 notes Dependency-Track imports only CycloneDX VEX; proposed: emit CycloneDX VEX beside OpenVEX if Dependency-Track becomes the sink. | S | Suppressed findings stay suppressed in the portfolio. |
| Model inventory per Tenant | hosted Tenant | Proposed: list each Tenant's models as MACHINE_LEARNING_MODEL components to track them, knowing modelCard data is not stored. | S | One portfolio view of code and model components. |
| Agency-facing vulnerability report | Agency contract | Proposed: give a hosted Agency a read-only view or export of the portfolio for the release its Tenant runs. | M | Answers NIS2 supply-chain questions from Agencies' Clients. |
| No model risk feed expected | decider (system ADR-0042) | Do not rely on Dependency-Track for model risk; it has no model vulnerability feed. | S | Sets the right expectation. |

**Shipped adoption:** "CycloneDX 1.7.1 proto (https://github.com/DependencyTrack/dependency-track/pull/6237)"; "5.0.0 release (https://github.com/DependencyTrack/dependency-track/releases/tag/5.0.0)"

**Open problems:** "v4 lacks CycloneDX 1.5/1.6 classifiers (https://github.com/DependencyTrack/dependency-track/issues/4361)"; "CBOM support still open (https://github.com/DependencyTrack/dependency-track/issues/6191)"; "No model vulnerability or risk feed (absence)"

**Watched:** github-releases `DependencyTrack/dependency-track` at 5.2.1

## IETF AUDIT (Agent Use of Delegation and Interaction Traceability) BoF { #ietf-audit }

Not to be confused with: A proposed IETF effort on audit records for agent delegation chains. It is not SCITT, though drafts reference it.

| | |
| --- | --- |
| Steward | IETF (BoF; group state 'bof', updated 2026-10-08) (sdo) |
| Status | draft |
| Latest | [BoF session scheduled at IETF 127, San Francisco (meeting starts 2026-11-14); anchor draft-kuehlewind-audit-architecture-01 2026-09-07](https://datatracker.ietf.org/doc/draft-kuehlewind-audit-architecture/) |
| Radar | **assess**: Maturity decided it: this is an unchartered BoF with more than 15 overlapping drafts, but it targets exactly the delegation record Unfold already keeps. |
| Moves when | The IESG charters an AUDIT working group with an adopted architecture draft. |
| Competes with | — |
| Complements | [Supply Chain Integrity, Transparency, and Trust (SCITT) - RFC 9943 architecture, RFC 9942 COSE Receipts, SCRAPI](security-supply-chain.md#ietf-scitt), [OpenTelemetry Semantic Conventions for Generative AI (client, agent, MCP, A2A, provider-specific)](observability.md#otel-genai-semconv) |
| Builds on | — |
| Superseded by | — |
| Decisions | [0108-every-operator-action-names-its-person-and-channel-and-an-mcp-action-needs-the-persons-confirmation](../../../../../apps/ploeg/docs/adrs/0108-every-operator-action-names-its-person-and-channel-and-an-mcp-action-needs-the-persons-confirmation.md), [adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation](../../../../../docs/adr/adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation.md), [0156-each-run-carries-a-transaction-token-that-names-its-person-and-a-team-without-a-sponsor-runs-nothing](../../../../../apps/ploeg/docs/adrs/0156-each-run-carries-a-transaction-token-that-names-its-person-and-a-team-without-a-sponsor-runs-nothing.md), [2026-10-30-mcp-extensions-fit](../../../../../apps/unfold/docs/research/2026-10-30-mcp-extensions-fit.md) |
| Watchlist | T30 |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Map the action record to AUDIT drafts | Ploeg ledger | Proposed: compare the record that names person, channel and confirmation for every operator action (Ploeg ADR-0108, system ADR-0037, RFC-0011) with draft-kuehlewind-audit-architecture and note the gaps. | S | Shows early whether Unfold's attribution model matches where the standard is heading. |
| Delegation chain in the OCSF export | Unfold audit chain | Proposed: add the delegation chain (person, Team sponsor, Run transaction token per Ploeg ADR-0156) as fields in the OCSF events of docs/operations/audit-siem.md once a draft settles names. | M | An Agency's SIEM can follow who authorised what an agent did. |
| Audit context on tool calls | unfold-mcp | Proposed: carry SEP-2817 audit context (model, intent, turn id) on Ploeg's tool calls and align it with AUDIT records when both exist (watchlist T30). | M | One record format for both protocol and audit log. |
| Agency evidence pack | Agency contract | Proposed: offer Agencies an export of the delegation records per Client Project for their own audits. | S | Answers 'who let the agent do this' per Client. |
| Follow IETF 127 | Run evidence | Read the BoF outcome at IETF 127 (from 2026-11-14) and decide whether to comment with the Run transaction-token case. | S | Cheap influence on a standard that would cover Unfold's core record. |

**Shipped adoption:** none: no shipped implementation found

**Open problems:** Not chartered; more than 15 overlapping individual drafts in Aug-Nov 2026, e.g. draft-gilda-audit-agent-audit-record-03 (https://datatracker.ietf.org/doc/draft-gilda-audit-agent-audit-record/), draft-gruszka-audit-decision-receipts-05 (https://datatracker.ietf.org/doc/draft-gruszka-audit-decision-receipts/), draft-sharif-agent-audit-trail-09 (https://datatracker.ietf.org/doc/draft-sharif-agent-audit-trail/)

**Watched:** ietf-draft `draft-kuehlewind-audit-architecture` at 01, ietf-draft `draft-gilda-audit-agent-audit-record` at 03, ietf-draft `draft-sharif-agent-audit-trail` at 09, changelog-page `https://datatracker.ietf.org/group/audit/about/`

## MCP Bundle (.mcpb) PKCS#7 signature { #mcpb-signature }

Not to be confused with: Signing of local MCP server bundles (formerly DXT) with `mcpb sign/verify/unsign` using PKCS#7 (https://github.com/modelcontextprotocol/mcpb/blob/main/CLI.md). It is not registry or remote-server identity.

| | |
| --- | --- |
| Steward | Model Context Protocol project (AAIF / Linux Foundation) (foundation) |
| Status | stabilising |
| Latest | [v2.1.2 2025-12-04](https://github.com/modelcontextprotocol/mcpb/releases/tag/v2.1.2) |
| Radar | **hold**: Maturity decided it: signatures are never actually verified, the signature-required policy refuses all extensions, and fixes are unmerged. |
| Moves when | mcpb PR 255 or 286 merges and a release verifies signatures end to end. |
| Competes with | — |
| Complements | [SEP-2809: Attested Tool-Server Admission (ATSA)](security-supply-chain.md#mcp-sep-2809-atsa), [MCP conformance suite (@modelcontextprotocol/conformance)](security-supply-chain.md#mcp-conformance) |
| Builds on | — |
| Superseded by | — |
| Decisions | [adr-0032-unfold-also-serves-its-own-read-only-mcp-tools-next-to-ploeg-mcp](../../../../../docs/adr/adr-0032-unfold-also-serves-its-own-read-only-mcp-tools-next-to-ploeg-mcp.md) |
| Watchlist | T17 |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Sign a desktop bundle | release pipeline | Proposed: if an unfold-mcp .mcpb ships, sign it with mcpb sign and also with cosign, because the PKCS#7 check is a stub today (issue 260). | S | A verifiable bundle despite the broken built-in check. |
| Document manual verification | unfold-mcp | Proposed: tell people to verify the cosign signature and checksum, not the desktop client's 'signed' badge. | S | Avoids false assurance. |
| Agency allowlist of bundles | hosted Tenant | Proposed: an Agency's device policy could admit only the Unfold bundle once signature-required stops refusing everything (issue 305). | M | Controls which MCP servers an Agency's people install. |
| Plugin reference | VS Code extension | Proposed: the Agent Plugin (T17) would reference a signed bundle by digest. | S | One signed artifact for both surfaces. |
| Wait for fix PRs | unfold-mcp | Follow PRs 255 and 286 and build nothing on mcpb signatures until they merge. | S | No investment in a check that does not check. |

**Shipped adoption:** Claude for macOS/Windows loader (https://github.com/modelcontextprotocol/mcpb)

**Open problems:** Signatures are never actually verified because of a node-forge stub (https://github.com/modelcontextprotocol/mcpb/issues/260); The 'signature required' desktop policy refuses all extensions (https://github.com/modelcontextprotocol/mcpb/issues/305); Wrong OpenSSL purpose in the Linux chain check (https://github.com/modelcontextprotocol/mcpb/issues/307); Fix PRs open: https://github.com/modelcontextprotocol/mcpb/pull/255 and https://github.com/modelcontextprotocol/mcpb/pull/286

**Watched:** github-releases `modelcontextprotocol/mcpb` at v2.1.2

## MCP Bundles (.mcpb, formerly DXT) { #mcpb }

| | |
| --- | --- |
| Steward | Model Context Protocol project (originated at Anthropic) (foundation) |
| Status | dormant |
| Latest | [CLI v2.1.2; manifest_version 0.3 (0.4 referenced for uv runtime) 2025-12-04](https://github.com/modelcontextprotocol/mcpb) |
| Radar | **hold**: Maturity decided it: the project has had no release since 2025-12-04 and no commit since 2026-04-22, and Unfold's MCP servers are remote-first, so the fit is marginal. |
| Moves when | The mcpb repository ships a release after v2.1.2 and an Agency asks for a desktop install of unfold-mcp. |
| Competes with | [Docker Agent (formerly cagent) agent YAML](definition.md#docker-agent) |
| Complements | — |
| Builds on | — |
| Superseded by | — |
| Decisions | [adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server](../../../../../docs/adr/adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server.md), [adr-0032-unfold-also-serves-its-own-read-only-mcp-tools-next-to-ploeg-mcp](../../../../../docs/adr/adr-0032-unfold-also-serves-its-own-read-only-mcp-tools-next-to-ploeg-mcp.md), [2026-10-13-protocol-integration-gaps](../../../../../apps/unfold/docs/research/2026-10-13-protocol-integration-gaps.md) |
| Watchlist | T17 |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| One-click unfold-mcp for desktop clients | unfold-mcp | Proposed: package a stdio build of unfold-mcp as an .mcpb so a person installs it in Claude Desktop without editing JSON; the 2026-10-13 dossier already rates the MCPB desktop bundle as optional, size S. | S | Lowers the setup cost for an Agency developer who works in a desktop chat client rather than an editor. |
| Bundle referenced from the Agent Plugin | VS Code extension | Proposed: let the repository-declared Unfold Agent Plugin (watchlist T17) point at a released .mcpb instead of a hand-written mcp.json entry. | S | One artifact serves both the editor plugin and desktop clients. |
| Release the bundle with the train | release pipeline | Proposed: build the .mcpb in the hourly release train beside the VSIX (ADR-0043, docs/operations/release.md) and attach it with a SHA-256 file, the way the VSIX is attached. | M | A bundle gets the same version, checksum and floor rules as every other Unfold artifact. |
| Remote-first stays the default | unfold-mcp | Keep the Streamable HTTP endpoint of ADR-0032 as the supported path and document the bundle only as a convenience, because a local bundle carries the person's token on their own machine. | S | Avoids a second supported transport while the format is dormant. |
| Agency-wide desktop rollout | hosted Tenant | Proposed: in phase 2 a Tenant administrator could hand out one bundle preset to the Tenant's hosted URL so every Agency developer connects to the right Tenant. | M | Removes per-person configuration mistakes that point a client at the wrong Tenant. |

**Shipped adoption:** Claude for macOS and Windows (https://github.com/modelcontextprotocol/mcpb)

**Open problems:** Last commit 2026-04-22; 74 open issues, 32 open PRs (https://github.com/modelcontextprotocol/mcpb)

**Watched:** github-releases `modelcontextprotocol/mcpb` at v2.1.2

## MCP conformance suite (@modelcontextprotocol/conformance) { #mcp-conformance }

Not to be confused with: A test suite for MCP clients, servers and authorization servers. It is not a certification.

| | |
| --- | --- |
| Steward | Model Context Protocol project (foundation) |
| Status | stabilising |
| Latest | [0.1.16 (npm latest 2026-03-30); 0.2.0-alpha.12 (2026-10-01, adds DPoP SEP-1932 and skills SEP-2640) 2026-10-01](https://github.com/modelcontextprotocol/conformance) |
| Radar | **adopt**: Fit decided it: the suite is already in Unfold's e2e gate and in system ADR-0011, though the stable line lags the 2026-07-28 spec. |
| Moves when | The suite stops being maintained, or a certification replaces it as what clients check. |
| Competes with | — |
| Complements | [Model Context Protocol Associate (MCPA) certification](governance.md#aaif-mcpa), [SEP-2809: Attested Tool-Server Admission (ATSA)](security-supply-chain.md#mcp-sep-2809-atsa) |
| Builds on | — |
| Superseded by | — |
| Decisions | [adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server](../../../../../docs/adr/adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server.md), [adr-0032-unfold-also-serves-its-own-read-only-mcp-tools-next-to-ploeg-mcp](../../../../../docs/adr/adr-0032-unfold-also-serves-its-own-read-only-mcp-tools-next-to-ploeg-mcp.md), [2026-09-30-mcp-server-patterns](../../../../../docs/research/2026-09-30-mcp-server-patterns.md) |
| Watchlist | T10, T31 |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Keep the unfold-mcp gate | unfold-mcp | The e2e suite apps/unfold/test/e2e/mcp-over-https.e2e.ts already runs conformance 0.1.16 for server-initialize, ping and tools-list through a real Authentik token; keep it in mise run verify. | S | Proves the server still speaks MCP after each change. |
| Run both protocol eras | unfold-mcp | Proposed: add the 0.2.0 alpha line against 2026-07-28 and 2025-11-25, the way system ADR-0011's Confirmation asks of ploeg-mcp with a fixture build. | S | Catches breakage for stateless clients such as claude.ai. |
| Authorization server scenarios | hosted Tenant | Proposed: run the auth scenarios against the hosted sign-in once phase 2 exists, since Authentik lacks resource audiences (2026-09-30 research). | M | Shows which clients will fail sign-in before an Agency does. |
| Per-check baseline | release pipeline | Proposed: store a baseline of expected failures so a new failing scenario blocks the release train and a known one does not. | S | Lets the suite gate without false alarms. |
| Track new SEPs | unfold-mcp | Proposed: enable the alpha's skills (SEP-2640) and DPoP scenarios when watchlist items T10 or T31 fire. | S | Tests features before Unfold claims them. |

**Shipped adoption:** npm package (https://www.npmjs.com/package/@modelcontextprotocol/conformance)

**Open problems:** The stable line lags the 2026-07-28 spec; new scenarios exist only in alpha (https://github.com/modelcontextprotocol/conformance/commits/main)

**Watched:** github-releases `modelcontextprotocol/conformance` at v0.1.16

## MITRE ATLAS (Adversarial Threat Landscape for AI Systems) { #mitre-atlas }

Not to be confused with: An ATT&CK-style knowledge base of AI attack tactics and techniques. It is a taxonomy, not a control set.

| | |
| --- | --- |
| Steward | MITRE (community) |
| Status | stable |
| Latest | [v2026.10 (16 tactics, 129 techniques, 92 sub-techniques, 44 mitigations, 77 case studies) 2026-10-28](https://github.com/mitre-atlas/atlas-data/releases/tag/v2026.10) |
| Radar | **trial**: Fit decided it: it is a stable, free taxonomy that adds coverage tracking to the existing drill at low cost, though ids churn. |
| Moves when | A re-numbering breaks more than a few tagged scenarios in one release, or OWASP ids alone satisfy every reviewer who asks. |
| Competes with | — |
| Complements | [OWASP Top 10 for Agentic Applications 2026 (with OWASP Top 10 for LLM Applications 2026 and Agent Control Standard)](security-supply-chain.md#owasp-agentic-top10), [CoSAI Model Context Protocol (MCP) Security white paper / threat taxonomy](security-supply-chain.md#cosai-mcp-security), [NIST AI Risk Management Framework (AI 100-1) and Generative AI Profile (NIST AI 600-1)](governance.md#nist-ai-rmf) |
| Builds on | — |
| Superseded by | — |
| Decisions | [0126-a-recurring-attack-drill-runs-every-harness-against-a-hostile-repository](../../../../../apps/ploeg/docs/adrs/0126-a-recurring-attack-drill-runs-every-harness-against-a-hostile-repository.md), [adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire](../../../../../docs/adr/adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Tag attack drill scenarios | Ploeg attack drill | Proposed: tag each hostile-repository scenario (Ploeg ADR-0126) with ATLAS technique ids pinned to v2026.10, next to the OWASP ids. | S | Shows which known techniques the drill covers and which it misses. |
| Extend the threat model | Ploeg threat model | Proposed: add an ATLAS column to the AI-risk rows of apps/ploeg/docs/security/threat-model.md, which maps only OWASP today. | S | Security reviewers who think in ATT&CK terms can read it. |
| Decider labels | decider (system ADR-0042) | Proposed: label the decider's training and test cases with ATLAS techniques so its recall can be reported per technique. | S | A tripwire score broken down by attack type. |
| Agency security questionnaire | Agency contract | Proposed: answer Clients' AI security questionnaires with the technique coverage table. | S | A recognised vocabulary for buyers. |
| Pin and re-check on release | Ploeg threat model | Proposed: re-check ids at each monthly data release, since techniques get re-numbered. | S | Prevents stale ids. |

**Shipped adoption:** Monthly data releases (https://github.com/mitre-atlas/atlas-data/releases); Mapped by OWASP LLM Top 10 2026 (https://genai.owasp.org/resource/owasp-genai-llm-top-10-2026/)

**Open problems:** Frequent technique re-IDs, e.g. AML.T0024 sub-techniques moved to AML.T0137 in v2026.10 (https://github.com/mitre-atlas/atlas-data/releases/tag/v2026.10)

**Watched:** github-releases `mitre-atlas/atlas-data` at v2026.10

## OpenSSF Model Signing (OMS) specification and sigstore/model-transparency (model_signing) { #openssf-model-signing }

Not to be confused with: A detached signature over a manifest of every file in a model directory, using Sigstore keyless, bare keys or PKI. It is not cosign image signing, though it shares the Sigstore bundle format.

| | |
| --- | --- |
| Steward | OpenSSF AI/ML Security WG; Sigstore (foundation) |
| Status | stabilising |
| Latest | [model-signing 1.1.1 (PyPI); main adds RFC 3161 timestamps (2026-10-23, #620) 2025-10-10](https://github.com/sigstore/model-transparency/releases/tag/v1.1.1) |
| Radar | **assess**: Fit decided it: the method is sound and Sigstore-compatible, but Unfold ships no model yet and the library has had no release in 13 months. |
| Moves when | The decider of system ADR-0042 is accepted with a self-hosted model, or model-transparency ships a release with OCI manifest signing. |
| Competes with | — |
| Complements | [CNCF ModelPack model-spec (OCI model artifacts), with KitOps and Harbor CNAI support](security-supply-chain.md#cncf-modelpack), [SLSA (Supply-chain Levels for Software Artifacts) applied to ML models](security-supply-chain.md#slsa-models), [CycloneDX (ECMA-424) ML-BOM / AI-BOM - modelCard, data components, formulation](security-supply-chain.md#cyclonedx-mlbom), [Supply Chain Integrity, Transparency, and Trust (SCITT) - RFC 9943 architecture, RFC 9942 COSE Receipts, SCRAPI](security-supply-chain.md#ietf-scitt) |
| Builds on | — |
| Superseded by | — |
| Decisions | [adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire](../../../../../docs/adr/adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire.md), [0010-one-release-train-with-zero-cve-images](../../../../../apps/unfold/docs/adrs/0010-one-release-train-with-zero-cve-images.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Sign the decider's weights | decider (system ADR-0042) | Proposed: sign the self-hosted decider model directory with model_signing, using a key or PKCS#11 backed by OpenBao, and verify before load. | S | A swapped model fails to load instead of silently scoring tool calls. |
| Verify open-weight models behind the gateway | Ploeg routing | Proposed: when a Team serves open weights itself, verify the publisher's OMS signature before exposing the model through the gateway (Ploeg ADR-0177). | M | Closes a supply-chain gap that image signing does not cover. |
| Same trust root as images | release pipeline | Proposed: reuse the OpenBao key of the cosign signing in docs/operations/artifacts.md so one public key verifies images, VSIX and models. | S | One trust anchor for operators. |
| Admission check in the cluster | hosted Tenant | Proposed: once an admission controller verifies OMS, refuse an unsigned model in a hosted Tenant namespace. | M | Enforces signing instead of documenting it. |
| Evidence for Agencies | Agency contract | Proposed: name the model signature digest in the per-Tenant model list. | S | Lets an Agency show which exact model it used. |

**Shipped adoption:** Spec (https://github.com/ossf/model-signing-spec); CLI and library (https://pypi.org/project/model-signing/); 1.1.0 added private Sigstore instances, PKCS#11 and OTel tracing (https://github.com/sigstore/model-transparency/releases/tag/v1.1.0)

**Open problems:** OCI manifest signing PR still open (https://github.com/sigstore/model-transparency/pull/623); No convention for naming signatures in a repo (https://github.com/sigstore/model-transparency/issues/587); No release in 13 months despite active main; absence: no Kyverno verification of OMS

**Watched:** github-releases `sigstore/model-transparency` at v1.1.1, rss `https://github.com/ossf/model-signing-spec/commits/HEAD.atom`

## OWASP GenAI Security Project AIBOM Initiative and AIBOM Generator { #owasp-aibom }

Not to be confused with: An OWASP initiative and tool that produce CycloneDX AIBOMs from Hugging Face model metadata with completeness scoring. It is not a separate format.

| | |
| --- | --- |
| Steward | OWASP GenAI Security Project (foundation) |
| Status | stabilising |
| Latest | [main (no releases; last merge 2026-10-17) 2026-10-17](https://github.com/GenAI-Security-Project/aibom-generator) |
| Radar | **hold**: Fit and maturity decided it: the tool reads Hugging Face metadata, emits CycloneDX 1.6, has no versioned releases, and Unfold reaches its models mostly through provider APIs. |
| Moves when | Unfold or Ploeg ships a self-hosted model from Hugging Face, or the generator cuts a versioned release on CycloneDX 1.7. |
| Competes with | — |
| Complements | [CycloneDX (ECMA-424) ML-BOM / AI-BOM - modelCard, data components, formulation](security-supply-chain.md#cyclonedx-mlbom), [Dependency-Track support for ML-BOM](security-supply-chain.md#dependency-track-mlbom) |
| Builds on | [CycloneDX (ECMA-424) ML-BOM / AI-BOM - modelCard, data components, formulation](security-supply-chain.md#cyclonedx-mlbom) |
| Superseded by | — |
| Decisions | [adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire](../../../../../docs/adr/adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire.md), [0177-ploeg-reaches-models-through-a-gateway-contract-with-litellm-and-envoy-ai-gateway-as-implementations](../../../../../apps/ploeg/docs/adrs/0177-ploeg-reaches-models-through-a-gateway-contract-with-litellm-and-envoy-ai-gateway-as-implementations.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| AIBOM for a self-hosted decider | decider (system ADR-0042) | Proposed: if the decider's weights come from Hugging Face, run the generator on that model and store the AIBOM with the release. | S | A free starting BOM with a completeness score. |
| Open-weight model due diligence | Ploeg routing | Proposed: before a Team adds an open-weight model behind the gateway (Ploeg ADR-0177), check its AIBOM completeness score as one input. | S | Flags models with missing licence or training-data metadata. |
| Agency model sheet | Agency contract | Proposed: attach generated AIBOMs for open-weight models to the Agency-facing model list in phase 2. | S | Answers model-provenance questions from Clients. |
| AgBOM watch | Run evidence | Follow the planned AgBOM framework (targeted for 2027) as a possible standard description of a Run's agents, tools and models. | S | Could replace a home-grown Run description later. |
| Not for API models | Ploeg routing | Skip the generator for models reached only through a provider's API, since it reads Hugging Face metadata. | S | Avoids misleading BOMs for hosted models. |

**Shipped adoption:** Hosted tool (https://owasp-genai-aibom.org); Listed in the CycloneDX Tool Center (https://cyclonedx.org/tool-center/)

**Open problems:** Emits CycloneDX 1.6, not 1.7 (https://github.com/GenAI-Security-Project/aibom-generator); No versioned releases; AgBOM v1.0 targeted for Q2 2027 [secondary] (https://monoist.itmedia.co.jp/mn/articles/2609/11/news021_2.html)

**Watched:** rss `https://github.com/GenAI-Security-Project/aibom-generator/commits/HEAD.atom`, changelog-page `https://genai.owasp.org/initiative_name/ai-bill-of-materials/`

## OWASP Top 10 for Agentic Applications 2026 (with OWASP Top 10 for LLM Applications 2026 and Agent Control Standard) { #owasp-agentic-top10 }

Not to be confused with: Risk lists ASI01-ASI10 (goal hijack, tool misuse, identity/privilege abuse, cascading failures and others). The Agent Control Standard (ACS), donated in Sept 2026, targets runtime enforcement.

| | |
| --- | --- |
| Steward | OWASP GenAI Security Project (foundation) |
| Status | stable |
| Latest | [Agentic 2026 (released 2025-12-09); LLM Top 10 2026 (2026-09-01/02) 2025-12-09](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/) |
| Radar | **adopt**: Fit and maturity decided it: the list is stable, already used in Ploeg's threat model, and matches Unfold's risks. |
| Moves when | OWASP publishes a newer agentic list, or ACS gets a versioned release that replaces the list for runtime controls. |
| Competes with | — |
| Complements | [MITRE ATLAS (Adversarial Threat Landscape for AI Systems)](security-supply-chain.md#mitre-atlas), [CoSAI Model Context Protocol (MCP) Security white paper / threat taxonomy](security-supply-chain.md#cosai-mcp-security), [AIUC-1 AI agent security, safety and reliability standard (certification)](governance.md#aiuc-1) |
| Builds on | — |
| Superseded by | — |
| Decisions | [0170-tracker-and-forge-text-enters-the-prompt-in-an-untrusted-frame-it-cannot-close](../../../../../apps/ploeg/docs/adrs/0170-tracker-and-forge-text-enters-the-prompt-in-an-untrusted-frame-it-cannot-close.md), [0030-target-repository-instructions-rank-below-the-delivery-contract](../../../../../apps/ploeg/docs/adrs/0030-target-repository-instructions-rank-below-the-delivery-contract.md), [adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation](../../../../../docs/adr/adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation.md), [2026-10-02-code-quality-review](../../../../../docs/research/2026-10-02-code-quality-review.md), [2026-09-29-mcp-access](../../../../../docs/research/2026-09-29-mcp-access.md) |
| Watchlist | T21, T30, T34 |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Unfold's own threat model | Unfold workbench | Proposed: write an Unfold threat model that maps entry points found in the 2026-10-02 code review (webhooks, sign-in, editor handoff) to ASI01-ASI10, as Ploeg's threat model already does. | M | Both applications use one risk list. |
| Goal hijack through tracker text | Ploeg prompt framing | Tracker and forge text enter the prompt in an untrusted frame (Ploeg ADR-0170) and repository instructions rank below the delivery contract (Ploeg ADR-0030); cite ASI01 in both. | S | Makes existing controls legible to reviewers. |
| Tool misuse on unfold-mcp | unfold-mcp | The read-first server and person confirmation for actions (system ADR-0011, ADR-0037) address ASI02 and ASI03; proposed: list that mapping in the MCP docs. | S | An Agency sees which risk each control covers. |
| Agent Control Standard at the gateway | Ploeg gateway | Proposed: compare ACS runtime enforcement with the gateway bounds and the decider (system ADR-0042) once ACS has a version. | M | Possible standard shape for runtime enforcement. |
| Agency security annex | Agency contract | Proposed: base the hosted service's security annex on the ten risks with Unfold's control per risk. | S | A familiar structure for Agencies and their Clients. |

**Shipped adoption:** Agentic Top 10 (https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/); LLM Top 10 2026 (https://genai.owasp.org/resource/owasp-genai-llm-top-10-2026/); ACS (https://genai.owasp.org/resource/agent-control-standard-acs/); Q3 2026 exploit roundup mapping (https://genai.owasp.org/2026/10/08/genai-and-agentic-ai-exploit-roundup-q3-2026/)

**Open problems:** ACS has no stated version (https://genai.owasp.org/2026/09/01/owasp-genai-security-project-unveils-2026-top-10-for-llm-applications-new-agent-control-standard-and-sponsors-as-community-tops-30000-members/)

**Watched:** changelog-page `https://genai.owasp.org/resources/`

## Remote ATtestation procedureS (RATS) - RFC 9334 architecture, RFC 9711 EAT, CoRIM, AR4SI { #ietf-rats }

Not to be confused with: Hardware and software attestation evidence and results. Agent identity and inference attestation appear only in individual drafts.

| | |
| --- | --- |
| Steward | IETF RATS WG (sdo) |
| Status | stable |
| Latest | [RFC 9711 EAT (Proposed Standard, April 2025); draft-ietf-rats-corim-12 (2026-11-01) 2026-11-01](https://datatracker.ietf.org/doc/draft-ietf-rats-corim/) |
| Radar | **hold**: Fit decided it: the value needs TEEs or confidential computing that Unfold's clusters lack, and agent attestation exists only in individual drafts. |
| Moves when | The rented EU cluster provider offers confidential VMs or nodes, or an Agency contract requires attested execution. |
| Competes with | — |
| Complements | [Supply Chain Integrity, Transparency, and Trust (SCITT) - RFC 9943 architecture, RFC 9942 COSE Receipts, SCRAPI](security-supply-chain.md#ietf-scitt), [IETF AUDIT (Agent Use of Delegation and Interaction Traceability) BoF](security-supply-chain.md#ietf-audit) |
| Builds on | — |
| Superseded by | — |
| Decisions | [0106-a-run-declares-an-isolation-floor-and-a-cell-runs-it-at-the-strictest-class-it-can-honour](../../../../../apps/ploeg/docs/adrs/0106-a-run-declares-an-isolation-floor-and-a-cell-runs-it-at-the-strictest-class-it-can-honour.md), [adr-0040-unfold-production-runs-on-a-rented-eu-talos-cluster-and-the-homelab-is-staging](../../../../../docs/adr/adr-0040-unfold-production-runs-on-a-rented-eu-talos-cluster-and-the-homelab-is-staging.md), [2026-10-24-sandbox-runtimes-and-encryption](../../../../../docs/research/2026-10-24-sandbox-runtimes-and-encryption.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Attest the sandbox class | Ploeg cells | Proposed: when a cell claims it ran a Run at a given isolation class (Ploeg ADR-0106), back the claim with EAT evidence from a confidential-computing node. | L | Turns an isolation claim in Run evidence into something a third party can verify. |
| Confidential hosted Tenants | hosted Tenant | Proposed: if the rented EU cluster (system ADR-0040) offers confidential VMs, attest the node before scheduling an Agency's Runs on it. | L | A selling point for Agencies whose Clients forbid code on shared hosts. |
| Self-hosted decider model | decider (system ADR-0042) | Proposed: attest the node and model weights that score tool calls, so a tampered decider is detectable. | L | Protects the tripwire from silent replacement. |
| Personal cell attestation | Ploeg personal cell | Proposed: a person's machine acting as a cell (Ploeg ADR-0143) could present attestation before a Run gets a capability. | L | Narrows the trust given to unmanaged laptops. |
| Evidence vocabulary only | Run evidence | Reuse RATS terms (evidence, endorsement, attestation result) in Run evidence docs now, without building attestation. | S | Keeps later adoption cheap. |

**Shipped adoption:** RFC 9334, Jan 2023 (https://www.rfc-editor.org/rfc/rfc9334); RFC 9711, Apr 2025 (https://www.rfc-editor.org/rfc/rfc9711); not verified: no shipped agent-attestation implementation found

**Open problems:** Agent drafts are individual submissions: PTV agent identity (https://datatracker.ietf.org/doc/draft-anandakrishnan-rats-ptv-agent-identity/), Attested Inference Receipt (https://datatracker.ietf.org/doc/draft-tsyrulnikov-rats-attested-inference-receipt/), agent assurance appraisal (https://datatracker.ietf.org/doc/draft-watts-rats-verification-promotion-appraisal/); Value requires TEEs or confidential computing, which the estate lacks

**Watched:** ietf-draft `draft-ietf-rats-corim` at 12, ietf-draft `draft-ietf-rats-ar4si` at 11, ietf-draft `draft-anandakrishnan-rats-ptv-agent-identity` at 01, ietf-draft `draft-tsyrulnikov-rats-attested-inference-receipt` at 02

## SEP-2809: Attested Tool-Server Admission (ATSA) { #mcp-sep-2809-atsa }

Not to be confused with: A proposed Standards Track SEP. A server publishes an offline-signed clearance assertion at a well-known URI, the host verifies it against a pinned trust root, and a per-server tool allow-list follows. It is a proposal, not part of the MCP spec.

| | |
| --- | --- |
| Steward | Model Context Protocol project (foundation) |
| Status | draft |
| Latest | [PR open (created 2026-05-28, last update 2026-09-30) 2026-09-30](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2809) |
| Radar | **hold**: Maturity decided it: the SEP is an open re-submission of a closed PR with no implementation. |
| Moves when | SEP-2809 is accepted into the MCP specification or a client people use verifies clearances. |
| Competes with | — |
| Complements | [MCP Bundle (.mcpb) PKCS#7 signature](security-supply-chain.md#mcpb-signature), [MCP conformance suite (@modelcontextprotocol/conformance)](security-supply-chain.md#mcp-conformance), [CoSAI Model Context Protocol (MCP) Security white paper / threat taxonomy](security-supply-chain.md#cosai-mcp-security) |
| Builds on | — |
| Superseded by | — |
| Decisions | [0078-runs-reach-read-only-mcp-tools-only-through-the-gateway-bounded-by-a-litellm-team](../../../../../apps/ploeg/docs/adrs/0078-runs-reach-read-only-mcp-tools-only-through-the-gateway-bounded-by-a-litellm-team.md), [2026-10-30-mcp-extensions-fit](../../../../../apps/unfold/docs/research/2026-10-30-mcp-extensions-fit.md) |
| Watchlist | T30, T33 |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Clearance assertion for unfold-mcp | unfold-mcp | Proposed: publish an offline-signed clearance at the well-known URI of the hosted unfold-mcp, signed with the OpenBao release key. | M | Hosts can admit Unfold's server only when its tool list matches what was cleared. |
| Admit tool servers for Runs | Ploeg gateway | Proposed: the gateway that bounds Runs to read-only MCP tools (Ploeg ADR-0078) could require an ATSA clearance before adding a server to a Team's access group. | M | A pinned trust root stops a changed server from gaining tools silently. |
| Pairs with a Server Card | hosted Tenant | Proposed: serve clearance next to the Server Card and ai-catalog of watchlist T33 once a hosted endpoint exists. | S | One discovery story for hosted Tenants. |
| Agency device policy | Agency contract | Proposed: an Agency could require clearance for every MCP server its people connect to Unfold work. | S | A concrete control against tool poisoning. |
| Comment with the Run case | Ploeg gateway | Proposed: comment on the SEP with the per-Run allow-list need, since the proposal is a re-submission and still open. | S | Shapes the proposal toward agent dispatch planes. |

**Shipped adoption:** none: no shipped implementation found

**Open problems:** Re-submission of a closed PR (#2777); not accepted (https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2809)

**Watched:** changelog-page `https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2809`

## SLSA (Supply-chain Levels for Software Artifacts) applied to ML models { #slsa-models }

Not to be confused with: SLSA v1.2 is the general framework. ML-specific provenance is only an OpenSSF SIG effort (Model Lifecycle Provenance), not part of the SLSA spec.

| | |
| --- | --- |
| Steward | OpenSSF SLSA project; OpenSSF AI/ML WG SIG (foundation) |
| Status | draft |
| Latest | [SLSA v1.2 (ML profile: none) 2025-11-24](https://github.com/slsa-framework/slsa/tree/v1.2) |
| Radar | **hold**: Maturity decided it: SLSA v1.2 is stable and already used for builds, but no ratified ML provenance profile exists. |
| Moves when | The OpenSSF Model Lifecycle Provenance SIG publishes a ratified profile, or Unfold trains or fine-tunes a model. |
| Competes with | — |
| Complements | [OpenSSF Model Signing (OMS) specification and sigstore/model-transparency (model_signing)](security-supply-chain.md#openssf-model-signing), [CycloneDX (ECMA-424) ML-BOM / AI-BOM - modelCard, data components, formulation](security-supply-chain.md#cyclonedx-mlbom), [Supply Chain Integrity, Transparency, and Trust (SCITT) - RFC 9943 architecture, RFC 9942 COSE Receipts, SCRAPI](security-supply-chain.md#ietf-scitt) |
| Builds on | — |
| Superseded by | — |
| Decisions | [0014-signed-candidates](../../../../../apps/unfold/docs/adrs/0014-signed-candidates.md), [0144-every-published-image-is-built-on-a-base-that-scans-clean-and-pulls-without-credentials](../../../../../apps/ploeg/docs/adrs/0144-every-published-image-is-built-on-a-base-that-scans-clean-and-pulls-without-credentials.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Raise the VSIX above Build Level 2 | release pipeline | docs/operations/release.md states the VSIX provenance is SLSA Build Level 2 at most; proposed: reach Level 3 with a separate, hardened builder that signs the provenance itself. | L | Provenance a compromised release job cannot forge. |
| Provenance for candidates | Run evidence | Signed candidates (Unfold ADR-0014) already use in-toto; proposed: align the predicate with SLSA v1.2 field names so standard verifiers can read part of it. | M | Reviewers can use generic tools on agent-made changes. |
| Model provenance for the decider | decider (system ADR-0042) | Proposed: if the decider is fine-tuned, record its training run as provenance once an ML profile exists. | M | Traceable model lineage. |
| Verification in CI of Agencies | Agency contract | Proposed: document how an Agency's CI checks the provenance of an Unfold-made change before merge. | S | Gives Agencies a concrete control to cite. |
| Wait for the ML SIG | release pipeline | Do not invent an ML provenance profile; reuse SLSA v1.2 for builds and wait for the SIG's profile for models. | S | Avoids a private format. |

**Shipped adoption:** SLSA v1.2 spec (https://slsa.dev/spec/v1.2/); SIG proposal built on Intel atlas-cli (https://github.com/ossf/ai-ml-security/issues/40); SIG launch March 2026 [secondary] (https://fossforce.com/2026/03/openssf-welcomes-new-members-as-slsa-gemara-and-ai-security-efforts-mature/)

**Open problems:** No ratified ML provenance profile; the SIG's Q1/Q2 2026 milestones are unverified (https://github.com/ossf/ai-ml-security/issues/40)

**Watched:** github-tags `slsa-framework/slsa` at v2021-04-21, changelog-page `https://github.com/ossf/ai-ml-security/issues/40`

## SPDX 3.0 AI and Dataset profiles { #spdx3-ai-dataset }

Not to be confused with: The Linux Foundation SPDX 3 model with AIPackage and DatasetPackage classes. It is not SPDX 2.x.

| | |
| --- | --- |
| Steward | SPDX project (Linux Foundation) (foundation) |
| Status | stable |
| Latest | [3.0.1 (stable); 3.1-rc1 (2026-01-24) 2024-12-12](https://github.com/spdx/spdx-3-model/releases/tag/3.0.1) |
| Radar | **hold**: Maturity decided it: 3.1 has sat at rc1 for nine months and no common consumer ingests SPDX 3. |
| Moves when | SPDX 3.1 reaches GA and syft or BuildKit emits SPDX 3 by default. |
| Competes with | [CycloneDX (ECMA-424) ML-BOM / AI-BOM - modelCard, data components, formulation](security-supply-chain.md#cyclonedx-mlbom) |
| Complements | [OWASP GenAI Security Project AIBOM Initiative and AIBOM Generator](security-supply-chain.md#owasp-aibom) |
| Builds on | — |
| Superseded by | — |
| Decisions | [0144-every-published-image-is-built-on-a-base-that-scans-clean-and-pulls-without-credentials](../../../../../apps/ploeg/docs/adrs/0144-every-published-image-is-built-on-a-base-that-scans-clean-and-pulls-without-credentials.md), [adr-0034-agent-knowledge-is-scoped-to-tenant-client-repository-and-work-item-in-two-graphs-per-tenant](../../../../../docs/adr/adr-0034-agent-knowledge-is-scoped-to-tenant-client-repository-and-work-item-in-two-graphs-per-tenant.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Upgrade path for BuildKit SBOMs | release pipeline | BuildKit attaches SPDX SBOMs to Ploeg's images (apps/ploeg/docs/ops/verify-a-release.md); proposed: move to SPDX 3 only when syft and BuildKit emit it by default. | S | No hand-rolled conversion work. |
| Dataset profile for the knowledge base | Tenant knowledge base | Proposed: describe a Tenant's knowledge graphs (Ploeg ADR-0087, system ADR-0034) as DatasetPackages if an Agency must document data used to brief agents. | M | A standard way to say what data an agent was given. |
| Regulation class for AI Act mapping | Agency contract | Proposed: the 3.1 Regulation class and conformsTo relation could tie a release to the AI Act articles it addresses, once 3.1 is final. | M | Machine-readable compliance claims. |
| AIPackage for the decider | decider (system ADR-0042) | Proposed: describe a self-hosted decider model as an AIPackage if the estate standardises on SPDX rather than CycloneDX. | S | Keeps one SBOM family if the choice falls that way. |
| Pick one format | release pipeline | Record a single choice between SPDX 3 and CycloneDX for AI components before generating either, since Dependency-Track ingests no SPDX 3. | S | Prevents parallel BOM pipelines. |

**Shipped adoption:** Spec (https://spdx.github.io/spdx-spec/v3.0.1/); 3.1-rc1 adds a Regulation class and conformsTo relationship (https://github.com/spdx/spdx-3-model/releases/tag/3.1-rc1)

**Open problems:** 3.1 GA has not shipped 9 months after rc1 (https://github.com/spdx/spdx-3-model/releases); absence: no Dependency-Track ingestion of SPDX 3 found

**Watched:** github-releases `spdx/spdx-3-model` at 3.0.1

## Supply Chain Integrity, Transparency, and Trust (SCITT) - RFC 9943 architecture, RFC 9942 COSE Receipts, SCRAPI { #ietf-scitt }

Not to be confused with: An append-only transparency service for signed statements with COSE Receipts. Agent-action use is only in individual drafts; no WG-adopted agent profile exists.

| | |
| --- | --- |
| Steward | IETF SCITT WG (active) (sdo) |
| Status | stable |
| Latest | [RFC 9943 (Proposed Standard, June 2026); draft-ietf-scitt-scrapi-11 in RFC Editor queue 2026-06-30](https://www.rfc-editor.org/rfc/rfc9943) |
| Radar | **assess**: Maturity of the agent use decided it: the architecture and receipts are RFCs, but SCRAPI is not yet an RFC, no agent profile is adopted, and the open-source emulator is archived. |
| Moves when | SCRAPI is published as an RFC and a maintained open-source transparency service other than a single vendor's ledger ships a release. |
| Competes with | — |
| Complements | [IETF AUDIT (Agent Use of Delegation and Interaction Traceability) BoF](security-supply-chain.md#ietf-audit), [Remote ATtestation procedureS (RATS) - RFC 9334 architecture, RFC 9711 EAT, CoRIM, AR4SI](security-supply-chain.md#ietf-rats), [OpenTelemetry Semantic Conventions for Generative AI (client, agent, MCP, A2A, provider-specific)](observability.md#otel-genai-semconv), [OpenSSF Model Signing (OMS) specification and sigstore/model-transparency (model_signing)](security-supply-chain.md#openssf-model-signing), [CycloneDX (ECMA-424) ML-BOM / AI-BOM - modelCard, data components, formulation](security-supply-chain.md#cyclonedx-mlbom) |
| Builds on | — |
| Superseded by | — |
| Decisions | [0061-unfold-signs-the-audit-chain-head-with-openbao-transit-and-copies-it-to-a-locked-bucket-daily](../../../../../apps/unfold/docs/adrs/0061-unfold-signs-the-audit-chain-head-with-openbao-transit-and-copies-it-to-a-locked-bucket-daily.md), [0014-signed-candidates](../../../../../apps/unfold/docs/adrs/0014-signed-candidates.md), [0057-a-delivery-brief-is-one-evidence-backed-record-rendered-per-audience](../../../../../apps/unfold/docs/adrs/0057-a-delivery-brief-is-one-evidence-backed-record-rendered-per-audience.md) |
| Watchlist | T14 |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Register the audit chain head | Unfold audit chain | Proposed: besides the daily locked-bucket copy and Transit signature of Unfold ADR-0061, submit the signed chain head as a SCITT signed statement and keep the COSE Receipt. | M | A third party can prove the head existed at that time, which a bucket the operator controls cannot. |
| Receipts for signed candidates | Run evidence | Proposed: register the in-toto envelope of each Delivery Candidate (Unfold ADR-0014) and attach the receipt to the Delivery Brief (Unfold ADR-0057). | M | A reviewer or Client can check that the evidence was not swapped after the fact. |
| Release transparency without Rekor | release pipeline | Proposed: the VSIX is signed with an OpenBao key and never uploaded to Rekor (docs/operations/release.md); a SCITT service run by the owner could log those signatures instead. | L | Gives key-signed releases a public log while keeping the key in OpenBao. |
| Tenant export with receipts | hosted Tenant | Proposed: include receipts in the Tenant export archive (Ploeg ADR-0179) so an Agency leaving the hosted service keeps verifiable evidence. | S | Supports the no-lock-in promise of system ADR-0050. |
| Agent profile watch | Run evidence | Track the competing individual agent-execution drafts and adopt none until the working group adopts one, because a private profile would not be readable by anyone else. | S | Avoids building on a profile that loses. |

**Shipped adoption:** RFC 9942 COSE Receipts, June 2026 (https://www.rfc-editor.org/rfc/rfc9942); microsoft/scitt-ccf-ledger 0.21.0, 2026-10-27 (https://github.com/microsoft/scitt-ccf-ledger/releases/tag/0.21.0)

**Open problems:** About 15 competing individual agent profiles, none WG-adopted, e.g. draft-emirdag-scitt-ai-agent-execution-01 (https://datatracker.ietf.org/doc/draft-emirdag-scitt-ai-agent-execution/), draft-noa-scitt-ai-agent-receipt-01 (https://datatracker.ietf.org/doc/draft-noa-scitt-ai-agent-receipt/), draft-thaha-scitt-agent-execution-evidence-02 (https://datatracker.ietf.org/doc/draft-thaha-scitt-agent-execution-evidence/), draft-dawkins-scitt-ai-article50-00 (https://datatracker.ietf.org/doc/draft-dawkins-scitt-ai-article50/); The community emulator is archived (https://github.com/scitt-community/scitt-api-emulator) and DataTrails samples are dormant since 2024-12 (https://github.com/datatrails/datatrails-scitt-samples); SCRAPI is not yet an RFC (https://datatracker.ietf.org/doc/draft-ietf-scitt-scrapi/)

**Watched:** ietf-draft `draft-ietf-scitt-scrapi` at 11, ietf-draft `draft-emirdag-scitt-ai-agent-execution` at 01, ietf-draft `draft-mih-scitt-agent-action-capsule` at 05, ietf-draft `draft-palanisamy-scitt-aac-otel` at 00, github-releases `microsoft/scitt-ccf-ledger` at 0.21.0
