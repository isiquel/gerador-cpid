export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Método não permitido. Use POST."
    });
  }

  try {
    const apiKey =
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.API_KEY_GEMINI ||
      "";

    if (!apiKey) {
      return res.status(500).json({
        ok: false,
        error:
          "Chave da API Gemini não encontrada. Configure GEMINI_API_KEY nas variáveis da Vercel."
      });
    }

    const body = typeof req.body === "string" ? safeJsonParse(req.body) : (req.body || {});
    const data = normalizeInput(body);

    const prompt = buildMasterPrompt(data);

    const rawText = await callGemini({
      apiKey,
      prompt
    });

    const html = extractHtml(rawText) || buildFallbackHtml(rawText, data);

    return res.status(200).json({
      ok: true,
      html: cleanHtml(html),
      rawText
    });
  } catch (error) {
    console.error("Erro em /api/gerar:", error);

    return res.status(500).json({
      ok: false,
      error:
        error?.message ||
        "Erro interno ao gerar material."
    });
  }
}

/* =========================
   NORMALIZAÇÃO
========================= */

function normalizeInput(input = {}) {
  const get = (...keys) => {
    for (const key of keys) {
      if (input[key] !== undefined && input[key] !== null) {
        return String(input[key]).trim();
      }
    }
    return "";
  };

  const quantidadeLicoesRaw = get(
    "quantidadeLicoes",
    "qtdLicoes",
    "licoes",
    "quantidade_lições"
  );

  const quantidadeLicoes = Math.max(
    1,
    Math.min(12, parseInt(quantidadeLicoesRaw || "4", 10) || 4)
  );

  return {
    tipoMaterial: get("tipoMaterial", "tipo", "material", "tipo_de_material"),
    versaoRevista: get("versaoRevista", "versao", "versão"),
    traducao: get("traducao", "traducaoBiblica", "tradução"),
    titulo: get("titulo", "title"),
    subtitulo: get("subtitulo", "subtitle"),
    textoBase: get("textoBase", "textobase", "textoBiblicoBase", "texto_biblico"),
    temaPrincipal: get("temaPrincipal", "tema", "prompt", "descricao", "descrição"),
    publicoAlvo: get("publicoAlvo", "publico", "público"),
    autor: get("autor", "autorComentariasta", "comentarista"),
    editora: get("editora", "ministerio", "ministério"),
    profundidade: get("profundidade"),
    estiloVisual: get("estiloVisual", "estilo"),
    capa: get("capa"),
    tomMaterial: get("tomMaterial", "tom"),
    quantidadeLicoes,
    gerarPromptAutomatico: get("gerarPromptAutomatico"),
    codigoAcesso: get("codigoAcesso")
  };
}

/* =========================
   CHAMADA GEMINI
========================= */

async function callGemini({ apiKey, prompt }) {
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const payload = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: prompt
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.75,
      topP: 0.95,
      maxOutputTokens: 65535
    }
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      data?.error?.message ||
      `Gemini respondeu com status ${response.status}.`;
    throw new Error(message);
  }

  const text = extractGeminiText(data);

  if (!text || !text.trim()) {
    throw new Error("A API devolveu uma resposta vazia.");
  }

  return text.trim();
}

function extractGeminiText(data) {
  if (!data) return "";

  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  const parts = [];

  for (const candidate of candidates) {
    const contentParts = candidate?.content?.parts || [];
    for (const part of contentParts) {
      if (typeof part?.text === "string") {
        parts.push(part.text);
      }
    }
  }

  return parts.join("\n").trim();
}

/* =========================
   PROMPTS
========================= */

function buildMasterPrompt(data) {
  const tipo = (data.tipoMaterial || "").toLowerCase();

  if (tipo.includes("revista")) {
    if ((data.versaoRevista || "").toLowerCase().includes("professor")) {
      return buildRevistaProfessorPrompt(data);
    }
    return buildRevistaAlunoPrompt(data);
  }

  if (tipo.includes("livro")) {
    return buildLivroCristaoPrompt(data);
  }

  if (tipo.includes("e-book") || tipo.includes("ebook")) {
    return buildEbookCristaoPrompt(data);
  }

  if (tipo.includes("serm")) {
    return buildSermaoPrompt(data);
  }

  if (tipo.includes("devoc")) {
    return buildDevocionalPrompt(data);
  }

  if (tipo.includes("curso")) {
    return buildCursoPrompt(data);
  }

  if (tipo.includes("estudo")) {
    return buildEstudoBiblicoPrompt(data);
  }

  return buildPromptGenerico(data);
}

