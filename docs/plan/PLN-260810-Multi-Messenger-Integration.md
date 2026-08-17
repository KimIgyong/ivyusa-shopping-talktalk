# PLN-260810-Multi-Messenger-Integration

외부 메신저(잘로·바이버·와츠앱·라인·텔레그램·아메바톡) + 커뮤니케이션(지메일 업무용 1·2) 연동
작업계획서 — **아메바톡 허브 경유 + 지메일 IMAP 직접**, PoC 우선.

- 근거: `REQ-260810-Multi-Messenger-Integration` (2026-08-10)
- **승인 필요** — 본 계획 승인 전 구현 착수 금지(CLAUDE.md §7)

## 0. 승인된 결정 (2026-08-10)


| ID  | 결정                            | 결과                                                                                                                           |
| --- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| D-1 | 채널 확보 = **전부 아메바톡 허브**        | ShopTalk은 메신저 API를 직접 구현하지 않는다. 잘로·라인·와츠앱(+페이스북·카카오톡)은 아메바톡 Inbox 경유. **텔레그램·바이버는 아메바톡에 미구현 → 아메바톡 측 신규 개발 요청 후 대기**(§8 R-1) |
| D-2 | 지메일 = **IMAP + 앱 비밀번호**       | AMA `webmail`의 ImapFlow 자산 이식, 업무용 2계정(다중 계정 구조)                                                                             |
| D-3 | AI 발신 = **자동 발신(채널별 on/off)** | 위젯과 동일 파이프라인, 채널 카드에 자동응답 토글                                                                                                 |
| D-5 | 범위 = **PoC 우선**               | P1에서 프레임+허브+지메일 실동작, P2에서 채널 확장                                                                                              |
| D-4 | *(미확정)* 외부 채널 동의 처리           | **본 계획의 가정**: 채널 최초 1턴에 개인정보 안내 발송 후 `granted` 기록(§4.4). 승인 시 확정                                                             |


---

## 1. 아키텍처

```
 ┌──────────── 외부 ────────────┐        ┌──────────────── ShopTalk API ─────────────────┐
 │ 잘로 / 라인 / 와츠앱          │        │                                                │
 │ (+페북·카톡) ──┐              │  pull  │  MessengerSyncService (setInterval, 채널별)    │
 │               ├─ 아메바톡 ────┼───────▶│    └ AmoebaTalkHubAdapter                      │
 │               │  Inbox API   │  push  │        · JWT(signin→select-company→refresh)    │
 │               │              │◀───────┤        · GET /api/inbox/conversations (커서)    │
 │ 지메일 업무용1,2 ─ IMAP ──────┼───────▶│        · POST /inbox/conversations/{id}/messages│
 │                              │        │    └ GmailImapAdapter (ImapFlow, IDLE/폴링)     │
 └──────────────────────────────┘        │                                                │
                                          │  ▼ 공통 인입 파이프라인 (채널 무관)             │
                                          │  normalize → thread 확보 → 중복차단 →           │
                                          │  messages 저장 → ChatService.handleUserMessage │
                                          │  (동의·intent·deny·RAG·**모더레이션**·이관)     │
                                          │  ▼                                             │
                                          │  channel_outbox → OutboxWorker → 어댑터 send   │
                                          └────────────────────────────────────────────────┘
```

**공통 포트**(채널별 구현을 갈아끼우는 지점) — `MessengerAdapter`:

```ts
interface MessengerAdapter {
  readonly provider: string;                                  // amoebatalk | gmail | (telegram…)
  test(ch: MessengerChannel): Promise<{ ok: boolean; detail: string }>;
  pull(ch: MessengerChannel): Promise<NormalizedInbound[]>;   // 폴링형
  send(ch: MessengerChannel, t: ChannelThread, text: string): Promise<{ externalMessageId: string }>;
}
```

지금은 폴링형 2종만 구현하되, 후일 직접 어댑터(webhook형)를 추가할 때 `ingest(normalized)`만 재사용하도록
**정규화 스키마와 인입 파이프라인을 어댑터 바깥에** 둔다.

## 2. 스키마 (신규 4테이블 — `sql/migration_messenger_channels.sql`)

