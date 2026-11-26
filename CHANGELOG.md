# Changelog

## 1.0.0 (2026-11-26)

First hand-over.

**Data** (data version 2026.11.26, AccessEMR core commit `4ee29476`):
- ICD-10 codes: 46,504 (ICD-10-CM content as used in AccessEMR), CSV and JSON.
- Drug list: 5,482 rows (2,166 names, 11,335 brand aliases), CSV and JSON.
- MedKB generics: 2,516 (165 high-alert, 23 controlled). Reference doses: 818.
- Lab and imaging catalogue: 759 tests, 1,132 result fields; 43 common tests and 10 default panels.
- Drug-safety rules: 5,481 (4,970 interactions, 459 pregnancy, 52 allergy cross-reactions); 133 classes;
  15 allergy groups.

**Engine:**
- `createSafetyEngine(data)` with `check()`, `resolve()`, `searchDrugs()` and `info`: a TypeScript port of
  AccessEMR's `Medkb::SafetyCheck`, verified identical on 51 parity cases.
- `createSearch({ icd10, drugs })`, `parseCsv`, `parseIcd10Csv`.
- Node helpers (`@accessphs/accessemr-reference/node`): `loadDefaultData`, `loadIcd10`, `loadDataVersion`,
  `defaultEngine`, `searchIcd10`, `searchDrugs`.
- ESM and CommonJS builds with type definitions; no runtime dependencies.