function commonContext(data) {
  return `
DADOS DO MATERIAL:
- Tipo de material: ${fallback(data.tipoMaterial, "Material cristão")}
- Versão: ${fallback(data.versaoRevista, "Não informada")}
- Título: ${fallback(data.titulo, "Sem título")}
- Subtítulo: ${fallback(data.subtitulo, "Sem subtítulo")}
- Texto bíblico base: ${fallback(data.textoBase, "Não informado")}
- Tema principal / instrução adicional do usuário: ${fallback(data.temaPrincipal, "Não informado")}
- Público-alvo: ${fallback(data.publicoAlvo, "Não informado")}
- Autor / comentarista: ${fallback(data.autor, "Não informado")}
- Editora / ministério: ${fallback(data.editora, "Não informado")}
- Tradução bíblica padrão: ${fallback(data.traducao, "King James Fiel 1611")}
- Profundidade desejada: ${fallback(data.profundidade, "Profunda")}
- Estilo visual: ${fallback(data.estiloVisual, "Colorido")}
- Capa: ${fallback(data.capa, "Com capa")}
- Tom do material: ${fallback(data.tomMaterial, "Bíblico, didático e pastoral")}
`;
}

function buildRevistaProfessorPrompt(data) {
  const qtd = data.quantidadeLicoes || 4;

  return `
Você é um redator editorial cristão sênior, especialista em Escola Bíblica Dominical, Bibliologia, doutrina pentecostal clássica e produção de material didático para professores.

Sua tarefa é gerar uma REVISTA MENSAL DE ESCOLA BÍBLICA DOMINICAL, VERSÃO DO PROFESSOR, para classe adulta, em HTML, muito bem organizada, bonita, rica e com conteúdo real.

${commonContext(data)}

REGRAS GERAIS IMPORTANTES:
1. Gere SOMENTE HTML, sem markdown, sem crases, sem explicações fora do HTML.
2. O HTML deve ser um fragmento pronto para ser inserido dentro de uma área de conteúdo.
3. Use estrutura clara com <section>, <article>, <div>, <h1>, <h2>, <h3>, <p>, <ul>, <ol>, <blockquote>.
4. Não escreva nada em inglês.
5. Não escreva rótulos internos, nomes de campos técnicos, placeholders ou palavras soltas.
6. Não deixe só títulos sem conteúdo.
7. Não produza material raso, genérico ou repetitivo.
8. Produza conteúdo argumentativo, prazeroso de ler, com começo, meio e fim.
9. As referências bíblicas devem aparecer:
   - nos cabeçalhos dos tópicos quando necessário;
   - nos subtópicos;
   - e também ao longo dos parágrafos, embasando as afirmações.
10. Use como tradução padrão a ${fallback(data.traducao, "King James Fiel 1611")} quando precisar escrever textos bíblicos por extenso.
11. Se citar obra de apoio, cite materiais reais e seguros. Se não tiver certeza da página exata, não invente paginação.
12. A revista precisa ser pronta para professor, com tom pastoral, didático, reverente, bíblico e doutrinário.
13. Cada lição deve começar claramente, bem no alto, como uma nova unidade bem definida.
14. A capa frontal e a contracapa devem existir.
15. A capa frontal NÃO pode ser aquela capa simples repetitiva com ícone genérico. Ela precisa ser mais viva, editorial e temática.
16. Não incluir símbolo do Gemini em nenhuma parte.
17. Gere capas visualmente fortes usando HTML + CSS inline + SVG inline quando necessário, de forma temática, editorial e elegante.
18. O tema da capa deve seguir o conteúdo do material. Se o tema for Bibliologia/Bíblia, trabalhar visualmente elementos como Bíblia aberta, pergaminhos, manuscritos, luz, verdade, estudo, reverência e atmosfera editorial.
19. Depois da capa frontal, antes da Lição 1, inclua uma APRESENTAÇÃO AO PROFESSOR, explicando a proposta da revista, panorama do mês, encorajamento, sugestões de preparo e orientação geral das quatro lições.
20. Ao final de toda a revista, inclua uma CONTRACAPA elegante e harmoniosa.
21. Não copiar CPAD. Apenas inspirar-se em acabamento editorial bonito.
22. A revista deve conter ${qtd} lições.
23. O tema central e todas as instruções do usuário devem ser obedecidos.

ESTRUTURA OBRIGATÓRIA DA REVISTA:
A. Capa frontal
B. Apresentação ao professor
C. Panorama geral do mês / da revista
D. ${qtd} lições completas
E. Contracapa

A CAPA FRONTAL DEVE TER:
- aspecto de revista de EBD realmente bonita;
- título da revista;
- subtítulo;
- indicação “Revista mensal de Escola Bíblica Dominical”;
- indicação “Revista do Professor”;
- autor/comentarista;
- editora/ministério;
- composição visual rica, elegante, com ilustração/sensação editorial relacionada ao tema;
- não deixar a capa vazia nem simples demais.

A APRESENTAÇÃO AO PROFESSOR DEVE TER:
- saudação pastoral ao professor;
- palavra de encorajamento;
- visão geral do que será estudado neste mês;
- importância do estudo do tema;
- como o professor pode se preparar;
- orientação para oração, leitura prévia e aplicação em sala;
- sugestões práticas e espirituais.

CADA LIÇÃO DEVE CONTER, NESTA ORDEM:
1. Título da lição
2. Subtítulo
3. Texto áureo (com o texto escrito por extenso)
4. Verdade prática
5. Leitura bíblica em classe (com os textos escritos por extenso)
6. Objetivos da lição
7. Palavra ao professor
8. Panorama da lição
9. Introdução
10. Três tópicos principais
11. Cada tópico principal com:
   - título;
   - referência bíblica de cabeçalho;
   - desenvolvimento argumentativo;
   - três subtópicos
12. Cada subtópico com:
   - título;
   - referência bíblica;
   - conteúdo real, explicado e aplicado;
   - referências cruzadas integradas ao texto
13. Aplicação para a vida
14. Conclusão
15. Auxílio bibliológico ou auxílio doutrinário (quadro)
16. Subsídio histórico
17. Atenção, professor: cuidado na interpretação
18. Apoio doutrinário
19. Para aprofundamento
20. Orientações para o professor
21. Revisando o conteúdo (perguntas e respostas)

ORDEM OBRIGATÓRIA NO FIM DE CADA LIÇÃO:
- Aplicação para a vida
- Conclusão
- Auxílio bibliológico ou doutrinário
- Subsídio histórico
- Atenção, professor
- Apoio doutrinário
- Para aprofundamento
- Orientações para o professor
- Revisando o conteúdo

REGRAS IMPORTANTES SOBRE REFERÊNCIAS:
- Não concentrar todas as referências em um único bloco solto.
- Integrar referências bíblicas dentro dos argumentos.
- O tópico e os subtópicos precisam ter base bíblica clara.
- Citar referências cruzadas relevantes ao longo da explicação.
- Na seção “Para aprofundamento”, indicar materiais reais, por exemplo:
  Bíblia de Estudo Pentecostal, Bíblia de Estudo Plenitude, Bíblia de Estudo de Genebra, Manual Bíblico de Halley, Introdução Bíblica de Norman Geisler e William Nix, Teologia Sistemática Pentecostal, Teologia Sistemática de Norman Geisler, Comentário Bíblico Beacon, Comentário Bíblico Moody, Dicionário Bíblico Wycliffe, Dicionário Bíblico Baker, etc.

REGRAS IMPORTANTES SOBRE O AUXÍLIO BIBLIOLÓGICO:
- Criar um quadro especial de auxílio com título bonito.
- O conteúdo deve realmente ajudar o professor.
- Pode citar obra doutrinária, comentário, introdução bíblica, dicionário bíblico ou teologia sistemática.
- Use autores reais e obras reais.
- Não inventar referência exata se não tiver certeza.

REGRAS IMPORTANTES SOBRE O HTML:
- Gere HTML limpo.
- Crie classes úteis, como:
  material-root, cover-front, cover-back, teacher-opening, magazine-overview, lesson, box, box-blue, box-gold, auxilio, revisando, professor-note, etc.
- Pode incluir um bloco <style> no começo do fragmento com o CSS essencial do material.
- O HTML precisa ficar bonito e organizado mesmo dentro de uma área de conteúdo.
- Cada lição deve estar separada visualmente.

REGRAS IMPORTANTES SOBRE A CAPA:
- A capa frontal deve ser profissional, viva e bonita.
- A contracapa deve combinar com a capa frontal.
- Trabalhar acabamento visual editorial.
- Variar conforme o tema.
- Se o tema for sobre Bíblia/Bibliologia, a capa pode trabalhar mesa de estudo, Bíblia aberta, luz dourada, manuscritos, pergaminhos, brilho suave, atmosfera reverente e editorial.
- Não fazer capa repetitiva e sem vida.

TEMA E INSTRUÇÕES ESPECIAIS DO USUÁRIO:
${fallback(data.temaPrincipal, "Não informado.")}

AGORA GERE O HTML COMPLETO DA REVISTA DO PROFESSOR.
`;
}

