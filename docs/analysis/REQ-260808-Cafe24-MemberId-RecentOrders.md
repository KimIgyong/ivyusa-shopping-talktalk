# REQ-260808-Cafe24-MemberId-RecentOrders

Cafe24 customeraccesstoken **회원고유정보 + 아이디 확보 방식** 재점검 및
amoebaorder.cafe24.com 웹위젯 **"최근 주문 5건(30일 이내)" 인라인 표시** 요구사항 상세분석.

- 작성일: 2026-08-08
- 관련: PLN-260808-Cafe24-Customer-Identity.md(P-A2, 배포됨), PLN-260807-Cafe24-OAuth-Order-Sync.md(P-A1)
- 근거 문서: Cafe24 개발자센터 *General app → Develop → Customer (Member) Authentication*
  (`/app/front/app/develop/customeraccesstoken/{process,oauthcode,token,retoken,customeridentifier}`) — 2026-08-08 실사 확인

---

## 1. Cafe24 공식 문서 재확인 결과 (핵심)

### 1.1 인증 프로세스 (Authentication Process)
표준 OAuth 2.0. 몰 회원이 동의하는 항목은 **"회원고유정보(User Unique Identifier)"와 "아이디(Member ID)" 두 가지**이며, 동의 후에만 authorization code가 발급된다.

1. **인증코드 요청** — `GET https://{몰 대표도메인}/api/v2/oauth/authorize`
   - `response_type=code`, `client_id`, `state`(CSRF, 권장), `redirect_uri`(개발자어드민 등록값과 정확히 일치), `scope=mall.read_customer_identifier`
   - 미로그인 시 몰 로그인 화면 → 최초 1회 동의 화면("회원고유정보+아이디 제공") → code 리다이렉트
2. **토큰 발급** — `POST https://{몰 대표도메인}/api/v2/oauth/token` (`x-www-form-urlencoded`, Basic `client_id:secret`)
   - 요청: `grant_type=authorization_code`, `code`, `redirect_uri`
   - **응답 필드**: `access_token`(2시간), `refresh_token`(14일), `client_id`, `mall_id`,
     **`user_id` ← 회원 아이디(Member ID)**, `scopes`, `issued_at`, `shop_no`, `token_type=Bearer`
3. **토큰 재발급** — 동일 엔드포인트, `grant_type=refresh_token`. 응답에 역시 `user_id` 포함.
4. **회원고유정보 조회** — `GET https://{몰 대표도메인}/api/v2/customers/identifier`
   - 헤더 `Authorization: Basic {customer_access_token}` (토큰 원문)
   - 응답: `identifier.shop_no`, `identifier.user_identifier`
   - **`user_identifier` = (mall_id + shop_no + client_id + user_id) 조합으로 생성되는 고유 식별자** (문서 명시)

### 1.2 이번 재점검의 결정적 발견

> **회원 아이디(member_id = `user_id`)는 토큰 발급/재발급 응답에 이미 포함된다.**
> 즉 `mall.read_customer_identifier` 스코프만으로, **서버 검증된 회원 아이디**를 추가 API 호출 없이 확보할 수 있다.

이것이 기존 구현의 막힘(J-personal)을 해소한다:

| 항목 | 기존 이해 (P-A2 시점) | 문서 재확인 결과 |
|---|---|---|
| 회원고유정보(user_identifier) | `GET /customers/identifier`로 확보 ✅ | 동일. 단, **(mall+shop+client+user_id) 조합값**임이 명시됨 |
| 회원 아이디(member_id) | admin `/customersprivacy?member_id=` 조회에 필요, **`mall.read_personal` 스코프 필요(403 블로킹)** | **customer 토큰 응답의 `user_id`로 즉시 확보** — personal 스코프·심사 불필요 |
| 주문↔회원 매칭 | 주문 sync가 member_id→customersprivacy→user_identifier를 역조회해 stamp (J1) | 주문 payload의 `member_id` ↔ 로그인 세션의 `user_id`를 **직접 대조** 가능 |

