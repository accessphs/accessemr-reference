# Changelog

## 1.1.0 (2026-11-27)

**Data** (data version 2026.11.27, AccessEMR core commit `f4a06006`):
- New: the procedures library, `data/procedures/procedures.json` (1,015 procedures in 25 specialties) and
  `data/procedures/version.json`. Each procedure has a stable code (`PRC-MED-001`), synonyms, a paediatric flag,
  the usual consent, a short guide (indications, contraindications, equipment, steps, aftercare, red flags) and
  a record form in the same field format AccessEMR uses. Draft content: clinical sign-off is pending.
  Fields in docs/DATA.md.
- `data/version.json` adds `procedures_version` and `procedures_status`. No other file changed.

**Helpers:**
- `searchProcedureRecords`, `findProcedure`, `procedureSpecialties`; `createSearch({ procedures })` adds
  `searchProcedures(query, limit, { specialty, paediatric })` and `procedure(code)`.
- Node: `loadProcedures`, `searchProcedures`, `getProcedure`, `listProcedureSpecialties`.
- Nothing existing changed: the safety engine and its parity results (53/53) are the same as 1.0.1.

## 1.0.1 (2026-11-26)

**Data** (AccessEMR core commit `597f1ceb`):
- Brand names "Coartem" and "Coartem Dispersible" added to the artemether + lumefantrine tablets, so
  `check({ drugs: [{ name: 'Coartem' }] })` now resolves to both ingredients without strength text.

**Engine:**
- Rules from the ONC high-priority interaction list now report `evidence.source` as
  "ONC high-priority list" (was "Onc list").
- Alerts and notices of equal rank now come out in rule-file order, matching AccessEMR, which now sorts
  them the same way.
- Parity cases: 53, up from 51. The new cases cover the Coartem brand and an interaction that only
  the ONC high-priority list contains.

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
