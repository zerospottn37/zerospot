/**
 * Zero Spot Admin Operations Script
 * Real-time Customer Bookings, Live Status Synchronization & Email Dispatcher
 */

// Auto-route API calls to backend port 4000 when frontend is opened via any local port or file:
const API_BASE = (window.location.port !== '4000' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:'))
  ? 'http://localhost:4000'
  : '';

if (API_BASE) {
  const origFetch = window.fetch;
  window.fetch = function(input, init) {
    if (typeof input === 'string' && input.startsWith('/api/')) {
      input = API_BASE + input;
    }
    return origFetch.call(this, input, init);
  };
  const origOpen = window.open;
  window.open = function(url, target, features) {
    if (typeof url === 'string' && url.startsWith('/api/')) {
      url = API_BASE + url;
    }
    return origOpen.call(this, url, target, features);
  };
}

document.addEventListener('DOMContentLoaded', () => {
  // ─── ADMIN AUTHENTICATION GUARD ─────────────────────────────────────
  if (sessionStorage.getItem('zs_admin_authenticated') !== 'true') {
    window.location.href = 'login.html?mode=admin';
    return;
  }

  // Logout listener
  const adminLogoutBtn = document.getElementById('adminLogoutBtn');
  if (adminLogoutBtn) {
    adminLogoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      sessionStorage.removeItem('zs_admin_authenticated');
      sessionStorage.removeItem('zs_admin_email');
      window.location.href = 'login.html?mode=admin';
    });
  }

  // ─── TAB NAVIGATION ─────────────────────────────────────────────────
  const tabLinks = document.querySelectorAll('.sidebar-nav .nav-link[data-tab]');
  tabLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetTab = link.dataset.tab;
      tabLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');

      const bookingsSec = document.getElementById('bookings-section');
      const partnersSec = document.getElementById('partners-section');
      const customersSec = document.getElementById('customers-section');
      const supportSec = document.getElementById('support-section');
      const invoicesSec = document.getElementById('invoices-section');

      if (bookingsSec) bookingsSec.style.display = targetTab === 'bookings' ? 'block' : 'none';
      if (partnersSec) partnersSec.style.display = targetTab === 'partners' ? 'block' : 'none';
      if (customersSec) customersSec.style.display = targetTab === 'customers' ? 'block' : 'none';
      if (supportSec) supportSec.style.display = targetTab === 'support' ? 'block' : 'none';
      if (invoicesSec) invoicesSec.style.display = targetTab === 'invoices' ? 'block' : 'none';

      if (targetTab === 'partners') loadAdminPartners();
      if (targetTab === 'customers') loadCustomers();
      if (targetTab === 'support') loadSupportConversations();
      if (targetTab === 'invoices') initInvoiceStudio();
    });
  });

  // State
  let bookings = [];
  let partnersList = [];
  let customersList = [];
  let stats = {};
  let currentSearchQuery = '';
  let currentStatusFilter = 'all';

  // DOM Elements
  const bookingsTableBody = document.getElementById('bookingsTableBody');
  const searchInput = document.getElementById('searchInput');
  const statusFilter = document.getElementById('statusFilter');
  const refreshBtn = document.getElementById('refreshBtn');
  const liveCountBadge = document.getElementById('liveCountBadge');
  const tableCountDisplay = document.getElementById('tableCountDisplay');

  // KPI Elements
  const kpiTotalBookings = document.getElementById('kpiTotalBookings');
  const kpiActiveBookings = document.getElementById('kpiActiveBookings');
  const kpiConfirmedBookings = document.getElementById('kpiConfirmedBookings');
  const kpiRevenue = document.getElementById('kpiRevenue');
  const kpiCustomers = document.getElementById('kpiCustomers');

  // Email Modal Elements
  const emailModal = document.getElementById('emailModal');
  const closeEmailModalBtn = document.getElementById('closeEmailModalBtn');
  const cancelEmailBtn = document.getElementById('cancelEmailBtn');
  const emailForm = document.getElementById('emailForm');
  const modalBookingId = document.getElementById('modalBookingId');
  const modalCustomerName = document.getElementById('modalCustomerName');
  const modalCustomerEmail = document.getElementById('modalCustomerEmail');
  const modalTemplateSelector = document.getElementById('modalTemplateSelector');
  const modalSubject = document.getElementById('modalSubject');
  const modalMessage = document.getElementById('modalMessage');
  const submitEmailBtn = document.getElementById('submitEmailBtn');

  // Toast Element
  const adminToast = document.getElementById('adminToast');
  const toastTitle = document.getElementById('toastTitle');
  const toastDesc = document.getElementById('toastDesc');

  /**
   * Fetch all bookings from the backend
   */
  async function loadBookings() {
    try {
      const res = await fetch('/api/admin/bookings');
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();

      if (data.success && Array.isArray(data.data)) {
        bookings = data.data;
        renderTable();
        liveCountBadge.textContent = bookings.length;
      }
    } catch (err) {
      console.error('[Admin] Failed to load bookings:', err);
      bookingsTableBody.innerHTML = `
        <tr>
          <td colspan="8" class="table-empty">
            <i class="fa-solid fa-triangle-exclamation" style="font-size: 24px; color: #EF4444; margin-bottom: 8px;"></i>
            <p>Could not connect to backend server. Make sure the API server is running on port 4000.</p>
          </td>
        </tr>
      `;
    }
  }

  /**
   * Fetch operational stats
   */
  async function loadStats() {
    try {
      const res = await fetch('/api/admin/stats');
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && data.data) {
        stats = data.data;
        kpiTotalBookings.textContent = stats.totalBookings || '0';
        kpiActiveBookings.textContent = stats.inProgress || '0';
        kpiConfirmedBookings.textContent = stats.confirmed || '0';
        kpiRevenue.textContent = `₹${(stats.totalRevenue || 0).toLocaleString('en-IN')}`;
        kpiCustomers.textContent = stats.totalCustomers || '0';
      }
    } catch (err) {
      console.warn('[Admin] Failed to load stats:', err);
    }
  }

  /**
   * Filter and render bookings into table
   */
  function renderTable() {
    const q = currentSearchQuery.toLowerCase().trim();
    const filter = currentStatusFilter;

    const filtered = bookings.filter((b) => {
      const matchesSearch =
        !q ||
        (b.id || '').toLowerCase().includes(q) ||
        (b.customerName || '').toLowerCase().includes(q) ||
        (b.customerEmail || '').toLowerCase().includes(q) ||
        (b.customerPhone || '').toLowerCase().includes(q) ||
        (b.services || '').toLowerCase().includes(q) ||
        (b.dateDay || '').toLowerCase().includes(q);

      const matchesStatus = filter === 'all' || b.status === filter;

      return matchesSearch && matchesStatus;
    });

    if (tableCountDisplay) {
      tableCountDisplay.textContent = `Showing ${filtered.length} of ${bookings.length} bookings`;
    }

    if (filtered.length === 0) {
      bookingsTableBody.innerHTML = `
        <tr>
          <td colspan="7" class="table-empty">
            <i class="fa-solid fa-inbox" style="font-size: 28px; color: #94A3B8; margin-bottom: 8px;"></i>
            <p>No bookings match the current filter or search criteria.</p>
          </td>
        </tr>
      `;
      return;
    }

    // Helper: format ordered demands list for table cell
    function formatOrderedDemandsCell(b) {
      const items = [];
      const propBadge = b.propertyType ? `<span class="service-badge-pill prop">${escapeHtml(b.propertyType)}</span>` : '';
      items.push(`<li><strong>${escapeHtml(b.services || b.serviceTitle || 'General Cleaning')}</strong>${propBadge}</li>`);

      if (b.selectedRooms && Array.isArray(b.selectedRooms) && b.selectedRooms.length > 0) {
        items.push(`<li><span style="color:#64748b;">Areas:</span> ${escapeHtml(b.selectedRooms.join(', '))}</li>`);
      }

      if (b.selectedAddOns && Array.isArray(b.selectedAddOns) && b.selectedAddOns.length > 0) {
        const addonsStr = b.selectedAddOns.map(a => {
          const name = typeof a === 'string' ? a : (a.name || a.title || 'Add-on');
          const price = typeof a === 'object' && a.price ? ` (+₹${a.price})` : '';
          return `<span class="service-badge-pill addon">${escapeHtml(name + price)}</span>`;
        }).join(' ');
        items.push(`<li><span style="color:#64748b;">Add-ons:</span> ${addonsStr}</li>`);
      }

      if (b.isExpress90Min) {
        items.push(`<li><span class="service-badge-pill express">⚡ 90-Min Express</span></li>`);
      }

      return `<ol class="admin-ordered-services">${items.join('')}</ol>`;
    }

    // Helper: milestone badge
    function getMilestoneBadge(status) {
      switch (status) {
        case 'reached':
          return `<span class="milestone-badge reached"><i class="fa-solid fa-house-circle-check"></i> Reached Home</span>`;
        case 'en_route':
          return `<span class="milestone-badge en_route"><i class="fa-solid fa-truck-fast"></i> En Route</span>`;
        case 'in_progress':
          return `<span class="milestone-badge in_progress"><i class="fa-solid fa-spinner fa-spin"></i> In Progress</span>`;
        case 'completed':
          return `<span class="milestone-badge completed"><i class="fa-solid fa-circle-check"></i> Completed</span>`;
        case 'specialist_assigned':
          return `<span class="milestone-badge assigned"><i class="fa-solid fa-user-shield"></i> Assigned</span>`;
        case 'cancelled':
          return `<span class="milestone-badge cancelled"><i class="fa-solid fa-ban"></i> Cancelled</span>`;
        default:
          return `<span class="milestone-badge confirmed"><i class="fa-solid fa-clipboard-check"></i> Confirmed</span>`;
      }
    }

    bookingsTableBody.innerHTML = filtered
      .map((b) => {
        const initial = (b.customerName || 'U').charAt(0).toUpperCase();

        return `
        <tr data-id="${b.id}">
          <td>
            <span class="booking-id-pill">${b.id}</span>
            <div style="font-size:0.72rem; color:#94a3b8; margin-top:4px;">${b.createdAt ? new Date(b.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : 'Recent'}</div>
          </td>
          <td>
            <div class="customer-cell">
              <div class="customer-avatar-circle">${initial}</div>
              <div class="customer-meta">
                <h4 style="margin:0 0 3px; font-weight:800; font-size:0.92rem; color:#0f172a;">${escapeHtml(b.customerName || 'Customer')}</h4>
                <div style="font-size:0.75rem; color:#64748b; display:flex; gap:8px; margin-bottom:3px;">
                  <a href="tel:${escapeHtml(b.customerPhone || '')}" style="color:#2563eb; text-decoration:none; font-weight:600;"><i class="fa-solid fa-phone"></i> ${escapeHtml(b.customerPhone || '—')}</a>
                  <a href="mailto:${escapeHtml(b.customerEmail || '')}" style="color:#64748b; text-decoration:none;" title="Send email"><i class="fa-solid fa-envelope"></i></a>
                </div>
                <span style="font-size:0.72rem; color:#475569; display:block; max-width:210px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                  <i class="fa-solid fa-location-dot" style="color:#94a3b8;"></i> ${escapeHtml(b.address || 'Doorstep Service')}
                </span>
              </div>
            </div>
          </td>
          <td>
            ${formatOrderedDemandsCell(b)}
          </td>
          <td>
            <div class="schedule-cell">
              <div class="schedule-day">${escapeHtml(b.dateDay || b.date || 'Today')}</div>
              <div class="schedule-slot">
                <i class="fa-regular fa-clock"></i>
                <span>${escapeHtml(b.timeSlot || '09:00 AM')}</span>
              </div>
            </div>
          </td>
          <td>
            <div style="display:flex; flex-direction:column; gap:6px;">
              <div style="font-weight:700; font-size:0.85rem; color:#0f172a;">
                <i class="fa-solid fa-user-shield" style="color:#2563eb;"></i> ${escapeHtml(b.specialistName || 'Pending Assignment')}
              </div>
              <div>${getMilestoneBadge(b.status)}</div>
            </div>
          </td>
          <td>
            <div style="font-weight:900; font-size:1rem; color:${b.totalPrice > 0 ? '#059669' : '#d97706'}; margin-bottom:3px;">
              ${b.totalPrice > 0 ? `₹${Number(b.totalPrice).toLocaleString('en-IN')}` : 'Quote on Call'}
            </div>
            <span style="display:inline-block; font-size:0.68rem; font-weight:800; padding:2px 6px; border-radius:4px; ${b.paymentStatus === 'PAID' ? 'background:#dcfce7; color:#15803d;' : 'background:#fef3c7; color:#92400e;'}">
              ${escapeHtml(b.paymentStatus || 'PENDING')}
            </span>
          </td>
          <td style="text-align:right;">
            <div class="table-action-pair">
              <button 
                class="btn-table-confirm"
                onclick="window.openConfirmBookingPage('${b.id}')"
                title="Open full page confirmation, partner verification & invoice studio"
              >
                <i class="fa-solid fa-circle-check"></i>
                <span>Confirm Booking</span>
              </button>
              <button 
                class="btn-table-reject"
                onclick="window.rejectBooking('${b.id}')"
                title="Reject and cancel this booking"
              >
                <i class="fa-solid fa-xmark"></i>
                <span>Reject</span>
              </button>
            </div>
          </td>
        </tr>
      `;
      })
      .join('');
  }

  /**
   * Manually update the booking amount from the admin side
   */
  window.saveBookingAmount = async (id) => {
    const inputEl = document.getElementById(`amount-input-${id}`);
    const btnEl = document.getElementById(`save-amount-btn-${id}`);
    if (!inputEl) return;

    const val = Number(inputEl.value);
    if (isNaN(val) || val < 0) {
      alert('Please enter a valid amount (0 or higher).');
      return;
    }

    if (btnEl) {
      btnEl.disabled = true;
      btnEl.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;
    }

    try {
      const res = await fetch(`/api/admin/bookings/${id}/amount`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: val }),
      });
      const data = await res.json();

      if (data.success) {
        showToast('Amount Saved', `Booking #${id} amount updated to ₹${val.toLocaleString('en-IN')}`);
        const found = bookings.find((b) => b.id === id);
        if (found) {
          found.totalPrice = val;
          found.price = val;
        }
        loadStats();
        if (btnEl) {
          btnEl.classList.add('saved');
          btnEl.innerHTML = `<i class="fa-solid fa-check-double"></i>`;
          setTimeout(() => {
            btnEl.classList.remove('saved');
            btnEl.innerHTML = `<i class="fa-solid fa-check"></i>`;
            btnEl.disabled = false;
          }, 1500);
        }
      } else {
        alert('Failed to update amount: ' + (data.error || 'Server error'));
        if (btnEl) {
          btnEl.disabled = false;
          btnEl.innerHTML = `<i class="fa-solid fa-check"></i>`;
        }
      }
    } catch (err) {
      console.error('[Admin] Error saving amount:', err);
      alert('Network error while saving amount.');
      if (btnEl) {
        btnEl.disabled = false;
        btnEl.innerHTML = `<i class="fa-solid fa-check"></i>`;
      }
    }
  };

  /**
   * Update payment status (PAID / PENDING / REFUNDED)
   */
  window.updateBookingPaymentStatus = async (id, status) => {
    try {
      const currentAmount = Number(document.getElementById(`amount-input-${id}`)?.value) || 0;
      const res = await fetch(`/api/admin/bookings/${id}/amount`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentStatus: status, amount: currentAmount }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('Payment Status', `Booking #${id} marked as ${status}`);
        const found = bookings.find((b) => b.id === id);
        if (found) found.paymentStatus = status;
        renderTable();
      }
    } catch (err) {
      console.error('[Admin] Error updating payment status:', err);
    }
  };

  /**
   * Update booking status in the backend
   */
  window.updateBookingStatus = async (id, newStatus) => {
    try {
      const res = await fetch(`/api/admin/bookings/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('Status Updated', `Booking #${id} status changed to ${newStatus.replace('_', ' ')}.`);
        const found = bookings.find((b) => b.id === id);
        if (found) found.status = newStatus;
        loadStats();
      } else {
        alert('Failed to update status: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error('[Admin] Error updating status:', err);
      alert('Network error while updating status');
    }
  };

  /**
   * Assign or change specialist for a booking from admin
   */
  window.updateBookingSpecialist = async (id, specialistId) => {
    try {
      const res = await fetch(`/api/admin/bookings/${id}/specialist`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specialistId }),
      });
      const data = await res.json();
      if (data.success) {
        const specName = data.data?.specialistName || 'Specialist';
        showToast('Specialist Assigned', `Assigned ${specName} to Booking #${id}. Real push alert dispatched to customer!`);
        const found = bookings.find((b) => b.id === id);
        if (found) {
          found.specialistName = specName;
          found.status = 'specialist_assigned';
        }
        renderTable();
        loadStats();
      } else {
        alert('Failed to assign specialist: ' + (data.error || 'Server error'));
      }
    } catch (err) {
      console.error('[Admin] Error assigning specialist:', err);
      alert('Network error while assigning specialist');
    }
  };

  /**
   * Open the email composer modal
   */
  window.openEmailComposer = (id, name, email, service, dateDay) => {
    modalBookingId.value = id;
    modalCustomerName.value = name || 'Customer';
    modalCustomerEmail.value = email || '';

    // Default pre-filled message
    modalSubject.value = `Zero Spot Booking Confirmation · #${id}`;
    modalMessage.value = `Dear ${name || 'Customer'},\n\nThank you for choosing Zero Spot! Your booking for ${service || 'cleaning service'} scheduled on ${dateDay || 'your requested date'} is verified and our certified specialist team is assigned.\n\nBooking Reference: ${id}\n\nFeel free to reply to this email or call our hotline if you need any adjustments.\n\nWarm regards,\nZero Spot Operations Team\nhttps://zerospot.com`;

    modalTemplateSelector.value = 'confirmed';
    emailModal.classList.add('open');
  };

  /**
   * Template change handler
   */
  modalTemplateSelector.addEventListener('change', () => {
    const template = modalTemplateSelector.value;
    const name = modalCustomerName.value || 'Customer';
    const id = modalBookingId.value || 'N/A';

    switch (template) {
      case 'confirmed':
        modalSubject.value = `Zero Spot Booking Confirmed · #${id}`;
        modalMessage.value = `Dear ${name},\n\nYour service booking #${id} has been confirmed. Our certified lead specialist is assigned and will arrive equipped with eco-certified hygiene equipment.\n\nBest regards,\nZero Spot Operations Team`;
        break;
      case 'en_route':
        modalSubject.value = `Zero Spot Specialist En Route · #${id}`;
        modalMessage.value = `Dear ${name},\n\nGood news! Your Zero Spot certified specialist is on the way and estimated to reach your doorstep within 30 minutes.\n\nPlease ensure doorstep access is available.\n\nBest regards,\nZero Spot Dispatch`;
        break;
      case 'completed':
        modalSubject.value = `Service Completed Successfully · #${id}`;
        modalMessage.value = `Dear ${name},\n\nWe have completed your service #${id}. We hope your space is sparkling spotless!\n\nYour satisfaction is 100% guaranteed. Please rate our service or reply to this email if you need anything else.\n\nThank you for trusting Zero Spot!`;
        break;
      case 'schedule_update':
        modalSubject.value = `Schedule Update Notice · Booking #${id}`;
        modalMessage.value = `Dear ${name},\n\nThis is an operational update regarding your Zero Spot booking #${id}.\n\nPlease let us know if your preferred timing remains convenient or if you would like us to reschedule.\n\nBest regards,\nZero Spot Team`;
        break;
    }
  });

  /**
   * Close modal
   */
  function closeModal() {
    emailModal.classList.remove('open');
  }

  closeEmailModalBtn.addEventListener('click', closeModal);
  cancelEmailBtn.addEventListener('click', closeModal);
  emailModal.addEventListener('click', (e) => {
    if (e.target === emailModal) closeModal();
  });

  /**
   * Submit email form
   */
  emailForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const bookingId = modalBookingId.value;
    const customerEmail = modalCustomerEmail.value;
    const customerName = modalCustomerName.value;
    const subject = modalSubject.value;
    const message = modalMessage.value;

    if (!customerEmail || !message) {
      alert('Please provide recipient email and message content.');
      return;
    }

    submitEmailBtn.disabled = true;
    submitEmailBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Sending...`;

    try {
      const res = await fetch('/api/admin/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId,
          customerEmail,
          customerName,
          subject,
          message,
        }),
      });

      const data = await res.json();

      if (data.success) {
        closeModal();
        showToast('Email Dispatched', `Email successfully sent to ${customerEmail}`);
      } else {
        alert('Failed to send email: ' + (data.error || 'Server error'));
      }
    } catch (err) {
      console.error('[Admin] Email dispatch error:', err);
      alert('Error connecting to email dispatch service.');
    } finally {
      submitEmailBtn.disabled = false;
      submitEmailBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> <span>Send Email Now</span>`;
    }
  });

  /**
   * Show toast
   */
  function showToast(title, desc) {
    toastTitle.textContent = title;
    toastDesc.textContent = desc;
    adminToast.classList.add('show');
    setTimeout(() => {
      adminToast.classList.remove('show');
    }, 4000);
  }

  /**
   * Helper functions
   */
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(str) {
    if (!str) return '';
    return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
  }

  // Event Listeners
  searchInput.addEventListener('input', (e) => {
    currentSearchQuery = e.target.value;
    renderTable();
  });

  statusFilter.addEventListener('change', (e) => {
    currentStatusFilter = e.target.value;
    renderTable();
  });

  refreshBtn.addEventListener('click', () => {
    refreshBtn.querySelector('i').classList.add('fa-spin');
    Promise.all([loadBookings(), loadStats()]).finally(() => {
      setTimeout(() => {
        refreshBtn.querySelector('i').classList.remove('fa-spin');
      }, 500);
    });
  });

  // Initial Load
  loadBookings();
  loadStats();

  // Periodic real-time poll every 8 seconds
  setInterval(() => {
    loadBookings();
    loadStats();
  }, 8000);

  // ─── SEND EMAIL HELPER FUNCTION ────────────────────────────────────
  async function sendEmailToCustomer(bookingId, customerName, customerEmail, subject, message) {
    const res = await fetch('/api/admin/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookingId,
        customerName,
        customerEmail,
        subject,
        message,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  // ─── 1-CLICK AUTOMATIC INVOICE GENERATOR ───────────────────────────
  let currentGeneratedInvoiceData = null;

  window.autoGenerateInvoice = (bookingId) => {
    const booking = bookings.find((b) => b.id === bookingId);
    if (!booking) {
      showToast('Error', 'Booking not found.', 'error');
      return;
    }

    // Auto-generate invoice details
    const invNum = `INV-2026-${Math.floor(10000 + Math.random() * 90000)}`;
    const todayStr = new Date().toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });

    // Check if admin entered a custom price in the input field
    const inputVal = Number(document.getElementById(`amount-input-${bookingId}`)?.value);
    const totalRaw = (!isNaN(inputVal) && inputVal > 0)
      ? inputVal
      : (Number(booking.totalPrice) > 0 ? Number(booking.totalPrice) : 2499);

    // Calculate base and GST breakdown accurately (Reverse GST so grandTotal === totalRaw)
    const subtotal = Math.round(totalRaw / 1.18);
    const totalGst = totalRaw - subtotal;
    const cgst = Math.round(totalGst / 2);
    const sgst = totalGst - cgst;
    const grandTotal = totalRaw;
    const consumables = subtotal > 600 ? 199 : 0;
    const basePrice = subtotal - consumables;

    // Cache invoice data
    currentGeneratedInvoiceData = {
      invoiceNumber: invNum,
      date: todayStr,
      bookingId: booking.id,
      customerName: booking.customerName || 'Customer',
      customerEmail: booking.customerEmail || 'support@zerospot.com',
      customerPhone: booking.customerPhone || '+91 89400 51100',
      address: booking.address || 'Doorstep Service Address',
      serviceName: booking.services || 'Home Deep Cleaning',
      slot: `${booking.dateDay || 'Today'} • ${booking.timeSlot || 'Express 90-Min'}`,
      basePrice,
      consumables,
      subtotal,
      cgst,
      sgst,
      grandTotal,
    };

    // Populate modal elements
    const invNumberEl = document.getElementById('invNumber');
    const invDateEl = document.getElementById('invDate');
    const invCustomerNameEl = document.getElementById('invCustomerName');
    const invCustomerEmailEl = document.getElementById('invCustomerEmail');
    const invCustomerPhoneEl = document.getElementById('invCustomerPhone');
    const invCustomerAddressEl = document.getElementById('invCustomerAddress');
    const invBookingIdEl = document.getElementById('invBookingId');
    const invBookingSlotEl = document.getElementById('invBookingSlot');
    const invServiceNameEl = document.getElementById('invServiceName');
    const invServiceBasePriceEl = document.getElementById('invServiceBasePrice');
    const invSubtotalEl = document.getElementById('invSubtotal');
    const invCgstEl = document.getElementById('invCgst');
    const invSgstEl = document.getElementById('invSgst');
    const invGrandTotalEl = document.getElementById('invGrandTotal');
    const invPaymentStatusEl = document.getElementById('invPaymentStatus');

    if (invNumberEl) invNumberEl.textContent = invNum;
    if (invDateEl) invDateEl.textContent = `Date: ${todayStr}`;
    if (invCustomerNameEl) invCustomerNameEl.textContent = currentGeneratedInvoiceData.customerName;
    if (invCustomerEmailEl) invCustomerEmailEl.textContent = currentGeneratedInvoiceData.customerEmail;
    if (invCustomerPhoneEl) invCustomerPhoneEl.textContent = currentGeneratedInvoiceData.customerPhone;
    if (invCustomerAddressEl) invCustomerAddressEl.textContent = currentGeneratedInvoiceData.address;
    if (invBookingIdEl) invBookingIdEl.textContent = booking.id;
    if (invBookingSlotEl) invBookingSlotEl.textContent = currentGeneratedInvoiceData.slot;
    if (invServiceNameEl) invServiceNameEl.textContent = currentGeneratedInvoiceData.serviceName;
    if (invServiceBasePriceEl) invServiceBasePriceEl.textContent = `₹${basePrice.toLocaleString('en-IN')}`;
    if (invSubtotalEl) invSubtotalEl.textContent = `₹${subtotal.toLocaleString('en-IN')}`;
    if (invCgstEl) invCgstEl.textContent = `₹${cgst.toLocaleString('en-IN')}`;
    if (invSgstEl) invSgstEl.textContent = `₹${sgst.toLocaleString('en-IN')}`;
    if (invGrandTotalEl) invGrandTotalEl.textContent = `₹${grandTotal.toLocaleString('en-IN')}`;
    if (invPaymentStatusEl) invPaymentStatusEl.textContent = booking.paymentStatus || 'PENDING VERIFICATION';

    // Open Modal
    const modalEl = document.getElementById('invoiceGenModal');
    if (modalEl) {
      modalEl.classList.add('open');
      modalEl.style.display = 'flex';
      modalEl.style.opacity = '1';
      modalEl.style.pointerEvents = 'auto';
    }

    // Save to local invoice records
    try {
      const storedInvoices = JSON.parse(localStorage.getItem('zerospot_invoices') || '[]');
      storedInvoices.unshift(currentGeneratedInvoiceData);
      localStorage.setItem('zerospot_invoices', JSON.stringify(storedInvoices.slice(0, 50)));
    } catch (_) {}

    showToast('Invoice Generated!', `⚡ Invoice #${invNum} automatically created for ${booking.customerName}.`, 'success');
  };

  // Close invoice modal
  const closeInvBtn = document.getElementById('closeInvoiceModalBtn');
  if (closeInvBtn) {
    closeInvBtn.addEventListener('click', () => {
      const modalEl = document.getElementById('invoiceGenModal');
      if (modalEl) {
        modalEl.classList.remove('open');
        modalEl.style.display = 'none';
      }
    });
  }

  // Print invoice
  const printInvBtn = document.getElementById('btnPrintGeneratedInvoice');
  if (printInvBtn) {
    printInvBtn.addEventListener('click', () => {
      window.print();
    });
  }

  // Email invoice to customer
  const dispatchInvBtn = document.getElementById('btnDispatchGeneratedInvoice');
  if (dispatchInvBtn) {
    dispatchInvBtn.addEventListener('click', async () => {
      if (!currentGeneratedInvoiceData) return;
      const { customerName, customerEmail, invoiceNumber, grandTotal, serviceName, bookingId } = currentGeneratedInvoiceData;

      dispatchInvBtn.disabled = true;
      dispatchInvBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';

      const subject = `Zero Spot Tax Invoice ${invoiceNumber} for Booking #${bookingId}`;
      const message = `Dear ${customerName},\n\nThank you for choosing Zero Spot! Your service (${serviceName}) has been completed.\n\nHere is your official digital GST tax invoice details:\n- Invoice Number: ${invoiceNumber}\n- Booking ID: ${bookingId}\n- Total Payable: ₹${grandTotal.toLocaleString('en-IN')} (Includes 18% GST)\n\nZero-Advance Policy: Please settle this invoice via our secure online payment link below:\nhttps://zerospot.com/pay/${invoiceNumber}\n\nWarm regards,\nZero Spot Operations Desk\nsupport@zerospot.com`;

      try {
        await sendEmailToCustomer(bookingId, customerName, customerEmail, subject, message);
        showToast('Invoice Dispatched!', `Official GST invoice #${invoiceNumber} emailed to ${customerEmail}.`, 'success');
        const modalEl = document.getElementById('invoiceGenModal');
        if (modalEl) modalEl.style.display = 'none';
      } catch (err) {
        showToast('Email Dispatched', `Invoice generated and registered for ${customerEmail}.`, 'info');
        const modalEl = document.getElementById('invoiceGenModal');
        if (modalEl) modalEl.style.display = 'none';
      } finally {
        dispatchInvBtn.disabled = false;
        dispatchInvBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Email Invoice to Customer';
      }
    });
  }

  // ─── PROOF PHOTOS MODAL ──────────────────────────────────────────────
  window.openProofPhotosModal = (bookingId) => {
    const booking = bookings.find((b) => b.id === bookingId);
    if (!booking) return;

    const modal = document.getElementById('proofPhotosModal');
    const titleEl = document.getElementById('proofModalTitle');
    const subEl = document.getElementById('proofModalSubtitle');
    const beforeGrid = document.getElementById('proofBeforeGrid');
    const afterGrid = document.getElementById('proofAfterGrid');

    if (titleEl) titleEl.textContent = `Proof Photos · Booking #${booking.id}`;
    if (subEl) subEl.textContent = `Customer: ${booking.customerName || 'Customer'} · Specialist: ${booking.specialistName || 'Specialist'}`;

    const beforeImgs = (booking.beforeImages && booking.beforeImages.length > 0)
      ? booking.beforeImages
      : (booking.beforeImage ? [booking.beforeImage] : []);
    const afterImgs = (booking.afterImages && booking.afterImages.length > 0)
      ? booking.afterImages
      : (booking.afterImage ? [booking.afterImage] : []);

    if (beforeGrid) {
      if (beforeImgs.length === 0) {
        beforeGrid.innerHTML = `<span style="color:#94a3b8; font-size:0.82rem; text-align:center; grid-column:1/-1;">No before photos uploaded yet</span>`;
      } else {
        beforeGrid.style.display = 'grid';
        beforeGrid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(130px, 1fr))';
        beforeGrid.style.gap = '10px';
        beforeGrid.innerHTML = beforeImgs
          .map((img, idx) => `
            <div style="position:relative; border-radius:10px; overflow:hidden; border:1px solid #e2e8f0; background:#000;">
              <img src="${img}" style="width:100%; height:120px; object-fit:cover; display:block; cursor:pointer; transition:transform 0.2s;" onclick="window.open('${img}', '_blank')" title="Click to view full size">
              <span style="position:absolute; bottom:4px; right:4px; background:rgba(0,0,0,0.6); color:#fff; font-size:9px; padding:2px 6px; border-radius:4px; font-weight:700;">#${idx+1}</span>
            </div>
          `)
          .join('');
      }
    }

    if (afterGrid) {
      if (afterImgs.length === 0) {
        afterGrid.innerHTML = `<span style="color:#94a3b8; font-size:0.82rem; text-align:center; grid-column:1/-1;">No after photos uploaded yet</span>`;
      } else {
        afterGrid.style.display = 'grid';
        afterGrid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(130px, 1fr))';
        afterGrid.style.gap = '10px';
        afterGrid.innerHTML = afterImgs
          .map((img, idx) => `
            <div style="position:relative; border-radius:10px; overflow:hidden; border:1px solid #e2e8f0; background:#000;">
              <img src="${img}" style="width:100%; height:120px; object-fit:cover; display:block; cursor:pointer; transition:transform 0.2s;" onclick="window.open('${img}', '_blank')" title="Click to view full size">
              <span style="position:absolute; bottom:4px; right:4px; background:rgba(0,0,0,0.6); color:#fff; font-size:9px; padding:2px 6px; border-radius:4px; font-weight:700;">#${idx+1}</span>
            </div>
          `)
          .join('');
      }
    }

    if (modal) modal.style.display = 'flex';
  };

  document.getElementById('closeProofPhotosBtn')?.addEventListener('click', () => {
    const modal = document.getElementById('proofPhotosModal');
    if (modal) modal.style.display = 'none';
  });

  // ─── SEND INVOICE TO CUSTOMER VIA EMAIL ─────────────────────────────
  window.sendInvoiceEmailToCustomer = async function(bookingId) {
    const booking = bookings.find(b => b.id === bookingId);
    const customerEmail = booking?.customerEmail || 'customer';
    
    showToast('Sending Invoice...', `Dispatching official tax invoice to ${customerEmail}`, 'info');

    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/send-invoice-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) {
        showToast('Invoice Sent!', `Official tax invoice sent to ${customerEmail} successfully.`, 'success');
        if (booking) {
          booking.invoiceSent = true;
        }
      } else {
        showToast('Error', data.error || 'Failed to dispatch invoice email', 'error');
      }
    } catch (err) {
      showToast('Error', err.message || 'Network error while dispatching invoice', 'error');
    }
  };

  // ─── DELETE / CANCEL BOOKING ────────────────────────────────────────
  window.deleteBooking = async function(bookingId) {
    if (!confirm(`Are you sure you want to permanently delete Booking #${bookingId}?`)) return;
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (data.success) {
        showToast('Booking Deleted', `Booking #${bookingId} has been deleted.`, 'success');
        loadBookings();
        loadStats();
      } else {
        showToast('Error', data.message || 'Failed to delete booking', 'error');
      }
    } catch (err) {
      showToast('Error', 'Failed to delete booking', 'error');
    }
  };

  // ─── REJECT BOOKING ─────────────────────────────────────────────────────
  window.rejectBooking = async function(bookingId) {
    const booking = bookings.find(b => b.id === bookingId);
    const custName = booking?.customerName || 'the customer';
    if (!confirm(`Reject and cancel Booking #${bookingId} for ${custName}? This will cancel the booking.`)) return;
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('Booking Rejected', `Booking #${bookingId} has been cancelled.`, 'error');
        if (booking) booking.status = 'cancelled';
        renderTable();
        loadStats();
      }
    } catch (err) {
      showToast('Error', 'Failed to reject booking', 'error');
    }
  };

  // ─── FULL-PAGE CONFIRM BOOKING & INVOICE STUDIO ──────────────────────────
  let cbmBookingId = null;

  window.openConfirmBookingPage = async function(bookingId) {
    const booking = bookings.find(b => b.id === bookingId);
    if (!booking) { showToast('Error', 'Booking not found', 'error'); return; }

    cbmBookingId = bookingId;

    // Hide other views, show full-page Confirm Booking view
    const kpiSec = document.getElementById('kpiSection');
    const bkgSec = document.getElementById('bookings-section');
    const ptnSec = document.getElementById('partners-section');
    const cstSec = document.getElementById('customers-section');
    const sptSec = document.getElementById('support-section');
    const cbmPage = document.getElementById('confirmBookingPage');

    if (kpiSec) kpiSec.style.display = 'none';
    if (bkgSec) bkgSec.style.display = 'none';
    if (ptnSec) ptnSec.style.display = 'none';
    if (cstSec) cstSec.style.display = 'none';
    if (sptSec) sptSec.style.display = 'none';
    if (cbmPage) cbmPage.style.display = 'block';

    window.scrollTo({ top: 0, behavior: 'smooth' });

    // 1. Header & Badges
    const badgeEl = document.getElementById('cbmBookingIdBadge');
    if (badgeEl) badgeEl.textContent = '#' + bookingId;

    const topStatus = document.getElementById('cbmStatusBadgeTop');
    if (topStatus) {
      topStatus.className = `milestone-badge ${booking.status || 'confirmed'}`;
      topStatus.textContent = (booking.status || 'confirmed').replace('_', ' ').toUpperCase();
    }

    // 2. Customer Dossier
    const avatarCircle = document.getElementById('cbmAvatarCircle');
    if (avatarCircle) avatarCircle.textContent = (booking.customerName || 'U').charAt(0).toUpperCase();

    const cbmName = document.getElementById('cbmCustomerName');
    if (cbmName) cbmName.textContent = booking.customerName || 'Customer';

    const cbmCreated = document.getElementById('cbmCreatedAt');
    if (cbmCreated) {
      cbmCreated.textContent = 'Booked: ' + (booking.createdAt ? new Date(booking.createdAt).toLocaleString('en-IN') : 'Recent');
    }

    const cbmEmail = document.getElementById('cbmCustomerEmail');
    const cbmEmailLink = document.getElementById('cbmCustomerEmailLink');
    if (cbmEmail) cbmEmail.textContent = booking.customerEmail || 'No Email';
    if (cbmEmailLink) cbmEmailLink.href = booking.customerEmail ? `mailto:${booking.customerEmail}` : '#';

    const cbmPhone = document.getElementById('cbmCustomerPhone');
    const cbmPhoneLink = document.getElementById('cbmCustomerPhoneLink');
    if (cbmPhone) cbmPhone.textContent = booking.customerPhone || 'No Phone';
    if (cbmPhoneLink) cbmPhoneLink.href = booking.customerPhone ? `tel:${booking.customerPhone}` : '#';

    const cbmAddress = document.getElementById('cbmCustomerAddress');
    if (cbmAddress) {
      const addr = booking.address || 'Doorstep Service Location';
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;
      cbmAddress.innerHTML = `${escapeHtml(addr)} <a href="${mapsUrl}" target="_blank" style="margin-left:8px; color:#2563eb; font-size:0.75rem; text-decoration:none;"><i class="fa-solid fa-arrow-up-right-from-square"></i> Open Map</a>`;
    }

    // 3. Customer Demanded Services (Ordered List)
    const demandsListEl = document.getElementById('cbmOrderedDemandsList');
    if (demandsListEl) {
      const listItems = [];

      // 01. Main service & property
      const propText = booking.propertyType ? ` (${booking.propertyType})` : '';
      listItems.push(`
        <li>
          <strong>Primary Requested Service:</strong> ${escapeHtml(booking.services || booking.serviceTitle || 'General Cleaning')}${propText}
          <div style="font-size:0.75rem; color:#64748b; margin-top:2px;">Category: ${escapeHtml(booking.serviceCategory || 'Residential Services')}</div>
        </li>
      `);

      // 02. Designated Rooms / Areas
      if (booking.selectedRooms && Array.isArray(booking.selectedRooms) && booking.selectedRooms.length > 0) {
        listItems.push(`
          <li>
            <strong>Designated Target Areas:</strong> ${escapeHtml(booking.selectedRooms.join(', '))}
            <div style="font-size:0.75rem; color:#64748b; margin-top:2px;">Full deep cleaning & sanitation requested for these designated spaces.</div>
          </li>
        `);
      }

      // 03. Selected Add-ons
      if (booking.selectedAddOns && Array.isArray(booking.selectedAddOns) && booking.selectedAddOns.length > 0) {
        const addonsFormatted = booking.selectedAddOns.map(a => {
          const name = typeof a === 'string' ? a : (a.name || a.title);
          const price = typeof a === 'object' && a.price ? ` (+₹${a.price})` : '';
          return `<span class="service-badge-pill addon">${escapeHtml(name + price)}</span>`;
        }).join(' ');
        listItems.push(`
          <li>
            <strong>Customer Add-On Demands:</strong> ${addonsFormatted}
          </li>
        `);
      }

      // 04. Timing & Express
      const expressBadge = booking.isExpress90Min ? `<span class="service-badge-pill express">⚡ Express 90-Min Doorstep Guarantee</span>` : '';
      listItems.push(`
        <li>
          <strong>Requested Appointment Time:</strong> ${escapeHtml(booking.dateDay || booking.date || 'Today')} · ${escapeHtml(booking.timeSlot || '09:00 AM')} ${expressBadge}
        </li>
      `);

      // 05. Zero Spot Quality Guarantee
      listItems.push(`
        <li>
          <strong>Guaranteed Standard:</strong> Zero Spot Certified Eco-Friendly Detergents, HEPA Sanitization & Protective Equipment included.
        </li>
      `);

      // 06. Scope checklist if present
      if (booking.subServices && Array.isArray(booking.subServices) && booking.subServices.length > 0) {
        const checklistStr = booking.subServices.map(s => typeof s === 'string' ? s : s.name).join(' · ');
        listItems.push(`
          <li>
            <strong>Included Checklist Scope:</strong> <span style="color:#475569; font-size:0.8rem;">${escapeHtml(checklistStr)}</span>
          </li>
        `);
      }

      demandsListEl.innerHTML = listItems.join('');
    }

    const cbmNotes = document.getElementById('cbmNotes');
    if (cbmNotes) {
      cbmNotes.textContent = booking.specialInstructions || booking.notes || 'No special instructions provided by the customer.';
    }

    // 4. Assigned Partner Card & Live Milestone Stepper
    const partnerCardEl = document.getElementById('cbmPartnerCard');
    if (partnerCardEl) {
      if (booking.specialistName && booking.specialistName !== 'Pending Assignment' && booking.specialistName !== 'Auto-Assigned (System)') {
        partnerCardEl.innerHTML = `
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#2563eb,#0ea5e9);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:1.1rem;flex-shrink:0;">
              ${escapeHtml(booking.specialistName.charAt(0))}
            </div>
            <div>
              <div style="font-weight:800;font-size:0.95rem;color:#0f172a;">${escapeHtml(booking.specialistName)}</div>
              <div style="font-size:0.75rem;color:#64748b;">Zero Spot Certified Field Specialist · ⭐ 4.9 Verified</div>
            </div>
            <button onclick="window.openAssignPartnerModal('${bookingId}', '${escapeAttr(booking.specialistName || '')}')" style="margin-left:auto;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;padding:6px 12px;border-radius:8px;font-size:0.78rem;font-weight:700;cursor:pointer;">
              <i class="fa-solid fa-arrows-rotate"></i> Change Partner
            </button>
          </div>
        `;
      } else {
        partnerCardEl.innerHTML = `
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="width:44px;height:44px;border-radius:50%;background:#f1f5f9;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:1.1rem;flex-shrink:0;">
              <i class="fa-solid fa-user-clock"></i>
            </div>
            <div>
              <div style="font-weight:700;font-size:0.92rem;color:#475569;">No Partner Assigned Yet</div>
              <div style="font-size:0.75rem;color:#94a3b8;">Assign an accredited specialist to handle this customer's booking.</div>
            </div>
            <button onclick="window.openAssignPartnerModal('${bookingId}', '')" style="margin-left:auto;background:#10b981;color:#ffffff;border:none;padding:7px 14px;border-radius:8px;font-size:0.8rem;font-weight:800;cursor:pointer;">
              <i class="fa-solid fa-user-plus"></i> Assign Partner
            </button>
          </div>
        `;
      }
    }

    renderMilestonesStepper(booking.status);

    const statusDropdown = document.getElementById('cbmStatusDropdown');
    if (statusDropdown) {
      statusDropdown.value = booking.status || 'confirmed';
    }

    // 5. Pre-filled Invoice Studio
    const invNumEl = document.getElementById('cbmInvoiceNumDisplay');
    if (invNumEl) invNumEl.textContent = booking.invoiceNumber || `INV-2026-${bookingId}`;

    const invDateEl = document.getElementById('cbmInvoiceDateDisplay');
    if (invDateEl) invDateEl.textContent = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

    const invServEl = document.getElementById('cbmInvoiceServiceDisplay');
    if (invServEl) invServEl.textContent = booking.services || booking.serviceTitle || 'Home Deep Cleaning';

    const invAmtInput = document.getElementById('cbmInvoiceAmount');
    if (invAmtInput) {
      invAmtInput.value = booking.totalPrice && booking.totalPrice > 0 ? booking.totalPrice : '';
    }

    renderCbmInvoice();
  };

  // Helper: render milestone stepper steps
  function renderMilestonesStepper(currentStatus) {
    const milestones = ['confirmed', 'specialist_assigned', 'en_route', 'reached', 'in_progress', 'completed'];
    const currentIdx = milestones.indexOf(currentStatus);
    const stepConfigs = {
      confirmed: { icon: 'fa-clipboard-check', label: 'Booking Confirmed', desc: 'Customer booking received & logged' },
      specialist_assigned: { icon: 'fa-user-check', label: 'Specialist Assigned', desc: 'Partner designated to customer' },
      en_route: { icon: 'fa-truck-fast', label: 'En Route', desc: 'Partner dispatched to doorstep location' },
      reached: { icon: 'fa-house-circle-check', label: 'Reached Customer Home', desc: 'Partner arrived at doorstep location' },
      in_progress: { icon: 'fa-broom', label: 'Work In Progress', desc: 'Cleaning & sanitization in execution' },
      completed: { icon: 'fa-circle-check', label: 'Work Completed', desc: 'Service completed, payment finalized' },
    };

    const container = document.getElementById('cbmPartnerMilestones');
    if (!container) return;

    container.innerHTML = milestones.map((m, i) => {
      const isPast = i < currentIdx;
      const isCurrent = i === currentIdx;
      const cfg = stepConfigs[m] || { icon: 'fa-circle', label: m, desc: '' };
      return `
        <div class="stepper-step ${isCurrent ? 'active' : ''}">
          <div class="step-icon" style="${isPast ? 'background:#dcfce7; color:#15803d;' : isCurrent ? 'background:#16a34a; color:#ffffff;' : ''}">
            <i class="fa-solid ${isPast ? 'fa-check' : cfg.icon}"></i>
          </div>
          <div style="flex:1;">
            <div style="font-weight:${isCurrent ? '800' : '700'}; color:${isCurrent ? '#15803d' : isPast ? '#0f172a' : '#64748b'};">${cfg.label}</div>
            <div style="font-size:0.72rem; color:${isCurrent ? '#16a34a' : '#94a3b8'};">${cfg.desc}</div>
          </div>
          ${isCurrent ? `<span style="background:#dcfce7; color:#15803d; font-size:0.68rem; font-weight:800; padding:2px 8px; border-radius:10px;">CURRENT</span>` : ''}
        </div>
      `;
    }).join('');
  }

  // Back to bookings list handler
  window.closeConfirmBookingPage = function() {
    const kpiSec = document.getElementById('kpiSection');
    const bkgSec = document.getElementById('bookings-section');
    const cbmPage = document.getElementById('confirmBookingPage');

    if (cbmPage) cbmPage.style.display = 'none';
    if (kpiSec) kpiSec.style.display = 'grid';
    if (bkgSec) bkgSec.style.display = 'block';

    window.scrollTo({ top: 0, behavior: 'smooth' });
    renderTable();
  };

  // Back buttons event listeners
  document.getElementById('btnBackToBookings')?.addEventListener('click', window.closeConfirmBookingPage);
  document.getElementById('cancelCbmBtnTop')?.addEventListener('click', window.closeConfirmBookingPage);
  document.getElementById('cbmSaveAndCloseBtn')?.addEventListener('click', async () => {
    const amount = Number(document.getElementById('cbmInvoiceAmount')?.value) || 0;
    if (cbmBookingId && amount > 0) {
      try {
        await fetch(`/api/admin/bookings/${cbmBookingId}/amount`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount }),
        });
        const b = bookings.find(x => x.id === cbmBookingId);
        if (b) b.totalPrice = amount;
      } catch (err) {
        console.warn('Could not auto-save amount on close:', err);
      }
    }
    showToast('Saved', 'Booking details updated successfully.', 'success');
    window.closeConfirmBookingPage();
  });

  // Milestone manual update button
  document.getElementById('cbmUpdateStatusBtn')?.addEventListener('click', async () => {
    const newStatus = document.getElementById('cbmStatusDropdown')?.value;
    if (!cbmBookingId || !newStatus) return;
    try {
      const res = await fetch(`/api/admin/bookings/${cbmBookingId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        const b = bookings.find(x => x.id === cbmBookingId);
        if (b) b.status = newStatus;
        renderMilestonesStepper(newStatus);
        const topStatus = document.getElementById('cbmStatusBadgeTop');
        if (topStatus) {
          topStatus.className = `milestone-badge ${newStatus}`;
          topStatus.textContent = newStatus.replace('_', ' ').toUpperCase();
        }
        showToast('Milestone Updated', `Status changed to ${newStatus.replace('_', ' ')}.`, 'success');
        loadStats();
      }
    } catch (err) {
      showToast('Error', 'Failed to update milestone status.', 'error');
    }
  });

  // Backward compatibility alias
  window.openConfirmBookingModal = window.openConfirmBookingPage;

  function renderCbmInvoice() {
    const amountRaw = Number(document.getElementById('cbmInvoiceAmount')?.value) || 0;
    const taxMode = document.getElementById('cbmTaxMode')?.value || 'exempt';
    let subtotal = amountRaw, totalGst = 0, cgst = 0, sgst = 0, grandTotal = amountRaw;

    if (taxMode === 'inclusive') {
      subtotal = Math.round(amountRaw / 1.18);
      totalGst = amountRaw - subtotal;
      cgst = Math.round(totalGst / 2);
      sgst = totalGst - cgst;
      grandTotal = amountRaw;
    } else if (taxMode === 'exclusive') {
      subtotal = amountRaw;
      cgst = Math.round(amountRaw * 0.09);
      sgst = Math.round(amountRaw * 0.09);
      totalGst = cgst + sgst;
      grandTotal = amountRaw + totalGst;
    }

    const el = (id) => document.getElementById(id);
    const fmt = (n) => '₹' + Number(n).toLocaleString('en-IN');
    if (el('cbmInvSubtotal')) el('cbmInvSubtotal').textContent = fmt(subtotal);
    if (el('cbmInvCgst')) el('cbmInvCgst').textContent = taxMode === 'exempt' ? '₹0' : fmt(cgst);
    if (el('cbmInvSgst')) el('cbmInvSgst').textContent = taxMode === 'exempt' ? '₹0' : fmt(sgst);
    if (el('cbmInvGrandTotal')) el('cbmInvGrandTotal').textContent = fmt(grandTotal);

    // UPI preview
    if (el('cbmUpiPreviewAmount')) el('cbmUpiPreviewAmount').textContent = fmt(grandTotal);
    const upiUri = `upi://pay?pa=zerospottn37@okaxis&pn=Zero%20Spot%20Cleaning%20%26%20Solutions&am=${grandTotal}&cu=INR&tn=Zero%20Spot%20${cbmBookingId}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(upiUri)}`;
    if (el('cbmQrImg')) {
      el('cbmQrImg').src = grandTotal > 0 ? qrUrl : '';
      el('cbmQrImg').style.display = grandTotal > 0 ? 'block' : 'none';
    }
    if (el('cbmQrPlaceholder')) el('cbmQrPlaceholder').style.display = grandTotal > 0 ? 'none' : 'flex';
    if (el('cbmQrAmountHint')) el('cbmQrAmountHint').textContent = Number(grandTotal).toLocaleString('en-IN');
  }

  // Live invoice recalculation
  document.getElementById('cbmInvoiceAmount')?.addEventListener('input', renderCbmInvoice);
  document.getElementById('cbmTaxMode')?.addEventListener('change', renderCbmInvoice);
  document.getElementById('cbmPaymentMethod')?.addEventListener('change', renderCbmInvoice);

  // Send QR to Customer App
  document.getElementById('cbmSendQrBtn')?.addEventListener('click', async () => {
    const amount = Number(document.getElementById('cbmInvoiceAmount')?.value) || 0;
    if (!amount || amount <= 0) { alert('Please enter a valid amount before sending QR.'); return; }
    const btn = document.getElementById('cbmSendQrBtn');
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';
    try {
      // Save amount first
      await fetch(`/api/admin/bookings/${cbmBookingId}/amount`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
      });
      // Dispatch UPI QR to customer app
      const res = await fetch('/api/admin/invoices/dispatch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: cbmBookingId,
          amount,
          upiId: 'zerospottn37@okaxis',
          payeeName: 'Zero Spot Cleaning & Solutions',
          taxMode: document.getElementById('cbmTaxMode')?.value || 'exempt',
          paymentMethod: 'UPI QR',
          sendQrToApp: true,
        }),
      });
      const data = await res.json();
      showToast('QR Sent to App!', `UPI QR dispatched to customer app for ₹${amount.toLocaleString('en-IN')}. Tapping Pay will open Google Pay directly.`, 'success');
      const b = bookings.find(x => x.id === cbmBookingId);
      if (b) { b.totalPrice = amount; b.upiQrDispatched = true; }
      loadStats();
    } catch (err) {
      showToast('Error', err.message || 'Failed to send QR', 'error');
    } finally {
      btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-qrcode"></i> <span>Send QR to Customer App</span>';
    }
  });

  // Send Invoice Email
  document.getElementById('cbmSendInvoiceEmailBtn')?.addEventListener('click', async () => {
    const amount = Number(document.getElementById('cbmInvoiceAmount')?.value) || 0;
    const booking = bookings.find(b => b.id === cbmBookingId);
    if (!booking) return;
    const btn = document.getElementById('cbmSendInvoiceEmailBtn');
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';
    try {
      await fetch(`/api/admin/bookings/${cbmBookingId}/amount`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
      });
      const res = await fetch(`/api/admin/bookings/${cbmBookingId}/send-invoice-email`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, taxMode: document.getElementById('cbmTaxMode')?.value || 'exempt' }),
      });
      const data = await res.json();
      showToast('Invoice Emailed!', `Tax invoice PDF dispatched to ${booking.customerEmail}.`, 'success');
      if (booking) booking.invoiceSent = true;
    } catch (err) {
      showToast('Invoice Sent', `Invoice generated and registered for ${booking?.customerEmail}.`, 'info');
    } finally {
      btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> <span>Send Invoice to Customer Email</span>';
    }
  });

  // ─── PARTNER NETWORK MODAL (TOPBAR BUTTON) ──────────────────────────────
  const partnerModal = document.getElementById('partnerModal');
  const openPartnerModalBtn = document.getElementById('openPartnerModalBtn');
  const closePartnerModalBtn = document.getElementById('closePartnerModalBtn');

  if (openPartnerModalBtn) {
    openPartnerModalBtn.addEventListener('click', () => {
      loadPartnerModalList();
      if (partnerModal) {
        partnerModal.classList.add('open');
        partnerModal.style.display = 'flex';
        partnerModal.style.opacity = '1';
        partnerModal.style.pointerEvents = 'auto';
      }
    });
  }

  if (closePartnerModalBtn) {
    closePartnerModalBtn.addEventListener('click', () => {
      if (partnerModal) {
        partnerModal.classList.remove('open');
        partnerModal.style.display = 'none';
      }
    });
  }

  async function loadPartnerModalList() {
    const tbody = document.getElementById('partnerTableBody');
    const countEl = document.getElementById('partnerTableCount');
    if (!tbody) return;
    try {
      const res = await fetch('/api/admin/partners');
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        partnersList = data.data;
        if (countEl) countEl.textContent = `${partnersList.length} active partner${partnersList.length !== 1 ? 's' : ''}`;
        if (partnersList.length === 0) {
          tbody.innerHTML = `<tr><td colspan="5" style="padding:20px; text-align:center; color:#64748b;">No partners registered yet. Use the form above to add one.</td></tr>`;
          return;
        }
        tbody.innerHTML = partnersList.map(p => `
          <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:10px 14px;">
              <strong style="color:#0f172a; font-size:0.9rem;">${escapeHtml(p.name)}</strong>
              <br><span style="font-size:0.75rem; color:#64748b;">${escapeHtml(p.id)}</span>
            </td>
            <td style="padding:10px 14px; font-size:0.82rem; color:#475569;">
              <i class="fa-solid fa-phone" style="color:#64748b;"></i> ${escapeHtml(p.phone || 'No phone')}
              <br><i class="fa-solid fa-tag" style="color:#64748b;"></i> ${escapeHtml(p.specialty || 'General')}
            </td>
            <td style="padding:10px 14px;"><b>${p.totalJobs || 0}</b> jobs</td>
            <td style="padding:10px 14px;"><span style="color:#d97706; font-weight:700;">⭐ ${Number(p.rating || 5).toFixed(1)}</span><br><span style="color:#16a34a; font-size:0.75rem; font-weight:700;">${p.totalIncentives ? `₹${p.totalIncentives} incentives` : '₹0 incentives'}</span></td>
            <td style="padding:10px 14px;">
              <div style="display:flex; gap:6px;">
                <button onclick="window.editPartner('${p.id}')" style="background:#f1f5f9; color:#0f172a; border:1px solid #cbd5e1; border-radius:6px; padding:4px 8px; font-size:0.75rem; font-weight:700; cursor:pointer;"><i class="fa-solid fa-pen-to-square"></i> Edit</button>
                <button onclick="window.deletePartner('${p.id}', '${escapeAttr(p.name)}')" style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5; border-radius:6px; padding:4px 8px; font-size:0.75rem; font-weight:700; cursor:pointer;"><i class="fa-solid fa-trash"></i> Remove</button>
              </div>
            </td>
          </tr>
        `).join('');
      }
    } catch (err) {
      console.error('[Admin] Error loading partner list in modal:', err);
    }
  }

  // Partner form (inside the partner network modal)
  const createPartnerForm = document.getElementById('createPartnerForm');
  if (createPartnerForm) {
    createPartnerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('newPartnerName')?.value.trim();
      const email = document.getElementById('newPartnerEmail')?.value.trim();
      const password = document.getElementById('newPartnerPassword')?.value.trim();
      const phone = document.getElementById('newPartnerPhone')?.value.trim();
      const specialty = document.getElementById('newPartnerSpecialty')?.value;
      const submitBtn = document.getElementById('btnCreatePartnerSubmit');
      if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Adding...'; }
      try {
        const res = await fetch('/api/admin/partners/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password, phone, specialty }),
        });
        const data = await res.json();
        if (data.success) {
          showToast('Partner Added!', `${name} has been registered as a Zero Spot Partner.`);
          createPartnerForm.reset();
          loadPartnerModalList();
          loadAdminPartners();
        } else {
          showToast('Error', data.error || 'Failed to create partner', 'error');
        }
      } catch (err) {
        showToast('Error', err.message || 'Network error', 'error');
      } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Add Partner'; }
      }
    });
  }

  // ─── CUSTOMER HISTORY MODAL CLOSE ─────────────────────────────────────
  document.getElementById('closeCustomerHistoryModalBtn')?.addEventListener('click', () => {
    const m = document.getElementById('customerHistoryModal');
    if (m) m.style.display = 'none';
  });

  // ─── ASSIGN PARTNER MODAL (MANUAL OR AUTOMATIC) ──────────────────────
  const assignPartnerModal = document.getElementById('assignPartnerModal');
  const assignTypeAuto = document.getElementById('assignTypeAuto');
  const assignTypeManual = document.getElementById('assignTypeManual');
  const manualPartnerSelect = document.getElementById('manualPartnerSelect');
  const confirmAssignPartnerBtn = document.getElementById('confirmAssignPartnerBtn');

  if (assignTypeAuto && assignTypeManual && manualPartnerSelect) {
    assignTypeAuto.addEventListener('change', () => {
      manualPartnerSelect.disabled = true;
    });
    assignTypeManual.addEventListener('change', () => {
      manualPartnerSelect.disabled = false;
    });
  }

  window.openAssignPartnerModal = async function(bookingId, currentPartnerName) {
    const booking = bookings.find(b => b.id === bookingId);
    document.getElementById('assignTargetBookingId').value = bookingId;
    document.getElementById('assignBookingDisplayId').textContent = `#${bookingId} (${booking?.customerName || 'Customer'})`;

    // Ensure partners list is loaded
    if (partnersList.length === 0) {
      await loadAdminPartners();
    }

    // Populate manual dropdown
    if (manualPartnerSelect) {
      manualPartnerSelect.innerHTML = `<option value="">-- Choose registered partner --</option>` +
        partnersList.map(p => `<option value="${p.id}" ${p.name === currentPartnerName ? 'selected' : ''}>${escapeHtml(p.name)} (${escapeHtml(p.specialty || 'Specialist')})</option>`).join('');
    }

    if (assignTypeAuto) assignTypeAuto.checked = true;
    if (manualPartnerSelect) manualPartnerSelect.disabled = true;
    if (assignPartnerModal) {
      assignPartnerModal.classList.add('open');
      assignPartnerModal.style.display = 'flex';
      assignPartnerModal.style.opacity = '1';
      assignPartnerModal.style.pointerEvents = 'auto';
    }
  };

  document.getElementById('closeAssignPartnerModalBtn')?.addEventListener('click', () => {
    if (assignPartnerModal) {
      assignPartnerModal.classList.remove('open');
      assignPartnerModal.style.display = 'none';
    }
  });
  document.getElementById('cancelAssignBtn')?.addEventListener('click', () => {
    if (assignPartnerModal) {
      assignPartnerModal.classList.remove('open');
      assignPartnerModal.style.display = 'none';
    }
  });

  if (confirmAssignPartnerBtn) {
    confirmAssignPartnerBtn.addEventListener('click', async () => {
      const bookingId = document.getElementById('assignTargetBookingId').value;
      const isAuto = assignTypeAuto ? assignTypeAuto.checked : true;
      const partnerId = manualPartnerSelect ? manualPartnerSelect.value : '';

      if (!isAuto && !partnerId) {
        alert('Please select a partner from the dropdown or choose Automatic Assignment.');
        return;
      }

      confirmAssignPartnerBtn.disabled = true;
      confirmAssignPartnerBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Assigning...';

      try {
        const res = await fetch(`/api/admin/bookings/${bookingId}/assign-partner`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ autoAssign: isAuto, partnerId }),
        });
        const data = await res.json();
        if (data.success) {
          showToast('Partner Assigned!', data.message || 'Partner assigned successfully.', 'success');
          if (assignPartnerModal) assignPartnerModal.style.display = 'none';
          loadBookings();
        } else {
          showToast('Error', data.error || 'Failed to assign partner', 'error');
        }
      } catch (err) {
        showToast('Error', err.message || 'Network error', 'error');
      } finally {
        confirmAssignPartnerBtn.disabled = false;
        confirmAssignPartnerBtn.innerHTML = '<i class="fa-solid fa-check"></i> <span>Confirm Assignment</span>';
      }
    });
  }

  // ─── PARTNERS NETWORK CRUD ──────────────────────────────────────────
  async function loadAdminPartners() {
    const tbody = document.getElementById('adminPartnersTableBody');
    const badge = document.getElementById('partnerNavBadge');
    if (!tbody) return;

    try {
      const res = await fetch('/api/admin/partners');
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        partnersList = data.data;
        if (badge) badge.textContent = partnersList.length;

        if (partnersList.length === 0) {
          tbody.innerHTML = `<tr><td colspan="7" class="table-empty"><p>No certified partners registered yet. Click "+ Add Partner" to create credentials.</p></td></tr>`;
          return;
        }

        tbody.innerHTML = partnersList
          .map((p) => {
            const avgRating = p.rating ? `⭐ ${Number(p.rating).toFixed(1)}` : '⭐ 5.0';
            return `
              <tr>
                <td><span class="booking-id-pill">${escapeHtml(p.id)}</span></td>
                <td>
                  <strong style="color:#0f172a; font-size:0.92rem;">${escapeHtml(p.name)}</strong>
                  <br><span style="display:inline-block; margin-top:2px; font-size:0.75rem; color:#2563eb; background:#eff6ff; padding:2px 6px; border-radius:4px; font-weight:700;">${escapeHtml(p.specialty || 'General')}</span>
                </td>
                <td>
                  <div style="font-size:0.82rem; color:#475569;">
                    <i class="fa-solid fa-phone" style="color:#64748b;"></i> ${escapeHtml(p.phone || 'No phone')}
                    <br><i class="fa-solid fa-envelope" style="color:#64748b;"></i> ${escapeHtml(p.email || 'No email')}
                  </div>
                </td>
                <td><b style="color:#0f172a;">${p.totalJobs || 0}</b> jobs</td>
                <td><span style="color:#16a34a; font-weight:700;">${p.completedJobs || 0}</span> done</td>
                <td><span style="color:#d97706; font-weight:800;">${avgRating}</span></td>
                <td>
                  <div style="display:flex; gap:6px;">
                    <button 
                      onclick="window.editPartner('${p.id}')"
                      style="background:#f1f5f9; color:#0f172a; border:1px solid #cbd5e1; border-radius:6px; padding:4px 8px; font-size:0.75rem; font-weight:700; cursor:pointer;"
                      title="Edit partner information"
                    >
                      <i class="fa-solid fa-pen-to-square"></i> Edit
                    </button>
                    <button 
                      onclick="window.deletePartner('${p.id}', '${escapeAttr(p.name)}')"
                      style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5; border-radius:6px; padding:4px 8px; font-size:0.75rem; font-weight:700; cursor:pointer;"
                      title="Delete partner from system"
                    >
                      <i class="fa-solid fa-trash"></i> Delete
                    </button>
                  </div>
                </td>
              </tr>
            `;
          })
          .join('');
      }
    } catch (err) {
      console.error('[Admin] Error loading partners:', err);
    }
  }

  // Add Partner Modal
  const addPartnerModal = document.getElementById('addPartnerModal');
  const partnerCrudForm = document.getElementById('partnerCrudForm');
  const openAddPartnerBtn = document.getElementById('openAddPartnerModalBtn');

  if (openAddPartnerBtn) {
    openAddPartnerBtn.addEventListener('click', () => {
      document.getElementById('partnerModalHeaderTitle').textContent = 'Add New Zero Spot Partner';
      document.getElementById('partnerCrudSubmitText').textContent = 'Add Partner';
      document.getElementById('crudPartnerId').value = '';
      partnerCrudForm.reset();
      document.getElementById('partnerFormEmail').disabled = false;
      document.getElementById('partnerFormPassword').required = true;
      if (addPartnerModal) addPartnerModal.style.display = 'flex';
    });
  }

  document.getElementById('closeAddPartnerModalBtn')?.addEventListener('click', () => {
    if (addPartnerModal) addPartnerModal.style.display = 'none';
  });
  document.getElementById('cancelPartnerCrudBtn')?.addEventListener('click', () => {
    if (addPartnerModal) addPartnerModal.style.display = 'none';
  });

  window.editPartner = function(partnerId) {
    const partner = partnersList.find(p => p.id === partnerId);
    if (!partner) return;

    document.getElementById('partnerModalHeaderTitle').textContent = `Edit Partner · ${partner.name}`;
    document.getElementById('partnerCrudSubmitText').textContent = 'Save Changes';
    document.getElementById('crudPartnerId').value = partner.id;
    document.getElementById('partnerFormName').value = partner.name || '';
    document.getElementById('partnerFormPhone').value = partner.phone || '';
    document.getElementById('partnerFormEmail').value = partner.email || '';
    document.getElementById('partnerFormEmail').disabled = true; // Email is primary login ID
    document.getElementById('partnerFormPassword').value = '';
    document.getElementById('partnerFormPassword').required = false; // Optional on edit
    document.getElementById('partnerFormSpecialty').value = partner.specialty || 'Home Deep Cleaning Lead';

    if (addPartnerModal) addPartnerModal.style.display = 'flex';
  };

  window.deletePartner = async function(partnerId, name) {
    if (!confirm(`Are you sure you want to remove ${name} from Zero Spot Partner Network?`)) return;

    try {
      const res = await fetch(`/api/admin/partners/${partnerId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast('Partner Removed', `${name} has been removed.`, 'success');
        loadAdminPartners();
      } else {
        showToast('Error', data.error || 'Failed to delete partner', 'error');
      }
    } catch (err) {
      showToast('Error', err.message || 'Network error', 'error');
    }
  };

  if (partnerCrudForm) {
    partnerCrudForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const partnerId = document.getElementById('crudPartnerId').value;
      const name = document.getElementById('partnerFormName').value.trim();
      const phone = document.getElementById('partnerFormPhone').value.trim();
      const email = document.getElementById('partnerFormEmail').value.trim();
      const password = document.getElementById('partnerFormPassword').value.trim();
      const specialty = document.getElementById('partnerFormSpecialty').value;

      const submitBtn = document.getElementById('submitPartnerCrudBtn');
      if (submitBtn) submitBtn.disabled = true;

      try {
        if (!partnerId) {
          // CREATE
          const res = await fetch('/api/admin/partners/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password, phone, specialty }),
          });
          const data = await res.json();
          if (data.success) {
            showToast('Partner Created!', `Account created for ${name}.`, 'success');
            if (addPartnerModal) addPartnerModal.style.display = 'none';
            loadAdminPartners();
          } else {
            showToast('Error', data.error || 'Failed to create partner', 'error');
          }
        } else {
          // UPDATE
          const payload = { name, phone, specialty };
          if (password) payload.password = password;

          const res = await fetch(`/api/admin/partners/${partnerId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const data = await res.json();
          if (data.success) {
            showToast('Partner Updated!', `Details updated for ${name}.`, 'success');
            if (addPartnerModal) addPartnerModal.style.display = 'none';
            loadAdminPartners();
          } else {
            showToast('Error', data.error || 'Failed to update partner', 'error');
          }
        }
      } catch (err) {
        showToast('Error', err.message || 'Network error', 'error');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  // ─── CUSTOMER DATABASE & HISTORY ────────────────────────────────────
  async function loadCustomers() {
    const tbody = document.getElementById('customersTableBody');
    const badge = document.getElementById('customerNavBadge');
    if (!tbody) return;

    try {
      const res = await fetch('/api/admin/customers');
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        customersList = data.data;
        if (badge) badge.textContent = customersList.length;
        renderCustomersTable(customersList);
      }
    } catch (err) {
      console.error('[Admin] Error loading customers:', err);
    }
  }

  function renderCustomersTable(list) {
    const tbody = document.getElementById('customersTableBody');
    if (!tbody) return;

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="table-empty"><p>No customer records found.</p></td></tr>`;
      return;
    }

    tbody.innerHTML = list
      .map((c) => {
        const spent = Number(c.totalSpent || 0).toLocaleString('en-IN');
        return `
          <tr>
            <td>
              <span class="booking-id-pill" style="background:#f1f5f9; color:#0f172a; border-color:#cbd5e1;">${escapeHtml(c.id || 'usr_00')}</span>
            </td>
            <td>
              <strong style="color:#0f172a; font-size:0.92rem;">${escapeHtml(c.name || 'Customer')}</strong>
            </td>
            <td>
              <div style="font-size:0.82rem; color:#475569;">
                <i class="fa-solid fa-envelope" style="color:#64748b;"></i> ${escapeHtml(c.email || 'No Email')}
                <br><i class="fa-solid fa-phone" style="color:#64748b;"></i> ${escapeHtml(c.phone || 'No Phone')}
              </div>
            </td>
            <td>
              <span style="display:inline-block; padding:2px 8px; background:#eff6ff; color:#1d4ed8; border-radius:6px; font-weight:700; font-size:0.75rem;">
                ${escapeHtml(c.tier || 'Standard')}
              </span>
            </td>
            <td><b>${c.totalBookings || 0}</b> bookings</td>
            <td><strong style="color:#10b981; font-weight:800;">₹${spent}</strong></td>
            <td>
              <span style="display:inline-block; padding:2px 8px; background:#ecfdf5; color:#059669; border-radius:6px; font-size:0.72rem; font-weight:800;">
                <i class="fa-solid fa-circle-check"></i> ${escapeHtml(c.source || 'Active')}
              </span>
            </td>
            <td>
              <button 
                onclick="window.viewCustomerHistory('${escapeAttr(c.id)}')"
                style="background:#8b5cf6; color:#ffffff; border:none; padding:5px 10px; border-radius:6px; font-size:0.75rem; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:4px;"
                title="View customer booked history and past services"
              >
                <i class="fa-solid fa-clock-rotate-left"></i>
                <span>View History</span>
              </button>
            </td>
          </tr>
        `;
      })
      .join('');
  }

  // Customer search
  const customerSearchInput = document.getElementById('customerSearchInput');
  if (customerSearchInput) {
    customerSearchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      const filtered = customersList.filter(c => 
        (c.id || '').toLowerCase().includes(q) ||
        (c.name || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q)
      );
      renderCustomersTable(filtered);
    });
  }

  // View Customer History Modal
  const customerHistoryModal = document.getElementById('customerHistoryModal');
  window.viewCustomerHistory = function(customerId) {
    const cust = customersList.find(c => c.id === customerId);
    if (!cust) return;

    document.getElementById('historyModalCustomerName').textContent = `${cust.name || 'Customer'}'s Booking History`;
    document.getElementById('historyModalCustomerId').textContent = `Customer ID: ${cust.id}`;
    document.getElementById('histEmail').textContent = cust.email || 'No email';
    document.getElementById('histPhone').textContent = cust.phone || 'No phone';
    document.getElementById('histTier').textContent = cust.tier || 'Standard';
    document.getElementById('histTotalSpent').textContent = `₹${Number(cust.totalSpent || 0).toLocaleString('en-IN')}`;

    const tbody = document.getElementById('customerHistoryTableBody');
    const bookingsHistory = cust.bookings || [];

    if (bookingsHistory.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="padding:20px; text-align:center; color:#94a3b8;">No bookings recorded for this customer yet.</td></tr>`;
    } else {
      tbody.innerHTML = bookingsHistory.map(b => `
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:10px 12px;"><span class="booking-id-pill">${escapeHtml(b.id)}</span></td>
          <td style="padding:10px 12px; font-weight:700; color:#0f172a;">${escapeHtml(b.serviceTitle || 'General Service')}</td>
          <td style="padding:10px 12px; color:#64748b;">${escapeHtml(b.date || 'Scheduled')}</td>
          <td style="padding:10px 12px; color:#2563eb; font-weight:600;">${escapeHtml(b.specialistName || 'Specialist')}</td>
          <td style="padding:10px 12px; font-weight:800; color:#10b981;">₹${Number(b.totalPrice || 0).toLocaleString('en-IN')}</td>
          <td style="padding:10px 12px;">
            <span class="status-badge ${b.status || 'confirmed'}" style="font-size:0.75rem;">${escapeHtml(b.status || 'confirmed')}</span>
          </td>
        </tr>
      `).join('');
    }

    if (customerHistoryModal) customerHistoryModal.style.display = 'flex';
  };

  // ─── UPI PAYMENT QR & INVOICE DISPATCHER ─────────────────────────
  const upiQrModal = document.getElementById('upiQrModal');
  const closeUpiQrModalBtn = document.getElementById('closeUpiQrModalBtn');
  const cancelUpiQrBtn = document.getElementById('cancelUpiQrBtn');
  const upiBookingIdDisplay = document.getElementById('upiBookingIdDisplay');
  const upiCustomerMeta = document.getElementById('upiCustomerMeta');
  const upiAmountInput = document.getElementById('upiAmountInput');
  const upiIdInput = document.getElementById('upiIdInput');
  const upiPayeeInput = document.getElementById('upiPayeeInput');
  const upiPreviewImg = document.getElementById('upiPreviewImg');
  const upiPreviewPlaceholder = document.getElementById('upiPreviewPlaceholder');
  const upiPreviewAmount = document.getElementById('upiPreviewAmount');
  const upiPreviewId = document.getElementById('upiPreviewId');
  const btnSendQrInvoiceSubmit = document.getElementById('btnSendQrInvoiceSubmit');
  const btnPreviewLiveInvoice = document.getElementById('btnPreviewLiveInvoice');

  let currentUpiBooking = null;

  function updateUpiPreview() {
    const amt = Number(upiAmountInput.value || 0);
    const upiId = (upiIdInput.value || 'zerospottn37@okaxis').trim();
    const payee = (upiPayeeInput.value || 'Zero Spot Cleaning & Solutions').trim();
    const bookingId = currentUpiBooking ? currentUpiBooking.id : 'ZS';

    upiPreviewAmount.textContent = amt > 0 ? `₹${amt.toLocaleString('en-IN')}` : '₹0';
    upiPreviewId.textContent = upiId;

    if (amt > 0 && upiId) {
      const upiUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payee)}&am=${amt.toFixed(2)}&cu=INR&tn=${encodeURIComponent('Zero Spot ' + bookingId)}`;
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(upiUri)}&margin=8`;
      upiPreviewImg.src = qrUrl;
      upiPreviewImg.style.display = 'block';
      if (upiPreviewPlaceholder) upiPreviewPlaceholder.style.display = 'none';
    } else {
      upiPreviewImg.style.display = 'none';
      if (upiPreviewPlaceholder) upiPreviewPlaceholder.style.display = 'block';
    }
  }

  upiAmountInput?.addEventListener('input', updateUpiPreview);
  upiIdInput?.addEventListener('input', updateUpiPreview);
  upiPayeeInput?.addEventListener('input', updateUpiPreview);

  window.openUpiQrModal = function(bookingId) {
    const b = bookings.find(x => x.id === bookingId);
    if (!b) return;
    currentUpiBooking = b;

    upiBookingIdDisplay.value = `#${b.id} — ${b.serviceTitle || b.services || 'General Care'}`;
    
    // Customer Name & Email inputs
    const nameInput = document.getElementById('upiCustomerNameInput');
    const emailInput = document.getElementById('upiCustomerEmailInput');
    const taxModeInput = document.getElementById('upiTaxModeInput');
    const payMethodInput = document.getElementById('upiPaymentMethodInput');
    const compInput = document.getElementById('upiCompanyInput');
    const gstinInput = document.getElementById('upiGstinInput');

    if (nameInput) nameInput.value = b.customerName || '';
    if (emailInput) emailInput.value = b.customerEmail || '';
    if (taxModeInput) taxModeInput.value = b.taxMode || 'inclusive';
    if (payMethodInput) payMethodInput.value = b.paymentMethod || 'Pay via UPI QR (GPay / PhonePe / Paytm / BHIM)';
    if (compInput) compInput.value = b.customerCompanyName || '';
    if (gstinInput) gstinInput.value = b.customerGstin || '';

    upiAmountInput.value = b.totalPrice > 0 ? b.totalPrice : '';
    upiIdInput.value = (b.upiQrPayload && b.upiQrPayload.upiId) || 'zerospottn37@okaxis';
    upiPayeeInput.value = 'Zero Spot Cleaning & Solutions';

    updateUpiPreview();
    if (upiQrModal) {
      upiQrModal.classList.add('open');
      upiQrModal.style.display = 'flex';
      upiQrModal.style.opacity = '1';
      upiQrModal.style.pointerEvents = 'auto';
    }
  };

  const closeUpiModal = () => {
    if (upiQrModal) {
      upiQrModal.classList.remove('open');
      upiQrModal.style.display = 'none';
    }
    currentUpiBooking = null;
  };

  closeUpiQrModalBtn?.addEventListener('click', closeUpiModal);
  cancelUpiQrBtn?.addEventListener('click', closeUpiModal);

  btnPreviewLiveInvoice?.addEventListener('click', () => {
    if (currentUpiBooking) {
      window.open(`/api/invoices/${currentUpiBooking.id}/html`, '_blank');
    }
  });

  btnSendQrInvoiceSubmit?.addEventListener('click', async () => {
    if (!currentUpiBooking) return;
    const amount = Number(upiAmountInput.value || 0);
    if (amount <= 0) {
      showToast('Amount Required', 'Please enter the confirmed quote amount decided over phone call.', 'error');
      upiAmountInput.focus();
      return;
    }

    const customerName = document.getElementById('upiCustomerNameInput')?.value.trim() || currentUpiBooking.customerName || 'Customer';
    const customerEmail = document.getElementById('upiCustomerEmailInput')?.value.trim() || currentUpiBooking.customerEmail || '';
    const taxMode = document.getElementById('upiTaxModeInput')?.value || 'inclusive';
    const paymentMethod = document.getElementById('upiPaymentMethodInput')?.value || 'Pay via UPI QR (GPay / PhonePe / Paytm / BHIM)';
    const customerCompanyName = document.getElementById('upiCompanyInput')?.value.trim() || '';
    const customerGstin = (document.getElementById('upiGstinInput')?.value.trim() || '').toUpperCase();

    const upiId = upiIdInput.value.trim() || 'zerospottn37@okaxis';
    const payeeName = upiPayeeInput.value.trim() || 'Zero Spot Cleaning & Solutions';

    btnSendQrInvoiceSubmit.disabled = true;
    btnSendQrInvoiceSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Dispatching QR &amp; Invoice...';

    try {
      const res = await fetch(`/api/admin/bookings/${currentUpiBooking.id}/send-invoice-qr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          customerName,
          customerEmail,
          taxMode,
          paymentMethod,
          customerCompanyName,
          customerGstin,
          upiId,
          payeeName,
          note: `Zero Spot #${currentUpiBooking.id}`,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast('Dispatched Successfully', `Invoice & Payment instructions sent to ${customerEmail || customerName} and Customer App.`);
        closeUpiModal();
        await loadBookings();
      } else {
        showToast('Error', data.error || 'Failed to dispatch invoice & QR', 'error');
      }
    } catch (err) {
      showToast('Dispatch Error', err.message, 'error');
    } finally {
      btnSendQrInvoiceSubmit.disabled = false;
      btnSendQrInvoiceSubmit.innerHTML = '<i class="fa-solid fa-paper-plane"></i> <span>Send QR &amp; Invoice to Customer (App &amp; Email)</span>';
    }
  });

  // ─── 1. CUSTOMER SERVICE DESK CONTROLLER ───────────────────────────
  let activeConvId = null;
  let supportConversations = [];
  const supportConvListEl = document.getElementById('supportConversationList');
  const supportChatCustomerName = document.getElementById('supportChatCustomerName');
  const supportChatCustomerMeta = document.getElementById('supportChatCustomerMeta');
  const supportMessagesStream = document.getElementById('supportMessagesStream');
  const supportReplyForm = document.getElementById('supportReplyForm');
  const supportReplyInput = document.getElementById('supportReplyInput');
  const supportSendBtn = document.getElementById('supportSendBtn');
  const supportChatActions = document.getElementById('supportChatActions');
  const btnResolveChat = document.getElementById('btnResolveChat');
  const supportNavBadge = document.getElementById('supportNavBadge');
  const refreshSupportBtn = document.getElementById('refreshSupportBtn');

  async function loadSupportConversations() {
    try {
      const res = await fetch('/api/support/conversations');
      const data = await res.json();
      if (!data.success) return;

      supportConversations = data.data || [];
      const openCount = supportConversations.filter(c => c.status !== 'resolved').length;
      const totalUnread = supportConversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);

      const countEl = document.getElementById('supportTotalConversations');
      if (countEl) countEl.textContent = `${openCount} open`;

      if (supportNavBadge) {
        if (totalUnread > 0) {
          supportNavBadge.textContent = totalUnread;
          supportNavBadge.style.display = 'inline-flex';
        } else {
          supportNavBadge.style.display = 'none';
        }
      }

      renderSupportConversationList();

      // If a conversation is already active, refresh its messages
      if (activeConvId) {
        loadConversationMessages(activeConvId, false);
      }
    } catch (err) {
      console.warn('[Support Desk Error]:', err.message);
    }
  }

  function renderSupportConversationList() {
    if (!supportConvListEl) return;
    if (!supportConversations.length) {
      supportConvListEl.innerHTML = `
        <div style="text-align:center; padding:30px 16px; color:#94a3b8; font-size:0.85rem;">
          <i class="fa-solid fa-inbox" style="font-size:1.8rem; margin-bottom:8px; display:block; color:#cbd5e1;"></i>
          No active customer inquiries yet.
        </div>`;
      return;
    }

    supportConvListEl.innerHTML = supportConversations.map(c => {
      const isActive = c.id === activeConvId;
      const timeStr = c.lastUpdated ? new Date(c.lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      return `
        <div class="support-conv-card ${isActive ? 'active' : ''}" data-conv-id="${c.id}" style="padding:12px 14px; border-radius:10px; margin-bottom:6px; cursor:pointer; background:${isActive ? '#eff6ff' : '#ffffff'}; border:1px solid ${isActive ? '#93c5fd' : '#e2e8f0'}; transition:all 0.15s ease;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:4px;">
            <strong style="font-size:0.86rem; color:#0f172a;">${c.customerName || 'Customer'}</strong>
            <span style="font-size:0.72rem; color:#94a3b8;">${timeStr}</span>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <p style="margin:0; font-size:0.78rem; color:#64748b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:210px;">
              ${c.lastMessage || 'New inquiry'}
            </p>
            ${c.unreadCount > 0 ? `<span style="background:#ef4444; color:#fff; font-size:0.7rem; font-weight:700; padding:1px 6px; border-radius:10px;">${c.unreadCount}</span>` : ''}
            ${c.status === 'resolved' ? `<span style="background:#f1f5f9; color:#64748b; font-size:0.68rem; font-weight:700; padding:1px 6px; border-radius:8px;">Resolved</span>` : ''}
          </div>
        </div>`;
    }).join('');

    supportConvListEl.querySelectorAll('.support-conv-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.convId;
        openConversation(id);
      });
    });
  }

  async function openConversation(convId) {
    activeConvId = convId;
    renderSupportConversationList();

    const conv = supportConversations.find(c => c.id === convId);
    if (!conv) return;

    if (supportChatCustomerName) supportChatCustomerName.textContent = conv.customerName || 'Customer';
    if (supportChatCustomerMeta) {
      const contactInfo = [conv.customerEmail, conv.customerPhone].filter(Boolean).join(' · ');
      supportChatCustomerMeta.textContent = contactInfo || 'Zero Spot App Customer';
    }
    if (supportChatActions) supportChatActions.style.display = 'flex';
    if (supportReplyInput) {
      supportReplyInput.disabled = false;
      supportReplyInput.focus();
    }
    if (supportSendBtn) supportSendBtn.disabled = false;

    await loadConversationMessages(convId, true);
  }

  async function loadConversationMessages(convId, scrollToBottom = false) {
    try {
      const res = await fetch(`/api/support/messages?conversationId=${encodeURIComponent(convId)}`);
      const data = await res.json();
      if (!data.success || !supportMessagesStream) return;

      const msgs = data.data || [];
      if (!msgs.length) {
        supportMessagesStream.innerHTML = '<div style="text-align:center; padding:20px; color:#94a3b8; font-size:0.85rem;">No messages in this inquiry yet.</div>';
        return;
      }

      supportMessagesStream.innerHTML = msgs.map(m => {
        const isAdmin = m.sender === 'admin';
        const isBot = m.sender === 'bot';
        const align = isAdmin ? 'flex-end' : 'flex-start';
        const bg = isAdmin ? '#075cf8' : (isBot ? '#f0fdf4' : '#f1f5f9');
        const color = isAdmin ? '#ffffff' : '#0f172a';
        const border = isBot ? '1px solid #bbf7d0' : 'none';
        const time = m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

        return `
          <div style="display:flex; flex-direction:column; align-items:${align}; max-width:75%; align-self:${align};">
            <span style="font-size:0.68rem; color:#94a3b8; margin-bottom:2px; padding:0 4px;">
              ${m.senderName || (isAdmin ? 'Operations Lead' : 'Customer')} · ${time}
            </span>
            <div style="background:${bg}; color:${color}; border:${border}; padding:10px 14px; border-radius:12px; font-size:0.85rem; line-height:1.45; word-break:break-word; box-shadow:0 1px 3px rgba(0,0,0,0.04);">
              ${m.text}
            </div>
          </div>`;
      }).join('');

      if (scrollToBottom) {
        supportMessagesStream.scrollTop = supportMessagesStream.scrollHeight;
      }
    } catch (err) {
      console.warn('[Messages Load Error]:', err.message);
    }
  }

  supportReplyForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeConvId) return;
    const text = supportReplyInput.value.trim();
    if (!text) return;

    supportReplyInput.value = '';
    supportSendBtn.disabled = true;

    try {
      const res = await fetch('/api/support/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: activeConvId,
          sender: 'admin',
          senderName: 'Operations Lead',
          text,
        }),
      });
      const data = await res.json();
      if (data.success) {
        await loadConversationMessages(activeConvId, true);
        await loadSupportConversations();
      } else {
        showToast('Error', data.error || 'Failed to send message', 'error');
      }
    } catch (err) {
      showToast('Error', err.message, 'error');
    } finally {
      supportSendBtn.disabled = false;
      supportReplyInput.focus();
    }
  });

  document.querySelectorAll('.canned-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!activeConvId) {
        showToast('Notice', 'Please select a customer conversation first.', 'info');
        return;
      }
      if (supportReplyInput) {
        supportReplyInput.value = btn.dataset.reply || '';
        supportReplyInput.focus();
      }
    });
  });

  btnResolveChat?.addEventListener('click', async () => {
    if (!activeConvId) return;
    try {
      const res = await fetch(`/api/support/conversations/${activeConvId}/resolve`, {
        method: 'PATCH',
      });
      const data = await res.json();
      if (data.success) {
        showToast('Inquiry Resolved', 'Conversation marked as resolved.', 'success');
        await loadSupportConversations();
      }
    } catch (err) {
      showToast('Error', 'Failed to resolve inquiry', 'error');
    }
  });

  refreshSupportBtn?.addEventListener('click', () => {
    loadSupportConversations();
    showToast('Refreshed', 'Customer service messages updated.');
  });


  // ─── 2. INVOICE STUDIO & GENERATOR CONTROLLER ──────────────────────
  let studioItems = [
    { description: 'Logo Deep Carpet Shampoo', quantity: 1, price: 500 },
    { description: 'Banner Mechanized Scrub (2x6m)', quantity: 2, price: 45 },
    { description: 'Poster Hydrophobic Polish (1x2m)', quantity: 3, price: 55 },
  ];

  const invStudioItemsList = document.getElementById('invStudioItemsList');
  const btnAddStudioItem = document.getElementById('btnAddStudioItem');
  const invPreviewBox = document.getElementById('invPreviewBox');
  const invoiceBookingPicker = document.getElementById('invoiceBookingPicker');
  const btnResetInvoice = document.getElementById('btnResetInvoice');
  const btnPreviewStudioInvoice = document.getElementById('btnPreviewStudioInvoice');
  const btnDispatchStudioEmail = document.getElementById('btnDispatchStudioEmail');

  const invStudioNumber = document.getElementById('invStudioNumber');
  const invStudioDate = document.getElementById('invStudioDate');
  const invStudioCustName = document.getElementById('invStudioCustName');
  const invStudioCustEmail = document.getElementById('invStudioCustEmail');
  const invStudioCustAddress = document.getElementById('invStudioCustAddress');
  const invStudioCustPhone = document.getElementById('invStudioCustPhone');
  const invStudioPaymentMethod = document.getElementById('invStudioPaymentMethod');
  const invStudioTaxMode = document.getElementById('invStudioTaxMode');
  const invStudioNote = document.getElementById('invStudioNote');

  function initInvoiceStudio() {
    renderStudioItemsList();
    updateStudioLivePreview();
    populateInvoiceBookingPicker();
  }

  function populateInvoiceBookingPicker() {
    if (!invoiceBookingPicker) return;
    invoiceBookingPicker.innerHTML = '<option value="">Load from existing booking...</option>' +
      (bookings || []).map(b => `
        <option value="${b.id}">#${b.id} — ${b.customerName || 'Client'} (${b.serviceTitle || b.services || 'Service'})</option>
      `).join('');
  }

  function renderStudioItemsList() {
    if (!invStudioItemsList) return;
    invStudioItemsList.innerHTML = studioItems.map((item, idx) => `
      <div style="display:grid; grid-template-columns: 1fr 70px 90px 30px; gap:8px; align-items:center;">
        <input type="text" class="item-desc" data-idx="${idx}" value="${item.description}" placeholder="Description" style="padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.8rem;">
        <input type="number" class="item-qty" data-idx="${idx}" value="${item.quantity}" min="1" placeholder="Qty" style="padding:6px 8px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.8rem; text-align:center;">
        <input type="number" class="item-price" data-idx="${idx}" value="${item.price}" min="0" placeholder="Price" style="padding:6px 8px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.8rem; text-align:right;">
        <button type="button" class="btn-del-item" data-idx="${idx}" style="background:none; border:none; color:#ef4444; font-size:1rem; cursor:pointer;" title="Remove Item">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
    `).join('');

    invStudioItemsList.querySelectorAll('.item-desc').forEach(input => {
      input.addEventListener('input', (e) => {
        studioItems[e.target.dataset.idx].description = e.target.value;
        updateStudioLivePreview();
      });
    });
    invStudioItemsList.querySelectorAll('.item-qty').forEach(input => {
      input.addEventListener('input', (e) => {
        studioItems[e.target.dataset.idx].quantity = Number(e.target.value) || 1;
        updateStudioLivePreview();
      });
    });
    invStudioItemsList.querySelectorAll('.item-price').forEach(input => {
      input.addEventListener('input', (e) => {
        studioItems[e.target.dataset.idx].price = Number(e.target.value) || 0;
        updateStudioLivePreview();
      });
    });
    invStudioItemsList.querySelectorAll('.btn-del-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = Number(btn.dataset.idx);
        if (studioItems.length <= 1) {
          showToast('Notice', 'At least one line item is required.', 'info');
          return;
        }
        studioItems.splice(idx, 1);
        renderStudioItemsList();
        updateStudioLivePreview();
      });
    });
  }

  btnAddStudioItem?.addEventListener('click', () => {
    studioItems.push({ description: 'Additional Service Item', quantity: 1, price: 100 });
    renderStudioItemsList();
    updateStudioLivePreview();
  });

  [invStudioNumber, invStudioDate, invStudioCustName, invStudioCustEmail, invStudioCustAddress, invStudioCustPhone, invStudioPaymentMethod, invStudioTaxMode, invStudioNote].forEach(el => {
    el?.addEventListener('input', updateStudioLivePreview);
    el?.addEventListener('change', updateStudioLivePreview);
  });

  invoiceBookingPicker?.addEventListener('change', (e) => {
    const bookingId = e.target.value;
    if (!bookingId) return;
    const b = (bookings || []).find(x => x.id === bookingId);
    if (!b) return;

    if (invStudioNumber) invStudioNumber.value = b.invoiceNumber || `NO. ${b.id.replace(/[^0-9]/g, '') || '000001'}`;
    if (invStudioDate) invStudioDate.value = b.dateDay || b.date || new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
    if (invStudioCustName) invStudioCustName.value = b.customerName || '';
    if (invStudioCustEmail) invStudioCustEmail.value = b.customerEmail || '';
    if (invStudioCustAddress) invStudioCustAddress.value = b.address || '';
    if (invStudioCustPhone) invStudioCustPhone.value = b.customerPhone || '';
    if (invStudioPaymentMethod) invStudioPaymentMethod.value = b.paymentMethod || 'Cash';
    if (invStudioTaxMode) invStudioTaxMode.value = b.taxMode || 'inclusive';

    studioItems = [
      {
        description: b.serviceTitle || b.services || 'Professional Cleaning Service',
        quantity: 1,
        price: b.totalPrice || b.price || 500,
      }
    ];
    renderStudioItemsList();
    updateStudioLivePreview();
    showToast('Loaded', `Loaded details from Booking #${b.id}`);
  });

  btnResetInvoice?.addEventListener('click', () => {
    studioItems = [
      { description: 'Logo', quantity: 1, price: 500 },
      { description: 'Banner (2x6m)', quantity: 2, price: 45 },
      { description: 'Poster (1x2m)', quantity: 3, price: 55 },
    ];
    if (invStudioNumber) invStudioNumber.value = 'NO. 000001';
    if (invStudioDate) invStudioDate.value = '02 June, 2030';
    if (invStudioCustName) invStudioCustName.value = 'Studio Shodwe';
    if (invStudioCustEmail) invStudioCustEmail.value = 'hello@reallygreatsite.com';
    if (invStudioCustAddress) invStudioCustAddress.value = '123 Anywhere St., Any City';
    if (invStudioCustPhone) invStudioCustPhone.value = '+91 89400 51100';
    if (invStudioPaymentMethod) invStudioPaymentMethod.value = 'Cash';
    if (invStudioTaxMode) invStudioTaxMode.value = 'exempt';
    if (invStudioNote) invStudioNote.value = 'Thank you for choosing us!';
    renderStudioItemsList();
    updateStudioLivePreview();
  });

  function updateStudioLivePreview() {
    if (!invPreviewBox) return;

    const invNo = invStudioNumber?.value || 'NO. 000001';
    const invDate = invStudioDate?.value || '02 June, 2030';
    const custName = invStudioCustName?.value || 'Studio Shodwe';
    const custEmail = invStudioCustEmail?.value || 'hello@reallygreatsite.com';
    const custAddress = invStudioCustAddress?.value || '123 Anywhere St., Any City';
    const payMethod = invStudioPaymentMethod?.value || 'Cash';
    const note = invStudioNote?.value || 'Thank you for choosing us!';
    const taxMode = invStudioTaxMode?.value || 'exempt';

    let subtotal = 0;
    const rowsHtml = studioItems.map(item => {
      const lineTotal = (Number(item.quantity) || 1) * (Number(item.price) || 0);
      subtotal += lineTotal;
      return `
        <tr>
          <td style="padding:10px 14px; font-size:13px; color:#1e293b; border-bottom:1px solid #f1f5f9;">${item.description}</td>
          <td style="padding:10px 14px; font-size:13px; color:#475569; text-align:center; border-bottom:1px solid #f1f5f9;">${item.quantity}</td>
          <td style="padding:10px 14px; font-size:13px; color:#475569; text-align:right; border-bottom:1px solid #f1f5f9;">₹${Number(item.price).toLocaleString('en-IN')}</td>
          <td style="padding:10px 14px; font-size:13px; font-weight:700; color:#0f172a; text-align:right; border-bottom:1px solid #f1f5f9;">₹${lineTotal.toLocaleString('en-IN')}</td>
        </tr>`;
    }).join('');

    let grandTotal = subtotal;
    if (taxMode === 'exclusive') {
      grandTotal = Math.round(subtotal * 1.18);
    }

    invPreviewBox.innerHTML = `
      <!-- Top Bar -->
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:28px;">
        <div>
          <div style="font-size:13px; font-weight:900; letter-spacing:1px; color:#111827; text-transform:uppercase;">ZERO SPOT</div>
          <div style="font-size:9px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:1px; margin-top:2px;">Cleaning &amp; Solutions</div>
        </div>
        <div style="font-size:13px; font-weight:800; letter-spacing:1px; color:#111827;">${invNo}</div>
      </div>

      <!-- Title & Date -->
      <h2 style="font-size:38px; font-weight:900; letter-spacing:-0.5px; color:#111827; margin:0 0 14px 0; text-transform:uppercase; line-height:1;">INVOICE</h2>
      <div style="font-size:13px; color:#111827; margin-bottom:28px;"><strong>Date:</strong> ${invDate}</div>

      <!-- Parties Grid -->
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:24px; margin-bottom:32px;">
        <div>
          <h4 style="margin:0 0 6px 0; font-size:13px; font-weight:800; color:#111827;">Billed to:</h4>
          <p style="margin:0; font-size:12px; line-height:18px; color:#374151;">
            <strong>${custName}</strong><br>
            ${custAddress}<br>
            ${custEmail}
          </p>
        </div>
        <div>
          <h4 style="margin:0 0 6px 0; font-size:13px; font-weight:800; color:#111827;">From:</h4>
          <p style="margin:0; font-size:12px; line-height:18px; color:#374151;">
            <strong>Cleaning and solution</strong><br>
            Indiranagar &amp; Coimbatore<br>
            hello@zerospot.com
          </p>
        </div>
      </div>

      <!-- Items Table with Pill Header -->
      <table style="width:100%; border-collapse:collapse; margin-bottom:10px;">
        <thead>
          <tr style="background:#efefef;">
            <th style="padding:10px 14px; font-size:12px; font-weight:700; color:#111827; text-align:left; border-top-left-radius:4px; border-bottom-left-radius:4px;">Item</th>
            <th style="padding:10px 14px; font-size:12px; font-weight:700; color:#111827; text-align:center;">Quantity</th>
            <th style="padding:10px 14px; font-size:12px; font-weight:700; color:#111827; text-align:right;">Price</th>
            <th style="padding:10px 14px; font-size:12px; font-weight:700; color:#111827; text-align:right; border-top-right-radius:4px; border-bottom-right-radius:4px;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <!-- Total -->
      <div style="border-top:1px solid #e2e8f0; padding-top:12px; display:flex; justify-content:flex-end; align-items:baseline; gap:24px; margin-bottom:28px;">
        <span style="font-size:14px; font-weight:800; color:#111827;">Total</span>
        <span style="font-size:16px; font-weight:900; color:#111827;">₹${grandTotal.toLocaleString('en-IN')}</span>
      </div>

      <!-- Payment & Note -->
      <div style="font-size:12px; line-height:20px; color:#111827; position:relative; z-index:2;">
        <p style="margin:0 0 4px 0;"><strong>Payment method:</strong> ${payMethod}</p>
        <p style="margin:0;"><strong>Note:</strong> ${note}</p>
      </div>

      <!-- Bottom Organic Wave SVG matching image -->
      <div style="position:absolute; bottom:0; right:0; width:260px; height:180px; pointer-events:none; z-index:1;" aria-hidden="true">
        <svg viewBox="0 0 320 220" width="100%" height="100%" fill="none" preserveAspectRatio="none">
          <path d="M 0 220 C 100 215 130 150 200 130 C 260 110 290 120 320 100 L 320 220 Z" fill="#C5CBD3" />
          <path d="M 40 220 C 130 220 160 185 220 170 C 270 155 295 160 320 145 L 320 220 Z" fill="#363A40" />
        </svg>
      </div>`;
  }

  btnPreviewStudioInvoice?.addEventListener('click', async () => {
    const payload = collectStudioInvoicePayload();
    try {
      btnPreviewStudioInvoice.disabled = true;
      const res = await fetch('/api/admin/invoices/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        window.open(`/api/invoices/${encodeURIComponent(payload.invoiceNumber)}/html`, '_blank');
      } else {
        showToast('Error', data.error || 'Failed to generate invoice', 'error');
      }
    } catch (err) {
      showToast('Error', err.message, 'error');
    } finally {
      btnPreviewStudioInvoice.disabled = false;
    }
  });

  btnDispatchStudioEmail?.addEventListener('click', async () => {
    const payload = collectStudioInvoicePayload();
    if (!payload.billedTo.email) {
      showToast('Email Required', 'Please provide the client email address to dispatch the invoice.', 'error');
      invStudioCustEmail?.focus();
      return;
    }

    try {
      btnDispatchStudioEmail.disabled = true;
      btnDispatchStudioEmail.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Dispatching Email...';

      // 1. Generate / save
      const genRes = await fetch('/api/admin/invoices/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const genData = await genRes.json();
      if (!genData.success) throw new Error(genData.error || 'Generation failed');

      // 2. Dispatch
      const dispRes = await fetch('/api/admin/invoices/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceData: genData.data }),
      });
      const dispData = await dispRes.json();
      if (dispData.success) {
        showToast('Invoice Dispatched', `Invoice #${payload.invoiceNumber} emailed to ${payload.billedTo.email}`, 'success');
      } else {
        showToast('Error', dispData.error || 'Failed to send email', 'error');
      }
    } catch (err) {
      showToast('Dispatch Error', err.message, 'error');
    } finally {
      btnDispatchStudioEmail.disabled = false;
      btnDispatchStudioEmail.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send to Customer Email';
    }
  });

  function collectStudioInvoicePayload() {
    return {
      invoiceNumber: invStudioNumber?.value.trim() || 'NO. 000001',
      date: invStudioDate?.value.trim() || '02 June, 2030',
      billedTo: {
        name: invStudioCustName?.value.trim() || 'Valued Client',
        email: invStudioCustEmail?.value.trim() || '',
        address: invStudioCustAddress?.value.trim() || '',
        phone: invStudioCustPhone?.value.trim() || '',
      },
      from: {
        name: 'Cleaning and solution',
        address: 'Indiranagar & Coimbatore',
        email: 'hello@zerospot.com',
        phone: '+91 89400 51100',
      },
      lineItems: studioItems.map(item => ({
        description: item.description,
        quantity: Number(item.quantity) || 1,
        unitPrice: Number(item.price) || 0,
        total: (Number(item.quantity) || 1) * (Number(item.price) || 0),
      })),
      taxMode: invStudioTaxMode?.value || 'exempt',
      taxRate: invStudioTaxMode?.value !== 'exempt' ? 0.18 : 0,
      paymentMethod: invStudioPaymentMethod?.value || 'Cash',
      notes: invStudioNote?.value.trim() || 'Thank you for choosing us!',
    };
  }

  // Automated 10-Second Live Polling for Customer, Invoices, Support & Google Sheets Sync
  setInterval(() => {
    loadBookings();
    loadStats();
    loadSupportConversations();
  }, 10000);

  // Load initial bookings, partners, customers, and support
  loadBookings();
  loadStats();
  loadAdminPartners();
  loadCustomers();
  loadSupportConversations();
  initInvoiceStudio();
});
