export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Método não permitido. Use POST."
    });
  }

  try {
    const geminiApiKey = process.env.GEMINI_API_KEY || "";
    const openaiApiKey = process.env.OPENAI_API_KEY || "";

    if (!geminiApiKey && !openaiApiKey) {
      return res.status(500).json({
        ok: false,
        error: "Nenhuma chave de IA foi configurada. Configure GEMINI_API_KEY ou OPENAI_API_KEY na Vercel."
      });
    }

    const form = normalizarFormulario(req.body || {});
    const adminCodeServer = process.env.Isiquel_Admin || "00";

    const tiposReservados = ["ebook", "livro", "curso", "revista"];

    if (tiposReservados.includes(form.materialType)) {
      if (!form.adminCode || form.adminCode !== adminCodeServer) {
        return res.status(401).json({
          ok: false,
          error: "Código de acesso inválido para este material reservado."
        });
      }
    }

    const prompt = criarPrompt(form);

    const respostaIA = await gerarComFallback({
      prompt,
      geminiApiKey,
      openaiApiKey
    });

    const material = extrairJSON(respostaIA.text);

    return res.status(200).json({
      ok: true,
      provider: respostaIA.provider,
      material
    });
  } catch (erro) {
    return res.status(500).json({
      ok: false,
      error: limparMensagemErro(erro?.message || "Erro interno ao gerar material.")
    });
  }
}

/* =========================================================
   NORMALIZAÇÃO
========================================================= */

function normalizarFormulario(body) {
  const materialType = String(
    body.materialType ||
    body.tipoMaterial ||
    "sermao"
  ).trim().toLowerCase();

  const lessonTitles = Array.isArray(body.lessonTitles)
    ? body.lessonTitles
    : [];

  const chapterPlan = Array.isArray(body.chapterPlan)
    ? body.chapterPlan
    : [];

  return {
    adminCode: String(body.adminCode || body.codigoAcesso || "").trim(),

    materialType,

    revistaPart: String(body.revistaPart || "").trim(),
    livroPart: String(body.livroPart || "").trim(),

    lessonNumber: Number(body.lessonNumber || 1),
    chapterNumber: Number(body.chapterNumber || 1),

    lessonTitles,
    chapterPlan,

    presentationToTeacher: String(body.presentationToTeacher || "").trim(),
    magazineOverview: String(body.magazineOverview || "").trim(),
    generalTeacherGuidance: String(body.generalTeacherGuidance || "").trim(),

    bookCentralThesis: String(body.bookCentralThesis || "").trim(),
    readingPath: String(body.readingPath || "").trim(),
    previousChapterSummary: String(body.previousChapterSummary || "").trim(),

    instrucoesExtras: String(body.instrucoesExtras || "").trim(),

    revistaVersion: String(body.revistaVersion || body.versaoRevista || "professor").trim(),

    bibleVersion: String(body.bibleVersion || body.traducao || "King James Fiel 1611").trim(),

    sermonPoints: Number(body.sermonPoints || 3),

    title: String(body.title || body.titulo || "").trim(),
    subtitle: String(body.subtitle || body.subtitulo || "").trim(),

    theme: String(
      body.theme ||
      body.tema ||
      body.temaPrincipal ||
      ""
    ).trim(),

    biblicalBase: String(
      body.biblicalBase ||
      body.textoBase ||
      body.textoBiblicoBase ||
      ""
    ).trim(),

    quantity: Number(body.quantity || body.quantidadeLicoes || 4),

    targetAudience: String(
      body.targetAudience ||
      body.publicoAlvo ||
      ""
    ).trim(),

    author: String(
      body.author ||
      body.autor ||
      body.comentarista ||
      ""
    ).trim(),

    ministry: String(
      body.ministry ||
      body.editora ||
      body.ministerio ||
      ""
    ).trim(),

    depthLevel: String(
      body.depthLevel ||
      body.profundidade ||
      "profundo"
    ).trim(),

    visualStyle: String(
      body.visualStyle ||
      body.estiloVisual ||
      "preto e branco"
    ).trim(),

    coverMode: String(
      body.coverMode ||
      body.capa ||
      "sem-capa"
    ).trim(),

    tone: String(
      body.tone ||
      body.tomMaterial ||
      "bíblico, pastoral, profundo, didático, reverente e edificante"
    ).trim()
  };
}

