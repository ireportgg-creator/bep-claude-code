import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Chart from 'chart.js/auto';
import { loadLatestSaveDB } from '../utils/supabaseUtils.js';
import { fmt } from '../utils/chartUtils.js';

const STORAGE_KEY = 'printTiers_v3';
const FORMULA_KEY = 'printFormula_v1';
const MAX_PRICE   = 3500;

/* ── 순수 함수 ───────────────────────────────────────────── */

function generateTiers(minC, maxC, mid, bepNow) {
  const minPrice = Math.round(bepNow);
  const count    = mid + 2;
  const logMin   = Math.log(Math.max(1, minC));
  const logMax   = Math.log(Math.max(minC + 1, maxC));
  const tiers    = [];
  for (let i = 0; i < count; i++) {
    const ratio  = count <= 1 ? 0 : i / (count - 1);
    const clicks = Math.round(Math.exp(logMin + (logMax - logMin) * ratio));
    const price  = ratio >= 1
      ? minPrice
      : Math.round((MAX_PRICE - (MAX_PRICE - minPrice) * ratio) / 10) * 10;
    tiers.push({ maxClicks: clicks, price });
  }
  tiers.push({ maxClicks: null, price: minPrice });
  return tiers;
}

function formulaPrice(x, minC, maxC, k, minPrice) {
  if (x <= minC) return MAX_PRICE;
  if (x >= maxC) return minPrice;
  const t = (x - minC) / (maxC - minC);
  return Math.round(minPrice + (MAX_PRICE - minPrice) * Math.pow(1 - t, k));
}

/* ── 구간 step 차트 ──────────────────────────────────────── */

function TierChart({ tiers, bepNow }) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const chart = new Chart(canvas.getContext('2d'), {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: '구간 단가',
            data: [],
            showLine: true,
            borderColor: '#6366F1',
            backgroundColor: 'rgba(99,102,241,0.08)',
            fill: 'origin',
            borderWidth: 2.5,
            pointRadius: 0,
            tension: 0,
          },
          {
            label: 'BEP 단가',
            data: [],
            showLine: true,
            borderColor: '#F97316',
            borderDash: [5, 4],
            borderWidth: 1.5,
            pointRadius: 0,
            tension: 0,
          },
        ],
      },
      options: chartOptions(),
    });
    chartRef.current = chart;
    return () => chart.destroy();
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !tiers || tiers.length === 0) return;
    const lastFinite = [...tiers].reverse().find(t => t.maxClicks !== null)?.maxClicks ?? 5000;
    const xMax = Math.round(lastFinite * 1.6);
    const stepPts = [];
    for (let i = 0; i < tiers.length; i++) {
      const t      = tiers[i];
      const xLeft  = i === 0 ? 0 : (tiers[i - 1].maxClicks ?? xMax);
      const xRight = t.maxClicks ?? xMax;
      stepPts.push({ x: xLeft, y: t.price });
      stepPts.push({ x: xRight, y: t.price });
    }
    chart.data.datasets[0].data = stepPts;
    chart.data.datasets[1].data = [{ x: 0, y: bepNow }, { x: xMax, y: bepNow }];
    chart.options.scales.x.max  = xMax;
    const maxP = Math.max(...tiers.map(t => t.price));
    chart.options.scales.y.max  = Math.round(maxP * 1.2 / 100) * 100;
    chart.update('none');
  }, [tiers, bepNow]);

  return <div style={{ position: 'relative', height: '280px' }}><canvas ref={canvasRef}></canvas></div>;
}

/* ── 수식 곡선 차트 ──────────────────────────────────────── */

function FormulaChart({ minClicks, maxClicks, curveK, bepNow }) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const chart = new Chart(canvas.getContext('2d'), {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: '수식 단가',
            data: [],
            showLine: true,
            borderColor: '#6366F1',
            backgroundColor: 'rgba(99,102,241,0.08)',
            fill: 'origin',
            borderWidth: 2.5,
            pointRadius: 0,
            tension: 0,
          },
          {
            label: 'BEP 단가',
            data: [],
            showLine: true,
            borderColor: '#F97316',
            borderDash: [5, 4],
            borderWidth: 1.5,
            pointRadius: 0,
            tension: 0,
          },
        ],
      },
      options: chartOptions(),
    });
    chartRef.current = chart;
    return () => chart.destroy();
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const minPrice = Math.round(bepNow);
    const xMax     = Math.round(maxClicks * 1.6);
    const pts      = [];
    for (let i = 0; i <= 200; i++) {
      const x = (xMax / 200) * i;
      pts.push({ x, y: formulaPrice(x, minClicks, maxClicks, curveK, minPrice) });
    }
    chart.data.datasets[0].data = pts;
    chart.data.datasets[1].data = [{ x: 0, y: bepNow }, { x: xMax, y: bepNow }];
    chart.options.scales.x.max  = xMax;
    chart.options.scales.y.max  = Math.round(MAX_PRICE * 1.2 / 100) * 100;
    chart.update('none');
  }, [minClicks, maxClicks, curveK, bepNow]);

  return <div style={{ position: 'relative', height: '280px' }}><canvas ref={canvasRef}></canvas></div>;
}

