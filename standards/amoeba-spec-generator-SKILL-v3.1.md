---
name: amoeba-spec-generator
description: >
  Amoeba Company SDLC documentation generator for AmoebaTalk and related services.
  Generates bilingual (EN/KR) documents across analysis, design, implementation, and test phases.
  Integrates with GitHub Projects for WBS task management and issue tracking.
  Triggers: "기획서", "스펙 문서", "API 설계", "DB 스키마", "PRD", "기능 명세",
  "요구사항 분석", "시퀀스다이어그램", "ERD", "WBS", "개발계획서", "테스트케이스",
  "화면기획서", "작업계획서", "작업리포트", "테스트리포트", "GitHub issue",
  "버그 리포트", "기능 개선", "형상관리" 등의 표현에 트리거한다.
  Also triggers on: "spec document", "create issue", "development plan", "test report".
  아메바톡, 아메바캠페인, 아모바오더, 아모바샵 등 아메바 서비스 관련 문서 요청에 특히 적극적으로 트리거할 것.
---

# Amoeba Spec Generator

A **conversational SDLC documentation skill** for Amoeba Company services.
아메바컴퍼니 서비스의 개발 전체 라이프사이클(SDLC)을 지원하는 **대화형 문서 생성 스킬**이다.

Core principles:
1. **Bilingual documentation** — English-first with Korean annotations (영어 우선, 한국어 병기)
2. **Traceability** — Each artifact feeds into the next stage via consistent ID references (FR → FN → T → TC)
3. **GitHub-native workflow** — WBS tasks map to GitHub Issues/Projects, changes tracked via Git (형상관리는 Git/GitHub 기반)
4. **Conversational creation** — Structured interviews extract requirements progressively (대화형 인터뷰로 점진적 문서 작성)

---

## Technical Context / 기술 컨텍스트

AmoebaTalk base technology stack — reflect this context in all generated documents:

| Layer | Technology |
|-------|-----------|
| Frontend | Vue.js, React |
| Backend | Next.js (Node.js) |
| Database | MySQL |
| Message Queue | RabbitMQ |
| Version Control | Git / GitHub |

Additional infra: Nginx (reverse proxy), Redis (cache/session), PostgreSQL (some services)

**Frontend framework usage (프론트엔드 프레임워크 사용 기준):**
- **Vue.js** — AmoebaTalk existing modules, AmobaOrder, AmobaShop (기존 서비스)
- **React** — New services, AmoebaCampaign, customer-facing widgets (신규 서비스/위젯)
- When generating documents, always ask which framework the target service uses if not obvious. Include framework-specific considerations in UI Spec and Sequence Diagram.
- 문서 생성 시 대상 서비스가 어떤 프레임워크를 사용하는지 확인하고, 화면기획서와 시퀀스 다이어그램에 프레임워크별 고려사항을 반영한다.

Amoeba service ecosystem:
- **AmoebaTalk** — Multi-channel unified communication platform (KakaoTalk, Naver TalkTalk, Instagram DM, etc.)
- **AmoebaCampaign** — Marketing automation
- **AmobaOrder** — Delivery/ordering app
- **AmobaShop** — Sales partner platform

---

## Bilingual Writing Convention / 이중 언어 작성 규칙

All documents are written **English-first with Korean annotations**.
모든 문서는 **영어 우선, 한국어 병기** 방식으로 작성한다.

### Rules

1. **Section headers**: English primary, Korean in parentheses
   - `## 1. Overview (개요)` — not `## 1. 개요`
2. **Table headers**: English only
   - `| ID | Requirement | Priority | Note |` — not `| ID | 요구사항 | 우선순위 | 비고 |`
3. **Table content**: English preferred; Korean when the content is inherently Korean (e.g., 카카오톡 채널명)
4. **Descriptions and body text**: English is the primary language. Add Korean in parentheses `(한국어)` when the Korean term clarifies meaning or is domain-specific
5. **Code, API, SQL**: Always English — variable names, comments, column names all in English
6. **Filenames**: Always English: `{feature}-requirements.md`, not `{기능}-요구사항.md`
7. **Commit messages & issue titles**: English

### Example

```markdown
# Conversation Grouping — Requirements Analysis (대화 그룹핑 요구사항 분석서)

## 1. Project Overview (프로젝트 개요)
- **Project**: Conversation Grouping for AmoebaTalk (아메바톡 대화 그룹핑)
- **Background**: Currently, conversations from the same customer across multiple channels
  (카카오톡, 네이버톡톡, 인스타그램 DM) are displayed separately...

## 2. Functional Requirements (기능 요구사항)
| ID | Requirement | Priority | Note |
|----|-------------|----------|------|
| FR-001 | Auto-match customer by phone number (전화번호 기반 고객 자동 매칭) | P0 | |
```

---

## Configuration Management / 형상관리

All SDLC artifacts are version-controlled via Git. This ensures traceability, auditability, and collaboration across the KR-VN distributed team.

### Document Repository Structure

```
{project-repo}/
├── docs/
│   ├── analysis/                    # Stage 1 artifacts
│   │   └── {feature}-requirements.md
│   ├── design/                      # Stage 2 artifacts
│   │   ├── {feature}-event-scenario.md
│   │   ├── {feature}-req-definition.md
│   │   ├── {feature}-func-definition.md
│   │   ├── {feature}-ui-spec.md
│   │   ├── {feature}-sequence.md
│   │   ├── {feature}-erd.md
│   │   ├── {feature}-process.md
│   │   ├── {feature}-policy.md
│   │   └── {feature}-user-guide.md
│   ├── implementation/              # Stage 3 artifacts
│   │   ├── {feature}-dev-plan.md
│   │   ├── {feature}-wbs.md
│   │   └── tasks/
│   │       ├── {feature}-task-{n}-plan.md
│   │       └── {feature}-task-{n}-report.md
│   └── test/                        # Stage 4-5 artifacts
│       ├── {feature}-testcase.md
│       ├── {feature}-test-report.md
│       ├── {feature}-integration-test-plan.md
│       └── {feature}-final-test-report.md
├── sql/
│   └── {feature}-schema.sql
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug-report.md
│   │   ├── feature-request.md
│   │   └── enhancement.md
│   └── PROJECT_TEMPLATE.md
└── CHANGELOG.md
```

