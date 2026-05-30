// server.js — Webhook Instagram com múltiplas entregas + IA + alerta humano
// Autor: @albertobri7o

import express from 'express';
import crypto from 'crypto';
import OpenAI from 'openai';

const app = express();

app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// ================= CONFIGURAÇÕES =================

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const APP_SECRET = process.env.APP_SECRET;

const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN || ACCESS_TOKEN;

const IG_USER_ID = process.env.IG_USER_ID;
const PAGE_ID = process.env.PAGE_ID;

const GRAPH_VERSION = process.env.GRAPH_VERSION || 'v21.0';

const RESPONDER_PUBLICO =
  (process.env.RESPONDER_PUBLICO || 'true').toLowerCase() === 'true';

const ENVIAR_PRIVATE_REPLY =
  (process.env.ENVIAR_PRIVATE_REPLY || 'true').toLowerCase() === 'true';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

const openai = OPENAI_API_KEY
  ? new OpenAI({ apiKey: OPENAI_API_KEY })
  : null;

// Cache simples para evitar processar comentário duplicado.
// Em produção com escala maior, o ideal é Redis/Postgres.
const comentariosProcessados = new Map();

const TEMPO_CACHE_MS = Number(
  process.env.TEMPO_CACHE_MS || 1000 * 60 * 60 * 24
);

// ================= ENTREGAS FIXAS =================

const ENTREGAS = [
  {
    nome: 'Caderno',
    palavras: ['CADERNO'],
    link: process.env.LINK_CHECKOUT_CADERNO,
    tipo: 'checkout',
    comentario: 'te mandei o link no direct! 📩',
    tituloDm: 'material Caderno'
  },
  {
    nome: 'Word',
    palavras: ['WORD'],
    link: process.env.LINK_CHECKOUT_WORD,
    tipo: 'checkout',
    comentario: 'te mandei o link no direct! 📩',
    tituloDm: 'material de Word'
  },
  {
    nome: 'Excel',
    palavras: ['EXCEL'],
    link: process.env.LINK_CHECKOUT_EXCEL,
    tipo: 'checkout',
    comentario: 'te mandei o link no direct! 📩',
    tituloDm: 'material de Excel'
  },
  {
    nome: 'IA',
    palavras: ['IA', 'INTELIGENCIA ARTIFICIAL', 'INTELIGÊNCIA ARTIFICIAL'],
    link: process.env.LINK_CHECKOUT_IA,
    tipo: 'checkout',
    comentario: 'te mandei o link no direct! 📩',
    tituloDm: 'material de IA'
  },
  {
    nome: 'Automação',
    palavras: ['AUTOMACAO', 'AUTOMAÇÃO'],
    link: process.env.LINK_CHECKOUT_AUTOMACAO,
    tipo: 'checkout',
    comentario: 'te mandei o link no direct! 📩',
    tituloDm: 'material de automação'
  },
  {
    nome: 'Financeiro',
    palavras: ['FINANCEIRO', 'PLANILHA FINANCEIRA', 'PLANILHA DE FINANCAS', 'PLANILHA DE FINANÇAS'],
    link: process.env.LINK_DRIVE_FINANCEIRO,
    tipo: 'drive',
    comentario: 'te mandei a planilha no direct! 📩',
    tituloDm: 'planilha de finanças pessoais'
  }
];

// ================= INTENÇÕES HUMANAS =================

const PALAVRAS_HUMANO = [
  'FALAR COM VOCE',
  'FALAR COM VOCÊ',
  'QUERO FALAR',
  'ME CHAMA',
  'ME CHAME',
  'CHAMA NO DIRECT',
  'CHAMA NO PRIVADO',
  'ATENDIMENTO',
  'SUPORTE',
  'CONSULTORIA',
  'ORCAMENTO',
  'ORÇAMENTO',
  'ALBERTO',
  'HUMANO',
  'DUVIDA',
  'DÚVIDA'
];

const MENSAGEM_HUMANO_DM =
  process.env.MENSAGEM_HUMANO_DM ||
  `Claro! 👋

Sou o assistente do Alberto.

Vou avisar ele agora que você quer falar diretamente.
Enquanto isso, me diga aqui em uma mensagem rápida qual é sua dúvida.

— @albertobri7o`;

