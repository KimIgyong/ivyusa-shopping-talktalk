# RPT-260818-Widget-Orders-Tab

주문탭 주문 목록 노출 구현 보고.

- 작성일: 2026-08-18
- 문서 체인: `REQ-260818-Widget-Orders-Tab` → `PLN-260818-…` → 구현 → `TCR-260818-…` → 본 문서
- PR: _(작성 시점 미생성)_ · 마이그레이션: **없음(스키마 무변경)**
- 배포: local ✅ / staging ⏳ / production ❌

## 1. 요구별 결과

| 요구 | 결과 |
|---|---|
| 주문탭에 로그인 고객 주문 노출 | ✅ 첫 칩을 `주문내역`(주문 목록)으로 교체, 전 상태 노출 |
| 주문 상태 화면 확인 | ✅ 행 상태 뱃지 + 다국어 매핑(+원문 폴백) |
| 배송 상태 화면 확인 | ✅ 배송중 행에 단계 바, 상세에서 택배사·송장. **기존 구현이 이미 완비돼 있었고 진입로만 없었다** |

## 2. 원인 (제보가 왜 사실이었나)

데이터 문제가 아니었다. 주문 7건이 캐시돼 있었고 로그인 백필도 정상이었다
(8/18 09:31·10:05·10:08 로그 3건). 원인은 UI 세 겹이다.

1. 주문탭이 **`결제` 칩에서 시작**하는데 그 칩은 주문이 아니라 알림 피드를 읽는다.
2. **스테이징 전체 DB에 `payment` 알림이 0건** — 이 칩은 한 번도 내용을 가진 적이 없다.
   그래서 모든 테넌트·모든 고객에게 빈 화면이었다.
3. 주문 목록은 `배송` 칩에만 있었고, 거기서도 `isShipmentish`가 배송중/배송완료만
   통과시켰다 → **결제완료 주문은 위젯 어디에도 존재하지 않았다.**

재현 계정: 고객 `id=8`(`7822269251664`)의 유일한 주문 `#1004 / Confirmed / $749.95`.

## 3. 변경 파일

| 파일 | 내용 |
|---|---|
| `packages/types/src/common/order-status.ts` | **신규** — 상태 키 매핑·폴백·배송중 판정(순수 로직) |
| `packages/types/src/common/order-status.spec.ts` | **신규** — 10건 |
| `packages/types/src/index.ts` | 배럴 export |
| `apps/widget/src/components/orders/OrderList.tsx` | **신규** — 주문 목록 |
| `apps/widget/src/components/orders/order-status.ts` | **신규** — i18n 어댑터 |
| `apps/widget/src/components/notifications/tab-chips.ts` | `payment` → `orders` 칩 교체 |
| `apps/widget/src/components/notifications/NotificationsTab.tsx` | `orders` 칩에서 `OrderList` 렌더 |
| `apps/widget/src/services/orderService.ts` | `listOrders(size/days)` 파라미터화 + 탭 상수(20/90) |
| `apps/widget/src/hooks/useOrders.ts` | opts를 **쿼리 키에 포함** |
| `apps/widget/src/i18n/locales/{en,ko,es,ja,vi,zh}.ts` | 칩 라벨 + 상태 6종, `emptyRecent`를 `{{days}}` 보간으로 |
| `apps/api/src/domain/order/order.service.ts` | 목록 쿼리에 `tenant_id` 조건 |
| `apps/api/.../order.service.listforsession.spec.ts` | **신규** — 5건 |

## 4. 설계 판단

**목록만 새로 만들고 나머지는 재사용.** 상세·추적·리뷰는 이미 동작했고, 새로 그렸다면
배송 칩이 쓰는 구현과 갈라져 같은 것이 두 벌 생겼을 것이다.

**상태는 보여주되 숨기는 데 쓰지 않는다.** 이번 결함의 본질이 "상태로 걸러서 안 보임"이라,
`isInTransit`은 단계 바를 그릴지만 정하고 행의 존재 여부는 건드리지 않는다.

**상태 라벨은 `status_internal` 기준.** `status_ui`는 플랫폼이 부르는 이름(Shopify는
"In Transit", 몰이 바꿀 수도 있음)이라 번역하면 샵마다 깨지는 추측이 된다. 모르는 값은
**원문 그대로** 보여준다 — 빈 뱃지는 "상태가 없는 주문"으로 읽혀 더 나쁘다.

**쿼리 키에 조회 범위 포함.** 채팅 카드(10/30)와 탭(20/90)이 캐시 한 칸을 공유하면 먼저
마운트된 쪽이 다른 쪽 화면을 정하게 된다.

**`viewAllOnMall`·`emptyRecent`는 기존 키 재사용.** 새 키를 만들려다 중복을 발견해
되돌렸고, `emptyRecent`에 박혀 있던 "30일"만 `{{days}}` 보간으로 바꿨다.

## 5. 게이트

typecheck ✅ · build ✅ · i18n ✅ 6개 언어 · test **1,445건 통과**(api 1,308 + common 60 + types 77)

## 6. 잔여 / 후속

| # | 항목 | 비고 |
|---|---|---|
| N-1 | TCR S-1~S-14 스테이징 수동 검증 | 배포 후. **S-1(고객 8의 #1004)이 판정 기준** |
| N-2 | 위젯 워크스페이스에 테스트 러너 없음 | 이번엔 순수 로직을 공유 패키지로 옮겨 우회. 러너 도입은 별건 |
| N-3 | 90일 초과 주문 | 마이페이지 링크로 위임(API 상한이 90) |
| N-4 | `결제` 칩 제거의 실사용 영향 | 스테이징 0건 근거. 프로덕션 데이터에서 재확인 필요 |
