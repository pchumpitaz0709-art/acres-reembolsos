/**
 * ==============================================================================
 * ACRES REEMBOLSOS - LÓGICA FRONTEND (Vercel & GitHub Version)
 * Autenticación 100% Google OAuth 2.0 con Sincronización Multiusuario en Tiempo Real
 * ==============================================================================
 */

// URL AUTÉNTICA DE TU GOOGLE APPS SCRIPT DATABASE API:
const API_URL = 'https://script.google.com/macros/s/AKfycbyDn1wgSqxdE7aQ_SNTCOjSSP7K-lu1rYNb8lG5FyRL9D06ZNjI0XbBoYmBj27Nhbf4/exec';

let state = {
  currentUserEmail: '',
  currentUserPicture: '',
  solicitudes: [],
  currentTab: 'TODOS',
  selectedFileObject: null,
  selectedAprobacionId: null
};

let autoSyncInterval = null;

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  checkAuthSession();
  setupDropdownClickOutside();
});

/* ==========================================
   1. AUTENTICACIÓN OFICIAL DE GOOGLE (JWT)
   ========================================== */
function handleGoogleSignInResponse(response) {
  if (!response || !response.credential) {
    showToast('Error al autenticar con Google.', 'error');
    return;
  }

  // Decodificar payload del token JWT de Google
  const payload = parseJwt(response.credential);
  if (payload && payload.email) {
    const verifiedEmail = payload.email.toLowerCase().trim();
    localStorage.setItem('acres_user_email', verifiedEmail);
    if (payload.picture) {
      localStorage.setItem('acres_user_picture', payload.picture);
      state.currentUserPicture = payload.picture;
    }
    
    state.currentUserEmail = verifiedEmail;
    showToast(`¡Autenticado como ${verifiedEmail}!`, 'success');
    showDashboardView();
    fetchSolicitudesFromAPI();
    startAutoSync();
  } else {
    showToast('No se pudo verificar la cuenta de Google.', 'error');
  }
}

function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));

    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

function checkAuthSession() {
  const savedEmail = localStorage.getItem('acres_user_email');
  const savedPic = localStorage.getItem('acres_user_picture');
  if (savedEmail && savedEmail.trim() !== '') {
    state.currentUserEmail = savedEmail.toLowerCase().trim();
    state.currentUserPicture = savedPic || '';
    showDashboardView();
    fetchSolicitudesFromAPI();
    startAutoSync();
  } else {
    showLoginView();
  }
}

function showLoginView() {
  if (autoSyncInterval) clearInterval(autoSyncInterval);
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('appDashboard').classList.add('hidden');
  document.getElementById('appDashboard').classList.remove('flex');
}

function showDashboardView() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appDashboard').classList.remove('hidden');
  document.getElementById('appDashboard').classList.add('flex');

  document.getElementById('userEmailDisplay').textContent = state.currentUserEmail;
  document.getElementById('mobileUserEmailDisplay').textContent = state.currentUserEmail;
  
  const avatarElem = document.getElementById('userAvatar');
  if (state.currentUserPicture) {
    avatarElem.innerHTML = `<img src="${state.currentUserPicture}" class="w-full h-full object-cover rounded-full">`;
  } else {
    avatarElem.textContent = (state.currentUserEmail.charAt(0) || 'U').toUpperCase();
  }

  document.getElementById('formSolicitante').value = state.currentUserEmail;
}

function logoutApp() {
  if (autoSyncInterval) clearInterval(autoSyncInterval);
  localStorage.removeItem('acres_user_email');
  localStorage.removeItem('acres_user_picture');
  state.currentUserEmail = '';
  state.currentUserPicture = '';
  state.solicitudes = [];
  showToast('Sesión cerrada correctamente.', 'info');
  setTimeout(() => {
    showLoginView();
  }, 300);
}

/* ==========================================
   2. MENÚ DESPLEGABLE Y TEMA (DARK/LIGHT)
   ========================================== */
