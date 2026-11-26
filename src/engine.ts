// Port of Medkb::SafetyCheck + Medkb::IngredientResolver (AccessEMR app/services/medkb/*.rb): checks candidate
// drugs against the patient's current medicines, an active pregnancy and recorded drug allergies.
// Everything runs in memory on the data you pass in; nothing is sent anywhere.
import { AllergyGroups, type AllergyGroup } from './allergyGroups.js';
import { GenericIndex } from './genericIndex.js';
import { ALPHA, humanize, isBlank, squish, strip, toS, uniq } from './text.js';
import { searchDrugRecords, type DrugSearchResult } from './search.js';
import type {
  CheckInput,
  CheckResult,
  DrugInput,
  DrugRecord,
  Item,
  SafetyData,
  SafetyRule,
} from './types.js';

const LEVEL_ORDER = ['alert', 'notice'];
const SEVERITY_ORDER = ['serious', 'moderate', 'minor'];
const KIND_ORDER = ['allergy', 'interaction', 'pregnancy'];
const SOURCES: Record<string, string> = {
  fda_label: 'FDA label',
  onc_high_priority: 'ONC high-priority list',
  onc: 'ONC high-priority list',
  onc_list: 'ONC high-priority list',
};
const GROUP_SOURCE = 'Allergy group (AccessEMR)';
const ALLERGY_ACTION = 'Avoid unless the benefit outweighs the risk; if used, monitor for a reaction.';

const SEPARATORS = /[ \t\r\n\f\v]*(?:\/|\+|&|,|\band\b)[ \t\r\n\f\v]*/i;
const DOSE = /\d+(\.\d+)?[ \t\r\n\f\v]*(mg|mcg|g|ml|iu|%)/gi;
const THREE_LETTERS = new RegExp(`[${ALPHA}]{3,}`);

interface Rule {
  position: number;
  rule_id: string;
  kind: string;
  subject_id: string;
  object_ref: string | null;
  severity: string;
  level: string;
  effect: string | null;
  action: string | null;
  quote: string | null;
  source_kind: string | null;
  set_id: string | null;
  section: string | null;
}

interface FormularyRow {
  name: string;
  lowerName: string;
  aliases: string[];
}

interface ResolvedDrug {
  name: string;
  ids: string[];
  matchIds: Set<string>;
  matchList: string[];
}

interface RuleIndex {
  bySubject: Map<string, Rule[]>;
  byObject: Map<string, Rule[]>;
}

export interface SafetyEngine {
  /** Checks drugs against current medicines, the other drugs in the same call, drug allergies and pregnancy. */
  check(input: CheckInput): CheckResult;
  /** The MedKB generic ids a drug name contains ([] when nothing resolves). */
  resolve(name: string, strength?: string | null): string[];
  /** Case-insensitive search over the drug list (names, brand aliases and shorthand). */
  searchDrugs(query: string, limit?: number): DrugSearchResult[];
  /** Data versions the engine was built from. */
  readonly info: { kbVersion: string | null; curatedVersion: number | null; allergyGroupsVersion: number | null; rules: number; generics: number };
}

