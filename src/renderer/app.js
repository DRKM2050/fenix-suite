// Sobrescribir alert y confirm para corregir el bug de pérdida de foco y corregir el título "fnx-admin"
const _originalAlert = window.alert;
window.alert = function (message) {
  if (window.api && window.api.dialog && window.api.dialog.alert) {
    window.api.dialog.alert(message);
  } else {
    _originalAlert(message);
  }
};

const _originalConfirm = window.confirm;
window.confirm = function (message) {
  if (window.api && window.api.dialog && window.api.dialog.confirm) {
    return window.api.dialog.confirm(message);
  } else {
    return _originalConfirm(message);
  }
};

// ==========================================
// CONTROLADOR GENERAL FRONTEND (FNX ADMIN)
// ==========================================

// Estado global de la aplicación
const state = {
  fechaContableActiva: null,
  clienteActivoParaCuentas: null,
  clienteActivoHistorial: null,
  clienteActivoFicha: null,
  clientes: [],
  cuentas: [],
  cambios: [],
  movimientos: [],
  monedas: [],
  relaciones: [],
  tiposTransaccion: [],
  misCuentas: [],
  opciones: {},
  editandoMovimientoId: null
};

// Inicialización al cargar la ventana
document.addEventListener('DOMContentLoaded', async () => {
  inicializarReloj();
  await verificarEstadoSeguridad();
  configurarNavegacion();
  configurarJornadaContable();
  configurarFormularios();
  configurarActualizaciones();
  configurarOnboarding();
  await configurarAjustesYCalculadora();
});

// ==========================================
// SECCIÓN RELOJ Y TIEMPO REAL
// ==========================================
function inicializarReloj() {
  const clockEl = document.getElementById('realClock');
  const dateEl = document.getElementById('realDate');

  const actualizarTime = () => {
    const ahora = new Date();
    clockEl.textContent = ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    dateEl.textContent = ahora.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };

  actualizarTime();
  setInterval(actualizarTime, 1000);
}

// ==========================================
// SECCIÓN SEGURIDAD Y DESBLOQUEO (LOGIN)
// ==========================================
async function verificarEstadoSeguridad() {
  const existePass = await window.api.auth.existePasswordConfigurado();
  const loginTitle = document.getElementById('loginTitle');
  const loginSubtitle = document.getElementById('loginSubtitle');

  if (!existePass) {
    loginTitle.textContent = 'Configurar Clave Maestra';
    loginSubtitle.textContent = 'Establezca una clave inicial para encriptar la base de datos de administración.';
  }

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const passInput = document.getElementById('loginPassword').value;

    if (!existePass) {
      await window.api.auth.inicializarPassword(passInput);
      alert('Clave configurada de forma segura. Accediendo al sistema...');
      document.getElementById('loginModal').classList.add('hidden');
      await arrancarAplicacion();
    } else {
      const valido = await window.api.auth.validarPassword(passInput);
      if (valido) {
        document.getElementById('loginModal').classList.add('hidden');
        await arrancarAplicacion();
      } else {
        alert('Contraseña incorrecta. Intente de nuevo.');
        document.getElementById('loginPassword').value = '';
      }
    }
  });
}

// Función principal al desbloquear la aplicación
async function arrancarAplicacion() {
  await cargarFechaContable();
  await cargarListasBase();
  await cargarOpcionesSistemaYUsuario();
  actualizarDashboard();

  // Alerta de actualización exitosa dinámica
  try {
    const currentVersion = await window.api.updater.getVersion();
    const alertVersion = localStorage.getItem('version_alert_dismissed');
    if (alertVersion !== currentVersion) {
      setTimeout(() => {
        alert(`¡Actualización Exitosa!\n\nFENIX Suite ha sido actualizada correctamente a la versión ${currentVersion}.\n\nMejoras y corrección de bugs aplicadas con éxito.`);
        localStorage.setItem('version_alert_dismissed', currentVersion);
      }, 1000);
    }
  } catch (err) {
    console.error('Error al obtener versión de la app:', err);
  }

  // Buscar actualizaciones automáticamente si está habilitado
  const buscarAuto = (await window.api.opciones.get('buscar_updates_auto')) !== 'false';
  if (buscarAuto) {
    setTimeout(() => {
      window.api.updater.buscarActualizaciones();
    }, 2000);
  }
}

// ==========================================
// SECCIÓN NAVEGACIÓN SPA
// ==========================================
function limpiarFormularioMovimiento() {
  state.editandoMovimientoId = null;
  const form = document.getElementById('formMovimiento');
  if (form) {
    form.reset();
  }
  const seccionEco = document.getElementById('seccionEcommerce');
  if (seccionEco) seccionEco.classList.add('hidden');
  
  const subCtaContainer = document.getElementById('movSubcategoriaOcasionalContainer');
  if (subCtaContainer) subCtaContainer.classList.add('hidden');

  const btnCancelar = document.getElementById('btnCancelarMovimiento');
  if (btnCancelar) btnCancelar.classList.add('hidden');

  // Limpiar el selector de cuenta también
  const selectCta = document.getElementById('movCuenta');
  if (selectCta) selectCta.innerHTML = '<option value="">Seleccione...</option>';
}

function configurarNavegacion() {
  const links = document.querySelectorAll('.nav-link');
  const sections = document.querySelectorAll('.view-section');

  links.forEach(link => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      const targetId = link.getAttribute('data-target');

      // Limpiar el formulario de movimientos al salir
      if (targetId !== 'view-movimientos') {
        limpiarFormularioMovimiento();
      }

      // Limpiar la selección de cuentas al salir de clientes
      if (targetId !== 'view-clientes') {
        resetearSeleccionCuentas();
      }

      // Cambiar clases de navegación activa
      links.forEach(l => {
        l.classList.remove('bg-indigo-600/10', 'text-indigo-400', 'border', 'border-indigo-500/20');
        l.classList.add('text-slate-400', 'hover:text-slate-200', 'hover:bg-slate-900/60');
      });
      link.classList.remove('text-slate-400', 'hover:text-slate-200', 'hover:bg-slate-900/60');
      link.classList.add('bg-indigo-600/10', 'text-indigo-400', 'border', 'border-indigo-500/20');

      // Ocultar y mostrar vistas
      sections.forEach(sec => {
        sec.classList.remove('active');
        if (sec.id === targetId) {
          sec.classList.add('active');
        }
      });

      // Recargas dinámicas al cambiar de sección
      if (targetId === 'view-dashboard') {
        actualizarDashboard();
      } else if (targetId === 'view-movimientos') {
        await cargarListasBase();
        refrescarMovimientos();
      } else if (targetId === 'view-clientes') {
        refrescarClientes();
      } else if (targetId === 'view-cambios') {
        await cargarListasBase();
        refrescarCambios();
      } else if (targetId === 'view-reportes') {
        await cargarListasBase();
        prepararModuloReportes();
      } else if (targetId === 'view-ecommerce') {
        refrescarEcommerceStock();
      } else if (targetId === 'view-gastos') {
        await cargarListasBase();
        refrescarGastosPersonales();
      } else if (targetId === 'view-opciones') {
        await cargarListasBase();
        await cargarOpcionesSistemaYUsuario();
      }
    });
  });
}

function navegarA(targetId) {
  const link = document.querySelector(`.nav-link[data-target="${targetId}"]`);
  if (link) {
    link.click();
  }
}
window.navegarA = navegarA;

// ==========================================
// SECCIÓN COPIAR AL PORTAPAPELES (TOAST)
// ==========================================
function copiarAlPortapapeles(texto) {
  navigator.clipboard.writeText(texto).then(() => {
    const toast = document.getElementById('toastNotification');
    toast.textContent = `Copiado: ${texto}`;
    toast.classList.remove('opacity-0');
    toast.classList.add('opacity-100');
    setTimeout(() => {
      toast.classList.remove('opacity-100');
      toast.classList.add('opacity-0');
    }, 2000);
  }).catch(err => {
    console.error('Error al copiar:', err);
  });
}

function mostrarNotificacionDescarga(filePath) {
  const modal = document.getElementById('downloadNotificationModal');
  const msg = document.getElementById('downloadNotificationMsg');
  const btnOpen = document.getElementById('btnDownloadOpen');
  const btnShowFolder = document.getElementById('btnDownloadShowFolder');
  const btnCopy = document.getElementById('btnDownloadCopyPath');
  const btnClose = document.getElementById('btnDownloadClose');

  if (!modal || !msg) return;

  msg.textContent = filePath;
  modal.classList.remove('hidden');

  // Clonar y reasignar los listeners para evitar acumulaciones
  const newBtnOpen = btnOpen.cloneNode(true);
  btnOpen.parentNode.replaceChild(newBtnOpen, btnOpen);
  newBtnOpen.addEventListener('click', async () => {
    try {
      await window.api.app.openFile(filePath);
    } catch (err) {
      alert('Error al abrir el documento: ' + err.message);
    }
  });

  const newBtnShowFolder = btnShowFolder.cloneNode(true);
  btnShowFolder.parentNode.replaceChild(newBtnShowFolder, btnShowFolder);
  newBtnShowFolder.addEventListener('click', async () => {
    try {
      await window.api.app.showItemInFolder(filePath);
    } catch (err) {
      alert('Error al mostrar en carpeta: ' + err.message);
    }
  });

  const newBtnCopy = btnCopy.cloneNode(true);
  btnCopy.parentNode.replaceChild(newBtnCopy, btnCopy);
  newBtnCopy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(filePath);
      const originalText = newBtnCopy.innerHTML;
      newBtnCopy.innerHTML = `
        <svg class="h-3.5 w-3.5 text-emerald-450" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg> Copiado con éxito
      `;
      setTimeout(() => {
        newBtnCopy.innerHTML = originalText;
      }, 2000);
    } catch (err) {
      alert('Error al copiar la ruta: ' + err.message);
    }
  });

  const newBtnClose = btnClose.cloneNode(true);
  btnClose.parentNode.replaceChild(newBtnClose, btnClose);
  newBtnClose.addEventListener('click', () => {
    modal.classList.add('hidden');
  });
}
window.mostrarNotificacionDescarga = mostrarNotificacionDescarga;

// ==========================================
// CONFIGURACIÓN DE FORMATO DECIMAL / MILES
// ==========================================
function formatearNumeroVisual(numero) {
  return formatearNumeroMoneda(numero, state.opciones.moneda_principal || 'USDT');
}

function formatearNumeroMoneda(numero, moneda) {
  if (numero === undefined || numero === null || isNaN(numero)) {
    return moneda === 'PYG' ? '0' : '0,00';
  }

  let numDecimals = 2; // por defecto
  if (moneda === 'PYG') {
    numDecimals = 0;
  } else if (moneda === 'BTC' || moneda === 'ETH') {
    numDecimals = 6;
  }

  let str = Number(numero).toFixed(numDecimals);

  // Si es crypto, recortar ceros redundantes a la derecha para no tener un valor largo si no es necesario
  if (numDecimals > 2 && str.includes('.')) {
    while (str.endsWith('0') && str.split('.')[1].length > 2) {
      str = str.substring(0, str.length - 1);
    }
  }

  let parts = str.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.'); // Punto para miles
  return parts.join(','); // Coma para decimales
}

function formatearCotizacion(numero) {
  if (numero === undefined || numero === null || isNaN(numero)) return '0,00';
  let str = Number(numero).toFixed(6);
  if (str.includes('.')) {
    // Quitar ceros redundantes a la derecha, manteniendo al menos 2 decimales
    while (str.endsWith('0') && str.split('.')[1].length > 2) {
      str = str.substring(0, str.length - 1);
    }
  }
  let parts = str.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.'); // Punto para miles
  return parts.join(','); // Coma para decimales
}

// ==========================================
// SECCIÓN JORNADA CONTABLE (FECHA COMERCIAL)
// ==========================================
async function cargarFechaContable() {
  const fecha = await window.api.operaciones.getFechaContable();
  state.fechaContableActiva = fecha;

  const badgeColor = document.getElementById('contableBadgeColor');
  const badgeText = document.getElementById('contableBadgeText');
  const dateWrapper = document.getElementById('contableActiveDateWrapper');
  const dateVal = document.getElementById('contableActiveDateVal');
  const btnIniciar = document.getElementById('btnIniciarOperaciones');
  const btnCerrar = document.getElementById('btnCerrarOperaciones');

  if (fecha) {
    badgeColor.className = 'h-3 w-3 rounded-full bg-emerald-500';
    badgeText.textContent = 'JORNADA ABIERTA';
    dateWrapper.classList.remove('hidden');
    dateVal.textContent = formatearFecha(fecha);
    btnIniciar.classList.add('hidden');
    btnCerrar.classList.remove('hidden');
  } else {
    badgeColor.className = 'h-3 w-3 rounded-full bg-rose-500';
    badgeText.textContent = 'JORNADA CERRADA';
    dateWrapper.classList.add('hidden');
    btnIniciar.classList.remove('hidden');
    btnCerrar.classList.add('hidden');
  }
}

function configurarJornadaContable() {
  const modal = document.getElementById('iniciarJornadaModal');

  // Abrir modal personalizado
  document.getElementById('btnIniciarOperaciones').addEventListener('click', () => {
    const hoy = new Date().toISOString().split('T')[0];
    document.getElementById('iniciarJornadaFechaInput').value = hoy;
    modal.classList.remove('hidden');
  });

  document.getElementById('btnCancelarIniciarJornada').addEventListener('click', () => {
    modal.classList.add('hidden');
  });

  document.getElementById('btnConfirmarIniciarJornada').addEventListener('click', async () => {
    const fechaSeleccionada = document.getElementById('iniciarJornadaFechaInput').value;
    if (fechaSeleccionada && /^\d{4}-\d{2}-\d{2}$/.test(fechaSeleccionada)) {
      await window.api.operaciones.iniciarDia(fechaSeleccionada);
      await cargarFechaContable();
      modal.classList.add('hidden');
      alert(`Jornada iniciada para el día: ${fechaSeleccionada}`);
      actualizarDashboard();
    } else {
      alert('Fecha inválida. Seleccione una fecha válida.');
    }
  });

  document.getElementById('btnCerrarOperaciones').addEventListener('click', async () => {
    if (confirm('¿Está seguro de cerrar las operaciones contables del día comercial?')) {
      try {
        await window.api.operaciones.cerrarDia();
        await cargarFechaContable();

        // Sincronización automática a Google Drive si está activa
        if (driveState && driveState.conectado && driveState.autoSync) {
          console.log('Iniciando respaldo automático en la nube...');
          const badge = document.getElementById('driveBadgeEstado');
          if (badge) {
            badge.textContent = 'RESPALDANDO...';
            badge.className = 'px-2 py-0.5 rounded text-[8px] font-bold bg-amber-950 text-amber-400 border border-amber-900';
          }
          await window.api.drive.subirAhora();
          await refrescarDriveEstado();
          alert('Jornada contable cerrada y respaldada en Google Drive con éxito.');
        } else {
          alert('Jornada contable cerrada con éxito.');
        }

        actualizarDashboard();
      } catch (err) {
        alert('Jornada contable cerrada, pero ocurrió un error al subir a la nube: ' + err.message);
        await refrescarDriveEstado();
        actualizarDashboard();
      }
    }
  });
}

// ==========================================
// CARGAR LISTAS Y COMBOS DINÁMICOS
// ==========================================
async function cargarListasBase() {
  state.clientes = await window.api.clientes.listar();
  state.cambios = await window.api.cambios.listar();
  state.monedas = await window.api.monedas.listar();
  state.relaciones = await window.api.relaciones.listar();
  state.tiposTransaccion = await window.api.tiposTransacciones.listar();
  state.misCuentas = await window.api.misCuentas.listar();

  // Moneda principal configurada
  state.opciones.moneda_principal = await window.api.opciones.get('moneda_principal') || 'USDT';
  const labelMonedas = document.querySelectorAll('.text-indigo-400');
  labelMonedas.forEach(lbl => {
    if (lbl.textContent === 'USDT' && lbl.id !== 'lblEmpresaMoneda') {
      lbl.textContent = state.opciones.moneda_principal;
    }
  });

  // Rellenar selects de clientes en movimientos
  const selectMovCli = document.getElementById('movCliente');
  const selectFiltroCli = document.getElementById('filtroCliente');

  selectMovCli.innerHTML = '<option value="">-- Seleccione Cliente --</option>';
  selectFiltroCli.innerHTML = '<option value="">Todos los Clientes</option>';

  state.clientes.filter(c => c.status === 'ACTIVO').forEach(cli => {
    // Nombre sin parentesis de documento para simplificar
    const opt = `<option value="${cli.id_cliente}" data-tipo="${cli.tipo_cliente || ''}">${cli.nombre}</option>`;
    selectMovCli.insertAdjacentHTML('beforeend', opt);
    selectFiltroCli.insertAdjacentHTML('beforeend', opt);
  });

  // Rellenar tipo de transacción
  const selectMovTipo = document.getElementById('movTipo');
  const selectFiltroTipo = document.getElementById('filtroTipo');
  const selectHistTipo = document.getElementById('histTipo');
  selectMovTipo.innerHTML = '<option value="">Seleccione...</option>';
  selectFiltroTipo.innerHTML = '<option value="">Seleccione...</option>';
  if (selectHistTipo) selectHistTipo.innerHTML = '<option value="">Seleccione...</option>';

  state.tiposTransaccion.forEach(t => {
    selectMovTipo.insertAdjacentHTML('beforeend', `<option value="${t.nombre}">${t.nombre}</option>`);
    selectFiltroTipo.insertAdjacentHTML('beforeend', `<option value="${t.nombre}">${t.nombre}</option>`);
    if (selectHistTipo) selectHistTipo.insertAdjacentHTML('beforeend', `<option value="${t.nombre}">${t.nombre}</option>`);
  });

  // Rellenar monedas (Sigla limpia únicamente)
  const selectMovMoneda = document.getElementById('movMoneda');
  const selectEcoMoneda = document.getElementById('ecoMoneda');
  const selectCtaMoneda = document.getElementById('cuentaMoneda');
  const selectGastoMoneda = document.getElementById('gastoMoneda');
  const selectMiCuentaMoneda = document.getElementById('miCuentaMoneda');
  const selectNewCtaMoneda = document.getElementById('movNewCtaMoneda');
  const selectEcoProdMoneda = document.getElementById('ecoProductoMonedaCosto');

  selectMovMoneda.innerHTML = '<option value="">Seleccione...</option>';
  selectEcoMoneda.innerHTML = '<option value="">Seleccione...</option>';
  selectCtaMoneda.innerHTML = '<option value="">Seleccione...</option>';
  selectGastoMoneda.innerHTML = '<option value="">Seleccione...</option>';
  selectMiCuentaMoneda.innerHTML = '<option value="">Seleccione...</option>';
  selectNewCtaMoneda.innerHTML = '<option value="">Seleccione...</option>';
  if (selectEcoProdMoneda) selectEcoProdMoneda.innerHTML = '<option value="">Seleccione...</option>';

  state.monedas.filter(m => m.status === 'ACTIVO').forEach(m => {
    const optionHTML = `<option value="${m.siglas}">${m.siglas}</option>`;
    selectMovMoneda.insertAdjacentHTML('beforeend', optionHTML);
    selectEcoMoneda.insertAdjacentHTML('beforeend', optionHTML);
    selectCtaMoneda.insertAdjacentHTML('beforeend', optionHTML);
    selectGastoMoneda.insertAdjacentHTML('beforeend', optionHTML);
    selectMiCuentaMoneda.insertAdjacentHTML('beforeend', optionHTML);
    selectNewCtaMoneda.insertAdjacentHTML('beforeend', optionHTML);
    if (selectEcoProdMoneda) selectEcoProdMoneda.insertAdjacentHTML('beforeend', optionHTML);
  });

  // Rellenar par de divisas en Tasas de Cambio
  const selectCambioPar = document.getElementById('cambioPar');
  selectCambioPar.innerHTML = '<option value="">Seleccione...</option>';
  state.relaciones.forEach(r => {
    const value = `${r.moneda_origen}/${r.moneda_destino}`;
    selectCambioPar.insertAdjacentHTML('beforeend', `<option value="${value}">${value}</option>`);
  });

  // Rellenar lista de productos
  await refrescarEcoProductos();

  // Rellenar selects de mis cuentas
  const selectGastoMiCta = document.getElementById('gastoMiCuenta');
  selectGastoMiCta.innerHTML = '<option value="">Seleccione...</option>';
  state.misCuentas.filter(c => c.status === 'ACTIVO').forEach(c => {
    selectGastoMiCta.insertAdjacentHTML('beforeend', `<option value="${c.id_mi_cuenta}" data-moneda="${c.moneda}">${c.nombre_cuenta} (${c.moneda})</option>`);
  });

  const gastosMiCtaId = await window.api.opciones.get('cuenta_gastos_personales_id') || null;
  if (gastosMiCtaId) {
    selectGastoMiCta.value = gastosMiCtaId;
    const ctaGastos = state.misCuentas.find(c => c.id_mi_cuenta == gastosMiCtaId);
    if (ctaGastos) {
      document.getElementById('gastoMoneda').value = ctaGastos.moneda;
    }
  }
}

// ==========================================
// GESTIÓN CLIENTES Y CUENTAS
// ==========================================
async function refrescarClientes() {
  state.clientes = await window.api.clientes.listar();
  const tabla = document.getElementById('tablaClientes');
  tabla.innerHTML = '';

  state.clientes.forEach(cli => {
    const isActivo = cli.status !== 'INACTIVO';
    const badgeClass = isActivo ? 'bg-indigo-900/40 text-indigo-400' : 'bg-slate-800 text-slate-500';

    const trHTML = `
      <tr class="border-b border-slate-900 hover:bg-slate-900/40 cursor-pointer" onclick="seleccionarClienteFila(${cli.id_cliente}, '${cli.nombre.replace(/'/g, "\\'")}')">
        <td class="p-3 font-semibold text-slate-200 hover:text-indigo-400 transition" onclick="event.stopPropagation(); abrirOpcionesCliente(${cli.id_cliente}, '${cli.nombre.replace(/'/g, "\\'")}')">${cli.nombre}</td>
        <td class="p-3 font-mono hover:text-indigo-400 cursor-pointer hover:underline transition" onclick="event.stopPropagation(); copiarAlPortapapeles('${cli.documento}')" title="Haga clic para copiar">${cli.documento}</td>
        <td class="p-3 text-slate-400">${cli.tipo_cliente || 'OCASIONAL'}</td>
        <td class="p-3 text-slate-400">${cli.telefono || '--'}</td>
        <td class="p-3 text-slate-400">${cli.mail || '--'}</td>
        <td class="p-3">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold ${badgeClass}">${cli.status || 'ACTIVO'}</span>
        </td>
        <td class="p-3 text-center flex justify-center gap-2" onclick="event.stopPropagation();">
          <button onclick="verHistorialCliente(${cli.id_cliente}, '${cli.nombre.replace(/'/g, "\\'")}')" class="text-sky-400 hover:text-sky-300 font-semibold">Historial</button>
          <button onclick="editarCliente(${cli.id_cliente})" class="text-indigo-400 hover:text-indigo-300 font-semibold">Editar</button>
          <button onclick="eliminarCliente(${cli.id_cliente})" class="text-rose-500 hover:text-rose-455 font-semibold">Borrar</button>
        </td>
      </tr>
    `;
    tabla.insertAdjacentHTML('beforeend', trHTML);
  });
}

