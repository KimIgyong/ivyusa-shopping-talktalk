# TCR-260826 라이브챗 핀 고정 · 고객 메시지 액션 4종 — 테스트 케이스

- 근거: `docs/plan/PLN-260826-LiveChat-Message-Actions.md`
- 대상: 대화방 핀(R1) · 메시지 번역(R2) · 지식조회 주입(R3) · 답글 인용(R4) · 메시지 이슈 등록(R5)

## 1. 유닛 (자동, `apps/api`)

### `agent.service.pin.spec.ts` (신규 12케이스)

| # | 케이스 | 기대 |
|---|---|---|
| U1 | 핀 설정 | `pinned_at`/`pinned_by` 기록 + save + 감사 `agent.conversation.pin` |
| U2 | 테넌트 활성 핀 3개에서 4번째 | **E5060** 거부, save 안 됨(동료 핀 자동 해제 금지) |
| U3 | 이미 핀된 행 재핀 | no-op — count 자체를 안 물음(한도에 안 걸림) |
| U4 | 핀 해제 | 한도 무관 항상 성공, 두 컬럼 모두 NULL |
| U5 | 타 테넌트 대화 핀 | not found (테넌트 펜스) |
| U6 | 시스템 외 언어(fr) 번역 | **E5003**, LLM 호출 없음 |
| U7 | 타 테넌트 메시지 번역 | **E5002** (테넌트 펜스) |
| U8 | 캐시 히트(`msgtr:{id}:{lang}`) | LLM 호출 없이 반환, 대문자 lang 정규화 |
| U9 | 캐시 미스 | gateway `feature: 'agent_translate'` 호출 + 24h 캐시 저장 |
| U10 | gateway 실패/빈 응답 | **E5055**(502), 캐시 미저장 |
| U11 | 메시지 지정 이슈 등록 | 공백 접기 발췌+메모(300자 클램프)가 note로 전달, `appended` 반환 |
| U12 | 발췌 120자 클램프 / 타 대화 메시지 | note 정확히 120자 / **E5002** + createManual 미호출 |

### 기존 스펙 회귀

- `agent.service.aiagent.spec.ts` — `createManual` 계약 변경(`{issue, appended}` + `note` 옵션) 반영.
- 전체 스위트: **154 suites / 1,638 tests 통과** (2026-08-26).

## 2. 통합/빌드 게이트

| # | 게이트 | 결과 |
|---|---|---|
| G1 | `npm run typecheck` (api·web) | ✅ |
| G2 | `npm run build` 전체 | ✅ |
| G3 | **실제 API 부팅** (`successfully started`) | ✅ — 1차 부팅에서 **순환 import 발견**(agent.service → briefing.service → agent.service, BriefingService DI undefined). `prompt-language.ts` 분리로 해소 후 부팅 확인. tsc는 못 잡는 유형(A-1 변형) |
| G4 | `npm run i18n:check` | ✅ 6언어 complete |
| G5 | `npm run migrations:manifest` | ✅ 70 files |

## 3. 스테이징 수동 스모크 (배포 후)

| # | 시나리오 | 기대 |
|---|---|---|
| S1 | 대화 3개 핀 → 4번째 핀 | 처음 3개 성공 토스트, 4번째 "핀은 스토어당 3개까지" 에러 토스트 |
| S2 | 목록 확인 | 핀 3개가 최상단(최근 핀 순), 새 메시지가 와도 자리 유지; 필터(상태/채널/에이전트)와 병행 |
| S3 | 핀 해제 | 행이 일반 정렬로 복귀; 상세 헤더 토글도 동작 |
| S4 | 고객 버블 호버 → 번역(ko) | 팝오버 → 스피너 → 버블 아래 "한국어 번역" 서브버블; 같은 메시지 재번역은 즉시(캐시) |
| S5 | 번역 X 닫기·언어 스택 | 언어별 서브버블 개별 닫힘, 2개 언어 동시 표시 |
| S6 | 지식조회 버튼 | 우측 Knowledge lookup에 메시지 본문 주입 + 스크롤/포커스 |
| S7 | 답글 버튼 → 발송 | 인용 칩 표시 → 발송문이 `> 발췌` + 본문으로 위젯에 수신 |
| S8 | 메시지 이슈 등록 (이슈 없음) | 모달에 발췌 표시, 메모 입력 → "이슈 #n 등록" 토스트, IssuePanel 타임라인에 발췌+메모 줄바꿈 표시 |
| S9 | 같은 대화 다른 메시지 이슈 등록 | "이슈 #n에 메모로 추가" 토스트, 타임라인에 MEMO 이벤트 append |
| S10 | AI 자동응답 중(ai_active+auto) 대화 | 버블 액션 4종 미노출; approve 모드/상담원/종료 대화에서는 노출 |
| S11 | 비-native 테넌트에서 메시지 이슈 | E5059 (기존 게이트 유지) |

결과 기록은 RPT-260826에 병합.