### Document Versioning

Every document includes a version header block:

```markdown
---
document_id: {FEATURE}-{TYPE}-{VERSION}
version: 1.0.0
status: Draft | Review | Approved | Deprecated
created: 2026-02-14
updated: 2026-02-14
author: {author}
reviewers: []
change_log:
  - version: 1.0.0
    date: 2026-02-14
    author: {author}
    description: Initial draft
---
```

Version numbering follows semver:
- **MAJOR** (1.0.0 → 2.0.0): Scope/requirement changes that break existing design
- **MINOR** (1.0.0 → 1.1.0): Feature additions, new sections
- **PATCH** (1.0.0 → 1.0.1): Typos, clarifications, formatting

### Git Workflow for Documents

```
main (production docs)
  └── docs/{feature} (document development branch)
        ├── commit: "docs(analysis): add requirements FR-001~FR-010"
        ├── commit: "docs(design): add sequence diagram for message routing"
        └── PR → main (review required)
```

Commit message convention:
```
docs({stage}): {action} {description}

Examples:
  docs(analysis): add conversation-grouping requirements
  docs(design): update ERD with bot_conversations table
  docs(impl): add WBS tasks T-001~T-008
  docs(test): add test cases TC-001~TC-015
  fix(docs): correct sequence diagram participant order
```

---

## GitHub Integration / GitHub 연동

WBS tasks, bugs, feature requests, and enhancements are all managed through GitHub Issues and GitHub Projects.

### WBS → GitHub Issues

Each WBS task is created as a GitHub Issue and linked to a GitHub Project board.

**Issue creation template for WBS tasks:**

```markdown
---
title: "[T-{n}] {Task title in English}"
labels: ["task", "stage:implementation", "{feature-name}"]
milestone: "{milestone-name}"
project: "{project-board-name}"
assignees: ["{github-username}"]
---

## Task Information
- **Task ID**: T-{n}
- **Feature**: {feature-name}
- **Priority**: P0/P1/P2
- **Estimated effort**: {n} days
- **Depends on**: #{issue-number-of-preceding-task}

## Description (설명)
{What this task implements, referencing design docs}

## Acceptance Criteria (완료 조건)
- [ ] Implementation complete per FN-{n} spec
- [ ] Unit tests pass (TC-{n})
- [ ] Code review approved
- [ ] Documentation updated

## References (참조 문서)
- Functional spec: `docs/design/{feature}-func-definition.md` → FN-{n}
- Sequence diagram: `docs/design/{feature}-sequence.md` → Scenario {n}
- ERD: `docs/design/{feature}-erd.md`
```

### GitHub Project Board Structure

```
Project: {Feature Name} Development
├── 📋 Backlog          — Tasks not yet started
├── 📝 Analysis         — Stage 1 in progress
├── 🎨 Design           — Stage 2 in progress
├── 🔨 In Development   — Stage 3 in progress
├── 🧪 Testing          — Stage 4-5 in progress
├── 👀 In Review        — PR/document review
└── ✅ Done             — Completed & merged
```

### Issue Types / 이슈 유형

#### Bug Report (버그 리포트)

```markdown
---
title: "[BUG] {Short description in English}"
labels: ["bug", "severity:{critical|major|minor}", "{feature-name}"]
---

## Bug Description (버그 설명)
**Summary**: {One-line summary}
**Severity**: Critical / Major / Minor
**Environment**: Production / Staging / Development

## Steps to Reproduce (재현 절차)
1. {Step 1}
2. {Step 2}
3. {Step 3}

## Expected Behavior (기대 동작)
{What should happen}

## Actual Behavior (실제 동작)
{What actually happens}

## Evidence (증거)
- Screenshots / logs / error messages

## Related (연관)
- Related task: #T-{n}
- Related requirement: FR-{n}
- Affected component: {module/service}
```

#### Feature Request (추가 기능 요청)

```markdown
---
title: "[FEAT] {Short description in English}"
labels: ["feature", "priority:{P0|P1|P2}", "{feature-name}"]
---

## Feature Description (기능 설명)
**Summary**: {One-line summary}
**Business value**: {Why this is needed}

## User Story
As a {user type}, I want to {action} so that {benefit}.

## Acceptance Criteria (인수 조건)
- [ ] {Criterion 1}
- [ ] {Criterion 2}

## Technical Notes (기술 참고)
- Affected services: {list}
- Estimated complexity: S / M / L / XL

## Related
- Parent feature: #{issue-number}
- Related requirements: FR-{n}
```

#### Enhancement (기능 개선)

```markdown
---
title: "[ENHANCE] {Short description in English}"
labels: ["enhancement", "{feature-name}"]
---

## Current Behavior (현재 동작)
{How it works now}

## Proposed Improvement (개선 제안)
{How it should work}

## Motivation (개선 사유)
{Why this improvement matters — performance, UX, maintainability, etc.}

## Impact Assessment (영향 분석)
- Affected components: {list}
- Breaking changes: Yes / No
- Estimated effort: {n} days

## Related
- Related task: #{issue-number}
```

### Issue Lifecycle & Branch Convention

```
Issue created → Branch created → Development → PR → Review → Merge → Issue closed

Branch naming:
  feature/{issue-number}-{short-description}   # New feature
  bugfix/{issue-number}-{short-description}     # Bug fix
  enhance/{issue-number}-{short-description}    # Enhancement
  docs/{issue-number}-{short-description}       # Documentation only

Examples:
  feature/42-conversation-grouping
  bugfix/58-phone-number-format
  enhance/63-timeline-performance
```

### WBS ↔ GitHub ↔ Redmine Mapping

When generating WBS, include both GitHub and Redmine references:

| ID | Task | Assignee | Depends On | Effort | GitHub Issue | Redmine Issue | Branch | Status |
|----|------|----------|------------|--------|-------------|---------------|--------|--------|
| T-001 | {task} | {person} | - | {n}d | #{gh-num} | RM-{rm-num} | feature/{gh-num}-{desc} | Backlog |
| T-002 | {task} | {person} | T-001 | {n}d | #{gh-num} | RM-{rm-num} | feature/{gh-num}-{desc} | Backlog |

