// ============================================================
// 考研健身记录系统 - 完整前端逻辑（含Supabase数据层 + 本地模式 + 全事务统计）
// ============================================================

// ==================== Supabase 配置 ====================
const DEFAULT_SB_URL = 'https://uvftmuantisfkjtbyldo.supabase.co';
const DEFAULT_SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2ZnRtdWFudGlzZmtqdGJ5bGRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1OTA4MDQsImV4cCI6MjA5NDE2NjgwNH0.b_Nmmpn37cCcZyYUvTuBPTnZ-uAfIcVQU0lEl6Eusdk';
const _storedUrl = localStorage.getItem('sb_url');
const _storedKey = localStorage.getItem('sb_key');
const SB_URL = (_storedUrl && _storedUrl !== 'null' && _storedUrl.trim()) ? _storedUrl : DEFAULT_SB_URL;
const SB_KEY = (_storedKey && _storedKey !== 'null' && _storedKey.trim()) ? _storedKey : DEFAULT_SB_KEY;
let sbClient = null;
let sbUser = null;
let localMode = false;

function initSB() {
  if (!SB_URL || !SB_KEY) return null;
  try { sbClient = supabase.createClient(SB_URL, SB_KEY); return sbClient; }
  catch(e) { console.error('SB init failed', e); return null; }
}
function setSBConfig(url, key) { localStorage.setItem('sb_url', url); localStorage.setItem('sb_key', key); location.reload(); }

// ==================== Auth ====================
async function sbSignUp(email, password) {
  if (!sbClient) return { error: { message: 'Supabase未配置' } };
  const { data, error } = await sbClient.auth.signUp({ email, password });
  if (!error && data.user) { sbUser = data.user; await initProfile(data.user.id); }
  return { data, error };
}
async function sbSignIn(email, password) {
  if (!sbClient) return { error: { message: 'Supabase未配置' } };
  const { data, error } = await sbClient.auth.signInWithPassword({ email, password });
  if (!error && data.user) sbUser = data.user;
  return { data, error };
}
async function sbSignInAnon() {
  if (!sbClient) return { error: { message: 'Supabase未配置' } };
  const { data, error } = await sbClient.auth.signInAnonymously();
  if (!error && data.user) { sbUser = data.user; await initProfile(data.user.id); }
  return { data, error };
}
async function sbSignOut() { if (sbClient) { await sbClient.auth.signOut(); sbUser = null; } }
async function sbGetUser() { if (!sbClient) return null; const { data } = await sbClient.auth.getUser(); sbUser = data.user; return data.user; }

// ==================== Profiles ====================
async function initProfile(uid) {
  if (!sbClient) return;
  const { data } = await sbClient.from('profiles').select('*').eq('id', uid).limit(1);
  if (!data || !data.length) {
    await sbClient.from('profiles').insert({
      id: uid, cycle_day: 1, last_completed_date: null, created_at: new Date().toISOString()
    });
  }
}
async function getProfile(retry = 0) {
  if (!sbClient || !sbUser) return null;
  const { data } = await sbClient.from('profiles').select('*').eq('id', sbUser.id).limit(1);
  if (!data || !data.length) {
    if (retry < 2) {
      await initProfile(sbUser.id);
      return getProfile(retry + 1);
    }
    return null;
  }
  return data[0];
}
async function updateProfile(updates) {
  if (!sbClient || !sbUser) return null;
  const { data } = await sbClient.from('profiles').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', sbUser.id).select().single();
  return data;
}

// ==================== Checkins ====================
async function getCheckin(dateStr) {
  if (!sbClient || !sbUser) return null;
  if (!dateStr || typeof dateStr !== 'string' || dateStr.length < 8) { console.warn('[getCheckin] invalid dateStr:', dateStr); return null; }
  const { data } = await sbClient.from('daily_checkins').select('*').eq('user_id', sbUser.id).eq('date', dateStr).limit(1);
  return data?.[0] || null;
}
async function upsertCheckin(dateStr, scheduleData) {
  if (!sbClient || !sbUser) return null;
  if (!dateStr || typeof dateStr !== 'string' || dateStr.length < 8) { console.warn('[upsertCheckin] invalid dateStr:', dateStr); return null; }
  const { data: exArr } = await sbClient.from('daily_checkins').select('id').eq('user_id', sbUser.id).eq('date', dateStr).limit(1);
  const ex = exArr?.[0] || null;
  const payload = { user_id: sbUser.id, date: dateStr, schedule_data: scheduleData || {}, is_completed: false, updated_at: new Date().toISOString() };
  if (ex) { const { data } = await sbClient.from('daily_checkins').update(payload).eq('id', ex.id).select().single(); return data; }
  else { const { data } = await sbClient.from('daily_checkins').insert({ ...payload, created_at: new Date().toISOString() }).select().single(); return data; }
}
async function getCheckinsBetween(start, end) {
  if (!sbClient || !sbUser) return [];
  if (!start || !end || typeof start !== 'string' || typeof end !== 'string') { console.warn('[getCheckinsBetween] invalid range:', start, end); return []; }
  const { data } = await sbClient.from('daily_checkins').select('*').eq('user_id', sbUser.id).gte('date', start).lte('date', end).order('date', { ascending: true });
  return data || [];
}
async function getAllCheckins() {
  if (!sbClient || !sbUser) return [];
  const start = fmtDate(new Date(Date.now() - 365 * 86400000));
  const { data } = await sbClient.from('daily_checkins').select('*').eq('user_id', sbUser.id).gte('date', start).lte('date', S.today || todayStr()).order('date', { ascending: true });
  return data || [];
}

// ==================== Water ====================
async function getWaterLogs(dateStr) {
  if (!sbClient || !sbUser) return [];
  if (!dateStr || typeof dateStr !== 'string' || dateStr.length < 8) { console.warn('[getWaterLogs] invalid dateStr:', dateStr); return []; }
  const { data } = await sbClient.from('water_logs').select('*').eq('user_id', sbUser.id).eq('date', dateStr).order('created_at', { ascending: true });
  return data || [];
}
async function addWaterLog(dateStr, amount) {
  if (!sbClient || !sbUser) return null;
  if (!dateStr || typeof dateStr !== 'string' || dateStr.length < 8) { console.warn('[addWaterLog] invalid dateStr:', dateStr); return null; }
  const { data } = await sbClient.from('water_logs').insert({ user_id: sbUser.id, date: dateStr, amount, created_at: new Date().toISOString() }).select().single();
  return data;
}
async function deleteWaterLogs(dateStr) {
  if (!sbClient || !sbUser) return;
  if (!dateStr || typeof dateStr !== 'string' || dateStr.length < 8) { console.warn('[deleteWaterLogs] invalid dateStr:', dateStr); return; }
  await sbClient.from('water_logs').delete().eq('user_id', sbUser.id).eq('date', dateStr);
}

// ==================== Diet ====================
async function getDiet(dateStr) {
  if (!sbClient || !sbUser) return null;
  if (!dateStr || typeof dateStr !== 'string' || dateStr.length < 8) { console.warn('[getDiet] invalid dateStr:', dateStr); return null; }
  const { data } = await sbClient.from('diet_logs').select('*').eq('user_id', sbUser.id).eq('date', dateStr).limit(1);
  return data?.[0] || null;
}
async function upsertDiet(dateStr, lunch, dinner) {
  if (!sbClient || !sbUser) return null;
  if (!dateStr || typeof dateStr !== 'string' || dateStr.length < 8) { console.warn('[upsertDiet] invalid dateStr:', dateStr); return null; }
  const { data: exArr } = await sbClient.from('diet_logs').select('id').eq('user_id', sbUser.id).eq('date', dateStr).limit(1);
  const ex = exArr?.[0] || null;
  const payload = { user_id: sbUser.id, date: dateStr, lunch_choice: lunch, dinner_choice: dinner, updated_at: new Date().toISOString() };
  if (ex) { const { data } = await sbClient.from('diet_logs').update(payload).eq('id', ex.id).select().single(); return data; }
  else { const { data } = await sbClient.from('diet_logs').insert({ ...payload, created_at: new Date().toISOString() }).select().single(); return data; }
}

// ==================== Workout ====================
async function getWorkout(dateStr, cycleDay) {
  if (!sbClient || !sbUser) return null;
  if (!dateStr || typeof dateStr !== 'string' || dateStr.length < 8) { console.warn('[getWorkout] invalid dateStr:', dateStr); return null; }
  const { data } = await sbClient.from('workout_logs').select('*').eq('user_id', sbUser.id).eq('date', dateStr).eq('cycle_day', cycleDay).limit(1);
  return data?.[0] || null;
}
async function upsertWorkout(dateStr, cycleDay, type, exercises) {
  if (!sbClient || !sbUser) return null;
  if (!dateStr || typeof dateStr !== 'string' || dateStr.length < 8) { console.warn('[upsertWorkout] invalid dateStr:', dateStr); return null; }
  const { data: exArr } = await sbClient.from('workout_logs').select('id').eq('user_id', sbUser.id).eq('date', dateStr).eq('cycle_day', cycleDay).limit(1);
  const ex = exArr?.[0] || null;
  const payload = { user_id: sbUser.id, date: dateStr, cycle_day: cycleDay, workout_type: type, exercises: exercises || {}, updated_at: new Date().toISOString() };
  if (ex) { const { data } = await sbClient.from('workout_logs').update(payload).eq('id', ex.id).select().single(); return data; }
  else { const { data } = await sbClient.from('workout_logs').insert({ ...payload, created_at: new Date().toISOString() }).select().single(); return data; }
}
async function getWorkoutsBetween(start, end) {
  if (!sbClient || !sbUser) return [];
  if (!start || !end || typeof start !== 'string' || typeof end !== 'string') { console.warn('[getWorkoutsBetween] invalid range:', start, end); return []; }
  const { data } = await sbClient.from('workout_logs').select('*').eq('user_id', sbUser.id).gte('date', start).lte('date', end).order('date', { ascending: true });
  return data || [];
}
async function getAllWorkouts() {
  if (!sbClient || !sbUser) return [];
  const start = fmtDate(new Date(Date.now() - 365 * 86400000));
  const { data } = await sbClient.from('workout_logs').select('*').eq('user_id', sbUser.id).gte('date', start).lte('date', S.today || todayStr()).order('date', { ascending: true });
  return data || [];
}

// ==================== Weight ====================
async function getWeightLogs(limit = 56) {
  if (!sbClient || !sbUser) return [];
  const { data } = await sbClient.from('weight_logs').select('*').eq('user_id', sbUser.id).order('date', { ascending: true }).limit(limit);
  return data || [];
}
async function addWeightLog(dateStr, weight) {
  if (!sbClient || !sbUser) return null;
  if (!dateStr || typeof dateStr !== 'string' || dateStr.length < 8) { console.warn('[addWeightLog] invalid dateStr:', dateStr); return null; }
  const { data: exArr } = await sbClient.from('weight_logs').select('id').eq('user_id', sbUser.id).eq('date', dateStr).limit(1);
  const ex = exArr?.[0] || null;
  const payload = { user_id: sbUser.id, date: dateStr, weight, updated_at: new Date().toISOString() };
  if (ex) { const { data } = await sbClient.from('weight_logs').update(payload).eq('id', ex.id).select().single(); return data; }
  else { const { data } = await sbClient.from('weight_logs').insert({ ...payload, created_at: new Date().toISOString() }).select().single(); return data; }
}

// ==================== Waist ====================
async function getWaistLogs(limit = 56) {
  if (!sbClient || !sbUser) return [];
  const { data } = await sbClient.from('waist_logs').select('*').eq('user_id', sbUser.id).order('date', { ascending: true }).limit(limit);
  return data || [];
}
async function addWaistLog(dateStr, waist) {
  if (!sbClient || !sbUser) return null;
  if (!dateStr || typeof dateStr !== 'string' || dateStr.length < 8) { console.warn('[addWaistLog] invalid dateStr:', dateStr); return null; }
  const { data: exArr } = await sbClient.from('waist_logs').select('id').eq('user_id', sbUser.id).eq('date', dateStr).limit(1);
  const ex = exArr?.[0] || null;
  const payload = { user_id: sbUser.id, date: dateStr, waist, updated_at: new Date().toISOString() };
  if (ex) { const { data } = await sbClient.from('waist_logs').update(payload).eq('id', ex.id).select().single(); return data; }
  else { const { data } = await sbClient.from('waist_logs').insert({ ...payload, created_at: new Date().toISOString() }).select().single(); return data; }
}

// ==================== 统一本地数据层 ====================
async function dbGetProfile() {
  if (!localMode) return getProfile();
  let p = localStorage.getItem('ft_local_profile');
  if (!p) return { cycle_day: 1, last_completed_date: null };
  return JSON.parse(p);
}
async function dbUpdateProfile(updates) {
  if (!localMode) return updateProfile(updates);
  let p = await dbGetProfile();
  p = { ...p, ...updates, updated_at: new Date().toISOString() };
  localStorage.setItem('ft_local_profile', JSON.stringify(p));
  return p;
}
async function dbGetCheckin(dateStr) {
  if (!localMode) return getCheckin(dateStr);
  const raw = localStorage.getItem(`ft_local_checkin_${dateStr}`);
  if (!raw) return null;
  return JSON.parse(raw);
}
async function dbUpsertCheckin(dateStr, scheduleData) {
  if (!localMode) return upsertCheckin(dateStr, scheduleData);
  const key = `ft_local_checkin_${dateStr}`;
  const payload = { user_id: 'local', date: dateStr, schedule_data: scheduleData || {}, is_completed: false, updated_at: new Date().toISOString() };
  localStorage.setItem(key, JSON.stringify(payload));
  return payload;
}
async function dbGetCheckinsBetween(start, end) {
  if (!localMode) return getCheckinsBetween(start, end);
  const results = [];
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    const ds = fmtDate(d);
    const c = await dbGetCheckin(ds);
    if (c) results.push(c);
  }
  return results;
}
async function dbGetAllCheckins() {
  if (!localMode) return getAllCheckins();
  const results = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('ft_local_checkin_')) results.push(JSON.parse(localStorage.getItem(key)));
  }
  results.sort((a, b) => a.date.localeCompare(b.date));
  return results;
}
async function dbGetWaterLogs(dateStr) {
  if (!localMode) return getWaterLogs(dateStr);
  const raw = localStorage.getItem(`ft_local_water_${dateStr}`);
  return raw ? JSON.parse(raw) : [];
}
async function dbAddWaterLog(dateStr, amount) {
  if (!localMode) return addWaterLog(dateStr, amount);
  const key = `ft_local_water_${dateStr}`;
  const arr = await dbGetWaterLogs(dateStr);
  const entry = { user_id: 'local', date: dateStr, amount, created_at: new Date().toISOString() };
  arr.push(entry);
  localStorage.setItem(key, JSON.stringify(arr));
  return entry;
}
async function dbDeleteWaterLogs(dateStr) {
  if (!localMode) return deleteWaterLogs(dateStr);
  localStorage.removeItem(`ft_local_water_${dateStr}`);
}
async function dbGetDiet(dateStr) {
  if (!localMode) return getDiet(dateStr);
  const raw = localStorage.getItem(`ft_local_diet_${dateStr}`);
  return raw ? JSON.parse(raw) : null;
}
async function dbUpsertDiet(dateStr, lunch, dinner) {
  if (!localMode) return upsertDiet(dateStr, lunch, dinner);
  const key = `ft_local_diet_${dateStr}`;
  const payload = { user_id: 'local', date: dateStr, lunch_choice: lunch, dinner_choice: dinner, updated_at: new Date().toISOString() };
  localStorage.setItem(key, JSON.stringify(payload));
  return payload;
}
async function dbGetWorkout(dateStr, cycleDay) {
  if (!localMode) return getWorkout(dateStr, cycleDay);
  const raw = localStorage.getItem(`ft_local_workout_${dateStr}_${cycleDay}`);
  return raw ? JSON.parse(raw) : null;
}
async function dbUpsertWorkout(dateStr, cycleDay, type, exercises) {
  if (!localMode) return upsertWorkout(dateStr, cycleDay, type, exercises);
  const key = `ft_local_workout_${dateStr}_${cycleDay}`;
  const payload = { user_id: 'local', date: dateStr, cycle_day: cycleDay, workout_type: type, exercises: exercises || {}, updated_at: new Date().toISOString() };
  localStorage.setItem(key, JSON.stringify(payload));
  return payload;
}
async function dbGetWorkoutsBetween(start, end) {
  if (!localMode) return getWorkoutsBetween(start, end);
  const results = [];
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    const ds = fmtDate(d);
    for (let day = 1; day <= 7; day++) {
      const raw = localStorage.getItem(`ft_local_workout_${ds}_${day}`);
      if (raw) results.push(JSON.parse(raw));
    }
  }
  return results;
}
async function dbGetAllWorkouts() {
  if (!localMode) return getAllWorkouts();
  const results = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('ft_local_workout_')) results.push(JSON.parse(localStorage.getItem(key)));
  }
  results.sort((a, b) => a.date.localeCompare(b.date));
  return results;
}
async function dbGetWeightLogs(limit = 56) {
  if (!localMode) return getWeightLogs(limit);
  const raw = localStorage.getItem('ft_local_weights');
  const arr = raw ? JSON.parse(raw) : [];
  return arr.slice(-limit);
}
async function dbAddWeightLog(dateStr, weight) {
  if (!localMode) return addWeightLog(dateStr, weight);
  const arr = await dbGetWeightLogs(999);
  const idx = arr.findIndex(x => x.date === dateStr);
  const entry = { user_id: 'local', date: dateStr, weight, updated_at: new Date().toISOString() };
  if (idx >= 0) arr[idx] = entry; else arr.push(entry);
  arr.sort((a, b) => new Date(a.date) - new Date(b.date));
  localStorage.setItem('ft_local_weights', JSON.stringify(arr));
  return entry;
}

// ============================================================
// 应用逻辑
// ============================================================

const CYCLE = [
  { day: 1, type: 'workout', name: '上肢A', label: '锻炼日' },
  { day: 2, type: 'workout', name: '下肢B', label: '锻炼日' },
  { day: 3, type: 'rest',    name: '休息日', label: '完全休息' },
  { day: 4, type: 'workout', name: '上肢B', label: '锻炼日' },
  { day: 5, type: 'workout', name: '下肢A', label: '锻炼日' },
  { day: 6, type: 'rest',    name: '休息日', label: '备考冲刺/生活' },
  { day: 7, type: 'rest',    name: '休息日', label: '备考冲刺/生活' },
];

const SCHEDULE_WORKOUT = [
  { time: '07:30', name: '起床' },
  { time: '07:30-08:00', name: '洗漱早饭' },
  { time: '08:00-09:30', name: '学习' },
  { time: '09:30-09:45', name: '休息' },
  { time: '09:45-11:15', name: '学习' },
  { time: '11:15-11:45', name: '补充能量+通勤' },
  { time: '11:45-13:00', name: '健身' },
  { time: '13:00-13:30', name: '午饭+肌酸' },
  { time: '13:30-14:00', name: '休息' },
  { time: '14:00-14:30', name: '午休' },
  { time: '14:30-16:00', name: '学习' },
  { time: '16:00-16:15', name: '休息/加餐' },
  { time: '16:15-17:45', name: '学习' },
  { time: '17:45-18:40', name: '晚饭' },
  { time: '18:40-19:00', name: '冥想' },
  { time: '19:00-20:50', name: '学习' },
  { time: '20:50-23:00', name: '自由时间' },
  { time: '23:00-23:30', name: '整理/修复' },
  { time: '23:30', name: '上床看纸质书' }
];

const SCHEDULE_REST = [
  { time: '07:30', name: '起床' },
  { time: '07:30-08:00', name: '洗漱早饭' },
  { time: '08:00-09:30', name: '学习' },
  { time: '09:30-09:45', name: '休息' },
  { time: '09:45-11:15', name: '学习' },
  { time: '11:15-11:30', name: '休息' },
  { time: '11:30-13:00', name: '学习' },
  { time: '13:00-14:00', name: '午饭+肌酸' },
  { time: '14:00-14:30', name: '午休' },
  { time: '14:30-16:00', name: '学习' },
  { time: '16:00-16:15', name: '休息/加餐' },
  { time: '16:15-17:45', name: '学习' },
  { time: '17:45-18:40', name: '晚饭' },
  { time: '18:40-19:00', name: '冥想' },
  { time: '19:00-19:50', name: '学习' },
  { time: '19:50-23:00', name: '自由时间' },
  { time: '23:00-23:30', name: '整理/修复' },
  { time: '23:30', name: '上床看纸质书' }
];

const PLANS = {
  '上肢A': [
    { n: '杠铃平板卧推', s: '5x5', sets: 5, rest: 180, cat: 'main', tip: '起桥夹背，杠铃触胸即起，大臂与躯干夹角约45°，脚蹬地发力' },
    { n: '上斜哑铃卧推', s: '3x8-12', sets: 3, rest: 120, cat: 'accessory', tip: '哑铃下落至胸线两侧，推起时向中间靠拢挤压上胸' },
    { n: '大剪刀下拉', s: '3x8-12', sets: 3, rest: 120, cat: 'accessory', tip: '单侧发力时躯干微后仰，拉至下巴高度停顿1秒，肩胛骨下沉后缩' },
    { n: '侧平举', s: '3x12-15', sets: 3, rest: 0, cat: 'small', tip: '肘微屈，控制离心，预防圆肩', superset: 'next' },
    { n: '后束飞鸟', s: '3x12-15', sets: 3, rest: 60, cat: 'small', tip: '俯身约45°，肩胛骨下沉后缩，强化后束', superset: 'rest' },
    { n: '器械卷腹', s: '3x15-20', sets: 3, rest: 60, cat: 'small', tip: '下巴微收，腹直肌发力卷起，肩胛骨刚离垫即可，勿用脖子拉' },
    { n: 'RKC 平板支撑', s: '1组极限', sets: 1, rest: 60, cat: 'small', tip: '骨盆后倾收腹，全身绷紧至力竭发抖，呼吸保持自然' },
  ],
  '下肢B': [
    { n: '斜上腿举(倒蹬)', s: '4x8-12', sets: 4, rest: 120, cat: 'accessory', tip: '腰背贴紧靠垫，膝关节保持微屈不锁死，发力点在全脚掌' },
    { n: '哑铃罗马尼亚硬拉', s: '3x8-12', sets: 3, rest: 120, cat: 'accessory', tip: '哑铃贴腿下滑，膝盖微屈固定，臀部向后推感受腘绳肌拉伸' },
    { n: '山羊挺身(背伸展)', s: '3x12-15', sets: 3, rest: 60, cat: 'small', tip: '脊柱中立，上至身体平直即可，勿过度反弓腰椎，慢速控制' },
    { n: '器械夹腿(内收肌)', s: '3x12-15', sets: 3, rest: 60, cat: 'small', tip: '大腿内侧发力夹紧停顿1秒，回放时控制速度，保持骨盆稳定' },
    { n: '死虫式', s: '3x15/侧', sets: 3, rest: 60, cat: 'small', tip: '腰部始终贴地，对侧手脚同步伸展，动作极慢，腹横肌持续收紧' },
  ],
  '上肢B': [
    { n: '器械低位划船', s: '4x8-10', sets: 4, rest: 120, cat: 'accessory', tip: '躯干固定不后仰，拉至下腹高度停顿，肩胛骨后缩挤压背阔肌' },
    { n: '坐姿器械推胸', s: '3x8-12', sets: 3, rest: 120, cat: 'accessory', tip: '肩胛骨下沉后靠，推至肘关节微屈，顶峰挤压胸大肌1秒' },
    { n: '鹦鹉螺', s: '3x12-15', sets: 3, rest: 60, cat: 'small', tip: '胸贴紧靠垫，双臂同步后拉，肘部内收，顶峰挤压背阔肌1秒不甩身' },
    { n: '坐姿肩推机', s: '3x8-10', sets: 3, rest: 120, cat: 'accessory', tip: '靠背贴紧，推至肘关节微屈，顶峰肩前中束收缩停顿' },
    { n: '绳索面拉(Face Pull)', s: '3x12-15', sets: 3, rest: 60, cat: 'small', tip: '拉至脸部两侧，肘部高于肩部，顶峰后束与上背挤压1秒' },
    { n: '支撑缩膝举腿', s: '3x15-20', sets: 3, rest: 60, cat: 'small', tip: '骨盆后卷用下腹发力，膝盖向胸口收，禁止惯性甩腿' },
    { n: '农夫行走', s: '2x30-40秒', sets: 2, rest: 60, cat: 'small', tip: '双手各提一个哑铃（单手16-20kg），挺胸沉肩，小步快走，握不住为止。核心收紧防止身体侧倾，不要耸肩', type: 'carry' },
  ],
  '下肢A': [
    { n: '杠铃深蹲', s: '5x5', sets: 5, rest: 180, cat: 'main', tip: '双脚略宽于肩，膝朝脚尖方向打开，蹲至大腿低于水平线，瓦式呼吸' },
    { n: '器械臀推', s: '4x8-12', sets: 4, rest: 120, cat: 'accessory', tip: '肩胛骨靠紧凳缘，顶峰骨盆后倾臀肌挤压停顿1秒，下巴微收' },
    { n: '器械腿屈伸', s: '3x12-15', sets: 3, rest: 60, cat: 'small', tip: '臀部靠紧椅背，孤立股四头肌伸膝，顶峰停顿1秒，控制下落' },
    { n: '器械腿弯举', s: '3x12-15', sets: 3, rest: 60, cat: 'small', tip: '身体趴平或坐直，腘绳肌发力弯举，顶峰小腿与大腿夹紧停顿' },
    { n: '俄罗斯转体', s: '3x15/侧', sets: 3, rest: 60, cat: 'small', tip: '手持轻物或空手，双脚离地，控制躯干旋转，腹斜肌发力' },
    { n: 'RKC 平板支撑', s: '1组x60秒', sets: 1, rest: 60, cat: 'small', tip: '同Day1，但留2成余力，维持腹内压稳定不抖' },
  ],
};

const WS = [
  { time: '07:30', name: '起床' },
  { time: '07:30-08:00', name: '洗漱早饭' },
  { time: '08:00-09:30', name: '学习' },
  { time: '09:30-09:45', name: '休息' },
  { time: '09:45-11:15', name: '学习' },
  { time: '11:15-11:45', name: '补充能量+通勤' },
  { time: '11:45-13:00', name: '健身' },
  { time: '13:00-13:30', name: '午饭+肌酸' },
  { time: '13:30-14:00', name: '休息' },
  { time: '14:00-14:30', name: '午休' },
  { time: '14:30-16:00', name: '学习' },
  { time: '16:00-16:15', name: '休息/加餐' },
  { time: '16:15-17:45', name: '学习' },
  { time: '17:45-18:40', name: '晚饭' },
  { time: '18:40-19:00', name: '冥想' },
  { time: '19:00-20:50', name: '学习' },
  { time: '20:50-23:00', name: '自由时间' },
  { time: '23:00-23:30', name: '整理/修复' },
  { time: '23:30', name: '上床看纸质书' }
];

const RS = [
  { time: '07:30', name: '起床' },
  { time: '07:30-08:00', name: '洗漱早饭' },
  { time: '08:00-09:30', name: '学习' },
  { time: '09:30-09:45', name: '休息' },
  { time: '09:45-11:15', name: '学习' },
  { time: '11:15-11:30', name: '休息' },
  { time: '11:30-13:00', name: '学习' },
  { time: '13:00-14:00', name: '午饭+肌酸' },
  { time: '14:00-14:30', name: '午休' },
  { time: '14:30-16:00', name: '学习' },
  { time: '16:00-16:15', name: '休息/加餐' },
  { time: '16:15-17:45', name: '学习' },
  { time: '17:45-18:40', name: '晚饭' },
  { time: '18:40-19:00', name: '冥想' },
  { time: '19:00-19:50', name: '学习' },
  { time: '19:50-23:00', name: '自由时间' },
  { time: '23:00-23:30', name: '整理/修复' },
  { time: '23:30', name: '上床看纸质书' }
];

