import httpx
import math
import os
from dotenv import load_dotenv

load_dotenv()

LAW_API_KEY  = os.getenv("LAW_API_KEY")
LAND_API_KEY = os.getenv("LAND_API_KEY")
DATA_API_KEY = os.getenv("DATA_API_KEY")

LAW_BASE_URL  = "https://api.law.go.kr/DRF"
LAND_BASE_URL = "https://api.vworld.kr/req/data"


async def search_law(query: str) -> dict:
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get(
            f"{LAW_BASE_URL}/lawSearch.do",
            params={"target": "law", "query": query, "type": "JSON", "OC": LAW_API_KEY},
        )
    r.raise_for_status()
    return r.json()


async def get_law_content(law_id: str) -> dict:
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get(
            f"{LAW_BASE_URL}/lawService.do",
            params={"target": "law", "ID": law_id, "type": "JSON", "OC": LAW_API_KEY},
        )
    r.raise_for_status()
    return r.json()


async def get_land_use_zone(x: float, y: float) -> dict:
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get(
            LAND_BASE_URL,
            params={
                "service": "data",
                "request": "GetFeature",
                "data": "LP_PA_CBND_BUBUN",
                "key": LAND_API_KEY,
                "geometry": "false",
                "attribute": "true",
                "size": "1",
                "page": "1",
                "crs": "EPSG:4326",
                "bbox": f"{x-0.001},{y-0.001},{x+0.001},{y+0.001}",
                "format": "json",
            },
        )
    r.raise_for_status()
    return r.json()


async def geocode_address(address: str) -> tuple[float, float] | None:
    """주소 → (경도, 위도) 변환 (V-World 지오코딩, parcel → road 순서로 시도)"""
    if not LAND_API_KEY or LAND_API_KEY.startswith("여기에"):
        return None
    async with httpx.AsyncClient(timeout=10.0) as client:
        for addr_type in ("parcel", "road"):
            r = await client.get(
                "https://api.vworld.kr/req/address",
                params={
                    "service": "address",
                    "request": "getcoord",
                    "version": "2.0",
                    "crs": "epsg:4326",
                    "address": address,
                    "refine": "true",
                    "simple": "false",
                    "format": "json",
                    "type": addr_type,
                    "key": LAND_API_KEY,
                },
            )
            data = r.json()
            try:
                if data["response"]["status"] == "OK":
                    pt = data["response"]["result"]["point"]
                    return float(pt["x"]), float(pt["y"])
            except (KeyError, TypeError):
                continue
    return None


def _polygon_area_m2(ring: list) -> float:
    """WGS84 폴리곤 좌표 리스트 → 면적(㎡) 근사 (슈레이스 공식)"""
    lat_c = sum(c[1] for c in ring) / len(ring)
    scale_x = 111195 * math.cos(math.radians(lat_c))
    scale_y = 111195
    area = 0.0
    n = len(ring)
    for i in range(n):
        x1, y1 = ring[i][0] * scale_x, ring[i][1] * scale_y
        x2, y2 = ring[(i + 1) % n][0] * scale_x, ring[(i + 1) % n][1] * scale_y
        area += x1 * y2 - x2 * y1
    return abs(area) / 2


async def _get_area_from_vworld(pnu: str) -> float | None:
    """V-World 토지임야목록조회 API로 공식 지적 면적 조회 (lndpclAr 필드)"""
    if not LAND_API_KEY:
        return None
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                "https://api.vworld.kr/ned/data/ladfrlList",
                params={
                    "key": LAND_API_KEY,
                    "pnu": pnu,
                    "format": "json",
                    "numOfRows": "1",
                    "pageNo": "1",
                },
            )
        data = r.json()
        area = data["ladfrlVOList"]["ladfrlVOList"][0]["lndpclAr"]
        return float(area) if area else None
    except Exception:
        return None


async def _vworld_feature(x: float, y: float, geometry: bool) -> dict | None:
    """V-World 지적도에서 feature 한 건 조회"""
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get(
            LAND_BASE_URL,
            params={
                "service": "data",
                "request": "GetFeature",
                "data": "LP_PA_CBND_BUBUN",
                "key": LAND_API_KEY,
                "geometry": "true" if geometry else "false",
                "attribute": "false" if geometry else "true",
                "size": "1",
                "page": "1",
                "crs": "EPSG:4326",
                "geomFilter": f"POINT({x} {y})",
                "format": "json",
            },
        )
    try:
        return r.json()["response"]["result"]["featureCollection"]["features"][0]
    except (KeyError, TypeError, IndexError):
        return None


async def get_parcel_area(address: str) -> float | None:
    """주소 → 필지 면적(㎡) 조회
    1순위: data.go.kr 토지임야대장 (공식 지적 면적)
    2순위: V-World 지적도 폴리곤 계산 (근사값)
    """
    coords = await geocode_address(address)
    if not coords:
        return None
    x, y = coords

    # PNU 조회 (속성 요청)
    attr_feat = await _vworld_feature(x, y, geometry=False)
    pnu = attr_feat["properties"].get("pnu") if attr_feat else None

    # 1순위: V-World 토지임야목록조회 공식 면적
    if pnu:
        official = await _get_area_from_vworld(pnu)
        if official:
            return round(official, 1)

    # 2순위: V-World 폴리곤 면적 계산 (별도 요청)
    geom_feat = await _vworld_feature(x, y, geometry=True)
    if not geom_feat:
        return None
    try:
        geom = geom_feat["geometry"]
        ring = geom["coordinates"][0][0] if geom["type"] == "MultiPolygon" else geom["coordinates"][0]
        return round(_polygon_area_m2(ring), 1)
    except (KeyError, TypeError, IndexError):
        return None


async def get_district_plan(location: str) -> dict:
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get(
            f"{LAW_BASE_URL}/lawSearch.do",
            params={
                "target": "ordin",
                "query": f"{location} 지구단위계획",
                "type": "JSON",
                "OC": LAW_API_KEY,
            },
        )
    r.raise_for_status()
    return r.json()
