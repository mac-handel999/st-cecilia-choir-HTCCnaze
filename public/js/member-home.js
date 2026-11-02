if (!requireAuth()) {
  throw new Error('Auth required');
}

document.addEventListener('DOMContentLoaded', async () => {
  ThemeManager.init();
  Toast.init();
  mountPortalNav('home');

  try {
    const user = await api.get('/auth/me');
    const displayName = user?.username || user?.full_name || 'Member';
    const welcomeEl = document.getElementById('welcome-username');
    if (welcomeEl) {
      welcomeEl.textContent = `Welcome back, ${displayName}!`;
    }

    if (user?.role === 'admin' || user?.role === 'exco') {
      document.querySelectorAll('.quick-action-admin').forEach(link => link.classList.remove('hidden'));

      const adminFab = document.getElementById('admin-fab');
      if (adminFab) adminFab.classList.remove('hidden');
    }

    const avatarImg = document.getElementById('home-avatar-img');
    const avatarInitials = document.getElementById('home-avatar-initials');
    const choirLogo = document.getElementById('home-choir-logo');
    
    const avatarUrl = user?.avatar_url;
    if (avatarUrl) {
      avatarImg.src = avatarUrl + '?t=' + Date.now();
      avatarImg.style.display = 'block';
      avatarInitials.style.display = 'none';
      if (choirLogo) choirLogo.style.display = 'none';
    } else {
      avatarImg.style.display = 'none';
      avatarInitials.style.display = 'inline-flex';
      if (choirLogo) choirLogo.style.display = 'inline-block';
    }
  } catch (error) {
    const cached = Auth.getUser();
    const welcomeEl = document.getElementById('welcome-username');
    if (welcomeEl && cached) {
      welcomeEl.textContent = `Welcome back, ${cached.username || cached.full_name || 'Member'}!`;
    }
  }

  setDynamicGreeting();
  loadNextRehearsal();
  startSundayMassCountdown();
  loadRecentScores();
  loadAnnouncements();
  loadUpcomingEvent();
});

function setDynamicGreeting() {
  const greetingEl = document.getElementById('dynamic-greeting');
  if (!greetingEl) return;

  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();
  const date = now.getDate();
  const month = now.getMonth();

  let greeting = 'Hello';
  let timeGreeting = '';

  if (hour >= 5 && hour < 12) {
    timeGreeting = 'Good Morning';
  } else if (hour >= 12 && hour < 17) {
    timeGreeting = 'Good Afternoon';
  } else if (hour >= 17 && hour < 21) {
    timeGreeting = 'Good Evening';
  } else {
    timeGreeting = 'Good Night';
  }

  let specialGreeting = '';

  if (day === 0) {
    specialGreeting = 'Happy Sunday';
  } else if (date === 1) {
    specialGreeting = 'Happy New Month';
  } else if (month === 10 && date === 22) {
    specialGreeting = 'Happy St. Cecilia Feast Day';
  }

  const fullGreeting = specialGreeting
    ? `${timeGreeting}! ${specialGreeting}!`
    : `${timeGreeting}!`;

  greetingEl.innerHTML = `<span class="pulse-dot"></span><span>${escapeHtml(fullGreeting)}</span>`;
}

async function loadNextRehearsal() {
  const timeEl = document.getElementById('rehearsal-time');
  const countdownEl = document.getElementById('rehearsal-countdown');
  const badgeEl = document.getElementById('rehearsal-badge');
  if (!timeEl) return;

  try {
    const events = asArray(await api.get('/events'));
    const now = new Date();
    const upcomingRehearsals = events
      .filter(e => e.event_date && e.title && e.title.toLowerCase().includes('rehearsal'))
      .sort((a, b) => new Date(a.event_date) - new Date(b.event_date));

    const rehearsal = upcomingRehearsals.find(e => new Date(e.event_date) > now) || upcomingRehearsals[0];

    if (rehearsal) {
      const eventDate = new Date(rehearsal.event_date);
      const options = { weekday: 'short', hour: 'numeric', minute: '2-digit' };
      timeEl.textContent = eventDate.toLocaleString('en-US', options);
      if (badgeEl) badgeEl.textContent = 'Upcoming';
      startCountdown(eventDate, countdownEl);
      return;
    }
  } catch {}

  const nextDate = getNextRehearsal();
  if (nextDate && nextDate._slot) {
    const slot = nextDate._slot;
    const options = { weekday: 'short', hour: 'numeric', minute: '2-digit' };
    timeEl.textContent = `${nextDate.toLocaleString('en-US', options)} — ${slot.label} (${slot.target})`;
    if (badgeEl) badgeEl.textContent = 'Next Practice';
    startCountdown(nextDate, countdownEl);
  } else {
    timeEl.textContent = 'Saturdays, 5:00 PM — All Choristers';
    if (countdownEl) countdownEl.textContent = '';
  }
}

