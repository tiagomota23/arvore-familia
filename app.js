// Árvore da Família — sessão (Google via Supabase Auth), acesso por convite, gestão e dados.
// A árvore (arvore.js) só desenha; aqui decide-se quem entra, que camada de dados recebe e onde se guardam as respostas.
(() => {
  'use strict';
  const CFG = window.ARVORE_CONFIG || {};
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const Q = new URLSearchParams(location.search);
  // Modo de demonstração só em localhost (?demo): sem Google, com a exportação local (export/, fora do git).
  //   ?demo            → gestor (Tiago)
  //   ?demo&membro=ID  → membro ancorado na pessoa ID (vê só a camada «familia»)
  //   ?demo&semconta   → ecrã de entrada
  const DEMO = ['localhost', '127.0.0.1'].includes(location.hostname) && Q.has('demo');
  const sb = !DEMO && window.supabase && CFG.SUPABASE_URL && !/COLOCAR/.test(CFG.SUPABASE_URL)
    ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true } })
    : null;
  let ME = null; // { email, nome, papel, pessoa_id }

  // ---------- convite (?convite=TOKEN): guarda-se até a pessoa entrar com Google
  const INV_KEY = 'arvore.convite';
  try {
    const cv = Q.get('convite');
    if (cv && /^[A-Za-z0-9_-]{16,64}$/.test(cv)) {
      localStorage.setItem(INV_KEY, cv); Q.delete('convite');
      history.replaceState(null, '', location.pathname + (Q.toString() ? '?' + Q : '') + location.hash);
    }
  } catch (e) {}
  const convite = () => { try { return localStorage.getItem(INV_KEY); } catch (e) { return null; } };

  // ---------- ecrãs
  function gate(msg, showButton = true) {
    $('#view-app').hidden = true; $('#view-login').hidden = false;
    $('#btn-google').hidden = !showButton;
    $('#login-msg').innerHTML = msg || (convite() ? 'Recebeu um convite para a Árvore da Família. Entre com a sua conta Google; o Tiago confirma o acesso.' : '');
  }
  $('#btn-google').onclick = async () => {
    if (!sb) { $('#login-msg').textContent = 'A app ainda não está ligada ao Supabase (config.js).'; return; }
    $('#login-msg').textContent = 'A abrir o Google…';
    const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname, queryParams: { prompt: 'select_account' } } });
    if (error) $('#login-msg').textContent = 'Erro: ' + error.message;
  };
  async function sair(msg) {
    try { if (sb) await sb.auth.signOut(); } catch (e) {}
    await cache.clear();
    ME = null; gate(msg);
  }
  function conta() {
    $('#conta').innerHTML = `<span class="muted">${esc(ME.email)}${ME.papel === 'gestor' ? ' · gestor' : ''}</span> <button class="linkbtn" id="sair" type="button">Sair</button>`;
    $('#sair').onclick = () => sair(DEMO ? 'Modo de demonstração: recarregue a página para voltar.' : 'Sessão terminada.');
  }

  // ---------- cópia local dos dados (IndexedDB; apagada ao sair)
  const cache = {
    db() { return new Promise((ok, ko) => { const r = indexedDB.open('arvore', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); }); },
    async get(k) { try { const db = await this.db(); return await new Promise(ok => { const r = db.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => ok(r.result || null); r.onerror = () => ok(null); }); } catch (e) { return null; } },
    async set(k, v) { try { const db = await this.db(); db.transaction('kv', 'readwrite').objectStore('kv').put(v, k); } catch (e) {} },
    async clear() { try { indexedDB.deleteDatabase('arvore'); } catch (e) {} },
  };

  // ---------- dados da árvore: camada «gestor» (completa) ou «familia» (sem o trabalho interno)
  async function carregarDados(camada) {
    if (DEMO) { const r = await fetch(`export/${camada}.json`, { cache: 'no-cache' }); if (!r.ok) throw new Error('Falta export/' + camada + '.json — corra tools/exportar.py'); return r.json(); }
    const { data: v, error: e1 } = await sb.from('arvore_export').select('versao').eq('camada', camada).maybeSingle();
    if (e1) throw e1;
    if (!v) throw new Error('A árvore ainda não foi exportada para o Supabase.');
    const key = `${ME.email}:${camada}`, c = await cache.get(key);
    if (c && c.versao === v.versao) return c.dados;
    const { data, error } = await sb.from('arvore_export').select('versao,dados').eq('camada', camada).single();
    if (error) throw error;
    await cache.set(key, { versao: data.versao, dados: data.dados });
    return data.dados;
  }

  // ---------- imagens (bucket privado «arvore», URLs assinados de 1 hora)
  const signed = new Map();
  async function media(root) {
    const els = [...root.querySelectorAll('[data-m],[data-mh]')];
    if (!els.length) return;
    const paths = [...new Set(els.map(e => e.dataset.m || e.dataset.mh))];
    if (DEMO) { for (const p of paths) signed.set(p, 'export/' + p); }
    else {
      const falta = paths.filter(p => !signed.has(p));
      if (falta.length) {
        const { data } = await sb.storage.from('arvore').createSignedUrls(falta, 3600);
        for (const x of data || []) if (x.signedUrl) signed.set(x.path, x.signedUrl);
        setTimeout(() => falta.forEach(p => signed.delete(p)), 50 * 60e3);
      }
    }
    for (const e of els) {
      const u = signed.get(e.dataset.m || e.dataset.mh); if (!u) continue;
      if (e.dataset.m) e.src = u; else e.href = u;
    }
  }

  // ---------- respostas do gestor (tabela «respostas»)
  const fmt = ts => { try { return new Date(ts).toLocaleString('sv-SE', { timeZone: 'Europe/Lisbon' }).slice(0, 16); } catch (e) { return ts; } };
  const respostas = {
    async load() {
      if (DEMO) { try { return JSON.parse(localStorage.getItem('arvore.demo.respostas') || '{}'); } catch (e) { return {}; } }
      const { data, error } = await sb.from('respostas').select('*');
      if (error) throw error;
      const o = {}; for (const r of data) o[r.item_id] = { ...r, ts: fmt(r.ts) }; return o;
    },
    async save(doc) {
      if (DEMO) {
        const o = await this.load(); o[doc.item_id] = { ...doc, ts: fmt(new Date()), registada: false, quem: ME.email };
        localStorage.setItem('arvore.demo.respostas', JSON.stringify(o)); return o[doc.item_id];
      }
      const { data, error } = await sb.from('respostas').upsert(doc, { onConflict: 'item_id' }).select().single();
      if (error) throw error;
      return { ...data, ts: fmt(data.ts) };
    },
  };

  // ---------- API de gestão (RPCs no Supabase; em demonstração, localStorage)
  const demoStore = { get: k => { try { return JSON.parse(localStorage.getItem('arvore.demo.' + k)) ?? null; } catch (e) { return null; } }, set: (k, v) => localStorage.setItem('arvore.demo.' + k, JSON.stringify(v)) };
  function demoInit() {
    if (!demoStore.get('membros')) demoStore.set('membros', [{ email: 'gestor@demo', nome: 'Tiago (demo)', papel: 'gestor', pessoa_id: '1000003', added_at: new Date().toISOString() }, { email: 'prima@exemplo.pt', nome: 'Prima (exemplo)', papel: 'membro', pessoa_id: '1000004', added_at: new Date().toISOString() }]);
    if (!demoStore.get('pedidos')) demoStore.set('pedidos', [{ id: 'd1', email: 'primo@exemplo.pt', nome: 'Primo (exemplo)', pessoa_id: '1000001', pessoa_nome: '', estado: 'pendente', created_at: new Date().toISOString() }]);
    if (!demoStore.get('convites')) demoStore.set('convites', []);
  }
  async function rpc(fn, args = {}) {
    if (!DEMO) { const { data, error } = await sb.rpc(fn, args); if (error) throw error; return data; }
    demoInit();
    const M = demoStore.get('membros'), P = demoStore.get('pedidos'), C = demoStore.get('convites');
    if (fn === 'gestao_listar') return { membros: M, pedidos: P.filter(p => p.estado === 'pendente'), convites: C };
    if (fn === 'criar_convite') { const t = 'demo' + Math.random().toString(36).slice(2).padEnd(16, 'x'); C.unshift({ token: t, pessoa_id: args.p_pessoa, pessoa_nome: args.p_nome, nota: args.p_nota, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 30 * 864e5).toISOString() }); demoStore.set('convites', C); return t; }
    if (fn === 'apagar_convite') { demoStore.set('convites', C.filter(c => c.token !== args.p_token)); return null; }
    if (fn === 'aprovar_pedido') { const p = P.find(x => x.id === args.p_id); p.estado = 'aprovado'; M.push({ email: p.email, nome: p.nome, papel: 'membro', pessoa_id: args.p_pessoa, added_at: new Date().toISOString() }); demoStore.set('pedidos', P); demoStore.set('membros', M); return null; }
    if (fn === 'bloquear_pedido') { P.find(x => x.id === args.p_id).estado = 'bloqueado'; demoStore.set('pedidos', P); return null; }
    if (fn === 'mudar_ancora') { M.find(x => x.email === args.p_email).pessoa_id = args.p_pessoa; demoStore.set('membros', M); return null; }
    if (fn === 'remover_membro') { demoStore.set('membros', M.filter(x => x.email !== args.p_email)); return null; }
    throw new Error('rpc ' + fn);
  }

  // ---------- escolher uma pessoa da árvore (para âncoras e convites)
  function picker(el, initial, onPick) {
    const nrm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    el.innerHTML = `<div class="egobox pick"><input type="search" autocomplete="off" placeholder="Pessoa da árvore (nome ou id)…" value="${esc(initial ? ARV.nome(initial) : '')}"><div class="egosug" role="listbox" hidden></div></div>`;
    const q = el.querySelector('input'), box = el.querySelector('.egosug');
    let chosen = initial || null;
    q.addEventListener('input', () => {
      chosen = null; onPick(null);
      const t = nrm(q.value.trim()).split(/\s+/).filter(Boolean);
      if (!t.length) { box.hidden = true; return; }
      const L = ARV.pessoas().filter(p => !p.del && t.every(x => p._s.includes(x))).slice(0, 10);
      box.innerHTML = L.map(p => `<button type="button" role="option" data-id="${esc(p.id)}">${esc(p.n)}<small>${p.nb ? 'n. ' + esc(p.nb) + ' · ' : ''}${esc(p.id)}</small></button>`).join('') || '<div class="egonote" style="padding:6px 10px">Ninguém com esse nome.</div>';
      box.hidden = false;
      box.querySelectorAll('button').forEach(b => b.onclick = () => { chosen = String(b.dataset.id); q.value = ARV.nome(b.dataset.id); box.hidden = true; onPick(chosen); });
    });
    if (initial) onPick(String(initial));
    return () => chosen;
  }
  const pessoaLink = id => id ? `<a href="#p${esc(ARV.hk(id))}">${esc(ARV.nome(id))}</a>` : '<span class="muted">—</span>';
  const quando = d => d ? new Date(d).toLocaleDateString('pt-PT') : '';

  // ---------- página «Gestão» (só gestor; o servidor confirma em cada RPC)
  async function gestao(main) {
    main.innerHTML = '<div class="empty">A carregar…</div>';
    let G;
    try { G = await rpc('gestao_listar'); } catch (e) { main.innerHTML = `<div class="empty">Não foi possível ler a gestão (${esc(e.message || e)}).</div>`; return; }
    const base = location.origin + location.pathname;
    main.innerHTML = `
      <div class="sec"><h2>Gestão de utilizadores</h2><div class="muted">Só o gestor convida, aprova e muda âncoras. Cada utilizador vê a árvore a partir da sua pessoa-âncora; o título mostra essa pessoa.</div></div>
      <details class="sec" open><summary><h3>Pedidos de acesso (${G.pedidos.length})</h3></summary><div class="body gq">
        ${G.pedidos.map(p => `<div class="gi" data-id="${esc(p.id)}"><div><b>${esc(p.nome || '(sem nome)')}</b> <span class="muted">${esc(p.email)}</span><div class="muted">${quando(p.created_at)}${p.pessoa_id ? ' · convite para ' + pessoaLink(p.pessoa_id) : ' · sem convite'}</div></div>
          <div class="gpick"></div><div class="gbtns"><button class="dbtn d-aprovado" data-a="ok" disabled>Aprovar</button><button class="dbtn d-rejeitado" data-a="no">Bloquear</button><span class="msg muted"></span></div></div>`).join('') || '<div class="muted">Nenhum pedido pendente.</div>'}
      </div></details>
      <details class="sec" open><summary><h3>Convidar</h3></summary><div class="body">
        <div class="muted">Escolha a pessoa da árvore a quem se destina o convite (fica a ser a âncora dela). O link vale 30 dias e serve uma vez; quem entrar por ele continua a precisar da sua aprovação.</div>
        <div class="ginv"><div id="inv-pick"></div><input id="inv-nota" type="text" placeholder="Nota (opcional, ex.: email ou para quem é)"><button class="dbtn d-aprovado" id="inv-go" disabled>Criar convite</button></div>
        <div id="inv-out"></div>
        ${G.convites.length ? `<table class="op gt"><thead><tr><th>Pessoa</th><th>Nota</th><th>Criado</th><th>Estado</th><th></th></tr></thead><tbody>${G.convites.map(c => `<tr><td>${pessoaLink(c.pessoa_id)}</td><td>${esc(c.nota || '')}</td><td>${quando(c.created_at)}</td><td>${c.usado_por ? 'usado por ' + esc(c.usado_por) : new Date(c.expires_at) < new Date() ? 'expirado' : 'válido até ' + quando(c.expires_at)}</td><td>${c.usado_por ? '' : `<button class="linkbtn" data-copy="${esc(c.token)}">copiar link</button> · `}<button class="linkbtn" data-del="${esc(c.token)}">apagar</button></td></tr>`).join('')}</tbody></table>` : ''}
      </div></details>
      <details class="sec" open><summary><h3>Utilizadores (${G.membros.length})</h3></summary><div class="body gq">
        ${G.membros.map(m => `<div class="gi" data-email="${esc(m.email)}"><div><b>${esc(m.nome || m.email)}</b> <span class="muted">${esc(m.email)}${m.papel === 'gestor' ? ' · gestor' : ''}</span><div>Âncora: ${pessoaLink(m.pessoa_id)}</div></div>
          <div class="gbtns"><button class="linkbtn" data-anc="1">Mudar âncora</button>${m.papel === 'gestor' ? '' : ' · <button class="linkbtn" data-rm="1">Retirar acesso</button>'}<span class="msg muted"></span></div><div class="gpick" hidden></div></div>`).join('')}
      </div></details>`;
    const busy = (row, t) => { const m = row.querySelector('.msg'); if (m) m.textContent = t; };
    const again = () => gestao(main);
    main.querySelectorAll('.gq .gi[data-id]').forEach(row => {
      const p = G.pedidos.find(x => String(x.id) === row.dataset.id), ok = row.querySelector('[data-a="ok"]');
      const get = picker(row.querySelector('.gpick'), p.pessoa_id, id => { ok.disabled = !id; });
      ok.onclick = async () => { busy(row, 'A aprovar…'); try { await rpc('aprovar_pedido', { p_id: p.id, p_pessoa: get() }); again(); } catch (e) { busy(row, 'Erro: ' + (e.message || e)); } };
      row.querySelector('[data-a="no"]').onclick = async () => { if (!confirm(`Bloquear ${p.email}? Não volta a poder pedir acesso.`)) return; try { await rpc('bloquear_pedido', { p_id: p.id }); again(); } catch (e) { busy(row, 'Erro: ' + (e.message || e)); } };
    });
    main.querySelectorAll('.gi[data-email]').forEach(row => {
      const m = G.membros.find(x => x.email === row.dataset.email);
      row.querySelector('[data-anc]').onclick = () => {
        const box = row.querySelector('.gpick'); box.hidden = false;
        box.innerHTML = '<div class="pk"></div><button class="dbtn d-aprovado" disabled>Guardar âncora</button>';
        const sv = box.querySelector('button'), get = picker(box.querySelector('.pk'), m.pessoa_id, id => { sv.disabled = !id || id === String(m.pessoa_id); });
        sv.onclick = async () => { busy(row, 'A guardar…'); try { await rpc('mudar_ancora', { p_email: m.email, p_pessoa: get() }); again(); } catch (e) { busy(row, 'Erro: ' + (e.message || e)); } };
      };
      const rm = row.querySelector('[data-rm]');
      if (rm) rm.onclick = async () => { if (!confirm(`Retirar o acesso a ${m.email}?`)) return; try { await rpc('remover_membro', { p_email: m.email }); again(); } catch (e) { busy(row, 'Erro: ' + (e.message || e)); } };
    });
    const go = $('#inv-go'), getInv = picker($('#inv-pick'), null, id => { go.disabled = !id; });
    go.onclick = async () => {
      go.disabled = true;
      try {
        const t = await rpc('criar_convite', { p_pessoa: getInv(), p_nome: ARV.nome(getInv()), p_nota: $('#inv-nota').value.trim() || null });
        const url = base + '?convite=' + t;
        $('#inv-out').innerHTML = `<div class="kv invout"><b>Convite para ${esc(ARV.nome(getInv()))}:</b> <input readonly value="${esc(url)}"> <button class="linkbtn" id="inv-share">${navigator.share ? 'partilhar' : 'copiar'}</button></div>`;
        $('#inv-share').onclick = () => partilhar(url, ARV.nome(getInv()));
      } catch (e) { $('#inv-out').textContent = 'Erro: ' + (e.message || e); go.disabled = false; }
    };
    main.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => partilhar(base + '?convite=' + b.dataset.copy));
    main.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (!confirm('Apagar este convite? O link deixa de funcionar.')) return; await rpc('apagar_convite', { p_token: b.dataset.del }); again(); });
  }
  async function partilhar(url, nome) {
    const text = `Convite para a Árvore da Família${nome ? ' (' + nome + ')' : ''}. Entre com a sua conta Google:`;
    if (navigator.share) { try { await navigator.share({ title: 'Árvore da Família', text, url }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(url); alert('Link copiado.'); } catch (e) { prompt('Copie o link:', url); }
  }

  window.APP = { media, respostas, gestao };

  // ---------- arranque
  async function arrancar() {
    try {
      const camada = ME.papel === 'gestor' ? 'gestor' : 'familia';
      gate('A carregar a árvore…', false);
      const d = await carregarDados(camada);
      $('#view-login').hidden = true; $('#view-app').hidden = false;
      conta();
      ARV.start(d, { gestor: ME.papel === 'gestor', ancora: ME.pessoa_id, email: ME.email });
    } catch (e) { console.error(e); gate('Não foi possível carregar a árvore: ' + esc(e.message || e), false); }
  }
  async function entrar() {
    if (DEMO) {
      if (Q.has('semconta')) return gate();
      const m = Q.get('membro');
      ME = m ? { email: 'membro@demo', nome: 'Membro (demo)', papel: 'membro', pessoa_id: m } : { email: 'gestor@demo', nome: 'Tiago (demo)', papel: 'gestor', pessoa_id: '1000003' };
      return arrancar();
    }
    if (!sb) return gate('A app ainda não está ligada ao Supabase (config.js).', false);
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return gate();
    let acesso;
    try { acesso = await rpc('meu_acesso'); } catch (e) { return gate('Sem ligação ao servidor. Tente de novo.'); }
    if (acesso && acesso.papel) { try { localStorage.removeItem(INV_KEY); } catch (e) {} ME = acesso; return arrancar(); }
    // sem acesso: regista (ou atualiza) o pedido, com o convite se houver, e avisa o gestor por email
    let r = null;
    try { r = await rpc('pedir_acesso', { p_convite: convite() }); } catch (e) {}
    try { localStorage.removeItem(INV_KEY); } catch (e) {}
    if (r && r.notificar) {
      try { await fetch(CFG.SUPABASE_URL + '/functions/v1/notify', { method: 'POST', headers: { apikey: CFG.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'pedido' }) }); } catch (e) {}
    }
    const email = esc(session.user.email);
    await sb.auth.signOut().catch(() => {});
    if (r && r.estado === 'bloqueado') return gate(`A conta ${email} não tem acesso.`);
    gate(`A conta ${email} ainda não tem acesso. ${r && r.convite ? 'O pedido (com o convite) foi enviado ao Tiago' : 'O pedido foi enviado ao Tiago'}; volte a entrar depois de ser aprovado.`);
  }
  if (sb) sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT' && ME) { ME = null; gate('Sessão terminada.'); } });
  if ('serviceWorker' in navigator && !DEMO) navigator.serviceWorker.register('sw.js').catch(() => {});
  entrar();
})();