function buildRevistaAlunoPrompt(data) {
  const qtd = data.quantidadeLicoes || 4;

  return `
Você é um redator editorial cristão sênior. Gere uma REVISTA MENSAL DE ESCOLA BÍBLICA DOMINICAL, VERSÃO DO ALUNO, para classe adulta, em HTML.

${commonContext(data)}

REGRAS:
- Gere SOMENTE HTML.
- Não use inglês.
- Produza conteúdo completo, profundo, agradável de ler e com ótima organização.
- A revista deve ter ${qtd} lições.
- Deve conter capa frontal, apresentação breve, ${qtd} lições completas e contracapa.
- Cada lição precisa ter:
  título, subtítulo, texto áureo, verdade prática, leitura bíblica em classe por extenso, objetivos, introdução, três tópicos principais, cada tópico com três subtópicos, aplicação para a vida, conclusão e revisão do conteúdo.
- Integrar referências bíblicas ao longo dos argumentos.
- A linguagem deve ser didática, bíblica, reverente e acessível para alunos adultos.
- A capa deve ser bonita, editorial, temática e coerente com o assunto.

INSTRUÇÃO ESPECIAL DO USUÁRIO:
${fallback(data.temaPrincipal, "Não informado.")}

Gere o HTML completo.
`;
}

