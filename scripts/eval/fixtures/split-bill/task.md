# Split a bill without losing cents

`splitCents(1000, 3)` returns `[333, 333, 333]`, so one cent of the bill disappears.

Acceptance conditions:

- The shares always add up to the total.
- Shares differ by at most one cent, and the first people pay the extra cents.
- Invalid input is still rejected with a `TypeError`.
- Do not change the tests.
