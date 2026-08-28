# PLN-260829 — 지식 페이지 1차: 소스 삭제·board 정리·자격 UI 압축 + 문서 그룹 선택

- 근거: `docs/analysis/REQ-260829-Knowledge-Page-Enhancements.md` (R1 + R3)
- 확정된 결정: D1-1=삭제 시 문서 **비활성화**, D1-2=board/repository enum 제거+죽은 행 정리 **포함**
- 스키마 변경 **없음**(테이블 드랍은 R4에서 kb_files 결정 후 별도)

## 0. 설계 결정

| # | 결정 | 내용 |
|---|---|---|
| P1-1 | 소스 삭제 의미론 | `DELETE /knowledge/sources/:id` 보강: ① 해당 소스 문서 전건 `active=0` + Qdrant setActive(false) ② 감사 기록 `knowledge.source_deleted` (문서 수 포함) ③ 소스 행 삭제. 응답 `{deleted: true, deactivatedDocuments: n}` — 문서는 남아 검수·재활성 가능(완전 삭제는 문서 목록에서 개별 수행) |
| P1-2 | 삭제 확인 모달 | 소스명 + "문서 N건이 비활성화됩니다" 사전 고지(삭제 전 문서 수 조회는 기존 목록 데이터 재사용) |
| P1-3 | 타입 enum | `KNOWLEDGE_SOURCE_TYPES = ['gdrive','notion']` — board/repository 제거(DTO 단계 거부로 승격). 레거시 행은 목록에 타입 텍스트로 계속 표시·삭제 가능 |
| P1-4 | 죽은 행 정리 | 배포 후 신설 삭제 기능으로 스테이징 6행(board 5·repository 1) 제거 — 코드가 아니라 운영 작업(RPT에 기록) |
| P1-5 | 자격증명 UI | 2칸 그리드 → **한 줄 접이식 행 2개**(세로 스택). 접힘: 제목·연결 뱃지·[테스트][삭제]/[키 등록]. [키 등록] 클릭 시에만 입력영역 펼침. 기존 `SourceCredentialCard` 내부 개조(신규 컴포넌트 없음) |
| P1-6 | 소스 추가 모달 | 변경 없음 — 모달 내 자격 안내 박스는 폴더 공유 대상 이메일 등 등록 시점 필수 정보라 유지 |
| P1-7 | 문서 그룹 선택(R3) | Add KB-Document 모달에 그룹 Select(Counsel/Product/Operation), 기본=활성 탭(전체=counsel). 카테고리 datalist의 그룹 필터링은 R2(카테고리 그룹화) 이후로 보류 — 현 카테고리엔 그룹 축이 없음 |

## 1. 작업 목록

### 백엔드 (apps/api)
1. `knowledge.service.ts` `deleteSource` 보강 (P1-1): 문서 비활성화 루프(배치 UPDATE +
   Qdrant setActive 실패는 warn), `revisions.recordAudit(tenantId, 0, 'knowledge.source_deleted', ...)`.
2. `knowledge.request.ts` `KNOWLEDGE_SOURCE_TYPES` 축소 (P1-3).
3. 단위 테스트: 삭제 시 비활성화·감사·행 삭제, 문서 0건 소스, 타 테넌트 소스 404.

### 프런트 (apps/web)
1. `knowledge.service.ts` `deleteSource` 클라이언트 + `knowledge.hooks.ts` `useDeleteSource`
   (documents/sources/categories 키 무효화).
2. 소스 테이블에 삭제 액션(휴지통 아이콘) + 확인 모달 (P1-2).
3. `SourceCredentialCard` 접이식 한 줄 개조 + 그리드 `md:grid-cols-2` → 1열 스택 (P1-5).
4. Add KB-Document 모달 그룹 Select (P1-7).
5. i18n 6개 언어: 삭제 확인·비활성 고지·그룹 라벨 재사용(`group.*` 기존 키)·신규 키 최소.
6. 저장/삭제 토스트(성공 자동·실패 수동, 기존 규약).

### 검증
- Jest(신규 삭제 스펙 + 전체 회귀), typecheck, i18n:check, 실부팅, 로컬 HTTP 스모크
  (소스 생성→문서 연결→삭제→문서 active=0 확인).
- 스테이징 배포 후: 삭제 기능으로 죽은 행 6건 정리(P1-4) + 401/404 라우트 검증.

## 2. UI 와이어프레임

```
[Sources 카드]
┌──────────────────────────────────────────────────────────────┐
│ Name          Type    Status   Last sync      Sync  Created 🗑│
│ policy        gdrive  active   —               ↻    8/25    🗑│  ← 행별 삭제 아이콘(신규)
│ IVY Help…     board   inactive —                    8/20    🗑│  ← 레거시 타입도 삭제 가능
├──────────────────────────────────────────────────────────────┤
│ ▸ Google Drive 자격증명   [연결됨] client@…iam  [테스트][삭제] │  ← 한 줄 접이식(신규)
│ ▸ Notion 자격증명        [미연결]              [키 등록]      │
│    └(펼침 시) [ntn_… 입력____________________] [저장]         │
└──────────────────────────────────────────────────────────────┘

[소스 삭제 확인 모달]
┌─ 소스 삭제 ──────────────────────── ✕ ─┐
│ "policy" 소스를 삭제합니다.             │
│ ⚠ 이 소스의 문서 12건이 비활성화되어    │
│   검색에서 제외됩니다(문서는 유지).     │
│                    [취소] [삭제]        │
└─────────────────────────────────────────┘

[Add KB-Document 모달 — 그룹 필드 추가]
│ 그룹      [OperationInfo ▼]   ← 신규(기본=활성 탭)
│ 제목      [_____________]
│ 카테고리  [_____________▾]
│ 내용      [빈 칸 8줄     ]
```

## 3. 측면 영향

| 영역 | 영향 | 대응 |
|---|---|---|
| 삭제 API 의미 변경 | 기존 호출자 없음(프런트 미배선 확인) — 안전 | 응답 필드 추가만 |
| RAG | 비활성화 문서 즉시 검색 제외(기존 setActive 경로) | 기존 메커니즘 재사용 |
| 소스 이력 모달 | 삭제된 소스의 이력 접근 불가(행이 없어짐) | 확인 모달에 고지 문구 포함 |
| enum 축소 | board/repository 신규 생성 DTO 거부(기존에도 어댑터 검사로 거부됨 — 계층만 승격) | 레거시 행 표시·수정·삭제는 유지 |
| 자격 카드 개조 | 저장/테스트/삭제 로직 무변경 — 레이아웃만 | 기존 훅 재사용 |

## 4. 리스크

- 문서 수천 건 소스 삭제 시 Qdrant setActive N회 호출 — 배치 UPDATE는 1쿼리,
  Qdrant는 실패 무해(warn)·reindex로 회복 가능. 상한 문제없음(현 최대 소스당 수백 건).
- 삭제 아이콘 오클릭 — 2단계 확인 모달로 방지.

---
**승인 요청**: P1-1~P1-7 포함 본 계획으로 구현 진행 여부를 확인해 주세요.
