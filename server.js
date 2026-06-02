// server.js — Instagram Bot com comentários + Direct + IA + estado de conversa
// Autor: @albertobri7o
//
// Nesta versão:
// - Palavras-chave e entregas vêm de ENTREGAS_JSON no Railway.
// - O Direct tem estado simples de conversa.
// - Se a pessoa responde "treinamento" e depois "empresa", o bot NÃO repete a pergunta.
// - Ele avança para: tipo do treinamento -> assunto -> dados para contato.

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

const GRAPH_VERSION = process.env.GRAPH_VERSION || 'v25.0';

const IG_USER_ID = process.env.IG_USER_ID;
const IG_USERNAME = normalizar(process.env.IG_USERNAME || '');

const ACCESS_TOKEN = limparToken(process.env.ACCESS_TOKEN || process.env.IG_ACCESS_TOKEN);
const IG_ACCESS_TOKEN = limparToken(process.env.IG_ACCESS_TOKEN);
const PAGE_ACCESS_TOKEN = limparToken(process.env.PAGE_ACCESS_TOKEN);
const PAGE_ID = process.env.PAGE_ID;

const RESPONDER_PUBLICO = boolEnv('RESPONDER_PUBLICO', true);
const ENVIAR_PRIVATE_REPLY = boolEnv('ENVIAR_PRIVATE_REPLY', true);
const RESPONDER_DIRECT = boolEnv('RESPONDER_DIRECT', true);

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

const openai = OPENAI_API_KEY
  ? new OpenAI({ apiKey: OPENAI_API_KEY })
  : null;

// ================= VARIÁVEIS DE NEGÓCIO =================

const ENTREGAS = carregarEntregas();

const PALAVRAS_HUMANO = csvEnv('PALAVRAS_HUMANO', [
  'FALAR COM VOCÊ',
  'FALAR COM VOCE',
  'QUERO FALAR',
  'ME CHAMA',
  'ME CHAME',
  'ATENDIMENTO',
  'SUPORTE',
  'CONSULTORIA',
  'ORÇAMENTO',
  'ORCAMENTO',
  'ALBERTO',
  'HUMANO',
  'DÚVIDA',
  'DUVIDA'
]);

const PALAVRAS_TREINAMENTO = csvEnv('PALAVRAS_TREINAMENTO', [
  'TREINAMENTO',
  'TREINAMENTOS',
  'CURSO',
  'AULA',
  'AULAS',
  'MENTORIA',
  'CAPACITAÇÃO',
  'CAPACITACAO',
  'EQUIPE',
  'EMPRESA',
  'TURMA',
  'WORKSHOP',
  'APRENDER MAIS',
  'SABER MAIS'
]);

const PALAVRAS_PRECO = csvEnv('PALAVRAS_PRECO', [
  'PREÇO',
  'PRECO',
  'VALOR',
  'CUSTA',
  'QUANTO',
  'COMPRAR',
  'PAGAMENTO',
  'LINK',
  'CHECKOUT'
]);

const PALAVRAS_CRITICA = csvEnv('PALAVRAS_CRITICA', [
  'ERRADO',
  'NÃO FUNCIONA',
  'NAO FUNCIONA',
  'MENTIRA',
  'FAKE',
  'GOLPE',
  'RUIM',
  'FRACO',
  'NÃO CONCORDO',
  'NAO CONCORDO',
  'COMPLICADO',
  'CONFUSO',
  'NÃO ENTENDI',
  'NAO ENTENDI',
  'EXPLICA MELHOR'
]);

const PALAVRAS_OFENSA = csvEnv('PALAVRAS_OFENSA', [
  'IDIOTA',
  'BURRO',
  'PALHAÇO',
  'PALHACO',
  'LIXO',
  'MERDA',
  'VAI TOMAR',
  'OTÁRIO',
  'OTARIO'
]);

const PALAVRAS_TIPO_TREINAMENTO_EMPRESA = csvEnv('PALAVRAS_TIPO_TREINAMENTO_EMPRESA', [
  'EMPRESA',
  'MINHA EMPRESA',
  'MEU NEGOCIO',
  'MEU NEGÓCIO',
  'NEGOCIO',
  'NEGÓCIO',
  'CORPORATIVO',
  'ORGANIZACAO',
  'ORGANIZAÇÃO'
]);

