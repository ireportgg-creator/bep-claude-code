import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import { X_MAX, Y_MAX, buildBlue } from '../utils/chartUtils.js';

export default function ChartPanel({ F, C, monthlyClicks }) {
  const canvasRef    = useRef(null);
  const chartRef     = useRef(null);
  const resetZoomRef = useRef(null);

  /* 차트 생성 + 팬/줌 이벤트 (최초 1회) */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const chart = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: '손익분기 원가  y = F/x + C',
            data: buildBlue(6667000, 28),
            showLine: true,
            borderColor: '#3B82F6',
            backgroundColor: 'transparent',
            borderWidth: 2.5,
            borderDash: [7, 4],
            pointRadius: 0, pointHoverRadius: 0, tension: 0, order: 1,
          },
          {
            label: '월 예상 클릭 수',
            data: [{ x: 50000, y: -1e6 }, { x: 50000, y: 1e6 }],
            showLine: true,
            borderColor: '#F97316',
            backgroundColor: 'transparent',
            borderDash: [5, 4],
            borderWidth: 2,
            pointRadius: 0, pointHoverRadius: 0, tension: 0, order: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 0 },
        scales: {
          x: {
            type: 'linear', min: 0, max: X_MAX,
            title: { display: true, text: '월 예상 클릭 수', color: '#64748B', font: { size: 11, weight: '500' } },
            ticks: { callback: v => v >= 1000 ? (v / 1000) + 'k' : v, maxTicksLimit: 11, color: '#94A3B8', font: { size: 10 } },
            grid: { color: '#F1F5F9' }, border: { color: '#E2E8F0' },
          },
          y: {
            type: 'linear', min: 0, max: Y_MAX,
            title: { display: true, text: '클릭당 단가 (원)', color: '#64748B', font: { size: 11, weight: '500' } },
            ticks: { callback: v => v.toLocaleString('ko-KR') + '원', maxTicksLimit: 9, color: '#94A3B8', font: { size: 10 } },
            grid: { color: '#F1F5F9' }, border: { color: '#E2E8F0' },
          },
        },
        plugins: {
          legend: { position: 'top', labels: { usePointStyle: true, padding: 16, font: { size: 11 }, color: '#475569' } },
          tooltip: {
            backgroundColor: 'rgba(255,255,255,0.97)',
            titleColor: '#1E293B', bodyColor: '#475569',
            borderColor: '#E2E8F0', borderWidth: 1, padding: 10,
            callbacks: { label: c => `  ${Math.round(c.parsed.y).toLocaleString('ko-KR')} 원 / ${Math.round(c.parsed.x).toLocaleString('ko-KR')} 클릭` },
          },
        },
      },
    });
    chartRef.current = chart;

    let panState = null, pinchState = null;
    const getR = () => canvas.getBoundingClientRect();
    const cur  = c => { canvas.style.cursor = c; };
    const pxOf = e => {
      const r = getR();
      const s = e.touches ? e.touches[0] : (e.changedTouches ? e.changedTouches[0] : e);
      return { px: s.clientX - r.left, py: s.clientY - r.top };
    };
    const inArea = (px, py) => {
      const a = chartRef.current.chartArea;
      return a && px >= a.left && px <= a.right && py >= a.top && py <= a.bottom;
    };

    const onDown = e => {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      const { px, py } = pxOf(e);
      if (inArea(px, py)) {
        const ch = chartRef.current;
        panState = { px, py, xMin: ch.scales.x.min, xMax: ch.scales.x.max, yMin: ch.scales.y.min, yMax: ch.scales.y.max };
        cur('grabbing');
      }
    };
    const onMove = e => {
      if (!panState) return;
      e.preventDefault();
      const { px, py } = pxOf(e);
      const ch = chartRef.current;
      const area = ch.chartArea;
      if (!area) return;
      const xR = panState.xMax - panState.xMin, yR = panState.yMax - panState.yMin;
      const w = area.right - area.left, h = area.bottom - area.top;
      ch.options.scales.x.min = panState.xMin - (px - panState.px) / w * xR;
      ch.options.scales.x.max = panState.xMax - (px - panState.px) / w * xR;
      ch.options.scales.y.min = panState.yMin + (py - panState.py) / h * yR;
      ch.options.scales.y.max = panState.yMax + (py - panState.py) / h * yR;
      ch.update('none');
    };
    const onUp = () => { panState = null; cur('grab'); };

    const onWheel = e => {
      e.preventDefault();
      const { px, py } = pxOf(e);
      const ch = chartRef.current;
      const area = ch.chartArea;
      if (!area || !inArea(px, py)) return;
      const zoom = e.deltaY > 0 ? 1.2 : 1 / 1.2;
      const xs = ch.scales.x, ys = ch.scales.y;
      const xR = xs.max - xs.min, yR = ys.max - ys.min;
      const w = area.right - area.left, h = area.bottom - area.top;
      const cx = xs.min + (px - area.left) / w * xR;
      const cy = ys.min + (1 - (py - area.top) / h) * yR;
      const nxR = xR * zoom, nyR = yR * zoom;
      ch.options.scales.x.min = cx - (cx - xs.min) / xR * nxR;
      ch.options.scales.x.max = ch.options.scales.x.min + nxR;
      ch.options.scales.y.min = cy - (cy - ys.min) / yR * nyR;
      ch.options.scales.y.max = ch.options.scales.y.min + nyR;
      ch.update('none');
    };

    const onTouchStart = e => {
      e.preventDefault();
      if (e.touches.length === 2) {
        panState = null;
        const t0 = e.touches[0], t1 = e.touches[1], r = getR(), ch = chartRef.current;
        pinchState = {
          dist: Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY),
          midPx: (t0.clientX + t1.clientX) / 2 - r.left,
          midPy: (t0.clientY + t1.clientY) / 2 - r.top,
          xMin: ch.scales.x.min, xMax: ch.scales.x.max,
          yMin: ch.scales.y.min, yMax: ch.scales.y.max,
        };
      } else if (e.touches.length === 1) {
        pinchState = null;
        const r = getR(), px = e.touches[0].clientX - r.left, py = e.touches[0].clientY - r.top;
        if (inArea(px, py)) {
          const ch = chartRef.current;
          panState = { px, py, xMin: ch.scales.x.min, xMax: ch.scales.x.max, yMin: ch.scales.y.min, yMax: ch.scales.y.max };
        }
      }
    };
    const onTouchMove = e => {
      e.preventDefault();
      const ch = chartRef.current;
      if (e.touches.length === 2 && pinchState) {
        const t0 = e.touches[0], t1 = e.touches[1];
        const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
        const zoom = pinchState.dist / dist;
        const xR0 = pinchState.xMax - pinchState.xMin, yR0 = pinchState.yMax - pinchState.yMin;
        const nxR = xR0 * zoom, nyR = yR0 * zoom;
        const area = ch.chartArea;
        const w = area.right - area.left, h = area.bottom - area.top;
        const cx = pinchState.xMin + (pinchState.midPx - area.left) / w * xR0;
        const cy = pinchState.yMin + (1 - (pinchState.midPy - area.top) / h) * yR0;
        ch.options.scales.x.min = cx - (cx - pinchState.xMin) / xR0 * nxR;
        ch.options.scales.x.max = ch.options.scales.x.min + nxR;
        ch.options.scales.y.min = cy - (cy - pinchState.yMin) / yR0 * nyR;
        ch.options.scales.y.max = ch.options.scales.y.min + nyR;
        ch.update('none');
      } else if (e.touches.length === 1 && panState) {
        const r = getR(), px = e.touches[0].clientX - r.left, py = e.touches[0].clientY - r.top;
        const area = ch.chartArea;
        const xR = panState.xMax - panState.xMin, yR = panState.yMax - panState.yMin;
        const w = area.right - area.left, h = area.bottom - area.top;
        ch.options.scales.x.min = panState.xMin - (px - panState.px) / w * xR;
        ch.options.scales.x.max = panState.xMax - (px - panState.px) / w * xR;
        ch.options.scales.y.min = panState.yMin + (py - panState.py) / h * yR;
        ch.options.scales.y.max = panState.yMax + (py - panState.py) / h * yR;
        ch.update('none');
      }
    };
    const onTouchEnd = e => {
      if (e.touches.length === 0) { panState = null; pinchState = null; }
      else if (e.touches.length < 2) { pinchState = null; }
    };

    resetZoomRef.current = () => {
      const ch = chartRef.current;
      if (!ch) return;
      ch.options.scales.x.min = 0; ch.options.scales.x.max = X_MAX;
      ch.options.scales.y.min = 0; ch.options.scales.y.max = Y_MAX;
      ch.update();
    };

    canvas.addEventListener('mousedown',  onDown);
    canvas.addEventListener('mousemove',  onMove);
    canvas.addEventListener('mouseup',    onUp);
    canvas.addEventListener('mouseleave', onUp);
    canvas.addEventListener('wheel',      onWheel,      { passive: false });
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove',  onTouchMove,  { passive: false });
    canvas.addEventListener('touchend',   onTouchEnd);

    return () => {
      chart.destroy();
      canvas.removeEventListener('mousedown',  onDown);
      canvas.removeEventListener('mousemove',  onMove);
      canvas.removeEventListener('mouseup',    onUp);
      canvas.removeEventListener('mouseleave', onUp);
      canvas.removeEventListener('wheel',      onWheel);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove',  onTouchMove);
      canvas.removeEventListener('touchend',   onTouchEnd);
    };
  }, []);

  /* 데이터 갱신 */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.data.datasets[0].data = buildBlue(F, C);
    chart.data.datasets[1].data = [{ x: monthlyClicks, y: -1e6 }, { x: monthlyClicks, y: 1e6 }];
    chart.update('none');
  }, [F, C, monthlyClicks]);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 mb-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">BEP 곡선</p>
        <div className="flex gap-1.5 text-xs text-slate-400">
          <span className="bg-slate-50 rounded-lg px-2 py-0.5">휠 · 핀치 → 줌</span>
          <span className="bg-slate-50 rounded-lg px-2 py-0.5">드래그 → 이동</span>
        </div>
      </div>
      <div className="chart-wrap" style={{ position: 'relative', height: '380px' }}>
        <canvas ref={canvasRef}></canvas>
      </div>
      <div className="mt-2">
        <button onClick={() => resetZoomRef.current?.()}
          className="text-xs text-slate-400 hover:text-blue-500 border border-slate-200
                     hover:border-blue-300 rounded-lg px-3 py-1 transition">
          뷰 초기화
        </button>
      </div>
    </div>
  );
}
