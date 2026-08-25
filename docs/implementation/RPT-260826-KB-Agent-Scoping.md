# RPT-260826-KB-Agent-Scoping

REQ/PLN-260826 구현 결과 — 카테고리 단위 에이전트 범위 · 페이지 안내 · board 소스 제거

- 완료일: 2026-08-26
- 선행: [REQ](../analysis/REQ-260826-KB-Agent-Scoping-And-Source-Review.md) ·
  [PLN](../plan/PLN-260826-KB-Agent-Scoping-And-Source-Review.md) ·
  [TCR](../test/TCR-260826-KB-Agent-Scoping.md) ·
  [AN-260825](../analysis/AN-260825-Knowledge-Menus-And-Retrieval.md)

## 1. 배포 상태

| PR | 내용 | 커밋 | 스테이징 |
|---|---|---|---|
| #387 | un-designated 소스 검색 제외 + `pending` 배지 정직화 | `c0fba42` | ✅ 2026-08-26 |
| #388 | REQ + PLN 문서 | `5502c1f` | (문서) |
| #389 | W1~W5 구현 | `57f7d65` | ✅ 2026-08-26 |
| #390 | S-T9 결함 수정 | `a2f14fe` | ✅ 2026-08-26 |

**마이그레이션 2건 — 스테이징 적용 완료(코드 배포 전 선적용).** 프로덕션 미적용.

| SQL | 변경 | staging | prod |
|---|---|---|---|
| `sql/migration_kb_category_agent_scope.sql` | `kb_categories.agent_ids JSON NULL` | ✅ | ☐ |
| `sql/migration_answer_reuse_agent.sql` | `answer_reuse.ai_agent_id BIGINT NULL` + 인덱스 | ✅ | ☐ |

배포 검증(상태코드 아닌 내용): 부팅 로그 `successfully started`, `PUT /knowledge/categories/:id/agents`
→ **401**(=배포됨), 웹 번들에 신규 문구 포함, 샘플 CSV 200, board 어댑터 이미지에서 제거 확인.

## 2. 무엇이 바뀌었나

### 2.1 카테고리 단위 에이전트 범위 (R2)

`kb_categories.agent_ids` — 허용 에이전트 목록, 비어 있으면 전체. 시나리오 버튼과 같은 규약이라
운영자가 조작을 두 번 배우지 않습니다.

검색 조건은 **"제외된 카테고리에 들지 않은 것"** 으로 씁니다. 이 방향 덕분에 범위를 쓰지 않는
테넌트의 결과가 한 행도 바뀌지 않고, 카테고리 없는 문서는 손대지 않습니다. 두 갈래(키워드·벡터)
모두 `baseQuery`를 지나므로 어느 쪽이 찾았든 규칙을 우회할 수 없습니다.

### 2.2 답변 재사용 (D4)

요구사항에 없었지만 **없으면 기능이 무력화되는** 부분이었습니다. 재사용 조회는 RAG보다 먼저
돌고 키가 테넌트+언어뿐이라, 파트너 전용 답변이 저장된 뒤엔 아무 에이전트에게나 재생됐습니다.
`ai_agent_id`를 기록·대조하고, **에이전트 기록이 없는 과거 행은 그 테넌트가 범위를 하나라도
지정한 경우에만 막습니다** — 안 쓰는 테넌트는 동작이 그대로고, 쓰는 테넌트는 새 행이 쌓이며
자연 복구됩니다.

### 2.3 콘솔 (R1/R3/R4)

프로세스 배너(접힘 기억), 문서를 만드는 세 버튼 옆 `?` 도움말, 샘플 CSV, 카테고리 행의 범위
버튼(에이전트 1개 테넌트에는 미표시), 지식질의 에이전트 선택기, `지식베이스문서` 표기 6개 언어.

### 2.4 board 소스 제거 (R5)

