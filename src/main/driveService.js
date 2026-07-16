const { google } = require('googleapis');
const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const { shell, app } = require('electron');

// Default client credentials (can be overridden in settings UI)
const DEFAULT_CLIENT_ID = '321356885331-5mpe55kbl1a4bmd0tfl3r6jchd84j0j9.apps.googleusercontent.com';
const DEFAULT_CLIENT_SECRET = 'GOCSPX-placeholder_secret_value';

let loopbackServer = null;

async function getOAuth2Client(db) {
  let clientId = await db.dbGet("SELECT valor_ajuste FROM opciones WHERE clave_ajuste = 'drive_client_id'").then(r => r ? r.valor_ajuste : null);
  let clientSecret = await db.dbGet("SELECT valor_ajuste FROM opciones WHERE clave_ajuste = 'drive_client_secret'").then(r => r ? r.valor_ajuste : null);

  if (!clientId) clientId = DEFAULT_CLIENT_ID;
  if (!clientSecret) clientSecret = DEFAULT_CLIENT_SECRET;

  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    'http://localhost:8555'
  );
}

function conectarCuentaDrive(db, onAuthenticated, onError) {
  if (loopbackServer) {
    loopbackServer.close();
    loopbackServer = null;
  }

  getOAuth2Client(db).then(oauth2Client => {
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/userinfo.email'
      ]
    });

    loopbackServer = http.createServer(async (req, res) => {
      try {
        const reqUrl = url.parse(req.url, true);
        if (reqUrl.pathname === '/') {
          const code = reqUrl.query.code;
          if (code) {
            const { tokens } = await oauth2Client.getToken(code);
            oauth2Client.setCredentials(tokens);

            const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
            const userInfo = await oauth2.userinfo.get();
            const email = userInfo.data.email || 'Conectado';

            // Guardar refresh_token e email
            await db.dbRun("INSERT OR REPLACE INTO opciones (clave_ajuste, valor_ajuste) VALUES ('drive_refresh_token', ?)", [tokens.refresh_token]);
            await db.dbRun("INSERT OR REPLACE INTO opciones (clave_ajuste, valor_ajuste) VALUES ('drive_user_email', ?)", [email]);

            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`
              <html>
                <body style="font-family: sans-serif; text-align: center; padding: 40px; background-color: #0f172a; color: #cbd5e1;">
                  <h1 style="color: #4f46e5;">¡Autenticación Exitosa!</h1>
                  <p>La cuenta <strong>${email}</strong> ha sido vinculada correctamente con FENIX ADMIN.</p>
                  <p>Ya puede cerrar esta ventana y regresar a la aplicación de escritorio.</p>
                </body>
              </html>
            `);

            setTimeout(() => {
              if (loopbackServer) {
                loopbackServer.close();
                loopbackServer = null;
              }
            }, 1000);

            onAuthenticated(email);
          } else {
            res.writeHead(400);
            res.end('No code provided');
          }
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      } catch (err) {
        console.error('Error en loopback OAuth2:', err);
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Error en la autenticación: ' + err.message);
        onError(err);
      }
    });

    loopbackServer.listen(8555, () => {
      console.log('Servidor loopback escuchando en puerto 8555 para OAuth2...');
      shell.openExternal(authUrl);
    });
  }).catch(err => {
    onError(err);
  });
}

function desconectarCuentaDrive(db) {
  if (loopbackServer) {
    loopbackServer.close();
    loopbackServer = null;
  }
  return Promise.all([
    db.dbRun("DELETE FROM opciones WHERE clave_ajuste = 'drive_refresh_token'"),
    db.dbRun("DELETE FROM opciones WHERE clave_ajuste = 'drive_user_email'")
  ]);
}

