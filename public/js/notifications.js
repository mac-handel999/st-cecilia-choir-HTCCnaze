if (!requireAuth()) {
  throw new Error('Auth required');
}

document.addEventListener('DOMContentLoaded', async () => {
  ThemeManager.init();
  Toast.init();
  mountPortalNav('home');

  const container = document.getElementById('notifications-list');
  if (!container) return;

  container.innerHTML = '<div class="spinner"></div>';
  let notifications = [];

  function render(list) {
    if (list.length === 0) {
      showEmpty('notifications-list', 'No notifications', "You're all caught up!");
      return;
    }

    container.innerHTML = list.map(n => `
      <div class="notif-item ${n.read ? '' : 'notif-unread'}">
        <div class="notif-icon"><span class="material-symbols-outlined">${n.icon || 'notifications'}</span></div>
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 600; color: var(--color-primary); font-size: 0.95rem;">${escapeHtml(n.title)}</div>
          <div style="font-size: 0.85rem; color: var(--color-text-muted); margin-top: 0.25rem;">${escapeHtml(n.message)}</div>
          <div style="font-size: 0.75rem; color: var(--color-text-light); margin-top: 0.5rem;">${formatDateTime(n.created_at)}</div>
        </div>
        ${n.read ? '' : '<span class="badge badge-primary" style="flex-shrink: 0;">New</span>'}
      </div>
    `).join('');
  }

  async function loadNotifications() {
    try {
      notifications = asArray(await api.get('/notifications'));
      render(notifications);
    } catch (error) {
      Toast.error('Failed to load notifications: ' + error.message);
      container.innerHTML = `<div class="empty-state"><div class="empty-state-title">Error loading notifications</div><div class="empty-state-desc">${escapeHtml(error.message)}</div></div>`;
    }
  }

  await loadNotifications();

  Realtime.subscribe('notifications', (payload) => {
    if (payload.eventType === 'INSERT' || payload.type === 'INSERT') {
      Toast.info('New notification received');
      loadNotifications();
    } else {
      loadNotifications();
    }
  });
});
