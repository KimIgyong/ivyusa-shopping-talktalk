# RPT — 판정 실패 가시화 · 충돌 화면 내 편집 · 수정 히스토리 구현 보고서

| | |
|---|---|
| Doc ID | CHATWIDGET-RPT-KBEDIT-1.0.0 |
| 작성일 | 2026-08-04 |
| 선행 | REQ v1.0.1 → PLN(T0~T3) → 구현 → TCR |
| PR | **#97** (REQ+PLN+T0~T3+TCR/RPT 통합) |
| 상태 | **구현·테스트 완료 / 스테이징 배포 대기** |

---

## 1. 요구별 결과

### ① 실패 사유 로깅 + 반복 실패 쌍 표시
판정 포기 4경로 중 **3경로가 완전 무음**이었고, 실패 쌍은 저장되지 않아 **매 스캔 재판정**됐습니다
(실측 11쌍 × 스캔 횟수).

- `judge()`가 판별 가능한 결과를 반환하고 **모든 경로가 사유를 로그**합니다.
- 실패 쌍을 `failed` 상태 + 사유 + 시도횟수로 저장 → 재판정 낭비 제거, 콘솔에 노출.
- **자동 재시도 3회 후 중단**(E5), 수동 재시도는 예산 무시.
- 콘솔 충돌 패널 상단에 **판정 실패 섹션**을 고정 배치 — 필터와 무관하게 항상 보입니다.

### ② 충돌 화면 내 편집
- **카드 안에서** 제목·카테고리·본문을 편집·저장합니다. **반대편 문서가 계속 보입니다.**
- 서버의 400자 절단 제거(평균 242자·최대 914자) → 클라이언트가 접기 처리.
- **쌍 단위 재판정** 추가 — 편집 후 전체 재스캔(229문서 임베딩) 불필요.

### ③ 수정 히스토리
- 지식 도메인 **전체**(생성·수정·삭제·활성토글·검토완료·충돌해소)에 감사 기록.
- 변경마다 **내용 스냅샷**(`kb_document_revisions`), 문서 상세에 **이력 탭 + 줄 단위 diff + 되돌리기**.
- 되돌리기는 **새 이력으로 전진** — 기존 이력을 덮지 않고 롤백 자체도 귀속됩니다.

### T0 (별도) — `warn` 액션이 차단으로 동작
요구와 무관하게 발견된 **기존 결함**. `FIX-260804-Moderation-Warn-Blocks.md` 참조.

---

## 2. 설계에서 의도적으로 선택한 것

**모더레이션 차단은 실패가 아닙니다.** 판정값은 `conflict|duplicate|complementary` 3값
열거형이라 콘텐츠 규칙 위반이 **불가능**합니다. 자유 텍스트는 근거뿐인데, 근거 한 문장 때문에
"두 문서가 상충한다"는 정보 전체를 버리고 있었습니다. 이제 판정은 저장하고 근거만 보류하며,
카드가 그 사실을 명시합니다.

**베이스라인 행.** 이력이 없는 문서를 처음 수정할 때 두 행을 씁니다. 없으면 시행 후 **첫 수정을
되돌릴 대상이 없습니다.** 베이스라인의 actor는 `null` — 시행 이전 상태를 누구의 공으로도
돌릴 수 없기 때문입니다.

**이력은 문서보다 오래 삽니다.** 이 프로젝트는 하드 삭제(SPEC §13)이므로 `document_id`에
FK를 걸지 않았습니다. 삭제 직전 상태를 마지막 이력으로 남깁니다.

**감사에는 필드명만, 본문은 이력에.** 두 저장소의 수명이 다릅니다.

**diff는 의존성 없이.** 본문 평균 242자에 줄 단위 LCS 40줄이면 충분하고, 어떤 라이브러리보다
작습니다.

**이력 실패가 편집을 막지 않습니다.** 이력 기록 시점에는 문서 저장이 이미 끝났습니다.

---

## 3. 파일