// Cargar cliente tanto en su formulario de edición como en sus cuentas
async function seleccionarClienteFila(idCliente, nombreCliente) {
  const cliente = state.clientes.find(c => c.id_cliente === idCliente);
  if (!cliente) return;

  document.getElementById('clienteId').value = cliente.id_cliente;
  document.getElementById('clienteNombre').value = cliente.nombre;
  document.getElementById('clienteDocumento').value = cliente.documento;
  document.getElementById('clienteTipo').value = cliente.tipo_cliente;
  document.getElementById('clienteTelefono').value = cliente.telefono;
  document.getElementById('clienteMail').value = cliente.mail;
  document.getElementById('clienteStatus').value = cliente.status || 'ACTIVO';
  document.getElementById('clienteObservaciones').value = cliente.observaciones;

  // Cargar cuentas
  state.clienteActivoParaCuentas = idCliente;
  document.getElementById('cuentaClienteActivo').textContent = nombreCliente;
  document.getElementById('formCuenta').classList.remove('hidden');
  document.getElementById('cuentaId').value = '';
  document.getElementById('btnCancelarCuenta').classList.add('hidden');
  await refrescarCuentas(idCliente);
}
window.seleccionarClienteFila = seleccionarClienteFila;

// Modales de interacción
function abrirOpcionesCliente(idCliente, nombreCliente) {
  const modal = document.getElementById('clientOptionsModal');
  document.getElementById('clientOptionsTitle').textContent = `Opciones de ${nombreCliente}`;

  const btnVerFicha = document.getElementById('btnOptVerFicha');
  btnVerFicha.onclick = () => {
    modal.classList.add('hidden');
    verFichaCliente(idCliente);
  };

  const btnNuevaTransaccion = document.getElementById('btnOptNuevaTransaccion');
  btnNuevaTransaccion.onclick = () => {
    modal.classList.add('hidden');
    document.querySelector('.nav-link[data-target="view-movimientos"]').click();
    setTimeout(() => {
      const selectMovCli = document.getElementById('movCliente');
      if (selectMovCli) {
        selectMovCli.value = idCliente;
        selectMovCli.dispatchEvent(new Event('change'));
      }
    }, 150);
  };

  modal.classList.remove('hidden');
}
window.abrirOpcionesCliente = abrirOpcionesCliente;

function abrirOpcionesCuenta(idCuenta, nombreCuenta, idCliente, nombreCliente) {
  const modal = document.getElementById('accountOptionsModal');
  document.getElementById('accountOptionsTitle').textContent = `Opciones de Cuenta: ${nombreCuenta}`;

  const btnOptCtaNuevaTransaccion = document.getElementById('btnOptCtaNuevaTransaccion');
  btnOptCtaNuevaTransaccion.onclick = () => {
    modal.classList.add('hidden');
    document.querySelector('.nav-link[data-target="view-movimientos"]').click();
    setTimeout(async () => {
      const selectMovCli = document.getElementById('movCliente');
      if (selectMovCli) {
        selectMovCli.value = idCliente;
        await selectMovCli.dispatchEvent(new Event('change'));

        setTimeout(() => {
          const selectMovCta = document.getElementById('movCuenta');
          if (selectMovCta) {
            selectMovCta.value = idCuenta;
            selectMovCta.dispatchEvent(new Event('change'));
          }
        }, 200);
      }
    }, 150);
  };

  modal.classList.remove('hidden');
}
window.abrirOpcionesCuenta = abrirOpcionesCuenta;

// Ficha detallada del cliente en modal
async function verFichaCliente(idCliente) {
  const cli = state.clientes.find(c => c.id_cliente === idCliente);
  if (!cli) return;

  document.getElementById('fichaClienteNombre').textContent = cli.nombre;
  document.getElementById('fichaClienteDocumento').textContent = cli.documento;
  document.getElementById('fichaClienteTipo').textContent = cli.tipo_cliente || 'OCASIONAL';
  document.getElementById('fichaClienteTelefono').textContent = cli.telefono || '--';
  document.getElementById('fichaClienteMail').textContent = cli.mail || '--';
  document.getElementById('fichaClienteStatus').textContent = cli.status || 'ACTIVO';
  document.getElementById('fichaClienteFecha').textContent = new Date(cli.timestamp).toLocaleString('es-ES');
  document.getElementById('fichaClienteObservaciones').textContent = cli.observaciones || '-- Ninguna anotación adicional --';

  document.getElementById('clienteFichaModal').classList.remove('hidden');
}

window.verFichaCliente = verFichaCliente;

// Resetear y limpiar el panel de cuentas de cliente
function resetearSeleccionCuentas() {
  state.clienteActivoParaCuentas = null;
  document.getElementById('cuentaClienteActivo').textContent = 'Seleccione un cliente';
  document.getElementById('formCuenta').classList.add('hidden');
  document.getElementById('formCuenta').reset();
  document.getElementById('cuentaId').value = '';
  document.getElementById('btnCancelarCuenta').classList.add('hidden');
  document.getElementById('tablaCuentas').innerHTML = `
    <tr>
      <td colspan="5" class="p-4 text-center text-slate-500">Seleccione un cliente para ver y gestionar sus cuentas</td>
    </tr>
  `;
}

async function seleccionarClienteParaCuentas(idCliente, nombreCliente) {
  state.clienteActivoParaCuentas = idCliente;
  document.getElementById('cuentaClienteActivo').textContent = nombreCliente;
  document.getElementById('formCuenta').classList.remove('hidden');
  document.getElementById('cuentaId').value = '';
  document.getElementById('btnCancelarCuenta').classList.add('hidden');
  await refrescarCuentas(idCliente);
}

window.seleccionarClienteParaCuentas = seleccionarClienteParaCuentas;

async function refrescarCuentas(idCliente) {
  const cuentas = await window.api.cuentas.listar(idCliente);
  const tabla = document.getElementById('tablaCuentas');
  tabla.innerHTML = '';

  if (cuentas.length === 0) {
    tabla.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-500">No hay cuentas bancarias/wallets para este cliente. Añada una arriba.</td></tr>`;
    return;
  }

  cuentas.forEach(cta => {
    const isActivo = cta.status !== 'INACTIVO';
    const badgeClass = isActivo ? 'bg-emerald-950 text-emerald-400 border border-emerald-900' : 'bg-slate-900 text-slate-500 border border-slate-800';
    const refText = cta.referencia || '--';
    const clientName = state.clientes.find(c => c.id_cliente === idCliente)?.nombre || '';
    const tr = `
      <tr class="border-b border-slate-900 hover:bg-slate-900/40 cursor-pointer" onclick="cargarEditarCuenta(${cta.id_cuenta})">
        <td class="p-3 font-semibold text-slate-200">
          <div class="hover:text-indigo-400 transition" onclick="event.stopPropagation(); abrirOpcionesCuenta(${cta.id_cuenta}, '${cta.nombre_cuenta.replace(/'/g, "\\'")}', ${idCliente}, '${clientName.replace(/'/g, "\\'")}')">${cta.nombre_cuenta}</div>
          <div class="text-[9px] text-slate-500">${cta.tipo_cuenta}</div>
        </td>
        <td class="p-3"><span class="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-350 font-bold">${cta.moneda}</span></td>
        <td class="p-3 font-mono hover:text-indigo-400 cursor-pointer hover:underline transition" onclick="event.stopPropagation(); copiarAlPortapapeles('${refText}')" title="Haga clic para copiar">${refText}</td>
        <td class="p-3"><span class="px-1.5 py-0.5 rounded text-[9px] font-bold ${badgeClass}">${cta.status || 'ACTIVO'}</span></td>
        <td class="p-3 text-center flex justify-center gap-2" onclick="event.stopPropagation();">
          <button onclick="cargarEditarCuenta(${cta.id_cuenta})" class="text-indigo-400 hover:text-indigo-300 font-semibold text-xs">Editar</button>
          <button onclick="eliminarCuenta(${cta.id_cuenta})" class="text-rose-500 hover:text-rose-455 font-semibold text-xs">Eliminar</button>
        </td>
      </tr>
    `;
    tabla.insertAdjacentHTML('beforeend', tr);
  });
}

window.refrescarCuentas = refrescarCuentas;

// Cargar cuenta para editar en el formulario lateral
async function cargarEditarCuenta(idCuenta) {
  const cuentas = await window.api.cuentas.listar(state.clienteActivoParaCuentas);
  const cta = cuentas.find(c => c.id_cuenta === idCuenta);
  if (!cta) return;

  document.getElementById('cuentaId').value = cta.id_cuenta;
  document.getElementById('cuentaNombre').value = cta.nombre_cuenta;
  document.getElementById('cuentaTipo').value = cta.tipo_cuenta;
  document.getElementById('cuentaMoneda').value = cta.moneda;
  document.getElementById('cuentaReferencia').value = cta.referencia || '';
  document.getElementById('cuentaObservaciones').value = cta.observaciones || '';
  document.getElementById('cuentaStatus').value = cta.status || 'ACTIVO';

  document.getElementById('btnCancelarCuenta').classList.remove('hidden');
  document.getElementById('cuentaNombre').focus();
}

window.cargarEditarCuenta = cargarEditarCuenta;

// ==========================================
// MODAL HISTORIAL TRANSACCIONAL DE CLIENTE
// ==========================================
async function verHistorialCliente(idCliente, nombreCliente) {
  state.clienteActivoHistorial = idCliente;
  document.getElementById('historialClienteNombre').textContent = nombreCliente;
  document.getElementById('histFechaInicio').value = '';
  document.getElementById('histFechaFin').value = '';
  document.getElementById('histTipo').value = '';

  // Rellenar tipos en modal historial
  const selectHistTipo = document.getElementById('histTipo');
  selectHistTipo.innerHTML = '<option value="">Todos los Tipos</option>';
  state.tiposTransaccion.forEach(t => {
    selectHistTipo.insertAdjacentHTML('beforeend', `<option value="${t.nombre}">${t.nombre}</option>`);
  });

  document.getElementById('clienteHistorialModal').classList.remove('hidden');
  await cargarHistorialCliente();
}

window.verHistorialCliente = verHistorialCliente;

async function cargarHistorialCliente() {
  const idCliente = state.clienteActivoHistorial;
  if (!idCliente) return;

  const filtros = {
    id_cliente: idCliente,
    fecha_inicio: document.getElementById('histFechaInicio').value || null,
    fecha_fin: document.getElementById('histFechaFin').value || null,
    tipo_transaccion: document.getElementById('histTipo').value || null
  };

  const movimientos = await window.api.movimientos.listar(filtros);
  const tbody = document.getElementById('tablaHistorialCliente');
  tbody.innerHTML = '';

  let totalCompras = 0.0;
  let totalVentas = 0.0;

  if (movimientos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-500">No hay movimientos registrados.</td></tr>`;
    document.getElementById('histTotalCompras').textContent = `0,00 ${state.opciones.moneda_principal}`;
    document.getElementById('histTotalVentas').textContent = `0,00 ${state.opciones.moneda_principal}`;
    return;
  }

  movimientos.forEach(m => {
    let valorUSDT = m.monto;
    if (m.moneda !== state.opciones.moneda_principal) {
      valorUSDT = m.monto * m.valor_cambio;
    }

    if (m.tipo_transaccion.includes('COMPRA') || m.tipo_transaccion.includes('GASTO')) {
      totalCompras += valorUSDT;
    } else if (m.tipo_transaccion.includes('VENTA')) {
      totalVentas += valorUSDT;
    }

    const tr = `
      <tr class="border-b border-slate-800 hover:bg-slate-900/30">
        <td class="p-3 text-slate-400">#${m.id_movimiento}</td>
        <td class="p-3">${formatearFecha(m.fecha_contable)}</td>
        <td class="p-3 text-indigo-400 font-semibold">${m.cuenta_nombre}</td>
        <td class="p-3">
          <span class="px-1.5 py-0.5 rounded text-[9px] font-bold ${m.tipo_transaccion.includes('COMPRA') ? 'bg-emerald-950 text-emerald-400' :
        m.tipo_transaccion.includes('VENTA') ? 'bg-sky-950 text-sky-400' :
          'bg-slate-800 text-slate-400'
      }">${m.tipo_transaccion}</span>
        </td>
        <td class="p-3 text-right font-bold text-slate-100 whitespace-nowrap truncate max-w-[130px]" title="${formatearNumeroMoneda(m.monto, m.moneda)} ${m.moneda}">${formatearNumeroMoneda(m.monto, m.moneda)} ${m.moneda}</td>
        <td class="p-3">${m.concepto}</td>
      </tr>
    `;
    tbody.insertAdjacentHTML('beforeend', tr);
  });

  document.getElementById('histTotalCompras').textContent = `${formatearNumeroVisual(totalCompras)} ${state.opciones.moneda_principal}`;
  document.getElementById('histTotalVentas').textContent = `${formatearNumeroVisual(totalVentas)} ${state.opciones.moneda_principal}`;
}

// ==========================================
// TASAS DE COTIZACIÓN
// ==========================================
async function refrescarCambios() {
  state.cambios = await window.api.cambios.listar();

  // 1. Renderizar la tabla de historial
  const tabla = document.getElementById('tablaCambios');
  if (tabla) {
    tabla.innerHTML = '';
    state.cambios.forEach(cam => {
      const tr = `
        <tr class="border-b border-slate-900 hover:bg-slate-900/20">
          <td class="p-2">${formatearFecha(cam.fecha_contable)}</td>
          <td class="p-2 font-bold text-indigo-400 text-xs">${cam.par_divisa}</td>
          <td class="p-2 text-right text-emerald-455 font-semibold font-mono">${formatearCotizacion(cam.valor_compra)}</td>
          <td class="p-2 text-right text-rose-500 font-semibold font-mono">${formatearCotizacion(cam.valor_venta)}</td>
          <td class="p-2 text-center">
            <button onclick="cargarEditarCambio(${cam.id_cambio}, '${cam.par_divisa}', ${cam.valor_compra}, ${cam.valor_venta})" class="text-indigo-400 hover:text-indigo-300 text-[10px] mr-1.5">Editar</button>
            <button onclick="eliminarCambio(${cam.id_cambio})" class="text-rose-500 hover:text-rose-455 text-[10px]">Borrar</button>
          </td>
        </tr>
      `;
      tabla.insertAdjacentHTML('beforeend', tr);
    });
  }

  // 2. Renderizar la grilla de cotizaciones activas (el último valor por par de divisas)
  const gridCot = document.getElementById('gridCotizacionesActivas');
  if (gridCot) {
    gridCot.innerHTML = '';

    const cotizacionesActivas = {};
    const cambiosOrdenados = [...state.cambios].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    cambiosOrdenados.forEach(cam => {
      if (!cotizacionesActivas[cam.par_divisa]) {
        cotizacionesActivas[cam.par_divisa] = cam;
      }
    });

    const paresRegistrados = Object.values(cotizacionesActivas);
    if (paresRegistrados.length === 0) {
      gridCot.innerHTML = `<div class="p-3 text-center text-xs text-slate-500 bg-slate-900/40 rounded-xl">Sin cotizaciones cargadas.</div>`;
    } else {
      paresRegistrados.forEach(c => {
        const fechaStr = new Date(c.timestamp).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        gridCot.insertAdjacentHTML('beforeend', `
          <div class="p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl flex justify-between items-center hover:bg-slate-900/90 transition shadow-inner">
            <div>
              <span class="text-[14px] text-slate-400 font-bold block uppercase tracking-wider">${c.par_divisa}</span>
              <div class="flex items-baseline gap-1.5 mt-1">
                <span class="text-[12px] text-emerald-450 font-semibold">C:</span>
                <span class="text-[13px] font-black text-emerald-400 font-mono">${formatearCotizacion(c.valor_compra)}</span>
                <span class="text-[12px] text-rose-500 font-semibold ml-1">V:</span>
                <span class="text-[13px] font-black text-rose-455 font-mono">${formatearCotizacion(c.valor_venta)}</span>
              </div>
            </div>
            <div class="text-right">
              <span class="text-[12px] text-slate-500 italic block mt-0.5">${fechaStr}</span>
            </div>
          </div>
        `);
      });
    }
  }
}

function cargarEditarCambio(id, par, compra, venta) {
  document.getElementById('cambioId').value = id;
  document.getElementById('cambioPar').value = par;
  document.getElementById('cambioCompra').value = compra;
  document.getElementById('cambioVenta').value = venta;
  document.getElementById('btnCancelarCambio').classList.remove('hidden');
  document.getElementById('btnGuardarCambio').textContent = 'Actualizar';
}
window.cargarEditarCambio = cargarEditarCambio;

async function eliminarCambio(id) {
  if (confirm('¿Está seguro de eliminar esta cotización?')) {
    await window.api.cambios.eliminar(id);
    await cargarListasBase();
    await refrescarCambios();
  }
}
window.eliminarCambio = eliminarCambio;

// ==========================================
// SECCIÓN MOVIMIENTOS
// ==========================================
async function refrescarMovimientos(filtros = {}) {
  if (!filtros.fecha_inicio && state.fechaContableActiva) {
    filtros.fecha_inicio = state.fechaContableActiva;
    document.getElementById('filtroFecha').value = state.fechaContableActiva;
  }

  let movimientos = await window.api.movimientos.listar(filtros);
  state.movimientos = movimientos;

  // Filtrado Global en Memoria si aplica
  const queryGlobal = document.getElementById('filtroBuscarGlobal').value.toLowerCase().trim();
  if (queryGlobal) {
    movimientos = movimientos.filter(m =>
      (m.concepto || '').toLowerCase().includes(queryGlobal) ||
      (m.observaciones || '').toLowerCase().includes(queryGlobal) ||
      (m.producto || '').toLowerCase().includes(queryGlobal) ||
      (m.cliente_nombre || '').toLowerCase().includes(queryGlobal) ||
      (m.cuenta_nombre || '').toLowerCase().includes(queryGlobal) ||
      m.id_movimiento.toString() === queryGlobal
    );
  }

  const tabla = document.getElementById('tablaMovimientos');
  tabla.innerHTML = '';

  if (movimientos.length === 0) {
    tabla.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-slate-500">No hay movimientos registrados.</td></tr>`;
    return;
  }

  movimientos.forEach(m => {
    const esEco = m.tipo_transaccion.startsWith('ECOMMERCE');

    // Configuración visual de fecha comercial vs timestamp real
    let fechaContableContent = formatearFecha(m.fecha_contable);
    const dateReal = new Date(m.timestamp).toISOString().split('T')[0];
    if (m.fecha_contable !== dateReal) {
      fechaContableContent += `<div class="text-[9px] text-amber-500 font-bold mt-0.5">${formatearFecha(dateReal)}</div>`;
    } else {
      const horaReal = new Date(m.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      fechaContableContent += `<div class="text-[9px] text-amber-500/80 font-bold mt-0.5">${horaReal} hs</div>`;
    }

    const esIngreso = m.tipo_categoria === 'INGRESO';
    const esPendiente = m.status_operacion === 'PENDIENTE';
    const rowClass = esPendiente 
      ? 'border-b border-slate-900/40 bg-rose-950/10 hover:bg-rose-950/15 border-l-4 border-l-rose-500 transition duration-150' 
      : 'border-b border-slate-900 hover:bg-slate-900/30 transition duration-150';

    let conceptoHtml = `<div class="font-medium text-slate-300 flex items-center gap-1.5">${m.concepto}`;
    if (m.subcategoria_ocasional) {
      conceptoHtml += ` <span class="px-1.5 py-0.5 rounded text-[8px] font-bold bg-indigo-900/40 text-indigo-300 border border-indigo-500/20 uppercase tracking-wider">${m.subcategoria_ocasional}</span>`;
    }
    if (esPendiente) {
      conceptoHtml += ` <span class="px-1.5 py-0.5 rounded text-[8px] font-bold bg-rose-900/40 text-rose-300 border border-rose-500/20 uppercase tracking-wider">Pendiente</span>`;
    }
    conceptoHtml += '</div>';

    const tr = `
      <tr class="${rowClass}">
        <td class="p-3 font-bold text-slate-400">#${m.id_movimiento}</td>
        <td class="p-3">${fechaContableContent}</td>
        <td class="p-3">
          <div class="font-semibold text-slate-200">${m.cliente_nombre || 'N/A'}</div>
          <div class="text-[10px] text-indigo-400">${m.cuenta_nombre || 'N/A'}</div>
        </td>
        <td class="p-3">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold ${esIngreso ? 'bg-emerald-950 text-emerald-400 border border-emerald-900' : 'bg-rose-955 text-rose-455 border border-rose-900'
      }">${m.tipo_transaccion}</span>
        </td>
        <td class="p-3 text-right whitespace-nowrap truncate max-w-[150px]" title="${esIngreso ? '+' : '-'}${formatearNumeroMoneda(m.monto, m.moneda)} ${m.moneda}">
          <div class="font-bold ${esIngreso ? 'text-emerald-450' : 'text-rose-500'}">${esIngreso ? '+' : '-'}${formatearNumeroMoneda(m.monto, m.moneda)} ${m.moneda}</div>
          <div class="text-[9px] text-slate-500" title="Tasa: ${formatearCotizacion(m.valor_cambio)}">Tasa: ${formatearCotizacion(m.valor_cambio)}</div>
        </td>
        <td class="p-3">
          ${conceptoHtml}
          ${esEco ? `<div class="text-[10px] text-indigo-400 font-semibold">[Logística] ${m.producto} (${m.cantidad_eco || 1} uds) | Costo original cargado</div>` : ''}
          ${m.observaciones ? `<div class="text-[10px] text-slate-500 italic mt-0.5">${m.observaciones}</div>` : ''}
        </td>
        <td class="p-3 text-center flex justify-center items-center gap-2">
          ${esPendiente ? `<button onclick="liquidarMovimiento(${m.id_movimiento})" class="text-emerald-400 hover:text-emerald-300 text-xs font-semibold mr-1" title="Liquidar / Desmarcar Pendiente">✓ Liquidar</button>` : ''}
          <button onclick="cargarEditarMovimiento(${m.id_movimiento})" class="text-indigo-455 hover:text-indigo-355 text-xs font-semibold">Editar</button>
          <button onclick="eliminarMovimiento(${m.id_movimiento})" class="text-rose-500 hover:text-rose-455 text-xs font-semibold">Eliminar</button>
        </td>
      </tr>
    `;
    tabla.insertAdjacentHTML('beforeend', tr);
  });
}

// Cargar movimiento para editar en el formulario lateral
async function cargarEditarMovimiento(idMovimiento) {
  const mov = state.movimientos.find(m => m.id_movimiento === idMovimiento);
  if (!mov) return;

  state.editandoMovimientoId = idMovimiento;

  document.getElementById('movCliente').value = mov.id_cliente || '';
  // Cargar cuentas del cliente primero
  const selectCta = document.getElementById('movCuenta');
  selectCta.innerHTML = '<option value="">-- Seleccione Cuenta --</option>';
  if (mov.id_cliente) {
    const cuentas = await window.api.cuentas.listar(mov.id_cliente);
    cuentas.forEach(c => {
      selectCta.insertAdjacentHTML('beforeend', `<option value="${c.id_cuenta}" data-moneda="${c.moneda}">${c.nombre_cuenta} (${c.moneda})</option>`);
    });
  } else {
    // Si no tiene cliente, es cuenta propia
    state.misCuentas.forEach(c => {
      selectCta.insertAdjacentHTML('beforeend', `<option value="${c.id_mi_cuenta}" data-moneda="${c.moneda}">${c.nombre_cuenta} (${c.moneda})</option>`);
    });
  }
  selectCta.value = mov.id_cuenta;

  document.getElementById('movTipo').value = mov.tipo_transaccion;
  document.getElementById('movMonto').value = mov.monto;
  document.getElementById('movMoneda').value = mov.moneda;
  document.getElementById('movModalidadCambio').value = mov.modalidad_cambio;
  document.getElementById('movValorCambio').value = mov.valor_cambio;
  document.getElementById('movConcepto').value = mov.concepto;
  document.getElementById('movObservaciones').value = mov.observaciones || '';

  // Setear pendiente y subcategoría ocasional
  document.getElementById('movEsPendiente').checked = (mov.status_operacion === 'PENDIENTE');
  document.getElementById('movSubcategoriaOcasional').value = mov.subcategoria_ocasional || '';
  
  const selectedOpt = document.getElementById('movCliente').options[document.getElementById('movCliente').selectedIndex];
  const esOcasional = selectedOpt ? (selectedOpt.getAttribute('data-tipo') === 'OCASIONAL' || selectedOpt.text.includes('OCASIONAL')) : false;
  const subCtaContainer = document.getElementById('movSubcategoriaOcasionalContainer');
  if (esOcasional) {
    subCtaContainer.classList.remove('hidden');
  } else {
    subCtaContainer.classList.add('hidden');
  }

  // E-commerce seccion
  const seccionEco = document.getElementById('seccionEcommerce');
  if (mov.tipo_transaccion.startsWith('ECOMMERCE')) {
    seccionEco.classList.remove('hidden');
    document.getElementById('ecoProducto').value = mov.producto || '';
    document.getElementById('ecoMonto').value = mov.monto_eco || 0;
    document.getElementById('ecoMoneda').value = mov.moneda_eco || 'USD';
    document.getElementById('ecoCambio').value = mov.cambio_aplicado || 1;
  } else {
    seccionEco.classList.add('hidden');
  }

  document.getElementById('btnCancelarMovimiento').classList.remove('hidden');
  document.getElementById('btnGuardarMovimiento').textContent = 'Actualizar Movimiento';
  document.getElementById('movMonto').focus();
}
window.cargarEditarMovimiento = cargarEditarMovimiento;

// ==========================================
// MÓDULO E-COMMERCE (DEDICADO)
// ==========================================
async function refrescarEcommerceStock() {
  const todos = await window.api.movimientos.listar({});
  const ecoMovs = todos.filter(m => m.tipo_transaccion.startsWith('ECOMMERCE'));

  // Kpis
  let volCompra = 0.0;
  let volVenta = 0.0;
  let cantCompra = 0;
  let cantVenta = 0;

  ecoMovs.forEach(m => {
    if (m.status_operacion === 'PENDIENTE') return;
    
    let valorUSDT = m.monto;
    if (m.moneda !== state.opciones.moneda_principal) {
      if (m.moneda === 'PYG' || m.moneda === 'ARS') {
        valorUSDT = m.monto / m.valor_cambio;
      } else {
        valorUSDT = m.monto * m.valor_cambio;
      }
    }
    if (m.tipo_transaccion === 'ECOMMERCE / COMPRA') {
      volCompra += valorUSDT;
      cantCompra++;
    } else if (m.tipo_transaccion === 'ECOMMERCE / VENTA') {
      volVenta += valorUSDT;
      cantVenta++;
    }
  });

  const rentabilidad = volVenta - volCompra;

  document.getElementById('ecoKpiVolCompra').textContent = `${formatearNumeroVisual(volCompra)} ${state.opciones.moneda_principal}`;
  document.getElementById('ecoKpiCantCompra').textContent = `${cantCompra} transacciones de compra`;

  document.getElementById('ecoKpiVolVenta').textContent = `${formatearNumeroVisual(volVenta)} ${state.opciones.moneda_principal}`;
  document.getElementById('ecoKpiCantVenta').textContent = `${cantVenta} transacciones de venta`;

  document.getElementById('ecoKpiRentabilidad').textContent = `${formatearNumeroVisual(rentabilidad)} ${state.opciones.moneda_principal}`;
  if (rentabilidad >= 0) {
    document.getElementById('ecoKpiRentabilidad').className = 'text-2xl font-bold text-indigo-400';
  } else {
    document.getElementById('ecoKpiRentabilidad').className = 'text-2xl font-bold text-rose-500';
  }

  // Listar logistica
  dibujarTablaEcommerce(ecoMovs);

  // Buscador
  document.getElementById('ecoBuscadorProducto').addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    const filtrados = ecoMovs.filter(m => (m.producto || '').toLowerCase().includes(query));
    dibujarTablaEcommerce(filtrados);
  });
}

