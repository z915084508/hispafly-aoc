# Dependency security fix — 2026-10-29

## 范围与结论

安全分支 security/dependency-hardening，基于 main cf9f483ab601d9fa1689b0ffbf84195b1230e511；不包含 PR #90 的 PWA 提交，feature/aoc-pwa 仍为 7c7ba45。VPS 是唯一生产环境；不恢复 Vercel/Neon。

已修复本次审计命中的依赖。修复后的 pnpm 与 npm 审计全量/生产范围均为零。此结论只适用于仓库锁定版本和当前审计数据库，不证明运行中的 VPS 已经修补。没有 SSH/服务器制品证据，**尚不能确认任何具体漏洞是否确实存在于现网**；这也绝不表示现网没有漏洞。App Router + Server Actions 是本仓库明确存在的受影响功能前提，应优先发布经验证的安全版本。

## 审计方法和前后对比

项目唯一安装锁文件为 pnpm-lock.yaml。首次直接 npm audit 返回 ENOLOCK；npm shrinkwrap 对 pnpm 符号链接生成的快照错误地显示零，本报告不采用该快照。为执行 npm audit，另外从原始/修复后的 pnpm 锁文件遍历依赖与 dev 标记，创建**仅审计用的精确版本清单**，分别运行 npm audit --json 和 npm audit --omit=dev --json；不将该清单用于安装、不在项目提交第二种安装锁文件。pnpm 原生审计是依赖路径、生产/开发分类与漏洞清单的主要依据；npm 清单交叉核验版本风险，不代表真实 npm 安装布局。

| 审计范围 | 修复前 Critical / High / Moderate / Low | 修复后 |
|---|---|---|
| pnpm 全量（通告/版本记录计数） | 5 / 36 / 28 / 2 | 0 / 0 / 0 / 0 |
| pnpm --prod | 5 / 24 / 26 / 2 | 0 / 0 / 0 / 0 |
| npm 全量版本清单（按受影响包聚合） | 1 / 11 / 1 / 0 | 0 / 0 / 0 / 0 |
| npm --omit=dev 版本清单 | 1 / 9 / 1 / 0 | 0 / 0 / 0 / 0 |

两种工具计数口径不同，不可相减或混称漏洞数。全量 Critical/High 共 36 个不同 GHSA；同一个 brace-expansion GHSA 命中两个版本线会在 pnpm 中重复计数。新增 CI 对全量和生产范围的 High/Critical 失败，不屏蔽中低风险结果。

## 最小影响升级

| 依赖 | 原锁定版本 | 新锁定版本 / 理由 |
|---|---|---|
| Next + eslint-config-next | 16.2.9 | 16.4.3；同主版本补丁线，覆盖所有命中 Next 通告 |
| React / React DOM | 19.2.7 | 19.2.9；保持 19.2，不引入 19.3 |
| Nodemailer | 9.0.3 | 10.1.4；High GHSA-v53p-9fqp-m79j 无 9.x 修复，10.0.6 起修复；10.1.4 同时覆盖其余本次命中的中风险。Node >=20，与 Next >=20.9 的要求相容 |
| ESLint | 9.39.4 | 9.39.5；不为此次任务升级 ESLint 10；9.x 已提示不受支持，后续单独迁移 |
| Prisma / @prisma/client | 6.19.3 | 保持 6.19.3，不改 schema、不迁移 |
| sharp | 0.34.5 | 0.35.5；随 Next 的安全依赖范围自然升级 |
| undici / brace-expansion / js-yaml / nanoid / browserslist / source-map-js | 见清单 | 只更新命中包，在现有主版本范围内锁定补丁 |

pnpm-workspace.yaml 增加三条窄范围覆盖：@tailwindcss/postcss>postcss=8.5.23、@vercel/cli-config>zod=4.6.7、@prisma/config>deepmerge-ts=8.0.0。前两项修复上游精确固定的旧版本；deepmerge 通告只列 8.0.0 补丁，因此仅替换 Prisma 配置工具的这个组件，避免整个 Prisma 升级到 7。新增实际配置加载兼容测试并通过 Prisma validate/generate。不要将该覆盖扩大到无关依赖。

## Next、React、RSC、Server Actions

