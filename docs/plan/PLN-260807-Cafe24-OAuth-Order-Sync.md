# PLN-260807 — Cafe24 연동 P-A1: OAuth + 주문 동기화 (Mode A 파일럿)

> 짝문서: 요구 `docs/analysis/REQ-260807-LiveChat-Issue-Workflow.md`(§11 3-모드, §12 Cafe24 분석).
> 대상 파일럿: **`amoebaorder.cafe24.com`**(Cafe24 몰). 앱 `btbz#Talk`(client `W0cuersbLK0Gz1vyut8QjF`) 등록·스코프 부여 완료.
> ⚠️ **승인 후 구현.** 본 PLN 검토·승인 전 코드 착수 금지(kit §6).
> 철학([[amoeba-bitbiz-philosophy]]): **적정기술**(파일럿 최소·재사용) · **공유**(ShopTalk Shopify 스켈레톤 + btbz-shop-pmm Cafe24 지식) · **개발**(플랫폼 어댑터 성장) · **연결**(Cafe24 커머스↔챗/이슈 스택).

---

## 1. 목표 & 범위 (P-A1)

**목표**: Cafe24 몰(`amoebaorder.cafe24.com`)의 주문을 ShopTalk `orders_cache`에 동기화하여, **챗 AI의 주문상태·구매내역 그라운딩이 Cafe24 테넌트에서 동작**하게 한다. 나머지 챗/이슈 스택은 provider-무관이라 그대로 재사용.

**In (P-A1) — 결정 반영:**
- Cafe24 OAuth (install → callback → 토큰 암호저장 + refresh 로테이션).
- Cafe24 API 클라이언트(레이트리밋/재시도) 이식.
- **주문 동기화 → `orders_cache`**(+ 고객 email 링크, **동의 기반 PII 저장**) : 예약 + 온디맨드.
- **주문 상태 매핑**(N**/C00 → internal/UI, **입금전·취소신청 상태 신규 추가**).
- **상품추천 그라운딩**(Product read) — Cafe24 카탈로그를 추천 경로에 연결. ✅ P-A1 포함.
- 콘솔에 **Cafe24 연결 카드**(mall_id 입력 → Connect).

**Out (후속):**
- P-A2: Cafe24 회원/Customer-identifier 기반 **고객 식별**(위젯 바인딩) + **배송/추적** 보강.
- 취소/환불 **실행**(원칙 미실행·핸드오프, §12.7) · 상품 push · 클레임 write.

**설계 ID**: FR-A1(주문 그라운딩@Cafe24) → FN-A1a(OAuth)/A1b(sync)/A1c(status map) → SCR-A1(연결카드) → TBL(orders_cache 확장, integration_credentials 재사용) → SEQ-A1(install→callback→sync).

---

## 2. 재사용 전략 (공유) — "스켈레톤은 ShopTalk, 지식은 PMM"

| 계층 | 재사용 소스 | 방식 |
|---|---|---|
| OAuth install/callback 컨트롤러 | ShopTalk `shopify-oauth.controller.ts`(`@Controller('auth/shopify')` install/callback, @Res 리다이렉트) | **미러** → `auth/cafe24` |
| CSRF state | ShopTalk Shopify가 쓰는 **Redis** state(`shopify:oauth:{state}`) | **동일 패턴** `cafe24:oauth:{state}` (신규 DB 테이블 불필요 — btbz-shop-pmm의 `channel_oauth_state`는 미이식, 적정기술) |
| 자격증명 저장 | ShopTalk `integration_credentials.secret_enc`(JSON, AES-GCM) — Shopify가 `{accessToken,refreshToken,expiresAt}` JSON 저장 | **동일** → `{mallId, refreshToken, scopes, refreshIssuedAt}` |
| 토큰 리프레시 | ShopTalk `getShopifyConnection`의 single-flight refresh | **미러** → `getCafe24Connection` |
| API 클라이언트(레이트/429/401/재시도·페이징·embed) | **btbz-shop-pmm `cafe24.real.adapter.ts` `request()`** | **로직 이식**(fetch, X-Api-Call-Limit 35/40 선제 sleep, 429 `X-Cafe24-Call-Remain`·401 1회 재시도) |
| 호스트 분리 | btbz-shop-pmm `cafe24-host.util.ts` | **이식**(authorize `{mall}.cafe24.com` / API `{mall}.cafe24api.com/api/v2/admin`) |
| 토큰교환 body/헤더 | btbz-shop-pmm `cafe24-oauth/token.service` | **이식**(Basic auth, form-urlencoded, refresh 로테이션 재저장) |
| 주문 pull + 매핑 | btbz-shop-pmm `pullOrders`(`GET /orders?embed=items`) + 필드/상태 | **이식·적응**(단, ShopTalk은 PII 저장 허용 — member_email 링크에 사용) |
| 예약 동기화 | ShopTalk `ScheduledShopifySyncService`(setInterval) | **미러** → `ScheduledCafe24SyncService`(`CAFE24_SYNC_INTERVAL_MIN`) |

