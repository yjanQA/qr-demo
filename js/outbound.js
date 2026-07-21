// ============================================================
// outbound.js — 출고 관리 페이지
// ============================================================

const OutboundPage = (() => {
  let preselectedCode = '';
  let preselectedBin  = '';

  const render = (materialCode, binLocation) => {
    preselectedCode = materialCode || '';
    preselectedBin  = binLocation  || '';
    const list = DB.getOutbounds().slice().reverse();
    const today = new Date().toISOString().split('T')[0];
    const todayOut = list.filter(o => o.outboundDate === today);

    return `
      <div class="fade-in">
        <!-- 오늘 통계 -->
        <div class="kpi-grid mb-20" style="grid-template-columns:repeat(3,1fr)">
          <div class="kpi-card" style="--kpi-color:var(--purple)">
            <div class="kpi-label">오늘 출고</div>
            <div class="kpi-value">${todayOut.length}</div>
            <div class="kpi-sub">건</div>
            <div class="kpi-icon"></div>
          </div>
          <div class="kpi-card" style="--kpi-color:var(--accent)">
            <div class="kpi-label">오늘 출고량</div>
            <div class="kpi-value">${todayOut.reduce((s,o)=>s+o.qty,0).toLocaleString()}</div>
            <div class="kpi-sub">EA</div>
            <div class="kpi-icon"></div>
          </div>
          <div class="kpi-card" style="--kpi-color:var(--success)">
            <div class="kpi-label">총 출고 건수</div>
            <div class="kpi-value">${list.length}</div>
            <div class="kpi-sub">누적</div>
            <div class="kpi-icon"></div>
          </div>
        </div>

        <div class="flex items-center justify-between mb-20">
          <div class="text-sm text-muted">전체 출고 이력</div>
          <button class="btn btn-primary" onclick="OutboundPage.openOutboundModal()">출고 처리</button>
        </div>

        ${list.length === 0 ? `
          <div class="empty-state">
            <div class="empty-icon"></div>
            <h3>출고 이력이 없습니다</h3>
            <p>출고 처리 버튼을 눌러 시작하세요</p>
          </div>` : `
          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>출고번호</th>
                  <th>원료코드</th>
                  <th>원료명</th>
                  <th>출고처</th>
                  <th class="td-right">수량(EA)</th>
                  <th class="td-right">중량(kg)</th>
                  <th>출고일</th>
                  <th>위치</th>
                  <th>처리자</th>
                </tr>
              </thead>
              <tbody>
                ${list.map(o => `
                  <tr>
                    <td><span class="td-mono">${o.id.slice(0,14)}...</span></td>
                    <td><span class="td-mono">${o.materialCode}</span></td>
                    <td><strong>${o.materialName}</strong></td>
                    <td>${o.destination || '-'}</td>
                    <td class="td-right">${o.qty?.toLocaleString()}</td>
                    <td class="td-right">${o.weight?.toLocaleString()}</td>
                    <td>${o.outboundDate}</td>
                    <td><span class="badge badge-default">${o.binLocation}</span></td>
                    <td class="text-sm text-muted">${o.processedBy}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>`}
      </div>

      <!-- 출고 모달 -->
      <div class="modal-overlay" id="outbound-modal">
        <div class="modal">
          <div class="modal-header">
            <div class="modal-title">출고 처리</div>
            <button class="modal-close" onclick="OutboundPage.closeModal()">✕</button>
          </div>
          <div id="outbound-modal-body"></div>
        </div>
      </div>
    `;
  };

  const openOutboundModal = () => {
    const today = new Date().toISOString().split('T')[0];
    const invList = DB.getInventory();

    document.getElementById('outbound-modal-body').innerHTML = `
      <div class="form-group mb-16">
        <label class="form-label">재고 선택 <span class="required">*</span></label>
        <select class="form-select" id="out-inv" onchange="OutboundPage.onSelectInv(this.value)">
          <option value="">-- 선택하세요 --</option>
          ${invList.map(i => `
            <option value="${i.materialCode}|${i.binLocation}" ${(preselectedCode === i.materialCode && preselectedBin === i.binLocation) ? 'selected' : ''}>
              ${i.materialName} (${i.materialCode}) · ${i.binLocation} · 재고 ${i.qty?.toLocaleString()} EA
            </option>`).join('')}
        </select>
      </div>
      <div id="inv-info" class="hidden mb-16"></div>

      <div class="form-grid form-grid-2" style="gap:12px">
        <div class="form-group">
          <label class="form-label">출고 수량 <span class="required">*</span></label>
          <input type="number" class="form-input" id="out-qty" placeholder="0" min="1"
            oninput="OutboundPage.calcWeight(this.value)">
        </div>
        <div class="form-group">
          <label class="form-label">출고 중량 (kg)</label>
          <input type="number" class="form-input" id="out-weight" placeholder="자동계산" step="0.001">
        </div>
        <div class="form-group">
          <label class="form-label">출고처</label>
          <input type="text" class="form-input" id="out-dest" placeholder="공장명, 부서명 등">
        </div>
        <div class="form-group">
          <label class="form-label">출고 목적</label>
          <select class="form-select" id="out-purpose">
            <option>생산 투입</option>
            <option>반품</option>
            <option>폐기</option>
            <option>이동</option>
            <option>기타</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">출고일</label>
          <input type="date" class="form-input" id="out-date" value="${today}">
        </div>
        <div class="form-group">
          <label class="form-label">요청자</label>
          <input type="text" class="form-input" id="out-requester" placeholder="생산팀 홍길동">
        </div>
      </div>
      <div class="form-group mt-12">
        <label class="form-label">처리자</label>
        <input type="text" class="form-input" id="out-processor" placeholder="창고 담당자">
      </div>

      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="OutboundPage.closeModal()">취소</button>
        <button class="btn btn-primary" onclick="OutboundPage.submitOutbound()">출고 확정</button>
      </div>
    `;

    // 미리 선택된 재고가 있으면 정보 표시
    if (preselectedCode) {
      setTimeout(() => {
        const sel = document.getElementById('out-inv');
        if (sel) onSelectInv(sel.value);
      }, 100);
    }

    document.getElementById('outbound-modal').classList.add('open');
  };

  const onSelectInv = (val) => {
    const info = document.getElementById('inv-info');
    if (!val) { info.classList.add('hidden'); return; }
    const [code, bin] = val.split('|');
    const inv = DB.getInventory().find(i => i.materialCode === code && i.binLocation === bin);
    if (!inv) return;
    info.classList.remove('hidden');
    info.innerHTML = `
      <div class="card" style="background:var(--info-bg);border-color:var(--info)">
        <div class="flex justify-between text-sm">
          <span><strong>${inv.materialName}</strong></span>
          <span class="font-mono text-accent">${inv.materialCode}</span>
        </div>
        <div class="flex gap-16 mt-8 text-sm">
          <span>위치: <strong>${inv.binLocation}</strong></span>
          <span>재고: <strong>${inv.qty?.toLocaleString()} EA</strong></span>
          <span>중량: <strong>${inv.weight?.toLocaleString()} kg</strong></span>
        </div>
      </div>
    `;
    window._selectedInv = inv;
  };

  const calcWeight = (qty) => {
    if (!window._selectedInv) return;
    const inv = window._selectedInv;
    if (inv.qty > 0) {
      const unitWeight = inv.weight / inv.qty;
      const w = document.getElementById('out-weight');
      if (w) w.value = (unitWeight * qty).toFixed(3);
    }
  };

  const submitOutbound = () => {
    const sel = document.getElementById('out-inv')?.value;
    if (!sel) { App.toast('재고를 선택해주세요', 'error'); return; }
    const [code, bin] = sel.split('|');
    const qty = parseInt(document.getElementById('out-qty')?.value);
    if (!qty || qty <= 0) { App.toast('출고 수량을 입력해주세요', 'error'); return; }

    try {
      DB.addOutbound({
        materialCode: code,
        binLocation: bin,
        qty,
        weight: parseFloat(document.getElementById('out-weight')?.value) || qty,
        destination: document.getElementById('out-dest')?.value || '',
        purpose: document.getElementById('out-purpose')?.value || '',
        outboundDate: document.getElementById('out-date')?.value,
        requestedBy: document.getElementById('out-requester')?.value || '',
        processedBy:  document.getElementById('out-processor')?.value || '관리자'
      });
      preselectedCode = '';
      preselectedBin  = '';
      closeModal();
      App.toast('출고 처리 완료', 'success');
      App.refreshPage();
    } catch (e) {
      App.toast('출고 실패: ' + e.message, 'error');
    }
  };

  const closeModal = () => {
    document.getElementById('outbound-modal')?.classList.remove('open');
    window._selectedInv = null;
  };

  const afterRender = () => {
    if (preselectedCode) openOutboundModal();
  };

  return { render, afterRender, openOutboundModal, onSelectInv, calcWeight, submitOutbound, closeModal };
})();