function dibujarTablaEcommerce(movs) {
  const tbody = document.getElementById('tablaEcommerceLogistica');
  tbody.innerHTML = '';

  if (movs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-slate-500">No hay movimientos logísticos registrados en E-Commerce.</td></tr>`;
    return;
  }

  movs.forEach(m => {
    let equivalenteUSDT = m.monto;
    if (m.moneda !== state.opciones.moneda_principal) {
      if (m.moneda === 'PYG' || m.moneda === 'ARS') {
        equivalenteUSDT = m.monto / m.valor_cambio;
      } else {
        equivalenteUSDT = m.monto * m.valor_cambio;
      }
    }
    const esCompra = m.tipo_transaccion.includes('COMPRA');
    const tr = `
      <tr class="border-b border-slate-900 hover:bg-slate-900/30">
        <td class="p-3 font-bold text-slate-500">#${m.id_movimiento}</td>
        <td class="p-3 font-semibold text-slate-200">${m.producto || 'N/A'}</td>
        <td class="p-3">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold ${esCompra ? 'bg-emerald-950 text-emerald-400' : 'bg-sky-950 text-sky-400'}">${m.tipo_transaccion}</span>
        </td>
        <td class="p-3 text-right">${m.monto_eco ? formatearNumeroVisual(m.monto_eco) : '0,00'} ${m.moneda_eco || ''}</td>
        <td class="p-3 text-right">${m.cambio_aplicado ? formatearNumeroVisual(m.cambio_aplicado) : '1,0000'}</td>
        <td class="p-3 text-right font-bold text-slate-100">${formatearNumeroVisual(equivalenteUSDT)} ${state.opciones.moneda_principal}</td>
        <td class="p-3">${formatearFecha(m.fecha_contable)}</td>
      </tr>
    `;
    tbody.insertAdjacentHTML('beforeend', tr);
  });
}

function triggerEcoProductoCostoAlert() {
  const selectTipo = document.getElementById('movTipo');
  const selectEcoProd = document.getElementById('ecoProducto');
  const container = document.getElementById('ecoCostoOriginalContainer');
  const label = document.getElementById('lblEcoCostoOriginal');

  if (!selectTipo || !selectEcoProd || !container || !label) return;

  const isVenta = selectTipo.value === 'ECOMMERCE / VENTA';
  const isCompra = selectTipo.value === 'ECOMMERCE / COMPRA';
  const prodId = selectEcoProd.value;

  if (prodId && (isVenta || isCompra)) {
    const p = stateProductosEco.find(item => item.id_producto == prodId);
    if (p) {
      if (isCompra) {
        document.getElementById('ecoMonto').value = p.monto_costo;
        document.getElementById('ecoMoneda').value = p.moneda_costo;
        document.getElementById('ecoCambio').value = p.cambio_costo;
        container.classList.add('hidden');
      } else if (isVenta) {
        container.classList.remove('hidden');
        label.textContent = `${formatearNumeroVisual(p.monto_costo)} ${p.moneda_costo} (Tasa: ${formatearNumeroVisual(p.cambio_costo)})`;
      }
    } else {
      container.classList.add('hidden');
    }
  } else {
    container.classList.add('hidden');
  }
}

// --- Sub-Módulo de Administración de Productos (E-Commerce) ---
let stateProductosEco = [];

async function refrescarEcoProductos() {
  try {
    stateProductosEco = await window.api.ecommerceProductos.listar();

    // 1. Dibujar tabla de productos
    const tbody = document.getElementById('tablaInventarioProductos');
    if (tbody) {
      tbody.innerHTML = '';
      if (stateProductosEco.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-slate-500">No hay productos en inventario.</td></tr>`;
      } else {
        stateProductosEco.forEach(p => {
          let equiv = p.monto_costo;
          if (p.moneda_costo !== state.opciones.moneda_principal) {
            equiv = p.monto_costo * p.cambio_costo;
          }
          const tr = `
            <tr class="border-b border-slate-900 hover:bg-slate-900/30">
              <td class="p-3 text-center">
                <input type="checkbox" class="chk-select-eco h-3.5 w-3.5 accent-indigo-650 bg-slate-900 border-slate-800 rounded" data-id="${p.id_producto}">
              </td>
              <td class="p-3 font-mono font-semibold text-slate-400">${p.sku || '--'}</td>
              <td class="p-3 font-bold text-slate-200">
                ${p.nombre}
                ${p.es_oferta === 1 ? '<span class="ml-1.5 bg-rose-600/20 text-rose-400 text-[9px] font-bold px-1.5 py-0.5 rounded border border-rose-500/20">OFERTA</span>' : ''}
              </td>
              <td class="p-3 text-right font-semibold text-teal-400">${p.stock} uds</td>
              <td class="p-3 text-right font-bold text-slate-350">${formatearNumeroVisual(equiv)} ${state.opciones.moneda_principal}</td>
              <td class="p-3 text-right font-bold text-indigo-400">${formatearNumeroVisual(p.precio_venta || 0.0)} USDT</td>
              <td class="p-3 text-center flex justify-center gap-2">
                <button onclick="cargarEditarEcoProducto(${p.id_producto})" class="text-indigo-400 hover:text-indigo-300 font-semibold text-[11px] hover:underline">Editar</button>
                <button onclick="eliminarEcoProducto(${p.id_producto})" class="text-rose-500 hover:text-rose-455 font-semibold text-[11px] hover:underline">Borrar</button>
              </td>
            </tr>
          `;
          tbody.insertAdjacentHTML('beforeend', tr);
        });

        // Configurar listener para Select All
        const chkSelectAll = document.getElementById('chkSelectAllEco');
        if (chkSelectAll) {
          chkSelectAll.checked = false;
          chkSelectAll.addEventListener('change', () => {
            const checkboxes = document.querySelectorAll('.chk-select-eco');
            checkboxes.forEach(cb => cb.checked = chkSelectAll.checked);
          });
        }
      }
    }

    // 2. Rellenar selectores de productos en Movimientos
    const selectEcoProd = document.getElementById('ecoProducto');
    if (selectEcoProd) {
      const valorSeleccionado = selectEcoProd.value;
      selectEcoProd.innerHTML = '<option value="">-- Seleccionar --</option>';
      stateProductosEco.forEach(p => {
        selectEcoProd.insertAdjacentHTML('beforeend', `<option value="${p.id_producto}">${p.nombre} (Stock: ${p.stock})</option>`);
      });
      if (valorSeleccionado) {
        selectEcoProd.value = valorSeleccionado;
      }
    }
  } catch (err) {
    console.error('Error al listar productos:', err);
  }
}
window.refrescarEcoProductos = refrescarEcoProductos;

async function cargarEditarEcoProducto(id) {
  const p = stateProductosEco.find(item => item.id_producto === id);
  if (!p) return;

  document.getElementById('ecoProductoId').value = p.id_producto;
  document.getElementById('ecoProductoNombre').value = p.nombre;
  document.getElementById('ecoProductoSku').value = p.sku || '';
  document.getElementById('ecoProductoMontoCosto').value = p.monto_costo;
  document.getElementById('ecoProductoMonedaCosto').value = p.moneda_costo;
  document.getElementById('ecoProductoCambioCosto').value = p.cambio_costo;
  document.getElementById('ecoProductoStock').value = p.stock;
  document.getElementById('ecoProductoPrecioVenta').value = p.precio_venta || '';
  document.getElementById('ecoProductoEsOferta').checked = p.es_oferta === 1;
  document.getElementById('ecoProductoImagen').value = p.imagen || '';

  const previewImg = document.getElementById('ecoProductoImagenPreview');
  const previewContainer = document.getElementById('ecoProductoImagenPreviewContainer');
  if (previewImg && previewContainer) {
    if (p.imagen) {
      previewImg.src = `../../assets/img/products/${p.imagen}`;
      previewContainer.classList.remove('hidden');
    } else {
      previewImg.src = '';
      previewContainer.classList.add('hidden');
    }
  }

  document.getElementById('ecoProductoObservaciones').value = p.observaciones || '';
  document.getElementById('formEcoProductoTitulo').textContent = 'Editar Producto';
  document.getElementById('btnCancelarEcoProducto').classList.remove('hidden');
  document.getElementById('ecoProductoNombre').focus();
}
window.cargarEditarEcoProducto = cargarEditarEcoProducto;

async function eliminarEcoProducto(id) {
  if (confirm('¿Está seguro de eliminar este producto? Se borrarán sus datos del catálogo (las transacciones históricas permanecerán).')) {
    try {
      await window.api.ecommerceProductos.eliminar(id);
      await refrescarEcoProductos();
      await refrescarEcommerceStock();
    } catch (err) {
      alert('Error al eliminar producto: ' + err.message);
    }
  }
}
window.eliminarEcoProducto = eliminarEcoProducto;

// ==========================================
// MÓDULO REPORTES CONTABLES
// ==========================================
function prepararModuloReportes() {
  const selectRepCli = document.getElementById('repCliente');
  selectRepCli.innerHTML = '<option value="">Todos los Clientes</option>';
  state.clientes.forEach(cli => {
    selectRepCli.insertAdjacentHTML('beforeend', `<option value="${cli.id_cliente}">${cli.nombre}</option>`);
  });

  const selectFiltroTiempo = document.getElementById('repFiltroTiempo');
  const uniqueWrapper = document.getElementById('repFechaUnica');
  const rangeWrapper = document.getElementById('repRangoWrapper');

  // Ajustar inputs según tipo filtro
  selectFiltroTiempo.addEventListener('change', () => {
    const val = selectFiltroTiempo.value;
    if (val === 'dia') {
      uniqueWrapper.classList.remove('hidden');
      rangeWrapper.classList.add('hidden');
      uniqueWrapper.type = 'date';
    } else if (val === 'mes') {
      uniqueWrapper.classList.remove('hidden');
      rangeWrapper.classList.add('hidden');
      uniqueWrapper.type = 'month';
    } else if (val === 'rango') {
      uniqueWrapper.classList.add('hidden');
      rangeWrapper.classList.remove('hidden');
    }
  });

  // Fecha comercial por defecto
  if (state.fechaContableActiva) {
    document.getElementById('repFechaUnica').value = state.fechaContableActiva;
  } else {
    document.getElementById('repFechaUnica').value = new Date().toISOString().split('T')[0];
  }
}

async function compilarReporteContable() {
  const temporal = document.getElementById('repFiltroTiempo').value;
  const clienteId = document.getElementById('repCliente').value;
  const tipoFiltro = document.getElementById('repTipo').value;

  const filtros = {};
  if (clienteId) filtros.id_cliente = parseInt(clienteId);

  // Filtrado temporal
  if (temporal === 'dia') {
    const dia = document.getElementById('repFechaUnica').value;
    if (dia) filtros.fecha_inicio = dia;
  } else if (temporal === 'rango') {
    const inicio = document.getElementById('repFechaInicio').value;
    const fin = document.getElementById('repFechaFin').value;
    if (inicio && fin) {
      filtros.fecha_inicio = inicio;
      filtros.fecha_fin = fin;
    }
  }

  let movimientos = await window.api.movimientos.listar(filtros);

  // Filtrado por mes en memoria si aplica
  if (temporal === 'mes') {
    const mes = document.getElementById('repFechaUnica').value; // Formato YYYY-MM
    if (mes) {
      movimientos = movimientos.filter(m => m.fecha_contable.startsWith(mes));
    }
  }

  // Filtrado por tipo/canal
  if (tipoFiltro === 'ECOMMERCE') {
    movimientos = movimientos.filter(m => m.tipo_transaccion.startsWith('ECOMMERCE'));
  } else if (tipoFiltro === 'COMPRA') {
    movimientos = movimientos.filter(m => m.tipo_transaccion.includes('COMPRA'));
  } else if (tipoFiltro === 'VENTA') {
    movimientos = movimientos.filter(m => m.tipo_transaccion.includes('VENTA'));
  } else if (tipoFiltro === 'GASTO') {
    movimientos = movimientos.filter(m => m.tipo_transaccion === 'GASTO');
  } else if (tipoFiltro === 'OTROS') {
    movimientos = movimientos.filter(m => !m.tipo_transaccion.startsWith('ECOMMERCE'));
  }

  // Renderizar tabla reporte
  const tbody = document.getElementById('tablaReporteResultados');
  tbody.innerHTML = '';

  let flujoNeto = 0.0;
  let ingresos = 0.0;
  let egresos = 0.0;

  if (movimientos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-slate-500">No se encontraron movimientos registrados para este reporte.</td></tr>`;
    document.getElementById('repValFlujo').textContent = `0,00 ${state.opciones.moneda_principal}`;
    document.getElementById('repValIngresos').textContent = `0,00 ${state.opciones.moneda_principal}`;
    document.getElementById('repValEgresos').textContent = `0,00 ${state.opciones.moneda_principal}`;
    return;
  }

  movimientos.forEach(m => {
    let valorUSDT = m.monto;
    if (m.moneda !== state.opciones.moneda_principal) {
      valorUSDT = m.monto * m.valor_cambio;
    }

    const esCompra = m.tipo_transaccion.includes('COMPRA') || m.tipo_transaccion === 'GASTO' || m.tipo_transaccion === 'GASTO_PERSONAL';
    const esVenta = m.tipo_transaccion.includes('VENTA');

    if (esCompra) {
      egresos += valorUSDT;
      flujoNeto -= valorUSDT;
    } else if (esVenta) {
      ingresos += valorUSDT;
      flujoNeto += valorUSDT;
    }

    const tr = `
      <tr class="border-b border-slate-900 hover:bg-slate-900/30">
        <td class="p-3 text-slate-500 font-bold">#${m.id_movimiento}</td>
        <td class="p-3">${formatearFecha(m.fecha_contable)}</td>
        <td class="p-3">
          <div class="font-semibold text-slate-200">${m.cliente_nombre || 'N/A'}</div>
          <div class="text-[9px] text-indigo-400">${m.cuenta_nombre}</div>
        </td>
        <td class="p-3">
          <span class="px-1.5 py-0.5 rounded text-[9px] font-bold ${esCompra ? 'bg-rose-955 text-rose-455' : 'bg-emerald-950 text-emerald-400'
      }">${m.tipo_transaccion}</span>
        </td>
        <td class="p-3 text-right">${formatearNumeroVisual(m.monto)} ${m.moneda}</td>
        <td class="p-3 text-right font-bold text-slate-100">${formatearNumeroVisual(valorUSDT)} ${state.opciones.moneda_principal}</td>
        <td class="p-3">${m.concepto}</td>
      </tr>
    `;
    tbody.insertAdjacentHTML('beforeend', tr);
  });

  // Pintar Kpis
  document.getElementById('repValFlujo').textContent = `${formatearNumeroVisual(flujoNeto)} ${state.opciones.moneda_principal}`;
  document.getElementById('repValIngresos').textContent = `${formatearNumeroVisual(ingresos)} ${state.opciones.moneda_principal}`;
  document.getElementById('repValEgresos').textContent = `${formatearNumeroVisual(egresos)} ${state.opciones.moneda_principal}`;

  // Estilos del flujo neto
  if (flujoNeto >= 0) {
    document.getElementById('repValFlujo').className = 'text-2xl font-bold text-emerald-450 mt-1';
  } else {
    document.getElementById('repValFlujo').className = 'text-2xl font-bold text-rose-500 mt-1';
  }
}

// ==========================================
// MÓDULO GASTOS PERSONALES (NUEVO)
// ==========================================
async function refrescarGastosPersonales() {
  const todos = await window.api.movimientos.listar({});
  const gastos = todos.filter(m => (m.tipo_transaccion === 'GASTO_PERSONAL' || m.tipo_transaccion === 'DEPOSITO_PERSONAL') && m.status_operacion !== 'PENDIENTE');

  const tbody = document.getElementById('tablaGastosPersonales');
  tbody.innerHTML = '';

  if (gastos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-slate-500">No hay movimientos personales registrados.</td></tr>`;
    return;
  }

  gastos.forEach(g => {
    let equivalenteUSDT = g.monto;
    if (g.moneda !== state.opciones.moneda_principal) {
      if (g.moneda === 'PYG' || g.moneda === 'ARS') {
        equivalenteUSDT = g.monto / g.valor_cambio;
      } else {
        equivalenteUSDT = g.monto * g.valor_cambio;
      }
    }

    const esEgreso = g.tipo_transaccion === 'GASTO_PERSONAL';
    const classEquiv = esEgreso ? 'text-rose-500' : 'text-emerald-450';

    const tr = `
      <tr class="border-b border-slate-900 hover:bg-slate-900/30">
        <td class="p-3 font-semibold text-slate-500">#${g.id_movimiento}</td>
        <td class="p-3">${formatearFecha(g.fecha_contable)}</td>
        <td class="p-3 text-indigo-400 font-semibold">${g.cuenta_nombre || '--'}</td>
        <td class="p-3">
          <span class="px-2 py-0.5 rounded text-[9px] font-bold ${esEgreso ? 'bg-rose-950 text-rose-400' : 'bg-emerald-950 text-emerald-400'} mr-1.5">${esEgreso ? 'RETIRO' : 'DEPÓSITO'}</span>
          ${g.concepto}
        </td>
        <td class="p-3 text-right font-bold text-slate-100">${formatearNumeroVisual(g.monto)} ${g.moneda}</td>
        <td class="p-3 text-right font-bold ${classEquiv}">${esEgreso ? '-' : '+'}${formatearNumeroVisual(equivalenteUSDT)} ${state.opciones.moneda_principal}</td>
        <td class="p-3 text-center flex justify-center gap-2">
          <button onclick="cargarEditarGasto(${g.id_movimiento})" class="text-indigo-400 hover:text-indigo-300 font-semibold text-[11px]">Editar</button>
          <button onclick="eliminarMovimiento(${g.id_movimiento})" class="text-rose-500 hover:text-rose-455 font-semibold text-[11px]">Borrar</button>
        </td>
      </tr>
    `;
    tbody.insertAdjacentHTML('beforeend', tr);
  });
}

