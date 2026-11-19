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

function getEligibleRecentJobs() {
  const DB_FILE = path.join(__dirname, 'data', 'jobs_store.json');
  if (!fs.existsSync(DB_FILE)) return [];

  const allJobs = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  const appliedSet = new Set(autoApplier.loadAppliedJobs().map(a => a.jobId));

  // Filtro de tempo: Vagas recentes de no máximo 3 dias (72 horas)
  const THREE_DAYS_SEC = 3 * 24 * 60 * 60;
  const nowSec = Math.floor(Date.now() / 1000);

  // Prioriza exclusivamente vagas de design com intenção estrita e verificada de contratação
  // e NUNCA repete para o mesmo autor/perfil (garantia de perfil único)
  const candidates = allJobs.filter(j => {
    if (appliedSet.has(j.id)) return false;
    if (j.takenAt && (nowSec - j.takenAt) > THREE_DAYS_SEC) return false;

    const author = j.author?.username;
    const ig = j.contacts?.igHandle;
    if (autoApplier.isAuthorAlreadyContacted(author, ig)) return false;
    return autoApplier.isStrictDesignHiring(j);
  });

  // Ordena pelas mais recentes primeiro
  candidates.sort((a, b) => (b.takenAt || 0) - (a.takenAt || 0));
  return candidates;
}

async function findNextQueuePair() {
  const candidates = getEligibleRecentJobs();
  if (candidates.length === 0) return [];

  const brJob = candidates.find(j => !autoApplier.isEnglishJob(j)) || null;
  const enJob = candidates.find(j => autoApplier.isEnglishJob(j)) || null;

  const pair = [];
  if (brJob) pair.push(brJob);
  if (enJob && (!brJob || enJob.author?.username !== brJob.author?.username)) {
    pair.push(enJob);
  }
  return pair;
}

async function dispatchSingleJob(job, maxToday) {
  const appliedToday = getDailyAppliedCount();
  if (appliedToday >= maxToday) {
    log(`Limite diário de segurança atingido (${appliedToday}/${maxToday}). Pausando envios até amanhã.`);
    return false;
  }

  const pkg = autoApplier.generateApplicationPackage(job);
  log(`Processando vaga [${pkg.jobCode}] | Idioma: ${pkg.languageLabel} | Canal: ${pkg.primaryChannel}`);
  if (pkg.asksForSalary) {
    log(`-> Pretensão salarial detectada e incluída no texto: ${pkg.salaryIncludedText}`);
  }

  try {
    if (pkg.primaryChannel === 'email' && pkg.urls.gmailUrl) {
      log(`-> Abrindo Gmail no seu Chrome com destinatário (${pkg.contacts.primaryEmail}) e texto prontos...`);
      await browserBot.sendEmailViaChrome(pkg.urls.gmailUrl, pkg.contacts.primaryEmail);
    } else {
      log(`-> Abrindo Threads de @${pkg.contacts.authorUsername} no seu Chrome...`);
      await browserBot.sendThreadsDirectMessage(pkg.contacts.authorUsername, pkg.body);

      if (pkg.contacts.hasExplicitInstagram && pkg.contacts.igHandle) {
        log(`-> Perfil tem Instagram detectado (@${pkg.contacts.igHandle})! Abrindo para enviar também...`);
        await new Promise(r => setTimeout(r, 4000));
        await browserBot.sendInstagramDirectMessage(pkg.contacts.igHandle, pkg.body);
      } else {
        log(`-> Perfil sem Instagram no post. Enviado exclusivamente no Threads.`);
      }
    }
  } catch (err) {
    log(`Aviso ao tentar envio automático: ${err.message}`);
  }

  autoApplier.markAsApplied(
    pkg.jobId,
    pkg.primaryChannel,
    `Processado via AutoScheduler (${pkg.languageLabel})`,
    pkg.contacts.authorUsername,
    pkg.contacts.igHandle
  );
  log(`✓ Candidatura registrada com sucesso para [${pkg.jobCode}] (@${pkg.contacts.authorUsername}). Total hoje: ${appliedToday + 1}/${maxToday}`);
  return true;
}

async function processNextJob() {
  const config = autoApplier.loadConfig();

  if (!isWithinActiveHours(config)) {
    log('Fora do horário de operação configurado (08:30 às 20:00). Aguardando próximo ciclo.');
    return false;
  }

  const maxToday = config.timing?.maxDailyDms || 25;
  if (getDailyAppliedCount() >= maxToday) {
    log(`Limite diário de segurança atingido (${getDailyAppliedCount()}/${maxToday}). Pausando envios até amanhã.`);
    return false;
  }

  const pair = await findNextQueuePair();
  if (pair.length === 0) {
    log('Nenhuma vaga nova pendente na fila.');
    return false;
  }

  let anySent = false;
  for (let i = 0; i < pair.length; i++) {
    const ok = await dispatchSingleJob(pair[i], maxToday);
    if (ok) anySent = true;
    if (i < pair.length - 1) {
      log('⏱️ Aguardando 12s antes da segunda candidatura deste ciclo (BR + Gringa)...');
      await new Promise(r => setTimeout(r, 12000));
    }
  }
  return anySent;
}

async function triggerLiveThreadsScan() {
  try {
    const res = await fetch('http://localhost:3456/api/crawler/trigger', { method: 'POST' });
    if (res.ok) {
      log('🔍 Varredura rápida de novas vagas (últimos 3 dias + leitura de imagens via OCR) acionada no Threads!');
    }
  } catch (e) {}
}

async function runDaemon() {
  log('🚀 Iniciando Robô de Candidaturas Automáticas ThreadsJobs (Modo Anti-Ban Ativo)');
  await triggerLiveThreadsScan();
  const config = autoApplier.loadConfig();

  let cycles = 0;
  while (true) {
    try {
      cycles++;
      if (cycles % 2 === 0) {
        // A cada ~1h aciona nova varredura de vagas recentes
        triggerLiveThreadsScan();
      }
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
