# PLN-260804 — 에이전트 코칭 대화창 구현 계획

- 선행 문서: `docs/analysis/REQ-260804-Agent-Coaching-Chat.md`
- 대상: `apps/api` (신규 도메인 `ai-coach`), `apps/web` (`/ai-setting` 우측 패널)
- 상태: **승인 대기 — 승인 전 구현 착수 금지** (CLAUDE.md §7)

---

## 1. 목표와 비목표

**목표**
1. `/ai-setting` 우측 패널에 고객 시뮬레이션과 **별개의 코칭 대화 탭**을 만든다.
2. 코칭 대화의 결론이 **구조화된 제안 카드 → 관리자 승인 → 기존 설정/KB 저장소 반영**으로 이어진다.
3. 에이전트가 자기 설정과 답변 근거를 설명할 수 있다.

**비목표(이번 범위 밖)**
- 실 고객 대화 로그 자동 마이닝, 모델 파인튜닝, 제안 자동 승인, tool_use 도입.

---

## 2. UI 와이어프레임 (필수 — UI 변경 있음)

### 2.1 페이지 전체 (변경 전 → 변경 후)

```
[AS-IS]                                    [TO-BE]
┌──────────────┬──────────────┐            ┌──────────────┬──────────────┐
│ Persona      │              │            │ Persona      │ ┌──┬────────┐│
│ Response…    │  Live        │            │ Response…    │ │시│ 코칭 ● ││ ← 탭 추가
│ Scenario…    │  preview     │            │ Scenario…    │ └──┴────────┘│
│ AI functions │  (400px      │    ⇒       │ AI functions │              │
│ Moderation   │   sticky)    │            │ Moderation   │  탭 내용      │
│ Handoff      │              │            │ Handoff      │  (400px      │
└──────────────┴──────────────┘            └──────────────┴──────────────┘
좌측 컬럼·그리드(xl:[minmax(0,1fr)_400px])는 그대로. 우측 Card 안에 탭만 추가.
```

### 2.2 코칭 탭 (신규)

```
┌─ AI 스튜디오 ─────────────────────────────────────┐
│ ┌──────────────┬───────────────┐                  │
│ │ 고객 시뮬레이션 │ ● 에이전트 코칭 │                  │
│ └──────────────┴───────────────┘                  │
│ [환불 응대 톤 조정 ▾]        [+ 새 스레드]  [KO ▾]  │
│ ⓘ 제안은 승인해야 반영됩니다. 대화만으로는 바뀌지 않음│
│ ┌───────────────────────────────────────────────┐ │
│ │ ┌─ 참조된 답변 ───────────────────── [해제 ×] ┐│ │
│ │ │ 고객 › 반품 배송비 누가 내나요?              ││ │
│ │ │ AI  › 반품 절차는 마이페이지에서…            ││ │
│ │ │ ⚠ conf 0.38 · 인용: 반품 정책 v2 (0.41)     ││ │
│ │ └─────────────────────────────────────────────┘│ │
│ │                                                │ │
│ │                     ┌──────────────────────┐   │ │
│ │                     │ 답이 딱딱하고 배송비   │   │ │
│ │                     │ 부담 주체가 빠졌어    │   │ │
│ │                     └──────────────────────┘   │ │
│ │                                                │ │
│ │ ┌────────────────────────────────────┐         │ │
│ │ │ 인용 문서에 배송비 조항이 없습니다.  │         │ │
│ │ │ 신뢰도 0.38로 임계값(0.45) 아래라   │         │ │
│ │ │ 자동 상담원 연결됐을 겁니다.        │         │ │
│ │ │ 두 가지를 제안합니다.               │         │ │
│ │ └────────────────────────────────────┘         │ │
│ │ ┌─ 제안 1 · 지식 문서 개정 ───────── [KB] ─┐    │ │
│ │ │ 반품 정책 v2 › 배송비 조항 추가          │    │ │
│ │ │ ＋ 불량·오배송은 당사 부담, 단순 변심은  │    │ │
│ │ │   고객 부담(왕복 6,000원)               │    │ │
│ │ │ [적용] [수정 후 적용] [무시]             │    │ │
│ │ └────────────────────────────────────────┘    │ │
│ │ ┌─ 제안 2 · 응답 규칙 추가 ─────────────┐      │ │
│ │ │ ＋ 반품·교환 문의는 먼저 공감을 한 문장 │      │ │
│ │ │   표현한 뒤 절차를 안내한다.           │      │ │
│ │ │ ⚠ 기존 규칙 #3(3문장 이내)과 충돌 소지 │      │ │
│ │ │ [적용] [수정 후 적용] [무시]           │      │ │
│ │ └──────────────────────────────────────┘      │ │
│ │ ✓ 제안 2 적용됨 · 08-04 14:22 · 홍길동         │ │
│ │   [되돌리기]  [시뮬레이션에서 확인]            │ │
│ └───────────────────────────────────────────────┘ │
│ [에이전트에게 코칭할 내용…                ] [전송] │
└───────────────────────────────────────────────────┘
```

