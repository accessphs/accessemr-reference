// Port of Medkb::AllergyGroups: free-text allergen synonyms mapped to member generics/classes and cross-reacting
// groups (data/safety/allergy_groups.json).
import type { AllergyCrossLink, AllergyGroupsFile } from './types.js';
import { isBlank, squish, toS } from './text.js';

export interface AllergyGroup {
  id: string;
  name: string;
  text: string;
  synonyms: string[];
  generics: string[];
  classes: string[];
  cross: AllergyCrossLink[];
}

const normalise = (text: unknown): string => squish(toS(text).toLowerCase());

export class AllergyGroups {
  readonly version: number | undefined;
  private readonly byId = new Map<string, AllergyGroup>();
  private readonly terms = new Map<string, Set<string>>();

  constructor(data: AllergyGroupsFile | null | undefined) {
    this.version = data?.version;
    for (const raw of data?.groups ?? []) {
      const list = (value: unknown[] | null | undefined) => (value ?? []).map((item) => toS(item));
      const group: AllergyGroup = {
        id: toS(raw.id),
        name: toS(raw.name),
        text: toS(raw.text),
        synonyms: list(raw.synonyms),
        generics: list(raw.generics),
        classes: list(raw.classes),
        cross: (raw.cross ?? []).map((link) => ({ ...link })),
      };
      this.byId.set(group.id, group); // index_by: a later duplicate id replaces the earlier one
    }
    for (const group of this.byId.values()) {
      const terms = [group.name, group.id, group.id.replace(/_/g, ' '), ...group.synonyms].map(normalise);
      this.terms.set(group.id, new Set(terms));
    }
  }

  get groups(): AllergyGroup[] {
    return [...this.byId.values()];
  }

  group(id: unknown): AllergyGroup | undefined {
    return this.byId.get(toS(id));
  }

  /** Groups whose synonyms, name or id equal the allergen text (case-insensitive, trimmed). [] when blank. */
  groupsForAllergen(text: unknown): AllergyGroup[] {
    const key = normalise(text);
    if (isBlank(key)) return [];
    return this.groups.filter((group) => this.terms.get(group.id)?.has(key));
  }
}
