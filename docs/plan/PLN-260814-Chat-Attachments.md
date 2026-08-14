# PLN-260814-Chat-Attachments

대화방 첨부(이미지 썸네일 · 미리보기 · 파일) 실행 계획.
근거: `docs/analysis/REQ-260814-Chat-Attachments.md`

- 작성일: 2026-08-14
- 기준 브랜치: `feature/chat-attachments` (from `origin/main` `b8a9335`)
- **UI 변경 있음 → 와이어프레임 §6 필수 포함**

## 1. 목표 / 비목표

**목표**
1. 고객(위젯·외부 메신저)이 보낸 이미지·파일이 라이브챗 대화방에 **썸네일/파일 카드**로 보인다.
2. 상담원이 썸네일을 눌러 **라이트박스로 확대·이동·다운로드**한다.
3. 상담원이 대화방에서 **첨부를 발신**한다.
4. 파일은 배포로 사라지지 않고, 보존기간·DSAR에 맞춰 **확실히 지워진다.**

**비목표(이번 범위 밖 — 명시적으로 하지 않음)**
- 이미지 내용 모더레이션 / OCR / AI 이미지 이해
- 악성코드 스캐닝
- 오브젝트 스토리지(S3/R2) 전환
- 압축파일·HEIC 지원, 이미지 편집·주석
- 첨부 검색

## 2. 설계 개요 — "업로드 선행(pre-upload)" 방식

메시지 전송 API를 multipart로 바꾸지 않는다. 파일은 **먼저 별도 엔드포인트로 업로드**해
`attachment_id`를 받고, 기존 메시지 전송 요청에 id 배열만 실어 보낸다.

```
① 업로드            ② 전송                         ③ 표시
POST /files/upload  POST /chat/message            GET /chat/conversation
 (multipart, 1건)    { message, attachment_ids }   → messages[].attachments[]
   ↓                        ↓                            ↓
 검증·재인코딩·썸네일    message_attachments를        서명 URL(15분)이 매 응답마다
 /data/uploads 저장      메시지에 귀속 (트랜잭션)      새로 발급되어 내려감
```

이유:
- 위젯/콘솔/외부 어댑터 **세 경로의 전송 계약을 건드리지 않고** 필드 하나만 추가한다.
- 업로드 실패와 전송 실패가 분리되어, 진행률·재시도 UX가 단순해진다.
- 어댑터 포트도 `attachments`만 옵셔널로 추가하면 되어 기존 어댑터가 그대로 컴파일된다.

**미귀속(orphan) 첨부**: 업로드했지만 전송하지 않은 행은 `message_id = NULL`로 남는다.
24시간 지난 미귀속 첨부는 청소 배치가 파일과 함께 삭제한다.

## 3. 데이터 모델

`sql/migration_message_attachments.sql` (신규):

