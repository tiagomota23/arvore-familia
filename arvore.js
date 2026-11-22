const LBL={no_mh:'no MyHeritage',por_gravar:'por gravar',por_decidir:'à espera do Tiago',por_validar:'por validar',diferente_mh:'diferente do MH',rejeitado:'rejeitado',substituida:'substituída',info:'info'};
const PEND=['por_gravar','por_decidir','por_validar','diferente_mh'];
const ACAO={newperson:'criar pessoa',relink:'religar',setname:'nome',setbirth:'nascimento',setdate:'corrigir data',famdate:'data/local do casamento (casal)',delfact:'apagar facto',addfact:'acrescentar facto',annotfact:'anotar facto',addnote:'nota do perfil',tag:'marcar imagem',extract:'extração (caminho antigo)',manual:'manual'};
let D=null,BY={},CUR=null,EGO=1000003,ANCORA=null;const ROOT0=1000003;
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const nrm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const pill=s=>GESTOR?`<span class="pill s-${s||'info'}">${LBL[s]||esc(s)}</span>`:'';
const pend=p=>PEND.reduce((a,k)=>a+(p.cnt[k]||0),0);
const genLbl=g=>g===null||g===undefined?'—':(g>0?`+${g} (acima)`:g<0?`${g} (abaixo)`:`0 (${ancNome()})`);
const hk=id=>String(id).replace(/[^A-Za-z0-9-]/g,'-');
let CLOSED={};try{CLOSED=JSON.parse(localStorage.getItem('arv-fechadas')||'{}')}catch(e){}
function sec(key,title,body,startClosed){const closed=key in CLOSED?CLOSED[key]:!!startClosed;return `<details class="sec" data-k="${esc(key)}" ${closed?'':'open'}><summary><h3>${title}</h3></summary><div class="body">${body}</div></details>`}
function bindSecs(root){root.querySelectorAll('details.sec').forEach(d=>d.addEventListener('toggle',()=>{CLOSED[d.dataset.k]=!d.open;try{localStorage.setItem('arv-fechadas',JSON.stringify(CLOSED))}catch(e){}}))}

// arranque: app.js chama ARV.start(dados, contexto) depois do login (ou em modo de demonstração)
let GESTOR=false, CTX={};
window.ARV={start(d,ctx){CTX=ctx||{};GESTOR=!!CTX.gestor;document.body.classList.toggle('gestor',GESTOR);D0=d;D=structuredClone(d);init()},rerender:()=>route(),pessoas:()=>D?D.pessoas:[],by:id=>BY[id],nome:id=>BY[id]?BY[id].n:String(id),hk:id=>hk(id)};

