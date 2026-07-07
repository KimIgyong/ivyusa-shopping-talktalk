# 쇼피파이 연동 위젯 작업 가이드 (개념 · 설계)

| | |
|---|---|
| 문서 ID | CHATWIDGET-GUIDE-SHOPIFY-1.0.0 |
| 대상 | IVY USA Shopping TalkTalk — `apps/widget`, `apps/api`, `apps/web` |
| 관련 문서 | `SPEC.md`(§Shopify), `CLAUDE.md`, `docs/guide/STAGING-DEPLOY.md`, `reference/amoeba_privacy_compliance_v2` |
| 관련 요구사항 | FR-047(통합상태), FR-051(테넌트=Shopify shop), FR-060(자격증명 암호화), 감사 High-2(GDPR 웹훅) |
| 작성 기준 | 임베드 3방식 비교 · iframe 격리 렌더링 · EN/KR 이중 |

> 이 문서는 **구현 지시서가 아니라 개념/설계 가이드**다. 실제 코드 변경 시 `CLAUDE.md`의 레이어·DTO 규칙(요청 snake / 응답 camel, Mapper, `@RequireCapability` 등)을 그대로 따른다.

---

## 1. 목표와 범위

이 위젯은 IVY USA의 **Shopify 스토어프론트 프론트페이지에 떠 있는 상담/지원 위젯**(네이버 톡톡 스타일)으로 동작해야 한다. 본 가이드는 세 가지 작업을 다룬다.

1. **스토어프론트 노출** — 위젯을 Shopify 테마에 안전하게 주입(iframe 격리)하고, 어떤 shop인지 식별해 API에 연결한다.
2. **Settings에서 Shopify 설정 저장** — 앱 설정(콘솔)의 Settings 화면에서 Shopify shop 도메인·API 자격증명·위젯 노출 설정을 저장/관리한다.
3. **Shopify API 연동 설정** — Admin API 토큰/OAuth, 스코프, 웹훅을 Settings에서 처리하고 연동 상태를 표시한다. 관리자에게 **설치 스크립트/스니펫**을 화면에서 보여준다.

범위 밖: 결제 흐름 변경, Shopify 앱스토어 공개 심사 실제 제출(설계 지침만 포함).

---

## 2. 현재 코드 기준선 (What already exists)

설계 전에 **이미 있는 것**과 **없는 것(gap)**을 분리한다.

이미 존재:

- `apps/widget` — React+Vite SPA. `main.tsx`가 `#root`에 마운트, `App.tsx`는 목업 `Storefront` + 플로팅 `Widget`(런처 버블 + `WidgetPanel`)을 렌더한다.
- 세션 부트스트랩 — `POST /api/v1/session/ensure`는 이미 `shop_domain`을 **선택 파라미터로 받는다**(`EnsureSessionRequest.shop_domain`). 백엔드 `SessionService.ensure()`는 `shop_domain`이 있으면 해당 `tenant`를, 없으면 **첫 테넌트로 폴백**한다(멀티테넌트 누수 gap).
- 자격증명 저장 — `integration_credentials` 테이블 + `IntegrationCredential` 엔티티(테넌트별 `provider`='shopify' 등, `secret_enc` **AES-256-GCM**, FR-060). 콘솔 Settings(`apps/web/.../settings`)에서 `GET/PUT /tenants/me/credentials/:provider`로 관리(마스킹 표시).
- 통합 상태 — `integration_status`(FR-047) + `GET /integrations/status`, `PATCH /integrations/status/:name`.
- Shopify GDPR 웹훅 — `POST /webhooks/shopify/{customers/data_request, customers/redact, shop/redact}` HMAC 검증(`SHOPIFY_WEBHOOK_SECRET`).

없는 것(이번 작업 대상 gap):

- 위젯을 **외부 Shopify 스토어에 주입하는 로더 스크립트/임베드 산출물**(현재는 목업 스토어프론트를 포함한 단독 SPA).
- 위젯이 자기 shop을 **알아내서 `shop_domain`을 `session/ensure`에 전달**하는 경로(현재 미전달 → 첫 테넌트 폴백).
- Settings의 **Shopify 전용 설정 필드**(shop 도메인, Admin 토큰/API key·secret, 웹훅 시크릿, 위젯 노출 옵션·허용 도메인)와 **설치 스니펫 노출 UI**.

