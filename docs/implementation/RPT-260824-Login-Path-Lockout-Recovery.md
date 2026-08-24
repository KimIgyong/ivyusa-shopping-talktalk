# RPT-260824 — 테넌트 로그인 /user/{slug} + 잠금 복구 + 임시비밀번호 이메일

- 요구사항: `/{slug}` → `/user/{slug}` 경로 변경 · 잠금 시 [비밀번호 변경]/[임시비밀번호 요청]
  버튼 · 임시비밀번호 관리자 생성 또는 이메일 발송
- 문서 체인: REQ-260824 → PLN-260824(승인) → TCR-260824 → 본 RPT
- **배포 상태: PR #356 (`805199a`) main 머지 + 스테이징 배포·E2E 검증 완료 (2026-08-24)**
- 스키마 변경 없음 — 마이그레이션 불필요. 신규 env 없음(기존 `APP_PUBLIC_URL` 재사용).

## 1. 무엇이 바뀌었나

### S1 — 경로
- `/user/:tenantSlug` = 테넌트 로그인. 구 `/:tenantSlug`는 **쿼리·해시 보존 리다이렉트로
  무기한 유지**(ama_token SSO·북마크·매뉴얼 링크 무중단). 예약 슬러그 `user` 추가.
- URL 생성 일원화: `apps/web/src/lib/tenant-path.ts`의 `tenantLoginPath()` — api-client
  401 복귀·사이드바 로그아웃·랜딩 2곳·어드민 loginUrl·트러블 힌트 표기 전부 이걸 쓴다.
- 매뉴얼 12파일 + GUIDE 2건의 로그인 URL 표기 `/user/{slug}`로 갱신.

### S2 — 백엔드 (auth 도메인, 모두 @Public)
- `POST /auth/password/temp-request` — 임시비밀번호 발급+이메일. 중립 응답(계정 존재
  무관 `{requested:true}`), 계정당 3회/시간·IP당 10회/시간(`E1013`), SMTP 미설정 `E1014`,
  발급이 곧 잠금 해제(기존 관리자 발급과 동일 규칙).
- `POST /auth/password/change` — 현재/임시 비밀번호 검증 후 변경. **잠금 중에도 동작**,
  전용 쿼터(5회/시간, 상시 집계)로 우회 차단, 실패는 로그인 카운터에도 가산. 성공 시
  `must_change=0`·`password_changed_at=NOW`(리프레시 무효)·잠금 클리어.
- `LoginRateLimitService`에 범용 쿼터(`assertQuota`/`bumpQuota`) 추가.
- 감사로그: `user.temp_password_requested` / `user.password_changed_self` (PII 마스킹).
- 메일 문안 공용화 `global/util/temp-password-mail.util.ts` (en+ko 고정, 링크 베이스는
  요청 헤더가 아닌 서버 설정 `APP_PUBLIC_URL`만 사용 — 피싱 벡터 차단).

### S3 — 프런트 잠금 복구 UI
- 잠금(E1008) 배너에 버튼 2종 → 로그인 폼 자리에 인라인 패널(`PasswordRecoveryPanel`):
  임시비밀번호 요청(중립 확인 문구) / 비밀번호 변경(규칙 라이브 힌트, 기존 정책 미러 재사용).
- i18n 신규 키 auth 13종 + users 5종 × 6개 언어, `i18n:check` 통과.
- `PasswordField`/규칙 상수를 `PasswordField.tsx`로 추출(ChangePasswordModal과 공유).

### S4 — 관리자 이메일 발송
- `POST /users/:id/temp-password`·어드민 동형 라우트에 `send_email` 옵션(기본 false=현행).
- 콘솔 /users + 어드민 테넌트 사용자: 발급 확인 다이얼로그(발송 체크박스, 기본 ON) +
  결과 모달에 발송 성공/실패 표시. 실패 시에도 평문 유지(수동 전달 폴백).

### 파생 수정 2건
1. **api-client 401 인터셉터**: 공개 인증 시도(로그인/SSO/MFA verify/복구)의 401까지
   로그인 페이지로 리다이렉트해 에러 피드백을 삼키고, tenantSlug 미저장 신규 방문자를
   랜딩으로 튕기던 결함 — 요청 URL 판별로 제외. (로컬 E2E I6에서 검출; 기존에도 잠재)
