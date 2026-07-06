# Shopify 앱 설정 및 연동 개발 가이드 (실무)

| | |
|---|---|
| 문서 ID | CHATWIDGET-GUIDE-SHOPIFY-SETUP-1.0.0 |
| 대상 | 운영자(앱 설정) · 백엔드/프론트 개발자 |
| 성격 | **실무 설정·개발 가이드** (Shopify 앱 생성 → 이 코드베이스 연결 → 개발 잔여 작업) |
| 짝 문서 | `쇼피파이연동가이드_Shopify-Integration.ko.md` (개념·설계). 임베드 아키텍처·설계 판단은 그 문서를 참조 |
| 작성 기준 | 2026-07-06 · 실제 코드(HEAD) 기준으로 정직하게 표기 |
| 표기 | ✅ 구현됨 · 🟡 부분/보강 필요 · ⛔ 미구현(개발 필요) |

> 이 문서는 **지금 코드에서 무엇이 동작하는지**와 **Shopify 쪽에서 무엇을 눌러야 하는지**를 단계별로 다룹니다. 아키텍처 선택(iframe 격리, 임베드 3방식 등)의 *이유*는 짝 문서(개념·설계)를 보세요.

---

## 1. 현재 구현 기준선 (지금 코드가 지원하는 것)

Shopify 연동은 **웹훅·자격증명·연동상태·세션 골격**까지 구현된 상태이고, **OAuth·실제 Admin API 동기화·위젯 임베드**는 아직입니다.

| 영역 | 상태 | 실제 엔드포인트 / 위치 |
|---|---|---|
| GDPR 규정준수 웹훅 | ✅ (raw-body HMAC 적용됨) | `POST /api/v1/webhooks/shopify/customers/data_request` · `/customers/redact` · `/shop/redact` — `privacy.controller.ts` |
| 배송(fulfillment) 웹훅 | ✅ | `POST /api/v1/webhooks/fulfillment` → `order_cache` 갱신 — `order/webhook.controller.ts` |
| 자격증명 저장(암호화) | ✅ | `GET /api/v1/tenants/me/credentials` · `PUT /api/v1/tenants/me/credentials/:provider` — AES-256-GCM |
| 연동 상태 추적 | ✅ | `GET /api/v1/integrations/status` · `PATCH /api/v1/integrations/status/:name` |
| 세션·shop 파라미터 | ✅ | `POST /api/v1/session/ensure { shop_domain? }` — shop 지정 시 미등록이면 거절, 단일 테넌트만 자동 매칭(멀티 시 필수) |
| 비회원 주문 조회 | ✅ (로컬 캐시) | `POST /api/v1/orders/guest-lookup` — 로컬 `order_cache` 조회 |
| 테넌트=shop 매핑 | ✅ | `tenants.shop_domain` **UNIQUE** — `tenant.entity.ts` |
| Shopify Admin API 클라이언트 | ✅ (온디맨드 + 스케줄) | `POST /api/v1/tenants/me/shopify/sync` — 저장된 토큰으로 `orders.json` 조회 → `orders_cache`·`customers` upsert. `SHOPIFY_SYNC_INTERVAL_MIN`으로 주기 자동 동기화(옵트인) |
| Shopify 연결 설정 UI | ✅ | 콘솔 Settings의 "Shopify 연동" 카드(주소·토큰·테스트·동기화) |
| OAuth(공개 앱 설치) | ⛔ | `/auth/shopify` 없음 |
| ScriptTag / Theme App Extension | ⛔ | 없음 |
| 위젯 shop 전달 | ✅ | 위젯이 `?shop`을 읽어 `session/ensure`에 `shop_domain` 전달 |
| `embed.js` 로더 / iframe 임베드 | ✅ | `apps/widget/public/embed.js` — 버블+iframe 주입, `?embed=1&shop=&locale=`, `ivy:resize` postMessage(오리진 검증). CSP `frame-ancestors`는 배포 설정 |

