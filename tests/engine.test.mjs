import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  createSafetyEngine,
  createSearch,
  normalise,
  isCombination,
  withoutSalt,
  parseCsv,
  parseIcd10Csv,
} from '../dist/esm/index.js';
import {
  defaultEngine,
  loadDefaultData,
  loadIcd10,
  loadDataVersion,
  searchDrugs,
  searchIcd10,
} from '../dist/esm/node.js';

const data = loadDefaultData();
const engine = defaultEngine();
const ids = (result) => [...result.alerts, ...result.notices].map((item) => item.rule_id);

test('normalise drops strengths, form words and brackets', () => {
  assert.equal(normalise('Amoxicillin 500mg Capsule'), 'amoxicillin');
  assert.equal(normalise('Paracetamol (Panadol) 250mg/5ml Syrup'), 'paracetamol');
  assert.equal(normalise('Co-Trimoxazole_960'), 'co trimoxazole 960');
  assert.equal(withoutSalt('metformin hydrochloride'), 'metformin');
  assert.ok(isCombination('Artemether/Lumefantrine'));
  assert.ok(isCombination('Sulfamethoxazole and Trimethoprim'));
  assert.ok(!isCombination('Amoxicillin'));
});

test('resolve: exact, salt, brand via drugs.csv, combinations, strength text', () => {
  assert.deepEqual(engine.resolve('Warfarin'), ['g:warfarin']);
  assert.deepEqual(engine.resolve('Metformin Hydrochloride 500mg Tablet'), ['g:metformin']);
  assert.deepEqual(engine.resolve('Amatem Forte'), ['g:artemether', 'g:lumefantrine']);
  assert.deepEqual(engine.resolve('Artemether/Lumefantrine'), ['g:artemether', 'g:lumefantrine']);
  assert.deepEqual(engine.resolve('Coartem', 'artemether 20mg / lumefantrine 120mg'), [
    'g:artemether',
    'g:lumefantrine',
  ]);
  assert.deepEqual(engine.resolve('Mystery tonic'), []);
  assert.deepEqual(engine.resolve(''), []);
});

test('check returns empty lists for no drugs or unknown drugs', () => {
  assert.deepEqual(engine.check({ drugs: [] }), { alerts: [], notices: [] });
  assert.deepEqual(engine.check({ drugs: [{ name: 'Mystery tonic' }], currentMeds: [{ name: 'Warfarin' }] }), {
    alerts: [],
    notices: [],
  });
});

test('items follow contract C2', () => {
  const { alerts } = engine.check({ drugs: [{ name: 'Ibuprofen' }], currentMeds: [{ name: 'Warfarin' }] });
  assert.equal(alerts.length, 1);
  const item = alerts[0];
  assert.deepEqual(Object.keys(item), [
    'rule_id', 'kind', 'severity', 'level', 'drug', 'other', 'effect', 'action', 'evidence',
  ]);
  assert.deepEqual(Object.keys(item.evidence), ['quote', 'source', 'set_id', 'section']);
  assert.equal(item.evidence.source, 'FDA label');
  assert.match(item.rule_id, /^ix:/);
});

test('pregnancy only when pregnant is true', () => {
  assert.deepEqual(ids(engine.check({ drugs: [{ name: 'Misoprostol' }] })), []);
  assert.deepEqual(ids(engine.check({ drugs: [{ name: 'Misoprostol' }], pregnant: true })), ['pg:g:misoprostol']);
});

test('allergy category: missing or "drug" (any case) is checked, others ignored', () => {
  const run = (category) =>
    ids(engine.check({ drugs: [{ name: 'Amoxicillin' }], allergies: [{ allergen: 'Penicillin', category }] }));
  assert.deepEqual(run(undefined), ['ag:penicillins']);
  assert.deepEqual(run('drug'), ['ag:penicillins']);
  assert.deepEqual(run('Drug'), ['ag:penicillins']);
  assert.deepEqual(run('Food'), []);
});

test('accepts rules as the whole file or just the array; does not mutate input', () => {
  const before = JSON.stringify(data.allergyGroups);
  const other = createSafetyEngine({ ...data, rules: data.rules.rules });
  const input = {
    drugs: [{ name: 'Rifampicin' }],
    currentMeds: [{ name: 'Amatem Forte' }],
    allergies: [{ allergen: 'PCN' }],
  };
  assert.deepEqual(other.check(input), engine.check(input));
  assert.equal(JSON.stringify(data.allergyGroups), before);
});

test('createSafetyEngine rejects incomplete data', () => {
  assert.throws(() => createSafetyEngine({ generics: [] }), /must include/);
});

test('info reports data versions', () => {
  assert.equal(engine.info.rules, data.rules.rules.length);
  assert.equal(engine.info.generics, data.generics.length);
  assert.equal(engine.info.kbVersion, data.rules.kb_version);
});

test('searchIcd10 by code (with or without dot) and by title words', () => {
  assert.equal(searchIcd10('A00.9', 1)[0].code, 'A00.9');
  assert.equal(searchIcd10('a009', 1)[0].code, 'A00.9');
  assert.ok(searchIcd10('J45', 5).every((r) => r.code.startsWith('J45')));
  const malaria = searchIcd10('malaria', 50);
  assert.ok(malaria.length > 5 && malaria.every((r) => /malaria/i.test(`${r.title} ${r.definition}`)));
  assert.ok(searchIcd10('typhoid fever', 3).some((r) => r.code === 'A01.0'));
  assert.deepEqual(searchIcd10('', 5), []);
  assert.equal(searchIcd10('fever', 7).length, 7);
});

test('searchDrugs matches names and brand aliases, one result per name + form', () => {
  const amatem = searchDrugs('amatem', 10);
  assert.ok(amatem.length > 0 && amatem.every((r) => r.name === 'Artemether + Lumefantrine'));
  const paracetamol = searchDrugs('paracetamol', 10);
  assert.equal(paracetamol[0].name, 'Paracetamol');
  const keys = paracetamol.map((r) => `${r.name}|${r.form}`);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(searchDrugs('PARA', 5).length > 0);
  assert.deepEqual(engine.searchDrugs('amatem', 10), amatem);
});

test('createSearch works on plain arrays (browser / React Native)', () => {
  const search = createSearch({ icd10: loadIcd10(), drugs: data.drugs });
  assert.equal(search.searchIcd10('I10', 1)[0].code, 'I10');
  assert.equal(search.searchDrugs('warfarin', 1)[0].name, 'Warfarin');
});

test('parseCsv and parseIcd10Csv handle quotes and the bundled CSV', () => {
  assert.deepEqual(parseCsv('a,"b, c","d ""e"""\n1,2,3\n'), [
    ['a', 'b, c', 'd "e"'],
    ['1', '2', '3'],
  ]);
  const csv = readFileSync(new URL('../data/icd10/icd10_codes.csv', import.meta.url), 'utf8');
  assert.deepEqual(parseIcd10Csv(csv), loadIcd10());
});

test('data/version.json counts match the files', () => {
  const version = loadDataVersion();
  const count = (file) => version.datasets.find((d) => d.file === file).records;
  assert.equal(count('icd10/icd10_codes.csv'), loadIcd10().length);
  assert.equal(count('medications/drugs.json'), data.drugs.length);
  assert.equal(count('medications/generics.json'), data.generics.length);
  assert.equal(count('safety/rules.json'), data.rules.rules.length);
  assert.equal(count('safety/classes.json'), data.classes.length);
  assert.equal(count('safety/allergy_groups.json'), data.allergyGroups.groups.length);
  assert.ok(!version.datasets.some((d) => /review_log/.test(d.file)));
});
