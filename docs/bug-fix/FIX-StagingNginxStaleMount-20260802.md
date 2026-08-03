# FIX-StagingNginxStaleMount-20260802 — edge nginx가 갱신된 nginx.conf를 못 읽는 문제

- 발견: 2026-08-02, PWA `/app` 라우트 배포 직후 스모크에서
- 증상: `https://…/app/sw.js`가 text/html(관리자 웹 index.html)로 응답 —
  edge nginx(:8080)가 신규 `/app` location을 모른 채 catch-all `/`로 폴백.
  pwa 컨테이너 직접 호출은 정상(application/javascript)이라 컨테이너 간 격리로 원인 축소.

## 근본 원인 (증상 패치 아님)
`docker-compose.staging.yml`은 `./nginx.conf:/etc/nginx/conf.d/default.conf:ro`로
**단일 파일 bind-mount**를 사용한다. `git pull`은 파일을 rename(원자 교체)으로 갱신하므로
**inode가 바뀌고**, 실행 중인 컨테이너의 마운트는 옛 inode를 계속 가리킨다.
따라서 deploy 스크립트의 `nginx -s reload`는 성공하지만 **옛 설정을 다시 읽는다**.
(reload 실패 시에만 force-recreate하는 폴백이 있었는데, reload가 "성공"하므로 미발동.)

## 조치
1. 즉시 복구: `docker compose … up -d --force-recreate nginx` → 마운트 재바인딩, `/app` 정상.
2. 영구 수정: `docker/staging/deploy-staging.sh`의 reload 단계를 **항상 force-recreate**로
   교체(엣지 1초 미만 중단, 스테이징 허용) + 원인 주석. (PR #55)

## 검증
- 재생성 후: `/app/sw.js` → `application/javascript` + `Cache-Control: no-cache`,
  `/app/manifest.webmanifest` → `application/manifest+json`, `/app/` → PWA index.

## 예방 패턴 (일반화)
- **단일 파일을 bind-mount한 컨테이너는 git pull 이후 reload가 아니라 recreate**가 필요하다
  (rename-교체 = 새 inode). 디렉터리 마운트면 이 문제가 없지만, 파일 마운트가 이미 관례라면
  배포 스크립트가 recreate를 보장할 것.
- 새 라우트 배포 검증 시 상태코드만 보지 말 것 — **200이어도 잘못된 업스트림의 200**일 수 있다.
  content-type/본문까지 확인 (이번 건: 404가 아니라 SPA 폴백 200이라 상태코드 검증을 통과했음).