> **핵심 API 접두어**: 모든 라우트가 `/api/v1` (`API_PREFIX`) 아래에 있으며, **웹훅도 동일**합니다(`/api/v1/webhooks/...`). `@Public()`은 접두어가 아니라 **인증만** 건너뜁니다.

---

## 2. 사전 준비

- **Shopify 상점**: `ivyusa.myshopify.com` 관리자 접근 권한.
- **앱 유형 결정** (2가지 경로):
  - **경로 A — 커스텀 앱(단일 상점, 권장 초기)**: 상점 관리자에서 Admin API 토큰을 발급받아 바로 연결. OAuth 불필요, 지금 코드와 가장 잘 맞음.
  - **경로 B — 공개/배포 앱(OAuth, 다수 테넌트)**: Partner 대시보드로 앱 생성. OAuth·설치 플로우를 **개발해야** 함(§9).
- **로컬 실행**: `npm run db:up` → `npm run db:seed` → `npm run dev` (API `:3000`, 웹 `:5173`, 위젯 `:5174`).
- **필수 시크릿 환경변수** (`env/backend/.env.*`):
  - `CRED_ENC_KEY` — base64 32바이트, 자격증명 암복호화(이미 dev 값 있음).
  - `SHOPIFY_WEBHOOK_SECRET` — 웹훅 HMAC 검증용. **dev엔 미설정 시 검증 우회(경고)**, 프로덕션 필수.

---

## 3. 경로 A — 커스텀 앱 설정 (단일 상점)

가장 빠른 실사용 경로. Shopify 상점 관리자에서 직접 토큰을 발급합니다.

### 3.1 앱 생성 & 스코프
1. 상점 관리자 → **설정 → 앱 및 판매 채널 → 앱 개발(Develop apps)** → **앱 만들기**.
2. **Admin API 통합 구성** → 스코프 선택(최소권한):
   - `read_orders`, `read_customers` (주문·고객 캐시 동기화용)
   - `read_products` (선택, 상품 도움말 강화용)
3. **앱 설치** → **Admin API access token** 공개(`shpat_…`). *토큰은 한 번만 표시되니 즉시 복사.*
4. (HMAC용) **API secret key**(client secret)도 확인 — 웹훅 서명 검증에 사용.

### 3.2 테넌트에 shop 도메인 연결
`tenants.shop_domain`이 상점 도메인과 일치해야 세션이 올바른 테넌트로 붙습니다(UNIQUE).
- 시드 테넌트(`ivyusa`)의 `shop_domain`을 `ivyusa.myshopify.com`으로 설정하거나, 신규 상점이면 값 갱신.

### 3.3 Admin 토큰을 콘솔에 저장 (암호화)
토큰은 **콘솔 Settings**에서 저장하며, 서버는 AES-256-GCM으로 암호화하고 응답은 마스킹합니다(원문 미노출).

```bash
# 테넌트 마스터 JWT 필요 (INTEGRATION_CREDENTIALS_MANAGE 권한)
curl -X PUT http://localhost:3000/api/v1/tenants/me/credentials/shopify \
  -H "Authorization: Bearer <TENANT_JWT>" \
  -H "Content-Type: application/json" \
  -d '{ "secret": "shpat_xxxxxxxxxxxxxxxxxxxxxxxx" }'
```

- 조회 시엔 `{ provider, status, configured: true, updatedAt }`만 반환됩니다(시크릿 원문 없음).
- 여러 키(access token / api key / api secret / webhook secret)가 필요하면 JSON을 직렬화해 `secret` 한 필드에 넣어 통째로 암호화 저장합니다(스키마 변경 없음).

### 3.4 연동 상태 표시
연결이 확인되면 `integration_status`를 갱신해 콘솔 배지에 반영합니다.

```bash
curl -X PATCH http://localhost:3000/api/v1/integrations/status/shopify \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -H "Content-Type: application/json" \
  -d '{ "status": "connected", "detail": "custom app token saved" }'
```

