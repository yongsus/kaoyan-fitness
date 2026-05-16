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

  // 日期变更检测
  const lastOpen = localStorage.getItem('ft_last_open_date');
  if (lastOpen && lastOpen !== S.today) {
    // 日期变了，清除今天之前的手动覆盖（ yesterday 的 manual 已在 calculateWeekDay 中用于推算）
    const manual = localStorage.getItem('ft_manual_day');
    if (manual) {
      const data = JSON.parse(manual);
      if (data.date !== S.today) {
        localStorage.removeItem('ft_manual_day');
      }
    }
  }
  localStorage.setItem('ft_last_open_date', S.today);

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

  // 保存今天的周期状态，供次日推算
  localStorage.setItem('ft_last_cycle_state', JSON.stringify({ date: S.today, week: S.week, day: S.day }));

  await initTimers();
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
    // 保存手动选择和周期状态，供次日推算
    localStorage.setItem('ft_manual_day', JSON.stringify({ date: S.today, week: S.week, day: next }));
    localStorage.setItem('ft_last_cycle_state', JSON.stringify({ date: S.today, week: S.week, day: next }));
    await reloadTodayData();
    renderAll();
  }
}

async function chooseCustomDay(day) {
  closeCustomDayModal(); closeDayChoiceModal();
  S.day = day;
  S.profile = await dbUpdateProfile({ cycle_day: day });
  S.rest = CYCLE[(day - 1) % 7]?.type === 'rest';
  // 保存手动选择和周期状态，供次日推算
  localStorage.setItem('ft_manual_day', JSON.stringify({ date: S.today, week: S.week, day }));
  localStorage.setItem('ft_last_cycle_state', JSON.stringify({ date: S.today, week: S.week, day }));
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
  // 同时更新 ft_last_cycle_state，确保次日基于修改后的值推算
  localStorage.setItem('ft_last_cycle_state', JSON.stringify({ date: S.today, week, day }));
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
  localStorage.removeItem('ft_last_cycle_state');
  const wd = calculateWeekDay(S.today);
  S.week = wd.week;
  S.day = wd.day;
  S.rest = CYCLE[(S.day - 1) % 7]?.type === 'rest';
  viewWeek = S.week;
  viewDay = S.day;
  localStorage.setItem('ft_last_cycle_state', JSON.stringify({ date: S.today, week: S.week, day: S.day }));
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
  const allSessions = [...allOldSessions, ...allNewSessions].sort((a, b) => {
    const da = safeDate(a.startTime), db = safeDate(b.startTime);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return da - db;
  });

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

  // 计时按钮逻辑
  let timerBtnHtml = '';
  if (currentTimer.running && !isHistory) {
    const mainDur = formatDuration(getCurrentTimerDurationSec());
    const pauseCount = (currentTimer.segments || []).filter(s => s.type === 'pause').length;
    const totalPauseSec = getTotalPauseDurationSec();
    const isPaused = currentTimer.isPaused;
    const curPauseSec = getCurrentPauseDurationSec();

    let statusHtml = '<div class="mb-2">';
    if (isPaused) {
      statusHtml += '<div class="text-xs text-gray-400 mb-1">⏸️ 已暂停 · 主计时 ' + mainDur + '</div>';
      statusHtml += '<div class="text-sm text-yellow-400 font-mono">本次间歇 ' + formatDuration(curPauseSec) + '</div>';
    } else {
      statusHtml += '<div class="text-xs text-gray-400 mb-1">⏱️ 正在计时</div>';
      statusHtml += '<div class="text-lg font-bold text-white font-mono">' + mainDur + '</div>';
    }
    if (totalPauseSec > 0 && !isPaused) {
      statusHtml += '<div class="text-xs text-gray-500 mt-1">累计间歇 ' + formatDuration(totalPauseSec) + (pauseCount > 0 ? ' (' + pauseCount + '次)' : '') + '</div>';
    }
    statusHtml += '</div>';

    timerBtnHtml = statusHtml +
      '<div class="flex gap-2 mt-2">' +
      '<button onclick="togglePause()" class="flex-1 ' + (isPaused ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-yellow-600 hover:bg-yellow-500') + ' text-white font-semibold py-3 rounded-xl transition btn-press">' + (isPaused ? '▶️ 继续' : '⏸️ 暂停') + '</button>' +
      '<button onclick="toggleMainTimer()" class="flex-1 bg-danger hover:bg-danger-dark text-white font-semibold py-3 rounded-xl transition shadow-lg shadow-danger/20 btn-press">⏹️ 结束</button>' +
      '</div>';
  } else {
    const btnClass = isHistory ? 'w-full bg-dark-700 text-gray-500 font-semibold py-3 rounded-xl transition mt-3 cursor-not-allowed' : 'w-full bg-accent hover:bg-accent-dark text-white font-semibold py-3 rounded-xl transition shadow-lg shadow-accent/20 mt-3 btn-press';
    const btnText = isHistory ? '⏱️ 历史视图，无法计时' : '⏱️ 开始 [' + catInfo.name + (sub && catInfo.subs ? ' - ' + catInfo.subs[sub]?.name : '') + ']';
    timerBtnHtml = '<button onclick="' + (isHistory ? '' : 'toggleMainTimer()') + '" class="' + btnClass + '" ' + (isHistory ? 'disabled' : '') + '>' + btnText + '</button>';
  }

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
      const sStart = safeDate(s.startTime);
      const sEnd = safeDate(s.endTime);
      const dur = s.duration || (sStart && sEnd ? Math.round((sEnd - sStart) / 60000) : 0);
      const scat = s.category || 'other';
      const ssub = s.subCategory || s.subject || '';
      const cinfo = CATEGORIES[scat];
      const scolor = cinfo?.color || '#94a3b8';
      const sname = cinfo?.name || scat;
      const subName = (cinfo?.subs && cinfo.subs[ssub]) ? cinfo.subs[ssub].name : (ssub ? ssub : '');
      const hasFeeling = s.feeling && s.feeling.trim();
      const feelingId = 'feeling-' + i;
      const timeStr = (sStart && sEnd) ? (formatTime(sStart) + '-' + formatTime(sEnd)) : '--:--';
      recordsHtml += '<div class="flex items-center gap-2 p-2 bg-dark-700/40 rounded-lg transition hover:bg-dark-600/40 cursor-pointer" onclick="showSessionDetailModal(' + i + ')">' +
        '<span class="text-[10px] font-mono w-20 shrink-0" style="color:' + scolor + '">' + timeStr + '</span>' +
        '<span class="w-2 h-2 rounded-full shrink-0" style="background:' + scolor + '"></span>' +
        '<span class="text-xs text-gray-300 flex-1">' + sname + (subName ? ' - ' + subName : '') + ' · ' + formatMinutesCN(dur) + '</span>' +
        (hasFeeling ? '<button onclick="event.stopPropagation(); toggleFeelingDisplay(\'' + feelingId + '\')" class="text-xs text-accent shrink-0">💬</button>' : '') +
        (s.note ? '<span class="text-[10px] text-gray-500 max-w-[80px] truncate">' + escapeHtml(s.note) + '</span>' : '') +
        (!isHistory ? '<button onclick="event.stopPropagation(); deleteSession(' + i + ')" class="text-gray-500 hover:text-danger text-xs shrink-0">×</button>' : '') +
        '</div>';
      if (hasFeeling) {
        recordsHtml += '<div id="' + feelingId + '" class="hidden text-xs text-gray-400 bg-dark-700/20 rounded-lg p-2 ml-6">' + escapeHtml(s.feeling) + '</div>';
      }
      if (sEnd) lastEnd = sEnd;
    });
    if (currentTimer.running && !isHistory && !currentTimer.isPaused) {
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
    timerBtnHtml +
    '</div>';

  // Records
  if (recordsHtml) {
    html += '<div class="glass glass-hover rounded-xl p-4"><h3 class="font-medium text-sm mb-3">📋 ' + (isHistory ? '当日记录' : '今日记录') + '</h3>' + recordsHtml + '</div>';
  } else if (isHistory) {
    html += '<div class="glass glass-hover rounded-xl p-4"><h3 class="font-medium text-sm mb-3">📋 当日记录</h3><div class="empty-state py-4"><div class="empty-state-icon">🕸️</div><div class="text-xs">该日期暂无记录</div></div></div>';
  }

  // Search card
  html += '<div class="glass glass-hover rounded-xl p-4"><h3 class="font-medium text-sm mb-3">🔍 全局搜索</h3>' +
    '<input type="text" id="schedule-search-input" placeholder="搜索介绍或感受..." oninput="onScheduleSearchInput(this.value)" class="w-full bg-dark-700 border border-dark-600 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent text-gray-300 placeholder-gray-600">' +
    '<div id="schedule-search-results" class="mt-3 max-h-[400px] overflow-y-auto"></div></div>';

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
  const all = [...(saved.timer_sessions || []), ...(saved.sessions || [])].sort((a, b) => {
    const da = safeDate(a.startTime), db = safeDate(b.startTime);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return da - db;
  });
  const target = all[idx];
  if (saved.sessions) saved.sessions = saved.sessions.filter(s => s !== target);
  if (saved.timer_sessions) saved.timer_sessions = saved.timer_sessions.filter(s => s !== target);
  S.checkin = await dbUpsertCheckin(S.today, saved);
  renderSchedule();
}

