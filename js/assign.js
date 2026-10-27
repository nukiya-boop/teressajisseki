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

// 訪問介護の時間区分の境目（分）。終了を早めてもこれを下回らないようにする
const BANDS = [20, 30, 45, 60, 90];

export function activeOn(staff, date) {
  return staff.filter(p => p.from <= date && (!p.to || date <= p.to));
}

// visits: [{ key, date, start, end, userId, slot }]（slot は同じ訪問枠を見分ける文字列）
// fixed: すでに担当者が決まっている訪問 { key: 氏名 }（シフト・手入力）
// minBuffer: 移動時間をあけて入れられなかった訪問は、移動時間をここまで詰めて入れる（tight に記録）
// shift: それでも入らなければ、訪問をこの分数まで前倒しして入れる（shifted に記録）。
//        開始は予定より遅らせない。提供時間の長さは変えない
// 戻り値: { assign: { key: 氏名 }, unassigned: [key], tight: { key: 前の訪問との間隔(分) },
//          shifted: { key: 開始を早めた分数 }, load: { 氏名: { visits, minutes } } }
// trimEnd: 直前の訪問の終了をこの分数まで早めて、次の訪問を予定どおりに始める（trimmed に記録）。
//          時間区分（20・30・45・60・90分）をまたいで短くなる場合は早めない
export function assignStaff(visits, staff, { buffer = 10, minBuffer = buffer, shift = 0, trimEnd = 0, maxMinutes = 600, fixed = {} } = {}) {
  const assign = {};
  const unassigned = [];
  const tight = {};
  const shifted = {};
  const trimmed = {};
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
      // 直前の訪問1件の終了を少し早めれば、この訪問を予定どおりの開始で入れられる
      for (const n of people) {
        const blocking = clash(n, v, gap);
        if (blocking.length !== 1) continue;
        const c = blocking[0].v;
        if (fixed[c.key] || c.range[0] >= v.range[0]) continue;
        const need = c.range[1] + gap - v.range[0];
        const dur = len(c);
        if (need < 1 || need + (trimmed[c.key] ?? 0) > trimEnd || today[n] + len(v) > maxMinutes) continue;
        if (BANDS.some(t => dur >= t && dur - need < t)) continue;
        const orig = c.range;
        remove(c, n);
        c.range = [orig[0], orig[1] - need];
        if (!clash(n, v, gap).length) {
          put(c, n);
          put(v, n);
          trimmed[c.key] = (trimmed[c.key] ?? 0) + need;
          return true;
        }
        c.range = orig;
        put(c, n);
      }
      // 直前の訪問1件を数分前倒しすれば、この訪問を予定どおりの開始で入れられる
      for (const n of people) {
        const blocking = clash(n, v, gap);
        if (blocking.length !== 1) continue;
        const c = blocking[0].v;
        if (fixed[c.key] || c.range[0] >= v.range[0]) continue;
        const need = c.range[1] + gap - v.range[0];
        if (need < 1 || need + (shifted[c.key] ?? 0) > shift || today[n] + len(v) > maxMinutes) continue;
        const orig = c.range;
        remove(c, n);
        c.range = [orig[0] - need, orig[1] - need];
        if (!clash(n, c, gap).length && !clash(n, v, gap).length) {
          put(c, n);
          put(v, n);
          shifted[c.key] = (shifted[c.key] ?? 0) + need;
          return true;
        }
        c.range = orig;
        put(c, n);
      }
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
    const earlier = Array.from({ length: shift + 1 }, (_, i) => i);
    for (const v of left) {
      const orig = v.range;
      let gap;
      const offset = earlier.find(o => {
        v.range = [orig[0] - o, orig[1] - o];
        gap = gaps.find(g => place(v, g));
        return gap !== undefined;
      });
      if (offset === undefined) { v.range = orig; unassigned.push(v.key); continue; }
      if (gap < buffer) tight[v.key] = gap;
      if (offset) shifted[v.key] = offset;
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
  return { assign, unassigned, tight, shifted, trimmed, load };
}

// 最初に広めの移動時間で組んでから詰めるほうが、朝の訪問に人が偏らず空欄が減ることがある。
// いくつかの組み方を試し、空欄がいちばん少ないものを使う（移動時間の下限は buffer のまま）。
export function assignBest(visits, staff, opts = {}) {
  const buffer = opts.buffer ?? 10;
  const floor = Math.min(buffer, opts.minBuffer ?? buffer);
  let best = null;
  for (const start of [...new Set([buffer, 5, 10, 15].filter(b => b >= buffer))]) {
    const r = assignStaff(visits, staff, { ...opts, buffer: start, minBuffer: floor });
    // 実際に求めた移動時間（buffer）を満たしているものは「詰めた」扱いにしない
    r.tight = Object.fromEntries(Object.entries(r.tight).filter(([, g]) => g < buffer));
    if (!best || r.unassigned.length < best.unassigned.length) best = r;
  }
  return best;
}