/* =========================================================
   FALLBACK GEMINI + OPENAI
========================================================= */

async function gerarComFallback({ prompt, geminiApiKey, openaiApiKey }) {
  const erros = [];

  if (geminiApiKey) {
    const modelosGemini = limparLista([
      process.env.GEMINI_TEXT_MODEL_1 || "gemini-2.5-flash-lite",
      process.env.GEMINI_TEXT_MODEL_2 || "gemini-2.5-flash",
      process.env.GEMINI_TEXT_MODEL_3 || "gemini-2.0-flash"
    ]);

    for (const modelo of modelosGemini) {
      try {
        const text = await callGeminiText(geminiApiKey, modelo, prompt);

        if (text && text.trim()) {
          return {
            provider: `gemini:${modelo}`,
            text
          };
        }
      } catch (erro) {
        erros.push(`Gemini ${modelo}: ${erro?.message || "erro desconhecido"}`);
      }
    }
  }

  if (openaiApiKey) {
    const modelosOpenAI = limparLista([
      process.env.OPENAI_TEXT_MODEL_1 || "gpt-4.1-mini",
      process.env.OPENAI_TEXT_MODEL_2 || "gpt-4.1",
      process.env.OPENAI_TEXT_MODEL_3 || "gpt-4.1-nano"
    ]);

    for (const modelo of modelosOpenAI) {
      try {
        const text = await callOpenAIText(openaiApiKey, modelo, prompt);

        if (text && text.trim()) {
          return {
            provider: `openai:${modelo}`,
            text
          };
        }
      } catch (erro) {
        erros.push(`OpenAI ${modelo}: ${erro?.message || "erro desconhecido"}`);
      }
    }
  }

  throw new Error(erros.join(" | ") || "Nenhuma IA conseguiu gerar o conteúdo.");
}

function limparLista(lista) {
  return [...new Set(lista.filter(Boolean).map(x => String(x).trim()).filter(Boolean))];
}

/* =========================================================
   PROMPTS
========================================================= */

function criarPrompt(form) {
  if (form.materialType === "revista" && form.revistaPart === "meta") {
    return promptRevistaMeta(form);
  }

  if (form.materialType === "revista" && form.revistaPart === "lesson") {
    return promptRevistaLicao(form);
  }

  if (form.materialType === "revista" && form.revistaPart === "cover") {
    return promptRevistaCapa(form);
  }

  if (form.materialType === "revista" && form.revistaPart === "backcover") {
    return promptRevistaContracapa(form);
  }

  if (form.materialType === "revista") {
    return promptRevistaCompleta(form);
  }

  if (form.materialType === "sermao") return promptSermao(form);
  if (form.materialType === "devocional") return promptDevocional(form);
  if (form.materialType === "estudo") return promptEstudo(form);
  if (form.materialType === "ebook") return promptEbook(form);
  if (form.materialType === "curso") return promptCurso(form);

  if (form.materialType === "livro" && form.livroPart === "meta") {
    return promptLivroMeta(form);
  }

  if (form.materialType === "livro" && form.livroPart === "chapter") {
    return promptLivroCapitulo(form);
  }

  if (form.materialType === "livro") return promptLivro(form);

  return promptEstudo(form);
}

function promptBase(form) {
  return `
Você é um pastor, teólogo, escritor cristão, comentarista bíblico, professor de Escola Bíblica Dominical e editor de materiais cristãos.

RESPONDA SOMENTE EM JSON VÁLIDO.
NÃO use markdown.
NÃO use crases.
NÃO escreva comentários fora do JSON.
NÃO escreva texto antes nem depois do JSON.

Dados do material:
Título: ${form.title}
Subtítulo: ${form.subtitle}
Tema: ${form.theme}
Texto bíblico base: ${form.biblicalBase}
Público-alvo: ${form.targetAudience}
Autor/comentarista: ${form.author}
Editora/ministério: ${form.ministry}
Profundidade: ${form.depthLevel}
Tom: ${form.tone}
Tradução bíblica padrão: ${form.bibleVersion}

Regras gerais:
- Linguagem bíblica, pastoral, didática, profunda, reverente e adulta.
- Não produzir conteúdo raso.
- Não repetir ideias vazias.
- Não mencionar inteligência artificial.
- Não usar símbolo do Gemini.
- Não inventar nomes de livros quando pedir materiais reais; prefira obras conhecidas e clássicas quando aplicável.
- Manter fidelidade bíblica e doutrinária.
- Explicar os textos bíblicos usados.
- Escrever em português do Brasil.
- Usar uma linha pentecostal clássica quando o assunto permitir.
`.trim();
}

