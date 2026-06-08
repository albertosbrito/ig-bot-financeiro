import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourcePath = path.join(__dirname, 'server.js');
const runtimePath = path.join(__dirname, 'server.runtime.js');

let source = fs.readFileSync(sourcePath, 'utf8');

function replaceOnce(target, replacement, label) {
  if (!source.includes(target)) {
    throw new Error(`Patch não aplicado: trecho não encontrado (${label}).`);
  }
  source = source.replace(target, replacement);
}

replaceOnce(
  "const BOT_NEGOCIO_CONTEXT = String(process.env.BOT_NEGOCIO_CONTEXT || '').trim();",
  `const BOT_NEGOCIO_CONTEXT = String(process.env.BOT_NEGOCIO_CONTEXT || '').trim();

const QUIZ_FUNNEL_BASE_URL = String(
  process.env.QUIZ_FUNNEL_BASE_URL || 'https://ab-concurso-quiz-funnel-production.up.railway.app'
).replace(/\\/$/, '');
const QUIZ_FUNNEL_KEYWORD = normalizar(process.env.QUIZ_FUNNEL_KEYWORD || 'CONCURSO');
// Ativo por padrão. Só desliga se a variável for exatamente false.
const QUIZ_FUNNEL_ATIVO = String(process.env.QUIZ_FUNNEL_ATIVO || 'true').toLowerCase() !== 'false';`,
  'config quiz funnel'
);

replaceOnce(
  `// ================= ENTREGAS =================

const ENTREGAS = carregarEntregas();`,
  `// ================= ENTREGAS =================

const ENTREGAS = carregarEntregas().filter(entrega => {
  const palavras = Array.isArray(entrega.palavras) ? entrega.palavras.map(p => normalizar(p)) : [];
  const nome = normalizar(entrega.nome || '');
  const titulo = normalizar(entrega.tituloDm || '');

  const textoEntrega = [nome, titulo, ...palavras].join(' ');
  const ehEntregaConcurso = textoEntrega.includes('CONCURSO');

  if (QUIZ_FUNNEL_ATIVO && ehEntregaConcurso) {
    console.log('🧪 Entrega fixa CONCURSO removida para priorizar Quiz Funnel.');
    return false;
  }

  return true;
});`,
  'filtra entrega concurso'
);

replaceOnce(
  `  // Regra fixa única: entrega por ENTREGAS_JSON.
  const entregasEncontradas = encontrarEntregas(textoNormalizado);

  if (entregasEncontradas.length > 0) {
    await fluxoEntregaComentario(commentId, username, text, entregasEncontradas, fromId);
    return;
  }`,
  `  // Regra especial: CONCURSO entra no Quiz Funnel Conversacional.
  if (QUIZ_FUNNEL_ATIVO && ehGatilhoQuizConcurso(textoNormalizado)) {
    try {
      const respostaQuiz = await processarQuizFunnelConcurso({
        senderId: fromId || \`comment_\${commentId}\`,
        username,
        text,
        iniciar: true,
        source: 'instagram_comment'
      });

      let privateReplyEnviado = false;

      if (ENVIAR_PRIVATE_REPLY) {
        await enviarPrivateReply(commentId, respostaQuiz);
        privateReplyEnviado = true;
      }

      if (RESPONDER_PUBLICO) {
        const msgPublica = privateReplyEnviado
          ? \`@\${username} te mandei no direct 📩\`
          : \`@\${username} me chama no direct que eu te explico 📩\`;

        await responderComentarioSeguro(commentId, msgPublica);
      }

      await notificarAlberto(
        username,
        \`Comentário:\n\${text}\n\nAção:\nQuiz Funnel CONCURSO iniciado.\`,
        'COMENTÁRIO — QUIZ FUNNEL CONCURSO'
      );

      return;
    } catch (error) {
      console.error('❌ Erro no Quiz Funnel CONCURSO via comentário:', error.message);

      const fallbackQuiz = mensagemInicialQuizConcurso();

      if (ENVIAR_PRIVATE_REPLY) {
        await enviarPrivateReply(commentId, fallbackQuiz);
      }

      if (RESPONDER_PUBLICO) {
        await responderComentarioSeguro(commentId, \`@\${username} te mandei no direct 📩\`);
      }

      await notificarAlberto(username, \`Comentário:\n\${text}\`, \`ERRO QUIZ FUNNEL CONCURSO: \${error.message}\`);
      return;
    }
  }

  // Regra fixa única: entrega por ENTREGAS_JSON.
  const entregasEncontradas = encontrarEntregas(textoNormalizado);

  if (entregasEncontradas.length > 0) {
    await fluxoEntregaComentario(commentId, username, text, entregasEncontradas, fromId);
    return;
  }`,
  'comentario concurso'
);

