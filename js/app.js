import { parseRecords, toCSV, decodeFile } from './csv.js';
import { ALIASES, STATUS, reconcile, confirmPlanned, summarize, alignToBand } from './logic.js';
import { ITEMS, CARE_LEVELS, WEEKDAYS, detectProfile, detectPlanRows, resolveItems, generateComment, slotKey } from './record.js';
import { readDocument, normalizeName } from './pdfimport.js';
import { recordCard } from './form.js';
import { parseStaff, assignWithBackup } from './assign.js';

const STORE_KEY = 'teressajisseki:v1';
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
const JSZIP = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
const VISIT_CARE = /身体|生活|通院|乗降/;

const state = await load();
let rows = [];
let openKey = null;
let editSlot = null;

const $ = sel => document.querySelector(sel);
const monthInput = $('#month');
monthInput.value = state.month || new Date().toISOString().slice(0, 7);
$('#office').value = state.office ?? '';
$('#staffText').value = state.staffText ?? '';
$('#buffer').value = state.buffer ?? 1;
$('#tolerance').value = state.tolerance ?? 4;
$('#maxHours').value = state.maxHours ?? 10;
$('#minBuffer').value = state.minBuffer ?? state.buffer ?? 1;
$('#shiftMax').value = state.shiftMax ?? 0;
$('#trimEnd').value = state.trimEnd ?? 1;
$('#maxSpan').value = state.maxSpan ?? '';

// 利用者が多いと localStorage（約5MB）に収まらないため、IndexedDB に保存する
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(STORE_KEY, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function load() {
  const empty = { careplan: [], shift: [], actual: [], profiles: {}, records: {} };
  try {
    const db = await openDb();
    const saved = await new Promise((resolve, reject) => {
      const req = db.transaction('kv').objectStore('kv').get('state');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (saved) return { ...empty, ...saved };
  } catch { /* IndexedDB が使えなければ localStorage を見る */ }
  try {
    return { ...empty, ...JSON.parse(localStorage.getItem(STORE_KEY)) };
  } catch {
    return empty;
  }
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const db = await openDb();
      db.transaction('kv', 'readwrite').objectStore('kv').put(JSON.parse(JSON.stringify(state)), 'state');
      localStorage.removeItem(STORE_KEY);
    } catch {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* 保存できなくても表示は続ける */ }
    }
  }, 300);
}

// ---- CSV 取り込み ----

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
    state[kind] = kind === 'careplan' ? state.careplan.filter(p => p.src === 'teikyo') : [];
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
  // 実績は追記、ケアプラン・シフトは置き換え（提供票から読んだ予定は残す）
  if (kind === 'actual') state.actual.push(...records);
  else if (kind === 'careplan') state.careplan = [...state.careplan.filter(p => p.src === 'teikyo'), ...records];
  else state[kind] = records;
  for (const p of kind === 'careplan' ? records : []) profileOf(p.userId, p.userName);
  area.value = '';
  save();
  render();
}

// ---- PDF・ZIP 書類の取り込み ----

const scripts = {};
function loadScript(src) {
  scripts[src] ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('読み取り機能を読み込めませんでした。インターネット接続を確認してください。'));
    document.head.append(s);
  });
  return scripts[src];
}

async function pdfPages(buffer) {
  await loadScript(PDFJS + 'pdf.min.js');
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
  const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const h = page.getViewport({ scale: 1 }).height;
    const content = await page.getTextContent();
    pages.push(content.items.map(it => ({ str: it.str, x: it.transform[4], y: h - it.transform[5], w: it.width })));
  }
  return pages;
}

// Windows で作った ZIP はファイル名が Shift_JIS のことがある
function zipName(bytes) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return new TextDecoder('shift_jis').decode(bytes); }
}

async function expandFiles(files) {
  const out = [];
  for (const file of files) {
    if (/\.zip$/i.test(file.name)) {
      await loadScript(JSZIP);
      const zip = await window.JSZip.loadAsync(await file.arrayBuffer(), { decodeFileName: zipName });
      for (const entry of Object.values(zip.files)) {
        if (!entry.dir && /\.pdf$/i.test(entry.name)) {
          out.push({ name: entry.name.split('/').pop(), buffer: await entry.async('arraybuffer') });
        }
      }
    } else if (/\.pdf$/i.test(file.name)) {
      out.push({ name: file.name, buffer: await file.arrayBuffer() });
    }
  }
  return out;
}

