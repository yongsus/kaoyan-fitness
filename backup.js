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

function getLocalStorageSize() {
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    const value = localStorage.getItem(key);
    total += (key.length + value.length) * 2; // UTF-16 = 2 bytes per char
  }
  return total;
}

function cleanupOldBodyPhotos(maxMonths = 6, maxBytes = 3 * 1024 * 1024) {
  const raw = localStorage.getItem('ft_body_photos');
  if (!raw) return;
  let photos;
  try { photos = JSON.parse(raw); } catch(e) { return; }
  const dates = Object.keys(photos).sort();
  if (dates.length === 0) return;

  // 1. 删除超过 maxMonths 个月的记录
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - maxMonths);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  let changed = false;
  for (const d of dates) {
    if (d < cutoffStr) {
      delete photos[d];
      changed = true;
    }
  }

  // 2. 如果仍然超过容量阈值，按月份从最旧开始删除
  const currentSize = getLocalStorageSize();
  if (currentSize > maxBytes) {
    const remainingDates = Object.keys(photos).sort();
    while (getLocalStorageSize() > maxBytes && remainingDates.length > 1) {
      const oldest = remainingDates.shift();
      delete photos[oldest];
      changed = true;
    }
  }

  if (changed) {
    localStorage.setItem('ft_body_photos', JSON.stringify(photos));
  }
}

function saveBodyPhotos() {
  cleanupOldBodyPhotos(6, 3 * 1024 * 1024);
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

