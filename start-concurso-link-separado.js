import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourcePath = path.join(__dirname, 'server.js');
const runtimePath = path.join(__dirname, 'server.runtime.js');

let source = fs.readFileSync(sourcePath, 'utf8');

function patch(find, replacement, label) {
  if (!source.includes(find)) throw new Error(`Patch nao aplicado: ${label}`);
  source = source.replace(find, replacement);
}

patch(
  "const BOT_NEGOCIO_CONTEXT = String(process.env.BOT_NEGOCIO_CONTEXT || '').trim();",
  `const PRECO_PROMO = String(process.env.PRECO_PROMO || 'R$ 19,90').trim();
const PRECO_WORD = String(process.env.PRECO_WORD || PRECO_PROMO).trim();
const CHECKOUT_CONCURSO_URL = String(process.env.CHECKOUT_CONCURSO_URL || 'https://pay.kiwify.com.br/TfqsJLX').trim();
const CHECKOUT_WORD_URL = String(process.env.CHECKOUT_WORD_URL || 'https://pay.kiwify.com.br/CKv3YRe').trim();
const AMOSTRA_CONCURSO_URL = String(process.env.AMOSTRA_CONCURSO_URL || 'https://drive.google.com/file/d/1APNGWFN-lEzjDIvXYYaHI0nGpQg8cOo5/view?usp=drivesdk').trim();
let BOT_NEGOCIO_CONTEXT = String(process.env.BOT_NEGOCIO_CONTEXT || '').trim();
BOT_NEGOCIO_CONTEXT = BOT_NEGOCIO_CONTEXT
  .replace(/Word\s*[:—-]\s*cortesia\s*\((grátis|gratis)\)/gi, \`Word — \${PRECO_WORD}\`)
  .replace(/Planilha Financeira\s*[:—-]\s*cortesia\s*\((grátis|gratis)\)/gi, \`Planilha Financeira — \${PRECO_PROMO}\`)
  .replace(/Informática para Concurso\s*[:—-]\s*R\$\s*47/gi, \`Informática para Concurso — \${PRECO_PROMO}\`)
  .replace(/Excel \(Kit Excel Básico\)\s*[:—-]\s*R\$\s*37/gi, \`Excel (Kit Excel Básico) — \${PRECO_PROMO}\`)
  .replace(/Internet 2\.0\s*[:—-]\s*R\$\s*37/gi, \`Internet 2.0 — \${PRECO_PROMO}\`);`,
  'config oferta'
);

patch(
  `  console.log(\`💬 Comentário recebido de @\${username}: "\${text}"\`);
  console.log(\`🧩 commentId recebido: \${commentId}\`);

  // Regra fixa única: entrega por ENTREGAS_JSON.`,
  `  console.log(\`💬 Comentário recebido de @\${username}: "\${text}"\`);
  console.log(\`🧩 commentId recebido: \${commentId}\`);

  if (ehWordLocal(textoNormalizado)) {
    const resposta = mensagemCompraWordLocal();
    if (ENVIAR_PRIVATE_REPLY) await enviarPrivateReply(commentId, resposta);
    if (RESPONDER_PUBLICO) await responderComentarioSeguro(commentId, \`@\${username} te mandei o acesso da apostila de Word no direct 📩\`);
    await notificarAlberto(username, \`Comentário:\n\${text}\`, 'COMENTARIO — WORD');
    return;
  }

  if (ehPerguntaPrecoLocal(textoNormalizado)) {
    const resposta = mensagemPrecoTodosLocal();
    if (ENVIAR_PRIVATE_REPLY) await enviarPrivateReply(commentId, resposta);
    if (RESPONDER_PUBLICO) await responderComentarioSeguro(commentId, \`@\${username} te mandei os valores no direct 📩\`);
    await notificarAlberto(username, \`Comentário:\n\${text}\`, 'COMENTARIO — PRECO');
    return;
  }

  if (ehPedidoAmostraConcursoLocal(textoNormalizado) || ehInteresseGenericoLocal(textoNormalizado)) {
    const resposta = mensagemAmostraConcursoLocal();
    if (ENVIAR_PRIVATE_REPLY) await enviarPrivateReply(commentId, resposta);
    if (RESPONDER_PUBLICO) await responderComentarioSeguro(commentId, \`@\${username} te mandei uma amostra no direct 📩\`);
    await notificarAlberto(username, \`Comentário:\n\${text}\`, 'COMENTARIO — AMOSTRA');
    return;
  }

  if (ehConcursoLocal(textoNormalizado)) {
    if (fromId) setEstadoDirect(fromId, 'QUIZ_CONCURSO_LOCAL', { i: 0, ans: [] });
    const resposta = perguntaConcursoLocal(0, true);
    if (ENVIAR_PRIVATE_REPLY) await enviarPrivateReply(commentId, resposta);
    if (RESPONDER_PUBLICO) await responderComentarioSeguro(commentId, \`@\${username} te mandei no direct 📩\`);
    await notificarAlberto(username, \`Comentário:\n\${text}\`, 'COMENTARIO — QUIZ CONCURSO');
    return;
  }

  // Regra fixa única: entrega por ENTREGAS_JSON.`,
  'comentario regras locais'
);