```sql
CREATE TABLE message_attachments (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uuid            CHAR(36)        NOT NULL,           -- 외부 노출 식별자(경로/서명 URL)
  tenant_id       BIGINT          NOT NULL,
  conversation_id BIGINT          NULL,               -- 업로드 시점에 확정(위젯=세션의 최신 대화)
  message_id      BIGINT          NULL,               -- 전송 전에는 NULL(미귀속)
  uploader_type   VARCHAR(16)     NOT NULL,           -- user | agent | system
  uploader_id     BIGINT          NULL,               -- 상담원 user id (고객은 NULL)
  kind            VARCHAR(16)     NOT NULL,           -- image | file
  filename        VARCHAR(255)    NOT NULL,           -- 원본 파일명(표시용, 정제됨)
  mime            VARCHAR(128)    NOT NULL,           -- 매직바이트로 확정한 값
  size            BIGINT          NOT NULL,
  width           INT             NULL,
  height          INT             NULL,
  storage_path    VARCHAR(512)    NOT NULL,           -- UPLOAD_DIR 기준 상대경로
  thumb_path      VARCHAR(512)    NULL,               -- 이미지만
  checksum        CHAR(64)        NULL,               -- sha256 (중복 진단용)
  source          VARCHAR(24)     NOT NULL DEFAULT 'widget', -- widget|console|telegram|viber|hub|gmail
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_attach_uuid (uuid),
  KEY idx_attach_msg (message_id),
  KEY idx_attach_conv (conversation_id),
  KEY idx_attach_tenant_created (tenant_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- FK는 걸지 않는다(리포 관행: 리텐션 대량 삭제 성능 + 기존 테이블 무FK 관행 일치). 대신
  삭제 경로에서 **명시적으로 함께 지운다**(§7 부수영향 SI-5).
- `messages` 테이블은 **변경 없음.** 첨부만 있는 메시지는 `body = ''`로 저장한다.

## 4. API 계약

| 메서드 | 경로 | 인가 | 요청 | 응답 |
|---|---|---|---|---|
| POST | `/api/v1/files/upload` | `@Public` + 세션 토큰(위젯) | multipart `file`, `session_token` | `{ id, uuid, kind, filename, mime, size, width, height, url, thumbUrl }` |
| POST | `/api/v1/agent-console/conversations/:id/attachments` | `@Auth` + `CONVERSATION_HANDLE` | multipart `file` | 동일 |
| GET | `/api/v1/files/:uuid` | `@Public`(서명이 인가) | `?exp=&sig=&v=thumb\|full` | 파일 스트림 |
| POST | `/api/v1/chat/message` | 기존 | `+ attachment_ids?: string[]` | 기존 |
| POST | `/api/v1/agent-console/conversations/:id/message` | 기존 | `+ attachment_ids?: string[]` | 기존 |

응답 계약(`packages/types/src/api/widget.types.ts`) — 위젯과 콘솔이 같은 타입을 공유:

```ts
export interface ChatAttachmentResponse {
  id: string;
  kind: 'image' | 'file';
  filename: string;
  mime: string;
  size: number;
  width?: number | null;
  height?: number | null;
  /** 15분 만료 서명 URL. 응답마다 새로 발급된다. */
  url: string;
  /** 이미지에만 존재(320px webp). */
  thumbUrl?: string | null;
}
// ChatMessageResponse 에 attachments?: ChatAttachmentResponse[] 추가
```

**서명 URL**: `sig = HMAC-SHA256(FILE_URL_SECRET, `${uuid}|${variant}|${exp}`)`.
`crypto.util.ts`의 기존 HMAC 관행(`blindIndex`)을 따라 같은 파일에 `signFileUrl/verifyFileUrl` 추가.
검증 실패·만료는 **E5039**로 401. 서명은 파일 접근만 허가하며, 테넌트 소유권은 서명 발급
시점(목록 응답)에 이미 검증된다.

**저장 레이아웃**: `${UPLOAD_DIR}/{tenant_id}/{YYYYMM}/{uuid}.{ext}`, 썸네일은 `…/{uuid}_t.webp`.
`UPLOAD_DIR` 기본값 dev `./.uploads`, staging/prod `/data/uploads`.

## 5. 단계 계획

### S1 — 저장 코어 (백엔드, UI 없음)
- `sql/migration_message_attachments.sql`, `entity/message-attachment.entity.ts`
- `domain/attachment/` 모듈: `attachment.service.ts`(검증·매직바이트·재인코딩·썸네일·저장·삭제),
  `attachment.controller.ts`(업로드/스트리밍), `attachment.mapper.ts`(서명 URL 부착)
- `crypto.util.ts`: `signFileUrl` / `verifyFileUrl`
- `sharp` 의존성 추가(썸네일 + EXIF 제거). 실패 시 폴백: 썸네일 없이 원본 + `thumbUrl: null`
- 감사 기록 2종, 에러코드 E5035~E5041
- 청소 배치: 미귀속 24h 초과 + 고아 파일 (기존 `retention.service` 크론에 편승)
- 단위 테스트: 매직바이트 거부, 크기·개수 초과, 서명 위조/만료, 경로 탈출(`../`) 차단

### S2 — 콘솔 수신 표시 (요구의 핵심)
- `ChatMapper`/`agent.mapper`가 `attachments` 동봉 (N+1 방지: 대화 단위 일괄 조회)
- `LiveChatPage.tsx` 말풍선: 이미지 썸네일 그리드 / 파일 카드
- `AttachmentLightbox.tsx` 신규: 확대·좌우 이동·다운로드·ESC·포커스 트랩
- i18n `livechat.json` 키 추가(en/es/ko)

### S3 — 위젯 고객 업로드 + 위젯 표시
- `ChatTab.tsx` 컴포저에 📎 버튼·드래그앤드롭·진행률·대기 칩·개별 삭제
- `MessageBubble.tsx` 썸네일/파일 카드 + 탭 시 확대(위젯 내 경량 뷰어)
- 업로드 실패 토스트, 용량 초과는 **선택 즉시** 안내(서버 왕복 없이)
- `chat.service.handleUserMessage`: 본문이 비고 첨부만 있으면 **RAG·모더레이션 호출 없이** 저장
  → 상담원 알림만(§7 SI-2)

### S4 — 상담원 발신 첨부 (위젯 채널)
- 콘솔 컴포저 📎 + 대기 칩, `agent.service.sendMessage(..., attachmentIds)`
- 첨부만 있는 발신 허용(본문 공백 허용), 모더레이션은 **본문이 있을 때만** 호출
- 감사 메타에 첨부 수·바이트 합계(파일명·내용은 남기지 않음)

### S5 — 외부 메신저 (인바운드 → 아웃바운드)
- `NormalizedInbound.attachments?: InboundAttachmentRef[]` 추가(원격 URL 또는 provider file id)
- 어댑터별 정규화: **telegram**(photo 최대 해상도/document → `getFile`), **viber**(media URL),
  **amoeba hub**(미디어 필드), **gmail-imap**(MIME 파트)
- `messenger-ingest.service`가 원격 파일을 내려받아 `AttachmentService`로 저장
  (크기 상한·타임아웃·실패 시 텍스트 대체 `[첨부 수신 실패]`)
- 아웃바운드: 포트를 `send(ctx, thread, { text, attachments })`로 확장 +
  `readonly supportsAttachments: boolean`. 미지원 채널은 **서명 링크를 본문에 덧붙여 발송**
- `messenger-outbox.service.ts:69` 스킵 조건을 "본문도 첨부도 없을 때"로 수정

### S6 — 배포 준비 · 문서
- `docker/staging/docker-compose.staging.yml`의 `api`에 `ivy_uploads_staging:/data/uploads` 볼륨
- `env/backend/.env.*`에 `UPLOAD_DIR`, `FILE_URL_SECRET`, `ATTACHMENT_MAX_*`
- nginx는 이미 25MB — 변경 불필요(문서에 근거 기록)
- `TCR-260814-Chat-Attachments.md`, `RPT-260814-Chat-Attachments.md`, `CONFIG.md`/`SPEC.md` 갱신

**PR 분할**: S1 / S2+S3 / S4 / S5 / S6(문서) — 5개. S1은 스키마 변경 PR이므로 본문에
`## Migration` 섹션 필수.

