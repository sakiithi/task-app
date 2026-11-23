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
  if (!Array.isArray(h)) { h = DEFAULT_HABITS.map(([emoji, name]) => ({ id: uid(), emoji, name })); store('habits:list', h); }
  return h;
}
const getChecks = () => load('habits:checks', {});
function habitStreak(id, checks) {
  let n = 0, i = (checks[today()] || []).includes(id) ? 0 : 1;
  while ((checks[keyOf(-i)] || []).includes(id)) { n++; i++; }
  return n;
}

// ---------- 育てるキャラ ----------
// ポイント：タスク完了10・朝のルーティーン30（全部できたら+20）・習慣5・夜のふりかえり20・今日の3つ達成30・体重の記録5・ごはんの記録5（1日1回）
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

// ---------- ほかの画面でデータが変わったら描き直す ----------
function onDataChange(cb) {
  let t = null;
  const later = () => { clearTimeout(t); t = setTimeout(cb, 80); };
  window.addEventListener('storage', e => { if (!e.key || /^(task-app|morning|plan|habits|night|pet|body|food):/.test(e.key)) later(); });
  window.addEventListener('message', e => { if (e.origin === location.origin && e.data && e.data.type === 'refresh') later(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) later(); });
  setInterval(cb, 60000);
}
