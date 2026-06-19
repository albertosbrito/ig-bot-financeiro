// server.js — Instagram Bot com funil por botões + entrega por palavra-chave
// Autor: @albertobri7o

import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
const IG_USERNAME = normalizar(process.env.IG_USERNAME || 'albertobri7o');

const ACCESS_TOKEN = limparToken(process.env.ACCESS_TOKEN || process.env.IG_ACCESS_TOKEN);
const IG_ACCESS_TOKEN = limparToken(process.env.IG_ACCESS_TOKEN);
const PAGE_ACCESS_TOKEN = limparToken(process.env.PAGE_ACCESS_TOKEN);
const PAGE_ID = process.env.PAGE_ID;

const RESPONDER_PUBLICO = boolEnv('RESPONDER_PUBLICO', true);
const ENVIAR_PRIVATE_REPLY = boolEnv('ENVIAR_PRIVATE_REPLY', true);
const RESPONDER_DIRECT = boolEnv('RESPONDER_DIRECT', true);
const USAR_FUNIL_BOTOES = boolEnv('USAR_FUNIL_BOTOES', true);

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const BOT_NEGOCIO_CONTEXT = String(process.env.BOT_NEGOCIO_CONTEXT || '').trim();
const BOT_FUNIL_JSON_RAW = process.env.BOT_FUNIL_JSON || '';
const BOT_FUNIL = carregarBotFunil(BOT_FUNIL_JSON_RAW);

const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

const ENTREGAS = carregarEntregas();

// ================= CACHE / ESTADO =================

const comentariosProcessados = new Map();
const mensagensProcessadas = new Map();
const estadosDirect = new Map();

const TEMPO_CACHE_MS = Number(process.env.TEMPO_CACHE_MS || 1000 * 60 * 60 * 24);
const TEMPO_ESTADO_DIRECT_MS = Number(process.env.TEMPO_ESTADO_DIRECT_MS || 1000 * 60 * 60 * 6);
const LEADS_REMARKETING_PATH = process.env.LEADS_REMARKETING_PATH || path.join(__dirname, 'data', 'leads-remarketing.ndjson');

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
    console.log('🔎 WEBHOOK BRUTO >>>', JSON.stringify(body));

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

  const entregasEncontradas = encontrarEntregas(textoNormalizado);

  if (entregasEncontradas.length > 0) {
    await fluxoEntregaComentario(commentId, username, text, entregasEncontradas, fromId);
    return;
  }

  const estado = fromId ? getEstadoDirect(fromId) : null;
  const decisao = await decidirComIA({ origem: 'comentario', texto: text, username, senderId: fromId, estado });

  await executarDecisaoComentario({ decisao, commentId, username, textoOriginal: text, senderId: fromId });
}

// ================= DIRECT =================

async function processarMensagemDirect(event) {
  if (!RESPONDER_DIRECT) {
    console.log('Direct ignorado: RESPONDER_DIRECT=false');
    return;
  }

  const senderId = event?.sender?.id;
  const message = event?.message;
  const postback = event?.postback;
  const payload = extrairPayloadBotao(event);
  const text = message?.text || postback?.title || '';
  const mid = message?.mid || postback?.mid || '';

  if (!senderId || (!message && !postback)) {
    console.log('Evento de direct ignorado: sem sender ou sem message/postback');
    return;
  }

  if (message?.is_echo || String(senderId) === String(IG_USER_ID)) {
    console.log('Direct ignorado: echo/próprio bot');
    return;
  }

  if (!text && !payload) {
    console.log('Direct recebido sem texto/payload. Ignorando por enquanto.');
    return;
  }

  limparCacheProcessados();

  const dedupBase = payload || text;
  const textoDedup = normalizar(dedupBase);
  const chaveConteudo = `c:${senderId}:${textoDedup}`;
  const JANELA_DUPLICADO_MS = 15000;
  const agoraDedup = Date.now();

  const duplicado =
    (mid && mensagensProcessadas.has(mid)) ||
    (mensagensProcessadas.has(chaveConteudo) && agoraDedup - mensagensProcessadas.get(chaveConteudo) < JANELA_DUPLICADO_MS);

  if (duplicado) {
    console.log(`Direct duplicado ignorado (mid=${mid || 'sem'} / ${chaveConteudo})`);
    return;
  }

  if (mid) mensagensProcessadas.set(mid, agoraDedup);
  mensagensProcessadas.set(chaveConteudo, agoraDedup);

  const textoNormalizado = normalizar(text);
  const usuarioDirect = `ig_user_${senderId}`;
  const estado = getEstadoDirect(senderId);

  console.log(`📩 DM recebida de ${senderId}: "${text || payload}"`);
  console.log('🧭 Estado atual do Direct:', estado ? JSON.stringify(estado) : 'SEM_ESTADO');
  console.log('🔎 EVENTO COMPLETO DA META >>>', JSON.stringify(event));

  if (payload && payload.startsWith('FUNIL|')) {
    await processarBotaoFunil(senderId, payload, text);
    return;
  }

  if (estado?.etapa && String(estado.etapa).startsWith('FUNIL_')) {
    await lidarTextoLivreNoFunil(senderId, text, estado);
    return;
  }

  const referralTexto = extrairTextoReferral(event);
  if (referralTexto) {
    const entregasAnuncio = encontrarEntregas(normalizar(referralTexto)).filter(e => e.link);
    if (entregasAnuncio.length >= 1) {
      const entrega = escolherEntregaPrincipal(entregasAnuncio);
      console.log(`📢 Origem de anúncio reconhecida: "${referralTexto}" → ${entrega.nome}`);
      await iniciarFunilProdutoDirect(senderId, entrega, 'anuncio', text || referralTexto);
      return;
    }
  }

  if (estado?.etapa === 'PRODUTO_ENTREGUE' && ehPerguntaSobreConteudo(textoNormalizado)) {
    const produto = estado?.dados?.produto;
    const respostaConteudo = respostaConteudoProduto(produto);

    if (respostaConteudo) {
      await enviarMensagemDirect(senderId, respostaConteudo);
      await notificarAlberto(
        usuarioDirect,
        `Mensagem:\n${text}\n\nProduto em contexto:\n${produto}\n\nAção:\nrespondi com o conteúdo do produto usando BOT_FUNIL_JSON.`,
        `DIRECT — CONTEÚDO DO PRODUTO ${produto || ''}`,
        { canal: 'Direct', idDirect: senderId, produto, etapa: 'PRODUTO_ENTREGUE', temperatura: 'morno' }
      );

      atualizarEstadoDirect(senderId, { ultimaPergunta: text, ultimaResposta: 'conteudo_produto' });
      return;
    }
  }

  const entregasEncontradas = encontrarEntregas(textoNormalizado);

  if (entregasEncontradas.length > 0) {
    const entregasValidas = entregasEncontradas.filter(e => e.link);

    if (entregasValidas.length === 0) {
      await enviarMensagemDirect(senderId, montarMensagemEscolherMaterial());
      await notificarAlberto(usuarioDirect, text, 'DM COM ENTREGA SEM LINK CONFIGURADO');
      return;
    }

    await iniciarFunilProdutoDirect(senderId, escolherEntregaPrincipal(entregasValidas), 'palavra_chave_direct', text);
    return;
  }

  const decisao = await decidirComIA({ origem: 'direct', texto: text, username: usuarioDirect, senderId, estado });
  await executarDecisaoDirect({ decisao, senderId, username: usuarioDirect, textoOriginal: text });
}

