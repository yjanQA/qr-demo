// ============================================================
// lab_matrix.js — 원료 매트릭스 자동작성 (WBS 4.1.4.1 / 4.8.4.1)
//   원료 분석대장(lab_records)을 기간별로 집계하여
//   '논산 원료Matrix' 양식(원료당 3행: 측정평균 / SPEC / 편차)을 자동 생성.
//     · 측정평균 = 기간 내 분석대장 값들의 평균 (Drymat = 100 − 수분)
//     · SPEC     = 규격관리(수동규격)의 기준값
//     · 편차     = 측정평균 − SPEC  (규격 이탈 시 색상 강조)
//   + 엑셀 내보내기(WSXlsx) — 원료매트릭스 파일 양식 재현
// ============================================================

const RawMatrixPage = (() => {
  let from = '';       // YYYY-MM-DD
  let to = '';
  let query = '';
  let hideEmpty = true; // 값 전혀 없는 항목열 숨김

  // 매트릭스 항목 = 원료Matrix 컬럼 순서. key=플랫폼 항목키, alt=대체키, derived='drymat'(100−수분)
  const COLS = [
    { label: 'Drymat', key: 'moist', derived: 'drymat', dig: 2 },
    { label: 'Prot',   key: 'protein_n', alt: 'protein', dig: 2 },
    { label: 'Fat',    key: 'fat',    dig: 2 },
    { label: 'Fib',    key: 'fiber',  alt: 'fiber_c', dig: 2 },
    { label: 'Ash',    key: 'ash',    dig: 2 },
    { label: 'Ca',     key: 'ca',     dig: 2 },
    { label: 'P',      key: 'p',      dig: 2 },
    { label: 'ADF',    key: 'adf',    dig: 2 },
    { label: 'NDF',    key: 'ndf',    dig: 2 },
    { label: 'Starch', key: 'starch', dig: 2 },
    { label: 'KOH',    key: 'koh',    dig: 1 },
    { label: 'PD',     key: 'pd_0_0002', dig: 2 },
    { label: 'Cu',     key: 'cu_ppm', dig: 1 },
    { label: 'Zn',     key: 'zn_ppm', dig: 1 },
  ];

  const pad = (n) => (n < 10 ? '0' + n : '' + n);
  const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const fmtDate = (s) => {
    if (!s) return '';
    const str = String(s);
    return str.length >= 10 ? str.slice(0, 10) : str;
  };

  // 기본 기간: 이번 달 1일 ~ 오늘
  const ensureRange = () => {
    if (from && to) return;
    const now = new Date();
    to = ymd(now);
    from = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  const quick = (kind) => {
    const now = new Date();
    if (kind === 'thisMonth') { from = ymd(new Date(now.getFullYear(), now.getMonth(), 1)); to = ymd(now); }
    else if (kind === 'lastMonth') { from = ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)); to = ymd(new Date(now.getFullYear(), now.getMonth(), 0)); }
    else if (kind === '3m') { from = ymd(new Date(now.getFullYear(), now.getMonth() - 2, 1)); to = ymd(now); }
    else if (kind === 'all') { from = '2000-01-01'; to = ymd(now); }
    rerender();
  };

  const LDB = () => (typeof LabDB !== 'undefined') ? LabDB : null;
  const num = (v) => (typeof v === 'number' && isFinite(v)) ? v : null;
  const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const fmt = (v, dig) => (v == null || !isFinite(v)) ? '' : (+v).toFixed(dig);

  // 원료 설계 기준값(원료스펙 시트 임포트) — 매트릭스 SPEC(1)의 1순위 소스
  const RAW = () => (typeof window !== 'undefined' && window.RAW_SPECS && window.RAW_SPECS.specs) ? window.RAW_SPECS.specs : null;
  const refSpec = (code, key) => {
    const r = RAW();
    const v = r && r[code] ? r[code][key] : null;
    return (typeof v === 'number' && isFinite(v)) ? v : null;
  };

  // 규격 기준값: 원료스펙(단일 기준값) 우선 → 없으면 규격관리 수동규격(min·max)
  const specTarget = (code, key) => {
    const rv = refSpec(code, key);
    if (rv != null) return { t: rv, source: 'ref' };
    const db = LDB();
    if (db && db.resolveSpec) {
      const sp = db.resolveSpec('raw', code, key);
      if (sp && sp.source === 'manual') {
        if (sp.min != null && sp.max != null) return { t: (sp.min + sp.max) / 2, min: sp.min, max: sp.max, source: 'manual' };
        if (sp.max != null) return { t: sp.max, min: sp.min, max: sp.max, source: 'manual' };
        if (sp.min != null) return { t: sp.min, min: sp.min, max: sp.max, source: 'manual' };
      }
    }
    return null;
  };
  const verdict = (code, key, val) => {
    const db = LDB(); if (!db || !db.judge || val == null) return 'NA';
    return db.judge('raw', code, key, val);
  };

  // 기간 내 원료 레코드 → 코드별 그룹 → 매트릭스 행 데이터
  const build = () => {
    ensureRange();
    const db = LDB();
    if (!db || !db.getRecords) return { rows: [], usedCols: COLS, total: 0, codes: 0, refCount: (RAW() ? Object.keys(RAW()).length : 0) };
    const fac = (typeof App !== 'undefined' && App.getFactory) ? App.getFactory() : 'ALL';
    const recs = db.getRecords('raw').filter(r => {
      const d = fmtDate(r.date || r.inDate);
      if (!(d && d >= from && d <= to)) return false;
      if (fac && fac !== 'ALL' && r.factory && r.factory !== fac) return false;   // 공장별 구분
      return true;
    });
    const byCode = new Map();
    recs.forEach(r => {
      const c = String(r.code || '').trim();
      if (!c) return;
      if (!byCode.has(c)) byCode.set(c, []);
      byCode.get(c).push(r);
    });

    const rows = [];
    byCode.forEach((list, code) => {
      list.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
      const latest = list[0] || {};
      const name = latest.name || (db.nameOf ? db.nameOf('raw', code) : '') || '';
      const origin = (list.find(r => r.origin) || {}).origin || '';
      const supplier = (list.find(r => r.supplier) || {}).supplier || '';
      const note = (list.find(r => r.note) || {}).note || '';

      const cells = COLS.map(col => {
        let measured = null;
        if (col.derived === 'drymat') {
          const ms = list.map(r => num(r.vals && r.vals.moist)).filter(v => v != null);
          measured = ms.length ? 100 - avg(ms) : null;
        } else {
          let vs = list.map(r => num(r.vals && r.vals[col.key])).filter(v => v != null);
          if (!vs.length && col.alt) vs = list.map(r => num(r.vals && r.vals[col.alt])).filter(v => v != null);
          measured = vs.length ? avg(vs) : null;
        }
        const n = col.derived === 'drymat'
          ? list.filter(r => num(r.vals && r.vals.moist) != null).length
          : list.filter(r => num(r.vals && r.vals[col.key]) != null || (col.alt && num(r.vals && r.vals[col.alt]) != null)).length;

        // SPEC — 원료스펙 기준값 우선. Drymat은 수분 기준값에서 100−환산
        let spec = null, dev = null, tone = '', src = '';
        let st = null;
        if (col.derived === 'drymat') {
          const stm = specTarget(code, 'moist');
          if (stm) { spec = 100 - stm.t; st = { t: spec, source: stm.source }; }
        } else {
          st = specTarget(code, col.key);
          if (st) spec = st.t;
        }
        if (st) src = st.source;
        if (measured != null && spec != null) {
          dev = measured - spec;
          // 색상: 수동 허용규격 이탈(적/청) 우선 → 없으면 기준값 대비 상대편차 15%↑ 주의(황)
          const jv = (col.derived === 'drymat') ? 'NA' : verdict(code, col.key, measured);
          if (jv === 'HIGH') tone = 'hi';
          else if (jv === 'LOW') tone = 'lo';
          else {
            const at = Math.abs(spec);
            tone = (at >= 1 && Math.abs(dev) / at >= 0.15) ? 'warn' : 'ok';
          }
        }
        return { measured, spec, dev, n, tone, src };
      });

      const sampleN = Math.max(0, ...cells.map(c => c.n));
      rows.push({ code, name, origin, supplier, note, cells, sampleN, recCount: list.length });
    });

    rows.sort((a, b) => a.code.localeCompare(b.code));
    // 검색 필터
    const q = query.trim().toLowerCase();
    const shown = q ? rows.filter(r => (r.code + ' ' + r.name).toLowerCase().includes(q)) : rows;

    // 빈 항목열 판정
    const usedCols = hideEmpty
      ? COLS.filter((col, i) => shown.some(r => r.cells[i].measured != null))
      : COLS;

    const refCount = RAW() ? Object.keys(RAW()).length : 0;
    return { rows: shown, usedCols, total: recs.length, codes: byCode.size, refCount };
  };

  // ── 렌더 ──
  const devClass = (c) => {
    if (c.dev == null) return '';
    if (c.tone === 'hi') return 'mx-hi';
    if (c.tone === 'lo') return 'mx-lo';
    if (c.tone === 'warn') return 'mx-warn';
    return 'mx-ok';
  };

  const render = () => {
    ensureRange();
    const data = build();
    const cols = data.usedCols;
    const colIdx = cols.map(c => COLS.indexOf(c));

    const head = `
      <tr class="mx-head">
        <th class="mx-sticky mx-c-code">코드</th>
        <th class="mx-sticky mx-c-name">원료명</th>
        <th class="mx-c-org">원산지</th>
        <th class="mx-c-sup">모선/공급사</th>
        <th class="mx-c-row"></th>
        ${cols.map(c => `<th class="mx-num">${c.label}</th>`).join('')}
        <th class="mx-c-note">비고</th>
        <th class="mx-num">표본</th>
      </tr>`;

    const body = data.rows.map(r => {
      const cell = (i, kind) => {
        const c = r.cells[i];
        if (kind === 'm') return `<td class="mx-num">${fmt(c.measured, COLS[i].dig)}</td>`;
        if (kind === 's') return `<td class="mx-num mx-spec">${c.spec == null ? '' : fmt(c.spec, COLS[i].dig)}</td>`;
        return `<td class="mx-num ${devClass(c)}">${c.dev == null ? '' : (c.dev > 0 ? '+' : '') + fmt(c.dev, COLS[i].dig)}</td>`;
      };
      return `
        <tr class="mx-r1">
          <td class="mx-sticky mx-c-code" rowspan="3">${r.code}</td>
          <td class="mx-sticky mx-c-name" rowspan="3"><b>${r.name || '-'}</b></td>
          <td class="mx-c-org" rowspan="3">${r.origin || ''}</td>
          <td class="mx-c-sup" rowspan="3">${r.supplier || ''}</td>
          <td class="mx-c-row mx-lbl-m">측정평균</td>
          ${colIdx.map(i => cell(i, 'm')).join('')}
          <td class="mx-c-note" rowspan="3">${r.note || ''}</td>
          <td class="mx-num" rowspan="3">${r.sampleN}</td>
        </tr>
        <tr class="mx-r2">
          <td class="mx-c-row mx-lbl-s">SPEC</td>
          ${colIdx.map(i => cell(i, 's')).join('')}
        </tr>
        <tr class="mx-r3">
          <td class="mx-c-row mx-lbl-d">편차(측정−SPEC)</td>
          ${colIdx.map(i => cell(i, 'd')).join('')}
        </tr>`;
    }).join('');

    const empty = !data.rows.length
      ? `<div class="mx-empty">선택한 기간(${from} ~ ${to})에 해당하는 원료 분석대장 기록이 없습니다.<br>
         상단 기간을 넓히거나 <b>전체</b> 버튼을 눌러보세요.</div>`
      : '';

    let facLabel = '';
    try { const f = App.getFactory && App.getFactory(); facLabel = (f && f !== 'ALL') ? ({ NS: '논산', GS: '경산', AS: '아산', HQ: '본사' }[f] || f) : '전체'; } catch (_) {}

    return `
      <style>
        .mx-wrap{max-width:100%;}
        .mx-toolbar{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:12px;
          background:var(--bg-surface,#fff);border:1px solid var(--border,#e3e3e3);border-radius:6px;padding:12px 14px;}
        .mx-fg{display:flex;flex-direction:column;gap:3px;}
        .mx-fg label{font-size:11px;color:var(--text-secondary,#5c5f66);}
        .mx-fg input{border:1px solid var(--border,#d5d5d5);border-radius:4px;padding:6px 8px;font-size:13px;background:var(--bg-input,#fff);color:var(--text-primary,#171a20);}
        .mx-quick{display:flex;gap:4px;}
        .mx-quick button,.mx-btn{border:1px solid var(--border,#d5d5d5);background:var(--bg-soft,#f5f5f5);border-radius:4px;padding:6px 11px;font-size:12px;cursor:pointer;font-family:inherit;color:var(--text-primary,#171a20);}
        .mx-quick button:hover,.mx-btn:hover{border-color:var(--accent,#3E6AE1);}
        .mx-btn-primary{background:var(--accent,#3E6AE1);color:#fff;border-color:var(--accent,#3E6AE1);font-weight:600;}
        .mx-spacer{flex:1;}
        .mx-chk{display:flex;align-items:center;gap:5px;font-size:12px;color:var(--text-secondary,#5c5f66);cursor:pointer;}
        .mx-meta{font-size:12px;color:var(--text-secondary,#5c5f66);margin:0 0 10px;}
        .mx-meta b{color:var(--accent,#3E6AE1);}
        .mx-scroll{overflow-x:auto;border:1px solid var(--border,#e3e3e3);border-radius:6px;}
        table.mx{border-collapse:collapse;font-size:12px;white-space:nowrap;background:var(--bg-surface,#fff);}
        table.mx th,table.mx td{border:1px solid var(--border,#ececec);padding:4px 8px;text-align:center;}
        table.mx th{background:var(--bg-soft,#f4f4f6);font-weight:600;position:sticky;top:0;z-index:2;}
        .mx-num{text-align:right;font-variant-numeric:tabular-nums;min-width:52px;}
        .mx-c-code{min-width:56px;} .mx-c-name{min-width:150px;text-align:left;}
        .mx-c-org{min-width:70px;} .mx-c-sup{min-width:120px;text-align:left;font-size:11px;color:var(--text-secondary,#666);}
        .mx-c-note{min-width:90px;font-size:11px;color:var(--text-secondary,#666);}
        .mx-c-row{min-width:110px;text-align:left;font-size:11px;font-weight:600;color:var(--text-secondary,#5c5f66);background:var(--bg-soft,#fafafb);}
        .mx-sticky{position:sticky;left:0;background:var(--bg-surface,#fff);z-index:1;}
        .mx-c-name.mx-sticky{left:56px;}
        table.mx th.mx-sticky{z-index:3;}
        .mx-r1 td{background:var(--bg-surface,#fff);}
        .mx-r2 .mx-spec{color:#5b6470;background:#fbfbfd;}
        .mx-lbl-m{color:#171a20;} .mx-lbl-s{color:#8a8f96;} .mx-lbl-d{color:#c0392b;}
        .mx-r3 td{background:#fcfcfd;}
        .mx-hi{color:#c0392b;font-weight:700;background:#fdecec !important;}
        .mx-lo{color:#2563eb;font-weight:700;background:#eaf1fe !important;}
        .mx-warn{color:#b8860b;font-weight:700;background:#fff7e6 !important;}
        .mx-ok{color:#16884a;}
        .mx-empty{padding:40px;text-align:center;color:var(--text-secondary,#5c5f66);line-height:1.7;}
        @media (prefers-color-scheme:dark){
          .mx-r2 .mx-spec,.mx-r3 td,.mx-c-row{background:transparent;}
          .mx-hi{background:#3a1e1e !important;} .mx-lo{background:#1e2740 !important;} .mx-warn{background:#3a331e !important;}
        }
      </style>
      <div class="mx-wrap">
        <div class="mx-toolbar">
          <div class="mx-fg"><label>시작일</label><input type="date" value="${from}" onchange="RawMatrixPage.setFrom(this.value)"></div>
          <div class="mx-fg"><label>종료일</label><input type="date" value="${to}" onchange="RawMatrixPage.setTo(this.value)"></div>
          <div class="mx-quick">
            <button onclick="RawMatrixPage.quick('thisMonth')">이번달</button>
            <button onclick="RawMatrixPage.quick('lastMonth')">지난달</button>
            <button onclick="RawMatrixPage.quick('3m')">최근3개월</button>
            <button onclick="RawMatrixPage.quick('all')">전체</button>
          </div>
          <div class="mx-fg"><label>원료 검색</label><input type="text" placeholder="코드·원료명" value="${query}" oninput="RawMatrixPage.setQuery(this.value)"></div>
          <div class="mx-spacer"></div>
          <label class="mx-chk"><input type="checkbox" ${hideEmpty ? 'checked' : ''} onchange="RawMatrixPage.toggleEmpty(this.checked)"> 빈 항목열 숨김</label>
          <button class="mx-btn mx-btn-primary" onclick="RawMatrixPage.exportXlsx()">📥 엑셀 내보내기</button>
        </div>
        <p class="mx-meta">
          기간 <b>${from} ~ ${to}</b> · 공장 <b>${facLabel}</b> · 원료 <b>${data.codes}</b>종 · 분석기록 <b>${data.total}</b>건에서 자동 집계.
          측정평균 = 분석대장 평균, SPEC = 원료스펙 기준값(${data.refCount}종 로드), 편차 = 측정−SPEC.
          <b>🔴</b>상한초과 · <b>🔵</b>하한미달 · <b style="color:#b8860b">🟡</b>기준값 대비 15%↑ 편차.
        </p>
        ${empty}
        <div class="mx-scroll" ${data.rows.length ? '' : 'style="display:none"'}>
          <table class="mx"><thead>${head}</thead><tbody>${body}</tbody></table>
        </div>
      </div>`;
  };

  const rerender = () => {
    const el = document.getElementById('page-content');
    if (!el) return;
    const y = window.pageYOffset || document.documentElement.scrollTop || 0;   // 스크롤 위치 유지
    el.innerHTML = render();
    try { window.scrollTo({ top: y, left: 0, behavior: 'auto' }); } catch (_) { window.scrollTo(0, y); }
  };

  // ── 엑셀 내보내기 (원료Matrix 양식 재현) ──
  const exportXlsx = () => {
    if (typeof WSXlsx === 'undefined') { try { App.toast('엑셀 모듈을 불러올 수 없습니다.'); } catch (_) {} return; }
    const data = build();
    const cols = data.usedCols;
    const colIdx = cols.map(c => COLS.indexOf(c));
    const rows = [];
    rows.push([`원료 매트릭스  (${from} ~ ${to})`]);
    rows.push(['코드', '원료명', '원산지', '모선/공급사', '구분', ...cols.map(c => c.label), '비고', '표본']);
    data.rows.forEach(r => {
      const line = (kind) => {
        const arr = [r.code, r.name, r.origin, r.supplier];
        arr.push(kind === 'm' ? '측정평균' : kind === 's' ? 'SPEC' : '편차');
        colIdx.forEach(i => {
          const c = r.cells[i];
          const v = kind === 'm' ? c.measured : kind === 's' ? c.spec : c.dev;
          arr.push(v == null ? '' : +(+v).toFixed(COLS[i].dig));
        });
        arr.push(kind === 'm' ? r.note : '');
        arr.push(kind === 'm' ? r.sampleN : '');
        return arr;
      };
      rows.push(line('m')); rows.push(line('s')); rows.push(line('d'));
    });
    const fname = `원료매트릭스_${from}_${to}.xlsx`;
    try { WSXlsx.download(fname, [{ name: '원료매트릭스', rows }]); App.toast && App.toast('엑셀 파일을 내려받았습니다.'); }
    catch (e) { try { App.toast('내보내기 실패: ' + e.message); } catch (_) {} }
  };

  return {
    render,
    setFrom: (v) => { from = v; rerender(); },
    setTo: (v) => { to = v; rerender(); },
    setQuery: (v) => { query = v; rerender(); },
    toggleEmpty: (v) => { hideEmpty = v; rerender(); },
    quick,
    exportXlsx,
  };
})();
