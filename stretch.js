// 🧘 ストレッチ（ALA美脚学校の動物メニュー）を毎日のプログラムにする部品
// dance・today・night・morning から読み込む。データは localStorage の 'dance:stretch'
//   { pos: 次にやる日の番号, cycle: 何周目, log: { 'YYYY-MM-DD': { idx, menu, am, pm, mini, rest, adv, memo } }, edits: { メニューid: {e,n,num,dur,memo} } }
// 講座のカレンダーと同じ順番：章ごとのステージで、新しい動物メニューを順番にくり返す。
// 日付ではなく「やった日」で1つ進むので、休んでも続きから。
const STR_KEY = 'dance:stretch';
// id: [絵文字, 名前]
const STR_ANIMALS = {
  nezumi: ['🐭', 'ねずみ'], ushi: ['🐮', '牛'], tora: ['🐯', '虎'], usagi: ['🐰', 'うさぎ'], tatsu: ['🐲', '竜'], hebi: ['🐍', '蛇'], uma: ['🐴', '馬'], hitsuji: ['🐑', 'ひつじ'],
  inu: ['🐶', '犬'], inoshishi: ['🐗', 'いのしし'], hiyoko: ['🐤', 'ひよこ'], neko: ['🐱', 'ねこ'], saru: ['🐵', 'さる'], niwatori: ['🐔', 'にわとり'],
  shironeko: ['🐈', '白ねこ'], hamu1: ['🐹', 'ハムスター'], morumotto: ['🐁', 'モルモット'], momonga: ['🐿️', 'モモンガ'], tanuki: ['🦝', 'たぬき'], kuma: ['🐻', 'くま'], rakko: ['🦦', 'ラッコ'],
  koara: ['🐨', 'コアラ'], azarashi: ['🦭', 'アザラシ'], arupaka: ['🦙', 'アルパカ'], kapibara: ['🦫', 'カピバラ'], shirokuma: ['🐻‍❄️', '白くま'],
  shika: ['🦌', 'シカ'], hamu2: ['🐹', 'ハムスター'], kangaru: ['🦘', 'カンガルー'], kurokuma: ['🐻', '黒くま'], zou: ['🐘', 'ゾウ'], chita: ['🐆', 'チーター'], pegasasu: ['🦄', 'ペガサス'], panda: ['🐼', 'パンダ'],
  pengin: ['🐧', 'ペンギン'], shimauma: ['🦓', 'シマウマ'], sai: ['🦏', 'サイ'], yagi: ['🐐', 'ヤギ'], fukuro: ['🦉', 'フクロウ'], furamingo: ['🦩', 'フラミンゴ'],
};
// わかっている動画の長さ（iCap・写真アプリで同じ）
const STR_DUR = { chita: '10:52', pegasasu: '29:21', panda: '33:58', pengin: '16:44', shimauma: '14:13' };
// days：カレンダーで何日ぶんか（その間メニューを順番にくり返す）
const STR_STAGES = [
  { ch: '第1・2章', search: '第1章', theme: '', days: 8, menus: ['nezumi', 'ushi', 'tora', 'usagi', 'tatsu', 'hebi', 'uma', 'hitsuji'] },
  { ch: '第3章', search: '第3章', theme: '', days: 12, menus: ['inu', 'inoshishi', 'hiyoko', 'neko', 'saru', 'niwatori'] },
  { ch: '第4章', search: '第4章', theme: '', days: 21, menus: ['shironeko', 'hamu1', 'morumotto', 'momonga', 'tanuki', 'kuma', 'rakko'] },
  { ch: '第5章', search: '第5章', theme: '', days: 14, menus: ['koara', 'azarashi', 'arupaka', 'kapibara', 'shirokuma'] },
  { ch: '第6章', search: '第6章', theme: '胸郭・肩甲骨', days: 21, menus: ['shika', 'hamu2', 'kangaru', 'kurokuma', 'zou', 'chita', 'pegasasu', 'panda'] },
  { ch: '第7章', search: '第7章', theme: '肩関節・頸椎', days: 15, menus: ['pengin', 'shimauma', 'sai', 'yagi', 'fukuro', 'furamingo'] },
];
// 1日ずつの並び [{ st: ステージ番号, m: メニューid }]
const STR_SEQ = (() => {
  const a = [];
  STR_STAGES.forEach((s, st) => { for (let i = 0; i < s.days; i++) a.push({ st, m: s.menus[i % s.menus.length] }); });
  return a;
})();
const strStageStart = st => STR_STAGES.slice(0, st).reduce((a, s) => a + s.days, 0);
const strKeyOf = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function strLoad() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(STR_KEY) || '{}') || {}; } catch (e) {}
  return Object.assign({ pos: 0, cycle: 1, log: {}, edits: {} }, s);
}
function strSave(s) { localStorage.setItem(STR_KEY, JSON.stringify(s)); }
// メニューの中身（自分で直した内容があればそれ）。num は章の中の番号：最初の動物は番号なし、2つめが (001)
function strMenu(id, s) {
  s = s || strLoad();
  const st = STR_STAGES.findIndex(x => x.menus.includes(id)), stage = STR_STAGES[st] || {}, i = (stage.menus || []).indexOf(id);
  const base = { id, e: (STR_ANIMALS[id] || ['🧘'])[0], n: (STR_ANIMALS[id] || ['', id])[1], st, ch: stage.ch, search: stage.search, theme: stage.theme,
    num: st > 0 && i > 0 ? '(' + String(i).padStart(3, '0') + ')' : st > 0 ? '番号なし' : '', dur: STR_DUR[id] || '', memo: '' };
  return Object.assign(base, (s.edits || {})[id] || {});
}
const strDone = e => !!(e && (e.am || e.pm || e.mini));
// その日のメニュー。やった（選んだ）日は記録の中身、まだなら「次の1日」
function strDay(k, s) {
  s = s || strLoad();
  const e = s.log[k] || {};
  const idx = e.idx != null ? e.idx : s.pos;
  const finished = idx >= STR_SEQ.length;
  const sq = STR_SEQ[Math.min(idx, STR_SEQ.length - 1)];
  return { k, idx, finished: finished && !e.menu, entry: e, st: sq.st, menu: strMenu(e.menu || sq.m, s), day: idx + 1, total: STR_SEQ.length };
}
// slot: 'am' | 'pm' | 'mini' | 'rest'
function strMark(k, slot) {
  const s = strLoad(), d = strDay(k, s), e = Object.assign({}, s.log[k] || {});
  const was = strDone(e);
  e[slot] = !e[slot];
  if (slot === 'rest' && e.rest) { delete e.am; delete e.pm; delete e.mini; }
  if (slot !== 'rest' && e[slot]) delete e.rest;
  e.idx = d.idx; e.menu = d.menu.id;
  const now = strDone(e);
  if (!was && now && !e.adv) { s.pos = Math.max(s.pos, d.idx + 1); e.adv = true; }
  if (was && !now && e.adv) { s.pos = d.idx; e.adv = false; }
  if (!now && !e.rest && !e.memo && !e.pick) delete s.log[k]; else s.log[k] = e;
  strSave(s);
  return { first: !was && now, done: now, entry: e };
}
// 7日のうち何日やったか、合計、2回やった日
function strStats(s) {
  s = s || strLoad();
  const ks = Object.keys(s.log).filter(k => strDone(s.log[k]));
  let week = 0; const d = new Date();
  for (let i = 0; i < 7; i++) { const k = strKeyOf(new Date(d.getFullYear(), d.getMonth(), d.getDate() - i)); if (strDone(s.log[k])) week++; }
  return { total: ks.length, week, double: ks.filter(k => s.log[k].am && s.log[k].pm).length };
}
// 朝・夜の画面用の小さいカード（ボタンの data-str に 'am' / 'pm'、くわしくは data-strgo）
function strCardHtml(slot) {
  const d = strDay(strKeyOf()), m = d.menu, e = d.entry, esc2 = x => String(x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  if (d.finished) return `<h3>🧘 今日のストレッチ</h3><p class="muted">プログラムを1周したよ🎉 次の周はダンスの「🧘 ストレッチ」で選んでね</p><button class="pill" data-strgo="1">ひらく →</button>`;
  const on = !!e[slot], other = slot === 'am' ? e.pm : e.am;
  return `<h3>🧘 今日のストレッチ <small class="muted" style="font-size:12px">${d.day}日目</small></h3>
    <div style="display:flex;align-items:center;gap:12px;margin:6px 0 10px"><span style="font-size:40px;line-height:1">${m.e}</span>
      <div style="flex:1;min-width:0"><b style="font-size:17px">${esc2(m.n)}</b><div class="muted" style="font-size:12px">${esc2(m.ch)}${m.num ? ' ' + esc2(m.num) : ''}${m.dur ? ' ・ ' + m.dur : ''}${e.rest ? ' ・ 💤おやすみ' : other ? ` ・ ${slot === 'am' ? '🌙夜' : '☀️朝'}はやった✓` : ''}</div></div></div>
    <div style="display:flex;gap:8px"><button class="pill${on ? ' go' : ''}" data-str="${slot}" style="flex:1">${on ? '✓ ' : ''}${slot === 'am' ? '☀️ 朝やった' : '🌙 夜やった'}</button><button class="pill" data-strgo="1">動画・くわしく →</button></div>`;
}
