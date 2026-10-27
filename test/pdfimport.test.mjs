import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTeikyo, parseHomeCarePlan, parseAssessment, parseDays, parseDates, classifyPage } from '../js/pdfimport.js';

// pdf.js から取り出した形の文字片（架空の利用者）
const it = (x, y, str, w = str.length * 9) => ({ x, y, str, w });

function teikyoPage() {
  const items = [
    it(124, 73, '令和8年6月'), it(199, 73, '分'), it(340, 69, 'サービス提供票'),
    it(20, 148, '被保険者'), it(77, 154, '0 0 1 2 3', 65), it(148, 154, '4'), it(162, 154, '5'), it(176, 154, '6 7 8', 37),
    it(312, 157, '介護 太郎'), it(453, 157, '様'), it(219, 160, '被保険者氏名'),
    it(351, 176, '要介護 3'), it(219, 175, '要介護状態区分'),
    it(323, 244, '曜日'),
    it(18, 254, '10:00～'), it(18, 262, '10:29'), it(53, 254, '生活援助２'), it(129, 255, 'テスト介護'), it(323, 256, '予定'),
    it(18, 278, '14:00～'), it(18, 286, '14:55'), it(53, 278, '訪看Ⅰ２'), it(129, 279, 'テスト看護'), it(323, 280, '予定'),
  ];
  // 2026年6月1日は月曜
  for (let d = 0; d < 30; d++) items.push(it(349 + 14 * d, 244, '月火水木金土日'[d % 7], 9));
  items.push(it(378, 256, '1', 6), it(476, 256, '1 1', 20), it(816, 256, '3', 6));
  items.push(it(350, 280, '1', 6));
  return items;
}

test('サービス提供票から月・利用者・予定日を読む', () => {
  const t = parseTeikyo(teikyoPage());
  assert.equal(t.month, '2026-06');
  assert.equal(t.name, '介護 太郎');
  assert.equal(t.insuredNo, '0012345678');
  assert.equal(t.careLevel, '要介護3');
  const life = t.visits.filter(v => v.service === '生活援助２');
  assert.deepEqual(life.map(v => v.date), ['2026-06-03', '2026-06-10', '2026-06-11']);
  assert.equal(life[0].start, '10:00');
  assert.equal(life[0].end, '10:29');
  assert.equal(life[0].office, 'テスト介護');
});

test('書類の種類を見分ける', () => {
  assert.equal(classifyPage('令和8年6月 サービス提供票別表'), 'skip');
  assert.equal(classifyPage('サービス利用票'), 'teikyo');
  assert.equal(classifyPage('訪問介護計画書 … サービス利用票（令和8年2月分）より転記'), 'homecareplan');
  assert.equal(classifyPage('第２表 居宅サービス計画書（２）'), 'careplan2');
});

test('曜日の書き方を読む', () => {
  assert.deepEqual(parseDays('水・金'), [3, 5]);
  assert.deepEqual(parseDays('毎日'), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(parseDays('月～金'), [1, 2, 3, 4, 5]);
  assert.deepEqual(parseDays('1日〜6日のみ'), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(parseDates('1日〜6日のみ'), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(parseDates('5日・25日・29日のみ'), [5, 25, 29]);
  assert.equal(parseDates('水・金'), null);
});

test('訪問介護計画書の版・訪問枠・具体的内容を読む', () => {
  const page1 = [it(100, 50, '作成日：'), it(140, 50, '令和8年5月1日'), it(100, 70, '氏名'), it(130, 70, '介護 太郎'), it(200, 70, '様'), it(300, 70, '要介護2')];
  const page2 = [
    it(264, 80, '週間サービス計画表'),
    it(109, 97, 'No.'), it(143, 97, '時間帯'), it(223, 97, '曜日'), it(294, 97, 'サービス区分'), it(369, 97, '保険内外'),
    it(114, 116, '1'), it(131, 116, '10:00'), it(150, 116, '～'), it(158, 116, '10:29'), it(227, 116, '火・木'), it(302, 116, '生活援助'), it(372, 116, '保険内'),
    it(113, 139, '2'), it(132, 139, '20:00'), it(151, 139, '～'), it(159, 139, '20:15'), it(223, 139, '毎日'), it(302, 139, '身体介護'), it(372, 139, '保険内'),
    it(259, 258, 'サービス内容（'), it(312, 258, 'No.1'), it(328, 258, '）'),
    it(122, 273, 'サービス区分', 46), it(221, 273, 'サービスの具体的内容'), it(350, 273, '所要時間', 30), it(426, 273, '留意事項'),
    it(129, 299, '生活援助', 30), it(183, 295, '掃除、洗濯、'), it(183, 308, 'シーツ交換等。'), it(426, 295, '入浴は清拭に変更'),
    it(259, 340, 'サービス内容（'), it(312, 340, 'No.2'), it(328, 340, '）'),
    it(122, 351, 'サービス区分', 46), it(221, 351, 'サービスの具体的内容'), it(350, 351, '所要時間', 30), it(426, 351, '留意事項'),
    it(129, 376, '身体介護', 30), it(183, 372, '就寝介助（更衣、口腔ケア）、服薬確認。'),
    it(107, 725, '特記事項'),
  ];
  const { name, careLevel, versions } = parseHomeCarePlan([page1, page2]);
  assert.equal(name, '介護 太郎');
  assert.equal(careLevel, '要介護2');
  assert.equal(versions.length, 1);
  assert.equal(versions[0].date, '2026-05-01');
  const [s1, s2] = versions[0].slots;
  assert.deepEqual([s1.start, s1.end, s1.days, s1.service], ['10:00', '10:29', [2, 4], '生活援助']);
  assert.deepEqual(s1.items, ['掃除', '洗濯', 'シーツ交換']);
  assert.ok(!s1.items.includes('清拭'), '留意事項の欄は読まない');
  assert.deepEqual(s2.items, ['口腔ケア', '更衣介助', '就寝介助', '服薬介助・確認']);
});

test('アセスメントシートの☑から介護度・認知症自立度を読む', () => {
  const page = [
    it(20, 60, '利用者氏名'), it(120, 60, '介護 太郎'), it(300, 60, '性別'),
    it(20, 160, '要介護度'), it(100, 160, '□ 要介護1'), it(170, 160, '☑', 12), it(182, 160, '要介護2'),
    it(20, 571, '自立度'), it(100, 571, '□ 自立'), it(140, 571, '□ Ⅰ'), it(180, 571, '☑', 12), it(192, 571, 'Ⅱa'), it(230, 571, '□ Ⅱb □ Ⅲa □ Ⅲb □ Ⅳ □ M'),
    it(20, 600, '室内：使用機器'), it(150, 600, '☑', 12), it(162, 600, '歩行器'),
  ];
  const a = parseAssessment([page]);
  assert.equal(a.careLevel, '要介護2');
  assert.equal(a.dementiaLevel, 'Ⅱa');
  assert.equal(a.dementia, true);
  assert.equal(a.walker, true);
});
