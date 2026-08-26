document.addEventListener('DOMContentLoaded', function() {
  if (Auth.isLoggedIn()) {
    window.location.href = 'member-home.html';
    return;
  }

  const loginForm = document.getElementById('login-form');
  const alertContainer = document.getElementById('alert-container');
  const loginBtn = document.getElementById('login-btn');
  const loginText = document.getElementById('login-text');

  const togglePassword = document.getElementById('toggle-password');
  const passwordInput = document.getElementById('password');

  if (togglePassword && passwordInput) {
    togglePassword.addEventListener('click', () => {
      const isPassword = passwordInput.type === 'password';
      passwordInput.type = isPassword ? 'text' : 'password';
      togglePassword.querySelector('.material-symbols-outlined').textContent = isPassword ? 'visibility' : 'visibility_off';
    });
  }

  function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    alertContainer.innerHTML = '';

    const email = document.getElementById('email').value.trim();
    const password = passwordInput.value;
    const remember = document.getElementById('remember')?.checked || false;

    let hasError = false;
    if (!email || !validateEmail(email)) {
      document.getElementById('email-error').classList.add('visible');
      hasError = true;
    } else {
      document.getElementById('email-error').classList.remove('visible');
    }
    if (!password || password.length < 6) {
      document.getElementById('password-error').classList.add('visible');
      hasError = true;
    } else {
      document.getElementById('password-error').classList.remove('visible');
    }
    if (hasError) return;

    loginBtn.disabled = true;
    loginText.textContent = 'Logging in...';

    try {
      await Auth.login(email, password, remember);
      Toast.success('Login successful! Redirecting...');
      setTimeout(() => { window.location.href = 'member-home.html'; }, 1000);
    } catch (error) {
      showAlert('alert-container', error.message || 'Login failed. Please check your credentials.', 'error');
      loginBtn.disabled = false;
      loginText.textContent = 'Login to Portal';
    }
  });

  async function handleForgotPassword() {
    const email = document.getElementById('email').value.trim();
    if (!email || !validateEmail(email)) {
      showAlert('alert-container', 'Please enter your valid email address first to reset your password.', 'error');
      return;
    }
    try {
      await Auth.resetPassword(email);
      showAlert('alert-container', 'Password reset link sent! Check your email.', 'success');
    } catch (error) {
      showAlert('alert-container', error.message || 'Failed to send reset email.', 'error');
    }
  }
});