const CAT_COLORS = {
  study: '#10b981',
  workout: '#ef4444',
  diet: '#f59e0b',
  rest: '#3b82f6',
  commute: '#8b5cf6',
  entertainment: '#ec4899',
  sleep: '#6366f1',
  other: '#94a3b8'
};
const CAT_NAMES = {
  study: '学习',
  workout: '健身',
  diet: '饮食',
  rest: '休息/冥想',
  commute: '通勤/能量',
  entertainment: '娱乐',
  sleep: '睡眠',
  other: '其他'
};

const SUBJECT_NAMES = { math: '数学', '408': '408', politics: '政治', english: '英语' };
const SUBJECT_COLORS = { math: '#059669', '408': '#34d399', politics: '#f59e0b', english: '#3b82f6' };

let S = { user: null, profile: null, today: '', day: 1, week: 1, rest: false, checkin: null, water: [], diet: null, workout: null, weights: [], weekData: [], tab: 'schedule' };
let viewDate = '';
let viewDay = 1;
let viewWeek = 1;
let activeTimers = {};
let timerSessions = [];
let restState = { running: false, end: 0, total: 0, exercise: '', paused: false, remaining: 0 };
let restInterval = null;
let _statsTimeRange = 'today';
let _statsTimeRangeBound = false;

// ==================== 工具函数 ====================
const fmtDate = d => { const x = new Date(d); const o = x.getTimezoneOffset(); return new Date(x.getTime() - o * 60000).toISOString().split('T')[0]; };
const todayStr = () => fmtDate(new Date());
const dayDiff = (a, b) => { const d1 = new Date(a + 'T00:00:00'), d2 = new Date(b + 'T00:00:00'); return Math.floor((d2 - d1) / 86400000); };
const weekStart = ds => { const d = new Date(ds + 'T00:00:00'); const day = d.getDay(); const diff = d.getDate() - day + (day === 0 ? -6 : 1); return fmtDate(new Date(d.setDate(diff))); };
const weekDays = ds => { const s = new Date(ds + 'T00:00:00'); return Array.from({ length: 7 }, (_, i) => { const d = new Date(s); d.setDate(s.getDate() + i); return fmtDate(d); }); };
const fmtCN = ds => { const d = new Date(ds + 'T00:00:00'); const w = ['日','一','二','三','四','五','六']; return `${d.getMonth() + 1}月${d.getDate()}日 周${w[d.getDay()]}`; };
const schedForDay = day => CYCLE[(day - 1) % 7]?.type === 'rest' ? RS : WS;

function getCategory(label) {
  if (label.includes('学习')) return 'study';
  if (label.includes('健身')) return 'workout';
  if (label.includes('洗漱') || label.includes('早饭') || label.includes('午饭') || label.includes('晚饭') || label.includes('整理') || label.includes('修复') || label.includes('上床') || label.includes('睡眠') || label.includes('看纸质书') || label.includes('加餐') || label.includes('补充能量')) return 'diet';
  if (label.includes('休息') || label.includes('冥想') || label.includes('午休')) return 'rest';
  if (label.includes('通勤')) return 'commute';
  if (label.includes('游戏') || label.includes('娱乐')) return 'entertainment';
  return 'other';
}

const CATEGORIES = {
  study: { name: '学习', icon: '📚', color: '#3b82f6', subs: { math: { name: '数学', icon: '📘' }, '408': { name: '408', icon: '📗' }, politics: { name: '政治', icon: '📕' }, english: { name: '英语', icon: '📙' } } },
  workout: { name: '健身', icon: '🏋️', color: '#ef4444' },
  rest: { name: '休息', icon: '😴', color: '#9ca3af', subs: { nap: { name: '午休', icon: '💤' }, meditation: { name: '冥想', icon: '🧘' }, pomodoro: { name: '番茄钟间歇', icon: '⏸️' }, sleep: { name: '睡眠', icon: '🛏️' } } },
  diet: { name: '饮食', icon: '🍽️', color: '#f59e0b', subs: { breakfast: { name: '早餐', icon: '🌅' }, preworkout: { name: '练前加餐', icon: '☕' }, lunch: { name: '午餐', icon: '🌞' }, snack: { name: '加餐', icon: '🥤' }, dinner: { name: '晚餐', icon: '🌆' }, bedtime: { name: '睡前', icon: '🌙' } } },
  entertainment: { name: '娱乐', icon: '🎮', color: '#a855f7' },
  commute: { name: '通勤', icon: '🚇', color: '#06b6d4', subs: { walk: { name: '步行', icon: '🚶' }, subway: { name: '地铁', icon: '🚇' }, bike: { name: '骑车', icon: '🚴' }, bus: { name: '公交', icon: '🚌' } } },
  money: { name: '赚钱', icon: '💰', color: '#eab308', subs: { tutor: { name: '家教', icon: '👨‍🏫' }, parttime: { name: '兼职', icon: '💼' }, other: { name: '其他', icon: '📋' } } },
};


const PIE_COLORS = {
  study: '#3b82f6', workout: '#ef4444', diet: '#f59e0b', rest: '#6b7280',
  entertainment: '#8b5cf6', commute: '#06b6d4', money: '#10b981'
};

const PIE_SUB_COLORS = {
  study: { math: '#60a5fa', '408': '#93c5fd', politics: '#3b82f6', english: '#1d4ed8' },
  diet: { breakfast: '#c2410c', preworkout: '#ea580c', lunch: '#fb923c', snack: '#fdba74', dinner: '#fed7aa', bedtime: '#ffedd5' },
  rest: { nap: '#374151', meditation: '#4b5563', pomodoro: '#9ca3af', sleep: '#d1d5db' },
  commute: { walk: '#164e63', subway: '#0891b2', bike: '#22d3ee', bus: '#a5f3fc' },
  money: { tutor: '#a16207', parttime: '#ca8a04', other: '#fde047' }
};
const CATEGORY_DESCRIPTIONS = {
  study: '考研科目复习与知识积累',
  workout: '健身房力量训练与体能提升',
  diet: '每日营养摄入与饮食记录',
  rest: '睡眠、午休与主动恢复',
  entertainment: '电影、游戏等放松活动',
  commute: '往返图书馆或健身房的路上时间',
  money: '兼职、理财或其他收入活动'
};
function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function timeToMin(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function parseScheduleTime(t) {
  if (t.includes('-')) {
    const [s, e] = t.split('-');
    return { start: s, end: e };
  }
  return { start: t, end: null };
}

function getCycleStart() {
  const raw = localStorage.getItem('ft_cycle_start');
  if (raw) return raw;
  const start = S.today;
  localStorage.setItem('ft_cycle_start', start);
  return start;
}

function calculateWeekDay(dateStr) {
  const manual = localStorage.getItem('ft_manual_day');
  if (manual) {
    const data = JSON.parse(manual);
    if (data.date === dateStr) return { week: data.week || 1, day: data.day || 1 };
  }
  const start = getCycleStart();
  const d1 = new Date(start + 'T00:00:00');
  const d2 = new Date(dateStr + 'T00:00:00');
  const diffDays = Math.floor((d2 - d1) / 86400000);
  const week = Math.floor(diffDays / 7) + 1;
  const day = ((diffDays % 7) + 7) % 7 + 1;
  return { week: Math.max(1, week), day };
}

function getEffectiveDay() {
  const wd = calculateWeekDay(S.today);
  return wd.day;
}

function dayForDate(dateStr) {
  const p = S.profile;
  if (!p || !p.last_completed_date) return S.day;
  const lastDate = p.last_completed_date.split('T')[0];
  const lastDay = p.cycle_day || 1;
  const diff = dayDiff(dateStr, lastDate);
  if (diff > 0) return lastDay;
  let target = lastDay;
  for (let i = 0; i < Math.abs(diff); i++) { target = target - 1; if (target < 1) target = 7; }
  return target;
}

function formatDuration(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function formatDurationCN(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0 && m > 0) return `${h}小时${m}分`;
  if (h > 0) return `${h}小时`;
  return `${m}分`;
}
function formatMinutesCN(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0 && m > 0) return `${h}小时${m}分`;
  if (h > 0) return `${h}小时`;
  return `${m}分`;
}

// ==================== 练习历史缓存 ====================
function getExerciseHistory(name) {
  const raw = localStorage.getItem(`ft_ex_hist_${name}`);
  return raw ? JSON.parse(raw) : null;
}
function setExerciseHistory(name, data) {
  localStorage.setItem(`ft_ex_hist_${name}`, JSON.stringify(data));
}

// ==================== 计时器系统 ====================
function initTimers() {
  timerSessions = [];
  const sd = S.checkin?.schedule_data || {};
  timerSessions = sd.timer_sessions || [];
  initCurrentTimer();
}

let currentTimer = { running: false, startTime: 0, category: '', subCategory: '', note: '' };

function initCurrentTimer() {
  const saved = localStorage.getItem('ft_current_timer');
  if (saved) {
    try {
      const data = JSON.parse(saved);
      if (data.date === S.today && data.running) {
        currentTimer = data;
      } else {
        localStorage.removeItem('ft_current_timer');
      }
    } catch(e) {}
  }
}

function saveCurrentTimer() {
  if (currentTimer.running) {
    localStorage.setItem('ft_current_timer', JSON.stringify({ ...currentTimer, date: S.today }));
  } else {
    localStorage.removeItem('ft_current_timer');
  }
}

function getTodaySessions() {
  const sd = S.checkin?.schedule_data || {};
  return (sd.sessions || []).filter(s => s.date === S.today || !s.date);
}

function getLastStudySubject() {
  const sd = S.checkin?.schedule_data || {};
  const allSessions = [...(sd.sessions || []), ...(sd.timer_sessions || [])];
  const studySessions = allSessions.filter(s => s.category === 'study' && (s.subCategory || s.subject));
  if (studySessions.length > 0) {
    return studySessions[studySessions.length - 1].subCategory || studySessions[studySessions.length - 1].subject;
  }
  return 'math';
}

function getSmartPreset() {
  const now = new Date();
  const hm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  const nowMin = timeToMin(hm);
  const isWorkoutDay = CYCLE[(S.day - 1) % 7]?.type === 'workout';

  const slots = [
    { s: '00:00', e: '07:30', w: { cat: 'rest', sub: 'sleep' }, r: { cat: 'rest', sub: 'sleep' } },
    { s: '07:30', e: '08:00', w: { cat: 'diet', sub: 'breakfast' }, r: { cat: 'diet', sub: 'breakfast' } },
    { s: '08:00', e: '11:15', w: { cat: 'study', sub: 'last' }, r: { cat: 'study', sub: 'last' } },
    { s: '11:15', e: '11:45', w: { cat: 'diet', sub: 'preworkout' }, r: { cat: 'rest', sub: '' } },
    { s: '11:45', e: '13:00', w: { cat: 'workout', sub: '' }, r: { cat: 'study', sub: 'math' } },
    { s: '13:00', e: '13:30', w: { cat: 'diet', sub: 'lunch' }, r: { cat: 'diet', sub: 'lunch' } },
    { s: '13:30', e: '14:00', w: { cat: 'rest', sub: '' }, r: { cat: 'rest', sub: '' } },
    { s: '14:00', e: '14:30', w: { cat: 'rest', sub: 'nap' }, r: { cat: 'rest', sub: 'nap' } },
    { s: '14:30', e: '16:00', w: { cat: 'study', sub: 'last' }, r: { cat: 'study', sub: 'last' } },
    { s: '16:00', e: '16:15', w: { cat: 'diet', sub: 'snack' }, r: { cat: 'diet', sub: 'snack' } },
    { s: '16:15', e: '17:45', w: { cat: 'study', sub: 'last' }, r: { cat: 'study', sub: 'last' } },
    { s: '17:45', e: '18:40', w: { cat: 'diet', sub: 'dinner' }, r: { cat: 'diet', sub: 'dinner' } },
    { s: '18:40', e: '19:00', w: { cat: 'rest', sub: 'meditation' }, r: { cat: 'rest', sub: 'meditation' } },
    { s: '19:00', e: '20:50', w: { cat: 'study', sub: 'last' }, r: { cat: 'study', sub: 'last' } },
    { s: '20:50', e: '23:00', w: { cat: 'entertainment', sub: '' }, r: { cat: 'entertainment', sub: '' } },
    { s: '23:00', e: '23:30', w: { cat: 'diet', sub: 'bedtime' }, r: { cat: 'diet', sub: 'bedtime' } },
    { s: '23:30', e: '23:59', w: { cat: 'rest', sub: 'sleep' }, r: { cat: 'rest', sub: 'sleep' } },
  ];

  for (const slot of slots) {
    const s = timeToMin(slot.s);
    const e = timeToMin(slot.e);
    if (nowMin >= s && nowMin < e) {
      const rec = isWorkoutDay ? slot.w : slot.r;
      let sub = rec.sub;
      if (sub === 'last') {
        sub = getLastStudySubject();
      }
      console.log('[智能推荐]', hm, '→', rec.cat, '-', sub || '(空)');
      return { category: rec.cat, subCategory: sub };
    }
  }

  console.log('[智能推荐]', hm, '→ 无匹配，兜底 study - math');
  return { category: 'study', subCategory: 'math' };
}

function getCurrentTimerDurationSec() {
  if (!currentTimer.running) return 0;
  return Math.floor((Date.now() - currentTimer.startTime) / 1000);
}

function getDayCategoryDuration(checkin, category) {
  if (!checkin || !checkin.schedule_data) return 0;
  let min = 0;
  (checkin.schedule_data.sessions || []).forEach(s => { if (s.category === category) min += s.duration || 0; });
  (checkin.schedule_data.timer_sessions || []).forEach(s => { if (s.category === category) min += s.duration || 0; });
  return min;
}

function getDaySubCategoryDuration(checkin, subCategory) {
  if (!checkin || !checkin.schedule_data) return 0;
  let min = 0;
  (checkin.schedule_data.sessions || []).forEach(s => { if (s.subCategory === subCategory) min += s.duration || 0; });
  (checkin.schedule_data.timer_sessions || []).forEach(s => { if (s.subject === subCategory) min += s.duration || 0; });
  return min;
}

function getDayTotalStudy(checkin) {
  return getDayCategoryDuration(checkin, 'study');
}

function getDaySubjectDuration(checkin, subject) {
  return getDaySubCategoryDuration(checkin, subject);
}

function getCategoryDurationToday(category) {
  return getDayCategoryDuration(S.checkin, category);
}

function getSubCategoryDurationToday(subCategory) {
  return getDaySubCategoryDuration(S.checkin, subCategory);
}

async function toggleMainTimer() {
  const now = Date.now();
  if (currentTimer.running) {
    const sec = Math.floor((now - currentTimer.startTime) / 1000);
    pendingSession = {
      startTime: new Date(currentTimer.startTime).toISOString(),
      endTime: new Date(now).toISOString(),
      duration: Math.round(sec / 60),
      category: currentTimer.category,
      subCategory: currentTimer.subCategory,
      note: currentTimer.note,
      feeling: ''
    };
    currentTimer = { running: false, startTime: 0, category: '', subCategory: '', note: '' };
    saveCurrentTimer();
    showTimerFeelingModal();
  } else {
    const preset = getSmartPreset();
    const cat = document.getElementById('main-cat-select')?.value || preset.category;
    const sub = document.getElementById('main-sub-select')?.value || preset.subCategory;
    const note = document.getElementById('main-note')?.value || '';
    currentTimer = { running: true, startTime: now, category: cat, subCategory: sub, note };
    saveCurrentTimer();
    renderSchedule();
    updateHeaderTotal();
  }
}

let pendingSession = null;
let pendingTrainingStart = false;
let pendingTrainingRecord = null;

function showTimerFeelingModal() {
  document.getElementById('timer-feeling-modal').classList.remove('hidden');
  document.getElementById('timer-feeling-input').value = '';
}

function closeTimerFeelingModal() {
  document.getElementById('timer-feeling-modal').classList.add('hidden');
}

async function saveTimerFeeling() {
  if (!pendingSession) return;
  pendingSession.feeling = document.getElementById('timer-feeling-input').value || '';
  const saved = S.checkin?.schedule_data || {};
  if (!saved.sessions) saved.sessions = [];
  saved.sessions.push(pendingSession);
  S.checkin = await dbUpsertCheckin(S.today, saved);
  pendingSession = null;
  closeTimerFeelingModal();
  renderSchedule();
  updateHeaderTotal();
  if (pendingTrainingStart) {
    pendingTrainingStart = false;
    await doStartTraining();
  }
}

async function skipTimerFeeling() {
  if (!pendingSession) return;
  const saved = S.checkin?.schedule_data || {};
  if (!saved.sessions) saved.sessions = [];
  saved.sessions.push(pendingSession);
  S.checkin = await dbUpsertCheckin(S.today, saved);
  pendingSession = null;
  closeTimerFeelingModal();
  renderSchedule();
  updateHeaderTotal();
  if (pendingTrainingStart) {
    pendingTrainingStart = false;
    await doStartTraining();
  }
}

function updateHeaderTotal() {
  let totalSec = 0;
  const sd = S.checkin?.schedule_data || {};
  (sd.sessions || []).forEach(s => { totalSec += (s.duration || 0) * 60; });
  (sd.timer_sessions || []).forEach(s => { totalSec += (s.duration || 0) * 60; });
  if (currentTimer.running) {
    totalSec += getCurrentTimerDurationSec();
  }
  const el = document.getElementById('study-total-today');
  if (el) el.textContent = formatDurationCN(totalSec);
}

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', async () => {
  try {
    initSB();
    S.today = todayStr();
    viewDate = S.today;
    if (!sbClient) { showScreen('config'); return; }
    const user = await sbGetUser();
    if (user) {
      S.user = user; localMode = false;
      await loadData();
      showScreen('main'); renderAll(); checkFirstOpen(); checkFirstTimeReport();
      checkBackupReminder(); checkBodyPhotoReminder(); checkWeeklyReport();
    } else {
      enterLocalMode();
    }
  } catch (err) {
    console.error('[init error]', err);
    enterLocalMode();
  }
  document.addEventListener('click', (e) => {
    const modal = document.getElementById('weekday-editor-modal');
    if (modal && !modal.classList.contains('hidden') && !modal.contains(e.target)) {
      modal.classList.add('hidden');
    }
  });
  const editBtn = document.getElementById('edit-weekday-btn');
  if (editBtn) editBtn.addEventListener('click', openWeekDayEditor);

  // 绑定「当日规划」悬停事件（在容器上绑定，避免鼠标移入 tooltip 时触发 mouseleave）
  const hoverWrap = document.getElementById('schedule-hover-wrap');
  const hoverCard = document.getElementById('schedule-hover-card');
  if (hoverWrap && hoverCard) {
    hoverWrap.addEventListener('mouseenter', () => {
      hoverCard.classList.remove('hidden');
      hoverCard.style.display = 'block';
    });
    hoverWrap.addEventListener('mouseleave', () => {
      hoverCard.classList.add('hidden');
      hoverCard.style.display = 'none';
    });
  }

  // 保底：无论前面初始化是否成功，都尝试更新倒计时和填充悬停内容
  updateExamCountdown();
  const schedListFallback = document.getElementById('schedule-hover-list');
  if (schedListFallback && !schedListFallback.innerHTML.trim()) {
    const fallbackSched = WS;
    schedListFallback.innerHTML = fallbackSched.map(s => {
      return '<div class="flex items-center gap-2"><span class="text-gray-500 font-mono text-[10px] shrink-0">' + s.time + '</span><span class="text-gray-300 truncate">' + s.name + '</span></div>';
    }).join('');
  }
});

function enterLocalMode() {
  localMode = true; S.user = null;
  loadDataLocal().then(() => {
    showScreen('main'); renderAll();
    checkFirstTimeReport();
    checkBackupReminder(); checkBodyPhotoReminder(); checkWeeklyReport();
  }).catch(err => {
    console.error('[enterLocalMode error]', err);
    showScreen('main');
    renderAll();
  });
}

function checkFirstTimeReport() {
  const autoReport = getAutoReportSetting();
  const nowH = new Date().getHours();
  if (autoReport && nowH >= 22 && !localStorage.getItem('ft_report_seen_' + S.today)) {
    localStorage.setItem('ft_report_seen_' + S.today, '1');
    generateDailyReport();
  }
}

async function loadData() {
  S.profile = await dbGetProfile();
  if (!S.profile) {
    S.profile = { cycle_day: 1, last_completed_date: null };
  }
  const wd = calculateWeekDay(S.today);
  S.day = wd.day;
  S.week = wd.week;
  viewDate = S.today;
  viewDay = S.day;
  viewWeek = S.week;
  S.rest = CYCLE[(S.day - 1) % 7]?.type === 'rest';
  S.checkin = await dbGetCheckin(S.today);
  S.water = await dbGetWaterLogs(S.today);
  S.diet = await dbGetDiet(S.today);
  if (!S.rest) S.workout = await dbGetWorkout(S.today, S.day);
  S.weights = await dbGetWeightLogs(56);
  S.weekData = await dbGetCheckinsBetween(weekStart(S.today), weekDays(weekStart(S.today))[6]);
  initTimers();
  initRestTimer();
  initTrainingSession();
}

async function loadDataLocal() {
  await loadData();
}

async function reloadTodayData() {
  S.checkin = await dbGetCheckin(S.today);
  S.water = await dbGetWaterLogs(S.today);
  S.diet = await dbGetDiet(S.today);
  S.workout = S.rest ? null : await dbGetWorkout(S.today, S.day);
}

function showScreen(name) {
  ['config-screen', 'auth-screen', 'main-screen'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const shouldHide = id !== name + '-screen';
    if (shouldHide) {
      el.classList.add('hidden');
      el.style.display = 'none';
    } else {
      el.classList.remove('hidden');
      el.style.display = (id === 'main-screen') ? 'flex' : 'block';
    }
  });
  if (name === 'config') initConfigBodyProfile();
  if (name === 'main') {
    const main = document.getElementById('main-screen');
    if (main) { main.classList.remove('hidden'); main.style.display = 'flex'; }
    const scheduleTab = document.getElementById('tab-schedule');
    if (scheduleTab) { scheduleTab.classList.remove('hidden'); scheduleTab.style.display = 'block'; }
  }
}

// ==================== 每日首次打开弹窗 ====================
function checkFirstOpen() {
  if (localMode) return;
  const key = 'last_open_' + (S.user?.id || 'anon');
  const last = localStorage.getItem(key);
  if (last === S.today) return;
  localStorage.setItem(key, S.today);
  const p = S.profile;
  if (!p || !p.last_completed_date) return;
  const lastDate = p.last_completed_date.split('T')[0];
  const diff = dayDiff(lastDate, S.today);
  if (diff <= 0) return;
  const continueDay = p.cycle_day || 1;
  const advanceDay = (continueDay % 7) + 1;
  document.getElementById('last-day-info').textContent = `Day ${continueDay}（${lastDate}）`;
  document.getElementById('opt-continue-day').textContent = continueDay;
  document.getElementById('opt-advance-day').textContent = advanceDay;
  document.getElementById('day-choice-modal').classList.remove('hidden');
}

function closeDayChoiceModal() { document.getElementById('day-choice-modal').classList.add('hidden'); }
function showCustomDayPicker() { document.getElementById('custom-day-modal').classList.remove('hidden'); }
function closeCustomDayModal() { document.getElementById('custom-day-modal').classList.add('hidden'); }

async function chooseDayOption(option) {
  closeDayChoiceModal();
  if (option === 'continue') {
    renderAll();
  } else if (option === 'advance') {
    const next = (S.day % 7) + 1;
    S.day = next;
    S.profile = await dbUpdateProfile({ cycle_day: next });
    S.rest = CYCLE[(next - 1) % 7]?.type === 'rest';
    await reloadTodayData();
    renderAll();
  }
}

async function chooseCustomDay(day) {
  closeCustomDayModal(); closeDayChoiceModal();
  S.day = day;
  S.profile = await dbUpdateProfile({ cycle_day: day });
  S.rest = CYCLE[(day - 1) % 7]?.type === 'rest';
  await reloadTodayData();
  renderAll();
}

// ==================== Auth UI ====================
let authMode = 'login';
function switchAuthTab(m) {
  authMode = m;
  document.getElementById('tab-login').className = m === 'login' ? 'flex-1 py-2 rounded-md text-sm font-medium bg-dark-600 text-white transition' : 'flex-1 py-2 rounded-md text-sm font-medium text-gray-400 transition';
  document.getElementById('tab-register').className = m === 'register' ? 'flex-1 py-2 rounded-md text-sm font-medium bg-dark-600 text-white transition' : 'flex-1 py-2 rounded-md text-sm font-medium text-gray-400 transition';
  document.getElementById('auth-submit-btn').textContent = m === 'login' ? '登录' : '注册';
  document.getElementById('auth-error').classList.add('hidden');
}
async function handleAuthSubmit() {
  const email = document.getElementById('auth-email').value.trim();
  const pw = document.getElementById('auth-password').value;
  const err = document.getElementById('auth-error');
  if (!email || !pw) { err.textContent = '请填写邮箱和密码'; err.classList.remove('hidden'); return; }
  document.getElementById('auth-submit-btn').disabled = true;
  const r = authMode === 'login' ? await sbSignIn(email, pw) : await sbSignUp(email, pw);
  document.getElementById('auth-submit-btn').disabled = false;
  if (r.error) { err.textContent = r.error.message; err.classList.remove('hidden'); }
  else { S.user = r.data.user; localMode = false; await loadData(); showScreen('main'); renderAll(); checkFirstOpen(); }
}
async function handleAnonymousLogin() {
  const r = await sbSignInAnon();
  if (r.error) { const e = document.getElementById('auth-error'); e.textContent = r.error.message; e.classList.remove('hidden'); }
  else { S.user = r.data.user; localMode = false; await loadData(); showScreen('main'); renderAll(); checkFirstOpen(); }
}
async function logout() {
  await sbSignOut();
  localMode = true; S.user = null; sbUser = null;
  S = { user: null, profile: null, today: todayStr(), day: 1, rest: false, checkin: null, water: [], diet: null, workout: null, weights: [], week: [], tab: 'schedule' };
  enterLocalMode();
}
function saveConfig() {
  const url = document.getElementById('config-url').value.trim();
  const key = document.getElementById('config-key').value.trim();
  const err = document.getElementById('config-error');
  if (!url || !key) { err.textContent = '请填写 URL 和 Key'; err.classList.remove('hidden'); return; }
  if (!url.startsWith('https://')) { err.textContent = 'URL 须以 https:// 开头'; err.classList.remove('hidden'); return; }
  // 保存日报/周报开关
  const autoReport = document.getElementById('config-auto-report')?.checked;
  localStorage.setItem('ft_auto_report', autoReport !== false ? '1' : '0');
  const autoWeekly = document.getElementById('config-auto-weekly-report')?.checked;
  localStorage.setItem('ft_auto_weekly_report', autoWeekly !== false ? '1' : '0');
  setSBConfig(url, key);
}

function getAutoReportSetting() {
  return localStorage.getItem('ft_auto_report') !== '0';
}

// ==================== Tab ====================
function switchTab(t) {
  try {
    console.log('[switchTab]', t);
    S.tab = t;
    document.querySelectorAll('.tab-btn').forEach(b => {
      if (b.dataset.tab === t) { b.classList.remove('tab-inactive'); b.classList.add('tab-active'); }
      else { b.classList.remove('tab-active'); b.classList.add('tab-inactive'); }
    });
    document.querySelectorAll('.tab-content').forEach(el => {
      el.classList.add('hidden');
      el.style.display = 'none';
    });
    const target = document.getElementById('tab-' + t);
    if (target) {
      target.classList.remove('hidden');
      target.style.display = 'block';
    }
    if (t === 'schedule') renderSchedule();
    if (t === 'diet') renderDiet();
    if (t === 'workout') renderWorkout();
    if (t === 'stats') renderStats();
  } catch (e) {
    console.error('[switchTab error]', e);
  }
}

