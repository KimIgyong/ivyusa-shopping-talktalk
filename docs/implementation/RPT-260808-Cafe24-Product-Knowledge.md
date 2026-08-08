# RPT-260808-Cafe24-Product-Knowledge

Cafe24 몰 상품정보 가져오기 + 지식(KB) 활용 구현 보고.

- 작성일: 2026-08-08
- 문서 체인: `REQ-260808-Cafe24-Product-Knowledge.md` → `PLN-260808-…` → `TCR-260808-…` → 본 문서
- PR: **#168** (`feature/cafe24-product-knowledge` → `main`, squash-merged 2026-08-08)
- main 커밋: `0dd84aa`

---

## 1. 무엇을 했나

Cafe24 Admin API의 상품 리소스를 `products_cache`에 적재하는 **어댑터 한 칸**을 추가했다.
그 뒤의 카탈로그→지식 변환기(미리보기 → 비동기 잡 → 임베딩)와 RAG 인용 경로는 이미 provider 무관이라
**한 줄도 수정하지 않았다**.

막혀 있던 원인은 단순했다: `products_cache`를 채우는 유일한 경로가 Shopify 공개 `/products.json`인데
Cafe24 몰에는 그 라우트가 없다(실측 404 text/html). 그래서 파일럿 테넌트는 카탈로그 0행 → 상품 문서 0건
→ 상품 질문에 "취급하지 않습니다"였다.

## 2. 변경 파일

### 백엔드
| 파일 | 변경 |
|---|---|
| `apps/api/src/domain/cafe24/cafe24-admin.client.ts` | `pullProducts`(offset ↔ `since_product_no` 승계) · `fetchProduct` · `fetchProductOptions`(두 응답 형태 수용) · `listCategoryNames`(403이면 빈 Map) + 상품/옵션/카테고리 타입. 필드는 전부 optional — 외부 스키마를 문서로 확정하지 않음(kit-01 §3.6) |
| `apps/api/src/domain/cafe24/cafe24-product-sync.service.ts` **(신규)** | 카탈로그 pull → `products_cache` 멱등 upsert, 완주 실행에서만 아카이브, 보강 호출 예산(400콜) 상한 + 소진 시 경고 로그 |
| `apps/api/src/domain/cafe24/cafe24.controller.ts` | `POST /tenants/me/cafe24/products/sync` |
| `apps/api/src/domain/cafe24/cafe24.module.ts` | `ProductCache`·`Tenant` 리포지토리 등록(모듈 순환 회피), 서비스 등록 |
| `apps/api/src/domain/product/product-sync.service.ts` | Cafe24 자격증명 보유 테넌트를 Shopify 폴링에서 제외(초기 적재·주기·수동 트리거) |
| `apps/api/src/domain/product/product.module.ts` | `IntegrationCredential` 리포지토리 등록 |

### 프런트엔드
| 파일 | 변경 |
|---|---|
| `apps/web/src/domain/settings/Cafe24ConnectCard.tsx` | **[상품 가져오기]** 버튼 + 성공/실패 토스트 |
| `apps/web/src/domain/settings/settings.service.ts` | `syncCafe24Products()` |
| `apps/web/src/i18n/locales/{en,es,ko}/settings.json` | `syncProducts` / `productsSynced` / `syncProductsFailed`, hint 문구 갱신(주문+상품) |

### 테스트·문서
`cafe24-product-sync.service.spec.ts`(신규 14) · `cafe24-admin.client.spec.ts`(+3) ·
`product-sync.service.spec.ts`(+3, 생성자 변경 반영) · REQ/PLN/TCR-260808.

## 3. 설계상 중요한 결정

| 결정 | 이유 |
|---|---|
| `handle = cafe24-{product_no}` (이름 슬러그 금지) | KB 문서가 handle로 키를 잡는다. 상품명이 바뀌면 문서가 하나 더 생기고 두 문서가 같은 질문을 두고 경쟁한다 |
| `tags`를 **항상** 채움(카테고리·브랜드·옵션값·상품태그, 최후엔 상품명) | 변환기는 "설명 빈약 AND 태그 없음"일 때만 보류한다. 한국 몰은 상세페이지가 이미지뿐인 경우가 흔해, 태그 폴백이 없으면 그 상품들이 **조용히** 지식에서 빠진다 |
| 상세 조회는 목록 행이 실제로 빈약할 때만, 예산 400콜 | Cafe24 40콜 버킷을 상세 크롤로 소진하지 않기 위함. 예산 소진 시 **로그로 남긴다**(조용한 절단 금지) |
| 상품 URL은 `/product/detail.html?product_no=` 정규형 + 테넌트 storefront 오리진 | 예쁜 URL은 슬러그·카테고리가 바뀐다. 오리진이 다르면 `productLinkFor`가 링크를 죽인다 |
| 카테고리명 403은 실패가 아님 | `mall.read_category`는 이 앱이 요청하지 않은 스코프. 사람이 못 읽는 숫자를 저장하느니 빈 값 |
| 가격은 캐시에만, KB 문서에는 미포함 | 기존 규칙 유지 — 벡터에 굳은 가격은 조용히 낡고, 오답은 분쟁이 된다 |
| 자동 스케줄러 미구현 | 사용자 결정 Q3(수동만). 지식 변환 자체가 "미리보기 후 사람이 승인" 방식이라 일관됨 |

