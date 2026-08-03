# PLN — 위젯 오픈 시 런처 X 숨김 + 동의 auto-replay (2026-08-04)

> 근거: 2026-08-04 사용자 요청(런처 X 숨김) + FIX 진단(Privacy notice 세션 단위 재노출,
> `docs/implementation/RPT-Widget-Login-Redirect-Orders-20260804.md` 후속 진단 참조).
> 사용자 지시로 **계획서 작성 후 즉시 구현 진행**(별도 승인 대기 없음).
> 스키마/백엔드 변경: **없음** (widget 전용, Migration 해당 없음).

## Stage 1 — 위젯 오픈 시 하단우측 런처(X) 숨김

대상: `apps/widget/src/components/widget/Widget.tsx`

- 현재: 플로팅 런처 버튼이 항상 렌더되고, 패널 오픈 시 아이콘만 💬→X로 바뀜.
  패널 헤더(상단우측)에 이미 닫기 X가 있어 닫기 버튼이 2개.
- 변경: 런처 버튼을 `!panelOpen`일 때만 렌더. 닫기는 패널 상단우측 X(+Esc)로 일원화.
- ARIA: 런처의 `aria-expanded`는 닫힘 상태에서만 존재하게 됨 — 열림 상태 닫기는
  패널 헤더 버튼이 담당하므로 접근성 경로 유지.

와이어프레임:

```
[닫힘]                          [열림]
                               ┌────────────────────────┐
                               │ Support   🌐 ⚙ ✕  ← 유지│
                               │  (탭/콘텐츠)           │
                               │                        │
                               └────────────────────────┘
          ┌────┐
          │ 💬 │  ← 유지         (하단우측 런처 X — 제거됨)
          └────┘
```

## Stage 2 — 동의 auto-replay (Privacy notice 1회 Accept 후 재노출 방지)

대상: `apps/widget/src/lib/consent.ts`, `src/hooks/useSession.ts`,
`src/components/chat/ChatTab.tsx`, `src/components/settings/PreferencesPanel.tsx`

원인(확정): 동의는 세션 단위인데 임베디드 익명 위젯은 페이지 로드마다 새 세션
(프라이버시 설계상 재사용 금지) → 새 세션 `pending` → 배너 재노출.

설계 (제안안 그대로):

1. `lib/consent.ts`: 저장값을 `{ state: 'granted'|'denied', version: string|null, at: string|null }`
   JSON으로 확장(키 `ivy_consent` 유지).
   - `getStoredConsent()`는 기존처럼 state만 반환(GA4 게이트 등 기존 콜사이트 무변경),
     신규 `getStoredConsentRecord()`가 전체 레코드 반환.
   - 구버전 값('granted' 평문)은 `version:null`로 파싱 → **auto-replay 제외**(배너 1회 더
     노출 후 버전 포함 재저장 — 안전한 마이그레이션).
2. `useSession.syncStoredConsent`: **`pending`에서 로컬 캐시를 지우던 동작 제거** —
   `noticeOutdated`(버전 불일치)일 때만 clear. granted/declined는 notice 버전과 함께 저장.
   (이 clear가 매 로드마다 Accept 기록을 지우던 부수 원인.)
3. `useSession.run()`: ensure 응답이 `pending`이고 `noticeOutdated`가 아니며,
   로컬 레코드의 version이 현재 유효 notice 버전과 **일치**하면:
   - 배너를 띄우지 않고 store consent를 로컬 선택으로 즉시 반영(낙관적),
   - `POST /session/consent`로 서버 세션에 재기록(auto-replay),
   - 실패 시 원래 `pending`으로 되돌려 배너 표시(fail-closed 유지).
4. 기록 콜사이트(`ChatTab.recordConsent`, `PreferencesPanel`)는 버전을 함께 저장하도록
   `setStoredConsent(granted, version)` 시그니처 확장.

정책 유지 사항:
- 서버 세션이 항상 기록 원본(모든 세션에 consent row 재기록) — CCPA 증적 체계 불변.
- **notice 버전 bump 시 재동의 재노출 현행 유지** (버전 불일치 → replay 안 함 + 캐시 clear).
- Decline도 동일하게 replay(거절한 방문자에게 매번 재질문하지 않음; 설정 패널에서 변경 가능).

플로우:

```
페이지 로드 → ensure(새 세션, pending)
  ├─ 로컬 기록 없음/버전 불일치 → 배너 표시(현행)
  └─ 로컬 granted|denied + 버전 일치
       → 배너 숨김(낙관적 반영) → POST /session/consent 재기록
            └─ 실패 → pending 복원 → 배너 표시
```

## 사이드 임팩트

| 영역 | 검토 | 판단 |
|---|---|---|
| GA4 Consent Mode | `getStoredConsent()` 반환 형태 유지, granted 게이트 동일 | 영향 없음 |
| 서버 consent 게이트(chat 저장) | replay POST가 세션에 기록되므로 서버 판단 동일 | 유지 |
| 버전 bump 재동의(PRV-M4) | version 불일치 시 replay 제외 + clear | 정책 유지 |
| 구버전 로컬 값 | version 없음 → replay 제외, 1회 배너 후 신형식 저장 | 안전 |
| 로그인 고객 | 세션 재사용(24h)으로 원래 유지됨 — replay는 익명 경로 보완 | 중복 무해(재기록 멱등) |
| 런처 숨김 | 모바일 풀스크린 패널서도 헤더 X 존재, Esc 동작 유지 | 회귀 없음 |

## 검증 계획

- typecheck/build + 위젯 수동 시나리오: C1 오픈 시 런처 소멸/헤더 X로 닫힘,
  C2 Accept → 새 페이지 로드 → 배너 미노출 + 세션 consent granted(DB),
  C3 Decline 동일, C4 localStorage 삭제 → 배너 재노출, C5 버전 bump 시 재노출.
- 스테이징 배포(widget 재빌드) 후 ambshop-dev에서 C1~C2 실측.
