# PLN-260808-Marketing-Integrations-Klaviyo-Yotpo

연동설정 페이지 Klaviyo·Yotpo 설정 기능 작업계획서 (범위: 자격증명 저장+연결 테스트).

- 근거: REQ-260808-Marketing-Integrations-Klaviyo-Yotpo · ⚠️ **사용자 승인 후 구현 착수**
- 스키마 변경 없음(integration_credentials 재사용) → **Migration 불필요**

## 1. 단계별 계획 (PR 1건)

### S1. 타입/레지스트리 (`packages/types`)
- `INTEGRATION_PROVIDER`에 `KLAVIYO:'klaviyo'`, `YOTPO:'yotpo'` 추가.
- `MARKETING_PROVIDERS = ['klaviyo','yotpo']` 신설(+`MarketingProvider` 타입) — 기존
  `ECOMMERCE_PROVIDERS`는 불변(커머스 의미 유지), 제네릭 연동 허용 리스트는 두 배열의 합집합.
- `INTEGRATION_FIELDS` 확장:
  - `klaviyo: [{ key:'api_key', secret:true, required:true }]`
  - `yotpo: [{ key:'app_key', secret:false, required:true }, { key:'secret_key', secret:true, required:true }]`

### S2. 백엔드 (`domain/tenant`)
- `ecommerce-integration.service.ts`: 허용 리스트를 `[...ECOMMERCE_PROVIDERS, ...MARKETING_PROVIDERS]`로.
- `ecommerce-probe.util.ts`에 프로브 2종 추가(기존 패턴: never-throw, 상태·detail 기록):
  - `probeKlaviyo`: `GET https://a.klaviyo.com/api/accounts/` + `Authorization: Klaviyo-API-Key`, `revision: 2026-07-15` → 200 connected / 401 invalid key
  - `probeYotpo`: `POST https://api.yotpo.com/oauth/token` (`client_credentials`, app_key/secret) → access_token 존재 시 connected

### S3. 콘솔 (web)
- `integration-providers.ts` 미러 확장(MARKETING_PROVIDERS + 필드) — KEEP IN SYNC 주석 갱신.
- SettingsPage: "스토어 연동" 아래 **"마케팅 연동"** 섹션 — 기존 `ProviderTile`/`IntegrationConfigModal` 그대로 재사용.
- i18n(en/es/ko): 섹션 제목, klaviyo/yotpo 타일 title/subtitle, 필드 라벨(api_key 재사용·app_key·secret_key), 플레이스홀더.

```
┌ 연동 설정 ─────────────────────────────────────────┐
│ 스토어 연동                                         │
│ [Cafe24] [WooCommerce] [Odoo] [Haravan]  (기존)     │
│───────────────────────────────────────────────────│
│ 마케팅 연동                          ← 신설 섹션    │
│ ┌─ Klaviyo ─────────┐  ┌─ Yotpo ──────────────┐   │
│ │ 이메일/SMS 캠페인   │  │ 리뷰·로열티            │   │
│ │ 상태: ● Connected  │  │ 상태: ○ Not tested    │   │
│ │ [설정] [연결 테스트] │  │ [설정] [연결 테스트]    │   │
│ └───────────────────┘  └──────────────────────┘   │
│  설정 모달(기존 재사용): API Key[   ] (저장됨—마스킹) │
│                         [저장] [연결 테스트] 토스트  │
└───────────────────────────────────────────────────┘
```

## 2. 사이드 임팩트
| 영역 | 영향 | 판단 |
|---|---|---|
| 기존 4개 커머스 연동 | 허용 리스트 확장만 — 저장·테스트·마스킹 로직 공유 | 안전 |
| 통합 상태 대시보드 | integration_status에 klaviyo/yotpo 행 추가 표시(기존 제네릭) | 자연 편입 |
| 데이터 플로우 | 없음(이번 범위는 설정·검증까지 — REQ §3) | 후속 REQ |

## 3. 테스트/배포
- 단위: 프로브 2종(성공/401/네트워크 오류→never-throw), 허용 리스트(미지원 provider 400 유지).
- 스테이징: 실 Klaviyo/Yotpo 키로 저장→테스트→connected 상태 확인(키는 사용자 제공 필요).
- Migration 없음 → 일반 배포.
