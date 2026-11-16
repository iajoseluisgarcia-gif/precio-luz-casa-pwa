'use strict';
const https = require('https');
const zone = 'Europe/Madrid';
const dateFormatter = new Intl.DateTimeFormat('en-CA', {timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});
const hourFormatter = new Intl.DateTimeFormat('en-GB', {timeZone:zone,hour:'2-digit',hourCycle:'h23'});
function localDate(offset=0, now=new Date()) {
  const p=Object.fromEntries(dateFormatter.formatToParts(now).map(x=>[x.type,x.value]));
  return new Date(Date.UTC(+p.year,+p.month-1,+p.day+offset)).toISOString().slice(0,10);
}
function expectedHours(day) {
  const midnight=Date.parse(day+'T00:00:00Z'), rows=[];
  for(let t=midnight-3*3600000;t<midnight+27*3600000;t+=3600000) {
    const d=new Date(t);
    if(localDate(0,d)===day) rows.push({h:+hourFormatter.format(d),t});
  }
  return rows;
}
function validate(rows,day) {
  const expected=expectedHours(day);
  if(!Array.isArray(rows)||rows.length!==expected.length) throw Error('incomplete');
  return rows.map((r,i)=>{
    if(r.h!==expected[i].h||typeof r.p!=='number'||!Number.isFinite(r.p)||r.p< -1||r.p>3) throw Error('invalid');
    return {...expected[i],p:r.p};
  });
}
function get(url) {
  return new Promise((resolve,reject)=>{
    let req;
    const deadline=setTimeout(()=>{reject(Error('deadline'));if(req)req.destroy(Error('deadline'));},2500);
    const fail=e=>{clearTimeout(deadline);reject(e);};
    req=https.get(url,{headers:{'User-Agent':'PrecioLuzCasaAlexa/1.1','Accept':'application/json'}},r=>{
      if(r.statusCode!==200){r.resume();return fail(Error('status'));}
      let b='';r.on('error',fail);r.on('aborted',()=>fail(Error('aborted')));
      r.on('data',d=>{b+=d;if(b.length>250000)req.destroy(Error('size'));});
      r.on('end',()=>{clearTimeout(deadline);try{resolve(JSON.parse(b));}catch(e){reject(e);}});
    });
    req.on('error',fail);
  });
}
async function prices(day,offset,fetchJson=get) {
  const sources=[async()=>{
    const j=await fetchJson('https://preciluz.com/datos/precio-'+(offset?'manana':'hoy')+'.json');
    if(j.fecha!==day||j.zona!=='PCB'||j.unidad!=='€/kWh'||!Array.isArray(j.horas))throw Error('metadata');
    return validate(j.horas.map(x=>({h:x.hora,p:x.pvpc})),day);
  },async()=>{
    const j=await fetchJson('https://energialert.com/v1/prices?date='+day+'&market=pvpc'),d=j.data;
    if(j.success!==true||!d||d.published!==true||d.date!==day||d.market!=='pvpc'||d.stepMinutes!==60||!Array.isArray(d.slots))throw Error('metadata');
    const expected=expectedHours(day);
    const rows=d.slots.map((x,i)=>{
      if(!expected[i]||Date.parse(x.startsAt)!==expected[i].t||Date.parse(x.endsAt)!==expected[i].t+3600000)throw Error('interval');
      return {h:expected[i].h,p:x.eurKwh};
    });
    return validate(rows,day);
  }];
  for(const source of sources){try{return await source();}catch(e){}}
  return null;
}
function fmt(row,rows) {
  const end=+hourFormatter.format(new Date(row.t+3600000));
  const repeats=rows.filter(x=>x.h===row.h);
  const suffix=repeats.length>1?(repeats[0].t===row.t?', primera vez que pasa esa hora':', segunda vez que pasa esa hora'):'';
  return 'de las '+row.h+' a las '+end+suffix;
}
function cents(p){return (p*100).toLocaleString('es-ES',{maximumFractionDigits:3});}
function speech(text,keepOpen=false) {
  const response={outputSpeech:{type:'PlainText',text},card:{type:'Simple',title:'Precio Luz Casa',content:text},shouldEndSession:!keepOpen};
  if(keepOpen)response.reprompt={outputSpeech:{type:'PlainText',text:'Puedes decir precios de hoy o precios de mañana.'}};
  return {version:'1.0',response};
}
async function handle(event,now=new Date(),fetchJson=get) {
  const request=event.request||{},intent=request.intent?.name;
  if(request.type==='SessionEndedRequest')return {version:'1.0',response:{}};
  if(['AMAZON.StopIntent','AMAZON.CancelIntent'].includes(intent))return speech('Hasta luego.');
  if(intent==='AMAZON.HelpIntent'||intent==='AMAZON.FallbackIntent')return speech('Puedes preguntar por los precios de hoy o los de mañana. Te diré las horas más baratas y más caras.',true);
  if(request.type!=='LaunchRequest'&&!['PrecioHoyIntent','PrecioMananaIntent'].includes(intent))return speech('Puedes decir precios de hoy o precios de mañana.',true);
  const offset=intent==='PrecioMananaIntent'?1:0,day=localDate(offset,now),label=offset?'mañana':'hoy';
  try {
    const rows=await prices(day,offset,fetchJson);
    if(!rows)return speech('Aún no tengo precios verificados de '+label+'. Prueba más tarde.');
    const low=rows.reduce((a,b)=>b.p<a.p?b:a),high=rows.reduce((a,b)=>b.p>a.p?b:a);
    let text='Para '+label+', la hora más barata '+(!offset&&low.t+3600000<=now.getTime()?'fue ':'es ')+fmt(low,rows)+', a '+cents(low.p)+' céntimos por kilovatio hora. La más cara es '+fmt(high,rows)+', a '+cents(high.p)+' céntimos.';
    if(!offset&&low.t+3600000<=now.getTime()){
      const remaining=rows.filter(x=>x.t>=now.getTime());
      if(remaining.length){const next=remaining.reduce((a,b)=>b.p<a.p?b:a);text+=' De las horas completas que quedan, la más barata es '+fmt(next,rows)+', a '+cents(next.p)+' céntimos.';}
    }
    return speech(text+' Son precios PVPC peninsulares de energía sin impuestos; pueden ser distintos de tu contrato.');
  }catch(e){return speech('No puedo verificar los precios en este momento. Inténtalo después.');}
}
exports.handler=event=>handle(event);
exports._test={localDate,expectedHours,validate,prices,handle};
