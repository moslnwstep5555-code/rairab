'use strict';

// ==================== CONSTANTS ====================
const APP_VERSION  = '1.3.0';
const STORAGE_KEY  = 'rairab_v1';

const EXPENSE_CATS = [
  { id: 'food',          name: 'อาหาร',     icon: '🍔' },
  { id: 'transport',     name: 'เดินทาง',   icon: '🚗' },
  { id: 'fuel',          name: 'น้ำมัน',    icon: '⛽' },
  { id: 'shopping',      name: 'ช้อปปิ้ง',  icon: '🛍️' },
  { id: 'health',        name: 'สุขภาพ',    icon: '💊' },
  { id: 'entertainment', name: 'บันเทิง',   icon: '🎮' },
  { id: 'utility',       name: 'น้ำ-ไฟ',    icon: '⚡' },
  { id: 'education',     name: 'การศึกษา',  icon: '📚' },
  { id: 'other_exp',     name: 'อื่นๆ',     icon: '📦' },
];

const INCOME_CATS = [
  { id: 'salary',    name: 'เงินเดือน', icon: '💼' },
  { id: 'business',  name: 'ธุรกิจ',    icon: '🏪' },
  { id: 'invest',    name: 'ลงทุน',     icon: '📈' },
  { id: 'freelance', name: 'Freelance', icon: '💻' },
  { id: 'gift',      name: 'ของขวัญ',  icon: '🎁' },
  { id: 'bonus',     name: 'โบนัส',    icon: '🎉' },
  { id: 'rental',    name: 'ให้เช่า',   icon: '🏠' },
  { id: 'other_inc', name: 'อื่นๆ',     icon: '💰' },
];

const CHART_COLORS = [
  '#FF6B6B','#4ECDC4','#45B7D1','#96CEB4',
  '#FFEAA7','#DDA0DD','#98D8C8','#F7DC6F',
];

// ==================== STATE ====================
let appData = { transactions: [], loans: [], notes: [], splits: [], govPrograms: [], budgets: {}, recurring: [] };

// income/expense form
let selectedType = 'expense';
let selectedCat  = null;

// loan form
let loanDirection  = 'lend';
let currentLoanTab = 'active';

// modals
let modalTxId   = null;
let modalLoanId = null;
let payModalType = null; // 'interest' | 'principal'

// split bills
let splitPaidBy     = 'me';
let splitType       = 'equal';
let currentSplitTab = 'pending';
let modalSplitId    = null;

let charts = {};

// ==================== PIN LOCK ====================
const PIN_KEY = 'rairab_pin';
let pinBuffer = '';
let pinMode   = 'unlock'; // 'unlock' | 'set' | 'confirm'
let pinTemp   = '';

function initPin() {
  const stored = localStorage.getItem(PIN_KEY);
  if (!stored) {
    pinMode = 'set';
    document.getElementById('pin-subtitle').textContent = 'ตั้ง PIN 4 หลัก';
  } else {
    pinMode = 'unlock';
  }
}

function pinInput(digit) {
  if (pinBuffer.length >= 4) return;
  pinBuffer += digit;
  updatePinDots();
  if (pinBuffer.length === 4) setTimeout(processPIN, 200);
}

function pinDelete() {
  pinBuffer = pinBuffer.slice(0, -1);
  updatePinDots();
  document.getElementById('pin-error').textContent = '';
}

function updatePinDots() {
  document.querySelectorAll('.dot').forEach((d, i) =>
    d.classList.toggle('filled', i < pinBuffer.length)
  );
}

function processPIN() {
  if (pinMode === 'set') {
    pinTemp   = pinBuffer;
    pinBuffer = '';
    updatePinDots();
    pinMode = 'confirm';
    document.getElementById('pin-subtitle').textContent = 'กรอก PIN อีกครั้งเพื่อยืนยัน';
  } else if (pinMode === 'confirm') {
    if (pinBuffer === pinTemp) {
      localStorage.setItem(PIN_KEY, pinBuffer);
      unlockApp();
    } else {
      pinShakeError('PIN ไม่ตรงกัน ลองใหม่');
      pinMode = 'set'; pinTemp = '';
      document.getElementById('pin-subtitle').textContent = 'ตั้ง PIN 4 หลัก';
    }
  } else {
    if (pinBuffer === localStorage.getItem(PIN_KEY)) {
      unlockApp();
    } else {
      pinShakeError('PIN ไม่ถูกต้อง');
    }
  }
}

function pinShakeError(msg) {
  document.getElementById('pin-error').textContent = msg;
  const dots = document.getElementById('pin-dots');
  dots.classList.add('shake');
  setTimeout(() => dots.classList.remove('shake'), 500);
  pinBuffer = '';
  updatePinDots();
}

function unlockApp() {
  const el = document.getElementById('pin-screen');
  el.classList.add('hide');
  setTimeout(() => el.style.display = 'none', 300);
}

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => {
  applyTheme();
  loadData();
  initGovPrograms();
  checkRecurring();
  checkLoanNotifications();
  bindEvents();
  resetAddForm();
  updateDashboard();
  registerSW();
  initPin();
});

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      appData = JSON.parse(raw);
      if (!appData.loans) appData.loans = [];
      if (!appData.notes)   appData.notes  = [];
      if (!appData.splits)       appData.splits       = [];
      if (!appData.govPrograms)  appData.govPrograms  = [];
      if (!appData.budgets)      appData.budgets      = {};
      if (!appData.recurring)    appData.recurring    = [];
      appData.loans.forEach(l => { if (!l.payments) l.payments = []; });
      initGovPrograms();
    }
  } catch(e) {
    appData = { transactions: [], loans: [] };
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ==================== NAVIGATION ====================
function goTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  document.getElementById(`page-${page}`)?.classList.add('active');
  const navBtn = document.querySelector(`.nav-btn[data-page="${page}"]`);
  if (navBtn) navBtn.classList.add('active');

  if (page === 'add')       resetAddForm();
  if (page === 'history')   renderHistory();
  if (page === 'dashboard') updateDashboard();
  if (page === 'loans')     renderLoans();
  if (page === 'add-loan')  resetLoanForm();
  if (page === 'notes')      renderNotes();
  if (page === 'split')          renderSplits();
  if (page === 'add-split')      resetSplitForm();
  if (page === 'govt')           renderGovPage();
  if (page === 'add-govprog')    resetGovProgForm();
  if (page === 'settings')       renderSettingsPage();
  if (page === 'budget')         renderBudgetPage();
  if (page === 'recurring')      renderRecurringPage();
  if (page === 'add-recurring')  resetRecurringForm();
}

