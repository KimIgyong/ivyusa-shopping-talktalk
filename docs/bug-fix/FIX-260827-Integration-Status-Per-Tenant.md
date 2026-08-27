# FIX-260827 — 플랫폼 연동 상태가 전역/목업으로 표시되는 문제 (per-tenant 격리)

## 증상 (사용자 보고)
1. `/settings/platforms` — 실제 연동 안 된 플랫폼도 **[연결됨]** 표시. (skyliving은 odoo만 연결)
2. `/dashboard` 연동 상태 — **목업(Seeded mock) + 다른 테넌트** 연동 상태가 표시됨.

## 근본 원인 (코드+스테이징 DB 확인)
- `integration_status` 테이블은 **`name`(provider) 기준 전역**(tenant_id 없음). 시드/목업 행
  (`fulfillment/klaviyo/google_drive = "Seeded (mock)"`) + **모든 테넌트**의 test/sync 결과가 한 테이블에 섞임.
- **타일 배지**(`ProviderTile.status`) ← `getSettings` → `integrationService.findByName(provider)` =
  **전역 상태**. 그래서 skyliving의 cafe24/haravan 타일이 (타 테넌트가 연결했다는 이유로) [연결됨]으로 뜸.
- **대시보드**(`/integrations/status` → `listStatus()` = `statusRepo.find()`) = **전역 전체 행**
  (테넌트 필터 없음, 목업 포함).
- 추가로 `ecommerce-integration.save()`·`TenantService.upsertCredential()`가 **자격증명 저장만 해도**
  per-tenant `integration_credentials.status='connected'`로 설정(테스트 성공 전).

## 수정 (per-tenant, 테스트 게이트)
per-tenant 진실은 `integration_credentials`(tenant+provider). 이걸 소스로 전환.

- **스키마**(마이그레이션): `integration_credentials`에 `last_tested_at datetime NULL`,
  `detail varchar(255) NULL` 추가. 기존 `status` 컬럼 유지.
- **저장 게이트**: `ecommerce-integration.save()`·`TenantService.upsertCredential()` → 저장 시
  `status='unknown'`, `detail=null`, `last_tested_at=null`(자격증명 변경은 이전 테스트를 무효화).
  → **저장만으로는 [연결됨] 아님**.
- **테스트가 상태를 결정**: `ecommerce-integration.test()` → per-tenant `cred.status = ok?connected:error`,
  `cred.detail = 결과`, `cred.lastTestedAt = now`. (전역 `integration_status` 오염 제거)
- **타일 소스 전환**: `getSettings`/`toSettings`가 전역 대신 **per-tenant cred**의 status/lastTested/detail 사용.
  → cafe24/haravan 자격증명이 없는 skyliving 타일은 배지 없음(unknown), odoo만 테스트 성공 시 [연결됨].
- **대시보드 per-tenant화**: 신규 `GET /tenants/me/integrations`(@Auth, 테넌트 사용자, 시크릿 없음) —
  **이 테넌트가 설정한** integration_credentials만 `{provider,status,lastTestedAt,detail}`로 반환.
  웹 대시보드가 전역 `/integrations/status` 대신 이걸 사용 → 목업·타 테넌트 제거.
- `CredentialResponse`에 `lastTestedAt`/`detail` 추가.

## 영향/비영향
- 전역 `/integrations/status`·`integration_status`는 유지(어드민/기타 용도). 대시보드만 per-tenant 소스로 전환.
- 기존 per-tenant `status='connected'`(저장 시 설정된 값)는 **리셋하지 않음**(fix-forward). 실제 연결(예:
  skyliving odoo)은 그대로, 앞으로의 저장은 unknown → 테스트로 connected. 미설정 플랫폼은 cred 자체가
  없어 더 이상 connected로 안 뜸(핵심 증상 해소).
- sync 서비스(shopify/cafe24/odoo/haravan/woo)는 전역 integration_status에 계속 기록(무해, 대시보드 미사용).

## 마이그레이션
- SQL: `sql/migration_integration_credentials_status.sql` — `ALTER TABLE integration_credentials
  ADD COLUMN last_tested_at datetime NULL, ADD COLUMN detail varchar(255) NULL;`
- **배포 전 스테이징 수동 선적용**(신 코드+구 스키마=500 방지).

## 예방 패턴
- 멀티테넌트 상태는 **테넌트 스코프**로 저장/조회. provider-name 전역 키는 테넌트 격리를 깬다.
- "연결됨"은 **테스트 성공**의 결과여야 하며, 자격증명 저장의 부수효과가 아니다.

## 검증 (스테이징, 2026-08-27)
- 마이그레이션 SQL 선적용(last_tested_at·detail 컬럼 확인) → 코드 배포, 부팅 정상.
- **skyliving(id5, odoo만 연결)**:
  - 대시보드 `GET /tenants/me/integrations` → **`[{provider:odoo, status:connected}]` 단 1건**
    (목업·타 테넌트 없음). ✅
  - 설정 타일: odoo `configured=true status=connected`; **cafe24/haravan/woocommerce `configured=false
    status=null`**(→ [연결됨] 아님). ✅ 핵심 증상 해소.
  - odoo 재테스트 → `status=connected, lastTested=<시각>, detail="Connected (uid 2)"`(per-tenant 테스트 게이트 실증). ✅
- 검증용 skyliving 사용자(id19) invited 원복.
