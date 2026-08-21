document.addEventListener('DOMContentLoaded', function() {
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');
  const submitBtn = document.getElementById('submitBtn');
  const submitBtnText = document.getElementById('submitBtnText');
  const passwordInput = document.getElementById('password');
  const togglePassword = document.getElementById('togglePassword');
  const togglePasswordIcon = document.getElementById('togglePasswordIcon');
  const forgotPasswordLink = document.getElementById('forgotPasswordLink');
  const rememberMe = document.getElementById('rememberMe');

  if (togglePassword && passwordInput) {
    togglePassword.addEventListener('click', () => {
      const isPassword = passwordInput.type === 'password';
      passwordInput.type = isPassword ? 'text' : 'password';
      if (togglePasswordIcon) {
        togglePasswordIcon.textContent = isPassword ? 'visibility' : 'visibility_off';
      }
    });
  }

  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value.trim();
      if (!email || !validateEmail(email)) {
        showLoginError('Please enter a valid email address first');
        return;
      }

      forgotPasswordLink.textContent = 'Sending...';
      try {
        await Auth.resetPassword(email);
        showLoginError('Password reset email sent. Check your inbox.', 'success');
      } catch (error) {
        showLoginError(error.message || 'Failed to send reset email', 'error');
      } finally {
        forgotPasswordLink.textContent = 'Forgot Password?';
      }
    });
  }

  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function showLoginError(message, type = 'error') {
    if (!loginError) return;
    loginError.textContent = message;
    loginError.classList.add('visible');
    loginError.style.background = type === 'success' ? 'var(--color-success)' : 'var(--color-error-container)';
    loginError.style.color = type === 'success' ? '#fff' : 'var(--color-on-error-container)';
  }

  function hideLoginError() {
    if (!loginError) return;
    loginError.classList.remove('visible');
    loginError.textContent = '';
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideLoginError();

    const email = document.getElementById('email').value.trim();
    const password = passwordInput.value;

    let hasError = false;
    if (!email || !validateEmail(email)) {
      showLoginError('Please enter a valid email address');
      hasError = true;
    }
    if (!password || password.length < 6) {
      showLoginError('Password must be at least 6 characters');
      hasError = true;
    }
    if (hasError) return;

    submitBtn.disabled = true;
    submitBtnText.textContent = 'Authenticating...';

    try {
      const remember = rememberMe ? rememberMe.checked : false;
      const result = await Auth.login(email, password, remember);
      const user = result.user || Auth.getUser();

      if (!user || (user.role !== 'admin' && user.role !== 'exco')) {
        await Auth.logout();
        showLoginError('This portal is for choir administrators only');
        submitBtn.disabled = false;
        submitBtnText.textContent = 'Login to Admin Portal';
        return;
      }

      submitBtnText.textContent = 'Welcome, ' + (user.full_name || user.username);
      setTimeout(() => { window.location.href = 'admin-dashboard.html'; }, 1000);
    } catch (error) {
      showLoginError(error.message || 'Login failed. Please check your credentials.');
      submitBtn.disabled = false;
      submitBtnText.textContent = 'Login to Admin Portal';
    }
  });
});
