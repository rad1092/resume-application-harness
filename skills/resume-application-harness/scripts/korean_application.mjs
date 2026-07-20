#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const VERSION = "1.1.0";
const UNIT_ALIASES = new Map([
  ["chars", "characters_including_whitespace"],
  ["characters", "characters_including_whitespace"],
  ["characters_including_whitespace", "characters_including_whitespace"],
  ["chars-with-spaces", "characters_including_whitespace"],
  ["chars-no-space", "characters_excluding_whitespace"],
  ["chars_without_spaces", "characters_excluding_whitespace"],
  ["characters_excluding_whitespace", "characters_excluding_whitespace"],
  ["chars-no-linebreak", "characters_excluding_linebreaks"],
  ["characters_excluding_linebreaks", "characters_excluding_linebreaks"],
  ["utf16", "utf16_units"],
  ["utf16_units", "utf16_units"],
  ["bytes", "utf8_bytes"],
  ["utf8", "utf8_bytes"],
  ["utf8-bytes", "utf8_bytes"],
  ["utf8_bytes", "utf8_bytes"],
  ["bytes-no-linebreak", "utf8_bytes_excluding_linebreaks"],
  ["utf8-bytes-no-linebreak", "utf8_bytes_excluding_linebreaks"],
  ["utf8_bytes_excluding_linebreaks", "utf8_bytes_excluding_linebreaks"],
  ["words", "words"],
]);

const QUESTION_TYPES = [
  {
    type: "지원동기",
    patterns: [/지원\s*동기/gu, /지원(?:한|하게\s*된)\s*(?:이유|계기)/gu, /왜\s+(?:우리|이)\s*(?:회사|기업|조직)/gu, /(?:회사|기업|조직)[을를]?\s*선택한\s*이유/gu],
  },
  {
    type: "직무역량",
    patterns: [/직무\s*(?:역량|능력|수행)/gu, /직무\s*(?:관련\s*)?경험/gu, /직무에\s*(?:필요한|적합한)/gu, /지원\s*직무/gu, /직무와\s*관련/gu, /(?:본인의|자신의)\s*(?:강점|역량)/gu, /직무\s*적합/gu],
  },
  {
    type: "성취",
    patterns: [/(?:가장\s*)?(?:큰|높은|의미\s*있는)?\s*(?:성취|성과)/gu, /목표를?\s*(?:달성|이룬)/gu, /성과를?\s*(?:낸|만든|창출)/gu],
  },
  {
    type: "도전·실패",
    patterns: [/도전/gu, /실패/gu, /좌절/gu, /어려움(?:을|이)?\s*(?:극복|해결)/gu, /난관/gu, /예상치\s*못한/gu],
  },
  {
    type: "협업·갈등",
    patterns: [/협업/gu, /팀워크/gu, /갈등/gu, /의견\s*(?:충돌|차이)/gu, /공동\s*(?:목표|과제)/gu, /팀(?:원|과|에서)/gu, /소통/gu],
  },
  {
    type: "문제해결",
    patterns: [/문제\s*(?:해결|를\s*해결)/gu, /원인\s*(?:분석|파악)/gu, /개선(?:한|했던|한\s*경험)?/gu, /해결(?:한)?\s*(?:과정|방법|경험)/gu, /대안을?\s*(?:찾|제시)/gu],
  },
  {
    type: "고객",
    patterns: [/고객/gu, /민원/gu, /서비스\s*(?:경험|품질|만족)/gu, /고객\s*만족/gu, /요구(?:사항|를)?\s*(?:파악|대응)/gu],
  },
  {
    type: "리더십",
    patterns: [/리더십/gu, /리더(?:로서|의)/gu, /팀을?\s*이끈/gu, /구성원을?\s*이끈/gu, /주도(?:한|적으로)/gu, /팀장/gu],
  },
  {
    type: "윤리·안전",
    patterns: [/윤리/gu, /정직/gu, /원칙/gu, /규정/gu, /안전/gu, /준법/gu, /책임\s*있는\s*판단/gu],
  },
  {
    type: "가치관",
    patterns: [/가치관/gu, /신념/gu, /성장\s*과정/gu, /중요하게\s*생각/gu, /인재상/gu, /삶의\s*(?:원칙|기준)/gu, /일하는\s*방식/gu],
  },
  {
    type: "성격·장단점",
    patterns: [/성격/gu, /장[·ㆍ\s]?단점/gu, /장점과?\s*(?:단점|보완점)/gu, /강점과?\s*(?:약점|보완점)/gu],
  },
  {
    type: "학습",
    patterns: [/학습/gu, /배운\s*점/gu, /성장/gu, /부족한\s*점/gu, /보완/gu, /자기\s*계발/gu, /새로운\s*(?:지식|기술|업무)/gu],
  },
  {
    type: "입사후계획",
    patterns: [/입사\s*후/gu, /입사\s*포부/gu, /향후\s*(?:계획|목표)/gu, /어떻게\s*기여/gu, /장래\s*(?:계획|목표)/gu, /직무에서\s*이루고/gu],
  },
  {
    type: "자유소개",
    patterns: [/자유롭게\s*(?:작성|기술|소개)/gu, /자기\s*소개/gu, /자신을?\s*소개/gu, /본인을?\s*소개/gu, /하고\s*싶은\s*말/gu],
  },
  {
    type: "공백기·직무전환",
    patterns: [/공백기/gu, /경력\s*공백/gu, /직무\s*전환/gu, /이직\s*(?:사유|이유)/gu, /진로를?\s*바꾼/gu],
  },
  {
    type: "사회·산업 이슈",
    patterns: [/사회\s*(?:문제|이슈)/gu, /산업\s*(?:이슈|동향|전망)/gu, /최근\s*(?:쟁점|이슈)/gu, /본인의?\s*(?:견해|의견|입장)/gu],
  },
];

