(() => {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  if (!token) {
    window.location.replace('admin-login.html?next=ticket-admin.html');
    return;
  }

  const loginUrl = 'admin-login.html?next=ticket-admin.html';
  let user;
  const alertBox = document.getElementById('ticket-admin-alert');
  const statusFilter = document.getElementById('order-status-filter');
  const orderContainer = document.getElementById('ticket-orders');
  const summaryContainer = document.getElementById('ticket-sales-summary');
  const auditContainer = document.getElementById('ticket-audit');
  const physicalForm = document.getElementById('physical-sale-form');
  const saleResult = document.getElementById('physical-sale-result');
  const checkinForm = document.getElementById('checkin-form');
  const checkinResult = document.getElementById('checkin-result');
  const refreshButton = document.getElementById('refresh-ticket-data');
  const packagePreview = document.getElementById('ticket-package-preview');
  const packageImage = document.getElementById('ticket-package-image');
  const packageCaption = document.getElementById('ticket-package-caption');
  const packageArtwork = {
    regular: 'IMAGES/music-boom-ticket-regular.jpg',
    vip: 'IMAGES/music-boom-ticket-vip.jpg',
    family: 'IMAGES/music-boom-ticket-family.jpg'
  };
  let packages = [];
  let sellers = [];
  let ticketAlertCursor = new Date(Date.now() - 15000).toISOString();
  let ticketAlertPollInProgress = false;
  const seenTicketAlerts = new Set();
  const money = value => `₦${new Intl.NumberFormat('en-NG').format(Number(value) || 0)}`;
  const showAlert = (message, kind = 'info') => {
    alertBox.textContent = message;
    alertBox.className = `ticket-alert${kind === 'error' ? ' is-error' : kind === 'success' ? ' is-success' : ''}`;
    alertBox.hidden = false;
  };
  const formatDate = value => value ? new Date(value).toLocaleString() : '—';

  function updatePackagePreview() {
    const select = physicalForm.elements.package_id;
    const selected = [...select.options].find(option => option.value === select.value);
    const packageData = packages.find(item => String(item.id) === select.value);
    const imagePath = packageData && packageArtwork[packageData.slug];
    if (!selected || !imagePath) {
      packagePreview.hidden = true;
      return;
    }
    packageImage.src = imagePath;
    packageImage.alt = `${selected.textContent.split(' — ')[0]} Music Boom ticket`;
    packageCaption.textContent = selected.textContent.split(' · ')[0];
    packagePreview.hidden = false;
  }

  async function loadSummary() {
    const data = await api.get('/tickets/admin/summary');
    const totals = new Map();
    (data.stats || []).forEach(row => {
      const current = totals.get(row.slug) || {
        name: row.package_name,
        sold: 0,
        revenue: 0,
        awaiting: 0,
        reserved: 0,
        available: row.available,
        capacity: row.capacity
      };
      current.sold += Number(row.tickets_sold || 0);
      current.revenue += Number(row.revenue_ngn || 0);
      current.awaiting += Number(row.awaiting_review || 0);
      current.reserved += Number(row.active_reservations || 0);
      if (row.available !== null && row.available !== undefined) current.available = row.available;
      if (row.capacity !== null && row.capacity !== undefined) current.capacity = row.capacity;
      totals.set(row.slug, current);
    });

    summaryContainer.innerHTML = totals.size
      ? [...totals.values()].map(item => `
        <article class="ticket-stat-card">
          <h3>${escapeHtml(item.name)}</h3>
          <p>Tickets sold: <strong>${item.sold}</strong></p>
          <p>Recorded revenue: <strong>${money(item.revenue)}</strong></p>
          <p>Reserved, awaiting transfer: <strong>${item.reserved}</strong></p>
          <p>Waiting for payment review: <strong>${item.awaiting}</strong></p>
          <p>${item.capacity === null ? 'Capacity not set' : `Available: ${escapeHtml(item.available)} of ${escapeHtml(item.capacity)}`}</p>
        </article>
      `).join('')
      : '<p>No ticket packages are configured.</p>';

    auditContainer.innerHTML = data.audit?.length
      ? `<div class="ticket-audit-table-wrap"><table class="ticket-audit-table">
          <thead><tr><th>Time</th><th>Action</th><th>Record</th><th>Details</th><th>Audit link</th></tr></thead>
          <tbody>${data.audit.map(entry => `
            <tr>
              <td>${escapeHtml(formatDate(entry.at))}</td>
              <td>${escapeHtml(entry.action)}</td>
              <td>${escapeHtml(entry.entity)} ${escapeHtml(entry.entity_id)}</td>
              <td>${escapeHtml(JSON.stringify(entry.details || {}))}</td>
              <td><code>${escapeHtml(String(entry.entry_hash || '').slice(0, 12))}…</code></td>
            </tr>
          `).join('')}</tbody>
        </table></div>`
      : '<p>No ticket activity has been recorded yet.</p>';
  }

  async function loadOrders() {
    orderContainer.innerHTML = '<p>Loading orders…</p>';
    const result = await api.get(`/tickets/admin/orders?status=${encodeURIComponent(statusFilter.value)}`);
    const orders = result.orders || [];
    if (!orders.length) {
      orderContainer.innerHTML = '<p>There are no orders in this group.</p>';
      return;
    }

    orderContainer.innerHTML = `<div class="ticket-orders-list">${orders.map(order => {
      const tickets = order.issued_tickets?.length
        ? `<p>Ticket codes: ${order.issued_tickets.map(ticket => `<code>${escapeHtml(ticket.serial || ticket.code)}</code>`).join(', ')}</p>`
        : '';
      const proof = order.proof_url
        ? `<p><a href="${escapeHtml(order.proof_url)}" target="_blank" rel="noopener">View payment receipt (link expires in 5 minutes)</a></p>`
        : '';
      const reference = order.payment_reference
        ? `<p>Transfer reference: <strong>${escapeHtml(order.payment_reference)}</strong></p>`
        : '';
      const emailStatus = order.email_status && order.email_status !== 'not_sent'
        ? `<p>Ticket email: <strong>${escapeHtml(order.email_status.replaceAll('_', ' '))}</strong>${order.email_error ? ` · ${escapeHtml(order.email_error)}` : ''}</p>`
        : '';
      const seller = order.channel === 'physical' && order.seller_name
        ? `<p>Seller: <strong>${escapeHtml(order.seller_name)}</strong></p>`
        : '';
      const canReview = order.status === 'pending_review';
      const canResend = order.status === 'paid' && order.email && order.email_status !== 'sent';
      return `
        <article class="ticket-review-card">
          <h3>Order ${escapeHtml(order.code)} · ${escapeHtml(order.ticket_packages?.name || 'Ticket package')}</h3>
          <p><strong>${escapeHtml(order.buyer_name)}</strong> · ${escapeHtml(order.phone)}${order.email ? ` · ${escapeHtml(order.email)}` : ''}</p>
          <p>Quantity: ${escapeHtml(order.quantity)} · Amount: <strong>${money(order.amount_ngn)}</strong> · Channel: ${escapeHtml(order.channel)}</p>
          <p>Created: ${escapeHtml(formatDate(order.created_at))} · Status: <span class="ticket-status ticket-status-${escapeHtml(order.status)}">${escapeHtml(order.status.replaceAll('_', ' '))}</span></p>
          ${reference}${proof}${emailStatus}${seller}${tickets}
          ${canReview ? `<div class="ticket-review-actions">
            <button type="button" class="btn btn-primary" data-order-action="approve" data-order-id="${escapeHtml(order.id)}" data-quantity="${escapeHtml(order.quantity)}">Confirm payment and issue tickets</button>
            <button type="button" class="btn btn-outline" data-order-action="reject" data-order-id="${escapeHtml(order.id)}">Reject payment</button>
          </div>` : ''}
          ${canResend ? `<div class="ticket-review-actions"><button type="button" class="btn btn-outline" data-order-action="resend" data-order-id="${escapeHtml(order.id)}">Retry ticket email</button></div>` : ''}
        </article>
      `;
    }).join('')}</div>`;
  }

  async function loadOptions() {
    const [config, sellerData] = await Promise.all([
      api.get('/tickets/config'),
      api.get('/tickets/admin/sellers')
    ]);
    sellers = sellerData.sellers || [];
    const packageSelect = physicalForm.elements.package_id;
    packages = config.packages || [];
    packageSelect.innerHTML = '<option value="">Choose a package</option>' + packages.map(item => (
      `<option value="${escapeHtml(item.id)}"${item.available === 0 ? ' disabled' : ''}>${escapeHtml(item.name)} — ${money(item.price_ngn)}${item.available !== null ? ` · ${escapeHtml(item.available)} available` : ''}${item.available === 0 ? ' — sold out' : ''}</option>`
    )).join('');
    updatePackagePreview();
    document.getElementById('ticket-seller-options').innerHTML = sellers
      .map(seller => seller.full_name || seller.username || '')
      .filter(Boolean)
      .filter((name, index, names) => names.indexOf(name) === index)
      .map(name => `<option value="${escapeHtml(name)}"></option>`)
      .join('');
    if (!physicalForm.elements.seller_name.value && user.full_name) {
      physicalForm.elements.seller_name.value = user.full_name;
    }
  }

  async function refreshAll() {
    refreshButton.disabled = true;
    try {
      const results = await Promise.allSettled([loadSummary(), loadOrders(), loadOptions()]);
      const failures = results.filter(result => result.status === 'rejected');
      if (failures.length) {
        const firstError = failures[0].reason;
        showAlert(firstError.message || 'Some ticket information could not be loaded. Please try again.', 'error');
      } else {
        alertBox.hidden = true;
      }
    } finally {
      refreshButton.disabled = false;
    }
  }

  async function checkForTicketAlerts() {
    if (!user || ticketAlertPollInProgress) return;
    ticketAlertPollInProgress = true;
    try {
      const data = await api.get(`/tickets/admin/notifications?since=${encodeURIComponent(ticketAlertCursor)}`);
      const notifications = data.notifications || [];
      const newAlerts = notifications.filter(notification => !seenTicketAlerts.has(notification.id));
      notifications.forEach(notification => seenTicketAlerts.add(notification.id));
      if (notifications.length) {
        ticketAlertCursor = notifications.reduce((latest, notification) => (
          notification.created_at > latest ? notification.created_at : latest
        ), ticketAlertCursor);
      }

      if (seenTicketAlerts.size > 100) {
        const oldestIds = [...seenTicketAlerts].slice(0, seenTicketAlerts.size - 100);
        oldestIds.forEach(id => seenTicketAlerts.delete(id));
      }
      if (newAlerts.length) {
        newAlerts.forEach(notification => Toast.info(`${notification.title}: ${notification.message}`));
        await Promise.all([loadOrders(), loadSummary()]);
      }
    } catch (error) {
      console.error('Ticket alerts could not be checked:', error.message);
    } finally {
      ticketAlertPollInProgress = false;
    }
  }

  orderContainer.addEventListener('click', async event => {
    const button = event.target.closest('[data-order-action]');
    if (!button) return;
    const id = button.dataset.orderId;
    const action = button.dataset.orderAction;
    let path;
    let body = {};
    if (action === 'approve') {
      const confirmed = window.confirm('Have you matched the buyer’s transfer against the bank account? Confirming payment will create the QR tickets.');
      if (!confirmed) return;
      path = `/tickets/admin/orders/${encodeURIComponent(id)}/approve`;
      body = { quantity: Number(button.dataset.quantity) };
    } else if (action === 'reject') {
      const reason = window.prompt('Why could the payment not be confirmed?', 'Payment could not be confirmed');
      if (reason === null) return;
      path = `/tickets/admin/orders/${encodeURIComponent(id)}/reject`;
      body = { reason };
    } else if (action === 'resend') {
      path = `/tickets/admin/orders/${encodeURIComponent(id)}/resend`;
    }

    button.disabled = true;
    try {
      const result = await api.post(path, body);
      showAlert(result.message, result.email_status === 'failed' ? 'error' : 'success');
      await Promise.all([loadOrders(), loadSummary()]);
    } catch (error) {
      showAlert(error.message || 'That ticket action could not be completed. Refresh and try again.', 'error');
    } finally {
      button.disabled = false;
    }
  });

  physicalForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = physicalForm.querySelector('button[type="submit"]');
    button.disabled = true;
    const values = new FormData(physicalForm);
    const sellerName = String(values.get('seller_name') || '').trim();
    const matchedSeller = sellers.find(seller =>
      [seller.full_name, seller.username]
        .some(name => name && name.trim().toLocaleLowerCase() === sellerName.toLocaleLowerCase())
    );
    const payload = {
      package_id: Number(values.get('package_id')),
      quantity: Number(values.get('quantity')),
      seller_id: matchedSeller?.id || null,
      seller_name: sellerName,
      buyer_name: values.get('buyer_name'),
      phone: values.get('phone'),
      email: values.get('email'),
      serials: String(values.get('serials')).split(/[\s,]+/).filter(Boolean)
    };
    try {
      const result = await api.post('/tickets/admin/physical-sales', payload);
      saleResult.innerHTML = `<div class="ticket-order-card">
        <p>${escapeHtml(result.message)}</p>
        <p>Order code: <strong>${escapeHtml(result.order.code)}</strong></p>
        <p>Printed tickets: ${result.tickets.map(ticket => `<code>${escapeHtml(ticket.serial)}</code>`).join(', ')}</p>
      </div>`;
      showAlert('Physical sale recorded.', 'success');
      physicalForm.reset();
      updatePackagePreview();
      if (user.full_name) physicalForm.elements.seller_name.value = user.full_name;
      physicalForm.elements.seller_name.focus();
      await Promise.all([loadSummary(), loadOrders()]);
    } catch (error) {
      showAlert(error.message || 'The physical sale could not be recorded. Check the details and serial numbers.', 'error');
    } finally {
      button.disabled = false;
    }
  });

  checkinForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = checkinForm.querySelector('button[type="submit"]');
    const code = String(new FormData(checkinForm).get('code') || '').trim();
    button.disabled = true;
    checkinResult.className = 'ticket-checkin-result';
    checkinResult.textContent = 'Checking ticket…';
    try {
      const result = await api.post('/tickets/admin/check-in', { code });
      const success = result.result === 'ok';
      checkinResult.className = `ticket-checkin-result ${success ? 'is-success' : 'is-error'}`;
      checkinResult.innerHTML = `<strong>${escapeHtml(result.message)}</strong>${success ? `<p>${escapeHtml(result.buyer_name)} · ${escapeHtml(result.package_name)} · ${escapeHtml(result.ticket_code)}</p>` : ''}`;
      checkinForm.reset();
      checkinForm.elements.code.focus();
      if (success) await loadSummary();
    } catch (error) {
      checkinResult.className = 'ticket-checkin-result is-error';
      checkinResult.textContent = error.message || 'Ticket check-in could not be completed.';
    } finally {
      button.disabled = false;
    }
  });

  statusFilter.addEventListener('change', () => loadOrders().catch(error => showAlert(error.message, 'error')));
  physicalForm.elements.package_id.addEventListener('change', updatePackagePreview);
  refreshButton.addEventListener('click', refreshAll);
  api.get('/auth/me').then(currentUser => {
    if (!currentUser || !['admin', 'exco'].includes(currentUser.role)) {
      window.location.replace(loginUrl);
      return;
    }
    user = currentUser;
    refreshAll();
    checkForTicketAlerts();
    window.setInterval(checkForTicketAlerts, 10000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkForTicketAlerts();
    });
  }).catch(() => {
    clearCurrentUser();
    window.location.replace(loginUrl);
  });
})();
