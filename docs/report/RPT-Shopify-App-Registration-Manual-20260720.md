# RPT — Shopify 앱 등록 진행매뉴얼 & 체크리스트

- **문서 ID**: RPT-Shopify-App-Registration-Manual-20260720
- **작성일**: 2026-07-20
- **대상**: IVY USA Chat & Support Widget (쇼핑톡) — Shopify 앱 등록
- **관련 문서**: `SPEC.md` §14 · `docs/guide/쇼피파이앱설정개발가이드_Shopify-App-Setup.{ko,en}.md` · `docs/guide/쇼피파이연동가이드_Shopify-Integration.{ko,en}.md` · `docs/report/RPT-Security-Privacy-Performance-Review-20260718.md` · `secrets/staging-server.md`(gitignored)

---

## 1. 요약 (TL;DR)

| 구분 | 상태 |
|---|---|
| Partner 앱 생성 + 스테이징 연동 (`SHOPIFY_API_KEY` 등 설정) | ✅ 완료 |
| OAuth 설치 플로우 (state/HMAC 검증, 토큰 교환·암호화 저장) | ✅ 구현 완료 |
| GDPR 필수 웹훅 3종 (`customers/data_request`, `customers/redact`, `shop/redact`) | ✅ 구현 완료 (HMAC fail-closed) |
| 주문/풀필먼트 웹훅 + 증분 동기화 | ✅ 구현 완료 |
| App Proxy 신원 브리지 (`/apps/ivy/identity`) | ✅ 백엔드 구현 완료 / Partner 대시보드 활성화 **미완** |
| Partner 대시보드 수동 설정 (Redirect URL, OAuth 승인, Protected customer data, App Proxy) | ⬜ **남은 즉시 작업 4건** |
| App Store 공개 등록 요건 (GraphQL 전용, Theme App Extension, App Bridge, Billing 등) | ⬜ **갭 존재 — §5 참조** |

**결론**: “특정 스토어에 설치해 운영”(비공개/custom 배포)까지는 **Partner 대시보드 수동 설정 4건**만 남았다. **App Store 공개 등록**을 목표로 하면 §5의 기술 갭(특히 REST→GraphQL 마이그레이션, Theme App Extension)을 먼저 해소해야 한다.

---

## 2. 현재 진행상황 (코드 기준 증빙)

### 2.1 구현 완료 항목

