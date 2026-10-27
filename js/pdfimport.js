// ケアマネ・事業所の PDF 書類の読み取り。
// 入力は pdf.js の文字列を {str, x, y, w}（y は上から）にしたページの配列。

import { detectItems, detectCareLevel, detectDementia, perWeek } from './record.js';

const WD = '日月火水木金土';

export function toLines(items, tol = 3) {
  const sorted = items.filter(it => it.str.trim()).sort((a, b) => a.y - b.y || a.x - b.x);
  const lines = [];
  for (const it of sorted) {
    const line = lines.find(l => Math.abs(l.y - it.y) <= tol);
    if (line) line.items.push(it); else lines.push({ y: it.y, items: [it] });
  }
  for (const l of lines) {
    l.items.sort((a, b) => a.x - b.x);
    l.text = l.items.map(it => it.str).join(' ');
  }
  return lines.sort((a, b) => a.y - b.y);
}

const joinText = items => items.map(it => it.str).join('').replace(/\s+/g, '');

export function normalizeName(name) {
  return String(name ?? '').replace(/[\s　]|様$/g, '');
}

function wareki(era) {
  return 2018 + Number(era);
}

function pad(n) {
  return String(n).padStart(2, '0');
}

export function classifyPage(text) {
  const t = text.replace(/\s+/g, '');
  if (t.includes('訪問介護計画書')) return 'homecareplan';
  if (/サービス(提供|利用)票別表/.test(t)) return 'skip';
  if (/サービス(提供|利用)票/.test(t)) return 'teikyo';
  if (/課題分析標準項目|アセスメントシート/.test(t)) return 'assessment';
  if (t.includes('第２表') || t.includes('第2表')) return 'careplan2';
  if (/第[１1３3]表/.test(t)) return 'careplan';
  return 'other';
}

// ---- サービス提供票・利用票 ----

// 数字がまとまった文字列（"1 1"など）を、1文字ずつの位置に分けて返す。
function tokens(it) {
  const out = [];
  const re = /\d+/g;
  let m;
  while ((m = re.exec(it.str))) {
    const mid = (m.index + m[0].length / 2) / it.str.length;
    out.push({ value: m[0], x: it.x + mid * it.w });
  }
  return out;
}

export function parseTeikyo(items) {
  const find = re => items.find(it => re.test(it.str.trim()));
  const head = items.filter(it => /^令和\d+年\d+月\s*(分)?$/.test(it.str.trim())).sort((a, b) => a.y - b.y)[0];
  if (!head) return null;
  const [, era, mon] = /令和(\d+)年(\d+)月/.exec(head.str);
  const month = `${wareki(era)}-${pad(mon)}`;

  const sama = items.filter(it => it.str.trim() === '様').sort((a, b) => a.y - b.y)[0];
  const name = sama ? items.filter(it => Math.abs(it.y - sama.y) <= 3 && it.x < sama.x && it.x > sama.x - 200 &&
    !/氏名|フリガナ|被保険者/.test(it.str)).sort((a, b) => a.x - b.x).map(it => it.str.trim()).join(' ') : '';

  const label = items.find(it => it.str.trim() === '被保険者' && it.x < 70);
  const insuredNo = label ? items.filter(it => it.y >= label.y - 2 && it.y <= label.y + 14 &&
    it.x > label.x + 40 && it.x < label.x + 200 && /^[\d\s]+$/.test(it.str))
    .sort((a, b) => a.x - b.x).map(it => it.str).join('').replace(/\s/g, '') : '';

  const lv = find(/^要(介護|支援)/);
  let careLevel = '';
  if (lv) {
    const near = items.filter(it => Math.abs(it.y - lv.y) <= 3 && it.x >= lv.x && it.x < lv.x + 60)
      .sort((a, b) => a.x - b.x).map(it => it.str).join('');
    careLevel = detectCareLevel(near);
  }

  const wdLabel = items.find(it => it.str.trim() === '曜日');
  if (!wdLabel) return { month, kind: '', name, insuredNo, careLevel, visits: [] };
  const days = items.filter(it => Math.abs(it.y - wdLabel.y) <= 3 && it.x > wdLabel.x + 15 &&
    it.str.trim().length === 1 && WD.includes(it.str.trim()))
    .map(it => it.x + it.w / 2).sort((a, b) => a - b);

  const visits = [];
  for (const yotei of items.filter(it => it.str.trim() === '予定' && Math.abs(it.x - wdLabel.x) < 6)) {
    const y = yotei.y;
    const inRow = (x0, x1) => items.filter(it => it.y >= y - 6 && it.y <= y + 9 && it.x >= x0 && it.x < x1)
      .sort((a, b) => a.y - b.y || a.x - b.x);
    const times = inRow(0, 52).map(it => /(\d{1,2}:\d{2})/.exec(it.str)?.[1]).filter(Boolean);
    const service = joinText(inRow(50, 125));
    const office = joinText(inRow(125, 215));
    if (!times[0]) continue;
    const marks = items.filter(it => Math.abs(it.y - y) <= 3 && it.x > days[0] - 8 && it.x < days.at(-1) + 8)
      .flatMap(tokens).filter(t => Number(t.value) > 0);
    for (const t of marks) {
      let best = -1, dist = 8;
      days.forEach((cx, i) => { if (Math.abs(cx - t.x) < dist) { dist = Math.abs(cx - t.x); best = i; } });
      if (best >= 0) {
        visits.push({ date: `${month}-${pad(best + 1)}`, start: times[0], end: times[1] ?? '', service, office });
      }
    }
  }
  const kind = items.some(it => it.str.replace(/\s/g, '').includes('サービス利用票')) ? '利用票' : '提供票';
  return { month, kind, name, insuredNo, careLevel, visits };
}

