/**
 * tests/_capture_baseline.mjs —— 在改动前用【原始】执行器抓老包干跑基线。
 * 仅运行一次（编辑 wardrobe-exec.mjs / dark.css 之前），产物供 executor.test.mjs 的 #5 对照。
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFakeHome, runExec, OLD_PACKAGE } from './_harness.mjs';

const { home } = buildFakeHome({
  packages: [OLD_PACKAGE],
  pending: [{ id: 'b1', op: 'enable', packId: OLD_PACKAGE.packId }],
});

const r = runExec(home, []); // 干跑
const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
mkdirSync(fixturesDir, { recursive: true });
writeFileSync(join(fixturesDir, 'old-dryrun-baseline.txt'), r.stdout, 'utf8');
console.log('exit=' + r.code + ' bytes=' + r.stdout.length);
if (r.stderr) console.log('STDERR:\n' + r.stderr);
console.log('----- baseline stdout -----');
console.log(r.stdout);
