# RPT — 오프아워 이메일 회신 + 운영시간 설정화 (2026-08-06)

> REQ `docs/analysis/REQ-260806-OffHours-Email-Reply.md` ·
> PLN `docs/plan/PLN-260806-OffHours-Email-Reply.md` (승인: D1 권장안 / D3 제안 / 테스트 수신 dev@amoeba.group) ·
> TCR `docs/test/TCR-260806-OffHours-Email-Reply.md`

## 1. 무엇이 바뀌었나

1. **휴게시간 지원** — `handoff_config.businessHours.breaks[]` 추가. 근무시간 안이어도 휴게 구간이면
   오프아워로 라우팅(점심 12–13시 뉴욕). 형식 오류·빈 값은 무시(근무시간을 닫지 않음).
2. **테넌트 설정 메뉴로 이동** — 상담 연결(업무시간·요일·휴게·오프아워 메일함·안내문구) 편집을
   `/settings`로 이동, `/ai-setting`에는 이동 안내 카드만 유지(편집기 하나, 값 어긋남 없음).
3. **오프아워 이메일 회신 파이프라인**
   - 오프아워 핸드오프 시 `conversations.reply_channel='email'` 기록.
   - 고객 이메일이 없으면 응답에 `needsContactEmail` 플래그 → 위젯이 **인라인 이메일 입력 카드** 노출,
     안내 문구도 "회신받으실 이메일을 남겨주세요"로 전환.
   - `POST /chat/contact-email` — 동의(GRANTED) 필수, 기존 lead 경로 재사용(삭제요청 억제 + 암호화 저장),
     세션에 고객 바인딩 + 세션 캐시 무효화.
   - 상담사가 콘솔에서 답변하면 **모더레이션 통과한 답변 본문을 고객 이메일로 발송**하고,
     대화에 "이메일로 발송됨" 시스템 메시지를 남김. 고객이 위젯에서 다시 쓰면 채널 해제.
4. **MailerService** — SMTP 발송을 인프라 서비스로 분리(기존 에스컬레이션 알림도 이를 사용).
   미설정·실패 시 조용히 false(상담 흐름 불간섭).

## 2. 변경 파일

| 영역 | 파일 |
|---|---|
| api | `infrastructure/external/mailer.service.ts`(신규), `infrastructure/infrastructure.module.ts`, `domain/ai-engine/{entity/tenant-ai-config.entity.ts, handoff-router.service.ts(+spec)}`, `domain/chat/{chat.service.ts, chat.controller.ts, chat.module.ts, scenario.service.ts, entity/conversation.entity.ts, dto/request/chat.request.ts, +2 spec}`, `domain/customer/customer.service.ts`, `domain/agent/{agent.service.ts(+spec), agent-alert.service.ts}` |
| widget | `components/chat/{ContactEmailCard.tsx(신규), ChatTab.tsx}`, `hooks/useChat.ts`, `services/chatService.ts`, `i18n/locales/{en,es,ko}.ts` |
| web | `domain/settings/SettingsPage.tsx`, `domain/ai-settings/{AiSettingsPage.tsx, HandoffSection.tsx, ai-settings.service.ts}`, `i18n/locales/{en,es,ko}/aiSetting.json` |
| types | `packages/types/src/api/widget.types.ts` (`ChatTurnResponse.needsContactEmail`) |
| sql | `sql/migration_conv_reply_channel.sql`(신규), `sql/01-schema.sql` |

## 3. 테스트 결과

- 신규 8케이스 포함 apps/api **53 suites / 546 tests PASS**.
- `npm run typecheck` / `npm run build` 통과, API 실부팅 확인(신규 컬럼 — dev-kit A-1).

## 4. 배포 상태

| 항목 | 값 |
|---|---|
| PR | #117 `8bc072c` (기능) + #119 `c6b555e` (검증 중 발견 결함 수정) |
| 마이그레이션 | `sql/migration_conv_reply_channel.sql` — 배포 전 스테이징 선적용 필요 |
| 사전 적용(코드 무관) | 테넌트 1 `handoff_config`(09–18 NY, 월–금, help@ivyusa.com), 스테이징 SMTP env |
| 스테이징 배포 | **완료** (2026-08-06, 마이그레이션 선적용 후 배포·부팅·health OK) |

## 5. 스테이징 검증 기록 (2026-08-06)

실측 방법: 테넌트 오프아워 메일함을 승인된 테스트 주소(dev@amoeba.group)로 임시 변경하고
현재 뉴욕 시각을 덮는 휴게 구간을 설정 → 위젯 API로 실제 대화 생성 → 종료 후 설정 원복.

| 시나리오 | 결과 |
|---|---|
| S1 오프아워(휴게 중) 문의, 주소 미보유 | **PASS** — `needsContactEmail=true`, 안내 "회신받으실 이메일을 남겨주시면…" |
| S2 이메일 저장 | **PASS** — 확인 메시지, 고객 생성·세션 바인딩, `conversations.reply_channel='email'` |
| S6 휴게시간 라우팅 | **PASS** — 업무시간(09–18) 내부이지만 휴게 구간이라 오프아워 경로로 처리 |
| SMTP 실전송 | **PASS** — 스테이징 컨테이너에서 Gmail 250 OK (`dev@amoeba.group` 수신) |
| S4 채널 해제 규칙 | **결함 발견 → 수정 후 PASS** (아래) |
| S3 상담사 답변 이메일 | **미검증** — 콘솔 로그인 필요. 대화 #93이 `reply_channel='email'` + 고객 이메일 보유 상태로 대기 중이라 콘솔에서 답변하면 즉시 확인 가능 |
| S7 콘솔 설정 화면 | 코드·빌드 검증 완료, 화면 실조작 미실시 |

### 5-1. 검증에서 발견·수정한 결함 (PR #119 `c6b555e`)

`reply_channel`을 **모든 고객 메시지에서 해제**하고 있었다. "고객이 위젯으로 돌아오면 실시간 응대로
복귀" 규칙을 무조건 적용한 탓에, 오프아워에 몇 분 뒤 보낸 후속 질문 하나로 **방금 약속한 이메일 회신이
조용히 취소**됐다(상담사가 나중에 답해도 메일이 나가지 않음). 해제 조건을 "현재 라우팅이 상담사 근무
중일 때"로 좁혔고, 재검증에서 대화 #93은 오프아워 후속 질문 뒤에도 `email` 채널을 유지했다.

**예방 패턴**: "사용자가 돌아왔다"는 판단을 사용자 행동만으로 내리지 말 것 — 돌아온 시점에 **서비스가
응대 가능한 상태인지**까지 함께 봐야 한다. 상태 전이 조건은 양쪽(사용자 신호 + 시스템 가용성)을 모두
검사한다.