## 6. 와이어프레임

### 6.1 콘솔 대화방 — 수신 이미지 썸네일 (SCR-LiveChat)

```
┌─ 대화 · Session a1b2c3 ────────────────────────────────────────┐
│                                                                │
│  ┌────────────────────────────────────┐                        │
│  │ 받은 상품이 이렇게 왔어요           │  14:02                 │
│  └────────────────────────────────────┘                        │
│  ┌───────────┬───────────┐                                     │
│  │ ▣ 썸네일1 │ ▣ 썸네일2 │  ← 클릭 → 라이트박스                 │
│  │  120x120  │  120x120  │     hover 시 확대 아이콘 ⤢          │
│  └───────────┴───────────┘  14:02                              │
│  ┌──────────────────────────────────┐                          │
│  │ 📄 영수증.pdf        1.2 MB   ⭳  │  ← 비이미지 = 파일 카드   │
│  └──────────────────────────────────┘  14:03                   │
│                                                                │
│                       ┌──────────────────────────────────────┐ │
│                       │ 확인했습니다. 교환 접수해 드릴게요.  │ │
│                       └──────────────────────────────────────┘ │
│                                                        14:05   │
├────────────────────────────────────────────────────────────────┤
│ [📎] [ 답장을 입력하세요…                           ] [ ➤ ]    │
│  ▲ 첨부 대기: [▣ label.png ✕] [📄 guide.pdf ✕]                 │
└────────────────────────────────────────────────────────────────┘
```

### 6.2 라이트박스 미리보기