function buildLivroCristaoPrompt(data) {
  return `
Você é um escritor cristão experiente e editor de livros teológicos.

${commonContext(data)}

Gere SOMENTE HTML de um LIVRO CRISTÃO COMPLETO.

REGRAS:
- Não use markdown.
- Não use inglês.
- Produza um livro com desenvolvimento real de ideias.
- O livro deve ter começo, meio e fim.
- Cada capítulo precisa desenvolver uma parte do argumento central.
- Não fazer comentários soltos.
- Integrar referências bíblicas ao longo do texto.
- Produzir leitura prazerosa, profunda, coerente, argumentativa e edificante.
- Cada capítulo precisa ter:
  - título;
  - subtítulo opcional;
  - introdução breve;
  - desenvolvimento da ideia;
  - argumentos bíblicos;
  - aplicações pastorais quando fizer sentido;
  - fechamento do capítulo;
  - transição inteligente para o próximo capítulo.
- Não gerar palavras técnicas aleatórias.
- Se houver capa, gerar capa frontal e contracapa temáticas.

INSTRUÇÃO ESPECIAL DO USUÁRIO:
${fallback(data.temaPrincipal, "Não informado.")}

Gere o HTML completo do livro.
`;
}

function buildEbookCristaoPrompt(data) {
  return `
Você é um redator cristão experiente.

${commonContext(data)}

Gere SOMENTE HTML de um E-BOOK CRISTÃO completo, bonito e profundo.

REGRAS:
- Estrutura clara.
- Conteúdo sólido.
- Referências bíblicas integradas ao texto.
- Introdução, capítulos bem desenvolvidos e conclusão forte.
- Se houver capa, gerar capa frontal temática e contracapa simples.
- Não escrever nada fora do HTML.

INSTRUÇÃO ESPECIAL DO USUÁRIO:
${fallback(data.temaPrincipal, "Não informado.")}

Gere o HTML completo.
`;
}

function buildSermaoPrompt(data) {
  return `
Você é um pregador e escritor cristão experiente.

${commonContext(data)}

Gere SOMENTE HTML de um SERMÃO completo.

ESTRUTURA:
- título
- texto base
- tema
- introdução
- 3 ou 4 tópicos bem desenvolvidos
- cada tópico com explicação, referências bíblicas e aplicação
- conclusão
- apelo final
- oração final opcional

REGRAS:
- profundo
- bíblico
- pentecostal clássico quando apropriado
- argumentativo
- pastoral
- não superficial

INSTRUÇÃO ESPECIAL DO USUÁRIO:
${fallback(data.temaPrincipal, "Não informado.")}

Gere o HTML completo.
`;
}

function buildDevocionalPrompt(data) {
  return `
Você é um escritor devocional cristão.

${commonContext(data)}

Gere SOMENTE HTML de um DEVOCIONAL completo.

ESTRUTURA:
- título
- texto bíblico base
- meditação
- desenvolvimento
- aplicação prática
- oração final

REGRAS:
- linguagem bíblica, pastoral e edificante
- conteúdo bonito, acolhedor e profundo
- referências bíblicas coerentes ao longo do texto

INSTRUÇÃO ESPECIAL DO USUÁRIO:
${fallback(data.temaPrincipal, "Não informado.")}

Gere o HTML completo.
`;
}

