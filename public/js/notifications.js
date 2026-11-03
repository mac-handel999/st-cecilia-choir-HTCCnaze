if (!requireAuth()) {
  throw new Error('Auth required');
}

document.addEventListener('DOMContentLoaded', async () => {
  ThemeManager.init();
  Toast.init();
  mountPortalNav('notifications');

  const container = document.getElementById('notifications-list');
  if (!container) return;

  container.innerHTML = '<div class="spinner"></div>';

  const currentUser = getCurrentUser();
  const currentUserId = currentUser?.id || null;
  const canDeleteSharedNotifications = ['admin', 'exco'].includes(currentUser?.role);

  async function loadFeed() {
    try {
      const [notifications, events, scores, songLists, attendance, announcements] = await Promise.all([
        api.get('/notifications'),
        api.get('/events?limit=10'),
        api.get('/scores?limit=10'),
        api.get('/song-lists?limit=10'),
        api.get('/attendance?limit=10'),
        api.get('/announcements')
      ]);

      const feed = [];
      const seen = new Set();

      const addItem = (item) => {
        const key = `${item.type}-${item.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          feed.push(item);
        }
      };

      (asArray(notifications)).forEach(n => {
        addItem({
          type: 'notification',
          id: n.id,
          title: n.title || 'Notification',
          message: n.message || '',
          icon: n.icon || 'notifications',
          timestamp: n.created_at,
          read: n.read || false,
          link: '#',
          deletable: n.user_id === currentUserId || (n.user_id === null && canDeleteSharedNotifications)
        });
      });

      (asArray(announcements)).forEach(ann => {
        addItem({
          type: 'announcement',
          id: ann.id,
          title: ann.title || 'Announcement',
          message: ann.message || '',
          icon: 'campaign',
          timestamp: ann.created_at,
          read: true,
          link: '#',
          deletable: false
        });
      });

      (asArray(events)).forEach(e => {
        addItem({
          type: 'event',
          id: e.id,
          title: e.title || 'New Event',
          message: `${e.type || 'Event'} on ${e.event_date || 'TBD'}${e.event_time ? ' at ' + e.event_time : ''}${e.location ? ' • ' + e.location : ''}`,
          icon: 'event',
          timestamp: e.created_at,
          read: true,
          link: 'events.html',
          deletable: false
        });
      });

      (asArray(scores)).forEach(s => {
        addItem({
          type: 'score',
          id: s.id,
          title: s.title || 'New Score',
          message: `Uploaded to ${s.category || 'General'} category`,
          icon: 'library_music',
          timestamp: s.created_at,
          read: true,
          link: 'scores.html',
          deletable: false
        });
      });

      (asArray(songLists)).forEach(sl => {
        addItem({
          type: 'song-list',
          id: sl.id,
          title: (sl.status === 'published' ? 'Published' : 'Draft saved') + ' Song Plan',
          message: `Event: ${sl.event_title || sl.event_id || 'Unknown Event'}`,
          icon: sl.status === 'published' ? 'publish' : 'edit_note',
          timestamp: sl.created_at,
          read: true,
          link: 'event-songs.html',
          deletable: false
        });
      });

      (asArray(attendance)).forEach(a => {
        addItem({
          type: 'attendance',
          id: a.id,
          title: 'Attendance Recorded',
          message: `${a.event_name || 'Event'} - ${a.status || 'marked'}`,
          icon: 'fact_check',
          timestamp: a.created_at,
          read: true,
          link: 'attendance.html',
          deletable: false
        });
      });

      feed.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

      renderFeed(feed);
      markNotificationsAsRead();
    } catch (error) {
      Toast.error('Failed to load feed: ' + error.message);
      container.innerHTML = `<div class="empty-state"><div class="empty-state-title">Error loading feed</div><div class="empty-state-desc">${escapeHtml(error.message)}</div></div>`;
    }
  }

  function renderFeed(feed) {
    if (feed.length === 0) {
      showEmpty('notifications-list', 'No updates yet', "You're all caught up!");
      return;
    }

    const unreadCount = feed.filter(f => f.type === 'notification' && !f.read).length;
    const hasUnread = unreadCount > 0;

    let headerHtml = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; gap: 0.75rem; flex-wrap: wrap;">
        <h2 style="font-family: var(--font-heading); font-size: 1.25rem; font-weight: 700; color: var(--color-primary); margin: 0;">Feed</h2>
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
          ${hasUnread ? `<button id="mark-all-read-btn" class="btn btn-outline btn-sm"><span class="material-symbols-outlined" style="font-size: 16px;">done_all</span> Mark All As Read</button>` : '<button id="mark-all-read-btn" class="btn btn-outline btn-sm" disabled style="opacity: 0.5;"><span class="material-symbols-outlined" style="font-size: 16px;">done_all</span> Mark All As Read</button>'}
          <button id="delete-all-btn" class="btn btn-outline btn-sm" style="color: var(--color-error); border-color: var(--color-error);"><span class="material-symbols-outlined" style="font-size: 16px;">delete_sweep</span> Delete All</button>
        </div>
      </div>
    `;

    container.innerHTML = headerHtml + feed.map(item => {
      const timeAgo = getTimeAgo(item.timestamp);
      const typeColors = {
        'notification': 'var(--color-primary)',
        'announcement': 'var(--color-accent)',
        'event': 'var(--color-success)',
        'score': 'var(--color-accent)',
        'song-list': 'var(--color-info)',
        'attendance': 'var(--color-primary-container)'
      };
      const iconColor = typeColors[item.type] || 'var(--color-primary)';

      return `
        <div class="feed-item" data-type="${item.type}" data-id="${item.id}" ${item.link !== '#' ? `onclick="window.location.href='${item.link}'"` : ''}>
          <div class="feed-icon" style="background: ${iconColor};">
            <span class="material-symbols-outlined">${item.icon}</span>
          </div>
          <div class="feed-content">
            <div class="feed-title">${escapeHtml(item.title)}</div>
            <div class="feed-message">${item.type === 'announcement' ? parseMarkdown(item.message) : escapeHtml(item.message)}</div>
            <div class="feed-time">${timeAgo}</div>
          </div>
          ${item.read ? '' : '<span class="badge badge-primary feed-badge">New</span>'}
          ${item.deletable ? `<button class="btn-icon delete-notification" data-id="${item.id}" data-type="${item.type}" title="Delete" style="color: var(--color-error); padding: 4px;"><span class="material-symbols-outlined" style="font-size: 18px;">delete</span></button>` : ''}
        </div>
      `;
    }).join('');

    const markAllBtn = document.getElementById('mark-all-read-btn');
    if (markAllBtn) {
      markAllBtn.addEventListener('click', async () => {
        try {
          await api.post('/notifications/mark-read', {});
          Toast.success('All notifications marked as read');
          updateNotificationBadge(0);
          await loadFeed();
        } catch (error) {
          Toast.error('Failed to mark as read: ' + error.message);
        }
      });
    }

    document.querySelectorAll('.delete-notification').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const type = btn.dataset.type;
        if (!confirm('Delete this item?')) return;
        try {
          if (type === 'notification') {
            await api.delete('/notifications/' + id);
          }
          const feedItem = btn.closest('.feed-item');
          if (feedItem) {
            feedItem.remove();
          }
          Toast.success('Item deleted');
        } catch (error) {
          Toast.error('Failed to delete: ' + error.message);
          await loadFeed();
        }
      });
    });

    const deleteAllBtn = document.getElementById('delete-all-btn');
    if (deleteAllBtn) {
      deleteAllBtn.addEventListener('click', async () => {
        if (!confirm('Delete all notifications sent directly to your account? Shared choir announcements and other members’ notifications will not be deleted.')) return;
        try {
          const result = await api.delete('/notifications/mine');
          Toast.success(result.message || 'Your personal notifications were deleted.');
          await loadFeed();
        } catch (error) {
          Toast.error('Failed to delete all: ' + error.message);
        }
      });
    }
  }

  async function markNotificationsAsRead() {
    try {
      const notifications = asArray(await api.get('/notifications'));
      const unread = notifications.filter(n => !n.read);
      if (unread.length > 0) {
        await api.post('/notifications/mark-read', {});
        updateNotificationBadge(0);
      }
    } catch (error) {
      Toast.error(getUserFriendlyError(error));
    }
  }

  function getTimeAgo(timestamp) {
    if (!timestamp) return 'Just now';
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now - then;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return diffMins + ' min ago';
    if (diffHours < 24) return diffHours + 'h ago';
    if (diffDays < 7) return diffDays + 'd ago';
    return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  await loadFeed();

  Realtime.subscribe('notifications', (payload) => {
    if (payload.eventType === 'INSERT' || payload.type === 'INSERT') {
      const notification = payload.new || {};
      const title = notification.title || 'New choir update';
      Toast.info(notification.message ? `${title}: ${notification.message}` : title);
      loadFeed();
    } else {
      loadFeed();
    }
  });

  Realtime.subscribe('events', () => loadFeed());
  Realtime.subscribe('scores', () => loadFeed());
  Realtime.subscribe('song_lists', () => loadFeed());
  Realtime.subscribe('announcements', () => loadFeed());
  Realtime.subscribe('attendance', () => loadFeed());
});