---

## Redmine Integration / Redmine 연동

GitHub and Redmine maintain **bidirectional real-time sync** via webhooks. Both systems are editable; conflict resolution uses "last-write-wins" with timestamp comparison.

GitHub는 개발팀의 코드 레벨 작업 관리, Redmine은 프로젝트 관리/보고 레벨 — 양방향 실시간 동기화를 통해 두 시스템 모두 편집 가능하다.

### Architecture Overview (아키텍처 개요)

```
┌─────────────────┐                          ┌─────────────────┐
│     Redmine     │                          │     GitHub      │
│  (PM/경영진 뷰)  │                          │  (개발팀 작업 뷰) │
│                 │                          │                 │
│  Projects       │◄──────── sync ─────────►│  Repositories   │
│  ├─ Versions    │◄──────── sync ─────────►│  ├─ Milestones   │
│  ├─ Issues      │◄──────── sync ─────────►│  ├─ Issues       │
│  ├─ Time entries│◄──── commit hooks ──────│  ├─ Commits/PRs  │
│  ├─ Gantt chart │  (auto-generated)       │  ├─ Projects     │
│  └─ Roadmap     │  (auto-generated)       │  └─ Actions      │
│                 │                          │                 │
└────────┬────────┘                          └────────┬────────┘
         │                                            │
         │  Webhook: issue.updated                    │  Webhook: issues, pull_request
         │  Webhook: issue.created                    │  Webhook: push (commit refs)
         │                                            │
         └──────────────┐    ┌────────────────────────┘
                        ▼    ▼
                 ┌──────────────────┐
                 │   Sync Service   │
                 │  (Middleware)    │
                 │                 │
                 │  - Field mapping │
                 │  - Status mapping│
                 │  - Conflict      │
                 │    resolution    │
                 │  - Audit log     │
                 └──────────────────┘
```

### Status Mapping (상태 매핑)

Bidirectional status mapping between GitHub and Redmine:

| GitHub Issue State | GitHub Label | Redmine Status | Redmine % Done |
|-------------------|-------------|----------------|----------------|
| `open` | (no label) | New (신규) | 0% |
| `open` | `status:in-progress` | In Progress (진행중) | 30% |
| `open` | `status:in-review` | In Review (리뷰중) | 70% |
| `open` | `status:testing` | Testing (테스트중) | 80% |
| `closed` | (merged PR) | Resolved (해결) | 100% |
| `closed` | `wontfix` | Rejected (거절) | 0% |
| `open` | `status:blocked` | Blocked (차단됨) | — |
| `open` | `status:feedback` | Feedback (피드백 대기) | — |

**Sync direction examples:**
- Developer moves card to "In Development" on GitHub Project → Redmine issue status changes to "In Progress" (30%)
- PM changes Redmine issue target version → GitHub issue milestone updates
- Developer closes GitHub issue via PR merge → Redmine issue becomes "Resolved" (100%)
- PM reopens Redmine issue → GitHub issue reopens with `status:feedback` label

### Field Mapping (필드 매핑)

| GitHub | Direction | Redmine | Note |
|--------|-----------|---------|------|
| Issue title | ↔ | Issue subject | Bidirectional |
| Issue body | ↔ | Issue description | Bidirectional |
| Labels (`priority:*`) | ↔ | Priority | P0=Urgent, P1=High, P2=Normal |
| Labels (`bug`,`feature`,`enhancement`) | ↔ | Tracker | Bug/Feature/Enhancement |
| Milestone | ↔ | Target version | Synced by name |
| Assignee | ↔ | Assigned to | Mapped by username table |
| Labels (`status:*`) | → | Status | GitHub label drives Redmine status |
| — | ← | Status | Redmine status drives GitHub label |
| Project board column | ↔ | Status | Board column = Redmine status |
| Due date (in body) | ↔ | Due date | Enables Gantt chart |
| Estimate (in body) | ↔ | Estimated hours | Enables Gantt chart |
| Issue number | — | Custom field `github_issue_id` | Cross-reference |
| — | — | Custom field `github_pr_url` | Auto-populated on PR |

### Gantt Chart & Roadmap Sync (간트차트/로드맵 연동)

Redmine's Gantt chart and Roadmap are automatically populated when:

1. **Start date** — Set when GitHub issue moves to "In Development" (status:in-progress)
2. **Due date** — Synced from WBS estimated end date (stored in GitHub issue body)
3. **% Done** — Updated via status mapping table above
4. **Target version** — Synced from GitHub Milestone
5. **Dependencies** — Parsed from "Depends on: #N" in GitHub issue body → Redmine "precedes" relation

```
Redmine Gantt Chart (auto-generated):
──────────────────────────────────────────────────────
 Task          │ W1    │ W2    │ W3    │ W4    │ W5
──────────────────────────────────────────────────────
 T-001 RM-101  │████████       │       │       │       100%
 T-002 RM-102  │  ▓▓▓▓▓▓▓▓▓▓▓ │       │       │        70%
 T-003 RM-103  │       │ ░░░░░░░░░░   │       │        30%
 T-004 RM-104  │       │       │       │ -----─│──      0%
──────────────────────────────────────────────────────
 ████ = Resolved  ▓▓▓ = In Review  ░░░ = In Progress  --- = Not started

Redmine Roadmap (auto-generated):
 Version: v1.0 (MVP)
 ├── 8 issues total, 3 closed, 5 open
 ├── T-001 Resolved ✓
 ├── T-002 In Review (70%)
 └── ... progress bar: ████████░░░░░░░░ 37%
```

### Webhook Configuration (Webhook 설정)

#### GitHub → Sync Service

```yaml
# GitHub Webhook configuration
webhook:
  url: https://sync.amoebacompany.com/github/webhook
  content_type: application/json
  events:
    - issues          # Issue opened, closed, edited, labeled
    - pull_request    # PR opened, merged, closed
    - push            # Commit references (for time tracking keywords)
    - project_card    # Project board column changes
```

#### Redmine → Sync Service

