import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { loadLatestSaveDB } from '../utils/supabaseUtils.js';
import { fmt } from '../utils/chartUtils.js';
import deowoorinData from '../data/더우린_A4_공급가액.json';

/* ── 상수 ───────────────────────────────────────────── */
const COATING_KEY          = 'printCoatingTiers';
const SADDLE_KEY           = 'printSaddleTiers';
const PERFECT_KEY          = 'printPerfectTiers';
const RING_KEY             = 'printRingTiers';
const SCORING_KEY          = 'printScoringTiers';
const MULTIPLIER_KEY       = 'printMultipliers_v1';
const MULTIPLIER_SAVES_KEY = 'printMultiplierSaves_v1';

// 더우린 표 축 (A4 기준)
const DEO_PAGES  = [4, 8, 12, 24, 64, 128, 256, 400, 500];
const DEO_COPIES = [2, 4, 6, 10, 50, 100, 200, 300];
const DEO_PRICES = deowoorinData.rows.map(r => r.prices);

const DEFAULT_MULTIPLIERS = [
  { maxCopies: 2,    rate: 1.15 },
  { maxCopies: 4,    rate: 1.12 },
  { maxCopies: 6,    rate: 1.10 },
  { maxCopies: 10,   rate: 1.08 },
  { maxCopies: 50,   rate: 1.07 },
  { maxCopies: 100,  rate: 1.06 },
  { maxCopies: 200,  rate: 1.05 },
  { maxCopies: null, rate: 1.05 },
];

const DEFAULT_SVC_TIERS = () => [{ id: Date.now(), maxCopies: null, cost: 0 }];

const PAPER_DATA = [
  { type: '백색모조지',        weight: 260, price: 66  },
  { type: '백색모조지',        weight: 220, price: 56  },
  { type: '백색모조지',        weight: 180, price: 44  },
  { type: '백색모조지',        weight: 150, price: 37  },
  { type: '백색모조지',        weight: 120, price: 30  },
  { type: '백색모조지',        weight: 100, price: 25  },
  { type: '백색모조지',        weight: 80,  price: 20  },
  { type: '백색모조지',        weight: 70,  price: 18  },
  { type: '미색모조지',        weight: 100, price: 26  },
  { type: '미색모조지',        weight: 80,  price: 21  },
  { type: '아트지 및 스노우지', weight: 300, price: 74  },
  { type: '아트지 및 스노우지', weight: 250, price: 62  },
  { type: '아트지 및 스노우지', weight: 200, price: 49  },
  { type: '아트지 및 스노우지', weight: 180, price: 45  },
  { type: '아트지 및 스노우지', weight: 150, price: 37  },
  { type: '아트지 및 스노우지', weight: 120, price: 30  },
  { type: '아트지 및 스노우지', weight: 100, price: 25  },
  { type: '아르떼(고백색)',     weight: 310, price: 139 },
  { type: '아르떼(고백색)',     weight: 240, price: 103 },
  { type: '아르떼(고백색)',     weight: 210, price: 94  },
  { type: '아르떼(고백색)',     weight: 190, price: 85  },
  { type: '아르떼(고백색)',     weight: 160, price: 72  },
  { type: '아르떼(고백색)',     weight: 130, price: 59  },
  { type: '아르떼(고백색)',     weight: 105, price: 48  },
];

/* ── 유틸 ───────────────────────────────────────────── */

