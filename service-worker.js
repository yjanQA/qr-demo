// ============================================================
// service-worker.js — 현장 설치형 PWA 캐시
// ============================================================

const CACHE_NAME = 'woosung-qr-demo-v6';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/app-icon.svg',
  './css/style.css',
  './css/lab.css',
  './data/rawMaterials.js',
  './data/productCodes.js',
  './data/supplierMaster.js',
  './data/labItems.js',
  './data/labSeed.js',
  './data/productCategories.js',
  './data/pestControlSeed.js',
  './data/petSpecs.js',
  './data/regSpecs.js',
  './data/rawSpecs.js',
  './data/rawSpecSheets.js',
  './data/labRawImport.js',
  './js/chart_common.js',
  './js/db.js',
  './js/qr.js',
  './js/disease_alert.js',
  './js/haccp_edu_alert.js',
  './js/feed_production.js',
  './js/dashboard.js',
  './js/supplier_inbound.js',
  './js/receiving.js',
  './js/quality.js',
  './js/silo.js',
  './js/inventory.js',
  './js/long_stock.js',
  './js/quality_rd.js',
  './js/formula.js',
  './js/production.js',
  './js/batch.js',
  './js/outbound.js',
  './js/history.js',
  './js/voc.js',
  './js/supplier.js',
  './js/code_master.js',
  './js/pwa_install.js',
  './js/ai_engine.js',
  './js/haccp.js',
  './js/equipment.js',
  './js/submaterial.js',
  './js/issue.js',
  './js/productstock.js',
  './js/sync.js',
  './js/weather.js',
  './js/notifications.js',
  './js/filestore.js',
  './js/xlsx_export.js',
  './js/docx_export.js',
  './js/lab_common.js',
  './js/lab_db.js',
  './js/winboard.js',
  './js/lab_workmap.js',
  './js/lab_matrix.js',
  './js/lab_dashboard.js',
  './js/lab_xlsx_import.js',
  './js/lab_receive.js',
  './js/lab_input.js',
  './js/lab_analysis.js',
  './js/lab_coa.js',
  './js/lab_spec.js',
  './js/lab_specsheet.js',
  './js/lab_items.js',
  './js/lab_haccp.js',
  './js/lab_validation.js',
  './js/lab_sqf.js',
  './js/lab_species_db.js',
  './js/lab_species_report.js',
  './js/lab_corn.js',
  './js/lab_psa.js',
  './js/lab_aqua.js',
  './js/lab_pet.js',
  './js/pest_db.js',
  './js/pest_pdf_parse.js',
  './js/pest_control.js',
  './js/app.js',
  './js/auth.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// 클라이언트가 새 버전 대기 감지 시 즉시 활성화 요청
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// 네트워크 우선(Network-first): 온라인이면 항상 최신을 받아 캐시 갱신, 오프라인이면 캐시로 폴백.
//   → 코드 수정이 새로고침 즉시 반영됨(옛 버전 캐시 잔존 문제 해소). 오프라인 현장에서는 캐시 동작.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
  );
});
