# PLN-260820-Multi-AI-Agent-Personas

복수 AI 상담 에이전트 · 에이전트별 페르소나 — 구현 계획

- 근거: `docs/analysis/REQ-260820-Multi-AI-Agent-Personas.md`
- 원칙: 진입점 기반 결정적 배정(의도 기반 자동 전환 없음), 기본 에이전트 폴백으로 무회귀, 기존 패턴(`messenger_channels` CRUD · `resolveRouting` 폴백) 차용.

## 0. 설계 요약

```
신규 테이블 ai_agents (테넌트당 N행)
  id BIGINT PK · tenant_id · code VARCHAR(64) · name VARCHAR(100)
  persona TEXT · rules JSON(string[]) · active TINYINT(1) · is_default TINYINT(1)
  UNIQUE (tenant_id, code)
배정 우선순위: 세션.ai_agent_id(진입점에서 확정) → 테넌트 기본(is_default=1) → DEFAULT_PERSONA
tenant_ai_config: persona/rules는 읽기 경로에서 제외(백필 후), scenario/handoff 등은 잔류
```

- 세션 배정 3경로: ① 위젯 embed `data-agent` → `EnsureSessionRequest.agent_code` ② `messenger_channels.config.ai_agent_code` ③ 콘솔 미리보기 세션 생성 시 명시.
- 배정은 **세션 생성 시 1회 확정**(스티키). 코드 불일치·비활성 코드는 조용히 기본 폴백(C7).
- 캐시: `aicfg:persona:${tenantId}:${aiAgentId|'default'}`, 에이전트 저장/삭제 시 해당 키+default 키 무효화.

## 1. 단계별 계획

### W1 — 백엔드: ai_agents 모델 + CRUD (PR 1)
- `sql/migration_ai_agents.sql`: `CREATE TABLE IF NOT EXISTS ai_agents` + **백필**: 테넌트별 `tenant_ai_config.persona/rules` → `ai_agents(code='default', name='Default', is_default=1)` INSERT(가드: 이미 있으면 skip). `sessions ADD COLUMN ai_agent_id BIGINT NULL`(가드형).
- 엔티티 `ai-agent.entity.ts`(nullable 컬럼 명시적 `type` — 부팅 크래시 함정 A-1 준수, `bigintTransformer`), 도메인 `apps/api/src/domain/ai-engine/` 내 배치(신규 모듈 아님 — 페르소나 소유 도메인 유지).
- API (`@RequireCapability(AI_SETTINGS_MANAGE)`):
  `GET /ai-agents` · `POST /ai-agents` · `PATCH /ai-agents/:id` · `DELETE /ai-agents/:id` · `POST /ai-agents/:id/default`(기본 전환은 트랜잭션으로 단일 보장).
- 가드: 기본 에이전트 삭제 금지(E5041), 마지막 활성 에이전트 비활성화 금지, code 형식 `[a-z0-9-]{1,64}`, persona 4000자 상한.
- 에러코드 E5040(not found)·E5041(default 삭제/비활성 불가)·E5042(code 중복) — 구현 시 최종 번호 확인. 거절 가드에 `logger.warn`.
- `AiConfigService.getPersonaRules(tenantId, aiAgentId?)`로 확장 + 캐시 키 개편. `upsertConfig`(코치·기존 PUT /ai-config)는 **기본 에이전트 행**에 쓰도록 리다이렉트(하위호환).
- 단위 테스트: 백필 폴백 해석, 기본 전환 트랜잭션, 캐시 무효화. **bigint PK는 문자열 픽스처.**

### W2 — 파이프라인: 세션 배정 축 (PR 2)
- `session.entity.ts`에 `aiAgentId`(nullable, 명시적 type) 추가.
- `EnsureSessionRequest`에 `agent_code?`(snake_case) → `SessionService.ensure()`에서 테넌트 스코프로 코드 해석 후 `ai_agent_id` 확정(세션 최초 생성 시에만; 기존 세션 재접속은 유지). `createPreview(tenantId, locale, aiAgentId?)`.
- embed: `apps/widget/public/embed.js` 스니펫 `data-agent` → iframe `?agent=` → `useSession`이 ensure 페이로드에 포함. (embed.js는 Cache-Control 없음 — 구버전 로더와의 호환은 파라미터 부재=기본 폴백으로 자연 충족)
- 메신저: `messenger-ingest.service.ts` 세션 생성 지점에서 `channelField(channel,'ai_agent_code')` 해석 → 배정. `MessengerChannelModal` 스키마에 필드 추가는 W3에서.
- `ChatService.handleUserMessage()`: `session.aiAgentId`를 `rag.answer(tenantId, …, aiAgentId)`로 전달(3-hop: chat→rag→getPersonaRules). `knowledge.service.ts`의 KB 테스트 답변은 기본 에이전트(현행 유지).
- 통합 테스트: agent_code 지정/미지정/무효 3분기, 메신저 인바운드 배정.

