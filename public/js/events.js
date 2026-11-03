document.addEventListener('DOMContentLoaded', async () => {
  ThemeManager.init();
  Toast.init();

  const container = document.getElementById('events-list');
  const searchInput = document.getElementById('event-search');
  const filterBtns = document.querySelectorAll('[data-event-filter]');
  if (!container) return;

  const historicalEvents = [
    {
      id: 'history-music-boom-season-2',
      title: 'THE MUSIC BOOM SEASON 2',
      description: 'A night of classical and native carols and orchestral performances celebrating the birth of Christ.',
      event_date: '2025-12-20',
      event_time: '6:00 PM',
      location: 'Parish House',
      type: 'Concert',
      image_url: 'IMAGES/choir.jpg'
    },
    {
      id: 'history-st-cecilia-feast-2025',
      title: "ST. CECILIA'S FEAST DAY",
      description: 'Our patronal feast day celebration featuring a grand high Mass and choral banquet.',
      event_date: '2025-11-22',
      event_time: '10:00 AM',
      location: 'Holy Trinity Catholic Church',
      type: 'Mass',
      image_url: 'IMAGES/HTCC.png'
    },
    {
      id: 'history-old-schools-day-2025',
      title: 'CHOIR OLD SCHOOLS DAY',
      description: 'A day to embrace our rich cultural and African musical heritage and celebrate the legacy of St. Cecilia.',
      event_date: '2025-10-15',
      event_time: '12:00 PM',
      location: 'Parish House',
      type: 'Social',
      image_url: 'IMAGES/singers1.png'
    },
    {
      id: 'history-music-boom-season-1',
      title: 'THE MUSIC BOOM SEASON 1',
      description: 'A night of classical and native carols and orchestral performances celebrating the birth of Christ.',
      event_date: '2024-12-20',
      event_time: '6:00 PM',
      location: 'Parish House',
      type: 'Concert',
      image_url: 'IMAGES/choir.jpg'
    },
    {
      id: 'history-st-cecilia-feast-2024',
      title: "ST. CECILIA'S FEAST DAY 2024",
      description: 'Our patronal feast day celebration featuring a grand high Mass and choral banquet.',
      event_date: '2024-11-22',
      event_time: '10:00 AM',
      location: 'Holy Trinity Catholic Church',
      type: 'Mass',
      image_url: 'IMAGES/logo-2.jpg'
    },
    {
      id: 'history-old-schools-day-2024',
      title: 'CHOIR OLD SCHOOLS DAY 2024',
      description: 'A day to embrace our rich cultural and African musical heritage and celebrate the legacy of St. Cecilia.',
      event_date: '2024-10-15',
      event_time: '12:00 PM',
      location: 'Parish House',
      type: 'Social',
      image_url: 'IMAGES/singers2.jpg'
    }
  ];

  const featuredEvents = window.FEATURED_CHOIR_EVENTS || [];
  let eventsData = [...featuredEvents, ...historicalEvents].sort(sortEvents);
  let activeFilter = 'all';

  function isFeaturedEvent(event) {
    return featuredEvents.some(featured => eventKey(featured) === eventKey(event));
  }

  function eventKey(event) {
    return `${String(event.event_date || '').slice(0, 10)}|${String(event.title || '').trim().toLocaleLowerCase()}`;
  }

  function eventTimestamp(event) {
    const date = String(event.event_date || '').slice(0, 10);
    const time = String(event.event_time || '').match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?/i);
    if (!time) return new Date(`${date}T23:59:00`).getTime();
    let hours = Number(time[1]);
    if (time[3]?.toUpperCase() === 'PM' && hours < 12) hours += 12;
    if (time[3]?.toUpperCase() === 'AM' && hours === 12) hours = 0;
    return new Date(`${date}T${String(hours).padStart(2, '0')}:${time[2]}:00`).getTime();
  }

  function sortEvents(a, b) {
    const now = Date.now();
    const aTime = eventTimestamp(a);
    const bTime = eventTimestamp(b);
    const aUpcoming = aTime >= now;
    const bUpcoming = bTime >= now;
    if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
    return aUpcoming ? aTime - bTime : bTime - aTime;
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
    const eventKeys = new Set(eventsData.map(eventKey));
    eventsData = [
      ...eventsData,
      ...existingEvents.filter(event => {
        const key = eventKey(event);
        if (eventKeys.has(key)) return false;
        eventKeys.add(key);
        return true;
      })
    ].sort(sortEvents);
  } catch (error) {
    console.error('[Events] Could not load saved events:', error);
    Toast.error('Some older event listings could not be loaded. The featured events are still shown.');
  }

  updateList();
});
