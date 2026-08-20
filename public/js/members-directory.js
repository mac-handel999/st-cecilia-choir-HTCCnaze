if (!requireAuth()) {
  throw new Error('Auth required');
}

document.addEventListener('DOMContentLoaded', async () => {
  ThemeManager.init();
  Toast.init();
  mountPortalNav('directory');

  let members = [];
  let activeFilter = 'all';

  try {
    members = asArray(await api.get('/users'));
  } catch (error) {
    Toast.error('Failed to load members: ' + error.message);
  }

  const container = document.getElementById('members-list');
  if (!container) return;

  function formatBirthday(dob) {
    if (!dob) return '';
    const d = new Date(dob);
    if (Number.isNaN(d.getTime())) return dob;
    return d.toLocaleDateString('en-NG', { month: 'long', day: 'numeric' });
  }

  function render(list) {
    if (list.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📭</div><div class="empty-state-title">No members found</div></div>';
      return;
    }

    container.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3" style="gap: 1rem;">${list.map(m => {
      const initials = getInitials(m.full_name || m.username);
      const isExco = m.role === 'exco' || m.role === 'admin' || m.executive_position;
      return `<article class="member-card ${isExco ? 'member-card-exco' : ''}">
        <div class="member-avatar ${isExco ? 'member-avatar-gold' : ''}">${initials}</div>
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 600; color: var(--color-primary); font-size: 0.95rem;">${escapeHtml(m.full_name || m.username)}</div>
          <div style="font-size: 0.8rem; color: var(--color-text-muted);">@${escapeHtml(m.username || '')}</div>
          <div style="font-size: 0.8rem; color: var(--color-text-muted); margin-top: 0.25rem;">
            ${m.choir_part ? `<span>${escapeHtml(m.choir_part)}</span>` : ''}
            ${m.phone_number ? `<span> · ${escapeHtml(m.phone_number)}</span>` : ''}
          </div>
          ${m.address ? `<div style="font-size: 0.75rem; color: var(--color-text-light); margin-top: 0.25rem;">${escapeHtml(m.address)}</div>` : ''}
          ${m.date_of_birth ? `<div style="font-size: 0.75rem; color: var(--color-text-light);">🎂 ${escapeHtml(formatBirthday(m.date_of_birth))}</div>` : ''}
        </div>
        ${m.phone_number ? `<a href="tel:${escapeHtml(m.phone_number.replace(/\s/g, ''))}" class="member-contact-btn" title="Call"><span class="material-symbols-outlined">call</span></a>` : ''}
      </article>`;
    }).join('')}</div>`;
  }

  function applyFilters() {
    const q = (document.getElementById('directory-search')?.value || '').toLowerCase();
    let filtered = members;

    if (activeFilter === 'exco') {
      filtered = filtered.filter(m => m.role === 'exco' || m.role === 'admin' || m.executive_position);
    } else if (activeFilter !== 'all') {
      filtered = filtered.filter(m => (m.choir_part || '').toLowerCase() === activeFilter);
    }

    if (q) {
      filtered = filtered.filter(m =>
        (m.full_name || '').toLowerCase().includes(q) ||
        (m.username || '').toLowerCase().includes(q) ||
        (m.choir_part || '').toLowerCase().includes(q) ||
        (m.phone_number || '').toLowerCase().includes(q)
      );
    }

    render(filtered);
  }

  render(members);

  document.getElementById('directory-search')?.addEventListener('input', debounce(applyFilters, 300));

  document.querySelectorAll('[data-voice-filter]').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('[data-voice-filter]').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeFilter = chip.dataset.voiceFilter;
      applyFilters();
    });
  });

  Realtime.subscribe('users', () => {
    api.get('/users').then(data => {
      members = asArray(data);
      applyFilters();
    }).catch(() => {});
  });
});