// ================= FUNIL POR BOTÕES =================

async function iniciarFunilProdutoDirect(senderId, entrega, origem, textoOriginal = '') {
  const slug = slugEntrega(entrega);
  setEstadoDirect(senderId, 'FUNIL_EU_QUERO', {
    produto: entrega.nome,
    slug,
    link: entrega.link,
    origem,
    ultimoTexto: textoOriginal,
    resumo: `Funil iniciado para ${entrega.nome}`
  });

  salvarLeadRemarketing({
    canal: 'direct',
    idDirect: senderId,
    usuario: `ig_user_${senderId}`,
    produto: entrega.nome,
    mensagem: textoOriginal,
    status: 'funil_iniciado',
    etapa: 'FUNIL_EU_QUERO',
    temperatura: 'morno',
    origem,
    acaoSugerida: 'Aguardar clique no botão Eu quero.',
    linkSugerido: entrega.link
  });

  await enviarMensagemDirectComQuickReplies(senderId, montarMensagemFunilInicio(entrega), [
    { title: 'Eu quero', payload: montarPayloadFunil('EU_QUERO', slug) }
  ]);
}

async function processarBotaoFunil(senderId, payload, tituloBotao = '') {
  const acao = parsePayloadFunil(payload);
  const entrega = encontrarEntregaPorSlug(acao.slug) || getEntregaDoEstado(senderId);
  const usuarioDirect = `ig_user_${senderId}`;

  if (!acao.stage || !entrega) {
    await enviarMensagemDirect(senderId, 'Não consegui identificar o material. Responda com o nome do material que você quer receber.');
    await notificarAlberto(usuarioDirect, `Payload inválido: ${payload}`, 'DIRECT — PAYLOAD INVÁLIDO');
    return;
  }

  if (acao.stage === 'EU_QUERO') {
    setEstadoDirect(senderId, 'FUNIL_SEGUIDOR', { produto: entrega.nome, slug: acao.slug, link: entrega.link, ultimoBotao: tituloBotao });

    salvarLeadRemarketing({
      canal: 'direct', idDirect: senderId, usuario: usuarioDirect, produto: entrega.nome,
      status: 'clicou_eu_quero', etapa: 'FUNIL_SEGUIDOR', temperatura: 'morno', origem: 'botao'
    });

    await enviarMensagemDirectComQuickReplies(senderId, montarMensagemPerguntaSeguidor(), [
      { title: 'Sim, sou seguidor', payload: montarPayloadFunil('SIM_SEGUIDOR', acao.slug) },
      { title: 'Ainda não sigo', payload: montarPayloadFunil('NAO_SEGUE', acao.slug) }
    ]);
    return;
  }

  if (acao.stage === 'NAO_SEGUE') {
    setEstadoDirect(senderId, 'FUNIL_SEGUIR_PERFIL', { produto: entrega.nome, slug: acao.slug, link: entrega.link, ultimoBotao: tituloBotao });

    salvarLeadRemarketing({
      canal: 'direct', idDirect: senderId, usuario: usuarioDirect, produto: entrega.nome,
      status: 'disse_nao_sigo', etapa: 'FUNIL_SEGUIR_PERFIL', temperatura: 'frio', origem: 'botao',
      acaoSugerida: 'Incentivar a seguir o perfil antes do link.'
    });

    await enviarMensagemDirectComQuickReplies(senderId, montarMensagemSeguirPerfil(), [
      { title: 'Abrir perfil', payload: montarPayloadFunil('ABRIR_PERFIL', acao.slug) },
      { title: 'Já segui', payload: montarPayloadFunil('JA_SEGUI', acao.slug) }
    ]);
    return;
  }

  if (acao.stage === 'ABRIR_PERFIL') {
    setEstadoDirect(senderId, 'FUNIL_SEGUIR_PERFIL', { produto: entrega.nome, slug: acao.slug, link: entrega.link, ultimoBotao: tituloBotao });

    await enviarMensagemDirectComQuickReplies(senderId, `Segue o perfil por aqui:\n\nhttps://instagram.com/albertobri7o\n\nDepois volte aqui e toque no botão abaixo.`, [
      { title: 'Já segui', payload: montarPayloadFunil('JA_SEGUI', acao.slug) }
    ]);
    return;
  }

  if (acao.stage === 'SIM_SEGUIDOR' || acao.stage === 'JA_SEGUI') {
    setEstadoDirect(senderId, 'FUNIL_ENVIAR_LINK', { produto: entrega.nome, slug: acao.slug, link: entrega.link, ultimoBotao: tituloBotao });

    salvarLeadRemarketing({
      canal: 'direct', idDirect: senderId, usuario: usuarioDirect, produto: entrega.nome,
      status: acao.stage === 'SIM_SEGUIDOR' ? 'confirmou_seguidor' : 'confirmou_ja_seguiu',
      etapa: 'FUNIL_ENVIAR_LINK', temperatura: 'quente', origem: 'botao', linkSugerido: entrega.link
    });

    await enviarMensagemDirectComQuickReplies(senderId, montarMensagemConfirmarLink(entrega), [
      { title: 'Enviar link', payload: montarPayloadFunil('ENVIAR_LINK', acao.slug) }
    ]);
    return;
  }

  if (acao.stage === 'ENVIAR_LINK') {
    clearEstadoDirect(senderId);
    guardarEstadoProdutoEntregue(senderId, entrega, 'clique_botao_enviar_link');

    salvarLeadRemarketing({
      canal: 'direct', idDirect: senderId, usuario: usuarioDirect, produto: entrega.nome,
      status: 'checkout_enviado', etapa: 'PRODUTO_ENTREGUE', temperatura: 'quente', origem: 'botao',
      acaoSugerida: 'Acompanhar se comprou. Se não responder, fazer follow-up.', linkSugerido: entrega.link
    });

    await enviarMensagemDirect(senderId, montarMensagemEntrega([entrega]));
    await notificarAlberto(
      usuarioDirect,
      `Checkout enviado após clique no botão.\n\nProduto: ${entrega.nome}\nLink: ${entrega.link}`,
      'DIRECT — CHECKOUT ENVIADO POR BOTÃO',
      {
        canal: 'Direct', idDirect: senderId, produto: entrega.nome, etapa: 'PRODUTO_ENTREGUE',
        status: 'checkout enviado', temperatura: 'quente', linkSugerido: entrega.link,
        acaoSugerida: 'Acompanhar se comprou. Se não responder, fazer follow-up.'
      }
    );
  }
}

