// 毎月の書類（出勤簿・従業者の勤務体制及びサービス提供時間一覧表）を、その月の記録から作る。

const WD = ['日', '月', '火', '水', '木', '金', '土'];

function toMin(t) {
  const m = /(\d{1,2}):(\d{2})/.exec(String(t ?? ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}
export const hm = m => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function monthDays(ym) {
  const [y, m] = ym.split('-').map(Number);
  const n = new Date(y, m, 0).getDate();
  return Array.from({ length: n }, (_, i) => {
    const date = `${ym}-${String(i + 1).padStart(2, '0')}`;
    return { day: i + 1, date, wd: WD[new Date(y, m - 1, i + 1).getDay()] };
  });
}

// 備考欄の「管理者」「サ責」「常勤」「非常勤」「兼務」から、一覧表の職種・勤務形態・兼務を決める
export function staffRole(p) {
  const note = p.note ?? '';
  const mgr = /管理者/.test(note), sv = /サ責|サービス提供責任者/.test(note);
  const job = mgr && sv ? '管理者兼サ責' : mgr ? '管理者' : sv ? 'サービス提供責任者' : 'ヘルパー';
  const form = /非常勤/.test(note) ? '非常勤' : /常勤/.test(note) ? '常勤' : '';
  return { job, form, kenmu: /兼務/.test(note) ? '○' : '' };
}

// 記録の行から、ヘルパーごと・日ごとの訪問 [開始(分), 終了(分)] を集める
export function helperVisits(rows) {
  const out = {};
  for (const r of rows) {
    if (!r.staff) continue;
    const s = toMin(r.recStart || r.actualStart || r.planStart);
    let e = toMin(r.recEnd || r.actualEnd || r.planEnd);
    if (!(s >= 0)) continue;
    if (!(e > s)) e = s + 20;
    ((out[r.staff] ??= {})[r.date] ??= []).push([s, e]);
  }
  return out;
}

const inMonth = (p, ym, days) => p.from <= days[days.length - 1].date && (!p.to || p.to >= `${ym}-01`);

// 出勤簿：1人1ページ。始業＝最初の訪問の開始、終業＝最後の訪問の終了、実働＝訪問時間の合計、休憩＝その差
export function kinmuboHtml({ ym, staff, visits, company = '', office = '' }) {
  const days = monthDays(ym);
  const [y, m] = ym.split('-').map(Number);
  return staff.filter(p => inMonth(p, ym, days)).map(p => {
    let workDays = 0, total = 0;
    const body = days.map(({ day, date, wd }) => {
      const v = visits[p.name]?.[date] ?? [];
      let cells;
      if (date < p.from || (p.to && date > p.to)) {
        cells = ['', '', '', '', '', '', '', '', '', date < p.from ? '入職前' : '退職後'];
      } else if (!v.length) {
        cells = ['法定休日', '0:00', '0:00', '0:00', '0:00', '0', '0', '0', '無', ''];
      } else {
        const st = Math.min(...v.map(x => x[0])), en = Math.max(...v.map(x => x[1]));
        const w = v.reduce((a, x) => a + x[1] - x[0], 0);
        workDays++; total += w;
        cells = ['出勤', hm(st), hm(en), hm(Math.max(0, en - st - w)), hm(w), '0', '0', '0', '無', ''];
      }
      return `<tr class="${day > 1 && wd === '月' ? 'wk' : ''}"><td>${day}日</td><td>(${wd})</td>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
    }).join('');
    return `<section class="kb">
  <h1>${esc(company)} 出勤簿</h1>
  <div class="kb-head"><div class="kb-ym">${y}年${m}月</div><div class="kb-who"><div>所属：${esc(office)}</div><div>氏名：${esc(p.name)}</div></div></div>
  <table class="kb-main">
    <colgroup><col style="width:7%"><col style="width:6%"><col style="width:10%"><col style="width:7%"><col style="width:7%"><col style="width:7%"><col style="width:7%"><col style="width:10%"><col style="width:10%"><col style="width:10%"><col style="width:9%"><col style="width:10%"></colgroup>
    <tr><th rowspan="2">日付</th><th rowspan="2">曜日</th><th rowspan="2">区分</th><th rowspan="2">始業<br>時間</th><th rowspan="2">終業<br>時間</th><th rowspan="2">休憩<br>時間</th><th rowspan="2">実働<br>時間</th><th colspan="3">残業時間</th><th rowspan="2">遅刻・早退</th><th rowspan="2">備考</th></tr>
    <tr><th>時間外残業</th><th>深夜残業</th><th>早朝残業</th></tr>
    ${body}
  </table>
  <div class="kb-foot">
    <table><tr><td>勤務日数</td><td class="r">${workDays}日</td></tr><tr><td>早退・遅刻回数</td><td class="r">0回</td></tr><tr><td>欠勤日数</td><td class="r">0回</td></tr><tr class="sum1"><td>合計勤務時間</td><td class="r">${hm(total)}</td></tr></table>
    <table><tr><td>時間外残業時間</td><td class="r">0:00</td></tr><tr><td>深夜残業時間</td><td class="r">0:00</td></tr><tr><td>早朝残業時間</td><td class="r">0:00</td></tr><tr class="sum2"><td>合計残業時間</td><td class="r">0:00</td></tr></table>
    <table class="sign"><tr><td style="text-align:center">本人署名欄</td></tr><tr><td class="box"></td></tr></table>
  </div>
</section>`;
  }).join('');
}

// 一覧表の並び（管理者・サ責を先に）と、日ごとのサービス提供時間（0.1時間単位）
export function ichiranRows({ ym, staff, visits }) {
  const days = monthDays(ym);
  const rank = j => (j === 'ヘルパー' ? 1 : 0);
  return staff.filter(p => inMonth(p, ym, days))
    .map((p, i) => ({ p, i, ...staffRole(p) }))
    .sort((a, b) => rank(a.job) - rank(b.job) || a.i - b.i)
    .map(({ p, job, form, kenmu }) => {
      const hours = days.map(({ date }) => {
        const v = visits[p.name]?.[date] ?? [];
        const min = v.reduce((a, x) => a + x[1] - x[0], 0);
        return min ? Math.round(min / 6) / 10 : null;
      });
      return { name: p.name, job, form, kenmu, hours, total: Math.round(hours.reduce((a, h) => a + (h ?? 0), 0) * 10) / 10 };
    });
}

export function ichiranHtml({ ym, staff, visits, office = '', service = '訪問介護：介護予防型訪問サービス、生活援助型訪問サービス' }) {
  const days = monthDays(ym);
  const list = ichiranRows({ ym, staff, visits });
  const m = Number(ym.slice(5));
  const pad = Array.from({ length: Math.max(0, 20 - list.length) }, () => ({ name: '', job: '', form: '', kenmu: '', hours: days.map(() => null), total: null }));
  const f = h => (h == null ? '' : h.toFixed(1));
  const dayTotals = days.map((_, i) => list.reduce((a, r) => a + (r.hours[i] ?? 0), 0));
  const all = dayTotals.reduce((a, b) => a + b, 0);
  const fill = n => Array.from({ length: 31 - n }, () => '<td></td>').join('');
  return `<section class="kt">
  <h1>従 業 者 の 勤 務 体 制 及 び サ ー ビ ス 提 供 時 間 一 覧 表 <span>（ ${m}月分 ）</span></h1>
  <table class="kt-head"><tr><th>事業所の名称</th><td>${esc(office)}</td><th>サービスの種類</th><td>${esc(service)}</td></tr></table>
  <table class="kt-main">
    <tr><th rowspan="2" class="job">職種</th><th rowspan="2" class="form">勤務<br>形態</th><th rowspan="2" class="ken">兼務の<br>状況</th><th rowspan="2" class="name">氏　名</th><th>日</th>${days.map(d => `<th>${d.day}</th>`).join('')}${fill(days.length).replace(/td/g, 'th')}<th rowspan="2" class="sum">合計</th></tr>
    <tr><th>曜</th>${days.map(d => `<th>${d.wd}</th>`).join('')}${fill(days.length).replace(/td/g, 'th')}</tr>
    ${[...list, ...pad].map((r, i) => `<tr><td>${esc(r.job)}</td><td>${esc(r.form)}</td><td>${r.kenmu}</td><td class="name">${esc(r.name)}</td>${i === 0 ? `<td rowspan="${list.length + pad.length}" class="vnote">↑ サービス提供時間（事業所における待機時間や移動時間を除く）を記載してください。</td>` : ''}${r.hours.map(h => `<td>${f(h)}</td>`).join('')}${fill(days.length)}<td class="sum">${f(r.total)}</td></tr>`).join('')}
    <tr class="tot"><td colspan="5">合計</td>${dayTotals.map(t => `<td>${t ? t.toFixed(1) : ''}</td>`).join('')}${fill(days.length)}<td class="sum">${all.toFixed(1)}</td></tr>
  </table>
  <p class="kt-note">※「職種」「勤務形態」「兼務の状況」は、③ヘルパーの各行の後ろに「管理者」「サ責」「常勤」「非常勤」「兼務」と書くと入ります。</p>
</section>`;
}

// Excel で開ける CSV（一覧表）
export function ichiranCsv({ ym, staff, visits }) {
  const days = monthDays(ym);
  const list = ichiranRows({ ym, staff, visits });
  return [
    ['職種', '勤務形態', '兼務の状況', '氏名', ...days.map(d => `${d.day}(${d.wd})`), '合計'],
    ...list.map(r => [r.job, r.form, r.kenmu, r.name, ...r.hours.map(h => (h == null ? '' : h.toFixed(1))), r.total.toFixed(1)]),
  ];
}
