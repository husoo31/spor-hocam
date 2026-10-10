
'use strict';
/* ---------- yardımcılar ---------- */
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const ymd=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const parseD=s=>{const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)};
const addDays=(s,n)=>{const d=parseD(s);d.setDate(d.getDate()+n);return ymd(d)};
const num=v=>{const n=parseFloat(String(v??'').replace(',','.'));return isFinite(n)?n:0};
const r0=n=>Math.round(n);
const r1=n=>Math.round(n*10)/10;
const r2=n=>Math.round(n*100)/100;
const f1=n=>{n=num(n);return n>=100?String(r0(n)):String(r2(n)).replace('.',',')};
const clone=o=>JSON.parse(JSON.stringify(o));
const TODAY=ymd(new Date());
const dlabel=s=>s===TODAY?'Bugün':s===addDays(TODAY,-1)?'Dün':parseD(s).toLocaleDateString('tr-TR',{day:'numeric',month:'long',weekday:'long'});
const dfull=s=>parseD(s).toLocaleDateString('tr-TR',{day:'numeric',month:'long',year:'numeric',weekday:'long'});
const dshort=s=>{const d=parseD(s);return d.getDate()+'/'+(d.getMonth()+1)};
const dmid=s=>parseD(s).toLocaleDateString('tr-TR',{day:'numeric',month:'short',weekday:'short'});
const mlabel=k=>{const [y,m]=k.split('-').map(Number);return new Date(y,m-1,1).toLocaleDateString('tr-TR',{month:'long',year:'numeric'})};
const WD=['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'];

/* ---------- besin tablosu: anahtar, ad, birim ---------- */
const N=[
 ['kcal','Kalori','kcal'],['protein','Protein','g'],['carbs','Karbonhidrat','g'],['fat','Yağ','g'],['sat','Doymuş yağ','g'],['mono','Tekli doymamış yağ','g'],['poly','Çoklu doymamış yağ','g'],['omega3','Omega-3','g'],['sugar','Şeker (toplam)','g'],['fiber','Lif','g'],['chol','Kolesterol','mg'],
 ['sodium','Sodyum','mg'],['potassium','Potasyum','mg'],['calcium','Kalsiyum','mg'],['phosphorus','Fosfor','mg'],['iron','Demir','mg'],['magnesium','Magnezyum','mg'],['zinc','Çinko','mg'],['copper','Bakır','mg'],['manganese','Manganez','mg'],['selenium','Selenyum','mcg'],['iodine','İyot','mcg'],['chromium','Krom','mcg'],['molybdenum','Molibden','mcg'],
 ['vitA','A vitamini','mcg'],['vitC','C vitamini','mg'],['vitD','D vitamini','mcg'],['vitE','E vitamini','mg'],['vitK','K vitamini','mcg'],['b1','B1 (tiamin)','mg'],['b2','B2 (riboflavin)','mg'],['b3','B3 (niasin)','mg'],['b5','B5 (pantotenik asit)','mg'],['b6','B6 vitamini','mg'],['b7','B7 (biyotin)','mcg'],['b12','B12 vitamini','mcg'],['folate','Folat','mcg'],['choline','Kolin','mg']
];
const NK=N.map(x=>x[0]);
const LB=Object.fromEntries(N.map(x=>[x[0],[x[1],x[2]]]));
const KEYDOC=N.map(x=>`${x[0]} (${x[1]}, ${x[2]})`).join('; ');
const GROUPS=[
 ['Lif, şeker ve yağ asitleri',['fiber','sugar','sat','omega3','chol']],
 ['Mineraller',['sodium','potassium','calcium','phosphorus','iron','magnesium','zinc','copper','manganese','selenium','iodine','chromium','molybdenum']],
 ['Vitaminler',['vitA','vitC','vitD','vitE','vitK','b1','b2','b3','b5','b6','b7','b12','folate','choline']]
];
function nTargets(prof,goals){
  const g=goals||S.goals,f=(prof||S.profile).sex==='f',T={};
  const add=(k,t,type)=>T[k]={n:LB[k][0],u:LB[k][1],t,type};
  add('fiber',Math.max(25,r0(g.kcal/1000*14)),'min');add('sugar',r0(g.kcal*.1/4),'max');add('sat',r0(g.kcal*.1/9),'max');
  add('omega3',f?1.1:1.6,'min');add('chol',300,'max');
  add('sodium',2300,'max');add('potassium',f?2600:3400,'min');add('calcium',1000,'min');add('phosphorus',700,'min');add('iron',f?18:8,'min');
  add('magnesium',f?320:400,'min');add('zinc',f?8:11,'min');add('copper',.9,'min');add('manganese',f?1.8:2.3,'min');add('selenium',55,'min');add('iodine',150,'min');add('chromium',f?25:35,'min');add('molybdenum',45,'min');
  add('vitA',f?700:900,'min');add('vitC',f?75:90,'min');add('vitD',15,'min');add('vitE',15,'min');add('vitK',f?90:120,'min');
  add('b1',f?1.1:1.2,'min');add('b2',f?1.1:1.3,'min');add('b3',f?14:16,'min');add('b5',5,'min');add('b6',1.3,'min');add('b7',30,'min');add('b12',2.4,'min');add('folate',400,'min');add('choline',f?425:550,'min');
  return T;
}
/* Yetişkinler için yaklaşık tolere edilebilir üst alım düzeyleri. so: yalnızca takviyeden gelen için geçerli */
const UL={vitA:{v:3000},vitC:{v:2000},vitD:{v:100},vitE:{v:1000},zinc:{v:40},iron:{v:45},calcium:{v:2500},b6:{v:100},magnesium:{v:350,so:true},folate:{v:1000,so:true},b3:{v:35,so:true},selenium:{v:400},copper:{v:10},manganese:{v:11},iodine:{v:1100},choline:{v:3500},phosphorus:{v:4000},molybdenum:{v:2000}};
/* Tek porsiyon/doz için olağandışı üst sınırlar (birim hatası yakalamak için) */
const PLAUS={kcal:3000,protein:200,carbs:400,fat:200,sat:80,mono:100,poly:100,omega3:20,sugar:300,fiber:80,chol:2000,sodium:8000,potassium:6000,calcium:3000,phosphorus:3000,iron:200,magnesium:1500,zinc:200,copper:20,manganese:30,selenium:1000,iodine:2000,chromium:2000,molybdenum:1000,vitA:15000,vitC:6000,vitD:500,vitE:1500,vitK:5000,b1:300,b2:300,b3:1500,b5:2000,b6:500,b7:10000,b12:20000,folate:5000,choline:3000};

/* ---------- doğrulama / düzeltme ---------- */
function clean(raw,label){
  const n={},flags=[];
  NK.forEach(k=>{const v=raw?raw[k]:undefined;if(v===null||v===undefined||v==='')return;const x=num(v);if(x>0)n[k]=r2(x)});
  const F=n.fat||0,parts=(n.sat||0)+(n.mono||0)+(n.poly||0);
  if(F&&parts>F*1.03){const s=F/parts;['sat','mono','poly'].forEach(k=>{if(n[k])n[k]=r2(n[k]*s)});flags.push('Yağ türlerinin toplamı toplam yağdan fazlaydı, düzeltildi.')}
  else if(!F&&parts>0){n.fat=r2(parts);flags.push('Toplam yağ, yağ türlerinden tamamlandı.')}
  const need=Math.max(n.sugar||0,n.fiber||0);
  if(need>(n.carbs||0)+.01&&need>0){n.carbs=r2(need);flags.push('Karbonhidrat, şeker/lif değerinden küçük olamazdı; düzeltildi.')}
  const comp=4*(n.protein||0)+4*(n.carbs||0)+9*(n.fat||0);
  if(comp>20){
    if(!label){
      if(!n.kcal||Math.abs(n.kcal-comp)/comp>.15){n.kcal=r0(comp);flags.push('Kalori, makrolardan yeniden hesaplandı.')}
    }else if(n.kcal&&Math.abs(n.kcal-comp)/comp>.3)flags.push('Etiketteki kalori makrolarla uyumsuz görünüyor; etiketi bir daha kontrol et.');
  }
  Object.keys(n).forEach(k=>{if(PLAUS[k]&&n[k]>PLAUS[k])flags.push(`${LB[k][0]} ${f1(n[k])} ${LB[k][1]} olağandışı yüksek; birimi (IU/mcg/mg) kontrol et.`)});
  return {n,flags};
}
const scaleN=(n,k)=>{const o={};Object.keys(n).forEach(key=>{const v=n[key]*k;if(v>0)o[key]=key==='kcal'?r0(v):r2(v)});return o};

/* ---------- durum ---------- */
const defaultS=()=>({profile:{sex:'m',age:'',height:'',weight:'',act:'1.55',goal:'cut'},goals:{kcal:0,protein:0,carbs:0,fat:0,tdee:0,bmr:0,water:0},supps:[],lib:[],prefs:{precise:true},programs:[],active:null,months:{}});
let S=defaultS();
const hr=new Date().getHours();
let V={sys:{open:false,busy:false,data:null,err:''},tab:'today',date:TODAY,food:'',mealType:hr<11?'Kahvaltı':hr<16?'Öğle':hr<21?'Akşam':'Atıştırmalık',preview:null,pnotes:[],busy:false,busyMsg:'',err:'',edit:null,undo:null,
  fimgs:[],simgs:[],cap:null,og:{0:true},
  coach:'',coachBusy:false,range:14,
  stext:'',sbusy:false,serr:'',spreview:null,snotes:[],sedit:null,sf:{},hm:'',hmore:false,save:'',saveAt:'',
  st:'profile',smsg:null,newCode:null,am:'login',au:'',aerr:'',abusy:false,pending:null,
  bc:{open:false,code:'',busy:false,err:''},
  adm:{sub:'users',data:null,log:null,uid:null,ud:null,uTab:'day',date:addDays(TODAY,-1),temp:null,newInvite:null},accessLog:null};

/* ---------- depolama: veritabanı (db, parçalı) + cihaz yedeği ---------- */
let col=null,dbErr=false,LSKEY='spor-hocam';
/* yakılan kalori (Apple Sağlık / elle): sunucuda ayrı bir kayıtta; HB = { 'YYYY-MM-DD': {kcal, steps?, src} } */
let HB={},HS={enabled:false,last:null};
const burnOf=d=>num((HB[d]||{}).kcal);
async function loadBurn(){
  try{
    const j=await api('/burn');HB=j.days||{};HS=j.sync||{enabled:false,last:null};
    try{localStorage.setItem(LSKEY+':burn',JSON.stringify({HB,HS}))}catch(e){}
    return true;
  }catch(e){
    try{const c=JSON.parse(localStorage.getItem(LSKEY+':burn')||'null');if(c){HB=c.HB||{};HS=c.HS||HS}}catch(x){}
    return false;
  }
}
/* "Sağlık'tan çek" düğmesi: iPhone'daki Kısayollar uygulamasındaki bu adlı kısayolu çalıştırır; kısayol Sağlık'tan okuyup sunucuya gönderir */
const SC_NAME='Spor Hocam Saglik';
const isIOS=()=>/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
let pullAt=0;
async function burnRefresh(){
  const before=JSON.stringify(HB);
  const ok=await loadBurn();
  if(!ok||JSON.stringify(HB)===before)return false;
  if(pullAt&&Date.now()-pullAt<600000){pullAt=0;toast('Yakılan kalori güncellendi: '+r0(burnOf(TODAY))+' kcal',true)}
  if(!V.burnEdit)render();
  return true;
}
const chunkN={};
function coreObj(){
  const o={profile:S.profile,goals:S.goals,supps:S.supps,lib:S.lib,prefs:S.prefs,programs:S.programs,active:S.active};
  if(S.program!==undefined)o.program=S.program;
  return o;
}
function applyData(o){
  if(!o||typeof o!=='object')return;
  S.profile={...S.profile,...(o.profile||{})};
  S.goals={...S.goals,...(o.goals||{})};
  S.supps=Array.isArray(o.supps)?o.supps:S.supps||[];
  S.lib=Array.isArray(o.lib)?o.lib:S.lib||[];
  S.prefs={...S.prefs,...(o.prefs||{})};
  S.programs=o.programs||S.programs||[];
  S.active=o.active??S.active;
  if(o.program!==undefined)S.program=o.program;
  if(o.months&&typeof o.months==='object')S.months=o.months;
}
async function load(){
  let local=null,pend=[];
  try{const raw=localStorage.getItem(LSKEY);if(raw)local=JSON.parse(raw)}catch(e){}
  try{pend=JSON.parse(localStorage.getItem(LSKEY+':dirty')||'[]')}catch(e){}
  let dbHas=false;
  if(col){
    try{
      const snap=await col.get();
      dbHas=!snap.empty;
      snap.docs.forEach(doc=>{
        const id=doc.id,data=clone(doc.data()||{});
        if(id==='core')applyData(data);
        else if(id.startsWith('m-')){
          const [key,part]=id.slice(2).split('.');
          const m=S.months[key]||(S.months[key]={days:{},workouts:{}});
          m.days=Object.assign(m.days||{},data.days||{});
          if(data.workouts)m.workouts=Object.assign(m.workouts||{},data.workouts);
          chunkN[key]=Math.max(chunkN[key]||0,part?+part:1);
        }
      });
    }catch(e){dbErr=true}
  }
  if(local&&(!col||dbErr||!dbHas)){
    applyData(local);
    if(col&&!dbErr){persist('core');Object.keys(S.months).forEach(k=>persist(k))}
  }else if(local&&pend.length){
    pend.forEach(k=>{
      if(k==='core')applyData({profile:local.profile,goals:local.goals,supps:local.supps,lib:local.lib,prefs:local.prefs,programs:local.programs,active:local.active});
      else if(local.months&&local.months[k])S.months[k]=local.months[k];
      persist(k);
    });
  }
  V.save=col&&!dbErr?'cloud':'local';
}
const dirty=new Set();let pt=null;
function mirror(){try{localStorage.setItem(LSKEY,JSON.stringify(S))}catch(e){}}
function storeDirty(){try{localStorage.setItem(LSKEY+':dirty',JSON.stringify([...dirty]))}catch(e){}}
function setStatus(st){
  V.save=st;if(st==='saved'||st==='cloud')V.saveAt=pad(new Date().getHours())+':'+pad(new Date().getMinutes());
  const el=document.getElementById('sv');if(el)el.innerHTML=statusHtml();
  const e2=document.getElementById('sv2');if(e2)e2.innerHTML=statusHtml();
}
function statusHtml(){
  const s=V.save;
  if(s==='saving')return 'Kaydediliyor…';
  if(s==='error')return '<span style="color:var(--bad)">Buluta kaydedilemedi, cihazda tutuluyor. Tekrar deneniyor…</span>';
  if(s==='local')return '💾 Bu cihazda saklanıyor';
  return '☁ Kaydedildi'+(V.saveAt?' · '+V.saveAt:'');
}
function persist(key){
  if(!AUTH.cur)return;
  try{
    dirty.add(key);mirror();storeDirty();
    if(col&&!dbErr){setStatus('saving');clearTimeout(pt);pt=setTimeout(flush,500)}
  }catch(e){console.error(e)}
}
async function writeMonth(k){
  const m=S.months[k];if(!m)return;
  const days=Object.keys(m.days||{}).sort(),chunks=[];
  let cur={},size=0;
  days.forEach(d=>{const len=JSON.stringify(m.days[d]).length;if(size+len>110000&&Object.keys(cur).length){chunks.push(cur);cur={};size=0}cur[d]=m.days[d];size+=len});
  chunks.push(cur);
  for(let i=0;i<chunks.length;i++){
    const body={days:chunks[i]};if(i===0)body.workouts=m.workouts||{};
    await col.doc(i===0?'m-'+k:`m-${k}.${i+1}`).set(body);
  }
  for(let i=chunks.length;i<(chunkN[k]||0);i++){try{await col.doc(`m-${k}.${i+1}`).delete()}catch(e){}}
  chunkN[k]=chunks.length;
}
let flushing=false,again=false;
async function flush(){
  if(!col||dbErr||!dirty.size)return;
  if(flushing){again=true;return}
  flushing=true;
  const keys=[...dirty];dirty.clear();
  try{
    for(const k of keys){
      if(k==='core')await col.doc('core').set(coreObj());
      else await writeMonth(k);
    }
    storeDirty();setStatus('saved');
  }catch(e){
    console.error(e);keys.forEach(k=>dirty.add(k));storeDirty();setStatus('error');
    clearTimeout(pt);pt=setTimeout(flush,6000);
  }
  flushing=false;
  if(again){again=false;if(dirty.size){clearTimeout(pt);pt=setTimeout(flush,200)}}
}
addEventListener('pagehide',()=>{clearTimeout(pt);flush()});
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden'){clearTimeout(pt);flush()}
  else if(AUTH.cur&&col&&!dbErr){ // uygulamaya dönünce kısayoldan gelmiş yakılan kaloriyi al; kısayol hâlâ çalışıyorsa birkaç kez daha dene
    burnRefresh().then(changed=>{if(!changed&&pullAt&&Date.now()-pullAt<600000){setTimeout(burnRefresh,2500);setTimeout(burnRefresh,6000)}});
  }
});

const mon=d=>{const k=d.slice(0,7);const m=S.months[k]??(S.months[k]={});m.days=m.days||{};m.workouts=m.workouts||{};return m};
const getDay=d=>{const m=mon(d);const x=m.days[d]??(m.days[d]={});if(!Array.isArray(x.meals))x.meals=[];return x};
const getDayRO=d=>(S.months[d.slice(0,7)]?.days||{})[d]||{meals:[]};
const save=d=>persist(d.slice(0,7));
const hasData=d=>{const x=getDayRO(d);return (x.meals||[]).length>0||(x.water||[]).length>0||!!x.weight||Object.keys(x.sup||{}).length>0||!!(x.lift&&(x.lift.rest||(x.lift.ex||[]).length))};

/* günlük toplamlar: yiyecek + takviye */
function suppTotals(d){
  const t={};NK.forEach(k=>t[k]=0);
  Object.values(getDayRO(d).sup||{}).forEach(s=>NK.forEach(k=>t[k]+=num((s.n||{})[k])*num(s.c)));
  return t;
}
function foodTotals(d){
  const t={};NK.forEach(k=>t[k]=0);
  (getDayRO(d).meals||[]).forEach(m=>NK.forEach(k=>t[k]+=num(m[k])));
  return t;
}
function totals(d){const f=foodTotals(d),s=suppTotals(d);NK.forEach(k=>f[k]+=s[k]);return f}
function otherTotals(d){
  const m={};
  Object.values(getDayRO(d).sup||{}).forEach(s=>(s.other||[]).forEach(o=>{const k=(o.n||'')+'|'+(o.u||'');if(!o.n)return;m[k]=m[k]||{n:o.n,u:o.u||'',v:0};m[k].v+=num(o.v)*num(s.c)}));
  return Object.values(m);
}
const waterSum=d=>(getDayRO(d).water||[]).reduce((a,b)=>a+num(b),0);
const waterGoal=()=>S.goals.water||r0(num(S.profile.weight)*35/50)*50||2500;

/* ---------- hedef hesabı ---------- */
// Yakılan kalori ayrıca eklendiği için (Apple Sağlık), "hareketsiz baz" seçiliyse aktivite çarpanı 1,2 alınır; aksi hâlde aktivite iki kez sayılırdı
const BASE_ACT=1.2;
function calcGoals(){
  const p=S.profile,w=num(p.weight),h=num(p.height),a=num(p.age);
  if(!w||!h||!a)return false;
  const bmr=10*w+6.25*h-5*a+(p.sex==='m'?5:-161);
  const tdee=bmr*(S.prefs.burnBase?BASE_ACT:num(p.act));
  const adj=p.goal==='cut'?-Math.min(500,tdee*.2):p.goal==='bulk'?300:0;
  const kcal=Math.max(tdee+adj,bmr);
  const protein=w*(p.goal==='cut'?2:1.8);
  const fat=kcal*.25/9;
  const carbs=Math.max(0,(kcal-protein*4-fat*9)/4);
  S.goals={kcal:r0(kcal),protein:r0(protein),carbs:r0(carbs),fat:r0(fat),tdee:r0(tdee),bmr:r0(bmr),water:r0(w*35/50)*50};
  persist('core');return true;
}