// ---- 訪問介護計画書（事業所作成） ----

export function parseDays(text) {
  const t = String(text ?? '').replace(/\s+/g, '');
  if (!t || /毎日/.test(t) || parseDates(t)) return [0, 1, 2, 3, 4, 5, 6];
  const range = /([日月火水木金土])[～〜~\-ー]([日月火水木金土])/.exec(t);
  if (range) {
    const out = [];
    for (let i = WD.indexOf(range[1]); ; i = (i + 1) % 7) { out.push(i); if (i === WD.indexOf(range[2])) break; }
    return out.sort();
  }
  return [...new Set([...t].map(c => WD.indexOf(c)).filter(i => i >= 0))].sort();
}

// 「1日〜6日のみ」「5日・25日・29日のみ」のような日付指定を、日にちの配列にする（曜日指定なら null）
export function parseDates(text) {
  const t = String(text ?? '').replace(/\s+/g, '');
  if (!/\d+日/.test(t)) return null;
  const out = new Set();
  for (const m of t.matchAll(/(\d+)日(?:[～〜~\-ー](\d+)日)?/g)) {
    const a = Number(m[1]), b = Number(m[2] ?? m[1]);
    for (let d = a; d <= b; d++) out.add(d);
  }
  return [...out].sort((x, y) => x - y);
}

// 見出しが「曜」「日」のように分かれていても、行の中での位置（左端・右端）を返す。
function span(line, label) {
  let text = '';
  const parts = [];
  for (const it of line.items) {
    const str = it.str.replace(/\s/g, '');
    parts.push({ it, from: text.length, len: str.length });
    text += str;
  }
  const i = text.indexOf(label);
  if (i < 0) return null;
  const at = k => {
    const p = parts.find(p => k >= p.from && k < p.from + p.len) ?? parts.at(-1);
    return p.it.x + ((k - p.from) / Math.max(p.len, 1)) * p.it.w;
  };
  return { x0: at(i), x1: at(i + label.length - 1) + (at(i + label.length - 1) - at(i)) / Math.max(label.length - 1, 1) };
}

const compact = l => l.text.replace(/\s/g, '');

