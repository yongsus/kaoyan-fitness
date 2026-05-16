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