// ---------- dados: snapshot (data.json, do build) + sobreposição ao vivo (base do artifact: «decisoes» e «feito»)
let D0=null;
const LIVE={dec:{},feito:{},state:'a ligar',n:0,nf:0,sem:0};
const PSET=new Set(['por_gravar','diferente_mh']);
const TIPO_ERR={Miscarriage:'Aborto espontâneo','Alternate Baptism':'Batismo alternativo'};
const DEC_ACAO={'Nascimento':'setbirth','Nome':'setname','Apelido':'setname','Pai':'relink','Mãe':'relink','Pais':'relink','Nota':'addnote'};
function applyLive(){
  const S=D.snap||{dids:[],feito:{},dec_est:{}}, sd=new Set(S.dids||[]), SF=S.feito||{};
  const decs=Object.values(LIVE.dec).filter(d=>d&&d.did&&!sd.has(d.did)).sort((a,b)=>String(a.did).localeCompare(String(b.did)));
  const fts=Object.values(LIVE.feito).filter(x=>x&&x.item_id&&SF[x.item_id]!==x.ts).sort((a,b)=>String(a.ts).localeCompare(String(b.ts)));
  LIVE.n=decs.length;LIVE.nf=fts.length;LIVE.sem=0;
  if(!decs.length&&!fts.length)return;
  const R=D.resumo.dados, PA=D.pacao||(D.pacao={}), PID={}, IX={};
  for(const p of D.pessoas)PID[p.id]=p;
  const add=(o,k,p,key)=>{const iid=o&&o[key];if(iid)IX[iid]={o,k,p}};
  for(const p of D.pessoas){
    for(const f of p.f){add(f,'estado_mh',p,'item_id');for(const a of f.anot||[])add(a,'s',p,'ii')}
    for(const m of p.fm)for(const f of m.f)add(f,'estado_mh',p,'item_id');
    for(const a of ['nv','nt','ex','im','q'])for(const x of p[a]||[])add(x,'s',p,'ii');
    for(const d of p.dc)add(d,'estado_mh',p,'item_id');
    if(p.ft)add(p.ft,'estado_mh',p,'item_id');
  }
  for(const d of D.gdec||[])add(d,'estado_mh',null,'item_id');
  const bump=(p,k,n)=>{if(p){p.cnt[k]=(p.cnt[k]||0)+n;if(p.cnt[k]<=0)delete p.cnt[k]}R[k]=(R[k]||0)+n;if(R[k]<=0)delete R[k]};
  const pendMv=(iid,acao,old,ns,pid)=>{const wp=PSET.has(old),ip=PSET.has(ns);
    if(wp&&!ip){D.npend--;D.pend[acao]=(D.pend[acao]||1)-1;if(D.pend[acao]<=0)delete D.pend[acao]}
    if(!wp&&ip){D.npend++;D.pend[acao]=(D.pend[acao]||0)+1}
    PA[iid]=[acao,pid,ns]};
  const setSt=(iid,ns)=>{const x=IX[iid],pa=PA[iid];const old=x?x.o[x.k]:(pa?pa[2]:null);if(old==null||old===ns)return false;
    if(x)x.o[x.k]=ns;bump(x?x.p:(pa&&PID[pa[1]]),old,-1);bump(x?x.p:(pa&&PID[pa[1]]),ns,1);
    pendMv(iid,(pa&&pa[0])||(x&&x.o.acao)||'manual',old,ns,pa?pa[1]:(x&&x.p?x.p.id:null));
    for(const q of ['por_decidir','por_validar'])if(old===q&&ns!==q)D.filas[q]=D.filas[q].filter(z=>z.item!==iid);
    return true};
  for(const d0 of decs){
    const d={...d0};d.origem='ao vivo · base do artifact';d._live=1;
    {const m=/fontes_locais:\s*((?:MOTA|ALB)-[A-Za-z0-9._-]+)\s*(?:p\.?\s*([0-9]+[a-z]?))?/.exec(d.ref||'');if(m){d.fl=[{c:m[1],pg:m[2]?'p. '+m[2]:''}];if(['aprovado','apagar','por_decidir','adiado'].includes(d.decisao)){d.sl=1;const pp=PID[d.id];if(pp)pp.sl=(pp.sl||0)+1}}}
    d.alvo_item=d.item_id||null;d.item_id='live-'+d.did;
    if(!d.estado_mh)d.estado_mh=(S.dec_est||{})[d.decisao]||'por_gravar';
    if(d.decisao==='adiado'||d.decisao==='por_decidir')d.estado_mh='por_decidir';
    const p=PID[d.id], alvo=d.alvo_item&&IX[d.alvo_item];
    if(d.alvo_item&&!alvo&&!PA[d.alvo_item])LIVE.sem++;
    if(alvo||PA[d.alvo_item]){
      d._alvo=d.alvo_item;
      const ms=/\bSubstitu[íi]d[ao] por (D\d{4})/.exec(d.nota||'');
      if(ms&&['adiado','por_decidir','rejeitado'].includes(d.decisao)){d.estado_mh='substituida';d.substituida_por=ms[1];d.anula=true}
      setSt(d.alvo_item,d.decisao==='rejeitado'&&d.estado_mh!=='no_mh'&&!d.anula?'rejeitado':d.estado_mh);
      if(alvo&&d.decisao==='apagar')alvo.o.apagar=true;
    }else{
      const acao=d.acao||DEC_ACAO[String(d.campo||'').split(' ')[0]]||(d.decisao==='apagar'?'delfact':(d.valor_antigo?'setdate':'addfact'));
      d.acao=acao;IX[d.item_id]={o:d,k:'estado_mh',p:p||null};
      bump(p||null,d.estado_mh,1);D.resumo.dados_total=(D.resumo.dados_total||0)+1;
      if(p&&PSET.has(d.estado_mh))pendMv(d.item_id,acao,'',d.estado_mh,p.id);
      if(d.estado_mh==='por_decidir')D.filas.por_decidir.push({item:d.item_id,cat:'decisão',ids:p?[p.id]:[],t:`${d.campo||''}: ${d.valor_antigo?d.valor_antigo+' → ':''}${d.valor_novo||''}`,o:d.origem,nt:d.nota||''});
    }
    if(p)p.dc.push(d);else (D.gdec=D.gdec||[]).push(d);
    // facto gravado com o tipo errado (ex.: Morte como «Miscarriage»)
    const m=/^([\w ]+?) \(tipo errado\)/.exec(d.valor_antigo||'');
    if(m&&p&&!d._alvo){const errado=TIPO_ERR[m[1]]||m[1];
      for(const f of p.f){if(f.tipo===errado){setSt(f.item_id,'diferente_mh');f.apagar=true;f.nota_decisao=`${d.did}: no MH está como «${m[1]}», deve ser «${d.campo}»`}
        else if(f.tipo===d.campo&&!/\.ged:/.test(f.origem||'')&&d.estado_mh!=='no_mh')setSt(f.item_id,d.estado_mh)}}
  }
  // a última decisão sem alvo de cada (pessoa, campo) ganha; as anteriores ficam «substituída»
  for(const p of D.pessoas){if(!p.dc.some(d=>d._live&&!d._alvo))continue;
    const last={};for(const d of p.dc)if(!d._alvo)last[String(d.campo||'').trim().toLowerCase()]=d.did;
    for(const d of p.dc)if(!d._alvo&&last[String(d.campo||'').trim().toLowerCase()]!==d.did&&d.estado_mh!=='no_mh'&&d.estado_mh!=='substituida'){
      if(!setSt(d.item_id,'substituida'))d.estado_mh='substituida'}}
  for(const x of fts){const t=IX[x.item_id];
    if(!t&&!PA[x.item_id]){LIVE.sem++;continue}
    if(x.resultado==='gravado'){setSt(x.item_id,'no_mh');if(t)t.o.feito='ao vivo'}
    else if(t)t.o.falhou={ts:x.ts,nota:x.nota||'',origem:'ao vivo'}}
  const tot=D.resumo.dados_total||1;D.resumo.pct_no_mh=Math.round((R.no_mh||0)/tot*1000)/10;
}
function prep(){
  applyLive();
  // prefixo de tratamento (D.) só por decisão aprovada; passa a fazer parte do nome mostrado em todo o lado
  for(const p of D.pessoas){let v='';for(const d of p.dc||[])if(/^prefixo/i.test(String(d.campo||'').trim())&&d.decisao==='aprovado'&&d.estado_mh!=='substituida')v=String(d.valor_novo||'').trim();p.np=v}
  const PFX=D.pessoas.filter(p=>p.np);
  for(const p of PFX){p.n0=p.n;p.n=p.np+' '+p.n}
  for(const p of D.pessoas)for(const q of PFX)if(p.pr&&p.pr.includes(q.n0)&&!p.pr.includes(q.n))p.pr=p.pr.split(q.n0).join(q.n);
  BY={};
  for(const p of D.pessoas){BY[p.id]=p;BY[hk(p.id)]=p;p._s=nrm([p.np,/^d\.?$/i.test(p.np||'')?'dom':'',p.npg,p.n,p.ns,p.nv.map(x=>x.v).join(' '),p.id,notavelTxt(p)].filter(Boolean).join(' '))}
  for(const p of D.pessoas){p._pr0=p.pr;p._g0=p.g;p._ln0=p.ln;p._c0=p.c;p._r0=p.r}
}
function liveTxt(){
  if(!GESTOR)return '';
  return `<span class="live ok">snapshot de ${esc(D.snap&&D.snap.ts||D.resumo.gerado||'?')} (exportação da árvore de referência)</span>`;
  const t=(D.snap&&D.snap.ts||'').slice(11,16)||'?';
  if(LIVE.state==='ok'){
    if(!LIVE.n&&!LIVE.nf)return `<span class="live ok">ao vivo · sem alterações depois do snapshot de ${t}</span>`;
    const a=[];if(LIVE.n)a.push(`${LIVE.n} ${LIVE.n===1?'decisão':'decisões'}`);if(LIVE.nf)a.push(`${LIVE.nf} ${LIVE.nf===1?'gravação':'gravações'}`);
    return `<span class="live ok">atualizado ao vivo: ${a.join(' e ')} depois do snapshot de ${t}${LIVE.sem?` (${LIVE.sem} sem alvo conhecido)`:''}</span>`;
  }
  if(LIVE.state==='a ligar')return `<span class="live">a ligar à base… a mostrar o snapshot de ${t}</span>`;
  return `<span class="live warn">sem ligação à base (${esc(LIVE.state)}): a mostrar o snapshot de ${t}; decisões posteriores não aparecem</span>`;
}
function renderHead(){
  const r=D.resumo, d=r.dados||{}, tot=r.dados_total||1;
  if(!GESTOR){
    $('#gen').innerHTML=`${r.pessoas} pessoas · atualizada em ${esc(r.gerado)}`;$('#stats').innerHTML='';
    $('#tabs').innerHTML=[['arvore','Árvore'],['','Pessoas']].map(([h,t])=>`<button class="tab" data-h="${h}">${t}</button>`).join('');
    $('#tabs').querySelectorAll('.tab').forEach(b=>b.onclick=()=>{location.hash=b.dataset.h?b.dataset.h:('p'+hk(CUR||EGO))});
    const h=location.hash.slice(1);document.querySelectorAll('.tab').forEach(t=>t.setAttribute('aria-selected',(t.dataset.h||'')===tabOf(h)));return}
  $('#gen').innerHTML=`Gerado ${esc(r.gerado)} · ${r.pessoas} pessoas, ${r.familias} famílias · base: ${esc(r.base||'GEDCOM')} + gravações e decisões registadas depois<br>${liveTxt()}`;
  const w=k=>((d[k]||0)/tot*100).toFixed(2)+'%';
  $('#stats').innerHTML=`
   <div class="stat"><b>${r.pct_no_mh}%</b><span>dados no MyHeritage</span><div class="bar">${['no_mh','por_gravar','por_validar','por_decidir','diferente_mh'].map(k=>`<i class="d-${k}" style="width:${w(k)}"></i>`).join('')}</div></div>
   <div class="stat"><b>${d.por_gravar||0}</b><span>por gravar</span></div>
   <div class="stat"><b id="st-tiago">${D.filas.por_decidir.length}</b><span id="st-tiago-l">à espera do Tiago</span></div>
   <div class="stat"><b>${d.por_validar||0}</b><span>por validar</span></div>
   <div class="stat"><b>${r.pessoas}</b><span>pessoas (${r.pessoas_por_criar} por criar)</span></div>
   <div class="stat"><b>${r.correspondencias.por_gravar||0}</b><span>correspond. por aplicar</span></div>`;
  $('#tabs').innerHTML=[['','Pessoas',r.pessoas],['arvore','Árvore',''],['tiago','À espera do Tiago',D.filas.por_decidir.length],['validar','Por validar',D.filas.por_validar.length],['operador','Para o Operador',D.npend],['gestao','Gestão','']]
    .map(([h,t,n])=>`<button class="tab" data-h="${h}">${t} <b>${n}</b></button>`).join('');
  $('#tabs').querySelectorAll('.tab').forEach(b=>b.onclick=()=>{location.hash=b.dataset.h?b.dataset.h:('p'+hk(CUR||EGO))});
  const h=location.hash.slice(1);document.querySelectorAll('.tab').forEach(t=>t.setAttribute('aria-selected',(t.dataset.h||'')===tabOf(h)));
}
function init(){
  prep();renderHead();
  // âncora do utilizador (tabela membros): a árvore abre nessa pessoa; só o gestor a muda
  {const a=BY[CTX.ancora];if(a)EGO=a.id}
  if(GESTOR){
    try{const e=JSON.parse(localStorage.getItem('arv-ego'));if(e!==null&&BY[e])EGO=e}catch(e){}
    try{const a=JSON.parse(localStorage.getItem('arv-ancora'));if(a!==null&&BY[a])ANCORA=a}catch(e){}
    {const h=location.hash.slice(1);if(h.startsWith('ancora-')&&BY[h.slice(7)])ANCORA=BY[h.slice(7)].id}
  }
  if(!location.hash)history.replaceState(null,'','#arvore');
  applyEgo();initEgo();
  CUR=EGO;
  try{const s=JSON.parse(localStorage.getItem('arv-filtros')||'{}');for(const k in s){const el=$('#'+k);if(el){el.type==='checkbox'?el.checked=s[k]:el.value=s[k]}}}catch(e){}
  for(const id of ['q','fnot','fsl','fpend','fest','fcat','framo','fgen'])$('#'+id).addEventListener('input',list);
  window.addEventListener('hashchange',route);
  // «⌂ O meu perfil» (artifact v134): volta a pôr-me no centro da árvore (e o gestor repõe a âncora por omissão); na árvore, fica na árvore
  $('#home').addEventListener('click',ev=>{CUR=EGO;
    if(location.hash==='#arvore'){ev.preventDefault();if(GESTOR&&ANCORA!==null)setAnchor(null);else route();}
    else if(GESTOR&&ANCORA!==null)setAnchor(null,true)});
  list();route();if(GESTOR)initDb();
}
let RELIVE=null;
function relive(){clearTimeout(RELIVE);RELIVE=setTimeout(()=>{
  D=structuredClone(D0);prep();if(!BY[EGO])EGO=ROOT0;if(ANCORA!==null&&!BY[ANCORA])ANCORA=null;applyEgo();renderHead();list();route();refreshTabs();
},60)}
function list(){
  const q=nrm($('#q').value.trim()), pe=$('#fpend').checked, nt=$('#fnot').checked, sl=$('#fsl').checked, es=$('#fest').value, ca=$('#fcat').value, ra=$('#framo').value, ge=$('#fgen').value;
  try{localStorage.setItem('arv-filtros',JSON.stringify({fnot:nt,fsl:sl,fpend:pe,fest:es,fcat:ca,framo:ra,fgen:ge}))}catch(e){}
  const terms=q.split(/\s+/).filter(Boolean);
  if(!terms.length&&!nt&&!sl&&!pe&&!es&&!ca&&!ra&&ge===''){$('#count').textContent='Escreva um nome ou id, ou escolha um filtro, para ver a lista.';$('#list').innerHTML='';return}
  let L=D.pessoas.filter(p=>(!terms.length||terms.every(t=>p._s.includes(t)))&&(!nt||(notavelTxt(p)&&!p.del))&&(!sl||p.sl>0)&&(!pe||pend(p)>0)&&(!es||(p.cnt[es]||0)>0)&&(!ca||p.c===ca)&&(!ra||p.r.includes(ra))&&(ge===''||String(p.g)===ge));
  if(pe||es)L.sort((a,b)=>pend(b)-pend(a));
  else if(terms.length){
    // palavras inteiras primeiro (ex.: «rei» encontra o prefixo «Rei» antes de «Ferreira»)
    const sc=p=>{const W=p._s.split(/[^a-z0-9.º]+/);return terms.reduce((n,t)=>n+(W.includes(t)?2:W.some(w=>w.startsWith(t))?1:0),0)};
    L=L.map(p=>[sc(p),p]).sort((a,b)=>b[0]-a[0]).map(x=>x[1]);
  }
  $('#count').textContent=`${L.length} pessoas${L.length>300?' (a mostrar 300)':''}`;
  $('#list').innerHTML=L.slice(0,300).map(p=>`<button class="row" role="listitem" data-id="${esc(p.id)}" ${CUR===p.id?'aria-current="true"':''}><span class="nm">${p.del?`<s class="del">${esc(p.n)}</s>`:esc(p.n)}<span class="rl">${esc(nt?notavelTxt(p):p.pr)} · ${esc(p.id)}</span></span><span class="dots">${PEND.filter(k=>p.cnt[k]).map(k=>`<i class="dot d-${k}" title="${p.cnt[k]} ${LBL[k]}"></i>`).join('')}</span></button>`).join('');
  $('#list').querySelectorAll('.row').forEach(b=>b.onclick=()=>go(b.dataset.id));
}
function go(id){location.hash='p'+hk(id)}
function route(){
  const h=location.hash.slice(1);
  document.querySelectorAll('.tab').forEach(t=>t.setAttribute('aria-selected',(t.dataset.h||'')===tabOf(h)));
  if(h==='arvore')return renderTree();
  if(!GESTOR&&(['tiago','validar','operador','gestao'].includes(h)||h.startsWith('ancora-'))){location.hash='arvore';return}
  if(h==='gestao')return window.APP.gestao($('#main'));
  if(h.startsWith('ancora-')){const a=BY[h.slice(7)];if(a&&ANCORA!==a.id)setAnchor(a.id,true);return renderTree()}
  if(h==='tiago')return queue('por_decidir','À espera do Tiago','Decisões que cabem ao Tiago. O Arquiteto regista a resposta com decide.py.');
  if(h==='validar')return queue('por_validar','Por validar','Material das pesquisas (staging) que o Arquiteto ainda não validou.');
  if(h==='operador')return operador();
  const p=h.startsWith('p')?BY[h.slice(1)]:null;
  show(p||BY[CUR]||BY[EGO]);
}
function pl(id,extra){const p=BY[id];if(!p)return '';return `<button class="pl${p.del?' del':''}" data-id="${esc(id)}"><span>${esc(p.n)}${p.nc?' <span class="pill s-info">nome por confirmar</span>':''}</span><small>${esc(p.pr)}${extra?' · '+extra:''}</small></button>`}
function bindPl(root){root.querySelectorAll('.pl').forEach(b=>b.onclick=()=>go(b.dataset.id))}
// respostas do Tiago: guardadas na base do artifact (coleção «respostas», um documento por item)
let DB=null, RESP={}, DBSTATE='a ligar', CANWRITE=null;
async function initDb(){
  // respostas do gestor: tabela «respostas» no Supabase (RLS: só o gestor); o Arquiteto lê-as com tools/respostas.py
  try{RESP=await window.APP.respostas.load();DBSTATE='ok';CANWRITE=true}catch(e){DBSTATE='erro: '+(e&&e.message||e)}
  rerenderQueue();refreshTabs();
}
function rerenderQueue(){if(location.hash==='#tiago')route()}
function refreshTabs(){
  const Q=D.filas.por_decidir, n=Q.filter(x=>!RESP[x.item]).length, r=Q.length-n;
  const b=document.querySelector('.tab[data-h="tiago"] b');if(b)b.textContent=n;
  const s=$('#st-tiago'),l=$('#st-tiago-l');if(s)s.textContent=n;
  if(l)l.textContent=r?`à espera do Tiago · ${r} respondida${r>1?'s':''}, por registar`:'à espera do Tiago';
}
const DLBL={aprovado:'Aprovar',rejeitado:'Rejeitar',adiado:'Adiar'};
function controls(x){
  const r=RESP[x.item];
  const done=r?`<div class="kv"><b>A tua resposta:</b> <span class="pill s-${r.decisao==='aprovado'?'no_mh':r.decisao==='rejeitado'?'diferente_mh':'por_decidir'}">${esc(DLBL[r.decisao]||r.decisao)}</span> ${r.nota?esc(r.nota):''} <span class="muted">(${esc(r.ts||'')}${r.registada?' · registada pelo Arquiteto':' · o Arquiteto ainda não a registou'})</span></div>`:'';
  if(DBSTATE!=='ok')return done+`<div class="muted">Não é possível responder aqui agora (${esc(DBSTATE)}).</div>`;
  if(CANWRITE===false)return done+'<div class="muted">Só o Tiago pode responder.</div>';
  return `${done}<div class="decide" data-item="${esc(x.item)}"><textarea id="nota-${esc(x.item)}" rows="2" placeholder="Nota (opcional): porquê, ou o que muda">${esc(r?.nota||'')}</textarea>
   <div class="btns">${['aprovado','rejeitado','adiado'].map(k=>`<button class="dbtn d-${k}" data-d="${k}" ${r&&r.decisao===k?'aria-pressed="true"':''}>${DLBL[k]}</button>`).join('')}<span class="saved muted" aria-live="polite"></span></div></div>`;
}
function queue(st,title,intro){
  const Q=D.filas[st]||[];
  const ask=st==='por_decidir';
  $('#main').innerHTML=`<div class="sec"><h2>${title}</h2><div class="muted">${ask?'Decide aqui: a resposta fica guardada e o Arquiteto regista-a em decisoes.jsonl (com «quem: Tiago»); depois o item sai desta lista no build seguinte.':intro}</div></div><div class="queue">${Q.map(x=>`<div class="qi"><div>${pill(st)}</div><div class="fd"><div>${esc(x.t)}</div>${x.nt?`<div class="muted">${esc(x.nt)}</div>`:''}<div class="who">${x.ids.map(i=>pl(i)).join('')}</div><div class="mono muted">${esc(x.cat)} · item ${esc(x.item)} · ${esc(x.o)}</div>${ask?controls(x):''}</div></div>`).join('')||'<div class="empty">Nada nesta fila.</div>'}</div>`;
  bindPl($('#main'));
  $('#main').querySelectorAll('.decide').forEach(box=>box.querySelectorAll('.dbtn').forEach(b=>b.onclick=async()=>{
    const item=box.dataset.item, x=Q.find(y=>y.item===item), msg=box.querySelector('.saved');
    const nota=box.querySelector('textarea').value.trim();
    box.querySelectorAll('.dbtn').forEach(z=>z.disabled=true); msg.textContent='A guardar…';
    try{
      const now=new Date(), ts=now.toISOString().slice(0,16).replace('T',' ');
      RESP[item]=await window.APP.respostas.save({item_id:item,decisao:b.dataset.d,nota,ids:x.ids,texto:x.t.slice(0,300),categoria:x.cat});
      msg.textContent='Guardado.';refreshTabs();box.querySelectorAll('.dbtn').forEach(z=>{z.disabled=false;z.setAttribute('aria-pressed',z===b)});
    }catch(e){msg.textContent='Não foi guardado ('+(e&&e.code||'erro')+'). Tente de novo.';box.querySelectorAll('.dbtn').forEach(z=>z.disabled=false)}
  }));
}
function operador(){
  const rows=Object.entries(D.pend).sort((a,b)=>b[1]-a[1]).map(([a,n])=>`<tr><td>${esc(ACAO[a]||a)}</td><td class="mono">${esc(a)}</td><td>${n}</td></tr>`).join('');
  $('#main').innerHTML=`<div class="sec"><h2>Para o Operador</h2><div class="muted">${D.npend} itens decididos e ainda não gravados, em arvore/pendentes_mh.jsonl. O Operador regista cada gravação em arvore/feito_mh.jsonl. As extrações dos lotes 31–39 seguem pelo caminho antigo.</div></div>
   <div style="overflow-x:auto"><table class="op"><thead><tr><th>Ação</th><th>Ferramenta</th><th>Itens</th></tr></thead><tbody>${rows}</tbody></table></div>
   ${D.gdec.length?sec('gdec','Decisões gerais',D.gdec.map(d=>`<div class="item">${pill(d.estado_mh)}<div>${esc(d.campo)}: ${esc(d.valor_novo)} <span class="muted">(${esc(d.decisao)}, ${esc(d.quem)}, ${esc(d.ts)})</span></div></div>`).join('')):''}`;
  bindSecs($('#main'));
}
function fbox(f,sub){
  const k=[];
  if(f.valor)k.push(`<div>${esc(f.valor)}</div>`);
  k.push(`<div class="when">${esc(f.data||'sem data')}${f.local?' · '+esc(f.local):''}${f.morada?' · '+esc(f.morada):''}</div>`);
  for(const [a,b] of [['padrinhos','Padrinhos'],['celebrante','Celebrante'],['testemunhas','Testemunhas'],['causa','Causa']]) if(f[a])k.push(`<div class="kv"><b>${b}:</b> ${esc(f[a])}</div>`);
  if(f.cotas)k.push(`<div class="kv"><b>Cota:</b> <span class="mono">${esc(f.cotas.join(', '))}</span>${f.imagens_assento?` <span class="mono">img. ${esc(f.imagens_assento.join(', '))}</span>`:''}</div>`);
  if(f.fr){const r=f.fr,a=[];if(r.gedcom)a.push(`${r.gedcom} citaç${r.gedcom>1?'ões':'ão'} no MyHeritage`);if(r.assento)a.push('assento');if(r.local.length)a.push('fonte local '+r.local.join(', '));
    k.push(`<div class="kv"><b>Fontes:</b> ${esc(a.join(' · '))}${f.sl?' '+slPill(f.fl):''}</div>`)}
  if(f.fl)for(const r of f.fl)k.push(`<div class="kv fl"><b class="mono">${esc(r.c)}</b>${r.pg?' '+esc(r.pg):''}${r.ti?` <span class="muted">— ${esc(r.ti)}</span>`:''}${r.ged?' <span class="muted">(citação no MyHeritage)</span>':''}${r.t?`<div class="muted">${esc(r.t)}</div>`:''}</div>`);
  if(f.cit)k.push(`<div class="kv"><b>${esc(f.cit)}</b></div>`);
  if(f.substitui)k.push(`<div class="kv"><b>Substitui no MH:</b> ${esc(f.substitui)}</div>`);
  if(f.hist&&f.hist.length)k.push(`<div class="kv"><b>Antes (MH):</b> ${esc(f.hist.join(' → '))}</div>`);
  const det=[];
  if(f.desc)det.push(`<div class="box">${esc(f.desc)}</div>`);
  if(f.anot)for(const a of f.anot) if(a.t!==f.desc) det.push(`<div class="item">${pill(a.s)}<div>${esc(a.t)} <span class="mono muted">${esc(a.o)}</span></div></div>`);
  if(f.fontes)det.push(`<div class="kv"><b>Fontes:</b><ul>${f.fontes.map(s=>`<li>${esc(s)}</li>`).join('')}</ul></div>`);
  if(det.length)k.push(`<details><summary>Descrição, fontes e anotações</summary><div class="items">${det.join('')}</div></details>`);
  k.push(`<div class="mono muted">${esc(f.origem||'')}${f.item_id?' · item '+esc(f.item_id):''}</div>`);
  const lab=sub===undefined?f.tipo:sub;
  return `<div class="fact${lab?'':' nt'}">${lab?`<div class="ft">${esc(lab)}</div>`:''}<div class="fd">${k.join('')}</div><div>${pill(f.estado_mh)}</div></div>`;
}
function fgroups(fs){
  if(!fs.length)return '<span class="muted">Sem factos.</span>';
  const G=new Map();for(const f of fs){const g=f._g||f.tipo||'Outro';if(!G.has(g))G.set(g,[]);G.get(g).push(f)}
  const out=[];
  for(const [g,L] of G){
    const key='fg:'+g, closed=key in CLOSED?CLOSED[key]:false;
    const cnt={};for(const f of L)if(f.estado_mh&&f.estado_mh!=='no_mh')cnt[f.estado_mh]=(cnt[f.estado_mh]||0)+1;
    const pp=Object.entries(cnt).map(([k,n])=>`<span class="pill s-${k}">${n} ${LBL[k]||k}</span>`).join('');
    out.push(`<details class="fg" data-k="${esc(key)}" ${closed?'':'open'}><summary>${esc(g)} <span class="n">${L.length}</span>${pp}</summary><div class="facts">${L.map(f=>fbox(f,f._sub||'')).join('')}</div></details>`);
  }
  return `<div class="fgbar"><button class="linkbtn" data-fg="1">Abrir todos</button><button class="linkbtn" data-fg="0">Fechar todos</button></div>`+out.join('');
}
function bindFg(root){
  root.querySelectorAll('details.fg').forEach(d=>d.addEventListener('toggle',()=>{CLOSED[d.dataset.k]=!d.open;try{localStorage.setItem('arv-fechadas',JSON.stringify(CLOSED))}catch(e){}}));
  root.querySelectorAll('[data-fg]').forEach(b=>b.addEventListener('click',()=>{const o=b.dataset.fg==='1';root.querySelectorAll('details.fg').forEach(d=>d.open=o)}));
}
function curto(n){const w=String(n||'').replace(/^D\.\s+/,'').replace(/\(.*?\)/g,'').trim().split(/\s+/);return w.length>1?w[0]+' '+w[w.length-1]:(w[0]||'')}
const LTYP={'pai':'par','mãe':'par','filho':'fil','filha':'fil','irmão':'ir','irmã':'ir','tio':'tio','tia':'tio','sobrinho':'sob','sobrinha':'sob','primo':'prim','prima':'prim','marido':'cj','mulher':'cj'};
const LINV={par:['filho','filha'],fil:['pai','mãe'],ir:['irmão','irmã'],tio:['sobrinho','sobrinha'],sob:['tio','tia'],prim:['primo','prima'],cj:['marido','mulher']};
const LREL={tio:['tio','tia'],par:['pai','mãe'],fil:['filho','filha'],ir:['irmão','irmã'],prim:['primo','prima'],sob:['sobrinho','sobrinha'],cj:['marido','mulher']};
const relOf=(t,id)=>(LREL[t]||['',''])[BY[id]?.s==='F'?1:0];
const paOf=id=>BY[id]?.pa||[];
const isSib=(x,y)=>x!==y&&paOf(x).some(g=>paOf(y).includes(g));
// abre um nível de uma ligação abreviada (primo, sobrinho, irmão) na linha (ordem: do Tiago para a pessoa)
function expandLn(ln,e){
  const a=ln[e-1][0], b=ln[e][0], t=LTYP[ln[e][1]]; let ins=null;
  if(t==='ir'){const g=paOf(b).find(g=>paOf(a).includes(g));if(g!==undefined)ins=[[g,relOf('par',g)],[b,relOf('fil',b)]]}
  else if(t==='sob'){const S=paOf(b).find(x=>isSib(x,a));if(S!==undefined)ins=[[S,relOf('ir',S)],[b,relOf('fil',b)]]}
  else if(t==='tio'){const P=paOf(a).find(x=>isSib(x,b));if(P!==undefined)ins=[[P,relOf('par',P)],[b,relOf('ir',b)]]}
  else if(t==='prim'){for(const U of paOf(b)){const P=paOf(a).find(x=>isSib(U,x));if(P!==undefined){ins=[[P,relOf('par',P)],[U,relOf('ir',U)],[b,relOf('fil',b)]];break}}}
  return ins?[...ln.slice(0,e),...ins,...ln.slice(e+1)]:null;
}

