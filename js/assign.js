// ヘルパーの自動振り分け。在籍期間内で、同じ時間に2か所へ行かないように割り当てる。

// 「山田太郎 2026年2月1日〜現在」「山田花子 2026年2月1日〜6月30日」のような行を読む
export function parseStaff(text) {
  const out = [];
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const m = /^\s*(.+?)[\s\t,]+(\d{4})年(\d{1,2})月(\d{1,2})日\s*[〜～~\-ー]\s*(現在|(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日)?\s*$/.exec(line);
    if (!m) continue;
    const from = `${m[2]}-${m[3].padStart(2, '0')}-${m[4].padStart(2, '0')}`;
    const to = m[7] ? `${m[6] ?? m[2]}-${m[7].padStart(2, '0')}-${m[8].padStart(2, '0')}` : '';
    out.push({ name: m[1].trim(), from, to });
  }
  return out;
}

function minutes(t) {
  const m = /(\d{1,2}):(\d{2})/.exec(String(t));
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

// 終了が開始以前（記入誤りなど）のときは20分とみなす
export function interval(start, end) {
  const s = minutes(start);
  let e = minutes(end);
  if (!(e > s)) e = s + 20;
  return [s, e];
}

export function activeOn(staff, date) {
  return staff.filter(p => p.from <= date && (!p.to || date <= p.to));
}

// visits: [{ key, date, start, end, userId, slot }]（slot は同じ訪問枠を見分ける文字列）
// fixed: すでに担当者が決まっている訪問 { key: 氏名 }（シフト・手入力）
// 戻り値: { assign: { key: 氏名 }, unassigned: [key], load: { 氏名: { visits, minutes } } }
export function assignStaff(visits, staff, { buffer = 10, maxMinutes = 600, fixed = {} } = {}) {
  const assign = {};
  const unassigned = [];
  const load = Object.fromEntries(staff.map(p => [p.name, { visits: 0, minutes: 0 }]));
  const regular = {};   // 訪問枠ごとの前回の担当者（同じ人が続けて入るように）
  const familiar = {};  // 利用者ごとの担当回数
  const byDate = {};
  for (const v of visits) (byDate[v.date] ??= []).push(v);

  for (const date of Object.keys(byDate).sort()) {
    const people = activeOn(staff, date).map(p => p.name);
    const busy = Object.fromEntries(people.map(n => [n, []]));
    const today = Object.fromEntries(people.map(n => [n, 0]));
    const list = byDate[date].map(v => ({ ...v, range: interval(v.start, v.end) }))
      .sort((a, b) => a.range[0] - b.range[0] || a.userId.localeCompare(b.userId));

    const take = (v, name) => {
      const [s, e] = v.range;
      assign[v.key] = name;
      (busy[name] ??= []).push([s, e]);
      today[name] = (today[name] ?? 0) + (e - s);
      load[name] ??= { visits: 0, minutes: 0 };
      load[name].visits++;
      load[name].minutes += e - s;
      regular[v.slot] = name;
      (familiar[v.userId] ??= {})[name] = (familiar[v.userId]?.[name] ?? 0) + 1;
    };

    // 決まっている訪問を先に入れる
    for (const v of list.filter(v => fixed[v.key])) take(v, fixed[v.key]);

    for (const v of list.filter(v => !fixed[v.key])) {
      const [s, e] = v.range;
      const free = people.filter(n =>
        busy[n].every(([bs, be]) => e + buffer <= bs || be + buffer <= s) &&
        today[n] + (e - s) <= maxMinutes);
      if (!free.length) { unassigned.push(v.key); continue; }
      const score = n =>
        (regular[v.slot] === n ? 40 : 0) +
        Math.min(familiar[v.userId]?.[n] ?? 0, 10) * 1.5 -
        today[n] / 60 * 6 -
        load[n].minutes / 60 * 0.4;
      free.sort((a, b) => score(b) - score(a) || a.localeCompare(b));
      take(v, free[0]);
    }
  }
  return { assign, unassigned, load };
}
