# 쇼피파이 테스트 계정 추가 가이드 (ambshop-dev)

| | |
|---|---|
| 문서 ID | GUIDE-260820-Shopify-Test-Accounts |
| 대상 스토어 | `ambshop-dev.myshopify.com` (개발 스토어) |
| 대상 테넌트 | ivyusa — 콘솔 `https://shoptalk.amoeba.site/ivyusa` (platform=shopify) |
| 관련 문서 | `쇼피파이연동가이드_Shopify-Integration.ko.md`, `쇼피파이연동점검_Shopify-Integration-Status-20260723.bilingual.md`(B4), `REQ-Widget-Login-Redirect-Orders-20260803.md` |
| 작성일 | 2026-08-20 |

위젯의 "내 주문" 시나리오(연동점검 B4)를 테스트하려면 **Shopify 쪽 계정 3종**이 구분되어야 한다.
이 문서는 각각을 어디서, 어떻게 추가하는지 정리한 안내다.

| 구분 | 용도 | 추가 위치 |
|---|---|---|
| ① 고객(구매자) 테스트 계정 | 스토어프론트 로그인 → 위젯 신원연동·주문탭 테스트 | Shopify Admin → Customers |
| ② 스태프(관리자) 계정 | ambshop-dev 어드민 접근(상품·주문·설정) | Shopify Admin → Settings → Users |
| ③ ShopTalk 콘솔 계정 | shoptalk.amoeba.site/ivyusa 상담 콘솔 접근 | 콘솔 → 팀 관리 (참고용) |

---

## 1. 사전 확인 — 고객 계정 모드

위젯 로그인은 **스토어의 호스티드 고객 로그인**을 그대로 사용한다
(로더 `embed.js`가 `/customer_authentication/login`으로 보내고, 복귀 후 App Proxy
`/apps/ivy/identity`가 Shopify 서명 신원을 확정 → 세션이 고객에 바인딩됨).

1. `ambshop-dev.myshopify.com/admin` 접속 → **Settings → Customer accounts**
2. 모드 확인:
   - **Customer accounts (신형, 권장·기본)** — 비밀번호 없음. 고객이 이메일 입력 → **6자리 인증코드**를 메일로 받아 로그인. 위젯 기본 `loginPath`(`/customer_authentication/login`)와 일치.
   - **Legacy (구형)** — 이메일+비밀번호. 이 모드로 바꾸면 임베드 설정에서 `IVY_WIDGET_CONFIG.loginPath = '/account/login'` 오버라이드가 필요하므로, **특별한 사유가 없으면 신형 유지**.

> 신형 모드에서는 로그인 시 **인증코드 메일을 실제로 수신**해야 하므로, 테스트 계정 이메일은 반드시 받은편지함에 접근 가능한 주소여야 한다.

## 2. ① 고객 테스트 계정 추가

### 2.1 이메일 준비 (권장 패턴)

Gmail의 plus-addressing으로 하나의 실계정에서 여러 테스트 고객을 만든다.
인증코드가 전부 같은 받은편지함으로 도착한다.

```
본인계정+shopify-test1@gmail.com
본인계정+shopify-test2@gmail.com
```

⚠️ 실존 고객/타인의 이메일은 사용 금지 (인증코드 수신 불가 + PII 이슈).

### 2.2 Admin에 고객 등록

신형 계정 모드에서는 사전 등록 없이 로그인 화면에서 이메일만 입력해도 계정이
생성되지만, **주문을 미리 연결해 두려면 사전 등록이 필요**하다.

1. Admin → **Customers → Add customer**
2. First/Last name(예: `Test Shopper1`), Email(위 plus 주소) 입력
3. (신형 모드) 초대 메일 불필요 — 저장만 하면 끝
4. (Legacy 모드일 때만) 저장 후 고객 상세 → **Send account invite** → 고객이 메일 링크로 비밀번호 설정

### 2.3 테스트 주문 생성 (위젯 주문탭 검증용)

주문이 없으면 위젯 주문탭이 비어 보이므로, 테스트 고객 앞으로 주문을 만든다.

