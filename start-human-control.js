import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourcePath = path.join(__dirname, 'server.js');
const runtimePath = path.join(__dirname, 'server.human-control.runtime.js');

let source = fs.readFileSync(sourcePath, 'utf8');
let patchOk = true;

function patch(find, replacement, label) {
  if (!source.includes(find)) {
    console.warn(`⚠️ Patch de atendimento humano não aplicado: ${label}`);
    patchOk = false;
    return;
  }
  source = source.replace(find, replacement);
}

patch(
  `const estadosDirect = new Map();`,
  `const estadosDirect = new Map();
const atendimentosHumanos = new Map();`,
  'mapa de atendimento humano'
);

patch(
  `const TEMPO_ATENDIMENTO_HUMANO_MS = Number(process.env.TEMPO_ATENDIMENTO_HUMANO_MS || 1000 * 60 * 60 * 24);`,
  `const TEMPO_ATENDIMENTO_HUMANO_MS = Number(process.env.TEMPO_ATENDIMENTO_HUMANO_MS || 1000 * 60 * 60 * 24);`,
  'tempo atendimento já existe'
);

if (!source.includes('const TEMPO_ATENDIMENTO_HUMANO_MS')) {
  patch(
    `const TEMPO_ESTADO_DIRECT_MS = Number(process.env.TEMPO_ESTADO_DIRECT_MS || 1000 * 60 * 60 * 6);`,
    `const TEMPO_ESTADO_DIRECT_MS = Number(process.env.TEMPO_ESTADO_DIRECT_MS || 1000 * 60 * 60 * 6);
const TEMPO_ATENDIMENTO_HUMANO_MS = Number(process.env.TEMPO_ATENDIMENTO_HUMANO_MS || 1000 * 60 * 60 * 24);`,
    'tempo atendimento humano'
  );
}

patch(
  `  if (message?.is_echo || String(senderId) === String(IG_USER_ID)) {
    console.log('Direct ignorado: echo/próprio bot');
    return;
  }`,
  `  // Comandos enviados por Alberto precisam ser tratados antes de ignorar echoes/mensagens próprias.
  if (text && ehEventoDoOperador(event) && ehComandoAtendimentoHumano(text)) {
    const alvoId = obterAlvoAtendimentoHumano(event);

    if (!alvoId) {
      console.warn('⚠️ Comando de atendimento humano recebido, mas sem usuário alvo válido:', JSON.stringify(event));
      return;
    }

    await executarComandoAtendimentoHumano(alvoId, text);
    return;
  }

  if (message?.is_echo || String(senderId) === String(IG_USER_ID)) {
    console.log('Direct ignorado: echo/próprio bot');
    return;
  }`,
  'detectar comandos assumir/liberar antes de ignorar echo'
);

patch(
  `  console.log('🔎 EVENTO COMPLETO DA META >>>', JSON.stringify(event));

  if (payload && payload.startsWith('FUNIL|')) {`,
  `  console.log('🔎 EVENTO COMPLETO DA META >>>', JSON.stringify(event));

  if (atendimentoHumanoAtivo(senderId)) {
    console.log(\`🙋 Atendimento humano ativo para \${senderId}. Robô não respondeu.\`);

    salvarLeadRemarketing({
      canal: 'direct',
      idDirect: senderId,
      usuario: usuarioDirect,
      mensagem: text || payload,
      status: 'atendimento_humano_ativo',
      etapa: 'ATENDIMENTO_HUMANO',
      temperatura: 'quente',
      origem: 'mensagem_com_robo_pausado',
      acaoSugerida: 'Alberto assumiu esta conversa. Responder manualmente no Instagram.'
    });

    await notificarAlberto(
      usuarioDirect,
      \`Mensagem recebida com atendimento humano ativo:\n\${text || payload}\n\nAção:\nRobô não respondeu porque Alberto assumiu esta conversa.\`,
      'DIRECT — ATENDIMENTO HUMANO ATIVO',
      {
        canal: 'Direct',
        idDirect: senderId,
        etapa: 'ATENDIMENTO_HUMANO',
        status: 'robô pausado',
        temperatura: 'quente',
        acaoSugerida: 'Responder manualmente no Instagram. O robô está pausado nesta conversa.'
      }
    );
    return;
  }

  if (payload && payload.startsWith('FUNIL|')) {`,
  'silenciar conversa assumida'
);

