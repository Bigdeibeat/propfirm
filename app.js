import { addDays, addMonths, dayLabel, daySummary, history, ledger, money, monthLabel, monthSummary, parseAmount, percent, reportStats, selectMonth, shortDate, symbol, tone, today, tradeNet } from './domain.js';
import { applyMt5Report1514697145 } from './imports/report-1514697145.js';
import { applyMt5Report1514656031 } from './imports/report-1514656031.js';

const KEY = 'fondeo.app.v2';
const NAV = ['daily', 'monthly', 'report', 'journal', 'accounts'];
const NAV_LABELS = { daily: 'Diario', monthly: 'Mensual', report: 'Informe', journal: 'Bitácora', accounts: 'Cuentas' };
const seed = {
  accounts: [{ id: 'demo-42195235', number: '42195235', initial: 10438.64, currency: 'EUR', firm: 'Lucid', cost: 80, created: '2026-09-01', type: 'PRO' }],
  manual: { 'demo-42195235': {} },
  trades: [
    ['13',83.82,'Compra','XAUUSD'],['14',62.45,'Venta','NASDAQ'],['15',114.13,'Compra','XAUUSD'],['16',-35.13,'Venta','EURUSD'],['17',-57.54,'Compra','NASDAQ'],['18',88.12,'Venta','XAUUSD'],['19',112.57,'Compra','NASDAQ']
  ].map(([day,profit,direction,tradeSymbol],index)=>({id:`demo-trade-${day}`,accountId:'demo-42195235',date:`2026-09-${day}`,openedAt:`2026-09-${day}T09:00`,closedAt:`2026-09-${day}T${10+index%3}:30`,symbol:tradeSymbol,direction,size:1,entry:100+index,closePrice:direction==='Compra'?101+index:99+index,sl:direction==='Compra'?99+index:101+index,tp:direction==='Compra'?102+index:98+index,grossProfit:profit,commission:0,swap:0,profit,note:''})),
  accountId: 'demo-42195235', view: 'daily', date: today(), month: today().slice(0, 7), dailyAnchor: today(), monthAnchor: today().slice(0, 7), loadedDays: 9, loadedMonths: 7, historyMonth: null, accountsMode: 'history'
};
let state;
const app = document.querySelector('#app');
const dialog = document.querySelector('#dialog');
const notice = document.querySelector('#notice');

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
const active = () => state.accounts.find(account => account.id === state.accountId) || state.accounts[0] || null;
const dataFor = () => ({ accounts: state.accounts, manual: state.manual, trades: state.trades });
const load = () => { try { const saved = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(saved?.accounts) ? { ...seed, ...saved, dailyAnchor:saved.dailyAnchor || saved.date, monthAnchor:saved.monthAnchor || saved.month } : structuredClone(seed); } catch { return structuredClone(seed); } };
let cachedBook = null;
const save = () => { cachedBook = null; localStorage.setItem(KEY, JSON.stringify(state)); };
let noticeTimer;
const showNotice = text => {
  const form = dialog.open && dialog.querySelector('form');
  if (form) {
    let message = form.querySelector('[data-form-notice]');
    if (!message) { message=document.createElement('p'); message.dataset.formNotice=''; message.setAttribute('role','status'); form.append(message); }
    message.textContent = text;
    return;
  }
  clearTimeout(noticeTimer); notice.textContent=text; notice.hidden=false;
  noticeTimer=setTimeout(()=>{notice.hidden=true;},2600);
};
state = load();
const importedMt5Report50k=applyMt5Report1514697145(state);
const importedMt5Report100k=applyMt5Report1514656031(state);
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
if (importedMt5Report50k||importedMt5Report100k) save();
const book = () => { const account = active(); return account ? (cachedBook ||= ledger(account, dataFor())) : []; };
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
    return account ? (state.view === 'daily' ? dailyView(account) : state.view === 'monthly' ? monthlyView(account) : state.view === 'journal' ? journalView(account) : reportView()) : emptyState();
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
    if (list && context.view === 'daily' && context.dailyAnchor === today()) {
      list.scrollTop = list.scrollHeight;
      list.dataset.restoredTop = list.scrollTop;
    } else if (selected) { list.scrollTop = Math.max(0, selected.offsetTop + selected.offsetHeight - list.clientHeight); list.dataset.restoredTop = list.scrollTop; }
  }
}

