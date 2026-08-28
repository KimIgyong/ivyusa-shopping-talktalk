# PLN-260828 지식 소스 전환 내역 모달 구현 계획

- 근거: `docs/analysis/REQ-260828-Source-Conversion-History.md`

## 핵심 설계 결정

| # | 결정 | 근거 |
|---|---|---|
| D1 | 신규 페이지가 아닌 **/knowledge 소스 행 클릭 → 모달** | 소스·문서·분류가 이미 이 화면에 있음 — 별도 메뉴/라우트/제공메뉴 등록은 과함(적정기술). "페이지 필요" 요구는 "볼 곳 필요"로 해석, 모달이 그 곳 |
| D2 | 실행 이력 = **감사 로그 재사용**(`knowledge.source_synced`) + 실패도 감사 기록 보강 | 성공 이력은 이미 결과 JSON째 축적 중 — 신규 테이블은 보존 분리가 필요해질 때(백로그) |
| D3 | 문서 목록 = 기존 `GET /documents?source_id=` 재사용 (숨김 포함) | 서버 기구현·미노출. active 필터 미적용이 기본 — "사라진 페이지=숨김"을 보여주는 게 이 화면의 존재 이유 |
| D4 | 실패 감사는 **기록 시점부터** — 과거 실패 소급 없음 | 감사는 append-only; 화면에 "260828 이후 실패 포함" 명시 |

## W1. 백엔드

1. `syncSource` catch 경로에 `recordAudit(tenantId, 0, 'knowledge.source_synced', actor, {sourceId, type, status:'failed', error: clamp200})` 추가(성공 경로 metadata에도 `status:'ok'` 명시).
2. 신규 `listSourceRuns(tenantId, sourceId, limit=20)` — audit_logs에서
   `tenant_id=? AND action='knowledge.source_synced' AND JSON_EXTRACT(metadata,'$.sourceId')=?`
   최근순 limit. 반환: `{at, actorId, status, counts…, dropped?, truncated?, embedded?, error?, elapsedMs?}`.
   AuditService에 조회가 없으면 knowledge 쪽에서 AuditLog repo 직접 조회(읽기 전용).
3. 라우트 `GET /knowledge/sources/:id/runs` (KNOWLEDGE_SOURCE_MANAGE) — ⚠️ 선언 위치는 기존 `sources/:id` PATCH와 무관(GET 신규)이나 습관대로 리터럴 세그먼트 충돌 확인.
4. 유닛: 실패 감사 기록(에러 클램프), runs 쿼리 tenant/source 필터·정렬·limit.

## W2. 프런트 (`KnowledgePage.tsx` + 신규 `SourceHistoryModal.tsx`)

- 소스 행의 이름 셀을 버튼화 → `historyFor` state → 모달.
- 모달 구성: 상단 요약(유형 배지·대상·마지막 동기화 상태/사유) → 실행 이력 표(시각·결과 배지·카운트 축약·실패 사유·소요) → 전환 문서 목록(제목 클릭 시 모달 전환=기존 `setDetailId`, 카테고리·상태·노출 배지·수정일, 페이지네이션 size 10).
- hooks: `useSourceRuns(id)`, `useDocuments`에 `sourceId` 파라미터 추가(기존 훅 재사용 — DocumentListParams에 `source_id`).
- i18n 6언어 ~14키.

## W3. TCR · RPT (스키마 무변경 — Migration 없음)

## 와이어프레임

```
┌ 전환 내역 — "Hướng dẫn sử dụng Hotel Admin" (notion) ──────────── ✕ ┐
│ 대상: app.notion.com/p/…c89c · 마지막 동기화: 8/28 19:12 [ok]        │
│                                                                    │
│ ▸ 동기화 실행 이력 (260828 이후 실패 포함)                             │
│ ┌ 시각          │결과    │ 생성/갱신/유지/숨김 │ 색인 │ 소요  │ 사유    ┐│
│ │ 8/28 19:12   │ [ok]   │ 0/1/0/0          │ 1   │ 50.7s │        ││
│ │ 8/28 18:40   │ [ok]   │ 0/1/0/0 ⚠trunc   │ 1   │ 46.2s │        ││
│ │ 8/28 17:05   │ [failed]│ —               │ —   │       │ is a…  ││
│ └──────────────────────────────────────────────────────────────────┘│
│                                                                    │
│ ▸ 전환된 문서 (1)                                                    │
│ ┌ 제목                       │ 카테고리       │ 상태      │노출│수정일 ┐│
│ │ Hướng dẫn sử dụng Hotel …  │ [Hướng dẫn…] │ embedded │ ✓ │ 8/28 ││ ← 클릭=문서 상세
│ └──────────────────────────────────────────────────────────────────┘│
│                              ‹ 1 ›                                  │
└────────────────────────────────────────────────────────────────────┘
```

## 부수영향
- 성공 감사 metadata에 `status` 필드 추가 — 기존 소비처 없음(신규 runs 조회가 유일), /audit 화면은 원시 JSON 표시라 무해.
- audit_logs 조회는 tenant+action 조건 — 인덱스 확인 후 필요 시 관측(신규 인덱스는 이번 범위 밖).
- 문서 목록 `source_id` 파라미터는 서버 기존 기능 — 회귀 없음.

## 검증 계획
유닛 + 스테이징: go2joy 노션 소스 모달에서 8/28 실행 3건+문서 1건 확인, 실패 1회 유발(대상 임시 훼손 불가 — 대신 미공유 재현 어려우면 유닛으로 갈음), gdrive 소스(문서 0건)의 빈 상태, 숨김 문서 표시(E5 검증과 결합 가능).