function fmtNow() {
  const d = new Date();
  return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

/* ── 서비스 단가 조회 ────────────────────────────────── */

function lookupServiceCost(tiers, copies) {
  if (!copies || copies <= 0 || !tiers?.length) return 0;
  const tier = tiers.find(t => t.maxCopies === null || copies <= t.maxCopies);
  return tier ? tier.cost : 0;
}

/* ── 제본비 계산 ─────────────────────────────────────── */

function calcSaddleBinding(copies) {
  if (!copies || copies <= 0) return 0;
  if (copies <= 7)    return copies * 5000;
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
  const over160   = !isNaN(intPages) && intPages > 160;
  const unitPrice = over160 ? 500 : 450;
  const minCost   = over160 ? 50000 : 45000;
  return Math.max(copies * unitPrice, minCost);
}

/* ── 더우린 가격 보간 (로그 쌍선형, 범위 내 클램핑) ──── */

function interpolateDeowoolinPrice(pages, copies) {
  const lp = Math.log(Math.max(pages, 1));
  const lc = Math.log(Math.max(copies, 1));

  let pi2 = DEO_PAGES.findIndex(p => p >= pages);
  if (pi2 === -1) pi2 = DEO_PAGES.length - 1;
  const pi1 = Math.max(0, pi2 - 1);

  let ci2 = DEO_COPIES.findIndex(c => c >= copies);
  if (ci2 === -1) ci2 = DEO_COPIES.length - 1;
  const ci1 = Math.max(0, ci2 - 1);

  const lp1 = Math.log(DEO_PAGES[pi1]),  lp2 = Math.log(DEO_PAGES[pi2]);
  const lc1 = Math.log(DEO_COPIES[ci1]), lc2 = Math.log(DEO_COPIES[ci2]);

  const tp = lp1 === lp2 ? 0 : Math.min(1, Math.max(0, (lp - lp1) / (lp2 - lp1)));
  const tc = lc1 === lc2 ? 0 : Math.min(1, Math.max(0, (lc - lc1) / (lc2 - lc1)));

  const v11 = DEO_PRICES[pi1][ci1], v12 = DEO_PRICES[pi1][ci2];
  const v21 = DEO_PRICES[pi2][ci1], v22 = DEO_PRICES[pi2][ci2];

  const lv = Math.log(v11)*(1-tp)*(1-tc) + Math.log(v12)*(1-tp)*tc
           + Math.log(v21)*tp*(1-tc)      + Math.log(v22)*tp*tc;
  return Math.exp(lv);
}

// 더우린 표준 용지비 (80g 백색모조지 내지 + 300g 아트지 표지)
function calcStdPaperCost(pages, copies) {
  const intClicks = Math.ceil(pages / 2) * copies;
  return Math.round(intClicks / 2) * 20 + copies * 74;
}

// 배율 조회
function lookupMultiplier(copies, multipliers) {
  const m = multipliers.find(m => m.maxCopies === null || copies <= m.maxCopies);
  return m ? m.rate : multipliers.at(-1).rate;
}

/* ── 비교 모달 셀 색상 ────────────────────────────────── */

function diffColor(ourPrice, theirPrice) {
  if (ourPrice == null) return '';
  const pct = (ourPrice - theirPrice) / theirPrice * 100;
  if (pct <= -30) return 'bg-green-300';
  if (pct <= -10) return 'bg-green-100';
  if (pct <    0) return 'bg-green-50';
  if (pct <   10) return 'bg-yellow-50';
  if (pct <   30) return 'bg-orange-100';
  return 'bg-red-200';
}

/* ── 메인 컴포넌트 ───────────────────────────────────── */

export default function PrintCostSimulator() {
  const navigate = useNavigate();
  const [save, setSave]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  // 배율 설정
  const [multipliers,         setMultipliers]         = useState(DEFAULT_MULTIPLIERS);
  const [multiplierSnapshots, setMultiplierSnapshots] = useState([]);
  const [showMultiplierLoad,  setShowMultiplierLoad]  = useState(false);
  const [multiplierSaveDone,  setMultiplierSaveDone]  = useState(false);
  const multiplierLoadRef = useRef(null);

  // 서비스 단가
  const [coatingTiers,  setCoatingTiers]  = useState(DEFAULT_SVC_TIERS);
  const [saddleTiers,   setSaddleTiers]   = useState(DEFAULT_SVC_TIERS);
  const [perfectTiers,  setPerfectTiers]  = useState(DEFAULT_SVC_TIERS);
  const [ringTiers,     setRingTiers]     = useState(DEFAULT_SVC_TIERS);
  const [scoringTiers,  setScoringTiers]  = useState(DEFAULT_SVC_TIERS);
  const [activeModal,   setActiveModal]   = useState(null);
  const [coatingEnabled, setCoatingEnabled] = useState(false);
  const [scoringEnabled,  setScoringEnabled]  = useState(false);

  // 타사가격비교
  const [comparisonData,      setComparisonData]      = useState(null);
  const [showComparisonModal, setShowComparisonModal] = useState(false);

  // Job 입력
  const [jobCopies,      setJobCopies]      = useState('');
  const [coatingCost,    setCoatingCost]    = useState('');
  const [bindingMethod,  setBindingMethod]  = useState('perfect');
  const [scoringCost,    setScoringCost]    = useState('');
  const [jobPages,       setJobPages]       = useState('');
  const [intPaperType,   setIntPaperType]   = useState('');
  const [intPaperWeight, setIntPaperWeight] = useState(0);
  const [coverSide,      setCoverSide]      = useState('single');
  const [covPaperType,   setCovPaperType]   = useState('');
  const [covPaperWeight, setCovPaperWeight] = useState(0);

  /* Supabase 로드 */
  useEffect(() => {
    loadLatestSaveDB()
      .then(setSave)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  /* localStorage → 배율 초기화 */
  useEffect(() => {
    try {
      const m = JSON.parse(localStorage.getItem(MULTIPLIER_KEY));
      if (Array.isArray(m) && m.length) setMultipliers(m);
    } catch {}
  }, []);

  /* localStorage → 배율 스냅샷 */
  useEffect(() => {
    try {
      const ms = JSON.parse(localStorage.getItem(MULTIPLIER_SAVES_KEY));
      if (Array.isArray(ms)) setMultiplierSnapshots(ms);
    } catch {}
  }, []);

  /* localStorage → 서비스 단가 초기화 */
  useEffect(() => {
    try {
      const c  = JSON.parse(localStorage.getItem(COATING_KEY));
      const sd = JSON.parse(localStorage.getItem(SADDLE_KEY));
      const pf = JSON.parse(localStorage.getItem(PERFECT_KEY));
      const rg = JSON.parse(localStorage.getItem(RING_KEY));
      const sc = JSON.parse(localStorage.getItem(SCORING_KEY));
      if (Array.isArray(c)  && c.length)  setCoatingTiers(c);
      if (Array.isArray(sd) && sd.length) setSaddleTiers(sd);
      if (Array.isArray(pf) && pf.length) setPerfectTiers(pf);
      if (Array.isArray(rg) && rg.length) setRingTiers(rg);
      if (Array.isArray(sc) && sc.length) setScoringTiers(sc);
    } catch {}
  }, []);

  /* 드롭다운 click-outside 닫기 */
  useEffect(() => {
    if (!showMultiplierLoad) return;
    function onDown(e) {
      if (multiplierLoadRef.current && !multiplierLoadRef.current.contains(e.target))
        setShowMultiplierLoad(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showMultiplierLoad]);

  /* ── 배율 핸들러 */
  function persistMultipliers(m) {
    localStorage.setItem(MULTIPLIER_KEY, JSON.stringify(m));
  }
  function updateMultiplierRate(idx, rate) {
    const next = multipliers.map((m, i) => i === idx ? { ...m, rate } : m);
    setMultipliers(next);
    persistMultipliers(next);
  }
  function resetMultipliers() {
    setMultipliers(DEFAULT_MULTIPLIERS);
    persistMultipliers(DEFAULT_MULTIPLIERS);
  }
  function handleMultiplierSave() {
    persistMultipliers(multipliers);
    const snap = { id: Date.now(), ts: fmtNow(), multipliers: multipliers.map(m => ({ ...m })) };
    const next = [snap, ...multiplierSnapshots].slice(0, 5);
    setMultiplierSnapshots(next);
    localStorage.setItem(MULTIPLIER_SAVES_KEY, JSON.stringify(next));
    setMultiplierSaveDone(true);
    setTimeout(() => setMultiplierSaveDone(false), 1500);
  }
  function handleMultiplierLoadSnap(snap) {
    setMultipliers(snap.multipliers);
    persistMultipliers(snap.multipliers);
    setShowMultiplierLoad(false);
  }
  function deleteMultiplierSnap(id) {
    const next = multiplierSnapshots.filter(s => s.id !== id);
    setMultiplierSnapshots(next);
    localStorage.setItem(MULTIPLIER_SAVES_KEY, JSON.stringify(next));
    if (next.length === 0) setShowMultiplierLoad(false);
  }

  /* ── 서비스 단가 저장 */
  function saveServiceTiers(type, rows) {
    const sorted = [...rows].sort((a, b) =>
      a.maxCopies === null ? 1 : b.maxCopies === null ? -1 : a.maxCopies - b.maxCopies
    );
    if (type === 'coating') { setCoatingTiers(sorted);  localStorage.setItem(COATING_KEY,  JSON.stringify(sorted)); }
    if (type === 'saddle')  { setSaddleTiers(sorted);   localStorage.setItem(SADDLE_KEY,   JSON.stringify(sorted)); }
    if (type === 'perfect') { setPerfectTiers(sorted);  localStorage.setItem(PERFECT_KEY,  JSON.stringify(sorted)); }
    if (type === 'ring')    { setRingTiers(sorted);     localStorage.setItem(RING_KEY,     JSON.stringify(sorted)); }
    if (type === 'scoring') { setScoringTiers(sorted);  localStorage.setItem(SCORING_KEY,  JSON.stringify(sorted)); }
    setActiveModal(null);
  }

  /* ── 타사가격비교 */
  function handleComparisonClick() {
    if (!save) return;
    const rows = deowoorinData.rows.map((row) => {
      const pages = parseInt(row.pages);
      return {
        pages: row.pages,
        items: DEO_COPIES.map((copies, ci) => {
          const intClicks = Math.ceil(pages / 2) * copies;
          const perfBind  = calcPerfectBinding(copies, intClicks);
          const stdPaper  = calcStdPaperCost(pages, copies);
          const bepFloor  = intClicks * save.bepNow + stdPaper + perfBind;
          const deoTotal  = row.prices[ci];
          const rate      = lookupMultiplier(copies, multipliers);
          const ourPrice  = Math.max(bepFloor, Math.round(deoTotal * rate));
          return { copies, ourPrice, theirPrice: deoTotal };
        }),
      };
    });
    setComparisonData(rows);
    setShowComparisonModal(true);
  }

  async function exportComparisonExcel(data) {
    const copies = deowoorinData.copies;
    const makeSheet = (getValue) => {
      const header = ['페이지', ...copies];
      const sheetData = [header, ...data.map(row => [
        row.pages, ...row.items.map(item => getValue(item) ?? ''),
      ])];
      return XLSX.utils.aoa_to_sheet(sheetData);
    };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, makeSheet(i => i.ourPrice),   '우리 가격');
    XLSX.utils.book_append_sheet(wb, makeSheet(i => i.theirPrice), '더우린 가격');
    XLSX.utils.book_append_sheet(wb, makeSheet(i =>
      i.ourPrice != null ? i.ourPrice - i.theirPrice : null
    ), '차이(우리-더우린)');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    if ('showSaveFilePicker' in window) {
      try {
        const fh = await window.showSaveFilePicker({
          suggestedName: '타사가격비교.xlsx',
          types: [{ description: 'Excel 파일', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }],
        });
        const writable = await fh.createWritable();
        await writable.write(new Uint8Array(buf));
        await writable.close();
      } catch {}
    } else {
      const blob = new Blob([new Uint8Array(buf)], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = '타사가격비교.xlsx'; a.click();
      URL.revokeObjectURL(url);
    }
  }

  /* ── 통합저장 / 불러오기 */
  async function handlePresetSave() {
    const preset = {
      multipliers,
      coatingTiers, saddleTiers, perfectTiers, ringTiers, scoringTiers,
    };
    if ('showSaveFilePicker' in window) {
      try {
        const fh = await window.showSaveFilePicker({
          suggestedName: '인쇄비_단가설정.json',
          types: [{ description: 'JSON 파일', accept: { 'application/json': ['.json'] } }],
        });
        const writable = await fh.createWritable();
        await writable.write(JSON.stringify(preset, null, 2));
        await writable.close();
      } catch {}
    } else {
      const blob = new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = '인쇄비_단가설정.json'; a.click();
      URL.revokeObjectURL(url);
    }
  }

  async function handlePresetLoad() {
    let preset;
    if ('showOpenFilePicker' in window) {
      try {
        const [fh] = await window.showOpenFilePicker({
          types: [{ description: 'JSON 파일', accept: { 'application/json': ['.json'] } }],
          multiple: false,
        });
        const file = await fh.getFile();
        preset = JSON.parse(await file.text());
      } catch { return; }
    } else {
      preset = await new Promise(resolve => {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.json,application/json';
        input.onchange = async e => {
          const file = e.target.files[0];
          if (!file) { resolve(null); return; }
          try { resolve(JSON.parse(await file.text())); } catch { resolve(null); }
        };
        input.click();
      });
      if (!preset) return;
    }
    if (preset.multipliers)  { setMultipliers(preset.multipliers);   persistMultipliers(preset.multipliers); }
    if (preset.coatingTiers) { setCoatingTiers(preset.coatingTiers); localStorage.setItem(COATING_KEY,  JSON.stringify(preset.coatingTiers)); }
    if (preset.saddleTiers)  { setSaddleTiers(preset.saddleTiers);   localStorage.setItem(SADDLE_KEY,   JSON.stringify(preset.saddleTiers)); }
    if (preset.perfectTiers) { setPerfectTiers(preset.perfectTiers); localStorage.setItem(PERFECT_KEY,  JSON.stringify(preset.perfectTiers)); }
    if (preset.ringTiers)    { setRingTiers(preset.ringTiers);       localStorage.setItem(RING_KEY,     JSON.stringify(preset.ringTiers)); }
    if (preset.scoringTiers) { setScoringTiers(preset.scoringTiers); localStorage.setItem(SCORING_KEY,  JSON.stringify(preset.scoringTiers)); }
  }

  /* ── 계산 ────────────────────────────────────────── */
  const intPages    = parseInt(jobPages, 10);
  const copies      = parseInt(jobCopies, 10);
  const validCopies = !isNaN(copies) && copies > 0;
  const intClicks   = (!isNaN(intPages) && intPages > 0 && validCopies)
    ? Math.ceil(intPages / 2) * copies : 0;
  const validInt    = intClicks > 0;

  // 종이
  const intPaperWeights  = PAPER_DATA.filter(p => p.type === intPaperType).map(p => p.weight);
  const selectedIntPaper = PAPER_DATA.find(p => p.type === intPaperType && p.weight === intPaperWeight) ?? null;
  const intSheets        = validInt ? Math.round(intClicks / 2) : 0;
  const intPaperCost     = selectedIntPaper && intSheets > 0 ? intSheets * selectedIntPaper.price : 0;

  const covPaperWeights  = PAPER_DATA.filter(p => p.type === covPaperType).map(p => p.weight);
  const selectedCovPaper = PAPER_DATA.find(p => p.type === covPaperType && p.weight === covPaperWeight) ?? null;
  const covPaperCost     = selectedCovPaper && validCopies ? copies * selectedCovPaper.price : 0;

  // 더우린 기준 표준 용지비
  const stdPaper = validInt ? calcStdPaperCost(intPages, copies) : 0;

  // 제본
  const binding = validCopies
    ? (bindingMethod === 'saddle'
        ? calcSaddleBinding(copies)
        : bindingMethod === 'perfect'
          ? calcPerfectBinding(copies, intClicks)
          : calcRingBinding(copies, intPages))
    : 0;
  const perfectBind = validInt ? calcPerfectBinding(copies, intClicks) : 0;
  // 더우린 기준(무선철) 대비 제본비 차액 — 무선철이면 0
  const bindingAdj = binding - perfectBind;

  // 코팅/접음선
  const coatingCalc = validCopies ? lookupServiceCost(coatingTiers, copies) : 0;
  const scoringCalc = validCopies ? lookupServiceCost(scoringTiers, copies) : 0;
  const coating = coatingEnabled ? (coatingCalc > 0 ? coatingCalc : (parseInt(coatingCost, 10) || 0)) : 0;
  const scoring = scoringEnabled ? (scoringCalc > 0 ? scoringCalc : (parseInt(scoringCost, 10) || 0)) : 0;

  // 더우린 기준가 × 배율, BEP 플로어
  const deoTotal       = (validInt && save) ? interpolateDeowoolinPrice(intPages, copies) : null;
  const multiplierRate = validCopies ? lookupMultiplier(copies, multipliers) : 1;
  const bepFloor       = (validInt && save) ? intClicks * save.bepNow + stdPaper + perfectBind : 0;
  const basePriceRaw   = deoTotal !== null ? deoTotal * multiplierRate : null;
  const basePrice      = basePriceRaw !== null ? Math.max(bepFloor, Math.round(basePriceRaw)) : null;
  const isBepApplied   = basePriceRaw !== null && basePriceRaw < bepFloor;

  // 종이 차액 (선택 용지 - 더우린 표준 용지)
  const paperAdj = basePrice !== null ? (intPaperCost + covPaperCost) - stdPaper : null;

  // 표지 양면 추가 (더우린은 단면 기준)
  const extraCoverPrint = (coverSide === 'double' && validCopies && save && intClicks > 0)
    ? copies * save.bepNow
    : 0;

  // 합계
  const total = basePrice !== null
    ? basePrice + (paperAdj ?? 0) + bindingAdj + extraCoverPrint + coating + scoring
    : null;

  /* ── 왼쪽 패널 미리보기 데이터 (메모이제이션) ────── */
  const previewData = useMemo(() => {
    if (!save) return null;
    return deowoorinData.rows.map((row) => {
      const pages = parseInt(row.pages);
      return {
        pages: row.pages,
        items: DEO_COPIES.map((copies, ci) => {
          const intClicks = Math.ceil(pages / 2) * copies;
          const perfBind  = calcPerfectBinding(copies, intClicks);
          const sp        = calcStdPaperCost(pages, copies);
          const bepF      = intClicks * save.bepNow + sp + perfBind;
          const deoPrice  = row.prices[ci];
          const rate      = lookupMultiplier(copies, multipliers);
          const priceRaw  = deoPrice * rate;
          const price     = Math.max(bepF, Math.round(priceRaw));
          return { copies, price, bepApplied: priceRaw < bepF };
        }),
      };
    });
  }, [multipliers, save]);

  /* ── JSX ─────────────────────────────────────────── */
  return (
    <div className="min-h-screen p-4 pb-12 max-w-6xl mx-auto">
      <header className="mb-5 pt-2 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">인쇄비 산출 시뮬레이터</h1>
          <p className="text-xs text-slate-400 mt-0.5">더우린 기준 배율 모델 · job 인쇄비 산출</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleComparisonClick}
            className="text-sm text-slate-500 hover:text-slate-800 px-3 py-1.5 border border-slate-300 rounded-lg transition-colors">
            타사가격비교
          </button>
          <button onClick={handlePresetLoad}
            className="text-sm text-slate-500 hover:text-slate-800 px-3 py-1.5 border border-slate-300 rounded-lg transition-colors">
            불러오기
          </button>
          <button onClick={handlePresetSave}
            className="text-sm px-3 py-1.5 bg-indigo-600 text-white border border-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors">
            통합저장
          </button>
          <button onClick={() => navigate('/')}
            className="text-sm text-slate-500 hover:text-slate-800 px-3 py-1.5 border border-slate-300 rounded-lg transition-colors">
            ← 손익분기점 그래프
          </button>
        </div>
      </header>

      {loading && <p className="text-center text-slate-400 py-12">데이터 불러오는 중...</p>}
      {error   && <p className="text-center text-red-400 py-12">오류: {error}</p>}
      {!loading && !error && !save && (
        <p className="text-center text-slate-400 py-12">저장된 BEP 데이터가 없습니다.</p>
      )}

      {!loading && !error && save && (
        <div className="flex flex-col gap-3">

          {/* BEP 참고값 */}
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

            {/* ── 왼쪽: 배율 설정 + 미리보기 */}
            <div className="w-full xl:w-[500px] shrink-0 flex flex-col gap-3">
              <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-700">더우린 기준 배율 설정</h2>
                    <p className="text-xs text-slate-400 mt-0.5">더우린 공급가 × 배율 = 우리 가격 · BEP 이하는 자동 상향</p>
                  </div>
                  <div className="flex gap-2 items-center">
                    <button onClick={resetMultipliers}
                      className="text-xs text-slate-400 hover:text-slate-600 px-2.5 py-1 border border-slate-200 rounded-lg">
                      기본값 초기화
                    </button>
                    <div className="relative" ref={multiplierLoadRef}>
                      <button
                        onClick={() => setShowMultiplierLoad(v => !v)}
                        disabled={multiplierSnapshots.length === 0}
                        className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                          multiplierSnapshots.length === 0
                            ? 'text-slate-300 border-slate-200 cursor-not-allowed'
                            : 'text-slate-500 hover:text-slate-700 border-slate-300'
                        }`}>
                        불러오기 {multiplierSnapshots.length > 0 && `(${multiplierSnapshots.length})`}
                      </button>
                      {showMultiplierLoad && (
                        <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-slate-200 rounded-xl shadow-lg w-64 overflow-hidden">
                          <p className="text-xs font-semibold text-slate-400 px-3 pt-2.5 pb-1.5 border-b border-slate-100">저장된 배율 설정</p>
                          {multiplierSnapshots.map(snap => (
                            <div key={snap.id} className="flex items-center justify-between px-3 py-2 hover:bg-indigo-50 cursor-pointer group"
                              onClick={() => handleMultiplierLoadSnap(snap)}>
                              <span className="text-xs font-medium text-slate-700">{snap.ts}</span>
                              <button onClick={e => { e.stopPropagation(); deleteMultiplierSnap(snap.id); }}
                                className="text-slate-300 hover:text-red-400 text-sm ml-2 opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <button onClick={handleMultiplierSave}
                      className={`text-xs px-3 py-1 rounded-lg border transition-colors ${
                        multiplierSaveDone
                          ? 'bg-green-50 border-green-300 text-green-600'
                          : 'bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700'
                      }`}>
                      {multiplierSaveDone ? '저장됨 ✓' : '배율 저장'}
                    </button>
                  </div>
                </div>

                {/* 배율 입력 테이블 */}
                <table className="w-full text-sm mb-4">
                  <thead>
                    <tr className="text-xs text-slate-400 border-b border-slate-100">
                      <th className="text-left pb-1.5 font-medium">부수 이하</th>
                      <th className="text-right pb-1.5 font-medium pr-1">배율</th>
                    </tr>
                  </thead>
                  <tbody>
                    {multipliers.map((m, idx) => (
                      <tr key={idx} className="border-b border-slate-50">
                        <td className="py-1.5 text-slate-600 text-xs">
                          {m.maxCopies === null
                            ? <span className="text-slate-400 italic">그 이상</span>
                            : <span>{m.maxCopies}부</span>}
                        </td>
                        <td className="py-1.5 text-right pr-1">
                          <input
                            type="number" min={0.5} max={5} step={0.01}
                            value={m.rate}
                            onChange={e => {
                              const v = parseFloat(e.target.value);
                              if (!isNaN(v) && v > 0) updateMultiplierRate(idx, v);
                            }}
                            className="w-20 border border-slate-200 rounded-md px-1.5 py-0.5 text-xs text-right text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* 실시간 미리보기 */}
                {previewData && (
                  <div>
                    <p className="text-xs font-semibold text-slate-400 mb-1.5">미리보기 (우리 가격, 용지+무선철 포함)</p>
                    <p className="text-[10px] text-slate-400 mb-2">
                      <span className="inline-block w-2.5 h-2.5 rounded bg-orange-100 mr-1 align-middle"></span>주황 = BEP 플로어 적용 구간
                    </p>
                    <div className="overflow-x-auto">
                      <table className="text-[10px] border-collapse w-full min-w-max">
                        <thead>
                          <tr className="bg-slate-50">
                            <th className="border border-slate-200 px-1.5 py-1 text-left font-semibold text-slate-500 sticky left-0 bg-slate-50">p</th>
                            {DEO_COPIES.map(c => (
                              <th key={c} className="border border-slate-200 px-1.5 py-1 text-center font-semibold text-slate-500 min-w-[52px]">{c}부</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {previewData.map(row => (
                            <tr key={row.pages}>
                              <td className="border border-slate-200 px-1.5 py-1 font-semibold text-slate-600 sticky left-0 bg-white">{row.pages}</td>
                              {row.items.map(item => (
                                <td key={item.copies}
                                  className={`border border-slate-200 px-1.5 py-1 text-right ${item.bepApplied ? 'bg-orange-50' : ''}`}>
                                  {Math.round(item.price / 1000)}k
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </section>
            </div>

            {/* ── 오른쪽: Job 인쇄비 계산 */}
            <div className="w-full flex-1 min-w-0 flex flex-col gap-3">

              {/* 서비스 단가 설정 */}
              <section className="bg-amber-50 border border-amber-200 rounded-xl p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-amber-800 mb-3">서비스 단가 설정</h2>
                <div className="flex flex-col gap-2">
                  {[
                    { key: 'coating', label: '코팅비 계산',       tiers: coatingTiers },
                    { key: 'saddle',  label: '중철비 계산',        tiers: saddleTiers  },
                    { key: 'perfect', label: '무선철비 계산',      tiers: perfectTiers },
                    { key: 'ring',    label: '링제본비 계산',      tiers: ringTiers    },
                    { key: 'scoring', label: '접음선(오시)비 계산', tiers: scoringTiers },
                  ].map(({ key, label, tiers: svcTiers }) => {
                    const fixedRule = key === 'saddle' || key === 'perfect' || key === 'ring';
                    const hint = fixedRule ? '계산 기준 보기 →' : `${svcTiers.length}구간 설정됨 →`;
                    return (
                      <button key={key} onClick={() => setActiveModal(key)}
                        className="flex items-center justify-between px-3 py-2.5 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-xl text-sm transition-colors">
                        <span className="font-medium text-slate-700">{label}</span>
                        <span className="text-xs text-slate-400">{hint}</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-indigo-800 mb-3">Job 인쇄비 계산</h2>
                <div className="flex flex-col gap-3">

                  {/* 공통 */}
                  <div className="p-3 bg-slate-50 rounded-xl">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">공통</p>
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-wrap gap-3 items-end">
                        <JobInput label="부수" value={jobCopies} unit="부" onChange={setJobCopies} />
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-medium text-slate-500">제본 방식</label>
                          <div className="flex gap-3 py-1.5 flex-wrap">
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
                                {opt.value === 'perfect' && <span className="text-xs text-indigo-400">(기준)</span>}
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-3 items-start">
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
                              {s === 'single' && <span className="text-xs text-indigo-400">(기준)</span>}
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
                  {total !== null && (
                    <CostResult
                      basePrice={basePrice}
                      isBepApplied={isBepApplied}
                      multiplierRate={multiplierRate}
                      paperAdj={paperAdj}
                      intPaperCost={intPaperCost}
                      covPaperCost={covPaperCost}
                      bindingAdj={bindingAdj}
                      bindingMethod={bindingMethod}
                      extraCoverPrint={extraCoverPrint}
                      coating={coating}
                      scoring={scoring}
                      total={total}
                    />
                  )}

                </div>
              </section>

            </div>

          </div>

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

          {/* 타사가격비교 모달 */}
          {showComparisonModal && comparisonData && (
            <ComparisonModal
              data={comparisonData}
              copies={deowoorinData.copies}
              onExport={() => exportComparisonExcel(comparisonData)}
              onClose={() => setShowComparisonModal(false)}
            />
          )}

        </div>
      )}
    </div>
  );
}

/* ── 헬퍼 컴포넌트 ──────────────────────────────────── */

function Row({ label, value, bold, note }) {
  return (
    <>
      <span className="text-slate-500">{label}{note && <span className="text-xs text-slate-400 ml-1">{note}</span>}</span>
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

function CostResult({ basePrice, isBepApplied, multiplierRate, paperAdj, intPaperCost, covPaperCost,
                      bindingAdj, bindingMethod, extraCoverPrint, coating, scoring, total }) {
  const bindingLabel = bindingMethod === 'saddle' ? '중철' : '링제본';
  const hasPaperAdj  = paperAdj !== 0;
  const hasBindAdj   = bindingAdj !== 0;

  return (
    <div className="bg-slate-50 rounded-xl p-4 text-sm space-y-3">
      {/* 기준가 */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
        <span className="text-xs font-semibold text-indigo-500 col-span-2">
          기준가 <span className="font-normal text-slate-400">(더우린 × {multiplierRate.toFixed(2)}, 무선철+표준용지 포함)</span>
          {isBepApplied && <span className="ml-2 text-orange-500 text-[10px] font-semibold">BEP 플로어 적용</span>}
        </span>
        <Row label="기준가" value={`${fmt(basePrice)}원`} bold />
      </div>

      {/* 종이 차액 */}
      {hasPaperAdj && (
        <>
          <div className="border-t border-slate-200" />
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
            <span className="text-xs font-semibold text-indigo-500 col-span-2">종이 차액 <span className="font-normal text-slate-400">(vs 더우린 표준)</span></span>
            {intPaperCost > 0 && <Row label="내지 종이비" value={`${fmt(intPaperCost)}원`} />}
            {covPaperCost > 0 && <Row label="표지 종이비" value={`${fmt(covPaperCost)}원`} />}
            {intPaperCost === 0 && covPaperCost === 0 && (
              <Row label="종이비 미포함" value={`−${fmt(Math.abs(paperAdj))}원`} note="(기준가에서 차감)" />
            )}
          </div>
        </>
      )}

      {/* 제본 차액 */}
      {hasBindAdj && (
        <>
          <div className="border-t border-slate-200" />
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
            <Row label={`${bindingLabel} 차액 (vs 무선철)`}
                 value={`${bindingAdj >= 0 ? '+' : ''}${fmt(bindingAdj)}원`} />
          </div>
        </>
      )}

      {/* 표지 양면 추가 */}
      {extraCoverPrint > 0 && (
        <>
          <div className="border-t border-slate-200" />
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
            <Row label="표지 양면 추가" value={`+${fmt(extraCoverPrint)}원`} />
          </div>
        </>
      )}

      {/* 기타 */}
      {(coating > 0 || scoring > 0) && (
        <>
          <div className="border-t border-slate-200" />
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
            {coating > 0 && <Row label="코팅비" value={`${fmt(coating)}원`} />}
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
      <div className="bg-white rounded-2xl shadow-xl w-[calc(100vw-2rem)] max-w-[420px] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-800">{titles[type]}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
        </div>
        <div className="px-5 py-5 text-sm text-slate-700">
          {type === 'saddle' && (
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-slate-400 border-b border-slate-100">
                <th className="text-left pb-2 font-medium">부수 범위</th>
                <th className="text-right pb-2 font-medium">금액</th>
              </tr></thead>
              <tbody>
                <tr className="border-b border-slate-50"><td className="py-2.5">1 ~ 7권</td><td className="py-2.5 text-right">권당 5,000원</td></tr>
                <tr><td className="py-2.5">8 ~ 1,000권</td><td className="py-2.5 text-right">40,000원 (정액)</td></tr>
              </tbody>
            </table>
          )}
          {type === 'perfect' && (
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-slate-400 border-b border-slate-100">
                <th className="text-left pb-2 font-medium">조건</th>
                <th className="text-right pb-2 font-medium">금액</th>
              </tr></thead>
              <tbody>
                <tr className="border-b border-slate-50"><td className="py-2.5">1 ~ 3권</td><td className="py-2.5 text-right">권당 5,000원</td></tr>
                <tr className="border-b border-slate-50"><td className="py-2.5 text-slate-500 text-xs" colSpan={2}>4권 이상 — 내지 클릭 수 4,000구간마다 20,000원씩 증가</td></tr>
                {[['1 ~ 4,000클릭','20,000원'],['4,001 ~ 8,000클릭','40,000원'],['8,001 ~ 12,000클릭','60,000원'],['75,001클릭 이상','380,000원 (상한)']].map(([r,a],i,arr)=>(
                  <tr key={r} className={i<arr.length-1?'border-b border-slate-50':''}><td className="py-2 text-slate-500">{r}</td><td className="py-2 text-right">{a}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          {type === 'ring' && (
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-slate-400 border-b border-slate-100">
                <th className="text-left pb-2 font-medium">조건</th>
                <th className="text-right pb-2 font-medium">금액</th>
              </tr></thead>
              <tbody>
                <tr className="border-b border-slate-50"><td className="py-2.5 text-slate-500 text-xs" colSpan={2}>내지 160p 이하</td></tr>
                <tr className="border-b border-slate-50"><td className="py-2.5 pl-3">1 ~ 100권</td><td className="py-2.5 text-right">45,000원 (기본)</td></tr>
                <tr className="border-b border-slate-100"><td className="py-2.5 pl-3">101권 이상</td><td className="py-2.5 text-right">권수 × 450원</td></tr>
                <tr className="border-b border-slate-50"><td className="py-2.5 text-slate-500 text-xs" colSpan={2}>내지 161p 이상</td></tr>
                <tr className="border-b border-slate-50"><td className="py-2.5 pl-3">1 ~ 100권</td><td className="py-2.5 text-right">50,000원 (기본)</td></tr>
                <tr><td className="py-2.5 pl-3">101권 이상</td><td className="py-2.5 text-right">권수 × 500원</td></tr>
              </tbody>
            </table>
          )}
        </div>
        <div className="flex justify-end px-5 py-3 border-t border-slate-100">
          <button onClick={onClose} className="text-xs px-4 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">확인</button>
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
    if (nullIdx >= 0) { const next = [...rows]; next.splice(nullIdx, 0, newRow); setRows(next); }
    else setRows([...rows, newRow]);
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
      <div className="bg-white rounded-2xl shadow-xl w-[calc(100vw-2rem)] max-w-[420px] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4">
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-slate-400 border-b border-slate-100">
              <th className="text-left pb-2 font-medium">부수 이하</th>
              <th className="text-right pb-2 font-medium">금액 (원)</th>
              <th className="w-8"></th>
            </tr></thead>
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
                      <button onClick={() => removeRow(row.id)} className="text-slate-300 hover:text-red-400 text-sm">✕</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={addRow} className="mt-3 text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-medium">
            + 구간 추가
          </button>
        </div>
        <div className="flex gap-2 justify-end px-5 py-3 border-t border-slate-100">
          <button onClick={onClose} className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-slate-500 hover:text-slate-700">취소</button>
          <button onClick={() => onSave(rows)} className="text-xs px-4 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">저장</button>
        </div>
      </div>
    </div>
  );
}

function ComparisonModal({ data, copies, onExport, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl flex flex-col w-full max-w-5xl max-h-[90vh]"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">타사가격비교 — 더우린 (VAT 별도)</h2>
            <p className="text-xs text-slate-400 mt-0.5">우리 가격 / 더우린 공급가 (무선철+표준용지 포함) · 색상: 초록=저렴, 노랑·주황·빨강=비쌈</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onExport} className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">엑셀로 저장</button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
          </div>
        </div>
        <div className="overflow-auto flex-1 p-4">
          <table className="text-xs border-collapse w-full min-w-max">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-200 px-3 py-2 text-left font-semibold text-slate-600 sticky left-0 bg-slate-100">페이지</th>
                {copies.map(c => (
                  <th key={c} className="border border-slate-200 px-3 py-2 text-center font-semibold text-slate-600 min-w-[100px]">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map(row => (
                <tr key={row.pages}>
                  <td className="border border-slate-200 px-3 py-2 font-semibold text-slate-700 sticky left-0 bg-white">{row.pages}</td>
                  {row.items.map(item => (
                    <td key={item.copies} className={`border border-slate-200 px-2 py-1.5 text-center ${diffColor(item.ourPrice, item.theirPrice)}`}>
                      <div className="font-medium text-slate-800">{item.ourPrice != null ? item.ourPrice.toLocaleString('ko-KR') : '-'}</div>
                      <div className="text-slate-400 text-[10px] mt-0.5">{item.theirPrice.toLocaleString('ko-KR')}</div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-slate-100 flex items-center gap-4 shrink-0 text-xs text-slate-400">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-300 inline-block"></span>−30%↓</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-100 inline-block"></span>−10~−30%</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-50 inline-block"></span>0~−10%</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-50 inline-block"></span>0~+10%</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-100 inline-block"></span>+10~+30%</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-200 inline-block"></span>+30%↑</span>
        </div>
      </div>
    </div>
  );
}
