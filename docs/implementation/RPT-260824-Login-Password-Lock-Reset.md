# RPT-260824-Login-Password-Lock-Reset

- 작성일: 2026-08-24
- 근거: `REQ-260824-Login-Password-Lock-Reset.md`, `PLN-260824-Login-Password-Lock-Reset.md`

## 1. 변경 사항

- 계정별 로그인 실패 한도를 5회에서 10회로, Redis 실패 카운터 TTL을 15분에서 10분으로
  변경했다. IP 실패 한도는 20회로 유지했다.
- `LoginRateLimitService.clearAccountLock()`을 추가하고, 임시 비밀번호 발급 성공 뒤 해당
  tenant user의 계정별 실패 키만 삭제하도록 했다.
- `AuthModule`에서 rate limiter를 export해 기존 `UserService` 복구 경로가 안전하게
  주입받도록 했다.
- 테넌트 콘솔과 플랫폼 관리자 콘솔의 임시 비밀번호 1회 표시 모달에 로그인 잠금 해제 안내를
  추가했다. en/es/ko/vi/ja/zh locale를 모두 등록했다.

## 2. 파일

| 영역 | 파일 |
|---|---|
| API | `apps/api/src/domain/auth/login-rate-limit.service.ts` |
| API DI | `apps/api/src/domain/auth/auth.module.ts`, `apps/api/src/domain/user/user.service.ts` |
| API tests | `apps/api/src/domain/auth/login-rate-limit.service.spec.ts`, `apps/api/src/domain/user/user.service.labels.spec.ts`, `apps/api/src/domain/user/user.service.temp-password.spec.ts` |
| Web | `apps/web/src/domain/users/UsersPage.tsx`, `apps/web/src/domain/admin/TenantUsersPage.tsx` |
| i18n | `apps/web/src/i18n/locales/{en,es,ko,vi,ja,zh}/users.json` |

## 3. 검증

`TCR-260824-Login-Password-Lock-Reset.md`의 3 suites/11 tests, i18n completeness,
monorepo typecheck 및 production build가 모두 통과했다.

## 4. 배포 상태

| 항목 | 상태 |
|---|---|
| PR | 미생성 |
| Commit | 미생성 |
| Staging | 미배포 |
| Production | 미배포 |
| Migration | 불필요 — DB schema 변경 없음 |

배포 시 migration 사전 적용은 필요 없다. staging 배포 뒤 health 200, API boot log, 그리고
임시 비밀번호 발급 후 즉시 로그인 수동 시나리오를 확인한다.
