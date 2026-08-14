# RPT-260814-Chat-Attachments

대화방 첨부(이미지 썸네일·미리보기·파일) 구현 보고.

- 작성일: 2026-08-14
- 원 요구: "https://shoptalk.amoeba.site/live-chat 대화방에 전송받은 이미지파일 썸네일 및 미리보기 기능 필요"
- 계획: `docs/plan/PLN-260814-Chat-Attachments.md` (승인 2026-08-14) · 분석: `docs/analysis/REQ-260814-Chat-Attachments.md`
- 테스트: `docs/test/TCR-260814-Chat-Attachments.md`

## 1. 무엇이 실제 문제였나

요구는 "썸네일/미리보기"였지만, 착수 시점에 이미지가 대화방으로 **들어올 경로가 없었다.**
`messages`는 본문 컬럼 하나뿐이었고, 위젯에 첨부 버튼이 없었으며, 외부 메신저 어댑터는
미디어를 **조용히 버렸다** — 고객은 사진을 보냈다고 믿고, 상담원 화면에는 아무것도 뜨지
않는 상태가 운영 중이었다. 그래서 표시 계층이 아니라 업로드·저장·배포·삭제 전 구간을
만들었다.

## 2. 구현 범위 (사용자 확정 2026-08-14)

양방향(고객↔상담원) · 위젯+외부 메신저 인바운드 · API 컨테이너 영속 볼륨+서명 URL ·
이미지+일반 파일. 6단계 전부 구현.

| 단계 | 결과 |
|---|---|
| S1 저장 코어 | ✅ |
| S2 콘솔 표시(썸네일·라이트박스) | ✅ |
| S3 위젯 업로드·표시 | ✅ |
| S4 상담원 발신 | ✅ |
| S5 외부 채널 인·아웃바운드 | ✅ |
| S6 배포 준비·문서 | ✅ (배포 자체는 미실행) |

## 3. 설계 요약

- **업로드 선행**: 파일을 먼저 `POST /files/upload` 로 올려 uuid를 받고, 기존 전송 API에
  `attachment_ids`만 추가한다. 위젯·콘솔·어댑터 세 경로의 계약을 갈아엎지 않았다.
- **서명이 곧 인가**: 다운로드 라우트는 `@Public`. 소유권은 링크를 **발급할 때** 이미
  확인되므로, 라우트는 위조·수정·만료만 증명하면 된다. 콘솔 15분 / 외부 메신저 7일.
- **타입 3중 검증**: 확장자 + Content-Type + 매직바이트. `svg`는 우리 오리진에서 스크립트를
  실행시킬 수 있어 제외, 압축파일은 1단계 제외.
- **첨부-only 턴은 AI 우회**: 빈 문자열로 RAG·의도분류를 돌리는 것은 아무것도 답하지 못하는
  모델 호출이다. 대신 세션 언어의 시스템 확인 문구를 돌려준다.
- **삭제는 파일까지**: 리텐션·테넌트 삭제·DSAR 세 경로 모두에서 행과 디스크 파일을 함께
  지운다. 본문만 REDACTED 하고 사진을 남기는 것이 이 기능의 가장 큰 사고 시나리오였다.

## 4. 변경 파일

### 백엔드 (신규)
- `sql/migration_message_attachments.sql`
- `apps/api/src/domain/attachment/` — `entity/message-attachment.entity.ts`, `attachment.service.ts`,
  `attachment.controller.ts`, `attachment.mapper.ts`, `attachment.module.ts`, `file-type.util.ts`
  (+ `attachment.service.spec.ts`, `file-type.util.spec.ts`)
- `apps/api/src/global/util/file-url.spec.ts`
- `apps/api/src/domain/chat/chat.service.attachments.spec.ts`
- `apps/api/src/domain/agent/agent.service.attachments.spec.ts`
- `apps/api/src/domain/messenger/adapter/telegram.attachments.spec.ts`
- `apps/api/src/domain/messenger/outbox-attachments.spec.ts`

### 백엔드 (수정)
- `global/util/crypto.util.ts` — `signFileUrl`/`verifyFileUrl`
- `global/constant/error-code.constant.ts` — E5035~E5041
- `global/interceptor/cache-control.interceptor.ts` — 서명 다운로드만 `private, max-age=600`
- `domain/chat/` — `chat.service.ts`(첨부 클레임·첨부-only 분기), `chat.controller.ts`,
  `chat.mapper.ts`, `dto/request/chat.request.ts`, `chat.module.ts`
- `domain/agent/` — `agent.service.ts`(모더레이션/중복억제/메일 안내), `agent-console.controller.ts`
  (업로드 엔드포인트), `agent.mapper.ts`, `dto/request/agent.request.ts`, `agent.module.ts`
- `domain/messenger/` — `adapter/messenger-adapter.ts`(포트 확장), `telegram.adapter.ts`,
  `viber.adapter.ts`, `amoeba-talk-hub.adapter.ts`, `gmail-imap.adapter.ts`,
  `messenger-ingest.service.ts`, `messenger-outbox.service.ts`, `messenger.module.ts`
- `domain/privacy/` — `retention.service.ts`, `privacy.service.ts`, `privacy.module.ts`
- `app.module.ts`, `apps/api/package.json`(sharp)