function startSundayMassCountdown() {
  const timeEl = document.getElementById('mass-time');
  const countdownEl = document.getElementById('mass-countdown');
  const badgeEl = document.getElementById('mass-badge');
  if (!timeEl || !countdownEl) return;

  function getNextSundayMass() {
    const now = new Date();
    const currentDay = now.getDay();
    
    const masses = [
      { hours: 5, minutes: 30, label: '5:30 AM First Mass' },
      { hours: 10, minutes: 0, label: '10:00 AM Second Mass' }
    ];

    const nextSunday = new Date(now);
    nextSunday.setHours(0, 0, 0, 0);
    if (currentDay !== 0) {
      nextSunday.setDate(nextSunday.getDate() + (7 - currentDay));
    }

    let nextMass = null;
    for (let week = 0; week < 2 && !nextMass; week++) {
      for (const mass of masses) {
        const candidate = new Date(nextSunday);
        candidate.setDate(candidate.getDate() + week * 7);
        candidate.setHours(mass.hours, mass.minutes, 0, 0);
        if (candidate > now) {
          nextMass = { date: candidate, label: mass.label };
          break;
        }
      }
    }

    return nextMass;
  }

  const nextMass = getNextSundayMass();
  if (nextMass) {
    const options = { weekday: 'long', month: 'short', day: 'numeric' };
    timeEl.textContent = `Every Sunday, 5:30 AM (First Mass) & 10:00 AM (Second Mass) — Next: ${nextMass.label} (${nextMass.date.toLocaleDateString('en-US', options)})`;
    if (badgeEl) badgeEl.textContent = 'This Sunday';
    startCountdown(nextMass.date, countdownEl);
  } else {
    timeEl.textContent = 'Every Sunday, 5:30 AM (First Mass) & 10:00 AM (Second Mass)';
    if (badgeEl) badgeEl.textContent = 'Sunday';
  }
}

async function loadRecentScores() {
  const list = document.getElementById('recent-scores-list');
  if (!list) return;

  try {
    const [supabaseScores, driveFiles] = await Promise.all([
      api.get('/scores').catch(() => []),
      api.get('/drive/scores').catch(() => []),
    ]);

    const allScores = [
      ...asArray(supabaseScores).map(s => ({ title: s.title, description: s.description, created_at: s.created_at })),
      ...asArray(driveFiles).map(f => ({ title: f.name, description: '', created_at: f.createdTime })),
    ];

    allScores.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    const recent = allScores.slice(0, 3);

    if (recent.length === 0) {
      list.innerHTML = '<li><span class="material-symbols-outlined">info</span><div><strong>No scores yet</strong><p>Check back after uploads</p></div></li>';
      return;
    }

    list.innerHTML = recent.map(s => `
      <li>
        <span class="material-symbols-outlined">description</span>
        <div>
          <strong>${escapeHtml(s.title || 'Untitled')}</strong>
          <p>${escapeHtml(s.description || 'Choir score')}</p>
        </div>
      </li>
    `).join('');
  } catch {
    list.innerHTML = '<li><span class="material-symbols-outlined">info</span><div><strong>Scores unavailable</strong></div></li>';
  }
}

