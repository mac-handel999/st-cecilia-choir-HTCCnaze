document.addEventListener('DOMContentLoaded', async () => {
  ThemeManager.init();
  Toast.init();

  const container = document.getElementById('scores-list');
  const uploadForm = document.getElementById('upload-score-form');
  const uploadAlert = document.getElementById('upload-alert');
  const searchInput = document.getElementById('scores-search');
  const sortToggle = document.getElementById('sort-toggle');

  let activeCategory = 'all';
  let searchQuery = '';
  let sortAsc = true;
  let allScores = [];

  renderCategoryFolders();

  if (uploadForm) {
    uploadForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      uploadAlert.innerHTML = '';

      const fileInput = document.getElementById('score-file');
      const categoryInput = document.getElementById('score-category');
      const submitBtn = uploadForm.querySelector('button[type="submit"]');

      const file = fileInput.files[0];
      if (!file) {
        showAlert('upload-alert', 'Please select a PDF file.', 'error');
        return;
      }
      if (file.type !== 'application/pdf') {
        showAlert('upload-alert', 'Only PDF files are allowed.', 'error');
        return;
      }
      if (!categoryInput.value) {
        showAlert('upload-alert', 'Please select a category.', 'error');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 18px;">hourglass_empty</span> Uploading...';

      try {
        const formData = new FormData();
        formData.append('score', file);
        formData.append('category', categoryInput.value);

        const response = await fetch('/api/drive/scores/upload', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token') || sessionStorage.getItem('token')}`
          },
          body: formData
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || result.message || 'Upload failed');
        }

        showAlert('upload-alert', 'Score uploaded successfully!', 'success');
        uploadForm.reset();
        await loadScores();
      } catch (error) {
        showAlert('upload-alert', error.message || 'Upload failed. Please try again.', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 18px;">cloud_upload</span> Upload Score';
      }
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', debounce(() => {
      searchQuery = searchInput.value.trim().toLowerCase();
      renderScoresList();
    }, 250));
  }

  if (sortToggle) {
    sortToggle.addEventListener('click', () => {
      sortAsc = !sortAsc;
      sortToggle.innerHTML = sortAsc
        ? '<span class="material-symbols-outlined" style="font-size: 16px;">sort_by_alpha</span> A-Z'
        : '<span class="material-symbols-outlined" style="font-size: 16px;">sort_by_alpha</span> Z-A';
      renderScoresList();
    });
  }

  async function loadScores() {
    if (!container) return;
    container.innerHTML = '<div class="spinner"></div>';

    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      params.set('sort', sortAsc ? 'name' : '-name');

      const data = await api.get(`/drive/scores?${params.toString()}`);
      allScores = asArray(data);
      renderScoresList();
    } catch (error) {
      showEmpty('scores-list', 'Error', error.message);
    }
  }

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

  function scoreMatchesCategory(score, categoryId) {
    if (categoryId === 'all') return true;
    const haystack = `${score.name || score.title || ''} ${score.category || ''}`.toLowerCase();
    const cat = SCORE_CATEGORIES.find(c => c.id === categoryId);
    if (!cat) return true;
    return haystack.includes(categoryId.replace(/-/g, ' ')) || haystack.includes(cat.label.toLowerCase());
  }

  function renderScoresList() {
    const container = document.getElementById('scores-list');
    if (!container) return;

    let filtered = allScores.map(file => ({
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
    })).filter(s => scoreMatchesCategory(s, activeCategory));

    if (searchQuery) {
      filtered = filtered.filter(s => {
        const haystack = `${s.title || ''} ${s.category || ''}`.toLowerCase();
        return haystack.includes(searchQuery);
      });
    }

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

  function showAlert(containerId, message, type) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const alertDiv = document.createElement('div');
    alertDiv.className = type === 'success' ? 'alert alert-success' : 'alert alert-error';
    alertDiv.style.marginBottom = '1rem';
    alertDiv.textContent = message;
    container.innerHTML = '';
    container.appendChild(alertDiv);
    setTimeout(() => alertDiv.remove(), 5000);
  }
});
