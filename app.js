import { addDays, addMonths, dayLabel, daySummary, history, ledger, money, monthLabel, monthSummary, parseAmount, percent, selectMonth, shortDate, symbol, tone, today, tradeNet } from './domain.js';
import { esc } from './html.js';
import { tradeFields, bindTradeNet, tradeFromForm } from './trade-form.js';
import { reportView } from './report-view.js';
import { createStorage, loadState } from './storage.js';
import { installViewport } from './viewport.js';

const storage = createStorage(localStorage, sessionStorage, navigator.locks);
const NAV = ['daily', 'monthly', 'report', 'journal', 'accounts'];
const NAV_LABELS = { daily: 'Diario', monthly: 'Mensual', report: 'Informe', journal: 'Bitácora', accounts: 'Cuentas' };

let state;
const app = document.querySelector('#app');
installViewport(app);
const notice = document.querySelector('#notice');

const active = () => state.accounts.find(account => account.id === state.accountId) || state.accounts[0] || null;
const dataFor = () => ({ accounts: state.accounts, trades: state.trades });

let cachedBook = null;
const save = (dataChanged = false) => {
  storage.writeView(state);
  if (!dataChanged) return;
  cachedBook=null;
  return storage.write(state).catch(error=>{
    storage.restoreData(state);
    throw error;
  });
};
let noticeTimer;
const showNotice = text => {
  clearTimeout(noticeTimer); notice.textContent=text; notice.hidden=false;
  if (!text.includes('otra pestaña')) noticeTimer=setTimeout(()=>{notice.hidden=true;},2600);
};
state = await loadState(storage);
state.dailyAnchor ||= state.date || today();
state.monthAnchor ||= state.month || state.dailyAnchor.slice(0, 7);
if (state.date > today()) state.date = today();
if (state.dailyAnchor > today()) state.dailyAnchor = today();
if (state.monthAnchor > today().slice(0, 7)) state.monthAnchor = today().slice(0, 7);
state.loadedDays = Math.min(120, Math.max(9, Number(state.loadedDays) || 9));
state.loadedMonths = Math.min(60, Math.max(7, Number(state.loadedMonths) || 7));
state.month = state.date.slice(0, 7);
// A saved scroll window must not leave today's card outside Diario on startup.
if (state.view === 'daily') state.dailyAnchor = today();
const book = () => {
  const account = active();
  if (!account) return [];
  if (cachedBook?.accountId !== account.id) cachedBook = {accountId:account.id, days:ledger(account,dataFor())};
  return cachedBook.days;
};
const day = () => { const account = active(); return account ? daySummary(account, book(), state.date) : null; };
const toneFor = value => tone(value);
const metric = (label, value, className) => '<div class="metric"><span>' + label + '</span>' + (String(value).trim().startsWith('<') ? value : '<strong class="' + (className || 'positive') + '">' + value + '</strong>') + '</div>';
const nav = () => NAV.map(view => '<button class="nav-item ' + (state.view === view ? 'active' : '') + '" data-nav="' + view + '">' + NAV_LABELS[view] + '</button>').join('');
const accountPicker = account => '<div class="account-picker-wrap"><select class="account-picker" data-account-select aria-label="Seleccionar cuenta">' + state.accounts.map(item => '<option value="' + esc(item.id) + '" ' + (item.id === account.id ? 'selected' : '') + '>CUENTA NUMERO ' + esc(item.number) + '</option>').join('') + '</select><span class="triangle" aria-hidden="true"></span></div>';
const labelDate = date => dayLabel(date);
let swipe = null;
let wheelTimer;
let wheelCooldown = 0;
let deleteConfirm = false;
let createdAccountNumber = null;
let accountDraft = null;
let accountSuccessTimer;
let editingTradeId = null;
const tradeAnimationPromises = new WeakMap();

function viewContent(context = state) {
  const previous = state;
  state = context;
  try {
    const account = active();
    if (state.view === 'accounts') return accountsView(account);
    return account ? (state.view === 'daily' ? dailyView(account) : state.view === 'monthly' ? monthlyView(account) : state.view === 'journal' ? journalView(account) : reportView(account,dataFor())) : emptyState();
  } finally { state = previous; }
}

function render(focusSelection = false, animate = true) {
  clearSwipe();
  const account = active();
  app.innerHTML = '<header class="app-header app-header-' + state.view + '">' + (account ? accountPicker(account) : '') + '</header><main class="screen' + (animate ? '' : ' no-entry-animation') + '" data-screen><div class="screen-page">' + viewContent() + '</div></main><nav class="bottom-nav">' + nav() + '</nav>';
  bindDynamic();
  positionContent(document.querySelector('.screen-page'), state, focusSelection);
}

function positionContent(root, context, focusSelection) {
  if (context.view === 'accounts' && context.historyMonth && (context.accountsMode || 'history') === 'history') {
    const historyList = root.querySelector('.history-scroll');
    const month = root.querySelector('#history-' + context.historyMonth);
    if (historyList && month) historyList.scrollTop += month.getBoundingClientRect().top - historyList.getBoundingClientRect().top;
  }
  if (focusSelection) {
    const list = root.querySelector('.scroll-region');
    const selected = list?.querySelector('.selected');
    if (list) {
      list.scrollTop = selected ? Math.max(0, selected.offsetTop) : 0;
      list.dataset.restoredTop = list.scrollTop;
    }
  }
}

function emptyState() { return '<div class="empty-account"><h1>CUENTAS</h1><p>Ve a la pestaña Cuentas para añadir tu primera cuenta.</p></div>'; }

