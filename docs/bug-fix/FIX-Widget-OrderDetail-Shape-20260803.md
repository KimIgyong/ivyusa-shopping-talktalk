# FIX — 위젯 주문 상세 렌더 크래시 (statusUi of undefined)

| 항목 | 내용 |
|---|---|
| 문서 ID | FIX-Widget-OrderDetail-Shape-20260803 |
| 증상 | 위젯 My Orders에서 주문 행 클릭 시 `TypeError: Cannot read properties of undefined (reading 'statusUi')` — React 렌더 크래시 |
| 신고 | 2026-08-03 (FIX-Customer-Duplicate-ShopifyId 배포 직후 주문 목록이 처음으로 실제 렌더되면서 노출) |
| 심각도 | High — 주문 상세(FR-020) 진입 불가 |

## 1. 근본 원인

**API 상세 응답과 위젯 기대 구조의 불일치.**

- API `OrderMapper.toDetail`: **flat** — `{ id, orderNumber, statusInternal, statusUi, total, currency, createdAt, items[] }`
- 위젯 `OrderDetail.tsx`: `const { order, items } = data` — **중첩** `{ order, items }` 기대 → `data.order === undefined` → `order.statusUi` 접근에서 크래시

이 화면은 지금까지 실환경에서 도달 불가였다: 주문 목록이 PRV-M7 이후 400(FIX-Widget-Orders-400),
그 전엔 고객 행 중복으로 빈 목록(FIX-Customer-Duplicate-ShopifyId) — 두 차단이 걷히자
계약 불일치가 처음 노출된 것. 단위 테스트는 매퍼·서비스만 검증했고 위젯-API 계약을 고정하는
테스트가 없었다.

부수 결함: `toItemView`에 품목 `id`가 없어 위젯 리뷰 작성 버튼(`it.id` 조건)이 영구
비표시였다.

## 2. 수정

| 파일 | 변경 |
|---|---|
| `apps/widget/src/components/orders/OrderDetail.tsx` | flat 구조로 수정 — `const order = data; const items = data.items ?? []` |
| `apps/widget/src/lib/types.ts` | `OrderDetail` 타입을 flat(`OrderSummary` 확장 + `items`)으로 정정 |
| `apps/api/src/domain/order/order.mapper.ts` | `toItemView`에 `id: String(item.id)` 추가 (bigint→string, 리뷰 버튼 활성화 — `CreateReviewRequest.order_item_id`는 `@Type(() => Number)`로 수용) |
| `apps/api/src/domain/order/order.mapper.spec.ts` | 신규 — 위젯 계약 고정: flat(중첩 `order` 없음) + 품목 string id |

API 변경은 필드 **추가**뿐이라 다른 소비자에 비파괴적.

## 3. 예방 패턴

- **프런트가 소비하는 응답 형태는 매퍼 계약 테스트로 고정**한다 — "no nested wrapper",
  필수 필드 존재를 spec으로 못박아 서로 다른 저장소 관습(중첩 vs flat)이 갈라지는 것을 방지.
- 어떤 화면이 상위 차단(4xx·빈 데이터)으로 실행 불가였다면, 차단 해제 직후 **그 화면의 전체
  플로우를 끝까지 실행하는 스모크**를 함께 수행한다 — 이번처럼 하위 결함이 겹겹이 숨는다.

## 4. 검증

- order 테스트 5 suites/18 tests + 매퍼 계약 spec 통과, 전체 typecheck·widget 빌드 통과
- staging 배포 후: 주문 상세 진입 → 품목·합계 렌더, 리뷰 버튼(배송완료 시) 표시 확인

## 5. 배포 기록

- 스키마 변경 없음 — SQL 선적용 불필요
- PR/커밋/배포: 머지 후 기입
