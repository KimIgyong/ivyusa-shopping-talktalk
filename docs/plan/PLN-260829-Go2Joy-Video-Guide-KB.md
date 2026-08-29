# PLN-260829 — go2joy 영상 가이드 지식 등재

REQ: `docs/analysis/REQ-260829-Go2Joy-Video-Guide-KB.md` · 브랜치 `session/g2j-video-kb`
**UI 변경 없음**(콘솔 화면·API 무수정) · **스키마 변경 없음** · 코드 변경 = 변환 스크립트 1개 신설

## D. 설계 결정

| # | 결정 | 근거 |
|---|---|---|
| D1 | 신규 스크립트 `scripts/convert-go2joy-video-kb.mjs` (기존 `convert-go2joy-kb.mjs`는 손대지 않음) | 원본 문법이 다르다(한 줄 병기 + 항목 스키마). 기존 변환기에 분기를 심으면 20건 재등록 경로가 위태로워진다 |
| D2 | 언어 분해 = 줄 단위 `<br>` 분리, EN 쪽은 목록 마커·들여쓰기를 VI 쪽에서 복원해 재부착 | `  1) VI…<br>*EN…*` → EN 문서에서도 `  1) EN…`이 되어야 절차가 목록으로 읽힌다 |
| D3 | 카테고리 = **챕터 + 영상번호 구간 명시표**(아래) | 화면경로 첫 백틱으로 유추하면 Video 25(홈→정산)·39(홈 배너→쿠폰)가 오분류된다. [[kb-operation-bulk-import]]의 "명시 규칙만" 교훈 |
| D4 | 키 `GTJ-VID-{NN}-{VI\|EN}`, 참고문서 `GTJ-VIDREF-01-*` | 기존 `(tenant, doc_group, external_key)` 업서트 축 그대로 → 재실행 멱등 |
| D5 | 제외: Duration·목차 표 / 포함: Not verifiable | REQ §5 |
| D6 | `doc_group=operation` | 기존 go2joy 운영지식과 같은 그룹 |

### 카테고리 매핑 (VI 문서 / EN 문서)

| 영상 | VI 라벨 | EN 라벨 | 상태 |
|---|---|---|---|
| 0 | Bảng điều khiển | Dashboard | 기존 |
| 1 | Quản lý đánh giá | Review Management | 기존 |
| 2–16 | Quản lý loại phòng | Room Type Management | 기존 |
| 17–23 | Quản lý đặt phòng | Booking Management | 신설 |
| 24 | Báo cáo | Reports | 기존 |
| 25–31 | Quản lý đối soát | Reconciliation | 신설 |
| 32–33 | Quản lý sản phẩm | Product Management | 신설 |
| 34–41 | Quản lý khuyến mãi | Promotions & Coupons | 신설 |
| 42–45 | Chiến dịch quảng cáo | Ad Campaigns | 신설 |
| 46–50 | Quản lý nhân viên | Staff Management | 신설 |
| 참고 | Tài liệu tham khảo | Reference | 기존 |

## S1 — 변환기

`scripts/convert-go2joy-video-kb.mjs` (`--lang vi|en`, 기본 출력 `go2joy-video-kb.{lang}.csv`)

1. `### Video N — VI / Video N — EN` 헤딩에서 언어별 제목 분리(구분자는 리터럴 ` / Video N — `)
2. 다음 `###`/`##`/`---`까지가 한 영상의 본문 — **명시 경계만**(그 외 줄은 본문 구조로 보존)
3. 줄 변환
   - 라벨 줄 `- **VI라벨 / EN라벨**:` → 해당 언어 라벨만. `Thời lượng / Duration` 줄은 버림
   - 서술 줄 `…VI<br>*EN*` → 언어별 반쪽. EN은 앞의 마커(`- `, `N) `, 들여쓰기) 복원
   - Video 39의 라벨 꼬리 병기 `**…** (VI) / *(EN)*`도 같은 규칙으로 분해
4. 참고 문서 = 분석 방법·한계 절 + 불일치 표(표 셀도 `<br>` 분리) → `GTJ-VIDREF-01-*`
5. CSV `category,title,content,external_key` + BOM (기존 변환기와 동일 포맷)
6. **검증 출력**: 언어별 행 수·문자 수·카테고리 분포를 찍고, 한쪽 언어 텍스트가 반대 언어 CSV에
   남았는지 자기점검(`<br>`·`*…*` 잔재 0 확인)

## S2 — 스테이징 등재

7. `smoke.notion@amoeba.group`(tenant go2joy) 로그인 → `POST /knowledge/documents/import/bulk`
   (`doc_group=operation`) VI·EN 각 1회
8. 결과 확인: created 52 + 52, 임베딩 status=embedded, 카테고리 신설 6종 노출
9. **멱등 확인**: 같은 CSV 재업로드 → 0 created / 104 updated(또는 skipped) — 중복 0
10. RAG 스모크 3문항(VI/EN): 정산 완료 처리, 쿠폰 100% 후원 생성, 직원 계정 생성 →
    해당 Video 문서가 인용되는지

## S3 — 문서

11. TCR `docs/test/TCR-260829-Go2Joy-Video-Guide-KB.md`
12. RPT `docs/implementation/RPT-260829-Go2Joy-Video-Guide-KB.md`(등재 건수·스모크 결과·재실행 절차)

## 부수 영향

| 영역 | 영향 |
|---|---|
| 스키마 | 없음(문서 데이터만) |
| 기존 60건 | 키가 `GTJ-VID-*`로 다르므로 무간섭. 카테고리는 5종 공유·6종 신설 |
| 임베딩 비용 | 104건 1회(Voyage). 재업로드 시 변경분만 |
| 콘솔 UI | 무변경(운영매뉴얼 탭에 분류·문서만 늘어남) |
| 위젯/RAG | 검색 후보 증가. 텍스트 매뉴얼과 주제 중복은 상호 보완(REQ §5) |

## 리스크

- **R1** 원본 개정 시 md만 고치고 재변환·재업로드를 잊으면 지식이 낡는다 → RPT에 재실행 3단계 명시.
- **R2** 신설 카테고리 6종은 언어별로 각각 생기므로 콘솔 분류 목록이 길어진다(기존 정책과 동일).
- **R3** 영상 11·12·21·22·32·46은 **구버전 콘솔 UI** 녹화다. 본문에 그 사실이 원문 그대로 실리므로
  KB가 현재 화면과 다를 수 있음을 스스로 밝힌다(불일치 표 문서가 이를 보강).