async function lidarTextoLivreNoFunil(senderId, text, estado) {
  const usuarioDirect = `ig_user_${senderId}`;
  const etapa = estado?.etapa || '';
  const slug = estado?.dados?.slug || '';
  const entrega = encontrarEntregaPorSlug(slug) || getEntregaDoEstado(senderId);

  salvarLeadRemarketing({
    canal: 'direct', idDirect: senderId, usuario: usuarioDirect, produto: estado?.dados?.produto || '',
    mensagem: text, status: 'texto_livre_no_funil', etapa, temperatura: 'morno', origem: 'texto_livre',
    acaoSugerida: 'Texto livre não avançou o funil. O usuário precisa tocar no botão.'
  });

  await notificarAlberto(
    usuarioDirect,
    `Texto livre recebido no meio do funil:\n${text}\n\nAção:\nNão avancei a etapa. Reforcei o botão para o usuário.`,
    'DIRECT — TEXTO LIVRE NO FUNIL',
    { canal: 'Direct', idDirect: senderId, produto: estado?.dados?.produto || '', etapa, status: 'aguardando botão', temperatura: 'morno' }
  );

  if (!entrega) {
    await enviarMensagemDirect(senderId, 'Para continuar, toque no botão da mensagem anterior.');
    return;
  }

  if (etapa === 'FUNIL_EU_QUERO') {
    await enviarMensagemDirectComQuickReplies(senderId, 'Para continuar, toque no botão abaixo. 👇', [
      { title: 'Eu quero', payload: montarPayloadFunil('EU_QUERO', slug) }
    ]);
    return;
  }

  if (etapa === 'FUNIL_SEGUIDOR') {
    await enviarMensagemDirectComQuickReplies(senderId, 'Para continuar, escolha uma das opções abaixo. 👇', [
      { title: 'Sim, sou seguidor', payload: montarPayloadFunil('SIM_SEGUIDOR', slug) },
      { title: 'Ainda não sigo', payload: montarPayloadFunil('NAO_SEGUE', slug) }
    ]);
    return;
  }

  if (etapa === 'FUNIL_SEGUIR_PERFIL') {
    await enviarMensagemDirectComQuickReplies(senderId, 'Depois de seguir o perfil, toque em “Já segui” para continuar. 👇', [
      { title: 'Abrir perfil', payload: montarPayloadFunil('ABRIR_PERFIL', slug) },
      { title: 'Já segui', payload: montarPayloadFunil('JA_SEGUI', slug) }
    ]);
    return;
  }

  if (etapa === 'FUNIL_ENVIAR_LINK') {
    await enviarMensagemDirectComQuickReplies(senderId, 'Para receber o acesso, toque no botão abaixo. 👇', [
      { title: 'Enviar link', payload: montarPayloadFunil('ENVIAR_LINK', slug) }
    ]);
  }
}

