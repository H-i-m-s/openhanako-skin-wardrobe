/**
 * finish-marketplace.cjs —— 收尾：分支 approvals -> v0.6.7，PR#150 标题与正文同步
 */
const fs = require('fs');
const crypto = require('crypto');
const { execSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve('.');
const REF = process.env.MP_REF || 'main';
const gh = (cmd) => execSync(cmd, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();

console.log('1) 读 fork approvals（分支: ' + REF + '）');
const rawB64 = gh('gh api "repos/Yuexiye/hana-marketplace/contents/approvals.json?ref=' + REF + '" --jq .content');
const apr = JSON.parse(Buffer.from(rawB64.replace(/\s/g, ''), 'base64').toString('utf8'));
const curSha = gh('gh api "repos/Yuexiye/hana-marketplace/contents/approvals.json?ref=' + REF + '" --jq .sha').trim();

console.log('2) 更新 skin-wardrobe -> v0.6.7');
const zip = fs.readFileSync(path.join(ROOT, 'dist', 'app-skin-wardrobe-0.6.7.zip'));
const sha256 = crypto.createHash('sha256').update(zip).digest('hex');
const hit = apr.approvals.find((a) => a.id === 'skin-wardrobe');
if (hit) {
  hit.tag = 'v0.6.7';
  hit.sha256 = sha256;
} else {
  apr.approvals.push({ kind: 'app', id: 'skin-wardrobe', tag: 'v0.6.7', sha256: sha256 });
}

console.log('3) PUT 回 fork（sha: ' + curSha.slice(0, 12) + '...）');
const putBody = path.join(ROOT, 'dist', 'gh-put-approvals.json');
fs.writeFileSync(putBody, JSON.stringify({
  message: 'chore: skin-wardrobe -> v0.6.7（封面定稿）',
  content: Buffer.from(JSON.stringify(apr, null, 2) + '\n', 'utf8').toString('base64'),
  sha: curSha,
  branch: REF,
}));
console.log('  ' + gh('gh api -X PUT repos/Yuexiye/hana-marketplace/contents/approvals.json --input "' + putBody + '" --jq .commit.sha').slice(0, 12));

console.log('4) PR#150 标题 + 正文 -> v0.6.7');
const origBody = gh('gh api repos/liliMozi/hana-marketplace/pulls/150 --jq .body').split('\r').join('');
const newBody = origBody
  .split('v0.6.3').join('v0.6.7')
  .split('app-skin-wardrobe-0.6.3').join('app-skin-wardrobe-0.6.7');
const patchBody = path.join(ROOT, 'dist', 'gh-patch-pr150.json');
fs.writeFileSync(patchBody, JSON.stringify({
  title: 'Register app: skin-wardrobe（衣橱 · 皮肤库）v0.6.7',
  body: newBody,
}));
console.log('  ' + gh('gh api -X PATCH repos/liliMozi/hana-marketplace/pulls/150 --input "' + patchBody + '" --jq .title').slice(0, 70));

console.log('\n完成。PR150 分支 approvals 已到 v0.6.7，标题与正文同步。');
