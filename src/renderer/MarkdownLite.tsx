import React from 'react';

// Minimal, dependency-free markdown -> JSX renderer.
// Supports: headers, bold/italic, inline code, fenced code blocks,
// bullet + numbered lists, blockquotes, and paragraphs.

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let remaining = text;
  let i = 0;

  const pattern = /(\*\*(.+?)\*\*|`(.+?)`|\*(.+?)\*)/;

  while (remaining.length > 0) {
    const match = remaining.match(pattern);
    if (!match || match.index === undefined) {
      nodes.push(remaining);
      break;
    }
    if (match.index > 0) nodes.push(remaining.slice(0, match.index));

    if (match[2] !== undefined) {
      nodes.push(<strong key={`${keyPrefix}-${i++}`} className="font-semibold text-white">{match[2]}</strong>);
    } else if (match[3] !== undefined) {
      nodes.push(
        <code key={`${keyPrefix}-${i++}`} className="bg-black/40 text-emerald-300 px-1.5 py-0.5 rounded text-[0.85em] font-mono">
          {match[3]}
        </code>
      );
    } else if (match[4] !== undefined) {
      nodes.push(<em key={`${keyPrefix}-${i++}`} className="italic">{match[4]}</em>);
    }

    remaining = remaining.slice(match.index + match[0].length);
  }
  return nodes;
}

export default function MarkdownLite({ text }: { text: string }) {
  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];

  let i = 0;
  let listBuffer: { type: 'ul' | 'ol'; items: string[] } | null = null;

  const flushList = (key: string) => {
    if (!listBuffer) return;
    const Tag = listBuffer.type === 'ul' ? 'ul' : 'ol';
    blocks.push(
      <Tag key={key} className={listBuffer.type === 'ul' ? 'list-disc pl-5 space-y-1 my-2' : 'list-decimal pl-5 space-y-1 my-2'}>
        {listBuffer.items.map((item, idx) => (
          <li key={idx} className="text-gray-200">{renderInline(item, `${key}-li-${idx}`)}</li>
        ))}
      </Tag>
    );
    listBuffer = null;
  };

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3);
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      flushList(`list-${i}`);
      blocks.push(
        <pre key={`code-${i}`} className="bg-black/50 border border-white/10 rounded-lg p-3 my-2 overflow-x-auto">
          {lang && <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">{lang}</div>}
          <code className="text-sm font-mono text-gray-100 whitespace-pre">{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    // Headers
    const headerMatch = line.match(/^(#{1,4})\s+(.*)/);
    if (headerMatch) {
      flushList(`list-${i}`);
      const level = headerMatch[1].length;
      const sizes: Record<number, string> = {
        1: 'text-xl font-bold mt-4 mb-2',
        2: 'text-lg font-bold mt-3 mb-2',
        3: 'text-base font-semibold mt-2 mb-1',
        4: 'text-sm font-semibold mt-2 mb-1 text-gray-300'
      };
      blocks.push(
        <div key={`h-${i}`} className={sizes[level] + ' text-white'}>
          {renderInline(headerMatch[2], `h-${i}`)}
        </div>
      );
      i++;
      continue;
    }

    // Bullet list item
    const bulletMatch = line.match(/^\s*[-*]\s+(.*)/);
    if (bulletMatch) {
      if (!listBuffer || listBuffer.type !== 'ul') {
        flushList(`list-${i}`);
        listBuffer = { type: 'ul', items: [] };
      }
      listBuffer.items.push(bulletMatch[1]);
      i++;
      continue;
    }

    // Numbered list item
    const numberMatch = line.match(/^\s*\d+[.)]\s+(.*)/);
    if (numberMatch) {
      if (!listBuffer || listBuffer.type !== 'ol') {
        flushList(`list-${i}`);
        listBuffer = { type: 'ol', items: [] };
      }
      listBuffer.items.push(numberMatch[1]);
      i++;
      continue;
    }

    // Blockquote
    const quoteMatch = line.match(/^\s*>\s?(.*)/);
    if (quoteMatch) {
      flushList(`list-${i}`);
      blocks.push(
        <blockquote key={`q-${i}`} className="border-l-2 border-purple-500 pl-3 my-2 text-gray-400 italic">
          {renderInline(quoteMatch[1], `q-${i}`)}
        </blockquote>
      );
      i++;
      continue;
    }

    // Indented code block (4+ spaces or a tab) — standard markdown convention,
    // and a safety net for when the model emits code without ``` fences.
    if (/^(?: {4,}|\t)\S/.test(line)) {
      flushList(`list-${i}`);
      const codeLines: string[] = [];
      while (i < lines.length && (/^(?: {4,}|\t)/.test(lines[i]) || lines[i].trim() === '')) {
        codeLines.push(lines[i].replace(/^(?: {4}|\t)/, ''));
        i++;
      }
      while (codeLines.length && codeLines[codeLines.length - 1].trim() === '') codeLines.pop();
      blocks.push(
        <pre key={`icode-${i}`} className="bg-black/50 border border-white/10 rounded-lg p-3 my-2 overflow-x-auto">
          <code className="text-sm font-mono text-gray-100 whitespace-pre">{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    // Blank line
    if (line.trim() === '') {
      flushList(`list-${i}`);
      i++;
      continue;
    }

    // Paragraph — group consecutive plain lines into one block instead of a
    // separate <p> per line. A single '\n' inside a markdown paragraph is a
    // soft line break, not a new paragraph; only a blank line ends one. Without
    // this, any short-lined content (especially code without ``` fences) rendered
    // as a stack of disconnected, individually-margined fragments.
    flushList(`list-${i}`);
    const paraLines: string[] = [line];
    let j = i + 1;
    while (
      j < lines.length &&
      lines[j].trim() !== '' &&
      !lines[j].trim().startsWith('```') &&
      !/^(?: {4,}|\t)\S/.test(lines[j]) &&
      !/^(#{1,4})\s+/.test(lines[j]) &&
      !/^\s*[-*]\s+/.test(lines[j]) &&
      !/^\s*\d+[.)]\s+/.test(lines[j]) &&
      !/^\s*>\s?/.test(lines[j])
    ) {
      paraLines.push(lines[j]);
      j++;
    }
    blocks.push(
      <p key={`p-${i}`} className="text-gray-200 leading-relaxed my-1">
        {paraLines.map((pl, idx) => (
          <React.Fragment key={idx}>
            {idx > 0 && <br />}
            {renderInline(pl, `p-${i}-${idx}`)}
          </React.Fragment>
        ))}
      </p>
    );
    i = j;
  }

  flushList('list-end');
  return <div>{blocks}</div>;
}