**신규(백엔드)**
```
apps/api/src/domain/knowledge/entity/kb-document-revision.entity.ts
apps/api/src/domain/knowledge/kb-revision.service.ts (+spec)
sql/migration_kb_conflict_failures.sql
sql/migration_kb_document_revisions.sql
```
**신규(프론트엔드)**
```
apps/web/src/domain/knowledge/RevisionHistory.tsx
```
**주요 수정**
```
moderation.service.ts(+spec) · kb-conflict.{service,entity}.ts(+spec)
knowledge.{service,controller,mapper,module}.ts
ConflictReview.tsx · KnowledgePage.tsx · knowledge.{service,hooks}.ts
i18n locales en/es/ko (knowledge)
```

---

## 4. 테스트

| 항목 | 결과 |
|---|---|
| API | **439 통과** (427 → +12) |
| 모노레포 typecheck·test·build | 16 태스크 전부 통과 |
| 마이그레이션 | scratch DB 생성 경로 + 멱등성 양방향 확인 |
| 부팅 | 강제 재빌드 후 `successfully started` |

**테스트가 실제 결함 2건을 잡았습니다** — `changedFields`의 Date 정규화 미동작(매 저장마다
불필요한 이력이 쌓일 상태), spec이 typecheck 제외라 조용히 통과하던 생성자 인자 불일치(감사
경로 미검증). 상세는 TCR §4.

---

## 5. 배포 상태

| 환경 | 코드 | 마이그레이션 | 상태 |
|---|---|---|---|
| main | PR #97 대기 | — | 머지 대기 |
| staging | 미배포 | **미적용** | 대기 |
| production | 미배포 | 미적용 | 대기 |

### 배포 절차 (⚠️ SQL 선적용)

```bash
# 1) 스키마 스냅샷
ssh <staging> "docker exec ivy_mysql_staging sh -c 'mysqldump -u ivy -p\"\$MYSQL_PASSWORD\" \
  --no-data db_ivy_talktalk kb_conflicts' > ~/backup-pre-kbedit-$(date +%Y%m%d-%H%M%S).sql"

# 2) SQL 선적용 (docker cp + 파일 실행 — heredoc은 조용히 무동작)
ssh <staging> "cd ~/ivyusa-shopping-talktalk && git pull && \
  docker cp sql/migration_kb_conflict_failures.sql   ivy_mysql_staging:/tmp/m1.sql && \
  docker cp sql/migration_kb_document_revisions.sql  ivy_mysql_staging:/tmp/m2.sql && \
  docker exec ivy_mysql_staging sh -c 'mysql --default-character-set=utf8mb4 -u ivy -p\"\$MYSQL_PASSWORD\" db_ivy_talktalk < /tmp/m1.sql' && \
  docker exec ivy_mysql_staging sh -c 'mysql --default-character-set=utf8mb4 -u ivy -p\"\$MYSQL_PASSWORD\" db_ivy_talktalk < /tmp/m2.sql'"

# 3) 코드 배포 → 4) 검증(부팅 로그 · 컨테이너 age · 라우트 401/404/502)
```

### 배포 후 확인할 것

1. **실패 11쌍 재판정** — `POST /knowledge/conflicts/:id/retry` 또는 재스캔.
   T0으로 `guarantee` **단어 규칙(warn)** 에 걸린 건은 통과합니다. 다만 `context` 규칙(LLM 판정,
   action=block)에 걸리는 건은 **여전히 근거가 보류**되며, 이는 정상 동작입니다(판정은 저장됨).
2. 신규 라우트 401 확인 — `/knowledge/documents/:id/revisions`, `/knowledge/conflicts/:id/retry`
3. 편집 → 이력 1행 + 베이스라인 생성 확인, 되돌리기 후 재임베딩 확인

---

## 6. 남은 작업

| 항목 | 성격 |
|---|---|
| 스테이징 배포 + 화면 클릭 검증 | 콘솔 비밀번호 운영자 보유 |
| `context` 모더레이션 규칙 범위 재검토 | 내부 관리자용 텍스트까지 차단하는 것이 적절한지 — 규칙 자체는 고객 대화에 타당 |
| 이력 소급 불가 | 이번 시행 이전 편집은 복원 불가. 베이스라인이 그 시점부터의 롤백만 보장 |
| spec typecheck 제외 | 생성자 의존성 추가 시 spec 동시 확인 필요(같은 유형 3회 발생) — tsconfig 조정 검토 |
