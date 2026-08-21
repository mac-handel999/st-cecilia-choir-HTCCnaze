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
  mountPortalNav('create-event');

  const form = document.getElementById('create-event-form');
  if (!form) return;

  const titleInput = document.getElementById('event-title');
  const typeInput = document.getElementById('event-type');
  const dateInput = document.getElementById('event-date');

  function clearErrors() {
    document.querySelectorAll('.form-error').forEach(el => el.classList.remove('visible'));
  }

  function showFieldError(id, show) {
    const el = document.getElementById(id);
    if (el) {
      if (show) el.classList.add('visible');
      else el.classList.remove('visible');
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();

    const title = titleInput.value.trim();
    const type = typeInput.value;
    const date = dateInput.value;
    const time = document.getElementById('event-time').value.trim();
    const location = document.getElementById('event-location').value.trim();
    const description = document.getElementById('event-description').value.trim();
    const imageUrl = document.getElementById('event-image').value.trim();

    let hasError = false;
    if (!title) {
      showFieldError('title-error', true);
      hasError = true;
    }
    if (!type) {
      showFieldError('type-error', true);
      hasError = true;
    }
    if (!date) {
      showFieldError('date-error', true);
      hasError = true;
    }
    if (hasError) return;

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 18px;">hourglass_empty</span> Creating...';

    try {
      const eventData = {
        title,
        type,
        event_date: date,
        time,
        description,
        location,
        image_url: imageUrl,
        created_by: getCurrentUser()?.id
      };

      await api.post('/events', eventData);
      Toast.success('Event created successfully!');
      form.reset();

      setTimeout(() => {
        window.location.href = 'admin-dashboard.html';
      }, 1500);
    } catch (error) {
      Toast.error('Failed to create event: ' + error.message);
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 18px;">add</span> Create Event';
    }
  });
});