보안 관점: `user_id`는 Cafe24 토큰 엔드포인트가 서버간(Basic client 인증) 응답으로 주는 값이므로
클라이언트 위조 불가 — P-A2에서 기각했던 "클라이언트 member_id 신뢰" 문제와 무관하다.

### 1.3 문서상 제약 (재확인)
- access token **2시간**, refresh token **14일** (회원 로그인 1회성 용도라 저장 불요 — 현행 유지)
- redirect_uri는 개발자어드민 등록값과 정확히 일치해야 함 (현행 공유 콜백 `/auth/cafe24/callback` 유지)
- `scope`는 `mall.read_customer_identifier` 단일 (문서 오류코드: scope 불일치 시 `invalid_scope`)
- 대표 운영자 외 부운영자 계정으로 요청 시 `access_denied`
- (admin API 측, 실측) 주문 조회 date range 최대 3개월, leaky-bucket 40콜

---

## 2. AS-IS (현행 구현: main @ acd8c4c)

### 2.1 로그인/신원 (P-A2 — 정상 동작 중)
- `Cafe24CustomerAuthService` (`apps/api/src/domain/cafe24/cafe24-customer-auth.service.ts`)
  authorize → token → `GET /customers/identifier` → `user_identifier` → customer 행 바인딩 → 위젯 세션 + 1회용 ticket.
  redirect/popup 두 모드 검증 완료.
- **갭 A**: `exchangeCode()`(:214-238)가 토큰 응답에서 `access_token`만 파싱 — **`user_id`(회원 아이디)를 버린다.**

### 2.2 주문 동기화 (P-A1)
- `Cafe24SyncService.syncOrders()` — lookback 기본 7일(로그인 백필은 90일 캡), 페이지 100×20.
- `upsertOrder()`가 회원 매칭을 위해 **주문마다(멤버당 1회) admin `/customersprivacy` 호출** → `mall.read_personal` 미허용으로 **403 → userIdentifier 항상 null** → 이메일 없는 회원 주문은 customer 연결 실패.
- **갭 B**: `orders_cache`에 **`member_id` 미저장** (payload에 존재하는데 버림), **주문일(`order_date`) 미저장** — `created_at`=sync 시각으로 정렬/표시됨. 백필하면 3개월 전 주문이 "오늘"로 보임.
- **갭 C**: `order_items` 미저장 → 위젯 itemCount 항상 0, 상세 품목 빈 배열.

### 2.3 위젯 "내 주문" 읽기 경로
- `GET /orders` (`OrderService.listForSession`) — `customerId`만 필터, `createdAt DESC`, 기본 20건.
- **갭 D**: **날짜 윈도우 없음, 5건 제한 없음, 주문일 정렬 불가**(컬럼 부재). provider 필터도 없음.
- 위젯 `OrdersTab`: 로그인 시 목록 + 결제/배송/문의 서브탭, PR #164 "쇼핑몰에서 전체 주문 보기" 딥링크(`/myshop/order/list.html`).
- **갭 E**: 딥링크가 iframe `shop` 파라미터(`data-shop` 스니펫 속성) 의존 — Cafe24 몰에서 `data-shop` 미설정 시 `window.location.hostname` fallback이 없어 링크가 조용히 미표시.

### 2.4 환경변수 (staging)
`CAFE24_SCOPES=mall.read_order,mall.read_product,mall.read_customer,mall.read_personal`(admin, personal은 미허용 상태),
`CAFE24_CUSTOMER_SCOPES=mall.read_customer_identifier`, `CAFE24_LOGIN_SYNC_LOOKBACK_DAYS`(기본 90, 캡 90).

---

## 3. TO-BE (요구사항)

**FR-1. 회원 아이디 확보**: customer 토큰 교환 시 응답의 `user_id`를 회수하여
customer 행에 `cafe24_member_id`로 stamp한다 (user_identifier 바인딩은 현행 유지 — 이중 키).