function emptyState() { return '<div class="empty-account"><h1>CUENTAS</h1><p>Ve a la pestaña Cuentas para añadir tu primera cuenta.</p></div>'; }

function dailyView(account) {
  const days = [];
  const currentDate = today();
  const latest = state.dailyAnchor > currentDate ? currentDate : state.dailyAnchor;
  let cursor = addDays(latest, -(state.loadedDays - 1));
  for (let index = 0; index < state.loadedDays; index++) { if (cursor <= currentDate) days.push(cursor); cursor = addDays(cursor, 1); }
  const rows = days.map(date => {
    const item = daySummary(account, book(), date);
    const result = item.profit === null ? '-- ' + symbol(account.currency) + ' / -- %' : money(item.profit, account.currency, true) + ' / ' + percent(item.percentage, true);
    return '<button class="rapid-card ' + (date === state.date ? 'selected' : '') + '" data-select-date="' + date + '"><span class="rapid-date">' + esc(labelDate(date)) + '</span><span class="rapid-result ' + toneFor(item.profit) + '">' + result + '</span></button>';
  }).join('');
  return '<div class="view daily-view"><div class="scroll-region" data-list="daily"><div class="list-loader">Desliza arriba para cargar días anteriores</div>' + rows + '</div>' + dailyDetail(account) + '</div>';
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
  let cursor = addMonths(state.monthAnchor, -(state.loadedMonths - 1));
  for (let index = 0; index < state.loadedMonths; index++) { months.push(cursor); cursor = addMonths(cursor, 1); }
  const rows = months.map(month => {
    const item = monthSummary(account, book(), month);
    const result = item.profit === null ? '-- ' + symbol(account.currency) + ' / -- %' : money(item.profit, account.currency, true) + ' / ' + percent(item.percentage, true);
    return '<button class="rapid-card ' + (month === state.month ? 'selected' : '') + '" data-select-month="' + month + '"><span class="rapid-date">' + esc(monthLabel(month)) + '</span><span class="rapid-result ' + toneFor(item.profit) + '">' + result + '</span></button>';
  }).join('');
  return '<div class="view monthly-view"><div class="scroll-region" data-list="months"><div class="list-loader">Desliza arriba para cargar meses anteriores</div>' + rows + '</div>' + monthlyDetail(account) + '</div>';
}

function monthlyDetail(account) {
  const item = monthSummary(account, book(), state.month);
  const expected = item.expected === null ? '-- ' + symbol(account.currency) : money(item.expected, account.currency, false);
  return '<section class="detail-panel"><div class="detail-heading"><h2>DESGLOSE ' + esc(monthLabel(state.month).toUpperCase()) + '</h2><button class="icon-button" data-open-history="' + state.month + '" aria-label="Ver historial del mes">◉</button></div><div class="metrics">' +
    metric('CAPITAL INICIAL', money(item.start, account.currency, false)) + metric('BENEFICIO ESPERABLE', expected, toneFor(item.expected)) +
    metric('BENEFICIO DEL MES', item.profit === null ? '-- ' + symbol(account.currency) : money(item.profit, account.currency, false), toneFor(item.profit)) +
    metric('PORCENTAJE ESPERABLE', item.expectedPercent === null ? '-- %' : percent(item.expectedPercent), toneFor(item.expectedPercent)) +
    metric('PORCENTAJE DEL MES', item.percentage === null ? '-- %' : percent(item.percentage), toneFor(item.percentage)) +
    metric('CAPITAL FINAL', money(item.end, account.currency, false), toneFor(item.profit)) +
    metric('BENEFICIO ACUMULADO', money(item.accumulated, account.currency, false), toneFor(item.accumulated)) +
    metric('PORCENTAJE ACUMULADO', percent(item.accumulatedPercent), toneFor(item.accumulatedPercent)) + '</div></section>';
}

