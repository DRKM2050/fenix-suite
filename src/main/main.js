const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

// Configuración de Hot-Reloading en desarrollo
if (!app.isPackaged) {
  try {
    require('electron-reload')(path.join(__dirname, '../..'), {
      electron: path.join(__dirname, '../../node_modules/.bin/electron'),
      hardResetMethod: 'exit'
    });
  } catch (e) {
    console.log('electron-reload no inicializado:', e);
  }
}

// Cargar módulos internos
const db = require('./db');
const reports = require('./reports');
const driveService = require('./driveService');

let mainWindow;

// Configurar el comportamiento de electron-updater
autoUpdater.autoDownload = false; // El usuario elige cuándo descargar
autoUpdater.logger = console;

function crearVentana() {
  mainWindow = new BrowserWindow({
    title: 'FENIX Suite',
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    frame: true, // Se mantiene el marco nativo para control estándar pero se oculta el menú
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  // Ocultar menús nativos
  mainWindow.setMenuBarVisibility(false);
  mainWindow.removeMenu();

  // Cargar el archivo de interfaz de usuario
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Inicialización de la aplicación
app.whenReady().then(() => {
  crearVentana();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) crearVentana();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  if (driveService && driveService.shutdownLoopback) {
    driveService.shutdownLoopback();
  }
});

// Helper recursivo para guardar textos en mayúsculas (excepto correos electrónicos)
function objectToUpperCase(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  const newObj = Array.isArray(obj) ? [] : {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const val = obj[key];
      if (typeof val === 'string') {
        if (key.toLowerCase().includes('mail') || key.toLowerCase().includes('email')) {
          newObj[key] = val.trim().toLowerCase();
        } else {
          newObj[key] = val.trim().toUpperCase();
        }
      } else if (typeof val === 'object' && val !== null) {
        newObj[key] = objectToUpperCase(val);
      } else {
        newObj[key] = val;
      }
    }
  }
  return newObj;
}

// ==========================================
// CANALES IPC - MANEJO DE MENSAJES Y EVENTOS
// ==========================================

// --- Autenticación y Seguridad ---
ipcMain.handle('auth:validar-password', async (event, password) => {
  return await db.validarPassword(password);
});

ipcMain.handle('auth:inicializar-password', async (event, password) => {
  return await db.inicializarPassword(password);
});

ipcMain.handle('auth:existe-password', async () => {
  return await db.existePasswordConfigurado();
});

// --- Operaciones del día (Fecha Contable Activa) ---
ipcMain.handle('op:get-fecha-contable', async () => {
  const row = await db.dbGet(`SELECT valor_ajuste FROM opciones WHERE clave_ajuste = 'fecha_contable_activa'`);
  return row ? row.valor_ajuste : null;
});

ipcMain.handle('op:iniciar-dia', async (event, fecha) => {
  await db.dbRun(`INSERT OR REPLACE INTO opciones (clave_ajuste, valor_ajuste) VALUES ('fecha_contable_activa', ?)`, [fecha]);
  return fecha;
});

ipcMain.handle('op:cerrar-dia', async () => {
  await db.dbRun(`DELETE FROM opciones WHERE clave_ajuste = 'fecha_contable_activa'`);
  return null;
});

// --- Base de Datos - Clientes ---
ipcMain.handle('db:clientes-listar', async () => {
  return await db.dbAll(`SELECT * FROM clientes ORDER BY nombre ASC`);
});

ipcMain.handle('db:clientes-crear', async (event, rawCliente) => {
  const cliente = objectToUpperCase(rawCliente);
  const sql = `
    INSERT INTO clientes (timestamp, nombre, documento, telefono, mail, tipo_cliente, observaciones, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const result = await db.dbRun(sql, [
    new Date().toISOString(),
    cliente.nombre,
    cliente.documento,
    cliente.telefono,
    cliente.mail,
    cliente.tipo_cliente || 'MINORISTA',
    cliente.observaciones || '',
    cliente.status || 'ACTIVO'
  ]);
  return result;
});

ipcMain.handle('db:clientes-actualizar', async (event, rawCliente) => {
  const cliente = objectToUpperCase(rawCliente);
  const sql = `
    UPDATE clientes 
    SET nombre = ?, documento = ?, telefono = ?, mail = ?, tipo_cliente = ?, observaciones = ?, status = ?
    WHERE id_cliente = ?
  `;
  return await db.dbRun(sql, [
    cliente.nombre,
    cliente.documento,
    cliente.telefono,
    cliente.mail,
    cliente.tipo_cliente,
    cliente.observaciones,
    cliente.status,
    cliente.id_cliente
  ]);
});

ipcMain.handle('db:clientes-eliminar', async (event, id) => {
  // Las cuentas asociadas se eliminarán en cascada debido a ON DELETE CASCADE
  return await db.dbRun(`DELETE FROM clientes WHERE id_cliente = ?`, [id]);
});

// --- Base de Datos - Cuentas ---
ipcMain.handle('db:cuentas-listar', async (event, idCliente) => {
  if (idCliente) {
    return await db.dbAll(`SELECT * FROM cuentas WHERE id_cliente = ? ORDER BY nombre_cuenta ASC`, [idCliente]);
  }
  return await db.dbAll(`SELECT * FROM cuentas ORDER BY nombre_cuenta ASC`);
});

ipcMain.handle('db:cuentas-crear', async (event, rawCuenta) => {
  const cuenta = objectToUpperCase(rawCuenta);
  const sql = `
    INSERT INTO cuentas (id_cliente, nombre_cuenta, tipo_cuenta, moneda, referencia, observaciones, status, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  return await db.dbRun(sql, [
    cuenta.id_cliente,
    cuenta.nombre_cuenta,
    cuenta.tipo_cuenta || 'EFECTIVO',
    cuenta.moneda || 'USDT',
    cuenta.referencia || '',
    cuenta.observaciones || '',
    cuenta.status || 'ACTIVO',
    new Date().toISOString()
  ]);
});

ipcMain.handle('db:cuentas-actualizar', async (event, rawCuenta) => {
  const cuenta = objectToUpperCase(rawCuenta);
  const sql = `
    UPDATE cuentas 
    SET nombre_cuenta = ?, tipo_cuenta = ?, moneda = ?, referencia = ?, observaciones = ?, status = ?
    WHERE id_cuenta = ?
  `;
  return await db.dbRun(sql, [
    cuenta.nombre_cuenta,
    cuenta.tipo_cuenta,
    cuenta.moneda,
    cuenta.referencia,
    cuenta.observaciones,
    cuenta.status,
    cuenta.id_cuenta
  ]);
});

ipcMain.handle('db:cuentas-eliminar', async (event, id) => {
  return await db.dbRun(`DELETE FROM cuentas WHERE id_cuenta = ?`, [id]);
});

// --- Base de Datos - Cambios ---
ipcMain.handle('db:cambios-listar', async () => {
  return await db.dbAll(`SELECT * FROM cambios ORDER BY id_cambio DESC LIMIT 100`);
});

ipcMain.handle('db:cambios-guardar', async (event, rawCambio) => {
  const cambio = objectToUpperCase(rawCambio);
  const sql = `
    INSERT INTO cambios (fecha_contable, par_divisa, valor_compra, valor_venta, timestamp)
    VALUES (?, ?, ?, ?, ?)
  `;
  return await db.dbRun(sql, [
    cambio.fecha_contable,
    cambio.par_divisa,
    cambio.valor_compra,
    cambio.valor_venta,
    new Date().toISOString()
  ]);
});

ipcMain.handle('db:cambios-actualizar', async (event, rawCambio) => {
  const cambio = objectToUpperCase(rawCambio);
  const sql = `
    UPDATE cambios
    SET par_divisa = ?, valor_compra = ?, valor_venta = ?
    WHERE id_cambio = ?
  `;
  return await db.dbRun(sql, [
    cambio.par_divisa,
    cambio.valor_compra,
    cambio.valor_venta,
    cambio.id_cambio
  ]);
});

ipcMain.handle('db:cambios-eliminar', async (event, id) => {
  return await db.dbRun(`DELETE FROM cambios WHERE id_cambio = ?`, [id]);
});

// --- Base de Datos - Movimientos ---
ipcMain.handle('db:movimientos-listar', async (event, filtros = {}) => {
  let sql = `
    SELECT 
      m.*, 
      c.nombre AS cliente_nombre, 
      c.documento AS cliente_documento,
      COALESCE(cu.nombre_cuenta, mc.nombre_cuenta) AS cuenta_nombre, 
      e.id_producto,
      e.producto, 
      e.monto AS monto_eco, 
      e.moneda AS moneda_eco,
      e.cambio_aplicado AS cambio_eco,
      e.cantidad AS cantidad_eco,
      ep.sku AS producto_sku,
      ep.nombre AS producto_nombre,
      ep.monto_costo AS producto_costo_monto,
      ep.moneda_costo AS producto_costo_moneda,
      ep.cambio_costo AS producto_costo_cambio,
      tt.categoria AS tipo_categoria
    FROM movimientos m
    LEFT JOIN clientes c ON m.id_cliente = c.id_cliente
    LEFT JOIN cuentas cu ON m.id_cuenta = cu.id_cuenta AND m.id_cliente IS NOT NULL
    LEFT JOIN mis_cuentas mc ON m.id_cuenta = mc.id_mi_cuenta AND m.id_cliente IS NULL
    LEFT JOIN ecommerce e ON m.id_movimiento = e.id_movimiento
    LEFT JOIN ecommerce_productos ep ON e.id_producto = ep.id_producto
    LEFT JOIN tipos_transacciones tt ON m.tipo_transaccion = tt.nombre
    WHERE 1=1
  `;
  const params = [];

  if (filtros.fecha_inicio && filtros.fecha_fin) {
    sql += ' AND m.fecha_contable BETWEEN ? AND ?';
    params.push(filtros.fecha_inicio, filtros.fecha_fin);
  } else if (filtros.fecha_inicio) {
    sql += ' AND m.fecha_contable = ?';
    params.push(filtros.fecha_inicio);
  }

  if (filtros.id_cliente) {
    sql += ' AND m.id_cliente = ?';
    params.push(filtros.id_cliente);
  }

  if (filtros.id_cuenta) {
    sql += ' AND m.id_cuenta = ?';
    params.push(filtros.id_cuenta);
  }

  if (filtros.tipo_transaccion) {
    sql += ' AND m.tipo_transaccion = ?';
    params.push(filtros.tipo_transaccion);
  }

  if (filtros.moneda) {
    sql += ' AND m.moneda = ?';
    params.push(filtros.moneda);
  }

  sql += ' ORDER BY m.id_movimiento DESC';
  return await db.dbAll(sql, params);
});

ipcMain.handle('db:movimientos-crear', async (event, rawMovimiento, rawEcommerce) => {
  const movimiento = objectToUpperCase(rawMovimiento);
  const ecommerce = objectToUpperCase(rawEcommerce);
  return new Promise((resolve, reject) => {
    db.dbRun('BEGIN TRANSACTION;')
      .then(async () => {
        const idMov = await db.registrarMovimientoTransaccional(movimiento, ecommerce);
        if (movimiento.tipo_transaccion.startsWith('ECOMMERCE') && ecommerce) {
          const idProd = ecommerce.id_producto;
          const cant = parseInt(ecommerce.cantidad) || 1;
          if (movimiento.tipo_transaccion === 'ECOMMERCE / COMPRA') {
            await db.dbRun(`
              UPDATE ecommerce_productos 
              SET stock = stock + ?, monto_costo = ?, moneda_costo = ?, cambio_costo = ?
              WHERE id_producto = ?
            `, [cant, ecommerce.monto, ecommerce.moneda, ecommerce.cambio_aplicado, idProd]);
          } else if (movimiento.tipo_transaccion === 'ECOMMERCE / VENTA') {
            await db.dbRun(`
              UPDATE ecommerce_productos 
              SET stock = stock - ?
              WHERE id_producto = ?
            `, [cant, idProd]);
          }
        }
        await db.dbRun('COMMIT;');
        resolve(idMov);
      })
      .catch(err => {
        db.dbRun('ROLLBACK;');
        reject(err);
      });
  });
});

ipcMain.handle('db:movimientos-actualizar', async (event, rawMov, rawEco) => {
  const mov = objectToUpperCase(rawMov);
  const eco = objectToUpperCase(rawEco);
  return new Promise((resolve, reject) => {
    db.dbRun('BEGIN TRANSACTION;')
      .then(async () => {
        // 1. Obtener datos viejos
        const oldMov = await db.dbGet("SELECT * FROM movimientos WHERE id_movimiento = ?", [mov.id_movimiento]);
        const oldEco = await db.dbGet("SELECT * FROM ecommerce WHERE id_movimiento = ?", [mov.id_movimiento]);

        // 2. Revertir stock viejo si correspondía a ecommerce
        if (oldMov && oldMov.tipo_transaccion.startsWith('ECOMMERCE') && oldEco) {
          const oldProdId = oldEco.id_producto;
          const oldCant = oldEco.cantidad || 1;
          if (oldMov.tipo_transaccion === 'ECOMMERCE / COMPRA') {
            await db.dbRun("UPDATE ecommerce_productos SET stock = stock - ? WHERE id_producto = ?", [oldCant, oldProdId]);
          } else if (oldMov.tipo_transaccion === 'ECOMMERCE / VENTA') {
            await db.dbRun("UPDATE ecommerce_productos SET stock = stock + ? WHERE id_producto = ?", [oldCant, oldProdId]);
          }
        }

        // 3. Actualizar el movimiento principal
        const sqlUpdate = `
          UPDATE movimientos 
          SET id_cliente = ?, id_cuenta = ?, tipo_transaccion = ?, monto = ?, moneda = ?, 
              par_cambio = ?, modalidad_cambio = ?, valor_cambio = ?, concepto = ?, observaciones = ?
          WHERE id_movimiento = ?
        `;
        await db.dbRun(sqlUpdate, [
          mov.id_cliente || null,
          mov.id_cuenta,
          mov.tipo_transaccion,
          mov.monto,
          mov.moneda,
          mov.par_cambio || null,
          mov.modalidad_cambio,
          mov.valor_cambio,
          mov.concepto,
          mov.observaciones,
          mov.id_movimiento
        ]);

        // 4. Actualizar o insertar ecommerce
        if (mov.tipo_transaccion.startsWith('ECOMMERCE') && eco) {
          const sqlEco = `
            INSERT OR REPLACE INTO ecommerce (id_movimiento, id_producto, producto, monto, moneda, cambio_aplicado, cantidad, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `;
          await db.dbRun(sqlEco, [
            mov.id_movimiento,
            eco.id_producto,
            eco.producto,
            eco.monto,
            eco.moneda,
            eco.cambio_aplicado,
            eco.cantidad || 1,
            new Date().toISOString()
          ]);

          // 5. Aplicar stock nuevo
          const newProdId = eco.id_producto;
          const newCant = eco.cantidad || 1;
          if (mov.tipo_transaccion === 'ECOMMERCE / COMPRA') {
            await db.dbRun(`
              UPDATE ecommerce_productos 
              SET stock = stock + ?, monto_costo = ?, moneda_costo = ?, cambio_costo = ?
              WHERE id_producto = ?
            `, [newCant, eco.monto, eco.moneda, eco.cambio_aplicado, newProdId]);
          } else if (mov.tipo_transaccion === 'ECOMMERCE / VENTA') {
            await db.dbRun(`
              UPDATE ecommerce_productos 
              SET stock = stock - ?
              WHERE id_producto = ?
            `, [newCant, newProdId]);
          }
        } else {
          await db.dbRun("DELETE FROM ecommerce WHERE id_movimiento = ?", [mov.id_movimiento]);
        }

        await db.dbRun('COMMIT;');
        resolve(true);
      })
      .catch((err) => {
        db.dbRun('ROLLBACK;');
        reject(err);
      });
  });
});

ipcMain.handle('db:movimientos-eliminar', async (event, id) => {
  return new Promise((resolve, reject) => {
    db.dbRun('BEGIN TRANSACTION;')
      .then(async () => {
        const oldMov = await db.dbGet("SELECT * FROM movimientos WHERE id_movimiento = ?", [id]);
        const oldEco = await db.dbGet("SELECT * FROM ecommerce WHERE id_movimiento = ?", [id]);

        if (oldMov && oldMov.tipo_transaccion.startsWith('ECOMMERCE') && oldEco) {
          const oldProdId = oldEco.id_producto;
          const oldCant = oldEco.cantidad || 1;
          if (oldMov.tipo_transaccion === 'ECOMMERCE / COMPRA') {
            await db.dbRun("UPDATE ecommerce_productos SET stock = stock - ? WHERE id_producto = ?", [oldCant, oldProdId]);
          } else if (oldMov.tipo_transaccion === 'ECOMMERCE / VENTA') {
            await db.dbRun("UPDATE ecommerce_productos SET stock = stock + ? WHERE id_producto = ?", [oldCant, oldProdId]);
          }
        }

        await db.dbRun("DELETE FROM movimientos WHERE id_movimiento = ?", [id]);
        await db.dbRun('COMMIT;');
        resolve(true);
      })
      .catch(err => {
        db.dbRun('ROLLBACK;');
        reject(err);
      });
  });
});

// --- Productos E-Commerce CRUD ---
ipcMain.handle('db:productos-listar', async () => {
  return await db.dbAll("SELECT * FROM ecommerce_productos ORDER BY nombre ASC");
});

ipcMain.handle('db:productos-crear', async (event, rawP) => {
  const p = objectToUpperCase(rawP);
  return await db.dbRun(`
    INSERT INTO ecommerce_productos (nombre, sku, stock, moneda_costo, monto_costo, cambio_costo, observaciones, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    p.nombre,
    p.sku || null,
    p.stock || 0,
    p.moneda_costo || 'USD',
    p.monto_costo || 0.0,
    p.cambio_costo || 1.0,
    p.observaciones || null,
    new Date().toISOString()
  ]);
});

ipcMain.handle('db:productos-actualizar', async (event, rawP) => {
  const p = objectToUpperCase(rawP);
  return await db.dbRun(`
    UPDATE ecommerce_productos 
    SET nombre = ?, sku = ?, stock = ?, moneda_costo = ?, monto_costo = ?, cambio_costo = ?, observaciones = ?
    WHERE id_producto = ?
  `, [
    p.nombre,
    p.sku,
    p.stock,
    p.moneda_costo,
    p.monto_costo,
    p.cambio_costo,
    p.observaciones,
    p.id_producto
  ]);
});

ipcMain.handle('db:productos-eliminar', async (event, id) => {
  return await db.dbRun("DELETE FROM ecommerce_productos WHERE id_producto = ?", [id]);
});

// --- Catálogos Administrativos (Tipos de Transacción, Monedas y Relaciones) ---
ipcMain.handle('db:tipos-transacciones-listar', async () => {
  return await db.dbAll(`SELECT * FROM tipos_transacciones ORDER BY nombre ASC`);
});

ipcMain.handle('db:tipos-transacciones-crear', async (event, nombre, categoria = 'EGRESO') => {
  return await db.dbRun(`INSERT INTO tipos_transacciones (nombre, categoria) VALUES (?, ?)`, [nombre.trim().toUpperCase(), categoria.trim().toUpperCase()]);
});

ipcMain.handle('db:tipos-transacciones-eliminar', async (event, id) => {
  return await db.dbRun(`DELETE FROM tipos_transacciones WHERE id_tipo = ?`, [id]);
});

ipcMain.handle('db:monedas-listar', async () => {
  return await db.dbAll(`SELECT * FROM monedas ORDER BY siglas ASC`);
});

ipcMain.handle('db:monedas-crear', async (event, rawMoneda) => {
  const moneda = objectToUpperCase(rawMoneda);
  const sql = `INSERT INTO monedas (nombre, siglas, tipo, status) VALUES (?, ?, ?, ?)`;
  return await db.dbRun(sql, [moneda.nombre, moneda.siglas, moneda.tipo, moneda.status || 'ACTIVO']);
});

ipcMain.handle('db:monedas-actualizar', async (event, rawMoneda) => {
  const moneda = objectToUpperCase(rawMoneda);
  const sql = `UPDATE monedas SET nombre = ?, siglas = ?, tipo = ?, status = ? WHERE id_moneda = ?`;
  return await db.dbRun(sql, [moneda.nombre, moneda.siglas, moneda.tipo, moneda.status, moneda.id_moneda]);
});

ipcMain.handle('db:monedas-eliminar', async (event, id) => {
  return await db.dbRun(`DELETE FROM monedas WHERE id_moneda = ?`, [id]);
});

ipcMain.handle('db:relaciones-listar', async () => {
  return await db.dbAll(`SELECT * FROM relaciones_cambio ORDER BY moneda_origen ASC, moneda_destino ASC`);
});

ipcMain.handle('db:relaciones-crear', async (event, rawRel) => {
  const rel = objectToUpperCase(rawRel);
  const sql = `INSERT OR IGNORE INTO relaciones_cambio (moneda_origen, moneda_destino) VALUES (?, ?)`;
  return await db.dbRun(sql, [rel.moneda_origen, rel.moneda_destino]);
});

ipcMain.handle('db:relaciones-eliminar', async (event, id) => {
  return await db.dbRun(`DELETE FROM relaciones_cambio WHERE id_relacion = ?`, [id]);
});

// --- Base de Datos - Opciones Genéricas ---
ipcMain.handle('db:opciones-get', async (event, clave) => {
  const row = await db.dbGet(`SELECT valor_ajuste FROM opciones WHERE clave_ajuste = ?`, [clave]);
  return row ? row.valor_ajuste : null;
});

ipcMain.handle('db:opciones-set', async (event, clave, valor) => {
  let valFinal = valor;
  if (typeof valor === 'string' && clave !== 'admin_password' && clave !== 'drive_refresh_token') {
    if (clave.toLowerCase().includes('email') || clave.toLowerCase().includes('mail')) {
      valFinal = valor.trim().toLowerCase();
    } else {
      valFinal = valor.trim().toUpperCase();
    }
  }
  return await db.dbRun(`INSERT OR REPLACE INTO opciones (clave_ajuste, valor_ajuste) VALUES (?, ?)`, [clave, valFinal]);
});

// --- Base de Datos - Mis Cuentas (Propias) ---
ipcMain.handle('db:mis-cuentas-listar', async () => {
  return await db.dbAll(`SELECT * FROM mis_cuentas ORDER BY id_mi_cuenta ASC`);
});

ipcMain.handle('db:mis-cuentas-crear', async (event, rawCta) => {
  const cta = objectToUpperCase(rawCta);
  const sql = `
    INSERT INTO mis_cuentas (nombre_cuenta, tipo_cuenta, moneda, referencia, observaciones, status, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  return await db.dbRun(sql, [
    cta.nombre_cuenta,
    cta.tipo_cuenta,
    cta.moneda,
    cta.referencia || '',
    cta.observaciones || '',
    cta.status || 'ACTIVO',
    new Date().toISOString()
  ]);
});

ipcMain.handle('db:mis-cuentas-actualizar', async (event, rawCta) => {
  const cta = objectToUpperCase(rawCta);
  const sql = `
    UPDATE mis_cuentas
    SET nombre_cuenta = ?, tipo_cuenta = ?, moneda = ?, referencia = ?, observaciones = ?, status = ?
    WHERE id_mi_cuenta = ?
  `;
  return await db.dbRun(sql, [
    cta.nombre_cuenta,
    cta.tipo_cuenta,
    cta.moneda,
    cta.referencia || '',
    cta.observaciones || '',
    cta.status,
    cta.id_mi_cuenta
  ]);
});

ipcMain.handle('db:mis-cuentas-eliminar', async (event, id) => {
  return await db.dbRun(`DELETE FROM mis_cuentas WHERE id_mi_cuenta = ?`, [id]);
});

// --- Métodos de Simulación (Datos de Prueba) ---
ipcMain.handle('db:test-generar', async () => {
  return await db.generarDatosPrueba();
});

ipcMain.handle('db:test-limpiar', async () => {
  return await db.limpiarDatosPrueba();
});

// --- Copias de Seguridad ---
ipcMain.handle('db:backup-local', async () => {
  return await db.exportarBaseDatosLocal();
});

// --- Reportes (PDF / Excel) ---
ipcMain.handle('rep:descargar-pdf', async (event, filtros) => {
  // Obtener movimientos filtrados primero
  const data = await ipcMain.handlers['db:movimientos-listar'](event, filtros);
  const pathFile = await reports.generarReportePDF(filtros, data);
  return pathFile;
});

ipcMain.handle('rep:descargar-excel', async (event, filtros) => {
  const data = await ipcMain.handlers['db:movimientos-listar'](event, filtros);
  const pathFile = await reports.generarReporteExcel(filtros, data);
  return pathFile;
});

ipcMain.handle('rep:descargar-catalogo-pdf', async (event, productos) => {
  const pathFile = await reports.generarCatalogoPDF(productos);
  return pathFile;
});

// --- Sincronización Google Drive ---
ipcMain.handle('drive:conectar', async () => {
  return new Promise((resolve, reject) => {
    driveService.conectarCuentaDrive(
      db,
      (email) => resolve({ success: true, email }),
      (err) => reject(err)
    );
  });
});

ipcMain.handle('drive:desconectar', async () => {
  return await driveService.desconectarCuentaDrive(db);
});

ipcMain.handle('drive:estado', async () => {
  const refreshToken = await db.dbGet("SELECT valor_ajuste FROM opciones WHERE clave_ajuste = 'drive_refresh_token'").then(r => r ? r.valor_ajuste : null);
  const email = await db.dbGet("SELECT valor_ajuste FROM opciones WHERE clave_ajuste = 'drive_user_email'").then(r => r ? r.valor_ajuste : null);
  const autoSync = await db.dbGet("SELECT valor_ajuste FROM opciones WHERE clave_ajuste = 'drive_sync_auto'").then(r => r ? r.valor_ajuste === 'true' : false);
  const clientId = await db.dbGet("SELECT valor_ajuste FROM opciones WHERE clave_ajuste = 'drive_client_id'").then(r => r ? r.valor_ajuste : '');
  const clientSecret = await db.dbGet("SELECT valor_ajuste FROM opciones WHERE clave_ajuste = 'drive_client_secret'").then(r => r ? r.valor_ajuste : '');

  return {
    conectado: !!refreshToken,
    email: email || '',
    autoSync,
    clientId,
    clientSecret
  };
});

ipcMain.handle('drive:subir-ahora', async () => {
  return await driveService.subirBaseDatosADrive(db);
});

ipcMain.handle('drive:descargar-ahora', async () => {
  return await driveService.descargarBaseDatosDeDrive(db);
});

// --- Auto-Actualizaciones (electron-updater) ---
ipcMain.on('updater:buscar', () => {
  if (app.isPackaged) {
    autoUpdater.checkForUpdates();
  } else {
    // Modo de desarrollo
    mainWindow.webContents.send('updater:no-disponible');
  }
});

ipcMain.on('updater:descargar', () => {
  autoUpdater.downloadUpdate();
});

ipcMain.on('updater:instalar', () => {
  autoUpdater.quitAndInstall();
});

// --- Reinicio de Aplicación ---
ipcMain.handle('app:relaunch', () => {
  app.relaunch();
  app.exit(0);
});

// --- Forzar Foco del Sistema ---
ipcMain.on('app:force-focus', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// --- Diálogos de Sistema Síncronos con Foco Controlado ---
ipcMain.on('dialog:alert', (event, message) => {
  if (mainWindow) {
    dialog.showMessageBoxSync(mainWindow, {
      type: 'info',
      title: 'FENIX Suite',
      message: message,
      buttons: ['Aceptar'],
      defaultId: 0,
      noLink: true
    });
  }
  event.returnValue = true;
});

ipcMain.on('dialog:confirm', (event, message) => {
  let val = false;
  if (mainWindow) {
    const res = dialog.showMessageBoxSync(mainWindow, {
      type: 'question',
      title: 'FENIX Suite',
      message: message,
      buttons: ['Cancelar', 'Aceptar'],
      defaultId: 1,
      cancelId: 0,
      noLink: true
    });
    val = (res === 1);
  }
  event.returnValue = val;
});

autoUpdater.on('update-available', () => {
  if (mainWindow) mainWindow.webContents.send('updater:disponible');
});

autoUpdater.on('update-not-available', () => {
  if (mainWindow) mainWindow.webContents.send('updater:no-disponible');
});

autoUpdater.on('update-downloaded', () => {
  if (mainWindow) mainWindow.webContents.send('updater:descargado');
});

autoUpdater.on('error', (err) => {
  if (mainWindow) mainWindow.webContents.send('updater:error', err.message || String(err));
});
