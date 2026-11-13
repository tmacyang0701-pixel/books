import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {lessonProse} from '../ui/lesson-prose.js';
import {slideHtml,exportHtml} from '../ui/core.js';
const context={};vm.runInNewContext(fs.readFileSync(new URL('../vendor/katex/katex.min.js',import.meta.url),'utf8'),context);globalThis.katex=context.katex;
test('lesson prose renders local MathML and repairs JSON-decoded times only in formulas',()=>{
 const html=lessonProse('场景：$N!$ 或 $A \times k$；$9 \\times 9 = 81$，变量 `carry`。');
 assert.equal((html.match(/<math /g)||[]).length,3);assert.match(html,/<mo>×<\/mo>/);assert.ok(!html.includes('\times'));assert.ok(!html.includes('$N!$'));assert.match(html,/<code class="lesson-inline-code">carry<\/code>/);
 const other=lessonProse('\\(s_i\\) 和 $$\\frac{a}{b}$$');assert.match(other,/<msub>/);assert.match(other,/<mfrac>/);
});
test('inline and fenced code stay literal and unsafe prose or math cannot create executable HTML',()=>{
 const html=lessonProse('<img src=x onerror=alert(1)> `$x$ < y`\n```cpp\ncout << "$x$";\n```');
 assert.ok(!html.includes('<img'));assert.match(html,/&lt;img/);assert.ok(!html.includes('<math'));assert.match(html,/\$x\$/);
 const unsafe=lessonProse('$\\href{javascript:alert(1)}{click}$');assert.ok(!unsafe.includes('href="javascript:'));assert.ok(!unsafe.includes('<script'));
 const invalid=lessonProse('$\\unknowncommand{x}$');assert.match(invalid,/unknowncommand/);assert.ok(!invalid.includes('<script'));
});
test('existing lessons format body/table/narration and export formulas without script dependencies',()=>{
 const lesson={title:'示例',targetLevel:5,pages:[{kind:'示例',title:'$A \\times k$',content:['用 `int` 保存 $s_i$。'],narration:'公式 $\\frac{a}{b}$',trace:{headers:['$x$'],rows:[['$x^2$']]},code:'cout << "$x$";'}]};
 const slide=slideHtml(lesson.pages[0],{lesson,codeUnlocked:true});assert.ok(slide.includes('<msub>'));assert.ok(slide.includes('cout &lt;&lt; &quot;$x$&quot;'));
 const html=exportHtml(lesson);assert.ok(html.includes('<mfrac>'));assert.ok(!html.includes('<script'));assert.ok(!html.includes('cout &lt;&lt;'));
});
