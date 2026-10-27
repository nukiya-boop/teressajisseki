// 訪問介護計画書・ケアプランからの吸い上げ、レ点の自動入力、記録コメントの下書き生成。

// サービス実施記録のレ点欄。cat: body=身体介護 / life=生活援助 / common=共通 / exit=退室確認
// keys は計画書・ケアプランの文中からこの項目を見つけるための言葉。
export const ITEMS = [
  { group: '事前チェック', name: '顔色・発汗・体温等', cat: 'common', keys: ['バイタル', '体温', '血圧', '顔色', '健康チェック', '体調確認', '体調管理'], always: true },
  { group: '事前チェック', name: '環境整備', cat: 'common', keys: ['環境整備'] },
  { group: '事前チェック', name: '相談援助・情報収集・記録', cat: 'common', keys: ['相談援助', '情報収集', '情報提供'] },
  { group: '排泄介助', name: 'トイレ介助', cat: 'body', keys: ['トイレ介助', 'トイレ誘導', '排泄介助'] },
  { group: '排泄介助', name: 'Pトイレ介助', cat: 'body', keys: ['ポータブルトイレ', 'Pトイレ'] },
  { group: '排泄介助', name: '尿器介助', cat: 'body', keys: ['尿器'] },
  { group: '排泄介助', name: 'パッド交換', cat: 'body', keys: ['パッド'] },
  { group: '排泄介助', name: 'おむつ交換', cat: 'body', keys: ['オムツ', 'おむつ'] },
  { group: '食事介助', name: '食事全介助', cat: 'body', keys: ['食事全介助'] },
  { group: '食事介助', name: '食事一部介助', cat: 'body', keys: ['食事介助', '食事一部介助', '摂食介助'] },
  { group: '食事介助', name: '水分補給', cat: 'body', keys: ['水分補給', '水分摂取'] },
  { group: '食事介助', name: '特段の調理', cat: 'body', keys: ['特段の調理', '刻み食', 'ミキサー食'] },
  { group: '身体清拭・洗髪', name: '清拭', cat: 'body', keys: ['清拭'] },
  { group: '身体清拭・洗髪', name: '洗髪', cat: 'body', keys: ['洗髪'] },
  { group: '身体清拭・洗髪', name: '爪切り', cat: 'body', keys: ['爪切り'] },
  { group: '保清・整容', name: '全身浴', cat: 'body', keys: ['入浴', 'シャワー浴', '洗身'] },
  { group: '保清・整容', name: '部分浴', cat: 'body', keys: ['部分浴', '足浴', '手浴', '陰部洗浄'] },
  { group: '保清・整容', name: '洗面', cat: 'body', keys: ['洗面'] },
  { group: '保清・整容', name: '口腔ケア', cat: 'body', keys: ['口腔ケア', '歯磨き', '義歯'] },
  { group: '保清・整容', name: '整容', cat: 'body', keys: ['整容', '整髪'] },
  { group: '保清・整容', name: '更衣介助', cat: 'body', keys: ['更衣', '着替え'] },
  { group: '移動', name: '体位変換', cat: 'body', keys: ['体位変換', '体交', '褥瘡予防'] },
  { group: '移動', name: '移乗介助', cat: 'body', keys: ['移乗'] },
  { group: '移動', name: '移動介助', cat: 'body', keys: ['移動介助', '歩行介助', '歩行見守り', '手引き歩行'] },
  { group: '移動', name: '通院・外出介助', cat: 'body', keys: ['通院介助', '外出介助', '通院・外出'] },
  { group: '起床就寝', name: '起床介助', cat: 'body', keys: ['起床介助', '起床時の介助'], time: 'morning' },
  { group: '起床就寝', name: '就寝介助', cat: 'body', keys: ['就寝介助', '就寝時の介助'], time: 'night' },
  { group: '服薬', name: '服薬介助・確認', cat: 'body', keys: ['服薬介助', '服薬確認', '内服', '与薬'] },
  { group: '服薬', name: '薬の塗布', cat: 'body', keys: ['塗布', '軟膏'] },
  { group: '服薬', name: '点眼', cat: 'body', keys: ['点眼'] },
  { group: '自立支援', name: '共に行う家事', cat: 'body', keys: ['共に行う', '一緒に行う'] },
  { group: '自立支援', name: '認知症の記憶への働きかけ', cat: 'body', keys: ['記憶への働きかけ', '回想'] },
  { group: '自立支援', name: '転倒予防の声かけ・見守り', cat: 'body', keys: ['転倒予防', '転倒防止'] },
  { group: '掃除', name: '掃除', cat: 'life', keys: ['掃除', '清掃'] },
  { group: '掃除', name: 'ゴミ出し', cat: 'life', keys: ['ゴミ出し', 'ごみ出し'] },
  { group: '洗濯', name: '洗濯', cat: 'life', keys: ['洗濯'] },
  { group: '洗濯', name: '取り入れ・収納', cat: 'life', keys: ['取り入れ', '洗濯物の収納'] },
  { group: '洗濯', name: 'アイロン', cat: 'life', keys: ['アイロン'] },
  { group: '寝具の手入れ', name: 'シーツ交換', cat: 'life', keys: ['シーツ交換'] },
  { group: '寝具の手入れ', name: 'ベッドメイク', cat: 'life', keys: ['ベッドメイク'] },
  { group: '寝具の手入れ', name: '布団干し', cat: 'life', keys: ['布団干し'] },
  { group: '衣類', name: '衣類の整理', cat: 'life', keys: ['衣類の整理', '衣類整理', '衣替え'] },
  { group: '衣類', name: '被服の補修', cat: 'life', keys: ['被服の補修', '衣服の補修'] },
  { group: '調理・配下膳', name: '一般的な調理', cat: 'life', keys: ['調理'] },
  { group: '調理・配下膳', name: '配・下膳', cat: 'life', keys: ['配膳', '下膳'] },
  { group: '調理・配下膳', name: '後片付け', cat: 'life', keys: ['食器洗い', '調理の後片付け'] },
  { group: '買物等', name: '日常品等の買物', cat: 'life', keys: ['買い物', '買物'] },
  { group: '買物等', name: '薬の受取り', cat: 'life', keys: ['薬の受取', '薬の受け取'] },
  { group: '退室確認', name: '火元', cat: 'exit', keys: [], always: true },
  { group: '退室確認', name: '電気', cat: 'exit', keys: [], always: true },
  { group: '退室確認', name: '水道', cat: 'exit', keys: [], always: true },
  { group: '退室確認', name: '戸締り', cat: 'exit', keys: [], always: true },
];