// ==================== EVENT BINDING ====================
function bindEvents() {
  // Nav buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => { if (btn.dataset.page) goTo(btn.dataset.page); });
  });

  // Month prev/next
  document.getElementById('btn-prev-month').addEventListener('click', () => {
    viewMonth--;
    if (viewMonth < 0) { viewMonth = 11; viewYear--; }
    updateDashboard();
  });
  document.getElementById('btn-next-month').addEventListener('click', () => {
    viewMonth++;
    if (viewMonth > 11) { viewMonth = 0; viewYear++; }
    updateDashboard();
  });

  // Income/expense type toggle
  document.querySelectorAll('[data-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedType = btn.dataset.type;
      selectedCat  = null;
      updateTypeUI();
    });
  });

  // Save transaction
  document.getElementById('btn-save').addEventListener('click', saveTransaction);

  // Search
  document.getElementById('search-input').addEventListener('input', e => {
    renderHistory(e.target.value);
  });

  // Transaction modal
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target.id === 'modal-overlay') closeModal();
  });
  document.getElementById('btn-delete').addEventListener('click', deleteTransaction);
  document.getElementById('btn-cancel-modal').addEventListener('click', closeModal);

  // Notes
  document.getElementById('btn-save-note').addEventListener('click', saveNote);
  document.getElementById('note-text-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.ctrlKey) saveNote();
  });

  // Demo data
  document.getElementById('btn-load-demo').addEventListener('click', loadDemoData);

  // --- LOAN EVENTS ---
  document.getElementById('btn-add-loan').addEventListener('click', () => goTo('add-loan'));
  document.getElementById('btn-back-loans').addEventListener('click', () => goTo('loans'));

  // Loan direction toggle
  document.querySelectorAll('[data-ltype]').forEach(btn => {
    btn.addEventListener('click', () => {
      loanDirection = btn.dataset.ltype;
      updateLoanTypeUI();
    });
  });

  // Loan tabs
  document.querySelectorAll('.loan-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      currentLoanTab = tab.dataset.ltab;
      document.querySelectorAll('.loan-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderLoans();
    });
  });

  // Save loan
  document.getElementById('btn-save-loan').addEventListener('click', saveLoan);

  // Loan modal
  document.getElementById('loan-modal-overlay').addEventListener('click', e => {
    if (e.target.id === 'loan-modal-overlay') closeLoanModal();
  });
  document.getElementById('btn-return-loan').addEventListener('click', returnLoan);
  document.getElementById('btn-delete-loan').addEventListener('click', deleteLoan);
  document.getElementById('btn-cancel-loan-modal').addEventListener('click', closeLoanModal);
  document.getElementById('btn-pay-interest').addEventListener('click', () => openPayModal('interest'));
  document.getElementById('btn-pay-partial').addEventListener('click', () => openPayModal('principal'));

  // Pay modal
  document.getElementById('pay-modal-overlay').addEventListener('click', e => {
    if (e.target.id === 'pay-modal-overlay') closePayModal();
  });
  document.getElementById('btn-confirm-pay').addEventListener('click', confirmPay);
  document.getElementById('btn-cancel-pay').addEventListener('click', closePayModal);

  // Split bills
  document.getElementById('btn-add-split').addEventListener('click', () => goTo('add-split'));
  document.getElementById('btn-back-split').addEventListener('click', () => goTo('split'));
  document.getElementById('btn-save-split').addEventListener('click', saveSplit);

  document.querySelectorAll('[data-paidby]').forEach(btn => {
    btn.addEventListener('click', () => { splitPaidBy = btn.dataset.paidby; updateSplitPaidByUI(); });
  });
  document.querySelectorAll('[data-stype]').forEach(btn => {
    btn.addEventListener('click', () => { splitType = btn.dataset.stype; updateSplitTypeUI(); });
  });
  document.querySelectorAll('[data-stab]').forEach(tab => {
    tab.addEventListener('click', () => {
      currentSplitTab = tab.dataset.stab;
      document.querySelectorAll('[data-stab]').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderSplits();
    });
  });

  document.getElementById('split-my-pct').addEventListener('input', e => {
    const v = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
    document.getElementById('split-spouse-pct').value = 100 - v;
    updateRatioPreview();
  });
  document.getElementById('split-spouse-pct').addEventListener('input', e => {
    const v = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
    document.getElementById('split-my-pct').value = 100 - v;
    updateRatioPreview();
  });
  document.getElementById('split-amount').addEventListener('input', updateRatioPreview);

  // Budget
  document.getElementById('btn-save-budget').addEventListener('click', saveBudget);

  // Recurring
  document.getElementById('btn-add-recurring').addEventListener('click', () => goTo('add-recurring'));
  document.getElementById('btn-save-recurring').addEventListener('click', saveRecurring);
  document.querySelectorAll('[data-rtype]').forEach(btn => {
    btn.addEventListener('click', () => { recurringType = btn.dataset.rtype; updateRecurringTypeUI(); });
  });

  // Govt programs
  document.getElementById('btn-add-govprog').addEventListener('click', () => goTo('add-govprog'));
  document.getElementById('btn-back-govprog').addEventListener('click', () => goTo('govt'));
  document.getElementById('btn-save-govprog').addEventListener('click', saveGovProg);
  document.getElementById('govt-spend-modal').addEventListener('click', e => {
    if (e.target.id === 'govt-spend-modal') closeGovSpendModal();
  });
  document.getElementById('govt-spend-amount').addEventListener('input', calcGovSpendBreakdown);
  document.getElementById('govt-spend-date').addEventListener('change', calcGovSpendBreakdown);
  document.getElementById('btn-confirm-govt-spend').addEventListener('click', confirmGovSpend);
  document.getElementById('btn-cancel-govt-spend').addEventListener('click', closeGovSpendModal);

  // Split modal
  document.getElementById('split-modal-overlay').addEventListener('click', e => {
    if (e.target.id === 'split-modal-overlay') closeSplitModal();
  });
  document.getElementById('btn-settle-split').addEventListener('click', settleSplit);
  document.getElementById('btn-delete-split').addEventListener('click', deleteSplitItem);
  document.getElementById('btn-cancel-split-modal').addEventListener('click', closeSplitModal);
}

// ==================== MONTH STATE ====================
let viewMonth = new Date().getMonth();
let viewYear  = new Date().getFullYear();

// ==================== ADD TRANSACTION ====================
function updateTypeUI() {
  document.querySelectorAll('[data-type]').forEach(btn => {
    btn.className = 'type-btn';
    if (btn.dataset.type === selectedType) btn.className = `type-btn active-${selectedType}`;
  });

  document.getElementById('amount-input').className = `amount-input ${selectedType}-color`;

  const saveBtn = document.getElementById('btn-save');
  saveBtn.className   = `save-btn ${selectedType}`;
  saveBtn.textContent = selectedType === 'income' ? 'บันทึกรายรับ' : 'บันทึกรายจ่าย';

  renderCatGrid();
}

function renderCatGrid() {
  const cats = selectedType === 'income' ? INCOME_CATS : EXPENSE_CATS;
  document.getElementById('category-grid').innerHTML = cats.map(c => `
    <button class="cat-btn ${selectedCat === c.id ? `sel-${selectedType}` : ''}"
            onclick="pickCat('${c.id}')">
      <span class="cat-icon">${c.icon}</span>
      <span>${c.name}</span>
    </button>
  `).join('');
}

function pickCat(id) {
  selectedCat = id;
  renderCatGrid();
}

function resetAddForm() {
  selectedType = 'expense';
  selectedCat  = null;
  document.getElementById('amount-input').value = '';
  document.getElementById('note-input').value   = '';
  document.getElementById('date-input').value   = todayStr();
  updateTypeUI();
}

function saveTransaction() {
  const amount = parseFloat(document.getElementById('amount-input').value);
  const note   = document.getElementById('note-input').value.trim();
  const date   = document.getElementById('date-input').value;

  if (!amount || amount <= 0) { toast('กรุณากรอกจำนวนเงิน'); return; }
  if (!selectedCat)           { toast('กรุณาเลือกหมวดหมู่');  return; }
  if (!date)                  { toast('กรุณาเลือกวันที่');    return; }

  const cats = selectedType === 'income' ? INCOME_CATS : EXPENSE_CATS;
  const cat  = cats.find(c => c.id === selectedCat);

  appData.transactions.push({ id: uid(), type: selectedType, amount, catId: cat.id,
    catName: cat.name, catIcon: cat.icon, note, date });

  saveData();
  toast(selectedType === 'income' ? '✅ บันทึกรายรับแล้ว' : '✅ บันทึกรายจ่ายแล้ว');
  setTimeout(() => goTo('dashboard'), 600);
}

// ==================== DASHBOARD ====================
function updateDashboard() {
  document.getElementById('current-month-label').textContent = monthLabel(viewMonth, viewYear);

  const txs    = monthTxs();
  const income  = sum(txs, 'income');
  const expense = sum(txs, 'expense');
  const balance = income - expense;

  const balEl = document.getElementById('balance-amount');
  balEl.textContent = fmtCurrency(balance, true);
  balEl.className   = `balance-amount ${balance > 0 ? 'positive' : balance < 0 ? 'negative' : ''}`;

  document.getElementById('income-amount').textContent  = '+฿' + fmtNum(income);
  document.getElementById('expense-amount').textContent = '฿'  + fmtNum(expense);

  updateLoanSummary();
  renderGovDashCard();
  renderBudgetDashboard();
  renderPieChart(txs);
  renderBarChart();
  updateDemoBanner();
}

function monthTxs() {
  return appData.transactions.filter(t => {
    const d = new Date(t.date);
    return d.getMonth() === viewMonth && d.getFullYear() === viewYear;
  });
}

function sum(txs, type) {
  return txs.filter(t => t.type === type).reduce((s, t) => s + t.amount, 0);
}

// ==================== LOAN HELPERS ====================
function loanRemaining(loan) {
  const paid = (loan.payments || [])
    .filter(p => p.type === 'principal')
    .reduce((s, p) => s + p.amount, 0);
  return Math.max(0, loan.amount - paid);
}

function loanInterestPaid(loan) {
  return (loan.payments || [])
    .filter(p => p.type === 'interest')
    .reduce((s, p) => s + p.amount, 0);
}

// ==================== LOAN SUMMARY (dashboard) ====================
function updateLoanSummary() {
  const active = appData.loans.filter(l => !l.returnDate);
  const lends   = active.filter(l => l.direction === 'lend');
  const borrows = active.filter(l => l.direction === 'borrow');

  document.getElementById('lend-total').textContent   = '฿' + fmtNum(lends.reduce((s, l) => s + l.amount, 0));
  document.getElementById('borrow-total').textContent = '฿' + fmtNum(borrows.reduce((s, l) => s + l.amount, 0));
  document.getElementById('lend-count').textContent   = `${lends.length} รายการ`;
  document.getElementById('borrow-count').textContent = `${borrows.length} รายการ`;
}

// ==================== CHARTS ====================
function renderPieChart(txs) {
  const expenses = txs.filter(t => t.type === 'expense');
  const pieEmpty  = document.getElementById('pie-empty');
  const pieCanvas = document.getElementById('chart-pie');

  if (expenses.length === 0) {
    pieEmpty.style.display  = 'block';
    pieCanvas.style.display = 'none';
    if (charts.pie) { charts.pie.destroy(); charts.pie = null; }
    return;
  }

  pieEmpty.style.display  = 'none';
  pieCanvas.style.display = 'block';

  const grouped = {};
  expenses.forEach(t => {
    if (!grouped[t.catId]) grouped[t.catId] = { name: t.catName, icon: t.catIcon, amount: 0 };
    grouped[t.catId].amount += t.amount;
  });

  const items  = Object.values(grouped);
  const labels = items.map(g => `${g.icon} ${g.name}`);
  const values = items.map(g => g.amount);
  const colors = CHART_COLORS.slice(0, items.length);

  if (charts.pie) charts.pie.destroy();
  charts.pie = new Chart(pieCanvas.getContext('2d'), {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 3, borderColor: '#fff' }] },
    options: {
      responsive: true, cutout: '55%',
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 10, usePointStyle: true } },
        tooltip: { callbacks: { label: ctx => ` ฿${fmtNum(ctx.parsed)}` } }
      }
    }
  });
}

