# Versions and updates

## Two version numbers

- **Package version** (`package.json`, semver, now `1.0.1`): the engine and the shape of the data.
  - **Patch** (1.0.x): data refresh only (new drugs, brands, rules, codes), or a bug fix that does not change the
    API or the file formats.
  - **Minor** (1.x.0): additions that do not break you: a new data file, a new optional field, a new helper
    function, a new kind of check that existing code can ignore.
  - **Major** (x.0.0): something you must adapt to: a renamed or removed field, a changed file format, a changed
    `check()` signature or output shape.
- **Data version** (`data/version.json` → `data_version`, a date such as `2026.11.26`, plus `build_date` and
  the AccessEMR source `commit`): which content you have. Each dataset entry also has its record count and
  SHA-256, so you can see exactly which files changed between two versions.
  `data/safety/version.json` adds the safety knowledge-base version (`kb_version`) and curation counts.

The engine reports what it was built from: `engine.info` → `{ kbVersion, curatedVersion, allergyGroupsVersion,
rules, generics }`. Log it with overrides so you can tell later which rules were in force.

## How we ship updates

1. AccessEMR changes the source data (in its core repo) and merges it.
2. We rebuild this package from that commit, run the tests (including the parity suite against the Ruby engine
   whenever the engine changes), bump the version, and add a CHANGELOG entry.
3. We send you the new tarball (`accessphs-accessemr-reference-<version>.tgz`) and a zip of the repo. Nothing is
   published to a public registry.

Expect data refreshes when AccessEMR's lists change (new brands, new lab tests, curated rule changes). The
CHANGELOG says what changed and whether you need to do anything.

## Taking an update

- **JavaScript apps:** `npm install ./accessphs-accessemr-reference-<version>.tgz`, run your tests, ship.
  If you copy the JSON files into your app or download them at runtime, replace all the safety files together
  (generics, drugs, rules, classes, allergy groups): the rules refer to generic and class ids in the other
  files.
- **Database imports:** upsert by the stable keys (`code`, `generic_id`, `rule_id`, `class_id`, group `id`) and
  delete rows whose key is no longer in the new file. AccessEMR does the same for its safety rules.
- Check `data/version.json` to confirm the version you deployed.

## Rebuilding (our side)

```bash
# data/ from an AccessEMR core checkout + the ICD-10 export
node scripts/build-data.mjs --core ../access-emr-core-safety [--icd source/icd10_codes.csv]
node scripts/build-data.mjs --core ../access-emr-core-safety --check   # verify data/ matches a fresh build

npm test          # build dist/, unit + parity + data checks
npm pack          # → accessphs-accessemr-reference-<version>.tgz
```

- Needs Node 18+ and Ruby on PATH (the build uses `scripts/yaml2json.rb`, Ruby's standard-library YAML parser, to
  convert the two YAML files; this keeps the Node build free of npm dependencies).
- CSV and JSON files are copied byte for byte; `drugs.json`, `icd10_codes.json`, `common.json` and
  `allergy_groups.json` are generated. `build_date` and `data_version` only move when a file's content changes
  (or with `--date YYYY-MM-DD`), so a rebuild from the same sources reproduces every file exactly.
- The ICD-10 list is not in the core repo: it is an export of AccessEMR's ICD-10 table (staging database),
  kept in `source/icd10_codes.csv`. Re-export it when the table changes.
- `review_log.csv` (the internal record of the second review) is deliberately not copied.
- If the engine logic in AccessEMR changes, port the change to `src/`, regenerate the parity expectations with
  `tools/parity/` (see its README), and make the parity suite pass.