function journalView(account) {
  const monthly = state.journalScope === 'month';
  const trades = state.trades.filter(trade => trade.accountId === account.id && (monthly ? trade.date.slice(0,7) === state.month : trade.date === state.date)).sort((a,b)=>(a.closedAt||a.date).localeCompare(b.closedAt||b.date));
  let lastDate = null;
  const rows = trades.map(trade => {
    const heading = monthly && trade.date !== lastDate ? '<h2 class="journal-day">' + esc(labelDate(trade.date)) + '</h2>' : '';
    lastDate = trade.date;
    return heading + tradeRow(trade);
  }).join('');
  return '<div class="view journal-view"><div class="journal-scroll"><div class="journal-title"><div><h1>BITÁCORA</h1><p>' + esc(monthly ? monthLabel(state.month) : labelDate(state.date)) + '</p></div><button class="primary-button" data-add-trade>+ Operación</button></div>' +
    (trades.length ? rows : '<div class="empty-card"><strong>No hay operaciones para este ' + (monthly ? 'mes' : 'día') + '</strong><span>Añade una operación y Diario usará su resultado automáticamente.</span><button class="primary-button" data-add-trade>Añadir operación</button></div>') + '</div></div>';
}

function tradeRow(trade) {
  const net=tradeNet(trade), open=trade.openedAt?.slice(11,16)||'--:--', close=trade.closedAt?.slice(11,16)||'--:--';
  const expanded=editingTradeId===trade.id;
  return '<article class="trade-row' + (expanded?' expanded':'') + '" data-trade-id="' + esc(trade.id) + '"><button type="button" class="trade-row-summary" data-edit-trade="' + esc(trade.id) + '" aria-expanded="' + expanded + '"><span><strong>' + esc(trade.symbol) + ' · ' + esc(trade.direction) + '</strong><small>' + esc(open) + '–' + esc(close) + ' · Entrada ' + esc(trade.entry) + ' · Cierre ' + esc(trade.closePrice ?? '—') + '</small><small>Posición ' + esc(trade.size) + ' · Comisión ' + money(Number(trade.commission)||0,active().currency,false) + ' · Swap ' + money(Number(trade.swap)||0,active().currency,false) + '</small></span><b class="' + toneFor(net) + '">' + money(net, active().currency, true) + '</b></button>' + (expanded?tradeEditForm(trade):'') + '</article>';
}

function tradeFields(trade,account) {
  const option=direction=>'<option' + (trade.direction===direction?' selected':'') + '>' + direction + '</option>';
  const value=name=>esc(trade[name] ?? '');
  return '<div class="form-grid">'+
    '<label class="wide">Apertura<input type="datetime-local" name="openedAt" value="'+value('openedAt')+'" required></label><label class="wide">Cierre<input type="datetime-local" name="closedAt" value="'+value('closedAt')+'" required></label>'+
    '<label>Símbolo<input name="symbol" value="'+value('symbol')+'" required placeholder="XAUUSD"></label><label>Dirección<select name="direction" required>'+option('Compra')+option('Venta')+'</select></label>'+
    '<label>Tamaño posición<input name="size" value="'+value('size')+'" required inputmode="decimal"></label><label>Precio entrada<input name="entry" value="'+value('entry')+'" required inputmode="decimal"></label><label>Precio cierre<input name="closePrice" value="'+value('closePrice')+'" required inputmode="decimal"></label>'+
    '<label>Stop loss<input name="sl" value="'+value('sl')+'" required inputmode="decimal"></label><label>Take profit<input name="tp" value="'+value('tp')+'" required inputmode="decimal"></label>'+
    '<label>Beneficio bruto ('+symbol(account.currency)+')<input name="grossProfit" value="'+value('grossProfit')+'" required inputmode="decimal"></label><label>Comisión ('+symbol(account.currency)+')<input name="commission" value="'+value('commission')+'" required inputmode="decimal"></label><label>Swap ('+symbol(account.currency)+')<input name="swap" value="'+value('swap')+'" required inputmode="decimal"></label>'+
    '<label class="wide net-field">Beneficio neto ('+symbol(account.currency)+')<input name="netProfit" readonly value="'+money(tradeNet(trade),account.currency,false)+'"></label><label class="wide">Nota<textarea name="note" rows="2">'+esc(trade.note||'')+'</textarea></label></div>';
}

