# PLN-260829 — Smart Knowledge Board B3: 협업 (코멘트·멘션·백링크·작성 동선)

- 근거: `REQ-260829-Smart-Knowledge-Board.md` · B1(#444)/B2(#446) 완료
- ⚠️ **스키마 신설 1테이블**(board_comments) — SQL 선적용 + manifest 재생성

## 0. 설계 결정

| # | 결정 | 내용 |
|---|---|---|
| P5-1 | 코멘트 저장 | `board_comments`(id·tenant_id·document_id·body TEXT·**mentions JSON**(user id 배열)·author_user_id·created_at). 수정 없음 — 삭제만(작성자 또는 master/director, 문서 삭제와 동일 규칙). 문서 삭제 시 코멘트 동반 삭제 |
| P5-2 | 멘션 입력 | 코멘트 입력에서 `@` 타이핑 → 테넌트 사용자 자동완성(기존 users API 재사용) → 칩 삽입. 저장은 **클라이언트가 확정한 user id 배열**을 body와 함께 전송, 서버는 테넌트 소속만 남기고 정제(타 테넌트 id는 조용히 버림 — 에이전트 스코프 검증 선례) |
| P5-3 | 멘션 알림 | **보드 자체 멘션함**: `GET /board/mentions`(나를 멘션한 코멘트 최근 50) — 보드 목록 헤더에 "@나 N" 뱃지+패널(문서로 이동). `agent_alerts`는 conversation_id 필수(대화 종속)라 재사용 부적합 확인 — **벨 알림·이메일 연동은 범위 외**(후속 검토로 기록) |
| P5-4 | 백링크 | B1이 저장해 둔 `links JSON`(위키링크 타깃 제목) 소비: `GET /board/documents/:id/backlinks` = `JSON_CONTAINS(links, 이 문서 제목)`인 문서 목록. 상세 페이지 패널 2단: **Backlinks**(이 문서를 링크한 문서) + **Outgoing**(본문의 [[타깃]]별 존재 여부 — 있으면 이동, 없으면 '미작성' 뱃지 → 클릭 시 제목 프리필 새 문서). 옵시디언식 미작성 링크 생성 유도 |
| P5-5 | 본문 렌더 | MD 프리뷰 안의 [[..]] 클릭화는 **보류** — 에디터 remark 커스터마이즈는 이번 가치 대비 과대(패널이 동일 정보 제공). 그래프 뷰도 계속 보류 |
| P5-6 | 작성 동선(C3/D-1) | KnowledgePage 문서 카드에 **[보드에 작성]**(primary, 활성 그룹 프리셋 `?group=`) 신설, 기존 [+ 문서 추가]는 ghost 격하 + 모달에 "보드 우선 권장·긴급 직행용" 안내 1줄. **직행 차단 없음**(D-1 유지) |
| P5-7 | 제목 변경과 백링크 | 문서 제목 변경 시 그 제목을 가리키던 [[링크]]는 '미작성'으로 표시됨(링크는 제목 문자열) — B3는 **표시로 정직하게 노출**만, 자동 리라이트는 보류(옵시디언도 선택 기능). 상세 패널에 안내 문구 |
| P5-8 | 프리셋 수용 | `/knowledge/board/new?group=&title=` 쿼리 프리필(P5-4 미작성 링크 생성·P5-6 동선이 공용) |

## 1. 스키마 (`sql/migration_board_comments.sql`, 멱등)

```sql
CREATE TABLE IF NOT EXISTS board_comments (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  document_id BIGINT NOT NULL,
  body TEXT NOT NULL,
  mentions JSON NULL,
  author_user_id BIGINT NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY idx_board_comments_doc (tenant_id, document_id),
  KEY idx_board_comments_tenant (tenant_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```
init-sql 동기화 동반. 롤백=DROP.

## 2. 백엔드 (`domain/board/`)

1. `entity/board-comment.entity.ts` + `board-comment.service.ts`:
   list(문서별, 작성자 표시용 user 조인은 id→이름 매핑 배치 조회)·create(본문 필수·
   mentions 정제)·remove(권한 규칙)·removeAllFor(문서 삭제 훅)·
   **mentionsFor(userId)** = `JSON_CONTAINS(mentions, userId)` 최근 50(문서 제목 동반).
2. `board.controller.ts` 라우트: `GET/POST /board/documents/:id/comments` ·
   `DELETE /board/comments/:id` · `GET /board/mentions` ·
   `GET /board/documents/:id/backlinks`(BoardService에 backlinksFor 추가).
3. 사용자 이름 해석: users repo forFeature(표시명) — 코멘트·멘션함 응답에 authorName 포함.
4. 테스트: 멘션 정제(타 테넌트 제거), 삭제 권한, mentionsFor 매칭, backlinks 매칭
   (제목 변경 후 미작성화 포함), 문서 삭제 시 코멘트 소멸.

## 3. 콘솔

1. **BoardDocumentPage**: 하단 코멘트 섹션(목록: 작성자·시간·본문(멘션 하이라이트)·삭제,
   입력: @ 자동완성 드롭다운+칩) + **링크 패널**(Backlinks / Outgoing, 미작성은 점선
   뱃지→제목 프리필 새 문서), `?group=&title=` 프리필 수용.
2. **BoardListPage**: 헤더 "@나 N" 뱃지 → 멘션함 패널(코멘트 미리보기·문서로 이동).
3. **KnowledgePage**: [보드에 작성] primary(+그룹 프리셋), 기존 추가 버튼 ghost 격하,
   모달 안내 1줄.
4. i18n 6개 로케일(board·knowledge).

## 4. UI 와이어프레임

```
[문서 편집 하단 — 신규 2패널]
┌─ 코멘트 (3) ─────────────────────────────┐ ┌─ 링크 ───────────────────────┐
│ 김지원 · 8/29 14:02                       │ │ ← Backlinks (2)               │
│  @이서연 이 부분 예외 조항 확인 부탁해요  │ │  · 환불 예외 정리             │
│  [삭제]                                   │ │  · VIP 응대 규칙              │
│ …                                         │ │ → Outgoing                    │
│ [@를 입력하면 팀원 자동완성_________][등록]│ │  · [[빠른 객실 잠금 설정]] ✓  │
│   ┌──────────────┐                        │ │  · [[환불 예외]] (미작성+)    │
│   │ @이서연 (상담)│ ← 드롭다운            │ │  ※ 제목 변경 시 기존 링크는   │
│   │ @박준호 (운영)│                        │ │    미작성으로 표시됩니다      │
└───┴──────────────┴────────────────────────┘ └──────────────────────────────┘

[보드 목록 헤더]  … [🔔 @나 2] ← 클릭: 멘션함 패널(코멘트→문서 이동)

[KnowledgePage 문서 카드 액션]
 [Sync from catalog] [Import CSV] [Bulk import] [AI 임포트] [보드에 작성]* [+ 직접 추가(ghost)]
```

## 5. 측면 영향·리스크

| 영역 | 영향 | 대응 |
|---|---|---|
| 스키마 | board_comments 1테이블 신설 | SQL 선적용·manifest·init-sql 동기화(기존 절차) |
| B1/B2 경로 | 무변경(패널·버튼 추가만) — promote/simulate 그대로 | 회귀로 보증 |
| 멘션 스팸 | 코멘트당 멘션 상한 10 | 서버 정제 시 절단 |
| JSON_CONTAINS 성능 | 코멘트·문서 수십~수백 규모 — 테넌트 인덱스로 충분 | 대규모화 시 별도 mention 테이블은 후속 |
| 제목 기반 링크 | 제목 변경 시 링크 끊김이 '미작성'으로 보임 | P5-7 표시+안내(자동 리라이트 보류) |
| 알림 확장 | 벨/이메일 미연동(P5-3) | 후속 검토 항목으로 RPT에 기록 |

---
**승인 요청**: P5-1~P5-8 포함 본 계획으로 구현 진행 여부를 확인해 주세요.