2. CI env 템플릿 완전성 검사 대응: 신규 env(`PUBLIC_WEB_BASE_URL`) 도입 대신 기존
   `APP_PUBLIC_URL` 재사용으로 전환(아메바 재사용 원칙, 스테이징 기설정).

## 2. 파일 (61 files, +1,638/−119 — PR #356)

- API 신규: `auth/password-recovery.service(.spec).ts`, `auth/dto/request/password-recovery.request.ts`, `global/util/temp-password-mail.util.ts`
- API 수정: `auth.controller/module`, `login-rate-limit.service`, `user.service(+spec)/controller`, `admin-tenant-user.controller`, `user.request.ts`, `error-code.constant.ts`(E1013/E1014), `reserved-slug.constant.ts`
- Web 신규: `lib/tenant-path.ts`, `auth/PasswordRecoveryPanel.tsx`, `auth/PasswordField.tsx`
- Web 수정: `AppRouter`(LegacySlugRedirect), `api-client`, `Sidebar`, `LandingPage`, `TenantUsersPage`, `LoginTroubleHint`, `TenantLoginPage`, `auth.service`, `ChangePasswordModal`, `UsersPage`, `users/admin service·hooks`, locales 12파일
- 문서/매뉴얼: REQ·PLN·TCR + `public/manual` 12파일, GUIDE 2건 표기 갱신

## 3. 테스트 결과

- 단위: 신규 14케이스 포함 **138 suites / 1,516 tests 전체 통과**; typecheck·build 그린.
- 로컬 E2E(TCR §2): 잠금 재현→버튼→변경→해제→신규 비밀번호 로그인 실증(브라우저).
- **스테이징 E2E (2026-08-24, 배포 직후)**:
  | 체크 | 결과 |
  |---|---|
  | 부팅 `successfully started` · health 200 | ✅ |
  | `/user/ivyusa` 200 · 구 `/ivyusa` 200(클라 리다이렉트) · `/manual/` 무영향 | ✅ |
  | temp-request 부재 계정 → 201 중립 응답 | ✅ |
  | temp-request 실계정(일회용 검증 계정) → **실메일 수신**(no-reply@amoeba.site, 문안·신경로 링크 확인) | ✅ |
  | 임시비밀번호 로그인 → `mustChangePassword: true` | ✅ |
  | `password/change`(임시→새 비밀번호) 201 → 새 비밀번호 로그인 성공 | ✅ |
  | 관리자 발급 `send_email:true` → `emailSent:true` + 두 번째 실메일 수신 | ✅ |
  | 감사로그 3종(`requested`/`changed_self`/`issued`) PII 마스킹 기록 | ✅ |
  | 검증용 계정(users.id=27) 삭제 정리 | ✅ |
- 잔여(육안): 스테이징 UI에서 잠금 배너/패널 실브라우저 확인(로컬에서는 실증 완료),
  콘솔 /users 발급 다이얼로그 육안 확인.

## 4. 운영 메모

- 임시비밀번호 메일 발신자: `no-reply@amoeba.site` (기존 SMTP 설정). 메일 링크 베이스는
  `APP_PUBLIC_URL`(스테이징 = https://shoptalk.amoeba.site).
- 요청 제한 (Redis, 1시간 창): temp-request 계정 3/IP 10 · change 계정 5/IP 15.
  로그인 잠금(10분 창 10/20)과 독립 집계.
- ama 포털의 iframe URL은 구경로여도 동작(리다이렉트) — 여유 시 신경로로 갱신 권장(백로그).
- 예방 패턴(재발 방지): ① 공개 인증 엔드포인트를 늘릴 때 api-client 401 인터셉터의
  제외 목록(`isPublicAuthAttempt`)에 추가할 것. ② 새 env를 만들기 전에 동일 목적의
  기존 키(APP_PUBLIC_URL 등)를 먼저 찾을 것 — CI env 템플릿 검사가 게이트다.
