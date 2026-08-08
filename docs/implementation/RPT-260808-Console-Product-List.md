# RPT-260808-Console-Product-List

콘솔 상품 목록 화면 구현 보고.

- 작성일: 2026-08-08
- 문서 체인: `REQ-260808-Console-Product-List.md` → `PLN-260808-…` → `TCR-260808-…` → 본 문서
- PR: **#181** → main `7fd7b66` · 증분 **#184** → `d99ae2c`(상세보기 + 목록 100자 요약) · 수정 **#186** → `095bdd7`(레이아웃 결함 2건)

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

## 2-1. 증분 — 상세보기 + 목록 100자 요약 (PR #184)

| 파일 | 변경 |
|---|---|
| `product.controller.ts` | `GET /admin/products/:handle` — **정적 라우트 뒤에** 등록 |
| `product.mapper.ts` | `descriptionSnippet()`(100자, 단어 경계) · `toAdminProductDetailResponse` |
| `dto/response/product.response.ts` | 목록 행에서 `description` 제거 → `descriptionSnippet`, 상세용 `AdminProductDetailResponse` 신설 |
| `apps/web/src/domain/products/ProductDetailModal.tsx` **(신규)** | 이미지·가격·상태·지식 여부·카테고리·브랜드·태그·SKU·키·등록일·동기화·전체 내용 |
| `ProductsPage.tsx` | 요약 줄(2줄 clamp)로 태그 줄 대체, 행 클릭 → 다이얼로그, 쇼핑몰 링크는 `stopPropagation` |

**왜 서버에서 자르나**: 20행 페이지가 두 줄 렌더하자고 상품 본문 20개를 실어 보내고 있었다. 전문은 그것을 요구하는 상세가 가져간다.
**왜 단어 경계를 조건부로 인정하나**: 한국어 문구는 100자 안에 공백이 없는 경우가 흔해, 앞쪽 공백을 존중하면 요약 대부분이 날아간다 → 마지막 40% 구간의 공백만 인정.

## 2-2. 브라우저 확인에서 잡힌 결함 2건 (PR #186)

| # | 결함 | 왜 API 검증으로는 안 잡혔나 | 수정 |
|---|---|---|---|
| D9 | **지식 열이 화면 밖으로 잘려 접근 불가**(1568px) | 응답에는 `inKnowledge`가 정상적으로 들어 있었다. 공용 `Table` 래퍼가 `overflow-hidden`이라, 표가 컨테이너보다 넓어지면 오른쪽 열이 **가로 스크롤도 없이** 사라진다 | 래퍼를 `overflow-x-auto`로(다른 표들도 잘리는 대신 스크롤), 상품 셀 460px 제한으로 애초에 들어맞게 |
| D10 | 필터 3종이 각각 전체 너비로 **세로 3줄** | 화면을 봐야만 보이는 문제 | `Input`/`Select`가 공용 base에서 `w-full`을 달고 오고 `cn`은 클래스를 병합하지 않는 단순 join → 컨트롤의 `w-auto`가 짐. 폭 지정을 래퍼로 이동 |

**교훈**: S1~S12 API 검증을 전부 통과한 화면에서 **핵심 열이 아예 보이지 않았다.** 응답이 맞다는 것과 화면에 보인다는 것은 별개다 — 새 화면은 브라우저로 봐야 끝난다.

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
| `npx jest` | ✅ **777 passed / 74 suites** (신규 13) |
| `npm run typecheck` / `build` | ✅ 9/9 · 6/6 |
| 실기동 | ✅ `Nest application successfully started` + 라우트 4개 매핑 |
| 스테이징 | ✅ S1~S7 (TCR §3) — 요약 28/23/5·지식 28, 카테고리 6종, 상태 필터, 태그 검색, **테넌트 격리**, 번들 반영 |
| 스테이징(증분) | ✅ S8~S12 (TCR §3-1) — 목록에 전문 미포함, 상세 전문 조회, 정적 라우트 미가림, 404, **ivyusa 실데이터로 97자+`…` 단어경계 확인** |

## 5. 배포 상태

| 환경 | 상태 |
|---|---|
| 마이그레이션 | **불필요** — 스키마 변경 없음 |
| main | ✅ #181 `7fd7b66`, #184 `d99ae2c`, #186 `095bdd7` |
| staging | ✅ 배포·검증 완료 2026-08-08 (3회) |
| 브라우저 확인 | ✅ B1~B11 (TCR §3-2) — 한국어 UI 포함 |

## 6. 남은 일

1. Cafe24 테넌트(amoebaorder) 화면 육안 확인 — 계정 비밀번호가 없어 미확인. 데이터는 API로 검증했고 화면 로직은 테넌트 무관이다.
2. ivyusa 2,275건 체감 성능은 문제없었으나 정량 측정은 미실시.
3. 요청이 있으면 CSV 내보내기는 별도 요구사항으로.
