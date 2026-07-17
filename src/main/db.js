const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');

// Ruta transparente y multiplataforma en AppData/Application Support
const dbDir = app.getPath('userData');
const dbPath = path.join(dbDir, 'gestion_admin.db');

// Asegurar que exista el directorio
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error al conectar con la base de datos SQLite:', err.message);
  } else {
    console.log('Conectado a la base de datos SQLite en:', dbPath);
    inicializarTablas();
  }
});

// Helper para operaciones asíncronas con promesas
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// Inicialización de la estructura de base de datos con auto-migración
function inicializarTablas() {
  db.all("PRAGMA foreign_key_list(movimientos)", [], (err, fks) => {
    if (fks && fks.some(fk => fk.table === 'cuentas' && fk.from === 'id_cuenta')) {
      console.log('Detectada estructura de FK obsoleta en movimientos. Recreando tablas...');
      db.serialize(() => {
        db.run('DROP TABLE IF EXISTS ecommerce;');
        db.run('DROP TABLE IF EXISTS movimientos;');
        ejecutarCreacionTablas();
      });
    } else {
      ejecutarCreacionTablas();
    }
  });
}

function ejecutarCreacionTablas() {
  db.serialize(() => {
    // Activar soporte para llaves foráneas
    db.run('PRAGMA foreign_keys = ON;');

    // 1. Clientes
    db.run(`
      CREATE TABLE IF NOT EXISTS clientes (
        id_cliente INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT,
        nombre TEXT,
        documento TEXT,
        telefono TEXT,
        mail TEXT,
        tipo_cliente TEXT,
        observaciones TEXT,
        status TEXT DEFAULT 'ACTIVO'
      )
    `);

    // 2. Cuentas (Cambiado de subcuentas a cuentas de clientes)
    db.run(`
      CREATE TABLE IF NOT EXISTS cuentas (
        id_cuenta INTEGER PRIMARY KEY AUTOINCREMENT,
        id_cliente INTEGER,
        nombre_cuenta TEXT,
        tipo_cuenta TEXT,
        moneda TEXT,
        referencia TEXT,
        observaciones TEXT,
        status TEXT DEFAULT 'ACTIVO',
        timestamp TEXT,
        FOREIGN KEY(id_cliente) REFERENCES clientes(id_cliente) ON DELETE CASCADE
      )
    `);

    // 3. Cambios
    db.run(`
      CREATE TABLE IF NOT EXISTS cambios (
        id_cambio INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha_contable TEXT,
        par_divisa TEXT,
        valor_compra REAL,
        valor_venta REAL,
        timestamp TEXT
      )
    `);

    // 4. Opciones (clave_ajuste TEXT PRIMARY KEY, valor_ajuste TEXT)
    db.run(`
      CREATE TABLE IF NOT EXISTS opciones (
        clave_ajuste TEXT PRIMARY KEY,
        valor_ajuste TEXT
      )
    `);

    // 5. Movimientos
    db.run(`
      CREATE TABLE IF NOT EXISTS movimientos (
        id_movimiento INTEGER PRIMARY KEY AUTOINCREMENT,
        id_cliente INTEGER,
        id_cuenta INTEGER,
        tipo_transaccion TEXT,
        monto REAL,
        moneda TEXT,
        par_cambio TEXT,
        modalidad_cambio TEXT,
        valor_cambio REAL,
        concepto TEXT,
        observaciones TEXT,
        fecha_contable TEXT,
        status_operacion TEXT,
        timestamp TEXT,
        FOREIGN KEY(id_cliente) REFERENCES clientes(id_cliente) ON DELETE RESTRICT
      )
    `);

    // 6. E-Commerce
    db.run(`
      CREATE TABLE IF NOT EXISTS ecommerce (
        id_log INTEGER PRIMARY KEY AUTOINCREMENT,
        id_movimiento INTEGER,
        id_producto INTEGER,
        producto TEXT,
        monto REAL,
        moneda TEXT,
        cambio_aplicado REAL,
        cantidad INTEGER DEFAULT 1,
        timestamp TEXT,
        FOREIGN KEY(id_movimiento) REFERENCES movimientos(id_movimiento) ON DELETE CASCADE
      )
    `);

    // 7. Tipos de Transacción (Ajuste Administrativo)
    db.run(`
      CREATE TABLE IF NOT EXISTS tipos_transacciones (
        id_tipo INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT UNIQUE,
        categoria TEXT DEFAULT 'EGRESO'
      )
    `);

    // 8. Monedas (Ajuste Administrativo)
    db.run(`
      CREATE TABLE IF NOT EXISTS monedas (
        id_moneda INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT,
        siglas TEXT UNIQUE,
        tipo TEXT, -- FIAT o CRIPTO
        status TEXT DEFAULT 'ACTIVO'
      )
    `);

    // 9. Relaciones de Cambio (Ajuste Administrativo)
    db.run(`
      CREATE TABLE IF NOT EXISTS relaciones_cambio (
        id_relacion INTEGER PRIMARY KEY AUTOINCREMENT,
        moneda_origen TEXT,
        moneda_destino TEXT,
        UNIQUE(moneda_origen, moneda_destino)
      )
    `);

    // 10. Mis Cuentas (Cuentas propias del negocio/usuario)
    db.run(`
      CREATE TABLE IF NOT EXISTS mis_cuentas (
        id_mi_cuenta INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre_cuenta TEXT,
        tipo_cuenta TEXT,
        moneda TEXT,
        referencia TEXT,
        observaciones TEXT,
        status TEXT DEFAULT 'ACTIVO',
        timestamp TEXT
      )
    `);

    // 11. Productos E-Commerce (Nuevo)
    db.run(`
      CREATE TABLE IF NOT EXISTS ecommerce_productos (
        id_producto INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT UNIQUE,
        sku TEXT,
        stock INTEGER DEFAULT 0,
        moneda_costo TEXT,
        monto_costo REAL,
        cambio_costo REAL,
        observaciones TEXT,
        timestamp TEXT
      )
    `);

    // 12. Plataformas / Brokers (Nuevo)
    db.run(`
      CREATE TABLE IF NOT EXISTS plataformas (
        id_plataforma INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT UNIQUE,
        status TEXT DEFAULT 'ACTIVO'
      )
    `);

    // Índices de rendimiento
    db.run('CREATE INDEX IF NOT EXISTS idx_movimientos_fecha ON movimientos(fecha_contable);');
    db.run('CREATE INDEX IF NOT EXISTS idx_cuentas_cliente ON cuentas(id_cliente);');

    // MIGRACIONES AUTOMÁTICAS (para bases existentes)
    db.run("ALTER TABLE cuentas ADD COLUMN referencia TEXT;", (err) => {});
    db.run("ALTER TABLE cuentas ADD COLUMN status TEXT DEFAULT 'ACTIVO';", (err) => {});
    db.run("ALTER TABLE clientes ADD COLUMN status TEXT DEFAULT 'ACTIVO';", (err) => {});
    db.run("ALTER TABLE tipos_transacciones ADD COLUMN categoria TEXT DEFAULT 'EGRESO';", (err) => {});
    db.run("ALTER TABLE ecommerce ADD COLUMN id_producto INTEGER;", (err) => {});
    db.run("ALTER TABLE ecommerce ADD COLUMN cantidad INTEGER DEFAULT 1;", (err) => {});
    db.run("ALTER TABLE movimientos ADD COLUMN status_operacion TEXT DEFAULT 'LIQUIDADO';", (err) => {});
    db.run("ALTER TABLE movimientos ADD COLUMN subcategoria_ocasional TEXT;", (err) => {});
    db.run("ALTER TABLE ecommerce_productos ADD COLUMN precio_venta REAL DEFAULT 0.0;", (err) => {});
    db.run("ALTER TABLE ecommerce_productos ADD COLUMN imagen TEXT;", (err) => {});
    db.run("ALTER TABLE ecommerce_productos ADD COLUMN es_oferta INTEGER DEFAULT 0;", (err) => {});

    // Asegurar existencia del CLIENTE OCASIONAL (Tipo: OCASIONAL)
    db.get("SELECT COUNT(*) as count FROM clientes WHERE nombre = 'CLIENTE OCASIONAL'", (err, row) => {
      if (row && row.count === 0) {
        db.run(`
          INSERT INTO clientes (timestamp, nombre, documento, telefono, mail, tipo_cliente, observaciones, status)
          VALUES (?, 'CLIENTE OCASIONAL', '00000000-0', 'N/A', 'ocasional@fenix.com', 'OCASIONAL', 'Cliente genérico para transacciones rápidas', 'ACTIVO')
        `, [new Date().toISOString()]);
      }
    });

    // POBLACIÓN INICIAL AUTOMÁTICA
    db.get("SELECT COUNT(*) as count FROM tipos_transacciones", (err, row) => {
      if (row && row.count === 0) {
        const defaults = [
          ['COMPRA', 'EGRESO'],
          ['VENTA', 'INGRESO'],
          ['COMPRA_CRIPTO', 'EGRESO'],
          ['VENTA_CRIPTO', 'INGRESO'],
          ['ECOMMERCE / COMPRA', 'EGRESO'],
          ['ECOMMERCE / VENTA', 'INGRESO'],
          ['GASTO', 'EGRESO'],
          ['GASTO_PERSONAL', 'EGRESO'],
          ['DEPOSITO_PERSONAL', 'INGRESO'],
          ['AJUSTE', 'INGRESO']
        ];
        defaults.forEach(t => {
          db.run("INSERT OR IGNORE INTO tipos_transacciones (nombre, categoria) VALUES (?, ?)", t);
        });
      } else {
        // Ejecutar un UPDATE de seguridad para las que ya están creadas si no tenían categoría
        const defaults = [
          ['COMPRA', 'EGRESO'],
          ['VENTA', 'INGRESO'],
          ['COMPRA_CRIPTO', 'EGRESO'],
          ['VENTA_CRIPTO', 'INGRESO'],
          ['ECOMMERCE / COMPRA', 'EGRESO'],
          ['ECOMMERCE / VENTA', 'INGRESO'],
          ['GASTO', 'EGRESO'],
          ['GASTO_PERSONAL', 'EGRESO'],
          ['DEPOSITO_PERSONAL', 'INGRESO'],
          ['AJUSTE', 'INGRESO']
        ];
        defaults.forEach(t => {
          db.run("UPDATE tipos_transacciones SET categoria = ? WHERE nombre = ?", [t[1], t[0]]);
        });
      }
    });

    db.get("SELECT COUNT(*) as count FROM monedas", (err, row) => {
      if (row && row.count === 0) {
        const defaults = [
          ['Dólar Digital', 'USDT', 'CRIPTO', 'ACTIVO'],
          ['Dólar Americano', 'USD', 'FIAT', 'ACTIVO'],
          ['Euro', 'EUR', 'FIAT', 'ACTIVO'],
          ['Real Brasileño', 'BRL', 'FIAT', 'ACTIVO'],
          ['Guaraní Paraguayo', 'PYG', 'FIAT', 'ACTIVO']
        ];
        defaults.forEach(m => {
          db.run("INSERT OR IGNORE INTO monedas (nombre, siglas, tipo, status) VALUES (?, ?, ?, ?)", m);
        });
      }
    });

    db.get("SELECT COUNT(*) as count FROM relaciones_cambio", (err, row) => {
      if (row && row.count === 0) {
        const defaults = [
          ['USD', 'USDT'],
          ['EUR', 'USDT'],
          ['BRL', 'USDT'],
          ['USDT', 'PYG'],
          ['PYG', 'USDT']
        ];
        defaults.forEach(r => {
          db.run("INSERT OR IGNORE INTO relaciones_cambio (moneda_origen, moneda_destino) VALUES (?, ?)", r);
        });
      }
    });

    console.log('Estructura de base de datos, índices y catálogos administrativos inicializados.');
  });
}

