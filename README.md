# 한국형 이력서·자소서 작성 하네스

[![test](https://github.com/rad1092/resume-application-harness/actions/workflows/test.yml/badge.svg)](https://github.com/rad1092/resume-application-harness/actions/workflows/test.yml)

말을 잘 정리하지 못해도 괜찮습니다. 산만하게 말한 경험을 짧은 후속 질문으로 확인하고, 사실의 범위를 유지한 채 회사별 이력서·경력기술서·자기소개서로 바꾸는 Codex 스킬입니다.

English summary: an evidence-first Korean job-application interviewer that turns unstructured recollections into confirmed experience cards and company-specific drafts.

## 왜 만들었나

일반적인 생성형 AI는 사용자가 이미 잘 정리된 경험을 주리라 가정하거나, 빈칸을 그럴듯한 수치·직책·성과로 채우기 쉽습니다. 국내 지원서는 회사마다 문항과 분량 단위도 다르고, 번역투와 추상적인 역량 표현은 읽기 어렵습니다.

이 스킬은 다음 순서로 접근합니다.

1. 한 번에 2~4개 질문만 묻습니다.
2. 주저리주저리 말한 내용을 경험 카드로 나눕니다.
3. 확인된 사실, 아직 모르는 내용, 초안에서 뺀 추정을 구분합니다.
4. 회사 문항의 하위 질문과 글자·byte 제한을 분석합니다.
5. 확인된 사실만 자연스러운 한국어 초안으로 바꿉니다.
6. 번역투·상투어·반복·긴 문장과 강한 주장을 검사합니다.

`참여`를 `주도`로, 팀 결과를 개인 성과로, `과장`을 사람 관리가 확인되지 않은 `Manager`로 키우지 않는 것이 기본 원칙입니다.

## 주요 기능

- `모름`, `없음`, `기억 안 남`, `건너뛰기`, `나중에`를 허용하는 단계별 인터뷰
- 정규직뿐 아니라 아르바이트·납품·현장·수업·개인 프로젝트에서 경험 발굴
- 지원동기, 직무역량, 협업, 실패, 안전, 고객, 공백기 등 회사별 문항 분해
- 공백 포함·제외 문자, UTF-8 byte, 단어 수 계산
- 한국어 번역투·LLM 상투어·근거 없는 강한 표현 경고
- 팀과 개인의 역할, 직책과 실제 권한, 학습과 실무 경험 분리
- 재사용 가능한 경험 카드와 사실 → 표현 → 제출 문장 연결
- 사진 포함 국내 이력서, 블라인드 지원서, 영문 ATS 출력 규칙 분리

## 하지 않는 일

- 없는 경험·수치·직책·성과를 만들지 않습니다.
- AI 작성 여부를 판정하거나 탐지 회피를 약속하지 않습니다.
- 합격 가능성이나 비공개 ATS 점수를 예측하지 않습니다.
- 자동 지원·외부 업로드·채용공고 무단 수집을 하지 않습니다.
- 회사명만 바꾼 범용 자기소개서를 완성본으로 취급하지 않습니다.

## 설치

필수 환경은 Codex와 Node.js 20 이상입니다. 핵심 대화 흐름에는 외부 패키지가 필요하지 않으며, Node.js는 글자 수 검사와 로컬 하네스에 사용합니다.

```powershell
git clone https://github.com/rad1092/resume-application-harness.git
New-Item -ItemType Directory "$HOME\.codex\skills" -Force | Out-Null
Copy-Item -Recurse ".\resume-application-harness\skills\resume-application-harness" "$HOME\.codex\skills\"
```

macOS·Linux:

```bash
git clone https://github.com/rad1092/resume-application-harness.git
mkdir -p ~/.codex/skills
cp -R resume-application-harness/skills/resume-application-harness ~/.codex/skills/
```

같은 이름의 스킬이 이미 있으면 먼저 기존 폴더를 백업하거나 차이를 확인하십시오. 설치 뒤 Codex에서 새 작업을 열고 아래처럼 호출합니다.

```text
$resume-application-harness 기본 한글 이력서와 자소서를 만들자. 한 번에 질문 3개씩 해줘.
```

```text
$resume-application-harness 내가 경험을 막 말할 테니 사실과 추정을 나누고 경험 카드부터 정리해줘.
```

```text
$resume-application-harness 아래 회사 문항을 분석해서 공백 포함 700자에 맞춰줘.
[공고와 문항]
```

## 검사 도구

```powershell
node <skill-dir>\scripts\korean_application.mjs count --file draft.txt --limit 700 --unit chars
node <skill-dir>\scripts\korean_application.mjs lint --file draft.txt --question-file question.txt --limit 700 --unit chars
node <skill-dir>\scripts\resume_harness.mjs init --project <resume-project> --candidate-id <stable-id>
node <skill-dir>\scripts\resume_harness.mjs validate --project <resume-project>
node <skill-dir>\scripts\resume_harness.mjs privacy-check --project <resume-project>
```

영문 ATS 참고 진단용 `resuml` 래퍼는 선택 기능입니다. 설치·제한 사항은 [resuml-safety.md](skills/resume-application-harness/references/resuml-safety.md)를 확인하십시오.

## 테스트

```powershell
npm test
npm run test:resuml
```

현재 회귀 테스트는 잘못된 옵션의 쓰기 차단, 초기화 멱등성, 경험 카드 상태, 누락된 작업 식별자, 보호 파일 경로 우회, Git 개인정보 검사 범위, 한국어 분량·문체 검사, 제한형 MCP 경계를 다룹니다. 자세한 결과와 한계는 [평가 보고서](docs/evaluation.md), 실제 대화 형태는 [가상 예시](docs/example-transcript.md)에 정리했습니다.

## 개인정보

실제 이력서, 사진, 연락처, 회사별 초안은 이 저장소에 넣지 않습니다. 장기 작업 상태는 각 지원 프로젝트의 `.resume-harness/`에 저장되므로 해당 폴더를 반드시 `.gitignore`에 추가하십시오. 데이터는 평문 JSON이므로 민감한 원문 전체보다 필요한 사실과 출처 위치만 기록하는 편이 안전합니다.

## 공개 상태

현재는 공개 베타입니다. 대화형 질문 품질은 사용하는 모델과 입력 맥락의 영향을 받으며, 정규식 문항 분류는 보조 진단입니다. 회사 공고·블라인드 규칙·기업 사실은 지원 시점의 공식 자료로 다시 확인해야 합니다.

구성요소 버전:

| 구성요소 | 버전 |
|---|---:|
| 공개 저장소 | 0.1.0 |
| 한국어 검사기 | 1.1.0 |
| 상태·사실 하네스 | 1.2.0 |
| 제한형 `resuml` MCP 래퍼 | 1.0.0 |

검사 결과에는 초안 일부와 로컬 절대 경로가 포함될 수 있습니다. 공개 CI 로그나 이슈에 실제 지원자 데이터로 실행한 결과를 붙이지 마십시오.

## 라이선스

[MIT](LICENSE). 선택 기능이 사용하는 `resuml`은 ISC 라이선스의 외부 의존성입니다.
