(() => {
  if (!requireAuth()) return;

  const alertBox = document.getElementById('ledger-alert');
  const managementPanel = document.getElementById('ledger-management');
  const searchInput = document.getElementById('ledger-search');
  const recordsContainer = document.getElementById('ledger-records');
  const summaryContainer = document.getElementById('ledger-summary');
  const refreshButton = document.getElementById('ledger-refresh');
  const searchPanel = document.getElementById('ledger-search-panel');
  const yearFilter = document.getElementById('ledger-year-filter');
  const monthFilter = document.getElementById('ledger-month-filter');
  const categoryFilter = document.getElementById('ledger-category-filter');
  const statusFilter = document.getElementById('ledger-status-filter');
  const deleteAllButton = document.getElementById('ledger-delete-all');
  const importForm = document.getElementById('ledger-import-form');
  const addMemberForm = document.getElementById('ledger-add-member-form');
  const manualDebtForm = document.getElementById('ledger-manual-debt-form');
  const importPreview = document.getElementById('ledger-import-preview');
  const importButton = document.getElementById('ledger-import-file');
  const parseButton = document.getElementById('ledger-parse-file');
  const ledgerAdminNav = document.getElementById('ledger-admin-nav');
  const bankDetails = document.getElementById('ledger-bank-details');
  const bankUnavailable = document.getElementById('ledger-bank-unavailable');
  let entries = [];
  let canManageLedger = false;
  let loading = false;
  let parsedImport = null;
  let importRoles = [];
  let importHasHeader = true;

  const toCents = value => Math.round((Number(value) || 0) * 100);
  const fromCents = cents => cents / 100;
  const money = value => `₦${new Intl.NumberFormat('en-NG', {
    minimumFractionDigits: Number.isInteger(Number(value)) ? 0 : 2,
    maximumFractionDigits: 2
  }).format(Number(value) || 0)}`;
  const labelCategory = category => ({
    choir_monthly_dues: 'Choir monthly dues',
    burial_levy: 'Burial levy',
    wedding_levy: 'Wedding levy',
    child_dedication_levy: 'Child dedication levy',
    other: 'Other choir payment'
  }[category] || 'Choir payment');
  const monthName = month => month
    ? new Intl.DateTimeFormat('en', { month: 'long' }).format(new Date(2024, Number(month) - 1, 1))
    : '';

  function periodLabel(year, month) {
    return [monthName(month), year].filter(Boolean).join(' ') || 'Period not specified';
  }

  function showAlert(message, kind = 'info') {
    alertBox.textContent = message;
    alertBox.className = `ticket-alert${kind === 'error' ? ' is-error' : kind === 'success' ? ' is-success' : ''}`;
    alertBox.hidden = false;
  }

  function paymentTotals(obligation) {
    const paidCents = (obligation.payments || []).reduce((sum, payment) => sum + toCents(payment.amount_ngn), 0);
    const dueCents = toCents(obligation.amount_ngn);
    return {
      paidCents,
      dueCents,
      remainingCents: Math.max(0, dueCents - paidCents)
    };
  }

  function renderObligation(obligation) {
    const totals = paymentTotals(obligation);
    const paymentStatus = totals.remainingCents === 0
      ? 'Paid in full'
      : totals.paidCents > 0 ? 'Part-paid' : 'Not paid yet';
    const paymentHistory = (obligation.payments || [])
      .slice()
      .sort((a, b) => new Date(b.paid_at).getTime() - new Date(a.paid_at).getTime())
      .map(payment => `<li>${money(payment.amount_ngn)} received${payment.paid_at ? ` on ${escapeHtml(new Date(payment.paid_at).toLocaleDateString())}` : ''}${payment.reference ? ` · Ref: ${escapeHtml(payment.reference)}` : ''}</li>`)
      .join('');
    const paymentForm = canManageLedger && totals.remainingCents > 0
      ? `<details class="ledger-record-payment">
          <summary>Record a payment received</summary>
          <p>Enter the amount shown on the member's receipt. You can record a part-payment.</p>
          <form data-ledger-action="add-payment" data-obligation-id="${escapeHtml(obligation.id)}">
          <div class="ticket-field-row">
            <label>Amount received (up to ${money(fromCents(totals.remainingCents))})
              <input name="amount_ngn" type="number" min="0.01" max="${fromCents(totals.remainingCents)}" step="0.01" required>
            </label>
            <label>Receipt or payment reference (optional)
              <input name="reference" type="text" maxlength="120">
            </label>
          </div>
          <button class="btn btn-primary" type="submit">Save payment received</button>
          </form>
        </details>`
      : '';
    const period = periodLabel(obligation.period_year, obligation.period_month);

    return `<article class="ledger-obligation">
      <div class="ledger-obligation-heading">
        <div><h4>${escapeHtml(obligation.title)}</h4><p>${escapeHtml(labelCategory(obligation.category))} · ${escapeHtml(period)}</p></div>
        <div class="ledger-amount-remaining"><span>Still to pay</span><strong>${money(fromCents(totals.remainingCents))}</strong></div>
      </div>
      <p class="ledger-payment-status">${paymentStatus}: ${money(fromCents(totals.paidCents))} paid out of ${money(obligation.amount_ngn)}.</p>
      ${paymentHistory ? `<ul class="ledger-payment-history">${paymentHistory}</ul>` : '<p class="ledger-no-obligations">No payments have been recorded yet.</p>'}
      ${paymentForm}
    </article>`;
  }

  function renderEntry(entry) {
    const obligations = entry.obligations || [];
    const outstandingCents = obligations.reduce((sum, obligation) => sum + paymentTotals(obligation).remainingCents, 0);
    const sourceName = entry.source_member_name !== entry.member_name
      ? `<p>Original name in source list: ${escapeHtml(entry.source_member_name)}</p>`
      : '';
    const sourceOtherName = entry.source_other_name && entry.source_other_name !== entry.other_name
      ? `<p>Other name in source list: ${escapeHtml(entry.source_other_name)}</p>`
      : '';
    const currentOtherName = entry.other_name
      ? `<p>Other name: ${escapeHtml(entry.other_name)}</p>`
      : '';
    const reviewStatus = entry.review_status === 'reviewed'
      ? '<span class="ledger-review-status is-reviewed">Old list checked</span>'
      : '<span class="ledger-review-status">Old list not checked</span>';
    const sourceValues = entry.source_serial !== null || entry.source_debt_2025 !== null
      || entry.source_debt_2026 !== null || entry.source_debt_amount !== null
      || entry.source_year !== null || entry.source_month !== null
      || entry.source_category !== null || entry.source_file_name !== null
      || entry.source_total !== null || entry.source_notes !== null;
    const hasLegacySourceAmounts = entry.source_debt_2025 !== null
      || entry.source_debt_2026 !== null || entry.source_total !== null;
    const sourcePanel = sourceValues
      ? `<section class="ledger-source-values" aria-label="Old list information, not included in balance">
          <h4>Old list figures${entry.source_serial !== null ? ` · S/N ${escapeHtml(entry.source_serial)}` : ''}</h4>
          ${sourceName}${sourceOtherName}
          ${hasLegacySourceAmounts ? `<div class="ledger-old-figures">
            ${entry.source_debt_2025 !== null ? `<p><span>2025 debt</span><strong>${escapeHtml(entry.source_debt_2025)}</strong></p>` : ''}
            ${entry.source_debt_2026 !== null ? `<p><span>2026 debt</span><strong>${escapeHtml(entry.source_debt_2026)}</strong></p>` : ''}
          </div>` : ''}
          ${entry.source_debt_amount !== null ? `<p>Amount in old list: <strong>${escapeHtml(entry.source_debt_amount)}</strong></p>` : ''}
          ${entry.source_year || entry.source_month ? `<p>Period in old list: ${escapeHtml(periodLabel(entry.source_year, entry.source_month))}</p>` : ''}
          ${entry.source_category ? `<p>Payment type in old list: ${escapeHtml(entry.source_category)}</p>` : ''}
          ${entry.source_total !== null ? `<p>Total / note from old list: <strong>${escapeHtml(entry.source_total)}</strong></p>` : ''}
          ${entry.source_notes ? `<p>Note: ${escapeHtml(entry.source_notes)}</p>` : ''}
          ${entry.source_file_name ? `<p>Imported from: ${escapeHtml(entry.source_file_name)}</p>` : ''}
          ${entry.review_status !== 'reviewed' ? '<p class="debt-ledger-note">These old figures are shown as supplied. They do not change the current balance until a Finance Secretary checks and confirms them.</p>' : '<p class="ledger-source-checked-note">These figures were checked. They remain separate from the current balance.</p>'}
        </section>`
      : '';
    const management = canManageLedger
      ? `<details class="ledger-management-controls">
          <summary>Finance Secretary: manage this member's record</summary>
          <p>Use these options to correct the name, check an old list entry, or add a new amount due.</p>
          <form data-ledger-action="save-entry" data-entry-id="${escapeHtml(entry.id)}">
            <div class="ticket-field-row">
              <label>Member's full name
                <input name="member_name" type="text" maxlength="160" value="${escapeHtml(entry.member_name)}" required>
              </label>
              <label>Other name (optional)
                <input name="other_name" type="text" maxlength="160" value="${escapeHtml(entry.other_name || '')}">
              </label>
            </div>
            <button class="btn btn-outline" type="submit">Save name</button>
          </form>
          ${entry.review_status !== 'reviewed' ? `<button class="btn btn-outline" type="button" data-ledger-review="${escapeHtml(entry.id)}">Mark old list as checked</button>` : ''}
          <form data-ledger-action="add-obligation" data-entry-id="${escapeHtml(entry.id)}">
            <h4>Add a payment due</h4>
            <div class="ticket-field-row">
              <label>Type of payment
                <select name="category" required>
                  <option value="choir_monthly_dues">Choir monthly dues</option>
                  <option value="burial_levy">Burial levy</option>
                  <option value="wedding_levy">Wedding levy</option>
                  <option value="child_dedication_levy">Child dedication levy</option>
                  <option value="other">Other choir payment</option>
                </select>
              </label>
              <label>Amount (₦)
                <input name="amount_ngn" type="number" min="0.01" step="0.01" required>
              </label>
            </div>
            <label>Short description
              <input name="title" type="text" maxlength="160" placeholder="For example: November 2026 dues" required>
            </label>
            <div class="ticket-field-row">
              <label>Year (optional)
                <input name="year" type="number" min="1900" max="2200" step="1" inputmode="numeric">
              </label>
              <label>Month (optional)
                <select name="month">
                  <option value="">Not specified</option>
                  <option value="1">January</option><option value="2">February</option>
                  <option value="3">March</option><option value="4">April</option>
                  <option value="5">May</option><option value="6">June</option>
                  <option value="7">July</option><option value="8">August</option>
                  <option value="9">September</option><option value="10">October</option>
                  <option value="11">November</option><option value="12">December</option>
                </select>
              </label>
            </div>
            <button class="btn btn-primary" type="submit">Add payment due</button>
          </form>
        </details>`
      : '';

    return `<article class="ledger-record">
      <div class="ledger-record-heading">
        <div>
          <h3>${escapeHtml(entry.member_name)}</h3>
          ${currentOtherName}
        </div>
        ${reviewStatus}
      </div>
      ${sourcePanel}
      <section class="ledger-obligations" aria-label="Confirmed debts and payments">
        ${obligations.length
          ? obligations.map(renderObligation).join('')
          : '<p class="ledger-no-obligations">No payment due has been recorded for this member yet.</p>'}
        ${obligations.length ? `<p class="ledger-total-remaining"><strong>Total still to pay: ${money(fromCents(outstandingCents))}</strong></p>` : ''}
      </section>
      ${management}
    </article>`;
  }

  function renderLedger() {
    const search = searchInput.value.trim().toLocaleLowerCase();
    const selectedYear = yearFilter.value;
    const selectedMonth = monthFilter.value;
    const selectedCategory = categoryFilter.value;
    const selectedStatus = statusFilter.value;
    const filtered = entries.filter(entry => {
      const obligations = entry.obligations || [];
      const matchesName = [
      entry.member_name,
      entry.other_name,
      entry.source_member_name,
      entry.source_other_name
      ].some(value => String(value || '').toLocaleLowerCase().includes(search));
      const textMatches = !search || matchesName
        || String(entry.source_debt_2025 || '').toLocaleLowerCase().includes(search)
        || String(entry.source_debt_2026 || '').toLocaleLowerCase().includes(search)
        || String(entry.source_total || '').toLocaleLowerCase().includes(search)
        || String(entry.source_notes || '').toLocaleLowerCase().includes(search)
        || obligations.some(item => `${item.title} ${labelCategory(item.category)}`.toLocaleLowerCase().includes(search));
      const yearMatches = !selectedYear
        || (selectedYear === '2025' && entry.source_debt_2025 !== null)
        || (selectedYear === '2026' && entry.source_debt_2026 !== null)
        || obligations.some(item => String(item.period_year || '') === selectedYear);
      const monthMatches = !selectedMonth
        || String(entry.source_month || '') === selectedMonth
        || obligations.some(item => String(item.period_month || '') === selectedMonth);
      const categoryMatches = !selectedCategory
        || (selectedCategory === 'old_list' && (
          entry.source_debt_2025 !== null || entry.source_debt_2026 !== null
          || entry.source_debt_amount !== null || entry.source_total !== null
        ))
        || obligations.some(item => item.category === selectedCategory);
      const remainingCents = obligations.reduce((sum, item) => sum + paymentTotals(item).remainingCents, 0);
      const hasLegacy = entry.source_debt_2025 !== null || entry.source_debt_2026 !== null
        || entry.source_debt_amount !== null || entry.source_total !== null;
      const statusMatches = !selectedStatus
        || (selectedStatus === 'outstanding' && remainingCents > 0)
        || (selectedStatus === 'paid' && obligations.length > 0 && remainingCents === 0)
        || (selectedStatus === 'old' && hasLegacy && obligations.length === 0);
      return textMatches && yearMatches && monthMatches && categoryMatches && statusMatches;
    });
    const outstandingCents = filtered.reduce((sum, entry) => sum + (entry.obligations || [])
      .reduce((entrySum, obligation) => entrySum + paymentTotals(obligation).remainingCents, 0), 0);
    const needsReviewCount = filtered.filter(entry => entry.review_status !== 'reviewed').length;
    summaryContainer.innerHTML = `<span><strong>${filtered.length}</strong> ${filtered.length === 1 ? 'member record' : 'member records'}</span>
      <span><strong>${money(fromCents(outstandingCents))}</strong> confirmed balance still to pay</span>
      ${canManageLedger && needsReviewCount ? `<span><strong>${needsReviewCount}</strong> old ${needsReviewCount === 1 ? 'list entry needs' : 'list entries need'} checking</span>` : ''}`;
    recordsContainer.innerHTML = filtered.length
      ? filtered.map(renderEntry).join('')
      : `<p class="ledger-empty">${entries.length
        ? 'No member names matched that search.'
        : 'No records are available for this search. Contact a choir administrator if you think a record is missing.'}</p>`;
  }

  function updateYearOptions() {
    const selected = yearFilter.value;
    const years = new Set(['2025', '2026']);
    entries.forEach(entry => {
      if (entry.source_year) years.add(String(entry.source_year));
      (entry.obligations || []).forEach(obligation => {
        if (obligation.period_year) years.add(String(obligation.period_year));
      });
    });
    yearFilter.innerHTML = '<option value="">All years</option>' + [...years]
      .sort((a, b) => Number(b) - Number(a))
      .map(year => `<option value="${escapeHtml(year)}">${escapeHtml(year)}</option>`)
      .join('');
    if (years.has(selected)) yearFilter.value = selected;
  }

  async function loadLedger(quiet = false) {
    if (loading) return;
    loading = true;
    refreshButton.disabled = true;
    try {
      const result = await api.get('/debt-ledger');
      entries = result.entries || [];
      updateYearOptions();
      const bank = result.bank || {};
      if (bank.name && bank.number && bank.bank) {
        document.getElementById('ledger-bank-name').textContent = bank.name;
        document.getElementById('ledger-bank-number').textContent = bank.number;
        document.getElementById('ledger-bank').textContent = bank.bank;
        bankDetails.hidden = false;
        bankUnavailable.hidden = true;
      } else {
        bankDetails.hidden = true;
        bankUnavailable.hidden = false;
      }
      renderLedger();
      if (!quiet) alertBox.hidden = true;
    } catch (error) {
      if (!quiet) showAlert(error.message || 'The ledger could not be loaded. Please try again.', 'error');
    } finally {
      loading = false;
      refreshButton.disabled = false;
    }
  }

  async function submitLedgerAction(form) {
    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    const values = new FormData(form);
    const action = form.dataset.ledgerAction;
    try {
      if (action === 'save-entry') {
        await api.put(`/debt-ledger/records/${encodeURIComponent(form.dataset.entryId)}`, {
          member_name: values.get('member_name'),
          other_name: values.get('other_name') || null
        });
      } else if (action === 'add-obligation') {
        await api.post(`/debt-ledger/records/${encodeURIComponent(form.dataset.entryId)}/obligations`, {
          title: values.get('title'),
          category: values.get('category'),
          amount_ngn: Number(values.get('amount_ngn')),
          year: values.get('year') || null,
          month: values.get('month') || null
        });
      } else if (action === 'add-payment') {
        await api.post(`/debt-ledger/obligations/${encodeURIComponent(form.dataset.obligationId)}/payments`, {
          amount_ngn: Number(values.get('amount_ngn')),
          reference: values.get('reference') || null
        });
      }
      showAlert('Your update has been saved.', 'success');
      await loadLedger(true);
    } catch (error) {
      showAlert(error.message || 'That ledger update could not be saved. Please try again.', 'error');
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  }

  recordsContainer.addEventListener('submit', event => {
    const form = event.target.closest('form[data-ledger-action]');
    if (!form) return;
    event.preventDefault();
    submitLedgerAction(form);
  });

  recordsContainer.addEventListener('click', async event => {
    const button = event.target.closest('[data-ledger-review]');
    if (!button) return;
    button.disabled = true;
    try {
      await api.put(`/debt-ledger/records/${encodeURIComponent(button.dataset.ledgerReview)}`, {
        review_status: 'reviewed'
      });
      showAlert('The original source figures are now marked as checked.', 'success');
      await loadLedger(true);
    } catch (error) {
      showAlert(error.message || 'The source figures could not be marked as checked.', 'error');
    } finally {
      button.disabled = false;
    }
  });

  const importFieldRoles = [
    ['ignore', 'Do not import'],
    ['name', 'Member name'],
    ['other_name', 'Other name'],
    ['amount', 'Debt amount'],
    ['year', 'Year'],
    ['month', 'Month'],
    ['category', 'Debt type'],
    ['notes', 'Notes']
  ];

  function guessColumnRole(header) {
    const value = String(header).toLocaleLowerCase().replace(/[^a-z0-9]/g, '');
    if (/^(name|member|membername|fullname|choirmember|debtor)$/.test(value)) return 'name';
    if (/^(othername|nickname|alias|preferredname)$/.test(value)) return 'other_name';
    if (/^(amount|debt|debtamount|amountowed|balance|owed|dues|levy)$/.test(value)) return 'amount';
    if (/^(year|periodyear|debtyear)$/.test(value)) return 'year';
    if (/^(month|periodmonth|debtmonth)$/.test(value)) return 'month';
    if (/^(category|type|debttype|levytype)$/.test(value)) return 'category';
    if (/^(notes|note|comment|description)$/.test(value)) return 'notes';
    return 'ignore';
  }

  function getImportRows() {
    if (!parsedImport) return { headers: [], rows: [], hasHeader: false };
    const hasHeader = parsedImport.hasHeader ? importHasHeader : false;
    if (!parsedImport.hasHeader) {
      return { headers: parsedImport.headers, rows: parsedImport.rows, hasHeader: false };
    }
    return hasHeader
      ? { headers: parsedImport.headers, rows: parsedImport.rows, hasHeader }
      : {
          headers: parsedImport.headers.map((_, index) => `Column ${index + 1}`),
          rows: parsedImport.rawRows,
          hasHeader
        };
  }

  function renderImportPreview() {
    if (!parsedImport) {
      importPreview.hidden = true;
      importPreview.replaceChildren();
      importButton.disabled = true;
      return;
    }
    const { headers, rows, hasHeader } = getImportRows();
    const headerControl = parsedImport.hasHeader
      ? `<label class="ledger-header-toggle"><input id="ledger-has-header" type="checkbox" ${hasHeader ? 'checked' : ''}> First row contains column headings</label>`
      : '<p>This JSON file includes field names in each record.</p>';
    const columns = headers.map((header, index) => {
      const selected = importRoles[index] || 'ignore';
      const options = importFieldRoles.map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
      return `<label class="ledger-import-column">${escapeHtml(header)}
        <select data-import-column="${index}" aria-label="Import role for ${escapeHtml(header)}">${options}</select>
      </label>`;
    }).join('');
    const previewRows = rows.slice(0, 8);
    const table = previewRows.length
      ? `<div class="ledger-preview-table-wrap"><table class="ledger-preview-table">
          <thead><tr>${headers.map(header => `<th scope="col">${escapeHtml(header)}</th>`).join('')}</tr></thead>
          <tbody>${previewRows.map(row => `<tr>${headers.map((_, index) => `<td>${escapeHtml(row[index] || '') || '—'}</td>`).join('')}</tr>`).join('')}</tbody>
        </table></div>`
      : '<p class="ledger-empty">No data rows are shown with this heading choice. If the first line is a debt record, uncheck the headings option.</p>';
    importPreview.innerHTML = `<h3>Review file columns</h3>
      <p><strong>${escapeHtml(parsedImport.fileName)}</strong> · ${escapeHtml(parsedImport.fileType)} · ${rows.length} row${rows.length === 1 ? '' : 's'} available</p>
      ${headerControl}
      <p>Choose what each column means. These rows will be imported as historical source information and will not change confirmed balances.</p>
      <div class="ledger-import-columns">${columns}</div>
      <h4>First ${Math.min(rows.length, 8)} rows preview</h4>${table}`;
    importPreview.hidden = false;
    importButton.disabled = !rows.length || !importRoles.includes('name');
  }

  importPreview.addEventListener('change', event => {
    const headerToggle = event.target.closest('#ledger-has-header');
    if (headerToggle) {
      importHasHeader = headerToggle.checked;
      renderImportPreview();
      return;
    }
    const columnSelect = event.target.closest('[data-import-column]');
    if (columnSelect) {
      importRoles[Number(columnSelect.dataset.importColumn)] = columnSelect.value;
      renderImportPreview();
    }
  });

  importForm.querySelector('[name="file"]').addEventListener('change', () => {
    parsedImport = null;
    renderImportPreview();
  });

  importForm.addEventListener('submit', async event => {
    event.preventDefault();
    const file = new FormData(importForm).get('file');
    if (!(file instanceof File) || !file.size) {
      showAlert('Choose a debt list file first.', 'error');
      return;
    }
    parseButton.disabled = true;
    importButton.disabled = true;
    parseButton.textContent = 'Reading file…';
    try {
      const upload = new FormData();
      upload.append('file', file);
      parsedImport = await api.post('/debt-ledger/parse-import', upload);
      importHasHeader = Boolean(parsedImport.hasHeader);
      importRoles = parsedImport.headers.map(guessColumnRole);
      renderImportPreview();
      showAlert('File read. Check the column choices and preview before importing.', 'success');
    } catch (error) {
      parsedImport = null;
      renderImportPreview();
      showAlert(error.message || 'The file could not be read. Check its format and try again.', 'error');
    } finally {
      parseButton.disabled = false;
      parseButton.textContent = 'Read and preview file';
    }
  });

  importButton.addEventListener('click', async () => {
    if (!parsedImport) return;
    const { rows, hasHeader } = getImportRows();
    const roles = new Map();
    importRoles.forEach((role, index) => {
      if (role !== 'ignore' && !roles.has(role)) roles.set(role, index);
    });
    const nameColumn = roles.get('name');
    if (nameColumn === undefined) {
      showAlert('Choose which column contains each member’s name before importing.', 'error');
      return;
    }
    const sourceRows = rows.map((cells, index) => {
      const value = role => {
        const column = roles.get(role);
        return column === undefined ? '' : String(cells[column] ?? '').trim();
      };
      return {
        row_number: index + (hasHeader ? 2 : 1),
        name: value('name'),
        other_name: value('other_name'),
        amount: value('amount'),
        year: value('year'),
        month: value('month'),
        category: value('category'),
        notes: value('notes'),
        file_name: parsedImport.fileName
      };
    });
    if (sourceRows.some(row => !row.name)) {
      showAlert('Every row must have a member name. Review the name column or remove blank rows from the file.', 'error');
      return;
    }

    importButton.disabled = true;
    let importedCount = 0;
    let alreadyPresentCount = 0;
    let completedRows = 0;
    try {
      const legacyRows = parsedImport.legacyRecords?.map((row, index) => ({
        ...row,
        row_number: index + 1
      }));
      const rowsToImport = legacyRows || sourceRows;
      const endpoint = legacyRows ? '/debt-ledger/import' : '/debt-ledger/import-tabular';
      for (let index = 0; index < rowsToImport.length; index += 50) {
        const batch = rowsToImport.slice(index, index + 50);
        const result = await api.post(endpoint, legacyRows
          ? { rows: batch }
          : { fingerprint: parsedImport.fingerprint, rows: batch });
        importedCount += result.imported || 0;
        alreadyPresentCount += result.alreadyPresent || 0;
        completedRows += batch.length;
      }
      showAlert(`${importedCount} source row${importedCount === 1 ? '' : 's'} added for finance review.${alreadyPresentCount ? ` ${alreadyPresentCount} already existed.` : ''} Confirmed balances were not changed.`, 'success');
      parsedImport = null;
      importForm.reset();
      renderImportPreview();
      await loadLedger(true);
    } catch (error) {
      const progress = completedRows
        ? ` ${completedRows} row${completedRows === 1 ? '' : 's'} were processed before the problem. You can safely try the same file again.`
        : '';
      showAlert(`${error.message || 'The rows could not be imported. Please review the file and try again.'}${progress}`, 'error');
    } finally {
      importButton.disabled = !parsedImport;
    }
  });

  addMemberForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = addMemberForm.querySelector('button[type="submit"]');
    const values = new FormData(addMemberForm);
    button.disabled = true;
    try {
      await api.post('/debt-ledger/records', {
        member_name: values.get('member_name'),
        other_name: values.get('other_name') || null
      });
      showAlert('Member added to the ledger.', 'success');
      addMemberForm.reset();
      await loadLedger(true);
    } catch (error) {
      showAlert(error.message || 'The member could not be added. Please try again.', 'error');
    } finally {
      button.disabled = false;
    }
  });

  manualDebtForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = manualDebtForm.querySelector('button[type="submit"]');
    const values = new FormData(manualDebtForm);
    button.disabled = true;
    try {
      const result = await api.post('/debt-ledger/records/manual', {
        member_name: values.get('member_name'),
        other_name: values.get('other_name') || null,
        title: values.get('title'),
        category: values.get('category'),
        amount_ngn: Number(values.get('amount_ngn')),
        year: values.get('year') || null,
        month: values.get('month') || null
      });
      showAlert(result.message || 'Member and debt added to the ledger.', 'success');
      manualDebtForm.reset();
      await loadLedger(true);
    } catch (error) {
      showAlert(error.message || 'The member and debt could not be saved. Please try again.', 'error');
    } finally {
      button.disabled = false;
    }
  });

  searchInput.addEventListener('input', renderLedger);
  yearFilter.addEventListener('change', renderLedger);
  monthFilter.addEventListener('change', renderLedger);
  categoryFilter.addEventListener('change', renderLedger);
  statusFilter.addEventListener('change', renderLedger);
  refreshButton.addEventListener('click', () => loadLedger());

  document.querySelectorAll('[data-ledger-tab]').forEach(button => {
    button.addEventListener('click', () => {
      const selectedTab = button.dataset.ledgerTab;
      document.querySelectorAll('[data-ledger-tab]').forEach(tab => {
        const selected = tab === button;
        tab.classList.toggle('is-active', selected);
        tab.setAttribute('aria-selected', String(selected));
      });
      document.querySelectorAll('.ledger-admin-view').forEach(view => {
        view.hidden = view.id !== `ledger-admin-${selectedTab}`;
      });
      searchPanel.hidden = selectedTab !== 'all';
      if (selectedTab === 'all') renderLedger();
    });
  });

  deleteAllButton.addEventListener('click', async () => {
    const confirmed = window.confirm(
      'This will permanently delete every member record, old imported figure, payment due, and payment history from the choir ledger. This cannot be undone. Continue?'
    );
    if (!confirmed) return;

    const phrase = window.prompt('To confirm, type DELETE ALL FINANCIAL RECORDS exactly:');
    if (phrase !== 'DELETE ALL FINANCIAL RECORDS') {
      showAlert('Nothing was deleted. The confirmation phrase did not match.', 'info');
      return;
    }

    deleteAllButton.disabled = true;
    try {
      const result = await api.delete('/debt-ledger/records', {
        confirmation: 'DELETE ALL FINANCIAL RECORDS'
      });
      entries = [];
      renderLedger();
      showAlert(result.message || 'All financial records were deleted.', 'success');
    } catch (error) {
      showAlert(error.message || 'The records could not be deleted. No changes were made.', 'error');
    } finally {
      deleteAllButton.disabled = false;
    }
  });

  api.get('/auth/me').then(user => {
    const isAdmin = user?.role === 'admin';
    canManageLedger = isAdmin && new URLSearchParams(window.location.search).get('mode') === 'admin';
    managementPanel.hidden = !canManageLedger;
    ledgerAdminNav.classList.toggle('ledger-admin-only', !isAdmin);
    if (canManageLedger) {
      searchPanel.hidden = true;
    }
    loadLedger();
  }).catch(error => {
    showAlert(error.message || 'Please sign in again to view the choir ledger.', 'error');
  });

  window.setInterval(() => {
    if (document.visibilityState === 'visible'
        && !recordsContainer.contains(document.activeElement)
        && !managementPanel.contains(document.activeElement)) {
      loadLedger(true);
    }
  }, 20000);
})();