> **배관 변환**: btbz-shop-pmm은 Postgres raw `pg`; ShopTalk은 MySQL/TypeORM + `crypto.util`(AES-GCM 3필드=CryptoService 동형). 로직만 취하고 영속화/암호화는 ShopTalk 스택으로.

---

## 3. 백엔드 설계

### 3.1 신규 도메인/파일 (`apps/api/src/domain/cafe24-oauth/`, `order/`)
- `cafe24-oauth/cafe24-oauth.controller.ts` — `@Controller('auth/cafe24')`, `@Public()`:
  - `GET install?mall_id=` → authorize 리다이렉트(state를 Redis에 저장).
  - `GET callback?code&state` → state 검증(Redis 소비) → 토큰교환 → 자격증명 저장 → 콘솔 복귀.
- `cafe24-oauth/cafe24-oauth.service.ts` — buildInstallUrl/handleCallback/exchangeCode (shopify-oauth.service 미러 + Cafe24 host/body).
- `cafe24-oauth/cafe24-token.service.ts` — access 인메모리 캐시 + refresh(single-flight, 로테이션 재저장).
- `order/cafe24-admin.client.ts` — `request()` + `pullOrders()`(레이트/재시도 이식).
- `order/cafe24-sync.service.ts` — `syncOrders(tenantId)`: date-window pull → 매핑 → `orders_cache` 멱등 upsert(+customer email 링크). `OrderService.upsertOrder` 재사용 가능 여부 검토(Shopify 전용 DTO면 Cafe24용 매퍼 추가).
- `order/scheduled-cafe24-sync.service.ts` — 예약(`CAFE24_SYNC_INTERVAL_MIN`).
- `tenant`에 `getCafe24Connection(tenantId)` 추가(mallId+token 해석, refresh) — `getShopifyConnection` 미러.
- **모듈 등록**: `Cafe24OAuthModule`을 `app.module.ts`에 등록(kit 필수).

### 3.2 스키마 변경 (마이그레이션)
**`orders_cache` 다중-프로바이더 일반화 — ✅ Option A 확정**:
- `provider varchar(16) NOT NULL DEFAULT 'shopify'` 추가, 유니크를 `uk_orders_shopify(shopifyOrderId)` → **`uk_orders_channel(tenant_id, provider, shopify_order_id)`**로 교체. 기존 행 backfill `provider='shopify'`. Cafe24 행: `provider='cafe24'`, `shopify_order_id`=Cafe24 `order_id`(컬럼명 유지·의미="채널 주문ID"; 향후 `external_order_id` 리네임은 선택).
- **Shopify upsert 경로**: dedup을 `{shopifyOrderId}` → `{tenantId, provider:'shopify', shopifyOrderId}`로 소폭 수정(저위험, 회귀 테스트로 보증).
- `customers`도 동형으로 향후 확장 여지 두되 **P-A1은 email 경로만**(스키마 무변경).

**`customers`**: P-A1은 **email 경로 재사용**(`findOrCreateByEmail`, Cafe24 주문의 member/buyer email, PII 암호화 `piiTransformer`+`email_hash`). `shopify_customer_id`는 null(멀티 null 허용). **스키마 변경 없음.** (Cafe24 회원 식별은 P-A2.)

**Redis state**: 테이블 없음(Shopify와 동일).

**마이그레이션 SQL**: `sql/260807-cafe24-orders-provider.sql`(idempotent: add column + backfill + drop/recreate unique). PR 본문 `## Migration` 섹션 + **배포 전 수동 적용**(skill `pre-deploy-check`, staging DB_SYNCHRONIZE 이슈 회피).

### 3.3 상태 매핑 — ✅ 입금전·취소신청 신규 상태 추가
**`packages/types` 열거 확장**(현 internal `paid/preparing/shipping/delivered`, UI `Confirmed/In Transit/Delivered/Review`) — Shopify 경로는 이 값을 안 쓰므로 무회귀(신규 값 추가일 뿐):
- `ORDER_STATUS_INTERNAL`에 **`pending_payment`(입금전)**, **`cancel_requested`(취소신청)** 추가.
- `ORDER_STATUS_UI`에 대응 라벨(i18n): "입금전 / Pending payment", "취소신청 / Cancel requested".

