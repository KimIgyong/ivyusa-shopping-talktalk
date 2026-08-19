# PLN-260819-Embed-SDK-Foundations

임베드 SDK의 **토대 3단계**(S1 오리진 허용목록 · S2 범용 서명 신원 · S3 공개 JS API·런타임 설정) 구현 계획.

- 작성일: 2026-08-19
- 근거 요구: `docs/analysis/REQ-260819-Widget-Theming-Embed-SDK.md` (FR-S1~S4, S7)
- 기준 코드: `origin/main` `9c3404d`
- 범위 결정(사용자, 2026-08-19): **S1~S3 선행분만.** 테마 확장(S4)·배포 패키지(S5)·모바일(S6)은 별도 PLN
- **UI 변경 있음** → §5 와이어프레임
- **스키마 변경 있음** → §7 마이그레이션

---

## 0. 왜 이 셋이 먼저인가

테마 확장이 눈에 보이는 성과지만, **런처 커스터마이즈는 로더(iframe 바깥)가 테마를 알아야
가능**하다. 즉 로더 개편(S3)이 테마 확장의 선행이다. 그리고 로더를 공개 SDK로 내보내는 순간
**"도메인 값만 알면 남의 테넌트 위젯이 뜨는"** 현재 상태(REQ G-1)가 노출 면적과 함께 커진다.
그래서 순서는 안전장치(S1) → 신원(S2) → 표면(S3)이다.

---

## 1. 설계 개요 — 3층

```
고객사 페이지 (www.go2joy.vn)
  │
  │ <script src="…/v1/embed.js">  +  ShopTalk.init({ key, apiBase })      ← S3
  │ ShopTalk.identify({ userId, hash })                                    ← S2
  ▼
로더 embed.js  ── 부모 오리진 확인 ──▶ 허용목록에 없으면 렌더 거부          ← S1
  │  (postMessage 프로토콜: 기존 그대로 + ivy:identify)
  ▼
위젯 iframe  ── /widget-config.json 로 API 주소 런타임 수신 ──▶ 빌드 1개    ← S3
  │
  ▼
API  ── POST /session/ensure { parent_origin }  → 오리진 게이트(관측→차단)   ← S1
     ── POST /public/embed/identify { hash }    → HMAC 검증 → 고객 바인딩    ← S2
```

---

## 2. S1 — 오리진 허용목록

### 2.1 저장

`tenants.embed_origins` **JSON 컬럼**(`string[] | null`). 테이블을 새로 만들지 않는 이유는
이 리포가 위젯 설정을 이미 JSON으로 다루고 있고(`widget_tabs`·`widget_copy`·
`notification_channels`), 조회가 항상 "테넌트 확정 후 대조"라 인덱스가 필요 없기 때문이다.

**NULL은 "미설정"이며 빈 배열이 아니다** — `widget_tabs`와 같은 규약이다. NULL일 때는
**`shop_domain`과 `storefront_url`에서 유도한 기본 허용목록**을 쓴다. 백필 없이도 자기
스토어프론트는 항상 허용되고, 새 컬럼이 기존 4개 테넌트를 끊지 않는다.

형식: `https://host` 또는 `https://*.example.com`(서브도메인 1단 와일드카드). 스킴·호스트만
비교하고 경로·포트 정책은 다음과 같다 — 포트는 명시된 경우에만 일치를 요구한다(로컬 개발).

### 2.2 두 지점에서 막는다

| 지점 | 무엇을 | 실패 시 |
|---|---|---|
| 로더/위젯 | `window.location.ancestorOrigins`(지원 시) 또는 로더가 보고한 `window.location.origin` | 위젯을 **렌더하지 않고** 콘솔에 진단 메시지 1줄 |
| API | `POST /session/ensure`에 `parent_origin` 추가 → 테넌트 허용목록과 대조 | **E5047** 거부 (관측 모드에서는 통과 + `warn`) |

### 2.3 ⚠️ 이 장치의 한계를 먼저 적는다

**오리진 허용목록은 위조 방지 수단이 아니다.** `parent_origin`은 클라이언트가 보내는 값이고,
`curl`은 무엇이든 보낼 수 있다. 이것이 실제로 막는 것은 **브라우저에서의 무단 임베드와
오배치**다. 위조·남용에 대한 방어는 다른 두 가지가 담당한다:

- **레이트리밋**: `session/ensure`는 현재 `@SkipThrottle`이다(스토어프론트 페이지마다 호출되므로).
  오리진 게이트를 켜면서 **오리진·IP 단위 상한**을 별도로 둔다.
- **서명 신원(S2)**: "이 사용자가 진짜 그 고객사의 로그인 사용자인가"는 HMAC만이 답한다.

