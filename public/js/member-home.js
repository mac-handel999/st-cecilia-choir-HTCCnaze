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
      const adminLink = document.getElementById('admin-dashboard-link');
      if (adminLink) adminLink.classList.remove('hidden');
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
  if (!timeEl) return;

  try {
    const events = asArray(await api.get('/events'));
    const now = new Date();
    const upcomingRehearsals = events
      .filter(e => e.event_date && e.title && e.title.toLowerCase().includes('rehearsal'))
      .sort((a, b) => new Date(a.event_date) - new Date(b.event_date));

    const rehearsal = upcomingRehearsals.find(e => new Date(e.event_date) > now) || upcomingRehearsals[0];

    if (!rehearsal) {
      timeEl.textContent = 'No upcoming rehearsals';
      if (countdownEl) countdownEl.textContent = '';
      return;
    }

    const eventDate = new Date(rehearsal.event_date);
    const options = { weekday: 'short', hour: 'numeric', minute: '2-digit' };
    timeEl.textContent = eventDate.toLocaleString('en-US', options);

    function updateCountdown() {
      const current = new Date();
      const diff = eventDate - current;

      if (diff <= 0) {
        if (countdownEl) countdownEl.textContent = 'Now';
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      let parts = [];
      if (days > 0) parts.push(`${days}d`);
      if (hours > 0) parts.push(`${hours}h`);
      if (minutes > 0) parts.push(`${minutes}m`);
      parts.push(`${seconds}s`);

      if (countdownEl) countdownEl.textContent = `Countdown: ${parts.join(' ')}`;
    }

    updateCountdown();
    setInterval(updateCountdown, 1000);
  } catch {
    timeEl.textContent = 'Rehearsal: Saturdays, 5:00 PM';
    if (countdownEl) countdownEl.textContent = '';
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
    const notifications = asArray(await api.get('/notifications'));
    const announcements = notifications.slice(0, 4);

    if (announcements.length === 0) {
      container.innerHTML = '<div class="announcement-item"><h4>No announcements yet</h4><p>Check back for choir updates.</p></div>';
      return;
    }

    container.innerHTML = announcements.map((n, i) => `
      <div class="announcement-item ${i === 0 ? 'announcement-featured' : ''}">
        <div class="announcement-top">
          <h4>${escapeHtml(n.title)}</h4>
          <span>${formatDate(n.created_at)}</span>
        </div>
        <p>${escapeHtml(n.message)}</p>
      </div>
    `).join('');
  } catch {
    container.innerHTML = '<div class="announcement-item"><h4>Announcements</h4><p>Unable to load announcements right now.</p></div>';
  }
}

async function loadUpcomingEvent() {
  const container = document.getElementById('upcoming-event-card');
  if (!container) return;

  try {
    const events = asArray(await api.get('/events'));
    const upcoming = events
      .filter(e => e.event_date)
      .sort((a, b) => new Date(a.event_date) - new Date(b.event_date))[0];

    if (!upcoming) {
      container.innerHTML = '<p style="color: var(--color-text-muted); padding: 1rem;">No upcoming events scheduled.</p>';
      return;
    }

    container.innerHTML = `
      ${upcoming.image_url ? `<img src="${escapeHtml(upcoming.image_url)}" alt="${escapeHtml(upcoming.title)}" class="upcoming-event-img">` : '<div class="upcoming-event-img upcoming-event-placeholder"><span class="material-symbols-outlined">church</span></div>'}
      <div class="upcoming-event-body">
        <span class="bento-badge">Upcoming</span>
        <h4>${escapeHtml(upcoming.title)}</h4>
        <p><span class="material-symbols-outlined">schedule</span> ${formatDate(upcoming.event_date)}</p>
        ${upcoming.location ? `<p><span class="material-symbols-outlined">location_on</span> ${escapeHtml(upcoming.location)}</p>` : ''}
        <a href="events.html" class="btn btn-outline btn-sm" style="margin-top: 0.75rem;">View All Events</a>
      </div>
    `;
  } catch {
    container.innerHTML = '<p style="color: var(--color-text-muted); padding: 1rem;">Events will appear here when scheduled.</p>';
  }
}