**방법 A — Admin 드래프트 주문 (가장 빠름)**
1. Admin → **Orders → Create order**
2. 상품 추가 → **Customer**에 위 테스트 고객 지정
3. **Collect payment → Mark as paid**

**방법 B — 스토어프론트 실구매 흐름 (결제까지 검증할 때)**
1. Settings → **Payments**에서 테스트 결제 활성화:
   - **Bogus Gateway**(개발 스토어 전용) — 카드번호 `1`=승인, `2`=거절, `3`=오류
   - 또는 Shopify Payments **test mode** — 테스트 카드 `4242 4242 4242 4242`
2. 테스트 고객으로 로그인한 상태에서 상품 구매

두 방법 모두 `orders/create` 웹훅 → `orders_cache` 반영까지 확인한다
(콘솔 주문 목록 또는 위젯 주문탭에 수 초 내 표시).

### 2.4 스토어프론트 접근

개발 스토어의 온라인 스토어가 비밀번호로 보호되어 있으면 테스터가 진입할 수 없다.
Admin → **Online Store → Preferences → Password protection**에서 비밀번호를
확인해 테스터에게 공유하거나(또는 프리뷰 공유 링크 사용), 보호를 해제한다.

## 3. ② 스태프(관리자) 계정 추가

ambshop-dev 어드민에서 상품/주문/설정을 만질 테스터용.

1. Admin → **Settings → Users and permissions → Add staff**
2. 이름·이메일 입력, 권한 선택(테스트 목적이면 Orders/Customers/Online Store 정도로 제한 권장)
3. 초대 메일 수락 → Shopify 계정(Shopify ID)으로 로그인

> 파트너 대시보드 조직 멤버라면 별도 스태프 추가 없이 파트너 대시보드에서
> 개발 스토어로 바로 로그인할 수도 있다 (개발 스토어는 스태프 수 제한 없음).

## 4. ③ ShopTalk 콘솔 계정 (참고)

상담 콘솔(`https://shoptalk.amoeba.site/ivyusa`) 쪽 테스터는 Shopify와 무관하게
테넌트 마스터(`dev@amoeba.group`)가 콘솔 **팀 관리**에서 팀원(직급·라벨)을
추가한다. 최초 로그인 시 비밀번호 변경 필수.

## 5. 검증 절차 (E2E)

1. 테스트 고객 이메일 준비(§2.1) + 고객 등록·주문 생성(§2.2–2.3)
2. `ambshop-dev.myshopify.com` 스토어프론트 접속(비밀번호 통과) → 위젯 열기
3. 위젯 **로그인** 클릭 → 스토어 로그인 페이지로 이동(redirect 모드) → 이메일 입력 → 메일의 6자리 코드 입력
4. 원래 페이지로 복귀 → **위젯이 자동으로 다시 열리고**(reopen 플래그) 주문탭에 테스트 주문 표시 확인
5. 콘솔(`/ivyusa`)에서 해당 세션이 고객(이름/이메일)과 매핑되어 보이는지 확인

안 될 때:
- 로그인 후에도 게스트로 표시 → App Proxy(`/apps/ivy/identity`) 미설정/서명 실패 가능성 — 연동점검 문서 A2(앱 재설치·스코프 3개) 참조
- 주문탭 비어 있음 → 주문의 Customer가 로그인한 고객과 동일한지, `orders_cache` 반영 여부 확인
- 인증코드 메일 미수신 → 이메일 오타 또는 Legacy 모드 여부 확인(§1)

## 6. 주의사항

- 테스트 고객 이름에 `Test` 접두어를 붙여 실데이터와 구분한다.
- 개발 스토어는 실결제 불가 — 결제 테스트는 반드시 Bogus Gateway/test mode.
- 테스트 고객 삭제 시 GDPR `customers/redact` 웹훅이 발화될 수 있음(정상 동작).
- 스토어프론트 비밀번호·스태프 초대 메일 등 자격 정보는 `secrets/`(gitignored) 외 저장 금지.
