# PLN-260826-KB-Agent-Scoping-And-Source-Review

REQ-260826 실행 계획 — 카테고리 단위 에이전트 범위 · 페이지 안내 · board 소스 정리

- 작성일: 2026-08-26
- 선행: [REQ-260826](../analysis/REQ-260826-KB-Agent-Scoping-And-Source-Review.md) ·
  [AN-260825](../analysis/AN-260825-Knowledge-Menus-And-Retrieval.md)
- 승인 상태: REQ 권장안 전체 승인(2026-08-26)

## 0. 확정된 결정

| # | 결정 |
|---|---|
| D1 | 범위 단위는 **카테고리만**. 문서 단위 예외 없음 |
| D2 | 저장은 **포함 목록**(`[]`/NULL=전체). 나중에 만든 에이전트는 범위 지정된 카테고리를 **못 봄** |
| D3 | `origin='catalog'` 카테고리는 **저장·조회 양쪽에서** 전체 적용 강제 |
| D4 | 답변 재사용에 `ai_agent_id` 추가·대조 |
| D5 | 카테고리 없는 문서 / 미등록(`unregistered:`) 카테고리 = 전체 에이전트 |
| D6 | `board` 소스 유형 제거 |
| Q3 | gdrive/notion 실계정 동기화 검증은 **이번 범위 밖**(별건) |
| Q4 | tenant 4 카테고리 재편은 **운영 작업**(기능 배포 후) |

## 1. 단계

### W1 — 검색 범위 (백엔드, 스키마 변경)

