// Webhook da Kiwify: marca a assinatura do cliente no Firestore.
// URL para cadastrar na Kiwify: https://SEU-DOMINIO/api/kiwify?k=KIWIFY_SECRET
// Variáveis na Vercel: KIWIFY_SECRET e FIREBASE_SA (JSON da conta de serviço do Firebase).
const admin = require('firebase-admin');

function db() {
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SA)) });
  }
  return admin.firestore();
}

const ATIVA = ['order_approved', 'paid', 'approved', 'subscription_renewed', 'compra_aprovada'];
const ATRASADA = ['subscription_late', 'waiting_payment'];
const CANCELADA = ['subscription_canceled', 'order_refunded', 'refunded', 'chargeback', 'chargedback', 'canceled', 'cancelled'];

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
    const d = db();
    await d.collection('webhook_logs').add({ ev, email, status, at: Date.now(), raw: JSON.stringify(b).slice(0, 5000) });
    if (email && status) {
      await d.collection('assinaturas').doc(email).set({
        status, evento: ev, proximoPagamento: sub.next_payment || null,
        produto: (b.Product && b.Product.product_name) || null, updatedAt: Date.now()
      }, { merge: true });
    }
    return res.status(200).json({ ok: true, status });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
};
