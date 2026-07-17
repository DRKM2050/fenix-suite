const fs = require('fs');
const path = require('path');
const https = require('https');
const { GoogleGenAI } = require('@google/genai');
const db = require('./db');


// Helper para obtener el cliente de Gemini cargado de forma dinámica
async function getAIClient() {
  const aiEnabledRow = await db.dbGet("SELECT valor_ajuste FROM opciones WHERE clave_ajuste = 'ai_enabled'");
  const enabled = aiEnabledRow ? parseInt(aiEnabledRow.valor_ajuste) === 1 : false;
  if (!enabled) {
    throw new Error('El motor de Inteligencia Artificial está deshabilitado en Ajustes de Sistema.');
  }

  const apiKeyRow = await db.dbGet("SELECT valor_ajuste FROM opciones WHERE clave_ajuste = 'ai_api_key'");
  const apiKey = apiKeyRow ? apiKeyRow.valor_ajuste : '';

  if (!apiKey || apiKey.trim() === '') {
    throw new Error('API Key de Google AI Studio no configurada. Por favor, regístrela en los ajustes.');
  }

  return new GoogleGenAI({ apiKey });
}

// Helper para obtener el Prompt del Sistema personalizado por el usuario
async function getSystemPrompt(key, tipoDefault) {
  const promptRow = await db.dbGet("SELECT valor_ajuste FROM opciones WHERE clave_ajuste = ?", [key]);
  return promptRow && promptRow.valor_ajuste ? promptRow.valor_ajuste : tipoDefault;
}

// Determinar el MIME type correcto
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.pdf': return 'application/pdf';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
    default: return 'application/octet-stream';
  }
}

/**
 * Procesa un Catálogo (Imagen o PDF) y extrae productos y precios usando Structured Outputs.
 */
async function procesarCatalogo(filePath) {
  const ai = await getAIClient();
  const mimeType = getMimeType(filePath);
  const fileBuffer = fs.readFileSync(filePath);
  const base64Data = fileBuffer.toString('base64');

  const defaultPrompt = 'Analiza el siguiente catálogo comercial (imagen o documento PDF) y extrae una lista estructurada con los nombres de todos los productos legibles y sus respectivos precios. Si hay varios precios, prefiere el precio mayorista o de venta directa.';
  const systemPrompt = await getSystemPrompt('ai_prompt_catalogos', defaultPrompt);

  const response = await ai.models.generateContent({
    model: 'gemini-1.5-flash',
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: base64Data } },
          { text: 'Extrae la información estructurada de este documento según el esquema requerido.' }
        ]
      }
    ],
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          productos: {
            type: 'ARRAY',
            description: 'Lista de productos encontrados en el catálogo',
            items: {
              type: 'OBJECT',
              properties: {
                producto: { type: 'STRING', description: 'Nombre descriptivo del producto' },
                precio: { type: 'NUMBER', description: 'Precio unitario numérico del producto' }
              },
              required: ['producto', 'precio']
            }
          }
        },
        required: ['productos']
      }
    }
  });

  const text = response.text;
  try {
    return JSON.parse(text);
  } catch (err) {
    console.error('Error al parsear respuesta JSON de catálogo:', text);
    throw new Error('La IA devolvió un formato no válido: ' + err.message);
  }
}

/**
 * Procesa un Comprobante de pago (Imagen) y extrae detalles de la transacción.
 */
async function procesarComprobante(filePath) {
  const ai = await getAIClient();
  const mimeType = getMimeType(filePath);
  if (mimeType.startsWith('application/')) {
    throw new Error('Para comprobantes de pago, por favor cargue un archivo de imagen (PNG, JPG o WEBP).');
  }

  const fileBuffer = fs.readFileSync(filePath);
  const base64Data = fileBuffer.toString('base64');

  const defaultPrompt = 'Extrae la información financiera clave de esta captura de pantalla o fotografía de comprobante de transferencia bancaria o pago.';
  const systemPrompt = await getSystemPrompt('ai_prompt_comprobantes', defaultPrompt);

  const response = await ai.models.generateContent({
    model: 'gemini-1.5-flash',
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: base64Data } },
          { text: 'Extrae los campos del comprobante financiero según el esquema.' }
        ]
      }
    ],
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          monto: { type: 'NUMBER', description: 'Monto total de la transacción' },
          fecha: { type: 'STRING', description: 'Fecha de la transacción en formato YYYY-MM-DD (si solo hay DD/MM, deducir año actual)' },
          banco_origen: { type: 'STRING', description: 'Nombre del banco o entidad de origen' },
          banco_destino: { type: 'STRING', description: 'Nombre del banco o entidad de destino' },
          concepto: { type: 'STRING', description: 'Concepto o referencia breve del pago' }
        },
        required: ['monto', 'fecha', 'banco_origen', 'banco_destino', 'concepto']
      }
    }
  });

  const text = response.text;
  try {
    return JSON.parse(text);
  } catch (err) {
    console.error('Error al parsear respuesta JSON de comprobante:', text);
    throw new Error('La IA devolvió un formato de comprobante no válido: ' + err.message);
  }
}

/**
 * Busca imágenes del producto utilizando Google Search Grounding.
 * Retorna exactamente 3 URLs.
 */
async function buscarImagenesGrounding(nombreProducto) {
  const ai = await getAIClient();

  const defaultPrompt = 'Search Google for the product "{producto}". Find exactly 3 direct URLs of high-quality square (1:1 aspect ratio) images of this product, preferably with clean studio backgrounds. Return strictly a JSON object matching the schema.';
  const systemPromptTemplate = await getSystemPrompt('ai_prompt_grounding', defaultPrompt);
  const prompt = systemPromptTemplate.replace('{producto}', nombreProducto);

  const response = await ai.models.generateContent({
    model: 'gemini-1.5-flash',
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          urls: {
            type: 'ARRAY',
            description: '3 direct image URLs of the product',
            items: { type: 'STRING' }
          }
        },
        required: ['urls']
      }
    }
  });

  const text = response.text;
  try {
    return JSON.parse(text);
  } catch (err) {
    console.error('Error al parsear respuesta JSON de grounding:', text);
    throw new Error('La búsqueda inteligente no devolvió URLs válidas: ' + err.message);
  }
}

/**
 * Descarga una imagen remota y la almacena localmente en assets/img/products/
 */
async function descargarImagenLocal(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`No se pudo descargar la imagen. Estado HTTP: ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());

  // Validar extensión
  let ext = '.png'; // por defecto
  const parsedUrl = new URL(url);
  const pathname = parsedUrl.pathname.toLowerCase();
  if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) ext = '.jpeg';
  else if (pathname.endsWith('.webp')) ext = '.webp';

  const fileName = `grounded_${Date.now()}_${Math.random().toString(36).substring(2, 7)}${ext}`;
  const destDir = path.join(__dirname, '../../assets/img/products');
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const fullPath = path.join(destDir, fileName);
  fs.writeFileSync(fullPath, buffer);
  return fileName;
}

module.exports = {
  procesarCatalogo,
  procesarComprobante,
  buscarImagenesGrounding,
  descargarImagenLocal
};
