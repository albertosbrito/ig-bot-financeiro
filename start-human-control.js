import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourcePath = path.join(__dirname, 'server.js');
const runtimePath = path.join(__dirname, 'server.human-control.runtime.js');

let source = fs.readFileSync(sourcePath, 'utf8');

function patch(find, replacement, label) {
  if (!source.includes(find)) throw new Error(`Patch nao aplicado: ${label}`);
  source = source.replace(find, replacement);
}

// Imports e caminhos de armazenamento simples.
patch(
  `import crypto from 'crypto';
import OpenAI from 'openai';`,
  `import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);`,
  'imports fs/path'
);

patch(
  `const estadosDirect = new Map();`,
  `const estadosDirect = new Map();
const ATENDIMENTO_HUMANO_PATH = process.env.ATENDIMENTO_HUMANO_PATH || path.join(__dirname, 'data', 'atendimento-humano.json');
const LEADS_REMARKETING_PATH = process.env.LEADS_REMARKETING_PATH || path.join(__dirname, 'data', 'leads-remarketing.ndjson');
const atendimentosHumanos = carregarAtendimentosHumanos();`,
  'estado humano e leads'
);

// Comandos do operador precisam ser lidos antes de ignorar echoes/mensagens do proprio perfil.
patch(
  `  if (message?.is_echo || String(senderId) === String(IG_USER_ID)) {
    console.log('Direct ignorado: echo/próprio bot');
    return;
  }

  if (!text) {`,
  `  if (text && ehComandoOperadorAtendimento(text) && ehEventoDoOperador(event)) {
    const alvoAtendimento = obterAlvoAtendimentoHumano(event);

    if (!alvoAtendimento) {
      console.warn('⚠️ Comando de atendimento humano recebido, mas nao foi possivel identificar o usuario alvo.');
      return;
    }

    await executarComandoOperadorAtendimento(alvoAtendimento, text, event);
    return;
  }

  if (message?.is_echo || String(senderId) === String(IG_USER_ID)) {
    console.log('Direct ignorado: echo/próprio bot');
    return;
  }

  if (!text) {`,
  'comandos assumir liberar antes do echo'
);

// Se Alberto assumiu a conversa, o robo silencia e apenas registra/notifica.
patch(
  `  const estado = getEstadoDirect(senderId);

  console.log(\`📩 DM recebida de \${senderId}: "\${text}"\`);`,
  `  const estado = getEstadoDirect(senderId);

  if (atendimentoHumanoAtivo(senderId)) {
    const usuarioDirectHumano = \`ig_user_\${senderId}\`;
    const atendimento = atendimentosHumanos.get(String(senderId));
    console.log(\`🙋 Atendimento humano ativo para \${senderId}. Robo nao respondeu.\`);

    salvarLeadRemarketing({
      canal: 'direct',
      idDirect: senderId,
      usuario: usuarioDirectHumano,
      mensagem: text,
      status: 'atendimento_humano_ativo',
      etapa: 'ATENDIMENTO_HUMANO',
      temperatura: 'quente',
      acaoSugerida: 'Alberto ja assumiu esta conversa. Responder manualmente no Instagram.',
      origem: 'mensagem_com_robo_pausado'
    });

    await notificarAlberto(
      usuarioDirectHumano,
      \`Mensagem recebida com atendimento humano ativo:\n\${text}\n\nAção:\nRobô não respondeu porque Alberto assumiu esta conversa.\`,
      'DIRECT — ATENDIMENTO HUMANO ATIVO',
      {
        canal: 'Direct',
        idDirect: senderId,
        etapa: 'ATENDIMENTO_HUMANO',
        temperatura: 'quente',
        acaoSugerida: 'Responder manualmente no Instagram. Robô está pausado nesta conversa.',
        status: 'robô pausado',
        observacao: atendimento?.dados?.motivo || 'assumido por Alberto'
      }
    );
    return;
  }

  console.log(\`📩 DM recebida de \${senderId}: "\${text}"\`);`,
  'silenciar atendimento humano'
);

