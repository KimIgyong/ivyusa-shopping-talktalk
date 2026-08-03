# PLN — AI 설정 미리보기 · 시나리오 답변 편집 · 상담원 연결 라우팅

| | |
|---|---|
| Doc ID | CHATWIDGET-PLN-AISET2-1.0.0 |
| 작성일 | 2026-08-04 |
| 상태 | **승인 대기** |
| 원 요구 | 사용자 요구(2026-08-04): ① /ai-setting 우측에 대화 미리보기(고객 질문 입력 + 시나리오/AI/상담원 답 확인·입력) — AI 설정·KB 반영 검증 용도 ② 시나리오 버튼 작업별 답변 내용 편집 + 답변 후 이동경로 지정 ③ 상담원 연결 라우팅 설정(담당자 지정, 미지정 시 전체 브로드캐스트+선착 수락, 근무시간/요일 기반 상담원↔이메일 전환 + 고객 안내) |
| 관련 | AI-SETTINGS-GUIDE.md · PLAN-Scenario-Handoff-Alert · PR #70(문구), #72(위젯) |

---

## 0. 현행 구조 요약 (설계 근거)

| 영역 | 현행 |
|---|---|
| 시나리오 응답 | `scenario.service.ts`의 하드코딩 `SCENARIOS`(utterance/reply/followUps × EN/ES/KO). 버튼(라벨/액션/순서)만 테넌트 설정 가능, **응답 내용은 편집 불가** |
| 에스컬레이션 | `EVENTS.ESCALATION` → `agent_alerts` 행(콘솔 알람, **전 상담원 대상**) + Slack/SMTP(전역 env). 수락은 선착순(`accept`). **담당자 지정·근무시간 개념 없음** |
| 설정 저장소 | `tenant_ai_config` (persona/rules/scenario_buttons JSON) — 확장 지점 |
| 세션 | `sessions`에 채널 구분 없음 — 미리보기 세션 격리 컬럼 필요 |

## 1. F1 — 대화 미리보기 패널 (/ai-setting 우측)

**목표**: 관리자가 저장한 설정(페르소나·규칙·시나리오·모더레이션)과 지식(KB)이 실제 파이프라인에서
어떻게 동작하는지 콘솔에서 즉시 확인. **모의 응답이 아니라 실제 chat/scenario API를 태운다.**

### 화면 (와이어프레임)
```
┌─ /ai-setting ──────────────────────────────────┬─ 미리보기 ────────────────┐
│ [봇 페르소나]                                   │ 대화 미리보기   [새 세션] │
│ [응답 규칙]                                     │ ┌───────────────────────┐│
│ [시나리오 버튼]                                 │ │(ai) 안녕하세요! …      ││
│ [AI 기능]                                       │ │(user) 배송비 얼마예요? ││
│ [모더레이션 규칙]                               │ │(ai) 기준 $29.99 이상…  ││
│ [상담원 연결]  ← F3 신규 카드                   │ │  ⓘ conf 0.57 · 근거:   ││
│                                                 │ │    2.1.3 배송비        ││
│                                                 │ └───────────────────────┘│
│                                                 │ [시나리오▾][배송 조회]…  │
│                                                 │ 보내기 모드: (고객 질문|상담원 답변)│
│                                                 │ [입력창__________] [전송]│
└─────────────────────────────────────────────────┴──────────────────────────┘
```
- xl 이상 2컬럼(우측 380px 고정, sticky), 미만은 하단 배치.
- **고객 질문 모드**: 실제 `POST chat/send` — AI 답 + 진단 칩(confidence, **인용 KB 문서 제목**(지식 반영 확인 핵심), escalate 여부, 차단 시 모더레이션 표시).
- **시나리오 실행**: 현재 저장된 버튼 목록을 칩으로 노출, 클릭 시 실제 `POST chat/scenario`.
- **상담원 답변 모드**: 입력 내용을 상담원 말풍선으로 삽입(위젯 렌더링 확인용 시뮬레이션 — 배지 "미리보기").
- 언어 선택(en/es/ko) — 세션 언어별 응답 확인.