function renderBarChart() {
  const labels = [], incData = [], expData = [];
  for (let i = 5; i >= 0; i--) {
    let m = viewMonth - i, y = viewYear;
    if (m < 0) { m += 12; y--; }
    labels.push(new Date(y, m, 1).toLocaleDateString('th-TH', { month: 'short' }));
    const txs = appData.transactions.filter(t => {
      const td = new Date(t.date);
      return td.getMonth() === m && td.getFullYear() === y;
    });
    incData.push(sum(txs, 'income'));
    expData.push(sum(txs, 'expense'));
  }

  if (charts.bar) charts.bar.destroy();
  charts.bar = new Chart(document.getElementById('chart-bar').getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'รายรับ',  data: incData,  backgroundColor: '#43A047', borderRadius: 5 },
        { label: 'รายจ่าย', data: expData, backgroundColor: '#E53935', borderRadius: 5 },
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 }, usePointStyle: true } },
        tooltip: { callbacks: { label: ctx => ` ฿${fmtNum(ctx.parsed.y)}` } }
      },
      scales: {
        y: { beginAtZero: true, ticks: { callback: v => v >= 1000 ? (v/1000).toFixed(0)+'k' : v, font: { size: 10 } } },
        x: { ticks: { font: { size: 11 } } }
      }
    }
  });
}

// ==================== HISTORY ====================
function renderHistory(q = '') {
  const listEl  = document.getElementById('transaction-list');
  const keyword = q.toLowerCase();

  let txs = [...appData.transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
  if (keyword) txs = txs.filter(t => t.catName.includes(keyword) || t.note.toLowerCase().includes(keyword));

  if (txs.length === 0) {
    listEl.innerHTML = `<div class="empty-state"><div class="empty-icon">📝</div>
      <p>ยังไม่มีรายการ<br>กดปุ่ม เพิ่ม เพื่อบันทึกรายการใหม่</p></div>`;
    return;
  }

  const grouped = {};
  txs.forEach(t => { if (!grouped[t.date]) grouped[t.date] = []; grouped[t.date].push(t); });

  listEl.innerHTML = Object.keys(grouped).map(date => {
    const dayBal   = grouped[date].reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0);
    const balColor = dayBal >= 0 ? '#2E7D32' : '#C62828';
    const balText  = (dayBal >= 0 ? '+฿' : '-฿') + fmtNum(Math.abs(dayBal));
    return `
      <div class="tx-group">
        <div class="tx-group-header">
          <span>${formatDate(date)}</span>
          <span style="color:${balColor}">${balText}</span>
        </div>
        ${grouped[date].map(t => `
          <div class="tx-item" onclick="openModal('${t.id}')">
            <div class="tx-badge ${t.type}">${t.catIcon}</div>
            <div class="tx-info">
              <div class="tx-category">${t.catName}</div>
              ${t.note ? `<div class="tx-note">${t.note}</div>` : ''}
            </div>
            <div class="tx-amount ${t.type}">${t.type === 'income' ? '+' : '-'}฿${fmtNum(t.amount)}</div>
          </div>`).join('')}
      </div>`;
  }).join('');
}

// ==================== TRANSACTION MODAL ====================
function openModal(id) {
  const t = appData.transactions.find(tx => tx.id === id);
  if (!t) return;
  modalTxId = id;
  const color = t.type === 'income' ? '#2E7D32' : '#C62828';
  const sign  = t.type === 'income' ? '+' : '-';
  document.getElementById('modal-info').innerHTML = `
    <div style="font-size:13px;color:#9CA3AF;margin-bottom:4px">${formatDate(t.date)}</div>
    <div>${t.catIcon} ${t.catName}</div>
    <div style="font-size:22px;font-weight:800;color:${color};margin-top:4px">${sign}฿${fmtNum(t.amount)}</div>
    ${t.note ? `<div style="font-size:13px;color:#9CA3AF;margin-top:6px">${t.note}</div>` : ''}
  `;
  document.getElementById('modal-overlay').classList.add('show');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('show');
  modalTxId = null;
}

function deleteTransaction() {
  if (!modalTxId) return;
  appData.transactions = appData.transactions.filter(t => t.id !== modalTxId);
  saveData();
  closeModal();
  toast('🗑 ลบรายการแล้ว');
  renderHistory(document.getElementById('search-input').value);
  updateDashboard();
}

// ==================== LOAN PAGE ====================
function renderLoans() {
  const listEl   = document.getElementById('loan-list');
  const isActive = currentLoanTab === 'active';

  const loans = appData.loans.filter(l => isActive ? !l.returnDate : !!l.returnDate);

  if (loans.length === 0) {
    listEl.innerHTML = `<div class="empty-state">
      <div class="empty-icon">${isActive ? '🤝' : '✅'}</div>
      <p>${isActive
        ? 'ไม่มีรายการยืมค้างอยู่<br>กด "+ บันทึก" เพื่อเพิ่มรายการ'
        : 'ยังไม่มีรายการที่คืนแล้ว'}</p>
    </div>`;
    return;
  }

  const sorted = [...loans].sort((a, b) => new Date(b.borrowDate) - new Date(a.borrowDate));

  listEl.innerHTML = sorted.map(l => {
    const overdue    = !l.returnDate && l.dueDate && new Date(l.dueDate) < new Date(todayStr());
    const dLeft      = l.dueDate && !l.returnDate ? daysDiff(l.dueDate) : null;
    const dirLabel   = l.direction === 'lend' ? 'ให้ยืม' : 'ยืมมา';
    const remaining  = loanRemaining(l);
    const intPaid    = loanInterestPaid(l);

    let statusText  = '';
    let statusClass = '';
    if (l.returnDate) {
      statusText  = `✅ คืนแล้ว เมื่อ ${formatDate(l.returnDate)}`;
      statusClass = 'returned';
    } else if (overdue) {
      statusText  = `⚠️ เกินกำหนด ${Math.abs(dLeft)} วัน`;
      statusClass = 'overdue';
    } else if (dLeft === 0) {
      statusText  = '📅 ครบกำหนดวันนี้!';
      statusClass = 'overdue';
    } else if (dLeft !== null) {
      statusText  = `📅 อีก ${dLeft} วัน`;
      statusClass = 'active';
    } else {
      statusText  = '💬 ไม่ได้กำหนดวันคืน';
      statusClass = 'active';
    }

    return `
      <div class="loan-card ${l.direction} ${overdue ? 'is-overdue' : ''}"
           onclick="openLoanModal('${l.id}')">
        <div class="loan-card-top">
          <div class="loan-person">👤 ${l.person}</div>
          <div class="loan-dir-badge ${l.direction}">${dirLabel}</div>
        </div>
        <div class="loan-amount-large">฿${fmtNum(l.amount)}</div>
        ${remaining < l.amount && !l.returnDate ? `
          <div class="loan-remaining-row">
            <span class="loan-remaining-label">คงเหลือ</span>
            <span class="loan-remaining-amount">฿${fmtNum(remaining)}</span>
          </div>` : ''}
        ${l.monthlyInterest && !l.returnDate ? `<div class="loan-monthly-badge">💸 ฿${fmtNum(l.monthlyInterest)}/เดือน</div>` : ''}
        ${intPaid > 0 && !l.returnDate ? `<div class="loan-interest-row">💸 ดอกรวม ฿${fmtNum(intPaid)} (${(l.payments||[]).filter(p=>p.type==='interest').length} เดือน)</div>` : ''}
        <div class="loan-dates-row">
          <span>📅 ยืม ${formatDate(l.borrowDate)}</span>
          ${l.dueDate ? `<span>⏰ นัดคืน ${formatDate(l.dueDate)}</span>` : ''}
        </div>
        ${l.note ? `<div class="loan-note-text">📝 ${l.note}</div>` : ''}
        <span class="loan-status-badge ${statusClass}">${statusText}</span>
      </div>`;
  }).join('');
}

// ==================== ADD LOAN ====================
function resetLoanForm() {
  loanDirection = 'lend';
  document.getElementById('loan-person').value            = '';
  document.getElementById('loan-amount').value            = '';
  document.getElementById('loan-monthly-interest').value  = '';
  document.getElementById('loan-borrow-date').value       = todayStr();
  document.getElementById('loan-due-date').value          = '';
  document.getElementById('loan-note').value              = '';
  updateLoanTypeUI();
}

function updateLoanTypeUI() {
  document.querySelectorAll('[data-ltype]').forEach(btn => {
    btn.className = 'type-btn';
    if (btn.dataset.ltype === loanDirection) {
      btn.className = loanDirection === 'lend' ? 'type-btn active-lend' : 'type-btn active-borrow';
    }
  });

  const amtEl = document.getElementById('loan-amount');
  if (amtEl) amtEl.className = `amount-input ${loanDirection}-color`;

  const saveBtn = document.getElementById('btn-save-loan');
  if (saveBtn) {
    saveBtn.className   = `save-btn ${loanDirection}-save`;
    saveBtn.textContent = loanDirection === 'lend' ? '💾 บันทึก (ให้ยืม)' : '💾 บันทึก (ยืมมา)';
  }
}

