// ============================================================
// lab_sqf.js — SQF(Safe Quality Food) 인증 관리 (HACCP 미러 구조)
//   (데모) SQF 문서 예시
//   SqfDocsPage(기준서·문서: 모듈2 FSMS / 모듈4 선행요건) ·
//   SqfLogsPage(SQF 일지 작성·출력) · SqfCAPage(심사 시정조치)
//   첨부파일은 HACCP과 동일하게 FileStore(IndexedDB) 사용, 인쇄는 openReportOverlay.
// ============================================================

const SqfDB = (() => {
  const DOCS_KEY = 'sqf_docs';
  const LOG_KEY = 'sqf_logs';
  const CA_KEY = 'sqf_ca';
  const SEED_VER = '2026-07-08-v1';
  const SEED_VER_KEY = 'sqf_seed_ver';

  const get = (k) => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch (_) { return []; } };
  const set = (k, v) => { localStorage.setItem(k, JSON.stringify(v)); if (window.Sync && Sync.onLocalSet) { try { Sync.onLocalSet(k); } catch (_) {} } };
  const now = () => new Date().toISOString();
  const today = () => now().slice(0, 10);
  const uuid = (p) => p + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);

  const DOC_CATEGORIES = ['FSMS(모듈2)', '선행요건(모듈4)', '기록·양식', 'HACCP 연계', '성적서·외부문서'];
  const LOG_TYPES = ['PRP 모니터링', '칼날점검', '청소·소독점검', '냉장냉동 온도점검', '검교정', '교육훈련', '환경모니터링', '공급업체 평가', '폐기물관리', '기타'];
  const CA_STATUS = ['접수', '조치중', '종결'];

  // ── 문서 (HACCP 문서와 동일 shape: attachments + history) ──
  const getDocs = () => get(DOCS_KEY).sort((a, b) => String(a.docNo).localeCompare(String(b.docNo)));
  const getDoc = (id) => get(DOCS_KEY).find(d => d.id === id);
  const FIELD_LABELS = { title: '제목', category: '분류', version: '버전', status: '상태', docNo: '문서번호', effDate: '시행일', author: '작성', reviewer: '검토', approver: '승인', body: '본문' };
  const addDoc = (d) => {
    const all = get(DOCS_KEY);
    const rec = {
      id: uuid('SQFDOC'), docNo: d.docNo || ('WS-FSMS-' + String(all.length + 1).padStart(2, '0')),
      title: d.title || '', category: d.category || DOC_CATEGORIES[0], version: d.version || '1.0',
      effDate: d.effDate || today(), author: d.author || '', reviewer: d.reviewer || '', approver: d.approver || '',
      status: d.status || '유효', body: d.body || '',
      attachments: [], history: [{ ts: now(), action: '생성', by: d.author || '-', detail: '문서 생성' }],
      seeded: !!d.seeded, updatedAt: now(),
    };
    all.push(rec); set(DOCS_KEY, all); return rec;
  };
  const updateDoc = (id, patch, by) => {
    const all = get(DOCS_KEY);
    const i = all.findIndex(x => x.id === id);
    if (i < 0) return null;
    const before = all[i];
    const changes = Object.keys(patch)
      .filter(k => FIELD_LABELS[k] && String(before[k] == null ? '' : before[k]) !== String(patch[k] == null ? '' : patch[k]))
      .map(k => FIELD_LABELS[k]);
    all[i] = { ...before, ...patch, updatedAt: now() };
    if (changes.length) {
      all[i].history = (before.history || []).concat([{ ts: now(), action: '수정', by: by || patch.author || before.author || '-', detail: changes.join(', ') + ' 변경' }]);
      all[i].seeded = false;
    }
    set(DOCS_KEY, all); return all[i];
  };
  const deleteDoc = (id) => set(DOCS_KEY, get(DOCS_KEY).filter(x => x.id !== id));
  const addAttachment = (docId, meta, by) => {
    const all = get(DOCS_KEY); const i = all.findIndex(x => x.id === docId); if (i < 0) return null;
    all[i].attachments = (all[i].attachments || []).concat([meta]);
    all[i].history = (all[i].history || []).concat([{ ts: now(), action: '첨부', by: by || '-', detail: `파일 첨부: ${meta.name}` }]);
    all[i].seeded = false; all[i].updatedAt = now();
    set(DOCS_KEY, all); return all[i];
  };
  const removeAttachment = (docId, attId, by) => {
    const all = get(DOCS_KEY); const i = all.findIndex(x => x.id === docId); if (i < 0) return null;
    const att = (all[i].attachments || []).find(a => a.id === attId);
    all[i].attachments = (all[i].attachments || []).filter(a => a.id !== attId);
    all[i].history = (all[i].history || []).concat([{ ts: now(), action: '첨부삭제', by: by || '-', detail: `파일 삭제: ${att ? att.name : attId}` }]);
    all[i].updatedAt = now();
    set(DOCS_KEY, all); return all[i];
  };

  // ── 일지 ──
  const getLogs = (type = 'ALL') => {
    const all = get(LOG_KEY);
    const l = type === 'ALL' ? all : all.filter(x => x.type === type);
    return l.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt)));
  };
  const addLog = (l) => {
    const all = get(LOG_KEY);
    const rec = { id: uuid('SQFLOG'), type: l.type || LOG_TYPES[0], date: l.date || today(), by: l.by || '',
      target: l.target || '', value: l.value || '', judged: l.judged || '-', memo: l.memo || '', action: l.action || '', createdAt: now() };
    all.unshift(rec); set(LOG_KEY, all); return rec;
  };
  const deleteLog = (id) => set(LOG_KEY, get(LOG_KEY).filter(x => x.id !== id));

  // ── 심사 시정조치 ──
  const getCAs = () => get(CA_KEY).sort((a, b) => String(b.issueDate || '').localeCompare(String(a.issueDate || '')));
  const getCA = (id) => get(CA_KEY).find(x => x.id === id);
  const addCA = (c) => {
    const all = get(CA_KEY);
    const rec = { id: uuid('SQFCA'), clause: c.clause || '', title: c.title || '', grade: c.grade || 'Minor',
      finding: c.finding || '', cause: c.cause || '', correction: c.correction || '', preventive: c.preventive || '',
      owner: c.owner || '', issueDate: c.issueDate || today(), dueDate: c.dueDate || '', closeDate: c.closeDate || '',
      status: c.status || '접수', audit: c.audit || '', seeded: !!c.seeded, createdAt: now(), updatedAt: now() };
    all.unshift(rec); set(CA_KEY, all); return rec;
  };
  const updateCA = (id, patch) => { const all = get(CA_KEY); const i = all.findIndex(x => x.id === id); if (i < 0) return null; all[i] = { ...all[i], ...patch, seeded: false, updatedAt: now() }; set(CA_KEY, all); return all[i]; };
  const deleteCA = (id) => set(CA_KEY, get(CA_KEY).filter(x => x.id !== id));

  // ── 시드: SQF 문서 목록 (데모 예시) ──
  const DOC_SEED = [
    ['DEMO-SQF-01', '승인된 공급업체 평가 절차서', 'FSMS(모듈2)', '(데모) 공급업체 승인 프로그램'],
    ['DEMO-SQF-02', '변경관리 절차서', 'FSMS(모듈2)', '(데모) 변경관리·검증'],
    ['DEMO-SQF-03', '부적합품 관리 절차서', 'FSMS(모듈2)', '(데모) 부적합 물질·제품 관리'],
    ['DEMO-SQF-04', '추적성 관리 절차서', 'FSMS(모듈2)', '(데모) 제품 추적'],
    ['DEMO-SQF-05', '제품수거 및 회수 절차서', 'FSMS(모듈2)', '(데모) 수거·회수'],
    ['DEMO-SQF-06', '교육훈련 절차서', 'FSMS(모듈2)', '(데모) 교육·역량'],
    ['DEMO-SQF-07', '제조공정관리기준', '선행요건(모듈4)', '(데모) 제조공정관리'],
    ['DEMO-SQF-08', '위생 및 작업자 안전관리', '선행요건(모듈4)', '(데모) 개인위생·세척소독'],
    ['DEMO-SQF-09', '검사관리', '선행요건(모듈4)', '(데모) 검교정관리'],
    ['DEMO-SQF-10', '파손물질 및 이물 관리 절차서', '선행요건(모듈4)', '(데모) 파손물질 관리'],
  ];
  // SQF 심사 시정조치 (데모 예시)
  const CA_SEED = [
    ['2.3.2.2', '(데모) 규격서 보완', '(데모) 입고검수규격서 등록', '데모 심사', '2026-01-20', '종결'],
    ['2.6.2.1', '(데모) 추적성 기록 보완', '(데모) 원료투입일지 기록 보완', '데모 심사', '2026-01-20', '종결'],
    ['4.2.3.3', '(데모) 검교정 성적서 확보', '(데모) 저울 검교정 성적서 확보', '데모 심사', '2026-01-25', '종결'],
    ['4.2.5.9', '(데모) 청소 유효성 검증', '(데모) 세척소독 유효성 검증', '데모 심사', '2026-02-01', '진행'],
  ];

  const seed = () => {
    const saved = localStorage.getItem(SEED_VER_KEY);
    if (saved === SEED_VER) return;
    // 문서: 시드 교체(사용자 편집/첨부 문서는 보존), 수동 추가 문서 보존
    const keepDocs = get(DOCS_KEY).filter(d => !d.seeded);
    const keepNos = new Set(keepDocs.map(d => d.docNo));
    const freshDocs = DOC_SEED.filter(([no]) => !keepNos.has(no)).map(([docNo, title, category, body]) => ({
      id: uuid('SQFDOC'), docNo, title, category, version: '1.0', effDate: '2025-12-12',
      author: '품질담당', reviewer: '', approver: '', status: '유효', body,
      attachments: [], history: [{ ts: now(), action: '생성', by: '시드', detail: '(데모) SQF 문서 등록' }],
      seeded: true, updatedAt: now(),
    }));
    set(DOCS_KEY, keepDocs.concat(freshDocs));
    // 시정조치: 시드 교체(사용자 수정분 보존)
    const keepCA = get(CA_KEY).filter(c => !c.seeded);
    const keepClauses = new Set(keepCA.map(c => c.clause + '|' + c.audit));
    const freshCA = CA_SEED.filter(([clause, , , audit]) => !keepClauses.has(clause + '|' + audit)).map(([clause, title, correction, audit, closeDate, status]) => ({
      id: uuid('SQFCA'), clause, title, grade: 'Minor', finding: title, cause: '', correction, preventive: '',
      owner: '품질담당', issueDate: audit.startsWith('2024') ? '2024-11-15' : '2025-11-15', dueDate: closeDate, closeDate, status, audit,
      seeded: true, createdAt: now(), updatedAt: now(),
    }));
    set(CA_KEY, keepCA.concat(freshCA));
    try { localStorage.setItem(SEED_VER_KEY, SEED_VER); } catch (_) {}
  };

  const SYNC_KEYS = [DOCS_KEY, LOG_KEY, CA_KEY];

  return { DOC_CATEGORIES, LOG_TYPES, CA_STATUS,
    getDocs, getDoc, addDoc, updateDoc, deleteDoc, addAttachment, removeAttachment,
    getLogs, addLog, deleteLog,
    getCAs, getCA, addCA, updateCA, deleteCA,
    seed, SYNC_KEYS };
})();