// ---------- «Pessoa base»: parentesco, geração e linha calculados a partir de qualquer pessoa (porta de build.py: kinship/lineage)
const egoNome=()=>{const p=BY[EGO];if(!p)return 'Tiago';const w=String(p.n0||p.n).replace(/\(.*?\)/g,'').trim().split(/\s+/);return w[0]+(w.length>1?' '+w[w.length-1]:'')};
const oa=(sx,m,f)=>sx==='F'?f:m;
function klabel(a,b,sx,half,ssx){
  if(a===0&&b===0)return 'o próprio';
  if(a===0)return ({1:oa(sx,'filho','filha'),2:oa(sx,'neto','neta'),3:oa(sx,'bisneto','bisneta'),4:oa(sx,'trineto','trineta')})[b]||`descendente (${b} gerações)`;
  if(b===0)return ({1:oa(sx,'pai','mãe'),2:oa(sx,'avô','avó'),3:oa(sx,'bisavô','bisavó'),4:oa(sx,'trisavô','trisavó'),5:oa(sx,'tetravô','tetravó'),6:oa(sx,'pentavô','pentavó')})[a]||`${oa(sx,'antepassado','antepassada')} G${a}`;
  if(a===1&&b===1)return (half?'meio-':'')+oa(sx,'irmão','irmã');
  if(a===1)return ({2:oa(sx,'sobrinho','sobrinha'),3:oa(sx,'sobrinho-neto','sobrinha-neta'),4:oa(sx,'sobrinho-bisneto','sobrinha-bisneta')})[b]||`${oa(sx,'sobrinho','sobrinha')} (${b-1} gerações abaixo)`;
  if(b===1){const t=oa(sx,'tio','tia');return ({2:t,3:`${t}-${oa(sx,'avô','avó')}`,4:`${t}-${oa(sx,'bisavô','bisavó')}`,5:`${t}-${oa(sx,'trisavô','trisavó')}`})[a]||`${oa(sx,'irmão','irmã')} de antepassado G${a-1}`}
  const k=Math.min(a,b)-1, rm=Math.abs(a-b);
  if(b===2&&a>=4)return `${oa(sx,'filho','filha')} de ${ssx?oa(ssx,'irmão','irmã'):'irmão/irmã'} de antepassado G${a-1}`;
  const base=oa(sx,'primo','prima')+(k===1&&sx!=='F'?' direito':(k===1?' direita':` em ${k+1}.º grau`));
  return base+(rm?`, ${rm} ${rm===1?'geração':'gerações'} ${a>b?'acima':'abaixo'}`:'');
}
const kOk=x=>BY[x]&&!BY[x].del;  // pessoas «a apagar no MH» ficam fora do parentesco
const kPa=i=>(BY[i]?.pa||[]).filter(kOk), kFl=i=>(BY[i]?.fl||[]).filter(kOk), kCj=i=>(BY[i]?.cj||[]).filter(x=>kOk(x)&&x!==i);
function kGen(r,nb){const g=new Map([[r,0]]),st=[r];while(st.length){const i=st.pop();for(const p of nb(i))if(!g.has(p)||g.get(p)>g.get(i)+1){g.set(p,g.get(i)+1);st.push(p)}}return g}
function kBlood(root){const A=kGen(root,kPa),res=new Map();for(const [anc,a] of A)for(const [d,b] of kGen(anc,kFl)){const o=res.get(d);if(!o||a+b<o[0]+o[1])res.set(d,[a,b,anc])}return res}
function egoKin(ego){
  const out=new Map(), B=kBlood(ego);
  for(const [i,[a,b,anc]] of B){
    const sx=BY[i].s||''; let half=false, ssx='';
    if(a===1&&b===1)half=kPa(i).filter(x=>kPa(ego).includes(x)).length===1;
    if(b===2){const via=kPa(i).find(x=>kPa(x).includes(anc));ssx=via!==undefined?(BY[via].s||''):''}
    out.set(i,{pr:klabel(a,b,sx,half,ssx),g:a-b});
  }
  // família de sangue do(s) cônjuge(s) da pessoa base
  for(const sp of kCj(ego)){const nm=egoNome();for(const [i,[a,b]] of kBlood(sp)){if(out.has(i))continue;const sx=BY[i].s||'';
    out.set(i,{pr:(a===1&&b===0)?oa(sx,'sogro','sogra'):(a===0&&b===0)?'cônjuge':`${klabel(a,b,sx)} ${oa(BY[sp].s,'do','da')} cônjuge (${curto(BY[sp].n)})`,g:a-b})}}
  // afinidade: cônjuges de pessoas já rotuladas
  for(const p of D.pessoas){if(out.has(p.id))continue;for(const s of kCj(p.id)){const q=out.get(s);if(q&&q.pr){out.set(p.id,{pr:q.pr==='o próprio'?'cônjuge':`cônjuge de ${q.pr} (${BY[s].n})`,g:q.g,af:1});break}}}
  // (em empate a linha prefere pais/filhos às ligações abreviadas)
  // ligação indireta: pessoa rotulada mais próxima (pais/filhos/cônjuges), por BFS a partir de todas as rotuladas
  const seen=new Map();let fr=[];for(const [i,q] of out){if(!q.ind){seen.set(i,[i,0]);fr.push(i)}}
  while(fr.length){const nx=[];for(const x of fr){const [src,d]=seen.get(x);for(const y of [...kPa(x),...kFl(x),...kCj(x)]){if(seen.has(y))continue;seen.set(y,[src,d+1]);nx.push(y);
    if(!out.has(y)){const q=out.get(src);out.set(y,{pr:`ligado a ${BY[src].n} (${q.pr}) — ${d+1} passo(s)`,g:null,ind:1})}}}fr=nx}
  return out;
}
function egoLines(ego){
  const dist=new Map([[ego,0]]),prev=new Map(),H=[[0,0,ego]];let c=0;
  const push=x=>{H.push(x);let i=H.length-1;while(i>0){const j=(i-1)>>1;if(H[j][0]<H[i][0]||(H[j][0]===H[i][0]&&H[j][1]<=H[i][1]))break;[H[i],H[j]]=[H[j],H[i]];i=j}};
  const pop=()=>{const t=H[0],l=H.pop();if(H.length){H[0]=l;let i=0;for(;;){let m=i;const a=2*i+1,b=a+1;const lt=(p,q)=>H[p][0]<H[q][0]||(H[p][0]===H[q][0]&&H[p][1]<H[q][1]);if(a<H.length&&lt(a,m))m=a;if(b<H.length&&lt(b,m))m=b;if(m===i)break;[H[i],H[m]]=[H[m],H[i]];i=m}}return t};
  while(H.length){const [d,,i]=pop();if(d>(dist.get(i)??1e9))continue;
    const pa=kPa(i), sibs=[...new Set(pa.flatMap(kFl))].filter(x=>x!==i);
    const sobs=[...new Set(sibs.flatMap(kFl))];
    const tios=[...new Set(pa.flatMap(pp=>[...new Set(kPa(pp).flatMap(kFl))].filter(u=>u!==pp&&!pa.includes(u))))];
    const primos=[...new Set(pa.flatMap(pp=>kPa(pp).flatMap(g=>kFl(g).filter(u=>u!==pp).flatMap(kFl))))].filter(x=>x!==i&&!sibs.includes(x));
    const nb=[...pa.map(x=>[x,1,'par']),...kFl(i).map(x=>[x,1,'fil']),...sibs.map(x=>[x,1.001,'ir']),...tios.map(x=>[x,1.002,'tio']),...primos.map(x=>[x,1.003,'prim']),...sobs.map(x=>[x,1.002,'sob']),...kCj(i).map(x=>[x,1.5,'cj'])];
    for(const [n,w,r] of nb){const nd=d+w;if(nd<(dist.get(n)??1e9)){dist.set(n,nd);prev.set(n,[i,r]);push([nd,++c,n])}}}
  const L=new Map();
  for(const p of D.pessoas){const i=p.id;if(!dist.has(i)){L.set(i,[]);continue}
    const path=[i];let x=i;while(prev.has(x)){x=prev.get(x)[0];path.push(x)}path.reverse();
    L.set(i,path.map((y,k)=>k===0?[y,'eu']:[y,relOf(prev.get(y)[1],y)]))}
  return L;
}
function applyEgo(){
  if(EGO===ROOT0){for(const p of D.pessoas){p.pr=p._pr0;p.g=p._g0;p.ln=p._ln0}}
  else{const K=egoKin(EGO),L=egoLines(EGO);for(const p of D.pessoas){const k=K.get(p.id);p.pr=k?k.pr:'sem ligação conhecida';p.g=k?k.g:null;p.ln=L.get(p.id)||[]}}
  applyAnchor();
  $('#home').href='#p'+hk(EGO);$('#home').title='Ir para o perfil de '+(BY[EGO]?.n||'');
  $('#egoq').value=BY[EGO]?.n||'';
  if(!GESTOR){$('#egoq').value=BY[EGO]?.n||'';$('#egoq').readOnly=true;$('#egonote').textContent='Parentescos, âmbito, geração e ramo em relação a '+egoNome()+'.';return}
  $('#egonote').innerHTML=EGO===ROOT0?'Parentescos, âmbito, geração e ramo em relação ao Tiago.':`Parentescos, linhas, âmbito, geração e ramo em relação a ${esc(egoNome())}. <button class="linkbtn" id="egoreset">Voltar ao Tiago</button>`;
  const r=$('#egoreset');if(r)r.onclick=()=>setEgo(ROOT0);
}

