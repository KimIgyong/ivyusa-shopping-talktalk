# FIX — 스테이징 로그인 인식 불가: erased_identities 마이그레이션 누락 (2026-08-04)

## 1. 증상

ambshop-dev 스토어에서 고객이 로그인 상태인데도 위젯이 Sign in을 계속 노출
(2026-08-03 오후, 사용자 보고). 오전(10:18, 13:14)에는 동일 흐름이 정상 인증됨.

## 2. 근본 원인 (로그로 확정)

identity 관측 로그(PR #77)와 에러 로그의 시각이 정확히 일치:

```
LOG   identity: shop=ambshop-dev.myshopify.com logged_in_customer_id=present
ERROR [ErasureSuppressionService] suppression lookup failed — treating as
      suppressed: Table 'db_ivy_talktalk.erased_identities' doesn't exist
```

- Shopify는 정상적으로 `logged_in_customer_id`를 보냈으나(=스토어프런트 로그인 자체는 유효),
  삭제고객 재생성 방지 조회(PRV-H2)가 **테이블 부재로 실패 → fail-safe "삭제된 고객으로
  간주" → `findOrCreateByShopifyId`가 null → identity가 익명 반환** → 위젯이 Sign in 노출.
- `erased_identities` 테이블·suppression 로직·`sql/migration_erased_identities.sql`은
  **PR #56**(`a865a5d`)에 포함되어 2026-08-03 낮 스테이징 배포로 처음 활성화됐는데,
  해당 PR의 Migration SQL이 스테이징 DB에 적용되지 않았음. 오전 로그인이 정상이었던
  이유는 그 시점 스테이징이 PR #56 이전 빌드였기 때문(코드 선배포 → 스키마 후행의 전형).
- 참고: 사용자가 로그인 근거로 본 shopify.com 계정 페이지 세션과 별개로, 이번 건은
  스토어프런트 세션도 유효했음 — 순수 서버측 결함.

## 3. 조치

1. `sql/migration_erased_identities.sql` 스테이징 적용 (2026-08-04, `SHOW TABLES` 확인).
2. 적용 직후 실측: identity `present` + suppression 에러 소멸 + 로그인 주문 백필
   `Backfilled 1 order(s) for customer 1:7817610756176` 발동 → 인증 성립 확인.
3. 전체 마이그레이션 일괄 점검: `sql/migration_*.sql` 14건 전부 스테이징 스키마와 대조 —
   누락은 `erased_identities` 단 1건이었음(나머지 tenants.slug/uuid/privacy/widget_login_mode,
   uq_customers_tenant_shopify, audit request_id, device_tokens token_hash, mfa_*,
   kb embedding, handoff/scenario/preview 모두 존재).

## 4. 예방 패턴

1. **fail-safe 익명화는 반드시 ERROR 로그와 함께** — 이 건은 suppression 서비스가 에러를
   남겨서 잡혔다. identity의 익명 반환 자체는 정상 케이스라 관측 로그(PR #77)가 없었으면
   "로그 무결점 + 기능 불능" 상태였음. (kit "no error in logs ≠ success"의 재확인)
2. **PR Migration 섹션의 per-env 체크박스는 배포 스크립트가 강제하지 않는다** — 스테이징
   배포 전 `pre-deploy-check` 스킬(마이그레이션 파일 ↔ 대상 DB 대조)을 실제로 실행할 것.
   특히 여러 PR을 한 번에 따라잡는 배포(오늘처럼 26커밋 점프)는 중간 PR들의 Migration
   섹션까지 소급 확인해야 한다.
3. 신규 테이블에 의존하는 fail-safe 로직은 "테이블 부재"를 명시적으로 감지해 부팅 로그에
   1회 경고를 남기는 것을 고려(런타임 매 요청 에러보다 조기 발견).

## 5. 기록

- 관측 로그 추가: PR #77 (`identity: shop=... logged_in_customer_id=present|absent`)
- 마이그레이션 적용: 2026-08-04 수동(SSH), 코드 변경 없음 → 별도 배포 불필요
- 관련: `docs/bug-fix/FIX-Customer-Duplicate-ShopifyId-20260803.md`,
  `docs/implementation/RPT-Widget-Login-Redirect-Orders-20260804.md`