이 문단을 계획서에 남기는 이유는, 허용목록을 보안 경계로 착각한 채 그 위에 기능을 얹는 것이
가장 위험하기 때문이다.

### 2.4 관측 → 차단 (2단 전개)

`EMBED_ORIGIN_ENFORCE`(기본 `false`)로 시작한다. 관측 모드에서는 위반을 **통과시키되
`warn` 로그**로 남긴다 — 4xx는 기본적으로 서버 로그에 남지 않으므로(CLAUDE.md §2) 이 로그가
유일한 근거다. 스테이징에서 실제 임베드 지점을 며칠 관측해 오탐이 0인 것을 확인한 뒤 켠다.

---

## 3. S2 — 범용 서명 신원

### 3.1 흐름

```
고객사 서버                      고객사 페이지                ShopTalk API
─────────                        ───────────                 ───────────
secret 보관                       ShopTalk.identify({
hash = HMAC_SHA256(               userId, hash, name?, email? })
  secret, userId)         ──▶     └── ivy:identify ──▶ POST /public/embed/identify
                                                        { session_token, user_id, hash, … }
                                                            │
                                                            ├─ HMAC 재계산·상수시간 비교
                                                            ├─ customers(tenant, external_id) upsert
                                                            └─ session.identityLevel = 'verified'
```

- **시크릿**: `tenants.embed_secret`(암호화 저장, `crypto.util`의 AES-256-GCM — 메신저 채널
  자격증명과 같은 방식). 콘솔에서 **생성 직후 1회만 평문 노출**, 이후 마스킹 + 회전 버튼.
- **해시 입력은 `userId` 하나**(Intercom 계열 관행). 타임스탬프를 넣으면 고객사 서버가 매 요청
  서명해야 하고, 캐시된 페이지에서 만료가 되어 사용자가 조용히 로그아웃된다.
- **프로필(name/email/phone)은 서명 대상이 아니다** — 서명은 "이 userId가 맞다"만 보증하고,
  프로필은 참고값으로 저장한다. 이 구분을 코드 주석과 문서에 남긴다.

### 3.2 고객 레코드

`customers`는 지금 플랫폼별 키만 갖는다(`shopify_customer_id`, `cafe24_user_identifier`,
`cafe24_member_id`, 각각 `unique(tenant_id, …)`). 범용 신원을 위해 **`external_customer_id`**를
추가하고 `unique(tenant_id, external_customer_id)`를 건다 — 기존 3개 키와 같은 패턴이다.

기존 Shopify·Cafe24 경로는 **그대로 둔다.** 범용 신원은 추가이지 대체가 아니며, 회귀가 나면
ivyusa·amoebaorder의 로그인 연동이 통째로 흔들린다.

### 3.3 실패는 조용하지 않게

| 상황 | 응답 | 사용자에게 |
|---|---|---|
| 서명 불일치 | **E5048** | 위젯은 게스트로 계속 동작(대화는 가능) + 콘솔 진단에 "신원 서명 오류" |
| 시크릿 미설정 | E5048 | 동상 |
| `userId` 누락 | E1101(검증) | 동상 |

**로그인 실패로 대화 자체를 막지 않는다** — 신원은 주문 조회 같은 기능의 전제이지, 문의의 전제가 아니다.

---

## 4. S3 — 공개 JS API + 런타임 설정

### 4.1 API 표면

```js
ShopTalk.init({ key, apiBase?, widgetUrl?, locale?, autoOpen? })
ShopTalk.identify({ userId, hash, name?, email?, phone? })
ShopTalk.logout()                  // 세션 폐기 → 새 게스트
ShopTalk.open(tab?)                // 'chat' | 'orders' | 'notifications'
ShopTalk.close() / toggle()
ShopTalk.setLocale('vi')
ShopTalk.on('ready'|'open'|'close'|'unread'|'identified', fn) / off(...)
ShopTalk.version                   // 로더 버전
```

**하위호환 필수**: `window.IVY_WIDGET_CONFIG` + 자동 마운트는 지금 ivyusa·amoebaorder
스토어프론트에 설치되어 있다. `init()`이 없으면 **기존 동작 그대로** 부팅한다.

### 4.2 런타임 설정 — 빌드타임 상수 제거

현재 `VITE_API_BASE_URL`이 번들에 인라인된다(`api-client.ts:4`) → 고객사마다 별도 빌드.
번들 옆에 `widget-config.json`을 두고 **부팅 시 1회 읽는다**(`no-store`).

```json
{ "apiBase": "https://talk.ivyusa.com/api/v1", "ga4Id": null }
```

