import { supabase } from './supabaseClient.js';
import { bepAt }    from './chartUtils.js';

/* DB row(snake_case) → 컴포넌트용 객체(camelCase) 변환 */
function rowToState(row) {
  const F   = row.machine + row.labor + row.depreciation + row.electricity;
  const C   = row.click_type === 'color' ? 28 : 12;
  return {
    id           : row.id,
    savedAt      : new Date(row.saved_at).toLocaleString('ko-KR'),
    machine      : row.machine,
    labor        : row.labor,
    depreciation : row.depreciation,
    electricity  : row.electricity,
    monthlyClicks: row.monthly_clicks,
    clickType    : row.click_type,
    F,
    C,
    bepNow: Math.round(bepAt(F, C, row.monthly_clicks) * 10) / 10,
  };
}

/** 저장된 상태 목록 불러오기 (최신순) */
export async function loadSavesDB() {
  const { data, error } = await supabase
    .from('bep_states')
    .select('*')
    .order('saved_at', { ascending: false });
  if (error) throw error;
  return data.map(rowToState);
}

/** 현재 상태 저장 */
export async function saveStateDB({ machine, labor, depreciation, electricity, monthlyClicks, clickType }) {
  const { data, error } = await supabase
    .from('bep_states')
    .insert([{
      label        : new Date().toLocaleString('ko-KR'),
      machine,
      labor,
      depreciation,
      electricity,
      monthly_clicks: monthlyClicks,
      click_type    : clickType,
    }])
    .select()
    .single();
  if (error) throw error;
  return rowToState(data);
}

/** 상태 삭제 */
export async function deleteStateDB(id) {
  const { error } = await supabase
    .from('bep_states')
    .delete()
    .eq('id', id);
  if (error) throw error;
}