// ---------- âncora da árvore: âmbito, geração e ramo calculados a partir de uma pessoa (porta de build.py: kinship, âmbito)
const ancA=()=>ANCORA!==null?ANCORA:EGO;
// nomes próprios + último apelido (com o prefixo «D.» quando decidido)
const nomeCurto=p=>{const full=String(p.n0||p.n||'').replace(/\(.*?\)/g,'').trim(),w=full.split(/\s+/);const gv=(p.gv||w[0]||'').trim();const last=w.length>gv.split(/\s+/).length?w[w.length-1]:'';return (p.np?p.np+' ':'')+gv+(last?' '+last:'')};
const pNome=p=>{const w=String(p.n0||p.n||'').replace(/\(.*?\)/g,'').trim().split(/\s+/);return w[0]||''};
const ancNome=()=>{const p=BY[EGO];if(!p)return 'Tiago';const w=String(p.n0||p.n).replace(/\(.*?\)/g,'').trim().split(/\s+/);return (p.np?p.np+' ':'')+w[0]+(w.length>1?' '+w[w.length-1]:'')};
function tabOf(h){return h==='arvore'||h.startsWith('ancora-')?'arvore':(['tiago','validar','operador','gestao'].includes(h)?h:'')}
function anchorCalc(A){
  const sp=kCj(A)[0], roots=[A].concat(sp!==undefined?[sp]:[]);
  const gen=new Map();for(const r of roots)for(const [x,g] of kGen(r,kPa))if(!gen.has(x)||gen.get(x)>g)gen.set(x,g);
  const why=new Map(),add=(i,w)=>{if(!why.has(i))why.set(i,w)};
  const st=[...gen].filter(([,g])=>g===3).map(([i])=>i),desc=new Set();
  while(st.length){const i=st.pop();if(desc.has(i))continue;desc.add(i);for(const s of kCj(i)){add(s,'cônjuge de descendente dos bisavós');st.push(...kFl(s))}st.push(...kFl(i))}
  for(const i of desc)add(i,'descendente dos bisavós');
  for(const [i,w] of [...why])if(w==='cônjuge de descendente dos bisavós')for(const s2 of kCj(i))add(s2,'outro cônjuge de cônjuge');
  for(const [i,g] of gen)add(i,`antepassado G${g}`);
  for(const [a,g] of gen){if(g<3)continue;
    for(const s of kCj(a))if(!gen.has(s))add(s,'2.º cônjuge de antepassado');
    const sibs=new Set(kPa(a).flatMap(kFl));sibs.delete(a);
    for(const s of sibs){if(gen.has(s))continue;add(s,'irmão de antepassado');for(const c of kCj(s))add(c,'cônjuge de irmão de antepassado');for(const c of kFl(s))add(c,'filho de irmão de antepassado')}}
  // ramos: avós de cada raiz
  const ramos=new Map();
  for(const r of roots)for(const [gp,g] of kGen(r,kPa))if(g===2){const w=String(BY[gp].n0||BY[gp].n).trim().split(/\s+/);const lab=`${w[w.length-1]} (${w[0]}) — ${pNome(BY[r])}`;
    for(const x of kGen(gp,kPa).keys()){if(!ramos.has(x))ramos.set(x,new Set());ramos.get(x).add(lab)}}
  const out=new Map();
  for(const [ri,r] of roots.entries())for(const [i,[a,b,anc]] of kBlood(r)){if(out.has(i))continue;
    out.set(i,{g:a-b,r:a>=2?[...(ramos.get(anc)||[])].sort():[ri===0?'família próxima':`família próxima (${pNome(BY[r])})`]})}
  for(const p of D.pessoas){if(out.has(p.id))continue;for(const s of kCj(p.id)){const q=out.get(s);if(q&&!q.af){out.set(p.id,{g:q.g,r:q.r,af:1});break}}}
  let fr=[...out.keys()];const seen=new Set(fr);
  while(fr.length){const nx=[];for(const x of fr)for(const y of [...kPa(x),...kFl(x),...kCj(x)]){if(seen.has(y))continue;seen.add(y);nx.push(y);if(!out.has(y))out.set(y,{g:null,r:out.get(x).r})}fr=nx}
  return {why,gen,out};
}
function applyAnchor(){
  const A=EGO;   // a base, não a âncora da árvore (Tiago, 22/11)
  if(A===ROOT0){for(const p of D.pessoas){p.c=p._c0;p.r=p._r0;p.g=p._g0}}
  else{const {why,gen,out}=anchorCalc(A);
    for(const p of D.pessoas){if(p.del){p.c=p.del.estado_mh==='no_mh'?'apagada no MH':'a apagar no MH';p.r=[];p.g=null;p.an=false;continue}const o=out.get(p.id);p.c=why.get(p.id)||'fora das regras (a partir da pessoa base)';p.r=o?o.r:[];p.g=o?o.g:null;p.an=gen.has(p.id)&&gen.get(p.id)>0}}
  const sel=(id,vals,lbl,first)=>{const el=$('#'+id),cur=el.value;el.innerHTML=`<option value="">${first}</option>`+vals.map(v=>`<option value="${esc(v)}">${esc(lbl(v))}</option>`).join('');if([...el.options].some(o=>o.value===cur))el.value=cur};
  sel('fgen',[...new Set(D.pessoas.map(p=>p.g).filter(g=>g!==null&&g!==undefined))].sort((a,b)=>b-a),g=>'Geração '+genLbl(g),'Todas as gerações');
  sel('fcat',[...new Set(D.pessoas.map(p=>p.c))].sort(),c=>c,'Todo o âmbito');
  sel('framo',[...new Set(D.pessoas.flatMap(p=>p.r))].sort(),c=>c,'Todos os ramos');
  // título: Família de <pessoa base> (e cônjuge)
  let t='Tiago e Catarina';
  if(A!==ROOT0){const p=BY[A],sp=kCj(A)[0];t=sp!==undefined?`${nomeCurto(p)} e ${nomeCurto(BY[sp])}`:nomeCurto(p)}
  $('#titulo').textContent='Família de '+t;document.title='Família de '+t;
  const bar=$('#ancbar');
  if(GESTOR&&ANCORA!==null&&BY[ANCORA]){bar.hidden=false;bar.innerHTML=`Árvore ancorada em: <b>${esc(BY[ANCORA].n)}</b> — <button class="linkbtn" id="ancreset">repor</button>`;$('#ancreset').onclick=()=>setAnchor(null)}
  else bar.hidden=true;
}
function setAnchor(id,fromHash){
  if(!GESTOR)return;
  ANCORA=id;try{id===null?localStorage.removeItem('arv-ancora'):localStorage.setItem('arv-ancora',JSON.stringify(id))}catch(e){}
  applyEgo();list();
  if(fromHash)return;
  if(location.hash.startsWith('#ancora-'))location.hash='arvore';else route();
}
// só fonte local: quando a fonte local é a imagem do próprio assento, é fonte primária
const slImg=fl=>(fl||[]).some(x=>/—\s*\**Assento\b/.test(x.ti||''));
const slPill=fl=>`<span class="pill s-local">só fonte local${slImg(fl)?' · imagem do assento':''}</span>`;
// transcrições: põe a negrito o nome da pessoa da ficha e o que o assento diz logo a seguir (profissão, naturalidade…)
const NSTOP=new Set(['de','da','do','das','dos','e']);
const NCOMUM=new Set(['maria','jose','joao','antonio','manuel','ana','francisco','joaquim','joana','catarina','isabel','domingos','pedro','luis','luiz']);
// grafia antiga e abreviaturas dos assentos: «M.el», «Roiz», «Izabel», «Catherina», «Manoel»… comparam como o nome atual
const NABR={mel:'manuel',mo:'manuel',manoel:'manuel',ma:'maria',anto:'antonio',ant:'antonio',frco:'francisco',franco:'francisco',franca:'francisca',frca:'francisca',roiz:'rodrigues',rois:'rodrigues',glz:'goncalves',frz:'fernandes',fz:'fernandes',domos:'domingos',rs:'rodrigues',dis:'dias',pumar:'pomar',joam:'joao',bapta:'baptista',catna:'catarina',josep:'jose',josef:'jose',jose:'jose',ingracia:'engracia',breatis:'beatris',luis:'luis'};
const ntok=w=>{let t=nrm(w).replace(/º/g,'o').replace(/ª/g,'a').replace(/^d'/,'').replace(/[.']/g,'');
  t=t.replace(/ph/g,'f').replace(/th/g,'t').replace(/y/g,'i').replace(/z/g,'s').replace(/([a-z])\1/g,'$1').replace(/^h(?=[aeiou])/,'').replace(/qu(?=[aou])/g,'c').replace(/oel$/,'uel').replace(/terina$/,'tarina');
  return NABR[t]||t};
function lev(a,b){if(Math.abs(a.length-b.length)>2)return 9;let r=[...Array(b.length+1).keys()];for(let i=1;i<=a.length;i++){let q=[i];for(let j=1;j<=b.length;j++)q[j]=Math.min(r[j]+1,q[j-1]+1,r[j-1]+(a[i-1]===b[j-1]?0:1));r=q}return r[b.length]}
// negrito anotado à mão por pessoa e por imagem (campo «neg» do build): trechos exatos; ['∅'] = nada; a 1.ª linha (fonte) nunca fica a negrito
function boldNeg(txt,L,X){const sp=[],ex=[],i0=Math.max(0,txt.indexOf('\n'));for(const f of X||[]){if(!f)continue;let i=i0;while((i=txt.indexOf(f,i))>=0){ex.push([i,i+f.length]);i+=f.length}}
  for(const f of L){if(!f||f==='∅')continue;let i=i0;while((i=txt.indexOf(f,i))>=0){if(!ex.some(([a,b])=>i>=a&&i+f.length<=b)&&!sp.some(([a,b])=>i<b&&i+f.length>a))sp.push([i,i+f.length]);i+=f.length}}
  sp.sort((a,b)=>a[0]-b[0]);let out='',pos=0;for(const [i,j] of sp){out+=esc(txt.slice(pos,i))+'<b>'+esc(txt.slice(i,j))+'</b>';pos=j}return out+esc(txt.slice(pos))}