patch(
  `// ================= FUNIL POR BOTÕES =================`,
  `// ================= ATENDIMENTO HUMANO =================

function ehComandoAtendimentoHumano(texto = '') {
  const t = normalizar(texto).replace(/[^A-Z0-9 ]/g, '').trim();
  return t === 'ASSUMIR' || t === 'LIBERAR';
}

function tipoComandoAtendimentoHumano(texto = '') {
  const t = normalizar(texto).replace(/[^A-Z0-9 ]/g, '').trim();
  if (t === 'ASSUMIR') return 'assumir';
  if (t === 'LIBERAR') return 'liberar';
  return '';
}

function ehEventoDoOperador(event) {
  const sender = String(event?.sender?.id || '');
  return Boolean(event?.message?.is_echo) || sender === String(IG_USER_ID) || sender === String(PAGE_ID);
}

function obterAlvoAtendimentoHumano(event) {
  const candidatos = [
    event?.recipient?.id,
    event?.message?.recipient?.id,
    event?.postback?.recipient?.id,
    event?.sender?.id
  ].map(v => String(v || '')).filter(Boolean);

  return candidatos.find(id => id !== String(IG_USER_ID) && id !== String(PAGE_ID)) || '';
}

async function executarComandoAtendimentoHumano(senderId, texto) {
  const comando = tipoComandoAtendimentoHumano(texto);
  const usuarioDirect = \`ig_user_\${senderId}\`;

  if (comando === 'assumir') {
    setAtendimentoHumano(senderId, { comando: texto, operador: IG_USERNAME || 'alberto', ativadoEm: new Date().toISOString() });
    clearEstadoDirect(senderId);

    salvarLeadRemarketing({
      canal: 'direct',
      idDirect: senderId,
      usuario: usuarioDirect,
      mensagem: texto,
      status: 'atendimento_humano_assumido',
      etapa: 'ATENDIMENTO_HUMANO',
      temperatura: 'quente',
      origem: 'comando_operador',
      acaoSugerida: 'Robô pausado. Alberto assumiu a conversa manualmente.'
    });

    await notificarAlberto(
      usuarioDirect,
      'Comando recebido: assumir.\n\nAção:\nRobô pausado nesta conversa. Alberto assumiu o atendimento manual.',
      'ATENDIMENTO HUMANO — ASSUMIDO',
      {
        canal: 'Direct',
        idDirect: senderId,
        etapa: 'ATENDIMENTO_HUMANO',
        status: 'robô pausado',
        temperatura: 'quente',
        acaoSugerida: 'Responder manualmente no Instagram. O robô está pausado nesta conversa.'
      }
    );
    return;
  }

  if (comando === 'liberar') {
    clearAtendimentoHumano(senderId);
    clearEstadoDirect(senderId);

    salvarLeadRemarketing({
      canal: 'direct',
      idDirect: senderId,
      usuario: usuarioDirect,
      mensagem: texto,
      status: 'atendimento_humano_liberado',
      etapa: 'ROBO_ATIVO',
      temperatura: 'morno',
      origem: 'comando_operador',
      acaoSugerida: 'Robô liberado. Próxima mensagem do seguidor volta ao fluxo automático.'
    });

    await notificarAlberto(
      usuarioDirect,
      'Comando recebido: liberar.\n\nAção:\nRobô reativado nesta conversa.',
      'ATENDIMENTO HUMANO — LIBERADO',
      {
        canal: 'Direct',
        idDirect: senderId,
        etapa: 'ROBO_ATIVO',
        status: 'robô ativo',
        temperatura: 'morno',
        acaoSugerida: 'Robô liberado. Próxima mensagem do seguidor volta ao fluxo automático.'
      }
    );
  }
}

function setAtendimentoHumano(senderId, dados = {}) {
  atendimentosHumanos.set(String(senderId), { dados, atualizadoEm: Date.now() });
  console.log(\`🙋 Atendimento humano ativado para \${senderId}\`);
}

function clearAtendimentoHumano(senderId) {
  atendimentosHumanos.delete(String(senderId));
  console.log(\`🤖 Atendimento automático reativado para \${senderId}\`);
}

function atendimentoHumanoAtivo(senderId) {
  const estado = atendimentosHumanos.get(String(senderId));
  if (!estado) return false;

  if (Date.now() - estado.atualizadoEm > TEMPO_ATENDIMENTO_HUMANO_MS) {
    atendimentosHumanos.delete(String(senderId));
    return false;
  }

  return true;
}

// ================= FUNIL POR BOTÕES =================`,
  'helpers atendimento humano'
);

if (patchOk) {
  fs.writeFileSync(runtimePath, source, 'utf8');
  console.log('✅ Camada de atendimento humano aplicada: assumir. / liberar. ativos');
  await import(pathToFileURL(runtimePath).href);
} else {
  console.warn('⚠️ Camada de atendimento humano não foi aplicada. Subindo server.js original para evitar crash.');
  await import(pathToFileURL(sourcePath).href);
}
