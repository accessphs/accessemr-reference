// @accessphs/accessemr-reference: AccessEMR reference data + a local drug-safety engine.
// This entry point has no Node-only imports, so it runs in Node, browsers and React Native.
// For Node file loading (loadDefaultData) import "@accessphs/accessemr-reference/node".
export { createSafetyEngine, parts } from './engine.js';
export type { SafetyEngine } from './engine.js';
export { GenericIndex } from './genericIndex.js';
export type { IndexedGeneric } from './genericIndex.js';
export { AllergyGroups } from './allergyGroups.js';
export type { AllergyGroup } from './allergyGroups.js';
export { normalise, withoutSalt, isCombination } from './name.js';
export { createSearch, searchIcd10Records, searchDrugRecords, parseCsv, parseIcd10Csv } from './search.js';
export type { Icd10Record, Icd10SearchResult, DrugSearchResult, SearchData } from './search.js';
export type * from './types.js';
