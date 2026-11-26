# Data files

All files are UTF-8. CSV files follow RFC 4180 (comma separated, double-quoted fields where needed, a header
row, `\n` line endings). Some CSV columns hold a JSON value (an array or object) as text; these are noted below.
`data/version.json` lists every file with its source, record count, size and SHA-256.

Counts below are for data version 2026.11.26 (AccessEMR core commit `4ee29476`).

| File | Records | What |
| --- | ---: | --- |
| `icd10/icd10_codes.csv` | 46,504 | Diagnosis codes |
| `icd10/icd10_codes.json` | 46,504 | Same, as JSON |
| `medications/drugs.csv` | 5,482 | Drug list (name, brands, form, strength) |
| `medications/drugs.json` | 5,482 | Same, as JSON with aliases parsed |
| `medications/generics.json` | 2,516 | MedKB generics (the ids the safety rules use) |
| `medications/dose_defaults.json` | 818 | Reference doses |
| `labs/catalog_tests.csv` | 759 | Lab tests (566) and imaging studies (193) |
| `labs/catalog_analytes.csv` | 1,132 | Result fields of lab tests, with reference ranges |
| `labs/common.json` | 43 tests, 10 panels | Commonly ordered tests and default panels |
| `safety/rules.json` | 5,481 | Drug-safety rules |
| `safety/classes.json` | 133 | Drug classes used by the rules |
| `safety/allergy_groups.json` | 15 | Allergy groups (penicillins, sulfa, NSAIDs, ...) |
| `safety/version.json` | - | How the safety rules were built (counts before and after cleaning) |
| `version.json` | - | Data version, source commit, per-file counts and checksums |

---

## ICD-10: `icd10/icd10_codes.csv` and `.json`

The diagnosis code list AccessEMR uses for encounter diagnoses.

| Column | Meaning |
| --- | --- |
| `code` | The code with its dot, e.g. `A01.0`, `E11.9`, `S72.001`. Categories (3 characters, e.g. `A01`) are included as well as their subcodes. |
| `title` | Description, e.g. `Typhoid fever`. |
| `definition` | Optional notes: inclusion terms, "Excludes1/Excludes2" and "Code first" instructions, joined into one text. Empty for most codes. |

The JSON file has the same three fields per record (`definition` is `null` when empty).

Example: `A01.0,Typhoid fever,Infection due to Salmonella typhi`

**Which ICD-10 is it?** It is **ICD-10-CM** (the US clinical modification), not WHO ICD-10. It has CM-only codes
such as `Z68.41` (BMI 40.0–44.9, adult), `E11.A` (type 2 diabetes in remission, added in 2023), `J45.909` and
6–7 character codes (`S72.001`, `C44.1021`). It does **not** include the 7th-character encounter extensions
(`S72.001A`, `T36.0X1A` are absent; their parents `S72.001`, `T36.0X1` are present), the `U` chapter
(e.g. `U07.1` COVID-19) or the `O9A` and `Z3A` categories. If you need WHO ICD-10 codes for reporting, map the
first 3–4 characters (for most codes the category `A01`–`Z99` and the first subcode digit agree), but check codes
that differ between the two systems.

---

## Drug list: `medications/drugs.csv` and `.json`

The prescribable drug list AccessEMR ships to every clinic. One row per name + form + strength.

| Column | Meaning |
| --- | --- |
| `name` | Generic (or listed) name, e.g. `Artemether + Lumefantrine`. 2,166 distinct names. |
| `aliases` | JSON array (as text in the CSV) of brand names and other names this drug is sold or written as, mostly Nigerian brands from NAFDAC listings and pharmacy sites, e.g. `["AMATEM", "AMATEM FORTE", "Coatal", ...]`. 11,335 distinct aliases. Some aliases carry registration noise such as a trailing `_` or a note in brackets. |
| `common_shorthand` | Short form clinicians write (e.g. `PCM`), if any. Filled on 39 rows. |
| `form` | Tablet, Injection, Capsule, Syrup, Solution, Suspension, Cream, Drops, ... |
| `strength` | Free text as labelled: `500 mg`, `20 mg + 120 mg`, `100 mg (sulfate)/5 mL`. |

`drugs.json` has the same fields, with `aliases` as a real array and empty values as `null`.

Example:
```
Artemether + Lumefantrine,"[""AMATEM"", ""AMATEM FORTE"", ...]",,Capsule,20 mg + 120 mg
```

