/**
 * tests/_harness.mjs —— 执行器线黑盒测试夹具
 *
 * 不依赖真实宿主安装：用假 HOME（USERPROFILE 覆盖 os.homedir）搭建最小宿主，
 * 让 wardrobe-exec.mjs 与 registry-ops.mjs 以为自己跑在真机上。
 *
 * 这样测的是「打进安装包的那个脚本本身」，而不是副本。
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXEC = join(REPO, 'patch', 'scripts', 'wardrobe-exec.mjs');
const VER = '9.9.9';

/** 确定性伪随机 base64（只用于占位 data URI，不需要真能解码） */
export function makeBase64(n) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let s = '';
  let seed = 987654321;
  for (let i = 0; i < n; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    s += alphabet[seed % alphabet.length];
  }
  return s;
}

/** 老 v2 单套包（带背景 + panelAlpha/cardAlpha，最贴近真实 Luna 导出） */
export const OLD_PACKAGE = {
  schema: 'hana-skinpack/2',
  packId: 'luna-old',
  names: { zh: 'Luna 旧包', en: 'Luna Old' },
  theme: {
    appearance: 'dark',
    colors: {
      '--bg': '#141313',
      '--bg-card': '#1b1a1a',
      '--text': '#ece8e1',
      '--accent': '#c0504d',
      '--border': '#3a3a42',
    },
    background: {
      asset: 'data:image/webp;base64,' + makeBase64(4000),
      panelAlpha: 0.62,
      cardAlpha: 0.40,
    },
    material: { tier: 'bold', rim: 0.26, blur: 26, edge: 'rgba(255,255,255,0.22)' },
  },
};

/** 双套 + manual（只注册两条，不动 auto 指针） */
export const DUAL_MANUAL = {
  schema: 'hana-skinpack/3',
  packId: 'dual-manual',
  names: { zh: '双套手动', en: 'Dual Manual' },
  theme: {
    variants: [
      {
        appearance: 'dark',
        colors: { '--bg': '#141313', '--bg-card': '#1b1a1a', '--text': '#ece8e1', '--accent': '#c0504d' },
        background: { asset: 'data:image/webp;base64,' + makeBase64(4000) },
        material: { tier: 'bold', rim: 0.26, blur: 26, edge: 'rgba(255,255,255,0.22)' },
      },
      {
        appearance: 'light',
        colors: { '--bg': '#f2f0eb', '--bg-card': '#fbfaf7', '--text': '#1c1b19', '--accent': '#b0473f' },
        background: { asset: 'data:image/webp;base64,' + makeBase64(4000) },
        material: { tier: 'bold', rim: 0.12, blur: 18, edge: 'rgba(0,0,0,0.10)' },
      },
    ],
    adaptive: { mode: 'manual' },
  },
};

/** 双套 + auto（改宿主 auto 指针） */
export const DUAL_AUTO = {
  schema: 'hana-skinpack/3',
  packId: 'dual-auto',
  names: { zh: '双套自动', en: 'Dual Auto' },
  theme: {
    variants: [
      {
        appearance: 'dark',
        colors: { '--bg': '#141313', '--bg-card': '#1b1a1a', '--text': '#ece8e1', '--accent': '#c0504d' },
        background: { asset: 'data:image/webp;base64,' + makeBase64(4000) },
        material: { tier: 'bold', rim: 0.26, blur: 26, edge: 'rgba(255,255,255,0.22)' },
      },
      {
        appearance: 'light',
        colors: { '--bg': '#f2f0eb', '--bg-card': '#fbfaf7', '--text': '#1c1b19', '--accent': '#b0473f' },
        background: { asset: 'data:image/webp;base64,' + makeBase64(4000) },
        material: { tier: 'bold', rim: 0.12, blur: 18, edge: 'rgba(0,0,0,0.10)' },
      },
    ],
    adaptive: { mode: 'auto' },
  },
};

/** 动图包：暗套带 animated-image + poster */
export const ANIM_PACKAGE = {
  schema: 'hana-skinpack/3',
  packId: 'anim-demo',
  names: { zh: '动图演示', en: 'Anim Demo' },
  theme: {
    variants: [
      {
        appearance: 'dark',
        colors: { '--bg': '#141313', '--bg-card': '#1b1a1a', '--text': '#ece8e1', '--accent': '#c0504d' },
        background: {
          asset: 'data:image/webp;base64,' + makeBase64(6000),
          poster: 'data:image/jpeg;base64,' + makeBase64(3000),
          motion: { mode: 'animated-image' },
        },
        material: { tier: 'bold', rim: 0.26, blur: 26, edge: 'rgba(255,255,255,0.22)' },
      },
      {
        appearance: 'light',
        colors: { '--bg': '#f2f0eb', '--bg-card': '#fbfaf7', '--text': '#1c1b19', '--accent': '#b0473f' },
        background: { asset: 'data:image/gif;base64,' + makeBase64(6000) },
        material: { tier: 'bold', rim: 0.12, blur: 18, edge: 'rgba(0,0,0,0.10)' },
      },
    ],
    adaptive: { mode: 'manual' },
  },
};