---

## 3. 개념 아키텍처

```
Shopify 스토어프론트 (테마)
   │  ① App Embed 블록 / ScriptTag / 수동 스니펫
   ▼
embed.js (로더, 우리 CDN 호스팅)
   │  ② 플로팅 버블 + <iframe> 주입, shop 도메인 주입
   ▼
위젯 iframe  (apps/widget 빌드, https://widget.ivyusa.app)
   │  ③ POST /session/ensure { shop_domain }
   ▼
apps/api (NestJS)  ──▶ tenant 해석(shopDomain) ──▶ MySQL/Redis/RabbitMQ
   │
   └─ ④ /webhooks/shopify/*  ◀── Shopify (주문/고객/GDPR 웹훅)
```

핵심 원칙:

- **iframe 격리(권장 선택)**: 로더는 버블과 `<iframe>`만 스토어 DOM에 넣는다. 위젯 CSS/JS(Tailwind, React, i18n)는 iframe 안에서 실행되어 테마 스타일과 **완전 격리** — 충돌·전역 오염 없음.
- **shop 식별이 멀티테넌시의 축**: 로더가 `Shopify.shop`(또는 설정값)을 iframe URL 쿼리로 넘기고, 위젯이 `session/ensure`에 `shop_domain`으로 전달한다. 백엔드는 이 값으로 테넌트를 확정한다. → CLAUDE.md §6의 "first tenant" gap을 실제로 닫는 지점.
- **설정의 원천은 콘솔 Settings**: shop·자격증명·노출 옵션은 테넌트 콘솔에서 저장하고, 스토어프론트는 그 설정을 읽어 동작한다.

---

## 4. 위젯 임베드 아키텍처 (iframe 격리)

### 4.1 로더 스크립트 `embed.js` (신규 산출물)

새 빌드 타깃(예: `apps/widget/embed/embed.ts` → `embed.js`, 의존성 없는 vanilla). 역할:

1. 스토어에서 shop 도메인·설정 확보 → `Shopify.shop` 전역 또는 로더 `data-*`/`window.IVY_WIDGET_CONFIG`.
2. 우측 하단 **런처 버블**과 숨겨진 **`<iframe>`** DOM 삽입.
3. iframe `src`에 `?shop=<shop_domain>&locale=<lang>` 부착.
4. iframe와 `postMessage`로 통신(열기/닫기, 패널 크기 리사이즈, 안읽음 배지).

```html
<!-- 로더가 만드는 DOM (개념) -->
<div id="ivy-talktalk-root">
  <iframe id="ivy-talktalk-frame"
          src="https://widget.ivyusa.app/?shop=ivyusa.myshopify.com&locale=en"
          title="IVY USA Support" loading="lazy"
          style="border:0;position:fixed;bottom:0;right:0;z-index:2147483000"></iframe>
</div>
```

```js
// embed.js (개념 골격)
(function () {
  var cfg = window.IVY_WIDGET_CONFIG || {};
  var shop = cfg.shop || (window.Shopify && window.Shopify.shop) || '';
  var base = cfg.widgetUrl || 'https://widget.ivyusa.app';
  var locale = (cfg.locale || document.documentElement.lang || 'en').slice(0, 2);

  var frame = document.createElement('iframe');
  frame.src = base + '/?shop=' + encodeURIComponent(shop) + '&locale=' + locale;
  frame.id = 'ivy-talktalk-frame';
  // 초기: 버블 크기만. 열리면 postMessage 'ivy:resize'로 확장.
  Object.assign(frame.style, { position:'fixed', bottom:'0', right:'0',
    width:'96px', height:'96px', border:'0', zIndex:'2147483000' });
  document.body.appendChild(frame);

  window.addEventListener('message', function (e) {
    if (e.origin !== base) return;                 // ★ origin 검증 필수
    if (e.data && e.data.type === 'ivy:resize') {
      frame.style.width = e.data.open ? '400px' : '96px';
      frame.style.height = e.data.open ? '640px' : '96px';
    }
  });
})();
```

> 보안: `message` 핸들러는 반드시 `e.origin`을 위젯 오리진과 대조한다. iframe → 부모 `postMessage`도 `targetOrigin`을 명시한다.