> `PATCH /integrations/status/:name`은 **AdminOnly**이며 `last_sync_at`을 현재 시각으로 스탬프합니다. 추적 대상 이름: `shopify` · `fulfillment` · `klaviyo` · `odoo` · `google_drive`.

---

## 4. GDPR 규정준수 웹훅 설정 (필수 · ✅ 구현됨)

앱이 개인정보를 다루면 Shopify는 3개의 필수 규정준수 웹훅을 요구합니다. **핸들러는 이미 구현**돼 있으니, Shopify 앱 설정에서 URL과 시크릿만 연결하면 됩니다.

### 4.1 등록할 URL (`/api/v1` 접두어 포함)
| 토픽 | 엔드포인트 |
|---|---|
| customers/data_request | `https://<API_HOST>/api/v1/webhooks/shopify/customers/data_request` |
| customers/redact | `https://<API_HOST>/api/v1/webhooks/shopify/customers/redact` |
| shop/redact | `https://<API_HOST>/api/v1/webhooks/shopify/shop/redact` |

- **공개/배포 앱**: Partner 대시보드 → **App setup → Compliance webhooks**에 위 URL 등록.
- **커스텀 앱**: 규정준수 웹훅은 배포 앱(Partner) 개념입니다. 커스텀 앱은 필요한 운영 웹훅을 Admin API 구독으로 등록하되, 코드는 위 핸들러를 항상 제공하므로 배포 단계에서 URL을 가리키게 하면 됩니다.

### 4.2 HMAC 검증 (구현 방식)
- 헤더 `X-Shopify-Hmac-Sha256`, base64, **timing-safe** 비교. 불일치 시 **401**(fail-safe).
- 시크릿: `SHOPIFY_WEBHOOK_SECRET` = 앱의 **API secret key**(webhook 서명 키).
- **dev 편의**: `SHOPIFY_WEBHOOK_SECRET` 미설정 시 경고 로그 후 검증을 통과시킵니다. **프로덕션에선 반드시 설정** — 미설정은 무검증과 같습니다.

### 4.3 ✅ 원문(raw) 바디 검증 — 적용됨 (2026-07-06)
Shopify는 **전송된 원문 바이트**로 서명하므로, 파싱된 JSON을 재직렬화해 검증하면 키 순서·공백 차이로 정상 웹훅이 401날 수 있습니다. 이를 방지하도록 원문 바디 검증을 적용했습니다.

```ts
// main.ts — NestFactory에 rawBody 보존
const app = await NestFactory.create(AppModule, { cors: true, rawBody: true });
// privacy.controller.ts — req.rawBody(Buffer)로 HMAC 계산 (rawBody 없으면 재직렬화 폴백)
```
> 검증: 비정규 공백이 든 원문에 대해 올바른 서명은 통과, 잘못된 서명은 401 확인.

---

## 5. 운영 웹훅 — 주문/배송 상태 (✅ fulfillment 구현됨)

주문 상태 캐시(`order_cache`)를 갱신하는 **자체 배송 웹훅**이 있습니다. 단, 이는 Shopify 네이티브 `orders/updated`가 아니라 **커스텀 형식**입니다.

```bash
# 배송 웹훅 시뮬레이션
curl -X POST http://localhost:3000/api/v1/webhooks/fulfillment \
  -H "Content-Type: application/json" \
  -d '{ "order_id": "shopify-1001", "status": "shipping",
        "tracking_number": "1Z999", "carrier": "UPS" }'
```
- 동작: `Fulfillment` upsert → `order_cache.statusInternal/statusUi` 갱신 → 알림 이벤트 발행.

### 5.1 Shopify 네이티브 주문/배송 웹훅 (✅ 구현됨)
네이티브 Shopify 웹훅 핸들러가 추가됐습니다(모두 HMAC 검증, 접두어 포함, `@Public()`). 테넌트는 `X-Shopify-Shop-Domain` 헤더로 해석하며, 미등록 shop·미캐시 주문은 200으로 무시(로깅)합니다.

