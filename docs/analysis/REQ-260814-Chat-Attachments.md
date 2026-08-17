# REQ-260814-Chat-Attachments

라이브챗 대화방의 **첨부 이미지 썸네일 · 미리보기** 요구사항 분석.

- 작성일: 2026-08-14
- 원 요구: "https://shoptalk.amoeba.site/live-chat 대화방에 전송받은 이미지파일 썸네일 및 미리보기 기능 필요"
- 착수 시 확정된 범위(사용자 확인 2026-08-14):
  - 전송 방향 = **양방향**(고객→상담원, 상담원→고객)
  - 채널 = **위젯 + 외부 메신저 인바운드**
  - 저장 = **API 컨테이너 영속 볼륨 + 서명 URL**
  - 파일 종류 = **이미지 + PDF 등 일반 파일**

## 1. AS-IS

### 1.1 결론부터 — 첨부는 "표시"가 아니라 **파이프라인 전체가 없다**

요구는 "썸네일/미리보기"지만, 현재 시스템에는 이미지가 대화방으로 **들어올 경로 자체가 없다.**

| 축 | 현황 | 근거 |
|---|---|---|
| 메시지 저장 | `messages`는 `body: text` 단일 본문. **첨부 컬럼·테이블 없음** | `apps/api/src/domain/chat/entity/message.entity.ts:26` |
| 콘솔 렌더 | 말풍선이 `{m.body}` 문자열만 출력 | `apps/web/src/domain/live-chat/LiveChatPage.tsx:528` |
| 위젯 입력 | 텍스트 `<input>` 하나. 첨부 버튼·파일 선택 없음 | `apps/widget/src/components/chat/ChatTab.tsx:472` |
| 위젯 전송 API | `POST /chat/message { session_token, message }` — 문자열만 | `chat.controller.ts:38` |
| 상담원 전송 | `sendMessage(convId, agentId, tenantId, body.body)` — 문자열만 | `agent-console.controller.ts:239` |
| 외부 메신저 수신 | `NormalizedInbound`에 `text`만 있고 미디어 필드 없음. 텔레그램 **photo는 캡션 없으면 드롭** | `adapter/messenger-adapter.ts:10`, `telegram.adapter.spec.ts:64` |
| 외부 메신저 발신 | `send(ctx, thread, text: string)` — 어댑터 포트가 텍스트 전용 | `adapter/messenger-adapter.ts` |
| 아웃박스 | `if (!message.body?.trim()) continue` — **본문 없는(첨부만) 메시지는 발신에서 스킵** | `messenger-outbox.service.ts:69` |

### 1.2 파일 업로드 선례와 그 한계

| 축 | 현황 | 근거 |
|---|---|---|
| 유일한 업로드 | KB 상품 CSV 임포트 (`FileInterceptor` + **메모리 스토리지**) | `knowledge.controller.ts:267` |
| 그 코드의 주석 | *"Memory storage on purpose … container disk does not survive a redeploy. The raw file is not retained"* | 동상 |
| 정적 파일 서빙 | `ServeStaticModule`/`express.static` **사용처 없음** | 전역 grep |
| 컨테이너 볼륨 | staging `api` 서비스에 볼륨 **없음**(mysql/redis/rabbitmq/qdrant만 보유) | `docker/staging/docker-compose.staging.yml` |
| 업로드 상한 | nginx `client_max_body_size 25m` | `docker/staging/nginx.conf:11` |
| 이미지 처리 라이브러리 | `sharp` 등 **미설치** | `package.json` |
| KB 첨부 테이블 | `kb_files(filename, mime, storage_path, size)` 스키마는 있으나 **채팅과 무관, 실제 저장 경로 운영 안 함** | `knowledge/entity/kb-file.entity.ts` |

> 즉 "파일을 어디에 두는가"가 이 요구의 실제 난제다. 지금 구조로 파일을 컨테이너 디스크에
> 쓰면 **다음 배포에서 전부 사라진다.**

### 1.3 삭제·보존 경로 (첨부가 붙으면 같이 손봐야 하는 곳)

| 축 | 현황 | 근거 |
|---|---|---|
| 보존기간 파기 | `messageRepo.delete({ createdAt < cutoff })` — 행만 지움 | `privacy/retention.service.ts:89` |
| 테넌트 삭제 | `getRepository(Message).delete({ tenantId })` | `privacy/privacy.service.ts:226` |
| DSAR 삭제 | 해당 고객 대화의 `messages.body`를 `REDACTED`로 치환 | `privacy/privacy.service.ts:557` |

세 경로 모두 **디스크 파일을 모른다.** 첨부를 도입하면 파일 고아(orphan)가 남고, DSAR은 본문만
가리고 사진은 그대로 남는 **개인정보 사고**가 된다.

### 1.4 지금 운영에서 벌어지는 일