```yaml
# Redmine Webhook configuration (via redmine_webhook plugin)
webhook:
  url: https://sync.amoebacompany.com/redmine/webhook
  events:
    - issue_created
    - issue_updated   # Status, assignee, version, dates, % done
    - issue_deleted
    - version_created
    - version_updated
```

### Sync Service Design (동기화 서비스 설계)

The sync service is a lightweight middleware that processes webhooks from both sides.

```
Sync Service (Node.js / Express)
├── /github/webhook    — Receives GitHub events
├── /redmine/webhook   — Receives Redmine events
├── /api/mapping       — View/edit field mappings
├── /api/conflicts     — View/resolve sync conflicts
└── /api/audit         — Sync history log

Key modules:
├── mapper.js          — Field/status mapping logic
├── conflict.js        — Last-write-wins with timestamp
├── github-client.js   — GitHub API calls
├── redmine-client.js  — Redmine REST API calls
└── audit.js           — All sync events logged
```

### Conflict Resolution (충돌 해결)

Since both systems are editable, conflicts can occur when the same field is updated on both sides within a short window.

**Strategy: Last-write-wins with audit trail**

```
1. Webhook arrives from System A with timestamp T1
2. Check: was this field updated on System B after T1?
   - No  → Apply change to System B
   - Yes → Compare timestamps
     - T1 > T2 → Apply A's change to B (A wins)
     - T1 < T2 → Skip (B already has newer data)
     - T1 = T2 → Flag as conflict → notify PM via Slack/email
3. Log all sync events to audit table for traceability
```

### Commit → Redmine Time Tracking (커밋 → Redmine 공수 기록)

Developers can log time to Redmine directly from commit messages:

```
git commit -m "feat(chat): implement message grouping

Refs RM-101, #42
Spent 3h on customer matching logic"
```

Sync service parses:
- `Refs RM-{n}` → Links commit to Redmine issue
- `Spent {n}h` → Creates Redmine time entry
- `#{n}` → Links to GitHub issue (standard GitHub behavior)
- `Closes #{n}` → Resolves both GitHub issue and Redmine issue

### Document Generation Notes (문서 생성 시 참고)

When generating documents in any SDLC stage, include cross-references to both systems:

**In WBS and Task Plans:**
```markdown
- **GitHub Issue**: #{gh-number}
- **Redmine Issue**: RM-{rm-number}
- **Redmine Version**: {version-name}
```

**In Test Reports (when bugs found):**
```markdown
| TC ID | Result | GitHub Issue | Redmine Issue |
|-------|--------|-------------|---------------|
| TC-001 | ❌ FAIL | #{gh-num} [BUG] | RM-{rm-num} |
```

**In Task Reports:**
```markdown
## Changes (변경 사항)
- **Commits**: {commit-range}
- **PR**: #{pr-number}
- **GitHub Issue**: #{gh-number} → Closed
- **Redmine Issue**: RM-{rm-number} → Resolved (100%)
- **Redmine Time**: {n}h logged
```

---

## SDLC Overview / 개발 라이프사이클 개요

This skill follows a 5-stage development process. Users can jump to any stage directly, or say "full spec" / "처음부터" to proceed sequentially from Stage 1.

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ 1.Analy- │ →  │ 2.Design │ →  │ 3.Imple- │ →  │ 4.Unit   │ →  │ 5.Final  │
│   sis    │    │          │    │ mentation│    │   Test   │    │   Test   │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
 Requirements    Design docs     Dev plan/exec   Per-task verify  Integration
```

### Artifacts by Stage (단계별 산출물)

| Stage | Artifact | File Pattern |
|-------|----------|-------------|
| **1. Analysis** | Requirements Analysis (요구사항 분석서) | `{feature}-requirements.md` |
| **2. Design** | Event Scenario (이벤트 시나리오) | `{feature}-event-scenario.md` |
|  | Requirements Definition (요구사항 정의서) | `{feature}-req-definition.md` |
|  | Functional Specification (기능 정의서) | `{feature}-func-definition.md` |
|  | UI Specification (화면 기획서) | `{feature}-ui-spec.md` |
|  | Sequence Diagram (시퀀스 다이어그램) | `{feature}-sequence.md` |
|  | ERD | `{feature}-erd.md` + `{feature}-schema.sql` |
|  | Process Definition (프로세스 정의서) | `{feature}-process.md` |
|  | Policy Definition (정책 정의서) | `{feature}-policy.md` |
|  | User Guide (사용자 가이드) | `{feature}-user-guide.md` |
| **3. Implementation** | Development Plan (개발계획서) | `{feature}-dev-plan.md` |
|  | WBS | `{feature}-wbs.md` |
|  | Task Plan (태스크 작업계획서) | `{feature}-task-{n}-plan.md` |
|  | Task Report (태스크 작업리포트) | `{feature}-task-{n}-report.md` |
| **4. Unit Test** | Test Cases (테스트 케이스) | `{feature}-testcase.md` |
|  | Unit Test Report (단위 테스트 리포트) | `{feature}-test-report.md` |
| **5. Final Test** | Integration Test Plan (통합 테스트 계획서) | `{feature}-integration-test-plan.md` |
|  | Final Test Report (최종 테스트 리포트) | `{feature}-final-test-report.md` |
| **Cross-stage** | GitHub Issues (bugs, features, enhancements) | `.github/ISSUE_TEMPLATE/` |
|  | CHANGELOG | `CHANGELOG.md` |

### Stage Detection (단계 진입 판별)

Auto-detect stage from user request:

| User says… | Stage |
|---|---|
| "requirements analysis", "요구사항 분석", "feature planning" | 1. Analysis |
| "design document", "ERD", "sequence", "UI spec", "화면기획", "기능정의", "정책정의" | 2. Design |
| "dev plan", "WBS", "task plan", "개발계획", "작업계획서", "start development" | 3. Implementation |
| "test case", "unit test", "테스트케이스", "테스트리포트" | 4. Unit Test |
| "integration test", "final test", "QA", "통합테스트" | 5. Final Test |
| "bug report", "버그", "create issue" | GitHub Issue (Bug) |
| "feature request", "추가 기능", "new feature" | GitHub Issue (Feature) |
| "enhancement", "기능 개선", "improve" | GitHub Issue (Enhancement) |
| "full spec", "처음부터", "전체 문서" | 1→2→3→4→5 sequential |

If unclear, ask the user which stage they're at and suggest the appropriate entry point.

---

## Common: Conversational Interview Principles / 공통: 대화형 인터뷰 원칙

All stages use conversational interviews before document generation.

**Question strategy**: Never dump all questions at once. Ask 2-3 at a time, naturally.
(질문 전략: 한 번에 쏟아붓지 않는다. 2-3개씩 자연스럽게 물어본다.)

**Handling unknowns**: When the user says "I'm not sure" or "let's decide later", propose reasonable defaults and mark with `[TBD]`.
(모르는 부분: 합리적인 기본값을 제안하고 `[TBD]` 마크와 함께 넘어간다.)

**Confirmation loop**: Show the table of contents before generating. Collect feedback after generation.
(확인 루프: 생성 전 목차를 보여주고 확인받는다. 생성 후에도 피드백을 받아 수정한다.)

---

## Stage 1: Analysis (분석 단계)

Collect and analyze requirements to establish project scope and direction. Artifacts from this stage form the foundation for all subsequent design and implementation.

### Interview Flow

Round 1 — Big picture:
- What feature/service is this? (한 줄 요약)
- Why is it needed? (배경/문제)
- Who uses it? (사용자 유형)

Round 2 — Scope and constraints:
- What is the main user flow? (해피 패스)
- How does it integrate with existing systems?
- Any technical/business constraints?
- Competing products or references?

Round 3 — Prioritization:
- MVP scope?
- Feature priority (P0/P1/P2)?
- Target timeline?

### Artifact: Requirements Analysis (요구사항 분석서)

```markdown
# {Feature Name} — Requirements Analysis ({기능명} 요구사항 분석서)

