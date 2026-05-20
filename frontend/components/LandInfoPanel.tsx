'use client';
import { LandInfoResult, LandZone } from '@/types';

// 법제처 법령명 → 직접 링크 (없으면 검색 URL)
function lawUrl(lawName: string): string {
  const DIRECT: Record<string, string> = {
    '국토의 계획 및 이용에 관한 법률': '국토의계획및이용에관한법률',
    '농지법': '농지법',
    '산지관리법': '산지관리법',
    '자연환경보전법': '자연환경보전법',
    '수도권정비계획법': '수도권정비계획법',
    '군사기지 및 군사시설 보호법': '군사기지및군사시설보호법',
    '하천법': '하천법',
    '소하천정비법': '소하천정비법',
    '도로법': '도로법',
    '도시개발법': '도시개발법',
    '도시 및 주거환경정비법': '도시및주거환경정비법',
    '도시공원 및 녹지 등에 관한 법률': '도시공원및녹지등에관한법률',
    '문화재보호법': '문화재보호법',
    '초지법': '초지법',
    '공항시설법': '공항시설법',
    '철도안전법': '철도안전법',
    '항만법': '항만법',
    '택지개발촉진법': '택지개발촉진법',
    '주택법': '주택법',
    '건축법': '건축법',
    '사방사업법': '사방사업법',
    '부동산 거래신고 등에 관한 법률': '부동산거래신고등에관한법률',
    '개발제한구역의 지정 및 관리에 관한 특별조치법': '개발제한구역의지정및관리에관한특별조치법',
  };
  const slug = DIRECT[lawName];
  if (slug) return `https://www.law.go.kr/법령/${slug}`;
  if (!lawName) return 'https://www.law.go.kr/';
  return `https://www.law.go.kr/lsSc.do?query=${encodeURIComponent(lawName)}`;
}

// 구분 → 배지 스타일
const CAT_CLS: Record<string, string> = {
  '용도지역': 'bg-blue-50 text-blue-600 border-blue-100',
  '용도지구': 'bg-violet-50 text-violet-600 border-violet-100',
  '용도구역': 'bg-orange-50 text-orange-600 border-orange-100',
};

function ZoneTag({ zone }: { zone: LandZone }) {
  const catCls = CAT_CLS[zone.category] ?? 'bg-gray-50 text-gray-500 border-gray-200';
  return (
    <a
      href={lawUrl(zone.law)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 group"
      title={zone.law || '법제처에서 보기'}
    >
      {zone.category && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium leading-none flex-shrink-0 ${catCls}`}>
          {zone.category}
        </span>
      )}
      <span className="text-sm text-gray-800 group-hover:text-teal-700 group-hover:underline transition-colors leading-snug">
        {zone.name}
      </span>
      <svg className="w-3 h-3 text-gray-300 group-hover:text-teal-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
      </svg>
    </a>
  );
}

interface Props {
  result: LandInfoResult | null;
  loading?: boolean;
}

export default function LandInfoPanel({ result, loading }: Props) {
  if (loading) {
    return (
      <div className="border border-gray-100 rounded-xl p-4 bg-gray-50 flex items-center gap-2 text-sm text-gray-400">
        <svg className="w-4 h-4 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
        </svg>
        토지정보 조회 중...
      </div>
    );
  }

  if (!result) return null;

  const hasAnyData = result.parcels.some(p => p.jimok || p.pblnt_pric || p.error) || result.merged_zones.length > 0;
  if (!hasAnyData) return null;

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden text-sm">

      {/* 지번별 지목 / 공시지가 */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">지번별 토지정보</p>
        <div className="space-y-1.5">
          {result.parcels.map((p, i) => (
            <div key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <span className="text-xs text-gray-400 flex-shrink-0 max-w-[200px] truncate">{p.address}</span>
              {p.error ? (
                <span className="text-xs text-red-400">{p.error}</span>
              ) : (
                <>
                  {p.jimok && (
                    <span className="flex items-center gap-1">
                      <span className="text-xs text-gray-400">지목</span>
                      <span className="font-medium text-gray-900">{p.jimok}</span>
                    </span>
                  )}
                  {p.pblnt_pric && (
                    <span className="flex items-center gap-1">
                      <span className="text-xs text-gray-400">공시지가</span>
                      <span className="font-medium text-gray-900">{p.pblnt_pric}</span>
                    </span>
                  )}
                  {!p.jimok && !p.pblnt_pric && (
                    <span className="text-xs text-gray-300">정보 없음</span>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 지역·지구·구역 (전 지번 통합·중복제거) */}
      <div className="px-4 py-3">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">지역·지구·구역</p>
        {result.merged_zones.length > 0 ? (
          <div className="flex flex-wrap gap-x-5 gap-y-2.5">
            {result.merged_zones.map((z, i) => (
              <ZoneTag key={i} zone={z} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-400 leading-relaxed">
            API에서 용도지역·지구·구역 자동 조회 불가 —{' '}
            <a
              href="https://luris.molit.go.kr"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-teal-600"
            >
              luris.molit.go.kr
            </a>
            에서 직접 확인 후 위 양식에 입력하세요.
          </p>
        )}
      </div>
    </div>
  );
}
