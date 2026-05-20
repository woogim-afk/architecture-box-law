'use client';

const AGENTS = [
  { step: 1, name: '프로젝트 정보 분석',   desc: '건폐율·용적률 등 수치 계산' },
  { step: 2, name: '용도지역 법규 검색',   desc: '법제처 API 연동 + 기준치 정리' },
  { step: 3, name: '지구단위계획 매칭',    desc: '해당 구역 고시 자동 연결' },
  { step: 4, name: '설계기준 적합성 판단', desc: '38개 항목 pass/fail/warn 판정' },
  { step: 5, name: '최종 보고서 생성',     desc: 'JSON 구조화 + 근거 법령 정리' },
];

interface Props {
  currentStep: number;
}

export default function AgentProgress({ currentStep }: Props) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-600 mb-3">수퍼바이저 에이전트가 파이프라인을 총괄합니다</p>
      {AGENTS.map(({ step, name, desc }) => {
        const done    = currentStep > step;
        const running = currentStep === step;
        return (
          <div key={step} className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-all ${
            running ? 'border-teal-300 bg-teal-50' :
            done    ? 'border-gray-100 bg-gray-50' :
                      'border-gray-100 bg-white'
          }`}>
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
              done    ? 'bg-teal-500' :
              running ? 'bg-teal-400 animate-pulse' :
                        'bg-gray-200'
            }`} />
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${running ? 'text-teal-700' : done ? 'text-gray-600' : 'text-gray-600'}`}>
                {name}
              </p>
              <p className="text-xs text-gray-600 truncate">{desc}</p>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
              done    ? 'bg-teal-100 text-teal-700' :
              running ? 'bg-teal-100 text-teal-600' :
                        'bg-gray-100 text-gray-600'
            }`}>
              {done ? '완료' : running ? '처리 중' : '대기'}
            </span>
          </div>
        );
      })}
    </div>
  );
}
