# 水产养殖智能监控系统 — Web 管理后台

智慧渔业养殖系统的 Web 前端：实时展示 7 项水质指标、设备状态、告警与人工工单，并提供基于 RAG 的 AI 养殖助手。助手支持 SSE 流式输出、Markdown 渲染、参考来源追溯与历史会话回放。
后端：https://github.com/Edgar-0919/Fishery-Backend

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Vue 3（Composition API + `<script setup>`） |
| 构建工具 | Vite 5 |
| UI 组件库 | Element Plus |
| 图表 | ECharts 5 |
| 路由 | Vue Router 4 |
| 状态管理 | `reactive` 全局响应式对象（`stores/dataStore.js`） |
| Markdown 渲染 | marked + DOMPurify（先解析再消毒，防 XSS） |
| 流式通信 | fetch + ReadableStream 解析 SSE（`text/event-stream`） |

## 目录结构

```
ui/
├── index.html                    # 入口 HTML，含全局基础样式与 CSS 变量
├── package.json
├── vite.config.js                # Vite 配置（@ 别名指向 src，端口 3000）
└── src/
    ├── main.js                   # 应用入口：挂载 Vue、注册路由与 Element Plus
    ├── App.vue                   # 根组件：顶部导航 + 路由视图
    ├── router/index.js           # 7 个业务页面 + 登录页（8 个视图），含根重定向与 404 兜底
    ├── stores/dataStore.js       # 全局状态（指标、告警、趋势图数据）
    ├── services/api.js           # 后端 API 调用、令牌、SSE 解析、超时与本地缓存
    ├── components/
    │   ├── TopNavbar.vue         # 全局顶部导航栏 + 用户菜单（修改密码 / 退出）
    │   └── MarkdownContent.vue   # AI 回复的 Markdown 渲染（marked + DOMPurify）
    ├── styles/global.css         # 公共样式与 Element Plus 覆盖
    ├── static/                   # 图片资源
    └── views/
        ├── RealtimeMonitor.vue   # 首页：实时指标 + 趋势图 + 活跃告警
        ├── DeviceDataAnalysis.vue# 数据分析：历史趋势对比 + 指标统计
        ├── AlertCenter.vue       # 告警中心：活跃 / 已升级 / Agent 决策
        ├── ManualTasks.vue       # 人工工单：认领处理与关闭
        ├── DeviceControl.vue     # 设备控制：状态卡片 + 手动下发指令
        ├── AgentChat.vue         # AI 养殖助手（流式问答 + RAG 来源 + 会话管理）
        ├── Login.vue             # 登录页
        └── PlaceholderPage.vue   # 占位页（/settings）
```

## 快速开始

### 环境要求

- Node.js 18+、npm
- 后端已按 `Backend/README.md` 在本机启动（默认 `http://localhost:8000`）

### 安装依赖并启动开发服务器

```bash
cd ui
npm install
npm run dev
```

默认端口 `3000`，启动后浏览器自动打开 `http://localhost:3000`。未配置 `VITE_API_BASE_URL` 时，请求直连 `http://localhost:8000`，依赖后端 CORS（默认允许所有来源）。

### 生产构建

```bash
npm run build
```

产物输出到 `dist/`，可用 `npm run preview`、`npx serve dist` 或任意静态服务器托管。若前后端不同源，构建前设置 `VITE_API_BASE_URL` 指向后端，并把 `CORS_ORIGINS` 配成具体来源。

## 后端接口配置

`src/services/api.js` 通过构建期环境变量决定后端地址：

| `VITE_API_BASE_URL` | 行为 |
|---------------------|------|
| 未设置 | 回退 `http://localhost:8000`（本地开发默认） |
| 具体地址 | 直连该后端 |
| 空字符串 | 走同源请求，需自行配置反向代理把 `/api/`、`/onenet/`、`/health` 转发到后端 |

本地可在 `ui/.env.local` 中设置，例如：

```env
VITE_API_BASE_URL=http://localhost:8000
```

全部接口统一经 `services/api.js` 封装（多数函数不抛异常，返回 `{ success, data, message }`；`chatAgentStream` 在建流失败时抛异常，供调用方降级）：

