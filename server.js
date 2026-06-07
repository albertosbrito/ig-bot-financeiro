// server.js — Instagram Bot com IA roteadora + contexto do produto entregue
// Autor: @albertobri7o
//
// Regra fixa: somente ENTREGAS_JSON.
// Todo o resto vai para a IA.
// Correção desta versão:
// - Quando o bot entrega um produto pelo comentário, ele salva o estado PRODUTO_ENTREGUE.
// - Se a pessoa perguntar no Direct "Qual é o conteúdo?", "O que vem?", "Quais assuntos?",
//   o bot responde usando BOT_FUNIL_JSON do produto entregue, sem perguntar novamente qual material é.

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

const BOT_NEGOCIO_CONTEXT =
  process.env.BOT_NEGOCIO_CONTEXT ||
  `Alberto Brito, @albertobri7o, vende conteúdos digitais (eBooks e apostilas prontas) e também presta consultorias, treinamentos e imersões sobre Excel, Word, IA, automação, produtividade, Power BI e dados. PADRÃO: venda de material. Se a pessoa demonstra interesse, pede informações, preço ou link, trate como venda de produto: NÃO faça questionário de consultoria, NÃO pergunte "é para você, equipe ou empresa", apenas ajude a escolher o material e envie preço e link. EXCEÇÃO: consultoria/treinamento só quando a pessoa fala explicitamente em empresa, equipe, treinar um time, capacitar funcionários, orçamento corporativo, contratar para um negócio, mentoria ou projeto sob medida — nesse caso qualifique (para quem, tema, objetivo, contato) e encaminhe ao WhatsApp (82) 98186-8684. Na dúvida, é venda de material. Mensagem vaga ("tenho interesse", "queria informações") sem tema: liste os materiais com preços e peça que a pessoa responda qual quer. Responda em português do Brasil, curto e caloroso, no máximo 1 emoji, sempre em uma única mensagem.`;

const BOT_FUNIL_JSON_RAW = process.env.BOT_FUNIL_JSON || '';
const BOT_FUNIL = carregarBotFunil(BOT_FUNIL_JSON_RAW);

const openai = OPENAI_API_KEY
  ? new OpenAI({ apiKey: OPENAI_API_KEY })
  : null;

// ================= ENTREGAS =================

const ENTREGAS = carregarEntregas();

// ================= CACHE / ESTADO =================

const comentariosProcessados = new Map();
const mensagensProcessadas = new Map();
const estadosDirect = new Map();

