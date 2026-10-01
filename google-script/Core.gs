(function(root){
  'use strict';
  const cents = value => Math.round(Number(value)*100);
  const today = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  function date(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||'')) throw Error('Data inválida.');const d=new Date(value+'T12:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value)throw Error('Data inválida.');return value;}
  function schedule(first,count,period,total){
    date(first);if(!Number.isInteger(count)||count<1||count>120)throw Error('Escolha de 1 a 120 parcelas.');
    if(!['unica','diaria','semanal','quinzenal','mensal'].includes(period))throw Error('Periodicidade inválida.');
    if(period==='unica'&&count!==1)throw Error('Pagamento único deve ter uma parcela.');
    if(total<count)throw Error('Valor insuficiente para a quantidade de parcelas.');
    const base=Math.floor(total/count),start=new Date(first+'T12:00:00Z');
    return Array.from({length:count},(_,i)=>{const d=new Date(start);if(period==='mensal'){const target=start.getUTCMonth()+i;d.setUTCDate(1);d.setUTCMonth(target);const end=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(start.getUTCDate(),end));}else d.setUTCDate(start.getUTCDate()+i*({diaria:1,semanal:7,quinzenal:15,unica:0}[period]||0));return {number:i+1,due:d.toISOString().slice(0,10),amount:base+(i===count-1?total-base*count:0)};});
  }
  function calculate(loan,payments,asOf=today()){
    const ps=payments.filter(p=>p.loanId===loan.id&&!p.reversed),paid=ps.reduce((s,p)=>s+Number(p.amount),0),total=Number(loan.principal)+Number(loan.interest),balance=Math.max(0,total-paid);
    let available=paid;const installments=JSON.parse(loan.schedule).map(p=>{const applied=Math.min(available,p.amount);available-=applied;return {...p,paid:applied,balance:p.amount-applied};});
    const next=installments.find(p=>p.balance>0),overdue=installments.filter(p=>p.due<asOf&&p.balance>0).reduce((s,p)=>s+p.balance,0),lost=loan.closed==='perda';
    return {paid,total,balance:lost?0:balance,forgiven:lost?balance:0,principalRecovered:Math.min(paid,loan.principal),profit:Math.max(0,paid-loan.principal),loss:lost?Math.max(0,loan.principal-paid):0,expected:lost?0:Math.max(0,loan.interest-Math.max(0,paid-loan.principal)),next:lost?null:next,overdue:lost?0:overdue,days:!lost&&next&&next.due<asOf?Math.round((new Date(asOf+'T12:00:00Z')-new Date(next.due+'T12:00:00Z'))/86400000):0,status:lost?'Encerrado':balance===0?'Quitado':overdue>0?'Atrasado':'Em dia',installments};
  }
  root.DGCore={cents,today,date,schedule,calculate};
  if(typeof module!=='undefined')module.exports=root.DGCore;
})(typeof window==='undefined'?globalThis:window);