/* ---------- hesap sistemi (sunucu tabanlı) ---------- */
const AUTH={cur:null,config:{registration:'closed',hasUsers:true,ai:true,images:null},offline:false,noAuth:false};
function unauth(){
  if(!AUTH.cur)return;
  AUTH.cur=null;col=null;
  Object.assign(V,{am:'login',aerr:'Oturumun süresi doldu, tekrar giriş yap. Kaydedilmemiş verilerin cihazında korunuyor.',pending:null});
  render();
}
async function api(path,opts){
  opts=opts||{};
  let r;
  try{
    r=await fetch('/api'+path,{method:opts.method||'GET',credentials:'same-origin',
      headers:{'Content-Type':'application/json','X-Requested-With':'spor-hocam'},
      body:opts.body!==undefined?JSON.stringify(opts.body):undefined});
  }catch(e){const err=new Error('Sunucuya ulaşılamıyor. İnternet bağlantını kontrol et.');err.code='network';throw err}
  let j=null;try{j=await r.json()}catch(e){}
  if(!r.ok){
    const err=new Error((j&&j.error)||('Sunucu hatası ('+r.status+')'));
    err.code=(j&&j.code)||('http_'+r.status);err.status=r.status;
    if(r.status===401&&!/^\/(login|me|register|reset)/.test(path))unauth();
    throw err;
  }
  return j;
}
const colApi={
  async get(){const j=await api('/docs');return {docs:j.docs.map(d=>({id:d.id,data:()=>d.data})),empty:!j.docs.length}},
  doc(id){const u='/docs/'+encodeURIComponent(id);return {set:d=>api(u,{method:'PUT',body:{data:d}}),delete:()=>api(u,{method:'DELETE'})}}
};
const normU=s=>String(s||'').trim().toLocaleLowerCase('tr-TR');
const validU=s=>/^[\p{L}\p{N}._-]{3,24}$/u.test(String(s||'').trim());
function applyTheme(){
  const t=S.prefs.theme,r=document.documentElement;
  if(t==='light'||t==='dark')r.dataset.theme=t;else delete r.dataset.theme;
}
function pwCheck(pw,pw2,u){
  if(pw.length<8)throw {message:'Şifre en az 8 karakter olmalı.'};
  if(pw!==pw2)throw {message:'Şifreler aynı değil.'};
  if(normU(pw)===normU(u))throw {message:'Şifre kullanıcı adıyla aynı olamaz.'};
}
async function enterApp(user){
  AUTH.cur=user;LSKEY='spor-hocam:'+user.id;col=colApi;dbErr=false;
  try{localStorage.setItem('spor-hocam-last',JSON.stringify(user))}catch(e){}
  S=defaultS();Object.keys(chunkN).forEach(k=>delete chunkN[k]);dirty.clear();
  HB={};HS={enabled:false,last:null};
  await load();
  await loadBurn();
  applyTheme();
  Object.assign(V,{tab:S.goals.kcal?'today':'settings',st:'profile',date:TODAY,preview:null,pnotes:[],food:'',err:'',edit:null,undo:null,fimgs:[],simgs:[],spreview:null,sedit:null,coach:'',smsg:null,newCode:null,pending:null,aerr:''});
}
async function leaveApp(){
  clearTimeout(pt);try{await flush()}catch(e){}
  try{await api('/logout',{method:'POST'})}catch(e){}
  try{localStorage.removeItem('spor-hocam-last')}catch(e){}
  AUTH.cur=null;col=null;dirty.clear();S=defaultS();applyTheme();
  Object.assign(V,{am:'login',aerr:'',pending:null,smsg:null,newCode:null});
}
const FORMS={
  async login(fd){
    const r=await api('/login',{method:'POST',body:{username:String(fd.get('u')||''),password:String(fd.get('pw')||''),remember:fd.get('remember')==='on'}});
    if(r.user.mustChange){AUTH.cur=r.user;V.am='force';return}
    await enterApp(r.user);
  },
  async force(fd){
    const nw=String(fd.get('n1')||''),nw2=String(fd.get('n2')||'');
    pwCheck(nw,nw2,AUTH.cur.username);
    const r=await api('/account/force-password',{method:'POST',body:{new:nw}});
    AUTH.cur=r.user;V.aerr='';await enterApp(r.user);
  },
  async adm_user(fd){
    const u=V.adm.data.users.find(x=>x.id===V.adm.uid),lim=String(fd.get('limit')||'').trim();
    const body={aiLimit:lim===''?null:lim,disabled:fd.get('disabled')==='on'};
    const wantAdmin=fd.get('isAdmin')==='on';
    if(wantAdmin!==u.isAdmin){body.isAdmin=wantAdmin;body.adminPassword=String(fd.get('adminPassword')||'')}
    await api('/admin/users/'+u.id+'/update',{method:'POST',body});
    V.adm.data=await api('/admin/overview');V.smsg={ok:true,t:'Kaydedildi.'};
  },
  async adm_reset(fd){
    const u=V.adm.data.users.find(x=>x.id===V.adm.uid);
    const r=await api('/admin/users/'+u.id+'/reset-password',{method:'POST',body:{adminPassword:String(fd.get('adminPassword')||'')}});
    V.adm.temp={id:u.id,pw:r.tempPassword};V.adm.data=await api('/admin/overview');
  },
  async adm_wipe(fd){
    const u=V.adm.data.users.find(x=>x.id===V.adm.uid);
    if(!confirm(u.username+' kullanıcısının tüm verileri silinecek. Emin misin?'))return;
    await api('/admin/users/'+u.id+'/wipe-data',{method:'POST',body:{adminPassword:String(fd.get('adminPassword')||'')}});
    V.adm.ud=null;V.adm.data=await api('/admin/overview');V.smsg={ok:true,t:'Verileri silindi.'};await admOpenUser(u.id,true);
  },
  async adm_delete(fd){
    const u=V.adm.data.users.find(x=>x.id===V.adm.uid);
    if(!confirm(u.username+' hesabı kalıcı olarak silinecek. Emin misin?'))return;
    await api('/admin/users/'+u.id+'/delete',{method:'POST',body:{adminPassword:String(fd.get('adminPassword')||'')}});
    V.adm.uid=null;V.adm.ud=null;V.adm.data=await api('/admin/overview');V.smsg={ok:true,t:'Hesap silindi.'};
  },
  async burn(fd){
    const raw=String(fd.get('kcal')||'').trim();
    try{const r=await api('/burn',{method:'POST',body:{date:V.date,kcal:raw===''?null:raw}});HB=r.days||{};V.burnEdit=false;try{localStorage.setItem(LSKEY+':burn',JSON.stringify({HB,HS}))}catch(e){}}
    catch(e){toast(errMsg(e))}
  },
  async adm_backup(fd){
    let r;
    try{
      r=await fetch('/api/admin/backup',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Requested-With':'spor-hocam'},body:JSON.stringify({adminPassword:String(fd.get('adminPassword')||'')})});
    }catch(e){throw {message:'Sunucuya ulaşılamıyor. İnternet bağlantını kontrol et.'}}
    if(!r.ok){let j=null;try{j=await r.json()}catch(e){}throw {message:(j&&j.error)||('Sunucu hatası ('+r.status+')')}}
    const blob=await r.blob(),a=document.createElement('a');
    a.href=URL.createObjectURL(blob);a.download='spor-hocam-yedek-'+TODAY+'.db';
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),3000);
    V.adm.data=await api('/admin/overview');V.smsg={ok:true,t:'Yedek indirildi ('+fmtBytes(blob.size)+'). Güvenli bir yerde sakla: tüm kullanıcıların verilerini ve şifre özetlerini içerir.'};
  },
  async adm_invite(fd){
    const r=await api('/admin/invites',{method:'POST',body:{label:String(fd.get('label')||''),maxUses:String(fd.get('maxUses')||'0'),expiresDays:String(fd.get('expiresDays')||'0')}});
    V.adm.newInvite=r.code;V.adm.data=await api('/admin/overview');
  },
  async adm_settings(fd){
    const body={registration:String(fd.get('registration')),aiUserLimit:String(fd.get('aiUserLimit')),aiGlobalLimit:String(fd.get('aiGlobalLimit')),maxUsers:String(fd.get('maxUsers')),showAccessLog:fd.get('showAccessLog')==='on'};
    const pw=String(fd.get('adminPassword')||'');if(pw)body.adminPassword=pw;
    await api('/admin/settings',{method:'POST',body});
    V.adm.data=await api('/admin/overview');V.smsg={ok:true,t:'Ayarlar kaydedildi.'};
  },
  async register(fd){
    const u=String(fd.get('u')||'').trim(),pw=String(fd.get('pw')||''),pw2=String(fd.get('pw2')||'');
    if(!validU(u))throw {message:'Kullanıcı adı 3-24 karakter olmalı; harf, rakam, nokta, tire ve alt çizgi kullanabilirsin.'};
    pwCheck(pw,pw2,u);
    const r=await api('/register',{method:'POST',body:{username:u,password:pw,invite:String(fd.get('invite')||'')}});
    AUTH.config.hasUsers=true;
    V.pending={user:r.user,code:r.recoveryCode,next:'enter',title:'Hesabın hazır!'};V.am='code';
  },
  async reset(fd){
    const pw=String(fd.get('pw')||''),pw2=String(fd.get('pw2')||''),u=String(fd.get('u')||'');
    pwCheck(pw,pw2,u);
    const r=await api('/reset',{method:'POST',body:{username:u,code:String(fd.get('code')||''),password:pw}});
    V.pending={code:r.recoveryCode,next:'login',title:'Şifren sıfırlandı'};V.am='code';
  },
  async chuser(fd){
    const u=String(fd.get('u')||'').trim();
    if(!validU(u))throw {message:'Kullanıcı adı 3-24 karakter olmalı; harf, rakam, nokta, tire ve alt çizgi kullanabilirsin.'};
    const r=await api('/account/username',{method:'POST',body:{username:u,password:String(fd.get('pw')||'')}});
    AUTH.cur=r.user;try{localStorage.setItem('spor-hocam-last',JSON.stringify(r.user))}catch(e){}
    V.smsg={ok:true,t:'Kullanıcı adın güncellendi.'};
  },
  async chpw(fd){
    const nw=String(fd.get('n1')||''),nw2=String(fd.get('n2')||'');
    pwCheck(nw,nw2,AUTH.cur.username);
    await api('/account/password',{method:'POST',body:{current:String(fd.get('pw')||''),new:nw}});
    V.smsg={ok:true,t:'Şifren güncellendi. Diğer cihazlardaki oturumların kapatıldı.'};
  },
  async newcode(fd){
    const r=await api('/account/recovery',{method:'POST',body:{password:String(fd.get('pw')||'')}});
    V.newCode=r.recoveryCode;
  },
  async delacct(fd){
    clearTimeout(pt);
    await api('/account/delete',{method:'POST',body:{password:String(fd.get('pw')||'')}});
    const id=AUTH.cur.id;dirty.clear();
    try{localStorage.removeItem('spor-hocam:'+id);localStorage.removeItem('spor-hocam:'+id+':dirty');localStorage.removeItem('spor-hocam-last')}catch(e){}
    AUTH.cur=null;col=null;S=defaultS();applyTheme();AUTH.config.hasUsers=false;
    Object.assign(V,{am:'login',aerr:'',pending:null,smsg:null});
    try{const me=await api('/me');AUTH.config=me.config;V.am=me.config.hasUsers?'login':'register'}catch(e){}
  },
  async wipe(fd){
    const c=String(fd.get('c')||'').trim().toLocaleUpperCase('tr-TR');
    if(c!=='SİL'&&c!=='SIL')throw {message:'Onaylamak için SİL yazmalısın.'};
    clearTimeout(pt);dirty.clear();
    await api('/docs',{method:'DELETE'});
    try{localStorage.removeItem(LSKEY);localStorage.removeItem(LSKEY+':dirty')}catch(e){}
    Object.keys(chunkN).forEach(k=>delete chunkN[k]);
    S=defaultS();applyTheme();
    Object.assign(V,{tab:'settings',st:'data',preview:null,spreview:null,edit:null,undo:null,smsg:{ok:true,t:'Tüm verilerin silindi. Hesabın duruyor.'}});
  }
};
const AUTHFORMS=['login','register','reset','force'];
document.addEventListener('submit',async e=>{
  const f=e.target;if(!f||!f.dataset||!f.dataset.f||!FORMS[f.dataset.f])return;
  e.preventDefault();
  if(V.abusy)return;
  const name=f.dataset.f,fd=new FormData(f),auth=AUTHFORMS.includes(name);
  V.abusy=true;
  if(auth){V.aerr='';V.au=String(fd.get('u')||'')}else V.smsg=null;
  try{await FORMS[name](fd)}
  catch(err){
    console.error(err);
    const m=(err&&err.message)||'Bir hata oldu, tekrar dene.';
    if(auth)V.aerr=m;else V.smsg={ok:false,t:m};
  }
  V.abusy=false;render();
});

/* ---------- hata bildirimi ---------- */
let toastT=null;
function toast(msg,info){ // info=true: hata değil, bilgi mesajı (kırmızı değil, "Bir sorun oluştu" öneki yok)
  let el=document.getElementById('toast');
  if(!el){el=document.createElement('div');el.id='toast';el.setAttribute('role','alert');el.style.cssText='position:fixed;left:12px;right:12px;top:calc(env(safe-area-inset-top,0px) + 10px);z-index:9;background:var(--bad);color:#fff;padding:10px 14px;border-radius:12px;font-size:13px;box-shadow:0 4px 16px rgba(0,0,0,.25);max-width:536px;margin:0 auto';document.body.appendChild(el)}
  el.textContent=(info?'':'Bir sorun oluştu: ')+msg;el.style.background=info?'var(--ink)':'var(--bad)';el.style.color=info?'var(--bg)':'#fff';el.style.display='block';
  clearTimeout(toastT);toastT=setTimeout(()=>{el.style.display='none'},8000);
}
// Yalnızca bu uygulamanın kendi hatalarını göster; tarayıcı eklentilerinden/üçüncü taraf betiklerden gelen hatalar kullanıcıyı korkutmasın (konsola yazılır)
addEventListener('error',e=>{
  if(e.filename?!String(e.filename).startsWith(location.origin):/^Script error/i.test(e.message||'')){console.warn('Dış kaynaklı hata yok sayıldı:',e.message,e.filename||'');return}
  toast(e.message||'bilinmeyen hata');
});
addEventListener('unhandledrejection',e=>{
  const st=(e.reason&&e.reason.stack)||'';
  if(st&&!st.includes(location.origin)){console.warn('Dış kaynaklı hata yok sayıldı:',e.reason&&e.reason.message);return}
  toast((e.reason&&e.reason.message)||String(e.reason));
});

/* ---------- Yapay zekâ (sunucu üzerinden) ---------- */
async function blobToB64(b){
  return new Promise((res,rej)=>{
    const fr=new FileReader();
    fr.onload=()=>{const s=String(fr.result);res({mime:b.type||'image/jpeg',data:s.slice(s.indexOf(',')+1)})};
    fr.onerror=()=>rej({message:'Fotoğraf okunamadı.'});
    fr.readAsDataURL(b);
  });
}
async function ask(prompt,opts,json){
  opts=opts||{};
  const body={prompt,json:!!json,tier:opts.modelTier||'default',cache:opts.cache!==false};
  if(opts.images&&opts.images.length)body.images=await Promise.all(opts.images.map(blobToB64));
  const r=await api('/ai',{method:'POST',body});
  return json?r.json:r.text;
}
async function askJson(prompt,opts){
  opts=opts||{};
  try{return await ask(prompt,opts,true)}
  catch(e){
    if(e&&(e.code==='invalid_json'||e.code==='empty_completion'))return await ask(prompt,{...opts,cache:false},true);
    throw e;
  }
}
const ERRS={network:'Sunucuya ulaşılamıyor. İnternet bağlantını kontrol et.',image_rejected:'Fotoğraf okunamadı; daha net bir JPEG/PNG dene.',refused:'Bu istek yanıtlanamadı, farklı yaz.',invalid_json:'Cevap okunamadı, tekrar dene.'};
const errMsg=e=>(e&&e.code&&ERRS[e.code])||(e&&e.message)||'Bir hata oldu, tekrar dene.';
async function shrink(file){
  const bmp=await createImageBitmap(file);
  const sc=Math.min(1,1600/Math.max(bmp.width,bmp.height)),c=document.createElement('canvas');
  c.width=Math.max(1,Math.round(bmp.width*sc));c.height=Math.max(1,Math.round(bmp.height*sc));
  c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);
  return new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej({message:'Fotoğraf işlenemedi.'}),'image/jpeg',.88));
}
const imgMax=()=>(V.cap&&V.cap.images&&V.cap.images.maxCount)||0;
const imgAccept=()=>(V.cap&&V.cap.images&&V.cap.images.mediaTypes&&V.cap.images.mediaTypes.join(','))||'image/*';
async function addImgs(listKey,files,kind){
  const list=V[listKey],room=Math.max(0,Math.min(4,imgMax())-list.length);
  for(const f of Array.from(files).slice(0,room)){
    try{const b=await shrink(f);list.push({blob:b,url:URL.createObjectURL(b),kind:kind||'label'})}catch(e){toast(errMsg(e))}
  }
  render();
}

/* ---------- ortak görünüm parçaları ---------- */
function bar(p,color){return `<div class="bar thin"><i style="width:${Math.min(100,Math.max(0,p))}%;background:${color}"></i></div>`}
const confChip=(c,b)=>{const col=c==='yüksek'?'var(--fat)':c==='düşük'?'var(--bad)':'var(--carb)';return `<span class="chip" style="border:1px solid ${col}"><span class="dot" style="background:${col}"></span>güven: ${esc(c||'orta')}${b?' · '+esc(b):''}</span>`};
function dayNav(){
  return `<div class="top"><button class="ghost" data-a="day" data-n="-1" aria-label="Önceki gün">‹</button>
  <div class="d dp"><div>${dlabel(V.date)} <span class="mut" style="font-weight:400">▾</span></div><div class="mut small" style="font-weight:400">${dfull(V.date)}</div><input type="date" data-i="pickdate" max="${TODAY}" value="${V.date}" aria-label="Tarih seç"></div>
  <button class="ghost" data-a="day" data-n="1" aria-label="Sonraki gün" ${V.date>=TODAY?'disabled style="opacity:.3"':''}>›</button></div>`;
}
// Karbonhidrat dağılımı: toplam, şeker, lif, geriye kalan (nişasta vb.) ve net (lif hariç) karbonhidrat
function carbSplit(t){
  const c=num(t.carbs),su=Math.min(num(t.sugar),c),fi=Math.min(num(t.fiber),Math.max(0,c-su));
  const other=Math.max(0,c-su-fi);
  return `toplam ${f1(c)} g · şeker ${f1(su)} g · lif ${f1(fi)} g · nişasta ve diğerleri ${f1(other)} g · net (lif hariç) ${f1(Math.max(0,c-num(t.fiber)))} g`;
}
function macroSplit(t){
  const p=t.protein*4,c=t.carbs*4,f=t.fat*9,s=p+c+f;
  if(!s)return '';
  const pc=x=>r0(x/s*100);
  return `<div class="split" role="img" aria-label="Makro dağılımı"><i style="width:${p/s*100}%;background:var(--pro)"></i><i style="width:${c/s*100}%;background:var(--carb)"></i><i style="width:${f/s*100}%;background:var(--fat)"></i></div>
  <div class="row small" style="margin-top:6px;flex-wrap:wrap;gap:4px 14px"><span><span class="dot" style="background:var(--pro)"></span>Protein %${pc(p)}</span><span><span class="dot" style="background:var(--carb)"></span>Karb. %${pc(c)}</span><span><span class="dot" style="background:var(--fat)"></span>Yağ %${pc(f)}</span></div>`;
}
function nRows(t,keys,st,TT){
  const T=TT||nTargets();
  return keys.map(k=>{
    const x=T[k],v=t[k],p=v/x.t*100,bad=x.type==='max'&&p>100,sv=st?st[k]:0;
    const c=bad?'var(--bad)':x.type==='max'?'var(--mut)':(p>=100?'var(--fat)':'var(--pro)');
    return `<div style="margin-top:10px"><div class="row between small"><span>${x.n}</span><span class="num"><b>${f1(v)}</b> / ${x.type==='max'?'≤ ':''}${f1(x.t)} ${x.u} <span class="mut">(%${r0(p)})</span></span></div>${bar(p,c)}${sv>0?`<div class="small mut" style="margin-top:3px">bunun ${f1(sv)} ${x.u} kadarı takviyeden</div>`:''}</div>`;
  }).join('');
}
function nGroups(t,st,TT){
  const T=TT||nTargets();
  return GROUPS.map(([gn,keys],gi)=>{
    const mins=keys.filter(k=>T[k].type==='min'),ok=mins.filter(k=>t[k]>=T[k].t).length,open=!!V.og[gi];
    return `<button class="gbtn" data-a="gtog" data-g="${gi}" aria-expanded="${open}"><span>${gn}</span><span class="mut small" style="font-weight:500">${mins.length?`${ok}/${mins.length} hedefte `:''}${open?'▴':'▾'}</span></button>${open?nRows(t,keys,st,T):''}`;
  }).join('');
}
function ulWarnings(t,st){
  const out=[];
  Object.entries(UL).forEach(([k,u])=>{
    const v=u.so?st[k]:t[k];
    if(v>u.v)out.push(`${LB[k][0]}: ${f1(v)} ${LB[k][1]}${u.so?' (takviyeden)':''} · üst sınır ${u.v}`);
  });
  return out;
}
const nSummary=n=>`P ${f1(n.protein||0)} · K ${f1(n.carbs||0)} · Y ${f1(n.fat||0)}`;

/* ---------- yemek hesaplama: istemler ---------- */
function libMatches(txt){
  const low=txt.toLowerCase();
  return S.lib.filter(x=>x.name&&x.name.length>=3&&low.includes(x.name.toLowerCase()));
}
function foodPrompt(txt,ver,nLabel,nMeal){
  const verTxt=ver.length?`\nKullanıcının DOĞRULANMIŞ ürün bilgileri (bunları aynen kullan, kendi tahminini kullanma; 100 g değerini g miktarından türet):\n${ver.map(x=>`- ${x.name}: ${x.g} g için ${JSON.stringify(x.n)}`).join('\n')}\n`:'';
  const imgTxt=nLabel?`\nEkte ${nLabel} adet ürün besin değeri etiketi fotoğrafı var. Değerleri etiketten OKU (etikette hem 100 g hem porsiyon sütunu varsa 100 g sütununu kullan; yüzde yazıyorsa değil, miktarı al). Bu ürün için basis="etiket", conf="yüksek" yaz. Okuyamadığın değeri uydurma, null bırak. Gramajı kullanıcının yazdığı miktardan al; yazmadıysa etiketteki porsiyon gramajını kullan.\n`:'';
  const mealTxt=nMeal?`\nEkte ${nMeal} adet YEMEK FOTOĞRAFI var (tabak/porsiyon fotoğrafı; besin etiketi değil). Fotoğraftan şu sırayla çalış:
a) Görünen her yiyecek ve içecek için AYRI kalem çıkar; sos, yağ, peynir, ekmek, tatlandırıcı, içecek gibi görünen eklemeleri de say. Görünmeyen ama olası malzemeler için (pişirme yağı, yemeğin içi/altı) makul varsayım yap ve note'a yaz.
b) Porsiyonu referans nesnelerle ölç: standart yemek tabağı çapı ≈ 24-26 cm, çorba kasesi ≈ 14-16 cm çap / 250-300 ml, çatal ≈ 18-20 cm, çay bardağı 100 ml, su bardağı 200 ml, kutu içecek 330 ml, ekmek dilimi 25-30 g, avuç içi ≈ 8-9 cm. Referans nesne yoksa tipik bir porsiyon varsay ve note'a "referans nesne yok" yaz. Yığın yüksekliğini, kase derinliğini ve tabağın doluluk oranını hesaba kat.
c) "g" alanına en olası PİŞMİŞ/hazır hâl ağırlığını yaz (sıvıda ml). "gLow" ve "gHigh" alanlarına makul alt ve üst sınırı yaz; belirsizlik büyükse aralığı geniş tut, ama gLow ≤ g ≤ gHigh olsun.
d) Kullanıcı yazıyla gram ya da adet verdiyse yazıyı esas al; fotoğrafı yalnızca yiyeceğin ne olduğunu anlamak için kullan.
e) basis="fotoğraf" yaz. Porsiyon görsel tahmin olduğundan conf en fazla "orta"; yiyecek net tanınmıyorsa "düşük". Tanımadığın yiyeceği uydurma, note'a yaz.
f) Paketli ürün görünüyor ve markası okunuyorsa brand alanına yaz; etiket/barkod görünmüyorsa tipik ürün değerlerini kullan ve conf="düşük" yap.
`:'';
  return `Sen titiz bir diyetisyen ve besin veri tabanı uzmanısın (USDA FoodData Central, TürKomp, ürün etiketleri). Görev: kullanıcının yazdığı yiyecek ve içecekleri tek tek ayır; her biri için porsiyon gramajını ve 100 g (içeceklerde 100 ml) başına besin değerlerini ver.

Kurallar:
1. Kullanıcı rakam yazdıysa (gram, kalori, etiket değeri) bunu aynen kullan, kendi tahminin ile değiştirme.
2. Porsiyon belirtilmediyse tipik bir Türk porsiyonunu varsay. "g" alanına gram (sıvıda ml) yaz. Ölçüler: 1 su bardağı = 200 ml, 1 çay bardağı = 100 ml, 1 yemek kaşığı = 15 g, 1 tatlı kaşığı = 10 g, 1 çay kaşığı = 5 g, 1 dilim ekmek = 25-30 g, 1 orta yumurta = 50 g (kabuksuz), 1 tabak pilav = 200 g pişmiş.
3. Pişmiş / çiğ ayrımına dikkat et; değerler yazılan hale ait olsun. Yağ, şeker, sos gibi eklenen şeyleri unutma; gerekiyorsa ayrı kalem yap.
4. Markalı ürünse bilinen etiket değerlerini kullan; bilmiyorsan benzer ürünün tipik değerleriyle tahmin et ve conf="düşük" yap.
5. Değerler 100 g başınadır. Kesin bilmediğin mikro besini 0 değil null yaz; gerçekten içermiyorsa 0 yaz.
6. İç tutarlılık: kcal ≈ 4×protein + 4×karbonhidrat + 9×yağ (±%10); sat+mono+poly ≤ fat; sugar ≤ carbs; fiber ≤ carbs.
7. conf: "yüksek" (kullanıcının rakamı, etiket ya da çok bilinen standart besin), "orta", "düşük" (belirsiz ürün veya porsiyon). basis: "kullanıcı", "etiket", "veri tabanı" ya da "tahmin".
8. "search": USDA FoodData Central'da aranacak İngilizce, GENEL (markasız) besin adı; pişirme halini ekle (örn. "chicken breast cooked roasted", "rice white cooked", "egg whole boiled", "olive oil", "lentils cooked boiled"). Türk yemekleri ve karışık yemekler (menemen, mantı, lahmacun, çorba, börek vb.) ya da markalı ürünler için null yaz. "brand": markalı paketli ürünse marka ve ürün adı (örn. "Ülker Çikolatalı Gofret"), değilse null. "barcode": kullanıcı barkod numarası yazdıysa rakamları, yoksa null.
${verTxt}${imgTxt}${mealTxt}
Anahtarlar ve birimler: ${KEYDOC}.
Sadece JSON döndür: {"items":[{"name":"kısa Türkçe ad","qty":"yazılan porsiyon","g":0,"conf":"orta","basis":"veri tabanı","note":"varsa kısa uyarı","gLow":0,"gHigh":0,"search":"chicken breast cooked roasted","brand":null,"barcode":null,"per100":{"kcal":0,"protein":0}}]} (per100 içinde yukarıdaki tüm anahtarlar bulunmalı).

Yazılan: ${txt||(nMeal&&!nLabel?'(yazı yok, yemek fotoğrafına bak)':'(yazı yok, etiket fotoğrafına bak)')}`;
}
function auditPrompt(txt,items,ver,nMeal){
  return `Sen bağımsız bir besin değerleri denetçisisin. Aşağıda kullanıcının yazdığı metin ve bir asistanın çıkardığı JSON var. Her kalemi şu açılardan kontrol et; hatalıysa DÜZELT:
(1) Gramaj, yazılan porsiyonla gerçekçi mi? (porsiyon abartısı ya da eksikliği en sık hatadır)
(2) 100 g değerleri USDA / TürKomp ile uyumlu mu? Sık hatalar: pişmiş-çiğ karışması, eklenen yağ/şeker/sosun unutulması, mg-mcg birim hatası.
(3) kcal ≈ 4×protein + 4×karbonhidrat + 9×yağ (±%10).
(4) Kullanıcının yazdığı rakamlar korunmuş mu?
(5) Kalem sayısını DEĞİŞTİRME: yalnızca verilen kalemleri kontrol et ve aynı sayıda kalem döndür.${nMeal?'\n(6) Ekte yemek fotoğrafı var: gramajları fotoğraftaki tabak/kap ve referans nesnelerle karşılaştır; gerçekçi değilse düzelt ve gLow/gHigh aralığını koru ya da güncelle.':''}
Emin olmadığın değeri değiştirme. Kesin bilmediğin mikro besin için null kullan. ${ver.length?'Kullanıcının doğrulanmış ürün değerlerine dokunma.':''}
Aynı şemayla düzeltilmiş JSON döndür ve "changes" dizisine kısa Türkçe notlar ekle (değişiklik yoksa boş dizi): {"items":[{"name":"","qty":"","g":0,"conf":"","basis":"","note":"","per100":{}}],"changes":["Pilav gramajı 300'den 200 g'a çekildi"]}

Kullanıcı yazısı: ${txt}
Asistanın JSON'u: ${JSON.stringify({items})}`;
}
const REF_LABELS=['etiket','kullanıcı','USDA','Open Food Facts'];
const MICRO_KEYS=GROUPS.flatMap(g=>g[1]);
function toPreviewFood(i){
  const g=num(i.g)>0?num(i.g):100,useRef=!!(i.ref&&i.useRef);
  const p=(useRef?i.ref.per100:i.per100)||{},raw={};
  NK.forEach(k=>{if(p[k]!==null&&p[k]!==undefined&&p[k]!=='')raw[k]=num(p[k])*g/100});
  const basis=useRef?i.ref.source:(i.basis||'');
  const extra=[];
  if(useRef&&raw.kcal===undefined&&raw.protein!==undefined&&raw.carbs!==undefined&&raw.fat!==undefined){
    raw.kcal=4*raw.protein+4*raw.carbs+9*raw.fat;extra.push('Kalori kaynakta yoktu; makrolardan hesaplandı.');
  }
  const c=clean(raw,REF_LABELS.includes(basis));
  const baseN=clone(c.n);
  if(c.n.kcal)c.n.kcal=r0(c.n.kcal);
  const missing=useRef?MICRO_KEYS.filter(k=>p[k]===undefined).length:0;
  const lo=num(i.gLow),hi=num(i.gHigh),range=(lo>0&&hi>=lo&&lo<=g&&g<=hi&&hi/lo<=6)?[lo,hi]:null;
  let conf=useRef?(i.refConf||'yüksek'):(i.conf||'orta');
  if(i.basis==='fotoğraf'&&conf==='yüksek')conf='orta'; // porsiyon görsel tahmindir
  return {name:String(i.name),qty:String(i.qty||''),g,range,photo:i.basis==='fotoğraf',conf,basis,note:String(i.note||''),flags:[...extra,...c.flags],baseG:g,baseN,n:c.n,saved:false,
    ref:i.ref||null,useRef,missing,srcName:useRef?i.ref.name:'',srcId:useRef?i.ref.id:'',raw:{...i,useRef}};
}
// Sunucudan gelen referans sonucunu kalemle birleştirir
function withRef(it,res){
  const r=res&&res.ref;
  const base={...it,ai:it.per100||null};
  if(!r)return base;
  const ref={source:r.source==='usda'?'USDA':'Open Food Facts',name:r.name,id:r.id,per100:r.per100,kcalErr:r.kcalErr};
  return {...base,ref,useRef:!!r.accepted,refConf:r.accepted?'yüksek':'orta'};
}
const barcodeItem=p=>{
  const core=['kcal','protein','carbs','fat'].filter(k=>p.per100[k]!==undefined).length;
  const name=(p.brand?p.brand+' ':'')+(p.name||('Ürün '+p.id));
  return toPreviewFood({name,qty:p.quantity?('Paket: '+p.quantity):'',g:p.servingG||100,refConf:core===4?'yüksek':'orta',conf:core===4?'yüksek':'orta',basis:'Open Food Facts',per100:null,ref:{source:'Open Food Facts',name,id:p.id,per100:p.per100},useRef:true,
    note:(core===4?'':'Ürün kaydında bazı değerler eksik; paketin etiket fotoğrafını çekip ürün adını yazarak yeniden hesaplat. ')+(p.servingG?'':'Porsiyon bilgisi yok; miktarı (g) kendin gir.')});
};
/* ---------- kamera: barkod tarama ve fotoğraf çekme ---------- */
let ZXP=null;
function loadZX(){
  if(window.ZXing)return Promise.resolve(window.ZXing);
  return ZXP||(ZXP=new Promise((res,rej)=>{
    const sc=document.createElement('script');sc.src='/zxing.min.js';
    sc.onload=()=>res(window.ZXing);
    sc.onerror=()=>{ZXP=null;rej({message:'Barkod okuyucu yüklenemedi; internet bağlantını kontrol et.'})};
    document.head.appendChild(sc);
  }));
}
const BC_FORMATS=['ean_13','ean_8','upc_a','upc_e'];
/* Okuyucu: tarayıcının yerleşik BarcodeDetector'ı varsa o, yoksa ZXing (her cihazda çalışır).
   detect(kaynak) -> [{code,fmt}] */
