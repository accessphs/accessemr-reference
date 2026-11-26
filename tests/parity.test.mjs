// PARITY: the TypeScript engine must give exactly what AccessEMR's Ruby Medkb::SafetyCheck gives.
// tests/parity/expected.json was produced by tools/parity/parity.rb against the real engine and data.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { defaultEngine } from '../dist/esm/node.js';

const read = (file) => JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
const cases = read('./parity/cases.json');
const expected = read('./parity/expected.json');
const engine = defaultEngine();
const key = (item) => ({
  rule_id: item.rule_id,
  kind: item.kind,
  level: item.level,
  severity: item.severity,
  drug: item.drug,
  other: item.other,
});

test('expected.json covers every case', () => {
  assert.ok(cases.length >= 30, `${cases.length} cases`);
  assert.deepEqual(Object.keys(expected.cases).sort(), cases.map((c) => c.id).sort());
});

for (const testCase of cases) {
  test(`parity: ${testCase.id} (${testCase.description})`, () => {
    const actual = engine.check(testCase);
    const want = expected.cases[testCase.id];
    assert.deepEqual(actual.alerts.map(key), want.alerts.map(key), 'alerts (rule_id, kind, level, severity, drug, other)');
    assert.deepEqual(actual.notices.map(key), want.notices.map(key), 'notices (rule_id, kind, level, severity, drug, other)');
    // Full items too: effect, action and evidence must match as well.
    assert.deepEqual(actual, { alerts: want.alerts, notices: want.notices });
  });
}
