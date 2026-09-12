# 0003 — Keep harness, workspace and credential seams distinct

Date: 2026-09-09. Status: accepted for v0.1.

## Context

A model API, an agent harness, a remote sandbox and an operator protocol solve different problems. Choosing an open-source harness does not make its conversations portable. Routing through LiteLLM does not schedule processes or grant a provider subscription's entitlements to another client.

Ploeg's [LiteLLM decision](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/development/docs/adrs/0008-litellm-is-the-credential-and-metering-seam.md) provides a useful spending boundary. The [OpenCode server API](https://opencode.ai/docs/server/) exposes native sessions and permission handling. These are separate integration surfaces.

## Decision

Use the `AgentRuntime` interface for prepare, execute, interrupt, dispose and supported human responses. Keep workspace provisioning and the LiteLLM broker separate. Supply OpenCode through its native server API and a command adapter through a small JSON-lines process contract. A command runner is an extension point, not a claim of implementing ACP or A2A.

Each adapter reports actual capability and evidence. Native session state remains opaque. Portable handoffs use repository changes, summaries, tests and constraints. Do not imply that switching adapters resumes the same reasoning trace.

The broker mints a scoped inference key, observes available spend, updates explicit authorization and revokes credentials. Workers never receive the minting credential. LiteLLM is a configurable model gateway; its routing must preserve the requested model's tool and output requirements. [Virtual-key documentation](https://docs.litellm.ai/docs/proxy/virtual_keys) describes model restrictions, expiry and spend tracking; it does not establish zero-overshoot settlement for this deployment.

## Consequences and reconsideration

There is adapter-specific code and a live qualification burden. Mock tests prove protocol handling against the captured contract, not compatibility with every future upstream release. Pin tested harness images and repeat a small live contract check before upgrading them.

Subscription authentication is outside the shared managed pool in v0.1. An upstream-supported personal subscription flow, if later added, must have its own visible identity, quota and accounting semantics. Do not present estimated provider list prices as actual subscription charges or share one person's login across operators.

Reconsider a common ACP transport when at least two required harnesses can support the needed durable sessions, permissions, cancellation and remote transport without losing useful semantics. MCP may expose tools; it does not replace lifecycle ownership. Reconsider A2A only for a concrete cross-system delegation client.