async function getAuthenticatedClient(db) {
  const refreshToken = await db.dbGet("SELECT valor_ajuste FROM opciones WHERE clave_ajuste = 'drive_refresh_token'").then(r => r ? r.valor_ajuste : null);
  if (!refreshToken) {
    throw new Error('No hay una cuenta de Google Drive conectada (falta refresh_token).');
  }

  const oauth2Client = await getOAuth2Client(db);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

// Obtener o Crear carpeta FENIX ADMIN en Drive
async function obtenerOCrearCarpetaDrive(drive) {
  const query = "name = 'Plataforma_Admin_DB' and mimeType = 'application/vnd.google-apps.folder' and trashed = false";
  const list = await drive.files.list({ q: query, fields: 'files(id)' });
  
  if (list.data.files && list.data.files.length > 0) {
    return list.data.files[0].id;
  }

  // Si no existe, crear carpeta
  const metadata = {
    name: 'Plataforma_Admin_DB',
    mimeType: 'application/vnd.google-apps.folder'
  };
  const res = await drive.files.create({
    resource: metadata,
    fields: 'id'
  });
  return res.data.id;
}

async function subirBaseDatosADrive(db) {
  const auth = await getAuthenticatedClient(db);
  const drive = google.drive({ version: 'v3', auth });

  const folderId = await obtenerOCrearCarpetaDrive(drive);
  const localDbPath = db.dbPath;

  if (!fs.existsSync(localDbPath)) {
    throw new Error(`El archivo de base de datos local no existe en: ${localDbPath}`);
  }

  // Buscar archivo existente en Drive
  const query = `name = 'gestion_admin.db' and '${folderId}' in parents and trashed = false`;
  const list = await drive.files.list({ q: query, fields: 'files(id)' });

  const media = {
    mimeType: 'application/octet-stream',
    body: fs.createReadStream(localDbPath)
  };

  if (list.data.files && list.data.files.length > 0) {
    // Actualizar archivo
    const fileId = list.data.files[0].id;
    await drive.files.update({
      fileId: fileId,
      media: media,
      fields: 'id'
    });
    console.log(`Base de datos actualizada en Drive con id: ${fileId}`);
    return fileId;
  } else {
    // Crear archivo nuevo en la carpeta
    const metadata = {
      name: 'gestion_admin.db',
      parents: [folderId]
    };
    const res = await drive.files.create({
      resource: metadata,
      media: media,
      fields: 'id'
    });
    console.log(`Base de datos creada en Drive con id: ${res.data.id}`);
    return res.data.id;
  }
}

async function descargarBaseDatosDeDrive(db) {
  const auth = await getAuthenticatedClient(db);
  const drive = google.drive({ version: 'v3', auth });

  const folderId = await obtenerOCrearCarpetaDrive(drive);
  const localDbPath = db.dbPath;

  // Buscar archivo en Drive
  const query = `name = 'gestion_admin.db' and '${folderId}' in parents and trashed = false`;
  const list = await drive.files.list({ q: query, fields: 'files(id, modifiedTime)' });

  if (!list.data.files || list.data.files.length === 0) {
    throw new Error('No se encontró ningún respaldo contable de gestion_admin.db en Google Drive.');
  }

  const driveFile = list.data.files[0];
  const driveModifiedTime = new Date(driveFile.modifiedTime);

  // Obtener fecha del archivo local
  let localModifiedTime = new Date(0);
  if (fs.existsSync(localDbPath)) {
    const stats = fs.statSync(localDbPath);
    localModifiedTime = new Date(stats.mtime);
  }

  // Comparar fechas
  const remoteIsNewer = driveModifiedTime.getTime() > localModifiedTime.getTime() + 1000; // Tolerancia 1s

  if (!remoteIsNewer) {
    return {
      updated: false,
      localTime: localModifiedTime.toISOString(),
      remoteTime: driveModifiedTime.toISOString()
    };
  }

  // Descargar y reemplazar
  const backupDbPath = path.join(path.dirname(localDbPath), `gestion_admin_backup_PRE_DRIVE.db`);
  if (fs.existsSync(localDbPath)) {
    fs.copyFileSync(localDbPath, backupDbPath);
  }

  // Descarga del stream del archivo de Drive
  const destStream = fs.createWriteStream(localDbPath);
  const driveRes = await drive.files.get(
    { fileId: driveFile.id, alt: 'media' },
    { responseType: 'stream' }
  );

  return new Promise((resolve, reject) => {
    driveRes.data
      .on('end', () => {
        resolve({
          updated: true,
          localTime: localModifiedTime.toISOString(),
          remoteTime: driveModifiedTime.toISOString()
        });
      })
      .on('error', err => {
        reject(err);
      })
      .pipe(destStream);
  });
}

function shutdownLoopback() {
  if (loopbackServer) {
    loopbackServer.close();
    loopbackServer = null;
    console.log('Servidor loopback cerrado por apagado de la aplicación.');
  }
}

module.exports = {
  conectarCuentaDrive,
  desconectarCuentaDrive,
  subirBaseDatosADrive,
  descargarBaseDatosDeDrive,
  shutdownLoopback
};