/* ── 공통 차트 옵션 ──────────────────────────────────────── */

function chartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 100 },
    scales: {
      x: {
        type: 'linear', min: 0,
        title: { display: true, text: '클릭 수', color: '#64748B', font: { size: 11 } },
        ticks: { color: '#94A3B8', font: { size: 10 }, maxTicksLimit: 7,
                 callback: v => v >= 1000 ? (v / 1000) + 'k' : v },
        grid: { color: '#F1F5F9' }, border: { color: '#E2E8F0' },
      },
      y: {
        type: 'linear', min: 0,
        title: { display: true, text: '원/클릭', color: '#64748B', font: { size: 11 } },
        ticks: { color: '#94A3B8', font: { size: 10 }, maxTicksLimit: 7,
                 callback: v => v.toLocaleString('ko-KR') },
        grid: { color: '#F1F5F9' }, border: { color: '#E2E8F0' },
      },
    },
    plugins: {
      legend: { position: 'top', labels: { font: { size: 11 }, color: '#475569',
                usePointStyle: true, padding: 12 } },
      tooltip: {
        backgroundColor: 'rgba(255,255,255,0.97)',
        titleColor: '#1E293B', bodyColor: '#475569',
        borderColor: '#E2E8F0', borderWidth: 1, padding: 8,
        callbacks: { label: c => `${c.dataset.label}: ${Math.round(c.parsed.y).toLocaleString('ko-KR')}원` },
      },
    },
  };
}

/* ── 메인 컴포넌트 ───────────────────────────────────────── */