const TEMPO_CACHE_MS = Number(process.env.TEMPO_CACHE_MS || 1000 * 60 * 60 * 24);
const TEMPO_ESTADO_DIRECT_MS = Number(process.env.TEMPO_ESTADO_DIRECT_MS || 1000 * 60 * 60 * 6);

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

  if ((IG_USERNAME && usernameNormalizado === IG_USERNAME) || String(fromId) === String(IG_USER_ID)) {
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

  // Regra fixa única: entrega por ENTREGAS_JSON.
  const entregasEncontradas = encontrarEntregas(textoNormalizado);

  if (entregasEncontradas.length > 0) {
    await fluxoEntregaComentario(commentId, username, text, entregasEncontradas, fromId);
    return;
  }

  // Todo o resto vai para IA.
  const estado = fromId ? getEstadoDirect(fromId) : null;

  const decisao = await decidirComIA({
    origem: 'comentario',
    texto: text,
    username,
    senderId: fromId,
    estado
  });

  await executarDecisaoComentario({
    decisao,
    commentId,
    username,
    textoOriginal: text,
    senderId: fromId
  });
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

  // Dedup por mid (quando existe) E por conteúdo (senderId+texto) numa janela curta.
  // Respostas a anúncio podem chegar sem mid, com mid diferente, ou em duplicidade
  // (objeto instagram + page). A chave de conteúdo cobre todos esses casos.
  const textoDedup = normalizar(text);
  const chaveConteudo = `c:${senderId}:${textoDedup}`;
  const JANELA_DUPLICADO_MS = 15000; // 15s
  const agoraDedup = Date.now();

  const duplicado =
    (mid && mensagensProcessadas.has(mid)) ||
    (mensagensProcessadas.has(chaveConteudo) &&
      agoraDedup - mensagensProcessadas.get(chaveConteudo) < JANELA_DUPLICADO_MS);

  if (duplicado) {
    console.log(`Direct duplicado ignorado (mid=${mid || 'sem'} / ${chaveConteudo})`);
    return;
  }

  if (mid) mensagensProcessadas.set(mid, agoraDedup);
  mensagensProcessadas.set(chaveConteudo, agoraDedup);

  const textoNormalizado = normalizar(text);
  const usuarioDirect = `ig_user_${senderId}`;
  const estado = getEstadoDirect(senderId);

  console.log(`📩 DM recebida de ${senderId}: "${text}"`);
  console.log('🧭 Estado atual do Direct:', estado ? JSON.stringify(estado) : 'SEM_ESTADO');

  // 0. Se a pessoa veio de um anúncio, tenta entregar o produto certo direto.
  //    Só funciona se a Meta enviar o referral no webhook (depende da config do anúncio).
  const referralTexto = extrairTextoReferral(event);
  if (referralTexto) {
    const entregasAnuncio = encontrarEntregas(normalizar(referralTexto)).filter(e => e.link);
    if (entregasAnuncio.length === 1) {
      console.log(`📢 Origem de anúncio reconhecida: "${referralTexto}" → ${entregasAnuncio[0].nome}`);
      await enviarMensagemDirect(senderId, montarMensagemEntrega(entregasAnuncio));
      guardarEstadoProdutoEntregue(senderId, entregasAnuncio[0], text);
      await notificarAlberto(
        usuarioDirect,
        `Veio do anúncio: ${referralTexto}\nMensagem: ${text}`,
        'DM — ENTREGA POR ANÚNCIO'
      );
      return;
    }
  }

  // 1. Se o usuário recebeu um produto e perguntou sobre conteúdo,
  // responde de forma determinística usando BOT_FUNIL_JSON.
  if (estado?.etapa === 'PRODUTO_ENTREGUE' && ehPerguntaSobreConteudo(textoNormalizado)) {
    const produto = estado?.dados?.produto;
    const respostaConteudo = respostaConteudoProduto(produto);

    if (respostaConteudo) {
      await enviarMensagemDirect(senderId, respostaConteudo);

      await notificarAlberto(
        usuarioDirect,
        `Mensagem:
${text}

Produto em contexto:
${produto}

Ação:
respondi com o conteúdo do produto usando BOT_FUNIL_JSON.`,
        `DIRECT — CONTEÚDO DO PRODUTO ${produto || ''}`
      );

      // Mantém o estado como PRODUTO_ENTREGUE, pois o usuário pode perguntar preço, garantia etc.
      atualizarEstadoDirect(senderId, {
        ultimaPergunta: text,
        ultimaResposta: 'conteudo_produto'
      });

      return;
    }
  }

  // 2. Regra fixa única: entrega por ENTREGAS_JSON.
  const entregasEncontradas = encontrarEntregas(textoNormalizado);

  if (entregasEncontradas.length > 0) {
    const entregasValidas = entregasEncontradas.filter(e => e.link);

    if (entregasValidas.length === 0) {
      await enviarMensagemDirect(senderId, montarMensagemEscolherMaterial());
      await notificarAlberto(usuarioDirect, text, 'DM COM ENTREGA SEM LINK CONFIGURADO');
      return;
    }

    await enviarMensagemDirect(senderId, montarMensagemEntrega(entregasValidas));

    if (entregasValidas.length === 1) {
      guardarEstadoProdutoEntregue(senderId, entregasValidas[0], text);
    }

    await notificarAlberto(
      usuarioDirect,
      `Mensagem:
${text}

Entrega enviada:
${entregasValidas.map(e => e.nome).join(', ')}`,
      `DM — ENTREGA ENVIADA`
    );

    return;
  }

  // 3. Todo o resto vai para IA, com estado da conversa.
  const decisao = await decidirComIA({
    origem: 'direct',
    texto: text,
    username: usuarioDirect,
    senderId,
    estado
  });

  await executarDecisaoDirect({
    decisao,
    senderId,
    username: usuarioDirect,
    textoOriginal: text
  });
}

