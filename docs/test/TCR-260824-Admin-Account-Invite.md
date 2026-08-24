# TCR-260824 어드민 관리자 초대 — 테스트 케이스 & 결과

- 근거: `docs/plan/PLN-260824-Admin-Account-Invite.md`
- 실행 환경: 로컬(dev) — 2026-08-24. 스키마 변경 없음(마이그레이션 검증 불필요)

## 1. 유닛 테스트 (자동, Jest)

전체 스위트: **140 suites / 1,528 tests 통과** (신규 8케이스 포함, 회귀 0 — `buildTempPasswordMail` 시그니처 일반화에 따른 기존 #356 스펙도 전부 통과).

### `admin-user.service.spec.ts` (신설, 7케이스)
| # | 케이스 | 결과 |
|---|---|---|
| U1 | 기존 이메일 초대 거부(E2002), 대소문자 무시 정규화 | ✅ |
| U2 | 초대 산출물: active·mustChange=1·bcrypt 해시가 임시비번과 대조 검증·**정책 통과 임시비번**·감사에 평문 미포함 | ✅ |
| U3 | 메일에 `/admin/login` 링크 포함, `/user/` 경로 미포함 | ✅ |
| U4 | 재발급: mustChange=1 + `clearAccountLock('admin', email)` | ✅ |
| U5 | 자기 자신 비활성화 거부 | ✅ |
| U6 | 마지막 활성 super_admin 비활성화 거부(E2004) | ✅ |
| U7 | 다른 활성 super 존재 시 비활성화 허용 + 감사 | ✅ |

### `auth.service.spec.ts` (1케이스 추가)
| # | 케이스 | 결과 |
|---|---|---|
| U8 | suspended 어드민 로그인 = E1002(존재 비노출), active 복귀 시 정상 로그인 | ✅ |

## 2. 빌드·부팅 검증 (자동)

typecheck 9/9 · build 6/6 · `i18n:check` complete(신규 adminUsers 네임스페이스+nav 키 ×6언어) · 실부팅 `successfully started` · `/admin-users` GET/POST 무인증 **401**(404 아님).

## 3. 통합/수동 시나리오 — **스테이징 실행 완료 2026-08-24** (API 기반)

> admin@는 MFA가 걸려 있어 스모크 전용 super 계정을 DB에 임시 삽입해 실행, 종료 후 스모크 계정 2건 삭제(시드 admin@만 잔존 확인).

| # | 시나리오 | 기대 결과 | 결과 |
|---|---|---|---|
| A1 | super로 `GET /admin-users` | 목록 반환 | ✅ 시드 super 포함 목록 |
| A2 | admin 레벨 초대(send_email=false) | 임시비번 1회 반환 | ✅ 13자 정책형 임시비번, 목록 반영 |
| A3 | 동일 이메일 재초대 | E2002 | ✅ |
| A4 | 임시비번 로그인 | 성공 + mustChange=true | ✅ |
| A5 | 강제 변경 후 레벨 게이트 | 일반 어드민 API 200 / `GET /admin-users` 403 | ✅ **E1004 — 레벨 인자 게이트 첫 실검증**. 부수: 새 비번이 이메일 조각 포함 시 E1009(contains_identity)로 거부되는 것도 관측 |
| A6 | 비활성화 → 재로그인 | E1002 즉시 거부 | ✅ (보안 갭 수정 실증) |
| A7 | 자기 자신 비활성화 | 400 거부 | ✅ E5003 |
| A8 | 임시비번 재발급 | 구 비번 무효·신 비번 OK | ✅ 구 E1002 / 신 OK+mustChange |
| A9 | UI: super만 [어드민 관리자] 메뉴, admin은 미노출+안내 | 육안 | ⬜ 운영자 확인 권장 (게이팅 로직은 A5로 서버측 실증) |

## 4. 엣지 케이스 (설계/유닛으로 처리)

- 메일 미설정/실패: 응답에 emailSent=false, 평문은 항상 반환(수동 전달 폴백) — 기존 #356 계약 동일.
- 마지막 super 보호는 "다른 **활성** super" 기준 — suspended super만 남는 상태 불가.
- suspended 로그인 거부는 실패 카운터 미증가(비밀번호는 맞았으므로 재활성화 직후 잠금 방지).
- 임시비번은 정책 통과 보장(`generateTempPassword`) — 첫 로그인에서 정책 거부되는 모순 없음.
