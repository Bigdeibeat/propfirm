const IMPORT_KEY='mt5-report-1514656031-v1';

const account={
  id:'mt5-account-1514656031',
  number:'1514656031',
  initial:100000,
  currency:'USD',
  firm:'FTMO Global Markets Ltd',
  cost:0,
  created:'2026-09-17',
  type:'$100k FTMO Free Trial Swing 2-Step',
};

const records=[
  ['521859230','544513464','2026-09-17T12:41:03','2026-09-17T12:41:22','XAUUSD','Venta',0.5,4310.07,4310.19,4311.05,4308.45,-6,-3.02,0],
  ['521861109','544513464','2026-09-17T12:41:03','2026-09-17T12:45:52','XAUUSD','Venta',0.5,4310.07,4308.43,4311.05,4308.45,82,-3.02,0],
  ['521863463','544515991','2026-09-17T12:46:41','2026-09-17T12:50:38','XAUUSD','Compra',1,4308.87,4310.11,4306.59,4310.16,124,-6.04,0],
  ['521974862','544165401','2026-09-17T01:13:51','2026-09-17T15:09:09','US100.cash','Compra',10,28978.57,29342.23,28983.89,29341.34,3636.60,0,0],
  ['522270119','544902434','2026-09-17T18:46:44','2026-09-17T19:36:58','XAUUSD','Venta',0.3,4365.46,4360.63,4373.80,null,144.90,-1.84,0],
  ['522627180','545303120','2026-09-18T10:28:51','2026-09-18T10:42:32','US100.cash','Venta',10,29665.73,29654.28,null,29654.59,114.50,0,0],
  ['522628328','545299721','2026-09-18T10:20:39','2026-09-18T10:45:06','XAUUSD','Compra',0.05,4393.56,4394.44,null,null,4.40,-0.30,0],
  ['523011897','545711652','2026-09-18T18:23:30','2026-09-18T18:26:08','US100.cash','Compra',10,29448.78,29462.83,29434.72,29462.19,140.50,0,0],
  ['523619521','546345190','2026-09-21T11:12:16','2026-09-21T11:19:39','XAUUSD','Compra',1,4351.75,4354.49,4345.42,4357.07,274,-6.10,0],
  ['523693769','546424158','2026-09-21T12:56:16','2026-09-21T13:03:13','XAUUSD','Compra',0.15,4347.12,4348.39,4347.46,4548.74,19.05,-0.91,0],
  ['523719500','546424158','2026-09-21T12:56:16','2026-09-21T13:52:55','XAUUSD','Compra',0.15,4347.12,4347.46,4347.46,4548.74,5.10,-0.92,0],
  ['523723670','546423466','2026-09-21T12:55:17','2026-09-21T13:59:22','EURUSD','Compra',1,1.14798,1.14801,1.14802,1.14996,3,-5,0],
  ['523736162','546472726','2026-09-21T14:15:31','2026-09-21T14:15:59','EURUSD','Compra',10,1.14832,1.14831,1.14808,1.14916,-10,-50,0],
  ['523779340','546472726','2026-09-21T14:15:31','2026-09-21T15:02:25','EURUSD','Compra',10,1.14832,1.14914,1.14808,1.14916,820,-50,0],
];

const importedTrades=records.map(([deal,position,openedAt,closedAt,symbol,direction,size,entry,closePrice,sl,tp,grossProfit,commission,swap])=>({
  id:`mt5-1514656031-${deal}`,
  sourceDeal:deal,
  sourcePosition:position,
  accountId:account.id,
  date:closedAt.slice(0,10),
  openedAt,
  closedAt,
  symbol,
  direction,
  size,
  entry,
  closePrice,
  sl,
  tp,
  grossProfit,
  commission,
  swap,
  profit:Math.round((grossProfit+commission+swap)*100)/100,
  note:'',
}));

export function applyMt5Report1514656031(state) {
  state.imports ||= {};
  if (state.imports[IMPORT_KEY]) return false;
  state.accounts ||= [];
  state.trades ||= [];
  state.manual ||= {};
  let target=state.accounts.find(item=>item.number===account.number);
  if (!target) { target={...account}; state.accounts.push(target); }
  state.manual[target.id] ||= {};
  for (const trade of importedTrades) {
    if (state.trades.some(item=>item.accountId===target.id&&(item.id===trade.id||item.sourceDeal===trade.sourceDeal))) continue;
    state.trades.push({...trade,accountId:target.id});
  }
  state.accountId=target.id;
  state.imports[IMPORT_KEY]=true;
  return true;
}