function dailyView(account) {
  const days = [];
  const currentDate = today();
  const latest = state.dailyAnchor > currentDate ? currentDate : state.dailyAnchor;
  for (let index = 0; index < state.loadedDays; index++) days.push(addDays(latest, -index));
  const rows = days.map(date => {
    const item = daySummary(account, book(), date);
    const result = item.profit === null ? '-- ' + symbol(account.currency) + ' / -- %' : money(item.profit, account.currency, true) + ' / ' + percent(item.percentage, true);
    return '<button class="rapid-card ' + (date === state.date ? 'selected' : '') + '" data-select-date="' + date + '"><span class="rapid-date">' + esc(labelDate(date)) + '</span><span class="rapid-result ' + toneFor(item.profit) + '">' + result + '</span></button>';
  }).join('');
  return '<div class="view daily-view"><div class="scroll-region" data-list="daily"><div class="list-loader">Desliza abajo para cargar días anteriores</div>' + rows + '</div>' + dailyDetail(account) + '</div>';
}

function dailyDetail(account) {
  const item = day();
  const profit = '<span class="inline-value ' + toneFor(item.profit) + '">' + money(item.profit, account.currency, false) + '</span>';
  const expected = item.expected === null ? '-- ' + symbol(account.currency) : money(item.expected, account.currency, false);
  const expectedPercent = item.expectedPercent === null ? '-- %' : percent(item.expectedPercent);
  return '<section class="detail-panel"><div class="detail-heading"><h2>DESGLOSE ' + esc(shortDate(state.date)) + '</h2><button class="icon-button" data-go-journal aria-label="Editar en Bitácora">✎</button></div><div class="metrics">' +
    metric('CAPITAL INICIAL', money(item.start, account.currency, false)) +
    metric('BENEFICIO ESPERABLE', expected, toneFor(item.expected)) +
    metric('BENEFICIO DEL DÍA', profit, toneFor(item.profit)) +
    metric('PORCENTAJE ESPERABLE', expectedPercent, toneFor(item.expectedPercent)) +
    metric('PORCENTAJE DEL DÍA', item.percentage === null ? '-- %' : percent(item.percentage), toneFor(item.percentage)) +
    metric('CAPITAL FINAL', money(item.end, account.currency, false), toneFor(item.profit)) +
    metric('BENEFICIO ACUMULADO', money(item.accumulated, account.currency, false), toneFor(item.accumulated)) +
    metric('PORCENTAJE ACUMULADO', percent(item.accumulatedPercent), toneFor(item.accumulatedPercent)) + '</div></section>';
}

function monthlyView(account) {
  const months = [];
  for (let index = 0; index < state.loadedMonths; index++) months.push(addMonths(state.monthAnchor, -index));
  const rows = months.map(month => {
    const item = monthSummary(account, book(), month);
    const result = item.profit === null ? '-- ' + symbol(account.currency) + ' / -- %' : money(item.profit, account.currency, true) + ' / ' + percent(item.percentage, true);
    return '<button class="rapid-card ' + (month === state.month ? 'selected' : '') + '" data-select-month="' + month + '"><span class="rapid-date">' + esc(monthLabel(month)) + '</span><span class="rapid-result ' + toneFor(item.profit) + '">' + result + '</span></button>';
  }).join('');
  return '<div class="view monthly-view"><div class="scroll-region" data-list="months"><div class="list-loader">Desliza abajo para cargar meses anteriores</div>' + rows + '</div>' + monthlyDetail(account) + '</div>';
}

function monthlyDetail(account) {
  const item = monthSummary(account, book(), state.month);
  const expected = item.expected === null ? '-- ' + symbol(account.currency) : money(item.expected, account.currency, false);
  return '<section class="detail-panel"><div class="detail-heading"><h2>DESGLOSE ' + esc(monthLabel(state.month).toUpperCase()) + '</h2><button class="icon-button" data-open-journal-month="' + state.month + '" aria-label="Ver operaciones del mes en Bitácora">◉</button></div><div class="metrics">' +
    metric('CAPITAL INICIAL', money(item.start, account.currency, false)) + metric('BENEFICIO ESPERABLE', expected, toneFor(item.expected)) +
    metric('BENEFICIO DEL MES', item.profit === null ? '-- ' + symbol(account.currency) : money(item.profit, account.currency, false), toneFor(item.profit)) +
    metric('PORCENTAJE ESPERABLE', item.expectedPercent === null ? '-- %' : percent(item.expectedPercent), toneFor(item.expectedPercent)) +
    metric('PORCENTAJE DEL MES', item.percentage === null ? '-- %' : percent(item.percentage), toneFor(item.percentage)) +
    metric('CAPITAL FINAL', money(item.end, account.currency, false), toneFor(item.profit)) +
    metric('BENEFICIO ACUMULADO', money(item.accumulated, account.currency, false), toneFor(item.accumulated)) +
    metric('PORCENTAJE ACUMULADO', percent(item.accumulatedPercent), toneFor(item.accumulatedPercent)) + '</div></section>';
}

const monthRange = month => ({from:`${month}-01`,to:addDays(`${addMonths(month,1)}-01`,-1)});
const journalRange = (context=state) => context.journalFrom && context.journalTo
  ? {from:context.journalFrom,to:context.journalTo}
  : context.journalScope==='day'
    ? {from:context.date,to:context.date}
    : monthRange(context.month);

function journalView(account) {
  const {from,to}=journalRange();
  const trades = state.trades.filter(trade => {
    const closed=(trade.closedAt||trade.date||'').slice(0,10);
    return trade.accountId===account.id && closed>=from && closed<=to;
  }).sort((a,b)=>(a.closedAt||a.date).localeCompare(b.closedAt||b.date));
  let lastDate = null;
  const rows = trades.map(trade => {
    const closed=(trade.closedAt||trade.date).slice(0,10);
    const heading = closed !== lastDate ? '<h2 class="journal-day">' + esc(labelDate(closed)) + '</h2>' : '';
    lastDate = closed;
    return heading + tradeRow(trade);
  }).join('');
  const filter=(name,value,label)=>'<label class="journal-date-filter"><span>'+label+'</span><input type="date" data-journal-'+name+' aria-label="'+label+'" value="'+esc(value)+'"><span class="triangle" aria-hidden="true"></span></label>';
  return '<div class="view journal-view"><div class="journal-scroll"><div class="journal-filters">'+filter('from',from,'DESDE:')+filter('to',to,'HASTA:')+'</div>'+
    '<article class="journal-new-card" data-new-trade><button type="button" class="journal-add-button" data-add-trade aria-expanded="false">+ AÑADIR OPERACIÓN</button></article>'+
    '<div class="journal-entries">' + (trades.length ? rows : '<div class="empty-card"><strong>No hay operaciones en este intervalo</strong><span>Puedes añadir una operación de cualquier fecha o cambiar el filtro.</span></div>') + '</div></div></div>';
}

