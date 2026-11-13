// 仅做分发完整性、语法和课程数据的基本检查，不代替浏览器或教学验收。
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { modules, lessons } from '../src/curriculum.js';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.permissions, undefined);
assert.equal(manifest.host_permissions, undefined);
for (const path of ['index.html', 'styles.css', manifest.background.service_worker, ...Object.values(manifest.icons)]) assert.ok(existsSync(resolve(root,path)), '缺少分发文件：'+path);
for (const path of ['background.js','src/app.js','src/curriculum.js','src/lab.js','src/world.js','scripts/check.mjs']) execFileSync(process.execPath, ['--check',resolve(root,path)], { stdio: 'pipe' });
assert.equal(modules.length, 7);
assert.equal(lessons.length, 8);
assert.equal(new Set(lessons.map(x=>x.id)).size, lessons.length);
for (const lesson of lessons) {
  assert.ok(lesson.sections.length >= 3 && lesson.takeaway && lesson.pitfall);
  assert.ok(Number.isInteger(lesson.question.answer) && lesson.question.options[lesson.question.answer]);
  assert.ok([23,24].includes(lesson.page));
  if (lesson.lab) assert.ok(['fork','vacuum','wave'].includes(lesson.lab));
}
const html = readFileSync(resolve(root,'index.html'), 'utf8');
assert.ok(!/<script[^>]*src=["']https?:/i.test(html));
assert.ok(manifest.content_security_policy.extension_pages.includes("script-src 'self'"));
console.log('基本检查通过：Manifest V3、分发文件、JavaScript 语法、7 个模块与 8 节声学课程。');
