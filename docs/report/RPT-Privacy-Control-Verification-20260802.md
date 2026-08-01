# 개인정보보호 통제 확인 결과

| 항목 | 내용 |
|---|---|
| 문서 ID | RPT-Privacy-Control-Verification-20260802 |
| 기준 | `docs/analysis/REQ-Privacy-Control-Gap-20260731.md`, `docs/plan/PLN-Privacy-Control-Verification-20260802.md` |
| 확인일 | 2026-08-02 |
| 방법 | 저장소 코드·구성·운영 문서 대조 및 API 단위 테스트 실행. 비밀값, 운영 고객 데이터, 계약 원문에는 접근하지 않음. |
| 판정 표기 | 충족(코드+문서 증빙) / 부분 충족(범위 또는 운영 증빙 부족) / 미충족 / 미확인(저장소 밖 증빙 필요) |

## 1. 결론

- **코드 통제는 크게 보완됨**: 동의는 `GRANTED`와 현행 고지 버전일 때만 처리되는 fail-closed 방식이며, AI egress PII 스크럽, opt-out 억제, 12자 비밀번호 정책, TOTP MFA, 상세 감사 컨텍스트가 구현·테스트됐다.
- **운영·계약 통제는 아직 확정할 수 없음**: DPA/SCC 적용, 스토리지·백업 암호화, 복구 리허설, DLP 운영, 담당자가 실명 지정된 사고 대응 훈련은 저장소 증빙만으로 충족 판정을 할 수 없다.
- **즉시 관리할 P0 미결**: 처리자별 DPA/SCC 상태 확정, 암호화 백업 및 복구 검증, 사고 대응 RACI 실명 지정·훈련, MFA 강제 전환 일정 확정이다.

## 2. 확인 범위와 테스트 증빙

| 구분 | 증빙 |
|---|---|
| 동의·고지 | `session.service.ts`, `chat.service.ts`, `ChatTab.tsx`, `ConsentBanner.tsx`, tenant privacy-notice 설정 |
| 최소화·AI | `pii-scrub.util.ts`, `chat.service.ts`, `REQ-Data-Inventory-20260731.md`, `AI-DPIA-GATE.md` |
| 고객 선택 | `privacy.service.ts`, `notification.service.ts`, `PreferencesPanel.tsx` |
| 암호화·인증 | `crypto.util.ts`, `password-policy.util.ts`, `mfa.service.ts`, `security.constant.ts` |
| 접근·감사 | RBAC/tenant scope 코드, `audit-log.entity.ts`, `audit.service.ts` |
| 운영 | `PROCESSOR-REGISTER.md`, `INCIDENT-RESPONSE.md`, Docker compose, `RPT-Privacy-Control-Gap-20260731.md` |
| 테스트 | `npm run test --workspace=@ivy/api -- --runInBand --testPathPattern="(privacy|session|chat|pii-scrub|password-policy|mfa|audit|tenant)"` — 2026-08-02 재실행, **13 suites / 149 tests passed** (동의 fail-closed, PII 스크럽, 비밀번호 정책, MFA, 감사, 테넌트 격리 포함) |

## 3. 증빙 대장 — 항목별 최종 판정

- **확인자/일시**: Claude(개발 검증) / 2026-08-02. PLN §5 원칙에 따라 증빙 부재 항목은 미확인으로 두었으며, 개인정보 책임자 승인 전 "충족" 확정 표기는 하지 않는다.
- **위험**: 미해결 잔여분 기준 P0(즉시)/P1(월간 관리)/P2(정기 점검). **조치**: §5 개선 백로그의 PCB 티켓 ID.

