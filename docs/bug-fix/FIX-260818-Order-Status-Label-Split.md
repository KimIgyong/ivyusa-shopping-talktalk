# FIX-260818-Order-Status-Label-Split

같은 주문의 상태가 화면마다 다른 언어로 나오던 문제.

- 작성일: 2026-08-18
- 발견: PLN-260818-Widget-Orders-Tab 배포 후 **스테이징 육안 검증(TCR S-5) 중**
- 선행 PR: #310

## 1. 증상

한국어 위젯에서 주문 `#1004`이

- 주문 목록(신규) → **`결제완료`**
- 주문 상세(기존) → **`Confirmed`**

즉 같은 주문의 같은 상태가 두 화면에서 다른 언어로 표시됐다. 배송 칩의 카드도 마찬가지.

## 2. 원인

PR #310에서 상태 라벨 매핑(`orders.status.*`)을 만들면서 **새로 만든 목록에만 연결**했다.
기존 화면 둘은 `order.statusUi`를 그대로 렌더하던 코드 그대로였다.

```
OrderList     → statusLabel(t, order)   ← 신규, 번역됨
OrderDetail   → {order.statusUi}        ← 기존, 원문
ShipmentList  → {order.statusUi}        ← 기존, 원문
```

새 기능이 기존 화면을 대체하지 않고 **옆에 추가**될 때 생기는 전형적인 누락이다.
목록에서 상세로 넘어가는 동선이 새로 생겼기 때문에, 이번에야 두 표기가 한 흐름 안에서
나란히 보이게 됐다.

## 3. 함께 드러난 것

상태 판정이 세 군데에 **서로 다른 부분일치 정규식**으로 흩어져 있었다.

| 위치 | 식 | 문제 |
|---|---|---|
| `OrderDetail` | `/deliver\|complete/` | **"Delivery failed"·"Incomplete"를 배송완료로 판정** |
| `ShipmentList` | `/ship\|transit\|deliver\|fulfil/` | `Unfulfilled`을 배송건으로 판정(#310 R-1과 동일 결함) |
| `order-status` | 허용목록 | #310에서 이미 수정됨 |

## 4. 조치

판정과 라벨을 **한 곳(`packages/types/.../order-status.ts`)으로 통일**했다.

- `isOrderDelivered` 신규 — `isOrderInTransit`과 같은 허용목록 규율. `statusInternal` 우선,
  없을 때만 `statusUi`를 **전체 문자열 앵커**로 확인.
- `isShipmentish`(배송 칩 필터) = 배송중 ∪ 배송완료 — 공유 함수 조합으로 대체.
- 세 화면 모두 `statusLabel(t, order)` 사용, 뱃지 색도 `statusInternal` 우선으로 통일.

## 5. 예방 패턴

**표시 규칙을 새로 만들면, 같은 값을 이미 그리고 있던 화면을 먼저 grep하라.**
새 컴포넌트에만 적용하면 한 흐름 안에서 표기가 갈린다 —
`grep -rn 'statusUi' apps/widget/src`가 3초면 끝났을 일이다.

문자열 판정에 **부분일치 정규식을 쓰지 말 것.** `fulfil`은 `Unfulfilled`에,
`deliver`는 `Delivery failed`에, `complete`는 `Incomplete`에 걸린다. 셋 다 의미가 정반대다.
허용목록 + 전체 문자열 앵커가 기본값이어야 한다.

## 6. 검증

- 단위 3건 추가(배송완료 판정·실패 문구 오판·내부상태 우선), types 84건 전체 통과
- typecheck ✅ · build ✅ · test **1,453건** · i18n ✅ 6개 언어
- 스테이징 재배포 후 `#1004` 상세에서 `결제완료` 표시 확인 예정
