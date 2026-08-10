# PLN-260810-Multi-Messenger-Integration

외부 메신저(잘로·바이버·와츠앱·라인·텔레그램·아메바톡) + 커뮤니케이션(지메일 업무용 1·2) 연동
작업계획서 — **하이브리드(아메바톡 허브 + 직접 어댑터) + 지메일 IMAP**, PoC 우선.

- 근거: `REQ-260810-Multi-Messenger-Integration` (2026-08-10)
- **Rev.2 (2026-08-10 사용자 결정)**: D-1을 하이브리드로 변경(텔레그램·바이버는 ShopTalk 직접 어댑터),
  D-4를 권장안(최초 안내 후 동의 기록)으로 확정
- **Rev.3 (2026-08-10 추가 지시)**: **btbz-messenger(`messenger.amoeba.site`) 릴레이를 2번째 허브로 포함** —
  카카오톡(개인·그룹, PC 에이전트) 수신/발신 + SMS(수신 전용). REQ §1.5 실측 반영
- **승인 필요** — 본 계획 승인 전 구현 착수 금지(CLAUDE.md §7)

## 0. 승인된 결정 (2026-08-10)

| ID | 결정 | 결과 |
|---|---|---|
| D-1 | 채널 확보 = **하이브리드** (Rev.2) | 잘로·라인·와츠앱(+페이스북·카카오톡)은 **아메바톡 Inbox 허브 경유**(플랫폼 심사 회피), **텔레그램·바이버는 ShopTalk 직접 webhook 어댑터**(봇 토큰만 있으면 되므로 심사 없음). 두 경로 모두 동일한 인입 파이프라인·동일한 카드 UI |
| D-2 | 지메일 = **IMAP + 앱 비밀번호** | AMA `webmail`의 ImapFlow 자산 이식, 업무용 2계정(다중 계정 구조) |
| D-3 | AI 발신 = **자동 발신(채널별 on/off)** | 위젯과 동일 파이프라인, 채널 카드에 자동응답 토글 |
| D-4 | 외부 채널 동의 = **최초 안내 후 기록** (Rev.2 확정) | 채널 첫 인입 시 개인정보 안내를 먼저 발송하고 `granted`+`consent_version` 기록(§4.4). 채널별로 `auto` 전환 가능 |
| D-5 | 범위 = **PoC 우선** | P1에서 프레임+직접(텔레그램·바이버)+허브 2종+지메일 실동작, P2에서 채널 확장 |
| D-6 | **btbz-messenger 릴레이 포함** (Rev.3) | 아메바톡과 동일한 폴링형 허브 어댑터 1개 추가. 단 발신이 **비동기 명령(ACK 없음)**이고 **SMS는 수신 전용**이라 아웃박스에 `unconfirmed` 상태와 채널별 발신가능 플래그가 필요(§4.6) |

---

## 1. 아키텍처

```
 ┌──────────── 외부 ────────────┐   ┌──────────────────── ShopTalk API ─────────────────────┐
 │ 텔레그램 / 바이버             │   │ [A] webhook형 (직접)                                  │
 │   └ webhook ─────────────────┼──▶│  POST /webhooks/messenger/{provider}/{token}  즉시 200 │
 │                              │   │    └ TelegramAdapter / ViberAdapter                    │
 │                              │   │        · secret_token 헤더 / X-Viber-Content-Signature │
 │ 잘로 / 라인 / 와츠앱          │   │ [B] 폴링형 (허브·메일)                                 │
 │ (+페북·카톡) ─ 아메바톡 ──────┼──▶│  MessengerSyncService (setInterval, 채널별, running가드)│
 │                 Inbox API    │◀──┤    └ AmoebaTalkHubAdapter                              │
 │                              │   │        · JWT(signin→select-company→refresh, Redis캐시) │
 │ 카카오톡(개인·그룹) ┐         │   │    └ BtbzRelayAdapter (messenger.amoeba.site)          │
 │ SMS(수신전용)      ├ btbz ───┼──▶│        · 운영자 JWT(login 12h) · /api/inbox/*          │
 │                    │ 릴레이   │◀──┤        · 발신 = /api/relay/replies → 비동기 명령(§4.6) │
 │ 지메일 업무용 1,2 ─ IMAP ─────┼──▶│    └ GmailImapAdapter (ImapFlow)                       │
 └──────────────────────────────┘   │                                                        │
                                     │  ▼ 공통 인입 파이프라인 (A·B 공용, 채널 무관)          │
                                     │  normalize → thread 확보 → 외부ID 중복차단 →           │
                                     │  messages 저장 → ChatService.handleUserMessage         │
                                     │  (동의·intent·deny·RAG·**모더레이션**·이관)            │
                                     │  ▼                                                     │
                                     │  channel_outbox → OutboxWorker → 어댑터 send()         │
                                     └────────────────────────────────────────────────────────┘
```