let _sessionDetailTarget = null;
let _sessionDetailDate = '';

function sessionMatches(a, b) {
  return a.startTime === b.startTime && a.endTime === b.endTime && a.category === b.category;
}

async function getSessionDetailSaved() {
  const dateStr = _sessionDetailDate || S.today;
  if (dateStr === S.today) return S.checkin?.schedule_data || {};
  let checkin = historyCheckin;
  if (!checkin || checkin.date !== dateStr) {
    checkin = await dbGetCheckin(dateStr);
    historyCheckin = checkin || { date: dateStr, schedule_data: {} };
  }
  return historyCheckin.schedule_data || {};
}

async function showSessionDetailModal(idx, forcedDate) {
  const dateStr = forcedDate || viewDate || S.today;
  const isHistoryView = dateStr !== S.today;
  let checkin;
  if (isHistoryView) {
    if (historyCheckin && historyCheckin.date === dateStr) {
      checkin = historyCheckin;
    } else {
      checkin = await dbGetCheckin(dateStr);
      if (!checkin) checkin = { date: dateStr, schedule_data: {} };
      historyCheckin = checkin;
    }
  } else {
    checkin = S.checkin;
  }
  const saved = checkin?.schedule_data || {};
  const all = [...(saved.timer_sessions || []), ...(saved.sessions || [])].sort((a, b) => {
    const da = safeDate(a.startTime), db = safeDate(b.startTime);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return da - db;
  });
  const target = all[idx];
  if (!target) return;
  _sessionDetailTarget = target;
  _sessionDetailDate = dateStr;
  const sStart = safeDate(target.startTime);
  const sEnd = safeDate(target.endTime);
  const dur = target.duration || (sStart && sEnd ? Math.round((sEnd - sStart) / 60000) : 0);
  const scat = target.category || 'other';
  const ssub = target.subCategory || target.subject || '';
  const cinfo = CATEGORIES[scat];
  const sname = cinfo?.name || scat;
  const subName = (cinfo?.subs && cinfo.subs[ssub]) ? cinfo.subs[ssub].name : (ssub ? ssub : '');
  const timeText = (sStart && sEnd) ? (formatTime(sStart) + ' - ' + formatTime(sEnd) + ' · ' + sname + (subName ? ' - ' + subName : '') + ' · ' + formatMinutesCN(dur)) : '时间无效';
  document.getElementById('session-detail-time').textContent = timeText;
  const isCurrentMain = currentTimer.running && currentTimer.segments && currentTimer.segments.some(s => s.type === 'main' && s.startTime === target.startTime);
  document.getElementById('session-detail-note').value = target.note || '';
  document.getElementById('session-detail-feeling').value = target.feeling || '';
  const feelingWrap = document.getElementById('session-detail-feeling-wrap');
  const feelingLocked = document.getElementById('session-detail-feeling-locked');
  if (isCurrentMain) {
    if (feelingWrap) feelingWrap.classList.add('hidden');
    if (feelingLocked) feelingLocked.classList.remove('hidden');
  } else {
    if (feelingWrap) feelingWrap.classList.remove('hidden');
    if (feelingLocked) feelingLocked.classList.add('hidden');
  }
  document.getElementById('session-detail-modal').classList.remove('hidden');
}

