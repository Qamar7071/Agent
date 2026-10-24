// Tiny, safe markdown renderer for assistant replies: **bold**, *italic*, lists, paragraphs.
// Builds React elements (never innerHTML), so backend text cannot inject markup.
function inline(text, keyBase) {
  const parts = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let m;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${keyBase}-${i++}`;
    if (tok.startsWith('**')) parts.push(<strong key={k} className="font-semibold text-ink">{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('`')) parts.push(<code key={k} className="rounded bg-line px-1 font-mono text-[0.9em]">{tok.slice(1, -1)}</code>);
    else parts.push(<em key={k}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export default function MiniMarkdown({ text }) {
  if (!text) return null;
  const blocks = text.replace(/\r/g, '').split(/\n{2,}/);
  return (
    <div className="flex flex-col gap-2.5">
      {blocks.map((block, bi) => {
        const lines = block.split('\n');
        const isList = lines.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l));
        if (isList) {
          const ordered = /^\s*\d/.test(lines[0]);
          const Tag = ordered ? 'ol' : 'ul';
          return (
            <Tag key={bi} className={`flex flex-col gap-1 pl-5 ${ordered ? 'list-decimal' : 'list-disc'} marker:text-brand`}>
              {lines.map((l, li) => (
                <li key={li}>{inline(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ''), `${bi}-${li}`)}</li>
              ))}
            </Tag>
          );
        }
        if (/^#{1,4}\s/.test(lines[0])) {
          return (
            <div key={bi}>
              <p className="font-display text-[16px] font-semibold text-ink">{inline(lines[0].replace(/^#+\s/, ''), `${bi}-h`)}</p>
              {lines.slice(1).map((l, li) => (
                <p key={li}>{inline(l, `${bi}-${li}`)}</p>
              ))}
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