## 1. Project Overview (프로젝트 개요)
- **Project**: {name} / Version / Date
- **Background and Purpose (배경 및 목적)**: ...
- **Expected Benefits (기대 효과)**: ...

## 2. Stakeholders (이해관계자)
| Role | Person/Team | Responsibility |
|------|-------------|----------------|

## 3. Requirements (요구사항 목록)
### Functional Requirements (기능 요구사항)
| ID | Requirement | Priority | Note |
|----|-------------|----------|------|
| FR-001 | ... | P0 | |

### Non-Functional Requirements (비기능 요구사항)
| ID | Requirement | Criteria |
|----|-------------|----------|
| NFR-001 | Response time | < 200ms |

## 4. Scope Definition (범위 정의)
- **In-Scope**: ...
- **Out-of-Scope**: ...
- **MVP vs Full**: ...

## 5. Constraints and Assumptions (제약사항 및 가정)

## 6. Related Systems (연관 시스템)

## 7. Success Metrics (성공 지표)
| KPI | Measurement | Target |
|-----|-------------|--------|
```

---

## Stage 2: Design (설계 단계)

Create detailed design documents based on Stage 1 requirements. This stage produces the most artifacts. Users can selectively generate only the documents they need.

Present the menu to users:

```
"Analysis is complete. The following design documents can be generated:
(분석 완료. 다음 설계 문서를 작성할 수 있습니다:)
1. Event Scenario (이벤트 시나리오)
2. Requirements Definition (요구사항 정의서)
3. Functional Specification (기능 정의서)
4. UI Specification (화면 기획서)
5. Sequence Diagram (시퀀스 다이어그램)
6. ERD
7. Process Definition (프로세스 정의서)
8. Policy Definition (정책 정의서)
9. User Guide (사용자 가이드)
All of them, or specific ones? (전부 또는 특정 문서 선택?)"
```

### 2-1. Event Scenario (이벤트 시나리오)

Define user actions and system responses at the event level.
사용자 행동과 시스템 반응을 이벤트 단위로 정의한다.

```markdown
# {기능명} 이벤트 시나리오

## 시나리오 1: {시나리오명}
| 순서 | 액터 | 이벤트 | 시스템 반응 | 비고 |
|------|------|--------|-------------|------|
| 1 | 사용자 | {행동} | {반응} | |
| 2 | 시스템 | {트리거} | {처리} | |

### 예외 시나리오
| 조건 | 시스템 반응 |
|------|-------------|
| {에러 조건} | {에러 처리} |
```

### 2-2. Requirements Definition (요구사항 정의서)

Detail the requirements list from the analysis stage. 각 요구사항에 대해 입력/출력, 비즈니스 룰, 인수 조건을 명시한다.

```markdown
# {기능명} 요구사항 정의서

## FR-001: {요구사항명}
- **설명**: 상세 설명
- **입력**: 입력 데이터/조건
- **출력**: 기대 결과
- **비즈니스 룰**: 적용 규칙
- **인수 조건**: 완료 판정 기준
- **우선순위**: P0/P1/P2
- **연관 요구사항**: FR-002, NFR-001
```

### 2-3. Functional Specification (기능 정의서)

Define system functions at the module/component level.

```markdown
# {기능명} 기능 정의서

## 모듈: {모듈명}

### 기능 1: {기능명}
- **기능 ID**: FN-001
- **설명**: 기능 상세
- **선행 조건**: 이 기능이 동작하기 위한 전제
- **후행 조건**: 기능 수행 후 시스템 상태
- **처리 로직**: 핵심 비즈니스 로직
- **입력 파라미터**: 파라미터 목록 및 타입
- **출력**: 반환값/상태변경
- **에러 처리**: 예외 상황별 대응
- **연관 요구사항**: FR-001
```

### 2-4. UI Specification (화면 기획서)

Define layout, components, and interactions per UI screen.

```markdown
# {기능명} 화면 기획서

## 화면 목록
| 화면 ID | 화면명 | URL/라우트 | 비고 |
|---------|--------|-----------|------|
| SCR-001 | {화면명} | /path | |

## SCR-001: {화면명}

### 레이아웃
(ASCII 또는 설명으로 와이어프레임 표현)

### 구성 요소
| 요소 | 타입 | 설명 | 동작 |
|------|------|------|------|
| 검색바 | Input | 키워드 입력 | 입력 후 엔터 시 검색 실행 |