**공통 포트**(채널별 구현을 갈아끼우는 지점) — `MessengerAdapter`:
```ts
interface MessengerAdapter {
  readonly provider: string;               // telegram | viber | amoebatalk | btbz_relay | gmail
  readonly kind: 'webhook' | 'poll';
  /** 발신 결과가 비동기인 어댑터(btbz 릴레이)만 구현 — 명령 상태를 되물어 아웃박스를 확정한다 */
  confirm?(ch: MessengerChannel, externalCommandId: string): Promise<'sent' | 'unconfirmed' | 'failed' | 'pending'>;
  test(ch: MessengerChannel): Promise<{ ok: boolean; detail: string }>;
  /** webhook형: 서명/시크릿 검증 후 정규화. 검증 실패는 throw(401) */
  parse?(ch: MessengerChannel, headers: Record<string, string>, raw: Buffer): NormalizedInbound[];
  /** 폴링형: 커서 이후 신규 인입만 */
  pull?(ch: MessengerChannel): Promise<NormalizedInbound[]>;
  send(ch: MessengerChannel, t: ChannelThread, text: string): Promise<{ externalMessageId: string }>;
  /** 활성화 시 외부에 수신 URL 등록(telegram setWebhook / viber set_webhook). 없으면 no-op */
  register?(ch: MessengerChannel, webhookUrl: string): Promise<void>;
}
```
**정규화 스키마(`NormalizedInbound`)와 인입 파이프라인은 어댑터 바깥**에 둔다 — 그래야 허브 경유 잘로를
나중에 직접 잘로 어댑터로 바꿔도 파이프라인·UI·데이터가 그대로다(REQ §7 C안의 핵심).

## 2. 스키마 (신규 4테이블 — `sql/migration_messenger_channels.sql`)

```sql
-- 채널 계정 (테넌트당 프로바이더별 N개 — 지메일 2계정 요구 충족)
CREATE TABLE messenger_channels (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  provider VARCHAR(16) NOT NULL,          -- amoebatalk|btbz_relay|gmail|zalo|line|whatsapp|viber|telegram
  mode VARCHAR(8) NOT NULL DEFAULT 'hub', -- hub|direct
  label VARCHAR(64) NOT NULL,             -- '업무용 1' 등 카드 표시명
  external_account_id VARCHAR(128) NULL,  -- 아메바톡 company_id / 봇 username / 메일주소
  webhook_token VARCHAR(64) NULL,         -- 직접(webhook형) 채널의 수신 URL 토큰 = 테넌트 라우팅 키
  config JSON NULL,                       -- 비밀 아닌 설정(social_type, imap host/port…)
  secret_enc VARBINARY(2048) NULL,        -- AES-256-GCM (crypto.util) — 봇 토큰/비밀번호/앱 비밀번호
  auto_reply TINYINT(1) NOT NULL DEFAULT 1,
  consent_mode VARCHAR(8) NOT NULL DEFAULT 'notice', -- notice|auto (§4.4)
  active TINYINT(1) NOT NULL DEFAULT 0,
  status VARCHAR(16) NOT NULL DEFAULT 'unknown',     -- connected|error|unknown
  last_sync_at DATETIME NULL, last_error VARCHAR(255) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_mc_tenant_provider_label (tenant_id, provider, label),
  UNIQUE KEY uk_mc_webhook_token (webhook_token)   -- 토큰 1개 = 채널 1개(=테넌트) 해석
);

-- 외부 대화 ↔ ShopTalk conversation (고객 식별 정보 포함 — 별도 identity 테이블 없이 단순화)
CREATE TABLE channel_threads (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL, channel_id BIGINT NOT NULL,
  external_thread_id VARCHAR(128) NOT NULL,   -- 아메바톡·릴레이 conversation_id / 메일 스레드ID
  sub_channel VARCHAR(16) NULL,               -- 허브 내부 채널 구분(zalo|line|kakao|sms…) = 콘솔 뱃지 원천
  reply_enabled TINYINT(1) NOT NULL DEFAULT 1,-- 릴레이 SMS 등 수신전용 스레드는 0
  external_user_id VARCHAR(128) NULL, external_user_name VARCHAR(128) NULL,
  session_id BIGINT NULL, conversation_id BIGINT NULL, customer_id BIGINT NULL,
  inbound_cursor VARCHAR(64) NULL,            -- 마지막 처리 외부 메시지 id
  last_inbound_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_ct_channel_thread (channel_id, external_thread_id),
  KEY idx_ct_conversation (conversation_id), KEY idx_ct_tenant (tenant_id)
);

-- 외부 메시지 ↔ 내부 메시지 매핑 (중복수신·재발신·재시도 멱등의 단일 근거 — AMA kakao 패턴)
CREATE TABLE channel_message_map (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL, thread_id BIGINT NOT NULL,
  external_message_id VARCHAR(128) NOT NULL, message_id BIGINT NOT NULL,
  direction VARCHAR(8) NOT NULL,              -- inbound|outbound
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_cmm_thread_ext (thread_id, external_message_id),
  KEY idx_cmm_message (message_id)
);

-- 발신 아웃박스 (RabbitMQ에는 재시도/DLQ가 없으므로 상태를 테이블로 — REQ G7)
CREATE TABLE channel_outbox (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL, thread_id BIGINT NOT NULL, message_id BIGINT NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'pending',  -- pending|sent|unconfirmed|failed
  external_command_id VARCHAR(64) NULL,           -- btbz 릴레이 명령ID(비동기 결과 확인용, §4.6)
  attempts INT NOT NULL DEFAULT 0, next_attempt_at DATETIME NULL, last_error VARCHAR(255) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_co_message (message_id),
  KEY idx_co_due (status, next_attempt_at)
);
```
`conversations.channel`(varchar 32)에 provider 값을 그대로 기록 → 대화 리스트 뱃지의 원천.
엔티티는 nullable 컬럼에 **명시 `type`** 필수(union 타입만 쓰면 부팅 크래시 — CLAUDE.md §2).

