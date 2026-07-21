// ============================================================
// voc.js — VOC 역추적 페이지 (PPT 원료 추적 연결키 재현)
// ============================================================

const VOCPage = (() => {
  let prefillFgLot  = '';
  let prefillProduct = '';
  let prefillProductCode = '';

  const statusBadge = (s) => {
    if (s==='OPEN')          return `<span class="badge badge-alert">접수</span>`;
    if (s==='INVESTIGATING') return `<span class="badge badge-warning">조사중</span>`;
    if (s==='CLOSED')        return `<span class="badge badge-pass">종결</span>`;
    return `<span class="badge badge-default">${s}</span>`;
  };

  const severityBadge = (s) => {
    if (s==='HIGH')   return `<span class="badge badge-fail">긴급</span>`;
    if (s==='MEDIUM') return `<span class="badge badge-warning">중간</span>`;
    return `<span class="badge badge-default">낮음</span>`;
  };

  const render = () => {
    const vocs = DB.getVOCs().slice().reverse();
    return `
      <div class="fade-in">
        <div class="flex items-center justify-between mb-20">
          <div class="text-sm text-muted">총 ${vocs.length}건 (미종결: ${vocs.filter(v=>v.status!=='CLOSED').length}건)</div>
          <button class="btn btn-primary btn-sm" onclick="VOCPage.openAddModal()">＋ VOC 등록</button>
        </div>

        ${vocs.length === 0 ? `
          <div class="empty-state">
            <div class="empty-icon"></div>
            <h3>등록된 VOC가 없습니다</h3>
            <p>고객 클레임 발생 시 VOC를 등록하고 원료를 역추적하세요</p>
          </div>
        ` : `
        <div style="display:flex;flex-direction:column;gap:12px">
          ${vocs.map(v => `
            <div class="card voc-card">
              <div class="flex items-start justify-between gap-12">
                <div style="flex:1">
                  <div class="flex items-center gap-8 mb-4">
                    ${statusBadge(v.status)}
                    ${severityBadge(v.severity)}
                    <span class="td-mono text-xs text-muted">${v.vocNo}</span>
                  </div>
                  <div class="font-bold mb-2">${v.productName||'제품명 미입력'}</div>
                  <div class="text-sm text-muted mb-4">고객: ${v.customer||'-'} · 유형: ${v.category} · 등록: ${formatDate(v.registeredAt)}</div>
                  <div class="text-sm">${v.complaint}</div>
                  ${v.fgLotNo?`<div class="mt-4"><span class="badge badge-info">제품LOT: ${v.fgLotNo}</span></div>`:''}
                </div>
                <div style="display:flex;flex-direction:column;gap:6px;min-width:120px">
                  <button class="btn btn-primary btn-sm" onclick="VOCPage.traceVOC('${v.id}')">역추적</button>
                  <button class="btn btn-ghost btn-sm" onclick="VOCPage.aiReport('${v.id}')" style="color:var(--ai-accent-light)">원인분석</button>
                  ${v.status!=='CLOSED'?`<button class="btn btn-ghost btn-xs" onclick="VOCPage.updateStatus('${v.id}','INVESTIGATING')">조사중</button>`:''}
                  ${v.status!=='CLOSED'?`<button class="btn btn-ghost btn-xs" onclick="VOCPage.updateStatus('${v.id}','CLOSED')">종결</button>`:''}
                </div>
              </div>
            </div>
          `).join('')}
        </div>`}

        <!-- VOC 등록 모달 -->
        <div class="modal-overlay" id="voc-add-modal">
          <div class="modal modal-lg">
            <div class="modal-header">
              <div class="modal-title">VOC 등록</div>
              <button class="modal-close" onclick="VOCPage.closeModal('voc-add-modal')">✕</button>
            </div>
            <div id="voc-add-body"></div>
          </div>
        </div>

        <!-- 역추적 결과 모달 -->
        <div class="modal-overlay" id="voc-trace-modal">
          <div class="modal modal-xl">
            <div class="modal-header">
              <div class="modal-title">원료 추적 연결키 — 역추적 결과</div>
              <button class="modal-close" onclick="VOCPage.closeModal('voc-trace-modal')">✕</button>
            </div>
            <div id="voc-trace-body"></div>
          </div>
        </div>

        <!-- AI 근본원인 분석 모달 -->
        <div class="modal-overlay" id="voc-ai-modal">
          <div class="modal modal-xl">
            <div class="modal-header">
              <div class="modal-title" style="color:var(--ai-accent-light)">AI 근본원인 분석 리포트</div>
              <button class="modal-close" onclick="VOCPage.closeModal('voc-ai-modal')">✕</button>
            </div>
            <div id="voc-ai-body"></div>
          </div>
        </div>
      </div>
    `;
  };

  const afterRender = () => {
    // 다른 화면에서 넘어온 prefill 값이 있으면 모달 자동 오픈(제품LOT/제품코드 어느 쪽이든)
    if (prefillFgLot || prefillProduct || prefillProductCode) { setTimeout(() => { openAddModal(); }, 100); }
  };

  // VOC 페이지가 이미 떠 있으면 즉시 모달을 열고, 아니면 페이지로 이동 후 afterRender가 연다
  const openIfReady = () => {
    if (document.getElementById('voc-add-modal')) { openAddModal(); }
    else { App.navigate('voc'); }
  };

  const prefill = (fgLot, product, productCode = '') => {
    prefillFgLot   = fgLot;
    prefillProduct = product;
    prefillProductCode = productCode;
    openIfReady();
  };

  const prefillProductCodeFn = (productCode, product) => {
    prefillFgLot = '';
    prefillProduct = product || '';
    prefillProductCode = productCode || '';
    openIfReady();
  };

  const openAddModal = () => {
    const body = document.getElementById('voc-add-body');
    if (!body) return;
    const products = DB.getProductLots();
    const productMaster = DB.getProducts();
    body.innerHTML = `
      <div style="padding:16px;display:flex;flex-direction:column;gap:14px">
        <div class="form-grid form-grid-2">
          <div class="form-group">
            <label class="form-label">제품코드 QR/마스터</label>
            <input type="text" class="form-input" id="voc-product-code" list="product-code-list" value="${prefillProductCode}" placeholder="제품코드 또는 QR키">
            <datalist id="product-code-list">${productMaster.slice(0,300).map(p=>`<option value="${p.code}">${p.code} - ${p.name}`).join('')}</datalist>
          </div>
          <div class="form-group">
            <label class="form-label">제품 LOT</label>
            <input type="text" class="form-input" id="voc-fglot" list="fg-lot-list" value="${prefillFgLot}" placeholder="제품 LOT 입력">
            <datalist id="fg-lot-list">${products.map(p=>`<option value="${p.fgLotNo}">${p.fgLotNo} - ${p.productName}`).join('')}</datalist>
          </div>
        </div>
        <div class="form-grid form-grid-2">
          <div class="form-group">
            <label class="form-label">제품명</label>
            <input type="text" class="form-input" id="voc-product" value="${prefillProduct}" placeholder="예) 육계 선진L">
          </div>
          <div class="form-group">
            <label class="form-label">고객/거래처</label>
            <input type="text" class="form-input" id="voc-customer" placeholder="예) 삼성농장">
          </div>
          <div class="form-group">
            <label class="form-label">클레임 유형</label>
            <select class="form-input" id="voc-category">
              <option value="품질이상">품질이상</option>
              <option value="이물혼입">이물혼입</option>
              <option value="규격불일치">규격불일치</option>
              <option value="이취/변질">이취/변질</option>
              <option value="기타">기타</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">클레임 내용 *</label>
          <textarea class="form-input" id="voc-complaint" rows="3" placeholder="고객 불만 내용을 상세히 입력해주세요"></textarea>
        </div>
        <div class="form-grid form-grid-2">
          <div class="form-group">
            <label class="form-label">긴급도</label>
            <select class="form-input" id="voc-severity">
              <option value="HIGH">긴급</option>
              <option value="MEDIUM" selected>중간</option>
              <option value="LOW">낮음</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">담당자</label>
            <input type="text" class="form-input" id="voc-actor" value="품질팀">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="VOCPage.closeModal('voc-add-modal')">취소</button>
          <button class="btn btn-primary" onclick="VOCPage.submitVOC()">VOC 등록</button>
        </div>
      </div>
    `;
    prefillFgLot = '';
    prefillProduct = '';
    prefillProductCode = '';
    document.getElementById('voc-add-modal').classList.add('open');
  };

  const submitVOC = () => {
    const fgLotNo   = document.getElementById('voc-fglot')?.value.trim();
    let productCode = document.getElementById('voc-product-code')?.value.trim();
    let product   = document.getElementById('voc-product')?.value.trim();
    const customer  = document.getElementById('voc-customer')?.value.trim();
    const category  = document.getElementById('voc-category')?.value;
    const complaint = document.getElementById('voc-complaint')?.value.trim();
    const severity  = document.getElementById('voc-severity')?.value;
    const actor     = document.getElementById('voc-actor')?.value || '품질팀';
    if (!complaint) { App.toast('클레임 내용을 입력해주세요', 'error'); return; }
    if (productCode) {
      const resolvedProduct = DB.resolveQRCode(productCode);
      if (resolvedProduct.type === 'PRODUCT' && resolvedProduct.item) {
        productCode = resolvedProduct.item.code;
        if (!product) product = resolvedProduct.item.name;
      }
    }
    DB.addVOC({ fgLotNo, productCode, productName: product, customer, category, complaint, severity, actor });
    closeModal('voc-add-modal');
    App.toast('VOC 등록 완료', 'success');
    App.updateBadges();
    App.refreshPage();
  };

  // ── 핵심: VOC 역추적 ──
  const traceVOC = (vocId) => {
    const voc  = DB.getVOCById(vocId);
    if (!voc) return;

    let result = null;
    if (voc.fgLotNo || voc.productCode) {
      result = DB.traceVOC(voc.fgLotNo, voc.productCode);
    }

    // 추적 결과가 없으면 샘플 체인 표시
    const body = document.getElementById('voc-trace-body');
    if (!body) return;

    // 추적 체인 생성 (PPT 이미지 기준)
    const productLot   = result?.productLot || null;
    const productMaster = result?.productMaster || (voc.productCode ? DB.getProductByCode(voc.productCode) : null);
    const batch        = result?.batch        || null;
    const receivings   = result?.receivings   || [];
    const suppliers    = result?.suppliers    || [];

    body.innerHTML = `
      <div style="padding:16px">
        <div class="info-box info-warning mb-16">
          <strong>VOC: ${voc.vocNo}</strong> — ${voc.complaint}
          ${voc.productCode ? `<div class="text-sm mt-4">제품코드: <span class="td-mono">${voc.productCode}</span> / ${productMaster?.name || voc.productName || '-'}</div>` : ''}
        </div>

        <!-- 원료 추적 연결키 체인 (PPT 이미지6 재현) -->
        <div class="trace-chain mb-20">
          <div class="trace-chain-title">원료 추적 연결키 — 입고부터 배합까지</div>
          <div class="trace-chain-subtitle">클레임이나 재고 차이 발생 시 역추적 기준이 되는 데이터입니다</div>

          <div class="trace-steps">
            <!-- Step 1: 사전입고 QR -->
            <div class="trace-step">
              <div class="trace-step-icon"></div>
              <div class="trace-step-content">
                <div class="trace-step-label">사전입고 QR</div>
                <div class="trace-step-desc">협력사 사전 등록</div>
                <div class="trace-step-value ${receivings.length>0?'':'trace-empty'}">
                  ${receivings.length>0 ? receivings.map(r=>`<div class="trace-link">${r.preRegId||r.id}</div>`).join('') : '<span class="text-muted text-xs">추적 정보 없음</span>'}
                </div>
              </div>
            </div>
            <div class="trace-arrow">→</div>

            <!-- Step 2: 원료 입고 LOT -->
            <div class="trace-step">
              <div class="trace-step-icon"></div>
              <div class="trace-step-content">
                <div class="trace-step-label">원료 입고 LOT</div>
                <div class="trace-step-desc">우성 계근 확정</div>
                <div class="trace-step-value ${receivings.length>0?'':'trace-empty'}">
                  ${receivings.length>0 ? receivings.map(r=>`<div class="trace-link">${r.lotNo||r.id.slice(0,12)}</div>`).join('') : '<span class="text-muted text-xs">추적 정보 없음</span>'}
                </div>
              </div>
            </div>
            <div class="trace-arrow">→</div>

            <!-- Step 3: 사일로 LOT 잔량 -->
            <div class="trace-step">
              <div class="trace-step-icon"></div>
              <div class="trace-step-content">
                <div class="trace-step-label">사일로 LOT 잔량</div>
                <div class="trace-step-desc">사일로 배정 후 FIFO 순서</div>
                <div class="trace-step-value ${result?.siloIds?.length>0?'':'trace-empty'}">
                  ${result?.siloIds?.length>0 ? result.siloIds.map(id=>{
                    const silo = DB.getSiloById(id);
                    const sum  = silo ? DB.getSiloCapacitySummary(silo) : null;
                    return `<div class="trace-link">${id} / FIFO</div>`;
                  }).join('') : '<span class="text-muted text-xs">추적 정보 없음</span>'}
                </div>
              </div>
            </div>
            <div class="trace-arrow">→</div>

            <!-- Step 4: 투입지시 -->
            <div class="trace-step">
              <div class="trace-step-icon"></div>
              <div class="trace-step-content">
                <div class="trace-step-label">투입지시</div>
                <div class="trace-step-desc">생산팀 작업 지시</div>
                <div class="trace-step-value ${result?.prodOrders?.length>0?'':'trace-empty'}">
                  ${result?.prodOrders?.length>0 ? result.prodOrders.map(o=>`<div class="trace-link">${o.id}</div>`).join('') : '<span class="text-muted text-xs">추적 정보 없음</span>'}
                </div>
              </div>
            </div>
            <div class="trace-arrow">→</div>

            <!-- Step 5: 배합 배치 -->
            <div class="trace-step">
              <div class="trace-step-icon"></div>
              <div class="trace-step-content">
                <div class="trace-step-label">배합 배치</div>
                <div class="trace-step-desc">실제 원료 투입 기록</div>
                <div class="trace-step-value ${batch?'':'trace-empty'}">
                  ${batch ? `<div class="trace-link">${batch.batchCode}</div>` : '<span class="text-muted text-xs">추적 정보 없음</span>'}
                </div>
              </div>
            </div>
            <div class="trace-arrow">→</div>

            <!-- Step 6: 제품 LOT -->
            <div class="trace-step">
              <div class="trace-step-icon"></div>
              <div class="trace-step-content">
                <div class="trace-step-label">제품 LOT</div>
                <div class="trace-step-desc">완제품 추적 연결</div>
                <div class="trace-step-value ${productLot?'':'trace-empty'}">
                  ${productLot ? `<div class="trace-link">${productLot.fgLotNo}</div>` : `<div class="trace-link text-muted">${voc.fgLotNo || productMaster?.qrCode || '미입력'}</div>`}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 협력사 정보 -->
        ${suppliers.length>0 ? `
        <div class="card mb-16">
          <div class="card-header"><div class="card-title">관련 협력사</div></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;padding:12px">
            ${suppliers.filter(Boolean).map(s=>`
              <div class="supplier-chip">
                <strong>${s.name}</strong>
                <span class="text-xs text-muted">${s.code}</span>
              </div>`).join('')}
          </div>
        </div>` : ''}

        <!-- 추적 테이블 -->
        <div class="card">
          <div class="card-header"><div class="card-title">단계별 연결 데이터</div></div>
          <div class="table-wrapper">
            <table>
              <thead><tr><th>단계</th><th>연결 데이터</th><th>저장 기준</th><th>추적 목적</th></tr></thead>
              <tbody>
                <tr><td>입고</td><td>QR, 협력사, 원료코드, 계근값</td><td>사전입고번호 + 원료 LOT</td><td>어떤 원료가 언제 들어왔는지 확인</td></tr>
                <tr><td>보관</td><td>사일로, FIFO 순서, LOT별 잔량</td><td>silo_lot_balances</td><td>사일로 안 LOT 구성 추정</td></tr>
                <tr><td>투입지시</td><td>생산 LOT, 배합코드, 지시량</td><td>production_orders</td><td>어느 배합에 어떤 사일로를 썼는지 확인</td></tr>
                <tr><td>배합</td><td>실투입량, FIFO 차감 LOT, 작업자</td><td>mixing_batches + material_consumptions</td><td>완제품 LOT에서 원료 LOT까지 역추적</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="modal-footer mt-16">
          <button class="btn btn-ghost" onclick="VOCPage.closeModal('voc-trace-modal')">닫기</button>
          <button class="btn btn-primary" onclick="VOCPage.updateStatus('${vocId}','INVESTIGATING');VOCPage.closeModal('voc-trace-modal')">조사 시작</button>
        </div>
      </div>
    `;

    // VOC 추적 결과 저장
    DB.updateVOC(vocId, { traceResult: result ? '추적 완료' : '추적 정보 부족', status: voc.status === 'OPEN' ? 'INVESTIGATING' : voc.status });
    document.getElementById('voc-trace-modal').classList.add('open');
  };

  const updateStatus = (vocId, status) => {
    DB.updateVOC(vocId, { status });
    App.toast(`VOC 상태 변경: ${status}`, 'success');
    App.updateBadges();
    App.refreshPage();
  };

  const closeModal = (id) => document.getElementById(id)?.classList.remove('open');

  // ── AI 근본원인 분석 리포트 ──
  const sevText = { HIGH:'긴급', MEDIUM:'중간', LOW:'낮음' };
  const aiReport = (vocId) => {
    const voc = DB.getVOCById(vocId);
    const body = document.getElementById('voc-ai-body');
    if (!voc || !body) return;
    const r = AIEngine.buildRootCauseReport(voc);
    const hasKey = AIEngine.hasApiKey();
    body.innerHTML = `
      <div style="padding:4px 4px 16px">
        <div class="card" style="padding:14px;margin-bottom:14px">
          <div class="text-xs text-muted">클레임</div>
          <div style="font-weight:700">${voc.complaint || '-'}</div>
          <div class="text-xs text-muted" style="margin-top:4px">유형 ${voc.category||'-'} · 제품 ${voc.productName||voc.productCode||'-'} · LOT ${voc.fgLotNo||'-'} · 긴급도 ${sevText[voc.severity]||voc.severity||'-'}</div>
        </div>

        <div class="card" style="padding:14px;margin-bottom:14px;border-left:4px solid var(--ai-accent)">
          <div class="section-title mb-12">유력 근본원인</div>
          <div><span class="badge badge-warning">${r.topCause.area}</span> ${r.topCause.desc}</div>
          ${r.causes.length>1?`<div style="margin-top:10px" class="text-xs text-muted">그 외 후보</div><ul style="margin:4px 0 0 16px;font-size:13px">${r.causes.slice(1,5).map(c=>`<li><strong>${c.area}</strong> — ${c.desc}</li>`).join('')}</ul>`:''}
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px" class="ai-two-col">
          <div class="card" style="padding:14px">
            <div class="section-title mb-12">추적 원료</div>
            ${r.materialFindings.length? `<ul style="margin:0 0 0 16px;font-size:13px;line-height:1.8">${r.materialFindings.map(m=>`<li>${m.materialName} <span class="td-mono text-xs">${m.lotNo||''}</span> / 협력사 ${m.supplierName||'미상'} ${m.hasIssue?'<span class="badge badge-fail">분석이상</span>':'<span class="badge badge-pass">정상</span>'}</li>`).join('')}</ul>` : '<div class="text-xs text-muted">추적된 원료 LOT이 없습니다(배합·소비 데이터 필요).</div>'}
          </div>
          <div class="card" style="padding:14px">
            <div class="section-title mb-12">⚠ 공정 신호</div>
            <div class="text-xs" style="line-height:1.9">
              CCP 한계이탈: <strong>${r.ccpDevs.length}건</strong>${r.ccpDevs.length?` (${r.ccpDevs.map(d=>d.ccpName).join(', ')})`:''}<br>
              미해결 공정이슈: <strong>${r.issues.length}건</strong>${r.issues.length?` (${r.issues.map(i=>i.title).join(', ')})`:''}
            </div>
          </div>
        </div>

        <div class="card" style="padding:14px;margin-top:14px;border-left:4px solid var(--success)">
          <div class="section-title mb-12">권고 조치(CAPA)</div>
          <ol style="margin:0 0 0 16px;font-size:13px;line-height:1.8">${r.actions.map(a=>`<li>${a}</li>`).join('')}</ol>
        </div>

        <div style="margin-top:16px;display:flex;gap:8px;align-items:center">
          <button class="btn btn-primary btn-sm" onclick="VOCPage.aiDeep('${vocId}')" ${hasKey?'':'disabled'}>Claude 심층분석 리포트</button>
          <span class="text-xs text-muted">${hasKey?'AI가 5-Why·CAPA 서술형 보고서를 생성합니다':'심층분석은 AI 어시스턴트에서 Claude API Key 등록 시 사용 가능'}</span>
        </div>
        <div id="voc-ai-deep" style="margin-top:12px"></div>
      </div>`;
    document.getElementById('voc-ai-modal').classList.add('open');
  };

  const aiDeep = async (vocId) => {
    const voc = DB.getVOCById(vocId);
    const out = document.getElementById('voc-ai-deep');
    if (!voc || !out) return;
    out.innerHTML = `<div class="card" style="padding:14px"><div class="text-muted">AI가 리포트를 작성 중입니다…</div></div>`;
    try {
      const prompt = AIEngine.rootCausePrompt(voc);
      let acc = '';
      for await (const chunk of AIEngine.askClaude(prompt, [])) {
        acc += chunk;
        out.innerHTML = `<div class="card" style="padding:14px;white-space:pre-wrap;font-size:13px;line-height:1.7">${acc.replace(/</g,'&lt;')}</div>`;
      }
    } catch (e) {
      out.innerHTML = `<div class="card" style="padding:14px;color:var(--danger)">AI 분석 실패: ${e.message}</div>`;
    }
  };

  return { render, afterRender, prefill, prefillProductCode: prefillProductCodeFn, openAddModal, submitVOC, traceVOC, updateStatus, closeModal, aiReport, aiDeep };
})();