async function cargarEditarGasto(idGasto) {
  const todos = await window.api.movimientos.listar({});
  const g = todos.find(m => m.id_movimiento === idGasto);
  if (!g) return;

  document.getElementById('gastoId').value = g.id_movimiento;
  document.getElementById('gastoTipoOperacion').value = g.tipo_transaccion;
  document.getElementById('gastoMonto').value = g.monto;
  document.getElementById('gastoMoneda').value = g.moneda;
  document.getElementById('gastoMiCuenta').value = g.id_cuenta;
  document.getElementById('gastoConcepto').value = g.concepto;
  document.getElementById('gastoObservaciones').value = g.observaciones || '';

  document.getElementById('gastoFormTitulo').textContent = 'Editar Movimiento Personal';
  document.getElementById('btnCancelarGasto').classList.remove('hidden');
  document.getElementById('gastoMonto').focus();
}
window.cargarEditarGasto = cargarEditarGasto;

// ==========================================
// CONFIGURAR AJUSTES (OPCIONES REDISEÑADO)
// ==========================================
async function cargarOpcionesSistemaYUsuario() {
  // Ajustes de Usuario (Mostrar como texto)
  const nombre = await window.api.opciones.get('empresa_nombre') || '-- No Configurado --';
  const ruc = await window.api.opciones.get('empresa_ruc') || '-- No Configurado --';
  const email = await window.api.opciones.get('empresa_email') || '-- No Configurado --';
  const telefono = await window.api.opciones.get('empresa_telefono') || '-- No Configurado --';

  document.getElementById('lblEmpresaNombre').textContent = nombre;
  document.getElementById('lblEmpresaRuc').textContent = ruc;
  document.getElementById('lblEmpresaEmail').textContent = email;
  document.getElementById('lblEmpresaTelefono').textContent = telefono;
  document.getElementById('lblEmpresaMoneda').textContent = state.opciones.moneda_principal;

  // Ajustes del Sistema (Automatizaciones)
  document.getElementById('chkCierreAuto').checked = (await window.api.opciones.get('cierre_diario_habilitado')) === 'true';
  document.getElementById('timeCierreAuto').value = await window.api.opciones.get('cierre_diario_hora') || '00:00';
  document.getElementById('chkCierreMensual').checked = (await window.api.opciones.get('cierre_mensual_habilitado')) === 'true';
  document.getElementById('diaCierreMensual').value = await window.api.opciones.get('cierre_mensual_dia') || '30';
  document.getElementById('chkUpdatesAuto').checked = (await window.api.opciones.get('buscar_updates_auto')) !== 'false';

  // Cuentas de la empresa asignadas
  const principalMiCta = await window.api.opciones.get('cuenta_principal_id') || '';
  const gastosMiCta = await window.api.opciones.get('cuenta_gastos_personales_id') || '';

  // Rellenar selectores de asignación en Opciones
  const selectPrincipal = document.getElementById('selCtaPrincipalComercial');
  const selectGastos = document.getElementById('selCtaGastosPersonales');

  selectPrincipal.innerHTML = '<option value="">-- Ninguna --</option>';
  selectGastos.innerHTML = '<option value="">-- Ninguna --</option>';

  state.misCuentas.forEach(c => {
    const opt = `<option value="${c.id_mi_cuenta}">${c.nombre_cuenta} (${c.moneda})</option>`;
    selectPrincipal.insertAdjacentHTML('beforeend', opt);
    selectGastos.insertAdjacentHTML('beforeend', opt);
  });

  selectPrincipal.value = principalMiCta;
  selectGastos.value = gastosMiCta;

  // Ajustes Administrativos CRUD
  refrescarAdminTipos();
  refrescarAdminMonedas();
  refrescarAdminRelaciones();
  refrescarMisCuentas();
  await refrescarDriveEstado();
}

async function refrescarMisCuentas() {
  state.misCuentas = await window.api.misCuentas.listar();
  const tbody = document.getElementById('tablaMisCuentas');
  tbody.innerHTML = '';

  if (state.misCuentas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" class="p-3 text-center text-slate-500 text-xs">Sin cuentas registradas.</td></tr>`;
    return;
  }

  state.misCuentas.forEach(c => {
    tbody.insertAdjacentHTML('beforeend', `
      <tr class="border-b border-slate-900 hover:bg-slate-900/30 text-xs">
        <td class="p-2 font-semibold text-slate-200">
          <div>${c.nombre_cuenta}</div>
          <div class="text-[9px] text-slate-500">${c.tipo_cuenta}</div>
        </td>
        <td class="p-2"><span class="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-350 font-bold">${c.moneda}</span></td>
        <td class="p-2 text-right">
          <button onclick="cargarEditarMiCuenta(${c.id_mi_cuenta})" class="text-indigo-400 hover:text-indigo-300 font-semibold text-[10px] mr-2">Editar</button>
          <button onclick="eliminarMiCuenta(${c.id_mi_cuenta})" class="text-rose-500 hover:text-rose-455 font-semibold text-[10px]">Borrar</button>
        </td>
      </tr>
    `);
  });
}

async function cargarEditarMiCuenta(id) {
  const c = state.misCuentas.find(cta => cta.id_mi_cuenta === id);
  if (!c) return;

  document.getElementById('miCuentaId').value = c.id_mi_cuenta;
  document.getElementById('miCuentaNombre').value = c.nombre_cuenta;
  document.getElementById('miCuentaTipo').value = c.tipo_cuenta;
  document.getElementById('miCuentaMoneda').value = c.moneda;
  document.getElementById('miCuentaReferencia').value = c.referencia || '';
  document.getElementById('miCuentaObservaciones').value = c.observaciones || '';
  document.getElementById('miCuentaStatus').value = c.status || 'ACTIVO';

  document.getElementById('miCuentaModalTitulo').textContent = 'Editar Cuenta Propia';
  document.getElementById('miCuentaModal').classList.remove('hidden');
}
window.cargarEditarMiCuenta = cargarEditarMiCuenta;

async function eliminarMiCuenta(id) {
  if (confirm('¿Está seguro de eliminar esta cuenta de la empresa? Se desvinculará de las asignaciones de gastos.')) {
    await window.api.misCuentas.eliminar(id);
    await cargarListasBase();
    await refrescarMisCuentas();
  }
}
window.eliminarMiCuenta = eliminarMiCuenta;

let driveState = { conectado: false };

async function refrescarDriveEstado() {
  try {
    const estado = await window.api.drive.estado();
    driveState = estado;

    const badge = document.getElementById('driveBadgeEstado');
    const container = document.getElementById('driveUserContainer');
    const emailEl = document.getElementById('driveUserEmail');
    const btnConectar = document.getElementById('btnDriveConectar');
    const manualContainer = document.getElementById('driveAccionesManuales');
    const chkAuto = document.getElementById('chkDriveSyncAuto');
    const txtClientId = document.getElementById('txtDriveClientId');
    const txtClientSecret = document.getElementById('txtDriveClientSecret');

    if (txtClientId) txtClientId.value = estado.clientId || '';
    if (txtClientSecret) txtClientSecret.value = estado.clientSecret || '';
    if (chkAuto) chkAuto.checked = estado.autoSync;

    if (estado.conectado) {
      if (badge) {
        badge.textContent = 'CONECTADO';
        badge.className = 'px-2 py-0.5 rounded text-[8px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-900';
      }
      if (container) container.classList.remove('hidden');
      if (emailEl) emailEl.textContent = estado.email;
      if (btnConectar) {
        btnConectar.textContent = 'Desconectar Cuenta (Cerrar Sesión)';
        btnConectar.className = 'w-full bg-slate-800 hover:bg-slate-700 text-rose-455 font-semibold py-2.5 rounded-xl text-xs transition border border-slate-700';
      }
      if (manualContainer) manualContainer.classList.remove('opacity-50', 'pointer-events-none');
    } else {
      if (badge) {
        badge.textContent = 'DESCONECTADO';
        badge.className = 'px-2 py-0.5 rounded text-[8px] font-bold bg-rose-955 text-rose-455 border border-rose-900';
      }
      if (container) container.classList.add('hidden');
      if (btnConectar) {
        btnConectar.innerHTML = `
          <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.18 4.114-3.478 0-6.3-2.823-6.3-6.3 0-3.478 2.822-6.3 6.3-6.3 1.606 0 3.011.603 4.1 1.567l3.078-3.078C18.995 2.223 15.894 1 12.24 1 6.033 1 1 6.033 1 12.24s5.033 11.24 11.24 11.24c6.478 0 10.793-4.537 10.793-11 0-.746-.08-1.484-.22-2.195H12.24z"/>
          </svg>
          Conectar Cuenta de Google
        `;
        btnConectar.className = 'w-full bg-indigo-650 hover:bg-indigo-600 text-white font-semibold py-2.5 rounded-xl text-xs transition flex items-center justify-center gap-2';
      }
      if (manualContainer) manualContainer.classList.add('opacity-50', 'pointer-events-none');
    }
  } catch (err) {
    console.error('Error al actualizar el estado de Google Drive:', err);
  }
}
window.refrescarDriveEstado = refrescarDriveEstado;

async function refrescarAdminTipos() {
  const tipos = await window.api.tiposTransacciones.listar();
  const list = document.getElementById('listaAdminTipos');
  list.innerHTML = '';

  tipos.forEach(t => {
    list.insertAdjacentHTML('beforeend', `
      <li class="flex justify-between items-center p-2 hover:bg-slate-900/60">
        <span class="font-bold">${t.nombre}</span>
        <button onclick="eliminarAdminTipo(${t.id_tipo})" class="text-rose-500 hover:text-rose-455 text-[10px]">Eliminar</button>
      </li>
    `);
  });
}

async function eliminarAdminTipo(id) {
  if (confirm('¿Desea eliminar este tipo de transacción?')) {
    await window.api.tiposTransacciones.eliminar(id);
    await cargarListasBase();
    refrescarAdminTipos();
  }
}
window.eliminarAdminTipo = eliminarAdminTipo;

async function refrescarAdminMonedas() {
  const monedas = await window.api.monedas.listar();
  const tbody = document.getElementById('tablaAdminMonedas');
  tbody.innerHTML = '';

  monedas.forEach(m => {
    tbody.insertAdjacentHTML('beforeend', `
      <tr class="border-b border-slate-900">
        <td class="p-2 font-bold">${m.siglas}</td>
        <td class="p-2">${m.nombre} (${m.tipo})</td>
        <td class="p-2 text-center">
          <button onclick="cargarEditarAdminMoneda(${m.id_moneda}, '${m.nombre}', '${m.siglas}', '${m.tipo}', '${m.status}')" class="text-indigo-400 hover:text-indigo-300 text-[10px] mr-2">Editar</button>
          <button onclick="eliminarAdminMoneda(${m.id_moneda})" class="text-rose-500 hover:text-rose-455 text-[10px]">Borrar</button>
        </td>
      </tr>
    `);
  });

  // Actualizar combos de orígen y destino para Relaciones de Cambio
  const or = document.getElementById('adminRelOrigen');
  const de = document.getElementById('adminRelDestino');
  or.innerHTML = '';
  de.innerHTML = '';

  monedas.forEach(m => {
    or.insertAdjacentHTML('beforeend', `<option value="${m.siglas}">${m.siglas}</option>`);
    de.insertAdjacentHTML('beforeend', `<option value="${m.siglas}">${m.siglas}</option>`);
  });
}

function cargarEditarAdminMoneda(id, nombre, siglas, tipo, status) {
  document.getElementById('adminMonedaId').value = id;
  document.getElementById('adminMonedaNombre').value = nombre;
  document.getElementById('adminMonedaSiglas').value = siglas;
  document.getElementById('adminMonedaTipo').value = tipo;
  document.getElementById('adminMonedaStatus').value = status;
  document.getElementById('btnAdminGuardarMoneda').textContent = 'Actualizar';
}
window.cargarEditarAdminMoneda = cargarEditarAdminMoneda;

async function eliminarAdminMoneda(id) {
  if (confirm('¿Está seguro de eliminar esta moneda?')) {
    await window.api.monedas.eliminar(id);
    await cargarListasBase();
    refrescarAdminMonedas();
  }
}
window.eliminarAdminMoneda = eliminarAdminMoneda;

async function refrescarAdminRelaciones() {
  const rels = await window.api.relaciones.listar();
  const list = document.getElementById('listaAdminRelaciones');
  list.innerHTML = '';

  rels.forEach(r => {
    list.insertAdjacentHTML('beforeend', `
      <li class="flex justify-between items-center p-2 hover:bg-slate-900/60">
        <span class="font-bold text-indigo-400">${r.moneda_origen} / ${r.moneda_destino}</span>
        <button onclick="eliminarAdminRelacion(${r.id_relacion})" class="text-rose-500 hover:text-rose-455 text-[10px]">Eliminar</button>
      </li>
    `);
  });
}

async function eliminarAdminRelacion(id) {
  if (confirm('¿Desea borrar esta relación de cambio?')) {
    await window.api.relaciones.eliminar(id);
    await cargarListasBase();
    refrescarAdminRelaciones();
  }
}
window.eliminarAdminRelacion = eliminarAdminRelacion;

