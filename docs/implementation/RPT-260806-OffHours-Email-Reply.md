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
| PR | #(작성 예정) `feat/offhours-email-reply` → main, squash |
| 마이그레이션 | `sql/migration_conv_reply_channel.sql` — 배포 전 스테이징 선적용 필요 |
| 사전 적용(코드 무관) | 테넌트 1 `handoff_config`(09–18 NY, 월–금, help@ivyusa.com), 스테이징 SMTP env |
| 스테이징 배포 | 예정 |

## 5. 스테이징 검증 기록

(배포 후 추기 — S1~S8, 실메일은 dev@amoeba.group 로만)
