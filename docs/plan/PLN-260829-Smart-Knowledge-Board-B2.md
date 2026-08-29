# PLN-260829 — Smart Knowledge Board B2: KB 채택(promote) + 시뮬레이션

- 근거: `REQ-260829-Smart-Knowledge-Board.md`(권고안 확정) · B1 완료(PR #444/#445)
- **스키마 변경 없음** — B1이 예약한 `promoted_document_id`·상태 enum, KB의
  `(tenant, doc_group, external_key)` 유니크 축을 그대로 사용
- 요구의 핵심: *"운영자가 시뮬레이션으로 답변과 정확성 수치를 보고 판단한 후 KB에 저장"*

## 0. 설계 결정

| # | 결정 | 내용 |
|---|---|---|
| P4-1 | 채택 계약 | `POST /board/documents/:id/promote` body `{category?}` → kb_documents **업서트** `external_key='BRD-{id}'`, `source='board'`, docGroup=보드 문서 그룹, KB 카테고리 기본 매핑=**2차 분류 || 1차 분류**(요청으로 덮어쓰기 가능, `ensure` 그룹 포함) → 기존 임베딩 파이프라인. 보드 문서 `status='promoted'`+`promotedDocumentId` 기록, 감사 `board.document_promoted`. **재채택=같은 키 갱신**(제목·본문·카테고리 갱신 후 재임베딩) |
| P4-2 | 상태 전이 | `POST :id/reject`(검토 후 보류)·`POST :id/reopen`(promoted/rejected → published 복귀; promoted에서 reopen해도 **KB 문서는 남김** — 제거는 KB 화면에서 명시적으로). published 문서만 promote/reject 가능(draft는 게시 먼저) |
| P4-3 | 개정 감지 | 보드 `updatedAt > KB updatedAt` → 보드·KB 양쪽에 "개정 미반영" 뱃지 + [재채택]. KB 직접 편집은 허용하되 BRD-키 문서 편집 시 "보드 원본과 분기됨" 경고 문구(간이 비교 — 해시 대조는 과설계로 보류, C9 확정안) |
| P4-4 | 시뮬레이션 주입 | `POST /board/documents/:id/simulate` body `{question, language?, ai_agent_id?}` — 후보 보드 문서를 **Qdrant에 넣지 않고** 즉석 임베딩+코사인으로 검색 결과에 병합(`rag.answer`에 선택적 `extraCandidates` 파라미터, 미전달 시 기존 경로 무변경). 응답=답변·confidence·인용 목록 + **후보 인용 여부·후보 유사도**. 인덱스 오염 0, 채택 전 문서가 실고객 답변에 노출될 경로 0 |
| P4-5 | 골든셋 A/B | `POST :id/simulate/golden` — 활성 골든 질문(상한 10)을 **후보 미포함/포함 2회씩** 실행해 문항별 `Δconfidence`·후보 인용 여부, 요약(인용된 문항 수·평균 Δ) 반환. 골든 런은 통과/실패 채점이 아닌 실행·비교 구조임을 확인 — "통과율" 대신 **개선 수치(Δ)**로 표현(정확성의 절대 자동측정 불가, REQ C7 문면 유지). LLM 최대 20회 — 버튼 클릭 시에만, 골든셋 없으면 버튼 비활성+등록 안내 |
| P4-6 | 인제스트 타깃 전환 | 3차 AI 인제스트 승인이 KB 직행 → **보드 게시(published)** 생성으로 재타깃(REQ C2). category1=AI 제안 카테고리, 태그 `ai-import` 부여. 원본 파일-보드 문서 정밀 연결은 B4로 보류. 문안·토스트 갱신("보드에 게시됨 — 검토 후 채택") |
| P4-7 | KB 출처 뱃지 | KB 문서 목록에 출처 컬럼: `board`(채택됨)·`knowledge_store`(직접 등록)·`file_upload`·`youtube`·`google_drive`·`notion`·`product_catalog` — mapper의 기존 `source` 소비(신규 API 불요) |
| P4-8 | 권한 | promote/reject/reopen/simulate = `KNOWLEDGE_SOURCE_MANAGE`(보드 열람·작성은 B1대로 knowledge 메뉴 전원) |
| P4-9 | product 예외 | 카탈로그·상품 CSV는 종전 직행 유지(REQ D-4) — 보드 product 그룹 문서의 promote는 허용(수기 상품 지식) |

## 1. 백엔드 작업

1. `domain/board/board-promote.service.ts`(신규): promote(업서트+임베딩+상태 전이+감사),
   reject/reopen. 의존: KbDocument repo·KbCategoryService·KnowledgeService(embedDocuments)·
   KbRevisionService(KB측 리비전 record)·BoardService.
2. `domain/chat/rag.service.ts`: `answer(...)`에 선택적 `extraCandidates` — 후보를
   query 임베딩과 코사인 계산해 순위 병합, citation에 `candidate: true` 표시.
   **미전달 시 코드 경로 동일**(기존 스펙 무영향 확인).
3. `domain/board/board-simulate.service.ts`(신규): simulate(1문항)·simulateGolden(A/B,
   상한 10) — `knowledge.ask` 확장 재사용 또는 rag 직접 호출+모더레이션 게이트 유지.
4. 인제스트 재타깃: `knowledge-ingest.service.approve`가 BoardService.create(published,
   tags+['ai-import'])로 저장. 기존 스펙(FILE-키 단언) 갱신.
5. 개정 감지: 보드 상세·KB 상세 응답에 `revisionBehind: boolean`(P4-3 비교) 노출.
6. 테스트: promote 업서트/재채택/카테고리 매핑, reject/reopen 전이 가드, 후보 병합
   코사인 순위, golden A/B 집계, 인제스트 보드 타깃, 기존 rag 스펙 회귀.

## 2. 콘솔 작업

1. 보드 편집 페이지: published 상태에서 **[시뮬레이션]**·**[KB 채택]**·[보류] 버튼
   (KNOWLEDGE_SOURCE_MANAGE 사용자에게만). promoted 뱃지+`개정 미반영` 뱃지+[재채택].
2. **시뮬레이션 모달**: 질문 입력 → 답변 미리보기 + 후보 인용 뱃지 + confidence·후보
   유사도 게이지 → [골든셋 A/B 실행] → 문항별 Δconfidence 표 + 요약 → 하단 [KB 채택].
3. 보드 목록: promoted/rejected 상태 필터 칩.
4. KB 문서 목록(KnowledgePage): 출처 뱃지 컬럼(P4-7), BRD 문서 상세에 "보드 원본 열기"
   링크+분기 경고.
5. AI 임포트 모달: 승인 문안 "보드에 게시" 갱신, 완료 시 보드 목록 링크.
6. i18n 6개 로케일(board·knowledge 네임스페이스).

## 3. UI 와이어프레임

```
[보드 편집 — published 문서 상단]
│ 상태: 게시됨   [시뮬레이션] [KB 채택] [보류]  (promoted면: [KB 채택됨 ✓] [재채택] [보드로 복귀])

[시뮬레이션 모달]
┌─ 시뮬레이션 — "환불 7일 정책" ───────────────── ✕ ─┐
│ 질문 [고객이 8일째에 환불을 요구하면?________] [실행] │
│ ── 답변 미리보기 ──────────────────────────────────  │
│ 7일이 지난 경우 원칙적으로... (모더레이션 통과)       │
│ 인용: ①[후보✦] 환불 7일 정책 (유사 0.71) ② faq… 0.44 │
│ confidence ▓▓▓▓▓▓▓░░ 0.68    후보 문서가 인용됨 ✓    │
│ ── 골든셋 A/B (7문항) ── [실행: LLM 최대 14회]        │
│ 문항                     미포함→포함   Δ    후보인용  │
│ 환불 언제까지 되나요?      0.41→0.72  +0.31    ✓      │
│ …                                                     │
│ 요약: 후보 인용 3/7 · 평균 Δ +0.12                    │
│                      [닫기]      [이 문서 KB 채택]     │
└──────────────────────────────────────────────────────┘

[KB 문서 목록]  출처 뱃지: [보드] [직접] [파일] [YouTube] [Drive] [Notion] [카탈로그]
```

## 4. 측면 영향

| 영역 | 영향 | 대응 |
|---|---|---|
| RAG 실서비스 | `extraCandidates` 미전달 경로 무변경 — 위젯/채팅 영향 0 | 기존 스펙 회귀로 보증 |
| Qdrant | 후보는 미등록(즉석 코사인) — 인덱스 오염 0 | P4-4 |
| 3차 인제스트 | 승인 산출물이 KB→보드로 이동(파이프라인 개선, REQ C2 정렬) | 스펙·문안 갱신, RPT에 동작 변경 명기 |
| KB 직행 경로 | 유지(D-1) — 뱃지로 구분만 | — |
| AI 비용 | simulate 1회=ask 1회, golden A/B=최대 20회 — 운영자 명시 클릭 시에만, 사용량 계측 자동 계상 | 모달에 호출 수 표기 |
| 골든셋 부재 테넌트 | A/B 버튼 비활성+등록 안내(E4017 기존 코드 재사용) | — |

## 5. 리스크

- 즉석 코사인과 Qdrant 점수 스케일 차이 — 후보 유사도는 **같은 임베딩 공간의 코사인**
  이므로 비교 가능하나, 표시상 "후보 유사도"로 별도 라벨(혼동 방지).
- promoted 문서의 보드 재편집 → 개정 미반영 뱃지가 안내(P4-3), 재채택 1클릭.
- golden A/B 중복 실행 남용 — 모달 내 재실행 시 확인 문구(비용 고지).

---
**승인 요청**: P4-1~P4-9 포함 본 계획으로 구현 진행 여부를 확인해 주세요.