const STYLE_GROUPS = [
  {
    code: "TRANSLATED_CONSTRUCTION",
    label: "번역투 또는 우회 표현",
    severity: "notice",
    suggestion: "실제 행동을 주어와 짧은 동사로 바로 쓰는 방안을 검토하세요.",
    patterns: [
      /(?:을|를)\s*통해(?:서)?/gu,
      /(?:을|를)\s*기반으로/gu,
      /(?:을|를)\s*바탕으로/gu,
      /관점에서\s*접근/gu,
      /에\s*있어서/gu,
      /에\s*의해(?:서)?/gu,
      /에\s*대해(?:서)?/gu,
      /(?:시간|기회)을?\s*가졌/gu,
      /(?:진행|수행|실시)되었/gu,
      /이루어졌/gu,
      /할\s*수\s*있었습니다/gu,
      /하게\s*되었습니다/gu,
    ],
  },
  {
    code: "LLM_CLICHE",
    label: "LLM 상투어 또는 추상 표현",
    severity: "notice",
    suggestion: "문구 자체보다 실제 상황·행동·결과가 드러나게 바꾸세요.",
    patterns: [
      /역량을?\s*발휘/gu,
      /(?:긍정적인\s*)?시너지(?:를?\s*창출)?/gu,
      /가치를?\s*창출/gu,
      /기여하고자\s*합니다/gu,
      /기여할\s*수\s*있습니다/gu,
      /끊임없는\s*(?:열정|노력)/gu,
      /지속적으로\s*성장/gu,
      /귀사의?\s*(?:발전|성장|비전)/gu,
      /최선을?\s*다하겠습니다/gu,
      /책임감을?\s*가지고/gu,
      /원활한\s*소통/gu,
      /한\s*단계\s*성장/gu,
      /값진\s*경험/gu,
      /몸소\s*깨달/gu,
      /소통의\s*중요성/gu,
      /준비된\s*인재/gu,
      /(?:회사|귀사)와\s*(?:함께|동반)\s*성장/gu,
    ],
  },
  {
    code: "VAGUE_MODIFIER",
    label: "근거가 흐려질 수 있는 수식어",
    severity: "notice",
    suggestion: "수식어를 빼도 의미가 같다면 삭제하고, 필요하면 근거를 덧붙이세요.",
    patterns: [
      /(?:탁월한|뛰어난|풍부한|강력한|혁신적인|효율적인|성공적인|유의미한|다양한)\s*(?:역량|능력|경험|성과|결과|방법|기술|관계|해결책)?/gu,
      /(?:매우|굉장히|상당히|대단히)\s*(?:높은|큰|좋은|뛰어난|중요한|효율적인)/gu,
    ],
  },
  {
    code: "NOMINALIZED_ACTION",
    label: "불필요한 명사화 또는 무거운 동사",
    severity: "notice",
    suggestion: "'무엇을 했다'처럼 구체적인 동작으로 풀어 쓰세요.",
    patterns: [
      /(?:진행|수행|실시|추진|도출|제고|극대화|증대|강화)(?:하였|했)(?:습니다|고|으며)/gu,
      /(?:효율성|생산성|만족도|경쟁력)\s*(?:제고|극대화|증대)/gu,
      /문제\s*해결\s*역량\s*강화/gu,
      /성과를?\s*창출하/gu,
      /결과를?\s*도출하/gu,
    ],
  },
];

