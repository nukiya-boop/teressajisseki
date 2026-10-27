import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStaff, assignStaff, activeOn } from '../js/assign.js';

const staffText = `氏名 在籍期間
介護花子 2026年2月1日〜現在
TEST HELPER ONE 2026年2月1日〜4月30日
介護次郎 2026年4月1日〜6月15日`;

test('ヘルパーと在籍期間を読む', () => {
  const staff = parseStaff(staffText);
  assert.deepEqual(staff, [
    { name: '介護花子', from: '2026-02-01', to: '' },
    { name: 'TEST HELPER ONE', from: '2026-02-01', to: '2026-04-30' },
    { name: '介護次郎', from: '2026-04-01', to: '2026-06-15' },
  ]);
  assert.deepEqual(activeOn(staff, '2026-05-01').map(p => p.name), ['介護花子', '介護次郎']);
  assert.deepEqual(activeOn(staff, '2026-03-01').map(p => p.name), ['介護花子', 'TEST HELPER ONE']);
});

test('在籍期間内で、同じ時間に重ならないように振り分ける', () => {
  const staff = parseStaff(staffText);
  const v = (key, date, start, end, userId) => ({ key, date, start, end, userId, slot: `${userId}|${start}` });
  const visits = [
    v('a', '2026-03-02', '10:00', '10:30', 'U1'),
    v('b', '2026-03-02', '10:00', '10:30', 'U2'),
    v('c', '2026-03-02', '10:15', '10:45', 'U3'),  // 2人とも埋まっている
    v('d', '2026-03-02', '10:35', '11:00', 'U4'),  // 移動10分があるので 10:30 終わりの人は入れない
    v('e', '2026-03-02', '10:40', '11:00', 'U5'),
    v('f', '2026-05-07', '09:00', '09:30', 'U1'),  // TEST HELPER ONE は退職済み
  ];
  const { assign, unassigned, load } = assignStaff(visits, staff, { buffer: 10 });
  assert.notEqual(assign.a, assign.b);
  assert.deepEqual(unassigned, ['c', 'd']);
  assert.ok(assign.e);
  assert.notEqual(assign.f, 'TEST HELPER ONE');
  assert.equal(load['介護花子'].visits + load['TEST HELPER ONE'].visits + load['介護次郎'].visits, 4);
});

test('同じ訪問枠には同じヘルパーが続けて入り、決まっている担当者は変えない', () => {
  const staff = parseStaff(staffText);
  const visits = [1, 2, 3].map(d => ({ key: `k${d}`, date: `2026-03-0${d}`, start: '08:00', end: '08:30', userId: 'U1', slot: 'U1|08:00' }));
  const { assign } = assignStaff(visits, staff, { fixed: { k1: 'TEST HELPER ONE' } });
  assert.deepEqual([assign.k1, assign.k2, assign.k3], ['TEST HELPER ONE', 'TEST HELPER ONE', 'TEST HELPER ONE']);
});
