if (!requireAuth()) {
  throw new Error('Auth required');
}

document.addEventListener('DOMContentLoaded', async () => {
  ThemeManager.init();
  Toast.init();
  mountPortalNav('attendance');

  const eventSelect = document.getElementById('att-event');
  const memberList = document.getElementById('member-list');
  const myAttendanceContent = document.getElementById('my-attendance-content');
  const saveBtn = document.getElementById('save-attendance-btn');
  const saveStatus = document.getElementById('save-status');
  const voiceFilters = document.getElementById('voice-filters');

  if (!eventSelect) return;

  const currentUser = getCurrentUser();
  const currentUserId = currentUser?.id;
  let selectedEventId = null;
  let selectedEventName = '';
  let activeVoiceFilter = 'all';
  const attendanceState = {};

  try {
    const events = asArray(await api.get('/events?order=event_date&ascending=false'));
    events.sort((a, b) => new Date(b.event_date || 0) - new Date(a.event_date || 0));

    if (events.length === 0) {
      eventSelect.innerHTML = '<option value="">No events yet...</option>';
    } else {
      eventSelect.innerHTML = '<option value="">Choose an event...</option>' + events.map(e => {
        const dateStr = e.event_date ? new Date(e.event_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
        return `<option value="${e.id}" data-date="${escapeHtml(e.event_date || '')}" data-event-time="${escapeHtml(e.event_time || '')}" data-location="${escapeHtml(e.location || '')}">${escapeHtml(e.title)}${dateStr ? ' - ' + dateStr : ''}</option>`;
      }).join('');
    }

    eventSelect.addEventListener('change', async () => {
      selectedEventId = eventSelect.value;
      selectedEventName = eventSelect.options[eventSelect.selectedIndex]?.text || '';

      if (!selectedEventId) {
        if (memberList) {
          memberList.innerHTML = `
            <div class="empty-state">
              <div class="empty-state-icon">event</div>
              <div class="empty-state-title">Select an event</div>
              <div class="empty-state-desc">Choose an event to mark attendance</div>
            </div>
          `;
        }
        if (myAttendanceContent) {
          myAttendanceContent.innerHTML = `
            <div class="empty-state">
              <div class="empty-state-icon">person</div>
              <div class="empty-state-title">Select an event</div>
              <div class="empty-state-desc">Choose an event above to mark your attendance</div>
            </div>
          `;
        }
        document.getElementById('event-info').style.display = 'none';
        return;
      }

      const selectedEvent = eventSelect.options[eventSelect.selectedIndex];
      document.getElementById('info-date').textContent = selectedEvent.dataset.date || '-';
      document.getElementById('info-time').textContent = selectedEvent.dataset.eventTime || 'TBD';
      document.getElementById('info-location').textContent = selectedEvent.dataset.location || 'TBD';
      document.getElementById('event-info').style.display = 'block';

      await loadMyAttendance();
      await loadSavedAttendance();
    });
  } catch (error) {
    Toast.error('Failed to load events: ' + error.message);
    eventSelect.innerHTML = '<option value="">Failed to load events</option>';
  }

  async function loadMyAttendance() {
    if (!selectedEventId || !currentUserId || !myAttendanceContent) return;

    try {
      const records = asArray(await api.get('/attendance'));
      const eventRecords = records.filter(r => r.member_id === currentUserId && (r.event_date === selectedEventId || r.event_name === selectedEventName));
      const myRecord = eventRecords[0] || null;

      myAttendanceContent.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 1rem;">
          <div>
            <p style="font-weight: 600; color: var(--color-text); margin-bottom: 0.75rem;">Select your attendance status:</p>
            <div style="display: flex; flex-wrap: wrap; gap: 0.75rem;">
              <button class="attendance-status-btn ${myRecord?.status === 'present' ? 'active' : ''}" data-status="present" style="flex: 1; min-width: 100px; padding: 0.75rem; border-radius: var(--radius-lg); font-size: 0.85rem; font-weight: 600; border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text-muted); cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 0.5rem; text-transform: uppercase; letter-spacing: 0.05em;">
                <span class="material-symbols-outlined" style="font-size: 20px;">check_circle</span> Present
              </button>
              <button class="attendance-status-btn ${myRecord?.status === 'absent' ? 'active' : ''}" data-status="absent" style="flex: 1; min-width: 100px; padding: 0.75rem; border-radius: var(--radius-lg); font-size: 0.85rem; font-weight: 600; border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text-muted); cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 0.5rem; text-transform: uppercase; letter-spacing: 0.05em;">
                <span class="material-symbols-outlined" style="font-size: 20px;">cancel</span> Absent
              </button>
              <button class="attendance-status-btn ${myRecord?.status === 'excused' ? 'active' : ''}" data-status="excused" style="flex: 1; min-width: 100px; padding: 0.75rem; border-radius: var(--radius-lg); font-size: 0.85rem; font-weight: 600; border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text-muted); cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 0.5rem; text-transform: uppercase; letter-spacing: 0.05em;">
                <span class="material-symbols-outlined" style="font-size: 20px;">event_busy</span> Excused
              </button>
            </div>
          </div>
          <div class="reason-input-wrapper" style="display: ${myRecord?.status === 'excused' ? 'block' : 'none'};">
            <label class="form-label" for="my-reason">Reason (optional)</label>
            <input type="text" id="my-reason" class="form-control" placeholder="Enter reason (e.g., Illness, Work)" value="${escapeHtml(myRecord?.reason || '')}">
          </div>
          <button id="save-my-attendance" class="btn btn-primary" style="width: 100%;">
            <span class="material-symbols-outlined" style="font-size: 18px;">save</span> Save My Attendance
          </button>
        </div>
      `;

      if (myRecord) {
        attendanceState[currentUserId] = { status: myRecord.status, reason: myRecord.reason || '' };
      }

      attachMyAttendanceListeners();
    } catch (error) {
      myAttendanceContent.innerHTML = `<div class="empty-state"><div class="empty-state-title">Error loading attendance</div></div>`;
    }
  }

  function attachMyAttendanceListeners() {
    document.querySelectorAll('#my-attendance-content .attendance-status-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const status = btn.dataset.status;

        document.querySelectorAll('#my-attendance-content .attendance-status-btn').forEach(b => {
          b.classList.remove('active');
          b.style.background = 'var(--color-surface)';
          b.style.color = 'var(--color-text-muted)';
          b.style.borderColor = 'var(--color-border)';
        });

        btn.classList.add('active');
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

        attendanceState[currentUserId] = { status, reason: attendanceState[currentUserId]?.reason || '' };

        const reasonWrapper = myAttendanceContent.querySelector('.reason-input-wrapper');
        if (reasonWrapper) {
          reasonWrapper.style.display = status === 'excused' ? 'block' : 'none';
        }
      });
    });

    const reasonInput = document.getElementById('my-reason');
    if (reasonInput) {
      reasonInput.addEventListener('input', () => {
        if (attendanceState[currentUserId]) {
          attendanceState[currentUserId].reason = reasonInput.value;
        }
      });
    }

    const saveMyBtn = document.getElementById('save-my-attendance');
    if (saveMyBtn) {
      saveMyBtn.addEventListener('click', async () => {
        if (!selectedEventId) {
          Toast.error('Please select an event first');
          return;
        }

        const myData = attendanceState[currentUserId];
        if (!myData) {
          Toast.error('Please select a status first');
          return;
        }

        saveMyBtn.disabled = true;
        saveMyBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 18px;">hourglass_empty</span> Saving...';

        try {
          await api.post('/attendance/bulk', {
            event_date: selectedEventId,
            event_name: selectedEventName,
            records: [{
              member_id: currentUserId,
              status: myData.status,
              reason: myData.reason || null
            }]
          });

          Toast.success('Attendance saved!');
          await loadSavedAttendance();
        } catch (error) {
          const friendlyError = getUserFriendlyError(error);
          Toast.error(friendlyError);
          showPushNotification('Attendance Error', {
            body: friendlyError,
            icon: '/IMAGES/choir-logo.jpg'
          });
        } finally {
          saveMyBtn.disabled = false;
          saveMyBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 18px;">save</span> Save My Attendance';
        }
      });
    }
  }

  async function loadSavedAttendance() {
    const container = document.getElementById('saved-attendance-list');
    if (!container) return;

    try {
      const records = asArray(await api.get('/attendance'));
      const events = asArray(await api.get('/events'));

      const grouped = {};
      records.forEach(r => {
        if (!grouped[r.event_date]) {
          grouped[r.event_date] = {
            event_date: r.event_date,
            event_name: r.event_name,
            records: []
          };
        }
        grouped[r.event_date].records.push(r);
      });

      const sortedKeys = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));
      const savedAttendanceRecords = sortedKeys.map(k => grouped[k]);

      if (savedAttendanceRecords.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">fact_check</div>
            <div class="empty-state-title">No attendance records</div>
            <div class="empty-state-desc">Attendance records will appear here after saving</div>
          </div>
        `;
        return;
      }

      container.innerHTML = savedAttendanceRecords.map(group => {
        const event = events.find(e => e.event_date === group.event_date) || {};
        const present = group.records.filter(r => r.status === 'present').length;
        const absent = group.records.filter(r => r.status === 'absent').length;
        const excused = group.records.filter(r => r.status === 'excused').length;
        const total = group.records.length;

        return `
          <div class="card" style="padding: 1.5rem; margin-bottom: 1rem;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
              <div style="flex: 1;">
                <h3 style="font-family: var(--font-heading); font-size: 1.1rem; font-weight: 700; color: var(--color-primary); margin-bottom: 0.5rem;">
                  ${escapeHtml(group.event_name || 'Unknown Event')}
                </h3>
                <div style="display: flex; flex-wrap: wrap; gap: 1rem; font-size: 0.85rem; color: var(--color-text-muted);">
                  <span><span class="material-symbols-outlined" style="font-size: 16px; vertical-align: middle;">calendar_today</span> ${escapeHtml(group.event_date || 'TBD')}</span>
                  ${event.event_time ? `<span><span class="material-symbols-outlined" style="font-size: 16px; vertical-align: middle;">schedule</span> ${escapeHtml(event.event_time)}</span>` : ''}
                  ${event.location ? `<span><span class="material-symbols-outlined" style="font-size: 16px; vertical-align: middle;">location_on</span> ${escapeHtml(event.location)}</span>` : ''}
                </div>
              </div>
            </div>
            <div style="display: flex; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap;">
              <span class="badge badge-success">Present: ${present}</span>
              <span class="badge badge-error">Absent: ${absent}</span>
              <span class="badge badge-accent">Excused: ${excused}</span>
              <span class="badge">Total: ${total}</span>
            </div>
            <div style="border-top: 1px solid var(--color-border-light); padding-top: 1rem;">
              <h4 style="font-size: 0.85rem; font-weight: 600; color: var(--color-text-light); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.75rem;">Attendees</h4>
              <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                ${group.records.map(r => {
                  const memberUrl = `/api/users/${r.member_id}`;
                  const memberName = r.member_name || r.member_username || 'Unknown';
                  const statusColors = {
                    present: 'color: var(--color-success);',
                    absent: 'color: var(--color-error);',
                    excused: 'color: var(--color-accent);'
                  };
                  return `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid var(--color-border-light);">
                      <span style="font-weight: 500; color: var(--color-text);">${escapeHtml(memberName)}</span>
                      <span style="font-size: 0.8rem; font-weight: 600; ${statusColors[r.status] || ''} text-transform: capitalize;">${r.status}${r.reason ? ' (' + escapeHtml(r.reason) + ')' : ''}</span>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          </div>
        `;
      }).join('');
    } catch (error) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-title">Error loading records</div></div>`;
    }
  }

  loadSavedAttendance();
});