export function buildFakeHome(opts = {}) {
  const home = mkdtempSync(join(tmpdir(), 'skin-wardrobe-test-'));
  const hanako = join(home, '.hanako');
  const artifacts = join(hanako, 'artifacts');
  mkdirSync(artifacts, { recursive: true });
  const rVer = join(artifacts, 'renderer', VER);
  const sVer = join(artifacts, 'server', VER);
  mkdirSync(join(rVer, 'lib'), { recursive: true });
  mkdirSync(join(rVer, 'assets'), { recursive: true });
  mkdirSync(join(rVer, 'themes'), { recursive: true });
  mkdirSync(join(sVer, 'bundle'), { recursive: true });

  writeFileSync(join(artifacts, 'desktop-target.json'), JSON.stringify({
    current: { renderer: { versionDir: rVer }, server: { versionDir: sVer } },
  }), 'utf8');

  const themeJs = [
    `export const themes = {`,
    `  "warm-paper": { cssPath: "themes/warm-paper.css", backgroundColor: "#f5f0e6", appearance: "light", i18nName: "暖纸", i18nMode: "暖纸 · 模式" },`,
    `  "midnight": { cssPath: "themes/midnight.css", backgroundColor: "#0b0b0f", appearance: "dark", i18nName: "午夜", i18nMode: "午夜 · 模式" },`,
    `};`,
    `export const autoLightDefault = "warm-paper";`,
    `export const autoDarkDefault = "midnight";`,
    ``,
  ].join('\n');
  writeFileSync(join(rVer, 'lib', 'theme.js'), themeJs, 'utf8');

  const bundle = [
    `const a={cssPath:"themes/warm-paper.css",backgroundColor:"#f5f0e6",appearance:"light",i18nName:"暖纸",i18nMode:"暖纸 · 模式"},b={cssPath:"themes/midnight.css",backgroundColor:"#0b0b0f",appearance:"dark",i18nName:"午夜",i18nMode:"午夜 · 模式"};`,
    `export const themes={...a,...b};`,
    `export const autoLightDefault="warm-paper";export const autoDarkDefault="midnight";`,
    ``,
  ].join('\n');
  writeFileSync(join(rVer, 'assets', 'bundle-' + VER + '.js'), bundle, 'utf8');

  writeFileSync(join(sVer, 'bundle', 'index.js'), themeJs, 'utf8');

  const skinsDir = join(hanako, 'app-data', 'skin-wardrobe', 'skins');
  mkdirSync(skinsDir, { recursive: true });
  for (const pkg of (opts.packages || [])) {
    const d = join(skinsDir, pkg.packId);
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, 'skin.json'), JSON.stringify(pkg), 'utf8');
  }
  writeFileSync(join(hanako, 'app-data', 'skin-wardrobe', 'pending.json'),
    JSON.stringify(opts.pending || [], null, 2), 'utf8');

  return { home, rVer, sVer };
}

export function runExec(home, args) {
  const env = { ...process.env, USERPROFILE: home, USERNAME: 'test', HOME: home };
  const r = spawnSync(process.execPath, [EXEC, ...args], { cwd: REPO, env, encoding: 'utf8' });
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

export function sha256File(p) {
  if (!existsSync(p)) return '<missing>';
  return createHash('sha256').update(readFileSync(p)).digest('hex');
}

export function resetPending(home, mutator) {
  const p = join(home, '.hanako', 'app-data', 'skin-wardrobe', 'pending.json');
  const list = JSON.parse(readFileSync(p, 'utf8'));
  mutator(list);
  writeFileSync(p, JSON.stringify(list, null, 2), 'utf8');
}

export function readCss(home, name) {
  const p = join(home, '.hanako', 'artifacts', 'renderer', VER, 'themes', name);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

export function cleanup(home) {
  try { rmSync(home, { recursive: true, force: true }); } catch { /* 忽略 */ }
}

export function themeJsPath(home) { return join(home, '.hanako', 'artifacts', 'renderer', VER, 'lib', 'theme.js'); }
export function bundlePath(home) { return join(home, '.hanako', 'artifacts', 'renderer', VER, 'assets', 'bundle-' + VER + '.js'); }
export function serverBundlePath(home) { return join(home, '.hanako', 'artifacts', 'server', VER, 'bundle', 'index.js'); }