### W3 — 콘솔 UI (PR 3)
- `/ai-setting` 좌측 상단에 **에이전트 바** 신설(아래 와이어프레임): 목록·선택·추가·기본 배지. PersonaSection/ResponseRulesSection이 선택 에이전트에 바인딩(query key `['ai-agents', tenantKey]` + `['ai-agent', tenantKey, agentId]`).
- 시나리오/기능·엔진/모더레이션/답변재사용 카드는 **테넌트 공통** 표시(카드 헤더에 "모든 에이전트 공통" 캡션) — 오해 방지.
- 에이전트 추가/편집 모달: 이름·코드(자동 슬러그, 생성 후 잠금)·활성 토글. 설치 스니펫 복사 버튼(`data-agent` 포함).
- 미리보기 패널: 에이전트 셀렉터(기본=현재 선택 에이전트).
- 저장/삭제/기본전환 토스트(성공 자동닫힘·실패 수동닫힘), i18n 6개 언어 키 등록 + `npm run i18n:check`.
- 목록은 `apiGetList` 사용([[web-paginated-lists]] — 단, 소량이라 비페이지네이션 배열 응답이면 `apiGet`).

### W4 — AI 코치 정합 + TCR (PR 4)
- `coaching_thread`에 `ai_agent_id`(nullable=기본 에이전트) — `sql/migration_ai_agents.sql`에 동승. 스레드 생성 시 콘솔에서 선택된 에이전트를 기록, `CoachContextService`/`coach-proposal.service.ts`의 read/apply/revert를 해당 에이전트 행으로.
- CoachPanel에 대상 에이전트 표시(현 선택 에이전트 추종).
- `TCR-260820-Multi-AI-Agent-Personas.md`: 단위(폴백 해석·기본 전환·코드 검증), 통합(위젯 3분기·메신저 배정·미리보기·코치 적용), 엣지(기본 삭제 시도, 비활성 코드 지정, 세션 스티키, 크로스테넌트 코드, 캐시 무효화 60s).

### 배포 (각 PR 공통)
- 스테이징: `sql/migration_ai_agents.sql` **선적용**(pre-deploy-check 스킬, 백업 후) → 코드 배포 → 부팅 로그 `successfully started` + 신규 라우트 401 확인 + `doesn't exist` 그렙.
- PR 본문 `## Migration` 섹션(경로·env 체크박스·롤백: 신규 테이블 DROP + sessions 컬럼 유지 무해).
- 배포 후 운영 데이터로 예시 4종 에이전트 등록(부록 A 초안) — **대상 테넌트: go2joy(스테이징 tenant id 4, slug `go2joy`, go2joy.vn — 사용자 확정 8/20)**. 베트남 서비스이므로 페르소나 문안은 vi 사용자 응대를 전제(시스템 언어 vi는 지원 완료).

## 2. UI 와이어프레임 (필수)

```
/ai-setting  ──────────────────────────────────────────────────────────────
┌──────────────────────────────────────────────┬───────────────────────┐
│ AI 에이전트                                   │  AI 스튜디오           │
│ ┌──────────────────────────────────────────┐ │ ┌───────────────────┐ │
│ │ [기본] 랜딩 방문고객   ● 활성   ▸선택됨   │ │ │ [미리보기][코칭]   │ │
│ │        어드민 내부직원 ● 활성            │ │ │ 에이전트:          │ │
│ │        호텔 파트너사   ● 활성            │ │ │  (랜딩 방문고객 ▼) │ │
│ │        광고협력사      ○ 비활성          │ │ │                   │ │
│ │ [+ 에이전트 추가]                        │ │ │  …대화 미리보기…   │ │
│ └──────────────────────────────────────────┘ │ └───────────────────┘ │
│                                              │                       │
│ 페르소나 — 랜딩 방문고객        [스니펫 복사] │                       │
│ ┌──────────────────────────────────────────┐ │                       │
│ │ (persona textarea, 4000자)               │ │                       │
│ └──────────────────────────────────────────┘ │                       │
│                             [저장]           │                       │
│ 응답 규칙 — 랜딩 방문고객                     │                       │
│ │ • 규칙1  • 규칙2  [+ 추가]               │ │                       │
│                                              │                       │
│ 시나리오 버튼 ─ 모든 에이전트 공통 ──────────  │                       │
│ AI 기능·엔진 ─ 모든 에이전트 공통 ───────────  │                       │
│ 모더레이션 ─ 모든 에이전트 공통 ─────────────  │                       │
└──────────────────────────────────────────────┴───────────────────────┘

에이전트 추가/편집 모달
┌─────────────────────────────────────┐
│ 이름   [호텔 파트너사 담당        ]  │
│ 코드   [hotel-partner] (생성 후 잠금)│
│ 활성   [✓]      기본으로 지정 [ ]    │
│ 설치 스니펫: <script … data-agent=   │
│  "hotel-partner">   [복사]           │
│        [취소]  [저장]                │
└─────────────────────────────────────┘
```

