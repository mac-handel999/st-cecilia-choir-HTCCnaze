if (!requireAuth()) {
  throw new Error('Auth required');
}

document.addEventListener('DOMContentLoaded', async () => {
  ThemeManager.init();
  Toast.init();

  const user = Auth.getUser();
  const isAdmin = user && (user.role === 'admin' || user.role === 'exco');

  if (!isAdmin) {
    window.location.href = 'member-home.html';
    return;
  }

  const form = document.getElementById('announcement-form');
  const listContainer = document.getElementById('announcements-list');
  const alertContainer = document.getElementById('announcement-alert');

  let editingId = null;

  async function loadAnnouncements() {
    try {
      const announcements = await api.get('/announcements');
      const items = asArray(announcements);

      if (items.length === 0) {
        listContainer.innerHTML = `
          <div class="announcement-empty">
            <div class="material-symbols-outlined">campaign</div>
            <p>No announcements yet. Create one above to broadcast to the choir.</p>
          </div>
        `;
        return;
      }

      listContainer.innerHTML = items.map(ann => `
        <div class="announcement-list-item" data-id="${ann.id}">
          <div class="announcement-list-header">
            <h3 class="announcement-list-title">${escapeHtml(ann.title)}</h3>
          </div>
          <div class="announcement-list-meta">
            ${ann.announcement_date ? `<span><span class="material-symbols-outlined">calendar_today</span> ${escapeHtml(ann.announcement_date)}</span>` : ''}
            ${ann.announcement_time ? `<span><span class="material-symbols-outlined">schedule</span> ${escapeHtml(ann.announcement_time)}</span>` : ''}
            ${ann.link ? `<span><span class="material-symbols-outlined">link</span> Link</span>` : ''}
            <span><span class="material-symbols-outlined">person</span> ${escapeHtml(ann.created_by_name || 'Admin')}</span>
          </div>
          <p class="announcement-list-message">${parseMarkdown(ann.message)}</p>
          ${ann.link ? `<a href="${escapeHtml(ann.link)}" target="_blank" rel="noopener" class="announcement-list-link"><span class="material-symbols-outlined">open_in_new</span> View Link</a>` : ''}
          <div class="announcement-list-actions">
            <button class="btn btn-outline btn-sm edit-announcement" data-id="${ann.id}">
              <span class="material-symbols-outlined" style="font-size: 16px;">edit</span> Edit
            </button>
            <button class="btn btn-outline btn-sm delete-announcement" data-id="${ann.id}" style="color: var(--color-error); border-color: var(--color-error);">
              <span class="material-symbols-outlined" style="font-size: 16px;">delete</span> Delete
            </button>
          </div>
        </div>
      `).join('');

      listContainer.querySelectorAll('.edit-announcement').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.id;
          const ann = items.find(a => a.id === id);
          if (!ann) return;

          editingId = id;
          document.getElementById('ann-title').value = ann.title || '';
          document.getElementById('ann-message').value = ann.message || '';
          document.getElementById('ann-date').value = ann.announcement_date || '';
          document.getElementById('ann-time').value = ann.announcement_time || '';
          document.getElementById('ann-link').value = ann.link || '';

          const submitBtn = form.querySelector('button[type="submit"]');
          submitBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 18px;">edit</span> Update Announcement';

          window.scrollTo({ top: 0, behavior: 'smooth' });
        });
      });

      listContainer.querySelectorAll('.delete-announcement').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Delete this announcement? This cannot be undone.')) return;
          try {
            await api.delete('/announcements/' + btn.dataset.id);
            Toast.success('Announcement deleted');
            await loadAnnouncements();
          } catch (error) {
            Toast.error('Failed to delete: ' + error.message);
          }
        });
      });
    } catch (error) {
      listContainer.innerHTML = `<div class="announcement-empty"><p>Failed to load announcements: ${escapeHtml(error.message)}</p></div>`;
    }
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      alertContainer.innerHTML = '';

      const title = document.getElementById('ann-title').value.trim();
      const message = document.getElementById('ann-message').value.trim();
      const announcement_date = document.getElementById('ann-date').value || null;
      const announcement_time = document.getElementById('ann-time').value || null;
      const link = document.getElementById('ann-link').value.trim() || null;

      if (!title || !message) {
        showAlert('announcement-alert', 'Please fill in all required fields.', 'error');
        return;
      }

      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 18px;">hourglass_empty</span> Processing...';

      try {
        if (editingId) {
          await api.put('/announcements/' + editingId, { title, message, announcement_date, announcement_time, link });
          Toast.success('Announcement updated');
          editingId = null;
          submitBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 18px;">send</span> Send Announcement';
        } else {
          await api.post('/announcements', { title, message, announcement_date, announcement_time, link });
          Toast.success('Announcement sent');
          form.reset();
        }
        await loadAnnouncements();
      } catch (error) {
        const friendlyError = getUserFriendlyError(error);
        showAlert('announcement-alert', friendlyError, 'error');
        showPushNotification('Announcement Failed', {
          body: friendlyError,
          icon: '/IMAGES/choir-logo.jpg'
        });
      } finally {
        submitBtn.disabled = false;
        if (!editingId) {
          submitBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 18px;">send</span> Send Announcement';
        } else {
          submitBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 18px;">edit</span> Update Announcement';
        }
      }
    });
  }

  function showAlert(containerId, message, type) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const alertDiv = document.createElement('div');
    alertDiv.className = type === 'success' ? 'alert alert-success' : 'alert alert-error';
    alertDiv.style.marginBottom = '1rem';
    alertDiv.textContent = message;
    container.innerHTML = '';
    container.appendChild(alertDiv);
    setTimeout(() => alertDiv.remove(), 5000);
  }

  await loadAnnouncements();
});