源码 src/app/pilot/actions.ts、src/app/pilot/bookings/actions.ts 等包含 use server；Next 的两项 Server Actions DoS（GHSA-m99w-x7hq-7vfj、GHSA-p3m5-59mp-jv5r）具备本地功能前提。Next 16.4.3 超过通告给出的 16.4.1 修复边界。

React RSC 通告 [GHSA-h3gv-c5rc-p453](https://github.com/react/react/security/advisories/GHSA-h3gv-c5rc-p453) 与 [GHSA-xqc2-xf4c-x3h3](https://github.com/react/react/security/advisories/GHSA-xqc2-xf4c-x3h3) 是重要上游背景。项目没有独立安装 react-server-dom-webpack/parcel/turbopack；Next 在 dist/compiled 中捆绑 RSC 实现，这些包的 package.json 不提供可审计的独立版本字段。因此**不能只升级 React 并宣称 RSC 修好**；采用框架维护者明确修补的 Next 版本，配合 React/ReactDOM 19.2.9 和生产构建验证。参见 [Next 官方安全说明](https://nextjs.org/blog/nextjs-security-update-october-14-2026)。

图片与 use cache 的 RCE 需要额外功能、输入和平台条件，不能把 5 Critical 全部视为已证实公网可利用。下表逐项列明。

## 全部 Critical / High 清单

每一行“生产依赖树”仅说明锁文件路径可达，不保证该包处理生产请求。所有行的实际 VPS 状态均为未核实。更完整路径见同目录 security/dependency-findings-2026-10-29.json。

| 严重性 | 依赖及原版本 | GHSA / CVE | 通告修复范围 → 本次锁定版本 | 分类 | 生产可利用条件 / 当前证据 |
|---|---|---|---|---|---|
| critical | next 16.2.9 | [GHSA-2464-fhr4-w9xw](https://github.com/advisories/GHSA-2464-fhr4-w9xw)<br>无单独 CVE；以 GHSA 为准 | >=16.4.1 → 16.4.3 | 生产依赖树 | glibc Linux 上底层 SVG 处理路径；next/image 已使用，不可信 SVG 入口与实际系统尚未确认。sharp >=0.35.5 是通告给出的缓解。 |
| critical | next 16.2.9 | [GHSA-2xp9-vwfh-vxw4](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4)<br>无单独 CVE；以 GHSA 为准 | >=16.3.3 → 16.4.3 | 生产依赖树 | 图片优化处理不可信 AVIF，涉及底层 libheif；项目使用 next/image，但攻击者控制图片入口尚未确认。 |
| critical | next 16.2.9 | [GHSA-673q-mjm6-r5xr](https://github.com/advisories/GHSA-673q-mjm6-r5xr)<br>无单独 CVE；以 GHSA 为准 | >=16.4.1 → 16.4.3 | 生产依赖树 | Cache Components 的 use cache 返回多份 typed arrays；当前未发现 use cache/cacheComponents 配置，仍通过 Next 补丁覆盖。 |
| critical | next 16.2.9 | [GHSA-p293-qw3h-jr36](https://github.com/advisories/GHSA-p293-qw3h-jr36)<br>CVE-2026-75604 | >=16.3.3 → 16.4.3 | 生产依赖树 | 运行在 Windows 文件系统的服务器；VPS OS 未知，不能据客户端 Windows 推断现网适用。 |
| critical | next 16.2.9 | [GHSA-vcvr-r3jv-pc5j](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j)<br>无单独 CVE；以 GHSA 为准 | >=16.3.6 → 16.4.3 | 生产依赖树 | Node ImageResponse 渲染不可信 SVG；当前 src 未发现 next/og 或 ImageResponse 使用。 |
| high | brace-expansion 1.1.15 / 5.0.6 | [GHSA-3jxr-9vmj-r5cp](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp)<br>CVE-2026-13149 | >=1.1.16；>=5.0.7 → 1.1.21 / 5.0.12 | 仅开发 | 仅开发树 ESLint/Minimatch；处理攻击者提供的 brace glob 才可触发 CPU/内存/递归 DoS；未发现生产 HTTP 入口。 |
| high | brace-expansion 1.1.15 / 5.0.6 | [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p)<br>CVE-2026-102276 | >=1.1.19；>=5.0.10 → 1.1.21 / 5.0.12 | 仅开发 | 仅开发树 ESLint/Minimatch；处理攻击者提供的 brace glob 才可触发 CPU/内存/递归 DoS；未发现生产 HTTP 入口。 |
| high | brace-expansion 1.1.15 / 5.0.6 | [GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg)<br>CVE-2026-14257 | >=1.1.17；>=5.0.8 → 1.1.21 / 5.0.12 | 仅开发 | 仅开发树 ESLint/Minimatch；处理攻击者提供的 brace glob 才可触发 CPU/内存/递归 DoS；未发现生产 HTTP 入口。 |
| high | brace-expansion 1.1.15 / 5.0.6 | [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7)<br>CVE-2026-102278 | >=1.1.20；>=5.0.11 → 1.1.21 / 5.0.12 | 仅开发 | 仅开发树 ESLint/Minimatch；处理攻击者提供的 brace glob 才可触发 CPU/内存/递归 DoS；未发现生产 HTTP 入口。 |
| high | brace-expansion 5.0.6 / 1.1.15 | [GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895)<br>CVE-2026-69152 | >=5.0.9；>=1.1.18 → 1.1.21 / 5.0.12 | 仅开发 | 仅开发树 ESLint/Minimatch；处理攻击者提供的 brace glob 才可触发 CPU/内存/递归 DoS；未发现生产 HTTP 入口。 |
| high | browserslist 4.28.4 | [GHSA-73wf-gq98-2v4g](https://github.com/advisories/GHSA-73wf-gq98-2v4g)<br>CVE-2026-73088 | >=4.28.7 → 4.29.5 | 生产依赖树 | 编译查询缓存或自定义 stats 来自攻击者；包在生产依赖树，但没有发现应用 HTTP 调用入口。 |
| high | browserslist 4.28.4 | [GHSA-c83g-rgw3-j3cx](https://github.com/advisories/GHSA-c83g-rgw3-j3cx)<br>CVE-2026-73089 | >=4.28.7 → 4.29.5 | 生产依赖树 | 编译查询缓存或自定义 stats 来自攻击者；包在生产依赖树，但没有发现应用 HTTP 调用入口。 |
| high | deepmerge-ts 7.1.5 | [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx)<br>CVE-2026-40345 | >=8.0.0 → 8.0.0 | 生产依赖树 | Prisma CLI 配置合并两个同路径自引用对象；仅普通 JSON 不足以触发。因 @prisma/client 的 Prisma peer 被生产审计归类；src/lib/prisma.ts 只导入客户端，没有导入 CLI 配置。 |
| high | js-yaml 4.3.0 | [GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh)<br>CVE-2026-84375 | >=4.3.2 → 4.3.2 | 仅开发 | 仅开发树 ESLint 配置解析；需处理不可信 YAML（omap/merge）；不是生产 HTTP 数据解析器。 |
| high | js-yaml 4.3.0 | [GHSA-5p4m-2wfm-xmqj](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj)<br>无单独 CVE；以 GHSA 为准 | >=4.3.1 → 4.3.2 | 仅开发 | 仅开发树 ESLint 配置解析；需处理不可信 YAML（omap/merge）；不是生产 HTTP 数据解析器。 |
| high | nanoid 3.3.15 | [GHSA-28wg-ghj8-5hjv](https://github.com/advisories/GHSA-28wg-ghj8-5hjv)<br>CVE-2026-67214 | >=3.3.16 → 3.3.20 | 生产依赖树 | 非安全/自定义生成器收到攻击者可控负数或零长度；当前应用未发现直接 nanoid 调用。 |
| high | nanoid 3.3.15 | [GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8)<br>CVE-2026-67213 | >=3.3.18 → 3.3.20 | 生产依赖树 | 非安全/自定义生成器收到攻击者可控负数或零长度；当前应用未发现直接 nanoid 调用。 |
| high | next 16.2.9 | [GHSA-6gpp-xcg3-4w24](https://github.com/advisories/GHSA-6gpp-xcg3-4w24)<br>CVE-2026-64642 | >=16.2.11 → 16.4.3 | 生产依赖树 | Turbopack + App Router + 单一 config.i18n.locales，且授权依赖 middleware；当前 next.config.ts 无该 locales 配置。 |
| high | next 16.2.9 | [GHSA-89xv-2m56-2m9x](https://github.com/advisories/GHSA-89xv-2m56-2m9x)<br>CVE-2026-64649 | >=16.2.11 → 16.4.3 | 生产依赖树 | Server Action 转发/重定向、自定义服务器或未约束 Host 关联头；实际 VPS 代理/自定义服务器未知。 |
| high | next 16.2.9 | [GHSA-cjq9-62q9-8jv4](https://github.com/advisories/GHSA-cjq9-62q9-8jv4)<br>CVE-2026-94483 | >=16.3.8 → 16.4.3 | 生产依赖树 | 图片优化访问允许的远程主机，攻击者能控制 DNS/URL；当前配置未声明 images.remotePatterns，现网入口仍待查。 |
| high | next 16.2.9 | [GHSA-m99w-x7hq-7vfj](https://github.com/advisories/GHSA-m99w-x7hq-7vfj)<br>CVE-2026-64641 | >=16.2.11 → 16.4.3 | 生产依赖树 | App Router 定义至少一个 Server Action；当前 src/app/pilot/actions.ts 等符合功能前提，公网请求可消耗服务进程 CPU。 |
| high | next 16.2.9 | [GHSA-p3m5-59mp-jv5r](https://github.com/advisories/GHSA-p3m5-59mp-jv5r)<br>CVE-2026-94482 | >=16.4.1 → 16.4.3 | 生产依赖树 | App Router + 至少一个 Server Action；本仓库符合功能前提。是否现网暴露仍须确认实际版本。 |
| high | next 16.2.9 | [GHSA-p9j2-gv94-2wf4](https://github.com/advisories/GHSA-p9j2-gv94-2wf4)<br>CVE-2026-64645 | >=16.2.11 → 16.4.3 | 生产依赖树 | rewrites/redirects 外部目标主机由请求输入构造；当前 next.config.ts 无这类规则。 |
| high | nodemailer 9.0.3 | [GHSA-2x7j-588g-ccc2](https://github.com/advisories/GHSA-2x7j-588g-ccc2)<br>无单独 CVE；以 GHSA 为准 | >=9.1.0 → 10.1.4 | 生产依赖树 | src/lib/auth/delivery.ts 的账号验证/重置邮件使用该库；不可信收件人字符串进入地址解析器可阻塞进程，需要评估输入长度/语法限制，不能判为纯开发风险。 |
| high | nodemailer 9.0.3 | [GHSA-v53p-9fqp-m79j](https://github.com/advisories/GHSA-v53p-9fqp-m79j)<br>无单独 CVE；以 GHSA 为准 | >=10.0.6 → 10.1.4 | 生产依赖树 | src/lib/auth/delivery.ts 的账号验证/重置邮件使用该库；不可信收件人字符串进入地址解析器可阻塞进程，需要评估输入长度/语法限制，不能判为纯开发风险。 |
| high | postcss 8.4.31 | [GHSA-6g55-p6wh-862q](https://github.com/advisories/GHSA-6g55-p6wh-862q)<br>CVE-2026-45623 | >=8.5.12 → 8.5.23 | 生产依赖树 | 需处理恶意 CSS sourceMappingURL；生产依赖树包含编译工具，当前未发现 HTTP 请求运行 PostCSS 或用户上传 CSS 构建。 |
| high | postcss 8.4.31 / 8.5.15 | [GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849)<br>CVE-2026-73646 | >=8.5.18 → 8.5.23 | 生产依赖树 | 需处理恶意 CSS sourceMappingURL；生产依赖树包含编译工具，当前未发现 HTTP 请求运行 PostCSS 或用户上传 CSS 构建。 |
| high | sharp 0.34.5 | [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj)<br>无单独 CVE；以 GHSA 为准 | >=0.35.0 → 0.35.5 | 生产依赖树 | 处理不可信图像触发底层 libvips/libheif/librsvg 问题；需确认现网预编译库、OS 与图片输入；不能只按包存在判定已可利用。 |
| high | sharp 0.34.5 | [GHSA-rgj7-g3m4-5g8c](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c)<br>无单独 CVE；以 GHSA 为准 | >=0.35.4 → 0.35.5 | 生产依赖树 | 处理不可信图像触发底层 libvips/libheif/librsvg 问题；需确认现网预编译库、OS 与图片输入；不能只按包存在判定已可利用。 |
| high | sharp 0.34.5 | [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w)<br>无单独 CVE；以 GHSA 为准 | >=0.35.5 → 0.35.5 | 生产依赖树 | 处理不可信图像触发底层 libvips/libheif/librsvg 问题；需确认现网预编译库、OS 与图片输入；不能只按包存在判定已可利用。 |
| high | source-map-js 1.2.1 | [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)<br>CVE-2026-93749 | >=1.2.2 → 1.2.2 | 生产依赖树 | 处理恶意 indexed source-map sections 偏移；经 PostCSS 引入，未发现生产 HTTP 源码图解析入口。 |
| high | undici 6.28.0 | [GHSA-2m5v-pch6-74hx](https://github.com/advisories/GHSA-2m5v-pch6-74hx)<br>CVE-2026-109383 | >=6.29.1 → 6.29.1 | 生产依赖树 | 使用 Agent TLS 自定义 checkServerIdentity 回调时该配置被丢失；不是所有默认 HTTPS 连接都绕过证书验证。 |
| high | undici 6.28.0 | [GHSA-qrxm-fqhp-jwvm](https://github.com/advisories/GHSA-qrxm-fqhp-jwvm)<br>CVE-2026-87018 | >=6.29.1 → 6.29.1 | 生产依赖树 | undici 对端发起 TLS1.2 重协商并更换不匹配主机名证书；需要对应 TLS/服务端条件。 |
| high | undici 6.28.0 | [GHSA-rfgv-xxqx-mfg5](https://github.com/advisories/GHSA-rfgv-xxqx-mfg5)<br>CVE-2026-19534 | >=6.28.1 → 6.29.1 | 生产依赖树 | undici WebSocket 客户端连接恶意端点并收到未请求的 subprotocol；当前 Blob 使用路径未发现该 WebSocket 入口。 |
| high | undici 6.28.0 | [GHSA-xjj6-f33q-929c](https://github.com/advisories/GHSA-xjj6-f33q-929c)<br>CVE-2026-109869 | >=6.29.1 → 6.29.1 | 生产依赖树 | undici 处理恶意端点的过多 content-encoding；属于生产树 Blob HTTP 依赖，实际上传路径是否启用未知。 |
| high | zod 4.1.11 / 4.4.3 | [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)<br>CVE-2023-54404 | >=4.6.6 → 4.6.7 | 生产依赖树 | 恶意大型集合触发大量验证错误和内存耗尽；生产路径为 Blob→OIDC→CLI-config，开发路径为 ESLint 插件；当前未发现应用直接把请求集合交给该依赖。 |

sharp GHSA-f88m-g3jw-g9cj 涉及上游 CVE-2026-33327、33328、35590、35591；GHSA-wq5f-xc86-pv6w 涉及 CVE-2026-96889。Next SVG 通告同样引用该 librsvg CVE。未分配独立 CVE 的记录保留 GHSA，不杜撰编号。

## 生产依赖与开发依赖

- 仅开发：brace-expansion、js-yaml 的所有本次命中路径均来自 ESLint 工具树。普通 next start 不运行这些 lint 输入处理路径。
- 生产请求相关：Next/App Router/Server Actions、图像优化、Nodemailer 账号邮件；按功能与部署条件评估，优先修复。
- 生产树中的工具：PostCSS、Browserslist、source-map-js、nanoid 多属于编译链；deepmerge-ts 来自 Prisma CLI 配置；Zod 的一条路径来自 Blob 的 CLI 配置，另一条来自开发工具。prod 审计的标签不等于生产 HTTP 暴露。
- @vercel/blob 仍被旧上传模块导入；为了保留现有功能，本次仅修复其传递依赖。没有配置、连接或请求 Vercel 托管/存储，不能据包名推断现网已重新启用该平台。实际旧上传功能是否启用待管理员核查。

## 验证结果与限制

- pnpm install --frozen-lockfile --ignore-scripts：通过；无安装生命周期脚本。
- Prisma validate、generate：通过，保持 6.19.3，只验证 schema/生成客户端；使用 127.0.0.1:1 的不可用测试 URL，没有数据库迁移。
- Next 16.4.3 默认 Turbopack 生产构建：通过；首次受限沙箱编译停滞，停止该本地进程后在正常执行环境使用相同无生产凭据的配置重试通过；没有为通过构建切换打包器。
- TypeScript tsc --noEmit：通过。
- ESLint：0 errors，3 warnings；两条既有 unused 警告，升级规则新识别 weekly-planner 的 window.location.assign 提示。没有修改业务组件来掩盖警告。
- package.json 的 51 组 test:* 命令（包含新增安全组）：原样运行 50 组通过；旧 test:vamsys 的 PIREP 子测试因 @/ 路径别名不能由原 Node 命令解析而失败。保持旧命令未改；使用仅本地诊断的别名/server-only 服务器标记加载器和 experimental-transform-types 后，该 19 项 PIREP mapper 断言通过。此处不冒称原始全套零失败。
- 新增安全测试 3/3：Nodemailer 不联网生成 multipart 身份邮件；Prisma 配置使用 deepmerge 8 正常加载；实际身份服务源码在内存持久化边界下验证登录成功、邮箱规范化、错误密码锁定和锁定后不创建会话。
- 现有身份密码、邮件、飞行预约、SimBrief OFP/PDF、STRATOS/AMN PIREP（stub HTTP/持久化）、FOQA/ACARS 规则测试通过；额外员工密码测试使用本地服务器测试加载器通过。
- src/ 业务逻辑和 prisma/ 与 main 无差异。next-env.d.ts 新行由新版 Next 构建自动生成；不是业务逻辑改写。
- .github/workflows/dependency-security.yml 新增审计与无数据库连接的兼容/业务规则检查；未更改现有 FOQA 工作流。该原有工作流会在 GitHub 临时 PostgreSQL 服务中自行执行历史 schema 验证；它不连接 VPS。没有手动执行或修改那些数据库步骤。

所有本地业务测试子进程清除业务凭据，并禁止真实 socket 连接；没有发出 SimBrief、STRATOS、SMTP 或生产数据库请求。真实认证 cookie、已登录业务全链路、VPS PostgreSQL 查询和真实 SMTP/TLS 投递未被本轮验证，必须在隔离环境继续验收。

## VPS 只读证据与剩余风险

管理员可在获得访问后提供：实际运行 commit/镜像摘要、部署制品锁文件摘要、Node/OS/架构、已安装 next/react/react-dom/nodemailer/sharp/undici/@prisma/client 的版本清单、生产进程命令、脱敏代理 Host/缓存规则、旧制品位置和自动发布机制。不要提供密码、token、连接串或业务记录。

未证实的现网版本、原生库二进制和代理输入仍是部署前风险；审计零不覆盖 Node/OS/PostgreSQL 安全更新或未知漏洞。ESLint 9 已提示不再支持，应后续单独计划 ESLint 10 兼容迁移。三条窄覆盖应在上游修复后再评估移除，不可无验证删除。

## 建议部署顺序

1. 先审核独立 Security Fix PR，确认没有 main 自动发布触发器；CI 与隔离验证通过后再由用户决定合并。PR #90 继续等待。
2. 在与 VPS 一致的隔离 Linux/运行环境构建同一制品；核实 Node >=20.9（建议使用项目 CI 已测试的受支持 Node 22），执行冻结锁文件安装、生成客户端、审计、类型和构建。禁用迁移/员工 bootstrap；不要调用 db:deploy。
3. 测试账号验证登录/登出/过期、预约创建取消、SimBrief OFP/PDF、STRATOS PIREP 收据与幂等、PostgreSQL 读写事务、SMTP 投递；无生产写入。
4. 经单独生产授权，使用已确认的 VPS 发布机制部署安全制品；保留会话密钥、数据库、旧制品，观察错误率和业务探针。没有 schema 变化，不附带迁移。
5. 安全版本运行稳定后，另行将 PR #90 同步到安全基线，解决锁文件冲突，重跑 PWA/业务/设备验收，再单独决定 PWA 发布。

回滚只切换已保留的完整应用制品与运行配置，不恢复数据库快照。原 main 制品已知有安全风险，只能作为经明确风险批准的临时应急选项，优先前向修补。回退不得重启 Vercel/Neon。没有执行合并、VPS 操作、部署、数据库迁移或生产数据改动。
