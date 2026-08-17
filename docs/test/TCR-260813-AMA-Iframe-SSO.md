# TCR-260813-AMA-Iframe-SSO

PLN-260813-AMA-Iframe-SSO 테스트 케이스·결과. 스키마 변경 없음(SQL 불요).

## 1. 단위 (jest — ama-sso.service.spec.ts 9케이스, 전체 961/961 PASS)
| # | 케이스 | 결과 |
|---|---|---|
| U1 | 교환 성공 + 매핑 성공 → ShopTalk 토큰 발급, ama_session 페이로드 검증, 감사 `auth.sso_ama`, 리미터 성공 처리 | ✅ |
| U2 | env 미설정 → E5032, 네트워크 호출 없음(기능 게이트) | ✅ |
| U3 | ama 교환 거절(non-2xx) → E5033 + 실패 카운트, 발급 미호출 | ✅ |
| U4 | ama 도달 불가(fetch throw) → E5033 | ✅ |
| U5 | 교환 성공이나 email 클레임 없음 → E5033 (감사 reason=no_email_claim) | ✅ |
| U6 | slug 테넌트에 email 일치 계정 없음 → E5034 + 실패 카운트 | ✅ |
| U7 | 사용자 suspended / 테넌트 suspended → 동일하게 E5034 | ✅ |
| U8 | 존재하지 않는 slug → E5034 (존재 여부 비노출 — 단일 코드 수렴) | ✅ |
| U9 | 레이트리밋 잠금 → 네트워크 호출 전에 차단 전파 | ✅ |

픽스처는 bigint PK 문자열 규칙 준수(id '3'/'7').

## 2. 로컬 통합 (2026-08-13, PORT=3010 실부팅)
| # | 케이스 | 결과 |
|---|---|---|
| L1 | 부팅 `successfully started` (DI/모듈 등록 검증) | ✅ |
| L2 | env 미설정 상태 `POST /auth/sso/ama` → **501 E5032** | ✅ |
| L3 | 자격증명 설정(가짜 client) + **실제 ama 운영 서버** 교환 시도 → ama 거절 → **401 E5033**, 306ms, `logger.warn` HTTP 로그 확인 | ✅ |
| L4 | web `tsc --noEmit` + `turbo build --filter=@ivy/web` | ✅ |

## 3. 스테이징 (2026-08-13 배포, PR #283 `fbab873`)
| # | 케이스 | 확인 방법 | 결과 |
|---|---|---|---|
| S1 | 콘솔 응답 헤더 `frame-ancestors 'self' https://ama.amoeba.site`, `X-Frame-Options` 제거됨 | `curl -sI https://shoptalk.amoeba.site/` | ✅ |
| S2 | 위젯 헤더 불변(프레임 제한 없음 유지) | `curl -sI .../widget/` | ✅ |
| S3 | 신규 라우트 배포 확인: env 미설정 → **501 E5032**(=배포됨+게이트 off) | `curl -X POST .../auth/sso/ama` | ✅ |
| S4 | 기존 로그인 라우트 무회귀 | `/auth/user/login` 오입력 → 401 E1002 | ✅ |

부트 로그 `successfully started`·컨테이너 재생성(Up seconds) 확인. env `AMA_SSO_*`는
ama 파트너앱 등록 전까지 의도적으로 미설정(기능 게이트 off = 안전 상태).

## 4. E2E — ama 측 준비 후 (G5/G6 대기)
| # | 시나리오 | 전제 |
|---|---|---|
| E1 | ama 메뉴 → iframe 콘솔 자동 로그인(로그인 화면 없이 대시보드), 감사 `auth.sso_ama` 1건 | ama 파트너앱 등록 + 메뉴, 스테이징 env `AMA_SSO_*` 설정 |
| E2 | ShopTalk 미등록 ama 계정 → 실패 배너(계정 미등록 문구) + 일반 로그인 폼 폴백 | 〃 |
| E3 | URL에서 ama_token 즉시 제거(주소창·히스토리에 토큰 잔존 없음) | 〃 |
| E4 | mustChangePassword 계정 SSO 진입 → 비밀번호 변경 잠금 유지 | 〃 |

## 5. 메모
- PLN §S2의 userinfo 호출은 **미사용으로 확정** — ama `/oauth/userinfo`는 email을 반환하지 않아(sub/entity_id/scopes만), 교환 성공을 검증 오라클로 삼아 ama_token 페이로드의 email 클레임을 읽는 방식으로 대체(가이드 §2c에 email 클레임 MUST 명기). env도 `AMA_SSO_USERINFO_URL` 제외 3종으로 축소.
- PR 분할(PR-A/PR-B)은 단일 PR 2커밋으로 통합 — nginx·api·web이 한 배포 단위라 분리 실익 없음.
