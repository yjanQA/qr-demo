// ============================================================
// auth.js — 로그인 / 회원가입 / 마스터 승인 (사내 접근 제어)
//  · 이메일을 아이디로 사용, @woosung.kr 도메인만 가입 가능
//  · 신규 가입은 '승인 대기' → 마스터가 승인해야 로그인 가능
//  · 저장: localStorage(rm_auth_users) — 동기화 서버 사용 시 기기 간 공유
//  · 정적 웹앱 특성상 '사내 접근 제어' 수준의 보안입니다(은행급 아님)
// ============================================================

const Auth = (() => {
  const USERS_KEY   = 'rm_auth_users';
  const SESSION_KEY = 'rm_auth_session';
  const SAVED_EMAIL_KEY = 'rm_auth_saved_email';   // '아이디 저장'
  const DOMAIN      = 'woosung.kr';
  const MASTER_EMAIL = 'demo@woosung.kr';

  const savedEmail = () => { try { return localStorage.getItem(SAVED_EMAIL_KEY) || ''; } catch (_) { return ''; } };

  // 접근 권한 단위 = 워크스페이스(상단 업무영역). app.js workspaces와 일치
  const WORKSPACES = [
    { id: 'qr',      label: '입고·재고 QR' },
    { id: 'quality', label: '품질·실험실' },
    { id: 'formula', label: '배합비·생산' },
    { id: 'trace',   label: '추적·클레임' },
    { id: 'admin',   label: '관리' },
    { id: 'smart',   label: '스마트제조' },
    { id: 'haccp',   label: '인증관리' },
  ];
  const ALL_WS = WORKSPACES.map(w => w.id);
  // 사용자의 허용 워크스페이스: 마스터=전체, allowedWorkspaces 미설정(null)=전체(하위호환)
  const allowedFor = (u) => {
    if (!u) return [];
    if (u.role === 'MASTER') return ALL_WS.slice();
    return Array.isArray(u.allowedWorkspaces) ? u.allowedWorkspaces : ALL_WS.slice();
  };
  const allowedSet = () => new Set(allowedFor(currentUser()));

  // ── SHA-256 (공용/오프라인·사내망 http 환경에서도 동작하도록 순수 JS) ──
  const sha256 = function (ascii) {
    function rightRotate(value, amount) { return (value >>> amount) | (value << (32 - amount)); }
    const mathPow = Math.pow, maxWord = mathPow(2, 32);
    let i, j, result = '';
    const words = [];
    const asciiBitLength = ascii.length * 8;
    let hash = sha256.h = sha256.h || [];
    const k = sha256.k = sha256.k || [];
    let primeCounter = k.length;
    const isComposite = {};
    for (let candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (i = 0; i < 313; i += candidate) isComposite[i] = candidate;
        hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    ascii += '\x80';
    while (ascii.length % 64 - 56) ascii += '\x00';
    for (i = 0; i < ascii.length; i++) {
      j = ascii.charCodeAt(i);
      if (j >> 8) return '';
      words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words.length] = (asciiBitLength / maxWord) | 0;
    words[words.length] = asciiBitLength;
    for (j = 0; j < words.length;) {
      const w = words.slice(j, j += 16);
      const oldHash = hash;
      hash = hash.slice(0, 8);
      for (i = 0; i < 64; i++) {
        const w15 = w[i - 15], w2 = w[i - 2];
        const a = hash[0], e = hash[4];
        const temp1 = hash[7]
          + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
          + ((e & hash[5]) ^ ((~e) & hash[6]))
          + k[i]
          + (w[i] = (i < 16) ? w[i] : (
              w[i - 16]
              + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
              + w[i - 7]
              + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
            ) | 0);
        const temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
          + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(temp1 + temp2) | 0].concat(hash);
        hash[4] = (hash[4] + temp1) | 0;
      }
      for (i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
    }
    for (i = 0; i < 8; i++)
      for (j = 3; j + 1; j--) {
        const b = (hash[i] >> (j * 8)) & 255;
        result += ((b < 16) ? 0 : '') + b.toString(16);
      }
    return result;
  };
  const utf8 = (str) => unescape(encodeURIComponent(String(str)));
  const hashPw = (salt, pw) => sha256(utf8(salt + ':' + pw));
  const genSalt = () => {
    try {
      const a = new Uint8Array(16);
      (window.crypto || {}).getRandomValues?.(a);
      if (a.some(x => x)) return Array.from(a).map(x => x.toString(16).padStart(2, '0')).join('');
    } catch (_) {}
    return (Date.now().toString(36) + Math.random().toString(36).slice(2)).padEnd(24, '0');
  };

  // ── 저장 계층(동기화 훅 호출) ──
  const readUsers  = () => { try { return JSON.parse(localStorage.getItem(USERS_KEY) || '[]'); } catch (_) { return []; } };
  const writeUsers = (list) => {
    localStorage.setItem(USERS_KEY, JSON.stringify(list));
    try { if (window.__onDbWrite) window.__onDbWrite(USERS_KEY); } catch (_) {}
  };

  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const normEmail = (e) => String(e || '').trim().toLowerCase();
  const validDomain = (e) => normEmail(e).endsWith('@' + DOMAIN);
  const findUser = (email) => readUsers().find(u => u.id === normEmail(email));

  const appRef = () => (typeof App !== 'undefined' && App) ? App : null;
  const toast = (m, t) => { const A = appRef(); if (A && A.toast) { try { return A.toast(m, t); } catch (_) {} } };

  // ── 마스터 계정 시드(최초 비밀번호는 첫 로그인 때 본인 설정) ──
  const ensureSeed = () => {
    const users = readUsers();
    if (!users.some(u => u.id === MASTER_EMAIL)) {
      users.push({
        id: MASTER_EMAIL, email: MASTER_EMAIL, name: '마스터',
        role: 'MASTER', status: 'APPROVED',
        salt: '', passwordHash: null,      // null = 최초 비밀번호 미설정
        createdAt: new Date().toISOString(), approvedAt: new Date().toISOString(), approvedBy: 'SYSTEM'
      });
      writeUsers(users);
    }
  };

  // ── 세션 ──
  const setSession = (email) => localStorage.setItem(SESSION_KEY, JSON.stringify({ email: normEmail(email), ts: Date.now() }));
  const clearSession = () => localStorage.removeItem(SESSION_KEY);
  const sessionEmail = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')?.email || null; } catch (_) { return null; } };
  const currentUser = () => { const e = sessionEmail(); return e ? findUser(e) : null; };
  const isMaster = () => currentUser()?.role === 'MASTER';
  // 현재 로그인 사용자 이름/이메일 — 접수·수정 등 모든 작업의 작성자 자동기록용
  const currentName = () => {
    const u = currentUser();
    const nm = (u && (u.name || '').trim()) || '';
    if (nm) return nm;
    const e = sessionEmail();
    return e ? e.split('@')[0] : '';
  };
  const currentEmail = () => sessionEmail() || '';

  // ============================================================
  // 로그인 화면(전체 오버레이)
  // ============================================================
  let mode = 'login'; // 'login' | 'signup'

  const showLogin = () => {
    document.body.classList.add('auth-locked');
    let ov = document.getElementById('auth-overlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'auth-overlay';
      document.body.appendChild(ov);
    }
    renderLogin();
  };
  const hideLogin = () => {
    document.getElementById('auth-overlay')?.remove();
    document.body.classList.remove('auth-locked');
  };

  const renderLogin = () => {
    const ov = document.getElementById('auth-overlay');
    if (!ov) return;
    const isSignup = mode === 'signup';
    ov.innerHTML = `
      <div class="auth-card">
        <div class="auth-brand">
          <div class="auth-logo">🏭</div>
          <div>
            <div class="auth-title">우성사료 QR 이력관리</div>
            <div class="auth-sub">데모 체험판 · demo@woosung.kr 로 로그인 (비밀번호는 처음 입력값으로 설정)</div>
          </div>
        </div>

        <div class="auth-tabs">
          <button class="auth-tab ${!isSignup ? 'active' : ''}" onclick="Auth.setMode('login')">로그인</button>
          <button class="auth-tab ${isSignup ? 'active' : ''}" onclick="Auth.setMode('signup')">회원가입</button>
        </div>

        ${isSignup ? `
          <div class="form-group">
            <label class="form-label">이름</label>
            <input type="text" class="form-input" id="auth-name" placeholder="홍길동" autocomplete="name">
          </div>
          <div class="form-group">
            <label class="form-label">이메일 (아이디)</label>
            <input type="email" class="form-input" id="auth-email" placeholder="name@${DOMAIN}" autocomplete="username">
            <div class="form-hint">@${DOMAIN} 이메일만 가입할 수 있습니다</div>
          </div>
          <div class="form-group">
            <label class="form-label">비밀번호</label>
            <input type="password" class="form-input" id="auth-pw" placeholder="6자 이상" autocomplete="new-password">
          </div>
          <div class="form-group">
            <label class="form-label">비밀번호 확인</label>
            <input type="password" class="form-input" id="auth-pw2" placeholder="비밀번호 재입력" autocomplete="new-password"
                   onkeydown="if(event.key==='Enter')Auth.doSignup()">
          </div>
          <div class="auth-msg" id="auth-msg"></div>
          <button class="btn btn-primary btn-block" onclick="Auth.doSignup()">가입 신청</button>
          <div class="auth-foot">가입 신청 후 <b>마스터 승인</b>을 받아야 로그인할 수 있습니다.</div>
        ` : `
          <div class="form-group">
            <label class="form-label">이메일 (아이디)</label>
            <input type="email" class="form-input" id="auth-email" placeholder="name@${DOMAIN}" autocomplete="username" value="${esc(savedEmail())}"
                   oninput="Auth.onEmailInput(this.value)">
          </div>
          <div class="form-group">
            <label class="form-label">비밀번호</label>
            <input type="password" class="form-input" id="auth-pw" placeholder="비밀번호" autocomplete="current-password"
                   onkeydown="if(event.key==='Enter')Auth.doLogin()">
          </div>
          <label class="auth-remember">
            <input type="checkbox" id="auth-remember" ${savedEmail() ? 'checked' : ''} onchange="Auth.rememberToggle(this.checked)">
            <span>아이디 저장</span>
          </label>
          <div class="auth-msg" id="auth-msg"></div>
          <button class="btn btn-primary btn-block" onclick="Auth.doLogin()">로그인</button>
        `}
      </div>`;
    // 저장된 아이디가 있으면 비밀번호로 바로 포커스, 없으면 이메일/이름
    setTimeout(() => {
      const el = (mode === 'login' && savedEmail()) ? ov.querySelector('#auth-pw') : ov.querySelector('#auth-email, #auth-name');
      el?.focus();
    }, 30);
  };

  const setMode = (m) => { mode = m; renderLogin(); };
  const setMsg = (html, type = 'error') => { const el = document.getElementById('auth-msg'); if (el) { el.className = `auth-msg ${type}`; el.innerHTML = html; } };

  const doSignup = () => {
    const name = document.getElementById('auth-name')?.value.trim();
    const email = normEmail(document.getElementById('auth-email')?.value);
    const pw = document.getElementById('auth-pw')?.value || '';
    const pw2 = document.getElementById('auth-pw2')?.value || '';
    if (!name) return setMsg('이름을 입력하세요');
    if (!email) return setMsg('이메일을 입력하세요');
    if (!validDomain(email)) return setMsg(`@${DOMAIN} 이메일만 가입할 수 있습니다`);
    if (pw.length < 6) return setMsg('비밀번호는 6자 이상이어야 합니다');
    if (pw !== pw2) return setMsg('비밀번호가 일치하지 않습니다');
    const users = readUsers();
    if (users.some(u => u.id === email)) return setMsg('이미 등록되었거나 신청된 이메일입니다');
    const salt = genSalt();
    users.push({
      id: email, email, name,
      role: 'USER', status: 'PENDING',
      salt, passwordHash: hashPw(salt, pw),
      createdAt: new Date().toISOString(), approvedAt: '', approvedBy: ''
    });
    writeUsers(users);
    mode = 'login';
    renderLogin();
    setMsg('가입 신청이 접수되었습니다. 마스터 승인 후 로그인할 수 있습니다.', 'ok');
  };

  const doLogin = () => {
    const email = normEmail(document.getElementById('auth-email')?.value);
    const pw = document.getElementById('auth-pw')?.value || '';
    if (!email || !pw) return setMsg('이메일과 비밀번호를 입력하세요');
    const user = findUser(email);
    if (!user) return setMsg('등록되지 않은 계정입니다');
    if (user.status === 'PENDING')  return setMsg('승인 대기 중인 계정입니다. 마스터 승인 후 로그인하세요.');
    if (user.status === 'REJECTED') return setMsg('가입이 거절된 계정입니다. 관리자에게 문의하세요.');

    // 마스터 최초 로그인: 입력한 비밀번호로 설정
    if (user.passwordHash == null) {
      if (pw.length < 6) return setMsg('최초 비밀번호는 6자 이상으로 설정하세요');
      const users = readUsers();
      const u = users.find(x => x.id === email);
      u.salt = genSalt(); u.passwordHash = hashPw(u.salt, pw);
      writeUsers(users);
      rememberEmail(email);
      setSession(email);
      toast('마스터 비밀번호가 설정되었습니다', 'success');
      return enterApp();
    }
    if (hashPw(user.salt, pw) !== user.passwordHash) return setMsg('비밀번호가 일치하지 않습니다');
    rememberEmail(email);   // 로그인 성공 시에만 아이디 저장/해제
    setSession(email);
    enterApp();
  };

  // '아이디 저장' 체크 상태에 따라 이메일 저장/해제 (로그인 성공 시에도 호출)
  const rememberEmail = (email) => {
    try {
      if (document.getElementById('auth-remember')?.checked) localStorage.setItem(SAVED_EMAIL_KEY, normEmail(email) || '');
      else localStorage.removeItem(SAVED_EMAIL_KEY);
    } catch (_) {}
  };

  // 체크박스를 켜는 즉시 현재 입력한 아이디를 저장한다(로그인 성공을 기다리지 않음).
  //   → 비밀번호를 틀리거나 승인 대기 상태여도 아이디는 유지된다.
  const rememberToggle = (checked) => {
    try {
      const email = normEmail(document.getElementById('auth-email')?.value);
      if (checked && email) localStorage.setItem(SAVED_EMAIL_KEY, email);
      else if (!checked) localStorage.removeItem(SAVED_EMAIL_KEY);
    } catch (_) {}
  };

  // 체크된 상태에서 아이디를 고치면 저장값도 실시간 갱신한다.
  const onEmailInput = (val) => {
    try {
      if (!document.getElementById('auth-remember')?.checked) return;
      const email = normEmail(val);
      if (email) localStorage.setItem(SAVED_EMAIL_KEY, email);
      else localStorage.removeItem(SAVED_EMAIL_KEY);
    } catch (_) {}
  };

  // ── 접근 권한 적용(탭·메뉴 숨김 + 네비게이션 가드) ──
  const applyPermissions = () => {
    const set = allowedSet();
    // 상단 워크스페이스 탭 숨김
    document.querySelectorAll('.workspace-tab[data-workspace]').forEach(el => {
      el.style.display = set.has(el.dataset.workspace) ? '' : 'none';
    });
    // 사이드바 나브 그룹/아이템 중 비허용 워크스페이스는 숨김(AI는 항상 표시되므로 특히 필요)
    document.querySelectorAll('.sidebar-nav [data-workspace]').forEach(el => {
      if (!set.has(el.dataset.workspace)) el.style.setProperty('display', 'none', 'important');
      else el.style.removeProperty('display');
    });
    // 현재 워크스페이스가 비허용이면 허용된 첫 영역으로 이동
    try {
      const A = appRef();
      const cur = A && A.getWorkspace ? A.getWorkspace() : null;
      if (A && cur && !set.has(cur)) {
        const first = ALL_WS.find(w => set.has(w));
        if (first && A.switchWorkspace) A.switchWorkspace(first);
      } else if (A && A.updateWorkspaceUI) {
        A.updateWorkspaceUI();
      }
    } catch (_) {}
  };

  const installGuards = () => {
    const App = appRef();
    if (!App || App.__authGuarded) return;
    const origNav = App.navigate;
    App.navigate = function (page, ...a) {
      const ws = App.pageWorkspace ? App.pageWorkspace(page) : null;
      if (ws && !allowedSet().has(ws)) { toast('접근 권한이 없는 메뉴입니다', 'warning'); return; }
      return origNav.call(App, page, ...a);
    };
    const origSw = App.switchWorkspace;
    App.switchWorkspace = function (ws) {
      if (ws && !allowedSet().has(ws)) { toast('접근 권한이 없는 영역입니다', 'warning'); return; }
      return origSw.call(App, ws);
    };
    App.__authGuarded = true;
  };

  const activateSession = () => { installGuards(); injectTopbar(); applyPermissions(); };

  const enterApp = () => {
    hideLogin();
    activateSession();
    toast(`${currentUser()?.name || currentUser()?.email} 님 로그인`, 'success');
  };

  const logout = () => {
    clearSession();
    location.reload();
  };

  // ============================================================
  // 상단바 사용자 영역 주입
  // ============================================================
  const injectTopbar = () => {
    const actions = document.querySelector('.topbar-actions');
    if (!actions || document.getElementById('auth-user-area')) return;
    const u = currentUser();
    if (!u) return;
    const master = u.role === 'MASTER';
    const pending = master ? readUsers().filter(x => x.status === 'PENDING').length : 0;
    const wrap = document.createElement('div');
    wrap.id = 'auth-user-area';
    wrap.className = 'auth-user-area';
    wrap.innerHTML = `
      ${master ? `<button class="btn btn-outline-primary btn-sm" onclick="Auth.openAdmin()">
        👥 사용자 관리${pending ? ` <span class="auth-pending-badge">${pending}</span>` : ''}
      </button>` : ''}
      <span class="auth-user-chip" title="${esc(u.email)}">
        ${master ? '👑 ' : ''}${esc(u.name || u.email)}
      </span>
      <button class="btn btn-ghost btn-sm" onclick="Auth.logout()">로그아웃</button>`;
    actions.appendChild(wrap);
  };

  const refreshTopbar = () => { document.getElementById('auth-user-area')?.remove(); injectTopbar(); };

  // ============================================================
  // 마스터 전용 사용자 관리
  // ============================================================
  const openAdmin = () => {
    if (!isMaster()) return toast('마스터 권한이 필요합니다', 'error');
    let modal = document.getElementById('auth-admin-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'auth-admin-modal';
      modal.className = 'modal-overlay';
      modal.innerHTML = `<div class="modal modal-lg">
        <div class="modal-header">
          <div class="modal-title">👥 사용자 관리</div>
          <button class="modal-close" onclick="Auth.closeAdmin()">✕</button>
        </div>
        <div id="auth-admin-body"></div>
      </div>`;
      document.body.appendChild(modal);
    }
    renderAdmin();
    modal.classList.add('open');
  };
  const closeAdmin = () => document.getElementById('auth-admin-modal')?.classList.remove('open');

  const STATUS_LABEL = { PENDING: '승인 대기', APPROVED: '승인됨', REJECTED: '거절됨' };

  // 사용자의 접근 가능 영역 요약 문자열
  const accessSummary = (u) => {
    if (!Array.isArray(u.allowedWorkspaces)) return '<span class="text-success">전체</span>';
    if (u.allowedWorkspaces.length === 0) return '<span class="text-danger">없음</span>';
    if (u.allowedWorkspaces.length === ALL_WS.length) return '<span class="text-success">전체</span>';
    const labels = WORKSPACES.filter(w => u.allowedWorkspaces.includes(w.id)).map(w => w.label);
    return `<span class="text-muted">${labels.join(' · ')}</span>`;
  };

  // 접근 권한 편집 모달(워크스페이스 체크박스)
  let permTargetId = null;
  const openPerms = (id) => {
    if (!isMaster()) return toast('마스터 권한이 필요합니다', 'error');
    const u = findUser(id);
    if (!u) return;
    permTargetId = id;
    const allowed = new Set(allowedFor(u));
    let modal = document.getElementById('auth-perm-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'auth-perm-modal';
      modal.className = 'modal-overlay';
      document.body.appendChild(modal);
    }
    modal.innerHTML = `<div class="modal">
      <div class="modal-header">
        <div class="modal-title">🔑 접근 권한 · ${esc(u.name || u.email)}</div>
        <button class="modal-close" onclick="Auth.closePerms()">✕</button>
      </div>
      <div style="padding:16px;display:flex;flex-direction:column;gap:12px">
        <div class="text-xs text-muted">이 사용자가 <b>볼 수 있는 업무영역</b>만 체크하세요. 체크 해제된 영역은 메뉴에서 숨겨지고 접근이 차단됩니다.</div>
        <div class="auth-perm-grid">
          ${WORKSPACES.map(w => `
            <label class="auth-perm-item">
              <input type="checkbox" class="auth-perm-cb" value="${w.id}" ${allowed.has(w.id) ? 'checked' : ''}>
              <span>${esc(w.label)}</span>
            </label>`).join('')}
        </div>
        <div class="flex gap-8">
          <button class="btn btn-ghost btn-sm" onclick="Auth.permAll(true)">전체 선택</button>
          <button class="btn btn-ghost btn-sm" onclick="Auth.permAll(false)">전체 해제</button>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="Auth.closePerms()">취소</button>
          <button class="btn btn-primary" onclick="Auth.savePerms()">권한 저장</button>
        </div>
      </div>
    </div>`;
    modal.classList.add('open');
  };
  const closePerms = () => document.getElementById('auth-perm-modal')?.classList.remove('open');
  const permAll = (on) => document.querySelectorAll('#auth-perm-modal .auth-perm-cb').forEach(cb => { cb.checked = on; });
  const savePerms = () => {
    if (!permTargetId) return;
    const sel = [...document.querySelectorAll('#auth-perm-modal .auth-perm-cb:checked')].map(cb => cb.value);
    if (sel.length === 0) return toast('최소 1개 영역은 허용해야 합니다', 'warning');
    mutate(permTargetId, u => { u.allowedWorkspaces = sel; });
    toast('접근 권한을 저장했습니다', 'success');
    closePerms();
  };

  const renderAdmin = () => {
    const body = document.getElementById('auth-admin-body');
    if (!body) return;
    const users = readUsers().slice().sort((a, b) => (a.status === 'PENDING' ? -1 : 0) - (b.status === 'PENDING' ? -1 : 0));
    const me = currentUser()?.id;
    const groups = ['PENDING', 'APPROVED', 'REJECTED'];
    const section = (st) => {
      const list = users.filter(u => u.status === st);
      if (!list.length) return '';
      return `
        <div class="auth-admin-group">
          <div class="auth-admin-group-title">${STATUS_LABEL[st]} (${list.length})</div>
          ${list.map(u => `
            <div class="auth-admin-row">
              <div class="auth-admin-info">
                <div class="font-bold text-sm">${u.role === 'MASTER' ? '👑 ' : ''}${esc(u.name || '-')} ${u.id === me ? '<span class="text-muted">(나)</span>' : ''}</div>
                <div class="text-xs text-muted td-mono">${esc(u.email)} · ${esc((u.createdAt || '').slice(0, 10))}</div>
                ${st === 'APPROVED' && u.role !== 'MASTER' ? `<div class="text-xs" style="margin-top:2px">접근: ${accessSummary(u)}</div>` : ''}
              </div>
              <div class="auth-admin-actions">
                ${st === 'PENDING' ? `
                  <button class="btn btn-success btn-xs" onclick="Auth.approve('${esc(u.id)}')">승인</button>
                  <button class="btn btn-danger btn-xs" onclick="Auth.reject('${esc(u.id)}')">거절</button>` : ''}
                ${st === 'APPROVED' && u.id !== me ? `
                  ${u.role !== 'MASTER' ? `<button class="btn btn-ghost btn-xs" onclick="Auth.openPerms('${esc(u.id)}')">🔑 접근 권한</button>` : ''}
                  ${u.role !== 'MASTER' ? `<button class="btn btn-outline-primary btn-xs" onclick="Auth.transferMaster('${esc(u.id)}')">👑 권한 이양</button>` : ''}
                  <button class="btn btn-ghost btn-xs" onclick="Auth.toggleRole('${esc(u.id)}')">${u.role === 'MASTER' ? '마스터 해제' : '마스터 지정'}</button>
                  <button class="btn btn-danger btn-xs" onclick="Auth.reject('${esc(u.id)}')">차단</button>` : ''}
                ${st === 'REJECTED' ? `
                  <button class="btn btn-success btn-xs" onclick="Auth.approve('${esc(u.id)}')">승인</button>
                  <button class="btn btn-danger btn-xs" onclick="Auth.removeUser('${esc(u.id)}')">삭제</button>` : ''}
              </div>
            </div>`).join('')}
        </div>`;
    };
    body.innerHTML = `
      <div style="padding:16px;display:flex;flex-direction:column;gap:14px">
        <div class="info-box info-blue">
          가입은 <b>@${DOMAIN}</b> 이메일만 가능하며, 신규 신청은 여기서 <b>승인</b>해야 로그인됩니다.<br>
          <span class="text-muted" style="font-size:11px">· <b>마스터 지정</b>: 공동 마스터 추가 · <b>권한 이양</b>: 상대를 마스터로 넘기고 본인은 일반 사용자로 전환</span>
        </div>
        ${groups.map(section).join('') || '<div class="text-muted">사용자가 없습니다</div>'}
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="Auth.closeAdmin()">닫기</button>
        </div>
      </div>`;
  };

  const mutate = (id, fn) => {
    const users = readUsers();
    const u = users.find(x => x.id === id);
    if (!u) return;
    fn(u);
    writeUsers(users);
    renderAdmin();
    refreshTopbar();
  };
  const approve = (id) => mutate(id, u => { u.status = 'APPROVED'; u.approvedAt = new Date().toISOString(); u.approvedBy = currentUser()?.email || ''; toast(`${u.name || u.email} 승인 완료`, 'success'); });
  const reject  = (id) => mutate(id, u => { u.status = 'REJECTED'; toast(`${u.name || u.email} 거절/차단`, 'warning'); });
  const toggleRole = (id) => mutate(id, u => { u.role = u.role === 'MASTER' ? 'USER' : 'MASTER'; toast(`권한 변경: ${u.role}`, 'success'); });

  // 마스터 권한 이양: 대상 → MASTER, 본인 → USER (단독 이양)
  const transferMaster = (id) => {
    if (!isMaster()) return toast('마스터 권한이 필요합니다', 'error');
    const me = currentUser();
    const users = readUsers();
    const target = users.find(u => u.id === id);
    if (!target) return;
    if (target.id === me.id) return toast('본인에게는 이양할 수 없습니다', 'warning');
    if (target.status !== 'APPROVED') return toast('승인된 사용자에게만 이양할 수 있습니다', 'warning');
    if (!confirm(`마스터 권한을 '${target.name || target.email}' 님에게 이양합니다.\n이양 후 회원님은 일반 사용자로 전환되어 사용자 관리 권한이 사라집니다.\n계속하시겠습니까?`)) return;
    target.role = 'MASTER'; target.status = 'APPROVED';
    const meRec = users.find(u => u.id === me.id);
    if (meRec) meRec.role = 'USER';
    writeUsers(users);
    toast(`마스터 권한을 ${target.name || target.email} 님에게 이양했습니다`, 'success');
    closeAdmin();
    refreshTopbar();
  };
  const removeUser = (id) => { if (!confirm('이 계정을 완전히 삭제할까요?')) return; writeUsers(readUsers().filter(u => u.id !== id)); renderAdmin(); refreshTopbar(); };

  // ============================================================
  const init = () => {
    ensureSeed();
    const u = currentUser();
    if (u && u.status === 'APPROVED') { hideLogin(); activateSession(); }
    else { clearSession(); showLogin(); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  return {
    init, setMode, doLogin, doSignup, logout, rememberToggle, onEmailInput,
    openAdmin, closeAdmin, approve, reject, toggleRole, transferMaster, removeUser,
    openPerms, closePerms, permAll, savePerms,
    enforceLanding: applyPermissions,
    currentUser, isMaster, currentName, currentEmail,
    _sha256: sha256, _hashPw: hashPw   // 검증용
  };
})();
