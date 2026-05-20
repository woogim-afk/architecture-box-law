import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from schemas import ProjectInfo
from agents import run_pipeline
from law_api import get_parcel_area
from land_info_api import fetch_parcel_info

app = FastAPI(title="건축법규 AI 검토 시스템", version="0.1.0")

# ── CORS 설정 (프론트엔드 localhost:3000 허용) ───────────
_origins_env = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000")
_origins = [o.strip() for o in _origins_env.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── 헬스체크 ─────────────────────────────────────────────
@app.get("/")
def root():
    return {"status": "ok", "service": "건축법규 AI 검토 시스템"}


# ── 메인 검토 엔드포인트 ──────────────────────────────────
@app.post("/api/review")
async def review(info: ProjectInfo):
    """
    프로젝트 정보를 받아 멀티에이전트 파이프라인 실행 후 검토 결과 반환
    """
    try:
        result = await run_pipeline(info.model_dump())
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── 필지 면적 조회 ────────────────────────────────────────
@app.get("/api/land-area")
async def land_area_lookup(address: str):
    try:
        area = await get_parcel_area(address)
        return {"area": area}
    except Exception:
        return {"area": None}


# ── 토지정보 조회 ─────────────────────────────────────────
@app.post("/api/land-info")
async def land_info(addresses: list[str]):
    parcels = []
    for addr in addresses:
        try:
            info = await fetch_parcel_info(addr)
        except Exception as e:
            info = {"address": addr, "jimok": "", "pblnt_pric": "", "zones": [], "error": str(e)}
        parcels.append(info)

    seen: set[str] = set()
    merged: list[dict] = []
    for p in parcels:
        for z in p.get("zones", []):
            if z["name"] not in seen:
                seen.add(z["name"])
                merged.append(z)

    return {"parcels": parcels, "merged_zones": merged}


# ── 실행 ─────────────────────────────────────────────────
# uvicorn main:app --reload --port 8000
