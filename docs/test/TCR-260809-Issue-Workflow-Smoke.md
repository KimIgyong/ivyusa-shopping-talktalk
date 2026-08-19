# TCR-260809-Issue-Workflow-Smoke

이슈 워크플로우 P1~P5 **스테이징 서버측 스모크 실행 결과** (2026-08-09 23:0x KST, amoebaorder=native 파일럿).
위젯 공개 API + DB 검증으로 수행. 콘솔 UI 측은 tenant 3 계정 필요(§3).

## 1. 실행 결과 (전부 실 스테이징)

| # | 시나리오 | 결과 |
|---|---|---|
| 1 | 세션 생성(amoebaorder) → widgetCopy.displayName='amoebaorder' 전달 | ✅ |
| 2 | 동의 → "환불 규정?" → **실 LLM 응답**(KB 기반, ~11s) | ✅ |
| 3 | 상담원 연결 요청(user_request) → **이슈 #1 자동 생성**: intent 매핑 type=refund, **기본 라벨 맵 assignee_label=accounting**, received | ✅ |
| 4 | `GET /issues` 문의 피드에 #1 표시 | ✅ |
| 5 | 고객 알림 발행(category issue, "문의 #1 … 접수") | ✅ |
| 6 | 알림 타겟: 회계 라벨 online 상담원 없음 → **broadcast 폴백**(target NULL) | ✅ |
| 7 | deny 규칙(환불계좌/계좌변경→refund/회계) 설정 후 매칭 메시지 → **2.6초 즉시 강제 핸드오프(LLM 미호출)**, 이슈 #3 type/label=규칙 스탬프, created note=**policy** | ✅ |
| 8 | Gorgias 웹훅 bad token → 401 | ✅ |

## 2. 발견/조치 1건 — SSH mysql 클라이언트 charset ⚠
`docker exec … mysql -e "UPDATE …한글…"`로 넣은 deny 키워드가 **latin1로 깨져 저장**되어 미매칭
(터미널 SELECT는 왕복 깨짐으로 정상처럼 보임 — 앱이 쓴 데이터가 `?? #1`로 보인 것이 단서).
`--default-character-set=utf8mb4` 지정 후 HEX 대조로 확인, 재검증 통과.
**예방 규칙**: 스테이징 DB에 한글 데이터를 SQL로 넣을 땐 utf8mb4 명시 + `HEX()` 대조.

## 3. 잔여 — 콘솔 UI 스모크 (tenant 3 master 계정으로 수행; 주소는 콘솔/DB 확인)
현재 스테이징 이슈 보드에 카드 3장(#1 received/#2 received/#3 received)이 준비돼 있음:
1. /issues 칸반 — #1을 진행→해결 드래그 → 위젯 알림 확인(P4 E2)
2. 해결 후 /knowledge "지식 갭 제안"에 상담원 해결 카드 → 편집·승인 → 문서 생성(P5 E1~E2)
3. 반려 드롭(사유 모달)·이관 드롭다운·우선순위 토글(P2/P4)
4. #2(저신뢰 테스트 부산물)는 반려(오분류) 처리로 정리 권장
※ deny 규칙(환불계좌/계좌변경)은 콘솔 /settings 핸드오프 섹션에서 확인·수정 가능 상태로 유지.