function updateExamCountdown() {
  const targetDate = new Date('2026-12-19T00:00:00');
  const today = new Date(S.today + 'T00:00:00');
  const diff = Math.ceil((targetDate - today) / 86400000);
  const el = document.getElementById('exam-countdown');
  if (el) {
    if (diff <= 0) {
      el.textContent = '考研已到达 🎯';
    } else {
      el.textContent = `距离考研 ${diff} 天 📝`;
    }
  }
}

function renderAll() {
  try {
    const loginBanner = document.getElementById('login-banner');
    const headerLoginBtn = document.getElementById('header-login-btn');
    const headerLogoutBtn = document.getElementById('header-logout-btn');
    if (loginBanner) loginBanner.classList.toggle('hidden', !localMode);
    if (headerLoginBtn) headerLoginBtn.classList.toggle('hidden', !localMode);
    if (headerLogoutBtn) headerLogoutBtn.classList.toggle('hidden', localMode);

    const info = CYCLE[(S.day - 1) % 7] || { type: 'workout' };
    const cycleText = document.getElementById('cycle-day-text');
    if (cycleText) cycleText.textContent = `第 ${S.week || 1} 周 · 第 ${S.day || 1} 天`;

    // 渲染当日规划悬停卡片
    const schedList = document.getElementById('schedule-hover-list');
    if (schedList) {
      const sched = info.type === 'rest' ? RS : WS;
      schedList.innerHTML = sched.map(s => {
        return '<div class="flex items-center gap-2"><span class="text-gray-500 font-mono text-[10px] shrink-0">' + s.time + '</span><span class="text-gray-300 truncate">' + s.name + '</span></div>';
      }).join('');
    }

    initConfigBodyProfile();
    switchTab(S.tab);
  } catch (e) {
    console.error('[renderAll error]', e);
  } finally {
    updateExamCountdown();
  }
}

function openWeekDayEditor(event) {
  try {
    console.log('[openWeekDayEditor] start');
    if (event) event.stopPropagation();
    const modal = document.getElementById('weekday-editor-modal');
    console.log('[openWeekDayEditor] modal found:', !!modal);
    modal.classList.remove('hidden');
    console.log('[openWeekDayEditor] hidden removed:', !modal.classList.contains('hidden'));
    document.getElementById('edit-week-input').value = S.week || 1;
    const dayEl = document.getElementById('edit-day-input');
    dayEl.value = String(S.day || 1);
    dayEl.dataset.prevDay = String(S.day || 1);
  } catch (e) {
    console.error('[openWeekDayEditor error]', e);
  }
}

function changeDay(delta) {
  const weekEl = document.getElementById('edit-week-input');
  const dayEl = document.getElementById('edit-day-input');
  let week = parseInt(weekEl.value) || 1;
  let day = parseInt(dayEl.value) || 1;
  day += delta;
  if (day > 7) { day = 1; week += 1; }
  if (day < 1) { day = 7; week -= 1; }
  dayEl.value = String(day);
  dayEl.dataset.prevDay = String(day);
  weekEl.value = String(Math.max(1, week));
}

function onDaySelect(value) {
  const weekEl = document.getElementById('edit-week-input');
  const dayEl = document.getElementById('edit-day-input');
  let week = parseInt(weekEl.value) || 1;
  const oldDay = parseInt(dayEl.dataset.prevDay || dayEl.value) || 1;
  const newDay = parseInt(value) || 1;
  if (oldDay === 7 && newDay === 1) week += 1;
  if (oldDay === 1 && newDay === 7) week -= 1;
  dayEl.value = String(newDay);
  dayEl.dataset.prevDay = String(newDay);
  weekEl.value = String(Math.max(1, week));
}

function closeWeekDayEditor() {
  document.getElementById('weekday-editor-modal').classList.add('hidden');
}

function saveWeekDayEdit() {
  const week = parseInt(document.getElementById('edit-week-input').value) || 1;
  const day = Math.max(1, Math.min(7, parseInt(document.getElementById('edit-day-input').value) || 1));
  localStorage.setItem('ft_manual_day', JSON.stringify({ date: S.today, week, day }));
  const wd = { week, day };
  S.week = wd.week;
  S.day = wd.day;
  S.rest = CYCLE[(S.day - 1) % 7]?.type === 'rest';
  viewWeek = S.week;
  viewDay = S.day;
  closeWeekDayEditor();
  renderAll();
}

function resetCycleStart() {
  if (!confirm('重置周期起始日为今天？这将影响所有日期的周数计算。')) return;
  localStorage.setItem('ft_cycle_start', S.today);
  localStorage.removeItem('ft_manual_day');
  const wd = calculateWeekDay(S.today);
  S.week = wd.week;
  S.day = wd.day;
  S.rest = CYCLE[(S.day - 1) % 7]?.type === 'rest';
  viewWeek = S.week;
  viewDay = S.day;
  renderAll();
}



// ==================== 日程 ====================
function renderSchedule() {
  try {
    if (!viewDate) viewDate = S.today || todayStr();
    console.log('[renderSchedule] start, viewDate=' + viewDate + ', S.today=' + S.today + ', isHistory=' + (viewDate !== S.today));
    const c = document.getElementById('schedule-container');
    const isHistory = viewDate !== S.today;
    const returnTodayBtn = document.getElementById('schedule-return-today-btn');
    if (returnTodayBtn) {
      returnTodayBtn.style.display = isHistory ? 'inline-flex' : 'none';
    }
    console.log('[renderSchedule] isHistory=' + isHistory + ', historyCheckin=', historyCheckin);
  const dayNum = isHistory ? viewDay : S.day;
  const sched = schedForDay(dayNum);
  const checkin = isHistory ? historyCheckin : S.checkin;
  const preset = isHistory ? { category: 'rest', subCategory: '' } : getSmartPreset();
  const allOldSessions = checkin?.schedule_data?.timer_sessions || [];
  const allNewSessions = checkin?.schedule_data?.sessions || [];
  const allSessions = [...allOldSessions, ...allNewSessions].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

  // Time bar
  const dayStart = timeToMin('07:30');
  const dayEnd = timeToMin('23:30');
  const dayTotal = dayEnd - dayStart;
  const now = new Date();
  const nowHm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  const nowMin = timeToMin(nowHm);
  const nowPct = Math.max(0, Math.min(100, ((nowMin - dayStart) / dayTotal) * 100));

  let barHtml = '';
  sched.forEach(item => {
    const pt = parseScheduleTime(item.time);
    if (!pt.end) return;
    const s = timeToMin(pt.start);
    const e = timeToMin(pt.end);
    if (e <= dayStart || s >= dayEnd) return;
    const left = ((Math.max(s, dayStart) - dayStart) / dayTotal) * 100;
    const width = ((Math.min(e, dayEnd) - Math.max(s, dayStart)) / dayTotal) * 100;
    const cat = getCategory(item.name);
    const color = CATEGORIES[cat]?.color || '#94a3b8';
    const showLabel = width > 6;
    barHtml += `<div class="absolute top-0 h-full rounded-sm flex items-center justify-center overflow-hidden" style="left:${left}%;width:${width}%;background:${color}22;border-right:1px solid ${color}44">` +
      (showLabel ? `<span class="text-[8px] leading-none text-white truncate px-0.5" style="text-shadow:0 0 2px rgba(0,0,0,0.8)">${escapeHtml(item.name)}</span>` : '') +
      '</div>';
  });

  // Main control area
  const cat = currentTimer.running && !isHistory ? currentTimer.category : (document.getElementById('main-cat-select')?.value || preset.category);
  const sub = currentTimer.running && !isHistory ? currentTimer.subCategory : (document.getElementById('main-sub-select')?.value || preset.subCategory);
  const note = currentTimer.running && !isHistory ? currentTimer.note : '';
  const catInfo = CATEGORIES[cat] || CATEGORIES[preset.category];
  const hasSubs = catInfo && catInfo.subs;

  let subButtonsHtml = '';
  if (hasSubs && !currentTimer.running && !isHistory) {
    subButtonsHtml = '<div class="flex flex-wrap gap-2 mt-2">';
    Object.entries(catInfo.subs).forEach(([key, info]) => {
      const active = sub === key ? 'bg-accent/30 border-accent text-accent' : 'bg-dark-700/50 border-dark-600 text-gray-400';
      subButtonsHtml += `<button onclick="selectSubCategory('${key}')" class="text-xs py-1.5 px-3 rounded-lg border transition ${active}">${info.icon} ${info.name}</button>`;
    });
    subButtonsHtml += '</div>';
  } else if (hasSubs && (currentTimer.running || isHistory)) {
    const subInfo = catInfo.subs[sub];
    subButtonsHtml = '<div class="mt-2 text-xs text-accent">' + (subInfo ? subInfo.icon + ' ' + subInfo.name : '') + '</div>';
  }

  const btnText = currentTimer.running && !isHistory
    ? '⏹️ 结束 [' + catInfo.name + (sub && catInfo.subs ? ' - ' + catInfo.subs[sub]?.name : '') + '] 已进行 ' + formatDuration(getCurrentTimerDurationSec())
    : (isHistory ? '⏱️ 历史视图，无法计时' : '⏱️ 开始 [' + catInfo.name + (sub && catInfo.subs ? ' - ' + catInfo.subs[sub]?.name : '') + ']');
  const btnClass = currentTimer.running && !isHistory
    ? 'w-full bg-danger hover:bg-danger-dark text-white font-semibold py-3 rounded-xl transition shadow-lg shadow-danger/20 mt-3 btn-press'
    : (isHistory ? 'w-full bg-dark-700 text-gray-500 font-semibold py-3 rounded-xl transition mt-3 cursor-not-allowed' : 'w-full bg-accent hover:bg-accent-dark text-white font-semibold py-3 rounded-xl transition shadow-lg shadow-accent/20 mt-3 btn-press');

  // 健身时间横幅提醒
  const isWorkoutDayNow = CYCLE[(S.day - 1) % 7]?.type === 'workout';
  const workoutBannerStart = timeToMin('11:45');
  const workoutBannerEnd = timeToMin('13:00');
  const showWorkoutBanner = isWorkoutDayNow && nowMin >= workoutBannerStart && nowMin < workoutBannerEnd && !isHistory;
  const workoutBannerHtml = showWorkoutBanner
    ? '<div class="mb-3"><div class="bg-gradient-to-r from-red-900/40 to-dark-700 rounded-xl p-3 border border-red-500/30 flex items-center justify-between"><span class="text-sm text-red-300">🏋️ 当前是训练时间，点击开始今日训练</span><button onclick="switchTab(\'workout\')" class="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-3 py-1.5 rounded-lg transition hover:bg-red-500/30">开始训练</button></div></div>'
    : '';

  let catButtonsHtml = '<div class="grid grid-cols-3 md:grid-cols-6 gap-2 mb-3">';
  Object.entries(CATEGORIES).forEach(([key, info]) => {
    if (key === 'workout') return;
    const active = cat === key ? 'ring-2 ring-accent text-white' : 'text-gray-400 hover:text-white';
    catButtonsHtml += `<button onclick="selectCategory('${key}')" class="text-xs py-2 rounded-xl border border-dark-600 bg-dark-700/50 transition text-center ${active}" ${isHistory ? 'disabled' : ''}>${info.icon}<br>${info.name}</button>`;
  });
  catButtonsHtml += '</div>';

  // Today record list
  let recordsHtml = '';
  if (allSessions.length > 0 || (currentTimer.running && !isHistory)) {
    recordsHtml = '<div class="space-y-2 mt-4">';
    let lastEnd = new Date(viewDate + 'T07:30:00');
    allSessions.forEach((s, i) => {
      const sStart = new Date(s.startTime);
      const sEnd = new Date(s.endTime);
      const dur = s.duration || Math.round((sEnd - sStart) / 60000);
      const scat = s.category || 'other';
      const ssub = s.subCategory || s.subject || '';
      const cinfo = CATEGORIES[scat];
      const scolor = cinfo?.color || '#94a3b8';
      const sname = cinfo?.name || scat;
      const subName = (cinfo?.subs && cinfo.subs[ssub]) ? cinfo.subs[ssub].name : (ssub ? ssub : '');
      const hasFeeling = s.feeling && s.feeling.trim();
      const feelingId = 'feeling-' + i;
      recordsHtml += '<div class="flex items-center gap-2 p-2 bg-dark-700/40 rounded-lg transition hover:bg-dark-600/40">' +
        '<span class="text-[10px] font-mono w-20 shrink-0" style="color:' + scolor + '">' + formatTime(sStart) + '-' + formatTime(sEnd) + '</span>' +
        '<span class="w-2 h-2 rounded-full shrink-0" style="background:' + scolor + '"></span>' +
        '<span class="text-xs text-gray-300 flex-1">' + sname + (subName ? ' - ' + subName : '') + ' · ' + formatMinutesCN(dur) + '</span>' +
        (hasFeeling ? '<button onclick="toggleFeelingDisplay(\'' + feelingId + '\')" class="text-xs text-accent shrink-0">💬</button>' : '') +
        (s.note ? '<span class="text-[10px] text-gray-500 max-w-[80px] truncate">' + escapeHtml(s.note) + '</span>' : '') +
        (!isHistory ? '<button onclick="deleteSession(' + i + ')" class="text-gray-500 hover:text-danger text-xs shrink-0">×</button>' : '') +
        '</div>';
      if (hasFeeling) {
        recordsHtml += '<div id="' + feelingId + '" class="hidden text-xs text-gray-400 bg-dark-700/20 rounded-lg p-2 ml-6">' + escapeHtml(s.feeling) + '</div>';
      }
      lastEnd = sEnd;
    });
    if (currentTimer.running && !isHistory) {
      const curStart = new Date(currentTimer.startTime);
      const cinfo = CATEGORIES[currentTimer.category];
      recordsHtml += '<div class="flex items-center gap-2 p-2 bg-dark-700/40 rounded-lg border border-accent/30 transition hover:bg-dark-600/40">' +
        '<span class="text-[10px] font-mono w-20 shrink-0 text-accent">' + formatTime(curStart) + '-进行中</span>' +
        '<span class="w-2 h-2 rounded-full shrink-0 bg-accent animate-pulse"></span>' +
        '<span class="text-xs text-gray-300 flex-1">' + cinfo.name + (currentTimer.subCategory && cinfo.subs ? ' - ' + cinfo.subs[currentTimer.subCategory]?.name : '') + ' · 进行中</span>' +
        '</div>';
    }
    recordsHtml += '</div>';
  }

  let html = '<div class="space-y-4">';

  // Date navigation for history
  if (isHistory) {
    html += '<div class="flex items-center justify-between bg-dark-700/40 rounded-xl p-3">' +
      '<button onclick="navigateHistory(-1)" class="text-sm text-gray-400 hover:text-white px-3">← 前一天</button>' +
      '<span class="text-sm font-medium text-accent">' + viewDate + ' · 第' + viewWeek + '周第' + viewDay + '天</span>' +
      '<button onclick="navigateHistory(1)" class="text-sm text-gray-400 hover:text-white px-3">后一天 →</button>' +
      '</div>';
  }

  // Cycle day 1 weight reminder
  if (!isHistory && isCycleDay1WithoutWeight()) {
    html += '<div class="glass glass-hover rounded-xl p-3 border border-green-500/30 bg-green-500/10 flex items-center justify-between gap-2">' +
      '<span class="text-sm text-green-400">📏 本周记录日：记录体重与腰围</span>' +
      '<div class="flex items-center gap-2 shrink-0">' +
      '<button onclick="switchTab(\'stats\');setTimeout(function(){var sec=document.getElementById(\'body-data-section\');if(sec){sec.scrollIntoView({behavior:\'smooth\',block:\'start\'});}var el=document.getElementById(\'weight-input\');if(el)el.focus();var card=document.getElementById(\'body-record-card\');if(card){card.classList.add(\'ring-2\',\'ring-accent\');setTimeout(function(){card.classList.remove(\'ring-2\',\'ring-accent\');},2000);}},200)" class="text-xs bg-green-500/20 text-green-400 border border-green-500/30 px-3 py-1.5 rounded-lg transition hover:bg-green-500/30">去记录 →</button>' +
      '<button onclick="localStorage.setItem(\'ft_weekly_body_seen_' + S.today + '\', \'1\');renderSchedule();" class="text-xs text-gray-500 hover:text-gray-300 px-1">&times;</button>' +
      '</div></div>';
  }

  // Time bar
  html += '<div class="glass rounded-xl p-4">' +
    '<div class="relative h-6 bg-dark-700 rounded-full overflow-hidden mb-1">' + barHtml +
    '<div class="absolute top-0 bottom-0 w-0.5 bg-white z-10" style="left:' + nowPct + '%"></div>' +
    '</div>' +
    '<div class="flex justify-between text-[10px] text-gray-500">' +
    '<span>07:30</span><span>12:00</span><span>17:00</span><span>23:30</span>' +
    '</div></div>';

  // Main control
  html += '<div class="glass glass-hover rounded-xl p-4">' +
    '<h3 class="font-medium text-sm mb-3">⏱️ ' + (isHistory ? '历史记录' : '当前任务') + '</h3>' +
    workoutBannerHtml +
    catButtonsHtml +
    (!currentTimer.running && !isHistory ? '<input type="hidden" id="main-cat-select" value="' + cat + '"><input type="hidden" id="main-sub-select" value="' + sub + '">' : '') +
    subButtonsHtml +
    (!isHistory ? '<input type="text" id="main-note" placeholder="..." value="' + escapeHtml(note) + '" class="w-full bg-dark-700 border border-dark-600 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent mt-3 text-gray-300 placeholder-gray-600">' : '') +
    '<button onclick="' + (isHistory ? '' : 'toggleMainTimer()') + '" class="' + btnClass + '" ' + (isHistory ? 'disabled' : '') + '>' + btnText + '</button>' +
    '</div>';

  // Records
  if (recordsHtml) {
    html += '<div class="glass glass-hover rounded-xl p-4"><h3 class="font-medium text-sm mb-3">📋 ' + (isHistory ? '当日记录' : '今日记录') + '</h3>' + recordsHtml + '</div>';
  } else if (isHistory) {
    html += '<div class="glass glass-hover rounded-xl p-4"><h3 class="font-medium text-sm mb-3">📋 当日记录</h3><div class="empty-state py-4"><div class="empty-state-icon">🕸️</div><div class="text-xs">该日期暂无记录</div></div></div>';
  }

  html += '</div>';
  c.innerHTML = html;
  updateHeaderTotal();

  const returnBtn = document.getElementById('return-today-btn');
  const statusText = document.getElementById('header-status-text');
  if (returnBtn) returnBtn.style.display = isHistory ? 'inline-flex' : 'none';
  if (statusText) statusText.classList.toggle('hidden', isHistory);

  const datePicker = document.getElementById('history-date-picker');
  if (datePicker) {
    const dpVal = viewDate || S.today || todayStr();
    datePicker.value = dpVal;
  }

  } catch (e) {
    console.error('[renderSchedule error]', e);
  }
}

function toggleFeelingDisplay(id) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('hidden');
}

let historyCheckin = null;

async function selectHistoryDate(dateStr) {
  try {
    if (!dateStr) return;
    viewDate = dateStr;
    const wd = calculateWeekDay(dateStr);
    viewWeek = wd.week;
    viewDay = wd.day;
    console.log('[selectHistoryDate]', dateStr, 'week=' + wd.week, 'day=' + wd.day);
    historyCheckin = await dbGetCheckin(dateStr);
    console.log('[selectHistoryDate] historyCheckin=', historyCheckin);
    renderSchedule();
  } catch (e) {
    console.error('[selectHistoryDate error]', e);
  }
}

function navigateHistory(delta) {
  try {
    const vd = viewDate || S.today || todayStr();
    const d = new Date(vd + 'T00:00:00');
    if (isNaN(d.getTime())) { console.error('[navigateHistory] invalid date:', vd); return; }
    d.setDate(d.getDate() + delta);
    const ds = fmtDate(d);
    selectHistoryDate(ds);
  } catch (e) {
    console.error('[navigateHistory error]', e);
  }
}

function returnToToday() {
  viewDate = S.today;
  viewWeek = S.week;
  viewDay = S.day;
  historyCheckin = null;
  renderSchedule();
}

function selectCategory(cat) {
  try {
    console.log('[selectCategory]', cat);
    const preset = getSmartPreset();
    const catInfo = CATEGORIES[cat];
    let sub = '';
    if (catInfo && catInfo.subs) {
      const sessions = getTodaySessions();
      const catSessions = sessions.filter(s => s.category === cat && s.subCategory);
      if (catSessions.length > 0) sub = catSessions[catSessions.length - 1].subCategory;
      else sub = Object.keys(catInfo.subs)[0];
    }
    if (document.getElementById('main-cat-select')) document.getElementById('main-cat-select').value = cat;
    if (document.getElementById('main-sub-select')) document.getElementById('main-sub-select').value = sub;
    renderSchedule();
  } catch (e) {
    console.error('[selectCategory error]', e);
  }
}

function selectSubCategory(sub) {
  try {
    console.log('[selectSubCategory]', sub);
    if (document.getElementById('main-sub-select')) document.getElementById('main-sub-select').value = sub;
    renderSchedule();
  } catch (e) {
    console.error('[selectSubCategory error]', e);
  }
}

async function deleteSession(idx) {
  if (!confirm('确定删除这条记录？')) return;
  const saved = S.checkin?.schedule_data || {};
  const all = [...(saved.timer_sessions || []), ...(saved.sessions || [])].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
  const target = all[idx];
  if (saved.sessions) saved.sessions = saved.sessions.filter(s => s !== target);
  if (saved.timer_sessions) saved.timer_sessions = saved.timer_sessions.filter(s => s !== target);
  S.checkin = await dbUpsertCheckin(S.today, saved);
  renderSchedule();
}

function formatTime(d) {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return h + ':' + m;
}

function formatMinutesCN(min) {
  if (min >= 60) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m > 0 ? h + '小时' + m + '分' : h + '小时';
  }
  return min + '分';
}

// ==================== 饮食 ====================
function renderDiet() {
  updateWaterUI();
  if (S.diet) {
    document.getElementById('lunch-protein').value = S.diet.lunch_choice || '0';
    document.getElementById('dinner-protein').value = S.diet.dinner_choice || '0';
  }
  const lc = document.getElementById('lunch-carb');
  const dc = document.getElementById('dinner-carb');
  if (lc) lc.value = getCarbChoice('lunch');
  if (dc) dc.value = getCarbChoice('dinner');

  const checks = getDietChecks();
  document.querySelectorAll('#tab-diet input[type="checkbox"][data-meal][data-item]').forEach(cb => {
    const meal = cb.dataset.meal;
    const item = cb.dataset.item;
    if (checks[meal] && checks[meal][item] !== undefined) cb.checked = checks[meal][item];
    else cb.checked = true;
  });

  updateDietTracking();

  const morningSnackEl = document.getElementById('morning-snack-section');
  const lunchOilWrap = document.getElementById('lunch-oil-wrap');
  if (morningSnackEl) morningSnackEl.classList.toggle('hidden', S.rest);
  if (lunchOilWrap) lunchOilWrap.classList.toggle('hidden', S.rest);
}

function waterTotal() { return S.water.reduce((s, w) => s + (w.amount || 0), 0); }

async function addWater(amt) {
  const log = await dbAddWaterLog(S.today, amt);
  if (log) { S.water.push(log); updateWaterUI(); }
}
async function resetWater() {
  await dbDeleteWaterLogs(S.today);
  S.water = [];
  updateWaterUI();
}
function updateWaterUI() {
  const total = waterTotal();
  const pct = Math.min((total / 3500) * 100, 100);
  document.getElementById('water-amount').textContent = `${total} / 3500 ml`;
  document.getElementById('water-bar').style.width = `${pct}%`;
  const el = document.getElementById('water-log');
  if (!S.water.length) el.innerHTML = '<div class="empty-state py-2"><div class="empty-state-icon">🕸️</div><div class="text-xs">暂无记录</div></div>';
  else el.innerHTML = S.water.map(w => `<p>${new Date(w.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} +${w.amount}ml</p>`).join('');
}

const FIXED_P = 30 + 35 + 35;
function getCarbChoice(meal) { return localStorage.getItem('ft_carb_' + meal) || 'potato'; }
function setCarbChoice(meal, value) { localStorage.setItem('ft_carb_' + meal, value); }

// ==================== 饮食数据系统 ====================
const FOOD_DB = {
  lunchProtein: {
    fish260:      { kcal: 170, p: 39, c: 0,  f: 2 },
    chicken160:   { kcal: 200, p: 32, c: 0,  f: 8 },
    shrimp180:    { kcal: 155, p: 36, c: 0,  f: 1 },
    breast150:    { kcal: 165, p: 35, c: 0,  f: 3 },
    pork140:      { kcal: 400, p: 24, c: 0,  f: 35 },
    beef160:      { kcal: 260, p: 32, c: 0,  f: 15 }
  },
  dinnerProtein: {
    tofu300:      { kcal: 150, p: 15, c: 3,  f: 6 },
    fish140:      { kcal: 90,  p: 21, c: 0,  f: 1 },
    shrimp90:     { kcal: 75,  p: 18, c: 0,  f: 0.5 },
    eggwhite150:  { kcal: 80,  p: 18, c: 0,  f: 0 },
    pork70:       { kcal: 210, p: 12, c: 0,  f: 18 },
    beef80:       { kcal: 130, p: 16, c: 0,  f: 8 }
  },
  lunchCarbWorkout: {
    potato:  { kcal: 280, p: 2,    c: 68,   f: 0 },
    mantou:  { kcal: 330, p: 10,   c: 68,   f: 2 },
    corn:    { kcal: 226, p: 8,    c: 44,   f: 2 },
    rice:    { kcal: 317, p: 7,    c: 70,   f: 1 },
    noodles: { kcal: 338, p: 12,   c: 68,   f: 2 }
  },
  lunchCarbRest: {
    potato:  { kcal: 210,  p: 1.5,  c: 51,   f: 0 },
    mantou:  { kcal: 250,  p: 7.6,  c: 51.6, f: 1.5 },
    corn:    { kcal: 170,  p: 6,    c: 33,   f: 1.5 },
    rice:    { kcal: 228,  p: 5,    c: 50.4, f: 0.7 },
    noodles: { kcal: 256,  p: 9.1,  c: 51.4, f: 1.5 }
  },
  dinnerCarb: {
    potato:  { kcal: 140,  p: 1,    c: 34,   f: 0 },
    mantou:  { kcal: 164,  p: 5,    c: 33.8, f: 1 },
    corn:    { kcal: 113,  p: 4,    c: 22,   f: 1 },
    rice:    { kcal: 152,  p: 3.4,  c: 33.6, f: 0.5 },
    noodles: { kcal: 169,  p: 6,    c: 34,   f: 1 }
  }
};

const DIET_ITEMS = {
  breakfast: {
    oatmeal:  { name: '燕麦 75g',       kcal: 292, p: 8,   c: 45, f: 5 },
    milk:     { name: '全脂牛奶 200ml',  kcal: 120, p: 7,   c: 10, f: 7 },
    eggs:     { name: '全蛋 2个',        kcal: 143, p: 13,  c: 1,  f: 10 },
    peanut:   { name: '花生酱 10g',      kcal: 58,  p: 2.5, c: 3,  f: 5, tag: '高脂肪' }
  },
  morningSnack: {
    maltodextrin: { name: '米糊 60g',     kcal: 230, p: 3, c: 50, f: 1 },
    beetroot:     { name: '甜菜根粉 5g',  kcal: 16,  p: 0, c: 4,  f: 0 }
  },
  lunch: {
    veg:      { name: '绿叶蔬菜 250g',   kcal: 30,  p: 2, c: 5,  f: 0 },
    creatine: { name: '肌酸 5g',         kcal: 0,   p: 0, c: 0,  f: 0 },
    oliveOil: { name: '橄榄油 5g',       kcal: 45,  p: 0, c: 0,  f: 5, tag: '高脂肪' }
  },
  afternoonSnack: {
    nuts: { name: '每日坚果 35g', kcal: 202, p: 6,  c: 7, f: 14, tag: '高脂肪' },
    whey: { name: '蛋白粉 30g',   kcal: 116, p: 24, c: 2, f: 1 }
  },
  dinner: {
    veg: { name: '绿叶蔬菜 250g', kcal: 30, p: 2, c: 5, f: 0 }
  },
  bedtime: {
    whey:    { name: '蛋白粉 30g',     kcal: 116, p: 24, c: 2,  f: 1 },
    milk:    { name: '全脂牛奶 200ml',  kcal: 120, p: 7,  c: 10, f: 7 },
    oatmeal: { name: '燕麦 30g',       kcal: 117, p: 3,  c: 18, f: 1.5 }
  }
};

