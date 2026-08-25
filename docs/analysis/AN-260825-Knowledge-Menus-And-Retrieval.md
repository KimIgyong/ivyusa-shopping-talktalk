# AN-260825-Knowledge-Menus-And-Retrieval

`/knowledge` 네 영역의 기능·연관관계와 **에이전트가 실제로 참고하는 항목**

- 작성일: 2026-08-25
- 요청: Sources · Usage guides · Categories · Documents 각 메뉴의 기능과 관계 정리,
  그리고 **실제 에이전트가 지식으로 참고하는 항목** 규명
- 근거: 코드 실측 + 스테이징 실데이터(2026-08-25)

## 1. 네 영역의 관계

```
Sources ──동기화──> Documents <──작성── Usage guides
                        │
                   category 문자열
                        │
                   Categories (관리·표시)
                        ↓
                 [에이전트가 읽는 것]
```

| 메뉴 | 하는 일 | 저장소 |
|---|---|---|
| **Sources** | 외부 지식을 끌어오는 **파이프**(board/gdrive/notion/repository) | `knowledge_sources` — 설정. 지식 자체가 아님 |
| **Usage guides** | 상품 유형별 사용법을 **사람이 작성** | 결과는 `kb_documents`(`doc_group=product`, `category='How to Use'`) |
| **Categories** | 문서 분류의 **이름표** 관리 | `kb_categories` + `kb_documents.category` |
| **Documents** | **지식 본체** | `kb_documents` |

**Sources와 Usage guides는 입구이고, 최종적으로 전부 `kb_documents` 한 곳으로 모입니다.**
Categories는 그 문서에 붙는 꼬리표입니다.

## 2. 에이전트가 실제로 참고하는 것

**`kb_documents` 뿐입니다.** 조건은 `RagService.baseQuery()` 한 곳에 있습니다.

```sql
kb.active = 1
AND (kb.tenant_id = <테넌트> OR kb.tenant_id IS NULL)
AND (kb.source_id IS NULL
     OR kb.source_id NOT IN (SELECT id FROM knowledge_sources WHERE designated = 0))
```

검색은 두 갈래이고 **둘 다 이 조건을 지납니다** — 키워드 갈래는 직접 조회하고, 벡터 갈래는
히트한 id를 같은 쿼리로 재조회합니다.

| 갈래 | 대상 |
|---|---|
| 키워드 (MySQL FULLTEXT) | 위 조건을 만족하는 **모든** 문서 — **임베딩 여부 무관** |
| 의미 (Qdrant 벡터) | 그중 **임베딩된 것만**(Qdrant에 점이 있는 것) |

순위 가산점 둘: `source='knowledge_store'` **+0.0005**, 대화 의도와 맞는 `doc_group` **+0.002**.

## 3. 오해하기 쉬운 다섯 가지

### ① Sources는 그 자체로 지식이 아닙니다
게시판 글·Drive 파일·Notion 페이지를 에이전트가 직접 읽지 않습니다. **동기화가 문서를 만들어야**
참조됩니다. 스테이징 실측: **소스 8개 중 7개가 `last_sync_status = NULL`** — 한 번도 동기화되지
않았고, 따라서 지식에 **아무 기여도 하지 않습니다.**

### ② `designated`가 검색에 반영되지 않았습니다 → **수정함**
코드 주석은 *"Only designated + active KB documents are retrieved"*라고 적혀 있었지만 실제
쿼리는 `active`와 테넌트만 봤습니다. 플래그는 **소스**에 있고 검색은 **문서**만 봤기 때문입니다.
소스를 지정 해제해도 이미 만들어진 문서는 계속 인용됐습니다.
→ `baseQuery`에 위 조건을 추가했습니다. 소스가 없는 문서(수기·카탈로그·갭 승격)는 영향 없습니다.

### ③ Categories는 검색에 관여하지 않습니다
필터도 가중치도 아닙니다. **인용 표시용 라벨**로만 쓰입니다(`[policy_payment] …`).
카테고리를 정리해도 **답변 내용은 바뀌지 않습니다** — 사람이 문서를 찾기 쉬워질 뿐입니다.

### ④ `pending` 문서는 이미 답변에 쓰입니다 → **표시를 수정함**
키워드 갈래에 status 조건이 없어 **임베딩 전에도 검색됩니다.** 콘솔의 "대기" 배지는
"아직 안 쓰임"으로 읽히지만 사실이 아닙니다.

**검색에서 빼지 않았습니다.** 뺐다면 방금 작성한 지식이 임베딩 배치 전까지 **조용히** 쓰이지
않게 되고, 그쪽이 더 나쁩니다. 대신 콘솔이 사실을 말하도록 배지에 설명과 표 아래 안내를
넣었습니다 — 운영자는 이 목록을 보고 무엇을 고칠지 정하는데, "대기"가 실은 "이미 고객에게
답하는 중"이면 그 판단이 달라집니다.

### ⑤ Usage guides는 작성된 것이 0건입니다
전 테넌트 통틀어 `category='How to Use'` 문서가 없습니다. 기능은 살아 있으나 **현재 지식 기여는
0**입니다.

## 4. 스테이징 실제 구성 (tenant 1)

```
product_catalog / product   1,688건  embedded · active   ← 카탈로그 자동 생성
knowledge_store / counsel     238건  embedded · active   ← 사람이 만든 정책·FAQ
knowledge_store / product     144건  embedded · active
knowledge_gap   / counsel       2건                      ← 상담에서 승격
비활성                        105건                      ← 검색 제외
```

## 5. KB 밖에서 답변에 섞이는 것

- **주문 사실** — 로그인 고객의 실제 주문 데이터. KB 문서로는 담을 수 없어 별도 주입
- **답변 재사용** — 승인된 과거 답변을 **RAG보다 먼저** 조회해 재생. 히트하면 문서 검색 없이 종료

## 6. 남는 질문

| # | 내용 |
|---|---|
| Q-1 | 동기화된 적 없는 소스 7개 — 등록만 하고 방치된 것인지, 자격증명 대기인지 확인 필요 |
| Q-2 | 비활성 문서 105건의 사유(수동 숨김 / 원본 삭제 / 카탈로그 단종) 점검 |
| Q-3 | Usage guides 0건 — 기능 유지 여부는 [[knowledge-taxonomy-per-tenant]] D5의 채택률 논의와 같은 줄기 |
