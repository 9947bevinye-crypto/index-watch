# 指数观察 APP — APK 打包设计文档

## 目标

将现有 Web 原型打包为安卓 APK，手机安装后独立联网更新数据，不依赖电脑或付费服务器。

## 架构变化

```
现在（Web 原型）                     改为（APK）
─────────────────────              ─────────────────
浏览器 → server.js → FRED           WebView → 直接调 FRED
浏览器 → server.js → Python/AKShare  WebView → 读 GitHub Pages JSON
浏览器 ← server.js 返回数据          WebView → localStorage 缓存
```

**核心变化：砍掉 server.js，所有数据拉取逻辑移到前端 JS。**

## 数据源

| 数据 | 来源 | 方式 |
|------|------|------|
| S&P 500 点位 | FRED CSV | 前端 fetch，公开无限制 |
| VIX | FRED CSV | 同上 |
| 沪深300 点位 | 东方财富 HTTP | 前端 fetch，公开无限制 |
| 沪深300 PE 历史 | GitHub Pages JSON | 前端 fetch，GitHub Actions 每天自动更新 |

## GitHub Actions 自动数据更新

每天定时运行 Python 脚本（AKShare 拉 PE 数据），输出 JSON 到 GitHub Pages：

```
GitHub Actions（每天自动触发）
  └── Python + AKShare 拉取沪深300 PE 数据
       └── 写入 JSON 文件
            └── 发布到 GitHub Pages
                 └── 公开网址：https://<用户名>.github.io/<项目>/hs300-pe.json
```

APK 打开时从这个网址下载 PE 数据。

## 前端改造

- `public/` 目录下的 HTML/CSS/JS 直接复用，界面不动
- 砍掉所有对 `http://localhost:4173/api/` 的请求
- 改为直接调外部公开 API
- 用 localStorage 缓存数据（24小时有效期）
- 没网时展示缓存数据，首次打开无缓存时展示演示数据

## 技术选型

**打包工具：Capacitor**

- 把 HTML/CSS/JS 包进 WebView
- 不改代码结构，在原 `public/` 目录上加一层壳
- 免费开源，社区活跃

## 缓存策略

| 数据 | 缓存时间 |
|------|---------|
| S&P 500 / VIX | 12 小时 |
| 沪深300 点位 | 12 小时 |
| 沪深300 PE | 24 小时（交易日才更新） |

## 涉及改动

| 文件/目录 | 操作 |
|-----------|------|
| `public/` | 改造 — 砍掉后端依赖，直连 API |
| `.github/workflows/` | 新建 — 自动更新 PE 数据的流水线 |
| 项目根目录 | 新建 — Capacitor 配置文件 |
| `server.js` | 保留不动（电脑上仍可运行 Web 版） |
