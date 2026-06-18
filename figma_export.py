#!/usr/bin/env python3
"""
TalkTalk Figma 화면 일괄 내보내기 (PNG @1x)
=================================================

사용법:
  1) Figma 개인 액세스 토큰 발급
     figma.com → 우측 상단 계정 → Settings → Security
     → Personal access tokens → Generate new token
     (스코프는 'File content: Read-only' 만 있으면 됩니다)

  2) 터미널에서 실행:
       export FIGMA_TOKEN="figd_xxxxxxxxxxxxxxxx"
       python3 "figma_export.py"

  결과: 같은 폴더의 ./screens/ 안에 PNG 파일들이 저장됩니다.

표준 라이브러리만 사용합니다 (별도 설치 불필요).
"""

import os
import sys
import json
import time
import urllib.request
import urllib.parse

FILE_KEY = "Y3ql0jG7uicOMDCfQS5ApB"   # https://www.figma.com/design/<FILE_KEY>/TalkTalk
SCALE = 1                               # PNG @1x (2로 바꾸면 @2x 고해상도)
FMT = "png"
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "screens")

API = "https://api.figma.com/v1"


def get_token():
    tok = os.environ.get("FIGMA_TOKEN", "").strip()
    if not tok:
        print("ERROR: 환경변수 FIGMA_TOKEN 이 설정되지 않았습니다.")
        print('  export FIGMA_TOKEN="figd_..." 후 다시 실행하세요.')
        sys.exit(1)
    return tok


def api_get(url, token):
    req = urllib.request.Request(url, headers={"X-Figma-Token": token})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode("utf-8"))


def collect_top_level_frames(document):
    """각 페이지(CANVAS)의 최상위 FRAME / COMPONENT / INSTANCE 노드를 모두 수집."""
    frames = []
    for canvas in document.get("children", []):
        if canvas.get("type") != "CANVAS":
            continue
        page = canvas.get("name", "Page")
        for node in canvas.get("children", []):
            if node.get("type") in ("FRAME", "COMPONENT", "COMPONENT_SET", "INSTANCE"):
                frames.append((page, node["id"], node.get("name", "frame")))
    return frames


def sanitize(name):
    bad = '<>:"/\\|?*'
    for c in bad:
        name = name.replace(c, "_")
    return name.strip() or "frame"


def chunked(seq, n):
    for i in range(0, len(seq), n):
        yield seq[i:i + n]


def main():
    token = get_token()
    os.makedirs(OUT_DIR, exist_ok=True)

    print("Figma 파일 구조를 불러오는 중...")
    doc = api_get(f"{API}/files/{FILE_KEY}", token)["document"]
    frames = collect_top_level_frames(doc)
    print(f"발견된 최상위 프레임: {len(frames)}개")

    if not frames:
        print("프레임을 찾지 못했습니다. FILE_KEY 또는 토큰 권한을 확인하세요.")
        sys.exit(1)

    # 이미지 렌더 URL 요청 (id 묶음으로 나눠서 호출)
    id_to_url = {}
    ids = [fid for (_, fid, _) in frames]
    for batch in chunked(ids, 50):
        q = urllib.parse.urlencode({"ids": ",".join(batch), "format": FMT, "scale": SCALE})
        data = api_get(f"{API}/images/{FILE_KEY}?{q}", token)
        if data.get("err"):
            print("렌더 오류:", data["err"])
            sys.exit(1)
        id_to_url.update(data.get("images", {}))
        time.sleep(0.3)

    # 다운로드
    pad = len(str(len(frames)))
    saved = 0
    for idx, (page, fid, name) in enumerate(frames, start=1):
        url = id_to_url.get(fid)
        fname = f"{str(idx).zfill(pad)}_{sanitize(page)}_{sanitize(name)}.{FMT}"
        out = os.path.join(OUT_DIR, fname)
        if not url:
            print(f"  [건너뜀] {fname} (렌더 URL 없음)")
            continue
        try:
            with urllib.request.urlopen(url, timeout=120) as r, open(out, "wb") as f:
                f.write(r.read())
            saved += 1
            print(f"  [{idx}/{len(frames)}] 저장: {fname}")
        except Exception as e:
            print(f"  [실패] {fname}: {e}")
        time.sleep(0.1)

    print(f"\n완료: {saved}/{len(frames)}개 저장됨 → {OUT_DIR}")


if __name__ == "__main__":
    main()
