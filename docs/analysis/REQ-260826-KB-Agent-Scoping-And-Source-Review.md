# REQ-260826-KB-Agent-Scoping-And-Source-Review

`/knowledge` — 에이전트별 지식 범위 지정 · 안내 보강 · Add source 존치 검토

- 작성일: 2026-08-26
- 선행 문서: [AN-260825-Knowledge-Menus-And-Retrieval.md](AN-260825-Knowledge-Menus-And-Retrieval.md)
  (네 메뉴의 관계와 실제 검색 조건), PLN-260820-Multi-AI-Agent-Personas(복수 에이전트),
  REQ-260825 R5(시나리오 버튼 에이전트 범위 — **이번 요구의 UI/저장 선례**)
- 근거: 코드 실측 + 스테이징 실데이터(2026-08-26 조회)

## 0. 요구사항 목록

| # | 요구 | 성격 |
|---|---|---|
| **R1** | 소스 → 동기화 → 사용가이드 → 지식베이스문서 **프로세스 설명 가이드** 삽입 | UI |
| **R2** | **KB 문서를 어느 상담 에이전트가 참조할지 지정** — 카테고리 단위, 복수 선택, 기본 전체 선택 후 해제 방식. 상품 카탈로그 카테고리는 항상 전체 적용 | 기능(스키마 변경) |
| **R3** | `Document` 표기를 **KB-Document(지식베이스문서)** 로 변경 | 문구 |
| **R4** | Sync from catalog / Import product CSV(**샘플 파일 제공**) / Add document 에 **기능설명·팁 모달** | UI |
| **R5** | **Add source의 역할 규명** — Board는 어떤 보드인가, 이 기능이 실제로 필요한가 | 검토 |

---

## 1. AS-IS (실측)

### 1.1 지금 검색 범위를 결정하는 것

`RagService.baseQuery()` 한 곳이며, 축은 **테넌트뿐**입니다.

```sql
kb.active = 1
AND (kb.tenant_id = :tenantId OR kb.tenant_id IS NULL)
AND (kb.source_id IS NULL OR kb.source_id NOT IN
     (SELECT id FROM knowledge_sources WHERE designated = 0))   -- PR #387에서 추가
```

**한 테넌트의 모든 에이전트가 같은 지식을 봅니다.** 파트너 전용 정책과 랜딩 방문객용 안내가
구분 없이 같은 풀에 있습니다.

### 1.2 이미 있는 것 — 그대로 쓸 수 있는 배관

| 있는 것 | 위치 | 이번 요구와의 관계 |
|---|---|---|
| `ai_agents` (테넌트별 복수 페르소나, `is_default`) | `ai-engine/entity/ai-agent.entity.ts` | 범위 지정의 대상 |
| 세션의 에이전트 고정(`chat_sessions.ai_agent_id`) | 세션 생성 시 1회 | 검색 시점에 "누구인가"를 아는 근거 |
| **시나리오 버튼의 에이전트 범위** — `agentIds: []`=전체, 비어있지 않으면 그 목록만 | `ai-config.service.ts:250`, 모달 UI `AiSettingsPage.tsx:403` | **동일한 의미·동일한 모달을 재사용**(요구의 "시나리오버튼 방식 참조") |
| `kb_categories` (테넌트별 행, `origin=manual/catalog/seed`) | PR #341~#345 | 범위를 붙일 자리 |
| `rag.answer(..., aiAgentId)` | `rag.service.ts:324` | **이미 에이전트 id를 받습니다** — 지금은 페르소나에만 씀 |

즉 **에이전트 id는 이미 RAG 함수까지 도착해 있고, 검색 조건으로 내려가지 않을 뿐입니다.**

### 1.3 스테이징 실데이터

```
에이전트: tenant 1=1  tenant 3=2  tenant 4=5(landing-guest, admin-staff,
                                            hotel-partner, ad-partner, default)
문서/카테고리: tenant 1=2,072/63   tenant 2=144/8   tenant 3=29/11   tenant 4=17/3
```

이 기능이 실제로 필요한 곳은 **tenant 4(go2joy)** 입니다 — 5개 페르소나가 같은 17건을 공유하고
있고, 소스 이름에 `Policy for partner`가 있습니다. 다만 카테고리가 `faq/policy/policy_payment`
3개뿐이라, **카테고리 단위 범위 지정은 카테고리를 먼저 나눠야 의미가 생깁니다**(§4 D1).

---

## 2. TO-BE

### 2.1 R2 — 카테고리 단위 에이전트 범위

```
kb_categories
  + agent_ids JSON NULL      -- NULL/[] = 모든 에이전트 (기본값)
                             -- [3,5]  = 그 에이전트만
```

검색 시 `baseQuery`에 한 줄이 더 붙습니다.

```sql
AND (kb.category IS NULL OR kb.category NOT IN
     (SELECT c.name FROM kb_categories c
       WHERE c.tenant_id = :tenantId
         AND c.origin <> 'catalog'          -- 상품 카탈로그는 항상 전체 적용
         AND JSON_LENGTH(c.agent_ids) > 0
         AND NOT JSON_CONTAINS(c.agent_ids, :agentIdJson)))
```