const MENSAGEM_HUMANO_COMENTARIO =
  process.env.MENSAGEM_HUMANO_COMENTARIO ||
  'te chamei no direct para entender melhor 📩';

// ================= CRÍTICA / OFENSA =================

const PALAVRAS_CRITICA = [
  'ERRADO',
  'NAO FUNCIONA',
  'NÃO FUNCIONA',
  'MENTIRA',
  'FAKE',
  'GOLPE',
  'RUIM',
  'FRACO',
  'NAO CONCORDO',
  'NÃO CONCORDO',
  'COMPLICADO',
  'CONFUSO',
  'NAO ENTENDI',
  'NÃO ENTENDI',
  'EXPLICA MELHOR',
  'ISSO ESTA ERRADO',
  'ISSO ESTÁ ERRADO',
  'NAO E BEM ASSIM',
  'NÃO É BEM ASSIM',
  'CONTEUDO RASO',
  'CONTEÚDO RASO'
];

const PALAVRAS_OFENSA = [
  'IDIOTA',
  'BURRO',
  'PALHACO',
  'PALHAÇO',
  'LIXO',
  'MERDA',
  'VAI TOMAR',
  'OTARIO',
  'OTÁRIO'
];

const MENSAGEM_CRITICA_COMENTARIO =
  process.env.MENSAGEM_CRITICA_COMENTARIO ||
  'obrigado pelo toque. Vou olhar isso com atenção.';

const MENSAGEM_CRITICA_DM =
  process.env.MENSAGEM_CRITICA_DM ||
  `Oi! 👋

Vi seu comentário e obrigado por falar.

Quero entender melhor seu ponto para melhorar o conteúdo.
Pode me explicar rapidamente o que você achou confuso ou errado?

— @albertobri7o`;

const MENSAGEM_COMENTARIO_ERRO =
  process.env.MENSAGEM_COMENTARIO_ERRO ||
  'me chama no direct que eu te envio 📩';

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

// ================= RECEBE EVENTOS =================