function saveLoan() {
  const person          = document.getElementById('loan-person').value.trim();
  const amount          = parseFloat(document.getElementById('loan-amount').value);
  const monthlyInterest = parseFloat(document.getElementById('loan-monthly-interest').value) || null;
  const borrowDate      = document.getElementById('loan-borrow-date').value;
  const dueDate         = document.getElementById('loan-due-date').value;
  const note            = document.getElementById('loan-note').value.trim();

  if (!person)              { toast('กรุณาระบุชื่อ');          return; }
  if (!amount || amount <= 0) { toast('กรุณากรอกจำนวนเงิน');   return; }
  if (!borrowDate)          { toast('กรุณาเลือกวันที่ยืม');  return; }

  appData.loans.push({
    id: uid(), direction: loanDirection, person, amount, monthlyInterest,
    borrowDate, dueDate: dueDate || null, returnDate: null, note, payments: [],
  });

  saveData();
  toast(loanDirection === 'lend' ? '✅ บันทึกการให้ยืมแล้ว' : '✅ บันทึกการยืมมาแล้ว');
  setTimeout(() => goTo('loans'), 600);
}

// ==================== LOAN MODAL ====================
function openLoanModal(id) {
  const l = appData.loans.find(lo => lo.id === id);
  if (!l) return;
  modalLoanId = id;

  const overdue    = !l.returnDate && l.dueDate && new Date(l.dueDate) < new Date(todayStr());
  const color      = l.direction === 'lend' ? '#1565C0' : '#E65100';
  const dirText    = l.direction === 'lend' ? `ให้ ${l.person} ยืม` : `ยืมจาก ${l.person}`;
  const remaining  = loanRemaining(l);
  const intPaid    = loanInterestPaid(l);

  const recentPays = (l.payments || []).slice(-4).reverse();
  const payHistHtml = recentPays.length > 0 ? `
    <div style="margin-top:10px;padding-top:10px;border-top:1px solid #eee">
      ${recentPays.map(p => `
        <div style="display:flex;justify-content:space-between;font-size:12px;color:#555;margin-bottom:4px">
          <span>${p.type === 'interest' ? '💸 ดอกเบี้ย' : '💰 คืนต้น'} · ${formatDate(p.date)}</span>
          <span style="font-weight:700">฿${fmtNum(p.amount)}</span>
        </div>`).join('')}
    </div>` : '';

  document.getElementById('loan-modal-info').innerHTML = `
    <div style="font-size:13px;color:#9CA3AF;margin-bottom:4px">${formatDate(l.borrowDate)}</div>
    <div style="font-weight:700;font-size:16px">👤 ${l.person}</div>
    <div style="font-size:26px;font-weight:800;color:${color};margin:6px 0">฿${fmtNum(l.amount)}</div>
    ${remaining < l.amount && !l.returnDate ? `
      <div style="font-size:13px;color:#1565C0;font-weight:600">💰 คงเหลือ ฿${fmtNum(remaining)}</div>` : ''}
    ${l.monthlyInterest && !l.returnDate ? `
      <div style="font-size:13px;color:#E65100;font-weight:600;margin-top:2px">💸 ดอก ฿${fmtNum(l.monthlyInterest)}/เดือน</div>` : ''}
    ${intPaid > 0 ? `
      <div style="font-size:13px;color:#E65100;margin-top:2px">รับดอกแล้ว ฿${fmtNum(intPaid)} (${(l.payments||[]).filter(p=>p.type==='interest').length} เดือน)</div>` : ''}
    <div style="font-size:13px;color:#555;margin-top:4px">${dirText}</div>
    ${l.dueDate ? `<div style="font-size:13px;color:${overdue ? '#C62828' : '#9CA3AF'};margin-top:6px">
      ⏰ นัดคืน ${formatDate(l.dueDate)}${overdue ? ' — เกินกำหนดแล้ว!' : ''}
    </div>` : ''}
    ${l.returnDate ? `<div style="font-size:13px;color:#2E7D32;margin-top:6px">✅ คืนแล้ว ${formatDate(l.returnDate)}</div>` : ''}
    ${l.note ? `<div style="font-size:13px;color:#9CA3AF;margin-top:6px">📝 ${l.note}</div>` : ''}
    ${payHistHtml}
  `;

  const retBtn      = document.getElementById('btn-return-loan');
  const intBtn      = document.getElementById('btn-pay-interest');
  const partialBtn  = document.getElementById('btn-pay-partial');

  if (l.returnDate) {
    retBtn.style.display     = 'none';
    intBtn.style.display     = 'none';
    partialBtn.style.display = 'none';
  } else {
    retBtn.style.display     = '';
    intBtn.style.display     = '';
    partialBtn.style.display = '';
    retBtn.textContent = l.direction === 'lend' ? '✅ รับคืนครบแล้ว' : '✅ คืนครบแล้ว';
  }

  document.getElementById('loan-modal-overlay').classList.add('show');
}

function closeLoanModal() {
  document.getElementById('loan-modal-overlay').classList.remove('show');
  modalLoanId = null;
}

// ==================== PAYMENT MODAL ====================
function openPayModal(type) {
  payModalType = type;
  document.getElementById('loan-modal-overlay').classList.remove('show');
  document.getElementById('pay-modal-title').textContent =
    type === 'interest' ? '💸 บันทึกดอกเบี้ย' : '💰 คืนบางส่วน';

  // pre-fill monthly interest amount
  const loan = appData.loans.find(l => l.id === modalLoanId);
  const prefill = type === 'interest' && loan?.monthlyInterest ? loan.monthlyInterest : '';
  document.getElementById('pay-amount-input').value = prefill;
  document.getElementById('pay-date-input').value   = todayStr();
  document.getElementById('pay-modal-overlay').classList.add('show');
}

function closePayModal() {
  document.getElementById('pay-modal-overlay').classList.remove('show');
  payModalType = null;
  modalLoanId  = null;
}

function confirmPay() {
  const amount = parseFloat(document.getElementById('pay-amount-input').value);
  const date   = document.getElementById('pay-date-input').value;

  if (!amount || amount <= 0) { toast('กรุณากรอกจำนวนเงิน'); return; }
  if (!date)                  { toast('กรุณาเลือกวันที่');    return; }

  const loan = appData.loans.find(l => l.id === modalLoanId);
  if (!loan) return;

  if (!loan.payments) loan.payments = [];
  loan.payments.push({ id: uid(), amount, date, type: payModalType });

  if (payModalType === 'principal' && loanRemaining(loan) <= 0) {
    loan.returnDate = date;
    toast('✅ คืนเงินครบแล้ว!');
  } else {
    toast(payModalType === 'interest' ? '✅ บันทึกดอกเบี้ยแล้ว' : '✅ บันทึกการคืนบางส่วนแล้ว');
  }

  saveData();
  closePayModal();
  renderLoans();
  updateDashboard();
}

function returnLoan() {
  const l = appData.loans.find(lo => lo.id === modalLoanId);
  if (!l) return;
  l.returnDate = todayStr();
  saveData();
  closeLoanModal();
  toast(l.direction === 'lend' ? '✅ รับคืนเงินแล้ว' : '✅ คืนเงินแล้ว');
  renderLoans();
  updateDashboard();
}

function deleteLoan() {
  appData.loans = appData.loans.filter(l => l.id !== modalLoanId);
  saveData();
  closeLoanModal();
  toast('🗑 ลบรายการยืมแล้ว');
  renderLoans();
  updateDashboard();
}

// ==================== DARK MODE ====================
function applyTheme() {
  const t = localStorage.getItem('rairab_theme') || 'light';
  document.documentElement.setAttribute('data-theme', t);
}

function toggleTheme() {
  const cur  = document.documentElement.getAttribute('data-theme') || 'light';
  const next = cur === 'dark' ? 'light' : 'dark';
  localStorage.setItem('rairab_theme', next);
  document.documentElement.setAttribute('data-theme', next);
  const el = document.getElementById('theme-toggle');
  if (el) el.classList.toggle('on', next === 'dark');
  toast(next === 'dark' ? '🌙 Dark Mode เปิดแล้ว' : '☀️ Light Mode');
}

// ==================== EXPORT / IMPORT ====================
function exportJSON() {
  const blob = new Blob([JSON.stringify(appData, null, 2)], { type: 'application/json' });
  const a    = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `rairab_${todayStr()}.json` });
  a.click(); URL.revokeObjectURL(a.href);
  toast('📤 Export JSON สำเร็จ');
}

function importJSON(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.transactions) throw new Error('invalid');
      appData = { transactions:[], loans:[], notes:[], splits:[], govPrograms:[], budgets:{}, recurring:[], ...data };
      appData.loans.forEach(l => { if (!l.payments) l.payments = []; });
      saveData(); updateDashboard();
      toast('📥 Import สำเร็จ');
    } catch { toast('❌ ไฟล์ไม่ถูกต้อง'); }
  };
  reader.readAsText(file);
  event.target.value = '';
}

function exportCSV() {
  const rows = [['วันที่','ประเภท','หมวดหมู่','จำนวน','บันทึก']];
  appData.transactions.forEach(t => {
    rows.push([t.date, t.type === 'income' ? 'รายรับ' : 'รายจ่าย', t.catName, t.amount, `"${(t.note||'').replace(/"/g,'""')}"`]);
  });
  const csv  = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a    = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `transactions_${todayStr()}.csv` });
  a.click(); URL.revokeObjectURL(a.href);
  toast('📊 Export CSV สำเร็จ');
}

// ==================== SETTINGS PAGE ====================
function renderSettingsPage() {
  const el = document.getElementById('theme-toggle');
  if (el) el.classList.toggle('on', document.documentElement.getAttribute('data-theme') === 'dark');
  updateNotifStatus();
  const vEl = document.getElementById('app-version-footer');
  if (vEl) vEl.innerHTML = `💰 รายรับรายจ่าย <strong>v${APP_VERSION}</strong><br><span style="font-size:11px">อัพเดทล่าสุด: 7 มิ.ย. 2569</span>`;
}

