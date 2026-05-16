# AGENTS.md — 健身追踪系统

> 本文档供 AI 助手阅读，记录项目架构、数据模型、开发历史和待验收清单。

---

## 一、项目概览

| 属性 | 值 |
|---|---|
| 名称 | 健身追踪系统 |
| 类型 | 单页应用 (SPA) |
| 前端框架 | Vanilla JavaScript（无框架） |
| CSS | Tailwind CSS CDN v3 |
| 数据层 | Supabase JS Client CDN + localStorage fallback |
| 图表 | 原生 Canvas 2D + SVG（零外部图表库） |
| 运行方式 | 纯静态文件，浏览器直接打开 `index.html` |

---

## 二、架构约定

### 2.1 双模式数据层

系统同时维护两套几乎同构的 API：

```
云端模式 (Supabase)          本地模式 (localStorage)
getProfile()  ─────────────►  dbGetProfile()
upsertCheckin() ───────────►  dbUpsertCheckin()
getWorkoutsBetween() ──────►  dbGetWorkoutsBetween()
...                          ...
```

- `localMode` 全局布尔值控制走哪条分支
- 本地模式 `user_id` 固定为字符串 `'local'`（Supabase 要求 UUID，因此本地模式不走 Supabase 写入）
- **重要**：本地模式与云端模式的数据互不兼容，目前无自动迁移工具

### 2.2 全局状态对象 `S`

```js
let S = {
  user: null,        // Supabase user 对象
  profile: null,     // { cycle_day, last_completed_date, ... }
  today: '',         // 'YYYY-MM-DD'
  day: 1,            // 当前周期天 (1-7)
  week: 1,           // 当前周数
  rest: false,       // 今日是否休息日
  checkin: null,     // 今日打卡数据
  water: [],         // 今日饮水记录
  diet: null,        // 今日饮食数据
  workout: null,     // 今日训练数据
  weights: [],       // 体重记录数组（最近56条）
  weekData: [],      // 本周打卡数据数组
  tab: 'schedule'    // 当前 tab
};
```

### 2.3 localStorage Key 命名规范

所有业务 key 以 `ft_` 为前缀：

| Key 模式 | 数据类型 | 说明 |
|---------|---------|------|
| `ft_local_${entity}_${date}` | JSON | 本地模式实体数据（checkin/water/diet/workout） |
| `ft_local_weights` | Array | 本地体重记录 |
| `ft_local_waist` | Array | 本地腰围记录 |
| `ft_local_profile` | Object | 本地用户资料 |
| `ft_cycle_start` | String | 周期起始日 YYYY-MM-DD |
| `ft_manual_day` | Object | 手动覆盖的 week/day |
| `ft_ex_hist_${name}` | Object | 动作历史最佳缓存 |
| `ft_current_timer` | Object | 计时器状态（防刷新丢失） |
| `ft_rest_timer` | Object | 组间休息状态（防刷新丢失） |
| `ft_training_session` | Object | 训练会话状态 |
| `ft_auto_report` | '1'\|'0' | 自动日报开关 |
| `ft_auto_weekly_report` | '1'\|'0' | 自动周报开关 |
| `ft_report_seen_${date}` | '1' | 某日日报已查看标记 |
| `ft_weekly_report_seen_${weekStart}` | '1' | 某周周报已查看标记 |
| `ft_diet_checks` | Object | 饮食各餐勾选状态 |
| `ft_diet_targets` | Object | {kcal, p, c, f} |
| `ft_carb_${meal}` | String | 碳水来源选择 |
| `ft_body_profile` | Object | 身体数据 |
| `ft_last_backup_date` | String | 上次备份日期 |
| `ft_body_photos` | Object | {date: {front, side, back}} |
| `ft_body_photo_last_date` | String | 最后拍照日期 |
| `ft_warmup_${today}` | Object | 今日热身完成状态 |

非 `ft_` 前缀：
- `sb_url` / `sb_key` — Supabase 配置
- `last_open_${userId}` — 最后打开日期

---

## 三、训练数据结构

### 3.1 PLANS（4个训练日）

```js
PLANS = {
  '上肢A': [7个动作],
  '下肢B': [5个动作],
  '上肢B': [7个动作],
  '下肢A': [6个动作]
}
```

