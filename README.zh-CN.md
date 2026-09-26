# Command Code 额度 — opencode

在 **opencode 右侧栏**里直接看到 **Command Code** 套餐还剩多少——
5 小时、每周、每月三条窗口，带重置时间。

跑在你本机、不经过模型，所以**查额度不消耗额度**。

```
CC GOAT │ 5h █▎░░░░░░░░ 12% 4h27m后重置 │ 周 █▏░░░░░░░░ 11% 09-27重置 │ 月 ▋░░░░░░░░░ 6% $66.03 10-20重置
```

[English](README.md) · [核实记录](docs/FINDINGS.md)

[![Check](https://github.com/Jovan1666/opencode-command-code-usage/actions/workflows/check.yml/badge.svg)](https://github.com/Jovan1666/opencode-command-code-usage/actions/workflows/check.yml)

---

## 安装

这个插件没有市场可走——opencode 的 TUI 插件要在它自己的配置里按绝对 `file://` 路径登记，
所以是「克隆下来跑一次安装脚本」：

```sh
git clone https://github.com/Jovan1666/opencode-command-code-usage
node opencode-command-code-usage/scripts/setup.mjs
```

脚本把插件登记进 `~/.config/opencode/tui.json`（你设了 `$XDG_CONFIG_HOME` 就按它，与
opencode 自己用的根一致）。重复运行是幂等的——它会替换本插件写过的记录，而不是追加一条。
`--print` 只打印将要写入的 JSON、不动文件；`--remove` 把这条记录摘掉，文件其余部分不动。

重启 opencode，右侧栏就多出一节 **Command Code**，每 60 秒刷新一次，套餐名和三条窗口
各占一行。它跑在本地、不经过模型，因此不消耗 token。

> **本平台没有 `/quota` 命令。** opencode 的侧栏就是全部界面——没有要敲的命令，也没有
> 要往命令列表里装的东西。生成的那行文本与 CLI 面板同源，想把数字留在终端里就直接跑
> `src/cc-usage.mjs`（见[命令](#命令)）。

## 显示什么

| 窗口 | 含义 | GOAT 档 |
|---|---|---|
| 5 小时 | 滚动突发上限——一次长会话掏不空整个月 | $14 |
| 每周 | 滚动 7 天上限 | $35 |
| 月度 | 计费周期内的额度 | $70 |

每条显示**已用百分比**、进度条、**重置时间**（一天内给倒计时，超过一天给日期）。
月度那条额外显示剩余金额。

颜色跟着用量走：低于 60% 绿、到 85% 黄、再高变红。侧栏会把转义码剥掉、交给 opencode
自己的主题上色，所以这组分档是原始状态栏那一行的口径；终端面板和 HTML 面板用更早的
50 / 80 分档。

没有滚动窗口的套餐（Provider、Enterprise）只显示余额。
没有 API 权限的套餐（Go）什么都不显示——不报错、也不留空位。

## 没有可显示的东西时它会自己藏起来

一条永远空着、或者永远不对的额度条就是噪音。本适配器只在真有东西可说时才显示这一节：

- **没有凭证** → 不渲染。脚本不会把错误打到你的编辑器里。
- **没有 API 权限**（$1 的 Go 档）→ 不渲染。
- **取数失败**（离线，或 key 被拒）→ 不渲染，并且下一次尝试会先退避五分钟，而不是反复撞接口。

侧栏**不判断**当前会话有没有走 Command Code。opencode 的 TUI 插件拿不到逐轮的模型信息，
所以适配器是用 `--always` 跑脚本的：只要凭证可用、数字能取回来，这一节就一直在。
想用「按去向隐藏」那一套，见[命令](#命令)——那是脚本自己的默认行为，需要宿主从 stdin
把模型递进来。

## 命令

没有。opencode 的 TUI 插件不能注册斜杠命令，所以本适配器不带 `/quota`，也没有替代品——
侧栏就是全部界面。

不过底下那个脚本本身就是普通的 CLI，侧栏调的就是它：

```sh
node src/cc-usage.mjs                 # 终端面板
node src/cc-usage.mjs --compact       # 单行摘要
node src/cc-usage.mjs --md            # Markdown 表格
node src/cc-usage.mjs --json          # 归一化快照
node src/cc-usage.mjs --statusline --rows 1   # 侧栏渲染的就是这一行
node src/cc-usage.mjs --watch         # 在终端里持续刷新
node src/cc-usage.mjs --help          # 其余全部，含不联网的 --demo 场景
```

## 凭证

自动查找，顺序如下：

1. `COMMAND_CODE_API_KEY` / `COMMANDCODE_API_KEY` / `CMD_API_KEY`
2. 名字里含 `commandcode` 的任何环境变量
3. `~/.commandcode/auth.json`（官方 CLI 的登录态）
4. opencode 自己配置里的 Command Code provider 路由
   （`~/.config/opencode/opencode.json` 或 `.jsonc`）
5. 提到 `commandcode` 的 TOML/YAML 宿主配置，含 `apiKeyEnv` 的二次解析

全都找不到时侧栏**直接不渲染**——它不会把错误打到你的编辑器里。

## 环境要求

- **Node 18+，而且必须真的在 `PATH` 里。** 这一条在本平台格外要紧：opencode 是 Bun 编译
  出来的单个二进制，进程里的 `process.execPath` 指向 opencode 自己。拿它去跑脚本会递归
  启动 opencode 然后失败——现象是插件能加载、插槽能注册，但取数永远返回空。所以插件先在
  `PATH` 里找真正的 `node`，只有当 `process.execPath` 本身是 node 时才退回用它。
- 有 API 权限的 Command Code 套餐——$1 的 Go 档没有。
- 别的都不需要：不用包管理器、没有构建步骤、没有依赖要装。

## 关于"按当前速度会超限"的预警

脚本会算一个速度外推。**侧栏永远不显示它**，状态栏也不显示；终端面板、`--compact`、
`--md`、`--html` 仍会打印，`--json` 里也一直有。

不让它进常驻界面是有原因的：短样本外推几乎每次都会说"你要超了"——5 小时窗口刚开 25
分钟时，一段正常的使用就能推出 140%——而一条永远亮着的警告等于没有警告。这些面板本来
就是你主动要来看的，多一行不碍事。

## 参与开发

```sh
node scripts/check.mjs          # 全部检查：渲染、隐藏逻辑、阈值、输出格式、密钥
node scripts/check.mjs --quiet  # 每个套件只打一行
```

这就是 CI 跑的那份脚本，本地过了线上就是绿的。它不需要凭证，也不碰网络。

`src/cc-usage.mjs` 是唯一实现——本仓库自己拥有它，直接改它。
`src/index.mjs` 是 TUI 插件本身（纯 JS，无构建步骤：它通过宿主自己的运行时手工建元素），
`scripts/setup.mjs` 是单文件安装器。`check.mjs` 三个都覆盖，包括[环境要求](#环境要求)里
那条 `node` 查找逻辑。

## 许可

MIT —— 见 [LICENSE](LICENSE)。
