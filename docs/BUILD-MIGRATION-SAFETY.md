# VPS 构建、人工迁移与 PR 合并准备

VPS 是 AOC 唯一生产环境；Vercel/Neon 已弃用。本文描述仓库入口，不代表已获得生产操作授权，也不假定 VPS 的进程管理器或发布目录。

## 普通构建与启动

- `npm run build` → `scripts/build.mjs`，只执行 Prisma 客户端生成和 Next 生产构建。
- 旧 `scripts/vercel-build.mjs` 保留为安全兼容入口，同样调用新构建函数，不调用任何平台。
- `AOC_RUN_MIGRATIONS`、`AOC_RUN_STAFF_BOOTSTRAP` 已退出构建控制逻辑；即使继承值为 `true`，也不能使构建执行迁移或 bootstrap，且不会传给子命令。
- `npm start` 仍然只有 `next start`；没有 build/start/install 生命周期数据库钩子。
- 发布安装应明确使用 `pnpm install --frozen-lockfile --ignore-scripts`，再执行所需构建。客户端生成不等于执行迁移。Next 页面生成仍可能尝试业务数据读取，构建成功不证明数据库可用。

## 单独人工迁移入口（本次安全发布不需要执行）

仅在负责人明确批准数据库变更、目标和恢复方案后，由操作员在真实交互终端运行：

```sh
npm run db:migrate -- --confirm
```

先在该终端安全配置 `DATABASE_URL`，不要放入提交、终端共享截图或日志。当前 `prisma/schema.prisma` 的 datasource 使用 **DATABASE_URL**，没有 directUrl；不要以 DIRECT_URL 猜测迁移目标。

命令依次检查：不在 CI/GitHub Actions、参数必须仅有 `--confirm`、stdin/stdout 均为 TTY、显式 PostgreSQL DATABASE_URL 有有效主机和数据库。然后显示不含用户名/密码的主机、端口、数据库和 schema，要求逐字输入 `MIGRATE <显示的目标>`。缺失、输入 yes、目标不符或管道确认均拒绝，且不启动 Prisma。

确认通过后只执行一次 `prisma migrate deploy --schema <本项目schema>`；不重试、不生成客户端、不构建、不 seed、不 staff bootstrap。`db:deploy` 和 `prisma:migrate:deploy` 为同一受保护入口的兼容别名，不再连带修改员工访问数据。

这是一层防止仓库入口误操作的保护，不是数据库权限系统，也不能阻止具备权限的人自行调用原始 Prisma/SQL。不要通过清除 CI、伪造 TTY 或绕开脚本规避授权。独立的 seed/bootstrap 工具不属于普通构建；需要各自单独批准。

## GitHub Actions

自动 PR 检查：

- `Dependency security regression / security`：冻结安装（禁用安装脚本）、审计、validate/generate、构建/迁移保护测试、身份/预约/OFP/AMN stub 回归。
- `FOQA v2 regression / test`：不创建数据库服务，使用 127.0.0.1:1 不可用测试 URL；运行保护测试、真实 `npm run build`、FOQA/ACARS/flight-analysis、TypeScript 与 ESLint。构建步骤特意设两个退役开关为 true，验证它们不会启动数据库写入。

上述自动任务均无 migrate/db push/db execute/seed/bootstrap 步骤，不使用生产 secrets、环境或部署权限。

原有 FOQA 数据库覆盖未删除：移到同一工作流的 `isolated-database` 手动 job。仅 workflow_dispatch 且操作员明确勾选 `run_isolated_database_validation=true` 才运行；默认 false，PR/push 永远跳过。它只操作临时 PostgreSQL 16 服务，DATABASE_URL/DIRECT_URL 固定为 runner 的 127.0.0.1:5432/foqa，执行 SQL 前再次精确校验目标；不接受外部数据库 URL。该 job 仍会执行测试 schema SQL，因此本轮不触发。

后续若启用 main 必需检查，应选择自动 `test` 与 `security`，不要把手动数据库 job 或废弃 Vercel 状态设为必需。本次不修改任何保护规则或集成。

## 隔离验证与边界

`npm run test:build-safety` 验证继承旧开关、拒绝条件、目标确认、非 TTY 的真实命令拒绝，以及受保护别名。授权成功分支只注入假 CLI，绝不执行数据库操作。另以独立目录、不可用测试 URL 运行实际 `npm run build` 和本地启动；不配置生产凭据。

Prisma 版本/schema/迁移文件与 main 一致，本次无 schema 迁移需求。代码与隔离验证通过后可进入人工合并；实际部署仍需核实 VPS 组件、运行环境、HTTPS/Origin、真实业务/数据库兼容性和回退制品。

## #91 合并后同步 #90 的方案（本轮不执行）

1. 人工审查 #91 的最终 head 和自动检查，并确认合并 main 不会触发现有服务器自动部署；然后由用户决定合并。
2. 另行授权在 feature/aoc-pwa 同步最新 main，使用 merge 或经协商的 rebase，不直接改 main。
3. 已知 package.json 的 scripts 冲突同时保留 `test:build-safety`、`test:security-dependencies`、`test:pwa`；保留 #91 的新 build 和所有受保护迁移别名，不恢复旧包装器/环境开关语义。
4. 保留 #91 安全依赖与定向 overrides、pnpm 锁文件和 Next 生成类型；#90 本身没有依赖锁文件变更。保留 #90 的 manifest、SW、安装/更新、布局与版本接口。若 AGENTS/文档发生变化，保留 VPS 唯一生产环境政策与新构建保护。
5. 解决冲突后冻结安装、全量/生产审计、保护测试、PWA 契约、构建/类型/lint、业务回归；再做 HTTPS/设备验收。确认新 head 自动检查通过后由用户决定合并 #90，部署仍单独批准。

## 部署与回滚

本次安全版本没有数据库变更，应用制品回退不应执行 down SQL 或恢复数据库快照。保留匹配的完整制品、运行配置和会话密钥，使用已经确认的 VPS 发布机制；不混用不同 Next/node_modules。原 main 依赖存在已知漏洞，回退旧制品需明确承担并缩短重新暴露风险，优先前向修复。

在未获得生产授权前不执行任何切换、重启、代理修改、迁移或 bootstrap。服务器现有脚本即使绕过本仓库入口也可能写库，仍需 VPS 只读证据核实；仓库修复不能代替服务器配置验收。