```sql
-- 채널 계정 (테넌트당 프로바이더별 N개 — 지메일 2계정 요구 충족)
CREATE TABLE messenger_channels (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  provider VARCHAR(16) NOT NULL,          -- amoebatalk|gmail|zalo|line|whatsapp|viber|telegram
  mode VARCHAR(8) NOT NULL DEFAULT 'hub', -- hub|direct
  label VARCHAR(64) NOT NULL,             -- '업무용 1' 등 카드 표시명
  external_account_id VARCHAR(128) NULL,  -- 아메바톡 company_id / 메일주소
  config JSON NULL,                       -- 비밀 아닌 설정(social_type, imap host/port…)
  secret_enc VARBINARY(2048) NULL,        -- AES-256-GCM (crypto.util)
  auto_reply TINYINT(1) NOT NULL DEFAULT 1,
  consent_mode VARCHAR(8) NOT NULL DEFAULT 'notice', -- notice|auto (§4.4)
  active TINYINT(1) NOT NULL DEFAULT 0,
  status VARCHAR(16) NOT NULL DEFAULT 'unknown',     -- connected|error|unknown
  last_sync_at DATETIME NULL, last_error VARCHAR(255) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_mc_tenant_provider_label (tenant_id, provider, label)
);

-- 외부 대화 ↔ ShopTalk conversation (고객 식별 정보 포함 — 별도 identity 테이블 없이 단순화)
CREATE TABLE channel_threads (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL, channel_id BIGINT NOT NULL,
  external_thread_id VARCHAR(128) NOT NULL,   -- 아메바톡 conversation_id / 메일 스레드ID
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
  status VARCHAR(12) NOT NULL DEFAULT 'pending',  -- pending|sent|failed
  attempts INT NOT NULL DEFAULT 0, next_attempt_at DATETIME NULL, last_error VARCHAR(255) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_co_message (message_id),
  KEY idx_co_due (status, next_attempt_at)
);
```

`conversations.channel`(varchar 32)에 provider 값을 그대로 기록 → 대화 리스트 뱃지의 원천.
엔티티는 nullable 컬럼에 **명시 `type`** 필수(union 타입만 쓰면 부팅 크래시 — CLAUDE.md §2).

## 3. 단계별 계획

### P1 — PoC (PR 3건)

**PR-M1 · 코어 프레임 + 아메바톡 허브 어댑터** (`apps/api/src/domain/messenger/`)

- `entity/` 4종, `messenger.service.ts`(채널 CRUD·자격증명 암호화·연결테스트),
`ingest.service.ts`(공통 인입 파이프라인), `outbox.service.ts` + `outbox.worker.ts`(setInterval·지수백오프),
`adapter/amoeba-talk-hub.adapter.ts`, `messenger-sync.service.ts`(setInterval, `MESSENGER_SYNC_INTERVAL_SEC`, `running` 가드)
- 인입 파이프라인(어댑터 공통):
  1. `findOrCreateThread` — 유니크 충돌은 정상 경로로 처리(동시 폴링 안전, AMA 패턴)
  2. `channel_message_map`에 외부ID 있으면 **skip** (루프방지 ②)
  3. 세션 확보(`channel=provider`, 언어=프로필 locale→테넌트 기본) → `conversations`(channel=provider) 확보
  4. `messages` 저장(`sender_type='user'`) + inbound 매핑
  5. `auto_reply && !humanOwnsThread` → `ChatService.handleUserMessage()` → 반환 답변은 이미 저장됨
- 아웃바운드: 메시지 저장 후 훅 → 해당 conversation이 채널 스레드인지 판별 → **inbound 유래면 발신 금지**(루프방지 ③) →
`channel_outbox` 삽입(`uk_co_message`로 중복 방지) → 워커가 어댑터 `send()` → 성공 시 outbound 매핑 기록,
실패 시 `attempts++`·`next_attempt_at` 백오프(1m/5m/30m, 5회 후 failed + 채널 `last_error`)
- 허브 어댑터 상세: 자격증명(email/password/company_id) 암호화 저장, 액세스 토큰은 **Redis 캐시 + refresh**,
폴링 = `GET /api/inbox/conversations?social_type=&page=1&limit=20` → `last_message_time`이 스레드 `last_inbound_at`보다
최신인 대화만 `GET /{id}/messages?limit=50` → `user_type==='0'`(고객) &amp; `id > inbound_cursor`만 인입,
발신 = `POST /{id}/messages {content}`
- 에러코드 신규 블록 **E5023~E5027**(채널 미설정/자격증명 실패/발신 실패/외부 API 오류/발신 창 만료)

**PR-M2 · 지메일 IMAP 어댑터 + 콘솔 채널 노출**

- `adapter/gmail-imap.adapter.ts` — `imapflow` 의존 추가, AMA `webmail`의 폴더 special-use 해석·MIME 파서 로직 이식
(INBOX만 대상, `UNSEEN` + `since` 기반, 스레드ID = `References`/`Message-ID` 체인 루트)
- 발신은 기존 `MailerService`(SMTP)에 `In-Reply-To`/`References` 부여 → 같은 메일 스레드로 회신
- 콘솔: `agent.mapper.toSessionResponse`에 `**channel` 추가** → 대화 리스트 뱃지 + 채널 필터(쿼리 `channel=`),
`agent.service.listSessions` 필터 확장

