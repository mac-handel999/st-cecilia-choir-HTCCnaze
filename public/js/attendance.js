if (!requireAuth()) {
  throw new Error('Auth required');
}

document.addEventListener('DOMContentLoaded', async () => {
  ThemeManager.init();
  Toast.init();
  mountPortalNav('home');

  const memberSelect = document.getElementById('att-member');
  const attendanceList = document.getElementById('attendance-list');
  const attendanceForm = document.getElementById('attendance-form');

  if (!memberSelect || !attendanceList || !attendanceForm) return;

  try {
    const members = asArray(await api.get('/users'));
    if (members.length > 0) {
      memberSelect.innerHTML = '<option value="">Select member</option>' + members.map(m =>
        `<option value="${m.id}">${escapeHtml(m.full_name || m.username)} (${escapeHtml(m.choir_part || 'N/A')})</option>`
      ).join('');
    }
  } catch (error) {
    Toast.error('Failed to load members: ' + error.message);
  }

  async function loadAttendance() {
    try {
      const records = asArray(await api.get('/attendance'));
      if (records.length === 0) {
        showEmpty('attendance-list', 'No attendance records yet', 'Start by marking attendance above.');
        return;
      }
      attendanceList.innerHTML = records.slice(0, 20).map(a => `
        <div class="attendance-row">
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 600; color: var(--color-primary); font-size: 0.9rem;">Member ID: ${escapeHtml(a.member_id)}</div>
            <div style="font-size: 0.8rem; color: var(--color-text-muted);">${escapeHtml(a.event_name || '')} — ${formatDate(a.event_date || a.created_at)}</div>
          </div>
          <span class="${a.status === 'present' ? 'present-badge' : a.status === 'excused' ? 'excused-badge' : 'absent-badge'}">${escapeHtml(a.status || 'Unknown')}</span>
        </div>
      `).join('');
    } catch (error) {
      Toast.error('Failed to load attendance: ' + error.message);
    }
  }

  await loadAttendance();

  attendanceForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const date = document.getElementById('att-date').value;
    const type = document.getElementById('att-type').value;
    const memberId = document.getElementById('att-member').value;
    const status = document.getElementById('att-status').value;

    if (!date || !memberId) {
      Toast.error('Please select date and member');
      return;
    }

    try {
      await api.post('/attendance', {
        event_date: date,
        event_name: type,
        member_id: memberId,
        status
      });
      Toast.success('Attendance saved!');
      attendanceForm.reset();
      await loadAttendance();
    } catch (error) {
      Toast.error('Failed to save: ' + error.message);
    }
  });
});