app.post('/webhook', async (req, res) => {
  if (!assinaturaValida(req)) {
    console.warn('⚠️ Assinatura inválida — ignorando evento');
    return res.sendStatus(403);
  }

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

  comentariosProcessados.set(commentId, Date.now());

  const textoNormalizado = normalizar(text);

  console.log(`💬 Comentário recebido de @${username}: "${text}"`);

  // 1. Primeiro: regras fixas de entrega
  const entregasEncontradas = encontrarEntregas(textoNormalizado);

  if (entregasEncontradas.length > 0) {
    await fluxoEntrega(commentId, username, text, entregasEncontradas);
    return;
  }

  // 2. Segundo: detectar pedido humano
  if (querFalarComHumano(textoNormalizado)) {
    await fluxoHumano(commentId, username, text);
    return;
  }

  // 3. Terceiro: detectar crítica/ofensa
  if (ehOfensa(textoNormalizado)) {
    await fluxoOfensa(commentId, username, text);
    return;
  }

  if (ehCriticaOuObjecao(textoNormalizado)) {
    await fluxoCritica(commentId, username, text);
    return;
  }

  // 4. Quarto: IA classifica o que sobrou
  const classificacao = await classificarComIA(text);

  console.log('🤖 Classificação IA:', classificacao);

  // 5. Se for delicado, notifica Alberto e não responde demais
  if (classificacao.tipo === 'DELICADO') {
    await notificarAlberto(username, text, 'DELICADO / REVISAR');
    return;
  }

  if (classificacao.tipo === 'CRITICA') {
    await fluxoCritica(commentId, username, text);
    return;
  }

  if (classificacao.tipo === 'OFENSA') {
    await fluxoOfensa(commentId, username, text);
    return;
  }

  if (classificacao.tipo === 'HUMANO') {
    await fluxoHumano(commentId, username, text);
    return;
  }

  if (classificacao.tipo === 'DUVIDA') {
    await fluxoDuvida(commentId, username, text, classificacao);
    return;
  }

  if (classificacao.tipo === 'INTERESSE') {
    await fluxoInteresse(commentId, username, text, classificacao);
    return;
  }

  console.log(`Comentário sem ação automática: "${text}"`);
}

// ================= FLUXOS =================

async function fluxoEntrega(commentId, username, comentarioOriginal, entregas) {
  const entregasValidas = entregas.filter(e => e.link);

  if (entregasValidas.length === 0) {
    console.error(
      `❌ Nenhum link configurado para: ${entregas.map(e => e.nome).join(', ')}`
    );

    await notificarAlberto(
      username,
      comentarioOriginal,
      `LINK NÃO CONFIGURADO: ${entregas.map(e => e.nome).join(', ')}`
    );

    if (RESPONDER_PUBLICO) {
      await responderComentarioSeguro(
        commentId,
        `@${username} ${MENSAGEM_COMENTARIO_ERRO}`
      );
    }

    return;
  }

  let dmEnviada = false;

  const mensagemDm = montarMensagemEntrega(entregasValidas);

  if (ENVIAR_PRIVATE_REPLY) {
    try {
      await enviarPrivateReply(commentId, mensagemDm);
      dmEnviada = true;
      console.log(`✅ Entrega enviada para @${username}: ${entregasValidas.map(e => e.nome).join(', ')}`);
    } catch (error) {
      console.error(`❌ Erro ao enviar entrega para @${username}:`, error.message);
      await notificarAlberto(username, comentarioOriginal, `ERRO AO ENVIAR ENTREGA: ${error.message}`);
    }
  }

  if (RESPONDER_PUBLICO) {
    const mensagemPublica = dmEnviada
      ? `@${username} ${mensagemComentarioEntrega(entregasValidas)}`
      : `@${username} ${MENSAGEM_COMENTARIO_ERRO}`;

    await responderComentarioSeguro(commentId, mensagemPublica);
  }
}

async function fluxoHumano(commentId, username, comentarioOriginal) {
  console.log(`🙋 Pedido humano detectado: @${username}`);

  let dmEnviada = false;

  if (ENVIAR_PRIVATE_REPLY) {
    try {
      await enviarPrivateReply(commentId, MENSAGEM_HUMANO_DM);
      dmEnviada = true;
    } catch (error) {
      console.error('Erro ao enviar DM humana:', error.message);
    }
  }

  await notificarAlberto(username, comentarioOriginal, 'PEDIDO PARA FALAR COM ALBERTO');

  if (RESPONDER_PUBLICO) {
    const mensagemPublica = dmEnviada
      ? `@${username} ${MENSAGEM_HUMANO_COMENTARIO}`
      : `@${username} me chama no direct que eu te respondo 📩`;

    await responderComentarioSeguro(commentId, mensagemPublica);
  }
}

async function fluxoCritica(commentId, username, comentarioOriginal) {
  console.log(`⚠️ Crítica/objeção detectada: @${username}`);

  await notificarAlberto(username, comentarioOriginal, 'CRÍTICA / OBJEÇÃO');

  if (ENVIAR_PRIVATE_REPLY) {
    try {
      await enviarPrivateReply(commentId, MENSAGEM_CRITICA_DM);
    } catch (error) {
      console.error('Erro ao enviar DM crítica:', error.message);
    }
  }

  if (RESPONDER_PUBLICO) {
    await responderComentarioSeguro(
      commentId,
      `@${username} ${MENSAGEM_CRITICA_COMENTARIO}`
    );
  }
}

async function fluxoOfensa(commentId, username, comentarioOriginal) {
  console.log(`🚫 Ofensa detectada: @${username}`);

  await notificarAlberto(username, comentarioOriginal, 'OFENSA / POSSÍVEL MODERAÇÃO');

  // Para ofensa, não responde publicamente.
  // Evita alimentar discussão.
}

async function fluxoDuvida(commentId, username, comentarioOriginal, classificacao) {
  console.log(`❓ Dúvida detectada: @${username}`);

  const mensagem = `Oi! 👋

Vi sua dúvida no comentário.

Me responde aqui com mais detalhes que eu tento te ajudar ou encaminho para o Alberto.

— @albertobri7o`;

  if (ENVIAR_PRIVATE_REPLY) {
    try {
      await enviarPrivateReply(commentId, mensagem);
    } catch (error) {
      console.error('Erro ao enviar DM dúvida:', error.message);
    }
  }

  await notificarAlberto(
    username,
    comentarioOriginal,
    `DÚVIDA DETECTADA: ${classificacao?.motivo || 'sem motivo informado'}`
  );

  if (RESPONDER_PUBLICO) {
    await responderComentarioSeguro(
      commentId,
      `@${username} te chamei no direct para entender melhor 📩`
    );
  }
}

async function fluxoInteresse(commentId, username, comentarioOriginal, classificacao) {
  console.log(`👀 Interesse detectado: @${username}`);

  await notificarAlberto(
    username,
    comentarioOriginal,
    `INTERESSE SEM PALAVRA-CHAVE: ${classificacao?.motivo || 'sem motivo informado'}`
  );

  if (RESPONDER_PUBLICO) {
    await responderComentarioSeguro(
      commentId,
      `@${username} me diga qual material você quer: CADERNO, WORD, EXCEL, IA, AUTOMAÇÃO ou FINANCEIRO.`
    );
  }
}

// ================= API META =================

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

async function responderComentarioSeguro(commentId, mensagem) {
  try {
    await responderComentario(commentId, mensagem);
    console.log('✅ Comentário público respondido');
  } catch (error) {
    console.error('❌ Erro ao responder comentário:', error.message);
  }
}

async function enviarPrivateReply(commentId, mensagem) {
  if (!PAGE_ACCESS_TOKEN) {
    throw new Error('PAGE_ACCESS_TOKEN não configurado');
  }

  if (!PAGE_ID) {
    throw new Error('PAGE_ID não configurado');
  }

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${PAGE_ID}/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PAGE_ACCESS_TOKEN}`,
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

// ================= IA =================

async function classificarComIA(texto) {
  if (!openai) {
    return {
      tipo: 'IGNORAR',
      motivo: 'OPENAI_API_KEY não configurada',
      confianca: 0
    };
  }

  try {
    const prompt = `
Classifique o comentário abaixo para um perfil brasileiro de conteúdo sobre tecnologia, Excel, Word, IA, automação, produtividade e planilhas.

Comentário:
"${texto}"

Responda APENAS em JSON válido, neste formato:
{
  "tipo": "ENTREGA|HUMANO|CRITICA|OFENSA|DUVIDA|INTERESSE|ELOGIO|SPAM|DELICADO|IGNORAR",
  "motivo": "explicação curta",
  "confianca": 0.0
}

Regras:
- ENTREGA: quando a pessoa quer claramente um material, mas não usou palavra-chave exata.
- HUMANO: quando quer falar com Alberto, suporte, orçamento, consultoria ou atendimento.
- CRITICA: crítica, objeção ou discordância educada.
- OFENSA: ataque pessoal, xingamento ou agressividade.
- DUVIDA: pergunta real sobre o conteúdo.
- INTERESSE: demonstra interesse, mas sem dizer exatamente o que quer.
- ELOGIO: elogio simples.
- SPAM: propaganda ou comentário sem relação.
- DELICADO: acusação, risco de imagem, tema sensível ou algo que precisa de Alberto.
- IGNORAR: comentário neutro sem necessidade de ação.
`;

    const response = await openai.responses.create({
      model: OPENAI_MODEL,
      input: prompt,
      temperature: 0
    });

    const output = response.output_text || '';

    const json = extrairJson(output);

    if (!json?.tipo) {
      return {
        tipo: 'IGNORAR',
        motivo: 'IA não retornou JSON válido',
        confianca: 0
      };
    }

    return {
      tipo: String(json.tipo || 'IGNORAR').toUpperCase(),
      motivo: String(json.motivo || ''),
      confianca: Number(json.confianca || 0)
    };
  } catch (error) {
    console.error('Erro na classificação IA:', error.message);

    return {
      tipo: 'IGNORAR',
      motivo: `Erro IA: ${error.message}`,
      confianca: 0
    };
  }
}

function extrairJson(texto) {
  try {
    return JSON.parse(texto);
  } catch {
    const match = texto.match(/\{[\s\S]*\}/);
    if (!match) return null;

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

// ================= TELEGRAM / NOTIFICAÇÃO =================

async function notificarAlberto(username, comentario, tipo) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn(`Telegram não configurado. Notificação não enviada: ${tipo}`);
    return;
  }

  const mensagem = `🔔 Instagram Bot — ${tipo}

Usuário: @${username}

Comentário:
${comentario}

Perfil:
https://instagram.com/${username}`;

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: mensagem
      })
    });

    if (!response.ok) {
      throw new Error(`${response.status}: ${await response.text()}`);
    }

    console.log('✅ Alberto notificado no Telegram');
  } catch (error) {
    console.error('❌ Erro ao notificar Alberto:', error.message);
  }
}

