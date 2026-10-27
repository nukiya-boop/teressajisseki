// CSV / TSV の読み書き。Excel からの貼り付け（タブ区切り）にも対応する。

export function parseTable(text) {
  text = text.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const delim = firstLine.includes('\t') ? '\t' : ',';
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === '') {
      quoted = true;
    } else if (c === delim) {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows
    .map(r => r.map(v => v.trim()))
    .filter(r => r.some(v => v !== ''));
}

// 1行目を見出しとして、別名を正規のキーに寄せたオブジェクト配列を返す。
export function parseRecords(text, aliases) {
  const [header, ...body] = parseTable(text);
  if (!header) return [];
  const keys = header.map(h => {
    const norm = h.replace(/\s/g, '');
    for (const [key, names] of Object.entries(aliases)) {
      if (names.includes(norm)) return key;
    }
    return null;
  });
  return body.map(cols => {
    const rec = {};
    keys.forEach((k, i) => { if (k) rec[k] = cols[i] ?? ''; });
    return rec;
  });
}

export function toCSV(rows) {
  return rows
    .map(r => r.map(v => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','))
    .join('\r\n');
}

// Excel 由来の Shift_JIS CSV も読めるようにする。
export function decodeFile(buffer) {
  const utf8 = new TextDecoder('utf-8').decode(buffer);
  if (!utf8.includes('�')) return utf8;
  return new TextDecoder('shift_jis').decode(buffer);
}