// ============================================================
// 1) SQF 기준서 · 문서
// ============================================================
const SqfDocsPage = (() => {
  let openId = null;
  let catFilter = 'ALL';

  const listView = () => {
    SqfDB.seed();
    let docs = SqfDB.getDocs();
    if (catFilter !== 'ALL') docs = docs.filter(d => d.category === catFilter);
    const tabs = ['ALL', ...SqfDB.DOC_CATEGORIES].map(c =>
      `<button class="btn btn-sm ${catFilter === c ? 'btn-primary' : 'btn-ghost'}" onclick="SqfDocsPage.setCat('${c}')">${c === 'ALL' ? '전체' : c}</button>`).join('');
    const rows = docs.length ? docs.map(d => `
      <tr onclick="SqfDocsPage.open('${d.id}')" style="cursor:pointer">
        <td class="mono">${esc(d.docNo)}</td>
        <td><b>${esc(d.title)}</b>${(d.attachments || []).length ? ` <span class="tag tag-blue" style="font-size:9px">첨부 ${d.attachments.length}</span>` : ''}</td>
        <td><span class="tag tag-gray">${esc(d.category)}</span></td>
        <td class="mono">${esc(d.version)}</td>
        <td>${esc(d.effDate)}</td>
        <td>${d.status === '유효' ? '<span class="verdict verdict-ok">유효</span>' : d.status === '개정중' ? '<span class="verdict verdict-low">개정중</span>' : '<span class="verdict verdict-na">폐기</span>'}</td>
      </tr>`).join('') : `<tr><td colspan="6" class="text-muted" style="text-align:center;padding:20px">문서가 없습니다</td></tr>`;
    return `
    <div class="card">
      <div class="card-head" style="flex-wrap:wrap;gap:8px">
        <div class="card-title">SQF 기준서 · 문서 <span class="text-muted" style="font-weight:400">(${docs.length}건)</span></div>
        <button class="btn btn-primary btn-sm" onclick="SqfDocsPage.open('NEW')">＋ 문서 추가</button>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">${tabs}</div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>문서번호</th><th>제목</th><th>분류</th><th>버전</th><th>시행일</th><th>상태</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="text-muted" style="font-size:12px;margin-top:10px">SQF Ed.10 기준 — 모듈2(FSMS) · 모듈4(선행요건 프로그램). (데모 예시)</div>
    </div>`;
  };

  const detailView = (id) => {
    const isNew = id === 'NEW';
    const d = isNew ? { docNo: '', title: '', category: SqfDB.DOC_CATEGORIES[0], version: '1.0', effDate: new Date().toISOString().slice(0, 10), author: '', reviewer: '', approver: '', status: '유효', body: '' } : SqfDB.getDoc(id);
    if (!d) return listView();
    const catOpts = SqfDB.DOC_CATEGORIES.map(c => `<option ${c === d.category ? 'selected' : ''}>${c}</option>`).join('');
    const stOpts = ['유효', '개정중', '폐기'].map(s => `<option ${s === d.status ? 'selected' : ''}>${s}</option>`).join('');
    return `
    <div class="detail-head">
      <button class="btn btn-ghost btn-sm" onclick="SqfDocsPage.back()">← 목록</button>
      <div><div class="detail-title">${isNew ? '문서 추가' : esc(d.title)}</div><div class="detail-sub">${isNew ? '새 SQF 문서' : esc(d.docNo) + ' · ' + esc(d.category)}</div></div>
      ${isNew ? '' : `<button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="SqfDocsPage.print('${d.id}')">문서 인쇄</button>`}
    </div>
    <div class="card">
      <div class="form-grid form-grid-4">
        <div class="form-group"><label class="form-label">문서번호</label><input class="form-input form-input-sm" id="sq-docNo" value="${esc(d.docNo)}" placeholder="문서번호"></div>
        <div class="form-group"><label class="form-label">분류</label><select class="form-input form-input-sm" id="sq-cat">${catOpts}</select></div>
        <div class="form-group"><label class="form-label">버전</label><input class="form-input form-input-sm" id="sq-ver" value="${esc(d.version)}"></div>
        <div class="form-group"><label class="form-label">상태</label><select class="form-input form-input-sm" id="sq-status">${stOpts}</select></div>
      </div>
      <div class="form-group"><label class="form-label">제목 <span class="req">*</span></label><input class="form-input" id="sq-title" value="${esc(d.title)}"></div>
      <div class="form-grid form-grid-4">
        <div class="form-group"><label class="form-label">시행일</label><input type="date" class="form-input form-input-sm" id="sq-eff" value="${esc(d.effDate)}"></div>
        <div class="form-group"><label class="form-label">작성</label><input class="form-input form-input-sm" id="sq-author" value="${esc(d.author)}"></div>
        <div class="form-group"><label class="form-label">검토</label><input class="form-input form-input-sm" id="sq-reviewer" value="${esc(d.reviewer)}"></div>
        <div class="form-group"><label class="form-label">승인</label><input class="form-input form-input-sm" id="sq-approver" value="${esc(d.approver)}"></div>
      </div>
      <div class="form-group"><label class="form-label">본문 / 주요내용</label><textarea class="form-input" id="sq-body" rows="8" style="font-family:inherit;line-height:1.6">${esc(d.body)}</textarea></div>
      <div class="form-actions">
        ${isNew ? '' : `<button class="btn btn-danger btn-sm" onclick="SqfDocsPage.del('${d.id}')">삭제</button>`}
        <button class="btn btn-primary" onclick="SqfDocsPage.save('${isNew ? 'NEW' : d.id}')">저장</button>
      </div>
    </div>
    ${isNew ? `<div class="card"><div class="text-muted" style="font-size:13px">문서를 먼저 저장하면 실제 파일(PDF·hwp·docx·xlsx 등)을 첨부할 수 있습니다.</div></div>` : attachmentCard(d) + historyCard(d)}`;
  };

  const fmtSize = (n) => { if (n == null) return '-'; if (n < 1024) return n + ' B'; if (n < 1048576) return (n / 1024).toFixed(1) + ' KB'; return (n / 1048576).toFixed(1) + ' MB'; };
  const attachmentCard = (d) => {
    const atts = d.attachments || [];
    const rows = atts.length ? atts.map(a => `
      <tr>
        <td>${esc(a.name)}</td>
        <td class="mono text-muted">${fmtSize(a.size)}</td>
        <td class="text-muted">${a.uploadedAt ? fmtDate(a.uploadedAt) : '-'}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-ghost btn-xs" onclick="SqfDocsPage.download('${a.id}','${esc(a.name)}')">다운로드</button>
          <button class="btn btn-ghost btn-xs" onclick="SqfDocsPage.removeAtt('${d.id}','${a.id}')" title="삭제">✕</button>
        </td>
      </tr>`).join('') : `<tr><td colspan="4" class="text-muted" style="text-align:center;padding:16px">첨부된 파일이 없습니다. 원본(hwp·doc·xlsx·pdf)을 업로드하세요.</td></tr>`;
    return `
    <div class="card" style="margin-top:14px">
      <div class="card-head">
        <div class="card-title">첨부 파일 <span class="text-muted" style="font-weight:400">(${atts.length})</span></div>
        <label class="btn btn-primary btn-sm" style="cursor:pointer;margin:0">
          ＋ 파일 업로드
          <input type="file" style="display:none" onchange="SqfDocsPage.upload('${d.id}', this)">
        </label>
      </div>
      <div class="table-wrap">
        <table class="data-table compact">
          <thead><tr><th>파일명</th><th>크기</th><th>업로드일</th><th>처리</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div id="sq-file-status" class="text-muted" style="font-size:12px;margin-top:6px">원본 파일은 이 기기에 저장됩니다. (다른 기기에서는 목록만 보이며 그 기기에 업로드된 파일만 다운로드됩니다)</div>
    </div>`;
  };
  const ACTION_CLS = { '생성': 'ok', '수정': 'low', '첨부': 'ok', '첨부삭제': 'high' };
  const historyCard = (d) => {
    const hist = (d.history || []).slice().sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
    const rows = hist.length ? hist.map(h => `
      <tr><td class="text-muted mono">${fmtDate(h.ts)}</td>
        <td><span class="verdict verdict-${ACTION_CLS[h.action] || 'na'}">${esc(h.action)}</span></td>
        <td>${esc(h.detail || '')}</td><td class="text-muted">${esc(h.by || '-')}</td></tr>`).join('')
      : `<tr><td colspan="4" class="text-muted" style="text-align:center;padding:16px">이력이 없습니다</td></tr>`;
    return `
    <div class="card" style="margin-top:14px">
      <div class="card-title">변경 이력 <span class="text-muted" style="font-weight:400">(${hist.length})</span></div>
      <div class="table-wrap"><table class="data-table compact">
        <thead><tr><th style="width:150px">일시</th><th style="width:90px">작업</th><th>내용</th><th style="width:90px">담당</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
    </div>`;
  };

  const render = () => openId ? detailView(openId) : listView();
  const open = (id) => { openId = id; App.refreshPage(); };
  const back = () => { openId = null; App.refreshPage(); };
  const setCat = (c) => { catFilter = c; App.refreshPage(); };
  const collect = () => ({
    docNo: val('sq-docNo'), category: val('sq-cat'), version: val('sq-ver'), status: val('sq-status'),
    title: val('sq-title'), effDate: val('sq-eff'), author: val('sq-author'), reviewer: val('sq-reviewer'), approver: val('sq-approver'), body: val('sq-body'),
  });
  const save = (id) => {
    const data = collect();
    if (!data.title) { App.toast('제목을 입력하세요', 'error'); return; }
    if (id === 'NEW') { const r = SqfDB.addDoc(data); openId = r.id; App.toast('문서가 추가되었습니다', 'success'); }
    else { SqfDB.updateDoc(id, data); App.toast('저장되었습니다', 'success'); }
    App.refreshPage();
  };
  const del = (id) => { if (confirm('이 문서를 삭제할까요?')) { SqfDB.deleteDoc(id); openId = null; App.refreshPage(); } };

  const upload = async (docId, inputEl) => {
    const file = inputEl.files && inputEl.files[0];
    if (!file) return;
    if (typeof FileStore === 'undefined' || !FileStore.available()) { App.toast('이 브라우저에서 파일 저장을 지원하지 않습니다', 'error'); return; }
    try {
      const attId = 'ATT-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
      await FileStore.put(attId, file, { name: file.name, type: file.type });
      const by = document.getElementById('sq-author')?.value || '-';
      SqfDB.addAttachment(docId, { id: attId, name: file.name, size: file.size, type: file.type, uploadedAt: new Date().toISOString(), by }, by);
      App.toast(`첨부되었습니다 · ${file.name}`, 'success');
      App.refreshPage();
    } catch (e) { App.toast('파일 업로드에 실패했습니다', 'error'); }
  };
  const download = async (attId, name) => {
    if (typeof FileStore === 'undefined') return;
    try {
      const rec = await FileStore.get(attId);
      if (!rec || !rec.blob) { App.toast('이 기기에 파일이 없습니다(다른 기기에서 업로드된 첨부입니다)', 'warning'); return; }
      const url = URL.createObjectURL(rec.blob);
      const a = document.createElement('a'); a.href = url; a.download = name || 'download';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { App.toast('다운로드 실패', 'error'); }
  };
  const removeAtt = async (docId, attId) => {
    if (!confirm('첨부파일을 삭제할까요?')) return;
    try { if (typeof FileStore !== 'undefined') await FileStore.del(attId); } catch (_) {}
    SqfDB.removeAttachment(docId, attId, document.getElementById('sq-author')?.value || '-');
    App.toast('첨부파일이 삭제되었습니다', 'info');
    App.refreshPage();
  };

  // 문서 표지+본문 인쇄
  const print = (id) => {
    const d = SqfDB.getDoc(id); if (!d) return;
    openReportOverlay(`
      <div class="rpt-h1">SQF ${esc(d.category)}</div>
      <div class="rpt-sub">(주)우성사료 논산공장 · SQF Ed.10</div>
      <table class="rpt-info">
        <tr><td class="lb">문서번호</td><td class="mono">${esc(d.docNo)}</td><td class="lb">버전</td><td>${esc(d.version)}</td><td class="lb">시행일</td><td>${esc(d.effDate)}</td></tr>
        <tr><td class="lb">제목</td><td colspan="5"><b>${esc(d.title)}</b></td></tr>
        <tr><td class="lb">작성</td><td>${esc(d.author || '-')}</td><td class="lb">검토</td><td>${esc(d.reviewer || '-')}</td><td class="lb">승인</td><td>${esc(d.approver || '-')}</td></tr>
      </table>
      <div style="border:1px solid #000;min-height:120mm;padding:10px;font-size:12px;line-height:1.8;white-space:pre-wrap">${esc(d.body || '')}</div>
      <div class="rpt-sign">Approved by SQF Practitioner</div>
      <div class="rpt-foot">(데모) SQF 시스템 문서 예시입니다.</div>`);
  };

  return { render, open, back, setCat, save, del, upload, download, removeAtt, print };
})();

// ============================================================
// 2) SQF 일지 (작성 + 출력)
// ============================================================
const SqfLogsPage = (() => {
  let filter = 'ALL';

  const render = () => {
    SqfDB.seed();
    const logs = SqfDB.getLogs(filter);
    const tabs = ['ALL', ...SqfDB.LOG_TYPES].map(t =>
      `<button class="kind-btn ${filter === t ? 'active' : ''}" onclick="SqfLogsPage.setFilter('${t}')">${t === 'ALL' ? '전체' : t}</button>`).join('');
    const rows = logs.length ? logs.map(l => `
      <tr>
        <td><span class="tag tag-gray">${esc(l.type)}</span></td>
        <td>${esc(l.date)}</td>
        <td>${esc(l.target)}</td>
        <td class="mono">${esc(l.value)}</td>
        <td>${l.judged === '적합' ? '<span class="verdict verdict-ok">적합</span>' : l.judged === '부적합' ? '<span class="verdict verdict-high">부적합</span>' : '<span class="text-muted">-</span>'}</td>
        <td class="text-muted ellipsis" style="max-width:160px">${esc(l.memo)}${l.action ? ' · 조치:' + esc(l.action) : ''}</td>
        <td>${esc(l.by)}</td>
        <td><button class="btn btn-ghost btn-xs" onclick="SqfLogsPage.del('${l.id}')">삭제</button></td>
      </tr>`).join('') : `<tr><td colspan="8" class="text-muted" style="text-align:center;padding:20px">일지가 없습니다 — 위에서 작성하세요</td></tr>`;
    const typeOpts = SqfDB.LOG_TYPES.map(t => `<option>${t}</option>`).join('');
    return `
    <div class="card">
      <div class="card-head"><div class="card-title">SQF 일지 작성</div></div>
      <div class="form-grid form-grid-5">
        <div class="form-group"><label class="form-label">유형</label><select class="form-input form-input-sm" id="sl-type">${typeOpts}</select></div>
        <div class="form-group"><label class="form-label">일자</label><input type="date" class="form-input form-input-sm" id="sl-date" value="${new Date().toISOString().slice(0, 10)}"></div>
        <div class="form-group"><label class="form-label">대상/항목</label><input class="form-input form-input-sm" id="sl-target" placeholder="대상 설비·구역 등"></div>
        <div class="form-group"><label class="form-label">측정값/결과</label><input class="form-input form-input-sm" id="sl-value" placeholder="이상없음 · -18.2℃ · 합격"></div>
        <div class="form-group"><label class="form-label">판정</label><select class="form-input form-input-sm" id="sl-judged"><option>적합</option><option>부적합</option><option>-</option></select></div>
      </div>
      <div class="form-grid form-grid-2">
        <div class="form-group"><label class="form-label">특이사항</label><input class="form-input form-input-sm" id="sl-memo"></div>
        <div class="form-group"><label class="form-label">시정조치(부적합 시)</label><input class="form-input form-input-sm" id="sl-action"></div>
      </div>
      <div class="form-group" style="max-width:200px"><label class="form-label">작성자</label><input class="form-input form-input-sm" id="sl-by"></div>
      <div class="form-actions"><button class="btn btn-primary btn-sm" onclick="SqfLogsPage.add()">일지 저장</button></div>
    </div>

    <div class="card">
      <div class="card-head" style="flex-wrap:wrap;gap:8px">
        <div class="card-title">SQF 일지 <span class="text-muted" style="font-weight:400">(${logs.length}건)</span></div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" onclick="SqfLogsPage.print()">일지 인쇄</button>
        </div>
      </div>
      <div class="kind-toggle" style="margin-bottom:10px;flex-wrap:wrap">${tabs}</div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>유형</th><th>일자</th><th>대상/항목</th><th>측정값</th><th>판정</th><th>특이사항·조치</th><th>작성자</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="text-muted" style="font-size:12px;margin-top:8px">유형 탭으로 필터한 뒤 [일지 인쇄]를 누르면 해당 유형의 일지 시트(결재란 포함)가 출력됩니다.</div>
    </div>`;
  };

  const setFilter = (t) => { filter = t; App.refreshPage(); };
  const add = () => {
    if (!val('sl-target') && !val('sl-value')) { App.toast('대상 또는 측정값을 입력하세요', 'warning'); return; }
    SqfDB.addLog({ type: val('sl-type'), date: val('sl-date'), target: val('sl-target'), value: val('sl-value'),
      judged: val('sl-judged'), memo: val('sl-memo'), action: val('sl-action'), by: val('sl-by') });
    App.toast('일지가 저장되었습니다', 'success'); App.refreshPage();
  };
  const del = (id) => { if (confirm('삭제할까요?')) { SqfDB.deleteLog(id); App.refreshPage(); } };

  // 현재 필터 기준 일지 시트 인쇄 (결재란 포함)
  const print = () => {
    const logs = SqfDB.getLogs(filter).slice(0, 40);
    if (!logs.length) { App.toast('인쇄할 일지가 없습니다', 'warning'); return; }
    const title = filter === 'ALL' ? 'SQF 통합 점검일지' : `SQF ${filter} 일지`;
    const rows = logs.map((l, i) => `<tr>
        <td>${i + 1}</td><td>${esc(l.date)}</td><td>${esc(l.type)}</td><td class="l">${esc(l.target)}</td>
        <td>${esc(l.value)}</td>
        <td class="${l.judged === '부적합' ? 'rpt-bad' : l.judged === '적합' ? 'rpt-ok' : ''}">${esc(l.judged)}</td>
        <td class="l">${esc(l.memo || '')}${l.action ? ' / 조치: ' + esc(l.action) : ''}</td><td>${esc(l.by || '')}</td>
      </tr>`).join('');
    openReportOverlay(`
      <div class="rpt-h1">${esc(title)}</div>
      <div class="rpt-sub">(주)우성사료 논산공장 · SQF Ed.10 · 출력일 ${new Date().toISOString().slice(0, 10)}</div>
      <table class="rpt-info"><tr>
        <td class="lb" style="width:60px">결재</td>
        <td style="width:90px;text-align:center">작성<br><br><br></td>
        <td style="width:90px;text-align:center">검토<br><br><br></td>
        <td style="width:90px;text-align:center">승인<br><br><br></td>
        <td></td>
      </tr></table>
      <table class="rpt-tbl">
        <thead><tr><th>No</th><th>일자</th><th>유형</th><th>대상/항목</th><th>측정값/결과</th><th>판정</th><th>특이사항·조치</th><th>확인자</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="rpt-foot">본 일지는 SQF 시스템 기록으로 문서관리 절차에 따라 보관합니다.</div>`);
  };

  return { render, setFilter, add, del, print };
})();

// ============================================================
// 3) SQF 심사 시정조치
// ============================================================
const SqfCAPage = (() => {
  let openId = null;

  const stBadge = (s) => s === '종결' ? '<span class="verdict verdict-ok">종결</span>' : s === '조치중' ? '<span class="verdict verdict-low">조치중</span>' : '<span class="verdict verdict-high">접수</span>';

  const listView = () => {
    SqfDB.seed();
    const cas = SqfDB.getCAs();
    const open = cas.filter(c => c.status !== '종결').length;
    const rows = cas.length ? cas.map(c => `
      <tr onclick="SqfCAPage.open('${c.id}')" style="cursor:pointer">
        <td class="mono">${esc(c.clause)}</td>
        <td><b>${esc(c.title)}</b></td>
        <td><span class="tag tag-gray">${esc(c.audit)}</span></td>
        <td>${esc(c.grade)}</td>
        <td class="text-muted">${esc(c.dueDate || '-')}</td>
        <td>${stBadge(c.status)}</td>
      </tr>`).join('') : `<tr><td colspan="6" class="text-muted" style="text-align:center;padding:20px">시정조치 내역이 없습니다</td></tr>`;
    return `
    <div class="card">
      <div class="card-head">
        <div class="card-title">SQF 심사 시정조치 <span class="text-muted" style="font-weight:400">(${cas.length}건 · 미종결 ${open})</span></div>
        <button class="btn btn-primary btn-sm" onclick="SqfCAPage.open('NEW')">＋ 시정조치 등록</button>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>조항</th><th>지적사항</th><th>심사</th><th>등급</th><th>기한</th><th>상태</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="text-muted" style="font-size:12px;margin-top:10px">SQF 심사 지적사항(Non-conformance)과 시정조치를 관리합니다. CMX1 제출 전 이 화면에서 조치 내역을 정리하세요.</div>
    </div>`;
  };

  const detailView = (id) => {
    const isNew = id === 'NEW';
    const c = isNew ? { clause: '', title: '', grade: 'Minor', finding: '', cause: '', correction: '', preventive: '', owner: '', issueDate: new Date().toISOString().slice(0, 10), dueDate: '', closeDate: '', status: '접수', audit: '' } : SqfDB.getCA(id);
    if (!c) return listView();
    const gradeOpts = ['Critical', 'Major', 'Minor'].map(g => `<option ${g === c.grade ? 'selected' : ''}>${g}</option>`).join('');
    const stOpts = SqfDB.CA_STATUS.map(s => `<option ${s === c.status ? 'selected' : ''}>${s}</option>`).join('');
    return `
    <div class="detail-head">
      <button class="btn btn-ghost btn-sm" onclick="SqfCAPage.back()">← 목록</button>
      <div><div class="detail-title">${isNew ? '시정조치 등록' : esc(c.clause) + ' ' + esc(c.title)}</div><div class="detail-sub">${isNew ? '새 지적사항' : esc(c.audit)}</div></div>
      ${isNew ? '' : `<button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="SqfCAPage.print('${c.id}')">시정조치서 인쇄</button>`}
    </div>
    <div class="card">
      <div class="form-grid form-grid-4">
        <div class="form-group"><label class="form-label">조항 <span class="req">*</span></label><input class="form-input form-input-sm" id="ca-clause" value="${esc(c.clause)}" placeholder="예: 4.2.3.3"></div>
        <div class="form-group"><label class="form-label">심사명</label><input class="form-input form-input-sm" id="ca-audit" value="${esc(c.audit)}" placeholder="심사명 예시"></div>
        <div class="form-group"><label class="form-label">등급</label><select class="form-input form-input-sm" id="ca-grade">${gradeOpts}</select></div>
        <div class="form-group"><label class="form-label">상태</label><select class="form-input form-input-sm" id="ca-status">${stOpts}</select></div>
      </div>
      <div class="form-group"><label class="form-label">지적사항 요약 <span class="req">*</span></label><input class="form-input" id="ca-title" value="${esc(c.title)}"></div>
      <div class="form-group"><label class="form-label">지적 상세(Finding)</label><textarea class="form-input" id="ca-finding" rows="3">${esc(c.finding)}</textarea></div>
      <div class="form-group"><label class="form-label">원인 분석</label><textarea class="form-input" id="ca-cause" rows="2">${esc(c.cause)}</textarea></div>
      <div class="form-group"><label class="form-label">시정조치(Correction)</label><textarea class="form-input" id="ca-correction" rows="3">${esc(c.correction)}</textarea></div>
      <div class="form-group"><label class="form-label">재발방지(Preventive)</label><textarea class="form-input" id="ca-preventive" rows="2">${esc(c.preventive)}</textarea></div>
      <div class="form-grid form-grid-4">
        <div class="form-group"><label class="form-label">담당</label><input class="form-input form-input-sm" id="ca-owner" value="${esc(c.owner)}"></div>
        <div class="form-group"><label class="form-label">발행일</label><input type="date" class="form-input form-input-sm" id="ca-issue" value="${esc(c.issueDate)}"></div>
        <div class="form-group"><label class="form-label">기한</label><input type="date" class="form-input form-input-sm" id="ca-due" value="${esc(c.dueDate)}"></div>
        <div class="form-group"><label class="form-label">종결일</label><input type="date" class="form-input form-input-sm" id="ca-close" value="${esc(c.closeDate)}"></div>
      </div>
      <div class="form-actions">
        ${isNew ? '' : `<button class="btn btn-danger btn-sm" onclick="SqfCAPage.del('${c.id}')">삭제</button>`}
        <button class="btn btn-primary" onclick="SqfCAPage.save('${isNew ? 'NEW' : c.id}')">저장</button>
      </div>
    </div>`;
  };

  const render = () => openId ? detailView(openId) : listView();
  const open = (id) => { openId = id; App.refreshPage(); };
  const back = () => { openId = null; App.refreshPage(); };
  const collect = () => ({
    clause: val('ca-clause'), audit: val('ca-audit'), grade: val('ca-grade'), status: val('ca-status'),
    title: val('ca-title'), finding: val('ca-finding'), cause: val('ca-cause'), correction: val('ca-correction'), preventive: val('ca-preventive'),
    owner: val('ca-owner'), issueDate: val('ca-issue'), dueDate: val('ca-due'), closeDate: val('ca-close'),
  });
  const save = (id) => {
    const data = collect();
    if (!data.clause || !data.title) { App.toast('조항과 지적사항 요약을 입력하세요', 'error'); return; }
    if (id === 'NEW') { const r = SqfDB.addCA(data); openId = r.id; App.toast('시정조치가 등록되었습니다', 'success'); }
    else { SqfDB.updateCA(id, data); App.toast('저장되었습니다', 'success'); }
    App.refreshPage();
  };
  const del = (id) => { if (confirm('삭제할까요?')) { SqfDB.deleteCA(id); openId = null; App.refreshPage(); } };

  // 시정조치 보고서 인쇄
  const print = (id) => {
    const c = SqfDB.getCA(id); if (!c) return;
    openReportOverlay(`
      <div class="rpt-h1">SQF 시정조치 보고서</div>
      <div class="rpt-sub">CORRECTIVE ACTION REPORT · (주)우성사료 논산공장</div>
      <table class="rpt-info">
        <tr><td class="lb">심사</td><td>${esc(c.audit || '-')}</td><td class="lb">조항</td><td class="mono">${esc(c.clause)}</td><td class="lb">등급</td><td>${esc(c.grade)}</td></tr>
        <tr><td class="lb">발행일</td><td>${esc(c.issueDate || '-')}</td><td class="lb">기한</td><td>${esc(c.dueDate || '-')}</td><td class="lb">종결일</td><td>${esc(c.closeDate || '-')}</td></tr>
        <tr><td class="lb">담당</td><td>${esc(c.owner || '-')}</td><td class="lb">상태</td><td colspan="3"><b>${esc(c.status)}</b></td></tr>
      </table>
      <table class="rpt-tbl">
        <tr><th style="width:110px">지적사항</th><td class="l" style="min-height:40px">${esc(c.title)}${c.finding ? '<br><span style="color:#444">' + esc(c.finding) + '</span>' : ''}</td></tr>
        <tr><th>원인 분석</th><td class="l">${esc(c.cause || '')}</td></tr>
        <tr><th>시정조치</th><td class="l">${esc(c.correction || '')}</td></tr>
        <tr><th>재발방지</th><td class="l">${esc(c.preventive || '')}</td></tr>
      </table>
      <div class="rpt-sign">SQF Practitioner: ______________ · Site Manager: ______________</div>
      <div class="rpt-foot">본 보고서는 SQF 심사 시정조치 기록으로 CMX1 제출 자료와 함께 보관합니다.</div>`);
  };

  return { render, open, back, save, del, print };
})();
