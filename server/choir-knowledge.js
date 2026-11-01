const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'public', 'data');
const BOOKS = {
  catholic: { title: 'Catholic Hymn Book', file: 'hymns.json' },
  assumpta: { title: 'Assumpta Hymnal', file: 'assumpta-hymns.json' },
  'legion-of-mary': { title: 'Legion of Mary Hymn Book', file: 'legion-of-mary-hymns.json' }
};
const STOP_WORDS = new Set([
  'a', 'about', 'and', 'are', 'be', 'book', 'by', 'does', 'for', 'from', 'give',
  'how', 'in', 'is', 'it', 'me', 'of', 'on', 'or', 'please', 'say', 'section',
  'tell', 'the', 'to', 'what', 'which', 'who', 'with'
]);

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getBookFromQuestion(question) {
  const text = normalizeText(question);
  if (text.includes('assumpta')) return 'assumpta';
  if (text.includes('legion of mary')) return 'legion-of-mary';
  return 'catholic';
}

function formatHymnAnswer(hymn, book) {
  const number = `${hymn.number}${hymn.suffix || ''}`;
  const stanzas = Array.isArray(hymn.verses) ? hymn.verses : hymn.stanzas || [];
  const lines = stanzas.flatMap((stanza, index) => {
    if (typeof stanza === 'string') return [`VERSE ${index + 1}:`, stanza];
    if (!stanza || typeof stanza !== 'object') return [];
    const text = Array.isArray(stanza.lines) ? stanza.lines.join('\n') : stanza.text || '';
    if (!text) return [];
    const sourceLabel = String(stanza.label || '').trim();
    const verseNumber = sourceLabel.match(/^(?:stanza|verse)\s*(\d*)$/i)?.[1];
    const label = /^(?:stanza|verse)\b/i.test(sourceLabel)
      ? `VERSE ${verseNumber || index + 1}`
      : sourceLabel || `VERSE ${index + 1}`;
    return [`${label}:`, text];
  });
  if (typeof hymn.chorus === 'string') lines.push('Chorus:', hymn.chorus);
  else if (Array.isArray(hymn.chorus)) lines.push('Chorus:', hymn.chorus.join('\n'));
  else if (hymn.chorus && Array.isArray(hymn.chorus.lines)) lines.push('Chorus:', hymn.chorus.lines.join('\n'));
  else if (hymn.chorus && typeof hymn.chorus.text === 'string') lines.push('Chorus:', hymn.chorus.text);
  if (typeof hymn.refrain === 'string') lines.push('Refrain:', hymn.refrain);
  else if (Array.isArray(hymn.refrain)) lines.push('Refrain:', hymn.refrain.join('\n'));
  else if (hymn.refrain && Array.isArray(hymn.refrain.lines)) lines.push('Refrain:', hymn.refrain.lines.join('\n'));
  else if (hymn.refrain && typeof hymn.refrain.text === 'string') lines.push('Refrain:', hymn.refrain.text);

  if (!lines.length) {
    return {
      reply: `I found hymn ${number}, ${hymn.title}, in the ${BOOKS[book].title}, but its words have not been added yet.`,
      source: `${BOOKS[book].title}, hymn ${number} (lyrics unavailable)`
    };
  }
  return {
    reply: `**Hymn ${number}: ${hymn.title}**\n\n${lines.join('\n\n')}\n\nSource: ${BOOKS[book].title}, hymn ${number}.`,
    source: `${BOOKS[book].title}, hymn ${number}`
  };
}