| 토픽 | 엔드포인트 | 동작 |
|---|---|---|
| orders/create · orders/updated | `POST /api/v1/webhooks/shopify/orders/{create,updated}` | 주문을 `orders_cache`에 upsert(+고객 연결) |
| fulfillments/create · fulfillments/update | `POST /api/v1/webhooks/shopify/fulfillments/{create,update}` | `shipment_status`→내부 상태 매핑, 주문 상태 전진 + 알림 |

- 배송 상태 매핑: `delivered`→delivered, `in_transit`/`out_for_delivery`/`attempted_delivery`→in_transit, 그 외→shipped.
- Shopify 앱에서 위 토픽을 이 URL로 구독하면 온디맨드 동기화(§1)와 함께 실시간 반영됩니다.

> 참고: 기존 `POST /api/v1/webhooks/fulfillment`(커스텀 형식)도 그대로 유지됩니다(내부 연동/테스트용).

---

## 6. 자격증명 · 연동 상태 관리 (✅ 구현됨, 참조)

| 기능 | 엔드포인트 | 권한 | 비고 |
|---|---|---|---|
| 자격증명 목록 | `GET /api/v1/tenants/me/credentials` | `@RequireCapability(INTEGRATION_CREDENTIALS_MANAGE)` | 마스킹(`configured` 플래그) |
| 자격증명 저장 | `PUT /api/v1/tenants/me/credentials/:provider` | 동일 | `secret` 암호화 저장 |
| 연동 상태 목록 | `GET /api/v1/integrations/status` | `@Auth()` | 배지 노출 |
| 연동 상태 갱신 | `PATCH /api/v1/integrations/status/:name` | `@AdminOnly()` | `last_sync_at` 스탬프 |

- 암호화: `crypto.util`의 AES-256-GCM, 레이아웃 `[12B IV][16B tag][ciphertext]`, 키는 `CRED_ENC_KEY`.
- 시크릿 변경은 감사 로그(`AuditService`)·로그 마스킹 대상.
- 콘솔 Settings 화면에서 위 엔드포인트를 사용해 관리합니다.

---

## 7. 위젯 스토어프론트 연결

**shop 인식 세션은 구현 완료(✅), 임베드 로더는 남아 있습니다(⛔).**

### 7.1 위젯: shop 파라미터 수신 & 전달 (✅ 적용됨)
위젯이 iframe URL의 `?shop`을 읽어 `session/ensure`에 `shop_domain`으로 전달합니다.
```ts
// apps/widget/src/services/sessionService.ts — shopDomain 인자 추가
export function ensureSession(sessionToken: string | null, locale: string, shopDomain?: string) {
  return apiClient.post<SessionResponse>('/session/ensure', {
    session_token: sessionToken ?? undefined,
    locale,
    shop_domain: shopDomain ?? undefined,
  });
}
// apps/widget/src/hooks/useSession.ts — 마운트 시 URL에서 shop 읽어 전달
```

### 7.2 백엔드: 안전한 테넌트 해석 (✅ 적용됨)
첫 테넌트 무조건 폴백을 제거하고 안전 규칙으로 교체했습니다(`session.service.ts`의 `resolveTenant`).
```ts
// shop_domain 지정 → 미등록이면 거절(404 E5005 TENANT_NOT_FOUND)
// shop_domain 없음 → 테넌트가 정확히 1개일 때만 자동 매칭, 다수면 거절(400)
```
> `CLAUDE.md §6`의 High 갭(“chat first tenant 제거”)을 실제로 닫습니다. 검증: 미등록 shop → 404, 단일 테넌트 → 201, 등록 shop → 201.

### 7.3 임베드 로더 `embed.js` (✅ 적용됨)
`apps/widget/public/embed.js`가 스토어에 버블+`<iframe>`을 주입하고 `?embed=1&shop=&locale=`을 iframe URL에 붙입니다. 위젯은 임베드 모드(`?embed=1`)에서 목업 스토어프론트 없이 위젯만 렌더하고, 패널 열림/닫힘 시 부모에 `ivy:resize`를 postMessage → 로더가 iframe 크기를 조절(로더는 메시지 오리진을 검증). 노출 방식(App Embed / ScriptTag / 수동 스니펫) 비교는 짝 문서 §4–5 참조.

