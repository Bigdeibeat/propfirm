const IMPORT_KEY='mt5-report-1514697145-v1';

const account={
  id:'mt5-account-1514697145',
  number:'1514697145',
  initial:50000,
  currency:'USD',
  firm:'FTMO Global Markets Ltd',
  cost:0,
  created:'2026-09-21',
  type:'$50k FTMO Free Trial Swing 2-Step',
};

const records=[
  ['547131667','2026-09-22T05:49:08','2026-09-22T07:02:33','XAUUSD','Venta',0.15,4345.17,4337.23,4373.45,4337.44,119.10,-0.92,0],
  ['547132502','2026-09-22T05:51:33','2026-09-22T07:59:45','US100.cash','Venta',10,30589.18,30509.53,30658.24,30509.79,796.50,0,0],
  ['547618262','2026-09-22T16:21:46','2026-09-22T16:31:35','US100.cash','Compra',10,30461.33,30543.58,30463.37,30544.24,822.50,0,0],
  ['547638539','2026-09-22T16:33:46','2026-09-22T21:23:42','US100.cash','Venta',5,30554.33,30707.58,30707.35,30464.99,-766.25,0,0],
  ['547664377','2026-09-22T16:44:20','2026-09-22T21:23:42','US100.cash','Venta',5,30611.53,30707.58,30707.35,30464.14,-480.25,0,0],
  ['547715846','2026-09-22T17:13:17','2026-09-22T21:23:41','US100.cash','Venta',2,30656.28,30706.38,30706.21,30464,-100.20,0,0],
  ['547723413','2026-09-22T17:17:23','2026-09-22T21:23:41','US100.cash','Venta',3,30656.43,30706.78,30706.78,30464,-151.05,0,0],
  ['547744997','2026-09-22T17:35:02','2026-09-22T21:23:42','US100.cash','Venta',10,30685.58,30707.58,30707.35,null,-220,0,0],
  ['548270747','2026-09-23T10:42:47','2026-09-23T11:05:14','US100.cash','Venta',20,30741.72,30719.58,30791.61,30719.65,442.80,0,0],
  ['548297815','2026-09-23T11:21:40','2026-09-23T11:43:14','US100.cash','Venta',20,30747.62,30730.56,30778.07,30714.95,341.30,0,0],
];

const importedTrades=records.map(([position,openedAt,closedAt,symbol,direction,size,entry,closePrice,sl,tp,grossProfit,commission,swap])=>({
  id:`mt5-${position}`,
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

export function applyMt5Report1514697145(state) {
  state.imports ||= {};
  if (state.imports[IMPORT_KEY]) return false;
  state.accounts ||= [];
  state.trades ||= [];
  state.manual ||= {};
  let target=state.accounts.find(item=>item.number===account.number);
  if (!target) { target={...account}; state.accounts.push(target); }
  state.manual[target.id] ||= {};
  for (const trade of importedTrades) {
    if (state.trades.some(item=>item.accountId===target.id&&(item.id===trade.id||item.sourcePosition===trade.sourcePosition))) continue;
    state.trades.push({...trade,accountId:target.id});
  }
  state.accountId=target.id;
  state.imports[IMPORT_KEY]=true;
  return true;
}