## 3. 사이드 임팩트 분석

| 영역 | 영향 | 대응 |
|------|------|------|
| 기존 위젯 설치분(파라미터 없음) | 기본 에이전트 배정 = 현행 페르소나(백필) | 무회귀 — TCR 회귀 케이스 포함 |
| `PUT /ai-config`(persona/rules) | 기본 에이전트 행으로 리다이렉트 | API 하위호환 유지, 응답 shape 불변 |
| AI 코치 apply/revert | 대상 에이전트 행 갱신으로 변경 | 기존 스레드(ai_agent_id NULL)는 기본 에이전트로 해석 |
| 시드(`seed.runner.ts`) | DEFAULT_PERSONA를 ai_agents default 행으로 생성하도록 수정 | 신규 설치 무결성(자체 호스팅 패키지 베이스라인 스키마에도 반영 — [[self-hosted-deploy-package]] 교훈) |
| Redis 캐시 | 키 스킴 변경 | 배포 직후 구키는 TTL 60s 자연 만료, 무효화 로직은 신키만 |
| 핸드오프/이슈 SLA/핸드백 | `tenant_ai_config` 잔류 필드 사용 | 무변경 |
| 모더레이션 | 에이전트 무관 전 출력 게이트 | 무변경(비우회 확인 테스트만) |
| NULL 이웃 필드 함정 | ai_agents 행 부분 저장 시 | PATCH는 명시 필드만 갱신([[widget-theme-and-tabs]] 교훈) |

## 4. 리스크

- R1. `sessions` ALTER는 대형 테이블 — 스테이징 행수 확인 후 적용(야간 불필요 수준으로 예상되나 pre-check에 포함).
- R2. embed `data-agent` 오타 시 조용한 기본 폴백(설계상 의도) — 콘솔 스니펫 복사 버튼으로 오타 자체를 예방, 미리보기로 검증 가능.
- R3. 코치가 기본이 아닌 에이전트를 코칭 중일 때 운영자가 그 에이전트를 삭제 → 스레드 orphan: 삭제 시 진행 중 스레드 있으면 경고 후 스레드를 기본으로 귀속.

## 5. 부록 A — 예시 4종 에이전트 페르소나 초안 (운영 데이터, 배포 후 콘솔 등록)

| code | 이름 | 페르소나 방향 |
|------|------|---------------|
| `landing-guest` | 랜딩 방문고객 대응 | 예약 전환 중심, 친근·간결, 예약/객실/일정 FAQ 우선, 미확정 정보는 예약센터 안내 |
| `admin-staff` | 어드민 내부직원 대응 | 내부 용어 허용, 절차·정책 근거 인용 위주, 격식 간소화, 고객 응대 문구 제안 가능 |
| `hotel-partner` | 호텔 파트너사 대응 | 정산·객실 재고·계약 톤(격식), 파트너 포털 메뉴 기준 안내, 민감 정산 수치는 담당자 이관 |
| `ad-partner` | 광고협력사 대응 | 광고 상품·집행 절차 안내, 제휴 제안은 담당 부서 이관, 대외 격식체 |

세부 문안은 등록 시점에 실제 KB·업무 범위에 맞춰 확정(외국인 전문·노약자 대응 등 추가 등록은 동일 UI로 운영자가 수행).

---
**승인 요청**: 본 PLN 승인 시 W1부터 구현 착수. (대상 테넌트는 go2joy로 확정 — 2026-08-20 사용자 회신)
