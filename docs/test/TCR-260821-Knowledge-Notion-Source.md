# TCR-260821-Knowledge-Notion-Source

노션 지식 소스 — 테스트 케이스 및 결과

- 대상: PR #331 (`75fd752`), `docs/plan/PLN-260821-Knowledge-Notion-Source.md`
- 실행일: 2026-08-21 / 환경: 로컬(단위) + 스테이징 `shoptalk.amoeba.site`
- 결과 요약: **단위 250건 전부 통과**(knowledge 도메인 20 스위트), 전체 **130 스위트 / 1,443건 통과**,
  스테이징 시나리오 **7건 중 6건 통과 · 1건은 기대값 오류로 재분류**(아래 S5).

## 1. 단위 테스트 (신규 57건)

| 파일 | 건수 | 무엇을 고정하는가 |
|------|------|------------------|
| `notion.util.spec.ts` | 6 | 32-hex/대시 UUID/URL 슬러그 뒤 ID 추출, **`?v=` 뷰 ID 무시**(다른 객체를 동기화하는 사고 방지), 토큰 오붙여넣기 4종 |
| `notion-block-text.util.spec.ts` | 10 | 블록 타입별 마크다운, 중첩 들여쓰기, 깊이 상한 3, **빈 접두사 블록 제거**, 콜아웃=인용, 컨테이너는 skipped 아님, 문자 상한 + **상한보다 큰 단일 블록도 일부 보존** |
| `notion.client.spec.ts` | 15 | 버전 헤더 고정, 350ms 페이싱, DB→페이지 폴백, 커서 순회·archived 제외, ceiling, 자식 페이지만 추출, 깊이 상한, **페이지당 요청 예산**, 예산 정확히 소진 시 truncated 아님, Retry-After 1회+상한, 타임아웃 시그널, 401↔404 구분, 노션 원문 메시지 전달 |
| `adapters/notion.adapter.spec.ts` | 15 | DB=행당 1문서 / 페이지=본인+직계, page id 키잉, 빈 페이지 제외, **상한 정확 경계·초과·hasMore**, 페이지 대상의 +1 경계, 컬럼 상한 절단, 토큰·휴지통 거부, truncated 집계(빈 페이지는 제외) |
| `notion-credential.service.spec.ts` | 13 | 암호화 왕복, 마스킹, 오붙여넣기 거부, **감사기록에 토큰·힌트 미포함**, test() 5경로 |
| `source-sync.service.spec.ts` (증분) | 5 | `{items,dropped}`/배열 두 형태 수용, dropped 전달, 미보고 시 필드 부재, elapsedMs |

## 2. 스테이징 시나리오

배포: `75fd752` → 부팅 로그 `Nest application successfully started`, 컨테이너 32초,
`GET /knowledge/notion/credential` **401**, `POST /knowledge/notion/test` **401**(= 배포됨),
스키마 오류 0건. **마이그레이션 없음**(신규 컬럼·테이블 없음).

### P — 실 노션 API 응답 확인 (스테이징 호스트에서 직접)

| # | 요청 | 결과 |
|---|------|------|
| P1 | 잘못된 토큰으로 `GET /v1/users/me` | `401 {"object":"error","code":"unauthorized","message":"API token is invalid."}` — 파서가 기대한 형태 그대로 |
| P2 | 버전 헤더 없이 동일 요청 | 401 (인증이 먼저 평가됨 — 헤더 필수 여부는 유효 토큰이 있어야 확인 가능) |
| P3 | 인증 헤더 없이 | 401 동일 |

→ **스테이징에서 `api.notion.com` 아웃바운드가 열려 있음**을 함께 확인(막혀 있었다면 전 기능 무용).

### S — 컨테이너 내부 실행 (실 DB·실 네트워크, tenant 1)

| # | 시나리오 | 결과 |
|---|----------|------|
| S1 | 어댑터 등록 | PASS — `supportedTypes() = board/gdrive/notion` |
| S2 | 오붙여넣기 3종 거부 | PASS — URL / 너무 짧음 / 공백 포함 각각 사유 반환 |
| S3 | 토큰 암호화 왕복 | PASS — 저장 후 복호화 결과가 원본과 바이트 동일(50자) |
| S3b | 상태 마스킹 | PASS — `{connected:true, tokenHint:"…0000"}`, 응답에 토큰 원문 없음 |
| S4 | 실 노션 401 → `NotionAuthError` | PASS — `API token is invalid.` |
| S4b | `test()` 메시지 | PASS — `Notion rejected the token: API token is invalid.` |
| S5 | 잘못된 대상 로컬 거부 | **재분류(코드 정상)** — 아래 참조 |
| S6 | 소스 생성 시 사전 검증 | PASS — 대상 없음 / 대상 형식 오류 각각 `config_json` 사유 반환 |
| S7 | 정리 | PASS — 검증 후 토큰 삭제, 테넌트 원상복구 |

**S5 재분류**: 기대값이 틀렸습니다. `test()`는 **토큰을 먼저 검증**하므로, 무효 토큰 상태에서는
대상 문자열을 보기 전에 토큰 오류를 돌려줍니다. 이 순서가 맞습니다 — 토큰이 무효인데
"대상이 잘못됐다"고 안내하면 운영자가 엉뚱한 것을 고칩니다. 대상만 잘못된 경로는
`notion-credential.service.spec.ts`의 *rejects a target that carries no id before calling Notion*
(유효 토큰 모킹)에서 커버됩니다.

## 3. 미검증 — 실 워크스페이스 필요 (REQ C4)

토큰이 없어 아래는 **전부 모킹으로만 확인**했습니다. 실 통합 토큰 수령 시 즉시 진행합니다.

| # | 항목 | 왜 모킹으로 부족한가 |
|---|------|---------------------|
| E1 | DB 대상 동기화 → 행당 문서 1건, 위젯 인용 | 실제 속성 이름(`Name` 외)·타이틀 속성 위치가 워크스페이스마다 다름 |
| E2 | 페이지 대상 → 본인+직계 자식 | `child_page` 블록의 실제 형태 확인 필요 |
| E3 | 100건 초과 커서 순회 | 실제 `next_cursor` 동작 |
| E4 | **미공유 대상 404 → 안내 문구** | 공유 해제한 실 객체가 정말 `object_not_found`인지 |
| E5 | **공유 해제 후 재동기화 → 빈 목록 가드 발동** | 이 기능의 핵심 안전장치인데 실증이 없음 |
| E6 | 블록 변환 품질(표·토글·콜아웃 실제 문서) | 실 문서의 블록 조합은 합성 픽스처보다 다양 |
| E7 | 레이트리밋 실측(200페이지 소요) | 350ms 페이싱이 충분한지 |

**활성화 절차**: notion.so/my-integrations에서 내부 통합 생성 → 대상 페이지/DB의
⋯ → 연결(Connections)에 그 통합 추가 → `/knowledge` 노션 카드에 토큰 등록 → 연결 테스트.