function tradeEditForm(trade) {
  return '<form class="trade-edit-form" data-trade-edit-form="'+esc(trade.id)+'">'+tradeFields(trade,active())+'<p data-trade-edit-notice role="status" hidden></p><button class="primary-button wide" data-save-trade>Guardar cambios</button></form>';
}

function bindTradeNet(form,account) {
  const update=()=>{try{const values=['grossProfit','commission','swap'].map(name=>parseAmount(form.elements[name].value));form.elements.netProfit.value=values.some(value=>value===null)?'--':money(values.reduce((sum,value)=>sum+value,0),account.currency,false);}catch{form.elements.netProfit.value='--';}};
  ['grossProfit','commission','swap'].forEach(name=>form.elements[name].addEventListener('input',update));
  update();
}

function tradeFromForm(form) {
  const entry=parseAmount(form.elements.entry.value), closePrice=parseAmount(form.elements.closePrice.value), tp=parseAmount(form.elements.tp.value), sl=parseAmount(form.elements.sl.value), size=parseAmount(form.elements.size.value);
  const grossProfit=parseAmount(form.elements.grossProfit.value), commission=parseAmount(form.elements.commission.value), swap=parseAmount(form.elements.swap.value);
  if ([entry,closePrice,tp,sl,grossProfit,commission,swap].some(value=>value===null)) throw new Error('Completa todos los datos numéricos.');
  if (size===null||size<=0) throw new Error('El tamaño de la posición debe ser mayor que cero.');
  const openedAt=form.elements.openedAt.value, closedAt=form.elements.closedAt.value;
  if (!openedAt||!closedAt||new Date(closedAt)<=new Date(openedAt)) throw new Error('El cierre debe ser posterior a la apertura.');
  const tradeSymbol=form.elements.symbol.value.trim().slice(0,30);
  if (!tradeSymbol) throw new Error('Introduce el símbolo operado.');
  const direction=form.elements.direction.value, movement=(closePrice-entry)*(direction==='Venta'?-1:1);
  if (movement!==0&&grossProfit!==0&&Math.sign(movement)!==Math.sign(grossProfit)) throw new Error('El signo del beneficio no coincide con la dirección y los precios.');
  const profit=(Math.round(grossProfit*100)+Math.round(commission*100)+Math.round(swap*100))/100;
  return {date:closedAt.slice(0,10),openedAt,closedAt,symbol:tradeSymbol,direction,entry,closePrice,size,tp,sl,grossProfit,commission,swap,profit,note:form.elements.note.value.trim().slice(0,500)};
}

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
  if (item.type === 'created') return '<article class="account-history-card created-event"><time>' + esc(shortDate(item.date)) + '</time><span>Creada cuenta de <strong>' + esc(account.initial.toLocaleString('es-ES',{maximumFractionDigits:2})) + ' ' + symbol(account.currency) + '</strong> en ' + esc(account.firm) + ' por ' + money(account.cost, account.currency, false) + '</span></article>';
  const fullPercent = item.percentage === null ? '-- %' : (item.percentage > 0 ? '+' : '') + percent(item.percentage);
  const symbolText = item.type === 'trade' ? '<small> en ' + esc(item.symbol || '—') + '</small>' : '';
  return '<article class="account-history-card" data-history-result><time>' + esc(shortDate(item.date)) + '</time><span class="history-performance ' + toneFor(item.profit) + '"><span>' + money(item.profit, account.currency, true) + symbolText + ' [' + fullPercent + ']</span><i aria-hidden="true">|</i><strong>' + money(item.end, account.currency, false) + '</strong></span></article>';
}
const compactNumber = value => value === null || !Number.isFinite(value) ? (value === Infinity ? '∞' : '--') : new Intl.NumberFormat('es-ES',{maximumFractionDigits:2}).format(value);
function durationText(milliseconds) {
  if (milliseconds === null || !Number.isFinite(milliseconds)) return '--';
  const minutes=Math.round(milliseconds/60000), days=Math.floor(minutes/1440), hours=Math.floor(minutes%1440/60), rest=minutes%60;
  return [days?`${days} d`:'',hours?`${hours} h`:'',rest||(!days&&!hours)?`${rest} min`:''].filter(Boolean).join(' ');
}
function reportCard(label,value,className='neutral',secondary='') {
  return '<article class="report-metric-card"><span>' + label + '</span><strong class="' + className + '">' + value + '</strong>' + (secondary?'<small>'+secondary+'</small>':'') + '</article>';
}
function reportSection(title,cards) { return '<section class="report-section"><h2>' + title + '</h2><div class="report-grid">' + cards.join('') + '</div></section>'; }
function balanceChart(stats) {
  if (!stats.curve.length) return '<div class="report-chart-empty">Aún no hay días operados</div>';
  const width=600,height=190,padLeft=62,padRight=12,padTop=10,padBottom=26;
  const balances=stats.curve.map(point=>point.balance), low=Math.min(...balances), high=Math.max(...balances), span=Math.max(1,high-low);
  const rawStep=span/4, magnitude=10**Math.floor(Math.log10(rawStep)), residual=rawStep/magnitude;
  const step=(residual<=1?1:residual<=2?2:residual<=5?5:10)*magnitude;
  let min=Math.floor(low/step)*step, max=Math.ceil(high/step)*step;
  if (Math.abs(low-min)<step/1000) min-=step;
  if (min===max) { min-=step; max+=step; }
  const points=stats.curve.map((point,index)=>({
    x:stats.curve.length===1?(padLeft+width-padRight)/2:padLeft+index*(width-padLeft-padRight)/(stats.curve.length-1),
    y:padTop+(max-point.balance)/(max-min)*(height-padTop-padBottom),
    ...point,
  }));
  const ticks=[]; for(let value=min;value<=max+step/2&&ticks.length<12;value+=step) ticks.push(value);
  const formatAxis=value=>new Intl.NumberFormat('es-ES',{maximumFractionDigits:Math.abs(step)<1?2:0}).format(value);
  const horizontal=ticks.map(value=>{const y=padTop+(max-value)/(max-min)*(height-padTop-padBottom);return `<line x1="${padLeft}" y1="${y}" x2="${width-padRight}" y2="${y}"/>`;}).join('');
  const vertical=points.map(point=>`<line x1="${point.x}" y1="${padTop}" x2="${point.x}" y2="${height-padBottom}"/>`).join('');
  const yLabels=ticks.map(value=>{const y=padTop+(max-value)/(max-min)*(height-padTop-padBottom);return `<text x="${padLeft-8}" y="${y+4}" text-anchor="end">${formatAxis(value)}</text>`;}).join('');
  const labelEvery=Math.max(1,Math.ceil(points.length/16));
  const xLabels=points.map((point,index)=>(index%labelEvery===0||index===points.length-1)?`<text x="${point.x}" y="${height-7}" text-anchor="middle">${index+1}</text>`:'').join('');
  return '<svg class="balance-chart" viewBox="0 0 '+width+' '+height+'" role="img" aria-label="Curva diaria de balance"><g class="chart-grid">'+horizontal+vertical+'</g><g class="chart-axes"><line x1="'+padLeft+'" y1="'+padTop+'" x2="'+padLeft+'" y2="'+(height-padBottom)+'"/><line x1="'+padLeft+'" y1="'+(height-padBottom)+'" x2="'+(width-padRight)+'" y2="'+(height-padBottom)+'"/></g><polyline points="'+points.map(point=>`${point.x},${point.y}`).join(' ')+'"/><g class="chart-y-labels">'+yLabels+'</g><g class="chart-x-labels">'+xLabels+'</g></svg>';
}
function reportView() {
  const account=active(), stats=reportStats(account,dataFor());
  const cash=value=>money(value,account.currency,false), magnitude=value=>money(value===null?null:Math.abs(value),account.currency,false), signed=value=>money(value,account.currency,true), pc=value=>percent(value);
  const best=stats.days.best, worst=stats.days.worst;
  return '<div class="view report-view"><div class="report-scroll"><header class="report-heading"><h1>RESUMEN DE LA CUENTA</h1></header>'+
    '<section class="report-summary"><span>BALANCE ACTUAL</span><strong class="'+toneFor(stats.netProfit)+'">'+cash(stats.balance)+'</strong><div class="'+toneFor(stats.netProfit)+'">'+signed(stats.netProfit)+' <i>/</i> '+percent(stats.returnPercent,true)+'</div></section>'+
    '<section class="report-chart-card"><div><h2>CURVA DE BALANCE</h2><span>'+stats.totalTrades+' operaciones en '+stats.days.total+' días</span></div>'+balanceChart(stats)+'</section>'+
    reportSection('RESULTADOS Y COSTES',[
      reportCard('BRUTO POSITIVO',magnitude(stats.grossProfit),'positive'),reportCard('BRUTO NEGATIVO',magnitude(stats.grossLoss),'negative'),
      reportCard('COMISIONES',magnitude(stats.commissions),'negative'),reportCard('SWAPS',magnitude(stats.swap),'negative'),
      reportCard('COSTES TOTALES',magnitude(stats.costs),'negative'),reportCard('BENEFICIO ESPERADO',magnitude(stats.expectancy),toneFor(stats.expectancy)),
    ])+
    reportSection('RENDIMIENTO DE LAS OPERACIONES',[
      reportCard('PROFIT FACTOR',compactNumber(stats.profitFactor),toneFor((stats.profitFactor??1)-1)),reportCard('DRAWDOWN MÁXIMO',magnitude(stats.maxDrawdown.amount),'negative',pc(stats.maxDrawdown.percent)),
      reportCard('GANADORAS',String(stats.winningTrades),'positive'),reportCard('PERDEDORAS',String(stats.losingTrades),stats.losingTrades?'negative':'neutral'),
      reportCard('TASA DE ACIERTO',pc(stats.winRate),toneFor((stats.winRate??50)-50)),reportCard('MAYOR GANADORA',cash(stats.largestWin),toneFor(stats.largestWin)),
      reportCard('MAYOR PERDEDORA',magnitude(stats.largestLoss),toneFor(stats.largestLoss)),reportCard('MEDIA GANADORAS',cash(stats.averageWin),toneFor(stats.averageWin)),
      reportCard('MEDIA PERDEDORAS',magnitude(stats.averageLoss),toneFor(stats.averageLoss)),reportCard('OPERACIONES',String(stats.totalTrades),'neutral'),
    ])+
    reportSection('COMPRAS Y VENTAS',[
      reportCard('COMPRAS',String(stats.buys.count),'neutral',pc(stats.buys.winRate)+' GANADORAS'),reportCard('VENTAS',String(stats.sells.count),'neutral',pc(stats.sells.winRate)+' GANADORAS'),
      reportCard('NETO COMPRAS',magnitude(stats.buys.netProfit),toneFor(stats.buys.netProfit)),reportCard('NETO VENTAS',magnitude(stats.sells.netProfit),toneFor(stats.sells.netProfit)),
    ])+
    reportSection('RACHAS',[
      reportCard('MAYOR RACHA GANADORA',String(stats.winningStreak.count),stats.winningStreak.count?'positive':'neutral',signed(stats.winningStreak.profit)),
      reportCard('MAYOR RACHA PERDEDORA',String(stats.losingStreak.count),stats.losingStreak.count?'negative':'neutral',signed(stats.losingStreak.profit)),
    ])+
    reportSection('TIEMPO Y DÍAS',[
      reportCard('DURACIÓN MEDIA',durationText(stats.duration.average),'neutral'),reportCard('OPERACIÓN MÁS LARGA',durationText(stats.duration.longest),'neutral'),
      reportCard('OPERACIÓN MÁS CORTA',durationText(stats.duration.shortest),'neutral'),reportCard('DÍAS OPERADOS',String(stats.days.total),'neutral'),
      reportCard('DÍAS POSITIVOS',String(stats.days.positive),'positive'),reportCard('DÍAS NEGATIVOS',String(stats.days.negative),stats.days.negative?'negative':'neutral'),
      reportCard('MEJOR DÍA',best?magnitude(best.profit):cash(null),toneFor(best?.profit),best?shortDate(best.date):''),reportCard('PEOR DÍA',worst?magnitude(worst.profit):cash(null),toneFor(worst?.profit),worst?shortDate(worst.date):''),
    ])+'</div></div>';
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
function bindJournalControls(root) {
  root.querySelectorAll('[data-add-trade]').forEach(button => button.addEventListener('click', openTrade));
  root.querySelectorAll('[data-edit-trade]').forEach(button => button.addEventListener('click', () => toggleTradeEditor(button)));
  root.querySelectorAll('[data-trade-edit-form]').forEach(bindTradeEditForm);
}
function bindTradeEditForm(form) {
  bindTradeNet(form,active());
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const trade=state.trades.find(item=>item.id===form.dataset.tradeEditForm&&item.accountId===active()?.id);
    if(!trade) return;
    try {
      const changes=tradeFromForm(form);
      Object.assign(trade,changes);
      state.date=changes.date;
      state.month=changes.date.slice(0,7);
      editingTradeId=null;
      save();
      await closeTradeEditor(form.closest('.trade-row'),form);
      refreshJournal();
    } catch(error) {
      const message=form.querySelector('[data-trade-edit-notice]');
      message.textContent=error.message;
      message.hidden=false;
    }
  });
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
  if(currentForm) {
    editingTradeId=null;
    await closeTradeEditor(card,currentForm);
    return;
  }
  const openForm=document.querySelector('[data-trade-edit-form]');
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
  const scroll=current.querySelector('.journal-scroll')?.scrollTop||0;
  current.outerHTML=journalView(active());
  const next=document.querySelector('.journal-view');
  bindJournalControls(next);
  const list=next.querySelector('.journal-scroll');
  list.scrollTop=scroll;
  if(focusTradeId) next.querySelector('[data-trade-id="'+CSS.escape(focusTradeId)+'"]')?.scrollIntoView({block:'nearest'});
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
function saveNewAccount(event) {
  event.preventDefault();
  const form=event.currentTarget;
  try {
    const values=Object.fromEntries(new FormData(form));
    const initial=parseAmount(values.initial), cost=parseAmount(values.cost);
    const number=values.number.trim(), firm=values.firm.trim(), type=values.type.trim();
    if(initial===null||cost===null||initial<=0||cost<0||!number||!firm||!type||!values.created) throw new Error('Completa todos los datos con valores válidos.');
    if(state.accounts.some(account=>account.number===number)) throw new Error('Ya existe una cuenta con ese número.');
    accountDraft={...values,initial:String(initial),cost:String(cost),number,firm,type};
    const account={id:crypto.randomUUID(),number,initial,currency:values.currency,cost,firm,type,created:values.created};
    state.accounts.push(account); state.manual[account.id]={}; state.accountId=account.id;
    createdAccountNumber=number; save(); refreshAccountPicker(); refreshAccounts();
    clearTimeout(accountSuccessTimer);
    accountSuccessTimer=setTimeout(()=>{
      createdAccountNumber=null; accountDraft=null; state.accountsMode='history'; save();
      if(state.view==='accounts') refreshAccounts(true);
    },2000);
  } catch(error) { showNotice(error.message); }
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
  const commit=()=>{
    if (committed) return;
    try {
      let value=input.value.trim();
      if (field==='initial'||field==='cost') value=parseAmount(value);
      if (value===null||value===''||(field==='initial'&&value<=0)||(field==='cost'&&value<0)) throw new Error('Introduce un valor válido.');
      if (field==='number'&&state.accounts.some(item=>item.id!==account.id&&item.number===value)) throw new Error('Ya existe una cuenta con ese número.');
      account[field]=typeof value==='string'?value.slice(0,60):value; committed=true; save(); refreshAccountPicker(); refreshAccounts();
    } catch(error) { showNotice(error.message); input.focus(); }
  };
  input.addEventListener('change',commit); input.addEventListener('blur',commit); input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();commit();}});
}
function deleteActiveAccount() {
  const account=active(); if (!account) return;
  clearTimeout(accountSuccessTimer);
  state.accounts=state.accounts.filter(item=>item.id!==account.id);
  delete state.manual[account.id]; state.trades=state.trades.filter(trade=>trade.accountId!==account.id);
  state.accountId=state.accounts[0]?.id || null; state.historyMonth=null;
  state.accountsMode=state.accountId?'history':'create'; deleteConfirm=false; createdAccountNumber=null;
  save(); render(true,false);
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
  const last = cards.at(-1).getAttribute(attribute);
  let added = batch;
  if (direction > 0) {
    added = 0;
    while (added < batch && add(last, added + 1) <= limit) added++;
    if (!added) return;
    state[anchorKey] = add(last, added);
  } else if (cards.length + added > cap) state[anchorKey] = add(last, -(cards.length + added - cap));
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
  document.querySelector('[data-go-journal]')?.addEventListener('click', () => { state.view = 'journal'; state.journalScope = 'day'; save(); render(); });
  document.querySelector('[data-open-history]')?.addEventListener('click', event => { state.view = 'accounts'; state.accountsMode='history'; state.historyMonth = event.currentTarget.dataset.openHistory; save(); render(); });
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
  if (view === 'journal') next.journalScope = 'month';
  next.view=view;
  return next;
}
function navigate(view) {
  if (view === state.view) return;
  editingTradeId=null;
  state=navigationState(view); save(); render(true);
}
window.addEventListener('resize',()=>{gesture.active=false;clearSwipe();});