// Log/lead quando a entrega veio por anuncio.
patch(
  `      await notificarAlberto(
        usuarioDirect,
        \`Veio do anúncio: \${referralTexto}\nMensagem: \${text}\`,
        'DM — ENTREGA POR ANÚNCIO'
      );`,
  `      salvarLeadRemarketing({
        canal: 'direct',
        idDirect: senderId,
        usuario: usuarioDirect,
        produto: entregasAnuncio[0].nome,
        mensagem: text,
        status: 'checkout_enviado_anuncio',
        etapa: 'PRODUTO_ENTREGUE',
        temperatura: 'quente',
        acaoSugerida: 'Acompanhar se respondeu/comprou. Se necessário, fazer follow-up manual.',
        linkSugerido: entregasAnuncio[0].link,
        origem: referralTexto
      });
      await notificarAlberto(
        usuarioDirect,
        \`Veio do anúncio: \${referralTexto}\nMensagem: \${text}\`,
        'DM — ENTREGA POR ANÚNCIO',
        {
          canal: 'Direct',
          idDirect: senderId,
          produto: entregasAnuncio[0].nome,
          etapa: 'PRODUTO_ENTREGUE',
          temperatura: 'quente',
          acaoSugerida: 'Acompanhar se respondeu/comprou. Se necessário, fazer follow-up manual.',
          linkSugerido: entregasAnuncio[0].link,
          status: 'checkout enviado por anúncio'
        }
      );`,
  'remarketing anuncio'
);

// Log/lead quando o Direct recebe palavra-chave e envia checkout.
patch(
  `    await notificarAlberto(
      usuarioDirect,
      \`Mensagem:
\${text}

Entrega enviada:
\${entregasValidas.map(e => e.nome).join(', ')}\`,
      \`DM — ENTREGA ENVIADA\`
    );`,
  `    const nomesEntregasDirect = entregasValidas.map(e => e.nome).join(', ');
    const linksEntregasDirect = entregasValidas.map(e => e.link).filter(Boolean).join(' | ');

    salvarLeadRemarketing({
      canal: 'direct',
      idDirect: senderId,
      usuario: usuarioDirect,
      produto: nomesEntregasDirect,
      mensagem: text,
      status: 'checkout_enviado_direct',
      etapa: entregasValidas.length === 1 ? 'PRODUTO_ENTREGUE' : 'MULTIPLAS_ENTREGAS',
      temperatura: 'quente',
      acaoSugerida: 'Acompanhar se respondeu/comprou. Se necessário, fazer follow-up manual.',
      linkSugerido: linksEntregasDirect,
      origem: 'palavra_chave_direct'
    });

    await notificarAlberto(
      usuarioDirect,
      \`Mensagem:
\${text}

Entrega enviada:
\${nomesEntregasDirect}\`,
      \`DM — ENTREGA ENVIADA\`,
      {
        canal: 'Direct',
        idDirect: senderId,
        produto: nomesEntregasDirect,
        etapa: entregasValidas.length === 1 ? 'PRODUTO_ENTREGUE' : 'MULTIPLAS_ENTREGAS',
        temperatura: 'quente',
        acaoSugerida: 'Acompanhar se respondeu/comprou. Se necessário, fazer follow-up manual.',
        linkSugerido: linksEntregasDirect,
        status: 'checkout enviado'
      }
    );`,
  'remarketing direct checkout'
);

// Comentarios tambem viram lead de remarketing quando o checkout/private reply e enviado.
patch(
  `      console.log(\`✅ Entrega enviada para @\${username}: \${entregasValidas.map(e => e.nome).join(', ')}\`);`,
  `      const nomesEntregasComentario = entregasValidas.map(e => e.nome).join(', ');
      const linksEntregasComentario = entregasValidas.map(e => e.link).filter(Boolean).join(' | ');
      console.log(\`✅ Entrega enviada para @\${username}: \${nomesEntregasComentario}\`);

      salvarLeadRemarketing({
        canal: 'comentario',
        idDirect: senderId || '',
        usuario: username,
        perfil: \`https://instagram.com/\${username}\`,
        produto: nomesEntregasComentario,
        mensagem: comentarioOriginal,
        status: 'checkout_enviado_comentario',
        etapa: entregasValidas.length === 1 ? 'PRODUTO_ENTREGUE' : 'MULTIPLAS_ENTREGAS',
        temperatura: 'quente',
        acaoSugerida: 'Acompanhar pelo Instagram/Telegram se respondeu ou comprou.',
        linkSugerido: linksEntregasComentario,
        origem: 'palavra_chave_comentario'
      });

      await notificarAlberto(
        username,
        \`Comentário:\n\${comentarioOriginal}\n\nEntrega enviada:\n\${nomesEntregasComentario}\`,
        'COMENTARIO — CHECKOUT ENVIADO',
        {
          canal: 'Comentário',
          idDirect: senderId || '',
          produto: nomesEntregasComentario,
          etapa: entregasValidas.length === 1 ? 'PRODUTO_ENTREGUE' : 'MULTIPLAS_ENTREGAS',
          temperatura: 'quente',
          acaoSugerida: 'Acompanhar pelo Instagram/Telegram se respondeu ou comprou.',
          linkSugerido: linksEntregasComentario,
          status: 'checkout enviado'
        }
      );`,
  'remarketing comentario checkout'
);

