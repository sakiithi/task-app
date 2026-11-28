// today.html と night.html で共通に使う道具
// タスクのデータ（task-app:tasks）は読むだけ。変更はタスク画面（index.html）に頼む（taskOp）。
const $ = s => document.querySelector(s);
const WD = '日月火水木金土', MIN = 60000, DAY = 86400000;

const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad2 = n => String(n).padStart(2, '0');
const dayKey = d => { d = new Date(d); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };
const today = () => dayKey(Date.now());
const sod = (n = 0) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); return d.getTime(); };
const keyOf = n => dayKey(sod(n));
const hm = d => { d = new Date(d); return d.getHours() + ':' + pad2(d.getMinutes()); };
const padT = s => s ? String(s).split(':').map(x => x.padStart(2, '0')).join(':') : '';
const minOf = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const minToHm = m => { m = ((Math.round(m) % 1440) + 1440) % 1440; return Math.floor(m / 60) + ':' + pad2(m % 60); };
const atDay = (s, n = 0) => sod(n) + minOf(s) * MIN;
const durLabel = ms => { const m = Math.max(0, Math.round(ms / MIN)); return m < 60 ? m + '分' : Math.floor(m / 60) + '時間' + (m % 60 ? m % 60 + '分' : ''); };
const dateLabel = key => { const [y, mo, d] = key.split('-').map(Number); return `${mo}月${d}日（${WD[new Date(y, mo - 1, d).getDay()]}）`; };
const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
const sleepH = r => r && r.bed && r.wake ? ((minOf(r.wake) - minOf(r.bed) + 1440) % 1440) / 60 : null;

// ---------- タスク ----------
const getTasks = () => load('task-app:tasks', []);
const getTaskLog = () => load('task-app:log', []);
const EMBED = window.parent !== window;
function tellParent(msg) { if (EMBED) try { window.parent.postMessage(msg, location.origin); } catch (e) {} }
function taskOp(op, id, patch) {
  if (!EMBED) { toast('タスクの変更は、アプリの中で開いたときだけできるよ'); return false; }
  tellParent({ type: 'task', op, id, patch });
  return true;
}
// 今日完了したか（くり返しタスクは記録で判断）
function doneToday(id) {
  const t = getTasks().find(x => x.id === id);
  if (t && t.done) return true;
  return getTaskLog().some(e => e.taskId === id && dayKey(e.at) === today());
}
const T_EMOJI = [[/薬|サプリ/, '💊'], [/買|スーパー|コンビニ/, '🛒'], [/メール|連絡|返信|電話/, '💌'], [/掃除|片付|洗濯/, '🧹'],
  [/勉強|宿題|レポート|資料/, '📚'], [/会議|ミーティング|打ち合わせ/, '👥'], [/病院|歯医者|医者/, '🏥'], [/運動|ジム|ヨガ|散歩/, '🏃‍♀️'],
  [/ご飯|料理|ランチ|ごはん/, '🍳'], [/支払|振込|銀行/, '💳'], [/ゴミ/, '🗑️'], [/誕生日|プレゼント/, '🎁']];
const taskEmoji = t => { for (const [re, e] of T_EMOJI) if (re.test(t.title)) return e; return t.star ? '⭐' : '🌷'; };
function dueText(t) {
  if (!t.due) return '';
  const k = dayKey(t.due), when = k === today() ? '今日' : k === keyOf(1) ? '明日' : k === keyOf(-1) ? '昨日' : dateLabel(k).replace(/（.）/, '');
  return when + (t.allDay ? '' : ' ' + hm(t.due));
}

// ---------- 今日の3つ ----------
const getTop3 = () => { const p = load('plan:top3', null); return p && p.date === today() ? p.ids : []; };
const setTop3 = ids => store('plan:top3', { date: today(), ids });

// ---------- 習慣 ----------
const DEFAULT_HABITS = [['💧', 'お水をたくさん飲む'], ['🧘‍♀️', 'ストレッチ'], ['📖', '本を読む']];
function getHabits() {
  let h = load('habits:list', null);
  // 最初の見本は保存しない（同期で本物を上書きしないように）。id は毎回同じにしておく
  if (!Array.isArray(h)) h = DEFAULT_HABITS.map(([emoji, name], i) => ({ id: 'h-default-' + i, emoji, name }));
  return h;
}
const getChecks = () => load('habits:checks', {});
function habitStreak(id, checks) {
  let n = 0, i = (checks[today()] || []).includes(id) ? 0 : 1;
  while ((checks[keyOf(-i)] || []).includes(id)) { n++; i++; }
  return n;
}

