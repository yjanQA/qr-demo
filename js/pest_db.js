// ============================================================
// pest_db.js — 구서(방서)관리 데이터 레이어 (localStorage)
//   방역업체 월간 결과보고서를 공장별·월별로 등록·조회
//   factory 코드는 나머지 시스템과 동일: AS(아산)/GS(경산)/NS(논산)/HQ(본사)
// ============================================================

const PestDB = (() => {
  const KEY = 'pest_reports';
  const now = () => new Date().toISOString();
  const notifyWrite = (key) => { try { if (typeof window !== 'undefined' && window.__onDbWrite) window.__onDbWrite(key); } catch (_) {} };
  const get = () => JSON.parse(localStorage.getItem(KEY) || '[]');
  const set = (data) => { localStorage.setItem(KEY, JSON.stringify(data)); notifyWrite(KEY); };

  const sumVals = (obj) => Object.values(obj || {}).reduce((a, b) => a + (Number(b) || 0), 0);

  // ── 위치 마스터 (구분: 공장 / 영업소) ──
  //   공장은 기존 factory 코드(NS/GS/AS/HQ) 재사용 → 기존 데이터 그대로 보존.
  const LOCATIONS = [
    { code: 'NS', name: '논산공장', group: '공장' },
    { code: 'GS', name: '경산공장', group: '공장' },
    { code: 'AS', name: '아산공장', group: '공장' },
    { code: 'HQ', name: '본사',     group: '공장' },
    { code: 'YA', name: '영업소A', group: '영업소' },
    { code: 'NJ', name: '영업소B', group: '영업소' },
    { code: 'SU', name: '영업소C', group: '영업소' },
    { code: 'GW', name: '영업소D', group: '영업소' },
    { code: 'HS', name: '영업소E', group: '영업소' },
    { code: 'GN', name: '영업소F', group: '영업소' },
  ];
  const GROUPS = ['공장', '영업소'];
  const getLocations = (group) => group ? LOCATIONS.filter(l => l.group === group) : LOCATIONS.slice();
  const locationName = (code) => (LOCATIONS.find(l => l.code === code) || {}).name || code || '-';
  const locationGroup = (code) => (LOCATIONS.find(l => l.code === code) || {}).group || '기타';
  // 레코드의 위치 코드(구버전 factory 필드 호환)
  const locOf = (r) => r.location || r.factory || 'NS';

  // filter: 'ALL'|undefined → 전체 · '공장'/'영업소' → 구분 · 그 외 → 위치코드
  const matchFilter = (r, filter) => {
    if (!filter || filter === 'ALL') return true;
    if (filter === '공장' || filter === '영업소') return locationGroup(locOf(r)) === filter;
    return locOf(r) === filter;
  };
  const getReports = (filter) => get()
    .filter(r => matchFilter(r, filter))
    .sort((a, b) => String(b.month).localeCompare(String(a.month)));
  const getReport = (id) => get().find(r => r.id === id);
  const getReportByMonth = (loc, month) => get().find(r => r.month === month && locOf(r) === loc);

  const addReport = (rep) => {
    const all = get();
    const month = rep.month || new Date().toISOString().slice(0, 7);
    const location = rep.location || rep.factory || 'NS';
    const clean = {
      id: rep.id || (`PEST-${location}-${month}`),
      month,
      location,
      factory: location,   // 하위호환(동기화·구버전 코드에서 factory 참조)
      periodStart: rep.periodStart || (month + '-01'),
      periodEnd: rep.periodEnd || '',
      visits: Array.isArray(rep.visits) ? rep.visits : [],
      ratBreakdown: rep.ratBreakdown || {},
      insectBreakdown: rep.insectBreakdown || {},
      facilityCheck: rep.facilityCheck || {},
      facilityIssues: Array.isArray(rep.facilityIssues) ? rep.facilityIssues : [],
      note: rep.note || '',
      source: rep.source || '',
      manual: !!rep.manual,
      createdAt: now(),
    };
    const idx = all.findIndex(r => r.month === month && locOf(r) === location);
    if (idx >= 0) all[idx] = { ...all[idx], ...clean, id: all[idx].id };
    else all.push(clean);
    set(all);
    return clean;
  };
  const updateReport = (id, patch) => {
    const all = get();
    const i = all.findIndex(r => r.id === id);
    if (i < 0) return null;
    all[i] = { ...all[i], ...patch, id: all[i].id };
    set(all);
    return all[i];
  };
  const deleteReport = (id) => { set(get().filter(r => r.id !== id)); };

  // 파생값
  const ratTotal = (rep) => sumVals(rep.ratBreakdown);
  const insectTotal = (rep) => sumVals(rep.insectBreakdown);
  const grandTotal = (rep) => ratTotal(rep) + insectTotal(rep);
  const facilityOpenCount = (rep) => {
    const fc = rep.facilityCheck || {};
    return (fc.개선진행중 || 0) + (fc.개선예정 || 0) + (fc.개선미진행 || 0);
  };

  // 전월(같은 위치) 대비 벌레 포획량 급증(3배 이상) 여부 — 이상치 경보
  const spikeVsPrevMonth = (rep) => {
    const sameFactory = getReports(locOf(rep)); // desc by month, 같은 위치만
    const idx = sameFactory.findIndex(r => r.id === rep.id);
    const prev = idx >= 0 ? sameFactory[idx + 1] : null; // desc 정렬이므로 다음 인덱스가 이전 달
    if (!prev) return null;
    const cur = insectTotal(rep), prv = insectTotal(prev);
    if (prv <= 0) return null;
    const ratio = cur / prv;
    if (ratio < 3) return null;
    return { prevMonth: prev.month, prevValue: prv, curValue: cur, ratio: +ratio.toFixed(1) };
  };

  // factory: 'ALL'|undefined → 전체 공장 통합, 그 외 → 해당 공장만
  const stats = (factory) => {
    const all = getReports(factory);
    if (!all.length) return { months: 0, latest: null, latestRat: 0, latestInsect: 0, latestTotal: 0, openFacility: 0, spike: null };
    const latest = all[0];
    const openFacility = all.reduce((s, r) => s + facilityOpenCount(r), 0);
    return {
      months: all.length,
      latest,
      latestRat: ratTotal(latest),
      latestInsect: insectTotal(latest),
      latestTotal: grandTotal(latest),
      openFacility: facilityOpenCount(latest),
      openFacilityAll: openFacility,
      spike: spikeVsPrevMonth(latest),
    };
  };

  // ── 위치별 최신 집계 (구분/위치 분석용) ──
  //   각 위치의 최근월 리포트 기준 쥐·벌레·합계·시설미해결·전월대비 급증
  const byLocationStats = (group) => {
    const locs = getLocations(group);
    return locs.map(l => {
      const reps = getReports(l.code); // desc by month
      const latest = reps[0] || null;
      return {
        code: l.code, name: l.name, group: l.group,
        months: reps.length,
        latestMonth: latest ? latest.month : null,
        rat: latest ? ratTotal(latest) : 0,
        insect: latest ? insectTotal(latest) : 0,
        total: latest ? grandTotal(latest) : 0,
        openFacility: latest ? facilityOpenCount(latest) : 0,
        spike: latest ? spikeVsPrevMonth(latest) : null,
        hasData: reps.length > 0,
      };
    });
  };
  // 구분(공장/영업소)별 최신월 합계
  const groupTotals = () => {
    const out = {};
    GROUPS.forEach(g => {
      const rows = byLocationStats(g).filter(r => r.hasData);
      out[g] = {
        locations: rows.length,
        rat: rows.reduce((s, r) => s + r.rat, 0),
        insect: rows.reduce((s, r) => s + r.insect, 0),
        total: rows.reduce((s, r) => s + r.total, 0),
        openFacility: rows.reduce((s, r) => s + r.openFacility, 0),
        spikes: rows.filter(r => r.spike).length,
      };
    });
    return out;
  };
  // 위치별 월 추이 (특정 metric: 'rat'|'insect'|'total') → {months:[], series:[{code,name,data:[]}]}
  const locationTrend = (group, metric) => {
    const m = metric || 'total';
    const locs = getLocations(group).filter(l => getReports(l.code).length);
    const monthSet = new Set();
    get().forEach(r => { if (!group || locationGroup(locOf(r)) === group) monthSet.add(r.month); });
    const months = [...monthSet].sort();
    const metricVal = (rep) => m === 'rat' ? ratTotal(rep) : m === 'insect' ? insectTotal(rep) : grandTotal(rep);
    const series = locs.map(l => {
      const byMonth = {};
      getReports(l.code).forEach(r => { byMonth[r.month] = metricVal(r); });
      return { code: l.code, name: l.name, data: months.map(mo => byMonth[mo] ?? null) };
    });
    return { months, series };
  };

  const SEED_VERSION = '2026-07-03-pest2';
  const SEED_VER_KEY = 'pest_seed_ver';
  const initSampleData = () => {
    const ver = localStorage.getItem(SEED_VER_KEY);
    if (ver === SEED_VERSION) return;
    const existing = get();
    const manualKeys = new Set(existing.filter(r => r.manual).map(r => r.factory + '|' + r.month));
    const seed = (typeof window !== 'undefined' && window.WS_PEST_SEED) || [];
    const fresh = seed.filter(r => !manualKeys.has((r.factory || 'NS') + '|' + r.month)).map(r => ({ ...r, factory: r.factory || 'NS', manual: false }));
    const manual = existing.filter(r => r.manual);
    set(manual.concat(fresh));
    localStorage.setItem(SEED_VER_KEY, SEED_VERSION);
  };

  return {
    getReports, getReport, getReportByMonth, addReport, updateReport, deleteReport,
    ratTotal, insectTotal, grandTotal, facilityOpenCount, spikeVsPrevMonth, stats,
    initSampleData,
    // 위치·구분
    LOCATIONS, GROUPS, getLocations, locationName, locationGroup, locOf,
    byLocationStats, groupTotals, locationTrend,
  };
})();
