# TCR-260808-Cafe24-Product-Knowledge

Cafe24 상품 → `products_cache` → 지식(KB) → 상담/추천 테스트 케이스.

- 작성일: 2026-08-08
- 대상: `PLN-260808-Cafe24-Product-Knowledge.md`
- 자동화: Jest (`apps/api`) — 신규 12 케이스, 회귀 포함 전체 **737 passed / 70 suites**

---

## 1. 단위 테스트 (자동)

### 1-1. `cafe24-product-sync.service.spec.ts` (신규 9)
| ID | 케이스 | 기대 | 결과 |
|---|---|---|---|
| U1 | Cafe24 상품 → 캐시 행 매핑 | `handle=cafe24-27`, `sku=P000000A`, `price=18000`, `currency=KRW`, `category=클렌징`, `productUrl=…/product/detail.html?product_no=27`, 이미지 절대경로, `status=active` | ✅ |
| U2 | 상세가 이미지뿐 + 카테고리 없음 + 옵션 있음 | `tags='로즈, 코랄'` (옵션값으로 태그 확보 → 변환기 보류 회피) | ✅ |
| U3 | 카테고리·브랜드·옵션·태그 전부 없음 | `tags=상품명` (최후 폴백, 상품 유실 방지) | ✅ |
| U4 | 목록 행에 본문 텍스트 없음 | `/products/{no}` 상세 1회 호출 후 본문 확보. 목록에 본문이 이미 있으면 **호출하지 않음** | ✅ |
| U5 | 완주한 실행에서 몰에 없는 `cafe24-` 행 | `archived` 전환 1건 | ✅ |
| U6 | 페이지 조회 중 예외(502) | `ok:false`, **아카이브 0건**(부분 실행은 절대 아카이브 안 함) | ✅ |
| U7 | 다른 소스의 행(`vita-c-serum`)이 캐시에 존재 | 아카이브 패스에서 **건드리지 않음** | ✅ |
| U8 | `display='F'` (미진열) | `status=archived` | ✅ |
| U9 | 몰 미연결(자격증명 없음) | 예외가 아니라 `ok:false, detail='…not connected…'` | ✅ |
| U10 | 100건 페이지 후 중복 상품 재등장 | `synced=100` (중복 미가산) | ✅ |

### 1-2. `cafe24-admin.client.spec.ts` (신규 3)
| ID | 케이스 | 기대 | 결과 |
|---|---|---|---|
| U11 | 목록 쿼리 조립 | 기본 `offset=`, 8000 초과 시 `since_product_no=`(그리고 `offset` 미포함) | ✅ |
| U12 | 옵션 응답 두 형태(`options` 배열 / `option.options`) | 어느 쪽이든 파싱 | ✅ |
| U13 | `/categories` 403 (`mall.read_category` 미보유) | 빈 Map 반환 — **동기화는 계속 성공** | ✅ |

### 1-3. `product-sync.service.spec.ts` (회귀 + 신규 3)
| ID | 케이스 | 기대 | 결과 |
|---|---|---|---|
| U14 | 주기 실행에서 Cafe24 테넌트 | `/products.json` fetch **호출 0회** | ✅ |
| U15 | 초기 적재에서 Cafe24 테넌트 | fetch 0회 | ✅ |
| U16 | 관리자 수동 트리거 대상이 Cafe24 테넌트 | `ok:false` + "use the Cafe24 product sync" 안내, 크롤 없음 | ✅ |
| — | 기존 Shopify 매핑/아카이브/중단 케이스 | 전부 통과(동작 불변) | ✅ |

---

## 2. 통합 확인 (로컬)

| ID | 항목 | 결과 |
|---|---|---|
| I1 | `npm run typecheck` (turbo 전체) | ✅ 9/9 |
| I2 | `npm run build` (turbo 전체) | ✅ 6/6 |
| I3 | API 실기동 (`SEED_ON_BOOT=false`, 로컬 MySQL/Redis) | ✅ `Nest application successfully started` |
| I4 | 신규 라우트 매핑 | ✅ `Mapped {/api/v1/tenants/me/cafe24/products/sync, POST}` |
| I5 | 외부 실측 — 몰 공개 엔드포인트 | ✅ `/products.json` 404 (Shopify 경로 부재 확정), `/product/detail.html?product_no=27` 200 |

---

## 3. 스테이징 수동 시나리오 (배포 후)

| ID | 시나리오 | 기대 |
|---|---|---|
| E1 | 콘솔 설정 → Cafe24 카드 → **[상품 가져오기]** | "상품 N건 동기화, M건 보관됨" 성공 토스트 |
| E2 | 스코프 확인 (`mall.read_product` 미부여 시) | 실패 토스트 + API 로그에 403 — 재설치·재동의 안내 |
| E3 | 지식 → 카탈로그 변환 **미리보기** | 생성 예정 건수 > 0, 보류 건수·샘플 표시 |
| E4 | 지식 → **변환 실행** | 작성 → 임베딩 진행률 → 완료, 문서 상태 `embedded` |
| E5 | 위젯에서 몰 상품 질문 (한국어) | 해당 상품 문서 인용, **링크 클릭 가능**(`storefront_url` 호스트 일치 시) |
| E6 | 몰에서 상품 1건 미진열 처리 후 재동기화 | 해당 행 `archived`, 추천 대상에서 제외 |
| E7 | 동일 동기화 재실행 | 신규 행 0, 변환은 `unchanged` — 임베딩 재과금 없음 |
| E8 | API 로그 관찰 | `product sync tenant N aborted: HTTP 404` 로그가 더 이상 없음 |

## 4. 엣지/실측 확인 항목 (스테이징에서 기록할 것)

- 목록 응답에 `description`이 실제로 포함되는가 → 포함되지 않으면 상세 보강 호출 수 = 상품 수(예산 400 내 여부 확인).
- `product_tag` 필드 형태(배열/문자열/부재).
- `detail_image` 절대/프로토콜 상대 여부.
- 카테고리 API 403 여부(= `category` 컬럼 null 여부).
- 파일럿 테넌트 `storefront_url` 값과 몰 대표도메인 일치 여부(불일치 시 E5 실패 → 콘솔에서 정정).
