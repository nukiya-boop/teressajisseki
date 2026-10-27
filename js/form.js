// 紙の「サービス実施記録」と同じ並びで印刷するための様式。
// 各欄は [表示文字, レ点項目名（null は手書き欄）] の並び。

const BODY = [
  ['排泄介助', [
    [['トイレ介助', 'トイレ介助'], ['Pトイレ介助', 'Pトイレ介助'], ['尿器介助', '尿器介助']],
    [['パッド交換', 'パッド交換'], ['おむつ交換', 'おむつ交換'], ['排便（　回）', null], ['排尿（　回）', null]],
  ]],
  ['食事介助', [
    [['全介助', '食事全介助'], ['一部介助', '食事一部介助'], ['水分補給（　　cc）', '水分補給']],
    [['特段の調理', '特段の調理'], ['食事量　完食・残量（　／　）', null]],
  ]],
  ['身なりの', [
    [['清拭（全身・部分）', '清拭'], ['洗髪', '洗髪'], ['爪切り（手・足）', '爪切り']],
  ]],
  ['保清・整容', [
    [['全身浴（入浴・シャワー浴）', '全身浴'], ['部分浴（手・足・陰部・臀部）', '部分浴']],
    [['洗面', '洗面'], ['口腔ケア', '口腔ケア'], ['整容', '整容'], ['更衣介助', '更衣介助']],
  ]],
  ['移　　動', [
    [['体位変換', '体位変換'], ['移乗介助', '移乗介助'], ['移動介助', '移動介助'], ['通院・外出介助', '通院・外出介助']],
  ]],
  ['起床就寝', [
    [['起床介助', '起床介助'], ['就寝介助', '就寝介助']],
  ]],
  ['服　　薬', [
    [['服薬介助・確認', '服薬介助・確認'], ['薬の塗布', '薬の塗布'], ['点眼', '点眼'], ['その他（　　）', null]],
  ]],
  ['自立支援', [
    [['共に行う（掃除・洗濯・衣類整理・調理・買い物）', '共に行う家事']],
    [['認知症高齢者の記憶への働きかけ', '認知症の記憶への働きかけ']],
    [['転倒予防の声かけ・見守り（入浴・更衣・移動）', '転倒予防の声かけ・見守り']],
    [['その他（　　　　）', null]],
  ]],
];

const LIFE = [
  ['掃　　除', [
    [['居室・寝室・台所・トイレ・浴室', '掃除']],
    [['ゴミ出し', 'ゴミ出し'], ['準備・後片付け', null]],
  ]],
  ['洗　　濯', [
    [['洗濯（乾燥・干し）', '洗濯'], ['取り入れ収納', '取り入れ・収納'], ['アイロン', 'アイロン']],
  ]],
  ['寝具の手入れ', [
    [['シーツ交換', 'シーツ交換'], ['ベッドメイク', 'ベッドメイク'], ['布団干し', '布団干し']],
  ]],
  ['衣　　類', [
    [['衣類の整理', '衣類の整理'], ['被服の補修', '被服の補修']],
  ]],
  ['調理配下膳', [
    [['一般的な調理', '一般的な調理'], ['配・下膳', '配・下膳'], ['後片付け', '後片付け']],
    [['献立', 'menu']],
  ]],
  ['買 物 等', [
    [['日常品等の買物', '日常品等の買物'], ['薬の受取り', '薬の受取り']],
    [['預り金　　　円　買物　　　円　おつり　　　円', 'money']],
  ]],
];

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function minutes(t) {
  const m = /(\d{1,2}):(\d{2})/.exec(String(t));
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

// 終了が開始以前（記入誤りなど）のときは空欄にする
function duration(start, end) {
  const d = minutes(end) - minutes(start);
  return Number.isFinite(d) && d > 0 ? d : '';
}

// 選んだものに丸をつける（「有・無」「45分未満・45分以上」など）
function circled(options, chosen) {
  return options.map(o => o === chosen ? `<span class="maru">${o}</span>` : o).join('・');
}

function groupRows(groups, items) {
  const cell = ([text, name]) => {
    if (name === 'menu') return '<span class="cb">献立</span><span class="fill wide"></span>';
    if (name === 'money') return `<span class="small">${esc(text)}</span>`;
    return `<span class="cb">${items.includes(name) ? '<b class="on">☑</b>' : '□'}${esc(text)}</span>`;
  };
  return groups.map(([label, lines]) => `
    <div class="frow"><div class="flabel">${label}</div>
      <div class="fitems">${lines.map(l => `<div>${l.map(cell).join('')}</div>`).join('')}</div>
    </div>`).join('');
}

export function recordCard(r, { office = '' } = {}) {
  const [y, m, d] = r.date.split('-').map(Number);
  const wd = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  const start = r.recStart || r.actualStart || r.planStart, end = r.recEnd || r.actualEnd || r.planEnd;
  const [sh, sm] = String(start).split(':'), [eh, em] = String(end).split(':');
  const has = n => r.items.includes(n);
  const box = (on, text) => `<span class="cb">${on ? '<b class="on">☑</b>' : '□'}${text}</span>`;

  const body = /身体|通院/.test(r.service), life = /生活/.test(r.service), ride = /乗降/.test(r.service);
  const dur = duration(start, end);
  const changed = r.actualStart && r.planStart && (r.actualStart !== r.planStart || r.actualEnd !== r.planEnd);
  const tier = /Ⅲ|３|3/.test(r.service) && /総合/.test(r.service) ? 'Ⅲ' : '';

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
        <td class="narrow">${circled(['有', '無'], changed ? '有' : '無')}</td>
      </tr>
    </table>
    <table class="rec-kind">
      <tr>
        <th rowspan="3" class="vert">サービスの種類</th>
        <td>${box(true, '介護サービス')}${box(body && !ride, '身体介護中心：')}身体（<b>${body && !ride ? dur : '　'}</b>分）生活（<b>${body && life ? '' : '　'}</b>分）</td>
        <th rowspan="2" class="narrow">保険外<br>サービス</th>
      </tr>
      <tr><td>${box(false, '共　生　型')}${box(life && !body, '生活援助')}（${circled(['45分未満', '45分以上'], life && !body ? (dur >= 45 ? '45分以上' : '45分未満') : '')}）${box(ride, '通院等乗降介助')}</td></tr>
      <tr><td colspan="2">${box(false, '総合事業')}（A1・A2・A3・A4）${box(false, 'Ⅰ（週1回程度）')}${box(false, 'Ⅱ（週2回程度）')}${box(tier === 'Ⅲ', 'Ⅲ（週2回程度以上）')}</td></tr>
    </table>

    <div class="rec-main">
      <div class="rec-left">
        <div class="frow pre"><div class="flabel">事前チェック<br>記録など</div>
          <div class="fitems">
            <div>${box(has('顔色・発汗・体温等'), '顔色・発汗・体温等')}</div>
            <div>${box(has('環境整備'), '環境整備')}${box(has('相談援助・情報収集・記録'), '相談援助・情報収集・情報提供・記録など')}</div>
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
    <div class="rec-exit"><span class="lbl">退 室 確 認</span>${['火元', '電気', '水道', '戸締り'].map(n => box(has(n), n)).join('')}</div>
    <div class="rec-foot"><span>提供サービスの項目□にレ点を記入いたします。</span><span>※介護者には守秘義務があります。この日誌は適正に管理し、業務以外に使用することはありません。</span></div>
  </article>`;
}
