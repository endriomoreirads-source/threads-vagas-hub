// test_applier.js - Ferramenta de Teste e Pré-visualização de Candidaturas
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const autoApplier = require('./auto_applier');

const DB_FILE = path.join(__dirname, 'data', 'jobs_store.json');

async function getPendingJobs(limit = 3) {
  if (!fs.existsSync(DB_FILE)) return [];
  const allJobs = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  const appliedSet = new Set(autoApplier.loadAppliedJobs().map(a => a.jobId));

  const candidates = allJobs.filter(j => {
    if (appliedSet.has(j.id)) return false;
    return j.hasDesignContext || (j.jobTopics && j.jobTopics.includes('design'));
  });

  candidates.sort((a, b) => (b.takenAt || 0) - (a.takenAt || 0));
  return candidates.slice(0, limit);
}

async function runTest() {
  console.log('\n==========================================================');
  console.log('🤖 TESTADOR DA FERRAMENTA DE PREENCHIMENTO AUTOMÁTICO');
  console.log('==========================================================\n');

  const config = autoApplier.loadConfig();
  const appliedList = autoApplier.loadAppliedJobs();
  const today = new Date().toISOString().slice(0, 10);
  const countToday = appliedList.filter(a => a.appliedAtISO && a.appliedAtISO.startsWith(today)).length;

  console.log(`👤 Candidato: ${config.candidate?.name}`);
  console.log(`🔗 Portfólio: ${config.candidate?.portfolioUrl}`);
  console.log(`💰 Faixa Salarial: R$ 1.800–2.000 (BR) | $500–800 USD (Gringa)`);
  console.log(`⏱️ Intervalo Anti-Ban: ${config.timing?.minDelayMinutes} a ${config.timing?.maxDelayMinutes} minutos`);
  console.log(`📊 Candidaturas hoje: ${countToday} / ${config.timing?.maxDailyDms}\n`);

  const pending = await getPendingJobs(3);
  if (pending.length === 0) {
    console.log('Nenhuma vaga nova pendente na fila.');
    return;
  }

  console.log(`🔍 Encontradas ${pending.length} vagas recentes prioritárias na fila para teste:\n`);

  pending.forEach((job, index) => {
    const pkg = autoApplier.generateApplicationPackage(job);
    console.log(`----------------------------------------------------------`);
    console.log(`📌 [VAGA #${index + 1}] ID: ${pkg.jobCode} | @${pkg.contacts.authorUsername}`);
    console.log(`🌐 Idioma Detectado: ${pkg.languageLabel}`);
    console.log(`🎯 Canal de Envio: ${pkg.primaryChannel.toUpperCase()}`);
    console.log(`💰 Pediu Pretensão Salarial?: ${pkg.asksForSalary ? 'SIM (Faixa anexada automaticamente)' : 'NÃO (Mensagem padrão)'}`);
    if (pkg.contacts.primaryEmail) {
      console.log(`✉️ E-mail da Vaga: ${pkg.contacts.primaryEmail}`);
    }
    if (pkg.contacts.phoneDigits) {
      console.log(`📱 WhatsApp da Vaga: ${pkg.contacts.primaryPhone}`);
    }
    if (pkg.contacts.igHandle) {
      console.log(`📸 Instagram: @${pkg.contacts.igHandle}`);
    }
    console.log(`\n📝 MENSAGEM FORMULADA QUE SERÁ ENVIADA:`);
    console.log(`Assunto: ${pkg.subject}`);
    console.log(`--- Início do Texto ---`);
    console.log(pkg.body);
    console.log(`--- Fim do Texto ---\n`);
  });

  console.log('==========================================================');
  console.log('👉 COMO VOCÊ PODE TESTAR AGORA NO SEU COMPUTADOR:');
  console.log('----------------------------------------------------------');
  console.log('1. Para testar o envio de 1 vaga real agora:');
  console.log('   node auto_scheduler.js run-once');
  console.log('');
  console.log('2. Para abrir a próxima vaga com o e-mail/DM pronto no seu Chrome/Mac:');
  console.log('   node test_applier.js open-first');
  console.log('');
  console.log('3. Para deixar o robô rodando o dia todo com pausas de 30-40 min:');
  console.log('   node auto_scheduler.js start');
  console.log('==========================================================\n');
}

// Se passou o argumento "open-first", abre a primeira vaga no navegador padrão do Mac
if (process.argv[2] === 'open-first') {
  getPendingJobs(1).then(([job]) => {
    if (!job) {
      console.log('Nenhuma vaga disponível.');
      return;
    }
    const pkg = autoApplier.generateApplicationPackage(job);
    console.log(`\n🚀 Abrindo canal da vaga [${pkg.jobCode}]...`);
    let targetUrl = pkg.urls.gmailUrl || pkg.urls.threadsDmUrl || job.url;
    console.log(`Destino: ${targetUrl}`);
    exec(`open "${targetUrl}"`);
    autoApplier.markAsApplied(pkg.jobId, pkg.primaryChannel, 'Teste open-first');
    console.log(`✓ Marcada como candidatada no histórico!\n`);
  });
} else {
  runTest();
}
