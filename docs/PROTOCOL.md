# Bonko 独立模板协议 v3

这是开发者与创作 Skills 共用的协议说明。校验与播放的唯一实现来自分发包中的 `@bonko/template-sdk`，当前 SDK 包固定为 `0.2.3`，manifest 的 v3 sdkVersion 为 `0.2.0`。不要在 Studio 复制内核或修改校验器来让作品通过。

本文区分已实现接口和未完成验收，不代表生产发布授权。Studio 只接受 v3 独立可运行模板，不提供旧协议创作或双包交付。

## 1. 目录与交付边界

```text
./
  manifest.json       作者元数据、配置、逻辑素材 ID
  src/main.tsx        独立浏览器入口
  src/*.ts(x)         作品内部代码
  src/*.css           可选样式，无外部资源引用
  assets/*            声明过的图片、短音频
  LICENSE.md          源码及每项素材的来源、权利和限制
  test.json           本地键盘验收入口，不进入包
  fixtures/*          可选合成测试数据，不进入包
```

`new <slug>` 创建静态草稿，可改为互动作品。脚手架和程序生成封面不是精品成品。已有目录不会被覆盖。测试照片优先从预览界面选择，只驻留浏览器，不保存进作品素材目录。

`pack` 在浏览器检查通过后生成一个 `dist/<slug>-<version>.bonko.zip`，包含 manifest、声明素材、LICENSE、单个运行脚本、可选运行样式、审阅源码与固定依赖清单。不接受作者自制 HTML 页面、安装脚本、node_modules、密钥、远程资源地址或嵌套包。

本地代码只在本地构建。后台不安装、构建或执行源码，也不把文件写进主站源代码目录。维护者审核包中源码，运行脚本由独立域名的受限 iframe 加载。首次上线需要部署宿主与隔离运行环境，兼容范围内的后续作品不需要逐模板部署主站。

## 2. Manifest

使用 CLI 生成有效起点，不手写包摘要。未知字段会被拒绝。以下示例可由 SDK 校验：

```json
{
  "protocol": 3,
  "sdkVersion": "0.2.0",
  "slug": "paper-note",
  "version": "1.0",
  "name": "Paper Note",
  "description": "A personal note revealed from a folded card.",
  "author": "Your studio name",
  "templateType": "interactive",
  "access": "free",
  "tags": ["Paper", "Warm"],
  "cover": "cover",
  "assets": { "cover": { "kind": "image", "path": "assets/cover.png" } },
  "entry": "runtime/entry.js",
  "capabilities": [],
  "config": { "accent": "#8b493a" },
  "sample": {
    "recipientName": "Alex",
    "message": "You make ordinary days better.",
    "senderName": "Sam"
  },
  "messagePresets": ["You make ordinary days better."],
  "posterStyle": { "background": "#fff9ed", "foreground": "#292620", "accent": "#8b493a" }
}
```

| 字段 | 规则 |
|---|---|
| `slug` | 小写 kebab-case、字母开头、最多 80 字符，等于目录名 |
| `version` | 整数主版本格式 `1.0`、`2.0`，不是任意 SemVer |
| `name` / `author` / `description` | 分别最多 80 / 80 / 500 字符，不为空 |
| `templateType` | `static` 或 `interactive`，不是分类 |
| `access` | `free` 或 `premium`，作者建议、管理员审核确认；不启用付款 |
| `tags` | 自定义，最多 5 个、每个最多 20 字符；规范化、去空白及忽略大小写去重 |
| `cover` | 已声明图片素材的逻辑 ID，不是 URL |
| `assets` | 1–100 项；ID 为小写字母开头的字母/数字/连字符，最多 64 字符 |
| `capabilities` | 无重复的 `audio`、`canvas`、`webgl` 子集；有音频或合成声音时声明 audio |
| `config` | 最多 32 个基本值，只用字符串、有限数值、布尔值；不嵌套，不放 HTML/URL/脚本 |
| `sample` | 姓名 30、留言 160、发送者 30 字符；示例发送者用空字符串表示省略 |
| `messagePresets` | 1–8 条，每条最多 160 字符 |
| `posterStyle` | background / foreground / accent 三个六位十六进制颜色 |
| `entry` / `stylesheet` | entry 固定 runtime/entry.js；构建器按实际 CSS 输出添加可选 stylesheet |