function toggleUserDropdown(event) {
  if (event) event.stopPropagation();
  const dropdown = document.getElementById('userDropdownMenu');
  const chevron = document.getElementById('dropdownChevron');

  if (dropdown.classList.contains('hidden')) {
    dropdown.classList.remove('hidden');
    if (chevron) chevron.classList.add('rotate-180');
  } else {
    dropdown.classList.add('hidden');
    if (chevron) chevron.classList.remove('rotate-180');
  }
}

function setupDropdownClickOutside() {
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('userDropdownMenu');
    const btn = document.getElementById('userMenuBtn');
    const chevron = document.getElementById('dropdownChevron');

    if (dropdown && !dropdown.classList.contains('hidden')) {
      if (btn && !btn.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.add('hidden');
        if (chevron) chevron.classList.remove('rotate-180');
      }
    }
  });
}

function initTheme() {
  const savedTheme = localStorage.getItem('acres_theme') || 
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  setTheme(savedTheme);
}

function toggleTheme() {
  const currentTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  setTheme(newTheme);
}

function setTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');
  } else {
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
  }
  localStorage.setItem('acres_theme', theme);
  lucide.createIcons();
}

/* ==========================================
   3. COMUNICACIÓN Y AUTO-SINCRONIZACIÓN EN TIEMPO REAL
   ========================================== */
function startAutoSync() {
  if (autoSyncInterval) clearInterval(autoSyncInterval);
  autoSyncInterval = setInterval(() => {
    fetchSolicitudesFromAPI(false);
  }, 10000);
}

function fetchSolicitudesFromAPI(showSpinner = true) {
  const syncBtnIcon = document.getElementById('syncSpinner');
  if (showSpinner && syncBtnIcon) {
    syncBtnIcon.classList.add('animate-spin');
  }

  const cachedData = localStorage.getItem('acres_cached_solicitudes');
  if (cachedData && state.solicitudes.length === 0) {
    try {
      state.solicitudes = JSON.parse(cachedData);
      updateKPIs();
      applyFilters();
    } catch (e) {}
  }

  fetch(API_URL + '?action=getData')
    .then(res => res.json())
    .then(response => {
      showLoading(false);
      if (syncBtnIcon) syncBtnIcon.classList.remove('animate-spin');

      if (response && response.solicitudes) {
        state.solicitudes = response.solicitudes;
        localStorage.setItem('acres_cached_solicitudes', JSON.stringify(response.solicitudes));
        updateKPIs();
        applyFilters();
      }
    })
    .catch(err => {
      showLoading(false);
      if (syncBtnIcon) syncBtnIcon.classList.remove('animate-spin');
      if (!state.solicitudes) state.solicitudes = [];
      updateKPIs();
      applyFilters();
    });
}

/* ==========================================
   4. FILTROS Y KPIS
   ========================================== */
function setTabFilter(tabName) {
  state.currentTab = tabName;
  ['TODOS', 'MIS_SOLICITUDES', 'Pendiente', 'Reembolsado'].forEach(tab => {
    const btn = document.getElementById(`tab-${tab}`);
    if (!btn) return;
    if (tab === tabName) {
      btn.className = 'px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all bg-acres-500 text-white shadow-sm';
    } else {
      btn.className = 'px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition-all';
    }
  });
  applyFilters();
}

function applyFilters() {
  const searchText = (document.getElementById('searchInput').value || '').toLowerCase().trim();
  const selectedCategoria = document.getElementById('categoriaFilter').value;

  const filtered = state.solicitudes.filter(item => {
    if (state.currentTab === 'MIS_SOLICITUDES' && item.solicitante.toLowerCase() !== state.currentUserEmail.toLowerCase()) {
      return false;
    }
    if (state.currentTab === 'Pendiente' && item.estado !== 'Pendiente') {
      return false;
    }
    if (state.currentTab === 'Reembolsado' && item.estado !== 'Reembolsado') {
      return false;
    }
    if (selectedCategoria !== 'TODAS' && item.categoria !== selectedCategoria) {
      return false;
    }
    if (searchText !== '') {
      const matchSolicitante = item.solicitante.toLowerCase().includes(searchText);
      const matchDetalle = item.detalle.toLowerCase().includes(searchText);
      const matchValidado = item.validadoPor.toLowerCase().includes(searchText);
      if (!matchSolicitante && !matchDetalle && !matchValidado) {
        return false;
      }
    }
    return true;
  });

  renderDataView(filtered);
}

