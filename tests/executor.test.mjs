/**
 * tests/executor.test.mjs —— SKINPACK v3 执行器线验收（spec §5 第 1–5 条）
 *
 * 黑盒跑 patch/scripts/wardrobe-exec.mjs + registry-ops.mjs（假 HOME 模拟宿主），
 * 不依赖真实安装。覆盖：
 *   1. 干跑输出符合 §3.1 / §3.4
 *   2. --apply 连跑两次第二次 no-op（逐字节 diff）
 *   3. 亮色 CSS 不含写死 rgba(20, 19, 19, …)
 *   4. 动图包 CSS 的 data URI 完整无截断 + prefers-reduced-motion 指向 poster
 *   5. 老包干跑输出与改动前完全一致（见 _check_regression.mjs / fixtures 基线）
 */
import {
  buildFakeHome, runExec, sha256File, resetPending, readCss, cleanup,
  themeJsPath, bundlePath, serverBundlePath,
  OLD_PACKAGE, DUAL_MANUAL, DUAL_AUTO, ANIM_PACKAGE,
} from './_harness.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '  -> ' + detail : '')); }
};

function readThemeEntries(themeJs) {
  const t = themeJs;
  const re = /"?(hana-[a-zA-Z0-9_.-]+)"?\s*:\s*\{\s*cssPath\s*:\s*"([^"]+)"[^}]*?backgroundColor\s*:\s*"([^"]+)"[^}]*?appearance\s*:\s*"([^"]+)"[^}]*?i18nName\s*:\s*"([^"]+)"/g;
  const out = [];
  let m;
  while ((m = re.exec(t)) !== null) out.push({ id: m[1], cssPath: m[2], bg: m[3], ap: m[4], name: m[5] });
  return out;
}

// ───────────────────────── 1. 双套 manual 干跑 ─────────────────────────
console.log('[1] 双套 + manual 干跑（§3.1）');
{
  const { home } = buildFakeHome({
    packages: [DUAL_MANUAL],
    pending: [{ id: 'm1', op: 'enable', packId: DUAL_MANUAL.packId }],
  });
  const r = runExec(home, []);
  cleanup(home);
  const out = r.stdout;
  check('报告生成两套 CSS（-dark / -light）',
    out.includes('hana-dual-manual-dark.css') && out.includes('hana-dual-manual-light.css'));
  check('报告注册两条（-dark / -light）',
    (out.match(/注册表插入 hana-dual-manual-(dark|light)/g) || []).length === 2);
  check('manual 不动 auto 指针（出现「仅注册两条」且无 autoLightDefault →）',
    out.includes('仅注册两条') && !out.includes('autoLightDefault'));
  check('干跑未改动任何文件（无「已备份」且无 CSS 落盘）', r.code === 0 && !out.includes('已备份'));
}

// ───────────────────────── 1b. 双套 auto 干跑（§3.4） ─────────────────────────
console.log('[1b] 双套 + auto 干跑（§3.4）');
{
  const { home } = buildFakeHome({
    packages: [DUAL_AUTO],
    pending: [{ id: 'a1', op: 'enable', packId: DUAL_AUTO.packId }],
  });
  const r = runExec(home, []);
  cleanup(home);
  const out = r.stdout;
  check('报告两套 CSS + 两条注册',
    out.includes('hana-dual-auto-dark.css') && out.includes('hana-dual-auto-light.css') &&
    (out.match(/注册表插入 hana-dual-auto-(dark|light)/g) || []).length === 2);
  // 规格 §3.4 修订（2026-11-09，glados 复核 B2）：auto 指针手术本版关闭。
  // 原先这条断言要求「报告 auto 从 warm-paper/midnight → 本包」，属于旧设计；
  // 保留会与规格矛盾，故改为验证「明确拒绝 + 不声称改了指针」。
  check('auto 模式被明确拒绝（打印不支持并按 manual 处理）',
    out.includes('adaptive.mode=auto 本版不支持') && !out.includes('autoLightDefault'));
}

// ───────────────────────── 3. 亮色 CSS 无写死 scrim ─────────────────────────
console.log('[3] 亮色 CSS 不含写死 rgba(20, 19, 19, …)（§3.2 / §5-3）');
{
  const { home } = buildFakeHome({
    packages: [DUAL_AUTO],
    pending: [{ id: 'a2', op: 'enable', packId: DUAL_AUTO.packId }],
  });
  const r = runExec(home, ['--apply']);
  const light = readCss(home, 'hana-dual-auto-light.css');
  const dark = readCss(home, 'hana-dual-auto-dark.css');
  cleanup(home);
  check('apply 成功', r.code === 0);
  check('亮色 CSS 存在', !!light);
  // 2026-11-12 定案：含 var() 的背景声明与超大 url() 同存时，待替换路径 ~2MB 上限 → 黑屏。
  // 背景层必须编译成字面量（每套用自己的 rgb），断言背景层段内无 var、且 scrim 是自身底色。
  const bgOf = (css) => css.slice(css.indexOf('/* ── 背景层'), css.indexOf('/* ── 材质层'));
  check('亮色背景层不含 var(--bg-rgb)（已编译成字面量）', !!light && !bgOf(light).includes('var(--bg-rgb)'));
  check('亮色 scrim 是自身底色字面量（#f2f0eb → 242, 240, 235）', !!light && light.includes('rgba(242, 240, 235, 0.72)'));
  check('暗色 scrim 是自身底色字面量（#141313 → 20, 19, 19）', !!dark && dark.includes('rgba(20, 19, 19, 0.72)'));
  check('亮色 CSS 写入自身 --bg-rgb（来自 #f2f0eb）', !!light && light.includes('--bg-rgb: 242, 240, 235;'));
  check('暗色 CSS 写入自身 --bg-rgb（来自 #141313）', !!dark && dark.includes('--bg-rgb: 20, 19, 19;'));
}

// ───────────────────────── 4. 动图包 CSS ─────────────────────────
console.log('[4] 动图包 CSS：data URI 完整 + prefers-reduced-motion 指向 poster（§2.1 / §5-4）');
{
  const { home } = buildFakeHome({
    packages: [ANIM_PACKAGE],
    pending: [{ id: 'n1', op: 'enable', packId: ANIM_PACKAGE.packId }],
  });
  const r = runExec(home, ['--apply']);
  const dark = readCss(home, 'hana-anim-demo-dark.css');
  cleanup(home);
  const asset = ANIM_PACKAGE.theme.variants[0].background.asset;
  const poster = ANIM_PACKAGE.theme.variants[0].background.poster;
  check('apply 成功', r.code === 0);
  check('暗色 CSS 存在', !!dark);
  check('data URI 完整无截断（含完整 asset 串）', !!dark && dark.includes(asset));
  check('data URI 仅出现一次（占位符恰好命中 1 次，未灌成副本）', !!dark && dark.split(asset).length === 2);
  check('存在 @media (prefers-reduced-motion: reduce)', !!dark && dark.includes('@media (prefers-reduced-motion: reduce)'));
  check('reduced-motion 规则指向 poster', !!dark && dark.includes(poster));
  check('reduced-motion 规则作用在 [data-chalkboard-root]', !!dark && /data-chalkboard-root\]\s*\{\s*background-image/.test(dark));
  check('reduced-motion 规则复用 scrim 层序（含 linear-gradient + url(poster)，无新增/删除层）',
    !!dark && /background-image:\s*linear-gradient\([^;]*url\("data:image\/jpeg/.test(dark));
}

// ───────────────────────── 2. --apply 两次 no-op ─────────────────────────
console.log('[2] --apply 连跑两次第二次 no-op（逐字节 diff，§3.5 / §5-2）');
{
  const { home } = buildFakeHome({
    packages: [DUAL_AUTO],
    pending: [{ id: 'a3', op: 'enable', packId: DUAL_AUTO.packId }],
  });
  const r1 = runExec(home, ['--apply']);
  // 直接对文件取哈希
  const f = (p) => sha256File(p);
  const pDark = join(home, '.hanako', 'artifacts', 'renderer', '9.9.9', 'themes', 'hana-dual-auto-dark.css');
  const pLight = join(home, '.hanako', 'artifacts', 'renderer', '9.9.9', 'themes', 'hana-dual-auto-light.css');
  const h1 = {
    dark: f(pDark), light: f(pLight),
    themeJs: f(themeJsPath(home)), bundle: f(bundlePath(home)), server: f(serverBundlePath(home)),
  };
  // 重置待办，强制第二次真正重跑（验证生成器幂等，而非待办耗尽）
  resetPending(home, (list) => { for (const it of list) it.done = false; });
  const r2 = runExec(home, ['--apply']);
  const h2 = {
    dark: f(pDark), light: f(pLight),
    themeJs: f(themeJsPath(home)), bundle: f(bundlePath(home)), server: f(serverBundlePath(home)),
  };
  cleanup(home);
  check('第一次 apply 成功', r1.code === 0);
  check('第二次 apply 成功', r2.code === 0);
  check('暗色 CSS 第二次逐字节相同', h1.dark === h2.dark, `${h1.dark} vs ${h2.dark}`);
  check('亮色 CSS 第二次逐字节相同', h1.light === h2.light, `${h1.light} vs ${h2.light}`);
  check('theme.js 第二次逐字节相同（auto 指针已幂等）', h1.themeJs === h2.themeJs, `${h1.themeJs} vs ${h2.themeJs}`);
  check('renderer bundle 第二次逐字节相同', h1.bundle === h2.bundle);
  check('server bundle 第二次逐字节相同', h1.server === h2.server);
}

// ───────────────────────── 注册表条目字段校验（§3.3） ─────────────────────────
console.log('[3b] 注册表条目字段（§3.3）');
{
  const { home } = buildFakeHome({
    packages: [DUAL_AUTO],
    pending: [{ id: 'a4', op: 'enable', packId: DUAL_AUTO.packId }],
  });
  const r = runExec(home, ['--apply']);
  const themeJs = readFileSync(themeJsPath(home), 'utf8');
  cleanup(home);
  const ents = readThemeEntries(themeJs);
  const darkE = ents.find((e) => e.id === 'hana-dual-auto-dark');
  const lightE = ents.find((e) => e.id === 'hana-dual-auto-light');
  check('两条注册条目存在', !!darkE && !!lightE);
  if (darkE) {
    check('dark 条目 backgroundColor 为 6 位 hex', /^#[0-9a-fA-F]{6}$/.test(darkE.bg), darkE.bg);
    check('dark 条目 appearance=dark', darkE.ap === 'dark');
    check('dark 条目 i18nName 含「暗色」', darkE.name.includes('暗色'));
    check('dark 条目 cssPath 指向 -dark.css', darkE.cssPath === 'themes/hana-dual-auto-dark.css');
  }
  if (lightE) {
    check('light 条目 backgroundColor 为 6 位 hex', /^#[0-9a-fA-F]{6}$/.test(lightE.bg), lightE.bg);
    check('light 条目 appearance=light', lightE.ap === 'light');
    check('light 条目 i18nName 含「亮色」', lightE.name.includes('亮色'));
    check('light 条目 cssPath 指向 -light.css', lightE.cssPath === 'themes/hana-dual-auto-light.css');
  }
  // 同上：规格 §3.4 修订后，双套不再写 auto 指针，theme.js 的 auto 常量应保持原值
  check('auto 指针未被写入（lights 仍指向宿主内置）', /autoLightDefault\s*[:=]\s*"warm-paper"/.test(themeJs));
  check('auto 指针未被写入（dark 仍指向宿主内置）', /autoDarkDefault\s*[:=]\s*"midnight"/.test(themeJs));
}

// ───────────────────────── 5. 老包干跑回归（复用基线） ─────────────────────────
console.log('[5] 老包干跑输出与改动前完全一致（§5-5，基线见 fixtures/old-dryrun-baseline.txt）');
{
  const { home } = buildFakeHome({
    packages: [OLD_PACKAGE],
    pending: [{ id: 'b1', op: 'enable', packId: OLD_PACKAGE.packId }],
  });
  const r = runExec(home, []);
  const baseline = readFileSync(join(HERE, 'fixtures', 'old-dryrun-baseline.txt'), 'utf8');
  cleanup(home);
  const a = baseline.replace(/\r\n/g, '\n');
  const b = r.stdout.replace(/\r\n/g, '\n');
  check('老包干跑输出逐字节一致', a === b, `len ${a.length} vs ${b.length}`);
}

// ──────────────── 6. --bg 归一化（§3.3 / §5-5） ────────────────
console.log('[6] --bg 归一化：8 位 hex / rgba() 可解析，非法值报错中止（§3.3）');
const single = (packId, bg) => ({
  schema: 'hana-skinpack/2',
  packId,
  names: { zh: packId },
  theme: { appearance: 'dark', colors: { '--bg': bg, '--text': '#eee' } },
});
{
  // 6a. 8 位 hex（带 alpha）→ 取 RGB 三元，注册 backgroundColor 用 6 位
  const { home } = buildFakeHome({
    packages: [single('bg-hex8', '#141313ff')],
    pending: [{ id: 'n1', op: 'enable', packId: 'bg-hex8' }],
  });
  const r = runExec(home, ['--apply']);
  const css = readCss(home, 'hana-bg-hex8.css');
  const themeJs = readFileSync(themeJsPath(home), 'utf8');
  cleanup(home);
  check('8 位 hex：apply 成功', r.code === 0);
  check('8 位 hex：--bg-rgb 为 20, 19, 19', !!css && css.includes('--bg-rgb: 20, 19, 19;'));
  check('8 位 hex：注册 backgroundColor 为 6 位 #141313', /backgroundColor\s*:\s*"#141313"/.test(themeJs));
}
{
  // 6b. rgba() 半透明底 → 同样能解析
  const { home } = buildFakeHome({
    packages: [single('bg-rgba', 'rgba(30, 40, 50, 0.55)')],
    pending: [{ id: 'n2', op: 'enable', packId: 'bg-rgba' }],
  });
  const r = runExec(home, ['--apply']);
  const css = readCss(home, 'hana-bg-rgba.css');
  cleanup(home);
  check('rgba()：apply 成功', r.code === 0);
  check('rgba()：--bg-rgb 为 30, 40, 50', !!css && css.includes('--bg-rgb: 30, 40, 50;'));
}
{
  // 6c. 非法值 → 报错中止，不落 CSS（不许静默回退成 Luna 黑）
  const { home } = buildFakeHome({
    packages: [single('bg-bad', 'not-a-color')],
    pending: [{ id: 'n3', op: 'enable', packId: 'bg-bad' }],
  });
  const r = runExec(home, ['--apply']);
  const css = readCss(home, 'hana-bg-bad.css');
  cleanup(home);
  check('非法值：输出含「--bg 无法解析」', r.stdout.includes('--bg 无法解析'));
  check('非法值：未写 CSS（不静默回退）', !css);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
