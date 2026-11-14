/**
 * scripts/wallpaper/make-wallpaper-pack.mjs —— 动态壁纸管线（一条命令出包）
 *
 *   视频文件 → 裁顶/缩放/抽帧 → 溶解循环 → animated WebP → SKINPACK 包 → 衣橱库存
 *
 * 用法：
 *   node scripts/wallpaper/make-wallpaper-pack.mjs --video <视频文件> --pack-id <id> --name-zh <名称> [选项]
 *
 * 常用选项：
 *   --start 6          从第几秒开始取段（默认 6）
 *   --dur 10           取段时长秒（默认 10）
 *   --crop-top 110     裁掉顶部像素（默认 110：去 B站/UP主水印行）
 *   --fps 10           帧率（默认 10；帧数上限见 SPEC §2.3 备注）
 *   --width 800        输出宽度（默认 800，高度按比例偶数化）
 *   --quality 42       WebP 质量（默认 42）
 *   --dissolve 8       溶解帧数（默认 8；天然周期素材可给 0）
 *   --appearance dark  dark | light（默认 dark）
 *   --bg/--card/--accent/--text  四个关键色（默认 HUD 暗色系）
 *   --alpha 0.55       遮罩强度 panelAlpha
 *   --credit "出处…"   写进包描述（来源视频请务必带上原作者与授权）
 *   --enqueue          追加启用待办（之后跑「执行待办」或让 agent 执行）
 *
 * 依赖：ffmpeg（PATH）、python + Pillow。
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');

const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : def;
};
const flag = (name) => process.argv.includes('--' + name);

const video = arg('video');
const packId = arg('pack-id');
if (!video || !packId) { console.error('用法: node scripts/wallpaper/make-wallpaper-pack.mjs --video <文件> --pack-id <id> --name-zh <名称>'); process.exit(2); }
if (!/^[A-Za-z0-9_.-]+$/.test(packId)) { console.error('packId 只允许字母数字 _ . -'); process.exit(2); }
if (!existsSync(video)) { console.error('视频不存在：' + video); process.exit(2); }

const nameZh = arg('name-zh', packId);
const nameEn = arg('name-en', packId);
const start = arg('start', '6');
const dur = arg('dur', '10');
const cropTop = arg('crop-top', '110');
const fps = arg('fps', '10');
const width = arg('width', '800');
const quality = arg('quality', '42');
const dissolve = arg('dissolve', '8');
const appearance = arg('appearance', 'dark') === 'light' ? 'light' : 'dark';
const alpha = arg('alpha', '0.55');
const credit = arg('credit', '');

const { SCHEMA_V2, buildVariant, validateSkinPack, checkPackBudget, fmtMB } =
  await import(pathToFileURL(join(REPO, 'skin-wardrobe', 'ui', 'assets', 'skinpack.mjs')).href);

/* 1+2. 抽帧 → 编码 → 自适应压体积（质量 ↓ → 宽度 ↓ → 帧率 ↓，直到 data URI 进预算） */
const work = join(tmpdir(), 'wdress-' + packId + '-' + Date.now().toString(36));
mkdirSync(work, { recursive: true });
// data URI 长度目标：默认 3.8MB（贴 Luna 实测可用的 3.93 安全线内侧）；硬上限 IMG_MAX_BYTES=5MB
const TARGET_URI = Number(arg('target-mb', '3.8')) * 1024 * 1024;

function extract(w, f) {
  const framesDir = join(work, 'frames-' + w + 'x' + f);
  mkdirSync(framesDir, { recursive: true });
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
    '-ss', String(start), '-t', String(dur), '-i', video,
    '-vf', `crop=iw:ih-${cropTop}:0:${cropTop},scale=${w}:-2,fps=${f}`,
    '-q:v', '2', join(framesDir, 'f%03d.png')], { stdio: 'inherit' });
  const n = readdirSync(framesDir).filter((x) => x.endsWith('.png')).length;
  if (n < 2) { console.error('抽帧失败：只有 ' + n + ' 帧'); process.exit(1); }
  return { framesDir, n };
}

function encode(framesDir, q, d, f) {
  const webp = join(work, 'out.webp');
  const poster = join(work, 'poster.jpg');
  execFileSync('python', [join(REPO, 'skin-wardrobe', 'assets', 'wallpaper', 'webp_loop.py'), framesDir, webp, poster,
    String(d), String(q), String(f)], { stdio: 'inherit' });
  // data URI = base64 = 原字节数 × 4/3
  const uriBytes = Math.ceil(readFileSync(webp).length * 4 / 3);
  return { webp, poster, uriBytes };
}

