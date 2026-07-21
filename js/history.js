// ============================================================
// history.js — 이력 추적 + QR 스캔 조회 페이지
// ============================================================

const HistoryPage = (() => {
  let scanActive = false;

  const refTypeIcon = {
    RECEIVING: '', WEIGHING: '', QC: '',
    INVENTORY: '', OUTBOUND: '', ADJUST: '',
    SILO: '', SILO_CONSUME: '', LOSS: '',
    PRODUCTION: '', BATCH: '', PRODUCT: '',
    MATERIAL: '', SUPPLIER: '', VOC: '', EXCEPTION: '⚠'
  };
  const refTypeColor = {
    RECEIVING: 'var(--accent)', WEIGHING: 'var(--warning)', QC: 'var(--info)',
    INVENTORY: 'var(--success)', OUTBOUND: 'var(--purple)', ADJUST: 'var(--text-muted)',
    SILO: 'var(--info)', SILO_CONSUME: 'var(--warning)', LOSS: 'var(--danger)',
    PRODUCTION: 'var(--success)', BATCH: 'var(--accent)', PRODUCT: 'var(--purple)',
    MATERIAL: 'var(--success)', SUPPLIER: 'var(--info)', VOC: 'var(--danger)', EXCEPTION: 'var(--warning)'
  };


  const render = () => {
    return `
      <div class="fade-in">
        <!-- QR 스캔 조회 -->
        <div class="card mb-20">
          <div class="card-header">
            <div class="card-title"><span class="icon"></span> QR 코드로 이력 조회</div>
            <button class="btn btn-${scanActive ? 'danger' : 'primary'} btn-sm"
              id="scan-toggle-btn"
              onclick="HistoryPage.toggleScan()">
              ${scanActive ? '스캔 중지' : '스캔 시작'}
            </button>
          </div>
          <div id="qr-scan-area" class="qr-scan-area ${scanActive ? 'scanning' : ''}">
            <div id="qr-reader"></div>
            ${!scanActive ? `
              <span class="scan-icon"></span>
              <div class="font-bold mb-8">QR코드 스캔</div>
              <div class="text-sm text-muted mb-16">카메라를 QR코드에 가까이 대세요</div>
            ` : ''}
          </div>
          <div class="scan-fallback-panel">
            <label class="btn btn-outline-primary btn-sm">
              사진으로 QR 읽기
              <input type="file" accept="image/*" capture="environment" class="hidden"
                onchange="HistoryPage.handleImageFile(this.files[0]); this.value=''">
            </label>
            <span>카카오톡/HTTP 환경에서 카메라가 막히면 QR 라벨을 사진으로 찍어 읽습니다.</span>
          </div>
          <!-- 수동 입력 -->
          <div class="flex gap-8 mt-12">
            <input type="text" class="form-input" id="manual-id" placeholder="입고 QR, 원료 QR, 제품 QR 또는 코드 입력..." style="flex:1">
            <button class="btn btn-ghost" onclick="HistoryPage.searchById(document.getElementById('manual-id').value)">조회</button>
          </div>
        </div>

        <!-- 검색 결과 -->
        <div id="history-result"></div>

        <!-- 전체 이력 -->
        <div class="card">
          <div class="card-header">
            <div class="card-title"><span class="icon"></span> 전체 이력</div>
            <div class="text-sm text-muted">총 ${DB.getHistory().length}건</div>
          </div>
          ${renderAllHistory()}
        </div>
      </div>
    `;
  };

  const toggleScan = () => {
    if (scanActive) {
      QRUtil.stopScan();
      scanActive = false;
    } else {
      scanActive = true;
      App.refreshPage();
      setTimeout(() => {
        QRUtil.startScan('qr-reader',
          (code) => {
            QRUtil.stopScan();
            scanActive = false;
            searchById(code);
            // 버튼 업데이트
            const btn = document.getElementById('scan-toggle-btn');
            if (btn) btn.textContent = '스캔 시작';
          },
          (err) => {
            const msg = typeof err === 'string' ? err : (err?.message || err);
            App.toast('카메라 접근 오류: ' + msg, 'error', 7000);
            scanActive = false;
            App.refreshPage();
          }
        );
      }, 200);
      return;
    }
    App.refreshPage();
  };

  const handleImageFile = async (file) => {
    if (!file) return;
    try {
      App.toast('QR 사진 분석 중...', 'info', 1200);
      const code = await QRUtil.scanImageFile(file);
      searchById(code);
    } catch (err) {
      const msg = typeof err === 'string' ? err : (err?.message || err);
      App.toast('사진 QR 인식 실패: ' + msg, 'error', 6000);
    }
  };

  const searchById = (id) => {
    if (!id || !id.trim()) { App.toast('조회할 코드를 입력해주세요', 'warning'); return; }
    const qid = id.trim();

    const resultEl = document.getElementById('history-result');
    if (!resultEl) return;

    const resolved = DB.recordQRScan(qid, 'QR 조회', '현장');
    if (resolved.type === 'MATERIAL' && resolved.item) {
      renderMaterialResult(resultEl, resolved.item);
      return;
    }
    if (resolved.type === 'PRODUCT' && resolved.item) {
      renderProductResult(resultEl, resolved.item);
      return;
    }
    if (resolved.type === 'PRODUCT_LOT' && resolved.item) {
      renderProductLotResult(resultEl, resolved.item);
      return;
    }
    if (resolved.type === 'SUPPLIER' && resolved.item) {
      renderSupplierResult(resultEl, resolved.item);
      return;
    }
    if (resolved.type === 'SILO' && resolved.item) {
      App.navigate('silo');
      setTimeout(() => SiloPage.showDetail(resolved.item.id), 200);
      return;
    }

    // 입고 문서 찾기
    const receiving = resolved.type === 'RECEIVING' ? resolved.item : DB.getReceivingById(qid);

    if (!receiving) {
      resultEl.innerHTML = `
        <div class="card mb-20" style="border-color:var(--danger)">
          <div class="text-danger font-bold">⚠ 해당 QR코드를 찾을 수 없습니다</div>
          <div class="text-sm text-muted mt-4">코드: ${qid}</div>
        </div>`;
      return;
    }

    const receivingId = receiving.id;
    const weighing    = DB.getWeighingByReceivingId(receivingId);
    const inspections = DB.getInspectionsByReceivingId(receivingId);
    const history     = DB.getHistoryByRefId(receivingId);
    const inv         = DB.getInventoryByCode(receiving.materialCode);
    const gates       = DB.getQCConfig();

    resultEl.innerHTML = `
      <div class="qr-info-card mb-20 fade-in">
        <div class="qr-info-header">
          <h1>${receiving.materialName}</h1>
          <p>원료코드: ${receiving.materialCode}</p>
        </div>
        <div class="qr-info-sections">

          <!-- 입고 정보 -->
          <div class="qr-info-section">
            <h3>입고 정보</h3>
            <div class="qr-info-row"><span class="label">입고번호</span><span class="value font-mono text-xs">${receiving.id.slice(0,20)}...</span></div>
            <div class="qr-info-row"><span class="label">사전입고번호</span><span class="value font-mono">${receiving.preRegId || '-'}</span></div>
            <div class="qr-info-row"><span class="label">협력사</span><span class="value">${receiving.supplierName || receiving.supplier || '-'}</span></div>
            <div class="qr-info-row"><span class="label">입고공장</span><span class="value">${DB.getFactoryName(receiving.factory)} (${DB.getFactoryLotCode?.(receiving.factory) || receiving.factoryLotCode || '-'})</span></div>
            <div class="qr-info-row"><span class="label">납품예정일</span><span class="value">${receiving.receivedDate}</span></div>
            <div class="qr-info-row"><span class="label">차량번호</span><span class="value">${receiving.vehicleNo || '-'}</span></div>
            <div class="qr-info-row"><span class="label">LOT</span><span class="value font-mono">${receiving.lotNo || '-'}</span></div>
            <div class="qr-info-row"><span class="label">예상중량</span><span class="value">${receiving.expectedWeight?.toLocaleString()} kg</span></div>
            <div class="qr-info-row"><span class="label">현재상태</span><span class="value">${getStatusBadge(receiving.status)}</span></div>
          </div>

          <!-- 계근 정보 -->
          <div class="qr-info-section">
            <h3>계근 결과</h3>
            ${weighing ? `
              <div class="qr-info-row"><span class="label">실측 중량</span><span class="value">${weighing.actualWeight?.toLocaleString()} kg</span></div>
              <div class="qr-info-row"><span class="label">편차</span>
                <span class="value" style="color:${weighing.weightStatus==='NORMAL'?'var(--success)':weighing.weightStatus==='WARNING'?'var(--warning)':'var(--danger)'}">
                  ${weighing.diffPct >= 0 ? '+' : ''}${weighing.diffPct}% (${weighing.weightStatus === 'NORMAL' ? '정상' : weighing.weightStatus === 'WARNING' ? '주의' : '이상'})
                </span>
              </div>
              <div class="qr-info-row"><span class="label">차량번호</span><span class="value">${weighing.vehicleNo || '-'}</span></div>
              <div class="qr-info-row"><span class="label">계근자</span><span class="value">${weighing.weighedBy}</span></div>
            ` : '<div class="text-muted text-sm">계근 미완료</div>'}
          </div>

          <!-- 품질 검사 -->
          <div class="qr-info-section">
            <h3>품질 검사 현황</h3>
            ${gates.map(g => {
              const insp = inspections.find(i => i.gateId === g.id);
              return `<div class="qr-info-row">
                <span class="label">${g.name}</span>
                <span class="value">
                  ${!insp ? '<span class="badge badge-default">대기</span>' :
                    insp.verdict === 'PASS' ? '<span class="badge badge-pass">합격</span>' :
                    insp.verdict === 'FAIL' ? '<span class="badge badge-fail">불합격</span>' :
                    '<span class="badge badge-warning">⚠ 조건부</span>'}
                </span>
              </div>`;
            }).join('')}
          </div>

          <!-- 재고 위치 -->
          ${inv ? `
          <div class="qr-info-section">
            <h3>현재 재고 위치</h3>
            <div class="qr-info-row"><span class="label">창고</span><span class="value">${inv.warehouse || '-'}</span></div>
            <div class="qr-info-row"><span class="label">위치(Bin)</span><span class="value font-bold">${inv.binLocation}</span></div>
            <div class="qr-info-row"><span class="label">현재 수량</span><span class="value">${inv.qty?.toLocaleString()} EA</span></div>
          </div>` : ''}
        </div>

        <!-- 액션 버튼 -->
        <div class="qr-info-actions">
          ${receiving.status === 'QR_ISSUED' ? `<button class="btn btn-info btn-block" onclick="HistoryPage.processInbound('${receiving.id}','ARRIVE')">납품 도착 확인</button>` : ''}
          ${['QR_ISSUED','ARRIVED','PENDING_SCALE'].includes(receiving.status) ? `<button class="btn btn-warning btn-block" onclick="HistoryPage.openWeigh('${receiving.id}')">계근 처리</button>` : ''}
          ${receiving.status === 'PENDING_QC' ? `<button class="btn btn-primary btn-block" onclick="App.navigate('quality','${receiving.id}')">품질 검사</button>` : ''}
          ${receiving.status === 'APPROVED' ? `<button class="btn btn-success btn-block" onclick="ReceivingPage.registerStock('${receiving.id}')">재고 등록</button>` : ''}
          ${['QR_ISSUED','ARRIVED','PENDING_SCALE','PENDING_QC','PENDING_APPROVAL','HOLD'].includes(receiving.status) ? `<button class="btn btn-ghost btn-block" onclick="HistoryPage.processInbound('${receiving.id}','HOLD')">보류</button>` : ''}
          ${['QR_ISSUED','ARRIVED','PENDING_SCALE','PENDING_QC','PENDING_APPROVAL','HOLD'].includes(receiving.status) ? `<button class="btn btn-danger btn-block" onclick="HistoryPage.processInbound('${receiving.id}','REJECT')">반려</button>` : ''}
          ${receiving.status === 'IN_STOCK' ? `<div class="info-box info-green" style="width:100%">이미 입고 완료된 QR입니다. 중복 입고 처리는 차단됩니다.</div><button class="btn btn-outline-primary btn-block" onclick="App.navigate('outbound','${receiving.materialCode}')">출고 처리</button>` : ''}
          ${receiving.status === 'REJECTED' ? `<div class="info-box info-warning" style="width:100%">반려 처리된 QR입니다. 같은 라벨로 입고할 수 없습니다.</div>` : ''}
        </div>

        <!-- 전체 이력 타임라인 -->
        <div style="padding:0 20px 20px">
          <div class="font-bold text-sm mb-12">처리 이력</div>
          <div class="timeline">
            ${history.map(h => `
              <div class="timeline-item">
                <div class="timeline-action" style="color:${refTypeColor[h.refType] || 'var(--text-primary)'}">
                  ${refTypeIcon[h.refType] || '•'} ${h.action}
                </div>
                <div class="timeline-detail">${h.detail || ''}</div>
                <div class="timeline-meta">${formatTime(h.timestamp)} · ${h.actor}</div>
              </div>`).join('')}
          </div>
        </div>
      </div>
    `;
  };

  const renderMaterialResult = (resultEl, material) => {
    const receivings = DB.getReceivings().filter(r => r.materialCode === material.code).slice(-8).reverse();
    const cycle = DB.getInventoryCycleRows('ALL').find(r => r.materialCode === material.code);
    const silos = DB.getSilos().filter(s => s.materialCode === material.code);
    resultEl.innerHTML = `
      <div class="qr-info-card mb-20 fade-in">
        <div class="qr-info-header">
          <h1>${material.name}</h1>
          <p>원료코드: ${material.code} · QR: ${material.qrCode}</p>
        </div>
        <div class="qr-master-grid">
          <div class="qr-master-preview"><div id="master-qr-preview"></div></div>
          <div class="qr-info-section">
            <h3>원료 마스터</h3>
            <div class="qr-info-row"><span class="label">분류</span><span class="value">${material.category || '-'}</span></div>
            <div class="qr-info-row"><span class="label">단위</span><span class="value">${material.unit || 'kg'}</span></div>
            <div class="qr-info-row"><span class="label">연결 사일로</span><span class="value">${silos.length}개</span></div>
            <div class="qr-info-row"><span class="label">현재고</span><span class="value">${cycle ? formatNum(cycle.stockKg) + ' kg' : '-'}</span></div>
            <div class="qr-info-row"><span class="label">가용일수</span><span class="value">${cycle?.coverDays != null ? cycle.coverDays.toFixed(1) + '일' : '사용 이력 부족'}</span></div>
          </div>
        </div>
        <div style="padding:0 20px 20px">
          <div class="font-bold text-sm mb-8">최근 입고 연결</div>
          <div class="table-wrapper">
            <table>
              <thead><tr><th>입고번호</th><th>협력사</th><th>LOT</th><th class="td-right">중량</th><th>상태</th></tr></thead>
              <tbody>
                ${receivings.length === 0 ? `<tr><td colspan="5" class="text-muted" style="text-align:center;padding:24px">입고 이력 없음</td></tr>` :
                receivings.map(r => `<tr>
                  <td><span class="td-mono text-xs">${r.preRegId || r.id}</span></td>
                  <td>${r.supplierName || r.supplier || '-'}</td>
                  <td>${r.lotNo || '-'}</td>
                  <td class="td-right">${formatNum(r.actualWeight || r.expectedWeight)}kg</td>
                  <td>${getStatusBadge(r.status)}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
    setTimeout(() => QRUtil.generate('master-qr-preview', material.qrCode, { size: 160 }), 80);
  };

  const renderProductResult = (resultEl, product) => {
    const lots = DB.getProductLots().filter(p => p.productCode === product.code || p.productName === product.name).slice(-8).reverse();
    resultEl.innerHTML = `
      <div class="qr-info-card mb-20 fade-in">
        <div class="qr-info-header">
          <h1>${product.name}</h1>
          <p>제품코드: ${product.code} · 배합비: ${product.formulaCode || '-'} · QR: ${product.qrCode}</p>
        </div>
        <div class="qr-master-grid">
          <div class="qr-master-preview"><div id="master-qr-preview"></div></div>
          <div class="qr-info-section">
            <h3>제품 마스터</h3>
            <div class="qr-info-row"><span class="label">제품코드</span><span class="value font-mono">${product.code}</span></div>
            <div class="qr-info-row"><span class="label">배합비 코드</span><span class="value">${product.formulaCode || '-'}</span></div>
            <div class="qr-info-row"><span class="label">연결 제품 LOT</span><span class="value">${lots.length}건</span></div>
          </div>
        </div>
        <div class="qr-info-actions">
          <button class="btn btn-primary btn-block" onclick="App.navigate('voc');setTimeout(()=>VOCPage.prefillProductCode('${product.code}','${product.name.replace(/'/g, "\\'")}'),200)">이 제품으로 VOC 등록</button>
        </div>
        <div style="padding:0 20px 20px">
          <div class="font-bold text-sm mb-8">제품 LOT 연결</div>
          <div class="table-wrapper">
            <table>
              <thead><tr><th>제품LOT</th><th>공장</th><th class="td-right">수량</th><th>생산일</th><th>VOC</th></tr></thead>
              <tbody>
                ${lots.length === 0 ? `<tr><td colspan="5" class="text-muted" style="text-align:center;padding:24px">제품 LOT 연결 이력 없음</td></tr>` :
                lots.map(p => `<tr>
                  <td><span class="td-mono text-xs">${p.fgLotNo}</span></td>
                  <td>${DB.getFactoryName(p.factory)}</td>
                  <td class="td-right">${formatNum(p.qty)}kg</td>
                  <td>${p.productionDate || '-'}</td>
                  <td><button class="btn btn-ghost btn-xs" onclick="App.navigate('voc');setTimeout(()=>VOCPage.prefill('${p.fgLotNo}','${p.productName}','${p.productCode || product.code}'),200)">VOC</button></td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
    setTimeout(() => QRUtil.generate('master-qr-preview', product.qrCode, { size: 160 }), 80);
  };

  const renderProductLotResult = (resultEl, lot) => {
    const product = lot.productCode ? DB.getProductByCode(lot.productCode) : null;
    const trace = DB.traceVOC(lot.fgLotNo, lot.productCode);
    resultEl.innerHTML = `
      <div class="qr-info-card mb-20 fade-in">
        <div class="qr-info-header">
          <h1>${lot.productName}</h1>
          <p>제품LOT: ${lot.fgLotNo} · 제품코드: ${lot.productCode || '-'}</p>
        </div>
        <div class="qr-master-grid">
          <div class="qr-master-preview"><div id="master-qr-preview"></div></div>
          <div class="qr-info-section">
            <h3>제품 LOT QR</h3>
            <div class="qr-info-row"><span class="label">제품 마스터</span><span class="value">${product?.name || '-'}</span></div>
            <div class="qr-info-row"><span class="label">공장</span><span class="value">${DB.getFactoryName(lot.factory)}</span></div>
            <div class="qr-info-row"><span class="label">수량</span><span class="value">${formatNum(lot.qty)}kg</span></div>
            <div class="qr-info-row"><span class="label">생산일</span><span class="value">${lot.productionDate || '-'}</span></div>
            <div class="qr-info-row"><span class="label">배합 연결</span><span class="value">${trace?.batch?.batchCode || '-'}</span></div>
          </div>
        </div>
        <div class="qr-info-actions">
          <button class="btn btn-primary btn-block" onclick="App.navigate('voc');setTimeout(()=>VOCPage.prefill('${lot.fgLotNo}','${lot.productName}','${lot.productCode || ''}'),200)">이 LOT로 VOC 등록</button>
        </div>
      </div>`;
    setTimeout(() => QRUtil.generate('master-qr-preview', lot.qrCode || DB.makeQRValue('PRODUCT_LOT', lot.fgLotNo), { size: 160 }), 80);
  };

  const renderSupplierResult = (resultEl, supplier) => {
    const receivings = DB.getReceivings()
      .filter(r => r.supplierId === supplier.id || r.supplierName === supplier.name || r.supplier === supplier.name)
      .slice(-10)
      .reverse();
    const totalWeight = receivings.reduce((s, r) => s + (r.actualWeight || r.expectedWeight || 0), 0);
    const qrValue = supplier.qrCode || DB.makeQRValue('SUPPLIER', supplier.code);
    const docs = Array.isArray(supplier.documents) ? supplier.documents : [];
    const requiredDocs = [
      { type:'BUSINESS_LICENSE', label:'사업자등록증' },
      { type:'RAW_MATERIAL_COA', label:'분석성적서' }
    ];
    const missingDocs = requiredDocs.filter(req => !docs.some(d => d.type === req.type)).map(d => d.label);
    resultEl.innerHTML = `
      <div class="qr-info-card mb-20 fade-in">
        <div class="qr-info-header">
          <h1>${supplier.name}</h1>
          <p>협력사코드: ${supplier.code} · QR: ${qrValue}</p>
        </div>
        <div class="qr-master-grid">
          <div class="qr-master-preview"><div id="master-qr-preview"></div></div>
          <div class="qr-info-section">
            <h3>협력사 마스터</h3>
            <div class="qr-info-row"><span class="label">거래품목</span><span class="value">${supplier.mainItem || '-'}</span></div>
            <div class="qr-info-row"><span class="label">구분/업종</span><span class="value">${supplier.domesticImport || '-'} / ${supplier.industry || '-'}</span></div>
            <div class="qr-info-row"><span class="label">HACCP 등급</span><span class="value">${supplier.haccpGrade || '-'} (${supplier.haccpScore ?? '-'})</span></div>
            <div class="qr-info-row"><span class="label">납품 이력</span><span class="value">${receivings.length}건 / ${formatNum(totalWeight)}kg</span></div>
            <div class="qr-info-row"><span class="label">등록서류</span><span class="value">${docs.length}건${missingDocs.length ? ` / 미첨부 ${missingDocs.length}` : ' / 필수 확인'}</span></div>
            <div class="qr-info-row"><span class="label">상태</span><span class="value">${supplier.status || 'ACTIVE'}</span></div>
          </div>
        </div>
        <div class="qr-info-actions">
          <button class="btn btn-primary btn-block" onclick="SupplierInboundPage.prefillSupplier('${supplier.id}');App.navigate('supplierInbound');setTimeout(()=>SupplierInboundPage.openAddModal(),200)">이 협력사로 입고예정 등록</button>
        </div>
        <div style="padding:0 20px 20px">
          <div class="font-bold text-sm mb-8">등록서류</div>
          ${docs.length === 0 ? `<div class="info-box info-warning">등록된 서류가 없습니다${missingDocs.length ? ` · 미첨부: ${missingDocs.join(', ')}` : ''}</div>` : `
          <div class="supplier-doc-list" style="margin-top:0">
            ${docs.map(doc => `
              <div class="supplier-doc-item">
                <div class="supplier-doc-icon"></div>
                <div style="flex:1;min-width:0">
                  <div class="font-bold text-sm">${doc.label || doc.type || '등록서류'}</div>
                  <div class="text-xs text-muted">${doc.name || '-'} · ${doc.uploadedAt ? formatDateShort(doc.uploadedAt) : '-'}</div>
                </div>
                <button class="btn btn-ghost btn-xs" onclick="SupplierPage.openStoredDocument('${supplier.id}','${doc.id}')">보기</button>
              </div>
            `).join('')}
          </div>
          ${missingDocs.length ? `<div class="info-box info-warning mt-12">미첨부 필수서류: ${missingDocs.join(', ')}</div>` : ''}`}
        </div>
        <div style="padding:0 20px 20px">
          <div class="font-bold text-sm mb-8">최근 납품 이력</div>
          <div class="table-wrapper">
            <table>
              <thead><tr><th>입고번호</th><th>원료</th><th>LOT</th><th class="td-right">중량</th><th>상태</th></tr></thead>
              <tbody>
                ${receivings.length === 0 ? `<tr><td colspan="5" class="text-muted" style="text-align:center;padding:24px">아직 이 협력사의 입고 이력이 없습니다</td></tr>` :
                receivings.map(r => `<tr>
                  <td><span class="td-mono text-xs">${r.preRegId || r.id}</span></td>
                  <td>${r.materialName}</td>
                  <td>${r.lotNo || '-'}</td>
                  <td class="td-right">${formatNum(r.actualWeight || r.expectedWeight)}kg</td>
                  <td>${getStatusBadge(r.status)}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
    setTimeout(() => QRUtil.generate('master-qr-preview', qrValue, { size: 160 }), 80);
  };

  const renderAllHistory = () => {
    const history = DB.getHistory().slice().reverse().slice(0, 50);
    if (history.length === 0) return `<div class="empty-state"><div class="empty-icon"></div><h3>이력이 없습니다</h3></div>`;

    return `
      <div class="timeline mt-12">
        ${history.map(h => `
          <div class="timeline-item">
            <div class="timeline-action" style="color:${refTypeColor[h.refType] || 'var(--text-primary)'}">
              ${refTypeIcon[h.refType] || '•'} ${h.action}
            </div>
            <div class="timeline-detail">${h.detail || ''}</div>
            <div class="timeline-meta">${formatTime(h.timestamp)} · ${h.actor}</div>
          </div>`).join('')}
      </div>
    `;
  };

  const getStatusBadge = (status) => {
    const map = {
      QR_ISSUED:        '<span class="badge badge-info">QR발행</span>',
      ARRIVED:          '<span class="badge badge-warning">도착확인</span>',
      PENDING_SCALE:    '<span class="badge badge-warning">계근대기</span>',
      PENDING_QC:       '<span class="badge badge-info">검사대기</span>',
      PENDING_APPROVAL: '<span class="badge badge-alert">승인대기</span>',
      APPROVED:         '<span class="badge badge-pass">합격</span>',
      IN_STOCK:         '<span class="badge badge-pass">재고등록</span>',
      HOLD:             '<span class="badge badge-hold">보류</span>',
      CANCELLED:        '<span class="badge badge-default">취소</span>',
      REJECTED:         '<span class="badge badge-fail">불합격</span>'
    };
    return map[status] || status;
  };

  const processInbound = (receivingId, action) => {
    let reason = '';
    if (action === 'HOLD') {
      reason = prompt('보류 사유를 입력하세요', '서류 또는 실물 확인 필요');
      if (reason === null) return;
    }
    if (action === 'REJECT') {
      reason = prompt('반려 사유를 입력하세요', 'QR/실물 정보 불일치');
      if (reason === null) return;
    }
    try {
      DB.processSupplierInbound(receivingId, action, { reason, actor: '현장' });
      App.toast(action === 'ARRIVE' ? '납품 도착 확인 완료' : action === 'HOLD' ? '입고 보류 처리 완료' : '입고 반려 처리 완료', action === 'ARRIVE' ? 'success' : 'warning');
      const r = DB.getReceivingById(receivingId);
      if (r) searchById(r.qrCode || r.id);
    } catch (e) {
      App.toast('처리 실패: ' + e.message, 'error');
    }
  };

  const openWeigh = (receivingId) => {
    try {
      const r = DB.getReceivingById(receivingId);
      if (r?.status === 'QR_ISSUED') DB.processSupplierInbound(receivingId, 'ARRIVE', { actor: '현장' });
      App.navigate('receiving');
      setTimeout(() => ReceivingPage.openWeighModal(receivingId), 250);
    } catch (e) {
      App.toast('계근 전환 실패: ' + e.message, 'error');
    }
  };

  const formatTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }) + ' ' +
           d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  };

  const afterRender = (initialCode = '') => {
    if (initialCode) setTimeout(() => searchById(initialCode), 80);
  };

  return { render, afterRender, toggleScan, handleImageFile, searchById, processInbound, openWeigh };
})();


