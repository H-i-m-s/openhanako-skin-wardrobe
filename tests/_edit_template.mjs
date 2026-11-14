import { readFileSync, writeFileSync } from 'node:fs';
const p = 'W:/Games/Hanako/Work/projects/hana-skin-app/patch/src/background-luna/dark.css';
const t = readFileSync(p, 'utf8');
const before = (t.match(/rgba\(20, 19, 19/g) || []).length;
const after = t.split('rgba(20, 19, 19').join('rgba(var(--bg-rgb)');
const varCount = (after.match(/rgba\(var\(--bg-rgb\)/g) || []).length;
// 同步把层序注释里提到的旧写法也顺势保留——不动 rgb( 无 alpha 的注释实例（非 scrim）。
writeFileSync(p, after, 'utf8');
console.log('rgba(20, 19, 19 实例:', before, '→ var 形态实例:', varCount, '字节:', t.length, '→', after.length);