// ==========================================
// CONTROL DE FORMULARIOS & EVENTOS
// ==========================================
function configurarFormularios() {

  // --- Formulario Movimiento ---
  const selectCli = document.getElementById('movCliente');
  const selectCta = document.getElementById('movCuenta');
  const selectTipo = document.getElementById('movTipo');
  const seccionEco = document.getElementById('seccionEcommerce');

  selectCli.addEventListener('change', async () => {
    const idCliente = selectCli.value;
    selectCta.innerHTML = '<option value="">Seleccione...</option>';

    // Mostrar/ocultar Variante Ocasional si el cliente seleccionado es de tipo OCASIONAL
    const selectedOpt = selectCli.options[selectCli.selectedIndex];
    const esOcasional = selectedOpt ? (selectedOpt.getAttribute('data-tipo') === 'OCASIONAL' || selectedOpt.text.includes('OCASIONAL')) : false;
    const subCtaContainer = document.getElementById('movSubcategoriaOcasionalContainer');
    if (esOcasional) {
      subCtaContainer.classList.remove('hidden');
    } else {
      subCtaContainer.classList.add('hidden');
      document.getElementById('movSubcategoriaOcasional').value = '';
    }

    if (idCliente) {
      const cuentas = await window.api.cuentas.listar(idCliente);
      const cuentasActivas = cuentas.filter(c => c.status === 'ACTIVO');

      cuentasActivas.forEach(c => {
        selectCta.insertAdjacentHTML('beforeend', `<option value="${c.id_cuenta}" data-moneda="${c.moneda}">${c.nombre_cuenta} (${c.moneda})</option>`);
      });

      // Sugerir la cuenta más utilizada
      if (cuentasActivas.length > 0) {
        const idClienteInt = parseInt(idCliente);
        const freqs = {};
        state.movimientos.forEach(m => {
          if (m.id_cliente === idClienteInt && m.id_cuenta) {
            freqs[m.id_cuenta] = (freqs[m.id_cuenta] || 0) + 1;
          }
        });

        let maxFreq = -1;
        let bestCtaId = cuentasActivas[0].id_cuenta;
        cuentasActivas.forEach(c => {
          const f = freqs[c.id_cuenta] || 0;
          if (f > maxFreq) {
            maxFreq = f;
            bestCtaId = c.id_cuenta;
          }
        });

        selectCta.value = bestCtaId;
        selectCta.dispatchEvent(new Event('change'));
      }
    } else {
      // Si no hay cliente, cargamos las cuentas propias de la empresa (Mis Cuentas)
      state.misCuentas.filter(c => c.status === 'ACTIVO').forEach(c => {
        selectCta.insertAdjacentHTML('beforeend', `<option value="${c.id_mi_cuenta}" data-moneda="${c.moneda}">${c.nombre_cuenta} (${c.moneda})</option>`);
      });
    }
  });

  const btnLimpiarMov = document.getElementById('btnLimpiarMovimiento');
  if (btnLimpiarMov) {
    btnLimpiarMov.addEventListener('click', () => {
      limpiarFormularioMovimiento();
    });
  }

  selectCta.addEventListener('change', () => {
    const selectedOption = selectCta.options[selectCta.selectedIndex];
    if (!selectedOption) return;
    const moneda = selectedOption.getAttribute('data-moneda');
    if (moneda) {
      document.getElementById('movMoneda').value = moneda;
      actualizarTasaAutomatica();
    }
  });

  document.getElementById('movMoneda').addEventListener('change', actualizarTasaAutomatica);
  document.getElementById('movModalidadCambio').addEventListener('change', actualizarTasaAutomatica);

  selectTipo.addEventListener('change', () => {
    if (selectTipo.value.startsWith('ECOMMERCE')) {
      seccionEco.classList.remove('hidden');
      triggerEcoProductoCostoAlert();
    } else {
      seccionEco.classList.add('hidden');
    }
  });

  document.getElementById('formMovimiento').addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!state.fechaContableActiva) {
      alert('Debe iniciar la jornada contable del día comercial antes de poder guardar movimientos.');
      return;
    }

    const cliId = document.getElementById('movCliente').value;
    const chkPendiente = document.getElementById('movEsPendiente').checked;
    const mData = {
      id_cliente: cliId ? parseInt(cliId) : null,
      id_cuenta: parseInt(document.getElementById('movCuenta').value),
      tipo_transaccion: document.getElementById('movTipo').value,
      monto: parseFloat(document.getElementById('movMonto').value),
      moneda: document.getElementById('movMoneda').value,
      modalidad_cambio: document.getElementById('movModalidadCambio').value,
      valor_cambio: parseFloat(document.getElementById('movValorCambio').value),
      concepto: document.getElementById('movConcepto').value,
      observaciones: document.getElementById('movObservaciones').value,
      fecha_contable: state.fechaContableActiva,
      status_operacion: chkPendiente ? 'PENDIENTE' : 'LIQUIDADO',
      subcategoria_ocasional: document.getElementById('movSubcategoriaOcasional').value || null
    };

    let ecoData = null;
    if (mData.tipo_transaccion.startsWith('ECOMMERCE')) {
      const selectEcoProd = document.getElementById('ecoProducto');
      const selectedProd = stateProductosEco.find(p => p.id_producto == selectEcoProd.value);
      if (!selectedProd) {
        alert('Debe seleccionar un producto válido de la lista.');
        return;
      }

      ecoData = {
        id_producto: selectedProd.id_producto,
        producto: selectedProd.nombre,
        monto: parseFloat(document.getElementById('ecoMonto').value) || 0.0,
        moneda: document.getElementById('ecoMoneda').value,
        cambio_aplicado: parseFloat(document.getElementById('ecoCambio').value) || 1.0,
        cantidad: parseInt(document.getElementById('ecoCantidad').value) || 1
      };
    }

    try {
      if (state.editandoMovimientoId) {
        // Modo actualizar
        mData.id_movimiento = state.editandoMovimientoId;
        await window.api.movimientos.actualizar(mData, ecoData);
        alert('Movimiento actualizado con éxito.');
        document.getElementById('btnCancelarMovimiento').click();
      } else {
        // Modo crear
        await window.api.movimientos.crear(mData, ecoData);
        alert('Movimiento registrado con éxito en base de datos.');
        document.getElementById('formMovimiento').reset();
        document.getElementById('movSubcategoriaOcasionalContainer').classList.add('hidden');
        seccionEco.classList.add('hidden');
      }
      await refrescarMovimientos();
      await refrescarEcoProductos();
      await refrescarEcommerceStock();
      await actualizarDashboard();
    } catch (err) {
      alert('Error al guardar movimiento: ' + err.message);
    }
  });

  document.getElementById('btnCancelarMovimiento').addEventListener('click', () => {
    state.editandoMovimientoId = null;
    document.getElementById('formMovimiento').reset();
    document.getElementById('movSubcategoriaOcasionalContainer').classList.add('hidden');
    seccionEco.classList.add('hidden');
    document.getElementById('btnCancelarMovimiento').classList.add('hidden');
    document.getElementById('btnGuardarMovimiento').textContent = 'Guardar Movimiento';
  });

  // --- Botones de Creación Rápida en Movimientos ---
  document.getElementById('btnMovNuevoCliente').addEventListener('click', () => {
    document.getElementById('formMovNuevoCliente').reset();
    document.getElementById('movNuevoClienteModal').classList.remove('hidden');
  });

  document.getElementById('formMovNuevoCliente').addEventListener('submit', async (e) => {
    e.preventDefault();
    const cData = {
      nombre: document.getElementById('movNewCliNombre').value,
      documento: document.getElementById('movNewCliDocumento').value,
      tipo_cliente: document.getElementById('movNewCliTipo').value,
      status: 'ACTIVO',
      observaciones: 'Creado vía registro rápido en movimientos'
    };
    try {
      const res = await window.api.clientes.crear(cData);
      alert('Cliente rápido registrado.');
      document.getElementById('movNuevoClienteModal').classList.add('hidden');
      await cargarListasBase();

      // Seleccionar el nuevo cliente creado
      if (res && res.lastID) {
        document.getElementById('movCliente').value = res.lastID;
        document.getElementById('movCliente').dispatchEvent(new Event('change'));
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
  });

  document.getElementById('btnMovNuevaCuenta').addEventListener('click', () => {
    const idCliente = document.getElementById('movCliente').value;
    if (!idCliente) {
      alert('Debe seleccionar un cliente antes de poder añadirle una cuenta.');
      return;
    }
    document.getElementById('formMovNuevaCuenta').reset();
    document.getElementById('movNuevaCuentaModal').classList.remove('hidden');
  });

  document.getElementById('formMovNuevaCuenta').addEventListener('submit', async (e) => {
    e.preventDefault();
    const idCliente = parseInt(document.getElementById('movCliente').value);
    const ctaData = {
      id_cliente: idCliente,
      nombre_cuenta: document.getElementById('movNewCtaNombre').value,
      tipo_cuenta: document.getElementById('movNewCtaTipo').value,
      moneda: document.getElementById('movNewCtaMoneda').value,
      referencia: document.getElementById('movNewCtaReferencia').value || '',
      status: 'ACTIVO',
      observaciones: 'Creado vía registro rápido en movimientos'
    };
    try {
      const res = await window.api.cuentas.crear(ctaData);
      alert('Cuenta rápida registrada.');
      document.getElementById('movNuevaCuentaModal').classList.add('hidden');
      await selectCli.dispatchEvent(new Event('change'));
      if (res && res.lastID) {
        document.getElementById('movCuenta').value = res.lastID;
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
  });

  // --- Botón de Creación Rápida de Producto E-Commerce ---
  document.getElementById('btnMovNuevoEcoProducto').addEventListener('click', () => {
    document.getElementById('formMovNuevoEcoProducto').reset();

    // Rellenar monedas en el modal rápido
    const selectMon = document.getElementById('movNewProdMonedaCosto');
    selectMon.innerHTML = '';
    state.monedas.filter(m => m.status === 'ACTIVO').forEach(m => {
      selectMon.insertAdjacentHTML('beforeend', `<option value="${m.siglas}">${m.siglas}</option>`);
    });

    document.getElementById('movNuevoEcoProductoModal').classList.remove('hidden');
  });

  document.getElementById('formMovNuevoEcoProducto').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pData = {
      nombre: document.getElementById('movNewProdNombre').value,
      sku: document.getElementById('movNewProdSku').value,
      monto_costo: parseFloat(document.getElementById('movNewProdMontoCosto').value) || 0.0,
      moneda_costo: document.getElementById('movNewProdMonedaCosto').value,
      cambio_costo: parseFloat(document.getElementById('movNewProdCambioCosto').value) || 1.0,
      stock: parseInt(document.getElementById('movNewProdStock').value) || 0,
      observaciones: 'Creado vía registro rápido en movimientos'
    };
    try {
      const res = await window.api.ecommerceProductos.crear(pData);
      alert('Producto rápido registrado.');
      document.getElementById('movNuevoEcoProductoModal').classList.add('hidden');
      await refrescarEcoProductos();
      if (res && res.lastID) {
        document.getElementById('ecoProducto').value = res.lastID;
        triggerEcoProductoCostoAlert();
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
  });

  // Tasa / Costo auto-fill on select product change
  document.getElementById('ecoProducto').addEventListener('change', () => {
    triggerEcoProductoCostoAlert();
  });

  // --- Formulario Cliente (CRUD) ---
  document.getElementById('formCliente').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('clienteId').value;
    const cData = {
      nombre: document.getElementById('clienteNombre').value,
      documento: document.getElementById('clienteDocumento').value,
      tipo_cliente: document.getElementById('clienteTipo').value,
      telefono: document.getElementById('clienteTelefono').value,
      mail: document.getElementById('clienteMail').value,
      status: document.getElementById('clienteStatus').value,
      observaciones: document.getElementById('clienteObservaciones').value
    };

    resetearSeleccionCuentas();

    if (id) {
      cData.id_cliente = parseInt(id);
      await window.api.clientes.actualizar(cData);
      alert('Cliente actualizado correctamente.');
    } else {
      await window.api.clientes.crear(cData);
      alert('Cliente creado correctamente.');
    }

    document.getElementById('formCliente').reset();
    document.getElementById('clienteId').value = '';
    await cargarListasBase();
    await refrescarClientes();
  });

  document.getElementById('btnCancelarCliente').addEventListener('click', () => {
    document.getElementById('formCliente').reset();
    document.getElementById('clienteId').value = '';
    resetearSeleccionCuentas();
  });

  // --- Formulario Cuenta (CRUD) ---
  document.getElementById('formCuenta').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.clienteActivoParaCuentas) return;

    const idCta = document.getElementById('cuentaId').value;
    const ctaData = {
      id_cliente: state.clienteActivoParaCuentas,
      nombre_cuenta: document.getElementById('cuentaNombre').value,
      tipo_cuenta: document.getElementById('cuentaTipo').value,
      moneda: document.getElementById('cuentaMoneda').value,
      referencia: document.getElementById('cuentaReferencia').value || '',
      observaciones: document.getElementById('cuentaObservaciones').value,
      status: document.getElementById('cuentaStatus').value
    };

    if (idCta) {
      ctaData.id_cuenta = parseInt(idCta);
      await window.api.cuentas.actualizar(ctaData);
      alert('Cuenta actualizada con éxito.');
    } else {
      await window.api.cuentas.crear(ctaData);
      alert('Cuenta creada con éxito.');
    }

    document.getElementById('formCuenta').reset();
    document.getElementById('cuentaId').value = '';
    document.getElementById('btnCancelarCuenta').classList.add('hidden');
    await refrescarCuentas(state.clienteActivoParaCuentas);
  });

  document.getElementById('btnCancelarCuenta').addEventListener('click', () => {
    document.getElementById('formCuenta').reset();
    document.getElementById('cuentaId').value = '';
    document.getElementById('btnCancelarCuenta').classList.add('hidden');
  });

  // --- Formulario Gasto Personal ---
  const selectGastoMiCta = document.getElementById('gastoMiCuenta');
  const selectGastoMoneda = document.getElementById('gastoMoneda');
  if (selectGastoMiCta && selectGastoMoneda) {
    selectGastoMiCta.addEventListener('change', () => {
      const selectedOption = selectGastoMiCta.options[selectGastoMiCta.selectedIndex];
      if (selectedOption) {
        const moneda = selectedOption.getAttribute('data-moneda');
        if (moneda) {
          selectGastoMoneda.value = moneda;
        }
      }
    });
  }

  document.getElementById('formGastoPersonal').addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!state.fechaContableActiva) {
      alert('Debe iniciar la jornada contable comercial.');
      return;
    }

    const idGasto = document.getElementById('gastoId').value;
    const miCtaId = document.getElementById('gastoMiCuenta').value;
    const tipoOp = document.getElementById('gastoTipoOperacion').value;

    const mData = {
      id_cliente: null,
      id_cuenta: parseInt(miCtaId),
      tipo_transaccion: tipoOp,
      monto: parseFloat(document.getElementById('gastoMonto').value),
      moneda: document.getElementById('gastoMoneda').value,
      modalidad_cambio: 'FIJO',
      valor_cambio: 1.0,
      concepto: document.getElementById('gastoConcepto').value,
      observaciones: document.getElementById('gastoObservaciones').value,
      fecha_contable: state.fechaContableActiva
    };

    // Calcular tasa automatica frente a la moneda principal del sistema
    if (mData.moneda !== state.opciones.moneda_principal) {
      const par = `${mData.moneda}/${state.opciones.moneda_principal}`;
      const tasa = state.cambios.find(c => c.par_divisa === par || c.par_divisa === `${state.opciones.moneda_principal}/${mData.moneda}`);
      if (tasa) {
        mData.valor_cambio = tasa.valor_compra;
      }
    }

    try {
      if (idGasto) {
        mData.id_movimiento = parseInt(idGasto);
        await window.api.movimientos.actualizar(mData, null);
        alert('Movimiento personal actualizado.');
      } else {
        await window.api.movimientos.crear(mData, null);
        alert('Movimiento personal registrado.');
      }
      document.getElementById('formGastoPersonal').reset();
      document.getElementById('gastoId').value = '';
      document.getElementById('gastoFormTitulo').textContent = 'Registrar Gasto';
      document.getElementById('btnCancelarGasto').classList.add('hidden');
      await refrescarGastosPersonales();
      await actualizarDashboard();
    } catch (err) {
      alert('Error al guardar gasto: ' + err.message);
    }
  });

  document.getElementById('btnCancelarGasto').addEventListener('click', () => {
    document.getElementById('formGastoPersonal').reset();
    document.getElementById('gastoId').value = '';
    document.getElementById('gastoFormTitulo').textContent = 'Registrar Gasto';
    document.getElementById('btnCancelarGasto').classList.add('hidden');
  });

  // --- Formulario Cambio ---
  document.getElementById('formCambio').addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!state.fechaContableActiva) {
      alert('Debe iniciar la jornada contable del día comercial antes de fijar cotizaciones.');
      return;
    }

    const idCambio = document.getElementById('cambioId').value;
    const camData = {
      fecha_contable: state.fechaContableActiva,
      par_divisa: document.getElementById('cambioPar').value,
      valor_compra: parseFloat(document.getElementById('cambioCompra').value),
      valor_venta: parseFloat(document.getElementById('cambioVenta').value)
    };

    if (idCambio) {
      camData.id_cambio = parseInt(idCambio);
      await window.api.cambios.actualizar(camData);
      alert('Cotización actualizada.');
    } else {
      await window.api.cambios.guardar(camData);
      alert('Cotización guardada.');
    }

    document.getElementById('formCambio').reset();
    document.getElementById('cambioId').value = '';
    document.getElementById('btnCancelarCambio').classList.add('hidden');
    document.getElementById('btnGuardarCambio').textContent = 'Guardar Cotización';
    await cargarListasBase();
    await refrescarCambios();
  });

  document.getElementById('btnCancelarCambio').addEventListener('click', () => {
    document.getElementById('formCambio').reset();
    document.getElementById('cambioId').value = '';
    document.getElementById('btnCancelarCambio').classList.add('hidden');
    document.getElementById('btnGuardarCambio').textContent = 'Guardar Cotización';
  });

  // Autofill last rate value on currency pair change
  document.getElementById('cambioPar').addEventListener('change', (e) => {
    const par = e.target.value;
    const lastRate = state.cambios.find(c => c.par_divisa === par);
    if (lastRate) {
      document.getElementById('cambioCompra').value = lastRate.valor_compra;
      document.getElementById('cambioVenta').value = lastRate.valor_venta;
    } else {
      document.getElementById('cambioCompra').value = '';
      document.getElementById('cambioVenta').value = '';
    }
  });

  // --- Filtros Movimientos ---
  document.getElementById('btnFiltrar').addEventListener('click', () => {
    const filtros = {
      fecha_inicio: document.getElementById('filtroFecha').value || null,
      id_cliente: document.getElementById('filtroCliente').value || null,
      tipo_transaccion: document.getElementById('filtroTipo').value || null
    };
    refrescarMovimientos(filtros);
  });

  // Real-time global search in movements
  document.getElementById('filtroBuscarGlobal').addEventListener('input', () => {
    const filtros = {
      fecha_inicio: document.getElementById('filtroFecha').value || null,
      id_cliente: document.getElementById('filtroCliente').value || null,
      tipo_transaccion: document.getElementById('filtroTipo').value || null
    };
    refrescarMovimientos(filtros);
  });

  // --- Reporte PDF y Excel en movimientos ---
  document.getElementById('btnExportPDF').addEventListener('click', async () => {
    try {
      const filtros = {
        fecha_inicio: document.getElementById('filtroFecha').value || null,
        id_cliente: document.getElementById('filtroCliente').value || null,
        tipo_transaccion: document.getElementById('filtroTipo').value || null
      };
      const path = await window.api.reportes.descargarPDF(filtros);
      mostrarNotificacionDescarga(path);
    } catch (err) {
      console.error('Error al exportar PDF:', err);
      alert('Error al generar el reporte PDF: ' + err.message);
    }
  });

  document.getElementById('btnExportExcel').addEventListener('click', async () => {
    try {
      const filtros = {
        fecha_inicio: document.getElementById('filtroFecha').value || null,
        id_cliente: document.getElementById('filtroCliente').value || null,
        tipo_transaccion: document.getElementById('filtroTipo').value || null
      };
      const path = await window.api.reportes.descargarExcel(filtros);
      mostrarNotificacionDescarga(path);
    } catch (err) {
      console.error('Error al exportar Excel:', err);
      alert('Error al generar el reporte Excel: ' + err.message);
    }
  });

  // --- Cargar y Editar Datos Empresa (Ajustes de Usuario Modal) ---
  const modalEmpresa = document.getElementById('editarEmpresaModal');

  document.getElementById('btnEditarDatosEmpresa').addEventListener('click', async () => {
    document.getElementById('editEmpresaNombre').value = await window.api.opciones.get('empresa_nombre') || '';
    document.getElementById('editEmpresaRuc').value = await window.api.opciones.get('empresa_ruc') || '';
    document.getElementById('editEmpresaEmail').value = await window.api.opciones.get('empresa_email') || '';
    document.getElementById('editEmpresaTelefono').value = await window.api.opciones.get('empresa_telefono') || '';

    // Poblado de Monedas en selector de Ajustes
    const selectMonedaEmpresa = document.getElementById('editEmpresaMoneda');
    selectMonedaEmpresa.innerHTML = '';
    state.monedas.filter(m => m.status === 'ACTIVO').forEach(m => {
      selectMonedaEmpresa.insertAdjacentHTML('beforeend', `<option value="${m.siglas}">${m.siglas}</option>`);
    });
    selectMonedaEmpresa.value = state.opciones.moneda_principal;

    modalEmpresa.classList.remove('hidden');
  });

  document.getElementById('btnCerrarEmpresaModal').addEventListener('click', () => {
    modalEmpresa.classList.add('hidden');
  });

  document.getElementById('formEmpresaModal').addEventListener('submit', async (e) => {
    e.preventDefault();
    await window.api.opciones.set('empresa_nombre', document.getElementById('editEmpresaNombre').value);
    await window.api.opciones.set('empresa_ruc', document.getElementById('editEmpresaRuc').value);
    await window.api.opciones.set('empresa_email', document.getElementById('editEmpresaEmail').value);
    await window.api.opciones.set('empresa_telefono', document.getElementById('editEmpresaTelefono').value);
    await window.api.opciones.set('moneda_principal', document.getElementById('editEmpresaMoneda').value);

    modalEmpresa.classList.add('hidden');
    alert('Datos corporativos guardados de forma segura.');
    await cargarListasBase();
    await cargarOpcionesSistemaYUsuario();
    await actualizarDashboard();
  });

  // --- Auto Guardar Ajustes del Sistema al cambiar inputs ---
  document.getElementById('chkCierreAuto').addEventListener('change', async (e) => {
    await window.api.opciones.set('cierre_diario_habilitado', e.target.checked.toString());
  });
  document.getElementById('timeCierreAuto').addEventListener('change', async (e) => {
    await window.api.opciones.set('cierre_diario_hora', e.target.value);
  });
  document.getElementById('chkCierreMensual').addEventListener('change', async (e) => {
    await window.api.opciones.set('cierre_mensual_habilitado', e.target.checked.toString());
  });
  document.getElementById('diaCierreMensual').addEventListener('change', async (e) => {
    await window.api.opciones.set('cierre_mensual_dia', e.target.value);
  });
  document.getElementById('chkUpdatesAuto').addEventListener('change', async (e) => {
    await window.api.opciones.set('buscar_updates_auto', e.target.checked.toString());
  });

  // --- Opciones: Asignación de Mis Cuentas Comerciales / Gastos ---
  document.getElementById('selCtaPrincipalComercial').addEventListener('change', async (e) => {
    await window.api.opciones.set('cuenta_principal_id', e.target.value);
    await actualizarDashboard();
  });
  document.getElementById('selCtaGastosPersonales').addEventListener('change', async (e) => {
    await window.api.opciones.set('cuenta_gastos_personales_id', e.target.value);
    await actualizarDashboard();
  });

  // --- Opciones: CRUD Mis Cuentas ---
  document.getElementById('btnNuevaMiCuenta').addEventListener('click', () => {
    document.getElementById('miCuentaId').value = '';
    document.getElementById('formMiCuenta').reset();
    document.getElementById('miCuentaModalTitulo').textContent = 'Nueva Cuenta Propia';
    document.getElementById('miCuentaModal').classList.remove('hidden');
  });

  document.getElementById('formMiCuenta').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('miCuentaId').value;
    const cData = {
      nombre_cuenta: document.getElementById('miCuentaNombre').value,
      tipo_cuenta: document.getElementById('miCuentaTipo').value,
      moneda: document.getElementById('miCuentaMoneda').value,
      referencia: document.getElementById('miCuentaReferencia').value || '',
      observaciones: document.getElementById('miCuentaObservaciones').value,
      status: document.getElementById('miCuentaStatus').value
    };

    if (id) {
      cData.id_mi_cuenta = parseInt(id);
      await window.api.misCuentas.actualizar(cData);
    } else {
      await window.api.misCuentas.crear(cData);
    }

    document.getElementById('miCuentaModal').classList.add('hidden');
    alert('Cuenta corporativa guardada.');
    await cargarListasBase();
    await cargarOpcionesSistemaYUsuario();
    await actualizarDashboard();
  });

  // --- Opciones: Simulación de Datos de Prueba ---
  document.getElementById('btnGenerarSimulacion').addEventListener('click', async () => {
    if (confirm('Se generarán movimientos de simulación de 7 días. Las cotizaciones se ajustarán a cotizaciones ficticias de prueba. ¿Desea continuar?')) {
      await window.api.testData.generar();
      alert('Datos de prueba cargados exitosamente.');
      await arrancarAplicacion();
    }
  });

  document.getElementById('btnLimpiarSimulacion').addEventListener('click', async () => {
    if (confirm('Se eliminarán todos los movimientos y datos creados por la simulación (etiquetados con [TEST]). ¿Desea continuar?')) {
      await window.api.testData.limpiar();
      alert('Simulación eliminada correctamente de la base de datos.');
      await arrancarAplicacion();
    }
  });

  // --- CRUD Admin: Tipos de Transacción ---
  document.getElementById('formAdminTipo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = document.getElementById('adminTipoNombre').value.trim();
    const categoria = document.getElementById('adminTipoCategoria').value;
    if (nombre) {
      await window.api.tiposTransacciones.crear(nombre, categoria);
      document.getElementById('adminTipoNombre').value = '';
      await cargarListasBase();
      refrescarAdminTipos();
    }
  });

  // --- CRUD Admin: Monedas ---
  document.getElementById('formAdminMoneda').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('adminMonedaId').value;
    const mData = {
      nombre: document.getElementById('adminMonedaNombre').value.trim(),
      siglas: document.getElementById('adminMonedaSiglas').value.trim().toUpperCase(),
      tipo: document.getElementById('adminMonedaTipo').value,
      status: document.getElementById('adminMonedaStatus').value
    };

    if (id) {
      mData.id_moneda = parseInt(id);
      await window.api.monedas.actualizar(mData);
    } else {
      await window.api.monedas.crear(mData);
    }

    document.getElementById('formAdminMoneda').reset();
    document.getElementById('adminMonedaId').value = '';
    document.getElementById('btnAdminGuardarMoneda').textContent = 'Guardar';
    await cargarListasBase();
    refrescarAdminMonedas();
  });

  // --- CRUD Admin: Relaciones de Cambio ---
  document.getElementById('formAdminRelacion').addEventListener('submit', async (e) => {
    e.preventDefault();
    const rel = {
      moneda_origen: document.getElementById('adminRelOrigen').value,
      moneda_destino: document.getElementById('adminRelDestino').value
    };
    if (rel.moneda_origen === rel.moneda_destino) {
      alert('Las monedas de origen y destino no pueden ser iguales.');
      return;
    }
    await window.api.relaciones.crear(rel);
    await cargarListasBase();
    refrescarAdminRelaciones();
  });

  // --- Módulo Reportes: Filtrados y Compilados ---
  document.getElementById('btnGenerarReporte').addEventListener('click', compilarReporteContable);

  document.getElementById('btnExportPDFReporte').addEventListener('click', async () => {
    try {
      const filtros = obtenerFiltrosReportes();
      const path = await window.api.reportes.descargarPDF(filtros);
      mostrarNotificacionDescarga(path);
    } catch (err) {
      console.error('Error al generar PDF en módulo reportes:', err);
      alert('Error al generar reporte PDF: ' + err.message);
    }
  });

  document.getElementById('btnExportExcelReporte').addEventListener('click', async () => {
    try {
      const filtros = obtenerFiltrosReportes();
      const path = await window.api.reportes.descargarExcel(filtros);
      mostrarNotificacionDescarga(path);
    } catch (err) {
      console.error('Error al generar Excel en módulo reportes:', err);
      alert('Error al generar reporte Excel: ' + err.message);
    }
  });

  // --- Mantenimiento - Backup ---
  document.getElementById('btnBackupLocal').addEventListener('click', async () => {
    const statusEl = document.getElementById('backupStatus');
    statusEl.textContent = 'Procesando respaldo local...';
    try {
      const backupPath = await window.api.backup.exportarLocal();
      statusEl.className = 'mt-2 text-center text-xs text-emerald-450 font-semibold';
      statusEl.textContent = `Respaldo exitoso en: ${backupPath}`;
    } catch (err) {
      statusEl.className = 'mt-2 text-center text-xs text-rose-500 font-semibold';
      statusEl.textContent = `Error: ${err.message}`;
    }
  });

  const btnDescargarDB = document.getElementById('btnDescargarDB');
  const modalBackup = document.getElementById('backupDownloadModal');
  const formBackup = document.getElementById('backupDownloadForm');
  const btnCancelBackup = document.getElementById('btnCancelBackupDownload');
  const passBackup = document.getElementById('backupDownloadPassword');

  if (btnDescargarDB) {
    btnDescargarDB.addEventListener('click', () => {
      if (modalBackup) {
        passBackup.value = '';
        modalBackup.classList.remove('hidden');
        passBackup.focus();
      }
    });
  }

  if (btnCancelBackup) {
    btnCancelBackup.addEventListener('click', () => {
      if (modalBackup) {
        modalBackup.classList.add('hidden');
      }
    });
  }

  if (formBackup) {
    formBackup.addEventListener('submit', async (e) => {
      e.preventDefault();
      const password = passBackup.value;
      if (!password) return;

      const valido = await window.api.auth.validarPassword(password);
      if (valido) {
        modalBackup.classList.add('hidden');
        try {
          const res = await window.api.backup.descargarArchivo();
          if (res.success) {
            mostrarNotificacionDescarga(res.path);
          } else if (res.cancelled) {
            console.log('Exportación cancelada por el usuario.');
          }
        } catch (err) {
          alert('Error al descargar base de datos: ' + err.message);
        }
      } else {
        alert('Clave maestra incorrecta. Autorización denegada.');
        passBackup.value = '';
        passBackup.focus();
      }
    });
  }

  // --- Google Drive Cloud Sync Listeners ---
  document.getElementById('btnDriveConectar').addEventListener('click', async () => {
    if (driveState.conectado) {
      if (confirm('¿Está seguro de cerrar sesión y desconectar Google Drive?')) {
        try {
          await window.api.drive.desconectar();
          alert('Cuenta de Google desconectada.');
          await refrescarDriveEstado();
        } catch (err) {
          alert('Error al desconectar: ' + err.message);
        }
      }
    } else {
      try {
        const badge = document.getElementById('driveBadgeEstado');
        const btnConectar = document.getElementById('btnDriveConectar');
        if (badge) {
          badge.textContent = 'CONECTANDO...';
          badge.className = 'px-2 py-0.5 rounded text-[8px] font-bold bg-amber-950 text-amber-400 border border-amber-900';
        }
        if (btnConectar) {
          btnConectar.textContent = 'Esperando navegador externo...';
        }
        const res = await window.api.drive.conectar();
        if (res.success) {
          alert(`Cuenta vinculada con éxito: ${res.email}`);
        }
        await refrescarDriveEstado();
      } catch (err) {
        alert('Error al vincular cuenta: ' + err.message);
        await refrescarDriveEstado();
      }
    }
  });

  document.getElementById('chkDriveSyncAuto').addEventListener('change', async (e) => {
    try {
      await window.api.opciones.set('drive_sync_auto', e.target.checked.toString());
      await refrescarDriveEstado();
    } catch (err) {
      console.error(err);
    }
  });

  document.getElementById('btnDriveSubirAhora').addEventListener('click', async () => {
    try {
      const badge = document.getElementById('driveBadgeEstado');
      if (badge) {
        badge.textContent = 'SUBIENDO...';
        badge.className = 'px-2 py-0.5 rounded text-[8px] font-bold bg-amber-950 text-amber-400 border border-amber-900';
      }
      await window.api.drive.subirAhora();
      alert('Respaldo en la nube subido con éxito.');
      await refrescarDriveEstado();
    } catch (err) {
      alert('Error al subir respaldo: ' + err.message);
      await refrescarDriveEstado();
    }
  });

  document.getElementById('btnDriveDescargarAhora').addEventListener('click', async () => {
    try {
      const badge = document.getElementById('driveBadgeEstado');
      if (badge) {
        badge.textContent = 'DESCARGANDO...';
        badge.className = 'px-2 py-0.5 rounded text-[8px] font-bold bg-amber-950 text-amber-400 border border-amber-900';
      }
      const res = await window.api.drive.descargarAhora();
      if (res.updated) {
        if (confirm('Se ha descargado una base de datos más reciente de Google Drive.\n\nPara poder cargar los nuevos datos contables transaccionales, es necesario reiniciar la aplicación.\n\n¿Desea reiniciar la aplicación ahora?')) {
          await window.api.app.relaunch();
        }
      } else {
        alert('La base de datos local ya se encuentra al día con la nube.');
      }
      await refrescarDriveEstado();
    } catch (err) {
      alert('Error al descargar base de datos: ' + err.message);
      await refrescarDriveEstado();
    }
  });

  document.getElementById('btnGuardarCredencialesDrive').addEventListener('click', async () => {
    const cid = document.getElementById('txtDriveClientId').value.trim();
    const csec = document.getElementById('txtDriveClientSecret').value.trim();
    try {
      await window.api.opciones.set('drive_client_id', cid);
      await window.api.opciones.set('drive_client_secret', csec);
      alert('Credenciales personalizadas guardadas con éxito.\n\nPor favor, cierre la sesión actual y vuelva a vincular su cuenta de Google.');
      await refrescarDriveEstado();
    } catch (err) {
      alert('Error al guardar credenciales: ' + err.message);
    }
  });

  // --- Mantenimiento - Cambiar Clave ---
  document.getElementById('formCambiarClave').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nueva = document.getElementById('optNuevaClave').value;
    await window.api.auth.inicializarPassword(nueva);
    alert('Clave de seguridad del sistema actualizada con éxito.');
    document.getElementById('optNuevaClave').value = '';
  });

  // --- Clientes: Cerrar Historial Modal ---
  document.getElementById('btnCerrarHistorial').addEventListener('click', () => {
    document.getElementById('clienteHistorialModal').classList.add('hidden');
    state.clienteActivoHistorial = null;
  });

  document.getElementById('btnFiltrarHistorial').addEventListener('click', cargarHistorialCliente);

  // --- E-Commerce Tabs Navigation ---
  const tabEcoLogistica = document.getElementById('btnTabEcoLogistica');
  const tabEcoProductos = document.getElementById('btnTabEcoProductos');
  if (tabEcoLogistica && tabEcoProductos) {
    tabEcoLogistica.addEventListener('click', () => {
      tabEcoLogistica.className = 'px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-650/10 text-indigo-400 border border-indigo-500/20 transition';
      tabEcoProductos.className = 'px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-850 transition';
      document.getElementById('subview-eco-logistica').classList.remove('hidden');
      document.getElementById('subview-eco-productos').classList.add('hidden');
    });

    tabEcoProductos.addEventListener('click', () => {
      tabEcoProductos.className = 'px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-650/10 text-indigo-400 border border-indigo-500/20 transition';
      tabEcoLogistica.className = 'px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-850 transition';
      document.getElementById('subview-eco-productos').classList.remove('hidden');
      document.getElementById('subview-eco-logistica').classList.add('hidden');
      refrescarEcoProductos();
    });
  }

  // --- Formulario Productos E-Commerce (CRUD) ---
  const formEcoProd = document.getElementById('formEcoProducto');
  if (formEcoProd) {
    const previewContainer = document.getElementById('ecoProductoImagenPreviewContainer');
    const previewImg = document.getElementById('ecoProductoImagenPreview');

    const resetFormEco = () => {
      formEcoProd.reset();
      document.getElementById('ecoProductoId').value = '';
      document.getElementById('ecoProductoImagen').value = '';
      if (previewImg && previewContainer) {
        previewImg.src = '';
        previewContainer.classList.add('hidden');
      }
      document.getElementById('formEcoProductoTitulo').textContent = 'Registrar Producto';
      document.getElementById('btnCancelarEcoProducto').classList.add('hidden');
    };

    const btnCargar = document.getElementById('btnCargarImagenEco');
    if (btnCargar) {
      btnCargar.addEventListener('click', async () => {
        try {
          const res = await window.api.ecommerceProductos.seleccionarImagen();
          if (res.success) {
            document.getElementById('ecoProductoImagen').value = res.fileName;
            if (previewImg && previewContainer) {
              previewImg.src = `../../assets/img/products/${res.fileName}`;
              previewContainer.classList.remove('hidden');
            }
          }
        } catch (err) {
          alert('Error al seleccionar imagen: ' + err.message);
        }
      });
    }

    formEcoProd.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('ecoProductoId').value;
      const pData = {
        nombre: document.getElementById('ecoProductoNombre').value.trim(),
        sku: document.getElementById('ecoProductoSku').value.trim() || null,
        monto_costo: parseFloat(document.getElementById('ecoProductoMontoCosto').value) || 0.0,
        moneda_costo: document.getElementById('ecoProductoMonedaCosto').value,
        cambio_costo: parseFloat(document.getElementById('ecoProductoCambioCosto').value) || 1.0,
        stock: parseInt(document.getElementById('ecoProductoStock').value) || 0,
        precio_venta: parseFloat(document.getElementById('ecoProductoPrecioVenta').value) || 0.0,
        es_oferta: document.getElementById('ecoProductoEsOferta').checked ? 1 : 0,
        imagen: document.getElementById('ecoProductoImagen').value || null,
        observaciones: document.getElementById('ecoProductoObservaciones').value.trim() || null
      };

      try {
        if (id) {
          pData.id_producto = parseInt(id);
          await window.api.ecommerceProductos.actualizar(pData);
          alert('Producto de catálogo actualizado.');
        } else {
          await window.api.ecommerceProductos.crear(pData);
          alert('Producto agregado al catálogo.');
        }
        resetFormEco();
        await refrescarEcoProductos();
        await refrescarEcommerceStock();
      } catch (err) {
        alert('Error al guardar producto: ' + err.message);
      }
    });

    document.getElementById('btnCancelarEcoProducto').addEventListener('click', () => {
      resetFormEco();
    });
  }

  // --- Botón Descargar Catálogo PDF ---
  const btnDescargarCat = document.getElementById('btnDescargarCatalogoPDF');
  const ecoModal = document.getElementById('ecoCatalogPipelineModal');
  const btnCloseEcoModal = document.getElementById('btnCloseEcoCatalogModal');
  const btnCancelEcoModal = document.getElementById('btnCancelEcoCatalog');
  const btnConfirmEcoModal = document.getElementById('btnConfirmEcoCatalog');
  const tablaPipeline = document.getElementById('tablaPipelineProductos');

  let pipelineProductos = [];

  if (btnDescargarCat) {
    btnDescargarCat.addEventListener('click', async () => {
      const chkSelected = document.querySelectorAll('.chk-select-eco:checked');
      let selectedIds = Array.from(chkSelected).map(cb => parseInt(cb.getAttribute('data-id')));
      
      if (selectedIds.length === 0) {
        selectedIds = stateProductosEco.map(p => p.id_producto);
      }

      pipelineProductos = stateProductosEco.filter(p => selectedIds.includes(p.id_producto)).map(p => ({...p}));

      if (pipelineProductos.length === 0) {
        alert('No hay productos disponibles para generar el catálogo.');
        return;
      }

      if (tablaPipeline) {
        tablaPipeline.innerHTML = '';
        pipelineProductos.forEach(p => {
          let equivCosto = p.monto_costo;
          if (p.moneda_costo !== state.opciones.moneda_principal) {
            equivCosto = p.monto_costo * p.cambio_costo;
          }
          
          const tr = `
            <tr id="pipelineRow_${p.id_producto}">
              <td class="p-3">
                <div class="font-bold text-slate-200">${p.nombre}</div>
                <div class="text-[10px] text-slate-500 font-mono">${p.sku || 'SIN SKU'}</div>
              </td>
              <td class="p-3 text-right font-mono text-slate-400">
                ${formatearNumeroVisual(equivCosto)} ${state.opciones.moneda_principal}
              </td>
              <td class="p-3 text-right">
                <input type="number" step="any" value="${p.precio_venta || ''}" placeholder="0.00" 
                  id="pipeVenta_${p.id_producto}" 
                  class="glass-input rounded-lg px-2 py-1 text-xs text-right font-semibold w-24 text-indigo-400">
              </td>
              <td class="p-3 text-center">
                <input type="checkbox" ${p.es_oferta === 1 ? 'checked' : ''} 
                  id="pipeOferta_${p.id_producto}"
                  class="h-4 w-4 accent-rose-650 bg-slate-900 border-slate-800 rounded cursor-pointer">
              </td>
              <td class="p-3">
                <div class="flex items-center gap-2">
                  <div class="h-8 w-8 bg-slate-900/60 rounded border border-slate-800 flex items-center justify-center overflow-hidden">
                    <img id="pipePreview_${p.id_producto}" src="${p.imagen ? `../../assets/img/products/${p.imagen}` : ''}" 
                      class="h-full w-full object-contain ${p.imagen ? '' : 'hidden'}">
                  </div>
                  <input type="hidden" id="pipeImgVal_${p.id_producto}" value="${p.imagen || ''}">
                  <button type="button" onclick="pipelineExaminarImagen(${p.id_producto})" 
                    class="bg-slate-800 hover:bg-slate-700 text-slate-350 text-[10px] px-2 py-1 rounded border border-slate-750 transition">
                    Examinar...
                  </button>
                </div>
              </td>
            </tr>
          `;
          tablaPipeline.insertAdjacentHTML('beforeend', tr);
        });
      }

      if (ecoModal) {
        ecoModal.classList.remove('hidden');
      }
    });
  }

  window.pipelineExaminarImagen = async (id) => {
    try {
      const res = await window.api.ecommerceProductos.seleccionarImagen();
      if (res.success) {
        const inputHidden = document.getElementById(`pipeImgVal_${id}`);
        const imgEl = document.getElementById(`pipePreview_${id}`);
        if (inputHidden) inputHidden.value = res.fileName;
        if (imgEl) {
          imgEl.src = `../../assets/img/products/${res.fileName}`;
          imgEl.classList.remove('hidden');
        }
      }
    } catch (err) {
      alert('Error al seleccionar imagen: ' + err.message);
    }
  };

  const closeEcoCatalogModal = () => {
    if (ecoModal) ecoModal.classList.add('hidden');
  };

  if (btnCloseEcoModal) btnCloseEcoModal.addEventListener('click', closeEcoCatalogModal);
  if (btnCancelEcoModal) btnCancelEcoModal.addEventListener('click', closeEcoCatalogModal);

  if (btnConfirmEcoModal) {
    btnConfirmEcoModal.addEventListener('click', async () => {
      const updatedProducts = [];
      try {
        for (const p of pipelineProductos) {
          const precio_venta = parseFloat(document.getElementById(`pipeVenta_${p.id_producto}`).value) || 0.0;
          const es_oferta = document.getElementById(`pipeOferta_${p.id_producto}`).checked ? 1 : 0;
          const imagen = document.getElementById(`pipeImgVal_${p.id_producto}`).value || null;

          p.precio_venta = precio_venta;
          p.es_oferta = es_oferta;
          p.imagen = imagen;

          await window.api.ecommerceProductos.actualizar(p);
          updatedProducts.push(p);
        }

        await refrescarEcoProductos();

        const selLayout = document.getElementById('selLayoutCatalogo').value;
        const downloadPath = await window.api.reportes.descargarCatalogoPDF(updatedProducts, selLayout);
        mostrarNotificacionDescarga(downloadPath);
        closeEcoCatalogModal();
      } catch (err) {
        alert('Error al guardar y descargar el catálogo: ' + err.message);
      }
    });
  }
}