### 백엔드 변경
- `sessions.channel` varchar(16) NULL 추가('widget' 기본 의미, 'preview').
- 신규 관리자 endpoint `POST /ai-config/preview-session` (`AI_SETTINGS_MANAGE`): 자기 테넌트로
  `channel='preview'` 세션 생성 후 sessionToken 반환. 이후 대화는 기존 공개 chat API 재사용.
- **preview 세션 격리**: ①`EVENTS.ESCALATION` 발행 억제(상담원 알람·Slack·메일 미발송, 화면에는
  "이관됨" 칩만) ②상담원 큐/라이브챗 목록에서 `channel='preview'` 제외 ③CJM/알림 구독 제외.
- 마이그레이션: `sql/migration_preview_channel.sql` (ALTER sessions ADD channel) — 스테이징
  synchronize=false이므로 **사전 수동 적용**(kit 규칙).

## 2. F2 — 시나리오 작업별 답변 편집 + 이동경로

**목표**: 하드코딩 스크립트를 테넌트가 편집 가능하게. 버튼별로 ①응답 문구(3개 언어)
②후속 칩(follow-ups) ③**답변 후 이동경로(postAction)** 지정.

### 데이터 모델
`tenant_ai_config.scenario_overrides` JSON 추가:
```json
{ "delivery_status": {
    "reply":    { "EN": "...", "ES": "...", "KO": "..." },
    "followUps": [ { "id": "track", "label": {"EN":"...","ES":"...","KO":"..."} } ],
    "postAction": { "type": "none | open_orders | open_contact | open_affiliate | connect_agent | open_url", "url": "https://..." }
} }
```
- `scenario.service.handle()`: 테넌트 override 있으면 사용, 없으면 내장 스크립트 폴백(언어 누락 시 EN 폴백).
- 시나리오 응답 페이로드에 `postAction` 추가 → 위젯 `ChatTab`이 응답 수신 후 디스패치
  (주문 탭 이동 / 문의 폼 / 제휴 카드 / 상담원 연결 / 새 창 URL).

### 화면
ScenarioButtonsSection 버튼 행에 **[답변 편집]** 토글 → 확장 영역:
```
┌ 버튼: 배송 조회 (delivery_status) ──────────────────────────┐
│ 라벨 [배송 조회      ]  액션 [배송 조회▾]  ☑사용  ↑ ↓ 🗑    │
│ ── 답변 편집 ──────────────────────────────────────────────│
│ 응답 문구  (EN|ES|KO 탭)  [텍스트영역.....................] │
│ 후속 칩    [주문 조회(EN/ES/KO)] [상담원 연결] [+칩 추가]   │
│ 답변 후 이동 [없음▾ | 주문탭 | 문의폼 | 제휴 | 상담원 | URL] │
│ ⓘ 비워두면 기본 제공 문구 사용                              │
└─────────────────────────────────────────────────────────────┘
```
- 편집 결과는 F1 미리보기에서 즉시 검증 가능(동일 파이프라인).
- 주의: `message` 액션(커스텀 질문→RAG)은 응답 편집 대상 아님(지식으로 관리) — UI에서 안내.

## 3. F3 — 상담원 연결(핸드오프) 라우팅 설정

**목표**: 에스컬레이션 시 ①지정 담당자에게만 알림(미지정 시 현행 전체 브로드캐스트+선착 수락)
②근무시간/요일 기반: 시간 내 → 상담원, 시간 외 → 지정 이메일로 전달하고 **고객에게 "이메일로
회신드리겠다" 안내**.

### 데이터 모델
`tenant_ai_config.handoff_config` JSON:
```json
{ "assigneeUserIds": [3, 7],
  "businessHours": { "timezone": "America/New_York", "days": [1,2,3,4,5],
                     "start": "09:00", "end": "18:00" },
  "offHours": { "email": "cs@ivyusa.com",
                "notice": { "EN": "...", "ES": "...", "KO": "..." } } }
```
- 전부 선택 항목: assignees 빈 배열=전체 브로드캐스트(현행), businessHours null=상시 상담원 라우팅.

