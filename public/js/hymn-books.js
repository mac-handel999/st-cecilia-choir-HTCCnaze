if (!requireAuth()) {
  throw new Error('Auth required');
}

document.addEventListener('DOMContentLoaded', async () => {
  ThemeManager.init();
  mountPortalNav('hymns');

  try {
    await api.get('/auth/me');
  } catch (error) {
    const main = document.querySelector('.hymn-catalog-page');
    if (main) {
      const notice = document.createElement('p');
      notice.className = 'hymn-catalog-error';
      notice.setAttribute('role', 'alert');
      notice.textContent = error.message || 'Please sign in again to open the hymn library.';
      main.append(notice);
    }
  }
});
