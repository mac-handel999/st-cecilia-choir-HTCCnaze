document.addEventListener('DOMContentLoaded', async () => {
  ThemeManager.init();
  Toast.init();
  mountPublicNav('executives');

  const container = document.getElementById('executives-grid');
  const searchInput = document.getElementById('search-executives');
  if (!container) return;

  container.innerHTML = '<div class="spinner"></div>';
  let executivesData = [];

  function render(list) {
    if (list.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-state-icon">👤</div>
          <div class="empty-state-title">No executives found</div>
          <div class="empty-state-desc">Try a different search term</div>
        </div>
      `;
      return;
    }

    container.innerHTML = list.map(item => {
      const name = item.name || item.full_name || 'Executive';
      const role = item.role || item.position || item.executive_position || '';
      const image = item.photo_url || item.image || 'IMAGES/choir-logo.jpg';
      const part = item.choir_part || '';
      const contact = item.contact || item.phone_number || '';

      return `
        <article class="executive-card executive-card-bento">
          <div class="executive-card-image">
            <img src="${escapeHtml(image)}" alt="${escapeHtml(name)}" loading="lazy" onerror="this.src='IMAGES/choir-logo.jpg'">
            <span class="executive-role-badge">${escapeHtml(role)}</span>
          </div>
          <div class="card-body">
            <h3>${escapeHtml(name)}</h3>
            ${part ? `<p class="part"><span class="material-symbols-outlined filled">mic</span> ${escapeHtml(part)}</p>` : ''}
            ${contact && contact !== '+234-' ? `<a href="tel:${escapeHtml(contact.replace(/\s/g, ''))}" class="contact"><span class="material-symbols-outlined">call</span> ${escapeHtml(contact)}</a>` : ''}
          </div>
        </article>
      `;
    }).join('');
  }

  try {
    const apiData = asArray(await api.get('/executives'));
    if (apiData.length > 0) {
      executivesData = apiData.map(e => ({
        name: e.name,
        role: e.role,
        image: e.photo_url,
        contact: e.bio,
        choir_part: ''
      }));
    } else {
      throw new Error('No API data');
    }
  } catch {
    try {
      const res = await fetch('data/executives.json');
      executivesData = await res.json();
    } catch (error) {
      showEmpty('executives-grid', 'Error', 'Could not load executives data.');
      return;
    }
  }

  render(executivesData);

  if (searchInput) {
    searchInput.addEventListener('input', debounce(() => {
      const q = searchInput.value.toLowerCase();
      const filtered = executivesData.filter(ex =>
        (ex.name || '').toLowerCase().includes(q) ||
        (ex.role || ex.position || '').toLowerCase().includes(q) ||
        (ex.choir_part || '').toLowerCase().includes(q) ||
        (ex.contact || '').toLowerCase().includes(q)
      );
      render(filtered);
    }, 300));
  }
});
