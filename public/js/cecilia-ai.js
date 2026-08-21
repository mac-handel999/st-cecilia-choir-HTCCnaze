if (!requireAuth()) {
  throw new Error('Auth required');
}

document.addEventListener('DOMContentLoaded', async () => {
  ThemeManager.init();
  Toast.init();
  mountPortalNav('cecilia-ai');

  const messages = document.getElementById('chat-messages');
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send');
  if (!messages || !input || !sendBtn) return;

  const user = Auth.getUser();
  const username = user?.username || user?.full_name || 'You';
  const chatHistory = [];

  let userAvatarUrl = null;

  async function loadUserAvatar() {
    try {
      const userData = await api.get('/auth/me');
      if (userData?.avatar_url) {
        userAvatarUrl = userData.avatar_url;
      }
    } catch (e) {
      console.warn('Failed to load user avatar for chat:', e);
    }
  }

  loadUserAvatar();

  function addUserBubble(text) {
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-row chat-row-user';
    
    const avatarHtml = userAvatarUrl
      ? `<img src="${escapeHtml(userAvatarUrl)}?t=${Date.now()}" alt="${escapeHtml(username)}" class="chat-user-avatar-img" title="${escapeHtml(username)}" loading="lazy" />`
      : `<div class="chat-user-avatar" title="${escapeHtml(username)}">${escapeHtml(getInitials(username))}</div>`;
    
    wrapper.innerHTML = `
      ${avatarHtml}
      <div class="chat-bubble chat-bubble-user">
        <div class="chat-bubble-header">${escapeHtml(username)}</div>
        <div class="chat-bubble-body">${escapeHtml(text)}</div>
      </div>
    `;
    messages.appendChild(wrapper);
    messages.scrollTop = messages.scrollHeight;
  }

  function addAiBubble(text) {
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-row chat-row-ai';
    const rendered = typeof marked !== 'undefined' ? marked.parse(text || '') : escapeHtml(text || '');
    wrapper.innerHTML = `
      <div class="chat-user-avatar chat-ai-avatar" title="Cecilia AI"><span class="material-symbols-outlined">auto_awesome</span></div>
      <div class="chat-bubble chat-bubble-ai chat-bubble-markdown">
        <div class="chat-bubble-header">Cecilia</div>
        <div class="chat-bubble-body">${rendered}</div>
      </div>
    `;
    messages.appendChild(wrapper);
    messages.scrollTop = messages.scrollHeight;
  }

  async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;

    addUserBubble(text);
    chatHistory.push({ role: 'user', content: text });
    input.value = '';
    sendBtn.disabled = true;

    try {
      const pageContext = getPageContext();
      const result = await api.post('/ai/chat', {
        message: text,
        history: chatHistory,
        context: pageContext
      });
      const reply = result.reply || result.message || 'No response';
      chatHistory.push({ role: 'assistant', content: reply });
      addAiBubble(reply);
    } catch (error) {
      addAiBubble('Forgive me, my dear, but I encountered a slight difficulty. Let us try again — perhaps with a different question about our sacred music?');
      Toast.error('Cecilia AI error: ' + error.message);
    } finally {
      sendBtn.disabled = false;
      input.focus();
    }
  }

  function getPageContext() {
    const path = window.location.pathname;
    if (path.includes('scores') || path.includes('musical-score')) return 'browsing_scores';
    if (path.includes('events')) return 'viewing_events';
    if (path.includes('attendance')) return 'viewing_attendance';
    if (path.includes('gallery') || path.includes('image-gallery')) return 'viewing_gallery';
    if (path.includes('members') || path.includes('directory')) return 'viewing_members';
    if (path.includes('profile')) return 'viewing_profile';
    if (path.includes('home') || path.includes('member-home')) return 'member_home';
    return 'general_portal';
  }

  sendBtn.addEventListener('click', sendMessage);
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });

  try {
    const history = asArray(await api.get('/ai/history'));
    history.reverse().slice(-10).forEach(item => {
      addUserBubble(item.message);
      addAiBubble(item.response);
      chatHistory.push({ role: 'user', content: item.message });
      chatHistory.push({ role: 'assistant', content: item.response });
    });
    const welcome = messages.querySelector('.chat-bubble-ai');
    if (history.length > 0 && welcome) welcome.remove();
  } catch {
    /* keep default welcome message */
  }
});
