/* Gordinho Empréstimos — backend. Credenciais ficam nas Propriedades do script. */
var HEADERS = {
  Clientes:['id','name','phone','document','address','notes','created'],
  Emprestimos:['id','clientId','principal','rate','interest','start','schedule','period','notes','closed','closeReason','closedAt','created','requestId'],
  Pagamentos:['id','loanId','amount','date','method','notes','created','reversed','reverseReason','requestId'],
  Despesas:['id','amount','date','description','created','requestId']
};
function configurarSistema(){
  var props=PropertiesService.getScriptProperties(),user=props.getProperty('ADMIN_USUARIO'),pass=props.getProperty('ADMIN_SENHA_INICIAL');
  if(!props.getProperty('PASSWORD_HASH')&&(!user||!pass||pass.length<12))throw Error('Preencha ADMIN_USUARIO e ADMIN_SENHA_INICIAL (12 caracteres ou mais) nas Propriedades do script.');
  var id=props.getProperty('SPREADSHEET_ID'),ss=id?SpreadsheetApp.openById(id):SpreadsheetApp.create('Gordinho Empréstimos');
  props.setProperty('SPREADSHEET_ID',ss.getId());ss.setSpreadsheetTimeZone('America/Sao_Paulo');
  Object.keys(HEADERS).forEach(function(name){var sh=ss.getSheetByName(name)||ss.insertSheet(name);if(sh.getLastRow()===0){sh.getRange(1,1,1,HEADERS[name].length).setValues([HEADERS[name]]).setFontWeight('bold').setBackground('#111827').setFontColor('#ffffff');sh.setFrozenRows(1);sh.autoResizeColumns(1,HEADERS[name].length);}});
  if(!props.getProperty('PASSWORD_HASH')){props.setProperty('PEPPER',Utilities.getUuid()+Utilities.getUuid());props.setProperty('PASSWORD_HASH',passwordHash_(pass));props.deleteProperty('ADMIN_SENHA_INICIAL');}
  console.log('Planilha: '+ss.getUrl());return ss.getUrl();
}
function doGet(){return ContentService.createTextOutput(JSON.stringify({ok:true,service:'Gordinho Empréstimos',message:'Acesse o login pelo seu site.'})).setMimeType(ContentService.MimeType.JSON);}
function doPost(e){var result;try{result=rpc(JSON.parse(e.postData.contents));}catch(err){result={ok:false,error:'Solicitação inválida.'};}return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);}
function rpc(input){
  var lock=LockService.getScriptLock();
  try{
    if(!lock.tryLock(20000))throw Error('O sistema está ocupado. Tente novamente.');
    if(!input||typeof input!=='object')throw Error('Solicitação inválida.');
    var props=PropertiesService.getScriptProperties();if(!props.getProperty('PASSWORD_HASH'))throw Error('Execute configurarSistema no Google Script.');
    if(input.action==='login')return {ok:true,data:login_(input)};
    var key='SESSION_'+digest_(String(input.token||'')),raw=props.getProperty(key),session=raw&&JSON.parse(raw);
    if(!session||session.expires<Date.now()) {if(raw)props.deleteProperty(key);return {ok:false,error:'Sua sessão expirou. Entre novamente.',code:'AUTH'};}
    if(input.action==='logout'){props.deleteProperty(key);return {ok:true,data:true};}
    if(input.action==='changePassword'){
      if(!safeEqual_(passwordHash_(String(input.current||'')),props.getProperty('PASSWORD_HASH')))throw Error('Senha atual incorreta.');
      if(typeof input.password!=='string'||input.password.length<12||input.password.length>200)throw Error('Use uma senha entre 12 e 200 caracteres.');
      props.setProperty('PASSWORD_HASH',passwordHash_(input.password));clearSessions_();return {ok:true,data:true};
    }
    var ss=SpreadsheetApp.openById(props.getProperty('SPREADSHEET_ID'));
    var clients=rows_(ss,'Clientes'),loans=rows_(ss,'Emprestimos'),payments=rows_(ss,'Pagamentos'),expenses=rows_(ss,'Despesas'),action=input.action;
    if(action==='load')return {ok:true,data:{clients:clients,loans:loans,payments:payments,expenses:expenses,today:DGCore.today()}};
    // Todos os valores financeiros são inteiros em centavos; nenhum cálculo confia no navegador.
    var p=input.data||{},id;
    if(['saveClient','createLoan','pay','expense'].indexOf(action)!==-1){
      if(!/^[a-zA-Z0-9-]{10,100}$/.test(input.requestId||''))throw Error('Identificador de operação ausente.');
      if(action!=='saveClient') {var target=action==='createLoan'?loans:action==='pay'?payments:expenses;var duplicate=target.find(function(r){return r.requestId===input.requestId;});if(duplicate)return {ok:true,data:{id:duplicate.id}};}
    }
    if(action==='saveClient'){
      var c={id:p.id||input.requestId,name:text_(p.name,120,true),phone:text_(p.phone,30),document:text_(p.document,30),address:text_(p.address,300),notes:text_(p.notes,3000),created:new Date().toISOString()};
      if(p.id){var old=clients.find(function(x){return x.id===p.id;});if(!old)throw Error('Cliente não encontrado.');c.created=old.created;update_(ss,'Clientes',c);}else if(!clients.some(function(x){return x.id===c.id;}))append_(ss,'Clientes',c);id=c.id;
    }else if(action==='createLoan'){
      if(!clients.some(function(c){return c.id===p.clientId;}))throw Error('Selecione um cliente.');
      var principal=money_(p.principal),rate=Number(p.rate);if(!Number.isFinite(rate)||rate<0||rate>1000)throw Error('Percentual inválido.');
      var interest=Math.round(principal*rate/100),total=principal+interest;if(!Number.isSafeInteger(total))throw Error('Valor inválido.');
      var start=DGCore.date(p.start),first=DGCore.date(p.firstDue);if(start>DGCore.today()||first<start)throw Error('Confira a data de liberação e o vencimento.');
      var schedule=DGCore.schedule(first,Number(p.count),p.period,total);
      var l={id:Utilities.getUuid(),clientId:p.clientId,principal:principal,rate:rate,interest:interest,start:start,schedule:JSON.stringify(schedule),period:p.period,notes:text_(p.notes,3000),closed:'',closeReason:'',closedAt:'',created:new Date().toISOString(),requestId:input.requestId};append_(ss,'Emprestimos',l);id=l.id;
    }else if(action==='pay'){
      var loan=loans.find(function(l){return l.id===p.loanId;});if(!loan)throw Error('Empréstimo não encontrado.');var summary=DGCore.calculate(loan,payments),amount=money_(p.amount),date=DGCore.date(p.date);
      if(loan.closed||amount>summary.balance)throw Error('Valor acima do saldo ou empréstimo encerrado.');if(date<loan.start||date>DGCore.today())throw Error('A data deve estar entre a liberação e hoje.');
      if(['PIX','Dinheiro','Transferência','Outro'].indexOf(p.method)===-1)throw Error('Forma de pagamento inválida.');
      var payment={id:Utilities.getUuid(),loanId:loan.id,amount:amount,date:date,method:p.method,notes:text_(p.notes,1500),created:new Date().toISOString(),reversed:'',reverseReason:'',requestId:input.requestId};append_(ss,'Pagamentos',payment);id=payment.id;
    }else if(action==='reverse'){
      var payment=payments.find(function(x){return x.id===p.id;});if(!payment)throw Error('Pagamento não encontrado.');var loan=loans.find(function(l){return l.id===payment.loanId;});if(loan.closed)throw Error('Reabra o empréstimo antes de estornar.');if(!payment.reversed){payment.reversed=new Date().toISOString();payment.reverseReason=text_(p.reason,500,true);update_(ss,'Pagamentos',payment);}id=payment.id;
    }else if(action==='notes'||action==='close'||action==='reopen'){
      var loan=loans.find(function(x){return x.id===p.id;});if(!loan)throw Error('Empréstimo não encontrado.');
      if(action==='notes')loan.notes=text_(p.notes,3000);
      if(action==='close'){if(DGCore.calculate(loan,payments).balance===0)throw Error('O empréstimo já está quitado ou encerrado.');loan.closed='perda';loan.closeReason=text_(p.reason,1500,true);loan.closedAt=DGCore.today();}
      if(action==='reopen'){loan.closed='';loan.closeReason='';loan.closedAt='';}
      update_(ss,'Emprestimos',loan);id=loan.id;
    }else if(action==='expense'){
      var ex={id:Utilities.getUuid(),amount:money_(p.amount),date:DGCore.date(p.date),description:text_(p.description,500,true),created:new Date().toISOString(),requestId:input.requestId};if(ex.date>DGCore.today())throw Error('A despesa não pode ser futura.');append_(ss,'Despesas',ex);id=ex.id;
    }else throw Error('Ação inválida.');
    SpreadsheetApp.flush();return {ok:true,data:{id:id}};
  }catch(err){console.error(err);return {ok:false,error:err.message||'Não foi possível concluir. Tente novamente.'};}finally{if(lock.hasLock())lock.releaseLock();}
}
function login_(p){
  var props=PropertiesService.getScriptProperties(),attempt=JSON.parse(props.getProperty('LOGIN_ATTEMPTS')||'{"count":0,"until":0}');
  if(attempt.until>Date.now()&&attempt.count>=10)throw Error('Muitas tentativas. Aguarde 15 minutos.');
  if(attempt.until<Date.now())attempt={count:0,until:Date.now()+900000};
  var valid=String(p.username||'')===props.getProperty('ADMIN_USUARIO')&&safeEqual_(passwordHash_(String(p.password||'')),props.getProperty('PASSWORD_HASH'));
  if(!valid){attempt.count++;props.setProperty('LOGIN_ATTEMPTS',JSON.stringify(attempt));throw Error('Usuário ou senha incorretos.');}
  props.deleteProperty('LOGIN_ATTEMPTS');
  Object.keys(props.getProperties()).filter(function(k){return k.indexOf('SESSION_')===0;}).forEach(function(k){try{if(JSON.parse(props.getProperty(k)).expires<Date.now())props.deleteProperty(k);}catch(e){props.deleteProperty(k);}});
  var token=Utilities.getUuid()+Utilities.getUuid(),expires=Date.now()+8*60*60*1000;props.setProperty('SESSION_'+digest_(token),JSON.stringify({expires:expires}));return {token:token,expires:expires,username:props.getProperty('ADMIN_USUARIO')};
}
function clearSessions_(){var p=PropertiesService.getScriptProperties();Object.keys(p.getProperties()).filter(function(k){return k.indexOf('SESSION_')===0;}).forEach(function(k){p.deleteProperty(k);});}
function digest_(value){return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,value,Utilities.Charset.UTF_8));}
function passwordHash_(value){return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(value,PropertiesService.getScriptProperties().getProperty('PEPPER')||'',Utilities.Charset.UTF_8));}
function safeEqual_(a,b){if(!a||!b||a.length!==b.length)return false;var diff=0;for(var i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
function money_(value){var n=Number(value);if(!Number.isFinite(n)||n<=0||n>10000000)throw Error('Informe um valor entre R$ 0,01 e R$ 10.000.000.');var c=DGCore.cents(n);if(c<1)throw Error('Valor mínimo R$ 0,01.');return c;}
function text_(value,max,required){var s=String(value==null?'':value).trim();if((required&&!s)||s.length>max)throw Error('Confira os campos obrigatórios e o tamanho do texto.');return s;}
function rows_(ss,name){var sh=ss.getSheetByName(name);if(!sh)throw Error('Abas ausentes. Execute configurarSistema.');if(sh.getLastRow()<2)return [];return sh.getRange(2,1,sh.getLastRow()-1,HEADERS[name].length).getValues().map(function(row){var o={};HEADERS[name].forEach(function(k,i){o[k]=row[i] instanceof Date?Utilities.formatDate(row[i],'America/Sao_Paulo','yyyy-MM-dd'):row[i];});return o;});}
function safeCell_(value){return typeof value==='string'&&/^[=+@-]/.test(value)?"'"+value:value;}
function append_(ss,name,obj){var sh=ss.getSheetByName(name),row=sh.getLastRow()+1;sh.getRange(row,1,1,HEADERS[name].length).setValues([HEADERS[name].map(function(k){return safeCell_(obj[k]==null?'':obj[k]);})]);}
function update_(ss,name,obj){var sh=ss.getSheetByName(name),ids=sh.getRange(2,1,sh.getLastRow()-1,1).getValues(),index=ids.findIndex(function(r){return r[0]===obj.id;});if(index<0)throw Error('Registro não encontrado.');sh.getRange(index+2,1,1,HEADERS[name].length).setValues([HEADERS[name].map(function(k){return safeCell_(obj[k]==null?'':obj[k]);})]);}