patch(
  `  console.log(\`📩 DM recebida de \${senderId}: "\${text}"\`);
  console.log('🧭 Estado atual do Direct:', estado ? JSON.stringify(estado) : 'SEM_ESTADO');

  // 🔎 INVESTIGAÇÃO DE ANÚNCIO: despeja o evento completo da Meta para descobrir`,
  `  console.log(\`📩 DM recebida de \${senderId}: "\${text}"\`);
  console.log('🧭 Estado atual do Direct:', estado ? JSON.stringify(estado) : 'SEM_ESTADO');

  if (ehWordLocal(textoNormalizado)) {
    clearEstadoDirect(senderId);
    await enviarMensagemDirect(senderId, mensagemCompraWordLocal());
    await notificarAlberto(usuarioDirect, \`Mensagem:\n\${text}\`, 'DIRECT — WORD');
    return;
  }

  if (ehPerguntaPrecoLocal(textoNormalizado)) {
    clearEstadoDirect(senderId);
    await enviarMensagemDirect(senderId, mensagemPrecoTodosLocal());
    await notificarAlberto(usuarioDirect, \`Mensagem:\n\${text}\`, 'DIRECT — PRECO');
    return;
  }

  if (ehPedidoAmostraConcursoLocal(textoNormalizado) || ehInteresseGenericoLocal(textoNormalizado)) {
    clearEstadoDirect(senderId);
    await enviarMensagemDirect(senderId, mensagemAmostraConcursoLocal());
    await notificarAlberto(usuarioDirect, \`Mensagem:\n\${text}\`, 'DIRECT — AMOSTRA');
    return;
  }

  if (estado?.etapa === 'QUIZ_CONCURSO_LOCAL' || ehRespostaNumericaQuizLocal(textoNormalizado)) {
    const respostas = responderQuizConcursoLocal(senderId, text, estado);
    for (const msg of respostas) await enviarMensagemDirect(senderId, msg);
    await notificarAlberto(usuarioDirect, \`Mensagem:\n\${text}\`, 'DIRECT — QUIZ CONCURSO');
    return;
  }

  if (ehConcursoLocal(textoNormalizado)) {
    setEstadoDirect(senderId, 'QUIZ_CONCURSO_LOCAL', { i: 0, ans: [] });
    await enviarMensagemDirect(senderId, perguntaConcursoLocal(0, true));
    await notificarAlberto(usuarioDirect, \`Mensagem:\n\${text}\`, 'DIRECT — QUIZ CONCURSO');
    return;
  }

  // 🔎 INVESTIGAÇÃO DE ANÚNCIO: despeja o evento completo da Meta para descobrir`,
  'direct regras locais'
);

