const API_BASE = (() => {
  const port = window.location.port;
  if (port === '5500' || port === '3000' || port === '8080') {
    return 'http://localhost:5000/api';
  }
  return '/api';
})();

const api = {
  async request(endpoint, options = {}) {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    const headers = {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };

    let res;
    try {
      res = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers: { ...headers, ...options.headers }
      });
    } catch (error) {
      console.error('[API] Request could not reach the server:', {
        endpoint,
        error: error?.name || 'NetworkError'
      });
      throw new Error(getUserFriendlyError(error));
    }

    if (res.status === 401) {
      const path = window.location.pathname;
      const publicPages = ['/', '/index.html', '/About.html', '/privacy.html', '/terms.html', '/members.html', '/login.html', '/register.html', '/admin-login.html'];
      if (token && !publicPages.includes(path)) {
        clearCurrentUser();
        window.location.href = 'members.html';
      }
      throw new Error(getUserFriendlyError({ message: 'Unauthorized', status: 401 }));
    }

    if (res.status === 405) {
      throw new Error('This service is temporarily unavailable. Please try again later.');
    }

    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { message: text }; }

    if (!res.ok) {
      console.error('[API] Request failed:', {
        endpoint,
        status: res.status
      });
      throw new Error(getUserFriendlyError({
        message: data.message || `Request failed with status ${res.status}`,
        status: res.status
      }));
    }

    return data;
  },

  get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  },

  post(endpoint, body) {
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    const options = { method: 'POST' };
    if (isFormData) {
      options.body = body;
    } else {
      options.body = JSON.stringify(body);
      options.headers = { 'Content-Type': 'application/json' };
    }
    return this.request(endpoint, options);
  },

  put(endpoint, body) {
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    const options = { method: 'PUT' };
    if (isFormData) {
      options.body = body;
    } else {
      options.body = JSON.stringify(body);
      options.headers = { 'Content-Type': 'application/json' };
    }
    return this.request(endpoint, options);
  },

  delete(endpoint, body) {
    const options = { method: 'DELETE' };
    if (body !== undefined) {
      options.body = JSON.stringify(body);
      options.headers = { 'Content-Type': 'application/json' };
    }
    return this.request(endpoint, options);
  }
};

function getCurrentUser() {
  const local = localStorage.getItem('user');
  const session = sessionStorage.getItem('user');
  const raw = local || session;
  return raw ? JSON.parse(raw) : null;
}

function setCurrentUser(user, token, remember = false) {
  if (remember) {
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('token', token);
    sessionStorage.removeItem('user');
    sessionStorage.removeItem('token');
  } else {
    sessionStorage.setItem('user', JSON.stringify(user));
    sessionStorage.setItem('token', token);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
  }
}

function clearCurrentUser() {
  localStorage.removeItem('user');
  localStorage.removeItem('token');
  sessionStorage.removeItem('user');
  sessionStorage.removeItem('token');
}

function requireAuth() {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  if (!token) {
    window.location.href = 'members.html';
    return false;
  }
  return true;
}

function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function parseMarkdown(text) {
  if (!text) return '';
  let html = escapeHtml(text);
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.*?)_/g, '<em>$1</em>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  html = html.replace(/^(#{1,6})\s+(.+)$/gm, (match, hashes, content) => {
    const level = hashes.length;
    return `<h${level} style="font-family: var(--font-heading); color: var(--color-primary); margin: 0.5rem 0;">${content}</h${level}>`;
  });
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, '<ul style="margin-left: 1.5rem; margin-bottom: 0.5rem;">$1</ul>');
  html = html.replace(/<\/li>\n<li>/g, '</li><li>');
  html = html.replace(/\n/g, '<br>');
  return html;
}

function initHeroTyping() {
  const typingElements = document.querySelectorAll('.hero-typing-text');
  if (!typingElements.length) return;

  const texts = ['SING PRAISES,.....', 'ALLELUIA!!!', 'TO THE LORD...!!!!', 'HALLELUJAH!!!'];

  typingElements.forEach(el => {
    let textIndex = 0;
    let charIndex = 0;
    let isDeleting = false;

    function type() {
      const currentText = texts[textIndex];

      if (isDeleting) {
        charIndex--;
        el.textContent = currentText.substring(0, charIndex);
      } else {
        el.textContent = currentText.substring(0, charIndex + 1);
        charIndex++;
      }

      if (!isDeleting && charIndex < currentText.length) {
        setTimeout(type, 100);
      } else if (!isDeleting && charIndex >= currentText.length) {
        setTimeout(() => { isDeleting = true; type(); }, 1500);
      } else if (isDeleting && charIndex > 0) {
        setTimeout(type, 50);
      } else {
        isDeleting = false;
        charIndex = 0;
        textIndex = (textIndex + 1) % texts.length;
        setTimeout(type, 500);
      }
    }

    type();
  });
}

async function showPushNotification(title, options = {}) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const user = getCurrentUser();
  const preferenceKey = user?.id ? `st-cecilia-push-enabled:${user.id}` : null;
  if (!preferenceKey || localStorage.getItem(preferenceKey) !== 'true') return;

  const defaultOptions = {
    icon: '/IMAGES/choir-logo.jpg',
    badge: '/IMAGES/choir-logo.jpg',
    vibrate: [100, 50, 100],
    requireInteraction: false,
    ...options
  };

  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.showNotification(title, defaultOptions);
        return;
      }
    }

    if ('Notification' in window) {
      new Notification(title, defaultOptions);
    }
  } catch (error) {
    console.warn('Browser notification could not be displayed:', error);
  }
}

