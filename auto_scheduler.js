// auto_scheduler.js - Agendador e Fila de Candidatura com Temporizador Humano (Anti-Ban)
const fs = require('fs');
const path = require('path');
const autoApplier = require('./auto_applier');

const LOG_FILE = path.join(__dirname, 'data', 'auto_scheduler.log');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
  } catch (e) {}
}

function getDailyAppliedCount() {
  const applied = autoApplier.loadAppliedJobs();
  const today = new Date().toISOString().slice(0, 10);
  return applied.filter(a => a.appliedAtISO && a.appliedAtISO.startsWith(today)).length;
}

function isWithinActiveHours(config) {
  const now = new Date();
  const currentHour = now.getHours() + now.getMinutes() / 60;
  const start = config.timing?.activeStartHour || 8.5; // 08:30
  const end = config.timing?.activeEndHour || 20.0;    // 20:00
  return currentHour >= start && currentHour <= end;
}

function getRandomDelayMs(config) {
  const minMin = config.timing?.minDelayMinutes || 30;
  const maxMin = config.timing?.maxDelayMinutes || 40;
  const randomMinutes = minMin + Math.random() * (maxMin - minMin);
  return Math.round(randomMinutes * 60 * 1000);
}

async function findNextQueueJob() {
  const DB_FILE = path.join(__dirname, 'data', 'jobs_store.json');
  if (!fs.existsSync(DB_FILE)) return null;

  const allJobs = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  const appliedSet = new Set(autoApplier.loadAppliedJobs().map(a => a.jobId));

  // Prioriza vagas de design mais recentes que ainda não foram candidatadas
  const candidates = allJobs.filter(j => {
    if (appliedSet.has(j.id)) return false;
    return j.hasDesignContext || (j.jobTopics && j.jobTopics.includes('design'));
  });

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => (b.takenAt || 0) - (a.takenAt || 0));
  return candidates[0];
}

async function processNextJob() {
  const config = autoApplier.loadConfig();

  if (!isWithinActiveHours(config)) {
    log('Fora do horário de operação configurado (08:30 às 20:00). Aguardando próximo ciclo.');
    return false;
  }

  const appliedToday = getDailyAppliedCount();
  const maxToday = config.timing?.maxDailyDms || 15;
  if (appliedToday >= maxToday) {
    log(`Limite diário de segurança atingido (${appliedToday}/${maxToday}). Pausando envios até amanhã.`);
    return false;
  }

  const nextJob = await findNextQueueJob();
  if (!nextJob) {
    log('Nenhuma vaga nova pendente na fila.');
    return false;
  }

  const pkg = autoApplier.generateApplicationPackage(nextJob);
  log(`Processando vaga [${pkg.jobCode}] | Idioma: ${pkg.languageLabel} | Canal: ${pkg.primaryChannel}`);
  if (pkg.asksForSalary) {
    log(`-> Pretensão salarial detectada e incluída no texto: ${pkg.salaryIncludedText}`);
  }

  // Registra candidatura
  autoApplier.markAsApplied(pkg.jobId, pkg.primaryChannel, `Processado via AutoScheduler (${pkg.languageLabel})`);
  log(`✓ Candidatura registrada com sucesso para [${pkg.jobCode}]. Total hoje: ${appliedToday + 1}/${maxToday}`);
  return true;
}

async function runDaemon() {
  log('🚀 Iniciando Robô de Candidaturas Automáticas ThreadsJobs (Modo Anti-Ban Ativo)');
  const config = autoApplier.loadConfig();

  while (true) {
    try {
      await processNextJob();
    } catch (err) {
      log(`Erro no ciclo do robô: ${err.message}`);
    }

    const delayMs = getRandomDelayMs(config);
    const delayMin = (delayMs / 60000).toFixed(1);
    log(`⏳ Pausa de segurança humana: aguardando ${delayMin} minutos antes da próxima vaga...`);
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
}

// Interface de linha de comando
const args = process.argv.slice(2);
const command = args[0] || 'status';

if (command === 'start') {
  runDaemon();
} else if (command === 'run-once') {
  processNextJob().then(() => process.exit(0));
} else {
  const config = autoApplier.loadConfig();
  const countToday = getDailyAppliedCount();
  const totalApplied = autoApplier.loadAppliedJobs().length;
  console.log('=== Status do Robô de Candidaturas ThreadsJobs ===');
  console.log(`Candidato: ${config.candidate?.name} (${config.candidate?.email})`);
  console.log(`Portfólio: ${config.candidate?.portfolioUrl}`);
  console.log(`Pretensão Salarial BR: ${config.salary?.br?.text}`);
  console.log(`Pretensão Salarial Gringa: ${config.salary?.international?.text}`);
  console.log(`Horário Ativo: ${config.timing?.activeStartHour}h às ${config.timing?.activeEndHour}h`);
  console.log(`Intervalo Anti-Ban: ${config.timing?.minDelayMinutes} a ${config.timing?.maxDelayMinutes} minutos`);
  console.log(`Candidaturas hoje: ${countToday} / ${config.timing?.maxDailyDms}`);
  console.log(`Total histórico de candidaturas: ${totalApplied}`);
  console.log('Comandos disponíveis:');
  console.log('  node auto_scheduler.js start     -> Inicia o loop contínuo de envios');
  console.log('  node auto_scheduler.js run-once  -> Processa 1 vaga da fila imediatamente');
  console.log('  node auto_scheduler.js status    -> Mostra este resumo');
}