function confirmClearData() {
  if (confirm('⚠️ ลบข้อมูลทั้งหมด? ไม่สามารถกู้คืนได้')) {
    localStorage.removeItem(STORAGE_KEY);
    appData = { transactions:[], loans:[], notes:[], splits:[], govPrograms:[], budgets:{}, recurring:[] };
    initGovPrograms();
    updateDashboard();
    goTo('dashboard');
    toast('🗑 ลบข้อมูลแล้ว');
  }
}

// ==================== NOTIFICATIONS ====================
function requestNotifPermission() {
  if (!('Notification' in window)) { toast('เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน'); return; }
  Notification.requestPermission().then(p => { updateNotifStatus(); toast(p === 'granted' ? '🔔 เปิดการแจ้งเตือนแล้ว' : '🔕 ไม่ได้รับอนุญาต'); });
}

function updateNotifStatus() {
  const el = document.getElementById('notif-status');
  if (!el || !('Notification' in window)) return;
  el.textContent = { granted:'✅ เปิด', denied:'❌ ปิด', default:'แตะเพื่อเปิด' }[Notification.permission];
}

function checkLoanNotifications() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  appData.loans.filter(l => !l.returnDate && l.dueDate).forEach(l => {
    const days = daysDiff(l.dueDate);
    if (days >= 0 && days <= 3) {
      new Notification('💰 แจ้งเตือนยืมเงิน', {
        body: `${l.person} — ${l.direction === 'lend' ? 'ต้องคืน' : 'ต้องจ่ายคืน'} ฿${fmtNum(l.amount)}  อีก ${days} วัน`,
        icon: 'icons/icon-192.png',
      });
    }
  });
}

// ==================== BUDGET ====================
function renderBudgetPage() {
  document.getElementById('budget-form-list').innerHTML = EXPENSE_CATS.map(cat => {
    const val = (appData.budgets || {})[cat.id] || '';
    return `
      <div class="budget-form-row">
        <div class="budget-cat-label">${cat.icon} ${cat.name}</div>
        <div class="budget-input-wrap">
          <span style="color:var(--text-muted)">฿</span>
          <input type="number" class="budget-cat-input" data-catid="${cat.id}"
                 value="${val}" placeholder="ไม่จำกัด" inputmode="decimal">
        </div>
      </div>`;
  }).join('');
}

function saveBudget() {
  if (!appData.budgets) appData.budgets = {};
  document.querySelectorAll('.budget-cat-input').forEach(inp => {
    const v = parseFloat(inp.value);
    if (v > 0) appData.budgets[inp.dataset.catid] = v;
    else       delete appData.budgets[inp.dataset.catid];
  });
  saveData(); toast('✅ บันทึกงบประมาณแล้ว'); goTo('settings');
}

function renderBudgetDashboard() {
  const el  = document.getElementById('budget-dashboard-section');
  if (!el) return;
  const bud = appData.budgets || {};
  if (!Object.keys(bud).length) { el.innerHTML = ''; return; }
  const used = {};
  monthTxs().filter(t => t.type === 'expense').forEach(t => { used[t.catId] = (used[t.catId]||0) + t.amount; });
  el.innerHTML = `<div class="chart-card" style="margin-bottom:12px">
    <div class="chart-title">🎯 งบประมาณเดือนนี้</div>
    ${Object.entries(bud).map(([id, budget]) => {
      const cat   = EXPENSE_CATS.find(c => c.id === id); if (!cat) return '';
      const spent = used[id] || 0;
      const pct   = Math.min(100, Math.round(spent/budget*100));
      const color = spent > budget ? '#C62828' : pct > 80 ? '#E65100' : '#2E7D32';
      return `<div class="budget-row">
        <div class="budget-row-top">
          <span>${cat.icon} ${cat.name}</span>
          <span style="color:${color};font-weight:700">฿${fmtNum(spent)} / ${fmtNum(budget)}</span>
        </div>
        <div class="budget-bar-bg"><div class="budget-bar-fill" style="width:${pct}%;background:${color}"></div></div>
      </div>`;
    }).join('')}
    <button onclick="goTo('budget')" class="budget-edit-btn">ตั้งค่างบประมาณ ›</button>
  </div>`;
}

// ==================== RECURRING ====================
let recurringType = 'expense';
let recurringCat  = null;