### 4.2 위젯 빌드 변경 (`apps/widget`)

- **목업 스토어프론트 제거(임베드 빌드)**: 임베드용 진입점에서는 `Storefront`를 렌더하지 않고 `Widget`(런처+패널)만 렌더한다. 개발용 미리보기는 기존 `App.tsx` 유지, 임베드 빌드는 별도 진입점/플래그(`VITE_EMBED=1`)로 분기.
- **shop 파라미터 수신**: `main.tsx`(또는 세션 훅)에서 `new URLSearchParams(location.search).get('shop')`를 읽어 스토어 저장.
- **`session/ensure`에 shop 전달**: `apps/widget/src/services/sessionService.ts`의 `ensureSession()`과 호출부(`useSession.ts` `useEnsureSession`)에 `shop_domain`을 추가한다. 백엔드 DTO는 이미 지원한다.

```ts
// sessionService.ts — shop_domain 추가 (개념)
export function ensureSession(sessionToken: string | null, locale: string, shopDomain?: string) {
  return apiClient.post<SessionResponse>('/session/ensure', {
    session_token: sessionToken ?? undefined,
    locale,
    shop_domain: shopDomain ?? undefined,   // ★ 신규
  });
}
```

- **패널 열림/닫힘을 부모에 통지**: `widgetStore`의 `panelOpen` 변경 시 `window.parent.postMessage({type:'ivy:resize', open}, PARENT_ORIGIN)` — 로더가 iframe 크기를 조절.
- **배포**: iframe로 서빙되므로 `X-Frame-Options` 미설정(또는 `ALLOWALL`)하고 `Content-Security-Policy: frame-ancestors https://*.myshopify.com <각 테넌트 커스텀 도메인>`로 **허용 스토어만** 임베드 가능하게 제한한다. 허용 도메인 목록은 §6의 테넌트 설정에서 관리.

### 4.3 CORS / 오리진

- API는 위젯 오리진(`https://widget.ivyusa.app`)과 스토어 오리진에 대해 CORS 허용. 위젯은 자기 오리진에서만 API를 부르므로 API CORS 화이트리스트에 **위젯 오리진**을 넣는다.
- `session/ensure`는 `@Public()`(불투명 세션 토큰) — 인증 헤더 불필요.

---

## 5. 스토어프론트 노출 방식 — 3가지 비교

셋 다 목적은 같다: 스토어의 모든 페이지에 `embed.js` 한 줄을 로드시키는 것. **App Embed를 기본 권장**한다.

### A. Theme App Extension — App Embed 블록 (★ 권장, Online Store 2.0)

앱이 제공하는 **app-embed 블록**을 상점주가 테마 편집기 → *앱 임베드*에서 토글한다. 테마 코드 수정 불필요, 켜고 끄기 쉬움, 앱 심사에 유리.

```liquid
{%- comment -%} extensions/ivy-talktalk/blocks/app-embed.liquid {%- endcomment -%}
<script>
  window.IVY_WIDGET_CONFIG = {
    shop: {{ shop.permanent_domain | json }},
    locale: {{ request.locale.iso_code | json }},
    widgetUrl: "{{ block.settings.widget_url }}"
  };
</script>
<script src="{{ block.settings.widget_url }}/embed.js" defer></script>

{% schema %}
{
  "name": "IVY USA TalkTalk",
  "target": "body",
  "settings": [
    { "type": "text", "id": "widget_url", "label": "Widget URL",
      "default": "https://widget.ivyusa.app" }
  ]
}
{% endschema %}
```

배포: Shopify CLI(`shopify app deploy`)로 익스텐션 게시 → 상점 관리자 *테마 → 사용자 지정 → 앱 임베드*에서 활성화.

### B. ScriptTag API (OAuth 후 REST 주입)

앱 설치(OAuth) 시 Admin REST `POST /admin/api/2024-x/script_tags.json`으로 `embed.js`를 자동 등록. 테마 편집 없이 전 페이지 로드. **2.0에서는 App Embed 대비 비권장**이나 레거시/자동화에 유효.

```jsonc
// POST /admin/api/2024-10/script_tags.json  (Admin API 토큰 필요)
{ "script_tag": { "event": "onload",
  "src": "https://widget.ivyusa.app/embed.js?shop=ivyusa.myshopify.com" } }
```

