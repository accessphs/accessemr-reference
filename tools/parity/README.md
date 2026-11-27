# Parity tooling

These files produce `tests/parity/expected.json`, the answers of AccessEMR's real Ruby engine
(`Medkb::SafetyCheck`) for every case in `tests/parity/cases.json`. The parity test
(`tests/parity.test.mjs`) then requires the TypeScript engine to give exactly the same alerts and notices,
field for field.

You only need this when the engine logic or the cases change. It needs an AccessEMR core checkout and its
Docker test environment; it is kept here so the expected file can be regenerated and audited.

- `make_cases.py`: writes `tests/parity/cases.json` (inputs only).
- `parity.rb`: runs inside the core repo with `bin/rails runner -e test`. In one database transaction that is
  rolled back at the end it:
  1. loads the real MedKB generics (`Medkb::Importer`), the drug list (`Medkb::CatalogueImport`) and the safety
     rules and classes (`Medkb::SafetyLoader`);
  2. for each case, inside a nested transaction that is also rolled back, creates a patient, the current
     medicines (outpatient prescriptions), the allergies and, if `pregnant`, an active pregnancy episode;
  3. calls `Medkb::SafetyCheck` and records `{ alerts, notices }`.

## Regenerating expected.json

```bash
CORE=../access-emr-core-safety
python tools/parity/make_cases.py
cp tests/parity/cases.json "$CORE/tmp/parity_cases.json"
cp tools/parity/parity.rb  "$CORE/tmp/parity.rb"
git -C "$CORE" rev-parse HEAD > "$CORE/tmp/parity_commit.txt"

# Example Docker test wrapper (mounts the core checkout at /rails, test database):
MSYS_NO_PATHCONV=1 docker run --rm --network access-emr-core-paeds_default \
  -v "$(pwd -W 2>/dev/null || pwd)/$CORE:/rails" -w /rails \
  --env-file "$CORE/.env" \
  -e RAILS_ENV=test -e DATABASE_URL=postgres://postgres:password@db/access_emr_core_test \
  --entrypoint "" access-emr-core-web bash -c "ruby bin/rails runner -e test /rails/tmp/parity.rb"

cp "$CORE/tmp/parity_expected.json" tests/parity/expected.json
rm "$CORE"/tmp/parity_{cases,expected,commit}.* "$CORE/tmp/parity.rb"
npm test
```

`tmp/` is git-ignored in the core repo, so nothing there is committed. The script prints the number of
generics after the rollback (0) as a check that the test database was left untouched.

If a parity case fails, fix the TypeScript port, not `expected.json`.
