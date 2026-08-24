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
      { hours: 6, minutes: 30, label: '6:30 AM' },
      { hours: 9, minutes: 30, label: '9:30 AM' }
    ];

    let nextMass = null;
    let minDiff = Infinity;

    for (const mass of masses) {
      for (let daysUntil = 0; daysUntil < 7; daysUntil++) {
        const candidate = new Date(now);
        candidate.setDate(now.getDate() + ((0 - currentDay + 7) % 7 + daysUntil) % 7);
        candidate.setHours(mass.hours, mass.minutes, 0, 0);
        
        const diff = candidate - now;
        if (diff > 0 && diff < minDiff) {
          minDiff = diff;
          nextMass = { date: candidate, label: mass.label };
        }
      }
    }

    return nextMass;
  }

  const nextMass = getNextSundayMass();
  if (nextMass) {
    const options = { weekday: 'long', month: 'short', day: 'numeric' };
    timeEl.textContent = `Every Sunday, 6:30 AM & 9:30 AM — Next: ${nextMass.label} (${nextMass.date.toLocaleDateString('en-US', options)})`;
    if (badgeEl) badgeEl.textContent = 'This Sunday';
    startCountdown(nextMass.date, countdownEl);
  } else {
    timeEl.textContent = 'Every Sunday, 6:30 AM & 9:30 AM';
    if (badgeEl) badgeEl.textContent = 'Sunday';
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
      countdownEl.innerHTML = '<div class="countdown-block"><div class="countdown-value">Now</div><div class="countdown-label">Rehearsal</div></div>';
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
    const seen = new Set();
    const unique = [];
    for (const n of notifications) {
      const key = `${n.title}-${n.message}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(n);
      }
    }
    const announcements = unique.slice(0, 4);

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
    const now = new Date();
    const upcoming = events
      .filter(e => e.event_date && new Date(e.event_date) >= now)
      .sort((a, b) => new Date(a.event_date) - new Date(b.event_date))[0];

    if (!upcoming) {
      const nextDate = getNextRehearsal();
      if (nextDate && nextDate._slot) {
        const slot = nextDate._slot;
        container.innerHTML = `
          <div class="upcoming-event-img upcoming-event-placeholder"><span class="material-symbols-outlined">music_note</span></div>
          <div class="upcoming-event-body">
            <span class="bento-badge">Next Practice</span>
            <h4>${slot.label} Rehearsal</h4>
            <p><span class="material-symbols-outlined">schedule</span> ${nextDate.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })} — ${slot.target}</p>
            <p><span class="material-symbols-outlined">location_on</span> Holy Trinity Catholic Church (HTCC) Naze</p>
          </div>
        `;
      } else {
        container.innerHTML = '<p style="color: var(--color-text-muted); padding: 1rem;">No upcoming events scheduled.</p>';
      }
      return;
    }

    container.innerHTML = `
      ${upcoming.image_url ? `<img src="${escapeHtml(upcoming.image_url)}" alt="${escapeHtml(upcoming.title)}" class="upcoming-event-img" loading="lazy">` : '<div class="upcoming-event-img upcoming-event-placeholder"><span class="material-symbols-outlined">church</span></div>'}
      <div class="upcoming-event-body">
        <span class="bento-badge">Upcoming</span>
        <h4>${escapeHtml(upcoming.title)}</h4>
        <p><span class="material-symbols-outlined">schedule</span> ${formatDate(upcoming.event_date)}${upcoming.event_time ? ' at ' + escapeHtml(upcoming.event_time) : ''}</p>
        ${upcoming.location ? `<p><span class="material-symbols-outlined">location_on</span> ${escapeHtml(upcoming.location)}</p>` : ''}
        <a href="events.html" class="btn btn-outline btn-sm" style="margin-top: 0.75rem;">View All Events</a>
      </div>
    `;
  } catch {
    container.innerHTML = '<p style="color: var(--color-text-muted); padding: 1rem;">Events will appear here when scheduled.</p>';
  }
}
