# 건축법규 AI 검토 시스템 — 작업 요약

## 프로젝트 개요

Claude 멀티에이전트를 이용한 건축법규 자동 검토 웹 애플리케이션.
사용자가 건축 프로젝트 정보를 입력하면 5개 에이전트가 순차적으로 실행되어 8개 카테고리 / 38개 항목을 법규 기준과 대조해 검토 보고서를 생성한다.

---

## 파일 구조 및 역할

### 백엔드 (FastAPI + Anthropic SDK)

| 파일 | 역할 |
|---|---|
| `main.py` | FastAPI 앱 진입점, CORS 설정, `/api/review` + `/api/land-info` 엔드포인트 |
| `agents.py` | 5단계 멀티에이전트 파이프라인 (`run_pipeline`) |
| `prompts.py` | 에이전트별 시스템 프롬프트 딕셔너리 |
| `schemas.py` | Pydantic 모델 (`ProjectInfo`, `ReviewResult` 등) |
| `law_api.py` | 법제처 API (OC 인증키 방식), 자치법규 API 호출 |
| `land_info_api.py` | V-World 지오코딩·지목·공시지가 조회, LURIS 행위코드 검색 |
| `requirements.txt` | fastapi, uvicorn, anthropic, httpx, python-dotenv, pydantic |
| `railway.toml` | Railway 배포 설정 (nixpacks 빌드, uvicorn 실행) |

**멀티에이전트 파이프라인:**
```
run_pipeline()
 ├── 1. project_analyst   → 건폐율·용적률 수치 계산
 ├── 2. law_searcher      → 용도지역별 법령·기준치 정리 (법제처 API 병행)
 ├── 3. district_matcher  → 지구단위계획 고시 매칭 (법제처 자치법규 API)
 ├── 4. compliance_judge  → 항목별 pass/fail/warn 판단
 └── 5. report_writer     → 최종 JSON 보고서 생성
```

### 프론트엔드 (`frontend/` — Next.js 14 App Router + TypeScript + Tailwind)

| 경로 | 역할 |
|---|---|
| `app/page.tsx` | 메인 페이지 (form → progress → result 3단계 뷰 전환) |
| `app/api/review/route.ts` | Next.js API Route — 백엔드 `/api/review` 프록시 |
| `app/api/land-info/route.ts` | Next.js API Route — 백엔드 `/api/land-info` 프록시 |
| `components/ProjectForm.tsx` | 프로젝트 정보 입력 폼 (건폐율·용적률 자동 계산 표시) |
| `components/LandInfoPanel.tsx` | 토지정보 패널 (지목·공시지가·용도지역 자동조회, 법제처 링크 연결) |
| `components/AgentProgress.tsx` | 에이전트 단계별 진행 상황 표시 |
| `components/ResultTable.tsx` | 검토 결과 테이블 (카테고리별 pass/fail/warn 색상 표시) |
| `hooks/useReview.ts` | 검토 요청 상태 관리 훅 |
| `types/index.ts` | TypeScript 타입 정의 (`ProjectFormData`, `ReviewResult`, `LandInfoResult` 등) |
| `utils/exportExcel.ts` | 검토 결과 Excel 다운로드 유틸 |

---

## 환경변수 (`.env`)

```
ANTHROPIC_API_KEY=...   # Claude API 키
LAW_API_KEY=...         # 법제처 Open API 인증키 (OC 파라미터, 예: woogim_archi_2026)
LAND_API_KEY=...        # 국토부 V-World API 키 (UUID 형식)
DATA_API_KEY=...        # V-World 두 번째 키 (현재 미사용)
LURIS_API_KEY=...       # data.go.kr 토지이용규제서비스 키 (64자리 hex)
```

**프론트엔드 (`frontend/.env.local`):**
```
BACKEND_URL=http://localhost:8000
```

---

## 실행 방법

```bash
# 백엔드
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# 프론트엔드
cd frontend
npm install
npm run dev   # http://localhost:3000
```

---

## 검토 카테고리 (8개)

1. 용도지역·건폐율·용적률
2. 일조권·채광·이격거리
3. 피난·방화 시설
4. 주차장 설치
5. 친환경·에너지
6. 장애인·편의시설
7. 지구단위계획 고시
8. 도로·대지

---

## API 연동 현황

### V-World API (LAND_API_KEY) ✅ 정상 작동
| 기능 | 엔드포인트 | 상태 |
|---|---|---|
| 주소 지오코딩 | `req/address` (parcel→road 순) | ✅ |
| PNU·공시지가 조회 | `req/data` — `LP_PA_CBND_BUBUN` 레이어 | ✅ |
| 지목 조회 | `ned/data/ladfrlList` | ✅ |
| 용도지역 조회 | `req/data` — `LT_C_UQ111` 레이어 (geomFilter POINT) | ✅ |
| 기타지역지구 조회 | `req/data` — `LT_C_UQ141` 레이어 (geomFilter POINT) | ✅ |

예시 (서울 강남구 역삼동 736): 지목=대, 공시지가=68,600,000원/㎡(2025), 용도지역=일반상업지역, 지구단위계획구역, 토지거래계약허가구역

**V-World 지역지구 레이어 조사 결과:**
- `LT_C_UQ111` (용도지역): ✅ 정상 — 일반상업지역, 일반주거지역 등 용도지역명 반환
- `LT_C_UQ141` (기타지역지구): ✅ 정상 — 지구단위계획구역, 토지거래계약허가구역 등
- `LT_C_UQ121` (용도지구), `LT_C_UQ131` (용도구역): NOT_FOUND — V-World `req/data`에서 미제공
- 필터: `geomFilter=POINT(lon lat)` 방식 (좌표 기반 공간 교차), `attrFilter`로 PNU 검색 불가
- 속성: `uname` (지역지구명), `dyear`, `dnum`, `sido_name`, `sigg_name`