const STRONG_CLAIMS = [
  /(?:업계|회사|팀|조직)?\s*(?:최고|최초|유일|압도적)/gu,
  /(?:완벽|완벽히|완전한|반드시|언제나|항상)/gu,
  /한\s*번도\s*(?:없|않)/gu,
  /무사고/gu,
  /(?:전문가|마스터|능통)/gu,
  /모든\s*(?:문제|업무|목표|고객)/gu,
];

function usage() {
  return {
    tool: "korean-application",
    version: VERSION,
    usage: [
      "node korean_application.mjs count --file PATH [--limit N --unit UNIT]",
      "node korean_application.mjs lint --file PATH [--question-file PATH] [--limit N --unit UNIT]",
      "node korean_application.mjs route-question --file PATH",
    ],
    units: [...new Set(UNIT_ALIASES.values())],
    notes: [
      "All commands are read-only and do not use the network.",
      "Lint warnings are review prompts, not automatic edits or prohibited-word rules.",
    ],
  };
}

function parseArgs(argv) {
  const command = argv[0];
  const options = {};
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    if (Object.hasOwn(options, key)) throw new Error(`Duplicate option: --${key}`);
    options[key] = value;
    index += 1;
  }
  return { command, options };
}

function assertOnlyOptions(options, allowed) {
  for (const key of Object.keys(options)) {
    if (!allowed.has(key)) throw new Error(`Unknown option: --${key}`);
  }
}

function readRequiredFile(value, option = "--file") {
  if (!value) throw new Error(`${option} is required`);
  const file = path.resolve(value);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`File not found: ${file}`);
  return { file, text: fs.readFileSync(file, "utf8") };
}

function normalizeUnit(value, fallback = "characters_including_whitespace") {
  const requested = value ?? fallback;
  const normalized = UNIT_ALIASES.get(String(requested).toLocaleLowerCase());
  if (!normalized) throw new Error(`Unknown unit: ${requested}`);
  return normalized;
}

function parseLimit(value) {
  if (value === undefined) return null;
  if (!/^\d+$/u.test(value)) throw new Error("--limit must be a non-negative integer");
  const limit = Number(value);
  if (!Number.isSafeInteger(limit)) throw new Error("--limit is too large");
  return limit;
}