每个动作对象：
```js
{
  n: '动作名称',
  s: '组数x次数范围',      // 如 '4x8-12', '2x30-40秒'
  sets: 4,                  // 组数
  rest: 150,                // 组间休息秒数
  cat: 'big'|'small',       // 大肌群/小肌群
  type: undefined|'time'|'carry',  // 普通 / 计时 / 农夫行走
  tip: '动作提示文本'
}
```

### 3.2 训练数据存储格式（workout_logs.exercises）

```js
{
  '动作名称': {
    sets: [
      { weight: 60, reps: 10, rpe: 8, done: true, note: '' },
      { weight: 60, reps: 10, seconds: 45, done: true }  // time/carry 类型
    ],
    totalVolume: 1200,      // 总容量（weight * reps 累加，time/carry 不计入）
    feeling: '',            // 整体感受
    completedSets: 2        // 已完成组数
  }
}
```

- `carry` 类型：使用 `seconds` 字段，不记录 `weight`/`reps`/`rpe`
- `time` 类型：同样使用 `seconds`，但不计入 `totalVolume`
- 组间休息：`ex.type === 'carry'` 时固定 60 秒

---

## 四、本次对话的开发记录

### 4.1 会话背景

用户在之前的会话中已完成大量功能开发，本次会话的目标是**实现三个独立功能模块**。

### 4.2 本次完成的功能

#### 模块一：数据备份与恢复

**实现内容：**
- `exportAllData()` — 一键导出：收集 Supabase 四张表（`daily_checkins`、`workout_logs`、`weight_logs`、`profiles`）+ 所有 `ft_*` localStorage 项，合并为统一 JSON，自动下载文件 `fitness-backup-YYYY-MM-DD.json`
- `handleImportFile(input)` — 导入恢复：读取 JSON 文件，校验 `exportVersion`，检查 `userId` 匹配（不匹配时弹确认框），恢复 localStorage 数据，2 秒后自动刷新页面
- `checkBackupReminder()` / `hideBackupBanner()` — 月末备份提醒：每月最后一天自动显示横幅，除非当日已导出过
- `closeBackupModal()` — 关闭备份/导入结果弹窗

**HTML 关联改动：**
- 配置页/统计页底部已存在"数据管理"区块（`exportAllData()` + 触发 hidden file input）
- `#backup-reminder-banner` 横幅已植入日程页顶部
- `#backup-modal` 弹窗已存在（显示导出/导入结果）

**已知限制：**
- 导入时 Supabase 表数据只包含在 JSON 中，**不会自动写回 Supabase**（本地模式无此问题，云端模式需后续实现）
- 无重复数据覆盖/合并/跳过交互策略

#### 模块二：周报自动生成

**实现内容：**
- `generateWeeklyReport()` — 生成周报弹窗：本周 vs 上周对比（学习时长、训练次数/容量、体重变化），4 周趋势迷你横向柱状图，下周预告（自动识别 Deload 周）
- `closeWeeklyReport()` — 关闭弹窗，支持勾选"本周不再自动弹出"
- `copyWeeklyReportText()` — 复制周报文本到剪贴板
- `exportWeeklyReportImage()` — 导出图片：检测 `html2canvas` 是否可用，否则降级为复制文字
- `checkWeeklyReport()` — 自动触发：每周日 22:00 检查，若设置开启且本周未查看则自动弹出
- `getAutoWeeklyReportSetting()` — 读取 `ft_auto_weekly_report` 设置
- `getWeekStart(dateStr)` / `getWeekEnd(weekStartStr)` — 周起始/结束日期计算

**HTML 关联改动：**
- 配置页新增「每周日 22:00 自动弹出周报」开关（`#config-auto-weekly-report`）
- 统计页已有「📊 周报」手动触发按钮
- `#weekly-report-modal` 弹窗已存在（标题区、4格统计卡片、趋势图区、下周预告、操作按钮）

**JS 关联改动：**
- `saveConfig()` / 配置加载逻辑已联动周报开关读写
- `setInterval` 中每秒调用 `checkWeeklyReport()`
- `DOMContentLoaded` 和 `enterLocalMode()` 初始化路径中调用 `checkWeeklyReport()`

#### 模块三：体型拍照记录

