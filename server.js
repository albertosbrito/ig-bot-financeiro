// server.js — Instagram Bot @albertobri7o
// Comentários + Direct com IA + Telegram
// Versão: direct-ia

import express from 'express';
import crypto from 'crypto';
import OpenAI from 'openai';

const app = express();

app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
}));

// ================= CONFIG =================

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const APP_SECRET = process.env.APP_SECRET;

const GRAPH_VERSION = process.env.GRAPH_VERSION || 'v25.0';

const IG_USER_ID = process.env.IG_USER_ID;
const PAGE_ID = process.env.PAGE_ID;
const IG_USERNAME = normalizar(process.env.IG_USERNAME || 'albertobri7o');

// ACCESS_TOKEN: usado para responder comentário publicamente.
// IG_ACCESS_TOKEN: usado para Private Reply e Direct.
const ACCESS_TOKEN = limparToken(process.env.ACCESS_TOKEN || process.env.IG_ACCESS_TOKEN);
const IG_ACCESS_TOKEN = limparToken(process.env.IG_ACCESS_TOKEN);
const PAGE_ACCESS_TOKEN = limparToken(process.env.PAGE_ACCESS_TOKEN);

const RESPONDER_PUBLICO = (process.env.RESPONDER_PUBLICO || 'true').toLowerCase() === 'true';
const ENVIAR_PRIVATE_REPLY = (process.env.ENVIAR_PRIVATE_REPLY || 'true').toLowerCase() === 'true';
const RESPONDER_DIRECT = (process.env.RESPONDER_DIRECT || 'true').toLowerCase() === 'true';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

const comentariosProcessados = new Map();
const mensagensProcessadas = new Map();
const TEMPO_CACHE_MS = Number(process.env.TEMPO_CACHE_MS || 1000 * 60 * 60 * 24);

// ================= ENTREGAS =================

const ENTREGAS = [
  {
    nome: 'Caderno',
    palavras: ['CADERNO'],
    link: process.env.LINK_CHECKOUT_CADERNO,
    comentario: 'te mandei o link no direct! 📩',
    tituloDm: 'material Caderno'
  },
  {
    nome: 'Word',
    palavras: ['WORD'],
    link: process.env.LINK_CHECKOUT_WORD,
    comentario: 'te mandei o link no direct! 📩',
    tituloDm: 'material de Word'
  },
  {
    nome: 'Excel',
    palavras: ['EXCEL'],
    link: process.env.LINK_CHECKOUT_EXCEL,
    comentario: 'te mandei o link no direct! 📩',
    tituloDm: 'material de Excel'
  },
  {
    nome: 'IA',
    palavras: ['IA', 'INTELIGENCIA ARTIFICIAL', 'INTELIGÊNCIA ARTIFICIAL'],
    link: process.env.LINK_CHECKOUT_IA,
    comentario: 'te mandei o link no direct! 📩',
    tituloDm: 'material de IA'
  },
  {
    nome: 'Automação',
    palavras: ['AUTOMACAO', 'AUTOMAÇÃO'],
    link: process.env.LINK_CHECKOUT_AUTOMACAO,
    comentario: 'te mandei o link no direct! 📩',
    tituloDm: 'material de automação'
  },
  {
    nome: 'Financeiro',
    palavras: ['FINANCEIRO', 'PLANILHA FINANCEIRA', 'PLANILHA DE FINANCAS', 'PLANILHA DE FINANÇAS'],
    link: process.env.LINK_DRIVE_FINANCEIRO,
    comentario: 'te mandei a planilha no direct! 📩',
    tituloDm: 'planilha de finanças pessoais'
  }
];

const PALAVRAS_HUMANO = [
  'FALAR COM VOCE', 'FALAR COM VOCÊ', 'QUERO FALAR', 'ME CHAMA', 'ME CHAME',
  'CHAMA NO DIRECT', 'CHAMA NO PRIVADO', 'ATENDIMENTO', 'SUPORTE',
  'CONSULTORIA', 'ORCAMENTO', 'ORÇAMENTO', 'ALBERTO', 'HUMANO'
];

