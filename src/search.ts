// Simple, dependency-free search over the ICD-10 list and the drug list. Case-insensitive; prefix matches rank
// above word-prefix matches, which rank above substring matches. Ties keep the data-file order.
import type { DrugRecord } from './types.js';
import { squish, strip, toS, uniq } from './text.js';

export interface Icd10Record {
  code: string;
  title: string;
  definition?: string | null;
}

export interface DrugSearchResult {
  /** Generic / listed name ("Artemether + Lumefantrine"). */
  name: string;
  form: string | null;
  strengths: string[];
  /** Brand names and other aliases (often Nigerian brands, e.g. "AMATEM FORTE"). */
  aliases: string[];
  common_shorthand: string | null;
  /** The text that matched the query (the name, an alias or the shorthand). */
  matched: string;
}

export interface Icd10SearchResult extends Icd10Record {
  /** "code" when the query matched the code, otherwise "title" or "definition". */
  matched: 'code' | 'title' | 'definition';
}

const key = (text: unknown) => squish(toS(text).toLowerCase());
const codeKey = (text: unknown) => toS(text).toUpperCase().replace(/[.\s]/g, '');

/** Lower = better. 0 exact, 1 prefix, 2 a word starts with the query, 3 substring, null no match. */
function score(text: string, query: string): number | null {
  if (!text) return null;
  if (text === query) return 0;
  if (text.startsWith(query)) return 1;
  const at = text.indexOf(query);
  if (at === -1) return null;
  return /[^a-z0-9]/.test(text.charAt(at - 1)) ? 2 : 3;
}

function top<T>(scored: Array<{ rank: number; position: number; value: T }>, limit: number): T[] {
  return scored
    .sort((a, b) => a.rank - b.rank || a.position - b.position)
    .slice(0, Math.max(0, limit))
    .map((entry) => entry.value);
}

interface IcdEntry { record: Icd10Record; code: string; title: string; definition: string }
const icdCache = new WeakMap<readonly Icd10Record[], IcdEntry[]>();

/** Search ICD-10 by code ("A00.9", "a009", "J45") or by words of the title (and, last, the definition). */
export function searchIcd10Records(records: readonly Icd10Record[], query: string, limit = 20): Icd10SearchResult[] {
  const q = key(query);
  if (!q) return [];
  let entries = icdCache.get(records);
  if (!entries) {
    entries = records.map((record) => ({
      record,
      code: codeKey(record.code),
      title: key(record.title),
      definition: key(record.definition),
    }));
    icdCache.set(records, entries);
  }
  const qCode = codeKey(query);
  const scored: Array<{ rank: number; position: number; value: Icd10SearchResult }> = [];
  entries.forEach((entry, position) => {
    const byCode = qCode && /^[A-Z0-9]+$/.test(qCode) ? score(entry.code.toLowerCase(), qCode.toLowerCase()) : null;
    if (byCode !== null && byCode <= 1) {
      scored.push({ rank: byCode, position, value: { ...entry.record, matched: 'code' } });
      return;
    }
    const byTitle = score(entry.title, q);
    if (byTitle !== null) {
      scored.push({ rank: 2 + byTitle, position, value: { ...entry.record, matched: 'title' } });
      return;
    }
    const byDefinition = score(entry.definition, q);
    if (byDefinition !== null && byDefinition <= 2) {
      scored.push({ rank: 10 + byDefinition, position, value: { ...entry.record, matched: 'definition' } });
    }
  });
  return top(scored, limit);
}

interface DrugEntry { result: Omit<DrugSearchResult, 'matched'>; terms: Array<{ text: string; key: string; weight: number }> }
const drugCache = new WeakMap<readonly DrugRecord[], DrugEntry[]>();

function drugEntries(records: readonly DrugRecord[]): DrugEntry[] {
  const cached = drugCache.get(records);
  if (cached) return cached;
  const byKey = new Map<string, DrugEntry>();
  for (const record of records) {
    const name = strip(toS(record.name)).replace(/\s+/g, ' ');
    if (!name) continue;
    const form = strip(toS(record.form)) || null;
    const id = JSON.stringify([name, form]);
    let entry = byKey.get(id);
    if (!entry) {
      entry = { result: { name, form, strengths: [], aliases: [], common_shorthand: null }, terms: [] };
      byKey.set(id, entry);
    }
    const strength = strip(toS(record.strength));
    if (strength) entry.result.strengths = uniq([...entry.result.strengths, strength]);
    const aliases = (record.aliases ?? []).map((aka) => strip(toS(aka))).filter(Boolean);
    entry.result.aliases = uniq([...entry.result.aliases, ...aliases]);
    entry.result.common_shorthand ??= strip(toS(record.common_shorthand)) || null;
  }
  const entries = [...byKey.values()];
  for (const entry of entries) {
    const { name, aliases, common_shorthand: shorthand } = entry.result;
    entry.terms = [
      { text: name, key: key(name), weight: 0 },
      ...(shorthand ? [{ text: shorthand, key: key(shorthand), weight: 1 }] : []),
      ...aliases.map((aka) => ({ text: aka, key: key(aka), weight: 1 })),
    ];
  }
  drugCache.set(records, entries);
  return entries;
}

/** Search the drug list by name, brand alias or shorthand. One result per drug name + form. */
export function searchDrugRecords(records: readonly DrugRecord[], query: string, limit = 20): DrugSearchResult[] {
  const q = key(query);
  if (!q) return [];
  const scored: Array<{ rank: number; position: number; value: DrugSearchResult }> = [];
  drugEntries(records).forEach((entry, position) => {
    let best: { rank: number; text: string } | null = null;
    for (const term of entry.terms) {
      const s = score(term.key, q);
      if (s === null) continue;
      // Name matches beat alias matches of the same quality.
      const rank = s * 2 + term.weight;
      if (!best || rank < best.rank) best = { rank, text: term.text };
    }
    if (best) scored.push({ rank: best.rank, position, value: { ...entry.result, matched: best.text } });
  });
  return top(scored, limit);
}

export interface SearchData {
  icd10?: readonly Icd10Record[];
  drugs?: readonly DrugRecord[];
}

/** Search helpers bound to your data (e.g. the imported JSON files). */
export function createSearch(data: SearchData) {
  return {
    searchIcd10: (query: string, limit = 20) => searchIcd10Records(data.icd10 ?? [], query, limit),
    searchDrugs: (query: string, limit = 20) => searchDrugRecords(data.drugs ?? [], query, limit),
  };
}

/** Parses an ICD-10 CSV (code,title,definition) such as data/icd10/icd10_codes.csv. */
export function parseIcd10Csv(text: string): Icd10Record[] {
  const [header, ...rows] = parseCsv(text.replace(/^﻿/, ''));
  const at = (name: string) => header?.indexOf(name) ?? -1;
  const [code, title, definition] = [at('code'), at('title'), at('definition')];
  return rows
    .filter((row) => row.length > 1 || row[0] !== '')
    .map((row) => ({ code: row[code] ?? '', title: row[title] ?? '', definition: row[definition] || null }));
}

/** RFC 4180 CSV parser (quoted fields, "" escapes, embedded newlines). Returns rows of string fields. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
