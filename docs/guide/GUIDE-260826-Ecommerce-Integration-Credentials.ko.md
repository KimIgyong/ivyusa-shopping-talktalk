# 커머스 플랫폼 연동 자격증명 가이드 (ShopTalk `/settings/platforms`)

> 대상: 테넌트 운영자. ShopTalk 콘솔의 **설정 → 플랫폼(`/settings/platforms`)** 에서 각
> 커머스 플랫폼을 연결할 때 입력하는 값(사용자명·데이터베이스명·API 키 등)을 **각 플랫폼
> 관리자 화면 어디에서 발급/확인**하는지 안내합니다. 값이 준비되면 카드에 입력 → 저장 →
> **연결 테스트**로 검증하세요. (Shopify는 별도 "Shopify 연동" 카드, 나머지는 플랫폼 카드)

작성일 2026-08-26 · 필드 기준: `apps/web/src/domain/settings/integration-providers.ts` /
연결 테스트 로직: `apps/api/src/domain/tenant/ecommerce-probe.util.ts` (코드와 1:1 일치)

---

## 공통 사항

- **입력 필드는 콘솔 라벨과 1:1 대응**합니다. 아래 표의 "ShopTalk 필드"가 화면에 보이는 라벨입니다.
- **시크릿 값(토큰·시크릿·API 키)** 은 저장 후 다시 표시되지 않습니다("저장됨 — 교체하려면
  새 값을 입력"). 교체할 때만 다시 넣으면 됩니다.
- **URL은 반드시 `https://`** 여야 하며, 내부/사설 주소(로컬호스트·사내 IP 등)는 보안상
  거부됩니다(SSRF 차단). 공개 도메인만 사용하세요. (Woo·Odoo에 해당)
- 연결에 필요한 최소 권한은 **주문·고객·상품 읽기**입니다. 쓰기 권한은 필요하지 않습니다.
- 연결 테스트가 실패하면 카드에 사유가 표시됩니다(예: `401`=토큰 무효/만료,
  `returned 404`=주소 오류). 사유를 보고 값을 교정하세요.

---

## 1. Shopify — "Shopify 연동" 카드

**ShopTalk가 요구하는 값**

| ShopTalk 필드 | 값 | 필수 |
|---|---|---|
| 쇼핑몰 주소 | `your-store.myshopify.com` | ✅ |
| Admin API 액세스 토큰 | `shpat_…` | ✅ |
| API 키 / API 시크릿 | (공개 앱 OAuth용) | 선택 |

**어디서 확인하나 — Shopify 관리자**

1. Shopify 관리자 → **Settings(설정)** → **Apps and sales channels(앱 및 판매 채널)**.
2. **Develop apps(앱 개발)** → **Create an app(앱 만들기)** → 앱 이름 입력.
3. **Configuration(구성)** → *Admin API integration* → 다음 스코프를 허용:
   `read_orders`, `read_customers`, `read_fulfillments`, `read_products`.
4. **API credentials(자격 증명)** 탭 → **Install app(앱 설치)**.
5. 설치 후 표시되는 **Admin API access token**(`shpat_…`)을 복사 → ShopTalk의
   *Admin API 액세스 토큰* 칸에 붙여넣기. **이 토큰은 설치 직후 한 번만 표시**되므로 즉시 저장하세요.
6. **쇼핑몰 주소** 는 관리자 URL의 `xxxx.myshopify.com` 부분입니다(브랜드 도메인 아님).
7. *API 키/시크릿* 은 커스텀 앱 방식에서는 **비워두어도 됩니다**(공개 OAuth 앱을 쓸 때만 사용).

> 참고: 이미 ShopTalk 공개 앱(OAuth)으로 "연결" 버튼을 통해 설치했다면 토큰은 자동
> 저장됩니다. 위 수동 토큰 입력은 커스텀 앱을 직접 쓰는 경우입니다.

---

## 2. Cafe24 — "Cafe24" 카드

**ShopTalk가 요구하는 값**

| ShopTalk 필드 | 값 | 필수 |
|---|---|---|
| 몰 ID | 상점 아이디 (예: `yourmall`) | ✅ |
| 클라이언트 ID / 클라이언트 시크릿 | 개발자센터 앱 값 | 선택 |
| 액세스 토큰 | Admin API OAuth 토큰 | ✅ |

**어디서 확인하나 — Cafe24 개발자센터**

1. **몰 ID**: 카페24 관리자 접속 주소 `yourmall.cafe24.com` 의 `yourmall` 부분, 또는
   관리자 상단에 표시되는 상점 아이디입니다.
2. **클라이언트 ID / 시크릿**: [Cafe24 개발자센터](https://developers.cafe24.com) 로그인 →
   **앱 만들기** → 생성된 앱의 **App 정보**에서 *Client ID* / *Client Secret* 확인.
   - 앱 **권한(Scope)** 에 `mall.read_application`, `mall.read_order`, `mall.read_customer`,
     `mall.read_product` 등 **읽기 권한**을 추가하세요.
   - **Redirect URI** 는 발급 방식에 맞게 등록합니다(개발자센터 안내 참고).
3. **액세스 토큰**: OAuth 인증 절차로 발급되는 **Admin API access token** 입니다. 개발자센터의
   토큰 발급 절차(Authorization Code → Access Token)를 따르거나, 사내에서 이미 발급받은
   토큰을 사용합니다. ShopTalk의 *액세스 토큰* 칸에 붙여넣기.
   - 카페24 액세스 토큰은 **유효기간 2시간, 리프레시 토큰 14일**입니다. 만료 시 재발급이
     필요합니다(연결 테스트 `401` = 토큰 만료).
4. *클라이언트 ID/시크릿* 은 토큰 자동 갱신을 쓰지 않으면 비워두어도 연결됩니다(액세스 토큰만으로 검증).

> ShopTalk에는 **OAuth "Cafe24 연결" 버튼**(설정 상단 Cafe24 OAuth 카드)도 있어, 몰 대표
> 운영자 계정으로 클릭 한 번에 연결·토큰 자동관리가 가능합니다. 수동 토큰 입력이 번거로우면 그쪽을 권장합니다.

---

## 3. WooCommerce — "WooCommerce" 카드

**ShopTalk가 요구하는 값**

| ShopTalk 필드 | 값 | 필수 |
|---|---|---|
| 스토어 URL | `https://store.example.com` | ✅ |
| Consumer key | `ck_…` | ✅ |
| Consumer secret | `cs_…` | ✅ |

**어디서 확인하나 — WordPress/WooCommerce 관리자**

1. WordPress 관리자 → **WooCommerce → 설정(Settings)** → **고급(Advanced)** → **REST API**.
2. **키 추가(Add key)** 클릭.
3. 설명(Description) 입력, **사용자(User)** 선택, **권한(Permissions)** 은 **읽기(Read)** 로 지정.
4. **API 키 생성(Generate API key)** → **Consumer key(`ck_…`)** 와 **Consumer secret(`cs_…`)** 이
   표시됩니다. **이 화면을 벗어나면 다시 볼 수 없으므로** 즉시 복사해 ShopTalk에 붙여넣기.
5. **스토어 URL** 은 쇼핑몰 최상위 주소(`https://…`)입니다. `/wp-admin` 이나 `/wp-json` 을
   붙이지 마세요 — ShopTalk가 내부적으로 `…/wp-json/wc/v3/…` 로 호출합니다.

> 연결 테스트는 `…/wp-json/wc/v3/system_status` 를 호출합니다. 실패 시:
> `404`=REST API 비활성 또는 URL 오류(퍼머링크 설정 확인), `401`=키/시크릿 불일치.

---

## 4. Odoo — "Odoo" 카드  ⭐(요청 핵심)

**ShopTalk가 요구하는 값**

| ShopTalk 필드 | 값 | 필수 | 성격 |
|---|---|---|---|
| 서버 URL (`url`) | `https://my-odoo.example.com` | ✅ | 공개 |
| 데이터베이스 (`db`) | 데이터베이스 이름 | ✅ | 공개 |
| 사용자명 (`username`) | 로그인 이메일/아이디 | ✅ | 공개 |
| API 키 (`api_key`) | 개인 API 키 | ✅ | **시크릿** |

ShopTalk는 이 4개 값으로 Odoo 외부 API(`{url}/jsonrpc`)에 `common.authenticate(db, username,
api_key)` 를 호출해 검증합니다. 각각 아래에서 확인합니다.

### ① 서버 URL (`url`)
- Odoo에 접속하는 브라우저 주소의 **호스트 부분**입니다.
- **Odoo Online(SaaS)**: `https://회사이름.odoo.com`
- **자체 호스팅/Odoo.sh**: 실제 도메인 `https://odoo.mycompany.com`
- ⚠️ 반드시 `https://` 공개 도메인. 경로(`/web` 등)는 붙이지 마세요.

### ② 데이터베이스 이름 (`db`)  — "어디서 확인?"의 핵심
- **Odoo Online(SaaS)**: DB 이름 = 서브도메인. 즉 `회사이름.odoo.com` 이면 DB는 **`회사이름`**.
- **자체 호스팅**: 로그인 화면에서 데이터베이스를 고르는 드롭다운이 있으면 거기에 표시되는 이름.
  - 드롭다운이 없다면(단일 DB, `dbfilter` 적용): 주소창 `…/web/database/manager` 접속 시
    목록에 나오는 이름, 또는 서버 실행 옵션 `-d <db>` / `db_name` 설정값.
  - **개발자 모드**를 켜면(설정 → 개발자 도구 활성화) 화면 하단/설정에서 DB명이 노출되기도 합니다.
- 흔한 실수: 회사명·표시이름이 아니라 **실제 DB 식별자**를 넣어야 합니다(대소문자·하이픈 포함 정확히).

### ③ 사용자명 (`username`)
- Odoo **로그인 아이디**(대부분 이메일). API 호출도 이 사용자의 권한으로 수행됩니다.
- 최소한 **주문/연락처/상품 조회 권한**이 있는 계정을 사용하세요(전용 통합 계정 권장).

### ④ API 키 (`api_key`)  — Odoo 어디에서 발급?
1. Odoo 로그인 → 우측 상단 **아바타(프로필) → 내 프로필(My Profile / Preferences)**.
2. **계정 보안(Account Security)** 탭.
   - 항목이 안 보이면 **개발자 모드**를 켜세요: **설정(Settings) → (하단) 개발자 도구
     활성화(Activate the developer mode)**.
3. **API 키(Developer API Keys) → 새 API 키(New API Key)** → 용도 이름 입력(예: `ShopTalk`) →
   비밀번호 확인 → **생성된 키를 즉시 복사**.
   - **이 키는 생성 직후 한 번만 표시**됩니다. 다시 볼 수 없으니 바로 ShopTalk에 저장하세요.
   - 이 API 키는 외부 API(XML-RPC/JSON-RPC) 호출 시 **비밀번호 대신** 사용됩니다. 계정
     비밀번호를 직접 넣지 말고 반드시 API 키를 사용하세요(보안·2단계 인증 호환).

> 연결 테스트 성공 시 카드에 `Connected (uid N)` 가 표시됩니다(N = Odoo 내부 사용자 ID).
> 실패 시 `Odoo authentication failed — check db / user / API key` → 대개 **DB 이름 오타**가 원인입니다.

---

## 5. Haravan — "Haravan" 카드

**ShopTalk가 요구하는 값**

| ShopTalk 필드 | 값 | 필수 |
|---|---|---|
| 쇼핑몰 주소 | `your-store.myharavan.com` | ✅ |
| 액세스 토큰 | Admin API 액세스 토큰 | ✅ |

**어디서 확인하나 — Haravan 관리자**

1. **쇼핑몰 주소**: Haravan 관리자 접속 주소 `your-store.myharavan.com`.
2. **액세스 토큰**: Haravan 관리자의 **앱/개발(Apps)** 영역에서 **비공개 앱(Private App)** 또는
   Admin API 연동을 생성하고 발급되는 **Admin API access token** 을 사용합니다.
   - Haravan Admin API는 **Shopify 호환** 구조이며, ShopTalk는 `…/admin/shop.json` 을 Bearer
     토큰으로 호출해 검증합니다.
   - 주문·고객·상품 **읽기** 권한을 부여하세요.
3. 발급된 토큰을 ShopTalk의 *액세스 토큰* 칸에 붙여넣기 → 저장 → 연결 테스트.
   - `401` = 토큰 무효/만료.

---

## 연결 후

- 저장 → **연결 테스트**로 각 카드가 **연결됨** 상태인지 확인하세요.
- 연결 후 주문/상품 데이터 동기화는 각 카드의 동기화 기능 또는 예약 동기화로 수행됩니다.
- 값이 변경되면(토큰 재발급·비밀번호 변경 등) 시크릿 칸에 새 값을 다시 입력해 갱신하세요.

## 문제 해결 빠른 표

| 증상 | 원인 후보 | 조치 |
|---|---|---|
| `401` | 토큰/키 무효·만료 | 재발급 후 재입력 (Cafe24는 2h 만료) |
| `404` / `returned 404` | URL 오류·REST 비활성 | 스토어 URL·퍼머링크 확인 |
| `Blocked: …non-public address` | 사설/내부 URL | 공개 https 도메인 사용 |
| Odoo `authentication failed` | DB 이름 오타 | 데이터베이스 이름 재확인(§4-②) |
| `contain invalid characters` | 토큰에 공백/개행 포함 | 앞뒤 공백 없이 정확히 복사 |
