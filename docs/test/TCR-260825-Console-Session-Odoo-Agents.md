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

## 3. 통합/수동 시나리오 (스테이징 배포 후 실행)

| # | 시나리오 | 기대 결과 | 결과 |
|---|---|---|---|
| C1 | 콘솔 로그인 후 61분 뒤 API 동작(탭 유지) | 자동 리프레시로 세션 유지(로그아웃 없음) | ⬜ |
| C2 | 리프레시 토큰 무효 상태에서 401 | 기존과 동일하게 로그인 페이지로 | ⬜ |
| C3 | `/settings` Odoo 탭 스니펫 | `loginPath:'/web/login'`·`redirect`·hideOnPaths 포함 | ⬜ |
| C4 | 에이전트에 표시명·KO 인사말 저장 → 해당 에이전트 세션 위젯 | 헤더=표시명, 첫 버블=에이전트 인사말; 미설정 에이전트는 상점 공통 | ⬜ |
| C5 | 시나리오 버튼 1개를 에이전트 A 전용 지정 → A/B 세션 위젯 | A에만 노출, B 미노출; 무스코프 버튼은 양쪽 노출 | ⬜ |
| C6 | 라이브챗 목록 | 행 제목 라인 우측에 담당 에이전트 배지 | ⬜ |
| C7 | 에이전트 필터 | 해당 에이전트 세션만 목록(기본 에이전트 필터는 NULL 핀 포함) | ⬜ |
| C8 | 상세: AI 에이전트 변경 → 고객 새 질문 | 다음 응답이 새 에이전트 페르소나 | ⬜ |
| C9 | 상세: 상담원 지정(매니저) → 지정 대상 확인 | status=agent·담당 표시, staff에겐 버튼 미노출 | ⬜ |
| C10 | 상세: 이슈로 등록 → IssuePanel | 이슈 생성·패널 표시, **고객 위젯에 통지 없음**; 재클릭=기존 이슈 유지 | ⬜ |
| C11 | 비-native 테넌트에서 이슈 등록 | E5059 토스트 | ⬜ |

## 4. 엣지 케이스 (설계/유닛으로 처리)

- 자동 리프레시 무한루프 방지: 요청당 1회 재시도(_retried), `/auth/refresh` 자체는 인터셉터 미경유(raw axios).
- 리로드 후 리프레시 토큰 소실(FE-H1 유지) → 액세스 잔여 수명(≤1h)만; 문서화됨.
- 삭제/비활성 에이전트에 핀된 세션: 표시·시나리오 매칭 모두 기본 에이전트로 강등(페르소나 해석과 동일).
- 시나리오 저장 시 존재하지 않는 agent id: 숫자 검증만(노출 대상 없음 → 사실상 숨김) — 콘솔 UI는 로스터에서만 선택.
- 이슈 수동 등록은 uk_issue_conv로 중복 안전(기존 이슈 반환).
