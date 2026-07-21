// ============================================================
// sync.js — 멀티터미널 동기화 계층
//   1) 같은 기기 여러 탭: BroadcastChannel + storage 이벤트로 즉시 반영(서버 불필요)
//   2) 여러 기기(사내망): 옵션 동기화 서버(server.py)의 /api 로 운영 데이터 공유
//
//   서버가 없으면(정적 http.server 나 file://) 자동으로 로컬 전용 + 탭 동기화만 동작.
//   즉, 이 모듈이 있어도 기존 localStorage 동작을 절대 깨지 않는다(순수 추가 기능).
// ============================================================

const Sync = (() => {
  // 동기화 대상 = 운영 데이터만. 마스터(원료/제품)와 기기별 설정은 제외.
  const SYNC_KEYS = [
    'rm_receiving', 'rm_silos', 'rm_inventory', 'rm_weighing', 'rm_quality',
    'rm_qc_config', 'rm_exceptions', 'rm_raw_analysis', 'rm_product_analysis',
    'rm_production_orders', 'rm_mixing_batches', 'rm_product_lots', 'rm_voc',
    'rm_outbound', 'rm_history', 'rm_loss', 'rm_qr_scan_logs',
    'rm_formula_recipes', 'rm_suppliers',
    // [신규] 스마트제조/부자재
    'rm_ccp_defs', 'rm_ccp_logs', 'rm_equipment', 'rm_equip_logs', 'rm_oee',
    'rm_submaterials', 'rm_sub_orders', 'rm_process_issues',
    // [신규] 품질 분석관리 (lab_items 는 id 없는 배열 → 통째 동기화)
    'lab_records', 'lab_specs', 'lab_items', 'lab_requests',
    'lab_haccp_docs', 'lab_haccp_ha', 'lab_haccp_logs', 'lab_newmat', 'lab_validations',
    // [신규] 구서관리
    'pest_reports',
    // [신규] 축종별 전용 품질관리 (양축 옥수수·입자도 / 양어 / 반려)
    'lab_corn', 'lab_psa', 'lab_psa_sets', 'lab_aqua', 'lab_pet', 'lab_pet_complaint',
    // [신규] SQF 인증 관리 (문서·일지·시정조치)
    'sqf_docs', 'sqf_logs', 'sqf_ca',
    // [신규] 코드 마스터 (코드관리 화면 발행분 — id 없는 배열이라 통째 동기화)
    'rm_materials', 'rm_products', 'lab_materials', 'lab_products',
    // [신규] 규격 변경 이력 (수정사유 기록)
    'lab_spec_log',
    // [신규] 시료접수 그룹 일괄추가 사용자 정의 그룹
    'lab_quick_groups',
    // [신규] 로그인 계정(가입 승인 공유용) — id=이메일 레코드 동기화
    'rm_auth_users',
  ];
  const SYNC_SET = new Set(SYNC_KEYS);
  const CHANNEL_NAME = 'ws-mes-sync';
  const TERM_KEY = 'rm__terminal_id';
  const POLL_MS = 4000;
  const PUSH_DEBOUNCE_MS = 800;

  let terminalId = '';
  let serverOn = false;       // /api/health 응답 확인 시 true
  let ready = false;          // 초기 풀 로드 완료 후 로컬쓰기 반영 시작
  let applyingRemote = false; // 원격 반영 중엔 재푸시 금지
  let lastSeq = 0;
  const dirty = new Set();
  const snapshots = {};       // key -> 마지막 동기화 시점의 localStorage 원본 문자열
  let pushTimer = null;
  let bc = null;
  let lastTabRefresh = 0;

  const termId = () => {
    let id = localStorage.getItem(TERM_KEY);
    if (!id) {
      id = 'T-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
      localStorage.setItem(TERM_KEY, id);
    }
    return id;
  };

  // ── 값 형태 판별: 전부 id 있는 객체 배열이면 레코드 동기화, 아니면 통째(blob) 동기화 ──
  const toSyncForm = (rawValue) => {
    let val;
    try { val = JSON.parse(rawValue); } catch (_) { return null; }
    if (Array.isArray(val) && val.length > 0 &&
        val.every(el => el && typeof el === 'object' && el.id != null)) {
      return { mode: 'records', records: val };
    }
    return { mode: 'blob', records: [{ id: '__whole__', __blob: val }] };
  };

  const readRaw = (key) => localStorage.getItem(key) || '';

  // ── 로컬 → 서버 푸시 준비: dirty 키들의 변경분/삭제분 계산 ──
  const buildPushBody = () => {
    const keys = {};
    const deletes = [];
    dirty.forEach(key => {
      const raw = readRaw(key);
      if (raw === snapshots[key]) return; // 실제 변화 없음
      const form = toSyncForm(raw);
      if (!form) return;
      keys[key] = form.records;
      // 삭제 감지(레코드 모드에서 이전 스냅샷 대비 사라진 id)
      if (form.mode === 'records' && snapshots[key]) {
        const prev = toSyncForm(snapshots[key]);
        if (prev && prev.mode === 'records') {
          const nowIds = new Set(form.records.map(r => String(r.id)));
          prev.records.forEach(r => {
            const rid = String(r.id);
            if (!nowIds.has(rid)) deletes.push({ key, id: rid });
          });
        }
      }
    });
    return { keys, deletes };
  };

  const flushPush = () => {
    pushTimer = null;
    if (!serverOn || dirty.size === 0) { dirty.clear(); return; }
    const body = buildPushBody();
    const changedKeys = Object.keys(body.keys);
    if (changedKeys.length === 0 && body.deletes.length === 0) { dirty.clear(); return; }
    fetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(r => r.json()).then(res => {
      if (res && typeof res.seq === 'number') lastSeq = Math.max(lastSeq, res.seq);
      // 푸시 성공분만 스냅샷 갱신
      changedKeys.forEach(key => { snapshots[key] = readRaw(key); });
      dirty.clear();
    }).catch(() => { /* 네트워크 실패 → dirty 유지, 다음 주기에 재시도 */ });
  };

  const schedulePush = () => {
    if (pushTimer) return;
    pushTimer = setTimeout(flushPush, PUSH_DEBOUNCE_MS);
  };

  // ── DB.set 훅: 로컬 쓰기 발생 시 호출됨 ──
  const onLocalWrite = (key) => {
    if (!SYNC_SET.has(key)) return;
    // 다른 탭에 즉시 알림(같은 기기 실시간 반영)
    try { if (bc) bc.postMessage({ t: terminalId, key }); } catch (_) {}
    if (!ready || applyingRemote) return;
    dirty.add(key);
    schedulePush();
  };

  // ── 원격 변경 로컬 반영 ──
  const applyRemote = (changes, deletes) => {
    let touched = false;
    applyingRemote = true;
    try {
      Object.keys(changes || {}).forEach(key => {
        if (!SYNC_SET.has(key)) return;
        const incoming = changes[key] || [];
        // blob 모드
        const blob = incoming.find(r => r && r.id === '__whole__');
        if (blob) {
          localStorage.setItem(key, JSON.stringify(blob.__blob));
          snapshots[key] = readRaw(key);
          touched = true;
          return;
        }
        // 레코드 모드: id 기준 병합(원격이 최신 → 덮어쓰기)
        let local = [];
        try { local = JSON.parse(readRaw(key) || '[]'); } catch (_) { local = []; }
        if (!Array.isArray(local)) local = [];
        const map = new Map(local.map(r => [String(r.id), r]));
        incoming.forEach(r => {
          if (!r || r.id == null) return;
          const clean = { ...r }; delete clean._seq;
          map.set(String(r.id), clean);
        });
        localStorage.setItem(key, JSON.stringify([...map.values()]));
        snapshots[key] = readRaw(key);
        touched = true;
      });
      (deletes || []).forEach(d => {
        if (!d || !SYNC_SET.has(d.key)) return;
        let local = [];
        try { local = JSON.parse(readRaw(d.key) || '[]'); } catch (_) { local = []; }
        if (!Array.isArray(local)) return;
        const filtered = local.filter(r => String(r.id) !== String(d.id));
        if (filtered.length !== local.length) {
          localStorage.setItem(d.key, JSON.stringify(filtered));
          snapshots[d.key] = readRaw(d.key);
          touched = true;
        }
      });
    } finally {
      applyingRemote = false;
    }
    if (touched) refreshUI();
  };

  const refreshUI = () => {
    try { if (typeof LabDB !== 'undefined' && LabDB.invalidateCaches) LabDB.invalidateCaches(); } catch (_) {}
    try { window.App && App.updateBadges && App.updateBadges(); } catch (_) {}
    try { window.App && App.refreshPage && App.refreshPage(); } catch (_) {}
  };

  const pull = () => {
    if (!serverOn) return Promise.resolve();
    return fetch('/api/pull?since=' + lastSeq)
      .then(r => r.json())
      .then(res => {
        if (!res) return;
        const hasChange = (res.changes && Object.keys(res.changes).length) || (res.deletes && res.deletes.length);
        if (hasChange) applyRemote(res.changes, res.deletes);
        if (typeof res.seq === 'number') lastSeq = Math.max(lastSeq, res.seq);
      })
      .catch(() => { /* 일시 실패 무시 */ });
  };

  // ── 같은 기기 다른 탭 동기화(서버 없이도 동작) ──
  const setupCrossTab = () => {
    try {
      if ('BroadcastChannel' in window) {
        bc = new BroadcastChannel(CHANNEL_NAME);
        bc.onmessage = (ev) => {
          if (!ev.data || ev.data.t === terminalId) return; // 자기 자신 무시
          throttledTabRefresh();
        };
      }
    } catch (_) {}
    // storage 이벤트 폴백(다른 탭의 localStorage 변경 감지)
    window.addEventListener('storage', (ev) => {
      if (ev.key && SYNC_SET.has(ev.key)) throttledTabRefresh();
    });
  };

  const throttledTabRefresh = () => {
    const t = Date.now();
    if (t - lastTabRefresh < 400) return;
    lastTabRefresh = t;
    refreshUI();
  };

  // ── 서버 감지 후 초기 동기화(있을 때만) ──
  const connectServer = () => {
    return fetch('/api/health', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(res => {
        if (!res || !res.ok) return false;
        serverOn = true;
        // 1) 현재 로컬 운영데이터 전량 업서트(서버가 내용비교로 중복 제거)
        const keys = {};
        SYNC_KEYS.forEach(key => {
          const raw = readRaw(key);
          if (!raw) return;
          const form = toSyncForm(raw);
          if (form) keys[key] = form.records;
        });
        return fetch('/api/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keys, deletes: [] }),
        }).then(r => r.json()).then(() => {
          // 2) 서버 병합본 전량 수신(since=0)
          return fetch('/api/pull?since=0').then(r => r.json()).then(pullRes => {
            if (pullRes && pullRes.changes) applyRemote(pullRes.changes, pullRes.deletes);
            if (pullRes && typeof pullRes.seq === 'number') lastSeq = pullRes.seq;
            return true;
          });
        });
      })
      .catch(() => false);
  };

  const init = () => {
    if (window.__syncInited) return;
    window.__syncInited = true;
    terminalId = termId();
    // 현재 상태를 스냅샷으로 기록(초기 로컬 데이터를 변경으로 오인해 밀어내지 않도록)
    SYNC_KEYS.forEach(key => { snapshots[key] = readRaw(key); });
    setupCrossTab();

    connectServer().then(ok => {
      ready = true; // 이 시점 이후의 로컬 쓰기만 서버로 푸시
      if (ok) {
        try { App.toast && App.toast('현장 동기화 서버 연결됨', 'success'); } catch (_) {}
        setInterval(pull, POLL_MS);
      }
    });
  };

  // DB.set 이 호출할 전역 훅
  window.__onDbWrite = onLocalWrite;

  return {
    init,
    status: () => ({ serverOn, terminalId, lastSeq, ready, dirty: dirty.size }),
    // 수동 강제 동기화(디버그/버튼용)
    syncNow: () => { flushPush(); return pull(); },
  };
})();