| Cafe24 | → internal | → UI |
|---|---|---|
| **N00 입금전** | **pending_payment** | 입금전 |
| N10 상품준비중 / N20 배송준비 / N21 배송대기 / N22 배송보류 | preparing | Confirmed |
| N30 배송중 | shipping | In Transit |
| N40 배송완료 | delivered | Delivered |
| **C00 취소신청** | **cancel_requested** | 취소신청 |
| item-level 혼재 | MIXED 파생 | (혼재) |
- **위젯 배송 스텝퍼 영향**: `pending_payment`는 스텝퍼 시작 전(결제대기) 표기, `cancel_requested`는 스텝퍼 밖 분기(배지)로 처리 — `WidgetPanel`/tracking 스텝 로직에 두 상태 반영. i18n en/es/ko.
- R**/E** 코드 미측정 → `status_text` 폴백.

### 3.4 에러코드 (fresh block, E5007 다음)
`CAFE24_APP_NOT_CONFIGURED(E5010)`, `CAFE24_OAUTH_STATE_INVALID(E5011)`, `CAFE24_TOKEN_EXCHANGE_FAILED(E5012)`, `CAFE24_NOT_CONNECTED(E5013)`, `CAFE24_API_ERROR(E5014)` — `error-code.constant.ts`에 추가(구현 시 next-free 재확인).

### 3.5 환경변수 (staging `.env`)
`CAFE24_CLIENT_ID`, `CAFE24_CLIENT_SECRET`(사용자 주입), `CAFE24_REDIRECT_URI=https://shoptalk.amoeba.site/api/v1/auth/cafe24/callback`, **`CAFE24_API_VERSION`=최신버전**(env-overridable; 구현 시 개발자센터 최신 날짜로 고정, 이후 env로 갱신 — kit lesson D-1 정신), `CAFE24_SYNC_INTERVAL_MIN`(예 30), `CAFE24_CONSOLE_RETURN_URL`. (checked-in `env/` 템플릿에는 키만, 값은 서버.)

### 3.6 상품추천 그라운딩 (✅ P-A1 포함)
- `order/cafe24-admin.client.ts`에 **`pullCatalog()`**(btbz-shop-pmm `GET /products?limit=100&offset` → offset 8000 초과 시 `since_product_no` 키셋, 변형은 `/products/{no}/variants`) 이식.
- ShopTalk 상품추천은 **KB product-group 문서 기반**(운영자 CSV, 인용 링크 — [[kb-policy-doc-registration]] 계열). ⟹ Cafe24 카탈로그를 **product 소스로 연결**: 정규 SKU↔상품명↔스토어프런트 링크(`custom_variant_code` 라운드트립 키)로 추천 그라운딩. 구현 형태(상품 캐시 테이블 vs KB 인제스트)는 기존 상품추천 경로에 맞춰 최소로.
- 파일럿 범위: 조회/추천 그라운딩만(상품 push·재고 write 없음 — 적정기술).

### 3.7 주문 이메일 PII 저장 (✅ 동의 기반)
- Cafe24 주문의 buyer/member email을 `customers`에 **PII 암호화 저장**(`piiTransformer` AES-GCM + `email_hash` blind index, PRV-M6) → email 경로로 주문-고객 링크.
- **동의**: 테넌트 개인정보 처리 정책 하에 저장(위젯 고객 동의/테넌트 DPA 범위). 저장 최소화·로그 마스킹 유지. (Cafe24는 PMM과 달리 email을 넘겨주며, ShopTalk은 지원 목적상 동의 하에 보관.)

---

## 4. UI (SCR-A1) — Cafe24 연결 카드

기존 설정(스토어/연동 카드) 패턴에 **Cafe24 OAuth 연결 카드** 추가(시크릿 직접입력이 아니라 OAuth). i18n en/es/ko 키.

```
┌─ Settings ▸ 연동(Integrations) ─────────────────────────────┐
│  [Shopify]  ● Connected  ambshop-dev            [Manage ▾]  │
│  ────────────────────────────────────────────────────────  │
│  [Cafe24]   ○ Not connected                                │
│    Mall ID  [ amoebaorder            ] .cafe24.com          │
│    Scopes: 주문·상품·고객·배송 조회 (앱 승인 화면에서 확인)      │
│                                   [ Connect Cafe24 → ]       │
│    (Connect 클릭 → /api/v1/auth/cafe24/install?mall_id=…      │
│     → Cafe24 승인 → 콜백 → ● Connected · Last sync HH:MM)     │
└────────────────────────────────────────────────────────────┘
```
연결 후: `● Connected · mallId · Last sync` + `[Sync now]`(온디맨드 `POST /tenants/me/cafe24/sync`) + `[Disconnect]`. 실패/성공 토스트(무음 성공 금지, kit §4.3).

