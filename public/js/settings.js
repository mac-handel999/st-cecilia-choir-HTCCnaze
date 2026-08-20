if (!requireAuth()) {
  throw new Error('Auth required');
}

document.addEventListener('DOMContentLoaded', async () => {
  ThemeManager.init();
  Toast.init();
  mountPortalNav('profile');
  mountPortalNav('profile');

  await loadSettings();

  const themeSelect = document.getElementById('theme-select');
  if (themeSelect) {
    themeSelect.value = ThemeManager.getThemeLabel();
    themeSelect.addEventListener('change', () => {
      ThemeManager.setTheme(themeSelect.value);
      saveSettings({ theme: ThemeManager.getTheme() });
      updateDarkModeToggle();
    });
  }

  const darkModeToggle = document.getElementById('dark-mode-toggle');
  const darkModeLabel = document.getElementById('dark-mode-label');
  if (darkModeToggle && darkModeLabel) {
    updateDarkModeToggle();
    darkModeToggle.addEventListener('change', () => {
      const newTheme = darkModeToggle.checked ? 'dark' : 'light';
      ThemeManager.setTheme(newTheme);
      saveSettings({ theme: newTheme });
      if (themeSelect) themeSelect.value = ThemeManager.getThemeLabel();
      darkModeLabel.textContent = darkModeToggle.checked ? 'On' : 'Off';
    });
  }

  function updateDarkModeToggle() {
    if (!darkModeToggle) return;
    const current = ThemeManager.getTheme();
    const isDark = current === 'dark';
    darkModeToggle.checked = isDark;
    if (darkModeLabel) darkModeLabel.textContent = isDark ? 'On' : 'Off';
  }

  const langSelect = document.getElementById('language-select');
  if (langSelect) {
    const savedLang = localStorage.getItem('st-cecilia-lang') || 'en';
    langSelect.value = savedLang;
    langSelect.addEventListener('change', () => {
      localStorage.setItem('st-cecilia-lang', langSelect.value);
      saveSettings({ language: langSelect.value });
    });
  }

  const twoFactor = document.getElementById('two-factor-auth');
  const twoFactorLabel = document.getElementById('two-factor-label');
  if (twoFactor && twoFactorLabel) {
    twoFactor.addEventListener('change', () => {
      twoFactorLabel.textContent = twoFactor.checked ? 'On' : 'Off';
      saveSettings({ two_factor_enabled: twoFactor.checked });
      Toast.info(twoFactor.checked ? 'Two-factor authentication enabled' : 'Two-factor authentication disabled');
    });
  }

  const emailNotif = document.getElementById('email-notifications');
  if (emailNotif) {
    emailNotif.addEventListener('change', () => {
      localStorage.setItem('st-cecilia-email-notif', emailNotif.checked);
      saveSettings({ email_notifications: emailNotif.checked });
    });
  }

  const pushNotif = document.getElementById('push-notifications');
  const pushStatus = document.getElementById('push-status');
  if (pushNotif && pushStatus) {
    if (Notification.permission === 'granted') {
      pushStatus.textContent = 'Enabled';
      pushNotif.checked = true;
    } else if (Notification.permission === 'denied') {
      pushStatus.textContent = 'Blocked by browser';
      pushNotif.disabled = true;
    }
    pushNotif.addEventListener('change', async () => {
      if (pushNotif.checked) {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
          pushStatus.textContent = 'Enabled';
          saveSettings({ push_notifications: true });
          Toast.success('Push notifications enabled');
        } else {
          pushStatus.textContent = 'Permission denied';
          pushNotif.checked = false;
          Toast.error('Push notification permission denied');
        }
      } else {
        pushStatus.textContent = 'Disabled';
        saveSettings({ push_notifications: false });
      }
    });
  }

  const deleteBtn = document.getElementById('delete-account-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      const confirmed = confirm('Are you sure you want to permanently delete your account? This action cannot be undone.');
      if (!confirmed) return;
      try {
        const user = await api.get('/auth/me');
        if (!user) throw new Error('Not authenticated');
        await api.delete(`/users/${user.id}`);
        await Auth.logout();
        Toast.success('Account deleted successfully');
        window.location.href = 'members.html';
      } catch (error) {
        Toast.error('Failed to delete account: ' + error.message);
      }
    });
  }

  const modal = document.getElementById('change-password-modal');
  const openBtn = document.getElementById('open-change-password');
  const closeBtn = document.getElementById('close-change-password');
  const cancelBtn = document.getElementById('cancel-change-password');
  const form = document.getElementById('change-password-form');

  if (modal && openBtn) {
    openBtn.addEventListener('click', () => modal.classList.add('active'));
    if (closeBtn) closeBtn.addEventListener('click', () => modal.classList.remove('active'));
    if (cancelBtn) cancelBtn.addEventListener('click', () => modal.classList.remove('active'));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('active');
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newPass = document.getElementById('new-password').value;
      const confirmPass = document.getElementById('confirm-password').value;
      if (newPass.length < 8) {
        showAlert('password-alert', 'Password must be at least 8 characters.', 'error');
        return;
      }
      if (newPass !== confirmPass) {
        showAlert('password-alert', 'Passwords do not match.', 'error');
        return;
      }
      try {
        await Auth.updatePassword(newPass);
        showAlert('password-alert', 'Password changed successfully!', 'success');
        form.reset();
        setTimeout(() => modal.classList.remove('active'), 1500);
      } catch (error) {
        showAlert('password-alert', error.message || 'Failed to change password.', 'error');
      }
    });
  }
});

async function loadSettings() {
  try {
    const settings = await api.get('/settings');
    if (settings.theme) ThemeManager.setTheme(settings.theme);
    if (settings.language) localStorage.setItem('st-cecilia-lang', settings.language);

    const themeSelect = document.getElementById('theme-select');
    if (themeSelect) themeSelect.value = ThemeManager.getThemeLabel();

    const emailNotif = document.getElementById('email-notifications');
    if (emailNotif && settings.email_notifications !== undefined) emailNotif.checked = settings.email_notifications;

    const pushNotif = document.getElementById('push-notifications');
    if (pushNotif && settings.push_notifications !== undefined) pushNotif.checked = settings.push_notifications;

    const twoFactor = document.getElementById('two-factor-auth');
    const twoFactorLabel = document.getElementById('two-factor-label');
    if (twoFactor && settings.two_factor_enabled !== undefined) {
      twoFactor.checked = settings.two_factor_enabled;
      if (twoFactorLabel) twoFactorLabel.textContent = twoFactor.checked ? 'On' : 'Off';
    }
  } catch {
    /* use local defaults */
  }
}

async function saveSettings(partial) {
  try {
    await api.put('/settings', partial);
  } catch {
    /* saved locally as fallback */
  }
}