function montarMensagemFunilInicio(entrega) {
  return `👋 Vi que você comentou no post.\n\nEsse material já ajudou muitos seguidores do meu perfil a estudar melhor, trabalhar com mais segurança e ganhar tempo no dia a dia.\n\nTenho materiais pagos e também alguns conteúdos gratuitos de apoio.\n\nToque no botão abaixo para eu te mostrar o caminho certo.`;
}

function montarMensagemPerguntaSeguidor() {
  return `Você já segue meu perfil? 👀\n\nEu libero materiais, dicas práticas e conteúdos de apoio para quem acompanha o @albertobri7o por aqui.\n\nToque em uma opção abaixo:`;
}

function montarMensagemSeguirPerfil() {
  return `Sem problema 😊\n\nAntes de liberar o material, segue meu perfil para acompanhar as próximas dicas de Word, Excel, Office, IA e produtividade:\n\n@albertobri7o\n\nDepois toque no botão abaixo para continuar.`;
}

function montarMensagemConfirmarLink(entrega) {
  if (ehProdutoOffice(entrega)) {
    return `Você comentou sobre Office. 👀\n\nO melhor caminho é o Pack Office VIP, que inclui:\n\n✅ Word\n✅ Excel\n✅ PowerPoint\n✅ Outlook\n\nSeparados, esses 4 materiais sairiam por R$ 79,60.\n\nHoje, no Pack Office VIP, você leva tudo por R$ 39,90.\n\nÉ praticamente R$ 40 de desconto, mas essa oferta já está acabando.\n\nQuer que eu te envie o link de acesso?`;
  }

  const titulo = entrega.tituloDm || entrega.nome || 'material';
  return `Perfeito! 😊\n\nVocê comentou sobre ${titulo}.\n\nQuer que eu te envie agora o link de acesso desse material?`;
}

function ehProdutoOffice(entrega) {
  const texto = normalizar(`${entrega?.nome || ''} ${entrega?.tituloDm || ''} ${(entrega?.palavras || []).join(' ')}`);
  return texto.includes('OFFICE') || texto.includes('OFICE') || texto.includes('POWERPOINT') || texto.includes('OUTLOOK');
}

function montarPayloadFunil(stage, slug) {
  return `FUNIL|${stage}|${slug}`;
}

function parsePayloadFunil(payload = '') {
  const [, stage, slug] = String(payload).split('|');
  return { stage: stage || '', slug: slug || '' };
}

function extrairPayloadBotao(event) {
  return event?.message?.quick_reply?.payload || event?.postback?.payload || '';
}

function slugEntrega(entrega) {
  return normalizar(entrega?.nome || 'material')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

function encontrarEntregaPorSlug(slug) {
  return ENTREGAS.find(e => slugEntrega(e) === slug) || null;
}

function getEntregaDoEstado(senderId) {
  const estado = getEstadoDirect(senderId);
  const slug = estado?.dados?.slug;
  if (slug) return encontrarEntregaPorSlug(slug);
  const produto = estado?.dados?.produto;
  if (!produto) return null;
  const produtoNormalizado = normalizar(produto);
  return ENTREGAS.find(e => normalizar(e.nome) === produtoNormalizado) || null;
}

function escolherEntregaPrincipal(entregas) {
  const comOffice = entregas.find(e => ehProdutoOffice(e));
  return comOffice || entregas[0];
}

// ================= EXECUÇÃO DAS DECISÕES DA IA =================

async function executarDecisaoComentario({ decisao, commentId, username, textoOriginal, senderId }) {
  const resposta = limparResposta(decisao?.resposta);

  if (senderId && decisao?.estado_novo) {
    setEstadoDirect(senderId, decisao.estado_novo, {
      origem: 'comentario', intencao: decisao.intencao, ultimoTexto: textoOriginal,
      resumo: decisao.resumo_estado || decisao.motivo || ''
    });
  }

  if (senderId && decisao?.limpar_estado) clearEstadoDirect(senderId);

  if (decisao?.notificar_alberto) {
    await notificarAlberto(username, montarResumoNotificacao(textoOriginal, decisao), `COMENTÁRIO — ${decisao.intencao || 'IA'}`);
  }

  if (['IGNORAR', 'SPAM'].includes(decisao?.intencao)) return;
  if (!resposta) return;

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
      origem: 'direct', intencao: decisao.intencao, ultimoTexto: textoOriginal,
      resumo: decisao.resumo_estado || decisao.motivo || ''
    });
  }

  if (decisao?.limpar_estado) clearEstadoDirect(senderId);

  if (decisao?.notificar_alberto) {
    await notificarAlberto(username, montarResumoNotificacao(textoOriginal, decisao), `DIRECT — ${decisao.intencao || 'IA'}`);
  }

  if (['IGNORAR', 'SPAM'].includes(decisao?.intencao) && !resposta) return;

  if (!resposta) {
    await enviarMensagemDirect(senderId, montarMensagemFallbackDirect());
    return;
  }

  await enviarMensagemDirect(senderId, resposta);
}

