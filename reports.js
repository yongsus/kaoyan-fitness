function generateDailyReport() {
  const modal = document.getElementById('daily-report-modal');
  const allOld = S.checkin?.schedule_data?.timer_sessions || [];
  const allNew = S.checkin?.schedule_data?.sessions || [];
  const all = [...allOld, ...allNew].sort((a, b) => {
    const da = safeDate(a.startTime), db = safeDate(b.startTime);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return da - db;
  });

  document.getElementById('report-date').textContent = '第' + S.week + '周第' + S.day + '天 · ' + S.today;

  // Timeline
  let timelineHtml = '';
  let lastEnd = new Date(S.today + 'T07:30:00');
  const dayEnd = new Date(S.today + 'T23:30:00');
  all.forEach(s => {
    const sStart = safeDate(s.startTime);
    const sEnd = safeDate(s.endTime);
    if (sStart && sStart > lastEnd) {
      const gapMin = Math.round((sStart - lastEnd) / 60000);
      if (gapMin > 5) {
        timelineHtml += '<div class="flex items-start gap-2 mb-2">' +
          '<div class="w-1.5 h-1.5 rounded-full bg-gray-600 shrink-0 mt-1.5"></div>' +
          '<div class="flex-1 bg-dark-700/20 rounded-lg p-2 border border-dashed border-dark-600/40">' +
          '<span class="text-[10px] text-gray-500 font-mono">' + formatTime(lastEnd) + ' - ' + (sStart ? formatTime(sStart) : '--:--') + '</span>' +
          '<span class="text-[11px] text-gray-500 ml-2">未记录</span></div></div>';
      }
    }
    const dur = s.duration || (sStart && sEnd ? Math.round((sEnd - sStart) / 60000) : 0);
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
      '<div class="flex justify-between items-center"><span class="text-[10px] font-mono text-gray-400">' + (sStart ? formatTime(sStart) : '--:--') + ' - ' + (sEnd ? formatTime(sEnd) : '--:--') + '</span>' +
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
        '<span class="text-[10px] text-gray-500 font-mono">' + (lastEnd ? formatTime(lastEnd) : '--:--') + ' - ' + formatTime(dayEnd) + '</span>' +
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
      const sStart = safeDate(s.startTime);
      const cinfo = CATEGORIES[s.category || 'other'];
      feelingEntries.push({
        time: sStart ? formatTime(sStart) : '--:--',
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
      const sStart = safeDate(r.startTime);
      const sEnd = safeDate(r.endTime);
      const timeRange = (sStart && sEnd) ? (formatTime(sStart) + '-' + formatTime(sEnd)) : '--:--';
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
        const sets = (ex.sets || []).filter(s => s && s.done).length;
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

