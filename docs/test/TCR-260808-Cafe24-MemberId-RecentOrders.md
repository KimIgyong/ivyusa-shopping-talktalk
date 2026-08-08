# TCR-260808-Cafe24-MemberId-RecentOrders

PLN-260808-Cafe24-MemberId-RecentOrders (PR #165 백엔드+SQL, #166 위젯) 테스트 케이스·결과.

## 1. 단위 테스트 (jest — 69 suites / 721 tests PASS, 2026-08-08 로컬)

| # | 케이스 | 위치 | 결과 |
|---|---|---|---|
| U1 | 토큰 응답 `user_id` 파싱 → adoptCafe24MemberId(7, 42, id) 호출 | cafe24-customer-auth.service.spec | ✅ |
| U2 | 토큰 응답에 user_id 없음 → adopt 미호출, 로그인은 성공 | 〃 | ✅ |
| U3 | adopt: member_id stamp + 미연결 주문 소급 UPDATE(tenant+member_id+customer NULL) | customer.service.spec | ✅ |
| U4 | adopt: 다른 행이 member_id 보유 시 세션 행으로 병합(주문 repoint·중복 삭제·연락처 승계) | 〃 | ✅ |
| U5 | 기존 회귀: linkCafe24Customer 병합, ticket 1회성, state 검증, 리턴URL 화이트리스트 | 기존 스펙 | ✅ |
| U6 | OrderMapper: orderedAt 부재 시 null (기존 계약 스펙 회귀 없음) | order.mapper.spec | ✅ |

## 2. 로컬 통합 (dev DB + 실부트)

| # | 케이스 | 결과 |
|---|---|---|
| I1 | `sql/260808-cafe24-member-orders.sql` dev MySQL 적용 → 컬럼/인덱스 생성 | ✅ |
| I2 | 신규 엔티티 컬럼으로 실부트 `Nest application successfully started` (A-1 검증) | ✅ |
| I3 | `GET /orders?days=30&size=10` 토큰 없음 → E1001(세션 필요) | ✅ |
| I4 | typecheck/build 전체 그린, CI(typecheck·test·build) PR 2건 모두 pass | ✅ |

## 3. 스테이징 검증 (2026-08-08 배포 직후)

| # | 케이스 | 결과 |
|---|---|---|
| S1 | SQL 선적용 → 컬럼 3·unique 인덱스 확인 후 코드 배포 (마이그레이션 순서 준수) | ✅ |
| S2 | 부트 로그 successfully started, `Unknown column`/`doesn't exist` 없음 | ✅ |
| S3 | `GET /api/v1/orders?days=30&size=10` → **401**(=배포됨, 인증만 요구) | ✅ |
| S4 | `/widget/` 200, embed.js에 Cafe24 hostname fallback 코드 반영 확인 | ✅ |

## 4. 수동 E2E (사용자 스모크 — 잔여)

| # | 시나리오 | 기대 |
|---|---|---|
| E1 | amoebaorder.cafe24.com 회원 로그인(redirect·popup 각각) → 주문탭 | 30일 내 주문 최대 10건, 주문일 역순, 품목 수 표시 |
| E2 | 로그인 직후 customers.cafe24_member_id stamp + 이전 미연결 주문 소급 연결 | DB: member_id 일치 행 customer_id 채워짐 |
| E3 | "더보기" 클릭 | "전체 주문 내역은 쇼핑몰 마이페이지에서 확인해 주세요" + 마이페이지 링크(새 탭, /myshop/order/list.html) |
| E4 | data-shop 미설정 스니펫에서도 마이페이지 링크 렌더 | embed.js hostname fallback |
| E5 | 30일 밖 주문만 있는 회원 | "최근 30일 내 주문이 없습니다" + 더보기 안내 |
| E6 | admin API 로그에 customersprivacy 403 소멸 | 호출 자체 제거됨 |

## 5. 엣지 케이스 메모
- 게스트 주문(member_id 없음): 이메일 경로만으로 연결(현행과 동일), row.member_id NULL.
- `days` 파라미터 0/91/문자: E VALIDATION 400 (세션 인증 이후 평가).
- Shopify 행: ordered_at NULL → COALESCE(created_at) — 웹훅 실시간 특성상 실주문일과 근사.
- 게스트 조회(guest-lookup)로 바인딩된 30일 밖 주문은 인라인 목록에 안 뜸(마이페이지 안내로 유도) — 의도된 동작으로 기록.
