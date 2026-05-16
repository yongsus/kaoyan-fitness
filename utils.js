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
  if (label.includes('游戏') || label.includes('娱乐') || label.includes('自由时间')) return 'entertainment';
  return 'other';
}

const CATEGORIES = {
  study: { name: '学习', icon: '📚', color: '#3b82f6', subs: { math: { name: '数学', icon: '📘' }, '408': { name: '408', icon: '📗' }, politics: { name: '政治', icon: '📕' }, english: { name: '英语', icon: '📙' } } },
  workout: { name: '健身', icon: '🏋️', color: '#ef4444' },
  rest: { name: '休息', icon: '😴', color: '#9ca3af', subs: { nap: { name: '午休', icon: '💤' }, meditation: { name: '冥想', icon: '🧘' }, pomodoro: { name: '间歇', icon: '⏸️' }, sleep: { name: '睡眠', icon: '🛢️' } } },
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

function getYesterday(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  return fmtDate(d);
}

function calculateWeekDay(dateStr) {
  // 1. 今天手动修改过，直接使用手动值
  const manual = localStorage.getItem('ft_manual_day');
  if (manual) {
    const data = JSON.parse(manual);
    if (data.date === dateStr) return { week: data.week || 1, day: data.day || 1 };
  }

  // 2. 有昨天的周期状态，基于昨天 +1 推算今天
  const lastRaw = localStorage.getItem('ft_last_cycle_state');
  if (lastRaw) {
    const last = JSON.parse(lastRaw);
    const yesterday = getYesterday(dateStr);
    if (last.date === yesterday) {
      let day = last.day + 1;
      let week = last.week;
      if (day > 7) {
        day = 1;
        week += 1;
      }
      return { week, day };
    }
  }

  // 3. 无近期状态，基于 ft_cycle_start 自动计算
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

function formatTime(d) {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return h + ':' + m;
}

let _scheduleSearchResultsCache = [];

function onScheduleSearchInput(value) {
  clearTimeout(_searchDebounceTimer);
  _searchDebounceTimer = setTimeout(() => {
    renderScheduleSearchResults(value);
  }, 300);
}

async function renderScheduleSearchResults(keyword) {
  const container = document.getElementById('schedule-search-results');
  if (!container) return;

  const kw = (keyword || '').trim().toLowerCase();
  if (!kw) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = '<div class="text-xs text-gray-500 py-2">搜索中...</div>';
  _globalSearchData = null;
  await loadGlobalSearchData();
  const results = performGlobalSearch(keyword);
  _scheduleSearchResultsCache = results;

  if (results.length === 0) {
    container.innerHTML = '<div class="empty-state py-4"><div class="empty-state-icon">🔍</div><div class="text-xs">未找到包含「' + escapeHtml(keyword) + '」的记录</div></div>';
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
    html += '<div class="bg-dark-700/40 rounded-lg p-2.5 cursor-pointer hover:bg-dark-600/40 transition" onclick="openScheduleSearchResult(' + i + ')">' +
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

async function openScheduleSearchResult(idx) {
  const r = _scheduleSearchResultsCache[idx];
  if (!r) return;
  _searchResultRefresh = () => {
    const keyword = document.getElementById('schedule-search-input')?.value || '';
    if (keyword) renderScheduleSearchResults(keyword);
  };
  if (r.type === 'workout') {
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
  } else if (r.type === 'schedule') {
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
    if (targetIdx >= 0) showSessionDetailModal(targetIdx, r.date);
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
  }
}

function formatMinutesCN(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0 && m > 0) return `${h}小时${m}分`;
  if (h > 0) return `${h}小时`;
  return `${m}分`;
}

function safeDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
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