| 항목 | 증빙 (파일:라인) |
|---|---|
| OAuth 설치/콜백 엔드포인트 `GET /auth/shopify/install`·`/callback` | `apps/api/src/domain/shopify-oauth/shopify-oauth.controller.ts:16,24` |
| state 논스(Redis 600s TTL)·쿼리 HMAC 검증·코드→토큰 교환 | `shopify-oauth.service.ts:52-111`, `global/util/shopify-hmac.util.ts:45-60` |
| GDPR 웹훅 3종 (HMAC 검증 후 처리, `shop/redact`=테넌트 전체 삭제) | `apps/api/src/domain/privacy/privacy.controller.ts:34-61`, `privacy.service.ts:96-166` |
| 주문/풀필먼트 웹훅 4종 (`orders/create·updated`, `fulfillments/create·update`) | `apps/api/src/domain/order/shopify-order-webhook.controller.ts:18-45` |
| 웹훅 HMAC — raw body 기반, timing-safe, 운영환경 **fail-closed** (SEC-C1) | `shopify-hmac.util.ts:13-39` |
| 웹훅 자동 등록 API (`POST webhooks.json`) | `shopify-sync.service.ts:120-163` |
| 주문 증분 동기화(cursor 페이지네이션) + 스케줄 동기화 | `shopify-admin.client.ts:57-98`, `scheduled-shopify-sync.service.ts` |
| 자격증명 AES-256-GCM 암호화 저장 (`integration_credentials`, `CRED_ENC_KEY`) | `tenant/entity/integration-credential.entity.ts`, `global/util/crypto.util.ts:18-33` |
| App Proxy 서명 검증 + 신원 핸드셰이크 백엔드 | `shopify-proxy/shopify-proxy.controller.ts`, `shopify-hmac.util.ts:70-89` |
| 위젯 임베드 3방식 (App embed 안내 / ScriptTag / theme.liquid 수동 스니펫) + 관리자 UI | `apps/widget/public/embed.js`, `apps/web/src/domain/settings/SettingsPage.tsx:116-176` |
| 테넌트=쇼핑몰 모델 (`shop_domain` unique), 수동 토큰 입력 경로 병행 | `tenant/entity/tenant.entity.ts`, `tenant.service.ts:145-174` |
| 스테이징 HTTPS (`https://shoptalk.amoeba.site`, Let's Encrypt ~2026-09-28) | `CONFIG.md:43-45,169` |

> 참고: `CLAUDE.md` §6에 아직 "Shopify GDPR webhooks"가 미해결 갭으로 남아 있으나 **이는 구식 정보**다. 2026-06-19 감사 이후 구현 완료되었고 `SPEC.md:338`이 이를 확인한다.

### 2.2 스테이징 등록 진행상태

- Partner 앱 생성 완료, 스테이징 서버에 `SHOPIFY_API_KEY`/`SHOPIFY_API_SECRET`/`SHOPIFY_WEBHOOK_SECRET`/`SHOPIFY_APP_URL=https://shoptalk.amoeba.site` 설정 완료.
- 테스트 스토어: `ambshopi.myshopify.com`.
- `/auth/shopify/install` 호출 시 authorize URL로 302 정상 확인, 웹훅 무서명 요청 401 차단 확인.
- 세부 계정/값: `secrets/staging-server.md` (gitignored — 커밋 금지).

### 2.3 미구현 / 갭

| 항목 | 상태 | 영향 |
|---|---|---|
| `shopify.app.toml` / Shopify CLI 구성 | ❌ 없음 | Theme App Extension 배포(`shopify app deploy`) 불가 |
| `@shopify/*` npm 의존성, App Bridge, 임베디드 관리자 | ❌ 없음 | 관리 콘솔이 외부 standalone 웹 (공개 심사 시 검토 필요) |
| Theme App Extension (app-embed 블록) | ❌ 없음 (미체크 TODO: `docs/guide/쇼피파이연동가이드_Shopify-Integration.en.md:333`) | Online Store 카테고리 공개 심사에서 ScriptTag 방식은 거절 사유 |
| Admin API: **REST `2024-10`** 사용 (`shopify-admin.client.ts:3`) | ⚠️ 레거시 | 신규 공개 앱은 **GraphQL Admin API 전용** 필수 → 공개 등록 시 마이그레이션 필요 |
| Billing API | ❌ 없음 | 유료 공개 앱이면 Shopify Billing 필수 (무료 앱이면 불필요) |

---

## 3. 등록 경로 선택

| 경로 | 용도 | 남은 작업 |
|---|---|---|
| **A. Custom 배포 (비공개)** | 특정 머천트(들)에게 설치 링크로 직접 배포. 심사 없음 | §4만 완료하면 됨 — **최단 경로** |
| **B. App Store 공개 등록** | 모든 Shopify 머천트 대상 배포. 심사 2~4주 | §4 + §5 + §6 전부 |

멀티테넌트 SaaS가 최종 목표이므로 B가 종착점이지만, A로 먼저 운영 검증 후 B를 진행하는 순서를 권장한다.

---

## 4. [즉시] Custom 배포 완료 매뉴얼 — Partner 대시보드 수동 설정 4건

모두 Partner 대시보드(https://partners.shopify.com) → Apps → 해당 앱에서 진행. 코드 변경 불필요.

### Step 1 — Allowed redirection URL 등록
1. **Configuration → URLs** 이동.
2. App URL: `https://shoptalk.amoeba.site`
3. **Allowed redirection URL(s)**에 추가: `https://shoptalk.amoeba.site/api/v1/auth/shopify/callback`
4. 저장.

### Step 2 — App Proxy 활성화
1. **Configuration → App proxy** 이동.
2. Subpath prefix: `apps` / Subpath: `ivy`
3. Proxy URL: `https://shoptalk.amoeba.site/api/v1/shopify/proxy`
4. 저장 → 스토어프런트에서 `https://{shop}/apps/ivy/identity`가 백엔드로 서명·전달되는지 확인.

### Step 3 — Protected customer data access 신청
1. **API access → Protected customer data access** 이동.
2. `read_customers` 사용 목적 선언 (고객 문의 응대·주문 조회 지원). 필요 데이터 필드(이름, 이메일 등)와 사유 입력.
3. 데이터 보호 설문(암호화 저장, 보존/삭제 정책) 작성 — 근거: AES-256-GCM 저장(`crypto.util.ts`), DSAR/redact 구현(`privacy.service.ts`), 보존 스케줄러(Sprint-2).
4. 승인 전에는 dev store에서만 고객 데이터 접근 가능하므로 조기 신청 권장.

### Step 4 — OAuth 설치 승인 (E2E 검증)
1. 브라우저에서 `https://shoptalk.amoeba.site/api/v1/auth/shopify/install?shop=ambshopi.myshopify.com` 접속.
2. Shopify 승인 화면에서 scope(`read_orders,read_customers`) 확인 후 **Install**.
3. 콜백 성공 → 테넌트 upsert + 토큰 암호화 저장 확인 (`integration_credentials`에 provider=`shopify` 행).
4. 관리 콘솔 Settings → Shopify 카드에서 **Test**(shop.json 조회) → **Sync** → **Register webhooks** 순으로 실행.
5. 테스트 주문 생성 → `orders/create` 웹훅 수신 및 `orders_cache` 반영 확인.
6. 스토어 테마에 위젯 설치(ScriptTag 또는 스니펫) → 위젯 로드 + `/apps/ivy/identity` 신원 핸드셰이크 확인.

### 검증 체크리스트 (Custom 배포)
- [ ] Redirect URL 등록 후 OAuth 설치 성공 (302 → 승인 → 콜백 200)
- [ ] `integration_credentials`에 암호화 토큰 저장 확인
- [ ] Test/Sync/Register-webhooks 3버튼 정상
- [ ] GDPR 웹훅 3종: Partner 대시보드 **Compliance webhooks**에 URL 등록
  - `https://shoptalk.amoeba.site/api/v1/webhooks/shopify/customers/data_request`
  - `https://shoptalk.amoeba.site/api/v1/webhooks/shopify/customers/redact`
  - `https://shoptalk.amoeba.site/api/v1/webhooks/shopify/shop/redact`
- [ ] 무서명/오서명 웹훅 요청 401 차단 재확인 (fail-closed)
- [ ] App Proxy 신원 핸드셰이크로 위젯 세션 발급 확인
- [ ] Protected customer data 신청 제출

---

## 5. [공개 등록 전] 기술 갭 해소 로드맵

App Store 심사 통과를 위해 코드 작업이 필요한 항목. 우선순위순.

### G1. REST → GraphQL Admin API 마이그레이션 (필수, 최우선)
- 신규 공개 앱은 GraphQL Admin API **전용** 심사 (REST는 레거시 판정).
- 대상: `shopify-admin.client.ts`의 `orders.json`(→ `orders` query + cursor), `webhooks.json`(→ `webhookSubscriptionCreate`), `tenant.service.ts:211`의 `shop.json`(→ `shop` query).
- 증분 동기화(`updated_at_min`)는 GraphQL `query: "updated_at:>..."` 필터로 대체.

### G2. Theme App Extension (app-embed 블록) (필수 — Online Store 카테고리)
- 테마 수정은 Theme App Extension 방식이어야 함. ScriptTag/수동 스니펫은 공개 심사 거절 사유.
- 작업: Shopify CLI 도입(`shopify.app.toml` 생성) → app-embed 블록으로 `embed.js` 로더 래핑 → `shopify app deploy` → 온보딩 안내문(테마 에디터에서 켜는 방법) 작성.
- 기존 ScriptTag/스니펫 경로는 custom 배포용 폴백으로 유지 가능.

### G3. 설치 직후 UX (필수)
- 설치 시작은 Shopify 소유 표면(App Store/Admin)에서만; 설치·재설치 즉시 OAuth; OAuth 완료 후 즉시 앱 UI로 리디렉션.
- 현재 콜백 후 리디렉션 목적지(관리 콘솔 온보딩 화면)를 정의하고, 빈 상태(empty state)·온보딩 가이드 제공.

### G4. 임베디드 관리자 / App Bridge (권장 — 심사 가점, Built for Shopify 요건)
- 현재 관리 콘솔은 standalone. 비임베디드 앱도 등록은 가능하나 Shopify는 App Bridge(latest) + session token 인증을 강하게 요구·권장.
- 최소안: Shopify Admin 내 임베디드 진입 페이지(App Bridge)에서 standalone 콘솔로 SSO 연결.

### G5. Billing (조건부 필수)
- 유료 플랜이면 Shopify Billing API 외 과금 수단 금지. 무료로 시작하면 생략 가능하나 리스팅에 가격 정책 명시 필요.

### G6. 성능·품질
- 위젯이 스토어프런트 Lighthouse 점수를 10점 이상 저하시키지 않아야 함 (iframe 지연 로드 유지, `embed.js` 경량 유지).
- 관리자 UI 오류·404·500 없는 상태로 심사 제출.

---

## 6. App Store 제출 매뉴얼 (Partner 대시보드)

### 6.1 제출 전 구성 (Configuration)
- [ ] App URL/Redirect URL 확정 (프로덕션 도메인 결정 — 스테이징 `shoptalk.amoeba.site` 그대로 쓸지, 프로덕션 도메인 분리할지 결정. 도메인·연락처 이메일에 "shopify" 문자열 금지)
- [ ] 앱 아이콘 1200×1200 JPEG/PNG
- [ ] Compliance webhooks 3종 URL 등록 (§4 체크리스트와 동일)
- [ ] Emergency developer contact (이메일+전화) / API contact email 등록
- [ ] 요청 scope 최소화 확인 (`read_orders,read_customers` — 실사용 근거 준비)
- [ ] Protected customer data access 승인 완료

### 6.2 리스팅 작성 (App listing, 기본 언어 지정 필수)
- [ ] 앱 이름(고유, 타 앱과 혼동 금지) / 태그라인 / 상세 설명 — 사실 기반, 통계·보증성 문구 금지
- [ ] 스크린샷 4~7장 (실제 UI, 이미지 내 가격·리뷰 문구 금지)
- [ ] 데모 스크린캐스트 (영어 또는 영어 자막) — 설치→온보딩→핵심 기능 순
- [ ] 가격 정보는 Pricing 섹션에만 기재
- [ ] 지원 언어 표기 (en/es/ko — 실제 완역된 언어만)
- [ ] 테스트 자격증명 제출 (전체 기능 접근 가능한 계정, 제출 직전 재검증) — 시드 계정 아닌 심사 전용 계정 별도 생성 권장
- [ ] 심사원용 설치·테스트 안내문 (테스트 스토어 `ambshopi.myshopify.com` 활용)

### 6.3 제출 및 심사 대응
1. Partner 대시보드 → **App Store review** 페이지에서 자동 사전 검사(automated checks) 실행 → 실패 항목 수정 후 재실행.
2. 제출 → 표준 심사 약 2~4주. 심사 중 Shopify 이메일 문의에 신속 대응(무응답 반복 시 제출 정지 리스크).
3. 최다 거절 사유 대비 재점검: ① GDPR 웹훅 미작동 ② 테스트 자격증명 불량 ③ 설치 직후 OAuth 미실행 ④ UI 오류.
4. 승인 후 리스팅 공개 → 설치 퍼널 모니터링.

---

## 7. 전체 로드맵 요약

```
[현재] Partner 앱 생성 + 백엔드 구현 완료
   │
   ├─ Phase 1 (즉시, 코드 변경 없음): §4 수동 설정 4건 → custom 배포 운영 시작
   │
   ├─ Phase 2 (개발): G1 GraphQL 마이그레이션 → G2 Theme App Extension
   │                   → G3 설치 UX → (G4 App Bridge, G5 Billing 선택)
   │
   ├─ Phase 3 (준비): 프로덕션 도메인 확정 · 리스팅 자산(아이콘/스크린샷/스크린캐스트)
   │                   · 심사용 계정 · 자동 사전 검사 통과
   │
   └─ Phase 4 (제출): App Store review 제출 → 2~4주 심사 → 공개
```

## 8. 부수 조치 (문서 정합성)

- [ ] `CLAUDE.md` §6의 "Shopify GDPR webhooks" 갭 표기 제거 (구현 완료 반영)
- [ ] `docs/guide/쇼피파이연동가이드` 체크리스트의 Theme App Extension TODO를 본 문서 G2와 연동
- [ ] G1~G2 완료 시 `SPEC.md` §14 갱신

---

### 참고 자료
- Shopify 공식: [App Store requirements](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements) · [Submit your app for review](https://shopify.dev/docs/apps/launch/app-store-review/submit-app-for-review) · [Best practices](https://shopify.dev/docs/apps/launch/shopify-app-store/best-practices)
- 2026 요건 요약: [Codersy — Shopify App Store Guidelines 2026](https://www.codersy.com/blog/shopify-api-development-best-practices/shopify-app-store-guidelines-key-requirements) · [Digital Heroes — Submission Checklist 2026](https://digitalheroesco.com/journal/shopify-app-submission-checklist/)
