# 건축법규 AI 검토 시스템

Claude 멀티에이전트 기반 건축법규 자동 검토 프로토타입

## 기술 스택

- **Backend**: FastAPI + Anthropic SDK + httpx
- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **외부 API**: 법제처 Open API, 국토부 V-World API

## 빠른 시작

### 1. API 키 발급
- Anthropic: https://console.anthropic.com
- 법제처: https://api.law.go.kr (회원가입 후 발급)
- 국토부 V-World: https://vworld.kr (회원가입 후 발급)

### 2. 백엔드 실행

```bash
cd backend
pip install fastapi uvicorn httpx anthropic python-dotenv pydantic
cp .env.example .env      # .env 파일 생성 후 API 키 입력
uvicorn main:app --reload --port 8000
```

### 3. 프론트엔드 실행

```bash
cd frontend
npx create-next-app@latest . --typescript --tailwind --app
npm install xlsx
npm run dev               # http://localhost:3000
```

## 멀티에이전트 파이프라인

```
수퍼바이저
├── 1. project_analyst   → 건폐율·용적률 등 수치 계산
├── 2. law_searcher      → 용도지역 법규 + 법제처 API
├── 3. district_matcher  → 지구단위계획 고시 매칭
├── 4. compliance_judge  → 38개 항목 적합성 판단
└── 5. report_writer     → JSON 보고서 생성
```

## 검토 항목 (8개 카테고리)

1. 용도지역·건폐율·용적률
2. 일조권·채광·이격거리
3. 피난·방화 시설
4. 주차장 설치
5. 친환경·에너지
6. 장애인·편의시설
7. 지구단위계획 고시
8. 도로·대지

## 주의사항

- AI 검토 결과는 **참고용**이며 최종 검토는 담당 건축사 확인 필요
- 법제처·국토부 API 키 미입력 시 내장 법규 데이터로 대체 동작
