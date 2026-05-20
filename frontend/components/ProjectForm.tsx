'use client';
import { useState, useRef, useEffect } from 'react';
import { ProjectFormData, LandInfoResult } from '@/types';
import LandInfoPanel from '@/components/LandInfoPanel';

const ZONES = [
  // 주거지역
  '제1종 전용주거지역', '제2종 전용주거지역',
  '제1종 일반주거지역', '제2종 일반주거지역', '제3종 일반주거지역',
  '준주거지역',
  // 상업지역
  '중심상업지역', '일반상업지역', '근린상업지역', '유통상업지역',
  // 공업지역
  '전용공업지역', '일반공업지역', '준공업지역',
  // 녹지지역
  '보전녹지지역', '생산녹지지역', '자연녹지지역',
  // 관리지역
  '보전관리지역', '생산관리지역', '계획관리지역',
  // 기타
  '농림지역', '자연환경보전지역',
];

const USAGES = [
  '공동주택 (아파트)', '공동주택 (연립주택)', '공동주택 (다세대주택)',
  '단독주택', '근린생활시설 (1종)', '근린생활시설 (2종)',
  '업무시설', '숙박시설', '문화 및 집회시설',
];

// 국토계획법 시행령 제84조(건폐율) · 제85조(용적률) 국가 상한 기준
// 실제 적용값은 지자체 도시계획 조례에 따라 낮아질 수 있음
const ZONE_LIMITS: Record<string, { bcr: number; far: number }> = {
  // 주거지역
  '제1종 전용주거지역': { bcr: 50, far: 100  },
  '제2종 전용주거지역': { bcr: 50, far: 150  },
  '제1종 일반주거지역': { bcr: 60, far: 200  },
  '제2종 일반주거지역': { bcr: 60, far: 250  },
  '제3종 일반주거지역': { bcr: 50, far: 300  },
  '준주거지역':         { bcr: 70, far: 500  },
  // 상업지역
  '중심상업지역':       { bcr: 90, far: 1500 },
  '일반상업지역':       { bcr: 80, far: 1300 },
  '근린상업지역':       { bcr: 70, far: 900  },
  '유통상업지역':       { bcr: 80, far: 1100 },
  // 공업지역
  '전용공업지역':       { bcr: 70, far: 300  },
  '일반공업지역':       { bcr: 70, far: 350  },
  '준공업지역':         { bcr: 70, far: 400  },
  // 녹지지역
  '보전녹지지역':       { bcr: 20, far: 80   },
  '생산녹지지역':       { bcr: 20, far: 100  },
  '자연녹지지역':       { bcr: 20, far: 100  },
  // 관리지역
  '보전관리지역':       { bcr: 20, far: 80   },
  '생산관리지역':       { bcr: 20, far: 80   },
  '계획관리지역':       { bcr: 40, far: 100  },
  // 기타
  '농림지역':           { bcr: 20, far: 80   },
  '자연환경보전지역':   { bcr: 20, far: 80   },
};

const PARKING_RULES: Record<string, { type: 'unit' | 'area'; rate: number; label: string }> = {
  '공동주택 (아파트)':      { type: 'unit', rate: 1.0, label: '세대당 1.0대' },
  '공동주택 (연립주택)':    { type: 'unit', rate: 1.0, label: '세대당 1.0대' },
  '공동주택 (다세대주택)':  { type: 'unit', rate: 0.7, label: '세대당 0.7대' },
  '단독주택':              { type: 'area', rate: 150,  label: '연면적 150㎡당 1대' },
  '근린생활시설 (1종)':    { type: 'area', rate: 134,  label: '시설면적 134㎡당 1대' },
  '근린생활시설 (2종)':    { type: 'area', rate: 134,  label: '시설면적 134㎡당 1대' },
  '업무시설':              { type: 'area', rate: 134,  label: '시설면적 134㎡당 1대' },
  '숙박시설':              { type: 'area', rate: 134,  label: '시설면적 134㎡당 1대' },
  '문화 및 집회시설':      { type: 'area', rate: 134,  label: '시설면적 134㎡당 1대' },
};

