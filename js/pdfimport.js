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
  if (!wdLabel) return { month, name, insuredNo, careLevel, visits: [] };
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
  return { month, name, insuredNo, careLevel, visits };
}

// ---- 訪問介護計画書（事業所作成） ----

export function parseDays(text) {
  const t = String(text ?? '').replace(/\s+/g, '');
  if (!t || /毎日/.test(t)) return [0, 1, 2, 3, 4, 5, 6];
  const range = /([日月火水木金土])[～〜~\-ー]([日月火水木金土])/.exec(t);
  if (range) {
    const out = [];
    for (let i = WD.indexOf(range[1]); ; i = (i + 1) % 7) { out.push(i); if (i === WD.indexOf(range[2])) break; }
    return out.sort();
  }
  return [...new Set([...t].map(c => WD.indexOf(c)).filter(i => i >= 0))].sort();
}

// 1つの PDF に複数の作成日の版があれば、版ごとに訪問枠と援助内容を返す。
export function parseHomeCarePlan(pages) {
  const versions = [];
  let current = null;
  let name = '', careLevel = '';
  for (const items of pages) {
    const lines = toLines(items);
    const all = lines.map(l => l.text).join('\n');
    const made = /作成日\s*：?\s*令和\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/.exec(all);
    if (made) {
      current = { date: `${wareki(made[1])}-${pad(made[2])}-${pad(made[3])}`, slots: [] };
      versions.push(current);
      careLevel = detectCareLevel(all) || careLevel;
      const nm = /氏名\s*(.+?)\s*様/.exec(all);
      if (nm) name = nm[1].trim();
    }
    if (!all.includes('週間サービス計画表')) continue;
    if (!current) { current = { date: '', slots: [] }; versions.push(current); }

    const header = lines.find(l => l.text.includes('時間帯') && l.text.includes('曜日'));
    const col = s => header?.items.find(it => it.str.includes(s))?.x ?? 0;
    const xTime = col('時間帯') - 15, xDay = col('曜日') - 6, xKind = col('サービス区分') - 10, xIns = col('保険内外') - 5;
    const firstContent = lines.find(l => l.text.includes('サービス内容（'))?.y ?? Infinity;
    for (const l of lines.filter(l => l.y > (header?.y ?? 0) && l.y < firstContent)) {
      const pick = (x0, x1) => l.items.filter(it => it.x >= x0 && it.x < x1).map(it => it.str).join('').trim();
      const no = pick(0, xTime), time = pick(xTime, xDay), days = pick(xDay, xKind), kind = pick(xKind, xIns);
      const m = /(\d{1,2}:\d{2})[～〜~-](\d{1,2}:\d{2})/.exec(time);
      if (!/^\d+$/.test(no) || !m) continue;
      current.slots.push({ no: Number(no), start: m[1], end: m[2], dayText: days, days: parseDays(days), service: kind, content: '', items: [] });
    }

    // サービス内容（No.n）：具体的内容の欄だけを読む
    const sections = lines.filter(l => /サービス内容（\s*No\.?\s*\d+/.test(l.text.replace(/\s/g, '')));
    sections.forEach((sec, i) => {
      const no = Number(/No\.?(\d+)/.exec(sec.text.replace(/\s/g, ''))[1]);
      const slot = current.slots.find(s => s.no === no);
      if (!slot) return;
      const end = sections[i + 1]?.y ?? (lines.find(l => l.y > sec.y && l.text.includes('特記事項'))?.y ?? Infinity);
      const head = lines.find(l => l.y > sec.y && l.y < end && l.text.includes('所要時間'));
      if (!head) return;
      const kindX = head.items.find(it => it.str.includes('サービス区分'));
      const x0 = kindX ? kindX.x + kindX.w + 10 : 0;
      const x1 = head.items.find(it => it.str.includes('所要時間')).x - 5;
      slot.content = lines.filter(l => l.y > head.y && l.y < end)
        .map(l => l.items.filter(it => it.x >= x0 && it.x < x1).map(it => it.str).join(''))
        .join('').replace(/頻度：[^）)]*[）)]/g, '').trim();
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
    wheelchair: /☑車いす/.test(all),
  };
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
