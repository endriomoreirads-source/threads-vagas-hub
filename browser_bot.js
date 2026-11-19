// browser_bot.js - Automação Nativa no seu Google Chrome Aberto (100% Sem Captcha)
const { execSync, exec } = require('child_process');

/**
 * Copia texto com segurança para a área de transferência do macOS
 */
function copyToClipboard(text) {
  try {
    execSync('pbcopy', { input: text, encoding: 'utf8' });
    return true;
  } catch (err) {
    console.error('[BrowserBot] Erro ao copiar para área de transferência:', err.message);
    return false;
  }
}

/**
 * Abre uma URL em nova aba no seu Google Chrome ativo e traz a janela para frente
 */
function openInChrome(url) {
  const script = `
    tell application "Google Chrome"
      activate
      open location "${url}"
    end tell
  `;
  execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
}

/**
 * Simula colar (Cmd+V) e pressionar Enter no Chrome via System Events
 */
function pasteAndSendViaSystemEvents(delaySeconds = 4) {
  const script = `
    delay ${delaySeconds}
    tell application "System Events"
      tell process "Google Chrome"
        set frontmost to true
        -- Cola o texto do clipboard (Cmd + V)
        keystroke "v" using command down
        delay 1
        -- Pressiona Enter para enviar
        keystroke return
      end tell
    end tell
  `;
  try {
    execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
    return true;
  } catch (err) {
    console.log('[BrowserBot] Aviso ao colar automaticamente:', err.message);
    return false;
  }
}

/**
 * Envia uma mensagem direta de verdade para um usuário no Threads usando o seu Chrome
 */
async function sendThreadsDirectMessage(username, messageText) {
  console.log(`[BrowserBot] 🚀 Abrindo Threads de @${username} no seu Google Chrome ativo...`);
  copyToClipboard(messageText);

  const profileUrl = `https://www.threads.com/@${username}`;
  openInChrome(profileUrl);

  console.log('[BrowserBot] ✓ Aba aberta no seu Chrome com o perfil!');
  console.log('[BrowserBot] 📋 Mensagem personalizada e portfólio já estão na sua área de transferência.');
  
  // Tenta colar automaticamente na caixa de mensagem
  console.log('[BrowserBot] Aguardando carregamento para envio...');
  const sent = pasteAndSendViaSystemEvents(4);
  if (sent) {
    console.log(`[BrowserBot] ✓ Ação de envio disparada no Threads para @${username}!`);
  } else {
    console.log(`[BrowserBot] A mensagem está copiada! Basta dar Cmd+V e Enter.`);
  }

  return { success: true, platform: 'threads' };
}

/**
 * Envia uma mensagem direta de verdade no Instagram usando o seu Chrome
 */
async function sendInstagramDirectMessage(username, messageText) {
  console.log(`[BrowserBot] 🚀 Abrindo chat do Instagram de @${username} no seu Google Chrome ativo...`);
  copyToClipboard(messageText);

  // Link direto para o chat do usuário no Instagram Web
  const dmUrl = `https://ig.me/m/${username}`;
  openInChrome(dmUrl);

  console.log('[BrowserBot] ✓ Aba de chat aberta no seu Chrome!');
  console.log('[BrowserBot] 📋 Mensagem personalizada e portfólio já estão na sua área de transferência.');
  
  console.log('[BrowserBot] Aguardando carregamento para envio...');
  const sent = pasteAndSendViaSystemEvents(5);
  if (sent) {
    console.log(`[BrowserBot] ✓ Ação de envio disparada no Instagram para @${username}!`);
  } else {
    console.log(`[BrowserBot] A mensagem está copiada! Basta dar Cmd+V e Enter.`);
  }

  return { success: true, platform: 'instagram' };
}

/**
 * Abre o Gmail no Chrome ativo com tudo preenchido
 */
async function sendEmailViaChrome(gmailUrl, email) {
  console.log(`[BrowserBot] 🚀 Abrindo Gmail para ${email} no seu Chrome ativo...`);
  openInChrome(gmailUrl);
  console.log('[BrowserBot] ✓ Rascunho com Assunto, Mensagem e Portfólio aberto na sua tela!');
  return { success: true, platform: 'email' };
}

module.exports = {
  copyToClipboard,
  openInChrome,
  sendThreadsDirectMessage,
  sendInstagramDirectMessage,
  sendEmailViaChrome
};
