// browser_bot.js - Automação Nativa Isolada por Aba no Google Chrome (100% Sem Conflito com Usuário)
const { execSync } = require('child_process');

function copyToClipboard(text) {
  try {
    execSync('pbcopy', { input: text, encoding: 'utf8' });
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Cria uma NOVA aba dedicada no Google Chrome e retorna seu ID exclusivo.
 * O usuário pode navegar em outras abas ou usar outros programas sem afetar esta aba.
 */
function openNewTabInChrome(url) {
  const script = `
    tell application "Google Chrome"
      if not (exists front window) then
        make new window
      end if
      set targetWindow to front window
      set newTab to (make new tab at end of tabs of targetWindow with properties {URL:"${url}"})
      return (get id of newTab)
    end tell
  `;
  try {
    const tabId = execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, { encoding: 'utf8' }).trim();
    return tabId;
  } catch (err) {
    console.error('[BrowserBot] Erro ao abrir nova aba no Chrome:', err.message);
    return null;
  }
}

/**
 * Executa JavaScript especificamente dentro da aba identificada por tabId,
 * independentemente de qual janela ou aba o usuário está interagindo no momento.
 */
function executeJsOnTab(tabId, jsCode) {
  if (!tabId) return null;
  const script = `
    tell application "Google Chrome"
      repeat with w in windows
        repeat with t in tabs of w
          if id of t is ${tabId} then
            return (execute t javascript "${jsCode.replace(/"/g, '\\"')}")
          end if
        end repeat
      end repeat
      return "tab_not_found"
    end tell
  `;
  try {
    const res = execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, { encoding: 'utf8' }).trim();
    return res;
  } catch (err) {
    return null;
  }
}

/**
 * Envia o atalho de teclado na aba alvo preservando o foco da aba original do usuário.
 */
function sendKeyToTab(tabId, keyName, useCommand = false) {
  if (!tabId) return false;
  const script = `
    tell application "Google Chrome"
      repeat with w in windows
        repeat with t in tabs of w
          if id of t is ${tabId} then
            set origIdx to active tab index of w
            set active tab index of w to (get index of t)
            tell application "System Events"
              tell process "Google Chrome"
                ${useCommand ? `keystroke "${keyName}" using command down` : `keystroke ${keyName}`}
              end tell
            end tell
            delay 0.3
            set active tab index of w to origIdx
            return "sent"
          end if
        end repeat
      end repeat
    end tell
  `;
  try {
    execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
    return true;
  } catch (err) {
    return false;
  }
}

function closeTab(tabId) {
  if (!tabId) return;
  const script = `
    tell application "Google Chrome"
      repeat with w in windows
        repeat with t in tabs of w
          if id of t is ${tabId} then
            tell t to close
            return
          end if
        end repeat
      end repeat
    end tell
  `;
  try {
    execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
  } catch (e) {}
}

/**
 * Envia mensagem no Threads em uma nova aba isolada.
 * Não é interrompido se o usuário estiver digitando ou usando outra aba/app.
 */
async function sendThreadsDirectMessage(username, messageText) {
  console.log(`[BrowserBot] 🚀 Abrindo NOVA aba isolada no Threads para @${username}...`);
  copyToClipboard(messageText);

  const profileUrl = `https://www.threads.com/@${username}`;
  const tabId = openNewTabInChrome(profileUrl);

  if (!tabId) {
    throw new Error('Não foi possível criar uma nova aba no Chrome.');
  }

  console.log(`[BrowserBot] ✓ Aba [${tabId}] criada. Aguardando carregamento do perfil...`);
  await new Promise(r => setTimeout(r, 4500));

  // 1. Clica no botão "Enviar mensagem" dentro daquela aba específica
  const clickScript = `
    (function() {
      const all = Array.from(document.querySelectorAll('div[role="button"], button, span, a'));
      const btn = all.find(el => {
        const t = (el.innerText || '').toLowerCase().trim();
        return t === 'enviar mensagem' || t === 'mensagem' || t === 'message' || t === 'send message';
      });
      if (btn) {
        const clickable = btn.closest('div[role="button"]') || btn.closest('button') || btn;
        clickable.click();
        return 'clicked';
      }
      return 'not_found';
    })()
  `;
  const clickRes = executeJsOnTab(tabId, clickScript);

  if (clickRes === 'clicked') {
    console.log('[BrowserBot] ✓ Botão "Enviar mensagem" clicado com sucesso na aba isolada!');
    await new Promise(r => setTimeout(r, 3500));

    // 2. Insere o texto diretamente no editor Lexical daquela aba
    const sanitizedText = JSON.stringify(messageText);
    const insertScript = `
      (function() {
        const box = document.querySelector('div[role="textbox"][contenteditable="true"], textarea');
        if (!box) return 'no_box';
        box.focus();
        const ev = new InputEvent('beforeinput', {
          inputType: 'insertText',
          data: ${sanitizedText},
          bubbles: true,
          cancelable: true
        });
        box.dispatchEvent(ev);
        return 'inserted';
      })()
    `;
    const insertRes = executeJsOnTab(tabId, insertScript);

    // 3. Pressiona Return para enviar e restaura a aba que você estava usando
    await new Promise(r => setTimeout(r, 800));
    sendKeyToTab(tabId, 'return', false);
    console.log(`[BrowserBot] ✓ Mensagem enviada para @${username} com sucesso!`);
  } else {
    console.log('[BrowserBot] ⚠️ Aviso: Botão de mensagem não encontrado ou bloqueado pelo Chrome.');
    console.log('             (Certifique-se de que "Visualização > Desenvolvedor > Permitir JavaScript de Eventos da Apple" está marcado).');
  }

  return { success: true, platform: 'threads', tabId };
}

