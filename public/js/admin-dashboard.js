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
    const scores = await api.get('/scores?select=title,created_at&order=created_at&ascending=false');
    const scoresContainer = document.getElementById('recent-scores');
    if (scoresContainer) {
      const scoresList = asArray(scores);
      if (scoresList.length > 0) {
        scoresContainer.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 0.5rem; max-height: 300px; overflow-y: auto;">
            ${scoresList.map(s => `
              <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem; border-bottom: 1px solid var(--color-border-light);">
                <div style="font-weight: 600; color: var(--color-text); font-size: 0.9rem; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(s.title)}</div>
                <div style="font-size: 0.75rem; color: var(--color-text-light); margin-left: 1rem; white-space: nowrap;">${formatDate(s.created_at)}</div>
              </div>
            `).join('')}
          </div>
          <a href="scores.html" class="btn btn-outline btn-sm" style="margin-top: 1rem; width: 100%; text-align: center;">View All Scores</a>
        `;
      } else {
        scoresContainer.innerHTML = '<p style="color: var(--color-text-muted); text-align: center; padding: 1rem;">No scores yet</p>';
      }
    }
  } catch (error) {
    const scoresContainer = document.getElementById('recent-scores');
    if (scoresContainer) {
      scoresContainer.innerHTML = '<p style="color: var(--color-text-muted); text-align: center; padding: 1rem;">Failed to load</p>';
    }
  }

  // All users management
  try {
    const users = await api.get('/users');
    const usersContainer = document.getElementById('all-users-list');
    if (usersContainer) {
      if (users && users.length > 0) {
        usersContainer.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 0.5rem; max-height: 500px; overflow-y: auto;">
            ${users.map(u => `
              <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem; border: 1px solid var(--color-border-light); border-radius: var(--radius-lg); background: var(--color-surface);">
                <div style="flex: 1; min-width: 0;">
                  <div style="font-weight: 600; color: var(--color-text); font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(u.full_name || u.username)}</div>
                  <div style="font-size: 0.8rem; color: var(--color-text-muted);">@${escapeHtml(u.username)} · ${escapeHtml(u.role || 'member')}</div>
                </div>
                <button class="btn btn-outline btn-sm delete-user-btn" data-id="${u.id}" style="color: var(--color-error); border-color: var(--color-error); margin-left: 1rem; flex-shrink: 0;">
                  <span class="material-symbols-outlined" style="font-size: 16px;">delete</span> Delete
                </button>
              </div>
            `).join('')}
          </div>
        `;

        usersContainer.querySelectorAll('.delete-user-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            if (!confirm('Permanently delete this user? This cannot be undone.')) return;
            try {
              await api.delete('/users/' + btn.dataset.id);
              Toast.success('User deleted');
              btn.closest('div[style]').remove();
            } catch (error) {
              Toast.error('Failed to delete user: ' + error.message);
            }
          });
        });
      } else {
        usersContainer.innerHTML = '<p style="color: var(--color-text-muted); text-align: center; padding: 1rem;">No users found</p>';
      }
    }
  } catch (error) {
    const usersContainer = document.getElementById('all-users-list');
    if (usersContainer) {
      usersContainer.innerHTML = '<p style="color: var(--color-text-muted); text-align: center; padding: 1rem;">Failed to load users</p>';
    }
  }
});
