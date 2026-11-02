window.FEATURED_CHOIR_EVENTS = [
  {
    id: 'st-cecilia-feast-2026',
    title: 'St. Cecilia Feast & November Choir Month 2026',
    type: 'Mass',
    event_date: '2026-11-22',
    event_time: 'Every Sunday · First Mass 5:30 AM · Second Mass 10:00 AM',
    target: '2026-11-22T05:30:00+01:00',
    location: 'HTC Parish Centre',
    theme: 'With One Heart, One Mind... Sing Praises',
    description: 'Join the HTC Choir Community for November Choir Month 2026 and the celebration of our patron saint, St. Cecilia.',
    schedule: [
      { date: 'Nov 1', title: 'All Saints - All White Sunday' },
      { date: 'Nov 8', title: 'Jersey Sunday' },
      { date: 'Nov 15', title: 'Cultural Sunday' },
      { date: 'Nov 22', title: 'Corpus Christi - Casual Wear' },
      { date: 'Nov 29', title: 'Corporate Sunday' }
    ],
    image_url: 'IMAGES/november-choir-month-2026.png'
  },
  {
    id: 'music-boom-2026',
    title: 'Music Boom — Egwu Anuri',
    type: 'Concert',
    event_date: '2026-12-20',
    event_time: 'Red Carpet 3:00 PM · Main Event 4:00 PM',
    target: '2026-12-20T16:00:00+01:00',
    location: 'Holy Trinity Catholic Church, Umuakali Naze, Owerri',
    theme: 'Egwu Anuri',
    description: 'Experience an atmosphere of worship, music, drama, and celebration of the birth of Jesus Christ.',
    featuring: 'Choir and special musical presentations',
    invitation: 'Come with your family and friends. Let us celebrate the King together!',
    ticketNotice: 'Tickets are on sale. Contact the numbers below for ticket and event enquiries.',
    contacts: ['07042799614', '07063553107', '08084191017'],
    image_url: 'IMAGES/music-boom-2026.jpg'
  }
];

window.renderFeaturedEventCard = function renderFeaturedEventCard(event, options = {}) {
  const { compact = false } = options;
  const details = [
    `<p><span class="material-symbols-outlined" aria-hidden="true">calendar_today</span> ${escapeHtml(formatDate(event.event_date))}</p>`,
    `<p><span class="material-symbols-outlined" aria-hidden="true">schedule</span> ${escapeHtml(event.event_time)}</p>`,
    `<p><span class="material-symbols-outlined" aria-hidden="true">location_on</span> ${escapeHtml(event.location)}</p>`
  ].join('');
  const schedule = event.schedule?.length
    ? `<ul class="featured-event-schedule">${event.schedule.map(item => `<li><strong>${escapeHtml(item.date)}:</strong> ${escapeHtml(item.title)}</li>`).join('')}</ul>`
    : '';
  const contactLine = event.contacts?.length
    ? `<p><strong>For enquiries:</strong> ${event.contacts.map(escapeHtml).join(' / ')}</p>`
    : '';
  const ticketLink = event.id === 'music-boom-2026'
    ? '<a class="btn btn-primary btn-sm" href="tickets.html">Reserve tickets</a>'
    : '';
  const content = compact
    ? `<p>${escapeHtml(event.description)}</p>${event.ticketNotice ? `<p class="featured-event-ticket-note">${escapeHtml(event.ticketNotice)}</p>` : ''}`
    : `<p>${escapeHtml(event.description)}</p>${event.theme ? `<p><strong>Theme:</strong> ${escapeHtml(event.theme)}</p>` : ''}${event.featuring ? `<p><strong>Featuring:</strong> ${escapeHtml(event.featuring)}</p>` : ''}${event.invitation ? `<p>${escapeHtml(event.invitation)}</p>` : ''}${event.ticketNotice ? `<p class="featured-event-ticket-note">${escapeHtml(event.ticketNotice)}</p>` : ''}${schedule}${contactLine}`;

  return `
    <article class="featured-event-card${compact ? ' featured-event-card-compact' : ''}">
      <a class="featured-event-flyer-link" href="${escapeHtml(event.image_url)}" target="_blank" rel="noopener">
        <img class="featured-event-flyer" src="${escapeHtml(event.image_url)}" alt="${escapeHtml(`${event.title} event flyer`)}" loading="lazy">
      </a>
      <div class="featured-event-body">
        <span class="badge badge-accent">${escapeHtml(event.type)}</span>
        <h3>${escapeHtml(event.title)}</h3>
        <div class="featured-event-details">${details}</div>
        ${content}
        <p class="featured-event-countdown" data-event-countdown="${escapeHtml(event.id)}" data-target="${escapeHtml(event.target)}" aria-live="polite"></p>
        ${ticketLink}
        ${compact ? '' : '<a class="btn btn-outline btn-sm" href="events.html">View all events</a>'}
      </div>
    </article>
  `;
};

window.updateFeaturedEventCountdowns = function updateFeaturedEventCountdowns() {
  document.querySelectorAll('[data-event-countdown][data-target]').forEach(element => {
    const target = new Date(element.dataset.target);
    if (Number.isNaN(target.getTime())) {
      element.textContent = 'Event date to be confirmed';
      return;
    }

    const remaining = target.getTime() - Date.now();
    if (remaining <= 0) {
      element.textContent = 'The event is underway or has passed.';
      return;
    }

    const daysLeft = Math.ceil(remaining / 86400000);
    element.textContent = `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left until D-Day`;
  });
};

document.addEventListener('DOMContentLoaded', () => {
  const homeEvents = document.getElementById('home-featured-events');
  if (homeEvents) {
    homeEvents.innerHTML = window.FEATURED_CHOIR_EVENTS
      .map(event => window.renderFeaturedEventCard(event))
      .join('');
  }

  const eventList = document.getElementById('featured-events-list');
  if (eventList) {
    eventList.innerHTML = window.FEATURED_CHOIR_EVENTS
      .map(event => window.renderFeaturedEventCard(event))
      .join('');
  }

  window.updateFeaturedEventCountdowns();
  window.setInterval(window.updateFeaturedEventCountdowns, 60000);
});
