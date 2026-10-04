# Fix checkout rounding

`moneyToCents(1.005)` returns 100 instead of 101, so checkout totals come out a cent short.

Acceptance conditions:

- Prices convert to whole cents with half a cent rounded up, as the tests in `test/order.test.js` describe.
- Invalid input is still rejected with a `TypeError`.
- Do not change the tests.