// 1つの PDF に複数の作成日の版があれば、版ごとに訪問枠と援助内容を返す。
export function parseHomeCarePlan(pages) {
  const versions = [];
  let current = null;
  let name = '', careLevel = '';
  for (const items of pages) {
    const lines = toLines(items);
    const all = lines.map(l => l.text).join('\n');
    const flat = lines.map(compact).join('\n');
    const made = /作成日：?令和(\d+)年(\d+)月(\d+)日/.exec(flat);
    if (made) {
      current = { date: `${wareki(made[1])}-${pad(made[2])}-${pad(made[3])}`, slots: [] };
      versions.push(current);
      careLevel = detectCareLevel(all) || careLevel;
      const nm = /氏名\s*(.+?)\s*様/.exec(all);
      if (nm) name = nm[1].trim();
    }
    if (!flat.includes('週間サービス計画表')) continue;
    if (!current) { current = { date: '', slots: [] }; versions.push(current); }

    const header = lines.find(l => compact(l).includes('時間帯') && compact(l).includes('曜日'));
    if (!header) continue;
    const no = span(header, 'No'), time = span(header, '時間帯'), day = span(header, '曜日');
    const kind = span(header, 'サービス区分'), ins = span(header, '保険内外');
    // 列の境目は、隣り合う見出しのあいだ
    const b0 = no ? no.x1 + 3 : time.x0 - 15;
    const b1 = (time.x1 + day.x0) / 2, b2 = (day.x1 + kind.x0) / 2, b3 = ins ? (kind.x1 + ins.x0) / 2 : kind.x1 + 20;
    const firstContent = lines.find(l => compact(l).includes('サービス内容（'))?.y ?? Infinity;
    for (const l of lines.filter(l => l.y > header.y && l.y < firstContent)) {
      const pick = (x0, x1) => l.items.filter(it => it.x >= x0 && it.x < x1).map(it => it.str).join('').replace(/\s/g, '');
      const n = pick(0, b0), t = pick(b0, b1), days = pick(b1, b2), svc = pick(b2, b3);
      const m = /(\d{1,2}:\d{2})[～〜~-](\d{1,2}:\d{2})/.exec(t);
      if (!/^\d+$/.test(n) || !m) continue;
      current.slots.push({ no: Number(n), start: m[1], end: m[2], dayText: days, days: parseDays(days), dates: parseDates(days), service: svc, content: '', items: [] });
    }

    // サービス内容（No.n）：具体的内容の欄だけを読む
    const sections = lines.filter(l => /サービス内容（No\.?\d+/.test(compact(l)));
    sections.forEach((sec, i) => {
      const no = Number(/No\.?(\d+)/.exec(compact(sec))[1]);
      const slot = current.slots.find(s => s.no === no);
      if (!slot) return;
      const end = sections[i + 1]?.y ?? (lines.find(l => l.y > sec.y && compact(l).includes('特記事項'))?.y ?? Infinity);
      const head = lines.find(l => l.y > sec.y && l.y < end && compact(l).includes('所要時間'));
      if (!head) return;
      const k = span(head, 'サービス区分'), dur = span(head, '所要時間');
      const x0 = k ? k.x1 + 10 : 0;
      const x1 = dur.x0 - 5;
      slot.content = lines.filter(l => l.y > head.y && l.y < end)
        .map(l => l.items.filter(it => it.x >= x0 && it.x < x1).map(it => it.str).join(''))
        .join('').replace(/\s/g, '')
        .replace(/頻度：[^（(]*[（(][\d:～〜~\-]*[）)]?/g, '').replace(/^[\d:～〜~\-]*[）)]/, '').trim();
      slot.items = detectItems(slot.content);
    });
  }
  return { name, careLevel, versions: versions.filter(v => v.slots.length) };
}

// ---- アセスメントシート（☑ の付いた選択肢を読む） ----

export function parseAssessment(pages) {
  const lines = pages.flatMap(items => toLines(items)).map(l => l.items.map(it => it.str).join('').replace(/\s+/g, ''));
  const all = lines.join('\n');
  const lv = /☑要(介護|支援)([1-5])/.exec(all);
  const dLine = lines.find(l => l.includes('Ⅱa') && l.includes('Ⅲb') && l.includes('☑'));
  const dementiaLevel = dLine ? (/☑(自立|Ⅰ|Ⅱa|Ⅱb|Ⅲa|Ⅲb|Ⅳ|M)/.exec(dLine)?.[1] ?? '') : '';
  const nm = /利用者氏名(.+?)(性別|$)/m.exec(all);
  return {
    name: nm ? nm[1] : '',
    careLevel: lv ? `要${lv[1]}${lv[2]}` : '',
    dementiaLevel,
    dementia: /^(Ⅱ|Ⅲ|Ⅳ|M)/.test(dementiaLevel),
    walker: /室内：使用機器[^\n]*☑歩行器/.test(all),
    adl: parseAdl(lines),
    wheelchair: /☑車いす/.test(all),
  };
}

