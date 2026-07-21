// ============================================================
// formula.js — 배합비/원료 구성 관리
// ============================================================

const FormulaPage = (() => {
  const rowCount = 8;

  const safe = (v) => String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

  const badge = (status) => {
    if (status === 'ACTIVE') return '<span class="badge badge-pass">사용중</span>';
    if (status === 'HOLD') return '<span class="badge badge-warning">보류</span>';
    return '<span class="badge badge-default">작성중</span>';
  };

  const totalPct = (recipe) => recipe.ingredients.reduce((sum, item) => sum + (Number(item.pct) || 0), 0);
  const avg = (items) => items.length ? Math.round(items.reduce((sum, item) => sum + item.ingredients.length, 0) / items.length) : 0;

  const render = () => {
    const recipes = DB.getFormulaRecipes().slice().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    const activeCount = recipes.filter(item => item.status === 'ACTIVE').length;
    const holdCount = recipes.filter(item => item.status === 'HOLD').length;

    return `
      <div class="fade-in">
        <div class="module-hero mb-20">
          <div>
            <div class="module-kicker">배합비 · 생산</div>
            <h2>배합비 관리</h2>
            <p>제품별 원료 구성비, 배합 특이사항, 주의 조건을 배합비팀 기준으로 관리합니다.</p>
          </div>
          <div class="module-metrics">
            <div><span>${formatNum(recipes.length)}</span><label>등록 배합비</label></div>
            <div><span>${formatNum(activeCount)}</span><label>사용중</label></div>
            <div><span>${formatNum(avg(recipes))}</span><label>평균 원료수</label></div>
            <div><span>${formatNum(holdCount)}</span><label>보류</label></div>
          </div>
        </div>

        <div class="flex justify-between items-center mb-16 formula-toolbar">
          <div>
            <div class="text-sm text-muted">제품코드와 원료코드 마스터를 연결해 배합비 LOT 추적의 기준으로 사용합니다.</div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="FormulaPage.openAddModal()">＋ 배합비 등록</button>
        </div>

        <div class="formula-layout">
          <div class="formula-list">
            ${recipes.length === 0 ? emptyState() : recipes.map(renderRecipeCard).join('')}
          </div>
          <aside class="card formula-side-panel">
            <div class="card-title mb-12">배합비팀 확인 포인트</div>
            <div class="formula-checkline">
              <strong>원료분석</strong>
              <span>조건부/부적합 원료는 배합비 보정 또는 투입 보류 검토</span>
            </div>
            <div class="formula-checkline">
              <strong>재고주기</strong>
              <span>사용량이 높은 주원료는 재고표와 함께 최소 재고량 재설정</span>
            </div>
            <div class="formula-checkline">
              <strong>질병 위기단계</strong>
              <span>심각 단계 원료·차량은 방역 확인 후 투입 승인</span>
            </div>
            <div class="formula-checkline">
              <strong>VOC 역추적</strong>
              <span>제품 LOT에서 배합비 버전과 원료 LOT를 함께 확인</span>
            </div>
          </aside>
        </div>

        <div class="modal-overlay" id="formula-modal">
          <div class="modal modal-xl">
            <div class="modal-header">
              <div class="modal-title" id="formula-modal-title">배합비 등록</div>
              <button class="modal-close" onclick="FormulaPage.closeModal('formula-modal')">✕</button>
            </div>
            <div id="formula-modal-body"></div>
          </div>
        </div>
      </div>
    `;
  };

  const emptyState = () => `
    <div class="empty-state">
      <div class="empty-icon"></div>
      <h3>등록된 배합비가 없습니다</h3>
      <p class="text-muted">배합비 등록 버튼으로 제품별 원료 구성비를 추가하세요.</p>
    </div>
  `;

  const renderRecipeCard = (recipe) => {
    const total = totalPct(recipe);
    const totalClass = Math.abs(total - 100) <= 0.5 ? 'text-success' : 'text-warning';
    return `
      <article class="formula-card">
        <div class="formula-card-head">
          <div>
            <div class="td-mono text-xs">${safe(recipe.formulaCode || recipe.id)}</div>
            <h3>${safe(recipe.productName || '제품명 미지정')}</h3>
            <p>${safe(recipe.productCode || '-')} · ${safe(recipe.version || 'v1')} · 목표 ${formatNum(recipe.targetQty)}kg</p>
          </div>
          ${badge(recipe.status)}
        </div>

        <div class="formula-summary-grid">
          <div><span>${formatNum(recipe.ingredients.length)}</span><label>원료수</label></div>
          <div><span class="${totalClass}">${total.toFixed(1)}%</span><label>구성합계</label></div>
          <div><span>${safe(recipe.ownerTeam || '배합비팀')}</span><label>담당</label></div>
        </div>

        <div class="formula-ingredient-list">
          ${recipe.ingredients.map(renderIngredient).join('')}
        </div>

        <div class="formula-note-grid">
          <div>
            <label>특이사항</label>
            <p>${safe(recipe.specialNotes || '등록된 특이사항 없음')}</p>
          </div>
          <div>
            <label>주의사항</label>
            <p>${safe(recipe.caution || '등록된 주의사항 없음')}</p>
          </div>
        </div>
      </article>
    `;
  };

  const renderIngredient = (item) => `
    <div class="formula-ingredient-row">
      <div>
        <strong>${safe(item.materialName || '원료명 미지정')}</strong>
        <span class="td-mono">${safe(item.materialCode || '-')}</span>
      </div>
      <div class="td-right">
        <strong>${Number(item.pct || 0).toFixed(2)}%</strong>
        <span>${formatNum(item.qty)}kg</span>
      </div>
      <div>${safe(item.note || '-')}</div>
    </div>
  `;

  const openAddModal = () => {
    const body = document.getElementById('formula-modal-body');
    if (!body) return;
    const products = DB.getProducts().filter(p => p.active !== false);
    const materials = DB.getMaterials().filter(m => m.active !== false);

    document.getElementById('formula-modal-title').textContent = '배합비 등록';
    body.innerHTML = `
      <div class="formula-modal-body">
        <div class="form-grid form-grid-3">
          <div class="form-group">
            <label class="form-label">제품코드</label>
            <input class="form-input" id="fr-product-code" list="fr-products" placeholder="예) 7000001" oninput="FormulaPage.syncProductName()">
            <datalist id="fr-products">
              ${products.map(p => `<option value="${safe(p.code)}">${safe(p.name || '')}</option>`).join('')}
            </datalist>
          </div>
          <div class="form-group">
            <label class="form-label">제품명</label>
            <input class="form-input" id="fr-product-name" placeholder="제품명">
          </div>
          <div class="form-group">
            <label class="form-label">버전</label>
            <input class="form-input" id="fr-version" value="v${new Date().getFullYear().toString().slice(2)}.1">
          </div>
          <div class="form-group">
            <label class="form-label">목표 배합량(kg)</label>
            <input type="number" class="form-input" id="fr-target-qty" value="1000" min="1">
          </div>
          <div class="form-group">
            <label class="form-label">상태</label>
            <select class="form-input" id="fr-status">
              <option value="ACTIVE">사용중</option>
              <option value="DRAFT">작성중</option>
              <option value="HOLD">보류</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">작성자</label>
            <input class="form-input" id="fr-created-by" value="배합비팀">
          </div>
        </div>

        <datalist id="fr-materials">
          ${materials.map(m => `<option value="${safe(m.code)}">${safe(m.name || '')}</option>`).join('')}
        </datalist>

        <div class="formula-input-section">
          <div class="formula-input-head">
            <strong>원료 구성</strong>
            <span>구성비 합계는 100% 기준입니다.</span>
          </div>
          <div class="formula-input-table">
            <div class="formula-input-row formula-input-row-head">
              <span>원료코드</span><span>원료명</span><span>구성비(%)</span><span>특이사항</span>
            </div>
            ${Array.from({ length: rowCount }, (_, idx) => ingredientInputRow(idx)).join('')}
          </div>
        </div>

        <div class="form-grid form-grid-2">
          <div class="form-group">
            <label class="form-label">배합 특이사항</label>
            <textarea class="form-textarea" id="fr-special-notes" placeholder="예) 원료 수분 높을 때 옥수수 비율 보정 검토"></textarea>
          </div>
          <div class="form-group">
            <label class="form-label">주의사항</label>
            <textarea class="form-textarea" id="fr-caution" placeholder="예) 질병 위기단계 심각 시 차량 소독 확인 후 투입"></textarea>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="FormulaPage.closeModal('formula-modal')">취소</button>
          <button class="btn btn-primary" onclick="FormulaPage.submitFormula()">저장</button>
        </div>
      </div>
    `;
    openModal('formula-modal');
  };

  const ingredientInputRow = (idx) => `
    <div class="formula-input-row">
      <input class="form-input" id="fr-mat-code-${idx}" list="fr-materials" oninput="FormulaPage.syncMaterialName(${idx})" placeholder="원료코드">
      <input class="form-input" id="fr-mat-name-${idx}" placeholder="원료명">
      <input class="form-input" id="fr-pct-${idx}" type="number" min="0" step="0.01" placeholder="0.00">
      <input class="form-input" id="fr-note-${idx}" placeholder="특이사항">
    </div>
  `;

  const syncProductName = () => {
    const code = document.getElementById('fr-product-code')?.value;
    const product = DB.getProductByCode(code);
    const nameEl = document.getElementById('fr-product-name');
    if (product && nameEl && !nameEl.dataset.manual) nameEl.value = product.name || '';
  };

  const syncMaterialName = (idx) => {
    const code = document.getElementById(`fr-mat-code-${idx}`)?.value;
    const material = DB.getMaterialByCode(code);
    const nameEl = document.getElementById(`fr-mat-name-${idx}`);
    if (material && nameEl) nameEl.value = material.name || '';
  };

  const submitFormula = () => {
    const productCode = document.getElementById('fr-product-code')?.value.trim() || '';
    const productName = document.getElementById('fr-product-name')?.value.trim() || '';
    const targetQty = Number(document.getElementById('fr-target-qty')?.value || 1000);
    const ingredients = [];

    for (let i = 0; i < rowCount; i += 1) {
      const materialCode = document.getElementById(`fr-mat-code-${i}`)?.value.trim() || '';
      const materialName = document.getElementById(`fr-mat-name-${i}`)?.value.trim() || '';
      const pct = Number(document.getElementById(`fr-pct-${i}`)?.value || 0);
      const note = document.getElementById(`fr-note-${i}`)?.value.trim() || '';
      if (materialCode || materialName || pct > 0 || note) {
        ingredients.push({ materialCode, materialName, pct, note });
      }
    }

    const total = ingredients.reduce((sum, item) => sum + (Number(item.pct) || 0), 0);
    if (!productCode && !productName) { App.toast('제품코드 또는 제품명을 입력하세요', 'error'); return; }
    if (!ingredients.length) { App.toast('원료 구성을 1개 이상 입력하세요', 'error'); return; }
    if (Math.abs(total - 100) > 0.5) { App.toast(`원료 구성비 합계가 ${total.toFixed(2)}%입니다`, 'warning'); return; }

    DB.addFormulaRecipe({
      productCode,
      productName,
      version: document.getElementById('fr-version')?.value.trim() || 'v1',
      status: document.getElementById('fr-status')?.value || 'ACTIVE',
      targetQty,
      ingredients,
      specialNotes: document.getElementById('fr-special-notes')?.value.trim() || '',
      caution: document.getElementById('fr-caution')?.value.trim() || '',
      createdBy: document.getElementById('fr-created-by')?.value.trim() || '배합비팀',
    });

    closeModal('formula-modal');
    App.toast('배합비가 저장되었습니다', 'success');
    App.refreshPage();
  };

  const openModal = (id) => document.getElementById(id)?.classList.add('open');
  const closeModal = (id) => document.getElementById(id)?.classList.remove('open');

  return { render, afterRender: () => {}, openAddModal, submitFormula, syncProductName, syncMaterialName, closeModal };
})();
