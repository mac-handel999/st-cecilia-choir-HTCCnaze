(() => {
  if (!requireAuth()) return;

  const user = getCurrentUser();
  const alertBox = document.getElementById('ticket-admin-alert');
  if (!user || !['admin', 'exco'].includes(user.role)) {
    document.querySelector('.ticket-admin-page').innerHTML = `
      <section class="ticket-panel">
        <h1>Staff access only</h1>
        <p>This ticket desk is available to choir administrators and executives.</p>
        <a class="btn btn-outline" href="member-home.html">Return to member home</a>
      </section>
    `;
    return;
  }

  const statusFilter = document.getElementById('order-status-filter');
  const orderContainer = document.getElementById('ticket-orders');
  const summaryContainer = document.getElementById('ticket-sales-summary');
  const auditContainer = document.getElementById('ticket-audit');
  const physicalForm = document.getElementById('physical-sale-form');
  const saleResult = document.getElementById('physical-sale-result');
  const checkinForm = document.getElementById('checkin-form');
  const checkinResult = document.getElementById('checkin-result');
  const refreshButton = document.getElementById('refresh-ticket-data');
  const money = value => `₦${new Intl.NumberFormat('en-NG').format(Number(value) || 0)}`;
  const showAlert = (message, kind = 'info') => {
    alertBox.textContent = message;
    alertBox.className = `ticket-alert${kind === 'error' ? ' is-error' : kind === 'success' ? ' is-success' : ''}`;
    alertBox.hidden = false;
  };
  const formatDate = value => value ? new Date(value).toLocaleString() : '—';

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
      const canReview = order.status === 'pending_review';
      const canResend = order.status === 'paid' && order.email && order.email_status !== 'sent';
      return `
        <article class="ticket-review-card">
          <h3>Order ${escapeHtml(order.code)} · ${escapeHtml(order.ticket_packages?.name || 'Ticket package')}</h3>
          <p><strong>${escapeHtml(order.buyer_name)}</strong> · ${escapeHtml(order.phone)}${order.email ? ` · ${escapeHtml(order.email)}` : ''}</p>
          <p>Quantity: ${escapeHtml(order.quantity)} · Amount: <strong>${money(order.amount_ngn)}</strong> · Channel: ${escapeHtml(order.channel)}</p>
          <p>Created: ${escapeHtml(formatDate(order.created_at))} · Status: <span class="ticket-status ticket-status-${escapeHtml(order.status)}">${escapeHtml(order.status.replaceAll('_', ' '))}</span></p>
          ${reference}${proof}${emailStatus}${tickets}
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
    const packageSelect = physicalForm.elements.package_id;
    packageSelect.innerHTML = '<option value="">Choose a package</option>' + (config.packages || []).map(item => (
      `<option value="${escapeHtml(item.id)}"${item.available === 0 ? ' disabled' : ''}>${escapeHtml(item.name)} — ${money(item.price_ngn)}${item.available !== null ? ` · ${escapeHtml(item.available)} available` : ''}${item.available === 0 ? ' — sold out' : ''}</option>`
    )).join('');
    physicalForm.elements.seller_id.innerHTML = '<option value="">Choose seller</option>' + (sellerData.sellers || []).map(seller => (
      `<option value="${escapeHtml(seller.id)}">${escapeHtml(seller.full_name || seller.username || seller.id)}</option>`
    )).join('');
    if (user.id) physicalForm.elements.seller_id.value = user.id;
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
    const payload = {
      package_id: Number(values.get('package_id')),
      quantity: Number(values.get('quantity')),
      seller_id: values.get('seller_id'),
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
      if (user.id) physicalForm.elements.seller_id.value = user.id;
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
  refreshButton.addEventListener('click', refreshAll);
  refreshAll();
})();
