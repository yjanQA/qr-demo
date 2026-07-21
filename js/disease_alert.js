// ============================================================
// disease_alert.js — 농림축산식품부 가축질병 위기단계 위젯
// ============================================================

const DiseaseAlert = (() => {
  const MAFRA_URL = 'https://www.mafra.go.kr/FMD-AI2/';
  const CACHE_KEY = 'ws_disease_alert_cache';
  const REFRESH_MS = 10 * 60 * 1000;
  let timer = null;

  const fallback = {
    source: 'OFFICIAL_SNAPSHOT',
    fetchedAt: '2026-06-30T00:00:00.000Z',
    items: [
      { id: 'ai', name: '조류 인플루엔자', shortName: 'AI', icon: '🐔', level: '관심' },
      { id: 'asf', name: '아프리카 돼지열병', shortName: 'ASF', icon: '🐷', level: '심각' },
      { id: 'fmd', name: '구제역', shortName: 'FMD', icon: '🐮', level: '관심' },
      { id: 'lsd', name: '럼피스킨', shortName: 'LSD', icon: '🐮', level: '관심' }
    ]
  };

  const meta = {
    '조류인플루엔자': { id: 'ai', name: '조류 인플루엔자', shortName: 'AI', icon: '🐔' },
    '아프리카돼지열병': { id: 'asf', name: '아프리카 돼지열병', shortName: 'ASF', icon: '🐷' },
    '구제역': { id: 'fmd', name: '구제역', shortName: 'FMD', icon: '🐮' },
    '럼피스킨': { id: 'lsd', name: '럼피스킨', shortName: 'LSD', icon: '🐮' }
  };

  const levelOrder = { 관심: 1, 주의: 2, 심각: 3 };

  const stripTags = (html) => String(html || '')
    .replace(/<br\s*\/?>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, '')
    .trim();

  const normalizeName = (name) => {
    const cleaned = String(name || '').replace(/\s+/g, '');
    if (cleaned.includes('조류') || cleaned.includes('인플루엔자')) return '조류인플루엔자';
    if (cleaned.includes('아프리카') || cleaned.includes('돼지')) return '아프리카돼지열병';
    if (cleaned.includes('구제역')) return '구제역';
    if (cleaned.includes('럼피')) return '럼피스킨';
    return cleaned;
  };

  const parseOfficialHtml = (html) => {
    const items = [];
    const dlRegex = /<dl\b[^>]*class=["'][^"']*icon_level[^"']*["'][^>]*>([\s\S]*?)<\/dl>/gi;
    let match;
    while ((match = dlRegex.exec(html))) {
      const block = match[1];
      const dtMatch = block.match(/<dt[^>]*>([\s\S]*?)<\/dt>/i);
      const key = normalizeName(stripTags(dtMatch?.[1] || ''));
      const info = meta[key];
      if (!info) continue;

      let activeLevel = '';
      const pRegex = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
      let pMatch;
      while ((pMatch = pRegex.exec(block))) {
        const attrs = pMatch[1] || '';
        const level = stripTags(pMatch[2]);
        if (/\bon\b/.test(attrs) && ['관심', '주의', '심각'].includes(level)) {
          activeLevel = level;
          break;
        }
      }
      if (activeLevel) items.push({ ...info, level: activeLevel });
    }

    if (items.length < 4) throw new Error('위기단계 표를 읽지 못했습니다.');
    const order = ['ai', 'asf', 'fmd', 'lsd'];
    return {
      source: 'MAFRA',
      fetchedAt: new Date().toISOString(),
      items: order.map(id => items.find(item => item.id === id)).filter(Boolean)
    };
  };

  const loadCache = () => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  };

  const saveCache = (payload) => {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(payload)); } catch (_) {}
  };

  // 소스별 타임아웃 fetch (한 소스가 느려도 다음으로 빠르게 넘어감)
  const fetchText = async (url, ms = 9000) => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    try {
      const res = await fetch(url, { cache: 'no-store', signal: ctl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } finally { clearTimeout(t); }
  };

  // 위기단계 로드: ① 서버 프록시(/api) → ② 여러 CORS 프록시 → ③ 직접(HTTPS일 때만) 순으로 폴백.
  //   서버 프록시(server.py /api/disease-alert)가 가장 안정적. python -m http.server면 ②로.
  const loadLive = async () => {
    const isHttp = location.protocol === 'http:' || location.protocol === 'https:';
    const enc = encodeURIComponent(MAFRA_URL);
    const sources = [];
    if (isHttp) sources.push({ url: '/api/disease-alert', json: true });        // ① 서버 프록시
    sources.push({ url: `https://api.allorigins.win/raw?url=${enc}` });          // ② CORS 프록시들
    sources.push({ url: `https://corsproxy.io/?url=${enc}` });
    sources.push({ url: `https://api.codetabs.com/v1/proxy/?quest=${MAFRA_URL}` });
    if (location.protocol === 'https:') sources.push({ url: MAFRA_URL });        // ③ 직접(대개 CORS 차단)

    for (const src of sources) {
      try {
        const text = await fetchText(src.url);
        const payload = src.json ? JSON.parse(text) : parseOfficialHtml(text);
        if (src.json && payload.error) throw new Error(payload.error);
        if (!payload.items || !payload.items.length) throw new Error('빈 응답');
        const normalized = { ...payload, fetchedAt: payload.fetchedAt || new Date().toISOString(), source: payload.source || 'MAFRA' };
        saveCache(normalized);
        return { data: normalized, live: true, message: '실시간 연결됨' };
      } catch (err) { /* 다음 소스 시도 */ }
    }

    const cached = loadCache();
    if (cached?.items?.length) return { data: cached, live: false, message: '연결 지연 · 최근값 표시' };
    return { data: fallback, live: false, message: '연결 지연 · 공식 확인값 표시' };
  };

  const highestLevel = (items) => items.reduce((top, item) =>
    (levelOrder[item.level] || 0) > (levelOrder[top] || 0) ? item.level : top, '관심');

  const formatTime = (iso) => {
    if (!iso) return '-';
    const d = new Date(iso);
    if (isNaN(d)) return '-';
    return d.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }) + ' ' +
      d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  };

  const levelClass = (level) => {
    if (level === '심각') return 'critical';
    if (level === '주의') return 'caution';
    return 'watch';
  };

  // 간소화 행: [아이콘 약칭] ─ [현재단계 pill] (한 줄, 작게)
  const renderRows = (items) => items.map(item => `
    <div class="disease-row disease-${levelClass(item.level)}" title="${item.name} (${item.shortName})">
      <div class="disease-name">
        <span class="disease-icon">${item.icon}</span>
        <div>
          <strong>${item.name}</strong>
          <span>${item.shortName}</span>
        </div>
      </div>
      <span class="disease-cur ${levelClass(item.level)}">${item.level}</span>
    </div>
  `).join('');

  const paint = (payload, state = {}) => {
    const el = document.getElementById('disease-alert-body');
    const metaEl = document.getElementById('disease-alert-meta');
    const badgeEl = document.getElementById('disease-alert-badge');
    if (!el) return;
    const data = payload || fallback;
    el.innerHTML = renderRows(data.items);
    if (badgeEl) {
      const high = highestLevel(data.items);
      badgeEl.textContent = high === '심각' ? '심각 포함' : high === '주의' ? '주의 포함' : '전체 관심';
      badgeEl.className = `disease-summary-badge ${levelClass(high)}`;
    }
    if (metaEl) {
      metaEl.textContent = `${state.message || '공식 단계 표시'} · ${formatTime(data.fetchedAt)}`;
    }
  };

  const refresh = async () => {
    const metaEl = document.getElementById('disease-alert-meta');
    if (metaEl) metaEl.textContent = '공식 페이지 확인 중...';
    const result = await loadLive();
    paint(result.data, result);
  };

  const render = () => `
    <div class="card disease-alert-card">
      <div class="disease-alert-head">
        <div class="disease-alert-title">🛡️ 가축질병 위기단계
          <span class="disease-summary-badge watch" id="disease-alert-badge">확인중</span>
        </div>
        <div class="disease-alert-actions">
          <span class="disease-alert-meta" id="disease-alert-meta">확인 중…</span>
          <button class="btn btn-ghost btn-xs" onclick="DiseaseAlert.refresh()" title="새로고침">↻</button>
          <button class="btn btn-ghost btn-xs" onclick="DiseaseAlert.openOfficial()" title="농림축산식품부 공식 페이지 열기">공식↗</button>
        </div>
      </div>
      <div class="disease-alert-body" id="disease-alert-body">
        ${renderRows((loadCache() || fallback).items)}
      </div>
    </div>
  `;

  // 공식 페이지 열기 — 실제 브라우저는 새 탭, 외부이동 차단 환경(미리보기 등)은 주소 복사로 폴백(오류 방지)
  const openOfficial = () => {
    let win = null;
    try { win = window.open(MAFRA_URL, '_blank', 'noopener,noreferrer'); } catch (_) { win = null; }
    if (win) return;
    // 새 탭이 열리지 않으면 주소를 클립보드로 복사
    const notify = () => { if (window.App && App.toast) App.toast('공식 페이지 주소를 복사했습니다. 브라우저 주소창에 붙여넣으세요.', 'info', 3500); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(MAFRA_URL).then(notify).catch(() => { if (window.App && App.toast) App.toast('공식 페이지: ' + MAFRA_URL, 'info', 5000); });
      } else if (window.App && App.toast) { App.toast('공식 페이지: ' + MAFRA_URL, 'info', 5000); }
    } catch (_) { if (window.App && App.toast) App.toast('공식 페이지: ' + MAFRA_URL, 'info', 5000); }
  };

  const afterRender = () => {
    if (timer) clearInterval(timer);
    refresh();
    timer = setInterval(refresh, REFRESH_MS);
  };

  return { render, afterRender, refresh, openOfficial, parseOfficialHtml };
})();
