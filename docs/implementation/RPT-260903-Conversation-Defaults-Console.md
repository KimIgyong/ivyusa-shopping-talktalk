# RPT-260903 — 기본 대화내용·시나리오 버튼 설정 화면

REQ `REQ-260903-Conversation-Defaults-Console.md` · PLN `PLN-260903-Conversation-Defaults-Console.md` ·
TCR `TCR-260903-Conversation-Defaults-Console.md`

| | |
|---|---|
| PR | **#462** (squash) |
| main 커밋 | **17e819e** |
| 스키마 변경 | **없음** — 기존 JSON 컬럼 재사용, 마이그레이션 0건 |
| 스테이징 | **배포 완료** 2026-09-03 (api·web·widget 재빌드, boot·health·라우트 401 확인) |
| 프로덕션 | 미배포(환경 미구축) |

### 변경 파일

| 파일 | 변경 |
|---|---|
| `apps/api/src/domain/chat/scenario-scripts.ts` | **신설** — 스크립트 7종 + 버튼→스크립트 매핑 + 후속칩 id 허용목록 |
| `apps/api/src/domain/chat/scenario.service.ts` | 스크립트 표 분리, 고객 발화 override 반영, 잘못된 칩 id 필터 |
| `apps/api/src/domain/ai-engine/ai-config.service.ts` | `getDefaults()`, 저장 키 정규화, 기본값 동일분 제거, 레거시 키 회복 |
| `apps/api/src/domain/ai-engine/ai-config.{controller,mapper}.ts` | `GET /ai-config/defaults` + 응답 매퍼 |
| `apps/api/src/domain/ai-engine/entity/tenant-ai-config.entity.ts` | `ScenarioOverride.utterance` 추가 |
| `apps/web/.../ScenarioReplyEditor.tsx` | 기본값 표시·되돌리기·수정 표시·칩 id 목록 |
| `apps/web/.../ScriptLibrarySection.tsx` · `AgentEffectiveSection.tsx` | **신설** 2개 섹션 |
| `apps/web/.../AiSettingsPage.tsx` · `settings/SettingsPage.tsx` | 스크립트 배지, 섹션 배치, 위젯 문구 기본값 노출 |
| `packages/types/src/common/widget-copy.ts` | **신설** — 위젯 인사말 기본값(위젯·콘솔 공용 단일 출처) |
| `apps/widget/.../ChatTab.tsx` + 로케일 6종 | 공용 기본값 사용, 중복 i18n 키 제거 |
| 스펙 1종 + i18n 6개 언어 | 신규 케이스 6건, 키 3묶음 |

## 1. 요구와 결과

요구는 "기본 대화내용과 기본 시나리오 버튼을 **보고 고칠 수 있게** 하라"였다. 조사해 보니 보이지 않는
것이 문제의 절반이었고, **나머지 절반은 고쳐도 반영되지 않는 것**이었다.

## 2. 발견하고 고친 결함 2건 (실행으로 확인)

콘솔은 3개 액션을 "대사 편집 가능"으로 표시했지만 실제 반영되는 것은 1개였다.

| 액션 | 콘솔 저장 키 | 런타임 조회 키 | 상태 |
|---|---|---|---|
| `cancel_refund` | `cancel_refund` | `cancel_refund` | 정상 |
| **`delivery_status`** | `delivery_status` | **`shipping_policy`** | 저장·성공 토스트 후 **한 번도 발화되지 않음** |
| **`product_help`** | `product_help` | — (스크립트 없음) | 죽은 설정 |

확인은 추정이 아니라 실행으로 했다 — `ScenarioService.handle()`에 실제 호출을 걸어 조회 키를 찍었고
(`['shipping_policy']`), `isScenarioAction('delivery_status')`·`('product_help')`가 모두 **false**였다.

**고친 방식**: 양쪽이 각자 절반씩 알고 있던 것이 원인이므로, 버튼↔스크립트 매핑표를 **한 모듈**에 두고
런타임·설정 서비스가 같은 표를 읽게 했다. 기존 저장분은 마이그레이션 없이 읽기 시 회복한다.

## 3. 설계 판단

