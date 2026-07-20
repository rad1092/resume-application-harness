#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const VERSION = "1.2.0";
const HARNESS_DIR = ".resume-harness";
const COMMAND_OPTIONS = new Map([
  ["init", new Set(["project", "candidate-id"])],
  ["new-run", new Set(["project", "job-slug"])],
  ["validate", new Set(["project"])],
  ["audit", new Set(["project", "manifest"])],
  ["privacy-check", new Set(["project"])],
  ["hash", new Set(["file"])],
]);
const FACT_STATUSES = new Set(["approved", "conditional", "provisional", "forbidden", "retired"]);
const CLAIM_STATUSES = new Set(["approved", "conditional", "provisional", "forbidden", "retired"]);
const EXPERIENCE_STATUSES = new Set(["draft", "user-confirmed", "source-verified", "restricted", "retired"]);
const SOURCE_TYPES = new Set([
  "document-verified",
  "portfolio-verified",
  "public-source-verified",
  "user-attested",
  "learning-completed",
  "inferred",
]);
const PROFILES = new Set(["ko-general", "ko-photo", "ko-blind", "en-ats", "job-targeted"]);
const MATCH_TYPES = new Set(["direct", "transferable", "learning-only", "declared-availability", "gap"]);
const REQUIREMENT_CLASSES = new Set(["must", "preferred", "responsibility", "work-condition"]);

function usage() {
  console.error(`resume_harness ${VERSION}

Usage:
  node resume_harness.mjs init --project PATH [--candidate-id ID]
  node resume_harness.mjs new-run --project PATH --job-slug SLUG
  node resume_harness.mjs validate --project PATH
  node resume_harness.mjs audit --project PATH [--manifest PATH]
  node resume_harness.mjs privacy-check --project PATH
  node resume_harness.mjs hash --file PATH
`);
}

function parseArgs(argv) {
  const command = argv[0];
  const allowedOptions = COMMAND_OPTIONS.get(command);
  const options = {};
  for (let i = 1; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    if (!allowedOptions?.has(key)) throw new Error(`Unknown option --${key} for ${command ?? "this command"}`);
    if (Object.hasOwn(options, key)) throw new Error(`Duplicate option --${key}`);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    options[key] = value;
    i += 1;
  }
  return { command, options };
}

function projectPath(options) {
  if (!options.project) throw new Error("--project is required");
  const project = path.resolve(options.project);
  if (!fs.existsSync(project) || !fs.statSync(project).isDirectory()) {
    throw new Error(`Project directory not found: ${project}`);
  }
  return project;
}

function harnessPath(project) {
  return path.join(project, HARNESS_DIR);
}

