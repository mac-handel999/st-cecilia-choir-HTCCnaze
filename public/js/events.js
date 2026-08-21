if (!requireAuth()) {
  throw new Error('Auth required');
}

document.addEventListener('DOMContentLoaded', async () => {
  ThemeManager.init();
  Toast.init();

  const container = document.getElementById('events-list');
  const searchInput = document.getElementById('search-events');
  const filterBtns = document.querySelectorAll('.event-filter-btn');

  if (!container) return;

  container.innerHTML = '<div class="spinner"></div>';

  let eventsData = [];
  let activeFilter = 'all';

  function getEventIcon(type) {
    const icons = { 'Mass': 'church', 'Rehearsal': 'music_note', 'Concert': 'mic', 'Social': 'groups' };
    return icons[type] || 'event';
  }

  function render(list) {
    if (list.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📅</div>
          <div class="empty-state-title">No events found</div>
          <div class="empty-state-desc">Check back soon for new events.</div>
        </div>
      `;
      return;
    }

    container.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3" style="gap: 1.5rem;">${list.map(e => `
      <div class="event-card">
        <div class="event-image" style="${e.image_url ? '' : 'display: flex; align-items: center; justify-content: center; color: var(--color-text-muted);'}">
          ${e.image_url ? `<img src="${escapeHtml(e.image_url)}" alt="${escapeHtml(e.title || 'Event')}" style="width: 100%; height: 200px; object-fit: contain;" loading="lazy" onerror="this.style.display='none'">` : `<span class="material-symbols-outlined" style="font-size: 48px; opacity: 0.3;">${getEventIcon(e.type)}</span>`}
        </div>
        <div class="event-body">
          <div class="event-date"><span class="material-symbols-outlined" style="font-size: 16px;">calendar_today</span> ${formatDate(e.event_date)}${e.time ? ' at ' + escapeHtml(e.time) : ''}</div>
          <h3 style="font-family: var(--font-heading); font-size: 1.1rem; font-weight: 700; color: var(--color-primary); margin-bottom: 0.5rem;">${escapeHtml(e.title)}</h3>
          <p style="color: var(--color-text-muted); font-size: 0.9rem;">${escapeHtml(e.description || '')}</p>
          ${e.location ? `<p style="font-size: 0.8rem; color: var(--color-text-light); margin-top: 0.5rem;"><span class="material-symbols-outlined" style="font-size: 14px; vertical-align: middle;">location_on</span> ${escapeHtml(e.location)}</p>` : ''}
          <span class="badge badge-accent" style="margin-top: 0.75rem;">${escapeHtml(e.type || 'Event')}</span>
        </div>
      </div>
    `).join('')}</div>`;
  }

  const FALLBACK_EVENTS = [
    {
      id: 'fallback-1',
      title: 'THE MUSIC BOOM SEASON 2',
      description: 'A night of classical & native carols and orchestral performances celebrating the birth of Christ.',
      event_date: '2025-12-20',
      time: '18:00',
      location: 'Parish House',
      type: 'Concert',
      image_url: 'IMAGES/choir.jpg'
    },
    {
      id: 'fallback-2',
      title: "ST. CECILIA'S FEAST DAY",
      description: 'Our patronal feast day celebration featuring a grand high mass and choral banquet.',
      event_date: '2025-11-22',
      time: '10:00',
      location: 'Holy Trinity Catholic Church',
      type: 'Mass',
      image_url: 'IMAGES/HTCC.png'
    },
    {
      id: 'fallback-3',
      title: 'CHOIR OLD SCHOOLS DAY',
      description: 'A day to embrace our rich cultural and african musical heritage and celebrate the legacy of St. Cecilia.',
      event_date: '2025-10-15',
      time: '12:00',
      location: 'Parish House',
      type: 'Social',
      image_url: 'IMAGES/singers1.png'
    },
    {
      id: 'fallback-4',
      title: 'THE MUSIC BOOM SEASON 1',
      description: 'A night of classical & native carols and orchestral performances celebrating the birth of Christ.',
      event_date: '2024-12-20',
      time: '18:00',
      location: 'Parish House',
      type: 'Concert',
      image_url: 'IMAGES/choir.jpg'
    },
    {
      id: 'fallback-5',
      title: "ST. CECILIA'S FEAST DAY 2024",
      description: 'Our patronal feast day celebration featuring a grand high mass and choral banquet.',
      event_date: '2024-11-22',
      time: '10:00',
      location: 'Holy Trinity Catholic Church',
      type: 'Mass',
      image_url: 'IMAGES/logo-2.jpg'
    },
    {
      id: 'fallback-6',
      title: 'CHOIR OLD SCHOOLS DAY 2024',
      description: 'A day to embrace our rich cultural and african musical heritage and celebrate the legacy of St. Cecilia.',
      event_date: '2024-10-15',
      time: '12:00',
      location: 'Parish House',
      type: 'Social',
      image_url: 'IMAGES/singers2.jpg'
    }
  ];

  try {
    const { data, error } = await api.get('/events?select=*&order=event_date&ascending=true');
    if (error) throw new Error(error.message || 'Request failed');
    eventsData = data || [];
    if (eventsData.length === 0) {
      eventsData = FALLBACK_EVENTS;
    }
    render(eventsData);
  } catch (error) {
    Toast.error('Failed to load events: ' + error.message);
    eventsData = FALLBACK_EVENTS;
    render(eventsData);
  }

  if (searchInput) {
    searchInput.addEventListener('input', debounce(() => {
      const q = searchInput.value.toLowerCase();
      let filtered = eventsData;
      if (activeFilter !== 'all') {
        filtered = filtered.filter(e => (e.type || '').toLowerCase() === activeFilter.toLowerCase());
      }
      if (q) {
        filtered = filtered.filter(e =>
          (e.title || '').toLowerCase().includes(q) ||
          (e.description || '').toLowerCase().includes(q) ||
          (e.location || '').toLowerCase().includes(q)
        );
      }
      render(filtered);
    }, 300));
  }

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      const q = searchInput?.value?.toLowerCase() || '';
      let filtered = eventsData;
      if (activeFilter !== 'all') {
        filtered = filtered.filter(e => (e.type || '').toLowerCase() === activeFilter.toLowerCase());
      }
      if (q) {
        filtered = filtered.filter(e =>
          (e.title || '').toLowerCase().includes(q) ||
          (e.description || '').toLowerCase().includes(q)
        );
      }
      render(filtered);
    });
  });
});
