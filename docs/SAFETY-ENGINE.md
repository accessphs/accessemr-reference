# The drug-safety engine

The engine checks the drugs a prescriber is about to order against:

- the patient's **current medicines** and the other drugs in the same order (drug–drug interactions)
- **pregnancy**, when the patient is pregnant
- the patient's recorded **drug allergies**, including cross-reacting drug groups

It is a faithful TypeScript port of the check AccessEMR runs on every prescription (Ruby `Medkb::SafetyCheck`).
The parity suite (`tests/parity/`) runs 53 cases through both and requires identical output.

**It runs locally.** The engine is a pure function over the data files you load. It makes no network calls,
so patient data (medicines, allergies, pregnancy) never leaves your app.

## Using it

```ts
import { createSafetyEngine } from '@accessphs/accessemr-reference';
const engine = createSafetyEngine({ generics, drugs, rules, classes, allergyGroups }); // once, then reuse

const { alerts, notices } = engine.check({
  drugs:       [{ name: 'Ciprofloxacin', strength: '500 mg' }], // being prescribed now
  currentMeds: [{ name: 'Warfarin' }, { name: 'Artemether/Lumefantrine' }],
  allergies:   [{ allergen: 'Penicillin', category: 'Drug' }],
  pregnant:    true,
});
```

In Node, `defaultEngine()` from `@accessphs/accessemr-reference/node` loads the bundled files for you.

### Inputs

| Field | Meaning |
| --- | --- |
| `drugs` | The drugs being prescribed: `{ name, strength? }`. `name` is whatever the prescriber picked or typed: a generic (`Amoxicillin 500mg Capsule`), a brand (`Amatem Forte`), or a combination (`Artemether/Lumefantrine`). `strength` is optional; for combinations it can carry the ingredient names (`artemether 20 mg / lumefantrine 120 mg`). Entries with a blank name are ignored. |
| `currentMeds` | What the patient takes now: active prescriptions and home medicines that have not ended. Leave out stopped and completed medicines, and leave out the order you are editing (so it is not compared with itself). |
| `allergies` | `{ allergen, category? }`. Only drug allergies are checked: omit `category` or pass `"Drug"` (any case); other categories (food, environment, ...) are ignored. `allergen` is the free text as recorded (`PCN`, `sulfa`, `Augmentin`). |
| `pregnant` | `true` only when the patient is currently pregnant (AccessEMR uses an active or in-labour pregnancy episode). |

The display names you pass are used as-is (trimmed) in the output, so show the result next to your own order
lines.

### Output: `{ alerts, notices }`

Both are lists of **items** (AccessEMR contract C2):

```json
{
  "rule_id": "ix:f5acaecd24e3c6c5",
  "kind": "interaction",
  "severity": "serious",
  "level": "alert",
  "drug": "Rifampicin",
  "other": "Amatem Forte",
  "effect": "decreased concentrations of artemether and/or lumefantrine and loss of antimalarial efficacy",
  "action": "avoid coadministration with strong CYP3A4 inducers",
  "evidence": {
    "quote": "Coadministration of strong inducers of CYP3A4 such as rifampin ... with Coartem Tablets can result in ...",
    "source": "FDA label",
    "set_id": "7866ec19-dfac-47d4-a53f-511a12643cbf",
    "section": "contraindications"
  }
}
```

| Field | Meaning |
| --- | --- |
| `rule_id` | Which rule fired. `ix:...` interaction, `pg:...` pregnancy, `xr:...` KB allergy cross-reaction, `ag:<group>` allergy-group membership, `ag:<group>:<other group>` group cross-reaction, `ag:direct` the allergen is the same generic, `ag:exact` the drug name equals the allergen text. Stable across data updates; use it to log and to remember overrides. |
| `kind` | `interaction`, `pregnancy` or `allergy`. |
| `severity` | `serious`, `moderate` or `minor`: how bad the outcome can be. |
| `level` | `alert` or `notice`: how to present it (see below). |
| `drug` | The prescribed drug, as you passed it. |
| `other` | The other side: the other drug's name as passed, the allergen as recorded, or the literal `"Pregnancy"`. |
| `effect` | What can happen. For allergy-group items, the group's text. |
| `action` | What to do. |
| `evidence.quote` | The sentence from the source label (null for allergy-group items). |
| `evidence.source` | `FDA label`, `ONC high-priority list` or `Allergy group (AccessEMR)`. |
| `evidence.set_id` | DailyMed set id of the label (link: `https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=<set_id>`). |
| `evidence.section` | Label section the quote is from. |

### Severity and level

- **`level: "alert"`** means: interrupt. Serious interactions, pregnancy "avoid"/"contraindicated" entries and
  every allergy-group, direct or exact-name allergy match are alerts (unless the second review downgraded the
  rule).
- **`level: "notice"`** means: show quietly. Moderate and minor interactions, interactions with alcohol, pregnancy
  cautions, most KB allergy cross-reaction rules, and rules the second review downgraded.
- Decide the presentation by `level`, not by `severity`. A notice can have `severity: "serious"` in principle;
  the data has none today.

## How the check works