| 接口 | 用途 |
|------|------|
| `POST /api/auth/login`、`GET /api/auth/me`、`POST /api/auth/change-password` | 登录、当前用户、修改密码 |
| `GET /api/sensor-data`、`/history` | 实时指标与历史趋势 |
| `POST /api/agent/chat/stream` | AI 助手流式问答（SSE，优先路径） |
| `POST /api/agent/chat` | AI 助手一次性问答（流式不可用时的降级路径） |
| `POST /api/agent/sessions`、`GET /api/agent/sessions`、`GET /{id}/messages`、`DELETE /{id}` | 新建 / 列表 / 回放 / 删除会话 |
| `GET /api/agent/decisions` | Agent 决策记录 |
| `GET /api/alerts/active`、`/escalated` | 告警列表 |
| `GET /api/manual-tasks`、`POST /{id}/process`、`/resolve` | 人工工单 |
| `GET /api/control-devices`、`POST /{identifier}/command` | 设备列表与手动指令 |

请求统一携带 Bearer Token，401 时清除本地登录态并跳转登录页；网络异常或后端无新数据时回退到 5 分钟 `localStorage` 缓存。

## AI 助手交互

`AgentChat.vue` 的问答流程与降级策略：

| 环节 | 行为 |
|------|------|
| 传输 | 优先 `POST /api/agent/chat/stream`，逐帧解析 `meta` / `delta` / `error` / `done` 事件 |
| 降级 | 建流失败且未收到任何正文时，回退 `POST /api/agent/chat`，用打字机效果模拟流式 |
| 超时 | 流式采用 90 秒空闲超时（有分块就重置），非流式请求整体超时 90 秒 |
| 中止 | 「停止生成」保留已输出内容；主动停止、超时、连接中断的提示文案不同 |
| 渲染 | `MarkdownContent.vue` 先 `marked` 解析再 `DOMPurify` 消毒，流式期间按 `requestAnimationFrame` 节流 |
| 来源 | 每条回答可展开「回答依据」，显示分类、文档名、相似度与召回片段原文，编号与正文 `[来源N]` 对应 |
| 会话 | 新建会话由服务端生成 ID，首次提问若无会话则本地生成 UUID；列表可切换 / 删除 / 新建，刷新后按 `session_id` 回放消息 |
| 退出 | 退出登录会同时清除令牌、用户信息与本地会话 ID，避免换账号串用上下文 |

## 页面路由

| 路径 | 页面 |
|------|------|
| `/` | 重定向到 `/home` |
| `/login` | Login（公开页） |
| `/home` | RealtimeMonitor |
| `/alerts` | AlertCenter |
| `/tasks` | ManualTasks |
| `/devices` | DeviceControl |
| `/data-analysis` | DeviceDataAnalysis |
| `/agent-chat` | AgentChat |
| `/settings` | PlaceholderPage |

`beforeEach` 会在未登录时跳转到登录页，已登录访问 `/login` 会回到 `/home`；未匹配路径统一重定向到 `/home`。

### 数据刷新频率

| 页面 | 刷新对象 | 间隔 |
|------|----------|------|
| RealtimeMonitor | 实时指标与当前趋势 | 5 秒 |
| RealtimeMonitor | 活跃告警 | 15 秒 |
| AlertCenter / ManualTasks / DeviceControl | 列表数据 | 30 秒 |
| DeviceDataAnalysis | 实时指标与设备状态 | 15 秒 |
| DeviceDataAnalysis | 历史趋势 | 60 秒 |

## 开发约定

- **状态管理**：全局响应式状态集中在 `stores/dataStore.js`，组件不直接操作 `localStorage`
- **API 调用**：统一通过 `services/api.js` 导出函数，组件内不直接 `fetch`（SSE 也由 `chatAgentStream` 封装）
- **新增路由**：在 `router/index.js` 注册，并在 `components/TopNavbar.vue` 的 `navItems` 中添加导航入口
- **路径别名**：`@` 指向 `src` 目录，组件导入使用 `@/views/...` 形式
- **AI 回复渲染**：新增富文本输出必须走 `MarkdownContent.vue`，不要直接 `v-html` 原始模型输出
- **流式协议**：后端 SSE 帧约定为 `event` + 单行 JSON `data`，解析逻辑只在 `services/api.js` 维护一份