주의: ScriptTag는 shop을 전역에서 얻기 어려우므로 `src` 쿼리에 shop을 박아 등록하거나 로더가 `Shopify.shop`을 읽게 한다.

### C. 수동 `theme.liquid` 스니펫 (가장 단순)

상점주(또는 우리)가 테마 `theme.liquid`의 `</body>` 직전에 스니펫을 직접 붙인다. 개발/단일 테넌트/PoC에 적합, 관리 자동화는 없음.

```liquid
{%- comment -%} theme.liquid, </body> 직전 {%- endcomment -%}
<script>
  window.IVY_WIDGET_CONFIG = { shop: "{{ shop.permanent_domain }}",
    locale: "{{ request.locale.iso_code }}", widgetUrl: "https://widget.ivyusa.app" };
</script>
<script src="https://widget.ivyusa.app/embed.js" defer></script>
```

### 비교표

| 항목 | A. App Embed(권장) | B. ScriptTag | C. 수동 스니펫 |
|---|---|---|---|
| 테마 코드 수정 | 불필요 | 불필요 | 필요(붙여넣기) |
| 상점주 on/off | 테마 편집기 토글 | 앱 설치/삭제 | 코드 제거 |
| OAuth 앱 필요 | 익스텐션 배포 필요 | 필요 | 불필요 |
| 자동 전 페이지 로드 | O | O | O |
| 앱 심사/2.0 적합 | ◎ | △(비권장) | △ |
| 자동화(다수 테넌트) | ◎ | O(설치시 자동) | ✕(수동) |
| 적합 상황 | 프로덕션 표준 | 레거시/자동주입 | 개발·PoC·단일 상점 |

**전략**: 프로덕션은 A(App Embed) 표준. 온보딩 자동화 필요 시 설치 OAuth에서 B를 폴백으로 등록. 개발·데모는 C.

---

## 6. Settings — Shopify 설정 저장/관리 (설계)

콘솔 Settings 화면(`apps/web/src/domain/settings`)에 **Shopify 전용 섹션**을 추가한다. 저장 원칙: 시크릿은 **AES-256-GCM**로만(FR-060), 응답은 마스킹.

### 6.1 저장할 필드

| 구분 | 필드 | 저장 위치 | 비고 |
|---|---|---|---|
| 식별 | `shop_domain` (`*.myshopify.com`) | `tenants.shop_domain`(기존) | 테넌트=shop, 유니크 |
| API 자격증명 | Admin API access token | `integration_credentials`(provider=`shopify`, `secret_enc`) | 커스텀앱 토큰 |
| API 자격증명 | API key / API secret | 동상(구조화 JSON을 암호화) | 공개앱 OAuth용 |
| 웹훅 | webhook shared secret | 자격증명 또는 env `SHOPIFY_WEBHOOK_SECRET` | HMAC 검증 |
| 노출 설정 | 위젯 활성화 on/off | 신규 `tenant_widget_settings` | 스토어 노출 제어 |
| 노출 설정 | 허용 도메인(커스텀 도메인) | 신규 테이블 | CSP `frame-ancestors` |
| 노출 설정 | 버블 색상/위치/기본 언어 | 신규 테이블 | 위젯 외형 |

> 시크릿은 원문을 응답으로 절대 반환하지 않는다. 목록에는 `configured`/`maskedKey`/`lastUpdatedAt`만(기존 `CredentialStatus` 패턴 유지).

### 6.2 데이터 모델 결정

- **자격증명**은 **기존 `integration_credentials` 재사용**(provider=`shopify`). 여러 키가 필요하면 `{accessToken, apiKey, apiSecret, webhookSecret}` JSON을 직렬화 후 통째로 `secret_enc`에 암호화 저장한다(스키마 변경 최소).
- **비밀이 아닌 노출/외형 설정**은 신규 엔티티 `tenant_widget_settings`(테넌트별 1행)로 분리. `tenant_id` 컬럼 필수(멀티테넌시 규칙), 평문 컬럼(색상/위치/활성화/허용도메인 JSON).

```
apps/api/src/domain/tenant/entity/tenant-widget-settings.entity.ts   # 신규
  tenant_id BIGINT, enabled TINYINT, launcher_color VARCHAR,
  launcher_position VARCHAR, default_locale VARCHAR,
  allowed_domains JSON, updated_at
```

