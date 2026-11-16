#!/usr/bin/env python3
"""Respostas do gestor (tabela «respostas» da webapp) — para o Arquiteto.

  python3 tools/respostas.py                 # lista as respostas por registar (uma linha JSON cada)
  python3 tools/respostas.py --todas         # lista todas
  python3 tools/respostas.py --marcar ITEM…  # marca como registadas (depois de decide.py)

Cada linha tem o mesmo formato que a coleção «respostas» do artifact:
  {"item_id", "decisao" (aprovado|rejeitado|adiado), "nota", "ts" (AAAA-MM-DD HH:MM, Lisboa), "registada", "ids", "texto", "categoria", "quem"}
Usa a chave service_role (SUPABASE_SERVICE_ROLE_KEY ou Porta-chaves «arvore-familia-service-role»), que nunca fica em ficheiros.
"""
import argparse, json, sys, urllib.parse
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from exportar import chave, url_supabase, pedido

def lisboa(ts):
    try:
        return datetime.fromisoformat(ts.replace('Z', '+00:00')).astimezone(ZoneInfo('Europe/Lisbon')).strftime('%Y-%m-%d %H:%M')
    except Exception:
        return ts

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--todas', action='store_true')
    ap.add_argument('--marcar', nargs='+', metavar='ITEM')
    a = ap.parse_args()
    sb, k = url_supabase(), chave()
    if a.marcar:
        lista = ','.join(urllib.parse.quote(i, safe='') for i in a.marcar)
        r = pedido('PATCH', f'{sb}/rest/v1/respostas?item_id=in.({lista})', k,
                   json.dumps({'registada': True, 'registada_em': datetime.now(timezone.utc).isoformat()}).encode(),
                   extra={'Prefer': 'return=representation'})
        print(f'{len(r or [])} marcada(s) como registada(s)')
        return
    filtro = '' if a.todas else '&registada=eq.false'
    for r in pedido('GET', f'{sb}/rest/v1/respostas?select=*&order=ts{filtro}', k) or []:
        r['ts'] = lisboa(r['ts'])
        print(json.dumps(r, ensure_ascii=False))

if __name__ == '__main__':
    main()
