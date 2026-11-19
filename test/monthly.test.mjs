import test from 'node:test';
import assert from 'node:assert/strict';
import { staffRole, helperVisits, ichiranRows, kinmuboHtml, ichiranCsv } from '../js/monthly.js';
import { parseStaff } from '../js/assign.js';

const staff = parseStaff('介護花子 2026年2月1日〜現在 常勤\n管理一郎 2026年2月1日〜現在 管理者 サ責 常勤\n応援次郎 2026年3月10日〜現在 非常勤 補充');
const rows = [
  { date: '2026-03-02', staff: '介護花子', actualStart: '08:00', actualEnd: '08:30' },
  { date: '2026-03-02', staff: '介護花子', actualStart: '10:00', actualEnd: '10:45', recEnd: '10:44' },
  { date: '2026-03-03', staff: '管理一郎', planStart: '14:00', planEnd: '15:00' },
  { date: '2026-03-03', staff: '', planStart: '14:00', planEnd: '15:00' },
];

test('備考から職種・勤務形態を読む', () => {
  assert.deepEqual(staffRole(staff[1]), { job: '管理者兼サ責', form: '常勤', kenmu: '' });
  assert.deepEqual(staffRole(staff[2]), { job: 'ヘルパー', form: '非常勤', kenmu: '' });
});

test('一覧表は管理者を先に、日ごとの提供時間を0.1時間で出す', () => {
  const visits = helperVisits(rows);
  assert.deepEqual(visits['介護花子']['2026-03-02'], [[480, 510], [600, 644]]);
  const list = ichiranRows({ ym: '2026-03', staff, visits });
  assert.deepEqual(list.map(r => r.name), ['管理一郎', '介護花子', '応援次郎']);
  assert.equal(list[1].hours[1], 1.2);
  assert.equal(list[0].hours[2], 1);
  assert.equal(list[1].total, 1.2);
  assert.equal(ichiranCsv({ ym: '2026-03', staff, visits })[0].length, 4 + 31 + 1);
});

test('出勤簿は始業・終業・実働・休憩を入れ、在籍前は空ける', () => {
  const html = kinmuboHtml({ ym: '2026-03', staff, visits: helperVisits(rows), company: '株式会社テスト', office: 'テスト介護' });
  assert.equal((html.match(/class="kb"/g) ?? []).length, 3);
  assert.match(html, /<td>出勤<\/td><td>8:00<\/td><td>10:44<\/td><td>1:30<\/td><td>1:14<\/td>/);
  assert.match(html, /入職前/);
  assert.match(html, /株式会社テスト 出勤簿/);
});