// nomes próprios usados na árvore (normalizados): servem para saber se a palavra antes de um nome é outro nome de pessoa
let GIVEN=null;
function givenSet(){if(GIVEN)return GIVEN;GIVEN=new Set(NCOMUM);for(const q of D.pessoas)for(const w of String(q.gv||'').split(/\s+/)){const t=ntok(w);if(t&&!NSTOP.has(t))GIVEN.add(t)}return GIVEN}
function boldPessoa(txt,p,main,what){
  const T=new Set();
  for(const n of [p.n,...(p.nv||[]).map(x=>x.v)])for(const w of String(n||'').split(/[\s,()]+/)){const t=ntok(w);if(t&&!NSTOP.has(t))T.add(t)}
  const first=ntok(String(p.gv||p.n||'').split(/\s+/)[0]);
  const W=[...txt.matchAll(/[A-Za-zÀ-ÿºª]+(?:['.][A-Za-zÀ-ÿºª]+)*/g)].map(m=>({t:ntok(m[0]),i:m.index,j:m.index+m[0].length}));
  const has=t=>{if(T.has(t))return t;if(t.length<5)return null;for(const u of T)if(u.length>=5&&lev(t,u)<=(Math.min(t.length,u.length)>=8?2:1))return u;return null};
  const spans=[];let usedMain=false;
  for(let k=0;k<W.length;k++){
    if(!has(W[k].t))continue;
    let e=k,got=[has(W[k].t)];
    while(e+1<W.length){
      const gap=txt.slice(W[e].j,W[e+1].i);if(!/^\s+$/.test(gap))break;
      if(has(W[e+1].t)){e++;got.push(has(W[e].t));continue}
      if(NSTOP.has(W[e+1].t)&&e+2<W.length&&has(W[e+2].t)&&/^\s+$/.test(txt.slice(W[e+1].j,W[e+2].i))){e+=2;got.push(has(W[e].t));continue}
      break}
    // nome dentro de um nome mais longo de outra pessoa («Lúcio António de Sousa Campos»): a palavra anterior, com maiúscula, não é desta pessoa
    if(k>0&&/^\s+$/.test(txt.slice(W[k-1].j,W[k].i))&&/^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]/.test(txt.slice(W[k-1].i))&&!NSTOP.has(W[k-1].t)&&!has(W[k-1].t)&&givenSet().has(W[k-1].t)){k=e;continue}
    // e o simétrico, só para um nome próprio comum sozinho: «neto de António Joaquim…» é outra pessoa
    if(got.length===1&&NCOMUM.has(got[0])&&e+1<W.length&&/^\s+$/.test(txt.slice(W[e].j,W[e+1].i))&&/^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]/.test(txt.slice(W[e+1].i))&&!NSTOP.has(W[e+1].t)&&!has(W[e+1].t)){k=e;continue}
    // nome próprio comum sozinho («Maria», «Catherina») só conta se a pessoa é a protagonista do assento, e só a 1.ª vez
    const ok=got.includes(first)&&(got.length>=2||!NCOMUM.has(first)||(main&&!usedMain&&(usedMain=true)));
    if(!ok){k=e;continue}
    let end=W[e].j;{const m=txt.slice(end).match(/^\s*\(\d+\)/);if(m)end+=m[0].length}
    // estende ao aposto que se segue («, ferreiro, natural de…») até ao fim da oração
    if(txt[end]===','){const rest=txt.slice(end);const m=rest.search(main?/;|\.(?=\s+[A-ZÀ-Ú«]|\s*$)|»|, e (?:de|da|do|a|o) |, filh|, net[oa]|, os quaes|, «|,? (?:ambos|ambas|todos|todas)\b|, e ella|, e elle|\(continua/:/;|, (?:e que )?nasc|, foi bapti|, bapti|, falec|\.(?=\s+[A-ZÀ-Ú«]|\s*$)|»|, e (?:de|da|do|a|o) |, filh|, net[oa]|, os quaes|, «|,? (?:ambos|ambas|todos|todas)\b|, e ella|, e elle|\(continua/);
      const lim=m<0?Math.min(rest.length,160):Math.min(m,200);if(lim>1)end+=lim}
    // e para trás: «um indivíduo do sexo masculino a quem dei o nome de …» também é sobre a pessoa
    let ini=W[k].i;{const m=txt.slice(Math.max(0,ini-160),ini).match(/(?:um|uma)\s+ind[ií]v[ií]du[oa]\b[^.;»«]*?(?:o\s+nome\s+de|nome)\s*$/i);if(m)ini-=m[0].length}
    spans.push([ini,end]);k=e;
    while(k+1<W.length&&W[k+1].i<end)k++;
  }
  if(!spans.length&&/^Casamento/i.test(what||''))for(const m of txt.matchAll(/[^.;,«»]*\b(?:c[ôo]njuges|nubentes|noivos|contrahentes)\b[^.;,«»]*/gi)){const lead=m[0].match(/^\s*/)[0].length;spans.push([m.index+lead,m.index+m[0].length])}
  let out='',pos=0;for(const [i,j] of spans){out+=esc(txt.slice(pos,i))+'<b>'+esc(txt.slice(i,j))+'</b>';pos=j}
  return out+esc(txt.slice(pos));
}
function tbox(id,cls,tk){
  const q=id!==undefined&&id!==null?BY[id]:null;
  const k=tk?` data-tk="${tk}"`:'';
  if(!q)return `<div class="tb empty"${k}>—</div>`;
  // foto de perfil: miniatura fixa à esquerda (32×40), só quando existe; imagem privada preenchida por APP.media
  const ft=q.ft&&q.ft.web?`<img class="tft" data-m="${esc(q.ft.web)}" alt="" loading="lazy">`:'';
  return `<div class="tb ${cls||''}${ft?' hasft':''} sx-${esc(q.s||'')}"${k}>${ft}<button class="tn" data-go="${esc(q.id)}">${esc(q.n)}</button><small>${q.nb?'n. '+esc(q.nb):'n. ?'}${q.nm?' · † '+esc(q.nm):''}</small><small>${esc(q.pr||'')}</small>${cls==='root'?`<button class="ta" data-go="${esc(q.id)}">abrir a ficha</button>`:!GESTOR?'':`<button class="ta" data-anc="${esc(q.id)}">⚓ ancorar aqui</button>`}</div>`;
}
let TREE_RO=null,TREE_EXP=new Map(),TREE_EXP_A=null,TREE_KEEP=null,TREE_LAST_A=null;   // níveis expandidos na árvore (Tiago, 22/11)
// irmã/irmãs só quando todos os irmãos mostrados são do sexo feminino (Tiago, 22/11)
const irmL=(L,n)=>{const f=L.length>0&&L.every(x=>BY[x]?.s==='F');return n===1?(f?'irmã':'irmão'):(f?'irmãs':'irmãos')};
// «irmãos»: os irmãos abrem ao lado da pessoa, que fica no mesmo sítio, com as mesmas caixas da árvore, lado a lado; não muda a âncora (Tiago, 22/11; artifact v144)
function showSibs(id,tk,tin,stay,pick,kind){
  kind=kind||'sib';
  const q=BY[id],bx=tin.querySelector(`[data-tk="${tk}"]`),bt=tin.querySelector(`.tm-${kind}[data-tk="${tk}"]`);if(!q||!bx||!bt)return;
  const rightSide=bt.dataset.side==='r';
  // ordem do mais velho para o mais novo, com dia e mês quando a árvore os tem (nascimento; senão batismo; senão o ano mostrado)
  const yr=x=>{const z=BY[x]||{},F=z.f||[];for(const tp of [['Nascimento'],['Batizado','Batismo']]){const f=F.find(g=>tp.includes(g.tipo)&&/\d{4}/.test(g.data||''));if(f){const m=/(\d{1,2})\/(\d{1,2})\/(\d{4})|(\d{1,2})\/(\d{4})|(\d{4})/.exec(f.data);return m[3]?+m[3]*10000+m[2]*100+ +m[1]:m[5]?+m[5]*10000+m[4]*100:+m[6]*10000}}const m=/\d{4}/.exec(z.nb||'');return m?+m[0]*10000:99999999};
  const L=kind==='cj'?[...((tin._cjl||{})[tk]||[])]:kind==='as'?[...((tin._asl||{})[tk]||[])]:kind==='ds'?[...((tin._dsl||{})[tk]||[])].sort((a,b)=>yr(a)-yr(b)):[...(q.ir||[]).filter(kOk)].sort((a,b)=>yr(a)-yr(b));
  const old=tin.querySelector('.sibrow'),again=old&&old.dataset.tk===tk&&old.dataset.kind===kind;
  tin.querySelectorAll('.sibrow').forEach(e=>e.remove());tin.querySelectorAll('.sibsel').forEach(e=>e.classList.remove('sibsel'));tin.querySelectorAll('.tmbtn.on').forEach(e=>e.classList.remove('on'));if(tin.style.paddingLeft||tin.style.paddingTop||tin.style.paddingBottom){tin.style.paddingLeft='';tin.style.paddingTop='';tin.style.paddingBottom='';tin._draw&&tin._draw()}
  if(again||!L.length)return;
  // o próprio botão «irmãos» é a ligação: a faixa abre logo à esquerda dele, à altura da caixa da pessoa
  const el=document.createElement('div');el.className='sibrow';el.dataset.tk=tk;el.dataset.kind=kind;el.style.cssText='left:0;top:0;visibility:hidden';
  el.innerHTML=`<div class="sibhd"><span>${kind==='as'?'Ascendentes':kind==='ds'?((tin._dso||{})[tk]?'Outros descendentes':'Descendentes'):kind==='cj'?((tin._cjo||{})[tk]?'Outros cônjuges':'Cônjuges'):esc(L.length&&L.every(x=>BY[x]?.s==='F')?'Irmãs':'Irmãos')} de ${esc(q.n)} (${L.length})</span><button type="button" class="sibx" aria-label="Fechar">✕</button></div><div class="sibcols">${L.map(x=>tbox(x,'')).join('')}</div>`;
  bx.classList.add('sibsel');bt.classList.add('on');tin.appendChild(el);if(window.APP&&APP.media)APP.media(el);
  for(const q of tin._path||[]){if(q.tk===tk&&q.kind===kind){const a=el.querySelector(`[data-anc="${q.id}"]`),t=a&&a.closest('.tb');if(t)t.classList.add('tb-path')}}
  const f=el.querySelector('.tb'),PAD=14,GAP=6,w0=Math.max(200,[...el.querySelectorAll('.sibcols .tb')].reduce((a,x)=>a+x.getBoundingClientRect().width,0)+(L.length-1)*8+PAD);   // soma das larguras reais (as caixas com foto são mais largas)
  if(kind==='as'||kind==='ds'){   // as faixas dos ascendentes/descendentes abrem por cima/por baixo do botão
    el.style.width=w0+'px';const h=el.getBoundingClientRect().height,btn=()=>tin.querySelector(`.tm-${kind}[data-tk="${tk}"]`);
    let O1=tin.getBoundingClientRect(),bb=btn().getBoundingClientRect(),topY;
    if(kind==='as'){topY=bb.top-O1.top-GAP-h;
      if(topY<6){tin.style.paddingTop=Math.ceil(parseFloat(getComputedStyle(tin).paddingTop)+6-topY)+'px';tin._draw&&tin._draw();O1=tin.getBoundingClientRect();bb=btn().getBoundingClientRect();topY=bb.top-O1.top-GAP-h}}
    else{topY=bb.bottom-O1.top+GAP;const falta=topY+h+6-O1.height;if(falta>0){tin.style.paddingBottom=Math.ceil(parseFloat(getComputedStyle(tin).paddingBottom)+falta)+'px';O1=tin.getBoundingClientRect()}}
    el.style.left=Math.max(0,bx.getBoundingClientRect().left-O1.left)+'px';el.style.top=topY+'px';el.style.visibility='';
    try{el.scrollIntoView({block:'nearest',inline:'nearest'})}catch(e){}
  }else{
  const O=tin.getBoundingClientRect(),rbx=(()=>{if(tk!=='r')return bx;let m=bx;tin.querySelectorAll('.tb').forEach(e=>{if(/^s\d+$/.test(e.dataset.tk||'')&&e.getBoundingClientRect().left<m.getBoundingClientRect().left)m=e});return m})(),   // a âncora com cônjuges à esquerda: a faixa abre à esquerda do mais afastado
    ref=()=>(kind==='cj'||bt.dataset.in==='1'?rbx:bt).getBoundingClientRect(),b0=ref();   // «outros cônjuges»: o botão está dentro da caixa, a faixa abre ao lado da caixa
  let bl=b0.left-O.left;const defic=rightSide?0:w0-(bl-GAP);
  if(defic>0){tin.style.paddingLeft=Math.ceil(defic)+'px';tin._draw&&tin._draw();bl=(kind==='cj'||bt.dataset.in==='1'?rbx:tin.querySelector(`.tm-${kind}[data-tk="${tk}"]`)).getBoundingClientRect().left-O.left}   // sem espaço à esquerda: a árvore desloca-se para a direita, redesenha-se e volta a medir o botão
  const w=w0;   // os irmãos ficam sempre lado a lado, numa só linha
  el.style.width=w+'px';
  const e0=el.getBoundingClientRect(),f0=f.getBoundingClientRect(),r=bx.getBoundingClientRect(),O2=tin.getBoundingClientRect();
  el.style.left=(rightSide?b0.right-O2.left+GAP:bl-GAP-w)+'px';el.style.top=(r.top-O2.top-(f0.top-e0.top))+'px';el.style.visibility='';
  {const t0=parseFloat(el.style.top);if(t0<4){const dl=Math.ceil(4-t0);tin.style.paddingTop=(parseFloat(getComputedStyle(tin).paddingTop)+dl)+'px';tin._draw&&tin._draw();el.style.top=(t0+dl)+'px'}}   // o cabeçalho da faixa não pode ficar por cima do topo da árvore
  {const tr=tin.parentElement,a=tr.getBoundingClientRect(),b=el.getBoundingClientRect();if(b.left<a.left+8)tr.scrollLeft-=a.left+8-b.left;else if(b.right>a.right-8)tr.scrollLeft+=b.right-a.right+8}
  }
  el.addEventListener('click',e=>{if(e.target.closest('.sibx')){el.remove();tin.querySelectorAll('.sibsel').forEach(z=>z.classList.remove('sibsel'));tin.querySelectorAll('.tmbtn.on').forEach(z=>z.classList.remove('on'));if(tin.style.paddingLeft||tin.style.paddingTop||tin.style.paddingBottom){tin.style.paddingLeft='';tin.style.paddingTop='';tin.style.paddingBottom='';tin._draw&&tin._draw()}return}const g=e.target.closest('[data-go]');if(g){pick(BY[g.dataset.go]?.id);return}const a=e.target.closest('[data-anc]');if(a)stay(BY[a.dataset.anc].id)});
}
function renderTree(){
  // centro: o perfil ativo (a ficha aberta); a âncora só define o título, o âmbito e os parentescos
  if(!BY[CUR]||BY[CUR].del)CUR=ancA();
  const A=BY[CUR]?BY[CUR].id:ancA(),a=BY[A];if(!a){$('#main').innerHTML='<div class="empty">Pessoa não encontrada.</div>';return}
  const pais=i=>{const L=kPa(i).map(x=>BY[x]).filter(Boolean);const f=L.find(x=>x.s==='M'),m=L.find(x=>x.s==='F');const r=[f,m];for(const x of L)if(x!==f&&x!==m)r[r.indexOf(undefined)]=x;return r.map(x=>x?x.id:null)};
  const rows=[];let lvl=[A];
  for(let k=1;k<=3;k++){lvl=lvl.flatMap(i=>i===null?[null,null]:pais(i));if(lvl.every(x=>x===null))break;rows.push(lvl)}
  const LBLG=['Pais','Avós','Bisavós'];
  const CELL=200,W=rows.length?CELL*rows[rows.length-1].length:0;
  // cada geração ocupa a mesma largura: os pais ficam centrados por cima do filho
  const upH=rows.map((r,k)=>`<div class="tgrp" data-lv="a${k}"><div class="tlab">${LBLG[k]}</div><div class="trow" style="width:${W}px;grid-template-columns:repeat(${r.length},1fr)">${r.map((i,j)=>{const ch=k?rows[k-1][j>>1]:A;return ch===null?'<div></div>':tbox(i,'',`a${k}_${j}`)}).join('')}</div></div>`);
  const sps=kCj(A),fl0=kFl(A);
  // os filhos ficam junto do cônjuge de quem são filhos (à esquerda, sem cônjuge mostrado ao meio, à direita) e a linha sai do traço entre os dois pais (Tiago, 22/11)
  const oth=c=>kPa(c).find(x=>x!==A&&sps.includes(x)),rk=c=>{const o=oth(c);return o===undefined?1:sps.indexOf(o)%2?0:2};
  const fl=fl0.map((c,i)=>[c,i]).sort((a,b)=>rk(a[0])-rk(b[0])||a[1]-b[1]).map(x=>x[0]);
  const fg=fl.map(c=>{const o=oth(c);return o===undefined?null:'s'+sps.indexOf(o)});
  // há mais gente para lá do que se mostra: linha tracejada para cima (pais dos bisavós) e para baixo (filhos dos netos)
  const topK=rows.length-1,upMore=rows.length&&topK===2?rows[topK].map((i,j)=>i!==null&&kPa(i).length?`a${topK}_${j}`:null).filter(Boolean):[];
  const sibs=[];{const nir=x=>x===null||x===undefined?0:(BY[x]?.ir||[]).filter(kOk).length,lbl=x=>{const L=(BY[x]?.ir||[]).filter(kOk);return `${L.length} ${irmL(L,L.length)}`};
    if(nir(A))sibs.push(['r',A,lbl(A)]);rows.forEach((r,k)=>r.forEach((x,j)=>{if(nir(x))sibs.push([`a${k}_${j}`,x,lbl(x)])}));
    // também os cônjuges da âncora e os dos filhos (os irmãos deles não aparecem na árvore): a faixa abre para o lado de fora
    sps.forEach((x,i)=>{if(nir(x))sibs.push([`s${i}`,x,lbl(x),i%2?'l':'r'])});fl.forEach((c,i)=>kCj(c).forEach((x,j)=>{if(nir(x))sibs.push([`c${i}s${j}`,x,lbl(x),'r'])}))}
  const dnMore=[];fl.forEach((c,i)=>kFl(c).forEach((g,j)=>{if(kFl(g).length)dnMore.push(`g${i}_${j}`)}));
  const ng=fl.reduce((n,c)=>n+kFl(c).length,0);
  // uma geração por linha: filhos (com os cônjuges) numa linha, netos na linha de baixo, cada grupo por baixo dos pais
  // níveis expandidos pelos botões «ascendentes»/«descendentes» (não os «outros»): cada clique acrescenta um nível só desse ramo; o mesmo botão recolhe-o (Tiago, 22/11)
  if(TREE_EXP_A!==A){TREE_EXP=new Map();TREE_EXP_A=A}
  const shown=new Set([A,...sps,...fl,...rows.flat().filter(x=>x!==null),...fl.flatMap(c=>kCj(c)),...fl.flatMap(c=>kFl(c))]);
  const tkOf=new Map([[A,'r']]);rows.forEach((r,k)=>r.forEach((x,j)=>{if(x!==null)tkOf.set(x,`a${k}_${j}`)}));sps.forEach((x,i)=>tkOf.set(x,`s${i}`));
  fl.forEach((c,i)=>{tkOf.set(c,`c${i}`);kCj(c).forEach((x,j)=>tkOf.set(x,`c${i}s${j}`));kFl(c).forEach((g,j)=>tkOf.set(g,`g${i}_${j}`))});
  const lvX=new Map(),lvOf=tk=>tk.startsWith('x_')?lvX.get(tk):/^a\d+_/.test(tk)?'a'+/^a(\d+)_/.exec(tk)[1]:(tk==='r'||/^s\d+$/.test(tk))?'anc':tk[0]==='c'?'fil':'net';
  const bands=new Map(),xkind=new Map(),nbY=y=>{const m=/\d{4}/.exec(BY[y]?.nb||'');return m?+m[0]:9999};
  {const done=new Set();let ch=true;while(ch){ch=false;for(const [key,{kind,id}] of TREE_EXP){if(done.has(key))continue;const tk=tkOf.get(id);if(!tk)continue;done.add(key);ch=true;
    const L=kind==='as'?kPa(id).filter(y=>!shown.has(y)).sort((a,b)=>(BY[a]?.s==='M'?0:1)-(BY[b]?.s==='M'?0:1)):kFl(id).filter(y=>!shown.has(y)).sort((a,b)=>nbY(a)-nbY(b));if(!L.length)continue;
    const bid=(kind==='as'?'up:':'dn:')+lvOf(tk);if(!bands.has(bid))bands.set(bid,{id:bid,groups:[]});bands.get(bid).groups.push({fromTk:tk,kind,ids:L});
    L.forEach(y=>{shown.add(y);tkOf.set(y,'x_'+y);lvX.set('x_'+y,bid);xkind.set(y,kind)})}}}
  const around=L=>{const u=bands.get('up:'+L),d=bands.get('dn:'+L);return [...(u?around(u.id):[]),L,...(d?around(d.id):[])]};
  const bandH=(id,st)=>`<div class="tband" data-band="${id}"${st?` style="${st}"`:''}>${bands.get(id).groups.flatMap(g=>g.ids).map(y=>tbox(y,'','x_'+y)).join('')}</div>`;
  const togX=(kind,id)=>{const k=kind+':'+id;if(TREE_EXP.has(k))TREE_EXP.delete(k);else TREE_EXP.set(k,{kind,id});const t=$('#tin');TREE_KEEP={x:t?t.parentElement.scrollLeft:0,y:window.scrollY};renderTree()};
  const up=rows.map((r,k)=>k).reverse().map(k=>around('a'+k).map(L=>L==='a'+k?upH[k]:bandH(L)).join('')).join('');
  const aA=around('anc'),ai=aA.indexOf('anc'),ancPre=aA.slice(0,ai).map(L=>bandH(L)).join(''),ancPost=aA.slice(ai+1).map(L=>bandH(L)).join('');
  const gl=fl.length?[...around('fil'),...(ng?['LBL',...around('net')]:[])]:[];
  const kids=gl.map((L,ri)=>{const r=ri+1;return L==='fil'?fl.map((c,i)=>`<div class="tunit" style="grid-row:${r};grid-column:${i+1}">${tbox(c,'',`c${i}`)}${kCj(c).map((s,j)=>tbox(s,'',`c${i}s${j}`)).join('')}</div>`).join(''):L==='LBL'?`<div class="tlab" style="grid-row:${r}">Netos (${ng})</div>`:L==='net'?fl.map((c,i)=>`<div class="tgk" style="grid-row:${r};grid-column:${i+1}">${kFl(c).map((g,j)=>tbox(g,'',`g${i}_${j}`)).join('')}</div>`).join(''):bandH(L,`grid-row:${r};grid-column:1/-1`)}).join('');
  $('#main').innerHTML=`<div class="sec"><h2>Árvore de ${esc(a.n)}</h2><div class="muted">Antepassados para cima, descendentes para baixo. Toque num nome para o pôr no centro (passa a ser o perfil ativo); toque na pessoa do centro para abrir a ficha.${A!==EGO?` <button type="button" class="tmbtn tm-base" id="ancreset2" title="Voltar a pôr a pessoa base no centro da árvore">⚓ ancorar na pessoa base (${esc(egoNome())})</button> `:' Âncora: a pessoa base.'} A âncora é só o centro desta árvore; o âmbito, a geração e o ramo vêm da pessoa base (${esc(egoNome())}).</div></div>
   <div class="tree"><div class="tin${upMore.length?' mup':''}${dnMore.length?' mdn':''}" id="tin"><svg id="tsvg" aria-hidden="true"></svg>${up}${ancPre}
   <div class="tgrp"><div class="tlab">Perfil ativo${sps.length?' e cônjuge':''}</div><div class="tcenter">${sps.map((s,i)=>i%2?tbox(s,'',`s${i}`):'').reverse().join('')}${tbox(A,'root','r')}${sps.map((s,i)=>i%2?'':tbox(s,'',`s${i}`)).join('')}</div></div>${ancPost}
   <div class="tgrp"><div class="tlab">Filhos (${fl.length})</div>${fl.length?`<div class="tkids" style="grid-template-columns:repeat(${fl.length},auto)">${kids}</div>`:'<span class="muted">—</span>'}</div></div></div>`;
  // clicar num nome muda o perfil ativo e recentra a árvore; clicar no centro abre a ficha
  const pick=id=>{if(id===undefined)return;if(id===A)go(id);else recentra(id)};
  const recentra=id=>{CUR=id;document.querySelectorAll('.row').forEach(r=>r.setAttribute('aria-current',r.dataset.id==String(id)));renderTree()};
  $('#main').querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{const p=BY[b.dataset.go];if(!p)return;if(p.id===A){go(p.id);return}recentra(p.id)});
  // mudar a âncora aqui não sai da vista árvore: o endereço fica sempre em #arvore
  const stay=id=>{if(location.hash==='#arvore')setAnchor(id);else{setAnchor(id,true);location.hash='arvore'}};
  $('#main').querySelectorAll('[data-anc]').forEach(b=>b.onclick=()=>stay(BY[b.dataset.anc].id));
  const r2=$('#ancreset2');if(r2)r2.onclick=()=>{CUR=EGO;if(GESTOR&&ANCORA!==null)setAnchor(null);else renderTree()};
  window.APP.media($('#main'));
  // botões da árvore (artifact): irmãos, cônjuges, ascendentes e descendentes abrem faixas; não mudam o centro nem a âncora
  {const tin0=$('#tin');tin0.addEventListener('click',ev=>{const b=ev.target.closest('.tmbtn');if(!b)return;const m=/^(a|g)(\d+)_(\d+)$/.exec(b.dataset.tk)||[],act=b.dataset.act;let id=null;
    if(act==='ds'){const e=dsb.find(z=>z[0]===b.dataset.tk);if(e){if(b.dataset.xp)togX('ds',e[1]);else showSibs(e[1],b.dataset.tk,tin0,stay,pick,'ds')}return}
    else if(act==='sib'){const e=sibs.find(z=>z[0]===b.dataset.tk);if(e)showSibs(e[1],b.dataset.tk,tin0,stay,pick,'sib');return}
    else if(act==='as'){const e=asb.find(z=>z[0]===b.dataset.tk);if(e){if(b.dataset.xp)togX('as',e[1]);else showSibs(e[1],b.dataset.tk,tin0,stay,pick,'as')}return}
    else if(act==='cj'){const k=b.dataset.tk;const e=cjb.find(z=>z[0]===k);if(e)showSibs(e[1],k,tin0,stay,pick,'cj');return}
    if(id!==null&&id!==undefined&&BY[id])recentra(id)})}
  // «outros cônjuges»: cônjuges de quem está na árvore que a árvore não mostra (os dos pais/avós, dos cônjuges da âncora, dos cônjuges dos filhos e dos netos)
  const cjb=[],cjl={},cjo={};
  const addcj=(tk,x,side)=>{if(x===null||x===undefined)return;const L=kCj(x).filter(y=>!shown.has(y));if(L.length){const ja=kCj(x).some(y=>shown.has(y));   // «outro(s) cônjuge(s)» só se já se mostra algum cônjuge da pessoa
    cjl[tk]=L;cjo[tk]=ja;cjb.push([tk,x,`${L.length>1?L.length+' ':''}${ja?(L.length>1?'outros cônjuges':'outro cônjuge'):(L.length>1?'cônjuges':'cônjuge')} ${side==='l'?'◀':'▶'}`,side])}};
  rows.forEach((r,k)=>r.forEach((x,j)=>addcj(`a${k}_${j}`,x,'r')));sps.forEach((x,i)=>addcj(`s${i}`,x,i%2?'l':'r'));
  fl.forEach((c,i)=>{kCj(c).forEach((x,j)=>addcj(`c${i}s${j}`,x,'r'));kFl(c).forEach((g,j)=>addcj(`g${i}_${j}`,g,'r'))});
  // «descendentes»: filhos de quem está na árvore que a árvore não mostra (antepassados, cônjuges, cônjuges dos filhos e netos)
  const dsb=[],dsl={},dso={};{const addds=(tk,x)=>{if(x===null||x===undefined)return;const xp=TREE_EXP.has('ds:'+x),D2=kFl(x).filter(y=>!shown.has(y));if(D2.length||(xp&&kFl(x).length)){dsl[tk]=D2;dso[tk]=!xp&&kFl(x).some(y=>shown.has(y));dsb.push([tk,x,dso[tk],!dso[tk],xp])}};   // «outros descendentes» se já se mostra algum filho da pessoa (Tiago, 22/11)
    rows.forEach((r,k)=>r.forEach((x,j)=>addds(`a${k}_${j}`,x)));sps.forEach((x,i)=>addds(`s${i}`,x));fl.forEach((c,i)=>{kCj(c).forEach((x,j)=>addds(`c${i}s${j}`,x));kFl(c).forEach((g,j)=>addds(`g${i}_${j}`,g))});xkind.forEach((k,y)=>addds('x_'+y,y))}
  // botões dentro das caixas (irmãos, cônjuges, descendentes), um por baixo do outro, por baixo do «ancorar aqui» (Tiago, 22/11)
  const slots={};sibs.forEach(z=>(slots[z[0]]=slots[z[0]]||[]).push('sib'));cjb.forEach(z=>(slots[z[0]]=slots[z[0]]||[]).push('cj'));
  const insb=slots;
  Object.keys(slots).forEach(tk=>{const e=document.querySelector(`#tin [data-tk="${tk}"]`);if(e)e.style.paddingBottom=(6+24*slots[tk].length)+'px'});
  dsb.forEach(([tk])=>{const e=document.querySelector(`#tin [data-tk="${tk}"]`);if(e)e.style.marginBottom='28px'});   // espaço para o botão «descendentes», que fica por baixo da caixa
  const tin=$('#tin');tin._draw=()=>draw();const draw=()=>{layBands(tin);treeLines(tin,rows,sps.length,fl.map(c=>[kCj(c).length,kFl(c).length]),upMore,dnMore,sibs,fg,cjb,insb,asb,dsb)};
  // «ascendentes» dos cônjuges (da âncora e dos filhos): os pais deles, se houver na árvore
  const asb=[],asl={};const addas=(tk,x)=>{if(x===null||x===undefined)return;const P2=kPa(x);if(P2.length){asl[tk]=P2;asb.push([tk,x,true,TREE_EXP.has('as:'+x)])}};
  sps.forEach((x,i)=>addas(`s${i}`,x));fl.forEach((c,i)=>kCj(c).forEach((x,j)=>addas(`c${i}s${j}`,x)));
  upMore.forEach(tk=>{const m=/^a(\d+)_(\d+)$/.exec(tk);if(m)addas(tk,rows[+m[1]][+m[2]])});xkind.forEach((k,y)=>{if(k==='as')addas('x_'+y,y)});   // ascendentes dos antepassados de topo
  tin._bands=[...bands.values()];tin._xg=tin._bands.flatMap(b=>b.groups);
  tin._cjl=cjl;tin._cjo=cjo;tin._asl=asl;tin._dsl=dsl;tin._dso=dso;
  // caminho mais curto da âncora até à pessoa base (Tiago, 22/11): as linhas da árvore nesse caminho ficam a vermelho; onde o caminho sai da árvore, o botão fica a vermelho; nos empates ficam todos
  tin._path=null;tin._red=[];if(EGO!==A&&BY[EGO]){const has=new Set([...sibs.map(z=>z[0]+'|sib'),...cjb.map(z=>z[0]+'|cj'),...dsb.map(z=>z[0]+'|ds'),...asb.map(z=>z[0]+'|as')]);
    const irm=x=>(BY[x]?.ir||[]).filter(kOk),nb=u=>[...kPa(u).map(v=>[v,'as']),...kFl(u).map(v=>[v,'ds']),...kCj(u).map(v=>[v,'cj']),...irm(u).map(v=>[v,'sib'])];   // v é pai/filho/cônjuge/irmão de u → botão de u
    const dist=src=>{const d=new Map([[src,0]]);let fr=[src];while(fr.length){const nx=[];for(const u of fr)for(const [v] of nb(u))if(!d.has(v)){d.set(v,d.get(u)+1);nx.push(v)}fr=nx}return d};
    const dA=dist(A),dE=dist(EGO),D=dA.get(EGO);
    if(D!==undefined){const hit=[];for(const u of shown){const tu=tkOf.get(u);if(!tu||dA.get(u)+dE.get(u)!==D)continue;
      for(const [v,kd] of nb(u)){if(dE.get(v)!==dE.get(u)-1||dA.get(v)!==dA.get(u)+1)continue;
        if(shown.has(v)){const tv=tkOf.get(v);if(tv)tin._red.push([tu,tv,kd])}else if(has.has(tu+'|'+kd))hit.push({tk:tu,kind:kd,id:v})}}
      if(hit.length)tin._path=hit}}
  draw();
  if(TREE_RO)TREE_RO.disconnect();
  if(window.ResizeObserver){TREE_RO=new ResizeObserver(draw);TREE_RO.observe(tin)}
  // a âncora fica ao centro do ecrã quando a árvore é mais larga do que a janela
  const tr=tin.parentElement,rb=tin.querySelector('[data-tk="r"]');
  if(TREE_KEEP){tr.scrollLeft=TREE_KEEP.x;window.scrollTo(0,TREE_KEEP.y);TREE_KEEP=null}
  else if(rb&&tr.scrollWidth>tr.clientWidth)tr.scrollLeft=rb.offsetLeft+rb.offsetWidth/2-tr.clientWidth/2;
  // nova âncora: a vista vai até ela, ao centro do ecrã (Tiago, 22/11)
  if(TREE_LAST_A!==null&&TREE_LAST_A!==A&&rb)requestAnimationFrame(()=>rb.scrollIntoView({block:'center',inline:'center',behavior:'smooth'}));
  TREE_LAST_A=A;
}
function layBands(tin){
  for(const b of tin._bands||[]){const el=tin.querySelector(`.tband[data-band="${b.id}"]`);if(!el)continue;const E=el.getBoundingClientRect();let H=0,right=-1e9;
    const G=b.groups.map(g=>{const f=tin.querySelector(`[data-tk="${g.fromTk}"]`),fr=f&&f.getBoundingClientRect(),bx=g.ids.map(y=>el.querySelector(`[data-tk="x_${y}"]`)).filter(Boolean),ws=bx.map(e=>e.offsetWidth);
      return {cx:fr?(fr.left+fr.right)/2-E.left:E.width/2,bx,ws,w:ws.reduce((a,x)=>a+x,0)+Math.max(0,bx.length-1)*16}}).sort((a,c)=>a.cx-c.cx);
    for(const g of G){const l=Math.max(g.cx-g.w/2,right+24,4);let x=l;g.bx.forEach((e,i)=>{e.style.left=x+'px';e.style.top='30px';x+=g.ws[i]+16;H=Math.max(H,e.offsetHeight)});right=l+g.w}
    el.style.height=(H+60)+'px'}
}
function treeLines(tin,rows,nsp,fl,upMore,dnMore,sibs,fg,cjb,insb,asb,dsb){
  const svg=tin.querySelector('#tsvg');if(!svg||!tin.isConnected)return;
  const O=tin.getBoundingClientRect();
  const R=tk=>{const e=tin.querySelector(`[data-tk="${tk}"]`);if(!e)return null;const r=e.getBoundingClientRect();return {l:r.left-O.left,r:r.right-O.left,t:r.top-O.top,b:r.bottom-O.top,cx:(r.left+r.right)/2-O.left,cy:(r.top+r.bottom)/2-O.top,el:e}};
  const P=[],C=[];
  // pais (dois de cima) ligados ao filho (em baixo), em cotovelo
  const fam=(ps,ch)=>{ps=ps.filter(Boolean);if(!ps.length||!ch)return;
    const y=ch.t-11, xs=ps.map(p=>p.cx).concat([ch.cx]);
    for(const p of ps)P.push(`M${p.cx},${p.b}V${y}`);
    P.push(`M${Math.min(...xs)},${y}H${Math.max(...xs)}`,`M${ch.cx},${y}V${ch.t}`)};
  rows.forEach((r,k)=>{for(let j=0;j<r.length;j+=2){const ch=R(k?`a${k-1}_${j>>1}`:'r');fam([R(`a${k}_${j}`),R(`a${k}_${j+1}`)],ch)}});
  // casamento da âncora: traço entre os cônjuges
  const rt=R('r');
  for(let i=0;i<nsp;i++){const s=R(`s${i}`),inn=i<2?rt:R(`s${i-2}`);if(s&&inn)C.push(i%2?`M${s.r},${s.cy}H${inn.l}`:`M${inn.r},${s.cy}H${s.l}`)}   // cônjuges de um lado e do outro da âncora (1.º à direita, 2.º à esquerda…), ligados a ela
  // filhos: descem do meio do traço entre a pessoa e o cônjuge de quem são filhos (ou da pessoa, se o outro progenitor não é um cônjuge mostrado)
  if(rt&&fl.length){for(const g of [...new Set(fg||[])]){
    const ks=fl.map((c,i)=>fg[i]===g?R(`c${i}`):null).filter(Boolean);if(!ks.length)continue;
    let x0=rt.cx,y0=rt.b;
    if(g){const sp=R(g),n=+g.slice(1),inn=n<2?rt:R(`s${n-2}`);if(sp&&inn){const dir=sp.cx>inn.cx;x0=((dir?inn.r:sp.r)+(dir?sp.l:inn.l))/2;y0=sp.cy}}
    const y=Math.min(...ks.map(k=>k.t))-11,xs=ks.map(k=>k.cx).concat([x0]);
    P.push(`M${x0},${y0}V${y}`,`M${Math.min(...xs)},${y}H${Math.max(...xs)}`);for(const k of ks)P.push(`M${k.cx},${y}V${k.t}`)}}
  // casamentos dos filhos e netos: descem do meio de cada casal
  fl.forEach(([ns,ng],i)=>{const ck=R(`c${i}`);if(!ck)return;
    for(let j=0;j<ns;j++){const s=R(`c${i}s${j}`),prev=j?R(`c${i}s${j-1}`):ck;if(s&&prev)C.push(`M${prev.r},${s.cy}H${s.l}`)}
    const gs=[];for(let j=0;j<ng;j++){const g=R(`g${i}_${j}`);if(g)gs.push(g)}
    if(!gs.length)return;
    const s0=ns?R(`c${i}s0`):null,x0=s0?(ck.r+s0.l)/2:ck.cx,y0=s0?ck.cy:ck.b,y=Math.min(...gs.map(g=>g.t))-11,xs=gs.map(g=>g.cx).concat([x0]);
    P.push(`M${x0},${y0}V${y}`,`M${Math.min(...xs)},${y}H${Math.max(...xs)}`);for(const g of gs)P.push(`M${g.cx},${y}V${g.t}`)});
  // caminho até à pessoa base: troços a vermelho por cima das linhas normais
  const RP=[];for(const [tu,tv,kd] of tin._red||[]){const u=R(tu),v=R(tv);if(!u||!v)continue;
    if(kd==='as'||kd==='ds'){const [pa,ch]=kd==='as'?[v,u]:[u,v],y=ch.t-11;RP.push(`M${pa.cx},${pa.b}V${y}H${ch.cx}V${ch.t}`)}
    else if(kd==='cj'){const [a,b]=u.cx<v.cx?[u,v]:[v,u],y=(a.cy+b.cy)/2;RP.push(`M${a.r},${y}H${b.l}`)}
    else{const y=Math.min(u.t,v.t)-11;RP.push(`M${u.cx},${u.t}V${y}H${v.cx}V${v.t}`)}}
  // níveis expandidos: pais por cima / filhos por baixo da pessoa
  for(const g of tin._xg||[]){const f=R(g.fromTk);if(!f)continue;if(g.kind==='as')fam(g.ids.map(y=>R('x_'+y)),f);else g.ids.forEach(y=>fam([f],R('x_'+y)))}
  const BT=[];
  const pos=(tk,kind)=>{const sl=insb&&insb[tk]||[],n=sl.length,i=sl.indexOf(kind);return 6+24*(n-i)};   // distância do fundo da caixa ao fundo do botão... (ver top)
  for(const [tk,id,n,sd] of sibs||[]){const b=R(tk);if(!b)continue;
    const lft=tk==='r'&&nsp>=2?R(`s${nsp%2?nsp-2:nsp-1}`):null;void lft;
    BT.push(`<button type="button" class="tmbtn tm-sib" data-act="sib" data-tk="${tk}" data-in="1" data-side="${sd||'l'}" style="${sd==='r'?`left:${b.r-7}px;transform:translateX(-100%)`:`transform:none;left:${b.l+7}px`};top:${b.b-pos(tk,'sib')-2}px" title="Mostrar os irmãos">${sd==='r'?`${n} ▶`:`◀ ${n}`}</button>`)}
  for(const [tk,id,lab,side] of cjb||[]){const b=R(tk);if(!b)continue;BT.push(`<button type="button" class="tmbtn tm-cj" data-act="cj" data-tk="${tk}" data-side="${side}" style="left:${b.r-7}px;top:${b.b-pos(tk,'cj')-2}px;transform:translateX(-100%)" title="Mostrar os cônjuges">${lab}</button>`)}
  for(const [tk,id,ou,ex,on] of dsb||[]){const b=R(tk);if(!b)continue;BT.push(`<button type="button" class="tmbtn tm-ds${on?' xpd':''}" data-act="ds" data-tk="${tk}"${ex?' data-xp="1"':''} style="left:${b.cx}px;top:${b.b+8}px;transform:translateX(-50%)" title="${ex?(on?'Recolher este nível':'Mostrar mais um nível só deste ramo'):'Mostrar os outros descendentes'}">▼ ${ou?'outros ':''}descendentes</button>`)}
  for(const [tk,id,ex,on] of asb||[]){const b=R(tk);if(!b)continue;BT.push(`<button type="button" class="tmbtn tm-as${on?' xpd':''}" data-act="as" data-tk="${tk}" data-xp="1" style="left:${b.cx}px;top:${b.t-26}px;transform:translateX(-50%)" title="${on?'Recolher este nível':'Mostrar mais um nível só deste ramo'}">▲ ascendentes</button>`)}
  svg.setAttribute('width',tin.scrollWidth);svg.setAttribute('height',tin.scrollHeight);
  svg.innerHTML=`<path d="${P.join('')}"/>`+(C.length?`<path class="cj" d="${C.join('')}"/>`:'')+(RP.length?`<path class="red" d="${RP.join('')}"/>`:'')+'';
  tin.querySelectorAll('.tmbtn').forEach(e=>e.remove());tin.insertAdjacentHTML('beforeend',BT.join(''));
  {const o=tin.querySelector('.sibrow');if(o){const b=tin.querySelector(`.tm-${o.dataset.kind||'sib'}[data-tk="${o.dataset.tk}"]`);if(b)b.classList.add('on')}}
  for(const q of tin._path||[]){const b=tin.querySelector(`.tm-${q.kind}[data-tk="${q.tk}"]`);if(b&&!b.classList.contains('tm-path')){b.classList.add('tm-path');b.title+=' — caminho até à pessoa base'}}
}
function setEgo(id){if(!GESTOR)return;EGO=id;try{localStorage.setItem('arv-ego',JSON.stringify(id))}catch(e){}ANCORA=null;try{localStorage.removeItem('arv-ancora')}catch(e){}applyEgo();list();route()}   // mudar a pessoa base volta a ancorar a árvore nela
function initEgo(){
  const q=$('#egoq'),box=$('#egosug');
  const close=()=>{box.hidden=true};
  const show=()=>{const t=nrm(q.value.trim()).split(/\s+/).filter(Boolean);
    if(!t.length){close();return}
    const L=D.pessoas.filter(p=>t.every(x=>p._s.includes(x))).slice(0,12);
    box.innerHTML=L.map(p=>`<button type="button" role="option" data-id="${esc(p.id)}">${esc(p.n)}<small>${p.nb?'n. '+esc(p.nb)+' · ':''}${esc(p.id)}</small></button>`).join('')||'<div class="egonote" style="padding:6px 10px">Ninguém com esse nome.</div>';
    box.hidden=false;
    box.querySelectorAll('button').forEach(b=>b.onclick=()=>{const p=BY[b.dataset.id];close();if(p)setEgo(p.id)})};
  q.addEventListener('input',show);
  q.addEventListener('focus',()=>{q.select()});
  q.addEventListener('keydown',e=>{if(e.key==='Escape'){close();q.value=BY[EGO]?.n||'';q.blur()}else if(e.key==='Enter'){const b=box.querySelector('button');if(b&&!box.hidden){e.preventDefault();b.click()}}else if(e.key==='ArrowDown'){const b=box.querySelector('button');if(b){e.preventDefault();b.focus()}}});
  box.addEventListener('keydown',e=>{const a=document.activeElement;if(e.key==='ArrowDown'&&a.nextElementSibling){e.preventDefault();a.nextElementSibling.focus()}else if(e.key==='ArrowUp'){e.preventDefault();(a.previousElementSibling||q).focus()}else if(e.key==='Escape'){close();q.focus()}});
  document.addEventListener('click',e=>{if(!$('#whoami').contains(e.target)){close();if(document.activeElement!==q)q.value=BY[EGO]?.n||''}});
}
let LNCUR=null;
function linha(p,ln){
  ln=ln||p.ln; LNCUR=ln;
  if(!ln.length)return `<span class="muted">Sem ligação conhecida a ${esc(egoNome())}.</span>`;
  // ln vai do Tiago até à pessoa; mostra-se ao contrário, da pessoa até ao Tiago, com a relação invertida
  const n=ln.length, steps=[];
  for(let k=n-1;k>=0;k--){
    const q=BY[ln[k][0]];let lab;
    if(k===n-1)lab=n===1?`${esc(egoNome())} (eu)`:'esta pessoa';
    else{const t=LTYP[ln[k+1][1]];const pair=LINV[t]||['',''];const rel=q&&q.s==='F'?pair[1]:pair[0];
      const nx=BY[ln[k+1][0]];lab=`${rel} de ${esc(curto(nx?.n))}`}
    let arr='';
    if(k<n-1){const e=k+1, can=['ir','sob','prim','tio'].includes(LTYP[ln[e][1]])&&expandLn(ln,e);
      arr=can?`<button class="arr arr-x" data-e="${e}" title="Mostrar o caminho completo desta ligação">→</button>`:'<span class="arr" aria-hidden="true">→</span>'}
    steps.push(`<div class="step">${arr}<div><div class="rk sx-${esc(q?.s||'')}">${lab}</div>${q?`<button class="pl" data-id="${esc(q.id)}"><span>${esc(q.n)}</span><small>${q.nb?'n. '+esc(q.nb):'n. ?'}${q.nm?' · † '+esc(q.nm):''}</small></button>`:''}</div></div>`);
  }
  const ab=ln.some((x,e)=>e>0&&['ir','sob','prim','tio'].includes(LTYP[x[1]])&&expandLn(ln,e));
  return `<div class="muted">${n-1} passo(s) até ${esc(egoNome())} · ${esc(p.pr)}${ab?' · as setas sublinhadas abrem a ligação':''}${ln!==p.ln?' · <button class="linkbtn" data-reset="1">voltar à linha curta</button>':''}</div><div class="linha">${steps.join('')}</div>`;
}
function bindLinha(p){
  const box=document.querySelector('details.sec[data-k="linha"] > .body'); if(!box)return;
  box.querySelectorAll('.arr-x').forEach(b=>b.onclick=()=>{const nl=expandLn(LNCUR,+b.dataset.e);if(nl){box.innerHTML=linha(p,nl);bindPl(box);bindLinha(p)}});
  box.querySelectorAll('[data-reset]').forEach(b=>b.onclick=()=>{box.innerHTML=linha(p);bindPl(box);bindLinha(p)});
}
const NOTAVEL=new Set(['Profissão','Ocupação','Educação','Graduação','Degree','Título','Condecoração','Condecoração militar','Prémio','Serviço militar','Military Promotion']);
function fotoBox(p){
  // só quando existe imagem; sem foto não se mostra nada
  const f=p.ft; if(!f||!f.web)return '';
  const st=f.estado_mh==='no_mh'?'no MyHeritage':(LBL[f.estado_mh]||f.estado_mh);
  const tip=`Foto: ${f.fonte||''}${f.licenca?' · '+f.licenca:''}${f.autor?' · '+f.autor:''} · ${st}`;
  const img=`<a class="foto" data-mh="${esc(f.web)}" target="_blank" rel="noopener" title="${esc(GESTOR?tip:'Foto: '+(f.fonte||''))}"><img data-m="${esc(f.web)}" alt="Foto de ${esc(p.n)}"></a>`;
  if(!f.licenca&&!f.autor)return img;
  const src=f.url_pagina?`<a href="${esc(f.url_pagina)}" target="_blank" rel="noopener">fonte</a>`:'';
  return `<figure class="fotof">${img}<figcaption>${f.autor?esc(f.autor)+' · ':''}${esc(f.licenca||'')}${src?' · '+src:''}<br>${pill(f.estado_mh)}${f.mh_tem_outra?' <span class="muted">(o MH tem outra foto principal)</span>':''}</figcaption></figure>`;
}
function notavelTxt(p){const N=(p.dc||[]).filter(d=>/not[aá]vel/i.test(d.campo||'')&&d.decisao==='aprovado'&&d.valor_novo&&d.estado_mh!=='substituida');return N.length?N[N.length-1].valor_novo:''}
function notaveis(p){
  // só o facto principal: a decisão «Notável» aprovada mais recente
  const N=p.dc.filter(d=>/not[aá]vel/i.test(d.campo||'')&&d.decisao==='aprovado'&&d.valor_novo&&d.estado_mh!=='substituida');
  if(!N.length)return '';
  const d=N[N.length-1];
  return `<div class="notavel">${esc(d.valor_novo)}${d.estado_mh!=='no_mh'?' '+pill(d.estado_mh):''}</div>`;
}
function show(p){
  if(!p){$('#main').innerHTML='<div class="empty">Pessoa não encontrada.</div>';return}
  CUR=p.id;document.querySelectorAll('.row').forEach(b=>b.setAttribute('aria-current',b.dataset.id==String(p.id)));
  const c=p.cnt, H=[];
  H.push(`<div class="sec"><div class="meta g-only"><span class="mono">${typeof p.id==='number'?'id MyHeritage '+p.id:'por criar no MyHeritage'}</span>${p.cd?'<span class="pill s-info">criada depois de 12/11</span>':''}${p.pc?pill('por_gravar'):''}</div>
   <div class="hd">${fotoBox(p)}<div class="hdt">${p.del?`<div class="delban">${pill(p.del.estado_mh==='no_mh'?'no_mh':'por_gravar')} <b>${p.del.estado_mh==='no_mh'?'Apagada no MH':'A apagar no MH'}</b> (${esc(p.del.did)}). Fora da árvore: não conta como antepassado nem como notável.${p.del.nota?`<div class="muted">${esc(p.del.nota)}</div>`:''}</div>`:''}<h2${p.del?' class="del"':''}>${esc(p.n)}${p.ns?` <span class="npfx">${esc(p.ns)}</span>`:''}</h2>${notaveis(p)}${!GESTOR?'':ancA()===p.id?'<button class="anc-btn" disabled>⚓ Árvore ancorada nesta pessoa</button>':`<button class="anc-btn" data-anc="${esc(p.id)}">⚓ Ancorar árvore aqui</button>`}</div></div>
   <div class="meta"><span><strong>${esc(p.pr)}</strong></span>${GESTOR?`<span>Âmbito: <strong>${esc(p.c)}</strong></span>`:''}<span>Geração: <strong>${genLbl(p.g)}</strong></span>${p.r.length?`<span>Ramo: <strong>${esc(p.r.join(' · '))}</strong></span>`:''}<span>Sexo: <strong>${esc(p.s||'?')}</strong></span></div>
   <div class="meta">${['no_mh',...PEND].filter(k=>c[k]).map(k=>`<span class="pill s-${k}">${c[k]} ${LBL[k]}</span>`).join('')}${p.cr&&(p.cr.confirmadas||p.cr.por_aplicar)?`<span>Correspondências: ${p.cr.confirmadas||0} confirmadas, ${p.cr.rejeitadas||0} rejeitadas, ${p.cr.por_aplicar||0} por aplicar</span>`:''}</div>
   ${p.nv.length?`<div class="kv"><b>Outros nomes:</b> ${p.nv.map(x=>`${esc(x.v)} <span class="muted">(${esc(x.t)})</span>`).join('; ')}</div>`:''}</div>`);
  H.push(sec('linha','Linha de parentesco',linha(p)));
  const fam=p.fm.map(m=>{const ff=m.f.filter(f=>f.data||f.local).map(f=>`${f.tipo} ${f.data||''}`).join(', ');return pl(m.c,ff)||`<div class="muted">cônjuge desconhecido${ff?' · '+esc(ff):''}</div>`}).join('');
  H.push(sec('familia','Família',`<div class="rels">
   <div><h3>Pais</h3>${p.pa.map(i=>pl(i)).join('')||'<span class="muted">—</span>'}</div>
   <div><h3>Cônjuges</h3>${fam||'<span class="muted">—</span>'}</div>
   <div><h3>Filhos (${p.fl.length})</h3>${p.fl.map(i=>pl(i)).join('')||'<span class="muted">—</span>'}</div>
   <div><h3>Irmãos (${p.ir.length})</h3>${p.ir.slice(0,40).map(i=>pl(i)).join('')||'<span class="muted">—</span>'}</div></div>`));
  const famFacts=p.fm.flatMap(m=>m.f.map(f=>({...f,_g:f.tipo,_sub:BY[m.c]?'com '+BY[m.c].n:'',tipo:f.tipo+(BY[m.c]?' com '+BY[m.c].n:'')})));
  H.push(sec('factos',`Factos (${p.f.length+famFacts.length})`,fgroups([...p.f,...famFacts])));
  if(p.flp&&p.flp.length)H.push(sec('fontes-locais',`Fontes locais da pessoa (${p.flp.length})`,`<div class="muted">Afirmações das pastas Mota e Albuquerque que não correspondem a um facto da árvore (ou que são sobre a pessoa).</div><div class="items">${p.flp.map(r=>`<div class="item"><span class="pill s-local">${esc(r.c)}</span><div>${r.ca?`<b>${esc(r.ca)}</b>${r.d?' '+esc(r.d):''}: `:''}${esc(r.t||'')}${r.pg?` <span class="muted">(${esc(r.pg)})</span>`:''}${r.ti?`<div class="muted">${esc(r.ti)}</div>`:''}</div></div>`).join('')}</div>`));
  if(p.sl)H.push(`<div class="kv"><span class="pill s-local">só fonte local</span> ${p.sl} facto${p.sl>1?'s':''} desta pessoa só ${p.sl>1?'têm':'tem'} como fonte um documento das pastas Mota/Albuquerque.</div>`);
  if(GESTOR&&p.dc.length)H.push(sec('decisoes',`Decisões (${p.dc.length})`,`<div class="items">${p.dc.map(d=>`<div class="item">${pill(d.estado_mh)}<div>${d.anula?`<b>Anulada</b> (substituída por ${esc(d.substituida_por)})`:`<b>${esc(d.campo)}</b>: ${d.valor_antigo?esc(d.valor_antigo)+' → ':''}${esc(d.valor_novo)}`}${d.anulada_por?` <span class="pill s-diferente_mh">anulada por ${esc(d.anulada_por)}${d.substituida_por?', substituída por '+esc(d.substituida_por):''}</span>`:''} <span class="muted">(${esc(d.decisao)}, ${esc(d.quem)}, ${esc(d.ts)})</span>${d.nota?`<div class="muted">${esc(d.nota)}</div>`:''}${d.fonte?`<div class="kv"><b>Fonte:</b> ${esc(d.fonte)}</div>`:''}${d.fl?d.fl.map(r=>`<div class="kv fl"><b class="mono">${esc(r.c)}</b>${r.pg?' '+esc(r.pg):''}${r.ti?` <span class="muted">— ${esc(r.ti)}</span>`:''}</div>`).join(''):''}${d.sl?' '+slPill(d.fl):''}${(p.ig||[]).some(e=>(e.dec||[]).includes(d.did))?`<div class="kv"><button class="lnk" data-goimg="${esc(d.did)}">Ver a imagem do assento ↓</button></div>`:''}<div class="mono muted">${esc(d.did)} · ${esc(d.origem)}${d._alvo?' · alvo '+esc(d._alvo):''}</div></div></div>`).join('')}</div>`));
  if(p.q.length)H.push(sec('questoes',`Questões dos assentos (${p.q.length})`,`<div class="items">${p.q.map(q=>`<div class="item">${pill(q.s)}<div>${esc(q.t)}${q.nt?` <em class="muted">— ${esc(q.nt)}</em>`:''} <span class="mono muted">${esc(q.o)}</span></div></div>`).join('')}</div>`));
  if(p.ex.length)H.push(sec('extracoes',`Extrações de correspondências (${p.ex.length})`,`<div class="items">${p.ex.map(e=>`<div class="item">${pill(e.s)}<div>j${e.j}, lote ${e.l}: ${esc(e.n)}${e.d?`<details><summary>Dados da correspondência</summary><div class="box">${esc(e.d)}</div></details>`:''} <span class="mono muted">${esc(e.o)}</span></div></div>`).join('')}</div>`,true));
  if(p.nt.length)H.push(sec('notas',`Notas (${p.nt.length})`,`<div class="items">${p.nt.map(n=>`<div class="item">${pill(n.s)}<details><summary>${esc(n.k||'nota')} <span class="mono muted">${esc(n.o)}</span></summary><div class="box">${esc(n.t)}</div></details></div>`).join('')}</div>`));
  if(p.ig&&p.ig.length)H.push(sec('assentos',`Imagens dos assentos (${p.ig.length})`,`<div class="gal">${p.ig.map(e=>{
    const b=e.box?`<div class="mark" style="left:${e.box[0]*100}%;top:${e.box[1]*100}%;width:${(e.box[2]-e.box[0])*100}%;height:${(e.box[3]-e.box[1])*100}%"></div>`:'';
    const dl=(e.dec||[]).map(x=>{const d=p.dc.find(y=>y.did===x);return d?`${esc(x)} «${esc(d.campo)}»`:esc(x)}).join(', ');
    return `<figure class="asimg"${e.dec?` data-imgdec="${esc(e.dec.join(' '))}"`:''}>${e.noimg?`<div class="noimg">Imagem não publicada (sem autorização do arquivo).${e.cit?' '+esc(e.cit):''}</div>`:`<a class="frame" data-mh="img/${esc(e.f)}" target="_blank" rel="noopener" title="Abrir a imagem"><img data-m="img/${esc(e.f)}" loading="lazy" alt="${esc(e.what||e.f)}">${b}</a>`}
      <figcaption><div><strong>${esc(e.what||e.fact||'')}</strong>${e.estado_mh?' '+(e.estado_mh==='no_mh'?'<span class="pill s-no_mh">marcação no MH</span>':'<span class="pill s-por_gravar">marcação por gravar</span>'):''}</div><div class="mono muted">${esc(e.titulo||'')} · ${esc(e.f)}</div>${e.cit?`<div class="kv"><b>${esc(e.cit)}</b></div>`:''}${dl?`<div class="muted">Ligada a ${dl}</div>`:''}</figcaption>
      ${e.papel?`<div class="kv"><b>Papel nesta transcrição:</b> ${esc(e.papel)}${e.auto?' <span class="pill s-local">negrito auto</span>':''}</div>`:''}
      ${e.trans?`<div class="trans">${e.neg?boldNeg(e.trans,e.neg,e.nx):e.dec&&!e.fact?boldPessoa(e.trans,p,false,''):boldPessoa(e.trans,p,!/—\s*(pai|mãe|av[óô]|padrinho|madrinha|testemunha|irm|ti[oa]\b|sogr|noiv|cônjuge|marido|mulher|fim|início|continua)/i.test(e.what||''),e.what)}</div>`:'<div class="muted">Sem transcrição.</div>'}</figure>`}).join('')}</div>`));
  if(p.cri.length)H.push(sec('corresp',`Correspondências por aplicar no site (${p.cri.length})`,`<div class="muted">${p.cri.map(x=>`${x.a==='confirm'?'confirmar':'rejeitar'} j${x.j} (lote ${x.l})`).join(' · ')}</div>`,true));
  const ext=[];
  if(p.src.length)ext.push(`<details><summary>Fontes do perfil (${p.src.length})</summary><ul>${p.src.map(s=>`<li>${esc(s)}</li>`).join('')}</ul></details>`);
  if(p.lk.length)ext.push(`<div class="kv"><b>Ligações:</b> ${p.lk.map(l=>`<a href="${esc(l.u)}" target="_blank" rel="noopener">${esc(l.n)}</a>`).join(' · ')}</div>`);
  if(p.fi.length)ext.push(`<div class="kv"><b>Fichas biográficas:</b> <span class="mono">${esc(p.fi.join(', '))}</span></div>`);
  if(p.gd.length||p.ge)ext.push(`<div class="kv"><b>Geni:</b> ${p.ge?'âncora WFT ('+esc(p.ge)+') ':''}<span class="mono">${esc(p.gd.join(', '))}</span></div>`);
  if(p.h.length)ext.push(`<div class="kv"><b>Histórico (alterações registadas):</b><ul>${p.h.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`);
  if(p.ni.length)ext.push(`<div class="kv"><b>Notas do build:</b> ${esc(p.ni.join('; '))}</div>`);
  if(GESTOR)ext.push(`<div class="mono muted">origem: ${esc(p.o)}</div>`);
  if(ext.length)H.push(sec('fontes','Fontes e referências',ext.join('')));
  $('#main').innerHTML=H.join('');
  $('#main').querySelectorAll('[data-goimg]').forEach(b=>b.onclick=()=>{const f=[...$('#main').querySelectorAll('[data-imgdec]')].find(x=>x.dataset.imgdec.split(' ').includes(b.dataset.goimg));if(!f)return;const s=f.closest('details');if(s)s.open=true;f.scrollIntoView({behavior:'smooth',block:'center'});f.classList.add('flash');setTimeout(()=>f.classList.remove('flash'),1600)});
  bindPl($('#main'));bindSecs($('#main'));bindFg($('#main'));bindLinha(p);window.APP.media($('#main'));
  $('#main').querySelectorAll('[data-anc]').forEach(b=>b.onclick=()=>setAnchor(BY[b.dataset.anc].id));
  if(window.innerWidth<=820)$('#main').scrollIntoView({block:'start'});
}