function getUserFriendlyError(error) {
  if (!error) return 'Something went wrong. Please try again.';

  const message = String(error.message || error);
  const normalized = message.toLowerCase();
  const status = Number(error.status);

  if (normalized.includes('network') || normalized.includes('fetch') || normalized.includes('failed to fetch') || error.name === 'TypeError') {
    return 'Network error. Please check your internet connection and try again.';
  }
  if (status === 401 || normalized.includes('unauthorized') || normalized.includes('invalid or expired token')) {
    return 'Your session has expired. Please log in again.';
  }
  if (status === 403 || normalized.includes('forbidden') || normalized.includes('permission denied') || normalized.includes('not allowed')) {
    return 'You don\'t have permission to perform this action.';
  }
  if (status === 404 || normalized.includes('not found')) {
    return 'The requested item was not found.';
  }
  if (normalized.includes('timeout') || normalized.includes('etimedout') || normalized.includes('aborted')) {
    return 'This is taking longer than expected. Please check your connection and try again.';
  }
  if (normalized.includes('google drive') || normalized.includes('drive api') || normalized.includes('quota exceeded')) {
    return 'We couldn\'t reach the choir music library right now. Please try again in a moment.';
  }
  if (normalized.includes('supabase') || normalized.includes('postgres') || normalized.includes('sqlstate')
    || /invalid input syntax|row-level security|\brls\b|foreign key|unique constraint|relation .* does not exist/i.test(message)
    || /\b(?:23505|23503|23502|42501|pgrst\d{3})\b/i.test(message)) {
    return 'We couldn\'t load or save that information right now. Please try again in a moment.';
  }
  if (normalized.includes('500') || normalized.includes('server error') || status >= 500) {
    return 'Something went wrong on our end. Please try again in a moment.';
  }
  if (normalized.includes('pdf') || normalized.includes('invalid file')) {
    return 'PDF file error. Please ensure the file is valid and try again.';
  }
  if (normalized.includes('size') || normalized.includes('large') || normalized.includes('exceeds')) {
    return 'File is too large. Please choose a smaller file.';
  }
  if (normalized.includes('duplicate') || normalized.includes('already exists')) {
    return 'This item already exists. Please use a different name.';
  }

  const looksTechnical = /\b(?:error|exception|constraint|relation|column|schema|stack|trace|undefined|null)\b/i.test(message)
    || message.length > 180
    || /https?:\/\/| at .*:\d+:\d+/.test(message);
  if (looksTechnical || (status >= 400 && status < 500 && !message.trim())) {
    return 'We couldn\'t complete that request. Please check your details and try again.';
  }
  return message;
}

function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-NG', { dateStyle: 'medium' });
}

function showEmpty(containerId, title, subtitle) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = `
    <div style="text-align:center;padding:3rem 1rem;color:var(--color-text-muted);">
      <span class="material-symbols-outlined" style="font-size:48px;opacity:0.5;">info</span>
      <h3 style="font-family:var(--font-heading);color:var(--color-primary);margin-top:1rem;">${escapeHtml(title)}</h3>
      ${subtitle ? `<p style="margin-top:0.5rem;">${escapeHtml(subtitle)}</p>` : ''}
    </div>
  `;
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function showAlert(containerId, message, type = 'info') {
  const container = document.getElementById(containerId);
  if (!container) return;
  const alertDiv = document.createElement('div');
  alertDiv.className = `alert-inline alert-inline-${type}`;
  alertDiv.setAttribute('role', type === 'error' ? 'alert' : 'status');
  alertDiv.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
  alertDiv.textContent = type === 'error' ? getUserFriendlyError(message) : message;
  container.appendChild(alertDiv);
  setTimeout(() => alertDiv.remove(), 5000);
}

function clearErrors(formId) {
  const form = document.getElementById(formId);
  if (!form) return;
  form.querySelectorAll('.form-error, .alert-inline').forEach(el => el.classList.remove('visible'));
}

const Auth = {
  async login(email, password, remember = false) {
    const result = await api.post('/auth/login', { email, password });
    setCurrentUser(result.user, result.token, remember);
    return result;
  },

  async register(email, password, metadata = {}) {
    const result = await api.post('/auth/register', {
      email,
      password,
      metadata
    });
    return result;
  },

  async logout() {
    try { await api.post('/auth/logout'); } catch {}
    clearCurrentUser();
    Realtime.disconnectAll();
  },

  async resetPassword(email) {
    return api.post('/auth/reset-password', { email });
  },

  async updatePassword(password) {
    return api.post('/auth/update-password', { password });
  },

  async me() {
    return api.get('/auth/me');
  },

  isLoggedIn() {
    return !!localStorage.getItem('token') || !!sessionStorage.getItem('token');
  },

  getUser() {
    return getCurrentUser();
  }
};

const DB = {
  async query(table, options = {}) {
    const params = new URLSearchParams();
    if (options.select) params.set('select', options.select);
    if (options.order) params.set('order', options.order);
    if (options.ascending !== undefined) params.set('ascending', options.ascending);
    if (options.limit) params.set('limit', options.limit);
    if (options.offset) params.set('offset', options.offset);

    const queryString = params.toString();
    const endpoint = `/${table}${queryString ? '?' + queryString : ''}`;
    return api.get(endpoint);
  },

  async insert(table, records) {
    const data = Array.isArray(records) ? records : [records];
    return api.post(`/${table}`, data);
  },

  async update(table, id, updates) {
    return api.put(`/${table}/${id}`, updates);
  },

  async delete(table, id) {
    return api.delete(`/${table}/${id}`);
  }
};

