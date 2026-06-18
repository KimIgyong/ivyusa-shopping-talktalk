---
document_id: CHATWIDGET-BOOTSTRAP-1.0.0
version: 1.0.0
status: Draft
created: 2026-06-15
updated: 2026-06-15
author: Project Team
reviewers: []
base_documents:
  - CHATWIDGET-RBAC-1.0.0
  - CHATWIDGET-ERD-1.0.0
change_log:
  - version: 1.0.0
    date: 2026-06-15
    author: Project Team
    description: Initial bootstrap seed (admin, master, tenant ivyusa) + user invitation & temporary-password flow; FR-062, FR-063, POL-018
---

# IVY TalkTalk — Bootstrap Seed & User Invitation (초기 세팅·유저 초대)

최초 설치 시 시드 계정/테넌트와 유저 초대(임시비밀번호) 흐름을 정의한다.

## 1. Seed Accounts (시드 계정 — FR-062)

| Group | Role | Login | Initial Password | Note |
|-------|------|-------|------------------|------|
| System Admin | Admin | admin@amoeba.group | amb2026!@ | 플랫폼 운영 어드민 |
| Tenant User | Master (Owner) | dev@amoeba.group | amb2026!@ | 테넌트 `ivyusa` 소유자 |

- **Tenant**: code/name = **ivyusa** (초기 단일 테넌트).
- **Master(dev@amoeba.group)** 는 테넌트 `ivyusa`의 owner로, 외부연동·유저·등급·라벨·AI/지식 설정 권한(FR-060).

> ⚠️ **보안 주의**: 위 비밀번호는 **초기 시드(개발/온보딩)** 용. 운영 전 (1) 최초 로그인 시 변경 강제, (2) DB에는 **bcrypt 해시**로만 저장(평문 금지), (3) 운영 비밀번호/시크릿은 secret manager·env로 관리, (4) 2단계 인증 권장. (POL-018)

## 2. User Invitation & Temporary Password (유저 초대·임시비번 — FR-063)

```mermaid
sequenceDiagram
    actor MST as Master
    participant APP as IVY TalkTalk
    participant ML as Email
    actor U as Invited User
    MST->>APP: 유저 등록(이메일, 직급, 라벨) (SCR-207)
    APP->>APP: create user(status=invited) + temp password(hash) + expiry
    APP->>ML: 임시 비밀번호 메일 발송
    ML-->>U: 임시 비밀번호 수신
    U->>APP: 최초 로그인(이메일 + 임시비번)
    APP->>APP: verify temp pw + check must_change_password
    APP-->>U: 비밀번호 변경 화면(강제)
    U->>APP: 새 비밀번호 설정
    APP->>APP: store hash; must_change_password=0; status=active
    APP-->>U: 로그인 완료(권한별 메뉴)
```

### Rules (규칙)
- Master가 이메일·직급·라벨로 유저 등록 → 시스템이 **임시 비밀번호 생성·메일 발송**.
- 임시 비밀번호 **유효기간 [TBD, 기본 72시간]**; 만료 시 재발송.
- 초대 유저 최초 로그인: 임시비번 인증 → **사용할 비밀번호로 변경(강제)** → 활성화.
- 비밀번호 정책: 최소 길이/복잡도(영문+숫자+특수, [TBD]); bcrypt 해시 저장; 평문 미저장(POL-018).
- 시스템 어드민(admin@amoeba.group)도 동일 강제 변경 권장.

## 3. Schema Additions (스키마 추가)

| Table/Column | 설명 |
|--------------|------|
| `admin_users.password_hash`, `must_change_password` | 어드민 인증 |
| `users.password_hash`, `must_change_password`, `invited_at`, `status(invited/active/suspended)` | 유저 인증·초대 상태 |
| `invitations` | 초대 레코드: tenant_id, email, rank, token, temp_password_hash, status(pending/accepted/expired), expires_at, created_by |

DDL은 `chat-widget-schema.sql`(Bootstrap & Invitation 섹션) 참조. 시드 INSERT는 **해시 자리표시자**로 제공(평문 미기재).

## 4. Acceptance (인수 조건)
- 시드 계정 2종 + 테넌트 `ivyusa` 생성 후 로그인 가능.
- 초대 유저는 임시비번 1회 사용 후 반드시 비밀번호 변경.
- 비밀번호는 해시 저장, 만료/강제변경 동작.

**Related**: FR-062, FR-063, FR-059, FR-060 · POL-001, POL-018 · SCR-207.