replaceOnce(
  `  console.log(\`📩 DM recebida de \${senderId}: "\${text}"\`);
  console.log('🧭 Estado atual do Direct:', estado ? JSON.stringify(estado) : 'SEM_ESTADO');

  // 🔎 INVESTIGAÇÃO DE ANÚNCIO: despeja o evento completo da Meta para descobrir`,
  `  console.log(\`📩 DM recebida de \${senderId}: "\${text}"\`);
  console.log('🧭 Estado atual do Direct:', estado ? JSON.stringify(estado) : 'SEM_ESTADO');

  // Regra especial: continua ou inicia o Quiz Funnel CONCURSO no Direct.
  if (QUIZ_FUNNEL_ATIVO && (estado?.etapa === 'QUIZ_FUNNEL_CONCURSO' || ehGatilhoQuizConcurso(textoNormalizado))) {
    try {
      const respostaQuiz = await processarQuizFunnelConcurso({
        senderId,
        username: usuarioDirect,
        text,
        iniciar: estado?.etapa !== 'QUIZ_FUNNEL_CONCURSO',
        source: 'instagram_direct'
      });

      await enviarMensagemDirect(senderId, respostaQuiz);

      await notificarAlberto(
        usuarioDirect,
        \`Mensagem:\n\${text}\n\nAção:\nQuiz Funnel CONCURSO processado.\`,
        'DIRECT — QUIZ FUNNEL CONCURSO'
      );

      return;
    } catch (error) {
      console.error('❌ Erro no Quiz Funnel CONCURSO via Direct:', error.message);

      const fallbackQuiz = mensagemInicialQuizConcurso();
      await enviarMensagemDirect(senderId, fallbackQuiz);
      setEstadoDirect(senderId, 'QUIZ_FUNNEL_CONCURSO', {
        origem: 'fallback_local',
        ultimoTexto: text,
        currentStepId: 'situacao',
        resumo: 'Lead em quiz funnel da apostila de Informática para Concursos'
      });

      await notificarAlberto(usuarioDirect, \`Mensagem:\n\${text}\`, \`ERRO QUIZ FUNNEL CONCURSO: \${error.message}\`);
      return;
    }
  }

  // 🔎 INVESTIGAÇÃO DE ANÚNCIO: despeja o evento completo da Meta para descobrir`,
  'direct concurso'
);

replaceOnce(
  `// ================= EXECUÇÃO DAS DECISÕES DA IA =================`,
  `// ================= QUIZ FUNNEL CONCURSO =================

function ehGatilhoQuizConcurso(textoNormalizado) {
  if (!textoNormalizado || !QUIZ_FUNNEL_KEYWORD) return false;

  const keyword = normalizar(QUIZ_FUNNEL_KEYWORD);
  const texto = String(textoNormalizado || '');

  return texto === keyword || texto.includes(keyword);
}

function mensagemInicialQuizConcurso() {
  return \`Perfeito. Vou te ajudar a revisar Informática do jeito que cai em concurso. Antes de te mandar o acesso, responde rapidinho:

Você está estudando para qual situação?

1. Concurso público
2. Processo seletivo
3. Prova próxima
4. Revisão geral
5. Ainda estou começando\`;
}

async function chamarQuizFunnel(pathname, payload) {
  const url = \`\${QUIZ_FUNNEL_BASE_URL}\${pathname}\`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(\`\${response.status}: \${await response.text()}\`);
  }

  return response.json();
}

async function processarQuizFunnelConcurso({ senderId, username, text, iniciar, source }) {
  const payloadBase = {
    instagramUserId: String(senderId),
    username: String(username || \`ig_user_\${senderId}\`)
  };

  const resultado = iniciar
    ? await chamarQuizFunnel('/funnel/start', {
        ...payloadBase,
        keyword: 'CONCURSO',
        source
      })
    : await chamarQuizFunnel('/funnel/message', {
        ...payloadBase,
        text
      });

  const mensagem = limparResposta(resultado?.message);

  if (!mensagem) {
    throw new Error('Quiz Funnel não retornou mensagem.');
  }

  const status = resultado?.session?.status || '';

  if (status === 'checkout_sent') {
    clearEstadoDirect(senderId);
  } else {
    setEstadoDirect(senderId, 'QUIZ_FUNNEL_CONCURSO', {
      origem: source,
      ultimoTexto: text,
      currentStepId: resultado?.session?.currentStepId || null,
      leadToken: resultado?.session?.leadToken || null,
      resumo: 'Lead em quiz funnel da apostila de Informática para Concursos'
    });
  }

  return mensagem;
}

// ================= EXECUÇÃO DAS DECISÕES DA IA =================`,
  'funcoes quiz funnel'
);

replaceOnce(
  `  if (!BOT_FUNIL) {
    console.warn('⚠️ BOT_FUNIL_JSON ausente ou inválido. Perguntas de conteúdo dependerão só da IA.');
  }`,
  `  if (!BOT_FUNIL) {
    console.warn('⚠️ BOT_FUNIL_JSON ausente ou inválido. Perguntas de conteúdo dependerão só da IA.');
  }

  console.log(\`🧪 QUIZ_FUNNEL_ATIVO: \${QUIZ_FUNNEL_ATIVO ? '✅' : '❌'}\`);
  console.log(\`🧪 QUIZ_FUNNEL_BASE_URL: \${QUIZ_FUNNEL_BASE_URL}\`);
  console.log(\`🧪 QUIZ_FUNNEL_KEYWORD: \${QUIZ_FUNNEL_KEYWORD}\`);`,
  'logs quiz funnel'
);

fs.writeFileSync(runtimePath, source, 'utf8');
await import(pathToFileURL(runtimePath).href);
