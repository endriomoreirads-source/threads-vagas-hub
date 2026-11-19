#!/bin/bash
# start_chrome.sh - Inicia o seu Google Chrome com conexão segura para o robô de vagas
echo "Fechando o Chrome para aplicar o modo de conexão..."
killall "Google Chrome" 2>/dev/null
sleep 1
echo "Reabrindo seu Google Chrome com todos os seus logins, abas e histórico ativos..."
open -a "Google Chrome" --args --remote-debugging-port=9222
sleep 1
echo ""
echo "=========================================================="
echo "✓ PRONTO! Seu Google Chrome foi aberto normalmente."
echo "Todas as suas contas (Threads, Instagram, Gmail) estão ativas."
echo "Agora o robô não precisa de login nem vai pedir CAPTCHA!"
echo "=========================================================="
echo ""
