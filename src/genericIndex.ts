// Port of Medkb::GenericIndex / Medkb::GenericMatch: which MedKB generic a drug name refers to.
// First hit wins: exact INN, alias (brand), INN without a trailing salt word, then the longest INN (4+ characters)
// equal to the first 1–3 words. Combination names ("x/y", "x + y", "x and y") only match exactly (INN or alias).
import { isCombination, normalise, withoutSalt } from './name.js';
import type { GenericRecord } from './types.js';
import { isBlank, uniq } from './text.js';

export interface IndexedGeneric {
  generic_id: string;
  /** Normalised INN, as AccessEMR stores it (Medkb::Importer). */
  inn_name: string;
  aliases: string[];
  /** Position in generics.json (AccessEMR's database id order), used for tie-breaks. */
  position: number;
}

export class GenericIndex {
  private readonly byInn = new Map<string, IndexedGeneric>();
  private readonly byAlias = new Map<string, IndexedGeneric>();
  private readonly memo = new Map<string, IndexedGeneric | null>();
  readonly generics: IndexedGeneric[];

  constructor(records: readonly GenericRecord[]) {
    this.generics = records.map((record, position) => ({
      generic_id: String(record.generic_id),
      inn_name: normalise(record.inn_name),
      aliases: uniq((record.aliases ?? []).map((item) => normalise(item)).filter((item) => !isBlank(item))),
      position,
    }));
    for (const generic of this.generics) {
      if (!this.byInn.has(generic.inn_name)) this.byInn.set(generic.inn_name, generic);
      for (const aka of generic.aliases) if (!this.byAlias.has(aka)) this.byAlias.set(aka, generic);
    }
  }

  match(drugName: unknown): IndexedGeneric | null {
    const key = String(drugName ?? '');
    const hit = this.memo.get(key);
    if (hit !== undefined) return hit;
    const found = this.lookup(key);
    if (this.memo.size > 50_000) this.memo.clear();
    this.memo.set(key, found);
    return found;
  }

  private lookup(drugName: string): IndexedGeneric | null {
    const name = normalise(drugName);
    if (isBlank(name)) return null;

    const exact = this.byInn.get(name) ?? this.byAlias.get(name);
    if (exact || isCombination(drugName)) return exact ?? null;

    return this.byInn.get(withoutSalt(name)) ?? this.byLeadingWords(name);
  }

  private byLeadingWords(name: string): IndexedGeneric | null {
    const words = name.split(' ').filter((word) => word !== '');
    let best: IndexedGeneric | null = null;
    for (let count = 1; count <= Math.min(words.length, 3); count += 1) {
      const prefix = words.slice(0, count).join(' ');
      if (prefix.length < 4) continue;
      const generic = this.byInn.get(prefix);
      if (!generic) continue;
      if (
        !best ||
        generic.inn_name.length > best.inn_name.length ||
        (generic.inn_name.length === best.inn_name.length && generic.position < best.position)
      ) {
        best = generic;
      }
    }
    return best;
  }
}