function updateKPIs() {
  let totalMonto = 0;
  let pendientesMonto = 0;
  let pendientesCount = 0;
  let reembolsadosMonto = 0;
  let reembolsadosCount = 0;
  let misMonto = 0;
  let misCount = 0;

  state.solicitudes.forEach(item => {
    const monto = parseFloat(item.monto) || 0;
    totalMonto += monto;

    if (item.estado === 'Pendiente') {
      pendientesMonto += monto;
      pendientesCount++;
    } else if (item.estado === 'Reembolsado') {
      reembolsadosMonto += monto;
      reembolsadosCount++;
    }

    if (item.solicitante.toLowerCase() === state.currentUserEmail.toLowerCase()) {
      misMonto += monto;
      misCount++;
    }
  });

  document.getElementById('kpiTotalMonto').textContent = formatCurrency(totalMonto);
  document.getElementById('kpiTotalCount').textContent = `${state.solicitudes.length} registros`;

  document.getElementById('kpiPendientesMonto').textContent = formatCurrency(pendientesMonto);
  document.getElementById('kpiPendientesCount').textContent = `${pendientesCount} pendientes`;

  document.getElementById('kpiReembolsadosMonto').textContent = formatCurrency(reembolsadosMonto);
  document.getElementById('kpiReembolsadosCount').textContent = `${reembolsadosCount} pagados`;

  document.getElementById('kpiMisSolicitudesMonto').textContent = formatCurrency(misMonto);
  document.getElementById('kpiMisSolicitudesCount').textContent = `${misCount} registradas mías`;
}

/* ==========================================
   VISTA DE TABLA (SIN COLUMNA ID, FECHA PRIMERA Y DETALLE SEGUNDO)
   ========================================== */