const ITEM = Object.fromEntries(ITEMS.map(it => [it.name, it]));
export const CARE_LEVELS = ['要支援1', '要支援2', '要介護1', '要介護2', '要介護3', '要介護4', '要介護5'];
export const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

const DIGITS = { '１': '1', '２': '2', '３': '3', '４': '4', '５': '5', '一': '1', '二': '2', '三': '3', '四': '4', '五': '5', 'Ⅰ': '1', 'Ⅱ': '2', 'Ⅲ': '3', 'Ⅳ': '4', 'Ⅴ': '5' };
const LEVEL_RE = /要(支援|介護)状?態?(?:区分)?([1-5１-５一二三四五ⅠⅡⅢⅣⅤ])/;

export function detectItems(text) {
  const t = String(text ?? '').replace(/\s+/g, '');
  return ITEMS.filter(it => it.keys.some(k => t.includes(k))).map(it => it.name);
}

export function detectCareLevel(text) {
  // ケアプラン第1表の「要介護１・要介護２・…」は丸囲みが文字に残らないので読まない
  const t = String(text ?? '').replace(/\s+/g, '').replace(/要介護[1-5１-５](?:・要介護[1-5１-５])+/g, '');
  const m = LEVEL_RE.exec(t);
  return m ? `要${m[1]}${DIGITS[m[2]] ?? m[2]}` : '';
}

export function detectDementia(text) {
  const t = String(text ?? '').replace(/\s+/g, '');
  return /認知症|作話|物忘れ|もの忘れ|徘徊|見当識/.test(t) &&
    !/認知症(なし|無し|はなし|は無し|の診断なし)/.test(t);
}

// 計画書・ケアプランの本文から介護度・認知症の有無・援助項目を読み取る。
export function detectProfile(text) {
  return { careLevel: detectCareLevel(text), dementia: detectDementia(text), items: detectItems(text) };
}

// 「週に2回」「毎日」などを週あたりの回数にする（読めなければ null）。
export function perWeek(freq) {
  const t = String(freq ?? '').replace(/\s+/g, '').replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  if (/毎日/.test(t)) return 7;
  let m = /週(?:に)?(\d+)/.exec(t);
  if (m) return Number(m[1]);
  m = /月(?:に)?(\d+)/.exec(t);
  if (m) return Number(m[1]) / 4.3;
  return null;
}

