const state = {
  currentUser: null, // Usuário autenticado
  authToken: localStorage.getItem('threads_auth_token_v1') || null,
  allJobs: [],
  savedJobsMap: new Map(),
  dismissedJobsMap: new Map(), // Vagas excluídas pelo usuário
  activeTopic: 'todos', // mantido para compatibilidade
  selectedTopics: new Set(), // Conjunto de tópicos ativos para multi-seleção
  activeTab: 'all', // 'all' | 'rj_quick' | 'saved' | 'dismissed'
  quickSearch: '',
  sortBy: 'recent',
  maxAgeDays: 0
};

// Sincroniza dados salvos e excluídos com o servidor na conta do usuário
async function syncUserDataWithServer() {
  if (!state.authToken) return;
  try {
    await fetch('/api/user/sync-jobs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.authToken}`
      },
      body: JSON.stringify({
        savedJobs: Array.from(state.savedJobsMap.values()),
        dismissedJobs: Array.from(state.dismissedJobsMap.values())
      })
    });
  } catch (err) {
    console.error('Erro na sincronização com servidor:', err);
  }
}

function loadSavedJobs() {
  // Se usuário tem dados no perfil retornado pelo servidor, preenche
  if (state.currentUser) {
    if (Array.isArray(state.currentUser.savedJobs)) {
      state.currentUser.savedJobs.forEach(job => state.savedJobsMap.set(job.id, job));
    }
    if (Array.isArray(state.currentUser.dismissedJobs)) {
      state.currentUser.dismissedJobs.forEach(job => state.dismissedJobsMap.set(job.id, job));
    }
  } else {
    try {
      const raw = localStorage.getItem('threads_saved_jobs_v1');
      if (raw) {
        const arr = JSON.parse(raw);
        arr.forEach(job => state.savedJobsMap.set(job.id, job));
      }
    } catch (e) {
      console.error('Erro ao carregar vagas salvas:', e);
    }

    try {
      const rawDismissed = localStorage.getItem('threads_dismissed_jobs_v1');
      if (rawDismissed) {
        const arrD = JSON.parse(rawDismissed);
        arrD.forEach(job => state.dismissedJobsMap.set(job.id, job));
      }
    } catch (e) {
      console.error('Erro ao carregar vagas excluídas:', e);
    }
  }

  updateSavedCounters();
}

function persistSavedJobs() {
  try {
    const arr = Array.from(state.savedJobsMap.values());
    localStorage.setItem('threads_saved_jobs_v1', JSON.stringify(arr));
  } catch (e) {
    console.error('Erro ao salvar vaga:', e);
  }
  updateSavedCounters();
  syncUserDataWithServer();
}

function formatPhoneDigits(digits) {
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  } else if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return digits;
}

function extractWhatsAppInfo(text, isRJ = true) {
  if (!text) return null;
  const waLinkMatch = text.match(/(?:https?:\/\/)?(?:api\.)?whatsapp\.com\/send\?phone=([0-9]+)|(?:https?:\/\/)?wa\.me\/([0-9]+)/i);
  if (waLinkMatch) {
    const rawDigits = (waLinkMatch[1] || waLinkMatch[2] || '').replace(/\D/g, '');
    if (rawDigits.length >= 10) {
      const cleanDigits = rawDigits.startsWith('55') ? rawDigits : `55${rawDigits}`;
      return {
        cleanDigits,
        display: formatPhoneDigits(cleanDigits.slice(2)),
        url: `https://wa.me/${cleanDigits}`
      };
    }
  }

  const patterns = [
    /(?:whats(?:app)?|zap|wpp|contato|celular|telefone|tel|cv|curr[ií]culo)\D{0,35}(?:\+?55\s*)?(?:\(?([1-9][0-9])\)?\s*[-.]?\s*)?(9\s*[0-9]{4}\s*[-.]?\s*[0-9]{4}|[2-8][0-9]{3}\s*[-.]?\s*[0-9]{4})/i,
    /(?:\+?55\s*)?(?:\(?([1-9][0-9])\)?\s*[-.]?\s*)(9\s*[0-9]{4}\s*[-.]?\s*[0-9]{4}|[2-8][0-9]{3}\s*[-.]?\s*[0-9]{4})/i,
    /(?:\b|\D)(?:55)?([1-9][0-9])[-.\s]?(9[0-9]{8}|9[0-9]{4}[-.\s][0-9]{4})\b/i
  ];

  for (const regex of patterns) {
    const match = text.match(regex);
    if (match) {
      let digits = match[0].replace(/\D/g, '');
      if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
        return {
          cleanDigits: digits,
          display: formatPhoneDigits(digits.slice(2)),
          url: `https://wa.me/${digits}`
        };
      }
      if (digits.length === 10 || digits.length === 11) {
        return {
          cleanDigits: `55${digits}`,
          display: formatPhoneDigits(digits),
          url: `https://wa.me/55${digits}`
        };
      }
      if ((digits.length === 9 || digits.length === 8) && isRJ) {
        return {
          cleanDigits: `5521${digits}`,
          display: `(21) ${formatPhoneDigits(digits)}`,
          url: `https://wa.me/5521${digits}`
        };
      }
    }
  }
  return null;
}

