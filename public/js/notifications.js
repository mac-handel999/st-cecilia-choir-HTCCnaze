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

  async function loadFeed() {
    try {
      const [notifications, events, scores, songLists, attendance] = await Promise.all([
        api.get('/notifications').catch(() => []),
        api.get('/events?limit=10').catch(() => []),
        api.get('/scores?limit=10').catch(() => []),
        api.get('/song-lists?limit=10').catch(() => []),
        api.get('/attendance?limit=10').catch(() => [])
      ]);

      const feed = [];

      (asArray(notifications)).forEach(n => {
        feed.push({
          type: 'notification',
          id: n.id,
          title: n.title || 'Notification',
          message: n.message || '',
          icon: n.icon || 'notifications',
          timestamp: n.created_at,
          read: n.read || false,
          link: '#'
        });
      });

      (asArray(events)).forEach(e => {
        feed.push({
          type: 'event',
          id: e.id,
          title: e.title || 'New Event',
          message: `${e.type || 'Event'} on ${e.event_date || 'TBD'}${e.event_time ? ' at ' + e.event_time : ''}${e.location ? ' • ' + e.location : ''}`,
          icon: 'event',
          timestamp: e.created_at,
          read: true,
          link: 'events.html'
        });
      });

      (asArray(scores)).forEach(s => {
        feed.push({
          type: 'score',
          id: s.id,
          title: s.title || 'New Score',
          message: `Uploaded to ${s.category || 'General'} category`,
          icon: 'library_music',
          timestamp: s.created_at,
          read: true,
          link: 'scores.html'
        });
      });

      (asArray(songLists)).forEach(sl => {
        const status = sl.status === 'published' ? 'Published' : 'Draft saved';
        feed.push({
          type: 'song-list',
          id: sl.id,
          title: status + ' Song Plan',
          message: `Event: ${sl.event_title || sl.event_id || 'Unknown Event'}`,
          icon: sl.status === 'published' ? 'publish' : 'edit_note',
          timestamp: sl.created_at,
          read: true,
          link: 'event-songs.html'
        });
      });

      (asArray(attendance)).forEach(a => {
        feed.push({
          type: 'attendance',
          id: a.id,
          title: 'Attendance Recorded',
          message: `${a.event_name || 'Event'} - ${a.status || 'marked'}`,
          icon: 'fact_check',
          timestamp: a.created_at,
          read: true,
          link: 'attendance.html'
        });
      });

      feed.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

      renderFeed(feed);
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

      container.innerHTML = feed.map(item => {
        const timeAgo = getTimeAgo(item.timestamp);
        const typeColors = {
          'notification': 'var(--color-primary)',
          'event': 'var(--color-success)',
          'score': 'var(--color-accent)',
          'song-list': 'var(--color-info)',
          'attendance': 'var(--color-primary-container)'
        };
        const iconColor = typeColors[item.type] || 'var(--color-primary)';

        return `
          <div class="feed-item" onclick="window.location.href='${item.link}'">
            <div class="feed-icon" style="background: ${iconColor};">
              <span class="material-symbols-outlined">${item.icon}</span>
            </div>
            <div class="feed-content">
              <div class="feed-title">${escapeHtml(item.title)}</div>
              <div class="feed-message">${escapeHtml(item.message)}</div>
              <div class="feed-time">${timeAgo}</div>
            </div>
            ${item.read ? '' : '<span class="badge badge-primary feed-badge">New</span>'}
          </div>
        `;
      }).join('');
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
      Toast.info('New update received');
      loadFeed();
    } else {
      loadFeed();
    }
  });

  Realtime.subscribe('events', () => loadFeed());
  Realtime.subscribe('scores', () => loadFeed());
  Realtime.subscribe('song_lists', () => loadFeed());
  Realtime.subscribe('attendance', () => loadFeed());
});
