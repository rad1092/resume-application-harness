# 최종 사실·표현 원장

## 언제 쓰는가

사용자 인터뷰를 시작할 때 이 원장부터 채우게 하지 않는다. 경험 카드와 초안이 생긴 뒤, 최종 제출 문장에 기간·수치·직책·성과·숙련도처럼 범위가 중요한 주장이 있을 때만 사용한다.

개인정보와 원문 문서는 전역 스킬 폴더에 저장하지 않는다. 프로젝트의 `.resume-harness` 안에 최소한의 사실과 출처 위치만 둔다.

## 출처

```json
{
  "id": "SRC_USER_001",
  "type": "user-attested",
  "uri": "conversation://current-task",
  "locator": "사용자가 해당 사실과 범위를 직접 확인함",
  "sha256": null,
  "verified_on": "YYYY-MM-DD"
}
```

출처 유형:

- `document-verified`: 기존 이력서, 경력증명, 자격증, 수료증 등에서 확인
- `portfolio-verified`: 공개 포트폴리오나 저장소 결과물에서 확인
- `public-source-verified`: 회사 공고, 정부·표준·제품 공식 자료에서 확인
- `user-attested`: 사용자가 자신의 경험 범위를 직접 확인
- `learning-completed`: 사용자가 학습 자료를 읽고 설명할 수 있다고 확인
- `inferred`: 모델의 추정. 제출 문장에 쓰지 않음

사용자 진술은 정당한 출처다. 모든 개인 경험에 서류 증빙을 요구하지 말고 `user-attested`로 좁게 기록한다.

사용자가 `이렇게 써 달라`며 제시한 완성 문구나 예시는 사실 확인이 아니다. 문구 속 기간·수치·직책·성과·숙련도·역할을 각각 질문해 확인한 뒤에만 `user-attested`로 기록한다.

## 사실

```json
{
  "id": "F_EXP_001_SCHEDULE",
  "category": "work-schedule",
  "status": "approved",
  "verification": "user-attested",
  "source_ids": ["SRC_USER_001"],
  "scope": {
    "experience_card_id": "EXP-001",
    "statement": "해당 근무 기간에 주 6일 일정으로 일함",
    "excluded": "매주 모든 주말과 공휴일에 빠짐없이 근무했다는 뜻은 아님"
  },
  "quantity": {
    "value": 6,
    "unit": "days-per-week",
    "precision": "schedule-description",
    "calculation": "user-attested"
  },
  "allow_numeric_claims": true,
  "last_verified": "YYYY-MM-DD"
}
```

상태:

- `approved`: 확인된 범위로 사용할 수 있음
- `conditional`: 조건을 완료한 뒤에만 사용할 수 있음
- `provisional`: 확인 대기
- `forbidden`: 사실에서 넘어가는 표현을 막기 위해 보관
- `retired`: 사용자가 바로잡아 더 이상 쓰지 않음

## 제출 표현

```json
{
  "id": "C_EXP_001_SCHEDULE",
  "status": "approved",
  "fact_ids": ["F_EXP_001_SCHEDULE"],
  "profiles": ["ko-photo", "ko-blind", "en-ats", "job-targeted"],
  "wording": {
    "ko": ["해당 근무 기간에는 주 6일 일정으로 일했습니다."],
    "en": ["Worked six-day schedules during this employment period."]
  },
  "prohibited": [
    "하루도 쉬지 않고 일했습니다",
    "worked every weekend without exception"
  ],
  "conditions": [],
  "last_verified": "YYYY-MM-DD"
}
```

확인된 사실의 범위를 유지하는 여러 문장 표현을 둘 수 있다. 새 표현이 강도를 바꾸면 `provisional`로 두고 확인한다.

## 수치

기간, 횟수, 비율, 금액, 점수, 인원, 처리량, 거리, 버전은 구조화한다.

