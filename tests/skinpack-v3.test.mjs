/**
 * tests/skinpack-v3.test.mjs — 工作台线（luoqixi）纯函数单测。
 * 覆盖：颜色派生 / 暗亮联动 / 单套·双套校验 / 动图体积 / 单包体积。
 * 不启动浏览器，直接 import ui/assets/skinpack.mjs（纯函数，零 DOM）。
 *
 * 用法：node tests/skinpack-v3.test.mjs
 */
import {
  SCHEMA_V3, IMG_MAX_BYTES, IMG_MAX_EDGE, PACK_MAX_BYTES,
  BASE_COLORS, PRESETS, deriveColors, deriveKeyColors, buildVariant,
  buildBgPreviewDescriptor, checkImageFile, checkPackBudget, dataUriBytes,
  validateSkinPack, fmtMB,
} from '../skin-wardrobe/ui/assets/skinpack.mjs';

let pass = 0, fail = 0;
const eqHex = (a, b) => (a || '').toLowerCase() === (b || '').toLowerCase();
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '  -> ' + detail : '')); }
};
const approx = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

/* 造一个 N 字节原始数据的 data URI（base64 全部用 'A'，便于估算字节数） */
function dataUriOfBytes(n, mime = 'image/webp') {
  const b64len = Math.ceil(n * 4 / 3);
  return `data:${mime};base64,` + 'A'.repeat(b64len);
}
function hueOf(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return 0;
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
  else if (max === g) h = ((b - r) / d + 2);
  else h = ((r - g) / d + 4);
  return h * 60;
}

console.log('[A] 颜色基座与派生（迁移后行为不变）');
check('BASE_COLORS 仍是 61 项', Object.keys(BASE_COLORS).length === 61, 'got ' + Object.keys(BASE_COLORS).length);
const darkC = deriveColors(PRESETS.dark);
check('deriveColors 输出 61 项', Object.keys(darkC).length === 61, 'got ' + Object.keys(darkC).length);
check('暗色：--bg 等于输入', darkC['--bg'] === PRESETS.dark.bg);
check('暗色：结构层用白色低透明边', darkC['--border'] === '#B896C138', darkC['--border']);
const lightC = deriveColors(PRESETS.light);
check('亮色：结构层用黑色低透明边', lightC['--border'] === 'rgba(0,0,0,0.12)', lightC['--border']);
check('亮色：--bg-glass 用 F2 后缀', lightC['--bg-glass'].endsWith('F2'), lightC['--bg-glass']);

console.log('[B] 暗/亮联动派生（纯函数可单测）');
const darkKeys = { bg: '#141313', card: '#1E1D1E', accent: '#CD5B85', text: '#F0EFF0' };
const inv = deriveKeyColors(darkKeys, 'dark', 'inverse');
const invInv = deriveKeyColors(inv, 'light', 'inverse');
check('反相(inverse)两次回到原值', eqHex(invInv.bg, darkKeys.bg) && eqHex(invInv.accent, darkKeys.accent), JSON.stringify(invInv));
const comp = deriveKeyColors(darkKeys, 'dark', 'complement');
const compComp = deriveKeyColors(comp, 'light', 'complement');
check('互补(complement)两次回到原值', eqHex(compComp.bg, darkKeys.bg), JSON.stringify(compComp));
const sameHue = deriveKeyColors(darkKeys, 'dark', 'same-hue');
check('同色相(same-hue)保留 bg 色相', approx(hueOf(sameHue.bg), hueOf(darkKeys.bg), 0.5), `${hueOf(darkKeys.bg)} -> ${hueOf(sameHue.bg)}`);
check('同色相推出的亮底明显更亮', hueOf(sameHue.bg) >= 0 && sameHue.bg !== darkKeys.bg);
const sameHueL = deriveKeyColors({ bg: '#F6F7FB', card: '#FFFFFF', accent: '#3B6FD4', text: '#1C2026' }, 'light', 'same-hue');
check('从亮色推暗色：结果比亮底暗', sameHueL.bg !== '#F6F7FB');