// ================= IA ROTEADORA =================

async function decidirComIA({ origem, texto, username, senderId, estado }) {
  if (!openai) return decisaoFallbackSemIA(texto, estado);

  try {
    const materiaisDisponiveis = ENTREGAS.map(e => ({ nome: e.nome, palavras: e.palavras, tipo: e.tipo, tituloDm: e.tituloDm }));
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

REGRAS:
1. Seja curto, natural, brasileiro e profissional.
2. Não invente preço.
3. Se for venda de material, ajude a escolher o material.
4. Se for consultoria/treinamento/empresa, direcione ao WhatsApp (82) 98186-8684.
5. Não diga que é IA.

Responda APENAS em JSON válido:
{
  "intencao": "INTERESSE",
  "acao": "RESPONDER",
  "resposta": "texto que será enviado ao usuário",
  "estado_novo": null,
  "limpar_estado": false,
  "notificar_alberto": false,
  "motivo": "explicação curta",
  "resumo_estado": "resumo curto",
  "resumo_para_alberto": "resumo do lead",
  "confianca": 0.9
}`;

    const response = await openai.responses.create({ model: OPENAI_MODEL, input: prompt, temperature: 0 });
    const output = response.output_text || '';
    const json = extrairJson(output);
    if (!json?.intencao) return decisaoFallbackSemIA(texto, estado);
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
        intencao: 'MATERIAL', acao: 'RESPONDER', resposta,
        estado_novo: 'PRODUTO_ENTREGUE', limpar_estado: false, notificar_alberto: true,
        motivo: 'Fallback de conteúdo do produto entregue', resumo_estado: estado?.dados?.resumo || '',
        resumo_para_alberto: `Usuário perguntou conteúdo do produto ${estado?.dados?.produto || ''}`, confianca: 0
      };
    }
  }

  return {
    intencao: 'INTERESSE', acao: 'RESPONDER', resposta: montarMensagemFallbackDirect(),
    estado_novo: null, limpar_estado: false, notificar_alberto: false,
    motivo: 'Fallback sem IA', resumo_estado: '', resumo_para_alberto: '', confianca: 0
  };
}

function extrairJson(texto) {
  try {
    return JSON.parse(texto);
  } catch {
    const match = texto.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try { return JSON.parse(match[0]); } catch { return null; }
  }
}

// ================= FLUXO DE ENTREGA FIXA =================

async function fluxoEntregaComentario(commentId, username, comentarioOriginal, entregas, senderId = null) {
  const entregasValidas = entregas.filter(e => e.link);

  if (entregasValidas.length === 0) {
    console.error(`❌ Nenhum link configurado para: ${entregas.map(e => e.nome).join(', ')}`);
    await notificarAlberto(username, `Mensagem:\n${comentarioOriginal}\n\nEntregas encontradas:\n${entregas.map(e => e.nome).join(', ')}`, 'LINK NÃO CONFIGURADO');
    if (RESPONDER_PUBLICO) await responderComentarioSeguro(commentId, `@${username} me chama no direct que eu te envio 📩`);
    return;
  }

  const entrega = escolherEntregaPrincipal(entregasValidas);
  let dmEnviada = false;

  if (ENVIAR_PRIVATE_REPLY) {
    try {
      if (USAR_FUNIL_BOTOES) {
        await enviarPrivateReplyComQuickReplies(commentId, montarMensagemFunilInicio(entrega), [
          { title: 'Eu quero', payload: montarPayloadFunil('EU_QUERO', slugEntrega(entrega)) }
        ]);
      } else {
        await enviarPrivateReply(commentId, montarMensagemEntrega([entrega]));
      }

      dmEnviada = true;
      if (senderId) {
        if (USAR_FUNIL_BOTOES) {
          setEstadoDirect(senderId, 'FUNIL_EU_QUERO', {
            produto: entrega.nome, slug: slugEntrega(entrega), link: entrega.link,
            origem: 'comentario', ultimoTexto: comentarioOriginal
          });
        } else {
          guardarEstadoProdutoEntregue(senderId, entrega, comentarioOriginal);
        }
      }

      salvarLeadRemarketing({
        canal: 'comentario', idDirect: senderId || '', usuario: username,
        perfil: `https://instagram.com/${username}`, produto: entrega.nome, mensagem: comentarioOriginal,
        status: USAR_FUNIL_BOTOES ? 'funil_iniciado_comentario' : 'checkout_enviado_comentario',
        etapa: USAR_FUNIL_BOTOES ? 'FUNIL_EU_QUERO' : 'PRODUTO_ENTREGUE', temperatura: 'morno',
        origem: 'palavra_chave_comentario', linkSugerido: entrega.link
      });

      await notificarAlberto(
        username,
        `Comentário:\n${comentarioOriginal}\n\nProduto identificado:\n${entrega.nome}\n\nAção:\n${USAR_FUNIL_BOTOES ? 'iniciei funil por botões' : 'enviei checkout direto'}.`,
        'COMENTÁRIO — LEAD CAPTURADO',
        {
          canal: 'Comentário', idDirect: senderId || '', produto: entrega.nome,
          etapa: USAR_FUNIL_BOTOES ? 'FUNIL_EU_QUERO' : 'PRODUTO_ENTREGUE',
          status: USAR_FUNIL_BOTOES ? 'funil iniciado' : 'checkout enviado', temperatura: 'morno',
          linkSugerido: entrega.link,
          acaoSugerida: USAR_FUNIL_BOTOES ? 'Aguardar clique no botão Eu quero.' : 'Acompanhar se comprou.'
        }
      );

      console.log(`✅ Funil/entrega enviado para @${username}: ${entrega.nome}`);
    } catch (error) {
      console.error(`❌ Erro ao enviar entrega para @${username}:`, error.message);
      await notificarAlberto(username, `Mensagem:\n${comentarioOriginal}`, `ERRO AO ENVIAR ENTREGA: ${error.message}`);
    }
  }

  if (RESPONDER_PUBLICO) {
    const mensagemPublica = dmEnviada ? montarRespostaPublicaEntrega(username, [entrega]) : `@${username} me chama no direct que eu te envio 📩`;
    await responderComentarioSeguro(commentId, mensagemPublica);
  }
}

