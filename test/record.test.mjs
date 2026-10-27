import test from 'node:test';
import assert from 'node:assert/strict';
import { detectProfile, detectCareLevel, resolveItems, generateComment, tierOf, perWeek, defaultSlot, itemsForVisit } from '../js/record.js';

const planText = `訪問介護計画書
利用者：山田 花子　要介護３　認知症高齢者の日常生活自立度 Ⅱb
援助内容：排泄介助（オムツ交換・陰部洗浄）、更衣介助、体位変換、服薬確認
生活援助：居室の掃除、洗濯`;

test('計画書の文から介護度・認知症・援助項目を吸い上げる', () => {
  const p = detectProfile(planText);
  assert.equal(p.careLevel, '要介護3');
  assert.equal(p.dementia, true);
  for (const n of ['トイレ介助', 'おむつ交換', '部分浴', '更衣介助', '体位変換', '服薬介助・確認', '掃除', '洗濯']) {
    assert.ok(p.items.includes(n), n);
  }
});

test('ケアプラン第1表の「要介護１・要介護２・…」の並びは介護度として読まない', () => {
  assert.equal(detectCareLevel('要介護状態区分 要介護１ ・ 要介護２ ・ 要介護３ ・ 要介護４ ・ 要介護５'), '');
  assert.equal(detectCareLevel('要介護状態区分 要介護 2'), '要介護2');
  assert.equal(detectProfile('要支援2 認知症なし 掃除').dementia, false);
});

test('頻度を週あたりの回数にする', () => {
  assert.equal(perWeek('週に2回'), 2);
  assert.equal(perWeek('毎日'), 7);
  assert.equal(perWeek(''), null);
});

const versions = [
  { date: '2026-02-01', slots: [
    { no: 1, start: '10:00', end: '10:59', days: [3], service: '身体介護', items: ['全身浴', '洗髪', '更衣介助', '水分補給'] },
    { no: 2, start: '20:00', end: '20:19', days: [0, 1, 2, 3, 4, 5, 6], service: '身体介護', items: ['就寝介助', '口腔ケア', '服薬介助・確認'] },
  ] },
  { date: '2026-05-01', slots: [
    { no: 1, start: '10:00', end: '10:29', days: [2, 4], service: '生活援助', items: ['掃除', '洗濯', 'シーツ交換'] },
    { no: 2, start: '14:00', end: '14:55', days: [0, 1, 2, 3, 4, 5, 6], service: '身体介護', items: ['全身浴', '水分補給'] },
  ] },
];

test('訪問介護計画書の版と訪問枠から、その日のレ点を決める', () => {
  const profile = { versions };
  const feb = resolveItems({ profile, date: '2026-02-04', start: '10:00', service: '身体介護２' });
  assert.ok(feb.items.includes('全身浴') && feb.items.includes('顔色・発汗・体温等') && feb.items.includes('戸締り'));
  assert.equal(feb.source, '訪問介護計画書 2026-02-01 No.1');

  const night = resolveItems({ profile, date: '2026-03-10', start: '20:00', service: '身体介護０１・夜' });
  assert.ok(night.items.includes('就寝介助') && !night.items.includes('全身浴'));

  const life = resolveItems({ profile, date: '2026-06-02', start: '10:00', service: '生活援助２' });
  assert.ok(life.items.includes('シーツ交換') && life.items.includes('顔色・発汗・体温等'));
  assert.ok(!life.items.includes('全身浴'));

  const manual = resolveItems({ profile: { versions, slotOverrides: { '10:00|生活援助２': ['掃除'] } }, date: '2026-06-02', start: '10:00', service: '生活援助２' });
  assert.deepEqual(manual.items, ['掃除']);
});

test('計画書がなければケアプラン第2表の頻度で、毎回ではない項目を外す', () => {
  const profile = { planRows: [
    { items: ['全身浴', '更衣介助'], perWeek: 2 },
    { items: ['起床介助', '就寝介助', '整容'], perWeek: 7 },
  ] };
  const night = itemsForVisit(defaultSlot(profile, { start: '20:20', service: '身体介護０１・夜', slotPerWeek: 7 }), '2026-06-01');
  assert.ok(night.includes('就寝介助') && night.includes('整容'));
  assert.ok(!night.includes('起床介助') && !night.includes('全身浴'));
  const twice = itemsForVisit(defaultSlot(profile, { start: '14:00', service: '身体介護２', slotPerWeek: 2 }), '2026-06-03');
  assert.ok(twice.includes('全身浴'));
});

test('コメントは介護度・認知症に合わせて作られ、同じ訪問では同じ文になる', () => {
  const p = { careLevel: '要介護3', dementia: true };
  const items = ['おむつ交換', '更衣介助', '体位変換'];
  const a = generateComment({ profile: p, items, seed: '2026-11-02|U001|10:00' });
  assert.equal(a, generateComment({ profile: p, items, seed: '2026-11-02|U001|10:00' }));
  assert.match(a, /作話|同じ質問|日付|落ち着いて/);
  assert.equal(tierOf('要介護3'), 'heavy');
  assert.equal(tierOf('要支援1'), 'light');
  const light = generateComment({ profile: { careLevel: '要支援1', dementia: false }, items: ['掃除'], seed: 'x' });
  assert.doesNotMatch(light, /作話|ベッド上で臥床/);
});