---

## 5. 시퀀스 (SEQ-A1)
```
콘솔[Connect] → GET /auth/cafe24/install?mall_id
   → state(Redis, TTL) → 302 https://{mall}.cafe24.com/api/v2/oauth/authorize?client_id&scope&state&redirect_uri
사용자 승인 → GET /auth/cafe24/callback?code&state
   → state 검증·소비 → POST https://{mall}.cafe24api.com/api/v2/oauth/token (Basic, code)
   → refresh 암호저장(integration_credentials, provider=cafe24) → 302 콘솔?connected=1
[예약/온디맨드] syncOrders(tenant)
   → getCafe24Connection(refresh) → GET /orders?start_date&end_date&embed=items (레이트 처리)
   → 매핑(status, email→customer) → orders_cache 멱등 upsert
챗 AI: 기존 buildOrderContext/OrderService가 orders_cache 그라운딩(provider 무관) → 동작
```

---

## 6. 테스트 계획 (TCR 개요, 구현 후 상세)
- 단위: 상태 매퍼(N**/C00→internal/UI, MIXED), 자격증명 JSON 파싱/리프레시, 레이트리밋 분기(35/40·429·401 재시도), 멱등 upsert(중복 order_id).
- 통합(가능 범위): install 302 URL 형식, callback state 검증(무효/만료/재사용 차단), sync가 orders_cache 채우고 email→customer 링크.
- E2E(파일럿): `amoebaorder.cafe24.com` 설치 → 실주문 동기화 → 콘솔/위젯에서 주문상태 그라운딩 확인. (Cafe24 인프라·검증은 [[user-cafe24-expertise]] 협의)
- 회귀: Shopify 경로(upsert dedup 키 변경) 무영향 — 실보트 + Shopify sync 확인.

---

## 7. 결정 완료 (2026-08-07)
1. ✅ **`orders_cache` 일반화 = Option A** — `provider` 컬럼 + 복합유니크 `(tenant_id, provider, shopify_order_id)`, Shopify upsert 소폭수정. (§3.2)
2. ✅ **입금전·취소신청 상태 추가** — `ORDER_STATUS_INTERNAL`에 `pending_payment`·`cancel_requested` 신규 + UI 라벨 + 스텝퍼 반영. (§3.3)
3. ✅ **상품추천 P-A1 포함** — Cafe24 `pullCatalog` 이식 → 추천 그라운딩. (§3.6)
4. ✅ **주문 email 동의 기반 저장** — PII 암호화(PRV-M6) + 정책 하 보관. (§3.7)
5. ✅ **API 버전 = 최신** — `CAFE24_API_VERSION`을 개발자센터 최신 날짜로 고정(env-overridable). (§3.5)

> 잔여 확인(구현 중, 경미): 최신 API 버전 정확 날짜, 상품추천 구현형태(캐시 vs KB 인제스트), N00/C00 UI 카피 톤 — [[user-cafe24-expertise]]와 진행 중 협의.

---

## 8. 롤아웃 & 선결
- ✅ 앱 등록·스코프·Redirect URI(콜백)·서버 Cafe24 호스팅 IP — 완료([[btbz-shop-pmm-cafe24]]).
- ⏳ `CAFE24_CLIENT_ID/SECRET` staging `.env` 주입(사용자).
- 구현(P-A1) → 마이그레이션 사전적용 → staging 배포 → `amoebaorder.cafe24.com` 설치·authorize → 동기화 검증.
- kit 워크플로우: 본 PLN 승인 → 구현 → `docs/test/TCR-260807-cafe24-oauth-order-sync.md` → `docs/implementation/RPT-…`.

---

## 9. 규모/영향
- 신규 백엔드 모듈 1개 + 주문 동기화/클라이언트/상품 4파일 + 마이그레이션 1(`provider` 컬럼) + 설정 UI 카드 1 + i18n 3언어.
- **`packages/types` 상태 열거 확장**(`pending_payment`·`cancel_requested`) → api·web·widget 공유(신규 값 추가라 Shopify 무회귀, 단 위젯 스텝퍼·상태 배지 UI 반영 필요).
- **provider-무관 orders_cache 덕에 챗/이슈 스택 본체 무변경**(적정기술). Shopify 경로 영향 = upsert dedup 키에 provider 추가(저위험, 회귀 테스트로 보증).
- 상품추천 = Cafe24 카탈로그를 기존 추천 경로에 연결(신규 대규모 아님).
