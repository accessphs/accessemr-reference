// Node-only helpers: read the bundled data/ files from disk.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createSafetyEngine, type SafetyEngine } from './engine.js';
import { moduleDir } from './here.js';
import {
  findProcedure, procedureSpecialties, searchDrugRecords, searchIcd10Records, searchProcedureRecords,
  type Icd10Record, type ProcedureSearchOptions,
} from './search.js';
import type { ProcedureRecord, SafetyData } from './types.js';

export * from './index.js';

/** The package's data/ folder (dist/esm or dist/cjs → ../../data). */
export const defaultDataDir: string = resolve(moduleDir, '..', '..', 'data');

const readJson = <T>(dir: string, file: string): T => JSON.parse(readFileSync(join(dir, file), 'utf8')) as T;

/** Reads the files the safety engine needs from data/ (or another folder with the same layout). */
export function loadDefaultData(dataDir: string = defaultDataDir): SafetyData {
  return {
    generics: readJson(dataDir, 'medications/generics.json'),
    drugs: readJson(dataDir, 'medications/drugs.json'),
    rules: readJson(dataDir, 'safety/rules.json'),
    classes: readJson(dataDir, 'safety/classes.json'),
    allergyGroups: readJson(dataDir, 'safety/allergy_groups.json'),
  };
}

/** Reads data/icd10/icd10_codes.json. */
export function loadIcd10(dataDir: string = defaultDataDir): Icd10Record[] {
  return readJson(dataDir, 'icd10/icd10_codes.json');
}

/** Reads data/procedures/procedures.json (the procedures library). */
export function loadProcedures(dataDir: string = defaultDataDir): ProcedureRecord[] {
  return readJson(dataDir, 'procedures/procedures.json');
}

/** Reads data/version.json (dataset versions, counts and checksums). */
export function loadDataVersion(dataDir: string = defaultDataDir): Record<string, unknown> {
  return readJson(dataDir, 'version.json');
}

let engine: SafetyEngine | null = null;
let icd10: Icd10Record[] | null = null;

/** A safety engine over the bundled data, created on first use and then reused. */
export function defaultEngine(): SafetyEngine {
  return (engine ??= createSafetyEngine(loadDefaultData()));
}

/** Searches the bundled ICD-10 list (loaded on first use). */
export function searchIcd10(query: string, limit = 20) {
  return searchIcd10Records((icd10 ??= loadIcd10()), query, limit);
}

/** Searches the bundled drug list (loaded on first use). */
export function searchDrugs(query: string, limit = 20) {
  return searchDrugRecords(defaultEngineDrugs(), query, limit);
}

let drugs: SafetyData['drugs'] | null = null;
function defaultEngineDrugs(): SafetyData['drugs'] {
  if (!drugs) drugs = readJson<SafetyData['drugs']>(defaultDataDir, 'medications/drugs.json');
  return drugs;
}

let procedures: ProcedureRecord[] | null = null;
const bundledProcedures = (): ProcedureRecord[] => (procedures ??= loadProcedures());

/** Searches the bundled procedures library (loaded on first use). */
export function searchProcedures(query: string, limit = 20, options: ProcedureSearchOptions = {}) {
  return searchProcedureRecords(bundledProcedures(), query, limit, options);
}

/** A bundled procedure by code ("PRC-OBS-004"), or undefined. */
export function getProcedure(code: string): ProcedureRecord | undefined {
  return findProcedure(bundledProcedures(), code);
}

/** The bundled procedure specialties with their counts. */
export function listProcedureSpecialties() {
  return procedureSpecialties(bundledProcedures());
}
