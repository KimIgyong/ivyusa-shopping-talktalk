# FIX — 위젯 주문 탭 400 (Something went wrong.)

| 항목 | 내용 |
|---|---|
| 문서 ID | FIX-Widget-Orders-400-20260803 |
| 증상 | ambshop-dev.myshopify.com 스토어프런트 채팅위젯에서 로그인 후 주문 탭 진입 시 "Something went wrong." 표시 |
| 신고 | 2026-08-03, 스토어 실사용 중 발견 (콘솔: `GET /api/v1/orders 400`) |
| 심각도 | High — 위젯 주문 조회(FR-020) 전면 불능. 데이터 유실 없음 |

## 1. 근본 원인

보안 개선 **PRV-M7/FE-M3**(세션 토큰을 URL에서 제거)과 쿼리 DTO의 불일치.

1. 위젯 `api-client.ts`의 요청 인터셉터는 GET 요청의 `session_token`을 **쿼리에서 제거**하고
   `X-Session-Token` 헤더로 옮긴다 (브라우저 히스토리·프록시 로그·Referer 누출 방지).
2. API `OrderListQuery`(`order.request.ts`)는 `session_token`을 **필수 쿼리 필드**로 선언.
3. 전역 ValidationPipe가 쿼리에 없는 `session_token`을 보고 컨트롤러 도달 전에
   **400 E5003** `"session_token must be a string"` 반환 — 헤더를 읽는 `@SessionToken()`
   데코레이터는 실행되지 않는다.

재현 (staging, 2026-08-03):

```
GET /api/v1/orders  +  X-Session-Token: <tok>   → 400 E5003 (버그)
GET /api/v1/orders?session_token=<tok>          → 통과 (구 쿼리 경로)
```

같은 패턴 전수 조사 결과 `GET /inquiries`(`InquiryListQuery`)도 동일한 잠복 결함.
`/orders/:id`, `/orders/:id/tracking`, 알림·채팅 폴링·개인정보·제휴 GET은 필수 쿼리
DTO가 없어 정상. 위젯 로그인(POST, body 토큰)도 영향 없음 — 오류는 로그인 직후
주문 목록 로딩에서 발생한 것.

## 2. 수정

최소 변경 — 필수 쿼리 필드를 optional로 완화 (토큰 부재 거부는 `@SessionToken()`이 401로 이미 처리):

| 파일 | 변경 |
|---|---|
| `apps/api/src/domain/order/dto/request/order.request.ts` | `OrderListQuery.session_token` → `@IsOptional()`; 미사용 `SessionTokenQuery` 삭제 |
| `apps/api/src/domain/inquiry/dto/request/inquiry.request.ts` | `InquiryListQuery.session_token` → `@IsOptional()` |
| `apps/api/src/domain/order/dto/request/order.request.spec.ts` | 신규 — 쿼리 파라미터 없이(헤더 인증) 검증 통과를 고정하는 회귀 테스트 |

하위호환: 쿼리 `?session_token=`도 계속 허용(`@SessionToken()`의 back-compat 경로 유지).

## 3. 테스트가 잡지 못한 이유 · 예방 패턴

- 단위 테스트는 서비스를 직접 호출해 **HTTP ValidationPipe 계층을 우회** — e2e HTTP
  테스트 부재(CLAUDE.md §6 알려진 갭)의 실증 사례다.
- **예방 패턴 (일반화)**: 위젯(`@Public()` + `@SessionToken()`) GET 엔드포인트의 쿼리
  DTO에 `session_token`을 필수로 선언하지 않는다. 토큰 수령·거부는 오직
  `@SessionToken()` 데코레이터가 담당한다(헤더 우선, 쿼리 back-compat, 부재 시 401).
  인증 축을 옮기는 변경(헤더화 등)은 해당 축을 쓰는 **모든 GET 쿼리 DTO를 전수
  grep**으로 확인한다: `grep -rn "session_token" apps/api/src/domain/*/dto/request/`.

## 4. 검증

- `npm run test --workspace=@ivy/api -- --testPathPattern="(order|inquiry)"` — 4 suites / 17 tests 통과
- `npm run typecheck` — 통과
- staging 배포 후: 헤더-only `GET /api/v1/orders` → 401/E3001(400 아님) 확인, 스토어프런트 위젯 주문 탭 실확인

## 5. 배포

- 스키마 변경 없음(코드만) — staging SQL 선적용 불필요
- PR: fix/widget-orders-400 → main squash-merge 후 staging 재배포
