import { fmt } from '../utils/chartUtils.js';

export default function SummaryCards({ F, C, bepNow }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
      {[
        { label: '총 고정비',     val: `${fmt(F)} 원/월`,        cls: 'text-slate-700' },
        { label: '클릭당 변동비', val: `${C} 원/클릭`,           cls: 'text-slate-700' },
        { label: '손익분기 단가', val: `${fmt(bepNow)} 원/클릭`, cls: 'text-blue-600'  },
      ].map(({ label, val, cls }) => (
        <div key={label} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
          <p className="text-xs text-slate-400 mb-1">{label}</p>
          <p className={`text-base font-bold ${cls}`}>{val}</p>
        </div>
      ))}
    </div>
  );
}
