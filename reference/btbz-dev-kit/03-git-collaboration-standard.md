# Git·협업 표준 v2.0

> **버전**: 2.0 (2026-07-30) — GIT-BRANCH-STRATEGY(2026-04-11) 업그레이드
> 브랜치 모델 자체는 v1과 동일. **실전 협업에서 확인된 규칙(관리자 머지, 공유 작업 디렉터리, 스키마 PR)** 이 추가되었다.

---

## 1. 브랜치 구조

```
production ──────────────── 프로덕션 배포 (PR 필수, 1명 승인, Merge Commit)
  │
  └── main ──────────────── 개발 통합 = 스테이징 배포 (PR 필수, 1명 승인, Squash Merge)
        ├── feature/*  fix/*  refactor/*  docs/*   ← 로컬 개발
        └── hotfix/*                               ← production에서 분기 → 양쪽 머지
```

| 항목 | 규칙 |
|------|------|
| feature → main | **Squash Merge** |
| main → production | **Merge Commit** |
| hotfix | production 분기 → production + main 둘 다 머지 |
| 브랜치명 | `feature/{기능명}` 소문자+하이픈, 한글 허용 |
| 보호 규칙 | main/production 모두 `protected: true` + 승인 1+ 유지 — `check-branch-protection.sh`로 정기 점검 |

## 2. 커밋/PR 메시지

```
{type}: {설명}
type: feat | fix | hotfix | refactor | docs | style | test | chore
```

PR 필수 사항: 제목은 커밋 규칙 동일, 변경 요약 + 테스트 방법, `npm run build` 통과. main→production PR은 스테이징 QA 결과 + 릴리즈 기능 목록 + 롤백 계획 명시.

---

## 3. 실전 규칙 (AMA 확정)

### 3.1 ⚠️ 승인 1명 규칙과 1인 개발의 현실 — 관리자 머지

작성자는 자기 PR을 승인할 수 없으므로, 실질 개발자가 1명이면 `reviewDecision: REVIEW_REQUIRED`가 영원히 해소되지 않는다. AMA 확정 경로:

```bash
# main (Squash)
gh pr merge <N> --squash --admin
# production (Merge Commit)
gh pr merge <N> --merge --admin
```

사용자가 "승인완료/배포 진행"이라 해도 자가승인 불가 사실을 짚고 관리자 머지로 진행한다. 팀 규모가 커지면 정규 승인 경로로 전환.

### 3.2 ⚠️ 공유 작업 디렉터리 동시 git 작업 함정

로컬 작업 디렉터리를 여러 개발자/에이전트가 공유하면, 내가 커밋·푸시하는 사이 상대가 브랜치를 전환/리셋해 **내 브랜치가 빈 채로 원격에 올라가는** 사고가 실제 발생한다.

- **증상**: `gh pr create`가 "No commits between main and feature/X" 실패, `git branch --show-current`가 남의 브랜치.
- **복구 (로컬 브랜치와 싸우지 말 것)**:
  ```bash
  git show --stat <내커밋SHA>                       # 내용/부모 확인
  git push origin <SHA>:refs/heads/feature/<유니크명>  # SHA를 신규 원격 브랜치로 직접 푸시
  gh pr view <#> --json files                       # 파일 범위가 내 것만인지 확인 후 머지
  ```
- **예방**: 커밋 직후 `git branch --show-current` + `git ls-remote origin <branch>` 확인. 동시 작업이 예상되면 **git worktree로 격리**하거나 작업 전 `git stash`로 남의 미커밋 변경을 치운다(남의 미배포 브랜치 위에서 작업 시작하는 사고도 있었음 — 항상 `origin/main`에서 새 브랜치).
- 서버 배포는 `origin/{main,production}` 기준이므로 로컬 혼선과 무관 — **머지만 정확하면 배포는 안전**.

### 3.3 ⚠️ 스키마 변경 PR — `## Migration` 섹션 MUST

diff에 `sql/*.sql` 또는 `*.entity.ts` 변경이 포함되면 PR 본문에 반드시:

```markdown
## Migration
- SQL 파일: `sql/<file>.sql`
- [ ] 개발(local) 적용
- [ ] 스테이징 적용 (배포 직후)
- [ ] 프로덕션 적용 (배포 직후)
- 롤백 SQL: (경로 또는 "해당 없음")
```

- 엔티티 변경이 있는데 대응 SQL 파일이 없으면 **마이그레이션 누락 가능성 — 머지 전 지적**.
- 배경: 배포 스크립트는 마이그레이션을 자동 실행하지 않는다(04 문서 §3). 코드만 머지되면 운영에서 `relation does not exist` 500이 반복된다.

### 3.4 부분 릴리즈 — rebase --onto

장기 feature 브랜치에서 **일부 커밋만 먼저 릴리즈**해야 할 때 전체 병합은 금지(뒤처진 커밋 수십 개가 딸려 들어감). 릴리즈 대상 구간만 분리:

```bash
git rebase --onto main <분기점> <대상브랜치끝> # 릴리즈분만 새 브랜치로 떼어 PR
```

AMA 편집기 개선 릴리즈에서 검증된 패턴(24커밋 뒤처진 feature 브랜치에서 개선분만 추출).

### 3.5 서버 작업 트리 위생

⚠️ 스테이징/프로덕션 서버에 **git 미커밋 수동 핫픽스를 상주시키지 않는다.** deploy의 `git pull --ff-only`가 "local changes would be overwritten"으로 실패해도 스크립트가 exit 0으로 끝나 **옛 코드로 조용히 배포**되는 함정이 있다. 핫픽스는 즉시 정식 커밋 → 서버에서 `git checkout -- <파일>`로 정리. 서버 전용 설정(compose 포트/볼륨 등)만 예외로 유지.

---

## 4. 개발 플로우 요약

```
1. origin/main 기준 feature 브랜치 생성 (공유 디렉터리면 stash/worktree 격리 먼저)
2. 개발 + 커밋 → 푸시 직후 브랜치/원격 확인 (§3.2 예방)
3. PR 생성 (스키마 변경 시 ## Migration 섹션)
4. main 머지 (squash, 필요 시 --admin) → 스테이징 배포 + QA
5. main → production PR (merge commit, 필요 시 --admin)
6. 프로덕션 배포 → 04 문서 §4 검증 절차
```
