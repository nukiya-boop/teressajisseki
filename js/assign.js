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
// minBuffer: 移動時間をあけて入れられなかった訪問は、移動時間をここまで詰めて入れる（tight に記録）
// 戻り値: { assign: { key: 氏名 }, unassigned: [key], tight: { key: 前の訪問との間隔(分) }, load: { 氏名: { visits, minutes } } }
export function assignStaff(visits, staff, { buffer = 10, minBuffer = buffer, maxMinutes = 600, fixed = {} } = {}) {
  const assign = {};
  const unassigned = [];
  const tight = {};
  const load = Object.fromEntries(staff.map(p => [p.name, { visits: 0, minutes: 0 }]));
  const regular = {};   // 訪問枠ごとの前回の担当者（同じ人が続けて入るように）
  const familiar = {};  // 利用者ごとの担当回数
  const byDate = {};
  for (const v of visits) (byDate[v.date] ??= []).push(v);

  for (const date of Object.keys(byDate).sort()) {
    const people = activeOn(staff, date).map(p => p.name);
    const busy = Object.fromEntries(people.map(n => [n, []]));   // [{ s, e, v }]
    const today = Object.fromEntries(people.map(n => [n, 0]));
    const list = byDate[date].map(v => ({ ...v, range: interval(v.start, v.end) }))
      .sort((a, b) => a.range[0] - b.range[0] || a.userId.localeCompare(b.userId));

    const len = v => v.range[1] - v.range[0];
    const clash = (n, v, gap = buffer) => busy[n].filter(b =>
      !(v.range[1] + gap <= b.s || b.e + gap <= v.range[0]));
    const fits = (n, v, gap = buffer) => !clash(n, v, gap).length && today[n] + len(v) <= maxMinutes;
    const put = (v, n) => {
      (busy[n] ??= []).push({ s: v.range[0], e: v.range[1], v });
      today[n] = (today[n] ?? 0) + len(v);
      assign[v.key] = n;
    };
    const remove = (v, n) => {
      busy[n] = busy[n].filter(b => b.v !== v);
      today[n] -= len(v);
    };

    // 決まっている訪問を先に入れる
    for (const v of list.filter(v => fixed[v.key])) put(v, fixed[v.key]);

    const left = [];
    for (const v of list.filter(v => !fixed[v.key])) {
      const free = people.filter(n => fits(n, v));
      if (!free.length) { left.push(v); continue; }
      const score = n =>
        (regular[v.slot] === n ? 40 : 0) +
        Math.min(familiar[v.userId]?.[n] ?? 0, 10) * 1.5 -
        today[n] / 60 * 6 -
        (load[n]?.minutes ?? 0) / 60 * 0.4;
      free.sort((a, b) => score(b) - score(a) || a.localeCompare(b));
      put(v, free[0]);
      regular[v.slot] = free[0];
    }

    // 空いた人がいなかった訪問は、ぶつかる訪問1件を別の人に回せるなら入れ替える。
    // それでも入らなければ、移動時間を minBuffer まで詰めて入れる
    const place = (v, gap) => {
      const direct = people.filter(n => fits(n, v, gap))
        .sort((a, b) => today[a] - today[b] || a.localeCompare(b))[0];
      if (direct) { put(v, direct); return true; }
      for (const n of people) {
        const blocking = clash(n, v, gap);
        if (blocking.length !== 1 || fixed[blocking[0].v.key]) continue;
        const c = blocking[0].v;
        if (today[n] - len(c) + len(v) > maxMinutes) continue;
        const other = people.find(m => m !== n && fits(m, c, gap));
        if (!other) continue;
        remove(c, n);
        put(c, other);
        put(v, n);
        return true;
      }
      return false;
    };
    const gaps = [...new Set([buffer, ...Array.from({ length: Math.max(buffer - minBuffer, 0) }, (_, i) => buffer - i - 1)])];
    for (const v of left) {
      const gap = gaps.find(g => place(v, g));
      if (gap === undefined) unassigned.push(v.key);
      else if (gap < buffer) tight[v.key] = gap;
    }

    for (const v of list) {
      const n = assign[v.key];
      if (!n) continue;
      load[n] ??= { visits: 0, minutes: 0 };
      load[n].visits++;
      load[n].minutes += len(v);
      (familiar[v.userId] ??= {})[n] = (familiar[v.userId]?.[n] ?? 0) + 1;
    }
  }
  return { assign, unassigned, tight, load };
}
