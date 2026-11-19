// npm run build で js/*.js から作るファイルです。直接編集しないでください。
(async () => {

// js/csv.js
function parseTable(text) {
  text = text.replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const delim = firstLine.includes("	") ? "	" : ",";
  const rows2 = [];
  let row2 = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === "") {
      quoted = true;
    } else if (c === delim) {
      row2.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row2.push(field);
      field = "";
      rows2.push(row2);
      row2 = [];
    } else field += c;
  }
  if (field !== "" || row2.length) {
    row2.push(field);
    rows2.push(row2);
  }
  return rows2.map((r) => r.map((v) => v.trim())).filter((r) => r.some((v) => v !== ""));
}
function parseRecords(text, aliases) {
  const [header, ...body] = parseTable(text);
  if (!header) return [];
  const keys = header.map((h) => {
    const norm = h.replace(/\s/g, "");
    for (const [key, names] of Object.entries(aliases)) {
      if (names.includes(norm)) return key;
    }
    return null;
  });
  return body.map((cols) => {
    const rec = {};
    keys.forEach((k, i) => {
      if (k) rec[k] = cols[i] ?? "";
    });
    return rec;
  });
}
function toCSV(rows2) {
  return rows2.map((r) => r.map((v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\r\n");
}
function decodeFile(buffer) {
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  if (!utf8.includes("�")) return utf8;
  return new TextDecoder("shift_jis").decode(buffer);
}

// js/logic.js
var ALIASES = {
  careplan: {
    userId: ["利用者ID", "利用者番号", "ID"],
    userName: ["利用者名", "利用者", "氏名"],
    weekday: ["曜日"],
    start: ["開始", "開始時間", "開始時刻"],
    end: ["終了", "終了時間", "終了時刻"],
    service: ["サービス内容", "サービス", "内容"],
    code: ["サービスコード", "コード"]
  },
  shift: {
    date: ["日付", "勤務日"],
    staff: ["担当者", "職員", "ヘルパー", "スタッフ", "氏名"],
    start: ["開始", "開始時間", "出勤"],
    end: ["終了", "終了時間", "退勤"]
  },
  actual: {
    date: ["日付", "提供日"],
    userId: ["利用者ID", "利用者番号", "ID"],
    start: ["開始", "開始時間", "開始時刻"],
    end: ["終了", "終了時間", "終了時刻"],
    service: ["サービス内容", "サービス", "内容"],
    staff: ["担当者", "職員", "ヘルパー", "スタッフ"]
  }
};
var STATUS = {
  OK: "テレッサ",
  TIME_DIFF: "時間差あり",
  NO_SHIFT: "シフト外",
  PLANNED: "未実績",
  UNPLANNED: "計画外"
};
var WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
var BANDS = [
  [/^身体介護０１|^身体介護01/, 0, 19],
  [/^身体介護１|^身体介護1(?!\d)/, 20, 29],
  [/^身体介護２|^身体介護2/, 30, 59],
  [/^身体介護３|^身体介護3/, 60, 89],
  [/^身体介護４|^身体介護4/, 90, 119],
  [/^生活援助２|^生活援助2/, 20, 44],
  [/^生活援助３|^生活援助3/, 45, Infinity]
];
function serviceBand(service) {
  const b = BANDS.find(([re]) => re.test(String(service ?? "")));
  return b ? { min: b[1], max: b[2] } : null;
}
function alignToBand(service, start, end) {
  const s = toMinutes(start), e = toMinutes(end);
  if (!(e > s)) return { end, note: "終了が開始以前（利用票を要確認）" };
  const band = serviceBand(service);
  if (!band) return { end, note: "" };
  const d = e - s;
  if (d === band.max + 1) {
    const m = s + band.max;
    return { end: `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`, note: `時間区分に合わせ終了を1分早めた（${d}分→${band.max}分）` };
  }
  if (d > band.max || d < band.min) return { end, note: `時間（${d}分）とサービスコードが合わない（要確認）` };
  return { end, note: "" };
}
function toMinutes(t) {
  const m = /^(\d{1,2}):?(\d{2})$/.exec(String(t).trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}
function normalizeDate(d) {
  const m = /^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/.exec(String(d).trim());
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : "";
}
function weekdayIndexes(text) {
  return [...String(text)].map((c) => WEEKDAYS.indexOf(c)).filter((i) => i >= 0);
}
function expandPlans(plans, month) {
  const dated = plans.filter((p) => p.date);
  const weekly = plans.filter((p) => !p.date);
  const [y, m] = month.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  const out = [];
  for (let d = 1; d <= days; d++) {
    const wd = new Date(y, m - 1, d).getDay();
    const date = `${month}-${String(d).padStart(2, "0")}`;
    for (const p of weekly) {
      if (weekdayIndexes(p.weekday).includes(wd)) out.push({ ...p, date });
    }
  }
  return [...out, ...dated.filter((p) => p.date.startsWith(month))];
}
function covers(shift, date, start, end) {
  return normalizeDate(shift.date) === date && toMinutes(shift.start) <= start && toMinutes(shift.end) >= end;
}
function overlaps(a1, a2, b1, b2) {
  if (a2 <= a1) a2 += 1440;
  if (b2 <= b1) b2 += 1440;
  return a1 < b2 && b1 < a2;
}
function reconcile({ plans, shifts, actuals, month, toleranceMin = 10 }) {
  const planned = expandPlans(plans, month);
  const userNames = Object.fromEntries(plans.map((p) => [p.userId, p.userName]));
  const monthActuals = actuals.map((a) => ({ ...a, date: normalizeDate(a.date) })).filter((a) => a.date.startsWith(month));
  const used = /* @__PURE__ */ new Set();
  const rows2 = [];
  for (const p of planned) {
    const ps = toMinutes(p.start), pe = toMinutes(p.end);
    const idx = monthActuals.findIndex((a2, i) => !used.has(i) && a2.date === p.date && a2.userId === p.userId && overlaps(ps, pe, toMinutes(a2.start), toMinutes(a2.end)));
    if (idx < 0) {
      const shift = shifts.find((s) => covers(s, p.date, ps, pe));
      rows2.push(row(p, null, shift?.staff ?? "", STATUS.PLANNED));
      continue;
    }
    used.add(idx);
    const a = monthActuals[idx];
    const as = toMinutes(a.start), ae = toMinutes(a.end);
    const staff = a.staff || shifts.find((s) => covers(s, a.date, as, ae))?.staff || "";
    const inShift = !shifts.length || shifts.some((s) => s.staff === staff && covers(s, a.date, as, ae));
    const onTime = Math.abs(as - ps) <= toleranceMin && Math.abs(ae - pe) <= toleranceMin;
    const status = !inShift ? STATUS.NO_SHIFT : !onTime ? STATUS.TIME_DIFF : STATUS.OK;
    rows2.push(row(p, a, staff, status));
  }
  monthActuals.forEach((a, i) => {
    if (used.has(i)) return;
    rows2.push(row({
      userId: a.userId,
      userName: userNames[a.userId] ?? "",
      date: a.date,
      service: a.service,
      code: ""
    }, a, a.staff, STATUS.UNPLANNED));
  });
  return rows2.sort((x, y) => x.userId.localeCompare(y.userId) || x.date.localeCompare(y.date) || toMinutes(x.planStart || x.actualStart) - toMinutes(y.planStart || y.actualStart));
}
function row(p, a, staff, status) {
  return {
    date: p.date,
    userId: p.userId,
    userName: p.userName ?? "",
    service: a?.service || p.service || "",
    code: p.code ?? "",
    office: p.office ?? "",
    planStart: p.start ?? "",
    planEnd: p.end ?? "",
    actualStart: a?.start ?? "",
    actualEnd: a?.end ?? "",
    staff,
    status,
    teressa: status === STATUS.OK
  };
}
function confirmPlanned(rows2) {
  return rows2.filter((r) => r.status === STATUS.PLANNED && r.staff).map((r) => ({
    date: r.date,
    userId: r.userId,
    start: r.planStart,
    end: r.planEnd,
    service: r.service,
    staff: r.staff
  }));
}
function summarize(rows2) {
  const counts = Object.fromEntries(Object.values(STATUS).map((s) => [s, 0]));
  for (const r of rows2) counts[r.status]++;
  return counts;
}

// js/record.js
var ITEMS = [
  { group: "事前チェック", name: "顔色・発汗・体温等", cat: "common", keys: ["バイタル", "体温", "血圧", "顔色", "健康チェック", "体調確認", "体調管理"], always: true },
  { group: "事前チェック", name: "環境整備", cat: "common", keys: ["環境整備"] },
  { group: "事前チェック", name: "相談援助・情報収集・記録", cat: "common", keys: ["相談援助", "情報収集", "情報提供"] },
  { group: "排泄介助", name: "トイレ介助", cat: "body", keys: ["トイレ介助", "トイレ誘導", "排泄介助"] },
  { group: "排泄介助", name: "Pトイレ介助", cat: "body", keys: ["ポータブルトイレ", "Pトイレ"] },
  { group: "排泄介助", name: "尿器介助", cat: "body", keys: ["尿器"] },
  { group: "排泄介助", name: "パッド交換", cat: "body", keys: ["パッド"] },
  { group: "排泄介助", name: "おむつ交換", cat: "body", keys: ["オムツ", "おむつ"] },
  { group: "食事介助", name: "食事全介助", cat: "body", keys: ["食事全介助"] },
  { group: "食事介助", name: "食事一部介助", cat: "body", keys: ["食事介助", "食事一部介助", "摂食介助"] },
  { group: "食事介助", name: "水分補給", cat: "body", keys: ["水分補給", "水分摂取"] },
  { group: "食事介助", name: "特段の調理", cat: "body", keys: ["特段の調理", "刻み食", "ミキサー食"] },
  { group: "身体清拭・洗髪", name: "清拭", cat: "body", keys: ["清拭"] },
  { group: "身体清拭・洗髪", name: "洗髪", cat: "body", keys: ["洗髪"] },
  { group: "身体清拭・洗髪", name: "爪切り", cat: "body", keys: ["爪切り"] },
  { group: "保清・整容", name: "全身浴", cat: "body", keys: ["入浴", "シャワー浴", "洗身"] },
  { group: "保清・整容", name: "部分浴", cat: "body", keys: ["部分浴", "足浴", "手浴", "陰部洗浄"] },
  { group: "保清・整容", name: "洗面", cat: "body", keys: ["洗面"] },
  { group: "保清・整容", name: "口腔ケア", cat: "body", keys: ["口腔ケア", "歯磨き", "義歯"] },
  { group: "保清・整容", name: "整容", cat: "body", keys: ["整容", "整髪"] },
  { group: "保清・整容", name: "更衣介助", cat: "body", keys: ["更衣", "着替え"] },
  { group: "移動", name: "体位変換", cat: "body", keys: ["体位変換", "体交", "褥瘡予防"] },
  { group: "移動", name: "移乗介助", cat: "body", keys: ["移乗"] },
  { group: "移動", name: "移動介助", cat: "body", keys: ["移動介助", "歩行介助", "歩行見守り", "手引き歩行"] },
  { group: "移動", name: "通院・外出介助", cat: "body", keys: ["通院介助", "外出介助", "通院・外出"] },
  { group: "起床就寝", name: "起床介助", cat: "body", keys: ["起床介助", "起床時の介助"], time: "morning" },
  { group: "起床就寝", name: "就寝介助", cat: "body", keys: ["就寝介助", "就寝時の介助"], time: "night" },
  { group: "服薬", name: "服薬介助・確認", cat: "body", keys: ["服薬介助", "服薬確認", "内服", "与薬"] },
  { group: "服薬", name: "薬の塗布", cat: "body", keys: ["塗布", "軟膏"] },
  { group: "服薬", name: "点眼", cat: "body", keys: ["点眼"] },
  { group: "自立支援", name: "共に行う家事", cat: "body", keys: ["共に行う", "一緒に行う"] },
  { group: "自立支援", name: "認知症の記憶への働きかけ", cat: "body", keys: ["記憶への働きかけ", "回想"] },
  { group: "自立支援", name: "転倒予防の声かけ・見守り", cat: "body", keys: ["転倒予防", "転倒防止"] },
  { group: "掃除", name: "掃除", cat: "life", keys: ["掃除", "清掃"] },
  { group: "掃除", name: "ゴミ出し", cat: "life", keys: ["ゴミ出し", "ごみ出し"] },
  { group: "洗濯", name: "洗濯", cat: "life", keys: ["洗濯"] },
  { group: "洗濯", name: "取り入れ・収納", cat: "life", keys: ["取り入れ", "洗濯物の収納"] },
  { group: "洗濯", name: "アイロン", cat: "life", keys: ["アイロン"] },
  { group: "寝具の手入れ", name: "シーツ交換", cat: "life", keys: ["シーツ交換"] },
  { group: "寝具の手入れ", name: "ベッドメイク", cat: "life", keys: ["ベッドメイク"] },
  { group: "寝具の手入れ", name: "布団干し", cat: "life", keys: ["布団干し"] },
  { group: "衣類", name: "衣類の整理", cat: "life", keys: ["衣類の整理", "衣類整理", "衣替え"] },
  { group: "衣類", name: "被服の補修", cat: "life", keys: ["被服の補修", "衣服の補修"] },
  { group: "調理・配下膳", name: "一般的な調理", cat: "life", keys: ["調理"] },
  { group: "調理・配下膳", name: "配・下膳", cat: "life", keys: ["配膳", "下膳"] },
  { group: "調理・配下膳", name: "後片付け", cat: "life", keys: ["食器洗い", "調理の後片付け"] },
  { group: "買物等", name: "日常品等の買物", cat: "life", keys: ["買い物", "買物"] },
  { group: "買物等", name: "薬の受取り", cat: "life", keys: ["薬の受取", "薬の受け取"] },
  { group: "退室確認", name: "火元", cat: "exit", keys: [], always: true },
  { group: "退室確認", name: "電気", cat: "exit", keys: [], always: true },
  { group: "退室確認", name: "水道", cat: "exit", keys: [], always: true },
  { group: "退室確認", name: "戸締り", cat: "exit", keys: [], always: true }
];
var ITEM = Object.fromEntries(ITEMS.map((it) => [it.name, it]));
var CARE_LEVELS = ["要支援1", "要支援2", "要介護1", "要介護2", "要介護3", "要介護4", "要介護5"];
var WEEKDAYS2 = ["日", "月", "火", "水", "木", "金", "土"];
var DIGITS = { "１": "1", "２": "2", "３": "3", "４": "4", "５": "5", "一": "1", "二": "2", "三": "3", "四": "4", "五": "5", "Ⅰ": "1", "Ⅱ": "2", "Ⅲ": "3", "Ⅳ": "4", "Ⅴ": "5" };
var LEVEL_RE = /要(支援|介護)状?態?(?:区分)?([1-5１-５一二三四五ⅠⅡⅢⅣⅤ])/;
function detectItems(text) {
  const t = String(text ?? "").replace(/\s+/g, "");
  return ITEMS.filter((it) => it.keys.some((k) => t.includes(k))).map((it) => it.name);
}
function detectCareLevel(text) {
  const t = String(text ?? "").replace(/\s+/g, "").replace(/要介護[1-5１-５](?:・要介護[1-5１-５])+/g, "");
  const m = LEVEL_RE.exec(t);
  return m ? `要${m[1]}${DIGITS[m[2]] ?? m[2]}` : "";
}
function detectDementia(text) {
  const t = String(text ?? "").replace(/\s+/g, "");
  return /認知症|作話|物忘れ|もの忘れ|徘徊|見当識/.test(t) && !/認知症(なし|無し|はなし|は無し|の診断なし)/.test(t);
}
function detectProfile(text) {
  return { careLevel: detectCareLevel(text), dementia: detectDementia(text), items: detectItems(text) };
}
function detectPlanRows(text) {
  return String(text ?? "").split(/\r?\n/).map((line) => ({ line, items: detectItems(line), perWeek: perWeek(line) })).filter((r) => r.items.length && r.perWeek != null && !/居宅療養|福祉用具/.test(r.line)).map((r) => ({ content: r.line.trim(), freq: (/週\s*に?\s*[\d０-９]+\s*回|月\s*に?\s*[\d０-９]+\s*回|毎日/.exec(r.line) ?? [""])[0], perWeek: r.perWeek, items: r.items }));
}
function perWeek(freq) {
  const t = String(freq ?? "").replace(/\s+/g, "").replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 65248));
  if (/毎日/.test(t)) return 7;
  let m = /週(?:に)?(\d+)/.exec(t);
  if (m) return Number(m[1]);
  m = /月(?:に)?(\d+)/.exec(t);
  if (m) return Number(m[1]) / 4.3;
  return null;
}
function categoriesFor(service) {
  const s = String(service ?? "");
  const body = /身体|通院|乗降/.test(s), life = s.includes("生活");
  if (body && !life) return ["body", "common", "exit"];
  if (life && !body) return ["life", "common", "exit"];
  return ["body", "life", "common", "exit"];
}
function timeOk(item, startMin, strict = false) {
  if (item.time === "morning") return startMin < (strict ? 9 : 11) * 60;
  if (item.time === "night") return startMin >= 18 * 60;
  return true;
}
function minutes(t) {
  const m = /(\d{1,2}):(\d{2})/.exec(String(t));
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}
function slotKey(start, service) {
  return `${start}|${service}`;
}
function defaultSlot(profile, { start, service, slotPerWeek = 7 }) {
  const cats = categoriesFor(service);
  const startMin = minutes(start);
  const rows2 = profile?.planRows?.length ? profile.planRows : [{ items: profile?.items ?? [], perWeek: null }];
  const out = {};
  const all = [0, 1, 2, 3, 4, 5, 6];
  for (const it of ITEMS) {
    if (it.always && cats.includes(it.cat)) out[it.name] = all;
  }
  for (const row2 of rows2) {
    const rowTime = row2.items.some((n) => ITEM[n]?.time);
    if (rowTime && !row2.items.some((n) => ITEM[n]?.time && timeOk(ITEM[n], startMin))) continue;
    for (const n of row2.items) {
      const it = ITEM[n];
      if (!it || !cats.includes(it.cat) || !timeOk(it, startMin)) continue;
      const everyVisit = row2.perWeek == null || row2.perWeek >= slotPerWeek - 0.5;
      if (everyVisit) out[n] = all;
      else if (!out[n]) out[n] = [];
    }
  }
  for (const n of detectItems(service)) out[n] ??= all;
  return out;
}
function weekdayOf(date) {
  return (/* @__PURE__ */ new Date(`${date}T00:00:00`)).getDay();
}
function planVersionFor(versions, date) {
  const sorted = [...versions ?? []].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.filter((v) => v.date <= date).at(-1) ?? sorted[0] ?? null;
}
function matchPlanSlot(version, { date, start, service }) {
  if (!version) return null;
  const cats = categoriesFor(service);
  const wd = weekdayOf(date);
  const dom = Number(String(date).slice(8, 10));
  const s = minutes(start);
  const same = version.slots.filter((sl) => categoriesFor(sl.service).some((c) => c !== "common" && c !== "exit" && cats.includes(c)));
  const near = (list, limit) => list.map((sl) => ({ sl, d: Math.abs(minutes(sl.start) - s) })).filter((x) => x.d <= limit).sort((a, b) => a.d - b.d)[0]?.sl ?? null;
  const onDay = (sl) => sl.dates ? sl.dates.includes(dom) : sl.days.includes(wd);
  return near(same.filter(onDay), 90) ?? near(same, 30);
}
function carePlanFor(profile, date) {
  const list = profile?.carePlans?.length ? profile.carePlans : profile?.planRows?.length ? [{ date: profile.planRowsDate ?? "", rows: profile.planRows }] : [];
  return planVersionFor(list, date);
}
var MON_FIRST = [1, 2, 3, 4, 5, 6, 0];
var SHORT_BODY = /身体介護(０１|01|１|1)(?![0-9０-９])/;
var SUPPORTING = /* @__PURE__ */ new Set(["更衣介助", "水分補給", "顔色・発汗・体温等", "環境整備"]);
function scheduledDays(profile, rowItems, times, slotWeekdays, date) {
  const versions = [...profile?.versions ?? []].sort((a, b) => b.date.localeCompare(a.date));
  const ordered = [...versions.filter((v) => v.date <= date), ...versions.filter((v) => v.date > date).reverse()];
  for (const v of ordered) {
    const slot = v.slots.find((sl) => sl.days.length < 7 && sl.items.some((n2) => rowItems.includes(n2)));
    if (slot) {
      const days = slot.days.filter((d) => slotWeekdays.includes(d));
      if (days.length) return days;
    }
  }
  const pool = MON_FIRST.filter((d) => slotWeekdays.includes(d));
  const n = Math.max(1, Math.min(pool.length, Math.round(times)));
  return [...new Set(Array.from({ length: n }, (_, i) => pool[Math.floor(i * pool.length / n)]))];
}
function resolveItems({ profile, date, start, service, slotPerWeek = 7, slotWeekdays = [0, 1, 2, 3, 4, 5, 6] }) {
  const key = slotKey(start, service);
  const override = profile?.slotOverrides?.[key];
  if (override) return { items: ITEMS.map((it) => it.name).filter((n) => override.includes(n)), source: "手動設定" };
  const cats = categoriesFor(service);
  const startMin = minutes(start);
  const wd = weekdayOf(date);
  const set = new Set(detectItems(service));
  const gated = /* @__PURE__ */ new Set();
  const sources = [];
  const version = planVersionFor(profile?.versions, date);
  const slot = matchPlanSlot(version, { date, start, service });
  const cp = carePlanFor(profile, date);
  if (cp) {
    for (const row2 of cp.rows) {
      if (slot && !row2.items.some((n) => !SUPPORTING.has(n) && slot.items.includes(n))) {
        row2.items.filter((n) => !SUPPORTING.has(n)).forEach((n) => gated.add(n));
        continue;
      }
      const rowTime = row2.items.some((n) => ITEM[n]?.time);
      if (rowTime && !row2.items.some((n) => ITEM[n]?.time && timeOk(ITEM[n], startMin, !slot))) {
        row2.items.forEach((n) => gated.add(n));
        continue;
      }
      const usable = row2.items.filter((n) => ITEM[n] && cats.includes(ITEM[n].cat) && timeOk(ITEM[n], startMin, !slot));
      if (row2.perWeek != null && row2.perWeek < slotPerWeek - 0.5) {
        usable.forEach((n) => gated.add(n));
        if (!slot && (startMin >= 18 * 60 || SHORT_BODY.test(service))) continue;
        if (!scheduledDays(profile, row2.items, row2.perWeek, slotWeekdays, date).includes(wd)) continue;
      }
      usable.forEach((n) => set.add(n));
    }
    sources.push(`ケアプラン第2表 ${cp.date}`);
  }
  if (slot) {
    slot.items.filter((n) => !gated.has(n)).forEach((n) => set.add(n));
    sources.push(`訪問介護計画書 ${version.date} No.${slot.no}`);
  }
  if (!cp && !slot) {
    itemsForVisit(defaultSlot(profile, { start, service, slotPerWeek }), date).forEach((n) => set.add(n));
    sources.push(profile?.items?.length ? "計画書の文中" : "サービス種別のみ");
  }
  const items = ITEMS.filter((it) => it.always && cats.includes(it.cat) || set.has(it.name)).map((it) => it.name);
  return { items, source: sources.join(" ＋ ") };
}
function itemsForVisit(slot, date) {
  const wd = weekdayOf(date);
  return ITEMS.map((it) => it.name).filter((n) => slot?.[n]?.includes(wd));
}
var SCENES = {
  morning: [
    "訪問時、起きて居間で過ごされていた。",
    "朝食を済ませ、テレビのニュースを見ておられた。",
    "「おはよう」と笑顔で迎えてくださった。",
    "カーテンを開けると「今日はいい天気やね」と話されていた。",
    "訪問時、椅子に座ってお茶を飲まれていた。",
    "訪問時、新聞を広げて読まれていた。"
  ],
  day: [
    "訪問時、居間でテレビを見て過ごされていた。",
    "訪問時、ソファでうとうとされていたが、声かけですぐに目を覚まされた。",
    "笑顔で迎えてくださり、表情も穏やかだった。",
    "訪問時、ラジオを聴きながらくつろがれていた。",
    "昼食を済ませ、ゆっくり過ごされていた。",
    "訪問時、窓の外を眺めながら過ごされていた。",
    "テレビの時代劇を見ながら「この役者さんが好きなんよ」と話されていた。",
    "訪問時、テレビの旅番組を楽しそうに見ておられた。",
    "訪問時、電話で知人と話されていたが、すぐに切って迎えてくださった。",
    "訪問時、ベッドに腰かけて過ごされていた。",
    "「待ってたよ」と迎えてくださり、会話も弾んだ。",
    "訪問時、写真のアルバムを眺めておられ、昔の話を聞かせてくださった。"
  ],
  night: [
    "訪問時、テレビを見てくつろがれていた。",
    "夕食を済まされ、落ち着いて過ごされていた。",
    "訪問時、ベッドに腰かけて過ごされていた。",
    "「今日はゆっくりできたわ」と一日の様子を話してくださった。",
    "訪問時、居間でテレビの歌番組を楽しまれていた。",
    "訪問時、寝る準備を始めておられた。",
    "夕食は「おいしく食べた」とのこと。穏やかに過ごされていた。",
    "テレビのドラマを見ながら、内容を楽しそうに話してくださった。"
  ],
  heavy: [
    "訪問時、ベッド上で臥床されていた。",
    "訪問時、ベッドで横になりテレビを見ておられた。",
    "声かけに目を開けて応じてくださった。",
    "表情穏やかで、苦痛の訴えはなかった。",
    "訪問時、ベッドをギャッチアップしてテレビを見ておられた。",
    "声かけに「はい」としっかり返事をされた。"
  ],
  walker: [
    "歩行器を使って玄関まで出迎えてくださった。",
    "訪問時、歩行器で台所から居間へ移動されているところだった。"
  ]
};
var SEASON = {
  winter: [
    "寒い日が続くが、室内は暖房で暖かく保たれていた。",
    "「今日は冷えるね」と話されていたが、元気そうな様子だった。",
    "寒さのため、室温を一緒に確認し、ひざ掛けをお渡しした。",
    "乾燥しているため、加湿と水分補給について声かけした。",
    "「こたつから出られへん」と笑って話されていた。"
  ],
  spring: [
    "「暖かくなってきたね」と季節の話をされていた。",
    "窓から入る日差しを気持ちよさそうに感じておられた。",
    "「桜はもう咲いたかな」と季節の話で会話が弾んだ。",
    "「花粉がつらい」と話されていたが、体調に大きな変化はなかった。",
    "寒暖差があるため、上着の調節について声かけした。"
  ],
  rainy: [
    "雨が続き「洗濯物が乾かへん」と話されていた。",
    "蒸し暑い日のため、エアコンの除湿を一緒に確認した。",
    "「よう降るね」と窓の外の雨を眺めておられた。",
    "湿気が多いため、換気と除湿について一緒に確認した。",
    "雨で外に出られず「退屈やわ」と話されていたが、会話をすると笑顔になられた。"
  ],
  summer: [
    "暑い日が続くため、エアコンの温度を一緒に確認した。",
    "「暑いね」と話され、こまめな水分補給を声かけした。",
    "室内の温度に気をつけておられ、エアコンも適温だった。",
    "「今年の夏は特に暑いね」と話され、冷房の効いた部屋で過ごされていた。",
    "熱中症予防のため、室温とこまめな水分補給について声かけした。"
  ],
  autumn: [
    "「涼しくなって過ごしやすいね」と話されていた。",
    "季節の変わり目のため、衣類の調節について声かけした。",
    "「秋の味覚が楽しみ」と食べ物の話をされていた。",
    "朝晩冷えてきたため、寝具の調節について声かけした。",
    "「夜が長くなったね」と季節の話をされていた。"
  ]
};
function seasonOf(date) {
  const m = Number(String(date).slice(5, 7));
  if ([12, 1, 2].includes(m)) return "winter";
  if ([3, 4, 5].includes(m)) return "spring";
  if (m === 6) return "rainy";
  if ([7, 8, 9].includes(m)) return "summer";
  if ([10, 11].includes(m)) return "autumn";
  return null;
}
var HEALTH = {
  light: [
    "顔色良く、体調の訴えはなかった。",
    "表情明るく、体調の変化はみられなかった。",
    "体調を伺うと「変わりないよ」とのこと。",
    "顔色・表情とも普段どおりで、発汗もなかった。",
    "食欲もあると話され、体調は安定している様子だった。",
    "「昨夜はよく眠れた」と話され、顔色も良好だった。"
  ],
  heavy: [
    "顔色・呼吸状態に変化はなかった。",
    "表情穏やかで、苦痛の訴えはなかった。",
    "顔色良好で、発汗や発熱の様子もなかった。"
  ],
  summer: ["暑さによる体調の変化はみられなかった。"],
  winter: ["寒さによる体調の変化はみられなかった。"]
};
var ITEM_TEXT = {
  "トイレ介助": {
    any: [
      "トイレでの立ち座りは手すりにつかまり安定していた。",
      "トイレへ声かけし、排泄後の後始末もご自身で行えた。",
      "排泄の確認をし、トイレまで付き添った。"
    ],
    adl: { "排尿:見守り等": ["トイレへの移動は見守りで、ふらつきなく行えた。", "トイレでは見守りのみで、ご自身で済まされた。"] },
    heavy: ["トイレ誘導し、立位保持を介助して排泄介助を行った。"]
  },
  "Pトイレ介助": { any: ["ポータブルトイレへの移乗を介助し、排泄を済まされた。"] },
  "パッド交換": {
    light: ["パッド交換時、腰上げに協力していただけた。"],
    heavy: ["パッド交換時、声かけで横向きになる協力動作があった。"]
  },
  "おむつ交換": {
    light: ["おむつ交換時、腰を上げる協力動作があった。"],
    heavy: ["おむつ交換時、声かけで横向きになる協力動作があった。", "おむつ交換時、腰を上げる協力動作があった。陰部の発赤なし。", "陰部清拭を行い、皮膚トラブルのないことを確認した。"]
  },
  "食事一部介助": {
    light: ["ご自身で召し上がられ、見守りと一部介助で全量摂取された。"],
    heavy: ["一口ずつ声かけしながら食事介助を行った。むせ込みなし。"]
  },
  "食事全介助": { any: ["一口ずつ声かけしながら食事介助を行った。むせ込みなし。"] },
  "水分補給": {
    any: [
      "お茶をすすめると、コップ1杯を飲まれた。",
      "水分補給をすすめると「喉が渇いてた」と飲まれた。",
      "入浴後にお茶をすすめ、ゆっくり飲まれた。",
      "好みの麦茶を用意し、水分を摂っていただいた。"
    ],
    season: { summer: ["暑さのため、こまめに水分を摂るよう声かけした。"] }
  },
  "全身浴": {
    any: [
      "入浴前に体調を確認し、問題なく入浴された。",
      "湯船につかり「あ〜気持ちいい」と笑顔を見せられた。",
      "入浴後、「さっぱりした」と喜ばれていた。",
      "浴槽の出入りは手すりにつかまり、安全に行えた。",
      "入浴中、昔の銭湯の話をされ、楽しそうだった。",
      "入浴後、皮膚の状態を確認し、異常はなかった。"
    ],
    adl: {
      "洗身:一部介助": ["手の届く所はご自身で洗われ、背中と足先を介助した。", "洗身は前面をご自身で洗われ、背中を介助した。湯加減も「ちょうどいい」とのこと。"],
      "洗身:自立": ["洗身はご自身で行われ、見守りのみ行った。"],
      "洗身:全介助": ["洗身を介助し、皮膚の状態を確認した。"]
    },
    season: { winter: ["脱衣所を暖めてから入浴した。ヒートショックに注意し、ふらつきもなかった。"], summer: ["入浴で汗を流し、「すっきりした」と話されていた。"] }
  },
  "洗髪": { any: ["洗髪を介助し、「頭が軽くなった」と話されていた。", "洗髪後、ドライヤーで髪を乾かした。", "洗髪時、目にお湯が入らないよう声かけしながら行った。"] },
  "清拭": {
    light: ["清拭を行い、「さっぱりした」と話されていた。"],
    heavy: ["全身清拭を行った。皮膚の発赤なし。"]
  },
  "部分浴": { any: ["足浴を行い、「温まった」と喜ばれていた。"] },
  "更衣介助": {
    any: ["更衣を介助し、清潔な衣類に着替えられた。", "着替えの服を一緒に選び、気持ちよく更衣された。"],
    adl: { "上衣の着脱:見守り等": ["更衣は見守りで行い、ボタン留めのみ介助した。", "声かけでご自身で袖を通され、ズボンの着脱は立位を支えた。", "座って更衣され、見守りで安全に行えた。"] },
    heavy: ["更衣時、袖通しに腕を伸ばす協力動作があった。"]
  },
  "整容": { any: ["髪を整えると「きれいになった」と鏡を見て喜ばれた。", "顔を拭き、髪を整えた。", "整髪を手伝い、身だしなみを整えた。"] },
  "洗面": {
    light: ["洗面所で顔を洗われ、見守った。"],
    heavy: ["温かいタオルで顔を拭き、洗面を介助した。", "蒸しタオルで顔を拭くと、気持ちよさそうにされていた。"]
  },
  "口腔ケア": {
    any: ["就寝前の歯磨きを声かけし、ご自身で丁寧にされていた。", "口腔ケアを行い、口の中がすっきりした様子だった。"],
    adl: { "口腔衛生:自立": ["歯磨きはご自身で行われ、仕上がりを確認した。", "うがいまでご自身でしっかりされていた。"] }
  },
  "体位変換": {
    light: ["寝返りの際、柵につかまりご自身で向きを変えられた。"],
    heavy: ["体位変換を行い、除圧を実施した。仙骨部の発赤なし。"]
  },
  "移乗介助": {
    any: ["車いすへの移乗は手すりを使い、安全に行えた。"],
    adl: { "移乗:見守り等": ["移乗は見守りで、ゆっくり安全に行えた。"] },
    heavy: ["ベッドから車いすへの移乗介助を行った。立ち上がりの際、足に力を入れる協力動作があった。"]
  },
  "移動介助": {
    any: ["居室からトイレまで見守り歩行。ふらつきなし。"],
    adl: { "歩行:何かに掴まればできる": ["歩行器を使って移動され、ふらつきはなかった。", "手すりにつかまりながら、ゆっくり移動された。"] },
    heavy: ["手引き歩行で移動を介助した。足の運びはゆっくりだが安定していた。"]
  },
  "服薬介助・確認": {
    any: ["お薬カレンダーで飲み忘れがないことを確認した。", "服薬を見守り、飲み込まれたことを確認した。"],
    adl: { "薬の内服:一部介助": ["お薬カレンダーから薬を一緒に取り出し、服用を確認した。", "「薬はもう飲んだかな」と気にされていたため、カレンダーで一緒に確認した。", "薬を手渡し、水で服用されたことを確認した。"] }
  },
  "起床介助": { any: ["声かけで起き上がられ、端座位で一息ついてから移動された。", "カーテンを開け、起き上がりを介助した。"] },
  "就寝介助": {
    any: [
      "就寝の準備を手伝い、「おやすみ」と穏やかに休まれた。",
      "ベッドに横になられたのを確認し、布団を整えた。",
      "寝る前に部屋の温度を確認し、ベッドに入られるのを見守った。",
      "ベッドへの移動を見守り、楽な姿勢に整えた。",
      "寝具を整え、枕元に眼鏡と水を置いた。"
    ],
    heavy: ["ベッドへの移動を介助し、楽な姿勢に整えて就寝された。"]
  },
  "通院・外出介助": { any: ["通院に付き添った。待ち時間も落ち着いて過ごされていた。"] },
  "共に行う家事": { any: ["家事を一緒に行い、できることはご自身で行っていただいた。"] },
  "転倒予防の声かけ・見守り": { any: ["移動の際は声かけし、ふらつきなく歩かれていた。"] },
  "掃除": {
    any: [
      "居室とトイレの掃除を行った。",
      "台所の拭き掃除と居室の掃除機かけを行った。",
      "掃除中、「いつもきれいにしてもらって助かる」と話されていた。",
      "ご本人にもテーブル拭きをしていただき、一緒に掃除を行った。",
      "浴室とトイレを中心に掃除を行った。"
    ]
  },
  "洗濯": {
    any: ["洗濯をして室内に干した。", "洗濯を行い、ベランダに干した。", "洗濯物を一緒にたたみ、ご本人に収納していただいた。"],
    season: { rainy: ["雨のため、洗濯物は室内に干した。"], summer: ["天気が良く、洗濯物をベランダに干した。"] }
  },
  "取り入れ・収納": { any: ["乾いた洗濯物を取り込み、たたんで収納した。"] },
  "シーツ交換": { any: ["シーツ交換を行い、「気持ちいいね」と話されていた。", "シーツと枕カバーを交換した。"] },
  "ベッドメイク": { any: ["ベッドを整えた。"] },
  "一般的な調理": { any: ["本人の希望を伺いながら調理を行った。", "調理を行い、「おいしい」と召し上がられた。"] },
  "配・下膳": { any: ["配膳・下膳を行った。"] },
  "日常品等の買物": { any: ["依頼の品を購入し、レシートとお釣りを一緒に確認した。"] },
  "ゴミ出し": { any: ["ゴミをまとめて指定の場所に出した。"] },
  "衣類の整理": { any: ["季節に合わせて衣類を整理した。"] }
};
var GENERAL = [
  "ゆっくり話を伺い、困りごとがないか確認した。",
  "室内を確認し、危ない物が床に置かれていないことを確認した。",
  "最近の様子を伺うと「変わりなく過ごせてる」とのこと。",
  "一緒にテレビを見ながら会話を楽しまれた。",
  "昔の仕事の話を楽しそうにしてくださった。"
];
var DEMENTIA = [
  "昔の仕事の話をされ、事実と異なる内容（作話）もみられたが、否定せず傾聴した。",
  "「今朝、息子が来た」と話されたが確認できず、作話と思われる。話を合わせて傾聴した。",
  "同じ質問を何度かされたが、その都度ゆっくり説明すると納得された。",
  "日付があいまいな様子があり、カレンダーを一緒に確認した。",
  "落ち着いて過ごされ、混乱なく援助を受け入れてくださった。",
  "「財布がない」と探されていたが、一緒に探すと引き出しの中にあり安心された。",
  "昔住んでいた家の話を繰り返しされたが、相づちを打ちながら傾聴した。",
  "援助の手順を一つずつ説明しながら行うと、落ち着いて応じてくださった。"
];
var CLOSING = {
  day: [
    "戸締り・火元を確認して退室した。",
    "次回の訪問日を伝えると「待ってるね」と見送ってくださった。",
    "退室時、「ありがとう」と笑顔で見送ってくださった。",
    "困りごとがないか伺い、特になしとのことで退室した。"
  ],
  night: [
    "戸締りと火元を確認し、「おやすみなさい」と声をかけて退室した。",
    "電気・戸締りを確認して退室した。",
    "「また明日ね」と声をかけると、笑顔で応えてくださった。"
  ]
};
var MAX_LENGTH = 170;
function fits(sentence, season, time, items = []) {
  if (/入浴/.test(sentence) && !items.includes("全身浴")) return false;
  if (season === "rainy" && /いい天気|ベランダ|天気が良く/.test(sentence)) return false;
  if (season !== "rainy" && /雨/.test(sentence)) return false;
  if (season === "summer" && /暖房|ひざ掛け|冷え/.test(sentence)) return false;
  if (time === "night" && /昨夜|おはよう|朝食|昼食|カーテンを開け/.test(sentence)) return false;
  if (time !== "night" && /おやすみ|夕食|また明日/.test(sentence)) return false;
  return true;
}
function tierOf(careLevel) {
  return /要介護[345]/.test(careLevel ?? "") ? "heavy" : "light";
}
function rng(seed) {
  let h = 2166136261;
  for (const c of String(seed)) h = Math.imul(h ^ c.codePointAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ h >>> 15, 2246822507);
    h = Math.imul(h ^ h >>> 13, 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}
function itemSentences(name, tier, adl, season) {
  const t = ITEM_TEXT[name];
  if (!t) return [];
  const fromAdl = Object.entries(t.adl ?? {}).filter(([k]) => {
    const [item, value] = k.split(":");
    return adl?.[item] === value;
  }).flatMap(([, v]) => v);
  const tiered = tier === "heavy" ? t.heavy ?? t.any ?? t.light ?? [] : [...t.any ?? [], ...t.light ?? []];
  return [...fromAdl, ...fromAdl, ...t.season?.[season] ?? [], ...tier === "heavy" ? tiered : fromAdl.length ? t.any ?? [] : tiered];
}
function generateComment({ profile, items, seed, start = "", date = "", maxItems = 2 }) {
  const rand = rng(seed);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const tier = tierOf(profile?.careLevel);
  const startMin = minutes(start);
  const time = startMin < 11 * 60 ? "morning" : startMin >= 18 * 60 ? "night" : "day";
  const season = seasonOf(date);
  const adl = profile?.adl ?? {};
  const used = /* @__PURE__ */ new Set();
  const take = (arr) => {
    const left = arr.filter((s2) => !used.has(s2) && fits(s2, season, time, items));
    const s = left.length ? pick(left) : null;
    if (s) used.add(s);
    return s;
  };
  let scenes = tier === "heavy" ? SCENES.heavy : SCENES[time];
  if (profile?.walker && tier === "light" && time !== "night") scenes = [...scenes, ...SCENES.walker];
  const head = [take(scenes)];
  const optional = [];
  if (season && rand() < 0.45) optional.push(take(SEASON[season]));
  if (items.includes("顔色・発汗・体温等") && rand() < 0.6) {
    head.push(take([...HEALTH[tier], ...HEALTH[season] ?? []]));
  }
  const pool = items.filter((n) => ITEM_TEXT[n]);
  const body = shuffle(pool.filter((n) => ITEM[n].cat === "body"), rand);
  const life = shuffle(pool.filter((n) => ITEM[n].cat !== "body"), rand);
  const main = [...body, ...life].slice(0, maxItems).map((n) => take(itemSentences(n, tier, adl, season))).filter(Boolean);
  if (!main.length) main.push(take(GENERAL));
  if (profile?.dementia) main.push(take(DEMENTIA));
  if (rand() < 0.6) optional.push(take(CLOSING[time === "night" ? "night" : "day"]));
  const lines = [...head, ...main];
  for (const s of optional.filter(Boolean)) {
    if (lines.join("").length + s.length <= MAX_LENGTH) {
      if (CLOSING.day.includes(s) || CLOSING.night.includes(s)) lines.push(s);
      else lines.splice(1, 0, s);
    }
  }
  return lines.join("");
}
function shuffle(arr, rand) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// js/pdfimport.js
var WD = "日月火水木金土";
function toLines(items, tol = 3) {
  const sorted = items.filter((it) => it.str.trim()).sort((a, b) => a.y - b.y || a.x - b.x);
  const lines = [];
  for (const it of sorted) {
    const line = lines.find((l) => Math.abs(l.y - it.y) <= tol);
    if (line) line.items.push(it);
    else lines.push({ y: it.y, items: [it] });
  }
  for (const l of lines) {
    l.items.sort((a, b) => a.x - b.x);
    l.text = l.items.map((it) => it.str).join(" ");
  }
  return lines.sort((a, b) => a.y - b.y);
}
var joinText = (items) => items.map((it) => it.str).join("").replace(/\s+/g, "");
function normalizeName(name) {
  return String(name ?? "").replace(/[\s　]|様$/g, "");
}
function wareki(era) {
  return 2018 + Number(era);
}
function pad(n) {
  return String(n).padStart(2, "0");
}
function classifyPage(text) {
  const t = text.replace(/\s+/g, "");
  if (t.includes("訪問介護計画書")) return "homecareplan";
  if (/サービス提供票別表/.test(t)) return "skip";
  if (/サービス事業所→居宅介護支援事業者/.test(t) && t.includes("実績")) return "jisseki";
  if (/サービス(提供|利用)票別表/.test(t)) return "skip";
  if (/サービス(提供|利用)票/.test(t)) return "teikyo";
  if (/課題分析標準項目|アセスメントシート/.test(t)) return "assessment";
  if (t.includes("第２表") || t.includes("第2表")) return "careplan2";
  if (/第[１1３3]表/.test(t)) return "careplan";
  return "other";
}
function tokens(it) {
  const out = [];
  const re = /\d+/g;
  let m;
  while (m = re.exec(it.str)) {
    const mid = (m.index + m[0].length / 2) / it.str.length;
    out.push({ value: m[0], x: it.x + mid * it.w });
  }
  return out;
}
function parseTeikyo(items) {
  const find = (re) => items.find((it) => re.test(it.str.trim()));
  const head = items.filter((it) => /^令和\d+年\d+月\s*(分)?$/.test(it.str.trim())).sort((a, b) => a.y - b.y)[0];
  if (!head) return null;
  const [, era, mon] = /令和(\d+)年(\d+)月/.exec(head.str);
  const month = `${wareki(era)}-${pad(mon)}`;
  const sama = items.filter((it) => it.str.trim() === "様").sort((a, b) => a.y - b.y)[0];
  const name = sama ? items.filter((it) => Math.abs(it.y - sama.y) <= 3 && it.x < sama.x && it.x > sama.x - 200 && !/氏名|フリガナ|被保険者/.test(it.str)).sort((a, b) => a.x - b.x).map((it) => it.str.trim()).join(" ") : "";
  const label = items.find((it) => it.str.trim() === "被保険者" && it.x < 70);
  const insuredNo = label ? items.filter((it) => it.y >= label.y - 2 && it.y <= label.y + 14 && it.x > label.x + 40 && it.x < label.x + 200 && /^[\d\s]+$/.test(it.str)).sort((a, b) => a.x - b.x).map((it) => it.str).join("").replace(/\s/g, "") : "";
  const lv = find(/^要(介護|支援)/);
  let careLevel = "";
  if (lv) {
    const near = items.filter((it) => Math.abs(it.y - lv.y) <= 3 && it.x >= lv.x && it.x < lv.x + 60).sort((a, b) => a.x - b.x).map((it) => it.str).join("");
    careLevel = detectCareLevel(near);
  }
  const wdLabel = items.find((it) => it.str.trim() === "曜日");
  if (!wdLabel) return { month, kind: "", name, insuredNo, careLevel, visits: [] };
  const days = items.filter((it) => Math.abs(it.y - wdLabel.y) <= 3 && it.x > wdLabel.x + 15 && it.str.trim().length === 1 && WD.includes(it.str.trim())).map((it) => it.x + it.w / 2).sort((a, b) => a - b);
  const visits = [];
  for (const yotei of items.filter((it) => it.str.trim() === "予定" && Math.abs(it.x - wdLabel.x) < 6)) {
    const y = yotei.y;
    const inRow = (x0, x1) => items.filter((it) => it.y >= y - 6 && it.y <= y + 9 && it.x >= x0 && it.x < x1).sort((a, b) => a.y - b.y || a.x - b.x);
    const times = inRow(0, 52).map((it) => /(\d{1,2}:\d{2})/.exec(it.str)?.[1]).filter(Boolean);
    const service = joinText(inRow(50, 125));
    const office = joinText(inRow(125, 215));
    if (!times[0]) continue;
    const marks = items.filter((it) => Math.abs(it.y - y) <= 3 && it.x > days[0] - 8 && it.x < days.at(-1) + 8).flatMap(tokens).filter((t) => Number(t.value) > 0);
    for (const t of marks) {
      let best = -1, dist = 8;
      days.forEach((cx, i) => {
        if (Math.abs(cx - t.x) < dist) {
          dist = Math.abs(cx - t.x);
          best = i;
        }
      });
      if (best >= 0) {
        visits.push({ date: `${month}-${pad(best + 1)}`, start: times[0], end: times[1] ?? "", service, office });
      }
    }
  }
  const kind = items.some((it) => it.str.replace(/\s/g, "").includes("サービス利用票")) ? "利用票" : "提供票";
  return { month, kind, name, insuredNo, careLevel, visits };
}
function parseJisseki(items) {
  const lines = toLines(items);
  const flat = lines.map((l) => l.text.replace(/\s/g, ""));
  const mm = flat.map((t) => /令和(\d+)年(\d+)月分/.exec(t)).find(Boolean);
  if (!mm) return null;
  const month = `${wareki(mm[1])}-${pad(mm[2])}`;
  const label = items.filter((it) => it.str.trim() === "被保険者").sort((a, b) => a.x - b.x || a.y - b.y);
  const noLabel = label[0], nameLabel = label.find((it) => it.x > noLabel.x + 100);
  const insuredNo = noLabel ? items.filter((it) => it.y >= noLabel.y - 2 && it.y <= noLabel.y + 12 && it.x > noLabel.x + 40 && it.x < (nameLabel?.x ?? noLabel.x + 200) && /^[\d\s]+$/.test(it.str)).sort((a, b) => a.x - b.x).map((it) => it.str).join("").replace(/\s/g, "") : "";
  const name = nameLabel ? items.filter((it) => it.y > nameLabel.y + 1 && it.y < nameLabel.y + 12 && it.x > nameLabel.x + 50 && it.x < nameLabel.x + 380 && !/氏名/.test(it.str)).sort((a, b) => a.x - b.x).map((it) => it.str.trim()).filter(Boolean).join(" ") : "";
  const lv = items.find((it) => /^要(介護|支援)[1-5１-５]$/.test(it.str.trim()));
  const careLevel = lv ? detectCareLevel(lv.str) : "";
  const wdItems = items.filter((it) => it.str.trim().length === 1 && WD.includes(it.str.trim()) && it.x > 300);
  const byY = {};
  for (const it of wdItems) (byY[Math.round(it.y)] ??= []).push(it);
  const row2 = Object.values(byY).sort((a, b) => b.length - a.length)[0] ?? [];
  const days = row2.map((it) => it.x + it.w / 2).sort((a, b) => a - b);
  if (days.length < 28) return { month, kind: "実績票", name, insuredNo, careLevel, visits: [] };
  const marksAt = (y) => items.filter((it) => Math.abs(it.y - y) <= 2 && it.x > days[0] - 8 && it.x < days.at(-1) + 8).flatMap(tokens).filter((t) => Number(t.value) > 0).map((t) => {
    let best = -1, dist = 8;
    days.forEach((cx, i) => {
      if (Math.abs(cx - t.x) < dist) {
        dist = Math.abs(cx - t.x);
        best = i;
      }
    });
    return best;
  }).filter((i) => i >= 0);
  const visits = [];
  const plans = items.filter((it) => it.str.trim() === "予定" && it.x > 250 && it.x < days[0]);
  for (const yotei of plans) {
    const jisseki = items.find((it) => it.str.trim() === "実績" && Math.abs(it.x - yotei.x) < 6 && it.y > yotei.y && it.y < yotei.y + 16);
    const y0 = yotei.y - 3, y1 = (jisseki?.y ?? yotei.y + 11) + 3;
    const inRow = (x0, x1) => items.filter((it) => it.y >= y0 && it.y <= y1 && it.x >= x0 && it.x < x1).sort((a, b) => a.y - b.y || a.x - b.x);
    const times = inRow(0, 70).map((it) => /(\d{1,2}:\d{2})/.exec(it.str)?.[1]).filter(Boolean);
    if (!times[0]) continue;
    const service = joinText(inRow(70, 130));
    const office = joinText(inRow(130, yotei.x - 5));
    const planned = new Set(marksAt(yotei.y));
    const actual = new Set(jisseki ? marksAt(jisseki.y) : []);
    for (const d of [.../* @__PURE__ */ new Set([...planned, ...actual])].sort((a, b) => a - b)) {
      visits.push({ date: `${month}-${pad(d + 1)}`, start: times[0], end: times[1] ?? "", service, office, planned: planned.has(d), actual: actual.has(d) });
    }
  }
  return { month, kind: "実績票", name, insuredNo, careLevel, visits };
}
function parseDays(text) {
  const t = String(text ?? "").replace(/\s+/g, "");
  if (!t || /毎日/.test(t) || parseDates(t)) return [0, 1, 2, 3, 4, 5, 6];
  const range = /([日月火水木金土])[～〜~\-ー]([日月火水木金土])/.exec(t);
  if (range) {
    const out = [];
    for (let i = WD.indexOf(range[1]); ; i = (i + 1) % 7) {
      out.push(i);
      if (i === WD.indexOf(range[2])) break;
    }
    return out.sort();
  }
  return [...new Set([...t].map((c) => WD.indexOf(c)).filter((i) => i >= 0))].sort();
}
function parseDates(text) {
  const t = String(text ?? "").replace(/\s+/g, "");
  if (!/\d+日/.test(t)) return null;
  const out = /* @__PURE__ */ new Set();
  for (const m of t.matchAll(/(\d+)日(?:[～〜~\-ー](\d+)日)?/g)) {
    const a = Number(m[1]), b = Number(m[2] ?? m[1]);
    for (let d = a; d <= b; d++) out.add(d);
  }
  return [...out].sort((x, y) => x - y);
}
function span(line, label) {
  let text = "";
  const parts = [];
  for (const it of line.items) {
    const str = it.str.replace(/\s/g, "");
    parts.push({ it, from: text.length, len: str.length });
    text += str;
  }
  const i = text.indexOf(label);
  if (i < 0) return null;
  const at = (k) => {
    const p = parts.find((p2) => k >= p2.from && k < p2.from + p2.len) ?? parts.at(-1);
    return p.it.x + (k - p.from) / Math.max(p.len, 1) * p.it.w;
  };
  return { x0: at(i), x1: at(i + label.length - 1) + (at(i + label.length - 1) - at(i)) / Math.max(label.length - 1, 1) };
}
var compact = (l) => l.text.replace(/\s/g, "");
function parseHomeCarePlan(pages) {
  const versions = [];
  let current = null;
  let name = "", careLevel = "";
  for (const items of pages) {
    const lines = toLines(items);
    const all = lines.map((l) => l.text).join("\n");
    const flat = lines.map(compact).join("\n");
    const made = /作成日：?令和(\d+)年(\d+)月(\d+)日/.exec(flat);
    if (made) {
      current = { date: `${wareki(made[1])}-${pad(made[2])}-${pad(made[3])}`, slots: [] };
      versions.push(current);
      careLevel = detectCareLevel(all) || careLevel;
      const nm = /氏名\s*(.+?)\s*様/.exec(all);
      if (nm) name = nm[1].trim();
    }
    if (!flat.includes("週間サービス計画表")) continue;
    if (!current) {
      current = { date: "", slots: [] };
      versions.push(current);
    }
    const header = lines.find((l) => compact(l).includes("時間帯") && compact(l).includes("曜日"));
    if (!header) continue;
    const no = span(header, "No"), time = span(header, "時間帯"), day = span(header, "曜日");
    const kind = span(header, "サービス区分"), ins = span(header, "保険内外");
    const b0 = no ? no.x1 + 3 : time.x0 - 15;
    const b1 = (time.x1 + day.x0) / 2, b2 = (day.x1 + kind.x0) / 2, b3 = ins ? (kind.x1 + ins.x0) / 2 : kind.x1 + 20;
    const firstContent = lines.find((l) => compact(l).includes("サービス内容（"))?.y ?? Infinity;
    for (const l of lines.filter((l2) => l2.y > header.y && l2.y < firstContent)) {
      const pick = (x0, x1) => l.items.filter((it) => it.x >= x0 && it.x < x1).map((it) => it.str).join("").replace(/\s/g, "");
      const n = pick(0, b0), t = pick(b0, b1), days = pick(b1, b2), svc = pick(b2, b3);
      const m = /(\d{1,2}:\d{2})[～〜~-](\d{1,2}:\d{2})/.exec(t);
      if (!/^\d+$/.test(n) || !m) continue;
      current.slots.push({ no: Number(n), start: m[1], end: m[2], dayText: days, days: parseDays(days), dates: parseDates(days), service: svc, content: "", items: [] });
    }
    const sections = lines.filter((l) => /サービス内容（No\.?\d+/.test(compact(l)));
    sections.forEach((sec, i) => {
      const no2 = Number(/No\.?(\d+)/.exec(compact(sec))[1]);
      const slot = current.slots.find((s) => s.no === no2);
      if (!slot) return;
      const end = sections[i + 1]?.y ?? (lines.find((l) => l.y > sec.y && compact(l).includes("特記事項"))?.y ?? Infinity);
      const head = lines.find((l) => l.y > sec.y && l.y < end && compact(l).includes("所要時間"));
      if (!head) return;
      const k = span(head, "サービス区分"), dur = span(head, "所要時間");
      const x0 = k ? k.x1 + 10 : 0;
      const x1 = dur.x0 - 5;
      slot.content = lines.filter((l) => l.y > head.y && l.y < end).map((l) => l.items.filter((it) => it.x >= x0 && it.x < x1).map((it) => it.str).join("")).join("").replace(/\s/g, "").replace(/頻度：[^（(]*[（(][\d:～〜~\-]*[）)]?/g, "").replace(/^[\d:～〜~\-]*[）)]/, "").trim();
      slot.items = detectItems(slot.content);
    });
  }
  return { name, careLevel, versions: versions.filter((v) => v.slots.length) };
}
function parseAssessment(pages) {
  const lines = pages.flatMap((items) => toLines(items)).map((l) => l.items.map((it) => it.str).join("").replace(/\s+/g, ""));
  const all = lines.join("\n");
  const lv = /☑要(介護|支援)([1-5])/.exec(all);
  const dLine = lines.find((l) => l.includes("Ⅱa") && l.includes("Ⅲb") && l.includes("☑"));
  const dementiaLevel = dLine ? /☑(自立|Ⅰ|Ⅱa|Ⅱb|Ⅲa|Ⅲb|Ⅳ|M)/.exec(dLine)?.[1] ?? "" : "";
  const nm = /利用者氏名(.+?)(性別|$)/m.exec(all);
  return {
    name: nm ? nm[1] : "",
    careLevel: lv ? `要${lv[1]}${lv[2]}` : "",
    dementiaLevel,
    dementia: /^(Ⅱ|Ⅲ|Ⅳ|M)/.test(dementiaLevel),
    walker: /室内：使用機器[^\n]*☑歩行器/.test(all),
    adl: parseAdl(lines),
    wheelchair: /☑車いす/.test(all)
  };
}
var ADL_KEYS = ["寝返り", "起き上がり", "歩行", "洗身", "移乗", "食事摂取", "口腔衛生", "上衣の着脱", "ズボンの着脱", "薬の内服", "金銭の管理", "買物", "簡単な調理", "排尿", "排便"];
function parseAdl(lines) {
  const adl = {};
  for (const key of ADL_KEYS) {
    const line = lines.find((l) => l.includes(key) && l.includes("☑") && /[□☑]/.test(l.slice(l.indexOf(key) + key.length, l.indexOf(key) + key.length + 3)));
    const m = line && new RegExp(`${key}[^☑]*?☑([^□☑
]+)`).exec(line);
    if (m) adl[key] = m[1].trim();
  }
  return adl;
}
function parseCarePlan2(items) {
  const head = items.find((it) => it.str.trim() === "サービス内容");
  const kindHead = items.find((it) => it.str.trim() === "サービス種別");
  const freqHead = items.find((it) => it.str.trim() === "頻度");
  if (!head || !kindHead) return [];
  const markHead = items.find((it) => /^※１$/.test(it.str.trim()) && it.x > head.x && it.x < kindHead.x);
  const contentX = [head.x - 40, (markHead?.x ?? kindHead.x) - 3];
  const kindX = [kindHead.x - 15, kindHead.x + 70];
  const kinds = items.filter((it) => it.y > head.y + 5 && it.x >= kindX[0] && it.x < kindX[1]).sort((a, b) => a.y - b.y);
  const starts = kinds.filter((it, i) => i === 0 || it.y - kinds[i - 1].y > 20);
  const rows2 = [];
  starts.forEach((s, i) => {
    const y0 = s.y - 4, y1 = starts[i + 1] ? starts[i + 1].y - 4 : Infinity;
    const inBand = (x0, x1) => items.filter((it) => it.y >= y0 && it.y < y1 && it.x >= x0 && it.x < x1).sort((a, b) => a.y - b.y || a.x - b.x).map((it) => it.str).join("").replace(/\s+/g, "");
    const kind = inBand(...kindX);
    if (!kind.includes("訪問介護")) return;
    const content = inBand(...contentX);
    const freq = freqHead ? inBand(freqHead.x - 12, freqHead.x + 30) : "";
    rows2.push({ content, freq, perWeek: perWeek(freq), items: detectItems(content) });
  });
  return rows2;
}
function readDocument(pages) {
  const kinds = pages.map((items) => classifyPage(items.map((it) => it.str).join("")));
  const result = { teikyo: [], jisseki: [], homeCarePlan: null, assessment: null, carePlan2: [], text: "" };
  const plain = [];
  pages.forEach((items, i) => {
    if (kinds[i] === "teikyo") {
      const t = parseTeikyo(items);
      if (t) result.teikyo.push(t);
    } else if (kinds[i] === "jisseki") {
      const j = parseJisseki(items);
      if (j) result.jisseki.push(j);
    } else if (kinds[i] === "careplan2") {
      result.carePlan2.push(...parseCarePlan2(items));
    }
    if (!["skip", "teikyo", "jisseki"].includes(kinds[i])) plain.push(toLines(items).map((l) => l.text).join("\n"));
  });
  const hcp = pages.filter((_, i) => kinds[i] === "homecareplan");
  if (hcp.length) result.homeCarePlan = parseHomeCarePlan(hcp);
  const asm = pages.filter((_, i) => kinds[i] === "assessment");
  if (asm.length) result.assessment = parseAssessment(asm);
  result.text = plain.join("\n");
  result.name = result.teikyo[0]?.name || result.homeCarePlan?.name || result.assessment?.name || (/利用者(?:氏)?名\s*[:：]?\s*(.+?)\s*様/.exec(result.text)?.[1] ?? "");
  result.kinds = [...new Set(kinds)];
  return result;
}

// js/form.js
var BODY = [
  ["排泄介助", [
    [["トイレ介助", "トイレ介助"], ["Pトイレ介助", "Pトイレ介助"], ["尿器介助", "尿器介助"]],
    [["パッド交換", "パッド交換"], ["おむつ交換", "おむつ交換"], ["排便（　回）", null], ["排尿（　回）", null]]
  ]],
  ["食事介助", [
    [["全介助", "食事全介助"], ["一部介助", "食事一部介助"], ["水分補給（　　cc）", "水分補給"]],
    [["特段の調理", "特段の調理"], ["食事量　完食・残量（　／　）", null]]
  ]],
  ["身なりの", [
    [["清拭（全身・部分）", "清拭"], ["洗髪", "洗髪"], ["爪切り（手・足）", "爪切り"]]
  ]],
  ["保清・整容", [
    [["全身浴（入浴・シャワー浴）", "全身浴"], ["部分浴（手・足・陰部・臀部）", "部分浴"]],
    [["洗面", "洗面"], ["口腔ケア", "口腔ケア"], ["整容", "整容"], ["更衣介助", "更衣介助"]]
  ]],
  ["移　　動", [
    [["体位変換", "体位変換"], ["移乗介助", "移乗介助"], ["移動介助", "移動介助"], ["通院・外出介助", "通院・外出介助"]]
  ]],
  ["起床就寝", [
    [["起床介助", "起床介助"], ["就寝介助", "就寝介助"]]
  ]],
  ["服　　薬", [
    [["服薬介助・確認", "服薬介助・確認"], ["薬の塗布", "薬の塗布"], ["点眼", "点眼"], ["その他（　　）", null]]
  ]],
  ["自立支援", [
    [["共に行う（掃除・洗濯・衣類整理・調理・買い物）", "共に行う家事"]],
    [["認知症高齢者の記憶への働きかけ", "認知症の記憶への働きかけ"]],
    [["転倒予防の声かけ・見守り（入浴・更衣・移動）", "転倒予防の声かけ・見守り"]],
    [["その他（　　　　）", null]]
  ]]
];
var LIFE = [
  ["掃　　除", [
    [["居室・寝室・台所・トイレ・浴室", "掃除"]],
    [["ゴミ出し", "ゴミ出し"], ["準備・後片付け", null]]
  ]],
  ["洗　　濯", [
    [["洗濯（乾燥・干し）", "洗濯"], ["取り入れ収納", "取り入れ・収納"], ["アイロン", "アイロン"]]
  ]],
  ["寝具の手入れ", [
    [["シーツ交換", "シーツ交換"], ["ベッドメイク", "ベッドメイク"], ["布団干し", "布団干し"]]
  ]],
  ["衣　　類", [
    [["衣類の整理", "衣類の整理"], ["被服の補修", "被服の補修"]]
  ]],
  ["調理配下膳", [
    [["一般的な調理", "一般的な調理"], ["配・下膳", "配・下膳"], ["後片付け", "後片付け"]],
    [["献立", "menu"]]
  ]],
  ["買 物 等", [
    [["日常品等の買物", "日常品等の買物"], ["薬の受取り", "薬の受取り"]],
    [["預り金　　　円　買物　　　円　おつり　　　円", "money"]]
  ]]
];
var WEEKDAYS3 = ["日", "月", "火", "水", "木", "金", "土"];
function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}
function minutes2(t) {
  const m = /(\d{1,2}):(\d{2})/.exec(String(t));
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}
function duration(start, end) {
  const d = minutes2(end) - minutes2(start);
  return Number.isFinite(d) && d > 0 ? d : "";
}
function circled(options, chosen) {
  return options.map((o) => o === chosen ? `<span class="maru">${o}</span>` : o).join("・");
}
function groupRows(groups, items) {
  const cell = ([text, name]) => {
    if (name === "menu") return '<span class="cb">献立</span><span class="fill wide"></span>';
    if (name === "money") return `<span class="small">${esc(text)}</span>`;
    return `<span class="cb">${items.includes(name) ? '<b class="on">☑</b>' : "□"}${esc(text)}</span>`;
  };
  return groups.map(([label, lines]) => `
    <div class="frow"><div class="flabel">${label}</div>
      <div class="fitems">${lines.map((l) => `<div>${l.map(cell).join("")}</div>`).join("")}</div>
    </div>`).join("");
}
function recordCard(r, { office = "" } = {}) {
  const [y, m, d] = r.date.split("-").map(Number);
  const wd = WEEKDAYS3[new Date(y, m - 1, d).getDay()];
  const start = r.recStart || r.actualStart || r.planStart, end = r.recEnd || r.actualEnd || r.planEnd;
  const [sh, sm] = String(start).split(":"), [eh, em] = String(end).split(":");
  const has = (n) => r.items.includes(n);
  const box = (on, text) => `<span class="cb">${on ? '<b class="on">☑</b>' : "□"}${text}</span>`;
  const body = /身体|通院/.test(r.service), life = /生活/.test(r.service), ride = /乗降/.test(r.service);
  const dur = duration(start, end);
  const changed = r.actualStart && r.planStart && (r.actualStart !== r.planStart || r.actualEnd !== r.planEnd);
  const tier = /Ⅲ|３|3/.test(r.service) && /総合/.test(r.service) ? "Ⅲ" : "";
  return `<article class="rec">
    <div class="rec-top">
      <div class="rec-title">サービス実施記録</div>
      <div class="rec-office"><span class="lbl">事業所名</span>${esc(r.office || office)}</div>
      <div class="rec-helper"><span class="lbl">ヘルパー<br>氏名</span><span class="fill">${esc(r.staff)}</span><span class="seal">㊞</span></div>
      <div class="rec-stamps"><div></div><div></div></div>
      <div class="rec-user"><div class="rec-user-head">利用者確認印</div><div class="rec-user-box"></div></div>
    </div>
    <div class="rec-name"><span class="lbl">お名前</span><span class="fill">${esc(r.userName)}</span>様</div>

    <table class="rec-head">
      <tr>
        <th>サービス実施日時</th>
        <td class="when">令和<b>${y - 2018}</b>年<b>${m}</b>月<b>${d}</b>日（<b>${wd}</b>）
          <b>${esc(sh)}</b>時<b>${esc(sm)}</b>分 〜 <b>${esc(eh)}</b>時<b>${esc(em)}</b>分</td>
        <th class="narrow">予定<br>変更</th>
        <td class="narrow">${circled(["有", "無"], changed ? "有" : "無")}</td>
      </tr>
    </table>
    <table class="rec-kind">
      <tr>
        <th rowspan="3" class="vert">サービスの種類</th>
        <td>${box(true, "介護サービス")}${box(body && !ride, "身体介護中心：")}身体（<b>${body && !ride ? dur : "　"}</b>分）生活（<b>${body && life ? "" : "　"}</b>分）</td>
        <th rowspan="2" class="narrow">保険外<br>サービス</th>
      </tr>
      <tr><td>${box(false, "共　生　型")}${box(life && !body, "生活援助")}（${circled(["45分未満", "45分以上"], life && !body ? dur >= 45 ? "45分以上" : "45分未満" : "")}）${box(ride, "通院等乗降介助")}</td></tr>
      <tr><td colspan="2">${box(false, "総合事業")}（A1・A2・A3・A4）${box(false, "Ⅰ（週1回程度）")}${box(false, "Ⅱ（週2回程度）")}${box(tier === "Ⅲ", "Ⅲ（週2回程度以上）")}</td></tr>
    </table>

    <div class="rec-main">
      <div class="rec-left">
        <div class="frow pre"><div class="flabel">事前チェック<br>記録など</div>
          <div class="fitems">
            <div>${box(has("顔色・発汗・体温等"), "顔色・発汗・体温等")}</div>
            <div>${box(has("環境整備"), "環境整備")}${box(has("相談援助・情報収集・記録"), "相談援助・情報収集・情報提供・記録など")}</div>
          </div>
        </div>
        <div class="section"><div class="vlabel">身<br>体<br>介<br>護</div><div class="sbody">${groupRows(BODY, r.items)}</div></div>
      </div>
      <div class="rec-right">
        <div class="section"><div class="vlabel">生<br>活<br>援<br>助</div><div class="sbody">${groupRows(LIFE, r.items)}</div></div>
        <div class="frow"><div class="flabel">内訳</div><div class="fitems"><div>（　　　　　　　　　　　　　　　　）</div></div></div>
        <div class="rec-memo"><span class="lbl">記　録：</span><span class="memo-text">${esc(r.comment)}</span></div>
      </div>
    </div>
    <div class="rec-exit"><span class="lbl">退 室 確 認</span>${["火元", "電気", "水道", "戸締り"].map((n) => box(has(n), n)).join("")}</div>
    <div class="rec-foot"><span>提供サービスの項目□にレ点を記入いたします。</span><span>※介護者には守秘義務があります。この日誌は適正に管理し、業務以外に使用することはありません。</span></div>
  </article>`;
}

// js/assign.js
function parseStaff(text) {
  const out = [];
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const m = /^\s*(.+?)[\s\t,]+(\d{4})年(\d{1,2})月(\d{1,2})日\s*[〜～~\-ー]\s*(現在|(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日)?\s*(.*)$/.exec(line);
    if (!m) continue;
    const from = `${m[2]}-${m[3].padStart(2, "0")}-${m[4].padStart(2, "0")}`;
    const to = m[7] ? `${m[6] ?? m[2]}-${m[7].padStart(2, "0")}-${m[8].padStart(2, "0")}` : "";
    const note = m[9].trim();
    const p = { name: m[1].trim(), from, to };
    if (note) p.note = note;
    if (/補充|応援/.test(note)) p.backup = true;
    out.push(p);
  }
  return out;
}
function minutes3(t) {
  const m = /(\d{1,2}):(\d{2})/.exec(String(t));
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}
function interval(start, end) {
  const s = minutes3(start);
  let e = minutes3(end);
  if (!(e > s)) e = s + 20;
  return [s, e];
}
var BANDS2 = [20, 30, 45, 60, 90];
function activeOn(staff, date) {
  return staff.filter((p) => p.from <= date && (!p.to || date <= p.to));
}
function assignStaff(visits, staff, { buffer = 10, minBuffer = buffer, shift = 0, trimEnd = 0, maxMinutes = 600, maxSpan = Infinity, fixed = {} } = {}) {
  const assign = {};
  const unassigned = [];
  const tight = {};
  const shifted = {};
  const trimmed = {};
  const load2 = Object.fromEntries(staff.map((p) => [p.name, { visits: 0, minutes: 0 }]));
  const regular = {};
  const familiar = {};
  const byDate = {};
  for (const v of visits) (byDate[v.date] ??= []).push(v);
  for (const date of Object.keys(byDate).sort()) {
    const people = activeOn(staff, date).map((p) => p.name);
    const busy = Object.fromEntries(people.map((n) => [n, []]));
    const today = Object.fromEntries(people.map((n) => [n, 0]));
    const list = byDate[date].map((v) => ({ ...v, range: interval(v.start, v.end) })).sort((a, b) => a.range[0] - b.range[0] || a.userId.localeCompare(b.userId));
    const len = (v) => v.range[1] - v.range[0];
    const clash = (n, v, gap = buffer) => busy[n].filter((b) => !(v.range[1] + gap <= b.s || b.e + gap <= v.range[0]));
    const spanOk = (n, v, except) => {
      const rest = busy[n].filter((b) => b.v !== except);
      if (!rest.length) return true;
      return Math.max(v.range[1], ...rest.map((b) => b.e)) - Math.min(v.range[0], ...rest.map((b) => b.s)) <= maxSpan;
    };
    const fits2 = (n, v, gap = buffer) => !clash(n, v, gap).length && today[n] + len(v) <= maxMinutes && spanOk(n, v);
    const put = (v, n) => {
      (busy[n] ??= []).push({ s: v.range[0], e: v.range[1], v });
      today[n] = (today[n] ?? 0) + len(v);
      assign[v.key] = n;
    };
    const remove = (v, n) => {
      busy[n] = busy[n].filter((b) => b.v !== v);
      today[n] -= len(v);
    };
    for (const v of list.filter((v2) => fixed[v2.key])) put(v, fixed[v.key]);
    const left = [];
    for (const v of list.filter((v2) => !fixed[v2.key])) {
      const free = people.filter((n) => fits2(n, v));
      if (!free.length) {
        left.push(v);
        continue;
      }
      const spanGrow = (n) => {
        if (!busy[n].length) return len(v) + 60;
        const s0 = Math.min(...busy[n].map((b) => b.s)), e0 = Math.max(...busy[n].map((b) => b.e));
        return Math.max(e0, v.range[1]) - Math.min(s0, v.range[0]) - (e0 - s0);
      };
      const score = (n) => (regular[v.slot] === n ? 40 : 0) + Math.min(familiar[v.userId]?.[n] ?? 0, 10) * 1.5 - (maxSpan < Infinity ? spanGrow(n) / 60 * 12 + today[n] / 60 * 1 : today[n] / 60 * 6) - (load2[n]?.minutes ?? 0) / 60 * 0.4;
      free.sort((a, b) => score(b) - score(a) || a.localeCompare(b));
      put(v, free[0]);
      regular[v.slot] = free[0];
    }
    const place = (v, gap) => {
      const direct = people.filter((n) => fits2(n, v, gap)).sort((a, b) => today[a] - today[b] || a.localeCompare(b))[0];
      if (direct) {
        put(v, direct);
        return true;
      }
      for (const n of people) {
        const blocking = clash(n, v, gap);
        if (blocking.length !== 1) continue;
        const c = blocking[0].v;
        if (fixed[c.key] || c.locked || c.range[0] >= v.range[0]) continue;
        const need = c.range[1] + gap - v.range[0];
        const dur = len(c);
        if (need < 1 || need + (trimmed[c.key] ?? 0) > trimEnd || today[n] + len(v) > maxMinutes || !spanOk(n, v)) continue;
        if (BANDS2.some((t) => dur >= t && dur - need < t)) continue;
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
      for (const n of people) {
        const blocking = clash(n, v, gap);
        if (blocking.length !== 1) continue;
        const c = blocking[0].v;
        if (fixed[c.key] || c.locked || c.range[0] >= v.range[0]) continue;
        const need = c.range[1] + gap - v.range[0];
        if (need < 1 || need + (shifted[c.key] ?? 0) > shift || today[n] + len(v) > maxMinutes || !spanOk(n, v)) continue;
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
        if (today[n] - len(c) + len(v) > maxMinutes || !spanOk(n, v, c)) continue;
        const other = people.find((m) => m !== n && fits2(m, c, gap));
        if (!other) continue;
        remove(c, n);
        put(c, other);
        put(v, n);
        return true;
      }
      return false;
    };
    const gaps = [.../* @__PURE__ */ new Set([buffer, ...Array.from({ length: Math.max(buffer - minBuffer, 0) }, (_, i) => buffer - i - 1)])];
    for (const v of left) {
      const earlier = Array.from({ length: (v.locked ? 0 : shift) + 1 }, (_, i) => i);
      const orig = v.range;
      let gap;
      const offset = earlier.find((o) => {
        v.range = [orig[0] - o, orig[1] - o];
        gap = gaps.find((g) => place(v, g));
        return gap !== void 0;
      });
      if (offset === void 0) {
        v.range = orig;
        unassigned.push(v.key);
        continue;
      }
      if (gap < buffer) tight[v.key] = gap;
      if (offset) shifted[v.key] = offset;
    }
    for (const v of list) {
      const n = assign[v.key];
      if (!n) continue;
      load2[n] ??= { visits: 0, minutes: 0 };
      load2[n].visits++;
      load2[n].minutes += len(v);
      (familiar[v.userId] ??= {})[n] = (familiar[v.userId]?.[n] ?? 0) + 1;
    }
  }
  return { assign, unassigned, tight, shifted, trimmed, load: load2 };
}
function assignBest(visits, staff, opts = {}) {
  const buffer = opts.buffer ?? 10;
  const floor = Math.min(buffer, opts.minBuffer ?? buffer);
  let best = null;
  for (const start of [...new Set([buffer, 5, 10, 15].filter((b) => b >= buffer))]) {
    const r = assignStaff(visits, staff, { ...opts, buffer: start, minBuffer: floor });
    r.tight = Object.fromEntries(Object.entries(r.tight).filter(([, g]) => g < buffer));
    if (!best || r.unassigned.length < best.unassigned.length) best = r;
  }
  return best;
}
function assignWithBackup(visits, staff, opts = {}) {
  const main = staff.filter((p) => !p.backup);
  const result = assignBest(visits, main, opts);
  for (const p of staff.filter((p2) => p2.backup)) {
    if (!result.unassigned.length) break;
    const left = new Set(result.unassigned);
    const r = assignStaff(visits.filter((v) => left.has(v.key)), [p], { ...opts, fixed: {} });
    Object.assign(result.assign, r.assign);
    Object.assign(result.tight, r.tight);
    Object.assign(result.shifted, r.shifted);
    Object.assign(result.trimmed, r.trimmed);
    if (r.load[p.name]?.visits) result.load[p.name] = r.load[p.name];
    result.unassigned = r.unassigned;
  }
  return result;
}

// js/app.js
var STORE_KEY = "teressajisseki:v1";
var PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
var JSZIP = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
var VISIT_CARE = /身体|生活|通院|乗降/;
var state = await load();
var rows = [];
var openKey = null;
var editSlot = null;
var $ = (sel) => document.querySelector(sel);
var monthInput = $("#month");
monthInput.value = state.month || (/* @__PURE__ */ new Date()).toISOString().slice(0, 7);
$("#office").value = state.office ?? "";
$("#staffText").value = state.staffText ?? "";
$("#buffer").value = state.buffer ?? 1;
$("#tolerance").value = state.tolerance ?? 4;
$("#maxHours").value = state.maxHours ?? 10;
$("#minBuffer").value = state.minBuffer ?? state.buffer ?? 1;
$("#shiftMax").value = state.shiftMax ?? 0;
$("#trimEnd").value = state.trimEnd ?? 1;
$("#maxSpan").value = state.maxSpan ?? "";
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(STORE_KEY, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("kv");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function load() {
  const empty = { careplan: [], shift: [], actual: [], profiles: {}, records: {} };
  try {
    const db = await openDb();
    const saved = await new Promise((resolve, reject) => {
      const req = db.transaction("kv").objectStore("kv").get("state");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (saved) return { ...empty, ...saved };
  } catch {
  }
  try {
    return { ...empty, ...JSON.parse(localStorage.getItem(STORE_KEY)) };
  } catch {
    return empty;
  }
}
navigator.storage?.persist?.().catch(() => {
});
async function saveNow() {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction("kv", "readwrite");
      tx.objectStore("kv").put(JSON.parse(JSON.stringify(state)), "state");
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    localStorage.removeItem(STORE_KEY);
  } catch {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch {
    }
  }
}
var saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 300);
}
$("#exportData").addEventListener("click", () => {
  const stamp = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  download(`実績管理データ_${stamp}.json`, JSON.stringify({ app: "teressajisseki", version: 1, state }), "application/json");
});
$("#importData").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== "teressajisseki" || !data.state) throw new Error("このアプリのデータではありません。");
    if (!confirm("今のデータを、このファイルの内容に置き換えます。よろしいですか？")) return;
    for (const k of Object.keys(state)) delete state[k];
    Object.assign(state, data.state);
    await saveNow();
    location.reload();
  } catch (err) {
    alert(`読み込めませんでした（${err.message}）`);
  }
});
for (const box of document.querySelectorAll(".drop")) {
  const kind = box.dataset.kind;
  const area = box.querySelector("textarea");
  const readFile = async (file) => {
    area.value = decodeFile(await file.arrayBuffer());
  };
  box.querySelector("input[type=file]").addEventListener("change", (e) => {
    if (e.target.files[0]) readFile(e.target.files[0]).then(() => apply(kind, area));
  });
  box.addEventListener("dragover", (e) => {
    e.preventDefault();
    box.classList.add("over");
  });
  box.addEventListener("dragleave", () => box.classList.remove("over"));
  box.addEventListener("drop", (e) => {
    e.preventDefault();
    box.classList.remove("over");
    if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]).then(() => apply(kind, area));
  });
  box.querySelector(".load").addEventListener("click", () => apply(kind, area));
  box.querySelector(".clear").addEventListener("click", () => {
    state[kind] = kind === "careplan" ? state.careplan.filter((p) => p.src === "teikyo") : [];
    area.value = "";
    save();
    render();
  });
}
function apply(kind, area) {
  const records = parseRecords(area.value, ALIASES[kind]);
  if (!records.length) {
    alert("読み込めるデータがありません。1行目に見出し行を入れてください。");
    return;
  }
  if (kind === "actual") state.actual.push(...records);
  else if (kind === "careplan") state.careplan = [...state.careplan.filter((p) => p.src === "teikyo"), ...records];
  else state[kind] = records;
  for (const p of kind === "careplan" ? records : []) profileOf(p.userId, p.userName);
  area.value = "";
  save();
  render();
}
var scripts = {};
function loadScript(src) {
  scripts[src] ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error("読み取り機能を読み込めませんでした。インターネット接続を確認してください。"));
    document.head.append(s);
  });
  return scripts[src];
}
async function pdfPages(buffer) {
  await loadScript(PDFJS + "pdf.min.js");
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + "pdf.worker.min.js";
  const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const h = page.getViewport({ scale: 1 }).height;
    const content = await page.getTextContent();
    pages.push(content.items.map((it) => ({ str: it.str, x: it.transform[4], y: h - it.transform[5], w: it.width })));
  }
  return pages;
}
function zipName(bytes) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("shift_jis").decode(bytes);
  }
}
async function expandFiles(files) {
  const out = [];
  for (const file of files) {
    if (/\.zip$/i.test(file.name)) {
      await loadScript(JSZIP);
      const zip = await window.JSZip.loadAsync(await file.arrayBuffer(), { decodeFileName: zipName });
      for (const entry of Object.values(zip.files)) {
        if (!entry.dir && /\.pdf$/i.test(entry.name)) {
          out.push({ name: entry.name.split("/").pop(), buffer: await entry.async("arraybuffer") });
        }
      }
    } else if (/\.pdf$/i.test(file.name)) {
      out.push({ name: file.name, buffer: await file.arrayBuffer() });
    }
  }
  return out;
}
async function importDocs(files) {
  const log = $("#docLog");
  const status = $("#docStatus");
  log.innerHTML = "";
  try {
    status.textContent = "読み込み中…";
    const pdfs = await expandFiles(files);
    const docs = [];
    for (const [i, f] of pdfs.entries()) {
      status.textContent = `読み取り中… ${i + 1}/${pdfs.length}`;
      try {
        docs.push({ name: f.name, doc: readDocument(await pdfPages(f.buffer)) });
      } catch (err) {
        logLine(f.name, `読み取れませんでした（${err.message}）`, true);
      }
    }
    const rank = (d) => d.jisseki.length ? 2 : d.teikyo.length ? d.teikyo.some((t) => t.kind === "利用票") ? 1 : 0 : 3;
    docs.sort((a, b) => rank(a.doc) - rank(b.doc));
    for (const { name, doc } of docs) logLine(name, applyDoc(doc));
    status.textContent = `${pdfs.length}件の PDF を読み取りました。`;
  } catch (err) {
    status.textContent = err.message;
  }
  save();
  render();
}
function logLine(file, message, error = false) {
  const li = document.createElement("li");
  li.className = error ? "error" : "";
  li.innerHTML = `<b>${esc2(file)}</b> ${esc2(message)}`;
  $("#docLog").append(li);
}
function applyDoc(doc) {
  const notes = [];
  const office = state.office?.trim();
  if (doc.teikyo.length) {
    const t = doc.teikyo[0];
    const kind = doc.teikyo.find((x) => x.kind)?.kind ?? "提供票";
    const userId = resolveUser(t.name, t.insuredNo);
    const p = state.profiles[userId];
    if (t.careLevel) p.careLevel = t.careLevel;
    const current = state.careplan.filter((e) => e.userId === userId && e.src === "teikyo" && e.date.startsWith(t.month));
    if (current.some((e) => e.kind === "実績票") || kind === "提供票" && current.some((e) => e.kind === "利用票")) {
      notes.push(`サービス${kind} ${t.month}：同じ月の${current.some((e) => e.kind === "実績票") ? "実績入りの提供票" : "利用票"}があるため、そちらの予定を使います`);
    } else {
      const seen = /* @__PURE__ */ new Set();
      const visits = doc.teikyo.flatMap((x) => x.visits).filter((v) => VISIT_CARE.test(v.service) && (!office || v.office.includes(office))).filter((v) => {
        const k = `${v.date}|${v.start}|${v.service}`;
        return !seen.has(k) && seen.add(k);
      });
      state.careplan = state.careplan.filter((e) => !current.includes(e));
      state.careplan.push(...visits.map((v) => ({
        userId,
        userName: p.name,
        date: v.date,
        start: v.start,
        end: v.end,
        service: v.service,
        code: "",
        office: v.office,
        src: "teikyo",
        kind
      })));
      notes.push(`サービス${kind} ${t.month}：訪問介護の予定 ${visits.length}件`);
    }
  }
  for (const j of doc.jisseki) {
    if (!j.name && !j.insuredNo) continue;
    const userId = resolveUser(j.name, j.insuredNo);
    const p = state.profiles[userId];
    if (j.careLevel) p.careLevel = j.careLevel;
    const visits = j.visits.filter((v) => VISIT_CARE.test(v.service) && (!office || v.office.includes(office)));
    state.careplan = state.careplan.filter((e) => !(e.userId === userId && e.src === "teikyo" && e.date.startsWith(j.month)));
    state.careplan.push(...visits.filter((v) => v.planned).map((v) => ({
      userId,
      userName: p.name,
      date: v.date,
      start: v.start,
      end: v.end,
      service: v.service,
      code: "",
      office: v.office,
      src: "teikyo",
      kind: "実績票"
    })));
    state.actual = state.actual.filter((a) => !(a.userId === userId && a.src === "jisseki" && String(a.date).startsWith(j.month)));
    state.actual.push(...visits.filter((v) => v.actual).map((v) => ({
      date: v.date,
      userId,
      start: v.start,
      end: v.end,
      service: v.service,
      staff: "",
      src: "jisseki"
    })));
    notes.push(`実績 ${j.month} ${p.name}：予定${visits.filter((v) => v.planned).length}件・実績${visits.filter((v) => v.actual).length}件`);
  }
  if (doc.homeCarePlan) {
    const userId = resolveUser(doc.homeCarePlan.name || doc.name);
    const p = state.profiles[userId];
    for (const v of doc.homeCarePlan.versions) {
      p.versions = [...p.versions.filter((x) => x.date !== v.date), v].sort((a, b) => a.date.localeCompare(b.date));
    }
    if (doc.homeCarePlan.careLevel) p.careLevel = doc.homeCarePlan.careLevel;
    notes.push(`訪問介護計画書：${doc.homeCarePlan.versions.map((v) => `${v.date}版 ${v.slots.length}枠`).join("、")}`);
  }
  if (doc.assessment && (doc.assessment.careLevel || doc.assessment.dementiaLevel)) {
    const a = doc.assessment;
    const p = state.profiles[resolveUser(a.name || doc.name)];
    if (a.careLevel) p.careLevel = a.careLevel;
    p.dementiaLevel = a.dementiaLevel;
    p.dementia = a.dementia;
    p.walker = a.walker;
    p.adl = a.adl;
    notes.push(`アセスメント：${a.careLevel || "介護度不明"}、認知症自立度 ${a.dementiaLevel || "不明"}${a.walker ? "、歩行器使用" : ""}`);
  }
  if (doc.carePlan2.length) {
    const p = state.profiles[resolveUser(doc.name)];
    const made = /作成年月日\s*令和\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/.exec(doc.text);
    const date = made ? `${2018 + Number(made[1])}-${made[2].padStart(2, "0")}-${made[3].padStart(2, "0")}` : "";
    p.carePlans = [...(p.carePlans ?? []).filter((c) => c.date !== date), { date, rows: doc.carePlan2 }].sort((a, b) => a.date.localeCompare(b.date));
    notes.push(`ケアプラン第2表 ${date}：訪問介護 ${doc.carePlan2.length}行（${doc.carePlan2.map((r) => r.freq).join("・")}）`);
  }
  return notes.length ? notes.join(" / ") : "読み取り対象外の書類です（そのままでも問題ありません）";
}
function resolveUser(name, insuredNo = "") {
  const norm = normalizeName(name);
  const byName = Object.keys(state.profiles).find((k) => normalizeName(state.profiles[k].name) === norm);
  const id = insuredNo || byName || `name:${norm}`;
  if (insuredNo && byName && byName !== id) {
    state.profiles[id] = { ...state.profiles[byName], ...state.profiles[id] };
    delete state.profiles[byName];
  }
  profileOf(id, name);
  return id;
}
$("#docFiles").addEventListener("change", (e) => {
  importDocs([...e.target.files]);
  e.target.value = "";
});
var docBox = $(".drop-docs");
docBox.addEventListener("dragover", (e) => {
  e.preventDefault();
  docBox.classList.add("over");
});
docBox.addEventListener("dragleave", () => docBox.classList.remove("over"));
docBox.addEventListener("drop", (e) => {
  e.preventDefault();
  docBox.classList.remove("over");
  importDocs([...e.dataTransfer.files]);
});
var profileUser = $("#profileUser");
function profileOf(userId, name = "") {
  const p = state.profiles[userId] ??= {};
  p.name ||= name || userId;
  p.careLevel ??= "";
  p.dementia ??= false;
  p.items ??= [];
  p.planRows ??= [];
  p.carePlans ??= [];
  p.versions ??= [];
  p.slotOverrides ??= {};
  return p;
}
$("#extract").addEventListener("click", () => {
  const userId = profileUser.value;
  if (!userId) {
    alert("先に利用者を選んでください。");
    return;
  }
  const text = $("#planText").value;
  const found = detectProfile(text);
  const p = profileOf(userId);
  p.careLevel = found.careLevel || p.careLevel;
  p.dementia = found.dementia || p.dementia;
  p.items = [.../* @__PURE__ */ new Set([...p.items, ...found.items])];
  const rows2 = detectPlanRows(text);
  if (rows2.length) {
    const m = /作成年月日\s*令和\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/.exec(text);
    const date = m ? `${2018 + Number(m[1])}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : "";
    p.carePlans = [...(p.carePlans ?? []).filter((c) => c.date !== date), { date, rows: rows2 }].sort((a, b) => a.date.localeCompare(b.date));
  }
  save();
  render();
});
profileUser.addEventListener("change", () => {
  editSlot = null;
  drawProfile();
});
$("#deleteUser").addEventListener("click", () => {
  const userId = profileUser.value;
  if (!userId || !confirm(`${profileOf(userId).name} さんの予定・書類の読み取り結果・記録をすべて削除します。`)) return;
  delete state.profiles[userId];
  state.careplan = state.careplan.filter((p) => p.userId !== userId);
  state.actual = state.actual.filter((a) => a.userId !== userId);
  for (const k of Object.keys(state.records)) if (k.split("|")[1] === userId) delete state.records[k];
  save();
  render();
});
function drawProfile() {
  const userId = profileUser.value;
  const box = $("#profileEdit");
  if (!userId) {
    box.innerHTML = '<p class="hint">書類を取り込むと利用者が表示されます。</p>';
    return;
  }
  const p = profileOf(userId);
  const slots = slotsOf(userId);
  box.innerHTML = `
    <div class="row wrap">
      <span>被保険者番号 ${esc2(userId.startsWith("name:") ? "（未取得）" : userId)}</span>
      <label>介護度 <select data-f="careLevel"><option value="">未設定</option>
        ${CARE_LEVELS.map((l) => `<option ${l === p.careLevel ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label><input type="checkbox" data-f="dementia" ${p.dementia ? "checked" : ""}> 認知症の記録文を入れる</label>
      ${p.dementiaLevel ? `<span class="hint">認知症自立度 ${esc2(p.dementiaLevel)}（アセスメントより）</span>` : ""}
      <label><input type="checkbox" data-f="walker" ${p.walker ? "checked" : ""}> 歩行器使用</label>
    </div>
    <p class="hint">訪問介護計画書：${p.versions.length ? p.versions.map((v) => `${v.date}版`).join("、") : "未取り込み"}
      ／ ケアプラン第2表：${p.carePlans.length ? p.carePlans.map((c) => `${c.date}版`).join("、") : "未取り込み"}（ケアプランの頻度を優先）</p>
    <table class="slots">
      <thead><tr><th>${esc2(monthInput.value)} の訪問枠</th><th>回数</th><th>レ点（${"自動"}）</th><th>根拠</th><th></th></tr></thead>
      <tbody>${slots.map((s) => `
        <tr>
          <td>${esc2(s.start)}〜${esc2(s.end)} ${esc2(s.service)}</td>
          <td>${s.count}回</td>
          <td class="items">${s.items.map((n) => `<span class="chip">レ ${esc2(n)}${s.tally[n] < s.count ? ` <small>${s.tally[n]}/${s.count}回</small>` : ""}</span>`).join("")}</td>
          <td class="hint">${esc2(s.source)}</td>
          <td><button class="secondary" data-slot="${esc2(s.key)}">${editSlot === s.key ? "閉じる" : "編集"}</button></td>
        </tr>
        ${editSlot === s.key ? `<tr class="detail"><td colspan="5">
          <p class="hint">この訪問枠のすべての日に使うレ点を選びます。</p>
          ${checkGrid(s.items, 'data-f="slotItem"')}
          <button class="secondary" data-f="slotReset">計画書どおりに戻す</button>
        </td></tr>` : ""}`).join("") || '<tr><td colspan="5" class="hint">この月の予定はありません。</td></tr>'}
      </tbody>
    </table>`;
  box.querySelector("[data-f=careLevel]").onchange = (e) => updateProfile(userId, { careLevel: e.target.value });
  box.querySelector("[data-f=dementia]").onchange = (e) => updateProfile(userId, { dementia: e.target.checked });
  box.querySelector("[data-f=walker]").onchange = (e) => updateProfile(userId, { walker: e.target.checked });
  box.querySelectorAll("[data-slot]").forEach((b) => {
    b.onclick = () => {
      editSlot = editSlot === b.dataset.slot ? null : b.dataset.slot;
      drawProfile();
    };
  });
  box.querySelectorAll("[data-f=slotItem]").forEach((cb) => {
    cb.onchange = () => {
      p.slotOverrides[editSlot] = [...box.querySelectorAll("[data-f=slotItem]:checked")].map((c) => c.value);
      clearSlotRecords(userId, editSlot);
      save();
      render();
    };
  });
  const reset = box.querySelector("[data-f=slotReset]");
  if (reset) reset.onclick = () => {
    delete p.slotOverrides[editSlot];
    clearSlotRecords(userId, editSlot);
    save();
    render();
  };
}
function clearSlotRecords(userId, key) {
  for (const r of rows.filter((r2) => r2.userId === userId && slotKey(r2.planStart || r2.actualStart, r2.service) === key)) {
    if (!state.records[r.key]?.confirmed) delete state.records[r.key];
  }
}
function slotsOf(userId) {
  const map = /* @__PURE__ */ new Map();
  for (const r of rows.filter((r2) => r2.userId === userId)) {
    const key = slotKey(r.planStart || r.actualStart, r.service);
    const s = map.get(key) ?? { key, start: r.planStart || r.actualStart, end: r.planEnd || r.actualEnd, service: r.service, count: 0, tally: {}, sources: /* @__PURE__ */ new Set() };
    s.count++;
    for (const n of r.autoItems) s.tally[n] = (s.tally[n] ?? 0) + 1;
    s.sources.add(r.source);
    map.set(key, s);
  }
  return [...map.values()].map((s) => ({
    ...s,
    items: ITEMS.map((it) => it.name).filter((n) => s.tally[n]),
    source: [...s.sources].join(" / ")
  })).sort((a, b) => a.start.localeCompare(b.start));
}
function updateProfile(userId, patch) {
  Object.assign(profileOf(userId), patch);
  for (const k of Object.keys(state.records)) {
    if (k.split("|")[1] === userId && !state.records[k].confirmed) delete state.records[k].comment;
  }
  save();
  render();
}
function checkGrid(checked, attr) {
  const groups = [...new Set(ITEMS.map((it) => it.group))];
  return `<div class="checks">${groups.map((g) => `<fieldset><legend>${g}</legend>${ITEMS.filter((it) => it.group === g).map((it) => `<label><input type="checkbox" ${attr} value="${it.name}" ${checked.includes(it.name) ? "checked" : ""}> ${it.name}</label>`).join("")}</fieldset>`).join("")}</div>`;
}
monthInput.addEventListener("change", () => {
  state.month = monthInput.value;
  editSlot = null;
  save();
  render();
});
$("#office").addEventListener("change", (e) => {
  state.office = e.target.value;
  save();
});
$("#tolerance").addEventListener("change", (e) => {
  state.tolerance = e.target.value;
  save();
  render();
});
$("#userFilter").addEventListener("change", draw);
$("#statusFilter").addEventListener("change", draw);
$("#staffFilter").addEventListener("change", draw);
$("#actualOnly").addEventListener("change", draw);
$("#noStaffOnly").addEventListener("change", draw);
$("#confirm").addEventListener("click", () => {
  const add = confirmPlanned(rows);
  if (!add.length) {
    alert("シフトで担当者が決まる未実績はありません。");
    return;
  }
  if (!confirm(`${add.length}件の未実績を予定どおり実績として確定します。`)) return;
  state.actual.push(...add);
  save();
  render();
});
$("#export").addEventListener("click", () => {
  const header = [
    "テレッサ",
    "日付",
    "利用者ID",
    "利用者名",
    "サービス内容",
    "サービスコード",
    "予定開始",
    "予定終了",
    "実績開始",
    "実績終了",
    "記録の開始",
    "記録の終了",
    "担当者",
    "状態",
    ...ITEMS.map((it) => it.name),
    "記録コメント",
    "記録確認",
    "レ点の根拠",
    "振り分けメモ"
  ];
  const body = visibleRows().map((r) => [
    r.teressa ? "○" : "",
    r.date,
    r.userId,
    r.userName,
    r.service,
    r.code,
    r.planStart,
    r.planEnd,
    r.actualStart,
    r.actualEnd,
    r.recStart || r.actualStart || r.planStart,
    r.recEnd || r.actualEnd || r.planEnd,
    r.staff,
    r.status,
    ...ITEMS.map((it) => r.items.includes(it.name) ? "レ" : ""),
    r.comment,
    r.confirmed ? "済" : "",
    r.source,
    r.staffNote ?? ""
  ]);
  download(`実績_${monthInput.value}.csv`, "\uFEFF" + toCSV([header, ...body]), "text/csv");
});
function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
$("#printRecords").addEventListener("click", () => {
  const list = visibleRows();
  if (!list.length) {
    alert("印刷する記録がありません。");
    return;
  }
  $("#printArea").innerHTML = list.map((r) => recordCard(r, { office: state.office })).join("");
  document.body.classList.add("printing");
  window.print();
});
window.addEventListener("afterprint", () => document.body.classList.remove("printing"));
function rowKey(r) {
  return `${r.date}|${r.userId}|${r.planStart || r.actualStart}|${r.service}`;
}
function withRecord(r, slotCounts, slotDays, weeks) {
  const key = rowKey(r);
  const start = r.planStart || r.actualStart;
  const saved = state.records[key] ?? {};
  const profile = profileOf(r.userId, r.userName);
  const sk = slotKey(start, r.service);
  const auto = resolveItems({
    profile,
    date: r.date,
    start,
    service: r.service,
    slotPerWeek: slotCounts[`${r.userId}|${sk}`] / weeks,
    slotWeekdays: [...slotDays[`${r.userId}|${sk}`]]
  });
  const items = saved.items ?? auto.items;
  const comment = saved.comment ?? generateComment({ profile, items, seed: key + (saved.regen ?? ""), start, date: r.date });
  return { ...r, userName: r.userName || profile.name, key, items, autoItems: auto.items, source: saved.items ? "手で修正" : auto.source, comment, confirmed: !!saved.confirmed };
}
function updateRecord(key, patch) {
  state.records[key] = { ...state.records[key], ...patch };
  save();
  render();
}
function render() {
  for (const box of document.querySelectorAll(".drop")) {
    const list = state[box.dataset.kind];
    box.querySelector(".count").textContent = `${box.dataset.kind === "careplan" ? list.filter((p) => p.src !== "teikyo").length : list.length}件`;
  }
  const base = reconcile({
    plans: state.careplan,
    shifts: state.shift,
    actuals: state.actual,
    month: monthInput.value,
    toleranceMin: Number($("#tolerance").value) || 0
  });
  const [y, m] = monthInput.value.split("-").map(Number);
  const weeks = new Date(y, m, 0).getDate() / 7;
  const slotCounts = {}, slotDays = {};
  for (const r of base) {
    const k = `${r.userId}|${slotKey(r.planStart || r.actualStart, r.service)}`;
    slotCounts[k] = (slotCounts[k] ?? 0) + 1;
    (slotDays[k] ??= /* @__PURE__ */ new Set()).add((/* @__PURE__ */ new Date(`${r.date}T00:00:00`)).getDay());
  }
  rows = base.map((r) => withRecord(r, slotCounts, slotDays, weeks));
  alignTimes(rows);
  assignHelpers(rows);
  const counts = summarize(rows);
  $("#summary").innerHTML = Object.entries(counts).map(([s, n]) => `<span class="badge ${cls(s)}">${s} ${n}</span>`).join("");
  const names = Object.fromEntries(Object.entries(state.profiles).map(([id, p]) => [id, p.name]));
  fillSelect($("#userFilter"), [...new Map(rows.map((r) => [r.userId, `${r.userName}`]))], true);
  fillSelect($("#statusFilter"), Object.values(STATUS).map((s) => [s, s]), true);
  fillSelect($("#staffFilter"), [...new Set(rows.map((r) => r.staff).filter(Boolean))].sort().map((n) => [n, n]), true);
  fillSelect(profileUser, Object.keys(state.profiles).map((id) => [id, names[id]]), false);
  drawProfile();
  drawStaff();
  draw();
}
function toMin(t) {
  const m = /(\d{1,2}):(\d{2})/.exec(String(t));
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}
function alignTimes(list) {
  for (const r of list) {
    r.timeNote = "";
    if (r.actualStart) continue;
    const a = alignToBand(r.service, r.planStart, r.planEnd);
    if (a.end !== r.planEnd) {
      r.recStart = r.planStart;
      r.recEnd = a.end;
    }
    r.timeNote = a.note;
  }
}
var staffLoad = null;
function assignHelpers(list) {
  const staff = parseStaff(state.staffText);
  staffLoad = null;
  if (!staff.length) {
    for (const r of list) r.staffNote = r.timeNote;
    return;
  }
  const fixed = {};
  const visits = [];
  const hasActual = list.some((r) => r.actualStart);
  for (const r of list) {
    if (!r.actualStart && hasActual) {
      r.staffNote = "実績なし";
      continue;
    }
    const manual = state.records[r.key]?.staff;
    if (manual) r.staff = manual;
    if (r.staff) fixed[r.key] = r.staff;
    visits.push({ key: r.key, locked: !!r.actualStart, date: r.date, start: r.recStart || r.actualStart || r.planStart, end: r.recEnd || r.actualEnd || r.planEnd, userId: r.userId, slot: `${r.userId}|${slotKey(r.planStart || r.actualStart, r.service)}` });
  }
  const result = assignWithBackup(visits, staff, {
    buffer: Number(state.buffer ?? 1),
    minBuffer: Number(state.minBuffer ?? state.buffer ?? 1),
    shift: Number(state.shiftMax ?? 0),
    trimEnd: Number(state.trimEnd ?? 1),
    maxSpan: Number(state.maxSpan ?? 0) * 60 || Infinity,
    maxMinutes: Number(state.maxHours ?? 10) * 60,
    fixed
  });
  for (const r of list) {
    if (!r.actualStart && hasActual) continue;
    if (!r.staff && result.assign[r.key]) {
      r.staff = result.assign[r.key];
      r.staffAuto = true;
    }
    const notes = r.timeNote ? [r.timeNote] : [];
    if (result.tight[r.key] !== void 0) notes.push(`前後の訪問との移動時間 ${result.tight[r.key]}分`);
    const o = result.shifted[r.key];
    if (o) {
      const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      r.recStart = fmt(toMin(r.recStart || r.actualStart || r.planStart) - o);
      r.recEnd = fmt(toMin(r.recEnd || r.actualEnd || r.planEnd) - o);
      notes.push(`予定より${o}分前倒しして割り当て`);
    }
    const t = result.trimmed[r.key];
    if (t) {
      const m = toMin(r.recEnd || r.actualEnd || r.planEnd) - t;
      r.recStart ??= r.actualStart || r.planStart;
      r.recEnd = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      notes.push(`次の訪問に間に合うよう終了を${t}分早めた`);
    }
    if (!r.staff) notes.push("空いているヘルパーなし");
    r.staffNote = notes.join("、");
  }
  staffLoad = { ...result, staff };
}
function drawStaff() {
  const box = $("#staffLoad");
  if (!staffLoad) {
    box.innerHTML = "";
    $("#staffStatus").textContent = "";
    return;
  }
  const { load: load2, unassigned, staff } = staffLoad;
  const tight = Object.keys(staffLoad.tight).length, shifted = Object.keys(staffLoad.shifted).length;
  const target = rows.filter((r) => r.staffNote !== "実績なし").length;
  $("#staffStatus").textContent = `${monthInput.value}：${target - unassigned.length}件を割り当て（うち移動時間を詰めたもの${tight}件${shifted ? `、前倒ししたもの${shifted}件` : ""}${Object.keys(staffLoad.trimmed).length ? `、終了を早めたもの${Object.keys(staffLoad.trimmed).length}件` : ""}）、${unassigned.length}件は空いているヘルパーがいないため空欄`;
  const [y, m] = monthInput.value.split("-").map(Number);
  const first = `${monthInput.value}-01`, last = `${monthInput.value}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
  const shown = staff.filter((p) => p.from <= last && (!p.to || p.to >= first));
  box.innerHTML = `<table class="slots"><thead><tr><th>ヘルパー</th><th>在籍</th><th>担当件数</th><th>時間</th></tr></thead><tbody>
    ${shown.map((p) => `<tr><td>${esc2(p.name)}</td><td class="hint">${p.from}〜${p.to || "現在"}</td>
      <td>${load2[p.name]?.visits ?? 0}件</td><td>${((load2[p.name]?.minutes ?? 0) / 60).toFixed(1)}時間</td></tr>`).join("")}
  </tbody></table>`;
}
$("#applyStaff").addEventListener("click", () => {
  state.staffText = $("#staffText").value;
  state.buffer = $("#buffer").value;
  state.maxHours = $("#maxHours").value;
  state.minBuffer = $("#minBuffer").value;
  state.shiftMax = $("#shiftMax").value;
  state.trimEnd = $("#trimEnd").value;
  state.maxSpan = $("#maxSpan").value;
  save();
  render();
});
function fillSelect(sel, entries, withAll) {
  const current = sel.value;
  sel.length = 0;
  if (withAll) sel.add(new Option("すべて", ""));
  for (const [value, label] of entries) sel.add(new Option(label, value));
  sel.value = entries.some(([v]) => v === current) ? current : sel.options[0]?.value ?? "";
}
function visibleRows() {
  const user = $("#userFilter").value, status = $("#statusFilter").value;
  const actualOnly = $("#actualOnly")?.checked, noStaffOnly = $("#noStaffOnly")?.checked;
  const staff = $("#staffFilter").value;
  return rows.filter((r) => (!user || r.userId === user) && (!status || r.status === status) && (!staff || r.staff === staff) && (!actualOnly || r.actualStart) && (!noStaffOnly || !r.staff));
}
function draw() {
  const list = visibleRows();
  $("#empty").hidden = rows.length > 0;
  $("#rows").innerHTML = list.map((r) => `
    <tr class="${cls(r.status)} clickable" data-key="${esc2(r.key)}">
      <td class="mark">${r.teressa ? "○" : ""}</td>
      <td>${esc2(r.date)}（${WEEKDAYS2[(/* @__PURE__ */ new Date(`${r.date}T00:00:00`)).getDay()]}）</td>
      <td>${esc2(r.userName)}</td>
      <td>${esc2(r.service)}</td>
      <td>${r.planStart ? `${esc2(r.planStart)}〜${esc2(r.planEnd)}` : "—"}</td>
      <td>${r.actualStart ? `${esc2(r.actualStart)}〜${esc2(r.actualEnd)}` : "—"}</td>
      <td>${esc2(r.staff) || "—"}</td>
      <td><span class="badge ${cls(r.status)}">${r.status}</span></td>
      <td class="items">${r.items.map((n) => `<span class="chip">レ ${esc2(n)}</span>`).join("")}</td>
      <td class="comment">${r.confirmed ? '<span class="badge ok">確認済</span>' : '<span class="badge warn">下書き</span>'} ${esc2(r.comment)}</td>
    </tr>
    ${r.key === openKey ? detailRow(r) : ""}`).join("");
}
function detailRow(r) {
  return `<tr class="detail"><td colspan="10">
    <p class="hint">レ点の根拠：${esc2(r.source)}</p>
    ${checkGrid(r.items, 'data-d="item"')}
    <textarea data-d="comment" rows="3">${esc2(r.comment)}</textarea>
    <div class="row">
      <button data-d="regen" class="secondary">コメント再生成</button>
      <button data-d="reset" class="secondary">レ点を計画書どおりに戻す</button>
      <label>担当ヘルパー <input data-d="staff" value="${esc2(r.staff)}" list="staffNames" size="14">${r.staffAuto ? '<span class="hint">（自動）</span>' : ""}</label>
      <datalist id="staffNames">${parseStaff(state.staffText).map((p) => `<option value="${esc2(p.name)}">`).join("")}</datalist>
      <label><input type="checkbox" data-d="confirmed" ${r.confirmed ? "checked" : ""}> 記録内容を確認した</label>
    </div>
  </td></tr>`;
}
$("#rows").addEventListener("click", (e) => {
  const d = e.target.dataset.d;
  if (d === "regen") {
    updateRecord(openKey, { comment: void 0, regen: Date.now(), confirmed: false });
    return;
  }
  if (d === "reset") {
    updateRecord(openKey, { items: void 0, comment: void 0, confirmed: false });
    return;
  }
  const tr = e.target.closest("tr.clickable");
  if (!tr) return;
  openKey = openKey === tr.dataset.key ? null : tr.dataset.key;
  draw();
});
$("#rows").addEventListener("change", (e) => {
  if (!openKey) return;
  const d = e.target.dataset.d;
  const detail = e.target.closest("tr.detail");
  if (d === "item") {
    const items = [...detail.querySelectorAll("[data-d=item]:checked")].map((c) => c.value);
    updateRecord(openKey, { items, comment: void 0, confirmed: false });
  } else if (d === "comment") {
    updateRecord(openKey, { comment: e.target.value });
  } else if (d === "staff") {
    updateRecord(openKey, { staff: e.target.value.trim() || void 0 });
  } else if (d === "confirmed") {
    updateRecord(openKey, { confirmed: e.target.checked });
  }
});
function cls(status) {
  return {
    [STATUS.OK]: "ok",
    [STATUS.TIME_DIFF]: "warn",
    [STATUS.NO_SHIFT]: "warn",
    [STATUS.PLANNED]: "plan",
    [STATUS.UNPLANNED]: "ng"
  }[status];
}
function esc2(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}
render();
})();