const DEFAULT_CHECKS = {
  breakfast:      { oatmeal: true, milk: true, eggs: true, peanut: true },
  morningSnack:   { maltodextrin: true, beetroot: true },
  lunch:          { veg: true, creatine: true, oliveOil: true },
  afternoonSnack: { nuts: true, whey: true },
  dinner:         { veg: true },
  bedtime:        { whey: true, milk: true, oatmeal: true }
};

function getDietChecks() {
  const raw = localStorage.getItem('ft_diet_checks');
  if (!raw) return JSON.parse(JSON.stringify(DEFAULT_CHECKS));
  try {
    const saved = JSON.parse(raw);
    const merged = JSON.parse(JSON.stringify(DEFAULT_CHECKS));
    Object.keys(merged).forEach(meal => { if (saved[meal]) Object.assign(merged[meal], saved[meal]); });
    return merged;
  } catch(e) { return JSON.parse(JSON.stringify(DEFAULT_CHECKS)); }
}
function setDietChecks(checks) { localStorage.setItem('ft_diet_checks', JSON.stringify(checks)); }

function getDietTargets() {
  const raw = localStorage.getItem('ft_diet_targets');
  if (!raw) return { kcal: 2600, p: 160, c: 320, f: 70 };
  try { return JSON.parse(raw); } catch(e) { return { kcal: 2600, p: 160, c: 320, f: 70 }; }
}
function setDietTargets(t) { localStorage.setItem('ft_diet_targets', JSON.stringify(t)); }

function openDietTargetModal() {
  const t = getDietTargets();
  document.getElementById('target-kcal').value = t.kcal;
  document.getElementById('target-carb').value = t.c;
  document.getElementById('target-protein').value = t.p;
  document.getElementById('target-fat').value = t.f;
  document.getElementById('diet-target-modal').classList.remove('hidden');
}
function closeDietTargetModal() {
  document.getElementById('diet-target-modal').classList.add('hidden');
}
function saveDietTargets() {
  const kcal = parseInt(document.getElementById('target-kcal').value) || 2600;
  const c = parseInt(document.getElementById('target-carb').value) || 320;
  const p = parseInt(document.getElementById('target-protein').value) || 160;
  const f = parseInt(document.getElementById('target-fat').value) || 70;
  setDietTargets({ kcal, c, p, f });
  updateDietTracking();
  closeDietTargetModal();
}

// ==================== 身体数据与代谢计算 ====================
function getBodyProfile() {
  const raw = localStorage.getItem('ft_body_profile');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch(e) { return null; }
}

function setBodyProfile(profile) {
  localStorage.setItem('ft_body_profile', JSON.stringify(profile));
}

function calculateMetabolism(profile) {
  if (!profile) return null;
  const { gender, age, height, weight, activity, surplus } = profile;
  // Mifflin-St Jeor
  let bmr = gender === 'male'
    ? 10 * weight + 6.25 * height - 5 * age + 5
    : 10 * weight + 6.25 * height - 5 * age - 161;
  const tdee = Math.round(bmr * activity);
  const target = tdee + surplus;
  // 宏量分配（维持/重组期）
  const proteinG = Math.round(weight * 2.3);
  const fatG = Math.round(weight * 0.9);
  const carbG = Math.max(0, Math.round((target - proteinG * 4 - fatG * 9) / 4));
  return { bmr: Math.round(bmr), tdee, target, proteinG, fatG, carbG };
}

function openBodyProfileModal() {
  const p = getBodyProfile();
  if (p) {
    document.getElementById('modal-gender').value = p.gender || 'male';
    document.getElementById('modal-age').value = p.age || '';
    document.getElementById('modal-height').value = p.height || '';
    document.getElementById('modal-weight').value = p.weight || '';
    document.getElementById('modal-activity').value = String(p.activity || 1.55);
    document.getElementById('modal-surplus').value = String(p.surplus || 300);
    showBodyProfileResult(p, 'modal-bp-result');
  } else {
    document.getElementById('modal-gender').value = 'male';
    document.getElementById('modal-age').value = '';
    document.getElementById('modal-height').value = '';
    document.getElementById('modal-weight').value = '';
    document.getElementById('modal-activity').value = '1.55';
    document.getElementById('modal-surplus').value = '300';
    const el = document.getElementById('modal-bp-result');
    if (el) el.classList.add('hidden');
  }
  document.getElementById('body-profile-modal').classList.remove('hidden');
}

function closeBodyProfileModal() {
  document.getElementById('body-profile-modal').classList.add('hidden');
}

function showBodyProfileResult(profile, resultId) {
  const m = calculateMetabolism(profile);
  const el = document.getElementById(resultId);
  if (!el || !m) return;
  el.classList.remove('hidden');
  el.innerHTML = `
    <p><span class="text-gray-400">当前体重:</span> <span class="font-bold text-accent">${profile.weight}</span> kg</p>
    <p><span class="text-gray-400">BMR:</span> <span class="font-bold text-accent">${m.bmr}</span> kcal · <span class="text-gray-400">TDEE:</span> <span class="font-bold text-blue-400">${m.tdee}</span> kcal</p>
    <p><span class="text-gray-400">估算热量:</span> <span class="font-bold text-protein">${m.target}</span> kcal</p>
    <p><span class="text-gray-400">蛋白质:</span> <span class="font-bold text-protein">${m.proteinG}</span>g · <span class="text-gray-400">碳水:</span> <span class="font-bold text-blue-400">${m.carbG}</span>g · <span class="text-gray-400">脂肪:</span> <span class="font-bold text-yellow-400">${m.fatG}</span>g</p>
  `;
}

function saveBodyProfile() {
  const gender = document.getElementById('modal-gender').value;
  const age = parseInt(document.getElementById('modal-age').value) || 0;
  const height = parseInt(document.getElementById('modal-height').value) || 0;
  const weight = parseFloat(document.getElementById('modal-weight').value) || 0;
  const activity = parseFloat(document.getElementById('modal-activity').value) || 1.55;
  const surplus = parseInt(document.getElementById('modal-surplus').value) || 0;
  if (!age || !height || !weight) { alert('请填写完整的身体数据'); return; }
  const profile = { gender, age, height, weight, activity, surplus };
  setBodyProfile(profile);
  showBodyProfileResult(profile, 'modal-bp-result');
  // 同步到配置页（如果可见）
  const cfgGender = document.getElementById('config-gender');
  if (cfgGender) {
    cfgGender.value = gender;
    document.getElementById('config-age').value = age;
    document.getElementById('config-height').value = height;
    document.getElementById('config-weight').value = weight;
    document.getElementById('config-activity').value = String(activity);
    document.getElementById('config-surplus').value = String(surplus);
    showBodyProfileResult(profile, 'config-bp-result');
  }
  // 刷新饮食页热量追踪
  updateCalorieTracker();
  // 刷新统计页代谢信息
  renderMetabolismInfo();
  alert('身体数据已保存');
  closeBodyProfileModal();
}

function saveBodyProfileFromConfig() {
  const gender = document.getElementById('config-gender').value;
  const age = parseInt(document.getElementById('config-age').value) || 0;
  const height = parseInt(document.getElementById('config-height').value) || 0;
  const weight = parseFloat(document.getElementById('config-weight').value) || 0;
  const activity = parseFloat(document.getElementById('config-activity').value) || 1.55;
  const surplus = parseInt(document.getElementById('config-surplus').value) || 0;
  if (!age || !height || !weight) { alert('请填写完整的身体数据'); return; }
  const profile = { gender, age, height, weight, activity, surplus };
  setBodyProfile(profile);
  showBodyProfileResult(profile, 'config-bp-result');
  // 同步到弹窗（如果打开）
  const modalGender = document.getElementById('modal-gender');
  if (modalGender) {
    modalGender.value = gender;
    document.getElementById('modal-age').value = age;
    document.getElementById('modal-height').value = height;
    document.getElementById('modal-weight').value = weight;
    document.getElementById('modal-activity').value = String(activity);
    document.getElementById('modal-surplus').value = String(surplus);
    showBodyProfileResult(profile, 'modal-bp-result');
  }
  updateCalorieTracker();
  renderMetabolismInfo();
  alert('身体数据已保存');
}

function initConfigBodyProfile() {
  const p = getBodyProfile();
  if (!p) return;
  const cg = document.getElementById('config-gender');
  if (!cg) return;
  cg.value = p.gender || 'male';
  document.getElementById('config-age').value = p.age || '';
  document.getElementById('config-height').value = p.height || '';
  document.getElementById('config-weight').value = p.weight || '';
  document.getElementById('config-activity').value = String(p.activity || 1.55);
  document.getElementById('config-surplus').value = String(p.surplus || 300);
  showBodyProfileResult(p, 'config-bp-result');
  // 恢复日报/周报开关
  const autoReportEl = document.getElementById('config-auto-report');
  if (autoReportEl) autoReportEl.checked = getAutoReportSetting();
  const autoWeeklyEl = document.getElementById('config-auto-weekly-report');
  if (autoWeeklyEl) autoWeeklyEl.checked = getAutoWeeklyReportSetting();
}

function calculateDailyMacros() {
  const isRest = S.rest;
  const lpKey = document.getElementById('lunch-protein')?.value || '0';
  const dpKey = document.getElementById('dinner-protein')?.value || '0';
  const lcKey = document.getElementById('lunch-carb')?.value || 'potato';
  const dcKey = document.getElementById('dinner-carb')?.value || 'potato';
  const checks = getDietChecks();

  let kcal = 0, p = 0, c = 0, f = 0;
  function add(food) { kcal += food.kcal; p += food.p; c += food.c; f += food.f; }

  Object.entries(DIET_ITEMS.breakfast).forEach(([key, item]) => {
    if (checks.breakfast[key]) add(item);
  });

  if (!isRest) {
    Object.entries(DIET_ITEMS.morningSnack).forEach(([key, item]) => {
      if (checks.morningSnack[key]) add(item);
    });
  }

  Object.entries(DIET_ITEMS.afternoonSnack).forEach(([key, item]) => {
    if (checks.afternoonSnack[key]) add(item);
  });

  Object.entries(DIET_ITEMS.bedtime).forEach(([key, item]) => {
    if (checks.bedtime[key]) add(item);
  });

  Object.entries(DIET_ITEMS.lunch).forEach(([key, item]) => {
    if (checks.lunch[key]) {
      if (key === 'oliveOil' && isRest) return;
      add(item);
    }
  });

  Object.entries(DIET_ITEMS.dinner).forEach(([key, item]) => {
    if (checks.dinner[key]) add(item);
  });

  if (lpKey !== '0' && FOOD_DB.lunchProtein[lpKey]) add(FOOD_DB.lunchProtein[lpKey]);
  if (dpKey !== '0' && FOOD_DB.dinnerProtein[dpKey]) add(FOOD_DB.dinnerProtein[dpKey]);

  const lunchCarbMap = isRest ? FOOD_DB.lunchCarbRest : FOOD_DB.lunchCarbWorkout;
  if (lunchCarbMap[lcKey]) add(lunchCarbMap[lcKey]);
  if (FOOD_DB.dinnerCarb[dcKey]) add(FOOD_DB.dinnerCarb[dcKey]);

  return { kcal: Math.round(kcal), p: Math.round(p), c: Math.round(c), f: Math.round(f) };
}

function updateMealTotals(checks, isRest) {
  function sumMeal(mealKey) {
    let k = 0, p = 0, c = 0, f = 0;
    const items = DIET_ITEMS[mealKey];
    if (!items) return { kcal: 0, p: 0, c: 0, f: 0 };
    Object.entries(items).forEach(([key, item]) => {
      if (!checks[mealKey] || !checks[mealKey][key]) return;
      if (mealKey === 'lunch' && key === 'oliveOil' && isRest) return;
      k += item.kcal; p += item.p; c += item.c; f += item.f;
    });
    return { kcal: Math.round(k), p: Math.round(p), c: Math.round(c), f: Math.round(f) };
  }

  const bt = sumMeal('breakfast');
  const mt = sumMeal('morningSnack');
  const at = sumMeal('afternoonSnack');
  const lt = sumMeal('lunch');
  const dt = sumMeal('dinner');
  const et = sumMeal('bedtime');

  const lpKey = document.getElementById('lunch-protein')?.value || '0';
  const dpKey = document.getElementById('dinner-protein')?.value || '0';
  const lcKey = document.getElementById('lunch-carb')?.value || 'potato';
  const dcKey = document.getElementById('dinner-carb')?.value || 'potato';

  if (lpKey !== '0' && FOOD_DB.lunchProtein[lpKey]) {
    const item = FOOD_DB.lunchProtein[lpKey];
    lt.kcal += item.kcal; lt.p += item.p; lt.c += item.c; lt.f += item.f;
  }
  if (dpKey !== '0' && FOOD_DB.dinnerProtein[dpKey]) {
    const item = FOOD_DB.dinnerProtein[dpKey];
    dt.kcal += item.kcal; dt.p += item.p; dt.c += item.c; dt.f += item.f;
  }
  const lunchCarbMap = isRest ? FOOD_DB.lunchCarbRest : FOOD_DB.lunchCarbWorkout;
  if (lunchCarbMap[lcKey]) {
    const item = lunchCarbMap[lcKey];
    lt.kcal += item.kcal; lt.p += item.p; lt.c += item.c; lt.f += item.f;
  }
  if (FOOD_DB.dinnerCarb[dcKey]) {
    const item = FOOD_DB.dinnerCarb[dcKey];
    dt.kcal += item.kcal; dt.p += item.p; dt.c += item.c; dt.f += item.f;
  }

  const btEl = document.getElementById('breakfast-total');
  if (btEl) btEl.textContent = `${bt.kcal} kcal`;
  const mtEl = document.getElementById('morning-total');
  if (mtEl) mtEl.textContent = `${mt.kcal} kcal`;
  const atEl = document.getElementById('afternoon-total');
  if (atEl) atEl.textContent = `${at.kcal} kcal`;
  const ltEl = document.getElementById('lunch-total');
  if (ltEl) ltEl.textContent = `${lt.kcal} kcal`;
  const dtEl = document.getElementById('dinner-total');
  if (dtEl) dtEl.textContent = `${dt.kcal} kcal`;
  const etEl = document.getElementById('bedtime-total');
  if (etEl) etEl.textContent = `${et.kcal} kcal`;
}

function updateDietTracking() {
  const macros = calculateDailyMacros();
  const targets = getDietTargets();
  const isRest = S.rest;

  // 收集并保存勾选状态
  const checks = {};
  document.querySelectorAll('#tab-diet input[type="checkbox"][data-meal][data-item]').forEach(cb => {
    const meal = cb.dataset.meal;
    const item = cb.dataset.item;
    if (!checks[meal]) checks[meal] = {};
    checks[meal][item] = cb.checked;
  });
  setDietChecks(checks);

  // 保存下拉选择
  const ls = document.getElementById('lunch-protein');
  const ds = document.getElementById('dinner-protein');
  const lc = document.getElementById('lunch-carb');
  const dc = document.getElementById('dinner-carb');
  if (lc) setCarbChoice('lunch', lc.value);
  if (dc) setCarbChoice('dinner', dc.value);
  if (ls && ds) debounceDiet(ls.value, ds.value);

  // 更新碳水详情显示
  const lunchCarbType = lc ? lc.value : 'potato';
  const dinnerCarbType = dc ? dc.value : 'potato';

  const lunchCarbMap = {
    potato: { name: '带皮土豆', w: isRest ? '300g' : '400g', unit: '生重' },
    mantou: { name: '馒头', w: isRest ? '110g' : '145g', unit: '熟重' },
    corn: { name: '玉米', w: isRest ? '1.5根' : '2根', unit: '带芯生重，约' + (isRest ? '260g' : '350g') },
    rice: { name: '米饭', w: isRest ? '180g' : '250g', unit: '熟重' },
    noodles: { name: '挂面', w: isRest ? '68g' : '90g', unit: '干重' }
  };
  const lcInfo = lunchCarbMap[lunchCarbType] || lunchCarbMap.potato;
  const lunchDetail = document.getElementById('lunch-carb-detail');
  if (lunchDetail) lunchDetail.textContent = lcInfo.name + ' ' + lcInfo.w + '（' + lcInfo.unit + '）';

  const dinnerCarbMap = {
    potato: { name: '带皮土豆', w: '200g', unit: '生重' },
    mantou: { name: '馒头', w: '72g', unit: '熟重' },
    corn: { name: '玉米', w: '1根', unit: '带芯生重，约175g' },
    rice: { name: '米饭', w: '120g', unit: '熟重' },
    noodles: { name: '挂面', w: '45g', unit: '干重' }
  };
  const dcInfo = dinnerCarbMap[dinnerCarbType] || dinnerCarbMap.potato;
  const dinnerDetail = document.getElementById('dinner-carb-detail');
  if (dinnerDetail) dinnerDetail.textContent = dcInfo.name + ' ' + dcInfo.w + '（' + dcInfo.unit + '）';

  // 更新各餐别小计
  updateMealTotals(checks, isRest);

  // 更新主进度条
  const totalEl = document.getElementById('calorie-total');
  if (totalEl) totalEl.textContent = `${macros.kcal} / ${targets.kcal} kcal`;

  const barEl = document.getElementById('calorie-bar');
  if (barEl) barEl.style.width = `${Math.min((macros.kcal / targets.kcal) * 100, 100)}%`;

  const carbEl = document.getElementById('macro-carb');
  if (carbEl) carbEl.textContent = `${macros.c} / ${targets.c}g`;

  const proteinEl = document.getElementById('macro-protein');
  if (proteinEl) proteinEl.textContent = `${macros.p} / ${targets.p}g`;

  const fatEl = document.getElementById('macro-fat');
  if (fatEl) fatEl.textContent = `${macros.f} / ${targets.f}g`;

  // 盈亏状态
  const statusEl = document.getElementById('calorie-status');
  if (statusEl) {
    const diff = macros.kcal - targets.kcal;
    if (macros.kcal < targets.kcal - 200) {
      statusEl.className = 'text-xs text-center py-2 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400';
      statusEl.textContent = `📉 热量赤字过大（${targets.kcal - macros.kcal} kcal），影响训练恢复，建议加餐`;
    } else if (macros.kcal <= targets.kcal + 200) {
      statusEl.className = 'text-xs text-center py-2 rounded-xl bg-accent/10 border border-accent/30 text-accent';
      statusEl.textContent = `✅ 维持期：热量平衡，力量优先（${diff > 0 ? '+' : ''}${diff} kcal）`;
    } else {
      statusEl.className = 'text-xs text-center py-2 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-400';
      statusEl.textContent = `⚠️ 热量盈余（+${diff} kcal），建议取消练前加餐或减碳水`;
    }
  }

  // 智能提示
  const tipsEl = document.getElementById('diet-tips');
  if (tipsEl) {
    const tips = [];
    if (macros.f > targets.f) {
      tips.push(`脂肪已超 ${(macros.f - targets.f).toFixed(1)}g，建议取消花生酱/橄榄油/坚果`);
    }
    if (macros.c < targets.c - 20) {
      tips.push(`碳水偏低 ${Math.round(targets.c - macros.c)}g，训练燃料不足，建议增加土豆/米饭`);
    }
    if (macros.p < targets.p - 10) {
      tips.push(`蛋白质还差 ${Math.round(targets.p - macros.p)}g，建议选鸡胸肉/虾`);
    }
    if (macros.kcal > targets.kcal + 200) {
      tips.push(`热量盈余过高，建议取消练前加餐或减碳水`);
    }
    tipsEl.innerHTML = tips.map(t => `<p class="text-[11px] text-yellow-400 bg-yellow-500/5 border border-yellow-500/20 px-2 py-1 rounded">💡 ${t}</p>`).join('');
  }
}

function updateProtein() {
  updateDietTracking();
}

let dietDebounceTimer = null;
function debounceDiet(lunch, dinner) {
  if (dietDebounceTimer) clearTimeout(dietDebounceTimer);
  dietDebounceTimer = setTimeout(() => {
    dbUpsertDiet(S.today, lunch, dinner).then(data => { if (data) S.diet = data; });
  }, 500);
}

function renderMetabolismInfo() {
  const el = document.getElementById('stats-metabolism-info');
  if (!el) return;
  const bp = getBodyProfile();
  if (!bp) { el.classList.add('hidden'); return; }
  const m = calculateMetabolism(bp);
  if (!m) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  el.innerHTML = `
    <p><span class="text-gray-400">BMR:</span> <span class="text-accent font-bold">${m.bmr}</span> kcal</p>
    <p><span class="text-gray-400">TDEE:</span> <span class="text-blue-400 font-bold">${m.tdee}</span> kcal</p>
    <p><span class="text-gray-400">估算热量:</span> <span class="text-protein font-bold">${m.target}</span> kcal</p>
    <p><span class="text-gray-400">蛋白质:</span> <span class="text-protein font-bold">${m.proteinG}</span>g · <span class="text-gray-400">碳水:</span> <span class="text-blue-400 font-bold">${m.carbG}</span>g · <span class="text-gray-400">脂肪:</span> <span class="text-yellow-400 font-bold">${m.fatG}</span>g</p>
  `;
}


// ==================== 组间休息倒计时 ====================
function initRestTimer() {
  const saved = localStorage.getItem('ft_rest_timer');
  if (saved) {
    try {
      const data = JSON.parse(saved);
      if (data.date === S.today && data.end > Date.now()) {
        restState = { running: true, end: data.end, total: data.total, exercise: data.exercise, setNum: data.setNum || 1, paused: false, remaining: 0 };
        showRestModal();
        updateRestUI();
      } else {
        localStorage.removeItem('ft_rest_timer');
      }
    } catch(e) {}
  }
}

function startRestTimer(seconds, exerciseName, setNum) {
  const end = Date.now() + seconds * 1000;
  restState = { running: true, end, total: seconds, exercise: exerciseName, setNum: setNum || 1, paused: false, remaining: 0 };
  localStorage.setItem('ft_rest_timer', JSON.stringify({ date: S.today, end, total: seconds, exercise: exerciseName, setNum: setNum || 1 }));
  showRestModal();
  updateRestUI();
}

function showRestModal() { document.getElementById('rest-modal').classList.remove('hidden'); }
function hideRestModal() { document.getElementById('rest-modal').classList.add('hidden'); }

function updateRestUI() {
  if (restInterval) clearInterval(restInterval);
  const display = document.getElementById('rest-timer-display');
  const ring = document.getElementById('rest-progress-ring');
  const nameEl = document.getElementById('rest-exercise-name');
  if (!display) return;
  nameEl.textContent = restState.exercise ? `${restState.exercise} · 第${restState.setNum || 1}组 · 组间休息` : '组间休息';

  restInterval = setInterval(() => {
    if (!restState.running) { clearInterval(restInterval); return; }
    if (restState.paused) return;
    const now = Date.now();
    const remaining = Math.max(0, Math.ceil((restState.end - now) / 1000));
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    display.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;

    const pct = restState.total > 0 ? remaining / restState.total : 0;
    const offset = 283 * pct;
    ring.setAttribute('stroke-dashoffset', offset);

    if (remaining <= 0) {
      clearInterval(restInterval);
      restState.running = false;
      localStorage.removeItem('ft_rest_timer');
      sendRestNotification(restState.exercise, restState.setNum);
      playRestEndSound();
      setTimeout(hideRestModal, 2500);
    }
  }, 200);
}

function adjustRest(delta) {
  restState.end += delta * 1000;
  restState.total = Math.max(1, restState.total + delta);
  localStorage.setItem('ft_rest_timer', JSON.stringify({ date: S.today, end: restState.end, total: restState.total, exercise: restState.exercise }));
}

function skipRest() {
  restState.running = false;
  localStorage.removeItem('ft_rest_timer');
  hideRestModal();
}

function toggleRestPause() {
  const btn = document.getElementById('rest-pause-btn');
  if (restState.paused) {
    restState.end = Date.now() + restState.remaining * 1000;
    restState.paused = false;
    btn.textContent = '暂停';
  } else {
    restState.remaining = Math.max(0, Math.ceil((restState.end - Date.now()) / 1000));
    restState.paused = true;
    btn.textContent = '继续';
  }
}

function playRestEndSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch(e) {}
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}

// ==================== 训练 ====================
function parseRepRange(s) {
  if (s.includes('秒') || s.includes('极限')) return { type: 'time' };
  const m = s.match(/(\d+)x(\d+)(?:-(\d+))?/);
  if (!m) return { type: 'time' };
  const min = parseInt(m[2]);
  const max = m[3] ? parseInt(m[3]) : min;
  if (min === max) return { type: 'fixed', value: min };
  return { type: 'range', min, max };
}

function calculateVolume(sets) {
  return sets.reduce((sum, s) => {
    const w = parseFloat(s.weight || 0);
    const r = parseFloat(s.reps || s.seconds || 0);
    return sum + (w * r);
  }, 0);
}

// ==================== 热身数据 ====================
const WARMUPS = {
  '上肢A': [
    { n: '开合跳 / 大风车绕臂', d: '30秒' },
    { n: '猫牛式 (Cat-Cow)', d: '15次' },
    { n: '弹力带肩环绕（极宽握距）', d: '15次' },
    { n: '弹力带肩环绕（缩窄一拳）', d: '15次' },
    { n: '空手推拉模拟', d: '15次' },
  ],
  '上肢B': [
    { n: '开合跳 / 大风车绕臂', d: '30秒' },
    { n: '猫牛式 (Cat-Cow)', d: '15次' },
    { n: '弹力带肩环绕（极宽握距）', d: '15次' },
    { n: '弹力带肩环绕（缩窄一拳）', d: '15次' },
    { n: '空手推拉模拟', d: '15次' },
  ],
  '下肢B': [
    { n: '世界第一拉伸', d: '每侧 5次' },
    { n: '自重臀桥 (Glute Bridge)', d: '2组 x 15次' },
    { n: '脚踝背屈拉伸', d: '每侧 30秒' },
  ],
  '下肢A': [
    { n: '世界第一拉伸', d: '每侧 5次' },
    { n: '自重臀桥 (Glute Bridge)', d: '2组 x 15次' },
    { n: '脚踝背屈拉伸', d: '每侧 30秒' },
  ],
};

// ==================== 训练会话状态 ====================
let trainingSession = { started: false, startTime: 0, phase: 'idle' };
let trainingTimerInterval = null;

function initTrainingSession() {
  const raw = localStorage.getItem('ft_training_session');
  if (raw) {
    try {
      const data = JSON.parse(raw);
      if (data.date === S.today && data.started) {
        trainingSession = data;
        if (trainingSession.phase !== 'done') startTrainingTimer();
      }
    } catch(e) {}
  }
}

function saveTrainingSession() {
  localStorage.setItem('ft_training_session', JSON.stringify({ ...trainingSession, date: S.today }));
}

function getWarmupState() {
  const raw = localStorage.getItem('ft_warmup_' + S.today);
  return raw ? JSON.parse(raw) : {};
}

function setWarmupState(dayName, idx, checked) {
  const state = getWarmupState();
  if (!state[dayName]) state[dayName] = [];
  state[dayName][idx] = checked;
  localStorage.setItem('ft_warmup_' + S.today, JSON.stringify(state));
}

function updateTrainingTimerDisplay() {
  const el = document.getElementById('training-timer');
  if (!el || !trainingSession.started) return;
  const sec = Math.floor((Date.now() - trainingSession.startTime) / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const parts = [];
  if (h > 0) parts.push(String(h).padStart(2, '0'));
  parts.push(String(m).padStart(2, '0'));
  parts.push(String(s).padStart(2, '0'));
  el.textContent = '本次训练已进行 ' + parts.join(':');
}

function startTrainingTimer() {
  if (trainingTimerInterval) clearInterval(trainingTimerInterval);
  trainingTimerInterval = setInterval(updateTrainingTimerDisplay, 1000);
}

function stopTrainingTimer() {
  if (trainingTimerInterval) clearInterval(trainingTimerInterval);
  trainingTimerInterval = null;
}

// ==================== 浏览器通知 ====================
async function requestNotificationPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}

