// auto_applier.js - Motor Inteligente de Candidatura e Automação Anti-Ban
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'data', 'auto_apply_config.json');
const APPLIED_STORE_PATH = path.join(__dirname, 'data', 'applied_jobs.json');
const CONTACTED_AUTHORS_PATH = path.join(__dirname, 'data', 'contacted_authors.json');

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

function loadContactedAuthors() {
  try {
    if (fs.existsSync(CONTACTED_AUTHORS_PATH)) {
      return JSON.parse(fs.readFileSync(CONTACTED_AUTHORS_PATH, 'utf8'));
    }
  } catch (err) {}
  return [];
}

function saveContactedAuthors(list) {
  try {
    fs.writeFileSync(CONTACTED_AUTHORS_PATH, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {}
}

function addContactedAuthor(username) {
  if (!username) return;
  const clean = username.replace('@', '').toLowerCase().trim();
  const list = loadContactedAuthors();
  if (!list.includes(clean)) {
    list.push(clean);
    saveContactedAuthors(list);
  }
}

function isAuthorAlreadyContacted(username, igHandle = null) {
  const list = loadContactedAuthors();
  if (username) {
    const cleanUser = username.replace('@', '').toLowerCase().trim();
    if (list.includes(cleanUser)) return true;
  }
  if (igHandle) {
    const cleanIg = igHandle.replace('@', '').toLowerCase().trim();
    if (list.includes(cleanIg)) return true;
  }
  return false;
}

// Regex de rejeição estrita: desabafos de mercado, candidatos se oferecendo, permutas, cursos e estética
const GARBAGE_OR_RANT_REGEX = /\b(permuta|permutas|realizar\s+permuta|fazer\s+permuta|troco\s+servi[çc]o|em\s+troca\s+de|troco\s+por|pra\s+portf[oó]lio|para\s+portf[oó]lio|montar\s+(?:meu\s+)?portf[oó]lio|n[ãa]o\s+consigo\s+(?:vaga|emprego|trabalho|entrevista)|dif[íi]cil\s+(?:conseguir|arrumar|achar)\s+vaga|dificuldade\s+de\s+conseguir|mandei\s+(?:v[áa]rios|dezenas|centenas|\d+)\s+curr[íi]culos|n[ãa]o\s+recebo\s+(?:uma\s+)?liga[çc][ãa]o|ningu[ée]m\s+me\s+contrata|mercado\s+(?:de\s+trabalho\s+)?est[áa]\s+(?:foda|dif[íi]cil|imposs[íi]vel)|vagas?\s+arrombadas?|sal[áa]rio\s+de\s+(?:fome|est[áa]gio)|desabafo|todo\s+dia\s+vejo\s+vagas?\s+com\s+t[íi]tulo|por\s+que\s+(?:as\s+)?(?:empresas\s+|vagas\s+)?pedem|pedem\s+s[êe]nior\s+pagando|fui\s+(?:demitido|demitida|dispensado|dispensada)|estou\s+(?:desempregado|desempregada)|desvaloriza[çc][ãa]o\s+do\s+designer|n[ãa]o\s+fecho\s+nem\s+um\s+servi[çc]o|algu[ée]m\s+sabe\s+(?:de\s+)?(?:alguma\s+)?vaga|estou\s+procurando\s+(?:vaga|emprego)|sou\s+(?:designer|designer\s+gr[áa]fico|web\s+designer|ui[\s/-]?ux|motion\s+designer|ilustrador[a]?|social\s+media)|i(?:\'m| am)\s+(?:a\s+)?(?:professional\s+)?(?:graphic\s+)?designer|i\s+came\s+across\s+your\s+post|saw\s+your\s+post|vi\s+(?:seu\s+)?(?:post|publica[çc][ãa]o|an[uú]ncio)|open\s+to\s+(?:new\s+)?opportunities|available\s+for\s+(?:freelance|work|projects?|new\s+clients?)|open\s+for\s+(?:work|commissions?)|commissions\s+open|dispon[íi]vel\s+para\s+(?:freelas?|projetos?|trabalho)|hire\s+me|contrate-me|me\s+contrata|me\s+chama\s+no\s+(?:direct|pv|zap|whatsapp)|meu\s+portf[óo]lio\s*:|meu\s+behance|estou\s+(?:a|à)\s+procura\s+de\s+(?:professora?|clientes?|m[ée]dico|psic[óo]logo|advogado|parceir)|estou\s+abrindo\s+vagas\s+para\s+atender|abri\s+[12345]\s+vagas\s+para\s+(?:atender|clientes)|agenda\s+(?:aberta|de\s+(?:novembro|dezembro|janeiro)\s+aberta)|fa[çc]o\s+(?:artes|logos|posts|identidade\s+visual)|fa[çc]o\s+seu\s+(?:design|post|projeto)|crio\s+sua\s+logo|artes\s+por\s+r\$|pacote\s+de\s+artes|or[çc]amento\s+(?:sem\s+compromisso|via\s+dm|no\s+direct|no\s+pv)|are\s+you\s+(?:a\s+)?business\s+owner|voc[êe]\s+[ée]\s+(?:empres[áa]rio|empreendedor|dono\s+de\s+loja)|are\s+you\s+looking\s+for|voc[êe]\s+est[áa]\s+procurando|precisando\s+de\s+um\s+designer\s+para\s+seu|precisa\s+de\s+(?:um\s+)?designer\s+para\s+sua|looking\s+for\s+clients|aulas?\s+particulares|aula\s+individual|aulas?\s+on-?line\s+de\s+ingl[êe]s|curso\s+de\s+(?:ingl[êe]s|design|photoshop)|inscri[çc][õo]es\s+abertas\s+para\s+o\s+curso|nail\s+designer|lash\s+designer|sobrancelha|alongamento\s+de\s+unha|manicure|pedicure|pod[óo]log|cobertura\s+duplex|duplex\s+[aà]\s+venda|apartamento\s+[aà]\s+venda|imobili[áa]ria|corretor\s+de\s+im[óo]veis|interior\s+designer|designer\s+de\s+interiores|arquitet[oa]\s+de\s+interiores)\b|looking\s+for\s+(?:a\s+)?(?:graphic\s+)?designer\s*\?|procurando\s+(?:um\s+)?designer\s*\?|precisando\s+de\s+(?:um\s+)?designer\s*\?|ainda\s+tem\s+vaga\s*\?/i;

function isGarbageOrRant(text) {
  if (!text) return false;
  if (GARBAGE_OR_RANT_REGEX.test(text)) return true;
  if (/\?{2,}|!{3,}/.test(text)) return true;
  return false;
}

// Padrão estrito de contratação de designer
const DESIGN_HIRING_STRICT_REGEX = /\b(?:(?:procuro|procura-se|procurando|busco|buscando|buscamos|contrata-se|contrato|contratando|contratamos|preciso\s+de|precisa-se\s+(?:de\s+)?|precisando\s+(?:de\s+)?|seleciono|seleciona|selecionamos|estamos\s+contratando|estamos\s+com\s+vaga\s+(?:de|para)?|abrimos\s+vaga\s+(?:de|para)?|oportunidade\s+(?:de|para)?|vaga\s+(?:de|para)?)\s*[:|-]?\s*(?:um[a]?\s+|nov[oa]\s+|talentos?\s+|profissionais?\s+)?(?:senior\s+|sênior\s+|junior\s+|júnior\s+|pleno\s+|freela\s+|freelancer\s+|remot[oa]\s+)?(?:designer|design\s+gr[áa]fico|graphic\s+designer|brand\s+designer|visual\s+designer|ui[\s/-]?ux|web\s+designer|motion\s+designer|diretor\s+de\s+arte|diagramador|arte-finalista|social\s+media\s+designer|ilustrador[a]?)|(?:hiring|we[\x27\x60’]?re\s+hiring|looking\s+for|in\s+need\s+of|need|seeking)\s*[:|-]?\s*(?:a\s+|an\s+)?(?:remote\s+|senior\s+|junior\s+|lead\s+|freelance\s+|canva\s+)*(?:graphic\s+designer|designer|brand\s+designer|visual\s+designer|ui[\s/-]?ux\s+designer|web\s+designer|motion\s+designer|animator|art\s+director)|(?:vaga|job\s+opening|open\s+role)\s*[:|-]\s*(?:senior\s+|junior\s+|pleno\s+)?(?:designer|design\s+gr[áa]fico|graphic\s+designer|ui[\s/-]?ux|motion))\b/i;

function isStrictDesignHiring(job) {
  const text = (job.text || '').trim();
  if (!text || text.length < 25) return false;
  if (isGarbageOrRant(text)) return false;

  if (job.ocrText) {
    const ocrHasDesign = /\b(designer|design|arte|criativ[oa]s?|photoshop|illustrator|figma|motion|ui[\s/-]?ux)\b/i.test(job.ocrText);
    const ocrHasHiring = /\b(contrata|vaga|hiring|we(?:\'re|\s+are)\s+hiring|seleciona|oportunidade)\b/i.test(job.ocrText);
    if (ocrHasDesign && ocrHasHiring) return true;
  }

  return DESIGN_HIRING_STRICT_REGEX.test(text);
}

// Regex para detecção de e-mail no texto
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;

// Regex para detecção explícita de Instagram no texto (exige @ ou link instagram.com/)
const IG_HANDLE_REGEX = /(?:(?:ig\s*dm|direct\s*do\s*ig|instagram|insta|no\s+ig)\s*[:|-]?\s*@([a-zA-Z0-9._]{3,30})|instagram\.com\/([a-zA-Z0-9._]{3,30}))/i;

// Regex para verificar se o post exige pretensão salarial
const SALARY_PROMPT_REGEX = /\b(pretens[ãa]o|pretensao\s+salarial|sal[áa]rio\s+pretendido|quanto\s+cobra|proposta\s+salarial|faixa\s+salarial|salary\s+expectation|expected\s+salary|rate\s+per\s+hour|hourly\s+rate|monthly\s+rate|your\s+rate|send\s+your\s+rate|budget\s+expectation)\b/i;

function extractJobContacts(job) {
  const text = `${job.text || ''} ${job.ocrText || ''}`.trim();
  
  const emailMatches = text.match(EMAIL_REGEX) || [];
  const validEmails = emailMatches.filter(e => !e.includes('threads') && !e.includes('example.com'));
  const primaryEmail = validEmails[0] || null;

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

  let igHandle = null;
  let hasExplicitInstagram = false;
  const igMatch = text.match(IG_HANDLE_REGEX);
  const rawIg = igMatch && (igMatch[1] || igMatch[2]);
  if (rawIg) {
    igHandle = rawIg.replace('@', '').trim();
    hasExplicitInstagram = true;
  }

  const authorUsername = job.author?.username || 'anunciante';

  return {
    primaryEmail,
    allEmails: validEmails,
    primaryPhone,
    phoneDigits,
    igHandle,
    hasExplicitInstagram,
    authorUsername,
    authorFullName: job.author?.fullName || authorUsername
  };
}

function isEnglishJob(job) {
  if (job.isInternational) return true;
  const text = `${job.text || ''} ${job.ocrText || ''}`.toLowerCase();
  const enMatches = text.match(/\b(we['’]?re\s+hiring|hiring|remote|senior|junior|looking\s+for|graphic\s+designer|full[- ]time|part[- ]time|send\s+your|apply|portfolio|experience|requirements)\b/g) || [];
  const ptMatches = text.match(/\b(vaga|contratando|estamos\s+contratando|designer\s+gr[áa]fico|remoto|freela|curr[íi]culo|portf[óo]lio|enviar|requisitos|experi[êe]ncia)\b/g) || [];
  return enMatches.length > ptMatches.length;
}

function injectSalaryIfNeeded(body, isEn, salaryText) {
  if (isEn) {
    if (body.includes('Thank you for your time')) {
      return body.replace('Thank you for your time', `${salaryText}\n\nThank you for your time`);
    }
    if (body.includes('Hope we can chat!')) {
      return body.replace('Hope we can chat!', `${salaryText}\n\nHope we can chat!`);
    }
  } else {
    if (body.includes('Desde já, agradeço')) {
      return body.replace('Desde já, agradeço', `${salaryText}\n\nDesde já, agradeço`);
    }
    if (body.includes('Se fizer sentido')) {
      return body.replace('Se fizer sentido', `${salaryText}\n\nSe fizer sentido`);
    }
  }
  return `${body}\n\n${salaryText}`;
}

function generateApplicationPackage(job, customConfig = null) {
  const config = customConfig || loadConfig();
  const contacts = extractJobContacts(job);
  const isEn = isEnglishJob(job);

  let primaryChannel = 'threads';
  if (contacts.primaryEmail) {
    primaryChannel = 'email';
  } else if (contacts.primaryPhone) {
    primaryChannel = 'whatsapp';
  } else if (contacts.hasExplicitInstagram) {
    primaryChannel = 'both_threads_and_ig';
  }

  const useEmailTemplate = primaryChannel === 'email' && config.emailTemplates;
  const templateSet = useEmailTemplate ? config.emailTemplates : config.templates;
  const templateConfig = isEn ? templateSet.en : templateSet.pt;
  const salaryConfig = isEn ? config.salary.international : config.salary.br;

  const text = `${job.text || ''} ${job.ocrText || ''}`;
  const asksForSalary = SALARY_PROMPT_REGEX.test(text);

  let finalBody = templateConfig.body;
  let subject = templateConfig.subject;

  if (asksForSalary) {
    finalBody = injectSalaryIfNeeded(finalBody, isEn, salaryConfig.text);
  }

  const senderEmail = config.candidate?.email || 'endriodscontato@gmail.com';
  let gmailUrl = null;
  let mailtoUrl = null;
  if (contacts.primaryEmail) {
    gmailUrl = `https://mail.google.com/mail/?authuser=${encodeURIComponent(senderEmail)}&view=cm&fs=1&to=${encodeURIComponent(contacts.primaryEmail)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(finalBody)}`;
    mailtoUrl = `mailto:${encodeURIComponent(contacts.primaryEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(finalBody)}`;
  }

  let whatsappUrl = null;
  if (contacts.phoneDigits) {
    whatsappUrl = `https://wa.me/${contacts.phoneDigits}?text=${encodeURIComponent(finalBody)}`;
  }

  const threadsDmUrl = `https://www.threads.com/@${contacts.authorUsername}`;
  const instagramDmUrl = contacts.igHandle ? `https://ig.me/m/${contacts.igHandle}` : null;
  const instagramProfileUrl = contacts.igHandle ? `https://instagram.com/${contacts.igHandle}` : null;

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

function markAsApplied(jobId, channel, notes = '', authorUsername = null, igHandle = null) {
  const applied = loadAppliedJobs();
  const exists = applied.find(a => a.jobId === jobId);
  if (!exists) {
    applied.push({
      jobId,
      channel,
      authorUsername,
      igHandle,
      appliedAt: Date.now(),
      appliedAtISO: new Date().toISOString(),
      notes
    });
    saveAppliedJobs(applied);
  }

  // Registra no banco de autores contatados para evitar duplicatas futuras
  if (authorUsername) addContactedAuthor(authorUsername);
  if (igHandle) addContactedAuthor(igHandle);
}

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
  saveAppliedJobs,
  isStrictDesignHiring,
  loadContactedAuthors,
  addContactedAuthor,
  isAuthorAlreadyContacted
};