## 3. 단계별 계획

### P1 — PoC (PR 5건)

**PR-M1 · 코어 프레임 + 텔레그램·바이버 직접 어댑터** (`apps/api/src/domain/messenger/`)
- `entity/` 4종, `messenger.service.ts`(채널 CRUD·자격증명 암호화·연결테스트·webhook 토큰 발급),
  `ingest.service.ts`(공통 인입 파이프라인), `outbox.service.ts` + `outbox.worker.ts`(setInterval·지수백오프)
- `messenger-webhook.controller.ts` — `POST /webhooks/messenger/:provider/:token`,
  `@Public()` + `@SkipThrottle()`(외부 버스트), 토큰으로 활성 채널 해석(=테넌트 라우팅) →
  어댑터 `parse()` 서명 검증 → **즉시 200** → 인입은 `setImmediate` 비동기 처리(외부 응답시간 제약).
  거부 경로는 반드시 `logger.warn`(4xx 무로그 금지)
- `adapter/telegram.adapter.ts` — 봇 토큰, `getMe`(연결 테스트), `setWebhook`(secret_token 등록),
  `X-Telegram-Bot-Api-Secret-Token` 헤더 상수시간 비교, `sendMessage`
- `adapter/viber.adapter.ts` — 인증 토큰, `get_account_info`(테스트), `set_webhook`,
  `X-Viber-Content-Signature` HMAC-SHA256 검증, `send_message`
- 인입 파이프라인(어댑터 공통):
  1. `findOrCreateThread` — 유니크 충돌은 정상 경로로 처리(동시 폴링 안전, AMA 패턴)
  2. `channel_message_map`에 외부ID 있으면 **skip** (루프방지 ②)
  3. 세션 확보(`channel=provider`, 언어=프로필 locale→테넌트 기본) → `conversations`(channel=provider) 확보
  4. `messages` 저장(`sender_type='user'`) + inbound 매핑
  5. `auto_reply && !humanOwnsThread` → `ChatService.handleUserMessage()` → 반환 답변은 이미 저장됨
- 아웃바운드: 메시지 저장 후 훅 → 해당 conversation이 채널 스레드인지 판별 → **inbound 유래면 발신 금지**(루프방지 ③) →
  `channel_outbox` 삽입(`uk_co_message`로 중복 방지) → 워커가 어댑터 `send()` → 성공 시 outbound 매핑 기록,
  실패 시 `attempts++`·`next_attempt_at` 백오프(1m/5m/30m, 5회 후 failed + 채널 `last_error`)
