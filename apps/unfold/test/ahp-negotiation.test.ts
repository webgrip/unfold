import test from 'node:test';
import assert from 'node:assert/strict';
import { MalformedVersion, negotiateProtocolVersion } from '../src/ahp/host.ts';

test('the host selects the highest offered 0.9.x and answers that exact string, whatever the offer order', () => {
  const cases: Array<[string[], string | undefined]> = [
    [[], undefined],
    [['0.9.0'], '0.9.0'],
    [['0.9.1'], '0.9.1'],
    [['0.9.0', '0.9.4'], '0.9.4'],
    [['0.9.4', '0.9.0'], '0.9.4'],
    [['0.9.8', '0.9.10'], '0.9.10'],
    [['0.9.10', '0.9.9'], '0.9.10'],
    [['0.9.2', '0.9.2'], '0.9.2'],
    [['0.9.0', '1.0.0'], '0.9.0'],
    [['1.0.0', '0.10.0', '0.9.0'], '0.9.0'],
    [['0.10.0', '0.9.0', '0.7.0', '0.6.0', '0.5.2', '0.5.1'], '0.9.0'],
    [['2.0.0', '0.10.0', '0.9.1'], '0.9.1'],
    [['2.0.0', '0.10.0', '0.8.99'], undefined],
    [['1.0.0'], undefined],
    [['1.4.0', '1.10.0'], undefined],
    [['0.10.0'], undefined],
    [['0.8.0', '0.5.2'], undefined],
    [['0.9.99999999999999999999', '0.9.100'], '0.9.99999999999999999999'],
  ];
  for (const [offered, expected] of cases) assert.equal(negotiateProtocolVersion(offered), expected, JSON.stringify(offered));
});

test('a malformed offered version is an error even when another entry would match', () => {
  const malformed: unknown[][] = [
    ['0.9'], ['0.9.0.0'], ['00.9.0'], ['0.09.0'], ['0.9.01'], ['0.9.0-beta'], ['0.9.0+build'], [' 0.9.0'], ['0.9.0\n'], ['0.-1.0'], ['v0.9.0'], [''],
    ['0.9.0', 'invalid'], ['invalid', '0.9.0'], [9], [null], [{ version: '0.9.0' }],
  ];
  for (const offered of malformed) assert.throws(() => negotiateProtocolVersion(offered), MalformedVersion, JSON.stringify(offered));
});