function obtenerFiltrosReportes() {
  const temporal = document.getElementById('repFiltroTiempo').value;
  const clienteId = document.getElementById('repCliente').value;
  const filtros = {};

  if (clienteId) filtros.id_cliente = parseInt(clienteId);

  if (temporal === 'dia') {
    const dia = document.getElementById('repFechaUnica').value;
    if (dia) filtros.fecha_inicio = dia;
  } else if (temporal === 'rango') {
    const inicio = document.getElementById('repFechaInicio').value;
    const fin = document.getElementById('repFechaFin').value;
    if (inicio && fin) {
      filtros.fecha_inicio = inicio;
      filtros.fecha_fin = fin;
    }
  }
  return filtros;
}

// Actualizar el tipo de cambio basándose en cotización oficial si se selecciona FIJO
function actualizarTasaAutomatica() {
  const moneda = document.getElementById('movMoneda').value;
  const modalidad = document.getElementById('movModalidadCambio').value;
  const inputValor = document.getElementById('movValorCambio');

  if (moneda === state.opciones.moneda_principal) {
    inputValor.value = 1;
    inputValor.readOnly = true;
    return;
  }

  inputValor.readOnly = false;

  if (modalidad === 'FIJO') {
    // Buscar la cotización cargada en el sistema para el par correspondiente
    // e.g. USD/USDT (o la moneda principal)
    const par = `${moneda}/${state.opciones.moneda_principal}`;
    const tasa = state.cambios.find(c => c.par_divisa === par || c.par_divisa === `${state.opciones.moneda_principal}/${moneda}`);
    if (tasa) {
      inputValor.value = tasa.valor_compra;
    } else {
      inputValor.value = 1.0;
    }
  }
}

// ==========================================
// MÉTODOS DE SOPORTE CRUD CLIENTE
// ==========================================
async function editarCliente(id) {
  const cliente = state.clientes.find(c => c.id_cliente === id);
  if (!cliente) return;

  document.getElementById('clienteId').value = cliente.id_cliente;
  document.getElementById('clienteNombre').value = cliente.nombre;
  document.getElementById('clienteDocumento').value = cliente.documento;
  document.getElementById('clienteTipo').value = cliente.tipo_cliente;
  document.getElementById('clienteTelefono').value = cliente.telefono;
  document.getElementById('clienteMail').value = cliente.mail;
  document.getElementById('clienteStatus').value = cliente.status || 'ACTIVO';
  document.getElementById('clienteObservaciones').value = cliente.observaciones;

  resetearSeleccionCuentas();

  document.getElementById('clienteNombre').focus();
}

window.editarCliente = editarCliente;

async function eliminarCliente(id) {
  if (confirm('¿Está seguro de eliminar este cliente? Se borrarán todas sus cuentas y registros asociados.')) {
    await window.api.clientes.eliminar(id);
    await cargarListasBase();
    await refrescarClientes();
    resetearSeleccionCuentas();
  }
}

window.eliminarCliente = eliminarCliente;

async function eliminarCuenta(id) {
  if (confirm('¿Está seguro de eliminar esta cuenta?')) {
    await window.api.cuentas.eliminar(id);
    await refrescarCuentas(state.clienteActivoParaCuentas);
  }
}

window.eliminarCuenta = eliminarCuenta;

async function eliminarMovimiento(id) {
  if (confirm('¿Está seguro de eliminar esta transacción del ledger? Esta operación impactará inmediatamente en todos los balances contables.')) {
    await window.api.movimientos.eliminar(id);
    if (document.getElementById('view-gastos').classList.contains('active')) {
      await refrescarGastosPersonales();
    } else {
      await refrescarMovimientos();
    }
    await actualizarDashboard();
  }
}

async function liquidarMovimiento(id) {
  if (confirm('¿Desea liquidar esta transacción pendiente y sumarla al balance general?')) {
    await window.api.movimientos.liquidar(id);
    await refrescarMovimientos();
    await actualizarDashboard();
  }
}

window.eliminarMovimiento = eliminarMovimiento;
window.liquidarMovimiento = liquidarMovimiento;

// ==========================================
// DASHBOARD & RENDIMIENTO DE KPIS
// ==========================================
async function actualizarDashboard() {
  const todos = await window.api.movimientos.listar({});

  let balanceGeneral = 0.0;
  let efectivo = 0.0;
  let bancos = 0.0;
  let cripto = 0.0;

  let ecoCompra = 0.0;
  let ecoVenta = 0.0;
  let ecoItems = 0;

  // KPIs de Gastos Personales (Día y Mes)
  let gastoPersonalDia = 0.0;
  let gastoPersonalMes = 0.0;
  const hoyStr = new Date().toISOString().split('T')[0];
  const mesStr = hoyStr.substring(0, 7); // YYYY-MM

  // Mapa de Saldos de Mis Cuentas Propias (Empresa)
  const saldosMisCuentas = {};
  state.misCuentas.forEach(c => {
    saldosMisCuentas[c.id_mi_cuenta] = {
      nombre: c.nombre_cuenta,
      moneda: c.moneda,
      referencia: c.referencia || '--',
      saldo: 0.0
    };
  });

  // Cuentas especiales asignadas
  const principalMiCtaId = await window.api.opciones.get('cuenta_principal_id') || null;
  const gastosMiCtaId = await window.api.opciones.get('cuenta_gastos_personales_id') || null;

  let pendientesCobrar = 0.0;
  let pendientesCobrarCant = 0;
  let pendientesPagar = 0.0;
  let pendientesPagarCant = 0;
  const todosPendientes = [];

  todos.forEach(m => {
    const esCompra = m.tipo_transaccion.includes('COMPRA') || m.tipo_transaccion === 'GASTO' || m.tipo_transaccion === 'GASTO_PERSONAL';
    const esVenta = m.tipo_transaccion.includes('VENTA');
    const esAjuste = m.tipo_transaccion === 'AJUSTE';

    let valorUSDT = m.monto;
    if (m.moneda !== state.opciones.moneda_principal) {
      if (m.moneda === 'PYG' || m.moneda === 'ARS') {
        valorUSDT = m.monto / m.valor_cambio;
      } else {
        valorUSDT = m.monto * m.valor_cambio;
      }
    }

    if (m.status_operacion === 'PENDIENTE') {
      todosPendientes.push(m);
      if (m.tipo_categoria === 'INGRESO' || esVenta) {
        pendientesCobrar += valorUSDT;
        pendientesCobrarCant++;
      } else {
        pendientesPagar += valorUSDT;
        pendientesPagarCant++;
      }
      return; // EXCLUIDO de los balances generales activos
    }

    const valorContable = valorUSDT * signoMovimiento(m.tipo_transaccion);
    balanceGeneral += valorContable;

    // Clasificación por tipo de cuenta
    if (m.moneda === state.opciones.moneda_principal) {
      cripto += valorContable;
    } else if (m.moneda === 'PYG') {
      efectivo += valorContable;
    } else {
      bancos += valorContable;
    }

    // Impacto dinámico en los saldos de Mis Cuentas Propias
    // Si la transacción no tiene id_cliente, asumimos que es una operación directa de nuestras cuentas
    if (!m.id_cliente && saldosMisCuentas[m.id_cuenta]) {
      saldosMisCuentas[m.id_cuenta].saldo += m.monto * signoMovimiento(m.tipo_transaccion);
    }

    // Métricas logísticas E-Commerce
    if (m.tipo_transaccion === 'ECOMMERCE / COMPRA') {
      ecoCompra += valorUSDT;
      ecoItems++;
    } else if (m.tipo_transaccion === 'ECOMMERCE / VENTA') {
      ecoVenta += valorUSDT;
      ecoItems++;
    }

    // Sumar Gastos Personales del día y del mes
    if (m.tipo_transaccion === 'GASTO_PERSONAL') {
      if (m.fecha_contable === hoyStr) {
        gastoPersonalDia += valorUSDT;
      }
      if (m.fecha_contable.startsWith(mesStr)) {
        gastoPersonalMes += valorUSDT;
      }
    }
  });

  // Pintar KPIs principales en Dashboard
  document.getElementById('kpiBalanceGeneral').innerHTML = `${formatearNumeroVisual(balanceGeneral)} <span class="text-sm text-indigo-400">${state.opciones.moneda_principal}</span>`;
  document.getElementById('kpiEfectivo').innerHTML = `${formatearNumeroVisual(efectivo)} <span class="text-sm text-indigo-400">${state.opciones.moneda_principal}</span>`;
  document.getElementById('kpiBancos').innerHTML = `${formatearNumeroVisual(bancos)} <span class="text-sm text-indigo-400">${state.opciones.moneda_principal}</span>`;
  document.getElementById('kpiCripto').innerHTML = `${formatearNumeroVisual(cripto)} <span class="text-sm text-indigo-400">${state.opciones.moneda_principal}</span>`;

  // Pintar KPIs de transacciones pendientes
  document.getElementById('kpiPendientesCobrar').innerHTML = `${formatearNumeroVisual(pendientesCobrar)} <span class="text-sm text-indigo-400">${state.opciones.moneda_principal}</span>`;
  document.getElementById('kpiPendientesCobrarCant').textContent = `${pendientesCobrarCant} transacciones pendientes de cobro`;
  document.getElementById('kpiPendientesPagar').innerHTML = `${formatearNumeroVisual(pendientesPagar)} <span class="text-sm text-rose-455">${state.opciones.moneda_principal}</span>`;
  document.getElementById('kpiPendientesPagarCant').textContent = `${pendientesPagarCant} transacciones pendientes de pago`;

  // Poblar tabla de pendientes prioritarios
  const panelPendientes = document.getElementById('panelPendientesPrioritarias');
  const tbodyPendientes = document.getElementById('tablaDashPendientes');
  tbodyPendientes.innerHTML = '';
  
  if (todosPendientes.length === 0) {
    panelPendientes.classList.add('hidden');
  } else {
    panelPendientes.classList.remove('hidden');
    todosPendientes.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    todosPendientes.forEach(p => {
      const esIng = p.tipo_categoria === 'INGRESO';
      const fechaCont = formatearFecha(p.fecha_contable);
      let varianteText = p.subcategoria_ocasional 
        ? `<span class="px-1.5 py-0.5 rounded text-[8px] font-bold bg-indigo-900/40 text-indigo-300 border border-indigo-500/20 uppercase tracking-wider">${p.subcategoria_ocasional}</span>` 
        : '';
      
      const tr = `
        <tr class="hover:bg-rose-950/20 text-xs border-b border-rose-950/20">
          <td class="p-2.5 font-bold text-slate-400">#${p.id_movimiento}</td>
          <td class="p-2.5">${fechaCont}</td>
          <td class="p-2.5">
            <div class="font-semibold text-slate-200">${p.cliente_nombre || 'N/A'}</div>
            <div class="text-[9px] text-indigo-400">${p.cuenta_nombre || 'N/A'}</div>
          </td>
          <td class="p-2.5">
            <span class="px-2 py-0.5 rounded text-[9px] font-bold ${esIng ? 'bg-emerald-950 text-emerald-400 border border-emerald-900' : 'bg-rose-955 text-rose-455 border border-rose-900'}">${p.tipo_transaccion}</span>
          </td>
          <td class="p-2.5 text-right font-bold ${esIng ? 'text-emerald-450' : 'text-rose-500'}">${esIng ? '+' : '-'}${formatearNumeroMoneda(p.monto, p.moneda)} ${p.moneda}</td>
          <td class="p-2.5">
            <div class="font-medium text-slate-350">${p.concepto} ${varianteText}</div>
          </td>
          <td class="p-2.5 text-center">
            <button onclick="liquidarMovimiento(${p.id_movimiento})" class="bg-rose-900/50 hover:bg-rose-800 text-rose-300 font-semibold px-2 py-1 rounded text-[10px] transition border border-rose-700/30">Liquidar</button>
          </td>
        </tr>
      `;
      tbodyPendientes.insertAdjacentHTML('beforeend', tr);
    });
  }

  document.getElementById('kpiEcoCompra').textContent = `${formatearNumeroVisual(ecoCompra)} ${state.opciones.moneda_principal}`;
  document.getElementById('kpiEcoVenta').textContent = `${formatearNumeroVisual(ecoVenta)} ${state.opciones.moneda_principal}`;
  document.getElementById('kpiEcoItems').textContent = `${ecoItems} Unidades`;

  // Gastos Personales KPIs (Doble Divisa)
  const ctaGastos = state.misCuentas.find(c => c.id_mi_cuenta == gastosMiCtaId);
  const monedaGastos = ctaGastos ? ctaGastos.moneda : 'PYG';

  let gastoPersonalDiaEquiv = 0.0;
  let gastoPersonalMesEquiv = 0.0;

  if (monedaGastos === state.opciones.moneda_principal) {
    gastoPersonalDiaEquiv = gastoPersonalDia;
    gastoPersonalMesEquiv = gastoPersonalMes;
  } else {
    const par1 = `${state.opciones.moneda_principal}/${monedaGastos}`;
    const par2 = `${monedaGastos}/${state.opciones.moneda_principal}`;
    const cotizacion = state.cambios.find(c => c.par_divisa === par1 || c.par_divisa === par2);
    if (cotizacion) {
      if (cotizacion.par_divisa === par1) {
        const factor = cotizacion.valor_venta || cotizacion.valor_compra || 1.0;
        gastoPersonalDiaEquiv = gastoPersonalDia * factor;
        gastoPersonalMesEquiv = gastoPersonalMes * factor;
      } else {
        const factor = cotizacion.valor_compra || cotizacion.valor_venta || 1.0;
        gastoPersonalDiaEquiv = gastoPersonalDia / factor;
        gastoPersonalMesEquiv = gastoPersonalMes / factor;
      }
    } else {
      if (monedaGastos === 'PYG') {
        gastoPersonalDiaEquiv = gastoPersonalDia * 7500;
        gastoPersonalMesEquiv = gastoPersonalMes * 7500;
      } else {
        gastoPersonalDiaEquiv = gastoPersonalDia;
        gastoPersonalMesEquiv = gastoPersonalMes;
      }
    }
  }

  document.getElementById('dashGastoDia').innerHTML = `
    <span class="text-sm font-semibold text-rose-400">${formatearNumeroMoneda(gastoPersonalDia, state.opciones.moneda_principal)} ${state.opciones.moneda_principal}</span>
    ${monedaGastos !== state.opciones.moneda_principal ? `<div class="text-[10px] text-slate-500 italic mt-0.5">~ ${formatearNumeroMoneda(gastoPersonalDiaEquiv, monedaGastos)} ${monedaGastos}</div>` : ''}
  `;
  document.getElementById('dashGastoMes').innerHTML = `
    <span class="text-sm font-semibold text-rose-455">${formatearNumeroMoneda(gastoPersonalMes, state.opciones.moneda_principal)} ${state.opciones.moneda_principal}</span>
    ${monedaGastos !== state.opciones.moneda_principal ? `<div class="text-[10px] text-slate-500 italic mt-0.5">~ ${formatearNumeroMoneda(gastoPersonalMesEquiv, monedaGastos)} ${monedaGastos}</div>` : ''}
  `;

  // Renderizar la tabla de balances de Mis Cuentas Propias en Dashboard
  const tbodyDashCta = document.getElementById('tablaDashMisCuentas');
  tbodyDashCta.innerHTML = '';
  const listCuentas = Object.values(saldosMisCuentas);
  if (listCuentas.length === 0) {
    tbodyDashCta.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-500">Sin cuentas registradas en Ajustes.</td></tr>`;
  } else {
    listCuentas.forEach(c => {
      tbodyDashCta.insertAdjacentHTML('beforeend', `
        <tr class="border-b border-slate-900 hover:bg-slate-900/30 text-xs">
          <td class="p-2.5 font-semibold text-slate-200">${c.nombre}</td>
          <td class="p-2.5 font-bold text-indigo-400">${c.moneda}</td>
          <td class="p-2.5 text-slate-400 font-mono">${c.referencia}</td>
          <td class="p-2.5 text-right font-bold whitespace-nowrap truncate max-w-[130px] ${c.saldo >= 0 ? 'text-emerald-450' : 'text-rose-500'}" title="${formatearNumeroMoneda(c.saldo, c.moneda)} ${c.moneda}">${formatearNumeroMoneda(c.saldo, c.moneda)} ${c.moneda}</td>
        </tr>
      `);
    });
  }

  dibujarGraficoFinanciero(todos);
  await actualizarOnboardingStatus();
}

