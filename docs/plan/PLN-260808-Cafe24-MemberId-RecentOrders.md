# PLN-260808-Cafe24-MemberId-RecentOrders

Cafe24 회원 아이디(`user_id`) 직접 확보로 `mall.read_personal` 의존을 제거하고,
위젯 인라인 "내 주문"을 **최근 30일 · 최대 10건**으로 구현하는 작업계획서.

- 작성일: 2026-08-08 · 근거: REQ-260808-Cafe24-MemberId-RecentOrders.md
- 선행: PLN-260808-Cafe24-Customer-Identity.md(P-A2 배포됨), PLN-260807-Cafe24-OAuth-Order-Sync.md(P-A1)
- ✅ **2026-08-08 사용자 승인** — 승인 시 확정 사항:
  ① 옵션 O1(order_items 저장·품목 수 표시) **포함**
  ② 인라인 제한 **10건/30일**, Shopify 테넌트 위젯에도 **통일 적용**,
     "더보기" 클릭 시 "마이페이지에서 확인하세요" 안내문구(+가능 시 마이페이지 링크)

---

## 0. 설계 요지 (왜 이렇게 바꾸나)

Cafe24 문서 재확인(REQ §1)으로 **customer 토큰 응답에 회원 아이디 `user_id`가 포함**됨을 확인.
따라서 주문↔회원 매칭을 "admin customersprivacy 역조회(403 블로킹)" 대신
**토큰 응답 user_id ↔ 주문 payload member_id 직결**로 전환한다.

- 추가 스코프·Cafe24 심사 불필요 (`mall.read_customer_identifier`만으로 완결)
- 멤버당 admin API 1콜씩 쓰던 customersprivacy 호출 제거 → 레이트 예산(40콜) 절약
- user_id는 서버간 토큰 응답 값 → 위조 불가 (P-A2의 보안 원칙 유지)
- user_identifier(= mall+shop+client+user_id 조합, 문서 명시) 바인딩은 현행 유지 — member_id는 보조 키

## 1. 단계별 계획

### S1. DB 마이그레이션 (`sql/260808-cafe24-member-orders.sql`)
```sql
ALTER TABLE customers
  ADD COLUMN cafe24_member_id VARCHAR(64) NULL AFTER cafe24_user_identifier;
CREATE UNIQUE INDEX uq_customers_tenant_cafe24_mid
  ON customers (tenant_id, cafe24_member_id);   -- NULL 반복 허용(MySQL)

ALTER TABLE orders_cache
  ADD COLUMN member_id VARCHAR(64) NULL AFTER customer_id,
  ADD COLUMN ordered_at DATETIME NULL AFTER currency;
CREATE INDEX idx_ordc_tenant_member ON orders_cache (tenant_id, member_id);
CREATE INDEX idx_ordc_tenant_ordered ON orders_cache (tenant_id, ordered_at);
```
- 엔티티: `customer.entity.ts`에 `cafe24MemberId`(type 명시, nullable), `order-cache.entity.ts`에
  `memberId`/`orderedAt` 추가. ⚠️ union 타입은 반드시 `type:` 명시(A-1 부트크래시 예방), 적용 후 실부트 확인.

### S2. 백엔드 — 회원 아이디 확보 + 직결 링크
1. `cafe24-customer-auth.service.ts`
   - `exchangeCode()` 반환을 `{ accessToken, userId }`로 확장 (`user_id` 파싱, 없으면 null 허용 — 플로우는 계속)
   - `handleCallback()`: `findOrCreateByCafe24Identifier` 후 `customerService.stampCafe24MemberId(tenantId, customerId, userId)`
     - stamp 시 **소급 연결**: `UPDATE orders_cache SET customer_id=:cid WHERE tenant_id=:t AND provider='cafe24' AND member_id=:mid AND customer_id IS NULL`
     - 동일 member_id가 이미 다른 customer 행에 stamp되어 있으면(재로그인·행 병합 케이스) 기존 P-A2 병합 규칙과 동일하게 identifier 행 우선으로 수렴
   - 백필 lookback 기본 90→**30** (`CAFE24_LOGIN_SYNC_LOOKBACK_DAYS` 유지, 캡 90)