function toRoman(number) {
  const numerals = [[9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let remainder = number;
  let result = '';
  for (const [value, numeral] of numerals) {
    while (remainder >= value) {
      result += numeral;
      remainder -= value;
    }
  }
  return result;
}

function getSectionText(section) {
  if (typeof section.text === 'string') return section.text;
  if (typeof section.content === 'string') return section.content;
  if (Array.isArray(section.content)) return section.content.join('\n');
  return '';
}

function answerHymnQuestion(question) {
  const text = normalizeText(question);
  const isHymnQuestion = /\b(hymn|hymnal|lyrics|verses|chorus)\b/.test(text)
    || /\b(assumpta|legion of mary)\b/.test(text);
  if (!isHymnQuestion) return null;

  const bookId = getBookFromQuestion(question);
  const book = BOOKS[bookId];
  const records = readJson(book.file);
  const hymns = Array.isArray(records) ? records : records?.hymns || [];
  if (hymns.length === 0) {
    return {
      reply: `I don't have any authorized hymn texts in the ${book.title} yet. The book is listed, but its texts have not been added.`,
      source: `${book.title} (no texts available yet)`
    };
  }

  const numberMatch = text.match(/\b(?:hymn|number|no)\s*(?:number\s*)?(\d+)\s*([a-z]?)\b/);
  let hymn = null;
  if (numberMatch) {
    hymn = hymns.find(item =>
      Number(item.number) === Number(numberMatch[1])
      && normalizeText(item.suffix || '') === normalizeText(numberMatch[2] || '')
    );
    if (!hymn) {
      return {
        reply: `I couldn't find hymn ${numberMatch[1]}${numberMatch[2]} in the ${book.title}. Please check the number or choose another hymn book.`,
        source: `${book.title} hymn index`
      };
    }
    return formatHymnAnswer(hymn, bookId);
  }

  const ignoredTerms = new Set([...STOP_WORDS, 'hymn', 'hymnal', 'lyrics', 'verse', 'verses', 'chorus', 'refrain', 'book', 'catholic', 'assumpta', 'legion', 'mary']);
  const terms = text.split(' ').filter(term => term && !ignoredTerms.has(term));
  hymn = hymns.find(item => {
    const title = normalizeText(item.title);
    return title && (text.includes(title) || title.includes(terms.join(' ')));
  });
  if (!hymn && terms.length) {
    const ranked = hymns.map(item => {
      const titleTerms = new Set(normalizeText(item.title).split(' '));
      return { item, score: terms.reduce((score, term) => score + (titleTerms.has(term) ? 1 : 0), 0) };
    }).sort((a, b) => b.score - a.score);
    if (ranked[0]?.score && (ranked.length === 1 || ranked[0].score > ranked[1].score)) hymn = ranked[0].item;
  }

  if (!hymn) {
    return {
      reply: `I couldn't match that title to a hymn in the ${book.title}. Please try the exact hymn title or number.`,
      source: `${book.title} hymn index`
    };
  }
  return formatHymnAnswer(hymn, bookId);
}

function answerMassQuestion(question) {
  const text = normalizeText(question);
  const asksAboutMass = /\b(order of mass|mass|liturgy|priest|people|response|responses|introductory rites|liturgy of the word|liturgy of the eucharist|communion rite|concluding rite|liturgia verbi|liturgia eucharistica|ritus communionis|ritus conclusionis)\b/.test(text);
  if (!asksAboutMass) return null;

  const mass = readJson('order-of-mass.json');
  const language = /\b(igbo|ig)\b/.test(text) ? 'ig' : /\b(latin|latina)\b/.test(text) ? 'la' : 'en';
  const languageName = { en: 'English', la: 'Latin', ig: 'Igbo' }[language];
  const sections = Array.isArray(mass[language]) ? mass[language] : [];

  const requestedSection = sections.find(section => {
    const name = normalizeText(section.section);
    return name && (text.includes(name) || name.split(' ').every(word => text.includes(word)));
  });

  if (/\b(order of mass|mass)\b/.test(text) && /\b(order of mass|complete|all|sections)\b/.test(text)) {
    return {
      reply: `The ${languageName} Order of Mass is organized into: ${sections.map(section => section.section).join('; ')}.\n\nSource: Order of Mass, ${languageName}.`,
      source: `Order of Mass (${languageName} section list)`
    };
  }

  let entries = requestedSection?.content || [];
  let sourceLabel = requestedSection?.section;
  if (!entries.length) {
    const terms = text.split(' ').filter(term => term && !STOP_WORDS.has(term) && !['mass', 'liturgy', 'priest', 'people'].includes(term));
    const ranked = sections.flatMap(section => (section.content || []).map(entry => {
      const corpus = normalizeText(`${section.section} ${entry.speaker} ${entry.text}`);
      const score = terms.reduce((total, term) => total + (corpus.includes(term) ? 1 : 0), 0);
      return { section, entry, score };
    })).filter(item => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);
    if (ranked.length) {
      entries = ranked.map(item => item.entry);
      sourceLabel = [...new Set(ranked.map(item => item.section.section))].join(', ');
    }
  }

  if (!entries.length) {
    return {
      reply: `I could not find a matching passage in the ${languageName} Order of Mass currently available in the choir library. Try naming a Mass section or a phrase from the prayer.`,
      source: `Order of Mass (${languageName})`
    };
  }
  const exactText = entries.map(entry => `${entry.speaker}: ${entry.text}`).join('\n\n');
  return {
    reply: `${exactText}\n\nSource: Order of Mass, ${languageName}${sourceLabel ? ` — ${sourceLabel}` : ''}.`,
    source: `Order of Mass, ${languageName}${sourceLabel ? ` — ${sourceLabel}` : ''}`
  };
}

function answerConstitutionQuestion(question) {
  const text = normalizeText(question);
  const mentionsConstitution = /\b(constitution|by law|bylaw|article|section|lateness|late|tardiness|punctual)\b/.test(text);
  if (!mentionsConstitution) return null;

  const document = readJson('choir-constitution.json');
  const namedText = /\bpreamble\b/.test(text) ? document.preamble : /\bdeclaration\b/.test(text) ? document.declaration : null;
  if (namedText) {
    const label = /\bpreamble\b/.test(text) ? 'Preamble' : 'Declaration';
    return {
      reply: `${namedText}\n\nSource: St. Cecilia Choir Constitution and By-Laws — ${label}.`,
      source: `Choir Constitution and By-Laws — ${label}`
    };
  }
  const articleMatch = text.match(/\barticle\s+(?:number\s+)?(ix|iv|viii|vii|vi|v|iii|ii|i|[1-9])\b/);
  const sectionMatch = text.match(/\bsection\s+(?:number\s+)?(\d+)\b/);
  const requestedArticleNumber = articleMatch
    ? ({ i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9 }[articleMatch[1]] || Number(articleMatch[1]))
    : null;

  const asksAboutLateness = /\b(late|lateness|tardy|tardiness|punctual)\b/.test(text);
  let article = requestedArticleNumber
    ? document.articles.find(item => item.number === requestedArticleNumber)
    : null;
  if (sectionMatch) {
    const number = Number(sectionMatch[1]);
    const matches = document.articles
      .filter(item => !requestedArticleNumber || item.number === requestedArticleNumber)
      .flatMap(item => (item.sections || [])
        .filter(section => Number(section.number) === number && getSectionText(section).trim())
        .map(section => ({ article: item, section })));
    if (matches.length === 1) {
      const { article: matchedArticle, section } = matches[0];
      const articleNumeral = toRoman(matchedArticle.number);
      const sectionText = getSectionText(section);
      return {
        reply: `**Article ${articleNumeral}, Section ${number} — ${matchedArticle.title}**\n${sectionText}\n\nSource: St. Cecilia Choir Constitution and By-Laws, Article ${articleNumeral}, Section ${number}.`,
        source: `Choir Constitution and By-Laws, Article ${articleNumeral}, Section ${number}`
      };
    }
    if (matches.length > 1) {
      return {
        reply: `Section ${number} appears in more than one article. Please tell me which article so I can quote the correct text.`,
        source: 'Choir Constitution and By-Laws (section number needs an article)'
      };
    }
    return {
      reply: `The constitution currently available to Cecilia is partial and does not provide numbered section ${number}, so I cannot verify its wording. Please check the complete, approved by-law document when it is added.`,
      source: 'Choir Constitution and By-Laws (partial; requested section unavailable)'
    };
  }

  if (!article && asksAboutLateness) {
    article = document.articles.find(item => item.number === 8);
  }
  if (!article) {
    const terms = text.split(' ').filter(term => term && !STOP_WORDS.has(term) && !['constitution', 'by', 'law', 'bylaw', 'article', 'lateness', 'late'].includes(term));
    const ranked = document.articles.map(item => {
      const sourceText = normalizeText(`${item.title} ${(item.content || []).join(' ')} ${(item.sections || []).map(getSectionText).join(' ')}`);
      return { item, score: terms.reduce((score, term) => score + (sourceText.includes(term) ? 1 : 0), 0) };
    }).sort((a, b) => b.score - a.score);
    if (ranked[0]?.score) article = ranked[0].item;
  }

  if (!article) {
    return {
      reply: 'I could not find that information in the constitution currently available to me. The copy on the site is partial, so please check with a choir executive for the complete approved rule.',
      source: 'Choir Constitution and By-Laws (partial)'
    };
  }

  const articleContent = Array.isArray(article.content)
    ? article.content
    : typeof article.content === 'string' ? [article.content] : [];
  const contentLines = articleContent.map(item => `- ${item}`);
  (article.sections || []).forEach(section => {
    const sectionText = getSectionText(section);
    if (sectionText) contentLines.push(`Section ${section.number}: ${sectionText}`);
  });
  const content = contentLines.join('\n');
  if (!content) {
    return {
      reply: `I found Article ${toRoman(article.number)} — ${article.title}, but no exact wording is available in the current constitution data.`,
      source: 'Choir Constitution and By-Laws (wording unavailable)'
    };
  }
  const articleNumeral = toRoman(article.number);
  const sectionNote = /\bsection\b/.test(text)
    ? 'The published copy does not number subsections. The relevant wording appears under this article.\n\n'
    : '';
  return {
    reply: `${sectionNote}**Article ${articleNumeral} — ${article.title}**\n${content}\n\nSource: St. Cecilia Choir Constitution and By-Laws, Article ${articleNumeral} — ${article.title}.`,
    source: `Choir Constitution and By-Laws, Article ${articleNumeral} — ${article.title}`
  };
}

function answerFromChoirReferences(question) {
  return answerHymnQuestion(question)
    || answerMassQuestion(question)
    || answerConstitutionQuestion(question);
}

module.exports = { answerFromChoirReferences };
