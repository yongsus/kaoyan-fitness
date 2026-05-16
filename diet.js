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

  const morningSnackEl = document.getElementById('meal-morningSnack');
  const lunchOilWrap = document.getElementById('lunch-oil-wrap');
  if (morningSnackEl) morningSnackEl.classList.toggle('hidden', S.rest);
  if (lunchOilWrap) lunchOilWrap.classList.toggle('hidden', S.rest);

  renderMealConfirmationState();
}

// ==================== 餐段确认 ====================
const MEAL_META = {
  breakfast:      { title: '🌅 早餐',       time: '07:30' },
  morningSnack:   { title: '☀️ 上午加餐',    time: '11:15' },
  lunch:          { title: '🌞 午餐',       time: '13:00' },
  afternoonSnack: { title: '🥤 加餐',       time: '16:00' },
  dinner:         { title: '🌆 晚餐',       time: '17:45' },
  bedtime:        { title: '🌙 睡前',       time: '23:00' }
};

function getConfirmedMealsKey() { return 'ft_meal_confirmed_' + S.today; }

function getConfirmedMeals() {
  const raw = localStorage.getItem(getConfirmedMealsKey());
  if (!raw) return [];
  try { return JSON.parse(raw); } catch(e) { return []; }
}

function setConfirmedMeals(meals) {
  localStorage.setItem(getConfirmedMealsKey(), JSON.stringify(meals));
}

function getConfirmedMealItemTexts(mealKey) {
  const checks = getDietChecks();
  const items = DIET_ITEMS[mealKey];
  if (!items) return [];
  const texts = [];
  Object.entries(items).forEach(([key, item]) => {
    if (checks[mealKey] && checks[mealKey][key]) {
      if (mealKey === 'lunch' && key === 'oliveOil' && S.rest) return;
      texts.push(item.name);
    }
  });

  // 午餐/晚餐额外加上蛋白和碳水
  if (mealKey === 'lunch') {
    const lp = document.getElementById('lunch-protein')?.value || '0';
    const lc = document.getElementById('lunch-carb')?.value || 'potato';
    if (lp !== '0' && FOOD_DB.lunchProtein[lp]) {
      const pNames = { fish260: '巴沙鱼', chicken160: '去皮鸡腿', shrimp180: '基围虾', breast150: '鸡胸肉', pork140: '梅花肉', beef160: '瘦牛肉' };
      texts.push(pNames[lp] || lp);
    }
    const cNames = { potato: '🥔 土豆', mantou: '🍞 馒头', corn: '🌽 玉米', rice: '🍚 米饭', noodles: '🍜 挂面' };
    if (cNames[lc]) texts.push(cNames[lc]);
  }
  if (mealKey === 'dinner') {
    const dp = document.getElementById('dinner-protein')?.value || '0';
    const dc = document.getElementById('dinner-carb')?.value || 'potato';
    if (dp !== '0' && FOOD_DB.dinnerProtein[dp]) {
      const pNames = { tofu300: '内酯豆腐', fish140: '巴沙鱼', shrimp90: '基围虾', eggwhite150: '鸡蛋白', pork70: '梅花肉', beef80: '瘦牛肉' };
      texts.push(pNames[dp] || dp);
    }
    const cNames = { potato: '🥔 土豆', mantou: '🍞 馒头', corn: '🌽 玉米', rice: '🍚 米饭', noodles: '🍜 挂面' };
    if (cNames[dc]) texts.push(cNames[dc]);
  }

  return texts;
}

function extractMlFromName(name) {
  const m = String(name).match(/(\d+)\s*ml/i);
  return m ? parseInt(m[1]) : 0;
}

function addMilkWater(mealKey, direction) {
  const checks = getDietChecks();
  const items = DIET_ITEMS[mealKey];
  if (!items || !checks[mealKey]) return;
  Object.entries(items).forEach(([key, item]) => {
    if (key === 'milk' && checks[mealKey][key]) {
      const ml = extractMlFromName(item.name);
      if (ml > 0) addWater(ml * direction);
    }
  });
}

function confirmMeal(mealKey) {
  if (mealKey === 'morningSnack' && S.rest) return;
  const confirmed = getConfirmedMeals();
  if (!confirmed.includes(mealKey)) {
    confirmed.push(mealKey);
    setConfirmedMeals(confirmed);
  }
  addMilkWater(mealKey, 1);
  renderMealConfirmationState();
}

function cancelMeal(mealKey) {
  const confirmed = getConfirmedMeals().filter(m => m !== mealKey);
  setConfirmedMeals(confirmed);
  addMilkWater(mealKey, -1);
  renderMealConfirmationState();
}

function renderMealConfirmationState() {
  const confirmed = getConfirmedMeals();
  const container = document.getElementById('confirmed-meals-container');
  const list = document.getElementById('confirmed-meals-list');
  if (!container || !list) return;

  // 显示/隐藏原始餐段
  Object.keys(MEAL_META).forEach(key => {
    const el = document.getElementById('meal-' + key);
    if (!el) return;
    if (key === 'morningSnack' && S.rest) {
      el.classList.add('hidden');
      return;
    }
    if (confirmed.includes(key)) {
      el.classList.add('hidden');
    } else {
      el.classList.remove('hidden');
    }
  });

  // 渲染已确认区域
  if (confirmed.length === 0) {
    container.classList.add('hidden');
    list.innerHTML = '';
    return;
  }

  container.classList.remove('hidden');
  let html = '';
  confirmed.forEach(key => {
    const meta = MEAL_META[key];
    if (!meta) return;
    const totalId = key === 'morningSnack' ? 'morning-total' : (key === 'afternoonSnack' ? 'afternoon-total' : key + '-total');
    const totalText = document.getElementById(totalId)?.textContent || '';
    const items = getConfirmedMealItemTexts(key);
    html += '<div class="bg-dark-700/40 rounded-lg p-3 border border-white/5">' +
      '<div class="flex items-center justify-between mb-1">' +
      '<div class="flex items-center gap-2">' +
      '<span class="text-sm text-gray-200">' + meta.title + ' ' + meta.time + '</span>' +
      '<span class="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">✓ 已确认</span>' +
      '</div>' +
      '<button onclick="cancelMeal(\'' + key + '\')" class="text-[10px] text-gray-500 hover:text-gray-300 transition">取消</button>' +
      '</div>' +
      '<div class="text-[11px] text-gray-400">' + (items.length ? items.join(' · ') : '暂无选择') + '</div>' +
      '<div class="text-[11px] text-gray-500 mt-0.5">' + totalText + '</div>' +
      '</div>';
  });
  list.innerHTML = html;
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

  renderMealConfirmationState();
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