/** Builds a safety engine from the parsed data files (see loadDefaultData() in Node, or import the JSON files). */
export function createSafetyEngine(data: SafetyData): SafetyEngine {
  if (!data || !data.generics || !data.rules || !data.classes || !data.allergyGroups || !data.drugs) {
    throw new Error('createSafetyEngine: data must include generics, drugs, rules, classes and allergyGroups');
  }
  const index = new GenericIndex(data.generics);
  const groups = new AllergyGroups(data.allergyGroups);
  const rulesFile = Array.isArray(data.rules) ? { rules: data.rules } : data.rules;
  const rules = rulesFile.rules.map(toRule);
  const indexes = {
    interaction: indexRules(rules.filter((rule) => rule.kind === 'interaction')),
    pregnancy: indexRules(rules.filter((rule) => rule.kind === 'pregnancy')),
    allergy_xr: indexRules(rules.filter((rule) => rule.kind === 'allergy_xr')),
  };
  const classesByMember = new Map<string, string[]>();
  for (const klass of data.classes) {
    for (const member of uniq((klass.members ?? []).map(String))) {
      const list = classesByMember.get(member) ?? [];
      list.push(String(klass.class_id));
      classesByMember.set(member, list);
    }
  }
  const formulary = buildFormulary(data.drugs);

  // --- resolution (IngredientResolver) ----------------------------------------------------------------------------

  const formularyMap = (names: string[]): Map<string, string> => {
    const keys = uniq(names.map((name) => squish(name.toLowerCase())).filter((key) => !isBlank(key)));
    const wanted = new Set(keys);
    const positions = new Set<number>();
    for (const key of keys) {
      for (const position of formulary.byLowerName.get(key) ?? []) positions.add(position);
      for (const position of formulary.byLowerAlias.get(key) ?? []) positions.add(position);
    }
    const rows = [...positions].sort((a, b) => a - b).map((position) => formulary.rows[position]!);
    const byAlias = new Map<string, string>();
    const byName = new Map<string, string>();
    for (const row of rows) {
      if (isBlank(row.name)) continue;
      for (const aka of row.aliases) {
        const key = squish(aka.toLowerCase());
        if (wanted.has(key) && !byAlias.has(key)) byAlias.set(key, row.name);
      }
      const key = squish(row.name.toLowerCase());
      if (wanted.has(key) && !byName.has(key)) byName.set(key, row.name);
    }
    const map = new Map<string, string>();
    for (const key of keys) {
      const value = byName.get(key) ?? byAlias.get(key);
      if (value !== undefined) map.set(key, value);
    }
    return map;
  };

  const candidateNames = (drug: DrugInput, map: Map<string, string>): string[] => {
    const name = toS(drug.name);
    const listed = map.get(squish(name.toLowerCase()));
    return uniq([name, listed].filter((value): value is string => !isBlank(value)));
  };

  const idsFor = (drug: DrugInput, map: Map<string, string>): string[] => {
    const names = candidateNames(drug, map);
    for (const name of names) {
      const whole = index.match(name);
      if (whole) return [whole.generic_id];
    }
    return uniq(
      parts([...names, toS(drug.strength)])
        .map((part) => index.match(part)?.generic_id)
        .filter((id): id is string => !!id),
    );
  };

  const resolveAll = (drugs: DrugInput[]): ResolvedDrug[] => {
    const map = formularyMap(drugs.map((drug) => toS(drug.name)));
    return drugs.map((drug) => {
      const ids = idsFor(drug, map);
      const classIds = uniq(ids.flatMap((id) => classesByMember.get(id) ?? []));
      const matchList = [...ids, ...classIds];
      return { name: strip(toS(drug.name)), ids, matchIds: new Set(matchList), matchList };
    });
  };

  // --- check ------------------------------------------------------------------------------------------------------

  const check = (input: CheckInput): CheckResult => {
    const rawDrugs = (input?.drugs ?? []).filter((drug) => !isBlank(strip(toS(drug?.name))));
    if (rawDrugs.length === 0) return { alerts: [], notices: [] };

    const currentRaw = input.currentMeds ?? [];
    const allergens = uniq(
      (input.allergies ?? [])
        .filter((allergy) => isDrugCategory(allergy?.category))
        .map((allergy) => allergy?.allergen)
        .filter((allergen): allergen is string => !isBlank(allergen))
        .map((allergen) => toS(allergen)),
    );
    const resolved = resolveAll([...rawDrugs, ...currentRaw]);
    const candidates = resolved.slice(0, rawDrugs.length);
    const current = resolved.slice(rawDrugs.length);
    const candidateKeys = uniq(candidates.flatMap((drug) => drug.matchList));
    const items: Item[] = [];

    // Interactions: each candidate against current medicines and the candidates after it.
    const interactionRules = candidateKeys.length ? rulesTouching(indexes.interaction, candidateKeys, true) : [];
    candidates.forEach((candidate, position) => {
      const others = [...current, ...candidates.slice(position + 1)];
      for (const other of others) {
        if (candidate.ids.length === 0 || other.ids.length === 0) continue;
        for (const rule of interactionRules) {
          if (matchesPair(rule, candidate.matchIds, other.matchIds)) {
            items.push(ruleItem(rule, 'interaction', candidate.name, other.name));
          }
        }
      }
    });

    // Pregnancy
    if (candidateKeys.length && input.pregnant === true) {
      const pregnancyRules = rulesTouching(indexes.pregnancy, candidateKeys, false);
      for (const candidate of candidates) {
        for (const rule of pregnancyRules) {
          if (candidate.matchIds.has(rule.subject_id)) items.push(ruleItem(rule, 'pregnancy', candidate.name, 'Pregnancy'));
        }
      }
    }

    // Allergies
    let allergyRules: Rule[] | null = null;
    const kbAllergyRules = () => (allergyRules ??= rulesTouching(indexes.allergy_xr, candidateKeys, false));
    for (const allergen of allergens) {
      const matched = groups.groupsForAllergen(allergen);
      const direct = index.match(allergen)?.generic_id ?? null;
      for (const candidate of candidates) {
        let found = groupItems(candidate, allergen, matched);
        if (found.length === 0) found = kbAllergyItems(candidate, allergen, matched, kbAllergyRules);
        if (found.length === 0) {
          const fallback = fallbackItem(candidate, allergen, direct);
          found = fallback ? [fallback] : [];
        }
        items.push(...found);
      }
    }

    return result(items);
  };

  const groupItems = (candidate: ResolvedDrug, allergen: string, matched: AllergyGroup[]): Item[] =>
    matched.flatMap((group) => {
      const own = member(candidate, group)
        ? [allergyItem(`ag:${group.id}`, candidate, allergen, isBlank(group.text) ? defaultText(group) : group.text)]
        : [];
      const cross = group.cross.flatMap((link) => {
        const target = groups.group(link.group);
        if (!target || !member(candidate, target)) return [];
        const severity = isBlank(link.severity) ? 'serious' : toS(link.severity);
        return [allergyItem(`ag:${group.id}:${target.id}`, candidate, allergen, link.text ?? null, severity)];
      });
      return [...own, ...cross];
    });

  const kbAllergyItems = (
    candidate: ResolvedDrug,
    allergen: string,
    matched: AllergyGroup[],
    loadRules: () => Rule[],
  ): Item[] => {
    const groupIds = new Set(matched.map((group) => group.id));
    return loadRules()
      .filter((rule) => rule.object_ref !== null && groupIds.has(rule.object_ref))
      .filter((rule) => candidate.matchIds.has(rule.subject_id))
      .map((rule) => ruleItem(rule, 'allergy', candidate.name, strip(allergen)));
  };

  const fallbackItem = (candidate: ResolvedDrug, allergen: string, direct: string | null): Item | null => {
    let ruleId: string | null = null;
    if (direct && candidate.ids.includes(direct)) ruleId = 'ag:direct';
    else if (candidate.name.toLowerCase() === strip(allergen).toLowerCase()) ruleId = 'ag:exact';
    return ruleId ? allergyItem(ruleId, candidate, allergen, `Patient has a recorded allergy to ${strip(allergen)}.`) : null;
  };

  const member = (candidate: ResolvedDrug, group: AllergyGroup): boolean =>
    candidate.ids.some((id) => group.generics.includes(id)) || group.classes.some((id) => candidate.matchIds.has(id));

  return {
    check,
    resolve: (name, strength) => resolveAll([{ name, strength: strength ?? null }])[0]!.ids,
    searchDrugs: (query, limit = 20) => searchDrugRecords(data.drugs, query, limit),
    info: {
      kbVersion: rulesFile.kb_version ?? null,
      curatedVersion: rulesFile.curated_version ?? null,
      allergyGroupsVersion: groups.version ?? null,
      rules: rules.length,
      generics: index.generics.length,
    },
  };
}

