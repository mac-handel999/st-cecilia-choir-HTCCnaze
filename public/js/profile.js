if (!requireAuth()) {
  throw new Error('Auth required');
}

document.addEventListener('DOMContentLoaded', async () => {
  ThemeManager.init();
  Toast.init();
  mountPortalNav('profile');

  let currentUser = null;

  try {
    const user = await api.get('/auth/me');
    if (!user) {
      window.location.href = 'login.html';
      return;
    }
    currentUser = user;

    const data = await api.get(`/users/${user.id}`);
    const initials = getInitials(data.full_name || data.username);
    
    const avatarImg = document.getElementById('profile-avatar');
    const avatarInitials = document.getElementById('profile-avatar-initials');
    
    if (data.avatar_url) {
      avatarImg.src = data.avatar_url;
      avatarImg.style.display = 'block';
      avatarInitials.style.display = 'none';
    } else {
      avatarImg.style.display = 'none';
      avatarInitials.style.display = 'flex';
      avatarInitials.textContent = initials;
    }
    document.getElementById('profile-name').textContent = data.full_name || data.username;
    document.getElementById('profile-role').textContent = (data.choir_part || data.role || 'member').toString();

    const infoItems = [
      { icon: 'mail', label: 'Email', value: data.email },
      { icon: 'person', label: 'Username', value: data.username },
      { icon: 'phone', label: 'Phone', value: data.phone_number || 'Not set' },
      { icon: 'location_on', label: 'Address', value: data.address || 'Not set' },
      { icon: 'cake', label: 'Date of Birth', value: data.date_of_birth || 'Not set' },
      { icon: 'favorite', label: 'Marital Status', value: data.marital_status || 'Not set' },
      { icon: 'music_note', label: 'Choir Part', value: data.choir_part || 'Not set' },
      { icon: 'admin_panel_settings', label: 'Executive Position', value: data.executive_position || 'Not set' },
      { icon: 'event', label: 'Tenure', value: data.tenure || 'Not set' }
    ];

    document.getElementById('profile-info').innerHTML = infoItems.map(item => `
      <div class="info-item">
        <div class="info-icon"><span class="material-symbols-outlined">${item.icon}</span></div>
        <div style="flex: 1; min-width: 0;">
          <div class="info-label">${item.label}</div>
          <div class="info-value">${escapeHtml(item.value)}</div>
        </div>
      </div>
    `).join('');

    const editBtn = document.getElementById('edit-profile-btn');
    const modal = document.getElementById('edit-profile-modal');
    const closeBtn = document.getElementById('close-edit-profile');
    const cancelBtn = document.getElementById('cancel-edit-profile');
    const form = document.getElementById('edit-profile-form');

    if (editBtn && modal) {
      editBtn.addEventListener('click', () => {
        document.getElementById('edit-fullName').value = data.full_name || '';
        document.getElementById('edit-username').value = data.username || '';
        document.getElementById('edit-phoneNumber').value = data.phone_number || '';
        document.getElementById('edit-address').value = data.address || '';
        document.getElementById('edit-dateOfBirth').value = data.date_of_birth || '';
        document.getElementById('edit-maritalStatus').value = data.marital_status || '';
        document.getElementById('edit-choirPart').value = data.choir_part || '';
        document.getElementById('edit-executivePosition').value = data.executive_position || '';
        document.getElementById('edit-tenure').value = data.tenure || '';
        modal.classList.add('active');
      });
    }

    if (closeBtn) closeBtn.addEventListener('click', () => modal.classList.remove('active'));
    if (cancelBtn) cancelBtn.addEventListener('click', () => modal.classList.remove('active'));
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
      });
    }

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          const updated = await api.put(`/users/${user.id}`, {
            full_name: document.getElementById('edit-fullName').value.trim(),
            username: document.getElementById('edit-username').value.trim(),
            phone_number: document.getElementById('edit-phoneNumber').value.trim(),
            address: document.getElementById('edit-address').value.trim(),
            date_of_birth: document.getElementById('edit-dateOfBirth').value.trim(),
            marital_status: document.getElementById('edit-maritalStatus').value,
            choir_part: document.getElementById('edit-choirPart').value,
            executive_position: document.getElementById('edit-executivePosition').value.trim(),
            tenure: document.getElementById('edit-tenure').value.trim()
          });
          Toast.success('Profile updated successfully');
          modal.classList.remove('active');
          window.location.reload();
        } catch (error) {
          showAlert('edit-profile-alert', error.message || 'Failed to update profile', 'error');
        }
      });
    }

    const avatarUploadBtn = document.getElementById('avatar-upload-btn');
    const avatarInput = document.getElementById('avatar-input');
    const avatarImg = document.getElementById('profile-avatar');
    const avatarInitials = document.getElementById('profile-avatar-initials');

    if (avatarUploadBtn && avatarInput) {
      avatarUploadBtn.addEventListener('click', () => avatarInput.click());

      avatarInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 10 * 1024 * 1024) {
          Toast.error('Image size must not exceed 10MB');
          return;
        }

        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
        if (!allowedTypes.includes(file.type)) {
          Toast.error('Only JPG, PNG, and WebP images are allowed');
          return;
        }

        const reader = new FileReader();
        reader.onload = async (event) => {
          avatarImg.src = event.target.result;
          avatarImg.style.display = 'block';
          avatarInitials.style.display = 'none';
        };
        reader.readAsDataURL(file);

        const formData = new FormData();
        formData.append('avatar', file);

        avatarUploadBtn.disabled = true;
        avatarUploadBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 18px;">hourglass_empty</span>';

        try {
          await api.post(`/users/${user.id}/avatar`, formData);
          Toast.success('Profile picture updated!');
          setTimeout(() => window.location.reload(), 1000);
        } catch (error) {
          Toast.error(error.message || 'Failed to upload avatar');
          avatarImg.style.display = 'none';
          avatarInitials.style.display = 'flex';
        } finally {
          avatarUploadBtn.disabled = false;
          avatarUploadBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 18px;">camera_alt</span>';
        }
      });
    }
  } catch (error) {
    Toast.error('Failed to load profile: ' + error.message);
  }
});