URL 파라미터로 API 주소를 받지 않는다 — 임의 오리진을 주입할 수 있는 표면을 만들 이유가 없다.
`init({ apiBase })`가 주는 값은 **로더가 iframe URL에 실어 보내는 것이 아니라** 로더 자신의
호출에만 쓰고, 위젯은 항상 자기 옆의 설정 파일을 신뢰한다.

### 4.3 버전 경로

`/v1/embed.js`로 서빙하고 `Cache-Control: public, max-age=300`을 준다. 고객사 페이지는
버전 경로를 붙여 설치하므로, 우리가 위젯을 갈아도 로더 계약은 깨지지 않는다.

---

## 5. 와이어프레임 (콘솔 UI 신규)

### 5.1 설정 → 임베드 (신규 카드)

```
┌─ 임베드 · SDK ───────────────────────────────────────────────┐
│                                                              │
│ 설치 코드                                          [복사]    │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ <script src="https://talk.ivyusa.com/v1/embed.js"        │ │
│ │         defer></script>                                  │ │
│ │ <script>ShopTalk.init({ key: "ivyusa" });</script>        │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ 허용 도메인                                                  │
│  이 도메인에서만 위젯이 뜹니다. 비워두면 스토어 도메인만 허용.│
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ https://www.ivyusa.com                          [삭제]   │ │
│ │ https://*.ivyusa.com                            [삭제]   │ │
│ └──────────────────────────────────────────────────────────┘ │
│ [+ 도메인 추가]                                              │
│                                                              │
│ 로그인 연동 (선택)                                           │
│  고객사 서버에서 사용자 ID를 서명해 보내면, 위젯이 로그인한   │
│  사용자를 알아봅니다.                                         │
│  시크릿  ••••••••••••••••••••••••  [재발급]  [설명 보기]     │
│                                                              │
│ 상태:  ● 설치됨 (마지막 확인 2분 전) · 신원 서명 정상         │
└──────────────────────────────────────────────────────────────┘
```

### 5.2 시크릿 재발급 확인

```
┌─ 시크릿을 재발급할까요? ─────────────────────────────┐
│ 기존 시크릿으로 만든 서명은 즉시 무효가 됩니다.       │
│ 고객사 서버의 값을 바꾸기 전까지 로그인 연동이        │
│ 끊기고, 방문자는 게스트로 표시됩니다.                 │
│                              [취소]  [재발급]         │
└───────────────────────────────────────────────────────┘
```

### 5.3 생성 직후 1회 노출

```
┌─ 새 시크릿 ──────────────────────────────────────────┐
│ shtk_live_8f3a…  (전체)                     [복사]   │
│ ⚠ 이 화면을 닫으면 다시 볼 수 없습니다.               │
│                                        [확인]         │
└───────────────────────────────────────────────────────┘
```

---

## 6. 부수영향 분석

| # | 영역 | 영향 | 대응 |
|---|---|---|---|
| 1 | 기존 스토어프론트 설치분 | ivyusa·amoebaorder는 `IVY_WIDGET_CONFIG`로 이미 설치돼 있다 | 하위호환 경로 유지 + 회귀 테스트(§8 I-1) |
| 2 | `session/ensure` | 위젯 부팅마다 호출되는 최다 경로 | `parent_origin`은 **선택 필드**. 없으면 관측 모드와 동일하게 통과 |
| 3 | 레이트리밋 | `ensure`는 `@SkipThrottle` | 오리진·IP 단위 상한을 **별도로** 추가(전역 스로틀을 되돌리지 않는다) |
| 4 | Shopify App Proxy / Cafe24 티켓 | 신원 경로 2종 기존재 | 손대지 않는다. `identify()`는 세 번째 경로 |
| 5 | `customers` 유니크 키 | 4번째 키 추가 | NULL 허용 + `unique(tenant_id, external_customer_id)` — 기존 3키와 동일 패턴 |
| 6 | PII | 프로필(name/email/phone)이 새 경로로 유입 | 기존 `piiTransformer`(AES-GCM) + `email_hash` 그대로 태운다 |
| 7 | 위젯 번들 | 빌드타임 상수 제거 | `widget-config.json` 부재 시 **동일 오리진 `/api/v1`** 폴백 → 기존 배포도 그대로 동작 |
| 8 | nginx | `/v1/embed.js` 경로와 설정 파일 캐시 정책 | staging `nginx.widget.conf` 수정 |
| 9 | 시크릿 노출 | 콘솔에 평문 1회 | 감사 로그(`AuditService.write`)에 발급·회전 기록 |
| 10 | 문서 | 설치 가이드가 없다 | 고객사 개발자용 설치 문서 신규(FR-S5 준비) |

---

