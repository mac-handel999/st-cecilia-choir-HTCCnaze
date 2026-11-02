(() => {
  const alertBox = document.getElementById('ticket-alert');
  const packageSelect = document.getElementById('ticket-package');
  const quantityInput = document.getElementById('ticket-quantity');
  const totalLabel = document.getElementById('ticket-total');
  const reserveForm = document.getElementById('reserve-form');
  const reserveButton = document.getElementById('reserve-button');
  const instructions = document.getElementById('payment-instructions');
  const lookupForm = document.getElementById('lookup-form');
  const orderResult = document.getElementById('order-result');
  const proofForm = document.getElementById('proof-form');
  let packages = [];
  let reservationEnabled = false;

  const formatMoney = amount => `₦${new Intl.NumberFormat('en-NG').format(amount)}`;
  const showAlert = (message, kind = 'info') => {
    alertBox.textContent = message;
    alertBox.className = `ticket-alert${kind === 'error' ? ' is-error' : kind === 'success' ? ' is-success' : ''}`;
    alertBox.hidden = false;
  };
  const statusLabel = status => ({
    reserved: 'Reserved — payment not submitted',
    pending_review: 'Payment details received — waiting for review',
    paid: 'Payment confirmed',
    rejected: 'Payment was not confirmed',
    expired: 'Reservation expired',
    cancelled: 'Cancelled'
  }[status] || status);

  function updateTotal() {
    const selected = packages.find(item => String(item.id) === packageSelect.value);
    const quantity = Number(quantityInput.value);
    totalLabel.textContent = selected && Number.isInteger(quantity) && quantity > 0
      ? formatMoney(selected.price_ngn * quantity)
      : '—';
  }

  async function loadPackages() {
    try {
      const config = await api.get('/tickets/config');
      packages = config.packages || [];
      const availablePackages = packages.filter(item => item.available === null || item.available > 0);
      packageSelect.innerHTML = '<option value="">Choose a package</option>' + packages.map(item => (
        `<option value="${escapeHtml(item.id)}"${item.available === 0 ? ' disabled' : ''}>${escapeHtml(item.name)} — ${formatMoney(item.price_ngn)} each${item.available !== null ? ` · ${escapeHtml(item.available)} available` : ''}${item.description ? ` (${escapeHtml(item.description)})` : ''}${item.available === 0 ? ' — sold out' : ''}</option>`
      )).join('');
      reservationEnabled = Boolean(config.bankConfigured && availablePackages.length);
      reserveButton.disabled = !reservationEnabled;
      if (!config.bankConfigured) {
        showAlert('Online reservations are not open yet. The choir has not added its bank transfer details. Please contact the choir for ticket information.');
      } else if (packages.length === 0) {
        showAlert('Ticket packages are temporarily unavailable. Please try again later.', 'error');
      } else if (availablePackages.length === 0) {
        showAlert('All ticket packages are currently sold out. Please contact the choir for updates.');
      }
      updateTotal();
    } catch (error) {
      packageSelect.innerHTML = '<option value="">Ticket packages unavailable</option>';
      showAlert(error.message || 'Ticket packages could not be loaded. Please try again later.', 'error');
    }
  }

  function displayOrder(order, bank) {
    const effectiveStatus = order.status === 'reserved' && new Date(order.expires_at).getTime() <= Date.now()
      ? 'expired'
      : order.status;
    const packageName = order.ticket_packages?.name
      || packages.find(item => Number(item.id) === Number(order.package_id))?.name
      || 'Ticket package';
    const ticketItems = order.issued_tickets?.length
      ? `<h3>Your ticket codes</h3><ol class="ticket-code-list">${order.issued_tickets.map(ticket => `<li>${ticket.serial ? `Printed ticket ${escapeHtml(ticket.serial)} · ` : ''}<code>${escapeHtml(ticket.code)}</code></li>`).join('')}</ol><p>These are your private entry codes. Do not share them. QR tickets were also sent by email if email delivery succeeded.</p>`
      : '';
    const rejection = order.rejection_reason
      ? `<p><strong>Update:</strong> ${escapeHtml(order.rejection_reason)}</p>`
      : '';
    orderResult.innerHTML = `
      <article class="ticket-order-card">
        <p><strong>Order ${escapeHtml(order.code)}</strong> <span class="ticket-status ticket-status-${escapeHtml(effectiveStatus)}">${escapeHtml(statusLabel(effectiveStatus))}</span></p>
        <p>Package: ${escapeHtml(packageName)} · Quantity: ${escapeHtml(order.quantity)} · Total: <strong>${formatMoney(order.amount_ngn)}</strong></p>
        ${effectiveStatus === 'reserved' && bank ? `<p>Make a bank transfer to the account below. Then submit your transfer reference or receipt.</p><p><strong>Bank:</strong> ${escapeHtml(bank.bank)}<br><strong>Account name:</strong> ${escapeHtml(bank.name)}<br><strong>Account number:</strong> ${escapeHtml(bank.number)}<br><strong>Use this as the transfer narration:</strong> ${escapeHtml(order.code)}</p>` : ''}
        ${effectiveStatus === 'pending_review' ? '<p>The choir team will check your payment against the bank account. You will receive an email when it has been confirmed.</p>' : ''}
        ${effectiveStatus === 'paid' && order.email_status === 'failed' ? '<p>Your payment is confirmed, but the ticket email could not be sent. Please contact the choir and provide your order code.</p>' : ''}
        ${effectiveStatus === 'paid' && order.email_status === 'not_configured' ? '<p>Your payment is confirmed. Email delivery is not set up yet; contact the choir with your order code to receive your tickets.</p>' : ''}
        ${rejection}${ticketItems}
      </article>
    `;
    proofForm.hidden = effectiveStatus !== 'reserved';
    proofForm.elements.code.value = order.code;
    proofForm.elements.email.value = order.email;
  }

  packageSelect.addEventListener('change', updateTotal);
  quantityInput.addEventListener('input', updateTotal);

  reserveForm.addEventListener('submit', async event => {
    event.preventDefault();
    reserveButton.disabled = true;
    reserveButton.textContent = 'Reserving…';
    alertBox.hidden = true;
    try {
      const formData = new FormData(reserveForm);
      const result = await api.post('/tickets/orders', {
        package_id: Number(formData.get('package_id')),
        quantity: Number(formData.get('quantity')),
        buyer_name: formData.get('buyer_name'),
        email: formData.get('email'),
        phone: formData.get('phone')
      });
      instructions.hidden = false;
      instructions.innerHTML = `
        <h3>Your reservation is ready</h3>
        <p>Order code: <strong>${escapeHtml(result.order.code)}</strong>. Save this code and use it with your email address to check your order.</p>
        <p>Transfer <strong>${formatMoney(result.order.amount_ngn)}</strong> to:</p>
        <p><strong>Bank:</strong> ${escapeHtml(result.bank.bank)}<br><strong>Account name:</strong> ${escapeHtml(result.bank.name)}<br><strong>Account number:</strong> ${escapeHtml(result.bank.number)}<br><strong>Transfer narration:</strong> ${escapeHtml(result.order.code)}</p>
        <p>This reservation expires ${escapeHtml(new Date(result.order.expires_at).toLocaleString())}. Payment is confirmed manually after the choir checks the bank transfer.</p>
      `;
      lookupForm.elements.code.value = result.order.code;
      lookupForm.elements.email.value = result.order.email;
      showAlert('Your tickets are reserved. Complete the bank transfer, then send the transfer reference or receipt below.', 'success');
      displayOrder(result.order, result.bank);
      instructions.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (error) {
      showAlert(error.message || 'We could not reserve those tickets. Please check your details and try again.', 'error');
    } finally {
      reserveButton.disabled = !reservationEnabled;
      reserveButton.textContent = 'Reserve tickets';
    }
  });

  lookupForm.addEventListener('submit', async event => {
    event.preventDefault();
    orderResult.textContent = 'Checking your order…';
    proofForm.hidden = true;
    try {
      const values = new FormData(lookupForm);
      const query = new URLSearchParams({ email: values.get('email') });
      const result = await api.get(`/tickets/orders/${encodeURIComponent(values.get('code').trim())}?${query}`);
      displayOrder(result.order);
    } catch (error) {
      orderResult.textContent = error.message || 'We could not find an order matching those details.';
    }
  });

  proofForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = proofForm.querySelector('button[type="submit"]');
    const previousLabel = button.textContent;
    button.disabled = true;
    button.textContent = 'Sending…';
    try {
      const formData = new FormData(proofForm);
      const result = await api.post(`/tickets/orders/${encodeURIComponent(formData.get('code'))}/proof`, formData);
      showAlert(result.message, 'success');
      const query = new URLSearchParams({ email: formData.get('email') });
      try {
        const updated = await api.get(`/tickets/orders/${encodeURIComponent(formData.get('code'))}?${query}`);
        displayOrder(updated.order);
        proofForm.reset();
      } catch {
        proofForm.hidden = true;
        orderResult.textContent = 'Your payment details were sent. Check the order again in a moment to see the updated status.';
      }
    } catch (error) {
      showAlert(error.message || 'We could not send your payment details. Please try again.', 'error');
    } finally {
      button.disabled = false;
      button.textContent = previousLabel;
    }
  });

  loadPackages();
})();