// --- helpers ------------------------------------------------------------------------------------------------------

function isDrugCategory(category: unknown): boolean {
  return category === null || category === undefined || strip(toS(category)).toLowerCase() === 'drug';
}

/** IngredientResolver.parts: split names/strength on combination separators, drop doses, keep 3+ letter words. */
export function parts(texts: unknown[]): string[] {
  const pieces = texts
    .filter((text) => !isBlank(text))
    .flatMap((text) => toS(text).split(SEPARATORS))
    .map((part) => squish(part.replace(DOSE, ' ')))
    .filter((part) => THREE_LETTERS.test(part));
  return uniq(pieces);
}

function toRule(rule: SafetyRule, position: number): Rule {
  const evidence = rule.evidence ?? {};
  return {
    position,
    rule_id: rule.rule_id,
    kind: rule.kind,
    subject_id: rule.subject?.id,
    object_ref: rule.object?.id ?? null,
    severity: rule.severity,
    level: rule.level,
    effect: rule.effect ?? null,
    action: rule.action ?? null,
    quote: evidence.quote ?? null,
    source_kind: evidence.source_kind ?? null,
    set_id: evidence.set_id ?? null,
    section: evidence.section ?? null,
  };
}

function indexRules(rules: Rule[]): RuleIndex {
  const bySubject = new Map<string, Rule[]>();
  const byObject = new Map<string, Rule[]>();
  const add = (map: Map<string, Rule[]>, key: string | null, rule: Rule) => {
    if (key === null || key === undefined) return;
    const list = map.get(key) ?? [];
    list.push(rule);
    map.set(key, list);
  };
  for (const rule of rules) {
    add(bySubject, rule.subject_id, rule);
    add(byObject, rule.object_ref, rule);
  }
  return { bySubject, byObject };
}