function closeSessionDetailModal() {
  document.getElementById('session-detail-modal').classList.add('hidden');
  _sessionDetailTarget = null;
  _sessionDetailDate = '';
  if (_searchResultRefresh) { _searchResultRefresh(); _searchResultRefresh = null; }
}

async function saveSessionDetail() {
  if (!_sessionDetailTarget) return;
  const note = document.getElementById('session-detail-note').value || '';
  const feeling = document.getElementById('session-detail-feeling').value || '';
  const dateStr = _sessionDetailDate || S.today;
  const saved = await getSessionDetailSaved();

  const isCurrentMain = currentTimer.running && currentTimer.segments && currentTimer.segments.some(s => s.type === 'main' && s.startTime === _sessionDetailTarget.startTime);
  if (isCurrentMain) {
    currentTimer.note = note;
    if (saved.sessions) {
      for (const seg of currentTimer.segments) {
        if (seg.type === 'main') {
          const target = saved.sessions.find(s => s.startTime === seg.startTime);
          if (target) target.note = note;
        }
      }
    }
  } else {
    const all = [...(saved.timer_sessions || []), ...(saved.sessions || [])];
    const found = all.find(s => sessionMatches(s, _sessionDetailTarget));
    if (found) {
      found.note = note;
      found.feeling = feeling;
    }
  }

  const updated = await dbUpsertCheckin(dateStr, saved);
  if (dateStr === S.today) S.checkin = updated;
  if (dateStr !== S.today) historyCheckin = updated;
  renderSchedule();
  closeSessionDetailModal();
}

