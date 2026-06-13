import fs from 'fs';

const file = 'start-universal-quiz-funnel.js';
let src = fs.readFileSync(file, 'utf8');

const find = "texto.includes('MAIS INFORMAÇÕES') || texto.includes('COMO FUNCIONA') || texto.includes('DETALHES')";
const replace = "texto.includes('MAIS INFORMAÇÕES') || texto.includes('PRECISA') || texto.includes('COMO FUNCIONA') || texto.includes('DETALHES')";

if (src.includes(find)) {
  src = src.replace(find, replace);
  console.log('[precisa-patch] applied');
} else {
  console.log('[precisa-patch] skip');
}

fs.writeFileSync(file, src, 'utf8');