const Toast = {
  init() {
    if (document.getElementById('toast-container')) return;
    const container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  },
  show(message, type = 'info') {
    this.init();
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
    const userMessage = type === 'error' ? getUserFriendlyError(message) : message;
    toast.innerHTML = `<span class="toast-message">${escapeHtml(userMessage)}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 3000);
  },
  success(message) { this.show(message, 'success'); },
  error(message) { this.show(message, 'error'); },
  info(message) { this.show(message, 'info'); },
  warning(message) { this.show(message, 'warning'); }
};

const Realtime = {
  connections: new Map(),

  subscribe(table, callback) {
    let connection = this.connections.get(table);
    if (!connection) {
      connection = { callbacks: new Set(), controller: null, retryTimer: null, warned: false };
      this.connections.set(table, connection);
    }
    connection.callbacks.add(callback);

    if (connection.callbacks.size === 1) {
      this.startConnection(table);
    }

    return () => this.unsubscribe(table, callback);
  },

  unsubscribe(table, callback) {
    const connection = this.connections.get(table);
    if (!connection) return;

    connection.callbacks.delete(callback);
    if (connection.callbacks.size === 0) {
      this.stopConnection(table);
    }
  },

  startConnection(table) {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (!token) return;

    const isExpressServer = window.location.port === '5000' || window.location.port === '';
    if (!isExpressServer) return;

    const connection = this.connections.get(table);
    if (!connection || connection.controller) return;

    const controller = new AbortController();
    connection.controller = controller;

    (async () => {
      try {
        const response = await fetch(`/api/realtime/${encodeURIComponent(table)}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal
        });
        if (!response.ok) {
          if (response.status === 401) {
            clearCurrentUser();
            Toast.error('Your session has expired. Please log in again.');
            window.location.href = 'members.html';
          }
          throw new Error(`Live updates could not connect (${response.status}).`);
        }
        if (!response.body) throw new Error('Live updates are not supported by this browser.');

        connection.warned = false;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (this.connections.get(table) === connection) {
          const { value, done } = await reader.read();
          if (done) throw new Error('The live update connection ended.');
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split(/\r?\n\r?\n/);
          buffer = frames.pop() || '';

          for (const frame of frames) {
            const data = frame.split(/\r?\n/)
              .filter(line => line.startsWith('data:'))
              .map(line => line.slice(5).trim())
              .join('\n');
            if (!data) continue;

            try {
              const payload = JSON.parse(data);
              connection.callbacks.forEach(callback => callback(payload));
            } catch (error) {
              console.error('Live update could not be read:', error);
            }
          }
        }
      } catch (error) {
        if (controller.signal.aborted || this.connections.get(table) !== connection) return;
        console.error('Live update connection failed:', { table, error: error.message });
        if (!connection.warned) {
          Toast.warning('Live updates are temporarily paused. We will try to reconnect.');
          connection.warned = true;
        }
      } finally {
        if (connection.controller === controller) connection.controller = null;
        if (this.connections.get(table) === connection && connection.callbacks.size > 0) {
          connection.retryTimer = setTimeout(() => this.startConnection(table), 3000);
        }
      }
    })();
  },

  stopConnection(table) {
    const connection = this.connections.get(table);
    if (!connection) return;
    if (connection.retryTimer) clearTimeout(connection.retryTimer);
    connection.controller?.abort();
    this.connections.delete(table);
  },

  disconnectAll() {
    Array.from(this.connections.keys()).forEach(table => this.stopConnection(table));
  }
};

function getIcon(name, size = 24) {
  return `<span class="material-symbols-outlined" style="font-size: ${size}px; line-height: 1;">${name}</span>`;
}

/* Normalize API responses — server returns arrays/objects directly */
function asArray(response) {
  if (Array.isArray(response)) return response;
  if (response && Array.isArray(response.data)) return response.data;
  return [];
}

function asObject(response) {
  if (response && typeof response === 'object' && !Array.isArray(response)) {
    if (response.data && typeof response.data === 'object') return response.data;
    return response;
  }
  return {};
}