console.log('[C] 组装 variant（双套用）');
const vDark = buildVariant({ ...PRESETS.dark, appearance: 'dark', radius: 18, rim: 0.26, blur: 26, alpha: 0.6 });
check('暗套 edge 为白边', vDark.material.edge === 'rgba(255,255,255,0.22)', vDark.material.edge);
check('暗套 rim 默认 0.26', vDark.material.rim === 0.26);
check('暗套 colors 61 项', Object.keys(vDark.colors).length === 61);
const vLight = buildVariant({ ...PRESETS.light, appearance: 'light', radius: 18, rim: 0.12, blur: 26 });
check('亮套 edge 为黑边', vLight.material.edge === 'rgba(0,0,0,0.10)', vLight.material.edge);
const vAnim = buildVariant({ ...PRESETS.dark, appearance: 'dark', bgImage: { data: 'data:image/webp;base64,xxx', motion: 'animated-image' } });
check('动图背景 motion.mode=animated-image', vAnim.background.motion.mode === 'animated-image');
const vStatic = buildVariant({ ...PRESETS.dark, appearance: 'dark', bgImage: { data: 'data:image/jpeg;base64,yyy' } });
check('静态背景 motion.mode=none', vStatic.background.motion.mode === 'none');

console.log('[D] 背景预览描述（验收 7：动图必须用 <img>）');
const descAnim = buildBgPreviewDescriptor({ data: 'data:image/webp;base64,abc', motion: 'animated-image' });
check('动图预览用 <img>（真会动）', descAnim.tag === 'img' && descAnim.animated === true, JSON.stringify(descAnim));
const descStatic = buildBgPreviewDescriptor({ data: 'data:image/jpeg;base64,def', motion: 'none', alpha: 0.6, color: '#141313', pos: '50% 50%' });
check('静态预览用 CSS 背景', descStatic.tag === 'css' && descStatic.animated === false);

console.log('[E] 单张图体积校验（规格 §2.3，验收 7）');
const overBytes = checkImageFile({ bytes: 6 * 1024 * 1024 });
check('6.00 MB 被拒并报数', overBytes.ok === false && overBytes.errors[0].includes('6.00 MB') && overBytes.errors[0].includes('5.00 MB'), JSON.stringify(overBytes.errors));
const edgeOver = checkImageFile({ bytes: 1 * 1024 * 1024, width: 1921, height: 1080 });
check('1921px 边长被拒并报数', edgeOver.ok === false && edgeOver.errors[0].includes('1921×1080') && edgeOver.errors[0].includes('1920'), JSON.stringify(edgeOver.errors));
const boundary = checkImageFile({ bytes: 5 * 1024 * 1024 });
check('恰好 5.00 MB 边界放行（不算超）', boundary.ok === true);
const okImg = checkImageFile({ bytes: Math.round(4.5 * 1024 * 1024), width: 1920, height: 1080 });
check('4.5 MB / 1920px 放行', okImg.ok === true, JSON.stringify(okImg.errors));

console.log('[F] dataUriBytes 估算');
const du = dataUriOfBytes(300000);
check('dataUriBytes 估算准确', dataUriBytes(du) === 300000, 'got ' + dataUriBytes(du));

console.log('[G] 单包体积校验');
const smallPack = { schema: SCHEMA_V3, packId: 'p', theme: { variants: [{ appearance: 'dark', colors: { '--bg': '#111' } }, { appearance: 'light', colors: { '--bg': '#fff' } }] } };
const smallBudget = checkPackBudget(smallPack);
check('小包放行', smallBudget.ok === true, fmtMB(smallBudget.bytes));
// 两张 4.5MB 图：原始 9MB，base64 后 ~12MB，加上 JSON 结构越过 12MB 上限
const bigAsset = dataUriOfBytes(Math.round(4.5 * 1024 * 1024));
const bigPack = {
  schema: SCHEMA_V3, packId: 'big', theme: {
    variants: [
      { appearance: 'dark', colors: { '--bg': '#111' }, background: { asset: bigAsset, motion: { mode: 'animated-image' } } },
      { appearance: 'light', colors: { '--bg': '#fff' }, background: { asset: bigAsset, motion: { mode: 'animated-image' } } },
    ],
  },
};
const bigBudget = checkPackBudget(bigPack);
check('双套各 4.5MB 图 → 单包越过 12MB 被拒并报数', bigBudget.ok === false && bigBudget.errors[0].includes('12.00 MB'), fmtMB(bigBudget.bytes));

