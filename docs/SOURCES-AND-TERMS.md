# Sources and terms

## Where each dataset comes from

| Dataset | Source | Notes |
| --- | --- | --- |
| ICD-10 codes (`icd10/`) | The ICD-10 code table as used in AccessEMR, exported from AccessEMR's staging database. | The content is ICD-10-CM (the US clinical modification, published by the US CDC/NCHS; public domain), without the 7th-character encounter extensions. See DATA.md. |
| Drug list (`medications/drugs.*`) | AccessEMR's shared medicines list. Generic names, forms and strengths from the MedKB knowledge base; brand aliases partly from NAFDAC registration listings and Nigerian online pharmacy sites. | Brand lists are incomplete and contain some registration noise. A brand that is missing means the engine may not recognise that name. |
| MedKB generics (`medications/generics.json`) | The MedKB knowledge base built by the AccessEMR team from public drug references. | High-alert and controlled flags as recorded in MedKB. |
| Reference doses (`medications/dose_defaults.json`) | MedKB. 671 entries quote a Nigerian guideline (Nigeria Standard Treatment Guidelines 3rd ed. 2022: 437; NHIA Standard Treatment Guidelines and Referral Protocol, Jan 2026: 234), with document, page and quote; 147 are AI-drafted and agreed by a second AI model. | Suggestions only. AccessEMR does not pre-fill doses for high-alert or controlled drugs. |
| Lab and imaging catalogue, result fields, common tests and panels (`labs/`) | LabKB, built by the AccessEMR team from the tests Nigerian clinics order, with reference ranges from guidelines (659 fields) or agreed by two AI models (334), and 139 drafts. Common tests and panels are draft clinical content. | Reference ranges depend on the lab and method; the lab's own range takes precedence. |
| Drug-safety rules and classes (`safety/rules.json`, `classes.json`) | The MedKB drug-interaction knowledge base (version 202610120316), extracted from US FDA drug labels published on DailyMed and from the ONC high-priority drug–drug interaction list. Both sources are US government works in the public domain. Every rule carries the quote it was extracted from and the DailyMed set id. | Cleaned by script, then every rule that would raise an alert was reviewed again by a second AI model (keep / drop / downgrade); 1,071 alert rules were kept, 468 downgraded to notices and 176 dropped. |
| Procedures library (`procedures/`) | Written for AccessEMR by AI models from standard clinical practice, guided by a master list the AccessEMR team drew up for Nigerian clinics (all specialties, nursing to theatre). Every entry was checked by a validator (required fields, form format, no drug doses) and then reviewed by a second, independent AI model: 873 kept as written, 142 corrected, none dropped. | **Draft:** clinical sign-off by our clinical lead is pending, and some decisions are still open (consent level for some procedures, which specialty some operations belong in, whether to keep a few entries). Codes stay the same when entries are corrected. Guides name drugs but give no doses. |
| Allergy groups (`safety/allergy_groups.json`) | Hand-built by the AccessEMR team (with AI assistance): group names, common synonyms and Nigerian brand names, member drugs and cross-reactions. | The penicillin–cephalosporin/carbapenem texts carry approximate percentages; others are plain. |

## How it was reviewed

The data was assembled and curated with AI assistance (automated extraction, cleaning scripts and a second-pass
review by a different AI model). **It has not been reviewed by a clinician.** We use it in AccessEMR as decision
support and keep improving it as clinicians report problems.

FDA labels describe US products and US practice. Some Nigerian products, combinations and local brands may not be
covered, and some interactions in the labels may be more or less relevant in local practice.

## Clinical disclaimer

The safety engine and data are **decision support only**. They do not replace clinical judgement, a pharmacist's
review or the product information. An empty result does not mean a combination is safe: the engine only knows
the rules in this data, and it cannot check a drug name it does not recognise. The prescriber is responsible for
every prescribing decision.

The procedures guides are short reminders for trained staff, not training material or a substitute for local
protocols; the record forms are what to document, not a checklist that makes a procedure safe.

Show alerts as warnings from the data source ("Source: FDA label"), not as advice from a named clinician or
organisation.

## Terms of use

- This package is shared by AccessPHS for use **within the AccessPHS team's telemedicine app**.
- Please do not redistribute it, publish it, or pass it to third parties. If you would like to use it elsewhere,
  ask us first.
- The public-domain sources it draws on (FDA labels, the ONC list, ICD-10-CM) remain free for anyone to use from
  their original publishers; the restriction above covers our compilation, curation, brand lists, allergy groups,
  lab catalogue, procedures library and code.
- It comes as is, without warranty. Please tell us about errors you find so we can fix them for both apps.
