export default function NumInput({ label, value, onChange, min = 0, step = 1000 }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-500 leading-tight">{label}</label>
      <div className="relative">
        <input type="number" min={min} step={step} value={value}
          onChange={e => onChange(Math.max(min, Number(e.target.value) || 0))}
          className="w-full border border-slate-200 rounded-xl px-3 py-2 pr-7 text-sm font-medium
                     bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 text-slate-700 transition"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">원</span>
      </div>
    </div>
  );
}