function dibujarGraficoFinanciero(movimientos) {
  const canvas = document.getElementById('financialChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const rect = canvas.parentNode.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (movimientos.length === 0) {
    ctx.fillStyle = '#64748b';
    ctx.font = '14px Outfit';
    ctx.textAlign = 'center';
    ctx.fillText('Sin datos financieros para graficar', canvas.width / 2, canvas.height / 2);
    return;
  }

  const ultimos = movimientos.slice(0, 8).reverse();
  const padding = 40;
  const chartWidth = canvas.width - padding * 2;
  const chartHeight = canvas.height - padding * 2;

  const valores = ultimos.map(m => {
    let val = m.monto;
    if (m.moneda !== state.opciones.moneda_principal) {
      val = (m.moneda === 'PYG' || m.moneda === 'ARS') ? m.monto / m.valor_cambio : m.monto * m.valor_cambio;
    }
    return val;
  });

  const maxVal = Math.max(...valores, 100);
  const minVal = Math.min(...valores, 0);
  const valRange = maxVal - minVal;

  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding + (chartHeight / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(canvas.width - padding, y);
    ctx.stroke();

    ctx.fillStyle = '#475569';
    ctx.font = '10px Outfit';
    ctx.textAlign = 'right';
    const valY = maxVal - (valRange / 4) * i;
    ctx.fillText(Math.round(valY).toString(), padding - 10, y + 3);
  }

  const points = ultimos.map((m, idx) => {
    const x = padding + (chartWidth / (ultimos.length - 1 || 1)) * idx;
    let val = m.monto;
    if (m.moneda !== state.opciones.moneda_principal) {
      val = (m.moneda === 'PYG' || m.moneda === 'ARS') ? m.monto / m.valor_cambio : m.monto * m.valor_cambio;
    }
    const y = padding + chartHeight - ((val - minVal) / valRange) * chartHeight;
    return { x, y, label: `#${m.id_movimiento}`, isVenta: m.tipo_transaccion.includes('VENTA') };
  });

  const grad = ctx.createLinearGradient(0, padding, 0, padding + chartHeight);
  grad.addColorStop(0, 'rgba(99, 102, 241, 0.25)');
  grad.addColorStop(1, 'rgba(99, 102, 241, 0)');
  ctx.fillStyle = grad;

  ctx.beginPath();
  ctx.moveTo(points[0].x, padding + chartHeight);
  points.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(points[points.length - 1].x, padding + chartHeight);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#6366f1';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.stroke();

  points.forEach(p => {
    ctx.fillStyle = p.isVenta ? '#10b981' : '#f43f5e';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px Outfit';
    ctx.textAlign = 'center';
    ctx.fillText(p.label, p.x, padding + chartHeight + 15);
  });
}

// ==========================================
// AUTO ACTUALIZADOR DE SOFTWARE
// ==========================================
async function configurarActualizaciones() {
  const lblVersion = document.getElementById('lblAppVersion');
  if (lblVersion) {
    try {
      const version = await window.api.updater.getVersion();
      lblVersion.textContent = `Versión ${version}`;
    } catch (err) {
      console.error('Error al obtener la versión de la app:', err);
    }
  }

  const btn = document.getElementById('btnCheckUpdate');
  if (!btn) return;

  let isAutoCheck = true; // Diferenciar si el chequeo fue automático al inicio

  btn.addEventListener('click', () => {
    isAutoCheck = false;
    btn.textContent = 'Buscando...';
    btn.className = 'text-indigo-400 font-semibold';
    window.api.updater.buscarActualizaciones();
  });

  window.api.updater.onUpdateAvailable(() => {
    // Si fue automático, cambiamos el texto/estilo del botón de forma elegante y no invasiva
    btn.textContent = '¡Update Disponible!';
    btn.className = 'text-emerald-450 font-bold animate-pulse hover:text-emerald-300';

    // Si fue manual, preguntamos inmediatamente
    if (!isAutoCheck) {
      if (confirm('Nueva versión de FENIX Suite disponible. ¿Desea iniciar la descarga ahora en segundo plano?')) {
        btn.textContent = 'Descargando...';
        btn.className = 'text-indigo-400 font-semibold';
        window.api.updater.descargarActualizaciones();
      } else {
        btn.textContent = 'Buscar Updates';
        btn.className = 'text-indigo-400 font-semibold';
      }
    }
  });

  window.api.updater.onUpdateNotAvailable(() => {
    if (!isAutoCheck) {
      btn.textContent = 'Al día';
      alert('FENIX Suite está en su última versión.');
      setTimeout(() => {
        btn.textContent = 'Buscar Updates';
        btn.className = 'text-indigo-400 font-semibold';
      }, 3000);
    }
  });

  window.api.updater.onUpdateDownloaded(() => {
    btn.textContent = '¡Instalar Update!';
    btn.className = 'text-emerald-450 font-bold hover:text-emerald-300 animate-bounce';

    setTimeout(async () => {
      if (confirm('La actualización se ha descargado con éxito.\n\nPara aplicar los cambios y parches, FENIX Suite necesita reiniciarse.\n\n¿Desea realizar un respaldo final en la nube (si está habilitado) y reiniciar la aplicación ahora?')) {
        // Ejecutar respaldo preventivo en la nube si está activa la sesión
        try {
          const driveEstado = await window.api.drive.estado();
          if (driveEstado && driveEstado.conectado) {
            btn.textContent = 'Respaldando...';
            await window.api.drive.subirAhora();
          }
        } catch (err) {
          console.error('Error en respaldo antes de actualizar:', err);
        }
        btn.textContent = 'Reiniciando...';
        window.api.updater.instalarActualizaciones();
      }
    }, 100);
  });

  window.api.updater.onUpdateError((msg) => {
    btn.textContent = 'Buscar Updates';
    btn.className = 'text-indigo-400 font-semibold';
    if (!isAutoCheck) {
      alert('Error en el proceso de actualización:\n' + msg);
    }
  });
}

// Helper para formato de fecha visual
function formatearFecha(fechaStr) {
  if (!fechaStr) return '';
  const parts = fechaStr.split('-');
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// --- Guía de Inicio Guiado (Onboarding) ---
function configurarOnboarding() {
  const btnDismiss = document.getElementById('btnDismissOnboarding');
  if (btnDismiss) {
    btnDismiss.addEventListener('click', () => {
      sessionStorage.setItem('dismissedOnboarding', 'true');
      const panel = document.getElementById('onboardingPanel');
      if (panel) panel.classList.add('hidden');
    });
  }

  const linkEmpresa = document.getElementById('link-step-empresa');
  if (linkEmpresa) {
    linkEmpresa.addEventListener('click', (e) => {
      e.preventDefault();
      navegarA('view-opciones');
    });
  }

  const linkCuentas = document.getElementById('link-step-cuentas');
  if (linkCuentas) {
    linkCuentas.addEventListener('click', (e) => {
      e.preventDefault();
      navegarA('view-opciones');
    });
  }

  const linkCambios = document.getElementById('link-step-cambios');
  if (linkCambios) {
    linkCambios.addEventListener('click', (e) => {
      e.preventDefault();
      navegarA('view-cambios');
    });
  }

  const linkMov = document.getElementById('link-step-movimientos');
  if (linkMov) {
    linkMov.addEventListener('click', (e) => {
      e.preventDefault();
      navegarA('view-movimientos');
    });
  }
}

async function actualizarOnboardingStatus() {
  const panel = document.getElementById('onboardingPanel');
  if (!panel) return;

  if (sessionStorage.getItem('dismissedOnboarding') === 'true') {
    panel.classList.add('hidden');
    return;
  }

  try {
    // 1. Datos Empresa
    const empresaNombre = await window.api.opciones.get('empresa_nombre');
    const empresaRuc = await window.api.opciones.get('empresa_ruc');
    const paso1Completado = empresaNombre && empresaNombre !== '-- No Configurado --' && empresaRuc && empresaRuc !== '-- No Configurado --';

    const stepEmpresa = document.getElementById('step-empresa');
    const linkEmpresa = document.getElementById('link-step-empresa');
    if (paso1Completado) {
      stepEmpresa.className = 'bg-emerald-950/10 border border-emerald-500/20 p-3 rounded-xl flex items-start gap-3 transition';
      stepEmpresa.querySelector('.step-num').className = 'step-num text-xs font-bold bg-emerald-500 text-white h-5 w-5 rounded-full flex items-center justify-center shrink-0';
      stepEmpresa.querySelector('.step-num').textContent = '✓';
      if (linkEmpresa) linkEmpresa.innerHTML = '<span class="text-emerald-450 font-bold text-[10px]">Listo</span>';
    } else {
      stepEmpresa.className = 'bg-slate-900/50 border border-slate-800 p-3 rounded-xl flex items-start gap-3 transition';
      stepEmpresa.querySelector('.step-num').className = 'step-num text-xs font-bold bg-slate-800 text-slate-400 h-5 w-5 rounded-full flex items-center justify-center shrink-0';
      stepEmpresa.querySelector('.step-num').textContent = '1';
      if (linkEmpresa) linkEmpresa.innerHTML = 'Configurar →';
    }

    // 2. Mis Cuentas Propias
    const paso2Completado = state.misCuentas && state.misCuentas.length > 0;
    const stepCuentas = document.getElementById('step-cuentas');
    const linkCuentas = document.getElementById('link-step-cuentas');
    if (paso2Completado) {
      stepCuentas.className = 'bg-emerald-950/10 border border-emerald-500/20 p-3 rounded-xl flex items-start gap-3 transition';
      stepCuentas.querySelector('.step-num').className = 'step-num text-xs font-bold bg-emerald-500 text-white h-5 w-5 rounded-full flex items-center justify-center shrink-0';
      stepCuentas.querySelector('.step-num').textContent = '✓';
      if (linkCuentas) linkCuentas.innerHTML = '<span class="text-emerald-450 font-bold text-[10px]">Listo</span>';
    } else {
      stepCuentas.className = 'bg-slate-900/50 border border-slate-800 p-3 rounded-xl flex items-start gap-3 transition';
      stepCuentas.querySelector('.step-num').className = 'step-num text-xs font-bold bg-slate-800 text-slate-400 h-5 w-5 rounded-full flex items-center justify-center shrink-0';
      stepCuentas.querySelector('.step-num').textContent = '2';
      if (linkCuentas) linkCuentas.innerHTML = 'Crear →';
    }

    // 3. Tasas del Día
    const paso3Completado = state.cambios && state.cambios.length > 0;
    const stepCambios = document.getElementById('step-cambios');
    const linkCambios = document.getElementById('link-step-cambios');
    if (paso3Completado) {
      stepCambios.className = 'bg-emerald-950/10 border border-emerald-500/20 p-3 rounded-xl flex items-start gap-3 transition';
      stepCambios.querySelector('.step-num').className = 'step-num text-xs font-bold bg-emerald-500 text-white h-5 w-5 rounded-full flex items-center justify-center shrink-0';
      stepCambios.querySelector('.step-num').textContent = '✓';
      if (linkCambios) linkCambios.innerHTML = '<span class="text-emerald-450 font-bold text-[10px]">Listo</span>';
    } else {
      stepCambios.className = 'bg-slate-900/50 border border-slate-800 p-3 rounded-xl flex items-start gap-3 transition';
      stepCambios.querySelector('.step-num').className = 'step-num text-xs font-bold bg-slate-800 text-slate-400 h-5 w-5 rounded-full flex items-center justify-center shrink-0';
      stepCambios.querySelector('.step-num').textContent = '3';
      if (linkCambios) linkCambios.innerHTML = 'Fijar →';
    }

    // 4. Registrar Operaciones
    const paso4Completado = state.movimientos && state.movimientos.length > 0;
    const stepMov = document.getElementById('step-movimientos');
    const linkMov = document.getElementById('link-step-movimientos');
    if (paso4Completado) {
      stepMov.className = 'bg-emerald-950/10 border border-emerald-500/20 p-3 rounded-xl flex items-start gap-3 transition';
      stepMov.querySelector('.step-num').className = 'step-num text-xs font-bold bg-emerald-500 text-white h-5 w-5 rounded-full flex items-center justify-center shrink-0';
      stepMov.querySelector('.step-num').textContent = '✓';
      if (linkMov) linkMov.innerHTML = '<span class="text-emerald-450 font-bold text-[10px]">Listo</span>';
    } else {
      stepMov.className = 'bg-slate-900/50 border border-slate-800 p-3 rounded-xl flex items-start gap-3 transition';
      stepMov.querySelector('.step-num').className = 'step-num text-xs font-bold bg-slate-800 text-slate-400 h-5 w-5 rounded-full flex items-center justify-center shrink-0';
      stepMov.querySelector('.step-num').textContent = '4';
      if (linkMov) linkMov.innerHTML = 'Ir a Ledger →';
    }

    const todoCompletado = paso1Completado && paso2Completado && paso3Completado && paso4Completado;
    if (todoCompletado) {
      panel.classList.add('hidden');
    } else {
      panel.classList.remove('hidden');
    }
  } catch (err) {
    console.error('Error al actualizar onboarding:', err);
  }
}

// ==========================================
// CONFIGURACIÓN DE AJUSTES Y CALCULADORA FLOTANTE
// ==========================================
async function configurarAjustesYCalculadora() {
  // --- TABS DE AJUSTES ---
  const btnTabAjustesSistema = document.getElementById('btnTabAjustesSistema');
  const btnTabAjustesFinancieros = document.getElementById('btnTabAjustesFinancieros');
  const panelAjustesSistema = document.getElementById('panelAjustesSistema');
  const panelAjustesFinancieros = document.getElementById('panelAjustesFinancieros');

  if (btnTabAjustesSistema && btnTabAjustesFinancieros) {
    btnTabAjustesSistema.addEventListener('click', () => {
      btnTabAjustesSistema.className = "flex-1 px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 text-white transition duration-200";
      btnTabAjustesFinancieros.className = "flex-1 px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 transition duration-200";
      panelAjustesSistema.classList.remove('hidden');
      panelAjustesFinancieros.classList.add('hidden');
    });

    btnTabAjustesFinancieros.addEventListener('click', async () => {
      btnTabAjustesFinancieros.className = "flex-1 px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 text-white transition duration-200";
      btnTabAjustesSistema.className = "flex-1 px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 transition duration-200";
      panelAjustesSistema.classList.add('hidden');
      panelAjustesFinancieros.classList.remove('hidden');
      await refrescarPlataformas();
    });
  }

  // --- SELECTOR MÉTODO DE MÁRGENES / COSTEO ---
  const selMargen = document.getElementById('selMargenMetodo');
  const lblMargen = document.getElementById('lblMargenDescripcion');
  if (selMargen) {
    const margenMetodo = await window.api.opciones.get('margen_metodo') || 'FIFO';
    selMargen.value = margenMetodo;
    const updateMargenDesc = () => {
      if (selMargen.value === 'FIFO') {
        lblMargen.textContent = 'FIFO (First-In, First-Out): Los primeros activos en ingresar son los primeros en salir. Recomendado para criptomonedas y contabilidad fiscal tradicional.';
      } else {
        lblMargen.textContent = 'CPP (Costo Promedio Ponderado): El costo de salida se calcula promediando el costo total de los activos disponibles. Recomendado para stocks físicos y retail.';
      }
    };
    updateMargenDesc();
    selMargen.addEventListener('change', async () => {
      await window.api.opciones.set('margen_metodo', selMargen.value);
      updateMargenDesc();
    });
  }

  // --- COMISIONES DE RED ---
  const feeUSDTInput = document.getElementById('feeUSDT');
  const feePYGInput = document.getElementById('feePYG');
  const btnComisiones = document.getElementById('btnGuardarComisiones');

  if (feeUSDTInput && feePYGInput && btnComisiones) {
    feeUSDTInput.value = await window.api.opciones.get('fee_red_usdt') || '1.00';
    feePYGInput.value = await window.api.opciones.get('fee_red_pyg') || '0';

    btnComisiones.addEventListener('click', async () => {
      const u = feeUSDTInput.value || '1.00';
      const p = feePYGInput.value || '0';
      await window.api.opciones.set('fee_red_usdt', u);
      await window.api.opciones.set('fee_red_pyg', p);
      alert('Comisiones de red predeterminadas guardadas con éxito.');
    });
  }

  // --- TOGGLE DEL WIDGET CAMBIOS CHACO ---
  const chkChaco = document.getElementById('chkChacoWidget');
  if (chkChaco) {
    const chacoWidgetActivo = (await window.api.opciones.get('chaco_widget_visible')) !== 'false';
    chkChaco.checked = chacoWidgetActivo;

    const actualizarVisibilidadWidget = () => {
      const widgetPanel = document.querySelector('#view-cambios iframe')?.closest('.glass-panel');
      if (widgetPanel) {
        widgetPanel.style.display = chkChaco.checked ? 'flex' : 'none';
      }
    };

    // Esperar un momento a que renderice la vista
    setTimeout(actualizarVisibilidadWidget, 500);

    chkChaco.addEventListener('change', async () => {
      await window.api.opciones.set('chaco_widget_visible', chkChaco.checked ? 'true' : 'false');
      actualizarVisibilidadWidget();
    });
  }

  // --- CRUD PLATAFORMAS / BROKERS ---
  const formPlat = document.getElementById('formPlataforma');
  if (formPlat) {
    formPlat.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('platNombre').value;
      if (!name) return;
      await window.api.plataformas.crear(name);
      document.getElementById('platNombre').value = '';
      await refrescarPlataformas();
    });
  }

  // --- AJUSTES DE INTELIGENCIA ARTIFICIAL (GEMINI) ---
  const chkAI = document.getElementById('chkAIEnabled');
  const txtAIApiKey = document.getElementById('txtAIApiKey');
  const txtAICatalogPrompt = document.getElementById('txtAICatalogPrompt');
  const txtAIReceiptPrompt = document.getElementById('txtAIReceiptPrompt');
  const txtAIGroundingPrompt = document.getElementById('txtAIGroundingPrompt');
  const btnGuardarAI = document.getElementById('btnGuardarAjustesAI');

  if (chkAI && txtAIApiKey && txtAICatalogPrompt && txtAIReceiptPrompt && txtAIGroundingPrompt && btnGuardarAI) {
    // Cargar con valores optimizados por defecto si no existen
    chkAI.checked = (await window.api.opciones.get('ai_enabled')) === '1';
    txtAIApiKey.value = await window.api.opciones.get('ai_api_key') || '';

    const defaultCatalogPrompt = 'Analiza el siguiente catálogo comercial (imagen o documento PDF) y extrae una lista estructurada con los nombres de todos los productos legibles y sus respectivos precios. Si hay varios precios, prefiere el precio mayorista o de venta directa.';
    const defaultReceiptPrompt = 'Extrae la información financiera clave de esta captura de pantalla o fotografía de comprobante de transferencia bancaria o pago.';
    const defaultGroundingPrompt = 'Search Google for the product "{producto}". Find exactly 3 direct URLs of high-quality square (1:1 aspect ratio) images of this product, preferably with clean studio backgrounds. Return strictly a JSON object matching the schema.';

    txtAICatalogPrompt.value = await window.api.opciones.get('ai_prompt_catalogos') || defaultCatalogPrompt;
    txtAIReceiptPrompt.value = await window.api.opciones.get('ai_prompt_comprobantes') || defaultReceiptPrompt;
    txtAIGroundingPrompt.value = await window.api.opciones.get('ai_prompt_grounding') || defaultGroundingPrompt;

    // Guardar
    btnGuardarAI.addEventListener('click', async () => {
      await window.api.opciones.set('ai_enabled', chkAI.checked ? '1' : '0');
      await window.api.opciones.set('ai_api_key', txtAIApiKey.value.trim());
      await window.api.opciones.set('ai_prompt_catalogos', txtAICatalogPrompt.value.trim());
      await window.api.opciones.set('ai_prompt_comprobantes', txtAIReceiptPrompt.value.trim());
      await window.api.opciones.set('ai_prompt_grounding', txtAIGroundingPrompt.value.trim());
      alert('Configuración de Inteligencia Artificial (Gemini) guardada con éxito.');
    });
  }

  // --- CALCULADORA FLOTANTE ---
  const btnToggleCalc = document.getElementById('btnToggleCalculadora');
  const calcWin = document.getElementById('floatingCalculator');
  const btnCloseCalc = document.getElementById('btnCloseCalculadora');
  const calcDisplay = document.getElementById('calcDisplay');
  const calcHistory = document.getElementById('calcHistory');
  const btnCopyCalc = document.getElementById('btnCopyCalc');

  if (btnToggleCalc && calcWin) {
    btnToggleCalc.addEventListener('click', () => {
      calcWin.classList.toggle('hidden');
    });
  }
  if (btnCloseCalc && calcWin) {
    btnCloseCalc.addEventListener('click', () => {
      calcWin.classList.add('hidden');
    });
  }

  // Lógica arrastrable
  const header = document.getElementById('calcHeader');
  let isDragging = false;
  let startX, startY, startLeft, startTop;

  if (header && calcWin) {
    header.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startLeft = calcWin.offsetLeft;
      startTop = calcWin.offsetTop;
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      calcWin.style.left = `${startLeft + dx}px`;
      calcWin.style.top = `${startTop + dy}px`;
      calcWin.style.bottom = 'auto';
      calcWin.style.right = 'auto';
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
    });
  }

  // Lógica de cálculo
  let calcState = {
    expression: '',
    displayValue: '0',
    evaluated: false
  };

  window.calcClear = function() {
    calcState.expression = '';
    calcState.displayValue = '0';
    calcState.evaluated = false;
    updateCalcUI();
  };

  window.calcInput = function(char) {
    if (calcState.evaluated) {
      if (/[0-9.(]/.test(char)) {
        calcState.expression = '';
      } else {
        calcState.expression = calcState.displayValue;
      }
      calcState.evaluated = false;
    }

    if (calcState.expression === '' && /[0-9(]/.test(char)) {
      calcState.expression = char;
    } else {
      calcState.expression += char;
    }

    calcState.displayValue = calcState.expression;
    updateCalcUI();
  };

  window.calcEvaluate = function() {
    try {
      const cleanExpr = calcState.expression.replace(/×/g, '*').replace(/÷/g, '/');
      const result = new Function(`return (${cleanExpr})`)();
      calcState.displayValue = Number(parseFloat(result).toFixed(6)).toString();
      calcState.expression = calcState.displayValue;
      calcState.evaluated = true;
    } catch (err) {
      calcState.displayValue = 'Error';
      calcState.evaluated = true;
    }
    updateCalcUI();
  };

  function updateCalcUI() {
    if (calcDisplay) calcDisplay.value = calcState.displayValue;
    if (calcHistory) calcHistory.textContent = calcState.expression;
  }

  if (btnCopyCalc) {
    btnCopyCalc.addEventListener('click', () => {
      navigator.clipboard.writeText(calcState.displayValue);
      const tooltip = document.createElement('span');
      tooltip.textContent = 'Copiado!';
      tooltip.className = 'absolute -top-6 left-2 bg-indigo-600 text-white font-bold text-[9px] px-1.5 py-0.5 rounded border border-indigo-400 shadow z-50';
      btnCopyCalc.parentNode.appendChild(tooltip);
      setTimeout(() => tooltip.remove(), 1000);
    });
  }

  document.addEventListener('keydown', (e) => {
    if (calcWin.classList.contains('hidden')) return;
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
      return;
    }

    const key = e.key;
    if (/[0-9+\-*/.()]/.test(key)) {
      window.calcInput(key);
      e.preventDefault();
    } else if (key === 'Enter' || key === '=') {
      window.calcEvaluate();
      e.preventDefault();
    } else if (key === 'Backspace') {
      calcState.expression = calcState.expression.slice(0, -1);
      calcState.displayValue = calcState.expression || '0';
      updateCalcUI();
      e.preventDefault();
    } else if (key === 'Escape') {
      window.calcClear();
      e.preventDefault();
    }
  });
}