### 2.3 제안 카드 상태 (한 컴포넌트, 4가지 상태)

```
pending   ┌ 제안 · {타입} ──┐   applied   ✓ 적용됨 · {시각} · {사람} [되돌리기]
          │ diff 미리보기    │   rejected  ✕ 무시함                  [다시 보기]
          │ [적용][수정][무시]│   superseded ⓘ 이후 변경으로 무효   (버튼 없음)
          └─────────────────┘
```

### 2.4 "수정 후 적용" 모달

```
┌─ 제안 수정 ───────────────────────────┐
│ 타입: 응답 규칙 추가                    │
│ ┌───────────────────────────────────┐ │
│ │ 반품·교환 문의는 먼저 공감을…      │ │  ← payload 편집 가능
│ └───────────────────────────────────┘ │
│ 적용 대상: tenant_ai_config.rules      │
│              [취소] [이 내용으로 적용]  │
└───────────────────────────────────────┘
```

### 2.5 시뮬레이션 탭 → 코칭 연동 (W3)

```
기존 AI 버블 hover 시 우상단에 아이콘 버튼 추가:
  ┌────────────────────────┐ ⟪코칭⟫
  │ 반품 절차는 마이페이지…  │
  └────────────────────────┘
  conf 0.38 · 반품 정책 v2
클릭 → 코칭 탭 전환 + 해당 문답을 "참조된 답변" 블록으로 첨부(2.2 상단)
```

---

## 3. 단계 계획

### W1 — 백엔드 기반 + 코칭 대화 (persona/rules 제안까지)

**신규 도메인** `apps/api/src/domain/ai-coach/`
```
entity/coaching-thread.entity.ts       agent_coaching_threads
entity/coaching-message.entity.ts      agent_coaching_messages
entity/coaching-proposal.entity.ts     agent_coaching_proposals
dto/request/{create-thread,send-coach-message,apply-proposal}.request.ts   (snake_case)
dto/response/{thread,coach-turn,proposal}.response.ts                      (camelCase)
ai-coach.service.ts        대화 오케스트레이션
coach-context.service.ts   FN-054 컨텍스트 조립
coach-proposal.service.ts  FN-055/056 파싱·적용
ai-coach.mapper.ts / ai-coach.controller.ts / ai-coach.module.ts
```

**API**

| 메서드 | 경로 | 권한 | 비고 |
|---|---|---|---|
| GET | `/ai-coach/threads` | `AI_SETTINGS_MANAGE` | `Paginated` + `buildPagination(page,size,total)` |
| POST | `/ai-coach/threads` | 〃 | `{title?}` |
| GET | `/ai-coach/threads/:id/messages` | 〃 | 스레드 복원 |
| POST | `/ai-coach/threads/:id/messages` | 〃 | `{message, language?, ref_turn?}` → 답변 + 제안 |
| POST | `/ai-coach/proposals/:id/apply` | 〃 (+`KNOWLEDGE_SOURCE_MANAGE` for kb) | `{payload_override?}` |
| POST | `/ai-coach/proposals/:id/reject` | 〃 | |
| DELETE | `/ai-coach/threads/:id` | 〃 | |