function getInitials(name) {
  if (!name) return '?';
  return name.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

const REHEARSAL_SCHEDULE = [
  { day: 3, label: 'Wednesdays', target: 'Adults', time: '17:00', timeLabel: '5:00 PM WAT' },
  { day: 5, label: 'Fridays', target: 'Children Cardet Choir', time: '17:00', timeLabel: '5:00 PM WAT' },
  { day: 6, label: 'Saturdays', target: 'All Choristers', time: '17:00', timeLabel: '5:00 PM WAT' }
];

function getNextRehearsal() {
  const now = new Date();
  const currentDay = now.getDay();
  let nextDate = null;

  for (const slot of REHEARSAL_SCHEDULE) {
    let candidate = new Date(now);
    const daysUntil = (slot.day - currentDay + 7) % 7 || 7;
    candidate.setDate(now.getDate() + daysUntil);
    candidate.setHours(slot.time.split(':')[0], slot.time.split(':')[1], 0, 0);
    if (!nextDate || candidate < nextDate) {
      nextDate = candidate;
      nextDate._slot = slot;
    }
  }

  return nextDate;
}

const SCORE_CATEGORIES = [
  { id: 'all', label: 'All Scores', icon: 'library_music', url: '' },
  { id: 'choir-images', label: 'Choir Images', icon: 'image', url: 'https://drive.google.com/open?id=18YQK6kqSrO23v-zeNqSR2MfWtsvcTo1i&usp=drive_copy' },
  { id: 'general', label: 'General Scripts', icon: 'folder', url: 'https://drive.google.com/open?id=114SvQoQ1wK_nqtkNPAI_ZFJQKyDn7lGu&usp=drive_copy' },
  { id: 'entrance', label: 'Entrance hymns', icon: 'door_front', url: 'https://drive.google.com/open?id=1--GN7X5zJpxdBp-ScFV77BIFe_DuQETm&usp=drive_copy' },
  { id: 'kyrie', label: 'Kyrie Eleison', icon: 'music_note', url: 'https://drive.google.com/open?id=1-XUmIY4HaFicIbPCw5kZoDD-yXj3-OHK&usp=drive_copy' },
  { id: 'gloria', label: 'Glory To God', icon: 'piano', url: 'https://drive.google.com/open?id=1-eBrjRiwd7Gr119tV85uzVCFGcQjVIa1&usp=drive_copy' },
  { id: 'gospel-acclamation', label: 'Gospel Acclamation', icon: 'campaign', url: 'https://drive.google.com/open?id=1-bcQd-iQcoYHFyhlOwRl6_sKPf8dRlLz&usp=drive_copy' },
  { id: 'creed', label: "Apostle's Creed", icon: 'menu_book', url: 'https://drive.google.com/open?id=1-gu-tnpdCPH2rtMm-xIHog1P_TLyL6w6&usp=drive_copy' },
  { id: 'sanctus', label: 'SANCTUS / HOLY HOLY', icon: 'church', url: 'https://drive.google.com/open?id=1-fC6dwDvZ53mCLMRdkfh-SjIo1ClOgeH&usp=drive_copy' },
  { id: 'prayer-faithful', label: 'Prayer Of The Faithful', icon: 'volunteer_activism', url: 'https://drive.google.com/open?id=1-fC6dwDvZ53mCLMRdkfh-SjIo1ClOgeH&usp=drive_copy' },
  { id: 'offertory', label: 'Offertory hymns', icon: 'redeem', url: 'https://drive.google.com/open?id=1-kPlxTLJ8yIER7xe66BPDFLJvJiRR9Ek&usp=drive_copy' },
  { id: 'post-offertory', label: 'Post Offertory hymns', icon: 'queue_music', url: 'https://drive.google.com/open?id=1-q1UuD3NgFl6CGNeC-sXArfPW4dHaYv_&usp=drive_copy' },
  { id: 'communion', label: 'Communion hymns', icon: 'wine_bar', url: 'https://drive.google.com/open?id=1-qKU4YxIqAMEzUp_fenDtX49f9xHQ8Xv&usp=drive_copy' },
  { id: 'dismissal', label: 'Dismissal hymns', icon: 'exit_to_app', url: 'https://drive.google.com/open?id=1-uVX_ksLaUd5a4AMGxVfLdbuTkaP4fG6&usp=drive_copy' },
  { id: 'classicals', label: 'Classical songs', icon: 'theater_comedy', url: 'https://drive.google.com/open?id=1-x7Q9LrrnmAMB9i3-QzYzccch3LCNOau&usp=drive_copy' },
  { id: 'folk', label: 'Folk songs', icon: 'groups', url: 'https://drive.google.com/open?id=10-17hUkupzepVCt26B0B37dpZPuca4hx&usp=drive_copy' },
  { id: 'burial', label: 'Burial songs', icon: 'church', url: 'https://drive.google.com/open?id=10-oUDpai8y7wo6DYRLwxLh668JZPefSN&usp=drive_copy' },
  { id: 'lenten', label: 'Lenten songs', icon: 'filter_vintage', url: 'https://drive.google.com/open?id=1031BmLjhVcfb7bwzYqCglbIVpZR1oF-U&usp=drive_copy' },
  { id: 'easter', label: 'Easter songs', icon: 'egg', url: 'https://drive.google.com/open?id=1088Qbns8XiU-e_9bF6MEDmQXvp8O-fP2&usp=drive_copy' },
  { id: 'christmas', label: 'Christmas songs', icon: 'ac_unit', url: 'https://drive.google.com/open?id=105jybkf9j8fKkVBQuvwpB3loLrqDN1hG&usp=drive_copy' },
  { id: 'wedding', label: 'Wedding Songs', icon: 'favorite', url: 'https://drive.google.com/open?id=1N2htUMqt6ixOM6WlLO1x9OtIvzHxt5gl&usp=drive_copy' },
  { id: 'ebooks', label: 'E-Books', icon: 'tablet', url: 'https://drive.google.com/open?id=1RObwf6U_GFyKdGMm_V5IKU6dpgIkcJa9&usp=drive_copy' },
  { id: 'music-boom', label: 'Music Boom Season 1.', icon: 'album', url: 'https://drive.google.com/open?id=13K_C2Ilv3Sn4E3b7-GA3xg7C9P82_73R&usp=drive_copy' }
];

const PORTAL_NAV_ITEMS = [
  { id: 'home', href: 'member-home.html', icon: 'home', label: 'Home' },
  { id: 'directory', href: 'members-directory.html', icon: 'groups', label: 'Directory' },
  { id: 'scores', href: 'scores.html', icon: 'library_music', label: 'Scores' },
  { id: 'cecilia-ai', href: 'cecilia-ai.html', icon: 'auto_awesome', label: 'Cecilia AI' },
  { id: 'profile', href: 'profile.html', icon: 'person', label: 'Profile' }
];

function renderPortalHeader(activePage = '') {
  const navLinks = PORTAL_NAV_ITEMS.map(item => `
    <a href="${item.href}" class="nav-link ${activePage === item.id ? 'active' : ''}">
      <span class="material-symbols-outlined">${item.icon}</span>
      ${item.label}
    </a>
  `).join('');

  return `
    <header class="app-header portal-header">
      <a href="index.html" class="header-logo-wrap" title="Back to landing page">
        <img loading="lazy" src="IMAGES/choir-logo.jpg" alt="Choir Logo" class="header-logo">
        <h1 class="font-bold" style="font-size: 1.2rem; color: #fff;">St. Cecilia Choir</h1>
      </a>
      <nav class="desktop-nav">${navLinks}</nav>
      <div class="header-actions">
        <a href="notifications.html" class="nav-link" style="color: #fff;" title="Notifications">
          <span class="material-symbols-outlined">notifications</span>
        </a>
      </div>
    </header>
  `;
}

function renderPortalBottomNav(activePage = '') {
  return `
    <nav class="bottom-nav">
      ${PORTAL_NAV_ITEMS.map(item => `
        <a href="${item.href}" class="bottom-nav-item ${activePage === item.id ? 'active' : ''}">
          <span class="material-symbols-outlined">${item.icon}</span>
          <span>${item.label}</span>
        </a>
      `).join('')}
    </nav>
  `;
}

function mountPortalNav(activePage = '') {
  // Remove any existing navs
  document.querySelectorAll('.app-header, .bottom-nav, .site-header, .mobile-header').forEach(el => el.remove());
  
  // Inject new ones
  document.body.insertAdjacentHTML('afterbegin', renderPortalHeader(activePage));
  document.body.insertAdjacentHTML('beforeend', renderPortalBottomNav(activePage));
  document.body.classList.add('portal-page');
}

function renderPublicHeader(activePage = '') {
  const links = [
    { href: 'index.html', label: 'Home', id: 'home' },
    { href: 'About.html', label: 'About', id: 'about' },
    { href: 'events.html', label: 'Events', id: 'events' },
    { href: 'executives.html', label: 'Executives', id: 'executives' },
    { href: 'image-gallery.html', label: 'Gallery', id: 'gallery' },
    { href: 'scores.html', label: 'Scores', id: 'scores' },
    { href: 'members.html', label: 'Portal', id: 'portal' }
  ];

  return `
    <header class="site-header">
      <div class="header-inner">
        <a href="index.html" class="header-logo">
          <img loading="lazy" src="IMAGES/choir-logo.jpg" alt="St. Cecilia Choir Logo" class="header-logo-img">
          <span class="header-logo-text">St. Cecilia Choir</span>
        </a>
        <nav class="header-nav">
          ${links.map(l => `<a href="${l.href}" class="${activePage === l.id ? 'active' : ''}">${l.label}</a>`).join('')}
        </nav>
        <div class="header-actions">
          <button class="header-btn mobile-menu-trigger" id="mobile-menu-btn" aria-label="Open menu">
            <span class="material-symbols-outlined">menu</span>
          </button>
        </div>
      </div>
    </header>
    <header class="mobile-header">
      <a href="index.html" class="mobile-logo">
        <img loading="lazy" src="IMAGES/choir-logo.jpg" alt="St. Cecilia Choir Logo" class="mobile-logo-img">
        <span class="mobile-logo-text">St. Cecilia Choir</span>
      </a>
      <button class="mobile-menu-btn" id="mobile-menu-btn-mobile" aria-label="Open menu">
        <span class="material-symbols-outlined">menu</span>
      </button>
    </header>
    <div class="mobile-menu-overlay" id="mobile-menu-overlay"></div>
    <nav class="mobile-menu" id="mobile-menu">
      <button class="mobile-menu-close" id="mobile-menu-close" aria-label="Close menu">
        <span class="material-symbols-outlined">close</span>
      </button>
      ${links.map(l => `<a href="${l.href}">${l.label}</a>`).join('')}
    </nav>
  `;
}

function mountPublicNav(activePage = '') {
  const mount = document.getElementById('public-nav-mount');
  if (!mount) return;
  mount.innerHTML = renderPublicHeader(activePage);
  initMobileMenu();
}

function getSocialIcon(name, size = 20) {
  const icons = {
    facebook: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`,
    whatsapp: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>`,
    tiktok: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>`,
    instagram: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>`,
    youtube: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`
  };
  return icons[name] || '';
}

function renderHeader(options = {}) {
  const { title, showBack = false, showNotifications = false } = options;
  return `
    <header class="site-header">
      <div class="header-inner">
        <a href="index.html" class="header-logo">
          <img loading="lazy" src="IMAGES/choir-logo.jpg" alt="St. Cecilia Choir Logo" class="header-logo-img">
          <span class="header-logo-text">St. Cecilia Choir</span>
        </a>
        <nav class="header-nav">
          <a href="index.html">Home</a>
          <a href="About.html">About</a>
          <a href="members.html">Membership Portal</a>
        </nav>
        <div class="header-actions">
          ${showNotifications ? `<button class="header-btn" onclick="window.location.href='notifications.html'">${getIcon('bell', 20)}</button>` : ''}
          <button class="header-btn" onclick="window.location.href='settings.html'">${getIcon('settings', 20)}</button>
        </div>
      </div>
    </header>
  `;
}

function renderMobileHeader(options = {}) {
  const { showMenuBtn = true } = options;
  return `
    <header class="mobile-header">
      <a href="index.html" class="mobile-logo">
        <img loading="lazy" src="IMAGES/choir-logo.jpg" alt="St. Cecilia Choir Logo" class="mobile-logo-img">
        <span class="mobile-logo-text">St. Cecilia Choir</span>
      </a>
      ${showMenuBtn ? `<button class="mobile-menu-btn" id="mobile-menu-btn">${getIcon('menu', 24)}</button>` : ''}
    </header>
  `;
}

function renderFooter() {
  return `
    <footer class="site-footer">
      <div class="footer-inner">
        <div class="footer-socials">
          <a href="https://facebook.com/groups/1458406212619478/" target="_blank" rel="noopener" title="Facebook" class="footer-social-link">${getSocialIcon('facebook', 20)}</a>
          <a href="https://wa.me/08066416929" target="_blank" rel="noopener" title="WhatsApp" class="footer-social-link">${getSocialIcon('whatsapp', 20)}</a>
          <a href="https://www.tiktok.com/@htcc.choir?_r=1&_t=ZS-9968fNg5rl7" target="_blank" rel="noopener" title="TikTok" class="footer-social-link">${getSocialIcon('tiktok', 20)}</a>
          <a href="https://instagram.com/@yourchoirhandle" target="_blank" rel="noopener" title="Instagram" class="footer-social-link">${getSocialIcon('instagram', 20)}</a>
          <a href="https://youtube.com/c/yourchoirchannel" target="_blank" rel="noopener" title="YouTube" class="footer-social-link">${getSocialIcon('youtube', 20)}</a>
        </div>
        <p><strong>Address:</strong><br>Holy Trinity Catholic Church,<br>no.1 Umuakali Naze, Owerri North L.G.A,<br>Imo State, Nigeria.</p>
        <p><a href="https://maps.app.goo.gl/pfoVdd3JBxFNfYzA9" target="_blank" rel="noopener" class="btn btn-sm btn-accent" style="margin-top: 10px;">${getIcon('mapPin', 16)} Google Maps</a></p>
        <p style="margin-top: 15px;"><strong>Encountered Any Bugs?</strong><br>Report Or Email: <a href="mailto:stceciliaholytrinitycatholicch@gmail.com">stceciliaholytrinitycatholicch@gmail.com</a></p>
        <p style="margin-top: 15px;"><strong>Choir Hotline:</strong> <a href="https://wa.me/08066416929" target="_blank" rel="noopener">08066416929</a></p>
        <div class="footer-bottom">
          Built with love By FABIAN CODES HQ | For: ST. CECILIA CHOIR HTCC CHORAL VENTURE.<br>
          &copy; 2026 All rights reserved | ST. CECILIA CHOIR HTCC
        </div>
      </div>
    </footer>
  `;
}

function renderBottomNav(activePage = '') {
  const items = [
    { href: 'index.html', icon: 'home', label: 'Home', id: 'home' },
    { href: 'About.html', icon: 'info', label: 'About', id: 'about' },
    { href: 'members.html', icon: 'person', label: 'Portal', id: 'portal' }
  ];

  return `
    <nav class="bottom-nav">
      ${items.map(item => `
        <a href="${item.href}" class="${activePage === item.id ? 'active' : ''}">
          ${getIcon(item.icon, 24)}
          <span>${item.label}</span>
        </a>
      `).join('')}
    </nav>
  `;
}

function renderScrollToTop() {
  return `<button type="button" class="scroll-to-top" id="scroll-to-top" title="Back to top" aria-label="Back to top">${getIcon('arrow_upward', 22)}</button>`;
}

function initMobileMenu() {
  const menuBtns = document.querySelectorAll('#mobile-menu-btn, #mobile-menu-btn-mobile, .mobile-menu-trigger');
  const menuOverlay = document.getElementById('mobile-menu-overlay');
  const mobileMenu = document.getElementById('mobile-menu');
  const menuClose = document.getElementById('mobile-menu-close');

  const openMenu = () => {
    if (!mobileMenu) return;
    mobileMenu.classList.add('active');
    if (menuOverlay) menuOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  };

  menuBtns.forEach(btn => btn?.addEventListener('click', openMenu));

  const closeMenu = () => {
    if (!mobileMenu) return;
    mobileMenu.classList.remove('active');
    if (menuOverlay) menuOverlay.classList.remove('active');
    document.body.style.overflow = '';
  };

  if (menuClose) menuClose.addEventListener('click', closeMenu);
  if (menuOverlay) menuOverlay.addEventListener('click', closeMenu);
}

function initScrollToTop() {
  let btn = document.getElementById('scroll-to-top');
  if (!btn) {
    document.body.insertAdjacentHTML('beforeend', renderScrollToTop());
    btn = document.getElementById('scroll-to-top');
  }
  if (!btn) return;

  window.addEventListener('scroll', () => {
    if (window.scrollY > 300) {
      btn.classList.add('visible');
    } else {
      btn.classList.remove('visible');
    }
  });

  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

const ThemeManager = {
  init() {
    const saved = localStorage.getItem('theme') || 'light';
    this.applyTheme(saved);
  },
  toggle() {
    const current = this.getTheme();
    const next = current === 'dark' ? 'light' : 'dark';
    this.setTheme(next);
  },
  getTheme() {
    return localStorage.getItem('theme') || 'light';
  },
  applyTheme(theme) {
    let resolved = theme;
    if (theme === 'system') {
      resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', resolved === 'dark' ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme-preference', theme);
  },
  setTheme(theme) {
    const normalized = theme === 'Dark' ? 'dark' : theme === 'Light' ? 'light' : theme === 'System Default' ? 'system' : theme;
    localStorage.setItem('theme', normalized);
    this.applyTheme(normalized);
    if (Auth.isLoggedIn()) {
      api.put('/settings', { theme: normalized }).catch(() => {});
    }
  },
  getThemeLabel() {
    const t = this.getTheme();
    if (t === 'dark') return 'Dark';
    if (t === 'system') return 'System Default';
    return 'Light';
  }
};

document.addEventListener('DOMContentLoaded', () => {
  ThemeManager.init();
  Toast.init();
  initMobileMenu();
  initHeroTyping();
  initScrollToTop();
  initAnimatedStats();

  // Check backend availability (only when a backend is expected)
  const isBackendExpected = ['localhost', '127.0.0.1'].includes(window.location.hostname) && (window.location.port === '5000' || window.location.port === '');
  if (isBackendExpected) {
    checkBackend();
  }

  // Register the service worker once and keep it active for offline and browser notifications.
  const isExpressServer = window.location.port === '5000' || window.location.port === '';
  if ('serviceWorker' in navigator && isExpressServer) {
    window.addEventListener('load', async () => {
      navigator.serviceWorker.register('/service-worker.js')
        .then((reg) => {
          console.log('ServiceWorker registered:', reg.scope);
        })
        .catch((error) => {
          console.error('ServiceWorker registration failed:', error);
          Toast.warning('Offline and browser notifications are unavailable right now.');
        });
    });
  }
});

async function checkBackend() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);

  try {
    await api.request('/health', { method: 'GET', signal: controller.signal });
    clearTimeout(timeout);
  } catch (err) {
    clearTimeout(timeout);
    showBackendWarning();
  }
}

function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

function showBackendWarning() {
  if (document.getElementById('backend-warning')) return;
  
  const warning = document.createElement('div');
  warning.id = 'backend-warning';
  warning.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: #F59E0B;
    color: #1A1A1A;
    padding: 0.75rem 1rem;
    text-align: center;
    z-index: 9999;
    font-size: 0.9rem;
    font-weight: 500;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  `;
  warning.innerHTML = `
    <strong>Backend server not running.</strong> 
    Start it with: <code>npm start</code> or <code>node server.js</code> on port 5000.
    <button onclick="this.parentElement.remove()" style="margin-left: 1rem; background: rgba(0,0,0,0.1); border: none; color: var(--color-text); padding: 0.25rem 0.75rem; border-radius: 4px; cursor: pointer;">Dismiss</button>
  `;
  
  document.body.prepend(warning);
}

function initAnimatedStats() {
  const stats = document.querySelectorAll('.stat-number');
  if (!stats.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const target = parseInt(el.dataset.target, 10);
        const suffix = el.dataset.suffix || '';
        const duration = 2000;
        const start = performance.now();

        function update(now) {
          const elapsed = now - start;
          const progress = Math.min(elapsed / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          const current = Math.floor(eased * target);
          el.textContent = current + suffix;
          if (progress < 1) {
            requestAnimationFrame(update);
          } else {
            el.textContent = target + suffix;
          }
        }

        requestAnimationFrame(update);
        observer.unobserve(el);
      }
    });
  }, { threshold: 0.5 });

  stats.forEach(stat => observer.observe(stat));
}

