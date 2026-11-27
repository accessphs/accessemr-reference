#!/usr/bin/env node
// Regenerates data/ from an AccessEMR core checkout and the ICD-10 CSV export.
//
//   node scripts/build-data.mjs --core <path to access-emr-core> [--icd source/icd10_codes.csv] [--out data]
//                               [--date YYYY-MM-DD] [--check]
//
// - CSV and JSON files that need no conversion are copied byte for byte.
// - drugs.json and icd10_codes.json are generated from their CSVs (one record per line).
// - YAML files (labkb/common.yml, medkb/safety/allergy_groups.yml, procedures/*.yml) are converted by scripts/yaml2json.rb
//   (needs `ruby` on PATH; Ruby's standard library has a YAML parser, so no npm dependency is needed).
// - data/version.json records the source commit, record counts and a SHA-256 per file. Its build_date and
//   data_version only change when some file's content changes (or with --date), so a re-run on the same
//   sources reproduces every committed file exactly.
// - --check builds into a temporary folder and exits 1 if anything differs from --out (nothing is written).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function parseArgs(argv) {
  const args = { icd: path.join(root, 'source/icd10_codes.csv'), out: path.join(root, 'data'), check: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--check') args.check = true;
    else if (['--core', '--icd', '--out', '--date'].includes(arg)) args[arg.slice(2)] = argv[(i += 1)];
    else throw new Error(`unknown argument ${arg}`);
  }
  if (!args.core) throw new Error('--core <path to the AccessEMR core repo> is required');
  return args;
}

