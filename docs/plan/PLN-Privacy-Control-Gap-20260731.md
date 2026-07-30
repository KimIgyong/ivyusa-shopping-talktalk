# 개인정보보호 통제 갭 보완 — 작업계획서

| 항목 | 내용 |
|---|---|
| 문서 ID | PLN-Privacy-Control-Gap-20260731 |
| 연관 요구사항 | `docs/analysis/REQ-Privacy-Control-Gap-20260731.md` (16개 점검 항목) |
| 작성일 | 2026-07-31 |
| 상태 | **승인 대기** — 승인 전 구현 착수 금지 (CLAUDE.md §7) |
| UI 영향 | **있음** — 위젯 동의 배너 개편, 위젯 설정 동의 철회 제어, 웹 콘솔 테넌트 프라이버시 설정 화면 (§5 와이어프레임 참조) |
| 스키마 영향 | **있음** — `tenants` 컬럼 추가, `audit_logs` 컬럼 추가 (§7 마이그레이션 참조) |

## 1. 목표와 범위

REQ의 16개 항목 중 **이 저장소의 코드·문서로 해결 가능한 항목**을 단계별 PR로 구현하고,
법무·계약·인프라 운영이 주체인 항목은 문서 산출물과 소유자 지정으로 분리한다.

### 1.1 REQ 항목 → 작업 트랙 매핑

| REQ # | 항목 | 우선순위 | 트랙 | 본 PLN 단계 |
|---:|---|---|---|---|
| 3 | 목적 외 처리 제한 (동의 fail-closed) | P0 | **코드** | Stage 1 |
| 5 | 동의 결정 존중·적용 | P0 | **코드** | Stage 1 + Stage 2 |
| 2 | 처리 항목·목적 고지 (방침 링크/버전) | P0 | **코드** | Stage 2 |
| 14 | 비밀번호 정책 (MFA 제외) | P0 | **코드** | Stage 3 |
| 14 | MFA (관리자/고권한) | P0 | 코드(대규모) | **별도 PLN** (§8 결정 D-2) |
| 15 | 개인정보 접근 기록 확장 | P1 | **코드** | Stage 4 |
| 1 | AI 전송 최소화·마스킹 | P1 | **코드** | Stage 5 |
| 6 | opt-out 억제 목록 일원화 | P1 | **코드** | Stage 6 |
| 1, 8 | 데이터 인벤토리·보존 매트릭스 | P1 | **문서** | Doc-A |
| 4 | DPA·수탁자 대장 | P0 | 문서+법무 | Doc-B |
| 16 | 사고 대응 런북 | P0 | 문서+보안 | Doc-C |
| 7 | AI 자동화 의사결정 게이트 | P1 | 문서(프로세스) | Doc-D |
| 9, 10 | 볼륨/백업 암호화, TLS 증빙 | P0 | **운영/인프라** | Ops (§6) |
| 11 | 환경 분리·운영 PII 반입 금지 | P1 | 운영+문서 | Ops (§6) |
| 12 | DLP 체계 | P1 | 운영+문서 | Ops (§6) |
| 13 | 권한 재검토·최소권한 매트릭스 | P1 | 문서+후속 코드 | Doc-A 후속 |

코드 트랙 6단계는 각각 독립 PR로 진행하며, Stage 1~3(P0)을 먼저 완료한다.

## 2. 현행 코드 확인 (AS-IS 근거)

2026-07-31 코드 조사로 REQ의 갭을 코드 수준에서 재확인했다.

