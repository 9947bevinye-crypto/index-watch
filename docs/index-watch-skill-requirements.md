# Index Watch 项目 Skill 需求说明

## 文档用途

这份文档用于交给后续 AI 模型、Codex agent 或其它开发模型，让它们在继续完善本项目时快速理解项目目标、当前状态、技术边界和协作规则。

它不是最终的 `SKILL.md`，而是“项目维护 skill”的需求说明。后续如果要创建正式 Codex Skill，可以基于本文拆成：

- `SKILL.md`：保留核心工作流和触发说明
- `references/project-context.md`：放项目背景、数据源和 UI 约定
- `references/data-sources.md`：放数据源接入规则

## 建议 Skill 名称

`index-watch-project-maintainer`

## 建议 Skill 触发描述

当用户要求继续开发、修复、重构、扩展或设计 Index Watch / 指数观察项目时使用。适用于新增指数走势图、接入公开或授权金融数据源、优化 Web APP/PWA 界面、调整移动端交互、维护数据缓存和同步逻辑、或将当前原型演进为正式 APP。

## 项目位置

当前项目目录：

```text
D:\开发项目\指数观察
```

本地访问地址：

```text
http://localhost:4173
```

启动方式：

```bash
npm start
```

APK 构建：

```bash
npx cap sync android && cd android && ./gradlew assembleDebug
```

APK 文件：`android/app/build/outputs/apk/debug/app-debug.apk`

当前技术栈：

- Node.js 内置 `http` 服务
- 原生 HTML / CSS / JavaScript
- Canvas 自绘双轴走势图
- 本地 JSON 缓存
- Capacitor 打包 APK
- GitHub Actions 每日自动更新 PE 数据
- GitHub Pages 托管数据 JSON
- 暂未引入 React、Vue、ECharts、数据库

## 项目当前状态（2026-05-03）

- ✅ S&P 500 + VIX 风险观察（FRED 数据源）
- ✅ 沪深300 估值观察（AKShare 数据源，PE 分位线）
- ✅ Web 原型（localhost:4173 浏览器访问）
- ✅ APK 打包（Capacitor，安卓安装包）
- ✅ GitHub Actions 每日自动更新 HS300 PE 数据
- ✅ GitHub Pages 托管数据文件
- ✅ 手机端全屏横屏查看图表

## 产品目标

用户想做一个“财经指数走势图 APP”，核心思路不是直接爬 MacroMicro 图表，而是：

1. 找到合法、稳定、可公开使用或已授权的数据源
2. 后端统一同步和缓存数据
3. 前端自己绘制类似 MacroMicro / 乐咕乐股风格的走势图
4. 后续逐步增加更多网站/指标/指数

第一阶段目标是 Web APP 原型。后续可以演进为：

- PWA，可添加到手机桌面
- 桌面 APP，例如 Electron / Tauri
- 手机 APP，例如 Capacitor

## 当前已实现功能

### S&P 500 + VIX 风险观察

已接入真实公开数据源：

- S&P 500：FRED `SP500`
- VIX：FRED `VIXCLS`

接口：

```text
GET /api/charts/spx-vix
```

当前数据格式大致为：

```json
{
  "chart": {
    "id": "spx-vix",
    "title": "S&P 500 与 VIX 风险观察"
  },
  "data": [
    {
      "date": "2026-04-30",
      "spx": 7209.01,
      "vix": 16.89
    }
  ],
  "syncedAt": "2026-05-03T06:40:55.794Z",
  "latestDate": "2026-04-30",
  "sources": []
}
```

当前缓存文件：

```text
data/cache/spx-vix.json
```

缓存策略：

- 缓存有效期为 12 小时
- APP 打开时请求后端
- 后端判断缓存是否过期
- 过期则尝试更新
- 更新失败则返回旧缓存
- 没有缓存且更新失败时返回演示数据，避免页面白屏

数据清洗规则：

