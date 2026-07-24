const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const os = require('os');

const dbPath = path.join(os.homedir(), 'Library/Application Support/fnx-admin/gestion_admin.db');
const db = new sqlite3.Database(dbPath);

db.all("SELECT id_movimiento, tipo_transaccion, monto, moneda, par_cambio, valor_cambio FROM movimientos LIMIT 10", [], (err, rows) => {
  if (err) {
    console.error(err);
  } else {
    console.log('Sample Movements:');
    console.log(rows);
  }
  db.close();
});
