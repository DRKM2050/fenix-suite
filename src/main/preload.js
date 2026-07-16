const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Autenticación y Seguridad
  auth: {
    validarPassword: (password) => ipcRenderer.invoke('auth:validar-password', password),
    inicializarPassword: (password) => ipcRenderer.invoke('auth:inicializar-password', password),
    existePasswordConfigurado: () => ipcRenderer.invoke('auth:existe-password')
  },

  // Operaciones del día (Fecha Contable Activa)
  operaciones: {
    getFechaContable: () => ipcRenderer.invoke('op:get-fecha-contable'),
    iniciarDia: (fecha) => ipcRenderer.invoke('op:iniciar-dia', fecha),
    cerrarDia: () => ipcRenderer.invoke('op:cerrar-dia')
  },

  // Base de Datos - Clientes
  clientes: {
    listar: () => ipcRenderer.invoke('db:clientes-listar'),
    crear: (cliente) => ipcRenderer.invoke('db:clientes-crear', cliente),
    actualizar: (cliente) => ipcRenderer.invoke('db:clientes-actualizar', cliente),
    eliminar: (id) => ipcRenderer.invoke('db:clientes-eliminar', id)
  },

  // Base de Datos - Cuentas
  cuentas: {
    listar: (idCliente) => ipcRenderer.invoke('db:cuentas-listar', idCliente),
    crear: (cuenta) => ipcRenderer.invoke('db:cuentas-crear', cuenta),
    actualizar: (cuenta) => ipcRenderer.invoke('db:cuentas-actualizar', cuenta),
    eliminar: (id) => ipcRenderer.invoke('db:cuentas-eliminar', id)
  },

  // Catálogos Administrativos
  tiposTransacciones: {
    listar: () => ipcRenderer.invoke('db:tipos-transacciones-listar'),
    crear: (nombre, categoria) => ipcRenderer.invoke('db:tipos-transacciones-crear', nombre, categoria),
    eliminar: (id) => ipcRenderer.invoke('db:tipos-transacciones-eliminar', id)
  },

  monedas: {
    listar: () => ipcRenderer.invoke('db:monedas-listar'),
    crear: (moneda) => ipcRenderer.invoke('db:monedas-crear', moneda),
    actualizar: (moneda) => ipcRenderer.invoke('db:monedas-actualizar', moneda),
    eliminar: (id) => ipcRenderer.invoke('db:monedas-eliminar', id)
  },

  relaciones: {
    listar: () => ipcRenderer.invoke('db:relaciones-listar'),
    crear: (rel) => ipcRenderer.invoke('db:relaciones-crear', rel),
    eliminar: (id) => ipcRenderer.invoke('db:relaciones-eliminar', id)
  },

  // Base de Datos - Cambios
  cambios: {
    listar: () => ipcRenderer.invoke('db:cambios-listar'),
    guardar: (cambio) => ipcRenderer.invoke('db:cambios-guardar', cambio),
    actualizar: (cambio) => ipcRenderer.invoke('db:cambios-actualizar', cambio),
    eliminar: (id) => ipcRenderer.invoke('db:cambios-eliminar', id)
  },

  // Base de Datos - Movimientos
  movimientos: {
    listar: (filtros) => ipcRenderer.invoke('db:movimientos-listar', filtros),
    crear: (movimiento, ecommerce) => ipcRenderer.invoke('db:movimientos-crear', movimiento, ecommerce),
    actualizar: (movimiento, ecommerce) => ipcRenderer.invoke('db:movimientos-actualizar', movimiento, ecommerce),
    eliminar: (id) => ipcRenderer.invoke('db:movimientos-eliminar', id)
  },

  // Base de Datos - Productos E-Commerce (Nuevo)
  ecommerceProductos: {
    listar: () => ipcRenderer.invoke('db:productos-listar'),
    crear: (p) => ipcRenderer.invoke('db:productos-crear', p),
    actualizar: (p) => ipcRenderer.invoke('db:productos-actualizar', p),
    eliminar: (id) => ipcRenderer.invoke('db:productos-eliminar', id)
  },

  // Base de Datos - Mis Cuentas (Propias)
  misCuentas: {
    listar: () => ipcRenderer.invoke('db:mis-cuentas-listar'),
    crear: (cta) => ipcRenderer.invoke('db:mis-cuentas-crear', cta),
    actualizar: (cta) => ipcRenderer.invoke('db:mis-cuentas-actualizar', cta),
    eliminar: (id) => ipcRenderer.invoke('db:mis-cuentas-eliminar', id)
  },

  // Base de Datos - Opciones
  opciones: {
    get: (clave) => ipcRenderer.invoke('db:opciones-get', clave),
    set: (clave, valor) => ipcRenderer.invoke('db:opciones-set', clave, valor)
  },

  // Respaldos y Exportación
  backup: {
    exportarLocal: () => ipcRenderer.invoke('db:backup-local')
  },

  // Datos de Prueba
  testData: {
    generar: () => ipcRenderer.invoke('db:test-generar'),
    limpiar: () => ipcRenderer.invoke('db:test-limpiar')
  },

  // Reportes y Exportación de Documentos
  reportes: {
    descargarPDF: (filtros) => ipcRenderer.invoke('rep:descargar-pdf', filtros),
    descargarExcel: (filtros) => ipcRenderer.invoke('rep:descargar-excel', filtros),
    descargarCatalogoPDF: (productos) => ipcRenderer.invoke('rep:descargar-catalogo-pdf', productos)
  },

  // Actualizaciones de Software (electron-updater)
  updater: {
    buscarActualizaciones: () => ipcRenderer.send('updater:buscar'),
    descargarActualizaciones: () => ipcRenderer.send('updater:descargar'),
    instalarActualizaciones: () => ipcRenderer.send('updater:instalar'),
    onUpdateAvailable: (callback) => ipcRenderer.on('updater:disponible', () => callback()),
    onUpdateNotAvailable: (callback) => ipcRenderer.on('updater:no-disponible', () => callback()),
    onUpdateDownloaded: (callback) => ipcRenderer.on('updater:descargado', () => callback()),
    onUpdateError: (callback) => ipcRenderer.on('updater:error', (event, msg) => callback(msg))
  },

  // Sincronización en la Nube con Google Drive
  drive: {
    conectar: () => ipcRenderer.invoke('drive:conectar'),
    desconectar: () => ipcRenderer.invoke('drive:desconectar'),
    estado: () => ipcRenderer.invoke('drive:estado'),
    subirAhora: () => ipcRenderer.invoke('drive:subir-ahora'),
    descargarAhora: () => ipcRenderer.invoke('drive:descargar-ahora')
  },

  // Relaunch y Foco de aplicación
  app: {
    relaunch: () => ipcRenderer.invoke('app:relaunch'),
    forceFocus: () => ipcRenderer.send('app:force-focus')
  },

  // Diálogos nativos síncronos de sistema (evitan pérdida de foco)
  dialog: {
    alert: (message) => ipcRenderer.sendSync('dialog:alert', message),
    confirm: (message) => ipcRenderer.sendSync('dialog:confirm', message)
  }
});
