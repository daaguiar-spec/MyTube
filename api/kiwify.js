// Webhook da Kiwify: marca a assinatura do cliente no Firestore.
// Usa um "usuário-robô" do Firebase Auth (sem chave de conta de serviço).
// URL na Kiwify: https://SEU-DOMINIO/api/kiwify?k=KIWIFY_SECRET
// Variáveis na Vercel: KIWIFY_SECRET, ROBOT_EMAIL, ROBOT_PASS
const API_KEY = 'AIzaSyDniezmwJ-Z1aH5RNqnS1BiwIyQVhEDPJ8';
const PROJECT = 'personaltube-2e3f3';
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const ATIVA = ['order_approved', 'paid', 'approved', 'subscription_renewed', 'compra_aprovada'];
const ATRASADA = ['subscription_late', 'waiting_payment'];
const CANCELADA = ['subscription_canceled', 'order_refunded', 'refunded', 'chargeback', 'chargedback', 'canceled', 'cancelled'];

let tok = null;
async function token() {
  if (tok && tok.exp > Date.now()) return tok.id;
  const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + API_KEY, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.ROBOT_EMAIL, password: process.env.ROBOT_PASS, returnSecureToken: true })
  });
  const j = await r.json();
  if (!j.idToken) throw new Error('Login do robô falhou: ' + ((j.error && j.error.message) || r.status));
  tok = { id: j.idToken, exp: Date.now() + 50 * 60 * 1000 };
  return tok.id;
}
const val = v => v == null ? { nullValue: null } : typeof v === 'number' ? { integerValue: String(Math.round(v)) } : { stringValue: String(v) };
const fields = o => ({ fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)])) });

async function fsReq(method, path, body) {
  const r = await fetch(FS + path, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await token() }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('Firestore ' + r.status + ': ' + (await r.text()).slice(0, 300));
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const k = new URL(req.url, 'https://x').searchParams.get('k');
  if (!process.env.KIWIFY_SECRET || k !== process.env.KIWIFY_SECRET) return res.status(401).json({ ok: false });

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  b = b || {};
  const cust = b.Customer || b.customer || {};
  const email = String(cust.email || b.email || '').trim().toLowerCase();
  const ev = String(b.webhook_event_type || b.event || b.order_status || '').toLowerCase();
  const sub = b.Subscription || b.subscription || {};
  let status = null;
  if (ATIVA.includes(ev)) status = 'ativa';
  else if (ATRASADA.includes(ev)) status = 'atrasada';
  else if (CANCELADA.includes(ev)) status = 'cancelada';

  try {
    await fsReq('POST', '/webhook_logs', fields({ ev, email, status, at: Date.now(), raw: JSON.stringify(b).slice(0, 5000) }));
    if (email && status) {
      const data = { status, evento: ev, proximoPagamento: sub.next_payment || null, produto: (b.Product && b.Product.product_name) || null, updatedAt: Date.now() };
      const mask = Object.keys(data).map(f => 'updateMask.fieldPaths=' + f).join('&');
      await fsReq('PATCH', '/assinaturas/' + encodeURIComponent(email) + '?' + mask, fields(data));
    }
    return res.status(200).json({ ok: true, status });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
};