function persistDismissedJobs() {
  try {
    const arr = Array.from(state.dismissedJobsMap.values());
    localStorage.setItem('threads_dismissed_jobs_v1', JSON.stringify(arr));
  } catch (e) {
    console.error('Erro ao salvar vagas excluídas:', e);
  }
  updateSavedCounters();
  syncUserDataWithServer();
}

function updateSavedCounters() {
  const countSaved = state.savedJobsMap.size;
  const countDismissed = state.dismissedJobsMap.size;
  const badge1 = document.getElementById('savedCountBadge');
  const badge2 = document.getElementById('savedTabCount');
  const badgeD = document.getElementById('dismissedTabCount');
  if (badge1) badge1.textContent = countSaved;
  if (badge2) badge2.textContent = countSaved;
  if (badgeD) badgeD.textContent = countDismissed;
}

function formatRelativeDate(unixSeconds) {
  const nowSec = Math.floor(Date.now() / 1000);
  const diff = Math.max(0, nowSec - unixSeconds);
  const dateObj = new Date(unixSeconds * 1000);
  const formattedDate = dateObj.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  if (diff < 3600) return `há ${Math.max(1, Math.floor(diff / 60))} min • ${formattedDate}`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h • ${formattedDate}`;
  const days = Math.floor(diff / 86400);
  if (days <= 30) return `há ${days}d • ${formattedDate}`;
  return formattedDate;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function highlightKeywords(text) {
  let safe = escapeHtml(text);
  const customInput = document.getElementById('customKeywords').value;
  const highlights = [
    'belford roxo', 'nova iguaçu', 'duque de caxias', 'caxias', 'baixada',
    'madureira', 'pavuna', 'centro', 'rio de janeiro', 'rj', 'clt',
    'auxiliar', 'assistente', 'recepcionista', 'atendente', 'produção',
    'mercado', 'escritório', 'designer', 'graphic designer', 'remoto', 'remote'
  ];

  if (customInput.trim()) {
    customInput
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .forEach(k => highlights.push(k));
  }

  for (const word of highlights) {
    if (word.length < 2) continue;
    const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedWord})`, 'gi');
    safe = safe.replace(regex, '<mark>$1</mark>');
  }
  return safe;
}

function updateKPIs(jobs) {
  document.getElementById('kpiTotal').textContent = jobs.length;
  document.getElementById('totalCountBadge').textContent = jobs.length;

  const rjCount = jobs.filter(j => j.proximity?.isRJ).length;
  const designCount = jobs.filter(j => j.hasDesignContext).length;
  const verifiedCount = jobs.filter(j => (j.verification?.authenticityScore || 0) >= 75).length;

  document.getElementById('rjCountBadge').textContent = rjCount;
  document.getElementById('kpiRJ').textContent = rjCount;
  document.getElementById('kpiDesign').textContent = designCount;
  document.getElementById('kpiVerified').textContent = verifiedCount;
}

