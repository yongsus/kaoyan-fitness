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

// ==================== Active Timers (多端共享计时) ====================
async function getActiveTimer() {
  if (!sbClient || !sbUser) return null;
  const { data, error } = await sbClient.from('active_timers').select('*').eq('user_id', sbUser.id).maybeSingle();
  if (error) { console.error('[getActiveTimer]', error); return null; }
  return data;
}
async function upsertActiveTimer(row) {
  if (!sbClient || !sbUser) return null;
  const { data, error } = await sbClient.from('active_timers').upsert({ ...row, user_id: sbUser.id }, { onConflict: 'user_id' }).select().single();
  if (error) { console.error('[upsertActiveTimer]', error); return null; }
  return data;
}
async function updateActiveTimer(updates) {
  if (!sbClient || !sbUser) return null;
  const { data, error } = await sbClient.from('active_timers').update(updates).eq('user_id', sbUser.id).select().single();
  if (error) { console.error('[updateActiveTimer]', error); return null; }
  return data;
}
async function deleteActiveTimer() {
  if (!sbClient || !sbUser) return null;
  const { error } = await sbClient.from('active_timers').delete().eq('user_id', sbUser.id);
  if (error) console.error('[deleteActiveTimer]', error);
  return !error;
}

// ============================================================
// 应用逻辑
// ============================================================