// ============================================================
// scan.js — 독립 QR 스캔 페이지 (계근 연동)
// ============================================================

const ScanPage = (() => {
  let scanActive = false;

  const render = (initialCode = '') => {
    const cameraBlockReason = QRUtil.getCameraBlockReason?.() || '';
    return `
    <div class="fade-in" style="max-width:480px;margin:0 auto">
      <div class="card mb-20">
        <div class="card-header">
          <div class="card-title"><span class="icon"></span> QR 스캔</div>
          <button class="btn btn-${scanActive ? 'danger' : cameraBlockReason ? 'ghost' : 'primary'}" id="scan-page-btn" onclick="ScanPage.toggleScan()">
            ${scanActive ? '중지' : '스캔 시작'}
          </button>
        </div>
        ${initialCode ? `
        <div class="scan-notice scan-notice-info">
          <strong>QR 링크 처리 중</strong>
          <span class="font-mono">${initialCode}</span>
        </div>` : ''}
        <div class="qr-scan-area ${scanActive ? 'scanning' : ''}">
          <div id="scan-page-reader"></div>
          ${!scanActive ? `
            <span class="scan-icon"></span>
            <div class="font-bold mb-4">카메라로 QR 스캔</div>
            <div class="text-sm text-muted">입고 라벨의 QR코드를 스캔하세요</div>
          ` : ''}
        </div>
        ${cameraBlockReason ? `
        <div class="scan-notice scan-notice-warning">
          <strong>실시간 카메라가 막혀 있습니다</strong>
          <span>${cameraBlockReason}</span>
        </div>` : ''}
        <div class="scan-fallback-panel">
          <label class="btn btn-outline-primary btn-sm">
            사진으로 QR 읽기
            <input type="file" accept="image/*" capture="environment" class="hidden"
              onchange="ScanPage.handleImageFile(this.files[0]); this.value=''">
          </label>
          <span>카카오톡/HTTP 환경에서 카메라가 막히면 QR 라벨을 사진으로 찍어 읽습니다.</span>
        </div>
        <div class="flex gap-8 mt-12">
          <input type="text" class="form-input" id="scan-manual" placeholder="QR ID 직접 입력..." style="flex:1">
          <button class="btn btn-ghost" onclick="ScanPage.handleResult(document.getElementById('scan-manual').value)">조회</button>
        </div>
      </div>
      <div id="scan-result-area"></div>
    </div>
  `};

  const toggleScan = () => {
    if (scanActive) {
      QRUtil.stopScan();
      scanActive = false;
      App.refreshPage();
    } else {
      const blockReason = QRUtil.getCameraBlockReason?.() || '';
      if (blockReason) {
        App.toast(blockReason, 'warning', 8000);
        return;
      }
      scanActive = true;
      App.refreshPage();
      setTimeout(() => {
        QRUtil.startScan('scan-page-reader',
          (code) => {
            QRUtil.stopScan();
            scanActive = false;
            handleResult(code);
          },
          (err) => {
            const msg = typeof err === 'string' ? err : (err?.message || err);
            App.toast('카메라 오류: ' + msg, 'error', 7000);
            scanActive = false;
            App.refreshPage();
          }
        );
      }, 200);
    }
  };

  const handleImageFile = async (file) => {
    if (!file) return;
    try {
      App.toast('QR 사진 분석 중...', 'info', 1200);
      const code = await QRUtil.scanImageFile(file);
      scanActive = false;
      handleResult(code);
    } catch (err) {
      const msg = typeof err === 'string' ? err : (err?.message || err);
      App.toast('사진 QR 인식 실패: ' + msg, 'error', 6000);
    }
  };

  const renderMissingReceiving = (el, code, resolved) => {
    el.innerHTML = `
      <div class="card fade-in" style="border-color:var(--warning)">
        <div class="badge badge-warning mb-8">QR은 읽었지만 입고 데이터를 찾지 못했습니다</div>
        <div class="font-bold">휴대폰에 해당 입고 데이터가 없습니다</div>
        <div class="text-sm text-muted mt-8">
          현재 파일럿은 브라우저 localStorage 기반이라 PC에서 등록한 입고 데이터가 휴대폰에 자동 공유되지 않습니다.
        </div>
        <div class="text-xs font-mono mt-12" style="word-break:break-all">${resolved?.raw || code}</div>
        <div class="scan-fallback-panel mt-12">
          <span>이 QR을 휴대폰에서 바로 처리하려면 서버 API/중앙 DB 연결이 필요합니다. 지금은 같은 기기에서 등록한 데이터 또는 기본 샘플 데이터만 처리됩니다.</span>
        </div>
        <button class="btn btn-ghost btn-block mt-16" onclick="App.navigate('history');setTimeout(()=>HistoryPage.searchById('${String(code).replace(/'/g, "\\'")}'),200)">
          전체 이력 조회로 보기
        </button>
      </div>`;
  };

  const handleResult = (id) => {
    if (!id || !id.trim()) return;
    const code = id.trim();
    let resolved = DB.resolveQRCode(code);
    let receiving = resolved.type === 'RECEIVING' ? resolved.item : null;
    const el = document.getElementById('scan-result-area');
    if (!el) { HistoryPage.searchById(id.trim()); return; }

    if (!receiving && resolved.type === 'RECEIVING' && resolved.missing) {
      const imported = DB.importReceivingFromQRLink?.(code);
      if (imported) {
        resolved = DB.resolveQRCode(imported.qrCode || imported.id);
        receiving = resolved.type === 'RECEIVING' ? resolved.item : null;
      }
    }

    if (!receiving) {
      if (resolved.type === 'RECEIVING' && resolved.missing) {
        renderMissingReceiving(el, code, resolved);
        return;
      }
      App.navigate('history');
      setTimeout(() => HistoryPage.searchById(code), 200);
      return;
    }

    DB.recordQRScan(code, '입고단계 QR 스캔', '현장');

    // 협력사 입고 QR 또는 계근 대기 중이면 현장 처리 화면으로 바로 유도
    if (['QR_ISSUED', 'ARRIVED', 'PENDING_SCALE'].includes(receiving.status)) {
      el.innerHTML = `
        <div class="card fade-in" style="border-color:var(--warning)">
          <div class="badge badge-warning mb-8">${receiving.status === 'QR_ISSUED' ? 'QR 발행' : receiving.status === 'ARRIVED' ? '도착 확인' : '계근 대기'}</div>
          <div class="font-bold">${receiving.materialName}</div>
          <div class="text-sm font-mono text-muted">${receiving.materialCode}</div>
          <div class="text-sm mt-8">협력사: <strong>${receiving.supplierName || receiving.supplier || '-'}</strong></div>
          <div class="text-sm mt-4">입고예정번호: <span class="font-mono">${receiving.preRegId || receiving.id}</span></div>
          <div class="text-sm mt-4">예상중량: <strong>${receiving.expectedWeight?.toLocaleString()} kg</strong> · LOT: ${receiving.lotNo || '-'}</div>
          ${receiving.status === 'QR_ISSUED' ? `
          <button class="btn btn-info btn-block mt-16" onclick="ScanPage.markArrived('${receiving.id}')">
            납품 도착 확인
          </button>` : ''}
          <button class="btn btn-warning btn-block mt-16"
            onclick="ScanPage.openWeigh('${receiving.id}')">
            계근 처리하기
          </button>
          <button class="btn btn-ghost btn-block mt-8" onclick="App.navigate('history');setTimeout(()=>HistoryPage.searchById('${receiving.qrCode || receiving.id}'),200)">
            전체 이력 보기
          </button>
        </div>`;
      return;
    }

    // 그 외엔 이력 조회로
    App.navigate('history');
    setTimeout(() => HistoryPage.searchById(id.trim()), 200);
  };

  const markArrived = (receivingId) => {
    try {
      DB.processSupplierInbound(receivingId, 'ARRIVE', { actor: '현장' });
      App.toast('납품 도착 확인 완료', 'success');
      const r = DB.getReceivingById(receivingId);
      handleResult(r?.qrCode || receivingId);
    } catch (e) {
      App.toast('도착 처리 실패: ' + e.message, 'error');
    }
  };

  const openWeigh = (receivingId) => {
    try {
      const r = DB.getReceivingById(receivingId);
      if (r?.status === 'QR_ISSUED') DB.processSupplierInbound(receivingId, 'ARRIVE', { actor: '현장' });
      App.navigate('receiving');
      setTimeout(() => ReceivingPage.openWeighModal(receivingId), 250);
    } catch (e) {
      App.toast('계근 전환 실패: ' + e.message, 'error');
    }
  };

  const afterRender = (initialCode = '', sourceUrl = '') => {
    if (initialCode) setTimeout(() => handleResult(sourceUrl || initialCode), 80);
  };

  return { render, afterRender, toggleScan, handleImageFile, handleResult, markArrived, openWeigh };
})();
