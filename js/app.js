import { parseRecords, toCSV, decodeFile } from './csv.js';
import { ALIASES, STATUS, reconcile, confirmPlanned, summarize } from './logic.js';

const STORE_KEY = 'teressajisseki:v1';
const state = load();
let rows = [];

const $ = sel => document.querySelector(sel);
const monthInput = $('#month');
monthInput.value = state.month || new Date().toISOString().slice(0, 7);

function load() {
  try {
    return { careplan: [], shift: [], actual: [], ...JSON.parse(localStorage.getItem(STORE_KEY)) };
  } catch {
    return { careplan: [], shift: [], actual: [] };
  }
}

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* 保存できなくても表示は続ける */ }
}

for (const box of document.querySelectorAll('.drop')) {
  const kind = box.dataset.kind;
  const area = box.querySelector('textarea');
  const readFile = async file => { area.value = decodeFile(await file.arrayBuffer()); };

  box.querySelector('input[type=file]').addEventListener('change', e => {
    if (e.target.files[0]) readFile(e.target.files[0]).then(() => apply(kind, area));
  });
  box.addEventListener('dragover', e => { e.preventDefault(); box.classList.add('over'); });
  box.addEventListener('dragleave', () => box.classList.remove('over'));
  box.addEventListener('drop', e => {
    e.preventDefault();
    box.classList.remove('over');
    if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]).then(() => apply(kind, area));
  });
  box.querySelector('.load').addEventListener('click', () => apply(kind, area));
  box.querySelector('.clear').addEventListener('click', () => {
    state[kind] = [];
    area.value = '';
    save();
    render();
  });
}

function apply(kind, area) {
  const records = parseRecords(area.value, ALIASES[kind]);
  if (!records.length) {
    alert('読み込めるデータがありません。1行目に見出し行を入れてください。');
    return;
  }
  // 実績は追記、ケアプラン・シフトは置き換え
  state[kind] = kind === 'actual' ? [...state[kind], ...records] : records;
  area.value = '';
  save();
  render();
}

monthInput.addEventListener('change', () => { state.month = monthInput.value; save(); render(); });
$('#tolerance').addEventListener('change', render);
$('#userFilter').addEventListener('change', draw);
$('#statusFilter').addEventListener('change', draw);

$('#confirm').addEventListener('click', () => {
  const add = confirmPlanned(rows);
  if (!add.length) { alert('シフトで担当者が決まる未実績はありません。'); return; }
  if (!confirm(`${add.length}件の未実績を予定どおり実績として確定します。`)) return;
  state.actual.push(...add);
  save();
  render();
});

$('#export').addEventListener('click', () => {
  const header = ['テレッサ', '日付', '利用者ID', '利用者名', 'サービス内容', 'サービスコード',
    '予定開始', '予定終了', '実績開始', '実績終了', '担当者', '状態'];
  const body = visibleRows().map(r => [r.teressa ? '○' : '', r.date, r.userId, r.userName, r.service,
    r.code, r.planStart, r.planEnd, r.actualStart, r.actualEnd, r.staff, r.status]);
  const blob = new Blob(['﻿' + toCSV([header, ...body])], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `実績_${monthInput.value}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
});

$('#print').addEventListener('click', () => window.print());

function render() {
  for (const box of document.querySelectorAll('.drop')) {
    box.querySelector('.count').textContent = `${state[box.dataset.kind].length}件`;
  }
  rows = reconcile({
    plans: state.careplan,
    shifts: state.shift,
    actuals: state.actual,
    month: monthInput.value,
    toleranceMin: Number($('#tolerance').value) || 0,
  });

  const counts = summarize(rows);
  $('#summary').innerHTML = Object.entries(counts)
    .map(([s, n]) => `<span class="badge ${cls(s)}">${s} ${n}</span>`).join('');

  fillSelect($('#userFilter'), [...new Map(rows.map(r => [r.userId, `${r.userId} ${r.userName}`]))]);
  fillSelect($('#statusFilter'), Object.values(STATUS).map(s => [s, s]));
  draw();
}

function fillSelect(sel, entries) {
  const current = sel.value;
  sel.length = 1;
  for (const [value, label] of entries) sel.add(new Option(label, value));
  sel.value = entries.some(([v]) => v === current) ? current : '';
}

function visibleRows() {
  const user = $('#userFilter').value, status = $('#statusFilter').value;
  return rows.filter(r => (!user || r.userId === user) && (!status || r.status === status));
}

function draw() {
  const list = visibleRows();
  $('#empty').hidden = rows.length > 0;
  $('#rows').innerHTML = list.map(r => `
    <tr class="${cls(r.status)}">
      <td class="mark">${r.teressa ? '○' : ''}</td>
      <td>${esc(r.date)}</td>
      <td>${esc(r.userId)} ${esc(r.userName)}</td>
      <td>${esc(r.service)}</td>
      <td>${esc(r.code)}</td>
      <td>${r.planStart ? `${esc(r.planStart)}〜${esc(r.planEnd)}` : '—'}</td>
      <td>${r.actualStart ? `${esc(r.actualStart)}〜${esc(r.actualEnd)}` : '—'}</td>
      <td>${esc(r.staff) || '—'}</td>
      <td><span class="badge ${cls(r.status)}">${r.status}</span></td>
    </tr>`).join('');
}

function cls(status) {
  return { [STATUS.OK]: 'ok', [STATUS.TIME_DIFF]: 'warn', [STATUS.NO_SHIFT]: 'warn',
    [STATUS.PLANNED]: 'plan', [STATUS.UNPLANNED]: 'ng' }[status];
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

render();
