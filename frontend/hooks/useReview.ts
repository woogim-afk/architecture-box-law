import { useState } from 'react';
import { ProjectFormData, ReviewResult } from '@/types';

export function useReview() {
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState<ReviewResult | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const [step,    setStep]    = useState(0);

  const runReview = async (projectInfo: ProjectFormData) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setStep(1);

    let stepIdx = 1;
    const timer = setInterval(() => {
      if (stepIdx < 5) setStep(++stepIdx);
      else clearInterval(timer);
    }, 1800);

    try {
      const res = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(projectInfo),
      });

      clearInterval(timer);

      if (!res.ok) throw new Error('검토 요청 실패');
      const data: ReviewResult = await res.json();
      setResult(data);
      setStep(6);
    } catch (e: unknown) {
      clearInterval(timer);
      setError(e instanceof Error ? e.message : '알 수 없는 오류');
    } finally {
      setLoading(false);
    }
  };

  return { loading, result, error, step, runReview };
}