const PALAVRAS_TIPO_TREINAMENTO_EQUIPE = csvEnv('PALAVRAS_TIPO_TREINAMENTO_EQUIPE', [
  'EQUIPE',
  'TIME',
  'FUNCIONARIOS',
  'FUNCIONÁRIOS',
  'COLABORADORES',
  'SETOR',
  'DEPARTAMENTO',
  'TURMA'
]);

const PALAVRAS_TIPO_TREINAMENTO_INDIVIDUAL = csvEnv('PALAVRAS_TIPO_TREINAMENTO_INDIVIDUAL', [
  'EU',
  'PRA MIM',
  'PARA MIM',
  'COMIGO',
  'INDIVIDUAL',
  'PESSOAL',
  'SO EU',
  'SÓ EU'
]);

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

const MENSAGEM_TREINAMENTO =
  process.env.MENSAGEM_TREINAMENTO ||
  `Legal! 👋

O Alberto trabalha com conteúdos e treinamentos práticos para produtividade, tecnologia e trabalho.

Para eu te direcionar melhor, me diga uma coisa:

Você quer treinamento para você, para sua equipe ou para sua empresa?

— @albertobri7o`;

const MENSAGEM_ESCOLHER_MATERIAL =
  process.env.MENSAGEM_ESCOLHER_MATERIAL ||
  montarMensagemEscolherMaterial();

const MENSAGEM_FALLBACK_DIRECT =
  process.env.MENSAGEM_FALLBACK_DIRECT ||
  montarMensagemFallbackDirect();

// ================= CACHE / ESTADO =================

const comentariosProcessados = new Map();
const mensagensProcessadas = new Map();
const estadosDirect = new Map();

const TEMPO_CACHE_MS = Number(
  process.env.TEMPO_CACHE_MS || 1000 * 60 * 60 * 24
);