function hidePageLoader() {
  try {
    const loader = document.getElementById('page-loader');
    if (!loader) return;
    
    const startTime = Date.now();
    const minDisplay = 1500;
    const maxDisplay = 8000;
    
    function tryHide() {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, Math.min(minDisplay - elapsed, maxDisplay - elapsed));
      
      setTimeout(() => {
        try {
          if (loader && loader.parentNode) {
            loader.classList.add('hidden');
            setTimeout(() => {
              try {
                if (loader && loader.parentNode) {
                  loader.parentNode.removeChild(loader);
                }
              } catch (e) {
                // Ignore removal errors
              }
            }, 500);
          }
        } catch (e) {
          // Fallback: force remove loader
          try {
            if (loader && loader.parentNode) {
              loader.parentNode.removeChild(loader);
            }
          } catch (e2) {
            // Ignore
          }
        }
      }, remaining);
    }
    
    if (document.readyState === 'complete') {
      tryHide();
    } else if (document.readyState === 'interactive') {
      setTimeout(tryHide, 500);
    } else {
      window.addEventListener('load', tryHide, { once: true });
      setTimeout(tryHide, maxDisplay);
    }
  } catch (e) {
    // Emergency fallback: remove loader by any means
    try {
      const loader = document.getElementById('page-loader');
      if (loader && loader.parentNode) {
        loader.parentNode.removeChild(loader);
      }
    } catch (e2) {
      // Ignore
    }
  }
}