### 6.3 백엔드 설계 (CLAUDE.md 규칙 준수)

- 요청 DTO snake / 응답 camel(정적 Mapper), 컨트롤러는 glue만.
- 권한: 자격증명은 기존 `@RequireCapability(INTEGRATION_CREDENTIALS_MANAGE)`. 노출 설정도 동일 캐퍼빌리티 또는 테넌트 마스터/운영 라벨.
- 시크릿 저장/복호화는 `crypto.util`(AES-256-GCM), PII·시크릿은 로그 마스킹, 저장 시 `AuditService.write`.

신규/확장 엔드포인트(예):

```
GET  /tenants/me/shopify/settings     → { shopDomain, enabled, launcherColor, ... , credential: {configured, maskedKey} }
PUT  /tenants/me/shopify/settings      { enabled, launcher_color, allowed_domains[] , ... }
PUT  /tenants/me/credentials/shopify    { secret: <access token 등> }   # 기존 재사용
POST /tenants/me/shopify/test           → Admin API 핑 → integration_status upsert
GET  /tenants/me/shopify/install        → 설치 스니펫/스크립트(아래 6.5)
```

### 6.4 콘솔(web) UI 설계

기존 `SettingsPage.tsx`의 자격증명 표 아래에 **"Shopify 연동"** 카드 추가:

- shop 도메인 입력(읽기전용 또는 마스터만 수정) + **연결 테스트** 버튼(→ `POST .../shopify/test`, 결과 배지).
- Admin 토큰/webhook secret 입력 모달(기존 자격증명 모달 재사용, `type=password`, 저장 시만 전송).
- 위젯 활성화 토글, 버블 색상/위치/기본 언어, 허용 도메인 목록 편집.
- 모든 문구는 `t()`(namespace `settings`), en/es/ko 등록.

### 6.5 설치 스크립트/스니펫 화면 노출 (요구사항)

Settings의 Shopify 카드에 **"스토어에 설치"** 하위 영역을 두고 §5의 세 스니펫을 **복사 버튼과 함께** 보여준다. 각 스니펫은 해당 테넌트의 `shop_domain`·`widgetUrl`이 채워진 상태로 렌더:

- 탭 A(App Embed): 익스텐션 활성화 안내 + "테마 → 앱 임베드에서 켜기" 단계.
- 탭 B(ScriptTag): "설치 시 자동 등록됨" 상태 표시 + 수동 등록 버튼.
- 탭 C(수동): `theme.liquid` 스니펫 원문 + 복사 버튼.

`GET /tenants/me/shopify/install`이 채워진 스니펫 문자열을 반환하고, 프론트는 그대로 표시(하드코딩 금지, 값은 서버가 채움).

---

## 7. Shopify API 연동 설정 (설계)

### 7.1 앱 유형 선택

- **커스텀 앱(권장 초기)**: 단일 상점(ivyusa)이면 상점 관리자 *앱 → 앱 개발*에서 Admin API access token 발급 → Settings에 저장. OAuth 불필요, 가장 빠름.
- **공개 앱(OAuth)**: 다수 테넌트 SaaS 확장 시. `/auth/shopify/install` → OAuth 콜백에서 access token 저장, 설치 시 웹훅·(선택)ScriptTag 자동 등록.

### 7.2 필요 스코프(예)

`read_orders`, `read_customers`(주문/고객 캐시 동기화), `read_products`(선택). App Embed만 쓰면 ScriptTag 스코프 불필요. 최소권한 원칙.

### 7.3 웹훅 등록

- **필수 GDPR 웹훅**(이미 구현): `customers/data_request`, `customers/redact`, `shop/redact` → `POST /webhooks/shopify/*`, HMAC(`SHOPIFY_WEBHOOK_SECRET`) 검증. 앱 설정에 이 URL과 시크릿을 등록.
- **운영 웹훅**(선택): `orders/updated`, `fulfillments/create` 등으로 주문 캐시(`order_cache`) 갱신.

### 7.4 연동 상태 표시

연결 테스트/동기화 시 `integration_status`(name=`shopify`)를 `PATCH /integrations/status/shopify`로 upsert(`status`, `last_sync_at`, `detail`). 콘솔에서 배지로 노출.

---

## 8. 작업 항목 (WBS 체크리스트)