async function importDocs(files) {
  const log = $('#docLog');
  const status = $('#docStatus');
  log.innerHTML = '';
  try {
    status.textContent = '読み込み中…';
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
    // 被保険者番号のわかる提供票を先に入れ、ほかの書類は名前で同じ利用者に結びつける
    // 利用票は提供票より後に入れて、同じ月なら利用票を残す
    const rank = d => d.jisseki.length ? 2 : d.teikyo.length ? (d.teikyo.some(t => t.kind === '利用票') ? 1 : 0) : 3;
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
  const li = document.createElement('li');
  li.className = error ? 'error' : '';
  li.innerHTML = `<b>${esc(file)}</b> ${esc(message)}`;
  $('#docLog').append(li);
}

function applyDoc(doc) {
  const notes = [];
  const office = state.office?.trim();
  if (doc.teikyo.length) {
    const t = doc.teikyo[0];
    const kind = doc.teikyo.find(x => x.kind)?.kind ?? '提供票';
    const userId = resolveUser(t.name, t.insuredNo);
    const p = state.profiles[userId];
    if (t.careLevel) p.careLevel = t.careLevel;
    const current = state.careplan.filter(e => e.userId === userId && e.src === 'teikyo' && e.date.startsWith(t.month));
    // 実績入りの提供票の予定がいちばん新しい。次に利用票、提供票の順に使う
    if (current.some(e => e.kind === '実績票') || (kind === '提供票' && current.some(e => e.kind === '利用票'))) {
      notes.push(`サービス${kind} ${t.month}：同じ月の${current.some(e => e.kind === '実績票') ? '実績入りの提供票' : '利用票'}があるため、そちらの予定を使います`);
    } else {
      const seen = new Set();
      const visits = doc.teikyo.flatMap(x => x.visits)
        .filter(v => VISIT_CARE.test(v.service) && (!office || v.office.includes(office)))
        .filter(v => { const k = `${v.date}|${v.start}|${v.service}`; return !seen.has(k) && seen.add(k); });
      state.careplan = state.careplan.filter(e => !current.includes(e));
      state.careplan.push(...visits.map(v => ({
        userId, userName: p.name, date: v.date, start: v.start, end: v.end, service: v.service, code: '', office: v.office, src: 'teikyo', kind,
      })));
      notes.push(`サービス${kind} ${t.month}：訪問介護の予定 ${visits.length}件`);
    }
  }
  // 実績入りの提供票：実績は実績として、予定は予定として入れる（1つの PDF に複数の利用者）
  for (const j of doc.jisseki) {
    if (!j.name && !j.insuredNo) continue;
    const userId = resolveUser(j.name, j.insuredNo);
    const p = state.profiles[userId];
    if (j.careLevel) p.careLevel = j.careLevel;
    const visits = j.visits.filter(v => VISIT_CARE.test(v.service) && (!office || v.office.includes(office)));
    state.careplan = state.careplan.filter(e => !(e.userId === userId && e.src === 'teikyo' && e.date.startsWith(j.month)));
    state.careplan.push(...visits.filter(v => v.planned).map(v => ({
      userId, userName: p.name, date: v.date, start: v.start, end: v.end, service: v.service, code: '', office: v.office, src: 'teikyo', kind: '実績票',
    })));
    state.actual = state.actual.filter(a => !(a.userId === userId && a.src === 'jisseki' && String(a.date).startsWith(j.month)));
    state.actual.push(...visits.filter(v => v.actual).map(v => ({
      date: v.date, userId, start: v.start, end: v.end, service: v.service, staff: '', src: 'jisseki',
    })));
    notes.push(`実績 ${j.month} ${p.name}：予定${visits.filter(v => v.planned).length}件・実績${visits.filter(v => v.actual).length}件`);
  }
  if (doc.homeCarePlan) {
    const userId = resolveUser(doc.homeCarePlan.name || doc.name);
    const p = state.profiles[userId];
    for (const v of doc.homeCarePlan.versions) {
      p.versions = [...p.versions.filter(x => x.date !== v.date), v].sort((a, b) => a.date.localeCompare(b.date));
    }
    if (doc.homeCarePlan.careLevel) p.careLevel = doc.homeCarePlan.careLevel;
    notes.push(`訪問介護計画書：${doc.homeCarePlan.versions.map(v => `${v.date}版 ${v.slots.length}枠`).join('、')}`);
  }
  if (doc.assessment && (doc.assessment.careLevel || doc.assessment.dementiaLevel)) {
    const a = doc.assessment;
    const p = state.profiles[resolveUser(a.name || doc.name)];
    if (a.careLevel) p.careLevel = a.careLevel;
    p.dementiaLevel = a.dementiaLevel;
    p.dementia = a.dementia;
    p.walker = a.walker;
    p.adl = a.adl;
    notes.push(`アセスメント：${a.careLevel || '介護度不明'}、認知症自立度 ${a.dementiaLevel || '不明'}${a.walker ? '、歩行器使用' : ''}`);
  }
  if (doc.carePlan2.length) {
    const p = state.profiles[resolveUser(doc.name)];
    const made = /作成年月日\s*令和\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/.exec(doc.text);
    const date = made ? `${2018 + Number(made[1])}-${made[2].padStart(2, '0')}-${made[3].padStart(2, '0')}` : '';
    p.carePlans = [...(p.carePlans ?? []).filter(c => c.date !== date), { date, rows: doc.carePlan2 }]
      .sort((a, b) => a.date.localeCompare(b.date));
    notes.push(`ケアプラン第2表 ${date}：訪問介護 ${doc.carePlan2.length}行（${doc.carePlan2.map(r => r.freq).join('・')}）`);
  }
  return notes.length ? notes.join(' / ') : '読み取り対象外の書類です（そのままでも問題ありません）';
}

function resolveUser(name, insuredNo = '') {
  const norm = normalizeName(name);
  const byName = Object.keys(state.profiles).find(k => normalizeName(state.profiles[k].name) === norm);
  const id = insuredNo || byName || `name:${norm}`;
  // 名前だけで作っていた利用者を、被保険者番号の利用者にまとめる
  if (insuredNo && byName && byName !== id) {
    state.profiles[id] = { ...state.profiles[byName], ...state.profiles[id] };
    delete state.profiles[byName];
  }
  profileOf(id, name);
  return id;
}

$('#docFiles').addEventListener('change', e => {
  importDocs([...e.target.files]);
  e.target.value = '';
});
const docBox = $('.drop-docs');
docBox.addEventListener('dragover', e => { e.preventDefault(); docBox.classList.add('over'); });
docBox.addEventListener('dragleave', () => docBox.classList.remove('over'));
docBox.addEventListener('drop', e => {
  e.preventDefault();
  docBox.classList.remove('over');
  importDocs([...e.dataTransfer.files]);
});

// ---- 利用者情報 ----

const profileUser = $('#profileUser');

function profileOf(userId, name = '') {
  const p = state.profiles[userId] ??= {};
  p.name ||= name || userId;
  p.careLevel ??= '';
  p.dementia ??= false;
  p.items ??= [];
  p.planRows ??= [];
  p.carePlans ??= [];
  p.versions ??= [];
  p.slotOverrides ??= {};
  return p;
}

$('#extract').addEventListener('click', () => {
  const userId = profileUser.value;
  if (!userId) { alert('先に利用者を選んでください。'); return; }
  const text = $('#planText').value;
  const found = detectProfile(text);
  const p = profileOf(userId);
  p.careLevel = found.careLevel || p.careLevel;
  p.dementia = found.dementia || p.dementia;
  p.items = [...new Set([...p.items, ...found.items])];
  // 頻度の書いてある行があれば、ケアプラン第2表として使う
  const rows = detectPlanRows(text);
  if (rows.length) {
    const m = /作成年月日\s*令和\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/.exec(text);
    const date = m ? `${2018 + Number(m[1])}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : '';
    p.carePlans = [...(p.carePlans ?? []).filter(c => c.date !== date), { date, rows }].sort((a, b) => a.date.localeCompare(b.date));
  }
  save();
  render();
});
profileUser.addEventListener('change', () => { editSlot = null; drawProfile(); });

$('#deleteUser').addEventListener('click', () => {
  const userId = profileUser.value;
  if (!userId || !confirm(`${profileOf(userId).name} さんの予定・書類の読み取り結果・記録をすべて削除します。`)) return;
  delete state.profiles[userId];
  state.careplan = state.careplan.filter(p => p.userId !== userId);
  state.actual = state.actual.filter(a => a.userId !== userId);
  for (const k of Object.keys(state.records)) if (k.split('|')[1] === userId) delete state.records[k];
  save();
  render();
});

function drawProfile() {
  const userId = profileUser.value;
  const box = $('#profileEdit');
  if (!userId) { box.innerHTML = '<p class="hint">書類を取り込むと利用者が表示されます。</p>'; return; }
  const p = profileOf(userId);
  const slots = slotsOf(userId);
  box.innerHTML = `
    <div class="row wrap">
      <span>被保険者番号 ${esc(userId.startsWith('name:') ? '（未取得）' : userId)}</span>
      <label>介護度 <select data-f="careLevel"><option value="">未設定</option>
        ${CARE_LEVELS.map(l => `<option ${l === p.careLevel ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label><input type="checkbox" data-f="dementia" ${p.dementia ? 'checked' : ''}> 認知症の記録文を入れる</label>
      ${p.dementiaLevel ? `<span class="hint">認知症自立度 ${esc(p.dementiaLevel)}（アセスメントより）</span>` : ''}
      <label><input type="checkbox" data-f="walker" ${p.walker ? 'checked' : ''}> 歩行器使用</label>
    </div>
    <p class="hint">訪問介護計画書：${p.versions.length ? p.versions.map(v => `${v.date}版`).join('、') : '未取り込み'}
      ／ ケアプラン第2表：${p.carePlans.length ? p.carePlans.map(c => `${c.date}版`).join('、') : '未取り込み'}（ケアプランの頻度を優先）</p>
    <table class="slots">
      <thead><tr><th>${esc(monthInput.value)} の訪問枠</th><th>回数</th><th>レ点（${'自動'}）</th><th>根拠</th><th></th></tr></thead>
      <tbody>${slots.map(s => `
        <tr>
          <td>${esc(s.start)}〜${esc(s.end)} ${esc(s.service)}</td>
          <td>${s.count}回</td>
          <td class="items">${s.items.map(n => `<span class="chip">レ ${esc(n)}${s.tally[n] < s.count ? ` <small>${s.tally[n]}/${s.count}回</small>` : ''}</span>`).join('')}</td>
          <td class="hint">${esc(s.source)}</td>
          <td><button class="secondary" data-slot="${esc(s.key)}">${editSlot === s.key ? '閉じる' : '編集'}</button></td>
        </tr>
        ${editSlot === s.key ? `<tr class="detail"><td colspan="5">
          <p class="hint">この訪問枠のすべての日に使うレ点を選びます。</p>
          ${checkGrid(s.items, 'data-f="slotItem"')}
          <button class="secondary" data-f="slotReset">計画書どおりに戻す</button>
        </td></tr>` : ''}`).join('') || '<tr><td colspan="5" class="hint">この月の予定はありません。</td></tr>'}
      </tbody>
    </table>`;
  box.querySelector('[data-f=careLevel]').onchange = e => updateProfile(userId, { careLevel: e.target.value });
  box.querySelector('[data-f=dementia]').onchange = e => updateProfile(userId, { dementia: e.target.checked });
  box.querySelector('[data-f=walker]').onchange = e => updateProfile(userId, { walker: e.target.checked });
  box.querySelectorAll('[data-slot]').forEach(b => {
    b.onclick = () => { editSlot = editSlot === b.dataset.slot ? null : b.dataset.slot; drawProfile(); };
  });
  box.querySelectorAll('[data-f=slotItem]').forEach(cb => {
    cb.onchange = () => {
      p.slotOverrides[editSlot] = [...box.querySelectorAll('[data-f=slotItem]:checked')].map(c => c.value);
      clearSlotRecords(userId, editSlot);
      save();
      render();
    };
  });
  const reset = box.querySelector('[data-f=slotReset]');
  if (reset) reset.onclick = () => { delete p.slotOverrides[editSlot]; clearSlotRecords(userId, editSlot); save(); render(); };
}

// 訪問枠のレ点を変えたら、その枠の自動入力をやり直す（確認済みの記録は残す）
function clearSlotRecords(userId, key) {
  for (const r of rows.filter(r => r.userId === userId && slotKey(r.planStart || r.actualStart, r.service) === key)) {
    if (!state.records[r.key]?.confirmed) delete state.records[r.key];
  }
}

function slotsOf(userId) {
  const map = new Map();
  for (const r of rows.filter(r => r.userId === userId)) {
    const key = slotKey(r.planStart || r.actualStart, r.service);
    const s = map.get(key) ?? { key, start: r.planStart || r.actualStart, end: r.planEnd || r.actualEnd, service: r.service, count: 0, tally: {}, sources: new Set() };
    s.count++;
    for (const n of r.autoItems) s.tally[n] = (s.tally[n] ?? 0) + 1;
    s.sources.add(r.source);
    map.set(key, s);
  }
  return [...map.values()].map(s => ({
    ...s,
    items: ITEMS.map(it => it.name).filter(n => s.tally[n]),
    source: [...s.sources].join(' / '),
  })).sort((a, b) => a.start.localeCompare(b.start));
}

function updateProfile(userId, patch) {
  Object.assign(profileOf(userId), patch);
  // 介護度・認知症を変えたら、未確認のコメントは作り直す
  for (const k of Object.keys(state.records)) {
    if (k.split('|')[1] === userId && !state.records[k].confirmed) delete state.records[k].comment;
  }
  save();
  render();
}

function checkGrid(checked, attr) {
  const groups = [...new Set(ITEMS.map(it => it.group))];
  return `<div class="checks">${groups.map(g => `<fieldset><legend>${g}</legend>${ITEMS.filter(it => it.group === g)
    .map(it => `<label><input type="checkbox" ${attr} value="${it.name}" ${checked.includes(it.name) ? 'checked' : ''}> ${it.name}</label>`)
    .join('')}</fieldset>`).join('')}</div>`;
}

// ---- 実績表 ----

monthInput.addEventListener('change', () => { state.month = monthInput.value; editSlot = null; save(); render(); });
$('#office').addEventListener('change', e => { state.office = e.target.value; save(); });
$('#tolerance').addEventListener('change', e => { state.tolerance = e.target.value; save(); render(); });
$('#userFilter').addEventListener('change', draw);
$('#statusFilter').addEventListener('change', draw);
$('#actualOnly').addEventListener('change', draw);
$('#noStaffOnly').addEventListener('change', draw);

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
    '予定開始', '予定終了', '実績開始', '実績終了', '記録の開始', '記録の終了', '担当者', '状態', ...ITEMS.map(it => it.name), '記録コメント', '記録確認', 'レ点の根拠', '振り分けメモ'];
  const body = visibleRows().map(r => [r.teressa ? '○' : '', r.date, r.userId, r.userName, r.service,
    r.code, r.planStart, r.planEnd, r.actualStart, r.actualEnd,
    r.recStart || r.actualStart || r.planStart, r.recEnd || r.actualEnd || r.planEnd, r.staff, r.status,
    ...ITEMS.map(it => r.items.includes(it.name) ? 'レ' : ''), r.comment, r.confirmed ? '済' : '', r.source, r.staffNote ?? '']);
  download(`実績_${monthInput.value}.csv`, '﻿' + toCSV([header, ...body]), 'text/csv');
});

function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

$('#printRecords').addEventListener('click', () => {
  const list = visibleRows();
  if (!list.length) { alert('印刷する記録がありません。'); return; }
  $('#printArea').innerHTML = list.map(r => recordCard(r, { office: state.office })).join('');
  document.body.classList.add('printing');
  window.print();
});
window.addEventListener('afterprint', () => document.body.classList.remove('printing'));

function rowKey(r) {
  return `${r.date}|${r.userId}|${r.planStart || r.actualStart}|${r.service}`;
}

// 予定・実績の各行に、レ点と記録コメントを自動で入れる（手で直した内容はそちらを優先）。
function withRecord(r, slotCounts, slotDays, weeks) {
  const key = rowKey(r);
  const start = r.planStart || r.actualStart;
  const saved = state.records[key] ?? {};
  const profile = profileOf(r.userId, r.userName);
  const sk = slotKey(start, r.service);
  const auto = resolveItems({
    profile, date: r.date, start, service: r.service,
    slotPerWeek: slotCounts[`${r.userId}|${sk}`] / weeks, slotWeekdays: [...slotDays[`${r.userId}|${sk}`]],
  });
  const items = saved.items ?? auto.items;
  const comment = saved.comment ?? generateComment({ profile, items, seed: key + (saved.regen ?? ''), start, date: r.date });
  return { ...r, userName: r.userName || profile.name, key, items, autoItems: auto.items, source: saved.items ? '手で修正' : auto.source, comment, confirmed: !!saved.confirmed };
}

function updateRecord(key, patch) {
  state.records[key] = { ...state.records[key], ...patch };
  save();
  render();
}

function render() {
  for (const box of document.querySelectorAll('.drop')) {
    const list = state[box.dataset.kind];
    box.querySelector('.count').textContent = `${box.dataset.kind === 'careplan' ? list.filter(p => p.src !== 'teikyo').length : list.length}件`;
  }
  const base = reconcile({
    plans: state.careplan,
    shifts: state.shift,
    actuals: state.actual,
    month: monthInput.value,
    toleranceMin: Number($('#tolerance').value) || 0,
  });
  const [y, m] = monthInput.value.split('-').map(Number);
  const weeks = new Date(y, m, 0).getDate() / 7;
  const slotCounts = {}, slotDays = {};
  for (const r of base) {
    const k = `${r.userId}|${slotKey(r.planStart || r.actualStart, r.service)}`;
    slotCounts[k] = (slotCounts[k] ?? 0) + 1;
    (slotDays[k] ??= new Set()).add(new Date(`${r.date}T00:00:00`).getDay());
  }
  rows = base.map(r => withRecord(r, slotCounts, slotDays, weeks));
  alignTimes(rows);
  assignHelpers(rows);

  const counts = summarize(rows);
  $('#summary').innerHTML = Object.entries(counts)
    .map(([s, n]) => `<span class="badge ${cls(s)}">${s} ${n}</span>`).join('');

  const names = Object.fromEntries(Object.entries(state.profiles).map(([id, p]) => [id, p.name]));
  fillSelect($('#userFilter'), [...new Map(rows.map(r => [r.userId, `${r.userName}`]))], true);
  fillSelect($('#statusFilter'), Object.values(STATUS).map(s => [s, s]), true);
  fillSelect(profileUser, Object.keys(state.profiles).map(id => [id, names[id]]), false);
  drawProfile();
  drawStaff();
  draw();
}

function toMin(t) {
  const m = /(\d{1,2}):(\d{2})/.exec(String(t));
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

// 実績のない訪問は、記録の時間をサービスコードの時間区分にそろえる
function alignTimes(list) {
  for (const r of list) {
    r.timeNote = '';
    if (r.actualStart) continue;
    const a = alignToBand(r.service, r.planStart, r.planEnd);
    if (a.end !== r.planEnd) { r.recStart = r.planStart; r.recEnd = a.end; }
    r.timeNote = a.note;
  }
}

// シフト・実績・手入力で担当者が決まっていない訪問に、ヘルパーを自動で割り当てる
let staffLoad = null;
function assignHelpers(list) {
  const staff = parseStaff(state.staffText);
  staffLoad = null;
  if (!staff.length) { for (const r of list) r.staffNote = r.timeNote; return; }
  const fixed = {};
  const visits = [];
  // 実績を取り込んだ月は、実績のない予定（行わなかった訪問）には割り当てない
  const hasActual = list.some(r => r.actualStart);
  for (const r of list) {
    if (!r.actualStart && hasActual) { r.staffNote = '実績なし'; continue; }
    const manual = state.records[r.key]?.staff;
    if (manual) r.staff = manual;
    if (r.staff) fixed[r.key] = r.staff;
    visits.push({ key: r.key, locked: !!r.actualStart, date: r.date, start: r.recStart || r.actualStart || r.planStart, end: r.recEnd || r.actualEnd || r.planEnd, userId: r.userId, slot: `${r.userId}|${slotKey(r.planStart || r.actualStart, r.service)}` });
  }
  const result = assignWithBackup(visits, staff, {
    buffer: Number(state.buffer ?? 1), minBuffer: Number(state.minBuffer ?? state.buffer ?? 1),
    shift: Number(state.shiftMax ?? 0), trimEnd: Number(state.trimEnd ?? 1),
    maxSpan: Number(state.maxSpan ?? 0) * 60 || Infinity, maxMinutes: Number(state.maxHours ?? 10) * 60, fixed,
  });
  for (const r of list) {
    if (!r.actualStart && hasActual) continue;
    if (!r.staff && result.assign[r.key]) { r.staff = result.assign[r.key]; r.staffAuto = true; }
    const notes = r.timeNote ? [r.timeNote] : [];
    if (result.tight[r.key] !== undefined) notes.push(`前後の訪問との移動時間 ${result.tight[r.key]}分`);
    const o = result.shifted[r.key];
    if (o) {
      // 提供時間の長さはそのままで前倒し（開始は遅らせない）
      const fmt = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      r.recStart = fmt(toMin(r.recStart || r.actualStart || r.planStart) - o);
      r.recEnd = fmt(toMin(r.recEnd || r.actualEnd || r.planEnd) - o);
      notes.push(`予定より${o}分前倒しして割り当て`);
    }
    const t = result.trimmed[r.key];
    if (t) {
      const m = toMin(r.recEnd || r.actualEnd || r.planEnd) - t;
      r.recStart ??= r.actualStart || r.planStart;
      r.recEnd = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      notes.push(`次の訪問に間に合うよう終了を${t}分早めた`);
    }
    if (!r.staff) notes.push('空いているヘルパーなし');
    r.staffNote = notes.join('、');
  }
  staffLoad = { ...result, staff };
}

function drawStaff() {
  const box = $('#staffLoad');
  if (!staffLoad) { box.innerHTML = ''; $('#staffStatus').textContent = ''; return; }
  const { load, unassigned, staff } = staffLoad;
  const tight = Object.keys(staffLoad.tight).length, shifted = Object.keys(staffLoad.shifted).length;
  const target = rows.filter(r => r.staffNote !== '実績なし').length;
  $('#staffStatus').textContent = `${monthInput.value}：${target - unassigned.length}件を割り当て（うち移動時間を詰めたもの${tight}件${shifted ? `、前倒ししたもの${shifted}件` : ''}${Object.keys(staffLoad.trimmed).length ? `、終了を早めたもの${Object.keys(staffLoad.trimmed).length}件` : ''}）、${unassigned.length}件は空いているヘルパーがいないため空欄`;
  const [y, m] = monthInput.value.split('-').map(Number);
  const first = `${monthInput.value}-01`, last = `${monthInput.value}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
  const shown = staff.filter(p => p.from <= last && (!p.to || p.to >= first));
  box.innerHTML = `<table class="slots"><thead><tr><th>ヘルパー</th><th>在籍</th><th>担当件数</th><th>時間</th></tr></thead><tbody>
    ${shown.map(p => `<tr><td>${esc(p.name)}</td><td class="hint">${p.from}〜${p.to || '現在'}</td>
      <td>${load[p.name]?.visits ?? 0}件</td><td>${((load[p.name]?.minutes ?? 0) / 60).toFixed(1)}時間</td></tr>`).join('')}
  </tbody></table>`;
}

$('#applyStaff').addEventListener('click', () => {
  state.staffText = $('#staffText').value;
  state.buffer = $('#buffer').value;
  state.maxHours = $('#maxHours').value;
  state.minBuffer = $('#minBuffer').value;
  state.shiftMax = $('#shiftMax').value;
  state.trimEnd = $('#trimEnd').value;
  state.maxSpan = $('#maxSpan').value;
  save();
  render();
});

function fillSelect(sel, entries, withAll) {
  const current = sel.value;
  sel.length = 0;
  if (withAll) sel.add(new Option('すべて', ''));
  for (const [value, label] of entries) sel.add(new Option(label, value));
  sel.value = entries.some(([v]) => v === current) ? current : (sel.options[0]?.value ?? '');
}

function visibleRows() {
  const user = $('#userFilter').value, status = $('#statusFilter').value;
  const actualOnly = $('#actualOnly')?.checked, noStaffOnly = $('#noStaffOnly')?.checked;
  return rows.filter(r => (!user || r.userId === user) && (!status || r.status === status) &&
    (!actualOnly || r.actualStart) && (!noStaffOnly || !r.staff));
}

function draw() {
  const list = visibleRows();
  $('#empty').hidden = rows.length > 0;
  $('#rows').innerHTML = list.map(r => `
    <tr class="${cls(r.status)} clickable" data-key="${esc(r.key)}">
      <td class="mark">${r.teressa ? '○' : ''}</td>
      <td>${esc(r.date)}（${WEEKDAYS[new Date(`${r.date}T00:00:00`).getDay()]}）</td>
      <td>${esc(r.userName)}</td>
      <td>${esc(r.service)}</td>
      <td>${r.planStart ? `${esc(r.planStart)}〜${esc(r.planEnd)}` : '—'}</td>
      <td>${r.actualStart ? `${esc(r.actualStart)}〜${esc(r.actualEnd)}` : '—'}</td>
      <td>${esc(r.staff) || '—'}</td>
      <td><span class="badge ${cls(r.status)}">${r.status}</span></td>
      <td class="items">${r.items.map(n => `<span class="chip">レ ${esc(n)}</span>`).join('')}</td>
      <td class="comment">${r.confirmed ? '<span class="badge ok">確認済</span>' : '<span class="badge warn">下書き</span>'} ${esc(r.comment)}</td>
    </tr>
    ${r.key === openKey ? detailRow(r) : ''}`).join('');
}

function detailRow(r) {
  return `<tr class="detail"><td colspan="10">
    <p class="hint">レ点の根拠：${esc(r.source)}</p>
    ${checkGrid(r.items, 'data-d="item"')}
    <textarea data-d="comment" rows="3">${esc(r.comment)}</textarea>
    <div class="row">
      <button data-d="regen" class="secondary">コメント再生成</button>
      <button data-d="reset" class="secondary">レ点を計画書どおりに戻す</button>
      <label>担当ヘルパー <input data-d="staff" value="${esc(r.staff)}" list="staffNames" size="14">${r.staffAuto ? '<span class="hint">（自動）</span>' : ''}</label>
      <datalist id="staffNames">${parseStaff(state.staffText).map(p => `<option value="${esc(p.name)}">`).join('')}</datalist>
      <label><input type="checkbox" data-d="confirmed" ${r.confirmed ? 'checked' : ''}> 記録内容を確認した</label>
    </div>
  </td></tr>`;
}

$('#rows').addEventListener('click', e => {
  const d = e.target.dataset.d;
  if (d === 'regen') {
    updateRecord(openKey, { comment: undefined, regen: Date.now(), confirmed: false });
    return;
  }
  if (d === 'reset') {
    updateRecord(openKey, { items: undefined, comment: undefined, confirmed: false });
    return;
  }
  const tr = e.target.closest('tr.clickable');
  if (!tr) return;
  openKey = openKey === tr.dataset.key ? null : tr.dataset.key;
  draw();
});

$('#rows').addEventListener('change', e => {
  if (!openKey) return;
  const d = e.target.dataset.d;
  const detail = e.target.closest('tr.detail');
  if (d === 'item') {
    const items = [...detail.querySelectorAll('[data-d=item]:checked')].map(c => c.value);
    // レ点を変えたらコメントも合わせて作り直す
    updateRecord(openKey, { items, comment: undefined, confirmed: false });
  } else if (d === 'comment') {
    updateRecord(openKey, { comment: e.target.value });
  } else if (d === 'staff') {
    updateRecord(openKey, { staff: e.target.value.trim() || undefined });
  } else if (d === 'confirmed') {
    updateRecord(openKey, { confirmed: e.target.checked });
  }
});

function cls(status) {
  return { [STATUS.OK]: 'ok', [STATUS.TIME_DIFF]: 'warn', [STATUS.NO_SHIFT]: 'warn',
    [STATUS.PLANNED]: 'plan', [STATUS.UNPLANNED]: 'ng' }[status];
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

render();
