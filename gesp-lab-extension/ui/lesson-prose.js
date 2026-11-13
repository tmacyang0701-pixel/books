const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Some model JSON uses a single backslash for TeX: JSON then decodes \times
// into a tab + "imes". Repair known control-character sequences only in math.
export function repairMathEscapes(source){
  const commands=[['\u0009imes','\\times'],['\u0009ext','\\text'],['\u0009heta','\\theta'],['\u000crac','\\frac'],['\u0008eta','\\beta'],['\u0008egin','\\begin'],['\u000dight','\\right'],['\u000aeq','\\neq']];
  return commands.reduce((text,[bad,good])=>text.replaceAll(bad,good),source);
}
const proseTokens=value=>String(value??'').split(/(```[\s\S]*?```|`[^`\n]+`|\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|(?<!\\)\$(?!\$)[^$]+?(?<!\\)\$)/g);
export const repairProseMath=value=>proseTokens(value).map(part=>part.startsWith('$')||part.startsWith('\\(')||part.startsWith('\\[')?repairMathEscapes(part):part).join('');
export function lessonProse(value,{renderer=globalThis.katex?.renderToString}={}){
  const tokens=proseTokens(value);
  return tokens.map(part=>{
    if(part.startsWith('```')&&part.endsWith('```'))return `<pre><code>${esc(part.slice(3,-3).replace(/^[\w+#-]*\r?\n/,''))}</code></pre>`;
    if(part.startsWith('`')&&part.endsWith('`'))return `<code class="lesson-inline-code">${esc(part.slice(1,-1))}</code>`;
    const display=part.startsWith('$$')||part.startsWith('\\['),math=display||part.startsWith('\\(')||(part.startsWith('$')&&part.endsWith('$')&&part.length>2);
    if(math){
      const source=repairMathEscapes(part.slice(display||part.startsWith('\\(')?2:1,display||part.startsWith('\\(')?-2:-1)).trim();
      if(typeof renderer==='function')try{
        // MathML makes exported HTML self-contained, with no scripts/fonts/CDN.
        return `<span class="lesson-math${display?' lesson-math-display':''}">${renderer(source,{output:'mathml',displayMode:display,trust:false,throwOnError:true,strict:'ignore',maxExpand:100,maxSize:10,macros:{}})}</span>`;
      }catch{}
      const readable=source.replace(/\\times\b/g,'×').replace(/\\cdot\b/g,'·').replace(/\\(?:leq|le)\b/g,'≤').replace(/\\(?:geq|ge)\b/g,'≥').replace(/\\(?:neq|ne)\b/g,'≠');
      return `<span class="lesson-math">${esc(readable)}</span>`;
    }
    return esc(part).replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>');
  }).join('');
}
