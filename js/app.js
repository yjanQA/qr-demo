// ============================================================
// app.js — SPA 라우터, 상태 관리, 토스트 (v2.0)
// ============================================================

const App = (() => {
  const workspaces = {
    qr:      { label: '입고·재고 QR', defaultPage: 'dashboard' },
    quality: { label: '품질·실험실',  defaultPage: 'labDashboard' },
    formula: { label: '배합비·생산',  defaultPage: 'formula' },
    trace:   { label: '추적·클레임',  defaultPage: 'history' },
    admin:   { label: '관리',        defaultPage: 'supplier' },
    smart:   { label: '스마트제조',   defaultPage: 'ccp' },
    haccp:   { label: '인증관리',     defaultPage: 'haccpDocs' },
  };

  const pages = {
    dashboard:  { workspace:'qr',      title: 'QR 입고배정 현황',   subtitle: '',   module: () => DashboardPage },
    supplierInbound: { workspace:'qr', title: '협력사 입고예정', subtitle: '', module: () => SupplierInboundPage },
    receiving:  { workspace:'qr',      title: '입고 관리',           subtitle: '',         module: () => ReceivingPage },
    silo:       { workspace:'qr',      title: '사일로 관리',         subtitle: '',      module: () => SiloPage      },
    inventory:  { workspace:'qr',      title: '톤백·지대 재고',      subtitle: '',                module: () => InventoryPage },
    longStock:  { workspace:'qr',      title: '장기재고 알람',       subtitle: '3개월 미사용 · 저회전(소진 1년↑) 원료', module: () => LongStockPage },
    outbound:   { workspace:'qr',      title: '출고 처리',           subtitle: '',                   module: () => OutboundPage  },
    subMaterial:{ workspace:'qr',      title: '부자재 재고',         subtitle: '', module: () => SubMaterialPage },
    productStock:{ workspace:'qr',     title: '제품 재고',           subtitle: '',         module: () => ProductStockPage },
    scan:       { workspace:'qr',      title: 'QR 스캔',             subtitle: '',              module: () => ScanPage      },
    plateScan:  { workspace:'qr',      title: '번호 인식(카메라)',    subtitle: '차량번호·문서번호', module: () => PlateScanPage },
    qualityRd:  { workspace:'quality', title: '분석 데이터',         subtitle: '',      module: () => QualityRDPage },
    quality:    { workspace:'quality', title: '품질 게이트',         subtitle: '',         module: () => QualityPage   },
    formula:    { workspace:'formula', title: '배합비 관리',         subtitle: '', module: () => FormulaPage },
    production: { workspace:'formula', title: '투입지시',            subtitle: '',        module: () => ProductionPage},
    batch:      { workspace:'formula', title: '배합·생산LOT',        subtitle: '',          module: () => BatchPage     },
    feedProduction: { workspace:'formula', title: '배합사료 생산실적', subtitle: '', module: () => FeedProductionPage },
    formulaTrend: { workspace:'formula', title: '배합비 추이분석', subtitle: '배합비별 제품 스펙(화학·물리) 누적 추이', module: () => FormulaTrendPage },
    history:    { workspace:'trace',   title: '원료 추적',           subtitle: '', module: () => HistoryPage   },
    voc:        { workspace:'trace',   title: 'VOC 역추적',          subtitle: '',      module: () => VOCPage       },
    codes:      { workspace:'admin',   title: '코드 관리',           subtitle: '', module: () => CodeMasterPage },
    supplier:   { workspace:'admin',   title: '협력사 관리',         subtitle: '',        module: () => SupplierPage  },
    ccp:        { workspace:'smart',   title: '스마트 HACCP',        subtitle: '', module: () => HaccpPage     },
    equipment:  { workspace:'smart',   title: '설비관리',            subtitle: '', module: () => EquipmentPage },
    issue:      { workspace:'smart',   title: '공정 이슈',           subtitle: '',     module: () => ProcessIssuePage },
    // ── 품질 분석관리 (통합) ──
    workmap:      { workspace:'quality', title: '품질 업무맵',    subtitle: '업무체계도 4.1~4.12 커버리지', module: () => QualityWorkmapPage },
    labDashboard: { workspace:'quality', title: '품질 대시보드',  subtitle: '',  module: () => LabDashboardPage },
    labReceive:   { workspace:'quality', title: '시료 접수',        subtitle: '',       module: () => ReceivePage },
    input:        { workspace:'quality', title: '분석 결과입력',    subtitle: '', module: () => InputPage },
    raw:          { workspace:'quality', title: '원료 분석대장',   subtitle: '',             module: () => RawAnalysisPage },
    prod:         { workspace:'quality', title: '제품 분석대장',   subtitle: '',             module: () => ProdAnalysisPage },
    items:        { workspace:'quality', title: '분석항목 관리',    subtitle: '',     module: () => ItemsPage },
    spec:         { workspace:'quality', title: '규격 관리',        subtitle: '',     module: () => SpecPage },
    matrix:       { workspace:'quality', title: '원료 매트릭스',    subtitle: '분석대장 기반 자동작성(측정평균·SPEC·편차)', module: () => RawMatrixPage },
    specSheet:    { workspace:'quality', title: '원료 규격서',      subtitle: '반려원료 규격 원본 양식 · 항목 수정/개정이력', module: () => SpecSheetPage },
    haccpDocs:    { workspace:'haccp', title: 'HACCP 기준서·문서', subtitle: '',       module: () => HaccpDocsPage },
    haccpHA:      { workspace:'haccp', title: '위해요소분석',      subtitle: '', module: () => HaccpHAPage },
    haccpLogs:    { workspace:'haccp', title: 'HACCP 일지',        subtitle: '',     module: () => HaccpLogsPage },
    newMat:       { workspace:'haccp', title: '신원료 위해평가',   subtitle: '', module: () => NewMatPage },
    validation:   { workspace:'haccp', title: '유효성 평가',       subtitle: '', module: () => ValidationPage },
    sqfDocs:      { workspace:'haccp', title: 'SQF 기준서·문서', subtitle: '', module: () => SqfDocsPage },
    sqfLogs:      { workspace:'haccp', title: 'SQF 일지',        subtitle: '', module: () => SqfLogsPage },
    sqfCA:        { workspace:'haccp', title: 'SQF 시정조치',    subtitle: '', module: () => SqfCAPage },
    pestControl:  { workspace:'quality', title: '구서관리',          subtitle: '', module: () => PestControlPage },
    // ── 축종별 품질관리 (전문가 시트) ──
    speciesLivestock: { workspace:'quality', title: '양축 품질관리', subtitle: '', module: () => SpeciesLivestockPage },
    speciesAqua:      { workspace:'quality', title: '양어 품질관리', subtitle: '', module: () => SpeciesAquaPage },
    speciesPet:       { workspace:'quality', title: '반려 품질관리', subtitle: '', module: () => SpeciesPetPage },
    // ── 축종별 측정 도구 (전문가 시트에서 진입) ──
    cornGrade:    { workspace:'quality', title: '옥수수 등급평가',   subtitle: '', module: () => CornPage },
    psa:          { workspace:'quality', title: '입자도 분석(Dgw)',  subtitle: '', module: () => PSAPage },
    aqua:         { workspace:'quality', title: '양어 물리검사',      subtitle: '', module: () => AquaPage },
    pet:          { workspace:'quality', title: '반려 품질·컴플레인', subtitle: '', module: () => PetPage },
    weather:      { workspace:'quality', title: '날씨·습도 기록',    subtitle: '', module: () => WeatherPage },
  };

  let currentPage = 'dashboard';
  let pageArgs    = [];
  let currentFactory = 'ALL';   // 공장 필터
  let currentWorkspace = 'qr';
  let navHistory  = [];         // 페이지 이력 스택 (백스페이스 뒤로가기용)
  let _navBack    = false;      // 뒤로가기 중 플래그 (이력 재적재 방지)

  // ── 초기화 ──
  const init = async () => {
    const params  = new URLSearchParams(window.location.search);
    const qrId    = params.get('id') || params.get('qr') || params.get('code');
    const initPage = params.get('page') || 'dashboard';

    // 원료 마스터 로드 (실패해도 계속 진행)
    try { await DB.loadMaterialsFromJSON(); } catch(e) { /* file:// 환경에서 무시 */ }
    try { await DB.loadProductsFromJSON(); } catch(e) { /* file:// 환경에서 무시 */ }
    try { await DB.loadSuppliersFromJSON(); } catch(e) { /* file:// 환경에서 무시 */ }

    // 샘플 데이터 초기화
    DB.initSampleData();

    // 품질 분석관리(통합) 데이터 초기화 — 실패해도 QR 동작에 영향 없음
    try {
      if (typeof LabDB !== 'undefined') {
        await LabDB.loadMaterialsFromJSON();
        await LabDB.loadProductsFromJSON();
        LabDB.initSampleData();
      }
    } catch (e) { console.warn('[Lab] init skip', e); }

    // 구서관리 시드 데이터 초기화
    try { if (typeof PestDB !== 'undefined') PestDB.initSampleData(); } catch (e) { console.warn('[Pest] init skip', e); }

    // 알림 초기 스캔(각 도메인 주목 이슈 → 알림 생성)
    try { if (typeof NotificationCenter !== 'undefined') NotificationCenter.scan(); } catch (e) { console.warn('[Notif] scan skip', e); }

    // 라우팅
    if (qrId) {
      if (initPage === 'scan') {
        navigate('scan', qrId, window.location.href);
      } else {
        navigate('history', qrId);
      }
    } else {
      navigate(initPage);
    }

    // 로그인 사용자 접근권한 확정(허용되지 않은 착지 영역이면 허용 영역으로 이동)
    try { if (typeof Auth !== 'undefined' && Auth.enforceLanding) Auth.enforceLanding(); } catch (_) {}

    updateBadges();
    initBackKey();
    try { if (window.Weather) { Weather.init(); document.addEventListener('weather:update', updateWeatherBadge); updateWeatherBadge(); } } catch (e) { console.warn('[Weather] init skip', e); }
    document.getElementById('sidebar-overlay')?.addEventListener('click', closeSidebar);

    // 멀티터미널 동기화 시작(서버 없으면 탭 동기화만) — 샘플 시딩 이후 호출
    try { if (window.Sync) Sync.init(); } catch (e) { console.warn('[Sync] init skip', e); }
  };

  // ── 공장 필터 ──
  const setFactory = (factory) => {
    currentFactory = factory;
    document.querySelectorAll('.factory-tab').forEach(el => {
      el.classList.toggle('active', el.dataset.factory === factory);
    });
    const fbadge = document.getElementById('topbar-factory');
    if (fbadge) {
      const names = { ALL:'전체 공장', AS:'아산공장', GS:'경산공장', NS:'논산공장', HQ:'본사' };
      fbadge.textContent = names[factory] || factory;
      fbadge.className   = `factory-badge factory-${factory.toLowerCase()}`;
    }
    navigate(currentPage, ...pageArgs);
    try { if (window.Weather) { updateWeatherBadge(); Weather.record(currentFactory === 'ALL' ? 'NS' : currentFactory).then(updateWeatherBadge); } } catch (_) {}
  };
  const getFactory = () => currentFactory;

  const switchWorkspace = (workspace) => {
    if (!workspaces[workspace]) workspace = 'qr';
    currentWorkspace = workspace;
    updateWorkspaceUI();
    navigate(workspaces[workspace].defaultPage);
  };
  const getWorkspace = () => currentWorkspace;

  // ── 스크롤 위치 보존(전역) : 같은 페이지 재렌더 시 화면이 상단으로 튀지 않게 ──
  const _scrollEl = () => document.getElementById('page-content');
  const captureScroll = () => {
    const el = _scrollEl();
    return { el: el ? el.scrollTop : 0, win: window.pageYOffset || document.documentElement.scrollTop || 0 };
  };
  const restoreScroll = (s) => {
    if (!s) return;
    const apply = () => {
      const el = _scrollEl();
      if (el && s.el) el.scrollTop = s.el;               // page-content가 스크롤러인 레이아웃
      // 실제 스크롤러(문서/윈도우)는 즉시 복원(smooth 애니메이션 방지)
      if (s.win) { try { window.scrollTo({ top: s.win, left: 0, behavior: 'auto' }); } catch (_) { window.scrollTo(0, s.win); } }
    };
    apply();                              // 렌더 직후 동기 복원
    requestAnimationFrame(apply);         // afterRender로 높이가 바뀌어도 재복원
  };
  const resetScroll = () => {
    const el = _scrollEl();
    if (el) el.scrollTop = 0;
    try { window.scrollTo({ top: 0, left: 0, behavior: 'auto' }); } catch (_) { window.scrollTo(0, 0); }
  };

  // ── 네비게이션 ──
  const navigate = (page, ...args) => {
    if (!pages[page]) page = 'dashboard';
    // 같은 페이지 재렌더(체크박스 토글·상태갱신·refreshPage)면 스크롤 위치 유지,
    //   실제 페이지 전환이면 상단으로. → 전 화면 공통(전역) 처리.
    const _samePage = (currentPage === page);
    const _scroll = _samePage ? captureScroll() : null;
    // 이력 적재: 실제 페이지 전환일 때만(같은 페이지 재렌더·공장필터·refreshPage 제외), 뒤로가기 중엔 제외
    if (!_navBack && currentPage && currentPage !== page) {
      navHistory.push({ page: currentPage, args: pageArgs });
      if (navHistory.length > 50) navHistory.shift();
    }
    _navBack = false;
    currentPage = page;
    pageArgs    = args;
    currentWorkspace = pages[page].workspace || currentWorkspace;
    updateWorkspaceUI();

    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page);
    });

    const info   = pages[page];
    const titleEl = document.getElementById('topbar-title');
    const subEl   = document.getElementById('topbar-subtitle');
    if (titleEl) titleEl.textContent = info.title;
    if (subEl)   subEl.textContent   = info.subtitle;

    renderPage();
    if (_scroll) restoreScroll(_scroll); else resetScroll();
    closeSidebar();
    // 알림 스캔 → 현재 페이지 알림 읽음 처리(진입=읽음) → 배지 갱신
    try {
      if (typeof NotificationCenter !== 'undefined') {
        NotificationCenter.scan();
        NotificationCenter.markPageRead(page);
      }
    } catch (_) {}
    updateBadges();
  };

  // ── 뒤로가기 (백스페이스) ──
  const goBack = () => {
    // 열린 오버레이(보고서·성적서)가 있으면 먼저 닫기
    const ov = document.getElementById('rpt-overlay') || document.getElementById('coa-overlay');
    if (ov) { ov.remove(); return true; }
    if (!navHistory.length) return false;
    const prev = navHistory.pop();
    _navBack = true;
    navigate(prev.page, ...(prev.args || []));
    return true;
  };

  // 백스페이스 → 이전 화면 (입력 중일 땐 제외)
  const _isEditable = (el) => {
    if (!el) return false;
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (el.isContentEditable) return true;
    return false;
  };
  const initBackKey = () => {
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Backspace') return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (_isEditable(e.target)) return;          // 입력창 타이핑 중이면 무시
      e.preventDefault();                          // 브라우저 기본 뒤로가기 차단
      goBack();
    });
  };

  const updateWorkspaceUI = () => {
    document.querySelectorAll('.workspace-tab').forEach(el => {
      el.classList.toggle('active', el.dataset.workspace === currentWorkspace);
    });
    document.querySelectorAll('.sidebar-nav [data-workspace]').forEach(el => {
      el.classList.toggle('hidden', el.dataset.workspace !== currentWorkspace);
    });
    document.querySelectorAll('[data-workspace-action]').forEach(el => {
      const scopes = String(el.dataset.workspaceAction || '').split(',').map(v => v.trim());
      el.classList.toggle('hidden', !scopes.includes(currentWorkspace));
    });
  };

  const refreshPage = () => navigate(currentPage, ...pageArgs);

  // 상단 날씨·습도 배지 갱신 (현재 선택 공장 기준)
  const updateWeatherBadge = () => {
    const el = document.getElementById('topbar-weather');
    if (!el || !window.Weather) return;
    const fac = currentFactory && currentFactory !== 'ALL' ? currentFactory : 'NS';
    const d = Weather.current(fac);
    if (!d) { el.classList.add('hidden'); return; }
    const ci = Weather.codeInfo(d.code);
    const lvl = Weather.humidityLevel(d.humidity);
    const hcol = lvl === 'high' ? '#ff6b81' : lvl === 'caution' ? '#e0a656' : 'var(--text-secondary)';
    el.classList.remove('hidden');
    el.title = `${(Weather.LOCATIONS[fac] || {}).name || fac} · ${ci.label}${lvl && lvl !== 'ok' ? ' · 고습 주의(곰팡이)' : ''} · 클릭 시 날씨 기록`;
    el.onclick = () => navigate('weather');
    el.innerHTML = `<span style="cursor:pointer">${ci.icon} <b>${d.temp != null ? d.temp.toFixed(0) : '-'}°</b> `
      + `<span style="color:${hcol}">💧${d.humidity != null ? d.humidity : '-'}%</span></span>`;
  };

  const renderPage = () => {
    const el  = document.getElementById('page-content');
    if (!el) return;
    const mod = pages[currentPage]?.module();
    if (!mod) return;

    try {
      el.innerHTML = mod.render(...pageArgs);
      setTimeout(() => mod.afterRender?.(...pageArgs), 50);
      // 인증관리 워크스페이스: HACCP 교육 신규 공지 알람 배너
      try { if (typeof HaccpEduAlert !== 'undefined') HaccpEduAlert.mount(el, pages[currentPage].workspace); } catch (_) {}
    } catch (e) {
      el.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠</div><h3>렌더링 오류</h3><p>${e.message}</p></div>`;
      console.error('[App] renderPage error:', e);
    }
  };

  // ── 배지 업데이트 ──
  const updateBadges = () => {
    const stats = DB.getStats(currentFactory);

    const badge = document.getElementById('badge-receiving');
    if (badge) {
      const cnt = stats.pendingScaleCount + stats.pendingQCCount;
      badge.textContent = cnt;
      badge.style.display = cnt > 0 ? 'inline-block' : 'none';
    }
    const supplierInboundBadge = document.getElementById('badge-supplier-inbound');
    if (supplierInboundBadge) {
      const cnt = stats.supplierInboundOpenCount || 0;
      supplierInboundBadge.textContent = cnt;
      supplierInboundBadge.style.display = cnt > 0 ? 'inline-block' : 'none';
    }
    const qbadge = document.getElementById('badge-quality');
    if (qbadge) {
      qbadge.textContent  = stats.pendingQCCount;
      qbadge.style.display = stats.pendingQCCount > 0 ? 'inline-block' : 'none';
    }
    const lsBadge = document.getElementById('badge-longstock');
    if (lsBadge) {
      let cnt = 0;
      try { if (typeof LongStockPage !== 'undefined') cnt = LongStockPage.alertCount(currentFactory); } catch (_) {}
      lsBadge.textContent = cnt;
      lsBadge.style.display = cnt > 0 ? 'inline-block' : 'none';
    }
    const sbadge = document.getElementById('badge-silo');
    if (sbadge) {
      sbadge.textContent  = stats.siloWaitingCount;
      sbadge.style.display = stats.siloWaitingCount > 0 ? 'inline-block' : 'none';
    }
    const pbadge = document.getElementById('badge-production');
    if (pbadge) {
      const pending = DB.getProductionOrders().filter(o => o.status === 'PENDING').length;
      pbadge.textContent  = pending;
      pbadge.style.display = pending > 0 ? 'inline-block' : 'none';
    }
    const vocbadge = document.getElementById('badge-voc');
    if (vocbadge) {
      vocbadge.textContent  = stats.openVOCCount;
      vocbadge.style.display = stats.openVOCCount > 0 ? 'inline-block' : 'none';
    }
    // [신규] 스마트제조/재고 배지
    const setBadge = (id, cnt) => { const el = document.getElementById(id); if (el) { el.textContent = cnt; el.style.display = cnt > 0 ? 'inline-block' : 'none'; } };
    try {
      const ccpDev = DB.getCCPStatus(currentFactory).reduce((s, x) => s + x.deviations, 0);
      setBadge('badge-ccp', ccpDev);
      setBadge('badge-equipment', DB.getMaintenanceDue(currentFactory).length + DB.getEquipment(currentFactory).filter(e => e.status === 'DOWN').length);
      setBadge('badge-issue', DB.getIssues(currentFactory).filter(i => i.status !== 'CLOSED').length);
      setBadge('badge-submaterial', DB.getReorderSuggestions(currentFactory).length);
    } catch (e) { /* 신규 모듈 미로드 방어 */ }
    // 실험실 시료접수 대기 배지
    try {
      if (typeof LabDB !== 'undefined' && LabDB.requestStats) setBadge('badge-lab-receive', LabDB.requestStats().pending);
    } catch (e) { /* lab 모듈 미로드 방어 */ }
    // 읽지 않은 알림 배지(사이드바 각 항목) — 클릭(진입) 시 읽음 처리되어 사라짐
    try {
      if (typeof NotificationCenter !== 'undefined') {
        const unread = NotificationCenter.unreadByPage();
        document.querySelectorAll('.sidebar-nav .nav-item[data-page]').forEach(el => {
          const page = el.dataset.page;
          const cnt = unread[page] || 0;
          let alertEl = el.querySelector('.nav-alert');
          if (cnt > 0) {
            if (!alertEl) {
              alertEl = document.createElement('span');
              alertEl.className = 'nav-alert';
              const existingBadge = el.querySelector('.nav-badge');   // 기존 카운트 배지 앞(왼쪽)에 삽입
              if (existingBadge) el.insertBefore(alertEl, existingBadge); else el.appendChild(alertEl);
            }
            alertEl.textContent = cnt > 99 ? '99+' : cnt;
            alertEl.title = NotificationCenter.list({ page, unreadOnly: true }).slice(0, 6).map(n => '• ' + n.title).join('\n');
          } else if (alertEl) {
            alertEl.remove();
          }
        });
        // 상단 워크스페이스 탭에 알림 롤업 점(다른 워크스페이스 알림도 인지)
        const wsUnread = {};
        Object.keys(unread).forEach(pg => { const ws = pages[pg]?.workspace; if (ws) wsUnread[ws] = (wsUnread[ws] || 0) + unread[pg]; });
        document.querySelectorAll('.workspace-tab[data-workspace]').forEach(tab => {
          const cnt = wsUnread[tab.dataset.workspace] || 0;
          let dot = tab.querySelector('.ws-alert-dot');
          if (cnt > 0) { if (!dot) { dot = document.createElement('span'); dot.className = 'ws-alert-dot'; tab.appendChild(dot); } dot.title = cnt + '건의 새 알림'; }
          else if (dot) { dot.remove(); }
        });
      }
    } catch (e) { /* 알림 모듈 미로드 방어 */ }
  };

  // ── 모바일 사이드바 ──
  const toggleSidebar = () => {
    document.getElementById('sidebar')?.classList.toggle('open');
    document.getElementById('sidebar-overlay')?.classList.toggle('open');
  };
  const closeSidebar = () => {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebar-overlay')?.classList.remove('open');
  };

  // ── 토스트 알림 ──
  const toast = (msg, type = 'info', duration = 3000) => {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${msg}</span>`;
    container.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(20px)'; t.style.transition = '0.3s'; setTimeout(() => t.remove(), 300); }, duration);
  };

  // ── 공통 날짜 포맷 ──
  const formatDate = (iso) => {
    if (!iso) return '-';
    const d = new Date(iso);
    return d.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }) + ' ' + d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  };

  return { init, navigate, goBack, refreshPage, toast, toggleSidebar, setFactory, getFactory, switchWorkspace, getWorkspace, updateWorkspaceUI, pageWorkspace: (p) => pages[p]?.workspace, updateBadges, formatDate };
})();

// ── 전역 유틸 ──
function formatDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('ko-KR', { month:'2-digit', day:'2-digit' }) + ' ' + d.toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' });
}
function formatDateShort(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('ko-KR', { year:'numeric', month:'2-digit', day:'2-digit' });
}
function formatNum(n) { return Number(n || 0).toLocaleString(); }

// 앱 시작
window.addEventListener('DOMContentLoaded', () => {
  App.init();
});

