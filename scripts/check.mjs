#!/usr/bin/env node
/**
 * 一条命令给出整个仓库的结论。
 *
 *   node scripts/check.mjs            全部检查
 *   node scripts/check.mjs --quiet    每个套件只打一行
 *
 * CI 直接调这个文件，所以本地和线上是同一套判定——不会出现"本地过了 CI 挂"。
 * 不联网、不需要真实凭证。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const USAGE = path.join(ROOT, 'src', 'cc-usage.mjs');
const PLUGIN = path.join(ROOT, 'src', 'index.mjs');
const SETUP = path.join(ROOT, 'scripts', 'setup.mjs');
const QUIET = process.argv.includes('--quiet');

const suites = [];
const record = (name, fn) => suites.push({ name, fn });

/* ---------------------------------------------------------------- 工具 */

let failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

/** 跑一次额度脚本（不联网）并返回去掉 ANSI 的 stdout。 */
function runUsage(args, env = {}) {
  const r = spawnSync(process.execPath, [USAGE, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 30_000,
  });
  if (r.error) throw r.error;
  return String(r.stdout || '').replace(/\x1b\[[0-9;]*m/g, '');
}

/** 显示宽度：CJK/全角算 2，其余算 1，与脚本内部口径一致。 */
function displayWidth(text) {
  let w = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    w += cp >= 0x1100 && (
      cp <= 0x115f || cp === 0x2329 || cp === 0x232a ||
      (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe6f) ||
      (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0xffe0 && cp <= 0xffe6)
    ) ? 2 : 1;
  }
  return w;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.devdeps') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/* ----------------------------------------------------- 1. 状态栏渲染 */

record('statusline', () => {
  let checked = 0;

  // 按量计费套餐的输出是确定的（金额固定、没有时间），可以逐字断言。
  const provider = runUsage(['--statusline', '--rows', '1', '--demo', 'provider'], { COLUMNS: '140' }).trim();
  assert(provider === 'CC Provider │ 余额 $47.66',
    `按量计费套餐应只显示余额，实际得到：${JSON.stringify(provider)}`);
  checked += 1;

  for (const scenario of ['normal', 'hot', 'max']) {
    const line = runUsage(['--statusline', '--rows', '1', '--demo', scenario], { COLUMNS: '140' }).trim();
    const name = `--demo ${scenario}`;
    assert(line.startsWith('CC '), `${name}: 应以 "CC " 开头，实际 ${JSON.stringify(line.slice(0, 20))}`);
    assert(line.split('│').length === 4, `${name}: 单行模式应有 4 段（套餐名 + 三条窗口），实际 ${line.split('│').length}`);
    assert(/\d+%/.test(line), `${name}: 应含百分比`);
    assert(line.includes('重置'), `${name}: 三条窗口都该带重置时间`);
    // 绝不带 ANSI：侧栏会把转义码剥掉再交给宿主主题，钩子的 systemMessage 更是纯文本，
    // 带上会原样显示成乱码——所以渲染层自己就不该产生它。
    assert(!/\x1b\[/.test(runUsage(['--statusline', '--rows', '1', '--demo', scenario])), `${name}: 不应输出 ANSI`);
    checked += 1;

    const three = runUsage(['--statusline', '--demo', scenario], { COLUMNS: '140' }).trim();
    assert(three.split('\n').length === 3, `${name}: 三行模式应输出 3 行`);
    checked += 1;
  }

  // 宽度自适应：任何终端宽度下都不能折行（折行会把侧栏那一节撑坏）。
  for (const cols of ['200', '140', '120', '110', '100', '95', '90', '80']) {
    const line = runUsage(['--statusline', '--rows', '1', '--demo'], { COLUMNS: cols }).trim();
    const w = displayWidth(line);
    assert(w <= Number(cols), `COLUMNS=${cols}: 行宽 ${w} 超了`);
    assert(!line.includes('\n'), `COLUMNS=${cols}: 不该折行`);
    checked += 1;
  }

  return `${checked} 项渲染断言`;
});

/* -------------------------------------------------------- 2. 隐藏逻辑 */

record('gating', async () => {
  // 直接测判定函数，不跑整条流水线：整条要凭证、要联网，CI 上两样都没有。
  // 之前就是那样写的，于是本地过、CI 挂。
  const { decideRoute, normalizeModel } = await import(pathToFileURL(USAGE).href);
  const catalog = ['deepseek-v4.1-flash', 'claude-opus-5', 'kimi-k2.7-code'];

  assert(normalizeModel('deepseek/deepseek-v4.1-flash') === 'deepseek-v4.1-flash', '归一化应去掉 vendor 前缀');
  assert(normalizeModel('claude-opus-5[1M]') === 'claude-opus-5', '归一化应去掉 [1M] 这类后缀');
  assert(normalizeModel('K2.7 Code') === 'k2.7-code', '归一化应把空白折成连字符');

  assert(decideRoute('deepseek/deepseek-v4.1-flash', catalog) === 'yes', '目录里有的模型 -> 在用');
  assert(decideRoute('totally-made-up-xyz', catalog) === 'no', '目录里没有 -> 不在用');
  assert(decideRoute(null, catalog) === 'unknown', '拿不到模型名 -> 未知，交给下一级判据');
  assert(decideRoute('deepseek-v4.1-flash', null) === 'unknown', '没有目录 -> 未知，不猜');

  // 裸 claude-* 名字原生 Anthropic 也有，必须回避而不是当成命中
  assert(decideRoute('claude-opus-5', catalog) === 'unknown', 'claude-* 有歧义 -> 不猜');
  assert(decideRoute('claude-opus-5', catalog, { trustedSource: true }) === 'yes',
    '来自本地路由映射的 claude-* 是确定的，应当显示');

  // 用户自己补的别名优先于目录
  assert(decideRoute('kimi-k2.7-code', catalog, { modelPatterns: ['k2.7-code'] }) === 'yes', '用户别名应命中');
  assert(decideRoute('deepseek-v4.1-flash', catalog, { modelPatterns: ['k2.7-code'] }) === 'no',
    '给了别名就按别名来，不再看目录');

  // 各宿主给的 stdin 形状不同，routeDecision 必须都认：
  // 有的把 model 作为**字符串**给，而且 transcript_path 是空的（这条对它就是必需的）；
  // 有的给对象 { id, display_name }，真实模型要去 transcript 里找。
  const { routeDecision } = await import(pathToFileURL(USAGE).href);
  // 显式传空的 env：不然结果取决于跑测试那台机器有没有设本地路由的模型映射，
  // 那正是上一个版本「本地过 CI 挂」的原因。

  const stringModel = routeDecision(
    { model: 'gpt-5.6-terra', transcript_path: '' },
    { catalog: [...catalog, 'gpt-5.6-terra'], env: {} });
  assert(stringModel.decision === 'yes', '字符串形状的 model 应当被认出来');

  const outside = routeDecision({ model: 'gpt-5.6-terra', transcript_path: '' }, { catalog, env: {} });
  assert(outside.decision === 'no', '给的模型不在目录里就该隐藏');

  const noModel = routeDecision({ transcript_path: '' }, { catalog, env: {} });
  assert(noModel.decision === 'unknown', '没给 model 时是未知，不是"不在用"');

  const objShape = routeDecision({ model: { id: 'claude-opus-5[1M]' }, transcript_path: '' }, { catalog, env: {} });
  assert(objShape.decision === 'unknown',
    '对象形状的 model 不该被当成模型名——真实模型在 transcript 里');

  return '15 项判定断言';
});

/* ------------------------------------------------------- 3. 阈值与钩子 */

record('threshold+hook', () => {
  const under = runUsage(['--statusline', '--threshold', '70', '--demo']).trim();
  assert(under === '', `未过阈值不该有输出，实际：${JSON.stringify(under.slice(0, 40))}`);

  const over = runUsage(['--statusline', '--threshold', '30', '--demo']).trim();
  assert(over.startsWith('CC '), '过了阈值应输出面板');

  // 钩子必须吐合法 JSON，且 systemMessage 是纯文本
  const hook = runUsage(['--hook', '--always', '--demo']).trim();
  let parsed = null;
  try { parsed = JSON.parse(hook); } catch { /* 下面断言会报 */ }
  assert(parsed && typeof parsed.systemMessage === 'string', `钩子应输出 {"systemMessage": …}，实际：${hook.slice(0, 60)}`);
  assert(parsed && !/\x1b\[/.test(parsed.systemMessage), 'systemMessage 不能含 ANSI（会原样显示成乱码）');
  assert(parsed && !parsed.hookSpecificOutput, '钩子不该用 additionalContext——那会进模型上下文、每轮烧 token');

  return '阈值静默 + 钩子 JSON 形状';
});

/* ------------------------------------------------------------ 4. 其它输出 */

record('formats', () => {
  let n = 0;
  for (const [args, marker, name] of [
    [['--demo'], 'Command Code', '终端面板'],
    [['--md', '--demo'], '|', 'Markdown'],
    [['--compact', '--demo'], 'CC GOAT', '单行摘要'],
  ]) {
    const out = runUsage(args);
    assert(out.includes(marker), `${name} 应包含 ${JSON.stringify(marker)}`);
    n += 1;
  }
  const json = runUsage(['--json', '--demo']);
  let doc = null;
  try { doc = JSON.parse(json); } catch { /* 断言会报 */ }
  assert(doc && doc.plan && doc.windows && doc.monthly, '--json 应是自洽快照');
  n += 1;

  // 不联网的 demo 不该碰网络；--help 不该跑主流程
  assert(runUsage(['--help']).includes('--statusline'), '--help 应列出 --statusline');
  n += 1;
  return `${n} 种输出`;
});

/* ------------------------------------------------------- 5. 全仓静态检查 */

record('static', () => {
  const files = walk(ROOT);
  let json = 0;
  let js = 0;

  for (const f of files) {
    if (f.endsWith('.json')) {
      try { JSON.parse(fs.readFileSync(f, 'utf8')); json += 1; }
      catch (err) { assert(false, `JSON 非法: ${path.relative(ROOT, f)} — ${err.message}`); }
    }
  }

  for (const f of files) {
    if (!/\.(mjs|cjs|js)$/.test(f)) continue;
    const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8', timeout: 20_000 });
    assert(r.status === 0, `语法错误: ${path.relative(ROOT, f)}`);
    js += 1;
  }

  return `${json} 个 JSON + ${js} 个 JS`;
});

/* -------------------------------------------------------- 6. 密钥与隐私 */

record('secrets', () => {
  // 别让 API key、本机绝对路径或邮箱被提交进去——这是要公开发布的仓库。
  const patterns = [
    [/user_[A-Za-z0-9_-]{16,}/, 'Command Code key'],
    [/sk-[A-Za-z0-9]{20,}/, 'OpenAI 风格 key'],
    [/ghp_[A-Za-z0-9]{20,}/, 'GitHub token'],
    [/github_pat_[A-Za-z0-9_]{20,}/, 'GitHub PAT'],
    [/C:[\\/]Users[\\/](?!admin[\\/]\.claude)[A-Za-z0-9._-]+/, '个人绝对路径'],
    [/[A-Za-z0-9._%+-]+@(?!example\.com|users\.noreply)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, '邮箱'],
  ];
  let scanned = 0;
  for (const f of walk(ROOT)) {
    if (/\.(png|jpg|ico|woff2?|lock)$/.test(f)) continue;
    // 本文件自己的规则里就写着这些形态，跳过它
    if (f === fileURLToPath(import.meta.url)) continue;
    const text = fs.readFileSync(f, 'utf8');
    for (const [re, label] of patterns) {
      const hit = text.match(re);
      if (hit) assert(false, `${label} 出现在 ${path.relative(ROOT, f)}: ${hit[0].slice(0, 24)}…`);
    }
    scanned += 1;
  }
  return `${scanned} 个文件已扫描`;
});

/* ------------------------------------------------------- 7. 本平台的坑 */

record('opencode', () => {
  let checked = 0;
  const src = fs.readFileSync(PLUGIN, 'utf8');

  // 拆出来的这份实现自带 shebang：顶部那两行横幅不该再出现在这里。
  assert(fs.readFileSync(USAGE, 'utf8').startsWith('#!/usr/bin/env node\n'),
    'src/cc-usage.mjs 必须以 #!/usr/bin/env node 开头');
  checked += 1;

  // 本平台实测踩过的坑：opencode 是 Bun 编译出来的单个二进制，进程里的
  // process.execPath 指向 opencode 自己而不是 node。拿它去跑脚本会递归启动 opencode
  // 然后失败——症状是插件能加载、插槽能注册，但取数永远返回空。所以必须先在 PATH 里找 node。
  const start = src.indexOf('function nodeBinary()');
  assert(start >= 0, 'src/index.mjs 里找不到 nodeBinary()');

  let body = '';
  if (start >= 0) {
    // 花括号配平取出整个函数（源码里字符串不含花括号，够用）。
    let depth = 0;
    for (let j = src.indexOf('{', start); j < src.length; j += 1) {
      if (src[j] === '{') depth += 1;
      else if (src[j] === '}') {
        depth -= 1;
        if (depth === 0) { body = src.slice(start, j + 1); break; }
      }
    }
  }
  assert(body.endsWith('}'), 'nodeBinary() 的函数体没有取全，正则/配平需要跟着改');

  if (body) {
    const atPath = body.indexOf('process.env.PATH');
    const atExec = body.indexOf('process.execPath');
    assert(atPath >= 0 && atExec > atPath,
      'PATH 查找必须排在 process.execPath 兜底之前——顺序反了就是"递归启动 opencode"那个坑');

    // 在受控的假环境里真跑一遍取出来的函数，而不是只看字面。
    const lookup = new Function('process', 'path', 'existsSync', `${body}\nreturn nodeBinary();`);
    const exeName = process.platform === 'win32' ? 'node.exe' : 'node';
    const mkdir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cc-node-'));
    const withNode = mkdir();
    const withoutNode = mkdir();
    fs.writeFileSync(path.join(withNode, exeName), '');
    const fakeExec = path.join(os.tmpdir(), 'opencode-bin', `opencode${process.platform === 'win32' ? '.exe' : ''}`);
    const call = (execPath, PATH) => lookup({ platform: process.platform, execPath, env: { PATH } }, path, fs.existsSync);

    const found = call(fakeExec, withNode);
    assert(found === path.join(withNode, exeName),
      `execPath 不是 node 时应从 PATH 取 node，实际 ${String(found)}`);
    checked += 1;

    const missing = call(fakeExec, withoutNode);
    assert(missing === null,
      `PATH 里没有 node、execPath 也不是 node 时应返回 null（宁可什么都不显示，也别递归启动 opencode），实际 ${String(missing)}`);
    checked += 1;

    const fallback = call(process.execPath, withoutNode);
    assert(fallback === process.execPath,
      `execPath 本身就是 node 时应退回用它，实际 ${String(fallback)}`);
    checked += 1;

    // 取数必须用找到的那个 node
    assert(/execFile\(\s*node\s*,\s*\[SCRIPT/.test(src), '取数必须用 nodeBinary() 找到的 node 去跑额度脚本');
    checked += 1;
  }

  return `${checked} 项平台断言`;
});

/* -------------------------------------------------------- 8. 安装器 */

record('setup', () => {
  let checked = 0;
  // setup.mjs 是唯一的安装动作，它必须：不改文件就能说清要写什么（--print）、登记的
  // 是本仓库 src/index.mjs 的绝对 file:// URL（opencode 要求绝对路径）、并且幂等。
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-setup-'));
  const cfg = path.join(root, 'cfg');
  const tui = path.join(cfg, 'opencode', 'tui.json');
  const env = { ...process.env, XDG_CONFIG_HOME: cfg };
  const run = (...args) => spawnSync(process.execPath, [SETUP, ...args], { encoding: 'utf8', env, timeout: 20_000 });

  try {
    const preview = run('--print');
    assert(preview.status === 0, `--print 应以 0 退出，实际 ${preview.status}: ${preview.stderr}`);
    let doc = null;
    try { doc = JSON.parse(preview.stdout); } catch { /* 下面断言会报 */ }
    assert(doc && Array.isArray(doc.plugin) && doc.plugin.length === 1,
      `--print 应给出恰好一条 plugin 记录，实际 ${JSON.stringify(doc && doc.plugin)}`);
    assert(doc && doc.plugin[0] === pathToFileURL(PLUGIN).href,
      `--print 应登记本仓库 src/index.mjs 的 file:// URL，实际 ${doc && doc.plugin[0]}`);
    assert(!fs.existsSync(tui), '--print 不该写文件');
    checked += 1;

    const first = run();
    assert(first.status === 0, `安装应以 0 退出，实际 ${first.status}: ${first.stderr}`);
    assert(fs.existsSync(tui), `安装后应有 ${tui}`);
    doc = JSON.parse(fs.readFileSync(tui, 'utf8'));
    assert(doc.$schema === 'https://opencode.ai/tui.json', `写出的配置应带 opencode 的 $schema，实际 ${doc.$schema}`);
    assert(Array.isArray(doc.plugin) && doc.plugin.length === 1, '安装后应恰好一条 plugin 记录');
    checked += 1;

    const again = run();
    assert(again.status === 0, `重复安装应以 0 退出，实际 ${again.status}: ${again.stderr}`);
    doc = JSON.parse(fs.readFileSync(tui, 'utf8'));
    assert(Array.isArray(doc.plugin) && doc.plugin.length === 1,
      `重复安装应替换而不是追加，实际 ${JSON.stringify(doc.plugin)}`);
    checked += 1;

    const removed = run('--remove');
    assert(removed.status === 0, `--remove 应以 0 退出，实际 ${removed.status}: ${removed.stderr}`);
    doc = JSON.parse(fs.readFileSync(tui, 'utf8'));
    assert(!('plugin' in doc), `--remove 后不该留下空的 plugin 数组，实际 ${JSON.stringify(doc)}`);
    checked += 1;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }

  return `${checked} 项安装断言`;
});

/* ------------------------------------------------------------ 执行 */

console.log('Command Code Usage (opencode) — 仓库检查\n');
let failed = 0;

for (const { name, fn } of suites) {
  failures = [];
  const started = Date.now();
  let summary = '';
  try {
    summary = (await fn()) ?? '';
  } catch (err) {
    failures.push(`套件抛错：${err instanceof Error ? err.message : String(err)}`);
  }
  const ms = Date.now() - started;

  if (failures.length === 0) {
    console.log(`${QUIET ? '' : '  ok    '}${name.padEnd(14)} ${summary}  (${ms}ms)`);
  } else {
    failed += 1;
    console.log(`${QUIET ? '' : '  FAIL  '}${name.padEnd(14)} —  (${ms}ms)`);
    for (const f of failures) console.log(`          ${f}`);
  }
}

console.log('');
if (failed > 0) {
  console.log(`${failed} 个套件失败。`);
  process.exit(1);
}
console.log(`${suites.length} 个套件全部通过。`);
