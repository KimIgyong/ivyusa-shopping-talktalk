# RPT-260808-Console-Product-List

콘솔 상품 목록 화면 구현 보고.

- 작성일: 2026-08-08
- 문서 체인: `REQ-260808-Console-Product-List.md` → `PLN-260808-…` → `TCR-260808-…` → 본 문서
- PR: **#181** → main `7fd7b66`

---

## 1. 무엇을 했나

동기화된 상품을 콘솔에서 볼 방법이 없었다. 상품 읽기 API는 위젯용 `GET /products` 하나뿐이고
`@Public` + 세션 토큰 + `status='active'` 고정이라 콘솔에서 호출할 수도, 보관 상품을 볼 수도 없었다.
이번 Cafe24 검증조차 MySQL에 직접 붙어서 했다 — 운영자에겐 없는 방법이다.

`/products` 화면과 그 뒤의 조회 API를 추가했다.

## 2. 변경 파일

| 파일 | 변경 |
|---|---|
| `apps/api/src/domain/product/product.controller.ts` | `GET /admin/products`(목록) · `/summary` · `/categories` — 기존 sync와 같은 `module.operations` 게이트. 정적 라우트를 위에 배치 |
| `apps/api/src/domain/product/product.service.ts` | `adminList`(보관 포함) · `adminSummary` · `adminCategories` · `knowledgeHandles` · `knowledgeDocumentCount` |
| `apps/api/src/domain/product/product.mapper.ts` · `dto/response/product.response.ts` | `toAdminProductResponse` / `AdminProductResponse`·`AdminProductSummaryResponse` |
| `apps/api/src/domain/product/product.module.ts` | `KbDocument` 리포지토리 등록(읽기 전용) |
| `apps/web/src/domain/products/*` | 서비스·훅·`ProductsPage`(요약 카드·검색·필터·표·페이지네이션·빈 상태) |
| `apps/web/src/router/AppRouter.tsx` · `layouts/nav-config.ts` | `/products` 라우트 + 사이드바(지식 다음) |
| `apps/web/src/i18n/**` | 신규 `products` 네임스페이스 + nav 라벨 (en/es/ko) |

## 3. 설계 결정

| 결정 | 이유 |
|---|---|
| **보관(archived) 상품도 보여준다** | 조용히 몰에서 내려간 상품을 찾는 것이 이 화면의 용도 중 하나다. 고객용 목록은 의도적으로 숨기므로 재사용하지 않고 별도 메서드를 만들었다 |
| **행마다 "지식 등록" 표시** | `products_cache` 행은 전시 데이터일 뿐이고 `kb_documents`가 없으면 상담에서는 존재하지 않는 상품이다. 이 차이가 지금까지 SQL로만 보였다 |
| 지식 조회는 **페이지당 1쿼리** | 행마다 조회하면 N+1 |
| 동기화 버튼 **미배치** | 설정 > Cafe24에 이미 있고, 플랫폼 분기를 화면에 중복시키지 않는다 |
| 새 capability 만들지 않음 | 기존 `module.operations` 재사용(상품 동기화와 동일 게이트) |
| 빈 카탈로그와 필터 0건을 **구분** | 전자는 가져오기가, 후자는 다른 검색이 필요하다. 같은 문구면 고장과 구분되지 않는다 |

## 4. 테스트 결과

| 항목 | 결과 |
|---|---|
| `npx jest` | ✅ **772 passed / 73 suites** (신규 8) |
| `npm run typecheck` / `build` | ✅ 9/9 · 6/6 |
| 실기동 | ✅ `Nest application successfully started` + 라우트 4개 매핑 |
| 스테이징 | ✅ S1~S7 (TCR §3) — 요약 28/23/5·지식 28, 카테고리 6종, 상태 필터, 태그 검색, **테넌트 격리**, 번들 반영 |

## 5. 배포 상태

| 환경 | 상태 |
|---|---|
| 마이그레이션 | **불필요** — 스키마 변경 없음 |
| main | ✅ PR #181 → `7fd7b66` |
| staging | ✅ 배포·검증 완료 2026-08-08 |

## 6. 남은 일

1. 콘솔 브라우저 육안 확인(레이아웃·이미지 폴백·페이지네이션) — 검증은 API 경로로 수행했다.
2. ivyusa 2,275건 화면 체감 성능 미측정(페이지 20건 + 지식 1쿼리 설계).
3. 요청이 있으면 CSV 내보내기 / 상품 상세 패널은 별도 요구사항으로.