function updateNotificationBadge(count) {
  const badges = document.querySelectorAll('.notification-badge');
  badges.forEach(badge => {
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.style.display = 'inline-flex';
      badge.style.alignItems = 'center';
      badge.style.justifyContent = 'center';
    } else {
      badge.style.display = 'none';
      badge.textContent = '';
    }
  });
}

async function loadNotificationBadge() {
  const publicPages = ['/', '/index.html', '/About.html', '/privacy.html', '/terms.html', '/members.html', '/login.html', '/register.html', '/admin-login.html'];
  if (!Auth.isLoggedIn() || publicPages.includes(window.location.pathname)) return;

  try {
    const notifications = await api.get('/notifications');
    const unreadCount = notifications.filter(n => !n.read).length;
    updateNotificationBadge(unreadCount);

    document.querySelectorAll('.portal-icon-btn').forEach(btn => {
      if (btn.querySelector('.notification-badge')) {
        btn.addEventListener('click', async () => {
          if (unreadCount > 0) {
            try {
              await api.post('/notifications/mark-read', {});
              updateNotificationBadge(0);
            } catch (error) {
              Toast.error(getUserFriendlyError(error));
            }
          }
        });
      }
    });
  } catch (error) {
    Toast.error(getUserFriendlyError(error));
  }
}