설치 스니펫(App Embed 예):
```html
<script>window.IVY_WIDGET_CONFIG = {
  shop: "{{ shop.permanent_domain }}", locale: "{{ request.locale.iso_code }}",
  widgetUrl: "https://widget.ivyusa.app" };</script>
<script src="https://widget.ivyusa.app/embed.js" defer></script>
```

> 🟡 남은 배포 설정: 위젯 호스팅 오리진에 `Content-Security-Policy: frame-ancestors https://*.myshopify.com <커스텀 도메인>`으로 허용 스토어 제한.

---

## 8. 경로 B — 공개 앱(OAuth) 확장 (⛔ 미구현 · 로드맵)

다수 테넌트 SaaS로 확장할 때. **현재 코드에 OAuth 엔드포인트가 없으므로 신규 개발**이 필요합니다.

### 8.1 Partner 대시보드 앱 설정
- 앱 생성 → **App URL**, **Allowed redirection URL(s)**: `https://<API_HOST>/auth/shopify/callback`.
- API scopes(§3.1과 동일), Compliance webhooks(§4.1) 등록.
- 보호된 고객 데이터(Protected customer data) 접근 승인 신청.

### 8.2 개발할 플로우(골격)
```
GET /auth/shopify/install?shop=<shop>.myshopify.com
   → state 발급 + Shopify OAuth 인가 URL로 리다이렉트
GET /auth/shopify/callback?code&hmac&shop&state
   → HMAC·state 검증 → code로 access token 교환
   → tenant를 shop_domain으로 upsert
   → integration_credentials(provider=shopify)에 토큰 암호화 저장
   → 웹훅 등록(GDPR + 운영), 선택적으로 ScriptTag 주입
   → integration_status.shopify = connected
```

---

## 9. 로컬 개발 & 테스트

### 9.1 환경변수
```bash
# env/backend/.env.development 에 추가
SHOPIFY_WEBHOOK_SECRET=<앱 API secret key>
# CRED_ENC_KEY 는 이미 dev 값 존재
```

### 9.2 GDPR 웹훅 HMAC 로컬 테스트
Shopify가 서명하는 방식과 동일하게 base64 HMAC을 만들어 헤더에 넣습니다.
```bash
SECRET='<SHOPIFY_WEBHOOK_SECRET>'
BODY='{"shop_domain":"ivyusa.myshopify.com"}'
HMAC=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -binary | base64)

curl -X POST http://localhost:3000/api/v1/webhooks/shopify/shop/redact \
  -H "Content-Type: application/json" \
  -H "X-Shopify-Hmac-Sha256: $HMAC" \
  -d "$BODY"
```
> 위 예시는 현재 구현(재직렬화 바디)에 맞춰 **동일 바이트**를 보내므로 통과합니다. §4.3의 raw-body 하드닝 이후에도 원문 바이트가 일치하면 동일하게 동작합니다.

### 9.3 실제 Shopify 웹훅 수신(터널)
- `cloudflared tunnel` 또는 `ngrok http 3000`으로 공개 URL 확보.
- Shopify 앱 설정의 웹훅 URL을 `https://<tunnel>/api/v1/webhooks/...`로 지정.
- 테스트 이벤트 발생 → API 로그와 `integration_status`/`order_cache` 변화 확인.

### 9.4 커스텀 앱 토큰 스모크 체크
- `PUT …/credentials/shopify` 저장 후 목록 응답에 `configured:true` 확인(원문 미노출).
- `PATCH …/integrations/status/shopify` 후 콘솔 배지 반영 확인.

---

## 10. 보안 · 규정 체크리스트

