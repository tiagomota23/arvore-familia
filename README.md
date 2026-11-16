# Árvore da Família

Webapp (PWA, telemóvel e computador) com a árvore genealógica da família do Tiago e da Ana Catarina: ficha de cada pessoa, árvore de antepassados e descendentes, linha de parentesco, imagens dos assentos e fotos. Substitui o artifact da árvore de referência.

Projeto **independente**: Supabase, cliente Google OAuth, repositório e chave Resend próprios. Não partilha nada com outros projetos.

- **Código:** público (este repositório), alojado no GitHub Pages.
- **Dados:** nunca no repositório nem no Pages. Ficam no Supabase, protegidos por RLS, e só saem para utilizadores aprovados. `export/` está no `.gitignore`.
- **Entrada:** conta Google (Supabase Auth, `signInWithOAuth`). Só entra quem está na tabela `membros`.

## Utilizadores, convites e âncora
- Cada pessoa da árvore pode vir a ser utilizador. Só o **gestor** (Tiago) convida, aprova, muda âncoras e retira acessos.
- **Convidar** (separador *Gestão*): escolher a pessoa da árvore → «Criar convite» → link `…/?convite=TOKEN` (30 dias, uma utilização) para partilhar.
- Quem abre o link entra com Google e fica com um **pedido de acesso** (tabela `pedidos`) já ligado à pessoa do convite. O gestor recebe um email (Resend) com o botão «Abrir a Gestão».
- **Aprovar:** em *Gestão → Pedidos*, confirmar (ou trocar) a pessoa-âncora e carregar em «Aprovar». Sem convite também se pode aprovar, escolhendo a âncora.
- **Âncora:** a árvore abre nessa pessoa; o título é «Árvore da Família de ‹âncora› e ‹cônjuge›»; os parentescos são calculados a partir dela. O utilizador não a pode mudar; o gestor muda-a em *Gestão → Utilizadores → Mudar âncora*.
- **Bloquear / Retirar acesso:** a pessoa deixa de entrar e não volta a poder pedir acesso.

## O que cada um vê
| | Membro | Gestor |
|---|---|---|
| Árvore, fichas, factos aceites, notas, imagens dos assentos, fotos, fontes locais | ✓ | ✓ |
| Estados do MyHeritage, contadores, filtros de pendentes, origens, decisões, correspondências, Geni, pessoas apagadas | — | ✓ |
| *À espera do Tiago* (aprovar / rejeitar / adiar), *Por validar*, *Para o Operador*, *Gestão* | — | ✓ |
| Mudar «Quem sou eu» e a âncora | — | ✓ |

A separação está nos dados, não só no ecrã: há duas camadas na tabela `arvore_export` — `familia` (sem o trabalho interno) e `gestor` (completa) — e a RLS só entrega a `gestor` ao gestor.

## Dados: exportação a partir da árvore de referência
A árvore de referência (sessão «Árvore de referência», pasta `MyHeritage/Correspondências/arvore/`) é a fonte. A webapp só a **lê**:

```bash
python3 tools/exportar.py            # gera export/gestor.json, export/familia.json e export/img/ (modo de demonstração)
python3 tools/exportar.py --enviar   # e grava as duas camadas no Supabase + envia as imagens novas para o bucket privado «arvore»
```
Lê `arvore/site/data.json` (gerado por `build.py`) e `arvore/site/img/`. Correr depois de cada `build.py`. A app compara a versão e só descarrega de novo quando muda.

## Decisões do gestor (fila «À espera do Tiago»)
As respostas vão para a tabela `respostas` (`item_id, decisao, nota, ts, registada, ids, texto, categoria, quem`), só acessível ao gestor. O Arquiteto lê-as e, depois de as registar com `arvore/decide.py`, marca-as:
```bash
python3 tools/respostas.py                    # por registar, uma linha JSON cada (mesmo formato do artifact)
python3 tools/respostas.py --marcar ITEM_ID…  # registada = true
```
Se o gestor mudar uma resposta, ela volta a «por registar».

## Chaves (nunca em ficheiros)
- `config.js`: URL e chave **anon** do projeto (públicas, como em qualquer app Supabase).
- Chave **service_role** (para `exportar.py --enviar` e `respostas.py`): no Porta-chaves do macOS
  ```bash
  security add-generic-password -a "$USER" -s arvore-familia-service-role -w
  ```
  (pede a chave; cola-se lá) ou na variável `SUPABASE_SERVICE_ROLE_KEY`.
- Segredos da função `notify` (no Supabase): `RESEND_API_KEY`, `APP_URL` (ex.: `https://<utilizador>.github.io/arvore-familia/`), opcional `EMAIL_FROM`.

## Instalação (uma vez)
1. **Supabase:** criar um projeto novo só para a Árvore (região UE). SQL Editor → correr `supabase/schema.sql`. Depois, à parte, inserir o gestor:
   `insert into public.membros (email, nome, papel, pessoa_id, added_by) values ('<email Google>', 'Tiago', 'gestor', '1000003', 'instalação');`
2. **Google Cloud:** projeto próprio «Árvore da Família» → ecrã de consentimento (externo, só `email`/`profile`, estado **Em produção** para não ter de listar utilizadores de teste) → cliente OAuth «Aplicação Web» com o URI de redirecionamento `https://<projeto>.supabase.co/auth/v1/callback`.
3. **Supabase → Authentication:** ativar Google com o Client ID/Secret; *URL Configuration*: Site URL e Redirect URLs = endereço do Pages (e `http://localhost:8765/` para testes).
4. **Resend:** chave API própria para este projeto; `supabase secrets set RESEND_API_KEY=… APP_URL=…` e `supabase functions deploy notify`.
5. **config.js:** URL e chave anon do projeto.
6. **GitHub:** repositório público `arvore-familia` → Settings → Pages (branch `main`, raiz).
7. `python3 tools/exportar.py --enviar`.

Sem domínio verificado no Resend, o remetente de teste só entrega ao dono da conta Resend — chega para o gestor.

Teste do email (só com a chave service_role; devolve a resposta do Resend e envia «Árvore: teste de email» ao gestor):
```bash
K=$(security find-generic-password -s arvore-familia-service-role -w); curl -s -X POST https://khuybebmdnzttexjdngf.supabase.co/functions/v1/notify -H "apikey: $K" -H "Authorization: Bearer $K" -H 'Content-Type: application/json' -d '{"type":"teste"}'
```

## Modo de demonstração (localhost)
```bash
python3 tools/exportar.py
python3 -m http.server 8765 --bind 127.0.0.1
```
- `http://localhost:8765/?demo` — gestor (sem Google; respostas e gestão em localStorage)
- `http://localhost:8765/?demo&membro=1000045` — membro ancorado na pessoa 1000045 (camada `familia`)
- `http://localhost:8765/?demo&semconta` — ecrã de entrada

## Ficheiros
- `index.html`, `styles.css` (do artifact), `app.css`, `arvore.js` (desenho da árvore, vindo do artifact), `app.js` (sessão, acesso, gestão, dados, imagens)
- `sw.js` (só a «casca» da app em cache; os dados ficam em IndexedDB, apagado ao sair), `manifest.json`, `icons/`, `privacidade.html`
- `supabase/schema.sql`, `supabase/functions/notify/` (email do pedido de acesso)
- `tools/exportar.py`, `tools/respostas.py`
