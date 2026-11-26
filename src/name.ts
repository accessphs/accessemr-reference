// Port of Medkb::Name (app/services/medkb/name.rb): drug name normalisation for MedKB generic matching.
import { ALPHA, squish } from './text.js';

const WS = '[ \\t\\r\\n\\f\\v]';
const STRENGTH = new RegExp(
  `\\d+(\\.\\d+)?${WS}*(mg|g|mcg|\\u00b5g|ml|iu|units?|%)(${WS}*\\/${WS}*\\d*(\\.\\d+)?${WS}*(ml|l))?(?![${ALPHA}])`,
  'g',
);
const FORM_WORDS =
  /\b(tablets?|tab|capsules?|cap|syrup|suspension|injection|inj|infusion|cream|ointment|drops|solution|suppository)\b/g;
const SALTS = new RegExp(
  `${WS}+(hydrochloride|hcl|sodium|potassium|sulfate|sulphate|phosphate|maleate|citrate|acetate|trihydrate|` +
    'mesylate|besylate|fumarate|tartrate|succinate)$',
);
const COMBINATION = /\/|\+|\band\b/;

/** Lowercase, drop brackets, strengths ("500 mg", "250mg/5ml") and form words, turn - and _ into spaces. */
export function normalise(text: unknown): string {
  const lower = String(text ?? '').toLowerCase();
  return squish(
    lower.replace(/\([^)]*\)/g, ' ').replace(STRENGTH, ' ').replace(FORM_WORDS, ' ').replace(/[-_]/g, ' '),
  );
}

/** The normalised name without a trailing salt word ("metformin hydrochloride" → "metformin"). */
export function withoutSalt(normalised: string): string {
  return normalised.replace(SALTS, '');
}

/** Combination products ("artemether/lumefantrine", "x + y", "x and y") only match MedKB exactly. */
export function isCombination(text: unknown): boolean {
  return COMBINATION.test(String(text ?? '').toLowerCase());
}
