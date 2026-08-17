# FIX-260817-Relay-DataUri-Images

릴레이(카카오) 이미지가 대화방에 **base64 텍스트로** 들어오던 결함.

- 작성일: 2026-08-17
- 신고: "https://shoptalk.amoeba.site/live-chat — `data:image/jpeg;base64,/9j/4AAQSkZJRg` 아직
  대화창엔 이미지 썸네일/미리보기 구현 안 됨" (사용자, 2026-08-17)
- 보충: "messenger.amoeba.site에서는 파일 썸네일/미리보기 다 구현됨. 이 서버에서 중계된 메시지 내 이미지 구현"

## 1. 증상

`/live-chat` 대화방에서 고객이 보낸 사진이 이미지가 아니라 **50KB짜리 base64 문자열**로 표시된다.
첨부 파이프라인(PLN-260814)과 HEIC 지원(PLN-260817)을 배포한 뒤에도 그대로였다.

## 2. 근본 원인 — 첨부가 아니라 **본문**으로 들어오고 있었다

릴레이는 이미지를 URL로 주지 않는다. **본문 자체가 data URI**다.

실물 payload (스테이징 자격증명으로 `messenger.amoeba.site` 직접 조회, 2026-08-17):

```json
{
  "id": "707",
  "source_type": "kakao_pc",
  "origin": "kakao_android_notification",
  "direction": "inbound",
  "sender_name": "김**",
  "body": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHY…  [69,451 chars]",
  "body_type": "photo",
  "occurred_at": "2026-07-23T15:40:12.791Z"
}
```
> 발신자명은 실제 고객 정보라 마스킹했다(CLAUDE.md §2 PII).

42개 대화 전수 집계: **`body_type` = `text` 3,355건 / `photo` 494건**, photo는 **전부**
`data:image/jpeg;base64,…`. 텍스트로 위장된 data URI는 0건.

그런데 `btbz-relay.adapter.ts`는 **첨부 처리가 아예 없었다**:

```ts
const text = (msg.body ?? '').trim();   // ← data URI가 그대로 텍스트가 된다
if (!text) continue;
```

`RelayMessage` 인터페이스에 `body_type?: string`이 **선언은 되어 있었지만 어디서도 읽지 않았다.**
그 결과 photo 턴이 `messages.body`에 base64로 저장되고, 콘솔은 그것을 말풍선 텍스트로 렌더한다.

> 인접 어댑터(아메바톡 허브)는 미디어를 `/^https?:\/\//` 링크로 가정하고 있었다 —
> RPT-260814 §8 **R-2**("허브 미디어 payload 실물 확인, 추론 상태")가 경고하던 그 추론이
> 릴레이에서 실제로 빗나갔다. 이번에 실물로 확인해 R-2도 함께 해소한다.

### 영향 범위 (스테이징 실측)

| 항목 | 값 |
|---|---|
| 영향 메시지 | **856건** (tenant 2 / kakao) |
| 기간 | 2026-08-12 ~ 2026-08-17 (릴레이 연결 이후 전 기간) |
| 본문 크기 | 건당 12KB~56KB |
| 부수 피해 | 대화 목록·상세 API가 메시지당 최대 50KB를 매번 전송 |

## 3. 수정

### 3.1 신규 유입 (`data-uri.util.ts` + 릴레이 어댑터 2경로)

`splitRelayBody()`가 본문을 (텍스트, 첨부)로 분리한다. 디코드된 바이트를
`InboundAttachmentRef.data`로 실어 보내면 **기존 인바운드 경로가 그대로** 저장·썸네일·EXIF
제거·서명 URL까지 처리한다(코드 추가 없음).

**판정은 라벨이 아니라 페이로드로 한다.** `body_type`을 믿고 분기하면 잘못 라벨링된 한 건이
다시 base64 벽을 만든다 — 첨부 모듈이 브라우저 Content-Type을 다루는 방식과 같은 이유다.
그래서 `body_type` 파라미터는 아예 받지 않는다.

레거시 pull(`/api/inbox/conversations/*/messages`)과 서명 pull(`/api/provider/v1/messages`)
**두 경로 모두** 적용했다. 서명 모드는 아직 tenant 3만 쓰지만, 한쪽만 고치면 채널이
서명 모드로 넘어가는 순간 결함이 되살아난다.

### 3.2 기존 856건 (`migrate-data-uri-attachments.ts`)

각 행을 실제 업로드와 같은 경로(`AttachmentService.store` → `attachToMessage`)로 변환하고
본문을 비운다. 멱등(재실행 시 남은 것만 처리), `--dry-run`/`--limit=N` 지원.
디코드 실패 행은 **본문을 남긴다** — 증거를 잃는 것이 base64 벽보다 나쁘다.

## 4. 검증

| | |
|---|---|
| 단위 | `data-uri.util.spec.ts` **10건** (base64/퍼센트 인코딩 디코드, 오형식 무예외, photo→첨부, 오라벨 구제, 텍스트 무변경, 링크형 media는 텍스트 유지, 빈 본문, 비이미지 명명) |
| 회귀 | messenger 스위트 **165건** 통과 |
| typecheck/build | 13/13 |
| 스테이징 | §5 |

## 5. 배포 · 백필 결과

*(배포 후 기록)*

## 6. 예방 패턴

- **인터페이스에 선언만 되고 아무도 읽지 않는 필드는 결함의 예고다.** `body_type`은 처음부터
  타입에 있었다 — 값이 무엇인지 확인하지 않은 채 "본문은 텍스트"라고 가정한 것이 원인이다.
- **인접 어댑터의 가정을 복사하지 말고 실물 payload를 확인하라.** 허브가 URL을 준다는
  (미확인) 가정이 릴레이 어댑터의 설계에 그대로 상속됐고, 릴레이는 data URI를 준다.
  RPT-260814 R-2가 "추론 상태"라고 적어둔 항목이 정확히 그 자리에서 터졌다.
- **표시 계층을 의심하기 전에 저장된 값을 봐라.** "썸네일이 안 보인다"의 원인이 렌더러가
  아니라 `messages.body`에 들어앉은 50KB였다. 한 줄 SQL이 렌더 코드 정독보다 빨랐다.
