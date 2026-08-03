# 개인정보보호 통제 갭 보완 — 구현 보고서

| 항목 | 내용 |
|---|---|
| 문서 ID | RPT-Privacy-Control-Gap-20260731 |
| 연관 | REQ/PLN/TCR-Privacy-Control-Gap-20260731 |
| 작성일 | 2026-07-31 |
| 구현 방식 | 승인 PLN 기준, 6개 병렬 작업(worktree 격리) → 순차 통합·검증·머지 |
| 승인 결정 | D-1 fail-closed(a), D-2 MFA 별도 PLN(b), D-3 기존 비밀번호 유예(a), D-4 마케팅 default-deny(a) 모두 제안대로 적용 |

## 1. 배포 상태 (PR / SHA / 환경)

| PR | 내용 | main SHA | staging | 마이그레이션 |
|---|---|---|---|---|
| #40 | Stage 1-2: 동의 fail-closed + 테넌트 고지 (api+web+widget) | `a8b6ce8` | **배포됨** (2026-07-31) | `migration_tenant_privacy_notice.sql` **적용됨** |
| #39 | Stage 4+6: 감사 컨텍스트 + 알림 억제 (api) | `869886d` | **배포됨** (2026-07-31) | `migration_audit_context.sql` **적용됨** |
| #41 | Stage 3: 비밀번호 정책 (api+web) | `3e57e0b` | **배포됨** (2026-07-31) | 없음 |
| #42 | Stage 5: AI egress PII 스크럽 (api) | `84b3c17` | **배포됨** (2026-07-31) | 없음 |
| #43 | 문서 팩: REQ/PLN + Doc-A~D | `d2943c1` | — | 없음 |

**staging 배포 완료 기록 (2026-07-31, main `47b00d4`)**: ① 스키마 백업(`~/backup-pre-privacy-20260731-052104.sql`) → ② 마이그레이션 2건 `ivy_mysql_staging` 선적용·컬럼 검증 → ③ **`DB_SYNCHRONIZE=false` 전환**(마이그레이션 런북 리허설 — SPEC §14 위반 해소, env 백업 `~/env.staging.bak-*`) → ④ `deploy-staging.sh` → ⑤ 검증: 부팅 `successfully started`, 컨테이너 재생성 확인, `GET /tenants/privacy-notice` 무토큰 **401**(배포됨), health db up, 스키마 오류 0건 → ⑥ 기능 스모크: PENDING 메시지 차단(convId 0, consent 안내) → 동의(`granted`/`2026-07`) → AI 정상 응답(convId 45) + **PII 스크럽 실동작 로그** `PII scrubbed from AI egress (conversation 45): {"email":1}`. production 미구축.

## 2. 변경 요약 (REQ 항목 매핑)

| REQ # | 구현 | 핵심 파일 |
|---:|---|---|
| 3, 5 | 동의 GRANTED-only fail-closed — PENDING·구버전 차단, 무검사였던 시나리오/상담원 경로 가드 신설, 30초 캐시 우회 fresh read, 위젯 저장 성공 후에만 배너 닫힘(실패 시 유지+재시도), 서버 정본 동기화 | `consent-policy.constant.ts`, `session.service.ts`(getEffectiveConsent/loadConsentFresh), `chat/scenario/agent.service.ts`, `ChatTab.tsx`, `ConsentBanner.tsx` |
| 2, 5 | 테넌트별 방침 URL·고지 버전(`tenants` 2컬럼), `/session/ensure` 확장(privacyPolicyUrl/consentNoticeVersion/noticeOutdated/consentAt), 버전 변경 시 재동의, 배너 고지 개편(항목/목적/보유/AI 처리자, en/es/ko), 위젯 동의 철회 섹션, 웹 콘솔 `/privacy-notice`(master/director, 경고+토스트) | `tenant.entity.ts`, `GET|PATCH /tenants/privacy-notice`, `PreferencesPanel.tsx`, `PrivacyNoticePage.tsx` |
| 14 | 12자+3문자류+블록리스트 1,286종+identity 파생+재사용 금지, DTO(`@IsStrongPassword`)+서비스 이중 검증, `E1009`(details.password 규칙 키), 임시 비밀번호 생성기 정책화, 웹 실시간 규칙 힌트. MFA는 별도 PLN(D-2) | `password-policy.util.ts`, `password-blocklist.constant.ts`, `ChangePasswordModal.tsx` |
| 15 | `audit_logs` ip/request_id/result/metadata + `system` actor(위장 `admin/0` 7곳 정정), AsyncLocalStorage 요청 컨텍스트 자동 주입, DSAR 거부 `result:'denied'` 감사 | `request-context.middleware.ts`, `audit.service.ts`, `audit-log.entity.ts` |
| 6 | 단일 억제 판정 `isSuppressed`: 고객 미식별 외부발송 차단, 마케팅(event/review) default-deny(D-4), setOptOut bulk upsert | `notification.service.ts`, `privacy.service.ts` |
| 1 | AI egress 사본만 PII 마스킹(EMAIL/PHONE/CARD-Luhn/ORDER/ADDR, 멱등, counts 로그) — 저장 원문 유지, Voyage 임베딩 쿼리 경유 포함 | `pii-scrub.util.ts`, `chat.service.ts` |
| 1, 8 | Doc-A 데이터 인벤토리(34테이블) + 보존 매트릭스 + 갭 G-1~G-10 | `docs/analysis/REQ-Data-Inventory-20260731.md` |
| 4 | Doc-B 수탁자 대장(6처리자, DPA 전부 TBD — 법무 액션 필요) | `docs/guide/PROCESSOR-REGISTER.md` |
| 16 | Doc-C 사고 대응 런북(SEV/RACI/72h 통지/훈련 템플릿) | `docs/guide/INCIDENT-RESPONSE.md` |
| 7 | Doc-D AI DPIA 게이트(현행 5개 용도 처리기록 + 신규 기능 필수 체크리스트) | `docs/guide/AI-DPIA-GATE.md` |

