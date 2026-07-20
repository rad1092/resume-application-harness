#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const harnessCli = path.join(scriptDir, "resume_harness.mjs");
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "resume-harness-self-test-"));
const project = path.join(sandbox, "project");
const typoCwd = path.join(sandbox, "typo-cwd");
fs.mkdirSync(project, { recursive: true });
fs.mkdirSync(typoCwd, { recursive: true });

function run(args, cwd = sandbox) {
  return spawnSync(process.execPath, [harnessCli, ...args], {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
}

function parseReport(result) {
  assert.ok(result.stdout.trim(), `Expected JSON stdout, stderr was: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

const tests = [];

try {
  let result = run(["init", "--projec", project], typoCwd);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unknown option --projec/u);
  assert.equal(fs.existsSync(path.join(typoCwd, ".resume-harness")), false);
  tests.push("unknown options fail before writing to the current directory");

  result = run(["init"], typoCwd);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--project is required/u);
  assert.equal(fs.existsSync(path.join(typoCwd, ".resume-harness")), false);
  tests.push("project-scoped commands require an explicit existing project directory");

  const missingProject = path.join(sandbox, "missing-project");
  result = run(["init", "--project", missingProject]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Project directory not found/u);
  assert.equal(fs.existsSync(missingProject), false);

  const escapeProject = path.join(sandbox, "escape-project");
  const outsideHarness = path.join(sandbox, "outside-harness");
  fs.mkdirSync(escapeProject);
  fs.mkdirSync(outsideHarness);
  fs.symlinkSync(outsideHarness, path.join(escapeProject, ".resume-harness"), process.platform === "win32" ? "junction" : "dir");
  result = run(["init", "--project", escapeProject, "--candidate-id", "escape-test"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Harness must stay inside/u);
  assert.deepEqual(fs.readdirSync(outsideHarness), []);
  tests.push("a linked .resume-harness cannot redirect initialization outside the project");

  result = run(["init", "--project", project, "--project", project]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Duplicate option --project/u);
  tests.push("duplicate options are rejected");

  result = run(["init", "--project", project, "--candidate-id", "self-test"]);
  assert.equal(result.status, 0, result.stderr);
  let report = parseReport(result);
  assert.equal(report.created.length, 7);
  assert.equal(fs.existsSync(path.join(project, ".resume-harness", "applications")), true);
  assert.equal(fs.existsSync(path.join(project, ".resume-harness", "jobs")), false);

  result = run(["init", "--project", project, "--candidate-id", "self-test"]);
  assert.equal(result.status, 0, result.stderr);
  report = parseReport(result);
  assert.equal(report.created.length, 0);
  assert.equal(report.preserved_existing, true);
  tests.push("initialization is idempotent and uses the documented applications layout");

  result = run(["validate", "--project", project]);
  assert.equal(result.status, 0, result.stderr);
  report = parseReport(result);
  assert.equal(report.valid, true);
  assert.equal(report.counts.experience_cards, 0);
  tests.push("a newly initialized project validates");

  const claimsFile = path.join(project, ".resume-harness", "claims.json");
  writeJson(claimsFile, {
    schema_version: "1.0",
    candidate_id: "self-test",
    claims: [{ id: "C_BAD_SHAPE", status: "approved", fact_ids: {}, wording: { ko: {} }, profiles: {}, prohibited: {} }],
  });
  result = run(["validate", "--project", project]);
  assert.equal(result.status, 1);
  report = parseReport(result);
  assert.ok(report.errors.some((item) => item.code === "BAD_CLAIM_FIELD"));
  writeJson(claimsFile, { schema_version: "1.0", candidate_id: "self-test", claims: [] });

  const malformedApplication = path.join(project, ".resume-harness", "applications", "malformed");
  const malformedRequirements = path.join(malformedApplication, "requirements.json");
  writeJson(malformedRequirements, {
    requirements: [null, { id: "REQ_BAD_SHAPE", classification: "must", match: "direct", quoted_text: "fixture", claim_ids: {} }],
  });
  result = run(["validate", "--project", project]);
  assert.equal(result.status, 1);
  report = parseReport(result);
  assert.ok(report.errors.some((item) => item.code === "INVALID_REQUIREMENT"));
  assert.ok(report.errors.some((item) => item.code === "BAD_REQUIREMENT_FIELD"));
  fs.rmSync(malformedRequirements);

  const malformedManifest = path.join(malformedApplication, "claim_map.json");
  writeJson(malformedManifest, { entries: [], outputs: {} });
  result = run(["audit", "--project", project]);
  assert.equal(result.status, 1);
  report = parseReport(result);
  assert.ok(report.errors.some((item) => item.code === "INVALID_OUTPUTS"));
  fs.rmSync(malformedManifest);

  writeJson(path.join(project, ".resume-harness", "protected_artifacts.json"), { schema_version: "1.0", artifacts: {} });
  result = run(["validate", "--project", project]);
  assert.equal(result.status, 1);
  report = parseReport(result);
  assert.ok(report.errors.some((item) => item.code === "INVALID_PROTECTED_ARTIFACTS"));
  writeJson(path.join(project, ".resume-harness", "protected_artifacts.json"), { schema_version: "1.0", artifacts: [] });
  tests.push("malformed claim, requirement, manifest, and protected-artifact shapes return structured errors");

  const outsideLinkedFile = path.join(sandbox, "outside-linked-file.txt");
  const harnessLinkedFile = path.join(project, ".resume-harness", "linked-file.txt");
  fs.writeFileSync(outsideLinkedFile, "outside fixture\n", "utf8");
  fs.symlinkSync(outsideLinkedFile, harnessLinkedFile, "file");
  result = run(["validate", "--project", project]);
  assert.equal(result.status, 1);
  report = parseReport(result);
  assert.ok(report.errors.some((item) => item.code === "HARNESS_LINK_NOT_ALLOWED"));
  result = run(["privacy-check", "--project", project]);
  assert.equal(result.status, 1);
  report = parseReport(result);
  assert.ok(report.errors.some((item) => item.code === "HARNESS_LINK_NOT_ALLOWED"));
  fs.rmSync(harnessLinkedFile);
  tests.push("linked files inside .resume-harness are rejected before validation or privacy scanning");

  const cardsFile = path.join(project, ".resume-harness", "experience_cards.json");
  const cards = JSON.parse(fs.readFileSync(cardsFile, "utf8"));
  cards.cards.push({ card_id: "EXP-001", status: "invented", actions: "not-an-array" });
  writeJson(cardsFile, cards);
  result = run(["validate", "--project", project]);
  assert.equal(result.status, 1);
  report = parseReport(result);
  assert.ok(report.errors.some((item) => item.code === "BAD_EXPERIENCE_STATUS"));
  assert.ok(report.errors.some((item) => item.code === "BAD_EXPERIENCE_FIELD"));
  cards.cards = [];
  writeJson(cardsFile, cards);
  tests.push("experience-card status and array fields are validated");

  result = run(["new-run", "--project", project]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--job-slug is required/u);
  assert.equal(fs.readdirSync(path.join(project, ".resume-harness", "runs")).some((name) => name.endsWith("_undefined")), false);

  result = run(["new-run", "--project", project, "--job-slug", "sample-role"]);
  assert.equal(result.status, 0, result.stderr);
  report = parseReport(result);
  for (const name of ["input", "work", "qa", "publish"]) assert.equal(fs.existsSync(path.join(report.run, name)), true);

  result = run(["new-run", "--project", project, "--job-slug", "a"]);
  assert.equal(result.status, 0, result.stderr);
  result = run(["new-run", "--project", project, "--job-slug", "a".repeat(81)]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /1-80 characters/u);

  const runsPath = path.join(project, ".resume-harness", "runs");
  const outsideRuns = path.join(sandbox, "outside-runs");
  fs.rmSync(runsPath, { recursive: true });
  fs.mkdirSync(outsideRuns);
  fs.symlinkSync(outsideRuns, runsPath, process.platform === "win32" ? "junction" : "dir");
  result = run(["new-run", "--project", project, "--job-slug", "escape-run"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Runs must stay inside/u);
  assert.deepEqual(fs.readdirSync(outsideRuns), []);
  fs.rmSync(runsPath, { recursive: true });
  fs.mkdirSync(runsPath);
  tests.push("new runs require an explicit valid slug");

  const original = path.join(project, "original.txt");
  fs.writeFileSync(original, "protected original\n", "utf8");
  writeJson(path.join(project, ".resume-harness", "protected_artifacts.json"), {
    schema_version: "1.0",
    artifacts: [{ path: "original.txt", overwrite: false, sha256: sha256(original) }],
  });
  const claimMap = path.join(project, ".resume-harness", "applications", "sample-role", "claim_map.json");
  writeJson(claimMap, { entries: [], outputs: [{ path: "./folder/../original.txt" }] });
  result = run(["audit", "--project", project]);
  assert.equal(result.status, 1);
  report = parseReport(result);
  assert.ok(report.errors.some((item) => item.code === "PROTECTED_OUTPUT_TARGET"));

  writeJson(claimMap, { entries: [], outputs: [{ path: path.join(project, "publish", "absolute.txt") }] });
  result = run(["audit", "--project", project]);
  assert.equal(result.status, 1);
  report = parseReport(result);
  assert.ok(report.errors.some((item) => item.code === "ABSOLUTE_OUTPUT_PATH"));

  writeJson(claimMap, { entries: [], outputs: [{ path: "../outside.txt" }] });
  result = run(["audit", "--project", project]);
  assert.equal(result.status, 1);
  report = parseReport(result);
  assert.ok(report.errors.some((item) => item.code === "OUTPUT_OUTSIDE_PROJECT"));

  const physicalDir = path.join(project, "physical");
  const aliasDir = path.join(project, "alias");
  fs.mkdirSync(physicalDir);
  const physicalOriginal = path.join(physicalDir, "symlinked-original.txt");
  fs.writeFileSync(physicalOriginal, "protected through a directory link\n", "utf8");
  fs.symlinkSync(physicalDir, aliasDir, process.platform === "win32" ? "junction" : "dir");
  writeJson(path.join(project, ".resume-harness", "protected_artifacts.json"), {
    schema_version: "1.0",
    artifacts: [
      { path: "original.txt", overwrite: false, sha256: sha256(original) },
      { path: "physical/symlinked-original.txt", overwrite: false, sha256: sha256(physicalOriginal) },
    ],
  });
  writeJson(claimMap, { entries: [], outputs: [{ path: "alias/symlinked-original.txt" }] });
  result = run(["audit", "--project", project]);
  assert.equal(result.status, 1);
  report = parseReport(result);
  assert.ok(report.errors.some((item) => item.code === "PROTECTED_OUTPUT_TARGET"));

  writeJson(claimMap, { entries: [], outputs: [{ path: "publish/new.txt" }] });
  result = run(["audit", "--project", project]);
  assert.equal(result.status, 0, result.stderr);
  tests.push("normalized and symlinked output paths cannot bypass protected-artifact checks");

  const outsideManifestDir = path.join(sandbox, "outside-manifest");
  const linkedManifestDir = path.join(project, "linked-manifest");
  fs.mkdirSync(outsideManifestDir);
  writeJson(path.join(outsideManifestDir, "claim_map.json"), { entries: [], outputs: [] });
  fs.symlinkSync(outsideManifestDir, linkedManifestDir, process.platform === "win32" ? "junction" : "dir");
  result = run(["audit", "--project", project, "--manifest", "linked-manifest/claim_map.json"]);
  assert.equal(result.status, 1);
  report = parseReport(result);
  assert.ok(report.errors.some((item) => item.code === "CLAIM_MAP_OUTSIDE_PROJECT"));
  tests.push("an explicit manifest cannot escape through a linked parent directory");

  const git = (args) => spawnSync("git", args, { cwd: project, encoding: "utf8", windowsHide: true });
  assert.equal(git(["init"]).status, 0);
  assert.equal(git(["config", "user.email", "self-test@example.invalid"]).status, 0);
  assert.equal(git(["config", "user.name", "Resume Harness Self Test"]).status, 0);
  fs.writeFileSync(path.join(project, ".gitignore"), ".resume-harness/\n", "utf8");
  fs.writeFileSync(path.join(project, "public.txt"), "tracked public fixture\n", "utf8");
  assert.equal(git(["add", ".gitignore", "public.txt"]).status, 0);
  result = run(["privacy-check", "--project", project]);
  assert.equal(result.status, 0, result.stderr);
  report = parseReport(result);
  assert.equal(report.valid, true);
  assert.equal(report.warnings.some((item) => item.code === "HARNESS_NOT_GIT_IGNORED"), false);

  const envFile = path.join(project, ".resume-harness", "review-secret.env");
  fs.writeFileSync(envFile, 'api_key="dummy_release_review_secret_123456"\n', "utf8");
  result = run(["privacy-check", "--project", project]);
  assert.equal(result.status, 1);
  report = parseReport(result);
  assert.ok(report.errors.some((item) => item.code === "POSSIBLE_SECRET_IN_HARNESS"));
  fs.rmSync(envFile);

  const utf16EnvFile = path.join(project, ".resume-harness", "review-secret-utf16.env");
  fs.writeFileSync(
    utf16EnvFile,
    Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('api_key="dummy_utf16_secret_123456"\n', "utf16le")]),
  );
  result = run(["privacy-check", "--project", project]);
  assert.equal(result.status, 1);
  report = parseReport(result);
  assert.ok(report.errors.some((item) => item.code === "POSSIBLE_SECRET_IN_HARNESS"));
  fs.rmSync(utf16EnvFile);

  const binaryFile = path.join(project, ".resume-harness", "binary.fixture");
  fs.writeFileSync(binaryFile, Buffer.from([1, 0, 2, 0, 3, 4, 0, 5]));
  result = run(["privacy-check", "--project", project]);
  assert.equal(result.status, 0, result.stderr);
  report = parseReport(result);
  assert.ok(report.warnings.some((item) => item.code === "PRIVACY_FILE_NOT_SCANNED" && item.reason === "binary-or-nul"));
  fs.rmSync(binaryFile);
  tests.push("privacy-check ignores unrelated tracked project files and checks only .resume-harness");

  console.log(JSON.stringify({ valid: true, tests }, null, 2));
} finally {
  fs.rmSync(sandbox, { recursive: true, force: true });
}
