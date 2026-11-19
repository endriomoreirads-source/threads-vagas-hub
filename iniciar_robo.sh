#!/bin/bash
# ==========================================================
# Iniciar Robô de Vagas e Candidaturas Automáticas
# ==========================================================

PROJECT_DIR="/Users/endriomoreira/.gemini/antigravity/scratch/threads-vagas-designer"
cd "$PROJECT_DIR" || exit 1

echo "=========================================================="
echo "🚀 INICIANDO O ROBÔ DE CANDIDATURAS THREADSJOBS"
echo "=========================================================="
echo "👤 Candidato: Endrio Moreira"
echo "🔗 Portfólio: https://endriodsgn.vercel.app/"
echo "⏱️ Intervalo Anti-Ban: 30 a 40 minutos"
echo "📅 Filtro de data: Vagas recentes dos últimos 3 dias"
echo "🛡️ Bloqueio de duplicados: Ativo (cada autor recebe 1 única mensagem)"
echo "👁️ Leitor de imagens OCR: Ativo para banners e flyers de vagas"
echo "=========================================================="

# 1. Garante que o motor de varredura e OCR esteja rodando
if ! lsof -i :3456 > /dev/null 2>&1; then
  echo "📡 Iniciando motor de varredura contínua e OCR..."
  nohup node server.js > data/server.log 2>&1 &
  sleep 2
else
  echo "✓ Motor de varredura e OCR ativo na porta 3456."
fi

# 2. Inicia o disparador automático em loop
echo "🤖 Robô em execução. Para pausar a qualquer momento, aperte Ctrl+C."
echo "----------------------------------------------------------"
node auto_scheduler.js start
