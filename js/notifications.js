// ============================================================
// notifications.js — 전역 알림(읽음/안읽음) 센터
//   각 도메인의 "주목할 이슈"를 스캔해 알림을 생성하고, 사이드바 항목 옆에
//   안읽은 알림 수를 배지로 표시. 해당 페이지에 진입(클릭)하면 읽음 처리되어 사라짐.
//
//   dedupe 키(page:refId)로 같은 이슈는 한 번만 알림 → 읽은 뒤 상태가 지속돼도
//   재생성되지 않음. 새로운 이슈(새 키)만 다시 배지로 뜬다.
// ============================================================

const NotificationCenter = (() => {
  const KEY = 'ws_notifications';
  const MAX_KEEP = 500;           // 읽은 알림 보관 상한(초과 시 오래된 것부터 제거)
  const now = () => new Date().toISOString();
  const get = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (_) { return []; } };
  const set = (arr) => { try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch (_) {} };
  const uid = () => 'N-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);

  // ── 스캐너: 각 도메인의 현재 주목 이슈를 { page, key, type, title } 배열로 반환 ──
  //   type: 'danger'(빨강) | 'warn'(주황) | 'info'(파랑)
  const scanners = [
    // 분석 결과입력 대기(접수 건)
    () => {
      if (typeof LabDB === 'undefined' || !LabDB.getRequests) return [];
      return LabDB.getRequests('OPEN').slice(0, 30).map(r => ({
        page: 'input', key: `input:${r.id}`, type: r.priority === '긴급' ? 'danger' : 'warn',
        title: `분석 결과입력 대기 · ${r.id} (${r.name || r.code})`,
      }));
    },
    // 스마트 HACCP CCP 한계이탈 로그
    () => {
      if (typeof DB === 'undefined' || !DB.getCCPLogs) return [];
      return DB.getCCPLogs('ALL').filter(l => l.judged === 'DEVIATION').slice(0, 30).map(l => ({
        page: 'ccp', key: `ccp:${l.id}`, type: 'danger',
        title: `CCP 한계이탈 · ${l.ccpName || ''} = ${l.value}`,
      }));
    },
    // HACCP 일지 부적합
    () => {
      if (typeof LabDB === 'undefined' || !LabDB.getHaccpLogs) return [];
      return LabDB.getHaccpLogs('ALL').filter(l => l.judged === '부적합').slice(0, 20).map(l => ({
        page: 'haccpLogs', key: `haccpLogs:${l.id}`, type: 'danger',
        title: `HACCP 일지 부적합 · ${l.target || ''} (${l.value || ''})`,
      }));
    },
    // 규격 이탈(분석대장) — 상위 N건
    () => {
      if (typeof LabDB === 'undefined' || !LabDB.getDeviations) return [];
      return LabDB.getDeviations('ALL', 20).map(d => ({
        page: 'labDashboard', key: `labDashboard:${d.rec.id}:${d.item}`, type: 'warn',
        title: `규격 이탈 · ${d.rec.code} ${LabDB.itemLabel(d.item)} = ${d.value}`,
      }));
    },
    // 구서관리 이상치(전월 대비 급증)
    () => {
      if (typeof PestDB === 'undefined' || !PestDB.getReports) return [];
      const out = [];
      PestDB.getReports('ALL').forEach(r => {
        const sp = PestDB.spikeVsPrevMonth(r);
        if (sp) out.push({
          page: 'pestControl', key: `pestControl:${r.id}:spike`, type: 'danger',
          title: `구서 이상치 · ${r.month} 벌레 포획 ${sp.ratio}배 급증`,
        });
      });
      return out.slice(0, 20);
    },
    // 유효성평가 미실시/부적합
    () => {
      if (typeof LabDB === 'undefined' || !LabDB.getValidations) return [];
      return LabDB.getValidations().filter(v => v.result === '부적합' || v.result === '진행중').slice(0, 20).map(v => ({
        page: 'validation', key: `validation:${v.id}:${v.result}`, type: v.result === '부적합' ? 'danger' : 'warn',
        title: `유효성평가 ${v.result} · ${v.name}`,
      }));
    },
    // VOC 미해결 클레임
    () => {
      if (typeof DB === 'undefined' || !DB.getVOCs) return [];
      try {
        return DB.getVOCs().filter(v => v.status && v.status !== 'CLOSED' && v.status !== '완료').slice(0, 20).map(v => ({
          page: 'voc', key: `voc:${v.id}`, type: 'warn',
          title: `VOC 미처리 · ${v.title || v.productName || v.id}`,
        }));
      } catch (_) { return []; }
    },
    // 공정 이슈 미해결
    () => {
      if (typeof DB === 'undefined' || !DB.getIssues) return [];
      try {
        return DB.getIssues('ALL').filter(i => i.status !== 'CLOSED' && i.status !== '완료').slice(0, 20).map(i => ({
          page: 'issue', key: `issue:${i.id}`, type: i.severity === '긴급' ? 'danger' : 'warn',
          title: `공정 이슈 · ${i.title || i.type || i.id}`,
        }));
      } catch (_) { return []; }
    },
    // 장기재고(3개월 미사용 · 저회전 1년↑)
    () => {
      if (typeof LongStockPage === 'undefined' || !LongStockPage.alerts) return [];
      try {
        return LongStockPage.alerts('ALL').slice(0, 30).map(r => ({
          page: 'longStock', key: `longStock:${r.factory}:${r.code}:${r.flags.join('+')}`,
          type: r.flags.includes('unused') ? 'danger' : 'warn',
          title: `장기재고 · ${r.name || r.code} ${Math.round(r.kg).toLocaleString()}kg (${r.flags.includes('unused') ? '미사용 ' + (r.daysNoUse ?? r.daysStored) + '일' : '소진 ' + (r.monthsToDeplete?.toFixed(1) || '-') + '개월'})`,
        }));
      } catch (_) { return []; }
    },
    // 설비 정비 임박/고장
    () => {
      if (typeof DB === 'undefined' || !DB.getMaintenanceDue) return [];
      try {
        const due = DB.getMaintenanceDue('ALL').slice(0, 15).map(e => ({
          page: 'equipment', key: `equipment:${e.id}:due`, type: 'warn',
          title: `예방정비 임박 · ${e.name || e.id}`,
        }));
        const down = (DB.getEquipment('ALL') || []).filter(e => e.status === 'DOWN').slice(0, 15).map(e => ({
          page: 'equipment', key: `equipment:${e.id}:down`, type: 'danger',
          title: `설비 고장 · ${e.name || e.id}`,
        }));
        return due.concat(down);
      } catch (_) { return []; }
    },
  ];

  // ── 스캔: 새 이슈만 알림으로 추가(dedupe by key) ──
  const scan = () => {
    const all = get();
    const seen = new Set(all.map(n => n.key));
    let added = 0;
    scanners.forEach(fn => {
      let items = [];
      try { items = fn() || []; } catch (_) { items = []; }
      items.forEach(it => {
        if (!it || !it.key || seen.has(it.key)) return;
        seen.add(it.key);
        all.push({ id: uid(), page: it.page, key: it.key, type: it.type || 'info', title: it.title || '', createdAt: now(), read: false });
        added++;
      });
    });
    if (added > 0) {
      // 보관 상한 초과 시 읽은 알림부터 오래된 순 제거
      if (all.length > MAX_KEEP) {
        const read = all.filter(n => n.read).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
        const removeCount = all.length - MAX_KEEP;
        const removeIds = new Set(read.slice(0, removeCount).map(n => n.id));
        set(all.filter(n => !removeIds.has(n.id)));
      } else {
        set(all);
      }
    }
    return added;
  };

  // ── 조회/집계 ──
  const list = (opts = {}) => {
    let l = get().slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    if (opts.page) l = l.filter(n => n.page === opts.page);
    if (opts.unreadOnly) l = l.filter(n => !n.read);
    return l;
  };
  const unreadByPage = () => {
    const m = {};
    get().forEach(n => { if (!n.read) m[n.page] = (m[n.page] || 0) + 1; });
    return m;
  };
  const unreadTotal = () => get().filter(n => !n.read).length;

  // ── 읽음 처리 ──
  const markPageRead = (page) => {
    const all = get();
    let changed = false;
    all.forEach(n => { if (n.page === page && !n.read) { n.read = true; n.readAt = now(); changed = true; } });
    if (changed) set(all);
    return changed;
  };
  const markRead = (id) => {
    const all = get();
    const n = all.find(x => x.id === id);
    if (n && !n.read) { n.read = true; n.readAt = now(); set(all); return true; }
    return false;
  };
  const markAllRead = () => {
    const all = get();
    let changed = false;
    all.forEach(n => { if (!n.read) { n.read = true; n.readAt = now(); changed = true; } });
    if (changed) set(all);
    return changed;
  };
  const clearRead = () => set(get().filter(n => !n.read));

  return { scan, list, unreadByPage, unreadTotal, markPageRead, markRead, markAllRead, clearRead };
})();
