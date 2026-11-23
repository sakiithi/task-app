// ☁️ 同期（Supabase）。index.html だけが読み込む。
// - localStorage のアプリのデータ（下の SYNC_RE に合うもの）を、ログインした人専用の行（public.kv）に保存する
// - 同じキーを両方で変えたときは、あとから変えたほう（client_at が新しいほう）が勝つ
// - 初めてその端末で同期するときだけ、配列（id つき）と日付ごとのデータは「まぜる」
// - ほかの画面（iframe）の書き込みは storage イベントで気づく
// - Supabase の公開用の鍵（publishable）は、アプリに入れてよい種類の鍵
(() => {
  const URL_ = 'https://tzbqsudphypzvjbuoyrz.supabase.co';
  const KEY_ = 'sb_publishable_Ue1rb78TVjAOhf59ssBylg_SDywtSps';
  const SYNC_RE = /^(task-app|morning|plan|habits|night|pet|body|food|dance):/;
  const EXCLUDE = new Set(['morning:weather', 'body:view', 'body:range', 'task-app:backupNag']);
  const AUTH = 'sync:auth', META = 'sync:meta', STATE = 'sync:state';
  const ls = window.localStorage;
  const rawSet = Storage.prototype.setItem, rawRemove = Storage.prototype.removeItem;
  const jget = (k, d) => { try { const v = JSON.parse(ls.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const jset = (k, v) => rawSet.call(ls, k, JSON.stringify(v));
  const synced = k => SYNC_RE.test(k) && !EXCLUDE.has(k);

  let dirty = new Set(jget('sync:dirty', []));
  let applying = false, timer = null, busy = false, lastError = '';
  const listeners = [];
  const saveDirty = () => jset('sync:dirty', [...dirty]);
  function markDirty(k) {
    if (!k || !synced(k)) return;
    const meta = jget(META, {}); meta[k] = Date.now(); jset(META, meta);
    dirty.add(k); saveDirty();
    schedule();
  }
  // この画面の書き込み
  Storage.prototype.setItem = function (k, v) { rawSet.call(this, k, v); if (this === ls && !applying) markDirty(k); };
  Storage.prototype.removeItem = function (k) { rawRemove.call(this, k); if (this === ls && !applying) markDirty(k); };
  // ほかの画面（タブの中の朝・今日・夜・からだ）の書き込み
  window.addEventListener('storage', e => { if (e.storageArea === ls && !applying) markDirty(e.key); });

  // ---------- ログイン ----------
  const auth = () => jget(AUTH, null);
  async function authReq(path, body) {
    const r = await fetch(URL_ + '/auth/v1/' + path, { method: 'POST', headers: { apikey: KEY_, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.msg || d.error_description || d.message || ('エラー ' + r.status));
    return d;
  }
  function keepSession(d) {
    jset(AUTH, { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Date.now() + (d.expires_in || 3600) * 1000, email: d.user && d.user.email, user_id: d.user && d.user.id });
  }
  async function token() {
    const a = auth();
    if (!a) return null;
    if (Date.now() < a.expires_at - 60000) return a.access_token;
    try { const d = await authReq('token?grant_type=refresh_token', { refresh_token: a.refresh_token }); keepSession(d); return d.access_token; }
    catch (e) { lastError = 'ログインが切れたよ。もう一度ログインしてね'; rawRemove.call(ls, AUTH); emit(); return null; }
  }
  async function rest(path, opt = {}) {
    const t = await token();
    if (!t) throw new Error('ログインしていないよ');
    const r = await fetch(URL_ + '/rest/v1/' + path, Object.assign({}, opt, { headers: Object.assign({ apikey: KEY_, Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, opt.headers || {}) }));
    if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.message || ('エラー ' + r.status)); }
    return r.status === 204 ? null : r.json().catch(() => null);
  }

  // ---------- まぜる（初めての同期だけ）----------
  function merge(localRaw, remoteRaw) {
    let a, b;
    try { a = JSON.parse(localRaw); b = JSON.parse(remoteRaw); } catch (e) { return remoteRaw; }
    if (Array.isArray(a) && Array.isArray(b) && [...a, ...b].every(x => x && typeof x === 'object' && x.id != null)) {
      const m = new Map(); a.forEach(x => m.set(x.id, x)); b.forEach(x => m.set(x.id, x));
      return JSON.stringify([...m.values()]);
    }
    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) return JSON.stringify(Object.assign({}, a, b));
    return remoteRaw;
  }

  // ---------- 取ってくる・送る ----------
  async function pull() {
    const st = jget(STATE, {}), a = auth();
    const inited = st.user === a.user_id && st.inited;
    const since = inited && st.lastPull ? '&updated_at=gt.' + encodeURIComponent(new Date(st.lastPull - 5000).toISOString()) : '';
    const rows = await rest('kv?select=key,value,client_at,updated_at' + since);
    const meta = jget(META, {}), changed = [];
    let maxT = st.lastPull || 0;
    const remoteKeys = new Set();
    applying = true;
    try {
      for (const r of rows || []) {
        maxT = Math.max(maxT, Date.parse(r.updated_at) || 0);
        remoteKeys.add(r.key);
        if (!synced(r.key)) continue;
        const rt = +r.client_at || 0, lt = meta[r.key] || 0;
        if (dirty.has(r.key) && lt > rt) continue;          // こっちのほうが新しい → あとで送る
        if (!inited && lt === 0 && ls.getItem(r.key) != null && r.value != null) {
          const mixed = merge(ls.getItem(r.key), r.value);
          if (mixed !== ls.getItem(r.key)) { rawSet.call(ls, r.key, mixed); changed.push(r.key); }
          if (mixed !== r.value) { meta[r.key] = Date.now(); dirty.add(r.key); } else meta[r.key] = rt;
          continue;
        }
        if (rt > lt || (!inited && lt === 0)) {
          if (r.value == null) rawRemove.call(ls, r.key); else rawSet.call(ls, r.key, r.value);
          meta[r.key] = rt; dirty.delete(r.key); changed.push(r.key);
        }
      }
    } finally { applying = false; }
    if (!inited) {
      // この端末にだけあるデータは送る
      for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (synced(k) && !remoteKeys.has(k)) { if (!meta[k]) meta[k] = Date.now(); dirty.add(k); } }
    }
    jset(META, meta); saveDirty();
    jset(STATE, Object.assign(st, { user: a.user_id, inited: true, lastPull: maxT }));
    if (changed.length) listeners.forEach(f => { try { f(changed); } catch (e) {} });
    // ほかの画面（iframe）は storage イベントで読み直す。念のため refresh も送る
    if (changed.length) document.querySelectorAll('iframe').forEach(f => { try { f.contentWindow.postMessage({ type: 'refresh' }, location.origin); } catch (e) {} });
  }
  async function push() {
    if (!dirty.size) return;
    const a = auth(), meta = jget(META, {});
    const keys = [...dirty];
    const rows = keys.map(k => ({ user_id: a.user_id, key: k, value: ls.getItem(k), client_at: meta[k] || Date.now() }));
    await rest('kv?on_conflict=user_id,key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows), keepalive: JSON.stringify(rows).length < 60000 });
    keys.forEach(k => { if ((jget(META, {})[k] || 0) <= (meta[k] || 0)) dirty.delete(k); });
    saveDirty();
  }
  async function syncNow() {
    if (!auth() || busy) return;
    busy = true; emit();
    try { await pull(); await push(); lastError = ''; jset('sync:last', Date.now()); }
    catch (e) { lastError = String(e.message || e); }
    finally { busy = false; emit(); }
  }
  function schedule() { clearTimeout(timer); if (auth()) timer = setTimeout(syncNow, 2500); }

  // ---------- 状態 ----------
  const statusListeners = [];
  function emit() { statusListeners.forEach(f => { try { f(status()); } catch (e) {} }); }
  function status() {
    const a = auth();
    return { loggedIn: !!a, email: a && a.email, busy, error: lastError, last: jget('sync:last', null), pending: dirty.size };
  }

  window.Sync = {
    status,
    onStatus: f => statusListeners.push(f),
    onChange: f => listeners.push(f),
    syncNow,
    async login(email, password) {
      const d = await authReq('token?grant_type=password', { email, password });
      keepSession(d); lastError = ''; emit();
      await syncNow();
    },
    async signup(email, password) {
      const d = await authReq('signup?redirect_to=' + encodeURIComponent(location.origin + location.pathname), { email, password });
      if (d.access_token) { keepSession(d); emit(); await syncNow(); return 'in'; }
      return 'confirm';   // 確認メールを送った
    },
    logout() { rawRemove.call(ls, AUTH); rawRemove.call(ls, STATE); emit(); }
  };

  // 確認メールのリンクから開いたとき（#access_token=... がついている）は、そのままログインする
  if (/access_token=/.test(location.hash)) {
    const p = new URLSearchParams(location.hash.slice(1));
    history.replaceState(null, '', location.pathname + location.search);
    const at = p.get('access_token');
    fetch(URL_ + '/auth/v1/user', { headers: { apikey: KEY_, Authorization: 'Bearer ' + at } })
      .then(r => r.json()).then(user => {
        if (!user || !user.id) return;
        keepSession({ access_token: at, refresh_token: p.get('refresh_token'), expires_in: +p.get('expires_in') || 3600, user });
        emit(); syncNow();
      }).catch(() => {});
  }

  // 起動時・画面に戻ったとき・1分ごと
  document.addEventListener('visibilitychange', () => { if (document.hidden) { if (dirty.size) syncNow(); } else syncNow(); });
  setInterval(syncNow, 60000);
  setTimeout(syncNow, 800);
})();
