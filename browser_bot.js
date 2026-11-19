// browser_bot.js - Motor de Envio Real via Navegador (Threads / Instagram)
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const PROFILE_DIR = path.join(__dirname, 'data', 'browser_profile');

if (!fs.existsSync(PROFILE_DIR)) {
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
}

/**
 * Abre o navegador visível para o usuário fazer login no Threads e Instagram (apenas 1 vez)
 */
async function launchLoginSession() {
  console.log('\n==========================================================');
  console.log('🔑 MODO DE LOGIN DO ROBÔ DE NAVEGADOR');
  console.log('==========================================================');
  console.log('O Google Chrome vai abrir na sua tela agora.');
  console.log('1. Faça login na sua conta do Threads (threads.net)');
  console.log('2. Faça login na sua conta do Instagram (instagram.com)');
  console.log('3. Após estar logado, volte aqui e pressione ENTER no terminal para salvar.');
  console.log('==========================================================\n');

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'chrome',
    headless: false,
    viewport: { width: 1280, height: 800 }
  });

  const page = context.pages()[0] || await context.newPage();
  await page.goto('https://www.threads.com/login');

  await new Promise(resolve => {
    process.stdin.once('data', () => {
      resolve();
    });
  });

  console.log('✓ Sessão e cookies salvos com sucesso em data/browser_profile!');
  await context.close();
  process.exit(0);
}

/**
 * Envia uma mensagem direta de verdade para um usuário no Threads
 */
async function sendThreadsDirectMessage(username, messageText, options = { headless: false }) {
  console.log(`[BrowserBot] Iniciando envio de DM no Threads para @${username}...`);
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'chrome',
    headless: options.headless,
    viewport: { width: 1280, height: 800 }
  });

  const page = context.pages()[0] || await context.newPage();

  try {
    const profileUrl = `https://www.threads.com/@${username}`;
    await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Procura botão de mensagem ou menção
    // No Threads web, botões comuns: "Message" ou SVG de aviãozinho/chat
    const messageBtn = await page.$('div[role="button"]:has-text("Message"), div[role="button"]:has-text("Mensagem")');
    if (messageBtn) {
      await messageBtn.click();
      await page.waitForTimeout(2500);

      const inputSelector = 'div[contenteditable="true"][role="textbox"], textarea';
      await page.waitForSelector(inputSelector, { timeout: 10000 });
      await page.fill(inputSelector, messageText);
      await page.waitForTimeout(1000);
      await page.keyboard.press('Enter');
      console.log(`[BrowserBot] ✓ Mensagem enviada com sucesso no Threads para @${username}!`);
      await page.waitForTimeout(2000);
      await context.close();
      return { success: true, platform: 'threads' };
    } else {
      console.log(`[BrowserBot] Perfil @${username} não tem botão de DM direto visível.`);
      await context.close();
      return { success: false, reason: 'no_dm_button' };
    }
  } catch (err) {
    console.error(`[BrowserBot] Erro ao enviar DM no Threads: ${err.message}`);
    await context.close();
    return { success: false, error: err.message };
  }
}

/**
 * Envia uma mensagem direta de verdade no Instagram
 */
async function sendInstagramDirectMessage(username, messageText, options = { headless: false }) {
  console.log(`[BrowserBot] Iniciando envio de DM no Instagram para @${username}...`);
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'chrome',
    headless: options.headless,
    viewport: { width: 1280, height: 800 }
  });

  const page = context.pages()[0] || await context.newPage();

  try {
    const profileUrl = `https://www.instagram.com/${username}/`;
    await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Botão de Enviar Mensagem no perfil do Instagram
    const messageBtn = await page.$('div[role="button"]:has-text("Enviar mensagem"), div[role="button"]:has-text("Message")');
    if (messageBtn) {
      await messageBtn.click();
      await page.waitForTimeout(3500);

      const inputSelector = 'div[contenteditable="true"][role="textbox"], textarea';
      await page.waitForSelector(inputSelector, { timeout: 10000 });
      await page.fill(inputSelector, messageText);
      await page.waitForTimeout(1000);
      await page.keyboard.press('Enter');
      console.log(`[BrowserBot] ✓ Mensagem enviada com sucesso no Instagram para @${username}!`);
      await page.waitForTimeout(2000);
      await context.close();
      return { success: true, platform: 'instagram' };
    } else {
      console.log(`[BrowserBot] Botão de mensagem não encontrado no perfil @${username}`);
      await context.close();
      return { success: false, reason: 'no_message_button' };
    }
  } catch (err) {
    console.error(`[BrowserBot] Erro ao enviar DM no Instagram: ${err.message}`);
    await context.close();
    return { success: false, error: err.message };
  }
}

module.exports = {
  launchLoginSession,
  sendThreadsDirectMessage,
  sendInstagramDirectMessage
};

if (require.main === module) {
  const cmd = process.argv[2];
  if (cmd === 'login') {
    launchLoginSession();
  } else {
    console.log('Uso: node browser_bot.js login');
  }
}