- **기본값은 서버가 내려준다**(`GET /ai-config/defaults`). 콘솔이 상수를 복제하면 배포 시점부터 어긋나고,
  그 어긋남은 화면에 드러나지 않는다.
- **기본 원문을 입력칸의 값으로 채운다.** 대신 저장 시 기본과 같은 텍스트는 override로 남기지 않는다 —
  안 그러면 [저장]만 눌러도 오늘의 기본값이 테넌트 행에 굳어, 이후 기본 문구를 고쳐도 이 테넌트만 옛
  문구에 남는다.
- **위젯 인사 문구는 예외로 입력칸 아래에 표시**한다. 값으로 채우면 폼이 즉시 dirty가 되어 위와 같은
  고착이 일어난다. 보이게 하는 목적은 같고 저장 의미는 건드리지 않는다.
- **고객 발화도 편집 대상에 넣었다.** 기존 코드는 "고객의 말은 우리 것"이라며 고정했지만, 호텔 테넌트의
  대화에 "배송은 얼마나 걸리나요?"가 고객 발화로 찍히는 것을 테넌트만 고칠 수 있다.
- **후속 칩 id를 검증한다.** 자유 입력 id는 렌더는 되지만 탭하면 실패한다. 쓰기와 읽기 양쪽에서 걸러
  이미 저장된 것도 노출되지 않게 했다.
- 파일명은 PascalCase 유지 — CLAUDE.md §2가 React 컴포넌트를 PascalCase로 정하고 있고 같은 디렉터리의
  24개 형제가 모두 그렇다(리뷰 지적 중 유일하게 반영하지 않은 항목, 근거는 PR #462 코멘트에 기록).

## 4. 검증

**로컬** — 179 suites / **1,798 tests PASS** · typecheck 9/9 · build 6/6 · i18n 5개 언어 complete.

**스테이징 E2E (핵심 증거)**

| 확인 | 결과 |
|---|---|
| `/ai-config/defaults` | 스크립트 7종·버튼 6종·매핑·위젯 인사말 6언어. 후속칩 전용 5종도 포함 |
| 배송 버튼 대사 저장 | 키가 **`shipping_policy`** 로 정규화 |
| 미리보기 세션 → `POST /chat/scenario` | 응답이 **편집한 문구 그대로** — 이전에는 반영 자체가 불가능했던 경로 |
| 원상복구 | override 0건 |
| 배포 | boot 로그·healthy·신규 라우트 401(=배포됨) |

## 5. 배포 시 주의 (실측)

배포 전 조회 결과 **tenant 3(amoebaorder)** 에만 override가 있었다:
`["affiliate", "product_help", "delivery_status"]`.

- `delivery_status`(후속 칩 1개 + `open_orders` 이동)는 **이번 배포부터 실제로 적용된다.** 설정해 두고
  반영되지 않던 값이 뒤늦게 살아나는 것이라 의도에 부합한다.
- 그 칩의 id는 자유 입력(`주문확인`)이라 그대로 살아나면 탭 시 실패한다 → 읽기 필터가 걸러낸다.
- `product_help`·`affiliate`는 스크립트가 없어 조회되지 않는다(무해). 다음 저장 시 정리된다.

## 6. 남은 것 / 비목표

- **S3(버튼 라벨 다국어화)** 는 별도 승인 대상으로 남겨 두었다. `label: string`이라 저장 순간 6개 언어가
  한 문자열로 굳는다 — 위젯·API 계약 변경이라 위험도가 다르다.
- **에이전트별 대사 분리**는 범위 밖(REQ §5). 노출 버튼·페르소나·인사말이 이미 에이전트별로 갈라져 있어
  대사까지 쪼개면 설정 축이 하나 더 늘어난다. 대신 "이 에이전트에 적용되는 값"을 보여주는 것으로 풀었다.
- go2joy처럼 업종이 다른 테넌트의 **기본 버튼 세트 교체**(배송·주문·제휴 → 업종별)는 이제 화면에서
  가능해졌지만, 실제 정리는 테넌트 운영 판단이다(`RPT-260829-Go2Joy-Video-KB-Utilization` P3).