- 过滤非数字
- 过滤 `0` 和负数
- 只保留 S&P 500 和 VIX 同时存在的日期
- 按日期升序排列

### 沪深300估值入口

已预留入口：

```text
GET /api/charts/hs300-valuation
```

当前状态：

- 前端菜单中有“沪深300估值”
- 后端返回 `coming-soon`
- 尚未接入真实数据

建议候选数据源：

- Tushare `index_dailybasic`，字段可包括 `pe`、`pe_ttm`、`pb`
- 中证指数官网数据，需确认可用接口和授权边界
- AKShare 可作为开发阶段参考，但生产要确认数据授权和稳定性
- 乐咕乐股可作为视觉和指标对照，不建议未经授权直接依赖其页面数据

## 当前界面约定

界面是移动端优先的财经工具风格，不做营销页。

当前 UI 结构：

1. 顶部固定深色栏
2. 左上角三条杠菜单
3. 顶部居中展示当前指数名称
4. 点击三条杠打开左侧深色抽屉，选择不同指数
5. 页面第一块直接展示走势图
6. 图表内不重复显示页面标题
7. 曲线开关显示在图上方
8. 时间范围按钮显示在图表下方、数据来源上方
9. 数据来源和最新日期显示在图表底部
10. 数据状态和指标卡片显示在走势图下面
11. 手工刷新按钮是右下角悬浮圆形按钮，颜色与顶部栏/侧边栏一致

当前时间范围：

- 1月
- 3月
- 6月
- 1年
- 2年
- 5年
- 全部

后续可以新增：

- 1周
- YTD
- 10年

但新增前要确认按钮在手机宽度下不拥挤。

## 设计要求

后续模型修改 UI 时应遵守：

- 不要加首页 Hero、营销文案或大幅装饰图
- 不要做紫色渐变、装饰光球、过度圆角或卡片堆卡片
- 保持财经工具感：干净、克制、信息优先
- 图表必须优先展示，指标摘要放在下方
- 移动端必须在 390px 宽度附近检查
- 文本不能溢出按钮、卡片和顶部栏
- 顶部栏、抽屉、刷新按钮使用同一套深色视觉
- 数据来源必须保留
- 最新数据日期必须保留

当前主要颜色：

```css
--bg: #eef1f4;
--surface: #ffffff;
--text: #16202a;
--text-muted: #5c6670;
--border: #d7dce1;
--spx: #b42318;
--vix: #1570a6;
dark-nav: #17212b;
dark-nav-active: #223140;
```

## 数据合规边界

非常重要：不要把需求理解成“直接爬 MacroMicro 图表”。

正确方向：

- 使用公开数据源
- 使用官方 API
- 使用用户已购买或明确授权的数据
- 在 APP 内重画走势图

避免：

- 绕过网站登录、会员、反爬或技术限制
- 未授权下载 MacroMicro 数据并建立本地数据库
- 直接复制第三方网站图表图片作为 APP 内容
- 将数据源密钥写入前端

MacroMicro：

- 若用户要直接使用 MacroMicro 数据，建议走其官方 API 或授权
- 若只是复刻分析视图，应寻找替代公开数据源

乐咕乐股：

- 可作为参考和对照
- 若生产使用其数据，需确认授权、条款和可下载数据范围

## 后续数据源接入规则

每个新增图表建议使用“数据源适配器”思路：

```text
数据源适配器 -> 数据清洗 -> 缓存/数据库 -> 后端 API -> 前端图表
```

建议统一图表数据结构：

```json
{
  "chart": {
    "id": "chart-id",
    "title": "图表名称",
    "shortTitle": "菜单短标题",
    "description": "图表说明",
    "sourceNames": ["数据源名称"]
  },
  "data": [
    {
      "date": "YYYY-MM-DD",
      "seriesA": 123.45,
      "seriesB": 67.89
    }
  ],
  "syncedAt": "ISO 时间",
  "latestDate": "YYYY-MM-DD",
  "sourceStatus": "live | demo | stale",
  "sources": [
    {
      "name": "数据源名称",
      "url": "https://example.com"
    }
  ],
  "cache": {
    "status": "updated | fresh | stale | demo",
    "warning": "可选错误信息"
  }
}
```

