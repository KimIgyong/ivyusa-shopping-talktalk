# Amoeba Basic Privacy & Compliance v2

## Amoeba Company Standard Data Privacy & Compliance Guide (표준 개인정보보호·컴플라이언스 가이드)

> 신규 표준 문서. 기존 `amoeba_basic_SPEC_v2`(§15.5)·`amoeba_basic_skill_v2`(§17)의 개인정보보호 항목을 통합·확장하고, **CCPA/CPRA(미국)** 를 정식 포함한다. ID 규칙: `PRV-{3-digit}`. Level: MUST(강제)/SHOULD(권장)/GUIDE(안내).

---

## 1. Applicable Regulations (적용 법규)

| Regulation | Scope | Key obligations |
|------------|-------|-----------------|
| **PIPA** (Korea / 개인정보보호법) | 국내 서비스 | 동의·최소수집·정보주체 권리·파기 |
| **GDPR** (EU) | EU 이용자 | 합법 처리근거·DSAR·삭제권·DPO·국외이전·72h 침해통지 |
| **CCPA / CPRA** (US-California) | 미국/캘리포니아 소비자 | 고지·열람/삭제/정정·**판매·공유 거부(opt-out)**·민감정보 제한·비차별 |
| **PDPD** (Vietnam) | 베트남 서비스 | 동의·국외이전 신고·처리기록 |

> 서비스 대상 지역에 따라 중첩 적용. 미국 스토어(예: ivyusa.com)는 **CCPA/CPRA 필수**, EU 트래픽 시 GDPR 병행.

## 2. Core Principles (핵심 원칙)

| ID | Principle | Level |
|----|-----------|-------|
| PRV-001 | **Lawful basis & consent** (적법 근거·동의): 수집 전 고지·동의(필요 시), 목적 명시 | MUST |
| PRV-002 | **Data minimization** (최소 수집): 목적에 필요한 최소 항목만 | MUST |
| PRV-003 | **Purpose limitation** (목적 제한): 수집 목적 외 이용 금지 | MUST |
| PRV-004 | **Storage limitation** (보존 한정): 보존기간 명시·경과 시 파기/비식별 | MUST |
| PRV-005 | **Integrity & confidentiality** (보안): 암호화·접근통제·마스킹 | MUST |
| PRV-006 | **Accountability** (책임성): 처리기록·감사 로그·DPIA(고위험 시) | SHOULD |

## 3. Data Subject / Consumer Rights (정보주체·소비자 권리)

| ID | Right | GDPR | CCPA/CPRA | PIPA | Implementation |
|----|-------|:----:|:---------:|:----:|----------------|
| PRV-010 | Access/Know (열람) | ✅ | ✅ | ✅ | DSAR API/요청 처리 |
| PRV-011 | Delete (삭제) | ✅ | ✅ | ✅ | 삭제/비식별 + 백업 반영 |
| PRV-012 | Correct (정정) | ✅ | ✅ | ✅ | 수정 API |
| PRV-013 | **Opt-out of sale/sharing** (판매·공유 거부) | (objection) | ✅ | — | "Do Not Sell or Share My Personal Information" 링크/토글 |
| PRV-014 | Limit sensitive PI (민감정보 제한) | ✅ | ✅ | ✅ | 민감정보 별도 동의·제한 |
| PRV-015 | Portability (이동성) | ✅ | ✅ | △ | 기계판독 형식 export |
| PRV-016 | Non-discrimination (비차별) | — | ✅ | — | 권리행사 이유 불이익 금지 |
| PRV-017 | Processing suspension (처리정지) | ✅ | △ | ✅ | 처리정지 API |

- 요청 처리 기한: GDPR 1개월, CCPA 45일(연장 가능) 등 **법역별 SLA** 준수.

## 4. PII Handling (PII 처리 — MUST)

| Item | Rule |
|------|------|
| Storage (저장) | PII/민감정보 **AES-256-GCM** 암호화(3-field: `_encrypted/_iv/_tag`) |
| Transit (전송) | TLS 1.2+ |
| Logs/Admin (로그·관리자) | PII **마스킹**, 접근 시 감사 로그 |
| Password (비밀번호) | bcrypt 단방향 해시(평문 금지) |
| Backup (백업) | 암호화 + 보존기간; 삭제요청 시 백업 반영 정책 |
| Test/Prod 분리 | 운영 PII를 테스트에 사용 금지(가명/합성 데이터) |
| Least privilege (최소권한) | 역할 기반 접근 + 소유자 가시성(ACL) |

## 5. Consent & Notice (동의·고지)

| ID | Rule | Level |
|----|------|-------|
| PRV-020 | 수집·이용 고지(목적/항목/보유기간/제3자 제공) | MUST |
| PRV-021 | 마케팅/비필수 처리는 **명시적 opt-in**, 언제든 철회 | MUST |
| PRV-022 | CCPA "Do Not Sell or Share" + 민감정보 제한 링크 노출 | MUST(US) |
| PRV-023 | 쿠키/추적 동의(해당 시), 동의 기록 보관 | SHOULD |

## 6. Vendors / Processors & Cross-border (수탁자·국외 이전)

| ID | Rule |
|----|------|
| PRV-030 | 처리수탁자(예: Shopify/Klaviyo/Odoo/Google/Cloud)와 **DPA 체결**, 하위수탁 관리 |
| PRV-031 | 국외 이전 시 적법 근거(SCC 등) 및 고지 |
| PRV-032 | 침해사고 발생 시 통지(예: GDPR 72시간) 및 기록 |

## 7. Platform Integration (플랫폼 연동 의무 — 해당 시)

- **Shopify 앱**: 필수 컴플라이언스 웹훅 `customers/data_request`·`customers/redact`·`shop/redact` 구현; Protected Customer Data 등급 신청·의무 준수.
- 결제/PG·메일 등 PII 취급 외부연동은 DPA·암호화·최소권한 적용.

## 8. Audit & Breach (감사·사고대응)

| ID | Rule |
|----|------|
| PRV-040 | PII 접근/공유/삭제 이벤트 감사 로그(예: `{prefix}_access_audit_log`) | 
| PRV-041 | 보안 사고 대응 절차(탐지→통지→조치→기록) 문서화 |
| PRV-042 | 정기 점검/DPIA(고위험 처리) |

## 9. Compliance Checklist (체크리스트)
- ☐ 적용 법규 식별(서비스 지역) ☐ 동의·고지(opt-in/opt-out, CCPA 링크) ☐ DSAR(열람/삭제/정정/이동/처리정지) 처리 경로 ☐ 보존기간·파기 ☐ AES-256-GCM 암호화·전송 TLS ☐ 로그/화면 마스킹 ☐ bcrypt 비번 ☐ 수탁자 DPA·국외이전 근거 ☐ Shopify GDPR 웹훅 ☐ 감사 로그·침해 통지 절차 ☐ 테스트/운영 데이터 분리.

## Document History
| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v2.0 | 2026-06-15 | Amoeba Company | Initial — consolidates SPEC §15.5 & skill §17; **adds CCPA/CPRA**, DSAR matrix, processor/cross-border, breach, checklist |
