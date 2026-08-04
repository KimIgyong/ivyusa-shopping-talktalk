# FIX-260804 — 미설정 AI 기능이 조용히 stub으로 도는 문제

- 관련: `docs/implementation/RPT-260804-Agent-Coaching-Chat.md` D-1 / D-2
- PR: [#102](https://github.com/KimIgyong/ivyusa-shopping-talktalk/pull/102) (`7c2a493`)
- 스테이징 배포: 2026-08-04 ✅

---

## 1. 증상

에이전트 코칭(PR #99) 배포 직후, 스테이징에서 코칭이 **정해진 문구만 답하고 변경 제안을 한 건도
만들지 못했다.** 다른 기능(고객 상담·RAG)은 정상이었다.

## 2. 근본 원인 (증상 아님)

세 겹이 겹친 문제다.

**① 해석 폴백의 종착점이 stub이다.**
`AiGatewayService.resolveEngine`은 `tenant_ai_settings` 행 → 테넌트 기본 엔진 → **플랫폼 기본 엔진**
순으로 떨어진다. 플랫폼 기본은 `Built-in Stub`(`is_default=1`)이다. 테넌트 1은 chat/rag/summary/
assist/moderation을 전부 Anthropic(엔진 2)으로 지정해 뒀지만 **`coach` 행이 없었고**, 따라서
"Anthropic을 쓰는 테넌트"임에도 코칭만 stub으로 떨어졌다.

**② 설정 화면이 그 사실을 보여줄 수 없었다.**
`AiSettingService.list()`가 **이미 존재하는 행만** 반환했다. `coach` 행이 없으니 AI 기능 목록에
coach가 아예 나타나지 않았고, 관리자는 문제를 볼 수도 고칠 수도 없었다.
→ **이게 진짜 결함이다.** ①은 설계된 폴백이지만, ②가 그것을 진단 불가능하게 만들었다.
그리고 이 조합은 coach 고유의 문제가 아니라 **"테넌트 프로비저닝 이후에 추가되는 모든 기능"**의 문제다.
행은 시드에서만 생기고, 시드는 기존 테넌트에 소급되지 않는다.

**③ 계획했던 경고 배너를 구현하지 않았다.**
PLN W2에 "stub 엔진일 때 경고 배너"가 있었으나 `CoachPanel.tsx`에 넣지 않았다. 있었다면 ①을
즉시 드러냈을 장치다.

## 3. 조치

| # | 변경 | 파일 |
|---|---|---|
| 1 | `list()`가 **모든 기능**을 반환 — 미설정 포함, 실제 서비스 중인 엔진과 출처(explicit/inherited/tenant_default/platform_default) 동반 | `ai-setting.service.ts`, `ai-engine.mapper.ts`, `ai-setting.controller.ts` |
| 2 | `coach`는 행이 없으면 **rag → chat 상속** (`FUNCTION_INHERITS`) | `ai-gateway.service.ts` |
| 3 | 시드가 `coach` 행을 만들지 않음 — 만들면 stub에 영구 고정(명시 행이 있으면 상속 중단) | `seed.runner.ts` |
| 4 | 코칭 패널 stub 경고 배너 — 설정된 엔진 **및 마지막 턴을 실제로 처리한 provider** 양쪽 확인 | `CoachPanel.tsx`, `coaching-message.entity.ts` |
| 5 | AI 기능 행에 상속/기본값 상태 표시 | `AiSettingsPage.tsx` + i18n ×3 |

배너가 **실제 provider까지 보는 이유**: 게이트웨이는 어댑터 오류 시 조용히 stub으로 강등한다
(`ai-gateway.service.ts` catch절). 즉 **잘못된 API 키는 정상 설정과 겉으로 구분되지 않는다.**
설정만 보면 "Anthropic"이라 표시되지만 실제 응답은 stub인 상태가 가능하다. 그래서 턴마다
`AiCompletionResult.provider`를 메시지 meta에 기록하고 UI가 둘을 대조한다.

## 4. 검증

- 신규 단위 테스트 8건 (상속, 명시 우선, disabled 엔진 건너뛰기, **다른 기능은 상속 안 함**, 엔진 전무)
- 전체 460 통과 (기존 452 무회귀)
- 로컬 실기동: `coach`가 행 없이 `inherited(from rag)`로 노출 → RAG를 Anthropic으로 변경 시
  coach가 자동으로 Anthropic으로 따라감, summary 등은 기존 동작 유지
- 스테이징: 배포 시 수동 삽입했던 `coach` 행을 **삭제**하고 배포 → 상속만으로 Anthropic 연결.
  마이그레이션·데이터 수정 없이 기존 테넌트가 커버됨을 실환경에서 확인.

## 5. 예방 패턴 (일반화)

> **폴백은 반드시 화면에 보여야 한다. 안 보이는 폴백은 기능이 아니라 함정이다.**

- 설정 목록 API가 "저장된 행"을 반환하면, **enum에 값을 추가하는 순간 그 값은 UI에서 사라진다.**
  목록은 **정의된 전체 집합**을 기준으로 만들고 미설정 항목을 합성해 넣어야 한다.
- 폴백 결과를 응답에 함께 실어라(`effective*` + `source`). "무엇이 설정됐나"와 "무엇이 실제로 도나"는
  다른 질문이고, 운영자가 필요한 건 후자다.
- **기본값이 "안전한 더미"인 시스템은 특히 위험하다.** 실패가 에러가 아니라 그럴듯한 정상 응답으로
  나타나므로 로그에도 안 남는다. 더미로 떨어졌다는 사실 자체를 신호로 만들어야 한다.
- 새 enum 값을 시드에 추가할 때는 **기존 레코드에 소급되지 않는다**는 점을 항상 계산에 넣을 것.
  소급이 필요하면 마이그레이션이고, 아니면 해석 단계에서 상속/기본값으로 흡수해야 한다.
- 런타임 강등(silent degradation)이 있는 경로에서는 **"무엇이 실제로 응답했는가"를 기록**하라.
  설정값만으로는 잘못된 자격증명과 정상 설정을 구분할 수 없다.
