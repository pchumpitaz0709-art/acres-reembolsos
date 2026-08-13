/**
 * ==============================================================================
 * ACRES REEMBOLSOS - LÓGICA FRONTEND (Vercel & GitHub Version)
 * Escáner IA Gemini Vision vía Apps Script (key segura en servidor)
 * ==============================================================================
 */

// URL AUTÉNTICA DE TU GOOGLE APPS SCRIPT DATABASE API:
const API_URL = 'https://script.google.com/macros/s/AKfycbxSwjdAFaSexlKXCoWZWqnIKiJozfhB0O0WhWLlfHSukzN30gXpNCiMuAbIMsmG-6-h/exec';

let state = {
  currentUserEmail: '',
  currentUserPicture: '',
  solicitudes: [],
  currentTab: 'TODOS',
  selectedFileObject: null,
  selectedAprobacionId: null,
  selectedEliminarId: null,
  isPrivileged: false,
  adminEmails: ['conomun01@gmail.com', 'mau26.cristina@gmail.com', 'admin@acres.com', 'pablo@acres.com'],
  monthlyCap: parseFloat(localStorage.getItem('acres_monthly_cap')) || 500.00,
  selectedMonth: 'TODOS'
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

  // CONTROL DE ROL Y MODO PRIVILEGIADO (ADMINISTRADOR VS USUARIO NORMAL)
  const userEmail = (state.currentUserEmail || '').toLowerCase().trim();
  const isAdminSaved = localStorage.getItem('acres_admin_override') === 'true';
  const isAdminEmail = state.adminEmails.map(e => e.toLowerCase().trim()).includes(userEmail);
  state.isPrivileged = isAdminEmail || isAdminSaved;

  updateRoleUI();
}

function updateRoleUI() {
  const badge = document.getElementById('userRoleBadge');
  const btnEditCap = document.getElementById('btnEditCap');
  
  if (badge) {
    if (state.isPrivileged) {
      badge.textContent = '👑 Modo Administrador (Vista Completa)';
      badge.className = 'text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-300 dark:border-indigo-800';
    } else {
      badge.textContent = '👤 Modo Normal (Mis Registros)';
      badge.className = 'text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-300 dark:border-emerald-800';
    }
  }

  if (btnEditCap) {
    if (state.isPrivileged) {
      btnEditCap.classList.remove('hidden');
    } else {
      btnEditCap.classList.add('hidden');
    }
  }
}

function logoutApp() {
  if (autoSyncInterval) clearInterval(autoSyncInterval);
  localStorage.removeItem('acres_user_email');
  localStorage.removeItem('acres_user_picture');
  localStorage.removeItem('acres_cached_solicitudes');
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
   3. COMUNICACIÓN Y AUTO-SINCRONIZACIÓN FLUIDA EN TIEMPO REAL
   ========================================== */
function startAutoSync() {
  if (autoSyncInterval) clearInterval(autoSyncInterval);
  autoSyncInterval = setInterval(() => {
    fetchSolicitudesFromAPI(false);
  }, 5000);
}

function fetchSolicitudesFromAPI(showSpinner = true) {
  const syncBtnIcon = document.getElementById('syncSpinner');
  if (showSpinner && syncBtnIcon) {
    syncBtnIcon.classList.add('animate-spin');
  }

  fetch(API_URL + '?action=getData&t=' + Date.now())
    .then(res => res.json())
    .then(response => {
      showLoading(false);
      if (syncBtnIcon) syncBtnIcon.classList.remove('animate-spin');

      if (response && Array.isArray(response.solicitudes)) {
        const remoteList = response.solicitudes;
        const currentList = state.solicitudes;

        const mergedMap = new Map();

        remoteList.forEach(item => {
          if (item && item.id) mergedMap.set(item.id, item);
        });

        currentList.forEach(item => {
          if (item && item.id) {
            const isRecentlyModified = item._lastModifiedLocally && (Date.now() - item._lastModifiedLocally < 10000);

            if (!mergedMap.has(item.id)) {
              mergedMap.set(item.id, item);
            } else if (isRecentlyModified) {
              const remoteItem = mergedMap.get(item.id);
              remoteItem.estado = item.estado;
              remoteItem.validadoPor = item.validadoPor;
              remoteItem._lastModifiedLocally = item._lastModifiedLocally;
              if (item.sustentoBase64 && !remoteItem.sustentoUrl) {
                remoteItem.sustentoBase64 = item.sustentoBase64;
              }
            }
          }
        });

        const mergedArray = Array.from(mergedMap.values());
        state.solicitudes = mergedArray;
        localStorage.setItem('acres_cached_solicitudes', JSON.stringify(mergedArray));
        updateKPIs();
        applyFilters();
      }
    })
    .catch(err => {
      showLoading(false);
      if (syncBtnIcon) syncBtnIcon.classList.remove('animate-spin');
    });
}

/* ==========================================
   4. FILTROS Y KPIS (ARCHIVADO AUTOMÁTICO DE REEMBOLSADOS)
   ========================================== */
function setTabFilter(tabName) {
  state.currentTab = tabName;
  ['TODOS', 'MIS_SOLICITUDES', 'Reembolsado'].forEach(tab => {
    const btn = document.getElementById(`tab-${tab}`);
    if (!btn) return;
    if (tab === tabName) {
      btn.className = 'px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all bg-acres-500 text-white shadow-sm flex items-center gap-1';
    } else {
      btn.className = 'px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition-all flex items-center gap-1';
    }
  });
  applyFilters();
}

function populateMonthFilter() {
  const monthSelect = document.getElementById('monthFilter');
  if (!monthSelect) return;

  const currentVal = monthSelect.value || 'TODOS';
  const monthsSet = new Set();
  
  const nowStr = new Date().toISOString().slice(0, 7);
  monthsSet.add(nowStr);

  state.solicitudes.forEach(item => {
    if (item.fecha && item.fecha.length >= 7) {
      const mStr = item.fecha.slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(mStr)) {
        monthsSet.add(mStr);
      }
    }
  });

  const sortedMonths = Array.from(monthsSet).sort().reverse();
  
  let html = `<option value="TODOS">Todos los Meses</option>`;
  sortedMonths.forEach(m => {
    const parts = m.split('-');
    const year = parts[0];
    const monthNum = parseInt(parts[1], 10);
    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const monthName = monthNames[monthNum - 1] || m;
    html += `<option value="${m}">${monthName} ${year}</option>`;
  });

  monthSelect.innerHTML = html;
  monthSelect.value = currentVal;
}