// ---------- 💃 ダンスのレッスン（dance.html が書く。ほかの画面は読むだけ）----------
const danceClasses = () => load('dance:classes', []);
const danceNotes = () => load('dance:notes', {});
const keyDow = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).getDay(); };
// その日にあるレッスンか：プライベート（kind:'private'）は date の日だけ。
// レギュラーは曜日が合っていて、nth（第何週、例 [2,4]）があればその週だけ
const nthOf = k => Math.ceil(Number(k.split('-')[2]) / 7);
function classOn(c, k) {
  if (c.kind === 'private') return c.date === k;
  return c.dow === keyDow(k) && (!c.nth || !c.nth.length || c.nth.includes(nthOf(k)));
}
function lessonsOn(k, withCanceled) {
  const ns = danceNotes();
  return danceClasses().filter(c => classOn(c, k)).sort((a, b) => minOf(a.start) - minOf(b.start))
    .map(c => ({ c, date: k, key: c.id + '_' + k, note: ns[c.id + '_' + k] || {} }))
    .filter(l => withCanceled || !l.note.canceled);
}
// いつもの準備（dance:prep。ダンスのノートで編集できる）
// all：全部のレッスン ／ priv：自主開催（プライベート）だけ。since（日付）がある項目は、その日からのレッスンだけに出す
// （あとから足した項目で、前のレッスンの「準備OK」やポイントが消えないように）
const PREP_DEFAULT = {
  all: [{ id: 'music', text: '🎵 曲を用意した' }, { id: 'choreo', text: '💃 振りを確認した' }, { id: 'flow', text: '⏱ 流れを決めた' },
    { id: 'cross', text: '🔀 クロスフロアの曲と振りを用意した', since: '2026-11-27' }],
  priv: [{ id: 'studio', text: '🏢 スタジオを予約した' }, { id: 'announce', text: '📣 告知した' }, { id: 'members', text: '👥 参加者を確認した' }],
};
function prepLists() { const p = load('dance:prep', null) || {}; return { all: p.all || PREP_DEFAULT.all, priv: p.priv || PREP_DEFAULT.priv }; }
function lessonChecks(c, n, k) {
  const p = prepLists(), on = x => !k || !x.since || x.since <= k;
  return (c.kind === 'private' ? p.priv : []).concat(p.all).filter(on)
    .concat((c.items || []).map((t, i) => ({ id: 'item' + i, text: '🎒 ' + t })))
    .concat(n.extra || []);
}
function lessonPrep(c, n, k) {
  const l = lessonChecks(c, n, k), done = l.filter(x => (n.checks || {})[x.id]).length;
  return { done, total: l.length, ok: done === l.length };
}
function openDance(action) { if (EMBED) tellParent({ type: 'tab', tab: 'dance', action }); else location.href = 'dance.html' + (action ? '#' + action : ''); }

