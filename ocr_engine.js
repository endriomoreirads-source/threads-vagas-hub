const { createWorker } = require('tesseract.js');

let worker = null;
let isInitializing = false;

async function getWorker() {
  if (worker) return worker;
  if (isInitializing) {
    while (isInitializing) {
      await new Promise(r => setTimeout(r, 200));
    }
    return worker;
  }
  isInitializing = true;
  try {
    worker = await createWorker('por+eng');
  } catch (err) {
    console.error('Falha ao inicializar Tesseract OCR Worker:', err.message);
  } finally {
    isInitializing = false;
  }
  return worker;
}

// Regex para detectar se o texto lido no flyer é de vaga/contratação de designer ou tech
const FLYER_HIRING_REGEX = /\b(contrata|contrata-se|contratando|estamos\s+contratando|vaga|vagas|procuro|procura-se|procurando|designer|design\s+gr[aá]fico|motion|social\s+media|diretor\s+de\s+arte|freela|est[aá]gio|oportunidade|envie\s+seu\s+curr[ií]culo|envie\s+seu\s+portf[oó]lio|fa[çc]a\s+parte|ai\s+engineer|intelig[eê]ncia\s+artificial|desenvolvedor)\b/i;

async function extractTextFromImageUrl(imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string') return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15'
      },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) return null;

    const arrayBuffer = await res.arrayBuffer();
    const buf = Buffer.from(arrayBuffer);
    if (buf.length < 3000) return null;

    const w = await getWorker();
    if (!w) return null;

    const ret = await w.recognize(buf);
    const rawText = (ret?.data?.text || '').trim();
    const cleanText = rawText.replace(/\n{3,}/g, '\n\n').trim();
    return cleanText.length > 5 ? cleanText : null;
  } catch (err) {
    return null;
  }
}

module.exports = {
  extractTextFromImageUrl,
  FLYER_HIRING_REGEX
};