**용도지구(LT_C_UQ121) 추가 탐색 결과 — 전체 실패:**
- V-World WFS: 레이어는 존재하나 INTERSECTS/BBOX 공간 필터 완전히 broken (좌표 무시, 전국 데이터 반환)
- V-World WFS 속성 필터(`std_sggcd='11680'`)도 무시됨 — 서버 버그
- V-World `req/data` 대문자(LT_C_UQ121): NOT_FOUND
- data.go.kr 1613000 계열 추가 경로들: 500 Unexpected errors (경로 없음)
- 토지이음(eum.go.kr) 직접 조회: 500 (공개 API 없음)

### 법제처 API (LAW_API_KEY) ✅ 정상 작동
- `law.go.kr` OC 파라미터 방식, 건축법 검색 정상 확인

### data.go.kr LURIS API (LURIS_API_KEY) ⚠️ 구조적 한계

**등록 서비스:** `apis.data.go.kr/1613000/arLandUseInfoService` (승인, 2026-05-14~2028-05-14)

| 엔드포인트 | 필수 파라미터 | 상태 |
|---|---|---|
| `DTsearchLunCd` | `pageNum` + `numOfRows` + `landUseNm` | ✅ 정상 (행위코드 검색) |
| `DTarLandUseInfo` | `areaCd` + `ucodeList` + `landUseNm` | ⚠️ 용도지역 코드 사전 입력 필요 |
| `LuLawInfoService/DTluLawInfo` | `areaCd` + `ucodeList` + `pageNum` + `numOfRows` | ❌ 전국 DB 없음 (0건) |

**핵심 한계:** 두 서비스 모두 용도지역 코드(ucodeList)를 입력으로 받는 구조.
PNU → 용도지구 역방향 조회 불가.

### UPIS/지자체 공공데이터 API ⚠️ 부분 탐색 완료

**구조:**
- upis.go.kr 자체 공개 API는 존재하지 않음
- 공공데이터포털에 **지자체별** UPIS 데이터가 개별 API/파일 형태로 분산 제공
- 전국 통합 단일 API는 미존재

**확인된 예시:**
- 부산광역시 UPIS 용도지역 승인 및 결정조서 내역 OpenAPI (REST, JSON/XML, 자동승인)
- 경기도 양주시 UPIS 용도지구 결정조서 현황 OpenAPI (REST, JSON/XML)
- 단양군 기타용도지구 데이터 (지자체 단위)

**구조적 문제:** 지자체별로 데이터셋 이름·항목·갱신주기·제공방식이 상이 → 전국 자동조회 메인 API로 사용 불가

**향후 방향:** UPIS → KLIP(국토이용정보 통합플랫폼)으로 통합 진행 중 (2022~)

---

## 알려진 이슈 / 미완료 항목

- **용도지구 자동조회 불가**: `LT_C_UQ121`은 V-World req/data에 없고, WFS 공간 필터 broken, UPIS는 지자체별 분산 → 현재 자동조회 방법 없음
- **용도지역 LT_C_UQ111 두 번째 빈 레코드**: uname="" 인 레코드가 가끔 반환됨 — 이미 필터링 처리
- **LuLawInfoService DB 미구축**: 전국 모든 시군구에서 데이터 0건
- AI 결과는 참고용 — 최종 검토는 담당 건축사 확인 필요

## 용도지구 자동조회 구현 옵션 (미구현)

| 방법 | 난이도 | 범위 | 비고 |
|---|---|---|---|
| V-World GIS 파일 다운로드 + shapely 교차 | 중 | 전국 | vworld.kr에서 LT_C_UQ121 GeoJSON 다운, 백엔드 내장, pip install shapely |
| KLIP API 모니터링 | 하 | 전국 | 통합 플랫폼 공개 시 즉시 적용 가능 |
| 지자체별 UPIS API 연동 | 상 | 부분 | 지자체마다 코드 분기 필요, 유지보수 어려움 |
| 사용자 직접 입력 (현행) | - | 전국 | ProjectForm에서 수동 입력 → AI 검토 |

---

## 수정 이력

- `main.py` — `import os` 추가, `info.dict()` → `info.model_dump()` (Pydantic v2)
- `agents.py` — `AsyncAnthropic` 클라이언트, 모델 `claude-sonnet-4-6`
- `law_api.py` — 모든 API 호출 `raise_for_status()` 추가
- `.env` — `LAW_API_KEY=woogim_archi_2026` 업데이트 (법제처 인증키)
- `land_info_api.py` — LURIS URL 구 API → 신 API 마이그레이션, EUC-KR 파싱 처리, V-World LT_C_UQ111/LT_C_UQ141 geomFilter 기반 용도지역 자동조회 구현 (`_fetch_zones`, `_classify_zone` 신규)
- `LandInfoPanel.tsx` — 법제처 `lawUrl()` 함수에 `부동산 거래신고 등에 관한 법률` 등 추가
- 루트 중복 파일 삭제 (`*.tsx`, `*.ts` 8개 — 정상 버전은 `frontend/` 내에 있음)

---

## 배포

- **백엔드:** Railway (`railway.toml` 설정 완료)
- **프론트엔드:** Vercel 또는 Railway 별도 서비스
- 프론트엔드 → `BACKEND_URL` 환경변수로 백엔드 URL 지정