## 4. 테스트 결과

| 항목 | 결과 |
|---|---|
| `npx jest` (apps/api 전체) | ✅ **741 passed / 70 suites** (신규 20) |
| `npm run typecheck` (turbo) | ✅ 9/9 |
| `npm run build` (turbo) | ✅ 6/6 |
| API 실기동 | ✅ `Nest application successfully started` |
| 라우트 매핑 | ✅ `Mapped {/api/v1/tenants/me/cafe24/products/sync, POST}` |
| 외부 실측 | ✅ 몰 `/products.json` → 404, `/product/detail.html?product_no=27` → 200 |

상세 케이스는 `TCR-260808-Cafe24-Product-Knowledge.md`.

## 5. 배포 상태

| 환경 | 상태 |
|---|---|
| 마이그레이션 | **불필요** — 스키마 변경 없음(`products_cache` 기존 컬럼만 사용) |
| main 머지 | ✅ PR #168 → `0dd84aa`, 후속 수정 #170 `bce1cd2` · #172 `31d659c`(카테고리 스코프) · #173 `349c193`(OAuth 사유 노출) · #179 `93a62e1`(카테고리 폴백) |
| staging (`shoptalk.amoeba.site`) | ✅ **배포 완료 2026-08-08** (5회: `0dd84aa` → `bce1cd2` → `31d659c` → `349c193` → `93a62e1`). 부팅 로그 `Nest application successfully started`, 신규 라우트 401(=배포됨), health ok |
| 실몰 검증 | ✅ tenant 3(amoebaorder.cafe24.com) E1~E8 수행 — E6만 부분(몰 관리자 조작 미수행). TCR §3 참조 |
| production | 미해당 |

## 5-1. 자체 리뷰에서 잡은 결함 3건 (머지 전 수정)

| # | 결함 | 증상이 됐을 모습 | 수정 |
|---|---|---|---|
| D1 | offset 상한 통과 후 `since_product_no`가 **고정**된 채 offset만 증가 | 8,000번째 상품 이후 같은 페이지를 페이지 상한(100회)까지 재요청 — 신규 상품 0건인데 레이트리밋만 소진 | 승계 모드로 들어가면 매 페이지 마지막 `product_no`로 **갱신** |
| D2 | 보강 조회 조건이 "텍스트가 **없을 때**"뿐 | 12자짜리 `simple_description` 하나 있으면 상세를 안 가져와 빈약한 문서가 그대로 지식이 됨 | 80자 미만이면 보강 |
| D3 | 이미지가 호스트 상대경로(`/web/product/...`)면 `null` | 카탈로그 대부분의 썸네일 유실 | storefront 오리진으로 절대화(프로토콜 상대 `//`도 함께 처리) |

D1은 테스트로 고정했다(승계 호출들의 `since_product_no`가 서로 달라야 통과).

CodeRabbit 리뷰에서 1건 추가 반영: **저장 성공 건수만 집계**(D4). 이전에는 `seen`에 넣는 시점에
집계해서, 저장이 실패해도 "N건 동기화"로 보고될 수 있었다 — 운영자에게 보이는 요약이 DB와 어긋난다.
나머지 지적(10,000건 페이지 상한, `detail` 문자열 영어)은 각각 이미 `(incomplete: page cap)`으로
보고되고 있고, 기존 Cafe24 주문 동기화와 동일한 패턴이라 유지했다.

## 5-2. 스테이징에서만 드러난 결함 2건 (PR #170으로 수정·재배포)

