// The CommonJS build works and gives the same answers as the ESM build.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const main = require('../dist/cjs/index.js');
const node = require('../dist/cjs/node.js');

test('CommonJS entry points load and check', () => {
  assert.equal(typeof main.createSafetyEngine, 'function');
  const engine = main.createSafetyEngine(node.loadDefaultData());
  const result = engine.check({ drugs: [{ name: 'Ibuprofen' }], currentMeds: [{ name: 'Warfarin' }] });
  assert.equal(result.alerts[0].rule_id, 'ix:21f99a854b309b8b');
  assert.equal(node.searchIcd10('A00.9', 1)[0].code, 'A00.9');
  assert.equal(node.searchProcedures('LP', 1)[0].code, node.getProcedure('PRC-MED-001').code);
});

test('the main entry point has no Node-only imports (safe for browsers and React Native)', () => {
  const files = ['index.js', 'engine.js', 'search.js', 'name.js', 'text.js', 'genericIndex.js', 'allergyGroups.js'];
  for (const dir of ['esm', 'cjs']) {
    for (const file of files) {
      const source = fs.readFileSync(path.join(__dirname, '..', 'dist', dir, file), 'utf8');
      assert.ok(!/node:|require\(['"](fs|path)['"]\)|from ['"](fs|path)['"]/.test(source), `${dir}/${file}`);
    }
  }
});
