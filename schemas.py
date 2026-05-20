from pydantic import BaseModel
from typing import Optional


class LandZone(BaseModel):
    name: str
    law: str = ""
    category: str = ""


class LandParcelInfo(BaseModel):
    address: str
    jimok: str = ""
    pblnt_pric: str = ""
    zones: list[LandZone] = []
    error: str = ""


class LandInfoResult(BaseModel):
    parcels: list[LandParcelInfo]
    merged_zones: list[LandZone]


class ProjectInfo(BaseModel):
    location: str           # 대지 위치 (예: 제주특별자치도 제주시)
    zone: str               # 용도지역 (예: 제2종 일반주거지역)
    usage: str              # 건축물 주용도 (예: 공동주택)
    site_area: float        # 대지면적 (㎡)
    bldg_area: float        # 건축면적 (㎡)
    total_area: float       # 연면적 (㎡)
    floors: str             # 층수 (예: "6/1" → 지상6/지하1)
    height: float           # 최고높이 (m)
    parking: int            # 주차 대수
    units: Optional[int] = None            # 세대수 (공동주택)
    district: Optional[str] = None        # 지구단위계획 구역명
    height_limit: Optional[str] = None    # 고도제한 (제주도 도시계획조례)
    parking_legal: Optional[int] = None   # 법정 주차대수 (프론트 자동계산)
    drawing_files: Optional[list[str]] = None  # 첨부 도면 파일명


class ReviewItem(BaseModel):
    name: str
    status: str             # "pass" | "fail" | "warn"
    detail: str
    law: str


class ReviewCategory(BaseModel):
    name: str
    items: list[ReviewItem]


class ReviewSummary(BaseModel):
    passed: int
    failed: int
    warned: int


class ReviewResult(BaseModel):
    summary: ReviewSummary
    categories: list[ReviewCategory]
