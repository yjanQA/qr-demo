// ============================================================
// batch.js — 배합 배치 + 제품 LOT 관리
// ============================================================

const BatchPage = (() => {
  let tab = 'batch';  // batch / product

  const render = () => {
    const batches  = DB.getBatches().slice().reverse();
    const products = DB.getProductLots().slice().reverse();
    return `
      <div class="fade-in">
        <div class="tabs mb-16">
          <div class="tab ${tab==='batch'?'active':''}" onclick="BatchPage.setTab('batch')">배합 배치 (${batches.length})</div>
          <div class="tab ${tab==='product'?'active':''}" onclick="BatchPage.setTab('product')">제품 LOT (${products.length})</div>
        </div>

        ${tab === 'batch' ? renderBatches(batches) : renderProducts(products)}

        <!-- 배합 등록 모달 -->
        <div class="modal-overlay" id="batch-add-modal">
          <div class="modal modal-lg">
            <div class="modal-header">
              <div class="modal-title">배합 배치 등록</div>
              <button class="modal-close" onclick="BatchPage.closeModal('batch-add-modal')">✕</button>
            </div>
            <div id="batch-add-body"></div>
          </div>
        </div>

        <!-- 제품LOT 등록 모달 -->
        <div class="modal-overlay" id="product-add-modal">
          <div class="modal modal-lg">
            <div class="modal-header">
              <div class="modal-title">제품 LOT 등록</div>
              <button class="modal-close" onclick="BatchPage.closeModal('product-add-modal')">✕</button>
            </div>
            <div id="product-add-body"></div>
          </div>
        </div>

        <!-- 상세 모달 -->
        <div class="modal-overlay" id="batch-detail-modal">
          <div class="modal modal-lg">
            <div class="modal-header">
              <div class="modal-title">배합 상세</div>
              <button class="modal-close" onclick="BatchPage.closeModal('batch-detail-modal')">✕</button>
            </div>
            <div id="batch-detail-body"></div>
          </div>
        </div>
      </div>
    `;
  };

  const renderBatches = (batches) => `
    <div class="flex justify-between items-center mb-12">
      <div class="text-sm text-muted">총 ${batches.length}건</div>
      <button class="btn btn-primary btn-sm" onclick="BatchPage.openBatchModal()">＋ 배합 등록</button>
    </div>
    <div class="card">
      <div class="table-wrapper">
        <table>
          <thead><tr><th>배치코드</th><th>공장</th><th>제품코드</th><th>제품명</th><th class="td-right">총량(kg)</th><th>소비LOT</th><th>제품LOT</th><th>배합일시</th><th>액션</th></tr></thead>
          <tbody>
            ${batches.length===0?`<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--text-muted)">배합 배치가 없습니다</td></tr>`:
            batches.map(b=>`<tr>
              <td><span class="td-mono text-xs">${b.batchCode}</span></td>
              <td>${DB.getFactoryName(b.factory)}</td>
              <td><span class="td-mono text-xs">${b.productCode || '-'}</span></td>
              <td><strong>${b.productName}</strong></td>
              <td class="td-right">${formatNum(b.totalQty)}</td>
              <td class="td-center">${(b.consumedLots||[]).length}개</td>
              <td>${b.productLotId?`<span class="badge badge-pass">연결됨</span>`:`<span class="badge badge-default">미연결</span>`}</td>
              <td class="text-xs text-muted">${formatDate(b.batchedAt)}</td>
              <td>
                <div style="display:flex;gap:4px">
                  <button class="btn btn-ghost btn-xs" onclick="BatchPage.showDetail('${b.id}')">상세</button>
                  ${!b.productLotId?`<button class="btn btn-success btn-xs" onclick="BatchPage.openProductModal('${b.id}')">제품LOT 등록</button>`:''}
                </div>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  const renderProducts = (products) => `
    <div class="flex justify-between items-center mb-12">
      <div class="text-sm text-muted">총 ${products.length}건</div>
      <button class="btn btn-primary btn-sm" onclick="BatchPage.openProductModal()">＋ 제품LOT 등록</button>
    </div>
    <div class="card">
      <div class="table-wrapper">
        <table>
          <thead><tr><th>제품LOT</th><th>QR키</th><th>공장</th><th>제품코드</th><th>제품명</th><th class="td-right">수량(kg)</th><th>포장형태</th><th>포장수</th><th>생산일</th><th>상태</th><th>액션</th></tr></thead>
          <tbody>
            ${products.length===0?`<tr><td colspan="11" style="text-align:center;padding:40px;color:var(--text-muted)">제품 LOT가 없습니다</td></tr>`:
            products.map(p=>`<tr>
              <td><span class="td-mono text-xs">${p.fgLotNo}</span></td>
              <td><span class="td-mono text-xs">${p.qrCode || DB.makeQRValue('PRODUCT_LOT', p.fgLotNo)}</span></td>
              <td>${DB.getFactoryName(p.factory)}</td>
              <td><span class="td-mono text-xs">${p.productCode || '-'}</span></td>
              <td><strong>${p.productName}</strong></td>
              <td class="td-right">${formatNum(p.qty)}</td>
              <td>${p.packType}</td>
              <td class="td-center">${formatNum(p.packCount)}개</td>
              <td>${p.productionDate||'-'}</td>
              <td><span class="badge ${p.status==='AVAILABLE'?'badge-pass':p.status==='SHIPPED'?'badge-info':'badge-default'}">${p.status==='AVAILABLE'?'사용가능':p.status==='SHIPPED'?'출하완료':p.status}</span></td>
              <td>
                <button class="btn btn-ghost btn-xs" onclick="App.navigate('voc');setTimeout(()=>VOCPage.prefill('${p.fgLotNo}','${p.productName}','${p.productCode || ''}'),200)">VOC</button>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  const setTab = (t) => { tab = t; App.refreshPage(); };

  const openBatchModal = () => {
    const body = document.getElementById('batch-add-body');
    if (!body) return;
    const productOptions = DB.getProducts().slice(0,300).map(p=>`<option value="${p.code}">${p.code} - ${p.name}`).join('');
    body.innerHTML = `
      <div style="padding:16px;display:flex;flex-direction:column;gap:14px">
        <div class="form-grid form-grid-2">
          <div class="form-group">
            <label class="form-label">공장</label>
            <select class="form-input" id="bat-factory">
              ${DB.getFactories().map(f=>`<option value="${f.id}">${f.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">제품코드</label>
            <input type="text" class="form-input" id="bat-product-code" list="batch-product-code-list" placeholder="제품코드">
            <datalist id="batch-product-code-list">${productOptions}</datalist>
          </div>
        </div>
        <div class="form-group">
            <label class="form-label">제품명 *</label>
            <input type="text" class="form-input" id="bat-product" placeholder="예) 육계 선진L">
        </div>
        <div class="form-group">
          <label class="form-label">총 배합량 (kg) *</label>
          <input type="number" class="form-input" id="bat-qty" placeholder="0" min="0">
        </div>
        <div class="form-group">
          <label class="form-label">담당자</label>
          <input type="text" class="form-input" id="bat-actor" value="배합팀">
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="BatchPage.closeModal('batch-add-modal')">취소</button>
          <button class="btn btn-primary" onclick="BatchPage.submitBatch()">배합 등록</button>
        </div>
      </div>
    `;
    document.getElementById('batch-add-modal').classList.add('open');
  };

  const submitBatch = () => {
    const factory  = document.getElementById('bat-factory')?.value;
    const productCode = document.getElementById('bat-product-code')?.value.trim();
    const product  = document.getElementById('bat-product')?.value.trim();
    const qty      = parseFloat(document.getElementById('bat-qty')?.value);
    const actor    = document.getElementById('bat-actor')?.value || '배합팀';
    if (!product || !qty || qty <= 0) { App.toast('제품명과 배합량은 필수입니다', 'error'); return; }
    DB.addBatch({ factory, productCode, productName: product, totalQty: qty, actor });
    closeModal('batch-add-modal');
    App.toast('배합 배치 등록 완료', 'success');
    App.refreshPage();
  };

  const openProductModal = (batchId) => {
    const body = document.getElementById('product-add-body');
    if (!body) return;
    const batch = batchId ? DB.getBatchById(batchId) : null;
    const productOptions = DB.getProducts().slice(0,300).map(p=>`<option value="${p.code}">${p.code} - ${p.name}`).join('');
    body.innerHTML = `
      <div style="padding:16px;display:flex;flex-direction:column;gap:14px">
        ${batch ? `<div class="info-box info-blue">배합배치: <strong>${batch.batchCode}</strong> / ${batch.productName} / ${formatNum(batch.totalQty)}kg</div>` : ''}
        <div class="form-grid form-grid-2">
          <div class="form-group">
            <label class="form-label">공장</label>
            <select class="form-input" id="fg-factory">
              ${DB.getFactories().map(f=>`<option value="${f.id}" ${batch?.factory===f.id?'selected':''}>${f.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">제품코드</label>
            <input type="text" class="form-input" id="fg-product-code" list="fg-product-code-list" value="${batch?.productCode||''}" placeholder="제품코드">
            <datalist id="fg-product-code-list">${productOptions}</datalist>
          </div>
        </div>
        <div class="form-group">
            <label class="form-label">제품명 *</label>
            <input type="text" class="form-input" id="fg-product" value="${batch?.productName||''}" placeholder="예) 육계 선진L">
        </div>
        <div class="form-grid form-grid-2">
          <div class="form-group">
            <label class="form-label">수량 (kg) *</label>
            <input type="number" class="form-input" id="fg-qty" value="${batch?.totalQty||''}" placeholder="0">
          </div>
          <div class="form-group">
            <label class="form-label">포장형태</label>
            <select class="form-input" id="fg-pack">
              <option value="20kg포대">20kg 포대</option>
              <option value="25kg포대">25kg 포대</option>
              <option value="1t톤백">1t 톤백</option>
              <option value="벌크">벌크</option>
            </select>
          </div>
        </div>
        <div class="form-grid form-grid-2">
          <div class="form-group">
            <label class="form-label">포장 수량 (개)</label>
            <input type="number" class="form-input" id="fg-packcount" placeholder="0">
          </div>
          <div class="form-group">
            <label class="form-label">생산일자</label>
            <input type="date" class="form-input" id="fg-date" value="${new Date().toISOString().split('T')[0]}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">담당자</label>
          <input type="text" class="form-input" id="fg-actor" value="포장팀">
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="BatchPage.closeModal('product-add-modal')">취소</button>
          <button class="btn btn-primary" onclick="BatchPage.submitProduct('${batchId||''}')">제품LOT 등록</button>
        </div>
      </div>
    `;
    document.getElementById('product-add-modal').classList.add('open');
  };

  const submitProduct = (batchId) => {
    const factory   = document.getElementById('fg-factory')?.value;
    const productCode = document.getElementById('fg-product-code')?.value.trim();
    const product   = document.getElementById('fg-product')?.value.trim();
    const qty       = parseFloat(document.getElementById('fg-qty')?.value);
    const packType  = document.getElementById('fg-pack')?.value;
    const packCount = parseInt(document.getElementById('fg-packcount')?.value)||0;
    const date      = document.getElementById('fg-date')?.value;
    const actor     = document.getElementById('fg-actor')?.value || '포장팀';
    if (!product || !qty || qty <= 0) { App.toast('제품명과 수량은 필수입니다', 'error'); return; }
    DB.addProductLot({ factory, productCode, productName: product, batchId, qty, packType, packCount, productionDate: date, actor });
    closeModal('product-add-modal');
    App.toast('제품 LOT 등록 완료', 'success');
    App.refreshPage();
  };

  const showDetail = (batchId) => {
    const batch = DB.getBatchById(batchId);
    if (!batch) return;
    const body = document.getElementById('batch-detail-body');
    if (!body) return;
    body.innerHTML = `
      <div style="padding:16px">
        <div class="info-grid-2 mb-12">
          <div><div class="info-label">배치코드</div><div class="info-value font-mono">${batch.batchCode}</div></div>
          <div><div class="info-label">공장</div><div class="info-value">${DB.getFactoryName(batch.factory)}</div></div>
          <div><div class="info-label">제품명</div><div class="info-value">${batch.productName}</div></div>
          <div><div class="info-label">총량</div><div class="info-value">${formatNum(batch.totalQty)}kg</div></div>
        </div>
        ${(batch.consumedLots||[]).length>0?`
        <div class="font-bold mb-8">소비 LOT 내역</div>
        <div class="table-wrapper">
          <table><thead><tr><th>LOT번호</th><th>사일로</th><th>소비량</th></tr></thead>
          <tbody>${batch.consumedLots.map(l=>`<tr><td>${l.lotNo}</td><td>${l.siloId||'-'}</td><td>${formatNum(l.qty)}kg</td></tr>`).join('')}</tbody></table>
        </div>`:'<div class="text-muted text-sm">소비 LOT 정보 없음</div>'}
        <div class="modal-footer"><button class="btn btn-ghost" onclick="BatchPage.closeModal('batch-detail-modal')">닫기</button></div>
      </div>
    `;
    document.getElementById('batch-detail-modal').classList.add('open');
  };

  const closeModal = (id) => document.getElementById(id)?.classList.remove('open');

  return { render, afterRender: () => {}, setTab, openBatchModal, submitBatch, openProductModal, submitProduct, showDetail, closeModal };
})();
