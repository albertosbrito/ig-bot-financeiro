import fs from 'fs';

const file = 'start-universal-quiz-funnel.js';
let src = fs.readFileSync(file, 'utf8');

function apply(find, replace, label) {
  if (src.includes(find)) {
    src = src.replace(find, replace);
    console.log('[precisa-patch] applied:', label);
  } else {
    console.log('[precisa-patch] skip:', label);
  }
}

apply(
  "texto.includes('MAIS INFORMAÇÕES') || texto.includes('COMO FUNCIONA') || texto.includes('DETALHES')",
  "texto.includes('MAIS INFORMAÇÕES') || texto.includes('PRECISA') || texto.includes('COMO FUNCIONA') || texto.includes('DETALHES')",
  'generic trigger'
);

apply(
  "function fluxoLocalDirect({ senderId, textoOriginal, textoNormalizado, estado, event }) {\n  if (estado?.etapa === 'FUNIL_PRODUTO_LOCAL') {",
  "function fluxoLocalDirect({ senderId, textoOriginal, textoNormalizado, estado, event }) {\n  if (String(textoNormalizado || '').includes('PRECISA')) {\n    clearEstadoDirect(senderId);\n    const inicio = iniciarFunilProdutoLocal(null, senderId, 'DIRECT — FUNIL PRECISA', false);\n    return { mensagens: [inicio.mensagem], tipo: inicio.tipo };\n  }\n\n  if (estado?.etapa === 'FUNIL_PRODUTO_LOCAL') {",
  'direct override before state'
);

fs.writeFileSync(file, src, 'utf8');
