/**
 * scripts/build-demo-v3.mjs — 造一张 v3 演示包（暗/亮双套 + 动图壁纸），直接写进衣橱库存。
 *
 * 用法：node scripts/build-demo-v3.mjs
 *
 * 为什么要有它：现有 4 个库存皮肤都是 v2 单套，装上 0.7.0 也看不到新东西。
 * 这张包把「双套 + 动图」两件事同时摆出来，用来肉眼验收。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  SCHEMA_V3, buildVariant, validateSkinPack, checkPackBudget, fmtMB,
} from '../skin-wardrobe/ui/assets/skinpack.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'assets-src', 'demo-v3');
const DATA = join(homedir(), '.hanako', 'app-data', 'skin-wardrobe', 'skins');

const DATA_URI = {
  webp: 'data:image/webp;base64,',
  jpg: 'data:image/jpeg;base64,',
};
const asDataUri = (file, mime) => {
  const p = join(SRC, file);
  if (!existsSync(p)) throw new Error('缺素材：' + p);
  return DATA_URI[mime] + readFileSync(p).toString('base64');
};

const darkBg = {
  data: asDataUri('demo-dark.webp', 'webp'),
  poster: asDataUri('demo-dark-poster.jpg', 'jpg'),
  motion: 'animated-image',
};
const lightBg = {
  data: asDataUri('demo-light.webp', 'webp'),
  poster: asDataUri('demo-light-poster.jpg', 'jpg'),
  motion: 'animated-image',
};

const dark = buildVariant({
  bg: '#141313', card: '#1E1D1E', accent: '#CD5B85', text: '#F0EFF0',
  appearance: 'dark', bgImage: darkBg, alpha: 0.6, pos: '50% 50%', radius: 18, rim: 0.26, blur: 26,
});
const light = buildVariant({
  bg: '#F6F3EC', card: '#FFFFFF', accent: '#A8455F', text: '#1C1A18',
  appearance: 'light', bgImage: lightBg, alpha: 0.72, pos: '50% 50%', radius: 18, rim: 0.12, blur: 26,
});

const pack = {
  schema: SCHEMA_V3,
  packId: 'demo-dual-aurora',
  packVersion: '1.0.0',
  names: { zh: '双生 · 极光', en: 'Twin Aurora' },
  description: '演示包：暗/亮双套 + 动图壁纸（animated WebP，带 poster 降级）',
  tags: ['双套', '动图', '演示'],
  group: '演示',
  favorite: true,
  source: { kind: 'original', publisher: 'local', license: 'unspecified' },
  theme: {
    key: 'default',
    variants: [dark, light],
    adaptive: { mode: 'manual' },
  },
};

const v = validateSkinPack(pack);
const b = checkPackBudget(pack);
console.log('校验：' + (v.ok ? 'valid' : 'INVALID'));
if (!v.ok) console.log(JSON.stringify(v, null, 2));
for (const w of (v.warnings || [])) console.log('  warning: ' + w);
console.log('体积：' + fmtMB(b.bytes || 0) + ' / ' + fmtMB(b.limit || 0) + (b.ok ? ' 预算内' : ' 超预算'));
if (!v.ok) process.exit(1);
if (b.ok === false) process.exit(1);

const dir = join(DATA, pack.packId);
mkdirSync(dir, { recursive: true });
const out = join(dir, 'skin.json');
writeFileSync(out, JSON.stringify(pack), 'utf8');
console.log('已写入：' + out);
console.log('  暗套 --bg=' + dark.colors['--bg'] + '  亮套 --bg=' + light.colors['--bg']);
console.log('  暗套图 ' + Math.round(darkBg.data.length * 0.75 / 1024) + ' KB，亮套图 ' + Math.round(lightBg.data.length * 0.75 / 1024) + ' KB');
