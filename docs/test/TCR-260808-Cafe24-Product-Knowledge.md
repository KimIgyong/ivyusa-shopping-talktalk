# TCR-260808-Cafe24-Product-Knowledge

Cafe24 상품 → `products_cache` → 지식(KB) → 상담/추천 테스트 케이스.

- 작성일: 2026-08-08
- 대상: `PLN-260808-Cafe24-Product-Knowledge.md`
- 자동화: Jest (`apps/api`) — 신규 20 케이스, 회귀 포함 전체 **741 passed / 70 suites**

---

## 1. 단위 테스트 (자동)

### 1-1. `cafe24-product-sync.service.spec.ts` (신규 14)
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
| U10a | 짧은 한 줄만 있는 상품(12자) | 상세 보강 호출 발생 — "없을 때만"이 아니라 "80자 미만이면" | ✅ |
| U10b | 이미지가 호스트 상대경로 `/web/product/...` | storefront 오리진으로 절대화 | ✅ |
| U10c | offset 상한 통과 후 `since_product_no` 승계 | 매 페이지 값이 **갱신**됨(고정 시 같은 페이지 100회 재요청) | ✅ |
| U10d | 캐시 행 저장 실패(deadlock) | `synced=0` — 저장 성공분만 집계 | ✅ |

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

## 3. 스테이징 시나리오 — **실행 완료 2026-08-08** (tenant 3 = amoebaorder.cafe24.com)

| ID | 시나리오 | 기대 | 실측 결과 |
|---|---|---|---|
| E1 | 콘솔 설정 → Cafe24 카드 → **[상품 가져오기]** | "상품 N건 동기화, M건 보관됨" 성공 토스트 | ✅ `{ok:true, synced:28, archived:0}` |
| E2 | 스코프 확인 (`mall.read_product` 미부여 시) | 실패 토스트 + API 로그에 403 | ✅ `mall.read_product` 부여됨(정상 조회). `/categories`만 403 `insufficient_scope` → 카테고리 빈 값으로 degrade, 동기화는 성공 |
| E3 | 지식 → 카탈로그 변환 **미리보기** | 생성 예정 건수 > 0, 보류 샘플 표시 | ✅ scanned 28 → created **28, held 0** (설명 80자 이상인 상품이 **0건**인데도 보류 0 — 태그 폴백이 실제로 일한 지점) |
| E4 | 지식 → **변환 실행** | 작성 → 임베딩 → 문서 `embedded` | ✅ written 28/28, embedded 28/28, embedFailed 0 (Voyage 실임베딩 — 폴백 경고 없음) |
| E5 | 위젯에서 몰 상품 질문 (한국어) | 상품 문서 인용 + **링크 클릭 가능** | ✅ "매트한 립스틱 추천해주세요" → 한국어 답변 + 인용 `디어플럼 소프트 매트 립스틱`, url `https://amoebaorder.cafe24.com/product/detail.html?product_no=11` (링크 게이트 통과) |
| E6 | 몰에서 상품 1건 미진열 처리 후 재동기화 | 해당 행 `archived` | ⚠️ **부분** — 몰 관리자 조작은 미수행. 다만 실데이터에서 28건 중 **5건이 display/selling 플래그로 archived** 처리됨(매핑 자체는 실증) |
| E7 | 동일 동기화 재실행 | 신규 행 0, 변환 `unchanged` | ✅ 재동기화 28 synced / 신규 0, 미리보기 `created:0, unchanged:28` — 재임베딩 없음 |
| E8 | API 로그 관찰 | tenant 3에 404 폴링 없음 | ❌→✅ **최초 배포에서 실패**(`Initial product sync tenant 3: aborted: HTTP 404`) → D5 수정(PR #170) 후 재배포에서 **0건** |

## 4. 실측 기록 (2026-08-08, amoebaorder 몰 28개 상품)

| 항목 | 실측 |
|---|---|
| 몰 상품 수 | 28 (active 23 / archived 5) |
| 설명 길이 | **80자 이상 0건**, 0~71자. 상세 보강 호출은 예산(400) 내에서 소화 |
| 태그 | 전 상품 채워짐 → 보류 0건. 초기엔 `B0000000`(브랜드 없음 기본코드)이 28건 전부에 붙어 고객 스니펫까지 노출 → **D6로 제거** |
| 카테고리 | 초회 전 상품 `null`(`/categories` 403 `insufficient_scope`) → **스코프 추가·재동의 후 활성 23건 전부 확보**(립·아이·페이스·향수·소품·기타). 미진열 5건은 몰에서 분류 미지정 |
| 이미지 | 28건 중 25건 확보 |
| 가격 | 28건 전부 확보(KRW) |
| `storefront_url` | `https://amoebaorder.cafe24.com` — 몰 도메인과 일치 → 인용 링크 정상 |
| 임베딩 | Voyage 실호출(28/28), 폴백 경고 없음 |

## 4-1. 카테고리 스코프 적용 후 재검증 (2026-08-08)

| ID | 케이스 | 결과 |
|---|---|---|
| C1 | 앱 권한 미등록 상태로 재동의 | ❌ Cafe24 `error=invalid_scope` — 콘솔엔 `cafe24_error=1`, API 로그 무음 → **D7로 수정**(사유 로깅·사유별 토스트) |
| C2 | 개발자센터 권한 승인 후 재동의 | ✅ `Cafe24 OAuth connected mall=amoebaorder tenant=3` |
| C3 | 상품 재동기화 | ✅ 28건, `/categories` 403 소멸, 활성 23건 전부 카테고리 확보 |
| C4 | 지식 문서 카테고리 | ❌→✅ 초회 0/28(변환기가 vendor 기준) → **D8 수정 후 23/28** |
| C5 | ivyusa 회귀 | ✅ 1,828/1,833 유지(vendor 우선이라 불변) |
| C6 | 위젯 "아이 메이크업 제품 추천해주세요" | ✅ 아이 카테고리 2건 인용, `category=아이` + 몰 링크 |
| C7 | 위젯 "향수 종류 뭐 있어요?" | ✅ 향수 4건 전부 회수 |
| C8 | 재변환 비용 | ✅ 변경분 23건만 재임베딩, 5건 unchanged |

## 5. 관찰 (이번 변경 범위 밖)

- E5 재검증 시 LLM이 "구매 링크가 포함되어 있지 않습니다"라고 답한 사례 — 인용 객체에는 url이 정상적으로 실려 있고 위젯이 인용 칩으로 렌더한다. 답변 본문에 링크를 넣지 않는 현행 프롬프트 특성이라 고객에겐 혼동될 수 있음(AI 설정 쪽 후속 과제).
- tenant 2(annehearts)는 Cafe24 자격증명이 없어 여전히 Shopify 경로로 시도하고 실패한다(기존 상태, 이번 범위 밖).