/* =========================================================
   REVISTA EBD
========================================================= */

function promptRevistaMeta(form) {
  return `
${promptBase(form)}

Crie apenas a estrutura inicial de uma revista mensal de Escola Bíblica Dominical, versão do professor.

A revista deve ter nível editorial sério, adulto e profundo.

Nesta etapa, crie somente:
1. Dados gerais da revista.
2. Apresentação ao professor.
3. Panorama geral da revista.
4. Orientações gerais para o professor.
5. Títulos das 4 lições.

Não desenvolva as lições ainda.
Não crie capa.
Não crie contracapa.

A apresentação ao professor deve ser pastoral, madura e explicar a importância do tema para a sala de aula.
O panorama geral deve apresentar a linha de pensamento da revista.
As orientações gerais devem ajudar o professor a conduzir as aulas.

Retorne JSON neste formato:

{
  "type": "revista",
  "title": "",
  "subtitle": "",
  "author": "",
  "ministry": "",
  "revistaVersion": "professor",
  "presentationToTeacher": "",
  "magazineOverview": "",
  "generalTeacherGuidance": "",
  "monthSummary": "",
  "quarterSummary": "",
  "lessonTitles": [
    "Lição 1 - ...",
    "Lição 2 - ...",
    "Lição 3 - ...",
    "Lição 4 - ..."
  ]
}
`;
}

function promptRevistaLicao(form) {
  const numero = form.lessonNumber || 1;
  const tituloSugerido = form.lessonTitles[numero - 1] || `Lição ${numero}`;

  return `
${promptBase(form)}

Crie somente a LIÇÃO ${numero} da revista.

Título sugerido:
${tituloSugerido}

Lições da revista:
${form.lessonTitles.map((t, i) => `${i + 1}. ${t}`).join("\n")}

Contexto geral da revista:
Apresentação ao professor:
${form.presentationToTeacher}

Panorama geral:
${form.magazineOverview}

Orientações gerais:
${form.generalTeacherGuidance}

Não gere a revista inteira.
Não gere capa.
Não gere contracapa.
Não gere outras lições.

A lição deve ser digna de REVISTA DO PROFESSOR para classe adulta da EBD.
O conteúdo deve ser robusto, bíblico, doutrinário, pastoral, didático, histórico quando necessário e profundamente explicativo.

REGRAS OBRIGATÓRIAS PARA A LIÇÃO:
- O campo "goldenText" deve trazer a referência e o versículo por extenso.
- O campo "bibleReading" NÃO pode trazer somente referências.
- O campo "bibleReading" deve ser uma lista de blocos com referência e texto bíblico por extenso.
- Cada tópico principal deve ter texto explicativo forte.
- Cada tópico deve ter no mínimo 2 parágrafos.
- Cada subtópico deve ter no mínimo 2 parágrafos.
- Cada subtópico deve explicar a referência bíblica usada.
- Cada subtópico deve ter aplicação para a compreensão do professor.
- Não faça subtópicos curtos.
- Não faça comentários genéricos.
- Não use frases vazias.
- Não use conteúdo raso.
- Não deixe tópico somente com uma frase.
- Use referências bíblicas em tópicos e subtópicos.
- Explique os textos bíblicos no corpo da lição.
- Inclua orientação prática para o professor conduzir a aula.
- Inclua auxílio bibliológico ou doutrinário com densidade.
- Inclua subsídio histórico quando o assunto permitir.
- Inclua atenção ao professor sobre erros de interpretação.
- Inclua apoio doutrinário.
- Inclua materiais reais para aprofundamento.
- Revisando o conteúdo deve ter 5 perguntas e respostas.

A LEITURA BÍBLICA EM CLASSE deve seguir este padrão:
[
  {
    "reference": "Referência bíblica",
    "text": "Texto bíblico por extenso"
  }
]

Se a leitura bíblica tiver vários textos, cada texto deve vir em um objeto separado.

${form.instrucoesExtras ? `Instruções extras do usuário:\n${form.instrucoesExtras}` : ""}

Retorne JSON válido neste formato:

{
  "type": "revistaLesson",
  "number": ${numero},
  "title": "",
  "subtitle": "",
  "goldenText": "",
  "practicalTruth": "",
  "bibleReading": [
    {
      "reference": "",
      "text": ""
    }
  ],
  "objectives": ["", "", ""],
  "teacherWord": "",
  "lessonOverview": "",
  "introduction": "",
  "topics": [
    {
      "title": "",
      "reference": "",
      "text": "",
      "subtopics": [
        { "title": "", "reference": "", "text": "" },
        { "title": "", "reference": "", "text": "" },
        { "title": "", "reference": "", "text": "" }
      ]
    },
    {
      "title": "",
      "reference": "",
      "text": "",
      "subtopics": [
        { "title": "", "reference": "", "text": "" },
        { "title": "", "reference": "", "text": "" },
        { "title": "", "reference": "", "text": "" }
      ]
    },
    {
      "title": "",
      "reference": "",
      "text": "",
      "subtopics": [
        { "title": "", "reference": "", "text": "" },
        { "title": "", "reference": "", "text": "" },
        { "title": "", "reference": "", "text": "" }
      ]
    }
  ],
  "lifeApplication": "",
  "conclusion": "",
  "bibliologicalAid": "",
  "historicalSupport": "",
  "interpretationCare": "",
  "doctrinalSupport": "",
  "recommendedDeepening": ["", "", "", ""],
  "teacherNotes": "",
  "reviewQuestions": [
    { "question": "", "answer": "" },
    { "question": "", "answer": "" },
    { "question": "", "answer": "" },
    { "question": "", "answer": "" },
    { "question": "", "answer": "" }
  ]
}
`;
}