A drug as AccessEMR stores it is one **name + form** (3,160 of them) with the union of the aliases and a list of
strengths. The safety engine uses the list to turn a brand name into the generic name before matching
("Amatem Forte" → "Artemether + Lumefantrine").

## MedKB generics: `medications/generics.json`

The generic medicines the safety rules and reference doses refer to. A JSON array:

```json
{ "generic_id": "g:amoxicillin", "inn_name": "amoxicillin", "aliases": ["amoxycillin"],
  "high_alert": false, "controlled": false }
```

| Field | Meaning |
| --- | --- |
| `generic_id` | Stable id, `g:` + the INN in kebab case. Rules, classes and allergy groups use it. |
| `inn_name` | International non-proprietary name (lowercase). |
| `aliases` | Other spellings and names (lowercase). |
| `high_alert` | On a high-alert medicines list (165 generics), e.g. insulin, warfarin, opioids. Show extra caution. |
| `controlled` | A controlled substance (23 generics). |

The list comes from a machine-built knowledge base and contains a few near-duplicates and misspellings
(e.g. `g:ceflriaxone` beside `g:ceftriaxone`); they are kept because some product names map to them.

## Reference doses: `medications/dose_defaults.json`

Starting-point doses AccessEMR offers as a pre-fill when a doctor picks a drug. An object with
`generated_at`, `count`, `by_tier` and `rules` (818 entries):

```json
{ "id": "d:dcb2b8e7a78eb800", "generic_id": "g:acetylcystein", "population": "paediatric",
  "age_band": null, "indication": "Drug Treatment", "dose_value": 100.0, "dose_unit": "mg", "per_kg": true,
  "route": "Intravenous", "frequency": "over 16 hours", "max_single": null, "max_daily": null,
  "max_daily_unit": null, "origin": "guideline",
  "citation": { "doc": "NHIA Standard Treatment Guidelines and Referral Protocol (Jan 2026)", "page": 243,
                "quote": "...Give: 100mg/kg in 1 liter of 5% dextrose over 16 hours.", "url": "..." },
  "confidence": 0.9, "label": "guideline", "verification": { "tier": "guideline", ... } }
```

| Field | Meaning |
| --- | --- |
| `generic_id` | The generic (see generics.json). |
| `population` | `adult` (544) or `paediatric` (274). |
| `age_band` | Optional, e.g. `1-5 years`, `6-12 years`, `neonate`. |
| `indication` | What the dose is for. |
| `dose_value`, `dose_unit`, `per_kg` | The dose; `per_kg: true` means per kg body weight. |
| `route`, `frequency` | As written in the source (`Oral`, `once daily`, `8 hourly for 5 days`). |
| `max_single`, `max_daily`, `max_daily_unit` | Ceilings, when the source gives them. |
| `label` / `verification.tier` | `guideline` (671): taken from a cited guideline. `ai_suggested` / `ai_consensus` (147): AI-drafted and agreed by a second model, no guideline citation. |
| `citation` | Document, page, quote and link for guideline doses. |

AccessEMR does not pre-fill doses for high-alert or controlled generics, and treats all of these as suggestions the
prescriber confirms.

---

## Lab and imaging catalogue: `labs/catalog_tests.csv`

| Column | Meaning |
| --- | --- |
| `kind` | `lab` or `imaging`. |
| `code` | Stable id, `lab:...` or `img:...`, e.g. `lab:full-blood-count-fbc`. |
| `name` | Display name, e.g. `Full Blood Count (FBC)`. |
| `aliases` | JSON array (as text): other names clinics use (`FBC`, `CBC`, `Complete Blood Count`). |
| `category` | Haematology, Clinical Chemistry, Microbiology, Ultrasound, X-ray, ECG and Echo, ... |
| `specimen` | Specimen (lab) or body region (imaging), e.g. `blood`, `pregnancy`. |
| `loinc` | Reserved for a LOINC code; empty in this version. |

## Lab result fields: `labs/catalog_analytes.csv`

The fields a lab result has (e.g. FBC → WBC, Hb, platelets) with reference ranges. 562 of the 566 lab tests
have fields.

