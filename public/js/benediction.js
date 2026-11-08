if (!requireAuth()) {
  throw new Error('Auth required');
}

document.addEventListener('DOMContentLoaded', async () => {
  ThemeManager.init();
  Toast.init();

  const contentContainer = document.getElementById('benediction-content');
  const tabButtons = document.querySelectorAll('.tab-btn');

  let benedictionData = {};

  const langKey = { en: 'english', la: 'latin', ig: 'igbo' };

  try {
    const res = await fetch('data/benediction.json');
    if (!res.ok) throw new Error('Failed to load Benediction data');
    benedictionData = await res.json();
  } catch (err) {
    contentContainer.innerHTML = `<div class="empty-state"><div class="empty-state-title">Unable to load content</div><div class="empty-state-desc">${escapeHtml(err.message)}</div></div>`;
    return;
  }

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderBenediction(btn.dataset.lang);
    });
  });

  renderBenediction('en');


  function renderBlock(container, data) {
    if (!data) return;
    if (typeof data === 'string') {
      const p = document.createElement('p');
      p.className = 'mass-text';
      p.textContent = data;
      container.appendChild(p);
      return;
    }
    if (Array.isArray(data)) {
      data.forEach(item => renderBlock(container, item));
      return;
    }
    if (typeof data === 'object') {
      Object.keys(data).forEach(key => {
        const val = data[key];
        if (key === 'verses' && Array.isArray(val)) {
          val.forEach(v => {
            const line = document.createElement('div');
            line.className = 'mass-line-item';
            line.innerHTML = `<span class="mass-speaker priest">${escapeHtml(v.number ? v.number + '.' : '')}</span><span class="mass-text">${escapeHtml(v.text)}</span>`;
            container.appendChild(line);
          });
          return;
        }
        if (key === 'praises' && Array.isArray(val)) {
          val.forEach(p => {
            const line = document.createElement('div');
            line.className = 'mass-line-item';
            line.innerHTML = `<span class="mass-text">${escapeHtml(p)}</span>`;
            container.appendChild(line);
          });
          return;
        }
        if (key === 'intro' || key === 'refrain' || key === 'second_part' || key === 'antiphon' || key === 'antiphon_repeat') {
          const arr = Array.isArray(val) ? val : [val];
          arr.forEach(t => {
            const p = document.createElement('p');
            p.className = 'mass-text';
            p.style.marginBottom = '0.5rem';
            p.textContent = t;
            container.appendChild(p);
          });
          return;
        }
        if (key === 'psalm' && typeof val === 'object') {
          renderBlock(container, val);
          return;
        }
        if (key === 'versicle_response' && typeof val === 'object') {
          const vr = document.createElement('div');
          vr.className = 'mass-line-item';
          vr.innerHTML = `<span class="mass-speaker priest">${escapeHtml(val.versicle || '')}</span>`;
          container.appendChild(vr);
          const rr = document.createElement('div');
          rr.className = 'mass-line-item';
          rr.innerHTML = `<span class="mass-speaker people">${escapeHtml(val.response || '')}</span>`;
          container.appendChild(rr);
          return;
        }
        if (key === 'prayer' && typeof val === 'object') {
          if (val.title) {
            const h = document.createElement('h4');
            h.className = 'mass-section-title';
            h.style.fontSize = '1rem';
            h.textContent = val.title;
            container.appendChild(h);
          }
          if (val.prompt) {
            const p = document.createElement('p');
            p.className = 'mass-text';
            p.textContent = val.prompt;
            container.appendChild(p);
          }
          if (val.text) {
            const p = document.createElement('p');
            p.className = 'mass-text';
            p.textContent = val.text;
            container.appendChild(p);
          }
          if (val.response) {
            const p = document.createElement('p');
            p.className = 'mass-text';
            p.textContent = val.response;
            container.appendChild(p);
          }
          return;
        }
        if (key === 'title' || key === 'rubric') {
          const el = document.createElement(key === 'title' ? 'h3' : 'p');
          el.className = key === 'title' ? 'mass-section-title' : 'mass-text';
          if (key === 'rubric') el.style.fontStyle = 'italic';
          el.textContent = val;
          container.appendChild(el);
          return;
        }
        if (typeof val === 'string') {
          const p = document.createElement('p');
          p.className = 'mass-text';
          p.textContent = val;
          container.appendChild(p);
        } else if (typeof val === 'object') {
          renderBlock(container, val);
        }
      });
    }
  }

  function renderBenediction(lang) {
    if (!contentContainer) return;
    contentContainer.innerHTML = '';
    const lk = langKey[lang];

    benedictionData.sections.forEach(sec => {
      const card = document.createElement('div');
      card.className = 'mass-section-card';

      const header = document.createElement('div');
      header.className = 'mass-section-header';
      header.innerHTML = `<h2 class="mass-section-title">${escapeHtml(sec.name[langKey[lang]] || sec.name.english)}</h2>`;
      card.appendChild(header);

      const c = sec.content[lk] || sec.content.english;
      renderBlock(card, c);

      contentContainer.appendChild(card);
    });
  }
});