const ADL_KEYS = ['寝返り', '起き上がり', '歩行', '洗身', '移乗', '食事摂取', '口腔衛生', '上衣の着脱', 'ズボンの着脱', '薬の内服', '金銭の管理', '買物', '簡単な調理', '排尿', '排便'];

// 「洗身 □自立 ☑一部介助 □全介助」のような行から選ばれたものを読む
function parseAdl(lines) {
  const adl = {};
  for (const key of ADL_KEYS) {
    const line = lines.find(l => l.includes(key) && l.includes('☑') && /[□☑]/.test(l.slice(l.indexOf(key) + key.length, l.indexOf(key) + key.length + 3)));
    const m = line && new RegExp(`${key}[^☑]*?☑([^□☑\n]+)`).exec(line);
    if (m) adl[key] = m[1].trim();
  }
  return adl;
}

// ---- ケアプラン第2表（訪問介護の行のサービス内容と頻度） ----

export function parseCarePlan2(items) {
  const head = items.find(it => it.str.trim() === 'サービス内容');
  const kindHead = items.find(it => it.str.trim() === 'サービス種別');
  const freqHead = items.find(it => it.str.trim() === '頻度');
  if (!head || !kindHead) return [];
  const markHead = items.find(it => /^※１$/.test(it.str.trim()) && it.x > head.x && it.x < kindHead.x);
  const contentX = [head.x - 40, (markHead?.x ?? kindHead.x) - 3];
  const kindX = [kindHead.x - 15, kindHead.x + 70];
  const kinds = items.filter(it => it.y > head.y + 5 && it.x >= kindX[0] && it.x < kindX[1]).sort((a, b) => a.y - b.y);
  // 種別欄の書き出し位置ごとに1行とみなす
  const starts = kinds.filter((it, i) => i === 0 || it.y - kinds[i - 1].y > 20);
  const rows = [];
  starts.forEach((s, i) => {
    const y0 = s.y - 4, y1 = starts[i + 1] ? starts[i + 1].y - 4 : Infinity;
    const inBand = (x0, x1) => items.filter(it => it.y >= y0 && it.y < y1 && it.x >= x0 && it.x < x1)
      .sort((a, b) => a.y - b.y || a.x - b.x).map(it => it.str).join('').replace(/\s+/g, '');
    const kind = inBand(...kindX);
    if (!kind.includes('訪問介護')) return;
    const content = inBand(...contentX);
    const freq = freqHead ? inBand(freqHead.x - 12, freqHead.x + 30) : '';
    rows.push({ content, freq, perWeek: perWeek(freq), items: detectItems(content) });
  });
  return rows;
}

// ---- 書類1つ分をまとめて読む ----

export function readDocument(pages) {
  const kinds = pages.map(items => classifyPage(items.map(it => it.str).join('')));
  const result = { teikyo: [], homeCarePlan: null, assessment: null, carePlan2: [], text: '' };
  const plain = [];
  pages.forEach((items, i) => {
    if (kinds[i] === 'teikyo') {
      const t = parseTeikyo(items);
      if (t) result.teikyo.push(t);
    } else if (kinds[i] === 'careplan2') {
      result.carePlan2.push(...parseCarePlan2(items));
    }
    if (kinds[i] !== 'skip' && kinds[i] !== 'teikyo') plain.push(toLines(items).map(l => l.text).join('\n'));
  });
  const hcp = pages.filter((_, i) => kinds[i] === 'homecareplan');
  if (hcp.length) result.homeCarePlan = parseHomeCarePlan(hcp);
  const asm = pages.filter((_, i) => kinds[i] === 'assessment');
  if (asm.length) result.assessment = parseAssessment(asm);
  result.text = plain.join('\n');
  result.name = result.teikyo[0]?.name || result.homeCarePlan?.name || result.assessment?.name ||
    (/利用者(?:氏)?名\s*[:：]?\s*(.+?)\s*様/.exec(result.text)?.[1] ?? '');
  result.kinds = [...new Set(kinds)];
  return result;
}

export { detectDementia };
