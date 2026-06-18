---
document_id: CHATWIDGET-RBAC-1.0.0
version: 1.0.0
status: Draft
created: 2026-06-15
updated: 2026-06-15
author: Project Team
reviewers: []
base_documents:
  - CHATWIDGET-REQDEF-2.0.0 (Requirements Definition)
  - CHATWIDGET-MULTITENANCY-1.0.0 (Multi-Tenancy Proposal)
change_log:
  - version: 1.0.0
    date: 2026-06-15
    author: Project Team
    description: Actors, role hierarchy, job labels, customer tiers, RBAC matrix; new FR-051~061; ERD delta; POL-017
---

# IVY TalkTalk — Actors, Roles & Access Control (액터·권한 정의 / RBAC)

요구사항에 **멀티테넌트(커스텀앱) 구조**와 **3개 액터 그룹의 권한 체계**를 추가 반영한다.
(Adds the multi-tenant deployment model and the access-control model of three actor groups to the requirements.)

## 0. Deployment Premise (배포 전제)

- **IVY USA TalkTalk는 ivyusa.com 전용 Custom app으로 개발**하되, **데이터 모델·권한·설정은 멀티테넌트 대응(tenant_id 전면 적용)** 으로 설계한다. 향후 Public app SaaS 전환 시 코드/스키마 변경 최소화. (FR-051; 상세 CHATWIDGET-MULTITENANCY.)
- 초기 운영 테넌트 = IVY USA 1개. 시스템 어드민이 신규 테넌트를 신청·승인·프로비저닝할 수 있다(FR-052).

---

## 1. Actor Groups (액터 그룹 — 3계층)

```
[1] System Admin Group (시스템 어드민)         ── 플랫폼/솔루션 전체 운영
      ├─ Super Admin (슈퍼어드민)
      └─ Admin (어드민)
[2] Tenant User Group (유저 — 테넌트 직원)      ── 한 테넌트 내부 운영
      ├─ Master (마스터)   ── 테넌트 최상위: 외부연동 API·설정, 유저 초대, 등급 조정, 라벨 수정, 테넌트 AI 설정
      ├─ Director (디렉터)
      ├─ Manager (매니저)
      └─ Staff (스텝)
          × Job Labels (직무 라벨, 다중 부여 / 수정은 Master): 상담 / 회계 / 운영
[3] Customer Group (고객 — 사이트 방문자)        ── 스토어프론트 위젯 사용
      ├─ Guest (비회원)
      ├─ Subscriber (구독회원 · 구독 이메일)
      └─ Regular (일반고객) → 이후 Shopify 내부 고객 등급 참조
          위젯 상태: Logged-out / Logged-in
```

- **권한 모델**: 유저 그룹의 유효 권한 = **직급(rank, 권한 수준) × 직무 라벨(job label, 기능 영역)**. 라벨은 직급과 직교(orthogonal)하며 다중 부여·이름 수정 가능.
- 시스템 어드민은 테넌트를 횡단(cross-tenant), 유저/고객은 자신의 테넌트 범위로 제한.

---

## 2. New Functional Requirements (신규 기능 요구사항)

