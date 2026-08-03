# TCR — 위젯 런처 X 숨김 + 동의 auto-replay (2026-08-04)

> 근거: `docs/plan/PLN-Widget-CloseButton-ConsentReplay-20260804.md`

## 1. 정적 검증

- `npm run typecheck` / `npm run build` 전체 통과 (widget 전용 변경, API/스키마 무변경).

## 2. 시나리오 (스테이징 실측 — ambshop-dev)

| ID | 시나리오 | 기대 결과 |
|---|---|---|
| C1 | 위젯 오픈 | 하단우측 런처 버튼이 사라지고, 패널 상단우측 X·Esc로만 닫힘. 닫으면 런처(💬 + 미읽음 배지) 복귀 |
| C2 | Privacy notice Accept → 다른 페이지로 이동(새 세션) | 배너 **미노출**, 새 세션 `consent_state=granted`가 DB에 자동 재기록(auto-replay) |
| C3 | Decline 후 페이지 이동 | 배너 미노출, 새 세션 `declined` 재기록 (설정 패널에서 변경 가능) |
| C4 | localStorage `ivy_consent` 삭제 후 새 로드 | 배너 재노출 (현행) |
| C5 | notice 버전 bump(테넌트 설정 변경) 후 새 로드 | 로컬 기록 무효화 → 배너 재노출 (재동의 정책 유지) |
| C6 | 구버전 로컬 값('granted' 평문) | replay 제외 → 배너 1회 노출 후 신형식(JSON+버전) 저장, 이후 C2 동작 |
| C7 | replay POST 실패(오프라인 등) | pending 복원 → 배너 표시 (fail-closed 유지) |
| C8 | GA4 Consent Mode | granted 로컬 기록 시 부트스트랩 게이트 동작 불변 |

## 3. 엣지 케이스 설계 확인

- replay 조건: `pending` && `!noticeOutdated` && 로컬 version === 유효 notice version — 세 조건 모두 코드로 강제.
- 언어 변경 등으로 ensure가 재실행돼 replay가 중복 호출돼도 서버 기록은 멱등(같은 세션 갱신).
- 서버 세션은 여전히 모든 선택을 세션별로 기록 — CCPA 증적 체계 불변.

## 4. 실행 기록

- 2026-08-04: 정적 검증 통과. C1~C8은 스테이징 배포 후 실측 — 결과 RPT에 기록.