- 에러코드 신규 블록 **E5023~E5027**(채널 미설정/자격증명 실패/발신 실패/외부 API 오류/발신 창 만료)

**PR-M2 · 아메바톡 허브 어댑터**
- `adapter/amoeba-talk-hub.adapter.ts` + `messenger-sync.service.ts`
  (`setInterval`, `MESSENGER_SYNC_INTERVAL_SEC`, `running` 가드 — `scheduled-cafe24-sync` 패턴)
- 자격증명(email/password/company_id) 암호화 저장, 액세스 토큰은 **Redis 캐시 + refresh**
- 폴링 = `GET /api/inbox/conversations?social_type=&page=1&limit=20` → `last_message_time`이 스레드
  `last_inbound_at`보다 최신인 대화만 `GET /{id}/messages?limit=50` → `user_type==='0'`(고객) &
  `id > inbound_cursor`만 인입, 발신 = `POST /{id}/messages {content}`
- 카드에서 인입 채널(social_type) 다중 선택 → `config.social_types`

**PR-M3 · btbz-messenger 릴레이 어댑터** (카카오톡 개인·그룹 + SMS)
- `adapter/btbz-relay.adapter.ts` — 운영자 자격증명(email/password) 암호화 저장,
  `POST /api/auth/login` → JWT(12h) Redis 캐시 + **401 감지 시 재로그인**(리프레시 토큰 없음)
- 폴링 = `GET /api/inbox/conversations`(전체, `last_message_at` 정렬) → 갱신분만
  `GET /{id}/messages` → `direction==='inbound'` & `id > inbound_cursor`만 인입.
  `channel_type`(relay_kakao_pc/relay_sms) → `channel_threads.sub_channel`(kakao/sms),
  `reply_enabled` 그대로 스레드에 보존
- 발신 = `POST /api/relay/replies {conversation_id, body}` → 응답 명령ID를
  `channel_outbox.external_command_id`에 기록하고 상태 `unconfirmed` → 확인 루프(§4.6)
- SMS 스레드는 `reply_enabled=0` → 자동응답·발신 시도 자체를 하지 않고 **상담원 이관**으로 라우팅
- 카드에 **비공식 채널 경고**(카카오 ToS 리스크·에이전트 설치 필요) 표기, 자동응답 기본 OFF

**PR-M4 · 지메일 IMAP 어댑터 + 콘솔 채널 노출**
- `adapter/gmail-imap.adapter.ts` — `imapflow` 의존 추가, AMA `webmail`의 폴더 special-use 해석·MIME 파서 로직 이식
  (INBOX만 대상, `UNSEEN` + `since` 기반, 스레드ID = `References`/`Message-ID` 체인 루트)
- 발신은 기존 `MailerService`(SMTP)에 `In-Reply-To`/`References` 부여 → 같은 메일 스레드로 회신
- 콘솔: `agent.mapper.toSessionResponse`에 **`channel` 추가** → 대화 리스트 뱃지 + 채널 필터(쿼리 `channel=`),
  `agent.service.listSessions` 필터 확장. 발신 불가 스레드(SMS)와 `unconfirmed` 발신은 시각적으로 구분

**PR-M5 · 설정 콘솔 (외부 메신저 연동 / 커뮤니케이션 연동 그룹)**
- `packages/types`: `MESSENGER_PROVIDERS`(6종) + `COMMUNICATION_PROVIDERS`(gmail) + 필드 스펙,
  `apps/web/.../integration-providers.ts` 미러 동기화(KEEP IN SYNC 규칙)
- 신규 컴포넌트 `MessengerChannelCard` + `MessengerChannelModal`(기존 `ProviderTile`/`IntegrationConfigModal` 스타일 계승,
  다중 계정·자동응답 토글·동의 모드가 추가되어 별도 컴포넌트로 분리)
- i18n en/es/ko, 저장·테스트·활성화 전부 토스트(무음 성공 금지)

### P2 — 확장 (승인 후 별도 계획)
잘로·라인·와츠앱 실계정 스모크, 첨부 수신, 상담원 승인모드, 아메바톡 outbound webhook 전환(폴링 제거),
필요 시 특정 채널의 허브→직접 어댑터 전환(포트가 같으므로 어댑터 교체 + 카드 `mode` 변경만).

