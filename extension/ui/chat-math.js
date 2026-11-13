// Bundled locally: extension pages must not load executable code from a CDN.
export function renderChatMath(element, renderer=globalThis.renderMathInElement) {
  if (!element || typeof renderer !== 'function') return;
  renderer(element, {
    delimiters:[{left:'$$',right:'$$',display:true},{left:'\\[',right:'\\]',display:true},
      {left:'\\(',right:'\\)',display:false},{left:'$',right:'$',display:false}],
    ignoredTags:['script','noscript','style','textarea','pre','code','option'],
    ignoredClasses:['chat-error'], trust:false, throwOnError:false,
    strict:'ignore', maxExpand:100, maxSize:10, macros:{},
  });
}
