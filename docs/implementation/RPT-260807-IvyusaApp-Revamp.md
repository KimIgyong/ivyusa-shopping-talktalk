# RPT-260807-IvyusaApp-Revamp — 고객앱 개편 F1-F4 구현 보고

- 작성일: 2026-08-07
- 근거: REQ-260807-IvyusaApp-FeatureGap → PLN-260807-IvyusaApp-Revamp
  (사용자 지시: "승인 없이 진행, 멀티 포함, F1→F4 단계별 PR·테스트·스테이징 배포·보고서")
- 테스트 상세: `docs/test/TCR-260807-IvyusaApp-Revamp.md`

## 1. 결과 요약

REQ의 비전 갭 V1~V10을 4단계로 전부 구현·배포했다. 앱(RN)과 PWA는 이제
**커뮤니케이션 허브**다: 상품 발견(카탈로그 2,275개·검색·카테고리·AI 추천) +
인게이지먼트(찜/담아두기/조르기/SNS 홍보/다이어리/리뷰) + 소식→바로가기
(캠페인 상품 딥링크) + 기존 통지 인프라(주문/배송/상담/이벤트 푸시). 구매는 전부
스토어프론트로 딥링크된다.

방식: 단계별 멀티에이전트 병렬(총 **11 서브에이전트**, api/mobile/pwa 트랙 분리) →
오케스트레이터 통합·검증·배포. 4개 PR 전부 CI 필수 체크 통과 후 머지.

## 2. 단계별 구현

### F1 — 상품 카탈로그 (PR #135, main fabe7d2)
- `products_cache` + **스토어프론트 공개 `/products.json` 동기화** (부팅 초기 적재·
  6시간 스케줄·관리자 트리거·40페이지 캡·미완주 시 archive 스킵). **Shopify 재인가
  불필요** — read_products/웹훅은 P2 향상 항목으로 유지.
- 고객 API: `GET /products`(검색·카테고리·페이지네이션), `/products/categories`,
  `/products/:handle` (세션 테넌트 스코프). KB 상품 CSV에 `Price(USD)`/`Image URL` 열
  브리지(스토어 JSON 차단 시 대체 경로).
- 앱 IA 개편(A-12): 탭 = 홈/상품/상담/마이/알림. 스토어 WebView는 `/shop` 스택
  (아이덴티티 브리지 유지, `?url` 딥오픈 — 모든 '구매하기'의 목적지). PWA 상품 탭.

### F2 — 인게이지먼트 + 리뷰 보강 (PR #136, main 3baf0c4)
- 찜/담아두기 `product_saves`(단일 엔티티, 카탈로그 조인 목록, CJM 발행).
- 조르기 `nudges`: 코드 발급 → **PWA 공개 카드 `/app/nudge/:code`** (앱 미설치
  수신자도 열람, 조회수), OS 공유 시트 발송.
- SNS 홍보: UTM + 어필리에이트 승인 고객 `ref=link_code` 자동 부착 (기존 모듈 활용).
- **리뷰 결함 해소(REQ D1-D3)**: 소유권 검증(403) · 모더레이션 게이트(422) ·
  관리자 숨김 PATCH + **콘솔 /reviews 페이지 신규**. 앱/PWA 주문 아이템별 리뷰 폼.
- privacy: saves/nudges DSAR export·삭제·shop_redact 포함.

### F3 — 다이어리 + 홈 피드 (PR #137, main cc22144)
- CJM 확장: `product_view`/`order_created`(신규 행 가드)/`shipment_update` + payload —
  기존 wish/save/nudge/review와 합쳐 고객 저니 완성.
- `GET /me/journey`(본인 타임라인) + `diary_notes` 메모(상품 핀, 소유권 WHERE).
- **AI 추천 v1** `GET /products/recommendations`: 찜 상품의 카테고리(2점)/태그(1점)
  시그널, 찜 제외, 콜드스타트=신상품. (주문 아이템 시그널은 handle 부재로 의도적 보류)