위젯 / 임베드:
- [ ] `apps/widget` 임베드 진입점 분기(`VITE_EMBED`), 목업 Storefront 제외
- [ ] `?shop`·`?locale` 파싱 → `session/ensure`에 `shop_domain` 전달(`sessionService`·`useSession`)
- [ ] `panelOpen` ↔ 부모 `postMessage('ivy:resize')`, origin 검증
- [ ] `embed.js` 로더(vanilla) 빌드 타깃 + iframe 주입 + config 수신
- [ ] 위젯 배포 오리진 CSP `frame-ancestors`(허용 도메인 주입), CORS 화이트리스트

백엔드:
- [ ] `SessionService` "first tenant" 폴백 제거 → `shop_domain` 없으면 거절/명시 처리(CLAUDE.md §6 High)
- [ ] `tenant_widget_settings` 엔티티·DTO·Mapper·서비스·컨트롤러(+`app.module` 등록)
- [ ] Shopify 자격증명 다중키 JSON 암호화 저장(기존 `integration_credentials` 재사용)
- [ ] `GET/PUT /tenants/me/shopify/settings`, `POST .../test`, `GET .../install`
- [ ] 커스텀앱 토큰 검증(Admin API 핑) → `integration_status` upsert
- [ ] (공개앱 확장 시) `/auth/shopify` OAuth + 설치시 웹훅/ScriptTag 등록

콘솔(web):
- [ ] `SettingsPage`에 Shopify 카드(도메인·자격증명·노출설정·테스트)
- [ ] 설치 스니펫 3탭 + 복사 버튼(서버가 값 채움)
- [ ] i18n(en/es/ko) 문자열 등록

Shopify 앱/배포:
- [ ] Theme App Extension(app-embed 블록) 스캐폴드 + `shopify app deploy`
- [ ] GDPR 웹훅 URL/시크릿 앱 설정 등록, `SHOPIFY_WEBHOOK_SECRET` 배포 env 반영
- [ ] `embed.js`·위젯 정적 호스팅(전용 오리진)

---

## 9. 보안 · 규정 체크

- 시크릿: `secret_enc` AES-256-GCM만, 응답 마스킹, 로그 PII 마스킹, 변경 시 감사 기록(FR-060, `amoeba_privacy_compliance_v2`).
- 웹훅: HMAC-SHA256 검증 실패 시 거부(fail-safe). `SHOPIFY_WEBHOOK_SECRET` 미설정은 dev 전용.
- iframe: `frame-ancestors`로 허용 스토어 도메인만, `postMessage` origin 상호 검증.
- 멀티테넌시: 모든 쿼리 `tenant_id` 스코프, `shop_domain`으로 테넌트 확정(첫 테넌트 폴백 제거). 크로스 테넌트 누수 금지.
- AI/에이전트 아웃바운드는 기존대로 `ModerationService.moderate()` 통과(FR-069).

## 10. 테스트 시나리오(요약)

- shop A/B 두 테넌트에서 각 스토어 임베드 → 세션이 **각자 테넌트로** 격리되는지.
- `shop_domain` 누락/미등록 shop → 거절 처리.
- 잘못된 origin `postMessage` 무시, 잘못된 HMAC 웹훅 거부.
- 자격증명 저장 후 응답에 원문 미노출(마스킹), 연결 테스트 상태 반영.
- App Embed on/off, 수동 스니펫, ScriptTag 각 경로에서 버블 노출·열림·리사이즈.

---

### 부록 · 관련 파일 경로

- 위젯: `apps/widget/src/{main.tsx,App.tsx,services/sessionService.ts,hooks/useSession.ts,components/widget/*}`
- 세션 API: `apps/api/src/domain/session/{session.controller.ts,session.service.ts,dto/request/session.request.ts}`
- 자격증명/테넌트: `apps/api/src/domain/tenant/{tenant.controller.ts,entity/integration-credential.entity.ts,entity/tenant.entity.ts}`
- 통합상태: `apps/api/src/domain/integration/*`
- GDPR 웹훅: `apps/api/src/domain/privacy/privacy.controller.ts`(`webhooks/shopify/*`)
- 콘솔 설정: `apps/web/src/domain/settings/{SettingsPage.tsx,settings.service.ts,settings.hooks.ts}`