내부 게시판이었고, 드롭다운 **기본값**이었고, 글을 쓸 화면이 없었습니다. 새로 만들려 하면
거부되고, 기존 3건은 `repository`와 같이 "미지원"으로 남습니다. 시드는 더 이상 정책 문서를
board 소스에 묶지 않습니다.

## 3. 파일

**API** — `chat/rag.service.ts`(범위 조건·인자 전달), `chat/chat.service.ts`(에이전트 해석),
`ai-engine/ai-config.service.ts`(`effectiveAgentId`), `knowledge/kb-category.service.ts`(`setAgents`),
`knowledge/knowledge.{controller,service,mapper,module}.ts`, `knowledge/entity/kb-category.entity.ts`,
`knowledge/source-sync.service.ts`(board 등록 해제), `answer-reuse/*`(에이전트 기록·대조),
`agent/agent.service.ts`(사람 답변의 에이전트), `database/seed.runner.ts`
**삭제** — `knowledge/adapters/board.adapter.ts`(+spec), 게시글 라우트 2개
**Web** — `components/HelpModal.tsx`(신규), `domain/knowledge/KnowledgeGuides.tsx`(신규),
`CategoryManagerCard.tsx`, `KnowledgePage.tsx`, `KnowledgeQaPanel.tsx`, `knowledge.{service,hooks}.ts`,
`public/samples/kb-product-import-sample.csv`, 로케일 12개 파일
**SQL** — 마이그레이션 2건 + `artefacts.tsv`

## 4. 배포·검증에서만 드러난 것 3가지

### ① 시드가 정책 문서를 board 소스에 묶고 있었다
"소스에서 나온 문서 0건"이라고 쓴 앞선 분석이 절반만 맞았습니다. 동기화가 **만든** 문서는
0건이지만 시드가 tenant 1의 정책 문서 12건을 소스 1번에 붙여놨습니다. #387 이후 그 소스를
지정 해제하면 **테넌트의 기본 정책이 통째로 검색에서 빠집니다.** 시드를 고쳤고(`source_id`
없이 저장) 기존 행은 그대로 뒀습니다 — 지금 값도 무해하고, 사실을 정리하려고 되돌릴 수 없는
UPDATE를 돌릴 이유가 없습니다.

### ② 에이전트 선택기가 아무 일도 하지 않고 있었다
`/agent/knowledge/ask`에는 `ai_agent_id`를 넘기고 콘솔이 실제로 부르는 `/knowledge/ask`에는
넘기지 않았습니다. 화면·요청·응답 전부 정상으로 보이면서 전체 범위로 답하는 상태 —
**작동하는 것처럼 보이는 컨트롤은 없는 것보다 나쁩니다.** 리뷰가 잡았고, 양쪽 다 테스트로
묶었습니다.

### ③ null이 두 호출자에게 정반대 뜻이었다 (S-T9)
`rag.answer(aiAgentId=null)`을 기본 에이전트로 해석했더니, 콘솔 **운영자 보기**가 기본
에이전트의 제약을 물려받아 방금 좁힌 카테고리를 못 보게 됐습니다. 스테이징 스모크에서만
드러났습니다 — 단위 테스트의 더블이 전부 `null`을 돌려주고 있어 차이가 나타나지 않았기
때문입니다. 지금은 RAG가 받은 값을 적용만 하고 해석은 호출자가 합니다.

## 5. 잔여

| # | 항목 | 비고 |
|---|---|---|
| R-1 | 재사용 교차 차단 스테이징 실증(S-T5) | 스모크 중 신뢰도 게이트(0.75) 미달로 저장 행이 안 생김. 단위 5건으로 고정됨 |
| R-2 | 6개 언어 화면 육안, 샘플 CSV 왕복 업로드 | |
| R-3 | tenant 4 카테고리 재편(운영) | 3개뿐이라 재편 후에야 기능이 의미를 가짐(REQ Q4) |
| R-4 | gdrive/notion 실계정 동기화 성공 | REQ Q3에서 범위 밖으로 합의 |
| R-5 | 프로덕션 마이그레이션 2건 | 배포 시 선적용 필수 |
