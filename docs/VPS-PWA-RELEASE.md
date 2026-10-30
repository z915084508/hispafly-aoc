# PR #90：VPS 唯一生产环境核查与发布预案

审查日期：2026-10-28。PR：[HISPAFLY AOC #90](https://github.com/z915084508/hispafly-aoc/pull/90)。
本文件为审查与未来发布计划，不代表已获合并或部署授权。

## 1. 当前生产政策

根据项目所有者的明确确认，AOC 已完全迁移到自有 VPS；VPS 是唯一生产环境，
Vercel 托管/部署和 Neon 数据库均已弃用。该政策已加入根目录 `AGENTS.md`。
仓库中的历史名称、示例、工作流或外部检查不能推翻这个事实，也不能作为恢复旧平台的理由。

## 2. GitHub 只读核查

核查对象为当时的 `main=cf9f483ab601d9fa1689b0ffbf84195b1230e511` 与
原 PR head `6458a45b3b23f90694949b9c522d44fdcbf27bc5`。

| 项目 | 直接读取结果 | 结论 |
| --- | --- | --- |
| PR #90 | OPEN、MERGEABLE、autoMergeRequest=null | 没有内容合并冲突，未启用自动合并 |
| main 分支元数据 | protected=false | 当前未保护 |
| `/branches/main/protection` | HTTP 404，明确说明 Branch not protected | 不是仅因猜测/无权限而推断没有保护 |
| `/rules/branches/main` | `[]` | 没有返回生效规则 |
| `/rulesets?includes_parents=true` | `[]` | 没有返回仓库/继承规则集 |
| FOQA v2 regression | test SUCCESS；[run 40763476258](https://github.com/z915084508/hispafly-aoc/actions/runs/40763476258) | 原提交 CI 成功，不代表后续提交已通过 |
| Vercel | FAILURE，Deployment was blocked | 遗留外部状态，不是当前必需检查 |
| Vercel Preview Comments | SUCCESS | 遗留预览评论集成，不是 VPS 验证 |

GitHub 同时列出两个 active 工作流记录，不能据此认为它们都存在于 main：

- `.github/workflows/foqa-v2.yml` 存在于 main；PR 触发，使用 GitHub 托管 runner
  和临时 PostgreSQL 16 服务，执行隔离迁移测试、FOQA/ACARS 回归、类型检查与构建。
  没有 SSH/VPS 部署步骤，没有读取生产 secret 的步骤，也不是 Neon 数据库。
- `Self-hosted container build` 的历史成功记录属于
  `codex/self-hosted-container-20261004-v2`、提交 `5cc77e7`。
  [历史 run](https://github.com/z915084508/hispafly-aoc/actions/runs/37191043526)
  只在 ubuntu-24.04 runner 构建并导出 Docker 镜像 artifact，无部署步骤。
  对应文件在 main 的 Contents API 返回 404。“Self-hosted”工作流名称不表示 runner
  位于生产 VPS，也不能证明现网使用 Docker。

检查整体显示 UNSTABLE 的原因是遗留 Vercel 状态，不是内容冲突。
本次未修改 Actions、分支保护、规则集、GitHub App 或任何托管平台设置。

### 遗留 Vercel 清理方案（仅建议，未执行）

1. 保存当前外部检查与集成归属的证据，确认只清理 `z915084508/hispafly-aoc`。
2. 当前没有必需检查，因此**不存在需要从当前 main 必需列表移除的 Vercel 条目**。
   若实际设置随后变化，应重新读取规则；不得先关闭所有检查再合并。
3. 管理员经单独批准后，检查 GitHub 仓库/账户安装的 Vercel App 或相关 webhook，
   将 AOC 从选定仓库访问/关联中移除，或仅断开废弃 AOC 项目的 Git 连接。
   不卸载影响 EFB/其他仓库的共享安装，不删除项目、历史数据或存储。
4. 新提交/PR 不再收到新 Vercel 检查即可验证解绑成功；旧提交的历史失败状态可能保留。
   不伪造 SUCCESS，不重试废弃部署来“变绿”，不恢复 Vercel/Neon。
5. 建议另行审核 main 保护策略：要求 PR 审查、有效的 GitHub regression job、禁止强推。
   当前 job 名为 `test`，未来若多工作流重名应先消歧；不要加入 Vercel/Neon 必需检查。
6. 可在另一项 CI 变更中加入 `pnpm test:pwa` 与适当浏览器检查；本次按只读要求未改工作流。

## 3. VPS 实际组件：证据与未知项

本次没有可用的 SSH 主机别名、连接用户和端口配置；本机已存在的配置文件为空。
没有读取私钥、猜测 root 用户、尝试任意 SSH 登录或访问服务器控制台。

公开入口于 2026-10-28 20:34:34 UTC（21:34:34 CET）实测：

| 组件 | 证据 | 可以确认什么 |
| --- | --- | --- |
| DNS | AOC A 记录为 89.58.16.226，TTL 300 | 该次公开解析结果；不自动等于 SSH 地址 |
| HTTPS | 默认 TLS 校验下 HEAD 返回 200 | 当时公开 HTTPS 可用；未单独采集到期日/续期任务 |
| HTTP | 308 到同域 HTTPS | 强制跳转有效 |
| 公开入口软件 | Server: Caddy | 响应声明 Caddy；不是完整服务器拓扑证明 |
| Nginx | 无服务器进程/配置证据 | 未确认是否存在、是否与 Caddy 串联 |
| PM2 | 无进程管理器证据 | 未确认 |
| Docker/Compose | 仅有历史 CI 构建 | 未确认现网是否采用容器 |
| PostgreSQL | 所有者确认 VPS 架构，源码使用 Prisma/PostgreSQL | 实际服务位置/容器、版本、端口、SSL和备份情况仍待只读取证 |
| Node/发布目录/镜像 | 未取得生产 release SHA/digest | 未确认，不能把 main 或历史容器分支当成现网 |

### 可以补充的只读信息

提供以下两种方式之一即可，不需要发送私钥、密码、连接串或完整环境：

**连接方式：** SSH 主机或已配置别名、端口、获准只读的用户名、可信主机指纹，
以及可使用的受管密钥/现有会话位置。不要把公网站点 IP 自动当作该连接配置。

**管理员脱敏摘要：**

- OS/CPU 架构、相关服务是否运行、监听端口；可以用 `uname -m`、
  `systemctl list-units --type=service --all --no-pager` 的 AOC/代理/数据库相关行，
  以及 `ss -lnt`，不要发送带令牌的进程完整命令行。
- Docker 若已使用：容器名、image/digest、状态、端口及 AOC 网络/卷用途。
  可提供 `docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}'`。
  不提供完整 inspect/env 输出。
- PM2 若已使用：已有守护进程管理的应用名、状态、运行目录与版本摘要。
  不为取证首次启动 PM2 守护进程；不发送包含 env 的 jlist/report。
- 仅 AOC 站点的脱敏代理配置：listen/server_name、上游、静态资源和缓存规则，
  Host/Forwarded 头、流式/WebSocket/上传超时。不要发送整机 nginx -T 或完整 Caddy 配置。
- PostgreSQL 管理方式、主版本、与应用的连接拓扑及备份摘要；如需查询，仅在 DBA
  批准的只读事务中读取 version/SSL/迁移元数据，不读取业务行或修改 schema。
- 当前应用 `git rev-parse HEAD` 或镜像标识、服务切换方式、上一稳定制品。
- AOC cron/timer 的归属、时间和最近执行结果摘要，不提供认证 token。
- HTTPS 证书 subject/SAN/issuer/到期日及续期服务状态，绝不发送私钥。

## 4. SW 敏感数据核查

`public/sw.js` 的写缓存入口只在 install 内，且只遍历六个静态允许地址。
请求不带凭证，拒绝重定向、非成功/opaque、错误 MIME 和 private/no-store 响应。
运行期没有把业务网络响应写入 Cache Storage 的逻辑。

- 登录 Cookie/密码/会话令牌不被读取或缓存。
- `/api/`、非 GET/Server Actions、RSC、预取、跨域请求直接由原网络逻辑处理。
- SimBrief OFP/PDF、STRATOS/ACARS PIREP、航班、预约、TSAT/CTOT、钱包和身份信息
  不在允许列表，业务文档联网读取且不入 SW 缓存。
- 断网文档仅通用 503，无个人数据；不排队或恢复重放任何写操作。
- 新增 `/api/pwa/version` 也绕过 SW；它仅返回公开生成的 buildId，no-store、
  credentials=omit，不读数据库、身份或服务器设置，不改变既有 API 契约。

这确认的是本 PR 的 SW 逻辑，不等于已经验证生产代理/浏览器历史/第三方下载缓存。
正式发布前须在隔离环境检查实际响应与 Cache Storage。

## 5. 更新机制修正

原 head `6458a45` 只在页面加载/恢复可见时检查 SW；当业务发布不改变 SW 内容时，
可能没有更新提示；长期前台窗口也不会触发 visibilitychange。

本次修正采用**每次构建一个公开随机标识**，编译时同时注入客户端和版本端点。
可见窗口在初始化、恢复可见及每 15 分钟检查当前发布标识，同时继续检查 SW。
标识变化时即使 SW 字节完全相同，也提示保存后刷新；选择 Later 后后续检查可再提示。
更新只刷新主动确认的窗口，不强迫刷新正在填写预约/签名的其他窗口。

本地补验：8项PWA契约测试通过；生产构建与内置类型检查通过；修改文件ESLint通过。
Chrome和Edge均通过同SW前端版本变化检测、版本请求不带Cookie、定时检查再次提醒、
未保存表单保留与主动刷新测试；同时复验原有安装、布局和SW更新交互。

多个实例必须部署同一制品/同一 buildId，不要逐台独立构建造成来回提示。
版本端点经真实代理必须保持 no-store，回滚时也需要可返回旧制品的标识。
离线、后台计时器被浏览器暂停、用户持续拒绝刷新时不能承诺强制的更新时间上限；
这里保障可发现、可提醒、可主动更新，不以丢失用户工作换取强制刷新。

## 6. PR 合并后的 VPS 发布流程（仅预案）

1. **准入。** 完成 PR 审查、最新提交 CI 与下方隔离/真机检查，另行取得合并和发布授权。
   记录最终 merge SHA、制品 digest/buildId；本 PR 目前不合并。
2. **生产映射。** 先取得第 3 节只读信息，将当前 VPS SHA/私有包装与 main 对齐。
   如果现网有独立 VPS 改动，先合并验证，不用未知 main 覆盖生产。
3. **构建一次。** 使用已确认的 Linux/CPU/Node/锁文件环境和现有包装；不持有生产
   凭证，迁移/bootstrap 开关关闭。生成客户端后直接执行 Next build。
   legacy 名为 vercel-build 的脚本不代表仍需 Vercel，不因名称而重连平台。
4. **制品完整。** 现有 next start 包装需包含所需依赖、构建与 public；只有现网已验证
   standalone 时才按该模式打包，并包括 public、`.next/static`、匹配 Linux 的 Prisma 引擎。
   不把历史审核 Docker/Compose 模板直接当作生产配置。
5. **隔离实例。** 使用独立测试库、测试账号和测试/stub外部服务，经 HTTPS 验证；
   不接生产库或生产 AMN/邮件/cron，不用预览环境替代隔离。
6. **留存回退。** 保留旧制品、配置快照、旧哈希资源及既有有效数据库备份；不新增
   schema/cron 变更。本 PWA 更新不需要 migration、seed、bootstrap 或数据库恢复。
7. **获准切换。** 使用已确认的现有 AOC 服务管理方式，仅切换 AOC 发布/上游。
   不重启数据库、其他应用或整套 Compose；域名、TLS、OAuth、会话/签名密钥、存储和调度不变。
8. **观察。** 比较 5xx、登录/预约/OFP失败、ACARS遥测/PIREP和静态资源错误。
   核心功能异常即停止推广并回滚，不等待 PWA 安装指标掩盖业务故障。

### 验证清单

- [ ] 真实代理后 manifest/icon/SW MIME、scope和更新缓存头正确，版本端点只有buildId且no-store。
- [ ] 同一制品客户端与服务器buildId一致，无误报；SW不变的下一制品发布也能提醒更新。
- [ ] 15分钟可见窗口检查、恢复可见、Later再提醒、双窗口保留与主动刷新通过。
- [ ] Cache Storage只有六个静态文件；登录、API、OFP、PIREPs、TSAT/CTOT均未入缓存。
- [ ] 测试库Pilot/Staff登录、重开、过期、登出、禁用、切账号及权限正确。
- [ ] 测试预约/取消/自派遣、SimBrief授权/OFP/PDF、STRATOS/ACARS完整测试链通过。
- [ ] Windows、Android、iPhone/iPad实际安装、横竖屏、键盘、PDF与后台恢复通过。
- [ ] 断网无旧私有数据、无离线写入/自动重放；桌面OCC不回归。
- [ ] Linux制品、反向代理、数据库拓扑、HTTPS续期及现有cron归属已确认。
- [ ] 已用旧版本设备验证下述服务端与SW双层回滚，不只测试新安装。

## 7. 回滚方案

**服务端：** 恢复上一个稳定制品/digest与原上游，保留同一数据库、域名、OAuth配置和会话密钥。
本次无schema变更，不恢复旧数据库快照覆盖真实新增预约/PIREP。
留存旧静态哈希资源，复核登录、预约、OFP、ACARS和版本端点。

**客户端：** 旧制品不应让 `/sw.js` 返回404或HTML回退。提前验证至少一种策略：

- 同URL/scope发布兼容旧应用的修正版SW与新缓存版本，保持业务网络直连；或
- 经单独审查的退役Worker，只清理 `hispafly-aoc-static-*` 并安全解除自身注册。

不清除用户Cookie、localStorage、其他应用缓存，不发全站 Clear-Site-Data。
退役Worker不是本次已实现/已部署内容。服务器回滚不会自动删除设备上的SW。
验证旧安装、旧标签、关闭重开、离线再联网与后续版本恢复。

## 8. 本次权限边界

GitHub设置/Actions/分支保护和公开站点检查均只读；遗留集成清理只是方案。
仓库变更为 AGENTS、更新检测修正、测试和本报告，提交到PR分支供审查。
没有合并、部署、SSH登录、生产数据库操作、服务重启或DNS/TLS修改。

参考：[GitHub分支保护](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)、
[Next编译期公开标识](https://nextjs.org/docs/app/api-reference/config/next-config-js/env)、
[Next自托管](https://nextjs.org/docs/app/guides/self-hosting)。