function categoriesFor(service) {
  const s = String(service ?? '');
  const body = /身体|通院|乗降/.test(s), life = s.includes('生活');
  if (body && !life) return ['body', 'common', 'exit'];
  if (life && !body) return ['life', 'common', 'exit'];
  return ['body', 'life', 'common', 'exit'];
}

function timeOk(item, startMin) {
  if (item.time === 'morning') return startMin < 11 * 60;
  if (item.time === 'night') return startMin >= 18 * 60;
  return true;
}

function minutes(t) {
  const m = /(\d{1,2}):(\d{2})/.exec(String(t));
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

export function slotKey(start, service) {
  return `${start}|${service}`;
}

// 訪問枠（時間帯×サービス）ごとの、曜日別レ点の初期値を作る。
// slotPerWeek: その枠の週あたり訪問回数。計画の頻度がこれより少ない項目は曜日未指定の候補にする。
export function defaultSlot(profile, { start, service, slotPerWeek = 7 }) {
  const cats = categoriesFor(service);
  const startMin = minutes(start);
  const rows = profile?.planRows?.length ? profile.planRows
    : [{ items: profile?.items ?? [], perWeek: null }];
  const out = {};
  const all = [0, 1, 2, 3, 4, 5, 6];
  for (const it of ITEMS) {
    if (it.always && cats.includes(it.cat)) out[it.name] = all;
  }
  for (const row of rows) {
    // 起床・就寝の行に書かれた項目は、朝・夜の枠にだけつける
    const rowTime = row.items.some(n => ITEM[n]?.time);
    if (rowTime && !row.items.some(n => ITEM[n]?.time && timeOk(ITEM[n], startMin))) continue;
    for (const n of row.items) {
      const it = ITEM[n];
      if (!it || !cats.includes(it.cat) || !timeOk(it, startMin)) continue;
      const everyVisit = row.perWeek == null || row.perWeek >= slotPerWeek - 0.5;
      if (everyVisit) out[n] = all;
      else if (!out[n]) out[n] = [];
    }
  }
  for (const n of detectItems(service)) out[n] ??= all;
  return out;
}

function weekdayOf(date) {
  return new Date(`${date}T00:00:00`).getDay();
}

// 訪問介護計画書の版のうち、その日に有効なもの（その日以前で最新の版）を選ぶ。
export function planVersionFor(versions, date) {
  const sorted = [...(versions ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.filter(v => v.date <= date).at(-1) ?? sorted[0] ?? null;
}

// 訪問介護計画書の訪問枠のうち、この訪問に当たるものを選ぶ（サービス種別・曜日・開始時刻が近いもの）。
export function matchPlanSlot(version, { date, start, service }) {
  if (!version) return null;
  const cats = categoriesFor(service);
  const wd = weekdayOf(date);
  const s = minutes(start);
  const same = version.slots.filter(sl => categoriesFor(sl.service).some(c => c !== 'common' && c !== 'exit' && cats.includes(c)));
  const near = (list, limit) => list
    .map(sl => ({ sl, d: Math.abs(minutes(sl.start) - s) }))
    .filter(x => x.d <= limit).sort((a, b) => a.d - b.d)[0]?.sl ?? null;
  return near(same.filter(sl => sl.days.includes(wd)), 90) ?? near(same, 30);
}

// その訪問のレ点項目と、どの書類から決めたかを返す。
// 優先順：利用者ごとの手動設定 → 訪問介護計画書 → ケアプラン第2表・その他の書類
export function resolveItems({ profile, date, start, service, slotPerWeek = 7 }) {
  const key = slotKey(start, service);
  const override = profile?.slotOverrides?.[key];
  if (override) return { items: ITEMS.map(it => it.name).filter(n => override.includes(n)), source: '手動設定' };

  const version = planVersionFor(profile?.versions, date);
  const slot = matchPlanSlot(version, { date, start, service });
  if (slot) {
    const cats = categoriesFor(service);
    const set = new Set([...slot.items, ...detectItems(service)]);
    const items = ITEMS.filter(it => (it.always && cats.includes(it.cat)) || set.has(it.name)).map(it => it.name);
    return { items, source: `訪問介護計画書 ${version.date} No.${slot.no}` };
  }
  const items = itemsForVisit(defaultSlot(profile, { start, service, slotPerWeek }), date);
  return { items, source: profile?.planRows?.length ? 'ケアプラン第2表' : (profile?.items?.length ? '計画書の文中' : 'サービス種別のみ') };
}

// その訪問でレ点をつける項目。
export function itemsForVisit(slot, date) {
  const wd = weekdayOf(date);
  return ITEMS.map(it => it.name).filter(n => slot?.[n]?.includes(wd));
}

// ---- コメント文例 ----
// light: 要支援〜要介護2、heavy: 要介護3〜5

const SCENES = {
  light: [
    '訪問時、居間でテレビを見て過ごされていた。',
    '訪問時、椅子に座って新聞を読まれていた。',
    '笑顔で迎えてくださり、表情も穏やかだった。',
    '天気や季節の話をされ、会話を楽しまれていた。',
    '顔色良く、お変わりない様子だった。',
    '訪問時、ラジオを聴きながらくつろがれていた。',
  ],
  heavy: [
    '訪問時、ベッド上で臥床されていた。',
    '訪問時、ベッドで横になりテレビを見ておられた。',
    '声かけに目を開けて応じてくださった。',
    '表情穏やかで、苦痛の訴えはなかった。',
    '顔色良く、呼吸も落ち着いていた。',
  ],
  walker: [
    '歩行器を使って玄関まで出迎えてくださった。',
    '訪問時、歩行器で室内を移動されていた。',
  ],
  night: [
    '訪問時、テレビを見てくつろがれていた。',
    '夕食を済まされ、落ち着いて過ごされていた。',
    '訪問時、ベッドに腰かけて過ごされていた。',
  ],
};

const ITEM_TEXT = {
  'トイレ介助': {
    light: ['トイレまで見守りで移動され、排泄後の始末も声かけでご自身で行えた。', 'トイレでの立ち座りは手すりにつかまり安定していた。'],
    heavy: ['トイレ誘導し、立位保持を介助して排泄介助を行った。'],
  },
  'Pトイレ介助': { any: ['ポータブルトイレへの移乗を介助し、排泄を済まされた。'] },
  'パッド交換': {
    light: ['パッド交換時、腰上げに協力していただけた。'],
    heavy: ['パッド交換時、声かけで横向きになる協力動作があった。'],
  },
  'おむつ交換': {
    light: ['おむつ交換時、腰を上げる協力動作があった。'],
    heavy: ['おむつ交換時、声かけで横向きになる協力動作があった。', 'おむつ交換時、腰を上げる協力動作があった。陰部の発赤なし。'],
  },
  '食事一部介助': {
    light: ['ご自身で召し上がられ、見守りと一部介助で全量摂取された。'],
    heavy: ['一口ずつ声かけしながら食事介助を行った。むせ込みなし。'],
  },
  '食事全介助': { any: ['一口ずつ声かけしながら食事介助を行った。むせ込みなし。'] },
  '水分補給': { any: ['お茶をすすめると、コップ1杯を飲まれた。', '水分補給をすすめ、むせ込みなく飲まれた。'] },
  '全身浴': {
    light: ['浴槽の出入りは見守りで行えた。「気持ちいい」と喜ばれていた。', '洗身は手の届く所をご自身で洗われ、背中と洗髪を介助した。'],
    heavy: ['入浴介助を実施。洗身時、手の届く所はご自身で洗われていた。', '入浴後、皮膚状態を確認し異常はなかった。'],
  },
  '清拭': {
    light: ['清拭を行い、「さっぱりした」と話されていた。'],
    heavy: ['全身清拭を行った。皮膚の発赤なし。'],
  },
  '部分浴': { any: ['足浴を行い、「温まった」と喜ばれていた。'] },
  '更衣介助': {
    light: ['声かけでご自身で更衣され、ボタン留めのみ介助した。'],
    heavy: ['更衣時、袖通しに腕を伸ばす協力動作があった。'],
  },
  '整容': {
    light: ['整髪をご自身で行われ、見守った。'],
    heavy: ['整髪を介助し、すっきりした表情をされていた。'],
  },
  '口腔ケア': { any: ['口腔ケアを行い、口の中がすっきりした様子だった。'] },
  '体位変換': {
    light: ['寝返りの際、柵につかまりご自身で向きを変えられた。'],
    heavy: ['体位変換を行い、除圧を実施した。仙骨部の発赤なし。'],
  },
  '移乗介助': {
    light: ['車いすへの移乗は手すりを使い、一部介助で安全に行えた。'],
    heavy: ['ベッドから車いすへの移乗介助を行った。立ち上がりの際、足に力を入れる協力動作があった。'],
  },
  '移動介助': {
    light: ['居室からトイレまで見守り歩行。ふらつきなし。'],
    heavy: ['手引き歩行で移動を介助した。足の運びはゆっくりだが安定していた。'],
  },
  '服薬介助・確認': { any: ['お薬カレンダーで飲み忘れがないことを確認した。', '服薬を見守り、飲み込まれたことを確認した。'] },
  '起床介助': { any: ['声かけで起き上がられ、端座位で一息ついてから移動された。'] },
  '就寝介助': {
    light: ['就寝の準備を手伝い、「おやすみなさい」と穏やかに休まれた。', '寝具を整え、ベッドに横になられるのを見守った。'],
    heavy: ['ベッドへの移動を介助し、楽な姿勢に整えて就寝された。'],
  },
  '通院・外出介助': { any: ['通院に付き添った。待ち時間も落ち着いて過ごされていた。'] },
  '共に行う家事': { any: ['家事を一緒に行い、できることはご自身で行っていただいた。'] },
  '転倒予防の声かけ・見守り': { any: ['移動の際は声かけし、ふらつきなく歩かれていた。'] },
  '掃除': { any: ['居室とトイレの掃除を行った。', '居室の掃除機かけと拭き掃除を行った。'] },
  '洗濯': { any: ['洗濯をして室内に干した。', '洗濯を行い、ベランダに干した。'] },
  '取り入れ・収納': { any: ['乾いた洗濯物を取り込み、たたんで収納した。'] },
  'シーツ交換': { any: ['シーツ交換を行い、「気持ちいいね」と話されていた。'] },
  'ベッドメイク': { any: ['ベッドを整えた。'] },
  '一般的な調理': { any: ['本人の希望を伺いながら調理を行った。', '調理を行い、「おいしい」と召し上がられた。'] },
  '配・下膳': { any: ['配膳・下膳を行った。'] },
  '日常品等の買物': { any: ['依頼の品を購入し、レシートとお釣りを一緒に確認した。'] },
  'ゴミ出し': { any: ['ゴミをまとめて指定の場所に出した。'] },
  '衣類の整理': { any: ['季節に合わせて衣類を整理した。'] },
};

const DEMENTIA = [
  '昔の仕事の話をされ、事実と異なる内容（作話）もみられたが、否定せず傾聴した。',
  '「今朝、息子が来た」と話されたが確認できず、作話と思われる。話を合わせて傾聴した。',
  '同じ質問を何度かされたが、その都度ゆっくり説明すると納得された。',
  '日付があいまいな様子があり、カレンダーを一緒に確認した。',
  '落ち着いて過ごされ、混乱なく援助を受け入れてくださった。',
];

export function tierOf(careLevel) {
  return /要介護[345]/.test(careLevel ?? '') ? 'heavy' : 'light';
}

// 同じ訪問からは同じ文が出るように、キーから決まる疑似乱数を使う。
function rng(seed) {
  let h = 2166136261;
  for (const c of String(seed)) h = Math.imul(h ^ c.codePointAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

// レ点項目・介護度・認知症の有無・時間帯から記録コメントの下書きを作る。
export function generateComment({ profile, items, seed, start = '', maxItems = 2 }) {
  const rand = rng(seed);
  const pick = arr => arr[Math.floor(rand() * arr.length)];
  const tier = tierOf(profile?.careLevel);
  const night = minutes(start) >= 18 * 60;
  const scenes = night && tier === 'light' ? SCENES.night
    : [...SCENES[tier], ...(profile?.walker && tier === 'light' ? SCENES.walker : [])];
  const lines = [pick(scenes)];

  const pool = items.filter(n => ITEM_TEXT[n]);
  // 身体介護の項目を優先し、残りは生活援助から
  const body = pool.filter(n => ITEM[n].cat === 'body');
  const life = pool.filter(n => !body.includes(n));
  const chosen = [...shuffle(body, rand), ...shuffle(life, rand)].slice(0, maxItems);
  for (const n of chosen) lines.push(pick(ITEM_TEXT[n][tier] ?? ITEM_TEXT[n].any));

  if (profile?.dementia) lines.push(pick(DEMENTIA));
  return lines.join('');
}

function shuffle(arr, rand) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