### 인터랙션
- 로딩 상태: 스켈레톤 UI 표시
- 에러 상태: 에러 메시지 + 재시도 버튼
- 빈 상태: 안내 메시지 표시

### Responsive Design (반응형 대응)
- Desktop: ...
- Mobile: ...

### Frontend Framework (프론트엔드 프레임워크)
- **Framework**: Vue.js / React (specify which)
- **State management**: Vuex or Pinia (Vue) / Redux or Zustand (React)
- **Routing**: Vue Router / React Router
- **Component library**: {if any}
```

### 2-5. Sequence Diagram (시퀀스 다이어그램)

Represent key functional flows as Mermaid sequence diagrams.

```markdown
# {기능명} 시퀀스 다이어그램

## 시나리오 1: {시나리오명}

​```mermaid
sequenceDiagram
    actor User
    participant Frontend as Frontend (Vue.js / React)
    participant Backend as Next.js Backend
    participant DB as MySQL
    participant MQ as RabbitMQ
    participant External as 카카오톡 API

    User->>Frontend: {행동}
    Frontend->>Backend: API 호출
    Backend->>DB: 데이터 조회/저장
    Backend->>MQ: 이벤트 발행
    MQ->>External: 외부 서비스 호출
    External-->>MQ: 응답
    MQ-->>Backend: 결과 전달
    Backend-->>Frontend: 응답
    Frontend-->>User: 화면 업데이트
​```
```

시퀀스 다이어그램은 아메바톡 기술스택의 실제 컴포넌트명(Vue.js/React, Next.js, MySQL, RabbitMQ)을 participant로 사용한다. 해당 서비스의 프론트엔드 프레임워크에 맞춰 표기한다.

### 2-6. ERD (Entity Relationship Diagram)

Define database entity relationships with Mermaid erDiagram and generate SQL DDL as a separate file.

```markdown
# {기능명} ERD

## ER 다이어그램

​```mermaid
erDiagram
    TABLE_A ||--o{ TABLE_B : "has many"
    TABLE_A {
        bigint id PK
        varchar name
        datetime created_at
    }
​```

## 테이블 정의

### {table_name}
| 컬럼 | 타입 | NULL | 기본값 | 설명 |
|-------|------|------|--------|------|
| id | BIGINT | NO | AUTO_INCREMENT | PK |
| created_at | DATETIME | NO | CURRENT_TIMESTAMP | 생성일시 |
| updated_at | DATETIME | NO | CURRENT_TIMESTAMP ON UPDATE | 수정일시 |

## 마이그레이션 노트
- 기존 테이블 변경사항
- 데이터 마이그레이션 필요 여부
```

SQL DDL은 `{feature}-schema.sql` 파일로 별도 생성한다.

### 2-7. Process Definition (프로세스 정의서)

Define core business processes step by step. 시퀀스 다이어그램이 기술적 흐름이라면, 프로세스 정의서는 비즈니스 관점의 흐름이다.

```markdown
# {기능명} 프로세스 정의서

## 프로세스 1: {프로세스명}
- **프로세스 ID**: PRC-001
- **목적**: 이 프로세스가 달성하는 것
- **시작 조건**: 프로세스 트리거
- **종료 조건**: 완료 판정

### 처리 단계
| 단계 | 담당 | 행동 | 입력 | 출력 | 분기 조건 |
|------|------|------|------|------|-----------|
| 1 | 시스템 | {처리} | {데이터} | {결과} | |
| 2 | 사용자 | {판단} | | | 조건 A → 3, 조건 B → 4 |

### 예외 처리
| 예외 | 발생 단계 | 처리 방안 |
|------|-----------|-----------|
| {예외 상황} | 단계 2 | {대응} |
```

### 2-8. Policy Definition (정책 정의서)

Define business policies and rules required for feature operation.

```markdown
# {기능명} 정책 정의서

## 정책 1: {정책명}
- **정책 ID**: POL-001
- **목적**: 이 정책이 필요한 이유
- **적용 범위**: 어디에 적용되는가
- **규칙**:
  - 규칙 1: {조건} → {결과}
  - 규칙 2: {조건} → {결과}
- **예외**: {예외 상황 및 처리}
- **변경 이력**: 날짜, 변경 내용, 사유

## 공통 정책
- 데이터 보존 기간: {기간}
- 권한 정책: {역할별 접근 권한}
- Rate Limiting: {제한 기준}
```

### 2-9. User Guide (사용자 가이드)

User manual for end-users or administrators.

```markdown
# {기능명} 사용자 가이드

## 시작하기
- 접근 방법
- 필요 권한

## 기본 사용법
### {기능 A} 사용하기
1. 단계별 설명
2. 스크린샷/화면 설명 위치 표시
3. 주의사항

## 자주 묻는 질문 (FAQ)
| 질문 | 답변 |
|------|------|
| {질문} | {답변} |

## 문제 해결
| 증상 | 원인 | 해결 방법 |
|------|------|-----------|
| {증상} | {원인} | {해결} |
```

---

## Stage 3: Implementation (구현 단계)

Create development plans based on design documents and manage tasks via GitHub Projects. Each WBS task becomes a GitHub Issue.

### 3-1. Development Plan (개발계획서)

```markdown
# {Feature Name} — Development Plan ({기능명} 개발계획서)

## 1. Overview (개요)
- **Project** / Development period / Team members
- **Scope**: References to design documents
- **GitHub Project**: {project-board-url}

## 2. Technical Architecture (기술 아키텍처)
- System architecture diagram
- Tech stack: Vue.js / React / Next.js / MySQL / RabbitMQ
- New libraries/tools to introduce

## 3. Development Environment (개발 환경)
- Dev / Staging / Production configuration
- **Branch strategy**: Git Flow
  - `main` — production
  - `develop` — integration
  - `feature/{issue-number}-{description}` — per-task branches
- **CI/CD pipeline**: ...

## 4. Schedule Summary (개발 일정)
| Phase | Duration | Deliverable | Milestone |
|-------|----------|-------------|-----------|
| Environment setup | {period} | Dev environment | |
| Core features (P0) | {period} | P0 functions | MVP |
| Additional features (P1) | {period} | P1 functions | |
| Stabilization & QA | {period} | Test reports | Release |