// ================= EXECUÇÃO DAS DECISÕES DA IA =================

async function executarDecisaoComentario({ decisao, commentId, username, textoOriginal, senderId }) {
  const resposta = limparResposta(decisao?.resposta);

  if (senderId && decisao?.estado_novo) {
    setEstadoDirect(senderId, decisao.estado_novo, {
      origem: 'comentario',
      intencao: decisao.intencao,
      ultimoTexto: textoOriginal,
      resumo: decisao.resumo_estado || decisao.motivo || ''
    });
  }

  if (senderId && decisao?.limpar_estado) {
    clearEstadoDirect(senderId);
  }

  if (decisao?.notificar_alberto) {
    await notificarAlberto(
      username,
      montarResumoNotificacao(textoOriginal, decisao),
      `COMENTÁRIO — ${decisao.intencao || 'IA'}`
    );
  }

  if (['IGNORAR', 'SPAM'].includes(decisao?.intencao)) {
    console.log(`Comentário ignorado por decisão da IA: ${decisao.intencao}`);
    return;
  }

  if (!resposta) {
    console.log('IA não gerou resposta para comentário.');
    return;
  }

  let privateReplyEnviado = false;

  if (ENVIAR_PRIVATE_REPLY) {
    try {
      await enviarPrivateReply(commentId, resposta);
      privateReplyEnviado = true;
      console.log('✅ Private reply enviada por IA');
    } catch (error) {
      console.error('❌ Erro ao enviar private reply por IA:', error.message);
      await notificarAlberto(username, textoOriginal, `ERRO AO ENVIAR PRIVATE REPLY IA: ${error.message}`);
    }
  }

  if (RESPONDER_PUBLICO) {
    const msgPublica = privateReplyEnviado
      ? `@${username} te respondi no direct 📩`
      : `@${username} me chama no direct que eu te respondo 📩`;

    await responderComentarioSeguro(commentId, msgPublica);
  }
}

async function executarDecisaoDirect({ decisao, senderId, username, textoOriginal }) {
  const resposta = limparResposta(decisao?.resposta);

  if (decisao?.estado_novo) {
    setEstadoDirect(senderId, decisao.estado_novo, {
      origem: 'direct',
      intencao: decisao.intencao,
      ultimoTexto: textoOriginal,
      resumo: decisao.resumo_estado || decisao.motivo || ''
    });
  }

  if (decisao?.limpar_estado) {
    clearEstadoDirect(senderId);
  }

  if (decisao?.notificar_alberto) {
    await notificarAlberto(
      username,
      montarResumoNotificacao(textoOriginal, decisao),
      `DIRECT — ${decisao.intencao || 'IA'}`
    );
  }

  if (['IGNORAR', 'SPAM'].includes(decisao?.intencao) && !resposta) {
    console.log(`Direct ignorado por decisão da IA: ${decisao.intencao}`);
    return;
  }

  if (!resposta) {
    await enviarMensagemDirect(senderId, montarMensagemFallbackDirect());
    return;
  }

  await enviarMensagemDirect(senderId, resposta);
}

// ================= IA ROTEADORA =================