// ================= API META =================

async function responderComentario(commentId, mensagem) {
  if (!ACCESS_TOKEN) throw new Error('ACCESS_TOKEN não configurado');
  const url = `https://graph.instagram.com/${GRAPH_VERSION}/${commentId}/replies`;
  const params = new URLSearchParams();
  params.append('message', mensagem);
  const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: params });
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
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
  return enviarMensagemMeta({ recipient: { comment_id: String(commentId) }, message: { text: mensagem } });
}

async function enviarPrivateReplyComQuickReplies(commentId, mensagem, quickReplies = []) {
  try {
    return await enviarMensagemMeta({
      recipient: { comment_id: String(commentId) },
      message: { text: mensagem, quick_replies: montarQuickReplies(quickReplies) }
    });
  } catch (error) {
    console.error('❌ Erro ao enviar private reply com botões. Tentando fallback:', error.message);
    return enviarPrivateReply(commentId, mensagemComBotoesTexto(mensagem, quickReplies));
  }
}

async function enviarMensagemDirect(recipientId, mensagem) {
  return enviarMensagemMeta({ recipient: { id: String(recipientId) }, message: { text: mensagem } });
}

async function enviarMensagemDirectComQuickReplies(recipientId, mensagem, quickReplies = []) {
  try {
    return await enviarMensagemMeta({
      recipient: { id: String(recipientId) },
      message: { text: mensagem, quick_replies: montarQuickReplies(quickReplies) }
    });
  } catch (error) {
    console.error('❌ Erro ao enviar DM com botões. Tentando fallback:', error.message);
    return enviarMensagemDirect(recipientId, mensagemComBotoesTexto(mensagem, quickReplies));
  }
}

async function enviarMensagemMeta(body) {
  if (!IG_ACCESS_TOKEN) throw new Error('IG_ACCESS_TOKEN não configurado');
  if (!IG_USER_ID) throw new Error('IG_USER_ID não configurado');
  const url = `https://graph.instagram.com/${GRAPH_VERSION}/${IG_USER_ID}/messages`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${IG_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
  return response.json();
}

function montarQuickReplies(opcoes = []) {
  return opcoes.map(opcao => ({
    content_type: 'text',
    title: String(opcao.title || '').slice(0, 20),
    payload: String(opcao.payload || '').slice(0, 1000)
  }));
}

function mensagemComBotoesTexto(mensagem, opcoes = []) {
  const botoes = opcoes.map(o => `[${o.title}]`).join('  ');
  return `${mensagem}\n\n${botoes}`.trim();
}

// ================= TELEGRAM / REMARKETING =================

async function notificarAlberto(username, conteudo, tipo, meta = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn(`Telegram não configurado. Notificação não enviada: ${tipo}`);
    return;
  }

  const perfil = String(username).startsWith('ig_user_') ? 'Usuário do Direct' : `https://instagram.com/${username}`;
  const blocoRemarketing = montarBlocoRemarketingTelegram(username, meta);
  const mensagem = `🔔 Instagram Bot — ${tipo}\n\nUsuário: @${username}\n\n${conteudo}\n\nPerfil:\n${perfil}${blocoRemarketing ? '\n\n' + blocoRemarketing : ''}`;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: mensagem })
    });
    if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
    console.log('✅ Alberto notificado no Telegram');
  } catch (error) {
    console.error('❌ Erro ao notificar Alberto:', error.message);
  }
}

