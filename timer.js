async function initTimers() {
  timerSessions = [];
  const sd = S.checkin?.schedule_data || {};
  timerSessions = sd.timer_sessions || [];
  initCurrentTimer();
  if (isCloudTimerMode()) {
    await initCloudTimer();
  }
}

let currentTimer = { running: false, startTime: 0, category: '', subCategory: '', note: '', feeling: '', isPaused: false, pauseStart: 0, pauseRecords: [], mainDuration: 0, pauseDuration: 0, segments: [] };

function initCurrentTimer() {
  const saved = localStorage.getItem('ft_current_timer');
  if (saved) {
    try {
      const data = JSON.parse(saved);
      if (data.date === S.today && data.running) {
        if (!Array.isArray(data.segments)) {
          localStorage.removeItem('ft_current_timer');
          return;
        }
        currentTimer = data;
        if (typeof currentTimer.mainDuration !== 'number') currentTimer.mainDuration = 0;
        if (typeof currentTimer.pauseDuration !== 'number') currentTimer.pauseDuration = 0;
        if (typeof currentTimer.isPaused !== 'boolean') currentTimer.isPaused = false;
        if (typeof currentTimer.pauseStart !== 'number') currentTimer.pauseStart = 0;
        if (!Array.isArray(currentTimer.pauseRecords)) currentTimer.pauseRecords = [];
        if (!Array.isArray(currentTimer.segments)) currentTimer.segments = [];
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
  if (currentTimer.isPaused) return currentTimer.mainDuration || 0;
  return (currentTimer.mainDuration || 0) + Math.floor((Date.now() - currentTimer.startTime) / 1000);
}

function getCurrentPauseDurationSec() {
  if (!currentTimer.running || !currentTimer.isPaused) return 0;
  return Math.floor((Date.now() - currentTimer.pauseStart) / 1000);
}

function getTotalPauseDurationSec() {
  if (!currentTimer.running) return 0;
  return (currentTimer.pauseDuration || 0) + getCurrentPauseDurationSec();
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

// ==================== 云端多端共享计时 ====================

function isCloudTimerMode() {
  return !localMode && sbUser && sbClient;
}

let cloudTimerChannel = null;
let cloudTimerHeartbeat = null;
let cloudTimerLocalStart = 0;

async function initCloudTimer() {
  if (!isCloudTimerMode()) return;
  await subscribeActiveTimer();
  const existing = await getActiveTimer();
  if (existing && ['running', 'paused'].includes(existing.status)) {
    syncTimerFromCloud(existing);
    startCloudTimerHeartbeat();
  } else if (currentTimer.running) {
    localExitTimerUI();
  }
}

async function subscribeActiveTimer() {
  if (!sbClient || !sbUser) return;
  if (cloudTimerChannel) {
    cloudTimerChannel.unsubscribe();
    cloudTimerChannel = null;
  }
  cloudTimerChannel = sbClient.channel('global-timer-' + sbUser.id)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'active_timers',
      filter: 'user_id=eq.' + sbUser.id
    }, (payload) => {
      const data = payload.new;
      if (!data || data.status === 'stopped') {
        localExitTimerUI();
      } else {
        syncTimerFromCloud(data);
      }
    })
    .subscribe();
}

function syncTimerFromCloud(data) {
  currentTimer = {
    running: true,
    startTime: data.is_paused ? 0 : new Date(data.updated_at).getTime(),
    category: data.category,
    subCategory: data.sub_category,
    note: data.note || '',
    feeling: '',
    isPaused: data.is_paused,
    pauseStart: data.is_paused && data.pause_start ? new Date(data.pause_start).getTime() : 0,
    pauseRecords: [],
    mainDuration: data.total_main_seconds,
    pauseDuration: 0,
    segments: []
  };
  if (!data.is_paused) {
    cloudTimerLocalStart = new Date(data.updated_at).getTime();
  }
  saveCurrentTimer();
  renderSchedule();
  updateHeaderTotal();
}

function localExitTimerUI() {
  currentTimer = { running: false, startTime: 0, category: '', subCategory: '', note: '', feeling: '', isPaused: false, pauseStart: 0, pauseRecords: [], mainDuration: 0, pauseDuration: 0, segments: [] };
  cloudTimerLocalStart = 0;
  stopCloudTimerHeartbeat();
  saveCurrentTimer();
  renderSchedule();
  updateHeaderTotal();
}

async function startCloudTimer(cat, sub, note) {
  const existing = await getActiveTimer();
  if (existing && ['running', 'paused'].includes(existing.status)) {
    const lastUpdated = new Date(existing.updated_at).getTime();
    if (Date.now() - lastUpdated > 60000) {
      await deleteActiveTimer();
    } else {
      showTimerConflictModal(existing, cat, sub, note);
      return;
    }
  }

  const nowIso = new Date().toISOString();
  await upsertActiveTimer({
    category: cat,
    sub_category: sub,
    started_at: nowIso,
    is_paused: false,
    pause_start: null,
    total_main_seconds: 0,
    status: 'running',
    note: note || '',
    updated_at: nowIso
  });

  currentTimer = {
    running: true,
    startTime: new Date(nowIso).getTime(),
    category: cat,
    subCategory: sub,
    note: note || '',
    feeling: '',
    isPaused: false,
    pauseStart: 0,
    pauseRecords: [],
    mainDuration: 0,
    pauseDuration: 0,
    segments: []
  };
  cloudTimerLocalStart = new Date(nowIso).getTime();
  saveCurrentTimer();
  renderSchedule();
  updateHeaderTotal();
  startCloudTimerHeartbeat();
}

async function stopCloudTimer() {
  const existing = await getActiveTimer();
  let finalMainSeconds = currentTimer.mainDuration || 0;
  let cat = currentTimer.category;
  let sub = currentTimer.subCategory;
  let note = currentTimer.note;
  let startedAt = new Date().toISOString();

  if (existing) {
    finalMainSeconds = existing.total_main_seconds;
    if (existing.status === 'running') {
      finalMainSeconds += Math.floor((Date.now() - cloudTimerLocalStart) / 1000);
    }
    cat = existing.category;
    sub = existing.sub_category;
    note = existing.note || '';
    startedAt = existing.started_at;

    const saved = S.checkin?.schedule_data || {};
    if (!saved.timer_sessions) saved.timer_sessions = [];
    saved.timer_sessions.push({
      startTime: startedAt,
      endTime: new Date().toISOString(),
      duration: Math.round(finalMainSeconds / 60),
      category: cat,
      subCategory: sub,
      note: note,
      feeling: ''
    });
    S.checkin = await dbUpsertCheckin(S.today, saved);

    await deleteActiveTimer();
  }

  stopCloudTimerHeartbeat();

  currentTimer = {
    running: false,
    startTime: 0,
    category: cat,
    subCategory: sub,
    note: note,
    feeling: '',
    isPaused: false,
    pauseStart: 0,
    pauseRecords: [],
    mainDuration: finalMainSeconds,
    pauseDuration: 0,
    segments: []
  };
  cloudTimerLocalStart = 0;
  saveCurrentTimer();
  renderSchedule();
  updateHeaderTotal();
}

async function pauseCloudTimer() {
  const existing = await getActiveTimer();
  if (!existing || existing.status !== 'running') return;

  const segmentSeconds = Math.floor((Date.now() - cloudTimerLocalStart) / 1000);
  const newTotal = existing.total_main_seconds + segmentSeconds;
  const nowIso = new Date().toISOString();

  await updateActiveTimer({
    is_paused: true,
    pause_start: nowIso,
    total_main_seconds: newTotal,
    status: 'paused',
    updated_at: nowIso
  });

  currentTimer.isPaused = true;
  currentTimer.pauseStart = new Date(nowIso).getTime();
  currentTimer.startTime = 0;
  currentTimer.mainDuration = newTotal;
  saveCurrentTimer();
  renderSchedule();
  updateHeaderTotal();
}

async function resumeCloudTimer() {
  const existing = await getActiveTimer();
  if (!existing || existing.status !== 'paused') return;

  const nowIso = new Date().toISOString();
  await updateActiveTimer({
    is_paused: false,
    pause_start: null,
    status: 'running',
    updated_at: nowIso
  });

  currentTimer.isPaused = false;
  currentTimer.pauseStart = 0;
  currentTimer.startTime = new Date(nowIso).getTime();
  cloudTimerLocalStart = new Date(nowIso).getTime();
  saveCurrentTimer();
  renderSchedule();
  updateHeaderTotal();
}

function startCloudTimerHeartbeat() {
  stopCloudTimerHeartbeat();
  cloudTimerHeartbeat = setInterval(async () => {
    if (!isCloudTimerMode() || !currentTimer.running || currentTimer.isPaused) return;
    const existing = await getActiveTimer();
    if (!existing || existing.status !== 'running') return;
    const segmentSeconds = Math.floor((Date.now() - cloudTimerLocalStart) / 1000);
    if (segmentSeconds <= 0) return;
    const newTotal = existing.total_main_seconds + segmentSeconds;
    const nowIso = new Date().toISOString();
    await updateActiveTimer({
      total_main_seconds: newTotal,
      updated_at: nowIso
    });
    cloudTimerLocalStart = new Date(nowIso).getTime();
  }, 10000);
}

function stopCloudTimerHeartbeat() {
  if (cloudTimerHeartbeat) {
    clearInterval(cloudTimerHeartbeat);
    cloudTimerHeartbeat = null;
  }
}

function showTimerConflictModal(existing, newCat, newSub, newNote) {
  const cinfo = CATEGORIES[existing.category];
  const subName = cinfo?.subs?.[existing.sub_category]?.name || existing.sub_category;
  const dur = existing.total_main_seconds + Math.floor((Date.now() - new Date(existing.started_at).getTime()) / 1000);

  document.getElementById('timer-conflict-device').textContent = '其他设备';
  document.getElementById('timer-conflict-cat').textContent = (cinfo?.name || existing.category) + (subName ? ' - ' + subName : '');
  document.getElementById('timer-conflict-dur').textContent = formatDurationCN(dur);
  document.getElementById('timer-conflict-modal').classList.remove('hidden');

  window._timerConflictNewCat = newCat;
  window._timerConflictNewSub = newSub;
  window._timerConflictNewNote = newNote;
}

async function forceReplaceActiveTimer() {
  closeTimerConflictModal();
  const cat = window._timerConflictNewCat;
  const sub = window._timerConflictNewSub;
  const note = window._timerConflictNewNote;
  await deleteActiveTimer();
  await startCloudTimer(cat, sub, note);
}

function closeTimerConflictModal() {
  document.getElementById('timer-conflict-modal').classList.add('hidden');
}

// ==================== 本地模式计时（保持不变）====================

async function togglePause() {
  const now = Date.now();
  if (isCloudTimerMode() && currentTimer.running) {
    if (currentTimer.isPaused) {
      await resumeCloudTimer();
    } else {
      await pauseCloudTimer();
    }
    return;
  }
  if (currentTimer.isPaused) {
    await resumeTimer(now);
  } else {
    await pauseTimer(now);
  }
}

async function pauseTimer(now) {
  const saved = S.checkin?.schedule_data || {};
  if (!saved.sessions) saved.sessions = [];

  const mainDur = Math.floor((now - currentTimer.startTime) / 1000);
  currentTimer.mainDuration = (currentTimer.mainDuration || 0) + mainDur;

  const mainSession = {
    startTime: new Date(currentTimer.startTime).toISOString(),
    endTime: new Date(now).toISOString(),
    duration: Math.round(mainDur / 60),
    category: currentTimer.category,
    subCategory: currentTimer.subCategory,
    note: currentTimer.note,
    feeling: ''
  };
  saved.sessions.push(mainSession);
  currentTimer.segments.push({ type: 'main', startTime: mainSession.startTime });

  S.checkin = await dbUpsertCheckin(S.today, saved);

  currentTimer.isPaused = true;
  currentTimer.pauseStart = now;
  currentTimer.startTime = 0;

  saveCurrentTimer();
  renderSchedule();
  updateHeaderTotal();
}

async function resumeTimer(now) {
  const saved = S.checkin?.schedule_data || {};
  if (!saved.sessions) saved.sessions = [];

  const pauseDur = Math.floor((now - currentTimer.pauseStart) / 1000);
  currentTimer.pauseDuration = (currentTimer.pauseDuration || 0) + pauseDur;

  const pauseSession = {
    startTime: new Date(currentTimer.pauseStart).toISOString(),
    endTime: new Date(now).toISOString(),
    duration: Math.round(pauseDur / 60),
    category: 'rest',
    subCategory: '间歇',
    note: '',
    feeling: ''
  };
  saved.sessions.push(pauseSession);
  currentTimer.segments.push({ type: 'pause', startTime: pauseSession.startTime });

  S.checkin = await dbUpsertCheckin(S.today, saved);

  currentTimer.isPaused = false;
  currentTimer.pauseStart = 0;
  currentTimer.startTime = now;

  saveCurrentTimer();
  renderSchedule();
  updateHeaderTotal();
}

async function toggleMainTimer() {
  const now = Date.now();
  if (currentTimer.running) {
    if (isCloudTimerMode()) {
      await stopCloudTimer();
      showTimerSummaryModal();
      return;
    }

    const saved = S.checkin?.schedule_data || {};
    if (!saved.sessions) saved.sessions = [];

    if (currentTimer.isPaused && currentTimer.pauseStart) {
      const pauseDur = Math.floor((now - currentTimer.pauseStart) / 1000);
      currentTimer.pauseDuration = (currentTimer.pauseDuration || 0) + pauseDur;

      const pauseSession = {
        startTime: new Date(currentTimer.pauseStart).toISOString(),
        endTime: new Date(now).toISOString(),
        duration: Math.round(pauseDur / 60),
        category: 'rest',
        subCategory: '间歇',
        note: '',
        feeling: ''
      };
      saved.sessions.push(pauseSession);
      currentTimer.segments.push({ type: 'pause', startTime: pauseSession.startTime });

      S.checkin = await dbUpsertCheckin(S.today, saved);
    } else if (currentTimer.startTime) {
      const mainDur = Math.floor((now - currentTimer.startTime) / 1000);
      currentTimer.mainDuration = (currentTimer.mainDuration || 0) + mainDur;

      const mainSession = {
        startTime: new Date(currentTimer.startTime).toISOString(),
        endTime: new Date(now).toISOString(),
        duration: Math.round(mainDur / 60),
        category: currentTimer.category,
        subCategory: currentTimer.subCategory,
        note: currentTimer.note,
        feeling: ''
      };
      saved.sessions.push(mainSession);
      currentTimer.segments.push({ type: 'main', startTime: mainSession.startTime });

      S.checkin = await dbUpsertCheckin(S.today, saved);
    }

    saveCurrentTimer();
    showTimerSummaryModal();
  } else {
    const preset = getSmartPreset();
    const cat = document.getElementById('main-cat-select')?.value || preset.category;
    const sub = document.getElementById('main-sub-select')?.value || preset.subCategory;
    const note = document.getElementById('main-note')?.value || '';

    if (isCloudTimerMode()) {
      await startCloudTimer(cat, sub, note);
      return;
    }

    currentTimer = { running: true, startTime: now, category: cat, subCategory: sub, note, feeling: '', isPaused: false, pauseStart: 0, pauseRecords: [], mainDuration: 0, pauseDuration: 0, segments: [] };
    saveCurrentTimer();
    renderSchedule();
    updateHeaderTotal();
  }
}

let pendingTrainingStart = false;
let pendingTrainingRecord = null;

function showTimerSummaryModal() {
  const cinfo = CATEGORIES[currentTimer.category];
  const subName = cinfo?.subs?.[currentTimer.subCategory]?.name || currentTimer.subCategory;
  document.getElementById('timer-summary-cat').textContent = (cinfo?.name || currentTimer.category) + (subName ? ' - ' + subName : '');
  document.getElementById('timer-summary-main').textContent = formatDurationCN(currentTimer.mainDuration || 0);
  document.getElementById('timer-summary-pause').textContent = formatDurationCN(currentTimer.pauseDuration || 0);
  document.getElementById('timer-summary-note').value = currentTimer.note || '';
  document.getElementById('timer-summary-feeling').value = '';
  document.getElementById('timer-summary-modal').classList.remove('hidden');
}

function closeTimerSummaryModal() {
  document.getElementById('timer-summary-modal').classList.add('hidden');
}

async function skipTimerSummary() {
  currentTimer = { running: false, startTime: 0, category: '', subCategory: '', note: '', feeling: '', isPaused: false, pauseStart: 0, pauseRecords: [], mainDuration: 0, pauseDuration: 0, segments: [] };
  saveCurrentTimer();
  closeTimerSummaryModal();
  renderSchedule();
  updateHeaderTotal();
  if (pendingTrainingStart) {
    pendingTrainingStart = false;
    await doStartTraining();
  }
}

async function saveTimerSummary() {
  const note = document.getElementById('timer-summary-note').value || '';
  const feeling = document.getElementById('timer-summary-feeling').value || '';

  const saved = S.checkin?.schedule_data || {};

  if (isCloudTimerMode() && saved.timer_sessions && saved.timer_sessions.length > 0) {
    const last = saved.timer_sessions[saved.timer_sessions.length - 1];
    last.note = note;
    last.feeling = feeling;
    S.checkin = await dbUpsertCheckin(S.today, saved);
  } else if (saved.sessions) {
    for (const seg of currentTimer.segments) {
      if (seg.type === 'main') {
        const target = saved.sessions.find(s => s.startTime === seg.startTime);
        if (target) {
          target.note = note;
          target.feeling = feeling;
        }
      }
    }
    S.checkin = await dbUpsertCheckin(S.today, saved);
  }

  currentTimer = { running: false, startTime: 0, category: '', subCategory: '', note: '', feeling: '', isPaused: false, pauseStart: 0, pauseRecords: [], mainDuration: 0, pauseDuration: 0, segments: [] };
  saveCurrentTimer();
  closeTimerSummaryModal();
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