```
┌────────────────────────────────────────────────────────────────┐
│  photo_2026-08-14.jpg · 2.4 MB · 3024x4032          [ ✕ ESC ] │
│                                                                │
│   ◀            ┌──────────────────────────┐            ▶       │
│  (이전)        │                          │          (다음)    │
│                │        원본 이미지        │                    │
│                │      (화면 맞춤 축소)     │                    │
│                └──────────────────────────┘                    │
│                                                                │
│                        2 / 3                                   │
│              [ 원본 열기 ]   [ ⭳ 다운로드 ]                     │
└────────────────────────────────────────────────────────────────┘
※ ◀ ▶ 는 이 대화 안의 이미지들만 순회. 파일(비이미지)은 목록에서 제외.
```

### 6.3 위젯 컴포저 — 고객 업로드

```
┌ 채팅 ─────────────────────────────┐
│  ┌──────────────────────────────┐ │
│  │ 안녕하세요, 무엇을 도와드릴… │ │
│  └──────────────────────────────┘ │
│           ┌────────────┐          │
│           │ ▣ 썸네일    │  (내 것) │
│           └────────────┘          │
├───────────────────────────────────┤
│  업로드 중  ▓▓▓▓▓▓░░░░  62%       │
│  [▣ IMG_0421.jpg ✕]               │
├───────────────────────────────────┤
│ [📎] [ 메시지 입력…        ] [ ➤ ]│
└───────────────────────────────────┘

거부 시(즉시, 서버 왕복 없음):
┌───────────────────────────────────┐
│ ⚠ 10MB 이하 이미지만 보낼 수 있어요│
└───────────────────────────────────┘
```

### 6.4 상태별 표시

| 상태 | 표시 |
|---|---|
| 업로드 중 | 진행률 바 + 취소 ✕ |
| 업로드 실패 | 칩이 빨간 테두리 + [다시 시도] |
| 이미지 로드 실패(만료/삭제) | 회색 플레이스홀더 + `이미지를 불러올 수 없습니다` |
| 첨부만 있는 메시지 | 말풍선 없이 썸네일/카드만, 시각은 그대로 |
| 목록 발췌 | `📎 이미지` / `📎 영수증.pdf` (FR-12) |

## 7. 부수영향 분석

| ID | 영향 지점 | 내용 | 대응 |
|---|---|---|---|
| SI-1 | `messenger-outbox.service.ts:69` | 본문 없는 첨부-only 메시지가 **외부 채널로 나가지 않음** | 스킵 조건 수정(S5) — 이 한 줄을 놓치면 상담원이 보낸 사진이 조용히 사라진다 |
| SI-2 | `chat.service.handleUserMessage` | 빈 본문으로 RAG 검색·의도분류가 돌면 무의미한 AI 답변 발생 | 첨부-only는 AI 파이프라인 우회, 상담원 알림만(S3) |
| SI-3 | 자동응답 / 방치 자동마무리 | 첨부-only 턴이 "고객 활동"으로 집계되지 않으면 대화가 방치로 오판됨 | `lastCustomerAt` 갱신은 첨부-only에도 적용 |
| SI-4 | 지식 캡처 · answer-reuse | 첨부-only 턴이 재사용 후보로 저장되면 텍스트 없는 쓰레기 항목 발생 | 본문 공백이면 후보 제외 |
| SI-5 | 리텐션·테넌트 삭제·DSAR | 파일 고아 + DSAR이 사진을 남김(**개인정보 사고**) | 세 경로에 첨부 삭제 훅 + 고아 청소 배치(S1) |
| SI-6 | 위젯 폴링 응답 크기 | 서명 URL이 매 응답 재발급 → payload 증가 | URL은 uuid+exp+sig만(짧음), 썸네일은 URL만 전달(바이너리 미포함) |
| SI-7 | 통계·질문 통계 | 첨부-only 메시지가 "질문"으로 집계 | 본문 공백 메시지는 질문 통계에서 제외 |
| SI-8 | 이슈 미리보기 / 세션 목록 발췌 | 본문이 비어 발췌가 공백으로 보임 | FR-12 표기(S2) |
| SI-9 | 백업 | 업로드 볼륨은 DB 백업에 포함되지 않음 | 운영 문서에 볼륨 백업 절차 추가(S6) |
| SI-10 | 이미지 재인코딩 | EXIF 제거를 위해 재인코딩하면 원본 바이트가 바뀜 | "원본"은 재인코딩본임을 문서화. 문서 파일은 무변경 저장 |
| SI-11 | Docker 이미지 | `sharp`(네이티브)가 alpine 빌드에서 실패할 수 있음 | prebuilt musl 바이너리 사용, 실패 시 썸네일 없이 동작하는 폴백 경로 유지 |

