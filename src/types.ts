// Data shapes (the files under data/) and the engine's input/output types.

/** data/medications/generics.json */
export interface GenericRecord {
  generic_id: string;
  inn_name: string;
  aliases?: string[] | null;
  high_alert?: boolean;
  controlled?: boolean;
}

/** data/medications/drugs.json */
export interface DrugRecord {
  name: string;
  aliases?: string[] | null;
  common_shorthand?: string | null;
  form?: string | null;
  strength?: string | null;
}

export interface RuleRef {
  kind: 'generic' | 'class' | 'allergy_group' | string;
  id: string;
}

/** One entry of data/safety/rules.json → rules[] */
export interface SafetyRule {
  rule_id: string;
  kind: 'interaction' | 'pregnancy' | 'allergy_xr' | string;
  subject: RuleRef;
  object?: RuleRef | null;
  severity: Severity | string;
  level: Level | string;
  effect?: string | null;
  action?: string | null;
  evidence?: {
    quote?: string | null;
    source_kind?: string | null;
    set_id?: string | null;
    section?: string | null;
  } | null;
}

/** data/safety/rules.json */
export interface RulesFile {
  kb_version?: string;
  curated_version?: number;
  rules: SafetyRule[];
}

/** One entry of data/safety/classes.json */
export interface DrugClassRecord {
  class_id: string;
  name: string;
  members?: string[] | null;
}

export interface AllergyCrossLink {
  group: string;
  severity?: string | null;
  text?: string | null;
}

export interface AllergyGroupRecord {
  id: string;
  name?: string | null;
  text?: string | null;
  synonyms?: unknown[] | null;
  generics?: unknown[] | null;
  classes?: unknown[] | null;
  cross?: AllergyCrossLink[] | null;
}

/** data/safety/allergy_groups.json */
export interface AllergyGroupsFile {
  version?: number;
  groups: AllergyGroupRecord[];
}

/** Everything the safety engine needs. Pass the parsed JSON files from data/. */
export interface SafetyData {
  /** data/medications/generics.json */
  generics: GenericRecord[];
  /** data/medications/drugs.json (used to map brand names such as "Amatem Forte" to "Artemether + Lumefantrine") */
  drugs: DrugRecord[];
  /** data/safety/rules.json (the whole file, or just its rules array) */
  rules: RulesFile | SafetyRule[];
  /** data/safety/classes.json */
  classes: DrugClassRecord[];
  /** data/safety/allergy_groups.json */
  allergyGroups: AllergyGroupsFile;
}

export type Severity = 'serious' | 'moderate' | 'minor';
export type Level = 'alert' | 'notice';
export type Kind = 'interaction' | 'pregnancy' | 'allergy';

/** A safety finding (AccessEMR contract C2). */
export interface Item {
  /** "ix:…" interaction, "pg:…" pregnancy, "xr:…" KB allergy cross-reaction, "ag:…" allergy group / fallback */
  rule_id: string;
  kind: Kind;
  severity: Severity;
  level: Level;
  /** The drug being checked, as you passed it (trimmed). */
  drug: string;
  /** The other drug's name, the allergen as recorded, or the literal "Pregnancy". */
  other: string;
  effect: string | null;
  action: string | null;
  evidence: {
    quote: string | null;
    /** "FDA label", "ONC high-priority list", "Allergy group (AccessEMR)", … */
    source: string | null;
    /** DailyMed SPL set id of the label the quote comes from. */
    set_id: string | null;
    section: string | null;
  };
}

export interface DrugInput {
  name: string;
  strength?: string | null;
}

export interface AllergyInput {
  allergen: string;
  /** Only drug allergies are checked. Omit, or pass "Drug" (any case); other categories are ignored. */
  category?: string | null;
}

export interface CheckInput {
  /** The drugs being prescribed now. Each is checked against currentMeds, the other drugs here, allergies and pregnancy. */
  drugs: DrugInput[];
  /** Medicines the patient is currently taking (active prescriptions and home medicines). */
  currentMeds?: DrugInput[];
  allergies?: AllergyInput[];
  pregnant?: boolean;
}

export interface CheckResult {
  /** Interrupting findings: show before the prescription is saved and require a reason to continue. */
  alerts: Item[];
  /** Quiet findings: show inline, no confirmation needed. */
  notices: Item[];
}

/** One field of a procedure's record form (the same item format as AccessEMR's note templates). */
export interface ProcedureFormItem {
  key: string;
  label: string;
  /** Where the field sits on the form. */
  section: 'Before' | 'Procedure' | 'After' | 'Outcome';
  /** choice = pick one, multi = pick any, text = free text (max 200 characters), number = a number (with `unit`). */
  type: 'choice' | 'multi' | 'text' | 'number';
  /** The choices for choice / multi items; empty for text and number. */
  options: string[];
  /** true when the form should also accept a typed "other" answer. */
  other?: boolean;
  /** Unit for number items, e.g. "mL", "min". */
  unit?: string;
}

/** One entry of data/procedures/procedures.json. */
export interface ProcedureRecord {
  /** Stable code, e.g. "PRC-ANAE-001" (PRC-<specialty>-<number>). */
  code: string;
  name: string;
  specialty_key: string;
  specialty_name: string;
  synonyms: string[];
  /** true when the procedure is also done in children. */
  paediatric: boolean;
  /** Consent the procedure usually needs. */
  consent: 'none' | 'verbal' | 'written';
  content: {
    indications: string[];
    contraindications: string[];
    equipment: string[];
    steps: string[];
    aftercare: string[];
    red_flags: string[];
  };
  form: ProcedureFormItem[];
}
