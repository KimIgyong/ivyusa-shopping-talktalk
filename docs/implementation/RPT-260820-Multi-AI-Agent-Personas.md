# RPT-260820-Multi-AI-Agent-Personas

복수 AI 상담 에이전트 · 에이전트별 페르소나 — 구현 결과 보고

- 근거: `REQ-260820` → `PLN-260820`(승인 2026-08-20) → 구현 → `TCR-260820`
- 대상 테넌트: **go2joy** (스테이징 tenant 4)
- PR: **#329** (squash → main `c259910`), 스테이징 배포·E2E 완료 2026-08-20

## 1. 무엇이 바뀌었나

1. **에이전트 복수화**: `ai_agents` 테이블(테넌트당 N행 — code·name·persona·rules·active·is_default). 기존 `tenant_ai_config.persona/rules`는 마이그레이션이 각 테넌트의 기본(default) 에이전트 행으로 백필. 시나리오 버튼·핸드오프·모더레이션은 테넌트 공통 잔류.
2. **배정 3경로** (세션 생성 시 1회 고정, `sessions.ai_agent_id`):
   - 위젯: 설치 스니펫 `IVY_WIDGET_CONFIG.agent: "<code>"` → iframe `?agent=` → `/session/ensure agent_code`
   - 메신저: `messenger_channels.config.ai_agent_code`
   - 콘솔 미리보기: 에이전트 선택 → `preview-session ai_agent_id`
   - 미지정/미지/비활성 코드 = 기본 에이전트 폴백(+서버 warn) — **기존 설치분 무회귀**
3. **파이프라인**: `RagService.answer/answerWithoutKnowledge`가 세션의 에이전트로 페르소나/규칙 해석. 캐시 키 `aicfg:persona:{tenant}:{agentId|default}`, 저장·전환·삭제 시 무효화. 해석 순서: 에이전트 행 → 테넌트 기본 → 레거시 행 → 내장 기본.
4. **콘솔 `/ai-setting`**: 상단 에이전트 바(선택·추가·편집·기본 지정·삭제·활성 토글), 페르소나/응답규칙 카드가 선택 에이전트에 바인딩(개정 이력에 `ai_agent_id` 기록), 에이전트별 설치 스니펫 복사, 미리보기·코칭이 선택 에이전트를 추종. 공통 카드에 "모든 에이전트 공통" 표기. i18n 6개 언어.
5. **AI 코치 정합**: `coaching_thread.ai_agent_id` — 새 스레드는 선택 에이전트를 코칭, 제안 apply/revert가 그 에이전트의 persona/rules에만 적용. 기존 스레드(NULL)=기본 에이전트.
6. **가드/에러코드**: E5050(없음)·E5051(기본 삭제/비활성 불가)·E5052(코드 중복). 기본 전환은 트랜잭션(항상 정확히 1개).

계획 대비 조정: PLN의 PR 4건을 **1 PR(커밋 4개, squash)**로 통합 — 스키마+코드가 한 번에 배포되도록(마이그레이션 원자성), 내용·순서는 W1~W4 그대로.

## 2. 파일 목록 (PR #329)

- **SQL**: `sql/260820-ai-agents.sql`(신규 테이블+백필+컬럼 3), `sql/artefacts.tsv`, `docker/init-sql/01-schema.sql`(베이스라인 동기화, 74테이블)
- **API**: `domain/ai-engine/`(ai-agent entity·service·controller·mapper·dto, ai-config service/controller/revision, module), `domain/session/`(entity·dto·controller·service·module), `domain/chat/{chat,rag}.service.ts`, `domain/messenger/messenger-ingest.service.ts`, `domain/ai-coach/`(thread entity·service·context·proposal·controller·mapper·dto), `global/constant/error-code.constant.ts`, `database/seed.runner.ts`
- **위젯**: `public/embed.js`, `src/hooks/useSession.ts`, `src/services/sessionService.ts`
- **웹**: `domain/ai-settings/`(AgentsSection 신규, ai-agents service/hooks 신규, AiSettingsPage·AiStudioPanel·PreviewPanel·CoachPanel·preview/coach service·hooks), `i18n/locales/{en,es,ko,vi,ja,zh}/aiSetting.json`
- **테스트**: `ai-agent.service.spec.ts`(신규), `session.service.spec.ts`(+resolveAiAgentId), `messenger-ingest.service.spec.ts`(스텁 갱신)