| 확인 사항 | 근거 |
|---|---|
| 동의 가드는 API 전체에서 **1곳**, `DECLINED`만 차단 — `PENDING`은 저장·AI 전송 진행 | `chat.service.ts:188-198` |
| **시나리오 버튼 경로와 상담원 이관 경로는 동의 검사 자체가 없음** (DECLINED도 AI 호출) | `scenario.service.ts:187-230`, `agent.service.ts:215` |
| 위젯 fail-open: localStorage 선기록 → 배너 즉시 숨김, API 실패 무시(`catch(() => {})`), 세션 미확립 시 호출 자체 생략 | `apps/widget/src/components/chat/ChatTab.tsx:54-62` |
| 동의 고지 버전은 전역 하드코딩 상수(테넌트별 아님), 방침 URL 없음 | `session.service.ts:14-17` `CONSENT_NOTICE_VERSION = '2026-07'` |
| 위젯이 테넌트 프라이버시 설정을 받을 공개 채널 없음 (`/ai-config/scenario`가 유일한 공개 설정 API) | `ai-config.controller.ts:37-38` |
| 비밀번호는 `@MinLength(8)`만 존재 — 복잡도·유출 차단·재사용 금지 없음, **MFA 코드 전무** | `login.request.ts:39-41`, `user.request.ts:31-36`, `security.constant.ts` |
| `audit_logs`에 `ip`/`request_id`/`result`/`metadata` 컬럼 없음; `actor_type`에 `system` 없어 웹훅이 `admin/0` 위장 기록 | `audit-log.entity.ts`, `audit.service.ts:6-12` |
| `setConsent`는 감사 기록 없음; 상담원 대화 열람 감사 없음 | `session.service.ts:145-154` |
| AI 전송 전 PII 마스킹 없음 — 원문이 `rag.answer`/`classifyIntent`로 직행. 모더레이션은 AI **출력**에만 적용 | `chat.service.ts:224,231`, `rag.service.ts:219-274` |
| 알림 억제는 default-allow: pref 행 없으면 발송, `customerId == null`이면 검사 우회 | `notification.service.ts:101-110` |
| CCPA opt-out은 채널×카테고리 행 단위 루프, 행 0개면 상태 `false` 반환 | `privacy.service.ts:357-397` |
| 세션 Redis 캐시 30초 — 동의 직후 메시지 경로가 stale 상태를 읽을 수 있음 | `session.service.ts:20-29,131-140` |
| consent/privacy/notification/session 서비스 **테스트 0건** (스펙 16개 중 해당 없음) | `apps/api/src/**/*.spec.ts` 목록 |

## 3. 단계별 구현 계획 (코드 트랙)

### Stage 1 — 동의 fail-closed + 위젯 저장 실패 UX (REQ #3, #5 / P0)

**서버**
1. 동의 정책 상수 신설 `apps/api/src/global/constant/consent-policy.constant.ts`:
   처리 유형별 요구 동의 상태를 선언 — `chat_persist: GRANTED`, `ai_send: GRANTED`,
   `agent_handoff: GRANTED`, `external_notify: GRANTED`, `in_app_notify: none`.
2. `SessionService`에 `assertConsent(session, purpose)` 헬퍼 추가 — `GRANTED` 외 상태는
   `BusinessException(ERROR_CODE.CONSENT_REQUIRED /* E3003 기존 코드 활용 */, 403)`.
   위젯 채팅 경로는 예외 대신 현행 소프트 응답(`consentRequired` 시스템 메시지) 유지하되
   **PENDING에도 동일 적용**으로 변경.
3. 가드 적용 지점(누락 경로 포함): `chat.service.handleUserMessage`(PENDING 확장),
   `scenario.service`(현재 무검사), `agent.service` 이관/응답 경로(현재 무검사).
4. `setConsent`에 stale 캐시 대책: 저장 후 `redis.del`은 현행 유지 + 메시지 경로에서
   동의 검사 시 캐시 우회 조회(또는 TTL 내 재검증) 적용.
5. `setConsent` 감사 증적: `audit_logs`는 `actorId` NOT NULL 구조라 게스트 부적합 —
   세션 행(`consent_at`/`consent_version`)을 1차 증적으로 유지하고 `logger.log` 구조화
   로그 추가(Stage 4에서 `actor_type='system'` 도입 후 감사 이관 검토).
6. 4xx 거부 시 `logger.warn` (dev-kit "no error in logs ≠ success" 규칙).

