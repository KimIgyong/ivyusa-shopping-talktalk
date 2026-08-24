# PLN-260824 어드민 관리자 초대 구현 계획

- 근거: `docs/analysis/REQ-260824-Admin-Account-Invite.md`
- 특징: **스키마 변경 없음**(마이그레이션 불필요) — 기존 admin_users 컬럼 + 테넌트 초대 인프라 재사용

## 핵심 설계 결정

| # | 결정 | 근거 |
|---|---|---|
| D1 | 토큰 없는 초대(임시비밀번호 1회 노출 + 이메일 옵션) | 테넌트 쪽 invitations 토큰·accept UI가 실사용되지 않는 경로임이 확인됨 — 실사용 패턴(임시비번+강제변경)만 채택 |
| D2 | 전 엔드포인트 `@AdminOnly(ADMIN_LEVEL.SUPER_ADMIN)` | 예약된 admin_account.manage(super 전용) 정책과 정합 — 레벨 인자 첫 실사용 |
| D3 | `loginAdmin` suspended 거부를 이번 PR에 포함 | 비활성화 기능의 전제(현재는 갭) — E1002 동일 응답 + warn |
| D4 | `buildTempPasswordMail`을 loginPath 매개변수로 일반화 | 어드민 링크는 `/admin/login` — sibling 함수 대신 한 함수 유지(호출 3곳 수정) |
| D5 | 마지막 활성 super_admin 보호(E2004) + 자기 자신 비활성화 금지 | 플랫폼 잠금사고 방지 |

## API (신규 `apps/api/src/domain/auth/admin-user.controller.ts` + `admin-user.service.ts`)

| 메서드/경로 | 동작 | 가드 |
|---|---|---|
| `GET /admin-users` | 목록: id·email·level·status·mustChangePassword·createdAt | `@AdminOnly(SUPER_ADMIN)` |
| `POST /admin-users/invite` | `{email, level, send_email?}` → 행 생성(active, mustChange=1) + 임시비밀번호 반환 + 메일 옵션. 중복 E2002 | 〃 |
| `POST /admin-users/:id/temp-password` | `{send_email?}` → 재발급 + mustChange=1 + `clearAccountLock('admin', email)` | 〃 |
| `PATCH /admin-users/:id/status` | `{status: active\|suspended}` — 자기 자신 금지·마지막 활성 super_admin 금지(E2004) | 〃 |

- 응답: `{ adminId, tempPassword, emailSent }` (초대/재발급 — 테넌트 TempPasswordResult와 동형).
- 감사: `admin.invited`(level 포함)/`admin.temp_password_issued`(emailSent)/`admin.status_changed`(to) — tenantId null, target `admin:{id} {maskPii(email)}`.
- `auth.service.loginAdmin`: `status !== 'active'` → E1002 + `logger.warn`(4xx 무로그 함정).
- 에러코드: `E2004 LAST_SUPER_ADMIN` 신설("The last active super admin cannot be deactivated").
- 유닛 스펙 `admin-user.service.spec.ts`: 중복 이메일 / 초대 산출물(mustChange·bcrypt 호출·정책 통과 임시비번) / 재발급이 잠금 해제 호출 / 자기 자신 비활성 거부 / 마지막 super 비활성 거부(E2004) / suspended 로그인 거부(auth.service 스펙 확장) / 레벨 가드는 기존 authorization.guard.spec 기구현.

## 메일 (D4)

`temp-password-mail.util.ts`: `buildTempPasswordMail(baseUrl, loginPath, email, tempPassword)`로 일반화 — 호출부가 `tenantLoginPath(slug)`(사용자 셀프·관리자 발급) 또는 `'/admin/login'`(어드민)을 전달. 제목·이중언어(en+ko) 본문 형식 유지. 기존 호출 2곳(#356) 동반 수정 + 스펙 갱신.

## 프런트 (apps/web)

- `lib/types.ts`: `Principal.level?: 'super_admin' | 'admin'` 타입 교정(현 `number` 오기, 사용처 0).
- `nav-config.ts`: `NavItem.superAdminOnly?: true` 도입, `Sidebar`가 `principal.level`로 필터. `ADMIN_NAV`에 `{ to: '/admin/admins', labelKey: 'admins', superAdminOnly: true }` 추가.
- `AppRouter`: `/admin/admins` lazy 라우트.
- `domain/admin/AdminUsersPage.tsx` 신설 — `TenantUsersPage` 문법 재사용. `admin.service.ts`/`admin.hooks.ts`에 listAdmins/inviteAdmin/issueAdminTempPassword/setAdminStatus + react-query 키 `['admin','admins']`, 토스트(성공 auto/실패 sticky).
- admin 레벨이 URL 직접 진입 시: 서버 403 → 페이지에 권한 안내 문구 표시.
- i18n: 신규 네임스페이스 `adminUsers` (~22키) + `nav.admins` — 6언어.

### 와이어프레임 — `/admin/admins`

```
┌ 어드민 관리자                          [+ 초대] ┐
│ ┌───────────────────────────────────────────┐ │
│ │ 이메일             레벨        상태   액션    │ │
│ │ admin@amoeba.group 슈퍼관리자  활성  [임시비번]│ │
│ │ ops@amoeba.group   관리자     활성  [임시비번]│ │
│ │                                  [비활성화]  │ │
│ └───────────────────────────────────────────┘ │
└───────────────────────────────────────────────┘

┌ 어드민 초대 ──────────────────────┐  ┌ 임시비밀번호 발급됨 ─────────────┐
│ 이메일  [ops2@amoeba.group     ]  │  │ ops2@amoeba.group              │
│ 레벨    [관리자 ▾]                │  │ ┌──────────────────┐          │
│         (슈퍼관리자/관리자)         │  │ │ IvyK7Q2MA3B9X!   │ [복사]    │
│ ☐ 이메일로 임시비밀번호 발송         │  │ └──────────────────┘          │
│              [취소]  [초대]        │  │ 이 창을 닫으면 다시 볼 수 없습니다 │
└──────────────────────────────────┘  │ (메일 발송됨/실패 표시)  [닫기]   │
                                      └────────────────────────────────┘
```

## 단계

| 단계 | 내용 |
|---|---|
| W1 | 백엔드: admin-user service/controller, E2004, loginAdmin status 가드, 메일 유틸 일반화, 유닛 스펙 |
| W2 | 웹: 페이지·라우트·nav(super 필터)·service/hooks·level 타입 교정 |
| W3 | i18n 6언어·TCR·RPT·SPEC §7 갱신 — **Migration 섹션 불필요(스키마 무변경)** |

## 부수영향 분석

- `buildTempPasswordMail` 시그니처 변경 → #356 호출 2곳·스펙 동반 수정(동일 PR, 컴파일로 강제).
- `loginAdmin` status 가드: 기존 시드 admin@는 active라 무영향. suspended 어드민의 refresh 토큰은 다음 로그인부터 차단(세션 즉시 강제만료는 범위 밖 — 감사에 기록).
- `ADMIN_NAV` 필터 도입: 기존 항목은 필터 미지정이라 무회귀.
- 마이그레이션·SQL 없음 → 스테이징은 코드 배포만.

## 테스트 개요 (TCR에서 상세화)

유닛 ~8케이스(위 스펙 목록). 수동(스테이징): super(admin@)로 초대→메일 수신 확인→신규 어드민 임시비번 로그인→강제 변경→목록 반영 / admin 레벨 계정으로 메뉴 미노출+API 403 / 비활성화→로그인 즉시 거부 / 마지막 super 비활성화 거부 / 재발급이 잠금 해제.