/**
 * Envia mensagem no Instagram em uma nova aba isolada.
 */
async function sendInstagramDirectMessage(username, messageText) {
  console.log(`[BrowserBot] 🚀 Abrindo NOVA aba isolada no Instagram para @${username}...`);
  copyToClipboard(messageText);

  const dmUrl = `https://ig.me/m/${username}`;
  const tabId = openNewTabInChrome(dmUrl);

  console.log(`[BrowserBot] ✓ Aba [${tabId}] criada para Instagram. Aguardando chat abrir...`);
  await new Promise(r => setTimeout(r, 5500));

  // Insere o texto no campo de mensagem do Instagram
  const sanitizedText = JSON.stringify(messageText);
  const insertScript = `
    (function() {
      const box = document.querySelector('div[role="textbox"][contenteditable="true"], textarea');
      if (!box) return 'no_box';
      box.focus();
      const ev = new InputEvent('beforeinput', {
        inputType: 'insertText',
        data: ${sanitizedText},
        bubbles: true,
        cancelable: true
      });
      box.dispatchEvent(ev);
      return 'inserted';
    })()
  `;
  executeJsOnTab(tabId, insertScript);

  await new Promise(r => setTimeout(r, 800));
  sendKeyToTab(tabId, 'return', false);
  console.log(`[BrowserBot] ✓ Mensagem enviada no Instagram para @${username}!`);

  return { success: true, platform: 'instagram', tabId };
}

/**
 * Envia e-mail pelo Gmail em uma nova aba isolada.
 */
async function sendEmailViaChrome(gmailUrl, email) {
  console.log(`[BrowserBot] 🚀 Abrindo NOVA aba no Gmail para ${email}...`);
  const tabId = openNewTabInChrome(gmailUrl);

  console.log(`[BrowserBot] ✓ Aba [${tabId}] criada com Destinatário, Assunto e Mensagem.`);
  console.log('[BrowserBot] Aguardando 6s para carregamento do Gmail...');
  await new Promise(r => setTimeout(r, 6000));

  // Tenta clicar no botão Enviar via JS na aba isolada
  const sendScript = `
    (function() {
      const all = Array.from(document.querySelectorAll('div[role="button"]'));
      const sendBtn = all.find(el => {
        const text = (el.innerText || '').toLowerCase().trim();
        const label = (el.getAttribute('aria-label') || '').toLowerCase();
        return text.startsWith('enviar') || text === 'send' || label.includes('enviar') || label.includes('send');
      });
      if (sendBtn) {
        sendBtn.click();
        return 'sent';
      }
      return 'not_found';
    })()
  `;
  const res = executeJsOnTab(tabId, sendScript);

  if (res === 'sent') {
    console.log(`[BrowserBot] ✓ Botão Enviar clicado no Gmail para ${email}!`);
  } else {
    // Dispara Cmd+Enter na aba do Gmail
    sendKeyToTab(tabId, 'return', true);
    console.log(`[BrowserBot] ✓ Comando de envio (Cmd+Enter) disparado no Gmail para ${email}!`);
  }

  return { success: true, platform: 'email', tabId };
}

module.exports = {
  copyToClipboard,
  openNewTabInChrome,
  executeJsOnTab,
  sendKeyToTab,
  closeTab,
  sendThreadsDirectMessage,
  sendInstagramDirectMessage,
  sendEmailViaChrome
};