function sendRestNotification(exerciseName, setNum) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible') return;
  const notif = new Notification('组间休息结束', {
    body: exerciseName + ' 第' + setNum + '组休息完成，准备下一组！',
    tag: 'rest-end-' + Date.now()
  });
  notif.onclick = () => { window.focus(); notif.close(); };
}

// ==================== 历史查询 ====================
async function getExerciseHistorySessions(exName, limit = 8) {
  const all = await dbGetAllWorkouts();
  const today = S.today;
  const sessions = [...all]
    .filter(w => w.date !== today && w.exercises && w.exercises[exName] && w.exercises[exName].sets && w.exercises[exName].sets.some(s => s.done && parseFloat(s.weight) > 0))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-limit)
    .map(w => {
      const exData = w.exercises[exName];
      const doneSets = exData.sets.filter(s => s.done && parseFloat(s.weight) > 0);
      const bestWeight = Math.max(...doneSets.map(s => parseFloat(s.weight)));
      return { date: w.date, bestWeight, feeling: exData.feeling || '' };
    });
  return sessions;
}

async function getPreviousExerciseSession(exName) {
  const all = await dbGetAllWorkouts();
  const today = S.today;
  const sorted = [...all].sort((a, b) => b.date.localeCompare(a.date));
  for (const w of sorted) {
    if (w.date === today) continue;
    if (w.exercises && w.exercises[exName] && w.exercises[exName].sets && w.exercises[exName].sets.length > 0) {
      return { date: w.date, ...w.exercises[exName] };
    }
  }
  return null;
}

function getOverloadTip(ex, lastSession) {
  if (!lastSession) return '';
  const ld = lastSession;
  const doneSets = (ld.sets || []).filter(s => s.done);
  const allDone = doneSets.length >= ex.sets;
  if (ex.type === 'carry') {
    const maxSec = doneSets.length ? Math.max(...doneSets.map(s => parseFloat(s.seconds || 0))) : 0;
    if (maxSec > 0) return '上次最长走了 ' + maxSec + ' 秒，尝试突破更久或换更重的哑铃';
    return '首次执行，走到握力力竭为止，记录秒数';
  }
  if (ex.cat === 'main') {
    if (allDone && ld.feeling === 'easy') return '上次轻松做满，建议加重 2.5kg';
    if (allDone && ld.feeling === 'normal') return '上次顺利做满，建议尝试加重 2.5kg';
    return '先维持当前重量，确保5组全部完成';
  }
  const rr = parseRepRange(ex.s);
  if (rr.type === 'range') {
    const avgReps = doneSets.length ? doneSets.reduce((s, set) => s + (parseFloat(set.reps) || 0), 0) / doneSets.length : 0;
    if (avgReps >= rr.max && ld.feeling !== 'hard') return '次数已推满，建议加重';
    return '先在本重量下把次数推满至 ' + rr.max + ' 次';
  }
  return '';
}

// ==================== 训练控制 ====================
async function startTraining() {
  if (currentTimer.running) {
    const now = Date.now();
    pendingSession = {
      startTime: new Date(currentTimer.startTime).toISOString(),
      endTime: new Date(now).toISOString(),
      duration: Math.round((now - currentTimer.startTime) / 60000),
      category: currentTimer.category,
      subCategory: currentTimer.subCategory,
      note: currentTimer.note,
      feeling: ''
    };
    currentTimer = { running: false, startTime: 0, category: '', subCategory: '', note: '' };
    saveCurrentTimer();
    pendingTrainingStart = true;
    showTimerFeelingModal();
    renderSchedule();
    updateHeaderTotal();
    return;
  }
  await doStartTraining();
}

async function doStartTraining() {
  await requestNotificationPermission();
  trainingSession = { started: true, startTime: Date.now(), phase: 'warmup' };
  saveTrainingSession();
  startTrainingTimer();
  await renderWorkout();
}

async function endTraining() {
  stopTrainingTimer();
  const endTime = Date.now();
  const durationMin = Math.round((endTime - trainingSession.startTime) / 60000);
  const sessionStart = trainingSession.startTime;
  trainingSession = { started: false, startTime: 0, phase: 'done' };
  saveTrainingSession();

  const saved = S.workout?.exercises || {};
  saved._session = {
    duration: durationMin,
    startTime: new Date(sessionStart).toISOString(),
    endTime: new Date(endTime).toISOString()
  };
  const info = CYCLE[(S.day - 1) % 7];
  S.workout = await dbUpsertWorkout(S.today, S.day, info.name, saved);

  // 准备训练日程记录，等待用户输入感受
  pendingTrainingRecord = {
    startTime: new Date(sessionStart).toISOString(),
    endTime: new Date(endTime).toISOString(),
    duration: durationMin,
    category: 'workout',
    subCategory: '',
    note: '',
    feeling: ''
  };
  showTrainingFeelingModal();
}

function finishWarmup() {
  trainingSession.phase = 'training';
  saveTrainingSession();
  renderWorkout();
}

function toggleWarmup(idx) {
  const info = CYCLE[(S.day - 1) % 7];
  const checked = !!document.getElementById('warmup-' + idx)?.checked;
  setWarmupState(info.name, idx, checked);
}

// ==================== 逐组完成 ====================
async function toggleSetDone(exName, setIdx, done) {
  const saved = S.workout?.exercises || {};
  if (!saved[exName]) saved[exName] = { sets: [], notes: '', feeling: '' };
  if (!saved[exName].sets) saved[exName].sets = [];
  if (!saved[exName].sets[setIdx]) saved[exName].sets[setIdx] = { set: setIdx+1, weight: '', reps: '', seconds: undefined, done: false };

  saved[exName].sets[setIdx].done = done;

  const info = CYCLE[(S.day - 1) % 7];
  const plan = PLANS[info.name] || [];
  const ex = plan.find(e => e.n === exName);
  let restSec = 90;
  if (ex) {
    if (ex.type === 'carry') restSec = 60;
    else if (ex.cat === 'main') restSec = ex.n.includes('深蹲') ? 180 : 150;
    else if (ex.cat === 'accessory') restSec = ex.s === '4x8-10' ? 120 : 90;
    else if (ex.cat === 'small') restSec = 60;
    // 侧平举超级组不休息
    if (ex.n === '侧平举') restSec = 0;
    const rr = parseRepRange(ex.s);
    if (rr.type === 'time' && ex.type !== 'carry') restSec = 0;
  }

  if (done && restSec > 0) startRestTimer(restSec, exName, setIdx + 1);
  saveWorkoutDebounced(saved);
  await renderWorkout();

  // 动作全部完成后自动弹出感受选择
  if (done && ex) {
    const allSetsDone = saved[exName].sets.length >= ex.sets && saved[exName].sets.every(s => s.done);
    if (allSetsDone && !saved[exName].feeling) {
      setTimeout(() => showExerciseFeelingModal(exName), 400);
    }
  }
  if (done) checkAllSetsComplete();
}

function checkAllSetsComplete() {
  const info = CYCLE[(S.day - 1) % 7];
  const plan = PLANS[info.name] || [];
  const saved = S.workout?.exercises || {};
  let allDone = true;
  plan.forEach(ex => {
    const ed = saved[ex.n] || { sets: [] };
    const sets = ed.sets || [];
    if (sets.length < ex.sets) { allDone = false; return; }
    sets.forEach(s => { if (!s.done) allDone = false; });
  });
  if (allDone) {
    setTimeout(() => {
      if (confirm('所有动作已完成！是否结束训练并查看总结？')) endTraining();
    }, 400);
  }
}

// ==================== 训练总结 ====================
async function showTrainingSummary() {
  const modal = document.getElementById('training-summary-modal');
  const info = CYCLE[(S.day - 1) % 7];
  const plan = PLANS[info.name] || [];
  const saved = S.workout?.exercises || {};

  // Duration
  const sessionData = saved._session || {};
  const durationMin = sessionData.duration || 0;
  const durationStr = durationMin >= 60 ? Math.floor(durationMin/60) + '小时' + (durationMin%60) + '分' : durationMin + '分';
  document.getElementById('summary-duration').textContent = durationStr;
  document.getElementById('summary-date').textContent = S.today + ' · ' + info.name;

  // Volume & exercises
  let totalVol = 0;
  let exHtml = '';
  const feelingCounts = { easy: 0, normal: 0, hard: 0 };

  plan.forEach(ex => {
    const ed = saved[ex.n] || { sets: [], feeling: '' };
    const sets = ed.sets || [];
    const doneCount = sets.filter(s => s.done).length;
    const vol = calculateVolume(sets);
    totalVol += vol;
    const statusColor = doneCount >= ex.sets ? 'text-accent' : (doneCount > 0 ? 'text-yellow-400' : 'text-gray-500');
    const statusText = doneCount >= ex.sets ? '已完成' : doneCount + '/' + ex.sets;
    if (ed.feeling) feelingCounts[ed.feeling] = (feelingCounts[ed.feeling] || 0) + 1;
    let volText = '';
    if (ex.type === 'carry') {
      const totalSec = sets.reduce((s, set) => s + (parseFloat(set.seconds || 0)), 0);
      volText = Math.round(totalSec) + '秒';
    } else {
      volText = Math.round(vol) + 'kg';
    }
    exHtml += '<div class="flex items-center justify-between bg-dark-700/30 rounded-lg p-2">' +
      '<span class="text-xs text-gray-300">' + ex.n + '</span>' +
      '<span class="text-xs ' + statusColor + ' font-medium">' + statusText + ' · ' + volText + '</span></div>';
  });

  document.getElementById('summary-volume').textContent = Math.round(totalVol).toLocaleString() + 'kg';
  document.getElementById('summary-exercises').innerHTML = exHtml;
  document.getElementById('summary-feelings').innerHTML =
    '<span class="text-green-400">😊 轻松: ' + feelingCounts.easy + '</span>' +
    '<span class="text-yellow-400">😐 一般: ' + feelingCounts.normal + '</span>' +
    '<span class="text-red-400">😰 困难: ' + feelingCounts.hard + '</span>';

  modal.classList.remove('hidden');
}

function closeTrainingSummary() {
  document.getElementById('training-summary-modal').classList.add('hidden');
}

// ==================== 训练感受 ====================
function showTrainingFeelingModal() {
  document.getElementById('training-feeling-modal').classList.remove('hidden');
  document.getElementById('training-feeling-input').value = '';
}

function closeTrainingFeelingModal() {
  document.getElementById('training-feeling-modal').classList.add('hidden');
}

async function saveTrainingFeeling() {
  if (!pendingTrainingRecord) return;
  const feeling = document.getElementById('training-feeling-input').value || '';
  pendingTrainingRecord.note = feeling;
  pendingTrainingRecord.feeling = feeling;
  const saved = S.checkin?.schedule_data || {};
  if (!saved.sessions) saved.sessions = [];
  saved.sessions.push(pendingTrainingRecord);
  S.checkin = await dbUpsertCheckin(S.today, saved);
  pendingTrainingRecord = null;
  closeTrainingFeelingModal();
  renderSchedule();
  updateHeaderTotal();
  showTrainingSummary();
}

async function skipTrainingFeeling() {
  if (!pendingTrainingRecord) return;
  const saved = S.checkin?.schedule_data || {};
  if (!saved.sessions) saved.sessions = [];
  saved.sessions.push(pendingTrainingRecord);
  S.checkin = await dbUpsertCheckin(S.today, saved);
  pendingTrainingRecord = null;
  closeTrainingFeelingModal();
  renderSchedule();
  updateHeaderTotal();
  showTrainingSummary();
}

