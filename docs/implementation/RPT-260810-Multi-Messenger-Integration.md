# RPT-260810-Multi-Messenger-Integration

외부 메신저 연동 **PR-M1~M5 전체 구현 완료 보고 — 스테이징 배포 완료 (2026-08-10)**.

- 근거: `REQ-260810` · `PLN-260810` (Rev.3) · `TCR-260810`
- 범위: 코어 프레임 + 텔레그램·바이버(직접) + 아메바톡 허브 + btbz KSR 릴레이 + 지메일(IMAP) + 콘솔(대화 뱃지·필터, 설정 카드)
- **계획된 5개 PR 전부 구현·배포 완료**. 남은 것은 실계정 스모크뿐(§5).

## 1. 배포 상태

| PR | 내용 | 커밋 | 스테이징 | 프로덕션 |
|---|---|---|---|---|
| [#216](https://github.com/KimIgyong/ivyusa-shopping-talktalk/pull/216) | PR-M1 코어 + 텔레그램/바이버 | `c8d9855` | ✅ 2026-08-10 07:09 UTC | — (호스트 미구축) |
| [#217](https://github.com/KimIgyong/ivyusa-shopping-talktalk/pull/217) | PR-M2 아메바톡 허브 + 폴링 드라이버 | `e53b349` | ✅ 2026-08-10 07:26 UTC | — |
| [#218](https://github.com/KimIgyong/ivyusa-shopping-talktalk/pull/218) | PR-M3 btbz 릴레이 + 비동기 발신 확인 | `9775aec` | ✅ 2026-08-10 07:26 UTC | — |
| [#220](https://github.com/KimIgyong/ivyusa-shopping-talktalk/pull/220) | PR-M4 지메일 IMAP + 콘솔 채널 뱃지·필터 | `9fc89be` | ✅ 2026-08-10 08:40 UTC | — |
| [#221](https://github.com/KimIgyong/ivyusa-shopping-talktalk/pull/221) | PR-M5 설정 채널 카드 UI | `b64e46c` | ✅ 2026-08-10 08:48 UTC | — |

**Migration**: `sql/migration_messenger_channels.sql` (신규 4테이블)
→ 스테이징 **코드 배포 전 선적용 완료**(`ivy_mysql_staging`, 4테이블·스키마 검증).
**M2~M5는 스키마 변경 없음.** 프로덕션은 호스트 미구축 상태라 미적용.
의존성 추가: `imapflow`(PR-M4, 지연 임포트 — 없어도 API는 부팅).

**배포 검증**(exit code만 믿지 않음): 부팅 로그 `Nest application successfully started` ·
`Messenger outbox worker enabled — every 5s` · `Messenger sync enabled — every 15s` ·
컨테이너 `Up 41 seconds (healthy)` · 신규 라우트 HTTPS **401**(=배포됨) · `/health` ok.

## 2. 무엇을 만들었나

```
apps/api/src/domain/messenger/
├── entity/            messenger-channel · channel-thread · channel-message-map · channel-outbox
├── adapter/           messenger-adapter(포트) · adapter.registry
│                      telegram · viber (webhook형) / amoeba-talk-hub · btbz-relay (폴링형)
├── messenger-ingest.service.ts     공통 인입 파이프라인
├── messenger-outbox.service.ts     큐잉·발송·백오프·비동기 확인
├── messenger-outbox.worker.ts      5s 틱
├── messenger-sync.service.ts       15s 폴링 드라이버
├── messenger.service.ts            채널 CRUD·자격증명·연결테스트·webhook 등록
├── messenger.controller.ts         콘솔 API (INTEGRATION_CREDENTIALS_MANAGE + 감사)
└── messenger-webhook.controller.ts 공개 수신 엔드포인트

apps/api/src/domain/messenger/adapter/  gmail-imap · mail-text.util          (M4)
apps/api/src/domain/agent/              listSessions 채널 필터 · 응답에 channel (M4)
apps/web/src/domain/live-chat/          ChannelBadge · 필터 · 수신전용 입력창 차단 (M4)
apps/web/src/domain/settings/           messenger.service/hooks ·
                                        MessengerChannelCard/Modal · 그룹 2종     (M5)
```
그 외: `sql/migration_messenger_channels.sql`, 에러코드 `E5023~E5027`,
`packages/types` 메신저 enum/필드 스펙, `app.module.ts` 등록.

**핵심 설계 3가지**
1. **어댑터 포트 하나로 4채널** — 정규화 스키마와 인입 파이프라인이 어댑터 바깥에 있어, 허브 경유 채널을
   나중에 직접 어댑터로 바꿔도 파이프라인·데이터·콘솔이 그대로다.
2. **chat/agent 코드 무수정** — 아웃박스가 스레드 커서를 앞으로 훑어 새 메시지를 집어가므로,
   AI 답변이든 상담원 답장이든 채널의 존재를 몰라도 원 채널로 나간다.
3. **증명할 수 있는 것만 보고** — 릴레이처럼 전달 ACK가 없는 경로는 `unconfirmed`로 남기고
   에이전트가 확인해줄 때만 `sent`로 승격한다(만료 명령은 실패로 간주).

## 3. 검증 결과

- 단위 **906 passed / 85 suites**(신규 88) · typecheck 9/9 · 실제 부팅 4회 · **웹 빌드** 확인
- 로컬 E2E: webhook 200 → 스레드/세션/대화 → 동의 안내(KO) + 사용자 턴 + **AI 답변(KB 인용)** →
  아웃박스 큐잉(고객 발화 제외) → 발송 실패 시 백오프·`last_error` 기록. 잘못된 토큰/서명 각각 401.
- 상세: `TCR-260810-Multi-Messenger-Integration.md`

## 4. 구현 중 드러난 사실 (다음 판단에 필요한 것)

- **아메바톡은 옴니채널 플랫폼**(실측 188 엔드포인트): 잘로·라인·와츠앱·지메일이 이미 연결·심사 통과 상태.
  직접 구현했다면 Meta 비즈니스 인증·LINE 공식계정·Zalo OA·Google CASA 4건을 떠안았을 일.
- **양쪽 허브 모두 outbound webhook이 없다** → 폴링. 지연 해소는 허브 측 webhook 신설이 정답(사내 자산).
- **타임존 없는 타임스탬프**(양쪽 허브 공통)를 파싱해 비교하면 활성 대화를 조용히 건너뛴다 →
  문자열 정확 비교로 해결(TCR §3 D-01). 같은 함정이 다른 폴링 연동에도 적용된다.
- **KSR은 개별 고객 커스텀**(멀티테넌트 아님, 본인 단말·본인 설치·본인이 개시/중단) →
  채널 1개 = 릴레이 계정 1개 = 테넌트 1개 고정 매핑, 원격 대리 운용 기능은 범위 밖.

## 5. 잔여 작업

| 구분 | 항목 | 차단 요인 |
|---|---|---|
| 스모크 | E-01~E-04 실계정 왕복(텔레그램·바이버·아메바톡·릴레이 SMS) | 봇 토큰/계정 |
| 스모크 | E-05 릴레이 카카오톡 | KSR PC 캡처 스파이크(Q-02) |
| 스모크 | 지메일 업무용 메일함 왕복 | 앱 비밀번호(Workspace 정책이 막으면 D-2 재검토 — PLN R-5) |
| 스모크 | **콘솔 UI 육안 확인**(설정 카드 그룹 2종, 대화 리스트 뱃지·필터) | 콘솔 로그인 — 사용자 확인 필요 |
| 운영 | 릴레이 대상 채널의 아메바톡 AI 에이전트 pause 규약 | 계정 확보 시 |

### 5.1 M4/M5에서 추가로 잡은 결함
- **quoted-printable 디코딩이 latin1로 나가 UTF-8이 깨짐**(`Café`→`CafÃ©`, 한글 모지바케). 바이트로 모아
  한 번에 디코딩하도록 수정(PR-M4, 회귀 테스트 포함). 메일 본문 전 구간에 영향이 갈 수 있던 버그.