hidePageLoader();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    loadNotificationBadge();
  });
} else {
  loadNotificationBadge();
}

// Global error handler (filter out browser extension errors)
window.addEventListener('error', (event) => {
  const filename = event.filename || '';
  if (filename.includes('moz-extension') || filename.includes('chrome-extension')) return;
  console.error('Global error:', event.error);
  const friendlyMessage = getUserFriendlyError(event.error);
  Toast.error(!navigator.onLine
    ? 'You appear to be offline. Check your internet connection and try again.'
    : friendlyMessage);
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  if (typeof reason === 'string' && (reason.includes('moz-extension') || reason.includes('chrome-extension'))) return;
  if (reason && reason.stack && (reason.stack.includes('moz-extension') || reason.stack.includes('chrome-extension'))) return;
  console.error('Unhandled promise rejection:', event.reason);
  const friendlyMessage = getUserFriendlyError(event.reason);
  Toast.error(friendlyMessage);
});

window.addEventListener('offline', () => {
  Toast.warning('You are offline. Some features may not be available until your connection returns.');
});

window.addEventListener('online', () => {
  Toast.success('Your internet connection is back.');
});

// Performance: lazy load non-critical resources
if ('loading' in HTMLImageElement.prototype) {
  const images = document.querySelectorAll('img[loading="lazy"]');
  images.forEach(img => {
    if (!img.loading) img.loading = 'lazy';
  });
}