### 3.1 채널별 구현 경로 (Rev.2 확정)

| 채널 | 경로 | 인입 | 발신 | 개설 요건 |
|---|---|---|---|---|
| 텔레그램 | **직접** | webhook(`setWebhook`+secret_token) | `sendMessage` | BotFather 봇 토큰 — 즉시 |
| 바이버 | **직접** | webhook(`set_webhook`+HMAC 서명) | `send_message` | 퍼블릭 계정 토큰 — 즉시 |
| 잘로 · 라인 · 와츠앱 | **허브(아메바톡)** | 아메바톡 Inbox 폴링 | 아메바톡 발신 API | 아메바톡 계정(심사 회피) |
| (페이스북 · 카카오톡 채널) | **허브(아메바톡)** | 동일 | 동일 | 요구 범위 밖 — 카드 미노출, 필요 시 즉시 편입 |
| **카카오톡 개인·그룹방** | **허브(btbz 릴레이)** | 릴레이 인박스 폴링 | `/api/relay/replies` = 비동기 명령 | 가맹점 PC 에이전트 + 리스크 서명, **PC 캡처 미검증** |
| **SMS** | **허브(btbz 릴레이)** | 동일(Android 에이전트) | **발신 불가(수신 전용)** | Android 에이전트 설치 |
| 지메일 업무용 1·2 | **직접** | IMAP | SMTP(`In-Reply-To`) | 앱 비밀번호 — 즉시 |

## 4. 설계 판단

### 4.1 왜 BullMQ가 아니라 아웃박스 테이블인가
AMA는 BullMQ의 재시도/DLQ에 의존하지만 ShopTalk의 `EventBusService`는 **at-least-once 발행 + in-process 폴백**뿐
재시도가 없다. 큐 스택을 새로 들이는 대신 `channel_outbox`(상태·시도횟수·다음시각)로 같은 보장을 얻는다 — 적정기술,
그리고 발송 실패가 **DB에 남아 콘솔에서 보인다**는 이점.

### 4.2 3중 루프방지 (AMA 검증 규약 그대로)
① **자기 발신 필터** — 허브는 `user_type==='1'`(상담원/봇) 제외, 텔레그램/바이버는 봇 자신의 메시지 제외 ·
② `channel_message_map` 외부ID 중복 skip · ③ inbound 유래 메시지는 아웃박스 적재 금지.

### 4.3 이중 AI 방지 (REQ G9)
아메바톡에도 AI 에이전트가 있다. **릴레이 대상 소셜 채널은 아메바톡 AI 에이전트를 pause** 해야 하며,
연결 테스트에서 활성 AI 에이전트가 감지되면 카드에 경고를 띄운다(운영 규약 + UI 경고).

### 4.4 동의 처리 (D-4 확정 — 권장안)
`consent_mode='notice'`(기본): 채널 첫 인입 시 개인정보 안내 문구를 **먼저 발송**하고
`consent_state='granted'` + `consent_at` + `consent_version` 기록 후 대화 진행 — 위젯 동의배너와 동일한
감사 증적(PRV-M4)을 외부 채널에서도 남긴다. 안내문은 `session.language` 기준 en/es/ko.
`'auto'`는 플랫폼 ToS를 근거로 안내 없이 진행(테넌트 책임, 카드에서 선택).
그대로 두면 `pending` → AI가 전 메시지를 거부하고 **에러가 아니라 정상 응답이라 로그도 남지 않는다**(REQ G3).

### 4.5 발신 창 제약 (REQ G6)
허브가 창 만료를 에러로 돌려주면 `E5027`로 분류 → 아웃박스 `failed` + (이메일 보유 시) 기존 근무시간외 메일 회신 폴백.

### 4.6 btbz 릴레이 — 비동기 발신·수신전용 채널 (REQ G12·G13)
릴레이 발신은 **전달 ACK가 원천적으로 없다**. `POST /api/relay/replies`는 에이전트에게 보낼 명령을 만들 뿐이고,
결과는 `SENT`(에이전트가 성공 확인) / **`SENT_UNCONFIRMED`**(보냈지만 확인 불가) / `FAILED` / TTL 만료다.
- 아웃박스는 발신 직후 `unconfirmed` + `external_command_id` 저장 → 워커가 `GET /inbox/conversations/{id}/commands`로
  확인 → `SENT`면 `sent`, `FAILED`/만료면 `failed`(+ 재시도), `SENT_UNCONFIRMED`면 **`unconfirmed`로 유지**한다.