**分类不属于作者 manifest。** 上传后由管理员从平台固定分类中选择，未分类不能审核通过。分类、模板类型、使用权限和标签是不同维度。不要增加 category、occasion、分类码或发布状态来试图自行上架。

## 3. 素材解析与限制

路径必须是平铺的 `assets/<name>.<ext>`，文件名仅字母、数字、下划线、连字符。图片支持 PNG/JPEG/WebP/AVIF，音频支持 MP3/OGG。不接收视频、字体包、SVG 或动画图片；使用系统字体，避免外部请求。

预算由 SDK LIMITS 统一定义：压缩 10 MiB、展开 25 MiB、最多 128 文件；图片最大边 4096、最多 16777216 像素；短音频最长 10 秒。作者目录扫描也受文件数和字节预算限制，fixtures 不导出但不是无限存储区。

作品通过 `runtime.asset("logical-id")` 取得图片 URL；声音使用 `runtime.audio.play("logical-id")`，不自行处理音频 URL。宿主解析并校验本地、草稿或正式资源；不要替换源码中的 CDN 字符串，不把存储 URL 写入配置。未声明素材不会导出。

LICENSE.md 按素材路径记录作者/来源、授权、署名和限制，也说明代码来源。AI 素材记录工具及适用条款，不捏造授权。生产封面应准确代表作品，不沿用测试色块。

## 4. 浏览器代码接口

从 `@bonko/template-sdk/runtime-client` 静态导入 `connectStandaloneTemplate` 与 `RuntimePresentation` 类型，注册 `{ render(presentation), dispose() }`。宿主状态变化会再次调用 render；不要每次新建 React root、重置阶段、累积监听器或重新启动动画。React 作品创建一次 root，更新组件 props，dispose 时 unmount。

RuntimePresentation 提供：

- content：recipientName、message、可空 senderName、photoUrl、photoTransform。通过 JSX/文本节点显示，不能 HTML 字符串替换。
- config：已校验的 manifest 配置；作品仍应验证具体含义和数值范围。
- reducedMotion：减少动态通过下面的独立静态入口呈现，不启动互动。
- runtime.state：ready / running / waiting / paused / ended；runtime.mode：running / waiting。
- runtime.report("running" | "waiting")：报告自动演出或等待操作；只在真实转换时报告，避免渲染循环和消息洪泛。
- runtime.complete()：自然完成；宿主只接受有效播放状态中的首次完成。
- runtime.asset(id)、runtime.audio.play(id)、runtime.audio.tone(frequency, durationMs)、runtime.audio.stop()。

只在 running/waiting 接受互动；paused 停止动画计时和声音；ended 保持含用户内容的静态终态。dispose 释放计时器、监听器、动画、React root 和图形资源。重播创建新实例。

### 自定义静态入口（Studio 必过项）

新作品提供 `renderStatic(presentation)`。参数只有 content、config、reason、固定 true 的 reducedMotion 和 asset(id)，没有 runtime/声音/完成接口。它应直接展示完整用户内容，不播放动画、声音或等待手势。reason 可以是 preview、natural、skip、idle、budget、reduced-motion 或 error。

SDK 在进入静态入口前调用作品 dispose，清理互动资源；随后只调用一次 renderStatic，不再把播放状态更新送给旧组件。静态入口可返回清理函数，或返回在内容实际提交后解析为清理函数的 Promise；React 作品应在新 root 提交后确认完成，不在调用 root.render 后立即假定 DOM 已就绪。清理函数在卸载时释放静态 DOM/React/图形资源；异步渲染在卸载后完成也会立即执行清理。