async function makeDetector(){
  if('BarcodeDetector' in window){
    try{
      const sup=await BarcodeDetector.getSupportedFormats(),want=BC_FORMATS.filter(f=>sup.includes(f));
      if(want.length){const d=new BarcodeDetector({formats:want});
        return {name:'yerleşik',detect:async src=>(await d.detect(src)).map(x=>({code:x.rawValue,fmt:x.format}))}}
    }catch(e){/* ZXing'e düş */}
  }
  const Z=await loadZX();
  const hints=new Map();
  hints.set(Z.DecodeHintType.POSSIBLE_FORMATS,[Z.BarcodeFormat.EAN_13,Z.BarcodeFormat.EAN_8,Z.BarcodeFormat.UPC_A,Z.BarcodeFormat.UPC_E]);
  hints.set(Z.DecodeHintType.TRY_HARDER,true);
  const reader=new Z.MultiFormatReader();reader.setHints(hints);
  const FM={};FM[Z.BarcodeFormat.EAN_13]='ean_13';FM[Z.BarcodeFormat.EAN_8]='ean_8';FM[Z.BarcodeFormat.UPC_A]='upc_a';FM[Z.BarcodeFormat.UPC_E]='upc_e';
  const cv=document.createElement('canvas'),cx=cv.getContext('2d',{willReadFrequently:true});
  const tryDecode=(gray,w,h)=>{
    try{const r=reader.decode(new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.RGBLuminanceSource(gray,w,h))));return {code:r.getText(),fmt:FM[r.getBarcodeFormat()]||''}}
    catch(e){return null}
  };
  return {name:'zxing',detect:async src=>{
    const w0=src.videoWidth||src.width,h0=src.videoHeight||src.height;
    if(!w0||!h0)return [];
    const sc=Math.min(1,1280/Math.max(w0,h0)),w=Math.round(w0*sc),h=Math.round(h0*sc);
    cv.width=w;cv.height=h;cx.drawImage(src,0,0,w,h);
    const px=cx.getImageData(0,0,w,h).data,gray=new Uint8ClampedArray(w*h);
    for(let i=0,j=0;i<px.length;i+=4,j++)gray[j]=(px[i]*77+px[i+1]*150+px[i+2]*29)>>8;
    let r=tryDecode(gray,w,h);
    if(!r){ // barkod dik tutulmuş olabilir: 90° döndürüp tekrar dene
      const rot=new Uint8ClampedArray(w*h);
      for(let y=0;y<h;y++)for(let x=0;x<w;x++)rot[x*h+(h-1-y)]=gray[y*w+x];
      r=tryDecode(rot,h,w);
    }
    return r?[r]:[];
  }};
}
// Okunan ham değerleri doğrula (kontrol hanesi); geçersizse null
const bcAccept=(list)=>{for(const x of list||[]){const c=window.BCU?BCU.accept(x.code,x.fmt):String(x.code||'').replace(/\D/g,'');if(c)return c}return null};
const camStream=()=>navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false});
function camOverlay(inner){
  const ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;z-index:20;background:#000;display:flex;flex-direction:column';
  ov.innerHTML=inner;document.body.appendChild(ov);return ov;
}
async function scanBarcode(){
  if(!camOk()){toast('Bu tarayıcıda kamera kullanılamıyor; numarayı elle yaz ya da fotoğraftan oku.');return}
  const ov=camOverlay('<video playsinline muted autoplay style="flex:1;width:100%;min-height:0;object-fit:cover"></video><div id="bcm" style="padding:14px;text-align:center;color:#fff;font-size:14px">Barkodu çerçevenin ortasına getir, sabit tut</div><button class="btn" id="bcx" style="margin:0 14px calc(14px + env(safe-area-inset-bottom,0px))">Vazgeç</button>');
  const video=ov.querySelector('video'),msg=ov.querySelector('#bcm');let stream=null,stop=false;
  const done=()=>{stop=true;try{stream&&stream.getTracks().forEach(t=>t.stop())}catch(e){}ov.remove()};
  ov.querySelector('#bcx').onclick=done;
  try{
    msg.textContent='Kamera ve okuyucu hazırlanıyor…';
    const det=await makeDetector();
    stream=await camStream();video.srcObject=stream;await video.play();
    msg.textContent='Barkodu çerçevenin ortasına getir, sabit tut';
    const t0=Date.now();let last=null,hits=0;
    while(!stop){
      let code=null;
      try{code=bcAccept(await det.detect(video))}catch(e){}
      if(code){hits=(code===last)?hits+1:1;last=code;if(hits>=2){done();V.bc.code=code;V.bc.open=true;await A.bcsearch();return}}
      else{last=null;hits=0}
      if(Date.now()-t0>12000)msg.textContent='Okunmuyor mu? Işığı artır, barkodu yaklaştır/uzaklaştır; olmazsa numarayı elle yaz.';
      await new Promise(r=>setTimeout(r,180));
    }
  }catch(e){done();toast(e&&e.message&&!/Permission|NotAllowed|NotFound|denied/i.test(e.message)?e.message:'Kameraya erişilemedi; izin ver ya da numarayı elle yaz.')}
}
// Fotoğraftan barkod oku (canlı tarama zorlaşırsa)
async function barcodeFromFile(f){
  const det=await makeDetector(),bmp=await createImageBitmap(f);
  let code=bcAccept(await det.detect(bmp));
  if(!code){ // büyük görseli küçültüp bir daha dene
    const sc=Math.min(1,1000/Math.max(bmp.width,bmp.height)),c=document.createElement('canvas');
    c.width=Math.round(bmp.width*sc);c.height=Math.round(bmp.height*sc);c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);
    code=bcAccept(await det.detect(c));
  }
  return code;
}
/* Uygulama içi kamera: deklanşörle fotoğraf çeker; "Galeriden seç" ile dosya da alınır. */
function cameraCapture(hint){
  return new Promise(async resolve=>{
    const ov=camOverlay(`<video playsinline muted autoplay style="flex:1;width:100%;min-height:0;object-fit:cover"></video>
      <div style="padding:10px 14px;text-align:center;color:#fff;font-size:14px">${esc(hint)}</div>
      <div style="display:flex;gap:10px;margin:0 14px calc(14px + env(safe-area-inset-bottom,0px))">
        <button class="btn alt" id="camx">Vazgeç</button>
        <button class="btn" id="camg" style="flex:1" disabled>📸 Çek</button>
        <label class="btn alt filebtn" style="color:var(--ink)">Galeri<input type="file" accept="${esc(imgAccept())}" id="camf" style="display:none"></label></div>`);
    const video=ov.querySelector('video');let stream=null,fin=false;
    const end=v=>{if(fin)return;fin=true;try{stream&&stream.getTracks().forEach(t=>t.stop())}catch(e){}ov.remove();resolve(v)};
    ov.querySelector('#camx').onclick=()=>end(null);
    ov.querySelector('#camf').onchange=e=>end((e.target.files||[])[0]||null);
    ov.querySelector('#camg').onclick=()=>{
      const c=document.createElement('canvas');c.width=video.videoWidth;c.height=video.videoHeight;
      c.getContext('2d').drawImage(video,0,0);
      c.toBlob(b=>end(b),'image/jpeg',.92);
    };
    try{stream=await camStream();video.srcObject=stream;await video.play();ov.querySelector('#camg').disabled=false}
    catch(e){toast('Kameraya erişilemedi; izin ver ya da "Galeri" ile fotoğraf seç.')}
  });
}

/* ---------- Bugün ---------- */
function freqFoods(){
  const m={};
  Object.values(S.months).forEach(mo=>Object.values(mo.days||{}).forEach(d=>(d.meals||[]).forEach(x=>{
    const k=(x.name+'|'+(x.qty||'')).toLowerCase();(m[k]=m[k]||{c:0,it:x}).c++;m[k].it=x;
  })));
  return Object.values(m).filter(x=>x.c>=2).sort((a,b)=>b.c-a.c).slice(0,8);
}
function waterCard(d){
  const ml=waterSum(d),goal=waterGoal(),p=ml/goal*100;
  return `<div class="card"><div class="row between"><h3>Su</h3><span class="mut small num">hedef ${goal} ml</span></div>
  <div class="row" style="align-items:flex-end;margin-top:6px"><div class="num" style="font-size:40px;font-weight:700;line-height:1">${(ml/1000).toFixed(2).replace('.',',')}<span class="mut" style="font-size:16px"> L</span></div><div class="mut small" style="margin-bottom:3px">${r0(ml)} / ${goal} ml · %${r0(p)}</div></div>
  <div class="bar" style="margin-top:10px"><i style="width:${Math.min(100,p)}%;background:var(--water)"></i></div>
  <div class="btnrow" style="margin-top:12px">${[200,330,500,750].map(v=>`<button class="btn alt sm" data-a="wadd" data-v="${v}">+${v}</button>`).join('')}<button class="btn alt sm" data-a="wundo" ${ml?'':'disabled'} aria-label="Son eklemeyi geri al">↶ Geri al</button></div>
  <div class="row" style="margin-top:8px"><input id="wc" inputmode="numeric" placeholder="Farklı miktar (ml)" aria-label="Özel su miktarı"><button class="btn sm" style="min-width:70px" data-a="wcustom">Ekle</button></div></div>`;
}
/* ---------- antrenman günlüğü ----------
   Günün kaydında: day.lift = { rest:true }  ya da  { ex:[ { n:'Squat', s:[ {w:60,r:8}, … ] } ] }  (w: kg, r: tekrar).
   Mevcut alanlara dokunulmaz; eski 'workouts'/'programs' alanları kullanılmaz. */
const LIFT_COMMON=['Squat','Bench press','Deadlift','Overhead press','Barbell row','Barfiks','Chin-up','Paralel (dips)','Lat pulldown','Seated cable row','Dumbbell bench press','Incline bench press','Incline dumbbell press','Dumbbell shoulder press','Lateral raise','Face pull','Biceps curl','Hammer curl','Preacher curl','Triceps pushdown','Skull crusher','Overhead triceps extension','Leg press','Romanian deadlift','Front squat','Hack squat','Lunge','Bulgarian split squat','Leg extension','Leg curl','Calf raise','Hip thrust','Cable fly','Pec deck','Dumbbell row','T-bar row','Shrug','Good morning','Push-up','Cable crunch'];
const normEx=s=>String(s||'').trim().toLocaleLowerCase('tr-TR').replace(/\s+/g,' ');
const liftOf=d=>getDayRO(d).lift||null;
const e1rm=(w,r)=>w>0?(r<=1?w:w*(1+Math.min(r,12)/30)):0;          // Epley; 12 tekrarın üstü sınırlanır
const setScore=x=>x.w>0?e1rm(x.w,x.r):x.r;                           // ağırlıksız harekette ölçüt tekrar sayısı
const bestOf=sets=>sets.reduce((a,x)=>Math.max(a,setScore(x)),0);
const setTxt=x=>(x.w>0?f1(x.w)+'×':'')+r0(x.r);
function liftHistory(){ // { 'squat': { name, s:[{d, sets:[{w,r}]}] (tarihe göre artan) } }
  const m={};
  Object.keys(S.months).forEach(k=>{const days=(S.months[k]||{}).days||{};Object.keys(days).forEach(d=>{
    const L=days[d]&&days[d].lift;if(!L||!Array.isArray(L.ex))return;
    L.ex.forEach(e=>{
      const key=normEx(e&&e.n);if(!key)return;
      const sets=(e.s||[]).map(x=>({w:num(x.w),r:num(x.r)})).filter(x=>x.r>0);if(!sets.length)return;
      (m[key]=m[key]||{name:e.n,s:[]}).s.push({d,sets});
    });
  })});
  Object.values(m).forEach(x=>x.s.sort((a,b)=>a.d<b.d?-1:a.d>b.d?1:0));
  return m;
}
const exUnit=h=>h.s.some(q=>q.sets.some(x=>x.w>0))?'kg':'tekrar';
function liftSumTxt(d){
  const L=liftOf(d);let vol=0,nset=0;
  ((L&&L.ex)||[]).forEach(e=>(e.s||[]).forEach(x=>{if(num(x.r)>0){nset++;vol+=num(x.w)*num(x.r)}}));
  return nset?`${nset} set · ${r0(vol).toLocaleString('tr-TR')} kg hacim`:'';
}
function liftCard(d){
  const L=liftOf(d),who=d===TODAY?'Bugün':dlabel(d);
  if(!L)return `<div class="card"><h3>${esc(who)} antrenman yaptın mı?</h3>
    <div class="row" style="gap:10px;margin-top:10px"><button class="btn" style="flex:1" data-a="liftyes">🏋 Yaptım</button><button class="btn alt" style="flex:1" data-a="liftrest">😴 Dinlenme günü</button></div></div>`;
  if(L.rest)return `<div class="card"><div class="row between"><h3>😴 Dinlenme günü</h3><button class="chip" style="margin:0" data-a="liftreset">Değiştir</button></div></div>`;
  const H=liftHistory(),ex=L.ex||[];
  const mine=new Set(Object.keys(H));
  const opts=[...Object.values(H).map(h=>h.name),...LIFT_COMMON.filter(n=>!mine.has(normEx(n)))];
  const blocks=ex.map((e,i)=>{
    const sets=e.s||[],valid=sets.map(x=>({w:num(x.w),r:num(x.r)})).filter(x=>x.r>0);
    const h=H[normEx(e.n)],before=h?h.s.filter(q=>q.d<d):[],prev=before[before.length-1];
    const best=bestOf(valid),prevBest=before.reduce((a,q)=>Math.max(a,bestOf(q.sets)),0);
    const pr=before.length&&best>0&&best>prevBest;
    return `<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line)">
      <div class="row between"><b>${esc(e.n)}</b>${pr?'<span class="chip on" style="margin:0">🎉 Yeni rekor</span>':''}<button class="ghost" data-a="exdel" data-e="${i}" aria-label="${esc(e.n)} hareketini sil">✕</button></div>
      ${prev?`<div class="mut small" style="margin-top:4px">Geçen sefer (${esc(dmid(prev.d))}): <span class="num">${prev.sets.map(setTxt).join(' · ')}</span> <button class="chip" style="margin:0 0 0 6px" data-a="copylast" data-e="${i}">↺ Kopyala</button></div>`:''}
      ${sets.map((x,j)=>`<div class="row" style="gap:6px;margin-top:6px"><span class="mut small num" style="width:20px">${j+1}.</span>
        <input inputmode="decimal" data-i="lw" data-e="${i}" data-j="${j}" value="${x.w===''||x.w==null?'':esc(x.w)}" placeholder="kg" aria-label="${j+1}. set kilo">
        <span class="mut">×</span>
        <input inputmode="numeric" data-i="lr" data-e="${i}" data-j="${j}" value="${x.r===''||x.r==null?'':esc(x.r)}" placeholder="tekrar" aria-label="${j+1}. set tekrar">
        <button class="ghost" data-a="setdel" data-e="${i}" data-j="${j}" aria-label="${j+1}. seti sil">✕</button></div>`).join('')}
      <button class="chip" style="margin:8px 0 0" data-a="setadd" data-e="${i}">＋ Set</button></div>`;
  }).join('');
  return `<div class="card"><div class="row between"><h3>🏋 ${esc(who)} antrenman</h3><span class="mut small num" id="liftsum">${liftSumTxt(d)}</span></div>
    ${blocks||'<p class="mut small" style="margin:8px 0 0">Bir hareket ekleyerek başla.</p>'}
    <datalist id="exlist">${opts.map(n=>`<option value="${esc(n)}">`).join('')}</datalist>
    <div class="row" style="margin-top:14px"><input id="exnew" data-i="exnew" list="exlist" placeholder="Hareket ekle (örn. Squat)" aria-label="Hareket adı" autocomplete="off" maxlength="40"><button class="btn sm" style="min-width:70px" data-a="exadd">Ekle</button></div>
    <button class="chip" style="margin:12px 0 0" data-a="liftreset">Bu günün antrenmanını sıfırla</button></div>`;
}
function suppCard(d){
  const day=getDayRO(d),sup=day.sup||{};
  const gone=Object.entries(sup).filter(([id])=>!S.supps.find(s=>s.id===id));
  if(!S.supps.length&&!gone.length)return `<div class="card"><h3>Takviyeler</h3><p class="mut small">Vitamin veya takviye kullanıyorsan ekle; aldığın miktarlar günlük besin toplamına katılsın.</p><button class="btn alt sm" data-a="tab" data-t="supp">Takviye ekle</button></div>`;
  const oth=otherTotals(d);
  return `<div class="card"><h3>Takviyeler</h3>${S.supps.map(s=>{
    const c=(sup[s.id]||{}).c||0;
    return `<div class="meal"><div class="grow"><div>${esc(s.name)}</div><div class="mut small">${esc(s.dose||'')}</div></div>${c?`<div class="stepper"><button data-a="stk" data-op="dec" data-id="${s.id}" aria-label="Azalt">−</button><b class="num" style="min-width:20px;text-align:center">${c}</b><button data-a="stk" data-op="inc" data-id="${s.id}" aria-label="Artır">+</button></div>`:`<button class="btn sm" data-a="stk" data-op="inc" data-id="${s.id}">Aldım</button>`}</div>`;
  }).join('')}${gone.map(([id,s])=>`<div class="meal"><div class="grow"><div>${esc(s.name)}</div><div class="mut small">listeden silinmiş · ${s.c} doz alındı</div></div></div>`).join('')}
  ${oth.length?`<div class="small mut" style="margin-top:8px">Diğer etken maddeler: ${oth.map(o=>`${esc(o.n)} ${f1(o.v)} ${esc(o.u)}`).join(' · ')}</div>`:''}</div>`;
}
function thumbs(listKey){
  const l=V[listKey];
  return l.length?`<div class="thumbs">${l.map((x,i)=>`<div class="thumb"><img src="${x.url}" alt="${x.kind==='meal'?'Yemek':'Etiket'} fotoğrafı ${i+1}"><span class="small" style="position:absolute;left:4px;bottom:4px;background:rgba(0,0,0,.6);color:#fff;padding:1px 6px;border-radius:8px">${x.kind==='meal'?'🍽 yemek':'🏷 etiket'}</span><button data-a="imgdel" data-k="${listKey}" data-ix="${i}" aria-label="Fotoğrafı kaldır">✕</button></div>`).join('')}</div>`:'';
}
const camOk=()=>!!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia);
function foodPhotoBtn(kind,label){
  if(!imgMax())return '';
  const full=V.fimgs.length>=Math.min(4,imgMax());
  if(camOk())return `<button class="btn alt sm" data-a="cam" data-kind="${kind}" ${full?'disabled style="opacity:.45"':''}>${label}</button>`;
  return `<label class="btn alt sm filebtn" ${full?'style="opacity:.45;pointer-events:none"':''}>${label}<input type="file" accept="${esc(imgAccept())}" multiple data-i="fimg" data-kind="${kind}" style="display:none"></label>`;
}
function photoBtn(listKey,inputKey,label){
  if(!imgMax())return '';
  const full=V[listKey].length>=Math.min(4,imgMax());
  return `<label class="btn alt sm filebtn" ${full?'style="opacity:.45;pointer-events:none"':''}>📷 ${label}<input type="file" accept="${esc(imgAccept())}" multiple data-i="${inputKey}" style="display:none"></label>`;
}
const precBtn=()=>`<button class="chip ${S.prefs.precise?'on':''}" data-a="prec" aria-pressed="${!!S.prefs.precise}">🔍 Hassas mod: ${S.prefs.precise?'açık':'kapalı'}</button>`;
function viewToday(){
  const g=S.goals,d=V.date,t=totals(d),st=suppTotals(d),day=getDayRO(d),meals=day.meals||[];
  const burn=burnOf(d),bd=HB[d]||{},net=t.kcal-burn,left=g.kcal-net,over=left<0,deficit=g.tdee?g.tdee+burn-t.kcal:null;
  let h=dayNav();
  if(V.undo)h+=`<div class="undo"><span>Silindi: ${esc(V.undo.m.name)}</span><button data-a="mundo">Geri al</button></div>`;
  if(!g.kcal){
    h+=`<div class="card"><h3>Önce hedeflerini belirle</h3><p class="mut">Profil sekmesine boy, kilo ve yaşını gir; günlük kalori ve protein hedefini hesaplayayım.</p><button class="btn" data-a="tab" data-t="settings" data-st="profile">Ayarlara git</button></div>`;
  }else{
    h+=`<div class="card hero">
      <div class="mut small">${over?'Hedefi aştın':'Kalan kalori'}</div>
      <div class="big num ${over?'over':''}">${Math.abs(r0(left)).toLocaleString('tr-TR')}<span class="mut" style="font-size:22px;margin-left:6px">kcal</span></div>
      <div class="bar"><i style="width:${Math.max(0,Math.min(100,net/g.kcal*100))}%;background:${over?'var(--bad)':'var(--kcal)'}"></i></div>
      <div class="row between small mut" style="margin-top:8px"><span>Yenen <b class="num" style="color:var(--ink)">${r0(t.kcal)}</b></span>${burn?`<span>Yakılan <b class="num" style="color:var(--ink)">−${r0(burn)}</b></span><span>Net <b class="num" style="color:var(--ink)">${r0(net)}</b></span>`:''}<span>Hedef <b class="num" style="color:var(--ink)">${g.kcal}</b></span></div>
      <div style="margin-top:12px">${deficit!==null?`<span class="chip">${deficit>=0?'Kalori açığı':'Kalori fazlası'}: <b class="num">${Math.abs(r0(deficit))}</b> kcal <span class="mut">(harcama ~${r0(g.tdee+burn)})</span></span>`:''}${(()=>{const lbl=burn?`Yakılan ${r0(burn)} kcal · ${bd.src==='manual'?'elle':'Apple Sağlık'}${bd.steps?' · '+Number(bd.steps).toLocaleString('tr-TR')+' adım':''}`:'';
        // Sağlık bağlıyken elle giriş yok: bugün için 🔥 düğmesi yakılan kaloriyi Sağlık'tan otomatik çeker; geçmiş günlerde yalnızca gösterim
        if(HS.enabled)return d===TODAY?`<button class="chip" data-a="pullhealth">🔥 ${lbl||'Yakılan kalori ekle'}</button>`:`<span class="chip">🔥 ${lbl||'Yakılan: veri yok'}</span>`;
        return `<button class="chip" data-a="burnedit" aria-expanded="${!!V.burnEdit}">🔥 ${lbl||'Yakılan kalori ekle'}</button>`})()}${HS.enabled&&d===TODAY?`<button class="chip" data-a="pullhealth">🔄 Sağlık'tan çek</button>`:''}${!HS.enabled&&d===TODAY?`<button class="chip" data-a="tab" data-t="settings" data-st="health">🍎 Sağlık'a bağla</button>`:''}</div>
      ${V.burnEdit&&!HS.enabled?`<form data-f="burn" class="row" style="gap:8px;margin-top:10px" autocomplete="off"><input name="kcal" inputmode="numeric" placeholder="Yakılan kcal (aktif enerji)" aria-label="Yakılan kalori" value="${burn?r0(burn):''}"><button class="btn sm">Kaydet</button>${HB[d]?`<button type="button" class="btn alt sm" data-a="burndel">Sil</button>`:''}</form>`:''}
    </div>
    <div class="card grid3">
      ${[['Protein',t.protein,g.protein,'var(--pro)'],['Karb.',t.carbs,g.carbs,'var(--carb)'],['Yağ',t.fat,g.fat,'var(--fat)']].map(([n,v,tg,c])=>`<div class="macro"><div class="mut small">${n}</div><div class="v num">${r0(v)}<span class="mut small"> /${tg}g</span></div>${bar(v/tg*100,c)}</div>`).join('')}
    </div>`;
  }
  h+=waterCard(d);
  h+=liftCard(d);
  h+=`<div class="card"><h3>Ne yedin?</h3>
    <p class="mut small" style="margin:4px 0 8px">Doğal yaz: “2 yumurta, 1 dilim tam buğday ekmeği, bir bardak süt”. Gramaj ya da etiket değeri yazarsan aynen kullanırım.</p>
    <textarea data-i="food" placeholder="Yediklerini buraya yaz…">${esc(V.food)}</textarea>
    ${thumbs('fimgs')}
    <div class="btnrow" style="margin-top:8px">${foodPhotoBtn('meal','🍽 Yemek fotoğrafı')}${foodPhotoBtn('label','🏷 Etiket fotoğrafı')}<button class="btn alt sm" data-a="bcopen">▥ Barkod</button>${precBtn()}</div>
    <p class="mut small" style="margin:8px 0 0">En doğru sonuç için: paketli üründe <b>barkodu</b> tara; yemekte fotoğrafı üstten çek, tabağın tamamı ve yanında çatal/kaşık gibi bir ölçü nesnesi görünsün; biliyorsan gramajı yazıya ekle.</p>
    <div class="row" style="margin-top:8px"><select data-i="mealtype" style="width:auto" aria-label="Öğün">${['Kahvaltı','Öğle','Akşam','Atıştırmalık'].map(m=>`<option ${m===V.mealType?'selected':''}>${m}</option>`).join('')}</select>
    <button class="btn grow" data-a="analyze" ${V.busy?'disabled':''}>${V.busy?esc(V.busyMsg||'Hesaplıyorum…'):'Kaloriyi hesapla'}</button></div>
    ${V.err?`<p class="small" style="color:var(--bad)">${esc(V.err)}</p>`:''}
    ${S.lib.length?`<div class="small mut" style="margin:12px 0 6px">Ürünlerim (doğrulanmış, dokun ekle)</div>${S.lib.slice(0,12).map(x=>`<button class="chip" data-a="ladd" data-id="${x.id}">⭐ ${esc(x.name)} · ${r0(x.n.kcal||0)}</button>`).join('')}`:''}
    ${(()=>{const ff=freqFoods();return ff.length?`<div class="small mut" style="margin:12px 0 6px">Sık yediklerin</div>${ff.map((x,i)=>`<button class="chip" data-a="qadd" data-ix="${i}">${esc(x.it.name)} · ${r0(x.it.kcal)}</button>`).join('')}`:''})()}
  </div>`;
  if(V.bc.open){
    h+=`<div class="card"><h3>Barkodla ekle</h3><p class="mut small" style="margin:4px 0 8px">Paketli ürünün barkod numarasını yaz ya da kamerayla tara. Değerler Open Food Facts veritabanından gelir (topluluk verisi; etiketle karşılaştırman iyi olur).</p>
      <div class="row"><input data-i="bc" inputmode="numeric" placeholder="örn. 8690504010001" value="${esc(V.bc.code)}" aria-label="Barkod numarası"><button class="btn sm" data-a="bcsearch" ${V.bc.busy?'disabled':''} style="min-width:72px">${V.bc.busy?'…':'Ara'}</button></div>
      <div class="btnrow" style="margin-top:8px">${camOk()?`<button class="btn alt sm" data-a="bcscan">📷 Kamerayla tara</button>`:''}<label class="btn alt sm filebtn">🖼 Fotoğraftan oku<input type="file" accept="image/*" data-i="bcfile" style="display:none"></label></div>
      <p class="mut small" style="margin:6px 0 0">Kontrol hanesi geçmeyen (yanlış okunmuş) barkodlar otomatik reddedilir.</p>
      ${V.bc.err?`<p class="flag">⚠ ${esc(V.bc.err)}</p>`:''}</div>`;
  }
  if(V.preview){
    const tt=V.preview.reduce((a,i)=>{NK.forEach(k=>a[k]=(a[k]||0)+num(i.n[k]));return a},{});
    h+=`<div class="card" style="border-color:var(--pro)"><h3>Şunları buldum</h3><p class="small mut" style="margin:2px 0 0">Miktarı (g/ml) düzeltirsen değerler otomatik güncellenir.</p>${V.preview.map((i,ix)=>`<div class="pv">
      <div class="row"><b class="grow">${esc(i.name)}</b><button class="ghost" data-a="pdel" data-ix="${ix}" aria-label="Çıkar">✕</button></div>
      <div class="mut small">${esc(i.qty)}</div>
      ${i.photo?`<div class="small mut">📸 Fotoğraftan tahmin${i.range?`: ${r0(i.range[0])}–${r0(i.range[1])} g aralığında`:''}. Tartıyla ya da ölçüyle doğrulayıp miktarı düzeltirsen değerler güncellenir.</div>`:''}
      <div class="row" style="align-items:flex-end;margin-top:6px"><div style="width:96px"><label for="pg${ix}">Miktar (g/ml)</label><input id="pg${ix}" data-i="pg" data-ix="${ix}" inputmode="decimal" value="${f1(i.g)}"></div><div class="grow num" id="pvs-${ix}">${pvLine(i)}</div></div>
      <div style="margin-top:6px">${confChip(i.conf,i.basis)}<button class="chip" data-a="plib" data-ix="${ix}" ${i.saved?'disabled':''}>${i.saved?'⭐ kaydedildi':'⭐ Ürünlerime kaydet'}</button></div>
      ${i.ref?(i.useRef?`<div class="small" style="margin-top:6px">📚 <b>${esc(i.ref.source)}</b>: ${esc(i.ref.name)}${i.ref.source==='USDA'?' (100 g başına)':''}${i.missing?` <span class="mut">· kaynakta olmayan ${i.missing} vitamin/mineral değeri toplamlara dahil değil</span>`:''}</div>${i.raw.ai?`<div class="small" style="margin-top:4px"><button class="chip" data-a="palt" data-ix="${ix}">Yapay zekâ tahminine dön</button></div>`:''}`
        :`<div class="small" style="margin-top:6px">📚 ${esc(i.ref.source)} “${esc(i.ref.name)}” bulundu ama yapay zekâ tahminiyle uyuşmadı (${r0(i.ref.per100.kcal||0)} kcal/100 g). Hangisi doğruysa onu seç. <button class="chip" data-a="palt" data-ix="${ix}">Referans değerini kullan</button></div>`):''}
      ${i.note?`<div class="small mut">${esc(i.note)}</div>`:''}${i.flags.map(f=>`<div class="flag">⚠ ${esc(f)}</div>`).join('')}
      ${i.conf==='düşük'?`<div class="small mut">Güven düşük: etiket fotoğrafı ekleyerek ya da miktarı/değerleri düzelterek doğrula.</div>`:''}</div>`).join('')}
    <div class="mut small" style="margin-top:4px" id="pvt">${pvTotal(tt)}</div>
    ${V.pnotes.length?`<div class="small" style="margin-top:8px"><b>Doğrulama düzeltmeleri:</b><br>${V.pnotes.map(esc).join('<br>')}</div>`:''}
    <div class="row" style="margin-top:10px"><button class="btn alt grow" data-a="pcancel">İptal</button><button class="btn grow" data-a="padd">${dlabel(d)} ekle</button></div>
    <p class="note" style="margin-top:8px">Değerler tahmindir; en büyük hata kaynağı porsiyon miktarıdır. Kesin sonuç için tartı ve etiket kullan.</p></div>`;
  }
  if(meals.length){
    h+=`<h2>Öğünler</h2>`;
    ['Kahvaltı','Öğle','Akşam','Atıştırmalık'].forEach(gn=>{
      const items=meals.map((m,ix)=>({...m,ix})).filter(m=>m.type===gn);
      if(!items.length)return;
      const sub=items.reduce((a,m)=>a+num(m.kcal),0),sp=items.reduce((a,m)=>a+num(m.protein),0);
      h+=`<div class="card"><div class="row between"><h3>${gn}</h3><span class="mut small num">${r0(sub)} kcal · ${r0(sp)}g protein</span></div>${items.map(m=>{
        const ed=V.edit===m.ix;
        return `<div class="meal"><div class="grow"><div>${esc(m.name)}${m.conf==='düşük'?' <span title="Güven düşük">⚠</span>':''}</div><div class="mut small">${esc(m.qty||'')} · P ${f1(m.protein)}g K ${f1(m.carbs)}g Y ${f1(m.fat)}g</div></div><b class="num">${r0(m.kcal)}</b><button class="ghost" data-a="medit" data-ix="${m.ix}" aria-label="Düzenle">✎</button><button class="ghost" data-a="mdel" data-ix="${m.ix}" aria-label="Sil">✕</button></div>
        ${ed?`<div class="grid2" style="padding:0 0 10px">${[['kcal','Kalori'],['protein','Protein g'],['carbs','Karb. g'],['fat','Yağ g']].map(([k,l])=>`<div><label>${l}</label><input data-i="mfield" data-ix="${m.ix}" data-k="${k}" inputmode="decimal" value="${esc(m[k]??'')}"></div>`).join('')}<button class="btn sm" data-a="mdone" style="grid-column:1/-1">Tamam</button></div>`:''}`;
      }).join('')}</div>`;
    });
  }
  h+=suppCard(d);
  const supTaken=Object.keys(day.sup||{}).length>0;
  if(meals.length||supTaken){
    const missing=meals.filter(m=>!m.v).length;
    const wr=(g.kcal&&S.prefs.ulWarn!==false)?ulWarnings(t,st):[];
    if(wr.length)h+=`<div class="card warn"><h3>⚠ Üst sınır uyarısı</h3><p class="small" style="margin:6px 0">${wr.map(esc).join('<br>')}</p><p class="note" style="margin:6px 0 0">Bu sınırlar yetişkinler için genel değerlerdir. Yüksek doz takviye kullanıyorsan doktor ya da eczacıya danış.</p></div>`;
    h+=`<div class="card"><h3>Detaylı besin analizi</h3>
      ${macroSplit(t)}
      <div class="small" style="margin-top:12px"><b>Karbonhidrat dağılımı:</b> <span class="num">${carbSplit(t)}</span></div>
      <div class="small" style="margin-top:6px"><b>Yağ dağılımı:</b> <span class="num">toplam ${f1(t.fat)} g · doymuş ${f1(t.sat)} g · tekli doymamış ${f1(t.mono)} g · çoklu doymamış ${f1(t.poly)} g</span></div>
      ${g.kcal?nGroups(t,st):''}
      ${missing?`<p class="note">${missing} kayıt eski sürümden; bazı vitamin/mineral detayları yok, toplamlar eksik olabilir.</p>`:''}
      ${supTaken?`<p class="note" style="margin-top:6px">Toplamlara aldığın takviyeler de dahil.</p>`:''}
    </div>`;
  }
  h+=`<div class="card"><label for="wt">Sabah kilon (kg)</label><input id="wt" data-i="weight" inputmode="decimal" placeholder="örn. 78.4" value="${esc(getDayRO(d).weight??'')}"></div>`;
  h+=`<p class="note">Besin değerleri tahmindir; yaklaşık rehber olarak kullan.</p>`;
  return h;
}
function pvLine(i){return `<b>${r0(i.n.kcal||0)}</b> kcal · ${nSummary(i.n)}`}
function pvTotal(tt){return `Toplam <b class="num" style="color:var(--ink)">${r0(tt.kcal||0)} kcal</b> · P ${r0(tt.protein||0)}g · K ${r0(tt.carbs||0)}g · Y ${r0(tt.fat||0)}g (doymuş ${f1(tt.sat||0)}g)`}
function updPv(ix){
  const it=V.preview&&V.preview[ix];if(!it)return;
  const a=document.getElementById('pvs-'+ix);if(a)a.innerHTML=pvLine(it);
  const tt=V.preview.reduce((s,i)=>{NK.forEach(k=>s[k]=(s[k]||0)+num(i.n[k]));return s},{});
  const b=document.getElementById('pvt');if(b)b.innerHTML=pvTotal(tt);
}

