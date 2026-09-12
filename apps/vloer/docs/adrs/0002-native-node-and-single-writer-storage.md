# 0002 — Native Node and one durable writer

Date: 2026-09-09. Status: accepted for v0.1.

## Context

The first useful demonstration should start from a checkout with a known runtime and no registry dependency resolution. The application is a small HTTP and event service with a browser surface. Ploeg's Go implementation does not require every neighboring operator tool to use Go. The reviewed Webgrip repositories use several web stacks; none establishes a universal frontend framework mandate. See [repository research](../research/conventions-and-alternatives.md).

## Decision

Use Node 24, native erasable TypeScript and browser ES modules. Use built-in HTTP, process, crypto, test and SQLite APIs. The production npm dependency set is empty. Pin the development runtime in `mise.toml` and CI. Startup performs no dependency installation or frontend compilation.

Native type stripping does not type-check and ignores `tsconfig.json` transformations. Source imports include extensions and use `import type` for types. Enums, parameter properties, decorators requiring transformation and TSX are outside the chosen source subset. The [Node documentation](https://nodejs.org/api/typescript.html) explains this distinction. `npm run check` strips types and checks resulting module syntax without executing application entrypoints. Behavioral tests remain a separate gate.

Use SQLite with one server process and one application replica. Persist the database and its associated files on a volume. The application owns session transitions, login records and ordered event history. This keeps the demo and first private deployment small and deterministic.

## Alternatives considered

Go would align with Ploeg and produce a single executable, but adds a separate browser toolchain if the UI adopts a framework. A framework plus npm dependencies would provide routing and UI abstractions, but is unnecessary for the initial operator surface. PostgreSQL would support a future distributed control plane, but adding it now does not create correct distributed lifecycle ownership by itself.

## Consequences and reconsideration

The development toolchain pins TypeScript and Node types for a separate strict type-checking gate. `npm ci` is required for that gate, while starting the demo needs only Node. Source syntax checks and runtime tests provide different evidence and remain separate checks.

SQLite durability is not high availability. Do not run multiple replicas against a shared file or use a Kubernetes rollout that briefly creates two application writers. Back up and restore the database as a coherent SQLite snapshot, and retain workspace evidence separately.

Reconsider PostgreSQL and distributed coordination together when a measured workload requires multiple control-plane writers, or an availability objective cannot tolerate one server. Reconsider a UI framework when repeated interaction complexity exceeds the maintenance cost of the current native modules. Record evidence rather than choosing infrastructure solely for anticipated scale.
