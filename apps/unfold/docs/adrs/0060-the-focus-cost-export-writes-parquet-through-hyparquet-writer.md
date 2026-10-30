---
status: accepted
date: 2026-10-30
decision-makers: Ryan Grippeling
review-by: 2027-04-30
---

# The FOCUS cost export writes Parquet through `hyparquet-writer`

## Context and Problem Statement

The [FOCUS cost export](../operations/focus-cost-export.md) writes model cost as CSV or JSON Lines. FinOps tools and data lakes read Parquet natively, and [system ADR-0050](../../../../docs/adr/adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in.md) names Parquet for large tables. Node 24 has no Parquet writer. On 2026-10-30 the owner decided to offer Parquet now, behind an option on the existing route (VIK-2524). [ADR 0036](0036-the-agent-host-speaks-websocket-through-ws.md) made `ws` the one runtime dependency and asks for a decision for each further one. Which Parquet writer, if any, should Unfold run?

## Decision Drivers

* The file must have the CSV's columns, and keep FOCUS's types: exact decimals, UTC date-times, text.
* Pure JavaScript, no native add-on and no install script, so `npm ci --omit=dev --ignore-scripts` still builds the image.
* A licence on the `npm run license:check` list, and few transitive packages: every one becomes image surface under the zero-finding budget ([ADR 0010](0010-one-release-train-with-zero-cve-images.md)).
* An exact pin Renovate can update.

## Considered Options

* `hyparquet-writer`
* `parquet-wasm`
* `@dsnp/parquetjs`
* A Parquet writer of Unfold's own
* No Parquet; convert the CSV with DuckDB

## Decision Outcome

Chosen option: "`hyparquet-writer`", decided by the owner on 2026-10-30 (VIK-2524). It is MIT-licensed pure JavaScript, about 250 kB unpacked, by Hyperparam, actively maintained (releases on 2026-10-13, 2026-10-19, 2026-10-20 and 2026-10-29), and has one dependency, its companion reader `hyparquet` (MIT, about 300 kB, no dependencies of its own), pinned exactly.

1. **Pin.** `package.json` pins `hyparquet-writer` to an exact version under `dependencies`: 0.17.0, which brings `hyparquet` 1.31.5. 0.17.0 was ten days old when it was chosen; 0.18.0, a day old, was left for Renovate to propose. `hyparquet` 1.31.5 is also a pinned devDependency, for the tests that read the files back.
2. **Policy.** `npm run check` maps `hyparquet-writer` to this ADR in `decidedRuntimeDependencies`, so `src/` may import it. Only `src/focus-export.ts` does.
3. **Licence.** `NOTICE` names `hyparquet-writer` and `hyparquet` with their versions; `npm run license:check` checks the direct dependency's licence, `LICENSE` file and `NOTICE` line.
4. **Format.** `format=parquet` on `GET /api/ploeg/cost-export` answers `application/vnd.apache.parquet`. Every column is optional. A FOCUS Decimal column is `DECIMAL(38,10)` in a 16-byte fixed-length array, written from the decimal's text so no digit passes through a float; a Date/Time column is a UTC `TIMESTAMP` in milliseconds; every other column, `Tags` included, is UTF-8 text. Pages are Snappy-compressed. The file's key-value metadata carries `FocusVersion`.

### Consequences

* Good, because a FinOps tool, DuckDB, Spark or pandas loads the file without a conversion step, with numeric and timestamp columns typed.
* Good, because the writer is the only code that changed: the rows, columns, filters and headers are the CSV's.
* Bad, because the image now carries two more npm packages. A vulnerability in either becomes an Unfold image finding until Renovate's update lands.
* Bad, because `hyparquet-writer` is pre-1.0 and releases often; a minor release may change its API. Renovate's update has to pass the round-trip tests.

### Confirmation

In `apps/unfold`:

* `mise exec -- npm test`: [`test/focus-export.test.ts`](../../test/focus-export.test.ts) writes each export as Parquet, reads it back with `hyparquet`, and requires the CSV's columns and cells, the column types above, decimals beyond a float's precision kept exactly, an empty file with every column, and the route's media type and file name.
* `mise exec -- npm run check` and `npm run license:check` enforce the dependency policy.
* By hand on 2026-10-30, not in CI: pyarrow and DuckDB read a written file as `decimal128(38, 10)`, `timestamp[ms, tz=UTC]` and `string` columns with the same values.

Re-evaluate when Node ships a Parquet writer, when `hyparquet-writer` stops being maintained, or when another export needs Parquet.

## Pros and Cons of the Options

### `parquet-wasm`

* Good, because it wraps the Rust `parquet` crate, the reference implementation's sibling.
* Bad, because it is about 16 MB unpacked, mostly WebAssembly, and writes from Apache Arrow IPC data, so Unfold would also need Arrow to build that data from rows.

### `@dsnp/parquetjs`

* Bad, because it brings thirteen dependencies, among them the AWS S3 client, `thrift` and two WebAssembly modules.

### A Parquet writer of Unfold's own

* Good, because the production dependency set would stay `ws`.
* Bad, because the Thrift footer, page headers and encodings are new code that only Unfold runs, the trade-off ADR 0036 already declined for WebSocket framing.

### No Parquet; convert the CSV with DuckDB

* Good, because it adds nothing.
* Bad, because every reader needs a conversion step, which the owner decided against.

## More Information

* Ticket: VIK-2524.
* Amends [ADR 0036](0036-the-agent-host-speaks-websocket-through-ws.md): `ws` is no longer the one runtime dependency. Also amends the Confirmation of [system ADR-0026](../../../../docs/adr/adr-0026-unfold-is-an-installable-web-app-that-notifies-from-the-server.md).
