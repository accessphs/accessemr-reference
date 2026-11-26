# Writes tests/parity/cases.json: the golden parity cases (inputs only). Expected outputs come from the real
# AccessEMR Ruby engine via tools/parity/parity.rb.
#   python tools/parity/make_cases.py
import json
import os

def D(name, strength=None):
    return {'name': name, 'strength': strength} if strength else {'name': name}

def A(allergen, category='Drug'):
    return {'allergen': allergen, 'category': category}

CASES = [
    ('warfarin_ibuprofen', 'Serious interaction, generic pair', [D('Ibuprofen')], [D('Warfarin')], [], False),
    ('warfarin_nsaid_class', 'NSAID class partner of warfarin (diclofenac)', [D('Diclofenac')], [D('Warfarin')], [], False),
    ('warfarin_naproxen_class', 'Another NSAID against warfarin', [D('Naproxen 500mg')], [D('Warfarin 5mg')], [], False),
    ('rifampicin_combination_plus', 'Rifampicin + combination order "Artemether + Lumefantrine"', [D('Rifampicin')], [D('Artemether + Lumefantrine')], [], False),
    ('rifampicin_combination_slash', 'Combination order with slash and strength', [D('Rifampicin')], [D('Artemether/Lumefantrine', '80mg/480mg')], [], False),
    ('amatem_forte_brand', 'Brand alias from drugs.csv resolves to the combination', [D('Amatem Forte')], [D('Rifampicin 600mg')], [], False),
    ('coartem_strength_split', 'Unknown brand, ingredients in the strength text', [D('Coartem', 'artemether 20mg / lumefantrine 120mg')], [D('Rifampicin')], [], False),
    ('penicillin_amoxicillin', 'Penicillin allergy blocks amoxicillin', [D('Amoxicillin')], [], [A('Penicillin')], False),
    ('pcn_amoxicillin', '"PCN" synonym', [D('Amoxicillin 500mg Capsule')], [], [A('PCN')], False),
    ('penicillin_ceftriaxone_cross', 'Penicillin allergy, cephalosporin cross-reaction', [D('Ceftriaxone')], [], [A('Penicillin')], False),
    ('penicillin_meropenem_cross', 'Penicillin allergy, carbapenem cross-reaction', [D('Meropenem')], [], [A('penicillins')], False),
    ('cephalosporin_amoxicillin_cross', 'Cephalosporin allergy, penicillin cross-reaction', [D('Amoxicillin')], [], [A('Cephalosporins')], False),
    ('augmentin_penicillin', 'Brand Augmentin with penicillin allergy', [D('Augmentin')], [], [A('Penicillin')], False),
    ('sulfa_cotrimoxazole', 'Sulfa allergy blocks co-trimoxazole', [D('Co-trimoxazole')], [], [A('Sulfa')], False),
    ('sulpha_septrin', '"sulpha" spelling + brand Septrin', [D('Septrin')], [], [A('sulpha')], False),
    ('sulfa_glimepiride_kb', 'Sulfa allergy, KB allergy_xr rule (no group membership)', [D('Glimepiride')], [], [A('Sulfa')], False),
    ('aspirin_allergy_ibuprofen', 'Aspirin allergy and an NSAID', [D('Ibuprofen')], [], [A('Aspirin')], False),
    ('nsaid_allergy_aspirin', 'NSAID allergy and aspirin', [D('Aspirin')], [], [A('NSAIDs')], False),
    ('aspirin_ibuprofen_interaction', 'Aspirin with an NSAID currently taken', [D('Aspirin 75mg')], [D('Ibuprofen')], [], False),
    ('misoprostol_pregnant', 'Pregnancy contraindicated drug, pregnant', [D('Misoprostol')], [], [], True),
    ('misoprostol_not_pregnant', 'Same drug, not pregnant', [D('Misoprostol')], [], [], False),
    ('isotretinoin_pregnant', 'Pregnancy alert', [D('Isotretinoin 20mg')], [], [], True),
    ('efavirenz_pregnant_notice', 'Pregnancy rule downgraded to a notice', [D('Efavirenz')], [], [], True),
    ('paracetamol_pregnant_notice', 'Pregnancy notice for paracetamol', [D('Paracetamol')], [], [], True),
    ('metformin_alcohol', 'Alcohol interaction notice', [D('Metformin Hydrochloride 500mg Tablet')], [D('Alcohol')], [], False),
    ('fluconazole_warfarin_moderate', 'Moderate pair gives a notice', [D('Fluconazole')], [D('Warfarin')], [], False),
    ('unknown_drug', 'Unresolvable drug gives nothing', [D('Mystery tonic')], [D('Warfarin')], [], False),
    ('exact_allergy_name', 'Legacy exact-name allergy match', [D('Mystery tonic')], [], [A('Mystery tonic')], False),
    ('direct_allergy_generic', 'Direct generic match of the allergen', [D('Warfarin 5mg')], [], [A('warfarin')], False),
    ('duplicate_current_orders', 'Two current orders with the same name collapse', [D('Ibuprofen')], [D('Warfarin'), D('Warfarin')], [], False),
    ('two_candidates', 'Interaction between two drugs in the same request', [D('Warfarin'), D('Ibuprofen')], [], [], False),
    ('two_candidates_reversed', 'Same, reversed order', [D('Ibuprofen'), D('Warfarin')], [], [], False),
    ('sildenafil_nitrate', 'Class-level interaction (nitrates)', [D('Sildenafil')], [D('Glyceryl trinitrate'), D('Isosorbide mononitrate')], [], False),
    ('simvastatin_clarithromycin', 'Generic pair + CYP3A class rule (ONC source)', [D('Clarithromycin')], [D('Simvastatin 40mg'), D('Amlodipine'), D('Metformin')], [], False),
    ('ssri_maoi_onc', 'ONC-list class pair', [D('Fluoxetine')], [D('Phenelzine')], [], False),
    ('tramadol_ssri', 'Class notice (serotonin reuptake inhibitor)', [D('Tramadol')], [D('Sertraline')], [], False),
    ('food_allergy_ignored', 'Non-drug allergy categories are ignored', [D('Amoxicillin')], [], [A('Penicillin', 'Food')], False),
    ('blank_names_ignored', 'Blank drug names are skipped', [D('   '), D('Ibuprofen')], [D('Warfarin')], [], False),
    ('no_drugs', 'No drugs gives an empty result', [], [D('Warfarin')], [A('Penicillin')], True),
    ('whitespace_case', 'Whitespace and case in names and allergen', [D('  amoxicillin  ')], [], [A('  PENICILLIN ')], False),
    ('multiple_allergies', 'Two allergies, two drugs', [D('Augmentin'), D('Septrin')], [], [A('Penicillin'), A('Sulfa')], False),
    ('combined_everything', 'Interaction + pregnancy + allergy at once', [D('Warfarin'), D('Ceftriaxone')], [D('Ibuprofen'), D('Metronidazole')], [A('Penicillin')], True),
    ('lisinopril_ace_pregnant', 'ACE inhibitor allergy + pregnancy', [D('Lisinopril 10mg')], [D('Spironolactone')], [A('ACE inhibitors')], True),
    ('potassium_spironolactone', 'Moderate pair', [D('Potassium Chloride')], [D('Spironolactone')], [], False),
    ('cotrimoxazole_methotrexate_and', 'Combination written with "and"', [D('Sulfamethoxazole and Trimethoprim')], [D('Methotrexate')], [A('sulfonamides')], False),
    ('many_meds_patient', 'Patient on many medicines', [D('Ciprofloxacin')], [D('Warfarin'), D('Prednisolone'), D('Metformin'), D('Amlodipine'), D('Artemether/Lumefantrine'), D('Tramadol'), D('Theophylline')], [A('Penicillin'), A('Sulfa')], True),
    ('ceftriaxone_amoxicillin_allergen', 'Allergen recorded as a drug name (amoxicillin) maps to the penicillin group', [D('Ceftriaxone 1g Injection')], [], [A('Amoxicillin')], False),
    ('opioid_allergy_codeine', 'Opioid allergy group', [D('Codeine Phosphate')], [D('Alcohol')], [A('Morphine')], False),
    ('valproate_pregnant', 'Sodium valproate in pregnancy', [D('Sodium Valproate 200mg')], [D('Carbamazepine')], [], True),
]

out = [{'id': i, 'description': d, 'drugs': dr, 'currentMeds': cm, 'allergies': al, 'pregnant': p}
       for i, d, dr, cm, al, p in CASES]
assert len({c['id'] for c in out}) == len(out)
path = os.path.join(os.path.dirname(__file__), '..', '..', 'tests', 'parity', 'cases.json')
with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(json.dumps(out, indent=1, ensure_ascii=False) + '\n')
print(len(out), 'cases')
