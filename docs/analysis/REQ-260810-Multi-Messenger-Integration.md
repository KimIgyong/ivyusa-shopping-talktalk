# REQ-260810-Multi-Messenger-Integration

설정 화면에 **외부 메신저 연동 그룹**(잘로·바이버·와츠앱·라인·텔레그램·아메바톡)과
**커뮤니케이션 연동 그룹**(지메일 업무용 1·2)을 신설하고, 각 채널의 공식 API로 수신한 메시지를
ShopTalk 메시지 서버에 저장 → 대화방 리스트에 채널로 노출 → **기존 ShopTalk AI 파이프라인으로
응대**까지 잇는 요구사항 분석.

- 작성일: 2026-08-10
- 원 요구(요약): "설정에 외부메신저 연동 그룹 / 메신저 설정 카드(잘로·바이버·와츠앱·라인·텔레그램·아메바톡) /
  커뮤니케이션 연동 — 지메일(회사업무용 1,2) / 각 메신저 메시지를 공식 API로 샵톡 메시지서버에 저장하고
  대화방 리스트에 채널 노출, 샵톡에서 AI 대응 / 기존 아메바톡·AMA 로비채팅 구현을 분석해 베스트케이스로 구현방안 제시"
- 분석 대상 자산: 본 repo(ShopTalk) · `ambManagement`(AMA: kakao-integration / slack-integration / webmail / amoeba-talk) ·
  AmoebaTalk 운영 API(`https://api-talk.amoeba.site/api/docs-json`, 2026-08-10 실측 188 엔드포인트)

---

## 1. AS-IS

### 1.1 ShopTalk — 있는 것

| 축 | 현황 | 근거 |
|---|---|---|
| 채널 컬럼 | `conversations.channel varchar(32) default 'widget'`, `sessions.channel varchar(16)`(NULL=위젯, `'preview'`=콘솔 샌드박스) | `chat/entity/conversation.entity.ts`, `session/entity/session.entity.ts` |
| 인입 경로 | 위젯 HTTP(`POST /chat/message` + `session_token`), Shopify App Proxy, Cafe24 | `chat/chat.controller.ts` |
| 외부 webhook | fulfillment · Shopify · Gorgias(L2 상태/L3 답변) **3종뿐** | `issue/gorgias-webhook.controller.ts` |
| AI 파이프라인 | `ChatService.handleUserMessage(session, text)` = 동의게이트 → 대화확보 → 사용자턴 저장 → CJM → intent 분류 → deny-list → 주문컨텍스트 → RAG/answer-reuse → **모더레이션(비우회)** → 저장 → 이관판단. 반환 `ChatTurnResult` | `chat/chat.service.ts:271~` |
| 상담원 답장 | `AgentService.reply` = 동의 재확인 → 중복 억제(5초창) → 모더레이션 → `messages` 저장 → 위젯 폴링 전달 → 근무시간외 이메일 → answer-reuse 인제스트 | `agent/agent.service.ts:395~` |
| 외부 발신 선례 | Gorgias L1 티켓 생성 + L3 답변 릴레이 — `external_tickets`(conversation↔외부ID 유니크, `last_relayed_message_id`/`last_inbound_message_id` **커서 멱등**) | `issue/external-ticket.service.ts` |
| 자격증명 프레임 | `integration_credentials`(AES-256-GCM, `uk_cred_tenant_provider`) + `INTEGRATION_FIELDS` 레지스트리 + `ProviderTile`/`IntegrationConfigModal` + 프로바이더별 연결 테스트 프로브 | `tenant/entity/integration-credential.entity.ts`, `packages/types` enum, `apps/web/src/domain/settings/*` |
| 비동기 | RabbitMQ 토픽 `ivy.events` + **in-process 폴백**(`EventBusService`, at-least-once, 핸들러 멱등 전제). BullMQ 없음 | `infrastructure/queue/event-bus.service.ts` |
| 스케줄 | `setInterval` + `OnModuleInit/Destroy` + `running` 가드 패턴(환경변수로 on/off) | `cafe24/scheduled-cafe24-sync.service.ts` |
| 실시간 | SSE 없음 — 위젯·콘솔 모두 폴링 | `chat.controller.ts` `@SkipThrottle` 폴링 주석 |

