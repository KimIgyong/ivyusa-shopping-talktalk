# REQ-260824 샵톡 어드민 — 어드민 관리자 초대

- 작성일: 2026-08-24
- 요청 유형: [요구사항] — 플랫폼 어드민(샵톡 어드민)에서 어드민 관리자 계정을 초대·관리하는 기능

## 0. 요구사항 원문

샵톡 어드민 - 어드민 관리자 초대 기능 구현.

## 1. AS-IS

### 어드민 계정 생성 경로가 없다
- `admin_users` 엔티티는 존재(email UNIQUE, password_hash nullable, `level` super_admin|admin, `status` active 기본, **`must_change_password` 기본 1**, password_changed_at)하지만 **CRUD API·서비스·컨트롤러가 전무**. 유일한 생성 경로는 시드(`seed.runner.ts` — admin@amoeba.group super_admin 업서트)뿐.
- 이 기능을 위해 예약된 캐퍼빌리티가 이미 있다: `CAPABILITY.ADMIN_ACCOUNT_MANAGE`('admin_account.manage') — permission-matrix에서 **super_admin에게만 부여**되어 있으나 참조하는 컨트롤러 0곳.
- `@AdminOnly(level)` 데코레이터·가드는 레벨 인자를 지원하지만 **현재 18개 호출 전부 무인자** — super_admin과 admin의 구분이 HTTP 계층에서 한 번도 실사용된 적 없음. 본 기능이 첫 실사용 지점.

### 재사용 가능한 초대 인프라 (테넌트 사용자용, PR #24·f054b1d·#354·#356)
- 테넌트 초대 흐름: 계정 행 생성 + `generateTempPassword()`(정책 통과 보장, `Ivy…!` 형태) + bcrypt 12 + `mustChangePassword=1` → **임시비밀번호 1회 노출**(+#356부터 `send_email` 옵션으로 메일 발송). `invitations` 토큰 테이블도 있으나 **accept-invite UI가 실제로는 없고 임시비밀번호 로그인 경로만 실사용**됨. invitations는 `tenant_id NOT NULL`이라 어드민에 그대로 못 씀.
- 메일: `MailerService`(SMTP_HOST 존재 시 configured, 실패 무해) + `buildTempPasswordMail(baseUrl, tenantSlug, …)` — 로그인 링크가 `/user/{slug}` 하드코딩이라 어드민용(`/admin/login`)으로는 일반화 필요. `APP_PUBLIC_URL` env 기존재.
- 임시비밀번호 재발급이 계정 잠금 해제 훅(`clearAccountLock`)을 겸함(#354 패턴).

### 발견된 보안 갭 (본 건에서 수정)
- **`loginAdmin`이 `status`를 검사하지 않는다** — 어드민을 suspended로 바꿔도 로그인 가능(테넌트 사용자 로그인은 suspended 거부). 비활성화 기능이 의미를 가지려면 필수 수정.
- 웹 `Principal.level` 타입이 `number`로 오기(실제는 `'super_admin'|'admin'` 문자열) — super_admin 전용 UI 게이팅의 전제 수정.
- `ADMIN_NAV`에 레벨 필터 개념 없음(전 어드민에게 전 메뉴 노출).

### UI 모델
- 어드민 라우트는 `/admin/*`(ProtectedRoute actorType=admin), 사이드바 `ADMIN_NAV`. 본뜰 화면 = `TenantUsersPage`(초대 모달, 임시비밀번호 1회 노출+복사, 이메일 발송 체크, 상태 토글) — 어드민 관리자 페이지는 같은 문법의 `/admin/admins`가 자연스러움.

## 2. TO-BE

### R1. 어드민 관리자 목록·초대 (super_admin 전용)
- `/admin/admins` 페이지: 어드민 목록(이메일·레벨·상태·비밀번호 변경 필요 여부·생성일) + [초대] 버튼.
- 초대: 이메일 + 레벨(super_admin/admin) 입력, [이메일로 임시비밀번호 발송] 체크 옵션 → 계정 생성(`status active`, `mustChangePassword=1`) + **임시비밀번호 1회 노출**(복사 버튼), 체크 시 어드민 로그인 링크(`{APP_PUBLIC_URL}/admin/login`) 포함 메일 발송. 이메일 중복은 E2002.
- 초대된 어드민은 임시비밀번호로 `/admin/login` 로그인 → 기존 강제 비밀번호 변경 플로우(기구현) → MFA 등록(기존 어드민 MFA 기구현).
- 토큰형 초대는 도입하지 않음(테넌트 쪽에서도 실사용 안 되는 경로 — 적정기술).

### R2. 임시비밀번호 재발급
- 목록에서 [임시비밀번호] → 재발급 + `mustChangePassword=1` + **계정 잠금 해제**(`clearAccountLock('admin', email)`) + 1회 노출/이메일 옵션 — 테넌트 흐름과 동일 문법.

### R3. 활성/비활성 (+로그인 차단 갭 수정)
- 상태 토글(active ↔ suspended). **`loginAdmin`에 suspended 거부 추가**(E1002와 동일 응답 — 존재 노출 방지, 서버 warn).
- 안전장치: ① 자기 자신은 비활성화 불가 ② **마지막 활성 super_admin은 비활성화 불가**(신규 E2004) — 플랫폼 잠금사고 방지.

### R4. 권한·감사
- 전 엔드포인트 `@AdminOnly(ADMIN_LEVEL.SUPER_ADMIN)` (admin 레벨은 403) — 예약돼 있던 admin_account.manage 정책과 정합.
- 감사: `admin.invited` / `admin.temp_password_issued` / `admin.status_changed` (tenantId null, target은 `maskPii(email)`, 비밀번호 미기록).
- 웹: `Principal.level` 타입 교정, `ADMIN_NAV`에 super_admin 전용 항목 필터 도입(어드민관리 메뉴는 super에게만 노출; admin 레벨이 URL 직접 진입 시 서버 403 + 페이지 안내).

## 3. 사용자 플로우

1. super_admin이 `/admin/admins` → [초대] → 이메일·레벨 입력(+메일 발송 체크) → 임시비밀번호 1회 노출 모달(복사) / 대상자 메일 수신.
2. 신규 어드민이 `/admin/login`에서 임시비밀번호 로그인 → 강제 비밀번호 변경 → (권장) MFA 등록 → 콘솔 사용.
3. 퇴사 시 super_admin이 상태를 비활성으로 → 즉시 로그인 불가.
4. admin 레벨 관리자는 해당 메뉴가 보이지 않고 API도 403.

## 4. 제약·전제

- **스키마 변경 없음** — admin_users 기존 컬럼으로 충족(name 컬럼 등 확장은 범위 밖). 마이그레이션·SQL 불필요.
- bcrypt 12·`generateTempPassword()`·감사 컨벤션·메일 fail-soft(미설정 시 발송 생략, 응답에 emailSent 반영) 전부 기존 규약 재사용.
- `buildTempPasswordMail`은 로그인 경로 매개변수로 일반화(호출 3곳: 사용자 셀프/관리자 발급/어드민 초대) — #356 코드와 호환 유지.
- i18n 6언어, 저장/발급 토스트 MUST, 에러코드 E2004(마지막 super_admin 보호) 신설.
- 범위 밖(백로그): 어드민 name 컬럼·표시명, 어드민 MFA 리셋 라우트, 레벨 변경 UI, 어드민용 셀프 비밀번호 복구(#356은 테넌트 전용), 초대 만료/토큰 링크.
