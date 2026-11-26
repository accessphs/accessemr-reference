# frozen_string_literal: true

# Minimal YAML -> JSON converter used by scripts/build-data.mjs (Ruby's standard library ships a YAML parser,
# so the Node build stays dependency-free). Reads the YAML file given as the first argument with the same
# safe loader AccessEMR uses (YAML.safe_load) and prints compact JSON on stdout.
#
#   ruby scripts/yaml2json.rb path/to/file.yml > file.json
require 'yaml'
require 'json'

data = YAML.safe_load(File.read(ARGV.fetch(0), encoding: 'UTF-8'))
$stdout.binmode
$stdout.write(JSON.generate(data))