function calcLegalParking(usage: string, totalArea: number, units: number): number {
  const rule = PARKING_RULES[usage];
  if (!rule) return 0;
  if (rule.type === 'unit') return Math.ceil(units * rule.rate);
  return Math.ceil(totalArea / rule.rate);
}

interface Lot { address: string; area: number; }

interface Props {
  onSubmit: (data: ProjectFormData) => void;
  loading: boolean;
}

export default function ProjectForm({ onSubmit, loading }: Props) {
  const [form, setForm] = useState({
    zone: '제2종 일반주거지역',
    usage: '공동주택 (아파트)',
    bldg_area: 318,
    total_area: 1950,
    units: 20,
    floors: '6/1',
    height: 21.5,
    parking: 18,
    district: '',
    height_limit: '해당없음',
  });

  const [lots, setLots] = useState<Lot[]>([{ address: '제주특별자치도 제주시 OO동 123', area: 650 }]);
  const [lotInput, setLotInput] = useState('');
  const [loadingLots, setLoadingLots] = useState<Set<number>>(new Set());
  const [drawings, setDrawings] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const [landInfo, setLandInfo] = useState<LandInfoResult | null>(null);
  const [landInfoLoading, setLandInfoLoading] = useState(false);

  // 지번 변경 시 토지정보 자동조회 (800ms debounce)
  useEffect(() => {
    const addresses = lots.map(l => l.address).filter(Boolean);
    if (addresses.length === 0) { setLandInfo(null); return; }

    const timer = setTimeout(async () => {
      setLandInfoLoading(true);
      try {
        const res = await fetch('/api/land-info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(addresses),
        });
        const data: LandInfoResult = await res.json();
        setLandInfo(data);

        // 용도지역 자동세팅
        const firstZone = data.merged_zones.find(z => z.category === '용도지역');
        if (firstZone) {
          const match = ZONES.find(z =>
            firstZone.name.replace(/\s/g, '').includes(z.replace(/\s/g, '').slice(0, 6)) ||
            z.replace(/\s/g, '').includes(firstZone.name.replace(/\s/g, '').slice(0, 6))
          );
          if (match) set('zone', match);
        }
      } catch {
        // V-World 키 없거나 오류 시 무시
      } finally {
        setLandInfoLoading(false);
      }
    }, 800);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lots]);

  const site_area = lots.reduce((s, l) => s + (l.area || 0), 0);

  const addLot = async () => {
    const v = lotInput.trim();
    if (!v || lots.find(l => l.address === v)) { setLotInput(''); return; }

    const newIndex = lots.length;
    setLots(prev => [...prev, { address: v, area: 0 }]);
    setLotInput('');

    setLoadingLots(prev => new Set([...prev, newIndex]));
    try {
      const res = await fetch(`/api/land-area?address=${encodeURIComponent(v)}`);
      const data = await res.json();
      if (data.area) {
        setLots(prev => prev.map((l, i) => i === newIndex ? { ...l, area: data.area } : l));
      }
    } catch {
      // API 키 없거나 실패 시 수동 입력으로 fallback
    } finally {
      setLoadingLots(prev => { const next = new Set(prev); next.delete(newIndex); return next; });
    }
  };

  const updateLot = (i: number, field: keyof Lot, value: string | number) =>
    setLots(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l));

  const removeLot = (i: number) =>
    setLots(prev => prev.filter((_, idx) => idx !== i));

  const set = (k: string, v: string | number) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const next = Array.from(files).filter(f => !drawings.find(d => d.name === f.name));
    setDrawings(prev => [...prev, ...next]);
  };

  const isResidential = form.usage.includes('주택');
  const zoneLimits = ZONE_LIMITS[form.zone];
  const parkingRule = PARKING_RULES[form.usage];
  const legalParking = calcLegalParking(form.usage, form.total_area, form.units ?? 0);

  const bcrVal = site_area ? (form.bldg_area / site_area) * 100 : 0;
  const farVal = site_area ? (form.total_area / site_area) * 100 : 0;
  const bcrOver = zoneLimits ? bcrVal > zoneLimits.bcr : false;
  const farOver = zoneLimits ? farVal > zoneLimits.far : false;

  // 최대 가능 면적 (국토계획법 시행령 기준 상한)
  const maxBldgArea = site_area && zoneLimits ? Math.floor(site_area * zoneLimits.bcr / 100) : 0;
  const maxTotalArea = site_area && zoneLimits ? Math.floor(site_area * zoneLimits.far / 100) : 0;
  const remainBldgArea = maxBldgArea - form.bldg_area;
  const remainTotalArea = maxTotalArea - form.total_area;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (lots.length === 0 || site_area === 0) return;
    const locationStr = lots.map(l => `${l.address} (${l.area}㎡)`).join(', ');
    onSubmit({
      ...form,
      location: locationStr,
      site_area,
      parking_legal: legalParking,
      drawing_files: drawings.map(f => f.name),
    } as ProjectFormData);
  };

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500';

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* 도면 첨부 */}
      <div>
        <label className="block text-xs text-gray-900 mb-1">도면 첨부</label>
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
          className="border-2 border-dashed border-gray-200 rounded-lg px-4 py-3 cursor-pointer hover:border-teal-400 hover:bg-teal-50 transition-colors min-h-[52px] flex items-center"
        >
          <input ref={fileRef} type="file" multiple accept=".pdf,.dwg,.dxf,.jpg,.jpeg,.png" className="hidden"
            onChange={e => handleFiles(e.target.files)} />
          {drawings.length === 0 ? (
            <p className="text-xs text-gray-500 w-full text-center">PDF · DWG · 이미지 — 드래그하거나 클릭하여 첨부</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {drawings.map((f, i) => (
                <span key={i} className="inline-flex items-center gap-1 bg-teal-50 text-teal-700 text-xs px-2 py-0.5 rounded-full">
                  {f.name}
                  <button type="button" onClick={e => { e.stopPropagation(); setDrawings(prev => prev.filter((_, idx) => idx !== i)); }}
                    className="hover:text-teal-900 leading-none">×</button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 대지 위치 (지번별 면적 입력 + 합산) */}
      <div>
        <label className="block text-xs text-gray-900 mb-1">대지 위치</label>
        <div className={`border rounded-lg overflow-hidden ${lots.length === 0 ? 'border-red-300' : 'border-gray-200'}`}>
          {/* 지번 입력 */}
          <div className="flex items-center gap-2 px-3 py-2 bg-white border-b border-gray-100">
            <input
              type="text" value={lotInput} placeholder="지번 입력 후 Enter (예: 제주시 OO동 123)"
              onChange={e => setLotInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLot(); } }}
              className="flex-1 text-sm text-gray-900 outline-none placeholder-gray-400"
            />
            <button type="button" onClick={addLot}
              className="text-xs text-teal-600 font-medium hover:text-teal-800 px-2 py-0.5 border border-teal-200 rounded">
              + 추가
            </button>
          </div>

          {/* 지번 목록 */}
          {lots.length > 0 && (
            <div className="divide-y divide-gray-50">
              {lots.map((lot, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 bg-white hover:bg-gray-50">
                  <span className="text-xs text-gray-500 w-4 flex-shrink-0">{i + 1}</span>
                  <span className="text-sm text-gray-900 flex-1 truncate">{lot.address}</span>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {loadingLots.has(i) ? (
                      <div className="w-24 border border-gray-200 rounded px-2 py-1 text-sm text-gray-400 text-right bg-gray-50 flex items-center justify-end gap-1">
                        <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                        </svg>
                        조회중
                      </div>
                    ) : (
                      <input
                        type="number" value={lot.area || ''} placeholder="0"
                        onChange={e => updateLot(i, 'area', parseFloat(e.target.value) || 0)}
                        className="w-24 border border-gray-200 rounded px-2 py-1 text-sm text-gray-900 text-right focus:outline-none focus:ring-1 focus:ring-teal-500"
                      />
                    )}
                    <span className="text-xs text-gray-500">㎡</span>
                  </div>
                  <button type="button" onClick={() => removeLot(i)}
                    className="text-gray-300 hover:text-red-400 text-sm leading-none flex-shrink-0">×</button>
                </div>
              ))}
              {/* 합산 */}
              <div className="flex items-center justify-between px-3 py-2 bg-teal-50">
                <span className="text-xs font-medium text-teal-700">합계 대지면적</span>
                <span className="text-sm font-semibold text-teal-700">
                  {site_area.toLocaleString()} ㎡
                  {lots.length > 1 && (
                    <span className="text-xs font-normal text-teal-500 ml-1">({lots.length}필지)</span>
                  )}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 토지정보 패널 (지목·공시지가·지역지구) */}
      {(landInfo || landInfoLoading) && (
        <LandInfoPanel result={landInfo} loading={landInfoLoading} />
      )}

      {/* 용도지역 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-900 mb-1">용도지역</label>
          <select value={form.zone} onChange={e => set('zone', e.target.value)} className={inputCls}>
            {ZONES.map(z => <option key={z}>{z}</option>)}
          </select>
          {zoneLimits && (
            <p className="text-xs text-gray-500 mt-0.5">
              법정 건폐율 <span className="font-medium text-gray-700">{zoneLimits.bcr}%</span>
              {' · '}용적률 <span className="font-medium text-gray-700">{zoneLimits.far}%</span>
            </p>
          )}
        </div>
        <div>
          <label className="block text-xs text-gray-900 mb-1">건축물 주용도</label>
          <select value={form.usage} onChange={e => set('usage', e.target.value)} className={inputCls}>
            {USAGES.map(u => <option key={u}>{u}</option>)}
          </select>
        </div>
      </div>

      {/* 지구단위계획 + 고도제한 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-900 mb-1">지구단위계획 구역명</label>
          <input type="text" value={form.district ?? ''} placeholder="없으면 공란"
            onChange={e => set('district', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-gray-900 mb-1">고도제한 (도시계획조례)</label>
          <select value={form.height_limit ?? '해당없음'} onChange={e => set('height_limit', e.target.value)} className={inputCls}>
            <option>해당없음</option>
            <option>12m 이하</option>
            <option>15m 이하</option>
            <option>20m 이하</option>
            <option>25m 이하</option>
            <option>30m 이하</option>
            <option>45m 이하</option>
            <option>55m 이하</option>
            <option>60m 이하</option>
          </select>
        </div>
      </div>

      {/* 면적 (대지면적 자동, 건축면적·연면적 입력) + 세대수 */}
      <div className={`grid gap-3 ${isResidential ? 'grid-cols-4' : 'grid-cols-3'}`}>
        <div>
          <label className="block text-xs text-gray-900 mb-1">대지면적 (㎡)</label>
          <div className="w-full border border-gray-100 bg-gray-50 rounded-lg px-3 py-2 text-sm flex items-center justify-between">
            <span className="font-semibold text-gray-900">{site_area.toLocaleString()}</span>
            <span className="text-xs text-gray-400">자동합산</span>
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-900 mb-1">건축면적 (㎡)</label>
          <input type="number" value={form.bldg_area} required
            onChange={e => set('bldg_area', parseFloat(e.target.value))} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-gray-900 mb-1">연면적 (㎡)</label>
          <input type="number" value={form.total_area} required
            onChange={e => set('total_area', parseFloat(e.target.value))} className={inputCls} />
        </div>
        {isResidential && (
          <div>
            <label className="block text-xs text-gray-900 mb-1">세대수</label>
            <input type="number" value={form.units ?? ''} required
              onChange={e => set('units', parseInt(e.target.value))} className={inputCls} />
          </div>
        )}
      </div>

      {/* 건폐율 / 용적률 + 가능 면적 자동계산 */}
      {zoneLimits && site_area > 0 && (
        <div className="rounded-lg border border-gray-100 overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">가능 면적 자동계산</span>
            <span className="text-[10px] text-gray-400 ml-2">국토계획법 시행령 기준 · 지자체 조례에 따라 낮아질 수 있음</span>
          </div>
          <div className="grid grid-cols-2 divide-x divide-gray-100">
            {/* 건폐율 */}
            <div className={`px-4 py-3 ${bcrOver ? 'bg-red-50' : 'bg-white'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-600">건폐율 (건축면적)</span>
                {bcrOver
                  ? <span className="text-[10px] font-semibold text-red-600 bg-red-100 px-1.5 py-0.5 rounded">초과</span>
                  : <span className="text-[10px] text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded">여유 {remainBldgArea.toLocaleString()}㎡</span>
                }
              </div>
              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-gray-400">법정 최대</span>
                  <span className="text-sm font-semibold text-gray-800">
                    {maxBldgArea.toLocaleString()}㎡
                    <span className="text-xs font-normal text-gray-400 ml-1">({zoneLimits.bcr}%)</span>
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-gray-400">현재 계획</span>
                  <span className={`text-sm font-semibold ${bcrOver ? 'text-red-600' : 'text-teal-700'}`}>
                    {form.bldg_area.toLocaleString()}㎡
                    <span className="text-xs font-normal ml-1">({bcrVal.toFixed(1)}%)</span>
                  </span>
                </div>
                {/* 진행 바 */}
                <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
                  <div
                    className={`h-1.5 rounded-full transition-all ${bcrOver ? 'bg-red-400' : 'bg-teal-400'}`}
                    style={{ width: `${Math.min((bcrVal / zoneLimits.bcr) * 100, 100)}%` }}
                  />
                </div>
              </div>
            </div>
            {/* 용적률 */}
            <div className={`px-4 py-3 ${farOver ? 'bg-red-50' : 'bg-white'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-600">용적률 (연면적)</span>
                {farOver
                  ? <span className="text-[10px] font-semibold text-red-600 bg-red-100 px-1.5 py-0.5 rounded">초과</span>
                  : <span className="text-[10px] text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded">여유 {remainTotalArea.toLocaleString()}㎡</span>
                }
              </div>
              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-gray-400">법정 최대</span>
                  <span className="text-sm font-semibold text-gray-800">
                    {maxTotalArea.toLocaleString()}㎡
                    <span className="text-xs font-normal text-gray-400 ml-1">({zoneLimits.far}%)</span>
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-gray-400">현재 계획</span>
                  <span className={`text-sm font-semibold ${farOver ? 'text-red-600' : 'text-teal-700'}`}>
                    {form.total_area.toLocaleString()}㎡
                    <span className="text-xs font-normal ml-1">({farVal.toFixed(1)}%)</span>
                  </span>
                </div>
                {/* 진행 바 */}
                <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
                  <div
                    className={`h-1.5 rounded-full transition-all ${farOver ? 'bg-red-400' : 'bg-teal-400'}`}
                    style={{ width: `${Math.min((farVal / zoneLimits.far) * 100, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 층수 / 높이 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-900 mb-1">층수 (지상/지하)</label>
          <input type="text" value={form.floors} placeholder="예: 6/1" required
            onChange={e => set('floors', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-gray-900 mb-1">최고높이 (m)</label>
          <input type="number" step="0.1" value={form.height} required
            onChange={e => set('height', parseFloat(e.target.value))} className={inputCls} />
        </div>
      </div>

      {/* 주차 (법정 vs 계획) */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-900 mb-1">법정 주차대수</label>
          <div className="w-full border border-gray-100 bg-gray-50 rounded-lg px-3 py-2 text-sm flex items-center gap-2">
            <span className="font-semibold text-gray-900">{legalParking}대</span>
            {parkingRule && <span className="text-xs text-gray-500">· {parkingRule.label}</span>}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">제주도 주차장설치기준조례 별표1 자동산정</p>
        </div>
        <div>
          <label className="block text-xs text-gray-900 mb-1">계획 주차대수</label>
          <input type="number" value={form.parking} required
            onChange={e => set('parking', parseInt(e.target.value))}
            className={`w-full border rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500 ${form.parking < legalParking ? 'border-red-300 bg-red-50' : 'border-gray-200'}`} />
          {form.parking < legalParking && (
            <p className="text-xs text-red-500 mt-0.5">법정 기준 미달 ({legalParking - form.parking}대 부족)</p>
          )}
        </div>
      </div>

      <button
        type="submit" disabled={loading || lots.length === 0 || site_area === 0}
        className="w-full bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 text-white font-medium py-3 rounded-lg text-sm transition-colors"
      >
        {loading ? 'AI 검토 중...' : '법규 검토 시작 →'}
      </button>
    </form>
  );
}
