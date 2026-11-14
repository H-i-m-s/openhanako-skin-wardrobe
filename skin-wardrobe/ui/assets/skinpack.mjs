/**
 * skinpack.mjs — SKINPACK 信封的读取、校验与补全。
 * 规范见 ../docs/SKINPACK.md。变量层校验一律交给宿主的
 * validateCustomThemeDefinition（经 hana.themes.custom.getSchema 间接实现），
 * 本模块不复制那 61 条规则。
 */

export const SCHEMA_ID = "hana-skinpack/1";

/** 决定「长相」与「可读性」的 8 项，缺一不算皮肤（规范 §5）。 */
export const REQUIRED_CORE = [
  "--bg", "--bg-card", "--bg-glass", "--sidebar-bg",
  "--text", "--text-muted", "--border", "--accent",
];

/** 建议明示：继承会串味，但不拦（规范 §5）。 */
export const RECOMMENDED = [
  "--accent-hover", "--accent-light", "--link", "--link-hover",
  "--green", "--coral", "--danger",
];

/** 缺失时由固定默认补足的几何/排版项（宿主深色底实测不含这 7 项）。 */
export const GEOMETRY_DEFAULTS = {
  "--radius-input": 8,
  "--radius-card": 12,
  "--radius-chat-card": 12,
  "--radius-chat-surface": 14,
  "--font-ui": ["Segoe UI", "Microsoft YaHei UI", "sans-serif"],
  "--font-serif": ["Noto Serif SC", "serif"],
  "--font-mono": ["Cascadia Code", "Consolas", "monospace"],
};

/** rgba(r,g,b[,a]) → #RRGGBBAA；不是 rgba 写法则原样返回 */
function rgbaToHex(v) {
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?\)$/i.exec(v);
  if (!m) return v;
  const hx = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  const a = m[4] === undefined ? 255 : Math.round(parseFloat(m[4]) * 255);
  return ('#' + hx(+m[1]) + hx(+m[2]) + hx(+m[3]) + (a === 255 ? '' : hx(a))).toUpperCase();
}

/**
 * 把宿主调色板 CSS 解析成可用的底表：
 *  1. 只留词表内变量（midnight 实测有 10 项在外，不去会让宿主直接拒定义）
 *  2. rgba() → #RRGGBBAA（定义只认 hex；实测 16 项需转）
 *  3. var(--x) 解引用一轮（实测 --tab-slider-bg 是引用写法）
 * 解不出的项丢弃并列入 skipped，不写脏值。
 */