/* ---------- Takviye ---------- */
function suppChips(n){
  const a=NK.filter(k=>num(n[k])>0);
  return a.length?a.map(k=>`<span class="chip">${LB[k][0]} ${f1(n[k])} ${LB[k][1]}</span>`).join(''):'<span class="mut small">İçerik bilgisi yok</span>';
}
const otherChips=o=>(o&&o.length)?o.map(x=>`<span class="chip">${esc(x.n)} ${f1(x.v)} ${esc(x.u)}</span>`).join(''):'';
function viewSupp(){
  let h=`<h2 style="margin-top:6px">Takviyelerim</h2>`;
  if(!S.supps.length)h+=`<div class="empty" style="padding:8px">Henüz takviye eklemedin.</div>`;
  S.supps.forEach(s=>{
    const ed=V.sedit===s.id;
    const shown=ed?NK.filter(k=>num((s.n||{})[k])>0||(V.sf[s.id]||[]).includes(k)):[];
    const free=NK.filter(k=>!shown.includes(k));
    h+=`<div class="card"><div class="row between"><div class="grow"><h3>${esc(s.name)}</h3><div class="mut small">Bir doz: ${esc(s.dose||'1 doz')}</div></div><button class="ghost" data-a="sedit" data-id="${s.id}" aria-label="Düzenle">✎</button><button class="ghost" data-a="sdel" data-id="${s.id}" aria-label="Sil">✕</button></div>
    <div style="margin-top:8px">${suppChips(s.n||{})}${otherChips(s.other)}</div>
    <div style="margin-top:4px">${s.conf?confChip(s.conf,s.basis):''}</div>${s.note?`<p class="small mut">${esc(s.note)}</p>`:''}
    ${ed?`<div style="margin-top:10px"><div class="grid2"><div><label>Ad</label><input data-i="sname" data-id="${s.id}" value="${esc(s.name)}"></div><div><label>Bir doz</label><input data-i="sdose" data-id="${s.id}" value="${esc(s.dose||'')}"></div></div>
      <p class="small mut" style="margin:10px 0 4px">Bir dozdaki miktarlar (etiketle karşılaştırıp düzelt)</p><div class="grid2">${shown.map(k=>`<div><label>${LB[k][0]} (${LB[k][1]})</label><input data-i="sfield" data-id="${s.id}" data-k="${k}" inputmode="decimal" value="${(s.n||{})[k]||''}"></div>`).join('')}</div>
      <div style="margin-top:8px"><select data-i="saddf" data-id="${s.id}" aria-label="Alan ekle"><option value="">+ Başka bir değer ekle…</option>${free.map(k=>`<option value="${k}">${LB[k][0]} (${LB[k][1]})</option>`).join('')}</select></div>
      <p class="small mut" style="margin:10px 0 4px">Diğer etken maddeler (kreatin, kafein, CFU…)</p>
      ${(s.other||[]).map((o,oi)=>`<div class="row" style="margin-bottom:6px"><input data-i="so" data-id="${s.id}" data-ix="${oi}" data-f="n" placeholder="Ad" value="${esc(o.n)}" aria-label="Etken madde adı"><input data-i="so" data-id="${s.id}" data-ix="${oi}" data-f="v" inputmode="decimal" placeholder="Miktar" value="${esc(o.v)}" style="max-width:90px" aria-label="Miktar"><input data-i="so" data-id="${s.id}" data-ix="${oi}" data-f="u" placeholder="Birim" value="${esc(o.u)}" style="max-width:72px" aria-label="Birim"><button class="ghost" data-a="sodel" data-id="${s.id}" data-ix="${oi}" aria-label="Sil">✕</button></div>`).join('')}
      <div class="btnrow"><button class="btn alt sm" data-a="soadd" data-id="${s.id}">+ Etken madde</button><button class="btn sm" data-a="sedit" data-id="${s.id}">Tamam</button></div></div>`:''}</div>`;
  });
  h+=`<h2>Takviye ekle</h2><div class="card">
    <p class="mut small" style="margin:0 0 8px">Ürün adını (marka + ürün) ve dozunu yaz. En doğru sonuç için etiketin (Supplement Facts / Besin Değerleri) fotoğrafını ekle; etiketteki değerleri aynen okurum. Örn: “Solgar D3 1000 IU günde 1 kapsül”, “Whey protein 1 ölçek”.</p>
    <textarea data-i="stext" placeholder="Takviyeni yaz…">${esc(V.stext)}</textarea>
    ${thumbs('simgs')}
    <div class="btnrow" style="margin-top:8px">${photoBtn('simgs','simg','Etiket fotoğrafı')}${precBtn()}</div>
    <button class="btn full" style="margin-top:8px" data-a="sparse" ${V.sbusy?'disabled':''}>${V.sbusy?esc(V.busyMsg||'Hesaplıyorum…'):'İçeriğini hesapla'}</button>
    ${V.serr?`<p class="small" style="color:var(--bad)">${esc(V.serr)}</p>`:''}</div>`;
  if(V.spreview){
    h+=`<div class="card" style="border-color:var(--pro)"><h3>Şunları buldum</h3>${V.spreview.map((s,i)=>`<div class="pv"><div class="row between"><b>${esc(s.name)}</b><button class="ghost" data-a="spdel" data-ix="${i}" aria-label="Çıkar">✕</button></div><div class="mut small">Bir doz: ${esc(s.dose)}</div><div style="margin-top:6px">${suppChips(s.n)}${otherChips(s.other)}</div><div style="margin-top:4px">${confChip(s.conf,s.basis)}</div>${s.note?`<p class="small mut">${esc(s.note)}</p>`:''}${s.flags.map(f=>`<div class="flag">⚠ ${esc(f)}</div>`).join('')}${s.conf==='düşük'?`<div class="small mut">Güven düşük: etiket fotoğrafı ekleyerek tekrar hesapla ya da ekledikten sonra ✎ ile etikete göre düzelt.</div>`:''}</div>`).join('')}
    ${V.snotes.length?`<div class="small" style="margin-top:8px"><b>Doğrulama düzeltmeleri:</b><br>${V.snotes.map(esc).join('<br>')}</div>`:''}
    <div class="row" style="margin-top:10px"><button class="btn alt grow" data-a="spcancel">İptal</button><button class="btn grow" data-a="spadd">Takviyelerime ekle</button></div></div>`;
  }
  h+=`<p class="note">Bugün sekmesinde her gün aldığın dozu işaretle; içerik günlük kalori, makro, vitamin ve mineral toplamına otomatik eklenir. Ürün formülleri markaya ve ülkeye göre değişebilir; güveni “düşük” veya “orta” olanları etiketle doğrula. Bu uygulama tıbbi tavsiye vermez.</p>`;
  return h;
}

/* ---------- Geçmiş ---------- */
function viewHistory(){
  const months=[...new Set([TODAY.slice(0,7),...Object.keys(S.months)])].sort().reverse();
  if(!V.hm||!months.includes(V.hm))V.hm=months[0];
  const all=Object.keys(S.months[V.hm]?.days||{}).filter(hasData).sort().reverse();
  const shown=V.hmore?all:all.slice(0,31);
  const logged=all.filter(d=>(getDayRO(d).meals||[]).length);
  const avg=f=>logged.length?logged.reduce((a,d)=>a+f(d),0)/logged.length:0;
  const wd=all.filter(d=>waterSum(d)>0);
  let h=`<h2 style="margin-top:6px">Geçmiş</h2>
  <div class="card"><label for="hd">Tarihe git</label><input id="hd" type="date" data-i="hdate" max="${TODAY}" value="" aria-label="Tarih seç">
  <p class="small mut" style="margin:8px 0 0">Bir tarih seç; o günün yemekleri, kalorisi, suyu, takviyeleri ve besin detayları açılır. Ya da aşağıdan bir güne dokun.</p></div>
  <div class="card"><label for="hm">Ay</label><select id="hm" data-i="hmonth">${months.map(m=>`<option value="${m}" ${m===V.hm?'selected':''}>${mlabel(m)}</option>`).join('')}</select>
  <div class="grid3" style="margin-top:12px">
    <div><div class="mut small">Kayıtlı gün</div><div class="num" style="font-size:24px;font-weight:700">${all.length}</div></div>
    <div><div class="mut small">Ort. kalori</div><div class="num" style="font-size:24px;font-weight:700">${logged.length?r0(avg(d=>totals(d).kcal)):'–'}</div></div>
    <div><div class="mut small">Ort. protein</div><div class="num" style="font-size:24px;font-weight:700">${logged.length?r0(avg(d=>totals(d).protein)):'–'}<span class="mut small"> g</span></div></div></div>
  ${wd.length?`<div class="mut small" style="margin-top:8px">Ortalama su: <b class="num" style="color:var(--ink)">${r0(wd.reduce((a,d)=>a+waterSum(d),0)/wd.length)} ml</b> (${wd.length} gün)</div>`:''}</div>`;
  if(!all.length)h+=`<div class="empty">Bu ayda kayıt yok.</div>`;
  else{
    h+=`<div class="card" style="padding:4px 14px">${shown.map(d=>{
      const t=totals(d),x=getDayRO(d),w=waterSum(d),sup=Object.keys(x.sup||{}).length;
      return `<div class="hrow" data-a="open" data-d="${d}" role="button" tabindex="0"><div style="min-width:74px"><b>${dmid(d)}</b></div><div class="grow"><div class="num"><b>${r0(t.kcal)}</b> kcal · P ${r0(t.protein)}g · K ${r0(t.carbs)}g · Y ${r0(t.fat)}g</div><div class="mut small">${w?`💧 ${(w/1000).toFixed(1).replace('.',',')} L`:''}${sup?` · 💊 ${sup} takviye`:''}${x.weight?` · ⚖ ${f1(x.weight)} kg`:''}${x.lift&&x.lift.rest?' · 😴 dinlenme':x.lift&&(x.lift.ex||[]).length?` · 🏋 ${x.lift.ex.length} hareket`:''}</div></div><span class="mut">›</span></div>`;
    }).join('')}</div>`;
    if(all.length>shown.length)h+=`<button class="btn alt full" data-a="hmore">Tümünü göster (${all.length})</button>`;
  }
  return h;
}

/* ---------- grafikler ---------- */
function barChart(vals,labels,target,color){
  const W=340,H=130,pl=6,pb=18,pt=8,n=vals.length;
  const max=Math.max(target||0,...vals,1)*1.1,bw=(W-pl*2)/n;
  const y=v=>pt+(H-pt-pb)*(1-v/max);
  let s=`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Grafik">`;
  vals.forEach((v,i)=>{const x=pl+i*bw+bw*.18,w=bw*.64;if(v>0)s+=`<rect x="${x}" y="${y(v)}" width="${w}" height="${H-pb-y(v)}" rx="3" fill="${color}"/>`;
    if(n<=16||i%Math.ceil(n/10)===0)s+=`<text x="${x+w/2}" y="${H-5}" text-anchor="middle">${labels[i]}</text>`});
  if(target)s+=`<line x1="0" x2="${W}" y1="${y(target)}" y2="${y(target)}" stroke="var(--ink)" stroke-dasharray="4 3" stroke-width="1"/><text x="${W-2}" y="${y(target)-3}" text-anchor="end">hedef ${target}</text>`;
  return s+'</svg>';
}
function lineChart(pts,color,unit){
  if(pts.length<2)return '<div class="empty" style="padding:10px">Grafik için en az 2 ölçüm gerek.</div>';
  const W=340,H=130,p=14,vs=pts.map(x=>x.v),mn=Math.min(...vs)-.5,mx=Math.max(...vs)+.5;
  const X=i=>p+(W-p*2)*i/(pts.length-1),Y=v=>p+(H-p*2-8)*(1-(v-mn)/(mx-mn));
  let s=`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Çizgi grafik"><polyline fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" points="${pts.map((q,i)=>X(i)+','+Y(q.v)).join(' ')}"/>`;
  pts.forEach((q,i)=>{s+=`<circle cx="${X(i)}" cy="${Y(q.v)}" r="3" fill="${color}"/>`});
  s+=`<text x="${p}" y="${H-2}">${dshort(pts[0].d)}</text><text x="${W-p}" y="${H-2}" text-anchor="end">${dshort(pts[pts.length-1].d)}</text><text x="${X(pts.length-1)}" y="${Y(pts[pts.length-1].v)-8}" text-anchor="end">${f1(pts[pts.length-1].v)} ${unit||''}</text>`;
  return s+'</svg>';
}