/** Rules whose subject (or, with objects, object) is one of keys, in data-file order. */
function rulesTouching(index: RuleIndex, keys: string[], objects: boolean): Rule[] {
  const found = new Set<Rule>();
  for (const key of keys) {
    for (const rule of index.bySubject.get(key) ?? []) found.add(rule);
    if (objects) for (const rule of index.byObject.get(key) ?? []) found.add(rule);
  }
  return [...found].sort((a, b) => a.position - b.position);
}

function matchesPair(rule: Rule, mine: Set<string>, theirs: Set<string>): boolean {
  if (rule.object_ref === null) return false;
  return (
    (mine.has(rule.subject_id) && theirs.has(rule.object_ref)) ||
    (theirs.has(rule.subject_id) && mine.has(rule.object_ref))
  );
}

function sourceLabel(sourceKind: string | null): string | null {
  if (isBlank(sourceKind)) return null;
  return SOURCES[sourceKind!] ?? humanize(sourceKind!);
}

function ruleItem(rule: Rule, kind: Item['kind'], drug: string, other: string): Item {
  return {
    rule_id: rule.rule_id,
    kind,
    severity: rule.severity as Item['severity'],
    level: rule.level as Item['level'],
    drug,
    other,
    effect: rule.effect,
    action: rule.action,
    evidence: { quote: rule.quote, source: sourceLabel(rule.source_kind), set_id: rule.set_id, section: rule.section },
  };
}

function allergyItem(
  ruleId: string,
  candidate: ResolvedDrug,
  allergen: string,
  effect: string | null,
  severity = 'serious',
): Item {
  return {
    rule_id: ruleId,
    kind: 'allergy',
    severity: severity as Item['severity'],
    level: 'alert',
    drug: candidate.name,
    other: strip(allergen),
    effect,
    action: ALLERGY_ACTION,
    evidence: { quote: null, source: GROUP_SOURCE, set_id: null, section: null },
  };
}

