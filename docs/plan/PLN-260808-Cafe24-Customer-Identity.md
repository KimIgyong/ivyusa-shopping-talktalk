# PLN-260808 — Cafe24 위젯 고객 신원(로그인) 연동 (P-A2)

- 상위 REQ: `docs/analysis/REQ-*-Cafe24*` (P-A 파일럿), 관련 PLN: `PLN-260807-*` (P-A1 주문 동기화)
- 설계 IDs: FR-CAFE24-IDENTITY / FN-Cafe24CustomerAuth / SCR-WidgetSignin / TBL-customer(+cafe24_user_identifier) / SEQ-CustomerAuth
- 상태: **승인 대기 (구현 전)** — 승인 후 착수. 아메바 철학 관점: *적정기술*(Cafe24 표준 회원인증 API 재사용, 자체 비번 저장 없음) · *연결*(몰 로그인 세션 ↔ 위젯) · *공유*(멀티채널 신원 추상화 재사용).

---

## 1. 배경 · AS-IS (실측)

위젯은 로그인 신원을 **Shopify App Proxy 전용** 경로로만 받는다.

| 확인 항목 | 실측 결과 (amoebaorder.cafe24.com) |
|---|---|
| 신원 획득 | `embed.js fetchIdentity()` → `GET {proxyBase}/identity` (`proxyBase=/apps/ivy`) — Shopify가 서명된 `logged_in_customer_id`를 프록시로 전달하는 전제 |
| Cafe24 몰에서 그 엔드포인트 | **404 (text/html)** — Cafe24엔 App Proxy가 없음 |
| 결과 | identity=null → 위젯 **익명 세션** 유지 → 주문 바인딩 없음 → **"내 주문" 표시 불가** |

