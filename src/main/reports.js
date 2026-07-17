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
    if (m.status_operacion === 'PENDIENTE') return;
    
    let valorUSDT = m.monto;
    if (m.moneda !== monedaPrincipal) {
      if (m.moneda === 'PYG' || m.moneda === 'ARS') {
        valorUSDT = m.monto / m.valor_cambio;
      } else {
        valorUSDT = m.monto * m.valor_cambio;
      }
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
            const esPendiente = m.status_operacion === 'PENDIENTE';
            let valorEquiv = m.monto;
            if (m.moneda !== monedaPrincipal) {
              if (m.moneda === 'PYG' || m.moneda === 'ARS') {
                valorEquiv = m.monto / m.valor_cambio;
              } else {
                valorEquiv = m.monto * m.valor_cambio;
              }
            }

            const docCliente = m.cliente_documento ? `(RUC: ${m.cliente_documento})` : '(N/A)';
            const cliInfo = m.cliente_nombre ? `${m.cliente_nombre} <br><span style="font-size:9px; color:#64748b;">${docCliente}</span>` : 'Fondo Corporativo / Socios';

            return `
              <tr style="${esPendiente ? 'background-color:#fff5f5;' : ''}">
                <td class="font-mono" style="font-weight: 600;">#${m.id_movimiento}</td>
                <td>${formatearFechaPDF(m.fecha_contable)}</td>
                <td>${cliInfo}</td>
                <td style="font-weight: 500;">${m.cuenta_nombre || '--'}</td>
                <td>
                  ${esPendiente ? '<span class="badge" style="background:#fee2e2; color:#991b1b; font-size:8px; border:1px solid #fca5a5; margin-right:3px;">PENDIENTE</span>' : ''}<span class="badge ${esIngreso ? 'badge-income' : 'badge-expense'}">${m.tipo_transaccion}</span>
                </td>
                <td>
                  <div style="font-weight: 600;">${m.concepto} ${m.subcategoria_ocasional ? `<span style="font-size:8px; background:#e0e7ff; color:#4338ca; padding:1px 3px; border-radius:3px; font-weight:bold;">${m.subcategoria_ocasional}</span>` : ''}</div>
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

function obtenerProductoImagenBase64(imagenNombre) {
  if (!imagenNombre) return null;
  const productsDir = path.join(__dirname, '../../assets/img/products');
  const fullPath = path.join(productsDir, imagenNombre);
  if (fs.existsSync(fullPath)) {
    try {
      const ext = path.extname(imagenNombre).toLowerCase().replace('.', '');
      const data = fs.readFileSync(fullPath).toString('base64');
      const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
      return `data:${mimeType};base64,${data}`;
    } catch (err) {
      console.error('Error al leer imagen del producto:', err);
    }
  }
  return null;
}

async function generarCatalogoPDF(productos, tipo = 'comercial') {
  const empresaNombre = await db.dbGet("SELECT valor_ajuste FROM opciones WHERE clave_ajuste = 'empresa_nombre'").then(r => r ? r.valor_ajuste : '-- No Configurado --');
  const empresaRuc = await db.dbGet("SELECT valor_ajuste FROM opciones WHERE clave_ajuste = 'empresa_ruc'").then(r => r ? r.valor_ajuste : '-- No Configurado --');
  const empresaEmail = await db.dbGet("SELECT valor_ajuste FROM opciones WHERE clave_ajuste = 'empresa_email'").then(r => r ? r.valor_ajuste : '-- No Configurado --');
  const empresaTelefono = await db.dbGet("SELECT valor_ajuste FROM opciones WHERE clave_ajuste = 'empresa_telefono'").then(r => r ? r.valor_ajuste : '-- No Configurado --');

  const logoBase64 = obtenerLogoBase64();

  let layoutHtml = '';

  if (tipo === 'comercial') {
    layoutHtml += `<div class="grid-container-comercial">`;
    productos.forEach(p => {
      const imgData = obtenerProductoImagenBase64(p.imagen);
      const isOffer = p.es_oferta === 1;
      const imgHtml = imgData 
        ? `<img src="${imgData}" class="product-img" alt="${p.nombre}">`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" class="product-img-fallback"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>`;
      
      layoutHtml += `
        <div class="product-card-comercial ${isOffer ? 'offer-highlight' : ''}">
          ${isOffer ? '<span class="offer-badge">Oferta</span>' : ''}
          <div class="product-img-container">
            ${imgHtml}
          </div>
          <div style="flex-grow: 1; display: flex; flex-direction: column;">
            <h4 class="product-name">${p.nombre}</h4>
            <div class="product-sku">SKU: ${p.sku || 'N/A'}</div>
            <div class="product-stock ${p.stock > 0 ? 'text-green' : 'text-red'}">${p.stock > 0 ? `Stock: ${p.stock} unid` : 'Agotado'}</div>
          </div>
          <div class="product-price">
            ${formatearNumeroPDF(p.precio_venta)} <span style="font-size: 9px; color:#64748b; font-weight: normal;">USDT</span>
          </div>
        </div>
      `;
    });
    layoutHtml += `</div>`;
  } else if (tipo === 'intermedio') {
    layoutHtml += `<div class="grid-container-intermedio">`;
    productos.forEach(p => {
      const imgData = obtenerProductoImagenBase64(p.imagen);
      const isOffer = p.es_oferta === 1;
      const imgHtml = imgData 
        ? `<img src="${imgData}" class="product-img-sm" alt="${p.nombre}">`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" class="product-img-fallback-sm"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>`;
      
      layoutHtml += `
        <div class="product-card-intermedio ${isOffer ? 'offer-highlight-sm' : ''}">
          ${isOffer ? '<span class="offer-badge-sm">%</span>' : ''}
          <div class="product-img-container-sm">
            ${imgHtml}
          </div>
          <div class="product-name-sm" title="${p.nombre}">${p.nombre}</div>
          <div class="product-price-sm">
            ${formatearNumeroPDF(p.precio_venta)} <span style="font-size: 8px; font-weight:normal; color:#64748b;">USDT</span>
          </div>
        </div>
      `;
    });
    layoutHtml += `</div>`;
  } else {
    // Simple
    layoutHtml += `<table class="list-container">`;
    productos.forEach(p => {
      const isOffer = p.es_oferta === 1;
      layoutHtml += `
        <tr class="list-row ${isOffer ? 'list-offer' : ''}">
          <td class="list-cell-name">
            <strong>${p.nombre}</strong>
            ${p.sku ? `<span class="list-cell-sku">SKU: ${p.sku}</span>` : ''}
            ${isOffer ? `<span class="list-offer-badge">OFERTA</span>` : ''}
          </td>
          <td class="list-cell-price">
            ${formatearNumeroPDF(p.precio_venta)} USDT
          </td>
        </tr>
      `;
    });
    layoutHtml += `</table>`;
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Catálogo de Productos y Precios</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;750&family=Inter:wght@300;400;600;700&display=swap');
        
        body {
          font-family: 'Inter', sans-serif;
          color: #1e293b;
          margin: 0;
          padding: 20px;
          font-size: 11px;
          background-color: #ffffff;
        }

        h1, h2, h3, h4, .font-title {
          font-family: 'Outfit', sans-serif;
        }

        /* Hero Header */
        .hero-header {
          background: linear-gradient(135deg, #1e1b4b 0%, #311042 100%);
          color: #ffffff;
          padding: 25px;
          border-radius: 16px;
          margin-bottom: 25px;
          position: relative;
        }

        .hero-title {
          font-size: 24px;
          font-weight: 750;
          margin: 0;
          letter-spacing: -0.5px;
        }

        .hero-subtitle {
          font-size: 11px;
          color: #a5b4fc;
          margin-top: 4px;
        }

        .hero-meta {
          margin-top: 15px;
          font-size: 9px;
          color: #c7d2fe;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          padding-top: 10px;
          display: flex;
          justify-content: space-between;
        }

        .logo-img {
          max-height: 45px;
          max-width: 150px;
          object-fit: contain;
          filter: brightness(0) invert(1);
        }

        /* Commercial Grid (3 cols) */
        .grid-container-comercial {
          display: flex;
          flex-wrap: wrap;
          margin: -10px;
        }

        .product-card-comercial {
          flex: 0 0 calc(33.333% - 20px);
          margin: 10px;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 12px;
          background: #ffffff;
          position: relative;
          display: flex;
          flex-direction: column;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
          page-break-inside: avoid;
        }

        .product-img-container {
          height: 90px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f8fafc;
          border-radius: 8px;
          margin-bottom: 8px;
          overflow: hidden;
        }

        .product-img {
          max-height: 100%;
          max-width: 100%;
          object-fit: contain;
        }

        .product-img-fallback {
          height: 45px;
          width: 45px;
          opacity: 0.5;
        }

        .product-name {
          font-size: 12px;
          font-weight: 600;
          color: #0f172a;
          margin: 0 0 3px 0;
          height: 32px;
          overflow: hidden;
          line-height: 1.3;
        }

        .product-sku {
          font-size: 8px;
          color: #64748b;
          font-family: monospace;
          margin-bottom: 4px;
        }

        .product-stock {
          font-size: 8px;
          font-weight: 600;
        }
        .text-green { color: #10b981; }
        .text-red { color: #ef4444; }

        .product-price {
          font-size: 15px;
          font-weight: 750;
          color: #4f46e5;
          margin-top: 8px;
          border-top: 1px dashed #e2e8f0;
          padding-top: 6px;
        }

        .offer-badge {
          position: absolute;
          top: 6px;
          right: 6px;
          background: #ef4444;
          color: #ffffff;
          font-size: 7px;
          font-weight: bold;
          padding: 2px 5px;
          border-radius: 4px;
          text-transform: uppercase;
        }

        .offer-highlight {
          border: 1.5px solid #fca5a5 !important;
          background-color: #fff5f5 !important;
        }

        /* Intermediate Grid (6 cols) */
        .grid-container-intermedio {
          display: flex;
          flex-wrap: wrap;
          margin: -6px;
        }

        .product-card-intermedio {
          flex: 0 0 calc(16.666% - 12px);
          margin: 6px;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 8px;
          background: #ffffff;
          position: relative;
          display: flex;
          flex-direction: column;
          text-align: center;
          box-shadow: 0 1px 2px rgba(0,0,0,0.03);
          page-break-inside: avoid;
        }

        .product-img-container-sm {
          height: 50px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f8fafc;
          border-radius: 6px;
          margin-bottom: 6px;
          overflow: hidden;
        }

        .product-img-sm {
          max-height: 100%;
          max-width: 100%;
          object-fit: contain;
        }

        .product-img-fallback-sm {
          height: 25px;
          width: 25px;
          opacity: 0.5;
        }

        .product-name-sm {
          font-size: 9px;
          font-weight: 600;
          color: #0f172a;
          height: 24px;
          overflow: hidden;
          line-height: 1.2;
          margin-bottom: 4px;
        }

        .product-price-sm {
          font-size: 11px;
          font-weight: 750;
          color: #4f46e5;
          margin-top: auto;
        }

        .offer-badge-sm {
          position: absolute;
          top: 4px;
          right: 4px;
          background: #ef4444;
          color: #ffffff;
          font-size: 7px;
          font-weight: bold;
          height: 12px;
          width: 12px;
          border-radius: 50%;
          line-height: 12px;
          text-align: center;
        }

        .offer-highlight-sm {
          border: 1px solid #fca5a5 !important;
          background-color: #fff5f5 !important;
        }

        /* Simple List Layout */
        .list-container {
          width: 100%;
          border-collapse: collapse;
        }

        .list-row {
          border-bottom: 1px solid #e2e8f0;
        }

        .list-row:nth-child(even) {
          background-color: #f8fafc;
        }

        .list-cell-name {
          padding: 8px 10px;
          font-size: 11px;
          font-weight: 600;
          color: #0f172a;
        }

        .list-cell-sku {
          font-size: 8px;
          color: #64748b;
          font-family: monospace;
          margin-left: 8px;
        }

        .list-cell-price {
          padding: 8px 10px;
          font-size: 12px;
          font-weight: 750;
          color: #4f46e5;
          text-align: right;
        }

        .list-offer {
          background-color: #fff5f5 !important;
        }

        .list-offer-badge {
          background: #ef4444;
          color: #ffffff;
          font-size: 7px;
          font-weight: bold;
          padding: 1px 4px;
          border-radius: 3px;
          margin-left: 5px;
          vertical-align: middle;
        }

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
      <div class="hero-header">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td>
              <h1 class="hero-title">${empresaNombre}</h1>
              <div class="hero-subtitle">Catálogo Oficial de Productos y Ofertas Activas</div>
            </td>
            <td style="text-align: right;">
              ${logoBase64 ? `<img src="${logoBase64}" class="logo-img" alt="Logo">` : ''}
            </td>
          </tr>
        </table>
        <div class="hero-meta">
          <div><strong>RUC:</strong> ${empresaRuc} | <strong>Email:</strong> ${empresaEmail} | <strong>Tel:</strong> ${empresaTelefono}</div>
          <div>Precios válidos por 24 horas</div>
        </div>
      </div>

      ${layoutHtml}

      <div class="footer-note">
        Para realizar pedidos corporativos, por favor contactar al sector de administración.<br>
        Documento comercial digital generado automáticamente desde FENIX ADMIN en fecha ${new Date().toLocaleString()}.
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
  csvContent += 'ID Movimiento\tFecha Contable\tCliente\tRUC Cliente\tCuenta\tTipo Transaccion\tCategoria\tMonto Original\tMoneda\tPar Cambio\tValor Tasa\tConcepto\tObservaciones\tID Producto\tProducto\tCantidad\tMonto Costo\tMoneda Costo\tCambio Costo\tEstado Operacion\tSubcategoria Ocasional\n';

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
    csvContent += `${m.producto_costo_cambio || ''}\t`;
    csvContent += `${m.status_operacion || 'LIQUIDADO'}\t`;
    csvContent += `${m.subcategoria_ocasional || ''}\n`;
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