function buildCursoPrompt(data) {
  return `
Você é um produtor de cursos cristãos.

${commonContext(data)}

Gere SOMENTE HTML de um CURSO cristão completo e bem estruturado.

ESTRUTURA:
- capa
- apresentação
- módulos
- aulas
- objetivos
- conteúdo
- referências bíblicas
- exercícios ou perguntas
- conclusão

INSTRUÇÃO ESPECIAL DO USUÁRIO:
${fallback(data.temaPrincipal, "Não informado.")}

Gere o HTML completo.
`;
}

function buildEstudoBiblicoPrompt(data) {
  return `
Você é um professor de Bíblia experiente.

${commonContext(data)}

Gere SOMENTE HTML de um ESTUDO BÍBLICO completo.

ESTRUTURA:
- título
- texto base
- introdução
- desenvolvimento em tópicos
- referências cruzadas
- aplicações práticas
- conclusão

REGRAS:
- conteúdo profundo
- bem argumentado
- prazeroso de ler
- fiel às Escrituras

INSTRUÇÃO ESPECIAL DO USUÁRIO:
${fallback(data.temaPrincipal, "Não informado.")}

Gere o HTML completo.
`;
}

function buildPromptGenerico(data) {
  return `
Você é um redator cristão experiente.

${commonContext(data)}

Gere SOMENTE HTML de um material cristão completo, bonito, profundo e bem organizado, obedecendo as instruções do usuário.

INSTRUÇÃO ESPECIAL DO USUÁRIO:
${fallback(data.temaPrincipal, "Não informado.")}

Gere o HTML completo.
`;
}

/* =========================
   EXTRAÇÃO / LIMPEZA HTML
========================= */

function extractHtml(rawText) {
  if (!rawText) return "";

  const beginEndMatch = rawText.match(
    /<!--\s*BEGIN_HTML\s*-->([\s\S]*?)<!--\s*END_HTML\s*-->/i
  );
  if (beginEndMatch?.[1]) {
    return beginEndMatch[1].trim();
  }

  const fencedHtml = rawText.match(/```html([\s\S]*?)```/i);
  if (fencedHtml?.[1]) {
    return fencedHtml[1].trim();
  }

  const fencedGeneric = rawText.match(/```([\s\S]*?)```/i);
  if (fencedGeneric?.[1] && looksLikeHtml(fencedGeneric[1])) {
    return fencedGeneric[1].trim();
  }

  if (looksLikeHtml(rawText)) {
    return rawText.trim();
  }

  return "";
}

function looksLikeHtml(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  return (
    t.includes("<section") ||
    t.includes("<article") ||
    t.includes("<div") ||
    t.includes("<h1") ||
    t.includes("<style")
  );
}

function cleanHtml(html) {
  if (!html) return "";

  let cleaned = html;

  cleaned = cleaned.replace(/```html/gi, "");
  cleaned = cleaned.replace(/```/g, "");
  cleaned = cleaned.replace(/chaptersummary/gi, "");
  cleaned = cleaned.replace(/reflectiveclosing/gi, "");
  cleaned = cleaned.replace(/transitiontonextchapter/gi, "");
  cleaned = cleaned.replace(/chaptersummary/gi, "");
  cleaned = cleaned.replace(/reflect close/gi, "");
  cleaned = cleaned.replace(/gemini/gi, "");
  cleaned = cleaned.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");

  return cleaned.trim();
}

function buildFallbackHtml(rawText, data) {
  const safeText = escapeHtml(rawText || "Não foi possível estruturar a resposta.");

  return `
<style>
  .material-root{
    max-width:900px;
    margin:0 auto;
    padding:24px;
    font-family:Arial, Helvetica, sans-serif;
    color:#2b2118;
    line-height:1.7;
  }
  .material-root h1,.material-root h2,.material-root h3{
    color:#4b2d14;
  }
  .material-root .box{
    background:#fffdf9;
    border:1px solid #e6d7c3;
    border-radius:18px;
    padding:20px;
    margin:18px 0;
  }
</style>
<div class="material-root">
  <section class="box">
    <h1>${escapeHtml(fallback(data.titulo, "Material gerado"))}</h1>
    <p><strong>Subtítulo:</strong> ${escapeHtml(fallback(data.subtitulo, "—"))}</p>
    <p><strong>Tipo:</strong> ${escapeHtml(fallback(data.tipoMaterial, "Material cristão"))}</p>
    <p><strong>Conteúdo retornado pela IA:</strong></p>
    <div>${safeText.replace(/\n/g, "<br>")}</div>
  </section>
</div>
`;
}

/* =========================
   HELPERS
========================= */

function fallback(value, defaultValue = "") {
  return value && String(value).trim() ? String(value).trim() : defaultValue;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