```json
{
  "quantity": {
    "value": {"min": 10, "max": 15},
    "unit": "cases-per-day",
    "precision": "approximate-range",
    "calculation": "사용자의 당시 기록 기반 추정 범위"
  },
  "allow_numeric_claims": true
}
```

- `약`, `평균`, 범위, 기억에 따른 추정임을 보존한다.
- `약 4년`을 `4년 이상`으로 바꾸지 않는다.
- 수치가 없으면 질적 결과를 찾고 숫자를 만들지 않는다.

## 직책과 역할

다음을 별도 사실로 둔다.

- 공식 현지 직책
- 승인된 영문 번역
- 실제 담당 업무
- 사람 관리, 채용, 평가, 예산, 승인 권한의 유무

회사 공식 영문 직급이나 사용자가 확인한 번역이 있으면 그 표기를 쓴다. 확인이 없으면 원 직급을 유지하거나 `Gwajang (Korean job grade)`처럼 기능·등급과 사람 관리를 구분하는 표기를 먼저 검토한다. `과장`을 `Manager`로 번역했더라도 그 사실만으로 부하 직원·채용·평가·부서장·예산 책임을 추론하지 않는다. 직함과 리더십 경험도 별도로 본다.

## 숙련도와 학습

- `사용함`, `일상적으로 사용`, `기본 기능 사용`, `독립 수행`, `고급`, `전문가`를 구분한다.
- 소프트웨어 이름이 있다는 이유로 구체 기능을 만들지 않는다.
- 학습 자료를 읽은 사실은 기초 이해가 될 수 있지만 실무 경험이 되지 않는다.
- 외국어는 문서 읽기, 메일, 회의, 고객 대응 등 실제 사용 범위로 쓴다.

## 회사 요구사항 매핑

```json
{
  "id": "REQ_001",
  "quoted_text": "공고에서 그대로 옮긴 요구사항",
  "classification": "responsibility",
  "priority": "must",
  "match": "transferable",
  "claim_ids": ["C_EXP_001_SCHEDULE"],
  "destination": ["resume", "self-introduction", "interview"]
}
```

분류:

- `must`, `preferred`, `responsibility`, `work-condition`

일치 상태:

- `direct`: 같은 업무를 실제로 함
- `transferable`: 다른 맥락의 유사 행동
- `learning-only`: 학습만 함
- `declared-availability`: 근무 조건에 동의한다고 직접 확인
- `gap`: 현재 근거 없음

공고의 요구사항을 지원자의 경험으로 복사하지 않는다. `learning-only`나 `gap`을 기술 목록에 넣지 않는다.

## 최종 문장 매핑

```json
{
  "id": "OUT_Q1_001",
  "destination": "self-introduction",
  "question_id": "Q1",
  "language": "ko",
  "profile": "job-targeted",
  "text": "해당 근무 기간에는 주 6일 일정으로 일했습니다.",
  "claim_ids": ["C_EXP_001_SCHEDULE"]
}
```

제목과 연결어처럼 사실을 주장하지 않는 텍스트만 빈 `claim_ids`를 허용한다. 사용자에게 문장마다 ID를 검토시키지는 않는다.

## 감사 판정

- `SUPPORTED`: 자료 또는 사용자 확인과 정확히 일치
- `SUPPORTED_WITH_SCOPE`: 범위를 명시하면 사용 가능
- `USER_ATTESTED`: 사용자가 직접 확인한 개인 경험
- `LEARNING_ONLY`: 학습만 확인됨
- `UNSUPPORTED`: 근거 없음
- `CONTRADICTED`: 다른 자료나 사용자 수정과 충돌
- `AMBIGUOUS`: 의미 또는 범위가 불분명
- `STALE`: 현재성 확인 필요
- `TRANSLATION_DRIFT`: 번역 과정에서 역할·수준·강도가 바뀜

최종 제출 전 `UNSUPPORTED`, `CONTRADICTED`, `AMBIGUOUS`, 미완료 `LEARNING_ONLY`, `TRANSLATION_DRIFT`를 해결하거나 문장에서 제외한다.
