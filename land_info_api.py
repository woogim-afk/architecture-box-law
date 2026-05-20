import gzip
import httpx
import logging
import os
import pickle
import xml.etree.ElementTree as ET
from pathlib import Path
from dotenv import load_dotenv
from shapely.geometry import Point
from shapely.strtree import STRtree

load_dotenv()

LAND_API_KEY = os.getenv("LAND_API_KEY", "")
LURIS_KEY    = os.getenv("LURIS_API_KEY", "")
VWORLD_DATA  = "https://api.vworld.kr/req/data"
VWORLD_ADDR  = "https://api.vworld.kr/req/address"
VWORLD_NED   = "https://api.vworld.kr/ned/data"

# ── 로컬 내장 용도지구 데이터 ─────────────────────────────────────────
# download_zone_data.py 를 먼저 실행해야 함.
# 파일 없으면 조용히 스킵 (V-World req/data 결과만 반환).
_LOCAL_PATH = Path(__file__).parent / "data" / "zones_local.pkl.gz"
_local_records: list[dict] = []
_local_index: STRtree | None = None


def _load_local_zone_data() -> None:
    global _local_records, _local_index
    if not _LOCAL_PATH.exists():
        logging.info("zones_local.pkl.gz 없음 — 용도지구 로컬 조회 비활성화")
        return
    try:
        with gzip.open(_LOCAL_PATH, "rb") as f:
            payload = pickle.load(f)
        _local_records = payload["records"]
        _local_index = STRtree([r["geom"] for r in _local_records])
        logging.info("용도지구 로컬 데이터 로드: %d건 (%s)",
                     payload["count"], payload.get("downloaded_at", "?"))
    except Exception as e:
        logging.warning("zones_local.pkl.gz 로드 실패: %s", e)


_load_local_zone_data()


def _query_local_zones(x: float, y: float) -> list[dict]:
    """로컬 shapely 인덱스 — point-in-polygon 교차 조회"""
    if _local_index is None:
        return []
    pt = Point(x, y)
    results = []
    for idx in _local_index.query(pt):
        rec = _local_records[idx]
        if rec["geom"].contains(pt):
            results.append({"name": rec["name"],
                            "category": rec["category"],
                            "law": rec["law"]})
    return results


# ── 향후 Live API 연결 훅 ──────────────────────────────────────────────
# V-World WFS 공간 필터 broken → 현재 비어 있음.
# KLIP API 공개 또는 WFS 수정 시 async 함수를 추가:
#   async def _klip_zones(x, y) -> list[dict]: ...
# 그리고 LIVE_ZONE_PROVIDERS = [_klip_zones] 로 변경.
LIVE_ZONE_PROVIDERS: list = []

# LURIS API (data.go.kr 1613000)
# arLandUseInfoService: 행위제한 조회 (zone code 필요 → 필지→zone 역방향 불가)
#   DTarLandUseInfo: areaCd + ucodeList + landUseNm → 행위 가능여부
#   DTsearchLunCd : pageNum + numOfRows + landUseNm → 행위코드 목록
# LuLawInfoService: DB 미구축 상태 (모든 areaCd에서 0건 반환)
#   DTluLawInfo   : areaCd + ucodeList + pageNum + numOfRows → 법령정보 (DB 없음)
LURIS_SEARCH_URL = "https://apis.data.go.kr/1613000/arLandUseInfoService/DTsearchLunCd"


async def geocode(address: str) -> tuple[float, float] | None:
    """주소 → (경도, 위도) — V-World 지오코딩 (parcel → road 순)"""
    async with httpx.AsyncClient(timeout=10.0) as c:
        for addr_type in ("parcel", "road"):
            r = await c.get(VWORLD_ADDR, params={
                "service": "address", "request": "getcoord",
                "version": "2.0", "crs": "epsg:4326",
                "address": address, "refine": "true",
                "format": "json", "type": addr_type,
                "key": LAND_API_KEY,
            })
            try:
                d = r.json()
                if d["response"]["status"] == "OK":
                    pt = d["response"]["result"]["point"]
                    return float(pt["x"]), float(pt["y"])
            except Exception:
                continue
    return None


async def _parcel_props(x: float, y: float) -> dict:
    """LP_PA_CBND_BUBUN geomFilter=POINT → PNU·공시지가(jiga)·공시연도(gosi_year)"""
    async with httpx.AsyncClient(timeout=10.0) as c:
        r = await c.get(VWORLD_DATA, params={
            "service": "data", "request": "GetFeature",
            "data": "LP_PA_CBND_BUBUN", "key": LAND_API_KEY,
            "geometry": "false", "attribute": "true",
            "size": "1", "crs": "EPSG:4326",
            "geomFilter": f"POINT({x} {y})",
            "format": "json",
        })
    features = (
        r.json().get("response", {})
                .get("result", {})
                .get("featureCollection", {})
                .get("features", [])
    )
    return features[0]["properties"] if features else {}