/* ---------- Analiz hesapları ---------- */
function rangeData(n){
  const out=[];for(let i=n-1;i>=0;i--){const d=addDays(TODAY,-i);out.push({d,...totals(d),water:waterSum(d),burn:burnOf(d),logged:(getDayRO(d).meals||[]).length>0})}return out;
}
function trend(pts){
  if(pts.length<3)return null;
  const x0=parseD(pts[0].d).getTime(),xs=pts.map(p=>(parseD(p.d).getTime()-x0)/864e5);
  if(xs[xs.length-1]<6)return null;
  const n=pts.length,mx=xs.reduce((a,b)=>a+b)/n,my=pts.reduce((a,p)=>a+p.v,0)/n;
  let nu=0,de=0;xs.forEach((x,i)=>{nu+=(x-mx)*(pts[i].v-my);de+=(x-mx)**2});
  const sl=nu/de;return {perDay:sl,perWeek:sl*7};
}
function weightPts(n){const a=[];for(let i=n-1;i>=0;i--){const d=addDays(TODAY,-i),w=num(getDayRO(d).weight);if(w)a.push({d,v:w})}return a}
/* ---------- Güç takibi (Analiz sekmesi) ---------- */
function viewLifts(){
  const H=liftHistory(),since=addDays(TODAY,-180);
  let h=`<h2>Güç</h2>`;
  let train=0,rest=0;for(let i=0;i<7;i++){const L=liftOf(addDays(TODAY,-i));if(L&&L.rest)rest++;else if(L&&(L.ex||[]).length)train++}
  const list=Object.entries(H).filter(([,x])=>x.s.some(q=>q.d>=since)).sort((a,b)=>b[1].s.length-a[1].s.length).slice(0,10);
  if(!list.length)return h+`<div class="card"><p class="mut small" style="margin:0">Henüz antrenman kaydı yok. Bugün ekranındaki antrenman kartından hareket, set, kilo ve tekrar girdikçe güç gelişimin burada görünür.</p></div>`;
  const key=list.some(([k])=>k===V.liftSel)?V.liftSel:list[0][0],x=H[key],unit=exUnit(x);
  const pts=x.s.map(q=>({d:q.d,v:r1(bestOf(q.sets))}));
  const all=Math.max(...pts.map(p=>p.v)),last=pts[pts.length-1];
  const win=(a,b)=>{const v=x.s.filter(q=>q.d>addDays(TODAY,-a)&&q.d<=addDays(TODAY,-b)).map(q=>bestOf(q.sets));return v.length?Math.max(...v):0};
  const cur=win(28,0),prv=win(56,28);
  let verdict;
  if(cur&&prv){const ch=(cur-prv)/prv*100;verdict=ch>=2?`💪 Son 4 haftada <b>%${r1(ch)} güçlendin</b> (önceki 4 hafta: ${f1(prv)} ${unit}).`:ch<=-2?`📉 Son 4 haftada <b>%${r1(-ch)} geriledin</b> (önceki 4 hafta: ${f1(prv)} ${unit}). Dinlenme ve uyku yeterli mi?`:`➖ Son 4 haftada aynı seviyedesin (±%2).`}
  else if(cur)verdict='Karşılaştırma için önceki 4 haftada bu harekete ait kayıt yok.';
  else verdict='Son 4 haftada bu harekete ait kayıt yok.';
  let plateau='';
  if(pts.length>=4){const l3=Math.max(...pts.slice(-3).map(p=>p.v)),bf=Math.max(...pts.slice(0,-3).map(p=>p.v));if(l3<=bf)plateau=`<div class="small" style="margin-top:8px">⏸ Son 3 antrenmanda rekorun (${f1(bf)} ${unit}) geçilmedi. Kilo ya da tekrarı artırmayı dene.</div>`}
  const title=unit==='kg'?'Tahmini 1RM (en iyi set)':'En iyi set (tekrar)';
  h+=`<div class="card"><div class="mut small">Son 7 gün</div><div class="num" style="font-size:24px;font-weight:700">${train}<span class="mut small"> antrenman</span>${rest?` · ${rest}<span class="mut small"> dinlenme</span>`:''}</div></div>
  <div class="card"><div class="seg" style="flex-wrap:wrap;margin-bottom:10px">${list.map(([k,v])=>`<button data-a="liftsel" data-k="${esc(k)}" class="${k===key?'on':''}">${esc(v.name)}</button>`).join('')}</div>
    <h3>${esc(x.name)}</h3><div class="mut small">${title}</div>
    <div class="grid2" style="margin-top:6px"><div><div class="mut small">Son antrenman</div><div class="num" style="font-size:26px;font-weight:700">${f1(last.v)}<span class="mut small"> ${unit}</span></div></div>
    <div><div class="mut small">Rekor</div><div class="num" style="font-size:26px;font-weight:700">${f1(all)}<span class="mut small"> ${unit}</span></div></div></div>
    ${lineChart(pts.slice(-30),'var(--carb)',unit)}
    <div style="margin-top:8px">${verdict}</div>${plateau}
    <div class="small mut" style="margin:12px 0 4px">Son antrenmanlar</div>
    ${x.s.slice(-5).reverse().map(q=>`<div class="meal"><div style="min-width:74px"><b>${esc(dmid(q.d))}</b></div><div class="grow num small">${q.sets.map(setTxt).join(' · ')}</div></div>`).join('')}
    ${unit==='kg'?'<p class="note">Tahmini 1RM, Epley formülüyle (kg × (1 + tekrar/30)) hesaplanır; farklı kilo/tekrar kombinasyonlarını karşılaştırılabilir kılar. 12 tekrarın üstü 12 sayılır.</p>':''}</div>`;
  return h;
}
function statsSnapshot(){
  const rd=rangeData(28),lg=rd.filter(x=>x.logged);
  const tr=trend(weightPts(28));
  const avgIn=lg.length?lg.reduce((a,x)=>a+x.kcal,0)/lg.length:0;
  const real=(tr&&lg.length>=10)?avgIn-tr.perDay*7700:null;
  return {tr,real};
}

/* ---------- Analiz ---------- */
function viewStats(){
  const g=S.goals,rd=rangeData(V.range),lg=rd.filter(x=>x.logged),n=lg.length;
  const avg=k=>n?lg.reduce((a,x)=>a+x[k],0)/n:0;
  let h=`<div class="seg" style="margin-bottom:12px">${[7,14,30].map(k=>`<button data-a="range" data-n="${k}" class="${V.range===k?'on':''}">${k} gün</button>`).join('')}</div>`;
  h+=`<h2 style="margin-top:0">Beslenme</h2>`;
  const defSum=g.tdee?lg.reduce((a,x)=>a+(g.tdee+x.burn-x.kcal),0):0;
  const nb=lg.filter(x=>x.burn>0),anyBurn=rd.some(x=>x.burn>0);
  h+=`<div class="grid2"><div class="card"><div class="mut small">Ort. kalori</div><div class="num" style="font-size:30px;font-weight:700">${n?r0(avg('kcal')):'–'}</div><div class="mut small">${n} gün kayıtlı${nb.length?` · ort. yakılan ${r0(nb.reduce((a,x)=>a+x.burn,0)/nb.length)}`:''}</div></div>
  <div class="card"><div class="mut small">Ort. protein</div><div class="num" style="font-size:30px;font-weight:700">${n?r0(avg('protein')):'–'}<span class="mut small"> g</span></div><div class="mut small">${num(S.profile.weight)&&n?f1(avg('protein')/num(S.profile.weight))+' g/kg · ':''}hedef ${g.protein||'–'}</div></div></div>`;
  if(g.kcal&&n){
    const okK=lg.filter(x=>Math.abs(x.kcal-x.burn-g.kcal)/g.kcal<=.1).length,okP=lg.filter(x=>x.protein>=g.protein*.9).length,under=lg.filter(x=>x.kcal-x.burn<=g.kcal).length;
    h+=`<div class="card"><h3>Hedefe uyum</h3><div style="margin-top:8px"><span class="chip">Kalori hedefi ±%10: <b class="num">${okK}/${n}</b> gün</span><span class="chip">Protein hedefi (≥%90): <b class="num">${okP}/${n}</b> gün</span><span class="chip">Kalori altında: <b class="num">${under}/${n}</b> gün</span></div>
    ${g.tdee?`<div class="mut small" style="margin-top:6px">Toplam ${defSum>=0?'kalori açığı':'fazlası'}: <b class="num" style="color:var(--ink)">${Math.abs(r0(defSum)).toLocaleString('tr-TR')} kcal</b> ≈ ${(Math.abs(defSum)/7700).toFixed(2)} kg yağ eşdeğeri (kabaca)</div>`:''}</div>`;
    h+=`<div class="card"><h3>Ortalama makro dağılımı</h3>${macroSplit({protein:avg('protein'),carbs:avg('carbs'),fat:avg('fat')})}
      <div class="mut small num" style="margin-top:8px">Protein ${r0(avg('protein'))} g · Karbonhidrat ${r0(avg('carbs'))} g · Yağ ${r0(avg('fat'))} g (doymuş ${f1(avg('sat'))} · tekli ${f1(avg('mono'))} · çoklu ${f1(avg('poly'))} g)</div></div>`;
    const avgT=Object.fromEntries(NK.map(k=>[k,avg(k)])),sts=lg.map(x=>suppTotals(x.d)),avgS=Object.fromEntries(NK.map(k=>[k,sts.reduce((a,s)=>a+s[k],0)/n]));
    h+=`<div class="card"><h3>Ortalama vitamin ve mineraller (günlük)</h3>${nGroups(avgT,avgS)}<p class="note">Kayıt girdiğin günlerin ortalaması; takviyeler dahil. Eksik kayıt değerleri düşük gösterir.</p></div>`;
  }
  h+=`<div class="card"><h3>Günlük kalori${anyBurn?' (yenen − yakılan)':''}</h3>${barChart(rd.map(x=>x.logged?Math.max(0,r0(x.kcal-x.burn)):0),rd.map(x=>dshort(x.d)),g.kcal,'var(--kcal)')}</div>`;
  h+=`<div class="card"><h3>Günlük protein</h3>${barChart(rd.map(x=>r0(x.protein)),rd.map(x=>dshort(x.d)),g.protein,'var(--pro)')}</div>`;
  if(n){
    const mt=['Kahvaltı','Öğle','Akşam','Atıştırmalık'],ms={};mt.forEach(k=>ms[k]={k:0,p:0});
    rd.forEach(x=>(getDayRO(x.d).meals||[]).forEach(m=>{if(ms[m.type]){ms[m.type].k+=num(m.kcal);ms[m.type].p+=num(m.protein)}}));
    const tk=Object.values(ms).reduce((a,b)=>a+b.k,0)||1;
    h+=`<div class="card"><h3>Öğün dağılımı</h3>${mt.map(k=>`<div style="margin-top:8px"><div class="row between small"><span>${k}</span><span class="num">${r0(ms[k].k/n)} kcal · ${r0(ms[k].p/n)} g protein <span class="mut">(%${r0(ms[k].k/tk*100)})</span></span></div>${bar(ms[k].k/tk*100,'var(--kcal)')}</div>`).join('')}</div>`;
    const wk=Array.from({length:7},()=>({k:0,c:0}));
    rangeData(Math.max(V.range,28)).forEach(x=>{if(x.logged){const i=(parseD(x.d).getDay()+6)%7;wk[i].k+=x.kcal;wk[i].c++}});
    h+=`<div class="card"><h3>Haftanın günlerine göre kalori</h3><div class="mut small">Son ${Math.max(V.range,28)} gün ortalaması</div>${barChart(wk.map(x=>x.c?r0(x.k/x.c):0),WD,g.kcal,'var(--kcal)')}</div>`;
  }
  const wg=waterGoal(),wdays=rd.filter(x=>x.water>0),okW=rd.filter(x=>x.water>=wg*.9).length;
  h+=`<h2>Su</h2><div class="card"><div class="grid2"><div><div class="mut small">Ortalama</div><div class="num" style="font-size:30px;font-weight:700">${wdays.length?(wdays.reduce((a,x)=>a+x.water,0)/wdays.length/1000).toFixed(2).replace('.',','):'–'}<span class="mut small"> L</span></div></div><div><div class="mut small">Hedefe ulaşılan gün</div><div class="num" style="font-size:30px;font-weight:700">${okW}<span class="mut small"> / ${V.range}</span></div></div></div>
    ${barChart(rd.map(x=>r0(x.water)),rd.map(x=>dshort(x.d)),wg,'var(--water)')}</div>`;
  if(S.supps.length){
    h+=`<h2>Takviyeler</h2><div class="card">${S.supps.map(s=>{
      const c=rd.filter(x=>(getDayRO(x.d).sup||{})[s.id]).length;
      return `<div style="margin-top:8px"><div class="row between small"><span>${esc(s.name)}</span><span class="num"><b>${c}</b> / ${V.range} gün</span></div>${bar(c/V.range*100,'var(--fat)')}</div>`;
    }).join('')}</div>`;
  }
  const wp=weightPts(90),tr=trend(weightPts(28));
  h+=`<h2>Kilo</h2><div class="card">${lineChart(wp,'var(--fat)','kg')}
    ${tr?`<div class="mut small" style="margin-top:6px">Son 28 gün trendi: <b class="num" style="color:var(--ink)">${tr.perWeek>=0?'+':''}${String(r1(tr.perWeek)).replace('.',',')} kg/hafta</b></div>`:'<div class="mut small">Trend için en az 3 ölçüm ve 1 haftalık aralık gerek.</div>'}</div>`;
  const snap=statsSnapshot();
  if(snap.real&&g.tdee)h+=`<div class="card"><h3>Gerçek harcama tahmini</h3><div class="num" style="font-size:30px;font-weight:700">~${r0(snap.real)} kcal</div><div class="mut small">Yediklerin ve kilo trendinden hesaplandı (formül tahmini: ${g.tdee}). Kayıtların eksiksiz olduğu sürece daha doğrudur.</div></div>`;
  h+=viewLifts();
  h+=`<h2>Koç yorumu</h2><div class="card"><p class="mut small" style="margin:0 0 10px">Son 14 günlük beslenme, vitamin/mineral, takviye, su ve kilo verilerini birlikte yorumlayıp somut öneriler verir.</p>
    <button class="btn full" data-a="coach" ${V.coachBusy?'disabled':''}>${V.coachBusy?'Analiz ediyorum…':'Verilerimi analiz et'}</button>
    ${V.coach?`<div class="coach" id="coachtxt" style="margin-top:12px">${esc(V.coach)}</div>`:''}</div>`;
  return h;
}

/* ---------- Giriş ekranları ---------- */
const pwField=(id,label,ac,name)=>`<div style="margin-top:10px"><label for="${id}">${label}</label><div class="row" style="gap:4px"><input id="${id}" name="${name}" type="password" autocomplete="${ac}" autocapitalize="none" spellcheck="false" required><button type="button" class="ghost" data-a="pwtog" data-t="${id}" aria-label="Şifreyi göster/gizle">👁</button></div></div>`;
function viewAuth(){
  if(V.am==='force'&&AUTH.cur)return viewForce();
  const m=V.am,err=V.aerr?`<p class="flag" role="alert">⚠ ${esc(V.aerr)}</p>`:'';
  const head=`<div style="text-align:center;margin:26px 0 18px"><div style="font-size:46px;line-height:1">💪</div><h1 style="font-size:26px;margin-top:8px">Spor Hocam</h1><div class="mut small">Beslenme, takviye ve su takibin</div></div>`;
  let body='';
  if(m==='err'){
    body=`<div class="card warn"><h3>Bağlantı sorunu</h3><p class="small">${esc(V.aerr||'Sunucuya şu an ulaşılamadı.')} Verilerin güvende; internet bağlantını kontrol edip tekrar dene.</p><button class="btn full" data-a="retryboot">Tekrar dene</button></div>`;
  }else if(m==='code'&&V.pending){
    const p=V.pending;
    body=`<div class="card" style="border-color:var(--pro)"><h3>${esc(p.title||'')}</h3><p class="small">Kurtarma kodun aşağıda. Şifreni unutursan hesabını yalnızca bu kodla açabilirsin. Güvenli bir yere yaz; <b>bir daha gösterilmeyecek</b>.</p>
      <div class="code num" id="rc">${esc(p.code)}</div>
      <div class="btnrow" style="margin-top:12px"><button class="btn alt sm" data-a="copycode">Kopyala</button><button class="btn grow" data-a="codego">Kodu kaydettim, devam et</button></div></div>`;
  }else if(m==='register'){
    body=`<form class="card" data-f="register" autocomplete="on"><h3>Hesap oluştur</h3>
      <div style="margin-top:10px"><label for="ru">Kullanıcı adı</label><input id="ru" name="u" autocomplete="username" autocapitalize="none" spellcheck="false" value="${esc(V.au)}" required></div>
      ${pwField('rp','Şifre (en az 8 karakter)','new-password','pw')}
      ${pwField('rp2','Şifre (tekrar)','new-password','pw2')}
      ${AUTH.config.registration==='invite'?`<div style="margin-top:10px"><label for="ri">Davet kodu</label><input id="ri" name="invite" autocomplete="off" autocapitalize="none" spellcheck="false" required></div>`:''}
      ${err}
      <button class="btn full" style="margin-top:12px" ${V.abusy?'disabled':''}>Hesap oluştur</button>
      ${AUTH.config.hasUsers?`<div style="text-align:center;margin-top:10px"><button type="button" class="ghost" style="font-size:13px" data-a="am" data-m="login">Zaten hesabım var</button></div>`:''}
      <p class="note">Hesap oluşturunca sana bir kurtarma kodu verilir. Şifreler düz metin olarak saklanmaz. Bu sunucunun yöneticisi, uygulamanın bakımı için kayıtlı verilerini (yemek, kilo, takviye) görebilir.</p></form>`;
  }else if(m==='reset'){
    body=`<form class="card" data-f="reset" autocomplete="off"><h3>Şifremi unuttum</h3><p class="small mut" style="margin:4px 0 0">Hesap oluştururken aldığın kurtarma kodunu gir.</p>
      <div style="margin-top:10px"><label for="xu">Kullanıcı adı</label><input id="xu" name="u" autocomplete="username" autocapitalize="none" spellcheck="false" value="${esc(V.au)}" required></div>
      <div style="margin-top:10px"><label for="xc">Kurtarma kodu</label><input id="xc" name="code" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX" required></div>
      ${pwField('xp','Yeni şifre','new-password','pw')}
      ${pwField('xp2','Yeni şifre (tekrar)','new-password','pw2')}
      ${err}
      <button class="btn full" style="margin-top:12px" ${V.abusy?'disabled':''}>Şifreyi sıfırla</button>
      <div style="text-align:center;margin-top:10px"><button type="button" class="ghost" style="font-size:13px" data-a="am" data-m="login">Girişe dön</button></div></form>`;
  }else{
    body=`<form class="card" data-f="login" autocomplete="on"><h3>Giriş yap</h3>
      <div style="margin-top:10px"><label for="lu">Kullanıcı adı</label><input id="lu" name="u" autocomplete="username" autocapitalize="none" spellcheck="false" value="${esc(V.au)}" required></div>
      ${pwField('lp','Şifre','current-password','pw')}
      <label class="chk" style="margin-top:12px"><input type="checkbox" name="remember" checked> Bu cihazda oturumu açık tut</label>
      ${err}
      <button class="btn full" style="margin-top:12px" ${V.abusy?'disabled':''}>Giriş yap</button>
      <div class="row between" style="margin-top:10px">${AUTH.config.registration!=='closed'?`<button type="button" class="ghost" style="font-size:13px" data-a="am" data-m="register">Hesap oluştur</button>`:'<span></span>'}<button type="button" class="ghost" style="font-size:13px" data-a="am" data-m="reset">Şifremi unuttum</button></div></form>`;
  }
  return `<div class="auth">${head}${body}</div>`;
}

