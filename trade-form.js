import { money, parseAmount, symbol, tradeNet } from './domain.js';
import { esc } from './html.js';

export function tradeFields(trade,account) {
  const missing=name=>Boolean((trade.sourcePosition || trade.sourceDeal) && trade[name]==null);
  const required=name=>missing(name)?' placeholder="No consta en el informe"':' required';
  const option=direction=>'<option' + (trade.direction===direction?' selected':'') + '>' + direction + '</option>';
  const value=name=>esc(trade[name] ?? '');
  return '<div class="form-grid">'+
    '<label>Apertura<input type="datetime-local" name="openedAt" value="'+value('openedAt')+'" required></label><label>Cierre<input type="datetime-local" name="closedAt" value="'+value('closedAt')+'" required></label>'+
    '<label>Símbolo<input name="symbol" value="'+value('symbol')+'" required placeholder="XAUUSD"></label><label>Dirección<select name="direction" required>'+option('Compra')+option('Venta')+'</select></label>'+
    '<label>Take profit<input name="tp" value="'+value('tp')+'"'+required('tp')+' inputmode="decimal"></label><label>Stop loss<input name="sl" value="'+value('sl')+'"'+required('sl')+' inputmode="decimal"></label>'+
    '<label>Tamaño de la posición<input name="size" value="'+value('size')+'" required inputmode="decimal"></label><label>Beneficio bruto ('+symbol(account.currency)+')<input name="grossProfit" value="'+value('grossProfit')+'" required inputmode="decimal"></label>'+
    '<label>Precio de entrada<input name="entry" value="'+value('entry')+'" required inputmode="decimal"></label><label>Precio de salida<input name="closePrice" value="'+value('closePrice')+'" required inputmode="decimal"></label>'+
    '<label>Comisión ('+symbol(account.currency)+')<input name="commission" value="'+value('commission')+'" required inputmode="decimal"></label><label>Swap ('+symbol(account.currency)+')<input name="swap" value="'+value('swap')+'" required inputmode="decimal"></label>'+
    '<label class="wide">Nota<textarea name="note" rows="2">'+esc(trade.note||'')+'</textarea></label><input type="hidden" name="netProfit" value="'+money(tradeNet(trade),account.currency,false)+'"></div>';
}

export function bindTradeNet(form,account) {
  const update=()=>{try{const values=['grossProfit','commission','swap'].map(name=>parseAmount(form.elements[name].value));form.elements.netProfit.value=values.some(value=>value===null)?'--':money(values.reduce((sum,value)=>sum+value,0),account.currency,false);}catch{form.elements.netProfit.value='--';}};
  ['grossProfit','commission','swap'].forEach(name=>form.elements[name].addEventListener('input',update));
  update();
}

export function tradeFromForm(form, original = null) {
  const entry=parseAmount(form.elements.entry.value), closePrice=parseAmount(form.elements.closePrice.value), tp=parseAmount(form.elements.tp.value), sl=parseAmount(form.elements.sl.value), size=parseAmount(form.elements.size.value);
  const grossProfit=parseAmount(form.elements.grossProfit.value), commission=parseAmount(form.elements.commission.value), swap=parseAmount(form.elements.swap.value);
  const missingAllowed=name=>Boolean((original?.sourcePosition || original?.sourceDeal) && original[name]==null);
  if ([entry,closePrice,grossProfit,commission,swap].some(value=>value===null) || (tp===null&&!missingAllowed('tp')) || (sl===null&&!missingAllowed('sl'))) throw new Error('Completa todos los datos numéricos.');
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