function promptRevistaCapa(form) {
  return `
${promptBase(form)}

Crie somente os textos editoriais da capa frontal.

Não crie lições.
Não crie a revista inteira.
Não gere imagem.
A imagem será gerada por outro arquivo.

A capa deve ser profissional, bíblica, editorial, reverente e coerente com o tema.

Crie um tema visual forte para uma capa sobre:
${form.title}

Retorne JSON:

{
  "type": "revistaCover",
  "title": "",
  "subtitle": "",
  "topLabel": "Revista Mensal de Escola Bíblica Dominical",
  "versionLabel": "Revista do Professor",
  "author": "",
  "ministry": "",
  "visualTheme": "",
  "coverPhrase": ""
}
`;
}

function promptRevistaContracapa(form) {
  return `
${promptBase(form)}

Crie somente os textos editoriais da contracapa.

Não gere lições.
Não gere a revista inteira.
Não gere imagem.

A contracapa deve ter uma frase forte e um texto editorial curto, maduro e pastoral.

Retorne JSON:

{
  "type": "revistaBackCover",
  "title": "",
  "subtitle": "",
  "ministry": "",
  "author": "",
  "backCoverPhrase": "",
  "backCoverText": "",
  "visualTheme": ""
}
`;
}

function promptRevistaCompleta(form) {
  return `
${promptBase(form)}

Crie uma revista de EBD completa, mas em formato resumido. Preferencialmente use o modo por partes do sistema.

Retorne JSON:

{
  "type": "revista",
  "title": "",
  "subtitle": "",
  "author": "",
  "ministry": "",
  "presentationToTeacher": "",
  "magazineOverview": "",
  "generalTeacherGuidance": "",
  "lessonTitles": ["", "", "", ""],
  "lessons": []
}
`;
}

/* =========================================================
   SERMÃO / DEVOCIONAL / ESTUDO
========================================================= */

function promptSermao(form) {
  return `
${promptBase(form)}

Crie um sermão completo com introdução, ${form.sermonPoints} tópicos, aplicação, conclusão e oração.

O sermão deve ter:
- Introdução envolvente.
- Tópicos bem desenvolvidos.
- Cada tópico com referência bíblica.
- Aplicação espiritual.
- Conclusão forte.
- Oração final.

Retorne JSON:

{
  "type": "sermao",
  "title": "",
  "subtitle": "",
  "biblicalBase": "",
  "introduction": "",
  "topics": [
    {
      "number": 1,
      "title": "",
      "reference": "",
      "text": ""
    }
  ],
  "application": "",
  "conclusion": "",
  "prayer": ""
}
`;
}

