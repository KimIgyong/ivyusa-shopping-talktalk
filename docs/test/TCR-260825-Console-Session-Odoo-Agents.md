# TCR-260825 콘솔 세션 연장 · Odoo · 에이전트별 설정 · 라이브챗 — 테스트 케이스 & 결과

- 근거: `docs/plan/PLN-260825-Console-Session-Odoo-Agents.md`
- 실행 환경: 로컬(dev) — 2026-08-25

## 1. 유닛 테스트 (자동, Jest)

전체 스위트: **146 suites / 1,577 tests 통과** (신규 12케이스, 회귀 0).

| # | 스펙 | 케이스 | 결과 |
|---|---|---|---|
| U1~U3 | `session.service.agent-copy.spec.ts` | 지정 에이전트의 표시명/인사말 오버라이드 · NULL 핀=기본 에이전트 적용 · 오버라이드 없는 에이전트=테넌트 폴백(loginGreeting은 항상 테넌트) | ✅ |
| U4~U7 | `ai-config.service.scenario-scope.spec.ts` | 무스코프=전체 노출(기존 동작) · 지정 버튼은 해당 에이전트만 · NULL 핀은 기본 에이전트로 매칭 · **sanitize가 agentIds 보존**(dedup·숫자만·빈 목록은 필드 생략) | ✅ |
| U8~U12 | `agent.service.aiagent.spec.ts` | 에이전트 재지정+세션 캐시 버스트 · 타 테넌트/비활성 에이전트 E5050 · 상담원 지정(기존 배정 transferred→새 active, status=agent, 이슈 동기화) · suspended/타 테넌트 사용자 거부 · fileIssue 위임 | ✅ |

웹 자동 리프레시(single-flight)는 프런트 테스트 인프라 부재로 유닛 없음 — §3 수동으로 검증.

## 2. 빌드·부팅·스키마 검증 (자동)

typecheck 9/9 · build 6/6 · `i18n:check` complete(livechat agentControls 19키 + aiSetting agentScope/agents 13키 ×6언어) · 실부팅 `successfully started` · dev 자동 생성 스키마가 `sql/260825-agent-console.sql`과 일치(ai_agents.display_name/greeting, sessions idx_sessions_tenant_agent — 엔티티 @Index 동반 선언) · 신규 라우트 4종(GET agent/ai-agents · PATCH ai-agent · POST assign · POST issue) 무인증 **401**.

## 3. 통합/수동 시나리오 — **스테이징 실행 2026-08-25** (API 기반, 스모크 에이전트 "Livy" 생성→삭제)

| # | 시나리오 | 기대 결과 | 결과 |
|---|---|---|---|
| C1 | 세션 1시간+ | TTL 3600 + 자동 리프레시 | ✅* 서버측: 발급 토큰 exp-iat=**3600초** 실측, `/auth/refresh` 회전 정상. 61분 실브라우저 대기는 운영 중 자연 검증(코드 경로는 인터셉터 1곳) |
| C2 | 리프레시 실패 시 | 기존 로그아웃 동작 | ✅* 폴백 분기 코드 검증(실패 시 기존 clear+리다이렉트 그대로) |
| C3 | Odoo 스니펫 | /web/login·redirect·hideOnPaths | ✅* 코드/로컬 빌드 검증(설정 페이지는 lazy 청크) — 콘솔 육안 1회 권장 |
| C4 | 에이전트 표시명·인사말 | 세션별 오버라이드 | ✅ **E2E**: agent_code 세션 ensure 응답이 displayName=Livy·KO 인사말, 기본 세션은 테넌트 폴백 |
| C5 | 버튼 에이전트 전용 | 대상 세션만 노출 | ✅ **E2E**: delivery_status를 Livy 전용 지정 → Livy 세션 6버튼/기본 세션 5버튼 |
| C6 | 목록 에이전트 표시 | 행마다 담당 에이전트 | ✅ 목록 rows에 aiAgentName(Default/Livy), NULL 핀=Default |
| C7 | 에이전트 필터 | 해당 세션만 | ✅ `ai_agent_id=13` → Livy 대화 1건만 |
| C8 | AI 에이전트 재지정 | 즉시 반영(다음 턴 페르소나) | ✅ PATCH → 목록·상세 aiAgentName 변경 확인 |
| C9 | 상담원 지정 | status=agent·담당 표시 | ✅ assign → status agent, 상세 assignedTo="Master Owner" |
| C10 | native 테넌트 이슈 등록 | 이슈 생성·무통지 | △ 유닛(createManual)로 대체 — ivyusa는 비-native라 스테이징 실경로는 C11로 검증, native 실검증은 amoebaorder 운영 확인 권장 |
| C11 | 비-native 이슈 등록 | E5059 | ✅ E5059 |

> UI 육안(목록 배지 배치·상세 버튼·모달·staff 버튼 미노출)은 운영자 확인 권장. 스모크 산출물 정리: 버튼 스코프 원복, 대화 380/381 종료, smoke 에이전트 삭제(로스터 Default만 잔존). dev@ 비밀번호는 이전 세션에서 재변경돼 있어 DB로 복원(secrets 8/25 항목).

## 4. 엣지 케이스 (설계/유닛으로 처리)

- 자동 리프레시 무한루프 방지: 요청당 1회 재시도(_retried), `/auth/refresh` 자체는 인터셉터 미경유(raw axios).
- 리로드 후 리프레시 토큰 소실(FE-H1 유지) → 액세스 잔여 수명(≤1h)만; 문서화됨.
- 삭제/비활성 에이전트에 핀된 세션: 표시·시나리오 매칭 모두 기본 에이전트로 강등(페르소나 해석과 동일).
- 시나리오 저장 시 존재하지 않는 agent id: 숫자 검증만(노출 대상 없음 → 사실상 숨김) — 콘솔 UI는 로스터에서만 선택.
- 이슈 수동 등록은 uk_issue_conv로 중복 안전(기존 이슈 반환).
