# 服药与工作看板

一个结合服药打卡与通用工作事项的看板：支持看板列、新增/编辑/删除、今日清单、进度统计、优先级与标签；未登录时使用本地缓存，登录 Supabase 后可云端同步。

## 功能

- 三列看板：待办、进行中、已完成
- 默认预置本次 HP 根除治疗服药任务
- 弹窗新增、编辑、删除工作/个人/服药事项
- 查看总事项、进行中、已完成、逾期数量与完成率
- 支持卡片按钮移动状态，也支持拖拽换列
- Supabase Auth 邮件魔法链接登录，按用户隔离数据
- 未配置 Supabase 时，数据保存在当前浏览器本地
- 已适配 GitHub Pages 子路径 `/kanban/`

## 技术栈

- 原生 JavaScript + Vite
- Supabase JS Client（可选接入）
- 无自建后端；静态前端 + Supabase 数据库

## 本地运行

```bash
npm install
npm run dev
```

浏览器打开 Vite 输出的本地地址即可。

## 接入 Supabase

1. 在 Supabase 新建项目，并在 Authentication 中开启邮箱登录。
2. 在 SQL Editor 执行 `supabase/schema.sql`，创建 `kanban_tasks` 表、索引和 RLS 策略。
3. 复制 `.env.example` 为 `.env.local`，填写：

```env
VITE_SUPABASE_URL=你的 Supabase 项目 URL
VITE_SUPABASE_ANON_KEY=你的 anon/public key
```

4. 重新运行：

```bash
npm run dev
```

5. 在页面点击“登录”，输入邮箱，通过 Supabase 邮件链接完成登录。

## 构建与部署

### 本地构建

```bash
npm run build
```

产物输出到 `dist/`。

### GitHub Pages

项目已配置 `base: '/kanban/'`，适合仓库名为 `kanban` 的 Pages 地址。可通过 GitHub Actions 自动构建部署，或手动把 `dist/` 内容发布到 Pages。

### Vercel / Netlify

连接 GitHub 仓库后，构建命令填 `npm run build`，发布目录填 `dist`；Supabase 环境变量在平台后台配置，不要提交到仓库。

## 安全说明

- 前端只应使用 `anon/public key`，不要把 `service_role key` 写进前端代码。
- 数据库 RLS 已按 `auth.uid()` 限制用户只能访问本人数据。
- 服药记录属于健康信息，公开部署前需要确认登录方式、数据范围和隐私策略。
- 本地缓存只是离线兜底；跨设备同步以 Supabase 云端数据为准。

## Git 推送示例

```bash
git init
git add .
git commit -m "feat: 看板待办、编辑删除与 Supabase 同步"
git branch -M main
git remote add origin https://github.com/chrisl167/kanban.git
git push -u origin main
```
