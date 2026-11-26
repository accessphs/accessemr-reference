# frozen_string_literal: true

# Generates tests/parity/expected.json by running the REAL AccessEMR engine (Medkb::SafetyCheck) on every case in
# tests/parity/cases.json. Throwaway tool: it is run inside an AccessEMR core checkout's test environment, loads
# the real MedKB generics, drug list and safety rules, creates a patient per case, and rolls everything back.
#
#   cp tests/parity/cases.json <core>/tmp/parity_cases.json
#   cp tools/parity/parity.rb  <core>/tmp/parity.rb
#   git -C <core> rev-parse HEAD > <core>/tmp/parity_commit.txt
#   (in the core repo, test env)  bin/rails runner -e test tmp/parity.rb
#   cp <core>/tmp/parity_expected.json tests/parity/expected.json   # then delete the tmp files
#
# See tools/parity/README.md for the exact Docker command used.
require 'factory_bot'

cases = JSON.parse(Rails.root.join('tmp/parity_cases.json').read)
out_path = Rails.root.join('tmp/parity_expected.json')
results = {}
loaded = {}

ActiveRecord::Base.transaction do
  loaded[:generics] = Medkb::Importer.call(Rails.root.join('db/data/medkb')) && MedkbGeneric.count
  catalogue = Medkb::CatalogueImport.call(Rails.root.join('db/data/medkb/drugs.csv'))
  loaded[:drugs] = Drug.count
  loaded[:catalogue_rows] = catalogue.rows
  safety = Medkb::SafetyLoader.call
  loaded[:rules] = safety[:rules]
  loaded[:classes] = safety[:classes]
  warn "Loaded #{loaded.to_json}"

  cases.each do |test_case|
    ActiveRecord::Base.transaction(requires_new: true) do
      patient = FactoryBot.create(:patient)
      test_case['currentMeds'].each do |med|
        # AccessEMR requires a strength on a new outpatient order; the cases only give one where it matters to
        # resolution, so a placeholder is used for the create and then cleared. The check reads nf_drug_name,
        # product_id and strength only.
        medication = FactoryBot.create(:medication, patient: patient, nf_drug_name: med['name'],
                                                    strength: med['strength'] || '1 mg', context: 'outpatient',
                                                    prescribed: true, product: nil, ordered: false)
        medication.update_columns(strength: med['strength']) unless med['strength'] # rubocop:disable Rails/SkipsModelValidations
      end
      test_case['allergies'].each do |allergy|
        FactoryBot.create(:allergy, patient: patient, category: allergy['category'] || 'Drug',
                                    allergen: allergy['allergen'])
      end
      if test_case['pregnant']
        PregnancyEpisode.create!(patient: patient, anc_number: "ANC-#{test_case['id']}", lmp: 10.weeks.ago.to_date,
                                 edd: 30.weeks.from_now.to_date, status: 'active')
      end
      drugs = test_case['drugs'].map { |drug| { nf_drug_name: drug['name'], product_id: nil, strength: drug['strength'] } }
      result = Medkb::SafetyCheck.call(patient: patient, drugs: drugs)
      results[test_case['id']] = { 'alerts' => result[:alerts], 'notices' => result[:notices] }
      raise ActiveRecord::Rollback
    end
  end
  raise ActiveRecord::Rollback
end

commit_file = Rails.root.join('tmp/parity_commit.txt') # written by the host (git may not exist in the container)
commit = commit_file.exist? ? commit_file.read.strip : nil
document = { 'generated_by' => 'tools/parity/parity.rb (Medkb::SafetyCheck, AccessEMR core)',
             'core_commit' => commit, 'loaded' => loaded.transform_keys(&:to_s), 'cases' => results }
out_path.write("#{JSON.pretty_generate(document)}\n")
warn "Wrote #{results.size} cases to #{out_path}; MedkbGeneric rows after rollback: #{MedkbGeneric.count}"
