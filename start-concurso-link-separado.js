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
  `const BOT_NEGOCIO_CONTEXT = String(process.env.BOT_NEGOCIO_CONTEXT || '').trim();
const CHECKOUT_CONCURSO_URL = String(process.env.CHECKOUT_CONCURSO_URL || 'https://pay.kiwify.com.br/TfqsJLX').trim();
const AMOSTRA_CONCURSO_URL = String(process.env.AMOSTRA_CONCURSO_URL || 'https://drive.google.com/file/d/1APNGWFN-lEzjDIvXYYaHI0nGpQg8cOo5/view?usp=drivesdk').trim();
const CHECKOUT_WORD_URL = String(process.env.CHECKOUT_WORD_URL || 'https://pay.kiwify.com.br/CKv3YRe').trim();
const PRECO_WORD = String(process.env.PRECO_WORD || 'R$ 19,90').trim();`,
  'config'
);

patch(
  `const ENTREGAS = carregarEntregas();`,
  `const ENTREGAS = carregarEntregas().filter(e => {
  const texto = normalizar([e.nome, e.tituloDm, ...(Array.isArray(e.palavras) ? e.palavras : [])].join(' '));
  return !texto.includes('CONCURSO');
});`,
  'entregas'
);

patch(
  `  console.log(\`💬 Comentário recebido de @\${username}: "\${text}"\`);
  console.log(\`🧩 commentId recebido: \${commentId}\`);

  // Regra fixa única: entrega por ENTREGAS_JSON.`,
  `  console.log(\`💬 Comentário recebido de @\${username}: "\${text}"\`);
  console.log(\`🧩 commentId recebido: \${commentId}\`);

  if (ehWord(textoNormalizado)) {
    const resposta = mensagemCompraWord();
    if (ENVIAR_PRIVATE_REPLY) await enviarPrivateReply(commentId, resposta);
    if (RESPONDER_PUBLICO) await responderComentarioSeguro(commentId, \`@\${username} te mandei o acesso da apostila de Word no direct 📩\`);
    await notificarAlberto(username, \`Comentário:\n\${text}\`, 'COMENTARIO — COMPRA WORD');
    return;
  }

  if (ehPerguntaPreco(textoNormalizado)) {
    const resposta = mensagemPrecoConcurso();
    if (ENVIAR_PRIVATE_REPLY) await enviarPrivateReply(commentId, resposta);
    if (RESPONDER_PUBLICO) await responderComentarioSeguro(commentId, \`@\${username} te mandei o preco e o link no direct 📩\`);
    await notificarAlberto(username, \`Comentário:\n\${text}\`, 'COMENTARIO — PRECO CONCURSO');
    return;
  }

  if (ehPedidoAmostraConcurso(textoNormalizado) || ehInteresseConcurso(textoNormalizado)) {
    const resposta = mensagemAmostraConcurso();
    if (ENVIAR_PRIVATE_REPLY) await enviarPrivateReply(commentId, resposta);
    if (RESPONDER_PUBLICO) await responderComentarioSeguro(commentId, \`@\${username} te mandei uma amostra no direct 📩\`);
    await notificarAlberto(username, \`Comentário:\n\${text}\`, 'COMENTARIO — AMOSTRA CONCURSO');
    return;
  }

  if (ehConcurso(textoNormalizado)) {
    const resposta = perguntaConcurso(0, true);
    if (ENVIAR_PRIVATE_REPLY) await enviarPrivateReply(commentId, resposta);
    if (RESPONDER_PUBLICO) await responderComentarioSeguro(commentId, \`@\${username} te mandei no direct 📩\`);
    await notificarAlberto(username, \`Comentário:\n\${text}\`, 'COMENTARIO — QUIZ CONCURSO');
    return;
  }

  // Regra fixa única: entrega por ENTREGAS_JSON.`,
  'comentario'
);

patch(
  `  console.log(\`📩 DM recebida de \${senderId}: "\${text}"\`);
  console.log('🧭 Estado atual do Direct:', estado ? JSON.stringify(estado) : 'SEM_ESTADO');`,
  `  console.log(\`📩 DM recebida de \${senderId}: "\${text}"\`);
  console.log('🧭 Estado atual do Direct:', estado ? JSON.stringify(estado) : 'SEM_ESTADO');

  if (ehWord(textoNormalizado)) {
    clearEstadoDirect(senderId);
    await enviarMensagemDirect(senderId, mensagemCompraWord());
    await notificarAlberto(usuarioDirect, \`Mensagem:\n\${text}\`, 'DIRECT — COMPRA WORD');
    return;
  }

  if (ehPerguntaPreco(textoNormalizado)) {
    clearEstadoDirect(senderId);
    await enviarMensagemDirect(senderId, mensagemPrecoConcurso());
    await notificarAlberto(usuarioDirect, \`Mensagem:\n\${text}\`, 'DIRECT — PRECO CONCURSO');
    return;
  }

  if (ehPedidoAmostraConcurso(textoNormalizado) || ehInteresseConcurso(textoNormalizado)) {
    await enviarMensagemDirect(senderId, mensagemAmostraConcurso());
    await notificarAlberto(usuarioDirect, \`Mensagem:\n\${text}\`, 'DIRECT — AMOSTRA CONCURSO');
    return;
  }`,
  'direct'
);