const PALAVRAS_TREINAMENTO = [
  'TREINAMENTO', 'TREINAMENTOS', 'CURSO', 'CURSOS', 'AULA', 'AULAS',
  'MENTORIA', 'CAPACITACAO', 'CAPACITAÇÃO', 'EQUIPE', 'EMPRESA',
  'TURMA', 'WORKSHOP', 'APRENDER MAIS', 'SABER MAIS'
];

const PALAVRAS_PRECO = [
  'PRECO', 'PREÇO', 'VALOR', 'CUSTA', 'QUANTO', 'COMPRAR',
  'PAGAMENTO', 'LINK', 'CHECKOUT'
];

const PALAVRAS_CRITICA = [
  'ERRADO', 'NAO FUNCIONA', 'NÃO FUNCIONA', 'MENTIRA', 'FAKE', 'GOLPE',
  'RUIM', 'FRACO', 'NAO CONCORDO', 'NÃO CONCORDO', 'COMPLICADO',
  'CONFUSO', 'NAO ENTENDI', 'NÃO ENTENDI', 'EXPLICA MELHOR',
  'ISSO ESTA ERRADO', 'ISSO ESTÁ ERRADO', 'NAO E BEM ASSIM',
  'NÃO É BEM ASSIM', 'CONTEUDO RASO', 'CONTEÚDO RASO'
];

const PALAVRAS_OFENSA = [
  'IDIOTA', 'BURRO', 'PALHACO', 'PALHAÇO', 'LIXO',
  'MERDA', 'VAI TOMAR', 'OTARIO', 'OTÁRIO'
];

// ================= MENSAGENS =================

const MENSAGEM_COMENTARIO_ERRO =
  process.env.MENSAGEM_COMENTARIO_ERRO || 'me chama no direct que eu te envio 📩';

const MENSAGEM_HUMANO_DM =
  process.env.MENSAGEM_HUMANO_DM ||
`Claro! 👋

Sou o assistente do Alberto.

Vou avisar ele agora que você quer falar diretamente.
Enquanto isso, me diga aqui em uma mensagem rápida qual é sua dúvida.

— @albertobri7o`;

const MENSAGEM_HUMANO_COMENTARIO =
  process.env.MENSAGEM_HUMANO_COMENTARIO || 'te chamei no direct para entender melhor 📩';

const MENSAGEM_CRITICA_COMENTARIO =
  process.env.MENSAGEM_CRITICA_COMENTARIO || 'obrigado pelo toque. Vou olhar isso com atenção.';

const MENSAGEM_CRITICA_DM =
  process.env.MENSAGEM_CRITICA_DM ||
`Oi! 👋

Vi seu comentário e obrigado por falar.

Quero entender melhor seu ponto para melhorar o conteúdo.
Pode me explicar rapidamente o que você achou confuso ou errado?

— @albertobri7o`;

const MENSAGEM_TREINAMENTO =
  process.env.MENSAGEM_TREINAMENTO ||
`Legal! 👋

O Alberto trabalha com conteúdos e treinamentos práticos de Excel, Word, IA, automação e produtividade.

Para eu te direcionar melhor, me diga uma coisa:

Você quer treinamento para você, para sua equipe ou para sua empresa?

— @albertobri7o`;

const MENSAGEM_ESCOLHER_MATERIAL =
  process.env.MENSAGEM_ESCOLHER_MATERIAL ||
`Claro! 👋

Me diga qual material você quer receber:

1. CADERNO
2. WORD
3. EXCEL
4. IA
5. AUTOMAÇÃO
6. FINANCEIRO

É só responder com uma dessas palavras.

— @albertobri7o`;

// ================= ROTAS =================

app.get('/', (req, res) => {
  res.send('Bot do Instagram rodando ✅');
});

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

app.post('/webhook', async (req, res) => {
  if (!assinaturaValida(req)) {
    console.warn('⚠️ Assinatura inválida — ignorando evento');
    return res.sendStatus(403);
  }

  res.sendStatus(200);

  try {
    const body = req.body;

    if (!['instagram', 'page'].includes(body.object)) {
      console.log(`Evento ignorado: object=${body.object}`);
      return;
    }

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field === 'comments') {
          await processarComentario(change.value);
        }
      }

      for (const event of entry.messaging || []) {
        await processarMensagemDirect(event);
      }
    }
  } catch (error) {
    console.error('❌ Erro geral no webhook:', error.message);
  }
});

