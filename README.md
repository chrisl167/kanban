# 服药与工作看板

一个结合服药打卡与通用工作事项的看板 Demo：支持看板列、今日清单、进度统计、优先级与标签，并预留 Supabase 接入示例。

## 功能

- 三列看板：待办、进行中、已完成
- 默认预置本次 HP 根除治疗服药任务
- 可新增通用工作/个人事项
- 查看总事项、进行中、已完成、逾期数量与完成率
- 支持卡片按钮移动状态；本地模式下数据保存在浏览器
- Supabase 表结构、RLS 策略与客户端初始化示例

## 技术栈

- 原生 JavaScript + Vite
- Supabase JS Client（可选接入）
- 无后端服务；当前版本可作为前端 Demo 或本地工具

## 本地运行

```bash
npm install
npm run dev
```

浏览器打开 Vite 输出的本地地址即可。

## 接入 Supabase

1. 在 Supabase 新建项目。
2. 在 SQL Editor 执行 `supabase/schema.sql`，创建 `kanban_tasks` 表和策略。
3. 复制 `.env.example` 为 `.env.local`，填写：

```env
VITE_SUPABASE_URL=你的 Supabase 项目 URL
VITE_SUPABASE_ANON_KEY=你的 anon/public key
```

4. 重新运行 `npm run dev`。

## 安全说明

- 前端只应使用 `anon/public key`，不要把 `service_role key` 写进前端代码。
- 示例 SQL 为个人 Demo 放开了匿名读写；正式项目应接入 Supabase Auth，并在 RLS 策略中按 `auth.uid()` 限制用户只能访问本人数据。
- 服药记录属于健康信息，公开部署时需要重新评估隐私与访问控制。

## GitHub 上传准备

项目已包含 `.gitignore`，忽略 `node_modules`、`dist` 和本地环境文件。

首次推送示例：

```bash
git init
git add .
git commit -m "feat: 服药与工作看板初始版本"
git branch -M main
git remote add origin 你的仓库地址
git push -u origin main
```

> 当前环境没有 GitHub 授权，因此不能直接替你创建远程仓库；代码与上传说明已整理好，拿到仓库地址后即可推送。
