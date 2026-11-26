# iStoreOS 长期部署指南

## 1. 部署架构

```text
Cloudflare 命名 Tunnel（长期域名）
  ↓ HTTPS
iStoreOS 本机 Express 服务（127.0.0.1:3100）
  ├─ 托管前端 dist/ 静态文件
  └─ /api/* 接口
      ↓
SQLite 文件数据库（/opt/kanban/data/kanban.db）
```

长期方案不再使用随机 `trycloudflare.com` 临时域名，也不需要额外安装 Nginx/Caddy。Express 同时负责静态页面和接口；Cloudflare Tunnel 只把公网域名转发到本机 `127.0.0.1:3100`。

## 2. 服务器目录规划

```text
/opt/kanban/
├── app/                  # 上传的应用代码和前端构建产物
│   ├── dist/             # Vite 构建产物
│   ├── server/           # Node/Express 后端
│   ├── package.json
│   └── package-lock.json
├── data/                 # SQLite 持久化数据
│   ├── kanban.db
│   ├── kanban.db-wal
│   └── kanban.db-shm
└── backups/              # SQLite 备份文件
```

## 3. 本地生成部署包

在项目根目录执行：

```bash
./deploy/package.sh
```

脚本会安装前端依赖、执行生产构建，并生成：

```text
deploy/kanban-deploy.tar.gz
```

压缩包不包含 `node_modules`、`.git` 和本地 SQLite 数据文件。

## 4. 上传到 242 服务器

把压缩包上传到 iStoreOS：

```bash
scp deploy/kanban-deploy.tar.gz root@<242-局域网IP>:/tmp/
```

如果当前电脑无法直接 SSH 到局域网 242，可以先把压缩包传到可访问 242 的机器，再从该机器上传。

## 5. 在服务器上解压并安装后端依赖

### 5.1 建立目录

```bash
mkdir -p /opt/kanban/app /opt/kanban/data /opt/kanban/backups
tar -xzf /tmp/kanban-deploy.tar.gz -C /opt/kanban/app
```

### 5.2 检查 Node.js 版本

```bash
node -v
npm -v
```

后端要求 Node.js 20+。如果 iStoreOS 软件源里的 Node 版本过低，优先通过 Entware/opkg 或官方 Linux 二进制安装匹配架构的 Node 20/22。

> 注意：`better-sqlite3` 是原生模块。如果服务器架构没有预编译二进制，安装时可能需要编译工具链；失败时先确认 CPU 架构和 Node 版本，再按报错补装 `make`、`gcc`、`python3` 等构建依赖。

### 5.3 安装后端生产依赖

```bash
cd /opt/kanban/app/server
npm install --production
```

## 6. 配置后端环境变量

```bash
cp .env.example .env
```

编辑 `/opt/kanban/app/server/.env`：

```env
PORT=3100
HOST=127.0.0.1
KANBAN_DATA_DIR=/opt/kanban/data
DIST_DIR=/opt/kanban/app/dist
JWT_SECRET=在这里填 openssl rand -hex 32 生成的随机串
JWT_TTL=7d
ALLOW_REGISTRATION=true
```

生成 JWT 密钥：

```bash
openssl rand -hex 32
```

把输出复制到 `JWT_SECRET`。不要使用示例值，也不要把这个密钥提交到 Git。

首次部署先临时保留 `ALLOW_REGISTRATION=true`；创建好第一个账号后，再改成 `false`。

## 7. 用 PM2 启动

```bash
cd /opt/kanban/app/server
pm2 start ecosystem.config.cjs
pm2 save
```

查看状态和日志：

```bash
pm2 status
pm2 logs kanban-server
```

本地健康检查：

```bash
curl http://127.0.0.1:3100/api/health
curl http://127.0.0.1:3100/api/auth/config
```

预期健康检查返回：

```json
{ "ok": true, "service": "kanban-server" }
```

`/api/auth/config` 应返回当前是否开放注册：

```json
{ "allowRegistration": true }
```

## 8. 配置 Cloudflare 命名 Tunnel

### 推荐：Dashboard 操作

1. 登录 Cloudflare Dashboard。
2. 进入 **Zero Trust → Networks → Tunnels**。
3. 选择服务器上已经在跑的那个 Tunnel；如果已有服务仍需保留，不要新建 Tunnel。
4. 进入 **Public Hostname** 页面，新增一条公网主机名：
   - **Hostname**：计划给看板使用的长期域名，例如 `kanban.example.com`
   - **Service Type**：`HTTP`
   - **URL**：`127.0.0.1:3100`
