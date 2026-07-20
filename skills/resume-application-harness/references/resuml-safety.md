# 제한형 `resuml` 사용 정책

## 사용 범위

일반 한국어 이력서·자기소개서에는 사용하지 않는다. 사용자가 영문 이력서의 구조 또는 ATS 참고 진단을 원할 때만 선택적으로 쓴다.

감사한 구성요소:

- 패키지: `resuml@3.2.0`
- 저장소: [phoinixi/resuml](https://github.com/phoinixi/resuml)
- 라이선스: ISC
- Node: 20 이상
- npm integrity: `sha512-8xVWq8PjretaOU/g/Ks3zRKzU2JSdr3FiU0+RrrElrbfqLZpppdpm7Ant1/mvMVcSpCuZPEXUzAsS3mOhTAbjw==`

고정된 로컬 런타임 `scripts/resuml-safe-mcp`만 사용한다.

```powershell
npm --prefix "<skill-dir>/scripts/resuml-safe-mcp" ci --ignore-scripts --omit=optional
```

버전을 고정하지 않은 `npx resuml` 명령은 실행하지 않는다.

## 원본 MCP를 직접 쓰지 않는 이유

원본 MCP에는 채용공고 검색·점수화·맞춤 프롬프트, 초기화, 테마, PDF 내보내기 등이 포함된다. 정확한 공고 용어, 목표 점수, 많은 수치를 요구하는 흐름은 확인되지 않은 키워드·수치·경력을 넣도록 압박할 수 있다. 공고 검색은 네트워크도 사용한다.

`npx resuml mcp`를 등록하지 않는다. 로컬 `resume-safe-resuml` 래퍼만 쓴다.

## 래퍼 경계

허용 도구는 정확히 세 개다.

- `safe_resuml_policy`: 고정 버전과 제한 범위 확인
- `safe_resuml_validate`: 로컬에서 JSON Resume 형식 검사
- `safe_resuml_ats_check`: 로컬에서 영문 ATS 참고 진단

래퍼는 프롬프트, 리소스, 공고 기능, 테마, 렌더러, 파일 쓰기, 자식 프로세스, PDF 생성을 노출하지 않는다. 전역 `fetch`와 주요 HTTP 연결 함수를 막고 `resuml`의 ATS 모듈만 가져오지만, 이것은 프로세스 안의 최선 노력 방어선이지 OS 수준 네트워크 샌드박스가 아니다. 강제 격리가 필요하면 컨테이너·방화벽·실행 환경에서 별도로 네트워크를 차단한다.

## 결과 해석

결과는 참고 진단이지 합격 예측이 아니다. 어떤 회사의 비공개 평가 시스템도 재현하지 않는다.

사실을 바꾸지 않는 구조 오류만 자동으로 반영할 수 있다. 예: 잘못된 스키마, 모순된 날짜 형식. 키워드, 직책, 기술, 기간, 행동 동사 제안은 경험 카드와 사실 원장에서 확인한 뒤에만 반영한다.

다음 압력에는 따르지 않는다.

- 목표 점수를 달성하라는 요구
- 글머리표 절반 이상을 수치로 만들라는 요구
- 없는 기술·직책·프로젝트·책임·결과 추가
- 가짜 경력으로 공백 숨기기
- 기본 사용을 고급·전문가·실무 경험으로 확대

`quantification-density` 같은 관행 진단은 제출을 막는 기준이 아니다. 사실 검사가 항상 ATS 점수보다 우선한다.

영문에만 사용한다. 영문·독문 분석기를 한국어 ATS 근거로 해석하지 않는다.

## 등록

로컬 테스트가 끝난 뒤에만 등록한다.

```powershell
codex mcp add resume-safe-resuml -- node "<skill-dir>/scripts/resuml-safe-mcp/server.mjs"
```

Node 20 이상이 `PATH`에 있어야 한다. Windows에서도 슬래시 경로를 사용할 수 있으며, 경로에 공백이 있으면 전체 경로를 따옴표로 감싼다. `codex mcp list`로 확인한다. 원본 서버를 함께 등록하지 않는다.