function applyFilters() {
  populateMonthFilter();

  const searchText = (document.getElementById('searchInput').value || '').toLowerCase().trim();
  const selectedCategoria = document.getElementById('categoriaFilter').value;
  const monthSelect = document.getElementById('monthFilter');
  const selectedMonth = monthSelect ? monthSelect.value : 'TODOS';
  
  state.selectedMonth = selectedMonth;

  const filtered = state.solicitudes.filter(item => {
    const itemSolicitanteClean = (item.solicitante || '').toLowerCase().trim();
    const currentEmailClean = (state.currentUserEmail || '').toLowerCase().trim();

    // RESTRICCIÓN DE ROL: Si NO es administrador/privilegiado, SOLO VE SUS PROPIOS REGISTROS
    if (!state.isPrivileged && itemSolicitanteClean !== currentEmailClean) {
      return false;
    }

    // FILTRO MENSUALIZADO:
    if (selectedMonth !== 'TODOS') {
      if (!item.fecha || !item.fecha.startsWith(selectedMonth)) {
        return false;
      }
    }

    // PESTAÑAS
    if (state.currentTab === 'TODOS' && item.estado === 'Reembolsado') {
      return false;
    }

    if (state.currentTab === 'MIS_SOLICITUDES' && itemSolicitanteClean !== currentEmailClean) {
      return false;
    }

    if (state.currentTab === 'Reembolsado' && item.estado !== 'Reembolsado') {
      return false;
    }

    if (selectedCategoria !== 'TODAS' && item.categoria !== selectedCategoria) {
      return false;
    }

    if (searchText !== '') {
      const matchSolicitante = itemSolicitanteClean.includes(searchText);
      const matchDetalle = (item.detalle || '').toLowerCase().includes(searchText);
      const matchValidado = (item.validadoPor || '').toLowerCase().includes(searchText);
      if (!matchSolicitante && !matchDetalle && !matchValidado) {
        return false;
      }
    }
    return true;
  });

  renderDataView(filtered);
  updateMonthlyCapUI();
}

function updateKPIs() {
  let totalMonto = 0;
  let totalCount = 0;
  let pendientesMonto = 0;
  let pendientesCount = 0;
  let reembolsadosMonto = 0;
  let reembolsadosCount = 0;
  let misMonto = 0;
  let misCount = 0;

  const currentEmailClean = (state.currentUserEmail || '').toLowerCase().trim();
  const selectedMonth = state.selectedMonth;

  state.solicitudes.forEach(item => {
    const itemSolicitanteClean = (item.solicitante || '').toLowerCase().trim();

    // Si el usuario no es admin, solo cuenta sus propios items en los KPIs
    if (!state.isPrivileged && itemSolicitanteClean !== currentEmailClean) {
      return;
    }

    // Aplicar filtro por mes a los KPIs si está seleccionado un mes
    if (selectedMonth !== 'TODOS') {
      if (!item.fecha || !item.fecha.startsWith(selectedMonth)) {
        return;
      }
    }

    const monto = parseFloat(item.monto) || 0;
    totalMonto += monto;
    totalCount++;

    if (item.estado === 'Pendiente') {
      pendientesMonto += monto;
      pendientesCount++;
    } else if (item.estado === 'Reembolsado') {
      reembolsadosMonto += monto;
      reembolsadosCount++;
    }

    if (itemSolicitanteClean === currentEmailClean) {
      misMonto += monto;
      misCount++;
    }
  });

  document.getElementById('kpiTotalMonto').textContent = formatCurrency(totalMonto);
  document.getElementById('kpiTotalCount').textContent = `${totalCount} registros`;

  document.getElementById('kpiPendientesMonto').textContent = formatCurrency(pendientesMonto);
  document.getElementById('kpiPendientesCount').textContent = `${pendientesCount} pendientes`;

  document.getElementById('kpiReembolsadosMonto').textContent = formatCurrency(reembolsadosMonto);
  document.getElementById('kpiReembolsadosCount').textContent = `${reembolsadosCount} pagados`;

  document.getElementById('kpiMisSolicitudesMonto').textContent = formatCurrency(misMonto);
  document.getElementById('kpiMisSolicitudesCount').textContent = `${misCount} registradas mías`;
}

function updateMonthlyCapUI() {
  const currentEmailClean = (state.currentUserEmail || '').toLowerCase().trim();
  const nowMonthStr = new Date().toISOString().slice(0, 7);
  const targetMonth = state.selectedMonth !== 'TODOS' ? state.selectedMonth : nowMonthStr;

  let monthTotalUser = 0;
  state.solicitudes.forEach(item => {
    const itemEmailClean = (item.solicitante || '').toLowerCase().trim();
    if (itemEmailClean === currentEmailClean && item.fecha && item.fecha.startsWith(targetMonth)) {
      monthTotalUser += (parseFloat(item.monto) || 0);
    }
  });

  const cap = state.monthlyCap;
  const percent = Math.min(100, Math.round((monthTotalUser / cap) * 100));

  const displayCapElem = document.getElementById('monthlyCapDisplay');
  const progressTextElem = document.getElementById('monthlyCapProgressText');
  const percentElem = document.getElementById('monthlyCapPercent');
  const barElem = document.getElementById('monthlyCapProgressBar');

  if (displayCapElem) displayCapElem.textContent = formatCurrency(cap);
  if (progressTextElem) progressTextElem.textContent = `${formatCurrency(monthTotalUser)} de ${formatCurrency(cap)} consumidos este mes (${targetMonth})`;
  
  if (percentElem) percentElem.textContent = `${percent}%`;
  if (barElem) {
    barElem.style.width = `${percent}%`;
    if (percent >= 95) {
      barElem.className = 'bg-rose-500 h-full rounded-full transition-all duration-500';
      if (percentElem) percentElem.className = 'font-mono text-rose-500 font-bold';
    } else if (percent >= 75) {
      barElem.className = 'bg-amber-500 h-full rounded-full transition-all duration-500';
      if (percentElem) percentElem.className = 'font-mono text-amber-500 font-bold';
    } else {
      barElem.className = 'bg-emerald-500 h-full rounded-full transition-all duration-500';
      if (percentElem) percentElem.className = 'font-mono text-emerald-500 font-bold';
    }
  }
}

function toggleAdminModePrompt() {
  if (state.isPrivileged) {
    state.isPrivileged = false;
    localStorage.removeItem('acres_admin_override');
    showToast('Modo Administrador desactivado. Ahora ves únicamente tus propios registros.', 'info');
  } else {
    const secret = prompt("Ingresa la clave de Administrador o tu correo autorizado (ej. admin@acres.com):");
    if (!secret) return;

    const cleanSec = secret.toLowerCase().trim();
    if (cleanSec === 'acres2026' || cleanSec === 'admin' || state.adminEmails.includes(cleanSec) || cleanSec === state.currentUserEmail) {
      state.isPrivileged = true;
      localStorage.setItem('acres_admin_override', 'true');
      showToast('👑 ¡Modo Administrador activado con éxito!', 'success');
    } else {
      showToast('Correo o clave de administrador no válidos.', 'error');
    }
  }
  updateRoleUI();
  updateKPIs();
  applyFilters();
}

