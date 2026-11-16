// Árvore da Família — aviso por email ao gestor quando alguém pede acesso.
// Chamada pela app logo a seguir a pedir_acesso() (com a sessão Google da pessoa). Só envia se houver um pedido
// pendente ainda não notificado para esse email; marca notified_at (não há emails repetidos).
// Segredos do projeto (o Tiago define-os; nunca no código): RESEND_API_KEY, APP_URL. SUPABASE_URL e
// SUPABASE_SERVICE_ROLE_KEY já existem nas funções do Supabase.
const SB = Deno.env.get('SUPABASE_URL')!;
const SK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND = Deno.env.get('RESEND_API_KEY');
const APP = Deno.env.get('APP_URL') || '';
const FROM = Deno.env.get('EMAIL_FROM') || 'Árvore da Família <onboarding@resend.dev>';
const HDR = { apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json' };
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { ...HDR, ...(init.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${path.split('?')[0]} ${r.status}: ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}

async function onPedido(req: Request) {
  const u = await fetch(`${SB}/auth/v1/user`, { headers: { apikey: SK, Authorization: req.headers.get('authorization') || '' } });
  if (!u.ok) return json({ error: 'sem sessão' }, 401);
  const email = String((await u.json()).email || '').toLowerCase();
  if (!email) return json({ error: 'sem sessão' }, 401);
  const [p] = await rest(`pedidos?email=eq.${encodeURIComponent(email)}&estado=eq.pendente&notified_at=is.null&select=*`);
  if (!p) return json({ skipped: true });
  const gestores = (await rest('membros?papel=eq.gestor&select=email')).map((x: { email: string }) => x.email);
  if (!gestores.length) return json({ error: 'sem gestor' }, 500);
  if (!RESEND) return json({ error: 'RESEND_API_KEY em falta' }, 500);
  const link = APP ? `${APP}#gestao` : '';
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #d8dfdb;border-radius:12px;overflow:hidden">
    <div style="background:#23614a;color:#fff;padding:16px 22px;font-size:20px">Árvore da Família</div>
    <div style="padding:22px;color:#1d2622;font-size:15px;line-height:1.5"><h2 style="margin:0 0 12px;font-size:18px;color:#23614a">Pedido de acesso</h2>
    <p><b>${esc(p.nome || '(sem nome)')}</b><br>${esc(p.email)}</p>
    <p>${p.pessoa_id ? `Entrou com o convite para <b>${esc(p.pessoa_nome || p.pessoa_id)}</b>.` : 'Entrou sem convite.'}</p>
    ${link ? `<p><a href="${link}" style="display:inline-block;padding:12px 22px;border-radius:22px;background:#23614a;color:#fff;text-decoration:none;font-weight:bold">Abrir a Gestão</a></p>` : ''}
    <p style="color:#5d6b65;font-size:13px">A aprovação faz-se na app, com a sua sessão de gestor; ao aprovar escolhe (ou confirma) a pessoa-âncora.</p></div></div>`;
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: gestores, subject: `Árvore: pedido de acesso de ${p.nome || p.email}${p.pessoa_id ? ' (convite)' : ''}`, html }) });
  if (!r.ok) {
    const msg = 'Resend ' + r.status + ': ' + (await r.text()).slice(0, 300);
    console.error(msg, 'chave com', RESEND.length, 'caracteres, começa por re_:', RESEND.startsWith('re_'));
    return json({ error: msg }, 502);
  }
  await rest(`pedidos?id=eq.${p.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ notified_at: new Date().toISOString() }) });
  return json({ sent: true });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  let b: { type?: string } = {};
  try { b = await req.json(); } catch (_) { /* sem corpo */ }
  try {
    if (b.type === 'pedido') return await onPedido(req);
    return json({ error: 'tipo desconhecido' }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