- 콘솔은 `sent`와 `unconfirmed`를 **시각적으로 구분**한다 — 확인되지 않은 발신을 "전송됨"으로 표기하면 거짓 보고가 된다.
- 캡처 에이전트가 오프라인이면 릴레이가 400을 준다 → 즉시 `failed` + 채널 `last_error`(재시도 무의미).
- **SMS 스레드는 `reply_enabled=0`** → 자동응답을 시도하지 않고 곧바로 상담원 이관(발신 400 반복 방지).
  비공식 채널(`is_unofficial`)은 자동응답 기본 OFF, 테넌트가 명시적으로 켜야 한다(REQ G15).

## 5. 화면 (ASCII 와이어프레임)

**5.1 설정 → 신규 2개 그룹** (기존 "스토어 연동/마케팅 연동" 아래)
```
┌ 연동 설정 ───────────────────────────────────────────────────────┐
│ 스토어 연동   [Shopify][Cafe24][WooCommerce][Odoo][Haravan] (기존)│
│ 마케팅 연동   [Klaviyo][Yotpo]  · 헬프데스크 [Gorgias]      (기존)│
│──────────────────────────────────────────────────────────────────│
│ 외부 메신저 연동                                     ← 신설       │
│  ⓘ 잘로·라인·와츠앱은 아메바톡 허브 경유 / 텔레그램·바이버는 직접   │
│  ┌ 아메바톡 [허브] ────┐ ┌ 잘로 [허브] ───────┐ ┌ 라인 [허브] ──┐│
│  │ ● connected         │ │ ● connected        │ │ ○ 미연결      ││
│  │ 회사: IVY USA        │ │ OA: ivyusa_vn      │ │               ││
│  │ 자동응답  [ON  ]     │ │ 자동응답  [ON  ]    │ │ (허브 연결 후)││
│  │ 최근수신 08-10 14:22 │ │ 최근수신 08-10 13:5│ │               ││
│  │ [설정][연결 테스트]  │ │ [설정][테스트]      │ │ [설정]        ││
│  └─────────────────────┘ └────────────────────┘ └───────────────┘│
│  ┌ 와츠앱 [허브] ──────┐ ┌ 텔레그램 [직접] ───┐ ┌ 바이버 [직접] ┐│
│  │ ○ 미연결            │ │ ● connected        │ │ ○ 미연결      ││
│  │                     │ │ @ivyusa_bot        │ │               ││
│  │                     │ │ 자동응답  [ON  ]    │ │               ││
│  │ [설정]              │ │ [설정][테스트]      │ │ [설정]        ││
│  └─────────────────────┘ └────────────────────┘ └───────────────┘│
│  ┌ btbz 메신저 릴레이 [허브] ────────────────────────────────────┐│
│  │ ⚠ 비공식 채널 — 가맹점 PC/단말 에이전트 필요, 카카오 ToS 리스크││
│  │ ● connected   messenger.amoeba.site   계정 ops@amoeba.group  ││
│  │ 카카오톡(개인·그룹) 대화 12 · 자동응답 [OFF]  ← 기본 OFF      ││
│  │ SMS 대화 5 · 수신 전용(발신 불가)                             ││
│  │ 에이전트: PC ● ACTIVE / Android ● ACTIVE   최근수신 14:31     ││
│  │ [설정][연결 테스트]                                           ││
│  └───────────────────────────────────────────────────────────────┘│
│──────────────────────────────────────────────────────────────────│
│ 커뮤니케이션 연동                                    ← 신설       │
│  ┌ 지메일 · 업무용 1 ──────────┐ ┌ 지메일 · 업무용 2 ───────────┐│
│  │ support@ivyusa.com          │ │ (미설정)                     ││
│  │ ● connected  자동응답 [OFF] │ │                              ││
│  │ 최근수신 08-10 14:05        │ │ [+ 계정 추가]                ││
│  │ [설정][연결 테스트][해제]   │ │                              ││
│  └─────────────────────────────┘ └──────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
```

