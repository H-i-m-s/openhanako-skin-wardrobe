import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFakeHome, runExec, OLD_PACKAGE, cleanup } from './_harness.mjs';

const { home } = buildFakeHome({
  packages: [OLD_PACKAGE],
  pending: [{ id: 'b1', op: 'enable', packId: OLD_PACKAGE.packId }],
});
const r = runExec(home, []); // 编辑后 · 干跑
const baseline = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'old-dryrun-baseline.txt'), 'utf8');

console.log('== 编辑后干跑输出 ==');
console.log(r.stdout);
if (r.stderr) console.log('STDERR:\n' + r.stderr);

const a = baseline.replace(/\r\n/g, '\n');
const b = r.stdout.replace(/\r\n/g, '\n');
const ok = a === b;
console.log('\n== #5 回归对照 ==');
console.log('基线字节:', a.length, ' 编辑后字节:', b.length, ' 一致:', ok);
if (!ok) {
  const al = a.split('\n'), bl = b.split('\n');
  for (let i = 0; i < Math.max(al.length, bl.length); i++) {
    if (al[i] !== bl[i]) console.log(`行 ${i + 1}\n  基线: ${JSON.stringify(al[i])}\n  编辑: ${JSON.stringify(bl[i])}`);
  }
}
cleanup(home);
process.exit(ok ? 0 : 1);
