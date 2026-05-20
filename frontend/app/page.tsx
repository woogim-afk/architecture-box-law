'use client';
import { useState } from 'react';
import ProjectForm from '@/components/ProjectForm';
import AgentProgress from '@/components/AgentProgress';
import ResultTable from '@/components/ResultTable';
import { useReview } from '@/hooks/useReview';
import { ProjectFormData } from '@/types';

type ViewState = 'form' | 'progress' | 'result';

export default function Home() {
  const { loading, result, error, step, runReview } = useReview();
  const [view, setView] = useState<ViewState>('form');
  const [projectName, setProjectName] = useState('');

  const handleSubmit = async (data: ProjectFormData) => {
    setProjectName(data.location);
    setView('progress');
    await runReview(data);
    setView('result');
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 bg-teal-600 rounded-lg flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 10v4M12 10v4M16 10v4"/>
          </svg>
        </div>
        <div>
          <h1 className="text-base font-semibold text-gray-900">건축법규 AI 검토 시스템</h1>
          <p className="text-xs text-gray-600">8개 카테고리 · 38개 항목 자동 검토</p>
        </div>
        <span className="ml-auto text-xs bg-teal-50 text-teal-700 px-3 py-1 rounded-full">v0.1</span>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center gap-2 mb-8 text-xs text-gray-600">
          {['프로젝트 정보', 'AI 분석', '결과 확인'].map((label, i) => {
            const active = view === ['form', 'progress', 'result'][i];
            const done   = (view === 'progress' && i === 0) || (view === 'result' && i <= 1);
            return (
              <span key={i} className="flex items-center gap-2">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium ${
                  active ? 'bg-teal-600 text-white' :
                  done   ? 'bg-teal-100 text-teal-700' :
                           'bg-gray-100 text-gray-600'
                }`}>{i + 1}</span>
                <span className={active ? 'text-gray-700 font-medium' : ''}>{label}</span>
                {i < 2 && <span className="text-gray-200 mx-1">→</span>}
              </span>
            );
          })}
        </div>

        {view === 'form' && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-base font-medium mb-5 text-gray-900">프로젝트 정보 입력</h2>
            <ProjectForm onSubmit={handleSubmit} loading={loading} />
          </div>
        )}

        {view === 'progress' && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-base font-medium mb-5 text-gray-900">AI 분석 중...</h2>
            <AgentProgress currentStep={step} />
          </div>
        )}

        {view === 'result' && result && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-medium text-gray-900">법규 검토 결과</h2>
              <button
                onClick={() => setView('form')}
                className="text-xs text-gray-600 hover:text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5"
              >
                ← 새 검토
              </button>
            </div>
            <ResultTable result={result} projectName={projectName} />
          </div>
        )}

        {view === 'result' && error && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-medium text-gray-900">검토 실패</h2>
              <button
                onClick={() => { setView('form'); }}
                className="text-xs text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5"
              >
                ← 새 검토
              </button>
            </div>
            <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-sm text-red-600">
              오류 발생: {error}
            </div>
          </div>
        )}

        <p className="text-center text-xs text-gray-500 mt-6">
          AI 검토 결과는 참고용이며, 최종 법규 검토는 담당 건축사 확인이 필요합니다
        </p>
      </div>
    </main>
  );
}
