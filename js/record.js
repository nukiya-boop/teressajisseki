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

// ケアプラン第2表の版のうち、その日に有効なもの。
export function carePlanFor(profile, date) {
  const list = profile?.carePlans?.length ? profile.carePlans
    : (profile?.planRows?.length ? [{ date: profile.planRowsDate ?? '', rows: profile.planRows }] : []);
  return planVersionFor(list, date);
}

const MON_FIRST = [1, 2, 3, 4, 5, 6, 0];

// どの援助にも付いてくる項目。ケアプランの行と訪問枠を結びつける手がかりにはしない
const SUPPORTING = new Set(['更衣介助', '水分補給', '顔色・発汗・体温等', '環境整備']);

// ケアプランの頻度が訪問回数より少ない項目（週2回の入浴など）を行う曜日。
// 訪問介護計画書のどれかの版で曜日が決まっていればそれを使い、なければ訪問曜日から均等に選ぶ。
export function scheduledDays(profile, rowItems, times, slotWeekdays, date) {
  const versions = [...(profile?.versions ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  const ordered = [...versions.filter(v => v.date <= date), ...versions.filter(v => v.date > date).reverse()];
  for (const v of ordered) {
    const slot = v.slots.find(sl => sl.days.length < 7 && sl.items.some(n => rowItems.includes(n)));
    if (slot) {
      const days = slot.days.filter(d => slotWeekdays.includes(d));
      if (days.length) return days;
    }
  }
  const pool = MON_FIRST.filter(d => slotWeekdays.includes(d));
  const n = Math.max(1, Math.min(pool.length, Math.round(times)));
  return [...new Set(Array.from({ length: n }, (_, i) => pool[Math.floor((i * pool.length) / n)]))];
}

// その訪問のレ点項目と、どの書類から決めたかを返す。
// 優先順：訪問枠の手動設定 → ケアプラン第2表（頻度もケアプランに合わせる）→ 訪問介護計画書で補う
export function resolveItems({ profile, date, start, service, slotPerWeek = 7, slotWeekdays = [0, 1, 2, 3, 4, 5, 6] }) {
  const key = slotKey(start, service);
  const override = profile?.slotOverrides?.[key];
  if (override) return { items: ITEMS.map(it => it.name).filter(n => override.includes(n)), source: '手動設定' };

  const cats = categoriesFor(service);
  const startMin = minutes(start);
  const wd = weekdayOf(date);
  const set = new Set(detectItems(service));
  const gated = new Set();
  const sources = [];

  const version = planVersionFor(profile?.versions, date);
  const slot = matchPlanSlot(version, { date, start, service });
  const cp = carePlanFor(profile, date);
  if (cp) {
    for (const row of cp.rows) {
      // 計画書の訪問枠がわかれば、その枠に書かれた援助を含む行だけをこの訪問に当てる
      if (slot && !row.items.some(n => !SUPPORTING.has(n) && slot.items.includes(n))) {
        row.items.filter(n => !SUPPORTING.has(n)).forEach(n => gated.add(n));
        continue;
      }
      // 起床・就寝の行に書かれた項目は、朝・夜の枠にだけつける
      const rowTime = row.items.some(n => ITEM[n]?.time);
      if (rowTime && !row.items.some(n => ITEM[n]?.time && timeOk(ITEM[n], startMin))) {
        row.items.forEach(n => gated.add(n));
        continue;
      }
      const usable = row.items.filter(n => ITEM[n] && cats.includes(ITEM[n].cat) && timeOk(ITEM[n], startMin));
      if (row.perWeek != null && row.perWeek < slotPerWeek - 0.5) {
        usable.forEach(n => gated.add(n));
        // 計画書がないときは、回数の少ない援助（入浴など）を夜の訪問には当てない
        if (!slot && startMin >= 18 * 60) continue;
        if (!scheduledDays(profile, row.items, row.perWeek, slotWeekdays, date).includes(wd)) continue;
      }
      usable.forEach(n => set.add(n));
    }
    sources.push(`ケアプラン第2表 ${cp.date}`);
  }

  if (slot) {
    slot.items.filter(n => !gated.has(n)).forEach(n => set.add(n));
    sources.push(`訪問介護計画書 ${version.date} No.${slot.no}`);
  }
  if (!cp && !slot) {
    itemsForVisit(defaultSlot(profile, { start, service, slotPerWeek }), date).forEach(n => set.add(n));
    sources.push(profile?.items?.length ? '計画書の文中' : 'サービス種別のみ');
  }
  const items = ITEMS.filter(it => (it.always && cats.includes(it.cat)) || set.has(it.name)).map(it => it.name);
  return { items, source: sources.join(' ＋ ') };
}

// その訪問でレ点をつける項目。
export function itemsForVisit(slot, date) {
  const wd = weekdayOf(date);
  return ITEMS.map(it => it.name).filter(n => slot?.[n]?.includes(wd));
}

// ---- 記録コメントの文例 ----
// 様子（時間帯・介護度）→ 季節 → 体調 → 援助内容（ADL に合わせる）→ 認知症 → 退室 の順に組み立てる。
// light: 要支援〜要介護2、heavy: 要介護3〜5

const SCENES = {
  morning: [
    '訪問時、起きて居間で過ごされていた。',
    '朝食を済ませ、テレビのニュースを見ておられた。',
    '「おはよう」と笑顔で迎えてくださった。',
    'カーテンを開けると「今日はいい天気やね」と話されていた。',
    '訪問時、椅子に座ってお茶を飲まれていた。',
    '訪問時、新聞を広げて読まれていた。',
  ],
  day: [
    '訪問時、居間でテレビを見て過ごされていた。',
    '訪問時、ソファでうとうとされていたが、声かけですぐに目を覚まされた。',
    '笑顔で迎えてくださり、表情も穏やかだった。',
    '訪問時、ラジオを聴きながらくつろがれていた。',
    '昼食を済ませ、ゆっくり過ごされていた。',
    '訪問時、窓の外を眺めながら過ごされていた。',
    'テレビの時代劇を見ながら「この役者さんが好きなんよ」と話されていた。',
    '訪問時、テレビの旅番組を楽しそうに見ておられた。',
    '訪問時、電話で知人と話されていたが、すぐに切って迎えてくださった。',
    '訪問時、ベッドに腰かけて過ごされていた。',
    '「待ってたよ」と迎えてくださり、会話も弾んだ。',
    '訪問時、写真のアルバムを眺めておられ、昔の話を聞かせてくださった。',
  ],
  night: [
    '訪問時、テレビを見てくつろがれていた。',
    '夕食を済まされ、落ち着いて過ごされていた。',
    '訪問時、ベッドに腰かけて過ごされていた。',
    '「今日はゆっくりできたわ」と一日の様子を話してくださった。',
    '訪問時、居間でテレビの歌番組を楽しまれていた。',
    '訪問時、寝る準備を始めておられた。',
    '夕食は「おいしく食べた」とのこと。穏やかに過ごされていた。',
    'テレビのドラマを見ながら、内容を楽しそうに話してくださった。',
  ],
  heavy: [
    '訪問時、ベッド上で臥床されていた。',
    '訪問時、ベッドで横になりテレビを見ておられた。',
    '声かけに目を開けて応じてくださった。',
    '表情穏やかで、苦痛の訴えはなかった。',
    '訪問時、ベッドをギャッチアップしてテレビを見ておられた。',
    '声かけに「はい」としっかり返事をされた。',
  ],
  walker: [
    '歩行器を使って玄関まで出迎えてくださった。',
    '訪問時、歩行器で台所から居間へ移動されているところだった。',
  ],
};

const SEASON = {
  winter: [
    '寒い日が続くが、室内は暖房で暖かく保たれていた。',
    '「今日は冷えるね」と話されていたが、元気そうな様子だった。',
    '寒さのため、室温を一緒に確認し、ひざ掛けをお渡しした。',
    '乾燥しているため、加湿と水分補給について声かけした。',
    '「こたつから出られへん」と笑って話されていた。',
  ],
  spring: [
    '「暖かくなってきたね」と季節の話をされていた。',
    '窓から入る日差しを気持ちよさそうに感じておられた。',
    '「桜はもう咲いたかな」と季節の話で会話が弾んだ。',
    '「花粉がつらい」と話されていたが、体調に大きな変化はなかった。',
    '寒暖差があるため、上着の調節について声かけした。',
  ],
  rainy: [
    '雨が続き「洗濯物が乾かへん」と話されていた。',
    '蒸し暑い日のため、エアコンの除湿を一緒に確認した。',
    '「よう降るね」と窓の外の雨を眺めておられた。',
    '湿気が多いため、換気と除湿について一緒に確認した。',
    '雨で外に出られず「退屈やわ」と話されていたが、会話をすると笑顔になられた。',
  ],
  summer: [
    '暑い日が続くため、エアコンの温度を一緒に確認した。',
    '「暑いね」と話され、こまめな水分補給を声かけした。',
    '室内の温度に気をつけておられ、エアコンも適温だった。',
    '「今年の夏は特に暑いね」と話され、冷房の効いた部屋で過ごされていた。',
    '熱中症予防のため、室温とこまめな水分補給について声かけした。',
  ],
  autumn: [
    '「涼しくなって過ごしやすいね」と話されていた。',
    '季節の変わり目のため、衣類の調節について声かけした。',
    '「秋の味覚が楽しみ」と食べ物の話をされていた。',
    '朝晩冷えてきたため、寝具の調節について声かけした。',
    '「夜が長くなったね」と季節の話をされていた。',
  ],
};

function seasonOf(date) {
  const m = Number(String(date).slice(5, 7));
  if ([12, 1, 2].includes(m)) return 'winter';
  if ([3, 4, 5].includes(m)) return 'spring';
  if (m === 6) return 'rainy';
  if ([7, 8, 9].includes(m)) return 'summer';
  if ([10, 11].includes(m)) return 'autumn';
  return null;
}

const HEALTH = {
  light: [
    '顔色良く、体調の訴えはなかった。',
    '表情明るく、体調の変化はみられなかった。',
    '体調を伺うと「変わりないよ」とのこと。',
    '顔色・表情とも普段どおりで、発汗もなかった。',
    '食欲もあると話され、体調は安定している様子だった。',
    '「昨夜はよく眠れた」と話され、顔色も良好だった。',
  ],
  heavy: [
    '顔色・呼吸状態に変化はなかった。',
    '表情穏やかで、苦痛の訴えはなかった。',
    '顔色良好で、発汗や発熱の様子もなかった。',
  ],
  summer: ['暑さによる体調の変化はみられなかった。'],
  winter: ['寒さによる体調の変化はみられなかった。'],
};

// 援助内容ごとの文。adl: アセスメントの状態に合わせた文、light/heavy: 介護度、any: 共通、season: 季節
const ITEM_TEXT = {
  'トイレ介助': {
    any: [
      'トイレでの立ち座りは手すりにつかまり安定していた。',
      'トイレへ声かけし、排泄後の後始末もご自身で行えた。',
      '排泄の確認をし、トイレまで付き添った。',
    ],
    adl: { '排尿:見守り等': ['トイレへの移動は見守りで、ふらつきなく行えた。', 'トイレでは見守りのみで、ご自身で済まされた。'] },
    heavy: ['トイレ誘導し、立位保持を介助して排泄介助を行った。'],
  },
  'Pトイレ介助': { any: ['ポータブルトイレへの移乗を介助し、排泄を済まされた。'] },
  'パッド交換': {
    light: ['パッド交換時、腰上げに協力していただけた。'],
    heavy: ['パッド交換時、声かけで横向きになる協力動作があった。'],
  },
  'おむつ交換': {
    light: ['おむつ交換時、腰を上げる協力動作があった。'],
    heavy: ['おむつ交換時、声かけで横向きになる協力動作があった。', 'おむつ交換時、腰を上げる協力動作があった。陰部の発赤なし。', '陰部清拭を行い、皮膚トラブルのないことを確認した。'],
  },
  '食事一部介助': {
    light: ['ご自身で召し上がられ、見守りと一部介助で全量摂取された。'],
    heavy: ['一口ずつ声かけしながら食事介助を行った。むせ込みなし。'],
  },
  '食事全介助': { any: ['一口ずつ声かけしながら食事介助を行った。むせ込みなし。'] },
  '水分補給': {
    any: [
      'お茶をすすめると、コップ1杯を飲まれた。',
      '水分補給をすすめると「喉が渇いてた」と飲まれた。',
      '入浴後にお茶をすすめ、ゆっくり飲まれた。',
      '好みの麦茶を用意し、水分を摂っていただいた。',
    ],
    season: { summer: ['暑さのため、こまめに水分を摂るよう声かけした。'] },
  },
  '全身浴': {
    any: [
      '入浴前に体調を確認し、問題なく入浴された。',
      '湯船につかり「あ〜気持ちいい」と笑顔を見せられた。',
      '入浴後、「さっぱりした」と喜ばれていた。',
      '浴槽の出入りは手すりにつかまり、安全に行えた。',
      '入浴中、昔の銭湯の話をされ、楽しそうだった。',
      '入浴後、皮膚の状態を確認し、異常はなかった。',
    ],
    adl: {
      '洗身:一部介助': ['手の届く所はご自身で洗われ、背中と足先を介助した。', '洗身は前面をご自身で洗われ、背中を介助した。湯加減も「ちょうどいい」とのこと。'],
      '洗身:自立': ['洗身はご自身で行われ、見守りのみ行った。'],
      '洗身:全介助': ['洗身を介助し、皮膚の状態を確認した。'],
    },
    season: { winter: ['脱衣所を暖めてから入浴した。ヒートショックに注意し、ふらつきもなかった。'], summer: ['入浴で汗を流し、「すっきりした」と話されていた。'] },
  },
  '洗髪': { any: ['洗髪を介助し、「頭が軽くなった」と話されていた。', '洗髪後、ドライヤーで髪を乾かした。', '洗髪時、目にお湯が入らないよう声かけしながら行った。'] },
  '清拭': {
    light: ['清拭を行い、「さっぱりした」と話されていた。'],
    heavy: ['全身清拭を行った。皮膚の発赤なし。'],
  },
  '部分浴': { any: ['足浴を行い、「温まった」と喜ばれていた。'] },
  '更衣介助': {
    any: ['更衣を介助し、清潔な衣類に着替えられた。', '着替えの服を一緒に選び、気持ちよく更衣された。'],
    adl: { '上衣の着脱:見守り等': ['更衣は見守りで行い、ボタン留めのみ介助した。', '声かけでご自身で袖を通され、ズボンの着脱は立位を支えた。', '座って更衣され、見守りで安全に行えた。'] },
    heavy: ['更衣時、袖通しに腕を伸ばす協力動作があった。'],
  },
  '整容': { any: ['髪を整えると「きれいになった」と鏡を見て喜ばれた。', '顔を拭き、髪を整えた。', '整髪を手伝い、身だしなみを整えた。'] },
  '洗面': { any: ['洗面所で顔を洗われ、見守った。'] },
  '口腔ケア': {
    any: ['就寝前の歯磨きを声かけし、ご自身で丁寧にされていた。', '口腔ケアを行い、口の中がすっきりした様子だった。'],
    adl: { '口腔衛生:自立': ['歯磨きはご自身で行われ、仕上がりを確認した。', 'うがいまでご自身でしっかりされていた。'] },
  },
  '体位変換': {
    light: ['寝返りの際、柵につかまりご自身で向きを変えられた。'],
    heavy: ['体位変換を行い、除圧を実施した。仙骨部の発赤なし。'],
  },
  '移乗介助': {
    any: ['車いすへの移乗は手すりを使い、安全に行えた。'],
    adl: { '移乗:見守り等': ['移乗は見守りで、ゆっくり安全に行えた。'] },
    heavy: ['ベッドから車いすへの移乗介助を行った。立ち上がりの際、足に力を入れる協力動作があった。'],
  },
  '移動介助': {
    any: ['居室からトイレまで見守り歩行。ふらつきなし。'],
    adl: { '歩行:何かに掴まればできる': ['歩行器を使って移動され、ふらつきはなかった。', '手すりにつかまりながら、ゆっくり移動された。'] },
    heavy: ['手引き歩行で移動を介助した。足の運びはゆっくりだが安定していた。'],
  },
  '服薬介助・確認': {
    any: ['お薬カレンダーで飲み忘れがないことを確認した。', '服薬を見守り、飲み込まれたことを確認した。'],
    adl: { '薬の内服:一部介助': ['お薬カレンダーから薬を一緒に取り出し、服用を確認した。', '「薬はもう飲んだかな」と気にされていたため、カレンダーで一緒に確認した。', '薬を手渡し、水で服用されたことを確認した。'] },
  },
  '起床介助': { any: ['声かけで起き上がられ、端座位で一息ついてから移動された。', 'カーテンを開け、起き上がりを介助した。'] },
  '就寝介助': {
    any: [
      '就寝の準備を手伝い、「おやすみ」と穏やかに休まれた。',
      'ベッドに横になられたのを確認し、布団を整えた。',
      '寝る前に部屋の温度を確認し、ベッドに入られるのを見守った。',
      'ベッドへの移動を見守り、楽な姿勢に整えた。',
      '寝具を整え、枕元に眼鏡と水を置いた。',
    ],
    heavy: ['ベッドへの移動を介助し、楽な姿勢に整えて就寝された。'],
  },
  '通院・外出介助': { any: ['通院に付き添った。待ち時間も落ち着いて過ごされていた。'] },
  '共に行う家事': { any: ['家事を一緒に行い、できることはご自身で行っていただいた。'] },
  '転倒予防の声かけ・見守り': { any: ['移動の際は声かけし、ふらつきなく歩かれていた。'] },
  '掃除': {
    any: [
      '居室とトイレの掃除を行った。',
      '台所の拭き掃除と居室の掃除機かけを行った。',
      '掃除中、「いつもきれいにしてもらって助かる」と話されていた。',
      'ご本人にもテーブル拭きをしていただき、一緒に掃除を行った。',
      '浴室とトイレを中心に掃除を行った。',
    ],
  },
  '洗濯': {
    any: ['洗濯をして室内に干した。', '洗濯を行い、ベランダに干した。', '洗濯物を一緒にたたみ、ご本人に収納していただいた。'],
    season: { rainy: ['雨のため、洗濯物は室内に干した。'], summer: ['天気が良く、洗濯物をベランダに干した。'] },
  },
  '取り入れ・収納': { any: ['乾いた洗濯物を取り込み、たたんで収納した。'] },
  'シーツ交換': { any: ['シーツ交換を行い、「気持ちいいね」と話されていた。', 'シーツと枕カバーを交換した。'] },
  'ベッドメイク': { any: ['ベッドを整えた。'] },
  '一般的な調理': { any: ['本人の希望を伺いながら調理を行った。', '調理を行い、「おいしい」と召し上がられた。'] },
  '配・下膳': { any: ['配膳・下膳を行った。'] },
  '日常品等の買物': { any: ['依頼の品を購入し、レシートとお釣りを一緒に確認した。'] },
  'ゴミ出し': { any: ['ゴミをまとめて指定の場所に出した。'] },
  '衣類の整理': { any: ['季節に合わせて衣類を整理した。'] },
};

// 個別の援助がない訪問（体調確認・見守りなど）のための文
const GENERAL = [
  'ゆっくり話を伺い、困りごとがないか確認した。',
  '室内を確認し、危ない物が床に置かれていないことを確認した。',
  '最近の様子を伺うと「変わりなく過ごせてる」とのこと。',
  '一緒にテレビを見ながら会話を楽しまれた。',
  '昔の仕事の話を楽しそうにしてくださった。',
];

const DEMENTIA = [
  '昔の仕事の話をされ、事実と異なる内容（作話）もみられたが、否定せず傾聴した。',
  '「今朝、息子が来た」と話されたが確認できず、作話と思われる。話を合わせて傾聴した。',
  '同じ質問を何度かされたが、その都度ゆっくり説明すると納得された。',
  '日付があいまいな様子があり、カレンダーを一緒に確認した。',
  '落ち着いて過ごされ、混乱なく援助を受け入れてくださった。',
  '「財布がない」と探されていたが、一緒に探すと引き出しの中にあり安心された。',
  '昔住んでいた家の話を繰り返しされたが、相づちを打ちながら傾聴した。',
  '援助の手順を一つずつ説明しながら行うと、落ち着いて応じてくださった。',
];

const CLOSING = {
  day: [
    '戸締り・火元を確認して退室した。',
    '次回の訪問日を伝えると「待ってるね」と見送ってくださった。',
    '退室時、「ありがとう」と笑顔で見送ってくださった。',
    '困りごとがないか伺い、特になしとのことで退室した。',
  ],
  night: [
    '戸締りと火元を確認し、「おやすみなさい」と声をかけて退室した。',
    '電気・戸締りを確認して退室した。',
    '「また明日ね」と声をかけると、笑顔で応えてくださった。',
  ],
};

const MAX_LENGTH = 170;

// 季節・時間帯と食い違う文を除く（梅雨に「いい天気」、夜に「昨夜はよく眠れた」など）
function fits(sentence, season, time) {
  if (season === 'rainy' && /いい天気|ベランダ|天気が良く/.test(sentence)) return false;
  if (season !== 'rainy' && /雨/.test(sentence)) return false;
  if (season === 'summer' && /暖房|ひざ掛け|冷え/.test(sentence)) return false;
  if (time === 'night' && /昨夜|おはよう|朝食|昼食|カーテンを開け/.test(sentence)) return false;
  if (time !== 'night' && /おやすみ|夕食|また明日/.test(sentence)) return false;
  return true;
}

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

// その項目に使える文：ADL に合う文・季節の文を優先し、介護度の文・共通の文を足す。
function itemSentences(name, tier, adl, season) {
  const t = ITEM_TEXT[name];
  if (!t) return [];
  const fromAdl = Object.entries(t.adl ?? {})
    .filter(([k]) => { const [item, value] = k.split(':'); return adl?.[item] === value; })
    .flatMap(([, v]) => v);
  const tiered = tier === 'heavy' ? (t.heavy ?? t.any ?? t.light ?? []) : [...(t.any ?? []), ...(t.light ?? [])];
  return [...fromAdl, ...fromAdl, ...(t.season?.[season] ?? []), ...(tier === 'heavy' ? tiered : (fromAdl.length ? (t.any ?? []) : tiered))];
}

// レ点項目・介護度・認知症・ADL・時間帯・季節から記録コメントの下書きを作る。
export function generateComment({ profile, items, seed, start = '', date = '', maxItems = 2 }) {
  const rand = rng(seed);
  const pick = arr => arr[Math.floor(rand() * arr.length)];
  const tier = tierOf(profile?.careLevel);
  const startMin = minutes(start);
  const time = startMin < 11 * 60 ? 'morning' : startMin >= 18 * 60 ? 'night' : 'day';
  const season = seasonOf(date);
  const adl = profile?.adl ?? {};
  const used = new Set();
  const take = arr => {
    const left = arr.filter(s => !used.has(s) && fits(s, season, time));
    const s = left.length ? pick(left) : null;
    if (s) used.add(s);
    return s;
  };

  let scenes = tier === 'heavy' ? SCENES.heavy : SCENES[time];
  if (profile?.walker && tier === 'light' && time !== 'night') scenes = [...scenes, ...SCENES.walker];
  const head = [take(scenes)];
  const optional = [];
  if (season && rand() < 0.45) optional.push(take(SEASON[season]));
  if (items.includes('顔色・発汗・体温等') && rand() < 0.6) {
    head.push(take([...HEALTH[tier], ...(HEALTH[season] ?? [])]));
  }

  const pool = items.filter(n => ITEM_TEXT[n]);
  // 身体介護の項目を優先し、残りは生活援助から
  const body = shuffle(pool.filter(n => ITEM[n].cat === 'body'), rand);
  const life = shuffle(pool.filter(n => ITEM[n].cat !== 'body'), rand);
  const main = [...body, ...life].slice(0, maxItems)
    .map(n => take(itemSentences(n, tier, adl, season))).filter(Boolean);
  if (!main.length) main.push(take(GENERAL));
  if (profile?.dementia) main.push(take(DEMENTIA));

  if (rand() < 0.6) optional.push(take(CLOSING[time === 'night' ? 'night' : 'day']));
  const lines = [...head, ...main];
  for (const s of optional.filter(Boolean)) {
    if (lines.join('').length + s.length <= MAX_LENGTH) {
      // 季節の話は様子の直後、退室は最後に置く
      if (CLOSING.day.includes(s) || CLOSING.night.includes(s)) lines.push(s); else lines.splice(1, 0, s);
    }
  }
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