**实现内容：**
- `showBodyPhotoPanel()` / `closeBodyPhotoPanel()` — 打开/关闭全屏面板
- `compressImage(file, maxWidth=800, quality=0.7)` — Canvas 压缩：FileReader 读取 → Image 加载 → Canvas 绘制（宽度固定 800px，等比缩放）→ `toDataURL('image/jpeg', 0.7)`
- `handlePhotoUpload(type, input)` — 处理上传：调用压缩，临时存 `window._tempPhotos`，更新预览图
- `saveBodyPhotos()` — 保存：将临时照片写入 `ft_body_photos` localStorage（按日期存储 `{front, side, back}`）
- `renderBodyPhotoTimeline()` — 渲染历史日期时间轴按钮
- `showBodyPhotoDetail(date)` — 渲染某天三角度照片网格
- `deleteAllBodyPhotos()` — 删除全部体型照片及 last_date 记录
- `checkBodyPhotoReminder()` / `hideBodyPhotoBanner()` — 每月 1 号提醒横幅

**HTML 关联改动：**
- `#bodyphoto-reminder-banner` 已植入日程页顶部（每月1号提示）
- `#body-photo-panel` 全屏面板已存在：日期选择、三角度上传区（正面/侧面/背面）、保存按钮、历史时间轴、照片详情网格、删除全部按钮
- 数据管理区块已有"体型拍照记录"入口按钮

**容量控制：**
- 压缩后单张预估 200-400KB（JPEG 0.7 质量，800px 宽度）
- 3 张/月 ≈ 1MB/月，理论上 5MB localStorage 可存约 5 个月

---

### 4.3 本次修复/调整的内容

| 调整项 | 之前 | 之后 |
|-------|------|------|
| 智能推荐 `getSmartPreset()` | 可能返回空值 | 返回 `{category, subCategory}`，覆盖 00:00-23:59 全时段，兜底 `study-math` |
| 饮食页可勾选重构 | 旧交互 | checkbox + 下拉选择，默认全勾选，休息日自动隐藏上午加餐/橄榄油 |
| 热量目标默认值 | 2800/350/150/70 | 2600/320/160/70（维持/重组模式） |
| 代谢蛋白质系数 | `weight * 2.0` | `weight * 2.3`，注释改为"维持/重组期" |
| 代谢结果文案 | 静态 | 动态显示"（维持 TDEE）"/"（+盈余）"/"（赤字）" |
| Day4 上肢B 第7动作 | 其他动作 | 农夫行走：`type: 'carry'`，只记秒数，60s 组间休息 |
| 动作参数标注 | 不一致 | 统一 `[组数]组 x [次数] \| 组间休息：[X]秒` |
| 日报触发 | 单独逻辑 | `ft_report_seen_${today}` 标记，设置页 `ft_auto_report` 开关控制 |

---

## 五、验收清单

### ✅ 已验收（本次对话完成）

- [x] **数据备份**：点击"导出全部数据"按钮，弹出 modal 显示收集进度，JSON 文件自动下载
- [x] **数据导入**：选择备份 JSON 文件，modal 显示恢复结果，页面自动刷新
- [x] **备份提醒**：月末最后一天打开页面，顶部显示蓝色备份提醒横幅
- [x] **周报生成**：点击"📊 周报"按钮，弹出周报 modal，显示本周/上周对比数据
- [x] **周报趋势图**：周报 modal 内显示近 4 周学习时长横向柱状迷你图
- [x] **周报下周预告**：自动识别下周是否为 Deload 周（每4周一次）
- [x] **周报自动触发**：配置页开启后，每周日 22:00 自动弹出
- [x] **周报导出**：支持复制文字、保存图片（html2canvas 降级处理）
- [x] **体型拍照面板**：点击"体型拍照记录"打开全屏面板
- [x] **图片压缩**：上传照片后自动 Canvas 压缩，预览图加载正常
- [x] **体型照片保存**：选择日期、上传三角度照片、点击保存，成功存入 localStorage
- [x] **体型时间轴**：保存后时间轴显示新日期按钮，点击可查看历史照片
- [x] **体型提醒**：每月 1 号打开页面，顶部显示紫色拍照提醒横幅
- [x] **周报配置开关**：配置页新增周报自动弹出开关，保存/加载正常
- [x] **农夫行走渲染**：Day4 训练中农夫行走正确渲染（无重量输入，显示秒数，总秒数统计）
- [x] **饮食页休息日隐藏**：休息日自动隐藏上午加餐和橄榄油选项
- [x] **热量目标可配置**：默认 2600/320/160/70，弹窗可修改
- [x] **代谢计算动态文案**：根据热量策略动态显示维持/盈余/赤字