5. 保存后等待 Tunnel 重新加载配置。
6. 浏览器访问长期域名，确认页面、登录和任务保存都正常。

### 文件配置方式

可参考：

```text
deploy/cloudflared-config.yml.example
```

在原有 Tunnel 的 `ingress` 列表中追加：

```yaml
- hostname: kanban.example.com
  service: http://127.0.0.1:3100
```

原有服务的 ingress 规则继续保留，不要覆盖。

## 9. 首个账号与注册开关

1. 首次打开看板页面。
2. 点击“登录”→“注册账号”。
3. 输入邮箱和至少 6 位密码，创建第一个管理员账号。
4. 确认任务新增、状态切换、删除都正常。
5. 编辑 `/opt/kanban/app/server/.env`：

```env
ALLOW_REGISTRATION=false
```

6. 重启后端：

```bash
pm2 restart kanban-server
```

关闭注册后，前端不会显示“注册账号”按钮；后续新增账号需要管理员在数据库或后端临时开通。

## 10. SQLite 备份

备份脚本位于：

```text
deploy/backup-sqlite.sh
```

建议放到 iStoreOS 计划任务中每天执行一次：

```bash
chmod +x /opt/kanban/app/deploy/backup-sqlite.sh
KANBAN_DATA_DIR=/opt/kanban/data \
KANBAN_BACKUP_DIR=/opt/kanban/backups \
/opt/kanban/app/deploy/backup-sqlite.sh
```

脚本默认保留最近 14 份备份。恢复时停止 PM2，把对应备份目录中的 `kanban.db` 复制回 `/opt/kanban/data/`，再启动 PM2。

## 11. 上线前自检清单

- [ ] `node -v` 为 Node 20+。
- [ ] `JWT_SECRET` 是新生成的长随机串。
- [ ] 后端只监听 `127.0.0.1:3100`，没有直接暴露到局域网/公网。
- [ ] `DIST_DIR=/opt/kanban/app/dist` 存在且包含 `index.html`。
- [ ] `curl http://127.0.0.1:3100/api/health` 返回正常。
- [ ] 浏览器通过 Cloudflare 域名能打开页面。
- [ ] 注册账号后可以新增、编辑、移动、删除任务。
- [ ] 首个账号创建后，`ALLOW_REGISTRATION=false` 已生效。
- [ ] SQLite 数据目录和备份目录都在持久化存储上。
- [ ] 仓库中没有提交 `.env`、数据库文件、密码或服务端密钥。

## 12. 常见问题排查

### 页面打不开，但本地 `127.0.0.1:3100` 正常

先检查 Cloudflare Tunnel 是否在线、Public Hostname 是否指向 `127.0.0.1:3100`。如果原有 Tunnel 配置被覆盖，恢复原有服务的 ingress 规则。

### 打开页面是 404 或静态资源 404

检查：

- `/opt/kanban/app/dist/index.html` 是否存在；
- `.env` 中 `DIST_DIR` 是否指向该目录；
- PM2 是否在修改目录后重启过。

### `/api` 请求 404

说明请求没有到达 Express。检查 Tunnel 服务地址是否写的是 `http://127.0.0.1:3100`，不要只转发静态文件端口而漏掉 `/api`。

### 登录提示“登录已过期，请重新登录”

JWT 过期或 `JWT_SECRET` 在重启后被更换。重新登录即可；如果每次重启都掉线，检查 `.env` 中是否固定了同一个 `JWT_SECRET`。

### PM2 一直重启

查看日志：

```bash
pm2 logs kanban-server
```

重点看 SQLite 目录权限、`DIST_DIR` 是否存在、Node 版本是否过低、`better-sqlite3` 是否安装失败。

### 3100 端口被占用

```bash
netstat -lntp | grep 3100
```

如果已有服务占用 3100，可以在 `.env` 中改 `PORT=3101`，并同步修改 Tunnel 指向端口。

## 13. 后续更新流程

1. 本地修改代码并执行 `./deploy/package.sh`。
2. 上传新的 `kanban-deploy.tar.gz` 到服务器。
3. 解压覆盖 `/opt/kanban/app/` 中的前端和后端代码。
4. 执行 `cd /opt/kanban/app/server && npm install --production`。
5. `pm2 restart kanban-server`。
6. 检查健康接口、页面登录和任务增删改。

SQLite 数据库文件位于 `/opt/kanban/data/`，覆盖应用代码时不要删除该目录。