function renderDataView(items) {
  const desktopTbody = document.getElementById('desktopTableBody');
  const mobileCards = document.getElementById('mobileCardView');
  const emptyState = document.getElementById('emptyState');
  const recordsCounter = document.getElementById('recordsCounterDisplay');

  recordsCounter.textContent = `Mostrando ${items.length} solicitudes`;

  if (items.length === 0) {
    desktopTbody.innerHTML = '';
    mobileCards.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  desktopTbody.innerHTML = items.map(item => {
    const isOwner = item.solicitante.toLowerCase() === state.currentUserEmail.toLowerCase();
    const isReembolsado = item.estado === 'Reembolsado';

    const hasSustento = item.sustentoUrl || item.sustentoNombre || item.sustentoBase64;

    const sustentoBtnHtml = hasSustento 
      ? `<button onclick="openModalVisorSustento('${item.id}')" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50 hover:bg-emerald-100 transition-all">
          <i data-lucide="paperclip" class="w-3.5 h-3.5"></i>
          <span class="max-w-[120px] truncate">${item.sustentoNombre || 'Ver Comprobante'}</span>
         </button>`
      : `<span class="text-xs text-slate-400 italic">Sin sustento</span>`;

    return `
      <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-900/50 transition-colors">
        <td class="py-3.5 px-4 text-xs font-semibold whitespace-nowrap text-slate-700 dark:text-slate-300">${item.fecha}</td>
        <td class="py-3.5 px-4 text-xs font-medium text-slate-900 dark:text-white max-w-[220px]">
          <div class="line-clamp-2">${item.detalle}</div>
        </td>
        <td class="py-3.5 px-4 text-xs font-medium text-slate-800 dark:text-slate-200">
          <div class="flex items-center gap-1.5">
            <span>${item.solicitante}</span>
            ${isOwner ? `<span class="text-[10px] px-1.5 py-0.2 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold">TÚ</span>` : ''}
          </div>
        </td>
        <td class="py-3.5 px-4 text-xs font-semibold text-slate-700 dark:text-slate-300">${getCategoriaChip(item.categoria)}</td>
        <td class="py-3.5 px-4 text-xs font-bold text-right text-slate-900 dark:text-white font-mono">${formatCurrency(item.monto)}</td>
        <td class="py-3.5 px-4">${sustentoBtnHtml}</td>
        <td class="py-3.5 px-4">
          <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${isReembolsado ? 'badge-reembolsado' : 'badge-pendiente'}">
            <span class="w-1.5 h-1.5 rounded-full ${isReembolsado ? 'bg-emerald-500' : 'bg-amber-500'}"></span>
            ${item.estado}
          </span>
        </td>
        <td class="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-400">
          ${item.validadoPor ? `<span class="font-medium text-slate-700 dark:text-slate-300">${item.validadoPor}</span>` : `<span class="text-slate-400 italic">No validado</span>`}
        </td>
        <td class="py-3.5 px-4 text-center">
          <div class="flex items-center justify-center gap-1">
            ${isOwner ? `
              <button onclick="editSolicitud('${item.id}')" title="Editar mi solicitud" class="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-all">
                <i data-lucide="pencil" class="w-4 h-4"></i>
              </button>
            ` : ''}
            <button onclick="openModalAprobacion('${item.id}')" title="Aprobar / Validar Reembolso (Jefatura)" class="px-2 py-1 rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 text-xs font-semibold hover:bg-emerald-200 transition-all flex items-center gap-1">
              <i data-lucide="shield-check" class="w-3.5 h-3.5"></i>
              <span>Validar</span>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  mobileCards.innerHTML = items.map(item => {
    const isOwner = item.solicitante.toLowerCase() === state.currentUserEmail.toLowerCase();
    const isReembolsado = item.estado === 'Reembolsado';

    const hasSustento = item.sustentoUrl || item.sustentoNombre || item.sustentoBase64;

    return `
      <div class="glass-card rounded-2xl p-4 space-y-3 shadow-sm border border-slate-200 dark:border-slate-800">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-slate-600 dark:text-slate-300">${item.fecha} • ${getCategoriaChip(item.categoria)}</span>
          <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold ${isReembolsado ? 'badge-reembolsado' : 'badge-pendiente'}">
            ${item.estado}
          </span>
        </div>

        <div class="flex items-baseline justify-between gap-2">
          <h4 class="text-sm font-semibold text-slate-900 dark:text-slate-100 line-clamp-2">${item.detalle}</h4>
          <span class="text-base font-bold text-slate-900 dark:text-white font-mono flex-shrink-0">${formatCurrency(item.monto)}</span>
        </div>

        <div class="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span class="truncate max-w-[150px]">${item.solicitante} ${isOwner ? '<strong>(Tú)</strong>' : ''}</span>
          
          <div class="flex items-center gap-2">
            ${hasSustento ? `
              <button onclick="openModalVisorSustento('${item.id}')" class="px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-semibold text-xs flex items-center gap-1">
                <i data-lucide="paperclip" class="w-3.5 h-3.5"></i>
                <span>Ver Foto</span>
              </button>
            ` : ''}

            ${isOwner ? `
              <button onclick="editSolicitud('${item.id}')" class="px-2.5 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs">
                Editar
              </button>
            ` : ''}

            <button onclick="openModalAprobacion('${item.id}')" class="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-semibold text-xs flex items-center gap-1">
              <i data-lucide="shield-check" class="w-3.5 h-3.5"></i>
              <span>Validar</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

/* ==========================================
   5. VISOR EN PANTALLA COMPLETA PARA SUSTENTOS (FOTOS / PDF)
   ========================================== */
function openModalVisorSustento(id) {
  const item = state.solicitudes.find(s => s.id === id);
  if (!item) return;

  const modal = document.getElementById('modalVisorSustento');
  const title = document.getElementById('visorSustentoTitle');
  const imgDisplay = document.getElementById('visorImageDisplay');
  const pdfDisplay = document.getElementById('visorPdfDisplay');
  const fallbackText = document.getElementById('visorFallbackText');
  const downloadLink = document.getElementById('visorDownloadLink');
  const driveBtn = document.getElementById('visorDriveDirectBtn');

  title.textContent = item.sustentoNombre || `Sustento de Gasto - ${item.fecha}`;

  const sourceUrl = item.sustentoBase64 || item.sustentoUrl || '';

  imgDisplay.classList.add('hidden');
  pdfDisplay.classList.add('hidden');
  fallbackText.classList.add('hidden');

  downloadLink.href = sourceUrl;
  downloadLink.setAttribute('download', item.sustentoNombre || 'comprobante.jpg');

  if (sourceUrl.startsWith('data:image/') || sourceUrl.match(/\.(jpeg|jpg|png|gif|webp)($|\?)/i)) {
    imgDisplay.src = sourceUrl;
    imgDisplay.classList.remove('hidden');
  } else if (sourceUrl.startsWith('data:application/pdf') || sourceUrl.endsWith('.pdf')) {
    pdfDisplay.src = sourceUrl;
    pdfDisplay.classList.remove('hidden');
  } else if (sourceUrl.includes('drive.google.com') || sourceUrl.includes('google.com')) {
    driveBtn.href = sourceUrl;
    fallbackText.classList.remove('hidden');
  } else if (sourceUrl !== '') {
    imgDisplay.src = sourceUrl;
    imgDisplay.classList.remove('hidden');
  } else {
    fallbackText.classList.remove('hidden');
  }

  modal.classList.remove('hidden');
  lucide.createIcons();
}

function closeModalVisorSustento() {
  const modal = document.getElementById('modalVisorSustento');
  document.getElementById('visorImageDisplay').src = '';
  document.getElementById('visorPdfDisplay').src = '';
  modal.classList.add('hidden');
}

function getCategoriaChip(cat) {
  const map = {
    'Movilidad': '🚗 Movilidad',
    'Alimentación': '🍔 Alimentación',
    'Útiles': '✏️ Útiles',
    'Otros': '📦 Otros'
  };
  return map[cat] || cat;
}

function formatCurrency(num) {
  return 'S/. ' + (parseFloat(num) || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ==========================================
   6. COMPRESIÓN DE FOTOS Y FORMULARIOS
   ========================================== */
function openModalSolicitud(data = null) {
  const modal = document.getElementById('modalSolicitud');
  const form = document.getElementById('formSolicitud');
  const title = document.getElementById('modalSolicitudTitle');
  const seccionValidacion = document.getElementById('seccionValidacionJefatura');

  form.reset();
  clearSelectedFile();

  if (data) {
    title.textContent = `Editar Solicitud (${data.fecha})`;
    document.getElementById('formId').value = data.id;
    document.getElementById('formFecha').value = data.fecha;
    document.getElementById('formSolicitante').value = data.solicitante;
    document.getElementById('formCategoria').value = data.categoria;
    document.getElementById('formMonto').value = data.monto;
    document.getElementById('formDetalle').value = data.detalle;
    document.getElementById('formSustentoUrl').value = data.sustentoUrl || '';
    document.getElementById('formSustentoNombre').value = data.sustentoNombre || '';
    document.getElementById('formEstado').value = data.estado || 'Pendiente';
    document.getElementById('formValidadoPor').value = data.validadoPor || '';

    if (data.sustentoNombre) {
      showFilePreviewUI(data.sustentoNombre);
    }

    seccionValidacion.classList.remove('hidden');

    const isOwner = data.solicitante.toLowerCase() === state.currentUserEmail.toLowerCase();
    ['formFecha', 'formCategoria', 'formMonto', 'formDetalle'].forEach(fieldId => {
      document.getElementById(fieldId).disabled = !isOwner;
    });

  } else {
    title.textContent = 'Nueva Solicitud de Reembolso';
    document.getElementById('formId').value = '';
    document.getElementById('formFecha').value = new Date().toISOString().split('T')[0];
    document.getElementById('formSolicitante').value = state.currentUserEmail;
    document.getElementById('formEstado').value = 'Pendiente';
    document.getElementById('formValidadoPor').value = '';

    seccionValidacion.classList.add('hidden');

    ['formFecha', 'formCategoria', 'formMonto', 'formDetalle'].forEach(fieldId => {
      document.getElementById(fieldId).disabled = false;
    });
  }

  modal.classList.remove('hidden');
  lucide.createIcons();
}

function closeModalSolicitud() {
  document.getElementById('modalSolicitud').classList.add('hidden');
}

function editSolicitud(id) {
  const item = state.solicitudes.find(s => s.id === id);
  if (item) {
    openModalSolicitud(item);
  }
}

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (file.type.startsWith('image/')) {
    compressImage(file, 1200, 0.75, (compressedBase64, newFileName) => {
      state.selectedFileObject = {
        fileName: newFileName,
        mimeType: 'image/jpeg',
        base64Data: compressedBase64
      };
      showFilePreviewUI(newFileName + ' (Optimizado)');
    });
  } else {
    if (file.size > 10 * 1024 * 1024) {
      showToast('El archivo supera los 10MB permitidos.', 'warning');
      return;
    }
    const reader = new FileReader();
    reader.onload = function(e) {
      state.selectedFileObject = {
        fileName: file.name,
        mimeType: file.type,
        base64Data: e.target.result
      };
      showFilePreviewUI(file.name);
    };
    reader.readAsDataURL(file);
  }
}

function compressImage(file, maxDimension, quality, callback) {
  const reader = new FileReader();
  reader.onload = function(event) {
    const img = new Image();
    img.onload = function() {
      let width = img.width;
      let height = img.height;

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
      const cleanName = file.name.replace(/\.[^/.]+$/, "") + "_comp.jpg";
      callback(compressedBase64, cleanName);
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

function showFilePreviewUI(fileName) {
  document.getElementById('filePreviewName').textContent = fileName;
  document.getElementById('filePreviewContainer').classList.remove('hidden');
}

function clearSelectedFile() {
  state.selectedFileObject = null;
  document.getElementById('fileInput').value = '';
  document.getElementById('formSustentoUrl').value = '';
  document.getElementById('formSustentoNombre').value = '';
  document.getElementById('filePreviewContainer').classList.add('hidden');
}

function generateUniqueId() {
  const fechaStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomHex = Math.floor(1000 + Math.random() * 9000).toString(16).toUpperCase();
  return 'REEM-' + fechaStr + '-' + randomHex;
}

function handleSaveSolicitud(e) {
  e.preventDefault();

  const btnSave = document.getElementById('btnSaveSolicitud');
  btnSave.disabled = true;
  btnSave.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Guardando...`;
  lucide.createIcons();

  const existingId = document.getElementById('formId').value;
  const recordId = (existingId && existingId.trim() !== '') ? existingId.trim() : generateUniqueId();

  const sustentoNombre = state.selectedFileObject 
    ? state.selectedFileObject.fileName 
    : (document.getElementById('formSustentoNombre').value || '');

  const sustentoBase64 = state.selectedFileObject ? state.selectedFileObject.base64Data : '';

  const newRecord = {
    id: recordId,
    fecha: document.getElementById('formFecha').value,
    solicitante: document.getElementById('formSolicitante').value,
    categoria: document.getElementById('formCategoria').value,
    monto: parseFloat(document.getElementById('formMonto').value) || 0.00,
    detalle: document.getElementById('formDetalle').value,
    sustentoUrl: document.getElementById('formSustentoUrl').value || sustentoBase64 || '',
    sustentoNombre: sustentoNombre,
    sustentoBase64: sustentoBase64,
    estado: document.getElementById('formEstado').value || 'Pendiente',
    validadoPor: document.getElementById('formValidadoPor').value || ''
  };

  // 1. RENDERIZADO OPTIMISTA INSTANTÁNEO Y VISUALIZACIÓN DIRECTA (< 0.1s)
  const existingIndex = state.solicitudes.findIndex(s => s.id === recordId);
  if (existingIndex >= 0) {
    state.solicitudes[existingIndex] = newRecord;
  } else {
    state.solicitudes.unshift(newRecord);
  }

  localStorage.setItem('acres_cached_solicitudes', JSON.stringify(state.solicitudes));
  updateKPIs();
  applyFilters();

  closeModalSolicitud();
  showToast('Solicitud y sustento guardados correctamente.', 'success');

  btnSave.disabled = false;
  btnSave.innerHTML = `<i data-lucide="save" class="w-4 h-4"></i> Guardar Solicitud`;

  // 2. SINCRONIZACIÓN EN SEGUNDO PLANO CON GOOGLE SHEETS & DRIVE
  const formData = {
    ...newRecord,
    fileObject: state.selectedFileObject
  };

  fetch(API_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'saveSolicitud', data: formData })
  }).then(() => {
    setTimeout(() => fetchSolicitudesFromAPI(false), 2500);
  }).catch(() => {});
}

function openModalAprobacion(id) {
  state.selectedAprobacionId = id;
  document.getElementById('aprobacionIdDisplay').textContent = `#${id}`;
  document.getElementById('modalAprobacion').classList.remove('hidden');
  lucide.createIcons();
}

function closeModalAprobacion() {
  state.selectedAprobacionId = null;
  document.getElementById('modalAprobacion').classList.add('hidden');
}

function confirmarAprobacion() {
  if (!state.selectedAprobacionId) return;

  const nuevoEstado = document.getElementById('aprobacionNuevoEstado').value;
  const validadoPor = document.getElementById('aprobacionValidadoPor').value || 'Jefatura ACRES';

  const itemIndex = state.solicitudes.findIndex(s => s.id === state.selectedAprobacionId);
  if (itemIndex >= 0) {
    state.solicitudes[itemIndex].estado = nuevoEstado;
    state.solicitudes[itemIndex].validadoPor = validadoPor;
    localStorage.setItem('acres_cached_solicitudes', JSON.stringify(state.solicitudes));
    updateKPIs();
    applyFilters();
  }

  closeModalAprobacion();
  showToast('Estado actualizado.', 'success');

  fetch(API_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'updateStatus',
      id: state.selectedAprobacionId,
      nuevoEstado: nuevoEstado,
      validadoPor: validadoPor
    })
  }).catch(() => {});
}

function showLoading(show) {
  const skeleton = document.getElementById('loadingSkeleton');
  if (show) {
    skeleton.classList.remove('hidden');
  } else {
    skeleton.classList.add('hidden');
  }
}

function showToast(message, type = 'info') {
  const toast = document.getElementById('toastNotification');
  const toastMessage = document.getElementById('toastMessage');
  const toastIcon = document.getElementById('toastIcon');

  toastMessage.textContent = message;

  if (type === 'error') {
    toastIcon.setAttribute('data-lucide', 'alert-triangle');
    toastIcon.className = 'w-5 h-5 text-rose-500';
  } else if (type === 'success') {
    toastIcon.setAttribute('data-lucide', 'check-circle-2');
    toastIcon.className = 'w-5 h-5 text-emerald-500';
  } else {
    toastIcon.setAttribute('data-lucide', 'info');
    toastIcon.className = 'w-5 h-5 text-acres-500';
  }

  lucide.createIcons();
  toast.classList.remove('hidden');
  toast.classList.add('toast-show');

  setTimeout(() => {
    toast.classList.remove('toast-show');
    setTimeout(() => toast.classList.add('hidden'), 300);
  }, 4000);
}