/* ---------- Ayarlar ---------- */
const msgBox=()=>V.smsg?`<div class="card ${V.smsg.ok?'':'warn'}" role="status"><span class="small">${V.smsg.ok?'✓ ':'⚠ '}${esc(V.smsg.t)}</span></div>`:'';
const toggleRow=(act,title,desc,on)=>`<div class="row between" style="margin-top:14px"><div class="grow"><div>${title}</div><div class="small mut">${desc}</div></div><button class="chip ${on?'on':''}" data-a="${act}" role="switch" aria-checked="${on}" style="min-width:64px;text-align:center;margin:0">${on?'Açık':'Kapalı'}</button></div>`;
function setAccount(){
  const a=AUTH.cur;
  if(AUTH.noAuth)return `<div class="card"><h3>Giriş sistemi kullanılamıyor</h3><p class="small mut">Bu tarayıcı güvenli şifreleme (WebCrypto) sağlamadığı için kullanıcı girişi devre dışı. Uygulama giriş olmadan çalışıyor.</p></div>`;
  return `${msgBox()}
  <div class="card"><div class="row"><div class="avatar">${esc((a.username[0]||'?').toUpperCase())}</div><div class="grow"><h3>${esc(a.username)}</h3><div class="mut small">Üyelik tarihi: ${esc(a.created||'-')}</div></div></div></div>
  ${V.newCode?`<div class="card" style="border-color:var(--pro)"><h3>Yeni kurtarma kodun</h3><div class="code num" id="rc">${esc(V.newCode)}</div><p class="small mut">Güvenli bir yere yaz; eski kodun artık geçersiz. Bu kod bir daha gösterilmeyecek.</p><div class="btnrow"><button class="btn alt sm" data-a="copycode">Kopyala</button><button class="btn sm" data-a="codeok">Kaydettim</button></div></div>`:''}
  <div class="card"><h3>Kullanıcı adını değiştir</h3><form data-f="chuser" autocomplete="off">
    <div style="margin-top:10px"><label for="nu">Yeni kullanıcı adı</label><input id="nu" name="u" autocapitalize="none" spellcheck="false" required></div>
    ${pwField('cp1','Mevcut şifre','current-password','pw')}
    <button class="btn full" style="margin-top:12px">Kaydet</button></form></div>
  <div class="card"><h3>Şifreyi değiştir</h3><form data-f="chpw" autocomplete="off">
    ${pwField('cp2','Mevcut şifre','current-password','pw')}${pwField('np1','Yeni şifre (en az 8 karakter)','new-password','n1')}${pwField('np2','Yeni şifre (tekrar)','new-password','n2')}
    <button class="btn full" style="margin-top:12px">Şifreyi güncelle</button></form></div>
  <div class="card"><h3>Kurtarma kodu</h3><p class="small mut" style="margin:4px 0 0">Şifreni unutursan giriş ekranından bu kodla sıfırlarsın. Kaybettiysen yenisini üret; eskisi geçersiz olur.</p>
    <form data-f="newcode" autocomplete="off">${pwField('cp3','Mevcut şifre','current-password','pw')}<button class="btn alt full" style="margin-top:12px">Yeni kod üret</button></form></div>
  <div class="card"><button class="btn alt full" data-a="logout">Oturumu kapat</button></div>
  <div class="card warn"><h3>Hesabı sil</h3><p class="small" style="margin:6px 0 0">Hesabın ve tüm verilerin kalıcı olarak silinir; geri alınamaz. Önce Veri sekmesinden yedek indirmeni öneririm.</p>
    <form data-f="delacct" autocomplete="off">${pwField('cp4','Mevcut şifre','current-password','pw')}<button class="btn full" style="margin-top:12px;background:var(--bad);color:#fff">Hesabı kalıcı olarak sil</button></form></div>
  <p class="note">Bu giriş uygulamayı, bu cihazı ya da bağlantıyı kullanan başkalarından ayırır. Verilerin ayrıca Claude hesabına bağlı özel bir alanda tutulur.</p>`;
}
function setProfile(){
  const p=S.profile,g=S.goals;
  let h=`<div class="card"><label for="pn">Görünen ad (isteğe bağlı)</label><input id="pn" data-i="prof" data-k="name" value="${esc(p.name||'')}" placeholder="${esc(AUTH.cur.username)}"></div>
  <div class="card"><div class="grid2">
    <div><label for="p1">Cinsiyet</label><select id="p1" data-i="prof" data-k="sex"><option value="m" ${p.sex==='m'?'selected':''}>Erkek</option><option value="f" ${p.sex==='f'?'selected':''}>Kadın</option></select></div>
    <div><label for="p2">Yaş</label><input id="p2" data-i="prof" data-k="age" inputmode="numeric" value="${esc(p.age)}"></div>
    <div><label for="p3">Boy (cm)</label><input id="p3" data-i="prof" data-k="height" inputmode="numeric" value="${esc(p.height)}"></div>
    <div><label for="p4">Kilo (kg)</label><input id="p4" data-i="prof" data-k="weight" inputmode="decimal" value="${esc(p.weight)}"></div>
  </div>
  <div style="margin-top:10px"><label for="p5">Aktivite düzeyi</label><select id="p5" data-i="prof" data-k="act">
    ${[['1.2','Masa başı, az hareket'],['1.375','Haftada 1–3 antrenman'],['1.55','Haftada 3–5 antrenman'],['1.725','Haftada 6–7 antrenman']].map(([v,t])=>`<option value="${v}" ${p.act===v?'selected':''}>${t}</option>`).join('')}</select></div>
  <div style="margin-top:10px"><label for="p6">Hedef</label><select id="p6" data-i="prof" data-k="goal"><option value="cut" ${p.goal==='cut'?'selected':''}>Yağ yakmak (kalori açığı)</option><option value="keep" ${p.goal==='keep'?'selected':''}>Kiloyu korumak</option><option value="bulk" ${p.goal==='bulk'?'selected':''}>Kas kazanmak</option></select></div>
  <button class="btn full" style="margin-top:12px" data-a="calc">Hedeflerimi hesapla</button></div>`;
  if(g.kcal){
    h+=`<div class="card"><h3>Günlük hedeflerin</h3><p class="mut small" style="margin:4px 0 10px">Hesap sonucu; istersen elle değiştir. Tahmini günlük harcaman: ${g.tdee} kcal (bazal ${g.bmr}).</p><div class="grid2">
      <div><label for="g1">Kalori (kcal)</label><input id="g1" data-i="goal" data-k="kcal" inputmode="numeric" value="${g.kcal}"></div>
      <div><label for="g2">Protein (g)</label><input id="g2" data-i="goal" data-k="protein" inputmode="numeric" value="${g.protein}"></div>
      <div><label for="g3">Karbonhidrat (g)</label><input id="g3" data-i="goal" data-k="carbs" inputmode="numeric" value="${g.carbs}"></div>
      <div><label for="g4">Yağ (g)</label><input id="g4" data-i="goal" data-k="fat" inputmode="numeric" value="${g.fat}"></div>
      <div><label for="g5">Su (ml)</label><input id="g5" data-i="goal" data-k="water" inputmode="numeric" value="${waterGoal()}"></div></div></div>`;
  }
  return h+`<p class="note">Bu hesaplar genel formüllere dayanır (Mifflin-St Jeor). Sağlık sorunun varsa ya da hedefin agresifse bir doktor/diyetisyene danış.</p>`;
}
function setPrefs(){
  const th=S.prefs.theme||'auto';
  return `<div class="card"><h3>Görünüm</h3><div class="seg" style="margin-top:8px">${[['auto','Otomatik'],['light','Açık'],['dark','Koyu']].map(([k,l])=>`<button data-a="theme" data-v="${k}" class="${th===k?'on':''}">${l}</button>`).join('')}</div></div>
  <div class="card"><h3>Hesaplama</h3>
    ${toggleRow('prec','Hassas mod','Yazıyla hesaplarken ikinci bir adımda sonuçları yeniden denetler; biraz daha yavaş, daha az hata.',!!S.prefs.precise)}
    ${toggleRow('ulw','Üst sınır uyarıları','Vitamin ve mineral güvenli üst sınırı aşılınca uyarı göster.',S.prefs.ulWarn!==false)}</div>
  <div class="card"><h3>Oturum</h3>
    <p class="small mut" style="margin:6px 0 0">Giriş yaparken “oturumu açık tut” seçtiysen bu cihazda 30 gün açık kalır. Kapatmak için Hesap sekmesinden oturumu kapat.</p></div>`;
}
function setData(){
  const nDays=Object.values(S.months).reduce((a,m)=>a+Object.keys(m.days||{}).filter(hasData).length,0);
  let h=`${msgBox()}<div class="card"><div class="small" id="sv2">${statusHtml()}</div>
    <p class="small mut" style="margin:6px 0">${col&&!dbErr?'Verilerin sunucudaki veritabanında hesabına bağlı olarak saklanıyor. Ayrıca bu cihazda da bir kopya tutuluyor; bağlantı kopsa bile kayıt girebilirsin, internet gelince eşitlenir.':'Sunucuya şu an ulaşılamıyor; veriler bu cihazda tutuluyor ve bağlantı gelince otomatik eşitlenecek.'}</p>
    <p class="small mut" style="margin:0 0 10px">${nDays} günlük kayıt · ${S.supps.length} takviye · ${S.lib.length} kayıtlı ürün</p>
    <div class="btnrow"><button class="btn alt sm" data-a="backup">Yedeği indir (JSON)</button><label class="btn alt sm filebtn" style="color:var(--ink)">Yedekten yükle<input type="file" accept=".json,application/json" data-i="import" style="display:none"></label></div></div>`;
  h+=`<div class="card"><h3>Yönetici erişimi</h3><p class="small mut" style="margin:4px 0 6px">Bu sunucunun yöneticisi kayıtlı verilerini (yemek, kilo, takviye) görebilir. Hesabını doğrudan etkileyen işlemler (şifre sıfırlama, veri silme gibi) aşağıda görünür.</p>${V.accessLog?(V.accessLog.length?V.accessLog.slice(0,15).map(x=>`<div class="meal"><div class="grow small"><b>${esc(x.admin)}</b> ${esc(ADM_ACT[x.action]||x.action)}</div><span class="mut small">${fmtTs(x.ts)}</span></div>`).join(''):'<div class="small mut">Gösterilecek işlem yok.</div>'):'<div class="small mut">Yükleniyor…</div>'}</div>`;
  if(S.lib.length)h+=`<div class="card"><h3>Ürünlerim</h3><p class="mut small" style="margin:4px 0 6px">Kaydettiğin doğrulanmış yiyecekler. Yazdığın metinde adı geçerse bu değerler aynen kullanılır.</p>${S.lib.map(x=>`<div class="meal"><div class="grow"><div>${esc(x.name)}</div><div class="mut small">${f1(x.g)} g · ${r0(x.n.kcal||0)} kcal · ${nSummary(x.n)}</div></div><button class="ghost" data-a="ldel" data-id="${x.id}" aria-label="Sil">✕</button></div>`).join('')}</div>`;
  h+=`<div class="card warn"><h3>Tüm verilerimi sil</h3><p class="small" style="margin:6px 0 0">Yemek, su, takviye, profil ve ürün kayıtların silinir; hesabın kalır. Geri alınamaz.</p>
    <form data-f="wipe" autocomplete="off"><div style="margin-top:10px"><label for="wc2">Onaylamak için SİL yaz</label><input id="wc2" name="c" autocapitalize="characters" autocomplete="off" required></div><button class="btn full" style="margin-top:12px;background:var(--bad);color:#fff">Tüm verilerimi sil</button></form></div>`;
  h+=`<p class="note">Referans besin verileri: USDA FoodData Central (kamu malı) ve Open Food Facts (ODbL lisanslı topluluk verisi).</p>`;
  return h;
}
function kcalFor(act){
  const p=S.profile,w=num(p.weight),h=num(p.height),a=num(p.age);
  if(!w||!h||!a)return null;
  const bmr=10*w+6.25*h-5*a+(p.sex==='m'?5:-161),tdee=bmr*act;
  return r0(Math.max(tdee+(p.goal==='cut'?-Math.min(500,tdee*.2):p.goal==='bulk'?300:0),bmr));
}
function setHealth(){
  const url=location.origin+'/api/health-sync',key=V.syncKey,kk=key||'ANAHTARIN';
  const cur=kcalFor(num(S.profile.act)),base=kcalFor(BASE_ACT);
  let h=`${msgBox()}<div class="card"><h3>Apple Sağlık (iPhone)</h3>
    <p class="small mut" style="margin:4px 0 8px">iPhone'daki Sağlık uygulamasında kayıtlı <b>aktif enerji</b> (yürüyüş, kardiyo, antrenman) Bugün ekranındaki <b>🔄 Sağlık'tan çek</b> düğmesine basınca gelir ve o günün kalorisinden düşülür: 2800 kcal yedin, 300 kcal yaktıysan net 2500 kcal sayılır. Safari/ana ekran uygulaması Sağlık verisini doğrudan okuyamadığı için düğme, iPhone'a kurduğun bir kısayolu çalıştırır; kısayol veriyi okuyup buraya gönderir. Kısayolu bir kez kurman gerekir.</p>
    ${HS.enabled?'':`<div class="small" style="margin-bottom:10px;padding:10px 12px;border-radius:12px;background:var(--card2,rgba(127,127,127,.12))"><b>Nereden başlayacağım?</b><br>1) Aşağıdaki <b>Anahtar üret</b> düğmesine bas.<br>2) Çıkan anahtarı kopyala, aşağıdaki <b>Kısayol kurulumu</b> adımlarını iPhone'da uygula.<br>3) Bugün ekranında <b>🔄 Sağlık'tan çek</b> düğmesi belirir.${isIOS()?'':'<br><span class="mut">Not: Kısayol iPhone\'da kurulur; bu sayfayı iPhone\'da da açabilirsin.</span>'}</div>`}
    <div class="small" style="margin-bottom:10px">Durum: ${HS.enabled?`<b style="color:var(--fat)">● Bağlı</b> · son eşitleme ${HS.last?fmtTs(HS.last):'henüz yok'}`:'<b>○ Kurulmadı</b>'}</div>
    <div class="btnrow"><button class="btn sm" data-a="synckey">${HS.enabled?'Yeni anahtar üret':'Anahtar üret'}</button>${HS.enabled?'<button class="btn alt sm" data-a="pullhealth">🔄 Şimdi Sağlık\'tan çek</button>':''}${HS.enabled?'<button class="btn alt sm" data-a="syncoff">Bağlantıyı kapat</button>':''}</div></div>`;
  if(key)h+=`<div class="card" style="border-color:var(--pro)"><h3>Kişisel anahtarın</h3><div class="code num" id="rc" style="word-break:break-all">${esc(key)}</div>
    <p class="small mut">Bir daha gösterilmeyecek; şimdi kısayola yapıştır. Kaybedersen yenisini üret (eskisi iptal olur). Bu anahtarı kimseyle paylaşma.</p>
    <div class="btnrow"><button class="btn alt sm" data-a="copycode">Kopyala</button><button class="btn sm" data-a="synckeyok">Tamam</button></div></div>`;
  h+=`<div class="card"><h3>Hedefim ve yakılan kalori</h3>
    ${toggleRow('burnbase','Hedefi hareketsiz bazdan hesapla','Yakılan kalori ayrıca eklendiği için günlük aktiviteyi hedefe bir kez daha katmamak için önerilir.',!!S.prefs.burnBase)}
    <p class="small mut" style="margin:10px 0 0">${cur===null?'Önce Profil sekmesine yaş, boy ve kilonu gir.':S.prefs.burnBase
      ?`Hareketsiz bazla hedef ≈ <b class="num">${base}</b> kcal (şu an ${S.goals.kcal||cur}). Profil sekmesinde <b>Hedeflerimi hesapla</b>ya basınca uygulanır; elle değiştirdiğin hedefin ezilir. Yakılan kalori günlük bu hedefe eklenir.`
      :`Şu anki aktivite düzeyin (×${S.profile.act}) hedefine zaten günlük hareket payı ekliyor. Yakılan kalori de eklenirse bir kısmı iki kez sayılır; açık seçersen hedef ≈ <b class="num">${base}</b> kcal olur.`}</p></div>
  <div class="card"><h3>Kısayol kurulumu (bir kez, 5 dk)</h3>
    <ol class="small" style="margin:8px 0 0;padding-left:20px;line-height:1.7">
      <li>iPhone'da <b>Kısayollar</b> → <b>Kısayollarım</b> → <b>+</b> ile yeni kısayol oluştur ve adını tam olarak <span class="num">${esc(SC_NAME)}</span> yap.</li>
      <li>Eylem ekle: <b>Sağlık Örneklerini Bul</b> (Find Health Samples). Filtre: Tür = <i>Aktif Enerji</i>, Başlangıç Tarihi = <i>bugün</i>.</li>
      <li>Eylem ekle: <b>İstatistikleri Hesapla</b> → <i>Toplam</i> (girdi: Sağlık Örnekleri).</li>
      <li>Eylem ekle: <b>Tarihi Biçimlendir</b>: Şimdiki Tarih, Özel biçim <span class="num">yyyy-MM-dd</span>.</li>
      <li>Eylem ekle: <b>URL İçeriklerini Al</b>. URL: <span class="num" id="surl" style="word-break:break-all">${esc(url)}</span> <button class="chip" data-a="copyurl" style="margin:0">Kopyala</button><br>Yöntem: <b>POST</b>. Başlıklar: <span class="num">Authorization</span> = <span class="num" style="word-break:break-all">Bearer ${esc(kk)}</span><br>İstek Gövdesi: <b>JSON</b>, iki alan: <span class="num">kcal</span> (Sayı) = <i>İstatistikler</i> sonucu, <span class="num">date</span> (Metin) = <i>Biçimlendirilmiş Tarih</i>.</li>
      <li>Kısayolu kaydet. İlk çalıştırmada iPhone Sağlık verisine ve internete erişim izni isteyecek; izin ver.</li>
      <li>Artık Bugün ekranındaki <b>🔄 Sağlık'tan çek</b> düğmesine basman yeter. Kısayollar uygulaması kısa süre açılır, veriyi gönderir; uygulamaya dönünce yakılan kalori güncellenmiş olur.</li></ol>
    <p class="small mut" style="margin:10px 0 0"><b>Not:</b> Düğme yalnızca iPhone/iPad'de görünür. Safari'de açtıysan iş bitince kendiliğinden geri döner; ana ekrana eklenmiş uygulamada Kısayollar'dan elle geri dönmen gerekebilir. Kısayolu istersen her gece otomatik de çalıştırabilirsin (Kısayollar → Otomasyon → Günün Saati), ama iPhone kilitliyken Sağlık verisi okunamaz; o durumda sunucu gelen 0'ı yok sayar. Apple Sağlık bağlıyken yakılan kalori elle girilemez, yalnızca Sağlık'tan gelir. Elle girmek istersen yukarıdan <b>Bağlantıyı kapat</b>'a bas (kayıtların silinmez).</p></div>`;
  return h;
}
function viewSettings(){
  const tabs=[['account','Hesap'],['profile','Profil'],['health','Sağlık'],['prefs','Tercihler'],['data','Veri']];
  if(AUTH.cur&&AUTH.cur.isAdmin)tabs.push(['admin','Yönetim']);
  const body=V.st==='account'?setAccount():V.st==='prefs'?setPrefs():V.st==='data'?setData():V.st==='health'?setHealth():V.st==='admin'?viewAdmin():setProfile();
  return `<h2 style="margin-top:6px">Ayarlar</h2><div class="seg" style="margin-bottom:12px">${tabs.map(([k,l])=>`<button data-a="sub" data-s="${k}" class="${V.st===k?'on':''}">${l}</button>`).join('')}</div>${body}`;
}

/* ---------- Yönetim paneli (yalnızca yöneticiler) ---------- */
const ADM_ACT={view_data:'verilerini görüntüledi',reset_password:'şifreni sıfırladı',wipe_data:'verilerini sildi',update_user:'hesap ayarlarını değiştirdi',delete_user:'bir hesabı sildi',
  create_invite:'davet kodu üretti',revoke_invite:'davet kodunu iptal etti',restore_invite:'davet kodunu geri açtı',delete_invite:'davet kodunu sildi',update_settings:'sistem ayarlarını değiştirdi',download_backup:'veritabanı yedeğini indirdi'};
const fmtTs=ts=>{if(!ts)return '—';const d=new Date(ts);return d.toLocaleDateString('tr-TR',{day:'numeric',month:'short'})+' '+pad(d.getHours())+':'+pad(d.getMinutes())};
const fmtBytes=n=>n>=1048576?(n/1048576).toFixed(1).replace('.',',')+' MB':n>=1024?r0(n/1024)+' KB':n+' B';
let AV=null;   // yönetici panelinde görüntülenen kullanıcının verisi (salt okunur kopya)
function parseDocs(docs){
  const o={profile:{},goals:{},supps:[],months:{}};
  (docs||[]).forEach(d=>{
    const data=d.data||{};
    if(d.id==='core'){o.profile=data.profile||{};o.goals=data.goals||{};o.supps=data.supps||[]}
    else if(d.id.startsWith('m-')){
      const key=d.id.slice(2).split('.')[0],m=o.months[key]||(o.months[key]={days:{}});
      Object.assign(m.days,data.days||{});
    }
  });
  return o;
}
const avDay=d=>((AV&&AV.months[d.slice(0,7)])||{days:{}}).days[d]||{meals:[]};
function avTotals(d){
  const day=avDay(d),t={},st={};
  NK.forEach(k=>{t[k]=0;st[k]=0});
  (day.meals||[]).forEach(m=>NK.forEach(k=>t[k]+=num(m[k])));
  Object.values(day.sup||{}).forEach(s=>NK.forEach(k=>st[k]+=num((s.n||{})[k])*num(s.c)));
  NK.forEach(k=>t[k]+=st[k]);
  return {t,st,day};
}
const avWater=d=>(avDay(d).water||[]).reduce((a,b)=>a+num(b),0);
const admPwField=id=>`<div style="margin-top:8px"><label for="${id}">Yönetici şifren</label><div class="row" style="gap:4px"><input id="${id}" name="adminPassword" type="password" autocomplete="current-password" required><button type="button" class="ghost" data-a="pwtog" data-t="${id}" aria-label="Göster/gizle">👁</button></div></div>`;
async function admLoad(){
  try{V.adm.data=await api('/admin/overview')}
  catch(e){V.smsg={ok:false,t:errMsg(e)}}
  render();
}
function admDayView(){
  const u=V.adm.ud;
  if(!u)return '<div class="empty">Yükleniyor…</div>';
  const d=V.adm.date,{t,st,day}=avTotals(d),g=AV.goals||{},p=AV.profile||{},meals=day.meals||[];
  const ww=avWater(d),wgoal=g.water||(num(p.weight)?r0(num(p.weight)*35/50)*50:0);
  let h=`<div class="top"><button class="ghost" data-a="admday" data-n="-1" aria-label="Önceki gün">‹</button>
    <div class="d dp"><div>${dlabel(d)} <span class="mut" style="font-weight:400">▾</span></div><div class="mut small" style="font-weight:400">${dfull(d)}</div><input type="date" data-i="admdate" max="${TODAY}" value="${d}" aria-label="Tarih seç"></div>
    <button class="ghost" data-a="admday" data-n="1" aria-label="Sonraki gün" ${d>=TODAY?'disabled style="opacity:.3"':''}>›</button></div>`;
  if(!meals.length&&!ww&&!Object.keys(day.sup||{}).length&&!day.weight)h+=`<div class="empty">${esc(u.username)} bu gün için kayıt girmemiş.</div>`;
  else{
    h+=`<div class="card"><div class="row between"><div><div class="mut small">Yenen</div><div class="num" style="font-size:34px;font-weight:700;line-height:1">${r0(t.kcal)}<span class="mut small"> kcal</span></div></div>
      <div style="text-align:right" class="mut small">${g.kcal?`hedef ${g.kcal} kcal<br>${t.kcal<=g.kcal?'kalan '+r0(g.kcal-t.kcal):'<span style="color:var(--bad)">'+r0(t.kcal-g.kcal)+' fazla</span>'}`:'hedef yok'}</div></div>
      ${g.kcal?`<div class="bar"><i style="width:${Math.min(100,t.kcal/g.kcal*100)}%;background:${t.kcal>g.kcal?'var(--bad)':'var(--kcal)'}"></i></div>`:''}
      <div class="grid3" style="margin-top:12px">${[['Protein',t.protein,g.protein,'var(--pro)'],['Karb.',t.carbs,g.carbs,'var(--carb)'],['Yağ',t.fat,g.fat,'var(--fat)']].map(([n,v,tg,c])=>`<div class="macro"><div class="mut small">${n}</div><div class="v num" style="font-size:20px">${r0(v)}<span class="mut small">${tg?' /'+tg:''}g</span></div>${tg?bar(v/tg*100,c):''}</div>`).join('')}</div>
      <div class="mut small" style="margin-top:10px">💧 ${(ww/1000).toFixed(2).replace('.',',')} L${wgoal?` / ${(wgoal/1000).toFixed(1).replace('.',',')} L`:''}${day.weight?` · ⚖ ${f1(day.weight)} kg`:''}</div></div>`;
    ['Kahvaltı','Öğle','Akşam','Atıştırmalık'].forEach(gn=>{
      const items=meals.filter(m=>m.type===gn);if(!items.length)return;
      h+=`<div class="card"><div class="row between"><h3>${gn}</h3><span class="mut small num">${r0(items.reduce((a,m)=>a+num(m.kcal),0))} kcal</span></div>${items.map(m=>`<div class="meal"><div class="grow"><div>${esc(m.name)}${m.conf==='düşük'?' ⚠':''}</div><div class="mut small">${esc(m.qty||'')} · P ${f1(m.protein)}g K ${f1(m.carbs)}g Y ${f1(m.fat)}g${m.basis?' · '+esc(m.basis):''}</div></div><b class="num">${r0(m.kcal)}</b></div>`).join('')}</div>`;
    });
    const sups=Object.values(day.sup||{});
    if(sups.length)h+=`<div class="card"><h3>Takviyeler</h3>${sups.map(s=>`<div class="meal"><div class="grow">${esc(s.name)}</div><b class="num">${s.c} doz</b></div>`).join('')}</div>`;
    if(g.kcal&&(meals.length||sups.length))h+=`<div class="card"><h3>Vitamin ve mineraller</h3>${nGroups(t,st,nTargets(p,g))}</div>`;
  }
  /* son 14 gün */
  const rows=[];for(let i=0;i<14;i++){const x=addDays(TODAY,-i),tt=avTotals(x);if(tt.day.meals&&tt.day.meals.length||avWater(x))rows.push({d:x,k:tt.t.kcal,p:tt.t.protein,w:avWater(x)})}
  if(rows.length)h+=`<h2>Son günler</h2><div class="card" style="padding:4px 14px">${rows.map(r=>`<div class="hrow" data-a="admpick" data-d="${r.d}" role="button" tabindex="0"><div style="min-width:74px"><b>${dmid(r.d)}</b></div><div class="grow num">${r0(r.k)} kcal · P ${r0(r.p)}g${r.w?` · 💧 ${(r.w/1000).toFixed(1).replace('.',',')} L`:''}</div><span class="mut">›</span></div>`).join('')}</div>`;
  return h;
}
function admUserManage(u){
  return `${V.adm.temp&&V.adm.temp.id===u.id?`<div class="card" style="border-color:var(--pro)"><h3>Geçici şifre</h3><div class="code num" id="rc">${esc(V.adm.temp.pw)}</div><p class="small mut">Bunu ${esc(u.username)} ile güvenli bir yoldan paylaş. Bir daha gösterilmeyecek. İlk girişte yeni şifre belirlemesi istenecek.</p><div class="btnrow"><button class="btn alt sm" data-a="copycode">Kopyala</button><button class="btn sm" data-a="admtempok">Tamam</button></div></div>`:''}
  <div class="card"><h3>Limit ve durum</h3><form data-f="adm_user" autocomplete="off">
    <div style="margin-top:10px"><label for="al">Günlük yapay zekâ limiti (boş = varsayılan ${V.adm.data.settings.aiUserLimit}, 0 = kapalı)</label><input id="al" name="limit" inputmode="numeric" value="${u.aiLimit===null||u.aiLimit===undefined?'':u.aiLimit}"></div>
    <label class="chk" style="margin-top:12px"><input type="checkbox" name="disabled" ${u.disabled?'checked':''}> Hesabı askıya al (giriş yapamaz)</label>
    <label class="chk" style="margin-top:10px"><input type="checkbox" name="isAdmin" ${u.isAdmin?'checked':''}> Yönetici (yönetim paneline erişir)</label>
    <p class="small mut" style="margin:6px 0 0">Yönetici yetkisini değiştirmek için şifreni gir.</p>${admPwField('apw1')}
    <button class="btn full" style="margin-top:12px">Kaydet</button></form></div>
  <div class="card"><h3>Şifreyi sıfırla</h3><p class="small mut" style="margin:4px 0 0">Geçici bir şifre üretir ve açık oturumları kapatır. Kullanıcı ilk girişte kendi şifresini belirler. Mevcut şifreyi göremezsin.</p>
    <form data-f="adm_reset" autocomplete="off">${admPwField('apw2')}<button class="btn alt full" style="margin-top:12px">Geçici şifre üret</button></form></div>
  <div class="card warn"><h3>Tehlikeli işlemler</h3>
    <form data-f="adm_wipe" autocomplete="off"><p class="small" style="margin:6px 0 0">Yemek, su, takviye ve profil verilerini siler; hesap kalır.</p>${admPwField('apw3')}<button class="btn full" style="margin-top:10px;background:var(--bad);color:#fff">Verilerini sil</button></form>
    <form data-f="adm_delete" autocomplete="off" style="margin-top:14px;border-top:1px solid var(--line);padding-top:12px"><p class="small" style="margin:0">Hesabı ve tüm verilerini kalıcı olarak siler. Geri alınamaz.</p>${admPwField('apw4')}<button class="btn full" style="margin-top:10px;background:var(--bad);color:#fff">Hesabı sil</button></form></div>`;
}
function admUsers(){
  const D=V.adm.data;
  if(V.adm.uid){
    const u=D.users.find(x=>x.id===V.adm.uid);
    if(!u){V.adm.uid=null;return admUsers()}
    return `<div class="top"><button class="ghost" data-a="admback" aria-label="Geri">‹</button><div class="d">${esc(u.username)}${u.isAdmin?' · yönetici':''}</div><span style="width:34px"></span></div>
      <div class="seg" style="margin-bottom:12px">${[['day','Günlük'],['manage','Yönet']].map(([k,l])=>`<button data-a="admutab" data-t="${k}" class="${V.adm.uTab===k?'on':''}">${l}</button>`).join('')}</div>
      ${msgBox()}${V.adm.uTab==='day'?admDayView():admUserManage(u)}`;
  }
  return `${msgBox()}<div class="grid3" style="margin-bottom:10px"><div class="card" style="margin:0"><div class="mut small">Kullanıcı</div><div class="num" style="font-size:24px;font-weight:700">${D.stats.users}</div></div>
    <div class="card" style="margin:0"><div class="mut small">Bugün YZ</div><div class="num" style="font-size:24px;font-weight:700">${D.stats.aiToday}<span class="mut small">/${D.settings.aiGlobalLimit}</span></div></div>
    <div class="card" style="margin:0"><div class="mut small">Veri</div><div class="num" style="font-size:24px;font-weight:700">${fmtBytes(D.stats.dbBytes)}</div></div></div>
    ${D.users.map(u=>`<div class="card" data-a="admuser" data-id="${u.id}" style="cursor:pointer"><div class="row"><div class="avatar" style="${u.disabled?'opacity:.4':''}">${esc((u.username[0]||'?').toUpperCase())}</div><div class="grow"><div class="row between"><h3>${esc(u.username)}</h3><span>${u.isAdmin?'<span class="chip on">Yönetici</span>':''}${u.disabled?'<span class="chip" style="color:var(--bad)">Askıda</span>':''}${u.mustChange?'<span class="chip">Şifre bekliyor</span>':''}</span></div>
      <div class="mut small">Son giriş ${fmtTs(u.lastLogin)} · son kayıt ${fmtTs(u.lastActivity)}</div>
      <div class="mut small">YZ bugün <b class="num" style="color:var(--ink)">${u.aiToday}</b>/${u.aiLimit===null||u.aiLimit===undefined?D.settings.aiUserLimit:u.aiLimit} · hafta ${u.aiWeek} · ${fmtBytes(u.bytes)}</div></div><span class="mut">›</span></div></div>`).join('')}`;
}
function admInvites(){
  const D=V.adm.data;
  return `${msgBox()}${V.adm.newInvite?`<div class="card" style="border-color:var(--pro)"><h3>Yeni davet kodu</h3><div class="code num" id="rc">${esc(V.adm.newInvite)}</div><div class="btnrow"><button class="btn alt sm" data-a="copycode">Kopyala</button><button class="btn sm" data-a="admtempok">Tamam</button></div></div>`:''}
  <div class="card"><h3>Davet kodu oluştur</h3><form data-f="adm_invite" autocomplete="off"><div style="margin-top:10px"><label for="il">Etiket (kimin için)</label><input id="il" name="label" placeholder="örn. Cem"></div>
    <div class="grid2" style="margin-top:10px"><div><label for="im">Kaç kişi kullanabilir (0 = sınırsız)</label><input id="im" name="maxUses" inputmode="numeric" value="1"></div><div><label for="id2">Kaç gün geçerli (0 = süresiz)</label><input id="id2" name="expiresDays" inputmode="numeric" value="7"></div></div>
    <button class="btn full" style="margin-top:12px">Kod üret</button></form></div>
  ${D.masterInvite?`<p class="note" style="margin-top:0">Ortam değişkenindeki ana davet kodu (INVITE_CODE) her zaman geçerlidir ve burada gösterilmez.</p>`:''}
  ${D.invites.length?D.invites.map(i=>`<div class="card"><div class="row between"><b class="num">${esc(i.code)}</b><span class="chip" style="${i.status==='geçerli'?'':'color:var(--bad)'}">${esc(i.status)}</span></div>
    <div class="mut small">${esc(i.label||'etiketsiz')} · ${i.uses}${i.maxUses?'/'+i.maxUses:''} kullanım · ${i.expires?'bitiş '+fmtTs(i.expires):'süresiz'}</div>
    <div class="btnrow" style="margin-top:8px"><button class="btn alt sm" data-a="admcopyinv" data-code="${esc(i.code)}">Kopyala</button>${i.status==='iptal'?`<button class="btn alt sm" data-a="admiv" data-op="restore" data-id="${i.id}">Geri aç</button>`:`<button class="btn alt sm" data-a="admiv" data-op="revoke" data-id="${i.id}">İptal et</button>`}<button class="btn alt sm" data-a="admiv" data-op="delete" data-id="${i.id}">Sil</button></div></div>`).join(''):'<div class="empty">Henüz davet kodu üretilmemiş.</div>'}`;
}
function admSystem(){
  const D=V.adm.data,S_=D.settings,sy=D.system;
  const ok=b=>b?'<span style="color:var(--fat)">● tanımlı</span>':'<span style="color:var(--bad)">● yok</span>';
  return `${msgBox()}<div class="card"><h3>Sistem ayarları</h3><form data-f="adm_settings" autocomplete="off">
    <div style="margin-top:10px"><label for="sr">Kayıt modu</label><select id="sr" name="registration">${[['invite','Davet kodu ile'],['closed','Kapalı (kimse kayıt olamaz)'],['open','Herkese açık (önerilmez)']].map(([v,l])=>`<option value="${v}" ${S_.registration===v?'selected':''}>${l}</option>`).join('')}</select></div>
    <div class="grid2" style="margin-top:10px"><div><label for="su">Kişi başı günlük YZ limiti</label><input id="su" name="aiUserLimit" inputmode="numeric" value="${S_.aiUserLimit}"></div><div><label for="sg">Toplam günlük YZ limiti</label><input id="sg" name="aiGlobalLimit" inputmode="numeric" value="${S_.aiGlobalLimit}"></div>
    <div><label for="sm2">En fazla kullanıcı</label><input id="sm2" name="maxUsers" inputmode="numeric" value="${S_.maxUsers}"></div></div>
    <label class="chk" style="margin-top:14px;align-items:flex-start"><input type="checkbox" name="showAccessLog" ${S_.showAccessLog?'checked':''} style="margin-top:2px"><span>Kullanıcılar, verilerine baktığımı kendi ekranlarında görsün <span class="mut small">(kapalıyken yalnızca şifre sıfırlama, veri silme gibi hesabı etkileyen işlemler görünür)</span></span></label>
    <p class="small mut" style="margin:10px 0 0">Kaydı herkese açmak için şifreni gir (diğer değişikliklerde boş bırakabilirsin).</p>${admPwField('apw5').replace(' required','')}
    <button class="btn full" style="margin-top:12px">Kaydet</button></form></div>
  <div class="card"><h3>Yedek</h3><p class="small mut" style="margin:4px 0 8px">Veritabanı günde bir kez otomatik yedeklenir, son 14 yedek saklanır.</p>
    <div class="small">${D.backup&&D.backup.last?`Son yedek: <b>${fmtTs(D.backup.last.at)}</b> · ${fmtBytes(D.backup.last.bytes)} · ${D.backup.count} yedek`:'<span style="color:var(--bad)">Henüz yedek yok</span>'}</div>
    <button class="btn alt sm" style="margin-top:8px" data-a="admbackup">Şimdi yedekle</button></div>
  <div class="card"><h3>Veritabanı yedeği</h3>
    <p class="small mut" style="margin:4px 0 0">Tüm kullanıcıların verilerini içeren tek bir <span class="num">.db</span> dosyası indirir. Şifre özetleri de içindedir; güvenli bir yerde sakla, kimseyle paylaşma. İndirmek şifreni ister ve işlem kayıtlarına yazılır.</p>
    <form data-f="adm_backup" autocomplete="off">${admPwField('apw6')}<button class="btn alt full" style="margin-top:12px">Yedeği indir (.db)</button></form></div>
  <div class="card"><h3>Durum</h3><div class="small" style="line-height:1.9">Gemini anahtarı: ${ok(sy.geminiKey)}<br>OpenRouter anahtarı: ${ok(sy.openrouterKey)}<br>NVIDIA anahtarı: ${ok(sy.nvidiaKey)}<br>Groq anahtarı: ${ok(sy.groqKey)}<br>Cerebras anahtarı: ${ok(sy.cerebrasKey)}<br>Mistral anahtarı: ${ok(sy.mistralKey)}<br>USDA anahtarı: ${ok(sy.usdaKey)}<br>Model zinciri: <span class="num">${esc(sy.chain.join(' → '))}</span><br>Geçerli kayıt modu: <b>${esc(sy.registrationEffective)}</b><br>Önbellek: ${D.stats.aiCache} YZ cevabı · ${D.stats.foodCache} besin araması<br>Veritabanı: ${fmtBytes(D.stats.dbBytes)}<br>Saat dilimi: ${esc(sy.tz)}</div>
    <p class="note">Model zinciri, API anahtarları ve USDA anahtarı Coolify ortam değişkenlerinden değişir; sunucu yeniden başlatılır.</p></div>`;
}
function admLog(){
  const L=V.adm.log;
  if(!L)return '<div class="empty">Yükleniyor…</div>';
  return `<div class="card" style="padding:4px 14px">${L.length?L.map(x=>`<div class="meal" style="align-items:flex-start"><div class="grow"><div><b>${esc(x.admin)}</b>${x.target?` → <b>${esc(x.target)}</b>`:''}</div><div class="small">${esc(ADM_ACT[x.action]||x.action)}${x.detail&&x.action==='delete_user'?' ('+esc(x.detail.username||'')+')':''}</div></div><span class="mut small">${fmtTs(x.ts)}</span></div>`).join(''):'<div class="empty">Kayıt yok.</div>'}</div><p class="note">Yöneticilerin tüm işlemleri burada kayıtlıdır. Kullanıcılar kendi ekranlarında yalnızca hesabı etkileyen işlemleri (şifre sıfırlama, veri silme vb.) görür; “verilerine baktı” kayıtlarını görmeleri Sistem sekmesindeki ayara bağlıdır.</p>`;
}
function viewAdmin(){
  if(!AUTH.cur||!AUTH.cur.isAdmin)return '<div class="empty">Bu bölüm yalnızca yöneticiler içindir.</div>';
  if(!V.adm.data)return '<div class="empty">Yükleniyor…</div>';
  const tabs=[['users','Kullanıcılar'],['invites','Davet'],['system','Sistem'],['log','Kayıt']];
  const body=V.adm.sub==='invites'?admInvites():V.adm.sub==='system'?admSystem():V.adm.sub==='log'?admLog():admUsers();
  return `${V.adm.uid?'':`<div class="seg" style="margin-bottom:12px">${tabs.map(([k,l])=>`<button data-a="admsub" data-s="${k}" class="${V.adm.sub===k?'on':''}">${l}</button>`).join('')}</div>`}${body}`;
}
function viewForce(){
  const err=V.aerr?`<p class="flag" role="alert">⚠ ${esc(V.aerr)}</p>`:'';
  return `<div class="auth"><div style="text-align:center;margin:26px 0 18px"><div style="font-size:46px;line-height:1">🔑</div><h1 style="font-size:24px;margin-top:8px">Yeni şifre belirle</h1><div class="mut small">Yönetici şifreni sıfırladı. Devam etmek için kendi şifreni seç.</div></div>
    <form class="card" data-f="force" autocomplete="off">${pwField('fp1','Yeni şifre (en az 8 karakter)','new-password','n1')}${pwField('fp2','Yeni şifre (tekrar)','new-password','n2')}${err}
    <button class="btn full" style="margin-top:12px" ${V.abusy?'disabled':''}>Şifreyi kaydet</button>
    <div style="text-align:center;margin-top:10px"><button type="button" class="ghost" style="font-size:13px" data-a="logout">Çıkış yap</button></div></form></div>`;
}

