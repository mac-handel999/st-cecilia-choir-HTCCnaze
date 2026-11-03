if (!requireAuth()) {
  throw new Error('Auth required');
}

function decodeVapidPublicKey(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), character => character.charCodeAt(0));
}

async function savePushSubscription() {
  const { publicKey } = await api.get('/push/vapid-public-key');
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeVapidPublicKey(publicKey)
    });
  }
  await api.post('/push/subscribe', subscription.toJSON());
}

async function removePushSubscription() {
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await api.delete('/push/subscribe', { endpoint: subscription.endpoint });
  await subscription.unsubscribe();
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
    const pushSupported = 'Notification' in window
      && 'serviceWorker' in navigator
      && 'PushManager' in window
      && window.isSecureContext;
    if (!pushSupported) {
      pushStatus.textContent = 'Not available in this browser';
      pushNotif.disabled = true;
    } else {
      pushNotif.checked = Notification.permission === 'granted';
      pushNotif.disabled = Notification.permission === 'denied';
      pushStatus.textContent = Notification.permission === 'granted'
        ? 'Allowed on this device'
        : Notification.permission === 'denied'
          ? 'Blocked by browser'
          : 'Not enabled';
    }
    pushNotif.addEventListener('change', async () => {
      if (pushNotif.checked) {
        try {
          const permission = Notification.permission === 'granted'
            ? 'granted'
            : await Notification.requestPermission();
          if (permission !== 'granted') {
            pushStatus.textContent = permission === 'denied' ? 'Blocked by browser' : 'Not enabled';
            pushNotif.checked = false;
            Toast.error('Notifications were not allowed. You can enable them in your browser settings.');
            return;
          }

          await navigator.serviceWorker.register('/service-worker.js', { updateViaCache: 'none' });
          await savePushSubscription();
          const saved = await saveSettings({ push_notifications: true });
          const user = getCurrentUser();
          if (user?.id) localStorage.setItem(`st-cecilia-push-enabled:${user.id}`, String(saved));
          pushStatus.textContent = saved ? 'Allowed on this device' : 'Allowed, but your preference could not be saved';
          if (saved) Toast.success('Browser notifications are enabled on this device.');
          else {
            await removePushSubscription();
            pushNotif.checked = false;
          }
        } catch (error) {
          pushStatus.textContent = 'Could not enable notifications';
          pushNotif.checked = false;
          const user = getCurrentUser();
          if (user?.id) localStorage.setItem(`st-cecilia-push-enabled:${user.id}`, 'false');
          Toast.error(getUserFriendlyError(error));
        }
      } else {
        const saved = await saveSettings({ push_notifications: false });
        if (saved) {
          try {
            await removePushSubscription();
            pushStatus.textContent = 'Disabled';
            const user = getCurrentUser();
            if (user?.id) localStorage.setItem(`st-cecilia-push-enabled:${user.id}`, 'false');
            Toast.success('Browser notifications are turned off on this device.');
          } catch (error) {
            pushNotif.checked = true;
            pushStatus.textContent = 'Could not turn off notifications';
            Toast.error(getUserFriendlyError(error));
          }
        } else {
          pushNotif.checked = true;
        }
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

  function setupPasswordToggle(inputId, btnId) {
    const input = document.getElementById(inputId);
    const btn = document.getElementById(btnId);
    if (input && btn) {
      btn.addEventListener('click', () => {
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        btn.querySelector('.material-symbols-outlined').textContent = isPassword ? 'visibility' : 'visibility_off';
      });
    }
  }

  setupPasswordToggle('current-password', 'toggle-current-password');
  setupPasswordToggle('new-password', 'toggle-new-password');
  setupPasswordToggle('confirm-password', 'toggle-confirm-password');

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
    if (pushNotif && settings.push_notifications !== undefined) {
      const enabled = settings.push_notifications && 'Notification' in window && Notification.permission === 'granted';
      pushNotif.checked = enabled;
      const user = getCurrentUser();
      if (user?.id) localStorage.setItem(`st-cecilia-push-enabled:${user.id}`, String(enabled));
      const pushStatus = document.getElementById('push-status');
      if (pushStatus && settings.push_notifications && !enabled && 'Notification' in window && Notification.permission === 'denied') {
        pushStatus.textContent = 'Blocked by browser';
      }
      if (enabled && window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window) {
        savePushSubscription().catch(error => {
          console.error('[Push] Could not restore this device subscription:', error);
          Toast.error(getUserFriendlyError(error));
        });
      }
    }

    const twoFactor = document.getElementById('two-factor-auth');
    const twoFactorLabel = document.getElementById('two-factor-label');
    if (twoFactor && settings.two_factor_enabled !== undefined) {
      twoFactor.checked = settings.two_factor_enabled;
      if (twoFactorLabel) twoFactorLabel.textContent = twoFactor.checked ? 'On' : 'Off';
    }
  } catch (error) {
    Toast.error(getUserFriendlyError(error));
  }
}

async function saveSettings(partial) {
  try {
    await api.put('/settings', partial);
    return true;
  } catch (error) {
    Toast.error(getUserFriendlyError(error));
    return false;
  }
}
