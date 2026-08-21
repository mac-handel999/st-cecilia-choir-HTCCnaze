function requireAdminOrExco() {
  const user = getCurrentUser();
  if (!user || (user.role !== 'admin' && user.role !== 'exco')) {
    window.location.href = 'member-home.html';
    return false;
  }
  return true;
}

if (!requireAdminOrExco()) {
  throw new Error('Forbidden');
}

document.addEventListener('DOMContentLoaded', async () => {
  ThemeManager.init();
  Toast.init();
  mountPortalNav('attendance');

  const eventSelect = document.getElementById('att-event');
  const memberList = document.getElementById('member-list');
  const saveBtn = document.getElementById('save-attendance-btn');
  const saveStatus = document.getElementById('save-status');
  const voiceFilters = document.getElementById('voice-filters');

  if (!eventSelect || !memberList || !saveBtn) return;

  let members = [];
  let selectedEventId = null;
  let selectedEventName = '';
  let activeVoiceFilter = 'all';
  const attendanceState = {};

  try {
    const events = asArray(await api.get('/events'));
    events.sort((a, b) => new Date(a.event_date || 0) - new Date(b.event_date || 0));

    eventSelect.innerHTML = '<option value="">Choose an event...</option>' + events.map(e => {
      const dateStr = e.event_date ? new Date(e.event_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
      return `<option value="${e.id}">${escapeHtml(e.title)}${dateStr ? ' - ' + dateStr : ''}</option>`;
    }).join('');

    eventSelect.addEventListener('change', async () => {
      selectedEventId = eventSelect.value;
      selectedEventName = eventSelect.options[eventSelect.selectedIndex]?.text || '';

      if (!selectedEventId) {
        memberList.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">event</div>
            <div class="empty-state-title">Select an event</div>
            <div class="empty-state-desc">Choose an event to mark attendance</div>
          </div>
        `;
        updateStats(0, 0, 0, 0);
        return;
      }

      await loadMembers();
      await loadExistingAttendance();
    });
  } catch (error) {
    Toast.error('Failed to load events: ' + error.message);
    eventSelect.innerHTML = '<option value="">Failed to load events</option>';
  }

  async function loadMembers() {
    try {
      members = asArray(await api.get('/users'));

      if (members.length === 0) {
        memberList.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">group</div>
            <div class="empty-state-title">No members found</div>
            <div class="empty-state-desc">Members will appear here when registered</div>
          </div>
        `;
        return;
      }

      renderMembers();
    } catch (error) {
      Toast.error('Failed to load members: ' + error.message);
      memberList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-title">Error loading members</div>
        </div>
      `;
    }
  }

  function renderMembers() {
    let filtered = members;
    if (activeVoiceFilter !== 'all') {
      filtered = members.filter(m => (m.choir_part || '').toLowerCase() === activeVoiceFilter);
    }

    if (filtered.length === 0) {
      memberList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">search_off</div>
          <div class="empty-state-title">No members found</div>
          <div class="empty-state-desc">Try a different voice filter</div>
        </div>
      `;
      return;
    }

    memberList.innerHTML = `
      <ul style="list-style: none; display: flex; flex-direction: column;">
        ${filtered.map(m => {
          const initials = getInitials(m.full_name || m.username || '?');
          const saved = attendanceState[m.id];
          const status = saved ? saved.status : 'absent';
          const reason = saved ? saved.reason || '' : '';

          return `
            <li style="padding: 1rem; border-bottom: 1px solid var(--color-border-light); display: grid; grid-template-columns: 1fr; gap: 0.75rem; align-items: center;" data-member-id="${m.id}">
              <div style="display: flex; align-items: center; gap: 1rem;">
                <div style="width: 40px; height: 40px; border-radius: 50%; background: var(--color-surface-alt); color: var(--color-text-muted); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.85rem; flex-shrink: 0;">
                  ${escapeHtml(initials)}
                </div>
                <div style="flex: 1; min-width: 0;">
                  <p style="font-weight: 600; color: var(--color-primary); font-size: 0.95rem; margin-bottom: 0.15rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(m.full_name || m.username)}</p>
                  <p style="font-size: 0.85rem; color: var(--color-text-light); text-transform: capitalize;">${escapeHtml(m.choir_part || 'N/A')}</p>
                </div>
              </div>
              <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;" data-member-id="${m.id}">
                <button class="attendance-status-btn" data-status="present" data-member="${m.id}" style="flex: 1; min-width: 80px; padding: 0.6rem; border-radius: 0.5rem; font-size: 0.75rem; font-weight: 600; border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text-muted); cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 0.35rem; text-transform: uppercase; letter-spacing: 0.05em;">
                  <span class="material-symbols-outlined" style="font-size: 18px;">check_circle</span> Present
                </button>
                <button class="attendance-status-btn" data-status="absent" data-member="${m.id}" style="flex: 1; min-width: 80px; padding: 0.6rem; border-radius: 0.5rem; font-size: 0.75rem; font-weight: 600; border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text-muted); cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 0.35rem; text-transform: uppercase; letter-spacing: 0.05em;">
                  <span class="material-symbols-outlined" style="font-size: 18px;">cancel</span> Absent
                </button>
                <button class="attendance-status-btn" data-status="excused" data-member="${m.id}" style="flex: 1; min-width: 80px; padding: 0.6rem; border-radius: 0.5rem; font-size: 0.75rem; font-weight: 600; border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text-muted); cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 0.35rem; text-transform: uppercase; letter-spacing: 0.05em;">
                  <span class="material-symbols-outlined" style="font-size: 18px;">event_busy</span> Excused
                </button>
              </div>
              <div class="reason-input-wrapper" data-member="${m.id}" style="display: ${status === 'excused' ? 'block' : 'none'}; margin-top: 0.25rem;">
                <input type="text" class="reason-input" data-member="${m.id}" placeholder="Enter reason (e.g., Illness, Work)" value="${escapeHtml(reason)}" style="width: 100%; padding: 0.6rem 0.75rem; border: 1px solid var(--color-border); border-radius: 0.5rem; background: var(--color-surface); color: var(--color-text); font-size: 0.9rem;"/>
              </div>
            </li>
          `;
        }).join('')}
      </ul>
    `;

    attachStatusListeners();
    updateStatsUI();
  }

  function attachStatusListeners() {
    document.querySelectorAll('.attendance-status-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const memberId = btn.dataset.member;
        const status = btn.dataset.status;

        attendanceState[memberId] = { status, reason: attendanceState[memberId]?.reason || '' };

        const row = btn.closest('li[data-member-id]');
        if (!row) return;

        const buttons = row.querySelectorAll('.attendance-status-btn');
        const reasonWrapper = row.querySelector('.reason-input-wrapper');

        buttons.forEach(b => {
          const s = b.dataset.status;
          b.style.background = 'var(--color-surface)';
          b.style.color = 'var(--color-text-muted)';
          b.style.borderColor = 'var(--color-border)';
          b.querySelector('.material-symbols-outlined').classList.remove('icon-fill');
        });

        if (status === 'present') {
          btn.style.background = 'var(--color-primary-container)';
          btn.style.color = 'var(--color-on-primary-container)';
          btn.style.borderColor = 'var(--color-primary-container)';
        } else if (status === 'absent') {
          btn.style.background = 'var(--color-error-container)';
          btn.style.color = 'var(--color-on-error-container)';
          btn.style.borderColor = 'var(--color-error-container)';
        } else if (status === 'excused') {
          btn.style.background = 'var(--color-surface-variant)';
          btn.style.color = 'var(--color-text-muted)';
          btn.style.borderColor = 'var(--color-outline)';
        }

        btn.querySelector('.material-symbols-outlined').classList.add('icon-fill');

        if (reasonWrapper) {
          reasonWrapper.style.display = status === 'excused' ? 'block' : 'none';
        }

        updateStatsUI();
      });
    });

    document.querySelectorAll('.reason-input').forEach(input => {
      input.addEventListener('input', () => {
        const memberId = input.dataset.member;
        if (attendanceState[memberId]) {
          attendanceState[memberId].reason = input.value;
        }
      });
    });
  }

  function updateStatsUI() {
    const values = Object.values(attendanceState);
    const present = values.filter(v => v.status === 'present').length;
    const absent = values.filter(v => v.status === 'absent').length;
    const excused = values.filter(v => v.status === 'excused').length;
    const total = values.length;
    updateStats(present, absent, excused, total);
  }

  function updateStats(present, absent, excused, total) {
    const presentEl = document.getElementById('stat-present');
    const absentEl = document.getElementById('stat-absent');
    const excusedEl = document.getElementById('stat-excused');
    const totalEl = document.getElementById('stat-total');

    if (presentEl) presentEl.textContent = present;
    if (absentEl) absentEl.textContent = absent;
    if (excusedEl) excusedEl.textContent = excused;
    if (totalEl) totalEl.textContent = total;
  }

  if (voiceFilters) {
    voiceFilters.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-voice]');
      if (!btn) return;

      activeVoiceFilter = btn.dataset.voice;

      voiceFilters.querySelectorAll('button[data-voice]').forEach(b => {
        b.classList.remove('active');
      });

      btn.classList.add('active');

      renderMembers();
    });
  }

  async function loadExistingAttendance() {
    if (!selectedEventId) return;

    try {
      const records = asArray(await api.get('/attendance'));
      const eventRecords = records.filter(r => r.event_name === selectedEventName || r.event_date === selectedEventId);

      eventRecords.forEach(r => {
        attendanceState[r.member_id] = {
          status: r.status || 'absent',
          reason: r.reason || ''
        };
      });

      renderMembers();
    } catch (error) {
      console.error('Failed to load existing attendance:', error);
    }
  }

  saveBtn.addEventListener('click', async () => {
    if (!selectedEventId) {
      Toast.error('Please select an event first');
      return;
    }

    const entries = Object.entries(attendanceState);
    if (entries.length === 0) {
      Toast.error('No attendance records to save');
      return;
    }

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 20px;">hourglass_empty</span> Saving...';
    saveStatus.textContent = 'Saving...';

    try {
      const records = entries.map(([memberId, data]) => ({
        event_date: selectedEventId,
        event_name: selectedEventName,
        member_id: memberId,
        status: data.status,
        reason: data.reason || null
      }));

      const result = await api.post('/attendance/bulk', {
        event_date: selectedEventId,
        event_name: selectedEventName,
        records
      });

      const count = Array.isArray(result) ? result.length : records.length;
      Toast.success('Attendance saved for ' + count + ' members!');
      saveStatus.textContent = 'Saved ' + count + ' records';
    } catch (error) {
      Toast.error('Failed to save attendance: ' + error.message);
      saveStatus.textContent = 'Save failed';
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 20px;">save</span> Save Attendance';
    }
  });
});