// Performance: reduce motion for users who prefer it
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.documentElement.style.setProperty('--transition-fast', '0s');
  document.documentElement.style.setProperty('--transition-normal', '0s');
  document.documentElement.style.setProperty('--transition-slow', '0s');
}

// Donate toggle on landing page
const donateToggle = document.getElementById('donate-toggle');
const acctBox = document.getElementById('acct-box');
if (donateToggle && acctBox) {
  donateToggle.addEventListener('click', () => {
    acctBox.classList.toggle('visible');
    donateToggle.textContent = acctBox.classList.contains('visible') ? 'Hide Details' : 'Donate Now';
  });
}

// ==================== PWA INSTALL PROMPT ====================
let deferredPrompt = null;
const pwaInstallBanner = document.getElementById('pwa-install-banner');
const pwaInstallBtn = document.getElementById('pwa-install-btn');
const pwaDismissBtn = document.getElementById('pwa-install-dismiss');

function showPwaInstallBanner() {
  if (!pwaInstallBanner || !deferredPrompt) return;
  pwaInstallBanner.classList.add('visible');
}

function hidePwaInstallBanner() {
  if (!pwaInstallBanner) return;
  pwaInstallBanner.classList.remove('visible');
}

async function installPwa() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  console.log('PWA install outcome:', outcome);
  deferredPrompt = null;
  hidePwaInstallBanner();
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  setTimeout(showPwaInstallBanner, 3000);
});

window.addEventListener('appinstalled', () => {
  console.log('PWA installed successfully');
  deferredPrompt = null;
  hidePwaInstallBanner();
});

if (pwaInstallBtn) {
  pwaInstallBtn.addEventListener('click', installPwa);
}
if (pwaDismissBtn) {
  pwaDismissBtn.addEventListener('click', hidePwaInstallBanner);
}

// ==================== SERVICE WORKORKER UPDATE RELOAD ====================
function showUpdatePopup() {
  const overlay = document.getElementById('update-popup-overlay');
  const reloadBtn = document.getElementById('update-reload-btn');
  const dismissBtn = document.getElementById('update-dismiss-btn');

  if (overlay) overlay.classList.add('visible');

  if (reloadBtn) {
    reloadBtn.addEventListener('click', () => {
      window.location.reload();
    });
  }

  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => {
      if (overlay) overlay.classList.remove('visible');
    });
  }
}

async function checkForServiceWorkerUpdate() {
  if (!('serviceWorker' in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.getRegistration('/');
    if (!registration) return;

    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdatePopup();
        }
      });
    });
  } catch (e) {
    console.warn('Failed to check for service worker update:', e);
  }
}

checkForServiceWorkerUpdate();

// Hide update popup if user reloads manually
window.addEventListener('beforeunload', () => {
  const overlay = document.getElementById('update-popup-overlay');
  if (overlay) overlay.classList.remove('visible');
});