// ---------- 育てるキャラ ----------
// ポイント：タスク完了10・朝のルーティーン30（全部できたら+20）・習慣5・夜のふりかえり20・今日の3つ達成30・体重の記録5・ごはんの記録5（1日1回）・レッスンの準備OK10・フィードバック20・ストレッチ10（朝夜ダブルで+5）
function xpOf(day) {
  const inDay = k => !day || k === day;
  let xp = 0;
  getTaskLog().forEach(e => { if (inDay(dayKey(e.at))) xp += 10; });
  load('morning:log', []).forEach(l => { if (inDay(l.date)) xp += 30 + (l.done === l.total ? 20 : 0); });
  const ch = getChecks(); Object.keys(ch).forEach(k => { if (inDay(k)) xp += ch[k].length * 5; });
  const nr = load('night:records', {}); Object.keys(nr).forEach(k => { if (inDay(k) && nr[k].done) xp += 20; });
  const t3 = load('plan:top3done', {}); Object.keys(t3).forEach(k => { if (inDay(k)) xp += 30; });
  const mr = load('morning:records', {}); Object.keys(mr).forEach(k => { if (inDay(k) && mr[k].weight != null) xp += 5; });
  const fl = load('food:log', {}); Object.keys(fl).forEach(k => { if (inDay(k) && fl[k].length) xp += 5; });
  const dn = load('dance:notes', {}), dc = load('dance:classes', []);
  Object.keys(dn).forEach(key => {
    const k = key.slice(key.indexOf('_') + 1), n = dn[key], c = dc.find(x => key.startsWith(x.id + '_'));
    if (!inDay(k) || !c) return;
    if (n.fb && n.fb.done) xp += 20;
    if (lessonPrep(c, n, k).ok) xp += 10;
  });
  const sl = (load('dance:stretch', {}) || {}).log || {};
  Object.keys(sl).forEach(k => { const e = sl[k]; if (inDay(k) && (e.am || e.pm || e.mini)) xp += 10 + (e.am && e.pm ? 5 : 0); });
  return xp;
}
const LEVEL_XP = L => 40 * L * (L - 1);
function levelOf(xp) { let L = 1; while (xp >= LEVEL_XP(L + 1)) L++; return L; }
const STAGES = [[1, '🌱', 'めばえ'], [3, '🌿', 'ふたば'], [5, '🪴', 'すくすく'], [8, '🌷', 'つぼみ'], [12, '🌸', 'さいた！'], [16, '🌳', 'おおきな木'], [20, '🌈', 'にじの木']];
function stageOf(L) { let s = STAGES[0]; for (const x of STAGES) if (L >= x[0]) s = x; return s; }
function petMessage(tx) {
  const h = new Date().getHours();
  if (h >= 21 || h < 4) return tx ? `今日は ${tx}pt もらったよ。ゆっくり休んでね🌙` : 'おつかれさま。明日もいっしょにがんばろ🌙';
  if (!tx) return h < 11 ? 'おはよ！今日もいっしょにがんばろ☀️' : 'なにか1つやってみよ？応援してるよ';
  if (tx < 60) return 'いい感じ！その調子〜✨';
  if (tx < 150) return 'すごい！ぐんぐん育ってるよ🌱';
  return '今日は大活躍だね…！ありがとう💕';
}
function petHtml() {
  const xp = xpOf(null), L = levelOf(xp), [, emo, label] = stageOf(L);
  const cur = LEVEL_XP(L), nxt = LEVEL_XP(L + 1), pct = Math.round((xp - cur) / (nxt - cur) * 100);
  const tx = xpOf(today());
  return `<div class="pet-face">${emo}</div><div class="pet-body">
    <div class="pet-name" data-act="petname">${esc(load('pet:name', 'もこ'))}<small>Lv.${L} ${label}</small></div>
    <div class="pet-bar"><i style="width:${pct}%"></i></div>
    <div class="pet-xp">今日 +${tx}pt ・ つぎのレベルまで ${nxt - xp}pt</div>
    <div class="bubble">${petMessage(tx)}</div></div>`;
}
function bindPet(el, rerender) {
  el.addEventListener('click', e => {
    if (!e.target.closest('[data-act="petname"]')) return;
    const n = prompt('この子の名前は？', load('pet:name', 'もこ'));
    if (n && n.trim()) { store('pet:name', n.trim().slice(0, 12)); rerender(); }
  });
}
function checkLevelUp() {
  const L = levelOf(xpOf(null)), seen = load('pet:seenLevel', null);
  if (seen == null || L < seen) { store('pet:seenLevel', L); return; }
  if (L > seen) { store('pet:seenLevel', L); confetti(); toast(`🎉 レベル${L}になったよ！ ${stageOf(L)[1]}`); }
}

// ---------- 通知・紙吹雪 ----------
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }
function confetti() {
  const colors = ['#b896ff', '#ff8cc0', '#ffd166', '#8be0c2', '#ffb38a'];
  for (let i = 0; i < 60; i++) {
    const c = document.createElement('div');
    c.className = 'conf';
    c.style.left = Math.random() * 100 + 'vw';
    c.style.background = colors[i % colors.length];
    c.style.animationDuration = (1.8 + Math.random() * 1.6) + 's';
    c.style.animationDelay = Math.random() * .5 + 's';
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 4200);
  }
}