- [ ] 프로덕션에 `SHOPIFY_WEBHOOK_SECRET` 설정(무검증 금지).
- [ ] §4.3 raw-body HMAC 하드닝 적용.
- [ ] 시크릿은 AES-256-GCM만, 응답 마스킹, 변경 시 감사 기록(FR-060).
- [ ] `shop_domain`으로 테넌트 확정, **첫 테넌트 폴백 제거**(멀티테넌시 누수 차단).
- [ ] iframe `frame-ancestors`로 허용 스토어만, `postMessage` origin 상호 검증.
- [ ] 최소 스코프(`read_orders`,`read_customers`)·보호된 고객데이터 승인.
- [ ] AI/상담원 아웃바운드는 기존대로 `ModerationService.moderate()` 통과(FR-069).

---

## 11. 개발 체크리스트 (현재 코드 대비 잔여 작업)

**Shopify 쪽(운영):**
- [ ] 커스텀 앱 생성 + Admin API 토큰 발급(§3) / 또는 Partner 공개 앱(§8)
- [ ] 규정준수 웹훅 URL·시크릿 등록(§4)
- [ ] 최소 스코프·보호된 고객데이터 승인

**백엔드(개발):**
- [x] raw-body HMAC 하드닝(§4.3) — 적용됨
- [x] 세션 첫 테넌트 폴백 제거 → 안전 해석(§7.2) — 적용됨
- [x] Shopify Admin API 클라이언트(고객/주문 동기화) — 온디맨드 + 스케줄(`SHOPIFY_SYNC_INTERVAL_MIN`) 적용됨
- [x] Shopify 네이티브 주문/배송 웹훅(orders·fulfillments, HMAC) → `order_cache`(§5.1) — 적용됨
- [ ] (경로 B) `/auth/shopify` OAuth + 설치 시 웹훅/ScriptTag 등록(§8)

**위젯/프론트(개발):**
- [x] `?shop` 파싱 → `session/ensure`에 `shop_domain` 전달(§7.1) — 적용됨
- [x] `embed.js` 로더 + iframe 주입 + 위젯 임베드 모드(§7.3) — 적용됨. CSP `frame-ancestors`는 배포 설정으로 남음
- [ ] 콘솔 Settings에 Shopify 카드·설치 스니펫 노출(짝 문서 §6)

**이미 구현됨(✅):** GDPR 웹훅(raw-body HMAC) · 배송 웹훅 · 자격증명 암호화 · 연동 상태 · shop 인식 세션(안전 테넌트 해석) · 위젯 shop 전달 · 비회원 주문 조회(캐시) · 테넌트 shop_domain UNIQUE.

---

### 부록 · 파일 경로 & 환경변수

**코드 경로**
- GDPR 웹훅: `apps/api/src/domain/privacy/privacy.controller.ts`
- 배송 웹훅: `apps/api/src/domain/order/webhook.controller.ts`, `order.service.ts`
- 자격증명: `apps/api/src/domain/tenant/{tenant.controller.ts, entity/integration-credential.entity.ts}`, `global/util/crypto.util.ts`
- 연동 상태: `apps/api/src/domain/integration/*`
- 세션: `apps/api/src/domain/session/{session.controller.ts, session.service.ts, dto/request/session.request.ts}`
- 주문/고객: `apps/api/src/domain/{order,customer}/*`
- 위젯 세션: `apps/widget/src/{services/sessionService.ts, hooks/useSession.ts}`

**환경변수**
| 변수 | 용도 |
|---|---|
| `API_PREFIX` | 전 라우트 접두어(`api/v1`). 웹훅도 동일 접두어 사용 |
| `SHOPIFY_WEBHOOK_SECRET` | 웹훅 HMAC 검증 키(앱 API secret). 프로덕션 필수 |
| `CRED_ENC_KEY` | 자격증명 AES-256-GCM 키(base64 32B) |

*짝 문서: `쇼피파이연동가이드_Shopify-Integration.ko.md`(개념·설계) · `SPEC.md`(§Shopify) · `CLAUDE.md` · `docs/guide/STAGING-DEPLOY.md`*
