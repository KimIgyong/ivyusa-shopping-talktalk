# RPT-260813 — 코칭 W4-D: AI 설정 개정 이력

- 계획: `docs/plan/PLN-260804-Agent-Coaching-Chat.md` **W4-D**
- 선행: W4-A/B 골든 회귀 검증 (PR #268/#269, 배포 완료)
- 범위: persona·응답규칙·시나리오 편집의 **버전 이력과 복원**. 사용자 지시로 A/B와 분리한 별도 PR.

---

## 1. 왜 필요했나

지식 문서는 개정 이력과 복원 엔드포인트를 갖고 있었지만, **persona는 제자리 덮어쓰기였다.**
3개월 뒤 "이 문장 왜 넣었지?"에 답할 수 없고 되돌릴 대상도 없었다 — REQ §2.5에서 지적한
기존 결함이자 W1 설계 당시 "G4"로 기록해 둔 갭이다.

## 2. 어디에 걸었나 — `upsertConfig` 한 곳

설정을 쓰는 경로는 셋이다: 설정 폼 수동 저장, 코칭 제안 승인, 제안 되돌리기.
셋 다 `AiConfigService.upsertConfig`를 지난다. **그래서 각 호출부가 아니라 이 한 곳에서 기록한다** —
나중에 추가되는 경로도 자동으로 이력을 남기지, 조용히 빠지지 않는다.

## 3. 설계 결정

**① 복원은 쓰지 않는다 — 편집기에 불러오기만 한다.**
`[편집기로 불러오기]`는 과거 버전을 persona/응답규칙 입력창에 채우고 멈춘다. 사람이 확인하고
저장을 눌러야 반영된다. Zendesk·Intercom이 쓰는 restore-as-draft 패턴이고, 3개월 전 버전이
검토 없이 프로덕션에 꽂히는 일을 막는다.

**② 첫 기록 시 베이스라인 행을 함께 쓴다.** 이력이 없는 상태의 첫 변경은 **되돌릴 대상이 없다.**
그래서 변경 전 상태를 revision 1로 먼저 남긴다(`KbRevisionService`와 동일한 처리).

**③ 이력 실패가 저장을 막지 않는다.** 이력을 남기는 시점엔 설정 저장이 이미 끝나 있다.
여기서 예외를 던지면 **성공한 저장을 실패로 보고**하게 된다. 서비스가 자체적으로 삼키고 경고만 남긴다.

**④ 무변경 저장은 기록하지 않는다.** 폼을 열고 저장만 누른 것이 이력을 채우면 실제 변경을 찾기 어려워진다.

**⑤ 왜 바꿨는지가 스냅샷보다 중요하다.** 수동 저장은 `note`를 받고, **코칭 경유는 제안의 `rationale`이
자동으로 버전 노트가 된다** — 코칭으로 바꾼 설정이 익명의 덮어쓰기로 남지 않는다.

**⑥ 순번은 max+1.** count+1은 행 하나만 지워도 번호를 재사용한다(코드 컨벤션 §2).

## 4. 변경 파일

| 파일 | 내용 |
|---|---|
| `entity/tenant-ai-config-revision.entity.ts` | 스냅샷(persona·rules·scenarioOverrides) + kind·changedFields·note·proposalId·actor |
| `ai-config-revision.service.ts` | record(베이스라인·무변경 스킵·실패 삼킴) / list / get / max+1 채번 |
| `ai-config.service.ts` | `upsertConfig(tenantId, input, meta?)` — 전후 스냅샷 비교해 기록 |
| `ai-config.controller.ts` | `GET /ai-config/revisions`, `GET /ai-config/revisions/:id`, PUT에 actor·note 전달 |
| `ai-config.mapper.ts` | 목록은 본문 제외(페르소나가 길다), 상세만 전문 |
| `coach-proposal.service.ts` | 적용·되돌리기 6개 경로에 kind·rationale·proposalId·actor 전달 |
| `dto/request/ai-config.request.ts` | `note` |
| `ai-engine.module.ts` | 엔티티·서비스 등록 |
| `sql/migration_ai_config_revisions.sql` | 신규 테이블 1종 |
| `ConfigHistorySection.tsx` · `AiSettingsPage.tsx` · i18n ×3 | 이력 카드 + 상세 모달 + **초안 복원 연결** |

## 5. 테스트

| 항목 | 결과 |
|---|---|
| 신규 단위 테스트 | **6건** 통과 (베이스라인 · max+1 채번 · 무변경 스킵 · 변경 필드 · rationale 승계 · **실패해도 저장은 성공**) |
| 모노레포 전체 | **1,099 tests / 103 suites** 통과(무회귀) |
| typecheck | ✅ 9 tasks |
| 마이그레이션(로컬) | ✅ 테이블 생성 |
| 실기동 E2E | ✅ 수동 저장 → **#1 baseline + #2 manual(note·changedFields 기록)** → 같은 값 재저장 시 이력 그대로 2건 → 베이스라인 상세 조회 → 그 내용으로 원복 |

## 6. 배포 상태

| 환경 | 상태 |
|---|---|
| main | ✅ PR [#270](https://github.com/KimIgyong/ivyusa-shopping-talktalk/pull/270) `c2843ac` |
| staging | ✅ **배포 완료 2026-08-13** — SQL 선적용 → 배포 → 검증 |
| production | ⬜ (호스트 미확보) |

### 배포 후 검증 (스테이징, 실 경로)

배포 직후 이력 0건에서 시작해 네 경로를 전부 태웠다.

| 순서 | 동작 | 기록된 리비전 |
|---|---|---|
| 1 | 코칭 제안 승인 | **#1 `baseline`**(변경 전 상태) + **#2 `coaching`** — `changedFields=rules`, `proposalId=13`, note=제안 rationale |
| 2 | 설정 폼 수동 저장(한글 note) | **#3 `manual`** — `changedFields=persona`, note **한글 정상** |
| 3 | 제안 되돌리기 | **#4 `revert`** |
| 4 | 원래 값으로 복원 저장 | **#5 `manual`** |

즉 **코칭 승인이 익명 덮어쓰기가 아니라 사유를 달고 기록된다**는 설계 목표가 실환경에서 확인됐다.
검증 후 persona·rules(10건)를 원복하고, 검증 리비전과 스레드는 정리했다(다음 실제 변경 시
베이스라인이 새로 잡힌다).

⚠️ **관측**: #2/#4의 note가 깨져 보였는데, 원인은 제가 mysql CLI로 넣은 **제안 픽스처의 rationale이
이미 깨져 있던 것**이다. 같은 화면에서 앱 경로로 저장한 #3의 한글 note는 정상이었다 — 앱은 문제없다.
(CLI로 한글을 넣을 때 반복되는 클라이언트 charset 문제이며, 이번이 세 번째다.)

```bash
docker cp sql/migration_ai_config_revisions.sql ivy_mysql_staging:/tmp/m.sql
docker exec ivy_mysql_staging sh -c 'mysql -u ivy -p"$MYSQL_PASSWORD" db_ivy_talktalk < /tmp/m.sql'
# 확인: SHOW TABLES LIKE 'tenant_ai_config_revisions';
```
롤백: 코드만 되돌리면 된다. 신규 테이블은 기존 기능이 참조하지 않는다.

## 7. 남은 일

1. ~~스테이징 확인(코칭 승인 → kind=coaching + rationale 노트, 되돌리기 → kind=revert)~~ →
   **완료** (§6). ⬜ 남은 것: **편집기 불러오기가 저장 전까지 반영되지 않는지**는 화면 동작이라
   브라우저로 봐야 한다.
2. 이력 보관 정책(무한 누적) — 지금은 목록 30건 제한만 있다. 보존 기간은 프라이버시 백로그 PCB-06 계열.
3. `scenarioOverrides`도 스냅샷에 포함되지만 화면에는 페르소나·규칙만 보여준다.
