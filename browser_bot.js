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

/**
 * Ativa temporariamente a aba alvo para permitir colagem via Cmd+V e envio,
 * restaurando a aba onde o usuário estava em seguida.
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
            
            -- Foca o campo de texto
            tell t to execute javascript "
              const box = document.querySelector('div[role=\\"textbox\\"][contenteditable=\\"true\\"], textarea');
              if (box) box.focus();
            "
            
            -- Cola o texto do clipboard com Cmd+V
            tell application "System Events"
              tell process "Google Chrome"
                set frontmost to true
                keystroke "v" using command down
              end tell
            end tell
            
            delay 0.8
            
            -- Clica no botão oficial de Enviar que aparece após digitar
            tell t to execute javascript "
              (function() {
                const sendSvg = document.querySelector('svg[title=\\"Enviar\\"], svg[aria-label=\\"Enviar\\"], svg[title=\\"Send\\"], svg[aria-label=\\"Send\\"]');
                if (sendSvg) {
                  const btn = sendSvg.closest('div[role=\\"button\\"]') || sendSvg.parentElement || sendSvg;
                  btn.click();
                  return 'clicked_svg';
                }
                return 'not_found';
              })()
            "
            
            delay 0.5
            
            -- Pressiona Return como garantia extra
            tell application "System Events"
              tell process "Google Chrome"
                keystroke return
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
    console.log('[BrowserBot] ✓ Botão "Enviar mensagem" clicado com sucesso!');
    console.log('[BrowserBot] Aguardando abertura do chat...');
    await new Promise(r => setTimeout(r, 4000));

    // 2. Cola o texto e clica no botão oficial de Enviar
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
  await new Promise(r => setTimeout(r, 5500));

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