// ==================== 渲染 ====================
async function renderWorkout() {
  const c = document.getElementById('workout-container');
  if (S.rest) {
    c.innerHTML = '<div class="glass glass-hover rounded-xl p-8 text-center"><p class="text-4xl mb-2">😴</p><p class="text-gray-400">今日休息日，无需训练</p><p class="text-xs text-gray-500 mt-2">好好备考，享受生活</p></div>';
    return;
  }

  const info = CYCLE[(S.day - 1) % 7];
  const plan = PLANS[info.name] || [];
  const saved = S.workout?.exercises || {};
  const phase = trainingSession.phase;
  const started = trainingSession.started;

  let html = '<div class="glass glass-hover rounded-xl p-4">' +
    '<div class="flex items-center justify-between mb-3">' +
    '<h3 class="font-medium text-sm">🏋️ ' + info.name + '</h3>' +
    '<span id="training-timer" class="text-sm font-mono font-bold text-accent">' + (started ? '本次训练已进行 00:00:00' : '未开始') + '</span></div>';

  if (!started) {
    html += '<button onclick="startTraining()" class="w-full bg-accent hover:bg-accent-dark text-white font-semibold py-3 rounded-xl transition mb-3 shadow-lg shadow-accent/20">🏋️ 开始训练</button>';
  } else {
    html += '<button onclick="endTraining()" class="w-full bg-danger hover:bg-danger-dark text-white font-semibold py-3 rounded-xl transition mb-3 shadow-lg shadow-danger/20">✅ 结束训练</button>';
  }

  if (phase === 'warmup') {
    const warmupItems = WARMUPS[info.name] || [];
    const wState = getWarmupState()[info.name] || [];
    html += '<div class="mb-2"><h4 class="text-xs text-gray-400 mb-2 uppercase tracking-wider">🔥 热身阶段</h4><div class="space-y-2 mb-3">';
    warmupItems.forEach((item, idx) => {
      const checked = wState[idx] ? 'checked' : '';
      html += '<div class="flex items-center gap-3 p-3 bg-dark-700/40 rounded-xl">' +
        '<input type="checkbox" class="checkbox-custom" id="warmup-' + idx + '" ' + checked + ' onchange="toggleWarmup(' + idx + ')">' +
        '<label for="warmup-' + idx + '" class="flex-1 cursor-pointer select-none flex justify-between">' +
        '<span class="text-sm ' + (wState[idx] ? 'text-gray-500 line-through' : 'text-gray-300') + '">' + item.n + '</span>' +
        '<span class="text-xs text-gray-500">' + item.d + '</span></label></div>';
    });
    html += '</div>' +
      '<button onclick="finishWarmup()" class="w-full bg-accent/20 border border-accent/30 text-accent font-medium py-2.5 rounded-xl transition hover:bg-accent/30">✅ 完成热身，进入正式训练</button>' +
      '</div>';
  }

  if (phase === 'training' || phase === 'done') {
    const allWorkouts = await dbGetAllWorkouts();

    html += '<div class="space-y-4">';
    plan.forEach((ex) => {
      const exKey = ex.n;
      const ed = saved[exKey] || { sets: [], notes: '', feeling: '' };
      let sets = ed.sets || [];
      const lastSession = (() => {
        const sorted = [...allWorkouts].sort((a, b) => b.date.localeCompare(a.date));
        for (const w of sorted) {
          if (w.date === S.today) continue;
          if (w.exercises && w.exercises[ex.n] && w.exercises[ex.n].sets && w.exercises[ex.n].sets.length > 0) {
            return { date: w.date, ...w.exercises[ex.n] };
          }
        }
        return null;
      })();
      const tip = getOverloadTip(ex, lastSession);

      const repInfo = parseRepRange(ex.s);
      // 固定组数：初始化/补齐/截断
      if (ex.sets) {
        if (!sets.length) {
          if (repInfo.type === 'time') {
            sets = Array.from({length: ex.sets}, (_, i) => ({set: i+1, weight: '', seconds: '', done: false}));
          } else if (repInfo.type === 'fixed') {
            sets = Array.from({length: ex.sets}, (_, i) => ({set: i+1, weight: '', reps: String(repInfo.value), done: false}));
          } else {
            sets = Array.from({length: ex.sets}, (_, i) => ({set: i+1, weight: '', reps: '', done: false}));
          }
          if (lastSession && lastSession.sets) {
            lastSession.sets.forEach((ls, i) => {
              if (i < sets.length) {
                sets[i].weight = ls.weight || '';
                if (repInfo.type === 'time') sets[i].seconds = ls.seconds || '';
                else if (repInfo.type !== 'fixed') sets[i].reps = ls.reps || '';
              }
            });
          }
        } else if (sets.length < ex.sets) {
          for (let i = sets.length; i < ex.sets; i++) {
            sets.push({set: i+1, weight: '', reps: repInfo.type === 'fixed' ? String(repInfo.value) : '', seconds: '', done: false});
          }
        } else if (sets.length > ex.sets) {
          sets = sets.slice(0, ex.sets);
          ed.sets = sets;
        }
      }

      let tipHtml = '';
      if (tip) {
        tipHtml = '<div class="text-[11px] text-accent mb-2"><span class="bg-accent/10 px-1.5 py-0.5 rounded border border-accent/20">' + tip + '</span></div>';
      }

      let feelingBadgeHtml = '';
      if (lastSession && lastSession.feeling) {
        const fColors = { easy: 'text-green-400 bg-green-500/10 border-green-500/20', normal: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20', hard: 'text-red-400 bg-red-500/10 border-red-500/20' };
        const fLabels = { easy: '😊 轻松', normal: '😐 一般', hard: '😰 困难' };
        feelingBadgeHtml = '<div class="mb-2"><span class="text-xs px-2 py-0.5 rounded border ' + (fColors[lastSession.feeling] || '') + '">' + (fLabels[lastSession.feeling] || '') + '</span></div>';
      }

      const hist = getExerciseHistory(ex.n);
      let prevNotesHtml = '';
      if (hist?.notes) {
        prevNotesHtml = '<div class="text-[11px] text-gray-400 mb-2 bg-dark-700/40 p-2 rounded-lg border border-white/5">💬 上次备注: ' + hist.notes + '</div>';
      }

      const tipText = ex.tip ? '<p class="text-xs text-gray-400 mt-1 mb-2 leading-relaxed">📌 ' + ex.tip + '</p>' : '';
      let supersetHtml = '';
      if (ex.superset === 'next') {
        supersetHtml = '<p class="text-[11px] text-accent mt-2">⚡ 超级组执行：做完本组后不休息，立刻进入后束飞鸟同组数</p>';
      } else if (ex.superset === 'rest') {
        supersetHtml = '<p class="text-[11px] text-accent mt-2">⚡ 超级组执行：本组完成后，开始60秒组间休息</p>';
      }

      const allSetsDone = sets.length >= ex.sets && sets.every(s => s.done);
      let feelingStateHtml = '';
      if (allSetsDone && !ed.feeling) {
        feelingStateHtml = '<div class="mt-2 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-center cursor-pointer" onclick="showExerciseFeelingModal(\'' + ex.n + '\')"><span class="text-xs text-yellow-400">⚠️ 动作已完成，请点击选择本次感受</span></div>';
      } else if (ed.feeling) {
        const fColors = { easy: 'text-green-400 bg-green-500/10 border-green-500/20', normal: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20', hard: 'text-red-400 bg-red-500/10 border-red-500/20' };
        const fLabels = { easy: '😊 轻松', normal: '😐 一般', hard: '😰 困难' };
        feelingStateHtml = '<div class="mt-2"><span class="text-xs px-2 py-0.5 rounded border ' + (fColors[ed.feeling] || '') + '">' + (fLabels[ed.feeling] || '') + '</span></div>';
      }

      const repPart = ex.s.replace(/^(\d+)(组|x)/, '');
      const restText = ex.sets <= 1 ? '无' : ex.rest + '秒';
      const paramLine = ex.sets + '组 x ' + repPart + ' | 组间休息：' + restText;
      html += '<div class="p-3 bg-dark-700/40 rounded-xl">' +
        '<div class="flex justify-between items-start mb-1"><div>' +
        '<span class="text-sm font-medium cursor-pointer hover:text-accent" onclick="showExerciseChart(\'' + ex.n + '\')">' + ex.n + '</span>' +
        '<span class="text-xs text-gray-500 ml-2">' + paramLine + '</span></div></div>' +
        tipText + feelingBadgeHtml + tipHtml + prevNotesHtml +
        '<div class="space-y-1.5 mb-2">';

      sets.forEach((set, sidx) => {
        const doneCls = set.done ? 'opacity-50' : '';
        let repsHtml = '';
        if (repInfo.type === 'fixed') {
          repsHtml = '<span class="text-xs text-gray-400 w-10 text-center">' + repInfo.value + '</span>';
        } else if (repInfo.type === 'range') {
          const options = [];
          for (let r = repInfo.min; r <= repInfo.max; r++) {
            options.push('<option value="' + r + '" ' + (set.reps == r ? 'selected' : '') + '>' + r + '</option>');
          }
          repsHtml = '<select onchange="updateSet(\'' + ex.n + '\', ' + sidx + ', \'reps\', this.value)" class="w-16 bg-dark-700 border border-dark-600 rounded-lg px-1 py-1.5 focus:border-accent focus:outline-none appearance-none text-center text-xs">' + options.join('') + '</select>';
        } else if (repInfo.type === 'time') {
          repsHtml = '<input type="number" placeholder="秒" value="' + (set.seconds || '') + '" onchange="updateSet(\'' + ex.n + '\', ' + sidx + ', \'seconds\', this.value)" class="w-16 bg-dark-700 border border-dark-600 rounded-lg px-2 py-1.5 text-center focus:border-accent focus:outline-none text-xs">';
        }

        if (ex.type === 'carry') {
          // 农夫行走：重量 + 秒数
          html += '<div class="flex items-center gap-2 text-xs ' + doneCls + '">' +
            '<span class="w-10 text-gray-500 shrink-0">第' + set.set + '组</span>' +
            '<input type="number" placeholder="kg" value="' + (set.weight || '') + '" onchange="updateSet(\'' + ex.n + '\', ' + sidx + ', \'weight\', this.value)" class="w-16 bg-dark-700 border border-dark-600 rounded-lg px-2 py-1.5 text-center focus:border-accent focus:outline-none text-xs" ' + (set.done ? 'disabled' : '') + '>' +
            '<span class="text-gray-500">×</span>' +
            '<input type="number" placeholder="30-40" value="' + (set.seconds || '') + '" onchange="updateSet(\'' + ex.n + '\', ' + sidx + ', \'seconds\', this.value)" class="w-16 bg-dark-700 border border-dark-600 rounded-lg px-2 py-1.5 text-center focus:border-accent focus:outline-none text-xs" ' + (set.done ? 'disabled' : '') + '>' +
            '<span class="text-[10px] text-gray-500 shrink-0">秒</span>' +
            '<label class="flex items-center gap-1 cursor-pointer ml-auto shrink-0">' +
            '<input type="checkbox" ' + (set.done ? 'checked' : '') + ' onchange="toggleSetDone(\'' + ex.n + '\', ' + sidx + ', this.checked)" class="checkbox-custom w-4 h-4">' +
            '<span class="text-[10px] text-gray-400">完成</span>' +
            '</label>' +
            '</div>';
        } else {
          html += '<div class="flex items-center gap-2 text-xs ' + doneCls + '">' +
            '<span class="w-10 text-gray-500 shrink-0">第' + set.set + '组</span>' +
            '<input type="number" placeholder="kg" value="' + set.weight + '" onchange="updateSet(\'' + ex.n + '\', ' + sidx + ', \'weight\', this.value)" class="w-16 bg-dark-700 border border-dark-600 rounded-lg px-2 py-1.5 text-center focus:border-accent focus:outline-none" ' + (set.done ? 'disabled' : '') + '>' +
            '<span class="text-gray-500">×</span>' + repsHtml +
            '<label class="flex items-center gap-1 cursor-pointer ml-auto shrink-0">' +
            '<input type="checkbox" ' + (set.done ? 'checked' : '') + ' onchange="toggleSetDone(\'' + ex.n + '\', ' + sidx + ', this.checked)" class="checkbox-custom w-4 h-4">' +
            '<span class="text-[10px] text-gray-400">完成</span>' +
            '</label>' +
            '</div>';
        }
      });

      const vol = calculateVolume(sets);
      let volHtml = '';
      if (ex.type === 'carry') {
        const totalSec = sets.reduce((s, set) => s + (parseFloat(set.seconds || 0)), 0);
        volHtml = '<span class="text-xs font-bold text-accent">总秒数: ' + Math.round(totalSec) + '秒</span>';
      } else {
        volHtml = '<span class="text-xs font-bold text-accent">总容量: ' + Math.round(vol) + 'kg</span>';
      }
      const notesPlaceholder = ex.type === 'carry' ? '记录动作备注：哑铃重量？握力感受？身体是否侧倾？' : '记录动作备注：握距是否舒适？是否需要调整？';
      html += '</div>' +
        '<div class="flex items-center justify-between mb-2">' + volHtml + '</div>' +
        feelingStateHtml + supersetHtml +
        '<div class="bg-dark-700/30 rounded-lg p-2.5 border border-white/5 mt-2">' +
        '<textarea placeholder="' + notesPlaceholder + '" onchange="updateSet(\'' + ex.n + '\', -1, \'notes\', this.value)" class="w-full bg-transparent text-xs text-gray-300 placeholder-gray-500 resize-none focus:outline-none" rows="2">' + (ed.notes || '') + '</textarea>' +
        '</div></div>';
    });
    html += '</div>';
  }

  html += '</div>';
  c.innerHTML = html;
  if (trainingSession.started) updateTrainingTimerDisplay();
}

function updateSet(exName, setIdx, field, value) {
  const saved = S.workout?.exercises || {};
  if (!saved[exName]) saved[exName] = { sets: [], notes: '', feeling: '' };
  if (field === 'notes') {
    saved[exName].notes = value;
  } else {
    // 限制组数为训练计划固定数量
    const info = CYCLE[(S.day - 1) % 7];
    const plan = PLANS[info.name] || [];
    const ex = plan.find(e => e.n === exName);
    const maxSets = ex ? ex.sets : (saved[exName].sets?.length || 0);
    if (setIdx >= maxSets) { console.warn('[updateSet] setIdx out of range:', setIdx, maxSets); return; }
    if (!saved[exName].sets) saved[exName].sets = [];
    if (!saved[exName].sets[setIdx]) saved[exName].sets[setIdx] = { set: setIdx+1, weight: '', reps: '', done: false };
    saved[exName].sets[setIdx][field] = value;
  }
  saveWorkoutDebounced(saved);
  if (field !== 'notes') renderWorkout();
}

function setFeeling(exName, feeling) {
  const saved = S.workout?.exercises || {};
  if (!saved[exName]) saved[exName] = { sets: [], notes: '', feeling: '' };
  saved[exName].feeling = feeling;
  saveWorkoutDebounced(saved);
  renderWorkout();
}

let woSaveT = null;
function saveWorkoutDebounced(exercises) {
  clearTimeout(woSaveT);
  woSaveT = setTimeout(async () => {
    Object.entries(exercises).forEach(([name, data]) => {
      if (name === '_session') return;
      if (data.sets && data.sets.length) {
        const doneSets = data.sets.filter(s => s.done && (parseFloat(s.weight || 0) > 0 || parseFloat(s.seconds || 0) > 0) && (parseFloat(s.reps || s.seconds || 0) > 0));
        if (doneSets.length) {
          const best = doneSets.reduce((a, b) => {
            const av = parseFloat(a.weight||0) * parseFloat(a.reps||a.seconds||0);
            const bv = parseFloat(b.weight||0) * parseFloat(b.reps||b.seconds||0);
            if (av === 0 && bv === 0) {
              return parseFloat(a.seconds||0) > parseFloat(b.seconds||0) ? a : b;
            }
            return av > bv ? a : b;
          });
          setExerciseHistory(name, {
            date: S.today, weight: best.weight, reps: best.reps || best.seconds, notes: data.notes || '', feeling: data.feeling || ''
          });
        }
      }
      data.totalVolume = calculateVolume(data.sets || []);
    });
    const info = CYCLE[(S.day - 1) % 7];
    S.workout = await dbUpsertWorkout(S.today, S.day, info.name, exercises);
    await refreshWeek();
    if (S.tab === 'stats') renderStats();
  }, 800);
}

async function showExerciseChart(exName) {
  const sessions = await getExerciseHistorySessions(exName, 8);
  document.getElementById('ex-chart-title').textContent = exName + ' · 动作历史';
  document.getElementById('ex-chart-modal').classList.remove('hidden');
  drawExerciseChart('exercise-chart-canvas', sessions);
}

function closeExerciseChartModal() {
  document.getElementById('ex-chart-modal').classList.add('hidden');
}

let pendingFeelingExName = '';

function showExerciseFeelingModal(exName) {
  pendingFeelingExName = exName;
  document.getElementById('ex-feeling-title').textContent = exName + ' · 本次感受';
  document.getElementById('exercise-feeling-modal').classList.remove('hidden');
}

function closeExerciseFeelingModal() {
  document.getElementById('exercise-feeling-modal').classList.add('hidden');
  pendingFeelingExName = '';
}

function selectExerciseFeeling(feeling) {
  if (!pendingFeelingExName) return;
  setFeeling(pendingFeelingExName, feeling);
  closeExerciseFeelingModal();
}

function resizeCanvas(cv) {
  const dpr = window.devicePixelRatio || 1;
  const rect = cv.getBoundingClientRect();
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);
  if (cv.width !== w || cv.height !== h) {
    cv.width = w;
    cv.height = h;
  }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { width: rect.width, height: rect.height };
}

function drawExerciseChart(canvasId, sessions) {
  const cv = document.getElementById(canvasId);
  if (!cv) return;
  const { width, height } = resizeCanvas(cv);
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  if (!sessions || sessions.length < 2) {
    ctx.fillStyle = '#64748b'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('数据不足，至少需要2次记录', width / 2, height / 2);
    return;
  }
  const pad = { t: 20, r: 10, b: 30, l: 35 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const labels = sessions.map(s => {
    const d = new Date(s.date + 'T00:00:00');
    return (d.getMonth() + 1) + '/' + d.getDate();
  });
  const vals = sessions.map(s => s.bestWeight);
  const maxV = Math.max(...vals, 1);
  const minV = Math.min(...vals);
  const range = maxV - minV || 1;

  ctx.strokeStyle = '#2d3748'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + (h / 4) * i;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + w, y); ctx.stroke();
    ctx.fillStyle = '#64748b'; ctx.font = '9px sans-serif'; ctx.textAlign = 'right';
    ctx.fillText((maxV - (range / 4) * i).toFixed(1), pad.l - 6, y + 3);
  }
  const stepX = w / (sessions.length - 1);
  ctx.strokeStyle = '#10b981'; ctx.lineWidth = 2.5; ctx.beginPath();
  sessions.forEach((s, i) => {
    const x = pad.l + stepX * i;
    const y = pad.t + ((maxV - s.bestWeight) / range) * h;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
  sessions.forEach((s, i) => {
    const x = pad.l + stepX * i;
    const y = pad.t + ((maxV - s.bestWeight) / range) * h;
    let color = '#10b981';
    if (s.feeling === 'hard') color = '#ef4444';
    else if (s.feeling === 'normal') color = '#f59e0b';
    else if (s.feeling === 'easy') color = '#10b981';
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
  });
  labels.forEach((lab, i) => {
    if (i % Math.ceil(labels.length / 6) !== 0 && i !== labels.length - 1) return;
    ctx.fillStyle = '#94a3b8'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(lab, pad.l + stepX * i, height - 8);
  });
}
function isCycleDay1WithoutWeight() {
  if (S.day !== 1) return false;
  const seen = localStorage.getItem('ft_weekly_body_seen_' + S.today);
  if (seen) return false;
  return !S.weights.some(w => w.date === S.today);
}

// ==================== 体重 ====================
function renderWeight() {
  const el = document.getElementById('stats-weight-input-section');
  if (el) el.classList.remove('hidden');
  drawWeightChart();
  renderWaistInfo();
}
async function saveWeight() {
  const v = parseFloat(document.getElementById('weight-input').value);
  if (!v || v <= 0) { alert('请输入有效体重'); return; }
  await dbAddWeightLog(S.today, v);
  S.weights = await dbGetWeightLogs(56);
  document.getElementById('weight-input').value = '';
  const hint = document.getElementById('weight-save-hint');
  if (hint) { hint.classList.remove('hidden'); setTimeout(() => hint.classList.add('hidden'), 2000); }
  drawWeightChart();
  if (S.weights.length >= 2) {
    drawBodyLineChart('body-weight-chart', S.weights.slice(-20).map(w => w.date.slice(5)), S.weights.slice(-20).map(w => w.weight), '#10b981');
    document.getElementById('body-weight-no-data')?.classList.add('hidden');
  }
  // 如果今天在日程页，重新渲染以隐藏周一提醒横幅
  if (S.tab === 'schedule') renderSchedule();
}

async function dbGetWaistLogs(limit = 56) {
  if (!localMode) return getWaistLogs(limit);
  const raw = localStorage.getItem('ft_local_waist');
  const arr = raw ? JSON.parse(raw) : [];
  return arr.slice(-limit);
}
async function dbAddWaistLog(dateStr, waist) {
  if (!localMode) return addWaistLog(dateStr, waist);
  const arr = await dbGetWaistLogs(999);
  const idx = arr.findIndex(x => x.date === dateStr);
  const entry = { user_id: 'local', date: dateStr, waist, updated_at: new Date().toISOString() };
  if (idx >= 0) arr[idx] = entry; else arr.push(entry);
  arr.sort((a, b) => new Date(a.date) - new Date(b.date));
  localStorage.setItem('ft_local_waist', JSON.stringify(arr));
  return entry;
}
async function saveWaist() {
  const v = parseFloat(document.getElementById('waist-input').value);
  if (!v || v <= 0) { alert('请输入有效腰围'); return; }
  await dbAddWaistLog(S.today, v);
  document.getElementById('waist-input').value = '';
  const hint = document.getElementById('waist-save-hint');
  if (hint) { hint.classList.remove('hidden'); setTimeout(() => hint.classList.add('hidden'), 2000); }
  renderWaistInfo();
  // 刷新统计页腰围图
  const allWaists = await dbGetWaistLogs(999);
  const start = fmtDate(new Date(new Date(S.today + 'T00:00:00').getTime() - 84 * 86400000));
  const recent = allWaists.filter(w => w.date >= start && w.date <= S.today);
  if (recent.length >= 2) {
    document.getElementById('body-waist-no-data')?.classList.add('hidden');
    drawBodyLineChart('body-waist-chart', recent.map(w => w.date.slice(5)), recent.map(w => w.waist), '#a855f7');
  }
  // 如果今天在日程页，重新渲染以隐藏周一提醒横幅
  if (S.tab === 'schedule') renderSchedule();
}
function renderWaistInfo() {
  dbGetWaistLogs(1).then(arr => {
    const el = document.getElementById('waist-info');
    if (!el) return;
    if (arr.length > 0) {
      const last = arr[arr.length - 1];
      el.textContent = '最近腰围：' + last.waist + 'cm (' + last.date + ')';
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  });
}
function drawWeightChart() {
  const cv = document.getElementById('weight-chart');
  const no = document.getElementById('weight-no-data');
  if (!cv) return;
  const { width, height } = resizeCanvas(cv);
  const ctx = cv.getContext('2d');
  if (!S.weights || S.weights.length < 2) { no.classList.remove('hidden'); ctx.clearRect(0, 0, width, height); return; }
  no.classList.add('hidden');

  const logs = S.weights.slice(-8);
  const labels = logs.map(l => { const d = new Date(l.date + 'T00:00:00'); return `${d.getMonth() + 1}/${d.getDate()}`; });
  const vals = logs.map(l => l.weight);
  const minW = Math.min(...vals) - 1;
  const maxW = Math.max(...vals) + 1;
  const range = maxW - minW || 1;
  const pad = 40;
  const w = width - pad * 2;
  const h = height - pad * 2;

  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = '#2d3748';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad + (h / 4) * i;
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(pad + w, y); ctx.stroke();
    ctx.fillStyle = '#64748b'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
    ctx.fillText((maxW - (range / 4) * i).toFixed(1), pad - 8, y + 3);
  }
  const stepX = w / (vals.length - 1 || 1);
  ctx.strokeStyle = '#10b981'; ctx.lineWidth = 2.5; ctx.beginPath();
  vals.forEach((v, i) => { const x = pad + stepX * i, y = pad + ((maxW - v) / range) * h; i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
  ctx.stroke();
  vals.forEach((v, i) => {
    const x = pad + stepX * i, y = pad + ((maxW - v) / range) * h;
    ctx.fillStyle = '#10b981'; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e2e8f0'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(v.toFixed(1), x, y - 10);
  });
  labels.forEach((lab, i) => { ctx.fillStyle = '#64748b'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(lab, pad + stepX * i, height - 8); });
}

function drawInteractivePieChart(canvasId, data) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const tooltip = document.getElementById('week-pie-tooltip');
  const wrap = canvas.parentElement;

  function getLayout() {
    const dpr = window.devicePixelRatio || 1;
    const cssW = wrap.clientWidth;
    const cssH = 260;
    return { cssW, cssH, dpr };
  }

  function resizeCanvas() {
    const { cssW, cssH, dpr } = getLayout();
    if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
      canvas.width = cssW * dpr;
      canvas.height = cssH * dpr;
      canvas.style.width = cssW + 'px';
      canvas.style.height = cssH + 'px';
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: cssW, h: cssH };
  }

  let state = canvas._pieState;
  if (!state) {
    state = canvas._pieState = {
      mode: 'primary',
      primaryData: data,
      secondaryData: null,
      currentCategory: null,
      hoveredIndex: -1,
      mouseX: -1,
      mouseY: -1,
      layout: null,
      centerText: data.centerText || '时间分布'
    };

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      state.mouseX = e.clientX;
      state.mouseY = e.clientY;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const newIndex = getHoveredIndex(state, x, y);
      if (newIndex !== state.hoveredIndex) {
        state.hoveredIndex = newIndex;
        draw(state);
        updateTooltip(state);
      } else if (state.hoveredIndex !== -1) {
        updateTooltip(state);
      }
    });

    canvas.addEventListener('mouseleave', () => {
      state.hoveredIndex = -1;
      draw(state);
      if (tooltip) tooltip.classList.add('hidden');
    });

    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const layout = state.layout || computeLayout();
      const dx = x - layout.cx;
      const dy = y - layout.cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (state.mode === 'secondary' && dist < layout.innerRadius) {
        state.mode = 'primary';
        state.secondaryData = null;
        state.currentCategory = null;
        state.hoveredIndex = -1;
        draw(state);
        if (tooltip) tooltip.classList.add('hidden');
        return;
      }

      const idx = getHoveredIndex(state, x, y);
      if (idx === -1) return;
      const activeData = state.mode === 'primary' ? state.primaryData : state.secondaryData;
      const d = activeData[idx];

      if (state.mode === 'primary' && d.subs && d.subs.length > 0) {
        state.mode = 'secondary';
        state.currentCategory = d;
        state.secondaryData = d.subs.map(sub => ({ ...sub, color: d.color }));
        state.hoveredIndex = -1;
        draw(state);
        if (tooltip) tooltip.classList.add('hidden');
      } else if (state.mode === 'secondary') {
        const detailOverlay = document.getElementById('pie-detail-overlay');
        if (detailOverlay) {
          canvas.classList.add('hidden');
          detailOverlay.classList.remove('hidden');
          renderPieDetail(state.currentCategory.key, d.key);
        }
      }
    });
  } else {
    state.primaryData = data;
    state.mode = 'primary';
    state.secondaryData = null;
    state.currentCategory = null;
    state.hoveredIndex = -1;
    state.centerText = data.centerText || '时间分布';
  }

  draw(state);

  function computeLayout() {
    const { w, h } = resizeCanvas();
    const cx = w / 2;
    const cy = h / 2;
    const outerRadius = Math.min(110, Math.max(80, Math.min(w, h) / 2 - 20));
    const innerRadius = Math.round(outerRadius * 0.45);
    return { w, h, cx, cy, outerRadius, innerRadius };
  }

  function getHoveredIndex(st, x, y) {
    const layout = st.layout || computeLayout();
    const dx = x - layout.cx;
    const dy = y - layout.cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < layout.innerRadius || dist > layout.outerRadius) return -1;

    let angle = Math.atan2(dy, dx);
    angle = angle + Math.PI / 2;
    if (angle < 0) angle += Math.PI * 2;

    const activeData = st.mode === 'primary' ? st.primaryData : st.secondaryData;
    const total = activeData.reduce((s, d) => s + d.value, 0);
    let currentAngle = 0;
    const gapRad = 2 / 120;

    for (let i = 0; i < activeData.length; i++) {
      const d = activeData[i];
      const sectorAngle = Math.max(0, (d.value / total) * Math.PI * 2 - gapRad);
      if (angle >= currentAngle && angle < currentAngle + sectorAngle + gapRad) {
        return i;
      }
      currentAngle += sectorAngle + gapRad;
    }
    return -1;
  }

  function draw(st) {
    const layout = computeLayout();
    st.layout = layout;
    ctx.clearRect(0, 0, layout.w, layout.h);

    const activeData = st.mode === 'primary' ? st.primaryData : st.secondaryData;
    if (!activeData || activeData.length === 0) {
      ctx.fillStyle = '#64748b';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('暂无记录', layout.cx, layout.cy);
      return;
    }

    const total = activeData.reduce((s, d) => s + d.value, 0);
    let startAngle = -Math.PI / 2;
    const gapRad = 2 / 120;

    activeData.forEach((d, i) => {
      const angle = Math.max(0, (d.value / total) * Math.PI * 2 - gapRad);
      const endAngle = startAngle + angle;

      let color = d.color;
      if (st.mode === 'secondary' && st.currentCategory) {
        const subs = PIE_SUB_COLORS[st.currentCategory.key] || {};
        color = subs[d.key] || d.color;
      }

      const isHovered = i === st.hoveredIndex;
      const isDimmed = st.hoveredIndex !== -1 && !isHovered;

      ctx.save();
      ctx.globalAlpha = isDimmed ? 0.5 : 1;

      if (isHovered) {
        const midAngle = startAngle + angle / 2;
        ctx.translate(Math.cos(midAngle) * 6, Math.sin(midAngle) * 6);
      }

      ctx.beginPath();
      ctx.arc(layout.cx, layout.cy, layout.outerRadius, startAngle, endAngle);
      ctx.arc(layout.cx, layout.cy, layout.innerRadius, endAngle, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#151b2b';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.restore();
      startAngle += angle + gapRad;
    });

    ctx.fillStyle = '#e2e8f0';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (st.mode === 'primary') {
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(st.centerText, layout.cx, layout.cy - 6);
    } else {
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(st.currentCategory.name, layout.cx, layout.cy - 10);
      ctx.font = '11px sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('← 点击返回', layout.cx, layout.cy + 8);
    }
  }

  function updateTooltip(st) {
    if (!tooltip) return;
    const activeData = st.mode === 'primary' ? st.primaryData : st.secondaryData;
    if (st.hoveredIndex === -1 || !activeData[st.hoveredIndex]) {
      tooltip.classList.add('hidden');
      return;
    }

    const d = activeData[st.hoveredIndex];
    const total = activeData.reduce((s, d) => s + d.value, 0);
    const hours = (d.value / 60).toFixed(1);
    const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;

    let html = '<div style="font-weight:bold;margin-bottom:4px;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:4px;">' + d.name + ' · ' + hours + 'h (' + pct + '%)</div>';

    if (st.mode === 'primary' && d.subs && d.subs.length > 0) {
      const subTotal = d.value;
      d.subs.forEach(sub => {
        const sh = (sub.value / 60).toFixed(1);
        const spct = subTotal > 0 ? Math.round((sub.value / subTotal) * 100) : 0;
        html += '<div style="color:#94a3b8;font-size:11px;margin-top:2px;">' + sub.name + ' · ' + sh + 'h (' + spct + '%)</div>';
      });
    }

    const descKey = st.mode === 'primary' ? d.key : st.currentCategory.key;
    const desc = CATEGORY_DESCRIPTIONS[descKey] || '';
    if (desc) {
      html += '<div style="color:#64748b;font-size:10px;margin-top:6px;font-style:italic;">' + desc + '</div>';
    }

    tooltip.innerHTML = html;
    tooltip.classList.remove('hidden');

    const rect = wrap.getBoundingClientRect();
    let tx = st.mouseX - rect.left + 15;
    let ty = st.mouseY - rect.top + 15;

    if (tx + tooltip.offsetWidth > wrap.offsetWidth) tx = st.mouseX - rect.left - tooltip.offsetWidth - 10;
    if (ty + tooltip.offsetHeight > wrap.offsetHeight) ty = st.mouseY - rect.top - tooltip.offsetHeight - 10;
    if (tx < 0) tx = 0;
    if (ty < 0) ty = 0;

    tooltip.style.left = tx + 'px';
    tooltip.style.top = ty + 'px';
  }
}

function drawWeeklyBarChart(canvasId, labels, study, workout, rest) {
  const cv = document.getElementById(canvasId);
  if (!cv) return;
  const { width, height } = resizeCanvas(cv);
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  const pad = { t: 20, r: 10, b: 30, l: 30 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const n = labels.length;
  const maxVal = Math.max(1, ...study, ...workout, ...rest);
  const barW = w / n * 0.6;
  const gap = w / n;

  ctx.strokeStyle = '#2d3748'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + (h / 4) * i;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + w, y); ctx.stroke();
    ctx.fillStyle = '#64748b'; ctx.font = '9px sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(Math.round(maxVal - (maxVal / 4) * i) + 'h', pad.l - 4, y + 3);
  }

  labels.forEach((lab, i) => {
    const x = pad.l + gap * i + gap / 2;
    const bw = barW / 3;
    const sH = (study[i] / maxVal) * h;
    const woH = (workout[i] / maxVal) * h;
    const rH = (rest[i] / maxVal) * h;

    ctx.fillStyle = CAT_COLORS.study;
    ctx.fillRect(x - barW/2, pad.t + h - sH, bw, sH);
    ctx.fillStyle = CAT_COLORS.workout;
    ctx.fillRect(x - barW/2 + bw, pad.t + h - woH, bw, woH);
    ctx.fillStyle = CAT_COLORS.rest;
    ctx.fillRect(x - barW/2 + bw*2, pad.t + h - rH, bw, rH);

    ctx.fillStyle = '#94a3b8'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(lab, x, height - 4);
  });
}

function drawMonthlyLineChart(canvasId, labels, values) {
  const cv = document.getElementById(canvasId);
  if (!cv) return;
  const { width, height } = resizeCanvas(cv);
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  const pad = { t: 20, r: 10, b: 30, l: 30 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const maxV = Math.max(1, ...values);

  ctx.strokeStyle = '#2d3748'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + (h / 4) * i;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + w, y); ctx.stroke();
    ctx.fillStyle = '#64748b'; ctx.font = '9px sans-serif'; ctx.textAlign = 'right';
    ctx.fillText((maxV - (maxV / 4) * i).toFixed(1) + 'h', pad.l - 4, y + 3);
  }

  const stepX = w / (values.length - 1 || 1);
  ctx.strokeStyle = CAT_COLORS.study; ctx.lineWidth = 2; ctx.beginPath();
  values.forEach((v, i) => {
    const x = pad.l + stepX * i;
    const y = pad.t + h - (v / maxV) * h;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  values.forEach((v, i) => {
    const x = pad.l + stepX * i;
    const y = pad.t + h - (v / maxV) * h;
    ctx.fillStyle = CAT_COLORS.study; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI*2); ctx.fill();
  });

  labels.forEach((lab, i) => {
    if (i % Math.ceil(labels.length / 6) !== 0 && i !== labels.length - 1) return;
    ctx.fillStyle = '#94a3b8'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(lab, pad.l + stepX * i, height - 4);
  });
}

