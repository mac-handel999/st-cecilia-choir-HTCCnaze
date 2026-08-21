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
      const avatarHtml = m.avatar_url
        ? `<img src="${escapeHtml(m.avatar_url)}?t=${Date.now()}" alt="${escapeHtml(m.full_name || m.username)}" class="member-avatar-img" loading="lazy" />`
        : `<div class="member-avatar ${isExco ? 'member-avatar-gold' : ''}">${initials}</div>`;
      return `<article class="member-card ${isExco ? 'member-card-exco' : ''}" data-member-id="${m.id}" onclick="openMemberProfile('${m.id}')">
        ${avatarHtml}
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 600; color: var(--color-primary); font-size: 0.95rem;">${escapeHtml(m.full_name || m.username)}</div>
          <div style="font-size: 0.8rem; color: var(--color-text-muted);">@${escapeHtml(m.username || '')}</div>
          <div style="font-size: 0.8rem; color: var(--color-text-muted); margin-top: 0.25rem;">
            ${m.choir_part ? `<span>${escapeHtml(m.choir_part)}</span>` : ''}
            ${m.phone_number ? `<span> · ${escapeHtml(m.phone_number)}</span>` : ''}
          </div>
          ${m.address ? `<div style="font-size: 0.75rem; color: var(--color-text-light); margin-top: 0.25rem;">${escapeHtml(m.address)}</div>` : ''}
          ${m.date_of_birth ? `<div style="font-size: 0.75rem; color: var(--color-text-light);">🎂 ${escapeHtml(formatBirthday(m.date_of_birth))}</div>` : ''}
          ${m.executive_position ? `<div style="font-size: 0.75rem; color: var(--color-accent); margin-top: 0.25rem; font-weight: 600;">${escapeHtml(m.executive_position)}</div>` : ''}
        </div>
        ${m.phone_number ? `<a href="tel:${escapeHtml(m.phone_number.replace(/\s/g, ''))}" class="member-contact-btn" title="Call" onclick="event.stopPropagation()"><span class="material-symbols-outlined">call</span></a>` : ''}
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

async function openMemberProfile(memberId) {
  const modal = document.getElementById('member-profile-modal');
  const content = document.getElementById('member-profile-content');
  if (!modal || !content) return;

  modal.classList.add('active');
  content.innerHTML = '<div class="spinner" style="margin: 2rem auto;"></div>';

  try {
    const member = await api.get(`/users/${memberId}`);
    const initials = getInitials(member.full_name || member.username);
    const avatarHtml = member.avatar_url
      ? `<img src="${escapeHtml(member.avatar_url)}?t=${Date.now()}" alt="${escapeHtml(member.full_name || member.username)}" style="width: 120px; height: 120px; border-radius: 50%; object-fit: contain; border: 4px solid var(--color-accent); margin-bottom: 1rem;" loading="lazy" />`
      : `<div style="width: 120px; height: 120px; border-radius: 50%; background: var(--color-primary); color: #FFFFFF; display: flex; align-items: center; justify-content: center; font-size: 2.5rem; font-weight: 700; margin-bottom: 1rem; border: 4px solid var(--color-accent);">${initials}</div>`;

    content.innerHTML = `
      <div style="text-align: center; margin-bottom: 1.5rem;">
        ${avatarHtml}
        <h3 style="font-family: var(--font-heading); font-size: 1.25rem; font-weight: 700; color: var(--color-primary); margin-bottom: 0.25rem;">${escapeHtml(member.full_name || member.username)}</h3>
        <p style="color: var(--color-text-muted); font-size: 0.9rem;">@${escapeHtml(member.username || '')}</p>
        ${member.role === 'exco' || member.role === 'admin' || member.executive_position ? '<span class="badge badge-accent" style="margin-top: 0.5rem; display: inline-block;">Executive</span>' : ''}
      </div>
      <div style="display: flex; flex-direction: column; gap: 0.75rem;">
        ${member.choir_part ? `<div class="info-item"><div class="info-icon"><span class="material-symbols-outlined">music_note</span></div><div><div class="info-label">Choir Part</div><div class="info-value">${escapeHtml(member.choir_part)}</div></div></div>` : ''}
        ${member.phone_number ? `<div class="info-item"><div class="info-icon"><span class="material-symbols-outlined">phone</span></div><div><div class="info-label">Phone</div><div class="info-value">${escapeHtml(member.phone_number)}</div></div></div>` : ''}
        ${member.email ? `<div class="info-item"><div class="info-icon"><span class="material-symbols-outlined">mail</span></div><div><div class="info-label">Email</div><div class="info-value">${escapeHtml(member.email)}</div></div></div>` : ''}
        ${member.address ? `<div class="info-item"><div class="info-icon"><span class="material-symbols-outlined">location_on</span></div><div><div class="info-label">Address</div><div class="info-value">${escapeHtml(member.address)}</div></div></div>` : ''}
        ${member.date_of_birth ? `<div class="info-item"><div class="info-icon"><span class="material-symbols-outlined">cake</span></div><div><div class="info-label">Date of Birth</div><div class="info-value">${escapeHtml(member.date_of_birth)}</div></div></div>` : ''}
        ${member.executive_position ? `<div class="info-item"><div class="info-icon"><span class="material-symbols-outlined">admin_panel_settings</span></div><div><div class="info-label">Executive Position</div><div class="info-value">${escapeHtml(member.executive_position)}</div></div></div>` : ''}
        ${member.tenure ? `<div class="info-item"><div class="info-icon"><span class="material-symbols-outlined">event</span></div><div><div class="info-label">Tenure</div><div class="info-value">${escapeHtml(member.tenure)}</div></div></div>` : ''}
      </div>
    `;
  } catch (error) {
    content.innerHTML = `<div class="empty-state"><div class="empty-state-title">Failed to load profile</div><div class="empty-state-desc">${escapeHtml(error.message)}</div></div>`;
  }
}

function closeMemberProfile() {
  const modal = document.getElementById('member-profile-modal');
  if (modal) modal.classList.remove('active');
}
