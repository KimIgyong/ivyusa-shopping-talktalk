# TCR-260820-Multi-AI-Agent-Personas

복수 AI 상담 에이전트 · 에이전트별 페르소나 — 테스트 케이스 및 결과

- 근거: `PLN-260820-Multi-AI-Agent-Personas.md` (승인 2026-08-20)
- 대상: `ai_agents` 모델·CRUD·백필, 세션 배정 3경로(embed/메신저/미리보기), RAG 페르소나 주입, 콘솔 UI, AI 코치 정합

## 1. 단위 테스트 (jest)

| # | 스위트 | 케이스 | 결과 |
|---|--------|--------|------|
| U1 | `ai-agent.service.spec` | ensureDefault가 레거시 tenant_ai_config persona/rules 상속 | ✅ |
| U2 | 〃 | 기존 default 존재 시 재생성 안 함 | ✅ |
| U3 | 〃 | 기본 에이전트 삭제 거부 E5051 / 비활성화 거부 E5051 | ✅ |
| U4 | 〃 | 코드 중복 E5052 · 형식 위반 E5003 · 크로스테넌트 E5050 | ✅ |
| U5 | 〃 | setDefault 원자적 이동 + 신규 기본 강제 활성화 (기본은 항상 1개) | ✅ |
| U6 | 〃 | 저장 시 캐시 무효화 (`aicfg:persona:{t}:{id}` + `:default`) | ✅ |
| U7 | `session.service.spec` | resolveAiAgentId: 활성 코드 매칭(대소문자·공백 무시), 미지/비활성/크로스테넌트/미지정 → null | ✅ |
| U8 | 기존 회귀 | ai-engine·session·messenger·chat·ai-coach 전 스위트 | ✅ 무회귀 |

전체: **API 122 스위트 / 1,363 케이스 PASS** (attachment 3스위트 8건 실패는 로컬 `sharp` 미설치 기존 갭 — 본 diff 무관, CI 통과). bigint PK 문자열 픽스처 규칙 준수.

## 2. 로컬(dev) 통합 스모크 — 2026-08-20, synchronize=true + 스텁 LLM

| # | 시나리오 | 결과 |
|---|----------|------|
| D1 | 엔티티 추가 후 실부팅 — `Nest application successfully started` (A-1 함정 검증) | ✅ |
| D2 | `GET /ai-agents` 최초 호출 → default 행 lazy 생성 + 레거시 페르소나 상속 확인 | ✅ |
| D3 | `POST /ai-agents` hotel-partner 생성 → `PUT /ai-config {ai_agent_id:2, persona}` → **에이전트 2 행에만 기록**, default 무변 | ✅ |
| D4 | 가드: 코드 중복 → E5052, 기본 삭제 → E5051 | ✅ |
| D5 | `POST /session/ensure {agent_code:"hotel-partner"}` → `sessions.ai_agent_id=2` 고정 | ✅ |
| D6 | `agent_code:"no-such-agent"` → 세션 정상 생성(ai_agent_id NULL=기본 폴백) + 서버 `warn` 로그 1줄 | ✅ |
| D7 | 미리보기 세션 `ai_agent_id:2` → `channel='preview'`, `ai_agent_id=2` | ✅ |
| D8 | 개정 이력: 에이전트 2 페르소나 저장 → revision `ai_agent_id=2` + 최초 저장 시 baseline 자동 기록 | ✅ |

프론트: `apps/web`·`apps/widget` tsc 0 에러, `vite build` 성공, `npm run i18n:check` **6개 언어 complete**.

## 3. 스테이징 E2E (go2joy 테넌트) — 배포 후 수행

| # | 시나리오 | 확인 방법 | 결과 |
|---|----------|-----------|------|
| S1 | `sql/260820-ai-agents.sql` 선적용 → 테넌트 6곳 백필(default 6행, go2joy는 자체 페르소나 상속) | mysql 카운트 | ✅ 8/20 |
| S2 | 배포 검증 3종: 부팅 로그 `successfully started` · api 컨테이너 재생성(Up 28s healthy) · `GET /ai-agents` 401 / health 200 | curl/logs | ✅ 8/20 |
| S3 | go2joy에 예시 4종 등록(landing-guest·admin-staff·hotel-partner·ad-partner, id 8~11) — 페르소나·규칙 포함 | API (임시 master 계정, 종료 후 삭제) | ✅ 8/20 |
| S4 | `agent_code=hotel-partner` 위젯 세션 → 실 LLM 답변이 격식체+정산은 매니저 이관 / `landing-guest` → 친근한 예약 유도(지역·날짜·예산 질문) — 톤 명확 분리 | 위젯 프로브 | ✅ 8/20 |
| S5 | 파라미터 없는 세션 → 기본 에이전트(go2joy 현행 페르소나) 응답 — 무회귀 | 위젯 프로브 | ✅ 8/20 |
| S6 | `agent_code=nope-agent` → 세션 정상(ai_agent_id NULL)·기본 응답 + `ai agent code did not match: tenant=4` warn 1줄 | 로그 grep | ✅ 8/20 |
| S7 | 미리보기 세션 ai_agent_id 10↔8 전환, 동일 질문("정산 일정") → 파트너 데스크는 절차 안내+매니저 이관, 랜딩 게스트는 범위 밖 안내+상담원 이관 — 페르소나별 응답 확인 | API | ✅ 8/20 |

세션 고정 DB 검증: staging sessions 1309=agent 10, 1310=agent 8, 1311/1312=NULL. 상세는 `docs/implementation/RPT-260820-Multi-AI-Agent-Personas.md` §4.

## 4. 엣지 케이스 (설계 검증)

- E1. 에이전트 삭제 후 그 에이전트에 고정된 기존 세션 → 해석 시 행 부재 → 기본 폴백 (U-경로: `resolvePersonaRules` fall-through, 코드 리뷰로 확인)
- E2. 비활성 코드로 신규 세션 → 매칭 거부(D6과 동일 경로) / 이미 고정된 세션 → `requireActive` 해석에서 기본 폴백
- E3. 캐시 스킴 변경 직후 구키(`aicfg:persona:{t}`)는 어떤 코드도 읽지 않음 — TTL 60s 자연 만료, 충돌 없음
- E4. 코치: 스레드 `ai_agent_id` NULL(기존 스레드 전부) → 기본 에이전트 대상 적용 — 기존 동작과 동일
- E5. `PUT /ai-config`에 ai_agent_id 없는 기존 클라이언트(구 콘솔 캐시) → 기본 에이전트에 기록 — 하위호환
- E6. 시나리오 버튼·핸드오프·모더레이션은 에이전트와 무관(테넌트 공통) — 모더레이션 게이트 비우회 유지(기존 스위트로 커버)
