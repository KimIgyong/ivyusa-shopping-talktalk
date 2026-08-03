# FIX — 위젯 첫 로드 시 unread-count 401

| 항목 | 내용 |
|---|---|
| 문서 ID | FIX-Widget-UnreadCount-Anon401-20260803 |
| 증상 | 스토어프런트 첫 페이지 로드 시 콘솔에 `GET /api/v1/notifications/unread-count 401 (Unauthorized)` |
| 신고 | 2026-08-03 (FIX-Widget-Orders-400 재검증 중 발견) |
| 심각도 | Low — 기능 영향 없음(배지 0 처리). 콘솔 노이즈 + 익명 세션의 30초 주기 무의미 폴링 |

## 1. 근본 원인

알림 배지 폴링이 **세션 존재만으로 발화**하고, 서버는 **고객 미연결 세션에 401**을 반환하는 설계 불일치.

1. 위젯 마운트 시 `useEnsureSession()`이 익명 세션을 생성 (`customerId` 없음 — Shopify
   앱 프록시 신원 채택 또는 주문조회 인증 후에야 연결됨).
2. `Widget.tsx`/`TabBar.tsx`의 `useUnreadCount`는 `enabled: !!sessionToken`뿐 —
   `authenticated` 상태를 확인하지 않음.
3. API `notification.service.requireCustomerId`: 세션은 있으나 `customerId == null`
   → **401 UNAUTHORIZED** (알림은 고객 귀속 데이터).

Shopify 로그인 고객도 첫 로드에는 앱 프록시 핸드셰이크(`useEmbedIdentity`)가 비동기라
익명 토큰으로 먼저 폴링이 나가 1회 401이 발생 — "처음 페이지 로드시" 관찰과 일치.
익명 방문자는 30초 폴링 + React Query 기본 재시도로 401이 계속 반복된다.

## 2. 수정

위젯만 변경 (API 변경 없음 — 401은 올바른 서버 응답):

| 파일 | 변경 |
|---|---|
| `apps/widget/src/hooks/useNotifications.ts` | `useUnreadCount(sessionToken, authenticated)` — `enabled: !!sessionToken && authenticated` |
| `apps/widget/src/components/widget/Widget.tsx` | 스토어의 `authenticated` 전달 |
| `apps/widget/src/components/widget/TabBar.tsx` | 〃 |

인증 순간(`setAuthenticated(true)` — 앱 프록시 신원 채택 또는 AuthGate 성공) 쿼리가
자동 활성화되므로 배지 동작은 동일하다. 익명 상태에서는 호출 자체가 사라진다.

## 3. 예방 패턴

- **고객 귀속 데이터를 읽는 위젯 쿼리는 `!!sessionToken`이 아니라 `authenticated`로
  가드한다.** 세션 존재 ≠ 고객 신원. (주문 탭 `useOrders(token, authenticated)`가
  이미 올바른 선례 — 알림 배지가 이를 따르지 않았던 것.)
- 폴링 쿼리(`refetchInterval`)는 실패 시에도 계속 돌므로, 영구적으로 실패할 조건
  (미인증 등)은 재시도가 아니라 `enabled` 게이트로 차단한다.

## 4. 검증

- `npm run typecheck` 통과, `npm run build --workspace=@ivy/widget` 성공
- staging 배포 후: 위젯 표준 페이지 첫 로드에서 `unread-count` 요청·401 부재 확인

## 5. 배포 기록

- 스키마 변경 없음(위젯 코드만) — SQL 선적용 불필요
- PR/커밋/배포: 머지 후 기입
