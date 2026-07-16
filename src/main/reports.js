const fs = require('fs');
const path = require('path');
const { app, BrowserWindow } = require('electron');
const db = require('./db');

// Helper para formato de números en el backend (miles con punto, decimales con coma)
function formatearNumeroPDF(numero) {
  if (numero === undefined || numero === null || isNaN(numero)) return '0,00';
  let str = Number(numero).toFixed(4); // Máximo 4 decimales
  
  if (str.endsWith('.0000')) {
    str = Number(numero).toFixed(2);
  } else if (str.includes('.')) {
    while (str.endsWith('0') && str.split('.')[1].length > 2) {
      str = str.substring(0, str.length - 1);
    }
  }
  
  let parts = str.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return parts.join(',');
}

// Helper para obtener imagen del logo en base64
function obtenerLogoBase64() {
  const posiblesNombres = ['logo-rep.png', 'logo-rep.jpg', 'logo.png', 'logofnx.png'];
  const imgDir = path.join(__dirname, '../../assets/img');
  
  for (const nombre of posiblesNombres) {
    const fullPath = path.join(imgDir, nombre);
    if (fs.existsSync(fullPath)) {
      try {
        const ext = path.extname(nombre).toLowerCase().replace('.', '');
        const data = fs.readFileSync(fullPath).toString('base64');
        return `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${data}`;
      } catch (err) {
        console.error('Error al leer logo para reporte:', err);
      }
    }
  }
  return null; // Retorna null si no se encuentra ninguna imagen
}