## 7. 마이그레이션

```sql
-- sql/migration_embed_sdk.sql
ALTER TABLE tenants
  ADD COLUMN embed_origins JSON NULL,
  ADD COLUMN embed_secret VARBINARY(512) NULL;

ALTER TABLE customers
  ADD COLUMN external_customer_id VARCHAR(120) NULL,
  ADD UNIQUE KEY uq_customers_tenant_external (tenant_id, external_customer_id);
```

**순서**: 스테이징 DB에 위 SQL을 **먼저** 적용 → 코드 배포(kit 04 §3). 구 코드 + 새 컬럼은
안전하고, 새 코드 + 구 스키마는 500이다. PR 본문에 `## Migration` 섹션 필수.

---

## 8. 테스트 개요 (상세는 TCR)

**단위**
- U-1 오리진 매칭: 정확 일치 / 서브도메인 와일드카드 / 스킴 불일치 거부 / 포트 규칙
- U-2 NULL 허용목록 → `shop_domain`·`storefront_url` 유도값
- U-3 관측 모드: 위반이 통과하되 `warn` 1줄
- U-4 차단 모드: 위반 → E5047
- U-5 HMAC 검증: 정상 / 변조 / 시크릿 미설정 / 상수시간 비교
- U-6 `identify` 재호출(같은 userId) → 고객 1건만 생성
- U-7 프로필은 서명 대상이 아님 — 프로필만 바꾼 요청도 통과
- U-8 하위호환: `IVY_WIDGET_CONFIG`만 있고 `init()` 없음 → 기존과 동일 부팅
- U-9 `widget-config.json` 부재 → 동일 오리진 폴백

**통합**
- I-1 **회귀**: Shopify App Proxy 신원 / Cafe24 티켓 신원이 그대로 동작
- I-2 `identify` → 주문 탭이 그 사용자의 주문을 보여준다
- I-3 `logout()` → 세션 교체, 이전 대화가 새 게스트에 보이지 않는다
- I-4 허용되지 않은 도메인에서 임베드 → 위젯이 렌더되지 않음

**스모크(스테이징)**
- S-1 기존 amoebaorder 몰에서 위젯 정상(무회귀) — 가장 중요한 항목
- S-2 관측 모드 로그로 실제 임베드 오리진 수집 → 오탐 0 확인 후 차단 전환
- S-3 테스트 페이지에서 `identify()` → 콘솔 대화 목록에 식별된 사용자로 표시
- S-4 시크릿 회전 → 구 서명 거부, 신 서명 통과

---

## 9. 배포 · 롤백

- SQL 선적용 → 코드 배포 → 부팅 로그 + 새 라우트 상태코드(401/404/502 판별)
- `EMBED_ORIGIN_ENFORCE=false`로 **관측 모드 배포**가 기본. 차단은 별도 결정으로 켠다
- 롤백: `EMBED_ORIGIN_ENFORCE=false`(오리진 게이트 무력화). 신원·SDK 표면은 **추가 기능**이라
  기존 경로에 영향이 없어 코드 롤백 없이 무시된다
- 컬럼은 남겨도 무해(NULL) — 되돌릴 때 DROP 하지 않는다

---

## 10. 승인 요청

| 항목 | 계획값 |
|---|---|
| 범위 | S1 오리진 허용목록 · S2 범용 서명 신원 · S3 공개 API·런타임 설정 |
| 저장 | `tenants.embed_origins`(JSON) · `tenants.embed_secret`(암호화) · `customers.external_customer_id` |
| 신규 에러코드 | **E5047** 오리진 거부 · **E5048** 신원 서명 오류 (E5045·E5046은 Cafe24 몰 바인딩이 선점) |
| 전개 | 오리진 게이트는 **관측 모드로 먼저**, 실측 후 차단 |
| 하위호환 | `IVY_WIDGET_CONFIG` 자동 마운트, Shopify·Cafe24 신원 경로 무변경 |
| 마이그레이션 | `sql/migration_embed_sdk.sql` **선적용 필요** |
| 비범위 | 테마 확장·배포 패키지·모바일 SDK·npm 패키지(다음 PLN) |

위 내용으로 **구현 착수 승인**을 요청합니다. (승인 전 착수 없음 — CLAUDE.md §7)

---

## 11. 관련 문서

- `docs/analysis/REQ-260819-Widget-Theming-Embed-SDK.md` — 본 계획의 요구·판정
- `docs/analysis/REQ-260808-Cafe24-MemberId-RecentOrders.md` — Cafe24 신원 연동 제약
- `docs/analysis/REQ-260813-AMA-Iframe-SSO.md` — iframe 임베드·`frame-ancestors` 선례