| PCV | 점검 항목 | 판정 | 확인된 증빙 | 남은 확인 또는 조치 | 위험 | 조치 |
|---|---|---|---|---|---|---|
| 01 | 최소 수집·목적 제한 | 부분 충족 | 34개 테이블·외부 전송 데이터 인벤토리, AI 전송 사본의 email/phone/card/order/address 스크럽 | 데이터 인벤토리 승인 및 자유문·파생 데이터 보존 범위 확정 필요 | P1 | PCB-05 |
| 02 | 개인정보·처리 목적 고지 | 부분 충족 | 테넌트별 privacy-policy URL·고지 버전, en/es/ko 동의 배너 및 버전 변경 재동의 | 운영 테넌트에 실제 방침 URL/내용이 설정·법무 승인됐는지 확인 필요 | P0 | PCB-05 |
| 03 | 목적 외 이용 제한 | 충족(코드) | `effectiveConsentFor()`의 DB fresh read, `GRANTED` 전용 처리, 미동의 시 저장·AI 전송·CJM 발생 차단 | 운영 환경에서 고지 버전 변경 후 재동의 회귀 점검을 정기화 | P2 | PCB-13 |
| 04 | 수탁자 DPA | 미확인 | `PROCESSOR-REGISTER.md`에 Shopify/Anthropic/Voyage/호스팅/GA4 등 6개 처리자와 신규 연동 승인 게이트 기록 | 계정별 DPA 적용, SCC/CCPA 조항, 하위 처리자, 만료일은 모두 외부 계약 증빙으로 확정 필요 | P0 | PCB-01 |
| 05 | 동의 결정 존중 | 충족(코드) | 서버 응답 성공 후에만 UI 상태·로컬 캐시 갱신, 철회/재동의 UI, 현재 고지 버전 불일치 시 pending 전환 | 동의 API 장애·철회 후 외부 발송 차단의 staging 정기 점검 필요 | P2 | PCB-13 |
| 06 | 판매/공유 opt-out | 부분 충족 | 단일 `isSuppressed()` 억제점, 익명 수신자 fail-closed, marketing(event/review) default-deny, opt-out bulk upsert | 실제 email/SMS/web-push는 mock이므로 실제 제공자 도입 전 억제 목록 전파·계약 조항 검증 필요 | P1 | PCB-11 |
| 07 | 중대 자동화 결정 opt-out | 부분 충족 | `AI-DPIA-GATE.md`에 현행 AI 5종의 비중대영향 판정 및 신규 기능 human-in-the-loop/opt-out 게이트 정의 | 보호책임자 실명 승인 및 모든 신규 AI PLN의 게이트 적용을 운영적으로 확인 필요 | P1 | PCB-12 |
| 08 | 보관기간·파기 정책 | 부분 충족 | 365일 자동 파기(messages/conversations/CJM/notifications/sessions), DSAR·Shopify redact, 데이터 인벤토리 보존 매트릭스 | customers/orders/alerts/moderation/audit/log/backup 등의 보존기간과 예외가 미승인·미구현 | P1 | PCB-05, PCB-06 |
| 09 | 저장·전송 암호화 | 부분 충족 | 고객 구조화 PII·자격증명 AES-256-GCM, bcrypt cost 12, staging TLS, AI egress PII 스크럽 | Docker 볼륨/Redis/RabbitMQ/로그의 at-rest 암호화·키 회전·내부 TLS는 증빙 부족 | P0 | PCB-02 |
| 10 | 백업 암호화 | 미충족 | 이전 staging 작업의 수동 SQL 백업 기록만 확인됨 | 정기 백업, 암호화·키 분리, 보존/삭제, RPO/RTO, 격리 복구 리허설이 없음 | P0 | PCB-02 |
| 11 | 테스트·운영 데이터 분리 | 부분 충족 | dev Docker DB/seed와 staging/production compose가 분리됨 | staging의 실제 Shopify 데이터 처리 가능성, 운영 PII 반입 금지, 접근권한 분리·익명화 절차 증빙 필요 | P1 | PCB-10 |
| 12 | DLP 전략 | 부분 충족 | 로그 PII 마스킹, AI egress 스크럽, 비밀값 암호화, 처리자 활성화 사전 검토 규칙 | CI 비밀 탐지, 로그/파일/egress DLP, 경보·격리·오탐 SLA가 문서·운영 증빙으로 부족 | P1 | PCB-07 |
| 13 | 직원 PII 접근 제한 | 부분 충족 | JWT/RBAC/capability, tenant scope, agent 대화 테넌트 검증 및 상담원 열람 감사 | 역할별 필드/export 제한, 분기 권한 재검토, break-glass 절차와 운영 기록 필요 | P1 | PCB-08 |
| 14 | 강한 직원 비밀번호 | 부분 충족 | 12자·3문자류·1,286개 블록리스트·identity/reuse 검증, bcrypt 12, TOTP MFA 및 recovery code | `MFA_ENFORCE_FROM`가 staging 유예 상태이며, 실제 강제 전환·관리자 MFA 등록률 확인 필요 | P0 | PCB-04 |
| 15 | PII 접근 로그 | 부분 충족 | `audit_logs`에 actor/action/target 외 IP/request ID/result/metadata, DSAR·상담원 열람·인증·MFA 감사 기록 | 감사 로그 보존기간, 변조 방지/분리 보관, 이상 접근 경보와 정기 검토 증빙 필요 | P1 | PCB-09 |
| 16 | 보안 사고 대응 | 부분 충족 | SEV 분류, RACI, 격리·통지·증거 보존·훈련 템플릿이 담긴 `INCIDENT-RESPONSE.md` | IC/기술/법무/커뮤니케이션 담당자는 placeholder이며, tabletop·기술 모의훈련 기록 없음 | P0 | PCB-03 |

## 4. 확인 중 발견한 문서 정합성

`REQ-Data-Inventory-20260731.md`의 표 3 및 G-9는 Anthropic/Voyage 송신 전 PII 마스킹이 없다고 기록했다. 현재 코드(`chat.service.ts` — 스크럽된 `egressText`가 의도분류·RAG·임베딩 leg에 전달됨)와 `RPT-Privacy-Control-Gap-20260731.md`는 `pii-scrub.util.ts` 마스킹이 반영됐음을 보여 준다. **(2026-08-02 반영 완료)** 인벤토리 표 3과 G-9를 "마스킹 적용됨(PR #42), 패턴 범위·DPA/ZDR은 미확인"으로 갱신했다.

