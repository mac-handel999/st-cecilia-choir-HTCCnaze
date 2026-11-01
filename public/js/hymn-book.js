if (!requireAuth()) {
  throw new Error('Auth required');
}

document.addEventListener('DOMContentLoaded', async () => {
  ThemeManager.init();
  mountPortalNav('hymns');
  const searchInput = document.getElementById('hymn-search');
  const resultsContainer = document.getElementById('hymn-results');
  const reader = document.getElementById('hymn-reader');
  const status = document.getElementById('hymn-book-status');
  const connection = document.getElementById('hymn-book-connection');
  const clearButton = document.getElementById('clear-hymn-search');
  const categoryFilter = document.getElementById('hymn-category-filter');
  const titleElement = document.getElementById('hymn-book-title');

  if (!searchInput || !resultsContainer || !reader || !status || !connection || !clearButton || !categoryFilter) return;

  const books = {
    catholic: { title: 'Catholic Hymn Book', id: 'catholic' },
    assumpta: { title: 'Assumpta Hymnal', id: 'assumpta' },
    'legion-of-mary': { title: 'Legion of Mary Hymn Book', id: 'legion-of-mary' }
  };
  const requestedBook = new URLSearchParams(window.location.search).get('book') || 'catholic';
  const currentBook = books[requestedBook] || books.catholic;
  if (titleElement) titleElement.textContent = currentBook.title;
  document.title = `${currentBook.title} - St. Cecilia Choir HTCC Naze`;

  let hymns = [];
  let selectedHymnId = null;

  function updateConnection() {
    const isOnline = navigator.onLine;
    connection.textContent = isOnline ? 'Online' : 'Offline · saved hymns are available';
    connection.classList.toggle('is-offline', !isOnline);
  }

  function normalizeHymn(hymn) {
    if (!hymn) return null;
    const number = typeof hymn.number === 'number'
      ? hymn.number
      : /^\d+$/.test(String(hymn.number)) ? Number(hymn.number) : NaN;
    if (!Number.isInteger(number) || number < 1 || !String(hymn.title || '').trim()) return null;
    const rawVerses = Array.isArray(hymn.verses) ? hymn.verses : hymn.stanzas;
    const verses = Array.isArray(rawVerses)
      ? rawVerses.map((verse, index) => {
        if (typeof verse === 'string' && verse.trim()) {
          return {
            label: `VERSE ${index + 1}`,
            lines: verse.split(/\r?\n/).filter(line => line.trim()),
            type: 'verse'
          };
        }
        if (!verse || typeof verse !== 'object') return null;
        const lines = Array.isArray(verse.lines)
          ? verse.lines.filter(line => typeof line === 'string' && line.trim())
          : typeof verse.text === 'string' ? verse.text.split(/\r?\n/).filter(line => line.trim()) : [];
        if (!lines.length) return null;
        const sourceLabel = String(verse.label || '').trim();
        const verseNumber = sourceLabel.match(/^(?:stanza|verse)\s*(\d*)$/i)?.[1];
        const label = /^(?:stanza|verse)\b/i.test(sourceLabel)
          ? `VERSE ${verseNumber || index + 1}`
          : sourceLabel || `VERSE ${index + 1}`;
        return {
          label,
          lines,
          type: /chorus|refrain/i.test(label) ? 'chorus' : 'verse'
        };
      }).filter(Boolean)
      : [];

    const rawChorus = hymn.chorus ?? hymn.refrain;
    if (typeof rawChorus === 'string' && rawChorus.trim()) {
      verses.push({ label: 'Chorus', lines: rawChorus.split(/\r?\n/).filter(line => line.trim()), type: 'chorus' });
    } else if (Array.isArray(rawChorus)) {
      const lines = rawChorus.filter(line => typeof line === 'string' && line.trim());
      if (lines.length) verses.push({ label: 'Chorus', lines, type: 'chorus' });
    } else if (rawChorus && typeof rawChorus === 'object') {
      const lines = Array.isArray(rawChorus.lines)
        ? rawChorus.lines.filter(line => typeof line === 'string' && line.trim())
        : typeof rawChorus.text === 'string' ? rawChorus.text.split(/\r?\n/).filter(line => line.trim()) : [];
      if (lines.length) verses.push({ label: rawChorus.label || 'Chorus', lines, type: 'chorus' });
    }

    if (!verses.length) return null;
    const suffix = typeof hymn.suffix === 'string' ? hymn.suffix.trim() : '';
    const id = String(hymn.id ?? `${number}${suffix}`);
    return {
      id,
      number,
      suffix,
      title: String(hymn.title).trim(),
      category: typeof hymn.category === 'string' ? hymn.category.trim() : '',
      language: typeof hymn.language === 'string' ? hymn.language.trim() : '',
      attribution: typeof hymn.attribution === 'string' ? hymn.attribution.trim() : '',
      rights: typeof hymn.rights === 'string' ? hymn.rights.trim() : '',
      verses
    };
  }

  function renderResults() {
    const query = searchInput.value.trim().toLocaleLowerCase();
    const category = categoryFilter.value.toLocaleLowerCase();
    const matched = hymns.filter(hymn =>
      (!category || hymn.category.toLocaleLowerCase() === category)
      && (
        !query
        || `${hymn.number}${hymn.suffix}`.toLocaleLowerCase().includes(query)
        || hymn.title.toLocaleLowerCase().includes(query)
        || hymn.category.toLocaleLowerCase().includes(query)
      )
    );

    status.textContent = hymns.length
      ? `${matched.length} of ${hymns.length} hymns`
      : 'The hymn list is ready for authorized texts.';
    resultsContainer.replaceChildren();

    if (!matched.length) {
      const empty = document.createElement('div');
      empty.className = 'hymn-empty-state';
      const title = document.createElement('h2');
      const message = document.createElement('p');
      if (!hymns.length) {
        title.textContent = 'Hymns will appear here';
        message.textContent = 'Add public-domain hymns or texts you have permission to use to the hymn data file.';
      } else {
        title.textContent = 'No hymns found';
        message.textContent = 'Try a different hymn number or name.';
      }
      empty.append(title, message);
      resultsContainer.append(empty);
      return;
    }

    matched.forEach(hymn => {
      const selected = selectedHymnId === hymn.id;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `hymn-result${selected ? ' is-selected' : ''}`;
      button.setAttribute('aria-pressed', String(selected));

      const number = document.createElement('span');
      number.className = 'hymn-result-number';
      number.textContent = `${hymn.number}${hymn.suffix}`;

      const title = document.createElement('span');
      title.className = 'hymn-result-title';
      title.textContent = hymn.title;

      button.append(number, title);
      button.addEventListener('click', () => selectHymn(hymn));
      resultsContainer.append(button);
    });
  }

  function selectHymn(hymn) {
    selectedHymnId = hymn.id;
    renderResults();
    reader.replaceChildren();

    const heading = document.createElement('header');
    heading.className = 'hymn-reader-heading';
    const number = document.createElement('span');
    number.className = 'hymn-reader-number';
    number.textContent = `Hymn ${hymn.number}${hymn.suffix}`;
    const title = document.createElement('h2');
    title.textContent = hymn.title;
    heading.append(number, title);
    if (hymn.category || hymn.language || hymn.attribution || hymn.rights) {
      const detail = document.createElement('p');
      detail.className = 'hymn-reader-detail';
      detail.textContent = [hymn.category, hymn.language, hymn.attribution, hymn.rights].filter(Boolean).join(' · ');
      heading.append(detail);
    }
    reader.append(heading);

    hymn.verses.forEach(verseData => {
      const section = document.createElement('section');
      section.className = `hymn-verse${verseData.type === 'chorus' ? ' hymn-chorus' : ''}`;
      const label = document.createElement('h3');
      label.className = 'hymn-verse-label';
      label.textContent = verseData.label;
      const text = document.createElement('p');
      text.className = 'hymn-stanza';
      text.textContent = verseData.lines.join('\n');
      section.append(label, text);
      reader.append(section);
    });
  }

  searchInput.addEventListener('input', renderResults);
  categoryFilter.addEventListener('change', renderResults);
  clearButton.addEventListener('click', () => {
    searchInput.value = '';
    searchInput.focus();
    renderResults();
  });
  window.addEventListener('online', updateConnection);
  window.addEventListener('offline', updateConnection);
  updateConnection();

  try {
    const data = await api.get(`/hymns?book=${encodeURIComponent(currentBook.id)}`);
    const records = Array.isArray(data) ? data : data?.hymns;
    if (!Array.isArray(records)) throw new Error('The hymn list has an invalid format.');
    hymns = records.map(normalizeHymn).filter(Boolean).sort((a, b) =>
      a.number - b.number || a.suffix.localeCompare(b.suffix)
    );
    if (records.length && hymns.length === 0) throw new Error('The hymn list contains no readable entries.');
    const categories = [...new Set(hymns.map(hymn => hymn.category).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
    categoryFilter.replaceChildren(new Option('All categories', ''));
    categories.forEach(category => categoryFilter.add(new Option(category, category)));
    renderResults();
  } catch (error) {
    console.error('Hymn book load failed:', error);
    status.textContent = error.message || (navigator.onLine
      ? 'The hymn book could not be opened. Please try again later.'
      : 'The hymn book is not available offline yet. Connect to the internet once to save it on this device.');
    resultsContainer.replaceChildren();
    reader.replaceChildren();
  }
});
