import { useState } from 'react';
import { fmt, SAMPLE_X, bepAt } from '../utils/chartUtils.js';
import { saveStateDB, deleteStateDB } from '../utils/supabaseUtils.js';

export default function SavePanel({
  machine, labor, depreciation, electricity,
  monthlyClicks, clickType, F, C, bepNow,
  savedStates, setSavedStates,
  dbLoading, copyDone, setCopyDone, onLoad,
}) {
  const [saving,  setSaving]  = useState(false);
  const [deleting, setDeleting] = useState(null); /* 삭제 중인 id */
  const [error,   setError]   = useState('');

  const buildExportData = () => ({
    meta  : { version: 1, createdAt: new Date().toISOString(), app: '손익분기점 그래프' },
    config: { fixedCosts: { machine, labor, depreciation, electricity, total: F }, clickCost: C, clickType, monthlyClicks },
    bepAtReference: { monthlyClicks, bepPrice: Math.round(bepNow * 10) / 10 },
    bepCurve: SAMPLE_X.map(x => ({ monthlyClicks: x, bepPrice: Math.round(bepAt(F, C, x) * 10) / 10 })),
  });

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(buildExportData(), null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `bep-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(buildExportData(), null, 2))
      .then(() => { setCopyDone(true); setTimeout(() => setCopyDone(false), 2000); });
  };

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      const saved = await saveStateDB({ machine, labor, depreciation, electricity, monthlyClicks, clickType });
      setSavedStates(prev => [saved, ...prev]);
    } catch (e) {
      setError('저장 실패: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    setDeleting(id); setError('');
    try {
      await deleteStateDB(id);
      setSavedStates(prev => prev.filter(s => s.id !== id));
    } catch (e) {
      setError('삭제 실패: ' + e.message);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">저장 &amp; 내보내기</p>

      <div className="flex flex-wrap gap-2 mb-5">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-xl
                     bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white transition shadow-sm">
          {saving ? '저장 중…' : '💾 현재 상태 저장'}
        </button>
        <button onClick={handleExport}
          className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-xl
                     border border-emerald-300 text-emerald-700 hover:bg-emerald-50 transition shadow-sm">
          ⬇ JSON 다운로드
        </button>
        <button onClick={handleCopy}
          className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-xl
                     border border-slate-300 text-slate-600 hover:bg-slate-50 transition shadow-sm">
          {copyDone ? '✓ 복사됨!' : '📋 JSON 복사'}
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-400 mb-3 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="bg-slate-50 rounded-xl p-3 mb-5 text-xs text-slate-500 leading-relaxed">
        <p className="font-semibold text-slate-600 mb-1">내보내기 JSON 포함 데이터</p>
        <ul className="space-y-0.5 list-disc list-inside">
          <li>고정비 항목별 값 및 합계 (F)</li>
          <li>클릭비 종류 및 단가 (C)</li>
          <li>기준 클릭 수에서의 손익분기 단가</li>
          <li>300 ~ 300,000 클릭 구간별 BEP 단가 테이블</li>
        </ul>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-2">
          <p className="text-xs font-semibold text-slate-400">
            저장된 상태
            <span className="font-normal text-slate-300 ml-1">({savedStates.length}건)</span>
          </p>
          {dbLoading && <span className="text-xs text-slate-300">불러오는 중…</span>}
        </div>

        {!dbLoading && savedStates.length === 0 ? (
          <p className="text-xs text-slate-300 py-3 text-center">저장된 상태가 없습니다</p>
        ) : (
          <div className="space-y-2">
            {savedStates.map(s => (
              <div key={s.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-slate-100
                           bg-slate-50 px-3 py-2.5 hover:border-slate-200 transition">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-600 truncate">{s.savedAt}</p>
                  <p className="text-xs text-slate-400">
                    F: {fmt(s.F)}원 &nbsp;·&nbsp;
                    {s.clickType === 'color' ? '칼라' : '흑백'} &nbsp;·&nbsp;
                    {fmt(s.monthlyClicks)} 클릭 &nbsp;·&nbsp;
                    BEP <span className="text-blue-500 font-medium">{fmt(s.bepNow)}원</span>
                  </p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={() => onLoad(s)}
                    className="text-xs px-2.5 py-1 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-medium transition">
                    불러오기
                  </button>
                  <button onClick={() => handleDelete(s.id)} disabled={deleting === s.id}
                    className="text-xs px-2 py-1 rounded-lg border border-slate-200
                               text-slate-400 hover:text-red-400 hover:border-red-300 disabled:opacity-40 transition">
                    {deleting === s.id ? '…' : '✕'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