## 5. P0/P1 개선 백로그

담당자는 PLN §2 역할 기준이며, 수탁자 대장(Doc-B)의 기본 소유자 지정에 따라 현재 전 항목 기본 소유자는 Gray다. 기한은 제안값으로, 판정 회의에서 책임자가 확정한다.

| ID | 관련 PCV | 위험 | 조치 내용 | 담당(역할) | 기한(제안) | 재검증 방법 |
|---|---|---|---|---|---|---|
| PCB-01 | 04 | P0 | Shopify·Anthropic·Voyage·호스팅·GA4의 DPA/SCC/ZDR을 실제 계정·계약으로 확정하고 `PROCESSOR-REGISTER.md`에 계약 식별자·만료일 기재 (잔존 법무 액션 5건 포함) | 법무/구매 | 2026-08-31 | 대장에 처리자별 계약 ID·만료일·하위 처리자 기재 확인 |
| PCB-02 | 09, 10 | P0 | 암호화 정기 백업(운영 DB 키와 분리) 구축, RPO/RTO·보존기간 승인, 격리 DB 복구 리허설 1회 + 볼륨/Redis/RabbitMQ at-rest 암호화 범위 확정 | 보안/인프라 | 2026-08-31 | 백업 작업 로그·복구 리허설 기록·암호화 구성표 |
| PCB-03 | 16 | P0 | `INCIDENT-RESPONSE.md` RACI 실명·연락망 확정 + tabletop 훈련 1회 실시, 개선 항목 티켓화 | 보안 책임자 | 2026-08-31 | 훈련 기록과 개선 티켓 |
| PCB-04 | 14 | P0 | MFA 유예 종료(2026-08-14) 전 관리자·master/director 등록률 확인 후 강제 전환, E1010 락아웃 실전 확인 및 웹 화면 브라우저 스모크 | 개발/운영 | 2026-08-14 | staging·운영 로그인 스모크 결과 |
| PCB-05 | 01, 02, 08 | P0 | 데이터 인벤토리·보존 매트릭스·테넌트별 방침 URL을 법무 검토 후 승인란 서명, 운영 테넌트에 실제 방침 URL 설정 확인 | 개인정보 책임자 | 2026-08-31 | `REQ-Data-Inventory-20260731.md` 승인란 기재 + 테넌트 설정 캡처 |
| PCB-06 | 08 | P1 | 보존 미정 저장소(G-1~G-7: customers, orders_cache, users 퇴직자, invitations, alerts/moderation 파생본, audit_logs, 앱 로그) retention 확장 — 코드 변경이므로 별도 PLN 제출 | 개발 | 2026-09-30 | 후속 PLN/TCR/RPT |
| PCB-07 | 12 | P1 | CI 비밀 탐지 도입, 로그/egress DLP 규칙과 경보 소유자·오탐 SLA 지정 | 보안/인프라 | 2026-09-30 | CI 파이프라인 증적·경보 정책 문서 |
| PCB-08 | 13 | P1 | 역할별 PII 열람/export 제한 매트릭스 승인, 분기 권한 재검토·break-glass 절차 운영화 | 서비스 운영 | 2026-09-30 | 첫 분기 권한 재검토 기록 |
| PCB-09 | 15 | P1 | 감사 로그 보존기간·변조 방지(분리 보관)·이상 접근 경보 설계 | 개발/보안 | 2026-09-30 | 정책 문서 + 구현 PR |
| PCB-10 | 11 | P1 | 운영 PII 테스트 반입 금지 정책 명문화, 환경별 계정·비밀·네트워크 분리 구성표(IAM 목록) 작성 | 서비스 운영 | 2026-09-30 | 환경 구성표·정책 문서 |
| PCB-11 | 06 | P1 | 실제 email/SMS/web-push 제공자 도입 시 억제 목록 전파·opt-out 후 발송 0건 통합 테스트 — 도입 전 필수 게이트 | 개발 | 제공자 도입 시 | 통합 테스트 결과 |
| PCB-12 | 07 | P1 | 신규 AI 기능 PLN의 DPIA 게이트 적용 여부 월간 점검, 보호책임자 실명 승인 | 개인정보 책임자 | 월간 반복 | PLN 리뷰 기록 |
| PCB-13 | 03, 05 | P2 | 고지 버전 변경 후 재동의·철회 후 외부 발송 차단의 staging 정기 회귀 점검 편입 | 개발 | 분기 반복 | 회귀 점검 기록 |

## 6. 한계

이 보고서는 저장소와 기존 배포 보고서에서 검증 가능한 사실만 판정했다. 계약 서명본, 클라우드 볼륨 암호화, 실제 백업·복구, 운영 IAM, 실제 알림 제공자, 훈련 기록은 별도 보관소 또는 운영 환경에서 확인해야 하며, 그 전에는 “충족”으로 전환할 수 없다.
