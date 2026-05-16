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
  if (!Array.isArray(sets)) return 0;
  let total = 0;
  for (let i = 0; i < sets.length; i++) {
    const s = sets[i];
    if (!s || !s.done) continue;
    const w = parseFloat(s.weight || 0);
    const r = parseFloat(s.reps || s.seconds || 0);
    if (isNaN(w) || isNaN(r)) continue;
    total += w * r;
  }
  return total;
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
        if (typeof data.startTime === 'number' && data.startTime > 0) {
          trainingSession = data;
          if (trainingSession.phase !== 'done') startTrainingTimer();
        } else {
          trainingSession = { started: false, startTime: 0, phase: 'idle' };
          saveTrainingSession();
        }
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
    .filter(w => w.date !== today && w.exercises && w.exercises[exName] && w.exercises[exName].sets && w.exercises[exName].sets.some(s => s && s.done && parseFloat(s.weight) > 0))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-limit)
    .map(w => {
      const exData = w.exercises[exName];
      const doneSets = exData.sets.filter(s => s && s.done && parseFloat(s.weight) > 0);
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
  const doneSets = (ld.sets || []).filter(s => s && s.done);
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
    pendingTrainingStart = true;
    showTimerSummaryModal();
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
  // 清空当天 workout，确保每次开始训练都是全新状态
  const info = CYCLE[(S.day - 1) % 7];
  S.workout = await dbUpsertWorkout(S.today, S.day, info.name, {});
  await renderWorkout();
}

async function endTraining() {
  if (!trainingSession.started) return;
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
  if (!S.workout) {
    const info = CYCLE[(S.day - 1) % 7];
    S.workout = { exercises: {}, workout_type: info.name, date: S.today, cycle_day: S.day };
  }
  if (!S.workout.exercises) S.workout.exercises = {};
  const saved = S.workout.exercises;
  if (!saved[exName]) saved[exName] = { sets: [], notes: '', feeling: '' };
  if (!saved[exName].sets) saved[exName].sets = [];
  // 确保中间索引都有默认对象，避免稀疏数组导致索引错位
  for (let i = 0; i <= setIdx; i++) {
    if (!saved[exName].sets[i]) {
      saved[exName].sets[i] = { set: i+1, weight: '', reps: '', seconds: '', done: false };
    }
  }

  saved[exName].sets[setIdx].done = done;

  const info = CYCLE[(S.day - 1) % 7];
  const plan = PLANS[info.name] || [];
  const ex = plan.find(e => e.n === exName);
  // fixed/range 类型自动补回 reps 默认值，避免容量计算为0
  const rr = parseRepRange(ex?.s || '');
  if (rr.type === 'fixed') {
    saved[exName].sets.forEach(s => {
      if (s && (!s.reps && s.reps !== 0)) s.reps = String(rr.value);
    });
  } else if (rr.type === 'range') {
    saved[exName].sets.forEach(s => {
      if (s && (!s.reps && s.reps !== 0)) s.reps = String(rr.min);
    });
  }
  saved[exName].totalVolume = calculateVolume(saved[exName].sets);
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
    const allSetsDone = saved[exName].sets.length >= ex.sets && saved[exName].sets.every(s => s && s.done);
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
    const sets = (ed.sets || []).filter(Boolean);
    if (sets.length < ex.sets) { allDone = false; return; }
    sets.forEach(s => { if (!s || !s.done) allDone = false; });
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
    const sets = (ed.sets || []).filter(Boolean);
    const doneCount = sets.filter(s => s && s.done).length;
    const vol = calculateVolume(sets);
    totalVol += vol;
    const statusColor = doneCount >= ex.sets ? 'text-accent' : (doneCount > 0 ? 'text-yellow-400' : 'text-gray-500');
    const statusText = doneCount >= ex.sets ? '已完成' : doneCount + '/' + ex.sets;
    if (ed.feeling) feelingCounts[ed.feeling] = (feelingCounts[ed.feeling] || 0) + 1;
    let volText = '';
    if (ex.type === 'carry') {
      const totalSec = sets.reduce((s, set) => s + (parseFloat(set?.seconds || 0)), 0);
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
    let totalWorkoutVol = 0;
    plan.forEach((ex) => {
      const exKey = ex.n;
      if (!saved[exKey]) saved[exKey] = { sets: [], notes: '', feeling: '' };
      const ed = saved[exKey];
      const repInfo = parseRepRange(ex.s);
      // 用 map 填充缺失项，避免 filter(Boolean) 导致索引错位
      let sets = (ed.sets || []).map((s, i) => {
        const base = s || { set: i+1, weight: '', reps: '', seconds: '', done: false };
        // fixed/range 类型且 reps 为空时自动补回默认值
        if (repInfo.type === 'fixed' && (!base.reps && base.reps !== 0)) {
          base.reps = String(repInfo.value);
        } else if (repInfo.type === 'range' && (!base.reps && base.reps !== 0)) {
          base.reps = String(repInfo.min);
        }
        return base;
      });
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

      // 固定组数：初始化/补齐/截断
      if (ex.sets) {
        if (!sets.length) {
          if (repInfo.type === 'time') {
            sets = Array.from({length: ex.sets}, (_, i) => ({set: i+1, weight: '', seconds: '', done: false}));
          } else if (repInfo.type === 'fixed') {
            sets = Array.from({length: ex.sets}, (_, i) => ({set: i+1, weight: '', reps: String(repInfo.value), done: false}));
          } else if (repInfo.type === 'range') {
            sets = Array.from({length: ex.sets}, (_, i) => ({set: i+1, weight: '', reps: String(repInfo.min), done: false}));
          } else {
            sets = Array.from({length: ex.sets}, (_, i) => ({set: i+1, weight: '', reps: '', done: false}));
          }
        } else if (sets.length < ex.sets) {
          for (let i = sets.length; i < ex.sets; i++) {
            const defaultReps = repInfo.type === 'fixed' ? String(repInfo.value) : (repInfo.type === 'range' ? String(repInfo.min) : '');
            sets.push({set: i+1, weight: '', reps: defaultReps, seconds: '', done: false});
          }
        } else if (sets.length > ex.sets) {
          sets = sets.slice(0, ex.sets);
        }
        // 训练未开始时重置 done 状态
        if (!trainingSession.started) {
          sets.forEach(s => s.done = false);
        }
        ed.sets = sets;
      }

      let tipHtml = '';
      if (tip) {
        tipHtml = '<div class="text-[11px] text-accent mb-2"><span class="bg-accent/10 px-1.5 py-0.5 rounded border border-accent/20">' + tip + '</span></div>';
      }

      // 上次记录单独显示
      let lastRecordHtml = '';
      if (lastSession && lastSession.sets && lastSession.sets.some(s => s && (s.weight || s.reps || s.seconds))) {
        const dateObj = new Date(lastSession.date + 'T00:00:00');
        const dateStr = (dateObj.getMonth() + 1) + '/' + dateObj.getDate();
        const setTexts = lastSession.sets.filter(Boolean).map(s => {
          if (ex.type === 'carry') {
            return (s.weight || '-') + '×' + (s.seconds || '-') + 's';
          } else if (repInfo.type === 'fixed') {
            return (s.weight || '-') + '×' + repInfo.value;
          } else {
            return (s.weight || '-') + '×' + (s.reps || '-');
          }
        });
        const fColors = { easy: 'text-green-400 bg-green-500/10 border-green-500/20', normal: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20', hard: 'text-red-400 bg-red-500/10 border-red-500/20' };
        const fLabels = { easy: '😊 轻松', normal: '😐 一般', hard: '😰 困难' };
        let lr = '<div class="text-[11px] text-gray-400 mb-2 bg-dark-700/30 p-2 rounded-lg border border-white/5">';
        lr += '<div class="flex items-center gap-1.5 flex-wrap">';
        lr += '<span class="text-gray-500">上次 ' + dateStr + ':</span>';
        lr += '<span>' + setTexts.join(' / ') + '</span>';
        if (lastSession.feeling) {
          lr += '<span class="text-[10px] px-1 py-0.5 rounded border ' + (fColors[lastSession.feeling] || '') + '">' + (fLabels[lastSession.feeling] || '') + '</span>';
        }
        lr += '</div>';
        if (lastSession.notes) {
          lr += '<div class="mt-1 text-gray-500">💬 ' + escapeHtml(lastSession.notes) + '</div>';
        }
        lr += '</div>';
        lastRecordHtml = lr;
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
        feelingStateHtml = '<div class="mt-2 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-center cursor-pointer" onclick="event.stopPropagation(); showExerciseFeelingModal(\'' + ex.n + '\')"><span class="text-xs text-yellow-400">⚠️ 动作已完成，请点击选择本次感受</span></div>';
      } else if (ed.feeling) {
        const fColors = { easy: 'text-green-400 bg-green-500/10 border-green-500/20', normal: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20', hard: 'text-red-400 bg-red-500/10 border-red-500/20' };
        const fLabels = { easy: '😊 轻松', normal: '😐 一般', hard: '😰 困难' };
        feelingStateHtml = '<div class="mt-2"><span class="text-xs px-2 py-0.5 rounded border ' + (fColors[ed.feeling] || '') + '">' + (fLabels[ed.feeling] || '') + '</span></div>';
      }

      const repPart = ex.s.replace(/^(\d+)(组|x)/, '');
      const restText = ex.sets <= 1 ? '无' : ex.rest + '秒';
      const paramLine = ex.sets + '组 x ' + repPart + ' | 组间休息：' + restText;
      html += '<div class="p-3 bg-dark-700/40 rounded-xl cursor-pointer" onclick="showExerciseDetailModal(\'' + ex.n + '\')">' +
        '<div class="flex justify-between items-start mb-1"><div>' +
        '<span class="text-sm font-medium cursor-pointer hover:text-accent" onclick="event.stopPropagation(); showExerciseChart(\'' + ex.n + '\')">' + ex.n + '</span>' +
        '<span class="text-xs text-gray-500 ml-2">' + paramLine + '</span></div></div>' +
        tipText + lastRecordHtml + tipHtml +
        '<div class="space-y-1.5 mb-2">';

      sets.forEach((set, sidx) => {
        const doneCls = set.done ? 'opacity-50' : '';
        let repsHtml = '';
        if (repInfo.type === 'fixed') {
          repsHtml = '<span class="text-xs text-gray-400 w-10 text-center">' + repInfo.value + '</span>';
        } else if (repInfo.type === 'range') {
          const options = [];
          for (let r = repInfo.min; r <= repInfo.max; r++) {
            const isSelected = (set.reps == r) || (!set.reps && r === repInfo.min);
            options.push('<option value="' + r + '" ' + (isSelected ? 'selected' : '') + '>' + r + '</option>');
          }
          repsHtml = '<select onclick="event.stopPropagation()" onchange="updateSet(\'' + ex.n + '\', ' + sidx + ', \'reps\', this.value)" class="w-16 bg-dark-700 border border-dark-600 rounded-lg px-1 py-1.5 focus:border-accent focus:outline-none appearance-none text-center text-xs">' + options.join('') + '</select>';
        } else if (repInfo.type === 'time') {
          repsHtml = '<input type="number" placeholder="秒" onclick="event.stopPropagation()" value="' + (set.seconds || '') + '" onchange="updateSet(\'' + ex.n + '\', ' + sidx + ', \'seconds\', this.value)" class="w-16 bg-dark-700 border border-dark-600 rounded-lg px-2 py-1.5 text-center focus:border-accent focus:outline-none text-xs">';
        }

        if (ex.type === 'carry') {
          // 农夫行走：重量 + 秒数
          html += '<div class="flex items-center gap-2 text-xs ' + doneCls + '">' +
            '<span class="w-10 text-gray-500 shrink-0">第' + set.set + '组</span>' +
            '<input type="number" placeholder="kg" onclick="event.stopPropagation()" value="' + (set.weight || '') + '" onchange="updateSet(\'' + ex.n + '\', ' + sidx + ', \'weight\', this.value)" class="w-16 bg-dark-700 border border-dark-600 rounded-lg px-2 py-1.5 text-center focus:border-accent focus:outline-none text-xs" ' + (set.done ? 'disabled' : '') + '>' +
            '<span class="text-gray-500">×</span>' +
            '<input type="number" placeholder="30-40" onclick="event.stopPropagation()" value="' + (set.seconds || '') + '" onchange="updateSet(\'' + ex.n + '\', ' + sidx + ', \'seconds\', this.value)" class="w-16 bg-dark-700 border border-dark-600 rounded-lg px-2 py-1.5 text-center focus:border-accent focus:outline-none text-xs" ' + (set.done ? 'disabled' : '') + '>' +
            '<span class="text-[10px] text-gray-500 shrink-0">秒</span>' +
            '<label class="flex items-center gap-1 cursor-pointer ml-auto shrink-0" onclick="event.stopPropagation()">' +
            '<input type="checkbox" ' + (set.done ? 'checked' : '') + ' onchange="toggleSetDone(\'' + ex.n + '\', ' + sidx + ', this.checked)" class="checkbox-custom w-4 h-4">' +
            '<span class="text-[10px] text-gray-400">完成</span>' +
            '</label>' +
            '</div>';
        } else {
          html += '<div class="flex items-center gap-2 text-xs ' + doneCls + '">' +
            '<span class="w-10 text-gray-500 shrink-0">第' + set.set + '组</span>' +
            '<input type="number" placeholder="kg" onclick="event.stopPropagation()" value="' + set.weight + '" onchange="updateSet(\'' + ex.n + '\', ' + sidx + ', \'weight\', this.value)" class="w-16 bg-dark-700 border border-dark-600 rounded-lg px-2 py-1.5 text-center focus:border-accent focus:outline-none" ' + (set.done ? 'disabled' : '') + '>' +
            '<span class="text-gray-500">×</span>' + repsHtml +
            '<label class="flex items-center gap-1 cursor-pointer ml-auto shrink-0" onclick="event.stopPropagation()">' +
            '<input type="checkbox" ' + (set.done ? 'checked' : '') + ' onchange="toggleSetDone(\'' + ex.n + '\', ' + sidx + ', this.checked)" class="checkbox-custom w-4 h-4">' +
            '<span class="text-[10px] text-gray-400">完成</span>' +
            '</label>' +
            '</div>';
        }
      });

      let vol = 0;
      for (let vi = 0; vi < sets.length; vi++) {
        const vs = sets[vi];
        if (vs && vs.done) {
          const vw = parseFloat(vs.weight || 0);
          const vr = parseFloat(vs.reps || vs.seconds || 0);
          if (!isNaN(vw) && !isNaN(vr)) vol += vw * vr;
        }
      }
      if (ex.type !== 'carry') totalWorkoutVol += vol;
      let volHtml = '';
      if (ex.type === 'carry') {
        let totalSec = 0;
        for (let vi = 0; vi < sets.length; vi++) {
          const vs = sets[vi];
          if (vs && vs.seconds) totalSec += parseFloat(vs.seconds) || 0;
        }
        volHtml = '<span class="text-xs font-bold text-accent">总秒数: ' + Math.round(totalSec) + '秒</span>';
      } else {
        volHtml = '<span class="text-xs font-bold text-accent">总容量: ' + Math.round(vol || 0) + 'kg</span>';
      }
      const notesPlaceholder = ex.type === 'carry' ? '记录动作备注：哑铃重量？握力感受？身体是否侧倾？' : '记录动作备注：握距是否舒适？是否需要调整？';
      const feelingIcon = ed.feeling ? ({ easy: '😌', normal: '😐', hard: '😫' }[ed.feeling] || '') : '';
      html += '</div>' +
        '<div class="flex items-center justify-between mb-2">' + volHtml + (feelingIcon ? '<span class="text-lg" title="' + ({ easy: '轻松', normal: '一般', hard: '困难' }[ed.feeling]) + '">' + feelingIcon + '</span>' : '') + '</div>' +
        feelingStateHtml + supersetHtml +
        '<div class="bg-dark-700/30 rounded-lg p-2.5 border border-white/5 mt-2" onclick="event.stopPropagation()">' +
        '<textarea placeholder="' + notesPlaceholder + '" onclick="event.stopPropagation()" onchange="updateSet(\'' + ex.n + '\', -1, \'notes\', this.value)" class="w-full bg-transparent text-xs text-gray-300 placeholder-gray-500 resize-none focus:outline-none" rows="2">' + (ed.notes || '') + '</textarea>' +
        '</div></div>';
    });
    if (totalWorkoutVol > 0) {
      html += '<div class="mt-4 p-3 bg-accent/10 rounded-xl border border-accent/30 flex items-center justify-between">' +
        '<span class="text-sm font-medium text-accent">🏋️ 本次训练总容量</span>' +
        '<span class="text-lg font-bold text-accent">' + Math.round(totalWorkoutVol) + 'kg</span>' +
        '</div>';
    }
    html += '</div>';
  }

  html += '</div>';
  c.innerHTML = html;
  if (trainingSession.started) updateTrainingTimerDisplay();
}

let _exDetailName = '';

function showExerciseDetailModal(exName) {
  _exDetailName = exName;
  const saved = S.workout?.exercises || {};
  const ed = saved[exName] || { sets: [], notes: '', feeling: '' };
  const info = CYCLE[(S.day - 1) % 7];
  const plan = PLANS[info.name] || [];
  const ex = plan.find(e => e.n === exName);
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
  document.getElementById('ex-detail-name').textContent = exName;
  document.getElementById('ex-detail-info').textContent = infoText;
  document.getElementById('ex-detail-feeling').value = ed.feeling || '';
  document.getElementById('ex-detail-note').value = ed.notes || '';
  renderExerciseDetailFeelingButtons();
  document.getElementById('exercise-detail-modal').classList.remove('hidden');
}

let _searchWorkoutData = null;

function closeExerciseDetailModal() {
  document.getElementById('exercise-detail-modal').classList.add('hidden');
  _exDetailName = '';
  _searchWorkoutData = null;
  if (_searchResultRefresh) { _searchResultRefresh(); _searchResultRefresh = null; }
}

function selectExerciseDetailFeeling(feeling) {
  const current = document.getElementById('ex-detail-feeling').value;
  document.getElementById('ex-detail-feeling').value = current === feeling ? '' : feeling;
  renderExerciseDetailFeelingButtons();
}

function renderExerciseDetailFeelingButtons() {
  const current = document.getElementById('ex-detail-feeling').value;
  const styles = {
    easy:   { active: 'bg-green-500/20 border-green-500 text-green-400', inactive: 'bg-dark-700 border-dark-600 text-gray-400' },
    normal: { active: 'bg-yellow-500/20 border-yellow-500 text-yellow-400', inactive: 'bg-dark-700 border-dark-600 text-gray-400' },
    hard:   { active: 'bg-red-500/20 border-red-500 text-red-400', inactive: 'bg-dark-700 border-dark-600 text-gray-400' }
  };
  ['easy', 'normal', 'hard'].forEach(f => {
    const btn = document.getElementById('ex-feel-' + f);
    if (!btn) return;
    const s = styles[f];
    btn.className = 'flex-1 py-3 rounded-lg border text-sm transition flex items-center justify-center gap-1 ' + (current === f ? s.active : s.inactive);
  });
}

async function saveExerciseDetail() {
  if (_searchWorkoutData) {
    await saveSearchWorkoutDetail();
    return;
  }
  if (!_exDetailName) return;
  const saved = S.workout?.exercises || {};
  if (!saved[_exDetailName]) saved[_exDetailName] = { sets: [], notes: '', feeling: '' };
  saved[_exDetailName].feeling = document.getElementById('ex-detail-feeling').value || '';
  saved[_exDetailName].notes = document.getElementById('ex-detail-note').value || '';
  saveWorkoutDebounced(saved);
  renderWorkout();
  closeExerciseDetailModal();
}

async function saveSearchWorkoutDetail() {
  if (!_exDetailName || !_searchWorkoutData) return;
  const saved = _searchWorkoutData.exercises || {};
  if (!saved[_exDetailName]) saved[_exDetailName] = { sets: [], notes: '', feeling: '' };
  saved[_exDetailName].feeling = document.getElementById('ex-detail-feeling').value || '';
  saved[_exDetailName].notes = document.getElementById('ex-detail-note').value || '';
  const info = CYCLE[(_searchWorkoutData.cycle_day - 1) % 7];
  await dbUpsertWorkout(_searchWorkoutData.date, _searchWorkoutData.cycle_day, info.name, saved);
  _searchWorkoutData = null;
  _exDetailName = '';
  closeExerciseDetailModal();
}

async function deleteExerciseDetail() {
  if (_searchWorkoutData) {
    await deleteSearchWorkoutDetail();
    return;
  }
  if (!_exDetailName) return;
  if (!confirm('确定删除「' + _exDetailName + '」的所有记录？')) return;
  const saved = S.workout?.exercises || {};
  delete saved[_exDetailName];
  saveWorkoutDebounced(saved);
  renderWorkout();
  closeExerciseDetailModal();
}

async function deleteSearchWorkoutDetail() {
  if (!_exDetailName || !_searchWorkoutData) return;
  if (!confirm('确定删除「' + _exDetailName + '」的所有记录？')) return;
  const saved = _searchWorkoutData.exercises || {};
  delete saved[_exDetailName];
  const info = CYCLE[(_searchWorkoutData.cycle_day - 1) % 7];
  await dbUpsertWorkout(_searchWorkoutData.date, _searchWorkoutData.cycle_day, info.name, saved);
  _searchWorkoutData = null;
  _exDetailName = '';
  closeExerciseDetailModal();
}

function updateSet(exName, setIdx, field, value) {
  if (!S.workout) {
    const info = CYCLE[(S.day - 1) % 7];
    S.workout = { exercises: {}, workout_type: info.name, date: S.today, cycle_day: S.day };
  }
  if (!S.workout.exercises) S.workout.exercises = {};
  const saved = S.workout.exercises;
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
    // 确保中间索引都有默认对象，避免稀疏数组导致索引错位
    for (let i = 0; i <= setIdx; i++) {
      if (!saved[exName].sets[i]) {
        saved[exName].sets[i] = { set: i+1, weight: '', reps: '', seconds: '', done: false };
      }
    }
    saved[exName].sets[setIdx][field] = value;
    // fixed/range 类型自动补回 reps 默认值，避免容量计算为0
    const rr = parseRepRange(ex?.s || '');
    if (rr.type === 'fixed') {
      saved[exName].sets.forEach(s => {
        if (s && (!s.reps && s.reps !== 0)) s.reps = String(rr.value);
      });
    } else if (rr.type === 'range') {
      saved[exName].sets.forEach(s => {
        if (s && (!s.reps && s.reps !== 0)) s.reps = String(rr.min);
      });
    }
    saved[exName].totalVolume = calculateVolume(saved[exName].sets);
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
        const doneSets = data.sets.filter(s => s && s.done && (parseFloat(s.weight || 0) > 0 || parseFloat(s.seconds || 0) > 0) && (parseFloat(s.reps || s.seconds || 0) > 0));
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
