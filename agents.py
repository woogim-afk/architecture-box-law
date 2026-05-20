import anthropic
import json
import os
from dotenv import load_dotenv
from prompts import PROMPTS
from law_api import search_law, get_district_plan

load_dotenv()

client = anthropic.AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
MODEL  = "claude-sonnet-4-6"


# ────────────────────────────────────────────
# 단일 에이전트 실행
# ────────────────────────────────────────────
async def run_agent(name: str, user_msg: str) -> str:
    msg = await client.messages.create(
        model=MODEL,
        max_tokens=2000,
        system=PROMPTS[name],
        messages=[{"role": "user", "content": user_msg}],
        timeout=120.0,
    )
    return msg.content[0].text


# ────────────────────────────────────────────
# 수퍼바이저: 5개 에이전트 순차 실행
# ────────────────────────────────────────────
async def run_pipeline(project_info: dict, on_progress=None) -> dict:
    """
    파이프라인 흐름:
    1. project_analyst  → 수치 계산 (건폐율·용적률 등)
    2. law_searcher     → 적용 법령 및 기준치 정리
    3. district_matcher → 지구단위계획 매칭
    4. compliance_judge → 항목별 적합성 판단
    5. report_writer    → JSON 보고서 생성
    """
    ctx = json.dumps(project_info, ensure_ascii=False, indent=2)

    def notify(step: int, label: str):
        if on_progress:
            on_progress({"step": step, "label": label})

    # ── 1. 프로젝트 정보 분석 ──────────────────
    notify(1, "프로젝트 정보 분석 중...")
    analysis = await run_agent("project_analyst", ctx)

    # ── 2. 법규 검색 (법제처 API 병행) ──────────
    notify(2, "용도지역 법규 검색 중...")
    try:
        law_raw = await search_law("건축법 용도지역")
        law_ctx = json.dumps(law_raw, ensure_ascii=False)[:1000]  # 토큰 절약
    except Exception:
        law_ctx = "(법제처 API 연결 실패 — 내장 법규 데이터로 대체)"

    law_data = await run_agent(
        "law_searcher",
        f"프로젝트 정보:\n{ctx}\n\n수치 분석:\n{analysis}\n\n법제처 참고:\n{law_ctx}"
    )

    # ── 3. 지구단위계획 매칭 ─────────────────────
    notify(3, "지구단위계획 고시 매칭 중...")
    try:
        district_raw = await get_district_plan(project_info.get("location", ""))
        district_ctx = json.dumps(district_raw, ensure_ascii=False)[:500]
    except Exception:
        district_ctx = "(지구단위계획 API 연결 실패 — 입력 정보 기준 판단)"

    district = await run_agent(
        "district_matcher",
        f"프로젝트 정보:\n{ctx}\n\n지구단위계획 API 결과:\n{district_ctx}"
    )

    # ── 4. 적합성 판단 (핵심) ────────────────────
    notify(4, "설계기준 적합성 판단 중...")
    review = await run_agent(
        "compliance_judge",
        f"프로젝트 정보:\n{ctx}\n\n수치 분석:\n{analysis}\n\n법규 기준:\n{law_data}\n\n지구단위계획:\n{district}"
    )

    # ── 5. JSON 보고서 생성 ───────────────────────
    notify(5, "최종 보고서 생성 중...")
    report_str = await run_agent(
        "report_writer",
        f"검토 결과:\n{review}\n\n프로젝트 정보:\n{ctx}"
    )

    clean = report_str.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        return json.loads(clean)
    except json.JSONDecodeError as e:
        raise ValueError(f"보고서 JSON 파싱 실패: {e}\n원본:\n{clean[:300]}")
