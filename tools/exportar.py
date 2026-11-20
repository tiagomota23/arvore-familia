#!/usr/bin/env python3
"""Exporta a árvore de referência para a webapp (só lê; não altera nada na árvore).

Lê   <arvore>/site/data.json  (gerado por build.py, na sessão «Árvore de referência»)
     <arvore>/site/img/        (imagens dos assentos e fotos)
Gera export/gestor.json   — tudo, como o artifact (só o gestor o recebe)
     export/familia.json  — a mesma estrutura sem o trabalho interno (estados do MyHeritage, filas,
                            decisões, origens, correspondências, pessoas apagadas)
     export/img/            (cópia das imagens referidas, para o modo de demonstração)
Com --enviar: grava as duas camadas na tabela arvore_export e envia as imagens novas para o bucket
privado «arvore» do Supabase. Precisa da chave service_role, que nunca fica em ficheiros:
     SUPABASE_SERVICE_ROLE_KEY no ambiente, ou no Porta-chaves do macOS:
     security add-generic-password -a "$USER" -s arvore-familia-service-role -w   (o Tiago cola a chave)
Uso: python3 tools/exportar.py [--arvore PASTA] [--enviar]
"""
import argparse, hashlib, shutil, json, os, re, subprocess, sys, urllib.request, urllib.error, urllib.parse
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ARVORE = Path.home() / 'Library/CloudStorage/OneDrive-Personal/Família/MyHeritage/Correspondências/arvore'

# ---------- camada «familia»
FACTO_OK = ('tipo', 'data', 'local', 'valor', 'morada', 'padrinhos', 'celebrante', 'testemunhas', 'causa', 'cotas', 'imagens_assento', 'desc', 'fontes', 'fl')
FACTO_FORA = {'por_validar', 'por_decidir', 'rejeitado', 'substituida'}  # ainda não aceites ou já anulados

def factos(L):
    return [{k: f[k] for k in FACTO_OK if f.get(k) not in (None, '', [])} for f in L or []
            if f.get('estado_mh') not in FACTO_FORA and not f.get('apagar')]

def familia(d):
    vivos = {p['id'] for p in d['pessoas'] if not p.get('del')}
    ok = lambda L: [i for i in (L or []) if i in vivos]
    P = []
    for p in d['pessoas']:
        if p['id'] not in vivos:
            continue
        q = {k: p.get(k) for k in ('id', 'n', 's', 'nb', 'nm', 'gv', 'sn', 'np', 'npg', 'ns', 'pr', 'pt', 'g', 'ga', 'an', 'c', 'r', 'src', 'lk', 'flp')}
        q.update(e='', o='', cnt={}, cr={}, cri=[], q=[], ex=[], h=[], ni=[], fi=[], gd=[], ge='', im=[], del_=None, sl=0, nc=p.get('nc', False), cd=False, pc=False)
        q['del'] = q.pop('del_')
        q['nv'] = [{'v': x.get('v'), 't': x.get('t')} for x in p.get('nv') or []]
        q['f'] = factos(p.get('f'))
        q['fm'] = [{'c': m['c'], 'f': factos(m.get('f'))} for m in p.get('fm') or [] if m.get('c') in vivos or m.get('c') is None]
        q['pa'], q['cj'], q['fl'], q['ir'] = ok(p.get('pa')), ok(p.get('cj')), ok(p.get('fl')), ok(p.get('ir'))
        q['ln'] = [x for x in p.get('ln') or [] if x[0] in vivos]
        # só as decisões que mudam o que se mostra: «notável» e prefixo do nome (aprovadas)
        q['dc'] = [{'campo': x.get('campo'), 'decisao': 'aprovado', 'valor_novo': x.get('valor_novo'), 'estado_mh': 'no_mh'}
                   for x in p.get('dc') or [] if x.get('decisao') == 'aprovado' and x.get('estado_mh') != 'substituida'
                   and re.match(r'(?i)^\s*(not[aá]vel|prefixo)', str(x.get('campo') or ''))]
        q['nt'] = [{'k': x.get('k'), 't': x.get('t')} for x in p.get('nt') or [] if x.get('s') not in FACTO_FORA]
        q['ig'] = [{k: x[k] for k in ('f', 'what', 'titulo', 'trans', 'box', 'fact', 'neg', 'nx') if k in x} for x in p.get('ig') or []]
        ft = p.get('ft') or {}
        q['ft'] = {k: ft[k] for k in ('fonte', 'url_pagina', 'licenca', 'autor', 'web') if ft.get(k)} if ft.get('web') else {}
        P.append(q)
    r = d['resumo']
    return {'snap': {'ts': d.get('snap', {}).get('ts', '')}, 'resumo': {'gerado': r.get('gerado'), 'pessoas': len(P), 'familias': r.get('familias'), 'dados': {}, 'dados_total': 0, 'correspondencias': {}},
            'pessoas': P, 'apagados': [], 'filas': {'por_decidir': [], 'por_validar': []}, 'pend': {}, 'npend': 0, 'pacao': {}, 'gdec': []}