// RFC 4180 CSV parser (quoted fields, "" escapes, embedded newlines). Returns an array of rows (arrays).
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function csvObjects(text) {
  const [header, ...rows] = parseCsv(text.replace(/^﻿/, ''));
  return rows.filter((r) => r.length > 1 || r[0] !== '').map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

const jsonLines = (records) => `[\n${records.map((r) => JSON.stringify(r)).join(',\n')}\n]\n`;
const pretty = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const git = (repo, ...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();

function yamlToJson(file) {
  const out = execFileSync('ruby', [path.join(here, 'yaml2json.rb'), file], { encoding: 'utf8' });
  return JSON.parse(out);
}

function drugRecords(text) {
  return csvObjects(text).map((r) => {
    let aliases;
    try { aliases = JSON.parse(r.aliases || '[]'); } catch { aliases = []; }
    return { name: r.name, aliases: Array.isArray(aliases) ? aliases : [], common_shorthand: r.common_shorthand || null,
      form: r.form || null, strength: r.strength || null };
  });
}

const PROCEDURE_CONTENT = ['indications', 'contraindications', 'equipment', 'steps', 'aftercare', 'red_flags'];

// YAML 1.1 reads a bare Yes / No as true / false; the files mean the words (same as AccessEMR's loader).
const optionText = (value) => (value === true ? 'Yes' : value === false ? 'No' : String(value));

// One procedures library entry in the shape AccessEMR's API returns (option set names expanded, every content
// list present, `other` and `unit` only when given).
function procedureRecord(entry, specialty, optionSets) {
  const form = (entry.form || []).map((item) => {
    const options = typeof item.options === 'string' ? optionSets[item.options] : item.options;
    const resolved = { key: item.key, label: String(item.label).trim(), section: item.section, type: item.type,
      options: (options || []).map(optionText) };
    if ('other' in item) resolved.other = item.other === true;
    if (item.unit !== undefined && item.unit !== null && String(item.unit) !== '') resolved.unit = String(item.unit);
    return resolved;
  });
  return {
    code: entry.code, name: String(entry.name).trim(), specialty_key: String(specialty.key),
    specialty_name: String(specialty.name), synonyms: (entry.synonyms || []).map((s) => String(s).trim()),
    paediatric: entry.paediatric === true, consent: entry.consent,
    content: Object.fromEntries(PROCEDURE_CONTENT.map((field) => [field, entry[field] || []])), form,
  };
}

function build(args) {
  const core = path.resolve(args.core);
  const src = (rel) => path.join(core, rel);
  const read = (rel) => fs.readFileSync(src(rel));
  const files = new Map(); // relative output path -> { content: Buffer, source, records }
  const put = (rel, content, source, records) => files.set(rel, { content: Buffer.from(content), source, records });

  // ICD-10
  const icdText = fs.readFileSync(args.icd, 'utf8');
  const icd = csvObjects(icdText);
  put('icd10/icd10_codes.csv', fs.readFileSync(args.icd), 'AccessEMR staging database export (icd10 codes table)', icd.length);
  put('icd10/icd10_codes.json', jsonLines(icd.map((r) => ({ code: r.code, title: r.title, definition: r.definition || null }))),
    'generated from icd10/icd10_codes.csv', icd.length);

  // Medications
  const drugsCsv = read('db/data/medkb/drugs.csv');
  const drugs = drugRecords(drugsCsv.toString('utf8'));
  put('medications/drugs.csv', drugsCsv, 'db/data/medkb/drugs.csv', drugs.length);
  put('medications/drugs.json', jsonLines(drugs), 'generated from db/data/medkb/drugs.csv', drugs.length);
  const generics = read('db/data/medkb/generics_flags.json');
  put('medications/generics.json', generics, 'db/data/medkb/generics_flags.json', JSON.parse(generics).length);
  const doses = read('db/data/medkb/dose_defaults.json');
  const dosesDoc = JSON.parse(doses);
  put('medications/dose_defaults.json', doses, 'db/data/medkb/dose_defaults.json', dosesDoc.rules.length);

  // Labs and imaging
  for (const name of ['catalog_tests.csv', 'catalog_analytes.csv']) {
    const buf = read(`db/data/labkb/${name}`);
    put(`labs/${name}`, buf, `db/data/labkb/${name}`, csvObjects(buf.toString('utf8')).length);
  }
  const common = yamlToJson(src('db/data/labkb/common.yml'));
  const commonTests = Object.values(common.common_tests || {}).reduce((n, list) => n + list.length, 0);
  put('labs/common.json', pretty(common), 'db/data/labkb/common.yml (converted from YAML)',
    { common_tests: commonTests, panels: (common.panels || []).length });

  // Drug safety
  const rules = read('db/data/medkb/safety/rules.json');
  const rulesDoc = JSON.parse(rules);
  put('safety/rules.json', rules, 'db/data/medkb/safety/rules.json', rulesDoc.rules.length);
  const classes = read('db/data/medkb/safety/classes.json');
  put('safety/classes.json', classes, 'db/data/medkb/safety/classes.json', JSON.parse(classes).length);
  const groups = yamlToJson(src('db/data/medkb/safety/allergy_groups.yml'));
  put('safety/allergy_groups.json', pretty(groups), 'db/data/medkb/safety/allergy_groups.yml (converted from YAML)',
    (groups.groups || []).length);
  const safetyVersion = read('db/data/medkb/safety/version.json');
  put('safety/version.json', safetyVersion, 'db/data/medkb/safety/version.json', null);

  // Procedures library
  const procDir = 'db/data/procedures';
  const procedures = [];
  for (const name of fs.readdirSync(src(procDir)).filter((f) => f.endsWith('.yml')).sort()) {
    const doc = yamlToJson(src(`${procDir}/${name}`));
    for (const entry of doc.procedures || []) procedures.push(procedureRecord(entry, doc.specialty, doc.option_sets || {}));
  }
  put('procedures/procedures.json', jsonLines(procedures),
    `${procDir} (YAML files, one per specialty, converted; option sets expanded)`, procedures.length);
  const procVersion = read(`${procDir}/version.json`);
  put('procedures/version.json', procVersion, `${procDir}/version.json`, null);

  // Top-level version.json
  const commit = git(core, 'rev-parse', 'HEAD');
  const datasets = [...files.entries()].map(([rel, f]) => {
    const sourcePath = f.source.startsWith('db/') ? f.source.split(' ')[0] : null;
    return {
      file: rel,
      source: f.source,
      source_commit: sourcePath ? commit : null,
      source_last_changed: sourcePath ? git(core, 'log', '-1', '--format=%H', '--', sourcePath) || null : null,
      records: f.records,
      bytes: f.content.length,
      sha256: sha256(f.content),
    };
  });
  const previous = readJson(path.join(args.out, 'version.json'));
  const unchanged = previous && JSON.stringify(previous.datasets) === JSON.stringify(datasets);
  const date = args.date || (unchanged ? previous.build_date : new Date().toISOString().slice(0, 10));
  const labVersion = JSON.parse(read('db/data/labkb/version.json'));
  const safetyDoc = JSON.parse(safetyVersion);
  const procDoc = JSON.parse(procVersion);
  const version = {
    name: '@accessphs/accessemr-reference data',
    data_version: date.replaceAll('-', '.'),
    build_date: date,
    source: { repository: 'AccessEMR core (access-emr-core)', commit, commit_date: git(core, 'log', '-1', '--format=%cI') },
    upstream: {
      medkb_dose_defaults_generated_at: dosesDoc.generated_at,
      labkb_catalogue_generated_at: labVersion.generated_at,
      labkb_analytes_generated_at: labVersion.analytes?.generated_at ?? null,
      safety_kb_version: safetyDoc.kb_version,
      safety_curated_version: safetyDoc.curated_version,
      allergy_groups_version: groups.version ?? null,
      common_labs_version: common.version ?? null,
      procedures_version: procDoc.version ?? null,
      procedures_status: procDoc.status ?? null,
    },
    datasets,
  };
  put('version.json', pretty(version), 'generated', null);
  return files;
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function write(files, out) {
  for (const [rel, f] of files) {
    const target = path.join(out, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, f.content);
  }
}

function listFiles(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? listFiles(full, base) : [path.relative(base, full).split(path.sep).join('/')];
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = build(args);
  if (args.check) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'accessemr-data-'));
    write(files, tmp);
    const expected = new Set([...listFiles(tmp), ...listFiles(args.out)]);
    const diffs = [...expected].filter((rel) => {
      const a = path.join(tmp, rel);
      const b = path.join(args.out, rel);
      return !fs.existsSync(a) || !fs.existsSync(b) || !fs.readFileSync(a).equals(fs.readFileSync(b));
    });
    fs.rmSync(tmp, { recursive: true, force: true });
    if (diffs.length) {
      console.error(`data/ differs from a fresh build:\n  ${diffs.join('\n  ')}`);
      process.exit(1);
    }
    console.log(`data/ is up to date (${files.size} files).`);
    return;
  }
  write(files, args.out);
  for (const [rel, f] of files) console.log(`${rel.padEnd(32)} ${String(JSON.stringify(f.records ?? '')).padEnd(36)} ${f.content.length} bytes`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