2. `cafe24-sync.service.ts`
   - `upsertOrder()`: `row.memberId = o.member_id`, `row.orderedAt = parse(o.order_date)` 저장
   - 링크 우선순위: ① tenant+`cafe24_member_id`=member_id customer 조회 ② (현행) member_email → `linkCafe24Customer`(이 경우 해당 customer에 member_id도 stamp) ③ 미연결로 저장
   - **customersprivacy 호출(`fetchCustomerByMemberId`) 제거** — memberCache 파라미터 삭제, admin 클라이언트의 함수는 dead-code로 함께 삭제
3. `order.service.ts` `listForSession()`
   - `days` 쿼리 파라미터(선택, 1~90 검증 — 위반 시 E VALIDATION) 추가: `COALESCE(ordered_at, created_at) >= NOW()-INTERVAL :days DAY`
   - 정렬 `COALESCE(ordered_at, created_at) DESC` (Shopify 행 호환)
   - `OrderMapper` 응답에 `orderedAt` 추가 (camelCase)

### S3. 위젯 — 인라인 10건/30일 + 더보기 안내 + 딥링크 fallback
1. `orderService.ts`: `GET /orders?session_token=…&size=10&days=30` (상수 `INLINE_ORDER_LIMIT=10`, `INLINE_ORDER_DAYS=30`)
2. `OrdersTab.tsx`: 날짜 표시를 `orderedAt ?? createdAt`으로, 빈 목록 문구 "최근 30일 내 주문 없음"(i18n en/es/ko).
   푸터를 **"더보기" 버튼**으로 교체 — 클릭 시 안내문구 "전체 주문 내역은 쇼핑몰 마이페이지에서 확인해 주세요"
   + 마이페이지 링크(Cafe24 `/myshop/order/list.html`, Shopify `/account`) 노출. **Shopify 테넌트에도 동일 적용.**
3. `platform.ts`: `cafe24OrderListUrl` → `myPageOrdersUrl`로 일반화(플랫폼별 마이페이지 경로)
4. `embed.js`: Cafe24 호스트(`isCafe24Host`)에서 `cfg.shop` 미설정 시 `window.location.hostname` fallback → 마이페이지 링크 항상 렌더 (갭 E)

### S4. env/문서 정리
- staging `CAFE24_SCOPES`에서 `mall.read_personal` 제거(재연결 불필요 — 스코프 축소는 다음 재연결 때 자연 반영, 우선 env 문구만 정리)
- `CONFIG.md`/env 템플릿에 `CAFE24_CUSTOMER_SCOPES`, `CAFE24_LOGIN_SYNC_LOOKBACK_DAYS` 문서화(현재 미문서)

### S2-4. (O1, 승인으로 포함) `order_items` 저장
sync `upsertOrder`가 `Cafe24OrderItem[]` → `order_items` replace-on-write(Shopify `syncLineItems` 패턴 준용,
items 부재 시 기존 행 보존·실패 비치명) → 인라인 목록 itemCount·상세 품목 표시.

## 2. UI 와이어프레임 (위젯 주문탭 — 변경 후)

```
┌─────────────────────────────────────┐
│  주문/배송            [결제|배송|문의] │
├─────────────────────────────────────┤
│  #20260805-0000123      [배송중]     │   ← 최근 30일 이내,
│  2026-08-05 · 2개 · ₩54,000         │      주문일 내림차순
├─────────────────────────────────────┤
│  #20260801-0000098      [배송완료]   │
│  2026-08-01 · 1개 · ₩18,500         │
├─────────────────────────────────────┤
│  … (최대 10건)                       │
├─────────────────────────────────────┤
│            [ 더보기 ]                │   ← 클릭 시 ↓ 안내 펼침
│  ℹ 전체 주문 내역은 쇼핑몰            │
│    마이페이지에서 확인해 주세요        │
│    🔗 마이페이지 바로가기 ↗           │   ← Cafe24 /myshop/order/list.html,
└─────────────────────────────────────┘      Shopify /account (data-shop 없어도 렌더)

빈 상태: "최근 30일 내 주문이 없습니다" + 더보기/안내 유지
비로그인: 현행 AuthGate(로그인 유도) 변경 없음
Shopify 테넌트: 동일 UI 통일 적용 (승인 ②)
```