| 파일 | 변경 |
|---|---|
| `sql/migration_kb_category_agent_scope.sql` | 신규 — `kb_categories.agent_ids JSON NULL` |
| `knowledge/entity/kb-category.entity.ts` | `agentIds: number[] \| null` — **`type: 'json'` 명시**(A-1) |
| `knowledge/kb-category.service.ts` | `setAgents(tenantId, id, agentIds)` · 목록 응답에 `agentIds` · **catalog origin이면 무시** |
| `knowledge/knowledge.controller.ts` | `PUT categories/:id/agents` (`@RequireCapability(KNOWLEDGE_MANAGE)`) — **리터럴 라우트를 `:id` 계열보다 위에 선언**(PR #343에서 `usage-types/reorder`가 `:id`에 먹힌 전례) |
| `chat/rag.service.ts` | `baseQuery(tenantId, aiAgentId?)` 에 제외 조건 1개 · `retrieveHybrid`/`retrieveFulltext`/`retrieveVector`/`retrieveLike`로 인자 전달 · `answer()`가 이미 받는 `aiAgentId`를 그대로 내려보냄 |
| `chat/rag-retrieval-scope.spec.ts` | 술어 검증 확장 |

핵심 조건 — REQ §2.1 그대로. 에이전트 id가 없으면(`null`) 조건 자체를 붙이지 않습니다.

```sql
AND (kb.category IS NULL OR kb.category NOT IN (
      SELECT c.name FROM kb_categories c
       WHERE c.tenant_id = :tenantId
         AND c.origin <> 'catalog'
         AND JSON_LENGTH(c.agent_ids) > 0
         AND NOT JSON_CONTAINS(c.agent_ids, CAST(:agentId AS JSON))))
```

에이전트 결정은 호출자(`chat.service`)가 합니다: `session.ai_agent_id ?? 테넌트 기본 에이전트`.
RAG는 판단하지 않고 받은 값을 적용만 합니다 — `preferGroup`과 같은 규칙입니다.

### W2 — 답변 재사용 (백엔드, 스키마 변경)

| 파일 | 변경 |
|---|---|
| `sql/migration_answer_reuse_agent.sql` | `answer_reuse.ai_agent_id BIGINT NULL` |
| `answer-reuse/entity/answer-reuse.entity.ts` | `aiAgentId: number \| null` (`type: 'bigint'`) |
| `answer-reuse/answer-reuse.service.ts` | `recordAiAnswer`/`recordAgentAnswer`에 `aiAgentId` · `lookup(tenantId, lang, question, aiAgentId, tenantScopes)` |
| `chat/chat.service.ts` | lookup·record에 `session.aiAgentId` 전달 |
| `agent/agent.service.ts` | 대화→세션에서 `ai_agent_id` 조회해 전달 |

재생 가능 조건:

```
row.ai_agent_id === effectiveAgentId
  || (row.ai_agent_id === null && 이 테넌트에 범위 지정된 카테고리가 하나도 없음)
```

두 번째 항이 **범위를 쓰지 않는 테넌트의 동작을 한 줄도 바꾸지 않기 위한 조건**입니다. 범위를
쓰기 시작하면 그 시점부터 에이전트가 기록되지 않은 과거 항목은 재생되지 않고 LLM 경로로
떨어집니다 — 시간이 지나면 새 항목으로 자연 복구됩니다. 반대로 하면(과거 항목 허용) 기능을
켠 그날부터 파트너 답변이 계속 새어 나갑니다.

`범위 지정 여부`는 `kb_categories`에서 `JSON_LENGTH(agent_ids)>0` 개수 한 번 — 60초 캐시.

### W3 — 카테고리 범위 UI (콘솔)

| 파일 | 변경 |
|---|---|
| `knowledge/CategoryManagerCard.tsx` | 행마다 `[에이전트 N/M]` 버튼 → 범위 모달(시나리오 버튼 모달과 동일 형태) |
| `knowledge/knowledge.service.ts` / `.hooks.ts` | `setCategoryAgents` |
| `ai-settings/ai-agents.hooks.ts` | `useAiAgents` 재사용(이미 존재) |
| `knowledge/KnowledgeQaPanel.tsx` | 에이전트 선택기 — "이 페르소나에게 무엇이 보이나" 확인용 |
| `knowledge/knowledge.controller.ts`(api) | `POST /agent/knowledge/ask`에 `ai_agent_id` 선택 인자 |

에이전트가 1개뿐인 테넌트에는 **버튼을 그리지 않습니다.** 고를 것이 없는 선택지는 화면만
늘립니다(스테이징 6개 테넌트 중 4개가 여기 해당).

### W4 — 안내·표기 (콘솔)

| 파일 | 변경 |
|---|---|
| `components/HelpModal.tsx` | 신규 — `?` 아이콘 버튼 + Modal. R1/R4가 4곳에서 같은 모양을 씀 |
| `knowledge/KnowledgePage.tsx` | 프로세스 가이드 배너(접힘 상태 기억: `localStorage`) · Sync/Import/Add 옆 `?` 3개 · `Documents`→`KB-Documents` |
| `apps/web/public/samples/kb-product-import-sample.csv` | 신규 — 필수 3열 + 선택 5열, 3행 |
| `i18n/locales/{en,es,ko,vi,ja,zh}/knowledge.json` | 신규 키 ~24개 + 표기 변경 |

### W5 — board 소스 제거

| 파일 | 변경 |
|---|---|
| `knowledge/source-sync.service.ts` | `BoardAdapter` 등록 해제 → `supportedTypes()`에서 빠짐 |
| `knowledge/adapters/board.adapter.ts`(+spec), `dto/.../create-post.request.ts` | 삭제 |
| `knowledge/knowledge.controller.ts` | `POST sources/:id/posts`, `GET sources/:id/posts` 삭제 |
| `knowledge/KnowledgePage.tsx` | 드롭다운에서 `board` 제거 + Sources 설명 문구 교체 |

기존 board 소스 5건은 **지우지 않습니다.** `repository`와 똑같이 "미지원" 배지가 붙고 동기화
버튼이 잠깁니다 — 이미 있는 처리라 새로 만들 것이 없습니다. `kb_board_posts` 테이블도
남깁니다(행 0건, 지우려면 되돌릴 수 없는 마이그레이션이 필요한데 얻는 것이 없음).

## 2. 와이어프레임

### 2.1 프로세스 가이드 배너 — `/knowledge` 최상단

```
┌──────────────────────────────────────────────────────────────────────┐
│ 지식이 만들어지는 과정                                   [접기 ▲]    │
│                                                                      │
│   ① 소스              ② 동기화          ③ 사용가이드                │
│   Drive · Notion  ──▶  가져오기   ┐   유형별 사용법                  │
│   (통로일 뿐)                     │        │                         │
│                                   ▼        ▼                         │
│                          ④ KB-Document (실제로 답변에 인용됨)        │
│                                   ▲                                  │
│        Add KB-Document · Sync from catalog · Import product CSV      │
│                                                                      │
│  · 소스는 동기화하기 전에는 지식이 아닙니다.                         │
│  · 카테고리는 분류이자 **어느 상담 에이전트가 볼지**를 정합니다.     │
└──────────────────────────────────────────────────────────────────────┘
```

접으면 `지식이 만들어지는 과정 [펼치기 ▼]` 한 줄만 남고, 선택은 브라우저에 기억됩니다.

### 2.2 카테고리 범위 — 목록 행과 모달

```
Categories                                   [카테고리 합치기] [+ 추가]
─────────────────────────────────────────────────────────────────────
내 카테고리
  policy_payment            [문서 18]  [에이전트 2/5] [이름변경][숨김][삭제]
  policy                    [문서 12]  [에이전트 전체] [이름변경][숨김][삭제]
  faq                       [문서  4]  [에이전트 전체] [이름변경][숨김][삭제]

카탈로그에서 생성됨 (읽기 전용 · 모든 에이전트)
  🔒 Red By Kiss            [문서 662]
```

```
┌─ 이 카테고리를 볼 에이전트 ─────────────────────────┐
│ policy_payment 의 문서 18건을 인용할 수 있는 에이전트│
│                                                      │
│  ◉ 모든 에이전트 (기본)                              │
│  ○ 선택한 에이전트만                                 │
│      ☑ default (기본)                                │
│      ☑ hotel-partner                                 │
│      ☐ ad-partner                                    │
│      ☐ admin-staff                                   │
│      ☐ landing-guest                                 │
│                                                      │
│  ⚠ 앞으로 새로 만드는 에이전트는 이 카테고리를 보지  │
│    못합니다. 필요하면 그때 여기서 추가하세요.        │
│                                        [저장]        │
└──────────────────────────────────────────────────────┘
```

시나리오 버튼 모달(`AiSettingsPage.tsx:403`)과 동일한 라디오+체크박스 구조입니다 — 운영자가
이미 한 번 배운 조작입니다. 다른 점은 저장이 즉시 반영된다는 것(시나리오는 카드 하단 저장 버튼)
과 D2 경고 문구뿐입니다.

### 2.3 도움말 모달 (`?` 버튼) — 3종 공통 형태

```
KB-Documents          [카탈로그 동기화 ?][CSV 가져오기 ?][+ KB-Document 추가 ?]
```

```
┌─ CSV로 상품 가져오기 ────────────────────────────────┐
│ 무엇을 하나요                                        │
│  상품 목록 파일을 KB-Document로 만듭니다. 상품 하나당│
│  문서 하나입니다.                                    │
│                                                      │
│ 필수 열                                              │
│  Product Name · Handle · Detail                      │
│ 선택 열                                              │
│  Brand · Category · Product URL · Price(USD) ·       │
│  Image URL                                           │
│                                                      │
│ 알아두기                                             │
│  · 같은 Handle은 새로 만들지 않고 갱신합니다.        │
│    같은 파일을 다시 올려도 중복되지 않습니다.        │
│  · 가격은 지식으로 저장하지 않습니다 — 답변에 든     │
│    옛날 가격은 없느니만 못합니다.                    │
│  · 카테고리는 Brand → Category 순으로 정해집니다.    │
│                                                      │
│  [샘플 CSV 내려받기]                        [닫기]   │
└──────────────────────────────────────────────────────┘
```

`카탈로그 동기화 ?` — 무엇이 문서가 되는지(상품 캐시 → ProductInfo), 브랜드가 카테고리가 되는
점, 변형 접기, 실행 전 미리보기가 있다는 점, 재실행해도 중복되지 않는 점.
`KB-Document 추가 ?` — 인용되기 좋은 문서의 조건, **카테고리가 곧 에이전트 범위**라는 점,
작성 즉시 키워드 검색에는 쓰이고 의미 검색은 색인 후라는 점.

### 2.4 Sources 탭 문구

```
Sources                                                  [+ 소스 추가]
외부 문서를 계속 최신으로 유지하는 통로입니다. 동기화해야 지식이 됩니다.
한 번만 가져오면 되는 문서는 [+ KB-Document 추가]가 더 빠릅니다.
```

소스 유형 드롭다운: `Google Drive` · `Notion` (board 제거).

### 2.5 지식 질의 패널

```
지식 베이스에 질문하기            에이전트: [전체(운영자 보기) ▾]
                                            전체(운영자 보기)
                                            default
                                            hotel-partner …
```

기본은 `전체(운영자 보기)` — 운영자는 자기가 관리하는 것을 다 봐야 합니다. 특정 에이전트를
고르면 그 페르소나가 실제로 인용할 수 있는 범위로만 답합니다.

## 3. 마이그레이션

```sql
-- sql/migration_kb_category_agent_scope.sql
ALTER TABLE kb_categories ADD COLUMN agent_ids JSON NULL AFTER hidden;

-- sql/migration_answer_reuse_agent.sql
ALTER TABLE answer_reuse ADD COLUMN ai_agent_id BIGINT NULL AFTER lang;
CREATE INDEX idx_reuse_agent ON answer_reuse (tenant_id, ai_agent_id);
```

둘 다 NULL 허용 컬럼 추가 → **구버전 코드 + 신규 스키마가 안전**합니다. 순서: 스테이징 DB에
SQL 선적용 → 코드 배포. `npm run migrations:manifest` 갱신 필수.

롤백: 코드를 이전 이미지로 되돌리면 컬럼은 남아도 아무도 읽지 않습니다. 컬럼 자체를 되돌릴
필요는 없습니다.

## 4. side-impact

| 대상 | 영향 |
|---|---|
| 범위를 지정하지 않은 테넌트 | **없음** — 조건이 `NOT IN (비어있는 집합)`이라 한 행도 안 바뀜 |
| 위젯 · 임베드 SDK · 모바일 | 무변경(서버에서 거름) |
| 상담원 코칭(`rag.retrieve`) | 무변경 — 사람은 전부 봄 |
| 지식 갭 승격 · 충돌 검토 · 카탈로그 동기화 | 새 카테고리는 `agent_ids=NULL`(전체) — 무변경 |
| 모더레이션 | 무변경(재사용 재생도 기존대로 모더레이션 통과) |
| DSAR 삭제 | `answer_reuse` 컬럼 1개 추가일 뿐, 삭제 경로 무변경 |
| 성능 | 카테고리 서브쿼리 = 테넌트당 최대 63행, 검색 1회당 2번(두 갈래). 인덱스 `idx_kb_category_tenant` 존재. 캐시는 지금 불필요 |
| 미등록 카테고리(`unregistered:`) | 범위 지정 불가 → 전체 공개(D5). 필요하면 먼저 등록 |

**되돌려 쓰이는 위험 하나**: `ensure()`가 카테고리를 만들 때 `agent_ids`를 건드리면 안 됩니다.
동기화가 매번 카테고리를 `ensure`하므로, 여기서 기본값을 다시 써버리면 **운영자가 지정한 범위가
동기화 때마다 조용히 풀립니다.** `ensure`는 없을 때만 INSERT하고 기존 행은 손대지 않도록 —
카테고리 이름변경 잠금(PR #342)과 같은 성격의 함정입니다.

## 5. 검증 (TCR 예정 항목)

| # | 시나리오 | 기대 |
|---|---|---|
| T1 | 범위 미지정 테넌트에서 기존 질문 | 인용 문서가 배포 전과 동일 |
| T2 | `policy_payment`를 hotel-partner만으로 지정 → landing-guest 세션이 결제 질문 | 해당 문서 인용 없음 · 다른 카테고리는 그대로 |
| T3 | 같은 질문을 hotel-partner 세션에서 | 인용됨 |
| T4 | 카탈로그 카테고리에 범위를 저장 시도 | 무시(전체 유지) — API·조회 양쪽 |
| T5 | hotel-partner에게 답한 뒤 landing-guest가 같은 질문 | **재사용 재생 안 됨**(W2 없으면 여기서 샘) |
| T6 | 범위 지정 후 새 에이전트 생성 → 그 세션 질문 | 지정된 카테고리 안 보임(D2) |
| T7 | 카테고리 없는 문서 | 모든 에이전트에 보임 |
| T8 | 동기화 재실행 후 범위 확인 | 유지(§4 함정) |
| T9 | 콘솔 QA 패널에서 에이전트 선택 | 위젯 결과와 일치 |
| T10 | board 소스 행 | 미지원 배지 · 동기화 잠김 · 드롭다운에 없음 |
| T11 | 샘플 CSV 내려받아 그대로 업로드 | 오류 0건 |
| T12 | 6개 언어 문구 | `i18n:check` 통과 · 배지/모달 줄바꿈 육안 |

## 6. 이번 범위 밖

- gdrive/notion 실계정 동기화 성공 검증(Q3)
- tenant 4 카테고리 재편(Q4, 운영)
- 문서 단위 범위 예외(D1에서 배제)
- `kb_board_posts` 테이블 삭제