async def _jimok(pnu: str) -> str:
    """V-World 토지임야대장 ladfrlList → 지목명(lndcgrCodeNm)"""
    async with httpx.AsyncClient(timeout=10.0) as c:
        r = await c.get(f"{VWORLD_NED}/ladfrlList", params={
            "key": LAND_API_KEY, "pnu": pnu,
            "format": "json", "numOfRows": "1", "pageNo": "1",
        })
    try:
        row = r.json()["ladfrlVOList"]["ladfrlVOList"][0]
        return row.get("lndcgrCodeNm", "").strip()
    except Exception:
        return ""


# 용도지역 이름 → (category, 관련법)
_ZONE_KEYWORDS: list[tuple[str, str, str]] = [
    # 용도지역 (국토계획법)
    ("주거지역", "용도지역", "국토의 계획 및 이용에 관한 법률"),
    ("상업지역", "용도지역", "국토의 계획 및 이용에 관한 법률"),
    ("공업지역", "용도지역", "국토의 계획 및 이용에 관한 법률"),
    ("녹지지역", "용도지역", "국토의 계획 및 이용에 관한 법률"),
    ("관리지역", "용도지역", "국토의 계획 및 이용에 관한 법률"),
    ("농림지역", "용도지역", "국토의 계획 및 이용에 관한 법률"),
    ("자연환경보전지역", "용도지역", "국토의 계획 및 이용에 관한 법률"),
    # 용도지구 (국토계획법)
    ("경관지구", "용도지구", "국토의 계획 및 이용에 관한 법률"),
    ("고도지구", "용도지구", "국토의 계획 및 이용에 관한 법률"),
    ("방화지구", "용도지구", "국토의 계획 및 이용에 관한 법률"),
    ("방재지구", "용도지구", "국토의 계획 및 이용에 관한 법률"),
    ("보호지구", "용도지구", "국토의 계획 및 이용에 관한 법률"),
    ("취락지구", "용도지구", "국토의 계획 및 이용에 관한 법률"),
    ("개발진흥지구", "용도지구", "국토의 계획 및 이용에 관한 법률"),
    ("특정용도제한지구", "용도지구", "국토의 계획 및 이용에 관한 법률"),
    ("복합용도지구", "용도지구", "국토의 계획 및 이용에 관한 법률"),
    ("미관지구", "용도지구", "국토의 계획 및 이용에 관한 법률"),
    # 용도구역 (국토계획법)
    ("개발제한구역", "용도구역", "국토의 계획 및 이용에 관한 법률"),
    ("도시자연공원구역", "용도구역", "국토의 계획 및 이용에 관한 법률"),
    ("시가화조정구역", "용도구역", "국토의 계획 및 이용에 관한 법률"),
    ("수산자원보호구역", "용도구역", "국토의 계획 및 이용에 관한 법률"),
    ("입지규제최소구역", "용도구역", "국토의 계획 및 이용에 관한 법률"),
    # 지구단위계획구역
    ("지구단위계획구역", "용도구역", "국토의 계획 및 이용에 관한 법률"),
    # 기타 (다른 법령)
    ("토지거래계약에관한허가구역", "용도구역", "부동산 거래신고 등에 관한 법률"),
    ("농업진흥구역", "용도구역", "농지법"),
    ("농업보호구역", "용도구역", "농지법"),
    ("보전산지", "용도구역", "산지관리법"),
    ("준보전산지", "용도구역", "산지관리법"),
]

def _classify_zone(uname: str) -> tuple[str, str]:
    """zone 이름 → (category, law)"""
    for keyword, cat, law in _ZONE_KEYWORDS:
        if keyword in uname:
            return cat, law
    if uname.endswith("지역"):
        return "용도지역", "국토의 계획 및 이용에 관한 법률"
    if uname.endswith("지구"):
        return "용도지구", "국토의 계획 및 이용에 관한 법률"
    if uname.endswith("구역"):
        return "용도구역", "국토의 계획 및 이용에 관한 법률"
    return "", ""