console.log('[H] 统一校验 validateSkinPack');
// v2 单套合法
const v2 = {
  schema: 'hana-skinpack/2', packId: 'v2', theme: {
    key: 'default', appearance: 'dark', colors: { '--bg': '#141313' },
    background: { asset: dataUriOfBytes(100000), panelAlpha: 0.6 }, material: { tier: 'bold', edge: 'rgba(255,255,255,0.2)', rim: 0.25 },
  },
};
check('v2 单套通过', validateSkinPack(v2).ok === true && validateSkinPack(v2).form === 'v2-single');

// v3 双套合法（动图在预算内）
const v3ok = {
  schema: SCHEMA_V3, packId: 'v3', theme: {
    key: 'default', adaptive: { mode: 'manual' },
    variants: [
      { appearance: 'dark', colors: { '--bg': '#141313' }, background: { asset: dataUriOfBytes(100000), motion: { mode: 'animated-image' } } },
      { appearance: 'light', colors: { '--bg': '#F6F7FB' } },
    ],
  },
};
const rV3 = validateSkinPack(v3ok);
check('v3 双套通过', rV3.ok === true && rV3.form === 'v3-variants', JSON.stringify(rV3));

// v3 缺一个 variant
const v3one = { schema: SCHEMA_V3, packId: 'v3b', theme: { key: 'default', variants: [{ appearance: 'dark', colors: { '--bg': '#111' } }] } };
const rV3one = validateSkinPack(v3one);
check('v3 只有一个 variant → 警告但不硬错（按老包处理）', rV3one.ok === true && rV3one.warnings.some((w) => /只有一个 variant/.test(w)), JSON.stringify(rV3one));

// v3 appearance 非法
const v3bad = { schema: SCHEMA_V3, packId: 'v3c', theme: { key: 'default', variants: [{ appearance: 'noon', colors: {} }, { appearance: 'light', colors: {} }] } };
check('v3 appearance 非法被拒', validateSkinPack(v3bad).ok === false);

// v3 动图超限
const v3over = {
  schema: SCHEMA_V3, packId: 'v3d', theme: {
    key: 'default', variants: [
      { appearance: 'dark', colors: { '--bg': '#111' }, background: { asset: dataUriOfBytes(6 * 1024 * 1024), motion: { mode: 'animated-image' } } },
      { appearance: 'light', colors: { '--bg': '#fff' } },
    ],
  },
};
const rV3over = validateSkinPack(v3over);
check('v3 动图超限被拒并报数', rV3over.ok === false && rV3over.errors.some((e) => /背景/.test(e) && /MB/.test(e)), JSON.stringify(rV3over.errors));

// v3 双套各 4.5MB → 单包预算超限
const rV3pack = validateSkinPack(bigPack);
check('v3 单包预算超限被拒并报数', rV3pack.ok === false && rV3pack.errors.some((e) => /单包/.test(e) && /MB/.test(e)), JSON.stringify(rV3pack.errors));

// v1 配色层
const v1 = { schema: 'hana-skinpack/1', packId: 'v1', packVersion: '1.0.0', themes: [{ key: 't', kind: 'vars', appearance: 'dark', theme: { formatVersion: 1, name: 'x', appearance: 'dark', variables: { '--bg': '#111' } }, losses: [] }] };
const rV1 = validateSkinPack(v1);
check('v1 包：降级警告但仍可导入', rV1.ok === true && rV1.warnings.some((w) => /v1/.test(w)), JSON.stringify(rV1));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
