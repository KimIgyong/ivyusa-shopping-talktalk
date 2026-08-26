# PLN-260826 — 플랫폼 연동 가이드 링크 + /manual HTML 저장

- 근거: `docs/analysis/REQ-260826-Platform-Integration-Guide-Link.md`
- 스키마·API 변경 없음 — 마이그레이션 불필요. 정적 파일 + 프런트 링크만.

## S1 — 가이드 HTML을 /manual 에 저장

- 파일: `apps/web/public/manual/platform-integration.ko.html`
  - 아티팩트 본문(도식 포함)을 **완전한 HTML 문서**로 래핑: `<!doctype html>` + `<html lang="ko">`
    + `<head>`(**`<meta charset="utf-8">`**, viewport, title, Google Fonts) + `<body>`.
  - 자기완결(외부 자산은 Google Fonts만) — nginx 정적 서빙 그대로 동작.
  - 접근 경로: `https://shoptalk.amoeba.site/manual/platform-integration.ko.html`
- (선택) 정본 md 사본: 기존 `docs/guide/GUIDE-260826-...ko.md` 가 이미 정본이므로 md 재저장은 생략
  (원본 개정 시 두 곳 동반 갱신 원칙은 유지 — RPT에 명시).

## S2 — /manual 카드뷰에 카드 추가(발견성)

- `apps/web/public/manual/index.html` 에 4번째 카드:
  - 제목 "커머스 연동 자격증명 가이드", 설명(5개 플랫폼 발급 위치 + 도식), 대상(플랫폼 관리자·운영자).
  - 링크는 **ko 고정**(en/vi 미제공) — 언어 토글 JS가 href를 재작성하지 않도록 `data-doc`/`data-fmt`
    속성을 붙이지 않고 고정 `href="platform-integration.ko.html"` + 작은 "(한국어)" 표기.

## S3 — 설정 플랫폼 페이지에 가이드 버튼

- `SettingsPage.tsx` "연동 쇼핑몰"(`storesTitle`) 섹션 헤더를 제목+버튼 flex 행으로:

```
┌──────────────────────────────────────────────────────────────┐
│ 연동 쇼핑몰                              [ 📖 연동 가이드  ↗ ] │  ← 새 탭
├──────────────────────────────────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐ ┌─────────┐                          │
│ │ Shopify │ │ Cafe24  │ │  Odoo … │   (기존 타일 그대로)      │
│ └─────────┘ └─────────┘ └─────────┘                          │
└──────────────────────────────────────────────────────────────┘
```

- 버튼: `<a href="/manual/platform-integration.ko.html" target="_blank" rel="noopener">` +
  외부링크 아이콘(lucide `ExternalLink` 또는 `BookOpen`). 기존 secondary 버튼 스타일 재사용.
- i18n 키 `settings.integrationGuide`("연동 가이드"/…) 6개 언어 추가.

## 사이드 임팩트

| 영역 | 영향 | 대응 |
|---|---|---|
| nginx `/manual` | 새 정적 파일 1개 | 무영향(디렉터리 그대로 서빙) |
| manual 언어 토글 | 새 카드가 en/vi 파일 없음 | ko 고정 링크(토글 대상 제외)로 404 방지 |
| 기존 매뉴얼 3권 | 없음 | — |
| 슬러그 `manual` 예약 | 이미 예약됨 | 무영향 |

## 검증

- 로컬: `/manual/platform-integration.ko.html` 200·한글 정상(charset), 도식 렌더;
  `/settings` "연동 쇼핑몰" 헤더에 가이드 버튼 → 새 탭 오픈; manual index 카드 노출.
- 배포 후 스테이징: 버튼 클릭 → 가이드 페이지 200, 만능 링크(로그인 무관 정적) 확인.

## 규모·순서

S1(소) → S2(소) → S3(소). PR 1건(`feature/platform-integration-guide-link`) + RPT.

---
**⚠️ 본 PLN 승인 후 구현 착수합니다. 위 구성으로 진행해도 될지 확인 부탁드립니다.**
(특히 — 가이드는 현재 한국어 단독 저장, en/vi는 잔여로 두는 안으로 진행합니다.)