### 동작 (HandoffRouterService 신설, chat.service escalate 지점에서 호출)
| 상황 | 알림 | 고객 안내 |
|---|---|---|
| 근무시간 내(또는 시간 미설정) + 담당자 지정 | `agent_alerts.target_user_id`로 **지정자에게만** 콘솔 알람(+Slack/메일 현행 유지) — 수락은 선착순 규칙 그대로 | 현행 "상담원 연결" 문구 |
| 근무시간 내 + 담당자 미지정 | 현행 전체 브로드캐스트 | 현행 문구 |
| **근무시간 외** | 상담원 알람 없음 → `offHours.email`로 대화 요약 메일(기존 SMTP 채널 재사용) | **"지금은 상담 가능 시간이 아니에요. 남겨주신 내용은 담당자가 이메일로 회신드릴게요"**(3개 언어, notice로 편집 가능) |
- 마이그레이션: `agent_alerts.target_user_id` bigint NULL 추가(+콘솔 알람 조회 필터). NULL=전체.
- 콘솔 알람 API/모달: target_user_id가 있으면 해당 사용자에게만 노출.

### 화면 — /ai-setting 신규 카드 "상담원 연결"
```
┌ 상담원 연결 (핸드오프) ────────────────────────────────────┐
│ 담당 상담원   [☑ Kim (consult)] [☐ Lee (consult)] …        │
│               ⓘ 미선택 시 모든 상담원에게 알림, 선착 수락   │
│ 근무시간 사용 ☑   타임존 [America/New_York▾]               │
│   요일 [☑월☑화☑수☑목☑금☐토☐일]  시간 [09:00]~[18:00]        │
│ 근무시간 외   전달 이메일 [cs@ivyusa.com        ]           │
│   고객 안내 문구 (EN|ES|KO 탭) [........................]  │
│                                              [저장]        │
└─────────────────────────────────────────────────────────────┘
```
- 담당자 목록: `/users`의 **consult 라벨** 활성 사용자.

## 4. 작업 분해·일정 (구현 순서 = 요구 순서)

| 단계 | 내용 | 규모 |
|---|---|---|
| W1 | F1 미리보기 — sessions.channel + preview-session API + 격리(알람 억제·큐 제외) + 우측 패널 UI(진단 칩 포함) | 2d |
| W2 | F2 시나리오 편집 — scenario_overrides + handle() 병합 + postAction 위젯 디스패치 + 편집 UI | 2d |
| W3 | F3 핸드오프 라우팅 — handoff_config + HandoffRouterService + agent_alerts.target_user_id + 카드 UI + off-hours 고객 문구(i18n) | 2d |
| W4 | TCR 테스트(미리보기 격리·오버라이드 폴백·시간대 경계·타깃 알람) + 스테이징 배포/검증 + RPT | 1d |

- 스키마: `sessions.channel`, `agent_alerts.target_user_id`, `tenant_ai_config.scenario_overrides/handoff_config`(JSON 2본) — **마이그레이션 SQL 2본, 스테이징 사전 적용**(synchronize=false).
- PR: 기능별 3~4개로 분할, 각 PR에 Migration 섹션, CI 게이트 통과 필수.

## 5. 리스크·결정 필요 사항

1. **미리보기 데이터**: preview 세션도 DB에 남음(대화 이력 화면에서는 채널 배지로 구분 표시).
   완전 휘발을 원하면 별도 결정 필요 — 기본안은 "남기되 격리·표시".
2. **근무시간 판정 기준**: 서버 시각을 설정된 타임존으로 변환해 판정(공휴일 캘린더는 범위 외 —
   요일/시간만. 공휴일 지원은 후속).
3. off-hours 메일은 전역 SMTP env 설정이 비어 있으면 발송 불가 → 저장 시 경고 표시.
4. F2에서 `contact_support`/`my_orders`류 **비스크립트 액션**은 이동경로만 있고 응답 문구가 없음 —
   편집 UI는 스크립트형 액션(배송 조회/취소환불/상품 도움말)에만 문구 탭 노출.

---

**승인 요청**: 위 설계·순서(W1→W4, 총 ~7d)로 진행 여부, 그리고 리스크 §5-1(미리보기 대화 보존 방식) 기본안 수용 여부를 확인해 주세요.