| ID | Requirement | Priority | Note |
|----|-------------|----------|------|
| FR-051 | Custom-app deployment for ivyusa.com, **multi-tenant-ready** data/permission/config (tenant_id 전면) (커스텀앱·멀티테넌트 대응 설계) | P0 | 향후 Public app 전환 대비 |
| FR-052 | Tenant lifecycle: application → approval → provisioning → suspend/offboard (테넌트 신청·승인·프로비저닝·중지·오프보딩) | P1 | 시스템 어드민 기능 |
| FR-053 | **System Admin group** — Super Admin / Admin (2 levels): 솔루션 전체 기능·정책·외부연동 설정 관리 (시스템 어드민) | P0 | 플랫폼 레벨 |
| FR-054 | **Tenant User group** — Master / Director / Manager / Staff (4 ranks) (유저 직급). **Master = 테넌트 설정 관리 최상위**: 외부연동(Shopify/Odoo 등) API·자격증명·기타 설정, 유저 추가·초대, 직급(등급) 조정, 라벨 수정, 테넌트 AI 설정 기능 포함 | P0 | 테넌트 내부 |
| FR-055 | **Job labels** — 상담(Consult) / 회계(Accounting) / 운영(Operations), 다중 부여; **이름 수정·추가는 Master** (직무 라벨 편집) | P0 | rank와 직교 |
| FR-056 | **RBAC enforcement** — rank × label 기반 권한 매트릭스, 메뉴/액션/데이터 단위 접근제어 (권한 적용) | P0 | §3 매트릭스 |
| FR-057 | **Customer group & Shopify tier mapping** — Guest / Subscriber(구독이메일) / Regular → 이후 Shopify 내부 고객 등급 참조 (고객 그룹·등급 매핑) | P0 | 세그먼트·혜택 연계 |
| FR-058 | **Widget session states** — Logged-out / Logged-in, 고객 그룹별 가용 기능 분기 (위젯 로그인 상태) | P0 | FR-002·006 연계 |
| FR-059 | Admin user management — 시스템 어드민이 어드민/테넌트 유저 계정 생성·권한 부여·정지 (계정 관리) | P0 | 감사 로그 |
| FR-060 | Tenant-scoped configuration ownership — 테넌트별 기능 on/off·정책값·외부연동 자격증명(Shopify/Odoo/Klaviyo/Fulfillment/GDrive)·테넌트 AI 설정을 **Master**가 관리 (테넌트 설정 소유권) | P0 | FR-047·025 확장; Master 권한 |
| FR-061 | Audit log for privileged actions — 권한 변경·설정 변경·테넌트 승인 등 감사 기록 (권한 감사) | P1 | NFR-004·007 연계 |

신규 NFR: **NFR-012 RBAC 격리** — 테넌트 간/직무 간 권한 누수 방지, 최소권한 원칙, 권한 회귀 테스트 필수.

---

## 3. Permission Matrix (권한 매트릭스)

### 3.1 System Admin (시스템 어드민 · cross-tenant)

| Capability | Super Admin | Admin |
|------------|:----------:|:-----:|
| 테넌트 신청 승인/거부·프로비저닝 (FR-052) | ✅ | ✅ |
| 테넌트 중지/오프보딩(데이터 삭제) | ✅ | ⚠️ 승인 필요 |
| 어드민 계정 생성/권한 변경 (FR-059) | ✅ | ❌ |
| 글로벌 솔루션 기능·정책 설정 | ✅ | ✅(읽기/제안) |
| 외부 연동 글로벌 설정(Shopify/Klaviyo/Odoo/Fulfillment/GDrive 템플릿) | ✅ | ✅ |
| 과금/플랜 정의(향후 Public app) | ✅ | ❌ |
| 전 테넌트 모니터링·감사 로그 열람 (FR-061) | ✅ | ✅ |
| 플랫폼 파괴적 설정(데이터 초기화 등) | ✅ | ❌ |

### 3.2 Tenant User — Rank (유저 직급 · within tenant, 4 levels)

| Capability | Master | Director | Manager | Staff |
|------------|:------:|:-------:|:-------:|:-----:|
| 외부연동 API·자격증명(Shopify/Odoo/Klaviyo/Fulfillment/GDrive) (FR-060) | ✅ | ❌ | ❌ | ❌ |
| 테넌트 기타 설정(브랜드·정책값·기능 on/off) | ✅ | ⚠️ 제한 | ❌ | ❌ |
| 유저 추가·초대 | ✅ | ⚠️ 하위직급 | ❌ | ❌ |
| 직급(등급) 조정 | ✅ | ❌ | ❌ | ❌ |
| 직무 라벨 수정/추가 (FR-055) | ✅ | ❌ | ❌ | ❌ |
| 유저에 라벨 부여 | ✅ | ✅ | ⚠️ 팀 | ❌ |
| 테넌트 AI 설정(Bot/Rules/Knowledge/시나리오) (FR-047) | ✅ | ✅ | ✅ | ⚠️ 초안 |
| 지식 소스 관리(게시판·자료실·GDrive 업로드/내용관리/지정) (FR-064,065) | ✅ | ⚠️ 내용 | ❌ | ❌ |
| 유저 초대·임시비번 발송 (FR-063) | ✅ | ⚠️ 하위 | ❌ | ❌ |
| 대화 배정/이관 관리 | ✅ | ✅ | ✅ | ❌ |
| 상담 처리(실시간 채팅·핸드오프) | ✅ | ✅ | ✅ | ✅(배정분) |
| 분석 대시보드 열람 (FR-044) | ✅ | ✅ | ✅ | ⚠️ 본인 지표 |
| 캠페인 발송 (FR-040) | ✅ | ✅ | ✅ | ❌ |
| 감사 로그(테넌트 내) | ✅ | ✅ | ⚠️ | ❌ |