function montarBlocoRemarketingTelegram(username, meta = {}) {
  if (!meta || Object.keys(meta).length === 0) return '';
  const linhas = ['---', '📌 Remarketing'];
  if (meta.canal) linhas.push(`Canal: ${meta.canal}`);
  if (meta.idDirect) linhas.push(`ID Direct: ${meta.idDirect}`);
  if (meta.produto) linhas.push(`Produto de interesse: ${meta.produto}`);
  if (meta.etapa) linhas.push(`Etapa: ${meta.etapa}`);
  if (meta.status) linhas.push(`Status: ${meta.status}`);
  if (meta.temperatura) linhas.push(`Temperatura: ${meta.temperatura}`);
  if (meta.acaoSugerida) linhas.push(`Ação sugerida: ${meta.acaoSugerida}`);
  if (meta.linkSugerido) linhas.push(`Link sugerido: ${meta.linkSugerido}`);
  if (String(username || '').startsWith('ig_user_')) {
    linhas.push('Perfil público: não disponível pelo evento do Direct. Use o próprio Direct para remarketing enquanto a janela da Meta permitir.');
  }
  return linhas.join('\n');
}

function salvarLeadRemarketing(lead = {}) {
  try {
    fs.mkdirSync(path.dirname(LEADS_REMARKETING_PATH), { recursive: true });
    fs.appendFileSync(LEADS_REMARKETING_PATH, JSON.stringify({ criadoEm: new Date().toISOString(), ...lead }) + '\n', 'utf8');
  } catch (error) {
    console.warn('⚠️ Não foi possível salvar lead de remarketing:', error.message);
  }
}

function montarResumoNotificacao(textoOriginal, decisao) {
  return `Mensagem:\n${textoOriginal}\n\nIntenção:\n${decisao?.intencao || 'não informada'}\n\nMotivo:\n${decisao?.motivo || 'não informado'}\n\nResumo:\n${decisao?.resumo_para_alberto || 'sem resumo'}\n\nEstado novo:\n${decisao?.estado_novo || 'nenhum'}`;
}

// ================= PRODUTO / FUNIL JSON =================

function ehPerguntaSobreConteudo(textoNormalizado) {
  const termos = ['QUAL E O CONTEUDO', 'CONTEUDO', 'O QUE VEM', 'O QUE TEM', 'QUAIS ASSUNTOS', 'ASSUNTOS', 'TOPICOS', 'EMENTA', 'ABORDA', 'SERVE PARA QUE', 'DETALHES DO MATERIAL', 'SOBRE O QUE'];
  return termos.some(termo => textoNormalizado.includes(normalizar(termo)));
}

function respostaConteudoProduto(produtoNome) {
  if (!produtoNome || !BOT_FUNIL) return null;
  const produtoNormalizado = normalizar(produtoNome);
  const candidatos = [];

  if (BOT_FUNIL.produtos && typeof BOT_FUNIL.produtos === 'object') {
    for (const [chave, valor] of Object.entries(BOT_FUNIL.produtos)) candidatos.push({ chave, valor });
  }

  for (const [chave, valor] of Object.entries(BOT_FUNIL)) {
    if (chave !== 'produtos' && valor && typeof valor === 'object') candidatos.push({ chave, valor });
  }

  for (const candidato of candidatos) {
    const chaveNormalizada = normalizar(candidato.chave);
    const nomeNormalizado = normalizar(candidato.valor?.nome || '');
    const bate = chaveNormalizada === produtoNormalizado || nomeNormalizado === produtoNormalizado || chaveNormalizada.includes(produtoNormalizado) || produtoNormalizado.includes(chaveNormalizada) || nomeNormalizado.includes(produtoNormalizado) || produtoNormalizado.includes(nomeNormalizado);
    if (!bate) continue;
    const resposta = candidato.valor?.resposta_conteudo || candidato.valor?.resposta_sugerida || candidato.valor?.conteudo || candidato.valor?.descricao || candidato.valor?.resposta;
    if (resposta) return String(resposta).trim();
  }
  return null;
}

// ================= ENTREGAS E MENSAGENS =================

function encontrarEntregas(textoNormalizado) {
  const encontradas = [];
  for (const entrega of ENTREGAS) {
    const palavras = Array.isArray(entrega.palavras) ? entrega.palavras : [];
    const bateu = palavras.some(palavra => contemPalavraOuFrase(textoNormalizado, normalizar(palavra)));
    if (bateu) encontradas.push(entrega);
  }
  return encontradas;
}