async function generarReportePDF(filtros, movimientos) {
  // 1. Cargar metadatos corporativos
  const empresaNombre = await db.dbGet("SELECT valor_ajuste FROM opciones WHERE clave_ajuste = 'empresa_nombre'").then(r => r ? r.valor_ajuste : '-- No Configurado --');
  const empresaRuc = await db.dbGet("SELECT valor_ajuste FROM opciones WHERE clave_ajuste = 'empresa_ruc'").then(r => r ? r.valor_ajuste : '-- No Configurado --');
  const empresaEmail = await db.dbGet("SELECT valor_ajuste FROM opciones WHERE clave_ajuste = 'empresa_email'").then(r => r ? r.valor_ajuste : '-- No Configurado --');
  const empresaTelefono = await db.dbGet("SELECT valor_ajuste FROM opciones WHERE clave_ajuste = 'empresa_telefono'").then(r => r ? r.valor_ajuste : '-- No Configurado --');
  const monedaPrincipal = await db.dbGet("SELECT valor_ajuste FROM opciones WHERE clave_ajuste = 'moneda_principal'").then(r => r ? r.valor_ajuste : 'USDT');

  // 2. Determinar periodo de datos
  let periodoStr = 'Todo el histórico contable';
  if (filtros.fecha_inicio && filtros.fecha_fin) {
    periodoStr = `Del ${formatearFechaPDF(filtros.fecha_inicio)} al ${formatearFechaPDF(filtros.fecha_fin)}`;
  } else if (filtros.fecha_inicio) {
    periodoStr = `Día Comercial: ${formatearFechaPDF(filtros.fecha_inicio)}`;
  }

  // 3. Obtener Logo Base64
  const logoBase64 = obtenerLogoBase64();

  // 4. Calcular Totales y Subtotales
  let totalIncomes = 0.0;
  let totalExpenses = 0.0;

  movimientos.forEach(m => {
    let valorUSDT = m.monto;
    if (m.moneda !== monedaPrincipal) {
      valorUSDT = m.monto * m.valor_cambio;
    }
    if (m.tipo_categoria === 'INGRESO') {
      totalIncomes += valorUSDT;
    } else {
      totalExpenses += valorUSDT;
    }
  });
  const balanceNeto = totalIncomes - totalExpenses;

  // 5. Construir HTML
  const htmlContent = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Reporte Financiero Contable</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;750&family=Inter:wght@300;400;650&display=swap');
        
        body {
          font-family: 'Inter', sans-serif;
          color: #1e293b;
          margin: 0;
          padding: 20px;
          font-size: 11px;
          background-color: #ffffff;
        }

        h1, h2, h3, .font-title {
          font-family: 'Outfit', sans-serif;
        }

        .header-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 25px;
        }

        .company-name {
          font-size: 20px;
          font-weight: 750;
          color: #4f46e5;
          margin: 0 0 5px 0;
        }

        .company-details {
          color: #64748b;
          font-size: 10px;
          line-height: 1.4;
        }

        .logo-container {
          text-align: right;
          vertical-align: top;
        }

        .logo-img {
          max-height: 55px;
          max-width: 180px;
          object-fit: contain;
        }

        .divider {
          border-top: 2px solid #e2e8f0;
          margin-bottom: 20px;
        }

        .report-title-section {
          margin-bottom: 25px;
        }

        .report-title {
          font-size: 16px;
          font-weight: 600;
          margin: 0 0 5px 0;
          color: #0f172a;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .report-period {
          font-size: 11px;
          color: #64748b;
          font-weight: 500;
        }

        /* KPIs Panel */
        .kpi-container {
          display: table;
          width: 100%;
          table-layout: fixed;
          margin-bottom: 30px;
          border-spacing: 12px 0;
        }

        .kpi-card {
          display: table-cell;
          background-color: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 15px;
          text-align: center;
        }

        .kpi-label {
          font-size: 9px;
          font-weight: 650;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 5px;
        }

        .kpi-value {
          font-size: 15px;
          font-weight: 750;
          font-family: 'Outfit', sans-serif;
        }

        .text-income { color: #10b981; }
        .text-expense { color: #ef4444; }
        .text-balance { color: #4f46e5; }

        /* Table */
        .data-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 30px;
        }

        .data-table th {
          background-color: #f1f5f9;
          border-bottom: 2px solid #cbd5e1;
          color: #475569;
          font-weight: 650;
          font-size: 9px;
          text-transform: uppercase;
          padding: 10px 8px;
          text-align: left;
        }

        .data-table td {
          padding: 10px 8px;
          border-bottom: 1px solid #e2e8f0;
          color: #334155;
          vertical-align: top;
        }

        .data-table tr:nth-child(even) {
          background-color: #f8fafc;
        }

        .badge {
          display: inline-block;
          font-size: 8px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 4px;
          text-transform: uppercase;
        }

        .badge-income {
          background-color: #d1fae5;
          color: #065f46;
          border: 1px solid #a7f3d0;
        }

        .badge-expense {
          background-color: #fee2e2;
          color: #991b1b;
          border: 1px solid #fca5a5;
        }

        .text-right { text-align: right; }
        .font-mono { font-family: monospace; }
        
        .footer-note {
          margin-top: 40px;
          text-align: center;
          font-size: 9px;
          color: #94a3b8;
          border-top: 1px dashed #e2e8f0;
          padding-top: 15px;
        }
      </style>
    </head>
    <body>
      <!-- MEMBRETE CORPORATIVO -->
      <table class="header-table">
        <tr>
          <td>
            <div class="company-name">${empresaNombre}</div>
            <div class="company-details">
              <strong>RUC / Identificación:</strong> ${empresaRuc}<br>
              <strong>Email de Administración:</strong> ${empresaEmail}<br>
              <strong>Teléfono:</strong> ${empresaTelefono}
            </div>
          </td>
          <td class="logo-container">
            ${logoBase64 ? `<img src="${logoBase64}" class="logo-img" alt="Logo corporativo">` : `<div style="font-size:16px; font-weight:bold; color:#64748b;">${empresaNombre}</div>`}
          </td>
        </tr>
      </table>

      <div class="divider"></div>

      <!-- TITULO E IDENTIFICACION DEL REPORTE -->
      <div class="report-title-section">
        <div class="report-title">Libro Diario Contable</div>
        <div class="report-period"><strong>Periodo de Datos:</strong> ${periodoStr}</div>
      </div>

      <!-- RESUMEN DE TOTALES Y SUB-TOTALES -->
      <div class="kpi-container">
        <div class="kpi-card">
          <div class="kpi-label">Subtotal Ingresos</div>
          <div class="kpi-value text-income">+${formatearNumeroPDF(totalIncomes)} ${monedaPrincipal}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Subtotal Egresos</div>
          <div class="kpi-value text-expense">-${formatearNumeroPDF(totalExpenses)} ${monedaPrincipal}</div>
        </div>
        <div class="kpi-card" style="background-color: #f5f3ff; border-color: #ddd6fe;">
          <div class="kpi-label">Flujo Neto Consolidado</div>
          <div class="kpi-value text-balance">${formatearNumeroPDF(balanceNeto)} ${monedaPrincipal}</div>
        </div>
      </div>

      <!-- TABLA DETALLADA -->
      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 5%">Ref</th>
            <th style="width: 10%">Fecha</th>
            <th style="width: 25%">Cliente / Documento (RUC)</th>
            <th style="width: 15%">Cuenta Impactada</th>
            <th style="width: 12%">Operación</th>
            <th style="width: 18%">Detalle / Producto</th>
            <th style="width: 15%" class="text-right">Monto Original</th>
            <th style="width: 15%" class="text-right">Equiv. (${monedaPrincipal})</th>
          </tr>
        </thead>
        <tbody>
          ${movimientos.map(m => {
            const esIngreso = m.tipo_categoria === 'INGRESO';
            let valorEquiv = m.monto;
            if (m.moneda !== monedaPrincipal) {
              valorEquiv = m.monto * m.valor_cambio;
            }

            const docCliente = m.cliente_documento ? `(RUC: ${m.cliente_documento})` : '(N/A)';
            const cliInfo = m.cliente_nombre ? `${m.cliente_nombre} <br><span style="font-size:9px; color:#64748b;">${docCliente}</span>` : 'Fondo Corporativo / Socios';

            return `
              <tr>
                <td class="font-mono" style="font-weight: 600;">#${m.id_movimiento}</td>
                <td>${formatearFechaPDF(m.fecha_contable)}</td>
                <td>${cliInfo}</td>
                <td style="font-weight: 500;">${m.cuenta_nombre || '--'}</td>
                <td>
                  <span class="badge ${esIngreso ? 'badge-income' : 'badge-expense'}">${m.tipo_transaccion}</span>
                </td>
                <td>
                  <div style="font-weight: 600;">${m.concepto}</div>
                  ${m.producto_nombre ? `<div style="font-size: 9px; color:#4f46e5; margin-top:2px;">[Eco] ${m.producto_nombre} (${m.cantidad_eco} unid)</div>` : ''}
                </td>
                <td class="text-right font-mono" style="font-weight:600;">${formatearNumeroPDF(m.monto)} ${m.moneda}</td>
                <td class="text-right font-mono" style="font-weight:750; color:${esIngreso ? '#065f46' : '#991b1b'};">
                  ${esIngreso ? '+' : '-'}${formatearNumeroPDF(valorEquiv)}
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>

      <!-- PIE DE REPORTE -->
      <div class="footer-note">
        Reporte oficial con tenor contable emitido desde la plataforma de gestión corporativa FENIX ADMIN.<br>
        Generado en fecha ${new Date().toLocaleString()} para uso exclusivo contable de auditoría.
      </div>
    </body>
    </html>
  `;

  // 6. Escribir mediante offscreen BrowserWindow a PDF
  const downloadsPath = app.getPath('downloads');
  const fileName = `Reporte_Contable_FNX_${Date.now()}.pdf`;
  const fullPath = path.join(downloadsPath, fileName);

  return new Promise((resolve, reject) => {
    let win = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false
      }
    });

    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));

    win.webContents.on('did-finish-load', () => {
      win.webContents.printToPDF({
        printBackground: true,
        margins: {
          marginType: 'default'
        }
      }).then(data => {
        fs.writeFileSync(fullPath, data);
        win.destroy();
        resolve(fullPath);
      }).catch(err => {
        win.destroy();
        reject(err);
      });
    });
  });
}