async function loadAnnouncements() {
  const container = document.getElementById('announcements-list');
  if (!container) return;

  try {
    const [announcements, scores, events] = await Promise.all([
      api.get('/announcements').catch(() => []),
      api.get('/scores?limit=3&order=created_at&ascending=false').catch(() => []),
      api.get('/events?limit=3&order=event_date&ascending=false').catch(() => [])
    ]);

    const annItems = asArray(announcements).map(ann => ({
      type: 'announcement',
      id: ann.id,
      title: ann.title || 'Announcement',
      message: ann.message || '',
      date: ann.created_at,
      link: ann.link || null,
      deletable: true
    }));

    const scoreItems = asArray(scores).map(s => ({
      type: 'score',
      id: s.id,
      title: s.title || 'New Score',
      message: `Uploaded to ${s.category || 'General'} category`,
      date: s.created_at,
      link: 'scores.html',
      deletable: false
    }));

    const eventItems = asArray(events).map(e => ({
      type: 'event',
      id: e.id,
      title: e.title || 'New Event',
      message: `${e.type || 'Event'} on ${e.event_date || 'TBD'}${e.event_time ? ' at ' + e.event_time : ''}${e.location ? ' • ' + e.location : ''}`,
      date: e.created_at,
      link: 'events.html',
      deletable: false
    }));

    const allItems = [...annItems, ...scoreItems, ...eventItems];
    allItems.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    const display = allItems.slice(0, 6);

    if (display.length === 0) {
      container.innerHTML = '<div class="announcement-item"><h4>No updates yet</h4><p>Check back for choir updates.</p></div>';
      return;
    }

    const currentUser = getCurrentUser();
    const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'exco';

    const typeConfig = {
      announcement: { icon: 'campaign', color: 'var(--color-accent)', label: 'Announcement' },
      score: { icon: 'library_music', color: 'var(--color-primary)', label: 'New Score' },
      event: { icon: 'event', color: 'var(--color-success)', label: 'New Event' }
    };

    container.innerHTML = display.map((item, i) => {
      const config = typeConfig[item.type] || typeConfig.announcement;
      const messageHtml = item.type === 'announcement' ? parseMarkdown(item.message) : escapeHtml(item.message);
      return `
        <div class="announcement-item ${i === 0 ? 'announcement-featured' : ''}" data-type="${item.type}" data-id="${item.id}">
          <div class="announcement-top">
            <h4><span class="material-symbols-outlined" style="font-size: 18px; vertical-align: middle; color: ${config.color}; margin-right: 0.35rem;">${config.icon}</span> ${escapeHtml(item.title)}</h4>
            <span>${formatDate(item.date)}</span>
          </div>
          <p>${messageHtml}</p>
          ${item.link ? `<a href="${escapeHtml(item.link)}" class="announcement-link">View Details →</a>` : ''}
          ${isAdmin && item.deletable ? `<button class="btn-icon delete-announcement" data-id="${item.id}" title="Delete" style="color: var(--color-error); padding: 4px; margin-top: 0.5rem;"><span class="material-symbols-outlined" style="font-size: 18px;">delete</span></button>` : ''}
        </div>
      `;
    }).join('');

    container.querySelectorAll('.delete-announcement').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        if (!confirm('Delete this announcement?')) return;
        try {
          await api.delete('/announcements/' + id);
          btn.closest('.announcement-item').remove();
          Toast.success('Announcement deleted');
        } catch (error) {
          Toast.error('Failed to delete: ' + error.message);
        }
      });
    });
  } catch {
    container.innerHTML = '<div class="announcement-item"><h4>Announcements</h4><p>Unable to load updates right now.</p></div>';
  }
}