**위젯**
7. `ChatTab.recordConsent`를 async로 전환: `await setConsent()` **성공 후에만**
   localStorage/상태 갱신·배너 닫기. 실패 시 배너 유지 + 오류 문구 표시(수동 닫기 없음,
   재시도 버튼). 세션 토큰 미확립 시 `ensureSession` 후 재시도.
8. 세션 복원 시 서버 `consentState`를 정본으로 동기화 — `ensureSession` 응답의
   `consentState`가 `pending`이면 localStorage와 무관하게 배너 재노출.

**테스트** (`auth.service.spec.ts` 패턴 — 직접 `new`, jest mock repo)
- `session.service.spec.ts`: setConsent 상태 전이·버전 스탬프·캐시 무효화.
- `chat.service.spec.ts`: PENDING/DECLINED → 저장·AI 호출 0건 + consentRequired 응답,
  GRANTED → 정상 처리. 철회(GRANTED→DECLINED) 후 차단 회귀 케이스.
- `scenario.service.spec.ts`: 미동의 시 AI 미호출.

**영향 파일**: `chat.service.ts`, `scenario.service.ts`, `agent.service.ts`,
`session.service.ts`, `consent-policy.constant.ts`(신규), `ChatTab.tsx`,
`ConsentBanner.tsx`, 위젯 i18n(en/es/ko), 신규 spec 3개. **스키마 변경 없음.**

### Stage 2 — 테넌트별 방침 고지·버전 관리 + 재동의 (REQ #2, #5 / P0)

1. **스키마**: `tenants`에 `privacy_policy_url VARCHAR(512) NULL`,
   `consent_notice_version VARCHAR(32) NULL` 추가
   (`sql/migration_tenant_privacy_notice.sql` + `01-schema.sql` 동기 수정).
   ⚠️ 두 컬럼 모두 nullable union 타입 → `@Column`에 명시적 `type` 필수 (부팅 크래시 함정 A-1).
2. `CONSENT_NOTICE_VERSION` 상수 → 테넌트 조회로 대체(테넌트 값 없으면 상수 fallback).
3. **공개 노출**: `POST /session/ensure` 응답 확장(`session.mapper.ts`) —
   `privacyPolicyUrl`, `noticeVersion`, `noticeOutdated`(세션 저장 버전 ≠ 현재 버전) 포함.
   신규 공개 엔드포인트는 만들지 않는다(기존 세션 흐름 재사용).
4. **재동의**: `noticeOutdated === true`면 위젯이 배너 재노출; 서버는 구버전 동의를
   `ai_send` 목적에서 PENDING과 동일 취급.
5. **배너 개편**(와이어프레임 §5.1): 수집 항목·목적·보유기간·AI 처리자/국가 요약,
   방침 링크, DSAR/opt-out 진입 링크, 버전 표기. 전부 i18n 키.
6. **웹 콘솔**(와이어프레임 §5.3): 테넌트 설정에 "개인정보 고지" 편집 화면 —
   방침 URL + 고지 버전 입력, 저장 시 "버전 변경 시 전 고객 재동의 발생" 경고 확인.
   `@RequireRank('master','director')`. 저장 성공/실패 토스트(dev-kit §4.3 필수).
7. 관리 API: `PATCH /tenant/privacy-notice` (요청 snake_case, 응답 Mapper camelCase),
   변경 시 `AuditService.write('tenant.privacy_notice_updated')`.

**테스트**: 버전 불일치 → `noticeOutdated` 플래그·재동의 강제; fallback 동작;
테넌트 간 격리(tenant_id 스코프).

**영향 파일**: `tenant.entity.ts`, `tenant.service.ts`, `tenant.controller.ts`,
`tenant.mapper.ts`, `session.service.ts`, `session.mapper.ts`, `ConsentBanner.tsx`,
`ChatTab.tsx`, 웹 콘솔 설정 페이지(신규), web/widget i18n, `sql/` 2개 파일.

