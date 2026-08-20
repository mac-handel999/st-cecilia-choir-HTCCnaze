function switchTab(tab) {
  const loginTab = document.getElementById('login-tab');
  const registerTab = document.getElementById('register-tab');
  const loginBtn = document.getElementById('tab-login-btn');
  const registerBtn = document.getElementById('tab-register-btn');

  if (tab === 'login') {
    loginTab.style.display = 'block';
    registerTab.style.display = 'none';
    loginBtn.classList.add('active');
    registerBtn.classList.remove('active');
  } else {
    loginTab.style.display = 'none';
    registerTab.style.display = 'block';
    loginBtn.classList.remove('active');
    registerBtn.classList.add('active');
  }
}

function showForgotPassword() {
  const email = document.getElementById('login-email').value.trim();
  if (!email || !email.includes('@')) {
    showAlert('login-alert-container', 'Please enter your email address first to reset your password.', 'error');
    return;
  }
  Auth.resetPassword(email).then(() => {
    showAlert('login-alert-container', 'Password reset link sent! Check your email.', 'success');
  }).catch(err => {
    showAlert('login-alert-container', err.message || 'Failed to send reset email.', 'error');
  });
}

function showAlert(containerId, message, type) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const alertDiv = document.createElement('div');
  alertDiv.className = type === 'success' ? 'alert alert-success' : 'alert alert-error';
  alertDiv.style.marginBottom = '1rem';
  alertDiv.textContent = message;
  container.innerHTML = '';
  container.appendChild(alertDiv);
  setTimeout(() => alertDiv.remove(), 5000);
}

document.addEventListener('DOMContentLoaded', function() {
  ThemeManager.init();
  Toast.init();

  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const alertContainer = document.getElementById('login-alert-container');
      alertContainer.innerHTML = '';

      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;

      let hasError = false;
      if (!email || !email.includes('@')) {
        document.getElementById('login-email-error').classList.add('visible');
        hasError = true;
      } else {
        document.getElementById('login-email-error').classList.remove('visible');
      }
      if (!password || password.length < 6) {
        document.getElementById('login-password-error').classList.add('visible');
        hasError = true;
      } else {
        document.getElementById('login-password-error').classList.remove('visible');
      }
      if (hasError) return;

      try {
        await Auth.login(email, password);
        Toast.success('Login successful! Redirecting...');
        setTimeout(() => { window.location.href = 'member-home.html'; }, 1000);
      } catch (error) {
        showAlert('login-alert-container', error.message || 'Login failed. Please check your credentials.', 'error');
      }
    });
  }

  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const alertContainer = document.getElementById('register-alert-container');
      alertContainer.innerHTML = '';

      const fullName = document.getElementById('reg-fullName').value.trim();
      const username = document.getElementById('reg-username').value.trim();
      const email = document.getElementById('reg-email').value.trim();
      const password = document.getElementById('reg-password').value;
      const choirPart = document.getElementById('reg-choirPart').value;
      const address = document.getElementById('reg-address').value.trim();
      const phoneNumber = document.getElementById('reg-phoneNumber').value.trim();
      const dateOfBirth = document.getElementById('reg-dateOfBirth').value.trim();
      const maritalStatus = document.getElementById('reg-maritalStatus').value;
      const executivePosition = document.getElementById('reg-executivePosition').value.trim();
      const tenure = document.getElementById('reg-tenure').value.trim();
      const pledge = document.getElementById('reg-pledge').checked;

      if (!fullName || !username || !email || !password || !choirPart || !address || !phoneNumber || !pledge) {
        showAlert('register-alert-container', 'Please fill in all required fields.', 'error');
        return;
      }
      if (!email.includes('@')) {
        showAlert('register-alert-container', 'Please enter a valid email address.', 'error');
        return;
      }
      if (password.length < 6) {
        showAlert('register-alert-container', 'Password must be at least 6 characters.', 'error');
        return;
      }

      try {
        await Auth.register(email, password, {
          full_name: fullName,
          username,
          choir_part: choirPart,
          address,
          phone_number: phoneNumber,
          date_of_birth: dateOfBirth,
          marital_status: maritalStatus,
          executive_position: executivePosition,
          tenure
        });
        showAlert('register-alert-container', 'Account created successfully! Redirecting to home...', 'success');
        setTimeout(() => { window.location.href = 'member-home.html'; }, 1500);
      } catch (error) {
        showAlert('register-alert-container', error.message || 'Registration failed. Please try again.', 'error');
      }
    });
  }
});