**"포함되지 않은 것을 뺀다"로 씁니다.** 카테고리가 없는 문서(수기 작성 중, 갭 승격 직후)와 범위를
지정하지 않은 카테고리는 조건에 걸리지 않으므로, **이 기능을 쓰지 않는 테넌트의 동작은 한 행도
바뀌지 않습니다.**

에이전트 결정: `session.ai_agent_id ?? 테넌트 기본 에이전트` — 시나리오 버튼과 같은 규칙입니다.
기존 세션은 `ai_agent_id`가 NULL이므로 기본 에이전트로 해석됩니다.

### 2.2 반드시 함께 막아야 하는 우회로 — 답변 재사용

`answer_reuse`는 **RAG보다 먼저** 조회되고 키가 **테넌트+언어뿐**입니다
(`chat.service.ts:745`, 엔티티에 에이전트 컬럼 없음).

> hotel-partner에게 한 번 답한 파트너 전용 답변이 **저장된 뒤에는 landing-guest에게 그대로
> 재생됩니다.** 검색을 아무리 좁혀도 이 경로가 열려 있으면 기능이 겉모습만 남습니다.

`answer_reuse.ai_agent_id`를 저장·대조하도록 함께 바꿉니다. 이건 선택 항목이 아닙니다.

### 2.3 경로별 적용 여부

| 경로 | 범위 적용 | 이유 |
|---|---|---|
| 위젯 대화(`rag.answer`) | **적용** | 요구의 본체 |
| 답변 재사용(`answer_reuse`) | **적용** | §2.2 |
| 콘솔 지식 질의(`/knowledge` QA 패널) | 미적용 + **에이전트 선택기 추가** | 운영자는 전체를 봐야 하되, "이 페르소나에게 뭐가 보이나"를 확인할 수단이 필요 |
| 상담원 코칭(`rag.retrieve`) | 미적용 | 사람 상담원은 전부 봐야 함 |
| 지식 갭·충돌·카탈로그 동기화 | 미적용 | 운영 도구 |

### 2.4 R1 — 프로세스 가이드 (배치안, 상세 와이어프레임은 PLN)

```
┌─ 지식은 이렇게 만들어집니다 ─────────────────────── [닫기] ┐
│                                                            │
│  ① 소스        ② 동기화        ③ 사용가이드                │
│  Drive/Notion  →  가져오기   →  유형별 사용법 작성          │
│      │                                  │                  │
│      └──────────┬───────────────────────┘                  │
│                 ▼                                          │
│         ④ KB-Document (실제로 답변에 인용되는 것)          │
│                 ▲                                          │
│   Add document · Sync from catalog · Import CSV ────────────┤
│                                                            │
│  · 소스는 "가져오는 통로"입니다. 동기화하기 전에는 지식이   │
│    아닙니다.                                                │
│  · 카테고리는 분류 + **에이전트 범위**를 정합니다.          │
└────────────────────────────────────────────────────────────┘
```

### 2.5 R3 — 표기

`Documents` → `KB-Documents`(ko: 지식베이스문서), `Add document` → `Add KB-Document`.
키는 그대로 두고 6개 로케일의 **값만** 바꿉니다.

### 2.6 R4 — 기능설명·팁 모달

