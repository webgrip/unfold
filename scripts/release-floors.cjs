'use strict';

const fs = require('node:fs');
const path = require('node:path');

const FLOORS = path.join(__dirname, 'release-floors.json');
const IDENTIFIER = '(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)';
const VERSION = new RegExp(`^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(?:-(${IDENTIFIER}(?:\\.${IDENTIFIER})*))?$`);

/** Parses a semantic version without build metadata, or returns null. */
function parse(version) {
  const match = typeof version === 'string' ? VERSION.exec(version) : null;
  if (!match) return null;
  return { core: match.slice(1, 4).map(Number), prerelease: match[4] ? match[4].split('.') : [] };
}

function compareIdentifiers(a, b) {
  const numeric = [/^[0-9]+$/.test(a), /^[0-9]+$/.test(b)];
  if (numeric[0] && numeric[1]) return Math.sign(Number(a) - Number(b));
  if (numeric[0] !== numeric[1]) return numeric[0] ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Orders two semantic versions by precedence: -1, 0 or 1. Throws on a malformed version. */
function compare(left, right) {
  const [a, b] = [left, right].map((version) => {
    const parsed = parse(version);
    if (!parsed) throw new Error(`Not a semantic version: ${JSON.stringify(version)}`);
    return parsed;
  });
  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] !== b.core[index]) return Math.sign(a.core[index] - b.core[index]);
  }
  if (!a.prerelease.length || !b.prerelease.length) return Math.sign(b.prerelease.length - a.prerelease.length);
  for (let index = 0; index < Math.min(a.prerelease.length, b.prerelease.length); index += 1) {
    const order = compareIdentifiers(a.prerelease[index], b.prerelease[index]);
    if (order) return order;
  }
  return Math.sign(a.prerelease.length - b.prerelease.length);
}

/** Reads and validates the recorded release floors. */
function load(file = FLOORS) {
  const floors = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (floors.schema_version !== 1 || !floors.components || !floors.trains) {
    throw new Error(`${file} is not a schema_version 1 release floor record`);
  }
  for (const [name, component] of Object.entries(floors.components)) {
    if (!parse(component.floor) || !Array.isArray(component.tag_prefixes) || !component.tag_prefixes.length) {
      throw new Error(`${file}: component ${name} needs a semantic-version floor and tag prefixes`);
    }
    for (const version of Object.keys(component.occupied_above_floor || {})) {
      if (!parse(version) || compare(version, component.floor) <= 0) {
        throw new Error(`${file}: ${name} lists ${version} as occupied above its floor ${component.floor}`);
      }
    }
  }
  for (const [name, train] of Object.entries(floors.trains)) {
    if (!train.tag_prefix || !Array.isArray(train.components) || !train.components.every((component) => floors.components[component])) {
      throw new Error(`${file}: train ${name} needs a tag prefix and known components`);
    }
  }
  return floors;
}

function title(name) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** Throws unless a new version of a component lies above its floor, outside its withdrawn versions and above every existing tag that carried it. */
function refuseOccupied(name, version, { floors = load(), tags = [] } = {}) {
  const component = floors.components[name];
  if (!component) throw new Error(`No release floor is recorded for ${name}`);
  if (!parse(version)) throw new Error(`${title(name)} release version ${JSON.stringify(version)} is not a semantic version`);
  if (compare(version, component.floor) <= 0) {
    throw new Error(`${title(name)} ${version} is at or below its release floor ${component.floor}; every version up to the floor is already published (${floors.evidence}).`);
  }
  const occupied = (component.occupied_above_floor || {})[version];
  if (occupied) {
    throw new Error(`${title(name)} ${version} is already occupied and can never be published again: ${occupied}`);
  }
  for (const tag of tags) {
    const prefix = component.tag_prefixes.find((candidate) => tag.startsWith(candidate));
    const existing = prefix && tag.slice(prefix.length);
    if (existing && parse(existing) && compare(version, existing) <= 0) {
      throw new Error(`${title(name)} ${version} is at or below the existing tag ${tag}; a release never reuses or goes below an existing version.`);
    }
  }
}

/** Applies refuseOccupied to every component a release train versions. */
function refuseOccupiedTrain(train, version, { floors = load(), tags = [] } = {}) {
  const definition = floors.trains[train];
  if (!definition) throw new Error(`No release train ${train} is recorded in the release floors`);
  for (const component of definition.components) refuseOccupied(component, version, { floors, tags });
}

module.exports = { FLOORS, compare, load, parse, refuseOccupied, refuseOccupiedTrain };
