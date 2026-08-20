if (!requireAuth()) {
  throw new Error('Auth required');
}

let allScores = [];
let activeCategory = 'all';
let searchQuery = '';
let sortAsc = true;

document.addEventListener('DOMContentLoaded', async () => {
  ThemeManager.init();
  Toast.init();
  mountPortalNav('scores');

  renderCategoryFolders();
  setupSearch();
  setupFilterChips();
  setupSortToggle();
  await loadScores();
});

function renderCategoryFolders() {
  const container = document.getElementById('score-categories');
  if (!container) return;

  container.innerHTML = SCORE_CATEGORIES.map(cat => {
    if (cat.url) {
      return `
        <a href="${escapeHtml(cat.url)}" target="_blank" rel="noopener" class="score-category score-category-link" data-category="${cat.id}">
          <span class="material-symbols-outlined">${cat.icon}</span>
          <span>${escapeHtml(cat.label)}</span>
          <span class="material-symbols-outlined" style="font-size: 16px; margin-left: auto;">open_in_new</span>
        </a>
      `;
    }
    return `
      <button type="button" class="score-category ${cat.id === activeCategory ? 'active' : ''}" data-category="${cat.id}">
        <span class="material-symbols-outlined">${cat.icon}</span>
        <span>${escapeHtml(cat.label)}</span>
      </button>
    `;
  }).join('');

  container.querySelectorAll('.score-category:not(.score-category-link)').forEach(btn => {
    btn.addEventListener('click', () => {
      activeCategory = btn.dataset.category;
      container.querySelectorAll('.score-category').forEach(b => b.classList.toggle('active', b.dataset.category === activeCategory));
      renderScoresList();
    });
  });
}

function setupSearch() {
  const input = document.getElementById('scores-search');
  if (!input) return;
  input.addEventListener('input', debounce(() => {
    searchQuery = input.value.trim().toLowerCase();
    renderScoresList();
  }, 250));
}

function setupFilterChips() {
  const chips = document.querySelectorAll('[data-score-filter]');
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      chips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeCategory = chip.dataset.scoreFilter;
      renderCategoryFolders();
      renderScoresList();
    });
  });
}

function setupSortToggle() {
  const btn = document.getElementById('sort-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    sortAsc = !sortAsc;
    btn.innerHTML = sortAsc
      ? '<span class="material-symbols-outlined" style="font-size: 16px;">sort_by_alpha</span> A-Z'
      : '<span class="material-symbols-outlined" style="font-size: 16px;">sort_by_alpha</span> Z-A';
    renderScoresList();
  });
}

async function loadScores() {
  const container = document.getElementById('scores-list');
  if (!container) return;
  container.innerHTML = '<div class="spinner"></div>';

  try {
    const [supabaseScores, driveFiles] = await Promise.all([
      api.get('/scores').catch(() => []),
      api.get('/drive/scores').catch(() => []),
    ]);

    const normalizedDrive = asArray(driveFiles).map(file => ({
      id: file.id,
      title: file.name || 'Untitled',
      description: '',
      category: file.properties?.category || 'general',
      file_url: file.webViewLink || file.webContentLink || '#',
      file_type: 'pdf',
      public_id: file.id,
      uploaded_by: null,
      created_at: file.createdTime,
      source: 'drive',
    }));

    allScores = [...asArray(supabaseScores), ...normalizedDrive];
    renderScoresList();
  } catch (error) {
    Toast.error('Failed to load scores: ' + error.message);
    showEmpty('scores-list', 'Unable to load scores', 'Please try again later.');
  }
}

function scoreMatchesCategory(score, categoryId) {
  if (categoryId === 'all') return true;
  const haystack = `${score.title || ''} ${score.description || ''} ${score.category || ''}`.toLowerCase();
  const cat = SCORE_CATEGORIES.find(c => c.id === categoryId);
  if (!cat) return true;
  return haystack.includes(categoryId.replace(/-/g, ' ')) || haystack.includes(cat.label.toLowerCase());
}

function renderScoresList() {
  const container = document.getElementById('scores-list');
  if (!container) return;

  let filtered = allScores.filter(s => scoreMatchesCategory(s, activeCategory));

  if (searchQuery) {
    filtered = filtered.filter(s => {
      const haystack = `${s.title || ''} ${s.description || ''} ${s.category || ''}`.toLowerCase();
      return haystack.includes(searchQuery);
    });
  }

  filtered.sort((a, b) => {
    const titleA = (a.title || '').toLowerCase();
    const titleB = (b.title || '').toLowerCase();
    if (titleA < titleB) return sortAsc ? -1 : 1;
    if (titleA > titleB) return sortAsc ? 1 : -1;
    return 0;
  });

  if (filtered.length === 0) {
    showEmpty('scores-list', 'No scores found', activeCategory === 'all' ? 'Scores will appear here when uploaded.' : 'No scores in this category yet.');
    return;
  }

  container.innerHTML = `
    <div class="scores-grid">
      ${filtered.map(s => `
        <article class="score-card score-card-bento">
          <div class="score-card-tags">
            <span class="badge badge-accent">${escapeHtml(s.category || 'General')}</span>
          </div>
          <h3 class="score-title">${escapeHtml(s.title)}</h3>
          <p class="score-meta">${escapeHtml(s.description || 'Choir score')}</p>
          <p class="score-meta">${formatDate(s.created_at)}</p>
          <div class="score-actions">
            ${s.file_url ? `<a href="${escapeHtml(s.file_url)}" target="_blank" rel="noopener" class="btn btn-outline btn-sm"><span class="material-symbols-outlined">visibility</span> View</a>` : ''}
            ${s.file_url ? `<a href="${escapeHtml(s.file_url)}" download class="btn btn-accent btn-sm"><span class="material-symbols-outlined">download</span> Download</a>` : ''}
          </div>
        </article>
      `).join('')}
    </div>
  `;
}
