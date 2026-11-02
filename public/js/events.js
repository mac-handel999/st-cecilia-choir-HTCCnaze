document.addEventListener('DOMContentLoaded', async () => {
  ThemeManager.init();
  Toast.init();

  const container = document.getElementById('events-list');
  const searchInput = document.getElementById('event-search');
  const filterBtns = document.querySelectorAll('[data-event-filter]');
  if (!container) return;

  let eventsData = [...(window.FEATURED_CHOIR_EVENTS || [])];
  let activeFilter = 'all';

  function isFeaturedEvent(event) {
    return String(event.id || '').startsWith('st-cecilia-') || String(event.id || '').startsWith('music-boom-');
  }

  function renderEvent(event, canDelete) {
    if (isFeaturedEvent(event) && window.renderFeaturedEventCard) {
      return window.renderFeaturedEventCard(event);
    }

    const icons = { Mass: 'church', Rehearsal: 'music_note', Concert: 'mic', Social: 'groups' };
    const icon = icons[event.type] || 'event';
    return `
      <article class="event-card" data-event-id="${escapeHtml(event.id || '')}">
        <div class="event-image" style="${event.image_url ? '' : 'display: flex; align-items: center; justify-content: center; color: var(--color-text-muted);'}">
          ${event.image_url ? `<img src="${escapeHtml(event.image_url)}" alt="${escapeHtml(event.title || 'Event')}" style="width: 100%; height: 200px; object-fit: contain;" loading="lazy" onerror="this.style.display='none'">` : `<span class="material-symbols-outlined" style="font-size: 48px; opacity: 0.3;">${icon}</span>`}
          ${canDelete ? `<button class="btn-icon delete-event" data-id="${escapeHtml(event.id)}" title="Delete event" style="position: absolute; top: 0.5rem; right: 0.5rem; background: rgba(255,255,255,0.9); color: var(--color-error);"><span class="material-symbols-outlined">delete</span></button>` : ''}
        </div>
        <div class="event-body">
          <div class="event-date"><span class="material-symbols-outlined" style="font-size: 16px;">calendar_today</span> ${formatDate(event.event_date)}${event.event_time ? ` at ${escapeHtml(event.event_time)}` : ''}</div>
          <h3>${escapeHtml(event.title || 'Choir event')}</h3>
          <p>${escapeHtml(event.description || '')}</p>
          ${event.location ? `<p class="event-location"><span class="material-symbols-outlined">location_on</span> ${escapeHtml(event.location)}</p>` : ''}
          <span class="badge badge-accent">${escapeHtml(event.type || 'Event')}</span>
        </div>
      </article>
    `;
  }

  function render(list) {
    if (!list.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📅</div>
          <div class="empty-state-title">No events found</div>
          <div class="empty-state-desc">Try another search or filter.</div>
        </div>
      `;
      return;
    }

    const user = getCurrentUser();
    const canDelete = user && (user.role === 'admin' || user.role === 'exco');
    container.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 event-list-grid">${list.map(event => renderEvent(event, canDelete && !isFeaturedEvent(event))).join('')}</div>`;
    window.updateFeaturedEventCountdowns?.();

    if (canDelete) {
      container.querySelectorAll('.delete-event').forEach(button => {
        button.addEventListener('click', async event => {
          event.stopPropagation();
          const id = button.dataset.id;
          if (!confirm('Delete this event? This will also remove related song lists and attendance records.')) return;
          try {
            await api.delete(`/events/${encodeURIComponent(id)}`);
            Toast.success('Event deleted');
            eventsData = eventsData.filter(item => item.id !== id);
            render(getFilteredEvents());
          } catch (error) {
            Toast.error(`Failed to delete: ${error.message}`);
          }
        });
      });
    }
  }

  function getFilteredEvents() {
    const query = searchInput?.value.trim().toLocaleLowerCase() || '';
    return eventsData.filter(event => {
      const matchesFilter = activeFilter === 'all'
        || String(event.type || '').toLocaleLowerCase() === activeFilter.toLocaleLowerCase();
      const searchableText = `${event.title || ''} ${event.description || ''} ${event.location || ''} ${event.theme || ''}`.toLocaleLowerCase();
      return matchesFilter && (!query || searchableText.includes(query));
    });
  }

  function updateList() {
    render(getFilteredEvents());
  }

  updateList();
  searchInput?.addEventListener('input', debounce(updateList, 250));
  filterBtns.forEach(button => {
    button.addEventListener('click', () => {
      filterBtns.forEach(item => item.classList.remove('active'));
      button.classList.add('active');
      activeFilter = button.dataset.eventFilter || 'all';
      updateList();
    });
  });

  try {
    const response = await api.get('/events?select=*&order=event_date&ascending=true');
    const existingEvents = asArray(response);
    const featuredIds = new Set(eventsData.map(event => event.id));
    const featuredTitles = new Set(eventsData.map(event => String(event.title).toLocaleLowerCase()));
    eventsData = [
      ...eventsData,
      ...existingEvents.filter(event =>
        !featuredIds.has(event.id)
        && !featuredTitles.has(String(event.title || '').toLocaleLowerCase())
      )
    ].sort((a, b) => new Date(a.event_date) - new Date(b.event_date));
  } catch (error) {
    console.error('[Events] Could not load saved events:', error);
    Toast.error('Some older event listings could not be loaded. The featured events are still shown.');
  }

  updateList();
});
