# RPT-260903 — 지식베이스 일괄 다운로드·업데이트 + 범용 상담가이드

- 문서 체인: REQ-260903 → PLN-260903(승인) → 구현 → TCR-260903 → 본 RPT
  (+ FIX-260903-Bulk-Import-Padded-Title-Duplicate — 스모크에서 발견·즉시 수정)

## 1. 구현 내용

| # | 항목 | 내용 |
|---|------|------|
| 1 | 일괄 다운로드 API | `GET /knowledge/documents/export?doc_group={counsel\|product\|operation}&format={csv\|xlsx}` — 일괄등록과 동일 컬럼(category,title,content,external_key,source_url), active=1만, BOM CSV/exceljs XLSX, `Content-Disposition: kb-{group}-{YYMMDD}.{ext}` |
| 2 | 라운드트립 보장 | 다운로드→무수정 업로드=전행 skip, 수정 행만 update·재임베딩. 이를 위해 임포터 2건 수정: 빈 category=미분류(null) 수용, 제목 매칭 트림 기준 통일(FIX-260903) |
| 3 | product 일괄등록 | `BULK_IMPORT_GROUPS`에 product 추가(전용 카탈로그 임포터 별도 유지) |
| 4 | 콘솔 UI | 그룹 탭별 [일괄 다운로드 ▾](CSV/XLSX), product 탭 [일괄등록] 노출, 모달: 그룹별 샘플 링크·동기화 덮어쓰기 안내·범용 가이드 링크. i18n en/es/ko/vi/ja/zh |
| 5 | 범용 상담가이드 | `/samples/universal-counsel-guide.{csv,xlsx}` — 스테이징 ivyusa counsel 245건을 일반화한 **45주제 × KO·EN = 90행** 스타터 KB. 자사 프로그램 장(Beautizen·RoundTable·B2B·Professional)은 사용자 결정으로 제외. external_key `GUIDE-{장}-{절}`(-EN) |
| 6 | 샘플 보강 | `/samples/kb-product-bulk-sample.{csv,xlsx}` (generic product 3행) |

## 2. 파일 목록
```
apps/api/src/domain/knowledge/bulk-export.service.ts(+spec)   신규
apps/api/src/domain/knowledge/csv.util.ts                     toCsv 직렬화
apps/api/src/domain/knowledge/bulk-import.service.ts(+spec)   빈 category·제목 트림
apps/api/src/domain/knowledge/knowledge.controller.ts         export 라우트(:id보다 앞)
apps/api/src/domain/knowledge/knowledge.module.ts             프로바이더
apps/api/src/domain/knowledge/entity/kb-document.entity.ts    BULK_IMPORT_GROUPS+product
apps/api/src/domain/knowledge/dto/request/knowledge.request.ts
apps/web/src/lib/api-client.ts                                apiGetBlob·saveBlob
apps/web/src/domain/knowledge/{service,hooks,KnowledgePage}
apps/web/src/i18n/locales/{en,es,ko,vi,ja,zh}/knowledge.json  키 6종
apps/web/public/samples/{universal-counsel-guide,kb-product-bulk-sample}.{csv,xlsx}
SPEC.md §6.3 · docs/{analysis,plan,test,bug-fix}/…260903…
```

## 3. 테스트 결과 (상세: TCR-260903)
- 단위: 신규 export 6건 + import 보강 2건 — API 전체 **1,806 테스트 PASS**, typecheck/build green, i18n:check complete, dist 실부팅 확인
- 로컬 E2E: counsel 240·product 144 라운드트립 전행 skip / 1행 수정→update=1 / 가이드 CSV 90행 생성·임베딩→XLSX 재업로드 전행 skip / category NULL 문서 결함 발견→수정

## 4. 배포 상태
| 항목 | 값 |
|------|-----|
| PR | **#465**(기능, ab938b2) · **#467**(FIX, 8da4e3f) — squash-merge to main |
| 마이그레이션 | 없음 (스키마 무변경 — 엔티티 변경은 상수뿐) |
| staging | 2026-09-03 두 차례 `deploy-staging.sh` — api healthy, boot log `successfully started`, 신규 라우트 무인증 401 |
| staging 스모크 | ivyusa: counsel export→재업로드 pass1 update=1(제목 정규화 "아시아 배송")·pass2 **240/240 skip**, product **1,832/1,832 skip**, XLSX export 정상, 샘플 3종 200, 잘못된 doc_group → 400 E5003, 웹 KnowledgePage 청크에 신규 UI 반영 확인 |
| 스모크 부산물 | 오생성 중복 doc 2672 API 삭제(FIX 문서 참조), doc 2099 내용 공백 정규화 update 1회(정상) |
| production | 미구축 (기존과 동일) |

## 5. 남은 일 / 후속 제안
- 범용 상담가이드의 VI 등 추가 언어판 — 요청 시 생성기 확장으로 대응 가능
- 신규 테넌트 온보딩 시 가이드 자동 시드 주입 여부 — 정책 결정 필요(REQ §7 범위 제외)
- 파일 기반 문서 삭제(export에 없는 행 제거)는 의도적으로 미지원 — 콘솔 삭제 유지
