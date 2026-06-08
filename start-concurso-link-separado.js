import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourcePath = path.join(__dirname, 'server.js');
const runtimePath = path.join(__dirname, 'server.runtime.js');

let source = fs.readFileSync(sourcePath, 'utf8');

function replaceOnce(target, replacement, label) {
  if (!source.includes(target)) throw new Error(`Patch não aplicado: ${label}`);
  source = source.replace(target, replacement);
}

replaceOnce(
  "const BOT_NEGOCIO_CONTEXT = String(process.env.BOT_NEGOCIO_CONTEXT || '').trim();",
  `const BOT_NEGOCIO_CONTEXT = String(process.env.BOT_NEGOCIO_CONTEXT || '').trim();
const CHECKOUT_CONCURSO_URL = String(process.env.CHECKOUT_CONCURSO_URL || 'https://pay.kiwify.com.br/TfqsJLX').trim();`,
  'config concurso local'
);

replaceOnce(
  `// ================= ENTREGAS =================

const ENTREGAS = carregarEntregas();`,
  `// ================= ENTREGAS =================

const ENTREGAS = carregarEntregas().filter(e => {
  const texto = normalizar([e.nome, e.tituloDm, ...(Array.isArray(e.palavras) ? e.palavras : [])].join(' '));
  return !texto.includes('CONCURSO');
});`,
  'remove entrega concurso'
);

replaceOnce(
  `  // Regra fixa única: entrega por ENTREGAS_JSON.
  const entregasEncontradas = encontrarEntregas(textoNormalizado);

  if (entregasEncontradas.length > 0) {
    await fluxoEntregaComentario(commentId, username, text, entregasEncontradas, fromId);
    return;
  }`,
  `  if (ehConcurso(textoNormalizado)) {
    const sender = fromId || \`comment_\${commentId}\`;
    const resposta = quizConcurso(sender, text, true);
    if (ENVIAR_PRIVATE_REPLY) await enviarPrivateReply(commentId, Array.isArray(resposta) ? resposta[0] : resposta);
    if (RESPONDER_PUBLICO) await responderComentarioSeguro(commentId, \`@\${username} te mandei no direct 📩\`);
    await notificarAlberto(username, \`Comentário:\n\${text}\`, 'COMENTÁRIO — QUIZ CONCURSO LOCAL');
    return;
  }

  // Regra fixa única: entrega por ENTREGAS_JSON.
  const entregasEncontradas = encontrarEntregas(textoNormalizado);

  if (entregasEncontradas.length > 0) {
    await fluxoEntregaComentario(commentId, username, text, entregasEncontradas, fromId);
    return;
  }`,
  'comentario concurso local'
);

replaceOnce(
  `  console.log(\`📩 DM recebida de \${senderId}: "\${text}"\`);
  console.log('🧭 Estado atual do Direct:', estado ? JSON.stringify(estado) : 'SEM_ESTADO');

  // 🔎 INVESTIGAÇÃO DE ANÚNCIO: despeja o evento completo da Meta para descobrir`,
  `  console.log(\`📩 DM recebida de \${senderId}: "\${text}"\`);
  console.log('🧭 Estado atual do Direct:', estado ? JSON.stringify(estado) : 'SEM_ESTADO');

  if (estado?.etapa === 'QUIZ_CONCURSO_LOCAL' || ehConcurso(textoNormalizado)) {
    const resposta = quizConcurso(senderId, text, estado?.etapa !== 'QUIZ_CONCURSO_LOCAL');
    const mensagens = Array.isArray(resposta) ? resposta : [resposta];
    for (const mensagem of mensagens) {
      await enviarMensagemDirect(senderId, mensagem);
    }
    await notificarAlberto(usuarioDirect, \`Mensagem:\n\${text}\`, 'DIRECT — QUIZ CONCURSO LOCAL');
    return;
  }

  // 🔎 INVESTIGAÇÃO DE ANÚNCIO: despeja o evento completo da Meta para descobrir`,
  'direct concurso local'
);