export default function PrintCostSimulator() {
  const navigate = useNavigate();
  const [save, setSave]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);

  // 공통 파라미터
  const [phase,     setPhase]     = useState('tier');
  const [minClicks, setMinClicks] = useState(100);
  const [maxClicks, setMaxClicks] = useState(5000);

  // Phase 1 전용
  const [midCount, setMidCount]   = useState(3);
  const [tiers, setTiers]         = useState(null);
  const [saveDone, setSaveDone]   = useState(false);

  // Phase 2 전용
  const [curveK, setCurveK]       = useState(0.5);
  const [formulaSaveDone, setFormulaSaveDone] = useState(false);

  // Job 계산기
  const [jobClicks, setJobClicks] = useState('');

  /* Supabase 로드 */
  useEffect(() => {
    loadLatestSaveDB()
      .then(setSave)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  /* localStorage → tier 초기화 */
  useEffect(() => {
    if (!save) return;
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (stored?.tiers?.length > 0) {
        setMinClicks(stored.minClicks ?? 100);
        setMaxClicks(stored.maxClicks ?? 5000);
        setMidCount(stored.midCount  ?? 3);
        setTiers(stored.tiers);
        return;
      }
    } catch {}
    const defaults = generateTiers(100, 5000, 3, save.bepNow);
    persistTiers(100, 5000, 3, defaults);
    setTiers(defaults);
  }, [save]);

  /* localStorage → formula 초기화 */
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(FORMULA_KEY));
      if (stored) setCurveK(stored.curveK ?? 0.5);
    } catch {}
  }, []);

  /* ── Phase 1 핸들러 */
  function persistTiers(minC, maxC, mid, t) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ minClicks: minC, maxClicks: maxC, midCount: mid, tiers: t }));
  }
  function applyTierParams(minC, maxC, mid) {
    const next = generateTiers(minC, maxC, mid, save.bepNow);
    setMinClicks(minC); setMaxClicks(maxC); setMidCount(mid);
    setTiers(next);
    persistTiers(minC, maxC, mid, next);
  }
  function updatePrice(idx, price) {
    const next = tiers.map((t, i) => i === idx ? { ...t, price } : t);
    setTiers(next);
    persistTiers(minClicks, maxClicks, midCount, next);
  }
  function resetTiers() { applyTierParams(100, 5000, 3); }
  function handleTierSave() {
    persistTiers(minClicks, maxClicks, midCount, tiers);
    setSaveDone(true);
    setTimeout(() => setSaveDone(false), 1500);
  }

  /* ── Phase 2 핸들러 */
  function persistFormula(minC, maxC, k) {
    localStorage.setItem(FORMULA_KEY, JSON.stringify({ minClicks: minC, maxClicks: maxC, curveK: k }));
  }
  function applyFormulaParams(minC, maxC, k) {
    setMinClicks(minC); setMaxClicks(maxC); setCurveK(k);
    persistFormula(minC, maxC, k);
  }
  function handleFormulaSave() {
    persistFormula(minClicks, maxClicks, curveK);
    setFormulaSaveDone(true);
    setTimeout(() => setFormulaSaveDone(false), 1500);
  }

  /* ── Job 계산 */
  const clicks = parseInt(jobClicks, 10);
  const validClicks = !isNaN(clicks) && clicks > 0;

  // Phase 1 결과
  const matchedIdx  = validClicks && tiers
    ? tiers.findIndex(t => t.maxClicks === null || clicks <= t.maxClicks)
    : -1;
  const matchedTier = matchedIdx >= 0 ? tiers[matchedIdx] : null;
  const tierTotal   = matchedTier ? clicks * matchedTier.price : null;

  // Phase 2 결과
  const fPrice = validClicks && save
    ? formulaPrice(clicks, minClicks, maxClicks, curveK, Math.round(save.bepNow))
    : null;
  const fTotal = fPrice !== null ? clicks * fPrice : null;

  return (
    <div className="min-h-screen p-4 pb-12 max-w-4xl mx-auto">
      <header className="mb-5 pt-2 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">출력비 산출 시뮬레이터</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {phase === 'tier' ? '구간별 단가표 기반' : '수식 기반 곡선'} · job 출력비 산출
          </p>
        </div>
        <button onClick={() => navigate('/')}
          className="text-sm text-slate-500 hover:text-slate-800 px-3 py-1.5 border border-slate-300 rounded-lg transition-colors">
          ← 손익분기점 그래프
        </button>
      </header>

      {loading && <p className="text-center text-slate-400 py-12">데이터 불러오는 중...</p>}
      {error   && <p className="text-center text-red-400 py-12">오류: {error}</p>}
      {!loading && !error && !save && (
        <p className="text-center text-slate-400 py-12">저장된 BEP 데이터가 없습니다.</p>
      )}

      {!loading && !error && save && tiers && (
        <div className="flex flex-col gap-5">

          {/* 섹션 1: BEP 참고값 */}
          <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">
              BEP 참고값 <span className="text-xs font-normal text-slate-400">(단가 설정 참고용)</span>
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1.5 text-sm">
              <Row label="월 고정비"    value={`${fmt(save.F)}원`} bold />
              <Row label="클릭 유형"    value={save.clickType === 'color' ? `컬러 (${save.C}원)` : `흑백 (${save.C}원)`} />
              <Row label="월 기준 클릭" value={`${fmt(save.monthlyClicks)}클릭`} />
              <Row label="BEP 단가"    value={`${fmt(save.bepNow)}원/클릭`} bold />
            </div>
          </section>

          {/* 탭 전환 */}
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
            <button
              onClick={() => setPhase('tier')}
              className={`text-sm px-4 py-1.5 rounded-lg font-medium transition-colors ${
                phase === 'tier'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}>
              구간표
            </button>
            <button
              onClick={() => setPhase('formula')}
              className={`text-sm px-4 py-1.5 rounded-lg font-medium transition-colors ${
                phase === 'formula'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}>
              수식
            </button>
          </div>

          {/* 섹션 2a: 구간별 단가표 */}
          {phase === 'tier' && (
            <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-700">구간별 단가표</h2>
                <div className="flex gap-2">
                  <button onClick={resetTiers}
                    className="text-xs text-slate-400 hover:text-slate-600 px-2.5 py-1 border border-slate-200 rounded-lg">
                    기본값 초기화
                  </button>
                  <button onClick={handleTierSave}
                    className={`text-xs px-3 py-1 rounded-lg border transition-colors ${
                      saveDone
                        ? 'bg-green-50 border-green-300 text-green-600'
                        : 'bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700'
                    }`}>
                    {saveDone ? '저장됨 ✓' : '단가표 저장'}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-4 mb-4 p-3 bg-slate-50 rounded-xl">
                <ParamInput label="최소 클릭 수" value={minClicks} unit="클릭"
                  onChange={v => applyTierParams(Math.max(1, v), Math.max(v + 1, maxClicks), midCount)} />
                <ParamInput label="최대 클릭 수" value={maxClicks} unit="클릭"
                  onChange={v => applyTierParams(minClicks, Math.max(minClicks + 1, v), midCount)} />
                <ParamInput label="중간 구간 수" value={midCount} unit="개" step={1}
                  onChange={v => applyTierParams(minClicks, maxClicks, Math.max(0, Math.min(20, v)))} />
              </div>

              <div className="flex flex-col md:flex-row md:gap-6">
                <div className="md:w-64 shrink-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-slate-400 border-b border-slate-100">
                        <th className="text-left pb-2 font-medium">클릭 수 이하</th>
                        <th className="text-right pb-2 font-medium pr-2">원/클릭</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tiers.map((t, i) => (
                        <tr key={i}
                          className={`border-b border-slate-50 transition-colors ${matchedIdx === i ? 'bg-indigo-50' : ''}`}>
                          <td className="py-1.5 pr-3 text-slate-600">
                            {t.maxClicks === null
                              ? <span className="text-slate-400 text-xs italic">그 이상</span>
                              : <span>{fmt(t.maxClicks)}</span>
                            }
                          </td>
                          <td className="py-1.5 text-right pr-2">
                            <input type="number" min={1} value={t.price}
                              onChange={e => updatePrice(i, Math.max(1, Number(e.target.value) || 1))}
                              className="w-20 border border-slate-200 rounded-lg px-2 py-1 text-sm text-right text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex-1 mt-4 md:mt-0">
                  <TierChart tiers={tiers} bepNow={save.bepNow} />
                </div>
              </div>
            </section>
          )}

          {/* 섹션 2b: 수식 기반 곡선 */}
          {phase === 'formula' && (
            <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-700">수식 기반 단가 곡선</h2>
                <button onClick={handleFormulaSave}
                  className={`text-xs px-3 py-1 rounded-lg border transition-colors ${
                    formulaSaveDone
                      ? 'bg-green-50 border-green-300 text-green-600'
                      : 'bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700'
                  }`}>
                  {formulaSaveDone ? '저장됨 ✓' : '설정 저장'}
                </button>
              </div>

              <div className="flex flex-wrap gap-4 mb-4 p-3 bg-slate-50 rounded-xl">
                <ParamInput label="최소 클릭 수" value={minClicks} unit="클릭"
                  onChange={v => applyFormulaParams(Math.max(1, v), Math.max(v + 1, maxClicks), curveK)} />
                <ParamInput label="최대 클릭 수" value={maxClicks} unit="클릭"
                  onChange={v => applyFormulaParams(minClicks, Math.max(minClicks + 1, v), curveK)} />
                <ParamInput label="커브 기울기 k" value={curveK} unit="" step={0.1}
                  onChange={v => applyFormulaParams(minClicks, maxClicks, Math.max(0.1, Math.min(3.0, Math.round(v * 10) / 10)))} />
              </div>

              <p className="text-xs text-slate-400 mb-4 px-1">
                k &lt; 1 : 클릭 수 증가 시 단가 빠르게 하락 &nbsp;·&nbsp;
                k = 1 : 선형 &nbsp;·&nbsp;
                k &gt; 1 : 클릭 수 많아진 후 단가 하락
              </p>

              <FormulaChart
                minClicks={minClicks}
                maxClicks={maxClicks}
                curveK={curveK}
                bepNow={save.bepNow}
              />
            </section>
          )}

          {/* 섹션 3: Job 계산기 */}
          <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">Job 출력비 계산</h2>
            <div className="mb-4">
              <label className="text-xs font-medium text-slate-500 block mb-1">총 클릭 수</label>
              <div className="relative w-48">
                <input type="number" min={1} placeholder="클릭 수 입력"
                  value={jobClicks}
                  onChange={e => setJobClicks(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 pr-10 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 text-slate-700 transition" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">클릭</span>
              </div>
            </div>

            {/* Phase 1 결과 */}
            {phase === 'tier' && matchedTier && (
              <div className="bg-slate-50 rounded-xl p-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <Row label="적용 구간" value={matchedTier.maxClicks ? `${fmt(matchedTier.maxClicks)}클릭 이하` : '그 이상'} />
                <Row label="적용 단가" value={`${fmt(matchedTier.price)}원/클릭`} />
                <Row label="총 클릭 수" value={`${fmt(clicks)}클릭`} />
                <Row label="총 출력비"  value={`${fmt(tierTotal)}원`} bold />
              </div>
            )}

            {/* Phase 2 결과 */}
            {phase === 'formula' && fPrice !== null && (
              <div className="bg-slate-50 rounded-xl p-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <Row label="적용 단가" value={`${fmt(fPrice)}원/클릭`} />
                <Row label="총 클릭 수" value={`${fmt(clicks)}클릭`} />
                <Row label="총 출력비"  value={`${fmt(fTotal)}원`} bold />
              </div>
            )}
          </section>

        </div>
      )}
    </div>
  );
}

function ParamInput({ label, value, unit, step = 100, onChange }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-500">{label}</label>
      <div className="relative">
        <input type="number" min={0} step={step} value={value}
          onChange={e => onChange(Number(e.target.value) || 0)}
          className={`border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 ${unit ? 'w-28 pr-8' : 'w-20'}`} />
        {unit && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">{unit}</span>}
      </div>
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