즉 로그인 페이지 이동(#148)은 고쳤으나, 로그인 후 위젯이 **누가 로그인했는지 알 방법이 없다.** Cafe24는 App Proxy 등가물이 없으므로 **Cafe24 표준 "쇼핑몰 회원 인증(customeraccesstoken)"** 으로 서버검증 신원을 얻어야 한다. (승인된 방향: A안 — 고객 OAuth 서버검증. B안 `getCustomerIDInfo` 단독은 member_id 위조 가능 → 주문 노출에 부적합.)

## 2. TO-BE — Cafe24 고객 인증(customeraccesstoken) 서버검증 플로우

정본(개발자 문서 확인):

| 단계 | 스펙 |
|---|---|
| ① 인가코드 | `GET https://{몰도메인}/api/v2/oauth/authorize?response_type=code&client_id=&state=&redirect_uri=&scope=mall.read_customer_identifier` — 브라우저 리다이렉트. **코드 1분 만료.** 사전등록: 개발자어드민에 front redirect_uri + scope 등록 |
| ② 토큰 | `POST https://{몰도메인}/api/v2/oauth/token` (x-www-form-urlencoded, `grant_type=authorization_code`, Basic `client_id:secret`) → customer access_token (**2h**, refresh 가능, 몰당 동시 15개) |
| ③ 회원 식별자 | `GET https://{몰도메인}/api/v2/customers/identifier` + `Authorization: Basic {customer_access_token}` → `{ identifier: { shop_no, user_identifier } }`. `user_identifier` = **mall_id+shop_no+client_id+user_id 조합 해시**(가명·안정) |

> 관리자 OAuth(P-A1, `.cafe24api.com/admin`)와 **별개 플로우**다. authorize/token/identifier 모두 **몰 프라이머리 도메인(`{mall}.cafe24.com`)** 기준, 스코프는 `mall.read_customer_identifier`.

## 3. 아키텍처 (핸드셰이크 — 토큰 클라이언트 미노출)

```
위젯(iframe) 로그인 클릭
  └─postMessage→ embed.js(top window)
       └─ (미로그인이면 먼저 /member/login.html?returnUrl=… 로 로그인 #148)
       └─ TOP 이동→ GET api/v1/public/cafe24/customer-auth/start?tenant=<slug>&return=<storefront_url>
             backend: state(Redis 5m {tenantId,mallId,return}) 생성 → 302
               → {mall}.cafe24.com/api/v2/oauth/authorize?…scope=mall.read_customer_identifier&redirect_uri={our callback}
  Cafe24(몰 세션 보유) → 302 → api/v1/public/cafe24/customer-auth/callback?code=&state=
     backend: state 검증 → POST token → customer_access_token
              → GET {mall}/api/v2/customers/identifier (Basic token) → user_identifier, shop_no
              → 고객 resolve (tenantId, cafe24_user_identifier) → 위젯 세션토큰 발급
              → 1회용 ticket(Redis 60s → sessionToken) 생성
              → 302 → <storefront_url>#ivy_ticket=<ticket>
  embed.js: URL fragment의 ticket 회수 → POST public/cafe24/customer-auth/exchange {ticket}
              → { sessionToken } → sendToWidget({type:'ivy:session', token})
  위젯: 인증 세션 → "내 주문" 표시
```

- **보안**: customer_access_token은 **서버에만** 존재(클라 미노출); ticket은 1회용·불투명·fragment 전달(쿼리 금지=개인정보 URL 미노출 규칙); state=CSRF; redirect_uri 화이트리스트; identifier는 서버검증. tenant 스코프 필수. (AI/모더레이션 무관.)
- **재사용**: 위젯 세션토큰 발급은 기존 Shopify identity 경로와 동일 산출물 → widget/session 계약 변경 없음.

### 백엔드 변경
- `domain/cafe24/cafe24-customer-auth.service.ts` (신규): `start()` / `handleCallback()` / `exchangeTicket()`.
- `domain/cafe24/cafe24-customer-auth.controller.ts` (신규, `@Public`): `GET /public/cafe24/customer-auth/{start,callback}`, `POST /public/cafe24/customer-auth/exchange`.
- `cafe24-admin.client.ts`/신규 front 클라이언트: front token 교환 + identifier 조회(몰 도메인 호스트).
- `customer` 엔티티: `cafe24_user_identifier varchar(120) NULL` + `uk(tenant_id, cafe24_user_identifier)` (부분/조건 유니크는 앱단 가드). 세션토큰 발급 = 기존 위젯 세션 서비스 재사용.
- 에러코드 E5015–E5018 (state 무효/토큰실패/identifier실패/미연결).

### 프런트(embed.js) 변경
- Cafe24 호스트일 때 로그인 후 복귀 처리: fragment `#ivy_ticket` 감지 → exchange → `ivy:session`. 미로그인 시 로그인 이동은 #148 유지. `proxyBase`(App Proxy)는 Shopify 전용으로 분기.

## 4. 미결 PoC 항목 (구현 중 라이브 확인 — 착수 차단 아님)

| ID | 항목 | 후보 해소 |
|---|---|---|
| **J1** | `user_identifier`(가명) ↔ 주문(현재 email로 동기화됨) **연결키** | ⓐ admin `/api/v2/admin/customers`가 동일 식별자/회원키 노출하면 동기화 시 customer에 저장→직접 조인 · ⓑ 최초 인증 시 서버검증된 세션 내에서 회원 이메일 확보 경로 확인 · ⓒ 이후 주문은 저장된 user_identifier로 매칭. **Cafe24 설계 당사자(사용자) 확인이 가장 빠름.** |
| J2 | front OAuth authorize 호스트가 `{mall}.cafe24.com` 확정(관리자와 동일 호스트, 스코프만 상이) | 콜백 성립 여부로 검증 |
| J3 | 개발자어드민에 front redirect_uri + `mall.read_customer_identifier` 스코프 등록 | **사용자 액션(앱 설정)** |

## 5. 와이어프레임 (위젯 로그인 UX)

```
┌───────────────── 위젯 (미로그인) ─────────────────┐
│  안녕하세요! 무엇을 도와드릴까요?                   │
│  ─────────────────────────────────────────────── │
│  [ 로그인하고 내 주문 보기 ]  ← 클릭              │
└───────────────────────────────────────────────────┘
        │  (top window) 몰 로그인 필요시 /member/login.html
        ▼
   Cafe24 로그인 페이지 → 로그인 → (자동) 회원 인증 authorize
        │  scope: mall.read_customer_identifier
        ▼  (백엔드 콜백·티켓 교환, 화면 깜빡임 최소)
┌───────────────── 위젯 (인증됨) ───────────────────┐
│  홍길동님, 안녕하세요.                              │
│  ─────────────────────────────────────────────── │
│  📦 내 주문                                        │
│   • #1001  결제완료   ₩28,000                      │
│   • #1002  배송중     ₩12,000                      │
└───────────────────────────────────────────────────┘
```
(신규 화면 없음 — 기존 위젯 로그인/내주문 UI 재사용, 신원 획득 경로만 Cafe24용 추가.)

## 6. WBS

1. 백엔드 customer-auth 서비스/컨트롤러 + front 토큰/identifier 클라이언트 + 에러코드.
2. `customer.cafe24_user_identifier` 마이그레이션(SQL, idempotent) + 매퍼.
3. J1 조인키 PoC(라이브 몰 + 앱) → 주문 매칭 확정.
4. embed.js Cafe24 복귀(ticket) 처리 + 분기.
5. TCR(단위: state/토큰/identifier/티켓 만료·재사용, 조인) + 실브라우저 E2E(로그인→내주문).
6. 마이그레이션 staging 선적용 → 배포 → RPT.

## 7. 사전조건(사용자) · 롤백

- **사전조건**: 개발자어드민(client `W0cuersbLK0Gz1vyut8QjF`)에 **front redirect_uri**(`https://shoptalk.amoeba.site/api/v1/public/cafe24/customer-auth/callback`) + **scope `mall.read_customer_identifier`** 등록(J3). J1 조인키 확인.
- **롤백**: 신규 `@Public` 라우트·컬럼만 추가 → 미사용 시 위젯은 익명(현행)으로 무해 폴백. 컬럼 DROP 가능.