### 3.3 Job Labels — Functional Scope (직무 라벨 · rank와 직교, 다중/수정 가능)

| Module / Function | 상담 Consult | 회계 Accounting | 운영 Operations |
|-------------------|:-----------:|:---------------:|:---------------:|
| 실시간 채팅·에스컬레이션·AI 브리핑 (FR-017,045) | ✅ | — | — |
| 주문 결제/환불·재무 리포트 (FR-012, 회계) | — | ✅ | — |
| 주문/배송·상품/재고·재입고 (FR-010,011,031,036,048) | — | — | ✅ |
| 알림/캠페인·리뷰 (FR-024,040,034) | — | — | ✅ |
| 상담 이력 열람 (FR-046) | ✅ | ⚠️(재무 관련) | ⚠️(운영 관련) |

> 유효 권한 = **직급 매트릭스 ∩ 라벨 매트릭스**. 예) "Manager + 상담" = 채팅 관리·처리 가능, 회계/운영 모듈 불가. 라벨 이름 변경·추가는 Master(FR-055); 유저에 라벨 부여는 Master/Director.

### 3.4 Customer Group (고객 그룹 · 스토어프론트)

| Tier | 위젯 상태 | 가용 기능 |
|------|----------|-----------|
| Guest (비회원) | Logged-out | 비개인 FAQ·상품문의(RAG), 게스트 주문조회(주문번호+이메일), 알림센터(비개인) |
| Subscriber (구독회원·구독이메일) | Logged-out/in | Guest 기능 + 구독회원 쿠폰·혜택 알림(FR-037), 구독 관리(로그인 시) |
| Regular (일반고객) | Logged-in | 전체 개인 기능(주문상태·배송·취소환불·리뷰·내 문의), 개인화 헤더(FR-050) |
| (Shopify 내부 등급) | Logged-in | Regular + 등급별 세그먼트·혜택(캠페인 타겟팅, FR-040) |

- 개인 데이터 접근은 항상 Auth Gate(FR-006~009) 통과. Guest→Regular 전환은 Shopify 계정/소셜 로그인 또는 게스트 주문조회로.
- 고객 등급은 **Shopify customer tier를 source of truth로 참조**(자체 중복 정의 금지).

---

## 4. ERD Delta (데이터 모델 추가)

신규/변경 테이블 (전 테넌트 데이터 테이블에 `tenant_id` 추가):

| Table | 설명 | 핵심 컬럼 |
|-------|------|-----------|
| `tenants` | 테넌트(상점) 마스터 | id, shop_domain, status(applied/active/suspended), plan, created_at |
| `admin_users` | 시스템 어드민 | id, email, level(super_admin/admin), status |
| `users` | 테넌트 유저(직원) | id, tenant_id, email, rank(master/director/manager/staff), status |
| `job_labels` | 직무 라벨(테넌트별, 수정가능) | id, tenant_id, code(consult/accounting/operations), name |
| `user_job_labels` | 유저-라벨 N:M | user_id, job_label_id |
| `roles_permissions` | rank×label 권한 정의(시드+커스텀) | id, scope, rank, label, capability, allow |
| `integration_credentials` | 테넌트별 외부연동 자격증명(암호화) | id, tenant_id, provider, secret_enc, status |
| `audit_logs` | 권한/설정/승인 감사 | id, tenant_id, actor_type, actor_id, action, target, created_at |
| `customers`(변경) | 고객 등급 매핑 | + tenant_id, tier(guest/subscriber/regular), shopify_tier |