async def _fetch_zones(x: float, y: float) -> list[dict]:
    """지역·지구·구역 통합 조회

    소스 우선순위:
    1. V-World req/data LT_C_UQ111 (용도지역) + LT_C_UQ141 (기타지역지구) — 실시간
    2. 로컬 내장 데이터 (용도지구 폴리곤) — shapely point-in-polygon
    3. LIVE_ZONE_PROVIDERS — 향후 KLIP API 등 추가 예정
    """
    zones: list[dict] = []
    seen: set[str] = set()

    # ① V-World req/data (용도지역·기타지역지구) — 정상 작동
    async with httpx.AsyncClient(timeout=10.0) as c:
        for layer in ["LT_C_UQ111", "LT_C_UQ141"]:
            try:
                r = await c.get(VWORLD_DATA, params={
                    "service": "data", "request": "GetFeature",
                    "data": layer, "key": LAND_API_KEY,
                    "geometry": "false", "attribute": "true",
                    "size": "50", "crs": "EPSG:4326",
                    "geomFilter": f"POINT({x} {y})",
                    "format": "json",
                })
                features = (
                    r.json().get("response", {})
                            .get("result", {})
                            .get("featureCollection", {})
                            .get("features", [])
                )
                for f in features:
                    uname = f.get("properties", {}).get("uname", "").strip()
                    if not uname or uname in seen:
                        continue
                    seen.add(uname)
                    cat, law = _classify_zone(uname)
                    zones.append({"name": uname, "category": cat, "law": law})
            except Exception as e:
                logging.warning("_fetch_zones %s error: %s", layer, e)

    # ② 로컬 내장 데이터 (용도지구) — download_zone_data.py 실행 후 활성화
    for zone in _query_local_zones(x, y):
        if zone["name"] not in seen:
            seen.add(zone["name"])
            zones.append(zone)

    # ③ Live API 훅 (KLIP API 공개 시 LIVE_ZONE_PROVIDERS 에 추가)
    for provider in LIVE_ZONE_PROVIDERS:
        try:
            for zone in await provider(x, y):
                if zone["name"] not in seen:
                    seen.add(zone["name"])
                    zones.append(zone)
        except Exception as e:
            logging.warning("live zone provider error: %s", e)

    return zones


async def search_land_use_activities(land_use_nm: str, page: int = 1, size: int = 20) -> list[dict]:
    """DTsearchLunCd: 토지이용행위명으로 행위코드 검색
    arLandUseInfoService의 유일하게 동작하는 엔드포인트.
    건축법규 검토 시 행위코드(LUN_CD)와 행위명(LUN_NM) 조회에 사용.
    """
    if not LURIS_KEY:
        return []
    try:
        async with httpx.AsyncClient(timeout=15.0) as c:
            r = await c.get(LURIS_SEARCH_URL, params={
                "serviceKey": LURIS_KEY,
                "pageNum": str(page),
                "numOfRows": str(size),
                "landUseNm": land_use_nm,
            })
        content = r.content.decode("euc-kr", errors="replace")
        root = ET.fromstring(content)
        if root.findtext(".//resultCode") != "0":
            return []
        return [
            {"lun_cd": item.findtext("LUN_CD") or "", "lun_nm": item.findtext("LUN_NM") or ""}
            for item in root.findall(".//item")
        ]
    except Exception as e:
        logging.warning("search_land_use_activities error: %s", e)
        return []


async def fetch_parcel_info(address: str) -> dict:
    base: dict = {"address": address, "jimok": "", "pblnt_pric": "", "zones": [], "error": ""}

    try:
        coords = await geocode(address)
    except Exception as e:
        return {**base, "error": f"주소 변환 실패: {e}"}

    if not coords:
        return {**base, "error": "주소를 찾을 수 없습니다"}

    x, y = coords

    # 공시지가 + PNU
    pnu = ""
    pblnt_pric = ""
    try:
        props = await _parcel_props(x, y)
        pnu   = props.get("pnu", "")
        jiga  = props.get("jiga", "")
        year  = props.get("gosi_year", "")
        if jiga:
            pblnt_pric = f"{int(jiga):,} 원/㎡" + (f" ({year})" if year else "")
    except Exception:
        pass

    # 지목
    jimok = ""
    if pnu:
        try:
            jimok = await _jimok(pnu)
        except Exception:
            pass

    # 용도지역지구: V-World req/data LT_C_UQ111 (용도지역) + LT_C_UQ141 (기타지역지구) geomFilter
    zones: list[dict] = []
    try:
        zones = await _fetch_zones(x, y)
    except Exception:
        pass

    return {**base, "jimok": jimok, "pblnt_pric": pblnt_pric, "zones": zones}
