// ============================================================
// lab_dashboard.js — 품질 대시보드
//   ① 가축질병 위기단계(실시간, disease_alert.js)
//   ② 성분 대시보드(제품): 항목(수분/조단백/조지방) × 축종(전체/양축/양어/반려/기타) 원터치 필터
//   ③ 원료 대시보드: 같은 항목의 원료 추세 + 원료별 분석 현황 표
//   기간: 가장 최근 분석일 기준 최근 90일 (데이터 기준 앵커)
// ============================================================

const LabDashboardPage = (() => {
  let catFilter = 'ALL';     // 축종 필터 (제품 대시보드)
  let itemFilter = 'moist';  // 제품 대시보드 항목: moist | protein | fat
  let prodPick = 'ALL';      // 제품 대시보드 선택: 'ALL'(전체) | 제품코드
  let rawSel = 'ALL';        // 원료 대시보드 선택: 'ALL'(전체) | 원료코드
  let rawItemFilter = 'moist';          // 원료 대시보드 항목 (제품과 독립)
  let periodDays = 90;       // 제품 기간 프리셋: 30 | 60 | 90 (최신 분석일 앵커)
  let customFrom = '', customTo = '';   // 제품 직접 입력 기간
  let rawPeriodDays = 90;               // 원료 기간 프리셋 (제품과 독립)
  let rawCustomFrom = '', rawCustomTo = '';   // 원료 직접 입력 기간
  let prodChart = null, rawChart = null;

  // ── 대시보드 카드 순서 (드래그로 재정렬, localStorage 유지) ──
  const ORDER_KEY = 'lab_dash_card_order';
  const CARD_KEYS = ['prod', 'raw'];
  let cardOrder = null;
  const loadOrder = () => {
    if (!cardOrder) {
      try { const s = JSON.parse(localStorage.getItem(ORDER_KEY)); if (Array.isArray(s)) cardOrder = s; } catch (_) {}
      if (!Array.isArray(cardOrder)) cardOrder = CARD_KEYS.slice();
    }
    // 유효성 보정: 알 수 없는 키 제거 + 누락 키 보충
    cardOrder = cardOrder.filter(k => CARD_KEYS.includes(k));
    CARD_KEYS.forEach(k => { if (!cardOrder.includes(k)) cardOrder.push(k); });
    return cardOrder;
  };
  const saveOrder = () => { try { localStorage.setItem(ORDER_KEY, JSON.stringify(cardOrder)); } catch (_) {} };

  const CATS = ['양축', '양어', '반려', '기타'];
  const CAT_ICON = { 양축: '', 양어: '', 반려: '', 기타: '' };
  const catOf = (r) => r.category || LabDB.productCategory(r.code);

  // 항목 정의 — protein 은 조단백(N정량) 우선, 없으면 Kjeldahl 값 사용
  const ITEMS = {
    moist:   { label: '수분',   icon: '', keys: ['moist'] },
    protein: { label: '조단백', icon: '', keys: ['protein_n', 'protein'] },
    fat:     { label: '조지방', icon: '', keys: ['fat'] },
  };
  const valOf = (r, itemKey) => {
    for (const k of ITEMS[itemKey].keys) {
      const v = r.vals && r.vals[k];
      if (typeof v === 'number') return { v, key: k };
    }
    return null;
  };

  // ── 기간: 최신 분석일 앵커 90일 ──
  const anchorDate = () => {
    let mx = '';
    LabDB.getRecords('ALL').forEach(r => { const d = String(r.date || '').slice(0, 10); if (d > mx) mx = d; });
    return mx || new Date().toISOString().slice(0, 10);
  };
  const rangeOf = (days, cf, ct) => {
    if (cf || ct) {
      return { from: cf || '0000-01-01', to: ct || anchorDate(), label: '직접 입력' };
    }
    const to = anchorDate();
    const a = new Date(to + 'T00:00:00'); a.setDate(a.getDate() - (days - 1));
    return { from: a.toISOString().slice(0, 10), to, label: `최근 ${days}일` };
  };
  const inRange = (r, rg) => { const d = String(r.date || '').slice(0, 10); return d >= rg.from && d <= rg.to; };

  // ── 통계 헬퍼 (선택 항목 기준) ──
  const mean = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const itemStats = (recs, kind, itemKey) => {
    const vals = []; let high = 0, low = 0, n = 0;
    recs.forEach(r => {
      const hit = valOf(r, itemKey);
      if (!hit) return;
      n++; vals.push(hit.v);
      const verdict = LabDB.judge(kind, r.code, hit.key, hit.v);
      if (verdict === 'HIGH') high++; else if (verdict === 'LOW') low++;
    });
    return {
      n, mean: mean(vals), high, low, dev: high + low,
      min: vals.length ? Math.min(...vals) : null,
      max: vals.length ? Math.max(...vals) : null,
    };
  };
  // 일자별 평균·최대·최소 시계열
  const itemSeries = (recs, itemKey) => {
    const byDate = new Map();
    recs.forEach(r => {
      const hit = valOf(r, itemKey);
      if (!hit) return;
      const d = String(r.date || '').slice(0, 10);
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d).push(hit.v);
    });
    const labels = [...byDate.keys()].sort();
    return {
      labels,
      mean: labels.map(d => +mean(byDate.get(d)).toFixed(2)),
      max: labels.map(d => +Math.max(...byDate.get(d)).toFixed(2)),
      min: labels.map(d => +Math.min(...byDate.get(d)).toFixed(2)),
    };
  };

  const statCard = (label, value, sub, tone) => `
    <div class="stat-card ${tone || ''}">
      <div class="stat-label">${label}</div>
      <div class="stat-value">${value}</div>
      <div class="stat-sub">${sub || ''}</div>
    </div>`;

  // ── 원터치 필터 버튼 그룹 (scope: 'prod' | 'raw') ──
  const itemTabs = (scope) => {
    const cur = scope === 'raw' ? rawItemFilter : itemFilter;
    const setFn = scope === 'raw' ? 'setRawItem' : 'setItem';
    return Object.keys(ITEMS).map(k =>
      `<button class="btn btn-sm ${cur === k ? 'btn-primary' : 'btn-ghost'}" onclick="LabDashboardPage.${setFn}('${k}')">${ITEMS[k].icon} ${ITEMS[k].label}</button>`).join('');
  };
  const catTabs = () => {
    const btn = (key, label, icon) => `
      <button class="btn btn-sm ${catFilter === key ? 'btn-primary' : 'btn-ghost'}" onclick="LabDashboardPage.setCat('${key}')">${icon} ${label}</button>`;
    return btn('ALL', '전체', '') + CATS.map(c => btn(c, c, CAT_ICON[c])).join('');
  };
  // ── 원료 선택 드롭다운 (전체 + 개별 원료, 검색형) ──
  //   후보: 분석 레코드가 있는 원료 전체 (건수 내림차순), 코드·명칭 검색
  const rawMatOptions = (q) => {
    const byCode = new Map();
    LabDB.getRecords('raw').forEach(r => {
      if (!byCode.has(r.code)) byCode.set(r.code, { code: r.code, name: r.name || LabDB.nameOf('raw', r.code) || r.code, n: 0 });
      byCode.get(r.code).n++;
    });
    let list = [...byCode.values()];
    const lq = String(q || '').toLowerCase().trim();
    if (lq) list = list.filter(m => m.code.toLowerCase().includes(lq) || (m.name || '').toLowerCase().includes(lq));
    return list.sort((a, b) => b.n - a.n);
  };
  const rawSelName = () => rawSel === 'ALL' ? '전체 원료' : (LabDB.nameOf('raw', rawSel) || rawSel);

  // ── 제품 선택 드롭다운 (전체 + 개별 제품, 검색형 · 현재 축종 필터 반영) ──
  const prodMatOptions = (q) => {
    const byCode = new Map();
    LabDB.getRecords('prod').forEach(r => {
      if (catFilter !== 'ALL' && catOf(r) !== catFilter) return;   // 축종 탭 반영
      if (!byCode.has(r.code)) byCode.set(r.code, { code: r.code, name: r.name || LabDB.nameOf('prod', r.code) || r.code, n: 0 });
      byCode.get(r.code).n++;
    });
    let list = [...byCode.values()];
    const lq = String(q || '').toLowerCase().trim();
    if (lq) list = list.filter(m => m.code.toLowerCase().includes(lq) || (m.name || '').toLowerCase().includes(lq));
    return list.sort((a, b) => b.n - a.n);
  };
  const prodSelName = () => prodPick === 'ALL' ? '전체 제품' : (LabDB.nameOf('prod', prodPick) || prodPick);
  const prodSugHtml = (q) => {
    const opts = prodMatOptions(q);
    const totalCnt = opts.reduce((a, m) => a + m.n, 0);
    const allRow = `<div class="qd-sug-row${prodPick === 'ALL' ? ' sel' : ''}" onmousedown="LabDashboardPage.pickProd('ALL')">
      <b>전체 제품</b> <span class="text-muted">(${totalCnt}건${catFilter !== 'ALL' ? ' · ' + esc(catFilter) : ''})</span></div>`;
    const rows = opts.slice(0, 60).map(m => `
      <div class="qd-sug-row${m.code === prodPick ? ' sel' : ''}" onmousedown="LabDashboardPage.pickProd('${esc(m.code)}')">
        <span class="mono">${esc(m.code)}</span> ${esc(m.name)} <span class="text-muted">(${m.n})</span></div>`).join('');
    return allRow + (rows || '<div class="text-muted" style="padding:8px 10px;font-size:12px">검색 결과 없음</div>');
  };
  const rawSugHtml = (q) => {
    const opts = rawMatOptions(q);
    const allRow = `<div class="qd-sug-row${rawSel === 'ALL' ? ' sel' : ''}" onmousedown="LabDashboardPage.pickRaw('ALL')">
      <b>전체 원료</b> <span class="text-muted">(${LabDB.getRecords('raw').length}건)</span></div>`;
    const rows = opts.slice(0, 60).map(m => `
      <div class="qd-sug-row${m.code === rawSel ? ' sel' : ''}" onmousedown="LabDashboardPage.pickRaw('${esc(m.code)}')">
        <span class="mono">${esc(m.code)}</span> ${esc(m.name)} <span class="text-muted">(${m.n})</span></div>`).join('');
    return allRow + (rows || '<div class="text-muted" style="padding:8px 10px;font-size:12px">검색 결과 없음</div>');
  };

  // 기간: 프리셋(30/60/90일) + 직접 입력 (scope: 'prod' | 'raw' — 각 대시보드 독립)
  const periodTabs = (scope) => {
    const raw = scope === 'raw';
    const days = raw ? rawPeriodDays : periodDays;
    const cf = raw ? rawCustomFrom : customFrom;
    const ct = raw ? rawCustomTo : customTo;
    const isCustom = !!(cf || ct);
    const setFn = raw ? 'setRawPeriod' : 'setPeriod';
    const applyFn = raw ? 'applyRawRange' : 'applyRange';
    const fromId = raw ? 'qd-raw-from' : 'qd-from';
    const toId = raw ? 'qd-raw-to' : 'qd-to';
    const btn = (d) => `<button class="btn btn-sm ${!isCustom && days === d ? 'btn-primary' : 'btn-ghost'}" onclick="LabDashboardPage.${setFn}(${d})">${d}일</button>`;
    return `${btn(30)}${btn(60)}${btn(90)}
      <input type="date" class="form-input form-input-sm" id="${fromId}" value="${cf}" style="width:130px">
      <span class="text-muted" style="font-size:11px">~</span>
      <input type="date" class="form-input form-input-sm" id="${toId}" value="${ct}" style="width:130px">
      <button class="btn btn-sm ${isCustom ? 'btn-primary' : 'btn-ghost'}" onclick="LabDashboardPage.${applyFn}()">조회</button>`;
  };

  const render = () => {
    const rg = rangeOf(periodDays, customFrom, customTo);          // 제품 기간
    const it = ITEMS[itemFilter];
    const rawRg = rangeOf(rawPeriodDays, rawCustomFrom, rawCustomTo);   // 원료 기간(독립)
    const rawIt = ITEMS[rawItemFilter];
    const prodAll = LabDB.getRecords('prod').filter(r => inRange(r, rg));
    const prodByCat = catFilter === 'ALL' ? prodAll : prodAll.filter(r => catOf(r) === catFilter);
    const prodView = prodPick === 'ALL' ? prodByCat : prodAll.filter(r => r.code === prodPick);
    const rawAll = LabDB.getRecords('raw').filter(r => inRange(r, rawRg));
    const rawView = rawSel === 'ALL' ? rawAll : rawAll.filter(r => r.code === rawSel);

    const ps = itemStats(prodView, 'prod', itemFilter);   // 선택 제품(또는 축종 전체) 기준
    const rs = itemStats(rawView, 'raw', rawItemFilter);  // 선택 원료(또는 전체) 기준

    // 원료별 분석 현황 (분석건수 상위 10 · 원료 항목 기준) — 클릭 시 해당 원료 선택
    const byMat = new Map();
    rawAll.forEach(r => {
      if (!byMat.has(r.code)) byMat.set(r.code, { code: r.code, name: r.name, n: 0, vals: [], dev: 0 });
      const o = byMat.get(r.code); o.n++;
      const hit = valOf(r, rawItemFilter);
      if (hit) {
        o.vals.push(hit.v);
        const verdict = LabDB.judge('raw', r.code, hit.key, hit.v);
        if (verdict === 'HIGH' || verdict === 'LOW') o.dev++;
      }
    });
    const mats = [...byMat.values()].sort((a, b) => b.n - a.n).slice(0, 10);
    // 선택 원료가 상위10에 없으면 표 맨 위에 노출
    if (rawSel !== 'ALL' && byMat.has(rawSel) && !mats.some(m => m.code === rawSel)) mats.unshift(byMat.get(rawSel));
    const matRows = mats.length ? mats.map(m => `<tr class="${m.code === rawSel ? 'row-active' : ''}" style="cursor:pointer" onclick="LabDashboardPage.pickRaw('${esc(m.code)}')" title="이 원료만 보기">
        <td class="ellipsis" style="max-width:150px"><b>${esc(m.name || m.code)}</b></td>
        <td class="mono">${m.n}</td>
        <td class="mono">${m.vals.length ? fmtNum(mean(m.vals)) : '-'}</td>
        <td class="mono text-muted">${m.vals.length ? `${fmtNum(Math.min(...m.vals))} ~ ${fmtNum(Math.max(...m.vals))}` : '-'}</td>
        <td>${m.dev > 0 ? `<span class="verdict verdict-high">${m.dev}건</span>` : '<span class="text-muted">−</span>'}</td>
      </tr>`).join('') : `<tr><td colspan="5" class="text-muted" style="text-align:center;padding:18px">기간 내 원료 분석 데이터가 없습니다</td></tr>`;

    const catLabel = catFilter === 'ALL' ? '전체' : catFilter;
    const devSub = (s) => `상한 ${s.high} · 하한 ${s.low}`;

    const dragHandle = (card) => `<span class="qd-drag" draggable="true" data-card="${card}" title="드래그하여 순서 변경">⠿</span>`;
    // 순서 이동 컨트롤: 드래그(데스크톱) + ▲▼ 버튼(터치·모든 기기)
    const orderControls = (card) => {
      const order = loadOrder();
      const i = order.indexOf(card);
      const up = i > 0, down = i >= 0 && i < order.length - 1;
      return `<span class="qd-order">${dragHandle(card)}` +
        `<button class="qd-move" ${up ? '' : 'disabled'} onclick="LabDashboardPage.moveCard('${card}',-1)" title="위로 이동">▲</button>` +
        `<button class="qd-move" ${down ? '' : 'disabled'} onclick="LabDashboardPage.moveCard('${card}',1)" title="아래로 이동">▼</button></span>`;
    };

    const prodCard = `
      <div class="qd-block" data-card="prod">
      <div class="card">
        <div class="card-head" style="flex-wrap:wrap;gap:8px">
          <div class="card-title" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">${orderControls('prod')}제품 대시보드
            <span class="tag tag-green" style="font-size:10px">제품 · ${esc(catLabel)} · ${esc(prodSelName())}</span>
          </div>
          <span class="text-muted" style="font-size:12px">${(customFrom || customTo) ? (customFrom || '처음') : rg.from} ~ ${rg.to} (${rg.label})</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;margin-bottom:6px">
          <span class="text-muted" style="font-size:11px">항목</span>${itemTabs('prod')}
          <span class="text-muted" style="font-size:11px;margin-left:6px">축종</span>${catTabs()}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;margin-bottom:6px">
          <span class="text-muted" style="font-size:11px">제품 선택</span>
          <button class="btn btn-sm ${prodPick === 'ALL' ? 'btn-primary' : 'btn-ghost'}" onclick="LabDashboardPage.pickProd('ALL')">전체</button>
          <div style="position:relative;min-width:250px">
            <input type="text" class="form-input form-input-sm" id="qd-prodsel" value="${esc(prodSelName())}"
              placeholder="제품 검색 (코드·명칭)" autocomplete="off" data-nonav
              onfocus="LabDashboardPage.prodOpen()" oninput="LabDashboardPage.prodSearch(this.value)"
              onblur="LabDashboardPage.prodBlur()">
            <div id="qd-prodsel-sug" class="qd-sug-box" style="display:none"></div>
          </div>
          ${prodPick !== 'ALL' ? `<span class="text-muted" style="font-size:11px">· 개별 제품 모니터링 중 (축종 필터 무시)</span>` : ''}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:10px">
          <span class="text-muted" style="font-size:11px">기간</span>${periodTabs('prod')}
        </div>
        <div class="stat-grid" style="margin-bottom:10px">
          ${statCard('분석 건수', fmtNum(ps.n, 0), `${it.label} 측정 기준`)}
          ${statCard(`평균 ${it.label}`, ps.mean != null ? fmtNum(ps.mean) + '%' : '−', '기간 평균')}
          ${statCard('최소 ~ 최대', ps.n ? `${fmtNum(ps.min)} ~ ${fmtNum(ps.max)}%` : '−', '기간 범위')}
          ${statCard('규격 이탈', fmtNum(ps.dev, 0), devSub(ps), ps.dev > 0 ? 'danger' : 'ok')}
        </div>
        <div class="chart-frame" style="height:230px"><canvas id="qd-prod-chart"></canvas></div>
      </div>
      </div>`;

    const rawCard = `
      <div class="qd-block" data-card="raw">
      <div class="card">
        <div class="card-head" style="flex-wrap:wrap;gap:8px">
          <div class="card-title" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">${orderControls('raw')}원료 대시보드 <span class="tag tag-blue" style="font-size:10px">원료 · ${esc(rawIt.label)} · ${esc(rawSelName())}</span></div>
          <span class="text-muted" style="font-size:12px">${(rawCustomFrom || rawCustomTo) ? (rawCustomFrom || '처음') : rawRg.from} ~ ${rawRg.to} (${rawRg.label})</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;margin-bottom:6px">
          <span class="text-muted" style="font-size:11px">항목</span>${itemTabs('raw')}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;margin-bottom:6px">
          <span class="text-muted" style="font-size:11px">원료 선택</span>
          <button class="btn btn-sm ${rawSel === 'ALL' ? 'btn-primary' : 'btn-ghost'}" onclick="LabDashboardPage.pickRaw('ALL')">전체</button>
          <div style="position:relative;min-width:250px" class="qd-rawsel-wrap">
            <input type="text" class="form-input form-input-sm" id="qd-rawsel" value="${esc(rawSelName())}"
              placeholder="원료 검색 (코드·명칭)" autocomplete="off" data-nonav
              onfocus="LabDashboardPage.rawOpen()" oninput="LabDashboardPage.rawSearch(this.value)"
              onblur="LabDashboardPage.rawBlur()">
            <div id="qd-rawsel-sug" class="qd-sug-box" style="display:none"></div>
          </div>
          ${rawSel !== 'ALL' ? `<span class="text-muted" style="font-size:11px">· 표에서 원료를 클릭해 바꿀 수 있습니다</span>` : ''}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:10px">
          <span class="text-muted" style="font-size:11px">기간</span>${periodTabs('raw')}
        </div>
        <div class="stat-grid" style="margin-bottom:10px">
          ${statCard('원료 분석 건수', fmtNum(rs.n, 0), `${rawIt.label} 측정 기준`)}
          ${statCard(`평균 ${rawIt.label}`, rs.mean != null ? fmtNum(rs.mean) + '%' : '−', '기간 평균')}
          ${statCard('최소 ~ 최대', rs.n ? `${fmtNum(rs.min)} ~ ${fmtNum(rs.max)}%` : '−', '기간 범위')}
          ${statCard('규격 이탈', fmtNum(rs.dev, 0), devSub(rs), rs.dev > 0 ? 'danger' : 'ok')}
        </div>
        <div class="qd-raw-grid">
          <div class="chart-frame" style="height:230px"><canvas id="qd-raw-chart"></canvas></div>
          <div class="table-wrap" style="max-height:250px;overflow:auto">
            <table class="data-table compact">
              <thead><tr><th>원료</th><th>n</th><th>${esc(rawIt.label)}평균</th><th>범위</th><th>이탈</th></tr></thead>
              <tbody>${matRows}</tbody>
            </table>
          </div>
        </div>
      </div>
      </div>`;

    const cards = { prod: prodCard, raw: rawCard };
    return `
    <div class="fade-in">
      ${DiseaseAlert.render()}
      <div id="qd-cards" style="margin-top:14px">
        ${loadOrder().map(k => cards[k]).join('')}
      </div>
    </div>`;
  };

  // ── 차트 ──
  // 툴팁 동작(3계열 동시 표시·커서 추적·크로스헤어)은 js/chart_common.js 전역 설정을 따른다.
  const lineChart = (canvasId, series, label, color, bg) => {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return null;
    return new Chart(canvas, {
      type: 'line',
      data: {
        labels: series.labels,
        datasets: [
          { label: `${label} 평균(%)`, data: series.mean, borderColor: color, backgroundColor: bg, tension: 0.25, pointRadius: 2, fill: true },
          { label: '최대(%)', data: series.max, borderColor: '#ff5c7a', borderDash: [5, 4], pointRadius: 0, fill: false },
          { label: '최소(%)', data: series.min, borderColor: '#ffb020', borderDash: [3, 4], pointRadius: 0, fill: false },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#c7d0e0', boxWidth: 12, font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: (c) => {
                const v = c.parsed.y;
                return ` ${c.dataset.label}: ${(v == null || !isFinite(v)) ? '-' : v.toFixed(2)}`;
              },
            },
          },
        },
        scales: {
          x: { ticks: { color: '#8892a6', maxTicksLimit: 8, font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { ticks: { color: '#8892a6', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
        },
      },
    });
  };

  const drawCharts = () => {
    const rg = rangeOf(periodDays, customFrom, customTo);
    const it = ITEMS[itemFilter];
    const rawRg = rangeOf(rawPeriodDays, rawCustomFrom, rawCustomTo);
    const rawIt = ITEMS[rawItemFilter];
    const prodAll = LabDB.getRecords('prod').filter(r => inRange(r, rg));
    const prodByCat = catFilter === 'ALL' ? prodAll : prodAll.filter(r => catOf(r) === catFilter);
    const prodView = prodPick === 'ALL' ? prodByCat : prodAll.filter(r => r.code === prodPick);
    const rawAll = LabDB.getRecords('raw').filter(r => inRange(r, rawRg));
    const rawView = rawSel === 'ALL' ? rawAll : rawAll.filter(r => r.code === rawSel);
    if (prodChart) { try { prodChart.destroy(); } catch (_) {} prodChart = null; }
    if (rawChart) { try { rawChart.destroy(); } catch (_) {} rawChart = null; }
    prodChart = lineChart('qd-prod-chart', itemSeries(prodView, itemFilter), `제품 ${it.label}`, '#4f9cff', 'rgba(79,156,255,0.12)');
    rawChart = lineChart('qd-raw-chart', itemSeries(rawView, rawItemFilter), `원료 ${rawIt.label}`, '#2e9e5b', 'rgba(46,158,91,0.12)');
  };

  const setCat = (c) => { catFilter = c; prodPick = 'ALL'; App.refreshPage(); };   // 축종 변경 시 개별 제품 선택 해제
  const setItem = (k) => { if (ITEMS[k]) { itemFilter = k; App.refreshPage(); } };
  const setRawItem = (k) => { if (ITEMS[k]) { rawItemFilter = k; App.refreshPage(); } };

  // ── 제품 선택 드롭다운 동작 ──
  const prodShowSug = (q) => {
    const box = document.getElementById('qd-prodsel-sug');
    if (!box) return;
    box.innerHTML = prodSugHtml(q);
    box.style.display = 'block';
  };
  const prodOpen = () => { const inp = document.getElementById('qd-prodsel'); if (inp) inp.value = ''; prodShowSug(''); };
  const prodSearch = (v) => prodShowSug(v);
  const prodBlur = () => {
    setTimeout(() => {
      const box = document.getElementById('qd-prodsel-sug'); if (box) box.style.display = 'none';
      const inp = document.getElementById('qd-prodsel'); if (inp) inp.value = prodSelName();
    }, 160);
  };
  const pickProd = (code) => { prodPick = code; App.refreshPage(); };

  // ── 원료 선택 드롭다운 동작 ──
  const rawShowSug = (q) => {
    const box = document.getElementById('qd-rawsel-sug');
    if (!box) return;
    box.innerHTML = rawSugHtml(q);
    box.style.display = 'block';
  };
  const rawOpen = () => {
    const inp = document.getElementById('qd-rawsel');
    if (inp) { inp.value = ''; }   // 포커스 시 비워 바로 검색 가능
    rawShowSug('');
  };
  const rawSearch = (v) => rawShowSug(v);
  const rawBlur = () => {
    // 클릭(onmousedown) 처리 후 닫기 — 값 미선택 시 현재 선택명 복원
    setTimeout(() => {
      const box = document.getElementById('qd-rawsel-sug');
      if (box) box.style.display = 'none';
      const inp = document.getElementById('qd-rawsel');
      if (inp) inp.value = rawSelName();
    }, 160);
  };
  const pickRaw = (code) => { rawSel = code; App.refreshPage(); };
  const setPeriod = (d) => { periodDays = d; customFrom = ''; customTo = ''; App.refreshPage(); };
  const applyRange = () => {
    const f = document.getElementById('qd-from')?.value || '';
    const t = document.getElementById('qd-to')?.value || '';
    if (!f && !t) { App.toast('시작일 또는 종료일을 입력하세요', 'warning'); return; }
    if (f && t && f > t) { App.toast('시작일이 종료일보다 늦습니다', 'error'); return; }
    customFrom = f; customTo = t;
    App.refreshPage();
  };
  const setRawPeriod = (d) => { rawPeriodDays = d; rawCustomFrom = ''; rawCustomTo = ''; App.refreshPage(); };
  const applyRawRange = () => {
    const f = document.getElementById('qd-raw-from')?.value || '';
    const t = document.getElementById('qd-raw-to')?.value || '';
    if (!f && !t) { App.toast('시작일 또는 종료일을 입력하세요', 'warning'); return; }
    if (f && t && f > t) { App.toast('시작일이 종료일보다 늦습니다', 'error'); return; }
    rawCustomFrom = f; rawCustomTo = t;
    App.refreshPage();
  };

  // 원료 대시보드 2단 그리드 스타일 (1회 주입)
  const ensureStyle = () => {
    if (document.getElementById('qd-style')) return;
    const st = document.createElement('style'); st.id = 'qd-style';
    st.textContent = `
    .qd-raw-grid{display:grid;grid-template-columns:1.2fr 1fr;gap:14px;align-items:stretch;}
    @media (max-width:900px){ .qd-raw-grid{grid-template-columns:1fr;} }
    .qd-sug-box{position:absolute;top:100%;left:0;right:0;z-index:60;margin-top:2px;background:var(--bg-card,#1a1d27);
      border:1px solid var(--border,#2a2f3d);border-radius:8px;max-height:280px;overflow:auto;box-shadow:0 10px 30px rgba(0,0,0,.4);}
    .qd-sug-row{padding:7px 10px;font-size:12px;cursor:pointer;border-bottom:1px solid var(--border,#2a2f3d);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .qd-sug-row:hover{background:var(--bg-hover,rgba(255,255,255,.06));}
    .qd-sug-row.sel{background:rgba(79,156,255,.14);}
    .data-table tr.row-active td{background:rgba(46,158,91,.14);}
    .qd-drag{cursor:grab;color:var(--text-muted,#8892a6);font-size:15px;line-height:1;letter-spacing:-2px;
      padding:2px 6px;border-radius:5px;user-select:none;}
    .qd-drag:hover{background:var(--bg-hover,rgba(255,255,255,.08));color:var(--text-primary,#e5e9f0);}
    .qd-drag:active{cursor:grabbing;}
    .qd-order{display:inline-flex;align-items:center;gap:2px;}
    .qd-move{border:1px solid var(--border,#2a2f3d);background:var(--bg-card,#fff);color:var(--text-secondary,#393C41);
      cursor:pointer;font-size:11px;line-height:1;border-radius:4px;padding:3px 6px;}
    .qd-move:hover:not(:disabled){border-color:var(--accent,#3E6AE1);color:var(--accent,#3E6AE1);}
    .qd-move:disabled{opacity:.35;cursor:not-allowed;}
    .qd-block{transition:opacity .15s;}
    .qd-block + .qd-block{margin-top:14px;}
    .qd-block.qd-dragging{opacity:.45;}
    .qd-block.qd-over{outline:2px dashed #4f9cff;outline-offset:3px;border-radius:14px;}`;
    document.head.appendChild(st);
  };

  // ── 카드 드래그 재정렬 (핸들에서만 시작) ──
  const setupDrag = () => {
    const cont = document.getElementById('qd-cards');
    if (!cont) return;
    let dragKey = null;
    const clearMarks = () => cont.querySelectorAll('.qd-block').forEach(b => b.classList.remove('qd-dragging', 'qd-over'));
    cont.querySelectorAll('.qd-drag').forEach(h => {
      h.addEventListener('dragstart', (e) => {
        dragKey = h.getAttribute('data-card');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', dragKey); } catch (_) {}
        h.closest('.qd-block')?.classList.add('qd-dragging');
      });
      h.addEventListener('dragend', () => { dragKey = null; clearMarks(); });
    });
    cont.querySelectorAll('.qd-block').forEach(block => {
      block.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; block.classList.add('qd-over'); });
      block.addEventListener('dragleave', () => block.classList.remove('qd-over'));
      block.addEventListener('drop', (e) => {
        e.preventDefault();
        block.classList.remove('qd-over');
        let from = dragKey;
        if (!from) { try { from = e.dataTransfer.getData('text/plain'); } catch (_) {} }
        const to = block.getAttribute('data-card');
        if (!from || from === to) return;
        const order = loadOrder().slice();
        order.splice(order.indexOf(from), 1);
        const rect = block.getBoundingClientRect();
        const after = e.clientY > rect.top + rect.height / 2;
        let ti = order.indexOf(to);
        if (after) ti += 1;
        order.splice(ti, 0, from);
        cardOrder = order; saveOrder();
        App.refreshPage();
        App.toast('대시보드 순서를 변경했습니다', 'success');
      });
    });
  };

  // ── ▲▼ 버튼 순서 이동 (터치 포함 모든 기기에서 동작) ──
  const moveCard = (card, dir) => {
    const order = loadOrder().slice();
    const i = order.indexOf(card);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    order.splice(i, 1);
    order.splice(j, 0, card);
    cardOrder = order; saveOrder();
    App.refreshPage();
    App.toast('대시보드 순서를 변경했습니다', 'success', 1500);
  };

  const afterRender = () => {
    ensureStyle();
    if (DiseaseAlert.afterRender) DiseaseAlert.afterRender();
    drawCharts();
    setupDrag();
  };

  return { render, afterRender, setCat, setItem, setPeriod, applyRange,
    setRawItem, setRawPeriod, applyRawRange, moveCard,
    pickProd, prodOpen, prodSearch, prodBlur, pickRaw, rawOpen, rawSearch, rawBlur };
})();