function tradeRow(trade) {
  const net=tradeNet(trade), open=trade.openedAt?.slice(11,16)||'--:--', close=trade.closedAt?.slice(11,16)||'--:--';
  const expanded=editingTradeId===trade.id;
  return '<article class="trade-row' + (expanded?' expanded':'') + '" data-trade-id="' + esc(trade.id) + '"><button type="button" class="trade-row-summary" data-edit-trade="' + esc(trade.id) + '" aria-expanded="' + expanded + '"><span><strong>' + esc(trade.symbol) + ' · ' + esc(trade.direction) + '</strong><small>' + esc(open) + '–' + esc(close) + ' · Entrada ' + esc(trade.entry) + ' · Cierre ' + esc(trade.closePrice ?? '—') + '</small><small>Posición ' + esc(trade.size) + ' · Comisión ' + money(Number(trade.commission)||0,active().currency,false) + ' · Swap ' + money(Number(trade.swap)||0,active().currency,false) + '</small></span><b class="' + toneFor(net) + '">' + money(net, active().currency, true) + '</b></button>' + (expanded?tradeEditForm(trade):'') + '</article>';
}

function tradeEditForm(trade) {
  return '<form class="trade-edit-form" data-trade-edit-form="'+esc(trade.id)+'">'+tradeFields(trade,active())+'<p data-trade-edit-notice role="status" hidden></p><button class="primary-button wide" data-save-trade>GUARDAR CAMBIOS</button>'+tradeDeleteButton()+'</form>';
}
const tradeDeleteButton = () => '<button type="button" class="delete-account-button" data-delete-trade>ELIMINAR OPERACIÓN</button>';

