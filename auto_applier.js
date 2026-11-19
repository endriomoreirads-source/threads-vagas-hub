// auto_applier.js - Motor Inteligente de Candidatura e Automação Anti-Ban
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'data', 'auto_apply_config.json');
const APPLIED_STORE_PATH = path.join(__dirname, 'data', 'applied_jobs.json');

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
  } catch (err) {
    console.error('[AutoApply] Erro ao carregar config:', err.message);
  }
  return {};
}

function loadAppliedJobs() {
  try {
    if (fs.existsSync(APPLIED_STORE_PATH)) {
      return JSON.parse(fs.readFileSync(APPLIED_STORE_PATH, 'utf8'));
    }
  } catch (err) {
    console.error('[AutoApply] Erro ao carregar applied_jobs:', err.message);
  }
  return [];
}

function saveAppliedJobs(list) {
  try {
    fs.writeFileSync(APPLIED_STORE_PATH, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    console.error('[AutoApply] Erro ao salvar applied_jobs:', err.message);
  }
}

// Regex para detecção de e-mail no texto
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;

// Regex para detecção de Instagram / IG DM mencionado no texto
const IG_HANDLE_REGEX = /\b(?:ig\s*dm|direct\s*do\s*ig|instagram|insta|no\s+ig)\s*[:|-]?\s*@?([a-zA-Z0-9._]{3,30})\b/i;

// Regex para verificar se o post exige pretensão salarial
const SALARY_PROMPT_REGEX = /\b(pretens[ãa]o|pretensao\s+salarial|sal[áa]rio\s+pretendido|quanto\s+cobra|proposta\s+salarial|faixa\s+salarial|salary\s+expectation|expected\s+salary|rate\s+per\s+hour|hourly\s+rate|monthly\s+rate|your\s+rate|send\s+your\s+rate|budget\s+expectation)\b/i;

/**
 * Analisa a vaga e extrai todos os canais de contato disponíveis
 */
function extractJobContacts(job) {
  const text = `${job.text || ''} ${job.ocrText || ''}`.trim();
  
  // 1. Extração de e-mails
  const emailMatches = text.match(EMAIL_REGEX) || [];
  // Filtra e-mails de exemplo falsos ou da própria empresa do app se houver
  const validEmails = emailMatches.filter(e => !e.includes('threads') && !e.includes('example.com'));
  const primaryEmail = validEmails[0] || null;

  // 2. Extração de WhatsApp
  let primaryPhone = null;
  let phoneDigits = null;
  if (job.waInfo && job.waInfo.cleanDigits) {
    phoneDigits = job.waInfo.cleanDigits;
    primaryPhone = job.waInfo.display || phoneDigits;
  } else {
    const waMatch = text.match(/(?:whats(?:app)?|zap|contato|fone|tel)[\s:]*([+]?\d{2}[\s.-]?)?(?:\(?([1-9]{2})\)?[\s.-]?)?(?:9[.\s-]?)?(\d{4})[.-]?(\d{4})/i);
    if (waMatch) {
      phoneDigits = waMatch[0].replace(/\D/g, '');
      if (phoneDigits.length === 11 && !phoneDigits.startsWith('55')) {
        phoneDigits = '55' + phoneDigits;
      }
      primaryPhone = phoneDigits;
    }
  }

  // 3. Instagram mencionado no texto ou perfil do autor
  let igHandle = null;
  const igMatch = text.match(IG_HANDLE_REGEX);
  if (igMatch && igMatch[1]) {
    igHandle = igMatch[1].replace('@', '').trim();
  } else if (job.author && job.author.username) {
    igHandle = job.author.username;
  }

  return {
    primaryEmail,
    allEmails: validEmails,
    primaryPhone,
    phoneDigits,
    igHandle,
    authorUsername: job.author?.username || 'anunciante',
    authorFullName: job.author?.fullName || job.author?.username || 'Recrutador'
  };
}

/**
 * Detecta se a vaga está em inglês
 */
function isEnglishJob(job) {
  if (job.isInternational) return true;
  const text = `${job.text || ''} ${job.ocrText || ''}`.toLowerCase();
  const enMatches = text.match(/\b(we['’]?re\s+hiring|hiring|remote|senior|junior|looking\s+for|graphic\s+designer|full[- ]time|part[- ]time|send\s+your|apply|portfolio|experience|requirements)\b/g) || [];
  const ptMatches = text.match(/\b(vaga|contratando|estamos\s+contratando|designer\s+gr[áa]fico|remoto|freela|curr[íi]culo|portf[óo]lio|enviar|requisitos|experi[êe]ncia)\b/g) || [];
  return enMatches.length > ptMatches.length;
}

/**
 * Gera o pacote completo de candidatura personalizada para a vaga
 */
function generateApplicationPackage(job, customConfig = null) {
  const config = customConfig || loadConfig();
  const contacts = extractJobContacts(job);
  const isEn = isEnglishJob(job);
  const templateConfig = isEn ? config.templates.en : config.templates.pt;
  const salaryConfig = isEn ? config.salary.international : config.salary.br;

  const text = `${job.text || ''} ${job.ocrText || ''}`;
  const asksForSalary = SALARY_PROMPT_REGEX.test(text);

  let finalBody = '';
  let subject = templateConfig.subject;

  if (isEn) {
    finalBody = `${templateConfig.intro}\n\n${templateConfig.body}`;
    if (asksForSalary) {
      finalBody = finalBody.replace(
        'Thank you for your time',
        `${salaryConfig.text}\n\nThank you for your time`
      );
    }
  } else {
    finalBody = `${templateConfig.intro}\n\n${templateConfig.body}`;
    if (asksForSalary) {
      finalBody = finalBody.replace(
        'Agradeço pela atenção',
        `${salaryConfig.text}\n\nAgradeço pela atenção`
      );
    }
  }

  // Links prontos para ação
  let gmailUrl = null;
  let mailtoUrl = null;
  if (contacts.primaryEmail) {
    gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(contacts.primaryEmail)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(finalBody)}`;
    mailtoUrl = `mailto:${encodeURIComponent(contacts.primaryEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(finalBody)}`;
  }

  let whatsappUrl = null;
  if (contacts.phoneDigits) {
    whatsappUrl = `https://wa.me/${contacts.phoneDigits}?text=${encodeURIComponent(finalBody)}`;
  }

  const threadsDmUrl = `https://www.threads.com/@${contacts.authorUsername}`;
  const instagramDmUrl = contacts.igHandle ? `https://ig.me/m/${contacts.igHandle}` : null;
  const instagramProfileUrl = contacts.igHandle ? `https://instagram.com/${contacts.igHandle}` : null;

  // Canal recomendado prioritário
  let primaryChannel = 'threads';
  if (contacts.primaryEmail) {
    primaryChannel = 'email';
  } else if (contacts.primaryPhone) {
    primaryChannel = 'whatsapp';
  } else if (contacts.igHandle && text.toLowerCase().includes('ig')) {
    primaryChannel = 'instagram';
  }

  return {
    jobId: job.id,
    jobCode: job.code,
    language: isEn ? 'en' : 'pt',
    languageLabel: isEn ? '🇺🇸 Inglês' : '🇧🇷 Português',
    asksForSalary,
    salaryIncludedText: asksForSalary ? salaryConfig.text : null,
    contacts,
    subject,
    body: finalBody,
    primaryChannel,
    urls: {
      gmailUrl,
      mailtoUrl,
      whatsappUrl,
      threadsDmUrl,
      instagramDmUrl,
      instagramProfileUrl
    }
  };
}

/**
 * Registra candidatura enviada
 */
function markAsApplied(jobId, channel, notes = '') {
  const applied = loadAppliedJobs();
  const exists = applied.find(a => a.jobId === jobId);
  if (!exists) {
    applied.push({
      jobId,
      channel,
      appliedAt: Date.now(),
      appliedAtISO: new Date().toISOString(),
      notes
    });
    saveAppliedJobs(applied);
  }
}

/**
 * Checa se já foi candidatado
 */
function isJobApplied(jobId) {
  const applied = loadAppliedJobs();
  return applied.some(a => a.jobId === jobId);
}

module.exports = {
  loadConfig,
  extractJobContacts,
  isEnglishJob,
  generateApplicationPackage,
  markAsApplied,
  isJobApplied,
  loadAppliedJobs,
  saveAppliedJobs
};