**5.2 채널 설정 모달** (예: 지메일 / 아메바톡)
```
┌ 지메일 연동 · 업무용 1 ──────────────────────────────┐
│ 표시명       [업무용 1                             ] │
│ 메일 주소    [support@ivyusa.com                   ] │
│ IMAP 호스트  [imap.gmail.com      ] 포트 [993]       │
│ SMTP 호스트  [smtp.gmail.com      ] 포트 [587]       │
│ 앱 비밀번호  [••••••••••••  ] (저장됨 — 재입력 시 교체)│
│ 자동응답     [ON ▾]      동의 처리 [최초 안내 ▾]      │
│ ─────────────────────────────────────────────────── │
│              [연결 테스트]   [취소]   [저장]          │
└──────────────────────────────────────────────────────┘
┌ 텔레그램 연동 (직접) ────────────────────────────────┐
│ 봇 토큰      [••••••••••••••••  ] (BotFather 발급)   │
│ 수신 URL     https://shoptalk…/webhooks/messenger/   │
│              telegram/9f3c…             [복사]        │
│              ⓘ [활성화] 시 setWebhook 자동 등록        │
│ 자동응답     [ON ▾]      동의 처리 [최초 안내 ▾]      │
│              [연결 테스트]   [취소]   [저장]          │
└──────────────────────────────────────────────────────┘
┌ 아메바톡 연동 (허브) ────────────────────────────────┐
│ 계정 이메일  [ops@amoeba.group                     ] │
│ 비밀번호     [••••••••  ]   회사(workspace) [IVY USA ▾]│
│ 인입 채널    [x]잘로 [x]라인 [ ]와츠앱 [ ]페북 [ ]카톡│
│ ⚠ 선택한 채널의 아메바톡 AI 에이전트는 일시중지 필요   │
│              [연결 테스트]   [취소]   [저장]          │
└──────────────────────────────────────────────────────┘
```

**5.3 실시간 채팅 — 대화 리스트에 채널 뱃지 + 필터** (`/live-chat`)
```
┌ 대화 목록 ──────────────────────────┐
│ [전체][대기열][종료]  채널 [전체 ▾] │ ← 채널 필터 신설
│─────────────────────────────────────│
│ ● 홍길동           [잘로]   14:22   │ ← 채널 뱃지 신설
│   주문 언제 오나요?                  │
│ ● Jane Doe        [위젯]   14:19    │
│ ● 김철수    [카톡·비공식] 14:31     │ ← 릴레이(발신 미확인 표기 대상)
│ ● 010-1234-…  [SMS·수신전용] 14:28  │ ← 답장 입력창 비활성 + 안내
│ ○ support@…       [지메일] 14:05    │
└─────────────────────────────────────┘
```

## 6. 사이드 임팩트

| 영역 | 영향 | 판단 |
|---|---|---|
| 위젯 대화 | 인입 경로만 추가, `handleUserMessage` 시그니처 불변 | 무영향 |
| 상담원 콘솔 | 리스트 응답에 `channel` 필드 **추가**(제거 없음), 필터는 선택 파라미터 | 하위호환 |
| 모더레이션·이관·answer-reuse | 기존 경로 그대로 통과 | 정책 유지 |
| 근무시간외 이메일 | 외부 채널은 원 채널 발신이 우선, 창 만료 시에만 메일 폴백 | §4.5 |
| 통계/CJM | `chat_message` 이벤트가 외부 채널만큼 증가(채널 축 없음) | P2에서 채널 분해 |
| 성능 | 채널당 폴링 1회/주기 + 아웃박스 워커 1개 | 기존 스케줄러 패턴과 동일 부하 |
| 보안 | 신규 비밀 2종(허브 비밀번호, 앱 비밀번호) → AES-256-GCM·마스킹·감사 | 기존 규약 |

## 7. 테스트 / 배포

- **단위**: 인입 멱등(같은 외부ID 2회 → 메시지 1건), 루프방지 3종, 아웃박스 백오프·5회 실패,
  허브 정규화(`user_type` 분기), 스레드 유니크 충돌 복구, 동의 notice 1회성, 지메일 스레드 매칭,
  **텔레그램 secret_token 불일치 401 · 바이버 HMAC 서명 위조 401 · 미설정 시 fail-closed**,
  **릴레이 명령 상태 전이(pending→unconfirmed→sent/failed) · SMS 스레드 발신 시도 자체가 없음 ·
  릴레이 401 시 재로그인 1회 후 재시도**
- **통합**: (a) 텔레그램 webhook → 대화 생성 → AI 답변 → sendMessage → 매핑 기록,
  (b) 허브 폴링(아메바톡·릴레이) → 동일 경로 → 재폴링 시 자기 메시지(`direction='outbound'`) 무시
