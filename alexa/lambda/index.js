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

function screenText(text, fontSize, color, extra = {}) {
  return {type:'Text', text, fontSize, color, maxLines:1, ...extra};
}

function screenRange(row, rows) {
  const nextHour = Number(hourFormatter.format(new Date(row.t + 3600000)));
  const endHour = row.h === 23 && nextHour === 0 ? 24 : nextHour;
  const hourText = hour => String(hour).padStart(2, '0') + ':00';
  const repeats = rows.filter(item => item.h === row.h);
  const occurrence = repeats.length > 1 ? (repeats[0].t === row.t ? ' (1.ª)' : ' (2.ª)') : '';
  return hourText(row.h) + '–' + hourText(endHour) + occurrence;
}
const tariffColors = {
  low: {text:'#75F5AF', background:'#12382E'},
  high: {text:'#FFA49D', background:'#4A232B'},
  neutral: {text:'#EEF2F8', background:'#202F43'}
};

function groupSlots(slots, columns) {
  const groups = [];
  for (let index = 0; index < slots.length; index += columns) {
    const cards = slots.slice(index, index + columns);
    while (cards.length < columns) cards.push({range:'', price:'', text:'#101A2A', background:'#101A2A'});
    groups.push(cards);
  }
  return groups;
}
function scheduleView() {
  const row = {
    type:'Container', direction:'row', width:'100%', spacing:'${index > 0 ? 5 : 0}',
    data:'${data}',
    items:[{
      type:'Frame', width:0, grow:1, spacing:'${index > 0 ? 6 : 0}',
      height:'${viewport.height < 530 ? 36 : 48}', backgroundColor:'${data.background}', borderRadius:8,
      item:{
        type:'Container', width:'100%', height:'100%', direction:'row',
        alignItems:'center', justifyContent:'spaceBetween', paddingLeft:9, paddingRight:9,
        items:[
          screenText('${data.range}', '${viewport.width < 1050 ? 14 : 17}', '${data.text}'),
          screenText('${data.price}', '${viewport.width < 1050 ? 16 : 21}', '${data.text}', {fontWeight:'700', spacing:5})
        ]
      }
    }]
  };
  return {
    type:'ScrollView', width:'100vw', height:'100vh',
    bind:[{name:'roundScreen', value:"${viewport.shape == 'round'}"}],
    item:{
      type:'Container', width:'100%',
      paddingLeft:"${roundScreen ? '13vw' : (viewport.width < 1050 ? 16 : 28)}",
      paddingRight:"${roundScreen ? '13vw' : (viewport.width < 1050 ? 16 : 28)}",
      paddingTop:"${roundScreen ? '13vh' : (viewport.height < 530 ? 12 : 22)}",
      paddingBottom:"${roundScreen ? '13vh' : 14}",
      items:[
        screenText('${schedule.title}', '${roundScreen || viewport.height < 530 ? 26 : 36}', '#FFFFFF',
          {fontWeight:'700', textAlign:"${roundScreen ? 'center' : 'left'}"}),
        screenText("${roundScreen ? 'PVPC · céntimos/kWh' : 'PVPC peninsular · céntimos/kWh · sin impuestos'}",
          14, '#C5D3E3', {textAlign:"${roundScreen ? 'center' : 'left'}"}),
        {
          type:'Container', direction:'row', spacing:5, justifyContent:"${roundScreen ? 'center' : 'start'}",
          items:[
            screenText('Más baratas', 14, tariffColors.low.text, {fontWeight:'700'}),
            screenText('Más caras', 14, tariffColors.high.text, {fontWeight:'700', spacing:16})
          ]
        },
        {
          type:'Container', width:'100%', spacing:9,
          data:'${roundScreen ? schedule.list : (viewport.width < 720 ? schedule.pairs : schedule.grid)}',
          items:[row]
        },
        screenText('${schedule.nextHint}', 14, tariffColors.low.text,
          {when:"${!roundScreen && schedule.nextHint != ''}", spacing:8})
      ]
    }
  };
}
function priceScreen(rows, day, label, now, next) {
  const cheap = [...rows].sort((a,b) => a.p - b.p || a.t - b.t).slice(0,3);
  const expensive = [...rows].sort((a,b) => b.p - a.p || b.t - a.t).slice(0,3);
  const cheapTimes = new Set(cheap.map(row => row.t));
  const expensiveTimes = new Set(expensive.map(row => row.t));
  const slots = rows.map(row => {
    const band = cheapTimes.has(row.t) ? 'low' : expensiveTimes.has(row.t) ? 'high' : 'neutral';
    return {range:screenRange(row, rows), price:cents(row.p), ...tariffColors[band]};
  });
  const [, month, date] = day.split('-');
  const title = (label === 'hoy' ? 'Hoy' : 'Mañana') + ' · ' + date + '/' + month;
  const nextHint = next && cheap[0].t + 3600000 <= now.getTime()
    ? 'Más barata de las que quedan: ' + screenRange(next, rows) + ' · ' + cents(next.p) + ' ¢/kWh'
    : '';
  return {
    type:'Alexa.Presentation.APL.RenderDocument', token:'precio-luz-casa-' + day,
    document:{
      type:'APL', version:'1.4', theme:'dark',
      mainTemplate:{
        parameters:['schedule'],
        item:{
          type:'Frame', width:'100vw', height:'100vh', backgroundColor:'#101A2A',
          item:scheduleView()
        }
      }
    },
    datasources:{
      schedule:{
        title, nextHint,
        list:groupSlots(slots, 1),
        pairs:groupSlots(slots, 2),
        grid:groupSlots(slots, 4)
      }
    }
  };
}
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
    let next;
    if(!offset&&low.t+3600000<=now.getTime()){
      const remaining=rows.filter(x=>x.t>=now.getTime());
      if(remaining.length){
        next=remaining.reduce((a,b)=>b.p<a.p?b:a);
        text+=' De las horas completas que quedan, la más barata es '+fmt(next,rows)+', a '+cents(next.p)+' céntimos.';
      }
    }
    const result = speech(text+' Son precios PVPC peninsulares de energía sin impuestos; pueden ser distintos de tu contrato.');
    if(event.context?.System?.device?.supportedInterfaces?.['Alexa.Presentation.APL']){
      result.response.directives = [priceScreen(rows, day, label, now, next)];
    }
    return result;
  }catch(e){return speech('No puedo verificar los precios en este momento. Inténtalo después.');}
}
exports.handler=event=>handle(event);
exports._test={localDate,expectedHours,validate,prices,handle};
