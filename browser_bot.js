// browser_bot.js - Conexão Direta com seu Google Chrome Aberto (Sem Captcha)
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const CDP_URL = 'http://127.0.0.1:9222';

/**
 * Conecta diretamente ao Google Chrome que você já está usando no Mac
 */
async function getConnectedBrowser() {
  try {
    const browser = await chromium.connectOverCDP(CDP_URL);
    const contexts = browser.contexts();
    const context = contexts[0] || await browser.newContext();
    return { browser, context, isCDP: true };
  } catch (err) {
    return null;
  }
}

/**
 * Envia uma mensagem direta de verdade para um usuário no Threads usando o seu Chrome
 */
async function sendThreadsDirectMessage(username, messageText) {
  console.log(`[BrowserBot] Conectando ao seu Google Chrome para enviar DM no Threads para @${username}...`);
  
  const connection = await getConnectedBrowser();
  if (!connection) {
    throw new Error('CHROME_NOT_CONNECTED: Seu Chrome precisa estar aberto com a porta de automação habilitada. Rode ./start_chrome.sh primeiro.');
  }

  const { browser, context } = connection;
  const page = await context.newPage();

  try {
    const profileUrl = `https://www.threads.com/@${username}`;
    console.log(`[BrowserBot] Navegando até o perfil: ${profileUrl}`);
    await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const messageBtn = await page.$('div[role="button"]:has-text("Message"), div[role="button"]:has-text("Mensagem")');
    if (messageBtn) {
      console.log('[BrowserBot] Abrindo caixa de mensagem...');
      await messageBtn.click();
      await page.waitForTimeout(2500);

      const inputSelector = 'div[contenteditable="true"][role="textbox"], textarea';
      await page.waitForSelector(inputSelector, { timeout: 10000 });
      await page.fill(inputSelector, messageText);
      await page.waitForTimeout(1000);
      await page.keyboard.press('Enter');
      console.log(`[BrowserBot] ✓ Mensagem enviada com sucesso no Threads para @${username}!`);
      await page.waitForTimeout(2000);
      await page.close();
      return { success: true, platform: 'threads' };
    } else {
      console.log(`[BrowserBot] Perfil @${username} não tem botão de DM direto visível.`);
      await page.close();
      return { success: false, reason: 'no_dm_button' };
    }
  } catch (err) {
    console.error(`[BrowserBot] Erro ao enviar DM no Threads: ${err.message}`);
    await page.close();
    return { success: false, error: err.message };
  }
}

/**
 * Envia uma mensagem direta de verdade no Instagram usando o seu Chrome
 */
async function sendInstagramDirectMessage(username, messageText) {
  console.log(`[BrowserBot] Conectando ao seu Google Chrome para enviar DM no Instagram para @${username}...`);
  
  const connection = await getConnectedBrowser();
  if (!connection) {
    throw new Error('CHROME_NOT_CONNECTED: Seu Chrome precisa estar aberto com a porta de automação habilitada. Rode ./start_chrome.sh primeiro.');
  }

  const { browser, context } = connection;
  const page = await context.newPage();

  try {
    const profileUrl = `https://www.instagram.com/${username}/`;
    console.log(`[BrowserBot] Navegando até o perfil: ${profileUrl}`);
    await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const messageBtn = await page.$('div[role="button"]:has-text("Enviar mensagem"), div[role="button"]:has-text("Message")');
    if (messageBtn) {
      console.log('[BrowserBot] Abrindo chat de mensagem direta...');
      await messageBtn.click();
      await page.waitForTimeout(3500);

      const inputSelector = 'div[contenteditable="true"][role="textbox"], textarea';
      await page.waitForSelector(inputSelector, { timeout: 10000 });
      await page.fill(inputSelector, messageText);
      await page.waitForTimeout(1000);
      await page.keyboard.press('Enter');
      console.log(`[BrowserBot] ✓ Mensagem enviada com sucesso no Instagram para @${username}!`);
      await page.waitForTimeout(2000);
      await page.close();
      return { success: true, platform: 'instagram' };
    } else {
      console.log(`[BrowserBot] Botão de mensagem não encontrado no perfil @${username}`);
      await page.close();
      return { success: false, reason: 'no_message_button' };
    }
  } catch (err) {
    console.error(`[BrowserBot] Erro ao enviar DM no Instagram: ${err.message}`);
    await page.close();
    return { success: false, error: err.message };
  }
}

async function testConnection() {
  const conn = await getConnectedBrowser();
  if (conn) {
    console.log('\n==========================================================');
    console.log('✓ CONECTADO COM SUCESSO ao seu Google Chrome!');
    console.log('O robô já tem acesso às suas contas do Threads, Instagram e Gmail.');
    console.log('Zero CAPTCHA, 100% como se você mesmo estivesse usando.');
    console.log('==========================================================\n');
    await conn.browser.disconnect();
    return true;
  } else {
    console.log('\n==========================================================');
    console.log('❌ Chrome ainda não está com a porta de conexão aberta.');
    console.log('Para conectar o seu navegador atual sem pedir login nem captcha:');
    console.log('1. Feche o Chrome (Cmd + Q)');
    console.log('2. Execute no terminal: ./start_chrome.sh');
    console.log('==========================================================\n');
    return false;
  }
}

module.exports = {
  getConnectedBrowser,
  sendThreadsDirectMessage,
  sendInstagramDirectMessage,
  testConnection
};

if (require.main === module) {
  testConnection();
}