고객이 사진을 보낼 방법이 없으니, 파손·오배송·색상 문의는 전부 **말로 설명**해야 한다.
외부 메신저(텔레그램 등)로 고객이 사진을 보내면 어댑터가 그것을 **조용히 버리고**, 상담원에게는
아무 메시지도 보이지 않는다 — 고객은 보냈다고 믿고 상담원은 못 봤으니 문의가 꼬인다.

## 2. TO-BE

| ID | 요구 | 우선순위 |
|---|---|---|
| FR-1 | **고객 첨부 전송** — 위젯 대화창에서 이미지/파일 첨부(다중 선택, 진행률, 실패 재시도) | P0 |
| FR-2 | **콘솔 썸네일** — 라이브챗 대화방에서 이미지는 썸네일 말풍선, 그 외 파일은 파일 카드(아이콘·파일명·크기) | P0 |
| FR-3 | **콘솔 미리보기** — 썸네일 클릭 시 라이트박스(확대, 대화 내 이미지 좌우 이동, 원본 열기/다운로드) | P0 |
| FR-4 | **상담원 첨부 전송** — 콘솔 컴포저에서 첨부하여 고객에게 발신(위젯 채널) | P0 |
| FR-5 | **위젯에서도 표시** — 상담원이 보낸 첨부 및 자기가 보낸 첨부를 위젯 말풍선에 썸네일/파일 카드로 | P0 |
| FR-6 | **외부 메신저 인바운드 수집** — 텔레그램 photo/document, 바이버 picture/file, 아메바톡 허브 미디어, Gmail 첨부를 내려받아 대화방 첨부로 저장 | P0 |
| FR-7 | **외부 메신저 아웃바운드** — 첨부 전송을 지원하는 채널은 파일로, 미지원 채널은 **서명 링크 텍스트로 폴백**(전송 실패로 처리하지 않음) | P1 |
| FR-8 | **서명 URL 스트리밍** — 파일은 만료 있는 서명 URL로만 접근. 테넌트·대화 소유권 검증. 콘솔은 로그인 사용자, 위젯은 세션 토큰 소유 대화의 첨부만 | P0 |
| FR-9 | **업로드 검증** — 확장자·MIME 허용목록, 매직바이트 대조, 용량/개수 상한, `svg` 금지 | P0 |
| FR-10 | **보존·삭제 연동** — 리텐션 파기, 테넌트 삭제, DSAR 삭제 시 **DB 행 + 디스크 파일 + 썸네일**까지 제거 | P0 |
| FR-11 | **감사·피드백** — 업로드/다운로드 감사 기록, 업로드 성공·실패 토스트(dev-kit §4.3), i18n(en/es/ko) | P0 |
| FR-12 | **목록 미리보기 문구** — 세션 목록·이슈 카드의 발췌에 첨부만 있는 메시지는 `📎 이미지` 등으로 표기 | P1 |

## 3. 갭 분석

| ID | 갭 | 해소 방향 |
|---|---|---|
| G1 | 첨부를 담을 스키마 없음 | `message_attachments` 신설(1 메시지 : N 첨부) → **마이그레이션 필요** |
| G2 | 파일을 둘 곳이 없음(컨테이너 디스크는 배포 시 소멸) | staging/prod compose의 `api` 서비스에 **named volume**(`/data/uploads`) 추가 + `UPLOAD_DIR` env |
| G3 | 파일 서빙 경로·인증 수단 없음 | `GET /api/v1/files/:uuid?exp&sig` HMAC 서명 스트리밍 라우트(`@Public`, 서명 자체가 인가) |
| G4 | 썸네일 생성 수단 없음 | `sharp` 도입(320px webp, EXIF 제거 겸용). alpine prebuilt 사용 — 실패 시 **원본 CSS 축소 폴백** |
| G5 | 전송 계약이 텍스트 전용(위젯·콘솔·어댑터 3곳) | 본문과 **분리된 업로드 선행 방식**: 먼저 업로드 → `attachment_ids[]`를 메시지 전송에 동봉 |
| G6 | 어댑터 포트가 `send(ctx, thread, text)` | 포트를 `send(ctx, thread, payload {text, attachments})`로 확장 + `supportsAttachments` 능력 플래그 |
| G7 | 아웃박스가 본문 없는 메시지를 스킵 | 조건을 "본문도 첨부도 없으면 스킵"으로 수정(§1.1 근거 라인) |
| G8 | 인바운드 정규화에 미디어 없음 | `NormalizedInbound.attachments[]`(원격 URL/파일 id + 다운로드 힌트) 추가, 수집은 서비스 계층에서 |
| G9 | 첨부만 있는 고객 메시지 → AI 파이프라인 | 본문이 비면 **RAG/모더레이션 호출 없이** 저장만 하고 상담원 알림. AI가 빈 문자열로 검색하는 일 방지 |
| G10 | 모더레이션은 텍스트 전용 | 이미지 내용 검사는 **범위 밖**임을 정책으로 명시. 대신 타입/크기/매직바이트 + 상담원 신고(백로그) |
| G11 | 리텐션·DSAR·테넌트 삭제가 파일을 모름 | 세 경로에 첨부 삭제 훅 추가 + **고아 파일 청소 배치**(DB에 없는 파일 제거) |
| G12 | 저장 용량이 무한히 증가 | 테넌트별 총량 상한(설정값) + 리텐션 창과 동일 파기. 용량은 관리자 통계로 노출(백로그) |
| G13 | EXIF GPS 등 촬영 메타에 개인정보 | 이미지 재인코딩 시 메타데이터 제거(원본 보관은 재인코딩본으로 대체) |
| G14 | nginx 25MB 상한 | 파일 상한을 그 아래로(이미지 10MB / 일반 20MB) 두고 **클라이언트에서 먼저 거절** |

