// Small, safe markdown for agent replies: **bold**, *italic*, `code`, [links](https://…),
// lists and paragraphs. It builds React elements (never innerHTML), so text from the
// server or a model cannot inject markup, and only http(s) links are ever rendered.
function inline(text, keyBase) {
  const parts = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^\s)]+)\))/g;
  let last = 0;
  let m;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${keyBase}-${i++}`;
    if (tok.startsWith('**')) parts.push(<strong key={k} className="font-semibold text-ink">{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('`')) parts.push(<code key={k} className="rounded-sm bg-limestone-200 px-1 text-[0.92em]">{tok.slice(1, -1)}</code>);
    else if (tok.startsWith('[')) {
      const label = tok.slice(1, tok.indexOf(']'));
      parts.push(<a key={k} href={m[2]} target="_blank" rel="noopener noreferrer" className="link">{label}</a>);
    } else parts.push(<em key={k}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const bullet = /^\s*([-*•]|\d+[.)])\s+/;

export default function MiniMarkdown({ text }) {
  if (!text) return null;
  const blocks = text.replace(/\r/g, '').split(/\n{2,}/);
  return (
    <div className="flex flex-col gap-2.5">
      {blocks.map((block, bi) => {
        const lines = block.split('\n').filter((l) => l.trim() !== '');
        if (!lines.length) return null;
        const listStart = lines.findIndex((l) => bullet.test(l));
        if (listStart >= 0 && lines.slice(listStart).every((l) => bullet.test(l) || /^\s{2,}/.test(l))) {
          const intro = lines.slice(0, listStart);
          const items = lines.slice(listStart);
          const ordered = /^\s*\d/.test(items[0]);
          const Tag = ordered ? 'ol' : 'ul';
          return (
            <div key={bi} className="flex flex-col gap-1.5">
              {intro.map((l, li) => <p key={`i${li}`}>{inline(l, `${bi}-i${li}`)}</p>)}
              <Tag className={`flex flex-col gap-1 pl-5 ${ordered ? 'list-decimal' : 'list-disc'} marker:text-juniper-500`}>
                {items.map((l, li) => (
                  <li key={li} className={/^\s{2,}/.test(l) && !bullet.test(l.trim()) ? 'list-none' : ''}>
                    {inline(l.replace(bullet, '').trim(), `${bi}-${li}`)}
                  </li>
                ))}
              </Tag>
            </div>
          );
        }
        if (/^#{1,4}\s/.test(lines[0])) {
          return (
            <div key={bi}>
              <p className="font-semibold text-ink">{inline(lines[0].replace(/^#+\s/, ''), `${bi}-h`)}</p>
              {lines.slice(1).map((l, li) => <p key={li}>{inline(l, `${bi}-${li}`)}</p>)}
            </div>
          );
        }
        return (
          <p key={bi}>
            {lines.map((l, li) => (
              <span key={li}>
                {inline(l, `${bi}-${li}`)}
                {li < lines.length - 1 && <br />}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
