if (!requireAuth()) {
  throw new Error('Auth required');
}

document.addEventListener('DOMContentLoaded', async () => {
  ThemeManager.init();
  Toast.init();

  const contentContainer = document.getElementById('mass-content');
  const tabButtons = document.querySelectorAll('.tab-btn');

  let massData = {};

  try {
    const res = await fetch('data/order-of-mass.json');
    if (!res.ok) throw new Error('Failed to load Order of Mass data');
    massData = await res.json();
  } catch (err) {
    contentContainer.innerHTML = `<div class="empty-state"><div class="empty-state-title">Unable to load content</div><div class="empty-state-desc">${escapeHtml(err.message)}</div></div>`;
    return;
  }

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderMass(btn.dataset.lang);
    });
  });

  renderMass('en');

  function getIconClass(iconName) {
    const iconMap = {
      'cross': 'gold',
      'menu_book': 'info',
      'local_bar': '',
      'sanctuary': 'gold',
      'auto_awesome': ''
    };
    return iconMap[iconName] || '';
  }

  function getSpeakerClass(speaker) {
    const s = speaker.toLowerCase();
    if (s.includes('priest') || s.includes('sacerdos') || s.includes('v.')) return 'priest';
    if (s.includes('people') || s.includes('populus') || s.includes('r.') || s.includes('all') || s.includes('omnes')) return 'people';
    if (s.includes('reader') || s.includes('lector')) return 'all';
    return 'priest';
  }

  function renderMass(lang) {
    if (!contentContainer) return;
    contentContainer.innerHTML = '';

    const sections = massData[lang] || [];
    if (sections.length === 0) {
      contentContainer.innerHTML = `<div class="empty-state"><div class="empty-state-title">No content available</div><div class="empty-state-desc">Content for this language is not yet available.</div></div>`;
      return;
    }

    sections.forEach(sec => {
      const card = document.createElement('div');
      card.className = 'mass-section-card';

      const iconClass = getIconClass(sec.icon);

      const header = document.createElement('div');
      header.className = 'mass-section-header';
      header.innerHTML = `
        <div class="mass-section-icon ${iconClass}">
          <span class="material-symbols-outlined">${sec.icon}</span>
        </div>
        <h2 class="mass-section-title">${escapeHtml(sec.section)}</h2>
      `;
      card.appendChild(header);

      sec.content.forEach(item => {
        const line = document.createElement('div');
        line.className = 'mass-line-item';
        const speakerClass = getSpeakerClass(item.speaker);
        line.innerHTML = `
          <span class="mass-speaker ${speakerClass}">${escapeHtml(item.speaker)}</span>
          <span class="mass-text">${escapeHtml(item.text)}</span>
        `;
        card.appendChild(line);
      });

      contentContainer.appendChild(card);
    });
  }
});