### Stage 3 — 비밀번호 정책 강화 (REQ #14, MFA 제외 / P0)

1. `security.constant.ts` 확장: `PASSWORD_MIN_LENGTH = 12`, 정책 규칙 상수.
2. `apps/api/src/global/util/password-policy.util.ts` 신설:
   - 길이 ≥ 12, 문자 종류 3종 이상(대문자/소문자/숫자/특수문자 중),
   - 흔한/유출 비밀번호 차단 — 오프라인 top-10k 목록 파일 동봉(외부 API 미사용),
   - 이메일/이름 파생 문자열 포함 금지, 현재 비밀번호와 동일 금지(재사용 1단계).
3. class-validator 커스텀 데코레이터 `@IsStrongPassword()` →
   `ChangePasswordRequest.new_password`, `AcceptInviteRequest.new_password`에 적용.
   서비스 레이어(`auth.service.assertAndSet`, `user.service` accept-invite)에서도
   이중 검증(DTO 우회 경로 방어).
4. 에러 코드: auth 블록 다음 빈 코드 `E1009 PASSWORD_POLICY_VIOLATION` 할당,
   응답에 실패 규칙 목록 포함(클라이언트 i18n 표시용).
5. 임시 비밀번호 생성기(`user.service.ts:225`)를 새 정책 충족하도록 갱신.
6. 웹 콘솔 비밀번호 변경/초대 수락 폼: 정책 안내 + 규칙별 실패 메시지 i18n, 실패 토스트.
7. 기존 계정은 **다음 변경 시점부터 적용** (강제 리셋 없음 — §8 결정 D-3).

**테스트**: `password-policy.util.spec.ts`(경계값·유출 목록·파생 문자열),
`auth.service.spec.ts` 확장(정책 위반 시 E1009, 기존 로그인 무영향).

**영향 파일**: `security.constant.ts`, `password-policy.util.ts`(신규+목록 데이터),
`login.request.ts`, `user.request.ts`, `auth.service.ts`, `user.service.ts`,
웹 비밀번호 폼 2곳, i18n. **스키마 변경 없음.** (비밀번호 이력 테이블은 MFA PLN에서 함께 결정)

### Stage 4 — 감사 로그 확장 (REQ #15, #13 기반 / P1)

1. **스키마**: `audit_logs`에 `ip VARCHAR(45) NULL`, `request_id VARCHAR(36) NULL`,
   `result VARCHAR(16) NULL`(success/denied/error), `metadata JSON NULL` 추가;
   `actor_type`에 `system` 허용 (`sql/migration_audit_context.sql` + `01-schema.sql`).
2. `WriteAuditParams` 확장(신규 필드 전부 optional — 기존 호출부 무수정 호환).
   `AsyncLocalStorage` 기반 request-context 미들웨어로 ip/request_id 자동 주입.
3. 웹훅/스케줄러의 `actorType:'admin', actorId:0` 위장 기록 → `system`으로 정정.
4. 감사 지점 추가: 상담원 대화 열람(`agent.service`), 고객 상세/검색 조회,
   DSAR export 다운로드. 4xx 거부 가드에 `result:'denied'` 기록.
5. 보존·무결성 정책(보존기간, 접근 분리)은 Doc-A 보존 매트릭스에서 승인 후 반영.

**테스트**: context 주입, system actor, 기존 호출 호환성.

**영향 파일**: `audit-log.entity.ts`, `audit.service.ts`, request-context
미들웨어(신규), `agent.service.ts`, `privacy.service.ts`, `sql/` 2개 파일.

### Stage 5 — AI 전송 PII 최소화 (REQ #1 / P1)