| Column | Meaning |
| --- | --- |
| `test_code` | The test (`catalog_tests.code`). |
| `code` | Field id within the test, e.g. `wbc`. |
| `name` | Display name, e.g. `WBC`. |
| `unit` | e.g. `x10^9/L`, `mmol/L`, `%`. |
| `value_type` | `numeric` (665), `choice` (302) or `text` (165). |
| `choices` | JSON array of allowed answers for `choice`, e.g. `["Detected", "Not Detected"]`. |
| `ranges` | JSON array of reference ranges: `{ "sex": "any"/"m"/"f", "age_min_days", "age_max_days", "low", "high", "text" }`. Use the first range whose sex and age match the patient. `low` or `high` may be `null` (one-sided). |
| `critical_low`, `critical_high` | Values that should be flagged as critical (call the clinician). |
| `tier` | Source of the range: `guideline` (659), `ai_consensus` (334, two AI models agreed), `draft` (139, needs review). |
| `sort` | Display order within the test. |

Example:
```
lab:full-blood-count-fbc,wbc,WBC,x10^9/L,numeric,[],"[{""sex"": ""any"", ""age_min_days"": null, ""age_max_days"": null, ""low"": 3.5, ""high"": 9.5, ""text"": null}]",2.0,30.0,guideline,1
```

Reference ranges vary by laboratory and method. Let the lab's own range on a result take precedence.

## Common tests and panels: `labs/common.json`

Converted from AccessEMR's `common.yml`. Draft clinical content (not yet clinician-reviewed).

```json
{ "version": 1,
  "common_tests": { "lab": ["lab:full-blood-count-fbc", "..."], "imaging": ["img:...", "..."] },
  "panels": [ { "key": "fever_workup", "name": "Fever workup", "kind": "lab",
                "indication": "Acute fever without an obvious focus",
                "codes": ["lab:full-blood-count-fbc", "lab:malaria-parasite-mp", "..."] } ] }
```

- `common_tests`: the 35 lab and 8 imaging tests Nigerian clinics order most, in display order (good for a
  "common" shortlist above the search box).
- `panels`: 10 default order sets (fever workup, neonatal sepsis, sickle cell crisis, antenatal booking, pre-op,
  diabetes review, hypertension review, diarrhoea/dehydration, UTI, neonatal jaundice). Every code exists in
  `catalog_tests.csv`.

---

## Drug-safety rules: `safety/rules.json`

```json
{ "kb_version": "202610120316", "curated_version": 1, "rules": [ ... ] }
```

Each rule:

```json
{ "rule_id": "ix:21f99a854b309b8b", "kind": "interaction",
  "subject": { "kind": "generic", "id": "g:warfarin" },
  "object":  { "kind": "generic", "id": "g:ibuprofen" },
  "severity": "serious", "level": "alert",
  "effect": "...", "action": "...",
  "evidence": { "quote": "...", "source_kind": "fda_label", "set_id": "<DailyMed set id>",
                "section": "drug_interactions" } }
```

| Field | Meaning |
| --- | --- |
| `rule_id` | Stable id. `ix:` interaction, `pg:` pregnancy, `xr:` allergy cross-reaction. |
| `kind` | `interaction` (4,970), `pregnancy` (459) or `allergy_xr` (52). |
| `subject`, `object` | `{ kind, id }`: a generic (`g:...`), a class (`c:...`, see classes.json) or, for `allergy_xr`, an allergy group id. `object` is `null` for pregnancy rules. Interactions apply in both directions. |
| `severity` | `serious`, `moderate` or `minor`. |
| `level` | `alert` (interrupt the prescriber) or `notice` (show quietly). Serious rules that a second review judged less certain were downgraded to `notice`, so use `level`, not `severity`, to decide how to show a rule. |
| `effect` | What can happen, in plain words. |
| `action` | What to do (monitor, adjust dose, avoid). |
| `evidence.quote` | The sentence from the source the rule is based on. |
| `evidence.source_kind` | `fda_label` (5,473) or `onc_list` (8, the ONC high-priority interaction list). |
| `evidence.set_id` | DailyMed SPL set id: the label is at `https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=<set_id>`. |
| `evidence.section` | Label section: `drug_interactions`, `contraindications`, `boxed_warning`, `pregnancy`, ... |

Counts by kind, level and severity: interaction alert/serious 927, notice/moderate 3,647, notice/minor 396;
pregnancy alert/serious 125, notice/moderate 334; allergy_xr alert/serious 16, alert/moderate 3, notice/moderate 33.

## Drug classes: `safety/classes.json`

```json
{ "class_id": "c:manual:nsaids", "name": "NSAIDs", "members": ["g:ibuprofen", "g:diclofenac", "..."] }
```