export function parsePaletteCss(css, vocabulary) {
  const allowed = vocabulary && vocabulary.length ? new Set(vocabulary) : null;
  const raw = {};
  const re = /(--[a-z0-9-]+)\s*:\s*([^;{}]+);/gi;
  let m;
  while ((m = re.exec(css)) !== null) {
    const name = m[1];
    if (allowed && !allowed.has(name)) continue;
    if (!(name in raw)) raw[name] = m[2].trim();
  }

  const out = {};
  const skipped = [];
  const resolve = (value, depth) => {
    const ref = /^var\((--[a-z0-9-]+)\)$/i.exec(value);
    if (!ref) return value;
    if (depth > 4) return null;
    const next = raw[ref[1]];
    if (!next) return null;
    return resolve(next, depth + 1);
  };

  for (const name of Object.keys(raw)) {
    let value = resolve(raw[name], 0);
    if (value === null) { skipped.push({ name, raw: raw[name], reason: 'unresolved var()' }); continue; }
    if (value.startsWith('#')) value = normalizeHex(value);
    else if (/^rgba?\(/i.test(value)) value = rgbaToHex(value);
    if (!/^#[0-9a-f]{6}$|^#[0-9a-f]{8}$/i.test(value)) {
      skipped.push({ name, raw: raw[name], reason: 'not a hex color' });
      continue;
    }
    out[name] = value;
  }
  return { vars: out, skipped };
}

function normalizeHex(hex) {
  const body = hex.slice(1);
  if (body.length === 3) return "#" + body.split("").map((c) => c + c).join("");
  if (body.length === 4) {
    const [r, g, b, a] = body.split("");
    return "#" + r + r + g + g + b + b + a + a;
  }
  return hex.toUpperCase();
}

/**
 * 读取并静态校验一个信封。返回 { ok, errors, warnings, pack }。
 * 变量层的完整性不在这里判（交给宿主）。
 */
export function readPack(json) {
  const errors = [];
  const warnings = [];
  if (!json || typeof json !== "object") {
    return { ok: false, errors: ["不是有效的 JSON 对象"], warnings, pack: null };
  }
  if (json.schema !== SCHEMA_ID) {
    errors.push("schema 应为 \"" + SCHEMA_ID + "\"，实为 " + JSON.stringify(json.schema));
  }
  if (typeof json.packId !== "string" || !json.packId) {
    errors.push("缺少 packId");
  }
  if (typeof json.packVersion !== "string" || !json.packVersion) {
    errors.push("缺少 packVersion");
  }
  if (!Array.isArray(json.themes) || json.themes.length === 0) {
    errors.push("themes 必须是非空数组");
    return { ok: false, errors, warnings, pack: null };
  }

  const patchSets = json.patchSets || {};
  json.themes.forEach((theme, i) => {
    const at = "themes[" + i + "]";
    if (!theme || typeof theme !== "object") { errors.push(at + " 不是对象"); return; }
    if (typeof theme.key !== "string" || !theme.key) errors.push(at + " 缺少 key");
    if (theme.kind === "vars") {
      if (!theme.theme) errors.push(at + " kind=vars 但缺少 theme");
      if (theme.patchRef) warnings.push(at + " kind=vars 不应带 patchRef，已忽略");
    } else if (theme.kind === "patch") {
      if (!theme.patchRef) {
        errors.push(at + " kind=patch 缺少 patchRef（补丁描述在包级，见规范 §4.3）");
      } else if (!patchSets[theme.patchRef]) {
        errors.push(at + " patchRef \"" + theme.patchRef + "\" 在 patchSets 里不存在");
      }
      if (theme.theme) warnings.push(at + " kind=patch 的 theme 不会被使用");
    } else {
      errors.push(at + " kind 必须是 vars 或 patch，实为 " + JSON.stringify(theme.kind));
    }
    if (!theme.losses) errors.push(at + " 缺少 losses（可为空数组，但必须显式写）");
  });

  // patchSets 引用检查：没人用的补丁集是包作者留下的噪音
  const used = new Set(json.themes.map((t) => t.patchRef).filter(Boolean));
  Object.keys(patchSets).forEach((id) => {
    if (!used.has(id)) warnings.push("patchSets." + id + " 没有任何主题引用");
  });

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    pack: errors.length ? null : json,
  };
}

/**
 * 计算一个 vars 主题的完整性：缺哪些核心项、继承多少、总补全结果。
 * baseVariables 来自宿主调色板解析（已过滤到词表）+ 几何默认。
 * vocabulary 给出时，结果只保留词表内变量；词表外的作者变量会被
 * 列入 losses 口径的 outsideVocabulary，由调用方报损，不静默丢。
 */
export function analyzeTheme(theme, baseVariables, vocabulary) {
  const authored = (theme.theme && theme.theme.variables) || {};
  const names = Object.keys(authored);
  const missingCore = REQUIRED_CORE.filter((n) => !(n in authored));
  const missingRecommended = RECOMMENDED.filter((n) => !(n in authored));

  /*
   * 底表分两层：几何默认在最下（宿主调色板实测不含这 7 项），
   * 调色板在上。少了这一层，补全结果会缺 --radius-* 与 --font-*，
   * 交给宿主直接被拒（它要求 61 项齐全）。
   * baseVariables 允许传入 { vars, skipped } 形状。
   */
  const baseVars = baseVariables && baseVariables.vars ? baseVariables.vars : (baseVariables || {});
  const layeredBase = { ...GEOMETRY_DEFAULTS, ...baseVars };

  const filled = {};
  const inherited = [];
  const defaulted = [];
  for (const name of Object.keys(layeredBase)) {
    if (name in authored) { filled[name] = authored[name]; continue; }
    filled[name] = layeredBase[name];
    // 按**实际取自哪一层**分类，不是按名字属于哪一类：
    // 宿主调色板若提供了圆角，那算继承不算默认。
    if (baseVars && name in baseVars) inherited.push(name);
    else defaulted.push(name);
  }
  // 作者写了但底表没有的项，原样带上交给宿主判定
  for (const name of names) {
    if (!(name in filled)) filled[name] = authored[name];
  }

  /*
   * 词表过滤。不在词表里的作者变量不能静默删——规范要求报损（§4.4），
   * 所以另列一份交给 UI 显示。
   */
  const outsideVocabulary = [];
  if (vocabulary && vocabulary.length) {
    const allowed = new Set(vocabulary);
    for (const name of Object.keys(filled)) {
      if (!allowed.has(name)) {
        outsideVocabulary.push(name);
        delete filled[name];
      }
    }
  }

  return {
    authoredCount: names.length,
    inheritedCount: inherited.length,
    defaultedCount: defaulted.length,
    missingCore,
    missingRecommended,
    outsideVocabulary,
    complete: missingCore.length === 0,
    definition: {
      formatVersion: 1,
      name: (theme.theme && theme.theme.name) || theme.key,
      appearance: theme.appearance,
      variables: filled,
    },
  };
}

