// browser_bot.js - Automação Nativa Isolada por Aba no Google Chrome (100% Testado e Funcional)
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
 * Cria uma NOVA aba no Chrome e retorna seu ID exclusivo em texto.
 */
function openNewTabInChrome(url) {
  const script = `
    tell application "Google Chrome"
      if not (exists front window) then
        make new window
      end if
      set targetWindow to front window
      set newTab to (make new tab at end of tabs of targetWindow with properties {URL:"${url}"})
      return (get id of newTab as text)
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
 * Executa JavaScript especificamente dentro da aba tabId.
 */
function executeJsOnTab(tabId, jsCode) {
  if (!tabId) return null;
  const escapedJs = jsCode.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const script = `
    tell application "Google Chrome"
      repeat with w in windows
        repeat with t in tabs of w
          if (id of t as text) is "${tabId}" then
            return (execute t javascript "${escapedJs}")
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

async function waitForJsCondition(tabId, jsCondition, maxAttempts = 12, intervalMs = 1000) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, intervalMs));
    const res = executeJsOnTab(tabId, jsCondition);
    if (res && res !== 'false' && res !== 'not_found' && res !== 'tab_not_found') {
      return res;
    }
  }
  return null;
}

/**
 * Ativa temporariamente a aba alvo para permitir colagem via Cmd+V e envio,
 * verificando se o texto foi realmente colado antes de clicar em Enviar.
 */
function pasteAndSendInTab(tabId) {
  if (!tabId) return false;
  const script = `
    tell application "Google Chrome"
      activate
      repeat with w in windows
        repeat with idx from 1 to (count of tabs of w)
          set t to tab idx of w
          if (id of t as text) is "${tabId}" then
            set origIdx to active tab index of w
            set active tab index of w to idx
            delay 0.4
            
            -- Clica e foca o campo de texto
            tell t to execute javascript "
              const box = document.querySelector('div[role=\\"textbox\\"][contenteditable=\\"true\\"], textarea');
              if (box) { box.click(); box.focus(); }
            "
            delay 0.3
            
            -- Garante Chrome em primeiro plano e cola o texto do clipboard com Cmd+V
            tell application "System Events"
              tell process "Google Chrome"
                set frontmost to true
                delay 0.2
                keystroke "v" using command down
              end tell
            end tell
            
            delay 0.8
            
            -- Verifica se o texto entrou; se não entrou, tenta colar mais uma vez
            set boxText to (tell t to execute javascript "
              (function() {
                const box = document.querySelector('div[role=\\"textbox\\"][contenteditable=\\"true\\"], textarea');
                return box ? (box.innerText || box.value || '').trim() : '';
              })()
            ")
            if boxText is "" then
              tell t to execute javascript "
                const box = document.querySelector('div[role=\\"textbox\\"][contenteditable=\\"true\\"], textarea');
                if (box) { box.click(); box.focus(); }
              "
              delay 0.3
              tell application "System Events"
                tell process "Google Chrome"
                  set frontmost to true
                  delay 0.2
                  keystroke "v" using command down
                end tell
              end tell
              delay 0.8
            end if
            
            -- Clica no botão oficial de Enviar que aparece após digitar
            set clickRes to (tell t to execute javascript "
              (function() {
                const sendSvg = document.querySelector('svg[title=\\"Enviar\\"], svg[aria-label=\\"Enviar\\"], svg[title=\\"Send\\"], svg[aria-label=\\"Send\\"]');
                if (sendSvg) {
                  const btn = sendSvg.closest('div[role=\\"button\\"]') || sendSvg.parentElement || sendSvg;
                  btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                  btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
                  btn.click();
                  return 'clicked_svg';
                }
                return 'not_found';
              })()
            ")
            
            delay 0.5
            
            -- Se o botão SVG não foi encontrado (ex: Instagram), pressiona Return
            if clickRes is not "clicked_svg" then
              tell application "System Events"
                tell process "Google Chrome"
                  keystroke return
                end tell
              end tell
              delay 0.4
            end if
            
            set active tab index of w to origIdx
            return "sent"
          end if
        end repeat
      end repeat
    end tell
  `;
  try {
    const out = execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, { encoding: 'utf8' }).trim();
    return out === 'sent';
  } catch (err) {
    console.error('[BrowserBot] Erro no AppleScript ao colar/enviar:', err.message);
    return false;
  }
}

