"""
용도지구·용도구역 로컬 데이터 다운로더
========================================
사용법: python download_zone_data.py

V-World WFS에서 전국 용도지구 폴리곤을 다운로드해 로컬에 저장한다.
백엔드 첫 실행 전 또는 데이터 갱신이 필요할 때 실행.

저장 위치: data/zones_local.pkl.gz
갱신 권장: 분기 1회 또는 도시계획 대규모 변경 시

향후 API 추가 방법
------------------
land_info_api.py 의 LIVE_ZONE_PROVIDERS 리스트에 async 함수를 추가하면 됨.
함수 시그니처: async (x: float, y: float) -> list[dict]
  반환: [{"name": "...", "category": "...", "law": "..."}]
현재 V-World WFS 공간필터 broken → live provider 비어 있음.
KLIP API 공개 또는 WFS 수정 시 land_info_api.py 에서 활성화.
"""

import asyncio
import gzip
import logging
import os
import pickle
import sys
import time
from datetime import datetime
from pathlib import Path

import httpx
from dotenv import load_dotenv
from pyproj import Transformer
from shapely.geometry import shape
from shapely.ops import transform

load_dotenv()

LAND_API_KEY = os.getenv("LAND_API_KEY", "")
DATA_DIR = Path(__file__).parent / "data"
OUTPUT_PATH = DATA_DIR / "zones_local.pkl.gz"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger(__name__)

# 다운로드할 WFS 레이어 정의 (layer, category, law)
WFS_LAYERS = [
    ("lt_c_uq121", "용도지구", "국토의 계획 및 이용에 관한 법률"),
    ("lt_c_uq123", "용도지구", "국토의 계획 및 이용에 관한 법률"),
    ("lt_c_uq124", "용도지구", "국토의 계획 및 이용에 관한 법률"),
    ("lt_c_uq125", "용도지구", "국토의 계획 및 이용에 관한 법률"),
    ("lt_c_uq126", "용도지구", "국토의 계획 및 이용에 관한 법률"),
    ("lt_c_uq128", "용도지구", "국토의 계획 및 이용에 관한 법률"),
    ("lt_c_uq129", "용도지구", "국토의 계획 및 이용에 관한 법률"),
    ("lt_c_uq130", "용도지구", "국토의 계획 및 이용에 관한 법률"),
    ("lt_c_ud801", "용도구역", "국토의 계획 및 이용에 관한 법률"),
]

PAGE_SIZE = 50  # smaller pages; WFS server returns empty body beyond ~1100 records per connection
_tf = Transformer.from_crs("EPSG:3857", "EPSG:4326", always_xy=True)


def _to_wgs84(geom):
    return transform(_tf.transform, geom)


def _process_batch(features: list, category: str, law: str, out: list) -> None:
    for f in features:
        geom_data = f.get("geometry")
        props = f.get("properties") or {}
        uname = props.get("uname")           # may be None in some layers (e.g. lt_c_ud801)
        if not geom_data or not uname:
            continue
        uname = uname.strip()
        if not uname:
            continue
        try:
            geom_wgs84 = _to_wgs84(shape(geom_data))
            out.append({"geom": geom_wgs84, "name": uname,
                        "category": category, "law": law})
        except Exception as e:
            log.warning("geometry 변환 실패 uname=%s: %s", uname, e)


async def _fetch_page(layer: str, start: int) -> dict | None:
    """Fresh connection per page to bypass WFS server session limit (~1100 records)."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            r = await client.get("https://api.vworld.kr/req/wfs", params={
                "service": "WFS", "version": "2.0.0", "request": "GetFeature",
                "typeName": layer, "key": LAND_API_KEY,
                "outputFormat": "application/json",
                "count": str(PAGE_SIZE), "startIndex": str(start),
            })
            return r.json()
        except Exception as e:
            log.warning("  WFS %s startIndex=%d 파싱 실패: %s", layer, start, e)
            return None


async def _download_layer(layer: str, category: str, law: str) -> list:
    records: list = []

    d = await _fetch_page(layer, 0)
    if d is None:
        log.error("  %s: 첫 번째 요청 실패", layer)
        return records
    total = d.get("totalFeatures", 0)
    log.info("  %s: 총 %d건", layer, total)
    _process_batch(d.get("features", []), category, law, records)

    start = PAGE_SIZE
    while start < total:
        await asyncio.sleep(0.3)
        d = await _fetch_page(layer, start)
        if d is None:
            log.warning("  %s: startIndex=%d 실패 — 레이어 중단 (%d/%d건 수집)",
                        layer, start, len(records), total)
            break
        batch = d.get("features", [])
        if not batch:
            log.warning("  %s: startIndex=%d 빈 응답 — 레이어 중단 (%d/%d건 수집)",
                        layer, start, len(records), total)
            break
        _process_batch(batch, category, law, records)
        start += PAGE_SIZE
        log.info("    %d/%d", min(start, total), total)

    return records


async def download_all() -> list:
    all_records: list = []
    for layer, category, law in WFS_LAYERS:
        log.info("[%s] 다운로드 중...", layer)
        try:
            recs = await _download_layer(layer, category, law)
            all_records.extend(recs)
            log.info("  → %d건 추가 (누적 %d건)", len(recs), len(all_records))
        except Exception as e:
            log.error("  [%s] 실패: %s", layer, e)
    return all_records


def save(records: list, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "downloaded_at": datetime.now().isoformat(),
        "count": len(records),
        "records": records,
    }
    with gzip.open(path, "wb") as f:
        pickle.dump(payload, f, protocol=pickle.HIGHEST_PROTOCOL)
    log.info("저장 완료: %s (%.1f MB, %d건)",
             path, path.stat().st_size / 1_000_000, len(records))


if __name__ == "__main__":
    if not LAND_API_KEY:
        print("오류: LAND_API_KEY 환경변수를 .env에 설정하세요")
        sys.exit(1)
    t0 = time.time()
    log.info("=== 용도지구 데이터 다운로드 시작 ===")
    records = asyncio.run(download_all())
    log.info("총 %d건 (%.0f초)", len(records), time.time() - t0)
    save(records, OUTPUT_PATH)
    log.info("완료. 백엔드를 재시작하면 자동으로 로드됩니다.")