function drawMiniLineChart(canvasId, labels, values, color) {
  const cv = document.getElementById(canvasId);
  if (!cv) return;
  const { width, height } = resizeCanvas(cv);
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  if (values.length < 2) return;
  const pad = { t: 10, r: 10, b: 20, l: 30 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const maxV = Math.max(1, ...values);
  const minV = Math.min(...values);
  const range = maxV - minV || 1;
  const adjustedMax = maxV + range * 0.1;
  const adjustedMin = Math.max(0, minV - range * 0.1);
  const adjustedRange = adjustedMax - adjustedMin || 1;
  ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, pad.t + h); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(pad.l, pad.t + h); ctx.lineTo(pad.l + w, pad.t + h); ctx.stroke();
  ctx.fillStyle = '#64748b'; ctx.font = '9px sans-serif'; ctx.textAlign = 'right';
  ctx.fillText(adjustedMax.toFixed(0), pad.l - 4, pad.t + 8);
  ctx.fillText(adjustedMin.toFixed(0), pad.l - 4, pad.t + h);
  const stepX = w / (values.length - 1 || 1);
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
  values.forEach((v, i) => {
    const x = pad.l + stepX * i;
    const y = pad.t + h - ((v - adjustedMin) / adjustedRange) * h;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
  values.forEach((v, i) => {
    const x = pad.l + stepX * i;
    const y = pad.t + h - ((v - adjustedMin) / adjustedRange) * h;
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI*2); ctx.fill();
  });
  labels.forEach((lab, i) => {
    ctx.fillStyle = '#94a3b8'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(lab, pad.l + stepX * i, height - 4);
  });
}

function drawBodyLineChart(canvasId, labels, values, color) {
  const cv = document.getElementById(canvasId);
  if (!cv) return;
  const { width, height } = resizeCanvas(cv);
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  if (values.length < 2) return;
  const pad = { t: 15, r: 15, b: 30, l: 40 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = maxV - minV || 1;
  const adjustedMax = maxV + range * 0.1;
  const adjustedMin = Math.max(0, minV - range * 0.1);
  const adjustedRange = adjustedMax - adjustedMin || 1;
  ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    const y = pad.t + (h / 3) * i;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + w, y); ctx.stroke();
    ctx.fillStyle = '#64748b'; ctx.font = '9px sans-serif'; ctx.textAlign = 'right';
    ctx.fillText((adjustedMax - (adjustedRange / 3) * i).toFixed(1), pad.l - 4, y + 3);
  }
  const stepX = w / (values.length - 1 || 1);
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
  values.forEach((v, i) => {
    const x = pad.l + stepX * i;
    const y = pad.t + h - ((v - adjustedMin) / adjustedRange) * h;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
  values.forEach((v, i) => {
    const x = pad.l + stepX * i;
    const y = pad.t + h - ((v - adjustedMin) / adjustedRange) * h;
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI*2); ctx.fill();
  });
  labels.forEach((lab, i) => {
    if (i % Math.ceil(labels.length / 5) !== 0 && i !== labels.length - 1) return;
    ctx.fillStyle = '#94a3b8'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(lab, pad.l + stepX * i, height - 6);
  });
}

function drawFullWeightChart() {
  const cv = document.getElementById('weight-chart-full');
  const no = document.getElementById('weight-full-no-data');
  if (!cv) return;
  const { width, height } = resizeCanvas(cv);
  const ctx = cv.getContext('2d');
  if (!S.weights || S.weights.length < 2) { no.classList.remove('hidden'); ctx.clearRect(0, 0, width, height); return; }
  no.classList.add('hidden');

  const logs = S.weights;
  const labels = logs.map(l => { const d = new Date(l.date + 'T00:00:00'); return `${d.getMonth() + 1}/${d.getDate()}`; });
  const vals = logs.map(l => l.weight);
  const minW = Math.min(...vals) - 1;
  const maxW = Math.max(...vals) + 1;
  const range = maxW - minW || 1;
  const pad = 40;
  const w = width - pad * 2;
  const h = height - pad * 2;

  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = '#2d3748';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad + (h / 4) * i;
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(pad + w, y); ctx.stroke();
    ctx.fillStyle = '#64748b'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
    ctx.fillText((maxW - (range / 4) * i).toFixed(1), pad - 8, y + 3);
  }
  const stepX = w / (vals.length - 1 || 1);
  ctx.strokeStyle = '#10b981'; ctx.lineWidth = 2; ctx.beginPath();
  vals.forEach((v, i) => { const x = pad + stepX * i, y = pad + ((maxW - v) / range) * h; i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
  ctx.stroke();
  vals.forEach((v, i) => {
    const x = pad + stepX * i, y = pad + ((maxW - v) / range) * h;
    ctx.fillStyle = '#10b981'; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
  });
  labels.forEach((lab, i) => {
    if (i % Math.ceil(labels.length / 6) !== 0 && i !== labels.length - 1) return;
    ctx.fillStyle = '#64748b'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(lab, pad + stepX * i, height - 8);
  });
}

// ==================== 统计 ====================
async function refreshWeek() {
  S.weekData = await dbGetCheckinsBetween(weekStart(S.today), weekDays(weekStart(S.today))[6]);
}

function getWorkoutVolume(workout) {
  if (!workout || !workout.exercises) return 0;
  return Object.values(workout.exercises).reduce((sum, ex) => sum + (ex.totalVolume || 0), 0);
}

// ==================== 放松记录模块（完全独立）====================

function getRelaxationData() {
  return S.checkin?.schedule_data?.relaxation || { single: { count: 0, records: [] }, double: { count: 0, records: [] } };
}

async function saveRelaxationRecord(type, note) {
  const saved = JSON.parse(JSON.stringify(S.checkin?.schedule_data || {}));
  if (!saved.relaxation) saved.relaxation = { single: { count: 0, records: [] }, double: { count: 0, records: [] } };
  saved.relaxation[type].count = (saved.relaxation[type].count || 0) + 1;
  saved.relaxation[type].records.push({
    date: S.today,
    note: note || '',
    created_at: new Date().toISOString()
  });
  S.checkin = await dbUpsertCheckin(S.today, saved);
}

async function deleteLastRelaxation(type) {
  const saved = JSON.parse(JSON.stringify(S.checkin?.schedule_data || {}));
  if (!saved.relaxation || !saved.relaxation[type]) { alert('暂无记录'); return; }
  const records = saved.relaxation[type].records || [];
  const todayRecords = records.filter(r => r.date === S.today);
  if (todayRecords.length === 0) { alert('今日暂无记录可删除'); return; }
  const last = todayRecords[todayRecords.length - 1];
  saved.relaxation[type].records = records.filter(r => r !== last);
  saved.relaxation[type].count = Math.max(0, (saved.relaxation[type].count || 0) - 1);
  S.checkin = await dbUpsertCheckin(S.today, saved);
  renderRelaxationModal();
}

function daysSinceRelaxation(type) {
  const data = getRelaxationData();
  const records = data[type]?.records || [];
  if (records.length === 0) return -1;
  const last = records[records.length - 1];
  const lastDate = new Date(last.date + 'T00:00:00');
  const today = new Date(S.today + 'T00:00:00');
  return Math.floor((today - lastDate) / 86400000);
}

function formatDaysAgo(diff) {
  if (diff < 0) return '无记录';
  if (diff === 0) return '今天';
  if (diff === 1) return '昨天';
  return diff + '天前';
}

async function getRelaxationStats() {
  const data = getRelaxationData();
  const todaySingle = data.single?.count || 0;
  const todayDouble = data.double?.count || 0;

  const ws = weekStart(S.today);
  const wd = weekDays(ws);
  let weekSingle = todaySingle, weekDouble = todayDouble;
  for (const d of wd) {
    if (d === S.today) continue;
    const c = await dbGetCheckin(d);
    const r = c?.schedule_data?.relaxation;
    if (r) { weekSingle += r.single?.count || 0; weekDouble += r.double?.count || 0; }
  }

  const monthStart = S.today.slice(0, 8) + '01';
  const allCheckins = await dbGetAllCheckins();
  let monthSingle = 0, monthDouble = 0, allSingle = 0, allDouble = 0;
  for (const c of allCheckins) {
    const r = c.schedule_data?.relaxation;
    if (!r) continue;
    const s = r.single?.count || 0;
    const db = r.double?.count || 0;
    if (c.date >= monthStart && c.date <= S.today) { monthSingle += s; monthDouble += db; }
    allSingle += s; allDouble += db;
  }

  return {
    today: todaySingle + todayDouble,
    week: weekSingle + weekDouble,
    month: monthSingle + monthDouble,
    all: allSingle + allDouble
  };
}

let pendingRelaxationType = '';

function showRelaxationModal() {
  renderRelaxationModal();
  document.getElementById('relaxation-modal').classList.remove('hidden');
}

function closeRelaxationModal() {
  document.getElementById('relaxation-modal').classList.add('hidden');
}

function showRelaxationNoteModal(type) {
  pendingRelaxationType = type;
  document.getElementById('relax-note-title').textContent = type === 'single' ? '记录本次单人感受' : '记录本次双人感受';
  document.getElementById('relaxation-note-input').value = '';
  document.getElementById('relaxation-note-modal').classList.remove('hidden');
}

function closeRelaxationNoteModal() {
  pendingRelaxationType = '';
  document.getElementById('relaxation-note-modal').classList.add('hidden');
}

async function saveRelaxationNote() {
  const note = document.getElementById('relaxation-note-input').value || '';
  if (!pendingRelaxationType) return;
  await saveRelaxationRecord(pendingRelaxationType, note);
  closeRelaxationNoteModal();
  renderRelaxationModal();
}

async function skipRelaxationNote() {
  if (!pendingRelaxationType) return;
  await saveRelaxationRecord(pendingRelaxationType, '');
  closeRelaxationNoteModal();
  renderRelaxationModal();
}

async function renderRelaxationModal() {
  const singleDiff = daysSinceRelaxation('single');
  const doubleDiff = daysSinceRelaxation('double');
  document.getElementById('relax-last-single').textContent = formatDaysAgo(singleDiff);
  document.getElementById('relax-last-double').textContent = formatDaysAgo(doubleDiff);

  const data = getRelaxationData();
  document.getElementById('relax-today-single').textContent = '今日：' + (data.single?.count || 0) + ' 次';
  document.getElementById('relax-today-double').textContent = '今日：' + (data.double?.count || 0) + ' 次';

  const stats = await getRelaxationStats();
  document.getElementById('relax-stat-today').textContent = stats.today;
  document.getElementById('relax-stat-week').textContent = stats.week;
  document.getElementById('relax-stat-month').textContent = stats.month;
  document.getElementById('relax-stat-all').textContent = stats.all;

  renderRelaxationChart();

  const allRecords = [];
  const allCheckins = await dbGetAllCheckins();
  for (const c of allCheckins) {
    const r = c.schedule_data?.relaxation;
    if (!r) continue;
    (r.single?.records || []).forEach(rec => allRecords.push({ ...rec, typeName: '单人' }));
    (r.double?.records || []).forEach(rec => allRecords.push({ ...rec, typeName: '双人' }));
  }
  allRecords.sort((a, b) => new Date(b.created_at || b.date).getTime() - new Date(a.created_at || a.date).getTime());

  const listEl = document.getElementById('relax-records-list');
  if (allRecords.length === 0) {
    listEl.innerHTML = '<div class="empty-state py-4"><div class="empty-state-icon">🕸️</div><div class="text-xs">暂无记录</div></div>';
  } else {
    listEl.innerHTML = allRecords.slice(0, 30).map(r => {
      const dt = new Date(r.created_at || r.date + 'T00:00:00');
      const dateStr = (dt.getMonth() + 1) + '/' + dt.getDate();
      const timeStr = String(dt.getHours()).padStart(2, '0') + ':' + String(dt.getMinutes()).padStart(2, '0');
      return '<div class="bg-dark-700/30 rounded-lg p-2">' +
        '<div class="flex items-center justify-between mb-0.5">' +
        '<span class="text-[10px] text-gray-400">' + dateStr + ' ' + timeStr + ' · ' + r.typeName + '</span>' +
        '</div>' +
        (r.note ? '<p class="text-xs text-gray-300">' + escapeHtml(r.note) + '</p>' : '<p class="text-xs text-gray-500 italic">无感受记录</p>') +
        '</div>';
    }).join('');
  }
}

async function renderRelaxationChart() {
  const chartEl = document.getElementById('relax-chart');
  const labelEl = document.getElementById('relax-chart-labels');
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(S.today + 'T00:00:00');
    d.setDate(d.getDate() - i);
    days.push(fmtDate(d));
  }
  const labels = days.map(d => {
    const date = new Date(d + 'T00:00:00');
    return (date.getMonth() + 1) + '/' + date.getDate();
  });

  let maxVal = 1;
  const dayValues = [];
  for (const d of days) {
    const c = await dbGetCheckin(d);
    const r = c?.schedule_data?.relaxation;
    const s = (r?.single?.count || 0) + (r?.double?.count || 0);
    dayValues.push(s);
    if (s > maxVal) maxVal = s;
  }

  chartEl.innerHTML = dayValues.map(v => {
    const h = Math.max((v / maxVal) * 100, 3);
    return '<div class="flex-1 flex flex-col items-center justify-end">' +
      '<div class="w-full bg-gradient-to-t from-blue-600 to-blue-400 rounded-t-sm" style="height:' + h + '%"></div>' +
      '</div>';
  }).join('');

  labelEl.innerHTML = labels.map(l => '<span class="flex-1 text-center">' + l + '</span>').join('');
}

// ==================== 日报增强 ====================

function generateDailyReport() {
  const modal = document.getElementById('daily-report-modal');
  const allOld = S.checkin?.schedule_data?.timer_sessions || [];
  const allNew = S.checkin?.schedule_data?.sessions || [];
  const all = [...allOld, ...allNew].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

  document.getElementById('report-date').textContent = '第' + S.week + '周第' + S.day + '天 · ' + S.today;

  // Timeline
  let timelineHtml = '';
  let lastEnd = new Date(S.today + 'T07:30:00');
  const dayEnd = new Date(S.today + 'T23:30:00');
  all.forEach(s => {
    const sStart = new Date(s.startTime);
    const sEnd = new Date(s.endTime);
    if (sStart > lastEnd) {
      const gapMin = Math.round((sStart - lastEnd) / 60000);
      if (gapMin > 5) {
        timelineHtml += '<div class="flex items-start gap-2 mb-2">' +
          '<div class="w-1.5 h-1.5 rounded-full bg-gray-600 shrink-0 mt-1.5"></div>' +
          '<div class="flex-1 bg-dark-700/20 rounded-lg p-2 border border-dashed border-dark-600/40">' +
          '<span class="text-[10px] text-gray-500 font-mono">' + formatTime(lastEnd) + ' - ' + formatTime(sStart) + '</span>' +
          '<span class="text-[11px] text-gray-500 ml-2">未记录</span></div></div>';
      }
    }
    const dur = s.duration || Math.round((sEnd - sStart) / 60000);
    const scat = s.category || 'other';
    const ssub = s.subCategory || s.subject || '';
    const cinfo = CATEGORIES[scat];
    const scolor = cinfo?.color || '#94a3b8';
    const sname = cinfo?.name || scat;
    const subName = (cinfo?.subs && cinfo.subs[ssub]) ? cinfo.subs[ssub].name : (ssub ? ssub : '');
    const hasFeeling = s.feeling && s.feeling.trim();
    const hasNote = s.note && s.note.trim();
    timelineHtml += '<div class="flex items-start gap-2 mb-2">' +
      '<div class="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5" style="background:' + scolor + '"></div>' +
      '<div class="flex-1 bg-dark-700/20 rounded-lg p-2">' +
      '<div class="flex justify-between items-center"><span class="text-[10px] font-mono text-gray-400">' + formatTime(sStart) + ' - ' + formatTime(sEnd) + '</span>' +
      '<span class="text-[11px] text-gray-400">' + formatMinutesCN(dur) + '</span></div>' +
      '<span class="text-sm font-medium" style="color:' + scolor + '">' + sname + (subName ? ' - ' + subName : '') + '</span>' +
      (hasNote ? '<p class="text-[11px] text-gray-500 mt-0.5">📝 ' + s.note + '</p>' : '') +
      (hasFeeling ? '<p class="text-[11px] text-accent mt-0.5">💬 ' + s.feeling + '</p>' : '') +
      '</div></div>';
    lastEnd = sEnd;
  });
  if (lastEnd < dayEnd) {
    const gapMin = Math.round((dayEnd - lastEnd) / 60000);
    if (gapMin > 5) {
      timelineHtml += '<div class="flex items-start gap-2 mb-2">' +
        '<div class="w-1.5 h-1.5 rounded-full bg-gray-600 shrink-0 mt-1.5"></div>' +
        '<div class="flex-1 bg-dark-700/20 rounded-lg p-2 border border-dashed border-dark-600/40">' +
        '<span class="text-[10px] text-gray-500 font-mono">' + formatTime(lastEnd) + ' - ' + formatTime(dayEnd) + '</span>' +
        '<span class="text-[11px] text-gray-500 ml-2">未记录</span></div></div>';
    }
  }
  document.getElementById('report-timeline').innerHTML = timelineHtml || '<div class="empty-state py-4"><div class="empty-state-icon">🕸️</div><div class="text-xs">今日暂无记录</div></div>';

  // Pie chart + legend
  const catKeys = Object.keys(CATEGORIES);
  const reportData = catKeys.map(cat => {
    const min = getDayCategoryDuration(S.checkin, cat);
    return { label: CATEGORIES[cat].name, value: min, color: CATEGORIES[cat].color };
  }).filter(d => d.value > 0);
  // Draw simple SVG donut for report
  (function() {
    const svg = document.getElementById('report-pie');
    if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const ns = 'http://www.w3.org/2000/svg';
    const cx = 65, cy = 65, R = 55, r = 30;
    const total = reportData.reduce((s, d) => s + d.value, 0);
    if (total <= 0) {
      const text = document.createElementNS(ns, 'text');
      text.setAttribute('x', cx); text.setAttribute('y', cy + 4);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('fill', '#64748b'); text.setAttribute('font-size', '11');
      text.textContent = '暂无数据';
      svg.appendChild(text);
      return;
    }
    let startAngle = -Math.PI / 2;
    reportData.forEach(d => {
      if (d.value <= 0) return;
      const angle = (d.value / total) * Math.PI * 2;
      const endAngle = startAngle + angle;
      const la = angle > Math.PI ? 1 : 0;
      const x1 = cx + R * Math.cos(startAngle), y1 = cy + R * Math.sin(startAngle);
      const x2 = cx + R * Math.cos(endAngle), y2 = cy + R * Math.sin(endAngle);
      const x3 = cx + r * Math.cos(endAngle), y3 = cy + r * Math.sin(endAngle);
      const x4 = cx + r * Math.cos(startAngle), y4 = cy + r * Math.sin(startAngle);
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', 'M ' + x1 + ' ' + y1 + ' A ' + R + ' ' + R + ' 0 ' + la + ' 1 ' + x2 + ' ' + y2 + ' L ' + x3 + ' ' + y3 + ' A ' + r + ' ' + r + ' 0 ' + la + ' 0 ' + x4 + ' ' + y4 + ' Z');
      path.setAttribute('fill', d.color);
      path.setAttribute('stroke', '#151b2b');
      path.setAttribute('stroke-width', '2');
      svg.appendChild(path);
      startAngle = endAngle;
    });
    const text = document.createElementNS(ns, 'text');
    text.setAttribute('x', cx); text.setAttribute('y', cy + 4);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('fill', '#e2e8f0'); text.setAttribute('font-size', '11'); text.setAttribute('font-weight', 'bold');
    text.textContent = '今日';
    svg.appendChild(text);
  })();

  // Legend
  const legendEl = document.getElementById('report-legend');
  const totalMin = reportData.reduce((s, d) => s + d.value, 0);
  if (legendEl) {
    legendEl.innerHTML = reportData.map(d => {
      const pct = totalMin > 0 ? Math.round((d.value / totalMin) * 100) : 0;
      return '<div class="flex items-center justify-between text-xs">' +
        '<span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full" style="background:' + d.color + '"></span>' + d.label + '</span>' +
        '<span class="text-gray-400">' + formatMinutesCN(d.value) + ' (' + pct + '%)</span></div>';
    }).join('');
  }

  // Key numbers
  const totalStudy = getDayCategoryDuration(S.checkin, 'study');
  const totalWorkout = getDayCategoryDuration(S.checkin, 'workout');
  const totalTracked = reportData.reduce((s, d) => s + d.value, 0);
  const unrecorded = Math.max(0, 16 * 60 - totalTracked);
  document.getElementById('report-study').textContent = formatMinutesCN(totalStudy);
  document.getElementById('report-workout').textContent = formatMinutesCN(totalWorkout);
  document.getElementById('report-unrecorded').textContent = totalTracked > 0 ? Math.round((unrecorded / (16 * 60)) * 100) + '%' : '100%';

  // Notes + Feelings (enhanced)
  let notesHtml = '';
  const feelingEntries = [];
  all.forEach(s => {
    if (s.note || s.feeling) {
      const sStart = new Date(s.startTime);
      const cinfo = CATEGORIES[s.category || 'other'];
      feelingEntries.push({
        time: formatTime(sStart),
        catName: cinfo?.name || s.category || '其他',
        note: s.note || '',
        feeling: s.feeling || ''
      });
    }
  });
  if (feelingEntries.length > 0) {
    notesHtml = feelingEntries.map(e => {
      return '<div class="mb-2 pb-2 border-b border-white/5 last:border-0 last:pb-0 last:mb-0">' +
        '<span class="text-[10px] text-gray-500">' + e.time + ' · ' + e.catName + '</span>' +
        (e.note ? '<p class="text-xs text-gray-300 mt-0.5">📝 ' + e.note + '</p>' : '') +
        (e.feeling ? '<p class="text-xs text-accent mt-0.5">💬 ' + e.feeling + '</p>' : '') +
        '</div>';
    }).join('');
  }
  document.getElementById('report-notes').innerHTML = notesHtml || '<p class="text-xs text-gray-500 text-center py-2">今日无备注</p>';

  // Reset checkbox
  document.getElementById('report-no-more-today').checked = false;

  modal.classList.remove('hidden');
}

function closeDailyReport() {
  const noMore = document.getElementById('report-no-more-today')?.checked;
  if (noMore) {
    localStorage.setItem('ft_report_seen_' + S.today, '1');
  }
  document.getElementById('daily-report-modal').classList.add('hidden');
}

function copyReportText() {
  const el = document.getElementById('report-content');
  const text = el ? el.innerText : '';
  navigator.clipboard.writeText(text).then(() => alert('日报已复制到剪贴板'));
}

function exportReportImage() {
  const el = document.getElementById('report-content');
  if (!el) return;
  if (typeof html2canvas !== 'undefined') {
    html2canvas(el, { backgroundColor: '#0b0f19', scale: 2 }).then(canvas => {
      const link = document.createElement('a');
      link.download = '日报_' + S.today + '.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    });
  } else {
    // 降级：尝试使用浏览器原生截图API
    alert('html2canvas 未加载，已降级为复制文字');
    copyReportText();
  }
}

async function getCheckinsForTimeRange() {
  const range = _statsTimeRange;
  if (range === 'today') {
    const c = S.checkin && S.checkin.date === S.today ? S.checkin : null;
    return c ? [c] : [];
  } else if (range === 'week') {
    const ws = weekStart(S.today);
    const wd = weekDays(ws);
    const map = {};
    S.weekData.forEach(c => map[c.date] = c);
    return wd.map(d => map[d]).filter(Boolean);
  } else if (range === 'month') {
    const d = new Date(S.today + 'T00:00:00');
    const monthStart = fmtDate(new Date(d.getFullYear(), d.getMonth(), 1));
    return await dbGetCheckinsBetween(monthStart, S.today);
  } else if (range === 'all') {
    return await dbGetAllCheckins();
  }
  return [];
}

function closePieDetail() {
  const overlay = document.getElementById('pie-detail-overlay');
  const canvas = document.getElementById('week-pie');
  if (overlay) overlay.classList.add('hidden');
  if (canvas) canvas.classList.remove('hidden');
}

async function renderPieDetail(catKey, subKey) {
  const overlay = document.getElementById('pie-detail-overlay');
  if (!overlay) return;

  const catInfo = CATEGORIES[catKey];
  const subName = catInfo?.subs?.[subKey]?.name || subKey;

  let html = '<div class="mb-3">';
  html += '<div class="flex items-center gap-2 text-xs text-gray-500 mb-2">' +
    '<button onclick="closePieDetail()" class="hover:text-white transition">📂 时间结构</button>' +
    '<span>&gt;</span>' +
    '<button onclick="closePieDetail()" class="hover:text-white transition">' + (catInfo?.name || catKey) + '</button>' +
    '<span>&gt;</span><span class="text-gray-300">' + subName + '</span></div>';
  html += '<button onclick="closePieDetail()" class="text-xs text-gray-500 hover:text-white transition flex items-center gap-1">← 返回' + (catInfo?.name || catKey) + '</button>';
  html += '</div>';

  const checkins = await getCheckinsForTimeRange();
  const records = [];
  checkins.forEach(c => {
    const sessions = [
      ...(c.schedule_data?.sessions || []),
      ...(c.schedule_data?.timer_sessions || [])
    ];
    sessions.forEach(s => {
      const sc = s.category || 'other';
      const ss = s.subCategory || s.subject || '';
      if (sc === catKey && ss === subKey) {
        records.push({
          date: c.date,
          startTime: s.startTime,
          endTime: s.endTime,
          duration: s.duration || 0,
          note: s.note || '',
          feeling: s.feeling || ''
        });
      }
    });
  });

  records.sort((a, b) => {
    const dDiff = (b.date || '').localeCompare(a.date || '');
    if (dDiff !== 0) return dDiff;
    return (b.startTime || '').localeCompare(a.startTime || '');
  });

  if (records.length === 0) {
    html += '<div class="empty-state py-4"><div class="empty-state-icon">🕸️</div><div class="text-xs">暂无记录</div><div class="text-[10px] text-gray-600 mt-1">当前时段内没有「' + subName + '」的相关数据</div></div>';
  } else {
    html += '<div style="max-height:400px;overflow-y:auto;">';
    records.forEach((r, i) => {
      const sStart = new Date(r.startTime);
      const sEnd = new Date(r.endTime);
      const timeRange = formatTime(sStart) + '-' + formatTime(sEnd);
      const dur = formatMinutesCN(r.duration);
      const dateStr = _statsTimeRange === 'all' ? r.date.replace(/-/g, '/') : r.date.slice(5).replace('-', '/');
      const hasNote = r.note && r.note.trim();
      const hasFeeling = r.feeling && r.feeling.trim();
      const borderStyle = i > 0 ? 'border-top:1px solid rgba(255,255,255,0.05);' : '';
      html += '<div class="py-2" style="' + borderStyle + '">' +
        '<div class="flex items-center justify-between">' +
        '<span class="text-xs text-gray-400 font-mono">' + dateStr + ' ' + timeRange + ' · ' + dur + '</span>' +
        '</div>';
      if (hasNote) html += '<div class="text-[10px] text-gray-400 mt-0.5">' + escapeHtml(r.note) + '</div>';
      if (hasFeeling) html += '<div class="text-[10px] text-gray-500 mt-0.5 italic">💬 ' + escapeHtml(r.feeling) + '</div>';
      html += '</div>';
    });
    html += '</div>';
  }

  overlay.innerHTML = html;
}

async function renderTimeStructure() {
  closePieDetail();
  const range = _statsTimeRange;
  let checkins = [];
  let centerText = '时间分布';

  if (range === 'today') {
    const c = S.checkin && S.checkin.date === S.today ? S.checkin : null;
    if (c) checkins = [c];
    centerText = '今天';
  } else if (range === 'week') {
    const ws = weekStart(S.today);
    const wd = weekDays(ws);
    const map = {};
    S.weekData.forEach(c => map[c.date] = c);
    checkins = wd.map(d => map[d]).filter(Boolean);
    centerText = '本周';
  } else if (range === 'month') {
    const d = new Date(S.today + 'T00:00:00');
    const monthStart = fmtDate(new Date(d.getFullYear(), d.getMonth(), 1));
    checkins = await dbGetCheckinsBetween(monthStart, S.today);
    centerText = '本月';
  } else if (range === 'all') {
    checkins = await dbGetAllCheckins();
    centerText = '至今';
  }

  const cats = ['study', 'workout', 'diet', 'rest', 'entertainment', 'commute', 'money'];
  const pieData = cats.map(cat => {
    const min = checkins.reduce((s, c) => s + getDayCategoryDuration(c, cat), 0);
    const subs = [];
    const catInfo = CATEGORIES[cat];
    if (catInfo && catInfo.subs) {
      Object.entries(catInfo.subs).forEach(([sk, sv]) => {
        const subMin = checkins.reduce((s, c) => s + getDaySubCategoryDuration(c, sk), 0);
        if (subMin > 0) subs.push({ key: sk, name: sv.name, value: subMin });
      });
    }
    return {
      key: cat,
      name: catInfo?.name || cat,
      color: PIE_COLORS[cat] || '#94a3b8',
      value: min,
      subs: subs.sort((a, b) => b.value - a.value)
    };
  }).filter(d => d.value > 0);

  const piePayload = [...pieData];
  piePayload.centerText = centerText;
  drawInteractivePieChart('week-pie', piePayload);

  const barsEl = document.getElementById('category-bars');
  const emptyEl = document.getElementById('category-bars-empty');
  if (pieData.length === 0) {
    if (barsEl) barsEl.innerHTML = '';
    if (emptyEl) emptyEl.classList.remove('hidden');
  } else {
    if (emptyEl) emptyEl.classList.add('hidden');
    const totalMin = pieData.reduce((s, d) => s + d.value, 0);
    const maxMin = Math.max(...pieData.map(d => d.value), 1);
    if (barsEl) {
      barsEl.innerHTML = pieData.map(d => {
        const pct = totalMin > 0 ? Math.round((d.value / totalMin) * 100) : 0;
        const barPct = Math.min((d.value / maxMin) * 100, 100);
        return '<div class="flex items-center gap-3 py-1.5"><span class="text-xs text-gray-300 w-12 text-left shrink-0">' + d.name + '</span><div class="flex-1 bg-dark-700 rounded-full h-3 overflow-hidden"><div class="rounded-full h-3 progress-bar" style="width:' + barPct + '%;background:' + d.color + '"></div></div><span class="text-xs text-gray-400 w-20 text-right shrink-0">' + formatMinutesCN(d.value) + ' (' + pct + '%)</span></div>';
      }).join('');
    }
  }
}

async function renderStats() {
  const ws = weekStart(S.today);
  const wd = weekDays(ws);
  const map = {};
  S.weekData.forEach(c => map[c.date] = c);

  // === 区块1：本周实况 ===
  let weekStudyH = 0, weekVolume = 0, activeDays = 0;
  wd.forEach(day => {
    const c = map[day];
    if (c && c.schedule_data) {
      const studyMin = getDayTotalStudy(c);
      if (studyMin > 0) weekStudyH += studyMin / 60;
      const hasAny = (c.schedule_data.sessions?.length > 0) || (c.schedule_data.timer_sessions?.length > 0) || getDayCategoryDuration(c, 'workout') > 0;
      if (hasAny) activeDays++;
    }
  });
  const weekWorkouts = await dbGetWorkoutsBetween(ws, wd[6]);
  weekWorkouts.forEach(w => { weekVolume += getWorkoutVolume(w); });

  document.getElementById('stats-week-overview').innerHTML = `
    <div class="glass glass-hover rounded-xl p-4 text-center">
      <p class="text-2xl font-bold text-blue-400">${weekStudyH.toFixed(1)}h</p>
      <p class="text-[11px] text-gray-400 mt-1">本周学习时长</p>
    </div>
    <div class="glass glass-hover rounded-xl p-4 text-center">
      <p class="text-2xl font-bold text-protein">${weekVolume > 0 ? Math.round(weekVolume).toLocaleString() : '0'}kg</p>
      <p class="text-[11px] text-gray-400 mt-1">本周训练容量</p>
    </div>
    <div class="glass glass-hover rounded-xl p-4 text-center">
      <p class="text-2xl font-bold text-purple-400">${activeDays}天</p>
      <p class="text-[11px] text-gray-400 mt-1">本周活跃天数</p>
    </div>
    <div class="glass glass-hover rounded-xl p-4 text-center">
      <p class="text-2xl font-bold text-accent">${(weekStudyH / 7).toFixed(1)}h</p>
      <p class="text-[11px] text-gray-400 mt-1">日均学习</p>
    </div>
  `;

  // === 区块2：时间结构 ===
  if (!_statsTimeRangeBound) {
    _statsTimeRangeBound = true;
    document.getElementById('time-range-switch')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.time-range-btn');
      if (!btn) return;
      const range = btn.dataset.range;
      if (!range || range === _statsTimeRange) return;
      _statsTimeRange = range;
      document.querySelectorAll('#time-range-switch .time-range-btn').forEach(b => {
        if (b.dataset.range === range) {
          b.classList.remove('text-gray-500', 'hover:text-white');
          b.classList.add('bg-accent', 'text-white');
        } else {
          b.classList.remove('bg-accent', 'text-white');
          b.classList.add('text-gray-500', 'hover:text-white');
        }
      });
      renderTimeStructure();
    });
  }

  document.querySelectorAll('#time-range-switch .time-range-btn').forEach(b => {
    if (b.dataset.range === _statsTimeRange) {
      b.classList.remove('text-gray-500', 'hover:text-white');
      b.classList.add('bg-accent', 'text-white');
    } else {
      b.classList.remove('bg-accent', 'text-white');
      b.classList.add('text-gray-500', 'hover:text-white');
    }
  });

  await renderTimeStructure();

  // === 区块3：训练日志 ===
  const prevWeekStart = fmtDate(new Date(new Date(ws + 'T00:00:00').getTime() - 7 * 86400000));
  const prevWeekEnd = fmtDate(new Date(new Date(wd[6] + 'T00:00:00').getTime() - 7 * 86400000));
  const prevWeekWorkouts = await dbGetWorkoutsBetween(prevWeekStart, prevWeekEnd);

  const recentWorkouts = weekWorkouts.slice(-2).reverse();
  const recentHtml = recentWorkouts.map(w => {
    const wDate = w.date;
    const wDayNum = dayForDate(wDate);
    const info = CYCLE[(wDayNum - 1) % 7];
    const vol = getWorkoutVolume(w);
    const workoutMin = map[wDate] ? getDayCategoryDuration(map[wDate], 'workout') : 0;
    const workoutDurationStr = workoutMin > 0 ? formatMinutesCN(workoutMin) : '-';
    const sameDayLastWeek = prevWeekWorkouts.find(pw => {
      const pwDay = dayForDate(pw.date);
      return CYCLE[(pwDay - 1) % 7]?.name === info?.name;
    });
    const lastVol = sameDayLastWeek ? getWorkoutVolume(sameDayLastWeek) : 0;
    let changeHtml = '';
    if (lastVol > 0 && vol > 0) {
      const change = ((vol - lastVol) / lastVol) * 100;
      if (Math.abs(change) < 3) changeHtml = '<span class="text-gray-400">持平</span>';
      else if (change > 0) changeHtml = '<span class="text-accent">↑' + change.toFixed(0) + '%</span>';
      else changeHtml = '<span class="text-blue-400">↓' + Math.abs(change).toFixed(0) + '%</span>';
    } else {
      changeHtml = '<span class="text-gray-500">-</span>';
    }
    return '<div class="bg-dark-700/30 rounded-xl p-3 flex items-center justify-between"><div><p class="text-xs text-gray-300 font-medium">' + wDate.slice(5) + ' · ' + (info?.name || '训练') + '</p><p class="text-[10px] text-gray-500">容量 ' + Math.round(vol) + 'kg · 时长 ' + workoutDurationStr + '</p></div><div class="text-xs text-right">' + changeHtml + '</div></div>';
  }).join('');
  document.getElementById('recent-workouts').innerHTML = recentHtml || '<div class="empty-state py-4"><div class="empty-state-icon">🕸️</div><div class="text-xs">本周暂无训练记录</div></div>';

  const exFreq = {};
  weekWorkouts.forEach(w => {
    if (w.exercises) {
      Object.entries(w.exercises).forEach(([name, ex]) => {
        const sets = (ex.sets || []).filter(s => s.done).length;
        if (sets > 0) exFreq[name] = (exFreq[name] || 0) + sets;
      });
    }
  });
  const freqList = Object.entries(exFreq).sort((a, b) => b[1] - a[1]);
  document.getElementById('exercise-freq').innerHTML = freqList.length
    ? freqList.map(([name, sets]) => name + ' ' + sets + '组').join(' · ')
    : '<span class="empty-state"><span class="empty-state-icon">🕸️</span><span class="text-xs">本周暂无动作记录</span></span>';

  // === 区块4：双趋势并排 ===
  const trendWeeks = [];
  for (let i = 3; i >= 0; i--) {
    const s = fmtDate(new Date(new Date(ws + 'T00:00:00').getTime() - i * 7 * 86400000));
    const e = fmtDate(new Date(new Date(s + 'T00:00:00').getTime() + 6 * 86400000));
    trendWeeks.push({ start: s, end: e, label: '第' + (S.week - i) + '周' });
  }
  const trendData = await Promise.all(trendWeeks.map(async tw => {
    const [checkins, workouts] = await Promise.all([
      dbGetCheckinsBetween(tw.start, tw.end),
      dbGetWorkoutsBetween(tw.start, tw.end)
    ]);
    const studyH = checkins.reduce((s, c) => s + getDayTotalStudy(c) / 60, 0);
    const vol = workouts.reduce((s, w) => s + getWorkoutVolume(w), 0);
    return { label: tw.label, studyH, vol };
  }));
  drawMiniLineChart('trend-study', trendData.map(d => d.label), trendData.map(d => d.studyH), '#3b82f6');
  drawMiniLineChart('trend-volume', trendData.map(d => d.label), trendData.map(d => d.vol), '#ef4444');

  // === 区块5：本周记录日历 ===
  const cal = document.getElementById('stats-calendar');
  const wns = ['一','二','三','四','五','六','日'];
  let calHtml = wns.map(n => '<div class="text-gray-500 py-1">' + n + '</div>').join('');
  const dayVolumeMap = {};
  weekWorkouts.forEach(w => { dayVolumeMap[w.date] = (dayVolumeMap[w.date] || 0) + getWorkoutVolume(w); });

  wd.forEach(day => {
    const c = map[day];
    const isToday = day === S.today;
    const hasWorkout = c && getDayCategoryDuration(c, 'workout') > 0;
    const hasStudy = c && getDayTotalStudy(c) > 0;
    const hasOther = c && ((c.schedule_data?.sessions?.length > 0) || (c.schedule_data?.timer_sessions?.length > 0));
    let bg = 'bg-dark-700/40 text-gray-400';
    if (hasWorkout) bg = 'bg-green-500/20 text-green-400';
    else if (hasStudy) bg = 'bg-blue-500/20 text-blue-400';
    else if (hasOther) bg = 'bg-yellow-500/20 text-yellow-400';
    if (isToday) bg += ' ring-1 ring-accent/50';
    const studyMin = c ? getDayTotalStudy(c) : 0;
    const vol = dayVolumeMap[day] || 0;
    calHtml += '<div class="' + bg + ' cal-day-cell rounded-lg py-2 text-sm cursor-pointer hover:opacity-80 transition" data-day="' + day + '" data-study="' + (studyMin > 0 ? (studyMin/60).toFixed(1) : '0') + '" data-vol="' + Math.round(vol) + '">' + new Date(day + 'T00:00:00').getDate() + '</div>';
  });
  cal.innerHTML = calHtml;
  document.querySelectorAll('#stats-calendar .cal-day-cell').forEach(cell => {
    cell.addEventListener('mouseenter', () => {
      const day = cell.dataset.day;
      const study = cell.dataset.study;
      const vol = cell.dataset.vol;
      const tooltip = document.getElementById('calendar-tooltip');
      tooltip.textContent = day.slice(5) + ' · 学习 ' + study + 'h | 容量 ' + vol + 'kg';
      tooltip.classList.remove('hidden');
    });
    cell.addEventListener('mouseleave', () => {
      document.getElementById('calendar-tooltip').classList.add('hidden');
    });
  });

  // === 区块6：身体数据 ===
  const weightStart = fmtDate(new Date(new Date(S.today + 'T00:00:00').getTime() - 84 * 86400000));

  // 输入框默认值：显示最新记录
  const allWeights = await dbGetWeightLogs(999);
  const latestWeight = allWeights.length > 0 ? allWeights[allWeights.length - 1].weight : '';
  const wInput = document.getElementById('weight-input');
  if (wInput && !wInput.value) wInput.value = latestWeight;

  const allWaists = await dbGetWaistLogs(999);
  const latestWaist = allWaists.length > 0 ? allWaists[allWaists.length - 1].waist : '';
  const waInput = document.getElementById('waist-input');
  if (waInput && !waInput.value) waInput.value = latestWaist;

  // 体重图：最近12周（最多20个点）
  const bodyWeights = allWeights.filter(w => w.date >= weightStart && w.date <= S.today).slice(-20);
  if (bodyWeights.length >= 2) {
    document.getElementById('body-weight-no-data').classList.add('hidden');
    drawBodyLineChart('body-weight-chart', bodyWeights.map(w => w.date.slice(5)), bodyWeights.map(w => w.weight), '#10b981');
  } else {
    document.getElementById('body-weight-no-data').classList.remove('hidden');
    const ctx = document.getElementById('body-weight-chart')?.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }

  // 腰围图：最近12周（最多20个点）
  const bodyWaists = allWaists.filter(w => w.date >= weightStart && w.date <= S.today).slice(-20);
  if (bodyWaists.length >= 2) {
    document.getElementById('body-waist-no-data').classList.add('hidden');
    drawBodyLineChart('body-waist-chart', bodyWaists.map(w => w.date.slice(5)), bodyWaists.map(w => w.waist), '#a855f7');
  } else {
    document.getElementById('body-waist-no-data').classList.remove('hidden');
    const ctx = document.getElementById('body-waist-chart')?.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }

  const bp = getBodyProfile();
  const intakeEl = document.getElementById('intake-card');
  if (bp && intakeEl) {
    const m = calculateMetabolism(bp);
    const targets = getDietTargets();
    const modeText = bp.surplus === 0 ? '维持期' : (bp.surplus > 0 ? '增肌期' : '减脂期');
    intakeEl.innerHTML = '<div class="flex items-center justify-between mb-2"><span class="text-xs text-gray-400">当前模式</span><span class="text-xs text-accent">' + modeText + '</span></div><div class="grid grid-cols-4 gap-2 text-center"><div><p class="text-sm font-bold text-white">' + targets.kcal + '</p><p class="text-[10px] text-gray-500">kcal</p></div><div><p class="text-sm font-bold text-protein">' + m.proteinG + 'g</p><p class="text-[10px] text-gray-500">蛋白质</p></div><div><p class="text-sm font-bold text-yellow-400">' + targets.c + 'g</p><p class="text-[10px] text-gray-500">碳水</p></div><div><p class="text-sm font-bold text-orange-400">' + targets.f + 'g</p><p class="text-[10px] text-gray-500">脂肪</p></div></div><p class="text-[10px] text-gray-500 mt-2 text-center">TDEE 估算约 ' + m.tdee + ' kcal · 蛋白质按体重×2.3计算</p>';
  } else if (intakeEl) {
    intakeEl.innerHTML = '<p class="text-xs text-gray-500 text-center">请在「代谢与身体数据」中设置身体数据以查看建议摄入量</p>';
  }

  drawFullWeightChart();
  renderWeight();
  renderMetabolismInfo();
}


// ==================== 模块一：数据备份与恢复 ====================

async function exportAllData() {
  const modal = document.getElementById('backup-modal');
  const content = document.getElementById('backup-content');
  const title = document.getElementById('backup-title');
  title.textContent = '📥 导出全部数据';
  content.innerHTML = '<p class="text-accent">正在收集数据...</p>';
  modal.classList.remove('hidden');

  const exportData = {
    exportVersion: '1.0',
    exportDate: new Date().toISOString(),
    userId: S.user?.id || 'local',
    supabaseData: {},
    localStorageData: {}
  };

  const checkins = await dbGetAllCheckins();
  const workouts = await dbGetAllWorkouts();
  const weights = await dbGetWeightLogs(999);
  const profile = await dbGetProfile();

  exportData.supabaseData.daily_checkins = checkins;
  exportData.supabaseData.workout_logs = workouts;
  exportData.supabaseData.weight_logs = weights;
  exportData.supabaseData.profiles = profile;

  const localData = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (key.startsWith('ft_')) {
      try { localData[key] = JSON.parse(localStorage.getItem(key)); }
      catch(e) { localData[key] = localStorage.getItem(key); }
    }
  }
  exportData.localStorageData = localData;

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'fitness-backup-' + S.today + '.json';
  a.click();
  URL.revokeObjectURL(url);

  localStorage.setItem('ft_last_backup_date', S.today);

  const totalRecords = checkins.length + workouts.length + weights.length;
  content.innerHTML = '<p class="text-accent mb-1">✅ 导出成功</p>' +
    '<p>日程记录: ' + checkins.length + ' 条</p>' +
    '<p>训练记录: ' + workouts.length + ' 条</p>' +
    '<p>体重记录: ' + weights.length + ' 条</p>' +
    '<p>本地缓存: ' + Object.keys(localData).length + ' 项</p>' +
    '<p class="mt-2 text-gray-500">文件已自动下载: fitness-backup-' + S.today + '.json</p>';
}

