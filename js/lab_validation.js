// ============================================================
// lab_validation.js — 유효성 평가(Validation) 관리
//   HACCP 선행요건·CCP 실행성 검증 등 유효성평가 항목을 목록·상세로 관리
//   실제 우성사료 논산공장 유효성평가 폴더(모의회수·소독제·마그네트·X-Ray 등) 기준
// ============================================================

const ValidationPage = (() => {
  let openId = null;

  const RESULT_META = {
    '적합':  { cls: 'ok' },
    '부적합': { cls: 'high' },
    '진행중': { cls: 'low' },
  };
  const resultBadge = (r) => { const m = RESULT_META[r] || { cls: 'na' }; return `<span class="verdict verdict-${m.cls}">${esc(r || '-')}</span>`; };

  const listView = () => {
    const list = LabDB.getValidations();
    const s = LabDB.validationSummary();
    const rows = list.length ? list.map(v => `
      <tr onclick="ValidationPage.open('${v.id}')" style="cursor:pointer">
        <td class="mono">${v.no}</td>
        <td><b>${esc(v.name)}</b></td>
        <td><span class="tag tag-gray">${esc(v.category)}</span></td>
        <td>${esc(v.cycle)}</td>
        <td class="text-muted">${esc(v.lastDate || '-')}</td>
        <td>${resultBadge(v.result)}</td>
        <td class="ellipsis" style="max-width:220px">${esc(v.evidence || '')}</td>
      </tr>`).join('') : `<tr><td colspan="7" class="text-muted" style="text-align:center;padding:20px">등록된 유효성평가 항목이 없습니다</td></tr>`;

    return `
    <div class="stat-grid" style="margin-bottom:14px">
      <div class="stat-card"><div class="stat-label">유효성평가 항목</div><div class="stat-value">${fmtNum(s.total, 0)}</div><div class="stat-sub">전체 검증 대상</div></div>
      <div class="stat-card ok"><div class="stat-label">적합</div><div class="stat-value">${fmtNum(s.pass, 0)}</div><div class="stat-sub">유효성 확인 완료</div></div>
      <div class="stat-card ${s.fail > 0 ? 'danger' : ''}"><div class="stat-label">부적합</div><div class="stat-value">${fmtNum(s.fail, 0)}</div><div class="stat-sub">재검증 필요</div></div>
      <div class="stat-card ${s.ongoing > 0 ? 'danger' : 'ok'}"><div class="stat-label">진행중/미실시</div><div class="stat-value">${fmtNum(s.ongoing, 0)}</div><div class="stat-sub">검증 예정</div></div>
    </div>
    <div class="card">
      <div class="card-head">
        <div class="card-title">유효성 평가 <span class="text-muted" style="font-weight:400">(${list.length}건)</span></div>
        <button class="btn btn-primary btn-sm" onclick="ValidationPage.open('NEW')">＋ 항목 추가</button>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>No</th><th>검증 항목</th><th>분류</th><th>주기</th><th>최근 수행</th><th>결과</th><th>근거자료</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="text-muted" style="font-size:12px;margin-top:10px">CCP 실행성 검증(X-Ray·금속검출기·건조기), 선행요건 유효성(소독제·자외선·오존·마그네트·철물·플러싱), 모의회수·외부심사·용기포장 시험성적서를 관리합니다.</div>
    </div>`;
  };

  const detailView = (id) => {
    const isNew = id === 'NEW';
    const v = isNew
      ? { no: LabDB.getValidations().length + 1, name: '', category: LabDB.VALIDATION_CATEGORIES[0], cycle: '연1회', lastDate: '', nextDate: '', result: '진행중', evidence: '', note: '' }
      : LabDB.getValidation(id);
    if (!v) return listView();
    const catOpts = LabDB.VALIDATION_CATEGORIES.map(c => `<option ${c === v.category ? 'selected' : ''}>${c}</option>`).join('');
    const resOpts = ['적합', '부적합', '진행중'].map(r => `<option ${r === v.result ? 'selected' : ''}>${r}</option>`).join('');
    return `
    <div class="card">
      <div class="card-head">
        <button class="btn btn-ghost btn-sm" onclick="ValidationPage.back()">← 목록</button>
        <div class="card-title" style="margin:0">${isNew ? '＋ 유효성평가 항목 추가' : '' + esc(v.name)}</div>
        ${isNew ? '' : `<button class="btn btn-ghost btn-sm" onclick="ValidationPage.remove('${v.id}')" title="삭제">삭제</button>`}
      </div>
      <div class="form-grid form-grid-2">
        <div class="form-group"><label class="form-label">검증 항목명 <span class="req">*</span></label><input type="text" class="form-input" id="val-name" value="${esc(v.name)}" placeholder="예: 반려동물 소포장 X-Ray 검출기 검증"></div>
        <div class="form-group"><label class="form-label">분류</label><select class="form-input" id="val-cat">${catOpts}</select></div>
      </div>
      <div class="form-grid form-grid-4">
        <div class="form-group"><label class="form-label">검증 주기</label><input type="text" class="form-input" id="val-cycle" value="${esc(v.cycle)}" placeholder="연1회 / 반기1회"></div>
        <div class="form-group"><label class="form-label">최근 수행일</label><input type="date" class="form-input" id="val-last" value="${esc(v.lastDate || '')}"></div>
        <div class="form-group"><label class="form-label">차기 예정일</label><input type="date" class="form-input" id="val-next" value="${esc(v.nextDate || '')}"></div>
        <div class="form-group"><label class="form-label">결과</label><select class="form-input" id="val-result">${resOpts}</select></div>
      </div>
      <div class="form-group"><label class="form-label">근거자료 / 성적서</label><input type="text" class="form-input" id="val-evidence" value="${esc(v.evidence || '')}" placeholder="예: 자외선 살균 유효성 테스트(2025.01.12), 자체 대장균군 분석성적서"></div>
      <div class="form-group"><label class="form-label">비고</label><textarea class="form-input" id="val-note" rows="3" placeholder="검증 방법·판정기준·특이사항">${esc(v.note || '')}</textarea></div>
      <div class="form-actions">
        <button class="btn btn-ghost" onclick="ValidationPage.back()">취소</button>
        <button class="btn btn-primary" onclick="ValidationPage.save('${isNew ? 'NEW' : v.id}')">저장</button>
      </div>
    </div>`;
  };

  const render = () => openId ? detailView(openId) : listView();

  const open = (id) => { openId = id; App.refreshPage(); };
  const back = () => { openId = null; App.refreshPage(); };
  const save = (id) => {
    const g = (i) => document.getElementById(i)?.value || '';
    const name = g('val-name').trim();
    if (!name) { App.toast('검증 항목명을 입력하세요', 'error'); return; }
    const data = {
      name, category: g('val-cat'), cycle: g('val-cycle'), lastDate: g('val-last'),
      nextDate: g('val-next'), result: g('val-result'), evidence: g('val-evidence'), note: g('val-note'),
    };
    if (id === 'NEW') LabDB.addValidation(data); else LabDB.updateValidation(id, data);
    App.toast('유효성평가 항목이 저장되었습니다', 'success');
    openId = null;
    App.refreshPage();
  };
  const remove = (id) => {
    const v = LabDB.getValidation(id);
    if (!v) return;
    if (!confirm(`"${v.name}" 항목을 삭제할까요?`)) return;
    LabDB.deleteValidation(id);
    App.toast('삭제되었습니다', 'info');
    openId = null;
    App.refreshPage();
  };

  return { render, open, back, save, remove };
})();