**FR-2. 주문↔회원 매칭을 member_id 직결로 전환**: 주문 sync가 `orders_cache.member_id`(신설)를
저장하고, 링크 우선순위 ① `cafe24_member_id` 일치 customer ② 이메일(현행 linkCafe24Customer) ③ 미연결(추후 로그인 시 소급 연결).
로그인 콜백에서 member_id stamp 직후 **소급 연결**(해당 tenant+member_id의 미연결 주문 → customer_id UPDATE).
→ **admin `/customersprivacy` 호출(=mall.read_personal 의존)을 크리티컬 패스에서 제거**한다.

**FR-3. 주문일 보존**: `orders_cache.ordered_at`(신설)에 Cafe24 `order_date` 저장. 목록 정렬·표시는
`COALESCE(ordered_at, created_at)` 기준(기존 Shopify 행 호환).

**FR-4. 위젯 인라인 "내 주문" = 최근 30일 이내, 최대 5건**: `GET /orders`에 날짜 윈도우
파라미터(`days`, 1~90 검증)를 추가하고 위젯이 `size=5&days=30`으로 호출. 주문일 내림차순.
5건 초과분/30일 초과분은 기존 딥링크("쇼핑몰에서 전체 주문 보기")로 유도 — 인라인+링크 병행(사용자 기결정).

**FR-5. 로그인 백필 효율화**: 인라인 노출 창이 30일이므로 로그인 백필 lookback 기본 90→**30일**
(env로 확장 가능, 캡 90 유지). API 콜 예산(40) 절약.

**FR-6. 딥링크 fallback**: embed.js가 Cafe24 호스트에서 `data-shop` 미설정 시
`window.location.hostname`으로 `shop`을 보완해 딥링크가 항상 렌더되도록 한다.

**(FR-7, 선택)** `order_items` 저장(갭 C)은 이번 범위에서 **제외** 가능 — 인라인 5건 표시에 품목 수가
0으로 나오는 표시 품질 이슈. 포함 여부는 PLN에서 옵션으로 제시.

## 4. 사용자 플로우 (TO-BE)

```
몰 방문(비로그인 위젯)             몰 회원 로그인(위젯 로그인 버튼)
   │                                  │ authorize(consent: 고유정보+아이디)
   │                                  ▼
   │                        token 응답 { access_token, user_id=회원아이디 }
   │                                  │ GET /customers/identifier → user_identifier
   │                                  ▼
   │                 customer 행: cafe24_user_identifier + cafe24_member_id stamp
   │                                  │ ① 미연결 주문 소급 연결(member_id 일치)
   │                                  │ ② 백필 sync(30일) — member_id 저장·직결 링크
   │                                  ▼
   └──────────────▶ 위젯 주문탭: GET /orders?size=5&days=30
                     → 최근 30일 주문 5건(주문일 역순) + "쇼핑몰에서 전체 주문 보기" 링크
```

## 5. 제약/전제
- Cafe24 admin 주문조회 date range ≤ 3개월, leaky-bucket 40콜/버킷 — 백필 30일이면 여유.
- `mall.read_personal` 심사/허용 **불필요**해짐 (J-personal 해소). env의 해당 스코프는 정리 대상.
- 스테이징 `DB_SYNCHRONIZE=false` — 컬럼 신설은 `sql/` 사전 수동 적용 필수.
- 기존 Cafe24 주문 행(member_id/ordered_at NULL)은 재sync(upsert)로 자연 백필됨.
- redirect_uri 1개 등록 제약 → 공유 콜백 구조 변경 없음.

## 6. 갭 요약

| # | 갭 | 심각도 | 해소 방법 |
|---|---|---|---|
| A | 토큰 응답 `user_id` 폐기 | 핵심 | exchangeCode 반환 확장 + customer stamp |
| B | orders_cache member_id·주문일 미저장 | 핵심 | 컬럼 2개 신설 + sync 저장 |
| D | /orders 날짜윈도우·5건 제한 없음 | 핵심 | days 파라미터 + 위젯 size=5&days=30 |
| (B') | customersprivacy 403 의존 | 핵심 | member_id 직결로 대체, 호출 제거 |
| E | 딥링크 data-shop 의존 | 소 | embed.js hostname fallback |
| C | order_items 미저장 | 선택 | PLN 옵션 |
