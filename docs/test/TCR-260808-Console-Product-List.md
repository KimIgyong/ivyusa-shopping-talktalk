# TCR-260808-Console-Product-List

콘솔 상품 목록 화면 테스트 케이스.

- 작성일: 2026-08-08
- 대상: `PLN-260808-Console-Product-List.md`
- 자동화: Jest — 신규 8케이스, 전체 **772 passed / 73 suites**

---

## 1. 단위 테스트 (`product.service.spec.ts`, 신규 8)

| ID | 케이스 | 기대 | 결과 |
|---|---|---|---|
| U1 | `adminList` 기본 | `where={tenantId}` — **status 조건 없음**(보관 포함), 정렬 `status ASC, publishedAt DESC, id DESC` | ✅ |
| U2 | 상태 필터 `archived` | `where={tenantId,status:'archived'}` | ✅ |
| U3 | 상태값이 active/archived 둘 다 아님 | 무시하고 전체 조회(허용 값만 반영) | ✅ |
| U4 | 검색 + 카테고리 + 상태 동시 | title 브랜치·tags 브랜치 **양쪽 모두**에 다른 필터가 유지됨 | ✅ |
| U5 | tenantId 없는 principal | `[[],0]` — 리포지토리 호출 자체가 없음(fail-closed) | ✅ |
| U6 | `adminSummary` | total/active/archived 집계 + **가장 최근** syncedAt | ✅ |
| U7 | `adminSummary`(tenant 없음) | 0/0/0/null | ✅ |
| U8 | `knowledgeHandles` | 페이지 전체를 **1쿼리**로 해결, externalKey null 행 제외 / 빈 페이지는 쿼리 안 함 | ✅ |

## 2. 통합 (로컬)

| ID | 항목 | 결과 |
|---|---|---|
| I1 | `npm run typecheck` | ✅ 9/9 |
| I2 | `npm run build` | ✅ 6/6 |
| I3 | API 실기동 | ✅ `Nest application successfully started` |
| I4 | 라우트 매핑 | ✅ `admin/products/summary`, `admin/products/categories`, `admin/products` (GET), `admin/products/sync` (POST) |

## 3. 스테이징 검증 (2026-08-08, tenant 3 = amoebaorder)

| ID | 케이스 | 결과 |
|---|---|---|
| S1 | `GET /admin/products/summary` | ✅ `{total:28, active:23, archived:5, inKnowledge:28, lastSyncedAt:…}` — DB 집계와 일치 |
| S2 | `GET /admin/products/categories` | ✅ `기타·립·소품·아이·페이스·향수` (보관 행 포함 집계) |
| S3 | `GET /admin/products?page=1&size=3` | ✅ pagination `{page,size,totalCount:28,totalPages:10,hasNext}`, 각 행에 category·status·inKnowledge·몰 링크 |
| S4 | 상태 필터 `status=archived` | ✅ 5건, 전부 archived |
| S5 | 검색 `q=향수` | ✅ 4건 — **제목에 "향수"가 없는데도** 태그 브랜치로 회수(검색이 태그까지 본다는 증거) |
| S6 | **테넌트 격리** — tenant 1 토큰으로 조회 | ✅ ivyusa 2,275건만, Cafe24 행 미노출 |
| S7 | 신규 화면 번들 반영 | ✅ web 컨테이너 자산에서 신규 i18n 키 확인 |

## 4. 남은 확인

- 콘솔 브라우저 육안 확인(레이아웃·이미지 폴백·페이지네이션 클릭) — API 경로로만 검증했다.
- ivyusa 2,275건 화면에서의 체감 성능(페이지 20건 + 지식 조회 1쿼리 설계라 문제 없을 것으로 보나 미측정).
