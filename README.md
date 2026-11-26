# AccessEMR reference data and drug-safety engine

`@accessphs/accessemr-reference` is a hand-over package from the AccessEMR team. It contains:

1. **Reference data** (`data/`), in plain CSV and JSON so you can use it from any language:
   - the ICD-10 diagnosis code list used in AccessEMR (46,504 codes)
   - the drug list (5,482 rows: generic name, Nigerian brand names, form, strength)
   - MedKB generics (2,516, with high-alert and controlled flags) and reference doses (818)
   - the lab and imaging catalogue (759 tests, 1,132 result fields with reference ranges), the common tests and
     the default lab panels
   - the drug-safety rules: 5,481 rules (interactions, pregnancy, allergy cross-reactions), 133 drug classes and
     15 allergy groups
2. **A drug-safety engine** (`src/`, built to `dist/`): a TypeScript port of the check AccessEMR runs when a
   doctor prescribes. Give it the drugs being prescribed, the patient's current medicines, drug allergies and
   pregnancy status; it returns **alerts** (serious, should interrupt) and **notices** (quieter). It has no
   runtime dependencies and runs in Node, browsers and React Native. It runs entirely on your device or server:
   **no patient data is sent anywhere**.
3. **Search helpers** for the ICD-10 list and the drug list (prefix and substring, brand names included).

The engine is tested against AccessEMR's own Ruby engine: 51 golden cases give identical output
(`tests/parity/`).

> Clinical decision support only. The prescriber stays responsible for every prescribing decision. The data
> was curated with AI assistance and has not been reviewed by a clinician. See
> [docs/SOURCES-AND-TERMS.md](docs/SOURCES-AND-TERMS.md).

## What's where

| Path | What |
| --- | --- |
| `data/` | The datasets. `data/version.json` lists every file with its source, record count and SHA-256. |
| `dist/` | The compiled engine (ESM in `dist/esm`, CommonJS in `dist/cjs`, type definitions `.d.ts`). |
| `src/` | TypeScript source of the engine. |
| `docs/DATA.md` | Every data file: fields, meaning, counts, examples, SQL import. |
| `docs/SAFETY-ENGINE.md` | How the checks work, inputs and outputs, how to show alerts to prescribers. |
| `docs/UPDATES.md` | Versioning and how updates are shipped and rebuilt. |
| `docs/SOURCES-AND-TERMS.md` | Where each dataset comes from, limitations, terms of use. |
| `scripts/build-data.mjs` | Rebuilds `data/` from an AccessEMR core checkout (our side). |
| `tests/` | Unit tests and the parity suite. `tools/parity/` regenerates the parity expectations. |

## Install

The package is not published to npm. Install it from the tarball we sent you:

```bash
npm install ./accessphs-accessemr-reference-1.0.0.tgz
```

Or unzip the source archive, run `npm install && npm run build`, and install from the folder.

## Quick start: Node / TypeScript

```ts
import { defaultEngine } from '@accessphs/accessemr-reference/node';

const engine = defaultEngine(); // reads the bundled data/ files once, then reuses the engine

const result = engine.check({
  drugs: [{ name: 'Rifampicin', strength: '600 mg' }],        // what is being prescribed now
  currentMeds: [{ name: 'Amatem Forte' }, { name: 'Warfarin' }], // what the patient already takes
  allergies: [{ allergen: 'PCN', category: 'Drug' }],
  pregnant: false,
});

for (const alert of result.alerts) {
  console.log(`${alert.drug} + ${alert.other}: ${alert.effect} (${alert.evidence.source})`);
}
// Rifampicin + Amatem Forte: decreased concentrations of artemether and/or lumefantrine ... (FDA label)
// result.notices → Rifampicin + Warfarin (moderate interaction)
```

Other helpers from the `/node` entry point:

```ts
import {
  loadDefaultData, // the parsed files the engine needs: { generics, drugs, rules, classes, allergyGroups }
  loadIcd10,       // data/icd10/icd10_codes.json as an array
  searchIcd10,     // searchIcd10('malaria', 10), searchIcd10('B50.9'), searchIcd10('b509')
  searchDrugs,     // searchDrugs('amatem', 10) → Artemether + Lumefantrine (matched alias "AMATEM")
} from '@accessphs/accessemr-reference/node';

engine.resolve('Augmentin');  // → ['g:amoxicillin', 'g:clavulanic-acid'] (MedKB generic ids)
```

CommonJS works too: `const { defaultEngine } = require('@accessphs/accessemr-reference/node');`

## Browser and React Native

The main entry point (`@accessphs/accessemr-reference`) never touches the file system. Import the JSON files
and pass them in:

```ts
import { createSafetyEngine, createSearch } from '@accessphs/accessemr-reference';
import generics from '@accessphs/accessemr-reference/data/medications/generics.json';
import drugs from '@accessphs/accessemr-reference/data/medications/drugs.json';
import rules from '@accessphs/accessemr-reference/data/safety/rules.json';
import classes from '@accessphs/accessemr-reference/data/safety/classes.json';
import allergyGroups from '@accessphs/accessemr-reference/data/safety/allergy_groups.json';
import icd10 from '@accessphs/accessemr-reference/data/icd10/icd10_codes.json';

const engine = createSafetyEngine({ generics, drugs, rules, classes, allergyGroups });
const search = createSearch({ icd10, drugs });

engine.check({ drugs: [{ name: 'Amoxicillin' }], allergies: [{ allergen: 'Penicillin' }] });
search.searchIcd10('typhoid', 10);
```

Notes:
- The safety files together are about 6.2 MB of JSON (about 0.9 MB gzipped); the ICD-10 JSON is another 5.9 MB
  (0.7 MB gzipped). In a
  web app, consider loading them with `fetch()` (or a dynamic `import()`) after first paint, and caching them.
  In React Native, Metro bundles imported JSON into the app; if app size matters, download the files on first run
  and keep them in local storage, then call `createSafetyEngine` with the parsed objects.
- Create the engine once and reuse it. Building it indexes the data (about 35 ms on a desktop in Node; expect
  several times that on a low-end phone). Each `check()` then takes well under a millisecond on a desktop.
- The regular expressions use lookahead only and no Unicode property escapes, so they run on Hermes.
- TypeScript: enable `resolveJsonModule` to import the JSON files.

## Python and other languages

You do not need the JavaScript engine to use the data. Everything in `data/` is plain CSV or JSON (UTF-8):
load it with your language's standard CSV/JSON tools, or import it into your database (see
[docs/DATA.md](docs/DATA.md) for the fields and a PostgreSQL import example).

To run the safety check outside JavaScript you have two options:
- Port the logic. [docs/SAFETY-ENGINE.md](docs/SAFETY-ENGINE.md) describes every step, and the parity cases
  (`tests/parity/cases.json` inputs, `tests/parity/expected.json` outputs) let you test a port against our
  engine.
- Run this package in a small Node service next to your app.

## Development

```bash
npm install          # dev tools only: TypeScript and Node type definitions
npm test             # builds dist/ and runs all tests (unit, CommonJS, parity, data rebuild check)
npm run typecheck
npm run check:data   # confirms data/ matches a fresh build from ../access-emr-core-safety
```

Node 18 or newer. The package has no runtime dependencies.