async function generarCatalogoPDF(productos) {
  const empresaNombre = await db.dbGet("SELECT valor_ajuste FROM opciones WHERE clave_ajuste = 'empresa_nombre'").then(r => r ? r.valor_ajuste : '-- No Configurado --');
  const empresaRuc = await db.dbGet("SELECT valor_ajuste FROM opciones WHERE clave_ajuste = 'empresa_ruc'").then(r => r ? r.valor_ajuste : '-- No Configurado --');
  const empresaEmail = await db.dbGet("SELECT valor_ajuste FROM opciones WHERE clave_ajuste = 'empresa_email'").then(r => r ? r.valor_ajuste : '-- No Configurado --');
  const empresaTelefono = await db.dbGet("SELECT valor_ajuste FROM opciones WHERE clave_ajuste = 'empresa_telefono'").then(r => r ? r.valor_ajuste : '-- No Configurado --');

  const logoBase64 = obtenerLogoBase64();

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Catálogo de Productos y Precios</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;750&family=Inter:wght@300;400;650&display=swap');
        
        body {
          font-family: 'Inter', sans-serif;
          color: #1e293b;
          margin: 0;
          padding: 20px;
          font-size: 11px;
          background-color: #ffffff;
        }

        h1, h2, h3, .font-title {
          font-family: 'Outfit', sans-serif;
        }

        .header-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 25px;
        }

        .company-name {
          font-size: 20px;
          font-weight: 750;
          color: #4f46e5;
          margin: 0 0 5px 0;
        }

        .company-details {
          color: #64748b;
          font-size: 10px;
          line-height: 1.4;
        }

        .logo-container {
          text-align: right;
          vertical-align: top;
        }

        .logo-img {
          max-height: 55px;
          max-width: 180px;
          object-fit: contain;
        }

        .divider {
          border-top: 2px solid #e2e8f0;
          margin-bottom: 20px;
        }

        .report-title-section {
          margin-bottom: 25px;
        }

        .report-title {
          font-size: 16px;
          font-weight: 600;
          margin: 0 0 5px 0;
          color: #0f172a;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .report-period {
          font-size: 11px;
          color: #64748b;
        }

        /* Table */
        .data-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 30px;
        }

        .data-table th {
          background-color: #f1f5f9;
          border-bottom: 2px solid #cbd5e1;
          color: #475569;
          font-weight: 650;
          font-size: 9px;
          text-transform: uppercase;
          padding: 10px 8px;
          text-align: left;
        }

        .data-table td {
          padding: 10px 8px;
          border-bottom: 1px solid #e2e8f0;
          color: #334155;
          vertical-align: middle;
        }

        .data-table tr:nth-child(even) {
          background-color: #f8fafc;
        }

        .text-right { text-align: right; }
        .font-mono { font-family: monospace; }
        
        .footer-note {
          margin-top: 40px;
          text-align: center;
          font-size: 9px;
          color: #94a3b8;
          border-top: 1px dashed #e2e8f0;
          padding-top: 15px;
        }
      </style>
    </head>
    <body>
      <table class="header-table">
        <tr>
          <td>
            <div class="company-name">${empresaNombre}</div>
            <div class="company-details">
              <strong>RUC / Identificación:</strong> ${empresaRuc}<br>
              <strong>Email de Ventas:</strong> ${empresaEmail}<br>
              <strong>Teléfono:</strong> ${empresaTelefono}
            </div>
          </td>
          <td class="logo-container">
            ${logoBase64 ? `<img src="${logoBase64}" class="logo-img" alt="Logo corporativo">` : `<div style="font-size:16px; font-weight:bold; color:#64748b;">${empresaNombre}</div>`}
          </td>
        </tr>
      </table>

      <div class="divider"></div>

      <div class="report-title-section">
        <div class="report-title">Catálogo Oficial de Productos</div>
        <div class="report-period">Precios y existencias actualizados al día de hoy</div>
      </div>

      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 15%">Código SKU</th>
            <th style="width: 40%">Descripción / Nombre del Producto</th>
            <th style="width: 15%" class="text-right">Stock Disponible</th>
            <th style="width: 30%">Observaciones del Artículo</th>
          </tr>
        </thead>
        <tbody>
          ${productos.map(p => `
            <tr>
              <td class="font-mono" style="font-weight: 600;">${p.sku || '--'}</td>
              <td style="font-size: 12px; font-weight: 600; color: #1e1b4b;">${p.nombre}</td>
              <td class="text-right font-mono" style="font-weight:750; color:${p.stock > 0 ? '#0f766e' : '#be123c'};">
                ${p.stock} unidades
              </td>
              <td style="color:#64748b;">${p.observaciones || '--'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="footer-note">
        Para cotizaciones personalizadas o pedidos de stock mayorista, favor contactar al correo de ventas oficial.<br>
        Documento comercial válido temporalmente. Generado en fecha ${new Date().toLocaleString()}.
      </div>
    </body>
    </html>
  `;

  const downloadsPath = app.getPath('downloads');
  const fileName = `Catalogo_Productos_FNX_${Date.now()}.pdf`;
  const fullPath = path.join(downloadsPath, fileName);

  return new Promise((resolve, reject) => {
    let win = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false
      }
    });

    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));

    win.webContents.on('did-finish-load', () => {
      win.webContents.printToPDF({
        printBackground: true,
        margins: {
          marginType: 'default'
        }
      }).then(data => {
        fs.writeFileSync(fullPath, data);
        win.destroy();
        resolve(fullPath);
      }).catch(err => {
        win.destroy();
        reject(err);
      });
    });
  });
}

