# TCR-260808-Marketing-Integrations-Klaviyo-Yotpo

PLN-260808-Marketing-Integrations(Rev.2: +Gorgias) — PR #191 테스트 케이스·결과.

## 1. 단위 (jest — 781/781 PASS 시점 포함, 프로브 4케이스 신규)
| # | 케이스 | 결과 |
|---|---|---|
| U1 | 자격증명 누락 시 fetch 없이 short-circuit (klaviyo/yotpo/gorgias) | ✅ |
| U2 | Klaviyo: 200→connected, 필수 `revision` 헤더 포함 확인 | ✅ |
| U3 | Yotpo: access_token 수신=connected / 미수신=거부 | ✅ |
| U4 | Gorgias: 벤더 도메인 고정(subdomain 정규화) + 401→credentials invalid | ✅ |
| U5 | 기존 SSRF 가드·4개 커머스 프로브 회귀 없음 | ✅ |

## 2. 스테이징 (2026-08-08 18:36 배포)
| # | 케이스 | 결과 |
|---|---|---|
| S1 | 스키마 변경 없음 — 일반 배포, 부트 정상 | ✅ |
| S2 | `GET /tenants/me/integrations/klaviyo` → 401(배포·인증 요구) | ✅ |

## 3. 수동 E2E (사용자 스모크 — 잔여, 실 키 필요)
| # | 시나리오 | 기대 |
|---|---|---|
| E1 | /settings "마케팅 연동" Klaviyo 타일 → Private API Key 저장 → 연결 테스트 | Connected 배지 |
| E2 | Yotpo App Key+Secret 저장 → 테스트 | Connected |
| E3 | "헬프데스크 연동" Gorgias(subdomain/email/REST key) 저장 → 테스트 | Connected |
| E4 | 저장 후 재열람 | secret 마스킹("저장됨"), 비밀값 미노출 |
