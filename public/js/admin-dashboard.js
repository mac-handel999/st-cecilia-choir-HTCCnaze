if (!requireAuth()) {
  throw new Error('Auth required');
}

document.addEventListener('DOMContentLoaded', async () => {
  ThemeManager.init();
  Toast.init();

  const user = Auth.getUser();
  if (user && (user.role === 'admin' || user.role === 'exco')) {
    const nameEl = document.getElementById('admin-user-name');
    if (nameEl) nameEl.textContent = user.full_name || user.username || 'Admin';
  }

  // Sidebar toggle
  const sidebar = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebar-overlay');
  const sidebarToggle = document.getElementById('sidebar-toggle');

  function openSidebar() {
    sidebar.classList.add('active');
    sidebarOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
  function closeSidebar() {
    sidebar.classList.remove('active');
    sidebarOverlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  if (sidebarToggle) sidebarToggle.addEventListener('click', openSidebar);
  if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);

  // Close sidebar on window resize (desktop)
  window.addEventListener('resize', () => {
    if (window.innerWidth >= 1024) closeSidebar();
  });

  // Load stats
  try {
    const [members, scores, events, attendance] = await Promise.all([
      api.get('/users?limit=1').catch(() => []),
      api.get('/scores?limit=1').catch(() => []),
      api.get('/events?limit=1').catch(() => []),
      api.get('/attendance?limit=1').catch(() => [])
    ]);

    document.getElementById('stat-members').textContent = Array.isArray(members) ? members.length : (members?.length || 0);
    document.getElementById('stat-scores').textContent = Array.isArray(scores) ? scores.length : (scores?.length || 0);
    document.getElementById('stat-events').textContent = Array.isArray(events) ? events.length : (events?.length || 0);
    document.getElementById('stat-attendance').textContent = Array.isArray(attendance) ? attendance.length : (attendance?.length || 0);
  } catch (error) {
    Toast.error('Failed to load stats: ' + error.message);
  }

  // Recent members
  try {
    const members = asArray(await api.get('/users?order=created_at&ascending=false&limit=5'));
    const container = document.getElementById('recent-members');
    if (members.length === 0) {
      container.innerHTML = '<p style="color: var(--color-text-muted); text-align: center; padding: 1rem;">No members yet</p>';
    } else {
      container.innerHTML = members.map(m => `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 0; border-bottom: 1px solid var(--color-border-light);">
          <div>
            <div style="font-weight: 600; color: var(--color-text); font-size: 0.9rem;">${escapeHtml(m.full_name || m.username)}</div>
            <div style="font-size: 0.8rem; color: var(--color-text-muted);">@${escapeHtml(m.username)}</div>
          </div>
          <span class="badge badge-accent">${escapeHtml(m.role || 'member')}</span>
        </div>
      `).join('');
    }
  } catch (error) {
    document.getElementById('recent-members').innerHTML = '<p style="color: var(--color-text-muted); text-align: center; padding: 1rem;">Failed to load</p>';
  }

  // Upcoming events
  try {
    const events = asArray(await api.get('/events'));
    const upcoming = events
      .filter(e => e.event_date)
      .sort((a, b) => new Date(a.event_date) - new Date(b.event_date))
      .slice(0, 5);

    const container = document.getElementById('upcoming-events');
    if (upcoming.length === 0) {
      container.innerHTML = '<p style="color: var(--color-text-muted); text-align: center; padding: 1rem;">No upcoming events</p>';
    } else {
      container.innerHTML = upcoming.map(e => `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 0; border-bottom: 1px solid var(--color-border-light);">
          <div>
            <div style="font-weight: 600; color: var(--color-text); font-size: 0.9rem;">${escapeHtml(e.title)}</div>
            <div style="font-size: 0.8rem; color: var(--color-text-muted);">${formatDate(e.event_date)}${e.location ? ' • ' + escapeHtml(e.location) : ''}</div>
          </div>
        </div>
      `).join('');
    }
  } catch (error) {
    document.getElementById('upcoming-events').innerHTML = '<p style="color: var(--color-text-muted); text-align: center; padding: 1rem;">Failed to load</p>';
  }
});