def imagens(d):
    out = set()
    for p in d['pessoas']:
        for x in p.get('ig') or []:
            out.add('img/' + x['f'])
        w = (p.get('ft') or {}).get('web')
        if w:
            out.add(w)
    return sorted(out)

# ---------- envio para o Supabase
def chave():
    k = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    if k:
        return k
    try:
        return subprocess.run(['security', 'find-generic-password', '-s', 'arvore-familia-service-role', '-w'], capture_output=True, text=True, check=True).stdout.strip()
    except Exception:
        sys.exit('Falta a chave service_role (SUPABASE_SERVICE_ROLE_KEY ou Porta-chaves «arvore-familia-service-role").')

def url_supabase():
    m = re.search(r"SUPABASE_URL:\s*'([^']+)'", (RAIZ / 'config.js').read_text())
    if not m or 'COLOCAR' in m.group(1):
        sys.exit('config.js ainda não tem o SUPABASE_URL do projeto.')
    return m.group(1).rstrip('/')

def pedido(metodo, url, k, corpo=None, tipo='application/json', extra=None):
    h = {'apikey': k, 'Authorization': 'Bearer ' + k, 'Content-Type': tipo, **(extra or {})}
    req = urllib.request.Request(url, data=corpo, method=metodo, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            t = r.read()
            return json.loads(t) if t else None
    except urllib.error.HTTPError as e:
        sys.exit(f'{metodo} {url.split("?")[0]} → {e.code}: {e.read()[:300].decode(errors="replace")}')

def enviar(camadas, img_dir, paths):
    sb, k = url_supabase(), chave()
    for nome, dados in camadas.items():
        corpo = json.dumps(dados, ensure_ascii=False, separators=(',', ':')).encode()
        ver = hashlib.sha256(corpo).hexdigest()[:16]
        linha = json.dumps({'camada': nome, 'versao': ver, 'gerado': dados['resumo'].get('gerado'), 'dados': dados}, ensure_ascii=False, separators=(',', ':')).encode()
        pedido('POST', f'{sb}/rest/v1/arvore_export?on_conflict=camada', k, linha, extra={'Prefer': 'resolution=merge-duplicates,return=minimal'})
        print(f'camada {nome}: {len(corpo)/1e6:.1f} MB, versão {ver}')
    # imagens: envia só as que faltam (lista do bucket por pasta)
    existe = set()
    for pasta in sorted({p.rsplit('/', 1)[0] for p in paths}):
        off = 0
        while True:
            L = pedido('POST', f'{sb}/storage/v1/object/list/arvore', k, json.dumps({'prefix': pasta, 'limit': 1000, 'offset': off}).encode()) or []
            existe |= {f'{pasta}/{x["name"]}' for x in L}
            if len(L) < 1000:
                break
            off += 1000
    novas = [p for p in paths if p not in existe and (img_dir / p[4:]).is_file()]
    for i, p in enumerate(novas, 1):
        f = img_dir / p[4:]
        tipo = 'image/png' if f.suffix.lower() == '.png' else 'image/jpeg'
        pedido('POST', f'{sb}/storage/v1/object/arvore/{urllib.parse.quote(p)}', k, f.read_bytes(), tipo, {'x-upsert': 'true'})
        print(f'  imagem {i}/{len(novas)}: {p}')
    print(f'imagens: {len(novas)} novas, {len(paths) - len(novas)} já lá estavam')

def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--arvore', type=Path, default=ARVORE)
    ap.add_argument('--enviar', action='store_true')
    a = ap.parse_args()
    site = a.arvore / 'site'
    d = json.loads((site / 'data.json').read_text())
    camadas = {'gestor': d, 'familia': familia(d)}
    out = RAIZ / 'export'
    out.mkdir(exist_ok=True)
    for nome, dados in camadas.items():
        (out / f'{nome}.json').write_text(json.dumps(dados, ensure_ascii=False, separators=(',', ':')))
    # cópia das imagens referidas (para o modo de demonstração; export/ está fora do git)
    paths = imagens(d)
    for p in paths:
        src, dst = site / 'img' / p[4:], out / p
        if src.is_file() and (not dst.exists() or dst.stat().st_mtime < src.stat().st_mtime):
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)
    print(f"{d['resumo']['gerado']}: {len(d['pessoas'])} pessoas (família: {len(camadas['familia']['pessoas'])}), {len(paths)} imagens referidas")
    if a.enviar:
        enviar(camadas, site / 'img', paths)

if __name__ == '__main__':
    main()