const TEMPO_ESTADO_DIRECT_MS = Number(
  process.env.TEMPO_ESTADO_DIRECT_MS || 1000 * 60 * 60 * 6
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

// ================= RECEBE EVENTOS =================

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
  const usernameNormalizado = normalizar(username);

  if (!commentId || !text) {
    console.log('Comentário ignorado: sem id ou sem texto');
    return;
  }

  if (
    (IG_USERNAME && usernameNormalizado === IG_USERNAME) ||
    String(fromId) === String(IG_USER_ID)
  ) {
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

  if (bateLista(textoNormalizado, PALAVRAS_HUMANO)) {
    await fluxoHumanoComentario(commentId, username, text);
    return;
  }

  if (bateLista(textoNormalizado, PALAVRAS_OFENSA)) {
    await fluxoOfensa(username, text);
    return;
  }

  if (bateLista(textoNormalizado, PALAVRAS_CRITICA)) {
    await fluxoCriticaComentario(commentId, username, text);
    return;
  }

  const classificacao = await classificarComIA(text, 'comentario');

  console.log('🤖 Classificação IA comentário:', classificacao);

  if (classificacao.tipo === 'DELICADO') {
    await notificarAlberto(username, text, 'COMENTÁRIO DELICADO / REVISAR');
    return;
  }

  if (classificacao.tipo === 'TREINAMENTO') {
    await fluxoHumanoComentario(commentId, username, text);
    await notificarAlberto(username, text, 'LEAD DE TREINAMENTO NO COMENTÁRIO');
    return;
  }

  if (['ENTREGA', 'INTERESSE'].includes(classificacao.tipo)) {
    await fluxoInteresseComentario(commentId, username, text, classificacao);
    return;
  }

  if (classificacao.tipo === 'CRITICA') {
    await fluxoCriticaComentario(commentId, username, text);
    return;
  }

  if (classificacao.tipo === 'OFENSA') {
    await fluxoOfensa(username, text);
    return;
  }

  if (classificacao.tipo === 'HUMANO') {
    await fluxoHumanoComentario(commentId, username, text);
    return;
  }

  if (classificacao.tipo === 'DUVIDA') {
    await fluxoDuvidaComentario(commentId, username, text, classificacao);
    return;
  }

  console.log(`Comentário sem ação automática: "${text}"`);
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
    console.log('Evento de direct ignorado: sem sender ou sem message');
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

  // 0. Continua fluxo se já havia uma pergunta pendente.
  const estado = getEstadoDirect(senderId);

  if (estado?.etapa === 'AGUARDANDO_TIPO_TREINAMENTO') {
    await tratarRespostaTipoTreinamento(senderId, usuarioDirect, text, textoNormalizado, estado);
    return;
  }

  if (estado?.etapa === 'AGUARDANDO_ASSUNTO_TREINAMENTO') {
    await tratarRespostaAssuntoTreinamento(senderId, usuarioDirect, text, textoNormalizado, estado);
    return;
  }

  if (estado?.etapa === 'AGUARDANDO_CONTATO_TREINAMENTO') {
    await tratarRespostaContatoTreinamento(senderId, usuarioDirect, text, estado);
    return;
  }

  // 1. Se a pessoa responder palavra-chave no Direct, entrega também.
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

  // 2. Se a pessoa já responde "empresa/equipe/eu" sem contexto, trata como tipo de treinamento.
  const tipoTreinamentoSolto = identificarTipoTreinamento(textoNormalizado);

  if (tipoTreinamentoSolto) {
    await avancarParaAssuntoTreinamento(senderId, usuarioDirect, text, tipoTreinamentoSolto);
    return;
  }

  // 3. Treinamento, curso, equipe, empresa.
  if (bateLista(textoNormalizado, PALAVRAS_TREINAMENTO)) {
    setEstadoDirect(senderId, 'AGUARDANDO_TIPO_TREINAMENTO', {
      origem: 'direct',
      primeiroTexto: text
    });

    await enviarMensagemDirect(senderId, MENSAGEM_TREINAMENTO);
    await notificarAlberto(usuarioDirect, text, 'LEAD DE TREINAMENTO NO DIRECT');
    return;
  }

  // 4. Preço/comprar/link sem especificar material.
  if (bateLista(textoNormalizado, PALAVRAS_PRECO)) {
    await enviarMensagemDirect(senderId, MENSAGEM_ESCOLHER_MATERIAL);
    await notificarAlberto(usuarioDirect, text, 'DM: INTERESSE EM PREÇO/COMPRA SEM MATERIAL DEFINIDO');
    return;
  }

  // 5. Pedido humano direto.
  if (bateLista(textoNormalizado, PALAVRAS_HUMANO)) {
    await enviarMensagemDirect(senderId, MENSAGEM_HUMANO_DM);
    await notificarAlberto(usuarioDirect, text, 'DM: PEDIDO PARA FALAR COM ALBERTO');
    return;
  }

  // 6. Crítica/ofensa.
  if (bateLista(textoNormalizado, PALAVRAS_OFENSA)) {
    await notificarAlberto(usuarioDirect, text, 'DM: OFENSA / POSSÍVEL MODERAÇÃO');
    return;
  }

  if (bateLista(textoNormalizado, PALAVRAS_CRITICA)) {
    await enviarMensagemDirect(senderId, MENSAGEM_CRITICA_DM);
    await notificarAlberto(usuarioDirect, text, 'DM: CRÍTICA / OBJEÇÃO');
    return;
  }

  // 7. IA classifica o restante.
  const classificacao = await classificarComIA(text, 'direct');

  console.log('🤖 Classificação IA direct:', classificacao);

  if (classificacao.tipo === 'TREINAMENTO') {
    setEstadoDirect(senderId, 'AGUARDANDO_TIPO_TREINAMENTO', {
      origem: 'direct_ia',
      primeiroTexto: text
    });

    await enviarMensagemDirect(senderId, MENSAGEM_TREINAMENTO);
    await notificarAlberto(usuarioDirect, text, `DM: LEAD TREINAMENTO IA — ${classificacao.motivo || ''}`);
    return;
  }

  if (classificacao.tipo === 'HUMANO' || classificacao.tipo === 'DELICADO') {
    await enviarMensagemDirect(senderId, MENSAGEM_HUMANO_DM);
    await notificarAlberto(usuarioDirect, text, `DM: ${classificacao.tipo} — ${classificacao.motivo || ''}`);
    return;
  }

  if (classificacao.tipo === 'ENTREGA' || classificacao.tipo === 'INTERESSE') {
    await enviarMensagemDirect(senderId, MENSAGEM_ESCOLHER_MATERIAL);
    await notificarAlberto(usuarioDirect, text, `DM: INTERESSE IA — ${classificacao.motivo || ''}`);
    return;
  }

  if (classificacao.tipo === 'DUVIDA') {
    await enviarMensagemDirect(senderId, montarMensagemDuvida());
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

  await enviarMensagemDirect(senderId, MENSAGEM_FALLBACK_DIRECT);
}

// ================= ESTADO DE TREINAMENTO =================

async function tratarRespostaTipoTreinamento(senderId, usuarioDirect, text, textoNormalizado, estado) {
  const tipo = identificarTipoTreinamento(textoNormalizado);

  if (!tipo) {
    await enviarMensagemDirect(
      senderId,
      `Perfeito. 👋

Só para eu direcionar melhor:

Esse treinamento seria para você, para sua equipe ou para sua empresa?`
    );
    return;
  }

  await avancarParaAssuntoTreinamento(senderId, usuarioDirect, text, tipo, estado);
}

async function avancarParaAssuntoTreinamento(senderId, usuarioDirect, text, tipo, estadoAnterior = {}) {
  setEstadoDirect(senderId, 'AGUARDANDO_ASSUNTO_TREINAMENTO', {
    ...estadoAnterior?.dados,
    tipoTreinamento: tipo,
    respostaTipo: text
  });

  await enviarMensagemDirect(
    senderId,
    `Perfeito. Treinamento para ${tipo}. 👋

Qual seria o foco principal?

1. Excel e planilhas
2. Word e documentos
3. IA no trabalho
4. Automação e WhatsApp
5. Pacote Office completo
6. Outro assunto

Responda com o número ou com o tema.`
  );

  await notificarAlberto(
    usuarioDirect,
    `Tipo de treinamento informado: ${tipo}\nResposta: ${text}`,
    `LEAD TREINAMENTO — TIPO: ${tipo.toUpperCase()}`
  );
}

async function tratarRespostaAssuntoTreinamento(senderId, usuarioDirect, text, textoNormalizado, estado) {
  const assunto = identificarAssuntoTreinamento(textoNormalizado, text);

  setEstadoDirect(senderId, 'AGUARDANDO_CONTATO_TREINAMENTO', {
    ...estado?.dados,
    assuntoTreinamento: assunto,
    respostaAssunto: text
  });

  const tipo = estado?.dados?.tipoTreinamento || 'treinamento';

  await enviarMensagemDirect(
    senderId,
    `Ótimo. Anotei:

Tipo: ${tipo}
Foco: ${assunto}

Para o Alberto te orientar melhor, me envie agora:

1. Nome da empresa ou área
2. Quantidade aproximada de pessoas
3. Melhor WhatsApp ou horário para contato`
  );

  await notificarAlberto(
    usuarioDirect,
    `Tipo: ${tipo}\nAssunto: ${assunto}\nResposta do usuário: ${text}`,
    'LEAD TREINAMENTO — ASSUNTO INFORMADO'
  );
}

async function tratarRespostaContatoTreinamento(senderId, usuarioDirect, text, estado) {
  const dados = estado?.dados || {};

  clearEstadoDirect(senderId);

  await enviarMensagemDirect(
    senderId,
    `Recebi. ✅

Vou repassar essas informações para o Alberto.

Ele vai analisar o melhor formato de treinamento e te responder por aqui ou pelo contato informado.

— @albertobri7o`
  );

  await notificarAlberto(
    usuarioDirect,
    `Novo lead de treinamento completo.

Tipo: ${dados.tipoTreinamento || 'não informado'}
Assunto: ${dados.assuntoTreinamento || 'não informado'}

Dados enviados:
${text}`,
    'LEAD TREINAMENTO — DADOS PARA CONTATO'
  );
}

function identificarTipoTreinamento(textoNormalizado) {
  if (bateLista(textoNormalizado, PALAVRAS_TIPO_TREINAMENTO_EMPRESA)) {
    return 'empresa';
  }

  if (bateLista(textoNormalizado, PALAVRAS_TIPO_TREINAMENTO_EQUIPE)) {
    return 'equipe';
  }

  if (bateLista(textoNormalizado, PALAVRAS_TIPO_TREINAMENTO_INDIVIDUAL)) {
    return 'você';
  }

  return null;
}

function identificarAssuntoTreinamento(textoNormalizado, textoOriginal) {
  if (contemPalavraOuFrase(textoNormalizado, '1') || contemPalavraOuFrase(textoNormalizado, 'EXCEL') || contemPalavraOuFrase(textoNormalizado, 'PLANILHA')) {
    return 'Excel e planilhas';
  }

  if (contemPalavraOuFrase(textoNormalizado, '2') || contemPalavraOuFrase(textoNormalizado, 'WORD') || contemPalavraOuFrase(textoNormalizado, 'DOCUMENTO')) {
    return 'Word e documentos';
  }

  if (contemPalavraOuFrase(textoNormalizado, '3') || contemPalavraOuFrase(textoNormalizado, 'IA') || contemPalavraOuFrase(textoNormalizado, 'INTELIGENCIA ARTIFICIAL') || contemPalavraOuFrase(textoNormalizado, 'INTELIGÊNCIA ARTIFICIAL')) {
    return 'IA no trabalho';
  }

  if (contemPalavraOuFrase(textoNormalizado, '4') || contemPalavraOuFrase(textoNormalizado, 'AUTOMACAO') || contemPalavraOuFrase(textoNormalizado, 'AUTOMAÇÃO') || contemPalavraOuFrase(textoNormalizado, 'WHATSAPP')) {
    return 'Automação e WhatsApp';
  }

  if (contemPalavraOuFrase(textoNormalizado, '5') || contemPalavraOuFrase(textoNormalizado, 'OFFICE') || contemPalavraOuFrase(textoNormalizado, 'PACOTE OFFICE')) {
    return 'Pacote Office completo';
  }

  return textoOriginal;
}

function setEstadoDirect(senderId, etapa, dados = {}) {
  estadosDirect.set(String(senderId), {
    etapa,
    dados,
    atualizadoEm: Date.now()
  });

  console.log(`🧭 Estado do Direct atualizado para ${senderId}: ${etapa}`);
}

function getEstadoDirect(senderId) {
  const estado = estadosDirect.get(String(senderId));

  if (!estado) return null;

  if (Date.now() - estado.atualizadoEm > TEMPO_ESTADO_DIRECT_MS) {
    estadosDirect.delete(String(senderId));
    return null;
  }

  return estado;
}

function clearEstadoDirect(senderId) {
  estadosDirect.delete(String(senderId));
  console.log(`🧭 Estado do Direct limpo para ${senderId}`);
}

// ================= FLUXOS DE COMENTÁRIO =================

async function fluxoEntregaComentario(commentId, username, comentarioOriginal, entregas) {
  const entregasValidas = entregas.filter(e => e.link);

  if (entregasValidas.length === 0) {
    console.error(`❌ Nenhum link configurado para: ${entregas.map(e => e.nome).join(', ')}`);

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

async function fluxoHumanoComentario(commentId, username, comentarioOriginal) {
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

async function fluxoCriticaComentario(commentId, username, comentarioOriginal) {
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

async function fluxoOfensa(username, comentarioOriginal) {
  console.log(`🚫 Ofensa detectada: @${username}`);
  await notificarAlberto(username, comentarioOriginal, 'OFENSA / POSSÍVEL MODERAÇÃO');
}

async function fluxoDuvidaComentario(commentId, username, comentarioOriginal, classificacao) {
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

async function fluxoInteresseComentario(commentId, username, comentarioOriginal, classificacao) {
  console.log(`👀 Interesse detectado: @${username}`);

  await notificarAlberto(
    username,
    comentarioOriginal,
    `INTERESSE SEM PALAVRA-CHAVE: ${classificacao?.motivo || 'sem motivo informado'}`
  );

  if (RESPONDER_PUBLICO) {
    await responderComentarioSeguro(
      commentId,
      `@${username} me diga qual material você quer no direct.`
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
    const materiaisDisponiveis = ENTREGAS.map(e => e.nome).join(', ') || 'nenhum material configurado';

    const prompt = `
Você é a camada de interpretação de um bot do Instagram do perfil @albertobri7o.

Materiais/entregas disponíveis configurados no sistema:
${materiaisDisponiveis}

O perfil trabalha com tecnologia aplicada ao trabalho, produtividade, planilhas, documentos, inteligência artificial, automação e treinamentos.

Origem da mensagem: ${origem}

Mensagem do usuário:
"${texto}"

Classifique APENAS em JSON válido, neste formato:
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

async function notificarAlberto(username, comentario, tipo) {
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
${comentario}

Perfil:
${perfil}`;

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

// ================= BUSCAS E MENSAGENS =================

function encontrarEntregas(textoNormalizado) {
  const encontradas = [];

  for (const entrega of ENTREGAS) {
    const palavras = Array.isArray(entrega.palavras) ? entrega.palavras : [];

    const bateu = palavras.some(palavra =>
      contemPalavraOuFrase(textoNormalizado, normalizar(palavra))
    );

    if (bateu) {
      encontradas.push(entrega);
    }
  }

  return encontradas;
}

function bateLista(textoNormalizado, lista) {
  return lista.some(palavra =>
    contemPalavraOuFrase(textoNormalizado, normalizar(palavra))
  );
}

function contemPalavraOuFrase(texto, termo) {
  if (!termo) return false;

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
    const titulo = entrega.tituloDm || entrega.nome || 'material';

    return `Oi! 👋

Aqui está o link do ${titulo}:

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
    return entregas[0].comentario || 'te mandei no direct! 📩';
  }

  return 'te mandei os links no direct! 📩';
}

function montarMensagemEscolherMaterial() {
  const opcoes = ENTREGAS
    .map((entrega, index) => `${index + 1}. ${entrega.nome}`)
    .join('\n');

  return `Claro! 👋

Me diga qual material você quer receber:

${opcoes || 'Nenhum material configurado ainda.'}

É só responder com o nome de um deles.

— @albertobri7o`;
}

function montarMensagemFallbackDirect() {
  const nomes = ENTREGAS.map(e => e.nome).join(', ');

  return `Entendi. 👋

Para eu te ajudar melhor, me diga o nome do material que você quer.

Opções:
${nomes || 'Nenhum material configurado ainda.'}

Se preferir, escreva "falar com Alberto".

— @albertobri7o`;
}

function montarMensagemDuvida() {
  const nomes = ENTREGAS.map(e => e.nome).join(', ');

  return `Entendi sua dúvida. 👋

Me diga qual assunto você quer aprofundar.

Materiais disponíveis:
${nomes || 'Nenhum material configurado ainda.'}

Se preferir, escreva "falar com Alberto".

— @albertobri7o`;
}

// ================= CONFIG PARSERS =================

function carregarEntregas() {
  const raw = process.env.ENTREGAS_JSON;

  if (!raw) {
    console.warn('⚠️ ENTREGAS_JSON ausente. Nenhuma palavra-chave de entrega configurada.');
    return [];
  }

  try {
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      console.warn('⚠️ ENTREGAS_JSON precisa ser um array JSON.');
      return [];
    }

    return parsed
      .filter(item => item && typeof item === 'object')
      .map(item => ({
        nome: String(item.nome || '').trim(),
        palavras: Array.isArray(item.palavras)
          ? item.palavras.map(p => String(p).trim()).filter(Boolean)
          : [],
        link: String(item.link || '').trim(),
        tipo: String(item.tipo || '').trim(),
        comentario: String(item.comentario || 'te mandei no direct! 📩').trim(),
        tituloDm: String(item.tituloDm || item.nome || 'material').trim()
      }))
      .filter(item => item.nome && item.palavras.length > 0);
  } catch (error) {
    console.error('❌ Erro ao ler ENTREGAS_JSON:', error.message);
    return [];
  }
}

function csvEnv(nome, padrao = []) {
  const raw = process.env[nome];

  if (!raw) return padrao;

  return raw
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function boolEnv(nome, padrao) {
  const raw = process.env[nome];

  if (raw === undefined || raw === null || raw === '') {
    return padrao;
  }

  return String(raw).toLowerCase() === 'true';
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

  for (const [senderId, estado] of estadosDirect.entries()) {
    if (agora - estado.atualizadoEm > TEMPO_ESTADO_DIRECT_MS) {
      estadosDirect.delete(senderId);
    }
  }
}

function mascararToken(token = '') {
  if (!token) return 'VAZIO';

  const inicio = token.slice(0, 4);
  const fim = token.slice(-4);

  return `${inicio}...${fim} (${token.length} chars)`;
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

  if (!ENTREGAS.length) {
    console.warn('⚠️ Nenhuma entrega carregada. Configure ENTREGAS_JSON no Railway.');
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

  console.log(`📦 Entregas carregadas: ${ENTREGAS.map(e => e.nome).join(', ') || 'nenhuma'}`);

  console.log(`🔐 ACCESS_TOKEN: ${mascararToken(ACCESS_TOKEN)}`);
  console.log(`🔐 PAGE_ACCESS_TOKEN: ${mascararToken(PAGE_ACCESS_TOKEN)}`);
  console.log(`🔐 IG_ACCESS_TOKEN: ${mascararToken(IG_ACCESS_TOKEN)}`);

  console.log(`💬 RESPONDER_DIRECT: ${RESPONDER_DIRECT ? '✅' : '❌'}`);
  console.log(`🧭 Estado de Direct: ✅`);
  console.log(`🤖 IA configurada: ${OPENAI_API_KEY ? '✅' : '❌'}`);
});