## 5. Risk Management (리스크 관리)
| Risk | Impact | Mitigation |
|------|--------|-----------|

## 6. Communication Plan (커뮤니케이션)
- KR-VN team communication method
- Code review process
- Daily/weekly meeting schedule
```

### 3-2. WBS (Work Breakdown Structure)

Each task maps to a **GitHub Issue** and is tracked on the **GitHub Project board**.
WBS의 각 태스크는 **GitHub Issue**로 생성되고 **GitHub Project 보드**에서 추적된다.

```markdown
# {Feature Name} — WBS

## Task List (태스크 목록)

| ID | Task | Assignee | Depends On | Effort | GitHub Issue | Branch | Status |
|----|------|----------|------------|--------|-------------|--------|--------|
| T-001 | {task description} | {person} | - | {n}d | #{num} | feature/{num}-{desc} | Backlog |
| T-002 | {task description} | {person} | T-001 | {n}d | #{num} | feature/{num}-{desc} | Backlog |
| T-003 | {task description} | {person} | T-001 | {n}d | #{num} | feature/{num}-{desc} | Backlog |

## Milestones (마일스톤)
| Milestone | Completion Criteria | Target Date | GitHub Milestone |
|-----------|-------------------|-------------|-----------------|
| MVP Complete | T-001~T-005 done | {date} | {milestone-url} |

## GitHub Project Board
- **Board URL**: {github-project-url}
- **Columns**: Backlog → In Development → In Review → Testing → Done
```

WBS can also be generated as `.xlsx` — if requested, reference `/mnt/skills/public/xlsx/SKILL.md`.

When generating WBS, also generate GitHub Issue bodies for each task using the template defined in the "GitHub Integration" section above.

### 3-3. Task Plan (태스크 작업계획서)

WBS의 각 태스크를 상세화한다. Each task plan links to its GitHub Issue.

```markdown
# Task Plan: T-001 {Task Name} (태스크 작업계획서)