async function clearSessionDetail() {
  if (!_sessionDetailTarget) return;
  // 仅清空输入框，不自动保存；用户需点击保存按钮才能持久化
  document.getElementById('session-detail-note').value = '';
  document.getElementById('session-detail-feeling').value = '';
}

async function deleteSessionFromDetail() {
  if (!_sessionDetailTarget) return;
  if (!confirm('确定删除这条记录？')) return;
  const dateStr = _sessionDetailDate || S.today;
  const saved = await getSessionDetailSaved();
  if (saved.sessions) saved.sessions = saved.sessions.filter(s => !sessionMatches(s, _sessionDetailTarget));
  if (saved.timer_sessions) saved.timer_sessions = saved.timer_sessions.filter(s => !sessionMatches(s, _sessionDetailTarget));
  const updated = await dbUpsertCheckin(dateStr, saved);
  if (dateStr === S.today) S.checkin = updated;
  if (dateStr !== S.today) historyCheckin = updated;
  renderSchedule();
  closeSessionDetailModal();
}

// ==================== 全局搜索 ====================
let _globalSearchData = null;
let _searchResultsCache = [];
let _searchResultRefresh = null;
let _searchDebounceTimer = null;

async function loadGlobalSearchData() {
  if (_globalSearchData) return _globalSearchData;
  const [allCheckins, allWorkouts] = await Promise.all([dbGetAllCheckins(), dbGetAllWorkouts()]);
  const records = [];

  for (const c of allCheckins) {
    const sd = c.schedule_data || {};
    for (const s of (sd.sessions || [])) {
      records.push({
        type: 'schedule',
        icon: '📅',
        date: c.date,
        startTime: s.startTime,
        endTime: s.endTime,
        category: s.category,
        subCategory: s.subCategory,
        title: (CATEGORIES[s.category]?.name || s.category) + (s.subCategory ? ' - ' + (CATEGORIES[s.category]?.subs?.[s.subCategory]?.name || s.subCategory) : ''),
        note: s.note || '',
        feeling: s.feeling || '',
        raw: s
      });
    }
    const relaxation = sd.relaxation;
    if (relaxation) {
      for (const type of ['single', 'double']) {
        const typeName = type === 'single' ? '单人' : '双人';
        for (const r of (relaxation[type]?.records || [])) {
          records.push({
            type: 'relax',
            icon: '😴',
            date: r.date || c.date,
            startTime: r.created_at,
            endTime: r.created_at,
            category: 'rest',
            subCategory: 'relaxation',
            title: '放松 - ' + typeName,
            note: r.note || '',
            feeling: r.feeling || '',
            raw: r,
            relaxType: type
          });
        }
      }
    }
  }

  for (const w of allWorkouts) {
    for (const [exName, exData] of Object.entries(w.exercises || {})) {
      if (exName === '_session') continue;
      records.push({
        type: 'workout',
        icon: '🏋️',
        date: w.date,
        startTime: null,
        endTime: null,
        category: 'workout',
        subCategory: exName,
        title: (w.workout_type || '训练') + ' · ' + exName,
        note: exData.notes || '',
        feeling: exData.feeling || '',
        raw: { workout: w, exerciseName: exName, data: exData }
      });
    }
  }

  _globalSearchData = records;
  return records;
}

