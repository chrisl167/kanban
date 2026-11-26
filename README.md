# 服药与工作看板

一个结合服药打卡与通用工作事项的三列看板：支持新增、编辑、删除、拖拽换列、今日清单、进度统计、优先级与标签。

## 当前架构

```text
浏览器前端（Vite + 原生 JavaScript）
  ↓ /api/*
Express 后端（Node.js）
  ↓
SQLite 文件数据库（better-sqlite3）
```

- 前端：Vite、原生 JavaScript、CSS 设计令牌与响应式布局
- 后端：Express、JWT 账号密码登录、`better-sqlite3`
- 进程守护：PM2
- 目标部署环境：iStoreOS 局域网服务器（192.168.x.242），外层通过 Cloudflare 命名 Tunnel 暴露长期域名

## 本地运行

### 1. 安装依赖

```bash
npm install
npm --prefix server install
```

### 2. 配置后端环境

```bash
cp server/.env.example server/.env
```

生产或长期使用时，把 `JWT_SECRET` 改成随机长字符串：

```bash
openssl rand -hex 32
```

### 3. 启动后端

```bash
npm --prefix server run dev
```

后端默认监听：`http://127.0.0.1:3100`

### 4. 启动前端

另开一个终端：

```bash
npm run dev
```

Vite 会把 `/api` 请求代理到本地后端。

## 构建前端

```bash
npm run build
```

静态产物输出到 `dist/`。

## 后端接口

详见 [`server/README.md`](server/README.md)。

主要接口：

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/register` | 注册账号 |
| POST | `/api/auth/login` | 登录并返回 JWT |
| POST | `/api/auth/logout` | 退出登录 |
| GET | `/api/tasks` | 获取当前用户任务 |
| POST | `/api/tasks` | 新增任务 |
| PUT | `/api/tasks/:id` | 编辑任务 |
| DELETE | `/api/tasks/:id` | 删除任务 |

## 部署到 iStoreOS 242

完整步骤、Cloudflare Tunnel 配置、备份和上线自检见 [`deploy/README-DEPLOY.md`](deploy/README-DEPLOY.md)。

1. 在 iStoreOS 上安装 Node.js 20+ 和 PM2。
2. 上传前端 `dist/` 与 `server/` 目录。
3. 配置后端环境变量和 SQLite 持久化目录。
4. 用 PM2 启动 `server/ecosystem.config.cjs`。
5. Express 直接托管前端静态文件和 `/api` 接口，默认只监听 `127.0.0.1:3100`。
6. 在现有 Cloudflare 命名 Tunnel 中新增看板 Hostname，指向 `127.0.0.1:3100`。
7. 定期备份 SQLite 文件目录。

## 安全说明

- 密码只保存哈希，不保存明文。
- JWT Secret 不能提交到仓库，也不能写进前端代码。
- 服药记录属于健康信息；对外访问时必须保留账号密码登录，并在首个账号创建后关闭公开注册。
- SQLite 数据库文件需要放在持久化目录，并纳入备份。

## 历史说明

仓库早期版本曾使用 Supabase Auth + Supabase Postgres；当前版本已改为自建 Node + SQLite 方案。Supabase 相关文件已从当前工作区移除，历史记录可在 Git 历史中查阅。
