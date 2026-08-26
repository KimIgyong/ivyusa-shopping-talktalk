# PLN-260826 지식 문서 목록 UI 개편 (제목 중심 행 + 서버 필터/정렬) 구현 계획

- 근거: `docs/analysis/REQ-260826-KB-Documents-List-UI.md`

## 핵심 설계 결정

| # | 결정 | 근거 |
|---|---|---|
| D1 | 필터·정렬 전부 **서버 측**(`ListDocumentsQuery` 확장) | 목록이 서버 페이지네이션 — 클라 정렬은 "현재 페이지만 정렬"이라는 조용한 오류를 만듦 |
| D2 | 출처 셀렉트 옵션 = 신규 **`GET /knowledge/documents/facets`**(tenant DISTINCT source/status) | `source`는 고정 enum이 아님(`knowledge_gap` 등 실재) — 고정 목록은 새 값이 UI에서 사라지는 invisible-fallback 재발 경로 |
| D3 | 정렬은 **헤더 클릭 토글**(제목·수정일), 필터는 셀렉트 3종(노출/출처/상태) | 요구 원문 그대로: 정렬 2축(가나다·정역순) + 선택 필터 3축. 미지정 시 기존 `id DESC` 유지(무회귀) |
| D4 | 더보기 = **행 내 팝오버**(외부 클릭 닫기), 항목: 노출 토글·출처·상태·원본링크·삭제 | 기존 기능 5종 수용·기능 제거 없음. 모달은 과함, hover 액션열은 터치에서 죽음 |
| D5 | 스키마 무변경 — sort는 화이트리스트(`title`/`updated`)와 `ASC`/`DESC`만 매핑 | 사용자 입력을 ORDER BY에 직결하지 않음(인젝션·오타 안전), 그 외 값은 기본 정렬 |

## W1. 백엔드 (`apps/api/src/domain/knowledge/`)

1. `ListDocumentsQuery`에 추가: `active?`('1'|'0') · `source?` · `status?` · `sort?`('title'|'updated') · `order?`('asc'|'desc').
2. `knowledge.service.listDocuments`: where에 3필터 추가, order는 화이트리스트 매핑
   (`title`→`{ title: dir, id: 'DESC' }`, `updated`→`{ updatedAt: dir, id: 'DESC' }`, 미지정→기존 `{ id: 'DESC' }`).
3. 신규 `listDocumentFacets(tenantId)`: `SELECT DISTINCT source` + `DISTINCT status`(2쿼리, tenant 스코프) →
   `GET /knowledge/documents/facets` (KNOWLEDGE_SOURCE_MANAGE). ⚠️ 라우트 선언 위치: **`documents/:id`보다 앞**
   (기존 `categories/counts` 섀도잉 사고와 동일 함정 — `facets`가 `:id`로 흡수되면 500/404).
4. 유닛: 필터 where 조립·sort 화이트리스트(미지·인젝션 값→기본 정렬)·facet 테넌트 스코프.

## W2. 프런트 (`apps/web/src/domain/knowledge/`)

- `knowledge.service.ts`: `DocumentListParams` 확장 + `documentFacets()`.
- `knowledge.hooks.ts`: `useDocuments` 키에 새 파라미터 포함, `useDocumentFacets`(staleTime 5분).
- `KnowledgePage.tsx`:
  - 상태 `docActive`/`docSource`/`docStatus`/`docSort`/`docOrder` — 변경 시 `setPage(1)`.
  - 필터 행(테이블 위): 노출/출처/상태 셀렉트 3종(출처 옵션=facets, 로딩 전엔 '전체'만).
  - `docColumns` 재구성 4열: 카테고리(`w-28 shrink-0` 배지) · 제목(잔여폭, 기존 클릭=상세 유지) ·
    수정일(+stale) · 더보기(⋯ 팝오버 — 노출 토글/출처/상태/원본링크/삭제, 열린 행 id state 1개 + 외부클릭 닫기).
  - 제목·수정일 헤더 클릭 정렬(↑↓ 표시). Table 컴포넌트가 header에 ReactNode를 받는지 확인, 아니면 버튼 렌더.
- i18n 6언어: 필터 라벨·전체·노출/숨김·더보기 aria 등 ~10키.

## W3. TCR · RPT (스키마 무변경 — SQL/Migration 없음)

## 와이어프레임

```
┌ KB Documents ──────────────────────────────────────────────────────────┐
│ [전체|상담|상품]  ← 기존 그룹 탭 유지                                      │
│ ┌카테고리 내비┐  노출[전체 ▾] 출처[전체 ▾] 상태[전체 ▾]      ← 신규 필터 행 │
│ │ 전체 1828   │  ───────────────────────────────────────────────────── │
│ │ faq 120    │   카테고리 │ 제목 ▲                    │ 수정일 ▼ │ ⋯    │
│ │ policy 12  │  ───────────────────────────────────────────────────── │
│ │ …          │   [faq]   │ 반품 절차 안내 (≈80% 폭)    │ 8/25    │ (⋯)  │
│ └────────────┘   [policy]│ 교환 배송비 정책            │ 8/24    │ (⋯)──┐
│                                                        │ 노출  [ON→OFF]│
│                  ‹ 1 2 3 › ← 기존 페이지네이션           │ 출처  지식저장소│
│                                                        │ 상태  embedded│
│                                                        │ 원본 열기 ↗   │
│                                                        │ ────────────  │
│                                                        │ 삭제          │
│                                                        └───────────────┘
```
- 제목 헤더 클릭: 무정렬 → 가나다순(▲) → 역순(▼) → 무정렬. 수정일도 동일(정순/역순).
- 정렬 활성 시 다른 축 정렬은 해제(단일 정렬).

## 부수영향
- 기본 정렬·기존 파라미터 무변경 — 필터 미사용 시 현재와 동일 응답(무회귀).
- facets는 신규 읽기 전용 경로 — 기존 캐시/화면 영향 없음.
- 더보기 팝오버로 이동해도 노출 토글·삭제는 기존 뮤테이션 그대로(토스트 포함).

## 검증 계획
유닛(필터 조립·sort 화이트리스트·facet 스코프) + 스테이징: 3필터 각각·조합, 제목/수정일 정렬 양방향(페이지 넘어 일관), 카테고리·그룹과 병행, ⋯에서 노출 전환·삭제, facets에 실재 source 값 노출.