function renderJobs() {
  const grid = document.getElementById('jobsGrid');
  let sourceList = [];

  if (state.activeTab === 'saved') {
    // Na aba de salvas, mostra todas as que o usuário salvou
    sourceList = Array.from(state.savedJobsMap.values());
  } else if (state.activeTab === 'dismissed') {
    // Na aba de excluídas, mostra o histórico de vagas que o usuário descartou
    sourceList = Array.from(state.dismissedJobsMap.values());
  } else if (state.activeTab === 'rj_quick') {
    // Na pesquisa de novas vagas: OCULTA AS SALVAS E OCULTA AS EXCLUÍDAS!
    sourceList = state.allJobs.filter(j =>
      j.proximity?.isRJ &&
      !state.savedJobsMap.has(j.id) &&
      !state.dismissedJobsMap.has(j.id)
    );
  } else {
    // Na listagem geral / tópicos: OCULTA AS SALVAS E OCULTA AS EXCLUÍDAS!
    sourceList = state.allJobs.filter(j =>
      !state.savedJobsMap.has(j.id) &&
      !state.dismissedJobsMap.has(j.id)
    );
  }

  // Filtro por idade máxima (ex: Até 4 dias atrás)
  if (state.maxAgeDays > 0) {
    sourceList = sourceList.filter(j => (j.ageDays || 0) <= state.maxAgeDays);
  }

  // Filtro rápido por texto na barra superior
  if (state.quickSearch.trim()) {
    const q = state.quickSearch.toLowerCase().trim();
    sourceList = sourceList.filter(j =>
      j.text.toLowerCase().includes(q) ||
      j.author.username.toLowerCase().includes(q) ||
      (j.proximity?.zone || '').toLowerCase().includes(q) ||
      (j.proximity?.matchedPlace || '').toLowerCase().includes(q) ||
      j.areas.some(a => a.toLowerCase().includes(q)) ||
      j.tools.some(t => t.toLowerCase().includes(q))
    );
  }

  // Ordenação
  if (state.sortBy === 'proximity') {
    sourceList.sort((a, b) =>
      (a.proximity?.tier ?? 99) - (b.proximity?.tier ?? 99) ||
      b.takenAt - a.takenAt
    );
  } else if (state.sortBy === 'recent') {
    sourceList.sort((a, b) => b.takenAt - a.takenAt);
  } else if (state.sortBy === 'trust') {
    sourceList.sort((a, b) =>
      (b.verification?.authenticityScore || 0) - (a.verification?.authenticityScore || 0) ||
      b.takenAt - a.takenAt
    );
  } else if (state.sortBy === 'score') {
    sourceList.sort((a, b) => b.matchScore - a.matchScore || b.takenAt - a.takenAt);
  } else if (state.sortBy === 'salary') {
    sourceList.sort((a, b) => {
      const hasSalA = a.salary ? 1 : 0;
      const hasSalB = b.salary ? 1 : 0;
      return hasSalB - hasSalA || b.takenAt - a.takenAt;
    });
  }

  if (sourceList.length === 0) {
    let emptyMsg = 'Tente trocar o tópico na barra superior ou suavizar os filtros ao lado.';
    if (state.activeTab === 'saved') {
      emptyMsg = 'Você ainda não salvou nenhuma vaga. Ao clicar em "☆ Salvar" em qualquer vaga, ela virá para cá e sairá da lista principal para não te confundir!';
    } else if (state.activeTab === 'dismissed') {
      emptyMsg = 'Você ainda não excluiu nenhuma vaga. Ao clicar em "🗑️ Excluir", ela é removida da pesquisa e guardada aqui.';
    } else if (state.maxAgeDays > 0) {
      emptyMsg = `Não encontramos publicações nos últimos ${state.maxAgeDays} dias para este tópico. Mude o seletor de data para "Qualquer data" ou escolha outro tópico na barra superior.`;
    }

    grid.innerHTML = `
      <div class="loading-box">
        <h3>Nenhuma vaga encontrada nesta visualização</h3>
        <p>${emptyMsg}</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = sourceList.map(job => {
    const isSaved = state.savedJobsMap.has(job.id);
    const initials = (job.author.username || 'TD').slice(0, 2).toUpperCase();
    const waInfo = job.whatsapp || extractWhatsAppInfo(job.text, job.proximity?.isRJ);
    const ver = job.verification || {
      authenticityScore: 70,
      trustLevel: 'Média',
      trustBadge: '🟡 Vaga Provável',
      reasons: [],
      warnings: []
    };

    const waBadge = waInfo
      ? `<span class="tag tag-whatsapp" title="WhatsApp disponível para candidatura">📱 WhatsApp (${escapeHtml(waInfo.display)})</span>`
      : '';

    const proximityBadge = job.proximity?.isRJ
      ? `<span class="tag tag-proximity" title="${escapeHtml(job.proximity.zone)} (${escapeHtml(job.proximity.matchedPlace || 'RJ')})">${escapeHtml(job.proximity.badge)}</span>`
      : '';

    const originBadge = job.isInternational
      ? `<span class="tag tag-intl">🌎 Estrangeira / Intl</span>`
      : `<span class="tag tag-br">🇧🇷 Brasil</span>`;

    const modalityBadges = job.modalities
      .map(m => `<span class="tag tag-remote">🏠 ${escapeHtml(m)}</span>`)
      .join('');

    const contractBadges = job.contracts
      .map(c => `<span class="tag tag-contract">💼 ${escapeHtml(c)}</span>`)
      .join('');

    const areaBadges = job.areas
      .map(a => `<span class="tag tag-area">🏷️ ${escapeHtml(a)}</span>`)
      .join('');

    const salaryBadge = job.salary
      ? `<span class="tag tag-salary">💰 ${escapeHtml(job.salary)}</span>`
      : '';

    const seniorityBadge = job.seniority
      ? `<span class="tag tag-tool">🎯 ${escapeHtml(job.seniority)}</span>`
      : '';

    const toolBadges = job.tools
      .map(t => `<span class="tag tag-tool">✓ ${escapeHtml(t)}</span>`)
      .join('');

    const reasonsHtml = (ver.reasons || [])
      .map(r => `<span class="auth-reason-item">✓ ${escapeHtml(r)}</span>`)
      .join('');

    const warningsHtml = (ver.warnings || [])
      .map(w => `<span class="auth-warning-item">⚠ ${escapeHtml(w)}</span>`)
      .join('');

    return `
      <article class="job-card" data-id="${escapeHtml(job.id)}">
        <div class="job-card-header">
          <div class="author-box">
            <div class="author-avatar">${initials}</div>
            <div>
              <a href="${escapeHtml(job.author.profileUrl)}" target="_blank" rel="noopener noreferrer" class="author-handle">
                @${escapeHtml(job.author.username)} ${job.author.isVerified ? '☑️' : ''}
              </a>
              <div class="post-meta">
                ${formatRelativeDate(job.takenAt)}
                ${job.proximity?.isRJ ? ` • <strong>${escapeHtml(job.proximity.zone)}</strong>` : ''}
              </div>
            </div>
          </div>

          <div class="header-badges">
            <div class="trust-pill trust-${escapeHtml(ver.trustLevel)}" title="Índice de Veracidade da Vaga">
              ${escapeHtml(ver.trustBadge)} (${ver.authenticityScore}%)
            </div>
            <div class="score-pill" title="Grau de compatibilidade com os seus filtros e localização">
              ${job.matchScore}% Match
            </div>
          </div>
        </div>

        <div class="tags-row">
          ${waBadge}
          ${proximityBadge}
          ${originBadge}
          ${salaryBadge}
          ${contractBadges}
          ${modalityBadges}
          ${areaBadges}
          ${seniorityBadge}
          ${toolBadges}
        </div>

        <div class="job-text">${highlightKeywords(job.text)}</div>

        <div class="authenticity-box">
          <strong>Verificador de Vaga Real:</strong>
          <div class="auth-reasons" id="authStatus-${escapeHtml(job.code)}">
            ${reasonsHtml || '<span>Anúncio público capturado no feed de oportunidades</span>'}
            ${warningsHtml}
          </div>
        </div>

        <div class="job-footer">
          <div class="footer-left">
            ❤️ ${job.likeCount || 0} curtidas • ID: <code>${escapeHtml(job.code)}</code>
          </div>
          <div class="footer-actions">
            <button type="button" class="btn-check-live" data-verify-code="${escapeHtml(job.code)}">
              🔍 Testar se Post Está Ativo
            </button>
            <button type="button" class="btn-save ${isSaved ? 'saved' : ''}" data-save-id="${escapeHtml(job.id)}">
              ${isSaved ? '★ Salva' : '☆ Salvar'}
            </button>
            ${state.activeTab === 'dismissed' ? `
              <button type="button" class="btn-restore" data-restore-id="${escapeHtml(job.id)}" title="Restaurar para a pesquisa principal">
                ↺ Restaurar Vaga
              </button>
            ` : `
              <button type="button" class="btn-dismiss" data-dismiss-id="${escapeHtml(job.id)}" title="Remover e não exibir mais nesta lista">
                🗑️ Excluir
              </button>
            `}
            ${waInfo ? `
              <a href="https://wa.me/${waInfo.cleanDigits}?text=${encodeURIComponent('Olá! Vi o anúncio da vaga no Threads e gostaria de me candidatar.')}"
                 target="_blank"
                 rel="noopener noreferrer"
                 class="btn-whatsapp"
                 title="Chamar no WhatsApp: ${escapeHtml(waInfo.display)}">
                <svg class="wa-icon" viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
                  <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.598 2.664-.698c.997.544 1.849.813 2.796.813 3.183 0 5.767-2.586 5.768-5.766 0-3.18-2.585-5.766-5.768-5.766zm9.965 5.765c0 5.518-4.484 10.001-10.001 10.001-1.745 0-3.39-.452-4.832-1.246l-5.663 1.484 1.516-5.529c-.89-1.493-1.4-3.239-1.4-5.093 0-5.517 4.483-10 10-10 5.517 0 10 4.483 10 10z"/>
                </svg>
                <span>Chamar no Whats</span>
              </a>
            ` : ''}
            <a href="${escapeHtml(job.url)}" target="_blank" rel="noopener noreferrer" class="btn-open-threads">
              Abrir no Threads ↗
            </a>
          </div>
        </div>
      </article>
    `;
  }).join('');

  grid.querySelectorAll('[data-save-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-save-id');
      const jobObj = state.allJobs.find(j => j.id === id) || state.savedJobsMap.get(id);
      if (!jobObj) return;

      if (state.savedJobsMap.has(id)) {
        // Desmarcou da lista de salvas
        state.savedJobsMap.delete(id);
      } else {
        // Salvou a vaga! Automaticamente sai das excluídas (se estivesse lá)
        state.savedJobsMap.set(id, jobObj);
        state.dismissedJobsMap.delete(id);
        persistDismissedJobs();
      }
      persistSavedJobs();
      renderJobs();
    });
  });

  // Evento do botão Excluir Vaga
  grid.querySelectorAll('[data-dismiss-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-dismiss-id');
      const jobObj = state.allJobs.find(j => j.id === id) || state.savedJobsMap.get(id);
      if (!jobObj) return;

      // Adiciona na lista de excluídas e remove de salvas (se estava lá)
      state.dismissedJobsMap.set(id, jobObj);
      state.savedJobsMap.delete(id);
      persistDismissedJobs();
      persistSavedJobs();
      renderJobs();
    });
  });

  // Evento do botão Restaurar Vaga
  grid.querySelectorAll('[data-restore-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-restore-id');
      state.dismissedJobsMap.delete(id);
      persistDismissedJobs();
      renderJobs();
    });
  });

  grid.querySelectorAll('[data-verify-code]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const code = btn.getAttribute('data-verify-code');
      const statusBox = document.getElementById(`authStatus-${code}`);
      btn.disabled = true;
      btn.textContent = 'Verificando...';
      try {
        const res = await fetch(`/api/verify/${encodeURIComponent(code)}`);
        const data = await res.json();
        if (data.isLive) {
          btn.textContent = '✅ Post Ativo no Threads';
          if (statusBox) {
            statusBox.insertAdjacentHTML(
              'beforeend',
              `<span class="auth-reason-item">✓ Confirmado ao vivo: vaga segue publicada e aberta</span>`
            );
          }
        } else {
          btn.textContent = '❌ Post Removido/Indisponível';
        }
      } catch (e) {
        btn.textContent = 'Erro ao verificar';
        btn.disabled = false;
      }
    });
  });
}

async function performSearch(forceRefresh = false) {
  const loadingState = document.getElementById('loadingState');
  const grid = document.getElementById('jobsGrid');
  const statsText = document.getElementById('statsText');
  const searchBtn = document.getElementById('searchBtn');
  const searchBtnText = document.getElementById('searchBtnText');

  loadingState.classList.remove('hidden');
  grid.innerHTML = '';
  searchBtn.disabled = true;
  searchBtnText.textContent = 'Varrendo Threads...';
  statsText.textContent = 'Buscando vagas reais por tópico e proximidade de Belford Roxo...';

  const payload = {
    topic: state.selectedTopics.size === 0 ? 'todos' : Array.from(state.selectedTopics)[0],
    topics: Array.from(state.selectedTopics),
    remoto: document.getElementById('filterRemoto').checked,
    freelance: document.getElementById('filterFreelance').checked,
    fixo: document.getElementById('filterFixo').checked,
    includeBrasil: document.getElementById('filterBrasil').checked,
    includeGringa: document.getElementById('filterGringa').checked,
    nearBelfordRoxo: document.getElementById('filterNearBelfordRoxo').checked,
    onlyVerifiedReal: document.getElementById('onlyVerifiedToggle').checked,
    customKeywords: document.getElementById('customKeywords').value,
    excludeWords: document.getElementById('excludeWords').value,
    onlyHiring: document.getElementById('onlyHiringToggle').checked,
    forceRefresh
  };

  try {
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (!data.success) {
      throw new Error(data.error || 'Erro desconhecido na busca');
    }

    state.allJobs = data.jobs || [];
    updateKPIs(state.allJobs);
    statsText.textContent = `${data.totalMatched} vagas reais neste tópico (de ${data.totalScanned} posts varridos)`;
    renderJobs();
  } catch (err) {
    console.error(err);
    statsText.textContent = 'Erro ao conectar com o buscador';
    grid.innerHTML = `
      <div class="loading-box">
        <h3>Não foi possível concluir a busca</h3>
        <p>${escapeHtml(err.message)}</p>
      </div>
    `;
  } finally {
    loadingState.classList.add('hidden');
    searchBtn.disabled = false;
    searchBtnText.textContent = 'Atualizar Radar de Vagas';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadSavedJobs();

  // Mapeamento amigável de nomes dos tópicos
  const topicLabels = {
    'todos': 'Todas as Vagas',
    'rj_clt': 'Geral Rio & Belford Roxo',
    'mercado_comercio': 'Mercado & Comércio',
    'producao_logistica': 'Aux. Produção & Logística',
    'escritorio_adm': 'Escritório & Recepção',
    'design': 'Design Gráfico (BR)',
    'gringa': 'Design Gringa (USD)'
  };

  const CLT_TOPICS = ['rj_clt', 'mercado_comercio', 'producao_logistica', 'escritorio_adm'];
  const DESIGN_TOPICS = ['design', 'gringa'];

  // Atualiza crachás, contadores e estilos visuais com base no estado de multi-seleção
  const syncToolbarUI = () => {
    const selected = state.selectedTopics;
    const btnAll = document.getElementById('btnAllJobs');

    // Botão 'Todas as Vagas' fica ativo se nada específico estiver marcado
    if (btnAll) {
      btnAll.classList.toggle('active', selected.size === 0);
    }

    // Atualiza checkboxes de CLT
    let cltCount = 0;
    document.querySelectorAll('.clt-checkbox').forEach(cb => {
      const isChecked = selected.has(cb.value);
      cb.checked = isChecked;
      cb.closest('.dropdown-check-item')?.classList.toggle('selected', isChecked);
      if (isChecked) cltCount++;
    });

    const badgeClt = document.getElementById('badgeCltCount');
    if (badgeClt) {
      badgeClt.textContent = cltCount === 0 ? '0 selecionados' : (cltCount === CLT_TOPICS.length ? 'Todos CLT' : `${cltCount} ativos`);
    }
    const dropClt = document.getElementById('dropdownClt');
    if (dropClt) dropClt.classList.toggle('active-parent', cltCount > 0);

    // Atualiza checkboxes de Design
    let designCount = 0;
    document.querySelectorAll('.design-checkbox').forEach(cb => {
      const isChecked = selected.has(cb.value);
      cb.checked = isChecked;
      cb.closest('.dropdown-check-item')?.classList.toggle('selected', isChecked);
      if (isChecked) designCount++;
    });

    const badgeDesign = document.getElementById('badgeDesignCount');
    if (badgeDesign) {
      badgeDesign.textContent = designCount === 0 ? '0 selecionados' : (designCount === DESIGN_TOPICS.length ? 'Todos Design' : `${designCount} ativos`);
    }
    const dropDesign = document.getElementById('dropdownDesign');
    if (dropDesign) dropDesign.classList.toggle('active-parent', designCount > 0);

    // Atualiza texto explicativo 'Visualizando:'
    const labelEl = document.getElementById('currentTopicLabel');
    if (labelEl) {
      if (selected.size === 0) {
        labelEl.textContent = 'Todas as Vagas';
      } else {
        const names = Array.from(selected).map(t => topicLabels[t] || t);
        if (names.length <= 2) {
          labelEl.textContent = names.join(' + ');
        } else {
          labelEl.textContent = `${names.slice(0, 2).join(', ')} (+${names.length - 2})`;
        }
      }
    }

    // Se tem tópicos CLT selecionados, prioriza proximidade de Belford Roxo
    const hasRJ = Array.from(selected).some(t => CLT_TOPICS.includes(t));
    if (hasRJ) {
      state.sortBy = 'proximity';
      const sortSelect = document.getElementById('sortSelect');
      if (sortSelect) sortSelect.value = 'proximity';
    }

    performSearch(false);
  };

  // Botão 1: Todas as Vagas (Limpa seleções e mostra tudo)
  const btnAll = document.getElementById('btnAllJobs');
  if (btnAll) {
    btnAll.addEventListener('click', () => {
      state.selectedTopics.clear();
      // Fecha qualquer dropdown aberto
      document.querySelectorAll('.topic-dropdown').forEach(d => {
        d.classList.remove('open');
        d.querySelector('.topic-dropdown-trigger')?.setAttribute('aria-expanded', 'false');
      });
      syncToolbarUI();
    });
  }

  // Interatividade completa dos itens com resposta tátil instantânea
  document.querySelectorAll('.dropdown-check-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const cb = item.querySelector('input[type="checkbox"]');
      if (!cb) return;
      if (e.target !== cb) {
        cb.checked = !cb.checked;
      }
      if (cb.checked) {
        state.selectedTopics.add(cb.value);
      } else {
        state.selectedTopics.delete(cb.value);
      }
      syncToolbarUI();
    });
  });

  // Botão 'Selecionar Todos CLT'
  const btnSelectAllClt = document.getElementById('btnSelectAllClt');
  if (btnSelectAllClt) {
    btnSelectAllClt.addEventListener('click', (e) => {
      e.stopPropagation();
      CLT_TOPICS.forEach(t => state.selectedTopics.add(t));
      syncToolbarUI();
    });
  }

  // Botão 'Limpar CLT'
  const btnClearClt = document.getElementById('btnClearClt');
  if (btnClearClt) {
    btnClearClt.addEventListener('click', (e) => {
      e.stopPropagation();
      CLT_TOPICS.forEach(t => state.selectedTopics.delete(t));
      syncToolbarUI();
    });
  }

  // Botão 'Selecionar Todos Design' (Brasil + Gringa juntos)
  const btnSelectAllDesign = document.getElementById('btnSelectAllDesign');
  if (btnSelectAllDesign) {
    btnSelectAllDesign.addEventListener('click', (e) => {
      e.stopPropagation();
      DESIGN_TOPICS.forEach(t => state.selectedTopics.add(t));
      syncToolbarUI();
    });
  }

  // Botão 'Limpar Design'
  const btnClearDesign = document.getElementById('btnClearDesign');
  if (btnClearDesign) {
    btnClearDesign.addEventListener('click', (e) => {
      e.stopPropagation();
      DESIGN_TOPICS.forEach(t => state.selectedTopics.delete(t));
      syncToolbarUI();
    });
  }

  // Controle inteligente de Bottom Sheet / Dropdown
  const sheetBackdrop = document.getElementById('sheetBackdrop');

  const closeAllDropdowns = () => {
    document.querySelectorAll('.topic-dropdown').forEach(d => {
      d.classList.remove('open');
      d.querySelector('.topic-dropdown-trigger')?.setAttribute('aria-expanded', 'false');
    });
    if (sheetBackdrop) sheetBackdrop.classList.remove('active');
    document.body.classList.remove('sheet-open');
  };

  const openDropdown = (dropdown, trigger) => {
    const isAlreadyOpen = dropdown.classList.contains('open');
    closeAllDropdowns();
    if (!isAlreadyOpen) {
      dropdown.classList.add('open');
      trigger.setAttribute('aria-expanded', 'true');
      if (sheetBackdrop) sheetBackdrop.classList.add('active');
      document.body.classList.add('sheet-open');
    }
  };

  const setupDropdown = (dropdownId, triggerId) => {
    const dropdown = document.getElementById(dropdownId);
    const trigger = document.getElementById(triggerId);
    if (!dropdown || !trigger) return;

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      openDropdown(dropdown, trigger);
    });
  };

  setupDropdown('dropdownClt', 'btnTriggerClt');
  setupDropdown('dropdownDesign', 'btnTriggerDesign');

  // Botões de Fechar e Concluir nos menus
  ['btnCloseClt', 'btnApplyClt', 'btnCloseDesign', 'btnApplyDesign'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeAllDropdowns();
      });
    }
  });

  // Tocar no backdrop fecha o bottom sheet
  if (sheetBackdrop) {
    sheetBackdrop.addEventListener('click', closeAllDropdowns);
  }

  // Fecha dropdowns se clicar fora na página (Desktop)
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.topic-dropdown') && !e.target.closest('.topic-dropdown-menu')) {
      closeAllDropdowns();
    }
  });

  // Toggle do painel de filtros no celular/mobile
  const btnToggleFiltersMobile = document.getElementById('btnToggleFiltersMobile');
  const filtersPanel = document.getElementById('filtersPanel');
  const toggleFiltersArrow = document.getElementById('toggleFiltersArrow');
  if (btnToggleFiltersMobile && filtersPanel) {
    btnToggleFiltersMobile.addEventListener('click', () => {
      const isOpen = filtersPanel.classList.toggle('open');
      btnToggleFiltersMobile.classList.toggle('active', isOpen);
      btnToggleFiltersMobile.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      if (toggleFiltersArrow) {
        toggleFiltersArrow.textContent = isOpen ? '▴' : '▾';
      }
    });
  }

  document.getElementById('searchForm').addEventListener('submit', e => {
    e.preventDefault();
    if (state.activeTab === 'saved') {
      state.activeTab = 'all';
      document.getElementById('tabAllBtn').classList.add('active');
      document.getElementById('tabSavedSwitchBtn').classList.remove('active');
    }
    performSearch(false);
  });

  document.getElementById('resetFiltersBtn').addEventListener('click', () => {
    document.getElementById('filterNearBelfordRoxo').checked = true;
    document.getElementById('filterBrasil').checked = true;
    document.getElementById('filterGringa').checked = true;
    document.getElementById('filterRemoto').checked = true;
    document.getElementById('filterFreelance').checked = true;
    document.getElementById('filterFixo').checked = true;
    document.getElementById('customKeywords').value = '';
    document.getElementById('excludeWords').value = '';
    document.getElementById('onlyHiringToggle').checked = true;
    document.getElementById('onlyVerifiedToggle').checked = false;
    document.getElementById('maxAgeSelect').value = '0';
    state.maxAgeDays = 0;
    state.activeTopic = 'todos';
    document.querySelectorAll('#topicsToolbar .topic-chip').forEach(c => {
      c.classList.toggle('active', c.getAttribute('data-topic') === 'todos');
    });
    performSearch(false);
  });

  const switchTab = tab => {
    state.activeTab = tab;
    document.getElementById('tabAllBtn').classList.toggle('active', tab === 'all');
    document.getElementById('tabRJQuickBtn').classList.toggle('active', tab === 'rj_quick');
    document.getElementById('tabSavedSwitchBtn').classList.toggle('active', tab === 'saved');
    const tabDismissed = document.getElementById('tabDismissedBtn');
    if (tabDismissed) tabDismissed.classList.toggle('active', tab === 'dismissed');

    if (tab === 'rj_quick') {
      state.sortBy = 'proximity';
      document.getElementById('sortSelect').value = 'proximity';
    }
    renderJobs();
  };

  document.getElementById('tabAllBtn').addEventListener('click', () => switchTab('all'));
  document.getElementById('tabRJQuickBtn').addEventListener('click', () => switchTab('rj_quick'));
  document.getElementById('tabSavedSwitchBtn').addEventListener('click', () => switchTab('saved'));
  document.getElementById('savedTabBtn').addEventListener('click', () => switchTab('saved'));
  const btnTabDismissed = document.getElementById('tabDismissedBtn');
  if (btnTabDismissed) btnTabDismissed.addEventListener('click', () => switchTab('dismissed'));

  document.getElementById('quickFilterInput').addEventListener('input', e => {
    state.quickSearch = e.target.value;
    renderJobs();
  });

  document.getElementById('maxAgeSelect').addEventListener('change', e => {
    state.maxAgeDays = Number(e.target.value) || 0;
    renderJobs();
  });

  document.getElementById('sortSelect').addEventListener('change', e => {
    state.sortBy = e.target.value;
    renderJobs();
  });

  document.getElementById('refreshBtn').addEventListener('click', () => {
    performSearch(true);
  });

  // ==========================================
  // CONTROLE DE AUTENTICAÇÃO (PRIMEIRO ACESSO)
  // ==========================================
  const modalOverlay = document.getElementById('authModalOverlay');
  const authErrorBox = document.getElementById('authErrorBox');
  const userProfileBadge = document.getElementById('userProfileBadge');
  const userAvatarMini = document.getElementById('userAvatarMini');
  const userNameDisplay = document.getElementById('userNameDisplay');
  const btnLogout = document.getElementById('btnLogout');

  const tabRegisterBtn = document.getElementById('tabRegisterBtn');
  const tabLoginBtn = document.getElementById('tabLoginBtn');
  const formRegister = document.getElementById('formRegister');
  const formLogin = document.getElementById('formLogin');
  const authModalTitle = document.getElementById('authModalTitle');
  const authModalSubtitle = document.getElementById('authModalSubtitle');

  const showAuthModal = (mode = 'register') => {
    if (modalOverlay) modalOverlay.style.display = 'flex';
    if (authErrorBox) authErrorBox.style.display = 'none';
    if (mode === 'register') {
      tabRegisterBtn.classList.add('active');
      tabLoginBtn.classList.remove('active');
      formRegister.style.display = 'flex';
      formLogin.style.display = 'none';
      authModalTitle.textContent = 'Criar Conta no ThreadsJobs';
      authModalSubtitle.textContent = 'Cadastre-se para salvar suas vagas e não perdê-las.';
    } else {
      tabLoginBtn.classList.add('active');
      tabRegisterBtn.classList.remove('active');
      formLogin.style.display = 'flex';
      formRegister.style.display = 'none';
      authModalTitle.textContent = 'Entrar na Sua Conta';
      authModalSubtitle.textContent = 'Acesse suas vagas salvas de qualquer dispositivo.';
    }
  };

  const hideAuthModal = () => {
    if (modalOverlay) modalOverlay.style.display = 'none';
  };

  const updateAuthUI = (user) => {
    state.currentUser = user;
    if (user && userProfileBadge) {
      userProfileBadge.style.display = 'flex';
      const initials = (user.name || 'U').slice(0, 1).toUpperCase();
      if (userAvatarMini) userAvatarMini.textContent = initials;
      if (userNameDisplay) userNameDisplay.textContent = user.name || user.email;
    } else if (userProfileBadge) {
      userProfileBadge.style.display = 'none';
    }
  };

  // Alterna Abas do Modal
  if (tabRegisterBtn) tabRegisterBtn.addEventListener('click', () => showAuthModal('register'));
  if (tabLoginBtn) tabLoginBtn.addEventListener('click', () => showAuthModal('login'));

  // Submit Cadastro
  if (formRegister) {
    formRegister.addEventListener('submit', async (e) => {
      e.preventDefault();
      authErrorBox.style.display = 'none';
      const name = document.getElementById('regName').value.trim();
      const email = document.getElementById('regEmail').value.trim();
      const password = document.getElementById('regPass').value;

      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password })
        });
        const data = await res.json();
        if (!data.success) {
          throw new Error(data.error || 'Erro ao cadastrar.');
        }

        state.authToken = data.token;
        localStorage.setItem('threads_auth_token_v1', data.token);
        updateAuthUI(data.user);
        hideAuthModal();
        loadSavedJobs();
        performSearch(false);
      } catch (err) {
        authErrorBox.textContent = err.message;
        authErrorBox.style.display = 'block';
      }
    });
  }

  // Submit Login
  if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      authErrorBox.style.display = 'none';
      const email = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPass').value;

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (!data.success) {
          throw new Error(data.error || 'Erro ao entrar.');
        }

        state.authToken = data.token;
        localStorage.setItem('threads_auth_token_v1', data.token);
        updateAuthUI(data.user);
        hideAuthModal();
        loadSavedJobs();
        performSearch(false);
      } catch (err) {
        authErrorBox.textContent = err.message;
        authErrorBox.style.display = 'block';
      }
    });
  }

  // Logout
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      if (state.authToken) {
        try {
          await fetch('/api/auth/logout', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${state.authToken}` }
          });
        } catch (_) {}
      }
      localStorage.removeItem('threads_auth_token_v1');
      state.authToken = null;
      state.currentUser = null;
      state.savedJobsMap.clear();
      state.dismissedJobsMap.clear();
      updateSavedCounters();
      updateAuthUI(null);
      showAuthModal('login');
      renderJobs();
    });
  }

  // Checagem de primeiro acesso: Se tem token, valida sessão; se não tem, EXIGE CADASTRO!
  const checkInitialAuth = async () => {
    if (state.authToken) {
      try {
        const res = await fetch('/api/auth/me', {
          headers: { 'Authorization': `Bearer ${state.authToken}` }
        });
        const data = await res.json();
        if (data.success && data.user) {
          updateAuthUI(data.user);
          hideAuthModal();
          loadSavedJobs();
          performSearch(false);
          return;
        }
      } catch (err) {
        console.warn('Erro ao validar sessão existente:', err);
      }
    }

    // Primeiro Acesso! Exibe modal obrigatório de cadastro
    showAuthModal('register');
  };

  checkInitialAuth();
});
