# RPT-260825 콘솔 세션 연장 · Odoo · 에이전트별 설정 · 라이브챗 에이전트 — 구현 보고

- 근거: REQ/PLN/TCR-260825-Console-Session-Odoo-Agents (8건 묶음)
- 작업일: 2026-08-25 · 브랜치 `session/console-agents-260825`

## 1. 배포 상태

| 항목 | 상태 |
|---|---|
| PR | **#371** (squash-merge, main `3ee933b`) |
| CI | typecheck·test·build 통과 |
| 스테이징 SQL 선적용 | ✅ `sql/260825-agent-console.sql` (ai_agents display_name/greeting + sessions 인덱스) |
| 스테이징 env | ✅ `.env.staging` `JWT_ACCESS_TTL=3600` 반영 후 배포 |
| 스테이징 배포·스모크 | ✅ 부팅 OK, **C4~C9·C11 실행 완료**(TCR §3) — C1은 토큰 TTL 3600 실측+리프레시 회전으로 검증, C10(native 이슈)은 유닛 대체 |
| 프로덕션 | 해당 없음 |

## 2. 스모크에서 실증된 핵심

- **토큰 TTL 3600초 실측** + `/auth/refresh` 회전 정상(콘솔 자동 리프레시의 서버측 전제).
- **에이전트별 정체성 E2E**: `agent_code`로 만든 세션의 `/session/ensure` 응답이 표시명 "Livy"·전용 KO 인사말, 기본 세션은 테넌트 폴백 — 위젯 무수정 오버라이드 설계 검증.
- **시나리오 버튼 스코프 E2E**: 버튼 1개를 Livy 전용 지정 → Livy 세션 6버튼 / 기본 세션 5버튼.
- 목록 에이전트 표시(NULL 핀=Default)·에이전트 필터·AI 에이전트 재지정·상담원 지정(assignedTo 반영)·비-native E5059 전부 실서버 확인.

## 3. 무엇이 바뀌었나 (요약)

- **R1**: `JWT_ACCESS_TTL` 900→3600(전 env·문서) + **콘솔 최초의 /auth/refresh 클라이언트**(401 single-flight 자동 갱신, 실패 시 기존 로그아웃 폴백). FE-H1 유지 — 리로드 후 ≤1h는 수용·문서화. self-hosted `15m`(NaN) 형식 결함 수정.
- **R2**: Odoo 설치 스니펫에 `loginPath:'/web/login'`+`redirect`+`hideOnPaths` — 로더 무수정. **운영 액션: skyliving 실몰 스니펫 교체 필요.**
- **R3/R4**: `ai_agents.display_name/greeting`(6언어) + `/session/ensure` widgetCopy 오버라이드(NULL 핀=기본 에이전트) + AgentModal 편집 UI.
- **R5**: `ScenarioButton.agentIds`(빈=공통, 노출만) + **sanitize 보존 수정**(미수정 시 저장에서 소실) + 버튼 행 [에이전트] 모달.
- **R6/R7**: 목록 행 제목 우측 에이전트 배지, 에이전트 필터(`(tenant_id, ai_agent_id)` 인덱스, 기본 에이전트 필터는 NULL 핀 포함), staff용 슬림 `GET /agent/ai-agents`.
- **R8**: `PATCH …/ai-agent`(세션 캐시 버스트·다음 턴 적용) · `POST …/assign`(**CONVERSATION_ASSIGN 첫 실사용**, manager+, 배정 전환+이슈 동기화, 상세 assignedTo 표시) · `POST …/issue`(수동 생성, native 게이트 **E5059**, 중복=기존 반환, 고객 무통지).

## 4. 파일·테스트

57 files(+1,757/−70). Jest **146 suites/1,577 tests**(신규 12), typecheck·build·i18n(32키×6언어) 통과, 실부팅·스키마 일치. 상세: TCR-260825.

## 5. 남은 일 / 운영 액션

- **skyliving(Odoo) 몰 스니펫 교체**(콘솔 /settings → Odoo 탭의 새 스니펫으로).
- UI 육안: 목록 배지·상세 헤더 버튼/모달·staff에게 [상담원 지정] 미노출·61분 세션 유지 체감.
- C10(native 테넌트 실 이슈 등록)은 amoebaorder에서 확인 권장.
- 백로그(REQ 기록): 서버 전달형 loginPath, 에이전트별 시나리오 응답 문안, staff용 users 슬림 조회, 리프레시 토큰 영속화 재검토.