**PR-M3 · 설정 콘솔 (외부 메신저 연동 / 커뮤니케이션 연동 그룹)**

- `packages/types`: `MESSENGER_PROVIDERS`(6종) + `COMMUNICATION_PROVIDERS`(gmail) + 필드 스펙,
`apps/web/.../integration-providers.ts` 미러 동기화(KEEP IN SYNC 규칙)
- 신규 컴포넌트 `MessengerChannelCard` + `MessengerChannelModal`(기존 `ProviderTile`/`IntegrationConfigModal` 스타일 계승,
다중 계정·자동응답 토글·동의 모드가 추가되어 별도 컴포넌트로 분리)
- i18n en/es/ko, 저장·테스트·활성화 전부 토스트(무음 성공 금지)

### P2 — 확장 (승인 후 별도 계획)

채널 확대(잘로·라인·와츠앱 실계정 검증), 첨부 수신, 상담원 승인모드, 아메바톡 webhook 전환(폴링 제거),
텔레그램·바이버(아메바톡 측 개발 완료 시 허브로 자동 편입).

## 4. 설계 판단

### 4.1 왜 BullMQ가 아니라 아웃박스 테이블인가

AMA는 BullMQ의 재시도/DLQ에 의존하지만 ShopTalk의 `EventBusService`는 **at-least-once 발행 + in-process 폴백**뿐
재시도가 없다. 큐 스택을 새로 들이는 대신 `channel_outbox`(상태·시도횟수·다음시각)로 같은 보장을 얻는다 — 적정기술,
그리고 발송 실패가 **DB에 남아 콘솔에서 보인다**는 이점.

### 4.2 3중 루프방지 (AMA 검증 규약 그대로)

① 허브 응답의 `user_type==='1'`(상담원/봇 발신) 제외 · ② `channel_message_map` 외부ID 중복 skip ·
③ inbound 유래 메시지는 아웃박스 적재 금지.

### 4.3 이중 AI 방지 (REQ G9)

아메바톡에도 AI 에이전트가 있다. **릴레이 대상 소셜 채널은 아메바톡 AI 에이전트를 pause** 해야 하며,
연결 테스트에서 활성 AI 에이전트가 감지되면 카드에 경고를 띄운다(운영 규약 + UI 경고).

### 4.4 동의 처리 (D-4 가정)

`consent_mode='notice'`: 채널 첫 인입 시 개인정보 안내 문구를 **먼저 발송**하고 `consent_state='granted'` +
`consent_version` 기록 후 대화 진행. `'auto'`는 플랫폼 ToS를 근거로 안내 없이 진행(테넌트 책임).
그대로 두면 `pending` → AI가 전 메시지를 거부하고 **로그도 남지 않는다**(REQ G3).

### 4.5 발신 창 제약 (REQ G6)

허브가 창 만료를 에러로 돌려주면 `E5027`로 분류 → 아웃박스 `failed` + (이메일 보유 시) 기존 근무시간외 메일 회신 폴백.

## 5. 화면 (ASCII 와이어프레임)

**5.1 설정 → 신규 2개 그룹** (기존 "스토어 연동/마케팅 연동" 아래)

```
┌ 연동 설정 ───────────────────────────────────────────────────────┐
│ 스토어 연동   [Shopify][Cafe24][WooCommerce][Odoo][Haravan] (기존)│
│ 마케팅 연동   [Klaviyo][Yotpo]  · 헬프데스크 [Gorgias]      (기존)│
│──────────────────────────────────────────────────────────────────│
│ 외부 메신저 연동                                     ← 신설       │
│  연결 방식: ● 아메바톡 허브 경유    ⓘ 잘로·라인·와츠앱은 허브 계정  │
│  ┌ 아메바톡 ───────────┐ ┌ 잘로 ──────────────┐ ┌ 라인 ─────────┐│
│  │ ● connected         │ │ ● connected (허브) │ │ ○ 미연결      ││
│  │ 회사: IVY USA        │ │ OA: ivyusa_vn      │ │               ││
│  │ 자동응답  [ON  ]     │ │ 자동응답  [ON  ]    │ │               ││
│  │ 최근수신 08-10 14:22 │ │ 최근수신 08-10 13:5│ │               ││
│  │ [설정][연결 테스트]  │ │ [설정][테스트]      │ │ [설정]        ││
│  └─────────────────────┘ └────────────────────┘ └───────────────┘│
│  ┌ 와츠앱 ─────────────┐ ┌ 텔레그램 ──────────┐ ┌ 바이버 ───────┐│
│  │ ○ 미연결            │ │ ⚠ 허브 미지원       │ │ ⚠ 허브 미지원  ││
│  │ [설정]              │ │ 아메바톡 지원 예정  │ │ 지원 예정      ││
│  └─────────────────────┘ └────────────────────┘ └───────────────┘│
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
┌ 아메바톡 연동 ───────────────────────────────────────┐
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
│ ○ support@…       [지메일] 14:05    │
└─────────────────────────────────────┘
```