async function loadUpcomingEvent() {
  const container = document.getElementById('upcoming-event-card');
  if (!container) return;

  const featuredEvents = window.FEATURED_CHOIR_EVENTS || [];
  const currentUser = getCurrentUser();
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'exco';

  try {
    const events = asArray(await api.get('/events'));
    const now = new Date();
    const additionalEvents = events
      .filter(event => {
        if (!event.event_date || new Date(`${event.event_date}T23:59:59`) < now) return false;
        return !featuredEvents.some(featured =>
          featured.event_date === event.event_date
          && String(event.title || '').toLocaleLowerCase().includes(
            featured.id === 'music-boom-2026' ? 'music boom' : 'cecilia'
          )
        );
      })
      .sort((a, b) => new Date(a.event_date) - new Date(b.event_date))
      .slice(0, 1);

    const additionalMarkup = additionalEvents.map((event, index) => {
      const eventDateTime = event.event_time
        ? new Date(`${event.event_date}T${event.event_time}`)
        : new Date(event.event_date);
      return `
        <article class="upcoming-event-extra card">
          ${event.image_url ? `<img src="${escapeHtml(event.image_url)}" alt="${escapeHtml(event.title)}" class="upcoming-event-img" loading="lazy">` : ''}
          <div class="upcoming-event-body">
            <span class="bento-badge">Upcoming</span>
            <h4>${escapeHtml(event.title || 'Choir event')}</h4>
            <p><span class="material-symbols-outlined">schedule</span> ${formatDate(event.event_date)}${event.event_time ? ` at ${escapeHtml(event.event_time)}` : ''}</p>
            ${event.location ? `<p><span class="material-symbols-outlined">location_on</span> ${escapeHtml(event.location)}</p>` : ''}
            <div id="additional-event-countdown-${index}" class="countdown-wrap"></div>
            <div class="upcoming-event-actions">
              <a href="events.html" class="btn btn-outline btn-sm">View All Events</a>
              ${isAdmin ? `<button class="btn btn-outline btn-sm delete-event-btn" data-id="${escapeHtml(event.id)}">Delete</button>` : ''}
            </div>
          </div>
        </article>
      `;
    }).join('');

    container.innerHTML = `
      <div class="member-upcoming-event-grid">
        ${featuredEvents.map(event => window.renderFeaturedEventCard?.(event, { compact: true }) || '').join('')}
        ${additionalMarkup}
      </div>
    `;
    window.updateFeaturedEventCountdowns?.();
    additionalEvents.forEach((event, index) => {
      const eventDateTime = event.event_time
        ? new Date(`${event.event_date}T${event.event_time}`)
        : new Date(event.event_date);
      startCountdown(eventDateTime, document.getElementById(`additional-event-countdown-${index}`));
    });

    container.querySelectorAll('.delete-event-btn').forEach(button => {
      button.addEventListener('click', async () => {
        if (!confirm('Delete this event?')) return;
        try {
          await api.delete(`/events/${encodeURIComponent(button.dataset.id)}`);
          Toast.success('Event deleted');
          await loadUpcomingEvent();
        } catch (error) {
          Toast.error(`Failed to delete: ${error.message}`);
        }
      });
    });
  } catch {
    container.innerHTML = `<div class="member-upcoming-event-grid">${featuredEvents.map(event => window.renderFeaturedEventCard?.(event, { compact: true }) || '').join('')}</div>`;
    window.updateFeaturedEventCountdowns?.();
  }
}

function startCountdown(targetDate, countdownEl) {
  if (!countdownEl) return;

  const units = [
    { label: 'Days', divisor: 1000 * 60 * 60 * 24 },
    { label: 'Hrs', divisor: 1000 * 60 * 60 },
    { label: 'Mins', divisor: 1000 * 60 },
    { label: 'Secs', divisor: 1000 }
  ];

  let intervalId = null;

  function render() {
    const diff = targetDate - new Date();
    if (diff <= 0) {
      countdownEl.innerHTML = '<div class="countdown-block"><div class="countdown-value">Now</div><div class="countdown-label">Event</div></div>';
      if (intervalId) clearInterval(intervalId);
      return;
    }

    const values = units.map(u => ({
      label: u.label,
      value: Math.max(0, Math.floor(diff / u.divisor))
    }));

    countdownEl.innerHTML = values.map((v, i) => {
      const sep = i < values.length - 1 ? '<div class="countdown-sep">:</div>' : '';
      return `<div class="countdown-block"><div class="countdown-value">${v.value}</div><div class="countdown-label">${v.label}</div></div>${sep}`;
    }).join('');
  }

  render();
  intervalId = setInterval(render, 1000);
}
