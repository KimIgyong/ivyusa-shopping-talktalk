# PLN-260824-Login-Password-Lock-Reset

- 작성일: 2026-08-24
- 승인: 사용자 in-chat("요구사항 수정 , 작업계획서 수정 후 진행")
- 근거: `REQ-260824-Login-Password-Lock-Reset.md`

## 1. 결정

새 관리 API를 추가하지 않는다. 기존 임시 비밀번호 발급은 이미 권한 검사, 테넌트 경계,
일회성 평문 응답, 강제 비밀번호 변경, 감사 로그를 갖춘 복구 경로다. 이 성공 경로에
**계정별** 로그인 실패 카운터 삭제만 추가한다.

계정별 실패 한도는 5회에서 10회로, Redis 실패 카운터 TTL은 15분에서 10분으로 변경한다.
IP 실패 한도는 20회로 유지한다. IP 카운터는 삭제하지 않는다. 계정 복구 요청으로 공유
네트워크의 공격 방어를 해제하지 않기 위함이다.

## 2. 변경 설계

| 단계 | 파일 | 변경 |
|---|---|---|
| P1 | `apps/api/src/domain/auth/login-rate-limit.service.ts` | 계정 실패 한도 10회, TTL 10분으로 변경한다. 계정 키만 삭제하는 공개 메서드 `clearAccountLock(scope, email)`를 추가한다. IP 키를 받거나 삭제하지 않는다. |
| P2 | `apps/api/src/domain/user/user.service.ts` | `LoginRateLimitService`를 주입하고 `issueTempPassword()`에서 사용자 저장 성공 후 `clearAccountLock('user', user.email)`을 호출한다. |
| P3 | `apps/api/src/domain/user/user.service.spec.ts` 또는 전용 spec | 임시 비밀번호 발급이 계정 잠금을 해제하고, 테넌트 경계·감사 이벤트·강제 변경 상태를 유지함을 검증한다. |
| P4 | `apps/api/src/domain/auth/login-rate-limit.service.spec.ts` | 계정 잠금만 삭제되고 같은 IP의 IP 잠금은 유지되는 사례를 추가한다. |
| P5 | `apps/web/src/domain/users/UsersPage.tsx` 및 locale 6개 | 기존 임시 비밀번호 성공 모달에 "로그인 잠금이 해제되었습니다" 안내를 추가한다. 모든 표시 문구는 i18n 키로 등록한다. |
| P6 | `apps/web/src/domain/admin/TenantUsersPage.tsx` 및 locale 6개 | 플랫폼 관리자의 동일 성공 모달에도 같은 안내를 표시한다. |

`UserService.issueTempPassword()`는 tenant console과 platform admin controller가 공통으로 호출하므로
P2만으로 두 관리 표면이 일관되게 동작한다.

## 3. UI 와이어프레임

### 3-1. 팀 관리 - 임시 비밀번호 재설정 성공

```text
┌────────────────────────────────────────────┐
│ 임시 비밀번호 발급                    [X]   │
├────────────────────────────────────────────┤
│ user@example.com 의 새 임시 비밀번호입니다. │
│                                              │
│ ┌────────────────────────────────────────┐ │
│ │ IvyK7Q2MA3B9X!                   [복사] │ │
│ └────────────────────────────────────────┘ │
│ 이 비밀번호는 지금 한 번만 표시됩니다.      │
│                                              │
│ ✓ 로그인 잠금이 해제되었습니다.             │
│   로그인 후 비밀번호를 변경해야 합니다.     │
│                                              │
│                         [확인]              │
└────────────────────────────────────────────┘
```

기존 모달의 1회 표시/복사 동작과 임시 비밀번호 발급 성공 토스트를 유지한다. 새 안내는
성공 결과가 화면에 즉시 드러나는 보조 설명이다.

## 4. API 및 데이터 영향

| 항목 | 영향 |
|---|---|
| HTTP API | 기존 `POST /users/:id/temp-password`, `POST /tenants/:tenantUuid/users/:userId/temp-password`의 성공 부수 효과만 추가 |
| DB schema | 없음 |
| Redis | `login:fail:acct:user:<lowercase email>` 키만 삭제 |
| Audit | 기존 `user.temp_password_issued` 유지, 평문 비밀번호 미기록 |
| Migration | 불필요 |

## 5. 테스트 계획

| ID | 시나리오 | 기대 결과 |
|---|---|---|
| T-1 | 계정 실패 9회/10회 | 9회는 허용, 10회부터 E1008 |
| T-2 | 첫 실패 후 10분 TTL | 계정/IP 실패 키의 만료 시간이 10분으로 설정 |
| T-3 | 계정 실패 10회 뒤 임시 비밀번호 발급 | 계정 키가 삭제되고 새 임시 비밀번호 로그인 가능 |
| T-4 | 같은 IP의 IP 실패 20회 뒤 임시 비밀번호 발급 | 계정 키만 삭제되며 IP 제한은 유지 |
| T-5 | 다른 tenant의 user ID로 재설정 | `TENANT_MISMATCH`, Redis 키 변경 없음 |
| T-6 | 임시 비밀번호 로그인 | `mustChangePassword=true`, 변경 전 보호 라우트 403 |
| T-7 | 콘솔/플랫폼 관리자 성공 모달 | 6개 locale에 잠금 해제 안내가 표시 |

검증 명령은 변경된 API와 web workspace의 관련 Jest 테스트, `npm run typecheck`,
`npm run i18n:check`를 사용한다.

## 6. 롤백

코드를 이전 버전으로 되돌리면 이후 재설정 요청은 기존처럼 임시 비밀번호만 발급한다.
이미 삭제된 Redis 실패 카운터는 복구하지 않는다. 이는 15분 만료되는 보안 보조 데이터이며,
대상 계정은 새 임시 비밀번호와 강제 변경으로 계속 보호된다.

## 7. 구현 결과

승인에 따라 P1~P6을 구현했다. 결과와 검증은
`TCR-260824-Login-Password-Lock-Reset.md` 및
`RPT-260824-Login-Password-Lock-Reset.md`에 기록한다.