/** 皮肤包导出：把一个宿主 CustomThemeRecord 反写成信封（规范 §6/§7）。 */
export function exportPack(record, meta) {
  return {
    schema: SCHEMA_ID,
    packId: meta.packId,
    packVersion: meta.packVersion || "1.0.0",
    names: { zh: meta.displayName || record.name },
    source: {
      kind: meta.sourceKind || "original",
      publisher: meta.publisher || "unknown",
      license: meta.license || "unspecified",
    },
    themes: [{
      key: meta.key || "default",
      kind: "vars",
      appearance: record.appearance,
      palette: pickPalette(record.variables),
      base: "host-" + record.appearance,
      theme: {
        formatVersion: 1,
        name: record.name,
        appearance: record.appearance,
        variables: record.variables,
      },
      losses: [],
    }],
  };
}

function pickPalette(v) {
  const out = {};
  const map = { bg: "--bg", panel: "--bg-card", accent: "--accent", text: "--text" };
  for (const k of Object.keys(map)) if (v[map[k]]) out[k] = v[map[k]];
  return out;
}

/* ════════════════════════════════════════════════════════════════
   v3 工作台线：颜色基座 / 派生 / 预设 / 联动派生 / 体积 / 校验
   以下全部是纯函数（不触碰 DOM），可被 Node 单测直接 import。
   原 panel.js 里的同名定义已迁至此，panel.js 改为 import 复用。
   ════════════════════════════════════════════════════════════════ */

export const SCHEMA_V2 = "hana-skinpack/2";
export const SCHEMA_V3 = "hana-skinpack/3";

/* 体积预算（规格 §2.3，硬约束） */
export const IMG_MAX_BYTES = 5 * 1024 * 1024;   // 单张图（data URI 长度）≤ 5 MB；Luna 3.93MB 实测可用。
// （曾短暂引入动图专用 3.8MB 上限，后证实黑屏根因是 var() 待替换路径而非体积，已撤销。）
export const IMG_MAX_EDGE = 1920;               // 边长 ≤ 1920 px
export const PACK_MAX_BYTES = 12 * 1024 * 1024; // 单包（双套 + 两张图）≤ 12 MB

/* 动图接受的扩展名（规格 §4.2：webp / gif / apng；拒绝 mp4 / webm） */
export const ANIMATED_EXT = new Set(['.webp', '.gif', '.apng']);
export const STATIC_EXT = new Set(['.png', '.jpg', '.jpeg', '.bmp', '.webp', '.gif']);
export const VIDEO_EXT = new Set(['.mp4', '.webm', '.mov', '.m4v']);

export function fmtMB(bytes) {
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

/** 估算 data URI 里的原始字节数（base64 长度 × 3/4，再减 padding）。非 data URI 退回字符串长度。 */
export function dataUriBytes(dataUri) {
  const m = /^data:[^;]*;base64,([\s\S]*)$/.exec(dataUri || '');
  if (!m) return (dataUri || '').length;
  const b64 = m[1].replace(/\s/g, '');
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor(b64.length * 3 / 4) - pad;
}

/** 单张图体积校验：字节 ≤ IMG_MAX_BYTES、边长 ≤ IMG_MAX_EDGE。 */
export function checkImageFile({ bytes, width, height }) {
  const errors = [];
  if (typeof bytes === 'number' && bytes > IMG_MAX_BYTES) {
    errors.push(`单张图 ${fmtMB(bytes)} 超过上限 ${fmtMB(IMG_MAX_BYTES)}（data URI ≤5 MB）`);
  }
  if (typeof width === 'number' && typeof height === 'number') {
    const edge = Math.max(width, height);
    if (edge > IMG_MAX_EDGE) {
      errors.push(`边长 ${width}×${height} 超过 ${IMG_MAX_EDGE}px 上限`);
    }
  }
  return { ok: errors.length === 0, errors, actualBytes: bytes, edge: (width && height) ? Math.max(width, height) : null };
}

/** UTF-8 字节数：Node 与浏览器都可用。 */
export function utf8Bytes(str) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str).length;
  return Buffer.byteLength(str, 'utf8');
}

