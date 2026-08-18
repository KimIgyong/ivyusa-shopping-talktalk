# REQ-260819-Cafe24-Login-Amoebaorder

`amoebaorder.cafe24.com` 위젯에서 Cafe24 회원 로그인이 처리되지 않는 원인 분석.

- 작성일: 2026-08-19
- 대상: tenant 3 `amoebaorder` / `https://amoebaorder.cafe24.com/` / `shoptalk.amoeba.site`
- 요청: "cafe24 login 처리 안됨 원인 분석"

## 1. 결론

**tenant 3의 Cafe24 자격증명에 저장된 몰이 `amoebaorder`가 아니라 `annehearts`다.**

로그인 시작 단계는 "스토어프론트 호스트 → 몰 ID → 그 몰을 연결한 테넌트"를 찾는데,
`amoebaorder`를 가진 자격증명이 **하나도 없어서** 매칭에 실패한다. 그래서 인증이 시작조차
되지 않는다.

같은 원인이 두 번째 피해를 만들고 있다. **tenant 3의 주문 동기화가 annehearts 몰의 주문을
가져오고 있다.** tenant 3에 캐시된 주문 78건 중 **65건이 tenant 2(annehearts)와 동일한
주문**이고, 그중 **17건은 이미 tenant 3의 고객 16명에게 바인딩**돼 있다.

> 로그인 실패보다 이쪽이 더 위험하다. 로그인은 "안 되는" 상태지만, 주문 동기화는
> **다른 몰의 주문을 가져와 남의 테넌트 고객에게 붙이고 있는** 상태다.

## 2. 근거

### 2-1. 저장된 몰 ID (컨테이너 내부에서 복호화, 키는 서버 밖으로 내보내지 않음)

```
tenant 2 -> mallId="annehearts"
tenant 3 -> mallId="annehearts"     ← amoebaorder 여야 한다
```

두 행 모두 `updated_at`이 `2026-08-18 15:25:28 / :29`로 **1초 차이**다.
한 번의 작업에서 같은 값이 두 테넌트에 들어간 것으로 보인다.

### 2-2. 테넌트 설정과의 불일치

| 항목 | tenant 3 값 |
|---|---|
| `shop_domain` | `amoebaorder.cafe24.com` |
| `storefront_url` | `https://amoebaorder.cafe24.com` |
| 자격증명 `mallId` | **`annehearts`** ← 어긋남 |

### 2-3. 재현

```
GET /api/v1/public/cafe24/customer-auth/start?shop=amoebaorder.cafe24.com&return=...
→ 200        (shop 값을 어떤 형식으로 넣어도 동일)
```

**성공했다면 `302`여야 한다.** `start`는 성공 시 `res.redirect(authorizeUrl)`이고,
실패 시에만 `res.status(200).send(bounceBack())`이다. 즉 **200 자체가 실패 신호**다.

스테이징 로그의 실제 시도 3건도 전부 200이었다 — 실패한 것이다.

```
16:28:59  GET /api/v1/public/cafe24/customer-auth/start -> 200 (2ms)
16:29:03  GET /api/v1/public/cafe24/customer-auth/start -> 200 (3ms)
16:29:18  GET /api/v1/public/cafe24/customer-auth/start -> 200 (3ms)
```
콜백(`/auth/cafe24/callback`) 기록은 **한 건도 없다.** 시작에서 끝났다는 뜻이다.

### 2-4. 실패 지점 좁히기

`start()`가 던질 수 있는 곳은 셋인데, 앞의 둘은 배제된다.

| 후보 | 판정 |
|---|---|
| `appConfig()` — 앱 미설정(E5010) | ✗ `CAFE24_CLIENT_ID`·`SECRET` 모두 설정돼 있음 |
| `mallIdFromHost()` — 호스트 파싱 | ✗ `amoebaorder.cafe24.com` → `amoebaorder` 정상 |
| **`findTenantIdByMallId('amoebaorder')`** | ✅ **null → `CAFE24_NOT_CONNECTED`** |

`findTenantIdByMallId`는 cafe24 자격증명을 전부 복호화해 `mallId`를 비교한다. 저장된 값이
둘 다 `annehearts`이므로 `amoebaorder`는 매칭되지 않는다.

## 3. 사용자에게 보이는 증상

Cafe24 몰에서 로그인 버튼을 누르면 `embed.js`가 **최상위 창을** `start`로 이동시킨다.
실패하면 `bounceBack()` HTML이 내려오고, 그 안의 스크립트가 `history.back()`을 실행한다.