function closeBackupModal() {
  document.getElementById('backup-modal').classList.add('hidden');
}

async function handleImportFile(input) {
  const file = input.files?.[0];
  if (!file) return;
  input.value = '';

  const modal = document.getElementById('backup-modal');
  const content = document.getElementById('backup-content');
  const title = document.getElementById('backup-title');
  title.textContent = '📤 导入数据恢复';
  content.innerHTML = '<p class="text-accent">正在读取文件...</p>';
  modal.classList.remove('hidden');

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!data.exportVersion) throw new Error('无效的备份文件');
    if (data.userId !== (S.user?.id || 'local')) {
      if (!confirm('备份文件的用户ID与当前用户不匹配，是否仍要导入？')) {
        closeBackupModal(); return;
      }
    }

    if (data.localStorageData) {
      Object.entries(data.localStorageData).forEach(([key, value]) => {
        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
      });
    }

    let restoredCount = 0;
    if (data.supabaseData) {
      restoredCount += (data.supabaseData.daily_checkins?.length || 0);
      restoredCount += (data.supabaseData.workout_logs?.length || 0);
      restoredCount += (data.supabaseData.weight_logs?.length || 0);
    }

    content.innerHTML = '<p class="text-accent mb-1">✅ 数据恢复成功</p>' +
      '<p>共恢复 ' + restoredCount + ' 条记录</p>' +
      '<p class="mt-2 text-gray-500">页面将在 2 秒后刷新...</p>';
    setTimeout(() => location.reload(), 2000);
  } catch (e) {
    content.innerHTML = '<p class="text-danger">❌ 导入失败: ' + e.message + '</p>';
  }
}

function checkBackupReminder() {
  const today = new Date(S.today + 'T00:00:00');
  const lastBackup = localStorage.getItem('ft_last_backup_date');
  const banner = document.getElementById('backup-reminder-banner');
  if (!banner) return;
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isLastDayOfMonth = tomorrow.getDate() === 1;
  if (isLastDayOfMonth && lastBackup !== S.today) {
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
}

function hideBackupBanner() {
  const banner = document.getElementById('backup-reminder-banner');
  if (banner) banner.classList.add('hidden');
}

// ==================== 模块二：周报自动生成 ====================

function getAutoWeeklyReportSetting() {
  return localStorage.getItem('ft_auto_weekly_report') !== '0';
}

function getWeekStart(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return fmtDate(new Date(d.setDate(diff)));
}

function getWeekEnd(weekStartStr) {
  const d = new Date(weekStartStr + 'T00:00:00');
  d.setDate(d.getDate() + 6);
  return fmtDate(d);
}

async function generateWeeklyReport() {
  const modal = document.getElementById('weekly-report-modal');
  const ws = getWeekStart(S.today);
  const we = getWeekEnd(ws);
  const weekNum = S.week;

  document.getElementById('weekly-report-title').textContent = '第 ' + weekNum + ' 周 · 本周战报';
  document.getElementById('weekly-report-date').textContent = ws.replace(/-/g, '/') + ' - ' + we.replace(/-/g, '/');

  const thisWeekCheckins = await dbGetCheckinsBetween(ws, we);
  const lastWeekStart = fmtDate(new Date(new Date(ws + 'T00:00:00').getTime() - 7 * 86400000));
  const lastWeekEnd = fmtDate(new Date(new Date(we + 'T00:00:00').getTime() - 7 * 86400000));
  const lastWeekCheckins = await dbGetCheckinsBetween(lastWeekStart, lastWeekEnd);

  const calcStudy = (checkins) => checkins.reduce((sum, c) => {
    const sd = c.schedule_data || {};
    const sessions = [...(sd.sessions || []), ...(sd.timer_sessions || [])];
    return sum + sessions.filter(s => s.category === 'study').reduce((s, sess) => s + (sess.duration || 0), 0);
  }, 0);

  const thisStudy = calcStudy(thisWeekCheckins);
  const lastStudy = calcStudy(lastWeekCheckins);

  const thisWorkouts = await dbGetWorkoutsBetween(ws, we);
  const lastWorkouts = await dbGetWorkoutsBetween(lastWeekStart, lastWeekEnd);
  const thisVol = thisWorkouts.reduce((sum, w) => sum + (w.exercises ? Object.values(w.exercises).reduce((s, ex) => s + (ex.totalVolume || 0), 0) : 0), 0);
  const lastVol = lastWorkouts.reduce((sum, w) => sum + (w.exercises ? Object.values(w.exercises).reduce((s, ex) => s + (ex.totalVolume || 0), 0) : 0), 0);

  const allWeights = await dbGetWeightLogs(56);
  const thisWeekWeight = allWeights.filter(w => w.date >= ws && w.date <= we);
  const lastWeekWeight = allWeights.filter(w => w.date >= lastWeekStart && w.date <= lastWeekEnd);
  const thisW = thisWeekWeight.length ? thisWeekWeight[thisWeekWeight.length - 1].weight : '-';
  const lastW = lastWeekWeight.length ? lastWeekWeight[lastWeekWeight.length - 1].weight : '-';

  const statsHtml =
    '<div class="bg-gradient-to-b from-blue-900/30 to-dark-700/50 rounded-xl p-3 text-center border border-blue-500/10">' +
      '<p class="text-lg font-bold text-blue-400">' + (thisStudy / 60).toFixed(1) + 'h</p>' +
      '<p class="text-[10px] text-gray-400">📘 学习</p>' +
      '<p class="text-[10px] ' + (thisStudy >= lastStudy ? 'text-accent' : 'text-gray-500') + '">' + (thisStudy >= lastStudy ? '↑' : '↓') + ' ' + Math.abs((thisStudy - lastStudy) / 60).toFixed(1) + 'h</p></div>' +
    '<div class="bg-gradient-to-b from-red-900/30 to-dark-700/50 rounded-xl p-3 text-center border border-red-500/10">' +
      '<p class="text-lg font-bold text-danger">' + thisWorkouts.length + '次</p>' +
      '<p class="text-[10px] text-gray-400">🏋️ 训练</p>' +
      '<p class="text-[10px] ' + (thisVol >= lastVol ? 'text-accent' : 'text-gray-500') + '">' + Math.round(thisVol) + 'kg</p></div>' +
    '<div class="bg-gradient-to-b from-purple-900/30 to-dark-700/50 rounded-xl p-3 text-center border border-purple-500/10">' +
      '<p class="text-lg font-bold text-purple-400">' + thisW + 'kg</p>' +
      '<p class="text-[10px] text-gray-400">⚖️ 体重</p>' +
      '<p class="text-[10px] ' + (thisW <= lastW ? 'text-accent' : 'text-gray-500') + '">' + (lastW !== '-' && thisW !== '-' ? (thisW - lastW > 0 ? '+' : '') + (thisW - lastW).toFixed(1) + 'kg' : '-') + '</p></div>' +
    '<div class="bg-gradient-to-b from-gray-800/50 to-dark-700/50 rounded-xl p-3 text-center border border-gray-500/10">' +
      '<p class="text-lg font-bold text-gray-400">' + Math.round(24 * 7 - thisStudy / 60 - thisWorkouts.length * 1.5) + 'h</p>' +
      '<p class="text-[10px] text-gray-400">😴 未记录</p></div>';
  document.getElementById('weekly-report-stats').innerHTML = statsHtml;

  const prev4Weeks = [];
  for (let i = 3; i >= 0; i--) {
    const s = fmtDate(new Date(new Date(ws + 'T00:00:00').getTime() - i * 7 * 86400000));
    const e = fmtDate(new Date(new Date(s + 'T00:00:00').getTime() + 6 * 86400000));
    const checkins = await dbGetCheckinsBetween(s, e);
    const study = calcStudy(checkins);
    prev4Weeks.push({ week: Math.max(1, S.week - i), study: study / 60 });
  }
  const maxStudy = Math.max(...prev4Weeks.map(w => w.study), 1);
  const chartHtml = prev4Weeks.map(w => {
    const pct = Math.min((w.study / maxStudy) * 100, 100);
    const isCurrent = w.week === S.week;
    return '<div class="flex items-center gap-2"><span class="text-[10px] text-gray-500 w-8">第' + w.week + '周</span><div class="flex-1 bg-dark-700 rounded-full h-2"><div class="bg-blue-500 rounded-full h-2" style="width:' + pct + '%"></div></div><span class="text-[10px] ' + (isCurrent ? 'text-blue-400 font-bold' : 'text-gray-500') + ' w-10 text-right">' + w.study.toFixed(1) + 'h</span></div>';
  }).join('');
  document.getElementById('weekly-report-charts').innerHTML = chartHtml || '<p class="text-xs text-gray-500">暂无足够数据</p>';

  const nextWeekStart = fmtDate(new Date(new Date(ws + 'T00:00:00').getTime() + 7 * 86400000));
  const nextDay = (S.day % 7) + 1;
  const nextWeekNum = S.week + (nextDay === 1 ? 1 : 0);
  const isDeload = nextWeekNum % 4 === 0;
  const previewText = isDeload
    ? '下周是第 ' + nextWeekNum + ' 周 · 第 ' + nextDay + ' 天开始。📌 下周为 Deload 减载周（建议重量降至 80%）'
    : '下周是第 ' + nextWeekNum + ' 周 · 第 ' + nextDay + ' 天开始。💪 下周为常规训练周，预计训练 4 天';
  document.getElementById('weekly-report-preview').textContent = previewText;

  document.getElementById('weekly-report-no-more').checked = false;
  modal.classList.remove('hidden');
}

function closeWeeklyReport() {
  const noMore = document.getElementById('weekly-report-no-more')?.checked;
  if (noMore) {
    localStorage.setItem('ft_weekly_report_seen_' + getWeekStart(S.today), '1');
  }
  document.getElementById('weekly-report-modal').classList.add('hidden');
}

function copyWeeklyReportText() {
  const el = document.getElementById('weekly-report-content');
  const text = el ? el.innerText : '';
  navigator.clipboard.writeText(text).then(() => alert('周报已复制到剪贴板'));
}

function exportWeeklyReportImage() {
  const el = document.getElementById('weekly-report-content');
  if (!el) return;
  if (typeof html2canvas !== 'undefined') {
    html2canvas(el, { backgroundColor: '#0b0f19', scale: 2 }).then(canvas => {
      const link = document.createElement('a');
      link.download = '周报_第' + S.week + '周_' + S.today + '.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    });
  } else {
    alert('html2canvas 未加载，已降级为复制文字');
    copyWeeklyReportText();
  }
}

function checkWeeklyReport() {
  const autoWeekly = getAutoWeeklyReportSetting();
  const today = new Date(S.today + 'T00:00:00');
  const dayOfWeek = today.getDay();
  const nowH = new Date().getHours();
  const ws = getWeekStart(S.today);
  if (autoWeekly && dayOfWeek === 0 && nowH >= 22 && !localStorage.getItem('ft_weekly_report_seen_' + ws)) {
    localStorage.setItem('ft_weekly_report_seen_' + ws, '1');
    generateWeeklyReport();
  }
}

// ==================== 模块三：体型拍照记录 ====================

function showBodyPhotoPanel() {
  document.getElementById('body-photo-date').value = S.today;
  window._tempPhotos = {};
  ['front', 'side', 'back'].forEach(t => {
    document.getElementById('photo-' + t + '-preview').classList.add('hidden');
    document.getElementById('photo-' + t + '-img').src = '';
  });
  renderBodyPhotoTimeline();
  document.getElementById('body-photo-panel').classList.remove('hidden');
}

function closeBodyPhotoPanel() {
  document.getElementById('body-photo-panel').classList.add('hidden');
}

async function compressImage(file, maxWidth = 800, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => {
      img.src = e.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = maxWidth / img.width;
        canvas.width = maxWidth;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function handlePhotoUpload(type, input) {
  const file = input.files?.[0];
  if (!file) return;
  input.value = '';
  try {
    const compressed = await compressImage(file);
    if (!window._tempPhotos) window._tempPhotos = {};
    window._tempPhotos[type] = compressed;
    const preview = document.getElementById('photo-' + type + '-preview');
    const img = document.getElementById('photo-' + type + '-img');
    img.src = compressed;
    preview.classList.remove('hidden');
  } catch (e) {
    alert('图片处理失败: ' + e.message);
  }
}

function saveBodyPhotos() {
  const date = document.getElementById('body-photo-date').value || S.today;
  const photos = JSON.parse(localStorage.getItem('ft_body_photos') || '{}');
  if (!photos[date]) photos[date] = {};
  if (window._tempPhotos) {
    if (window._tempPhotos.front) photos[date].front = window._tempPhotos.front;
    if (window._tempPhotos.side) photos[date].side = window._tempPhotos.side;
    if (window._tempPhotos.back) photos[date].back = window._tempPhotos.back;
  }
  localStorage.setItem('ft_body_photos', JSON.stringify(photos));
  localStorage.setItem('ft_body_photo_last_date', date);
  window._tempPhotos = {};
  alert('体型照片已保存');
  renderBodyPhotoTimeline();
}

function renderBodyPhotoTimeline() {
  const photos = JSON.parse(localStorage.getItem('ft_body_photos') || '{}');
  const dates = Object.keys(photos).sort().reverse();
  const timeline = document.getElementById('body-photo-timeline');
  if (dates.length === 0) {
    timeline.innerHTML = '<div class="empty-state py-4"><div class="empty-state-icon">🕸️</div><div class="text-xs">暂无记录</div></div>';
    document.getElementById('body-photo-detail').classList.add('hidden');
    return;
  }
  timeline.innerHTML = dates.map(d => {
    const dt = new Date(d + 'T00:00:00');
    const label = (dt.getMonth() + 1) + '/' + dt.getDate();
    return '<button onclick="showBodyPhotoDetail(\'' + d + '\')" class="shrink-0 bg-dark-700/50 hover:bg-dark-700 text-gray-300 text-xs px-3 py-2 rounded-lg transition">' + label + '</button>';
  }).join('');
  if (dates.length > 0) showBodyPhotoDetail(dates[0]);
}

function showBodyPhotoDetail(date) {
  const photos = JSON.parse(localStorage.getItem('ft_body_photos') || '{}');
  const entry = photos[date];
  if (!entry) return;
  document.getElementById('body-photo-detail-date').textContent = date;
  const grid = document.getElementById('body-photo-detail-grid');
  const types = [{ key: 'front', label: '正面' }, { key: 'side', label: '侧面' }, { key: 'back', label: '背面' }];
  grid.innerHTML = types.map(t => {
    const src = entry[t.key];
    return '<div class="bg-dark-700/30 rounded-lg p-2 text-center">' +
      (src ? '<img src="' + src + '" class="w-full rounded-lg mb-1" style="aspect-ratio:3/4;object-fit:cover;">' : '<div class="w-full rounded-lg mb-1 bg-dark-700 flex items-center justify-center text-gray-500 text-xs" style="aspect-ratio:3/4;">无照片</div>') +
      '<p class="text-[10px] text-gray-400">' + t.label + '</p></div>';
  }).join('');
  document.getElementById('body-photo-detail').classList.remove('hidden');
}

function deleteAllBodyPhotos() {
  if (!confirm('确定删除全部体型照片？此操作不可恢复。')) return;
  localStorage.removeItem('ft_body_photos');
  localStorage.removeItem('ft_body_photo_last_date');
  renderBodyPhotoTimeline();
  alert('全部体型照片已删除');
}

function checkBodyPhotoReminder() {
  const today = new Date(S.today + 'T00:00:00');
  const banner = document.getElementById('bodyphoto-reminder-banner');
  if (!banner) return;
  if (today.getDate() !== 1) { banner.classList.add('hidden'); return; }
  const lastPhotoDate = localStorage.getItem('ft_body_photo_last_date');
  if (lastPhotoDate && lastPhotoDate.startsWith(S.today.slice(0, 7))) {
    banner.classList.add('hidden');
  } else {
    banner.classList.remove('hidden');
  }
}

function hideBodyPhotoBanner() {
  const banner = document.getElementById('bodyphoto-reminder-banner');
  if (banner) banner.classList.add('hidden');
}

// ==================== 全局计时器更新 ====================
setInterval(() => {
  if (currentTimer.running && S.tab === 'schedule') {
    renderSchedule();
  }
  updateHeaderTotal();
  const nowH = new Date().getHours();
  const nowM = new Date().getMinutes();
  const autoReport = getAutoReportSetting();
  if (autoReport && nowH >= 22 && !localStorage.getItem('ft_report_seen_' + S.today)) {
    localStorage.setItem('ft_report_seen_' + S.today, '1');
    generateDailyReport();
  }
  // 周报自动触发
  checkWeeklyReport();
}, 1000);

// ==================== 页面可见性校正 ====================
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;

  // 校正主计时器
  if (currentTimer.running && S.tab === 'schedule') {
    renderSchedule();
  }
  updateHeaderTotal();

  // 校正训练计时器
  if (trainingSession.started) updateTrainingTimerDisplay();

  // 校正组间休息倒计时
  if (restState.running && !restState.paused) {
    const remaining = Math.max(0, Math.ceil((restState.end - Date.now()) / 1000));
    const display = document.getElementById('rest-timer-display');
    const ring = document.getElementById('rest-progress-ring');
    if (display && ring) {
      const m = Math.floor(remaining / 60);
      const s = remaining % 60;
      display.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
      const pct = restState.total > 0 ? remaining / restState.total : 0;
      const offset = 283 * pct;
      ring.setAttribute('stroke-dashoffset', offset);
    }
    if (remaining <= 0) {
      if (restInterval) clearInterval(restInterval);
      restState.running = false;
      localStorage.removeItem('ft_rest_timer');
      sendRestNotification(restState.exercise, restState.setNum);
      playRestEndSound();
      setTimeout(hideRestModal, 2500);
    }
  }
});
setTimeout(() => {
  // 1. 显示主屏幕
  const main = document.getElementById('main-screen');
  if (main && main.classList.contains('hidden')) {
    main.classList.remove('hidden');
    main.style.display = 'flex';
  }

  // 2. 显示日程 Tab
  const tab = document.getElementById('tab-schedule');
  if (tab && tab.classList.contains('hidden')) {
    tab.classList.remove('hidden');
    tab.style.display = 'block';
  }

  // 3. 强制重新渲染日程内容（关键）
  if (typeof renderSchedule === 'function') {
    renderSchedule();
  }

  // 4. 日期选择器保底
  const picker = document.getElementById('date-picker') || document.querySelector('input[type="date"]');
  if (picker && !picker.value) {
    picker.value = (window.S && S.today) ? S.today : new Date().toISOString().split('T')[0];
  }
}, 100);