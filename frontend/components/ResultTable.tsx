'use client';
import { useState } from 'react';
import { ReviewResult, ReviewStatus } from '@/types';
import { exportToExcel } from '@/utils/exportExcel';

const STATUS_MAP: Record<ReviewStatus, { label: string; cls: string; dot: string }> = {
  pass: { label: '적합',    cls: 'bg-teal-50 text-teal-700',   dot: 'bg-teal-500' },
  fail: { label: '부적합',  cls: 'bg-red-50 text-red-700',     dot: 'bg-red-500'  },
  warn: { label: '검토필요', cls: 'bg-amber-50 text-amber-700', dot: 'bg-amber-400' },
};

interface Props {
  result: ReviewResult;
  projectName?: string;
}

export default function ResultTable({ result, projectName = '법규검토' }: Props) {
  const [openCats, setOpenCats] = useState<Set<number>>(new Set([0, 1, 2]));

  const toggle = (i: number) =>
    setOpenCats(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  const { passed, failed, warned } = result.summary;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center bg-teal-50 rounded-xl p-4">
          <div className="text-2xl font-semibold text-teal-700">{passed}</div>
          <div className="text-xs text-teal-600 mt-1">적합</div>
        </div>
        <div className="text-center bg-red-50 rounded-xl p-4">
          <div className="text-2xl font-semibold text-red-700">{failed}</div>
          <div className="text-xs text-red-600 mt-1">부적합</div>
        </div>
        <div className="text-center bg-amber-50 rounded-xl p-4">
          <div className="text-2xl font-semibold text-amber-700">{warned}</div>
          <div className="text-xs text-amber-600 mt-1">검토필요</div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => exportToExcel(result, projectName)}
          className="flex items-center gap-2 text-sm border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
          </svg>
          Excel 내보내기
        </button>
      </div>

      {result.categories.map((cat, ci) => {
        const isOpen  = openCats.has(ci);
        const catFail = cat.items.filter(i => i.status === 'fail').length;
        const catWarn = cat.items.filter(i => i.status === 'warn').length;
        const catPass = cat.items.filter(i => i.status === 'pass').length;

        return (
          <div key={ci} className="border border-gray-100 rounded-xl overflow-hidden">
            <button
              onClick={() => toggle(ci)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
            >
              <span className="text-sm font-medium">{cat.name}</span>
              <div className="flex items-center gap-2">
                {catPass > 0 && <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full">적합 {catPass}</span>}
                {catFail > 0 && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">부적합 {catFail}</span>}
                {catWarn > 0 && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">검토 {catWarn}</span>}
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                </svg>
              </div>
            </button>

            {isOpen && (
              <div className="divide-y divide-gray-50">
                {cat.items.map((item, ii) => {
                  const st = STATUS_MAP[item.status] ?? STATUS_MAP.warn;
                  return (
                    <div key={ii} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${st.dot}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{item.name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                        </div>
                        <p className="text-xs text-gray-700 mt-1 leading-relaxed">{item.detail}</p>
                        {item.law && item.law !== '-' && (
                          <code className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded mt-1 inline-block">
                            {item.law}
                          </code>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