静态入口缺失或失败会回报错误，不伪造静态就绪。共享 RuntimeFrame 通过 authoredStatic 开关接入此契约，等待静态提交最多五秒；等待期间展示通用内容，失败/超时卸载 iframe。自然结束后的静态提交失败会对外回报 error，而不是 natural；静态预览不计完整播放。Studio 已启用，check/pack 必须通过作品静态预览、自然终态、跳过和减少动态的内容/照片/裁切检查；通用兜底不能代替作品通过。旧 v3 草稿必须补齐入口才能重新打包。Product/Admin 已接入同一静态入口，不代表后台到前台全链路完成。

宿主限制自动演出累计 30 秒，前台等待操作 60 秒；切后台暂停，返回由用户主动继续。保留宿主“直接查看”，不能要求必须通关。手势提供点击或键盘替代。不设计计分、输赢、跨次进度或新的 JSON 时间线语言。

声音由宿主管理，只能主动操作后解锁，静音/暂停/跳过/卸载/切后台停止。合成单音最多 2 秒。audio.play() 返回不意味着声音已播完，不把它当可靠的音频结束事件。视觉内容不能依赖声音才能理解。

`runtime.audio.stop()` 只取消当前声音（包括尚未完成的播放请求），不会撤销已有的宿主播放授权，因此下一阶段仍可调用 play/tone。它也不能解锁声音或绕过静音、暂停、后台状态；这些宿主生命周期停止仍要求用户主动恢复。

## 5. 依赖与隔离

现行构建允许静态导入 react、react/jsx-runtime、react-dom/client、motion/react、@bonko/template-sdk/runtime-client 和 src 内相对路径。版本来自分发包和 lockfile。动画默认用 Motion；新依赖先交维护者评估，不自行安装或修改 lockfile。

不允许动态 import、require、eval、import.meta、三斜线类型引用或越出 src 的导入。CSS 不使用 @import 或 url(...)；图片通过宿主逻辑 ID 接入。不读取作者的 tsconfig 或环境文件作为构建配置。

iframe 是独立来源、无同源权限的沙箱，禁止网络连接、子 frame、worker 和直接媒体播放等能力。不得读账号、Cookie、数据库、父页面、任意网络或远程代码。Canvas/WebGL 限定在模板内。静态扫描与沙箱不能证明任意代码安全，仍需审核源码、依赖和资源消耗。

## 6. 检查、版本与交接

互动作品的 test.json 需要 `{ "revealButton": "实际按钮名称" }`；检查器用 Enter 揭晓并等待自然完成。静态作品保留 CLI 生成的本地测试说明。

bonko check --json 和 bonko pack --json 成功退出 0，失败退出 1。在项目根目录直接使用 bonko 命令。类型错误带结构化诊断；浏览器失败保存报告和可用的失败截图。报告位于 .bonko/checks/，不随包交付。

检查会执行本地作品，仅在无生产凭证的环境运行已审阅来源的代码。查看报告及截图，另做触摸、声音、视觉和版权验收。当前静态照片自动检查覆盖 DOM 图片及其 transform；纯 Canvas/WebGL 照片等价检查仍待完善。静态布局的视觉、可访问性和素材失败细节仍需人工审查，不能把自动检查通过当成审查完成。

升级保留旧提交和交付包，再增加 manifest.version。相同版本不同内容不能覆盖；同内容重新 pack 仍执行检查。打包使用检查过的字节，发现检查期间源码改变时应重跑。

将单个 .bonko.zip 交给有后台权限的维护者。维护者上传私有暂存区，服务端重新检查实际包、素材和摘要，分配分类、复核标签/免费付费、审核源码，满足部署门禁后发布。CLI 通过不授权发布、收费或修改生产数据。交付写清实际检查和未完成项，不需要主站仓库、R2 或数据库凭证。
