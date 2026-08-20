document.addEventListener('DOMContentLoaded', function() {
  if (Auth.isLoggedIn()) {
    window.location.href = 'member-home.html';
    return;
  }

  const registerForm = document.getElementById('register-form');
  const alertContainer = document.getElementById('alert-container');
  const registerBtn = document.getElementById('register-btn');

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
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
      showAlert('alert-container', 'Please fill in all required fields.', 'error');
      return;
    }
    if (!email.includes('@')) {
      showAlert('alert-container', 'Please enter a valid email address.', 'error');
      return;
    }
    if (password.length < 6) {
      showAlert('alert-container', 'Password must be at least 6 characters.', 'error');
      return;
    }

    registerBtn.disabled = true;
    registerBtn.textContent = 'Creating Account...';

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
      showAlert('alert-container', 'Account created successfully! Redirecting to login...', 'success');
      setTimeout(() => { window.location.href = 'members.html'; }, 2000);
    } catch (error) {
      showAlert('alert-container', error.message || 'Registration failed. Please try again.', 'error');
      registerBtn.disabled = false;
      registerBtn.textContent = 'Create Account';
    }
  });
});