`tenant_id`는 sessions·conversations·messages·orders_cache·notifications·reviews·affiliates·subscriptions·kb_documents·campaigns·cjm_events 등 전 테이블에 추가(멀티테넌트 격리, NFR-008/NFR-012).

---

## 5. Policy (정책 추가)

**POL-017: Access Control & Tenant Isolation (접근제어·테넌트 격리)**
- 목적: 최소권한·테넌트/직무 격리.
- 규칙: R1 시스템 어드민만 cross-tenant; R2 유저/고객은 자기 테넌트 범위; R3 유효권한=rank∩label; R4 **테넌트 설정·외부연동·라벨 수정·직급 조정·유저 초대·AI 설정은 Master**; R5 권한·설정 변경은 감사 기록(FR-061); R6 고객 등급은 Shopify 참조; R7 권한 누수 회귀 테스트 필수(NFR-012).
- 예외: SuperAdmin 파괴적 작업은 2차 확인.

---

## 6. Impact / Cross-References (영향·연계)

- **요구사항 정의서**: 액터 목록·도메인에 본 문서 반영(섹션 P), FR-051~061 추가.
- **이벤트 시나리오**: 액터에 System Admin/User(rank·label)/Customer(tier) 구체화; S17(관리자)·S12(제휴)·S16(캠페인)에 권한 게이트 반영.
- **기능 정의서**: FN-040(AI Setting)·FN-041(고객/상품)·FN-046(이력)에 RBAC 체크 선행조건 추가.
- **ERD/스키마**: §4 테이블 + tenant_id 전면.
- **화면 정의서**: 시스템 어드민 콘솔(테넌트 승인·계정·글로벌 설정) 화면군 신설(SCR-201~), 유저 권한별 메뉴 가시성.
- **멀티테넌시 문서**: FR 번호 정합(051~ = 본 문서 기준).

## 6A. Visibility Layer — AMB ACL (소유자 기반 가시성 레이어)

기능 RBAC(직급×라벨)에 더해, 회사 표준 **AMB Access Control Policy**(`standards/amb-access-control-policy.md`)의 소유자 기반 가시성/공유를 **레이어로 병존** 적용(POL-019).

| ACL | Principle | 본 프로젝트 적용 |
|-----|-----------|------------------|
| ACL-010 | Owner-first (기본 private) | KB 초안·노트·리포트·AI 요약은 생성자 전용 기본 |
| ACL-011 | Explicit sharing | owner가 유저/팀에 명시 공유(read+) |
| ACL-012 | Hierarchical visibility | Master/Director/Manager → 하위 유저 작업물 read+comment(차단 불가) |
| ACL-020/021 | Comment auth/visibility | COMMENT 권한자 코멘트, 작업물 가시성 상속 |
| ACL-030/031 | AI native + ownership | AI는 트리거 유저 스코프로 동작, 생성물은 유저 소유(+FR-065 소스 한정) |
| ACL-050 | Central access check API | 표준 접근 체크 서비스로 판정 |
| ACL-070 | Audit logging | `audit_logs`(FR-061) |

- **유효 접근 = 기능 RBAC(rank∩label) ∩ 가시성(owner/공유/계층)**, 테넌트 경계 내(NFR-012).
- 데이터: 대상 테이블 `_visibility`(TENANT/TEAM/PRIVATE) + owner FK + `*_shares`. (코드 컨벤션 §4.3 준용.)

## 7. Traceability (추적성)
FR-051~061 → FN(신규 RBAC 모듈/기존 FN 권한 선행조건) → SCR(어드민 콘솔·권한별 메뉴) → TBL(§4) → T(WBS 신규) → TC(권한 매트릭스·격리 테스트).
