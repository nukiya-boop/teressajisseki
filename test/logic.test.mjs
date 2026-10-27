import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRecords } from '../js/csv.js';
import { ALIASES, STATUS, expandPlans, reconcile, confirmPlanned } from '../js/logic.js';

const plans = [
  { userId: 'U1', userName: '山田花子', weekday: '月水', start: '10:00', end: '11:00', service: '身体介護', code: '111111' },
];
const shifts = [
  { date: '2026/11/02', staff: '佐藤', start: '09:00', end: '17:00' },
  { date: '2026/11/04', staff: '鈴木', start: '09:00', end: '12:00' },
  { date: '2026/11/09', staff: '佐藤', start: '13:00', end: '17:00' },
];

test('週間プランを月の日付に展開する', () => {
  const days = expandPlans(plans, '2026-11').map(p => p.date);
  assert.deepEqual(days.slice(0, 3), ['2026-11-02', '2026-11-04', '2026-11-09']);
  assert.equal(days.length, 9);
});

test('予定・シフト・実績が揃うとテレッサがつく', () => {
  const actuals = [
    { date: '2026/11/02', userId: 'U1', start: '10:05', end: '11:00', staff: '佐藤' },
    { date: '2026-11-04', userId: 'U1', start: '10:00', end: '11:40', staff: '鈴木' },
    { date: '2026-11-09', userId: 'U1', start: '10:00', end: '11:00', staff: '佐藤' },
    { date: '2026-11-10', userId: 'U1', start: '15:00', end: '16:00', staff: '佐藤' },
  ];
  const rows = reconcile({ plans, shifts, actuals, month: '2026-11' });
  const byDate = Object.fromEntries(rows.map(r => [r.date, r]));
  assert.equal(byDate['2026-11-02'].status, STATUS.OK);
  assert.equal(byDate['2026-11-02'].teressa, true);
  assert.equal(byDate['2026-11-04'].status, STATUS.TIME_DIFF);
  assert.equal(byDate['2026-11-09'].status, STATUS.NO_SHIFT);
  assert.equal(byDate['2026-11-10'].status, STATUS.UNPLANNED);
  assert.equal(byDate['2026-11-11'].status, STATUS.PLANNED);
});

test('未実績を予定どおり確定するとシフトの担当者で実績化される', () => {
  const rows = reconcile({ plans, shifts, actuals: [], month: '2026-11' });
  const confirmed = confirmPlanned(rows);
  assert.deepEqual(confirmed.map(a => [a.date, a.staff]), [['2026-11-02', '佐藤'], ['2026-11-04', '鈴木']]);
  const after = reconcile({ plans, shifts, actuals: confirmed, month: '2026-11' });
  assert.equal(after.filter(r => r.teressa).length, 2);
});

test('日本語見出しのCSV・タブ区切りを読み込める', () => {
  const csv = '﻿利用者ID,利用者名,曜日,開始,終了,サービス内容\r\nU1,"山田, 花子",月,10:00,11:00,身体介護\r\n';
  assert.deepEqual(parseRecords(csv, ALIASES.careplan)[0],
    { userId: 'U1', userName: '山田, 花子', weekday: '月', start: '10:00', end: '11:00', service: '身体介護' });
  const tsv = '日付\t担当者\t出勤\t退勤\n2026/11/02\t佐藤\t9:00\t17:00';
  assert.equal(parseRecords(tsv, ALIASES.shift)[0].staff, '佐藤');
});