function promptDevocional(form) {
  return `
${promptBase(form)}

Crie um devocional cristão.

O devocional deve ser profundo, pastoral e edificante.

Retorne JSON:

{
  "type": "devocional",
  "title": "",
  "subtitle": "",
  "biblicalBase": "",
  "introduction": "",
  "reflection": "",
  "application": "",
  "conclusion": "",
  "prayer": ""
}
`;
}

function promptEstudo(form) {
  return `
${promptBase(form)}

Crie um estudo bíblico/teológico profundo.

O estudo deve conter:
- Introdução.
- Tópicos bem desenvolvidos.
- Referências bíblicas.
- Explicação teológica.
- Aplicação.
- Conclusão.

Retorne JSON:

{
  "type": "estudo",
  "title": "",
  "subtitle": "",
  "biblicalBase": "",
  "introduction": "",
  "topics": [
    {
      "number": 1,
      "title": "",
      "reference": "",
      "text": ""
    }
  ],
  "application": "",
  "conclusion": ""
}
`;
}

/* =========================================================
   EBOOK / CURSO / LIVRO
========================================================= */

function promptEbook(form) {
  return `
${promptBase(form)}

Crie um e-book cristão com ${form.quantity} capítulos.

Cada capítulo deve ter título e conteúdo bem desenvolvido.

Retorne JSON:

{
  "type": "ebook",
  "title": "",
  "subtitle": "",
  "introduction": "",
  "chapters": [
    {
      "number": 1,
      "title": "",
      "text": ""
    }
  ],
  "conclusion": ""
}
`;
}

function promptCurso(form) {
  return `
${promptBase(form)}

Crie um curso cristão com ${form.quantity} aulas.

Cada aula deve ter:
- título
- objetivo
- conteúdo
- atividade
- aplicação

Retorne JSON:

{
  "type": "curso",
  "title": "",
  "subtitle": "",
  "introduction": "",
  "lessons": [
    {
      "number": 1,
      "title": "",
      "objective": "",
      "content": "",
      "activity": "",
      "application": ""
    }
  ],
  "conclusion": ""
}
`;
}

function promptLivro(form) {
  return `
${promptBase(form)}

Crie um livro cristão com ${form.quantity || 10} capítulos.

Retorne JSON:

{
  "type": "livro",
  "title": "",
  "subtitle": "",
  "author": "",
  "ministry": "",
  "presentation": "",
  "preface": "",
  "generalIntroduction": "",
  "chapters": [
    {
      "number": 1,
      "title": "",
      "text": ""
    }
  ],
  "finalConclusion": "",
  "wordToReader": "",
  "authorBio": "",
  "backCoverText": ""
}
`;
}

function promptLivroMeta(form) {
  const total = form.quantity || 10;

  return `
${promptBase(form)}

Crie apenas a estrutura inicial de um livro cristão com ${total} capítulos.

Não desenvolva os capítulos ainda.

Retorne JSON:

{
  "type": "livro",
  "title": "",
  "subtitle": "",
  "author": "",
  "ministry": "",
  "presentation": "",
  "preface": "",
  "generalIntroduction": "",
  "bookCentralThesis": "",
  "readingPath": "",
  "chapterPlan": [
    {
      "number": 1,
      "title": "",
      "centralIdea": ""
    }
  ],
  "finalConclusion": "",
  "wordToReader": "",
  "authorBio": "",
  "backCoverText": ""
}
`;
}

function promptLivroCapitulo(form) {
  const numero = form.chapterNumber || 1;
  const plano = Array.isArray(form.chapterPlan) ? form.chapterPlan : [];
  const capituloPlano = plano[numero - 1] || {};

  return `
${promptBase(form)}

Crie somente o capítulo ${numero} do livro.

Título sugerido:
${capituloPlano.title || `Capítulo ${numero}`}

Ideia central:
${capituloPlano.centralIdea || ""}

Tese central do livro:
${form.bookCentralThesis}

Caminho de leitura:
${form.readingPath}

Resumo do capítulo anterior:
${form.previousChapterSummary}

O capítulo deve ser robusto, pastoral, bíblico, profundo e bem escrito.

Retorne JSON:

{
  "type": "bookChapter",
  "number": ${numero},
  "title": "",
  "chapterQuestion": "",
  "centralThesis": "",
  "openingNarrative": "",
  "ideaDevelopment": "",
  "biblicalExposition": "",
  "argumentDevelopment": "",
  "theologicalReflection": "",
  "biblicalExamples": "",
  "pastoralApplication": "",
  "chapterSummary": "",
  "reflectiveClosing": "",
  "transitionToNextChapter": ""
}
`;
}

