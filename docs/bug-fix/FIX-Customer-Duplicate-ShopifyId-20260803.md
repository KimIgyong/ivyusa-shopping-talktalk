# FIX — 위젯 주문 목록 빈 결과 (고객 행 중복)

| 항목 | 내용 |
|---|---|
| 문서 ID | FIX-Customer-Duplicate-ShopifyId-20260803 |
| 증상 | 스토어 로그인 고객(fremdung@gmail.com, 테스트)이 위젯 My Orders에서 주문을 볼 수 없음 — 실제 주문 #1001 존재 |
| 신고 | 2026-08-03, ambshop-dev 스토어프런트 실사용 |
| 심각도 | High — 로그인 고객의 주문 조회(FR-020) 무결과. 데이터 유실 없음 |

## 1. 근본 원인

같은 Shopify 고객이 **두 경로에서 서로 다른 customers 행으로 이중 생성**되어, 세션 바인딩과
주문 연결이 갈라짐.

staging 증거 (shopify_customer_id=7817610756176):

| 행 | 생성 시각 | 생성 경로 | email | 연결 |
|---|---|---|---|---|
| customers 3 | 07-30 19:04 | 앱 프록시 identity → `findOrCreateByShopifyId` (이메일 미보유) | NULL | 세션 21건, 알림 4건 |
| customers 4 | 07-30 19:49 | 주문 동기화 → `findOrCreateByEmail` (email blind-index로만 조회 → 행 3 미매치) | 있음 | **주문 #1001** |

로그인 시 identity가 세션을 행 3에 바인딩 → `GET /orders`는 행 3 기준 **200 + 빈 배열**.
콘솔의 Shopify sprite "Unsafe attempt to load URL" 경고는 Shopify 고객계정 페이지 내부
이슈로 본 건과 무관.

결함 2건:
- (a) `findOrCreateByEmail`이 email 미스 시 `shopifyCustomerId` 2차 조회 없이 새 행 생성
- (b) `(tenant_id, shopify_customer_id)` 유니크 제약 부재 — DB가 중복을 허용

## 2. 수정

| 파일 | 변경 |
|---|---|
| `apps/api/src/domain/customer/customer.service.ts` | `findOrCreateByEmail`: email-hash 미스 시 `shopifyCustomerId`로 2차 조회, 발견 시 그 행에 email/name 채워 재사용 (`@BeforeUpdate` 훅이 email_hash 동기화) |
| `apps/api/src/domain/customer/entity/customer.entity.ts` | 유니크 인덱스 `uq_customers_tenant_shopify (tenant_id, shopify_customer_id)` — NULL 반복 허용이라 게스트 행 영향 없음 |
| `sql/migration_customer_shopify_unique.sql` | 신규 — 중복 사전 점검 쿼리 + 병합 템플릿 + 유니크 인덱스 |
| `apps/api/src/domain/customer/customer.service.spec.ts` | 신규 — 프록시 선생성 행 채택(중복 방지), email 매치 우선, 신규 생성 3케이스 |

## 3. 데이터 정리 (staging, 코드 배포 전 선적용)

1. 중복 참조 병합: 행 3의 sessions(21)·notifications(4)·기타 customer_id FK를 행 4로 UPDATE
2. 행 3 삭제
3. `migration_customer_shopify_unique.sql` 적용 (유니크 인덱스)
4. 코드 배포

## 4. 예방 패턴

- **동일 실체를 만드는 생성 경로가 2개 이상이면, 각 경로는 상대 경로의 자연키로도 조회한 뒤
  생성해야 하며, DB 유니크 제약을 함께 건다.** 코드 수렴 로직만으로는 레이스에 뚫린다.
- 신규 upsert 경로 추가 시 기존 행 생성 경로 전수 확인: `grep -rn "customerRepo.save\|create(" domain/customer`.

## 5. 검증

- 단위: customer.service.spec 3케이스 통과, 전체 typecheck 통과
- staging: 중복 병합 후 위젯 재로그인 → 주문 #1001 표시 확인 (배포 기록에 결과 기입)

## 6. 배포 기록

- **스키마 변경 있음** — `sql/migration_customer_shopify_unique.sql` staging 선적용 필수 (중복 병합 후)
- PR/커밋/배포: 머지 후 기입