function defaultText(group: AllergyGroup): string {
  return `Patient is allergic to ${group.name} and this drug belongs to that group.`;
}

function rank(order: string[], value: string): number {
  const position = order.indexOf(value);
  return position === -1 ? order.length : position;
}

function compare(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return 0;
}

/**
 * One item per (kind, drug, other): alerts before notices, then the most severe, then the first found. The result is
 * ordered by severity, then kind. A (drug, other) pair that already raises an alert does not repeat as a notice.
 */
function result(items: Item[]): CheckResult {
  const ranked = items
    .map((item, position) => ({ item, position }))
    .sort((a, b) =>
      compare(
        [rank(LEVEL_ORDER, a.item.level), rank(SEVERITY_ORDER, a.item.severity), a.position],
        [rank(LEVEL_ORDER, b.item.level), rank(SEVERITY_ORDER, b.item.severity), b.position],
      ),
    );
  const seen = new Set<string>();
  const kept = ranked.filter(({ item }) => {
    const key = JSON.stringify([item.kind, item.drug, item.other]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const sorted = kept
    .sort((a, b) =>
      compare(
        [rank(SEVERITY_ORDER, a.item.severity), rank(KIND_ORDER, a.item.kind), a.position],
        [rank(SEVERITY_ORDER, b.item.severity), rank(KIND_ORDER, b.item.kind), b.position],
      ),
    )
    .map(({ item }) => item);
  const alerts = sorted.filter((item) => item.level === 'alert');
  const alerted = new Set(alerts.map((item) => JSON.stringify([item.drug, item.other])));
  const notices = sorted.filter(
    (item) => item.level !== 'alert' && !alerted.has(JSON.stringify([item.drug, item.other])),
  );
  return { alerts, notices };
}

// --- formulary (drugs.json as AccessEMR's drugs table) --------------------------------------------------------------

interface Formulary {
  rows: FormularyRow[];
  byLowerName: Map<string, number[]>;
  byLowerAlias: Map<string, number[]>;
}

/**
 * Groups drugs.json rows the way Medkb::CatalogueImport loads them (one drug per name + form, aliases unioned, in
 * file order = database id order) and indexes them by lowercased name and alias (the SQL LOWER() lookup).
 */
function buildFormulary(records: readonly DrugRecord[]): Formulary {
  const rows: FormularyRow[] = [];
  const byKey = new Map<string, FormularyRow>();
  for (const record of records) {
    const name = strip(toS(record.name)).replace(/[ \t\r\n\f\v]+/g, ' ');
    const form = strip(toS(record.form));
    if (isBlank(name) || isBlank(form)) continue;
    const aliases = (Array.isArray(record.aliases) ? record.aliases : [])
      .map((aka) => strip(toS(aka)))
      .filter((aka) => !isBlank(aka));
    const key = JSON.stringify([name, form]);
    let row = byKey.get(key);
    if (!row) {
      row = { name, lowerName: name.toLowerCase(), aliases: [] };
      byKey.set(key, row);
      rows.push(row);
    }
    row.aliases = uniq([...row.aliases, ...aliases]);
  }
  const byLowerName = new Map<string, number[]>();
  const byLowerAlias = new Map<string, number[]>();
  const add = (map: Map<string, number[]>, key: string, position: number) => {
    const list = map.get(key) ?? [];
    if (list[list.length - 1] !== position) list.push(position);
    map.set(key, list);
  };
  rows.forEach((row, position) => {
    add(byLowerName, row.lowerName, position);
    for (const aka of row.aliases) add(byLowerAlias, aka.toLowerCase(), position);
  });
  return { rows, byLowerName, byLowerAlias };
}