## 4. 사용자 흐름 (TO-BE)

```
[고객·위젯] 대화창 📎 클릭 → 사진 2장 선택
        → 즉시 업로드(진행률) → 썸네일 칩으로 컴포저에 대기
        → 전송 → 내 말풍선에 썸네일 2장 → 상담원에게 전달

[고객·텔레그램] 사진 전송
        → 어댑터가 file_id 정규화 → 서비스가 내려받아 저장
        → 콘솔 대화방에 썸네일로 등장 (지금은 조용히 사라지던 케이스)

[상담원·콘솔] 라이브챗 대화방 → 고객 썸네일 클릭
        → 라이트박스: 확대 / ← → 로 대화 내 다른 이미지 / [원본] [다운로드] / ESC 닫기
        → 답장에 교환 라벨 이미지 첨부 → 전송
        → 위젯 채널이면 그대로, 텔레그램이면 사진으로, 미지원 채널이면 서명 링크 텍스트로

[운영] 보존기간 경과 → 메시지·첨부 행 + 디스크 파일·썸네일 동시 파기
[운영] DSAR 삭제 요청 → 본문 REDACTED + 첨부 파일 실제 삭제
```

## 5. 제약 · 정책

| 항목 | 결정 |
|---|---|
| 용량 상한 | 이미지 10MB / 일반 파일 20MB, **메시지당 5개** (nginx 25MB 아래) |
| 허용 이미지 | `jpeg, png, gif, webp` — **`svg` 금지**(스크립트 실행 벡터), `heic`는 1단계 거부 + 안내(alpine sharp에 HEIF 디코더 미포함) |
| 허용 문서 | `pdf, txt, csv, docx, xlsx` — **압축파일(zip 등) 1단계 제외** |
| 검증 | 확장자 + Content-Type + **매직바이트** 3중 대조, 불일치 시 거부 |
| 서빙 | `Content-Disposition: attachment` 기본(이미지 미리보기만 inline), `X-Content-Type-Options: nosniff`, 응답 Content-Type은 **저장 시 판정한 값**만 사용 |
| 서명 URL | HMAC-SHA256, 기본 만료 15분. 콘솔·위젯은 목록 응답을 받을 때마다 갱신된 URL을 받음 |
| 악성코드 검사 | **하지 않음**(1단계 범위 밖). 서버는 파일을 실행하지 않고, 다운로드는 원본 그대로 전달됨을 문서화 |
| 이미지 내용 모더레이션 | **범위 밖.** `ModerationService`는 텍스트 전용이며 첨부는 통과 — 정책 문서에 명시 |
| 보존 | 대화 로그와 **동일 창**(`CONVERSATION_LOG_RETENTION_DAYS`, 기본 365일) |
| 감사 | 업로드(`chat.attachment_uploaded`)·다운로드(`chat.attachment_downloaded`) 기록, **파일명은 남기되 내용·PII는 로그 금지** |
| 백업 | 업로드 볼륨은 DB 백업 대상에 포함되지 않음 → 운영 문서에 백업 절차 추가 필요 |

## 6. 확인 필요 (PLN에서 기본값으로 진행, 이견 시 조정)

| ID | 질문 | 기본값 |
|---|---|---|
| Q1 | 상담원 첨부 발신을 랭크/역량으로 제한할지 | 기존 `CONVERSATION_HANDLE` 역량과 동일(별도 제한 없음) |
| Q2 | 테넌트별 저장 총량 상한 | 1단계는 상한 없이 사용량만 집계, 임계 경고는 백로그 |
| Q3 | 위젯 첨부 기능의 테넌트별 on/off | 위젯 설정에 토글 추가(기본 on) |
| Q4 | 프로덕션 저장소 | 프로덕션 배포 시 동일 볼륨 방식 유지, 오브젝트 스토리지 전환은 별도 판단 |

## 7. 관련 문서

- `docs/plan/PLN-260814-Chat-Attachments.md` (본 REQ의 실행 계획)
- `docs/analysis/REQ-260810-Multi-Messenger-Integration.md` (어댑터 포트 설계 원본)
- `docs/analysis/REQ-Privacy-Control-Gap-20260731.md` (리텐션·DSAR 경로)