function performGlobalSearch(keyword) {
  if (!_globalSearchData) return [];
  const lowerKey = keyword.toLowerCase().trim();
  if (!lowerKey) return [];
  const results = _globalSearchData.filter(r => {
    const note = (r.note || '').toLowerCase();
    const feeling = (r.feeling || '').toLowerCase();
    return note.includes(lowerKey) || feeling.includes(lowerKey);
  });
  return results.sort((a, b) => b.date.localeCompare(a.date));
}

function highlightSearchSnippet(text, keyword) {
  if (!text || !keyword) {
    const t = text || '';
    return escapeHtml(t.length > 50 ? t.substring(0, 50) + '...' : t);
  }
  const lowerText = text.toLowerCase();
  const lowerKey = keyword.toLowerCase().trim();
  const idx = lowerText.indexOf(lowerKey);
  if (idx < 0) {
    const t = text.length > 50 ? text.substring(0, 50) + '...' : text;
    return escapeHtml(t);
  }
  const start = Math.max(0, idx - 15);
  const end = Math.min(text.length, idx + lowerKey.length + 15);
  const before = text.substring(start, idx);
  const match = text.substring(idx, idx + lowerKey.length);
  const after = text.substring(idx + lowerKey.length, end);
  let result = escapeHtml(before) + '<span class="bg-yellow-500/30 text-yellow-300 rounded px-0.5">' + escapeHtml(match) + '</span>' + escapeHtml(after);
  if (start > 0) result = '...' + result;
  if (end < text.length) result = result + '...';
  return result;
}

function onGlobalSearchInput(value) {
  clearTimeout(_searchDebounceTimer);
  _searchDebounceTimer = setTimeout(() => {
    renderGlobalSearchResults(value);
  }, 300);
}

