import { money, percent, reportStats, shortDate, tone } from './domain.js';

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
export function reportView(account,data) {
  const stats=reportStats(account,data);
  const cash=value=>money(value,account.currency,false), magnitude=value=>money(value===null?null:Math.abs(value),account.currency,false), signed=value=>money(value,account.currency,true), pc=value=>percent(value);
  const best=stats.days.best, worst=stats.days.worst;
  return '<div class="view report-view"><div class="report-scroll"><header class="report-heading"><h1>RESUMEN DE LA CUENTA</h1></header>'+
    '<section class="report-summary"><span>BALANCE ACTUAL</span><strong class="'+tone(stats.netProfit)+'">'+cash(stats.balance)+'</strong><div class="'+tone(stats.netProfit)+'">'+signed(stats.netProfit)+' <i>/</i> '+percent(stats.returnPercent,true)+'</div></section>'+
    '<section class="report-chart-card"><div><h2>CURVA DE BALANCE</h2><span>'+stats.totalTrades+' operaciones en '+stats.days.total+' días</span></div>'+balanceChart(stats)+'</section>'+
    reportSection('RESULTADOS Y COSTES',[
      reportCard('BRUTO POSITIVO',magnitude(stats.grossProfit),'positive'),reportCard('BRUTO NEGATIVO',magnitude(stats.grossLoss),'negative'),
      reportCard('COMISIONES',magnitude(stats.commissions),'negative'),reportCard('SWAPS',magnitude(stats.swap),'negative'),
      reportCard('COSTES TOTALES',magnitude(stats.costs),'negative'),reportCard('BENEFICIO ESPERADO',magnitude(stats.expectancy),tone(stats.expectancy)),
    ])+
    reportSection('RENDIMIENTO DE LAS OPERACIONES',[
      reportCard('PROFIT FACTOR',compactNumber(stats.profitFactor),tone((stats.profitFactor??1)-1)),reportCard('DRAWDOWN MÁXIMO',magnitude(stats.maxDrawdown.amount),'negative',pc(stats.maxDrawdown.percent)),
      reportCard('GANADORAS',String(stats.winningTrades),'positive'),reportCard('PERDEDORAS',String(stats.losingTrades),stats.losingTrades?'negative':'neutral'),
      reportCard('TASA DE ACIERTO',pc(stats.winRate),tone((stats.winRate??50)-50)),reportCard('MAYOR GANADORA',cash(stats.largestWin),tone(stats.largestWin)),
      reportCard('MAYOR PERDEDORA',magnitude(stats.largestLoss),tone(stats.largestLoss)),reportCard('MEDIA GANADORAS',cash(stats.averageWin),tone(stats.averageWin)),
      reportCard('MEDIA PERDEDORAS',magnitude(stats.averageLoss),tone(stats.averageLoss)),reportCard('OPERACIONES',String(stats.totalTrades),'neutral'),
    ])+
    reportSection('COMPRAS Y VENTAS',[
      reportCard('COMPRAS',String(stats.buys.count),'neutral',pc(stats.buys.winRate)+' GANADORAS'),reportCard('VENTAS',String(stats.sells.count),'neutral',pc(stats.sells.winRate)+' GANADORAS'),
      reportCard('NETO COMPRAS',magnitude(stats.buys.netProfit),tone(stats.buys.netProfit)),reportCard('NETO VENTAS',magnitude(stats.sells.netProfit),tone(stats.sells.netProfit)),
    ])+
    reportSection('RACHAS',[
      reportCard('MAYOR RACHA GANADORA',String(stats.winningStreak.count),stats.winningStreak.count?'positive':'neutral',signed(stats.winningStreak.profit)),
      reportCard('MAYOR RACHA PERDEDORA',String(stats.losingStreak.count),stats.losingStreak.count?'negative':'neutral',signed(stats.losingStreak.profit)),
    ])+
    reportSection('TIEMPO Y DÍAS',[
      reportCard('DURACIÓN MEDIA',durationText(stats.duration.average),'neutral'),reportCard('OPERACIÓN MÁS LARGA',durationText(stats.duration.longest),'neutral'),
      reportCard('OPERACIÓN MÁS CORTA',durationText(stats.duration.shortest),'neutral'),reportCard('DÍAS OPERADOS',String(stats.days.total),'neutral'),
      reportCard('DÍAS POSITIVOS',String(stats.days.positive),'positive'),reportCard('DÍAS NEGATIVOS',String(stats.days.negative),stats.days.negative?'negative':'neutral'),
      reportCard('MEJOR DÍA',best?magnitude(best.profit):cash(null),tone(best?.profit),best?shortDate(best.date):''),reportCard('PEOR DÍA',worst?magnitude(worst.profit):cash(null),tone(worst?.profit),worst?shortDate(worst.date):''),
    ])+'</div></div>';
}