function promptEditMonthlyCap() {
  if (!state.isPrivileged) {
    showToast('Solo los administradores pueden modificar el tope mensual.', 'warning');
    return;
  }

  const currentCap = state.monthlyCap;
  const input = prompt(`Configurar Tope Mensual de Reembolsos por Persona (S/.):`, currentCap);
  if (input !== null) {
    const newCap = parseFloat(input);
    if (!isNaN(newCap) && newCap > 0) {
      state.monthlyCap = newCap;
      localStorage.setItem('acres_monthly_cap', newCap.toString());
      showToast(`Tope mensual actualizado a: ${formatCurrency(newCap)}`, 'success');
      updateMonthlyCapUI();
    } else {
      showToast('Por favor ingresa un monto válido.', 'error');
    }
  }
}

/* ==========================================
   5. VISTA RENDERIZADA RESPONSIVE (TABLA Y TARJETAS MÓVILES)
   ========================================== */
function renderDataView(items) {
  const desktopTbody = document.getElementById('desktopTableBody');
  const mobileCardContainer = document.getElementById('mobileCardView');
  const emptyState = document.getElementById('emptyState');
  const recordsCounter = document.getElementById('recordsCounterDisplay');

  recordsCounter.textContent = `Mostrando ${items.length} solicitudes`;

  if (items.length === 0) {
    desktopTbody.innerHTML = '';
    mobileCardContainer.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  const currentEmailClean = (state.currentUserEmail || '').toLowerCase().trim();

  // RENDER DESKTOP TABLE
  desktopTbody.innerHTML = items.map(item => {
    const itemSolicitanteClean = (item.solicitante || '').toLowerCase().trim();
    const isOwner = (itemSolicitanteClean === currentEmailClean) && (currentEmailClean !== '');
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
              <button onclick="openModalEliminar('${item.id}')" title="Eliminar mi registro" class="p-1.5 rounded-lg text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-950/60 transition-all">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
            ` : ''}
            <button onclick="openModalAprobacion('${item.id}')" title="Aprobar / Cambiar Estado del Reembolso" class="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 text-xs font-semibold hover:bg-emerald-200 transition-all flex items-center gap-1">
              <i data-lucide="shield-check" class="w-3.5 h-3.5"></i>
              <span>Validar</span>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // RENDER MOBILE CARDS NATIVAS EN CELULARES
  mobileCardContainer.innerHTML = items.map(item => {
    const itemSolicitanteClean = (item.solicitante || '').toLowerCase().trim();
    const isOwner = (itemSolicitanteClean === currentEmailClean) && (currentEmailClean !== '');
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

        <div class="pt-2 border-t border-slate-100 dark:border-slate-800/80 space-y-2 text-xs text-slate-500 dark:text-slate-400">
          <div class="flex flex-col gap-1">
            <span class="truncate"><strong>Solicitante:</strong> ${item.solicitante} ${isOwner ? '<span class="text-[10px] px-1.5 py-0.2 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold">TÚ</span>' : ''}</span>
            <span><strong>Validado por:</strong> ${item.validadoPor ? `<span class="font-semibold text-slate-700 dark:text-slate-300">${item.validadoPor}</span>` : '<span class="text-slate-400 italic">No validado</span>'}</span>
          </div>

          <div class="flex items-center justify-between gap-1.5 pt-1">
            ${hasSustento ? `
              <button onclick="openModalVisorSustento('${item.id}')" class="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-semibold text-xs border border-emerald-200 dark:border-emerald-800/50 flex items-center gap-1">
                <i data-lucide="paperclip" class="w-3.5 h-3.5"></i>
                <span>Comprobante</span>
              </button>
            ` : '<span></span>'}

            <div class="flex items-center gap-1.5">
              ${isOwner ? `
                <button onclick="editSolicitud('${item.id}')" class="px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs">
                  Editar
                </button>
                <button onclick="openModalEliminar('${item.id}')" class="p-1 rounded-lg text-rose-500 hover:bg-rose-100 transition-all">
                  <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
              ` : ''}

              <button onclick="openModalAprobacion('${item.id}')" class="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-semibold text-xs flex items-center gap-1 shadow-sm">
                <i data-lucide="shield-check" class="w-3.5 h-3.5"></i>
                <span>Validar</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

/* ==========================================
   6. MOTOR OCR PROFESIONAL MULTI-ESTRATEGIA
   - Estrategia A: Google Drive OCR vía Apps Script (calidad Google Lens, gratis)
   - Estrategia B: Multi-pasada Tesseract con pre-procesado adaptativo
   - Parser: Especializado en comprobantes peruanos SUNAT (boletas, facturas, taxis, etc.)
   ========================================== */

function runReceiptOCRScan(rawBase64) {
  // Escáner automático desactivado a solicitud del usuario. Llenado manual limpio.
  const ocrBadge = document.getElementById('ocrStatusBadge');
  if (ocrBadge) ocrBadge.classList.add('hidden');
}

// Llena el formulario directamente con el resultado estructurado de Gemini
function fillFormFromGeminiResult(result) {
  const ocrBadge = document.getElementById('ocrStatusBadge');
  const ocrTextStatus = document.getElementById('ocrTextStatus');
  const ocrIcon = document.getElementById('ocrIcon');

  if (result.monto && parseFloat(result.monto) > 0) {
    document.getElementById('formMonto').value = parseFloat(result.monto).toFixed(2);
  }

  if (result.fecha && result.fecha !== 'null' && result.fecha !== null) {
    try {
      const fStr = String(result.fecha).trim();
      const mIso = fStr.match(/(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})/);
      const mDmy = fStr.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
      if (mIso) {
        document.getElementById('formFecha').value = `${mIso[1]}-${mIso[2].padStart(2,'0')}-${mIso[3].padStart(2,'0')}`;
      } else if (mDmy) {
        const y = mDmy[3].length === 2 ? '20' + mDmy[3] : mDmy[3];
        document.getElementById('formFecha').value = `${y}-${mDmy[2].padStart(2,'0')}-${mDmy[1].padStart(2,'0')}`;
      }
    } catch(e) {}
  }

  const validCats = ['Movilidad', 'Alimentación', 'Útiles', 'Otros'];
  if (result.categoria && validCats.includes(result.categoria)) {
    document.getElementById('formCategoria').value = result.categoria;
  }

  const detalleField = document.getElementById('formDetalle');
  const autoDetalle = result.detalle || result.empresa || '';
  if (autoDetalle && (!detalleField.value || detalleField.value.trim() === '')) {
    detalleField.value = autoDetalle.slice(0, 80);
  }

  const montoDisplay = result.monto ? `S/. ${parseFloat(result.monto).toFixed(2)}` : '---';
  if (ocrBadge && ocrTextStatus) {
    if (ocrIcon) ocrIcon.className = 'w-4 h-4 text-emerald-500 flex-shrink-0';
    ocrTextStatus.textContent = `✅ Gemini IA: ${montoDisplay} • ${result.empresa || ''} • ${result.categoria || 'Otros'}`;
  }
  showToast(`✅ Gemini IA: Total ${montoDisplay} — ${result.empresa || ''}`, 'success');
}

// Comprime la foto manteniendo los colores y nitidez natural (ideal para Vision AI / Google Lens)
function compressForOCR(base64Image) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement('canvas');
      const MAX_W = 1400; // 1400px conserva nitidez perfecta para letras pequeñas
      let w = img.width;
      let h = img.height;
      if (w > MAX_W) { h = Math.round(h * MAX_W / w); w = MAX_W; }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      // Guardar en JPEG limpio calidad 0.82 (~100KB), sin filtros que distorsionen el texto
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => resolve(base64Image);
    img.src = base64Image;
  });
}

// Envía imagen pequeña al Apps Script para Drive OCR (tamaño ~25KB, sin timeout)
function sendToGoogleDriveOCR(smallBase64) {
  return Promise.race([
    fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'ocrImage',
        imageBase64: smallBase64
      })
    })
    .then(res => res.json())
    .then(data => {
      if (data && data.status === 'success' && data.text) {
        return data.text;
      }
      return '';
    }),
    // Timeout de 15 segundos — si tarda más, usar Tesseract
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000))
  ]);
}

// Estrategia B: Tesseract con múltiples umbrales — usa imagen pequeña (ya comprimida)
function runTesseractMultiPass(smallBase64, rawBase64) {
  const ocrTextStatus = document.getElementById('ocrTextStatus');
  if (ocrTextStatus) ocrTextStatus.textContent = '🔍 Leyendo comprobante con IA local...';

  if (!window.Tesseract) {
    updateOCRBadgeError();
    return;
  }

  // Generar versión con umbral alto y versión original pequeña
  Promise.all([
    preprocessCanvas(smallBase64, 'high'),
    preprocessCanvas(smallBase64, 'adaptive')
  ]).then(([highB64, adaptiveB64]) => {
    return Promise.all([
      Tesseract.recognize(smallBase64, 'spa').then(r => r.data.text).catch(() => ''),
      Tesseract.recognize(highB64, 'spa').then(r => r.data.text).catch(() => ''),
      Tesseract.recognize(adaptiveB64, 'spa').then(r => r.data.text).catch(() => '')
    ]);
  }).then(([text1, text2, text3]) => {
    // Combinar todos los textos y elegir el más largo
    const best = [text1, text2, text3].reduce((a, b) => a.length >= b.length ? a : b, '');
    if (best.trim().length > 10) {
      parseAndAutoFillForm(best, 'Tesseract IA');
    } else {
      updateOCRBadgeError();
    }
  }).catch(() => {
    updateOCRBadgeError();
  });
}

// Genera versiones preprocesadas de la imagen para OCR
function preprocessCanvas(base64Image, mode) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      // Escalar siempre a mínimo 2000px de ancho para mejor OCR
      let w = img.width;
      let h = img.height;
      const targetW = Math.max(2000, w);
      h = Math.round((h * targetW) / w);
      w = targetW;

      canvas.width = w;
      canvas.height = h;
      ctx.filter = 'none';
      ctx.drawImage(img, 0, 0, w, h);

      const imgData = ctx.getImageData(0, 0, w, h);
      const d = imgData.data;

      if (mode === 'high') {
        // Binarización fija agresiva: ideal para papel térmico
        for (let i = 0; i < d.length; i += 4) {
          const lum = d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114;
          const v = lum < 128 ? 0 : 255;
          d[i] = d[i+1] = d[i+2] = v;
        }
      } else if (mode === 'adaptive') {
        // Normalización de contraste + umbral adaptativo por bloques
        // Paso 1: Convertir a grayscale
        for (let i = 0; i < d.length; i += 4) {
          const lum = d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114;
          d[i] = d[i+1] = d[i+2] = lum;
        }
        // Paso 2: Umbral adaptativo por ventana 40x40
        const blockSize = 40;
        const grayData = new Uint8Array(w * h);
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            grayData[y * w + x] = d[(y * w + x) * 4];
          }
        }
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const x0 = Math.max(0, x - blockSize);
            const x1 = Math.min(w-1, x + blockSize);
            const y0 = Math.max(0, y - blockSize);
            const y1 = Math.min(h-1, y + blockSize);
            let sum = 0, count = 0;
            for (let by = y0; by <= y1; by += 4) {
              for (let bx = x0; bx <= x1; bx += 4) {
                sum += grayData[by * w + bx];
                count++;
              }
            }
            const localMean = sum / count;
            const pixel = grayData[y * w + x];
            const v = pixel < localMean - 10 ? 0 : 255;
            const idx = (y * w + x) * 4;
            d[idx] = d[idx+1] = d[idx+2] = v;
          }
        }
      }
      // 'original': sin filtro, solo escala

      ctx.putImageData(imgData, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.95));
    };
    img.onerror = () => resolve(base64Image);
    img.src = base64Image;
  });
}

function updateOCRBadgeError() {
  const ocrBadge = document.getElementById('ocrStatusBadge');
  const ocrTextStatus = document.getElementById('ocrTextStatus');
  const ocrIcon = document.getElementById('ocrIcon');
  if (ocrTextStatus) ocrTextStatus.textContent = 'No se pudo leer el comprobante. Por favor ingresa el monto manualmente.';
  if (ocrIcon) ocrIcon.className = 'w-4 h-4 text-amber-500 flex-shrink-0';
}

// (función legacy eliminada — reemplazada por compressForOCR)

/* ==========================================
   PARSER INTELIGENTE DE COMPROBANTES PERUANOS
   Maneja: boletas SUNAT, facturas electrónicas, tickets de taxi,
   recibos de restaurant, recibos de peaje, vouchers de tarjeta, etc.
   ========================================== */
function parseAndAutoFillForm(ocrText, method) {
  const ocrBadge = document.getElementById('ocrStatusBadge');
  const ocrTextStatus = document.getElementById('ocrTextStatus');

  if (!ocrText || ocrText.trim().length < 5) {
    updateOCRBadgeError();
    return;
  }

  // Corrección de errores comunes de OCR en números (confusión O↔0, I↔1, S↔5, B↔8)
  const normalizedText = ocrText
    .replace(/[oO](?=[0-9]|\.[0-9])/g, '0') // O seguido de número → 0
    .replace(/(?<=[0-9])O/g, '0')            // número seguido de O → 0
    .replace(/l(?=[0-9])/g, '1')             // l seguido de número → 1
    .replace(/\|/g, '1');                    // pipe → 1 en contextos numéricos

  const lines = normalizedText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const allText = normalizedText;
  const textLower = allText.toLowerCase();

  // =====================================================
  // 1. EXTRACCIÓN DEL MONTO TOTAL — 5 ESTRATEGIAS
  // =====================================================
  let extractedMonto = null;
  let montoSource = '';

  // ESTRATEGIA 1: Línea explícita TOTAL / IMPORTE TOTAL con monto
  const totalPatterns = [
    /(?:TOTAL\s*GENERAL|IMPORTE\s*TOTAL|TOTAL\s*A\s*PAGAR|TOTAL\s*VENTA|PRECIO\s*TOTAL)\s*[:\-]?\s*(?:S\/\.?|\$|USD|PEN)?\s*([0-9]{1,6}[\.,][0-9]{2})/gi,
    /(?:^|\s)TOTAL\s*[:\-]?\s*(?:S\/\.?|\$)?\s*([0-9]{1,6}[\.,][0-9]{2})/gim,
    /TOTAL\s+S\/\s*([0-9]{1,6}[\.,][0-9]{2})/gi,
    /(?:CANCELADO|PAGADO|COBRADO)\s*[:\-]?\s*(?:S\/\.?|\$)?\s*([0-9]{1,6}[\.,][0-9]{2})/gi,
  ];

  for (const pat of totalPatterns) {
    const matches = [...allText.matchAll(pat)];
    if (matches.length > 0) {
      // Si hay varias coincidencias, tomar la última (el total final)
      const lastMatch = matches[matches.length - 1];
      const val = parseFloat(lastMatch[1].replace(',', '.'));
      if (val > 0 && val < 99999) {
        extractedMonto = val;
        montoSource = 'TOTAL explícito';
        break;
      }
    }
  }

  // ESTRATEGIA 2: Línea con "SON: CUARENTA Y SIETE CON 56/100 SOLES" → céntimos conocidos
  if (!extractedMonto) {
    const wordsMatch = allText.match(/SON[:\s]+.{3,60}\b(\d{1,2})\/100/i);
    if (wordsMatch && wordsMatch[1]) {
      const centimos = wordsMatch[1].padStart(2, '0');
      // Buscar número con exactamente esos céntimos
      const byDecimalRgx = new RegExp(`\\b([0-9]{1,6}[\\.,]${centimos})\\b`, 'g');
      const decimalMatches = [...allText.matchAll(byDecimalRgx)];
      if (decimalMatches.length > 0) {
        const candidates = decimalMatches.map(m => parseFloat(m[1].replace(',', '.'))).filter(v => v > 0 && v < 99999);
        if (candidates.length > 0) {
          extractedMonto = Math.max(...candidates);
          montoSource = 'Texto en letras (SON: ...)';
        }
      }
    }
  }

  // ESTRATEGIA 3: IGV/IVA → el Total suele ser IGV * ~5.9
  if (!extractedMonto) {
    const igvMatch = allText.match(/(?:IGV|IVA|TAX)\s*(?:18%)?\s*[:\-]?\s*(?:S\/\.?|\$)?\s*([0-9]{1,6}[\.,][0-9]{2})/i);
    if (igvMatch && igvMatch[1]) {
      const igv = parseFloat(igvMatch[1].replace(',', '.'));
      if (igv > 0) {
        // Total ≈ IGV / 0.18
        extractedMonto = Math.round((igv / 0.18) * 100) / 100;
        montoSource = 'Calculado desde IGV';
      }
    }
  }

  // ESTRATEGIA 4: El número más grande en la parte INFERIOR del documento
  if (!extractedMonto) {
    const lastThird = lines.slice(Math.floor(lines.length * 0.55)).join(' ');
    const allNums = [...lastThird.matchAll(/\b([0-9]{1,6}[\.,][0-9]{2})\b/g)]
      .map(m => parseFloat(m[1].replace(',', '.')))
      .filter(v => v > 0.5 && v < 99999);
    if (allNums.length > 0) {
      extractedMonto = Math.max(...allNums);
      montoSource = 'Mayor valor inferior';
    }
  }

  // ESTRATEGIA 5: El número decimal más grande de TODO el documento
  if (!extractedMonto) {
    const allNums = [...allText.matchAll(/\b([0-9]{1,6}[\.,][0-9]{2})\b/g)]
      .map(m => parseFloat(m[1].replace(',', '.')))
      .filter(v => v > 0.5 && v < 99999);
    if (allNums.length > 0) {
      extractedMonto = Math.max(...allNums);
      montoSource = 'Máximo global';
    }
  }

  // ESTRATEGIA 6 (MATEMÁTICA): Si A + B = C → C es el TOTAL
  // Funciona aunque OCR no lea la palabra "TOTAL" — pura aritmética con los números detectados
  // Ejemplo: 29.66 + 17.90 = 47.56 ✅  (Boleta PRODIFER)
  {
    const allDecimalsRaw = [...allText.matchAll(/\b([0-9]{1,6}[\.,][0-9]{2})\b/g)]
      .map(m => Math.round(parseFloat(m[1].replace(',', '.')) * 100)) // en centavos enteros
      .filter(v => v > 50 && v < 9999900); // entre 0.50 y 99999

    const uniqueNums = [...new Set(allDecimalsRaw)].sort((a, b) => a - b);

    let sumCandidate = null;

    // Buscar si algún número es suma de 2 o más números detectados
    for (let i = 0; i < uniqueNums.length; i++) {
      for (let j = i; j < uniqueNums.length; j++) {
        const partial = uniqueNums[i] + uniqueNums[j];
        // Buscar si esa suma existe en la lista (tolerancia ±2 centavos por redondeo OCR)
        const found = uniqueNums.find(n => Math.abs(n - partial) <= 2 && n > uniqueNums[i] && n > uniqueNums[j]);
        if (found) {
          const candidateMonto = found / 100;
          // Preferir este resultado si es mayor o igual al extractedMonto actual
          if (!extractedMonto || candidateMonto >= extractedMonto) {
            sumCandidate = candidateMonto;
          }
        }
      }
    }

    if (sumCandidate && sumCandidate > 0) {
      extractedMonto = sumCandidate;
      montoSource = 'Verificación matemática (A+B=Total)';
    }
  }

  if (extractedMonto && extractedMonto > 0) {
    document.getElementById('formMonto').value = extractedMonto.toFixed(2);
  }

  // =====================================================
  // 2. EXTRACCIÓN DE FECHA DE EMISIÓN
  // =====================================================
  let extractedFecha = null;

  // Buscar primero cerca de etiquetas de fecha
  const fechaPatterns = [
    /(?:FECHA\s*(?:DE\s*)?EMISI[OÓ]N|FECHA\s*EMISION|EMITIDO\s*EL|FECHA|FEC\.?)\s*[:\-]?\s*([0-9]{1,2}[\/\.-][0-9]{1,2}[\/\.-][0-9]{2,4})/gi,
    /([0-9]{1,2}[\/\.-][0-9]{1,2}[\/\.-][0-9]{4})/g,  // cualquier fecha con año 4 dígitos
    /([0-9]{1,2}[\/\.-][0-9]{1,2}[\/\.-][0-9]{2})/g    // fecha con año 2 dígitos
  ];

  for (const pat of fechaPatterns) {
    const m = allText.match(pat);
    if (m) {
      // Extraer solo los dígitos y separadores del match
      const rawDate = m[1] || m[0];
      const datePart = rawDate.match(/([0-9]{1,2}[\/\.-][0-9]{1,2}[\/\.-][0-9]{2,4})/);
      if (datePart) {
        extractedFecha = datePart[1];
        break;
      }
    }
  }

  if (extractedFecha) {
    try {
      const dateClean = extractedFecha.trim();
      const sep = dateClean.match(/[\/\.-]/)[0];
      const parts = dateClean.split(sep);
      if (parts.length === 3) {
        let day, month, year;
        if (parts[0].length === 4) {
          // Formato YYYY-MM-DD o YYYY/MM/DD
          year = parts[0];
          month = parts[1].padStart(2, '0');
          day = parts[2].padStart(2, '0');
        } else {
          // Formato DD-MM-YYYY o DD/MM/YY
          day = parts[0].padStart(2, '0');
          month = parts[1].padStart(2, '0');
          year = parts[2].length === 2 ? '20' + parts[2] : parts[2];
        }
        const mInt = parseInt(month, 10);
        const dInt = parseInt(day, 10);
        const yInt = parseInt(year, 10);
        if (mInt >= 1 && mInt <= 12 && dInt >= 1 && dInt <= 31 && yInt >= 2010 && yInt <= 2035) {
          document.getElementById('formFecha').value = `${year}-${month}-${day}`;
        }
      }
    } catch(e) {}
  }

  // =====================================================
  // 3. DETECCIÓN DE CATEGORÍA Y RAZÓN SOCIAL/CONCEPTO
  // =====================================================
  let autoCategoria = 'Otros';
  let autoDetalle = '';

  // Mapa de palabras clave → categorías (ampliado para todo tipo de comprobante peruano)
  const categoriaMap = [
    {
      cat: 'Movilidad',
      keywords: ['taxi', 'uber', 'cabify', 'beat', 'indriver', 'peaje', 'combustible',
                 'grifo', 'primax', 'repsol', 'petroperu', 'pecsa', 'gasolinera',
                 'gasolina', 'diesel', 'pasaje', 'bus', 'tren', 'metro', 'combi',
                 'colectivo', 'transporte', 'parking', 'estacionamiento', 'aeropuerto',
                 'latam', 'avianca', 'sky', 'boleto aereo', 'vuelo', 'tpc', 'remisse']
    },
    {
      cat: 'Alimentación',
      keywords: ['restaurante', 'restaurant', 'kfc', 'bembos', 'starbucks', 'mcdonalds',
                 'almuerzo', 'cena', 'desayuno', 'chifa', 'comida', 'menu', 'rokys',
                 'norkys', 'pardos', 'popeyes', 'subway', 'burger', 'pizza', 'pizza hut',
                 'dominos', 'maido', 'polleria', 'cevicheria', 'snack', 'cafeteria',
                 'cafetín', 'pan', 'panaderia', 'pasteleria', 'heladeria', 'jugos',
                 'bebidas', 'delivery', 'rappi', 'pedidosya', 'glovo', 'ifood']
    },
    {
      cat: 'Útiles',
      keywords: ['libreria', 'utiles', 'papel', 'toalla', 'tinta', 'cuaderno', 'lapiz',
                 'boligrafo', 'oficina', 'tailoy', 'prodifer', 'wong office', 'metro',
                 'plumones', 'folder', 'archivador', 'impresion', 'fotocopia', 'anillado',
                 'sello', 'sobre', 'cartulina', 'block', 'agenda', 'grapas', 'tijera',
                 'limpieza', 'desinfectante', 'escoba', 'trapeador', 'detergente', 'jabon']
    }
  ];

  for (const { cat, keywords } of categoriaMap) {
    if (keywords.some(kw => textLower.includes(kw))) {
      autoCategoria = cat;
      break;
    }
  }

  // Extraer Razón Social/empresa: buscar línea antes del RUC o en la primera parte del doc
  const razSocialMatch = allText.match(/^(.{5,60})$/m);
  const giroMatch = allText.match(/GIRO\s*[:\-]?\s*(.{3,40})/i);
  const empresaMatch = allText.match(/(?:EMPRESA|COMPAÑIA|RAZON\s*SOCIAL)\s*[:\-]?\s*(.{3,50})/i);

  if (giroMatch && giroMatch[1]) {
    autoDetalle = `${giroMatch[1].trim()} (${autoCategoria})`;
  } else if (empresaMatch && empresaMatch[1]) {
    autoDetalle = `${empresaMatch[1].trim()} (${autoCategoria})`;
  } else if (lines.length > 0) {
    // Tomar la primera línea no-trivial que no sea solo números o RUC
    const firstMeaningful = lines.find(l => l.length > 4 && !/^[0-9\s\-\/\.]+$/.test(l) && !/^(RUC|N[°º]|\*)/i.test(l));
    autoDetalle = firstMeaningful ? `${firstMeaningful.slice(0, 55)} (${autoCategoria})` : autoCategoria;
  }

  document.getElementById('formCategoria').value = autoCategoria;

  const detalleField = document.getElementById('formDetalle');
  if (autoDetalle && (!detalleField.value || detalleField.value.trim() === '')) {
    detalleField.value = autoDetalle;
  }

  // =====================================================
  // 4. ACTUALIZAR BADGE CON RESULTADO EXITOSO
  // =====================================================
  const montoDisplay = extractedMonto ? `S/. ${extractedMonto.toFixed(2)}` : '---';
  const methodLabel = method || 'IA';

  if (ocrBadge && ocrTextStatus) {
    const ocrIcon = document.getElementById('ocrIcon');
    if (ocrIcon) ocrIcon.className = 'w-4 h-4 text-emerald-500 flex-shrink-0';
    ocrTextStatus.textContent = `✅ Comprobante leído (${methodLabel}): Monto ${montoDisplay} • ${autoCategoria}`;
  }

  showToast(`✅ Leído: Total ${montoDisplay} • ${autoCategoria}`, 'success');
}

function fallbackRegexParsing() {
  updateOCRBadgeError();
}

/* ==========================================
   7. ELIMINACIÓN SEGURA DE REGISTROS PROPIOS
   ========================================== */
function openModalEliminar(id) {
  const item = state.solicitudes.find(s => s.id === id);
  if (!item) return;

  const itemSolicitanteClean = (item.solicitante || '').toLowerCase().trim();
  const currentEmailClean = (state.currentUserEmail || '').toLowerCase().trim();

  if (itemSolicitanteClean !== currentEmailClean) {
    showToast('Solo puedes eliminar tus propios reembolsos.', 'error');
    return;
  }

  state.selectedEliminarId = id;
  document.getElementById('modalEliminarConfirm').classList.remove('hidden');
  lucide.createIcons();
}

function closeModalEliminar() {
  state.selectedEliminarId = null;
  document.getElementById('modalEliminarConfirm').classList.add('hidden');
}

function confirmarEliminarPropio() {
  if (!state.selectedEliminarId) return;

  const targetId = state.selectedEliminarId;
  const item = state.solicitudes.find(s => s.id === targetId);

  const itemSolicitanteClean = (item.solicitante || '').toLowerCase().trim();
  const currentEmailClean = (state.currentUserEmail || '').toLowerCase().trim();

  if (!item || itemSolicitanteClean !== currentEmailClean) {
    showToast('No tienes permiso para eliminar esta solicitud.', 'error');
    closeModalEliminar();
    return;
  }

  state.solicitudes = state.solicitudes.filter(s => s.id !== targetId);
  localStorage.setItem('acres_cached_solicitudes', JSON.stringify(state.solicitudes));
  updateKPIs();
  applyFilters();

  closeModalEliminar();
  showToast('Solicitud eliminada correctamente.', 'success');

  fetch(API_URL, {
    method: 'POST',
    mode: 'no-cors',
    body: JSON.stringify({
      action: 'deleteSolicitud',
      id: targetId,
      userEmail: state.currentUserEmail
    })
  }).then(() => {
    setTimeout(() => fetchSolicitudesFromAPI(false), 2000);
  }).catch(() => {});
}

/* ==========================================
   8. VISOR EN PANTALLA COMPLETA INTEGRADO PARA DRIVE, FOTOS Y PDF
   ========================================== */
function extractGoogleDriveFileId(url) {
  if (!url) return '';
  const matchId = url.match(/id=([a-zA-Z0-9_-]+)/);
  const matchFileD = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (matchId && matchId[1]) return matchId[1];
  if (matchFileD && matchFileD[1]) return matchFileD[1];
  return '';
}

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

  const driveId = extractGoogleDriveFileId(sourceUrl);

  if (sourceUrl.startsWith('data:image/') || sourceUrl.match(/\.(jpeg|jpg|png|gif|webp)($|\?)/i)) {
    imgDisplay.src = sourceUrl;
    imgDisplay.classList.remove('hidden');
  } else if (sourceUrl.startsWith('data:application/pdf') || sourceUrl.endsWith('.pdf')) {
    pdfDisplay.src = sourceUrl;
    pdfDisplay.classList.remove('hidden');
  } else if (driveId !== '') {
    const driveDirectImgUrl = `https://lh3.googleusercontent.com/d/${driveId}`;
    const drivePreviewIframeUrl = `https://drive.google.com/file/d/${driveId}/preview`;
    
    imgDisplay.src = driveDirectImgUrl;
    imgDisplay.onerror = function() {
      imgDisplay.classList.add('hidden');
      pdfDisplay.src = drivePreviewIframeUrl;
      pdfDisplay.classList.remove('hidden');
    };
    imgDisplay.classList.remove('hidden');
    driveBtn.href = sourceUrl;
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
   9. FORMULARIO CON ESCÁNER IA Y AUTO-COMPLETADO
   ========================================== */
function openModalSolicitud(data = null) {
  const modal = document.getElementById('modalSolicitud');
  const form = document.getElementById('formSolicitud');
  const title = document.getElementById('modalSolicitudTitle');
  const ocrBadge = document.getElementById('ocrStatusBadge');

  form.reset();
  clearSelectedFile();
  if (ocrBadge) ocrBadge.classList.add('hidden');

  if (data) {
    title.textContent = `Editar Solicitud (${data.fecha})`;
    document.getElementById('formId').value = data.id;
    document.getElementById('formFecha').value = data.fecha;
    document.getElementById('formSolicitante').value = data.solicitante;
    document.getElementById('formCategoria').value = data.categoria;
    document.getElementById('formMonto').value = data.monto;
    document.getElementById('formDetalle').value = data.detalle;
    document.getElementById('formValidadoPor').value = data.validadoPor || '';
    document.getElementById('formSustentoUrl').value = data.sustentoUrl || '';
    document.getElementById('formSustentoNombre').value = data.sustentoNombre || '';

    const sourceUrl = data.sustentoBase64 || data.sustentoUrl || '';
    if (data.sustentoNombre || sourceUrl) {
      showFilePreviewUI(data.sustentoNombre || 'comprobante.jpg', sourceUrl);
    }

    const itemSolicitanteClean = (data.solicitante || '').toLowerCase().trim();
    const currentEmailClean = (state.currentUserEmail || '').toLowerCase().trim();
    const isOwner = (itemSolicitanteClean === currentEmailClean) && (currentEmailClean !== '');

    ['formFecha', 'formCategoria', 'formMonto', 'formDetalle', 'formValidadoPor'].forEach(fieldId => {
      document.getElementById(fieldId).disabled = !isOwner;
    });

  } else {
    title.textContent = 'Nueva Solicitud de Reembolso';
    document.getElementById('formId').value = '';
    document.getElementById('formFecha').value = new Date().toISOString().split('T')[0];
    document.getElementById('formSolicitante').value = state.currentUserEmail;
    document.getElementById('formValidadoPor').value = '';

    ['formFecha', 'formCategoria', 'formMonto', 'formDetalle', 'formValidadoPor'].forEach(fieldId => {
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
      showFilePreviewUI(newFileName + ' (Adjuntado)', compressedBase64);
      // Adjuntado limpio sin escáner automático
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
      showFilePreviewUI(file.name, e.target.result);
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

function showFilePreviewUI(fileName, sourceUrl = '') {
  document.getElementById('filePreviewName').textContent = fileName;

  const imgElem = document.getElementById('filePreviewThumbnail');
  const pdfIcon = document.getElementById('filePreviewPdfIcon');
  const promptContainer = document.getElementById('fileUploadPrompt');
  const previewContainer = document.getElementById('filePreviewContainer');

  imgElem.classList.add('hidden');
  pdfIcon.classList.add('hidden');

  const driveId = extractGoogleDriveFileId(sourceUrl);
  const displaySrc = driveId ? `https://lh3.googleusercontent.com/d/${driveId}` : sourceUrl;

  if (displaySrc && (displaySrc.startsWith('data:image/') || displaySrc.includes('googleusercontent.com') || displaySrc.match(/\.(jpeg|jpg|png|gif|webp)($|\?)/i))) {
    imgElem.src = displaySrc;
    imgElem.classList.remove('hidden');
  } else if (sourceUrl && (sourceUrl.startsWith('data:application/pdf') || sourceUrl.endsWith('.pdf'))) {
    pdfIcon.classList.remove('hidden');
  } else if (displaySrc) {
    imgElem.src = displaySrc;
    imgElem.classList.remove('hidden');
  } else {
    pdfIcon.classList.remove('hidden');
  }

  if (promptContainer) promptContainer.classList.add('hidden');
  if (previewContainer) previewContainer.classList.remove('hidden');
  lucide.createIcons();
}

function clearSelectedFile() {
  state.selectedFileObject = null;
  document.getElementById('fileInput').value = '';
  document.getElementById('formSustentoUrl').value = '';
  document.getElementById('formSustentoNombre').value = '';
  
  const promptContainer = document.getElementById('fileUploadPrompt');
  const previewContainer = document.getElementById('filePreviewContainer');
  const ocrBadge = document.getElementById('ocrStatusBadge');

  if (promptContainer) promptContainer.classList.remove('hidden');
  if (previewContainer) previewContainer.classList.add('hidden');
  if (ocrBadge) ocrBadge.classList.add('hidden');
}

function generateUniqueId() {
  const fechaStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomHex = Math.floor(1000 + Math.random() * 9000).toString(16).toUpperCase();
  return 'REEM-' + fechaStr + '-' + randomHex;
}

function handleSaveSolicitud(e) {
  e.preventDefault();

  const validadoPorInput = (document.getElementById('formValidadoPor').value || '').trim();
  if (!validadoPorInput) {
    showToast('⚠️ El campo "Validado por (Jefe o Encargado)" es OBLIGATORIO.', 'error');
    document.getElementById('formValidadoPor').focus();
    return;
  }

  const categoria = document.getElementById('formCategoria').value;
  let detalle = (document.getElementById('formDetalle').value || '').trim();
  if (!detalle) {
    detalle = `Gasto de ${categoria}`;
  }

  const monto = parseFloat(document.getElementById('formMonto').value) || 0.00;
  const fecha = document.getElementById('formFecha').value || new Date().toISOString().split('T')[0];
  const monthStr = fecha.slice(0, 7);
  const currentEmailClean = (state.currentUserEmail || '').toLowerCase().trim();

  // VERIFICAR TOPE MENSUAL DE REEMBOLSOS
  let userCurrentMonthSum = 0;
  state.solicitudes.forEach(s => {
    if ((s.solicitante || '').toLowerCase().trim() === currentEmailClean && s.fecha && s.fecha.startsWith(monthStr)) {
      userCurrentMonthSum += (parseFloat(s.monto) || 0);
    }
  });

  const existingId = document.getElementById('formId').value;
  const recordId = (existingId && existingId.trim() !== '') ? existingId.trim() : generateUniqueId();

  // Descontar la versión previa si se está editando la misma solicitud
  const existingItem = state.solicitudes.find(s => s.id === recordId);
  if (existingItem && existingItem.fecha && existingItem.fecha.startsWith(monthStr)) {
    userCurrentMonthSum -= (parseFloat(existingItem.monto) || 0);
  }

  const totalConNueva = userCurrentMonthSum + monto;
  if (totalConNueva > state.monthlyCap) {
    showToast(`⚠️ ALERTA DE TOPE: Con esta solicitud (S/. ${monto.toFixed(2)}) acumulas S/. ${totalConNueva.toFixed(2)} en ${monthStr}, superando tu tope mensual asignado de S/. ${state.monthlyCap.toFixed(2)}.`, 'warning');
  }

  const btnSave = document.getElementById('btnSaveSolicitud');
  btnSave.disabled = true;
  btnSave.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Guardando...`;
  lucide.createIcons();

  const sustentoNombre = state.selectedFileObject 
    ? state.selectedFileObject.fileName 
    : (document.getElementById('formSustentoNombre').value || '');

  const sustentoBase64 = state.selectedFileObject ? state.selectedFileObject.base64Data : '';
  const estadoPrevio = existingItem ? existingItem.estado : 'Pendiente';

  const newRecord = {
    id: recordId,
    fecha: fecha,
    solicitante: currentEmailClean,
    categoria: categoria,
    monto: monto,
    detalle: detalle,
    validadoPor: validadoPorInput,
    sustentoUrl: document.getElementById('formSustentoUrl').value || sustentoBase64 || '',
    sustentoNombre: sustentoNombre,
    sustentoBase64: sustentoBase64,
    estado: estadoPrevio,
    _lastModifiedLocally: Date.now()
  };

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
  showToast('Solicitud guardada correctamente.', 'success');

  btnSave.disabled = false;
  btnSave.innerHTML = `<i data-lucide="save" class="w-4 h-4"></i> Guardar Solicitud`;

  const formData = {
    ...newRecord,
    fileObject: state.selectedFileObject
  };

  fetch(API_URL, {
    method: 'POST',
    mode: 'no-cors',
    body: JSON.stringify({ action: 'saveSolicitud', data: formData })
  });
}

/* ==========================================
   10. MODAL DE VALIDACIÓN Y ARCHIVADO
   ========================================== */
function openModalAprobacion(id) {
  const item = state.solicitudes.find(s => s.id === id);
  if (!item) return;

  state.selectedAprobacionId = id;
  document.getElementById('aprobacionNuevoEstado').value = item.estado || 'Reembolsado';
  document.getElementById('aprobacionValidadoPor').value = item.validadoPor || '';
  document.getElementById('modalAprobacion').classList.remove('hidden');
  lucide.createIcons();
}

function closeModalAprobacion() {
  state.selectedAprobacionId = null;
  document.getElementById('modalAprobacion').classList.add('hidden');
}

function confirmarAprobacion() {
  if (!state.selectedAprobacionId) return;

  const targetId = state.selectedAprobacionId;
  const nuevoEstado = document.getElementById('aprobacionNuevoEstado').value;
  const validadoPor = (document.getElementById('aprobacionValidadoPor').value || '').trim();

  const itemIndex = state.solicitudes.findIndex(s => s.id === targetId);
  if (itemIndex >= 0) {
    state.solicitudes[itemIndex].estado = nuevoEstado;
    state.solicitudes[itemIndex].validadoPor = validadoPor;
    state.solicitudes[itemIndex]._lastModifiedLocally = Date.now();
  }

  localStorage.setItem('acres_cached_solicitudes', JSON.stringify(state.solicitudes));
  updateKPIs();
  applyFilters();

  closeModalAprobacion();
  
  if (nuevoEstado === 'Reembolsado') {
    showToast('Reembolso validado y archivado a Historial (Guardado en Sheets)', 'success');
  } else {
    showToast(`Estado actualizado a: ${nuevoEstado}`, 'info');
  }

  const item = state.solicitudes.find(s => s.id === targetId);
  if (item) {
    fetch(API_URL, {
      method: 'POST',
      mode: 'no-cors',
      body: JSON.stringify({
        action: 'saveSolicitud',
        data: item
      })
    });
  }
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