新增数据源时必须处理：

- 网络失败
- 数据源未更新
- 日期不对齐
- 缺失值
- 非交易日
- 数据返回 0 或异常值
- 数据源字段改名
- 缓存过期和回退

## 建议下一步任务

### 任务 1：整理现有代码结构

当前 `server.js` 和 `public/app.js` 已经能跑，但后续扩展图表会变大。建议拆分：

```text
server.js
src/
  chart-catalog.js
  data-sources/
    fred.js
    hs300.js
  cache.js
public/
  index.html
  styles.css
  app.js
```

保持第一版不要过度工程化。只有当新增第二个真实图表时再拆分更合理。

### 任务 2：接入沪深300估值

优先确认数据源：

1. Tushare 是否可用，用户是否有 token 和积分权限
2. 中证指数官网是否有稳定接口
3. AKShare 是否只用于开发验证

目标图表字段：

- 沪深300指数
- 市盈率 TTM
- 市盈率分位
- 市净率 PB
- 可选：股息率

### 任务 3：增加图表配置能力

不同图表的轴、颜色、指标名不同，建议引入配置：

```js
{
  id: "spx-vix",
  series: [
    { key: "spx", label: "S&P 500", axis: "right", color: "#b42318" },
    { key: "vix", label: "VIX", axis: "left", color: "#1570a6" }
  ]
}
```

### 任务 4：升级图表交互

当前 Canvas 能展示基础曲线。后续可增强：

- 十字光标
- 长按查看数值
- 双指缩放
- 拖动区间
- 图例点击隐藏曲线
- 移动端 tooltip 优化

若功能复杂，可考虑引入 ECharts 或 Lightweight Charts，但不要为了小功能过早引入大依赖。

### 任务 5：PWA 化

当 Web APP 稳定后：

- 添加 `manifest.json`
- 添加 service worker
- 支持添加到手机桌面
- 设置应用图标
- 保持离线时显示最近缓存数据

## 验收标准

后续模型每次完成修改后，至少执行：

```bash
node --check server.js
node --check public/app.js
```

如果本地服务可用，继续检查：

```bash
Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:4173" | Select-Object -ExpandProperty StatusCode
```

检查数据接口：

```bash
Invoke-RestMethod -Uri "http://localhost:4173/api/charts/spx-vix"
```

UI 改动必须截图检查：

- 手机宽度：390 x 900
- 桌面宽度：1440 x 900

重点检查：

- 顶部标题是否居中
- 三条杠菜单是否可点击
- 抽屉是否可打开和关闭
- 图表是否在页面最上方
- 时间范围是否在数据来源上方
- 刷新按钮是否可见且不遮挡关键内容
- 文本是否溢出
- 曲线是否非空白

## 注意事项

- 项目当前不是 git 仓库，不能依赖 git diff 作为唯一回退手段
- 生成的截图文件、Edge 临时目录和日志不应作为项目核心文件
- `.gitignore` 已忽略常见截图、日志和临时浏览器目录
- 文件包含中文，编辑时保持 UTF-8
- 如果 PowerShell 输出中文乱码，不一定代表浏览器页面乱码，最终以浏览器渲染为准
- 不要把 API token、账号、cookie 或授权信息提交到前端或文档中

## 给后续模型的工作原则

1. 先理解当前产品方向：公开/授权数据源 + 自绘走势图
2. 不要改回传统左侧常驻侧栏
3. 不要把图表下移到指标卡片后面
4. 不要删除数据来源和最新日期
5. 新增指标前先确认数据源授权和稳定性
6. 每次改 UI 都用移动端和桌面端截图验证
7. 每次改数据逻辑都验证接口返回、缓存回退和异常处理
8. 优先小步修改，不要一次性重写整个项目