## 6. 사이드 임팩트


| 영역                    | 영향                                              | 판단                |
| --------------------- | ----------------------------------------------- | ----------------- |
| 위젯 대화                 | 인입 경로만 추가, `handleUserMessage` 시그니처 불변          | 무영향               |
| 상담원 콘솔                | 리스트 응답에 `channel` 필드 **추가**(제거 없음), 필터는 선택 파라미터 | 하위호환              |
| 모더레이션·이관·answer-reuse | 기존 경로 그대로 통과                                    | 정책 유지             |
| 근무시간외 이메일             | 외부 채널은 원 채널 발신이 우선, 창 만료 시에만 메일 폴백              | §4.5              |
| 통계/CJM                | `chat_message` 이벤트가 외부 채널만큼 증가(채널 축 없음)         | P2에서 채널 분해        |
| 성능                    | 채널당 폴링 1회/주기 + 아웃박스 워커 1개                       | 기존 스케줄러 패턴과 동일 부하 |
| 보안                    | 신규 비밀 2종(허브 비밀번호, 앱 비밀번호) → AES-256-GCM·마스킹·감사  | 기존 규약             |




## 7. 테스트 / 배포

- **단위**: 인입 멱등(같은 외부ID 2회 → 메시지 1건), 루프방지 3종, 아웃박스 백오프·5회 실패,
허브 정규화(`user_type` 분기), 스레드 유니크 충돌 복구, 동의 notice 1회성, 지메일 스레드 매칭
- **통합**: 허브 폴링 → 대화 생성 → AI 답변 → 발신 매핑 기록 → 재폴링 시 자기 메시지 무시(전체 루프)
- **스테이징**: 아메바톡 실계정(회사 워크스페이스) + 지메일 업무용 1계정으로 왕복 스모크, 콘솔 뱃지·필터 확인
- **Migration(필수)**: `sql/migration_messenger_channels.sql`을 **스테이징 DB에 선적용 후 코드 배포**
(`DB_SYNCHRONIZE=false`). PR 본문에 `## Migration` 섹션(SQL 경로·환경별 체크박스·롤백) 필수.
롤백 = 신규 4테이블 DROP(기존 테이블 변경 없음, `conversations.channel`은 값만 추가)
- **배포 검증**: 부팅 로그 `successfully started` + `docker ps` STATUS + 신규 라우트 401 확인

## 8. 리스크 / 후속


| ID  | 리스크                                             | 대응                                                                                                                        |
| --- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| R-1 | **텔레그램·바이버가 아메바톡에 없음** — D-1(전부 허브)에서는 즉시 연동 불가 | 카드는 "지원 예정"으로 노출하고, 아메바톡 팀에 두 채널 신규 개발 요청(둘 다 봇 토큰 + webhook만으로 되는 최저난도). 급하면 D-1을 하이브리드로 조정하면 ShopTalk 직접 어댑터로 1~2일 내 가능 |
| R-2 | 허브 폴링 지연(수 초~수십 초)                              | PoC 검증 후 아메바톡에 outbound webhook 신설 요청 → 어댑터 `ingest()` 재사용으로 전환                                                           |
| R-3 | 아메바톡 인증이 email/password JWT (서버-서버 API Key 없음)  | 전용 봇 계정 발급 + 비밀번호 암호화 저장 + 토큰 캐시. 장기적으로 API Key 방식 요청                                                                     |
| R-4 | 이중 AI 응답                                        | §4.3 운영 규약 + 연결 테스트 경고                                                                                                    |
| R-5 | 지메일 앱 비밀번호가 Workspace 정책상 차단될 수 있음              | 사전 확인 필요(테넌트 관리자). 차단 시 D-2를 OAuth로 전환(심사 리드타임 발생)                                                                        |
| R-6 | 허브 장애 = 전 메신저 채널 동시 중단                          | 상태·`last_error` 카드 노출 + 아웃박스 보존(복구 후 재발송)                                                                                 |




&nbsp;

## 9. 산출물

구현 후 `docs/test/TCR-260810-Multi-Messenger-Integration.md`,
`docs/implementation/RPT-260810-Multi-Messenger-Integration.md`(PR#·SHA·환경별 배포/마이그레이션 상태) 작성.