# RPT-260808-Marketing-Integrations-Klaviyo-Yotpo

연동설정 페이지 Klaviyo·Yotpo·**Gorgias**(Rev.2 사용자 지시로 포함) 설정 기능 구현 결과.

- 근거: REQ/PLN-260808-Marketing-Integrations-Klaviyo-Yotpo (2026-08-08 승인 + Rev.2)
- 범위: 자격증명 저장(AES-256-GCM)·secret 마스킹·연결 테스트·상태 기록까지. **실 데이터 플로우는 후속 REQ**(방향 결정 필요).

## 변경 (PR #191, 스키마 변경 없음)
- `@ivy/types`: `MARKETING_PROVIDERS`(klaviyo/yotpo) + `HELPDESK_PROVIDERS`(gorgias) +
  `GENERIC_INTEGRATION_PROVIDERS` 합집합, `INTEGRATION_FIELDS` 3종 추가
  (klaviyo api_key / yotpo app_key+secret_key / gorgias subdomain+email+api_key)
- 프로브 3종(`ecommerce-probe.util`): Klaviyo `GET /api/accounts/`(+revision 헤더),
  Yotpo `POST /oauth/token`(client_credentials), Gorgias `GET /api/account`(Basic) — never-throw·벤더 도메인 고정
- 제네릭 서비스 허용 리스트 확장(기존 GET/PUT/test 엔드포인트 그대로)
- 콘솔 /settings: "마케팅 연동"·"헬프데스크 연동" 섹션(기존 ProviderTile+모달 재사용), i18n en/es/ko
- Gorgias 자격증명 선반영 = **P2 Gorgias L1 커넥터의 자격증명 전제 충족**(§11.2, 결정 11)

## 배포
staging 2026-08-08 18:36 (#192·#193과 동시 배포) — 부트 정상, 라우트 401 확인. 실 키 스모크(E1~E4)는 사용자 잔여.
