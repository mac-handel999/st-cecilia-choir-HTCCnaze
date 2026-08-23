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
    const stats = await api.get('/dashboard/stats');
    document.getElementById('stat-members').textContent = stats.members || 0;
    document.getElementById('stat-scores').textContent = stats.scores || 0;
    document.getElementById('stat-events').textContent = stats.events || 0;
    document.getElementById('stat-attendance').textContent = stats.attendance || 0;
    document.getElementById('stat-pending').textContent = stats.pending || 0;
  } catch (error) {
    Toast.error('Failed to load stats: ' + error.message);
  }

  // Recent members
  try {
    const { data: members } = await api.get('/users?select=username,full_name,created_at&order=created_at&ascending=false&limit=5');
    const membersContainer = document.getElementById('recent-members');
    if (members && members.length > 0) {
      membersContainer.innerHTML = members.map(m => `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 0; border-bottom: 1px solid var(--color-border-light);">
          <div>
            <div style="font-weight: 600; color: var(--color-text); font-size: 0.9rem;">${escapeHtml(m.full_name || m.username)}</div>
            <div style="font-size: 0.8rem; color: var(--color-text-muted);">@${escapeHtml(m.username)}</div>
          </div>
          <div style="font-size: 0.75rem; color: var(--color-text-light);">${formatDate(m.created_at)}</div>
        </div>
      `).join('');
    } else {
      membersContainer.innerHTML = '<p style="color: var(--color-text-muted); text-align: center; padding: 1rem;">No members yet</p>';
    }
  } catch (error) {
    document.getElementById('recent-members').innerHTML = '<p style="color: var(--color-text-muted); text-align: center; padding: 1rem;">Failed to load</p>';
  }

  // Recent scores
  try {
    const { data: scores } = await api.get('/scores?select=title,created_at&order=created_at&ascending=false&limit=5');
    const scoresContainer = document.getElementById('recent-scores');
    if (scores && scores.length > 0) {
      scoresContainer.innerHTML = scores.map(s => `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 0; border-bottom: 1px solid var(--color-border-light);">
          <div style="font-weight: 600; color: var(--color-text); font-size: 0.9rem;">${escapeHtml(s.title)}</div>
          <div style="font-size: 0.75rem; color: var(--color-text-light);">${formatDate(s.created_at)}</div>
        </div>
      `).join('');
    } else {
      scoresContainer.innerHTML = '<p style="color: var(--color-text-muted); text-align: center; padding: 1rem;">No scores yet</p>';
    }
  } catch (error) {
    document.getElementById('recent-scores').innerHTML = '<p style="color: var(--color-text-muted); text-align: center; padding: 1rem;">Failed to load</p>';
  }
});
