# Bonko CLI

独立的 Bonko 模板开发工具。使用已有 Node.js，一条命令安装 CLI 后，即可创建、预览、构建、检查和打包模板，无需克隆 Studio 或为每个模板安装依赖。

## 安装要求

- Node.js **≥ 22.12.0**，以及能正常运行的 npm。
- 网络安装需要 curl；首次浏览器检查需要下载 Chromium。
- Shell 安装器面向 macOS / Linux；Windows 安装尚未验证。

安装器先检查 Node 和 npm。不存在、版本过低或无法运行时直接退出，并显示修复提示；不会自动安装 Node 或在版本检查失败时下载、写入工具文件。

默认安装到 `~/.bonko`，命令位于 `~/.bonko/bin/bonko`。无需 sudo；显式使用 root 安装时，工具位于 `/usr/local/share/bonko`，命令位于 `/usr/local/bin/bonko`。

**当前尚未发布在线安装地址。** 发行包上传到 HTTPS 地址后，可这样安装（替换示例域名及版本目录）：

```sh
curl -fsSL https://your-domain.example/bonko/v0.1.0/install.sh | sh
```

发布时通过 `npm run release -- --base-url https://your-domain.example/bonko/v0.1.0` 将下载地址写入安装器。也可通过安装器 `--base-url` 或 `BONKO_RELEASE_BASE_URL` 指定。安装完成会检查 PATH；若当前终端找不到 bonko，按提示加入目录或使用完整路径。

## 使用

```sh
bonko new birthday-card
cd birthday-card
bonko dev
```

在 Studio 中编辑文案、选择本地照片和裁切，点 **Apply content and crop** 应用，使用 **Play / Pause / View message / Replay** 验证。保存源码自动重建；构建错误会停止旧预览，修复后恢复。

| 命令 | 作用 |
|---|---|
| `bonko new <name>` | 创建独立模板目录，不覆盖已有文件 |
| `bonko dev` | 启动本地 Studio 并打开浏览器 |
| `bonko dev --port 4175 --no-open` | 指定端口，不自动打开浏览器 |
| `bonko build` | 构建运行代码，不进行浏览器验收、不输出交付 ZIP |
| `bonko check` | 构建并执行完整 Chromium 检查 |
| `bonko pack` | 重新检查并生成 `.bonko.zip` |
| `bonko browser install` | 提前准备检查用 Chromium |
| `bonko help [command]` | 查看命令说明，支持 `-h` / `--help` |
| `bonko version` | 查看 CLI、SDK 和 Node 版本，支持 `-v` / `--version` |

`new/build/check/pack/version` 支持 `--json`；失败退出码为 1。`check/pack --no-download` 禁止自动下载浏览器，缺失时返回可操作的错误。Linux 若缺少浏览器系统库，需按 Playwright 错误提示安装，CLI 不自动提权。

## 项目结构

```text
birthday-card/
  bonko.json          CLI 版本约束
  manifest.json       模板配置、能力和素材清单
  src/main.tsx        模板入口和自定义组件
  assets/             声明过的图片、短音频
  test.json           键盘揭晓按钮名称
  LICENSE.md          素材与代码来源
  DEVELOPMENT.md      完整协议与开发说明
  tsconfig.json       编辑器类型提示
  .bonko/build/       按摘要保存的构建结果
  .bonko/checks/      验收报告与截图
  dist/              通过验收的交付包
```

命令可从项目的子目录运行。构建使用 CLI 安装中的固定依赖，不读取项目的 Vite 配置或环境文件。`bonko.json` 固定 CLI 版本，不匹配时提示安装对应版本；当前不自动下载旧 CLI。

## 能用什么

模板允许导入 `react`、`react/jsx-runtime`、`react-dom/client`、`motion/react`、`@bonko/template-sdk/runtime-client` 及模板 `src/` 内的相对路径。可使用原生 DOM/CSS，以及声明过能力的 Canvas/WebGL 和 SDK 管理的短音频。

shadcn/ui、Tailwind、Tabler 和手机壳用于 Studio 界面，不自动成为模板允许依赖。模板必须提供完整静态终态，遵守暂停、清理、减少动态和键盘操作；详细约束见 [协议](docs/PROTOCOL.md)。

新项目的编辑器路径指向当前 CLI 安装目录；跨机器移动时应更新这些路径。CLI 构建独立解析依赖，不依赖编辑器路径。

## 开发与发行 CLI

```sh
npm ci --ignore-scripts
npm run build
npm run typecheck
npm test
npm run release
```

测试包含真实浏览器和发行包安装；运行前可执行 `node bin/bonko.mjs browser install`。开发者通过 `node bin/bonko.mjs` 使用工作区 CLI。

发行产物位于 `release/`：安装器、`bonko-cli-<version>.tgz` 和 SHA-256 校验文件。依赖版本由 `npm-shrinkwrap.json` 固定；安装禁用 npm 生命周期脚本，安装完通过版本自检后才切换命令入口。校验防止下载损坏，发行来源的可信性依赖 HTTPS 主机。

本地验证安装（摘要从发行文件读取）：

```sh
sh install.sh --archive /absolute/path/bonko-cli-0.1.0.tgz \
  --sha256 <64位摘要> --prefix /tmp/bonko-install
/tmp/bonko-install/bin/bonko help
```

发行命令只生成文件，不上传、不创建远程仓库、不发布 npm 包。模板 ZIP 仍需由后台审核。自动检查不代替素材授权、真实设备触摸和声音验收。
