// auto_scheduler.js - Agendador e Fila de Candidatura com Temporizador Humano (Anti-Ban)
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const autoApplier = require('./auto_applier');
const browserBot = require('./browser_bot');

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

  // Prioriza exclusivamente vagas de design com intenção estrita e verificada de contratação
  const candidates = allJobs.filter(j => {
    if (appliedSet.has(j.id)) return false;
    return autoApplier.isStrictDesignHiring(j);
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

  // Tenta disparo real no canal correspondente
  let sendResult = { success: false };
  try {
    if (pkg.primaryChannel === 'email' && pkg.urls.gmailUrl) {
      log(`-> Abrindo Gmail no seu Chrome com destinatário (${pkg.contacts.primaryEmail}) e texto prontos...`);
      sendResult = await browserBot.sendEmailViaChrome(pkg.urls.gmailUrl, pkg.contacts.primaryEmail);
    } else {
      // 1. Sempre envia no Threads (onde a vaga foi encontrada)
      log(`-> Abrindo Threads de @${pkg.contacts.authorUsername} no seu Chrome...`);
      await browserBot.sendThreadsDirectMessage(pkg.contacts.authorUsername, pkg.body);

      // 2. Se tiver Instagram detectado, envia também no Instagram!
      if (pkg.contacts.hasExplicitInstagram && pkg.contacts.igHandle) {
        log(`-> Perfil tem Instagram detectado (@${pkg.contacts.igHandle})! Abrindo para enviar também...`);
        await new Promise(r => setTimeout(r, 4000));
        await browserBot.sendInstagramDirectMessage(pkg.contacts.igHandle, pkg.body);
      } else {
        log(`-> Perfil sem Instagram no post. Enviado exclusivamente no Threads.`);
      }
      sendResult = { success: true };
    }
  } catch (err) {
    log(`Aviso ao tentar envio automático: ${err.message}`);
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
