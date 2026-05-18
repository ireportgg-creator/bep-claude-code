export const X_MAX = 300000;
export const Y_MAX = 15000;

export const SAMPLE_X = [
  1000, 2000, 3000, 5000, 7000, 10000, 15000, 20000, 30000,
  40000, 50000, 70000, 100000, 130000, 150000, 200000, 250000, 300000,
];

export function fmt(n) {
  return isFinite(n) && n !== null ? Math.round(n).toLocaleString('ko-KR') : '–';
}

export function bepAt(F, C, x) {
  return x > 0 ? F / x + C : Y_MAX;
}

export function buildBlue(F, C) {
  const pts = [];
  const x0 = 300, x1 = X_MAX;
  for (let i = 0; i <= 130; i++) {
    const t = i / 130;
    const x = Math.round(x0 * Math.pow(x1 / x0, t));
    const y = F > 0 ? F / x + C : C;
    pts.push({ x, y: Math.min(y, Y_MAX * 1.5) });
  }
  return pts;
}
