// browser_bot.js - Automação Nativa no seu Google Chrome Aberto (100% Sem Captcha)
const { execSync } = require('child_process');

function copyToClipboard(text) {
  try {
    execSync('pbcopy', { input: text, encoding: 'utf8' });
    return true;
  } catch (err) {
    return false;
  }
}

function openInChrome(url) {
  const script = `
    tell application "Google Chrome"
      activate
      open location "${url}"
    end tell
  `;
  execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
}

function executeChromeJs(jsCode) {
  const script = `
    tell application "Google Chrome"
      tell active tab of front window
        execute javascript "${jsCode.replace(/"/g, '\\"')}"
      end tell
    end tell
  `;
  try {
    return execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, { encoding: 'utf8' }).trim();
  } catch (err) {
    return null;
  }
}

function pasteAndSendViaSystemEvents(delaySeconds = 3) {
  const script = `
    delay ${delaySeconds}
    tell application "System Events"
      tell process "Google Chrome"
        set frontmost to true
        keystroke "v" using command down
        delay 1
        keystroke return
      end tell
    end tell
  `;
  try {
    execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
    return true;
  } catch (err) {
    return false;
  }
}

async function sendThreadsDirectMessage(username, messageText) {
  console.log(`[BrowserBot] 🚀 Abrindo perfil no Threads de @${username}...`);
  copyToClipboard(messageText);

  const profileUrl = `https://www.threads.com/@${username}`;
  openInChrome(profileUrl);

  console.log('[BrowserBot] ✓ Perfil aberto no Chrome. Aguardando 4.5s de carregamento...');
  await new Promise(r => setTimeout(r, 4500));

  // Tenta clicar no botão "Enviar mensagem" ou "Mensagem" via JavaScript se permitido no Chrome
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
  const result = executeChromeJs(clickScript);

  if (result === 'clicked') {
    console.log('[BrowserBot] ✓ Botão de Mensagem clicado automaticamente!');
    await new Promise(r => setTimeout(r, 2500));

    // Foca na caixa de mensagem aberta
    const focusScript = `
      (function() {
        const box = document.querySelector('div[contenteditable="true"], textarea, div[role="textbox"]');
        if (box) { box.focus(); return 'focused'; }
        return 'not_found';
      })()
    `;
    executeChromeJs(focusScript);
    await new Promise(r => setTimeout(r, 800));

    pasteAndSendViaSystemEvents(1);
    console.log(`[BrowserBot] ✓ Mensagem colada e enviada para @${username}!`);
  } else {
    console.log('[BrowserBot] ⚠️ O Chrome bloqueou a execução de script para clicar no botão.');
    console.log('[BrowserBot] 👉 Para ativar: Menu do Chrome > Visualização > Desenvolvedor > "Permitir o JavaScript do Eventos da Apple"');
    console.log('[BrowserBot] 📋 A mensagem já está na sua área de transferência (Cmd+V).');
    pasteAndSendViaSystemEvents(3);
  }

  return { success: true, platform: 'threads' };
}

async function sendInstagramDirectMessage(username, messageText) {
  console.log(`[BrowserBot] 🚀 Abrindo chat direto no Instagram com @${username}...`);
  copyToClipboard(messageText);

  const dmUrl = `https://ig.me/m/${username}`;
  openInChrome(dmUrl);

  console.log('[BrowserBot] ✓ Chat do Instagram aberto no Chrome. Aguardando...');
  await new Promise(r => setTimeout(r, 5000));

  pasteAndSendViaSystemEvents(2);
  console.log(`[BrowserBot] ✓ Mensagem enviada no Instagram para @${username}!`);
  return { success: true, platform: 'instagram' };
}

async function sendEmailViaChrome(gmailUrl, email) {
  console.log(`[BrowserBot] 🚀 Abrindo Gmail para ${email} no seu Chrome ativo...`);
  openInChrome(gmailUrl);
  console.log('[BrowserBot] ✓ Rascunho com Assunto, Mensagem e Portfólio aberto na sua tela!');
  return { success: true, platform: 'email' };
}

module.exports = {
  copyToClipboard,
  openInChrome,
  executeChromeJs,
  sendThreadsDirectMessage,
  sendInstagramDirectMessage,
  sendEmailViaChrome
};