## 3. 테스트 결과 (상세: TCR-260820)

- 단위: API **122 스위트 / 1,363 PASS**(신규 U1~U7 포함; attachment 3스위트 8건은 로컬 sharp 갭 — CI 통과), web/widget tsc 0에러, vite build, `i18n:check` 6개 언어 complete
- 로컬 dev 스모크 D1~D8 전부 ✅ (실부팅 `successfully started` 포함 — 엔티티 A-1 함정 검증)
- 스테이징 E2E S1~S7 전부 ✅ (아래 §4)

## 4. 배포 상태 & 스테이징 E2E

| 항목 | 상태 |
|------|------|
| PR / 커밋 | #329 → main `c259910` (+ 매니페스트 커밋 포함, CI pass) |
| 마이그레이션 | `sql/260820-ai-agents.sql` **스테이징 선적용 8/20**(백업 `~/backup-pre-ai-agents-{schema,data}-20260820-192734.sql`) → 테넌트 6곳 default 백필 |
| 스테이징 배포 | `deploy-staging.sh` 8/20 — 부팅 로그 정상, api 컨테이너 재생성(healthy), `GET /ai-agents` 401 / health 200 |
| 프로덕션 | 미구축(기존과 동일). 신규 설치는 베이스라인 DDL에 포함됨 |

**go2joy 에이전트 4종 등록(운영 데이터, id 8~11)**: `landing-guest`(랜딩 방문고객) · `admin-staff`(어드민 내부직원) · `hotel-partner`(호텔 파트너사) · `ad-partner`(광고협력사) — 각각 페르소나+규칙 3건. 기본은 백필된 `default`(기존 go2joy 페르소나) 유지.

**실 LLM 페르소나 스위칭 검증(동일/유사 질문)**:
- `hotel-partner`: "객실 재고 등록은…" → 격식체, 절차 안내 + "담당 매니저 연결" (규칙 반영)
- `landing-guest`: "다낭 호텔 예약…" → 친근한 톤, 지역·날짜·예산 질문(예약 유도)
- 무지정: 기본 에이전트(현행 go2joy 페르소나) — 무회귀
- 미지 코드 `nope-agent`: 정상 응답(기본) + `ai agent code did not match: tenant=4` warn
- 미리보기 10↔8 전환, 동일 질문 "정산 일정" → 파트너 데스크는 정산 절차+매니저 이관 / 랜딩 게스트는 "제 범위 밖" + 상담원 안내 — **에이전트별 응답 명확 분리**
- 세션 고정 DB: sessions 1309=10, 1310=8, 1311/1312=NULL

검증용 임시 계정(`e2e-aiagents@amoeba.group`, tenant 4 master)은 E2E 종료 후 삭제 완료(remain 0).

## 5. 잔여 / 후속

- go2joy **실서비스 페이지에 스니펫 설치**는 운영 측 작업: 각 진입점(랜딩/어드민/파트너 포털/광고 안내)에 `IVY_WIDGET_CONFIG.agent` 한 줄 추가 (콘솔 에이전트 편집 모달의 복사 버튼 제공). 등록된 페르소나 문안은 초안 — go2joy 운영·베트남어 검수로 다듬을 것.
- 에이전트별 KB 스코프·엔진 분리·의도 기반 자동 전환은 범위 제외(REQ §2) — 필요 시 후속 REQ.
- 메신저 채널 바인딩 UI(채널 모달에 `ai_agent_code` 필드 노출)는 백엔드만 지원 — 콘솔 노출은 후속 소품.