| # | 결함 | 왜 로컬에서 안 잡혔나 | 수정 |
|---|---|---|---|
| D5 | **Cafe24 테넌트 스킵이 한 번도 매칭되지 않음** — 배포 후에도 `Initial product sync tenant 3: aborted: HTTP 404`(E8 실패) | `Tenant.id`는 transformer 없는 bigint PK라 TypeORM이 **문자열**로 주는데, `IntegrationCredential.tenantId`는 transformer가 붙어 **숫자**로 온다 → `Set<number>.has('3')`은 항상 false. 유닛 테스트가 가짜 테넌트에 `id: 7`(숫자)을 줘서 가렸다 | 문자열로 비교. 테스트도 TypeORM이 실제로 주는 문자열 id를 쓰도록 변경(옛 코드로는 실패하는 회귀 테스트) |
| D6 | 모든 상품 태그에 `B0000000`(Cafe24 "브랜드 없음" 기본코드) — 고객 답변 스니펫에 `Tags: B0000000` 노출 | 실몰 데이터에서만 드러남. 로컬 픽스처엔 브랜드 코드가 없었다 | 브랜드 **코드**는 태그에서 제외(카테고리와 같은 규칙 — 사람이 못 읽는 코드는 빈 값만 못하다). 태그가 비는 상품은 기존 상품명 폴백이 받음 |

재배포 후 재검증: E8 0건, 스니펫·문서에서 `B0000000` 0건, 재변환 28/28 임베딩.

**교훈(재발 함정)**: bigint PK가 문자열로 온다는 건 이 저장소에 이미 기록된 함정인데 또 걸렸다. 원인은 코드가 아니라 **테스트 픽스처가 현실과 다른 타입을 쓴 것** — 엔티티 id를 다루는 테스트는 TypeORM이 실제로 주는 타입을 써야 한다.

## 5-3. 카테고리 스코프 후속 (2026-08-08, PR #172·#173·#179)

카테고리명을 채우기 위해 `mall.read_category`를 추가하는 과정에서 결함 2건이 더 드러났다.

| # | 결함 | 증상 | 수정 |
|---|---|---|---|
| D7 | **OAuth 거부 사유를 삼킴** — 재동의가 실패했는데 콘솔은 `cafe24_error=1`, API 로그는 **아무것도 없음**. 실제 사유(`invalid_scope`)는 nginx 액세스 로그에서야 확인 | "state가 유효하지 않다"로 보고돼 고칠 곳을 정반대로 가리켰다(실제 원인은 개발자센터 앱 권한 미등록) | `E5019 CAFE24_OAUTH_REFUSED` + 사유 로깅(설명 디코딩) + 콘솔에 사유 전달·사유별 토스트(ko/en/es). CLAUDE.md §2 "4xx는 서버 로그에 안 남는다"의 실사례 |
| D8 | 스코프를 받아 `products_cache.category`가 채워졌는데도 **지식 문서 category는 전부 공백** | 변환기가 문서를 `vendor` 기준으로 분류하는데 Cafe24 몰에는 vendor 필드가 없다 | `vendor ?? category ?? null` — **선호가 아니라 순서**. vendor가 있는 ivyusa 1,833건은 불변(실측 확인) |

**적용 순서(재현용)**: 개발자센터에서 앱 권한 추가·승인 → 콘솔 [Cafe24 연결] 재동의 → 상품 재동기화 → 지식 재변환.

**결과**: 활성 상품 23건 **전부** 카테고리 확보(립·아이·페이스·향수·소품·기타), 지식 문서 23/28에 반영
(공백 5건은 미진열이라 몰에서 분류 미지정). 위젯 검증: "아이 메이크업 제품 추천해주세요" → 아이 카테고리 2건 인용,
`category=아이` 표기 + 몰 링크. "향수 종류 뭐 있어요?" → 향수 4건 전부 회수.
재변환은 변경분 23건만 재임베딩(5건 unchanged).

## 6. 남은 일

1. **E6 완결** — 몰 관리자에서 상품 1건을 미진열로 바꾼 뒤 재동기화 → `archived` 확인(현재는 실데이터 5건이 archived로 들어온 것으로 매핑만 실증).
3. **콘솔 UI 육안 확인** — 설정 화면 [상품 가져오기] 버튼과 토스트(검증은 API 경로로 수행했음).
4. 파일럿 몰 카탈로그가 대부분 **AI 생성 샘플 상품**이라 실제 상담 품질 판단은 실상품 등록 후에 가능.
5. (범위 밖) 답변 본문에 상품 링크를 넣지 않는 현행 프롬프트 — 인용 칩에는 링크가 있으나 모델이 "링크가 없다"고 말하는 경우가 있음.
