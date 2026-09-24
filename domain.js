export const symbol = currency => currency === 'USD' ? '$' : '€';
export const cents = n => Math.round(n * 100);
export const average = items => items.length ? items.reduce((s,n)=>s+n,0)/items.length : null;
const currencyFormats = [false,true].map(signed => new Intl.NumberFormat('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2,signDisplay:signed?'exceptZero':'auto',useGrouping:true}));
const percentFormats = [false,true].map(quick => new Intl.NumberFormat('es-ES',{minimumFractionDigits:quick?2:0,maximumFractionDigits:quick?2:8,signDisplay:quick?'exceptZero':'auto'}));
const weekdayFormat = new Intl.DateTimeFormat('es-ES',{weekday:'long'});
const monthFormat = new Intl.DateTimeFormat('es-ES',{month:'long',year:'numeric'});
export function parseAmount(raw) {
  const value=String(raw).trim().replace(/\s/g,'').replace('−','-');
  if (!value) return null;
  const normalized=value.includes(',') ? value.replace(/\./g,'').replace(',','.') : value;
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) throw new Error('Introduce un número válido.');
  const number=Number(normalized);
  if (!Number.isFinite(number) || Math.abs(number)>1e12) throw new Error('Importe fuera de rango.');
  return number;
}
export function money(n,currency='EUR',signed=false) {
  if (n===null || !Number.isFinite(n)) return `-- ${symbol(currency)}`;
  return `${currencyFormats[Number(Boolean(signed))].format(Object.is(n,-0)?0:n)} ${symbol(currency)}`;
}
export function percent(n,quick=false) {
  if (n===null || !Number.isFinite(n)) return '-- %';
  return `${percentFormats[Number(Boolean(quick))].format(Object.is(n,-0)?0:n)} %`;
}
export const tone = n => n===null || n===0 ? 'neutral' : n<0 ? 'negative' : 'positive';
export const dateKey = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export const today = () => dateKey(new Date());
export const asDate = key => new Date(`${key}T12:00:00`);
export function addDays(key,n) { const d=asDate(key); d.setDate(d.getDate()+n); return dateKey(d); }
export function addMonths(key,n) { const d=asDate(`${key}-01`); d.setMonth(d.getMonth()+n); return dateKey(d).slice(0,7); }
export const shortDate = key => { const [y,m,d]=key.split('-'); return `${Number(d)}/${Number(m)}/${y}`; };
const capitalize = str => str[0].toUpperCase()+str.slice(1);
export const dayLabel = key => `${capitalize(weekdayFormat.format(asDate(key)))} ${shortDate(key)}`;
export const monthLabel = key => capitalize(monthFormat.format(asDate(`${key}-01`)));
export const selectMonth = (date,month) => date.slice(0,7)===month ? date : `${month}-01`;
export function ratio(entry,tp,sl,direction) {
  if (![entry,tp,sl].every(Number.isFinite)) return null;
  const sign=direction==='Venta'?-1:1, risk=(entry-sl)*sign, reward=(tp-entry)*sign;
  return risk>0 && reward>0 ? reward/risk : null;
}

export function tradeNet(trade) {
  if (Number.isFinite(trade?.grossProfit)) {
    return (cents(trade.grossProfit) + cents(Number.isFinite(trade.commission) ? trade.commission : 0) + cents(Number.isFinite(trade.swap) ? trade.swap : 0)) / 100;
  }
  return Number.isFinite(trade?.profit) ? cents(trade.profit) / 100 : 0;
}
const tradeDate = trade => (trade.closedAt || trade.date || '').slice(0,10);
export function closedTrades(account,state,range={}) {
  return state.trades
    .filter(trade=>trade.accountId===account.id)
    .map(trade=>({...trade,date:tradeDate(trade),profit:tradeNet(trade)}))
    .filter(trade=>trade.date && (!range.from || trade.date>=range.from) && (!range.to || trade.date<=range.to))
    .sort((a,b)=>(a.closedAt||`${a.date}T23:59`).localeCompare(b.closedAt||`${b.date}T23:59`) || String(a.id).localeCompare(String(b.id)));
}

// Only journal dates are computed. Viewport pagination never truncates the ledger.
export function ledger(account,state) {
  const dates=new Map();
  for (const trade of closedTrades(account,state)) {
    let item=dates.get(trade.date);
    if (!item) { item={profitCents:0,source:'journal',trades:[]}; dates.set(trade.date,item); }
    item.profitCents+=cents(trade.profit); item.trades.push(trade);
  }
  let balance=cents(account.initial);
  return [...dates].sort(([a],[b])=>a.localeCompare(b)).map(([date,item])=>{
    const start=balance/100; balance+=item.profitCents;
    const profit=item.profitCents/100;
    return {...item,date,profit,start,end:balance/100,percentage:start>0?profit/start*100:null};
  });
}
export function daySummary(account,book,date) {
  const prior=book.filter(d=>d.date<date), item=book.find(d=>d.date===date);
  const start=prior.at(-1)?.end??account.initial, end=item?.end??start;
  return {date,start,end,profit:item?.profit??null,percentage:item?.percentage??null,source:item?.source??null,
    expected:average(prior.map(d=>d.profit)), expectedPercent:average(prior.map(d=>d.percentage).filter(n=>n!==null)),
    accumulated:(cents(end)-cents(account.initial))/100, accumulatedPercent:(end-account.initial)/account.initial*100};
}
const monthGroups = new WeakMap();
export function monthSummary(account,book,month) {
  let groups=monthGroups.get(book);
  if (!groups) {
    groups=new Map();
    for (const day of book) { const key=day.date.slice(0,7); if (!groups.has(key)) groups.set(key,[]); groups.get(key).push(day); }
    monthGroups.set(book,groups);
  }
  const previous=[...groups].filter(([key])=>key<month).map(([,days])=>{
    const profit=days.reduce((s,d)=>s+cents(d.profit),0)/100, start=days[0].start;
    return {profit,percentage:start>0?profit/start*100:null};
  });
  const days=groups.get(month)||[], start=daySummary(account,book,`${month}-01`).start;
  const profit=days.length?days.reduce((s,d)=>s+cents(d.profit),0)/100:null, end=days.at(-1)?.end??start;
  return {date:month,start,end,profit,percentage:profit!==null&&start>0?profit/start*100:null,
    expected:average(previous.map(d=>d.profit)),expectedPercent:average(previous.map(d=>d.percentage).filter(n=>n!==null)),
    accumulated:(cents(end)-cents(account.initial))/100,accumulatedPercent:(end-account.initial)/account.initial*100};
}
export function history(account,state) {
  return [{id:`created-${account.id}`,type:'created',date:account.created,account}];
}

function reportPeriod(account,state,range) {
  const all=closedTrades(account,state);
  const openingBalance=(cents(account.initial)+all.filter(trade=>range.from && trade.date<range.from).reduce((sum,trade)=>sum+cents(trade.profit),0))/100;
  const trades=all.filter(trade=>(!range.from || trade.date>=range.from) && (!range.to || trade.date<=range.to));
  return {openingBalance,trades,series:dailySeries(trades,openingBalance)};
}
function dailySeries(trades,openingBalance) {
  const days=new Map();
  for (const trade of trades) days.set(trade.date,(days.get(trade.date)||0)+cents(trade.profit));
  let balance=cents(openingBalance);
  return [...days].sort(([a],[b])=>a.localeCompare(b)).map(([date,profitCents])=>{
    balance+=profitCents;
    return {date,profit:profitCents/100,balance:balance/100};
  });
}
export function dailyBalanceSeries(account,state,range={}) {
  return reportPeriod(account,state,range).series;
}

const curveFromDailySeries = (openingBalance,series) => {
  if (!series.length) return [];
  return [
    {date:series[0].date,balance:openingBalance},
    ...series.map((day,index)=>({date:series[index+1]?.date??addDays(day.date,1),balance:day.balance})),
  ];
};
export function balanceCurveSeries(account,state,range={}) {
  const {openingBalance,series}=reportPeriod(account,state,range);
  return curveFromDailySeries(openingBalance,series);
}

const sumMoney = values => values.reduce((total,value)=>total+cents(value),0)/100;
const directionStats = (trades,direction) => {
  const selected=trades.filter(trade=>trade.direction===direction);
  const wins=selected.filter(trade=>trade.profit>0).length;
  return {count:selected.length,winRate:selected.length?wins/selected.length*100:null,netProfit:sumMoney(selected.map(trade=>trade.profit))};
};
function streakStats(trades,positive) {
  let current={count:0,profit:0}, best={count:0,profit:0};
  const improves = candidate => candidate.count>best.count || (candidate.count===best.count && (positive?candidate.profit>best.profit:candidate.profit<best.profit));
  for (const trade of trades) {
    if ((positive && trade.profit>0) || (!positive && trade.profit<0)) {
      current={count:current.count+1,profit:(cents(current.profit)+cents(trade.profit))/100};
      if (improves(current)) best={...current};
    } else current={count:0,profit:0};
  }
  return best;
}

export function reportStats(account,state,range={}) {
  const {trades,series,openingBalance}=reportPeriod(account,state,range);
  const netProfit=sumMoney(trades.map(trade=>trade.profit));
  const positiveNet=trades.filter(trade=>trade.profit>0).map(trade=>trade.profit);
  const negativeNet=trades.filter(trade=>trade.profit<0).map(trade=>trade.profit);
  const gross=trades.map(trade=>Number.isFinite(trade.grossProfit)?trade.grossProfit:trade.profit);
  const commissions=trades.map(trade=>Number.isFinite(trade.commission)?trade.commission:0);
  const swaps=trades.map(trade=>Number.isFinite(trade.swap)?trade.swap:0);
  let peak=openingBalance, maxDrawdown={amount:0,percent:0};
  for (const day of series) {
    if (day.balance>peak) peak=day.balance;
    const amount=(cents(peak)-cents(day.balance))/100;
    if (amount>maxDrawdown.amount) maxDrawdown={amount,percent:peak>0?amount/peak*100:0};
  }
  const durations=trades.map(trade=>new Date(trade.closedAt)-new Date(trade.openedAt)).filter(duration=>Number.isFinite(duration)&&duration>=0);
  const sortedDurations=[...durations].sort((a,b)=>a-b);
  const positiveDays=series.filter(day=>day.profit>0), negativeDays=series.filter(day=>day.profit<0);
  const byProfit=[...series].sort((a,b)=>a.profit-b.profit);
  return {
    openingBalance,
    balance:(cents(openingBalance)+cents(netProfit))/100,
    netProfit,
    returnPercent:openingBalance?netProfit/openingBalance*100:null,
    totalTrades:trades.length,
    grossProfit:sumMoney(gross.filter(value=>value>0)),
    grossLoss:sumMoney(gross.filter(value=>value<0)),
    commissions:sumMoney(commissions), swap:sumMoney(swaps),
    costs:sumMoney([...commissions,...swaps]),
    expectancy:average(trades.map(trade=>trade.profit)),
    profitFactor:negativeNet.length?sumMoney(positiveNet)/Math.abs(sumMoney(negativeNet)):(positiveNet.length?Infinity:null),
    maxDrawdown,
    winningTrades:positiveNet.length, losingTrades:negativeNet.length,
    winRate:trades.length?positiveNet.length/trades.length*100:null,
    largestWin:positiveNet.length?Math.max(...positiveNet):null,
    largestLoss:negativeNet.length?Math.min(...negativeNet):null,
    averageWin:average(positiveNet), averageLoss:average(negativeNet),
    buys:directionStats(trades,'Compra'), sells:directionStats(trades,'Venta'),
    winningStreak:streakStats(trades,true), losingStreak:streakStats(trades,false),
    duration:{average:average(durations),longest:sortedDurations.at(-1)??null,shortest:sortedDurations[0]??null},
    days:{
      total:series.length, positive:positiveDays.length, negative:negativeDays.length,
      best:byProfit.length?{date:byProfit.at(-1).date,profit:byProfit.at(-1).profit}:null,
      worst:byProfit.length?{date:byProfit[0].date,profit:byProfit[0].profit}:null,
    },
    series,
    curve:curveFromDailySeries(openingBalance,series),
  };
}