function accountsView(account) {
  const mode=state.accountsMode || 'history';
  const controls = '<div class="account-actions"><button class="account-mode-button ' + (mode === 'adjust' ? 'selected' : '') + '" data-account-mode="adjust" ' + (account ? '' : 'disabled') + '>AJUSTAR</button><button class="account-mode-button ' + (mode === 'create' ? 'selected' : '') + '" data-account-mode="create">+ AÑADIR CUENTA</button></div>';
  const editor = mode === 'adjust' && account ? accountEditor(account) : mode === 'create' ? createAccountEditor(account) : '';
  const sections = mode === 'create' ? '' : account ? accountHistory(account) : '<div class="empty-card"><strong>No hay cuentas registradas</strong><span>Añade la primera cuenta para comenzar.</span></div>';
  return '<div class="view accounts-view"><div class="history-scroll accounts-scroll" data-list="history">' + controls + editor + sections + '</div></div>';
}
function createAccountEditor(account) {
  accountDraft ||= {initial:'',created:today(),currency:account?.currency || 'EUR',cost:'',firm:'',type:'',number:''};
  const input = (label,name,type='text') => '<label class="account-field"><span>' + label + '</span><input name="' + name + '" value="' + esc(accountDraft[name]) + '" type="' + type + '" ' + (name==='initial'||name==='cost'?'inputmode="decimal"':'') + ' required></label>';
  const currency = '<label class="account-field"><span>MONEDA</span><select name="currency"><option value="EUR" ' + (accountDraft.currency==='EUR'?'selected':'') + '>€</option><option value="USD" ' + (accountDraft.currency==='USD'?'selected':'') + '>$</option></select></label>';
  const action = createdAccountNumber
    ? '<div class="account-created-message" data-account-created role="status">¡CUENTA ' + esc(createdAccountNumber) + ' REGISTRADA!</div>'
    : '<button class="save-account-button" data-save-account type="submit">GUARDAR NUEVA CUENTA</button>';
  return '<form class="account-create-form" data-create-account autocomplete="off"><section class="account-editor-card"><h1>CREACIÓN DE NUEVA CUENTA</h1>' +
    input('CAPITAL INICIAL','initial') + input('FECHA DE COMPRA','created','date') + currency + input('PRECIO DE COMPRA','cost') + input('PROP FIRM','firm') + input('TIPO DE CUENTA','type') + input('NÚMERO ID','number') + '</section>' + action + '</form>';
}
function accountEditor(account) {
  const fields = [
    ['CAPITAL INICIAL','initial',money(account.initial,account.currency,false)],
    ['FECHA DE COMPRA','created',shortDate(account.created)],
    ['MONEDA','currency',symbol(account.currency)],
    ['PRECIO DE COMPRA','cost',money(account.cost,account.currency,false)],
    ['PROP FIRM','firm',account.firm],
    ['TIPO DE CUENTA','type',account.type || '—'],
    ['NÚMERO DE ID','number',account.number]
  ].map(([label,name,value])=>'<div class="account-field"><span>' + label + '</span><button type="button" data-edit-account-field="' + name + '">' + esc(value) + '</button></div>').join('');
  const removal = deleteConfirm
    ? '<div class="delete-confirm" data-confirm-delete><div>¿ESTÁS SEGURO?</div><button data-delete-account-now>SÍ, ELIMINAR</button><button class="cancel" data-cancel-delete>NO, RETROCEDER</button></div>'
    : '<button class="delete-account-button" data-delete-account>ELIMINAR CUENTA</button>';
  return '<section class="account-editor-card" data-account-editor><h1>AJUSTES DE CUENTA NÚMERO ' + esc(account.number) + '</h1>' + fields + '</section>' + removal;
}
function accountHistory(account) {
  const records = history(account, dataFor());
  const grouped = new Map();
  records.forEach(item => { const month = item.date.slice(0, 7); if (!grouped.has(month)) grouped.set(month, []); grouped.get(month).push(item); });
  return [...grouped.keys()].sort().map(month => '<section class="history-month" id="history-' + month + '"><h2>' + esc(monthLabel(month)) + '</h2>' + grouped.get(month).sort((a, b) => a.date.localeCompare(b.date)).map(item => historyRow(item, account)).join('') + '</section>').join('');
}
function historyRow(item, account) {
  return '<article class="account-history-card created-event"><time>' + esc(shortDate(item.date)) + '</time><span>Creada cuenta de <strong>' + esc(account.initial.toLocaleString('es-ES',{maximumFractionDigits:2})) + ' ' + symbol(account.currency) + '</strong> en ' + esc(account.firm) + ' por ' + money(account.cost, account.currency, false) + '</span></article>';
}
function bindDynamic() {
  document.querySelectorAll('[data-select-date]').forEach(button => button.addEventListener('click', () => selectDate(button.dataset.selectDate)));
  document.querySelectorAll('[data-select-month]').forEach(button => button.addEventListener('click', () => selectMonthCard(button.dataset.selectMonth)));
  document.querySelectorAll('.scroll-region').forEach(list => {
    let lastTop = list.scrollTop;
    list.addEventListener('scroll', () => {
      const top = list.scrollTop;
      if (list.dataset.restoredTop !== undefined && Math.abs(top - Number(list.dataset.restoredTop)) < 1) {
        delete list.dataset.restoredTop; lastTop = top; return;
      }
      const direction = top < lastTop ? -1 : 1;
      lastTop = top;
      if ((direction < 0 && top < 40) || (direction > 0 && top + list.clientHeight >= list.scrollHeight - 40)) loadMore(list, direction);
    });
    // Wheel events also cover the boundary where scrollTop is already zero.
    list.addEventListener('wheel', event => {
      if (event.deltaY < 0 && list.scrollTop === 0) loadMore(list, -1);
      else if (event.deltaY > 0 && list.scrollTop + list.clientHeight >= list.scrollHeight - 1) loadMore(list, 1);
    }, { passive:true });
  });
  bindDetailControls();
  bindJournalControls(document);
  document.querySelectorAll('[data-nav]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.nav)));
  bindAccountPicker();
  bindAccountControls(document);
  const screen = document.querySelector('[data-screen]');
  if (screen) {
    screen.addEventListener('pointerdown', gestureStart, { passive:true });
    screen.addEventListener('pointermove', gestureMove, { passive:true });
    screen.addEventListener('pointerup', gestureEnd, { passive:true });
    screen.addEventListener('pointercancel', () => { gesture.active=false; suppressClick=true; settleSwipe(true); });
    screen.addEventListener('wheel', horizontalWheel, { passive:false });
    screen.addEventListener('click', suppressSwipeClick, true);
  }
}
// Serialize accordion actions so rapid taps cannot insert duplicate editors.
let journalActions = Promise.resolve();
function queueJournalAction(action) {
  journalActions = journalActions.then(action).catch(error=>showNotice(error.message));
}
function bindJournalControls(root) {
  const journal=root.matches?.('.journal-view')?root:root.querySelector('.journal-view');
  if (!journal || journal.dataset.bound) return;
  journal.dataset.bound='true';
  journal.querySelectorAll('[data-journal-from], [data-journal-to]').forEach(input=>input.addEventListener('change',()=>{
    const previous=journalRange();
    const form=journal.querySelector('[data-trade-edit-form]');
    if (form) {
      input.value=input.hasAttribute('data-journal-from')?previous.from:previous.to;
      showNotice('Guarda o cierra la edición antes de cambiar las fechas.');
      return;
    }
    const next={...previous,[input.hasAttribute('data-journal-from')?'from':'to']:input.value};
    if (!input.value || next.from>next.to) {
      input.value=input.hasAttribute('data-journal-from')?previous.from:previous.to;
      showNotice('Selecciona un intervalo de fechas válido.');
      return;
    }
    if (input.hasAttribute('data-journal-from')) state.journalFrom=input.value;
    else state.journalTo=input.value;
    save();
    refreshJournal();
  }));
  journal.addEventListener('click',event=>{
    const dateArrow=event.target.closest('.journal-date-filter .triangle');
    if (dateArrow) {
      dateArrow.closest('label').querySelector('input').showPicker?.();
      return;
    }
    const add=event.target.closest('[data-add-trade]');
    const edit=event.target.closest('[data-edit-trade]');
    const close=event.target.closest('[data-close-new-trade]');
    if (add) queueJournalAction(()=>add.isConnected && openTrade());
    else if (edit) queueJournalAction(()=>edit.isConnected && toggleTradeEditor(edit));
    else if (close) queueJournalAction(()=>close.isConnected && closeTradeEditor(close.closest('.trade-row'),close.closest('form')));
  });
  journal.querySelectorAll('[data-trade-edit-form]').forEach(bindTradeEditForm);
}
function bindTradeEditForm(form) {
  bindTradeNet(form,active());
  form.addEventListener('click',event=>{
    if (form.dataset.saving) return;
    if (event.target.closest('[data-delete-trade]')) {
      form.querySelector('[data-delete-trade]').outerHTML='<div class="delete-confirm" data-confirm-delete-trade><div>¿ESTÁS SEGURO?</div><button type="button" data-delete-trade-now>SÍ, ELIMINAR</button><button type="button" class="cancel" data-cancel-delete-trade>NO, RETROCEDER</button></div>';
    } else if (event.target.closest('[data-cancel-delete-trade]')) {
      form.querySelector('[data-confirm-delete-trade]').outerHTML=tradeDeleteButton();
    } else if (event.target.closest('[data-delete-trade-now]')) {
      deleteEditedTrade(form);
    }
  });
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if (form.dataset.saving) return;
    const trade=state.trades.find(item=>item.id===form.dataset.tradeEditForm&&item.accountId===active()?.id);
    if(!trade) return;
    try {
      const changes=tradeFromForm(form,trade);
      form.dataset.saving='true';
      Object.assign(trade,changes);
      editingTradeId=null;
      await save(true);
      const journal=form.closest('.journal-view');
      await closeTradeEditor(form.closest('.trade-row'),form);
      if (journal?.isConnected) refreshJournal();
    } catch(error) {
      delete form.dataset.saving;
      const message=form.querySelector('[data-trade-edit-notice]');
      message.textContent=error.message;
      message.hidden=false;
    }
  });
}
async function deleteEditedTrade(form) {
  const tradeId=form.dataset.tradeEditForm, account=active();
  if (form.dataset.saving || !state.trades.some(trade=>trade.id===tradeId&&trade.accountId===account?.id)) return;
  const card=form.closest('.trade-row'), journal=form.closest('.journal-view');
  form.dataset.saving='true';
  state.trades=state.trades.filter(trade=>trade.id!==tradeId);
  try {
    await save(true);
    await closeTradeEditor(card,form);
    if (journal?.isConnected) refreshJournal();
  } catch(error) {
    delete form.dataset.saving;
    const message=form.querySelector('[data-trade-edit-notice]');
    message.textContent=error.message;
    message.hidden=false;
  }
}
async function toggleTradeEditor(button) {
  const card=button.closest('.trade-row');
  if(!card) return;
  if(card.dataset.tradeAnimating) {
    await tradeAnimationPromises.get(card);
    if(button.isConnected) await toggleTradeEditor(button);
    return;
  }
  const currentForm=card.querySelector('[data-trade-edit-form]');
  if (currentForm?.dataset.saving) return;
  if(currentForm) {
    editingTradeId=null;
    await closeTradeEditor(card,currentForm);
    return;
  }
  const openForm=document.querySelector('[data-trade-edit-form], [data-new-trade-form]');
  if(openForm) await closeTradeEditor(openForm.closest('.trade-row'),openForm);
  const trade=state.trades.find(item=>item.id===button.dataset.editTrade&&item.accountId===active()?.id);
  if(!trade||!card.isConnected) return;
  editingTradeId=trade.id;
  card.classList.add('expanded');
  button.setAttribute('aria-expanded','true');
  card.insertAdjacentHTML('beforeend',tradeEditForm(trade));
  const form=card.querySelector('[data-trade-edit-form]');
  bindTradeEditForm(form);
  await animateTradeEditor(card,form,true);
}
async function closeTradeEditor(card,form) {
  if(!card||!form) return;
  if(card.dataset.tradeAnimating) {
    await tradeAnimationPromises.get(card);
    if(form.isConnected) await closeTradeEditor(card,form);
    return;
  }
  card.querySelector('[data-edit-trade]')?.setAttribute('aria-expanded','false');
  card.querySelector('[data-add-trade]')?.setAttribute('aria-expanded','false');
  await animateTradeEditor(card,form,false);
  form.remove();
  card.classList.remove('expanded');
  if(editingTradeId===card.dataset.tradeId) editingTradeId=null;
}
async function animateTradeEditor(card,form,opening) {
  const duration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:180;
  const style=getComputedStyle(form), height=form.offsetHeight;
  const expanded={height:height+'px',opacity:1,paddingTop:style.paddingTop,paddingBottom:style.paddingBottom,borderTopColor:style.borderTopColor,transform:'translateY(0)'};
  const collapsed={height:'0px',opacity:0,paddingTop:'0px',paddingBottom:'0px',borderTopColor:'transparent',transform:'translateY(-6px)'};
  card.dataset.tradeAnimating=opening?'opening':'closing';
  form.style.overflow='hidden';
  const animation=form.animate(opening?[collapsed,expanded]:[expanded,collapsed],{duration,easing:'cubic-bezier(.22,.8,.25,1)',fill:'forwards'});
  const completion=animation.finished.catch(()=>{});
  tradeAnimationPromises.set(card,completion);
  await completion;
  // Return to natural height; retained fill would clip validation messages.
  if (!opening) form.hidden=true;
  animation.cancel();
  if(tradeAnimationPromises.get(card)===completion) {
    tradeAnimationPromises.delete(card);
    form.style.overflow='';
    delete card.dataset.tradeAnimating;
  }
}
function refreshJournal(focusTradeId=null) {
  if(state.view!=='journal') return;
  const current=document.querySelector('.journal-view');
  if(!current) return;
  const list=current.querySelector('.journal-scroll'), scroll=list.scrollTop;
  const template=document.createElement('template');
  template.innerHTML=journalView(active());
  const fresh=template.content;
  const entries=current.querySelector('.journal-entries');
  const existing=new Map([...entries.querySelectorAll('[data-trade-id]')].map(row=>[row.dataset.tradeId,row]));
  const ordered=[...fresh.querySelector('.journal-entries').children].map(node=>{
    const row=existing.get(node.dataset.tradeId);
    if (!row) return node;
    row.querySelector('.trade-row-summary').innerHTML=node.querySelector('.trade-row-summary').innerHTML;
    return row;
  });
  const keep=new Set(ordered);
  [...entries.children].forEach(node=>{if(!keep.has(node)) node.remove();});
  ordered.forEach((node,index)=>{if(entries.children[index]!==node) entries.insertBefore(node,entries.children[index]||null);});
  list.scrollTop=scroll;
  if(focusTradeId) entries.querySelector('[data-trade-id="'+CSS.escape(focusTradeId)+'"]')?.scrollIntoView({block:'nearest'});
}
function bindAccountPicker() {
  document.querySelector('[data-account-select]')?.addEventListener('change', event => { clearTimeout(accountSuccessTimer); editingTradeId=null; state.accountId = event.target.value; state.historyMonth = null; state.accountsMode = 'history'; deleteConfirm = false; createdAccountNumber = null; accountDraft=null; if (state.view === 'daily') state.dailyAnchor = today(); save(); render(true); });
}
function bindAccountControls(root) {
  root.querySelectorAll('[data-account-mode]').forEach(button => button.addEventListener('click', () => {
    clearTimeout(accountSuccessTimer);
    const nextMode=state.accountsMode === button.dataset.accountMode ? 'history' : button.dataset.accountMode;
    if (nextMode==='create'&&state.accountsMode!=='create') accountDraft=null;
    state.accountsMode=nextMode; deleteConfirm = false; createdAccountNumber = null; save(); refreshAccounts();
  }));
  root.querySelectorAll('[data-edit-account-field]').forEach(button => button.addEventListener('click', () => startAccountFieldEdit(button)));
  root.querySelector('[data-delete-account]')?.addEventListener('click', () => { deleteConfirm = true; refreshAccounts(); });
  root.querySelector('[data-cancel-delete]')?.addEventListener('click', () => { deleteConfirm = false; refreshAccounts(); });
  root.querySelector('[data-delete-account-now]')?.addEventListener('click', deleteActiveAccount);
  root.querySelector('[data-create-account]')?.addEventListener('submit', saveNewAccount);
}
function refreshAccounts(focusSelection=false) {
  if(state.view!=='accounts') return;
  const page=document.querySelector('.screen-page'); if(!page) return;
  page.classList.add('no-entry-animation');
  page.innerHTML=accountsView(active()); bindAccountControls(page); positionContent(page,state,focusSelection);
}
function refreshAccountPicker() {
  const header=document.querySelector('.app-header'); if(!header) return;
  const account=active(); header.innerHTML=account?accountPicker(account):''; bindAccountPicker();
}
async function saveNewAccount(event) {
  event.preventDefault();
  const form=event.currentTarget;
  if (form.dataset.saving) return;
  try {
    const values=Object.fromEntries(new FormData(form));
    const initial=parseAmount(values.initial), cost=parseAmount(values.cost);
    const number=values.number.trim(), firm=values.firm.trim(), type=values.type.trim();
    if(initial===null||cost===null||initial<=0||cost<0||!number||!firm||!type||!values.created) throw new Error('Completa todos los datos con valores válidos.');
    if(state.accounts.some(account=>account.number===number)) throw new Error('Ya existe una cuenta con ese número.');
    accountDraft={...values,initial:String(initial),cost:String(cost),number,firm,type};
    const account={id:crypto.randomUUID(),number,initial,currency:values.currency,cost,firm,type,created:values.created};
    form.dataset.saving='true';
    state.accounts.push(account); state.accountId=account.id;
    await save(true);
    createdAccountNumber=number; refreshAccountPicker(); refreshAccounts();
    clearTimeout(accountSuccessTimer);
    accountSuccessTimer=setTimeout(()=>{
      createdAccountNumber=null; accountDraft=null; state.accountsMode='history'; save();
      if(state.view==='accounts') refreshAccounts(true);
    },2000);
  } catch(error) { delete form.dataset.saving; showNotice(error.message); }
}
function startAccountFieldEdit(button) {
  const account=active();
  if (!account) return;
  const field=button.dataset.editAccountField;
  const input=field==='currency' ? document.createElement('select') : document.createElement('input');
  input.className='account-field-input'; input.name=field; input.setAttribute('aria-label',button.previousElementSibling.textContent);
  if (field==='currency') input.innerHTML='<option value="EUR">€</option><option value="USD">$</option>';
  else if (field==='created') input.type='date';
  else if (field==='initial'||field==='cost') input.inputMode='decimal';
  input.value=String(account[field] ?? ''); button.replaceWith(input); input.focus(); if (input.select) input.select();
  let committed=false;
  const commit=async()=>{
    if (committed) return;
    try {
      let value=input.value.trim();
      if (field==='initial'||field==='cost') value=parseAmount(value);
      if (value===null||value===''||(field==='initial'&&value<=0)||(field==='cost'&&value<0)) throw new Error('Introduce un valor válido.');
      if (field==='number'&&state.accounts.some(item=>item.id!==account.id&&item.number===value)) throw new Error('Ya existe una cuenta con ese número.');
      account[field]=typeof value==='string'?value.slice(0,60):value; committed=true; await save(true); refreshAccountPicker(); refreshAccounts();
    } catch(error) { showNotice(error.message); input.focus(); }
  };
  input.addEventListener('change',commit); input.addEventListener('blur',commit); input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();commit();}});
}
async function deleteActiveAccount() {
  const account=active(); if (!account) return;
  clearTimeout(accountSuccessTimer);
  state.accounts=state.accounts.filter(item=>item.id!==account.id);
  if (state.manual) delete state.manual[account.id]; state.trades=state.trades.filter(trade=>trade.accountId!==account.id);
  state.accountId=state.accounts[0]?.id || null; state.historyMonth=null;
  state.accountsMode=state.accountId?'history':'create'; deleteConfirm=false; createdAccountNumber=null;
  try { await save(true); render(true,false); }
  catch(error) { render(false,false); showNotice(error.message); }
}
function loadMore(list, direction) {
  if (!list.isConnected || swipe) return;
  const daily = list.dataset.list === 'daily';
  const attribute = daily ? 'data-select-date' : 'data-select-month';
  const cards = [...list.querySelectorAll('[' + attribute + ']')];
  if (!cards.length) return;
  const add = daily ? addDays : addMonths;
  const countKey = daily ? 'loadedDays' : 'loadedMonths';
  const anchorKey = daily ? 'dailyAnchor' : 'monthAnchor';
  const limit = daily ? today() : today().slice(0, 7);
  const batch = daily ? 7 : 4;
  const cap = daily ? 120 : 60;
  const newest = cards[0].getAttribute(attribute);
  let added = batch;
  if (direction < 0) {
    added = 0;
    while (added < batch && add(newest, added + 1) <= limit) added++;
    if (!added) return;
    state[anchorKey] = add(newest, added);
  } else if (cards.length + added > cap) state[anchorKey] = add(newest, -(cards.length + added - cap));
  state[countKey] = Math.min(cap, cards.length + added);
  const reference = cards.find(card => card.offsetTop + card.offsetHeight > list.scrollTop) || cards[0];
  const value = reference.getAttribute(attribute);
  const offset = reference.offsetTop - list.scrollTop;
  save(); render(false,false);
  const next = document.querySelector('[data-list="' + list.dataset.list + '"]');
  const sameCard = next?.querySelector('[' + attribute + '="' + value + '"]');
  if (sameCard) { next.scrollTop = sameCard.offsetTop - offset; next.dataset.restoredTop = next.scrollTop; }
  if (gesture.scrollElement === list) gesture.scrollElement = next;
}
function bindDetailControls() {
  document.querySelector('[data-go-journal]')?.addEventListener('click', () => { state.view = 'journal'; state.journalScope = 'day'; state.journalFrom=state.date; state.journalTo=state.date; save(); render(); });
  document.querySelector('[data-open-journal-month]')?.addEventListener('click', event => { state.month=event.currentTarget.dataset.openJournalMonth; state.view='journal'; state.journalScope='month'; ({from:state.journalFrom,to:state.journalTo}=monthRange(state.month)); editingTradeId=null; save(); render(); });
}
function refreshDetail(view) {
  const account = active();
  const current = document.querySelector(view === 'daily' ? '.daily-view .detail-panel' : '.monthly-view .detail-panel');
  if (!account || !current) return;
  current.outerHTML = view === 'daily' ? dailyDetail(account) : monthlyDetail(account);
  bindDetailControls();
}
function updateSelectedCards(attribute, value) {
  document.querySelectorAll('[' + attribute + ']').forEach(card => card.classList.toggle('selected', card.getAttribute(attribute) === value));
}
function selectDate(date) {
  state.date = date;
  state.month = date.slice(0, 7);
  save();
  updateSelectedCards('data-select-date', date);
  refreshDetail('daily');
}
function selectMonthCard(month) {
  state.month = month;
  state.date = selectMonth(state.date, month);
  state.historyMonth = month;
  save();
  updateSelectedCards('data-select-month', month);
  refreshDetail('monthly');
}
let gesture = { x: 0, y: 0, lastX: 0, lastY: 0, active: false, moved: false, scrollElement: null };
let suppressClick = false;
function gestureStart(event) {
  if (swipe?.settling) return;
  suppressClick = false;
  gesture.active = false;
  if (event.button !== 0 || event.isPrimary === false || event.target.closest('input,textarea,select,.trade-edit-form')) return;
  clearSwipe();
  gesture = { x:event.clientX,y:event.clientY,lastX:event.clientX,lastY:event.clientY,active:true,moved:false,axis:null,pointerId:event.pointerId,scrollElement:event.target.closest('[data-list],.journal-scroll,.report-scroll,.detail-panel') };
}
function gestureMove(event) {
  if (!gesture.active || event.pointerId !== gesture.pointerId) return;
  if (event.pointerType === 'mouse' && !(event.buttons & 1)) { gesture.active=false; settleSwipe(true); return; }
  const totalX=event.clientX-gesture.x, totalY=event.clientY-gesture.y;
  if (!gesture.axis && Math.hypot(totalX,totalY)>10) {
    if (Math.abs(totalX)>Math.abs(totalY)*1.15) gesture.axis='x';
    else if (Math.abs(totalY)>Math.abs(totalX)*1.15) gesture.axis='y';
    if (gesture.axis) {
      gesture.moved=true;
      if ((gesture.axis==='x'||event.pointerType==='mouse') && !event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.setPointerCapture(event.pointerId);
    }
  }
  if (gesture.axis==='x') { moveSwipe(event.currentTarget,totalX); return; }
  // Touch uses the browser's native vertical scrolling and inertia.
  if (gesture.axis==='y' && event.pointerType==='mouse' && gesture.scrollElement) {
    const list=gesture.scrollElement;
    list.scrollTop -= event.clientY-gesture.lastY;
    if (list.matches('.scroll-region') && totalY>0 && list.scrollTop===0) loadMore(list,-1);
    else if (list.matches('.scroll-region') && totalY<0 && list.scrollTop+list.clientHeight>=list.scrollHeight-1) loadMore(list,1);
  }
  gesture.lastX=event.clientX; gesture.lastY=event.clientY;
}
function gestureEnd(event) {
  if (!gesture.active || event.pointerId !== gesture.pointerId) return;
  suppressClick=gesture.moved; gesture.active=false;
  if (gesture.axis==='x') settleSwipe();
}
function suppressSwipeClick(event) { if (!suppressClick) return; suppressClick = false; event.preventDefault(); event.stopPropagation(); }

function clearSwipe() {
  clearTimeout(wheelTimer);
  if (!swipe) return;
  const current=swipe; swipe=null;
  current.animations?.forEach(animation=>animation.cancel());
  current.preview?.remove();
  current.page.style.transform='';
  current.screen.classList.remove('is-swiping');
}

function moveSwipe(screen,dx) {
  if (swipe?.settling) return;
  if (!swipe) {
    const page=screen.querySelector('.screen-page');
    if (!page) return;
    swipe={screen,page,width:screen.clientWidth,dx:0,velocity:0,lastTime:performance.now(),direction:0,preview:null,settling:false};
    screen.classList.add('is-swiping','no-entry-animation');
  }
  const direction=dx<0?1:-1;
  if (direction!==swipe.direction) {
    swipe.preview?.remove();
    const index=NAV.indexOf(state.view);
    swipe.next=navigationState(NAV[(index+direction+NAV.length)%NAV.length]);
    const preview=document.createElement('div');
    preview.className='screen-page swipe-preview';
    preview.inert=true;
    preview.setAttribute('aria-hidden','true');
    preview.innerHTML=viewContent(swipe.next);
    screen.append(preview);
    positionContent(preview,swipe.next,true);
    swipe.preview=preview; swipe.direction=direction;
  }
  const now=performance.now();
  const elapsed=now-swipe.lastTime;
  const offset=Math.max(-swipe.width,Math.min(swipe.width,dx));
  if (elapsed>0) swipe.velocity=(offset-swipe.dx)/elapsed;
  swipe.lastTime=now; swipe.dx=offset;
  swipe.page.style.transform=`translate3d(${offset}px,0,0)`;
  swipe.preview.style.transform=`translate3d(${offset+direction*swipe.width}px,0,0)`;
}

function settleSwipe(cancel=false) {
  if (!swipe || swipe.settling) return;
  const current=swipe;
  current.settling=true;
  const speed=performance.now()-current.lastTime<100?current.velocity:0;
  const advance=!cancel && (Math.abs(current.dx)>current.width*.25 || (Math.abs(current.dx)>30 && Math.abs(speed)>.5 && Math.sign(speed)===Math.sign(current.dx)));
  const target=advance?-current.direction*current.width:0;
  const duration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:220;
  const options={duration,easing:'cubic-bezier(.22,.8,.25,1)',fill:'forwards'};
  current.animations=[
    current.page.animate([{transform:`translate3d(${current.dx}px,0,0)`},{transform:`translate3d(${target}px,0,0)`}],options),
    current.preview.animate([{transform:`translate3d(${current.dx+current.direction*current.width}px,0,0)`},{transform:`translate3d(${target+current.direction*current.width}px,0,0)`}],options)
  ];
  Promise.all(current.animations.map(animation=>animation.finished)).then(()=>{
    if (swipe!==current) return;
    clearSwipe();
    if (advance) { editingTradeId=null; state=current.next; save(); render(true,false); }
  }).catch(()=>{}); // A resize or another navigation can cancel the transition.
}

function horizontalWheel(event) {
  if (Math.abs(event.deltaX)<=Math.abs(event.deltaY) || event.target.closest('input,textarea,select,.trade-edit-form')) return;
  event.preventDefault();
  if (gesture.active || swipe?.settling || performance.now()<wheelCooldown) return;
  const factor=event.deltaMode===1?16:event.deltaMode===2?event.currentTarget.clientWidth:1;
  moveSwipe(event.currentTarget,(swipe?.dx||0)-event.deltaX*factor);
  clearTimeout(wheelTimer);
  wheelTimer=setTimeout(()=>{wheelCooldown=performance.now()+260;settleSwipe();},100);
}

function navigationState(view) {
  const next={...state};
  if (view === 'monthly') {
    next.month = next.date.slice(0, 7);
    const earliest = addMonths(next.monthAnchor, -(next.loadedMonths - 1));
    if (next.month < earliest || next.month > next.monthAnchor) { next.monthAnchor = next.month; next.loadedMonths = 7; }
  }
  if (view === 'daily') {
    next.date = selectMonth(next.date, next.month);
    if (next.month === today().slice(0, 7)) next.dailyAnchor = today();
    const earliest = addDays(next.dailyAnchor, -(next.loadedDays - 1));
    if (next.date < earliest || next.date > next.dailyAnchor) {
      next.dailyAnchor = addDays(next.date, 4) > today() ? today() : addDays(next.date, 4);
      next.loadedDays = 9;
    }
  }
  if (view === 'journal' || view === 'accounts') next.historyMonth = next.month;
  if (view === 'accounts') next.accountsMode = 'history';
  if (view === 'journal') {
    if (state.view === 'daily') {
      next.journalScope = 'day';
      next.journalFrom = next.date;
      next.journalTo = next.date;
    } else {
      next.journalScope = 'month';
      ({from:next.journalFrom,to:next.journalTo}=monthRange(next.month));
    }
  }
  next.view=view;
  return next;
}
function navigate(view) {
  if (view === state.view) return;
  editingTradeId=null;
  state=navigationState(view); save(); render(true);
}
window.addEventListener('resize',()=>{gesture.active=false;clearSwipe();});

async function openTrade() {
  const account=active(), journal=document.querySelector('.journal-view');
  if (!account || !journal) return;
  const card=journal.querySelector('[data-new-trade]');
  const newForm=card.querySelector('[data-new-trade-form]');
  if (newForm) {await closeTradeEditor(card,newForm);return;}
  const previous=journal.querySelector('[data-trade-edit-form]');
  if (previous) await closeTradeEditor(previous.closest('.trade-row'),previous);
  if (!journal.isConnected) return;
  const trade={openedAt:state.date+'T09:00',closedAt:state.date+'T10:00',direction:'Compra',commission:0,swap:0};
  card.classList.add('expanded');
  card.querySelector('[data-add-trade]').setAttribute('aria-expanded','true');
  card.insertAdjacentHTML('beforeend','<form class="trade-edit-form" id="trade-form" data-new-trade-form>'+tradeFields(trade,account)+'<p data-trade-edit-notice role="status" hidden></p><button class="primary-button wide" value="save">Guardar operación</button></form>');
  const form=card.querySelector('form');
  bindTradeNet(form,account);
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if (form.dataset.saving) return;
    try {
      const values=tradeFromForm(form);
      form.dataset.saving='true';
      const id=crypto.randomUUID();
      state.trades.push({id,accountId:account.id,...values});
      await save(true);
      await closeTradeEditor(card,form);
      if (journal.isConnected) refreshJournal(id);
    } catch(error) {
      delete form.dataset.saving;
      const message=form.querySelector('[data-trade-edit-notice]');
      message.textContent=error.message; message.hidden=false;
    }
  });
  await animateTradeEditor(card,form,true);
}

render(true);
