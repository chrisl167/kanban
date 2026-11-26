# Kanban Node + SQLite 后端

## 技术栈

- Node.js 20+
- Express
- better-sqlite3
- bcryptjs 密码哈希
- JWT 会话令牌
- PM2 进程守护

## 目录

```text
server/
├── src/
│   ├── app.js        # Express 入口、静态文件托管和路由
│   ├── db.js         # SQLite 连接与建表
│   ├── auth.js       # 注册、登录、JWT 鉴权
│   ├── env.js        # 读取本地 .env
│   └── tasks.js      # 任务 CRUD
├── data/             # SQLite 数据库文件（不提交 Git）
├── ecosystem.config.cjs
├── .env.example
└── package.json
```

## 本地启动

```bash
cd server
npm install
cp .env.example .env
# 开发环境可临时设置 ALLOW_REGISTRATION=true
npm run dev
```

健康检查：

```bash
curl http://127.0.0.1:3100/api/health
```

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/auth/config` | 获取是否开放注册 |
| POST | `/api/auth/register` | 注册账号；注册关闭时返回 403 |
| POST | `/api/auth/login` | 登录，返回 token 和用户信息 |
| POST | `/api/auth/logout` | 退出 |
| GET | `/api/tasks` | 获取当前用户任务 |
| POST | `/api/tasks` | 新增任务 |
| PUT | `/api/tasks/:id` | 编辑任务 |
| DELETE | `/api/tasks/:id` | 删除任务 |

注册/登录请求体：

```json
{
  "email": "you@example.com",
  "password": "至少 6 位"
}
```

任务请求体：

```json
{
  "title": "事项名称",
  "description": "备注说明",
  "status": "todo",
  "priority": "high",
  "category": "work",
  "due_date": "",
  "due_time": "09:00",
  "tags": ["工作"]
}
```

后续接口请求需要在 Header 中携带：

```text
Authorization: Bearer <token>
```

## 生产部署

长期部署目录、Cloudflare Tunnel 配置、备份和自检步骤见：

```text
deploy/README-DEPLOY.md
```

PM2 参考命令：

```bash
cd /opt/kanban/app/server
npm install --production
pm2 start ecosystem.config.cjs
pm2 save
```

SQLite 文件建议放在持久化目录，例如 `/opt/kanban/data`，并定期备份该目录下的 `kanban.db`。