| 대상 | 담을 내용(실측 기준) |
|---|---|
| Sync from catalog | 무엇이 문서가 되는가(상품 캐시 → ProductInfo), 카테고리는 브랜드에서 온다, 변형 접기, 이미 미리보기가 있는 점, 재실행해도 중복되지 않음(Handle 기준 upsert) |
| Import product CSV | 필수 컬럼 `Product Name · Handle · Detail`, 선택 컬럼 `Brand · Category · Product URL · Price(USD) · Image URL`, Handle 기준 upsert, **가격은 지식으로 저장하지 않음**, 최대 행수, **샘플 CSV 다운로드** |
| Add KB-Document | 무엇을 쓰면 인용이 잘 되는가, 카테고리가 곧 에이전트 범위라는 점(R2 이후), 작성 즉시 키워드 검색에는 쓰이고 의미 검색은 색인 후(PR #387에서 문구 정리) |

샘플 CSV는 `apps/web/public/samples/` 에 정적 파일로 두고 링크합니다(현재 필드 정의를 그대로
반영한 3행짜리).

---

## 3. R5 — Add source 검토

### 3.1 Board는 어떤 보드인가

**외부 게시판이 아니라 내부 게시판입니다.** `kb_board_posts` 테이블 한 개이고,
`board.adapter.ts`가 그 글을 문서로 옮깁니다. 자격증명도 외부 의존도 없습니다.

### 3.2 측정된 사실

| 사실 | 값 |
|---|---|
| 스테이징 소스 | 8건 (board 5 · gdrive 1 · notion 1 · repository 1) |
| `kb_board_posts` 전체 행 수 | **0** |
| 콘솔에 게시글 작성 화면 | **없음** (API `POST /knowledge/sources/:id/posts`만 존재) |
| 동기화 이력 | 8건 중 7건 `NEVER`, 1건(notion) `failed` (fetched 0) |
| 소스에서 유래한 문서 | **0건** — 현재 지식 전량은 카탈로그 동기화·CSV·수기·갭 승격 |
| `repository`(GitHub) | 2026-08-24 로드맵에서 제외, 드롭다운에서 제거됨 |

**Add source의 기본 선택값이 `board`입니다.** 운영자가 아무 생각 없이 만들면 *글을 쓸 화면이
없어 영원히 0건인 소스*가 생깁니다. 스테이징의 board 5건이 정확히 그 결과입니다.

### 3.3 판단

Add source 자체는 필요합니다 — 다만 **필요한 이유는 board가 아닙니다.**
외부 문서를 **계속 최신으로 유지**하는 통로(Drive/Notion)가 소스의 존재 이유이고, 한 번 가져오고
끝나는 일이라면 Add document 로 충분합니다.

- **board는 Add document의 중복입니다.** 게시글을 써서 문서로 바꾸는 경로는, 문서를 바로 쓰는
  경로에 없는 능력이 하나도 없습니다. 화면을 새로 만들 값어치가 없습니다.
- **권장: `board`를 소스 유형에서 내립니다**(`repository`와 동일 처리). 기존 board 소스 5건은
  문서를 한 건도 만들지 않았으므로 지울 때 잃는 지식이 없습니다.
- 남는 유형은 `gdrive`·`notion` 둘이며, **둘 다 아직 성공한 동기화가 없습니다.** notion은
  tenant 4에서 fetched 0으로 실패했습니다. 존치의 전제는 "실제 워크스페이스에서 한 번은
  성공시킨다"입니다 — 이건 별도 과제입니다(§5 Q3).
- Sources 탭 문구도 바꿉니다: "지식을 가져오는 통로 — 동기화해야 문서가 됩니다".

---

## 4. 결정 필요 사항

| # | 쟁점 | 권장안 | 근거 |
|---|---|---|---|
| **D1** | 범위 단위 = 카테고리만? 문서 단위 예외도? | **카테고리만**(요구 그대로) | 문서 단위까지 열면 2,072건짜리 테넌트에서 관리 불가. 대신 "한 문서만 특정 에이전트에게" 주려면 **카테고리를 새로 만들어 옮겨야 한다**는 제약이 생깁니다 — 명시적으로 감수 |
| **D2** | 나중에 만든 에이전트는 범위 지정된 카테고리를 보나? | **못 봄**(포함 목록 방식) | 새 에이전트가 자동으로 파트너 전용 지식을 보는 편보다, 못 봐서 이관되는 편이 눈에 띕니다. 대신 카테고리 카드에 "N/M 에이전트" 표시 |
| **D3** | 카탈로그 카테고리 전체 적용을 어디서 강제? | **저장·조회 양쪽** | origin은 문서 구성이 바뀌면 뒤집힙니다(PR #342에서 실제로 겪음). 조회 시점에도 `origin<>'catalog'`로 거릅니다 |
| **D4** | 답변 재사용 | **`ai_agent_id` 추가·대조** | §2.2 — 안 하면 기능이 무력화 |
| **D5** | 카테고리 없는 문서 | **전체 에이전트** | 미분류를 숨기면 방금 쓴 문서가 조용히 사라짐 |
| **D6** | board 소스 | **유형에서 제거** | §3.3 |

## 5. 남는 질문

| # | 내용 |
|---|---|
| Q1 | D2(새 에이전트 기본 접근)를 권장안대로 갈지 확인 |
| Q2 | D6(board 제거) 승인 여부 — 대안은 게시글 작성 화면 신규 개발 |
| Q3 | gdrive/notion 실계정 동기화 성공 검증을 이 작업에 포함할지, 별건으로 뺄지 |
| Q4 | tenant 4의 카테고리 3개를 페르소나에 맞게 재편하는 작업(운영)이 선행되어야 기능이 체감됨 |

## 6. side-impact

- **스키마 변경 2건**(`kb_categories.agent_ids`, `answer_reuse.ai_agent_id`) → 마이그레이션 SQL,
  스테이징 **선적용 후 코드 배포**. 둘 다 NULL 허용 추가라 구버전 코드와 공존 가능
- 엔티티 nullable 컬럼은 `type:` 명시(A-1 — 누락 시 부팅에서만 터짐)
- `KbCategoryService.ensure()`로 들어오는 신규 카테고리는 `agent_ids=NULL`(전체) — 카탈로그
  동기화·CSV·소스 어댑터의 기존 동작 무영향
- 위젯·임베드 SDK 무변경(서버에서 거름)
- 모더레이션·인용 표기 무영향
- `rag-retrieval-scope.spec.ts`에 조건절 검증 추가(결과가 아니라 술어를 검증 — 규칙이 빠지면
  모든 경로가 동시에 뚫리는데 답변만 봐서는 정상으로 보임)
- i18n 6개 언어 + `npm run i18n:check`
- 성능: 카테고리 서브쿼리는 테넌트당 최대 63행 — 인덱스 `(tenant_id)` 존재. 매 검색 2회 실행
  (두 갈래)이므로 필요 시 캐시, 지금은 불필요