## Basic Information (기본 정보)
- **Task ID**: T-001
- **GitHub Issue**: #{issue-number}
- **Branch**: `feature/{issue-number}-{description}`
- **Assignee**: {person}
- **Estimated effort**: {n} days
- **Depends on**: T-000 (#{preceding-issue})

## Task Description (작업 내용)
- Module/feature to implement
- **Reference docs**: Functional spec FN-001, Sequence diagram Scenario 1

## Implementation Plan (구현 계획)
1. {Sub-task 1}
2. {Sub-task 2}
3. {Sub-task 3}

## Impact Scope (영향 범위)
- Files/modules to change
- DB changes (if any)

## Acceptance Criteria (완료 조건)
- [ ] Unit tests pass
- [ ] Code review approved
- [ ] PR merged to `develop`
- [ ] GitHub Issue closed
```

### 3-4. Task Report (태스크 작업리포트)

Written after implementation is complete. Links back to GitHub PR and Issue.
구현 완료 후 작성한다.

```markdown
# Task Report: T-001 {Task Name} (태스크 작업리포트)

## Basic Information (기본 정보)
- **Task ID**: T-001
- **GitHub Issue**: #{issue-number}
- **PR**: #{pr-number}
- **Assignee**: {person}
- **Planned effort**: {n}d → **Actual effort**: {m}d
- **Status**: Complete

## Implementation Summary (구현 내용)
- What was actually implemented
- Deviations from plan and reasons

## Changes (변경 사항)
- Changed files list
- DB migration details
- **Commit history**: {commit-range or PR link}

## Issues Encountered (이슈 및 해결)
| Issue | Cause | Resolution | Related GitHub Issue |
|-------|-------|------------|---------------------|

## Remaining Items (잔여 사항)
- Incomplete items (if any) → create follow-up GitHub Issue
- Required follow-up actions
```

---

## Stage 4: Unit Test (단위테스트 단계)

Write test cases per task/feature and execute unit tests. Test failures are tracked as GitHub Bug Issues.
각 태스크/기능 단위로 테스트 케이스를 작성하고 테스트를 수행한다. 실패한 테스트는 GitHub Bug Issue로 등록한다.

### 4-1. Test Cases (테스트 케이스)

```markdown
# {기능명} 테스트 케이스

## 테스트 범위
- 대상 태스크: T-001, T-002, ...
- 참조 문서: 요구사항 정의서, 기능 정의서

## 테스트 케이스 목록

### TC-001: {테스트명}
- **연관 요구사항**: FR-001
- **사전 조건**: {테스트 전 준비 상태}
- **테스트 단계**:
  1. {행동 1}
  2. {행동 2}
- **기대 결과**: {예상 결과}
- **테스트 데이터**: {필요한 테스트 데이터}
- **우선순위**: 상/중/하

### TC-002: {예외 케이스 테스트}
- **연관 요구사항**: FR-001
- **사전 조건**: {에러 조건 설정}
- **테스트 단계**:
  1. {에러 유발 행동}
- **기대 결과**: {에러 메시지 또는 폴백 동작}

## 테스트 환경
- 환경: 스테이징 / 로컬
- 테스트 데이터 준비 방법
```

### 4-2. Unit Test Report (단위 테스트 리포트)

```markdown
# {기능명} 단위 테스트 리포트

## 테스트 요약
- 실행일: {날짜}
- 전체 케이스: {n}건
- 성공: {n}건 / 실패: {n}건 / 스킵: {n}건
- 통과율: {n}%

## 결과 상세

| TC ID | 테스트명 | 결과 | 비고 |
|-------|----------|------|------|
| TC-001 | {테스트명} | ✅ PASS | |
| TC-002 | {테스트명} | ❌ FAIL | {실패 원인 요약} |

## 실패 분석
### TC-002 실패 상세
- **기대 결과**: {기대}
- **실제 결과**: {실제}
- **원인 분석**: {원인}
- **수정 계획**: {대응}

## 종합 판정
- [ ] 단위 테스트 통과 (통과율 95% 이상)
- [ ] 크리티컬 버그 없음
- [ ] 다음 단계 진행 가능
```

---

## Stage 5: Final Test (최종테스트 단계)

Verify all features in an integrated state through end-to-end scenario testing. Issues found are tracked as GitHub Bug Issues with `severity:critical` or `severity:major` labels.
모든 기능이 통합된 상태에서 전체 시나리오 검증을 수행한다.

### 5-1. Integration Test Plan (통합 테스트 계획서)

```markdown
# {기능명} 통합 테스트 계획서

## 테스트 목표
- 전체 기능 통합 동작 확인
- 기존 기능 영향도 검증 (리그레션)
- 성능/부하 기준 검증

## 테스트 범위
- 통합 시나리오: 이벤트 시나리오 기반 End-to-End 테스트
- 리그레션: 기존 기능 영향 검증
- 성능: NFR 기준 충족 여부

## 통합 테스트 시나리오

### ITC-001: {End-to-End 시나리오}
- **기반 문서**: 이벤트 시나리오 시나리오 1
- **사전 조건**: {통합 환경 준비}
- **테스트 단계**: (이벤트 시나리오의 전체 흐름 수행)
- **검증 포인트**: 각 단계별 시스템 상태 확인
- **채널 검증**: 카카오톡 / 네이버톡톡 / 인스타그램 DM 각각 테스트

## 테스트 일정
| 항목 | 기간 | 담당 |
|------|------|------|
| 테스트 환경 구성 | {기간} | {담당} |
| 통합 시나리오 테스트 | {기간} | {담당} |
| 리그레션 테스트 | {기간} | {담당} |
| 버그 수정 및 재테스트 | {기간} | {담당} |
```

### 5-2. Final Test Report (최종 테스트 리포트)

```markdown
# {기능명} 최종 테스트 리포트

## 테스트 요약
- 실행 기간: {시작일} ~ {종료일}
- 통합 시나리오: {n}건 — 성공 {n} / 실패 {n}
- 리그레션: {n}건 — 성공 {n} / 실패 {n}
- 성능 테스트: {통과/미달}

## 결과 상세

### 통합 시나리오 결과
| ITC ID | 시나리오 | 결과 | 비고 |
|--------|----------|------|------|
| ITC-001 | {시나리오} | ✅ PASS | |

### 리그레션 결과
| 영역 | 테스트 수 | 통과 | 실패 |
|------|-----------|------|------|
| {기존 기능 A} | {n} | {n} | {n} |

### 잔여 이슈
| 이슈 | 심각도 | 상태 | 대응 |
|------|--------|------|------|
| {이슈} | Critical/Major/Minor | Open/Resolved | {대응} |

## 릴리즈 판정
- [ ] 전체 통합 시나리오 통과
- [ ] 크리티컬/메이저 버그 0건
- [ ] 성능 기준 충족
- [ ] 릴리즈 승인 → 배포 진행
```

---

## Document Traceability / 문서 간 연결

When running sequentially, each stage's artifacts become the input for the next stage. GitHub Issues provide execution-level traceability, and Redmine provides project management-level traceability.

```
Requirements Analysis FR-001
  → Requirements Definition: FR-001 detailed
  → Functional Spec: FN-001 implementation spec
  → Sequence Diagram: FN-001 technical flow
  → ERD: tables used by FN-001
  → WBS: T-001 task
    → GitHub Issue #{gh-n} + Redmine Issue RM-{rm-n}
    → Branch: feature/{gh-n}-{description}
    → PR: #{pr-n} → Code Review → Merge
    → Redmine: RM-{rm-n} → Resolved (100%) + time logged
    → Redmine Gantt chart auto-updated
  → Test Case: TC-001 verification
  → Integration Test: ITC-001 end-to-end
  → Bug found → GitHub #{bug-n} [BUG] + Redmine RM-{bug-rm}
    → Branch: bugfix/{bug-n}-{description}
    → Fix → Retest → Close on both systems
```

Maintain consistent ID references across all documents. GitHub Issue numbers serve as the code-level link, Redmine Issue IDs serve as the project management-level link.
모든 문서에서 ID 참조를 일관되게 사용한다. GitHub Issue = 코드 레벨 링크, Redmine Issue = 프로젝트 관리 레벨 링크.

---

## Writing Guidelines / 작성 가이드라인

### Language Rules (언어 규칙)
- **English-first, Korean-annotated** — Follow the Bilingual Writing Convention section above
- Section headers: `## 1. Overview (개요)`
- Table headers: English only
- Code/SQL/API: English only
- Filenames: English only
- GitHub commit messages & issue titles: English

### Tone and Style
- Concise and clear. Remove unnecessary modifiers
- Code examples should be production-ready level
- Consistent ID system: FR (requirements), FN (function), SCR (screen), PRC (process), POL (policy), T (task), TC (test case), ITC (integration test)

### AmoebaTalk-Specific Considerations
Naturally reflect these AmoebaTalk characteristics in all documents:
- Multi-channel messaging (KakaoTalk, Naver TalkTalk, Instagram DM, LINE, etc.)
- Real-time communication (WebSocket / RabbitMQ)
- KR-VN distributed development team (한국-베트남 분산 개발)
- E-commerce platform integrations (Cafe24, Shopify, etc.)
- Multi-tenancy architecture

### File Generation Rules
- Long documents (100+ lines): work in `/home/claude/`, copy to `/mnt/user-data/outputs/`
- SQL files: generate separately from markdown documents
- WBS as Excel: reference `/mnt/skills/public/xlsx/SKILL.md`
- PPT: reference `/mnt/skills/public/pptx/SKILL.md`
- Mermaid diagrams: embed as code blocks within markdown
- GitHub Issue templates: generate as separate `.md` files in `.github/ISSUE_TEMPLATE/`

### GitHub Integration Rules
- Every WBS task → GitHub Issue with proper labels and milestone
- Bug found during testing → GitHub Bug Issue with severity label
- Feature request → GitHub Feature Issue with priority label
- Enhancement → GitHub Enhancement Issue
- Branch per issue: `feature/`, `bugfix/`, `enhance/` prefix convention
- PR links back to Issue: "Closes #{issue-number}"