## 3. 사이드 임팩트 분석

| 영역 | 영향 | 판단 |
|---|---|---|
| Shopify 주문 목록 | `ordered_at` NULL → COALESCE로 현행 동일 정렬. 위젯 Shopify 경로는 `days` 미전달 시 현행 유지 | 안전. 단 위젯이 공통 컴포넌트라 Shopify 테넌트도 10건/30일 적용됨 → **의도된 통일**(동일 UX)로 제안 |
| AI 주문 그라운딩 | orders_cache 읽기만 확장(컬럼 추가) — 기존 쿼리 무영향 | 안전 |
| 세션/신원(P-A2) | user_identifier 바인딩 그대로, member_id는 추가 stamp만 | 안전 |
| customersprivacy 제거 | 이메일 없는 회원 주문의 "sync 시점" 연결이 사라지나, member_id 저장+로그인 시 소급 연결로 대체 — 로그인 전에는 어차피 위젯 노출 없음 | 기능 동등 이상 |
| 소급 연결 UPDATE | `customer_id IS NULL` 조건으로 기존 연결 절대 미탈취 | 안전 |
| 기존 Cafe24 행 | member_id/ordered_at NULL → 로그인 백필(30일) upsert가 채움. 30일 밖 옛 행은 NULL 잔존하나 인라인 창 밖이라 무영향 | 허용 |
| 스키마 | 컬럼 추가만(삭제 없음) — 구코드+신스키마 안전, **SQL 선적용 후 배포**(§5) | 준수 |

## 4. 테스트 계획 (TCR에서 상세화)
- 단위: exchangeCode user_id 파싱(있음/없음/비JSON), listForSession days 검증(0/1/30/90/91/문자), COALESCE 정렬, 소급 연결 쿼리 조건
- 통합: 로그인 → member_id stamp → 미연결 주문 소급 연결 → `/orders?size=10&days=30`이 30일 내 10건·주문일 역순 반환; 이메일-only 주문과 member_id 주문의 단일 customer 수렴(병합 회귀)
- 스테이징 E2E: amoebaorder 몰 실로그인(redirect·popup both) → 인라인 10건 표시 + 더보기 안내·마이페이지 링크 렌더(data-shop 유무 both) 확인

## 5. 배포 (Migration 섹션 — PR 본문에 복제)
- SQL: `sql/260808-cafe24-member-orders.sql` — **staging DB 선적용 → 코드 배포** (pre-deploy-check 스킬)
- 적용 체크: [x] staging SQL(2026-08-08, 컬럼·인덱스 확인) [x] staging 배포(deploy-staging.sh) [x] 실부트 로그(`successfully started`) [x] 신규 경로 HTTP 확인(orders?days → 401)
- 롤백: 코드 revert만으로 안전(컬럼 잔존 무해). 인덱스/컬럼 DROP은 불필요 시 미실행.

## 6. 산출물/순서 — 완료 2026-08-08
1. PR-1 (백엔드+SQL): S1+S2+S2-4 → **#165 머지**
2. PR-2 (위젯): S3 → **#166 머지**
3. env/문서 정리(S4): CONFIG.md §4.3b — #165 동승
4. TCR/RPT: `docs/test/TCR-260808-…`, `docs/implementation/RPT-260808-…` + 메모리 갱신

~~미결~~ → 2026-08-08 승인으로 확정: ① O1 포함 ② 10건/30일 Shopify 통일 + 더보기→마이페이지 안내.
