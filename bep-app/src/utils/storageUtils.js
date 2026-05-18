const KEY = 'bepSaves';
export const loadSaves   = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
export const persistSaves = (arr) => localStorage.setItem(KEY, JSON.stringify(arr));
