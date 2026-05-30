// server.js — Webhook Instagram para responder comentários com palavra-chave
// Autor: @albertobri7o

import express from 'express';
import crypto from 'crypto';

const app = express();

// Precisamos do raw body para validar a assinatura da Meta
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// ================= CONFIGURAÇÕES =================

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const APP_SECRET = process.env.APP_SECRET;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;

// ID da conta profissional do Instagram
const IG_USER_ID = process.env.IG_USER_ID;

// ID da Página do Facebook conectada ao Instagram
// Usado no endpoint de Private Reply
const PAGE_ID = process.env.PAGE_ID;

const GRAPH_VERSION = process.env.GRAPH_VERSION || 'v21.0';

const LINK_PLANILHA = process.env.LINK_PLANILHA;

const PALAVRA_CHAVE = normalizar(
  process.env.PALAVRA_CHAVE || 'FINANCEIRO'
);

const MENSAGEM_COMENTARIO =
  process.env.MENSAGEM_COMENTARIO || 'te mandei no direct! 📩';

const MENSAGEM_COMENTARIO_ERRO =
  process.env.MENSAGEM_COMENTARIO_ERRO ||
  'não consegui mandar automático, me chama no direct que eu te envio 📩';

const MENSAGEM_DM =
  process.env.MENSAGEM_DM ||
  `Oi! 👋 Aqui está sua planilha de finanças pessoais gratuita:\n\n${LINK_PLANILHA}\n\nQualquer dúvida, é só responder este chat.\n\n— @albertobri7o`;

const RESPONDER_PUBLICO =
  (process.env.RESPONDER_PUBLICO || 'true').toLowerCase() === 'true';

const ENVIAR_PRIVATE_REPLY =
  (process.env.ENVIAR_PRIVATE_REPLY || 'true').toLowerCase() === 'true';

// Cache simples para evitar processar o mesmo comentário 2x
// Em produção com mais de uma instância, o ideal é Redis/Postgres.
const comentariosProcessados = new Map();

const TEMPO_CACHE_MS = Number(
  process.env.TEMPO_CACHE_MS || 1000 * 60 * 60 * 24
);

// ================= HEALTHCHECK =================

app.get('/', (req, res) => {
  res.send('Bot do Instagram rodando ✅');
});

// ================= VERIFICAÇÃO DO WEBHOOK =================

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook verificado pela Meta');
    return res.status(200).send(challenge);
  }

  console.warn('⚠️ Tentativa de verificação rejeitada');
  return res.sendStatus(403);
});

// ================= RECEBE EVENTOS DA META =================

app.post('/webhook', async (req, res) => {
  if (!assinaturaValida(req)) {
    console.warn('⚠️ Assinatura inválida — ignorando evento');
    return res.sendStatus(403);
  }

  // Responde rápido para a Meta não reenviar o evento por timeout
  res.sendStatus(200);

  try {
    const body = req.body;

    if (body.object !== 'instagram') {
      console.log('Evento ignorado: object diferente de instagram');
      return;
    }

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field === 'comments') {
          await processarComentario(change.value);
        }
      }
    }
  } catch (error) {
    console.error('❌ Erro geral no webhook:', error.message);
  }
});

// ================= LÓGICA PRINCIPAL =================

