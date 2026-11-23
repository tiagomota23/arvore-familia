# Copia showSibs/renderTree/treeLines do artifact para a webapp, com as adaptações da webapp
import sys,re
A=open(sys.argv[1]).read(); WP=sys.argv[2]; W=open(WP).read()
def ext(src,f):
    m=re.search(r"^function "+f+r"\(.*?^\}$",src,re.S|re.M); assert m,f; return m.group(0)
def rep(s,o,n):
    assert s.count(o)==1,('FALHOU',o[:90]); return s.replace(o,n)
aR,aT,aS=ext(A,'renderTree'),ext(A,'treeLines'),ext(A,'showSibs'); wR,wT,wS=ext(W,'renderTree'),ext(W,'treeLines'),ext(W,'showSibs')
wl=wR.splitlines()
r=aR
r=rep(r,"""  const A=ancA(),a=BY[A];if(!a){$('#main').innerHTML='<div class="empty">Âncora não encontrada.</div>';return}""","\n".join(wl[1:4]))
hdr=lambda t:next(l for l in t.splitlines() if l.startswith("  $('#main').innerHTML=`<div class=\"sec\"><h2>Árvore de"))
r=rep(r,hdr(r),hdr(wR))
r=rep(r,"""<div class="tlab">Âncora${sps.length?' e cônjuge':''}</div>""","""<div class="tlab">Perfil ativo${sps.length?' e cônjuge':''}</div>""")
i=next(k for k,l in enumerate(wl) if l.startswith('  // clicar num nome muda o perfil ativo'))
r=rep(r,"  $('#main').querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));","\n".join(wl[i:i+4]))
m=re.search(r"  // [^\n]*\n  tin0=\$\('#tin'\);tin0\.addEventListener\(",r); assert m
r=r[:m.start()]+"  window.APP.media($('#main'));\n  // botões da árvore (artifact): irmãos, cônjuges, ascendentes e descendentes abrem faixas; não mudam o centro nem a âncora\n  {const tin0=$('#tin');tin0.addEventListener("+r[m.end():]
r,n=re.subn(r"showSibs\(e\[1\],(b\.dataset\.tk|k),tin0,stay,'",r"showSibs(e[1],\1,tin0,stay,pick,'",r); assert n>=4,n
r=rep(r,"    if(id!==null&&id!==undefined)stay(id)});","    if(id!==null&&id!==undefined&&BY[id])recentra(id)})}")
if not re.search(r"^  tin\._draw=draw;",r,re.M):   # o artifact antigo não expunha o draw: injeta-se
    r,n=re.subn(r"  const tin=\$\('#tin'\),draw=\(","  const tin=$('#tin');tin._draw=()=>draw();const draw=(",r); assert n==1
# «ancorar na pessoa base»: na webapp põe a base no centro (perfil ativo); o gestor também repõe a âncora
r=rep(r,"const r2=$('#ancreset2');if(r2)r2.onclick=()=>stay(null);","const r2=$('#ancreset2');if(r2)r2.onclick=()=>{CUR=EGO;if(GESTOR&&ANCORA!==null)setAnchor(null);else renderTree()};")
assert 'stay(id)' not in r and 'go(b.dataset.go)' not in r
s=aS
s=rep(s,"function showSibs(id,tk,tin,stay,kind){","function showSibs(id,tk,tin,stay,pick,kind){")
s=rep(s,"const g=e.target.closest('[data-go]');if(g){go(g.dataset.go);return}","const g=e.target.closest('[data-go]');if(g){pick(BY[g.dataset.go]?.id);return}")
s=rep(s,"bt.classList.add('on');tin.appendChild(el);","bt.classList.add('on');tin.appendChild(el);if(window.APP&&APP.media)APP.media(el);")
W=rep(W,wR,r); W=rep(W,wT,aT); W=rep(W,wS,s)
# estado global e funções auxiliares novas (v150+)
gA=re.search(r"^let TREE_RO=.*$",A,re.M).group(0); W=re.sub(r"^let TREE_RO=.*$",lambda m:gA,W,count=1,flags=re.M)
for f in ('layBands',):
    if re.search(r"^function "+f+r"\(",A,re.M):
        fa=ext(A,f)
        if re.search(r"^function "+f+r"\(",W,re.M): W=rep(W,ext(W,f),fa)
        else: W=rep(W,ext(W,'treeLines'),fa+"\n"+ext(W,'treeLines'))
open(WP,'w').write(W); print('ok')