// ==========================================
// MÓDULO DE SEGURIDAD (PASSWORD LOCAL HASHED)
// ==========================================

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedValue) {
  try {
    const [salt, originalHash] = storedValue.split(':');
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return hash === originalHash;
  } catch (e) {
    return false;
  }
}

// Configurar o verificar contraseña local
async function inicializarPassword(password) {
  const hashed = hashPassword(password);
  await dbRun(`INSERT OR REPLACE INTO opciones (clave_ajuste, valor_ajuste) VALUES ('admin_password', ?)`, [hashed]);
  return true;
}

async function validarPassword(password) {
  const res = await dbGet(`SELECT valor_ajuste FROM opciones WHERE clave_ajuste = 'admin_password'`);
  if (!res) {
    // Si no hay password configurado, retorna 'no_configurado' para forzar registro inicial
    return 'no_configurado';
  }
  return verifyPassword(password, res.valor_ajuste);
}

async function existePasswordConfigurado() {
  const res = await dbGet(`SELECT valor_ajuste FROM opciones WHERE clave_ajuste = 'admin_password'`);
  return !!res;
}

// ==========================================
// MÓDULO DE RESPALDOS (BACKUP LOCAL)
// ==========================================

function exportarBaseDatosLocal() {
  return new Promise((resolve, reject) => {
    try {
      const backupFolder = path.join(app.getPath('userData'), 'backups');
      if (!fs.existsSync(backupFolder)) {
        fs.mkdirSync(backupFolder, { recursive: true });
      }

      const dateStr = new Date().toISOString().replace(/T/, '_').replace(/\..+/, '').replace(/:/g, '-');
      const backupPath = path.join(backupFolder, `gestion_admin_backup_${dateStr}.db`);

      // Copiar archivo de base de datos síncronamente
      fs.copyFileSync(dbPath, backupPath);

      console.log(`Respaldo local generado con éxito en: ${backupPath}`);

      /* 
       * =======================================================================
       * VERSIÓN 2.0 - INTEGRACIÓN CON GOOGLE DRIVE SDK
       * =======================================================================
       * Aquí se acoplará el flujo del SDK de Google Drive:
       * 
       * 1. Instalar la librería: npm install googleapis
       * 2. Requerir OAuth2 y Drive API:
       *    const { google } = require('googleapis');
       * 3. Configurar credenciales (Client ID, Client Secret, Refresh Token):
       *    const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
       *    oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });
       *    const drive = google.drive({ version: 'v3', auth: oauth2Client });
       * 4. Subir el archivo respaldado de forma invisible:
       *    await drive.files.create({
       *      requestBody: {
       *        name: path.basename(backupPath),
       *        parents: [FOLDER_ID_BACKUPS]
       *      },
       *      media: {
       *        mimeType: 'application/x-sqlite3',
       *        body: fs.createReadStream(backupPath)
       *      }
       *    });
       * 5. Emitir un evento IPC informando el éxito de la sincronización en la nube.
       * =======================================================================
       */

      resolve(backupPath);
    } catch (error) {
      console.error('Error al exportar base de datos:', error);
      reject(error);
    }
  });
}