// 阶梯：先用用户给的参数；超预算就 降质量 → 降宽度 → 降帧率，逐档试到进预算
const ladder = [{ w: Number(width), f: Number(fps), q: Number(quality) }];
{
  let w = Number(width), f = Number(fps), q = Number(quality);
  for (let step = 0; step < 10; step++) {
    q -= 8;
    if (q < 28) { q = 40; w = Math.max(640, w - 96); f = Math.max(6, f - 2); }
    ladder.push({ w, f, q });
  }
}

let chosen = null;
for (const L of ladder) {
  const { framesDir, n } = extract(L.w, L.f);
  const enc = encode(framesDir, L.q, Number(dissolve), L.f);
  console.log(`尝试 ${L.w} 宽 / ${L.f}fps / q${L.q} → ${n}+${dissolve} 帧，URI ${(enc.uriBytes / 1024 / 1024).toFixed(2)} MB`);
  chosen = { ...enc, L, frames: n };
  if (enc.uriBytes <= TARGET_URI) break;
}
if (chosen.uriBytes > TARGET_URI) console.log('⚠️ 阶梯用尽仍未达目标，采用最小一档；若仍嫌大，缩短 --dur 或降 --width。');
if (chosen.uriBytes > 5 * 1024 * 1024) {
  console.error('压不进硬上限（>5MB），终止。请缩短 --dur。');
  process.exit(1);
}
const webp = chosen.webp;
const poster = chosen.poster;
console.log(`采用：${chosen.L.w} 宽 / ${chosen.L.f}fps / q${chosen.L.q}（URI ${(chosen.uriBytes / 1024 / 1024).toFixed(2)} MB）`);

/* 3. 组包 */
const uri = (p, mime) => 'data:' + mime + ';base64,' + readFileSync(p).toString('base64');
const v = buildVariant({
  bg: arg('bg', '#0E0E10'), card: arg('card', '#16161A'),
  accent: arg('accent', '#C97987'), text: arg('text', '#E9E8E6'),
  appearance,
  bgImage: { data: uri(webp, 'image/webp'), poster: uri(poster, 'image/jpeg'), motion: 'animated-image' },
  alpha: Number(alpha), pos: '50% 50%',
});

const desc = [
  arg('desc', `动态壁纸：${nameZh}（${dur}s 无缝循环，${chosen.frames + Number(dissolve)} 帧 @${chosen.L.f}fps，${chosen.L.w} 宽）`),
  credit ? '来源：' + credit : '',
  '通过衣橱动态壁纸管线生成（scripts/wallpaper/）',
].filter(Boolean).join('；');

const pack = {
  schema: SCHEMA_V2,
  packId,
  packVersion: '1.0.0',
  names: { zh: nameZh, en: nameEn },
  description: desc,
  tags: ['动图', appearance === 'light' ? '亮色' : '暗色', ...String(arg('tags', '')).split(',').filter(Boolean)],
  group: arg('group', '动态壁纸'),
  favorite: flag('fav'),
  source: { kind: 'derived', publisher: 'local', license: credit ? '见描述（第三方素材）' : 'self-made' },
  theme: {
    key: 'default',
    appearance,
    colors: v.colors,
    background: v.background,
    material: v.material,
  },
};

const r = validateSkinPack(pack);
const b = checkPackBudget(pack);
console.log('校验：' + (r.ok ? 'valid' : 'INVALID ' + JSON.stringify(r.errors || r)));
console.log('体积：' + fmtMB(b.bytes ?? 0) + (b.ok === false ? ' —— 超预算，终止' : ''));
if (!r.ok || b.ok === false) process.exit(1);

/* 4. 写库存 + 可选入队 */
const dataDir = join(homedir(), '.hanako', 'app-data', 'skin-wardrobe');
const dir = join(dataDir, 'skins', packId);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'skin.json'), JSON.stringify(pack), 'utf8');
console.log('已写入库存：' + join(dir, 'skin.json'));

if (flag('enqueue')) {
  const pendingPath = join(dataDir, 'pending.json');
  const list = existsSync(pendingPath) ? JSON.parse(readFileSync(pendingPath, 'utf8')) : [];
  if (!list.some((x) => x.packId === packId && x.op === 'enable' && !x.done)) {
    list.push({ id: 'op_' + packId + '_' + Date.now().toString(36), op: 'enable', packId, at: new Date().toISOString(), done: false });
    writeFileSync(pendingPath, JSON.stringify(list, null, 2), 'utf8');
    console.log('已追加启用待办（跑「执行待办」后重启 Hana 生效）');
  }
}

/* 5. 清理中间帧 */
rmSync(work, { recursive: true, force: true });
console.log('中间产物已清理。');