1. `apps/api/src/global/util/pii-scrub.util.ts` 신설: 이메일·전화·주문번호(#1001류)·
   카드번호 패턴·우편주소 휴리스틱을 탐지해 `[EMAIL]`/`[PHONE]` 토큰으로 치환.
2. 적용 지점: `rag.answer`/`rag.classifyIntent` 호출 직전(`chat.service`,
   `scenario.service`) — **원문은 DB에 저장하되 AI egress만 마스킹**(상담원은 원문 필요).
3. 모더레이션 인바운드 적용 여부는 별도 판단(현재 AI 출력만 검사) — 이번 범위 제외.
4. 마스킹 이벤트 카운트 로그(PII 원문은 로그 금지).

**테스트**: 패턴별 탐지/치환, 오탐 경계(일반 숫자·URL 미치환), KB 컨텍스트 비손상.

### Stage 6 — opt-out 억제 일원화 (REQ #6 / P1)

1. `notification.service`에 단일 진입 `isSuppressed(customerId, channel, category)` —
   `getOptOutStatus`와 pref를 한 곳에서 판정. `customerId == null` 우회 제거:
   외부 채널은 **수신 대상 식별자 없으면 미발송**(fail-closed).
2. 마케팅성 카테고리 default-deny 전환 여부는 §8 결정 D-4 (거래성은 default-allow 유지).
3. `setOptOut` 루프 → 단일 bulk upsert; opt-out 상태 판정(행 0개 = false) 명확화.
4. 캠페인 발송 경로가 동일 억제 판정을 사용하는지 검증·정렬.

**테스트**: opt-out 후 외부 발송 0건 / in-app 유지 / 재동의 복구 (REQ #6 체크리스트 그대로).

## 4. 문서 트랙 (코드 외 산출물)

| ID | 산출물 | 경로(안) | 소유자 | 비고 |
|---|---|---|---|---|
| Doc-A | 데이터 인벤토리 + 보존/파기 매트릭스 | `docs/analysis/REQ-Data-Inventory-*.md` | 개발+운영 | 테이블·외부전송·API별 항목-목적-근거-보유기간. Stage 4·5의 선행 참조 |
| Doc-B | 수탁자(DPA) 대장 | `docs/guide/PROCESSOR-REGISTER.md` | 법무 주관 | Shopify·Anthropic·호스팅·메일. 저장소에는 대장만, 계약서는 외부 보관 |
| Doc-C | 개인정보 침해 사고 대응 런북 | `docs/guide/INCIDENT-RESPONSE.md` | 보안 책임자 | 심각도·RACI·72시간 통지·증거 보존·훈련 기록 |
| Doc-D | AI 기능 DPIA 게이트 체크리스트 | `docs/guide/AI-DPIA-GATE.md` | 개발 | 신규 AI 기능 PLN 필수 섹션으로 편입 |

Ops 항목(REQ #9/#10/#11/#12 — 볼륨·백업 암호화, 복구 리허설, 환경 분리, DLP)은
staging 호스트(`shoptalk.amoeba.site`) 인프라 작업으로, 본 PLN 승인과 별개로
`docs/guide/DEPLOYMENT-STRATEGY.md` 개정 + 운영 체크리스트로 관리한다. 단,
⚠️ **staging `DB_SYNCHRONIZE=true` 해제**(기존 확인된 dev-kit MUST 위반)는 Stage 2/4의
스키마 마이그레이션 리허설과 묶어 함께 처리하는 것을 권장한다.

## 5. UI 와이어프레임 (ASCII — 필수)

### 5.1 위젯 동의 배너 개편 (Stage 2)

```
┌────────────────────────────────────────────────┐
│  개인정보 수집·이용 안내            (v2026-08) │
│                                                │
│  수집 항목: 채팅 내용, 이메일(선택), 주문번호  │
│  목적: 상담 응대, AI 자동 답변                 │
│  보유: 365일 후 파기                           │
│  AI 처리: Anthropic (미국) — 답변 생성 목적    │
│                                                │
│  [개인정보처리방침 전문 보기 ↗]                │
│  [내 정보 요청/삭제(DSAR)] [판매·공유 거부]    │
│                                                │
│        ┌──────────┐      ┌──────────┐          │
│        │  동의    │      │  거부    │          │
│        └──────────┘      └──────────┘          │
├────────────────────────────────────────────────┤
│  (저장 실패 시)                                │
│  ⚠ 선택을 저장하지 못했습니다.  [다시 시도]    │
│  — 배너는 닫히지 않음, 버튼 재활성화 —         │
└────────────────────────────────────────────────┘
  * 동의/거부 클릭 → 버튼 스피너 → 서버 저장
    성공 후에만 배너 닫힘 (fail-closed)
  * 고지 버전 변경 감지 시 재노출
```

### 5.2 위젯 설정 — 동의 철회/변경 (Stage 1·2)

```
┌─ 설정 > 개인정보 ──────────────────────────────┐
│  데이터 수집·AI 처리 동의                      │
│  상태: 동의함 (2026-08-02, v2026-08)           │
│  ┌────────────────────────┐                    │
│  │  동의 철회             │                    │
│  └────────────────────────┘                    │
│  철회 시: 새 채팅 저장·AI 답변이 중단되고      │
│  상담 이용이 제한됩니다.                       │
│  ──────────────────────────────                │
│  알림 수신 (기존 PreferencesPanel 유지)        │
│  ☑ 이메일  ☐ SMS  ☑ 웹 푸시                    │
│  [판매·공유 거부(CCPA)]  ← 기존 유지           │
└────────────────────────────────────────────────┘
```

### 5.3 웹 콘솔 — 테넌트 개인정보 고지 설정 (Stage 2)

```
┌─ 설정 > 개인정보 고지 ─────────────────────────┐
│  개인정보처리방침 URL                          │
│  ┌────────────────────────────────────────┐    │
│  │ https://ivyusa.com/privacy             │    │
│  └────────────────────────────────────────┘    │
│  동의 고지 버전                                │
│  ┌──────────────┐                              │
│  │ 2026-08      │                              │
│  └──────────────┘                              │
│  ⚠ 버전을 변경하면 모든 고객에게 동의 배너가   │
│    다시 표시됩니다.                            │
│                              ┌──────────┐      │
│                              │  저장    │      │
│                              └──────────┘      │
│  저장 성공 → 토스트(자동 닫힘)                 │
│  저장 실패 → 오류 토스트(수동 닫힘)            │
└────────────────────────────────────────────────┘
```

비밀번호 폼(Stage 3)은 기존 화면에 규칙 안내문·실패 메시지만 추가 — 레이아웃 변경 없음.

## 6. 사이드 임팩트 분석

| 변경 | 영향 | 완화 |
|---|---|---|
| Stage 1: PENDING 차단 | **행동 변경** — 현행 FN-008은 미선택 게스트 채팅 허용이 설계 의도. fail-closed 전환 시 동의 전 첫 메시지가 막혀 이탈 가능 | §8 결정 D-1로 정책 확정 후 진행. 소프트 응답(시스템 메시지) 방식이라 위젯 오류는 아님 |
| Stage 1: 시나리오/상담원 경로 가드 신설 | 기존 무검사 → 미동의 세션의 시나리오 버튼·상담 이관 차단 | 위젯이 배너를 먼저 강제하므로 실사용 영향은 낮음. 회귀 테스트 포함 |
| Stage 2: 세션 캐시 우회 조회 | 메시지당 DB 1회 조회 증가 가능 | 동의 검사 시에만 우회, 30초 TTL 유지로 영향 미미 |
| Stage 2: `noticeOutdated` 재동의 | 버전 갱신 시 전 고객 배너 재노출 — 테넌트 운영 이벤트 | 콘솔 저장 시 경고 문구(§5.3), 가이드 문서화 |
| Stage 3: 최소 12자 | 기존 사용자 즉시 영향 없음(다음 변경부터). seed 비밀번호 `amb2026!@`(9자)는 정책 미달 → seed는 첫 로그인 강제 변경이므로 유지 가능하나 seed 값 갱신 권장 | 결정 D-3 |
| Stage 4: audit_logs 스키마 | 마이그레이션 선적용 필수(구코드+신컬럼 안전) | §7 배포 순서 준수, `pre-deploy-check` 스킬 실행 |
| Stage 5: AI 입력 마스킹 | 주문 문의에서 주문번호 마스킹 시 AI 답변 품질 저하 가능(주문 조회 흐름은 구조화 API 경유라 영향 없음 확인 필요) | 주문번호는 의도 분류 후 구조화 경로에서만 사용되는지 구현 시 검증, 오탐 테스트 |
| Stage 6: null customer 외부 발송 차단 | 게스트 대상 외부 알림이 있었다면 중단 | 외부 전송은 현재 mock — 실전송 도입 전 정리가 오히려 안전 |
| 위젯 배너 개편 | embed 스크립트 사용 테넌트 전체에 즉시 노출 | i18n 3개 언어 동시 준비, staging 선검증 |

## 7. 마이그레이션·배포 계획

| 단계 | SQL | 적용 순서 |
|---|---|---|
| Stage 2 | `sql/migration_tenant_privacy_notice.sql` (tenants 2컬럼) + `01-schema.sql` 반영 | **SQL 선적용 → 코드 배포** (dev-kit MUST) |
| Stage 4 | `sql/migration_audit_context.sql` (audit_logs 4컬럼 + actor_type) + `01-schema.sql` 반영 | 동일 |

- 스키마 PR 본문에 `## Migration` 섹션(SQL 경로, 환경별 체크박스, 롤백안) 필수.
- 배포 검증: 부팅 로그 `successfully started` + 신규 라우트 401(=배포됨)/404(=미배포) 확인.
- 롤백: 두 마이그레이션 모두 additive(컬럼 추가)라 구버전 코드와 공존 가능 —
  코드 롤백만으로 복구, 컬럼 DROP 불요.

## 8. 승인 필요 결정 사항

| ID | 결정 | 선택지 | 제안 |
|---|---|---|---|
| D-1 | PENDING 세션의 채팅 처리 | (a) fail-closed: 동의 전 저장·AI 차단(REQ 문언) / (b) 현행 유지+저장만 차단 | **(a)** — REQ #3 체크리스트가 명시적으로 요구. 배너 UX 개선(Stage 1·2)과 동시 적용으로 이탈 완화 |
| D-2 | MFA 범위 | (a) 본 PLN에 포함 / (b) 별도 PLN(TOTP 등록·복구 코드·세션 정책 포함) | **(b)** — 스키마·UI·복구 흐름이 커서 별도 REQ→PLN으로 분리, Stage 3 완료 직후 착수 |
| D-3 | 기존 비밀번호 처리 | (a) 다음 변경 시부터 적용 / (b) 전 계정 강제 리셋 | **(a)** — 유출 정황 없음, 강제 리셋은 운영 부담 |
| D-4 | 알림 default-allow | (a) 거래성(payment/shipping) allow 유지, 마케팅성(event/review) deny 전환 / (b) 전체 현행 유지 | **(a)** — CCPA 취지 부합, 외부 전송이 mock인 지금이 전환 적기 |
| D-5 | Stage 순서 | 제안: 1 → 2 → 3 (P0) → 4 → 6 → 5 (P1) | Doc-A(인벤토리)는 Stage 4·5 착수 전 완료 권장 |

## 9. 완료 기준 (PLN 범위)

- 각 Stage: 구현 PR(squash-merge) + 신규/회귀 테스트 통과 + `npm run build`·`typecheck`
  통과 + **API 실부팅 확인**(엔티티 변경 단계) + staging 배포 검증.
- 각 Stage 완료 시 TCR·RPT 작성(PR#, SHA, 환경별 배포·마이그레이션 상태 기록).
- REQ 체크박스는 해당 Stage RPT에서 갱신하며, P0 항목은 REQ §5 기준(정책 문서·구현
  PR·운영 증빙·승인·테스트 기록)을 모두 충족해야 완료 판정.
