// ============================================================
// pest_control.js — 구서(방서)관리
//   방역업체 월간 결과보고서를 등록·조회, 월별 쥐/벌레 포획 추이와
//   시설점검 특이사항을 한눈에 파악하는 대시보드
// ============================================================

const PestControlPage = (() => {
  let ratChart = null, insectChart = null;
  let detailId = null;   // 선택된 리포트 id (상세보기)
  let showForm = false;  // 새 리포트 등록 폼 표시 여부
  let locFilter = 'ALL'; // 위치 필터: 'ALL' | '공장' | '영업소' | <위치코드>
  let pendingVisits = [];         // PDF 파싱으로 채워진 방문내역(폼에 직접 입력칸 없음 → 저장 시 사용)
  let pendingFacilityCheck = null; // PDF 파싱된 시설점검 전체 항목(신규등록/개선진행중 등)

  const fmt0 = (n) => fmtNum(n, 0);
  const locName = (c) => PestDB.locationName(c);
  const factoryLabel = (f) => PestDB.locationName(f);  // 하위호환 별칭
  // 등록 폼 기본 위치: 필터가 특정 위치면 그대로, 아니면 논산
  const defaultLocation = () => (locFilter && locFilter !== 'ALL' && locFilter !== '공장' && locFilter !== '영업소') ? locFilter : 'NS';
  // PDF 파일명/본문에서 위치명을 추정(공장 4 + 영업소 6)
  const guessLocation = (text) => {
    const t = String(text || '');
    const hit = PestDB.LOCATIONS.find(l => t.includes(l.name) || t.includes(l.name.replace('공장', '').replace('영업소', '')));
    return hit ? hit.code : null;
  };

  const parseKV = (text) => {
    const out = {};
    String(text || '').split('\n').forEach(line => {
      const m = line.trim().match(/^(.+?)[:：]\s*(-?\d+(?:\.\d+)?)$/);
      if (m) out[m[1].trim()] = Number(m[2]);
    });
    return out;
  };
  const kvToLines = (obj) => Object.entries(obj || {}).map(([k, v]) => `${k}:${v}`).join('\n');

  const breakdownRows = (obj, tone) => {
    const entries = Object.entries(obj || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    if (!entries.length) return '<tr><td colspan="2" class="text-muted" style="text-align:center;padding:12px">데이터 없음</td></tr>';
    return entries.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="mono" style="text-align:right"><b class="${tone || ''}">${fmt0(v)}</b></td></tr>`).join('');
  };

  // ── 개요 화면 ──
  const renderOverview = () => {
    const filter = locFilter;
    const isGroupOrAll = filter === 'ALL' || filter === '공장' || filter === '영업소';
    const showLocCol = isGroupOrAll;
    const reports = PestDB.getReports(filter); // desc by month

    // 필터 바 (구분 탭 + 위치 선택)
    const groupTabs = [['ALL', '전체'], ['공장', '공장'], ['영업소', '영업소']].map(([v, l]) =>
      `<button class="btn btn-sm ${filter === v ? 'btn-primary' : 'btn-ghost'}" onclick="PestControlPage.setFilter('${v}')">${l}</button>`).join('');
    const locOptions = ['<option value="ALL">위치 전체</option>'].concat(PestDB.GROUPS.map(g =>
      `<optgroup label="${g}">` + PestDB.getLocations(g).map(l => `<option value="${l.code}" ${filter === l.code ? 'selected' : ''}>${esc(l.name)}</option>`).join('') + `</optgroup>`)).join('');
    const filterBar = `
    <div class="card" style="margin-bottom:14px">
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
        <span class="text-muted" style="font-size:12px">구분</span>${groupTabs}
        <span class="text-muted" style="font-size:12px;margin-left:6px">위치</span>
        <select class="form-input form-input-sm" style="max-width:190px" onchange="PestControlPage.setFilter(this.value)">${locOptions}</select>
        <div style="flex:1"></div>
        <button class="btn btn-primary btn-sm" onclick="PestControlPage.toggleForm()">${showForm ? '✕ 등록 취소' : '＋ 월간 리포트 등록'}</button>
      </div>
    </div>`;

    // 구분별 비교 (공장 vs 영업소, 최근월 기준) — 두 카드 동일 구조·동일 높이
    const gt = PestDB.groupTotals();
    const cmpCard = (g) => { const d = gt[g]; const active = filter === g;
      const kv = (lbl, v, col) => `<div style="min-width:0"><div class="text-muted" style="font-size:11px;white-space:nowrap">${lbl}</div><div class="mono" style="font-size:17px;font-weight:800;line-height:1.15;white-space:nowrap${col ? ';color:' + col : ''}">${fmt0(v)}</div></div>`;
      return `<div class="card" style="margin:0;cursor:pointer;${active ? 'border-color:var(--accent,#4f9cff)' : ''}" onclick="PestControlPage.setFilter('${g}')">
        <div class="section-label">${g === '공장' ? '' : ''} ${g} <span class="text-muted" style="font-size:11px;font-weight:400">· ${d.locations}개소 데이터</span></div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(78px,1fr));gap:12px;margin-top:8px">
          ${kv('쥐 포획', d.rat)}${kv('벌레 포획', d.insect)}${kv('합계', d.total)}${kv('시설 미해결', d.openFacility, d.openFacility > 0 ? '#ff6b81' : '')}${kv('급증 위치', d.spikes, d.spikes > 0 ? '#ff6b81' : '')}
        </div>
      </div>`; };
    const groupCompare = isGroupOrAll ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:14px;margin-bottom:14px;align-items:stretch">${cmpCard('공장')}${cmpCard('영업소')}</div>` : '';

    // 위치별 순위
    const scope = (filter === '공장' || filter === '영업소') ? filter : undefined;
    const locStats = PestDB.byLocationStats(scope).filter(r => r.hasData).sort((a, b) => b.total - a.total);
    const rankRows = locStats.length ? locStats.map((r, i) => `
      <tr onclick="PestControlPage.setFilter('${r.code}')" style="cursor:pointer">
        <td class="mono">${i + 1}</td>
        <td><span class="tag ${r.group === '공장' ? 'tag-blue' : 'tag-gray'}" style="font-size:10px">${r.group}</span> <b>${esc(r.name)}</b></td>
        <td class="text-muted">${esc(r.latestMonth || '-')}</td>
        <td class="mono">${fmt0(r.rat)}</td>
        <td class="mono">${fmt0(r.insect)}${r.spike ? ` <span class="verdict verdict-high" title="전월 대비 ${r.spike.ratio}배">${r.spike.ratio}x</span>` : ''}</td>
        <td class="mono"><b>${fmt0(r.total)}</b></td>
        <td>${r.openFacility > 0 ? `<span class="verdict verdict-high">${r.openFacility}건</span>` : '<span class="verdict verdict-ok">양호</span>'}</td>
      </tr>`).join('') : `<tr><td colspan="7" class="text-muted" style="text-align:center;padding:16px">데이터가 있는 위치가 없습니다. 「＋ 월간 리포트 등록」으로 추가하세요.</td></tr>`;
    const ranking = isGroupOrAll ? `
    <div class="card" style="margin-bottom:14px">
      <div class="section-label">위치별 현황 순위 <span class="text-muted" style="font-size:11px;font-weight:400">· 최근월 합계 기준 · 행 클릭 시 해당 위치</span></div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>#</th><th>위치</th><th>최근월</th><th>쥐</th><th>벌레</th><th>합계</th><th>시설점검</th></tr></thead>
        <tbody>${rankRows}</tbody></table></div>
    </div>` : '';

    // 단일 위치 선택 시: 그 위치 상세 통계 + 이상치 배너
    const s = PestDB.stats(filter);
    const spike = s.spike;
    const singleStats = !isGroupOrAll ? `<div class="stat-grid" style="margin-bottom:14px">
      <div class="stat-card"><div class="stat-label">등록 월수</div><div class="stat-value">${fmt0(s.months)}</div><div class="stat-sub">${esc(locName(filter))}</div></div>
      <div class="stat-card"><div class="stat-label">최근월 쥐 포획</div><div class="stat-value">${fmt0(s.latestRat)}</div><div class="stat-sub">${s.latest ? esc(s.latest.month) : '-'}</div></div>
      <div class="stat-card ${spike ? 'danger' : ''}"><div class="stat-label">최근월 벌레 포획</div><div class="stat-value">${fmt0(s.latestInsect)}</div><div class="stat-sub">${spike ? `전월 대비 ${spike.ratio}배 급증` : (s.latest ? esc(s.latest.month) : '-')}</div></div>
      <div class="stat-card"><div class="stat-label">최근월 합계</div><div class="stat-value">${fmt0(s.latestTotal)}</div><div class="stat-sub">쥐+벌레 전체</div></div>
      <div class="stat-card ${s.openFacility > 0 ? 'danger' : 'ok'}"><div class="stat-label">시설점검 미해결</div><div class="stat-value">${fmt0(s.openFacility)}</div><div class="stat-sub">최근월</div></div>
    </div>` : '';
    const spikeBanner = (!isGroupOrAll && spike) ? `
      <div class="card" style="border-color:rgba(239,68,68,0.4);background:rgba(239,68,68,0.06);margin-bottom:14px">
        <b style="color:#ff6b81">⚠ 이상치 경보</b> — ${esc(locName(filter))} ${esc(s.latest.month)} 벌레 포획량이 전월(${esc(spike.prevMonth)}, ${fmt0(spike.prevValue)}마리) 대비
        <b style="color:#ff6b81">${spike.ratio}배(${fmt0(spike.curValue)}마리)</b>로 급증했습니다.
      </div>` : '';

    const reportRows = reports.map(r => {
      const rat = PestDB.ratTotal(r), insect = PestDB.insectTotal(r), total = PestDB.grandTotal(r);
      const open = PestDB.facilityOpenCount(r);
      const sp = PestDB.spikeVsPrevMonth(r);
      return `<tr onclick="PestControlPage.openDetail('${esc(r.id)}')" style="cursor:pointer">
        <td class="mono"><b>${esc(r.month)}</b></td>
        ${showLocCol ? `<td><span class="tag ${PestDB.locationGroup(PestDB.locOf(r)) === '공장' ? 'tag-blue' : 'tag-gray'}">${esc(locName(PestDB.locOf(r)))}</span></td>` : ''}
        <td class="text-muted">${esc(r.periodStart)} ~ ${esc(r.periodEnd)}</td>
        <td class="mono">${(r.visits || []).length}회</td>
        <td class="mono">${fmt0(rat)}</td>
        <td class="mono">${fmt0(insect)}${sp ? ` <span class="verdict verdict-high" title="전월 대비 ${sp.ratio}배">${sp.ratio}x</span>` : ''}</td>
        <td class="mono"><b>${fmt0(total)}</b></td>
        <td>${open > 0 ? `<span class="verdict verdict-high">${open}건 미해결</span>` : '<span class="verdict verdict-ok">양호</span>'}</td>
        <td class="ellipsis" style="max-width:220px">${esc((r.note || '').slice(0, 60))}${(r.note || '').length > 60 ? '…' : ''}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="${showLocCol ? 9 : 8}" class="text-muted" style="text-align:center;padding:20px">${isGroupOrAll ? '등록된 구서관리 리포트가 없습니다.' : `${esc(locName(filter))}에 등록된 리포트가 없습니다.`}</td></tr>`;

    const win = (id, title, extraHead, body) => `
      <div class="win" data-win="${id}" style="position:static;width:auto;height:auto">
        <div class="win-head"><span class="win-title">${title}</span><span class="win-head-actions">${extraHead || ''}</span></div>
        <div class="win-body" style="height:280px">${body}</div>
      </div>`;

    return `
    ${filterBar}
    ${showForm ? renderForm() : ''}
    ${groupCompare}
    ${ranking}
    ${singleStats}
    ${spikeBanner}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      ${win('pest-rat', '월별 쥐 포획 추이', '', `<div class="chart-frame" style="height:100%"><canvas id="pest-rat-chart"></canvas></div>`)}
      ${win('pest-insect', '월별 벌레 포획 추이 (로그 스케일)', '', `<div class="chart-frame" style="height:100%"><canvas id="pest-insect-chart"></canvas></div>`)}
    </div>

    <div class="card" style="margin-top:14px">
      <div class="section-label">월간 리포트 목록 ${!isGroupOrAll ? `<span class="tag tag-blue" style="font-size:11px">${esc(locName(filter))}</span>` : ''}</div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>월</th>${showLocCol ? '<th>위치</th>' : ''}<th>기간</th><th>방문</th><th>쥐 포획</th><th>벌레 포획</th><th>합계</th><th>시설점검</th><th>특이사항</th></tr></thead>
          <tbody>${reportRows}</tbody>
        </table>
      </div>
      <div class="text-muted" style="font-size:12px;margin-top:8px">행 클릭 시 항목별 상세(쥐/벌레 종류별 마릿수·종합의견·시설점검)를 봅니다. 상단 구분(공장/영업소)·위치로 필터링·비교하세요.</div>
    </div>`;
  };

  const renderForm = () => {
    const today = new Date().toISOString().slice(0, 7);
    return `
    <div class="card" style="margin-top:14px">
      <div class="section-label">＋ 월간 구서관리 리포트 등록</div>

      <div class="card" style="background:var(--bg-surface);border-style:dashed;margin-bottom:14px">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <label class="btn btn-primary btn-sm" style="cursor:pointer;margin:0">
            PDF 업로드 · 자동 분석
            <input type="file" accept="application/pdf" id="pc-pdf-file" style="display:none" onchange="PestControlPage.onPdfSelected(this)">
          </label>
          <span class="text-muted" style="font-size:12px">방역업체 월간 결과보고서 PDF를 올리면 기간·방문내역·포획현황·시설점검을 자동으로 채웁니다. 아래 값은 등록 전 확인·수정하세요.</span>
        </div>
        <div id="pc-pdf-status" style="margin-top:8px"></div>
      </div>

      <div class="form-grid form-grid-2">
        <div class="form-group"><label class="form-label">위치 <span class="req">*</span></label>
          <select class="form-input" id="pc-location">
            ${PestDB.GROUPS.map(g => `<optgroup label="${g}">` + PestDB.getLocations(g).map(l => `<option value="${l.code}" ${l.code === defaultLocation() ? 'selected' : ''}>${esc(l.name)}</option>`).join('') + `</optgroup>`).join('')}
          </select>
        </div>
        <div class="form-group"><label class="form-label">대상 월 <span class="req">*</span></label><input type="month" class="form-input" id="pc-month" value="${today}"></div>
      </div>
      <div class="form-grid form-grid-2">
        <div class="form-group"><label class="form-label">기간 시작</label><input type="date" class="form-input" id="pc-start"></div>
        <div class="form-group"><label class="form-label">기간 종료</label><input type="date" class="form-input" id="pc-end"></div>
      </div>
      <div class="form-group"><label class="form-label">출처</label><input type="text" class="form-input" id="pc-source" placeholder="예: 방역업체 결과보고서"></div>
      <div class="form-group">
        <label class="form-label">쥐류 포획 <span class="text-muted" style="font-weight:400">(한 줄에 하나, "종류:마릿수" 형식 — 예: 집쥐:3)</span></label>
        <textarea class="form-input" id="pc-rat" rows="4" placeholder="쥐:1&#10;집쥐:2&#10;시궁쥐:1"></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">벌레류 포획 <span class="text-muted" style="font-weight:400">(한 줄에 하나, "종류:마릿수" 형식)</span></label>
        <textarea class="form-input" id="pc-insect" rows="4" placeholder="파리:10&#10;날파리:200&#10;블루스톰포획:800"></textarea>
      </div>
      <div class="form-grid form-grid-2">
        <div class="form-group"><label class="form-label">시설점검 신규등록(건)</label><input type="number" class="form-input" id="pc-fac-new" value="0"></div>
        <div class="form-group"><label class="form-label">시설점검 개선미진행(건)</label><input type="number" class="form-input" id="pc-fac-open" value="0"></div>
      </div>
      <div class="form-group">
        <label class="form-label">시설점검 특이사항 <span class="text-muted" style="font-weight:400">(한 줄에 하나)</span></label>
        <textarea class="form-input" id="pc-issues" rows="2" placeholder="출입문 개폐 관리 미흡"></textarea>
      </div>
      <div class="form-group"><label class="form-label">비고 / 종합의견</label><textarea class="form-input" id="pc-note" rows="3" placeholder="이번 달 주요 관찰사항, 조치내역 요약"></textarea></div>
      <div class="form-actions">
        <button class="btn btn-ghost" onclick="PestControlPage.toggleForm()">취소</button>
        <button class="btn btn-primary" onclick="PestControlPage.save()">등록</button>
      </div>
    </div>`;
  };

  // ── 상세 화면 ──
  const renderDetail = (r) => {
    const rat = PestDB.ratTotal(r), insect = PestDB.insectTotal(r), total = PestDB.grandTotal(r);
    const fc = r.facilityCheck || {};
    const facCells = ['신규등록', '개선진행중', '개선예정', '개선완료', '개선미진행', '개선불가', '문제없음']
      .filter(k => fc[k] != null)
      .map(k => `<div><span class="text-muted" style="font-size:11px">${k}</span><div class="mono">${fmt0(fc[k])}</div></div>`).join('');
    const visitRows = (r.visits || []).map(v => `<tr><td>${esc(v.date)}</td><td class="mono">${esc(v.time || '-')}</td><td>${esc(v.type || '-')}</td></tr>`).join('')
      || '<tr><td colspan="3" class="text-muted" style="text-align:center">방문 기록 없음</td></tr>';
    const issueRows = (r.facilityIssues || []).length
      ? r.facilityIssues.map(i => `<li>${esc(i)}</li>`).join('') : '<li class="text-muted">특이사항 없음</li>';

    return `
    <div class="card">
      <div class="card-head">
        <button class="btn btn-ghost btn-sm" onclick="PestControlPage.backToList()">← 목록으로</button>
        <div class="section-label" style="margin:0">구서관리 상세 — ${esc(r.month)}</div>
        <button class="btn btn-ghost btn-sm" onclick="PestControlPage.remove('${esc(r.id)}')" title="삭제">삭제</button>
      </div>
      <div class="detail-head" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin:8px 0">
        <div><span class="text-muted" style="font-size:11px">위치</span><div><span class="tag ${PestDB.locationGroup(PestDB.locOf(r)) === '공장' ? 'tag-blue' : 'tag-gray'}">${esc(locName(PestDB.locOf(r)))}</span></div></div>
        <div><span class="text-muted" style="font-size:11px">기간</span><div>${esc(r.periodStart)} ~ ${esc(r.periodEnd)}</div></div>
        <div><span class="text-muted" style="font-size:11px">쥐 포획 합계</span><div class="mono"><b>${fmt0(rat)}</b></div></div>
        <div><span class="text-muted" style="font-size:11px">벌레 포획 합계</span><div class="mono"><b>${fmt0(insect)}</b></div></div>
        <div><span class="text-muted" style="font-size:11px">전체 합계</span><div class="mono"><b>${fmt0(total)}</b></div></div>
      </div>
      <div class="text-muted" style="font-size:12px;margin-bottom:10px">출처: ${esc(r.source || '-')}</div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div>
          <div class="section-label" style="font-size:13px">쥐류 종류별</div>
          <table class="data-table compact"><thead><tr><th>종류</th><th style="text-align:right">마릿수</th></tr></thead><tbody>${breakdownRows(r.ratBreakdown, 'v-high')}</tbody></table>
        </div>
        <div>
          <div class="section-label" style="font-size:13px">벌레류 종류별</div>
          <table class="data-table compact"><thead><tr><th>종류</th><th style="text-align:right">마릿수</th></tr></thead><tbody>${breakdownRows(r.insectBreakdown)}</tbody></table>
        </div>
      </div>

      <hr class="divider">
      <div class="section-label" style="font-size:13px">시설점검 현황</div>
      <div class="detail-head" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:10px;margin-bottom:10px">${facCells || '<span class="text-muted">데이터 없음</span>'}</div>
      <ul style="margin:0 0 14px 18px;padding:0;font-size:13px">${issueRows}</ul>

      <div class="section-label" style="font-size:13px">서비스 방문 내역</div>
      <table class="data-table compact" style="margin-bottom:14px"><thead><tr><th>방문일</th><th>시간</th><th>구분</th></tr></thead><tbody>${visitRows}</tbody></table>

      <div class="section-label" style="font-size:13px">비고 / 종합의견</div>
      <div style="font-size:13px;line-height:1.6;white-space:pre-wrap;background:var(--bg-surface);border:1px solid var(--border);border-radius:10px;padding:12px">${esc(r.note || '-')}</div>
    </div>`;
  };

  const render = () => {
    if (detailId) {
      const r = PestDB.getReport(detailId);
      if (!r) { detailId = null; return renderOverview(); }
      return renderDetail(r);
    }
    return renderOverview();
  };

  // ── 차트 ──
  const drawCharts = () => {
    if (typeof Chart === 'undefined') return;
    const filter = locFilter;
    const reports = PestDB.getReports(filter).slice().sort((a, b) => String(a.month).localeCompare(String(b.month))); // asc
    let labels, ratData, insectData;
    const aggregate = filter === 'ALL' || filter === '공장' || filter === '영업소';
    if (aggregate) {
      // 전체/구분: 같은 달 여러 위치 값을 합산해 월별 총계 추이로 표시
      const byMonth = new Map();
      reports.forEach(r => {
        const cur = byMonth.get(r.month) || { rat: 0, insect: 0 };
        cur.rat += PestDB.ratTotal(r); cur.insect += PestDB.insectTotal(r);
        byMonth.set(r.month, cur);
      });
      labels = [...byMonth.keys()].sort();
      ratData = labels.map(m => byMonth.get(m).rat);
      insectData = labels.map(m => byMonth.get(m).insect);
    } else {
      labels = reports.map(r => r.month);
      ratData = reports.map(r => PestDB.ratTotal(r));
      insectData = reports.map(r => PestDB.insectTotal(r));
    }

    const ratCanvas = document.getElementById('pest-rat-chart');
    if (ratCanvas) {
      if (ratChart) { ratChart.destroy(); ratChart = null; }
      ratChart = new Chart(ratCanvas, {
        type: 'line',
        data: { labels, datasets: [{ label: '쥐 포획(마리)', data: ratData, borderColor: '#ff6b81', backgroundColor: 'rgba(255,107,129,0.12)', tension: 0.25, pointRadius: 3, fill: true }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { labels: { color: '#c7d0e0', boxWidth: 12, font: { size: 11 } } } },
          scales: {
            x: { ticks: { color: '#8892a6', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
            y: { beginAtZero: true, ticks: { color: '#8892a6', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
          },
        },
      });
    }
    const insectCanvas = document.getElementById('pest-insect-chart');
    if (insectCanvas) {
      if (insectChart) { insectChart.destroy(); insectChart = null; }
      insectChart = new Chart(insectCanvas, {
        type: 'line',
        data: { labels, datasets: [{ label: '벌레 포획(마리)', data: insectData, borderColor: '#4f9cff', backgroundColor: 'rgba(79,156,255,0.12)', tension: 0.25, pointRadius: 3, fill: true }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { labels: { color: '#c7d0e0', boxWidth: 12, font: { size: 11 } } } },
          scales: {
            x: { ticks: { color: '#8892a6', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
            y: { type: 'logarithmic', ticks: { color: '#8892a6', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
          },
        },
      });
    }
  };

  const toggleForm = () => {
    showForm = !showForm;
    if (showForm) { pendingVisits = []; pendingFacilityCheck = null; }
    App.refreshPage();
  };

  const save = () => {
    const g = (id) => document.getElementById(id)?.value || '';
    const month = g('pc-month');
    if (!month) { App.toast('대상 월을 선택하세요', 'error'); return; }
    const rat = parseKV(document.getElementById('pc-rat')?.value);
    const insect = parseKV(document.getElementById('pc-insect')?.value);
    if (Object.keys(rat).length === 0 && Object.keys(insect).length === 0) {
      App.toast('쥐류 또는 벌레류 포획 데이터를 1개 이상 입력하세요', 'warning'); return;
    }
    const issues = String(document.getElementById('pc-issues')?.value || '').split('\n').map(s => s.trim()).filter(Boolean);
    const rep = PestDB.addReport({
      month,
      location: g('pc-location') || defaultLocation(),
      periodStart: g('pc-start') || (month + '-01'),
      periodEnd: g('pc-end'),
      visits: pendingVisits,
      ratBreakdown: rat,
      insectBreakdown: insect,
      facilityCheck: pendingFacilityCheck || { 신규등록: Number(g('pc-fac-new')) || 0, 개선미진행: Number(g('pc-fac-open')) || 0 },
      facilityIssues: issues,
      note: g('pc-note'),
      source: g('pc-source'),
      manual: true,
    });
    App.toast(`구서관리 리포트 등록됨 · ${locName(PestDB.locOf(rep))} ${rep.month}`, 'success');
    showForm = false;
    pendingVisits = [];
    pendingFacilityCheck = null;
    App.refreshPage();
  };

  // ── PDF 업로드 자동 분석 ──
  const onPdfSelected = async (inputEl) => {
    const file = inputEl.files && inputEl.files[0];
    if (!file) return;
    const statusEl = document.getElementById('pc-pdf-status');
    if (statusEl) statusEl.innerHTML = '<span class="text-muted">분석 중… (표지·표 구조 인식에 몇 초 걸릴 수 있습니다)</span>';
    try {
      if (typeof PestPdfParser === 'undefined') throw new Error('PDF 분석 모듈을 불러오지 못했습니다');
      const buf = await file.arrayBuffer();
      const parsed = await PestPdfParser.parse(buf);

      const set = (id, v) => { const el = document.getElementById(id); if (el && v != null && v !== '') el.value = v; };
      // 우선순위: PDF 본문(표지 제목) 인식 > 파일명 키워드 (공장 4 + 영업소 6)
      const factoryGuess = guessLocation(parsed.factoryGuess) || guessLocation(file.name);
      if (factoryGuess) set('pc-location', factoryGuess);
      set('pc-month', parsed.month);
      set('pc-start', parsed.periodStart);
      set('pc-end', parsed.periodEnd);
      set('pc-source', file.name);
      const ratEl = document.getElementById('pc-rat');
      if (ratEl && Object.keys(parsed.ratBreakdown).length) ratEl.value = kvToLines(parsed.ratBreakdown);
      const insectEl = document.getElementById('pc-insect');
      if (insectEl && Object.keys(parsed.insectBreakdown).length) insectEl.value = kvToLines(parsed.insectBreakdown);
      set('pc-fac-new', parsed.facilityCheck?.신규등록 ?? 0);
      set('pc-fac-open', parsed.facilityCheck?.개선미진행 ?? 0);
      set('pc-note', parsed.note);
      pendingVisits = parsed.visits || [];
      pendingFacilityCheck = Object.keys(parsed.facilityCheck || {}).length ? parsed.facilityCheck : null;

      const ratTotal = Object.values(parsed.ratBreakdown).reduce((a, b) => a + b, 0);
      const insectTotal = Object.values(parsed.insectBreakdown).reduce((a, b) => a + b, 0);
      const warnHtml = parsed.warnings.length
        ? `<div style="margin-top:6px">${parsed.warnings.map(w => `<div class="text-muted" style="font-size:11px">⚠ ${esc(w)}</div>`).join('')}</div>` : '';
      if (statusEl) statusEl.innerHTML = `
        <span class="verdict verdict-ok">✔ 분석 완료</span>
        <span style="font-size:12px;margin-left:6px">${factoryGuess ? esc(locName(factoryGuess)) + ' · ' : ''}${esc(parsed.month || '월 미인식')} · 방문 ${parsed.visits.length}회 · 쥐 ${fmt0(ratTotal)}마리 · 벌레 ${fmt0(insectTotal)}마리</span>
        ${!factoryGuess ? '<div class="text-muted" style="font-size:11px">⚠ 위치명을 자동 인식하지 못했습니다. 위 「위치」 선택을 확인하세요.</div>' : ''}
        ${warnHtml}`;
      App.toast('PDF 분석 완료 — 아래 값을 확인 후 등록하세요', 'success');
    } catch (e) {
      console.error('[PestControl] PDF parse failed', e);
      if (statusEl) statusEl.innerHTML = `<span class="verdict verdict-high">✕ 분석 실패</span> <span class="text-muted" style="font-size:12px">${esc(e.message || '알 수 없는 오류')} — 값을 직접 입력해 주세요.</span>`;
      App.toast('PDF 분석에 실패했습니다. 직접 입력해 주세요', 'error');
    }
  };

  const setFilter = (v) => { locFilter = v; detailId = null; App.refreshPage(); };
  const openDetail = (id) => { detailId = id; App.refreshPage(); };
  const backToList = () => { detailId = null; App.refreshPage(); };
  const remove = (id) => {
    const r = PestDB.getReport(id);
    if (!r) return;
    if (!confirm(`${r.month} 구서관리 리포트를 삭제할까요?`)) return;
    PestDB.deleteReport(id);
    App.toast('삭제되었습니다', 'info');
    detailId = null;
    App.refreshPage();
  };

  const afterRender = () => { if (!detailId) drawCharts(); };

  return { render, afterRender, toggleForm, save, openDetail, backToList, remove, onPdfSelected, setFilter };
})();
