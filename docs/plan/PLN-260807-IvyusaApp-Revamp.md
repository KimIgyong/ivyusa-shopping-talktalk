# PLN-260807-IvyusaApp-Revamp — ivyusa 고객앱 개선안 (상품 발견 + 인게이지먼트)

- 작성일: 2026-08-07
- 선행 문서: `docs/analysis/REQ-260807-IvyusaApp-FeatureGap.md`
- 상태: **사용자 승인 대기** (승인 전 구현 착수 금지)

## 1. 제품 방향 요약

앱의 정체성 = **"ivyusa와 나 사이의 커뮤니케이션 허브"**.
구매는 스토어(웹)로 보내고, 앱은 ①내 것(주문·배송·리뷰·찜·다이어리) ②소식(신제품·이벤트
푸시→바로가기) ③발견(상품 목록·AI 추천) ④퍼뜨리기(조르기·SNS 홍보)를 담당한다.

## 2. 아키텍처 결정 (권고안)

| ID | 결정 | 권고 | 근거 / 기각 대안 |
|---|---|---|---|
| A-1 | 상품 데이터 소스 | **백엔드 `products_cache` 신설** — Shopify Admin API 동기화(`read_products` 스코프 추가) + `products/create·update` 웹훅. 컬럼: handle(uk), title, image_url, price, currency, product_url, status, tags, category, synced_at | orders_cache와 동일한 검증된 패턴. 대안 기각: ①Storefront API 직접호출 — 토큰 체계 신규+클라이언트 2벌 중복 구현+서버 파생기능(찜 조인·추천·캠페인 링크) 불가 ②KB CSV 재사용 — 이미지/가격 없음(C2), 표시용 부적합 |
| A-2 | KB 연결 | products_cache.handle ↔ kb_documents.external_key 로 연결 — RAG 추천 결과를 카탈로그 카드로 승격 | 기존 자산(#101~#114) 재사용 |
| A-3 | 고객용 상품 API | `GET /products`(검색·카테고리·페이지), `GET /products/:handle` — @Public+세션, 텐넌트 스코프 | |
| A-4 | 찜/담아두기 | 단일 엔티티 **`product_saves`** (tenant, customer, product_handle, list('wish'\|'later'), note, created) — uk(customer,handle,list). 찜=위시리스트, 담아두기=나중에 볼 보관함(같은 메커니즘, 리스트 구분) | 별도 테이블 2개는 과설계. restock(D4)은 상품 상세의 "재입고 알림" 버튼으로 이 단계에서 실연결 |
| A-5 | 조르기 | **`nudges`** (code uk, customer, product_handle, message, created) + 공개 카드 `GET /app/nudge/:code`(PWA 라우트 — 상품 이미지+메시지+구매 링크) → OS 공유시트로 링크 발송. 수신자는 앱 없이도 카드 열람 | 앱 미설치 수신자 커버가 핵심이라 PWA 라우트가 적격. v1은 열람 수까지만(응답/성사 추적은 P2) |
| A-6 | SNS 홍보하기 | 상품 상세 공유 시트: 일반 고객 = product_url + UTM(`utm_source=shoptalk_app`). **어필리에이트 승인 고객 = `?ref={link_code}` 자동 부착** (기존 affiliate 자산 활용). 어트리뷰션은 GA4 UTM으로 1단계 측정 | 서버 클릭 트래킹은 P2 |
| A-7 | 쇼핑 다이어리 | ①CJM 이벤트 확장: `product_view`(Browse), `wish_added/save_added/nudge_sent/shared`(Browse), `order_created`(Purchase — 주문 웹훅), `delivered`(Delivery — 배송 웹훅), payload에 handle/orderNumber 기록 ②고객 본인용 `GET /me/journey` (세션 토큰, 월별 페이지) ③다이어리 화면 = 타임라인 + 내 리뷰/찜 + **자유 메모**(`diary_notes` 엔티티: customer, body, product_handle?, created) | 기존 cjm_events 재사용(테이블 신설 최소화). 개인정보: 본인 데이터만, DSAR export에 diary_notes 포함 |
| A-8 | 리뷰 | 앱 주문 상세에 아이템별 리뷰 작성 UI + **서버 보완: 소유권 검증(D1, 보안) + 모더레이션 게이트(D2) + 콘솔 목록/숨김 UI(D3)**. 사진 첨부는 P2(업로드 인프라 필요) | D1은 앱 노출 확대 전 필수 |
| A-9 | 캠페인 상품 딥링크 | `campaigns.content.link`{type:'product'\|'url', handle?/url?} 필드 + `notifications.link_url` 컬럼 + push data.url/handle → 앱: 상품 상세 라우트, SW: `/app/products/:handle`. 콘솔 캠페인 폼에 상품 선택(카탈로그 검색) 추가 | V9 전 구간 관통 |
| A-10 | AI 추천 v1 | `GET /products/recommendations` — 세션 고객의 최근 주문/찜 카테고리·태그 기반 규칙 + KB product RAG 검색을 카탈로그 조인해 카드 반환. 홈 피드 "AI 추천" 섹션. `AI_FUNCTION.RECOMMEND`(LLM 개인화)는 P2 | 콜드스타트는 신상품/베스트로 폴백 |
| A-11 | 클라이언트 우선순위 | **RN 앱 먼저 → PWA 후속 반영**(스토어 공개 전 PWA가 접점이므로 F1·F4의 핵심 화면은 PWA도 동차수 반영, 나머지는 후속) | C3 이중 구현 비용 관리 |
| A-12 | 앱 IA 개편 | 5탭 재구성: **홈(피드) · 상품 · 상담 · 마이(주문+다이어리+찜+리뷰) · 알림**. 설정은 마이 상단 기어. 쇼핑 WebView는 탭에서 빠지고 모든 구매 진입점(상품 상세 '구매하기', 홈 배너)이 WebView/새탭을 연다 | 커뮤니케이션 허브 정체성 반영 |

## 3. 단계별 계획

### F1 — 상품 카탈로그 기반 (선행 조건)
- Shopify: `SHOPIFY_SCOPES`에 `read_products` 추가 → 스토어 재인가, `products/create·update` 웹훅 등록
- api: `domain/product` 모듈 — `products_cache` 엔티티+migration, 동기화(초기 전량+웹훅+스케줄), `GET /products`, `GET /products/:handle` (+`POST /restock/subscribe` 연결)
- 앱(RN+PWA): 상품 탭(그리드 목록/검색/카테고리), 상품 상세(이미지·가격·설명·[구매하기→스토어]·[재입고 알림]), IA 개편(A-12) 골격

### F2 — 인게이지먼트 (찜·담기·조르기·공유·리뷰)
- api: `product_saves` + `nudges` (+migration), `GET/POST/DELETE /saves`, `POST /nudges`+공개 카드 조회, 리뷰 D1/D2 서버 보완 + D3 콘솔 페이지
- 앱: 상품 카드/상세에 ♡찜·담아두기 버튼, 공유 시트(SNS 홍보 A-6 / 조르기 A-5), 마이 탭에 찜/보관함 목록, 주문 상세 리뷰 작성 폼
- PWA: `/app/nudge/:code` 공개 카드 라우트

### F3 — 다이어리 + 홈 피드
- api: CJM 확장 이벤트+payload, `GET /me/journey`, `diary_notes` CRUD, DSAR export 포함
- 앱: 홈 피드(신상품 섹션 = synced_at 최신순 · AI 추천 섹션(A-10) · 진행 중 배송 카드 · 이벤트 배너), 마이 탭 다이어리(타임라인+메모)

### F4 — 소식→바로가기 완결 (캠페인 상품 딥링크)
- api: A-9 전 구간 (content.link → notifications.link_url → push data)
- 콘솔: 캠페인 폼 상품 선택/URL 필드
- 앱/SW: 푸시 탭 → 상품 상세/URL 라우팅
- E2E: 신제품 캠페인 발송 → 푸시 수신 → 상품 상세 → 구매하기 → 스토어

### F5 — P2 (후속 백로그)
리뷰 사진, AI_FUNCTION.RECOMMEND 개인화, nudge 응답 추적, 어필리에이트 서버 어트리뷰션·정산, 캠페인 세그먼트 타겟팅(segment_ref 실사용), Browse 이벤트 기반 추천 고도화

각 단계는 REQ→(본 PLN)→구현→TCR→RPT 산출, 스키마 변경 시 migration 선적용 규칙 준수.

## 4. 와이어프레임 (UI 신규 — 필수)

### 4.1 IA 개편 + 홈 피드
```
┌────────────────────────────────┐
│ ShopTalk            ⚙  [샵 ↗] │
│ ┌────────────────────────────┐ │
│ │ 🚚 주문 #1024 배송중 ▸     │ │ ← 진행중 배송 카드(있을 때)
│ └────────────────────────────┘ │
│ ✨ AI 추천                     │
│ ┌────┐ ┌────┐ ┌────┐  →      │ ← 가로 스크롤 상품 카드
│ │img │ │img │ │img │          │   (이미지·이름·가격·♡)
│ └────┘ └────┘ └────┘          │
│ 🆕 신상품          [전체보기] │
│ ┌────┐ ┌────┐ ┌────┐  →      │
│ 🎉 이벤트/프로모션 배너        │ ← 캠페인 연동(F4)
│────────────────────────────────│
│ 🏠 홈 │🛍 상품 │💬 상담 │👤 마이 │🔔 알림 │
└────────────────────────────────┘
```

### 4.2 상품 목록 / 상세
```
┌───────────────────────┐  ┌───────────────────────────┐
│ 🔎 검색  [카테고리 ▾] │  │ ←  상품 상세               │
│ ┌─────┐ ┌─────┐       │  │ ┌───────────────────────┐ │
│ │ img │ │ img │       │  │ │       이미지           │ │
│ │ 이름 │ │ 이름 │      │  │ └───────────────────────┘ │
│ │ $12 ♡│ │ $25 ♡│     │  │ 이름            $25.00    │
│ └─────┘ └─────┘       │  │ 설명(KB Detail/HowToUse)   │
│ ┌─────┐ ┌─────┐       │  │ [♡ 찜] [📥 담아두기]      │
│  …그리드 계속…         │  │ [🛒 스토어에서 구매하기 ↗] │
│                       │  │ [🔔 재입고 알림] [↗ 공유]  │
└───────────────────────┘  │  공유 ▾: SNS홍보 · 조르기  │
                           └───────────────────────────┘
```

### 4.3 마이 탭 (주문+다이어리+찜) / 조르기 카드(수신자 뷰)
```
┌───────────────────────────┐  ┌───────────────────────────┐
│ 👤 마이            ⚙     │  │  💝 OO님이 갖고 싶어해요!  │
│ [주문] [다이어리] [찜/보관]│  │ ┌─────────┐               │
│ ── 다이어리 ─────────────  │  │ │  상품img │  비타C세럼    │
│ 8/07 ⭐ 리뷰 남김: 세럼    │  │ └─────────┘  $25.00       │
│ 8/05 📦 배송 완료 #1024   │  │ "생일선물로 이거 어때? 🥺" │
│ 8/03 💝 조르기 보냄: 크림  │  │ [스토어에서 선물하기 ↗]   │
│ 8/01 ♡ 찜: 토너          │  │      (앱 없이 열람 가능)    │
│ [+ 메모 남기기]           │  └───────────────────────────┘
└───────────────────────────┘
```
(리뷰 작성 폼은 기존 위젯 ReviewForm과 동일 구성 — 별점 5개+텍스트, 주문 상세 내 아이템별 버튼)

## 5. 측면 영향 분석

| 대상 | 내용 | 위험 |
|---|---|---|
| Shopify 재인가 | read_products 스코프 추가 → 스토어 관리자 승인 1회 필요 (PCD 무관 일반 스코프) | 낮음 — 사용자 액션 1회 |
| DB | 신규 3~4테이블(products_cache, product_saves, nudges, diary_notes) + notifications.link_url — 전부 additive migration | 중간(선적용 규칙) |
| 위젯 | 무영향 (신규 API는 앱 전용, 기존 채팅 인용 링크 그대로) | 없음 |
| 캠페인 콘솔 | content 스키마 확장 — 기존 텍스트 캠페인 하위호환(link 없으면 종전 동작) | 낮음 |
| privacy | product_saves/nudges/diary_notes → DSAR export·삭제·shop_redact 경로 추가 필수 | 중간(컴플라이언스) |
| CJM | 이벤트 급증(product_view) → retention purge 이미 존재, 인덱스 확인 | 낮음 |
| 리뷰 D1 수정 | 소유권 검증 추가 — 기존 위젯 정상 사용자는 무영향 | 낮음 |

## 6. 규모·순서 (승인 후)
F1 → F2 → F3 → F4 순차(각 단계 PR+migration+TCR/RPT). 대략: F1 = api 1모듈+앱 2벌 화면
(중), F2 = api 2엔티티+리뷰 보완+앱(중), F3 = CJM+피드(중), F4 = 관통 배선(소).
사전 준비물: **Shopify 스토어 재인가 1회**(F1 시작 시 안내) 외 없음.
