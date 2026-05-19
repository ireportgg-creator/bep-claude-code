import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadSavesDB } from '../utils/supabaseUtils.js';
import { fmt } from '../utils/chartUtils.js';

export default function PrintCostSimulator() {
  const navigate = useNavigate();
  const [saves, setSaves]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  useEffect(() => {
    loadSavesDB()
      .then(setSaves)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen p-4 pb-12 max-w-3xl mx-auto">
      <header className="mb-5 pt-2 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">출력비 산출 시뮬레이터</h1>
          <p className="text-xs text-slate-400 mt-0.5">저장된 손익분기 데이터 기반 출력비 산출</p>
        </div>
        <button
          onClick={() => navigate('/')}
          className="text-sm text-slate-500 hover:text-slate-800 px-3 py-1.5 border border-slate-300 rounded-lg transition-colors"
        >
          ← 손익분기점 그래프
        </button>
      </header>

      {loading && (
        <p className="text-center text-slate-400 py-12">데이터 불러오는 중...</p>
      )}

      {error && (
        <p className="text-center text-red-400 py-12">오류: {error}</p>
      )}

      {!loading && !error && saves.length === 0 && (
        <p className="text-center text-slate-400 py-12">저장된 데이터가 없습니다.</p>
      )}

      {!loading && !error && saves.length > 0 && (
        <div className="flex flex-col gap-4">
          {saves.map(s => (
            <div key={s.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-slate-400">{s.savedAt}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  s.clickType === 'color'
                    ? 'bg-indigo-100 text-indigo-600'
                    : 'text-slate-600 bg-slate-100'
                }`}>
                  {s.clickType === 'color' ? '컬러' : '흑백'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm mb-3">
                <Row label="기계 감가상각"   value={`${fmt(s.machine)}원`} />
                <Row label="인건비"         value={`${fmt(s.labor)}원`} />
                <Row label="기타 감가상각"   value={`${fmt(s.depreciation)}원`} />
                <Row label="전기료"         value={`${fmt(s.electricity)}원`} />
                <Row label="월 고정비 합계"  value={`${fmt(s.F)}원`} bold />
                <Row label="월 클릭수"      value={`${fmt(s.monthlyClicks)}클릭`} />
                <Row label="변동비(클릭단가)" value={`${s.C}원`} />
                <Row label="BEP 단가"       value={`${fmt(s.bepNow)}원`} bold />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, bold }) {
  return (
    <>
      <span className="text-slate-500">{label}</span>
      <span className={`text-right ${bold ? 'font-semibold text-slate-800' : 'text-slate-700'}`}>{value}</span>
    </>
  );
}
