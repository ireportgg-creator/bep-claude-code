import { useState, useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import InputPanel   from './components/InputPanel.jsx';
import ChartPanel   from './components/ChartPanel.jsx';
import SummaryCards from './components/SummaryCards.jsx';
import SavePanel    from './components/SavePanel.jsx';
import PrintCostSimulator from './pages/PrintCostSimulator.jsx';
import { bepAt }        from './utils/chartUtils.js';
import { loadSavesDB }  from './utils/supabaseUtils.js';

function MainPage() {
  const navigate = useNavigate();
  const [machine,       setMachine]      = useState(6667000);
  const [labor,         setLabor]        = useState(0);
  const [depreciation,  setDepreciation] = useState(0);
  const [electricity,   setElectricity]  = useState(0);
  const [monthlyClicks, setMonthlyClicks]= useState(50000);
  const [clickType,     setClickType]    = useState('color');
  const [savedStates,   setSavedStates]  = useState([]);
  const [dbLoading,     setDbLoading]    = useState(true);
  const [copyDone,      setCopyDone]     = useState(false);

  const F      = machine + labor + depreciation + electricity;
  const C      = clickType === 'color' ? 28 : 12;
  const bepNow = monthlyClicks > 0 ? bepAt(F, C, monthlyClicks) : C;

  useEffect(() => {
    loadSavesDB()
      .then(setSavedStates)
      .catch(err => console.error('저장 목록 로드 실패:', err))
      .finally(() => setDbLoading(false));
  }, []);

  const handleLoad = s => {
    setMachine(s.machine);
    setLabor(s.labor);
    setDepreciation(s.depreciation);
    setElectricity(s.electricity);
    setMonthlyClicks(s.monthlyClicks);
    setClickType(s.clickType);
  };

  return (
    <div className="min-h-screen p-4 pb-12 max-w-3xl mx-auto">
      <header className="mb-5 pt-2 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">손익분기점 그래프</h1>
          <p className="text-xs text-slate-400 mt-0.5">고정비 · 월 클릭 수 → 클릭당 손익분기 단가 산출</p>
        </div>
        <button
          onClick={() => navigate('/print-cost-simulator')}
          className="text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          인쇄비 산출 시뮬레이터
        </button>
      </header>

      <InputPanel
        machine={machine} setMachine={setMachine}
        labor={labor} setLabor={setLabor}
        depreciation={depreciation} setDepreciation={setDepreciation}
        electricity={electricity} setElectricity={setElectricity}
        monthlyClicks={monthlyClicks} setMonthlyClicks={setMonthlyClicks}
        clickType={clickType} setClickType={setClickType}
        F={F} C={C} bepNow={bepNow}
      />

      <ChartPanel F={F} C={C} monthlyClicks={monthlyClicks} />

      <SummaryCards F={F} C={C} bepNow={bepNow} />

      <SavePanel
        machine={machine} labor={labor}
        depreciation={depreciation} electricity={electricity}
        monthlyClicks={monthlyClicks} clickType={clickType}
        F={F} C={C} bepNow={bepNow}
        savedStates={savedStates} setSavedStates={setSavedStates}
        dbLoading={dbLoading}
        copyDone={copyDone} setCopyDone={setCopyDone}
        onLoad={handleLoad}
      />

      <p className="text-center text-xs text-slate-300 mt-6">손익분기점 그래프 · y = F/x + C</p>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<MainPage />} />
      <Route path="/print-cost-simulator" element={<PrintCostSimulator />} />
    </Routes>
  );
}