patch(
  `// ================= EXECUÇÃO DAS DECISÕES DA IA =================`,
  `// ================= REGRAS LOCAIS DE OFERTA / QUIZ =================
const QUIZ_CONCURSO_LOCAL = [
  ['Você está estudando para qual situação?', ['Concurso público', 'Processo seletivo', 'Prova próxima', 'Revisão geral', 'Ainda estou começando']],
  ['Você sabe qual é a banca da sua prova?', ['Cebraspe', 'FGV', 'FCC', 'IBFC', 'Vunesp', 'Ainda não sei']],
  ['Em Informática, o que mais te atrapalha hoje?', ['Fundamentos, hardware e software', 'Windows, arquivos e atalhos', 'Word, Excel, PowerPoint e LibreOffice', 'Internet, Web, navegadores e e-mail', 'Segurança, backup, nuvem e redes', 'LGPD, privacidade digital e Inteligência Artificial', 'Questões com pegadinha e estilo Cebraspe']],
  ['Como você avalia seu nível em Informática para prova?', ['Muito fraco', 'Básico', 'Intermediário', 'Sei um pouco, mas erro pegadinhas', 'Só preciso revisar']],
  ['Sua prova está próxima?', ['Sim, tenho pouco tempo', 'Tenho algumas semanas', 'Ainda não saiu a data', 'Estou estudando com calma', 'Quero deixar o material salvo']]
];

function ehConcursoLocal(t) { return String(t || '').includes('CONCURSO'); }
function ehRespostaNumericaQuizLocal(t) { return /^[1-7]$/.test(String(t || '').replace(/[^0-9]/g, '')); }
function ehWordLocal(t) {
  const texto = String(t || '');
  return texto === 'WORD' || texto.includes('APOSTILA WORD') || texto.includes('APOSTILA DE WORD') || texto.includes('QUERO WORD') || texto.includes('COMPRAR WORD') || texto.includes('LINK WORD') || texto.includes('CHECKOUT WORD');
}
function ehPerguntaPrecoLocal(t) {
  const texto = String(t || '');
  return texto.includes('QUANTO') || texto.includes('PRECO') || texto.includes('PREÇO') || texto.includes('VALOR') || texto.includes('CUSTA') || texto.includes('POR QUANTO');
}
function ehPedidoAmostraConcursoLocal(t) {
  const texto = String(t || '');
  return texto.includes('AMOSTRA') || texto.includes('PREVIA') || texto.includes('PRÉVIA') || texto.includes('VER POR DENTRO') || texto.includes('POSSO VER') || texto.includes('QUERO VER') || texto.includes('EXEMPLO DO MATERIAL');
}
function ehInteresseGenericoLocal(t) {
  const texto = String(t || '');
  return texto.includes('TENHO INTERESSE') || texto.includes('QUERIA MAIS INFORMACOES') || texto.includes('QUERIA MAIS INFORMAÇÕES') || texto.includes('QUERO MAIS INFORMACOES') || texto.includes('QUERO MAIS INFORMAÇÕES') || texto.includes('MAIS INFORMACOES') || texto.includes('MAIS INFORMAÇÕES');
}
function mensagemPrecoTodosLocal() {
  return \`Claro! 😊\n\nOferta especial de Dia dos Namorados: todos os materiais estão por \${PRECO_PROMO}.\n\nTemos:\n• Word — \${PRECO_WORD}\n• Excel (Kit Excel Básico) — \${PRECO_PROMO}\n• Internet 2.0 — \${PRECO_PROMO}\n• Informática para Concurso — \${PRECO_PROMO}\n• Planilha Financeira — \${PRECO_PROMO}\n\nMe responde com o nome do material que você quer que eu te envie o acesso.\`;
}
function mensagemCompraWordLocal() {
  return \`Claro. A Apostila de Word está por \${PRECO_WORD}.\n\nPara acessar, use este link 👇\n\${CHECKOUT_WORD_URL}\n\nO acesso é imediato após a confirmação do pagamento.\`;
}
function mensagemAmostraConcursoLocal() {
  return \`Claro. Separei uma amostra gratuita da apostila Informática para Concurso para você ver o estilo do material antes de comprar.\n\nEla mostra resumo, pegadinhas e questões comentadas.\n\nBaixe aqui 👇\n\${AMOSTRA_CONCURSO_URL}\n\nSe fizer sentido para você, depois eu te mando o acesso completo.\`;
}
function perguntaConcursoLocal(i, intro = false) {
  const etapa = QUIZ_CONCURSO_LOCAL[i];
  const opcoes = etapa[1].map((x, idx) => \`\${idx + 1}. \${x}\`).join('\\n');
  const pergunta = \`\${etapa[0]}\\n\\n\${opcoes}\`;
  return intro
    ? \`Perfeito. Vou te ajudar a revisar Informática do jeito que cai em concurso. Antes de te mandar o acesso, responde rapidinho:\n\nMas antes, vamos combinar um atalho:\n\nResponda apenas com o número da alternativa que escolher.\n\n\${pergunta}\`
    : pergunta;
}
function responderQuizConcursoLocal(senderId, text, estadoAtual) {
  const ids = ['situacao', 'banca', 'dificuldade', 'nivel', 'urgencia'];
  const numero = Number(String(text || '').replace(/[^0-9]/g, ''));
  const estadoQuiz = estadoAtual?.etapa === 'QUIZ_CONCURSO_LOCAL'
    ? estadoAtual.dados
    : { i: 0, ans: [] };
  const i = Number.isInteger(estadoQuiz?.i) ? estadoQuiz.i : 0;
  const etapa = QUIZ_CONCURSO_LOCAL[i] || QUIZ_CONCURSO_LOCAL[0];
  if (!Number.isInteger(numero) || numero < 1 || numero > etapa[1].length) {
    setEstadoDirect(senderId, 'QUIZ_CONCURSO_LOCAL', estadoQuiz);
    return ['Responda apenas com o número da alternativa, por favor.'];
  }
  const ans = Array.isArray(estadoQuiz?.ans) ? [...estadoQuiz.ans] : [];
  ans.push({ id: ids[i], pergunta: etapa[0], resposta: etapa[1][numero - 1] });
  const next = i + 1;
  if (next < QUIZ_CONCURSO_LOCAL.length) {
    setEstadoDirect(senderId, 'QUIZ_CONCURSO_LOCAL', { i: next, ans });
    return [perguntaConcursoLocal(next, false)];
  }
  clearEstadoDirect(senderId);
  const dificuldade = ans.find(a => a.id === 'dificuldade')?.resposta || 'Informática para concursos';
  return [
    \`Pelo que você respondeu, seu ponto de atenção agora é: \${dificuldade}.\n\nA apostila Informática para Concurso foi feita para revisar o que mais cai em prova, com teoria objetiva, pegadinhas, questões comentadas, itens estilo Cebraspe e simulado final com gabarito.\n\nOferta especial de Dia dos Namorados: hoje ela está por \${PRECO_PROMO}.\`,
    \`Acesse aqui 👇\n\${CHECKOUT_CONCURSO_URL}\n\nO acesso é imediato após a confirmação do pagamento.\`
  ];
}

// ================= EXECUÇÃO DAS DECISÕES DA IA =================`,
  'helpers locais'
);

fs.writeFileSync(runtimePath, source, 'utf8');
await import(pathToFileURL(runtimePath).href);