function openTrade() {
  const account = active(), openDefault=`${state.date}T09:00`, closeDefault=`${state.date}T10:00`;
  dialog.innerHTML = '<form method="dialog" class="modal-card trade-form" id="trade-form"><div class="modal-head"><h2>NUEVA OPERACIÓN</h2><button type="button" data-close-dialog class="close-button" aria-label="Cerrar">×</button></div><p class="modal-date">Cuenta ' + esc(account.number) + ' · operación cerrada</p><div class="form-grid">'+
    '<label class="wide">Apertura<input type="datetime-local" name="openedAt" value="'+openDefault+'" required></label><label class="wide">Cierre<input type="datetime-local" name="closedAt" value="'+closeDefault+'" required></label>'+
    '<label>Símbolo<input name="symbol" required placeholder="XAUUSD"></label><label>Dirección<select name="direction" required><option>Compra</option><option>Venta</option></select></label>'+
    '<label>Tamaño posición<input name="size" required inputmode="decimal"></label><label>Precio entrada<input name="entry" required inputmode="decimal"></label><label>Precio cierre<input name="closePrice" required inputmode="decimal"></label>'+
    '<label>Stop loss<input name="sl" required inputmode="decimal"></label><label>Take profit<input name="tp" required inputmode="decimal"></label>'+
    '<label>Beneficio bruto ('+symbol(account.currency)+')<input name="grossProfit" required inputmode="decimal"></label><label>Comisión ('+symbol(account.currency)+')<input name="commission" value="0" required inputmode="decimal"></label><label>Swap ('+symbol(account.currency)+')<input name="swap" value="0" required inputmode="decimal"></label>'+
    '<label class="wide net-field">Beneficio neto ('+symbol(account.currency)+')<input name="netProfit" readonly value="--"></label><label class="wide">Nota<textarea name="note" rows="2"></textarea></label></div><button class="primary-button wide" value="save">Guardar operación</button></form>';
  dialog.showModal(); dialog.querySelector('[data-close-dialog]').addEventListener('click', () => dialog.close()); const form = dialog.querySelector('form');
  bindTradeNet(form,account);
  form.addEventListener('submit', event => {
    if (event.submitter?.value !== 'save') return;
    event.preventDefault();
    try {
      const trade=tradeFromForm(form);
      state.trades.push({id:crypto.randomUUID(),accountId:account.id,...trade});
      state.date=trade.date; state.month=trade.date.slice(0,7); state.journalScope='day';
      save(); dialog.close(); render();
    } catch(error) { showNotice(error.message); }
  });
}

dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
render(true);