patch(
  `// ================= EXECUÇÃO DAS DECISÕES DA IA =================`,
  `// ================= REGRAS FIXAS DE OFERTAS =================
function ehConcurso(t) { return String(t || '').includes('CONCURSO'); }
function ehWord(t) {
  const texto = String(t || '');
  return texto === 'WORD' || texto.includes('APOSTILA WORD') || texto.includes('APOSTILA DE WORD') || texto.includes('MATERIAL WORD') || texto.includes('COMPRAR WORD') || texto.includes('QUERO WORD') || texto.includes('LINK WORD') || texto.includes('CHECKOUT WORD');
}
function mensagemCompraWord() {
  return \`Claro. A Apostila de Word está saindo por \${PRECO_WORD}.\n\nPara acessar, use este link 👇\n\${CHECKOUT_WORD_URL}\n\nO acesso é imediato após a confirmação do pagamento.\n\nSe não abrir ao tocar, copie e cole o link no navegador.\`;
}
function ehPerguntaPreco(t) {
  const texto = String(t || '');
  return texto === 'QUANTO' || texto.includes('QUAL E O PRECO') || texto.includes('QUAL O PRECO') || texto.includes('VALOR') || texto.includes('QUANTO CUSTA') || texto.includes('POR QUANTO') || texto.includes('ESTA POR QUANTO') || texto.includes('TA POR QUANTO') || texto.includes('SAI POR QUANTO') || texto.includes('QUANTO SAI') || texto.includes('QUANTO TA') || texto.includes('QUANTO ESTA') || texto.includes('PRECO') || texto.includes('PREÇO');
}
function mensagemPrecoConcurso() {
  return \`Claro. A Apostila Informática para Concurso está por R$ 47.\n\nEla inclui teoria objetiva, pegadinhas, questões comentadas, itens estilo Cebraspe e simulado final com gabarito.\n\nPara acessar, use este link 👇\n\${CHECKOUT_CONCURSO_URL}\n\nO acesso é imediato após a confirmação do pagamento.\`;
}
function ehInteresseConcurso(t) {
  const texto = String(t || '');
  return texto.includes('TENHO INTERESSE') || texto.includes('QUERIA MAIS INFORMACOES') || texto.includes('QUERIA MAIS INFORMAÇÕES') || texto.includes('QUERO MAIS INFORMACOES') || texto.includes('QUERO MAIS INFORMAÇÕES') || texto.includes('MAIS INFORMACOES') || texto.includes('MAIS INFORMAÇÕES');
}
function ehPedidoAmostraConcurso(t) {
  const texto = String(t || '');
  return texto.includes('AMOSTRA') || texto.includes('DEGUSTACAO') || texto.includes('DEGUSTAÇÃO') || texto.includes('EXEMPLO DO MATERIAL') || texto.includes('VER POR DENTRO') || texto.includes('POSSO VER') || texto.includes('QUERO VER') || texto.includes('PREVIA') || texto.includes('PDF DE AMOSTRA');
}
function mensagemAmostraConcurso() {
  return \`Claro. Separei uma amostra gratuita da apostila Informática para Concurso para você ver o estilo do material antes de comprar.\n\nEla mostra resumo, pegadinhas e questões comentadas.\n\nBaixe aqui 👇\n\${AMOSTRA_CONCURSO_URL}\n\nSe fizer sentido para você, depois eu te mando o acesso completo.\`;
}
function perguntaConcurso(i, intro = false) {
  const p = [
    'Você está estudando para qual situação?',
    '',
    '1. Concurso público',
    '2. Processo seletivo',
    '3. Prova próxima',
    '4. Revisão geral',
    '5. Ainda estou começando'
  ].join('\\n');
  return intro ? \`Perfeito. Vou te ajudar a revisar Informática do jeito que cai em concurso. Antes de te mandar o acesso, responde rapidinho:\n\nMas antes, vamos combinar um atalho:\n\nResponda apenas com o número da alternativa que escolher.\n\n\${p}\` : p;
}

// ================= EXECUÇÃO DAS DECISÕES DA IA =================`,
  'helpers'
);

fs.writeFileSync(runtimePath, source, 'utf8');
await import(pathToFileURL(runtimePath).href);
