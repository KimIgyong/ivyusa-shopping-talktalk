# RPT-260824 어드민 관리자 초대 — 구현 보고

- 근거: REQ/PLN/TCR-260824-Admin-Account-Invite
- 작업일: 2026-08-24 · 브랜치 `session/admin-invite-260824`

## 1. 배포 상태

| 항목 | 상태 |
|---|---|
| PR | **#360** (squash-merge, main `539c565`) |
| CI | typecheck·test·build 통과 |
| 마이그레이션 | **해당 없음** — 스키마 무변경 (admin_users 기존 컬럼만 사용) |
| 스테이징 배포 | ✅ 코드만 배포, 부팅 `successfully started`, `/admin-users` 401 |
| 수동 스모크 | ✅ **A1~A8 스테이징 실행 완료** (TCR §3) — A9(UI 육안)만 잔여 |
| 프로덕션 | 해당 없음 (호스트 미정) |

## 2. 무엇이 만들어졌나

- **어드민 계정 생성 API 첫 도입**(기존엔 시드뿐): `/admin-users` 목록·초대·임시비밀번호 재발급·상태 토글 — 전부 `@AdminOnly(SUPER_ADMIN)`. 예약돼 있던 `admin_account.manage`(super 전용) 정책과 정합하며, **`@AdminOnly` 레벨 인자의 첫 실사용**(스모크 A5에서 admin 레벨 403 실증).
- **초대**: 정책 통과 임시비밀번호 1회 노출 + `mustChangePassword` 강제, 선택 시 `/admin/login` 링크 메일(#356 인프라 재사용 — `buildTempPasswordMail`을 loginPath 매개변수로 일반화, 기존 호출부 동반 수정). 재발급은 계정 잠금 해제를 겸함.
- **보안 갭 수정**: `loginAdmin`이 status를 검사하지 않아 비활성화가 무의미하던 결함 → suspended는 E1002 동일 응답으로 거부(+warn/감사, 실패 카운터 미증가). 스모크 A6에서 실증.
- **안전장치**: 자기 자신 비활성화 금지(A7 실증), 마지막 활성 super_admin 보호(E2004 신설, 유닛 검증).
- **웹**: `/admin/admins` 페이지(초대 모달·1회 노출 모달·재발급·상태 확인 모달), 사이드바 `superAdminOnly` 필터 도입(admin 레벨엔 메뉴 미노출, URL 직접 진입 시 안내), `Principal.level` 타입 오기(number→문자열) 교정, i18n `adminUsers` 네임스페이스 6언어.

## 3. 파일 목록 (34 files, +1,333/−14)

API: `admin-user.{service,controller,mapper}.ts`+DTO+spec(신설) · `auth.service.ts`(suspended 가드)+spec · `auth.module.ts` · `error-code.constant.ts`(E2004) · `temp-password-mail.util.ts`(일반화) · `password-recovery.service.ts`/`user.service.ts`(호출부) — web: `AdminUsersPage.tsx`(신설) · `admin.{service,hooks}.ts` · `nav-config`/`Sidebar`/`AppRouter`/`types.ts` · `adminUsers.json`×6 · `nav.json`×6 — docs: REQ/PLN/TCR.

## 4. 테스트 결과

Jest **140 suites / 1,528 tests**(신규 8), typecheck·build·i18n 통과, 실부팅+401. 스테이징 스모크 A1~A8 전부 통과(스모크 계정은 실행 후 삭제, 시드 admin@만 잔존 확인).

## 5. 남은 일 / 범위 밖

- A9: 콘솔 UI 육안 확인(super 로그인 → 사이드바 [어드민 관리자]) — admin@는 MFA라 브라우저 확인은 운영자 몫.
- 범위 밖 백로그(REQ 기록): 어드민 name 컬럼, 어드민 MFA 리셋 라우트, 레벨 변경 UI, 어드민용 셀프 비밀번호 복구.