### 1.2 ShopTalk — 없는 것 (이번 요구의 실질 갭)

- 메신저 어댑터 **0개**. 외부 채널 사용자 ↔ `sessions`/`customers` 매핑 테이블 없음.
- 외부 메시지 ID ↔ 내부 `messages.id` 매핑 없음(= 중복 수신·루프 방지 수단 없음).
- 콘솔 대화 리스트 응답에 **`channel` 필드 자체가 없음** — `toSessionResponse()`는 id/status/escalated/고객명/미리보기만 반환(`agent/agent.mapper.ts:20~`). 채널 뱃지·필터 신설 필요.
- 첨부(이미지/파일) 저장 없음 — `messages.body TEXT` 단일.
- `integration_credentials`는 `(tenant_id, provider)` 유니크 → **한 프로바이더당 1계정**. 지메일 2계정에 그대로 못 씀.

### 1.3 AMA(ambManagement) 베스트케이스 — 무엇을 베낄 것인가

**(A) `kakao-integration` (해피톡 상담톡 ↔ 로비채팅) — 이번 요구와 구조가 1:1로 겹치는 최적 참조**

```
해피톡 → POST /webhooks/kakao/message?t={token}   [Public, @SkipThrottle]
          ├ 토큰으로 활성 config 조회 = 멀티테넌트 라우팅 + 인증 동시 해결
          ├ 페이로드 정규화 → 즉시 200 반환 (외부 응답시간 제약 준수)
          └ BullMQ 인입 큐 적재 (jobId = 외부 메시지ID → 큐 레벨 중복 제거)
인입 워커  ├ findOrCreateRoom(): 상담방 없으면 채널 동적 생성 (유니크 충돌 시 채널 롤백 후 재조회 = 동시 webhook 안전)
          ├ 외부 msgId 매핑 존재하면 return (루프방지 #2 중복수신)
          ├ 내부 메시지 저장 + 매핑(INBOUND) 저장
          └ SSE emit
아웃바운드 ├ 메시지 저장 이벤트 구독 → 해당 채널이 상담방인지 판별
          ├ 그 메시지가 INBOUND 유래면 재발신 금지 (루프방지 #3)
          └ 큐 적재 → 워커: OUTBOUND 매핑 있으면 skip(멱등) → API 발송 → 실패 시 throw = 지수백오프 재시도
설정 API  getConfig(마스킹) / saveConfig / delete / active 토글 / 연결검증(발신프로필 조회) / 수신도메인 등록
비밀정보  config 테이블이 아니라 암호화 키스토어(amb_api_keys)에 분리 저장
```
핵심 교훈 4가지: **① webhook 토큰 = 테넌트 라우팅 키**, **② 즉시 200 + 큐**,
**③ 외부ID 매핑 테이블 하나로 중복수신·재발신·재시도 멱등을 전부 해결**, **④ 상담방 생성은 유니크 충돌을 정상 경로로 취급**.

