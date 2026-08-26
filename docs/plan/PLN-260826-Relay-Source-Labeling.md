# PLN-260826-Relay-Source-Labeling

REQ-260826(릴레이 출처 표기) 실행 계획

- 작성일: 2026-08-26
- 선행: [REQ-260826-Relay-Source-Labeling](../analysis/REQ-260826-Relay-Source-Labeling.md)
- 승인: 매핑 확장 + **백필 포함**, `wechat` 한국어 라벨 = **위챗** (2026-08-26)
- 제외(합의): 기기 출처(`device_label`·`own_msisdn`) 표기

## 1. 단계

### W1 — 어댑터 매핑 (G-1/G-2)

| 파일 | 변경 |
|---|---|
| `messenger/adapter/btbz-relay.adapter.ts` | `SUB_CHANNEL` 8종으로 확장 · 모르는 값은 `relay` 유지 + **경고 1회 로그** · `subChannelFromOrigin`도 같은 목록 사용 |

```ts
const RELAY_SUB_CHANNELS = new Set([
  'kakao', 'sms', 'line', 'zalo', 'wechat', 'viber', 'telegram', 'whatsapp',
]);
// relay_kakao_pc → kakao, relay_sms → sms, relay_zalo → zalo …
```

접두사만 떼지 않고 **알려진 집합과 대조**합니다. 목록에 없는 값을 그대로 통과시키면 라벨도
색상도 없는 원문(`relay_kakaostory`)이 뱃지에 노출됩니다.

**모르는 값은 경고를 남깁니다.** 지금은 릴레이에 채널이 늘어도 조용히 `relay`가 될 뿐이라
아무도 모릅니다 — REQ G-5.

### W2 — 콘솔 `wechat` 등록 (G-3)

| 파일 | 변경 |
|---|---|
| `live-chat/ChannelBadge.tsx` | `CHANNEL_FILTERS`에 `wechat`, `TONE`에 색상 1줄 |
| `i18n/locales/*/livechat.json` | `channel.wechat` 6개 언어 (ko=위챗) |

### W3 — 백필 (G-4)

`apps/api/src/database/backfill-relay-subchannel.ts` 신규.

```
channel_threads(sub_channel='relay')  ─┐
   릴레이 API로 external_thread_id 조회 │→ sub_channel 갱신
   channel_type → sub_channel          ─┘→ conversations.channel
                                        → sessions.channel
```

- 대상: `sub_channel = 'relay'`인 스레드만. 이미 정확한 행은 건드리지 않습니다
- `--dry-run` 기본 제공, 변경 전 값을 로그로 남겨 되돌릴 수 있게 합니다
- 릴레이가 그 대화를 더 이상 모르면 **건너뜁니다**(추측해서 채우지 않음)
- 기존 백필 스크립트와 같은 형태: AppModule을 띄우지 않고 DataSource만 사용
  (부팅하면 두 번째 릴레이 폴러·아웃박스 워커가 같이 뜹니다)

## 2. 와이어프레임 — 변화는 뱃지 값뿐

```
현재                                    이후
┌──────────────────────────────┐        ┌──────────────────────────────┐
│ Rakuten Viber       [relay]  │        │ Rakuten Viber       [바이버] │
│ 이광훈, LINA497명    [relay]  │   →    │ 이광훈, LINA497명    [라인]   │
│ WeChat 사용자        [relay]  │        │ WeChat 사용자        [위챗]   │
│ 김익용              [카카오톡]│        │ 김익용              [카카오톡]│
└──────────────────────────────┘        └──────────────────────────────┘

채널 필터: 전체 · 위젯 · 텔레그램 · 바이버 · 잘로 · 라인 · 와츠앱 · 카카오톡 · SMS · 이메일
                                                              + 위챗
```

레이아웃·컴포넌트 변경 없음 — 값이 도착하고 필터 항목이 하나 늘어납니다.

## 3. side-impact

- 스키마 변경 없음(`sub_channel varchar(16)`, 최장 `telegram` 8자)
- 위젯·모바일·임베드 무영향
- **백필 후 채널별 통계의 과거 수치가 바뀝니다** — 더 정확해지는 방향이며, 리포트를 비교
  중이라면 시점을 알아야 하므로 RPT에 실행 시각을 남깁니다
- 세션의 `channel` 값도 정확해져 채널 인지 응답(FN-047)이 실제 메신저를 알게 됩니다
- SMS 수신 전용 처리(`RECEIVE_ONLY_CHANNELS`)는 무변화 — `reply_enabled`는 릴레이가 알려주며
  이 작업과 무관

## 4. 검증

| # | 시나리오 | 기대 |
|---|---|---|
| R1 | 8종 `channel_type` 매핑 | 각각 kakao/sms/line/zalo/wechat/viber/telegram/whatsapp |
| R2 | 모르는 `channel_type` | `relay` 유지 + 경고 로그 |
| R3 | `channel_type` 없음 | `relay` 유지(기존과 동일) |
| R4 | 백필 dry-run | 변경 대상 건수만 출력, 쓰기 없음 |
| R5 | 백필 실행 | 32건의 thread·conversation·session이 함께 갱신 |
| R6 | 백필 재실행 | 대상 0건(멱등) |
| R7 | 스테이징 콘솔 | 뱃지가 바이버·라인·위챗으로 표시, 필터 동작 |
| R8 | 6개 언어 | `i18n:check` 통과 |