function countText(text) {
  const trimmed = text.trim();
  const withoutLinebreaks = text.replace(/\r\n|\r|\n/gu, "");
  return {
    characters_including_whitespace: Array.from(text).length,
    characters_excluding_linebreaks: Array.from(withoutLinebreaks).length,
    characters_excluding_whitespace: Array.from(text.replace(/\s/gu, "")).length,
    utf16_units: text.length,
    utf8_bytes: Buffer.byteLength(text, "utf8"),
    utf8_bytes_excluding_linebreaks: Buffer.byteLength(withoutLinebreaks, "utf8"),
    words: trimmed ? trimmed.split(/\s+/u).length : 0,
  };
}

function buildLimitResult(counts, limit, unit) {
  if (limit === null) return null;
  const used = counts[unit];
  return {
    unit,
    limit,
    used,
    within_limit: used <= limit,
    remaining: Math.max(0, limit - used),
    over_by: Math.max(0, used - limit),
  };
}

function buildConstraintResult(counts, constraint, source = "question") {
  const used = counts[constraint.unit];
  const result = {
    source,
    kind: constraint.kind,
    unit: constraint.unit,
    limit: constraint.value,
    used,
    inclusive: constraint.inclusive,
    raw: constraint.raw,
  };
  if (constraint.kind === "minimum") {
    result.meets_minimum = constraint.inclusive ? used >= constraint.value : used > constraint.value;
    result.short_by = result.meets_minimum ? 0 : constraint.value - used + (constraint.inclusive ? 0 : 1);
  } else if (constraint.kind === "maximum") {
    result.within_limit = constraint.inclusive ? used <= constraint.value : used < constraint.value;
    result.remaining = result.within_limit ? Math.max(0, constraint.value - used - (constraint.inclusive ? 0 : 1)) : 0;
    result.over_by = result.within_limit ? 0 : Math.max(0, used - constraint.value + (constraint.inclusive ? 0 : 1));
  }
  return result;
}

function resetAndCollect(text, pattern) {
  pattern.lastIndex = 0;
  const matches = [];
  for (const match of text.matchAll(pattern)) {
    const value = match[0].trim();
    if (!value) continue;
    matches.push({ text: value, index: match.index });
  }
  return matches;
}

function uniqueEvidence(matches, max = 8) {
  const seen = new Set();
  const result = [];
  for (const match of matches) {
    const key = match.text;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(match);
    if (result.length >= max) break;
  }
  return result;
}

function extractLimits(text) {
  const constraints = [];
  const coveredRanges = [];
  const rangeRegex = /(\d[\d,]*)\s*(자|글자|bytes?|바이트|kb)?\s*(?:~|～|-|–|—|에서)\s*(\d[\d,]*)\s*(자|글자|bytes?|바이트|kb)/giu;
  for (const match of text.matchAll(rangeRegex)) {
    const minValue = Number(match[1].replaceAll(",", ""));
    const maxValue = Number(match[3].replaceAll(",", ""));
    if (!Number.isSafeInteger(minValue) || !Number.isSafeInteger(maxValue) || minValue > maxValue) continue;
    const rawUnit = match[4].toLocaleLowerCase();
    const around = text.slice(Math.max(0, match.index - 18), Math.min(text.length, match.index + match[0].length + 18));
    let unit;
    let normalizedMin = minValue;
    let normalizedMax = maxValue;
    if (["byte", "bytes", "바이트"].includes(rawUnit)) unit = "utf8_bytes";
    else if (rawUnit === "kb") {
      unit = "utf8_bytes";
      normalizedMin *= 1024;
      normalizedMax *= 1024;
    } else if (/공백\s*제외/u.test(around)) unit = "characters_excluding_whitespace";
    else unit = "characters_including_whitespace";
    constraints.push({ raw: match[0], value: normalizedMin, unit, kind: "minimum", inclusive: true, index: match.index });
    constraints.push({ raw: match[0], value: normalizedMax, unit, kind: "maximum", inclusive: true, index: match.index });
    coveredRanges.push([match.index, match.index + match[0].length]);
  }
  const regex = /(?:(최소|최대)\s*)?(\d[\d,]*)\s*(자|글자|bytes?|바이트|kb)\s*(이내|이하|미만|이상|초과|내외)?/giu;
  for (const match of text.matchAll(regex)) {
    if (coveredRanges.some(([start, end]) => match.index >= start && match.index < end)) continue;
    const rawNumber = Number(match[2].replaceAll(",", ""));
    if (!Number.isSafeInteger(rawNumber)) continue;
    const rawUnit = match[3].toLocaleLowerCase();
    const around = text.slice(Math.max(0, match.index - 18), Math.min(text.length, match.index + match[0].length + 10));
    let unit;
    let value = rawNumber;
    if (["byte", "bytes", "바이트"].includes(rawUnit)) unit = "utf8_bytes";
    else if (rawUnit === "kb") {
      unit = "utf8_bytes";
      value *= 1024;
    } else if (/공백\s*제외/u.test(around)) unit = "characters_excluding_whitespace";
    else unit = "characters_including_whitespace";

    const qualifier = match[4] ?? "";
    let kind = "stated";
    if (match[1] === "최소" || qualifier === "이상" || qualifier === "초과") kind = "minimum";
    if (match[1] === "최대" || ["이내", "이하", "미만"].includes(qualifier)) kind = "maximum";
    if (qualifier === "내외") kind = "approximate";
    constraints.push({
      raw: match[0],
      value,
      unit,
      kind,
      inclusive: !["미만", "초과"].includes(qualifier),
      index: match.index,
    });
  }
  return constraints.sort((a, b) => a.index - b.index || (a.kind === "minimum" ? -1 : 1));
}