// ================= BUSCA DE INTENÇÕES =================

function encontrarEntregas(textoNormalizado) {
  const encontradas = [];

  for (const entrega of ENTREGAS) {
    const bateu = entrega.palavras.some(palavra =>
      contemPalavraOuFrase(textoNormalizado, normalizar(palavra))
    );

    if (bateu) {
      encontradas.push(entrega);
    }
  }

  return encontradas;
}

function querFalarComHumano(textoNormalizado) {
  return PALAVRAS_HUMANO.some(palavra =>
    contemPalavraOuFrase(textoNormalizado, normalizar(palavra))
  );
}

function ehCriticaOuObjecao(textoNormalizado) {
  return PALAVRAS_CRITICA.some(palavra =>
    textoNormalizado.includes(normalizar(palavra))
  );
}

function ehOfensa(textoNormalizado) {
  return PALAVRAS_OFENSA.some(palavra =>
    textoNormalizado.includes(normalizar(palavra))
  );
}

function contemPalavraOuFrase(texto, termo) {
  const termoEscapado = termo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const regex = new RegExp(
    `(^|[^A-Z0-9])${termoEscapado}($|[^A-Z0-9])`,
    'i'
  );

  return regex.test(texto);
}

// ================= MENSAGENS =================

function montarMensagemEntrega(entregas) {
  if (entregas.length === 1) {
    const entrega = entregas[0];

    return `Oi! 👋

Aqui está o link do ${entrega.tituloDm}:

${entrega.link}

Qualquer dúvida, é só responder este chat.

— @albertobri7o`;
  }

  const lista = entregas
    .map(entrega => `• ${entrega.nome}: ${entrega.link}`)
    .join('\n');

  return `Oi! 👋

Vi que você pediu mais de um material.

Aqui estão os links:

${lista}

Qualquer dúvida, é só responder este chat.

— @albertobri7o`;
}