/* ---------- ana render ---------- */
/* ---------- sistem durumu ---------- */
const SYS_COL={ok:'var(--fat)',warn:'var(--carb)',down:'var(--bad)',off:'var(--mut)'};
function sysDot(){
  const d=V.sys.data,col=d?(SYS_COL[d.summary]||SYS_COL.off):'var(--mut)';
  return `<button class="sysdot" data-a="sys" aria-label="Sistem durumu" aria-expanded="${V.sys.open}"><i style="background:${col}"></i>${V.sys.busy&&!d?'…':'Sistem'}</button>`;
}
function sysPanel(){
  const d=V.sys.data,lab={ok:'aktif',down:'çalışmıyor',off:'kapalı'};
  return `<div class="card syspanel" role="region" aria-label="Sistem durumu"><div class="row between"><h3>Sistem durumu</h3><button class="ghost" data-a="sys" aria-label="Kapat">✕</button></div>
  ${V.sys.err?`<p class="small" style="color:var(--bad)">${esc(V.sys.err)}</p>`:''}
  ${d?d.items.map(i=>`<div class="srow"><i style="background:${SYS_COL[i.state]||SYS_COL.off}"></i><div class="grow"><div>${esc(i.name)}</div><div class="mut small">${lab[i.state]||i.state}${i.detail&&i.detail!=='çalışıyor'?' · '+esc(i.detail):''}</div></div><span class="ms">${i.ms===null?'—':i.ms+' ms'}</span></div>`).join(''):`<p class="mut small">${V.sys.busy?'Kontrol ediliyor…':'Henüz kontrol edilmedi.'}</p>`}
  ${d&&d.chain&&d.chain.length?`<div class="small mut" style="margin:12px 0 4px">Yapay zekâ sırası</div>${d.chain.map(c=>`<div class="small" style="display:flex;gap:8px;padding:2px 0"><span style="color:${c.state==='hazır'?'var(--fat)':'var(--carb)'}">●</span><span class="grow" style="overflow-wrap:anywhere">${esc(c.model)}${c.image?'':' <span class="mut">(yalnız metin)</span>'}</span><span class="mut">${c.state==='hazır'?'hazır':'bekliyor '+c.seconds+' sn'+(c.reason?' · '+esc(c.reason):'')}</span></div>`).join('')}`:''}
  <div class="row between" style="margin-top:10px"><span class="mut small">${d?'Son kontrol '+pad(new Date(d.at).getHours())+':'+pad(new Date(d.at).getMinutes())+':'+pad(new Date(d.at).getSeconds()):''}</span><button class="btn alt sm" data-a="sysrefresh" ${V.sys.busy?'disabled':''}>${V.sys.busy?'…':'Yenile'}</button></div>
  <p class="note" style="margin:8px 0 0">Süreler bu sunucudan ölçülür; yapay zekâ kotası harcanmaz. "Aktif" servisin cevap verdiğini gösterir, modelin kotasının dolmadığını garanti etmez.</p></div>`;
}
async function loadSys(force){
  if(V.sys.busy)return;
  if(!force&&V.sys.data&&Date.now()-V.sys.data.at<20000)return;
  V.sys.busy=true;V.sys.err='';render();
  try{V.sys.data=await api('/status')}catch(e){V.sys.err=errMsg(e)}
  V.sys.busy=false;render();
}
function render(){
  const app=document.getElementById('app');
  if(!AUTH.cur||AUTH.cur.mustChange){app.innerHTML=viewAuth();return}
  const views={today:viewToday,supp:viewSupp,hist:viewHistory,stats:viewStats,settings:viewSettings};
  const tabs=[['today','🍽','Bugün'],['supp','💊','Takviye'],['hist','🗓','Geçmiş'],['stats','📈','Analiz'],['settings','⚙️','Ayarlar']];
  app.innerHTML=`<div class="svw"><span class="small mut">👤 ${esc(S.profile.name||AUTH.cur.username)}</span><div class="row" style="gap:8px;margin:0"><div class="sv" id="sv">${statusHtml()}</div>${sysDot()}</div></div>`+(V.sys.open?sysPanel():'')+(views[V.tab]||viewToday)()+`<nav class="tabs" aria-label="Sekmeler"><div>${tabs.map(([k,i,t])=>`<button data-a="tab" data-t="${k}" class="${V.tab===k?'on':''}" ${V.tab===k?'aria-current="page"':''}><span>${i}</span>${t}</button>`).join('')}</div></nav>`;
  document.querySelectorAll('.seg button.on').forEach(b=>{try{b.scrollIntoView({block:'nearest',inline:'center'})}catch(e){}});
}

/* ---------- takviye istemleri ---------- */
const CONV='D vitamini IU→mcg (IU÷40), A vitamini IU→mcg RAE (retinol için IU×0,3; beta-karoten için IU×0,15 ya da etikette RAE yazıyorsa onu kullan), E vitamini IU→mg (doğal d-alfa tokoferol için ×0,67; sentetik dl-alfa için ×0,45), folat mcg DFE (folik asit ×1,7; metilfolat/folat mcg DFE yazıyorsa aynen), niasin mg NE, K vitamini mcg, B12 mcg, biyotin mcg, omega-3 gram (EPA+DHA+ALA toplamı; balık yağı kapsülünde toplam yağ değil omega-3 miktarı), mg↔mcg dikkatli çevir (1 mg = 1000 mcg). Etkin elementi al: "Magnezyum sitrat 500 mg" gibi bir ifadede elemental magnezyum miktarı farklıdır, etikette elemental miktar yazıyorsa onu kullan.';
function suppPrompt(txt,nImg){
  const img=nImg?`\nEkte ürün etiketi fotoğraf(lar)ı var. Değerleri etiketten OKU: "Serving size / Önerilen kullanım / Porsiyon" satırındaki miktar için yazan değerleri al. Yalnızca yüzde (%NRV / %DV) yazıyor ve miktar yoksa AB NRV ya da ABD DV referansıyla miktara çevir. Bu durumda basis="etiket", conf="yüksek" yaz. Okuyamadığın veya görünmeyen değeri uydurma: null bırak ve note'ta belirt. Etiketteki porsiyon, kullanıcının aldığı dozdan farklıysa (örn. etiket 2 kapsül, kullanıcı 1 kapsül yazdı) kullanıcının aldığı doza göre orantıla.\n`:'';
  return `Sen takviye ürünleri (vitamin, mineral, protein tozu, omega-3, kreatin, gummy, şurup vb.) konusunda uzman bir eczacı ve diyetisyensin. Kullanıcı bir veya birden fazla ürün yazdı${nImg?' ve etiket fotoğrafı ekledi':''}. Her ürün için bir "doz" (kullanıcının bir defada aldığı miktar: 1 tablet, 2 kapsül, 1 ölçek vb.) başına içerikleri ver.

Kurallar:
1. Kullanıcı rakam yazdıysa (örn. "D3 2000 IU") aynen kullan.${img}
2. Etiket yoksa ürünü adından ve markasından tanı: marka, ürün serisi, ülke formülasyonu (Türkiye/ABD/AB) farkını düşün. İçeriğinden emin olduğun ürünlerde bilinen etiket değerlerini kullan (basis="ürün bilgisi", conf="yüksek" ya da "orta"). Tam tanıyamıyorsan benzer tipik ürünün değerleriyle tahmin et, basis="tahmin", conf="düşük" yap ve note'ta neyin belirsiz olduğunu yaz (örn. "Formülasyon ülkeye göre değişir; etiketi doğrula"). Asla uydurma kesinlik gösterme.
3. Birim dönüşümleri: ${CONV}
4. Kalori, protein, karbonhidrat, yağ, şeker, lif gibi makro değerleri de ver (protein tozu, gummy, şurup, balık yağı için önemli). Tablet/kapsüllerde ihmal edilebilir değerleri 0 yaz.
5. Aşağıdaki anahtarlarda olmayan etken maddeleri (kreatin, kafein, BCAA, L-karnitin, koenzim Q10, glutamin, kolajen peptid, probiyotik CFU, bitki özleri vb.) "other" listesine yaz: {"n":"Kreatin monohidrat","v":5,"u":"g"}.
6. Bilmediğin değer null, ürün içermiyorsa 0.
7. İç tutarlılık: kcal ≈ 4×protein + 4×karbonhidrat + 9×yağ; sat+mono+poly ≤ fat; sugar ≤ carbs.
Anahtarlar ve birimler: ${KEYDOC}.
Sadece JSON döndür: {"items":[{"name":"marka + ürün adı","dose":"1 kapsül","conf":"yüksek|orta|düşük","basis":"etiket|ürün bilgisi|tahmin","note":"","n":{"vitD":25},"other":[{"n":"","v":0,"u":""}]}]}

Yazılan: ${txt||'(yazı yok, etiket fotoğrafına bak)'}`;
}
function suppAudit(txt,items){
  return `Sen bağımsız bir takviye içerik denetçisisin. Aşağıda kullanıcının yazdığı metin ve bir asistanın çıkardığı JSON var. Her ürünü kontrol et; hatalıysa DÜZELT:
(1) Ürün doğru tanındı mı? Marka/seri/formülasyon belirsizse conf'u "düşük" yap; kesin bilmediğin değeri null yap ve note'a yaz.
(2) Birimler: ${CONV}
(3) Doz: değerler kullanıcının aldığı bir doz için mi (günlük toplam ya da şişe toplamı değil mi)?
(4) Makul aralıklar: tek dozda olağandışı yüksek vitamin/mineral değeri genellikle birim hatasıdır (IU↔mcg, mg↔mcg).
(5) Kullanıcının yazdığı rakamlar korunmuş mu?
Emin olmadığın değeri değiştirme. Aynı şemayla düzeltilmiş JSON döndür ve "changes" dizisine kısa Türkçe notlar ekle (değişiklik yoksa boş dizi): {"items":[{"name":"","dose":"","conf":"","basis":"","note":"","n":{},"other":[]}],"changes":["D3: 1000 IU = 25 mcg olarak düzeltildi"]}

Kullanıcı yazısı: ${txt}
Asistanın JSON'u: ${JSON.stringify({items})}`;
}
function toPreviewSupp(i){
  const label=i.basis==='etiket';
  const c=clean(i.n||{},label);
  const other=(Array.isArray(i.other)?i.other:[]).filter(o=>o&&o.n&&num(o.v)>0).map(o=>({n:String(o.n),v:r2(num(o.v)),u:String(o.u||'')}));
  return {name:String(i.name),dose:String(i.dose||'1 doz'),conf:i.conf||'orta',basis:i.basis||'',note:String(i.note||''),flags:c.flags,n:c.n,other};
}

/* ---------- yedek mod: yapay zekâ yokken yerel besin tablosu ---------- */
async function offlineFallback(txt,err,nImg){
  if(!txt||!err||['network','unauthorized','bad_request'].includes(err.code))return null;
  V.busyMsg='Yapay zekâ yanıt vermedi, yerel besin tablosu deneniyor…';render();
  let r;try{r=await api('/offline-estimate',{method:'POST',body:{text:txt}})}catch(e){return null}
  if(!r||!r.items||!r.items.length){
    V.err=`Yapay zekâ şu an yanıt vermiyor ve yazdıkların yerel besin tablosunda bulunamadı${r&&r.unmatched&&r.unmatched.length?' ('+r.unmatched.join(', ')+')':''}. Yiyeceği elle girebilirsin.`;
    return null;
  }
  const notes=['Yapay zekâ şu an yanıt vermediği için yazdıklarını yerel besin tablosundan (USDA) YAKLAŞIK hesapladım. Porsiyonlar varsayımdır; miktarı düzeltmeyi unutma.'];
  if(r.unmatched&&r.unmatched.length)notes.push('Tabloda bulunamadı, listeye eklenmedi: '+r.unmatched.join(', ')+'. Bunları elle ekleyebilirsin.');
  if(nImg)notes.push('Bu modda fotoğraflar kullanılamaz; yalnızca yazdıkların hesaplandı.');
  return {items:r.items.map(i=>({...i,basis:'USDA'})),notes};
}