/** 单包体积校验：整份 JSON 的 UTF-8 字节 ≤ PACK_MAX_BYTES。 */
export function checkPackBudget(pack) {
  const str = typeof pack === 'string' ? pack : JSON.stringify(pack);
  const bytes = utf8Bytes(str);
  const ok = bytes <= PACK_MAX_BYTES;
  return { ok, bytes, max: PACK_MAX_BYTES, errors: ok ? [] : [`单包 ${fmtMB(bytes)} 超过 ${fmtMB(PACK_MAX_BYTES)} 上限`] };
}

/* ── 颜色基座（61 项宿主变量，原 panel.js BASE_COLORS 迁来，逐字）── */
export const BASE_COLORS = {
  '--bg': '#141313',
  '--bg-card': '#1E1D1E',
  '--bg-glass': '#1E1D1EEB',
  '--sidebar-bg': '#191719',
  '--accent': '#CD5B85',
  '--accent-hover': '#DA84A4',
  '--accent-light': '#CD5B8526',
  '--link': '#E4A3C3',
  '--link-hover': '#F0C1D7',
  '--text': '#F0EFF0',
  '--text-light': '#D0CAD1',
  '--text-muted': '#AAA2AD',
  '--hana-text': '#F0EFF0',
  '--border': '#B896C138',
  '--shadow': '#00000070',
  '--green': '#9DCCAC',
  '--coral': '#DFB0A1',
  '--danger': '#F09AAB',
  '--jian-note-bg': '#262127',
  '--jian-note-border': '#B896C140',
  '--mood-bg': '#B896C112',
  '--mood-text': '#C8ACD1',
  '--mood-border': '#B896C133',
  '--tool-bg': '#B896C10D',
  '--tool-text': '#C5BDC9',
  '--user-bg': '#CD5B851F',
  '--drop-overlay-bg': '#141313E8',
  '--attach-bg': '#FFFFFF0D',
  '--overlay-subtle': '#FFFFFF06',
  '--overlay-light': '#FFFFFF0D',
  '--overlay-medium': '#FFFFFF17',
  '--overlay-strong': '#B896C133',
  '--tab-slider-bg': '#B896C125',
  '--term-bg': '#191719',
  '--term-fg': '#E5DFE7',
  '--term-cursor': '#DA84A4',
  '--term-cursor-accent': '#141313',
  '--term-selection-bg': '#CD5B8540',
  '--term-ansi-black': '#353039',
  '--term-ansi-red': '#E78FA4',
  '--term-ansi-green': '#9DCCAC',
  '--term-ansi-yellow': '#DBC295',
  '--term-ansi-blue': '#A6B9E2',
  '--term-ansi-magenta': '#C1A0D4',
  '--term-ansi-cyan': '#9CCAD0',
  '--term-ansi-white': '#D0CAD1',
  '--term-ansi-bright-black': '#AAA2AD',
  '--term-ansi-bright-red': '#F7B0C0',
  '--term-ansi-bright-green': '#BAE2C8',
  '--term-ansi-bright-yellow': '#EED9B2',
  '--term-ansi-bright-blue': '#C2D0F2',
  '--term-ansi-bright-magenta': '#DAC0EA',
  '--term-ansi-bright-cyan': '#BCE4E9',
  '--term-ansi-bright-white': '#F5F0F6',
  '--radius-input': '18px',
  '--radius-card': '18px',
  '--radius-chat-card': '16px',
  '--radius-chat-surface': '20px',
  '--font-ui': 'Segoe UI, Microsoft YaHei UI, Microsoft YaHei, sans-serif',
  '--font-serif': 'Noto Serif SC, Source Han Serif SC, serif',
  '--font-mono': 'Cascadia Code, Consolas, monospace',
};

