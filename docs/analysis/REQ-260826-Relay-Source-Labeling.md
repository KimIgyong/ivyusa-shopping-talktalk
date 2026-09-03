# REQ-260826-Relay-Source-Labeling

btbz 릴레이로 들어온 메시지의 **출처 표기** — 가능한가, 무엇이 비어 있나

- 작성일: 2026-08-26
- 질문: messenger.amoeba.site에는 수신 메신저 출처 정보가 있는데, 우리 콘솔에도 표기 가능한가?
- 근거: 릴레이 API 실호출(대화 165건 표본) + 스테이징 DB 실측 + 코드

## 0. 답 — 가능하고, **이미 절반은 만들어져 있습니다**

파이프라인·저장소·화면이 전부 존재합니다. 비어 있는 것은 **어댑터의 매핑 표 한 개**입니다.

```
릴레이 API(channel_type) → [매핑] → channel_threads.sub_channel
                                  → conversations.channel / sessions.channel
                                  → 콘솔 ChannelBadge (색상·라벨·필터까지 구현됨)
```

매핑 표가 **2개만** 알고 있습니다.

```ts
// btbz-relay.adapter.ts
const SUB_CHANNEL = { relay_kakao_pc: 'kakao', relay_sms: 'sms' };
//  ↑ 나머지는 전부 'relay'로 떨어짐
```

## 1. 릴레이가 실제로 주는 값 (2026-08-26 실호출, 대화 165건)

| channel_type | 건수 | 현재 우리 표기 |
|---|---:|---|
| `relay_kakao_pc` | 63 | kakao ✅ |
| `relay_sms` | 54 | sms ✅ |
| `relay_zalo` | 18 | **relay** ❌ |
| `relay_line` | 9 | **relay** ❌ |
| `relay_wechat` | 9 | **relay** ❌ |
| `relay_viber` | 6 | **relay** ❌ |
| `relay_telegram` | 3 | **relay** ❌ |
| `relay_whatsapp` | 3 | **relay** ❌ |

**표본의 29%(48/165)가 출처를 잃고 있습니다.**

스테이징 저장분도 같은 비율입니다 — `channel_threads.sub_channel`: kakao 44 · sms 36 ·
**relay 32**. 그 32건의 상대방 이름이 무엇인지 보면 손실이 분명합니다.

```
Rakuten Viber          → relay   (실제 viber)
이광훈, LINA497명       → relay   (실제 line)
WeChat 사용자           → relay   (실제 wechat)
```

## 2. 콘솔은 이미 준비돼 있습니다

`ChannelBadge`는 **telegram·viber·zalo·line·whatsapp·kakao·sms·email** 색상과 6개 언어
라벨을 이미 갖고 있고, 채널 필터에도 들어 있습니다. 값이 도착하지 않을 뿐입니다.

빠진 것은 **wechat 하나**(색상·라벨·필터 미등록).

## 3. 갭

| # | 갭 | 위치 |
|---|---|---|
| G-1 | `channel_type` 매핑이 2종뿐 | `btbz-relay.adapter.ts` `SUB_CHANNEL` |
| G-2 | KSR provider 경로의 `subChannelFromOrigin`도 kakao/sms/line만 인식 | 같은 파일 |
| G-3 | 콘솔에 `wechat` 미등록(색상·라벨·필터) | `ChannelBadge.tsx`, 로케일 6종 |
| G-4 | **이미 `relay`로 저장된 32건은 과거 그대로** — 매핑은 수신 시점에만 적용됨 | 데이터 |
| G-5 | 모르는 `channel_type`이 또 생기면 다시 조용히 `relay`가 됨 | 설계 |

## 4. 제안

### 4.1 매핑 (G-1/G-2)

`relay_` 접두사를 떼고 남는 값을 그대로 쓰되, **알려진 집합에 있을 때만** 채택합니다.
목록에 없으면 `relay`로 두고 **경고 로그를 남깁니다**(G-5) — 지금은 새 메신저가 늘어도
아무도 모릅니다. 이것이 접두사 제거만 하는 것보다 나은 이유는, 라벨·색상이 없는 값이
화면에 그대로 새어 나가면 badge가 영문 원문(`relay_kakaostory`)으로 보이기 때문입니다.

### 4.2 백필 (G-4)

기존 32건은 릴레이 API에서 `channel_type`을 다시 읽어 채울 수 있습니다
(`external_thread_id`가 릴레이의 대화 id라 1:1 조회 가능). 대상은 세 곳입니다.

```
channel_threads.sub_channel  →  conversations.channel  →  sessions.channel
```

**권장: 백필합니다.** 안 하면 과거 대화가 영구적으로 출처 미상으로 남고, 통계(채널별 유입)도
그만큼 틀립니다. 되돌릴 수 있도록 변경 전 값을 로그로 남깁니다.

### 4.3 (선택) 기기 출처

릴레이는 `device_label`·`device_uid`·`own_msisdn`·`is_unofficial`도 함께 줍니다. "어느 단말로
받았는지"까지 표기할 수 있지만, 상담원이 답장할 때 필요한 정보는 아니라 **이번 범위에서
제외**하고 필요해지면 별건으로 다룹니다.

## 5. 확인 필요

| # | 내용 |
|---|---|
| Q-1 | 4.1 + 4.2(백필 포함)로 진행할지 |
| Q-2 | `wechat` 한국어 라벨 — "위챗"으로 통일해도 되는지 |
| Q-3 | SMS처럼 **수신 전용**으로 다뤄야 할 채널이 더 있는지(현재 `reply_enabled`를 릴레이가 알려주므로 자동 반영되지만, 표기 정책은 별개) |

## 6. side-impact

- 스키마 변경 **없음**(`sub_channel varchar(16)` — 가장 긴 값 `telegram` 8자)
- 위젯·모바일 무영향(콘솔 표기 문제)
- 채널 필터는 값이 늘어나는 것뿐 — 기존 필터 동작 무변화
- 통계/리포트의 `channel` 축은 백필 후 과거 수치가 바뀝니다(더 정확해지는 방향)
- AI 세션의 `channel` 값도 함께 정확해짐 — 채널 인지 응답(FN-047)이 실제 메신저를 알게 됨
