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

test('移動時間をあけて入らない訪問は、移動時間を詰めて入れる', () => {
  const staff = [{ name: 'A', from: '2026-01-01', to: '' }];
  const visits = [
    { key: 'a', date: '2026-07-01', start: '08:00', end: '08:15', userId: 'U1', slot: 'U1' },
    { key: 'b', date: '2026-07-01', start: '08:20', end: '08:35', userId: 'U2', slot: 'U2' },
  ];
  assert.deepEqual(assignStaff(visits, staff, { buffer: 10 }).unassigned, ['b']);
  const r = assignStaff(visits, staff, { buffer: 10, minBuffer: 0 });
  assert.deepEqual(r.unassigned, []);
  assert.equal(r.assign.b, 'A');
  assert.equal(r.tight.b, 5);
});

test('移動時間を守れないときは、開始を遅らせず前倒しだけで入れる', () => {
  const staff = [{ name: 'A', from: '2026-01-01', to: '' }];
  const visits = [
    { key: 'q', date: '2026-07-01', start: '08:00', end: '08:20', userId: 'U1', slot: 'U1' },
    { key: 'r', date: '2026-07-01', start: '08:21', end: '08:40', userId: 'U2', slot: 'U2' },
    { key: 's', date: '2026-07-01', start: '09:00', end: '09:20', userId: 'U3', slot: 'U3' },
    { key: 't', date: '2026-07-01', start: '09:21', end: '09:40', userId: 'U4', slot: 'U4' },
  ];
  const fixed = { r: 'A', s: 'A' };
  assert.deepEqual(assignStaff(visits, staff, { buffer: 2, fixed }).unassigned, ['q', 't']);
  const r = assignStaff(visits, staff, { buffer: 2, shift: 4, fixed });
  // q は1分前倒しすれば r の前に入る
  assert.equal(r.assign.q, 'A');
  assert.equal(r.shifted.q, 1);
  // t は s の直後なので、遅らせないと入らない（遅らせはしない）
  assert.deepEqual(r.unassigned, ['t']);
});

test('いくつかの組み方を試して、空欄の少ないものを使う', async () => {
  const { assignBest } = await import('../js/assign.js');
  const staff = [{ name: 'A', from: '2026-01-01', to: '' }, { name: 'B', from: '2026-01-01', to: '' }];
  const visits = Array.from({ length: 12 }, (_, i) => ({
    key: `v${i}`, date: '2026-07-01', start: `08:${String(i * 5).padStart(2, '0')}`, end: `08:${String(i * 5 + 9).padStart(2, '0')}`, userId: `U${i}`, slot: `U${i}`,
  }));
  const one = assignStaff(visits, staff, { buffer: 1 });
  const best = assignBest(visits, staff, { buffer: 1 });
  assert.ok(best.unassigned.length <= one.unassigned.length);
  assert.ok(Object.values(best.tight).every(g => g < 1));
});

test('続けて入る訪問は、前の訪問を少し前倒しして、次の訪問を予定どおりに始める', () => {
  const staff = [{ name: 'A', from: '2026-01-01', to: '' }];
  const visits = [
    { key: 'a', date: '2026-07-01', start: '08:00', end: '08:15', userId: 'U1', slot: 'U1' },
    { key: 'b', date: '2026-07-01', start: '08:15', end: '08:30', userId: 'U2', slot: 'U2' },
  ];
  assert.deepEqual(assignStaff(visits, staff, { buffer: 1 }).unassigned, ['b']);
  const r = assignStaff(visits, staff, { buffer: 1, shift: 4 });
  assert.deepEqual(r.unassigned, []);
  assert.equal(r.shifted.a, 1);
  assert.equal(r.shifted.b, undefined);
});

test('ちょうど続く訪問は、前の訪問の終了を1分早めて入れる。時間区分をまたぐときは早めない', () => {
  const staff = [{ name: 'A', from: '2026-01-01', to: '' }];
  const visits = [
    { key: 'a', date: '2026-07-01', start: '08:00', end: '08:15', userId: 'U1', slot: 'U1' },
    { key: 'b', date: '2026-07-01', start: '08:15', end: '08:30', userId: 'U2', slot: 'U2' },
    { key: 'c', date: '2026-07-01', start: '09:00', end: '09:20', userId: 'U3', slot: 'U3' },  // 20分ちょうど
    { key: 'd', date: '2026-07-01', start: '09:20', end: '09:35', userId: 'U4', slot: 'U4' },
  ];
  const r = assignStaff(visits, staff, { buffer: 1, trimEnd: 1 });
  assert.equal(r.assign.b, 'A');
  assert.equal(r.trimmed.a, 1);
  assert.equal(r.shifted.b, undefined);
  assert.deepEqual(r.unassigned, ['d']);
  assert.equal(r.trimmed.c, undefined);
});

test('拘束時間の上限を超えないように振り分ける', () => {
  const staff = [{ name: 'A', from: '2026-01-01', to: '' }, { name: 'B', from: '2026-01-01', to: '' }];
  const visits = [
    { key: 'm', date: '2026-07-01', start: '07:00', end: '07:20', userId: 'U1', slot: 'U1' },
    { key: 'n', date: '2026-07-01', start: '22:00', end: '22:20', userId: 'U1', slot: 'U1n' },
  ];
  const r = assignStaff(visits, staff, { buffer: 1, maxSpan: 13 * 60 });
  assert.notEqual(r.assign.m, r.assign.n);
  const one = assignStaff(visits, [staff[0]], { buffer: 1, maxSpan: 13 * 60 });
  assert.deepEqual(one.unassigned, ['n']);
});

test('補充のヘルパーは、ほかのヘルパーで埋まらなかった訪問だけに入る', async () => {
  const { assignWithBackup } = await import('../js/assign.js');
  const staff = parseStaff('介護花子 2026年2月1日〜現在\n応援一郎 2026年7月1日〜現在 介護福祉士 補充');
  assert.deepEqual(staff[1], { name: '応援一郎', from: '2026-07-01', to: '', note: '介護福祉士 補充', backup: true });
  const visits = [
    { key: 'a', date: '2026-07-01', start: '14:00', end: '14:30', userId: 'U1', slot: 'U1' },
    { key: 'b', date: '2026-07-01', start: '14:10', end: '14:40', userId: 'U2', slot: 'U2' },
    { key: 'c', date: '2026-07-01', start: '16:00', end: '16:30', userId: 'U3', slot: 'U3' },
  ];
  const r = assignWithBackup(visits, staff, { buffer: 1 });
  assert.equal(r.assign.a, '介護花子');
  assert.equal(r.assign.b, '応援一郎');
  assert.equal(r.assign.c, '介護花子');
  assert.deepEqual(r.unassigned, []);
});
