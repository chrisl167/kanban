# 242 iStoreOS Python 部署说明

本路线适配现场已确认的运行时：路由器没有 Node/npm/PM2，Docker Hub 拉取 Node 镜像超时；系统已有 Python 3.10、FastAPI、uvicorn、pydantic。

## 1. 目录规划

- 静态前端：`/opt/kanban/app`
- Python 后端：`/opt/kanban/server-py`
- SQLite 数据：`/mnt/sata2-4/kanban/data`
- 日志：`/mnt/sata2-4/kanban/server.log`
- 局域网监听：`0.0.0.0:8766`（Cloudflare Tunnel 仍可回连 `127.0.0.1:8766`）

## 2. 上传并解压

在 Windows 侧用 SCP/SFTP 把 `kanban-deploy.tar.gz` 上传到 242 的 `/tmp/kanban-deploy.tar.gz`，然后在路由器上执行：

```sh
mkdir -p /opt/kanban /mnt/sata2-4/kanban/data
tar -xzf /tmp/kanban-deploy.tar.gz -C /tmp/kanban-package
cp -r /tmp/kanban-package/dist /opt/kanban/app
cp -r /tmp/kanban-package/server-py /opt/kanban/server-py
cp /tmp/kanban-package/deploy/start-kanban.sh /opt/kanban/start-kanban.sh
chmod +x /opt/kanban/start-kanban.sh
```

## 3. 创建首个账号

默认关闭公开注册。先通过命令行创建管理员账号：

```sh
cd /opt/kanban/server-py
KANBAN_DATA_DIR=/mnt/sata2-4/kanban/data python3 adduser.py you@example.com
```

密码至少 6 位；不要把密码写入仓库、前端或部署包。

## 4. 启动服务

iStoreOS 已有另一个 `python3 server.py` 服务，`start-stop-daemon -x python3` 会误判“已有 Python 进程”。看板使用独立可执行启动器 `/opt/kanban/server-py/run.py`：

```sh
start-stop-daemon -S -b -x /opt/kanban/server-py/run.py
```

`/opt/kanban/start-kanban.sh` 是等价的脚本封装，供开机自启调用。

自检：

```sh
curl --noproxy '*' http://127.0.0.1:8766/api/health
curl --noproxy '*' http://127.0.0.1:8766/api/auth/config
```

预期：健康检查返回 `{"ok":true,...}`；配置返回 `{"allowRegistration":false}`。局域网 Windows 访问 `http://192.168.31.242:8766/`。

## 5. 开机自启

参考现有 `/root/health-app/autostart.sh` 的方式，在 `/etc/rc.local` 的 `exit 0` 前加入：

```sh
/opt/kanban/start-kanban.sh &
```

保存后重启路由器验证进程是否自动拉起。

## 6. Cloudflare Tunnel 入口

看板后端同时监听局域网 `0.0.0.0:8766`；对外访问建议仍通过独立 tunnel 回连本机。临时验证可用 ephemeral tunnel：

```sh
/root/cloudflared/cloudflared tunnel --url http://127.0.0.1:8766 --protocol http2 --no-autoupdate
```

长期方案建议在 Cloudflare 后台配置命名 Tunnel，把固定 hostname 指向 `http://127.0.0.1:8766`。现有 `8765` tunnel 只服务旧 health-app，不要混用。

## 7. 备份

SQLite 数据库位于 `/mnt/sata2-4/kanban/data/kanban.db`。定期复制 `kanban.db`、`kanban.db-wal`、`kanban.db-shm` 到备份目录；可复用 `deploy/backup-sqlite.sh` 的思路。

## 8. 故障排查

- 页面打开但接口 401：检查 localStorage 中 token 是否过期，重新登录。
- `/api/auth/config` 显示注册开启：检查启动环境变量 `ALLOW_REGISTRATION=false`。
- 静态资源 404：确认 `/opt/kanban/app/index.html` 和 `/opt/kanban/app/assets` 存在。
- 端口占用：查看 `ps w | grep run.py` 和 `/mnt/sata2-4/kanban/server.log`，必要时在 `run.py` 中改 `PORT`。
- 依赖缺失：现场已有 FastAPI/uvicorn/pydantic；若新环境缺少依赖，在允许联网时执行 `pip install -r server-py/requirements.txt`。