async function refrescarPlataformas() {
  const list = await window.api.plataformas.listar();
  const tbody = document.getElementById('tablaPlataformas');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="2" class="p-2 text-center text-slate-500 text-[10px]">Sin plataformas registradas.</td></tr>`;
    return;
  }
  list.forEach(p => {
    tbody.insertAdjacentHTML('beforeend', `
      <tr class="border-b border-slate-900 text-xs hover:bg-slate-900/10">
        <td class="p-2 text-slate-300 font-semibold uppercase">${p.nombre}</td>
        <td class="p-2 text-center">
          <button onclick="eliminarPlataforma(${p.id_plataforma})" class="text-rose-500 hover:text-rose-455 text-[10px] font-bold">Eliminar</button>
        </td>
      </tr>
    `);
  });
}
window.refrescarPlataformas = refrescarPlataformas;

async function eliminarPlataforma(id) {
  if (confirm('¿Seguro de eliminar esta plataforma?')) {
    await window.api.plataformas.eliminar(id);
    await refrescarPlataformas();
  }
}
window.eliminarPlataforma = eliminarPlataforma;

// ==========================================
// MOTOR DE INTELIGENCIA ARTIFICIAL (GEMINI)
// ==========================================

// --- Modalidad B: Registro desde Comprobantes ---
const btnAICargarComprobante = document.getElementById('btnAICargarComprobante');
if (btnAICargarComprobante) {
  btnAICargarComprobante.addEventListener('click', async () => {
    try {
      const res = await window.api.ai.seleccionarComprobante();
      if (res.success && res.filePath) {
        btnAICargarComprobante.disabled = true;
        const originalText = btnAICargarComprobante.innerHTML;
        btnAICargarComprobante.innerHTML = `
          <svg class="animate-spin h-3.5 w-3.5 text-indigo-400" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Procesando...
        `;

        const extracted = await window.api.ai.procesarComprobante(res.filePath);
        
        // Autocompletar el formulario
        if (document.getElementById('movMonto')) {
          document.getElementById('movMonto').value = extracted.monto || 0.0;
        }
        if (document.getElementById('movFecha')) {
          document.getElementById('movFecha').value = extracted.fecha || '';
        }
        if (document.getElementById('movConcepto')) {
          document.getElementById('movConcepto').value = `Auto-IA: ${extracted.concepto || 'Transferencia'} (Banco: ${extracted.banco_origen || 'Origen'} -> ${extracted.banco_destino || 'Destino'})`;
        }

        alert('¡Comprobante procesado con éxito!\nEl formulario de Nueva Operación ha sido autocompletado para su verificación.');
        btnAICargarComprobante.disabled = false;
        btnAICargarComprobante.innerHTML = originalText;
      }
    } catch (err) {
      alert('Error al procesar comprobante con IA: ' + err.message);
      btnAICargarComprobante.disabled = false;
      btnAICargarComprobante.innerHTML = `
        <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        IA: Leer Comprobante
      `;
    }
  });
}

// --- Modalidad A: Importación de Catálogos ---
let stateAIImportProducts = [];
let groundingTargetRowIndex = null;

const btnAIImportarCatalogo = document.getElementById('btnAIImportarCatalogo');
const aiImportModal = document.getElementById('aiImportCatalogModal');
const btnCloseAIImportModal = document.getElementById('btnCloseAIImportModal');
const btnAICancelModal = document.getElementById('btnAICancelModal');

const aiStep1Container = document.getElementById('aiStep1Container');
const aiStep2Container = document.getElementById('aiStep2Container');
const aiLoadingIndicator = document.getElementById('aiLoadingIndicator');

const btnAIAddRawRow = document.getElementById('btnAIAddRawRow');
const btnAIStep1Next = document.getElementById('btnAIStep1Next');
const btnAIStep2Back = document.getElementById('btnAIStep2Back');
const btnAIStep2Confirm = document.getElementById('btnAIStep2Confirm');

const tablaRaw = document.getElementById('tablaAIRawProductos');
const tablaEnrich = document.getElementById('tablaAIEnrichProductos');

if (btnAIImportarCatalogo) {
  btnAIImportarCatalogo.addEventListener('click', async () => {
    try {
      const res = await window.api.ai.seleccionarCatalogo();
      if (res.success && res.filePath) {
        // Mostrar Modal y Loading
        aiImportModal.classList.remove('hidden');
        aiLoadingIndicator.classList.remove('hidden');
        aiStep1Container.classList.add('hidden');
        aiStep2Container.classList.add('hidden');
        btnAIStep1Next.classList.add('hidden');
        btnAIStep2Back.classList.add('hidden');
        btnAIStep2Confirm.classList.add('hidden');

        // Resetear Paso 1 y Paso 2 Badges
        document.getElementById('aiStep1Badge').className = 'h-6 w-6 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center border border-indigo-500';
        document.getElementById('aiStep1Text').className = 'text-xs font-bold text-slate-200';
        document.getElementById('aiStep2Badge').className = 'h-6 w-6 rounded-full bg-slate-800 text-slate-500 font-bold text-xs flex items-center justify-center border border-slate-750';
        document.getElementById('aiStep2Text').className = 'text-xs font-bold text-slate-500';

        const data = await window.api.ai.procesarCatalogo(res.filePath);
        stateAIImportProducts = data.productos || [];

        renderAIStep1Table();

        aiLoadingIndicator.classList.add('hidden');
        aiStep1Container.classList.remove('hidden');
        btnAIStep1Next.classList.remove('hidden');
      }
    } catch (err) {
      alert('Error al importar catálogo con IA: ' + err.message);
      aiImportModal.classList.add('hidden');
    }
  });
}

function renderAIStep1Table() {
  if (!tablaRaw) return;
  tablaRaw.innerHTML = '';
  if (stateAIImportProducts.length === 0) {
    tablaRaw.innerHTML = `<tr><td colspan="3" class="p-4 text-center text-slate-500 text-xs">No se encontraron productos legibles.</td></tr>`;
    return;
  }
  stateAIImportProducts.forEach((p, idx) => {
    const tr = `
      <tr class="border-b border-slate-900/60 hover:bg-slate-900/10">
        <td class="p-3">
          <input type="text" value="${p.producto}" class="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100" id="rawProdName_${idx}">
        </td>
        <td class="p-3">
          <input type="number" step="any" value="${p.precio}" class="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-right text-indigo-400 font-semibold" id="rawProdPrice_${idx}">
        </td>
        <td class="p-3 text-center">
          <button type="button" onclick="eliminarAIRawRow(${idx})" class="text-rose-500 hover:text-rose-455 font-bold text-xs">Eliminar</button>
        </td>
      </tr>
    `;
    tablaRaw.insertAdjacentHTML('beforeend', tr);
  });
}

window.eliminarAIRawRow = (idx) => {
  stateAIImportProducts.splice(idx, 1);
  renderAIStep1Table();
};

if (btnAIAddRawRow) {
  btnAIAddRawRow.addEventListener('click', () => {
    stateAIImportProducts.push({ producto: 'Nuevo Producto', precio: 0.0 });
    renderAIStep1Table();
  });
}

const closeAIImportModal = () => {
  if (aiImportModal) aiImportModal.classList.add('hidden');
  stateAIImportProducts = [];
};

if (btnCloseAIImportModal) btnCloseAIImportModal.addEventListener('click', closeAIImportModal);
if (btnAICancelModal) btnAICancelModal.addEventListener('click', closeAIImportModal);

if (btnAIStep1Next) {
  btnAIStep1Next.addEventListener('click', () => {
    // Leer cambios del Paso 1
    const cleanedList = [];
    stateAIImportProducts.forEach((_, idx) => {
      const nameVal = document.getElementById(`rawProdName_${idx}`).value || '';
      const priceVal = parseFloat(document.getElementById(`rawProdPrice_${idx}`).value) || 0.0;
      if (nameVal) {
        cleanedList.push({ producto: nameVal, precio: priceVal, imagen: null, proveedor_id: '' });
      }
    });

    stateAIImportProducts = cleanedList;

    if (stateAIImportProducts.length === 0) {
      alert('Debe tener al menos un producto válido para continuar.');
      return;
    }

    // Cambiar a Paso 2
    aiStep1Container.classList.add('hidden');
    btnAIStep1Next.classList.add('hidden');
    aiStep2Container.classList.remove('hidden');
    btnAIStep2Back.classList.remove('hidden');
    btnAIStep2Confirm.classList.remove('hidden');

    document.getElementById('aiStep1Badge').className = 'h-6 w-6 rounded-full bg-slate-800 text-slate-500 font-bold text-xs flex items-center justify-center border border-slate-750';
    document.getElementById('aiStep1Text').className = 'text-xs font-bold text-slate-500';
    document.getElementById('aiStep2Badge').className = 'h-6 w-6 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center border border-indigo-500';
    document.getElementById('aiStep2Text').className = 'text-xs font-bold text-slate-200';

    renderAIStep2Table();
  });
}

if (btnAIStep2Back) {
  btnAIStep2Back.addEventListener('click', () => {
    // Guardar cambios actuales de Proveedores e Imagen
    stateAIImportProducts.forEach((p, idx) => {
      const provEl = document.getElementById(`enrichProv_${idx}`);
      const imgEl = document.getElementById(`enrichImgVal_${idx}`);
      if (provEl) p.proveedor_id = provEl.value;
      if (imgEl) p.imagen = imgEl.value;
    });

    // Volver a Paso 1
    aiStep2Container.classList.add('hidden');
    btnAIStep2Back.classList.add('hidden');
    btnAIStep2Confirm.classList.add('hidden');
    aiStep1Container.classList.remove('hidden');
    btnAIStep1Next.classList.remove('hidden');

    document.getElementById('aiStep1Badge').className = 'h-6 w-6 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center border border-indigo-500';
    document.getElementById('aiStep1Text').className = 'text-xs font-bold text-slate-200';
    document.getElementById('aiStep2Badge').className = 'h-6 w-6 rounded-full bg-slate-800 text-slate-500 font-bold text-xs flex items-center justify-center border border-slate-750';
    document.getElementById('aiStep2Text').className = 'text-xs font-bold text-slate-500';

    renderAIStep1Table();
  });
}

function renderAIStep2Table() {
  if (!tablaEnrich) return;
  tablaEnrich.innerHTML = '';

  // Generar opciones de proveedores basados en los clientes activos (tipo PROVEEDOR o todos los clientes)
  let providerOptions = `<option value="">-- Seleccionar --</option>`;
  if (state.clientes && state.clientes.length > 0) {
    state.clientes.forEach(c => {
      providerOptions += `<option value="${c.id_cliente}">${c.nombre} (${c.tipo_cliente || 'CLIENTE'})</option>`;
    });
  }

  stateAIImportProducts.forEach((p, idx) => {
    const tr = `
      <tr class="border-b border-slate-900/60 hover:bg-slate-900/10">
        <td class="p-3 font-bold text-slate-200">${p.producto}</td>
        <td class="p-3 text-right font-semibold text-slate-400 font-mono">${formatearNumeroVisual(p.precio)}</td>
        <td class="p-3">
          <select id="enrichProv_${idx}" class="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100">
            ${providerOptions}
          </select>
        </td>
        <td class="p-3">
          <div class="flex items-center justify-center gap-2">
            <div class="h-8 w-8 bg-slate-900/60 rounded border border-slate-800 flex items-center justify-center overflow-hidden">
              <img id="enrichPreview_${idx}" src="${p.imagen ? `../../assets/img/products/${p.imagen}` : ''}" 
                class="h-full w-full object-contain ${p.imagen ? '' : 'hidden'}">
            </div>
            <input type="hidden" id="enrichImgVal_${idx}" value="${p.imagen || ''}">
            <button type="button" onclick="buscarImagenIA(${idx})" class="bg-indigo-650/20 hover:bg-indigo-650/40 text-indigo-400 text-[10px] font-bold px-2 py-1 rounded transition border border-indigo-500/20">
              Buscar con IA
            </button>
          </div>
        </td>
      </tr>
    `;
    tablaEnrich.insertAdjacentHTML('beforeend', tr);

    // Seleccionar valor anterior de proveedor si existe
    if (p.proveedor_id) {
      setTimeout(() => {
        const provEl = document.getElementById(`enrichProv_${idx}`);
        if (provEl) provEl.value = p.proveedor_id;
      }, 50);
    }
  });
}

// --- Grounding Visual Selector ---
const groundingModal = document.getElementById('aiGroundingSelectModal');
const btnCloseAIGroundingModal = document.getElementById('btnCloseAIGroundingModal');
const btnCancelAIGrounding = document.getElementById('btnCancelAIGrounding');
const groundingLoading = document.getElementById('aiGroundingLoading');
const groundingResults = document.getElementById('aiGroundingResults');

window.buscarImagenIA = async (idx) => {
  groundingTargetRowIndex = idx;
  const p = stateAIImportProducts[idx];
  if (!p) return;

  groundingModal.classList.remove('hidden');
  groundingLoading.classList.remove('hidden');
  groundingResults.innerHTML = '';

  try {
    const res = await window.api.ai.buscarImagenes(p.producto);
    const urls = res.urls || [];
    
    groundingLoading.classList.add('hidden');
    groundingResults.innerHTML = '';

    if (urls.length === 0) {
      groundingResults.innerHTML = `<div class="col-span-3 py-6 text-center text-slate-500 text-xs">No se encontraron imágenes en la web para este producto.</div>`;
      return;
    }

    urls.forEach((url, uidx) => {
      const card = `
        <div onclick="seleccionarImagenDeGrounding('${url}', ${uidx})" id="groundingCard_${uidx}" 
          class="glass-card p-3 rounded-2xl flex flex-col items-center justify-center border border-slate-800 hover:border-indigo-500 transition cursor-pointer text-center space-y-2">
          <div class="h-28 w-28 rounded-xl bg-white overflow-hidden flex items-center justify-center border border-slate-750">
            <img src="${url}" class="h-full w-full object-contain">
          </div>
          <span class="text-[9px] text-slate-500 truncate w-full px-1">${url}</span>
        </div>
      `;
      groundingResults.insertAdjacentHTML('beforeend', card);
    });
  } catch (err) {
    alert('Error al buscar imágenes con Grounding: ' + err.message);
    groundingModal.classList.add('hidden');
  }
};

window.seleccionarImagenDeGrounding = async (url, cardIdx) => {
  const card = document.getElementById(`groundingCard_${cardIdx}`);
  if (card) {
    card.style.opacity = '0.5';
    card.innerHTML = `
      <div class="py-8 flex flex-col items-center justify-center space-y-2">
        <svg class="animate-spin h-5 w-5 text-indigo-400" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span class="text-[9px] text-indigo-400 font-semibold">Descargando...</span>
      </div>
    `;
  }

  try {
    const fileName = await window.api.ai.descargarImagen(url);
    const idx = groundingTargetRowIndex;
    if (idx !== null && stateAIImportProducts[idx]) {
      stateAIImportProducts[idx].imagen = fileName;
      const imgHidden = document.getElementById(`enrichImgVal_${idx}`);
      const imgEl = document.getElementById(`enrichPreview_${idx}`);
      if (imgHidden) imgHidden.value = fileName;
      if (imgEl) {
        imgEl.src = `../../assets/img/products/${fileName}`;
        imgEl.classList.remove('hidden');
      }
    }
    groundingModal.classList.add('hidden');
  } catch (err) {
    alert('Error al descargar y asignar la imagen: ' + err.message);
    groundingModal.classList.add('hidden');
  }
};

const closeGroundingModal = () => {
  if (groundingModal) groundingModal.classList.add('hidden');
};

if (btnCloseAIGroundingModal) btnCloseAIGroundingModal.addEventListener('click', closeGroundingModal);
if (btnCancelAIGrounding) btnCancelAIGrounding.addEventListener('click', closeGroundingModal);

// --- Guardar la importación masiva en SQLite ---
if (btnAIStep2Confirm) {
  btnAIStep2Confirm.addEventListener('click', async () => {
    // Validar proveedores
    let valid = true;
    stateAIImportProducts.forEach((p, idx) => {
      const provEl = document.getElementById(`enrichProv_${idx}`);
      if (provEl) p.proveedor_id = provEl.value;
      if (!p.proveedor_id) {
        valid = false;
      }
    });

    if (!valid) {
      alert('Por favor, asigne un proveedor a todos los productos antes de importar.');
      return;
    }

    try {
      btnAIStep2Confirm.disabled = true;
      btnAIStep2Confirm.textContent = 'Importando...';

      for (const p of stateAIImportProducts) {
        // Estructura de producto SQLite
        const obj = {
          nombre: p.producto,
          sku: `IA-${p.producto.toUpperCase().substring(0, 4)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
          stock: 0,
          moneda_costo: 'USDT',
          monto_costo: p.precio,
          cambio_costo: 1.0,
          observaciones: 'Importado masivamente vía asistente IA',
          precio_venta: p.precio * 1.2, // Margen predeterminado del 20%
          imagen: p.imagen || null,
          es_oferta: 0
        };

        await window.api.ecommerceProductos.crear(obj);
      }

      alert('¡Importación masiva completada con éxito!\nTodos los productos han sido registrados en la base de datos.');
      closeAIImportModal();
      await refrescarEcoProductos();
    } catch (err) {
      alert('Error durante la importación masiva: ' + err.message);
      btnAIStep2Confirm.disabled = false;
      btnAIStep2Confirm.textContent = 'Confirmar e Importar al Stock';
    }
  });
}