function contemPalavraOuFrase(texto, termo) {
  if (!termo) return false;
  const termoEscapado = termo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(^|[^A-Z0-9])${termoEscapado}($|[^A-Z0-9])`, 'i');
  return regex.test(texto);
}

function montarMensagemEntrega(entregas) {
  if (entregas.length === 1) {
    const entrega = entregas[0];
    const titulo = entrega.tituloDm || entrega.nome || 'material';
    if (entrega.mensagemDm) {
      return String(entrega.mensagemDm).replaceAll('{link}', entrega.link).replaceAll('{nome}', entrega.nome).replaceAll('{tituloDm}', titulo);
    }
    return `Aqui está o acesso do material ${titulo}:\n\n${entrega.link}\n\nO pagamento é pela Kiwify, via Pix ou cartão.\nO acesso é liberado assim que o pagamento for confirmado.\n\n— @albertobri7o`;
  }

  const lista = entregas.map(entrega => `• ${entrega.nome}: ${entrega.link}`).join('\n');
  return `Oi! 👋\n\nVi que você pediu mais de um material.\n\nAqui estão os links:\n\n${lista}\n\nQualquer dúvida, é só responder este chat.\n\n— @albertobri7o`;
}

function montarRespostaPublicaEntrega(username, entregas) {
  if (entregas.length === 1) {
    const entrega = entregas[0];
    const comentario = entrega.comentario || 'te mandei no direct! 📩';
    return entrega.usarArroba === false ? comentario : `@${username} ${comentario}`;
  }
  return `@${username} te mandei os links no direct! 📩`;
}

function montarMensagemEscolherMaterial() {
  const opcoes = ENTREGAS.map((entrega, index) => `${index + 1}. ${entrega.nome}`).join('\n');
  return `Claro! 👋\n\nMe diga qual material você quer receber:\n\n${opcoes || 'Nenhum material configurado ainda.'}\n\nÉ só responder com o nome de um deles.\n\n— @albertobri7o`;
}

function montarMensagemFallbackDirect() {
  return `Entendi. 👋\n\nPara eu te ajudar melhor, me diga rapidamente o que você procura:\n\n• material\n• consultoria\n• treinamento\n• imersão\n• falar com Alberto\n\n— @albertobri7o`;
}

// ================= ESTADO =================

function guardarEstadoProdutoEntregue(senderId, entrega, origemTexto) {
  setEstadoDirect(senderId, 'PRODUTO_ENTREGUE', {
    produto: entrega.nome, tituloDm: entrega.tituloDm, link: entrega.link, tipo: entrega.tipo,
    ultimoTexto: origemTexto, resumo: `Usuário recebeu o produto ${entrega.nome}`
  });
}

function setEstadoDirect(senderId, etapa, dados = {}) {
  estadosDirect.set(String(senderId), { etapa, dados, atualizadoEm: Date.now() });
  console.log(`🧭 Estado do Direct atualizado para ${senderId}: ${etapa}`);
}

function atualizarEstadoDirect(senderId, novosDados = {}) {
  const estado = getEstadoDirect(senderId);
  if (!estado) return;
  estadosDirect.set(String(senderId), { ...estado, dados: { ...(estado.dados || {}), ...novosDados }, atualizadoEm: Date.now() });
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
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(item => item && typeof item === 'object')
      .map(item => ({
        nome: String(item.nome || '').trim(),
        palavras: Array.isArray(item.palavras) ? item.palavras.map(p => String(p).trim()).filter(Boolean) : [],
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
  const ref = event?.referral || event?.message?.referral || event?.postback?.referral || null;
  if (!ref) return '';
  const ctx = ref.ads_context_data || {};
  return [ref.ref, ctx.ad_title, ctx.title].filter(Boolean).join(' ');
}

function carregarBotFunil(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (error) { console.error('❌ Erro ao ler BOT_FUNIL_JSON:', error.message); return null; }
}

function boolEnv(nome, padrao) {
  const raw = process.env[nome];
  if (raw === undefined || raw === null || raw === '') return padrao;
  return String(raw).toLowerCase() === 'true';
}

// ================= SEGURANÇA / UTIL =================

function assinaturaValida(req) {
  const signature = req.get('x-hub-signature-256');
  if (!signature || !APP_SECRET || !req.rawBody) return false;
  const expectedSignature = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(req.rawBody).digest('hex');
  const signatureBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  if (signatureBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
}

function limparToken(valor = '') {
  return String(valor).trim().replace(/^Bearer\s+/i, '').replace(/^["']|["']$/g, '').replace(/\s/g, '');
}

function normalizar(texto = '') {
  return String(texto).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
}

function limparResposta(valor = '') {
  return String(valor || '').trim();
}

function limparCacheProcessados() {
  const agora = Date.now();
  for (const [commentId, criadoEm] of comentariosProcessados.entries()) {
    if (agora - criadoEm > TEMPO_CACHE_MS) comentariosProcessados.delete(commentId);
  }
  for (const [mid, criadoEm] of mensagensProcessadas.entries()) {
    if (agora - criadoEm > TEMPO_CACHE_MS) mensagensProcessadas.delete(mid);
  }
  for (const [senderId, estado] of estadosDirect.entries()) {
    if (agora - estado.atualizadoEm > TEMPO_ESTADO_DIRECT_MS) estadosDirect.delete(senderId);
  }
}

function mascararToken(token = '') {
  if (!token) return 'VAZIO';
  return `${token.slice(0, 4)}...${token.slice(-4)} (${token.length} chars)`;
}

function validarVariaveis() {
  const variaveis = { VERIFY_TOKEN, APP_SECRET, ACCESS_TOKEN, IG_ACCESS_TOKEN, IG_USER_ID };
  for (const [nome, valor] of Object.entries(variaveis)) {
    if (!valor) console.warn(`⚠️ Variável ausente no Railway: ${nome}`);
  }
  if (!ENTREGAS.length) console.warn('⚠️ Nenhuma entrega carregada. Configure ENTREGAS_JSON no Railway.');
  for (const entrega of ENTREGAS) {
    if (!entrega.link) console.warn(`⚠️ Link ausente para entrega: ${entrega.nome}`);
  }
  if (!OPENAI_API_KEY) console.warn('⚠️ OPENAI_API_KEY ausente. IA ficará desativada.');
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) console.warn('⚠️ Telegram não configurado. Alberto não será notificado.');
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
  console.log(`🔘 FUNIL POR BOTÕES: ${USAR_FUNIL_BOTOES ? '✅' : '❌'}`);
  console.log(`🧠 IA roteadora: ${OPENAI_API_KEY ? '✅' : '❌'}`);
  console.log(`🗂️ BOT_FUNIL_JSON: ${BOT_FUNIL ? '✅' : '❌'}`);
});