// ---------- 長押しでつかんで並べかえ（まっすぐ並んだリスト用）----------
// （morning.html にも同じものがある）box の中の sel の要素を、長押し（0.4秒）でつかんで動かせるようにする。離すと onDrop(もとの番号, 新しい番号)
let sorting = false;
function sortable(box, sel, axis, onDrop) {
  const H = axis === 'x', TR = H ? 'translateX' : 'translateY';
  const pos = e => H ? e.clientX : e.clientY;
  const scr = () => H ? box.scrollLeft : window.scrollY;
  let d = null;
  box.style.webkitTouchCallout = 'none';
  function lift() {
    const list = [...box.querySelectorAll(sel)];
    d.list = list; d.from = d.to = list.indexOf(d.el);
    if (d.from < 0) { d = null; return; }
    const rs = list.map(x => x.getBoundingClientRect());
    d.mids = rs.map(r => (H ? r.left + r.width / 2 : r.top + r.height / 2) + scr());
    const r0 = rs[d.from], size = H ? r0.width : r0.height;
    const gap = rs.length > 1 ? Math.max(0, H ? rs[1].left - rs[0].right : rs[1].top - rs[0].bottom) : 0;
    d.step = size + gap; d.scr0 = scr(); d.lifted = true; sorting = true;
    list.forEach(x => { x.style.transition = 'transform .18s'; });
    d.el.style.transition = 'box-shadow .15s'; d.el.style.position = 'relative'; d.el.style.zIndex = 5;
    d.el.classList.add('lifting'); box.classList.add('sorting');
    try { box.setPointerCapture(d.id); } catch (x) {}
    try { navigator.vibrate && navigator.vibrate(15); } catch (e) {}
    requestAnimationFrame(frame);
  }
  function frame() {
    if (!d || !d.lifted) return;
    // 端に近づけたら、その方向へ進める
    if (H) { const r = box.getBoundingClientRect(); if (d.cur < r.left + 40) box.scrollLeft -= 6; else if (d.cur > r.right - 40) box.scrollLeft += 6; }
    else { if (d.cur < 60) window.scrollBy(0, -6); else if (d.cur > innerHeight - 60) window.scrollBy(0, 6); }
    const delta = d.cur - d.start + (scr() - d.scr0), c = d.mids[d.from] + delta;
    d.to = d.mids.filter((m, i) => i !== d.from && m < c).length;
    d.el.style.transform = `${TR}(${delta}px) scale(1.06)`;
    d.list.forEach((x, i) => {
      if (i === d.from) return;
      const sh = d.from < d.to && i > d.from && i <= d.to ? -d.step : d.from > d.to && i >= d.to && i < d.from ? d.step : 0;
      x.style.transform = sh ? `${TR}(${sh}px)` : '';
    });
    requestAnimationFrame(frame);
  }
  function end(commit) {
    const x = d; d = null;
    clearTimeout(x.timer);
    if (!x.lifted) return;
    sorting = false;
    box.classList.remove('sorting'); x.el.classList.remove('lifting');
    x.list.forEach(el => { el.style.transition = 'none'; el.style.transform = ''; el.style.position = ''; el.style.zIndex = ''; });
    // 指を離したときの「タップ」は無視する
    const stop = e => { e.stopPropagation(); e.preventDefault(); };
    box.addEventListener('click', stop, true); setTimeout(() => box.removeEventListener('click', stop, true), 400);
    if (commit && x.to !== x.from) onDrop(x.from, x.to);
  }
  box.addEventListener('pointerdown', e => {
    if (d) return;
    const el = e.target.closest(sel);
    if (!el || !box.contains(el)) return;
    d = { el, id: e.pointerId, start: pos(e), cur: pos(e), x0: e.clientX, y0: e.clientY };
    d.timer = setTimeout(lift, 400);
  });
  box.addEventListener('pointermove', e => {
    if (!d || e.pointerId !== d.id) return;
    d.cur = pos(e);
    if (!d.lifted && (Math.abs(e.clientX - d.x0) > 8 || Math.abs(e.clientY - d.y0) > 8)) { clearTimeout(d.timer); d = null; }   // 動かしたら長押しではない
  });
  box.addEventListener('pointerup', e => { if (d && e.pointerId === d.id) end(true); });
  box.addEventListener('pointercancel', e => { if (d && e.pointerId === d.id) end(false); });
  // つかんでいるあいだは、画面がスクロールしないようにする
  box.addEventListener('touchmove', e => { if (d && d.lifted) e.preventDefault(); }, { passive: false });
  box.addEventListener('contextmenu', e => { if (d) e.preventDefault(); });
}
const moveItem = (arr, from, to) => { const [x] = arr.splice(from, 1); arr.splice(to, 0, x); return x; };

// ---------- ほかの画面でデータが変わったら描き直す ----------
function onDataChange(cb) {
  let t = null;
  const later = () => { clearTimeout(t); t = setTimeout(cb, 80); };
  window.addEventListener('storage', e => { if (!e.key || /^(task-app|morning|plan|habits|night|pet|body|food|dance):/.test(e.key)) later(); });
  window.addEventListener('message', e => { if (e.origin === location.origin && e.data && e.data.type === 'refresh') later(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) later(); });
  setInterval(cb, 60000);
}
