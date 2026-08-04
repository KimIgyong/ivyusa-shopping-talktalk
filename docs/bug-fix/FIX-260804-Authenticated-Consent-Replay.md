# FIX — 로그인+기동의 고객에게 채팅 동의 차단 메시지 (2026-08-04)

## 1. 증상

로그인 상태이고 이전에 Privacy notice를 Accept한 고객이 채팅에 "I have a question about
order #1001" 전송 시 시스템 응답:
"We cannot process chat messages until you accept the privacy notice…" —
그런데 동의 배너는 화면에 보이지 않음(다시 수락할 방법도 없는 상태).

## 2. 근본 원인

인증(verified) 세션 경로에서 위젯이 **동의 상태를 서버와 전혀 동기화하지 않았다**:

1. 스토어프런트 로그인 → app-proxy가 verified 세션 발급(`consent_state=pending`으로 생성).
   과거 Accept는 **다른(게스트) 세션**에 기록된 것이라 이 세션으로 이어지지 않음.
2. `useEnsureSession`은 인증되면 조기 반환 → `session/ensure` 미호출 →
   동의 채택·auto-replay(PR #81) **미실행**. auto-replay가 익명 경로(run 내부)에만 심어져
   있었던 것이 이번 결함의 핵심.
3. `useSessionProfile`의 재-ensure는 `customerName`만 채택하고 `consentState`를 버림.
4. `ChatTab`은 서버 동의 정보(store `consent`)가 null이면 로컬 기록으로만 판단 —
   로컬 'granted' → **배너 숨김**. 서버 세션은 여전히 pending → chat consent 게이트가
   `consentRequired` 시스템 메시지로 차단.

즉 "배너는 안 보이는데 서버는 동의 없음"의 정합 붕괴. 팝업/리다이렉트 로그인 방식과 무관.

## 3. 수정 (widget 전용, 최소 변경)

- `useSession.ts`: 동의 채택+auto-replay 로직을 `adoptSessionConsent(res)`로 추출
  (동작 동일: pending & 버전 일치 → 배너 없이 `POST /session/consent` 재기록,
  실패 시 pending 복원, `noticeOutdated` 시 재동의).
- `useSessionProfile.ts`: 인증 세션의 유일한 ensure인 재-ensure 응답에
  `adoptSessionConsent(res)` 적용 — verified 세션도 로컬 선택이 재기록되어
  배너 표시 상태와 서버 게이트가 항상 일치.
- 로컬 기록이 없거나 버전 불일치면 배너가 정상 표시됨(현행 정책 유지).

## 4. 검증

- `npm run typecheck` / `npm run build` 통과.
- 스테이징 실측: 로그인 상태에서 채팅 전송 → 동의 차단 메시지 없음(기동의 고객),
  localStorage 삭제 후엔 배너 표시(재동의 경로) — 사용자 확인 항목.

## 5. 예방 패턴

**동의처럼 "표시 여부(클라이언트)"와 "허용 여부(서버 게이트)"가 분리된 상태는 반드시
같은 한 곳에서 동기화**되어야 한다 — 이번처럼 세션 진입 경로가 여러 개(익명 ensure /
인증 재-ensure / 게스트 lookup)면, 경로마다 복붙이 아니라 공용 채택 함수를 모든 경로가
호출하는 구조로. 새 세션 진입 경로를 추가할 때 `adoptSessionConsent` 호출을 체크리스트에
포함할 것.

## 6. 기록

- PR #(기입 예정) / 관련: PR #81(auto-replay 도입), `FIX-Staging-ErasedIdentities-Migration-20260804.md`