/* ── 颜色工具（纯，原 panel.js 迁来）── */
export const hex2rgb = (h) => {
  const m = /^#([0-9a-f]{6})$/i.exec(h || '');
  return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : [20, 19, 19];
};
export const toHex = (rgb) => '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
export const shade = (h, amt) => toHex(hex2rgb(h).map((v) => v + (amt > 0 ? (255 - v) * amt : v * amt)));
export const luminance = (h) => {
  const [r, g, b] = hex2rgb(h).map((v) => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/* ── 派生：方向跟着底色明暗翻（原 panel.js deriveColors 迁来，逐字）── */
export function deriveColors({ bg, card, accent, text }) {
  const isLight = luminance(bg) > 0.5;
  const out = { ...BASE_COLORS };

  out['--bg'] = bg;
  out['--sidebar-bg'] = bg;
  out['--term-bg'] = bg;
  out['--drop-overlay-bg'] = bg.toUpperCase() + 'E8';
  out['--bg-card'] = card;
  out['--bg-glass'] = card.toUpperCase() + (isLight ? 'F2' : 'EB');

  out['--accent'] = accent;
  // 亮色下强调色要往深压，否则在白底上看不清
  out['--accent-hover'] = isLight ? shade(accent, -0.15) : shade(accent, 0.18);
  out['--accent-light'] = accent.toUpperCase() + (isLight ? '1A' : '26');
  out['--link'] = isLight ? shade(accent, -0.12) : shade(accent, 0.28);
  out['--link-hover'] = isLight ? shade(accent, -0.24) : shade(accent, 0.42);
  out['--user-bg'] = accent.toUpperCase() + (isLight ? '14' : '1F');
  out['--tab-slider-bg'] = accent.toUpperCase() + (isLight ? '1A' : '25');
  out['--term-cursor'] = out['--accent-hover'];
  out['--term-selection-bg'] = accent.toUpperCase() + (isLight ? '30' : '40');

  out['--text'] = text;
  out['--hana-text'] = text;
  // 亮色下「次要文字」应该更浅（靠近背景），不是更深
  out['--text-light'] = isLight ? shade(text, 0.28) : shade(text, -0.12);
  out['--text-muted'] = isLight ? shade(text, 0.46) : shade(text, -0.32);
  out['--term-fg'] = isLight ? shade(text, 0.12) : shade(text, -0.08);
  out['--term-cursor-accent'] = isLight ? card : bg;
  out['--term-ansi-white'] = out['--text-light'];
  out['--term-ansi-bright-black'] = out['--text-muted'];

  // 结构性透明层：亮色用黑色低透明度，暗色用白色
  out['--border'] = isLight ? 'rgba(0,0,0,0.12)' : '#B896C138';
  out['--overlay-subtle'] = isLight ? '#00000004' : '#FFFFFF06';
  out['--overlay-light'] = isLight ? '#00000008' : '#FFFFFF0D';
  out['--overlay-medium'] = isLight ? '#00000010' : '#FFFFFF17';
  out['--overlay-strong'] = isLight ? '#00000018' : '#B896C133';
  out['--shadow'] = isLight ? '#0000001F' : '#00000070';
  out['--attach-bg'] = isLight ? '#00000006' : '#FFFFFF0D';
  out['--jian-note-bg'] = isLight ? '#F1EDE8' : '#262127';
  out['--jian-note-border'] = isLight ? 'rgba(0,0,0,0.10)' : '#B896C140';
  out['--tool-bg'] = isLight ? '#00000005' : '#B896C10D';
  out['--mood-bg'] = isLight ? '#00000006' : '#B896C112';
  out['--mood-border'] = isLight ? 'rgba(0,0,0,0.10)' : '#B896C133';

  return out;
}

/* ── 预设：一键填一套四个关键色（原 panel.js PRESETS 迁来）──
   亮色三套 2026-11-13 重调：降高亮感（纯白卡 + 蓝 accent → 调色纸面 + 暗铜），
   card 不再比 bg 白一整档，避免「发光感」；贴「冷白、细线框、暗铜」审美 */
export const PRESETS = {
  dark:  { bg: '#141313', card: '#1E1D1E', accent: '#CD5B85', text: '#F0EFF0' },
  light: { bg: '#F2F3F0', card: '#FAFAF8', accent: '#8C6335', text: '#1C1B19' },
  paper: { bg: '#F4EFE6', card: '#FAF6EE', accent: '#96683C', text: '#2A241C' },
  ink:   { bg: '#0F1418', card: '#161C21', accent: '#4FA3C7', text: '#E6EDF3' },
  blush: { bg: '#F6EEEF', card: '#FBF7F7', accent: '#A5576C', text: '#2B2225' },
};

/* ── HSL 工具：用于暗/亮联动派生（纯）── */
function hexToRgb01(h) {
  const m = /^#([0-9a-f]{6})$/i.exec(h || '');
  if (!m) return [0.078, 0.075, 0.075];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
function rgb01ToHex(c) {
  const f = (x) => Math.max(0, Math.min(255, Math.round(x * 255))).toString(16).padStart(2, '0');
  return '#' + f(c[0]) + f(c[1]) + f(c[2]);
}
function rgb01ToHsl(c) {
  const [r, g, b] = c;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h *= 60;
  }
  return [h, s, l];
}
function hslToRgb01(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return [r + m, g + m, b + m];
}
function mix01(a, b, t) { return a.map((v, i) => v + (b[i] - v) * t); }

/**
 * 联动派生：从一套关键色推出对立外观的关键色。
 * mode: 'same-hue'（保留 hue，把明度推到目标外观典型区间）
 *       | 'inverse'（RGB 反相）
 *       | 'complement'（色相 +180°）。
 * 纯函数，可单测：inverse(inverse(x))===x，complement 同理，same-hue 保留 hue。
 */
export function deriveKeyColors({ bg, card, accent, text }, fromAppearance, mode = 'same-hue') {
  const target = fromAppearance === 'dark' ? 'light' : 'dark';
  const flip = (h) => rgb01ToHex([...hexToRgb01(h)].map((v) => 1 - v));
  if (mode === 'inverse') {
    return { bg: flip(bg), card: flip(card), accent: flip(accent), text: flip(text) };
  }
  if (mode === 'complement') {
    const rot = (h) => { const [hh, ss, ll] = rgb01ToHsl(hexToRgb01(h)); return rgb01ToHex(hslToRgb01(hh + 180, ss, ll)); };
    return { bg: rot(bg), card: rot(card), accent: rot(accent), text: rot(text) };
  }
  // same-hue（默认）：保留 hue，把明度推到目标外观的典型区间
  const toward = (h, wantL) => {
    const [hh, ss] = rgb01ToHsl(hexToRgb01(h));
    const s2 = Math.max(ss, 0.08);
    return rgb01ToHex(hslToRgb01(hh, s2, wantL));
  };
  if (target === 'light') {
    return { bg: toward(bg, 0.93), card: toward(card, 0.98), accent: toward(accent, 0.42), text: toward(text, 0.12) };
  }
  return { bg: toward(bg, 0.07), card: toward(card, 0.12), accent: toward(accent, 0.62), text: toward(text, 0.92) };
}

/**
 * 组装一套 variant（纯：背景图数据从外部传入，不碰 DOM）。
 * 返回 { appearance, colors, background?, material, frame }，与规格 §1 variant 形状一致。
 */
export function buildVariant({ bg, card, accent, text, appearance, bgImage, alpha, pos, radius, rim, blur }) {
  const colors = deriveColors({ bg, card, accent, text });
  if (typeof radius === 'number') {
    colors['--radius-input'] = radius + 'px';
    colors['--radius-card'] = radius + 'px';
    colors['--radius-chat-card'] = Math.max(0, radius - 2) + 'px';
    colors['--radius-chat-surface'] = radius + 'px';
  }
  const isLight = appearance === 'light';
  const variant = {
    appearance,
    colors,
    material: {
      tier: 'bold',
      edge: isLight ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.22)',
      rim: typeof rim === 'number' ? rim : (isLight ? 0.12 : 0.26),
      blur: typeof blur === 'number' ? blur : 26,
    },
    frame: { kind: 'none' },
  };
  if (bgImage && bgImage.data) {
    variant.background = {
      asset: bgImage.data,
      fit: 'cover',
      position: pos || '50% 50%',
      panelAlpha: typeof alpha === 'number' ? alpha : 0.6,
      cardAlpha: typeof alpha === 'number' ? Math.max(0.2, Number((alpha - 0.1).toFixed(2))) : 0.5,
      tint: null,
      motion: { mode: bgImage.motion === 'animated-image' ? 'animated-image' : 'none' },
    };
    if (bgImage.poster) variant.background.poster = bgImage.poster;
  }
  return variant;
}

/**
 * 背景预览描述（纯）：动图返回 { tag:'img', src }（Chromium 里 <img> 真会动），
 * 静态返回 { tag:'css', style }（CSS 背景，供 canvas 之外的静态缩略）。
 * 验收 7 要求预览确实在动 —— 必须用 <img src=dataURI>，不能用静态 canvas 缩略。
 */
export function buildBgPreviewDescriptor({ data, motion, alpha, color, pos }) {
  if (motion === 'animated-image' && data) {
    return { tag: 'img', src: data, animated: true };
  }
  const a = typeof alpha === 'number' ? alpha : 0.6;
  const [r, g, b] = hex2rgb(color || '#141313');
  return {
    tag: 'css',
    style: {
      backgroundImage: `linear-gradient(rgba(${r},${g},${b},${a}), rgba(${r},${g},${b},${a})), url("${data}")`,
      backgroundSize: 'cover',
      backgroundPosition: pos || '50% 50%',
    },
    animated: false,
  };
}

/**
 * 统一校验：v1（themes 数组）/ v2（theme 单对象）/ v3（theme.variants）。
 * 返回 { ok, errors, warnings, schema, form }。form ∈ 'v3-variants'|'v2-single'|'v1-themes'。
 * 规格 §1：variants 存在 → 双套路线；不存在 → v2 老路。§2.3：动图体积与单包体积都要挡。
 */
export function validateSkinPack(json) {
  const errors = [], warnings = [];
  if (!json || typeof json !== 'object') return { ok: false, errors: ['不是有效的 JSON 对象'], warnings, schema: null, form: null };
  if (!json.packId) errors.push('缺 packId');

  const schema = json.schema || null;
  let form = null;
  if (json.theme && Array.isArray(json.theme.variants) && json.theme.variants.length) form = 'v3-variants';
  else if (json.theme && typeof json.theme === 'object') form = 'v2-single';
  else if (Array.isArray(json.themes)) form = 'v1-themes';

  if (!form) errors.push('既没有 theme.variants / theme 也没有 themes');

  if (form === 'v3-variants') {
    const variants = json.theme.variants;
    if (variants.length !== 2) warnings.push('variants 建议包含两个（dark+light）；当前 ' + variants.length);
    const seen = new Set();
    for (const v of variants) {
      if (!v || typeof v !== 'object') { errors.push('variant 不是对象'); continue; }
      if (v.appearance !== 'light' && v.appearance !== 'dark') {
        errors.push('variant.appearance 必须是 light/dark，实为 ' + JSON.stringify(v.appearance));
      } else {
        if (seen.has(v.appearance)) errors.push('variant.appearance 重复：' + v.appearance);
        seen.add(v.appearance);
      }
      if (!v.colors || typeof v.colors !== 'object') errors.push('variant.colors 缺失');
      const bg = v.background;
      if (bg && bg.asset) {
        const c = checkImageFile({ bytes: dataUriBytes(bg.asset) });
        if (!c.ok) errors.push('variant(' + v.appearance + ') 背景：' + c.errors.join('；'));
      }
    }
    if (seen.size === 1) warnings.push('只有一个 variant，按老包（单套）处理，不生成双套');
    const ad = json.theme.adaptive;
    if (ad && ad.mode && !['auto', 'manual'].includes(ad.mode)) {
      errors.push('adaptive.mode 只接受 auto/manual，实为 ' + JSON.stringify(ad.mode));
    }
    if (ad && ad.mode === 'auto' && seen.size < 2) warnings.push('adaptive.mode=auto 但 variant 不足两个，忽略 auto');
  } else if (form === 'v2-single') {
    if (!json.theme.colors || typeof json.theme.colors !== 'object') errors.push('theme.colors 缺失');
    const bg = json.theme.background;
    if (bg && bg.asset) {
      const c = checkImageFile({ bytes: dataUriBytes(bg.asset) });
      if (!c.ok) errors.push('背景：' + c.errors.join('；'));
    }
  } else if (form === 'v1-themes') {
    warnings.push('这是 v1 包（配色层），导入后只保留配色');
    if (!json.themes.length) errors.push('themes 为空');
  }

  // 单包体积（始终再挡一道）
  const budget = checkPackBudget(json);
  if (!budget.ok) errors.push('单包体积：' + budget.errors.join('；'));

  return { ok: errors.length === 0, errors, warnings, schema, form };
}