1. **Resolve each drug name to MedKB generic ids.** For each drug, these names are tried whole, in order:
   the name as given, then the drug-list entry (`drugs.json`) whose name or brand alias equals it
   (case-insensitive; a name match beats an alias match, and the first entry in the file wins).
   Each name is matched against the generics:
   1. normalise: lowercase; remove text in brackets, strengths (`500 mg`, `250mg/5ml`) and form words (tablet, cap,
      syrup, injection, ...); `-` and `_` become spaces
   2. exact INN, then an alias (e.g. `amoxycillin`)
   3. the INN without a trailing salt word (`metformin hydrochloride` → `metformin`)
   4. the longest INN of 4+ characters equal to the first 1–3 words (`warfarin sodium tabs` → `warfarin`)

   Combination names (containing `/`, `+` or the word `and`) only match exactly at step 2. If no whole name
   matches, the names and the strength text are split on `/`, `+`, `&`, `,` and `and`, doses are removed, and each
   part of 3+ letters is matched on its own (`Artemether/Lumefantrine` → `g:artemether`, `g:lumefantrine`).
   A drug that resolves to nothing is skipped silently (except for the exact-name allergy check).
2. **Add classes.** Each generic's classes (`classes.json`) are added, so a rule about "NSAIDs" applies to
   ibuprofen.
3. **Interactions.** Each prescribed drug is compared with every current medicine and with every prescribed drug
   after it in the list (never with itself). A rule matches when its subject is on one side and its object on the
   other, in either direction.
4. **Pregnancy.** Only when `pregnant` is true: pregnancy rules whose subject is one of the prescribed drug's
   generics or classes.
5. **Allergies.** For each drug allergy (duplicates removed), and each prescribed drug, the first of these that
   finds something is used:
   1. **Allergy groups.** The allergen text (lowercased, trimmed) is looked up in the groups' names, ids and
      synonyms (`PCN` → penicillins). If the drug belongs to the group (one of its generics or classes), you get
      `ag:<group>` (serious alert). For each cross-reacting group the drug belongs to, you get
      `ag:<group>:<target>` with the link's severity and text (e.g. penicillin allergy → ceftriaxone).
   2. **KB cross-reaction rules** (`allergy_xr`) for the matched groups, at the rule's own level (often a notice).
   3. **Direct match**: the allergen itself resolves to one of the drug's generics → `ag:direct`
      (allergy "warfarin", drug "Warfarin 5mg").
   4. **Exact name**: the drug name equals the allergen text (ignoring case) → `ag:exact`.
6. **Reduce and sort.**
   - Keep one item per (kind, drug, other): an alert before a notice, then the more severe, then the first found.
     A combination order therefore gives one interaction item, not one per ingredient.
   - Drop a notice when the same (drug, other) pair already has an alert.
   - Sort by severity (serious first), then kind (allergy, interaction, pregnancy).
   - Split into `alerts` and `notices`.

Other helpers: `engine.resolve(name, strength?)` returns the generic ids step 1 finds (useful for debugging a
name that does not alert); `engine.searchDrugs(query, limit)` searches the drug list; `engine.info` gives the data
versions loaded.

### What it does not check

Doses, kidney or liver function, breastfeeding, disease contraindications (e.g. NSAIDs in peptic ulcer), food
interactions, duplicate therapy, and age. A drug name the engine cannot resolve is not checked for interactions;
it may be worth showing "not checked" for unresolved names (`engine.resolve(name)` returns `[]`).

## Presenting results to prescribers

This is how AccessEMR presents them; we recommend the same.

**Alerts interrupt.**
- Check as the prescriber picks a drug or changes the strength (debounced), and show alerts as a red block above
  the Save button: "2 safety alerts".
- On Save, if there are alerts, open a confirmation dialog listing each alert. Buttons: "Change order" and
  "Continue anyway".
- "Continue anyway" stays disabled until the prescriber picks a reason (radio buttons, not a dropdown):
  - Benefit outweighs risk (`benefit_outweighs_risk`)
  - Will monitor / adjust dose (`will_monitor`)
  - Patient has tolerated this before (`tolerated_before`)
  - Other: a free-text note is required (`other`; AccessEMR limits the note to 200 characters)
- Record the override for audit: who, when, the reason and note, and a copy of the alerts shown.
- Re-run the check on save (the patient's medicines may have changed since the form opened).

**Notices are quiet.** Show them as a collapsed grey line ("Interactions (3)") that expands; no confirmation is
needed.

**Each card shows:**
- `drug` ↔ `other` (for pregnancy, "Pregnancy"; for allergies, "Allergy: <allergen>")
- `effect`
- `action` ("What to do")
- the `evidence.quote` in quotation marks, and "Source: FDA label" (from `evidence.source`), with a link to the
  DailyMed label when `set_id` is present

Do not word alerts as if a clinician reviewed them: the rules were curated with AI assistance (see
SOURCES-AND-TERMS.md). The prescriber makes the decision.

## Performance

Create the engine once and reuse it. In Node on a desktop, loading the files takes about 35 ms and building the
engine about 35 ms; a check for a patient on several medicines takes about 0.3 ms. The engine keeps no state
between checks except a cache of name lookups.

## Porting to another language

Follow the steps above. The details that matter for identical results:
- rules are considered in file order, and "first found" in step 6 means that order (current medicines first, then
  later prescribed drugs, then rules within each pair);
- the generics index keeps the first generic in file order for a duplicated INN or alias;
- the drug list lookup groups rows by name + form, keeps the first entry in file order, and prefers a name match
  over an alias match.

`src/engine.ts`, `src/name.ts` and `src/genericIndex.ts` are short and commented. Test your port with
`tests/parity/cases.json` (inputs) and `tests/parity/expected.json` (outputs from AccessEMR's engine).
