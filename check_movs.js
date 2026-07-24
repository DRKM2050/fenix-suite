const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const os = require('os');

const dbPath = path.join(os.homedir(), 'Library/Application Support/fnx-admin/gestion_admin.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to database:', err);
    return;
  }
  console.log('Connected to:', dbPath);
});

db.all("SELECT COUNT(*) as count FROM movimientos", [], (err, rows) => {
  if (err) console.error(err);
  else console.log('Movimientos count:', rows[0].count);
});

db.all("SELECT * FROM cambios", [], (err, rows) => {
  if (err) console.error(err);
  else {
    console.log('Cambios:');
    console.log(rows);
  }
  db.close();
});