**턴 처리 파이프라인** (`ai-coach.service.ts`)
```
1  스레드 소유 테넌트 확인 (tenant_id 불일치 → E1006)
2  입력 scrubPii → agent_coaching_messages(role='user') 저장
3  컨텍스트 조립 (FN-054)
     · AiConfigService.getConfig(tenantId)  → persona/rules/scenario/handoff 직렬화
     · 최근 N턴(기본 16, 총 문자수 상한) 이력
     · RagService.retrieve(tenantId, question, 4)   ← 이미 public (rag.service.ts:72)
     · ref_turn 지정 시 messages.retrieval_trace 조회 → 구분자로 감싼 참조 블록
4  AiGatewayService.complete({function: 'coach', system, messages})
5  응답 파싱: 텍스트 + ```json {proposals:[…]} ``` 블록
     · 파싱 실패 → proposals=[] 로 폴백 (제안 날조 금지, classifyIntent 선례)
     · 알 수 없는 type / 스키마 불일치 항목은 드롭
6  ModerationService.moderate({scope:'ai', authorType:'ai'})
     · BLOCKED → 텍스트 숨기고 blocked:true 보고 (knowledge.service.ts:188 선례)
     · 제안도 함께 폐기
7  agent_coaching_messages(role='agent') + agent_coaching_proposals(status='pending') 저장
8  응답 반환
```

**제안 적용** (`coach-proposal.service.ts`)
```
persona_patch / rule_* / scenario_override → AiConfigService.upsertConfig(...)
                                              (persona 캐시 무효화 자동)
kb_upsert  → KnowledgeService.create/update  (재임베딩·개정이력·충돌스캔 자동)
공통: 적용 직전 값 스냅샷을 proposal.payload.previous 에 저장 (1단계 되돌리기용)
      AuditService.write(특권 행위, threadId/proposalId/type 포함)
      같은 타깃의 다른 pending 제안 → status='superseded'
```

**코칭 시스템 프롬프트의 필수 제약** (REQ §13.1 상용 서베이 반영)
```
1. 사실·정책·수치는 규칙이 아니라 지식 문서에 속한다.
   → W1에는 kb_upsert 제안이 없으므로, 사실성 피드백에는 규칙을 제안하지 말고
     "지식 문서 등록이 필요하다"고 안내만 한다. (Salesforce 안티패턴 회피)
2. 규칙은 순서 없는 집합으로 주입된다 → 순차 의존 지시는 한 규칙 안에 합쳐 쓴다.
3. 유사한 기존 규칙이 있으면 rule_add 가 아니라 rule_edit 을 낸다 (예산 소진 방지).
4. 한 규칙에는 한 가지 지시만 담는다.
5. 기존 규칙과 충돌 소지가 있으면 conflictsWith 로 명시한다 (탐지·경고까지만).
6. 진단은 주어진 trace 수치만 근거로 하고 추측하지 않는다.
```
**예산 상한**: 규칙 최대 40개 · 각 500자 · persona 4000자
(Intercom 100/2500, Ada 10/300, Zendesk 40, Salesforce 5~10 권장을 참고한 중간값)

**엔진 라우팅**: `AI_FUNCTIONS` 배열에 `'coach'` 추가
(`ai-engine/dto/request/ai-engine.request.ts:5`, `database/seed.runner.ts:25`, 프론트 `FUNCTION_KEYS`).
`tenant_ai_settings.function`이 `varchar(16)`이라 **스키마 변경 없음**. 미설정 테넌트는
게이트웨이 기존 폴백(테넌트 기본 → 플랫폼 기본)으로 동작.

