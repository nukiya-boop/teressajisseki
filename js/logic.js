// ケアプラン・シフト・実績を突き合わせて、実績表とテレッサを作る純粋ロジック。

export const ALIASES = {
  careplan: {
    userId: ['利用者ID', '利用者番号', 'ID'],
    userName: ['利用者名', '利用者', '氏名'],
    weekday: ['曜日'],
    start: ['開始', '開始時間', '開始時刻'],
    end: ['終了', '終了時間', '終了時刻'],
    service: ['サービス内容', 'サービス', '内容'],
    code: ['サービスコード', 'コード'],
  },
  shift: {
    date: ['日付', '勤務日'],
    staff: ['担当者', '職員', 'ヘルパー', 'スタッフ', '氏名'],
    start: ['開始', '開始時間', '出勤'],
    end: ['終了', '終了時間', '退勤'],
  },
  actual: {
    date: ['日付', '提供日'],
    userId: ['利用者ID', '利用者番号', 'ID'],
    start: ['開始', '開始時間', '開始時刻'],
    end: ['終了', '終了時間', '終了時刻'],
    service: ['サービス内容', 'サービス', '内容'],
    staff: ['担当者', '職員', 'ヘルパー', 'スタッフ'],
  },
};

export const STATUS = {
  OK: 'テレッサ',
  TIME_DIFF: '時間差あり',
  NO_SHIFT: 'シフト外',
  PLANNED: '未実績',
  UNPLANNED: '計画外',
};

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export function toMinutes(t) {
  const m = /^(\d{1,2}):?(\d{2})$/.exec(String(t).trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

export function normalizeDate(d) {
  const m = /^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/.exec(String(d).trim());
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : '';
}

function weekdayIndexes(text) {
  return [...String(text)].map(c => WEEKDAYS.indexOf(c)).filter(i => i >= 0);
}

// 週間ケアプランを指定月 (YYYY-MM) の日付ごとの予定に展開する。
// 日付つきの予定（サービス提供票から読んだもの）はその日だけに置く。
export function expandPlans(plans, month) {
  const dated = plans.filter(p => p.date);
  const weekly = plans.filter(p => !p.date);
  const [y, m] = month.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  const out = [];
  for (let d = 1; d <= days; d++) {
    const wd = new Date(y, m - 1, d).getDay();
    const date = `${month}-${String(d).padStart(2, '0')}`;
    for (const p of weekly) {
      if (weekdayIndexes(p.weekday).includes(wd)) out.push({ ...p, date });
    }
  }
  return [...out, ...dated.filter(p => p.date.startsWith(month))];
}

function covers(shift, date, start, end) {
  return normalizeDate(shift.date) === date &&
    toMinutes(shift.start) <= start && toMinutes(shift.end) >= end;
}

function overlaps(a1, a2, b1, b2) {
  if (a2 <= a1) a2 += 1440;
  if (b2 <= b1) b2 += 1440;
  return a1 < b2 && b1 < a2;
}

// 予定・シフト・実績から月間の実績表を作る。
// toleranceMin: 予定と実績の開始・終了のずれをこの分数まで許容する。
export function reconcile({ plans, shifts, actuals, month, toleranceMin = 10 }) {
  const planned = expandPlans(plans, month);
  const userNames = Object.fromEntries(plans.map(p => [p.userId, p.userName]));
  const monthActuals = actuals
    .map(a => ({ ...a, date: normalizeDate(a.date) }))
    .filter(a => a.date.startsWith(month));
  const used = new Set();
  const rows = [];

  for (const p of planned) {
    const ps = toMinutes(p.start), pe = toMinutes(p.end);
    const idx = monthActuals.findIndex((a, i) => !used.has(i) &&
      a.date === p.date && a.userId === p.userId &&
      overlaps(ps, pe, toMinutes(a.start), toMinutes(a.end)));

    if (idx < 0) {
      const shift = shifts.find(s => covers(s, p.date, ps, pe));
      rows.push(row(p, null, shift?.staff ?? '', STATUS.PLANNED));
      continue;
    }
    used.add(idx);
    const a = monthActuals[idx];
    const as = toMinutes(a.start), ae = toMinutes(a.end);
    const staff = a.staff || shifts.find(s => covers(s, a.date, as, ae))?.staff || '';
    const inShift = shifts.some(s => s.staff === staff && covers(s, a.date, as, ae));
    const onTime = Math.abs(as - ps) <= toleranceMin && Math.abs(ae - pe) <= toleranceMin;
    const status = !inShift ? STATUS.NO_SHIFT : !onTime ? STATUS.TIME_DIFF : STATUS.OK;
    rows.push(row(p, a, staff, status));
  }

  monthActuals.forEach((a, i) => {
    if (used.has(i)) return;
    rows.push(row({ userId: a.userId, userName: userNames[a.userId] ?? '', date: a.date,
      service: a.service, code: '' }, a, a.staff, STATUS.UNPLANNED));
  });

  return rows.sort((x, y) =>
    x.userId.localeCompare(y.userId) || x.date.localeCompare(y.date) ||
    toMinutes(x.planStart || x.actualStart) - toMinutes(y.planStart || y.actualStart));
}

function row(p, a, staff, status) {
  return {
    date: p.date,
    userId: p.userId,
    userName: p.userName ?? '',
    service: a?.service || p.service || '',
    code: p.code ?? '',
    office: p.office ?? '',
    planStart: p.start ?? '',
    planEnd: p.end ?? '',
    actualStart: a?.start ?? '',
    actualEnd: a?.end ?? '',
    staff,
    status,
    teressa: status === STATUS.OK,
  };
}

// 未実績の行を予定どおり実績化するための実績レコードを作る（シフトで担当者が決まるもののみ）。
export function confirmPlanned(rows) {
  return rows
    .filter(r => r.status === STATUS.PLANNED && r.staff)
    .map(r => ({ date: r.date, userId: r.userId, start: r.planStart, end: r.planEnd,
      service: r.service, staff: r.staff }));
}

export function summarize(rows) {
  const counts = Object.fromEntries(Object.values(STATUS).map(s => [s, 0]));
  for (const r of rows) counts[r.status]++;
  return counts;
}