// ================= COMENTÁRIOS =================

async function processarComentario(comentario) {
  const commentId = comentario?.id;
  const text = comentario?.text;
  const username = comentario?.from?.username || 'seguidor';
  const fromId = comentario?.from?.id;

  if (!commentId || !text) {
    console.log('Comentário ignorado: sem id ou sem texto');
    return;
  }

  if (normalizar(username) === IG_USERNAME || String(fromId) === String(IG_USER_ID)) {
    console.log(`Comentário ignorado: feito pelo próprio perfil @${username}`);
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
  console.log(`🧩 commentId recebido: ${commentId}`);

  const entregasEncontradas = encontrarEntregas(textoNormalizado);

  if (entregasEncontradas.length > 0) {
    await fluxoEntregaComentario(commentId, username, text, entregasEncontradas);
    return;
  }

  if (querFalarComHumano(textoNormalizado)) {
    await fluxoHumanoComentario(commentId, username, text);
    return;
  }

  if (ehOfensa(textoNormalizado)) {
    await notificarAlberto(username, text, 'OFENSA / POSSÍVEL MODERAÇÃO');
    return;
  }

  if (ehCriticaOuObjecao(textoNormalizado)) {
    await fluxoCriticaComentario(commentId, username, text);
    return;
  }

  const classificacao = await classificarComIA(text, 'comentario');

  console.log('🤖 Classificação IA comentário:', classificacao);

  if (['DELICADO'].includes(classificacao.tipo)) {
    await notificarAlberto(username, text, 'COMENTÁRIO DELICADO / REVISAR');
    return;
  }

  if (['ENTREGA', 'INTERESSE'].includes(classificacao.tipo)) {
    await responderComentarioSeguro(
      commentId,
      `@${username} me diga qual material você quer: CADERNO, WORD, EXCEL, IA, AUTOMAÇÃO ou FINANCEIRO.`
    );
    await notificarAlberto(username, text, `INTERESSE SEM PALAVRA-CHAVE: ${classificacao.motivo || ''}`);
    return;
  }

  if (classificacao.tipo === 'TREINAMENTO') {
    await enviarPrivateReplySeguro(commentId, MENSAGEM_TREINAMENTO);
    await responderComentarioSeguro(commentId, `@${username} te chamei no direct para te explicar melhor 📩`);
    await notificarAlberto(username, text, 'LEAD DE TREINAMENTO NO COMENTÁRIO');
    return;
  }

  if (classificacao.tipo === 'HUMANO') {
    await fluxoHumanoComentario(commentId, username, text);
    return;
  }

  if (classificacao.tipo === 'CRITICA') {
    await fluxoCriticaComentario(commentId, username, text);
    return;
  }

  if (classificacao.tipo === 'DUVIDA') {
    await enviarPrivateReplySeguro(commentId, `Oi! 👋

Vi sua dúvida no comentário.

Me responde aqui com mais detalhes que eu tento te ajudar ou encaminho para o Alberto.

— @albertobri7o`);

    await responderComentarioSeguro(commentId, `@${username} te chamei no direct para entender melhor 📩`);
    await notificarAlberto(username, text, `DÚVIDA DETECTADA: ${classificacao.motivo || ''}`);
    return;
  }

  console.log(`Comentário sem ação automática: "${text}"`);
}

async function fluxoEntregaComentario(commentId, username, comentarioOriginal, entregas) {
  const entregasValidas = entregas.filter(e => e.link);

  if (entregasValidas.length === 0) {
    await notificarAlberto(username, comentarioOriginal, `LINK NÃO CONFIGURADO: ${entregas.map(e => e.nome).join(', ')}`);
    await responderComentarioSeguro(commentId, `@${username} ${MENSAGEM_COMENTARIO_ERRO}`);
    return;
  }

  let dmEnviada = false;

  if (ENVIAR_PRIVATE_REPLY) {
    try {
      await enviarPrivateReply(commentId, montarMensagemEntrega(entregasValidas));
      dmEnviada = true;
      console.log(`✅ Entrega enviada para @${username}: ${entregasValidas.map(e => e.nome).join(', ')}`);
    } catch (error) {
      console.error(`❌ Erro ao enviar entrega para @${username}:`, error.message);
      await notificarAlberto(username, comentarioOriginal, `ERRO AO ENVIAR ENTREGA: ${error.message}`);
    }
  }

  if (RESPONDER_PUBLICO) {
    await responderComentarioSeguro(
      commentId,
      dmEnviada
        ? `@${username} ${mensagemComentarioEntrega(entregasValidas)}`
        : `@${username} ${MENSAGEM_COMENTARIO_ERRO}`
    );
  }
}

async function fluxoHumanoComentario(commentId, username, comentarioOriginal) {
  let dmEnviada = false;

  try {
    await enviarPrivateReply(commentId, MENSAGEM_HUMANO_DM);
    dmEnviada = true;
  } catch (error) {
    console.error('Erro ao enviar DM humana:', error.message);
  }

  await notificarAlberto(username, comentarioOriginal, 'PEDIDO PARA FALAR COM ALBERTO');

  if (RESPONDER_PUBLICO) {
    await responderComentarioSeguro(
      commentId,
      dmEnviada
        ? `@${username} ${MENSAGEM_HUMANO_COMENTARIO}`
        : `@${username} me chama no direct que eu te respondo 📩`
    );
  }
}

async function fluxoCriticaComentario(commentId, username, comentarioOriginal) {
  await notificarAlberto(username, comentarioOriginal, 'CRÍTICA / OBJEÇÃO');

  try {
    await enviarPrivateReply(commentId, MENSAGEM_CRITICA_DM);
  } catch (error) {
    console.error('Erro ao enviar DM crítica:', error.message);
  }

  if (RESPONDER_PUBLICO) {
    await responderComentarioSeguro(commentId, `@${username} ${MENSAGEM_CRITICA_COMENTARIO}`);
  }
}

// ================= DIRECT =================

async function processarMensagemDirect(event) {
  if (!RESPONDER_DIRECT) {
    console.log('Direct ignorado: RESPONDER_DIRECT=false');
    return;
  }

  const senderId = event?.sender?.id;
  const message = event?.message;
  const text = message?.text;
  const mid = message?.mid;

  if (!senderId || !message) {
    return;
  }

  if (message?.is_echo || String(senderId) === String(IG_USER_ID)) {
    console.log('Direct ignorado: echo/próprio bot');
    return;
  }

  if (!text) {
    console.log('Direct recebido sem texto. Ignorando por enquanto.');
    return;
  }

  limparCacheProcessados();

  if (mid && mensagensProcessadas.has(mid)) {
    console.log(`Direct já processado: ${mid}`);
    return;
  }

  if (mid) {
    mensagensProcessadas.set(mid, Date.now());
  }

  const textoNormalizado = normalizar(text);
  const usuarioDirect = `ig_user_${senderId}`;

  console.log(`📩 DM recebida de ${senderId}: "${text}"`);

  const entregasEncontradas = encontrarEntregas(textoNormalizado);

  if (entregasEncontradas.length > 0) {
    const entregasValidas = entregasEncontradas.filter(e => e.link);

    if (entregasValidas.length === 0) {
      await enviarMensagemDirect(senderId, MENSAGEM_ESCOLHER_MATERIAL);
      await notificarAlberto(usuarioDirect, text, 'DM COM PALAVRA-CHAVE SEM LINK CONFIGURADO');
      return;
    }

    await enviarMensagemDirect(senderId, montarMensagemEntrega(entregasValidas));
    await notificarAlberto(usuarioDirect, text, `DM: ENTREGA ENVIADA (${entregasValidas.map(e => e.nome).join(', ')})`);
    return;
  }

  if (ehTreinamento(textoNormalizado)) {
    await enviarMensagemDirect(senderId, MENSAGEM_TREINAMENTO);
    await notificarAlberto(usuarioDirect, text, 'LEAD DE TREINAMENTO NO DIRECT');
    return;
  }

  if (ehPrecoOuCompra(textoNormalizado)) {
    await enviarMensagemDirect(senderId, MENSAGEM_ESCOLHER_MATERIAL);
    await notificarAlberto(usuarioDirect, text, 'DM: INTERESSE EM PREÇO/COMPRA SEM MATERIAL DEFINIDO');
    return;
  }

  if (querFalarComHumano(textoNormalizado)) {
    await enviarMensagemDirect(senderId, MENSAGEM_HUMANO_DM);
    await notificarAlberto(usuarioDirect, text, 'DM: PEDIDO PARA FALAR COM ALBERTO');
    return;
  }

  if (ehOfensa(textoNormalizado)) {
    await notificarAlberto(usuarioDirect, text, 'DM: OFENSA / POSSÍVEL MODERAÇÃO');
    return;
  }

  if (ehCriticaOuObjecao(textoNormalizado)) {
    await enviarMensagemDirect(senderId, MENSAGEM_CRITICA_DM);
    await notificarAlberto(usuarioDirect, text, 'DM: CRÍTICA / OBJEÇÃO');
    return;
  }

  const classificacao = await classificarComIA(text, 'direct');

  console.log('🤖 Classificação IA direct:', classificacao);

  if (classificacao.tipo === 'TREINAMENTO') {
    await enviarMensagemDirect(senderId, MENSAGEM_TREINAMENTO);
    await notificarAlberto(usuarioDirect, text, `DM: LEAD TREINAMENTO IA — ${classificacao.motivo || ''}`);
    return;
  }

  if (['HUMANO', 'DELICADO'].includes(classificacao.tipo)) {
    await enviarMensagemDirect(senderId, MENSAGEM_HUMANO_DM);
    await notificarAlberto(usuarioDirect, text, `DM: ${classificacao.tipo} — ${classificacao.motivo || ''}`);
    return;
  }

  if (['ENTREGA', 'INTERESSE'].includes(classificacao.tipo)) {
    await enviarMensagemDirect(senderId, MENSAGEM_ESCOLHER_MATERIAL);
    await notificarAlberto(usuarioDirect, text, `DM: INTERESSE IA — ${classificacao.motivo || ''}`);
    return;
  }

  if (classificacao.tipo === 'DUVIDA') {
    await enviarMensagemDirect(senderId, `Entendi sua dúvida. 👋

Me diga qual assunto você quer aprofundar:

1. Excel
2. Word
3. IA
4. Automação
5. Treinamento para equipe

Se preferir, escreva "falar com Alberto".

— @albertobri7o`);

    await notificarAlberto(usuarioDirect, text, `DM: DÚVIDA IA — ${classificacao.motivo || ''}`);
    return;
  }

  if (classificacao.tipo === 'CRITICA') {
    await enviarMensagemDirect(senderId, MENSAGEM_CRITICA_DM);
    await notificarAlberto(usuarioDirect, text, `DM: CRÍTICA IA — ${classificacao.motivo || ''}`);
    return;
  }

  if (classificacao.tipo === 'OFENSA') {
    await notificarAlberto(usuarioDirect, text, `DM: OFENSA IA — ${classificacao.motivo || ''}`);
    return;
  }

  await enviarMensagemDirect(senderId, `Entendi. 👋

Para eu te ajudar melhor, me diga uma palavra:

WORD, EXCEL, IA, AUTOMAÇÃO, FINANCEIRO ou TREINAMENTO.

— @albertobri7o`);
}

// ================= META API =================

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

async function enviarPrivateReplySeguro(commentId, mensagem) {
  try {
    await enviarPrivateReply(commentId, mensagem);
    return true;
  } catch (error) {
    console.error('❌ Erro ao enviar Private Reply:', error.message);
    return false;
  }
}

async function enviarPrivateReply(commentId, mensagem) {
  if (!IG_ACCESS_TOKEN) {
    throw new Error('IG_ACCESS_TOKEN não configurado');
  }

  if (!IG_USER_ID) {
    throw new Error('IG_USER_ID não configurado');
  }

  const url = `https://graph.instagram.com/${GRAPH_VERSION}/${IG_USER_ID}/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${IG_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      recipient: {
        comment_id: String(commentId)
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

async function enviarMensagemDirect(recipientId, mensagem) {
  if (!IG_ACCESS_TOKEN) {
    throw new Error('IG_ACCESS_TOKEN não configurado');
  }

  if (!IG_USER_ID) {
    throw new Error('IG_USER_ID não configurado');
  }

  const url = `https://graph.instagram.com/${GRAPH_VERSION}/${IG_USER_ID}/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${IG_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      recipient: {
        id: String(recipientId)
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

async function classificarComIA(texto, origem = 'comentario') {
  if (!openai) {
    return {
      tipo: 'IGNORAR',
      motivo: 'OPENAI_API_KEY não configurada',
      confianca: 0
    };
  }

  try {
    const prompt = `
Você é a camada de interpretação de um bot do Instagram do perfil @albertobri7o.

O perfil vende/entrega conteúdos sobre Word, Excel, IA, automação, planilha financeira,
produtividade, tecnologia aplicada ao trabalho e treinamentos para pessoas/equipes/empresas.

Origem da mensagem: ${origem}

Mensagem do usuário:
"${texto}"

Classifique APENAS em JSON válido:
{
  "tipo": "ENTREGA|HUMANO|CRITICA|OFENSA|DUVIDA|INTERESSE|TREINAMENTO|ELOGIO|SPAM|DELICADO|IGNORAR",
  "motivo": "explicação curta",
  "confianca": 0.0
}

Regras:
- TREINAMENTO: quer saber sobre treinamentos, cursos, aulas, mentoria, capacitação, equipe, empresa ou aprender com Alberto.
- ENTREGA: quer claramente algum material/link, mas não usou palavra-chave exata.
- HUMANO: quer falar com Alberto, suporte, orçamento, consultoria ou atendimento.
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

// ================= TELEGRAM =================

async function notificarAlberto(username, mensagemRecebida, tipo) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn(`Telegram não configurado. Notificação não enviada: ${tipo}`);
    return;
  }

  const perfil = String(username).startsWith('ig_user_')
    ? 'Usuário do Direct'
    : `https://instagram.com/${username}`;

  const mensagem = `🔔 Instagram Bot — ${tipo}

Usuário: @${username}

Mensagem:
${mensagemRecebida}

Perfil:
${perfil}`;

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

// ================= HELPERS =================

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

function ehTreinamento(textoNormalizado) {
  return PALAVRAS_TREINAMENTO.some(palavra =>
    contemPalavraOuFrase(textoNormalizado, normalizar(palavra))
  );
}

function ehPrecoOuCompra(textoNormalizado) {
  return PALAVRAS_PRECO.some(palavra =>
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

function limparToken(valor = '') {
  return String(valor)
    .trim()
    .replace(/^Bearer\s+/i, '')
    .replace(/^["']|["']$/g, '')
    .replace(/\s/g, '');
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

  for (const [mid, criadoEm] of mensagensProcessadas.entries()) {
    if (agora - criadoEm > TEMPO_CACHE_MS) {
      mensagensProcessadas.delete(mid);
    }
  }
}

function mascararToken(token = '') {
  if (!token) return 'VAZIO';

  return `${token.slice(0, 4)}...${token.slice(-4)} (${token.length} chars)`;
}

function validarVariaveis() {
  const variaveis = {
    VERIFY_TOKEN,
    APP_SECRET,
    ACCESS_TOKEN,
    IG_ACCESS_TOKEN,
    IG_USER_ID
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

  console.log(`🔐 ACCESS_TOKEN: ${mascararToken(ACCESS_TOKEN)}`);
  console.log(`🔐 PAGE_ACCESS_TOKEN: ${mascararToken(PAGE_ACCESS_TOKEN)}`);
  console.log(`🔐 IG_ACCESS_TOKEN: ${mascararToken(IG_ACCESS_TOKEN)}`);

  console.log(`💬 RESPONDER_DIRECT: ${RESPONDER_DIRECT ? '✅' : '❌'}`);
  console.log(`🤖 IA configurada: ${OPENAI_API_KEY ? '✅' : '❌'}`);
});
