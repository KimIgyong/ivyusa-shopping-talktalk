# BTBZ Dev Kit — 아메바컴퍼니 개발 표준 킷

> **버전**: 1.0 (2026-07-30)
> **기반**: AMB Management(AMA) 프로젝트 실구현 경험 (도메인 모듈 53개, 엔티티 240개, 스테이징+프로덕션 100회+ 배포)
> **대상**: 아메바컴퍼니 신규 프로젝트 (BTBZ 및 이후 프로젝트)

---

## 1. 이 킷의 목적

AMA 프로젝트를 진행하며 **선택하고 결정한 사항, 실제로 겪은 장애와 함정, 검증된 패턴**을 신규 프로젝트가 그대로 재사용할 수 있도록 패키지화한 문서 모음이다.

기존 표준 문서(spec/CODE-CONVENTION.md v2.1, spec/DEVELOPMENT-STANDARD-PACKAGE.md v1.1)와 다른 점:

1. **표준↔실구현 불일치 정정 반영** — 「Amoeba 개발표준 V2 추천안」(2026-06-14) 진단에서 확인된 정정 8건(페이지네이션 필드명, 에러코드 범위, 데코레이터 명칭, synchronize 정책 등)을 표준에 반영했다.
2. **실전 교훈 내장** — 문서상 규칙이 아니라 실제 장애(스테이징 502, 프로덕션 500, AI 전역 중단 등)에서 도출된 재발 방지 패턴을 각 표준의 해당 위치에 배치했다.
3. **AI 에이전트(Claude) 협업 문서 포함** — CLAUDE.md 템플릿, 메모리 운영, 스킬 작성, spec 문서 체계 등 Claude Code 기반 개발 워크플로우를 처음부터 세팅할 수 있다.

## 2. 문서 맵

| 문서 | 내용 | 언제 읽는가 |
|------|------|------------|
| [01-code-convention.md](01-code-convention.md) | 코드 컨벤션 v3.0 — 구조, 네이밍, 백엔드/프론트엔드 패턴, 보안 | 코드 작성 전 필독 |
| [02-development-standard.md](02-development-standard.md) | 개발 표준 — 기술 스택, 아키텍처, DB/API 설계, 멀티테넌시, AI 통합, 프로젝트 부트스트랩 | 프로젝트 시작 시 |
| [03-git-collaboration-standard.md](03-git-collaboration-standard.md) | Git·PR·브랜치 표준 + 실전 협업 규칙 | 첫 PR 전 |
| [04-deployment-operations.md](04-deployment-operations.md) | 배포·운영 표준 — 배포 스크립트, 수동 마이그레이션, 배포 검증, Docker 운영 | 첫 배포 전 필독 |
| [05-lessons-learned.md](05-lessons-learned.md) | 실전 교훈 카탈로그 — 장애/함정 사례와 재발 방지 패턴 (ADR 포함) | 수시 참조, 디버깅 시 |
| [claude/CLAUDE.md.template](claude/CLAUDE.md.template) | 신규 프로젝트 CLAUDE.md 템플릿 (placeholder 치환용) | 프로젝트 초기화 시 |
| [claude/memory-guide.md](claude/memory-guide.md) | Claude 메모리 운영 가이드 — 파일 구조, 타입, 작성 규칙 | AI 협업 세팅 시 |
| [claude/skills-guide.md](claude/skills-guide.md) | Claude 스킬 작성 가이드 + 검증된 스킬 템플릿 2종 | AI 협업 세팅 시 |
| [claude/spec-guide.md](claude/spec-guide.md) | spec/docs 문서 체계 가이드 — REQ/PLN/TCR/RPT/FIX 워크플로우 | 프로젝트 초기화 시 |

## 3. 신규 프로젝트 적용 순서

```
1. 프로젝트 초기화
   ├─ 02-development-standard.md §9 부트스트랩 체크리스트 실행
   ├─ claude/CLAUDE.md.template → 루트 CLAUDE.md 생성 (placeholder 치환)
   └─ claude/spec-guide.md 기준 docs/ 디렉터리 구조 생성

2. AI 협업 세팅
   ├─ claude/memory-guide.md 기준 메모리 디렉터리 초기화
   └─ claude/skills-guide.md 기준 .claude/skills/ 스킬 2종 설치
      (pre-deploy-check, branch-protection-check — 경로/서버명만 치환)

3. 개발 시작
   ├─ 01-code-convention.md 준수 (특히 §3.4 TypeORM 필수 규칙)
   └─ 03-git-collaboration-standard.md 준수 (스키마 PR은 ## Migration 섹션 필수)

4. 첫 배포 전
   └─ 04-deployment-operations.md 전체 숙지 (배포 검증 절차 포함)
```

## 4. 표기 규칙

- `{prj}` — 프로젝트 약어 (AMA는 `amb`, BTBZ는 `btbz` 등). DB 테이블 prefix, npm 스코프(`@{prj}/api`), localStorage 키 등에 사용.
- `{domain}` — 서비스 도메인 (AMA는 `amoeba.site`).
- 규칙 수준: **MUST**(위반 시 머지 차단) / **SHOULD**(권장) / **MAY**(선택).
- ⚠️ 표시는 AMA에서 **실제 장애 또는 반복 함정**으로 확인된 항목이다. 우선 준수 대상.

## 5. 유지보수

- 이 킷은 프로젝트 경험이 쌓일 때마다 갱신한다. 신규 장애/함정이 확인되면 `05-lessons-learned.md`에 사례를 추가하고, 일반화 가능한 규칙은 해당 표준 문서로 승격한다.
- 표준과 실제 코드가 어긋나면 **어느 쪽이 정답인지 판정 후 한쪽을 고친다**(방치 금지). AMA V2 진단의 §4 정정 목록 방식을 따른다.