function checkRecurring() {
  if (!appData.recurring || appData.recurring.length === 0) return;
  const today   = new Date(todayStr());
  const yearMon = `${today.getFullYear()}-${today.getMonth()}`;
  let added = 0;
  appData.recurring.forEach(r => {
    if (r.lastAdded === yearMon) return;
    if (today.getDate() >= r.dayOfMonth) {
      const ds = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(r.dayOfMonth).padStart(2,'0')}`;
      appData.transactions.push({ id:uid(), type:r.type, amount:r.amount, catId:r.catId, catName:r.catName, catIcon:r.catIcon, note:r.note||'[อัตโนมัติ]', date:ds });
      r.lastAdded = yearMon; added++;
    }
  });
  if (added > 0) { saveData(); toast(`📅 เพิ่มรายการประจำ ${added} รายการ`); }
}

function resetRecurringForm() {
  recurringType = 'expense'; recurringCat = null;
  document.getElementById('rec-amount').value = '';
  document.getElementById('rec-day').value    = '1';
  document.getElementById('rec-note').value   = '';
  updateRecurringTypeUI();
}

function updateRecurringTypeUI() {
  document.querySelectorAll('[data-rtype]').forEach(b => {
    b.className = 'type-btn';
    if (b.dataset.rtype === recurringType) b.className = `type-btn active-${recurringType}`;
  });
  document.getElementById('rec-amount').className = `amount-input ${recurringType}-color`;
  const sb = document.getElementById('btn-save-recurring');
  if (sb) sb.className = `save-btn ${recurringType}`;
  renderRecurringCatGrid();
}

function renderRecurringCatGrid() {
  const cats = recurringType === 'income' ? INCOME_CATS : EXPENSE_CATS;
  document.getElementById('rec-cat-grid').innerHTML = cats.map(c => `
    <button class="cat-btn ${recurringCat === c.id ? `sel-${recurringType}` : ''}" onclick="pickRecurringCat('${c.id}')">
      <span class="cat-icon">${c.icon}</span><span>${c.name}</span>
    </button>`).join('');
}

function pickRecurringCat(id) { recurringCat = id; renderRecurringCatGrid(); }

function saveRecurring() {
  const amount = parseFloat(document.getElementById('rec-amount').value);
  const day    = parseInt(document.getElementById('rec-day').value);
  const note   = document.getElementById('rec-note').value.trim();
  if (!amount || amount <= 0)      { toast('กรุณากรอกจำนวนเงิน'); return; }
  if (!recurringCat)               { toast('กรุณาเลือกหมวดหมู่');  return; }
  if (!day || day < 1 || day > 28) { toast('วันที่ต้องอยู่ระหว่าง 1-28'); return; }
  const cats = recurringType === 'income' ? INCOME_CATS : EXPENSE_CATS;
  const cat  = cats.find(c => c.id === recurringCat);
  if (!appData.recurring) appData.recurring = [];
  appData.recurring.push({ id:uid(), type:recurringType, amount, catId:cat.id, catName:cat.name, catIcon:cat.icon, dayOfMonth:day, note, lastAdded:null });
  saveData(); toast('✅ บันทึกรายการประจำแล้ว');
  setTimeout(() => goTo('recurring'), 500);
}

function renderRecurringPage() {
  const listEl = document.getElementById('recurring-list');
  const items  = appData.recurring || [];
  if (items.length === 0) {
    listEl.innerHTML = `<div class="empty-state"><div class="empty-icon">📅</div>
      <p>ยังไม่มีรายการประจำ<br>กด "+ เพิ่ม" เพื่อตั้งรายการ</p></div>`;
    return;
  }
  listEl.innerHTML = items.map(r => `
    <div class="tx-item">
      <div class="tx-badge ${r.type}">${r.catIcon}</div>
      <div class="tx-info">
        <div class="tx-category">${r.catName}</div>
        <div class="tx-note">ทุกวันที่ ${r.dayOfMonth}${r.note ? ' · ' + r.note : ''}</div>
      </div>
      <div style="text-align:right">
        <div class="tx-amount ${r.type}">${r.type==='income'?'+':'-'}฿${fmtNum(r.amount)}</div>
        <button onclick="deleteRecurring('${r.id}')" style="font-size:18px;background:none;border:none;cursor:pointer;color:var(--text-muted);margin-top:4px">🗑</button>
      </div>
    </div>`).join('');
}

function deleteRecurring(id) {
  appData.recurring = appData.recurring.filter(r => r.id !== id);
  saveData(); renderRecurringPage(); toast('🗑 ลบรายการประจำแล้ว');
}

// ==================== GOVT PROGRAMS ====================
let modalGovProgId = null;

function initGovPrograms() {
  if (appData.govPrograms.length > 0) return;
  appData.govPrograms = [
    {
      id: 'prog_konlakrueng',
      name: 'คนละครึ่ง',
      govPct: 50, userPct: 50,
      totalGovBudget: 2000,
      dailyGovLimit: 0,
      monthlyGovLimit: 0,
      note: 'รัฐให้ 2,000 บาท ต้องใช้ภายใน 3 เดือน (ยอดซื้อรวม 4,000)',
      active: true,
      transactions: [],
    },
    {
      id: 'prog_thaichuathai',
      name: 'ไทยช่วยไทยพลัส',
      govPct: 60, userPct: 40,
      totalGovBudget: 4000,
      dailyGovLimit: 200,
      monthlyGovLimit: 1000,
      note: 'รัฐช่วย 60% สูงสุด 200/วัน, 1,000/เดือน ทั้งหมด 4 เดือน ไม่ทบยอด',
      active: true,
      transactions: [],
    },
  ];
  saveData();
}

function govProgRemaining(prog) {
  const used = (prog.transactions || []).reduce((s, t) => s + t.govAmount, 0);
  return Math.max(0, prog.totalGovBudget - used);
}

function govProgUsedToday(prog, dateStr) {
  return (prog.transactions || [])
    .filter(t => t.date === dateStr)
    .reduce((s, t) => s + t.govAmount, 0);
}

function govProgUsedThisMonth(prog, month, year) {
  return (prog.transactions || [])
    .filter(t => {
      const d = new Date(t.date);
      return d.getMonth() === month && d.getFullYear() === year;
    })
    .reduce((s, t) => s + t.govAmount, 0);
}

function renderGovDashCard() {
  const content = document.getElementById('govt-dash-content');
  if (!content) return;
  const active = appData.govPrograms.filter(p => p.active);
  if (active.length === 0) {
    content.innerHTML = `<div style="font-size:13px;color:var(--text-muted)">ยังไม่มีโครงการที่ใช้งาน</div>`;
    return;
  }
  content.innerHTML = active.map(p => {
    const rem    = govProgRemaining(p);
    const pct    = Math.round((1 - rem / p.totalGovBudget) * 100);
    const color  = rem > p.totalGovBudget * 0.3 ? '#2E7D32' : '#E65100';
    return `
      <div class="govt-dash-row">
        <div class="govt-dash-name">${p.name}
          <span class="govt-ratio-chip">${p.govPct}/${p.userPct}</span>
        </div>
        <div class="govt-dash-rem" style="color:${color}">฿${fmtNum(rem)}</div>
      </div>
      <div class="govt-progress-bg">
        <div class="govt-progress-bar" style="width:${pct}%;background:${color}"></div>
      </div>`;
  }).join('');
}

function renderGovPage() {
  renderGovDashCard();
  const listEl = document.getElementById('govt-prog-list');
  const today  = todayStr();
  const now    = new Date();

  if (appData.govPrograms.length === 0) {
    listEl.innerHTML = `<div class="empty-state">
      <div class="empty-icon">🏛</div>
      <p>ยังไม่มีโครงการ<br>กด "+ เพิ่ม" เพื่อเพิ่มโครงการ</p>
    </div>`;
    return;
  }

  listEl.innerHTML = appData.govPrograms.map(p => {
    const rem          = govProgRemaining(p);
    const pct          = Math.round((1 - rem / p.totalGovBudget) * 100);
    const color        = rem > p.totalGovBudget * 0.3 ? '#2E7D32' : '#E65100';
    const usedToday    = govProgUsedToday(p, today);
    const usedMonth    = govProgUsedThisMonth(p, now.getMonth(), now.getFullYear());
    const maxDayTotal  = p.dailyGovLimit > 0 ? +(p.dailyGovLimit / (p.govPct / 100)).toFixed(0) : null;
    const maxMonTotal  = p.monthlyGovLimit > 0 ? +(p.monthlyGovLimit / (p.govPct / 100)).toFixed(0) : null;

    const recentTxs    = (p.transactions || []).slice(-3).reverse();

    return `
      <div class="govt-card">
        <div class="govt-card-top">
          <div>
            <div class="govt-card-name">${p.name}</div>
            <div class="govt-card-note">${p.note}</div>
          </div>
          <span class="govt-ratio-badge">${p.govPct}% / ${p.userPct}%</span>
        </div>

        <div class="govt-budget-row">
          <span style="font-size:13px;color:var(--text-muted)">วงเงินคงเหลือ</span>
          <span style="font-size:20px;font-weight:800;color:${color}">฿${fmtNum(rem)}</span>
        </div>
        <div class="govt-progress-bg" style="margin-bottom:10px">
          <div class="govt-progress-bar" style="width:${pct}%;background:${color}"></div>
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:10px;text-align:right">
          ใช้ไปแล้ว ฿${fmtNum(p.totalGovBudget - rem)} / ${fmtNum(p.totalGovBudget)} (รัฐ)
        </div>

        ${p.dailyGovLimit > 0 ? `
          <div class="govt-limit-row">
            <span>📅 วันนี้ (รัฐ)</span>
            <span style="color:${usedToday >= p.dailyGovLimit ? '#C62828' : '#2E7D32'}">
              ฿${fmtNum(usedToday)} / ฿${fmtNum(p.dailyGovLimit)}
            </span>
          </div>
          <div class="govt-limit-note">ซื้อรวมได้สูงสุด ฿${fmtNum(maxDayTotal)}/วัน</div>` : ''}

        ${p.monthlyGovLimit > 0 ? `
          <div class="govt-limit-row">
            <span>📆 เดือนนี้ (รัฐ)</span>
            <span style="color:${usedMonth >= p.monthlyGovLimit ? '#C62828' : '#555'}">
              ฿${fmtNum(usedMonth)} / ฿${fmtNum(p.monthlyGovLimit)}
            </span>
          </div>
          <div class="govt-limit-note">ซื้อรวมได้สูงสุด ฿${fmtNum(maxMonTotal)}/เดือน (ไม่ทบยอด)</div>` : ''}

        ${recentTxs.length > 0 ? `
          <div class="govt-recent-header">ล่าสุด</div>
          ${recentTxs.map(t => `
            <div class="govt-tx-row">
              <span>${formatDate(t.date)}${t.note ? ' · ' + t.note : ''}</span>
              <span>รัฐ ฿${fmtNum(t.govAmount)} | เรา ฿${fmtNum(t.userAmount)}</span>
            </div>`).join('')}` : ''}

        <button class="govt-spend-btn ${rem <= 0 ? 'disabled' : ''}"
                onclick="${rem > 0 ? `openGovSpendModal('${p.id}')` : ''}">
          ${rem <= 0 ? '✅ ใช้วงเงินหมดแล้ว' : '💳 บันทึกใช้จ่าย'}
        </button>
      </div>`;
  }).join('');
}

function resetGovProgForm() {
  document.getElementById('gp-name').value    = '';
  document.getElementById('gp-gov-pct').value = '50';
  document.getElementById('gp-total').value   = '';
  document.getElementById('gp-daily').value   = '0';
  document.getElementById('gp-monthly').value = '0';
  document.getElementById('gp-note').value    = '';
}

function saveGovProg() {
  const name    = document.getElementById('gp-name').value.trim();
  const govPct  = parseFloat(document.getElementById('gp-gov-pct').value) || 50;
  const total   = parseFloat(document.getElementById('gp-total').value);
  const daily   = parseFloat(document.getElementById('gp-daily').value) || 0;
  const monthly = parseFloat(document.getElementById('gp-monthly').value) || 0;
  const note    = document.getElementById('gp-note').value.trim();

  if (!name)              { toast('กรุณาระบุชื่อโครงการ');    return; }
  if (!total || total <= 0) { toast('กรุณากรอกวงเงินรัฐทั้งหมด'); return; }

  appData.govPrograms.push({
    id: uid(), name,
    govPct, userPct: 100 - govPct,
    totalGovBudget: total,
    dailyGovLimit: daily,
    monthlyGovLimit: monthly,
    note, active: true, transactions: [],
  });

  saveData();
  toast('✅ เพิ่มโครงการแล้ว');
  setTimeout(() => goTo('govt'), 500);
}

function openGovSpendModal(progId) {
  modalGovProgId = progId;
  const prog = appData.govPrograms.find(p => p.id === progId);
  if (!prog) return;
  document.getElementById('govt-spend-header').textContent = `💳 ${prog.name}`;
  document.getElementById('govt-spend-amount').value = '';
  document.getElementById('govt-spend-date').value   = todayStr();
  document.getElementById('govt-spend-note').value   = '';
  document.getElementById('govt-spend-breakdown').innerHTML = '';
  document.getElementById('govt-spend-warning').style.display = 'none';
  document.getElementById('govt-spend-modal').classList.add('show');
}

function closeGovSpendModal() {
  document.getElementById('govt-spend-modal').classList.remove('show');
  modalGovProgId = null;
}

function calcGovSpendBreakdown() {
  const prog   = appData.govPrograms.find(p => p.id === modalGovProgId);
  if (!prog) return;
  const total  = parseFloat(document.getElementById('govt-spend-amount').value) || 0;
  const date   = document.getElementById('govt-spend-date').value || todayStr();
  const govAmt = +(total * prog.govPct / 100).toFixed(2);
  const usrAmt = +(total * prog.userPct / 100).toFixed(2);
  const bdEl   = document.getElementById('govt-spend-breakdown');
  const warnEl = document.getElementById('govt-spend-warning');

  if (total <= 0) { bdEl.innerHTML = ''; warnEl.style.display = 'none'; return; }

  bdEl.innerHTML = `
    <div class="govt-bd-row">
      <span>🏛 รัฐจ่าย (${prog.govPct}%)</span>
      <span class="govt-bd-gov">฿${fmtNum(govAmt)}</span>
    </div>
    <div class="govt-bd-row">
      <span>🙋 เราจ่าย (${prog.userPct}%)</span>
      <span class="govt-bd-user">฿${fmtNum(usrAmt)}</span>
    </div>`;

  const warnings = [];
  const remaining = govProgRemaining(prog);
  if (govAmt > remaining)
    warnings.push(`⚠️ วงเงินรัฐเหลือเพียง ฿${fmtNum(remaining)} — จะใช้เกิน`);

  if (prog.dailyGovLimit > 0) {
    const usedToday = govProgUsedToday(prog, date);
    const dayLeft   = prog.dailyGovLimit - usedToday;
    if (govAmt > dayLeft)
      warnings.push(`⚠️ วงเงินวันนี้เหลือ ฿${fmtNum(dayLeft)} (รัฐ) — สูงสุดซื้อได้ ฿${fmtNum(+(dayLeft/(prog.govPct/100)).toFixed(0))} รวม`);
  }

  if (prog.monthlyGovLimit > 0) {
    const d = new Date(date + 'T00:00:00');
    const usedMonth = govProgUsedThisMonth(prog, d.getMonth(), d.getFullYear());
    const monLeft   = prog.monthlyGovLimit - usedMonth;
    if (govAmt > monLeft)
      warnings.push(`⚠️ วงเงินเดือนนี้เหลือ ฿${fmtNum(monLeft)} (รัฐ) — ไม่ทบยอด`);
  }

  if (warnings.length > 0) {
    warnEl.innerHTML = warnings.join('<br>');
    warnEl.style.display = 'block';
  } else {
    warnEl.style.display = 'none';
  }
}

function confirmGovSpend() {
  const prog  = appData.govPrograms.find(p => p.id === modalGovProgId);
  if (!prog) return;
  const total = parseFloat(document.getElementById('govt-spend-amount').value);
  const date  = document.getElementById('govt-spend-date').value;
  const note  = document.getElementById('govt-spend-note').value.trim();

  if (!total || total <= 0) { toast('กรุณากรอกยอดเงิน'); return; }
  if (!date)                { toast('กรุณาเลือกวันที่');  return; }

  const govAmt = +(total * prog.govPct  / 100).toFixed(2);
  const usrAmt = +(total * prog.userPct / 100).toFixed(2);

  if (!prog.transactions) prog.transactions = [];
  prog.transactions.push({ id: uid(), totalAmount: total, govAmount: govAmt, userAmount: usrAmt, date, note });

  saveData();
  closeGovSpendModal();
  toast(`✅ รัฐจ่าย ฿${fmtNum(govAmt)} เราจ่าย ฿${fmtNum(usrAmt)}`);
  renderGovPage();
}

// ==================== SPLIT BILLS ====================
function calcShares(amount, type, myPct, spousePct) {
  if (type === 'equal') return { myShare: amount / 2, spouseShare: amount / 2 };
  if (type === 'none')  return { myShare: amount,     spouseShare: 0 };
  return { myShare: amount * myPct / 100, spouseShare: amount * spousePct / 100 };
}

function resetSplitForm() {
  splitPaidBy = 'me';
  splitType   = 'equal';
  document.getElementById('split-name').value         = '';
  document.getElementById('split-amount').value       = '';
  document.getElementById('split-my-pct').value       = '50';
  document.getElementById('split-spouse-pct').value   = '50';
  document.getElementById('split-date').value         = todayStr();
  document.getElementById('split-note').value         = '';
  document.getElementById('custom-ratio-section').style.display = 'none';
  updateSplitPaidByUI();
  updateSplitTypeUI();
}

function updateSplitPaidByUI() {
  document.querySelectorAll('[data-paidby]').forEach(btn => {
    btn.className = 'type-btn';
    if (btn.dataset.paidby === splitPaidBy)
      btn.className = splitPaidBy === 'me' ? 'type-btn active-me' : 'type-btn active-spouse';
  });
}

function updateSplitTypeUI() {
  document.querySelectorAll('[data-stype]').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.stype === splitType)
  );
  document.getElementById('custom-ratio-section').style.display =
    splitType === 'custom' ? 'block' : 'none';
  updateRatioPreview();
}

function updateRatioPreview() {
  if (splitType !== 'custom') return;
  const amount    = parseFloat(document.getElementById('split-amount').value) || 0;
  const myPct     = parseFloat(document.getElementById('split-my-pct').value) || 0;
  const spousePct = parseFloat(document.getElementById('split-spouse-pct').value) || 0;
  const el        = document.getElementById('ratio-preview');
  el.textContent  = amount > 0
    ? `ผม ฿${fmtNum(amount * myPct / 100)}  ·  เมีย ฿${fmtNum(amount * spousePct / 100)}`
    : `${myPct}% + ${spousePct}% = ${myPct + spousePct}%`;
}

function saveSplit() {
  const name   = document.getElementById('split-name').value.trim();
  const amount = parseFloat(document.getElementById('split-amount').value);
  const date   = document.getElementById('split-date').value;
  const note   = document.getElementById('split-note').value.trim();
  const myPct  = parseFloat(document.getElementById('split-my-pct').value) || 50;
  const spPct  = parseFloat(document.getElementById('split-spouse-pct').value) || 50;

  if (!name)                { toast('กรุณาระบุชื่อบิล');   return; }
  if (!amount || amount <= 0) { toast('กรุณากรอกยอดเงิน');  return; }
  if (!date)                { toast('กรุณาเลือกวันที่');   return; }
  if (splitType === 'custom' && myPct + spPct !== 100) {
    toast('สัดส่วนรวมต้องเท่ากับ 100%'); return;
  }

  const { myShare, spouseShare } = calcShares(amount, splitType, myPct, spPct);

  appData.splits.push({
    id: uid(), name, amount, paidBy: splitPaidBy, splitType,
    myPct, spPct, myShare, spouseShare, date, note,
    settled: splitType === 'none',
    settledDate: splitType === 'none' ? date : null,
  });

  saveData();
  toast('✅ บันทึกบิลแล้ว');
  setTimeout(() => goTo('split'), 500);
}

function renderSplits() {
  renderSplitSummary();

  const listEl    = document.getElementById('split-list');
  const isPending = currentSplitTab === 'pending';
  const items     = (appData.splits || []).filter(s => isPending ? !s.settled : s.settled);
  const sorted    = [...items].sort((a, b) => new Date(b.date) - new Date(a.date));

  if (sorted.length === 0) {
    listEl.innerHTML = `<div class="empty-state">
      <div class="empty-icon">${isPending ? '👫' : '✅'}</div>
      <p>${isPending ? 'ไม่มีบิลค้างอยู่<br>กด "+ เพิ่ม" เพื่อบันทึกบิล' : 'ยังไม่มีบิลที่ชำระแล้ว'}</p>
    </div>`;
    return;
  }

  listEl.innerHTML = sorted.map(s => {
    const byMe       = s.paidBy === 'me';
    const byLabel    = byMe ? '🙋 ผมจ่ายก่อน' : '👩 เมียจ่ายก่อน';
    const byColor    = byMe ? '#1565C0' : '#6A1B9A';

    let debtLine = '';
    if (s.splitType !== 'none' && !s.settled) {
      const who = byMe ? 'เมียค้าง' : 'ผมค้าง';
      const amt = byMe ? s.spouseShare : s.myShare;
      debtLine  = `<div class="split-debt-line">${who} <span class="split-debt-amt">฿${fmtNum(amt)}</span></div>`;
    }

    const badge = s.settled
      ? `<span class="loan-status-badge returned">✅ ชำระแล้ว</span>`
      : `<span class="loan-status-badge active">⏳ ค้างอยู่</span>`;

    return `
      <div class="split-card ${byMe ? 'paid-by-me' : 'paid-by-spouse'}"
           onclick="openSplitModal('${s.id}')">
        <div class="split-card-top">
          <div class="split-card-name">${s.name}</div>
          <div class="split-paid-badge" style="color:${byColor}">${byLabel}</div>
        </div>
        <div class="split-card-amount">฿${fmtNum(s.amount)}</div>
        ${s.splitType !== 'none' ? `
          <div class="split-shares-row">
            <span>ผม ฿${fmtNum(s.myShare)}</span>
            <span class="split-dot">·</span>
            <span>เมีย ฿${fmtNum(s.spouseShare)}</span>
          </div>` : '<div class="split-shares-row">ไม่แบ่ง</div>'}
        ${debtLine}
        <div class="split-card-footer">
          <span style="font-size:12px;color:var(--text-muted)">${formatDate(s.date)}</span>
          ${badge}
        </div>
        ${s.note ? `<div class="loan-note-text">📝 ${s.note}</div>` : ''}
      </div>`;
  }).join('');
}

function renderSplitSummary() {
  const card    = document.getElementById('split-summary-card');
  const pending = (appData.splits || []).filter(s => !s.settled && s.splitType !== 'none');

  let spouseOwesMe = 0;
  let iOweSpouse   = 0;
  pending.forEach(s => {
    if (s.paidBy === 'me') spouseOwesMe += s.spouseShare;
    else                    iOweSpouse   += s.myShare;
  });

  const net = spouseOwesMe - iOweSpouse;

  if (pending.length === 0) {
    card.innerHTML = `<div class="split-sum-ok">✅ ไม่มียอดค้างระหว่างกัน</div>`;
    return;
  }

  if (net > 0) {
    card.innerHTML = `
      <div class="split-sum-label">เมียค้างอยู่</div>
      <div class="split-sum-amount" style="color:#C62828">฿${fmtNum(net)}</div>
      <div class="split-sum-sub">${pending.length} บิล</div>`;
  } else if (net < 0) {
    card.innerHTML = `
      <div class="split-sum-label">ผมค้างอยู่</div>
      <div class="split-sum-amount" style="color:#1565C0">฿${fmtNum(Math.abs(net))}</div>
      <div class="split-sum-sub">${pending.length} บิล</div>`;
  } else {
    card.innerHTML = `<div class="split-sum-ok">หักกลบกันแล้ว (${pending.length} บิล)</div>`;
  }
}

function openSplitModal(id) {
  const s = (appData.splits || []).find(x => x.id === id);
  if (!s) return;
  modalSplitId = id;

  const byMe    = s.paidBy === 'me';
  const color   = byMe ? '#1565C0' : '#6A1B9A';
  const byLabel = byMe ? 'ผมจ่ายก่อน' : 'เมียจ่ายก่อน';

  let debtHtml = '';
  if (s.splitType !== 'none' && !s.settled) {
    const who = byMe ? 'เมียค้าง' : 'ผมค้าง';
    const amt = byMe ? s.spouseShare : s.myShare;
    debtHtml  = `<div style="font-size:16px;color:#C62828;font-weight:700;margin-top:6px">${who} ฿${fmtNum(amt)}</div>`;
  }

  document.getElementById('split-modal-info').innerHTML = `
    <div style="font-size:13px;color:#9CA3AF;margin-bottom:4px">${formatDate(s.date)}</div>
    <div style="font-weight:700;font-size:17px">${s.name}</div>
    <div style="font-size:28px;font-weight:800;color:${color};margin:6px 0">฿${fmtNum(s.amount)}</div>
    <div style="font-size:13px;color:#555">${byLabel}</div>
    ${s.splitType !== 'none'
      ? `<div style="font-size:13px;color:#9CA3AF;margin-top:4px">ผม ฿${fmtNum(s.myShare)} · เมีย ฿${fmtNum(s.spouseShare)}</div>`
      : `<div style="font-size:13px;color:#9CA3AF;margin-top:4px">ไม่แบ่ง (จ่ายคนเดียว)</div>`}
    ${debtHtml}
    ${s.settled ? `<div style="font-size:13px;color:#2E7D32;margin-top:6px">✅ ชำระแล้ว ${s.settledDate ? formatDate(s.settledDate) : ''}</div>` : ''}
    ${s.note ? `<div style="font-size:13px;color:#9CA3AF;margin-top:6px">📝 ${s.note}</div>` : ''}
  `;

  document.getElementById('btn-settle-split').style.display =
    (!s.settled && s.splitType !== 'none') ? '' : 'none';

  document.getElementById('split-modal-overlay').classList.add('show');
}

function closeSplitModal() {
  document.getElementById('split-modal-overlay').classList.remove('show');
  modalSplitId = null;
}

function settleSplit() {
  const s = (appData.splits || []).find(x => x.id === modalSplitId);
  if (!s) return;
  s.settled     = true;
  s.settledDate = todayStr();
  saveData();
  closeSplitModal();
  toast(s.paidBy === 'me' ? '✅ เมียชำระแล้ว' : '✅ ชำระให้เมียแล้ว');
  renderSplits();
}

function deleteSplitItem() {
  appData.splits = appData.splits.filter(s => s.id !== modalSplitId);
  saveData();
  closeSplitModal();
  toast('🗑 ลบบิลแล้ว');
  renderSplits();
}

// ==================== NOTES ====================
function saveNote() {
  const text = document.getElementById('note-text-input').value.trim();
  if (!text) { toast('กรุณาพิมพ์ข้อความก่อน'); return; }

  appData.notes.unshift({ id: uid(), text, date: todayStr() });
  saveData();
  document.getElementById('note-text-input').value = '';
  renderNotes();
  toast('✅ บันทึกโน้ตแล้ว');
}

function deleteNote(id) {
  appData.notes = appData.notes.filter(n => n.id !== id);
  saveData();
  renderNotes();
  toast('🗑 ลบโน้ตแล้ว');
}

function renderNotes() {
  const listEl = document.getElementById('notes-list');
  if (!appData.notes || appData.notes.length === 0) {
    listEl.innerHTML = `<div class="empty-state">
      <div class="empty-icon">📝</div>
      <p>ยังไม่มีโน้ต<br>จดอะไรกันลืมได้เลย</p>
    </div>`;
    return;
  }
  listEl.innerHTML = appData.notes.map(n => `
    <div class="note-card">
      <div class="note-card-text">${n.text.replace(/\n/g, '<br>')}</div>
      <div class="note-card-footer">
        <span class="note-card-date">${formatDate(n.date)}</span>
        <button class="note-delete-btn" onclick="deleteNote('${n.id}')">🗑</button>
      </div>
    </div>
  `).join('');
}

// ==================== DEMO BANNER ====================
function updateDemoBanner() {
  const banner = document.getElementById('demo-banner');
  if (!banner) return;
  banner.classList.toggle('hidden', appData.transactions.length > 0 || appData.loans.length > 0);
}

function loadDemoData() {
  const y = viewYear, m = viewMonth;

  function d(mo, day) {
    let nm = m + mo, ny = y;
    if (nm < 0) { nm += 12; ny--; }
    return `${ny}-${String(nm + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }

  // Transactions
  [
    { type:'income',  catId:'salary',    catName:'เงินเดือน', catIcon:'💼', amount:35000, note:'เงินเดือน',       date: d(0, 1)  },
    { type:'income',  catId:'freelance', catName:'Freelance', catIcon:'💻', amount:8500,  note:'งาน web design',  date: d(0, 12) },
    { type:'expense', catId:'food',      catName:'อาหาร',     catIcon:'🍔', amount:4200,  note:'ค่าอาหาร',       date: d(0, 5)  },
    { type:'expense', catId:'transport', catName:'เดินทาง',   catIcon:'🚗', amount:1800,  note:'น้ำมัน+รถ',      date: d(0, 8)  },
    { type:'expense', catId:'utility',   catName:'น้ำ-ไฟ',    catIcon:'⚡', amount:1250,  note:'',               date: d(0, 10) },
    { type:'expense', catId:'shopping',  catName:'ช้อปปิ้ง',  catIcon:'🛍️',amount:3600,  note:'ซื้อเสื้อผ้า',   date: d(0, 15) },
    { type:'expense', catId:'health',    catName:'สุขภาพ',    catIcon:'💊', amount:800,   note:'ซื้อยา',          date: d(0, 18) },
    { type:'income',  catId:'salary',    catName:'เงินเดือน', catIcon:'💼', amount:35000, note:'',               date: d(-1, 1) },
    { type:'income',  catId:'bonus',     catName:'โบนัส',     catIcon:'🎉', amount:5000,  note:'โบนัสพิเศษ',     date: d(-1,15) },
    { type:'expense', catId:'food',      catName:'อาหาร',     catIcon:'🍔', amount:4500,  note:'',               date: d(-1, 7) },
    { type:'expense', catId:'shopping',  catName:'ช้อปปิ้ง',  catIcon:'🛍️',amount:5200,  note:'ซื้อรองเท้า',    date: d(-1,20) },
    { type:'income',  catId:'salary',    catName:'เงินเดือน', catIcon:'💼', amount:35000, note:'',               date: d(-2, 1) },
    { type:'expense', catId:'food',      catName:'อาหาร',     catIcon:'🍔', amount:3900,  note:'',               date: d(-2, 8) },
    { type:'income',  catId:'salary',    catName:'เงินเดือน', catIcon:'💼', amount:35000, note:'',               date: d(-3, 1) },
    { type:'income',  catId:'invest',    catName:'ลงทุน',     catIcon:'📈', amount:2300,  note:'ดอกเบี้ย',       date: d(-3,20) },
    { type:'expense', catId:'food',      catName:'อาหาร',     catIcon:'🍔', amount:4100,  note:'',               date: d(-3, 9) },
  ].forEach(tx => appData.transactions.push({ id: uid(), ...tx }));

  // Loans
  appData.loans.push(
    { id: uid(), direction: 'lend',   person: 'สมชาย',  amount: 5000,  borrowDate: d(-1, 10), dueDate: d(0, 20), returnDate: null,     note: 'ยืมซื้อของ'       },
    { id: uid(), direction: 'lend',   person: 'มานี',   amount: 2500,  borrowDate: d(-2, 5),  dueDate: d(-1,  5), returnDate: null,     note: 'ค่าเช่าห้อง'      },
    { id: uid(), direction: 'borrow', person: 'พ่อ',    amount: 10000, borrowDate: d(-1, 1),  dueDate: d(0,   1), returnDate: null,     note: 'ยืมฉุกเฉิน'       },
    { id: uid(), direction: 'lend',   person: 'สุดา',   amount: 1000,  borrowDate: d(-3, 12), dueDate: d(-2, 12), returnDate: d(-2, 10), note: 'ยืมค่ากาแฟ'      },
  );

  saveData();
  toast('✅ โหลดข้อมูลตัวอย่างแล้ว');
  updateDashboard();
}

// ==================== HELPERS ====================
function fmtNum(n) {
  return new Intl.NumberFormat('th-TH').format(Math.round(n * 100) / 100);
}

function fmtCurrency(n, withSign = false) {
  const prefix = withSign ? (n > 0 ? '+฿' : n < 0 ? '-฿' : '฿') : '฿';
  return prefix + fmtNum(Math.abs(n));
}

function formatDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('th-TH', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
}

function monthLabel(m, y) {
  return new Date(y, m, 1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function daysDiff(dateStr) {
  const today = new Date(todayStr());
  const due   = new Date(dateStr);
  return Math.ceil((due - today) / 86400000);
}

let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ==================== SERVICE WORKER ====================
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