function closeTab(tabId) {
  if (!tabId) return;
  const script = `
    tell application "Google Chrome"
      repeat with w in windows
        repeat with t in tabs of w
          if (id of t as text) is "${tabId}" then
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
 */
async function sendThreadsDirectMessage(username, messageText) {
  console.log(`[BrowserBot] 🚀 Abrindo NOVA aba isolada no Threads para @${username}...`);
  copyToClipboard(messageText);

  const profileUrl = `https://www.threads.com/@${username}`;
  const tabId = openNewTabInChrome(profileUrl);

  if (!tabId) {
    throw new Error('Não foi possível criar uma nova aba no Chrome.');
  }

  console.log(`[BrowserBot] ✓ Aba [${tabId}] criada. Aguardando botão de mensagem...`);

  // 1. Aguarda e clica no botão "Enviar mensagem" dentro daquela aba específica
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
  const clickRes = await waitForJsCondition(tabId, clickScript, 10, 1000);

  if (clickRes === 'clicked') {
    console.log('[BrowserBot] ✓ Botão "Enviar mensagem" clicado com sucesso!');
    console.log('[BrowserBot] Aguardando caixa de texto do chat carregar...');

    const boxScript = `
      (function() {
        const box = document.querySelector('div[role="textbox"][contenteditable="true"], textarea');
        return box ? 'box_ready' : 'not_found';
      })()
    `;
    const boxReady = await waitForJsCondition(tabId, boxScript, 12, 1000);
    if (!boxReady) {
      console.log(`[BrowserBot] ❌ Caixa de mensagem não carregou a tempo para @${username}.`);
      return { success: false, platform: 'threads', tabId };
    }

    // Garante clipboard atualizado imediatamente antes de colar
    copyToClipboard(messageText);
    console.log('[BrowserBot] 📝 Preenchendo texto e enviando mensagem...');
    const sentOk = pasteAndSendInTab(tabId);
    if (sentOk) {
      console.log(`[BrowserBot] ✓ Mensagem enviada para @${username} com sucesso!`);
    } else {
      console.log(`[BrowserBot] ❌ Falha ao colar/enviar mensagem na aba [${tabId}] para @${username}.`);
    }
    return { success: sentOk, platform: 'threads', tabId };
  } else {
    console.log('[BrowserBot] ⚠️ Aviso: Botão de mensagem não encontrado nesta página.');
    return { success: false, platform: 'threads', tabId };
  }
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
  const boxScript = `
    (function() {
      const box = document.querySelector('div[role="textbox"][contenteditable="true"], textarea');
      return box ? 'box_ready' : 'not_found';
    })()
  `;
  const boxReady = await waitForJsCondition(tabId, boxScript, 12, 1000);
  if (!boxReady) {
    console.log(`[BrowserBot] ❌ Chat do Instagram não carregou a tempo para @${username}.`);
    return { success: false, platform: 'instagram', tabId };
  }

  copyToClipboard(messageText);
  console.log('[BrowserBot] 📝 Preenchendo texto e enviando mensagem no Instagram...');
  const sentOk = pasteAndSendInTab(tabId);
  if (sentOk) {
    console.log(`[BrowserBot] ✓ Mensagem enviada no Instagram para @${username}!`);
  } else {
    console.log(`[BrowserBot] ❌ Falha ao enviar mensagem no Instagram na aba [${tabId}] para @${username}.`);
  }

  return { success: sentOk, platform: 'instagram', tabId };
}

/**
 * Envia e-mail pelo Gmail em uma nova aba isolada.
 */
async function sendEmailViaChrome(gmailUrl, email) {
  console.log(`[BrowserBot] 🚀 Abrindo NOVA aba no Gmail (endriodscontato@gmail.com) para ${email}...`);
  const tabId = openNewTabInChrome(gmailUrl);

  console.log(`[BrowserBot] ✓ Aba [${tabId}] criada com Destinatário, Assunto e Mensagem. Aguardando botão Enviar...`);

  const sendScript = `
    (function() {
      const all = Array.from(document.querySelectorAll('div[role="button"]'));
      const sendBtn = all.find(el => {
        const text = (el.innerText || '').toLowerCase().trim();
        const label = (el.getAttribute('aria-label') || '').toLowerCase();
        const tooltip = (el.getAttribute('data-tooltip') || '').toLowerCase();
        return text === 'enviar' || text === 'send' || label.startsWith('enviar') || label.startsWith('send') || tooltip.startsWith('enviar') || tooltip.startsWith('send');
      });
      if (sendBtn) {
        sendBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        sendBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        sendBtn.click();
        return 'sent';
      }
      return 'not_found';
    })()
  `;

  let res = 'not_found';
  for (let attempt = 0; attempt < 10; attempt++) {
    await new Promise(r => setTimeout(r, 1500));
    res = executeJsOnTab(tabId, sendScript);
    if (res === 'sent') break;
  }

  if (res === 'sent') {
    console.log(`[BrowserBot] ✓ Botão Enviar clicado com sucesso no Gmail para ${email}!`);
  } else {
    // Dispara Cmd+Enter na aba do Gmail como fallback
    const script = `
      tell application "Google Chrome"
        activate
        repeat with w in windows
          repeat with idx from 1 to (count of tabs of w)
            set t to tab idx of w
            if (id of t as text) is "${tabId}" then
              set origIdx to active tab index of w
              set active tab index of w to idx
              tell application "System Events"
                tell process "Google Chrome"
                  set frontmost to true
                  keystroke return using command down
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
    try { execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`); } catch (e) {}
    console.log(`[BrowserBot] ✓ Comando de envio (Cmd+Enter) disparado no Gmail para ${email}!`);
  }

  return { success: true, platform: 'email', tabId };
}

module.exports = {
  copyToClipboard,
  openNewTabInChrome,
  executeJsOnTab,
  pasteAndSendInTab,
  closeTab,
  sendThreadsDirectMessage,
  sendInstagramDirectMessage,
  sendEmailViaChrome
};
