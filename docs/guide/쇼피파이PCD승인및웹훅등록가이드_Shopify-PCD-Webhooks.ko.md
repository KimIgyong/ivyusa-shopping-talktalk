# 쇼피파이 PCD 승인 신청 & 실시간 웹훅 등록 가이드

- **작성일**: 2026-07-22 · **선행 문서**: `docs/guide/쇼피파이앱배포플레이북_Shopify-App-Deployment-Playbook.ko.md` (§4 제약 #3·#5)
- **목적**: shoptalk 앱의 마지막 잔여 항목 — **Protected Customer Data(보호 고객 데이터) 접근 승인**을 받고, 실패 중인 실시간 웹훅 4종(`orders/create·updated`, `fulfillments/create·update`) 등록을 완료하는 작업 절차.
- **현재 상태**: 웹훅 등록 시 `orders/*` 2건은 PCD 미승인 403, `fulfillments/*` 2건은 `read_fulfillments` 미grant로 실패. **기능 공백은 없음** — 30분 주기 예약 동기화(`SHOPIFY_SYNC_INTERVAL_MIN=30`)가 주문 갱신을 커버 중. 이 작업은 지연시간을 30분 → 실시간으로 줄이는 것.

---

## 0. 배경 지식 (왜 이런 상태인가)

| 구분 | 동작 여부 | 이유 |
|---|---|---|
| GraphQL로 주문 **읽기** (sync) | ✅ 됨 | 개발 스토어는 PCD 정식 승인 없이 읽기 허용 (dev-store 예외) |
| `orders/*` 웹훅 토픽 **구독** | ❌ 403 | 웹훅 구독은 앱 레벨 행위라 dev-store 예외가 적용되지 않음 → **PCD 승인 필요**. 오류 원문: *"This app is not approved to subscribe to webhook topics containing protected customer data"* |
| `fulfillments/*` 웹훅 토픽 구독 | ❌ 거부 | 스코프 `read_fulfillments`가 설치 grant에 없음 (shoptalk-5 버전에 선언은 되어 있으나 **재설치 전이라 미부여**) |

참고: Shopify 스태프 답변 기준 "custom 앱은 PCD Level 1·2 자동 부여"라는 안내가 있으나, 실측(2026-07-21)으로는 웹훅 토픽 구독이 403이었다. 신청 UI로 선언을 저장하는 것이 확실한 경로이며, 그래도 안 되면 §4의 지원 문의로 간다.

---

## 1. PCD 접근 신청 (사용자 작업 — 브라우저)

> 로그인 계정: **dev@amoeba.group** (Google SSO). 신규 Dev Dashboard에는 PCD 신청 UI가 없는 것이 알려진 공백이므로 **구 Partner 대시보드**에서 진행한다.

1. `https://partners.shopify.com/4515502/apps` 접속 → 앱 목록에서 **shoptalk** 클릭
   - 목록에 shoptalk이 안 보이면 → §4 (지원 문의 경로)로 이동
2. 좌측 사이드바 → **API access** (또는 "API access requests")
3. "**Protected customer data access**" 섹션 → **Request access** 클릭
4. **Protected customer data** (앱 레벨) 선택 → 사용 목적(purpose): **App functionality** → 사유 입력:
   > *"Display customer order history and delivery status to support agents responding to customer inquiries in our chat/support widget. Order webhooks keep the local order cache current in real time."*
   → **Save**
5. 아래 **Protected customer fields**(필드 레벨) — 다음 2개 선택, 같은 사유로 Save:
   - `Name` — 상담원이 고객을 식별/응대
   - `Email` — 주문-고객 매칭 및 상담 이력 연결
   - (Phone/Address는 현재 미사용 → 선택하지 않음. 최소 수집 원칙)
6. **데이터 보호 설문**이 나오면 우리 실제 구현으로 답한다 (전부 사실):
   | 질문 유형 | 답변 근거 |
   |---|---|
   | 저장 시 암호화 | AES-256-GCM (고객 PII: email/name/phone 컬럼 암호화 + email_hash 블라인드 인덱스, PR #14) |
   | 전송 시 암호화 | 전 구간 TLS (Let's Encrypt) |
   | 삭제/DSAR 대응 | GDPR 웹훅 3종 구현(customers/data_request·redact, shop/redact) + DSAR 엔드포인트 |
   | 보존 기간 | 스케줄된 보존/파기 정책 운영 (Sprint-2 retention scheduler) |
   | 접근 통제/감사 | RBAC(rank×label) + 권한 행위 감사 로그(AuditService) |
   | 직원 접근 최소화 | 상담 권한(CONVERSATION_HANDLE) 보유자만 고객 데이터 화면 접근 |
7. 저장 완료 후 상태가 "Access granted"(또는 개발 스토어 한정 활성)로 표시되는지 확인.
   - **개발 스토어 설치는 정식 심사 제출 없이 선언 저장만으로 활성화**된다. 정식 승인 심사는 App Store 공개 때만 필요.

---

## 2. 재설치 (read_fulfillments grant 갱신)

스코프가 늘어난 버전(shoptalk-5)은 **재설치해야 새 스코프가 부여**된다. ambshop-dev 관리자 권한이 있는 브라우저에서:

```
https://shoptalk.amoeba.site/api/v1/auth/shopify/install?shop=ambshop-dev.myshopify.com
```

→ 승인 화면에 `read_orders, read_customers, read_fulfillments` 3개가 보여야 정상 → **Install/Update** 클릭.
(설치 완료 시 백엔드가 만료형 토큰을 새로 교환·저장한다. 별도 서버 작업 불필요.)

> 검증: 관리 콘솔 Settings → Shopify 카드의 credential `updatedAt`이 방금 시각으로 갱신됐는지 확인. 또는:
> ```bash
> TOKEN=$(curl -s -X POST https://shoptalk.amoeba.site/api/v1/auth/user/login \
>   -H 'Content-Type: application/json' \
>   -d '{"email":"dev@amoeba.group","password":"<앱 비밀번호>"}' | jq -r .data.accessToken)
> curl -s https://shoptalk.amoeba.site/api/v1/tenants/me/shopify -H "Authorization: Bearer $TOKEN" | jq .data.credential
> ```

---

## 3. 웹훅 등록 재실행 & 검증

### 3-1. 등록 실행 (둘 중 하나)
- **콘솔**: `https://shoptalk.amoeba.site` → Settings → Shopify 카드 → **Register webhooks** 버튼
- **API**:
  ```bash
  curl -s -X POST https://shoptalk.amoeba.site/api/v1/tenants/me/shopify/register-webhooks \
    -H "Authorization: Bearer $TOKEN"
  ```

**기대 결과**: `{"ok":true,"registered":4,"existing":0,"failed":0,...}`
(재실행 시에는 `existing`으로 잡히는 것이 정상 — 등록은 멱등)

### 3-2. 실패 시 원인 판별
API 컨테이너 로그에서 토픽별 사유 확인:
```bash
ssh -i secrets/ssh/ivy_staging_ed25519 shoptalk@211.110.140.172 \
  "docker logs ivy_api_staging 2>&1 | grep 'Register webhook' | tail -8"
```
| 로그 메시지 | 의미 | 조치 |
|---|---|---|
| `...protected customer data...` (orders/*) | PCD 선언이 아직 반영 안 됨 | §1 재확인 → 수 분 대기 후 재시도 → 그래도면 §4 |
| `You cannot create a webhook subscription with the specified topic` (fulfillments/*) | read_fulfillments 미grant | §2 재설치 누락 — 재설치 후 재시도 |

### 3-3. E2E 검증 (실시간 유입 확인)
1. ambshop-dev 관리자에서 **테스트 주문 생성** (Orders → Create order → 상품/고객 지정 → Mark as paid)
2. 수십 초 내 관리 콘솔 **Orders 페이지**에 주문이 나타나면 `orders/create` 웹훅 정상 (30분 예약 동기화보다 훨씬 빨리 반영되는 것으로 구별)
3. 그 주문에 **Fulfill item** 실행 → 주문 상태가 shipping(In Transit)으로 바뀌면 `fulfillments/*` 정상
4. 서버 로그로도 수신 확인 가능:
   ```bash
   ssh -i secrets/ssh/ivy_staging_ed25519 shoptalk@211.110.140.172 \
     "docker logs ivy_api_staging --since 10m 2>&1 | grep -i 'webhooks/shopify' | tail"
   ```

### 3-4. 완료 후 선택 조치
- 실시간 웹훅이 안정 확인되면 예약 동기화 주기를 늘려도 된다 (`SHOPIFY_SYNC_INTERVAL_MIN=30` → 예: `120`; 웹훅 유실 대비 보정용으로 유지 권장, 끄지는 말 것).
- `secrets/staging-server.md`에 완료 일자 기록.

---

## 4. 신청 UI가 없거나 403이 지속될 때 (에스컬레이션)

1. **증거 수집**: 403 응답의 `x-request-id`를 확보한다. 서버에서 재현:
   ```bash
   # 플레이북 §4의 서버 프로브와 동일 — 저장 토큰으로 webhookSubscriptionCreate 1건 호출해
   # userErrors 메시지와 x-request-id 를 기록
   ```
   (간단하게는 register-webhooks 실행 직후 api 로그의 오류 문구로 갈음)
2. **Shopify 지원 문의**: [help.shopify.com/partners](https://help.shopify.com/en/support/partners) → 앱/파트너 지원 → 내용:
   > App `shoptalk` (client_id 6999d154…, custom distribution, org 4515502 / dev dashboard org 184769504) cannot subscribe to orders/* webhook topics — "not approved to subscribe to webhook topics containing protected customer data". The new Dev Dashboard shows no Protected Customer Data request UI for this app. Request: enable PCD (Level 1) + fields name/email, or advise the correct request path. x-request-id: <값>
3. **커뮤니티 참고 스레드**: dev 커뮤니티의 "Cannot Request Protected Customer Data Access in New Dev Dashboard" / "Enable PCD for a custom app created in the Dev Dashboard" 스레드에 동일 사례·스태프 답변이 있다.
4. 대기 동안의 운영: 예약 동기화가 계속 커버하므로 **서비스 영향 없음**.

---

## 5. 체크리스트 (요약)

- [ ] Partner 대시보드(4515502) → shoptalk → API access → **PCD Request access** (앱 레벨 + Name/Email 필드, 사유 저장)
- [ ] 데이터 보호 설문 제출 (§1-6 표 근거)
- [ ] **재설치**로 `read_fulfillments` grant (승인 화면에 스코프 3개 확인)
- [ ] **Register webhooks** 재실행 → `registered 4 / failed 0`
- [ ] 테스트 주문 → 콘솔 Orders 실시간 반영 확인 / Fulfill → 상태 전이 확인
- [ ] (지속 403 시) x-request-id 확보 → Shopify 파트너 지원 문의
- [ ] 완료 기록: `secrets/staging-server.md` + 필요시 `SHOPIFY_SYNC_INTERVAL_MIN` 조정