async function renderGlobalSearchResults(keyword) {
  const container = document.getElementById('global-search-results');
  if (!container) return;

  if (!_globalSearchData) {
    container.innerHTML = '<div class="text-xs text-gray-500 text-center py-4">正在索引...</div>';
    await loadGlobalSearchData();
  }

  const results = performGlobalSearch(keyword);
  _searchResultsCache = results;

  if (results.length === 0) {
    container.innerHTML = '<div class="text-xs text-gray-500 text-center py-4">🔍 未找到包含「' + escapeHtml(keyword) + '」的记录</div>';
    return;
  }

  let html = '<div class="text-xs text-gray-400 mb-2">找到 ' + results.length + ' 条结果：</div>' +
    '<div class="space-y-2 max-h-[400px] overflow-y-auto pr-1">';

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const dateObj = new Date(r.date + 'T00:00:00');
    const dateStr = (dateObj.getMonth() + 1) + '/' + dateObj.getDate();
    const timeStr = r.startTime && r.endTime ? formatTime(new Date(r.startTime)) + '-' + formatTime(new Date(r.endTime)) : '';
    const snippet = highlightSearchSnippet(r.note || r.feeling, keyword);
    html += '<div class="bg-dark-700/40 rounded-lg p-2.5 cursor-pointer hover:bg-dark-600/40 transition" onclick="openSearchResult(' + i + ')">' +
      '<div class="flex items-center gap-2 mb-1">' +
      '<span class="text-sm">' + r.icon + '</span>' +
      '<span class="text-xs text-gray-400">' + dateStr + (timeStr ? ' ' + timeStr : '') + '</span>' +
      '<span class="text-xs text-gray-300 flex-1 truncate">' + escapeHtml(r.title) + '</span>' +
      '</div>' +
      (snippet ? '<div class="text-xs text-gray-400 leading-relaxed">' + snippet + '</div>' : '<div class="text-xs text-gray-500 italic">暂无介绍/感受</div>') +
      '</div>';
  }

  html += '</div>';
  container.innerHTML = html;
}

async function openSearchResult(idx) {
  const r = _searchResultsCache[idx];
  if (!r) return;
  _searchResultRefresh = () => {
    const keyword = document.getElementById('global-search-input')?.value || '';
    if (keyword) renderGlobalSearchResults(keyword);
  };

  if (r.type === 'schedule') {
    const checkin = await dbGetCheckin(r.date);
    if (!checkin) return;
    const saved = checkin.schedule_data || {};
    const all = [...(saved.timer_sessions || []), ...(saved.sessions || [])].sort((a, b) => {
      const da = safeDate(a.startTime), db = safeDate(b.startTime);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da - db;
    });
    const targetIdx = all.findIndex(s => s.startTime === r.raw.startTime && s.endTime === r.raw.endTime);
    if (targetIdx >= 0) {
      showSessionDetailModal(targetIdx, r.date);
    }
  } else if (r.type === 'relax') {
    const checkin = await dbGetCheckin(r.date);
    if (!checkin) return;
    window._relaxDetailRecords = [{
      rec: r.raw,
      type: r.relaxType,
      date: r.date,
      typeName: r.relaxType === 'single' ? '单人' : '双人',
      scheduleData: checkin.schedule_data
    }];
    showRelaxDetailModal(0);
  } else if (r.type === 'workout') {
    _searchWorkoutData = r.raw.workout;
    _exDetailName = r.raw.exerciseName;
    const saved = _searchWorkoutData.exercises || {};
    const ed = saved[_exDetailName] || { sets: [], notes: '', feeling: '' };
    const info = CYCLE[(_searchWorkoutData.cycle_day - 1) % 7];
    const plan = PLANS[info.name] || [];
    const ex = plan.find(e => e.n === _exDetailName);
    const sets = (ed.sets || []).filter(Boolean);
    const vol = calculateVolume(sets);
    const doneCount = sets.filter(s => s && s.done).length;
    const totalSets = ex ? ex.sets : sets.length;
    let infoText = (ex ? ex.sets + '组' : totalSets + '组') + ' · ';
    if (ex && ex.type === 'carry') {
      const totalSec = sets.reduce((s, set) => s + (parseFloat(set?.seconds || 0)), 0);
      infoText += '总秒数: ' + Math.round(totalSec) + '秒';
    } else {
      infoText += '总容量: ' + Math.round(vol) + 'kg';
    }
    infoText += ' · 已完成 ' + doneCount + '/' + totalSets;
    document.getElementById('ex-detail-name').textContent = _exDetailName;
    document.getElementById('ex-detail-info').textContent = infoText;
    document.getElementById('ex-detail-feeling').value = ed.feeling || '';
    document.getElementById('ex-detail-note').value = ed.notes || '';
    renderExerciseDetailFeelingButtons();
    document.getElementById('exercise-detail-modal').classList.remove('hidden');
  }
}

// ==================== 饮食 ====================
