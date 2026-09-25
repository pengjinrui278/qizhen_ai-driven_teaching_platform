// Keep code examples literal; display math needs its own Markdown block.
export function normalizeMath(text) {
  return text.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g).map(part => {
    if (part.startsWith('`') || part.startsWith('~~~')) return part;
    return part.replace(/\\\[([\s\S]*?)\\\]/g, (_, body) => '\n\n$$\n' + body.trim() + '\n$$\n\n')
      .replace(/\\\(([\s\S]*?)\\\)/g, (_, body) => '$' + body.trim() + '$');
  }).join('');
}
