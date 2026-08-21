function requireAdminOrExco() {
  const user = getCurrentUser();
  if (!user || (user.role !== 'admin' && user.role !== 'exco')) {
    window.location.href = 'member-home.html';
    return false;
  }
  return true;
}

if (!requireAdminOrExco()) {
  throw new Error('Forbidden');
}

document.addEventListener('DOMContentLoaded', async () => {
  ThemeManager.init();
  Toast.init();
  mountPortalNav('event-songs');

  const eventSelect = document.getElementById('event-select');
  const eventInfo = document.getElementById('event-info');
  const addSongForm = document.getElementById('add-song-form');
  const songsList = document.getElementById('songs-list');
  const songCount = document.getElementById('song-count');
  const addSongBtn = document.getElementById('add-song-btn');
  const saveDraftBtn = document.getElementById('save-draft-btn');
  const publishPlanBtn = document.getElementById('publish-plan-btn');
  const songListActions = document.getElementById('song-list-actions');
  const songTitleInput = document.getElementById('song-title');
  const songAutocomplete = document.getElementById('song-autocomplete');

  let selectedEventId = null;
  let songItems = [];
  let nextOrder = 1;
  let currentSongListId = null;
  let searchDebounce = null;

  try {
    const events = asArray(await api.get('/events'));
    events.sort((a, b) => new Date(a.event_date || 0) - new Date(b.event_date || 0));

    eventSelect.innerHTML = '<option value="">Choose an event...</option>' + events.map(e => {
      const dateStr = e.event_date ? new Date(e.event_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
      return `<option value="${e.id}" data-date="${escapeHtml(e.event_date || '')}" data-time="${escapeHtml(e.time || '')}" data-location="${escapeHtml(e.location || '')}">${escapeHtml(e.title)}${dateStr ? ' - ' + dateStr : ''}</option>`;
    }).join('');
  } catch (error) {
    Toast.error('Failed to load events: ' + error.message);
  }

  eventSelect.addEventListener('change', async () => {
    selectedEventId = eventSelect.value;

    if (!selectedEventId) {
      eventInfo.style.display = 'none';
      songsList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">library_music</div>
          <div class="empty-state-title">No event selected</div>
          <div class="empty-state-desc">Select an event above to build a song list</div>
        </div>
      `;
      songCount.textContent = '0 songs';
      songListActions.style.display = 'none';
      currentSongListId = null;
      return;
    }

    const selectedEvent = eventSelect.options[eventSelect.selectedIndex];
    document.getElementById('info-date').textContent = selectedEvent.dataset.date || '-';
    document.getElementById('info-time').textContent = selectedEvent.dataset.time || 'TBD';
    document.getElementById('info-location').textContent = selectedEvent.dataset.location || 'TBD';
    eventInfo.style.display = 'block';

    await loadSongList();
  });

  async function loadSongList() {
    if (!selectedEventId) return;

    try {
      const lists = asArray(await api.get('/song-lists?event_id=' + selectedEventId));
      let songList = lists.find(l => l.status === 'draft' || l.status === 'published') || null;

      if (!songList && lists.length > 0) {
        songList = lists[0];
      }

      if (!songList) {
        const created = await api.post('/song-lists', { event_id: selectedEventId, status: 'draft' });
        songList = created;
      }

      currentSongListId = songList.id;

      const items = asArray(await api.get('/song-list-items?song_list_id=' + currentSongListId));
      songItems = items.sort((a, b) => (a.order_number || 0) - (b.order_number || 0));

      if (songItems.length > 0) {
        nextOrder = Math.max(...songItems.map(s => s.order_number || 0)) + 1;
      } else {
        nextOrder = 1;
      }

      renderSongs();
      songListActions.style.display = 'flex';
    } catch (error) {
      songItems = [];
      renderSongs();
    }
  }

  function renderSongs() {
    if (songItems.length === 0) {
      songsList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">music_note</div>
          <div class="empty-state-title">No songs added yet</div>
          <div class="empty-state-desc">Use the form above to add songs for this event</div>
        </div>
      `;
      songCount.textContent = '0 songs';
      return;
    }

    songCount.textContent = songItems.length + ' song' + (songItems.length !== 1 ? 's' : '');

    songsList.innerHTML = songItems.map((song, index) => `
      <div class="song-row" data-song-id="${song.id}">
        <div class="song-order">${song.order_number || index + 1}</div>
        <div class="song-details">
          <div class="song-title">${escapeHtml(song.title || 'Untitled Song')}</div>
          <div class="song-meta">
            <span class="badge badge-accent" style="font-size: 0.7rem;">${escapeHtml(song.mass_part || 'general')}</span>
            ${song.notes ? ' • ' + escapeHtml(song.notes) : ''}
          </div>
        </div>
        <div class="song-actions">
          <button class="btn-icon delete-song" data-id="${song.id}" title="Remove song">
            <span class="material-symbols-outlined" style="font-size: 18px;">delete</span>
          </button>
        </div>
      </div>
    `).join('');

    document.querySelectorAll('.delete-song').forEach(btn => {
      btn.addEventListener('click', async () => {
        const songId = btn.dataset.id;
        try {
          await api.delete('/song-list-items/' + songId);
          Toast.success('Song removed');
          await loadSongList();
        } catch (error) {
          Toast.error('Failed to remove song: ' + error.message);
        }
      });
    });
  }

  addSongForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!currentSongListId) {
      Toast.error('Please select an event first');
      return;
    }

    const title = songTitleInput.value.trim();
    const massPart = document.getElementById('song-mass-part').value;
    const orderNumber = parseInt(document.getElementById('song-order').value) || nextOrder;
    const notes = document.getElementById('song-notes').value.trim();

    if (!title || !massPart) {
      Toast.error('Please fill in song title and mass part');
      return;
    }

    addSongBtn.disabled = true;
    addSongBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 18px;">hourglass_empty</span> Adding...';

    try {
      await api.post('/song-list-items', {
        song_list_id: currentSongListId,
        mass_part: massPart,
        title,
        order_number: orderNumber,
        notes: notes || null
      });

      Toast.success('Song added successfully!');
      addSongForm.reset();
      document.getElementById('song-order').value = nextOrder + 1;
      nextOrder++;
      await loadSongList();
    } catch (error) {
      Toast.error('Failed to add song: ' + error.message);
    } finally {
      addSongBtn.disabled = false;
      addSongBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 18px;">add</span> Add Song';
    }
  });

  if (songTitleInput) {
    songTitleInput.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      if (searchDebounce) clearTimeout(searchDebounce);

      if (query.length < 2) {
        songAutocomplete.classList.remove('active');
        return;
      }

      searchDebounce = setTimeout(async () => {
        try {
          const results = asArray(await api.get('/song-search?q=' + encodeURIComponent(query) + '&category='));
          if (results.length === 0) {
            songAutocomplete.classList.remove('active');
            return;
          }

          songAutocomplete.innerHTML = results.slice(0, 8).map(r => `
            <div class="autocomplete-item" data-title="${escapeHtml(r.title)}" data-category="${escapeHtml(r.category || '')}">
              ${escapeHtml(r.title)}
              <div class="autocomplete-meta">${escapeHtml(r.category || '')} • ${r.source === 'drive' ? 'Drive' : 'Library'}</div>
            </div>
          `).join('');
          songAutocomplete.classList.add('active');

          songAutocomplete.querySelectorAll('.autocomplete-item').forEach(item => {
            item.addEventListener('click', () => {
              songTitleInput.value = item.dataset.title;
              songAutocomplete.classList.remove('active');
            });
          });
        } catch {
          songAutocomplete.classList.remove('active');
        }
      }, 300);
    });

    document.addEventListener('click', (e) => {
      if (!songTitleInput.contains(e.target) && !songAutocomplete.contains(e.target)) {
        songAutocomplete.classList.remove('active');
      }
    });
  }

  if (document.getElementById('add-score-btn')) {
    document.getElementById('add-score-btn').addEventListener('click', async () => {
      try {
        const scores = asArray(await api.get('/scores'));
        const driveScores = asArray(await api.get('/drive/scores'));

        const allScores = [...scores, ...driveScores];
        if (allScores.length === 0) {
          Toast.info('No scores available');
          return;
        }

        const selected = prompt('Select a score to add:\n\n' + allScores.map((s, i) => (i + 1) + '. ' + (s.title || s.name)).join('\n').substring(0, 500) + '\n\nEnter the number:');
        const index = parseInt(selected) - 1;
        if (index >= 0 && index < allScores.length) {
          const score = allScores[index];
          const massPart = prompt('Enter mass part for this score:', 'Communion');
          if (massPart) {
            songTitleInput.value = score.title || score.name || 'Untitled Score';
            document.getElementById('song-mass-part').value = massPart;
            Toast.success('Score selected. Fill remaining details and add.');
          }
        }
      } catch (error) {
        Toast.error('Failed to load scores: ' + error.message);
      }
    });
  }

  if (saveDraftBtn) {
    saveDraftBtn.addEventListener('click', async () => {
      if (!currentSongListId) return;
      try {
        await api.put('/song-lists/' + currentSongListId, { status: 'draft' });
        Toast.success('Draft saved');
      } catch (error) {
        Toast.error('Failed to save draft: ' + error.message);
      }
    });
  }

  if (publishPlanBtn) {
    publishPlanBtn.addEventListener('click', async () => {
      if (!currentSongListId) return;
      try {
        await api.put('/song-lists/' + currentSongListId, { status: 'published' });
        Toast.success('Song plan published!');
      } catch (error) {
        Toast.error('Failed to publish: ' + error.message);
      }
    });
  }
});