### ⬜ 待验收 / 待修复

- [ ] **导入 Supabase 恢复**：当前导入只恢复 localStorage，云端用户导入后 Supabase 表数据不会自动写回
- [ ] **数据冲突策略**：导入时遇到已存在的数据，应提供"覆盖/跳过/合并"选项
- [ ] **周报图片导出**：需要引入 html2canvas CDN 才能使用图片导出功能
- [ ] **体型照片容量管理**：长期累积可能接近 localStorage 5MB 上限，需自动清理或压缩策略
- [ ] **app.js 模块化**：超过 4500 行，建议按功能拆分为多个 JS 文件
- [ ] **放松记录纳入统计**：当前完全隔离，可考虑在统计页增加放松相关卡片

---

## 六、开发建议（给后续 AI）

### 6.1 代码组织

当前所有逻辑在单个 `app.js` 中。建议拆分方向：

```
app.js              # 入口、初始化、全局状态
├── data/           # Supabase + localStorage 双模式数据层
├── schedule/       # 计时器、日程渲染
├── diet/           # 饮食追踪、饮水
├── workout/        # 训练计划、组间休息、训练计时
├── stats/          # 统计、图表绘制
├── report/         # 日报、周报
├── backup/         # 备份、导入、体型照片
└── utils/          # 工具函数、格式化
```

由于当前是纯静态文件无构建工具，拆分后可用 `<script>` 标签按依赖顺序加载，或使用 ES module（`type="module"`）。

### 6.2 新增功能时的注意事项

1. **localStorage 容量**：任何新增的大体积数据（图片、长文本日志）都需要考虑 5MB 上限
2. **双模式兼容**：新增数据存储必须同时实现 Supabase 版本和 `dbXXX` 本地版本
3. **localStorage key**：统一使用 `ft_` 前缀，避免与外部库冲突
4. **状态恢复**：计时器、组间休息等运行时状态需考虑页面刷新后的恢复逻辑（`ft_current_timer`、`ft_rest_timer` 模式）
5. **休息日逻辑**：`S.rest` 为 `true` 时，训练页应隐藏，饮食页应隐藏上午加餐/橄榄油

### 6.3 测试数据

项目内置 `generateTestData()` 可生成 7 天完整测试数据（含体重、日程、饮食、训练），`clearTestData()` 可清除。开发新功能时建议先用测试数据验证。

---

## 七、关键函数速查

### 7.1 训练相关

| 函数 | 用途 |
|------|------|
| `renderWorkout()` | 渲染整个训练页（热身/正式/输入区） |
| `toggleSetDone(exName, setIdx, done)` | 切换某组完成状态 |
| `updateSet(exName, setIdx, field, value)` | 更新某组重量/次数/秒数/备注 |
| `startRestTimer(seconds, exerciseName, setNum)` | 启动组间休息倒计时 |
| `startTraining()` / `endTraining()` | 开始/结束训练会话 |
| `getOverloadTip(ex, lastSession)` | 生成渐进超负荷建议文本 |
| `parseRepRange(s)` | 解析 `3x8-12` / `2x30-40秒` 等格式 |

### 7.2 报告相关

| 函数 | 用途 |
|------|------|
| `generateDailyReport()` | 生成日报弹窗 |
| `generateWeeklyReport()` | 生成周报弹窗 |
| `getWeekStart(dateStr)` | 获取周一日期 |
| `getAutoReportSetting()` | 自动日报开关 |
| `getAutoWeeklyReportSetting()` | 自动周报开关 |

### 7.3 体型照片相关

| 函数 | 用途 |
|------|------|
| `showBodyPhotoPanel()` | 打开体型拍照面板 |
| `compressImage(file, maxWidth, quality)` | Canvas 压缩图片 |
| `handlePhotoUpload(type, input)` | 处理单张照片上传 |
| `saveBodyPhotos()` | 保存到 `ft_body_photos` |
| `renderBodyPhotoTimeline()` | 渲染历史时间轴 |

### 7.4 备份相关

| 函数 | 用途 |
|------|------|
| `exportAllData()` | 导出全部数据为 JSON |
| `handleImportFile(input)` | 处理导入文件 |
| `checkBackupReminder()` | 月末备份提醒检查 |

---

*最后更新：2026-05-12*