**(B) `slack-integration`** — OAuth 설치, HMAC 서명 검증 + 5분 replay 윈도우, **봇 자기메시지 필터(루프방지 #1)**,
채널 매핑에 방향(`INBOUND`/`OUTBOUND_ONLY`) 부여, 메시지 수정/삭제 동기화.

**(C) `webmail`** — `ImapFlow` 기반 IMAP 동기화 + IDLE + MIME 파서 + 계정별 암호화 자격증명(계정 테이블 분리).
→ **지메일 인입의 기성 자산**. 계정이 여러 개인 구조(`mail_accounts` 다행)도 이미 검증됨.

**(D) `amoeba-talk`(로비채팅)** — `talk_channel`/`talk_message` + `TalkSseService`(SSE 실시간). 외부 채널 인입 메시지는
**시스템 사용자 UUID**로 기록하고 발신자명을 `[카카오] 홍길동` 형태로 붙이는 규약. ShopTalk의 `sender_type='user'` +
채널 뱃지로 대응 가능.

### 1.4 AmoebaTalk 운영 API 실측 (2026-08-10) — **가장 중요한 발견**

`api-talk.amoeba.site`의 아메바톡은 사내 팀채팅이 아니라 **이미 완성된 옴니채널 고객소통 플랫폼**이다.

| 모듈 | 엔드포인트 | 이번 요구와의 관계 |
|---|---|---|
| Social | `POST /api/social/session/init` → OAuth → `POST /api/social/session/accounts/{id}`, `GET /api/social/list`, `DELETE /api/social/{id}`, `POST /api/social/line/channel` | **연결 지원 플랫폼 실측 enum = `facebook, zalo, line, kakaotalk, gmail, whatsapp`** |
| Inbox | `GET /api/inbox/conversations`(필터 `social_type`, `social_setting_id`, 날짜, 페이지) / `GET·POST /api/inbox/conversations/{id}/messages` / `{id}/customer` / `{id}/read-status` / labels · notes | 대화·메시지 조회 + **관리자 발신**까지 가능 |
| 메시지 스키마 | `{ id, conversation_id, customer_id, content, content_type, user_type("0"=고객/"1"=상담원), user_id, user_name, created_at, files[] }` | 방향 판별·커서(id)·중복제거 키가 전부 존재 |
| 인증 | Bearer JWT (`signin` → `select-company` → `refresh`) | 서버-서버 API Key 방식은 `/api/integration/amb/check-link` 하나뿐 |
| AI | `ai-agents`, `ai-knowledge`, `ai/suggestions`, `ai/chat` … 26개 | **아메바톡 자체 AI 봇 보유 → ShopTalk AI와 이중 응답 충돌 위험** |
| **외부로 나가는 webhook** | **없음** | ShopTalk이 붙으려면 **폴링**이거나, 아메바톡 측에 webhook 신설 요청 |

즉 사용자가 요구한 6개 메신저 중 **잘로·라인·와츠앱 + 지메일 4종은 아메바톡에 이미 구현되어 운영 중**이고,
**바이버·텔레그램 2종만 어디에도 없다.**

### 1.5 btbz-messenger (KSR 릴레이) 실측 — **2번째 허브** (2026-08-10 추가 요구)

`https://messenger.amoeba.site` = **Messenger Manager(코드명 `ksr`, KakaoTalk-SMS Relay Bridge)**.
소스: `~/Desktop/Site/btbz-messenger` (`apps/relay-api`, NestJS + PostgreSQL + Redis + RabbitMQ + WS).

카카오톡 공식 API로는 **개인 1:1·그룹 대화방에 접근할 수 없다**. 이 서비스는 가맹점주 **본인 PC(Windows 에이전트)**
와 **본인 단말(Android 에이전트)**에 상주하는 릴레이로 그 공백을 메운다 — 즉 이번 요구의 6개 메신저에는 없던
**카카오톡 개인/그룹 대화방 + SMS**라는 채널을 추가로 확보한다.

| 축 | 실측 |
|---|---|
| 채널 타입 | `relay_kakao_pc`(Windows PC 에이전트), `relay_sms`(Android 수신) — 둘 다 **`is_unofficial = 1`** |
| 운영자 인증 | `POST /api/auth/login {email,password}` → httpOnly 쿠키 `ksr_token`(JWT, 12h). Bearer도 허용. **리프레시 토큰·서버간 API Key 없음** |
| 대화 목록 | `GET /api/inbox/conversations` → `{id, channel_type, is_unofficial, counterpart_display, is_group_chat, reply_enabled, last_message_at}` |
| 메시지 | `GET /api/inbox/conversations/{id}/messages` → `{id, source_type, direction('inbound'/'outbound'), sender_name, sender_number, body, body_type, occurred_at}` → **방향·id 커서·중복키 모두 존재** |
| 발신 | `POST /api/relay/replies {conversation_id, body}` → **즉시 발송이 아니라 `relay_outbound_command`(PENDING) 생성** → 캡처한 에이전트로 라우팅(WS/폴링) → 에이전트가 결과 보고 |
| 발신 결과 | `GET /api/inbox/conversations/{id}/commands` → `SENT` / **`SENT_UNCONFIRMED`** / `FAILED` (+TTL 만료). **플랫폼 전달 ACK가 원천적으로 없음**(README §5 난제 #1) |
| 발신 불가 조건 | `reply_enabled=false`(**SMS는 수신 전용**) → 400 · 캡처 에이전트가 `ACTIVE`가 아니면 400 |
| 구현 상태 | Android SMS 인입 + 운영자 인박스는 **동작 중**(최근 커밋: 인박스 NEW 뱃지·중복발신 수정·테스트 APK 배포). **PC 카카오톡 캡처는 미검증 스파이크(Q-02 open)**, 카카오 ToS 법률의견(Q-01) **보류 상태** |

구조적으로 **아메바톡 허브와 동일한 폴링형 어댑터**(대화목록 → 메시지 커서 → 발신 API)라 같은 포트로 흡수된다.

---

## 2. TO-BE (요구 기능)

| ID | 요구 | 우선순위 |
|---|---|---|
| FR-1 | 설정 페이지에 **"외부 메신저 연동" 그룹** 신설 + 카드 6종(zalo/viber/whatsapp/line/telegram/amoebatalk) **+ btbz-messenger 릴레이(카카오톡·SMS) 카드**: 자격증명 입력·마스킹 저장, 활성 토글, 연결 테스트, webhook URL 표시(복사), 상태·최종 수신시각 | P0 |
| FR-2 | **"커뮤니케이션 연동" 그룹** 신설 + **지메일 카드(업무용 계정 2개 이상, 다중 계정 구조)** | P0 |
| FR-3 | 각 채널 공식 API로 수신 → **정규화 → `conversations`/`messages`에 저장**(외부 대화·메시지 ID 매핑, 중복 수신 차단, 멱등) | P0 |
| FR-4 | 콘솔 **대화방 리스트에 채널 표시**(뱃지) + 채널 필터 | P0 |
| FR-5 | 저장된 인입 메시지를 **기존 ShopTalk AI 파이프라인**(동의·intent·deny-list·RAG·**모더레이션**·이관)으로 처리, 채널별 자동응답 on/off | P0 |
| FR-6 | AI/상담원 답변을 **원 채널로 발신**(3중 루프방지, 재시도/백오프, 발송 실패 가시화) | P0 |
| FR-7 | 채널별 연결 상태·최근 오류를 `integration_status`에 반영 | P1 |
| FR-8 | i18n(en/es/ko)·저장/실패 토스트·감사로그·PII 마스킹·로그 스크럽 | P0(정책) |
| FR-9 | 첨부(이미지/파일) 수신 — 최소 "이미지 1건 수신" 표기 + 링크 보관 | P2 |

---

## 3. 채널별 공식 API 사실관계 (구현 난이도의 실체)

| 채널 | 인증 | 인입 | 발신 제약 | 개설 요건(리드타임) |
|---|---|---|---|---|
| **텔레그램** | 봇 토큰(BotFather) | `setWebhook` + `secret_token` 헤더 | 사실상 없음 | 없음 — **즉시** |
| **바이버** | Bot 인증 토큰 | `set_webhook` + `X-Viber-Content-Signature`(HMAC-SHA256) | 세션 무제한, 발신 광고는 제한 | 퍼블릭 계정 생성 — **즉시~수일** |
| **와츠앱** | Meta WABA + 전화번호 + 시스템사용자 토큰 | Webhook verify token + `X-Hub-Signature-256` | **24시간 고객서비스 창** 밖은 사전승인 템플릿만 | Meta 비즈니스 인증 + 번호 등록 — **수주** |
| **라인** | 채널 액세스 토큰 | `X-Line-Signature` | reply token 1회성, push는 유료 쿼터 | LINE 공식계정 개설 — **수일** |
| **잘로** | OA + OAuth(access 1h / refresh 3개월 **로테이션 필수**) | webhook 서명 | 고객 마지막 메시지 기준 **세션 창(CS 메시지)** | 베트남 사업자 OA 인증 — **수주** |
| **지메일** | (a) Google OAuth `gmail.modify`(=**restricted scope → CASA 보안심사·연간 검증**) + Pub/Sub `watch`(7일마다 갱신)<br>(b) **IMAP/SMTP + 앱 비밀번호**(2단계 인증 필요, Workspace 정책 허용 시) | (a) push (b) IDLE/폴링 | 발신 한도(Workspace 2,000/일) | (a) 심사 **수주** (b) **즉시** |
| **아메바톡** | Bearer JWT(signin→select-company→refresh) | **webhook 없음 → 폴링** | `POST /inbox/conversations/{id}/messages`(5,000자) | 계정·회사 발급 — **즉시**(사내) |
| **btbz 릴레이 · 카카오톡(PC)** | 운영자 JWT(login, 12h) | **webhook 없음 → 폴링** | `POST /api/relay/replies` = **비동기 명령**, 결과 SENT/SENT_UNCONFIRMED/FAILED | 가맹점주 PC 에이전트 설치 + **리스크 서명**. PC 캡처 미검증(Q-02) |
| **btbz 릴레이 · SMS** | 동일 | 동일(Android 에이전트 인입) | **발신 불가(수신 전용)** | Android 에이전트 설치 — 동작 중 |

> 요점: **텔레그램·바이버는 오늘 붙일 수 있고, 와츠앱·잘로·라인·지메일(OAuth)은 플랫폼 승인이 크리티컬 패스**다.
> 그런데 그 승인 4종은 **아메바톡이 이미 통과해 운영 중**이다.

---

## 4. 갭 분석

| ID | 갭 | 영향 | 해소 방향 |
|---|---|---|---|
| G1 | 대화 리스트에 채널 축 없음 | FR-4 불가 | `toSessionResponse`에 `channel` 추가 + 콘솔 뱃지/필터 |
| G2 | 외부 사용자 ↔ session/customer 매핑 없음 | 동일인 재방문이 매번 새 대화 | `channel_identities`(채널+외부userId → session/customer) 신설 |
| G3 | **동의 게이트**가 외부 채널과 충돌 | 위젯 동의배너가 없는 채널은 `consentState='pending'` → AI가 전부 거부(정상 응답으로 조용히 막힘) | 채널 최초 1턴에 동의 안내 발송 후 `granted` 기록 / 또는 플랫폼 ToS 기반 채널별 동의 근거 정책 — **결정 필요** |
| G4 | 언어(`session.language`) 판정 근거 없음 | 다국어 응답 품질 | 채널 프로필 locale → 없으면 텐넌트 기본 → 메시지 언어 추정 |
| G5 | 첨부 미지원 | 이미지 문의 유실 | P2, 최소 표기 |
| G6 | 발신 창 제약(24h/세션/reply token) | 근무시간외 회신·지연 답변이 **발송 실패**로 끝남 | 창 만료 시 이메일 회신 폴백(기존 off-hours 메일 재사용) + 실패 가시화 |
| G7 | 큐 인프라 차이 | AMA는 BullMQ(재시도·DLQ 내장), ShopTalk은 RabbitMQ+in-process 폴백(재시도 없음) | 어댑터 자체 재시도 테이블/커서 + `outbox` 상태열로 대체(아래 §5) |
| G8 | 실시간성 | 콘솔 폴링(수 초) — 외부 채널 유입에도 동일 적용 | 현행 폴링 유지(적정기술), SSE는 후속 |
| G9 | 아메바톡 경유 시 **이중 AI** | 양쪽 봇이 같은 고객에게 각각 답변 | 릴레이 대상 채널은 아메바톡 AI 에이전트 pause 필수(운영 규약) |
| G10 | 자격증명 1프로바이더=1행 | 지메일 2계정 불가 | 채널 계정 테이블(`messenger_channels`) 신설 — 계정 다중화 + 비밀은 기존 암호화 유틸 |
| G11 | 아메바톡 outbound webhook 부재 | 폴링 지연(수 초~수십 초) | 1단계 폴링, 2단계 아메바톡에 webhook 신설 요청(사내 자산이므로 가능) |
| G12 | **btbz 릴레이 발신에 전달 ACK 없음** | ShopTalk이 "발송 완료"라고 표시하면 거짓이 될 수 있음 | 아웃박스에 `unconfirmed` 상태 신설 + 명령ID 보관 후 상태 폴링, 콘솔에 구분 표기 |
| G13 | **SMS는 수신 전용**(`reply_enabled=false`) | AI 자동응답이 매번 400으로 실패 | SMS 채널은 자동응답 강제 OFF + 상담원 이관(또는 이메일 회신) 경로로 처리 |
| G14 | btbz 운영자 인박스 API에 **테넌트 스코프 없음**(`listConversations`가 전체 반환) | — | **해소(설계상 의도)**: KSR은 멀티테넌트 서비스가 아니라 **개별 고객 커스텀 전용**이다(§6 KSR 운용 전제). ShopTalk은 채널 1개 = 릴레이 인스턴스/계정 1개 = 테넌트 1개로 고정 매핑하고 공유하지 않는다 |
| G15 | 릴레이는 **비공식 채널**(`is_unofficial=1`), 카카오 ToS 법률의견 보류(Q-01) | 정책 리스크 | 중계 주체·기기·개시/중단이 모두 사용자 본인이라는 전제(§6) 위에서, ShopTalk은 카드에 비공식 표기 + 자동응답 기본 OFF(명시적 opt-in)만 담당하고 법적 게이트는 릴레이 프로젝트를 따른다 |
| G16 | 릴레이 운영자 인증에 **리프레시 토큰·API Key 없음**(JWT 12h) | 토큰 만료 시 인입 중단 | 자격증명 암호화 보관 + 만료 감지 시 재로그인, 장기적으로 서버간 API Key 요청 |

---

## 5. 사용자 흐름 (TO-BE)

```
[테넌트 관리자] 설정 → 외부 메신저 연동 → (예: 텔레그램) 카드 [설정]
   → 봇 토큰 입력 → 저장(암호화) → [연결 테스트] getMe 성공 → [활성화]
   → 시스템이 setWebhook 자동 등록 → 카드에 webhook URL·상태 'connected'

[고객] 텔레그램에서 "주문 언제 와요?" 발송
   → ShopTalk /webhooks/messenger/telegram/{token}  (즉시 200)
   → 정규화 → 채널 아이덴티티 조회/생성 → 세션·대화 확보 → messages 저장(INBOUND 매핑)
   → ChatService.handleUserMessage (동의·intent·deny-list·RAG·모더레이션)
   → AI 답변 저장 → 아웃바운드 발송(텔레그램 sendMessage) → OUTBOUND 매핑 기록

[상담원] 콘솔 대화 리스트에 [텔레그램] 뱃지 달린 대화 표시 → 인계 → 답장
   → 기존 AgentService.reply(모더레이션) → 같은 아웃바운드 경로로 원 채널 발신
```

---

## 6. 제약·정책 (MUST)

- **모더레이션 비우회**: 채널이 늘어도 AI·상담원 발신은 전부 `ModerationService.moderate()` 통과(FR-069/POL-020).
- **멀티테넌시**: 모든 신규 테이블 `tenant_id` 필수. webhook 라우팅은 테넌트별 토큰으로 해석하고, 토큰↔테넌트 불일치는 401.
- **비밀정보**: 봇 토큰·리프레시 토큰은 AES-256-GCM(`crypto.util`), 응답은 write-only 마스킹, 감사로그 기록.
- **fail-closed**: 서명/토큰 미설정 시 개발환경 외 거부(`assertWebhookSecret` 규약 준수).
- **4xx 로깅**: 거부 경로에 `logger.warn` 필수(무로그 거부 금지).
- **PII**: 외부 프로필명·전화번호는 마스킹 로깅, AI 송출은 기존 `scrubPii` 경로 그대로.

**KSR(btbz 릴레이) 운용 전제 — 사용자 확인 2026-08-10 (구속 조건)**
- 릴레이 에이전트는 **실명인증 가능한 사용자 개인 명의의 안드로이드 단말 1대**에 **사용자가 직접 개발자 모드로 설치**한다.
- 메시지 중계의 **개시·중단은 100% 사용자 본인의 선택**이며, 아메바가 고객을 대신해 에이전트를 운용하지 않는다.
- **멀티테넌트 서비스가 아니라 개별 고객 커스텀 전용**이다 → 릴레이 인스턴스/계정은 테넌트 간 공유되지 않는다.
- ShopTalk 설계 함의: (a) 채널 1개 = 릴레이 계정 1개 = 테넌트 1개 **고정 매핑**(G14 해소),
  (b) 원격 강제 활성화·대리 운용 기능은 **범위 밖**, (c) 카드에는 상태 표시와 중계 on/off 요청만 두고
  실제 개시/중단 권한은 단말의 사용자에게 남긴다.

---

## 7. 구현 방안 옵션 비교

| | **A. 전 채널 직접 어댑터** | **B. 아메바톡 허브 경유** | **C. 하이브리드(권고)** |
|---|---|---|---|
| 범위 | 6채널+지메일 어댑터 전부 자체 구현 | 아메바톡 1개 어댑터로 zalo/line/whatsapp/gmail(+facebook/kakao) 수용 | 허브(zalo/line/whatsapp/gmail) + 직접(telegram/viber) |
| 플랫폼 승인 | Meta·LINE·Zalo·Google 심사 4건 직접 통과 필요(수주~수개월) | **불필요**(아메바톡이 이미 보유) | 승인 필요분만 허브에 위임 |
| 실시간성 | webhook = 즉시 | 폴링 = 수 초 지연(웹훅 신설 시 해소) | 텔레그램/바이버 즉시, 나머지 폴링 |
| 종속성 | 없음 | 아메바톡 가용성·계정에 종속 | 허브 장애 시 직접채널은 생존 |
| 비용/기간 | 매우 큼 | 작음 | 작음 → 단계 확장 |
| 아메바 철학(적정기술·공유·연결) | ✕ 중복개발 | ○ | **◎** |

**권고 = C(하이브리드)**. 단, 어댑터 포트를 **채널별이 아니라 공통 인터페이스**로 정의해
"허브 경유 zalo"를 나중에 "직접 zalo"로 **설정만 바꿔 갈아끼울 수 있게** 한다(카드 UI는 동일하게 6장 유지).

---

## 8. 결정 사항 (2026-08-10 사용자 확정)

| ID | 항목 | 결정 |
|---|---|---|
| D-1 | 채널 확보 경로 | **C 하이브리드** — 잘로·라인·와츠앱은 아메바톡 허브, **텔레그램·바이버는 ShopTalk 직접 어댑터** |
| D-2 | 지메일 인증 | **IMAP + 앱 비밀번호** (AMA `webmail` ImapFlow 자산 재사용) |
| D-3 | 외부 채널 AI 발신 | **자동 발신**, 채널별 on/off 토글 |
| D-4 | 외부 채널 동의(G3) | **최초 1턴 동의 안내 후 진행**(granted+version 기록), 채널별 `auto` 전환 허용 |
| D-5 | 1차 착수 범위 | **PoC 먼저** — 프레임 + 직접(텔레그램·바이버) + 허브 + 지메일 → 검증 후 확장 |
| D-6 | **btbz-messenger 릴레이 포함** (2026-08-10 추가 지시) | 2번째 허브 어댑터로 수신/발신 연동 — 카카오톡(개인·그룹) + SMS(수신 전용) 채널 확보 |

→ 실행 계획: `docs/plan/PLN-260810-Multi-Messenger-Integration.md` (Rev.2)

---

## 9. 참고

- 베스트케이스 원본: `ambManagement/apps/api/src/domain/kakao-integration/**`(인입·아웃바운드·루프방지),
  `slack-integration/**`(서명검증·방향매핑), `webmail/**`(IMAP), `amoeba-talk/**`(SSE·채널)
- ShopTalk 재사용 지점: `chat.service.ts`(AI 파이프라인 진입), `agent.service.ts:reply`(상담원 발신),
  `issue/external-ticket.service.ts`(커서 멱등 릴레이), `settings/*`(카드 UI 프레임), `event-bus.service.ts`(비동기)
- AmoebaTalk OpenAPI 실측 스냅샷: 2026-08-10 `GET https://api-talk.amoeba.site/api/docs-json` (188 paths)
