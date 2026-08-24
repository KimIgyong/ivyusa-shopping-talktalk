# TCR-260824-Login-Password-Lock-Reset

- 작성일: 2026-08-24
- 근거: `REQ-260824-Login-Password-Lock-Reset.md`, `PLN-260824-Login-Password-Lock-Reset.md`

## 1. 자동 검증

| ID | 검증 | 결과 |
|---|---|---|
| T-1 | 계정 실패 9회는 허용, 10회부터 계정 잠금 | PASS |
| T-2 | 실패 카운터 TTL이 계정/IP 모두 10분(600초) | PASS |
| T-3 | 성공 로그인 시 계정 잠금 삭제 | PASS |
| T-4 | 임시 비밀번호 발급 시 대상 계정 잠금 삭제, 강제 변경 및 감사 이벤트 유지 | PASS |
| T-5 | 계정 잠금 삭제 후에도 IP 실패 20회 제한 유지 | PASS |
| T-6 | locale 6개에 잠금 해제 안내 키 존재 | PASS |
| T-7 | API 및 web TypeScript 타입 검사 | PASS |
| T-8 | monorepo production build | PASS |

실행 결과:

```text
npm run test --workspace @ivy/api -- --runInBand \
  src/domain/auth/login-rate-limit.service.spec.ts \
  src/domain/user/user.service.labels.spec.ts \
  src/domain/user/user.service.temp-password.spec.ts

3 suites / 11 tests passed
npm run i18n:check: complete (es, ko, vi, ja, zh)
npm run typecheck: 9 tasks successful
npm run build: 6 tasks successful
```

## 2. 수동 운영 확인

스테이징에는 아직 배포하지 않았다. 배포 후 권한 있는 운영자가 팀 관리에서 대상 사용자의
임시 비밀번호를 발급하고, 생성된 비밀번호로 즉시 로그인해 비밀번호 변경 화면으로 이동하는
시나리오를 확인해야 한다. 동일 IP가 20회 제한에 걸린 경우 429가 유지되는 것은 의도된
보안 동작이다.