// ==========================================
// MÓDULO MOVIMIENTOS Y TRANSACCIÓN E-COMMERCE
// ==========================================

// Cola de promesas para serializar transacciones en la única conexión SQLite activa
let transactionPromiseLock = Promise.resolve();

async function registrarMovimientoTransaccional(movimientoData, ecommerceData = null) {
  // Esperar a que termine cualquier transacción previa en cola
  const currentTransaction = transactionPromiseLock;
  
  let resolveLock;
  transactionPromiseLock = new Promise((resolve) => {
    resolveLock = resolve;
  });

  try {
    await currentTransaction;
  } catch (err) {
    // Ignorar fallos de transacciones previas
  }

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION;', (beginErr) => {
        if (beginErr) {
          resolveLock(); // Liberar el lock inmediatamente
          return reject(beginErr);
        }

        const sqlMov = `
          INSERT INTO movimientos (
            id_cliente, id_cuenta, tipo_transaccion, monto, moneda, 
            par_cambio, modalidad_cambio, valor_cambio, concepto, 
            observaciones, fecha_contable, status_operacion, timestamp
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        db.run(
          sqlMov,
          [
            movimientoData.id_cliente,
            movimientoData.id_cuenta,
            movimientoData.tipo_transaccion,
            movimientoData.monto,
            movimientoData.moneda,
            movimientoData.par_cambio || null,
            movimientoData.modalidad_cambio || 'FIJO',
            movimientoData.valor_cambio || 1.0,
            movimientoData.concepto,
            movimientoData.observaciones,
            movimientoData.fecha_contable,
            movimientoData.status_operacion || 'COMPLETADO',
            new Date().toISOString()
          ],
          function (err) {
            if (err) {
              db.run('ROLLBACK;', () => {
                resolveLock(); // Liberar el lock
                reject(err);
              });
              return;
            }

            const idMovimiento = this.lastID;

            // Si es transacción de tipo E-Commerce y vienen datos de producto
            if (ecommerceData && (movimientoData.tipo_transaccion.startsWith('ECOMMERCE'))) {
              const sqlEco = `
                INSERT INTO ecommerce (
                  id_movimiento, id_producto, producto, monto, moneda, cambio_aplicado, cantidad, timestamp
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              `;

              db.run(
                sqlEco,
                [
                  idMovimiento,
                  ecommerceData.id_producto || null,
                  ecommerceData.producto,
                  ecommerceData.monto,
                  ecommerceData.moneda,
                  ecommerceData.cambio_aplicado,
                  ecommerceData.cantidad || 1,
                  new Date().toISOString()
                ],
                function (errEco) {
                  if (errEco) {
                    db.run('ROLLBACK;', () => {
                      resolveLock(); // Liberar el lock
                      reject(errEco);
                    });
                    return;
                  }

                  db.run('COMMIT;', (commitErr) => {
                    resolveLock(); // Liberar el lock
                    if (commitErr) return reject(commitErr);
                    resolve(idMovimiento);
                  });
                }
              );
            } else {
              db.run('COMMIT;', (commitErr) => {
                resolveLock(); // Liberar el lock
                if (commitErr) return reject(commitErr);
                resolve(idMovimiento);
              });
            }
          }
        );
      });
    });
  });
}

async function generarDatosPrueba() {
  const t = new Date();
  
  // Limpiar primero los datos anteriores para no duplicar
  await limpiarDatosPrueba();

  // 1. Crear clientes de prueba
  const cli1 = await dbRun(`
    INSERT INTO clientes (timestamp, nombre, documento, telefono, mail, tipo_cliente, observaciones, status) 
    VALUES (?, 'Juan Pérez [TEST]', '4432101-1', '+595 981 123456', 'juan.perez@test.com', 'MINORISTA', 'Cliente de prueba para simulación [TEST]', 'ACTIVO')
  `, [t.toISOString()]);
  
  const cli2 = await dbRun(`
    INSERT INTO clientes (timestamp, nombre, documento, telefono, mail, tipo_cliente, observaciones, status) 
    VALUES (?, 'Crypto Corp LLC [TEST]', '80054321-9', '+1 555 9876', 'info@cryptocorp.test', 'MAYORISTA', 'Cliente institucional de prueba [TEST]', 'ACTIVO')
  `, [t.toISOString()]);
  
  const idCli1 = cli1.lastID;
  const idCli2 = cli2.lastID;

  // 2. Crear cuentas para clientes
  const ctaCli1 = await dbRun(`
    INSERT INTO cuentas (id_cliente, nombre_cuenta, tipo_cuenta, moneda, referencia, observaciones, status, timestamp) 
    VALUES (?, 'Sudameris PYG [TEST]', 'BANCO', 'PYG', '123-456-789', 'Cuenta principal en guaraníes [TEST]', 'ACTIVO', ?)
  `, [idCli1, t.toISOString()]);
  
  const ctaCli2 = await dbRun(`
    INSERT INTO cuentas (id_cliente, nombre_cuenta, tipo_cuenta, moneda, referencia, observaciones, status, timestamp) 
    VALUES (?, 'Binance Wallet USDT [TEST]', 'CRIPTO', 'USDT', '0x71C39fE27346A29381831818273618', 'Wallet corporativo [TEST]', 'ACTIVO', ?)
  `, [idCli2, t.toISOString()]);

  const idCtaCli1 = ctaCli1.lastID;
  const idCtaCli2 = ctaCli2.lastID;

  // 3. Crear cuentas de la empresa (mis_cuentas)
  const miCta1 = await dbRun(`
    INSERT INTO mis_cuentas (nombre_cuenta, tipo_cuenta, moneda, referencia, observaciones, status, timestamp) 
    VALUES ('Caja Chica PYG [TEST]', 'EFECTIVO', 'PYG', 'CAJA-01', 'Efectivo en caja oficina [TEST]', 'ACTIVO', ?)
  `, [t.toISOString()]);
  
  const miCta2 = await dbRun(`
    INSERT INTO mis_cuentas (nombre_cuenta, tipo_cuenta, moneda, referencia, observaciones, status, timestamp) 
    VALUES ('Banco Principal USD [TEST]', 'BANCO', 'USD', '987-654-321', 'Banco empresarial [TEST]', 'ACTIVO', ?)
  `, [t.toISOString()]);
  
  const miCta3 = await dbRun(`
    INSERT INTO mis_cuentas (nombre_cuenta, tipo_cuenta, moneda, referencia, observaciones, status, timestamp) 
    VALUES ('Personal Cash PYG [TEST]', 'EFECTIVO', 'PYG', 'CAJA-PERS', 'Gastos de bolsillo [TEST]', 'ACTIVO', ?)
  `, [t.toISOString()]);

  const idMiCta1 = miCta1.lastID;
  const idMiCta2 = miCta2.lastID;
  const idMiCta3 = miCta3.lastID;

  // Guardar en opciones las cuentas asignadas
  await dbRun("INSERT OR REPLACE INTO opciones (clave_ajuste, valor_ajuste) VALUES ('cuenta_principal_id', ?)", [idMiCta2.toString()]);
  await dbRun("INSERT OR REPLACE INTO opciones (clave_ajuste, valor_ajuste) VALUES ('cuenta_gastos_personales_id', ?)", [idMiCta3.toString()]);

  // 3.1 Crear productos E-commerce con precio de venta, ofertas e imágenes basadas en la lista
  const prod1 = await dbRun(`
    INSERT INTO ecommerce_productos (nombre, sku, stock, moneda_costo, monto_costo, cambio_costo, observaciones, timestamp, precio_venta, imagen, es_oferta)
    VALUES ('[TEST] iMac Pro Retina 5K', 'IMAC-PRO-TEST', 2, 'USD', 2500.0, 1.0, 'iMac Pro para pruebas locales [TEST]', ?, 2999.0, 'imac-pro.png', 1)
  `, [t.toISOString()]);

  const prod2 = await dbRun(`
    INSERT INTO ecommerce_productos (nombre, sku, stock, moneda_costo, monto_costo, cambio_costo, observaciones, timestamp, precio_venta, imagen, es_oferta)
    VALUES ('[TEST] iPhone 15 Pro Max', 'IPHONE-15-PRO-TEST', 5, 'USD', 1100.0, 1.0, 'iPhone 15 Pro Max de prueba [TEST]', ?, 1399.0, 'IPhone_15_Pro.jpeg', 1)
  `, [t.toISOString()]);

  const prod3 = await dbRun(`
    INSERT INTO ecommerce_productos (nombre, sku, stock, moneda_costo, monto_costo, cambio_costo, observaciones, timestamp, precio_venta, imagen, es_oferta)
    VALUES ('[TEST] iPhone SE 2022', 'IPHONE-SE-TEST', 8, 'USD', 350.0, 1.0, 'iPhone estándar de prueba [TEST]', ?, 449.0, 'iphone.png', 0)
  `, [t.toISOString()]);

  const prod4 = await dbRun(`
    INSERT INTO ecommerce_productos (nombre, sku, stock, moneda_costo, monto_costo, cambio_costo, observaciones, timestamp, precio_venta, imagen, es_oferta)
    VALUES ('[TEST] Logitech MX Master 3S', 'LOGITECH-MX-TEST', 15, 'USD', 75.0, 1.0, 'Mouse premium de prueba [TEST]', ?, 99.0, 'logitech-mx.png', 1)
  `, [t.toISOString()]);

  const prod5 = await dbRun(`
    INSERT INTO ecommerce_productos (nombre, sku, stock, moneda_costo, monto_costo, cambio_costo, observaciones, timestamp, precio_venta, imagen, es_oferta)
    VALUES ('[TEST] Apple Magic Mouse 2', 'MAGIC-MOUSE-TEST', 10, 'USD', 60.0, 1.0, 'Mouse Apple de prueba [TEST]', ?, 79.0, 'magic-mouse.png', 0)
  `, [t.toISOString()]);

  const prod6 = await dbRun(`
    INSERT INTO ecommerce_productos (nombre, sku, stock, moneda_costo, monto_costo, cambio_costo, observaciones, timestamp, precio_venta, imagen, es_oferta)
    VALUES ('[TEST] Xiaomi Mi TV P1 55', 'MI-TV-TEST', 4, 'USD', 380.0, 1.0, 'Smart TV Xiaomi de prueba [TEST]', ?, 499.0, 'mi-tv.png', 0)
  `, [t.toISOString()]);

  const prod7 = await dbRun(`
    INSERT INTO ecommerce_productos (nombre, sku, stock, moneda_costo, monto_costo, cambio_costo, observaciones, timestamp, precio_venta, imagen, es_oferta)
    VALUES ('[TEST] Nike Air Jordan 1 Low', 'NIKE-JORDAN-TEST', 7, 'USD', 95.0, 1.0, 'Calzado deportivo de prueba [TEST]', ?, 129.0, 'nikejordan.png', 1)
  `, [t.toISOString()]);

  const prod8 = await dbRun(`
    INSERT INTO ecommerce_productos (nombre, sku, stock, moneda_costo, monto_costo, cambio_costo, observaciones, timestamp, precio_venta, imagen, es_oferta)
    VALUES ('[TEST] Samsung Galaxy Note 10 Lite', 'SAMSUNG-NOTE10-TEST', 3, 'USD', 300.0, 1.0, 'Smartphone Samsung de prueba [TEST]', ?, 389.0, 'note10.png', 0)
  `, [t.toISOString()]);

  const prod9 = await dbRun(`
    INSERT INTO ecommerce_productos (nombre, sku, stock, moneda_costo, monto_costo, cambio_costo, observaciones, timestamp, precio_venta, imagen, es_oferta)
    VALUES ('[TEST] OnePlus LG Nord N20', 'ONEPLUS-LG-TEST', 6, 'USD', 220.0, 1.0, 'Teléfono OnePlus LG de prueba [TEST]', ?, 289.0, 'oneplus-lg.png', 0)
  `, [t.toISOString()]);

  const prod10 = await dbRun(`
    INSERT INTO ecommerce_productos (nombre, sku, stock, moneda_costo, monto_costo, cambio_costo, observaciones, timestamp, precio_venta, imagen, es_oferta)
    VALUES ('[TEST] OnePlus 11 5G', 'ONEPLUS-11-TEST', 5, 'USD', 580.0, 1.0, 'OnePlus 11 de prueba [TEST]', ?, 699.0, 'oneplus.png', 1)
  `, [t.toISOString()]);

  const idProd1 = prod1.lastID;
  const idProd2 = prod2.lastID;
  const idProd3 = prod3.lastID;
  const idProd4 = prod4.lastID;
  const idProd5 = prod5.lastID;
  const idProd6 = prod6.lastID;
  const idProd7 = prod7.lastID;
  const idProd8 = prod8.lastID;
  const idProd9 = prod9.lastID;
  const idProd10 = prod10.lastID;

  // 4. Crear tasas de cambio para los últimos 7 días
  const fechaHoy = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(fechaHoy.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];

    // Relaciones
    await dbRun("INSERT OR REPLACE INTO cambios (fecha_contable, par_divisa, valor_compra, valor_venta, timestamp) VALUES (?, 'USD/USDT', ?, ?, ?)",
      [dateStr, 0.98 + (Math.random() * 0.04), 1.01 + (Math.random() * 0.04), d.toISOString()]);
    await dbRun("INSERT OR REPLACE INTO cambios (fecha_contable, par_divisa, valor_compra, valor_venta, timestamp) VALUES (?, 'USDT/PYG', ?, ?, ?)",
      [dateStr, 7400 + Math.floor(Math.random() * 150), 7500 + Math.floor(Math.random() * 150), d.toISOString()]);
    await dbRun("INSERT OR REPLACE INTO cambios (fecha_contable, par_divisa, valor_compra, valor_venta, timestamp) VALUES (?, 'PYG/USDT', ?, ?, ?)",
      [dateStr, 0.00013, 0.00014, d.toISOString()]);
  }

  // 5. Crear transacciones para 7 días
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(fechaHoy.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];

    // Transacción 1: COMPRA de divisas a Juan Pérez (PYG)
    const monto1 = 1000000 + Math.floor(Math.random() * 3000000);
    const mov1 = await dbRun(`
      INSERT INTO movimientos (id_cliente, id_cuenta, tipo_transaccion, monto, moneda, par_cambio, modalidad_cambio, valor_cambio, concepto, observaciones, fecha_contable, status_operacion, timestamp)
      VALUES (?, ?, 'COMPRA', ?, 'PYG', 'PYG/USDT', 'FIJO', 0.000134, '[TEST] Compra de saldo en Guaraníes', 'Factura de cambio recibida', ?, 'COMPLETADO', ?)
    `, [idCli1, idCtaCli1, monto1, dateStr, d.toISOString()]);

    // Transacción 2: VENTA de USDT a Crypto Corp LLC
    const monto2 = 500 + Math.floor(Math.random() * 1500);
    const mov2 = await dbRun(`
      INSERT INTO movimientos (id_cliente, id_cuenta, tipo_transaccion, monto, moneda, par_cambio, modalidad_cambio, valor_cambio, concepto, observaciones, fecha_contable, status_operacion, timestamp)
      VALUES (?, ?, 'VENTA_CRIPTO', ?, 'USDT', NULL, 'FIJO', 1.0, '[TEST] Venta de USDT corporativo', 'Enviado a Binance Wallet', ?, 'COMPLETADO', ?)
    `, [idCli2, idCtaCli2, monto2, dateStr, d.toISOString()]);

    // Transacción 3: GASTO operativo en guaraníes
    await dbRun(`
      INSERT INTO movimientos (id_cliente, id_cuenta, tipo_transaccion, monto, moneda, par_cambio, modalidad_cambio, valor_cambio, concepto, observaciones, fecha_contable, status_operacion, timestamp)
      VALUES (?, ?, 'GASTO', ?, 'PYG', 'PYG/USDT', 'FIJO', 0.000134, '[TEST] Pago de hosting de servidores', 'Factura mensual', ?, 'COMPLETADO', ?)
    `, [idCli1, idCtaCli1, 250000, dateStr, d.toISOString()]);

    // Transacción 4: GASTO PERSONAL (gastos directivos)
    await dbRun(`
      INSERT INTO movimientos (id_cliente, id_cuenta, tipo_transaccion, monto, moneda, par_cambio, modalidad_cambio, valor_cambio, concepto, observaciones, fecha_contable, status_operacion, timestamp)
      VALUES (NULL, ?, 'GASTO_PERSONAL', ?, 'PYG', 'PYG/USDT', 'FIJO', 0.000134, '[TEST] Almuerzo de negocios de la gerencia', 'Gasto personal del socio principal', ?, 'COMPLETADO', ?)
    `, [idMiCta3, 120000 + Math.floor(Math.random() * 100000), dateStr, d.toISOString()]);

    // Transacción 4.5: DEPOSITO PERSONAL (fondeo de caja de gastos de socios)
    await dbRun(`
      INSERT INTO movimientos (id_cliente, id_cuenta, tipo_transaccion, monto, moneda, par_cambio, modalidad_cambio, valor_cambio, concepto, observaciones, fecha_contable, status_operacion, timestamp)
      VALUES (NULL, ?, 'DEPOSITO_PERSONAL', ?, 'PYG', 'PYG/USDT', 'FIJO', 0.000134, '[TEST] Fondeo de caja para viáticos socios', 'Depósito de socio', ?, 'COMPLETADO', ?)
    `, [idMiCta3, 500000, dateStr, d.toISOString()]);

    // Transacción 5: COMPRA E-COMMERCE (Compra de mercadería para stock)
    const mov5c = await dbRun(`
      INSERT INTO movimientos (id_cliente, id_cuenta, tipo_transaccion, monto, moneda, par_cambio, modalidad_cambio, valor_cambio, concepto, observaciones, fecha_contable, status_operacion, timestamp)
      VALUES (?, ?, 'ECOMMERCE / COMPRA', ?, 'USDT', NULL, 'FIJO', 1.0, '[TEST] Adquisición de lote PlayStation 5', 'Abastecimiento de stock', ?, 'COMPLETADO', ?)
    `, [idCli1, idCtaCli2, 900.0, dateStr, d.toISOString()]);
    
    await dbRun(`
      INSERT INTO ecommerce (id_movimiento, id_producto, producto, monto, moneda, cambio_aplicado, cantidad, timestamp)
      VALUES (?, ?, '[TEST] PlayStation 5 Slim', 450.0, 'USD', 1.0, 2, ?)
    `, [mov5c.lastID, idProd1, d.toISOString()]);

    // Transacción 6: VENTA E-COMMERCE (Venta de stock)
    const mov5v = await dbRun(`
      INSERT INTO movimientos (id_cliente, id_cuenta, tipo_transaccion, monto, moneda, par_cambio, modalidad_cambio, valor_cambio, concepto, observaciones, fecha_contable, status_operacion, timestamp)
      VALUES (?, ?, 'ECOMMERCE / VENTA', ?, 'USDT', NULL, 'FIJO', 1.0, '[TEST] Venta de PlayStation 5 Black', 'Orden aprobada', ?, 'COMPLETADO', ?)
    `, [idCli1, idCtaCli2, 550.0, dateStr, d.toISOString()]);
    
    await dbRun(`
      INSERT INTO ecommerce (id_movimiento, id_producto, producto, monto, moneda, cambio_aplicado, cantidad, timestamp)
      VALUES (?, ?, '[TEST] PlayStation 5 Slim', 550.0, 'USD', 1.0, 1, ?)
    `, [mov5v.lastID, idProd1, d.toISOString()]);
  }
  
  return true;
}

async function limpiarDatosPrueba() {
  await dbRun("DELETE FROM ecommerce WHERE producto LIKE '%[TEST]%' OR id_producto IN (SELECT id_producto FROM ecommerce_productos WHERE nombre LIKE '%[TEST]%')");
  await dbRun("DELETE FROM movimientos WHERE concepto LIKE '%[TEST]%'");
  
  const testClientes = await dbAll("SELECT id_cliente FROM clientes WHERE observaciones LIKE '%[TEST]%' OR nombre LIKE '%[TEST]%'");
  for (let c of testClientes) {
    await dbRun("DELETE FROM cuentas WHERE id_cliente = ?", [c.id_cliente]);
    await dbRun("DELETE FROM clientes WHERE id_cliente = ?", [c.id_cliente]);
  }

  await dbRun("DELETE FROM mis_cuentas WHERE observaciones LIKE '%[TEST]%' OR nombre_cuenta LIKE '%[TEST]%'");
  await dbRun("DELETE FROM cambios WHERE par_divisa LIKE '%[TEST]%' OR timestamp LIKE '%[TEST]%' OR fecha_contable IN (SELECT fecha_contable FROM cambios WHERE timestamp LIKE '%[TEST]%')");
  await dbRun("DELETE FROM ecommerce_productos WHERE nombre LIKE '%[TEST]%'");
  
  return true;
}

// Exportación del controlador de Base de Datos
module.exports = {
  dbRun,
  dbGet,
  dbAll,
  inicializarPassword,
  validarPassword,
  existePasswordConfigurado,
  exportarBaseDatosLocal,
  registrarMovimientoTransaccional,
  generarDatosPrueba,
  limpiarDatosPrueba,
  dbPath
};