```
로그인 클릭 → 잠깐 흰 화면 → 원래 페이지로 되돌아옴 → 여전히 비로그인 → 오류 메시지 없음
```

"눌러도 아무 일도 안 일어난다"로 보이는 이유다.

## 4. 왜 이 상태가 만들어졌나

`createInstall(tenantId, mallId)`는 **콘솔에서 입력받은 몰 ID를 그대로 신뢰**한다.

- 테넌트 자신의 `shop_domain`과 **대조하지 않는다.**
- 이미 다른 테넌트가 연결한 몰인지 **확인하지 않는다.**

즉 운영자가 tenant 3 콘솔에서 `annehearts`를 연결하면 코드는 시키는 대로 저장한다.
설치 플로우 자체는 상태(state)에 담긴 tenantId·mallId를 정확히 짝지어 저장하므로 **코드가
잘못 매핑한 것이 아니라, 잘못된 입력을 막지 않은 것**이다.

## 5. 왜 진단이 오래 걸리는 구조인가 (부수 결함)

`start`의 `catch`가 **아무것도 로그하지 않는다.**

```ts
} catch {
  res.status(200).type('html').send(cafe24TicketDelivery.bounceBack());
}
```

- 접근 로그에는 `200`만 남아 성공과 구분되지 않는다.
- 실패 사유(E5010 / 파싱 실패 / 미연결)가 어디에도 남지 않는다.
- 결국 원인을 알려면 **DB 자격증명을 복호화**해야 했다.

이 리포지토리가 이미 아는 함정과 같은 계열이다 — 4xx는 서버 로그에 안 남고,
"로그에 에러가 없다 ≠ 요청이 성공했다"(CLAUDE.md §2).

## 6. 조치안

### A. 데이터 정정 (운영자 작업 필요, 최우선)

1. tenant 3 콘솔에서 Cafe24 연결을 **`amoebaorder` 몰로 다시 연결**(OAuth 재수행).
2. tenant 3에 잘못 적재된 annehearts 주문 정리 — `tenant_id=3`이면서 tenant 2와
   `order_number`가 겹치는 **65건**. 그중 고객 바인딩된 **17건**은 바인딩도 함께 끊어야 한다.
   ⚠️ 정정 SQL은 사용자 확인 후 실행. 스테이징이라도 되돌릴 수 없는 삭제다.

### B. 재발 방지 (코드)

| # | 내용 | 근거 |
|---|---|---|
| B-1 | `createInstall`에서 몰 ID를 테넌트 `shop_domain`과 **대조**, 불일치 시 거부(또는 명시적 확인) | 이번 사고의 직접 원인 |
| B-2 | **이미 다른 테넌트가 연결한 몰**이면 거부 | 교차 오염 차단. `findTenantIdByMallId`가 "첫 매칭"을 반환하는 구조라 중복 연결은 조용한 오작동이 된다 |
| B-3 | `start`/`callback`의 `catch`에 `logger.warn(사유)` 추가 | 200 뒤에 숨은 실패를 드러낸다 |
| B-4 | 동기화 시 자격증명 `mallId`와 테넌트 `shop_domain` 불일치를 **경고 로그** | 오염을 조기에 발견 |

### C. 확인 필요

| # | 질문 |
|---|---|
| Q1 | tenant 3을 `amoebaorder`로 재연결할 권한/계정이 준비돼 있는가 |
| Q2 | tenant 2(annehearts)의 연결은 **정상**인가 — 이쪽이 맞고 tenant 3만 잘못된 것인지 확인 필요 |
| Q3 | 오염된 주문 65건을 **삭제**할지, `tenant_id`만 정정할지 (겹치는 주문번호라 삭제가 안전해 보임) |
| Q4 | B-1을 "거부"로 할지 "경고 후 진행"으로 할지 — 커스텀 도메인 몰이면 `shop_domain`과 몰 ID가 다를 수 있다 |

## 7. 확인하지 못한 것

- 프로덕션에도 같은 상태인지 (스테이징만 확인)
- annehearts 연결이 의도된 것인지, tenant 3 재연결로 tenant 2가 영향받는지
- 재연결 후 로그인 전 구간(authorize → callback → ticket → exchange) 동작 — 지금은 시작
  단계에서 막혀 있어 그 뒤를 검증할 수 없다
