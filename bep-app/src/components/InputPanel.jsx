import { useState, useEffect } from 'react';
import NumInput from './NumInput.jsx';
import { fmt } from '../utils/chartUtils.js';

export default function InputPanel({
  machine, setMachine, labor, setLabor,
  depreciation, setDepreciation, electricity, setElectricity,
  monthlyClicks, setMonthlyClicks, clickType, setClickType,
  F, C, bepNow,
}) {
  const [clicksRaw, setClicksRaw] = useState(String(monthlyClicks));

  /* 슬라이더로 변경될 때 텍스트 입력도 동기화 */
  useEffect(() => { setClicksRaw(String(monthlyClicks)); }, [monthlyClicks]);

  const handleClicksBlur = () => {
    const n = parseInt(clicksRaw.replace(/[^0-9]/g, ''), 10);
    const clamped = Math.max(1000, Math.min(300000, isNaN(n) ? 1000 : n));
    setMonthlyClicks(clamped);
    setClicksRaw(String(clamped));
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 mb-4">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">고정비 입력</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <NumInput label="기계 할부금 (원/월)" value={machine}      onChange={setMachine}      />
        <NumInput label="인건비 (원/월)"        value={labor}        onChange={setLabor}        />
        <NumInput label="감가상각 (원/월)"      value={depreciation} onChange={setDepreciation} />
        <NumInput label="전기세 (원/월)"        value={electricity}  onChange={setElectricity}  />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-medium text-slate-500 mb-1">월 예상 클릭 수</p>
          <div className="flex items-center gap-2 mb-1">
            <input type="range" min="1000" max="300000" step="1000"
              value={monthlyClicks} onChange={e => setMonthlyClicks(Number(e.target.value))}
              className="flex-1 h-2" />
            <span className="text-xs font-bold text-orange-500 w-20 text-right whitespace-nowrap">
              {fmt(monthlyClicks)}
            </span>
          </div>
          <input type="number" min="1000" max="300000"
            value={clicksRaw}
            onChange={e => setClicksRaw(e.target.value)}
            onBlur={handleClicksBlur}
            onKeyDown={e => e.key === 'Enter' && handleClicksBlur()}
            className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-sm bg-white
                       focus:outline-none focus:ring-2 focus:ring-blue-400 text-slate-700" />
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500 mb-1">계약된 클릭비</p>
          <div className="flex gap-5 mt-1 mb-3">
            {[['color','칼라 (28원)'],['bw','흑백 (12원)']].map(([v, lbl]) => (
              <label key={v} className="flex items-center gap-1.5 cursor-pointer select-none">
                <input type="radio" name="clickType" value={v}
                  checked={clickType === v} onChange={() => setClickType(v)} className="w-4 h-4" />
                <span className="text-sm text-slate-700">{lbl}</span>
              </label>
            ))}
          </div>
          <div className="text-xs text-slate-500 space-y-0.5">
            <p>총 고정비 <span className="font-semibold text-slate-700">{fmt(F)} 원/월</span></p>
            <p>손익분기 단가
              <span className="font-bold text-blue-600 ml-1">{fmt(bepNow)} 원/클릭</span>
              <span className="text-slate-400 ml-1">({fmt(monthlyClicks)} 클릭 기준)</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