async function decidirComIA({ origem, texto, username, senderId, estado }) {
  if (!openai) {
    return decisaoFallbackSemIA(texto, estado);
  }

  try {
    const materiaisDisponiveis = ENTREGAS.map(e => ({
      nome: e.nome,
      palavras: e.palavras,
      tipo: e.tipo,
      tituloDm: e.tituloDm
    }));

    const prompt = `
Você é o cérebro de atendimento do Instagram @albertobri7o.

CONTEXTO DO NEGÓCIO:
${BOT_NEGOCIO_CONTEXT}

BOT_FUNIL_JSON:
${BOT_FUNIL_JSON_RAW || 'Nenhum funil configurado.'}

ENTREGAS CONFIGURADAS:
${JSON.stringify(materiaisDisponiveis, null, 2)}

ORIGEM DA MENSAGEM:
${origem}

USUÁRIO:
${username || 'desconhecido'}

ESTADO ATUAL DA CONVERSA:
${estado ? JSON.stringify(estado, null, 2) : 'SEM_ESTADO'}

MENSAGEM DO USUÁRIO:
"${texto}"

SUA TAREFA:
Decidir a próxima ação do bot.

REGRAS IMPORTANTES:
1. Regra de entrega direta por palavra-chave já foi processada antes de chegar aqui. Não precisa entregar link de ENTREGAS_JSON, exceto se for uma resposta contextual.
2. PADRÃO = VENDA DE MATERIAL. Interesse, "quero informações", "qual o preço", "como funciona" ou pedido de um material/eBook/apostila/curso pronto NÃO é consultoria. NÃO faça questionário. Ajude a pessoa a escolher o material e mande preço e link.
3. CONSULTORIA/TREINAMENTO é EXCEÇÃO: só quando a pessoa fala explicitamente em empresa, equipe, treinar um time, capacitar funcionários, orçamento corporativo, contratar para um negócio, mentoria ou projeto sob medida. SÓ nesse caso qualifique (para quem, tema, objetivo, contato) e direcione ao WhatsApp (82) 98186-8684.
4. Se o estado atual já estiver aguardando uma resposta, avance a conversa. NÃO repita a pergunta anterior.
5. Se o usuário pergunta "ele dá consultoria/treinamento pra empresa?", responda que sim e pergunte se é para pessoa, equipe ou empresa.
6. NUNCA faça questionário de consultoria só porque a pessoa perguntou preço, valor, orçamento ou demonstrou interesse. Isso é VENDA — liste/entregue o material.
7. Na dúvida entre venda e consultoria, é VENDA DE MATERIAL.
8. Se o estado atual for PRODUTO_ENTREGUE e o usuário perguntar "qual é o conteúdo", "o que vem", "quais assuntos", "serve para quê", "tem o quê" ou algo parecido, use o produto salvo no estado e responda com base no BOT_FUNIL_JSON. Não pergunte novamente qual material é.
9. Para crítica, ofensa ou tema delicado, notifique Alberto e responda com cuidado ou silencie.
10. Seja curto, natural, brasileiro e profissional.
11. Não invente preço. Use somente os preços do CONTEXTO DO NEGÓCIO.
12. Não diga que é IA. Pode dizer "sou o assistente do Alberto".
13. Se a pessoa perguntar preço/valor SEM dizer o tema (ex.: "qual o preço?"), NÃO faça
    pergunta seca. Liste TODOS os materiais com seus preços (conforme o CONTEXTO DO NEGÓCIO),
    numa única mensagem, e peça que ela responda com o nome do material desejado.
14. Para temas SEM material pronto (IA, Power BI, automação, produtividade, dados): confirme
    que o Alberto trabalha com o tema e direcione ao WhatsApp (82) 98186-8684. NUNCA envie
    link de pagamento nesses casos. NUNCA chame um link de algo que ele não é.
15. Envie SEMPRE uma única mensagem por resposta. Não repita a mesma pergunta.

ESTADOS POSSÍVEIS:
- PRODUTO_ENTREGUE
- AGUARDANDO_ESCOPO_CONSULTORIA
- AGUARDANDO_TEMA_CONSULTORIA
- AGUARDANDO_CONTATO_CONSULTORIA
- AGUARDANDO_TIPO_TREINAMENTO
- AGUARDANDO_ASSUNTO_TREINAMENTO
- AGUARDANDO_CONTATO_TREINAMENTO
- AGUARDANDO_MATERIAL
- null

INTENÇÕES POSSÍVEIS:
- MATERIAL
- CONSULTORIA
- TREINAMENTO
- IMERSAO
- ORCAMENTO
- HUMANO
- CRITICA
- OFENSA
- DUVIDA
- ELOGIO
- SPAM
- DELICADO
- INTERESSE
- IGNORAR

Responda APENAS em JSON válido, sem markdown, neste formato:
{
  "intencao": "CONSULTORIA",
  "acao": "RESPONDER",
  "resposta": "texto que será enviado ao usuário",
  "estado_novo": "AGUARDANDO_ESCOPO_CONSULTORIA",
  "limpar_estado": false,
  "notificar_alberto": true,
  "motivo": "explicação curta",
  "resumo_estado": "resumo curto para guardar no estado",
  "resumo_para_alberto": "resumo do lead ou alerta para Alberto",
  "confianca": 0.9
}
`;

    const response = await openai.responses.create({
      model: OPENAI_MODEL,
      input: prompt,
      temperature: 0
    });

    const output = response.output_text || '';
    const json = extrairJson(output);

    if (!json?.intencao) {
      console.warn('IA não retornou JSON válido. Saída:', output);
      return decisaoFallbackSemIA(texto, estado);
    }

    return normalizarDecisao(json);
  } catch (error) {
    console.error('Erro na decisão IA:', error.message);
    return decisaoFallbackSemIA(texto, estado);
  }
}

