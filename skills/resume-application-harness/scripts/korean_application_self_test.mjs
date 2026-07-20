#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "korean_application.mjs");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "korean-application-test-"));

function write(name, text) {
  const file = path.join(temp, name);
  fs.writeFileSync(file, text, "utf8");
  return file;
}

function run(args, expectedStatus = 0) {
  const result = spawnSync(process.execPath, [script, ...args], { encoding: "utf8", windowsHide: true });
  assert.equal(result.status, expectedStatus, `command failed: ${args.join(" ")}\nstdout=${result.stdout}\nstderr=${result.stderr}`);
  const output = expectedStatus === 0 ? result.stdout : result.stderr;
  return JSON.parse(output);
}

try {
  const countFile = write("count.txt", "가 나\n😀");
  const counted = run(["count", "--file", countFile, "--limit", "12", "--unit", "utf8-bytes"]);
  assert.deepEqual(counted.counts, {
    characters_including_whitespace: 5,
    characters_excluding_linebreaks: 4,
    characters_excluding_whitespace: 3,
    utf16_units: 6,
    utf8_bytes: 12,
    utf8_bytes_excluding_linebreaks: 11,
    words: 3,
  });
  assert.equal(counted.limit.within_limit, true);
  assert.equal(counted.limit.remaining, 0);

  const questionFile = write(
    "question.txt",
    "우리 회사에 지원한 이유와 팀 내 의견 충돌을 해결한 경험을 공백 포함 500자 이내, 1,500 byte 이하로 작성해 주세요.",
  );
  const routed = run(["route-question", "--file", questionFile]);
  const routeTypes = new Set(routed.types.map((item) => item.type));
  assert.equal(routeTypes.has("지원동기"), true);
  assert.equal(routeTypes.has("협업·갈등"), true);
  assert.equal(routeTypes.has("문제해결"), true);
  assert.deepEqual(
    routed.maximum_limits.map((item) => [item.value, item.unit]),
    [
      [500, "characters_including_whitespace"],
      [1500, "utf8_bytes"],
    ],
  );

  const particleQuestion = write("particle-question.txt", "우리 회사를 선택한 이유와 직무에 적합한 근거, 입사 후 계획을 700자 이내로 작성해 주세요.");
  const particleRouted = run(["route-question", "--file", particleQuestion]);
  const particleTypes = new Set(particleRouted.types.map((item) => item.type));
  assert.equal(particleTypes.has("지원동기"), true);
  assert.equal(particleTypes.has("직무역량"), true);
  assert.equal(particleTypes.has("입사후계획"), true);
  assert.equal(particleTypes.has("공백기·직무전환"), false);

  const jobExperienceQuestion = write("job-experience-question.txt", "지원 동기와 직무 관련 경험을 1,500 byte 이내로 작성해 주세요.");
  const jobExperienceRouted = run(["route-question", "--file", jobExperienceQuestion]);
  const jobExperienceTypes = new Set(jobExperienceRouted.types.map((item) => item.type));
  assert.equal(jobExperienceTypes.has("지원동기"), true);
  assert.equal(jobExperienceTypes.has("직무역량"), true);

  const rangeQuestion = write("range-question.txt", "경험을 공백 포함 300~700자로 작성해 주세요.");
  const ranged = run(["route-question", "--file", rangeQuestion]);
  assert.deepEqual(ranged.minimum_limits.map((item) => [item.value, item.unit]), [[300, "characters_including_whitespace"]]);
  assert.deepEqual(ranged.maximum_limits.map((item) => [item.value, item.unit]), [[700, "characters_including_whitespace"]]);

  const exactLimitFile = write("exact-limit.txt", "가".repeat(700));
  const exclusiveMaximumQuestion = write("exclusive-maximum.txt", "공백 포함 700자 미만으로 작성해 주세요.");
  const exclusiveMaximum = run(["lint", "--file", exactLimitFile, "--question-file", exclusiveMaximumQuestion]);
  const maximumCheck = exclusiveMaximum.limit_checks.find((item) => item.kind === "maximum");
  assert.equal(maximumCheck.within_limit, false);
  assert.equal(maximumCheck.over_by, 1);

  const exclusiveMinimumQuestion = write("exclusive-minimum.txt", "공백 포함 700자 초과로 작성해 주세요.");
  const exclusiveMinimum = run(["lint", "--file", exactLimitFile, "--question-file", exclusiveMinimumQuestion]);
  const minimumCheck = exclusiveMinimum.limit_checks.find((item) => item.kind === "minimum");
  assert.equal(minimumCheck.meets_minimum, false);
  assert.equal(minimumCheck.short_by, 1);

  const longClause = "고객의 요청을 정확히 확인하지 않은 채 여러 부서와 계속 협의하고 불필요한 보고를 반복하면서 구체적인 행동과 판단 기준을 설명하지 못한 문장을 길게 이어 썼습니다";
  const lintFile = write(
    "lint.txt",
    `저는 탁월한 역량을 발휘하여 업계 최고 성과를 창출하였습니다. 저는 원활한 소통을 통해 기여하고자 합니다. 저는 2025년에 100% 목표를 달성했습니다. 저는 무사고 전문가입니다. ${longClause}${longClause}.`,
  );
  const linted = run(["lint", "--file", lintFile, "--question-file", questionFile]);
  const warningCodes = new Set(linted.warnings.map((item) => item.code));
  for (const code of [
    "TRANSLATED_CONSTRUCTION",
    "LLM_CLICHE",
    "VAGUE_MODIFIER",
    "NOMINALIZED_ACTION",
    "REPEATED_FIRST_PERSON",
    "LONG_SENTENCE",
    "VERIFY_NUMERIC_CLAIM",
    "VERIFY_STRONG_CLAIM",
  ]) {
    assert.equal(warningCodes.has(code), true, `missing lint warning: ${code}`);
  }
  assert.equal(linted.limit.source, "question");
  assert.equal(linted.limit_checks.length, 2);
  assert.equal(linted.question.types.some((item) => item.type === "지원동기"), true);

  const endingFile = write("endings.txt", "자료를 확인했습니다. 원인을 파악했습니다. 절차를 개선했습니다.");
  const endings = run(["lint", "--file", endingFile]);
  assert.equal(endings.warnings.some((item) => item.code === "REPEATED_SENTENCE_ENDING"), true);

  const naturalFile = write("natural.txt", "출발 전에 물품 수량과 거래처를 확인했습니다. 일정이 바뀌면 확인된 내용만 담당자에게 알렸습니다.");
  const natural = run(["lint", "--file", naturalFile]);
  for (const code of ["TRANSLATED_CONSTRUCTION", "LLM_CLICHE", "VAGUE_MODIFIER", "NOMINALIZED_ACTION"]) {
    assert.equal(natural.warnings.some((item) => item.code === code), false, `unexpected warning: ${code}`);
  }

  const invalid = run(["count", "--file", countFile, "--unit", "unknown"], 2);
  assert.equal(invalid.valid, false);

  console.log(JSON.stringify({
    valid: true,
    tests: [
      "Unicode character, whitespace, UTF-16, UTF-8 byte, and word counts",
      "character and byte maximum extraction from a compound company question",
      "minimum and maximum extraction from a character range",
      "documented utf8-bytes alias and exclusive-limit deltas",
      "multi-type question routing",
      "Korean object-particle routing for company-choice questions",
      "routing for common 직무 경험 wording",
      "Korean style, repetition, length, numeric, and strong-claim lint warnings",
      "repeated sentence-ending detection",
      "low-noise result for plain Korean",
      "JSON error reporting for invalid units",
    ],
  }, null, 2));
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