A rule whose subject or object is a class applies to every member. Prefixes: `c:epc:` (FDA established
pharmacologic class, 56), `c:manual:` (hand-built, 40), `c:moa:` (mechanism of action, 18), `c:cyp:` (CYP enzyme
inhibitors/inducers, 11), `c:allergy:` (8).

## Allergy groups: `safety/allergy_groups.json`

Converted from AccessEMR's `allergy_groups.yml`. Maps the free text a patient's allergy record may contain to
drugs.

```json
{ "id": "penicillins", "name": "Penicillins",
  "synonyms": ["penicillin", "pen", "pcn", "amoxil", "augmentin", "..."],
  "generics": ["g:amoxicillin", "g:ampicillin", "..."], "classes": [],
  "text": "Patient is allergic to penicillins and this drug is a penicillin.",
  "cross": [ { "group": "cephalosporins", "severity": "serious", "text": "Cross-reactivity with cephalosporins is uncommon (about 1–2%) ..." } ] }
```

The 15 groups: penicillins, cephalosporins, carbapenems, sulfonamide antibiotics, NSAIDs, aspirin/salicylates,
opioids, aminoglycosides, macrolides, fluoroquinolones, tetracyclines, benzodiazepines, ACE inhibitors, aromatic
anticonvulsants, iodinated contrast. An allergen matches a group when, lowercased and trimmed, it equals the
group's name, id or one of its synonyms. `cross` lists cross-reacting groups.

## `safety/version.json` and `version.json`

`safety/version.json` records how the curated rules were built: the knowledge-base version, counts before and
after cleaning, and the second-review outcome (1,071 alert rules kept, 468 downgraded to notices, 176 dropped).

`version.json` (top level) records `data_version`, `build_date`, the AccessEMR source commit, upstream dataset
versions and, per file, `records`, `bytes` and `sha256`. Check it to see which data you have.

---

## Importing into a SQL database

The CSV files load directly. PostgreSQL example (other databases are similar; JSON-in-CSV columns go into a JSON
or text column):

```sql
CREATE TABLE icd10_codes (code text PRIMARY KEY, title text NOT NULL, definition text);
\copy icd10_codes FROM 'data/icd10/icd10_codes.csv' WITH (FORMAT csv, HEADER true)

CREATE TABLE drugs (id serial PRIMARY KEY, name text NOT NULL, aliases jsonb, common_shorthand text,
                    form text, strength text);
\copy drugs (name, aliases, common_shorthand, form, strength) FROM 'data/medications/drugs.csv' WITH (FORMAT csv, HEADER true)
CREATE INDEX ON drugs (lower(name));

CREATE TABLE lab_tests (kind text, code text PRIMARY KEY, name text, aliases jsonb, category text,
                        specimen text, loinc text);
\copy lab_tests FROM 'data/labs/catalog_tests.csv' WITH (FORMAT csv, HEADER true)

CREATE TABLE lab_analytes (test_code text REFERENCES lab_tests(code), code text, name text, unit text,
                           value_type text, choices jsonb, ranges jsonb, critical_low numeric,
                           critical_high numeric, tier text, sort int, PRIMARY KEY (test_code, code));
\copy lab_analytes FROM 'data/labs/catalog_analytes.csv' WITH (FORMAT csv, HEADER true)
```

JSON files (generics, rules, classes): load with your language, or in PostgreSQL:

```sql
CREATE TABLE drug_safety_rules (rule_id text PRIMARY KEY, kind text, subject_kind text, subject_id text,
  object_kind text, object_id text, severity text, level text, effect text, action text, quote text,
  source_kind text, set_id text, section text);

-- with the file contents in a psql variable: \set rules `cat data/safety/rules.json`
INSERT INTO drug_safety_rules
SELECT r->>'rule_id', r->>'kind', r->'subject'->>'kind', r->'subject'->>'id', r->'object'->>'kind',
       r->'object'->>'id', r->>'severity', r->>'level', r->>'effect', r->>'action',
       r->'evidence'->>'quote', r->'evidence'->>'source_kind', r->'evidence'->>'set_id', r->'evidence'->>'section'
FROM jsonb_array_elements((:'rules')::jsonb->'rules') AS r;
CREATE INDEX ON drug_safety_rules (subject_id);
CREATE INDEX ON drug_safety_rules (object_id);
```

Keep the codes and ids (`code`, `generic_id`, `rule_id`, `class_id`) as your keys: they stay the same across
updates, so you can upsert new versions.