// Telegram agora aceita metadados comerciais sem quebrar chamadas antigas.
patch(
  `async function notificarAlberto(username, conteudo, tipo) {`,
  `async function notificarAlberto(username, conteudo, tipo, meta = {}) {`,
  'assinatura telegram meta'
);

patch(
  `  const mensagem = \`🔔 Instagram Bot — \${tipo}

Usuário: @\${username}

\${conteudo}

Perfil:
\${perfil}\`;`,
  `  const blocoRemarketing = montarBlocoRemarketingTelegram(username, meta);

  const mensagem = \`🔔 Instagram Bot — \${tipo}

Usuário: @\${username}

\${conteudo}

Perfil:
\${perfil}\${blocoRemarketing ? '\\n\\n' + blocoRemarketing : ''}\`;`,
  'telegram bloco remarketing'
);

// Helpers novos: comandos assumir/liberar, atendimento humano e base simples de leads.
patch(
  `// ================= CONFIG PARSERS =================`,
  `// ================= ATENDIMENTO HUMANO / REMARKETING =================

function ehComandoOperadorAtendimento(texto = '') {
  const t = normalizar(texto).replace(/[^A-Z ]/g, '').trim();
  return t === 'ASSUMIR' || t === 'LIBERAR';
}

function tipoComandoOperadorAtendimento(texto = '') {
  const t = normalizar(texto).replace(/[^A-Z ]/g, '').trim();
  if (t === 'ASSUMIR') return 'assumir';
  if (t === 'LIBERAR') return 'liberar';
  return '';
}

function ehEventoDoOperador(event) {
  const senderId = String(event?.sender?.id || '');
  const isEcho = Boolean(event?.message?.is_echo);
  return isEcho || senderId === String(IG_USER_ID) || senderId === String(PAGE_ID);
}

function obterAlvoAtendimentoHumano(event) {
  const candidatos = [
    event?.recipient?.id,
    event?.message?.recipient?.id,
    event?.sender?.id
  ].map(v => String(v || '')).filter(Boolean);

  return candidatos.find(id => id !== String(IG_USER_ID) && id !== String(PAGE_ID)) || '';
}

async function executarComandoOperadorAtendimento(senderId, texto, event) {
  const comando = tipoComandoOperadorAtendimento(texto);
  const usuarioDirect = \`ig_user_\${senderId}\`;

  if (comando === 'assumir') {
    setAtendimentoHumano(senderId, {
      motivo: 'Alberto enviou o comando assumir.',
      comando: texto,
      operador: IG_USERNAME || 'alberto',
      ativadoEm: new Date().toISOString()
    });

    salvarLeadRemarketing({
      canal: 'direct',
      idDirect: senderId,
      usuario: usuarioDirect,
      mensagem: texto,
      status: 'atendimento_humano_assumido',
      etapa: 'ATENDIMENTO_HUMANO',
      temperatura: 'quente',
      acaoSugerida: 'Robô pausado. Alberto assumiu a conversa manualmente.',
      origem: 'comando_operador'
    });

    await notificarAlberto(
      usuarioDirect,
      'Comando recebido: assumir.\n\nAção:\nRobô pausado nesta conversa. Alberto assumiu o atendimento manual.',
      'ATENDIMENTO HUMANO — ASSUMIDO',
      {
        canal: 'Direct',
        idDirect: senderId,
        etapa: 'ATENDIMENTO_HUMANO',
        temperatura: 'quente',
        acaoSugerida: 'Responder manualmente no Instagram. Robô está pausado nesta conversa.',
        status: 'robô pausado'
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
      acaoSugerida: 'Robô liberado. Próxima mensagem do seguidor volta ao fluxo automático.',
      origem: 'comando_operador'
    });

    await notificarAlberto(
      usuarioDirect,
      'Comando recebido: liberar.\n\nAção:\nRobô reativado nesta conversa.',
      'ATENDIMENTO HUMANO — LIBERADO',
      {
        canal: 'Direct',
        idDirect: senderId,
        etapa: 'ROBO_ATIVO',
        temperatura: 'morno',
        acaoSugerida: 'Robô liberado. Próxima mensagem do seguidor volta ao fluxo automático.',
        status: 'robô ativo'
      }
    );
  }
}

function atendimentoHumanoAtivo(senderId) {
  return atendimentosHumanos.has(String(senderId));
}

function setAtendimentoHumano(senderId, dados = {}) {
  atendimentosHumanos.set(String(senderId), {
    dados,
    atualizadoEm: Date.now()
  });
  persistirAtendimentosHumanos();
  console.log(\`🙋 Atendimento humano ativado para \${senderId}\`);
}

function clearAtendimentoHumano(senderId) {
  atendimentosHumanos.delete(String(senderId));
  persistirAtendimentosHumanos();
  console.log(\`🤖 Atendimento automático reativado para \${senderId}\`);
}

function carregarAtendimentosHumanos() {
  try {
    if (!fs.existsSync(ATENDIMENTO_HUMANO_PATH)) return new Map();
    const parsed = JSON.parse(fs.readFileSync(ATENDIMENTO_HUMANO_PATH, 'utf8'));
    return new Map(Object.entries(parsed || {}));
  } catch (error) {
    console.warn('⚠️ Não foi possível carregar atendimento humano:', error.message);
    return new Map();
  }
}

function persistirAtendimentosHumanos() {
  try {
    fs.mkdirSync(path.dirname(ATENDIMENTO_HUMANO_PATH), { recursive: true });
    fs.writeFileSync(ATENDIMENTO_HUMANO_PATH, JSON.stringify(Object.fromEntries(atendimentosHumanos), null, 2), 'utf8');
  } catch (error) {
    console.warn('⚠️ Não foi possível persistir atendimento humano:', error.message);
  }
}

function salvarLeadRemarketing(lead = {}) {
  try {
    fs.mkdirSync(path.dirname(LEADS_REMARKETING_PATH), { recursive: true });
    const registro = {
      criadoEm: new Date().toISOString(),
      ...lead
    };
    fs.appendFileSync(LEADS_REMARKETING_PATH, JSON.stringify(registro) + '\\n', 'utf8');
  } catch (error) {
    console.warn('⚠️ Não foi possível salvar lead de remarketing:', error.message);
  }
}

function montarBlocoRemarketingTelegram(username, meta = {}) {
  if (!meta || Object.keys(meta).length === 0) return '';

  const linhas = [];
  linhas.push('---');
  linhas.push('📌 Remarketing');

  if (meta.canal) linhas.push(\`Canal: \${meta.canal}\`);
  if (meta.idDirect) linhas.push(\`ID Direct: \${meta.idDirect}\`);
  if (meta.produto) linhas.push(\`Produto de interesse: \${meta.produto}\`);
  if (meta.etapa) linhas.push(\`Etapa: \${meta.etapa}\`);
  if (meta.status) linhas.push(\`Status: \${meta.status}\`);
  if (meta.temperatura) linhas.push(\`Temperatura: \${meta.temperatura}\`);
  if (meta.acaoSugerida) linhas.push(\`Ação sugerida: \${meta.acaoSugerida}\`);
  if (meta.linkSugerido) linhas.push(\`Link sugerido: \${meta.linkSugerido}\`);
  if (meta.observacao) linhas.push(\`Observação: \${meta.observacao}\`);

  if (String(username || '').startsWith('ig_user_')) {
    linhas.push('Perfil público: não disponível pelo evento do Direct. Use o próprio Direct para remarketing enquanto a janela da Meta permitir.');
  }

  return linhas.join('\\n');
}

// ================= CONFIG PARSERS =================`,
  'helpers atendimento humano remarketing'
);

fs.writeFileSync(runtimePath, source, 'utf8');
await import(pathToFileURL(runtimePath).href);
