import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Chart from 'chart.js/auto';
import { loadLatestSaveDB } from '../utils/supabaseUtils.js';
import { fmt } from '../utils/chartUtils.js';

const STORAGE_KEY       = 'printTiers_v3';
const FORMULA_KEY       = 'printFormula_v1';
const TIER_SAVES_KEY    = 'printTiers_saves';
const FORMULA_SAVES_KEY = 'printFormula_saves';
const COATING_KEY       = 'printCoatingTiers';
const SADDLE_KEY        = 'printSaddleTiers';
const PERFECT_KEY       = 'printPerfectTiers';
const RING_KEY          = 'printRingTiers';
const SCORING_KEY       = 'printScoringTiers';
const MAX_PRICE         = 3500;

const DEFAULT_SVC_TIERS = () => [{ id: Date.now(), maxCopies: null, cost: 0 }];

function fmtNow() {
  const d = new Date();
  return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

const PAPER_DATA = [
  { type: '백색모조지',         weight: 260, price: 66  },
  { type: '백색모조지',         weight: 220, price: 56  },
  { type: '백색모조지',         weight: 180, price: 44  },
  { type: '백색모조지',         weight: 150, price: 37  },
  { type: '백색모조지',         weight: 120, price: 30  },
  { type: '백색모조지',         weight: 100, price: 25  },
  { type: '백색모조지',         weight: 80,  price: 20  },
  { type: '백색모조지',         weight: 70,  price: 18  },
  { type: '미색모조지',         weight: 100, price: 26  },
  { type: '미색모조지',         weight: 80,  price: 21  },
  { type: '아트지 및 스노우지',  weight: 300, price: 74  },
  { type: '아트지 및 스노우지',  weight: 250, price: 62  },
  { type: '아트지 및 스노우지',  weight: 200, price: 49  },
  { type: '아트지 및 스노우지',  weight: 180, price: 45  },
  { type: '아트지 및 스노우지',  weight: 150, price: 37  },
  { type: '아트지 및 스노우지',  weight: 120, price: 30  },
  { type: '아트지 및 스노우지',  weight: 100, price: 25  },
  { type: '아르떼(고백색)',      weight: 310, price: 139 },
  { type: '아르떼(고백색)',      weight: 240, price: 103 },
  { type: '아르떼(고백색)',      weight: 210, price: 94  },
  { type: '아르떼(고백색)',      weight: 190, price: 85  },
  { type: '아르떼(고백색)',      weight: 160, price: 72  },
  { type: '아르떼(고백색)',      weight: 130, price: 59  },
  { type: '아르떼(고백색)',      weight: 105, price: 48  },
];

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

function formulaPrice(x, minC, maxC, k, minPrice, maxPrice) {
  if (x <= minC) return maxPrice;
  if (x >= maxC) return minPrice;
  const t = (x - minC) / (maxC - minC);
  return Math.round(minPrice + (maxPrice - minPrice) * Math.pow(1 - t, k));
}

function lookupServiceCost(tiers, copies) {
  if (!copies || copies <= 0 || !tiers?.length) return 0;
  const tier = tiers.find(t => t.maxCopies === null || copies <= t.maxCopies);
  return tier ? tier.cost : 0;
}

function calcSaddleBinding(copies) {
  if (!copies || copies <= 0) return 0;
  if (copies <= 7) return copies * 5000;
  if (copies <= 1000) return 40000;
  return 0;
}

function calcPerfectBinding(copies, intClicks) {
  if (!copies || copies <= 0) return 0;
  if (copies <= 3) return copies * 5000;
  return Math.ceil(Math.min(intClicks || 0, 75000) / 4000) * 20000;
}

function calcRingBinding(copies, intPages) {
  if (!copies || copies <= 0) return 0;
  const over160  = !isNaN(intPages) && intPages > 160;
  const unitPrice = over160 ? 500 : 450;
  const minCost   = over160 ? 50000 : 45000;
  return Math.max(copies * unitPrice, minCost);
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

  return <div style={{ position: 'relative', height: '240px' }}><canvas ref={canvasRef}></canvas></div>;
}

/* ── 수식 곡선 차트 ──────────────────────────────────────── */

function FormulaChart({ minClicks, maxClicks, curveK, bepNow, formulaMaxPrice }) {
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
      pts.push({ x, y: formulaPrice(x, minClicks, maxClicks, curveK, minPrice, formulaMaxPrice) });
    }
    chart.data.datasets[0].data = pts;
    chart.data.datasets[1].data = [{ x: 0, y: bepNow }, { x: xMax, y: bepNow }];
    chart.options.scales.x.max  = xMax;
    chart.options.scales.y.max  = Math.round(formulaMaxPrice * 1.2 / 100) * 100;
    chart.update('none');
  }, [minClicks, maxClicks, curveK, bepNow, formulaMaxPrice]);

  return <div style={{ position: 'relative', height: '240px' }}><canvas ref={canvasRef}></canvas></div>;
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
  const [tierSnapshots,    setTierSnapshots]    = useState([]);
  const [showTierLoad,     setShowTierLoad]     = useState(false);
  const tierLoadRef = useRef(null);
  const [editingIdx, setEditingIdx] = useState(-1);
  const [editingRaw, setEditingRaw] = useState('');

  // Phase 2 전용
  const [curveK, setCurveK]             = useState(0.5);
  const [formulaMaxPrice, setFormulaMaxPrice] = useState(3500);
  const [formulaSaveDone, setFormulaSaveDone] = useState(false);
  const [formulaSnapshots, setFormulaSnapshots] = useState([]);
  const [showFormulaLoad,  setShowFormulaLoad]  = useState(false);
  const formulaLoadRef = useRef(null);

  // 서비스 단가 설정
  const [coatingTiers,  setCoatingTiers]  = useState(DEFAULT_SVC_TIERS);
  const [saddleTiers,   setSaddleTiers]   = useState(DEFAULT_SVC_TIERS);
  const [perfectTiers,  setPerfectTiers]  = useState(DEFAULT_SVC_TIERS);
  const [ringTiers,     setRingTiers]     = useState(DEFAULT_SVC_TIERS);
  const [scoringTiers,  setScoringTiers]  = useState(DEFAULT_SVC_TIERS);
  const [activeModal,   setActiveModal]   = useState(null); // 'coating'|'saddle'|'perfect'|'ring'|'scoring'|null
  const [coatingEnabled, setCoatingEnabled] = useState(false);
  const [scoringEnabled,  setScoringEnabled]  = useState(false);

  // Job 계산기 — 공통
  const [jobCopies,     setJobCopies]     = useState('');
  const [coatingCost,   setCoatingCost]   = useState('');
  const [bindingMethod, setBindingMethod] = useState('saddle'); // 'saddle'|'perfect'|'ring'
  const [scoringCost,   setScoringCost]   = useState('');
  // 내지
  const [jobPages,      setJobPages]      = useState('');
  const [intPaperType,  setIntPaperType]  = useState('');
  const [intPaperWeight,setIntPaperWeight]= useState(0);
  // 표지
  const [coverSide,     setCoverSide]     = useState('single');
  const [covPaperType,  setCovPaperType]  = useState('');
  const [covPaperWeight,setCovPaperWeight]= useState(0);

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
      if (stored) {
        setCurveK(stored.curveK ?? 0.5);
        setFormulaMaxPrice(stored.formulaMaxPrice ?? 3500);
      }
    } catch {}
  }, []);

  /* localStorage → 스냅샷 목록 초기화 */
  useEffect(() => {
    try {
      const t = JSON.parse(localStorage.getItem(TIER_SAVES_KEY));
      if (Array.isArray(t)) setTierSnapshots(t);
      const f = JSON.parse(localStorage.getItem(FORMULA_SAVES_KEY));
      if (Array.isArray(f)) setFormulaSnapshots(f);
    } catch {}
  }, []);

  /* localStorage → 서비스 단가 초기화 */
  useEffect(() => {
    try {
      const c = JSON.parse(localStorage.getItem(COATING_KEY));
      if (Array.isArray(c) && c.length) setCoatingTiers(c);
      const sd = JSON.parse(localStorage.getItem(SADDLE_KEY));
      if (Array.isArray(sd) && sd.length) setSaddleTiers(sd);
      const pf = JSON.parse(localStorage.getItem(PERFECT_KEY));
      if (Array.isArray(pf) && pf.length) setPerfectTiers(pf);
      const rg = JSON.parse(localStorage.getItem(RING_KEY));
      if (Array.isArray(rg) && rg.length) setRingTiers(rg);
      const s = JSON.parse(localStorage.getItem(SCORING_KEY));
      if (Array.isArray(s) && s.length) setScoringTiers(s);
    } catch {}
  }, []);

  /* 드롭다운 click-outside 닫기 */
  useEffect(() => {
    if (!showTierLoad && !showFormulaLoad) return;
    function onDown(e) {
      if (showTierLoad    && tierLoadRef.current    && !tierLoadRef.current.contains(e.target))    setShowTierLoad(false);
      if (showFormulaLoad && formulaLoadRef.current && !formulaLoadRef.current.contains(e.target)) setShowFormulaLoad(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showTierLoad, showFormulaLoad]);

  /* ── Phase 1 핸들러 */
  function persistTiers(minC, maxC, mid, t) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ minClicks: minC, maxClicks: maxC, midCount: mid, tiers: t }));
  }
  function applyTierParams(minC, maxC, mid) {
    const next = generateTiers(minC, maxC, mid, save.bepNow);
    setMinClicks(minC); setMaxClicks(maxC); setMidCount(mid);
    setTiers(next);
    persistTiers(minC, maxC, mid, next);
    setEditingIdx(-1);
  }
  function updatePrice(idx, price) {
    let next;
    if (idx === 0) {
      // 첫 구간(최고 단가) 변경 시 중간 구간 가격을 비례 재계산
      const finiteCount = tiers.length - 1; // "그 이상" 제외
      const minPrice    = tiers[finiteCount - 1].price; // 마지막 유한 구간 단가 고정
      next = tiers.map((t, i) => {
        if (i === tiers.length - 1) return t; // "그 이상" 유지
        const ratio    = finiteCount <= 1 ? 0 : i / (finiteCount - 1);
        const newPrice = ratio >= 1
          ? minPrice
          : Math.round((price - (price - minPrice) * ratio) / 10) * 10;
        return { ...t, price: newPrice };
      });
    } else {
      next = tiers.map((t, i) => i === idx ? { ...t, price } : t);
    }
    setTiers(next);
    persistTiers(minClicks, maxClicks, midCount, next);
  }
  function handleTierChange(idx, rawValue) {
    setEditingIdx(idx);
    setEditingRaw(rawValue);
    const price = Number(rawValue);
    if (!price || price < 1) return;
    if (idx === 0) {
      const finiteCount = tiers.length - 1;
      const minPrice = tiers[finiteCount - 1].price;
      if (price <= minPrice) return;
      const next = tiers.map((t, i) => {
        if (i === 0) return { ...t, price };
        if (i === tiers.length - 1) return t;
        const ratio = finiteCount <= 1 ? 0 : i / (finiteCount - 1);
        const newPrice = ratio >= 1 ? minPrice : Math.round((price - (price - minPrice) * ratio) / 10) * 10;
        return { ...t, price: newPrice };
      });
      setTiers(next);
    } else {
      const next = tiers.map((t, i) => i === idx ? { ...t, price } : t);
      setTiers(next);
    }
  }
  function handleTierBlur(idx) {
    if (editingIdx !== idx) { setEditingIdx(-1); return; }
    const price = Math.max(1, Number(editingRaw) || 1);
    setEditingIdx(-1);
    setEditingRaw('');
    updatePrice(idx, price);
  }
  function resetTiers() { setEditingIdx(-1); applyTierParams(100, 5000, 3); }
  function handleTierSave() {
    persistTiers(minClicks, maxClicks, midCount, tiers);
    const snap = { id: Date.now(), ts: fmtNow(), minClicks, maxClicks, midCount, tiers };
    const next = [snap, ...tierSnapshots].slice(0, 5);
    setTierSnapshots(next);
    localStorage.setItem(TIER_SAVES_KEY, JSON.stringify(next));
    setSaveDone(true);
    setTimeout(() => setSaveDone(false), 1500);
  }
  function handleTierLoadSnap(snap) {
    setMinClicks(snap.minClicks);
    setMaxClicks(snap.maxClicks);
    setMidCount(snap.midCount);
    setTiers(snap.tiers);
    setEditingIdx(-1);
    setShowTierLoad(false);
  }
  function deleteTierSnap(id) {
    const next = tierSnapshots.filter(s => s.id !== id);
    setTierSnapshots(next);
    localStorage.setItem(TIER_SAVES_KEY, JSON.stringify(next));
    if (next.length === 0) setShowTierLoad(false);
  }

  /* ── Phase 2 핸들러 */
  function persistFormula(minC, maxC, k, maxP) {
    localStorage.setItem(FORMULA_KEY, JSON.stringify({ minClicks: minC, maxClicks: maxC, curveK: k, formulaMaxPrice: maxP }));
  }
  function applyFormulaParams(minC, maxC, k, maxP) {
    setMinClicks(minC); setMaxClicks(maxC); setCurveK(k); setFormulaMaxPrice(maxP);
    persistFormula(minC, maxC, k, maxP);
  }
  function resetFormula() { applyFormulaParams(100, 5000, 0.5, 3500); }
  function handleFormulaSave() {
    persistFormula(minClicks, maxClicks, curveK, formulaMaxPrice);
    const snap = { id: Date.now(), ts: fmtNow(), minClicks, maxClicks, curveK, formulaMaxPrice };
    const next = [snap, ...formulaSnapshots].slice(0, 5);
    setFormulaSnapshots(next);
    localStorage.setItem(FORMULA_SAVES_KEY, JSON.stringify(next));
    setFormulaSaveDone(true);
    setTimeout(() => setFormulaSaveDone(false), 1500);
  }
  function handleFormulaLoadSnap(snap) {
    setMinClicks(snap.minClicks);
    setMaxClicks(snap.maxClicks);
    setCurveK(snap.curveK);
    setFormulaMaxPrice(snap.formulaMaxPrice);
    setShowFormulaLoad(false);
  }
  function deleteFormulaSnap(id) {
    const next = formulaSnapshots.filter(s => s.id !== id);
    setFormulaSnapshots(next);
    localStorage.setItem(FORMULA_SAVES_KEY, JSON.stringify(next));
    if (next.length === 0) setShowFormulaLoad(false);
  }

  /* ── 서비스 단가 저장 */
  function saveServiceTiers(type, rows) {
    const sorted = [...rows].sort((a, b) =>
      a.maxCopies === null ? 1 : b.maxCopies === null ? -1 : a.maxCopies - b.maxCopies
    );
    if (type === 'coating') { setCoatingTiers(sorted); localStorage.setItem(COATING_KEY,  JSON.stringify(sorted)); }
    if (type === 'saddle')  { setSaddleTiers(sorted);  localStorage.setItem(SADDLE_KEY,   JSON.stringify(sorted)); }
    if (type === 'perfect') { setPerfectTiers(sorted); localStorage.setItem(PERFECT_KEY,  JSON.stringify(sorted)); }
    if (type === 'ring')    { setRingTiers(sorted);    localStorage.setItem(RING_KEY,      JSON.stringify(sorted)); }
    if (type === 'scoring') { setScoringTiers(sorted); localStorage.setItem(SCORING_KEY,  JSON.stringify(sorted)); }
    setActiveModal(null);
  }

  /* ── Job 계산 */
  const intPages  = parseInt(jobPages, 10);
  const copies    = parseInt(jobCopies, 10);
  const validCopies = !isNaN(copies) && copies > 0;

  // 내지
  const intClicks = (!isNaN(intPages) && intPages > 0 && validCopies)
    ? Math.ceil(intPages / 2) * copies : 0;
  const validInt  = intClicks > 0;
  const intPaperWeights  = PAPER_DATA.filter(p => p.type === intPaperType).map(p => p.weight);
  const selectedIntPaper = PAPER_DATA.find(p => p.type === intPaperType && p.weight === intPaperWeight) ?? null;
  const intSheets        = validInt ? Math.round(intClicks / 2) : 0;
  const intPaperCost     = selectedIntPaper && intSheets > 0 ? intSheets * selectedIntPaper.price : null;

  // 표지
  const covClicks = validCopies ? copies * (coverSide === 'double' ? 2 : 1) : 0;
  const covPaperWeights  = PAPER_DATA.filter(p => p.type === covPaperType).map(p => p.weight);
  const selectedCovPaper = PAPER_DATA.find(p => p.type === covPaperType && p.weight === covPaperWeight) ?? null;
  const covPaperCost     = selectedCovPaper && validCopies ? copies * selectedCovPaper.price : null;

  // 추가비용
  const coatingCalc = validCopies ? lookupServiceCost(coatingTiers, copies) : 0;
  const scoringCalc = validCopies ? lookupServiceCost(scoringTiers, copies) : 0;
  const coating = coatingEnabled ? (coatingCalc > 0 ? coatingCalc : (parseInt(coatingCost, 10) || 0)) : 0;
  const binding = validCopies
    ? (bindingMethod === 'saddle'
        ? calcSaddleBinding(copies)
        : bindingMethod === 'perfect'
          ? calcPerfectBinding(copies, intClicks)
          : calcRingBinding(copies, intPages))
    : 0;
  const scoring = scoringEnabled ? (scoringCalc > 0 ? scoringCalc : (parseInt(scoringCost, 10) || 0)) : 0;

  // Phase 1 결과
  const intMatchedIdx  = validInt && tiers
    ? tiers.findIndex(t => t.maxClicks === null || intClicks <= t.maxClicks) : -1;
  const intMatchedTier = intMatchedIdx >= 0 ? tiers[intMatchedIdx] : null;
  const intPrintCost   = intMatchedTier ? intClicks * intMatchedTier.price : null;

  const covMatchedIdx  = covClicks > 0 && tiers
    ? tiers.findIndex(t => t.maxClicks === null || covClicks <= t.maxClicks) : -1;
  const covMatchedTier = covMatchedIdx >= 0 ? tiers[covMatchedIdx] : null;
  const covPrintCost   = covMatchedTier ? covClicks * covMatchedTier.price : null;

  const tierTotal = intPrintCost !== null
    ? intPrintCost + (intPaperCost ?? 0) + (covPrintCost ?? 0) + (covPaperCost ?? 0) + coating + binding + scoring
    : null;

  // Phase 2 결과
  const minPrice    = save ? Math.round(save.bepNow) : 0;
  const fIntPrice   = validInt ? formulaPrice(intClicks, minClicks, maxClicks, curveK, minPrice, formulaMaxPrice) : null;
  const fIntPrint   = fIntPrice !== null ? intClicks * fIntPrice : null;
  const fCovPrice   = covClicks > 0 ? formulaPrice(covClicks, minClicks, maxClicks, curveK, minPrice, formulaMaxPrice) : null;
  const fCovPrint   = fCovPrice !== null ? covClicks * fCovPrice : null;
  const fTotal      = fIntPrint !== null
    ? fIntPrint + (intPaperCost ?? 0) + (fCovPrint ?? 0) + (covPaperCost ?? 0) + coating + binding + scoring
    : null;

  return (
    <div className="min-h-screen p-4 pb-12 max-w-6xl mx-auto">
      <header className="mb-5 pt-2 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">인쇄비 산출 시뮬레이터</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {phase === 'tier' ? '구간별 단가표 기반' : '수식 기반 곡선'} · job 인쇄비 산출
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
        <div className="flex flex-col gap-3">

          {/* BEP 참고값 — 상단 컴팩트 바 */}
          <section className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider shrink-0">BEP 참고</span>
              {[
                { label: '월 고정비',    value: `${fmt(save.F)}원`,              bold: true  },
                { label: '클릭 유형',    value: save.clickType === 'color' ? `컬러 (${save.C}원)` : `흑백 (${save.C}원)`, bold: false },
                { label: '월 기준 클릭', value: `${fmt(save.monthlyClicks)}클릭`, bold: false },
                { label: 'BEP 단가',    value: `${fmt(save.bepNow)}원/클릭`,    bold: true  },
              ].map(({ label, value, bold }) => (
                <span key={label} className="flex items-center gap-1.5 text-sm">
                  <span className="text-slate-400">{label}</span>
                  <span className={bold ? 'font-semibold text-slate-800' : 'text-slate-700'}>{value}</span>
                </span>
              ))}
            </div>
          </section>

          {/* 2열 본문 */}
          <div className="flex flex-col xl:flex-row gap-4 items-start">

            {/* ── 왼쪽: 탭 + 단가 설정 */}
            <div className="w-full xl:w-[460px] shrink-0 flex flex-col gap-3">

              <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
                <button onClick={() => setPhase('tier')}
                  className={`text-sm px-4 py-1.5 rounded-lg font-medium transition-colors ${phase === 'tier' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  구간표
                </button>
                <button onClick={() => setPhase('formula')}
                  className={`text-sm px-4 py-1.5 rounded-lg font-medium transition-colors ${phase === 'formula' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  수식
                </button>
              </div>

              {/* 구간별 단가표 */}
              {phase === 'tier' && (
                <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold text-slate-700">구간별 단가표</h2>
                    <div className="flex gap-2 items-center">
                      <button onClick={resetTiers}
                        className="text-xs text-slate-400 hover:text-slate-600 px-2.5 py-1 border border-slate-200 rounded-lg">
                        기본값 초기화
                      </button>
                      <div className="relative" ref={tierLoadRef}>
                        <button
                          onClick={() => setShowTierLoad(v => !v)}
                          disabled={tierSnapshots.length === 0}
                          className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                            tierSnapshots.length === 0
                              ? 'text-slate-300 border-slate-200 cursor-not-allowed'
                              : 'text-slate-500 hover:text-slate-700 border-slate-300'
                          }`}>
                          불러오기 {tierSnapshots.length > 0 && `(${tierSnapshots.length})`}
                        </button>
                        {showTierLoad && (
                          <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-slate-200 rounded-xl shadow-lg w-72 overflow-hidden">
                            <p className="text-xs font-semibold text-slate-400 px-3 pt-2.5 pb-1.5 border-b border-slate-100">저장된 설정</p>
                            {tierSnapshots.map(snap => (
                              <div key={snap.id} className="flex items-center justify-between px-3 py-2 hover:bg-indigo-50 cursor-pointer group"
                                onClick={() => handleTierLoadSnap(snap)}>
                                <div className="flex flex-col gap-0.5 min-w-0">
                                  <span className="text-xs font-medium text-slate-700">{snap.ts}</span>
                                  <span className="text-xs text-slate-400">{fmt(snap.minClicks)}~{fmt(snap.maxClicks)}클릭 · {snap.midCount}구간</span>
                                </div>
                                <button onClick={e => { e.stopPropagation(); deleteTierSnap(snap.id); }}
                                  className="text-slate-300 hover:text-red-400 text-sm ml-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">✕</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <button onClick={handleTierSave}
                        className={`text-xs px-3 py-1 rounded-lg border transition-colors ${saveDone ? 'bg-green-50 border-green-300 text-green-600' : 'bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700'}`}>
                        {saveDone ? '저장됨 ✓' : '단가표 저장'}
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3 mb-3 p-3 bg-slate-50 rounded-xl">
                    <ParamInput label="최소 클릭 수" value={minClicks} unit="클릭"
                      onChange={v => applyTierParams(Math.max(1, v), Math.max(v + 1, maxClicks), midCount)} />
                    <ParamInput label="최대 클릭 수" value={maxClicks} unit="클릭"
                      onChange={v => applyTierParams(minClicks, Math.max(minClicks + 1, v), midCount)} />
                    <ParamInput label="중간 구간 수" value={midCount} unit="개" step={1}
                      onChange={v => applyTierParams(minClicks, maxClicks, Math.max(0, Math.min(50, v)))} />
                  </div>
                  <TierChart tiers={tiers} bepNow={save.bepNow} />
                  <table className="w-full text-xs mt-3">
                    <thead>
                      <tr className="text-slate-400 border-b border-slate-100">
                        <th className="text-left pb-1.5 font-medium">클릭 수 이하</th>
                        <th className="text-right pb-1.5 font-medium pr-1">원/클릭</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tiers.map((t, i) => (
                        <tr key={i} className={`border-b border-slate-50 transition-colors ${intMatchedIdx === i ? 'bg-indigo-50' : ''}`}>
                          <td className="py-1 pr-2 text-slate-600">
                            {t.maxClicks === null
                              ? <span className="text-slate-400 italic">그 이상</span>
                              : <span>{fmt(t.maxClicks)}</span>}
                          </td>
                          <td className="py-1 text-right pr-1">
                            <input type="number" min={1}
                              value={editingIdx === i ? editingRaw : t.price}
                              onChange={e => handleTierChange(i, e.target.value)}
                              onBlur={() => handleTierBlur(i)}
                              className="w-20 border border-slate-200 rounded-md px-1.5 py-0.5 text-xs text-right text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}

              {/* 수식 기반 곡선 */}
              {phase === 'formula' && (
                <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold text-slate-700">수식 기반 단가 곡선</h2>
                    <div className="flex gap-2 items-center">
                      <button onClick={resetFormula}
                        className="text-xs text-slate-400 hover:text-slate-600 px-2.5 py-1 border border-slate-200 rounded-lg">
                        기본값 초기화
                      </button>
                      <div className="relative" ref={formulaLoadRef}>
                        <button
                          onClick={() => setShowFormulaLoad(v => !v)}
                          disabled={formulaSnapshots.length === 0}
                          className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                            formulaSnapshots.length === 0
                              ? 'text-slate-300 border-slate-200 cursor-not-allowed'
                              : 'text-slate-500 hover:text-slate-700 border-slate-300'
                          }`}>
                          불러오기 {formulaSnapshots.length > 0 && `(${formulaSnapshots.length})`}
                        </button>
                        {showFormulaLoad && (
                          <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-slate-200 rounded-xl shadow-lg w-80 overflow-hidden">
                            <p className="text-xs font-semibold text-slate-400 px-3 pt-2.5 pb-1.5 border-b border-slate-100">저장된 설정</p>
                            {formulaSnapshots.map(snap => (
                              <div key={snap.id} className="flex items-center justify-between px-3 py-2 hover:bg-indigo-50 cursor-pointer group"
                                onClick={() => handleFormulaLoadSnap(snap)}>
                                <div className="flex flex-col gap-0.5 min-w-0">
                                  <span className="text-xs font-medium text-slate-700">{snap.ts}</span>
                                  <span className="text-xs text-slate-400">최고{fmt(snap.formulaMaxPrice)}원 · k={snap.curveK} · {fmt(snap.minClicks)}~{fmt(snap.maxClicks)}클릭</span>
                                </div>
                                <button onClick={e => { e.stopPropagation(); deleteFormulaSnap(snap.id); }}
                                  className="text-slate-300 hover:text-red-400 text-sm ml-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">✕</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <button onClick={handleFormulaSave}
                        className={`text-xs px-3 py-1 rounded-lg border transition-colors ${formulaSaveDone ? 'bg-green-50 border-green-300 text-green-600' : 'bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700'}`}>
                        {formulaSaveDone ? '저장됨 ✓' : '설정 저장'}
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3 mb-3 p-3 bg-slate-50 rounded-xl">
                    <ParamInput label="최고 단가" value={formulaMaxPrice} unit="원" step={100}
                      onChange={v => applyFormulaParams(minClicks, maxClicks, curveK, Math.max(minPrice + 1, v))} />
                    <ParamInput label="최소 클릭 수" value={minClicks} unit="클릭"
                      onChange={v => applyFormulaParams(Math.max(1, v), Math.max(v + 1, maxClicks), curveK, formulaMaxPrice)} />
                    <ParamInput label="최대 클릭 수" value={maxClicks} unit="클릭"
                      onChange={v => applyFormulaParams(minClicks, Math.max(minClicks + 1, v), curveK, formulaMaxPrice)} />
                    <ParamInput label="커브 기울기 k" value={curveK} unit="" step={0.1}
                      onChange={v => applyFormulaParams(minClicks, maxClicks, Math.max(0.1, Math.round(v * 10) / 10), formulaMaxPrice)} />
                  </div>
                  <p className="text-xs text-slate-400 mb-3 px-1">
                    k &lt; 1 : 빠르게 하락 &nbsp;·&nbsp; k = 1 : 선형 &nbsp;·&nbsp; k &gt; 1 : 천천히 하락
                  </p>
                  <FormulaChart minClicks={minClicks} maxClicks={maxClicks} curveK={curveK} bepNow={save.bepNow} formulaMaxPrice={formulaMaxPrice} />
                </section>
              )}

            </div>{/* END 왼쪽 */}

            {/* ── 오른쪽: Job 인쇄비 계산 */}
            <div className="w-full flex-1 min-w-0 flex flex-col gap-3">

              {/* 서비스 단가 설정 */}
              <section className="bg-amber-50 border border-amber-200 rounded-xl p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-amber-800 mb-3">서비스 단가 설정</h2>
                <div className="flex flex-col gap-2">
                  {[
                    { key: 'coating', label: '코팅비 계산',      tiers: coatingTiers },
                    { key: 'saddle',  label: '중철비 계산',       tiers: saddleTiers  },
                    { key: 'perfect', label: '무선철비 계산',     tiers: perfectTiers },
                    { key: 'ring',    label: '링제본비 계산',     tiers: ringTiers    },
                    { key: 'scoring', label: '접음선(오시)비 계산', tiers: scoringTiers },
                  ].map(({ key, label, tiers: svcTiers }) => (
                    <button key={key} onClick={() => setActiveModal(key)}
                      className="flex items-center justify-between px-3 py-2.5 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-xl text-sm transition-colors">
                      <span className="font-medium text-slate-700">{label}</span>
                      <span className="text-xs text-slate-400">{svcTiers.length}구간 설정됨 →</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-indigo-800 mb-3">Job 인쇄비 계산</h2>
                <div className="flex flex-col gap-3">

                  {/* 공통 */}
                  <div className="p-3 bg-slate-50 rounded-xl">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">공통</p>
                    <div className="flex flex-col gap-3">
                      {/* 1행: 부수 · 제본비 · 제본방식 */}
                      <div className="flex gap-3 items-end">
                        <JobInput label="부수" value={jobCopies} unit="부" onChange={setJobCopies} />
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-medium text-slate-500">제본비 <span className="text-indigo-400 font-normal">(자동)</span></label>
                          <div className="relative w-32">
                            <span className="block px-3 py-2 pr-8 bg-indigo-50 border border-indigo-200 rounded-xl text-sm font-medium text-indigo-700">{fmt(binding)}</span>
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-indigo-400">원</span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-medium text-slate-500">제본 방식</label>
                          <div className="flex gap-3 py-1.5">
                            {[
                              { value: 'saddle',  label: '중철'   },
                              { value: 'perfect', label: '무선철' },
                              { value: 'ring',    label: '링제본' },
                            ].map(opt => (
                              <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer text-sm text-slate-700">
                                <input type="radio" name="bindingMethod" value={opt.value}
                                  checked={bindingMethod === opt.value}
                                  onChange={() => setBindingMethod(opt.value)}
                                  className="accent-indigo-600" />
                                {opt.label}
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                      {/* 2행: 코팅비 · 접음선 */}
                      <div className="flex gap-3 items-start">
                        {/* 코팅비 */}
                        <div className="flex flex-col gap-1">
                          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 cursor-pointer select-none">
                            <input type="checkbox" checked={coatingEnabled} onChange={e => setCoatingEnabled(e.target.checked)} className="accent-indigo-600" />
                            코팅비
                            {coatingEnabled && coatingCalc > 0 && <span className="text-indigo-400 font-normal">(자동)</span>}
                          </label>
                          {coatingEnabled && (coatingCalc > 0 ? (
                            <div className="relative w-32">
                              <span className="block px-3 py-2 pr-8 bg-indigo-50 border border-indigo-200 rounded-xl text-sm font-medium text-indigo-700">{fmt(coatingCalc)}</span>
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-indigo-400">원</span>
                            </div>
                          ) : (
                            <div className="relative">
                              <input type="number" min={0} placeholder="0" value={coatingCost} onChange={e => setCoatingCost(e.target.value)}
                                className="w-32 border border-slate-200 rounded-xl px-3 py-2 pr-8 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 text-slate-700 transition" />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">원</span>
                            </div>
                          ))}
                        </div>
                        {/* 접음선 */}
                        <div className="flex flex-col gap-1">
                          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 cursor-pointer select-none">
                            <input type="checkbox" checked={scoringEnabled} onChange={e => setScoringEnabled(e.target.checked)} className="accent-indigo-600" />
                            접음선
                            {scoringEnabled && scoringCalc > 0 && <span className="text-indigo-400 font-normal">(자동)</span>}
                          </label>
                          {scoringEnabled && (scoringCalc > 0 ? (
                            <div className="relative w-32">
                              <span className="block px-3 py-2 pr-8 bg-indigo-50 border border-indigo-200 rounded-xl text-sm font-medium text-indigo-700">{fmt(scoringCalc)}</span>
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-indigo-400">원</span>
                            </div>
                          ) : (
                            <div className="relative">
                              <input type="number" min={0} placeholder="0" value={scoringCost} onChange={e => setScoringCost(e.target.value)}
                                className="w-32 border border-slate-200 rounded-xl px-3 py-2 pr-8 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 text-slate-700 transition" />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">원</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 내지 */}
                  <div className="p-3 bg-slate-50 rounded-xl">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">내지</p>
                    <div className="flex flex-wrap gap-3">
                      <JobInput label="페이지 수" value={jobPages} unit="p" onChange={setJobPages} />
                      <PaperSelect label="지종" value={intPaperType}
                        onChange={v => { setIntPaperType(v); setIntPaperWeight(0); }} />
                      <WeightSelect label="무게" value={intPaperWeight} weights={intPaperWeights}
                        disabled={!intPaperType} onChange={v => setIntPaperWeight(v)} />
                    </div>
                  </div>

                  {/* 표지 */}
                  <div className="p-3 bg-slate-50 rounded-xl">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">표지</p>
                    <div className="flex flex-wrap gap-3 items-end">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-slate-500">인쇄 방식</label>
                        <div className="flex gap-3 py-1.5">
                          {['single', 'double'].map(s => (
                            <label key={s} className="flex items-center gap-1.5 cursor-pointer text-sm text-slate-700">
                              <input type="radio" name="coverSide" value={s}
                                checked={coverSide === s} onChange={() => setCoverSide(s)}
                                className="accent-indigo-600" />
                              {s === 'single' ? '단면' : '양면'}
                            </label>
                          ))}
                        </div>
                      </div>
                      <PaperSelect label="지종" value={covPaperType}
                        onChange={v => { setCovPaperType(v); setCovPaperWeight(0); }} />
                      <WeightSelect label="무게" value={covPaperWeight} weights={covPaperWeights}
                        disabled={!covPaperType} onChange={v => setCovPaperWeight(v)} />
                    </div>
                  </div>

                  {/* 결과 */}
                  {phase === 'tier'    && intPrintCost !== null && <CostResult
                    intClicks={intClicks} intUnitPrice={intMatchedTier?.price}
                    intPrint={intPrintCost} intPaper={intPaperCost}
                    covClicks={covClicks} covUnitPrice={covMatchedTier?.price}
                    covPrint={covPrintCost} covPaper={covPaperCost}
                    coating={coating} binding={binding} scoring={scoring} total={tierTotal} />}
                  {phase === 'formula' && fIntPrint !== null && <CostResult
                    intClicks={intClicks} intUnitPrice={fIntPrice}
                    intPrint={fIntPrint} intPaper={intPaperCost}
                    covClicks={covClicks} covUnitPrice={fCovPrice}
                    covPrint={fCovPrint} covPaper={covPaperCost}
                    coating={coating} binding={binding} scoring={scoring} total={fTotal} />}

                </div>
              </section>

            </div>{/* END 오른쪽 */}

          </div>{/* END 2열 본문 */}

          {/* 서비스 단가 설정 모달 */}
          {activeModal && (activeModal === 'saddle' || activeModal === 'perfect' || activeModal === 'ring'
            ? <BindingInfoModal type={activeModal} onClose={() => setActiveModal(null)} />
            : <ServiceTierModal
                title={activeModal === 'coating' ? '코팅비 구간 설정' : '접음선(오시)비 구간 설정'}
                tiers={activeModal === 'coating' ? coatingTiers : scoringTiers}
                onSave={rows => saveServiceTiers(activeModal, rows)}
                onClose={() => setActiveModal(null)}
              />
          )}

        </div>
      )}
    </div>
  );
}

function ParamInput({ label, value, unit, step = 100, onChange }) {
  const [raw, setRaw] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setRaw(String(value));
  }, [value, focused]);

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-500">{label}</label>
      <div className="relative">
        <input type="number" min={0} step={step} value={raw}
          onChange={e => setRaw(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); onChange(Number(raw) || 0); }}
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

function JobInput({ label, value, unit, onChange }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-500">{label}</label>
      <div className="relative">
        <input type="number" min={0} placeholder="0"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-32 border border-slate-200 rounded-xl px-3 py-2 pr-8 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 text-slate-700 transition" />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{unit}</span>
      </div>
    </div>
  );
}

const PAPER_TYPES = [...new Set(PAPER_DATA.map(p => p.type))];

function PaperSelect({ label, value, onChange }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-500">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-44 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 transition">
        <option value="">선택 안 함</option>
        {PAPER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
    </div>
  );
}

function WeightSelect({ label, value, weights, disabled, onChange }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-500">{label}</label>
      <select value={value} disabled={disabled} onChange={e => onChange(Number(e.target.value))}
        className="w-28 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-40 transition">
        <option value={0}>선택</option>
        {weights.map(w => <option key={w} value={w}>{w}g</option>)}
      </select>
    </div>
  );
}

function CostResult({ intClicks, intUnitPrice, intPrint, intPaper, covClicks, covUnitPrice, covPrint, covPaper, coating, binding, scoring, total }) {
  return (
    <div className="bg-slate-50 rounded-xl p-4 text-sm space-y-3">
      {/* 내지 */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
        <span className="text-xs font-semibold text-indigo-500 col-span-2">내지</span>
        <Row label="클릭 수"   value={`${fmt(intClicks)}클릭`} />
        <Row label="적용 단가" value={intUnitPrice != null ? `${fmt(intUnitPrice)}원/클릭` : '-'} />
        <Row label="인쇄비"    value={`${fmt(intPrint)}원`} />
        {intPaper !== null && <Row label="종이비" value={`${fmt(intPaper)}원`} />}
      </div>

      {/* 표지 */}
      {covPrint !== null && (
        <>
          <div className="border-t border-slate-200" />
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
            <span className="text-xs font-semibold text-indigo-500 col-span-2">표지</span>
            <Row label="클릭 수"   value={`${fmt(covClicks)}클릭`} />
            <Row label="적용 단가" value={covUnitPrice != null ? `${fmt(covUnitPrice)}원/클릭` : '-'} />
            <Row label="인쇄비"    value={`${fmt(covPrint)}원`} />
            {covPaper !== null && <Row label="종이비" value={`${fmt(covPaper)}원`} />}
          </div>
        </>
      )}

      {/* 기타 */}
      {(coating > 0 || binding > 0 || scoring > 0) && (
        <>
          <div className="border-t border-slate-200" />
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
            {coating > 0 && <Row label="코팅비" value={`${fmt(coating)}원`} />}
            {binding > 0 && <Row label="제본비" value={`${fmt(binding)}원`} />}
            {scoring > 0 && <Row label="접음선" value={`${fmt(scoring)}원`} />}
          </div>
        </>
      )}

      {/* 합계 */}
      <div className="border-t-2 border-slate-300 pt-2 grid grid-cols-2 gap-x-6">
        <Row label="총 인쇄비" value={`${fmt(total)}원`} bold />
      </div>
    </div>
  );
}

function BindingInfoModal({ type, onClose }) {
  const titles = { saddle: '중철비 계산 기준', perfect: '무선철비 계산 기준', ring: '링제본비 계산 기준' };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-[420px] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-800">{titles[type]}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
        </div>
        <div className="px-5 py-5 text-sm text-slate-700">
          {type === 'saddle' && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-400 border-b border-slate-100">
                  <th className="text-left pb-2 font-medium">부수 범위</th>
                  <th className="text-right pb-2 font-medium">금액</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-50">
                  <td className="py-2.5">1 ~ 7권</td>
                  <td className="py-2.5 text-right">권당 5,000원</td>
                </tr>
                <tr>
                  <td className="py-2.5">8 ~ 1,000권</td>
                  <td className="py-2.5 text-right">40,000원 (정액)</td>
                </tr>
              </tbody>
            </table>
          )}
          {type === 'perfect' && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-400 border-b border-slate-100">
                  <th className="text-left pb-2 font-medium">조건</th>
                  <th className="text-right pb-2 font-medium">금액</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-50">
                  <td className="py-2.5">1 ~ 3권</td>
                  <td className="py-2.5 text-right">권당 5,000원</td>
                </tr>
                <tr className="border-b border-slate-50">
                  <td className="py-2.5 text-slate-500 text-xs" colSpan={2}>
                    4권 이상 — 내지 클릭 수 4,000구간마다 20,000원씩 증가
                  </td>
                </tr>
                {[
                  ['1 ~ 4,000클릭',       '20,000원'],
                  ['4,001 ~ 8,000클릭',   '40,000원'],
                  ['8,001 ~ 12,000클릭',  '60,000원'],
                  ['12,001 ~ 16,000클릭', '80,000원'],
                  ['…4,000클릭 구간마다',  '20,000원씩 증가'],
                  ['75,001클릭 이상',      '380,000원 (상한)'],
                ].map(([range, amount], i, arr) => (
                  <tr key={range} className={i < arr.length - 1 ? 'border-b border-slate-50' : ''}>
                    <td className="py-2 text-slate-500">{range}</td>
                    <td className="py-2 text-right">{amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {type === 'ring' && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-400 border-b border-slate-100">
                  <th className="text-left pb-2 font-medium">조건</th>
                  <th className="text-right pb-2 font-medium">금액</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-50">
                  <td className="py-2.5 text-slate-500 text-xs" colSpan={2}>내지 160p 이하</td>
                </tr>
                <tr className="border-b border-slate-50">
                  <td className="py-2.5 pl-3">1 ~ 100권</td>
                  <td className="py-2.5 text-right">45,000원 (기본)</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-2.5 pl-3">101권 이상</td>
                  <td className="py-2.5 text-right">권수 × 450원</td>
                </tr>
                <tr className="border-b border-slate-50">
                  <td className="py-2.5 text-slate-500 text-xs" colSpan={2}>내지 161p 이상</td>
                </tr>
                <tr className="border-b border-slate-50">
                  <td className="py-2.5 pl-3">1 ~ 100권</td>
                  <td className="py-2.5 text-right">50,000원 (기본)</td>
                </tr>
                <tr>
                  <td className="py-2.5 pl-3">101권 이상</td>
                  <td className="py-2.5 text-right">권수 × 500원</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
        <div className="flex justify-end px-5 py-3 border-t border-slate-100">
          <button onClick={onClose}
            className="text-xs px-4 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

function ServiceTierModal({ title, tiers, onSave, onClose }) {
  const [rows, setRows] = useState(() =>
    tiers.length > 0 ? tiers.map(r => ({ ...r })) : [{ id: Date.now(), maxCopies: null, cost: 0 }]
  );

  function addRow() {
    const lastFinite = [...rows].reverse().find(r => r.maxCopies !== null);
    const newMax = lastFinite ? lastFinite.maxCopies * 2 : 100;
    const nullIdx = rows.findIndex(r => r.maxCopies === null);
    const newRow = { id: Date.now(), maxCopies: newMax, cost: 0 };
    if (nullIdx >= 0) {
      const next = [...rows];
      next.splice(nullIdx, 0, newRow);
      setRows(next);
    } else {
      setRows([...rows, newRow]);
    }
  }

  function removeRow(id) {
    const next = rows.filter(r => r.id !== id);
    if (next.length === 0) return;
    setRows(next);
  }

  function updateRow(id, field, val) {
    setRows(rows.map(r => r.id === id ? { ...r, [field]: val } : r));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-[420px] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-400 border-b border-slate-100">
                <th className="text-left pb-2 font-medium">부수 이하</th>
                <th className="text-right pb-2 font-medium">금액 (원)</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id} className="border-b border-slate-50">
                  <td className="py-2 pr-3">
                    {row.maxCopies === null
                      ? <span className="text-slate-400 italic text-xs pl-1">그 이상</span>
                      : <input type="number" min={1} value={row.maxCopies}
                          onChange={e => updateRow(row.id, 'maxCopies', Number(e.target.value) || 1)}
                          className="w-24 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                    }
                  </td>
                  <td className="py-2 text-right">
                    <input type="number" min={0} value={row.cost}
                      onChange={e => updateRow(row.id, 'cost', Number(e.target.value) || 0)}
                      className="w-32 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-right text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  </td>
                  <td className="py-2 pl-2 text-center">
                    {row.maxCopies !== null && (
                      <button onClick={() => removeRow(row.id)}
                        className="text-slate-300 hover:text-red-400 text-sm">✕</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={addRow}
            className="mt-3 text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-medium">
            + 구간 추가
          </button>
        </div>
        <div className="flex gap-2 justify-end px-5 py-3 border-t border-slate-100">
          <button onClick={onClose}
            className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-slate-500 hover:text-slate-700">
            취소
          </button>
          <button onClick={() => onSave(rows)}
            className="text-xs px-4 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