function mensagemComentarioEntrega(entregas) {
  if (entregas.length === 1) {
    return entregas[0].comentario;
  }

  return 'te mandei os links no direct! 📩';
}

// ================= SEGURANÇA / UTIL =================

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
  return String(texto)
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
    PAGE_ACCESS_TOKEN,
    IG_USER_ID,
    PAGE_ID
  };

  for (const [nome, valor] of Object.entries(variaveis)) {
    if (!valor) {
      console.warn(`⚠️ Variável ausente no Railway: ${nome}`);
    }
  }

  for (const entrega of ENTREGAS) {
    if (!entrega.link) {
      console.warn(`⚠️ Link ausente para entrega: ${entrega.nome}`);
    }
  }

  if (!OPENAI_API_KEY) {
    console.warn('⚠️ OPENAI_API_KEY ausente. Classificação por IA ficará desativada.');
  }

  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
    console.warn('⚠️ Telegram não configurado. Alberto não será notificado.');
  }
}

// ================= START =================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  validarVariaveis();

  console.log(`🚀 Servidor ouvindo na porta ${PORT}`);
  console.log(`👤 IG_USER_ID configurado: ${IG_USER_ID ? '✅' : '❌'}`);
  console.log(`📄 PAGE_ID configurado: ${PAGE_ID ? '✅' : '❌'}`);
  console.log(`🔐 ACCESS_TOKEN configurado: ${ACCESS_TOKEN ? '✅' : '❌'}`);
  console.log(`🔐 PAGE_ACCESS_TOKEN configurado: ${PAGE_ACCESS_TOKEN ? '✅' : '❌'}`);
  console.log(`🤖 IA configurada: ${OPENAI_API_KEY ? '✅' : '❌'}`);
});