replaceOnce(
  `// ================= EXECUÇÃO DAS DECISÕES DA IA =================`,
  `// ================= QUIZ CONCURSO LOCAL =================
const QUIZ_CONCURSO = [
  ['Você está estudando para qual situação?', ['Concurso público', 'Processo seletivo', 'Prova próxima', 'Revisão geral', 'Ainda estou começando']],
  ['Você sabe qual é a banca da sua prova?', ['Cebraspe', 'FGV', 'FCC', 'IBFC', 'Vunesp', 'Ainda não sei']],
  ['Em Informática, o que mais te atrapalha hoje?', ['Fundamentos, hardware e software', 'Windows, arquivos e atalhos', 'Word, Excel, PowerPoint e LibreOffice', 'Internet, Web, navegadores e e-mail', 'Segurança, backup, nuvem e redes', 'LGPD, privacidade digital e Inteligência Artificial', 'Questões com pegadinha e estilo Cebraspe']],
  ['Como você avalia seu nível em Informática para prova?', ['Muito fraco', 'Básico', 'Intermediário', 'Sei um pouco, mas erro pegadinhas', 'Só preciso revisar']],
  ['Sua prova está próxima?', ['Sim, tenho pouco tempo', 'Tenho algumas semanas', 'Ainda não saiu a data', 'Estou estudando com calma', 'Quero deixar o material salvo']]
];
function ehConcurso(t) { return String(t || '').includes('CONCURSO'); }
function perguntaConcurso(i, intro=false) {
  const s = QUIZ_CONCURSO[i];
  const op = s[1].map((x, n) => \`\${n + 1}. \${x}\`).join('\\n');
  const p = \`\${s[0]}\\n\\n\${op}\`;
  return intro ? \`Perfeito. Vou te ajudar a revisar Informática do jeito que cai em concurso. Antes de te mandar o acesso, responde rapidinho:\\n\\n\${p}\` : p;
}
function respostaOpcao(text, opts) {
  const n = Number(String(text || '').trim());
  return Number.isInteger(n) && n >= 1 && n <= opts.length ? opts[n - 1] : String(text || '').trim();
}
function ofertaConcurso(ans) {
  const m = Object.fromEntries((ans || []).map(a => [a.id, a.resposta]));
  const texto = \`Pelo que você respondeu, seu maior risco não é falta de esforço. É estudar Informática como teoria e chegar na prova sem perceber as pegadinhas.\\n\\nSeu ponto de atenção agora: \${m.dificuldade || 'Informática para concursos'}.\\n\\nA apostila Informática para Concurso aborda os principais assuntos que mais caem em prova: fundamentos, hardware, Windows, Internet, e-mail, segurança, Word, Excel, PowerPoint, LibreOffice, nuvem, redes, backup, LGPD, IA, atalhos, pegadinhas, questões comentadas, itens Cebraspe e simulado final com gabarito.\\n\\nEla custava R$ 97, mas como é lançamento, você vai pagar R$ 47.\`;
  const link = \`Acesse aqui 👇\\n\${CHECKOUT_CONCURSO_URL}\\n\\nSe não abrir ao tocar, copie e cole no navegador.\`;
  return [texto, link];
}
function quizConcurso(senderId, text, iniciar) {
  const ids = ['situacao', 'banca', 'dificuldade', 'nivel', 'urgencia'];
  if (iniciar) {
    setEstadoDirect(senderId, 'QUIZ_CONCURSO_LOCAL', { i: 0, ans: [] });
    return perguntaConcurso(0, true);
  }
  const st = getEstadoDirect(senderId)?.dados || { i: 0, ans: [] };
  const i = Number.isInteger(st.i) ? st.i : 0;
  const step = QUIZ_CONCURSO[i];
  const ans = Array.isArray(st.ans) ? [...st.ans] : [];
  ans.push({ id: ids[i], pergunta: step[0], resposta: respostaOpcao(text, step[1]) });
  const next = i + 1;
  if (next < QUIZ_CONCURSO.length) {
    setEstadoDirect(senderId, 'QUIZ_CONCURSO_LOCAL', { i: next, ans });
    return perguntaConcurso(next, false);
  }
  clearEstadoDirect(senderId);
  return ofertaConcurso(ans);
}

// ================= EXECUÇÃO DAS DECISÕES DA IA =================`,
  'funcoes concurso local'
);

fs.writeFileSync(runtimePath, source, 'utf8');
await import(pathToFileURL(runtimePath).href);