- **스테이징**: 텔레그램 실봇 왕복(가장 빠른 E2E 검증) → btbz 릴레이 실계정(Android SMS 인입은 현재 동작,
  카카오 PC는 스파이크 상태라 **SMS 수신 경로부터 검증**) → 아메바톡 실계정 → 지메일 업무용 1계정,
  콘솔 뱃지·필터·미확인 발신 표기 확인
- **Migration(필수)**: `sql/migration_messenger_channels.sql`을 **스테이징 DB에 선적용 후 코드 배포**
  (`DB_SYNCHRONIZE=false`). PR 본문에 `## Migration` 섹션(SQL 경로·환경별 체크박스·롤백) 필수.
  롤백 = 신규 4테이블 DROP(기존 테이블 변경 없음, `conversations.channel`은 값만 추가)
- **배포 검증**: 부팅 로그 `successfully started` + `docker ps` STATUS + 신규 라우트 401 확인

## 8. 리스크 / 후속

| ID | 리스크 | 대응 |
|---|---|---|
| R-1 | *(해소 — Rev.2)* 텔레그램·바이버는 ShopTalk 직접 어댑터로 처리. 남은 비용은 **인입 경로 2종(webhook/폴링) 동시 유지** | 정규화 스키마와 인입 파이프라인을 어댑터 바깥에 두어 분기를 어댑터 경계로 국한(§1) |
| R-1b | 직접 채널은 **공개 webhook 엔드포인트**가 늘어남 | 토큰 라우팅 + 서명 검증 fail-closed + `@SkipThrottle`은 서명 검증 후에만 신뢰, 거부 시 `logger.warn` |
| R-2 | 허브 폴링 지연(수 초~수십 초) | PoC 검증 후 아메바톡에 outbound webhook 신설 요청 → 어댑터 `ingest()` 재사용으로 전환 |
| R-3 | 아메바톡 인증이 email/password JWT (서버-서버 API Key 없음) | 전용 봇 계정 발급 + 비밀번호 암호화 저장 + 토큰 캐시. 장기적으로 API Key 방식 요청 |
| R-4 | 이중 AI 응답 | §4.3 운영 규약 + 연결 테스트 경고 |
| R-5 | 지메일 앱 비밀번호가 Workspace 정책상 차단될 수 있음 | 사전 확인 필요(테넌트 관리자). 차단 시 D-2를 OAuth로 전환(심사 리드타임 발생) |
| R-6 | 허브 장애 = 해당 허브의 전 채널 동시 중단 | 상태·`last_error` 카드 노출 + 아웃박스 보존(복구 후 재발송). 허브가 2개(아메바톡·릴레이)라 장애 영향은 분산 |
| R-7 | **릴레이 카카오톡 PC 캡처가 미검증 스파이크(Q-02)** — 상대 프로젝트의 Phase 0 게이트가 아직 안 열림 | ShopTalk 어댑터는 릴레이 API 계약에만 의존하므로 **PC 캡처 완성과 무관하게 선구현 가능**. 스테이징 검증은 이미 동작하는 **SMS 인입**으로 먼저 수행, 카카오는 스파이크 종료 후 |
| R-8 | **비공식 채널 컴플라이언스** — 카카오 ToS 법률의견(Q-01) 보류, 리스크 서명 게이트는 릴레이 측 책임 | ShopTalk은 카드에 경고 표기 + 자동응답 기본 OFF. 법적 판단은 릴레이 프로젝트의 게이트를 따르고 ShopTalk이 우회 제공하지 않음 |
| R-9 | ~~릴레이 운영자 API에 테넌트 필터 없음~~ | **해소** — KSR은 멀티테넌트가 아니라 **개별 고객 커스텀 전용**(사용자 확인 2026-08-10, REQ §6). 채널 1개 = 릴레이 계정 1개 = 테넌트 1개 고정 매핑, 계정 공유 없음. 중계 개시/중단 권한은 단말 사용자 본인에게 있으므로 ShopTalk 카드는 **상태 표시·요청만** 제공하고 원격 강제 운용은 구현하지 않는다 |
| R-10 | 릴레이 JWT 12h·리프레시 없음 | 401 감지 시 자동 재로그인, 실패 시 채널 `error` + 카드 노출 |

## 9. 산출물

구현 후 `docs/test/TCR-260810-Multi-Messenger-Integration.md`,
`docs/implementation/RPT-260810-Multi-Messenger-Integration.md`(PR#·SHA·환경별 배포/마이그레이션 상태) 작성.
