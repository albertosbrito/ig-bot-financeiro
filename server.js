// server.js — Webhook Instagram para responder comentários com palavra-chave
// Autor: bot para @albertobri7o

import express from 'express';
import crypto from 'crypto';

const app = express();

// IMPORTANTE: precisamos do raw body para validar a assinatura da Meta
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
}));

// ============ CONFIGURAÇÕES (vêm de variáveis de ambiente no Railway) ============
const VERIFY_TOKEN     = process.env.VERIFY_TOKEN;
const APP_SECRET       = process.env.APP_SECRET;
const ACCESS_TOKEN     = process.env.ACCESS_TOKEN;
const IG_USER_ID       = process.env.IG_USER_ID;
const PALAVRA_CHAVE    = (process.env.PALAVRA_CHAVE || 'FINANCEIRO').toUpperCase();
const LINK_PLANILHA    = process.env.LINK_PLANILHA;
const MENSAGEM_COMENTARIO = process.env.MENSAGEM_COMENTARIO || 'te mandei no direct! 📩';
const MENSAGEM_DM      = process.env.MENSAGEM_DM ||
  `Oi! 👋 Aqui está sua planilha de finanças pessoais gratuita:\n\n${process.env.LINK_PLANILHA}\n\nQualquer dúvida, é só responder este chat. — @albertobri7o`;

// Para evitar processar o mesmo comentário 2x
const comentariosProcessados = new Set();

// ============ HEALTHCHECK ============
app.get('/', (req, res) => {
  res.send('Bot do Instagram rodando ✅');
});

// ============ VERIFICAÇÃO DO WEBHOOK ============
app.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook verificado pela Meta');
    return res.status(200).send(challenge);
  }
  console.warn('⚠️  Tentativa de verificação rejeitada');
  return res.sendStatus(403);
});

// ============ VALIDAÇÃO DA ASSINATURA ============
function assinaturaValida(req) {
  const signature = req.get('x-hub-signature-256');
  if (!signature || !APP_SECRET) return false;
  const expected = 'sha256=' + crypto
    .createHmac('sha256', APP_SECRET)
    .update(req.rawBody)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch { return false; }
}

// ============ RECEBE EVENTOS DA META ============
app.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  if (!assinaturaValida(req)) {
    console.warn('⚠️  Assinatura inválida — ignorando');
    return;
  }

  const body = req.body;
  if (body.object !== 'instagram') return;

  for (const entry of (body.entry || [])) {
    for (const change of (entry.changes || [])) {
      if (change.field === 'comments') {
        await processarComentario(change.value);
      }
    }
  }
});

// ============ LÓGICA PRINCIPAL ============
async function processarComentario(comentario) {
  const { id: commentId, text, from } = comentario;

  if (!text || !commentId) return;
  if (comentariosProcessados.has(commentId)) return;
  comentariosProcessados.add(commentId);

  if (comentariosProcessados.size > 5000) {
    const arr = [...comentariosProcessados].slice(-2500);
    comentariosProcessados.clear();
    arr.forEach(id => comentariosProcessados.add(id));
  }

  const textoNormalizado = text.toUpperCase().trim();
  if (!textoNormalizado.includes(PALAVRA_CHAVE)) {
    console.log(`💬 Comentário ignorado (sem palavra-chave): "${text}"`);
    return;
  }

  const username = from?.username || 'seguidor';
  const userId = from?.id;
  console.log(`🎯 Match! @${username} comentou "${text}"`);

  // 1. Responde publicamente ao comentário
  try {
    await responderComentario(commentId, `@${username} ${MENSAGEM_COMENTARIO}`);
  } catch (e) {
    console.error('Erro ao responder comentário:', e.message);
  }

  // 2. Envia DM com o link
  if (userId) {
    try {
      await enviarDM(userId, MENSAGEM_DM);
      console.log(`✅ DM enviada para @${username}`);
    } catch (e) {
      console.error(`❌ Erro ao enviar DM para @${username}:`, e.message);
    }
  }
}

// ============ CHAMADAS À GRAPH API ============
async function responderComentario(commentId, mensagem) {
  const url = `https://graph.instagram.com/v21.0/${commentId}/replies`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: mensagem,
      access_token: ACCESS_TOKEN
    })
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

async function enviarDM(igUserId, mensagem) {
  const url = `https://graph.instagram.com/v21.0/${IG_USER_ID}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: igUserId },
      message: { text: mensagem },
      access_token: ACCESS_TOKEN
    })
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

// ============ START ============
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor ouvindo na porta ${PORT}`);
  console.log(`   Palavra-chave: ${PALAVRA_CHAVE}`);
  console.log(`   IG User ID configurado: ${IG_USER_ID ? '✅' : '❌ FALTANDO'}`);
  console.log(`   Access Token configurado: ${ACCESS_TOKEN ? '✅' : '❌ FALTANDO'}`);
});