async function processarComentario(comentario) {
  const commentId = comentario?.id;
  const text = comentario?.text;
  const username = comentario?.from?.username || 'seguidor';

  if (!commentId || !text) {
    console.log('Comentário ignorado: sem id ou sem texto');
    return;
  }

  limparCacheProcessados();

  if (comentariosProcessados.has(commentId)) {
    console.log(`Comentário já processado: ${commentId}`);
    return;
  }

  const textoNormalizado = normalizar(text);

  if (!textoNormalizado.includes(PALAVRA_CHAVE)) {
    console.log(`💬 Comentário ignorado: "${text}"`);
    return;
  }

  comentariosProcessados.set(commentId, Date.now());

  console.log(`🎯 Match! @${username} comentou: "${text}"`);

  let dmEnviada = false;

  // 1. Envia direct via Private Reply
  if (ENVIAR_PRIVATE_REPLY) {
    try {
      await enviarPrivateReply(commentId, MENSAGEM_DM);
      dmEnviada = true;
      console.log(`✅ Private Reply enviada para @${username}`);
    } catch (error) {
      console.error(
        `❌ Erro ao enviar Private Reply para @${username}:`,
        error.message
      );
    }
  }

  // 2. Responde publicamente ao comentário
  if (RESPONDER_PUBLICO) {
    const mensagemPublica = dmEnviada
      ? `@${username} ${MENSAGEM_COMENTARIO}`
      : `@${username} ${MENSAGEM_COMENTARIO_ERRO}`;

    try {
      await responderComentario(commentId, mensagemPublica);
      console.log(`✅ Comentário público respondido para @${username}`);
    } catch (error) {
      console.error(
        `❌ Erro ao responder comentário de @${username}:`,
        error.message
      );
    }
  }
}

// ================= CHAMADAS À GRAPH API =================

async function responderComentario(commentId, mensagem) {
  if (!ACCESS_TOKEN) {
    throw new Error('ACCESS_TOKEN não configurado');
  }

  const url = `https://graph.instagram.com/${GRAPH_VERSION}/${commentId}/replies`;

  const params = new URLSearchParams();
  params.append('message', mensagem);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params
  });

  if (!response.ok) {
    throw new Error(`${response.status}: ${await response.text()}`);
  }

  return response.json();
}

async function enviarPrivateReply(commentId, mensagem) {
  if (!ACCESS_TOKEN) {
    throw new Error('ACCESS_TOKEN não configurado');
  }

  if (!PAGE_ID) {
    throw new Error('PAGE_ID não configurado');
  }

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${PAGE_ID}/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      recipient: {
        comment_id: commentId
      },
      message: {
        text: mensagem
      }
    })
  });

  if (!response.ok) {
    throw new Error(`${response.status}: ${await response.text()}`);
  }

  return response.json();
}

// ================= FUNÇÕES AUXILIARES =================

function assinaturaValida(req) {
  const signature = req.get('x-hub-signature-256');

  if (!signature || !APP_SECRET || !req.rawBody) {
    return false;
  }

  const expectedSignature =
    'sha256=' +
    crypto
      .createHmac('sha256', APP_SECRET)
      .update(req.rawBody)
      .digest('hex');

  const signatureBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

  if (signatureBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
}

function normalizar(texto = '') {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

function limparCacheProcessados() {
  const agora = Date.now();

  for (const [commentId, criadoEm] of comentariosProcessados.entries()) {
    if (agora - criadoEm > TEMPO_CACHE_MS) {
      comentariosProcessados.delete(commentId);
    }
  }
}

function validarVariaveis() {
  const variaveis = {
    VERIFY_TOKEN,
    APP_SECRET,
    ACCESS_TOKEN,
    IG_USER_ID,
    PAGE_ID,
    LINK_PLANILHA
  };

  for (const [nome, valor] of Object.entries(variaveis)) {
    if (!valor) {
      console.warn(`⚠️ Variável ausente no Railway: ${nome}`);
    }
  }
}

// ================= START =================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  validarVariaveis();

  console.log(`🚀 Servidor ouvindo na porta ${PORT}`);
  console.log(`🔑 Palavra-chave: ${PALAVRA_CHAVE}`);
  console.log(`👤 IG_USER_ID configurado: ${IG_USER_ID ? '✅' : '❌'}`);
  console.log(`📄 PAGE_ID configurado: ${PAGE_ID ? '✅' : '❌'}`);
  console.log(`🔐 ACCESS_TOKEN configurado: ${ACCESS_TOKEN ? '✅' : '❌'}`);
});