**오류 코드** (E4011 다음)
```
E4012 COACH_THREAD_NOT_FOUND
E4013 COACH_PROPOSAL_NOT_FOUND
E4014 COACH_PROPOSAL_NOT_PENDING     이미 적용/거절/무효
E4015 COACH_PROPOSAL_APPLY_FAILED    하위 서비스 실패
```

**마이그레이션** `sql/migration_agent_coaching.sql` — ⚠️ 스테이징 `DB_SYNCHRONIZE=false`이므로
**코드 배포 전 수동 선적용 필수**, PR 본문에 `## Migration` 섹션 필수.

```sql
CREATE TABLE agent_coaching_threads (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL, user_id INT NOT NULL,
  title VARCHAR(200) NULL, status VARCHAR(16) NOT NULL DEFAULT 'open',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_coach_thread_tenant (tenant_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- messages / proposals 동일 패턴, 상세는 구현 시 확정
```
⚠️ 엔티티의 nullable 컬럼에는 반드시 명시적 `type` 지정 — 누락 시 TypeORM이 `Object`로 추론해
**DataSource 초기화 실패 = 부팅 크래시**(tsc가 못 잡음). 배포 후 `Nest application successfully started` 확인.

### W2 — 프론트엔드 (코칭 탭 + 제안 카드)

```
apps/web/src/domain/ai-settings/
  AiStudioPanel.tsx      NEW  탭 셸 (기존 PreviewPanel을 그대로 감쌈 — 무수정)
  CoachPanel.tsx         NEW  스레드 선택·대화·입력
  ProposalCard.tsx       NEW  4상태 + 수정 모달
  coach.service.ts       NEW  API 클라이언트
  coach.hooks.ts         NEW  React Query (키에 tenantId 포함)
  AiSettingsPage.tsx     EDIT :62 <PreviewPanel/> → <AiStudioPanel/>
```
- 목록 조회는 `apiGetList<T>` 사용 (`apiGet<Paginated>`는 페이지네이션이 잘림 — 기존 학습사항)
- 적용/거절/스레드 생성·삭제 **전부 성공·실패 토스트**(무음 성공 금지, CLAUDE.md §2)
- i18n: `aiSetting` 네임스페이스에 `coach.*` 추가 (en/es/ko 3파일), 하드코딩 문구 0
- stub 엔진일 때 패널 상단 경고 배너

### W3 — 패널 간 연동 + KB/시나리오 제안
- 시뮬레이션 버블 [코칭] 버튼 → 탭 전환 + `ref_turn` 첨부 (2.5)
- `kb_upsert` 제안 카드: 신규는 제목/카테고리/본문 미리보기, 개정은 원문 대비 diff
- `scenario_override` 제안 카드 (`ScenarioReplyEditor` 표시 형식 재사용)
- 적용 후 [시뮬레이션에서 확인] → 시뮬레이션 탭 전환 + 참조 질문 자동 재실행

### W4 — 회귀 검증 (FR-073)
- 골든 질문 세트 저장 + 코칭 중 "회귀 세트에 추가"
- 제안 적용 전/후 답변 비교 뷰 (`KnowledgeService.ask`의 무상태 경로 재사용)
- persona 개정 이력·롤백

---

## 4. 부수영향 분석

