# RPT-260808-Cafe24-MemberId-RecentOrders

Cafe24 회원 아이디 직접 확보(+`mall.read_personal` 의존 제거) 및 위젯 인라인 "내 주문"
**최근 30일·최대 10건** 구현 결과 보고서.

- 근거: REQ/PLN-260808-Cafe24-MemberId-RecentOrders (사용자 승인 2026-08-08: O1 포함, 10건/30일 통일, 더보기→마이페이지 안내)
- 선행: PLN-260808-Cafe24-Customer-Identity(P-A2), PLN-260807-Cafe24-OAuth-Order-Sync(P-A1)

## 1. 핵심 변경 (왜)

Cafe24 개발자센터 customeraccesstoken 문서 실사로 **토큰 발급/재발급 응답에 회원
아이디(`user_id`)가 포함**됨을 확인(회원고유정보 `user_identifier` = mall_id+shop_no+client_id+user_id
조합, 문서 명시). 이로써 인라인 "내 주문"을 막던 J-personal(`/customersprivacy` 403,
`mall.read_personal` 심사 대기)이 **불필요**해져, 주문↔회원 매칭을 member_id 직결로 전환했다.

## 2. 변경 파일

### PR #165 — 백엔드+SQL (commit 3d4fb2a)
- `sql/260808-cafe24-member-orders.sql` — customers.cafe24_member_id(+unique), orders_cache.member_id/ordered_at(+idx 2) — 추가 전용
- `customer.entity.ts` / `order-cache.entity.ts` — 위 컬럼 매핑
- `customer.service.ts` — `findByCafe24MemberId`, `adoptCafe24MemberId`(stamp+보유행 병합+미연결 주문 소급 UPDATE)
- `cafe24-customer-auth.service.ts` — exchangeCode가 `user_id` 파싱 → 콜백에서 adopt(비치명), 로그인 백필 lookback 90→30
- `cafe24-sync.service.ts` — member_id·ordered_at 저장, 링크 우선순위(member_id→email→미연결), **customersprivacy 호출 제거**, Cafe24 품목 → order_items replace-on-write
- `cafe24-admin.client.ts` — fetchCustomerByMemberId 삭제 / `cafe24.module.ts` — OrderItem repo 등록
- `order.service.ts` — listForSession `days`(1~90 검증) 윈도우 + `COALESCE(ordered_at, created_at) DESC` 정렬
- `order.controller.ts`/`order.request.ts` — days 쿼리 전달
- `order.mapper.ts` + `@ivy/types` — 응답에 `orderedAt` 추가
- `shopify-sync.service.ts`/`shopify-admin.client.ts` — 웹훅 payload created_at → ordered_at 기록
- `CONFIG.md` — Cafe24 env 레퍼런스 신설(§4.3b, read_personal 제외)
- 스펙: customer-auth 2케이스, adopt 2케이스 추가

### PR #166 — 위젯 (commit f961f23)
- `orderService.ts` — `/orders?size=10&days=30` (INLINE_ORDER_LIMIT/DAYS)
- `OrdersTab.tsx` — 주문일(orderedAt) 표시, 푸터 "더보기"→클릭 시 마이페이지 안내+링크, 빈 상태 "최근 30일 내 주문 없음"
- `platform.ts` — `myPageOrdersUrl()` (Cafe24 `/myshop/order/list.html`, 그 외 `/account`) — Shopify 통일
- `embed.js` — Cafe24 몰 data-shop 미설정 시 hostname fallback (갭 E)
- i18n en/es/ko 4키

## 3. 테스트 — TCR-260808-Cafe24-MemberId-RecentOrders
로컬 721/721 PASS, 실부트 검증(A-1), CI 2건 그린. 수동 E2E(E1~E6, 실로그인)는 사용자 스모크 잔여.

## 4. 배포 상태

| 항목 | 상태 |
|---|---|
| PR | #165(백엔드+SQL), #166(위젯) — 둘 다 squash-merge, main `f961f23` |
| 마이그레이션 | `sql/260808-cafe24-member-orders.sql` **staging 선적용 완료**(컬럼·인덱스 확인) 후 코드 배포 |
| staging 배포 | 2026-08-08 12:09 KST `deploy-staging.sh` — 부트 `successfully started`, 스키마 에러 없음 |
| 배포 검증 | `GET /api/v1/orders?days=30&size=10` → 401(배포됨) · `/widget/` 200 · embed.js fallback 반영 확인 |
| production | 미배포(호스트 미정 — 기존과 동일) |
| env | 변경 불요(기본값으로 동작). `CAFE24_SCOPES`의 `mall.read_personal`은 다음 재연결 때 제거 권장 |

## 5. 남은 일 / 후속
- 사용자 수동 스모크 E1~E6 (amoebaorder 실로그인 — TCR §4)
- (선택) admin 재연결 시 스코프에서 `mall.read_personal` 제거 — 코드상 이미 미사용
- (선택) Cafe24 품목 옵션 텍스트: 현재 variant_code가 비가독 코드라 미표시 — 필요 시 products variants 조인으로 개선

## 6. 예방 패턴(메모리 승격)
- **외부 API 재점검은 응답 "전체 필드"를 문서로 재확인** — 토큰 응답에 이미 있던 `user_id`를 놓쳐
  개인정보 스코프(심사 대상) 우회로를 설계할 뻔함. "필드가 없다"는 실측은 해당 리소스에 한정된 사실.
- 캐시성 테이블에 **플랫폼 원본 시각 컬럼을 처음부터** — created_at(수집 시각)으로 정렬하면 백필 시 순서 왜곡.
- 로컬 스모크 시 **포트 공유 주의**: 다른 프로젝트 dev 서버가 :3000 IPv6 점유 → curl이 남의 API에 붙어 404. `PORT=` 오버라이드+127.0.0.1 명시로 검증.
