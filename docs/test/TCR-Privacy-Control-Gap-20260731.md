# 개인정보보호 통제 갭 보완 — 테스트 케이스 및 결과

| 항목 | 내용 |
|---|---|
| 문서 ID | TCR-Privacy-Control-Gap-20260731 |
| 연관 | REQ/PLN-Privacy-Control-Gap-20260731, PR #39~#43 |
| 작성일 | 2026-07-31 |
| 결과 | **전체 통과** — 25 suites / 225 tests (jest), api·web·widget `tsc --noEmit` clean, 실부팅 검증 3회(스테이지별+최종) 성공 |

## 1. 단위 테스트 (신규/확장 스펙)

### Stage 1-2 — 동의 fail-closed + 테넌트 고지 (PR #40)

| ID | 스펙 | 케이스 | 결과 |
|---|---|---|---|
| T-C01 | `session.service.spec` (14) | setConsent 상태 전이·버전 스탬프·캐시 무효화, getEffectiveConsent 매트릭스(granted/current, granted/outdated→pending, declined, pending), 테넌트 버전 fallback | PASS |
| T-C02 | `chat.service.spec` | PENDING 차단(기존 허용→fail-closed), DECLINED 차단, **구버전 GRANTED 차단**, 정상 GRANTED 진행, 철회 회귀(fresh read가 stale 객체 무시) — 차단 시 저장·AI·CJM·moderation 0건 검증 | PASS |
| T-C03 | `scenario.service.spec` (3) | 미동의 시 시나리오 경로 AI 미호출(기존 무검사 경로) | PASS |
| T-C04 | `tenant.service.spec` (3) | privacy-notice 갱신·조회·검증 | PASS |

### Stage 3 — 비밀번호 정책 (PR #41)

| ID | 스펙 | 케이스 | 결과 |
|---|---|---|---|
| T-P01 | `password-policy.util.spec` | 경계값(11/12자), 문자류 3/4 계산, 블록리스트 1,286종(원형+숫자접미 코어 매칭), identity 파생(이메일 local-part/이름 ≥4자), 재사용 금지, 유니코드/공백, **생성기 100회 루프 전건 통과** | PASS |
| T-P02 | `auth.service.spec` 확장 | 약한 비밀번호 → E1009 + 해시 미기록, 규칙 키 `details.password` 노출, 기존 로그인 무영향 | PASS |

### Stage 4+6 — 감사·알림 억제 (PR #39)

| ID | 스펙 | 케이스 | 결과 |
|---|---|---|---|
| T-A01 | `audit.service.spec` | AsyncLocalStorage 컨텍스트 자동 주입(ip/request_id), 명시 파라미터 우선, `system` actor 저장, 기존 최소 호출 호환 | PASS |
| T-N01 | `notification.service.spec` | 억제 매트릭스: 고객 미식별→외부 차단(in_app 유지), 마케팅(event/review) 무행→차단(D-4), 거래성(payment/shipping) 무행→허용, 행 disabled→차단, opt-out 전 채널 0건, 재동의 복구 | PASS |
| T-N02 | privacy opt-out | setOptOut 단일 bulk upsert가 12행(3채널×4카테고리) 그리드 생성 | PASS |

### Stage 5 — AI egress PII 최소화 (PR #42)

| ID | 스펙 | 케이스 | 결과 |
|---|---|---|---|
| T-S01 | `pii-scrub.util.spec` (58) | 패턴별 양성(EMAIL/PHONE 국제·미·한/CARD Luhn/ORDER en·es·ko/ADDR), 오탐 가드(날짜·시각·가격·zip·IPv4·semver·URL·SKU·9자리 미만), 혼합 문장, 한국어(전화+주문번호), 멱등성, counts 정확성 | PASS |
| T-S02 | `chat.service.spec` 확장 | egress 사본에 `[EMAIL]`/`[ORDER]` 치환 + 원문 미포함, classifyIntent/answer 동일 사본, **DB 저장 원문 무손상** | PASS |

## 2. 통합 검증

| 항목 | 방법 | 결과 |
|---|---|---|
| 전체 회귀 | `npx jest` (머지된 main) | 25 suites / 225 tests PASS |
| 타입 무결성 | api·web·widget `tsc --noEmit` | clean |
| 실부팅 (엔티티 변경 A-1 함정) | dev DB(:3316) 대상 `node dist/main.js` — Stage1-2 후, Stage4+6 리베이스 후, 최종 main 3회 | `Nest application successfully started`, ERROR 0 |
| synchronize 스키마 반영 | dev DB에 tenants 2컬럼 + audit_logs 4컬럼 자동 반영 확인(부팅 성공으로 검증) | PASS |

## 3. 미실행(후속 필요) 테스트

- [ ] **staging 스모크**: 마이그레이션 2건 선적용 후 배포 → 위젯 동의 배너 신규 UX, `/privacy-notice` 콘솔 화면, 비밀번호 변경 모달 실사용 확인 (배포 자체가 미실행 — RPT 참조)
- [ ] e2e HTTP(supertest) — 저장소 전반의 기존 갭(CLAUDE.md §6), 본 건 범위 외
- [ ] 위젯/웹 자동화 테스트 — 테스트 하니스 부재(기존 갭), typecheck로만 검증

## 4. 엣지 케이스 기록

- 동의 철회 직후 30초 Redis 캐시 stale 문제 → 메시지 경로가 `loadConsentFresh`로 DB 직독(T-C02 철회 회귀로 고정)
- `Password123!` 류(블록 단어+장식) → 알파벳 코어 매칭으로 차단(T-P01)
- Luhn 실패 13-15자리 구분자 숫자열 → `[PHONE]` 폴백, SSN 형태 → `[PHONE]`(어느 쪽이든 PII 마스킹) — 허용된 트레이드오프로 스펙에 명문화
- 시나리오 버튼 경로는 스크럽 미결선이 **설계 정답**(정적 스크립트만 egress, moderated.text가 고객 전달 본문) — 주석+본 문서로 고정