function normalizarDecisao(json) {
  const estadoNovo = json.estado_novo === 'null' ? null : json.estado_novo;

  return {
    intencao: String(json.intencao || 'IGNORAR').toUpperCase(),
    acao: String(json.acao || 'RESPONDER').toUpperCase(),
    resposta: String(json.resposta || '').trim(),
    estado_novo: estadoNovo || null,
    limpar_estado: Boolean(json.limpar_estado),
    notificar_alberto: Boolean(json.notificar_alberto),
    motivo: String(json.motivo || '').trim(),
    resumo_estado: String(json.resumo_estado || '').trim(),
    resumo_para_alberto: String(json.resumo_para_alberto || '').trim(),
    confianca: Number(json.confianca || 0)
  };
}

function decisaoFallbackSemIA(texto, estado) {
  if (estado?.etapa === 'PRODUTO_ENTREGUE' && ehPerguntaSobreConteudo(normalizar(texto))) {
    const resposta = respostaConteudoProduto(estado?.dados?.produto);

    if (resposta) {
      return {
        intencao: 'MATERIAL',
        acao: 'RESPONDER',
        resposta,
        estado_novo: 'PRODUTO_ENTREGUE',
        limpar_estado: false,
        notificar_alberto: true,
        motivo: 'Fallback de conteúdo do produto entregue',
        resumo_estado: estado?.dados?.resumo || '',
        resumo_para_alberto: `Usuário perguntou conteúdo do produto ${estado?.dados?.produto || ''}`,
        confianca: 0
      };
    }
  }

  if (estado?.etapa) {
    return {
      intencao: 'HUMANO',
      acao: 'RESPONDER',
      resposta: `Recebi. 👋\n\nVou encaminhar isso para o Alberto analisar melhor e te responder com mais precisão.`,
      estado_novo: null,
      limpar_estado: true,
      notificar_alberto: true,
      motivo: 'Fallback sem IA com estado ativo',
      resumo_estado: '',
      resumo_para_alberto: `Mensagem recebida com estado ativo: ${texto}`,
      confianca: 0
    };
  }

  return {
    intencao: 'INTERESSE',
    acao: 'RESPONDER',
    resposta: montarMensagemFallbackDirect(),
    estado_novo: null,
    limpar_estado: false,
    notificar_alberto: false,
    motivo: 'Fallback sem IA',
    resumo_estado: '',
    resumo_para_alberto: '',
    confianca: 0
  };
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

// ================= FLUXO DE ENTREGA FIXA =================

async function fluxoEntregaComentario(commentId, username, comentarioOriginal, entregas, senderId = null) {
  const entregasValidas = entregas.filter(e => e.link);

  if (entregasValidas.length === 0) {
    console.error(`❌ Nenhum link configurado para: ${entregas.map(e => e.nome).join(', ')}`);

    await notificarAlberto(
      username,
      `Mensagem:
${comentarioOriginal}

Entregas encontradas:
${entregas.map(e => e.nome).join(', ')}`,
      'LINK NÃO CONFIGURADO'
    );

    if (RESPONDER_PUBLICO) {
      await responderComentarioSeguro(commentId, `@${username} me chama no direct que eu te envio 📩`);
    }

    return;
  }

  let dmEnviada = false;

  if (ENVIAR_PRIVATE_REPLY) {
    try {
      await enviarPrivateReply(commentId, montarMensagemEntrega(entregasValidas));
      dmEnviada = true;

      if (senderId && entregasValidas.length === 1) {
        guardarEstadoProdutoEntregue(senderId, entregasValidas[0], comentarioOriginal);
      }

      console.log(`✅ Entrega enviada para @${username}: ${entregasValidas.map(e => e.nome).join(', ')}`);
    } catch (error) {
      console.error(`❌ Erro ao enviar entrega para @${username}:`, error.message);
      await notificarAlberto(username, `Mensagem:\n${comentarioOriginal}`, `ERRO AO ENVIAR ENTREGA: ${error.message}`);
    }
  }

  if (RESPONDER_PUBLICO) {
    const mensagemPublica = dmEnviada
      ? montarRespostaPublicaEntrega(username, entregasValidas)
      : `@${username} me chama no direct que eu te envio 📩`;

    await responderComentarioSeguro(commentId, mensagemPublica);
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

// ================= TELEGRAM =================

async function notificarAlberto(username, conteudo, tipo) {
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

${conteudo}

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

function montarResumoNotificacao(textoOriginal, decisao) {
  return `Mensagem:
${textoOriginal}

Intenção:
${decisao?.intencao || 'não informada'}

Motivo:
${decisao?.motivo || 'não informado'}

Resumo:
${decisao?.resumo_para_alberto || 'sem resumo'}

Estado novo:
${decisao?.estado_novo || 'nenhum'}`;
}

// ================= PRODUTO / FUNIL =================

function ehPerguntaSobreConteudo(textoNormalizado) {
  const termos = [
    'QUAL E O CONTEUDO',
    'QUAL É O CONTEUDO',
    'QUAL É O CONTEÚDO',
    'CONTEUDO',
    'CONTEÚDO',
    'O QUE VEM',
    'O QUE TEM',
    'QUAIS ASSUNTOS',
    'ASSUNTOS',
    'TOPICOS',
    'TÓPICOS',
    'EMENTA',
    'ABORDA',
    'SERVE PARA QUE',
    'DETALHES DO MATERIAL',
    'SOBRE O QUE'
  ];

  return termos.some(termo => textoNormalizado.includes(normalizar(termo)));
}

function respostaConteudoProduto(produtoNome) {
  if (!produtoNome || !BOT_FUNIL) return null;

  const produtoNormalizado = normalizar(produtoNome);

  const candidatos = [];

  if (BOT_FUNIL.produtos && typeof BOT_FUNIL.produtos === 'object') {
    for (const [chave, valor] of Object.entries(BOT_FUNIL.produtos)) {
      candidatos.push({ chave, valor });
    }
  }

  for (const [chave, valor] of Object.entries(BOT_FUNIL)) {
    if (chave !== 'produtos' && valor && typeof valor === 'object') {
      candidatos.push({ chave, valor });
    }
  }

  for (const candidato of candidatos) {
    const chaveNormalizada = normalizar(candidato.chave);
    const nomeNormalizado = normalizar(candidato.valor?.nome || '');

    const bate =
      chaveNormalizada === produtoNormalizado ||
      nomeNormalizado === produtoNormalizado ||
      chaveNormalizada.includes(produtoNormalizado) ||
      produtoNormalizado.includes(chaveNormalizada) ||
      nomeNormalizado.includes(produtoNormalizado) ||
      produtoNormalizado.includes(nomeNormalizado);

    if (!bate) continue;

    const resposta =
      candidato.valor?.resposta_conteudo ||
      candidato.valor?.resposta_sugerida ||
      candidato.valor?.conteudo ||
      candidato.valor?.descricao ||
      candidato.valor?.resposta;

    if (resposta) {
      return String(resposta).trim();
    }
  }

  return null;
}

// ================= ENTREGAS E MENSAGENS =================

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

    if (entrega.mensagemDm) {
      return String(entrega.mensagemDm)
        .replaceAll('{link}', entrega.link)
        .replaceAll('{nome}', entrega.nome)
        .replaceAll('{tituloDm}', titulo);
    }

    return `Oi! 👋

Aqui está o link para acessar ${titulo}:

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

function montarRespostaPublicaEntrega(username, entregas) {
  if (entregas.length === 1) {
    const entrega = entregas[0];
    const comentario = entrega.comentario || 'te mandei no direct! 📩';

    if (entrega.usarArroba === false) {
      return comentario;
    }

    return `@${username} ${comentario}`;
  }

  return `@${username} te mandei os links no direct! 📩`;
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
  return `Entendi. 👋

Para eu te ajudar melhor, me diga rapidamente o que você procura:

• material
• consultoria
• treinamento
• imersão
• falar com Alberto

— @albertobri7o`;
}

// ================= ESTADO =================

function guardarEstadoProdutoEntregue(senderId, entrega, origemTexto) {
  setEstadoDirect(senderId, 'PRODUTO_ENTREGUE', {
    produto: entrega.nome,
    tituloDm: entrega.tituloDm,
    link: entrega.link,
    tipo: entrega.tipo,
    ultimoTexto: origemTexto,
    resumo: `Usuário recebeu o produto ${entrega.nome}`
  });
}

function setEstadoDirect(senderId, etapa, dados = {}) {
  estadosDirect.set(String(senderId), {
    etapa,
    dados,
    atualizadoEm: Date.now()
  });

  console.log(`🧭 Estado do Direct atualizado para ${senderId}: ${etapa}`);
}

function atualizarEstadoDirect(senderId, novosDados = {}) {
  const estado = getEstadoDirect(senderId);

  if (!estado) return;

  estadosDirect.set(String(senderId), {
    ...estado,
    dados: {
      ...(estado.dados || {}),
      ...novosDados
    },
    atualizadoEm: Date.now()
  });

  console.log(`🧭 Estado do Direct atualizado com novos dados para ${senderId}`);
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
        tituloDm: String(item.tituloDm || item.nome || 'material').trim(),
        mensagemDm: item.mensagemDm ? String(item.mensagemDm) : '',
        usarArroba: item.usarArroba === false ? false : true
      }))
      .filter(item => item.nome && item.palavras.length > 0);
  } catch (error) {
    console.error('❌ Erro ao ler ENTREGAS_JSON:', error.message);
    return [];
  }
}

function extrairTextoReferral(event) {
  // A Meta pode enviar a origem do anúncio em locais diferentes do evento.
  const ref =
    event?.referral ||
    event?.message?.referral ||
    event?.postback?.referral ||
    null;

  if (!ref) return '';

  const ctx = ref.ads_context_data || {};
  // Junta os campos de texto que podem conter o nome do produto anunciado.
  return [ref.ref, ctx.ad_title, ctx.title].filter(Boolean).join(' ');
}

function carregarBotFunil(raw) {
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error('❌ Erro ao ler BOT_FUNIL_JSON:', error.message);
    return null;
  }
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

function limparResposta(valor = '') {
  return String(valor || '').trim();
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
    console.warn('⚠️ OPENAI_API_KEY ausente. IA ficará desativada.');
  }

  if (!BOT_FUNIL) {
    console.warn('⚠️ BOT_FUNIL_JSON ausente ou inválido. Perguntas de conteúdo dependerão só da IA.');
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
  console.log(`🧠 IA roteadora: ${OPENAI_API_KEY ? '✅' : '❌'}`);
  console.log(`🗂️ BOT_FUNIL_JSON: ${BOT_FUNIL ? '✅' : '❌'}`);
});