### 프론트엔드
- 콘솔: `live-chat/MessageAttachments.tsx`, `live-chat/AttachmentLightbox.tsx`,
  `live-chat/useAgentUpload.ts` (신규) / `LiveChatPage.tsx`, `live-chat.service.ts`,
  `live-chat.hooks.ts`, `lib/api-client.ts`, `i18n/locales/{en,es,ko}/livechat.json`
- 위젯: `components/chat/MessageAttachments.tsx`, `hooks/useAttachmentUpload.ts` (신규) /
  `ChatTab.tsx`, `MessageBubble.tsx`, `hooks/useChat.ts`, `services/chatService.ts`,
  `lib/api-client.ts`, `lib/types.ts`, `i18n/locales/{en,es,ko}.ts`
- 공용: `packages/types/src/api/widget.types.ts` (`ChatAttachmentResponse`)

### 배포/문서
- `docker/staging/docker-compose.staging.yml` — `ivy_uploads_staging:/data/uploads`
- `env/backend/.env.development`, `CONFIG.md`, `.gitignore`

## 5. 계획 대비 변경점

| 항목 | PLN | 실제 | 이유 |
|---|---|---|---|
| `message_attachments.session_id` | 없음 | 추가 | 위젯은 대화 생성 전에 업로드한다. 세션 스코프가 있어야 "남의 attachment_id 재생" 클레임을 막을 수 있다 |
| PR 분할 | 5개 | **1개(#287, 5커밋)** | 단일 브랜치 순차 구현이라 스택 PR로 쪼개는 비용이 이득보다 컸다. 단계별 커밋은 그대로 보존 |
| 외부 링크 TTL | 15분(일괄) | 외부 메신저만 7일 | 카카오톡 메시지를 몇 시간 뒤 여는 고객에게 15분 링크는 죽은 링크다 |
| 이메일 첨부 | 링크 | Gmail은 실제 파일 첨부 | nodemailer가 URL을 받아 바이트를 실어 보낼 수 있어, 만료 문제 자체가 사라진다 |

## 6. 테스트 결과

- **API 유닛 1,198건 통과** (신규 41건). 실패 0.
- 모노레포 `typecheck` / `build` 통과.
- 로컬 실부팅 확인: `Nest application successfully started`.
- 로컬 통합(실제 HTTP) 9건 통과 — 업로드→전송→위젯/콘솔 노출, 서명 위조·무서명 **401**,
  svg 및 `.png`로 위장한 svg **400(E5036)**, PDF는 `attachment` 처분,
  타 세션 attachment_id 클레임 시 **아무것도 붙지 않음**.

## 7. 배포 상태

| 항목 | 상태 |
|---|---|
| PR | **#287** (`feature/chat-attachments` → `main`) |
| 커밋 | `61a6b7a`(S1) · `9f5f814`(S2+S3) · `38301d4`(S4) · `c9aa079`(S5) · `ab3e650`(S6) |
| 머지 | ❌ 미머지 |
| 마이그레이션(staging) | ❌ 미적용 — `sql/migration_message_attachments.sql` |
| 배포(staging) | ❌ 미배포 |
| 프로덕션 | ❌ (프로덕션 환경 자체가 미구축) |

### 배포 순서 (kit 04 §3)
1. staging MySQL에 `sql/migration_message_attachments.sql` **선적용**
2. staging `.env.staging`에 `UPLOAD_DIR=/data/uploads` (필요 시 `FILE_URL_SECRET`)
3. API 재배포 → 부팅 로그 확인 → `GET /api/v1/files/<uuid>`가 **401**인지 확인
4. web/widget 배포
5. TCR §3 스모크, 특히 **S-10(재배포 후에도 첨부가 살아 있는가)** — 볼륨 가정을 검증하는 항목

## 8. 잔여 과제

| ID | 내용 |
|---|---|
| R-1 | 스테이징 배포 + 수동 스모크 15건 |
| R-2 | 아메바톡 허브 미디어 payload 실물 확인(현재 `content_type` 기반 추론) |
| R-3 | 텔레그램·Gmail 실계정 첨부 E2E |
| R-4 | 업로드 볼륨 백업 절차(운영 문서) — DB 백업에 포함되지 않는다 |
| R-5 | 테넌트별 저장 용량 집계·임계 경고(백로그) |
| R-6 | HEIC(아이폰) 수용 — alpine sharp에 HEIF 디코더가 없어 현재는 거부 |

## 9. 예방 패턴 (일반화)

- **"본문이 비면 보낼 게 없다"는 가정은 첨부가 생기는 순간 결함이 된다.** 아웃박스의
  `if (!body) continue` 한 줄이 상담원의 사진을 조용히 삼킬 뻔했다. 메시지에 새 축을
  추가할 때는 "본문 유무"로 분기하는 모든 지점을 먼저 찾아야 한다.
- **삭제 경로는 새 저장소를 자동으로 배우지 않는다.** 리텐션·테넌트 삭제·DSAR은 각각
  독립적으로 첨부를 몰랐고, 셋 다 손대지 않으면 "본문은 지워졌는데 사진은 남는" 상태가 된다.
- **파일 저장 위치는 배포 모델의 문제다.** 컨테이너 디스크는 배포마다 초기화된다 —
  볼륨 없이 배포하면 기능은 정상 동작하는 것처럼 보이다가 다음 배포에서 전부 사라진다.