| # | 변경 | 영향 범위 | 위험 | 완화 |
|---|---|---|---|---|
| 1 | `AI_FUNCTIONS`에 `'coach'` 추가 | AI functions 섹션에 행 1개 증가, 시드, DTO 검증 | 낮음 — 기존 테넌트는 행 없음 → 게이트웨이 폴백 | 미설정 시 폴백 동작 테스트 |
| 2 | `AiSettingsPage.tsx:62` 교체 | 기존 시뮬레이션 패널 | **중** — 회귀 시 기존 기능 상실 | `PreviewPanel`은 **한 줄도 수정하지 않고** 탭 셸로 감싸기만 |
| 3 | 신규 테이블 3종 | 스테이징 스키마 | **중** — 선적용 누락 시 500 | `## Migration` 섹션 + `pre-deploy-check` 스킬 |
| 4 | `AiConfigService.upsertConfig` 신규 호출자 | persona/rules 쓰기 경로 | 낮음 — 기존 API 그대로 사용 | 쓰기 경로 추가 없음(위임만) |
| 5 | `KnowledgeService` 신규 호출자 | 재임베딩·충돌 스캔 트리거 | 중 — Voyage 무료티어 rate limit(기존 관측 이슈) | 임베딩 실패는 기존 폴백 경로 유지, 적용 결과 토스트에 경고 노출 |
| 6 | 코칭 AI 호출 증가 | 토큰 비용 | 중 | 이력 N턴 절단, Redis rate limit, `coach` 엔진 분리로 비용 가시화 |
| 7 | 모더레이션에 코칭 트래픽 유입 | `moderation_rules` 평가 | 낮음 | 차단은 숨김이 아니라 **보고** — 오탐이 곧 진단 정보 |
| 8 | `ai-coach.module` 등록 | `app.module.ts` | 낮음 | 순환 의존 주의: `ChatModule`(RagService)·`KnowledgeModule`·`AiEngineModule` import |
| 9 | 코칭 대화에 고객 원문 붙여넣기 가능 | PII 저장 | 중 | 저장 전 `scrubPii`(`global/util/pii-scrub.util`), 로그 마스킹 |

**영향받지 않음(확인됨)**: 위젯(`apps/widget`), 고객 `sessions`/`conversations`/`messages`,
분석 집계(`analytics.service.ts`), 에이전트 큐/알림 — 코칭은 별도 테이블·별도 컨트롤러로 완전 분리.

---

## 5. 테스트 관점 (상세는 TCR에서)

- 단위: 제안 JSON 파싱(정상/깨진 JSON/알 수 없는 type/빈 배열), 제안 적용→`upsertConfig` 위임,
  superseded 전이, 크로스 테넌트 스레드 접근 차단(E1006), 모더레이션 BLOCKED 경로
- 통합: 스레드 생성 → 코칭 턴 → 제안 생성 → 적용 → `GET /ai-config` 반영 확인 → Redis 캐시 무효화 확인
- 엣지: stub 어댑터 응답, KB 무결과, ref_turn이 타 테넌트 메시지, payload_override로 빈 문자열 전송,
  rules 상한 초과, 참조 고객 원문에 인젝션 문구 포함
- 배포 검증: 신규 라우트 **401 = 배포됨 / 404 = 미배포 / 502 = API 다운**

---

## 6. 승인이 필요한 결정 (REQ §11)

| # | 질문 | 권장안 |
|---|---|---|
| 1 | 되돌리기 범위 | **W1에 직전 값 스냅샷 기반 1단계 되돌리기 포함** (안전 이득 대비 저비용) |
| 2 | 스레드 가시성 | **테넌트 내 `AI_SETTINGS_MANAGE` 보유자 공용** (설정이 공용 자산이므로 근거도 공용) |
| 3 | 코칭 대화 언어 | **관리자 UI 언어 추종** |
| 4 | `coach` 엔진 미설정 시 | **게이트웨이 기존 폴백 유지** |
| 5 | 착수 범위 | **W1+W2를 1차 PR**(코칭 성립), W3/W4는 후속 PR |

---

## 7. 산출물

- 코드: `apps/api/src/domain/ai-coach/**`, `apps/web/src/domain/ai-settings/{AiStudioPanel,CoachPanel,ProposalCard,coach.service,coach.hooks}.tsx|ts`
- SQL: `sql/migration_agent_coaching.sql`
- 문서: `docs/test/TCR-260804-Agent-Coaching-Chat.md`, `docs/implementation/RPT-260804-Agent-Coaching-Chat.md`
- 브랜치 `feature/agent-coaching-chat` → PR(`## Migration` 포함) → squash merge