function generarReporteExcel(filtros, movimientos) {
  const downloadsPath = app.getPath('downloads');
  const fileName = `Reporte_Contable_FNX_${Date.now()}.xlsx`;
  const fullPath = path.join(downloadsPath, fileName);

  let csvContent = '\uFEFF';
  csvContent += 'ID Movimiento\tFecha Contable\tCliente\tRUC Cliente\tCuenta\tTipo Transaccion\tCategoria\tMonto Original\tMoneda\tPar Cambio\tValor Tasa\tConcepto\tObservaciones\tID Producto\tProducto\tCantidad\tMonto Costo\tMoneda Costo\tCambio Costo\n';

  movimientos.forEach(m => {
    csvContent += `${m.id_movimiento}\t`;
    csvContent += `${m.fecha_contable}\t`;
    csvContent += `${m.cliente_nombre || 'N/A'}\t`;
    csvContent += `${m.cliente_documento || 'N/A'}\t`;
    csvContent += `${m.cuenta_nombre || 'N/A'}\t`;
    csvContent += `${m.tipo_transaccion}\t`;
    csvContent += `${m.tipo_categoria || 'EGRESO'}\t`;
    csvContent += `${m.monto}\t`;
    csvContent += `${m.moneda}\t`;
    csvContent += `${m.par_cambio || 'Directo'}\t`;
    csvContent += `${m.valor_cambio}\t`;
    csvContent += `${m.concepto}\t`;
    csvContent += `${m.observaciones || ''}\t`;
    csvContent += `${m.id_producto || ''}\t`;
    csvContent += `${m.producto || ''}\t`;
    csvContent += `${m.cantidad_eco || 1}\t`;
    csvContent += `${m.producto_costo_monto || ''}\t`;
    csvContent += `${m.producto_costo_moneda || ''}\t`;
    csvContent += `${m.producto_costo_cambio || ''}\n`;
  });

  fs.writeFileSync(fullPath, csvContent, 'utf-8');
  return fullPath;
}

// Helper para formato de fecha YYYY-MM-DD a DD/MM/YYYY
function formatearFechaPDF(fechaStr) {
  if (!fechaStr) return '';
  const parts = fechaStr.split('-');
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

module.exports = {
  generarReportePDF,
  generarCatalogoPDF,
  generarReporteExcel
};