function ensureInside(base, candidate, label) {
  const relative = path.relative(base, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} must stay inside ${base}`);
  }
}

function canonicalProjectRelative(project, candidate, label) {
  const logicalFull = path.resolve(project, candidate);
  ensureInside(project, logicalFull, label);

  const suffix = [];
  let existing = logicalFull;
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) throw new Error(`${label} has no existing parent`);
    suffix.unshift(path.basename(existing));
    existing = parent;
  }
  const physicalProject = fs.realpathSync(project);
  const physicalFull = path.join(fs.realpathSync(existing), ...suffix);
  ensureInside(physicalProject, physicalFull, label);
  return path.relative(physicalProject, physicalFull).replaceAll("\\", "/").toLocaleLowerCase();
}

function safeDirectoryTarget(project, candidate, label, { mustExist = false } = {}) {
  if (mustExist && (!fs.existsSync(candidate) || !fs.statSync(candidate).isDirectory())) {
    throw new Error(`${label} directory not found: ${candidate}`);
  }
  canonicalProjectRelative(project, candidate, label);
  return candidate;
}

function writeNewJson(file, value) {
  if (fs.existsSync(file)) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
  return true;
}

function readJson(file, errors, label = file) {
  if (!fs.existsSync(file)) {
    errors.push({ code: "MISSING_FILE", file, message: `${label} is missing` });
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    errors.push({ code: "INVALID_JSON", file, message: String(error.message ?? error) });
    return null;
  }
}

function sha256(file) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(file));
  return hash.digest("hex");
}

function isoNowCompact() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function walkFiles(root, predicate = () => true) {
  if (!fs.existsSync(root)) return [];
  const result = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && predicate(full)) result.push(full);
    }
  }
  return result.sort();
}

function walkLinks(root) {
  if (!fs.existsSync(root)) return [];
  const result = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isSymbolicLink()) result.push(full);
      else if (entry.isDirectory() && entry.name !== ".git" && entry.name !== "node_modules") stack.push(full);
    }
  }
  return result.sort();
}

function initialize(project, candidateId) {
  const root = safeDirectoryTarget(project, harnessPath(project), "Harness");
  const linkedPaths = walkLinks(root);
  if (linkedPaths.length > 0) throw new Error(`Harness contains linked paths: ${linkedPaths.map((item) => path.relative(project, item)).join(", ")}`);
  for (const name of ["runs", "sessions", "applications"]) {
    const directory = safeDirectoryTarget(project, path.join(root, name), `${name} state`);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  }
  const created = [];
  const add = (name, value) => {
    const file = path.join(root, name);
    if (writeNewJson(file, value)) created.push(file);
  };
  add("policy.json", {
    schema_version: "1.2",
    primary_language: "ko",
    authoring: {
      default_mode: "standard",
      max_questions_per_turn: 5,
      accepts_unstructured_answers: true,
      accepts_skip_answers: true,
      korean_plain_style: true,
      ai_authorship_detection: false,
    },
    truth_gate_overrides_ats: true,
    external_upload_allowed: false,
    automatic_application_allowed: false,
    git_operations_allowed: false,
    overwrite_existing_allowed: false,
    profiles: ["ko-general", "ko-photo", "ko-blind", "en-ats", "job-targeted"],
    resuml: {
      server: "resume-safe-resuml",
      advisory_only: true,
      language: "en",
      invoke_only_when_english_ats_is_requested: true,
      allowed_tools: ["safe_resuml_policy", "safe_resuml_validate", "safe_resuml_ats_check"],
    },
  });
  add("profile.json", {
    schema_version: "1.0",
    candidate_id: candidateId,
    status: "draft",
    target_roles: [],
    summary_keywords: [],
    preferences: {},
    uncertain_points: [],
  });
  add("experience_cards.json", { schema_version: "1.0", candidate_id: candidateId, cards: [] });
  add("sources.json", { schema_version: "1.0", candidate_id: candidateId, sources: [] });
  add("master_facts.json", { schema_version: "1.0", candidate_id: candidateId, facts: [] });
  add("claims.json", { schema_version: "1.0", candidate_id: candidateId, claims: [] });
  add("protected_artifacts.json", { schema_version: "1.0", artifacts: [] });
  return { command: "init", project, harness: root, created, preserved_existing: created.length < 7 };
}

function validateProfile(data, errors) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    errors.push({ code: "INVALID_PROFILE", message: "profile.json must contain an object" });
    return;
  }
  if (!data.candidate_id || typeof data.candidate_id !== "string") errors.push({ code: "PROFILE_WITHOUT_CANDIDATE_ID" });
  if (!EXPERIENCE_STATUSES.has(data.status)) errors.push({ code: "BAD_PROFILE_STATUS", value: data.status });
  for (const key of ["target_roles", "summary_keywords", "uncertain_points"]) {
    if (!Array.isArray(data[key])) errors.push({ code: "BAD_PROFILE_FIELD", field: key, expected: "array" });
  }
  if (!data.preferences || typeof data.preferences !== "object" || Array.isArray(data.preferences)) {
    errors.push({ code: "BAD_PROFILE_FIELD", field: "preferences", expected: "object" });
  }
}

function validateExperienceCards(data, errors, warnings) {
  if (!data || !Array.isArray(data.cards)) {
    errors.push({ code: "INVALID_EXPERIENCE_CARDS", message: "experience_cards.json must contain a cards array" });
    return 0;
  }
  const seen = new Set();
  for (const card of data.cards) {
    if (!card || !/^EXP[-_][A-Z0-9_-]+$/iu.test(card.card_id ?? "")) {
      errors.push({ code: "BAD_EXPERIENCE_CARD_ID", card });
      continue;
    }
    if (seen.has(card.card_id)) errors.push({ code: "DUPLICATE_EXPERIENCE_CARD", id: card.card_id });
    seen.add(card.card_id);
    if (!EXPERIENCE_STATUSES.has(card.status)) errors.push({ code: "BAD_EXPERIENCE_STATUS", id: card.card_id, value: card.status });
    for (const key of ["actions", "results", "uncertain_points", "prohibited_extensions", "raw_answer_refs"]) {
      if (card[key] !== undefined && !Array.isArray(card[key])) {
        errors.push({ code: "BAD_EXPERIENCE_FIELD", id: card.card_id, field: key, expected: "array" });
      }
    }
    if (["user-confirmed", "source-verified"].includes(card.status) && (card.uncertain_points ?? []).length > 0) {
      warnings.push({ code: "CONFIRMED_CARD_HAS_UNCERTAINTY", id: card.card_id });
    }
  }
  return seen.size;
}

function validateSources(data, errors, warnings) {
  const map = new Map();
  if (!data || !Array.isArray(data.sources)) {
    errors.push({ code: "INVALID_SOURCES", message: "sources.json must contain a sources array" });
    return map;
  }
  for (const source of data.sources) {
    if (!source || !/^SRC_[A-Z0-9_]+$/.test(source.id ?? "")) {
      errors.push({ code: "BAD_SOURCE_ID", source });
      continue;
    }
    if (map.has(source.id)) errors.push({ code: "DUPLICATE_SOURCE", id: source.id });
    if (!SOURCE_TYPES.has(source.type)) errors.push({ code: "BAD_SOURCE_TYPE", id: source.id, value: source.type });
    if (!source.uri || !source.locator || !source.verified_on) {
      errors.push({ code: "INCOMPLETE_SOURCE", id: source.id });
    }
    if (source.uri?.startsWith("file:") && !source.sha256) {
      warnings.push({ code: "SOURCE_WITHOUT_HASH", id: source.id });
    }
    map.set(source.id, source);
  }
  return map;
}

function validateFacts(data, sources, errors, warnings) {
  const map = new Map();
  if (!data || !Array.isArray(data.facts)) {
    errors.push({ code: "INVALID_FACTS", message: "master_facts.json must contain a facts array" });
    return map;
  }
  for (const fact of data.facts) {
    if (!fact || !/^F_[A-Z0-9_]+$/.test(fact.id ?? "")) {
      errors.push({ code: "BAD_FACT_ID", fact });
      continue;
    }
    if (map.has(fact.id)) errors.push({ code: "DUPLICATE_FACT", id: fact.id });
    if (!FACT_STATUSES.has(fact.status)) errors.push({ code: "BAD_FACT_STATUS", id: fact.id, value: fact.status });
    if (!SOURCE_TYPES.has(fact.verification)) errors.push({ code: "BAD_FACT_VERIFICATION", id: fact.id, value: fact.verification });
    if (!Array.isArray(fact.source_ids) || fact.source_ids.length === 0) {
      errors.push({ code: "FACT_WITHOUT_SOURCE", id: fact.id });
    } else {
      for (const sourceId of fact.source_ids) {
        if (!sources.has(sourceId)) errors.push({ code: "UNKNOWN_SOURCE", fact_id: fact.id, source_id: sourceId });
      }
    }
    if (fact.verification === "inferred" && fact.status === "approved") {
      errors.push({ code: "INFERRED_FACT_APPROVED", id: fact.id });
    }
    if (fact.status === "conditional" && (!Array.isArray(fact.conditions) || fact.conditions.length === 0)) {
      errors.push({ code: "CONDITIONAL_FACT_WITHOUT_CONDITION", id: fact.id });
    }
    if (fact.quantity && !fact.allow_numeric_claims) {
      warnings.push({ code: "QUANTITY_NOT_ALLOWED_IN_CLAIMS", id: fact.id });
    }
    map.set(fact.id, fact);
  }
  return map;
}

function includesNumericClaim(text) {
  return /(?:^|\D)\d+(?:[.,]\d+)*(?:\s*[%+]|\b)/u.test(text);
}

function validateClaims(data, facts, errors, warnings) {
  const map = new Map();
  if (!data || !Array.isArray(data.claims)) {
    errors.push({ code: "INVALID_CLAIMS", message: "claims.json must contain a claims array" });
    return map;
  }
  for (const claim of data.claims) {
    if (!claim || !/^C_[A-Z0-9_]+$/.test(claim.id ?? "")) {
      errors.push({ code: "BAD_CLAIM_ID", claim });
      continue;
    }
    if (map.has(claim.id)) errors.push({ code: "DUPLICATE_CLAIM", id: claim.id });
    if (!CLAIM_STATUSES.has(claim.status)) errors.push({ code: "BAD_CLAIM_STATUS", id: claim.id, value: claim.status });
    const factIds = Array.isArray(claim.fact_ids) ? claim.fact_ids : [];
    if (!Array.isArray(claim.fact_ids)) errors.push({ code: "BAD_CLAIM_FIELD", id: claim.id, field: "fact_ids", expected: "array" });
    if (factIds.length === 0) {
      errors.push({ code: "CLAIM_WITHOUT_FACT", id: claim.id });
    }
    const linkedFacts = [];
    for (const factId of factIds) {
      const fact = facts.get(factId);
      if (!fact) errors.push({ code: "UNKNOWN_FACT", claim_id: claim.id, fact_id: factId });
      else linkedFacts.push(fact);
    }
    if (claim.status === "approved") {
      for (const fact of linkedFacts) {
        if (fact.status !== "approved") {
          errors.push({ code: "APPROVED_CLAIM_USES_UNAPPROVED_FACT", claim_id: claim.id, fact_id: fact.id, status: fact.status });
        }
      }
    }
    const wording = claim.wording && typeof claim.wording === "object" && !Array.isArray(claim.wording) ? claim.wording : {};
    const koWording = Array.isArray(wording.ko) ? wording.ko : [];
    const enWording = Array.isArray(wording.en) ? wording.en : [];
    for (const language of ["ko", "en"]) {
      if (wording[language] !== undefined && !Array.isArray(wording[language])) {
        errors.push({ code: "BAD_CLAIM_FIELD", id: claim.id, field: `wording.${language}`, expected: "array" });
      }
    }
    if (koWording.length === 0 && enWording.length === 0) {
      errors.push({ code: "CLAIM_WITHOUT_WORDING", id: claim.id });
    }
    const profiles = Array.isArray(claim.profiles) ? claim.profiles : [];
    if (claim.profiles !== undefined && !Array.isArray(claim.profiles)) {
      errors.push({ code: "BAD_CLAIM_FIELD", id: claim.id, field: "profiles", expected: "array" });
    }
    for (const profile of profiles) {
      if (!PROFILES.has(profile)) errors.push({ code: "BAD_PROFILE", claim_id: claim.id, profile });
    }
    const prohibitedPhrases = Array.isArray(claim.prohibited) ? claim.prohibited : [];
    if (claim.prohibited !== undefined && !Array.isArray(claim.prohibited)) {
      errors.push({ code: "BAD_CLAIM_FIELD", id: claim.id, field: "prohibited", expected: "array" });
    }
    const texts = [...koWording, ...enWording];
    for (const text of texts) {
      if (typeof text !== "string" || !text.trim()) {
        errors.push({ code: "EMPTY_CLAIM_TEXT", claim_id: claim.id });
        continue;
      }
      if (includesNumericClaim(text) && !linkedFacts.some((fact) => fact.allow_numeric_claims === true)) {
        errors.push({ code: "UNSUPPORTED_NUMERIC_WORDING", claim_id: claim.id, text });
      }
      for (const prohibited of prohibitedPhrases) {
        if (claim.status !== "forbidden" && prohibited && text.toLocaleLowerCase().includes(String(prohibited).toLocaleLowerCase())) {
          errors.push({ code: "PROHIBITED_WORDING_USED", claim_id: claim.id, prohibited });
        }
      }
      if (/(?:\bmanager\b|\bdirector\b|\bhead\b|\bteam lead\b|과장|부장|팀장)/iu.test(text) && !linkedFacts.some((fact) => fact.category === "employment-title")) {
        errors.push({ code: "TITLE_WITHOUT_TITLE_FACT", claim_id: claim.id, text });
      }
      if (/(?:\bexpert\b|\badvanced\b|\bfluent\b|\bnative\b|전문가|고급|유창|원어민)/iu.test(text) && !linkedFacts.some((fact) => fact.category === "proficiency")) {
        warnings.push({ code: "PROFICIENCY_WITHOUT_DEDICATED_FACT", claim_id: claim.id, text });
      }
    }
    map.set(claim.id, claim);
  }
  return map;
}

function validateRequirementFile(file, claims, errors, warnings) {
  const data = readJson(file, errors, "requirements file");
  if (!data) return;
  if (!Array.isArray(data.requirements)) {
    errors.push({ code: "INVALID_REQUIREMENTS", file });
    return;
  }
  const seen = new Set();
  for (const requirement of data.requirements) {
    if (!requirement || typeof requirement !== "object" || Array.isArray(requirement)) {
      errors.push({ code: "INVALID_REQUIREMENT", file, requirement });
      continue;
    }
    if (!/^REQ_[A-Z0-9_]+$/.test(requirement.id ?? "")) errors.push({ code: "BAD_REQUIREMENT_ID", file, requirement });
    if (seen.has(requirement.id)) errors.push({ code: "DUPLICATE_REQUIREMENT", file, id: requirement.id });
    seen.add(requirement.id);
    if (!REQUIREMENT_CLASSES.has(requirement.classification)) errors.push({ code: "BAD_REQUIREMENT_CLASS", file, id: requirement.id });
    if (!MATCH_TYPES.has(requirement.match)) errors.push({ code: "BAD_MATCH_TYPE", file, id: requirement.id });
    if (!requirement.quoted_text) errors.push({ code: "MISSING_REQUIREMENT_QUOTE", file, id: requirement.id });
    const claimIds = Array.isArray(requirement.claim_ids) ? requirement.claim_ids : [];
    if (requirement.claim_ids !== undefined && !Array.isArray(requirement.claim_ids)) {
      errors.push({ code: "BAD_REQUIREMENT_FIELD", file, id: requirement.id, field: "claim_ids", expected: "array" });
    }
    for (const claimId of claimIds) {
      if (!claims.has(claimId)) errors.push({ code: "UNKNOWN_REQUIREMENT_CLAIM", file, requirement_id: requirement.id, claim_id: claimId });
    }
    if (["direct", "transferable", "declared-availability"].includes(requirement.match) && claimIds.length === 0) {
      errors.push({ code: "MATCH_WITHOUT_CLAIM", file, requirement_id: requirement.id });
    }
    if (["gap", "learning-only"].includes(requirement.match) && claimIds.length === 0) {
      warnings.push({ code: "DISCLOSED_GAP", file, requirement_id: requirement.id, match: requirement.match });
    }
  }
}

function validateManifest(file, project, claims, protectedPaths, strict, errors, warnings) {
  const data = readJson(file, errors, "claim map");
  if (!data) return;
  const entries = Array.isArray(data.entries) ? data.entries : Array.isArray(data) ? data : null;
  if (!entries) {
    errors.push({ code: "INVALID_CLAIM_MAP", file });
    return;
  }
  const seen = new Set();
  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      errors.push({ code: "INVALID_OUTPUT_ENTRY", file, entry });
      continue;
    }
    if (!/^OUT_[A-Z0-9_]+$/.test(entry.id ?? "")) errors.push({ code: "BAD_OUTPUT_ID", file, entry });
    if (seen.has(entry.id)) errors.push({ code: "DUPLICATE_OUTPUT_ID", file, id: entry.id });
    seen.add(entry.id);
    if (!entry.text || !["ko", "en"].includes(entry.language)) errors.push({ code: "INCOMPLETE_OUTPUT_ENTRY", file, id: entry.id });
    if (!PROFILES.has(entry.profile)) errors.push({ code: "BAD_OUTPUT_PROFILE", file, id: entry.id, profile: entry.profile });
    const claimIds = Array.isArray(entry.claim_ids) ? entry.claim_ids : [];
    if (entry.claim_ids !== undefined && !Array.isArray(entry.claim_ids)) {
      errors.push({ code: "BAD_OUTPUT_FIELD", file, id: entry.id, field: "claim_ids", expected: "array" });
    }
    for (const claimId of claimIds) {
      const claim = claims.get(claimId);
      if (!claim) {
        errors.push({ code: "UNKNOWN_OUTPUT_CLAIM", file, output_id: entry.id, claim_id: claimId });
      } else if (claim.status !== "approved") {
        const item = { code: "OUTPUT_USES_UNAPPROVED_CLAIM", file, output_id: entry.id, claim_id: claimId, status: claim.status };
        (strict ? errors : warnings).push(item);
      }
    }
    if (claimIds.length === 0 && entry.substantive !== false) {
      (strict ? errors : warnings).push({ code: "SUBSTANTIVE_TEXT_WITHOUT_CLAIM", file, output_id: entry.id });
    }
  }
  const outputs = data.outputs === undefined ? [] : data.outputs;
  if (!Array.isArray(outputs)) {
    errors.push({ code: "INVALID_OUTPUTS", file, expected: "array" });
    return;
  }
  for (const output of outputs) {
    if (!output || typeof output !== "object" || Array.isArray(output) || typeof output.path !== "string" || !output.path.trim()) {
      errors.push({ code: "MISSING_OUTPUT_PATH", file, output });
      continue;
    }
    if (path.isAbsolute(String(output.path))) {
      errors.push({ code: "ABSOLUTE_OUTPUT_PATH", file, path: output.path });
      continue;
    }
    try {
      const normalized = canonicalProjectRelative(project, output.path, "Output path");
      if (protectedPaths.has(normalized)) errors.push({ code: "PROTECTED_OUTPUT_TARGET", file, path: output.path });
    } catch (error) {
      errors.push({ code: "OUTPUT_OUTSIDE_PROJECT", file, path: output.path, message: String(error.message ?? error) });
    }
  }
}

function applicationFiles(root, filename) {
  const canonical = walkFiles(path.join(root, "applications"), (item) => path.basename(item) === filename);
  const legacy = walkFiles(path.join(root, "jobs"), (item) => path.basename(item) === filename);
  return [...new Set([...canonical, ...legacy])].sort();
}

function validateProject(project, { strict = false, manifest } = {}) {
  const root = safeDirectoryTarget(project, harnessPath(project), "Harness", { mustExist: true });
  const errors = [];
  const warnings = [];
  const linkedPaths = walkLinks(root);
  if (linkedPaths.length > 0) {
    for (const linkedPath of linkedPaths) errors.push({ code: "HARNESS_LINK_NOT_ALLOWED", path: path.relative(project, linkedPath) });
    return {
      tool: "resume-application-harness",
      version: VERSION,
      command: strict ? "audit" : "validate",
      project,
      valid: false,
      counts: { experience_cards: 0, sources: 0, facts: 0, claims: 0, errors: errors.length, warnings: 0 },
      errors,
      warnings,
    };
  }
  const profileData = readJson(path.join(root, "profile.json"), errors);
  const experienceData = readJson(path.join(root, "experience_cards.json"), errors);
  const sourcesData = readJson(path.join(root, "sources.json"), errors);
  const factsData = readJson(path.join(root, "master_facts.json"), errors);
  const claimsData = readJson(path.join(root, "claims.json"), errors);
  const protectedData = readJson(path.join(root, "protected_artifacts.json"), errors);
  readJson(path.join(root, "policy.json"), errors);
  validateProfile(profileData, errors);
  const experienceCards = validateExperienceCards(experienceData, errors, warnings);
  const sources = validateSources(sourcesData, errors, warnings);
  const facts = validateFacts(factsData, sources, errors, warnings);
  const claims = validateClaims(claimsData, facts, errors, warnings);
  const protectedPaths = new Set();
  const protectedArtifacts = Array.isArray(protectedData?.artifacts) ? protectedData.artifacts : [];
  if (protectedData && !Array.isArray(protectedData.artifacts)) {
    errors.push({ code: "INVALID_PROTECTED_ARTIFACTS", expected: "array" });
  }
  for (const artifact of protectedArtifacts) {
    if (
      !artifact
      || typeof artifact !== "object"
      || Array.isArray(artifact)
      || typeof artifact.path !== "string"
      || !artifact.path.trim()
      || path.isAbsolute(artifact.path)
      || artifact.overwrite !== false
      || typeof artifact.sha256 !== "string"
      || !artifact.sha256
    ) {
      errors.push({ code: "INVALID_PROTECTED_ARTIFACT", artifact });
      continue;
    }
    const full = path.resolve(project, artifact.path);
    try {
      protectedPaths.add(canonicalProjectRelative(project, artifact.path, "Protected artifact"));
    } catch (error) {
      errors.push({ code: "PROTECTED_ARTIFACT_OUTSIDE_PROJECT", path: artifact.path, message: String(error.message ?? error) });
      continue;
    }
    if (!fs.existsSync(full)) warnings.push({ code: "PROTECTED_ARTIFACT_MISSING", path: artifact.path });
    else if (sha256(full) !== artifact.sha256) warnings.push({ code: "PROTECTED_ARTIFACT_CHANGED", path: artifact.path });
  }
  for (const file of applicationFiles(root, "requirements.json")) {
    validateRequirementFile(file, claims, errors, warnings);
  }
  const manifestFiles = manifest
    ? [path.resolve(project, manifest)]
    : applicationFiles(root, "claim_map.json");
  for (const file of manifestFiles) {
    try {
      canonicalProjectRelative(project, file, "Claim map");
    } catch (error) {
      errors.push({ code: "CLAIM_MAP_OUTSIDE_PROJECT", file, message: String(error.message ?? error) });
      continue;
    }
    validateManifest(file, project, claims, protectedPaths, strict, errors, warnings);
  }
  return {
    tool: "resume-application-harness",
    version: VERSION,
    command: strict ? "audit" : "validate",
    project,
    valid: errors.length === 0,
    counts: { experience_cards: experienceCards, sources: sources.size, facts: facts.size, claims: claims.size, errors: errors.length, warnings: warnings.length },
    errors,
    warnings,
  };
}

function git(project, args) {
  const result = spawnSync("git", ["-C", project, ...args], { encoding: "utf8", windowsHide: true });
  return { status: result.status, stdout: result.stdout?.trim() ?? "", stderr: result.stderr?.trim() ?? "" };
}

function decodePrivacyText(content) {
  if (content.length >= 2 && content[0] === 0xff && content[1] === 0xfe) {
    return { text: content.subarray(2).toString("utf16le") };
  }
  const toUtf16Le = (buffer) => {
    const evenLength = buffer.length - (buffer.length % 2);
    const swapped = Buffer.allocUnsafe(evenLength);
    for (let index = 0; index < evenLength; index += 2) {
      swapped[index] = buffer[index + 1];
      swapped[index + 1] = buffer[index];
    }
    return swapped.toString("utf16le");
  };
  if (content.length >= 2 && content[0] === 0xfe && content[1] === 0xff) {
    return { text: toUtf16Le(content.subarray(2)) };
  }
  if (content.includes(0)) {
    let evenNulls = 0;
    let oddNulls = 0;
    for (let index = 0; index < content.length; index += 1) {
      if (content[index] !== 0) continue;
      if (index % 2 === 0) evenNulls += 1;
      else oddNulls += 1;
    }
    const pairs = Math.max(1, Math.floor(content.length / 2));
    if (oddNulls / pairs > 0.3 && evenNulls / pairs < 0.1) return { text: content.toString("utf16le") };
    if (evenNulls / pairs > 0.3 && oddNulls / pairs < 0.1) return { text: toUtf16Le(content) };
    return { reason: "binary-or-nul" };
  }
  return { text: content.toString("utf8") };
}

function privacyCheck(project) {
  const errors = [];
  const warnings = [];
  const root = safeDirectoryTarget(project, harnessPath(project), "Harness", { mustExist: true });
  for (const linkedPath of walkLinks(root)) errors.push({ code: "HARNESS_LINK_NOT_ALLOWED", path: path.relative(project, linkedPath) });
  const rootResult = git(project, ["rev-parse", "--show-toplevel"]);
  let gitRoot = null;
  if (rootResult.status === 0 && rootResult.stdout) {
    gitRoot = path.resolve(rootResult.stdout);
    const relativeHarness = path.relative(gitRoot, root).replaceAll("\\", "/");
    const tracked = git(gitRoot, ["ls-files", "--", relativeHarness]);
    const staged = git(gitRoot, ["diff", "--cached", "--name-only", "--", relativeHarness]);
    if (tracked.stdout) errors.push({ code: "RESUME_DATA_TRACKED_BY_GIT", files: tracked.stdout.split(/\r?\n/) });
    if (staged.stdout) errors.push({ code: "RESUME_DATA_STAGED_IN_GIT", files: staged.stdout.split(/\r?\n/) });
    const ignored = git(gitRoot, ["check-ignore", "-q", "--", relativeHarness]);
    if (ignored.status !== 0) warnings.push({ code: "HARNESS_NOT_GIT_IGNORED", path: relativeHarness });
  } else {
    warnings.push({ code: "NO_GIT_CONTEXT", message: "Project is not inside a Git working tree" });
  }
  const secretPatterns = [
    /\bsk-[A-Za-z0-9_-]{20,}\b/g,
    /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
    /\bAKIA[0-9A-Z]{16}\b/g,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
    /["']?api[_-]?key["']?\s*[:=]\s*["'][^"']{8,}["']/giu,
  ];
  const maxPrivacyScanBytes = 2_000_000;
  for (const file of walkFiles(root)) {
    const size = fs.statSync(file).size;
    if (size > maxPrivacyScanBytes) {
      warnings.push({ code: "PRIVACY_FILE_NOT_SCANNED", file: path.relative(project, file), reason: "size", bytes: size });
      continue;
    }
    const content = fs.readFileSync(file);
    const decoded = decodePrivacyText(content);
    if (decoded.reason) {
      warnings.push({ code: "PRIVACY_FILE_NOT_SCANNED", file: path.relative(project, file), reason: decoded.reason, bytes: size });
      continue;
    }
    const text = decoded.text;
    for (const pattern of secretPatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(text)) {
        errors.push({ code: "POSSIBLE_SECRET_IN_HARNESS", file: path.relative(project, file), pattern: pattern.source });
      }
    }
  }
  return {
    tool: "resume-application-harness",
    version: VERSION,
    command: "privacy-check",
    project,
    git_root: gitRoot,
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function createRun(project, slug) {
  if (typeof slug !== "string" || !/^[a-z0-9][a-z0-9_-]{0,79}$/u.test(slug)) {
    throw new Error("--job-slug is required, must be 1-80 characters, and may use lowercase letters, digits, underscore, or hyphen");
  }
  const harness = safeDirectoryTarget(project, harnessPath(project), "Harness", { mustExist: true });
  const runs = safeDirectoryTarget(project, path.join(harness, "runs"), "Runs", { mustExist: true });
  const root = safeDirectoryTarget(project, path.join(runs, `${isoNowCompact()}_${slug}`), "Run");
  if (fs.existsSync(root)) throw new Error(`Run already exists: ${root}`);
  for (const name of ["input", "work", "qa", "publish"]) fs.mkdirSync(path.join(root, name), { recursive: true, mode: 0o700 });
  return { command: "new-run", run: root };
}

function emit(report) {
  console.log(JSON.stringify(report, null, 2));
  if (report.valid === false) process.exitCode = 1;
}

try {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (!command) {
    usage();
    process.exitCode = 2;
  } else if (command === "init") {
    const project = projectPath(options);
    emit(initialize(project, options["candidate-id"] ?? path.basename(project).toLocaleLowerCase().replaceAll(/[^a-z0-9]+/gu, "-")));
  } else if (command === "new-run") {
    emit(createRun(projectPath(options), options["job-slug"]));
  } else if (command === "validate") {
    emit(validateProject(projectPath(options)));
  } else if (command === "audit") {
    emit(validateProject(projectPath(options), { strict: true, manifest: options.manifest }));
  } else if (command === "privacy-check") {
    emit(privacyCheck(projectPath(options)));
  } else if (command === "hash") {
    if (!options.file) throw new Error("--file is required");
    const file = path.resolve(options.file);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`File not found: ${file}`);
    emit({ command: "hash", file, sha256: sha256(file) });
  } else {
    usage();
    throw new Error(`Unknown command: ${command}`);
  }
} catch (error) {
  console.error(JSON.stringify({ valid: false, error: String(error.message ?? error) }, null, 2));
  process.exitCode = 2;
}