## 3. 테스트 결과

TCR-Privacy-Control-Gap-20260731 참조. 요약: **25 suites / 225 tests 전체 통과**(신규 약 110케이스), api·web·widget typecheck clean, dev DB 실부팅 3회 검증(`successfully started`, ERROR 0).

## 4. 행동 변경(운영 공지 필요)

1. **미동의(PENDING) 게스트 채팅 차단** — FN-008 기존 "미선택 허용"이 fail-closed로 전환(D-1). 동의 전 메시지는 저장·AI 전송 없이 안내 문구 응답.
2. **고지 버전 변경 시 전 고객 재동의** — 콘솔에서 버전 갱신하면 기존 동의가 pending 취급되어 배너 재노출.
3. **마케팅 알림(event/review) 기본 차단** — 명시적 수신 동의 행이 있어야 외부 발송. 캠페인 외부 전달은 opt-in 필요(외부 전송은 현재 mock이라 실사용 영향 없음).
4. **비밀번호 정책은 다음 변경부터** — 기존 로그인 무영향(D-3). seed `amb2026!@`는 첫 로그인 강제 변경 시 새 정책 적용됨.

## 5. 잔여 과제

| 항목 | 트랙 | 비고 |
|---|---|---|
| ~~staging 마이그레이션 2건 적용 + 배포 + 스모크~~ | 운영 | **완료(2026-07-31)** — §1 기록. `DB_SYNCHRONIZE=false` 전환 포함 |
| MFA(관리자/고권한) | 별도 REQ→PLN | D-2. Stage 3 완료로 착수 조건 충족 |
| Doc-B DPA 체결·Doc-C RACI 실명·보존 매트릭스 승인 | 법무/보안 | 문서 내 TBD 소유자 지정 필요 |
| Ops(REQ #9/#10/#11/#12): 볼륨·백업 암호화, 복구 리허설, DLP | 운영/인프라 | PLN §4 — 코드 범위 외 |
| Doc-A 갭 G-1~G-10(customers 무기한 보관, agent_alerts/moderation_logs 파기 누락 등) | 후속 PLN | 보존 매트릭스 승인 후 retention 확장 |

## 6. 재발 방지/패턴

- **병렬 구현 시 API 계약 선고정**: `/session/ensure` 확장 필드·`/tenants/privacy-notice`를 프런트/백 에이전트에 동일 명세로 고정, 라우트 복수형 편차는 진행 중 정정 전달로 흡수 — 통합 시 충돌 0건.
- **compliance 가드는 fail-closed + fresh read**: 캐시 위 동의 판정 금지(철회 회귀 테스트로 고정).
- **egress 마스킹은 사본에만**: 원문 저장·고객 전달 본문(moderation 출력)에 스크럽을 걸면 안 됨 — scenario.service 주석으로 명문화.