- 앱 홈 피드 완성: 배송중 카드·AI 추천 레일·신상품 레일·이벤트 배너.
  마이 탭 다이어리(작성+저니·메모 통합 타임라인). PWA /diary + 추천 레일.

### F4 — 캠페인 상품 딥링크 (PR #138, main 5125871)
- `campaigns.content.link{product|url}` → **발송 시 검증**(카탈로그 핸들·https, 400) →
  디스패치 1회 해석 → `notifications.link_url` + 푸시 `data.url/productHandle` →
  RN(네이티브 상품 상세/샵 WebView/외부) · PWA SW(셸 캐시 v2) 라우팅.
- 콘솔 캠페인 폼 링크 컨트롤 + **기존 결함 부수 수정**: content.message가 whitelist
  파이프에 잘려 본문이 저장되지 않던 문제.

## 3. 데이터/스키마 변경 (전부 additive)
`products_cache` · `product_saves` · `nudges` · `diary_notes` 신설,
`notifications.link_url` 추가 — migration 4파일
(`migration_products_cache/engagement/diary/notification_link.sql`) + 01-schema 반영.
신규 env: `PRODUCT_SYNC_INTERVAL_MIN`(staging 360), `APP_PUBLIC_URL`.

## 4. 테스트 (상세: TCR)
- Jest **599 → 655** (64 suites) ALL PASS, 전 워크스페이스 typecheck 0, 실부트 검증.
- 로컬 실E2E 9종: ivyusa.com 실동기화 2,275상품 → 검색/찜 조인/조르기 공개 카드/
  다이어리/실이벤트 저니/시그널 추천/**캠페인 풀루프(관리자 로그인→잘못된 핸들 400→
  발송→link_url 검증)**.
- 통합에서 잡은 계약 불일치 1건(diary remove id 타입) — 병렬 에이전트 산출물 검수의 몫.

## 5. 배포 상태

| 단계 | PR / main | staging migration | staging 배포·검증 |
|---|---|---|---|
| F1 | #135 fabe7d2 | ✅ 선적용 | ✅ 부팅 자동 적재(921+행), /products·/app/products 확인 |
| F2 | #136 3baf0c4 | ✅ | ✅ 401/404/200 라우트 + nudge 카드 |
| F3 | #137 cc22144 | ✅ | ✅ journey 401·추천 응답·/app/diary 200 |
| F4 | #138 5125871 | ✅ | ✅ link_url 컬럼·campaigns 401·SW v2 서빙 |
| production | — 호스트 미정 | | |

## 6. 잔여/후속 (P2 백로그 + 수동 확인)
1. **수동 스모크**: 실기기/실브라우저에서 신규 화면 UX 확인; 스테이징 콘솔에서 상품
   링크 캠페인 1건 실발송 → 푸시 탭 → 상품 상세 (TCR §5 절차)
2. read_products 스코프 + products/* 웹훅 (카탈로그 실시간화 — 현재 6시간 동기화)
3. P2(PLN F5): 리뷰 사진, AI_FUNCTION.RECOMMEND 개인화, nudge 응답 추적,
   어필리에이트 서버 어트리뷰션, 캠페인 세그먼트 타겟팅
4. 스토어 트랙(별도): RN 앱 EAS 빌드·심사 — REQ-MobileApp 잔여 준비물과 함께

## 7. 예방 패턴 (메모 승격)
- **병렬 에이전트 간 API 계약은 오케스트레이터가 diff로 검수하라** — DTO 필드명/타입
  불일치(I1)는 양쪽 다 "성공" 보고 뒤에 숨는다. 특히 `@IsInt`는 글로벌 파이프에
  implicit conversion이 없으면 문자열을 거부한다.
- 콘솔→API 최상위 필드는 `whitelist: true`에 조용히 잘린다(I2) — DTO에 없는 데이터는
  검증된 컨테이너 필드(content JSON) 안에 넣어라.