/* ---------- eylemler ---------- */
const A={
  tab(ds){V.tab=ds.t;if(ds.st)V.st=ds.st;V.undo=null;window.scrollTo(0,0);render()},
  day(ds){const n=addDays(V.date,+ds.n);if(n>TODAY)return;V.date=n;V.preview=null;V.err='';V.edit=null;V.undo=null;render()},
  open(ds){V.date=ds.d;V.tab='today';V.preview=null;V.edit=null;V.undo=null;window.scrollTo(0,0);render()},
  hmore(){V.hmore=true;render()},
  async admbackup(){try{await api('/admin/backup-now',{method:'POST'});V.adm.data=await api('/admin/overview');V.smsg={ok:true,t:'Yedek alındı.'}}catch(e){V.smsg={ok:false,t:errMsg(e)}}render()},
  sys(){V.sys.open=!V.sys.open;render();if(V.sys.open)loadSys(false)}, // önce paneli çiz, veri bayatsa arkadan yenile
  sysrefresh(){loadSys(true)},
  range(ds){V.range=+ds.n;render()},
  gtog(ds){V.og[ds.g]=!V.og[ds.g];render()},
  prec(){S.prefs.precise=!S.prefs.precise;persist('core');render()},
  calc(){if(!calcGoals()){alert('Yaş, boy ve kiloyu doldur.');return}render()},
  imgdel(ds){const l=V[ds.k],x=l[+ds.ix];if(x){try{URL.revokeObjectURL(x.url)}catch(e){}l.splice(+ds.ix,1)}render()},
  /* yemek */
  async analyze(){
    const txt=V.food.trim(),imgs=V.fimgs.map(x=>x.blob);
    const labelImgs=V.fimgs.filter(x=>x.kind!=='meal').map(x=>x.blob),mealImgs=V.fimgs.filter(x=>x.kind==='meal').map(x=>x.blob);
    if((!txt&&!imgs.length)||V.busy)return;
    V.busy=true;V.err='';V.busyMsg='Hesaplanıyor…';render();
    try{
      // Görselli işlerde (özellikle yemek fotoğrafı) en güçlü model zinciri kullanılır
      const ver=libMatches(txt),opts={modelTier:mealImgs.length?'complex':'default'};
      if(imgs.length)opts.images=imgs;
      const r=await askJson(foodPrompt(txt,ver,labelImgs.length,mealImgs.length),opts);
      let items=(r.items||[]).filter(i=>i&&i.name),notes=[];
      if(!items.length)throw {message:'Yiyecek bulamadım, biraz daha açık yazar mısın?'};
      // 2) referans veritabanı: USDA (genel besinler) / Open Food Facts (markalı, barkodlu)
      let res=[];
      const cfg=AUTH.config.ref||{};
      if(!labelImgs.length&&(cfg.usda||cfg.off)){ // etiket okunduysa o değerler esas; yemek fotoğrafında referans doğrulama yapılır
        V.busyMsg='Referans veritabanı kontrol ediliyor…';render();
        try{
          const lr=await api('/lookup',{method:'POST',body:{items:items.map((it,i)=>({ix:i,name:it.name,search:it.search||null,brand:it.brand||null,barcode:it.barcode||null,
            ai:it.per100?{kcal:it.per100.kcal,protein:it.per100.protein,carbs:it.per100.carbs,fat:it.per100.fat}:null}))}});
          res=lr.results||[];
        }catch(e){if(e&&e.code==='unauthorized')throw e;notes.push('Referans veritabanına ulaşılamadı; yapay zekâ tahmini gösteriliyor.')}
      }
      items=items.map((it,i)=>withRef(it,res.find(x=>x.ix===i)));
      // 3) denetim: yalnızca referansla doğrulanamayan kalemler için
      const need=items.map((it,i)=>i).filter(i=>!(items[i].ref&&items[i].useRef));
      if(S.prefs.precise&&!labelImgs.length&&(txt||mealImgs.length)&&need.length){
        V.busyMsg='Doğrulanıyor…';render();
        try{
          const sub=need.map(i=>{const it=items[i];return {name:it.name,qty:it.qty,g:it.g,gLow:it.gLow,gHigh:it.gHigh,conf:it.conf,basis:it.basis,note:it.note,per100:it.per100}});
          const r2=await askJson(auditPrompt(txt,sub,ver,mealImgs.length),mealImgs.length?{modelTier:'complex',images:mealImgs}:{modelTier:'default'});
          const it2=(r2.items||[]).filter(i=>i&&i.name);
          if(it2.length===sub.length){
            need.forEach((ix,k)=>{items[ix]={...items[ix],...it2[k],ai:it2[k].per100||items[ix].ai}});
            if(Array.isArray(r2.changes))notes.push(...r2.changes.map(String));
          }else notes.push('Doğrulama farklı sayıda kalem döndürdü; ilk hesap korundu.');
        }catch(e){notes.push('Doğrulama adımı tamamlanamadı; ilk hesap gösteriliyor.')}
      }
      V.preview=items.map(toPreviewFood);V.pnotes=notes;
    }catch(e){
      // Yapay zekâ çalışmıyorsa: yazılan metni yerel besin tablosundan (USDA kopyası) yaklaşık hesapla
      const fb=await offlineFallback(txt,e,imgs.length);
      if(fb){V.preview=fb.items.map(toPreviewFood);V.pnotes=fb.notes;V.err=''}
      else V.err=V.err||errMsg(e);
    }
    V.busy=false;render();
  },
  palt(ds){
    const it=V.preview&&V.preview[+ds.ix];if(!it||!it.ref)return;
    V.preview[+ds.ix]=toPreviewFood({...it.raw,g:it.g,useRef:!it.useRef});render();
  },
  bcopen(){V.bc.open=!V.bc.open;V.bc.err='';render()},
  async bcsearch(){
    const code=String(V.bc.code||'').replace(/\D/g,'');
    if(code.length<8||code.length>14){V.bc.err='Barkod 8-14 haneli bir sayı olmalı.';render();return}
    V.bc.busy=true;V.bc.err='';render();
    try{
      const r=await api('/barcode/'+code);
      V.preview=[barcodeItem(r.product)];V.pnotes=[];V.bc.open=false;V.bc.code='';
    }catch(e){V.bc.err=errMsg(e)}
    V.bc.busy=false;render();
  },
  bcscan(){return scanBarcode()},
  async bcfromfile(f){
    V.bc.err='';V.bc.busy=true;render();
    try{
      const code=await barcodeFromFile(f);
      if(!code){V.bc.err='Fotoğrafta geçerli bir barkod okunamadı. Barkodu net, düz ve yakın çek; ya da numarayı elle yaz.';V.bc.busy=false;render();return}
      V.bc.code=code;V.bc.busy=false;await A.bcsearch();return;
    }catch(e){V.bc.err=errMsg(e)}
    V.bc.busy=false;render();
  },
  async cam(ds){
    const kind=ds.kind==='meal'?'meal':'label';
    if(V.fimgs.length>=Math.min(4,imgMax()))return;
    const hint=kind==='meal'?'Tabağı üstten çek: tüm yemek ve yanında çatal/kaşık/bardak görünsün':'Besin değerleri tablosunu düz, net ve yakın çek';
    const f=await cameraCapture(hint);
    if(f)await addImgs('fimgs',[f],kind);
  },
  pdel(ds){V.preview.splice(+ds.ix,1);if(!V.preview.length)V.preview=null;render()},
  pcancel(){V.preview=null;V.pnotes=[];render()},
  plib(ds){
    const it=V.preview[+ds.ix];if(!it||it.saved)return;
    const key=it.name.trim().toLowerCase(),ex=S.lib.findIndex(x=>x.name.trim().toLowerCase()===key);
    const rec={id:'l'+Date.now(),name:it.name,g:it.g,n:clone(it.n)};
    if(ex>=0)S.lib[ex]=rec;else S.lib.unshift(rec);
    it.saved=true;persist('core');render();
  },
  padd(){
    const day=getDay(V.date);
    V.preview.forEach(i=>{
      const m={v:2,type:V.mealType,name:i.name,qty:i.qty?`${i.qty} (${f1(i.g)} g)`:`${f1(i.g)} g`,g:i.g,conf:i.conf,basis:i.basis,...i.n};
      day.meals.push(m);
    });
    V.preview=null;V.pnotes=[];V.food='';V.fimgs.forEach(x=>{try{URL.revokeObjectURL(x.url)}catch(e){}});V.fimgs=[];V.undo=null;save(V.date);render();
  },
  ladd(ds){const x=S.lib.find(l=>l.id===ds.id);if(!x)return;getDay(V.date).meals.push({v:2,type:V.mealType,name:x.name,qty:`${f1(x.g)} g`,g:x.g,conf:'yüksek',basis:'kayıtlı ürün',...clone(x.n)});save(V.date);render()},
  ldel(ds){S.lib=S.lib.filter(l=>l.id!==ds.id);persist('core');render()},
  qadd(ds){const it=freqFoods()[+ds.ix];if(!it)return;getDay(V.date).meals.push({...clone(it.it),type:V.mealType});save(V.date);render()},
  medit(ds){V.edit=V.edit===+ds.ix?null:+ds.ix;render()},
  mdone(){V.edit=null;render()},
  mdel(ds){const d=getDay(V.date),ix=+ds.ix,m=d.meals[ix];if(!m)return;d.meals.splice(ix,1);V.undo={d:V.date,ix,m};V.edit=null;save(V.date);render()},
  mundo(){const u=V.undo;if(!u)return;const d=getDay(u.d);d.meals.splice(Math.min(u.ix,d.meals.length),0,u.m);V.undo=null;save(u.d);render()},
  /* su */
  wadd(ds){const d=getDay(V.date);(d.water=d.water||[]).push(+ds.v);save(V.date);render()},
  wcustom(){const el=document.getElementById('wc'),v=num(el&&el.value);if(v<=0||v>5000){toast('Su miktarını 1-5000 ml arasında gir.');return}const d=getDay(V.date);(d.water=d.water||[]).push(r0(v));save(V.date);render()},
  /* antrenman */
  liftyes(){getDay(V.date).lift={ex:[]};save(V.date);render();setTimeout(()=>{const el=document.getElementById('exnew');if(el)el.focus()},50)},
  liftrest(){getDay(V.date).lift={rest:true};save(V.date);render()},
  liftreset(){
    const L=liftOf(V.date);
    if(L&&(L.ex||[]).length&&!confirm('Bu günün antrenman kaydı silinsin mi?'))return;
    delete getDay(V.date).lift;save(V.date);render();
  },
  exadd(){
    const el=document.getElementById('exnew'),n=String(el&&el.value||'').trim().replace(/\s+/g,' ').slice(0,40);
    if(!n){toast('Hareket adını yaz.',true);return}
    const d=getDay(V.date);if(!d.lift||!Array.isArray(d.lift.ex))d.lift={ex:[]};
    if(d.lift.ex.some(e=>normEx(e.n)===normEx(n))){toast('Bu hareket bugün zaten ekli.',true);return}
    const known=liftHistory()[normEx(n)];
    d.lift.ex.push({n:known?known.name:n,s:[{w:'',r:''}]});save(V.date);render();
    const i=d.lift.ex.length-1;
    setTimeout(()=>{const f=document.querySelector(`[data-i="lw"][data-e="${i}"][data-j="0"]`);if(f)f.focus()},50);
  },
  exdel(ds){
    const L=liftOf(V.date),e=L&&L.ex&&L.ex[+ds.e];if(!e)return;
    if((e.s||[]).some(x=>num(x.r)>0)&&!confirm(e.n+' hareketi silinsin mi?'))return;
    L.ex.splice(+ds.e,1);save(V.date);render();
  },
  setadd(ds){
    const L=liftOf(V.date),e=L&&L.ex&&L.ex[+ds.e];if(!e)return;
    const last=(e.s||[])[(e.s||[]).length-1];
    (e.s=e.s||[]).push({w:last?last.w:'',r:''});save(V.date);render();
    setTimeout(()=>{const f=document.querySelector(`[data-i="lr"][data-e="${ds.e}"][data-j="${e.s.length-1}"]`);if(f)f.focus()},50);
  },
  setdel(ds){
    const L=liftOf(V.date),e=L&&L.ex&&L.ex[+ds.e];if(!e||!e.s)return;
    e.s.splice(+ds.j,1);save(V.date);render();
  },
  copylast(ds){
    const L=liftOf(V.date),e=L&&L.ex&&L.ex[+ds.e];if(!e)return;
    const h=liftHistory()[normEx(e.n)],before=h?h.s.filter(q=>q.d<V.date):[],prev=before[before.length-1];
    if(!prev)return;
    e.s=prev.sets.map(x=>({w:x.w||'',r:x.r}));save(V.date);render();
  },
  liftsel(ds){V.liftSel=ds.k;render()},
  wundo(){const d=getDay(V.date);if(d.water&&d.water.length){d.water.pop();save(V.date);render()}},
  /* takviye */
  stk(ds){
    const d=getDay(V.date),s=S.supps.find(x=>x.id===ds.id);if(!s)return;
    d.sup=d.sup||{};const cur=d.sup[ds.id];
    if(ds.op==='inc'){if(cur)cur.c++;else d.sup[ds.id]={name:s.name,c:1,n:clone(s.n||{}),other:clone(s.other||[])}}
    else if(cur){cur.c--;if(cur.c<=0)delete d.sup[ds.id]}
    save(V.date);render();
  },
  async sparse(){
    const txt=V.stext.trim(),imgs=V.simgs.map(x=>x.blob);
    if((!txt&&!imgs.length)||V.sbusy)return;
    V.sbusy=true;V.serr='';V.busyMsg='Hesaplanıyor…';render();
    try{
      const opts={modelTier:'default'};if(imgs.length)opts.images=imgs;
      const r=await askJson(suppPrompt(txt,imgs.length),opts);
      let items=(r.items||[]).filter(i=>i&&i.name),notes=[];
      if(!items.length)throw {message:'Takviyeyi anlayamadım, adını ve dozunu biraz daha açık yaz.'};
      if(S.prefs.precise&&!imgs.length&&txt){
        V.busyMsg='Doğrulanıyor (2/2)…';render();
        try{
          const r2=await askJson(suppAudit(txt,items),{modelTier:'default'});
          const it2=(r2.items||[]).filter(i=>i&&i.name);
          if(it2.length){items=it2;notes=Array.isArray(r2.changes)?r2.changes.map(String):[]}
        }catch(e){notes=['Doğrulama adımı tamamlanamadı; ilk hesap gösteriliyor.']}
      }
      V.spreview=items.map(toPreviewSupp);V.snotes=notes;
    }catch(e){V.serr=errMsg(e)}
    V.sbusy=false;render();
  },
  spdel(ds){V.spreview.splice(+ds.ix,1);if(!V.spreview.length)V.spreview=null;render()},
  spcancel(){V.spreview=null;V.snotes=[];render()},
  spadd(){
    V.spreview.forEach((s,i)=>S.supps.push({id:'s'+Date.now()+i,name:s.name,dose:s.dose,conf:s.conf,basis:s.basis,note:s.note,n:s.n,other:s.other}));
    V.spreview=null;V.snotes=[];V.stext='';V.simgs.forEach(x=>{try{URL.revokeObjectURL(x.url)}catch(e){}});V.simgs=[];persist('core');render();
  },
  sedit(ds){V.sedit=V.sedit===ds.id?null:ds.id;render()},
  sdel(ds){if(!confirm('Takviye listeden silinsin mi? Geçmiş günlerdeki kayıtların korunur.'))return;S.supps=S.supps.filter(s=>s.id!==ds.id);persist('core');render()},
  soadd(ds){const s=S.supps.find(x=>x.id===ds.id);if(!s)return;(s.other=s.other||[]).push({n:'',v:'',u:'mg'});persist('core');render()},
  sodel(ds){const s=S.supps.find(x=>x.id===ds.id);if(!s||!s.other)return;s.other.splice(+ds.ix,1);persist('core');render()},
  /* koç */
  async coach(){
    if(V.coachBusy)return;V.coachBusy=true;V.coach='';render();
    const g=S.goals,days=[];
    for(let i=13;i>=0;i--){
      const d=addDays(TODAY,-i),t=totals(d),dd=getDayRO(d);
      if((dd.meals||[]).length||dd.weight||waterSum(d)||dd.lift){const o={tarih:d,kilo:dd.weight||null,su_ml:waterSum(d),takviyeler:Object.values(dd.sup||{}).map(s=>s.name+' x'+s.c)};if(burnOf(d))o.yakilan_aktif_kcal=r0(burnOf(d));if(dd.lift)o.antrenman=dd.lift.rest?'dinlenme':(dd.lift.ex||[]).map(e=>e.n+': '+(e.s||[]).filter(x=>num(x.r)>0).map(x=>(num(x.w)||'BW')+'x'+num(x.r)).join(', '));NK.forEach(k=>{if(t[k])o[k]=r1(t[k])});const st=suppTotals(d);o.takviyeden=Object.fromEntries(NK.map(k=>[k,r1(st[k])]).filter(([,v])=>v>0));days.push(o)}
    }
    const snap=statsSnapshot();
    try{
      V.coach=await ask(`Sen samimi ama dürüst, bilimsel bilgisi güçlü bir beslenme koçusun. Aşağıdaki son 14 günlük verileri analiz et ve Türkçe yaz.\n\nProfil: ${JSON.stringify(S.profile)}\nGünlük hedefler: ${JSON.stringify(g)} (yakilan_aktif_kcal varsa o gün Apple Sağlık/elle girilen aktif enerjidir; kalori hedefi yenenden bu miktar düşülerek, yani net kaloriyle karşılaştırılır)\nBesin referans değerleri: ${JSON.stringify(nTargets())}\nGünlük kayıtlar (besin değerleri yiyecek + takviye toplamıdır; anahtarlar ve birimler: ${KEYDOC}; yazılmayan anahtar 0 demektir; "takviyeden" alanı sadece takviyelerin katkısı; "antrenman" alanı o günkü ağırlık antrenmanıdır, hareket: kilo x tekrar biçiminde, BW = vücut ağırlığı, "dinlenme" = dinlenme günü): ${JSON.stringify(days)}\nKilo trendi (kg/hafta, son 28 gün): ${snap.tr?r1(snap.tr.perWeek):'yok'}. Tahmini gerçek günlük harcama: ${snap.real?r0(snap.real):'hesaplanamadı'}. Su hedefi: ${waterGoal()} ml.\n\nŞu başlıklarla yaz: BESLENME (kalori, protein ve makro uyumu; yağ kalitesi, lif, şeker, sodyum), VİTAMİN VE MİNERALLER (takviyeler dahil hangileri eksik kalıyor, hangileri fazla veya üst sınıra yakın; takviye gerçekten gerekli mi yoksa yiyeceklerle mi kapanır), SU VE KİLO (su alışkanlığı, kilo trendi ve kalori açığı hedefle uyumlu mu, sürdürülebilir mi), ANTRENMAN (yalnızca antrenman verisi varsa: hangi hareketlerde güçlendiği, hangilerinin durağan kaldığı, set/tekrar dengesi; yoksa bu başlığı yazma), ÖNÜMÜZDEKİ HAFTA İÇİN 4 NET ADIM. Veri azsa ya da eksikse bunu açıkça söyle, uydurma; sayılara dayan. Besin değerlerinin yapay zekâ tahmini olduğunu ve eksik kayıt mikro besinleri düşük gösterebileceğini hesaba kat. Markdown işaretleri kullanma, başlıkları BÜYÜK HARFLE yaz, düz metin olsun, en fazla 320 kelime. Tıbbi teşhis koyma; takviye dozu üst sınıra yakınsa ya da olağandışı bir durum görürsen doktor/eczacıya danışmasını söyle.`,{modelTier:'complex',cache:false},false);
    }catch(e){V.coach=(V.coach?V.coach+'\n\n':'')+errMsg(e)}
    V.coachBusy=false;render();
  },
  /* yedek */
  async backup(){
    try{
      const blob=new Blob([JSON.stringify(S)],{type:'application/json'}),a=document.createElement('a');
      a.href=URL.createObjectURL(blob);a.download='spor-hocam-yedek-'+TODAY+'.json';
      document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(a.href),3000);
    }catch(e){alert(errMsg(e))}
  }
};
Object.assign(A,{
  async sub(ds){
    V.st=ds.s;V.smsg=null;V.newCode=null;V.syncKey=null;window.scrollTo(0,0);render();
    if(ds.s==='health'){await loadBurn();render()}
    if(ds.s==='admin'&&!V.adm.data)await admLoad();
    if(ds.s==='data'){try{V.accessLog=(await api('/account/access-log')).log}catch(e){V.accessLog=null}render()}
  },
  am(ds){V.am=ds.m;V.aerr='';render()},
  pwtog(ds){const el=document.getElementById(ds.t);if(el)el.type=el.type==='password'?'text':'password'},
  async copycode(){
    const el=document.getElementById('rc');
    try{await navigator.clipboard.writeText(el?el.textContent:'');toast('Kod kopyalandı.')}catch(e){toast('Kopyalanamadı; kodu elle not al.')}
  },
  async codego(){
    const p=V.pending;if(!p)return;
    if(p.next==='enter'){await enterApp(p.user)}
    else{V.am='login';V.pending=null}
    render();
  },
  codeok(){V.newCode=null;render()},
  async logout(){await leaveApp();render()},
  async retryboot(){await boot()},
  pullhealth(){
    if(!HS.enabled){toast('Önce Ayarlar → Sağlık bölümünden bağlantıyı kur.',true);return}
    if(!isIOS()){toast('Bu düğme iPhone\'da çalışır: Kısayollar uygulaması gerekir.',true);return}
    pullAt=Date.now();
    let u='shortcuts://run-shortcut?name='+encodeURIComponent(SC_NAME);
    // Tarayıcıdan açıldıysa iş bitince geri dön; ana ekrandaki uygulamada https adresi Safari'yi açacağı için eklenmez
    if(!(window.matchMedia&&matchMedia('(display-mode: standalone)').matches)&&!navigator.standalone){const back=encodeURIComponent(location.origin+'/');u+='&x-success='+back+'&x-cancel='+back+'&x-error='+back}
    location.href=u;
  },
  burnedit(){V.burnEdit=!V.burnEdit;render()},
  async burndel(){
    try{const r=await api('/burn',{method:'POST',body:{date:V.date,kcal:null}});HB=r.days||{};V.burnEdit=false}catch(e){toast(errMsg(e))}
    render();
  },
  burnbase(){S.prefs.burnBase=!S.prefs.burnBase;persist('core');render()},
  async synckey(){
    if(HS.enabled&&!confirm('Yeni anahtar üretilince eski anahtar çalışmaz; kısayolundaki anahtarı güncellemen gerekir. Devam edilsin mi?'))return;
    try{const r=await api('/sync-key',{method:'POST',body:{}});V.syncKey=r.key;HS.enabled=true;V.smsg=null}catch(e){V.smsg={ok:false,t:errMsg(e)}}
    render();
  },
  synckeyok(){V.syncKey=null;render()},
  async syncoff(){
    if(!confirm('Apple Sağlık bağlantısı kapatılsın mı? Kısayolun veri gönderemez. Mevcut kayıtların silinmez.'))return;
    try{await api('/sync-key/revoke',{method:'POST',body:{}});HS.enabled=false;V.syncKey=null;V.smsg=null}catch(e){V.smsg={ok:false,t:errMsg(e)}}
    render();
  },
  async copyurl(){try{await navigator.clipboard.writeText(location.origin+'/api/health-sync');toast('Adres kopyalandı.',true)}catch(e){toast('Kopyalanamadı; adresi elle yaz.')}},
  theme(ds){S.prefs.theme=ds.v;applyTheme();persist('core');render()},
  ulw(){S.prefs.ulWarn=S.prefs.ulWarn===false;persist('core');render()}
});

async function admOpenUser(id,keepTab){
  V.adm.uid=id;V.adm.ud=null;if(!keepTab){V.adm.uTab='day';V.adm.date=addDays(TODAY,-1)}V.adm.temp=null;V.smsg=null;render();
  try{
    const r=await api('/admin/users/'+id+'/data');
    AV=parseDocs(r.docs);V.adm.ud=r.user;
  }catch(e){V.smsg={ok:false,t:errMsg(e)};V.adm.ud={username:'—'};AV=parseDocs([])}
  render();
}
Object.assign(A,{
  async admsub(ds){
    V.adm.sub=ds.s;V.adm.uid=null;V.smsg=null;V.adm.newInvite=null;
    if(ds.s==='log'){V.adm.log=null;render();try{V.adm.log=(await api('/admin/log')).log}catch(e){V.smsg={ok:false,t:errMsg(e)}}}
    else if(ds.s!=='users')await admLoadQuiet();
    render();
  },
  admuser(ds){return admOpenUser(ds.id)},
  admback(){V.adm.uid=null;V.adm.ud=null;AV=null;V.smsg=null;V.adm.temp=null;admLoadQuiet().then(render);render()},
  admutab(ds){V.adm.uTab=ds.t;V.smsg=null;render()},
  admday(ds){const n=addDays(V.adm.date,+ds.n);if(n>TODAY)return;V.adm.date=n;render()},
  admpick(ds){V.adm.date=ds.d;window.scrollTo(0,0);render()},
  admtempok(){V.adm.temp=null;V.adm.newInvite=null;render()},
  async admcopyinv(ds){try{await navigator.clipboard.writeText(ds.code);toast('Kod kopyalandı.')}catch(e){toast('Kopyalanamadı; kodu elle not al.')}},
  async admiv(ds){
    try{
      if(ds.op==='delete'&&!confirm('Davet kodu silinsin mi?'))return;
      await api('/admin/invites/'+ds.id+'/'+ds.op,{method:'POST',body:{}});V.adm.data=await api('/admin/overview');V.smsg=null;
    }catch(e){V.smsg={ok:false,t:errMsg(e)}}
    render();
  }
});
async function admLoadQuiet(){try{V.adm.data=await api('/admin/overview')}catch(e){}}
function importFile(file){
  const fr=new FileReader();
  fr.onload=()=>{
    try{
      const o=JSON.parse(fr.result);
      if(!o||typeof o!=='object'||(!o.months&&!o.profile))throw 0;
      if(!confirm('Yedekteki veriler mevcut verilerinin üzerine yazılacak. Devam edilsin mi?'))return;
      S.months={};applyData(o);
      persist('core');Object.keys(S.months).forEach(k=>persist(k));
      flush();render();
    }catch(e){alert('Bu dosya geçerli bir Spor Hocam yedeği değil.')}
  };
  fr.readAsText(file);
}
document.addEventListener('click',e=>{
  const pd=e.target.closest&&e.target.closest('[data-i="pickdate"],[data-i="admdate"]');
  if(pd){try{pd.showPicker&&pd.showPicker()}catch(x){}return}
  const b=e.target.closest('[data-a]');
  if(b&&!b.disabled&&A[b.dataset.a]){
    try{const r=A[b.dataset.a](b.dataset);if(r&&r.catch)r.catch(x=>toast(x&&x.message||String(x)))}
    catch(x){console.error(x);toast(x&&x.message||String(x))}
  }
});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target&&e.target.dataset&&e.target.dataset.i==='exnew'){e.preventDefault();A.exadd();return}
  if(e.key==='Enter'&&e.target&&e.target.dataset&&e.target.dataset.i==='bc'){e.preventDefault();A.bcsearch();return}
  if((e.key==='Enter'||e.key===' ')&&e.target.matches&&e.target.matches('.hrow')){e.preventDefault();A.open(e.target.dataset)}});
function jump(v){if(!v||v>TODAY||v===V.date&&V.tab==='today')return;V.date=v;V.tab='today';V.preview=null;V.edit=null;V.undo=null;window.scrollTo(0,0);render()}
document.addEventListener('change',e=>{
  const t=e.target,k=t.dataset&&t.dataset.i;if(!k)return;
  if(k==='pickdate'||k==='hdate')jump(t.value);
  else if(k==='admdate'){if(t.value&&t.value<=TODAY){V.adm.date=t.value;render()}}
  else if(k==='import'&&t.files&&t.files[0]){importFile(t.files[0]);t.value=''}
  else if(k==='fimg'||k==='simg'){const files=Array.from(t.files||[]),kd=(t.dataset&&t.dataset.kind)||'label';t.value='';addImgs(k==='fimg'?'fimgs':'simgs',files,kd)}
  else if(k==='bcfile'){const f=(t.files||[])[0];t.value='';if(f)A.bcfromfile(f)}
  else if(k==='saddf'&&t.value){const id=t.dataset.id;(V.sf[id]=V.sf[id]||[]).push(t.value);render()}
});
document.addEventListener('input',e=>{
  const t=e.target,k=t.dataset&&t.dataset.i;if(!k)return;const ds=t.dataset;
  if(k==='food')V.food=t.value;
  else if(k==='mealtype')V.mealType=t.value;
  else if(k==='stext')V.stext=t.value;
  else if(k==='bc')V.bc.code=t.value;
  else if(k==='pickdate'||k==='hdate')jump(t.value);
  else if(k==='admdate'){if(t.value&&t.value<=TODAY){V.adm.date=t.value;render()}}
  else if(k==='hmonth'){V.hm=t.value;V.hmore=false;render()}
  else if(k==='pg'){const it=V.preview&&V.preview[+ds.ix],g=num(t.value);if(it&&g>0&&g<=5000){it.g=g;it.n=scaleN(it.baseN,g/it.baseG);updPv(+ds.ix)}}
  else if(k==='prof'){S.profile[ds.k]=t.value;persist('core')}
  else if(k==='goal'){S.goals[ds.k]=num(t.value);persist('core')}
  else if(k==='weight'){const d=getDay(V.date),v=num(t.value);if(t.value.trim()&&v>=20&&v<=400)d.weight=v;else if(!t.value.trim())delete d.weight;save(V.date)}
  else if(k==='lw'||k==='lr'){ // antrenman seti: durumu doğrudan güncelle, yeniden çizme (odak kaybolmasın)
    const L=liftOf(V.date),s=L&&L.ex&&L.ex[+ds.e]&&(L.ex[+ds.e].s||[])[+ds.j];
    if(s){const v=t.value.trim(),n=v===''?'':num(v);
      if(k==='lw')s.w=n===''?'':Math.min(1000,Math.max(0,n));else s.r=n===''?'':Math.min(200,Math.max(0,Math.round(n)));
      save(V.date);const sm=document.getElementById('liftsum');if(sm)sm.textContent=liftSumTxt(V.date)}
  }
  else if(k==='mfield'){const m=getDay(V.date).meals[+ds.ix];if(m){const v=num(t.value);m[ds.k]=v>=0?v:0;save(V.date)}}
  else if(k==='sname'){const s=S.supps.find(x=>x.id===ds.id);if(s){s.name=t.value;persist('core')}}
  else if(k==='sdose'){const s=S.supps.find(x=>x.id===ds.id);if(s){s.dose=t.value;persist('core')}}
  else if(k==='sfield'){const s=S.supps.find(x=>x.id===ds.id);if(s){s.n=s.n||{};const v=num(t.value);if(v>0)s.n[ds.k]=v;else delete s.n[ds.k];persist('core')}}
  else if(k==='so'){const s=S.supps.find(x=>x.id===ds.id);if(s&&s.other&&s.other[+ds.ix]){s.other[+ds.ix][ds.f]=ds.f==='v'?(t.value===''?'':num(t.value)):t.value;persist('core')}}
});

/* ---------- başlat ---------- */
async function boot(){
  V.am='login';
  let me=null;
  try{me=await api('/me')}
  catch(e){
    if(e.code==='network'){
      let last=null;try{last=JSON.parse(localStorage.getItem('spor-hocam-last'))}catch(x){}
      if(last&&last.id){AUTH.offline=true;await enterApp(last);render();return}
    }
    V.am='err';V.aerr=e.message;render();return;
  }
  AUTH.config=me.config||AUTH.config;V.cap=AUTH.config;
  if(me.user&&me.user.mustChange){AUTH.cur=me.user;V.am='force';render();return}
  if(me.user){await enterApp(me.user);render();setTimeout(()=>loadSys(false),1200);return} // noktanın rengi için bir kez arka planda kontrol
  V.am=AUTH.config.hasUsers?'login':'register';
  render();
}
addEventListener('online',()=>{if(AUTH.offline||dbErr)location.reload()});
const TEXTY='input:not([type=checkbox]):not([type=radio]):not([type=file]),textarea,select';
document.addEventListener('focusin',e=>{if(e.target.matches&&e.target.matches(TEXTY))document.body.classList.add('kb')});
document.addEventListener('focusout',()=>setTimeout(()=>{const a=document.activeElement;if(!(a&&a.matches&&a.matches(TEXTY)))document.body.classList.remove('kb')},150));
(async()=>{
  if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
  await boot();
})();
