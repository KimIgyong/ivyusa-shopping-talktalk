# RPT-260813-AMA-Iframe-SSO

ama.amoeba.site iframe 임베드 허용 + ama 발행 JWT 기반 SSO 로그인 구현 결과.

- 근거: REQ-260813 / PLN-260813 (2026-08-13 권장안 D1~D6 승인) · 테스트: TCR-260813
- **PR #283** squash-merge → main `fbab873`, staging 2026-08-13 배포·검증 완료
- **스키마 변경 없음** (SQL 마이그레이션 불요)

## 1. 무엇이 생겼나
| 단계 | 구현 |
|---|---|
| S1 iframe | 콘솔 nginx `frame-ancestors 'self' https://ama.amoeba.site` (X-Frame-Options DENY 제거 — ALLOW-FROM 사장). 위젯·PWA 불변 |
| S2 API | `POST /auth/sso/ama` (@Public): ama `ama_session` 그랜트 서버간 교환(검증 오라클) → 교환 성공 시 ama_token의 email 클레임 → slug 테넌트의 활성 계정 매핑(D1/D2, 프로비저닝 없음) → 자체 JWT 발급(`AuthService.issueForSso` — D4 MFA 면제, 비밀번호변경 잠금 유지). 레이트리밋(IP+slug)·감사(`auth.sso_ama[_failed]`)·거절 warn 로그. env 3종(`AMA_SSO_TOKEN_URL/CLIENT_ID/CLIENT_SECRET`) 미설정 시 E5032 게이트 |
| S3 웹 | `/{slug}?ama_token=` 감지 → **URL 즉시 스크럽** → 로그인 중 화면 → 성공 시 일반 로그인과 동일 진입 / 실패 시 로그인 폼 + 수동닫기 배너(E5034=미등록 문구 분기, en/es/ko) |
| S4 명세 | `docs/guide/AMA-SSO-INTEGRATION.md` — ama측 파트너앱 등록·런처 URL·**ama_token email 클레임 MUST**·TTL 권고·issuer 정정 권고 |

## 2. 파일
- api: `domain/auth/ama-sso.service.ts`(+spec 9), `dto/request/ama-sso.request.ts`, `auth.controller.ts`, `auth.module.ts`, `auth.service.ts`(issueForSso), `error-code.constant.ts`(E5032~E5034)
- web: `TenantLoginPage.tsx`, `auth.service.ts`, `i18n/locales/{en,es,ko}/auth.json`
- infra/docs: `docker/staging/nginx.web.conf`, `env/backend/.env.development`, `SPEC.md §8.1`, REQ/PLN/TCR/가이드

## 3. 테스트·배포 상태
- 단위 9케이스 + 전체 1,122/1,122 PASS, api/web tsc·build green, 로컬 실부팅+실 ama 교환 거절 경로(E5033/401) 확인
- 스테이징: 헤더 ✅ · 위젯 불변 ✅ · 라우트 501 E5032(게이트 off) ✅ · 기존 로그인 무회귀 ✅
- env `AMA_SSO_*`는 **미설정 유지** — ama 파트너앱 등록(client_id/secret 수령) 후 `docker/staging` env에 추가하고 재배포하면 활성화

## 4. 설계 확정·편차
- PLN §S2의 userinfo 호출 **미사용 확정**: ama `/oauth/userinfo`는 email 미반환(sub/entity_id/scopes만) → 교환 성공을 검증 오라클로 삼아 ama_token 페이로드에서 email 추출. 가이드에 email 클레임 MUST 명기. env도 3종으로 축소
- 에러 코드 E5029~E5031 → **E5032~E5034 재번호**: 메뉴 권한 트랙(PLN-260812, 8/12 머지)이 선점
- PR-A/PR-B 분할 → 단일 PR 2커밋: nginx·api·web이 한 배포 단위라 분리 실익 없음

## 5. 남은 일 (ama 측 — G5/G6)
1. ama 파트너앱 등록(스코프 profile) → client_id/secret 전달 → 스테이징 env 설정+재배포
2. ama 메뉴/런처 추가(가이드 §2b) — ama_token에 email 클레임 포함 확인(§2c)
3. E2E: 자동 로그인·미등록 배너·토큰 스크럽·pwd잠금 유지 (TCR §4 E1~E4)

## 6. 예방 패턴
- **외부 IdP의 userinfo 스키마는 문서 아닌 실응답으로 확인** — email이 없는 userinfo였고, 설계를 교환-후-클레임-추출로 바꿔 해결(kit lesson D-2/D-3 계열).
- 병렬 트랙이 많을 땐 에러코드 블록을 **머지 직전 재확인** — 선점 충돌은 컴파일 에러가 아니라 조용한 중복으로 나타난다(이번엔 merge conflict가 잡아줌).
