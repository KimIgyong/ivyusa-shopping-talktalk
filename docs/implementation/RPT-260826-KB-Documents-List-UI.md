# RPT-260826 지식 문서 목록 UI 개편 — 구현 보고

- REQ: `docs/analysis/REQ-260826-KB-Documents-List-UI.md`
- PLN: `docs/plan/PLN-260826-KB-Documents-List-UI.md` (승인: 전체 진행)
- TCR: `docs/test/TCR-260826-KB-Documents-List-UI.md`

## 배포 상태

| 항목 | 값 |
|---|---|
| PR | **#397** (squash) → main **`a68c9be`** |
| 마이그레이션 | 없음 (스키마 무변경) |
| 스테이징 배포 | **2026-08-26 완료** — 부팅 `successfully started`, `/health` ok, facets 401→200 확인 |
| 프로덕션 | 미배포 |

## 구현 내용

- **행 재배치(R1)**: `카테고리(w-32 배지) | 제목(잔여폭≈80%, 클릭=상세) | 수정일(+stale) | ⋯`.
  더보기 팝오버에 노출 토글·출처·상태(+pending 힌트)·원본 링크·삭제 — 기존 기능 5종 전부 이동 수용.
  팝오버는 **position:fixed**(테이블 `overflow-x-auto` 클리핑 회피), 외부 클릭/스크롤/리사이즈 시 닫힘.
- **서버측 필터(R2)**: `ListDocumentsQuery`에 `active('1'|'0')/source/status/sort('title'|'updated')/order` —
  DTO `@IsIn` + 서비스 화이트리스트 매핑(입력이 ORDER BY 직결 안 됨), 미지정 시 기존 `id DESC` 그대로.
- **facets**: `GET /knowledge/documents/facets` — 테넌트 DISTINCT source/status. `documents/:id`보다 앞에 선언(섀도잉 함정 회피).
- 프런트: 필터 셀렉트 3종(옵션=facets), 헤더 클릭 정렬(무정렬→가나다→역순→무정렬, 단일 축), 필터 변경 시 1페이지 리셋, i18n 6언어 +10키.

## 파일

백엔드: `knowledge.request.ts`(쿼리 DTO), `knowledge.service.ts`(필터/정렬/facets), `knowledge.controller.ts`(facets 라우트), `knowledge.service.list.spec.ts`(신규 5케이스).
프런트: `KnowledgePage.tsx`(4열·필터 행·⋯ 패널), `knowledge.service.ts`, `knowledge.hooks.ts`(useDocumentFacets), knowledge 로케일 6종.

## 테스트 결과

- 유닛: 신규 5케이스 포함 **156 suites / 1,653 tests 통과**. typecheck·build·i18n:check·실부팅 ✅.
- 스테이징 API 스모크 (2026-08-26, ivyusa):
  - facets = `sources: [knowledge_gap, knowledge_store, product_catalog]`, `statuses: [embedded]` —
    **하드코딩 목록이었다면 `product_catalog`가 필터에서 누락**됐을 값이 실재(DISTINCT 방식 실증).
  - 노출 분할 2,072(노출)+6(숨김)=2,078(전체) 정확 일치, 행 값 검증 통과.
  - 출처 필터 387건 전건 일치, 상태·그룹·노출 3중 조합 1,832건 정상.
  - 제목 가나다순 **2페이지 100행 연속 정렬 일관**, 수정일 역순 단조 감소 확인.
  - 미지 sort 값 → 400 E5003 (DTO 거부).
- UI 육안(S1·S7 — 팝오버 조작감·레이아웃)은 운영 확인 잔여.

## 잔여

- UI 육안 확인(4열 비율·⋯ 팝오버·정렬 화살표).
- 백로그: 제목 검색어 입력, 다중 선택 일괄 노출/삭제.
