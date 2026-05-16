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
    feeling: '',
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

  window._relaxDetailRecords = [];
  const allCheckins = await dbGetAllCheckins();
  for (const c of allCheckins) {
    const r = c.schedule_data?.relaxation;
    if (!r) continue;
    (r.single?.records || []).forEach(rec => window._relaxDetailRecords.push({ rec, type: 'single', date: c.date, typeName: '单人', scheduleData: c.schedule_data }));
    (r.double?.records || []).forEach(rec => window._relaxDetailRecords.push({ rec, type: 'double', date: c.date, typeName: '双人', scheduleData: c.schedule_data }));
  }
  window._relaxDetailRecords.sort((a, b) => new Date(b.rec.created_at || b.rec.date).getTime() - new Date(a.rec.created_at || a.rec.date).getTime());

  const listEl = document.getElementById('relax-records-list');
  if (window._relaxDetailRecords.length === 0) {
    listEl.innerHTML = '<div class="empty-state py-4"><div class="empty-state-icon">🕸️</div><div class="text-xs">暂无记录</div></div>';
  } else {
    listEl.innerHTML = window._relaxDetailRecords.slice(0, 30).map((item, idx) => {
      const dt = new Date(item.rec.created_at || item.rec.date + 'T00:00:00');
      const dateStr = (dt.getMonth() + 1) + '/' + dt.getDate();
      const timeStr = String(dt.getHours()).padStart(2, '0') + ':' + String(dt.getMinutes()).padStart(2, '0');
      return '<div class="bg-dark-700/30 rounded-lg p-2 cursor-pointer" onclick="showRelaxDetailModal(' + idx + ')">' +
        '<div class="flex items-center justify-between mb-0.5">' +
        '<span class="text-[10px] text-gray-400">' + dateStr + ' ' + timeStr + ' · ' + item.typeName + '</span>' +
        '</div>' +
        (item.rec.note ? '<p class="text-xs text-gray-300">' + escapeHtml(item.rec.note) + '</p>' : '<p class="text-xs text-gray-500 italic">无感受记录</p>') +
        '</div>';
    }).join('');
  }
}

function showRelaxDetailModal(idx) {
  const item = window._relaxDetailRecords[idx];
  if (!item) return;
  window._relaxDetailIdx = idx;
  const dt = new Date(item.rec.created_at || item.rec.date + 'T00:00:00');
  const dateStr = (dt.getMonth() + 1) + '/' + dt.getDate();
  const timeStr = String(dt.getHours()).padStart(2, '0') + ':' + String(dt.getMinutes()).padStart(2, '0');
  document.getElementById('relax-detail-time').textContent = dateStr + ' ' + timeStr + ' · ' + item.typeName;
  document.getElementById('relax-detail-note').value = item.rec.note || '';
  document.getElementById('relax-detail-feeling').value = item.rec.feeling || '';
  document.getElementById('relax-detail-modal').classList.remove('hidden');
}

function closeRelaxDetailModal() {
  document.getElementById('relax-detail-modal').classList.add('hidden');
  window._relaxDetailIdx = -1;
  if (_searchResultRefresh) { _searchResultRefresh(); _searchResultRefresh = null; }
}

async function saveRelaxDetail() {
  const idx = window._relaxDetailIdx;
  if (idx === undefined || idx < 0) return;
  const item = window._relaxDetailRecords[idx];
  item.rec.note = document.getElementById('relax-detail-note').value || '';
  item.rec.feeling = document.getElementById('relax-detail-feeling').value || '';
  const updated = await dbUpsertCheckin(item.date, item.scheduleData);
  if (item.date === S.today) S.checkin = updated;
  renderRelaxationModal();
  closeRelaxDetailModal();
}

async function clearRelaxDetail() {
  const idx = window._relaxDetailIdx;
  if (idx === undefined || idx < 0) return;
  // 仅清空输入框，不自动保存；用户需点击保存按钮才能持久化
  document.getElementById('relax-detail-note').value = '';
  document.getElementById('relax-detail-feeling').value = '';
}

async function deleteRelaxFromDetail() {
  const idx = window._relaxDetailIdx;
  if (idx === undefined || idx < 0) return;
  if (!confirm('确定删除这条放松记录？')) return;
  const item = window._relaxDetailRecords[idx];
  item.scheduleData.relaxation[item.type].records = item.scheduleData.relaxation[item.type].records.filter(r => r !== item.rec);
  item.scheduleData.relaxation[item.type].count = Math.max(0, item.scheduleData.relaxation[item.type].records.length);
  const updated = await dbUpsertCheckin(item.date, item.scheduleData);
  if (item.date === S.today) S.checkin = updated;
  renderRelaxationModal();
  closeRelaxDetailModal();
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