## 8. 에러코드 (신규 · 다음 빈 블록 E5035~)

| 코드 | 상수 | 의미 |
|---|---|---|
| E5035 | `ATTACHMENT_NOT_FOUND` | 첨부를 찾을 수 없음 |
| E5036 | `ATTACHMENT_TYPE_NOT_ALLOWED` | 허용되지 않은 파일 형식 |
| E5037 | `ATTACHMENT_TOO_LARGE` | 용량 상한 초과 |
| E5038 | `ATTACHMENT_LIMIT_EXCEEDED` | 메시지당 첨부 개수 초과 |
| E5039 | `ATTACHMENT_URL_INVALID` | 서명 불일치 또는 만료 |
| E5040 | `ATTACHMENT_STORAGE_FAILED` | 저장/읽기 실패 |
| E5041 | `ATTACHMENT_CHANNEL_UNSUPPORTED` | 해당 채널이 첨부 발신을 지원하지 않음(링크 폴백 후에도 실패 시) |

## 9. 테스트 (TCR로 상세화)

- 단위: 매직바이트 불일치 거부 / svg·zip 거부 / 10MB·20MB 경계 / 6번째 첨부 거부 /
  서명 위조·만료 401 / `../` 경로 탈출 차단 / 타 테넌트 uuid 접근 차단 /
  첨부-only 메시지의 AI 우회 / 아웃박스 스킵 조건 / 리텐션 삭제 시 파일 제거
- 통합: 위젯 업로드→전송→콘솔 표시→라이트박스, 콘솔 발신→위젯 표시,
  텔레그램 사진 수신→콘솔 표시, 미지원 채널 링크 폴백
- 엣지: 업로드 후 미전송(24h 청소), 대화 종료 후 업로드, 만료 URL 재발급,
  동일 파일 중복 업로드, 배포 재시작 후 파일 잔존(**볼륨 검증 — 이번 설계의 핵심 가정**)

## 10. 배포 순서 · 롤백

1. staging MySQL에 `sql/migration_message_attachments.sql` **선적용** (kit 04 §3)
2. `docker-compose.staging.yml` 볼륨 추가 → API 재배포
3. 부팅 로그 `Nest application successfully started` 확인, `GET /api/v1/files/<uuid>` **401**(=배포됨) 확인
4. 위젯·콘솔 순차 배포
5. 스모크: 사진 업로드 → 콘솔 썸네일 → 라이트박스 → 재배포 후에도 파일 유지

**롤백**: 코드 롤백만으로 안전(신규 테이블은 구코드가 참조하지 않음). 테이블·볼륨은 유지.

## 11. 리스크

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| `sharp` alpine 빌드 실패 | 중 | 썸네일 없음 | 폴백 경로 사전 구현(SI-11), S1에서 이미지 빌드까지 검증 |
| 볼륨 미설정 상태로 배포 | 중 | **재배포 시 첨부 전멸** | S6 배포 체크리스트 + 스모크 5번 항목(재배포 후 잔존) |
| 저장 용량 증가 | 중 | 디스크 압박 | 리텐션 동일 창 파기 + 사용량 로그, 임계 경고는 백로그 |
| 외부 채널 다운로드 실패 | 중 | 첨부 유실 | 실패 시 `[첨부 수신 실패]` 텍스트 저장 — 조용한 유실 금지 |
| 악성 파일 유통 | 낮 | 상담원 PC 감염 | 형식 제한 + `Content-Disposition: attachment` + 미실행. 스캐닝은 범위 밖(REQ §5 명시) |

## 12. 승인 요청

- **범위 확인**: S1~S6 전부 진행할지, 우선 **S1~S3(수신 표시)**만 먼저 배포하고 S4~S5를 후속으로 둘지
- **§6 와이어프레임** 확정
- **§5 기본값** 확정: 이미지 10MB / 파일 20MB / 메시지당 5개 / 서명 URL 15분 / 보존 365일
- 승인 전에는 구현에 착수하지 않음 (CLAUDE.md §7)