/* =========================================================
   CHAMADAS DE API
========================================================= */

async function callGeminiText(apiKey, model, prompt) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
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
      maxOutputTokens: 16000,
      responseMimeType: "application/json"
    }
  };

  const resposta = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const data = await resposta.json().catch(() => null);

  if (!resposta.ok) {
    throw new Error(data?.error?.message || `Erro ao chamar Gemini ${model}.`);
  }

  const text =
    data?.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim() || "";

  if (!text) {
    throw new Error(`Gemini ${model} não retornou texto.`);
  }

  return text;
}

async function callOpenAIText(apiKey, model, prompt) {
  const url = "https://api.openai.com/v1/chat/completions";

  const body = {
    model,
    messages: [
      {
        role: "system",
        content: "Você é um pastor, teólogo, escritor cristão e editor de materiais bíblicos. Responda somente em JSON válido."
      },
      {
        role: "user",
        content: prompt
      }
    ],
    temperature: 0.75,
    max_tokens: 16000,
    response_format: {
      type: "json_object"
    }
  };

  const resposta = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  const data = await resposta.json().catch(() => null);

  if (!resposta.ok) {
    throw new Error(data?.error?.message || `Erro ao chamar OpenAI ${model}.`);
  }

  const text = data?.choices?.[0]?.message?.content?.trim() || "";

  if (!text) {
    throw new Error(`OpenAI ${model} não retornou texto.`);
  }

  return text;
}

/* =========================================================
   JSON E ERROS
========================================================= */

function extrairJSON(texto) {
  if (!texto || typeof texto !== "string") {
    throw new Error("A IA não retornou texto para converter em JSON.");
  }

  let limpo = texto.trim();

  limpo = limpo
    .replace(/^```json/i, "")
    .replace(/^```/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(limpo);
  } catch (erroInicial) {
    const primeiro = limpo.indexOf("{");
    const ultimo = limpo.lastIndexOf("}");

    if (primeiro !== -1 && ultimo !== -1 && ultimo > primeiro) {
      const recorte = limpo.slice(primeiro, ultimo + 1);

      try {
        return JSON.parse(recorte);
      } catch (erroRecorte) {
        throw new Error("A IA respondeu, mas o JSON veio quebrado. Tente gerar novamente ou reduzir o tamanho do pedido.");
      }
    }

    throw new Error("A IA não retornou JSON válido. Tente novamente.");
  }
}

function limparMensagemErro(msg) {
  const texto = String(msg || "").toLowerCase();

  if (
    texto.includes("quota") ||
    texto.includes("exceeded") ||
    texto.includes("billing") ||
    texto.includes("rate limit") ||
    texto.includes("insufficient_quota")
  ) {
    return "A cota da IA acabou ou a API está sem crédito disponível. O sistema tentou Gemini e OpenAI/GPT, mas não conseguiu gerar agora.";
  }

  if (
    texto.includes("api key") ||
    texto.includes("apikey") ||
    texto.includes("invalid key") ||
    texto.includes("unauthorized")
  ) {
    return "A chave da API está inválida ou não foi configurada corretamente na Vercel. Confira GEMINI_API_KEY e OPENAI_API_KEY.";
  }

  if (texto.includes("maximum context") || texto.includes("max_tokens") || texto.includes("token")) {
    return "O pedido ficou grande demais para a IA responder. Tente reduzir o tamanho ou gerar por partes.";
  }

  if (texto.includes("json")) {
    return "A IA respondeu fora do formato esperado. Tente gerar novamente.";
  }

  if (texto.includes("model") && texto.includes("not found")) {
    return "Um dos modelos configurados não está disponível na sua conta. Verifique os nomes dos modelos nas variáveis da Vercel.";
  }

  return String(msg || "Erro ao gerar material.");
}