function routeQuestion(text) {
  const types = [];
  for (const definition of QUESTION_TYPES) {
    const signals = [];
    let score = 0;
    for (const pattern of definition.patterns) {
      const matches = resetAndCollect(text, pattern);
      score += matches.length;
      signals.push(...matches.map((item) => item.text));
    }
    if (score > 0) types.push({ type: definition.type, score, signals: [...new Set(signals)].slice(0, 8) });
  }
  types.sort((a, b) => b.score - a.score || QUESTION_TYPES.findIndex((item) => item.type === a.type) - QUESTION_TYPES.findIndex((item) => item.type === b.type));
  const constraints = extractLimits(text);
  const maximums = constraints.filter((item) => item.kind === "maximum");
  const minimums = constraints.filter((item) => item.kind === "minimum");
  return {
    primary_type: types[0]?.type ?? "분류되지 않음",
    types,
    constraints,
    minimum_limits: minimums.map(({ value, unit, inclusive, raw }) => ({ value, unit, inclusive, raw })),
    maximum_limits: maximums.map(({ value, unit, inclusive, raw }) => ({ value, unit, inclusive, raw })),
  };
}

function sentenceList(text) {
  return text
    .split(/(?<=[.!?。！？])\s+|\n+/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function paragraphList(text) {
  return text
    .split(/(?:\r?\n){2,}/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function sentenceEnding(sentence) {
  const cleaned = sentence.replace(/[.!?。！？"'”’）)\]]+$/gu, "").trim();
  const match = cleaned.match(/(하였습니다|되었습니다|했습니다|였습니다|있습니다|없습니다|겠습니다|입니다|합니다|됩니다|습니다)$/u);
  return match?.[1] ?? null;
}

function addStyleWarnings(text, warnings) {
  for (const group of STYLE_GROUPS) {
    const matches = group.patterns.flatMap((pattern) => resetAndCollect(text, pattern));
    if (matches.length === 0) continue;
    warnings.push({
      code: group.code,
      severity: group.severity,
      message: `${group.label} ${matches.length}건을 검토하세요.`,
      count: matches.length,
      evidence: uniqueEvidence(matches),
      suggestion: group.suggestion,
    });
  }
}

function addPronounWarning(text, sentences, warnings) {
  const matches = resetAndCollect(text, /(?:저는|저의|제가|저를|저에게|저도)(?=\s|[,.!?。！？]|$)/gu);
  const sentenceStarts = sentences.filter((sentence) => /^(?:저는|저의|제가|저를|저에게|저도)(?=\s|[,.!?。！？]|$)/u.test(sentence)).length;
  if (matches.length >= 4 || sentenceStarts >= 3) {
    warnings.push({
      code: "REPEATED_FIRST_PERSON",
      severity: "notice",
      message: "1인칭 표현이 반복되어 문장 흐름이 단조로울 수 있습니다.",
      count: matches.length,
      sentence_start_count: sentenceStarts,
      evidence: uniqueEvidence(matches),
      suggestion: "주어가 분명한 문장에서는 '저는/제가/저의'를 덜어내도 뜻이 통하는지 확인하세요.",
    });
  }
}

function addLengthWarnings(sentences, paragraphs, warnings) {
  const longSentences = sentences
    .map((sentence, index) => ({ index: index + 1, characters: Array.from(sentence).length, excerpt: sentence.slice(0, 140) }))
    .filter((item) => item.characters > 90);
  if (longSentences.length) {
    warnings.push({
      code: "LONG_SENTENCE",
      severity: "notice",
      message: "90자를 넘는 문장은 핵심 행동이나 결과를 나누어 쓰는 방안을 검토하세요.",
      count: longSentences.length,
      evidence: longSentences.slice(0, 8),
    });
  }
  const longParagraphs = paragraphs
    .map((paragraph, index) => ({ index: index + 1, characters: Array.from(paragraph).length, excerpt: paragraph.slice(0, 140) }))
    .filter((item) => item.characters > 350);
  if (longParagraphs.length) {
    warnings.push({
      code: "LONG_PARAGRAPH",
      severity: "notice",
      message: "350자를 넘는 문단은 한 문단에 메시지가 여러 개 섞였는지 검토하세요.",
      count: longParagraphs.length,
      evidence: longParagraphs.slice(0, 8),
    });
  }
}

function addEndingWarning(sentences, warnings) {
  const endings = sentences.map(sentenceEnding);
  const runs = [];
  let runStart = 0;
  for (let index = 1; index <= endings.length; index += 1) {
    if (index < endings.length && endings[index] && endings[index] === endings[runStart]) continue;
    if (endings[runStart] && index - runStart >= 3) {
      runs.push({ ending: endings[runStart], count: index - runStart, sentence_from: runStart + 1, sentence_to: index });
    }
    runStart = index;
  }
  if (runs.length) {
    warnings.push({
      code: "REPEATED_SENTENCE_ENDING",
      severity: "notice",
      message: "같은 문장 어미가 세 번 이상 이어집니다.",
      evidence: runs,
      suggestion: "사실관계는 유지하되 문장 길이와 연결 방식을 조정해 단조로움을 줄이세요.",
    });
  }
}

function addVerificationWarnings(text, warnings) {
  const numericPatterns = [
    /(?<![A-Za-z가-힣])\d[\d,]*(?:\.\d+)?\s*(?:%|퍼센트|배|건|명|회|년|개월|일|시간|분|원|만원|억|km|킬로미터|대|개|점)?/giu,
  ];
  const numeric = numericPatterns.flatMap((pattern) => resetAndCollect(text, pattern));
  if (numeric.length) {
    warnings.push({
      code: "VERIFY_NUMERIC_CLAIM",
      severity: "verify",
      message: "숫자·기간·규모는 원자료나 본인 확인이 필요합니다.",
      count: numeric.length,
      evidence: uniqueEvidence(numeric, 12),
      suggestion: "날짜, 인원, 금액, 비율, 횟수의 근거와 계산 기준을 확인하세요.",
    });
  }
  const strong = STRONG_CLAIMS.flatMap((pattern) => resetAndCollect(text, pattern));
  if (strong.length) {
    warnings.push({
      code: "VERIFY_STRONG_CLAIM",
      severity: "verify",
      message: "최상급·절대 표현은 사실 범위와 근거를 확인해야 합니다.",
      count: strong.length,
      evidence: uniqueEvidence(strong),
      suggestion: "입증할 수 없다면 실제 범위와 조건을 밝혀 더 정확하게 쓰세요.",
    });
  }
}

function lintText(text, { limit = null, unit = "characters_including_whitespace", questionText = null } = {}) {
  const counts = countText(text);
  const question = questionText === null ? null : routeQuestion(questionText);
  const limitChecks = limit === null
    ? (question?.constraints ?? [])
      .filter((item) => item.kind === "minimum" || item.kind === "maximum")
      .map((item) => buildConstraintResult(counts, item, "question"))
    : [
      buildConstraintResult(counts, {
        kind: "maximum",
        unit,
        value: limit,
        inclusive: true,
        raw: `--limit ${limit} --unit ${unit}`,
      }, "command-line"),
    ];

  const warnings = [];
  addStyleWarnings(text, warnings);
  const sentences = sentenceList(text);
  const paragraphs = paragraphList(text);
  addPronounWarning(text, sentences, warnings);
  addLengthWarnings(sentences, paragraphs, warnings);
  addEndingWarning(sentences, warnings);
  addVerificationWarnings(text, warnings);

  for (const check of limitChecks) {
    if (check.kind === "maximum" && !check.within_limit) {
      warnings.push({
        code: "LIMIT_EXCEEDED",
        severity: "fix",
        message: `${check.unit} 기준 ${check.over_by}만큼 제한을 초과했습니다.`,
        limit: check,
      });
    }
    if (check.kind === "minimum" && !check.meets_minimum) {
      warnings.push({
        code: "MINIMUM_NOT_MET",
        severity: "fix",
        message: `${check.unit} 기준 최소 분량보다 ${check.short_by}만큼 부족합니다.`,
        limit: check,
      });
    }
  }

  const primaryLimit = limitChecks.find((item) => item.kind === "maximum") ?? null;

  return {
    counts,
    limit: primaryLimit,
    limit_checks: limitChecks,
    question,
    warning_count: warnings.length,
    warnings,
    advisory_only: true,
  };
}

function emit(value, exitCode = 0) {
  console.log(JSON.stringify(value, null, 2));
  process.exitCode = exitCode;
}

function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (!command || command === "help" || command === "--help") {
    emit(usage(), command ? 0 : 2);
    return;
  }

  if (command === "count") {
    assertOnlyOptions(options, new Set(["file", "limit", "unit"]));
    const { file, text } = readRequiredFile(options.file);
    const counts = countText(text);
    const limit = parseLimit(options.limit);
    const unit = normalizeUnit(options.unit);
    emit({ tool: "korean-application", version: VERSION, command, file, counts, limit: buildLimitResult(counts, limit, unit) });
    return;
  }

  if (command === "route-question") {
    assertOnlyOptions(options, new Set(["file"]));
    const { file, text } = readRequiredFile(options.file);
    emit({ tool: "korean-application", version: VERSION, command, file, ...routeQuestion(text) });
    return;
  }

  if (command === "lint") {
    assertOnlyOptions(options, new Set(["file", "question-file", "limit", "unit"]));
    const { file, text } = readRequiredFile(options.file);
    const question = options["question-file"] ? readRequiredFile(options["question-file"], "--question-file") : null;
    const limit = parseLimit(options.limit);
    const unit = normalizeUnit(options.unit);
    emit({
      tool: "korean-application",
      version: VERSION,
      command,
      file,
      question_file: question?.file ?? null,
      ...lintText(text, { limit, unit, questionText: question?.text ?? null }),
    });
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({ tool: "korean-application", version: VERSION, valid: false, error: String(error.message ?? error), help: usage() }, null, 2));
  process.exitCode = 2;
}
