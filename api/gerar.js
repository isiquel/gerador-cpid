export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Método não permitido. Use POST."
    });
  }

  try {
    const geminiApiKey = process.env.GEMINI_API_KEY || "";
    const openaiApiKey = process.env.OPENAI_API_KEY || "";

    if (!geminiApiKey && !openaiApiKey) {
      return res.status(500).json({
        error: "Nenhuma chave de IA foi configurada. Configure GEMINI_API_KEY ou OPENAI_API_KEY na Vercel."
      });
    }

    const body = req.body || {};
    const form = normalizeForm(body);

    const tiposReservados = ["ebook", "livro", "curso", "revista"];
    const adminCodeServer = process.env.Isiquel_Admin || "00";

    if (tiposReservados.includes(form.materialType)) {
      if (!form.adminCode || form.adminCode !== adminCodeServer) {
        return res.status(401).json({
          error: "Código de acesso inválido para este recurso reservado."
        });
      }
    }

    const prompt = buildPrompt(form);

    const resultado = await gerarComFallback({
      prompt,
      geminiApiKey,
      openaiApiKey
    });

    if (!resultado.material) {
      return res.status(500).json({
        error: limparMensagemErro(resultado.error)
      });
    }

    return res.status(200).json({
      material: resultado.material,
      provider: resultado.provider
    });
  } catch (erro) {
    return res.status(500).json({
      error: limparMensagemErro(erro?.message || "Erro interno ao gerar material.")
    });
  }
}

/* =========================================================
   NORMALIZAÇÃO
========================================================= */

function normalizeForm(body) {
  const materialType = String(
    body.materialType ||
    body.tipoMaterial ||
    body.tipo ||
    "sermao"
  ).trim().toLowerCase();

  let sermonPoints = Number(body.sermonPoints || 4);
  if (!Number.isFinite(sermonPoints)) sermonPoints = 4;
  sermonPoints = Math.max(3, Math.min(5, sermonPoints));

  let quantity = Number(
    body.quantity ||
    body.quantidadeLicoes ||
    body.qtdLicoes ||
    body.licoes ||
    4
  );

  if (!Number.isFinite(quantity)) quantity = 4;

  if (materialType === "revista") quantity = 4;
  if (materialType === "livro") quantity = Math.max(1, Math.min(20, quantity));
  if (materialType === "ebook") quantity = Math.max(1, Math.min(12, quantity));
  if (materialType === "curso") quantity = Math.max(1, Math.min(20, quantity));

  return {
    adminCode: String(body.adminCode || body.codigoAcesso || "").trim(),

    materialType,

    revistaPart: String(body.revistaPart || "").trim(),
    livroPart: String(body.livroPart || "").trim(),

    lessonNumber: Number(body.lessonNumber || 0),
    chapterNumber: Number(body.chapterNumber || 0),

    lessonTitles: Array.isArray(body.lessonTitles) ? body.lessonTitles : [],
    chapterPlan: Array.isArray(body.chapterPlan) ? body.chapterPlan : [],

    presentationToTeacher: String(body.presentationToTeacher || "").trim(),
    magazineOverview: String(body.magazineOverview || "").trim(),
    generalTeacherGuidance: String(body.generalTeacherGuidance || "").trim(),

    previousChapterSummary: String(body.previousChapterSummary || "").trim(),
    bookCentralThesis: String(body.bookCentralThesis || "").trim(),
    readingPath: String(body.readingPath || "").trim(),

    revistaVersion: String(body.revistaVersion || body.versaoRevista || "professor").trim(),
    bibleVersion: String(body.bibleVersion || body.traducao || "King James Fiel 1611").trim(),

    sermonPoints,

    title: String(body.title || body.titulo || "").trim(),
    subtitle: String(body.subtitle || body.subtitulo || "").trim(),
    theme: String(body.theme || body.tema || body.temaPrincipal || "").trim(),
    biblicalBase: String(body.biblicalBase || body.textoBase || body.textoBiblicoBase || "").trim(),

    quantity,

    targetAudience: String(body.targetAudience || body.publicoAlvo || "").trim(),
    author: String(body.author || body.autor || body.comentarista || "").trim(),
    ministry: String(body.ministry || body.editora || body.ministerio || "").trim(),

    depthLevel: String(body.depthLevel || body.profundidade || "Muito profundo").trim(),
    visualStyle: String(body.visualStyle || body.estiloVisual || "Colorido").trim(),
    tone: String(body.tone || body.tomMaterial || "").trim(),

    coverMode: String(body.coverMode || body.capa || "com-capa").trim(),

    instrucoesExtras: String(body.instrucoesExtras || "").trim()
  };
}

/* =========================================================
   FALLBACK GEMINI + OPENAI
========================================================= */

async function gerarComFallback({ prompt, geminiApiKey, openaiApiKey }) {
  const erros = [];

  if (geminiApiKey) {
    const geminiModels = limparLista([
      process.env.GEMINI_TEXT_MODEL_1 || "gemini-2.5-flash-lite",
      process.env.GEMINI_TEXT_MODEL_2 || "gemini-2.5-flash",
      process.env.GEMINI_TEXT_MODEL_3 || "gemini-2.0-flash"
    ]);

    for (const model of geminiModels) {
      try {
        const texto = await callGeminiText(geminiApiKey, model, prompt);
        const material = parseJson(texto);

        if (material) {
          return {
            material,
            provider: `gemini:${model}`
          };
        }

        erros.push(`Gemini ${model}: resposta inválida.`);
      } catch (erro) {
        erros.push(`Gemini ${model}: ${erro?.message || "erro desconhecido"}`);
      }
    }
  }

  if (openaiApiKey) {
    const openaiModels = limparLista([
      process.env.OPENAI_TEXT_MODEL_1 || "gpt-4.1-mini",
      process.env.OPENAI_TEXT_MODEL_2 || "gpt-4.1",
      process.env.OPENAI_TEXT_MODEL_3 || "gpt-4.1-nano"
    ]);

    for (const model of openaiModels) {
      try {
        const texto = await callOpenAIText(openaiApiKey, model, prompt);
        const material = parseJson(texto);

        if (material) {
          return {
            material,
            provider: `openai:${model}`
          };
        }

        erros.push(`OpenAI ${model}: resposta inválida.`);
      } catch (erro) {
        erros.push(`OpenAI ${model}: ${erro?.message || "erro desconhecido"}`);
      }
    }
  }

  return {
    material: null,
    provider: null,
    error: erros.join(" | ")
  };
}

function limparLista(lista) {
  return [...new Set(lista.filter(Boolean).map((x) => String(x).trim()).filter(Boolean))];
}

/* =========================================================
   PROMPTS
========================================================= */

function buildPrompt(form) {
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

  if (form.materialType === "sermao") return promptSermao(form);
  if (form.materialType === "devocional") return promptDevocional(form);
  if (form.materialType === "estudo") return promptEstudo(form);
  if (form.materialType === "ebook") return promptEbook(form);
  if (form.materialType === "curso") return promptCurso(form);
  if (form.materialType === "livro") return promptLivro(form);

  return promptEstudo(form);
}

function promptBase(form) {
  return `
Você é um escritor cristão, pastor, teólogo, comentarista bíblico e editor de materiais cristãos.

Responda somente em JSON válido.
Não use markdown.
Não use crases.
Não escreva nada fora do JSON.

Dados:
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

Regras:
- Linguagem bíblica, pastoral, didática, profunda e reverente.
- Não produzir conteúdo raso.
- Não repetir ideias vazias.
- Não mencionar inteligência artificial.
- Não usar símbolo do Gemini.
- Manter fidelidade bíblica e doutrinária.
`;
}

function promptRevistaMeta(form) {
  return `
${promptBase(form)}

Crie apenas a estrutura inicial de uma revista mensal de Escola Bíblica Dominical, versão do professor.

Nesta etapa, crie somente:
1. Dados gerais da revista.
2. Apresentação ao professor.
3. Panorama geral da revista.
4. Orientações gerais para o professor.
5. Títulos das 4 lições.

Não desenvolva as lições ainda.
Não crie capa.
Não crie contracapa.

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

Contexto geral:
Apresentação ao professor:
${form.presentationToTeacher}

Panorama:
${form.magazineOverview}

Orientações gerais:
${form.generalTeacherGuidance}

Não gere a revista inteira.
Não gere capa.
Não gere contracapa.
Não gere outras lições.

A lição deve conter conteúdo completo, profundo e organizado.

Cada lição deve conter:
- título
- subtítulo
- texto áureo com versículo por extenso
- verdade prática
- leitura bíblica em classe
- objetivos
- palavra ao professor
- panorama da lição
- introdução
- três tópicos principais
- três subtópicos em cada tópico
- aplicação para a vida
- conclusão
- auxílio bibliológico ou doutrinário
- subsídio histórico
- atenção professor
- apoio doutrinário
- para aprofundamento
- orientações para o professor
- revisando o conteúdo com perguntas e respostas

Use referências bíblicas em tópicos, subtópicos e desenvolvimento.

${form.instrucoesExtras ? `Instruções extras:\n${form.instrucoesExtras}` : ""}

Retorne JSON válido neste formato:

{
  "type": "revistaLesson",
  "number": ${numero},
  "title": "",
  "subtitle": "",
  "goldenText": "",
  "practicalTruth": "",
  "bibleReading": "",
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

A capa deve ser profissional, bíblica, editorial, reverente e coerente com o tema.

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

function promptSermao(form) {
  return `
${promptBase(form)}

Crie um sermão completo com introdução, ${form.sermonPoints} tópicos, aplicação, conclusão e oração.

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

Retorne JSON:

{
  "type": "devocional",
  "title": "",
  "subtitle": "",
  "biblicalBase": "",
  "introduction": "",
  "reflection": "",
  "application": "",
  "prayer": ""
}
`;
}

function promptEstudo(form) {
  return `
${promptBase(form)}

Crie um estudo bíblico/teológico profundo.

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

function promptEbook(form) {
  return `
${promptBase(form)}

Crie um e-book cristão com ${form.quantity} capítulos.

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
      "activity": ""
    }
  ],
  "conclusion": ""
}
`;
}

function promptLivro(form) {
  return `
${promptBase(form)}

Crie um livro cristão com ${form.quantity} capítulos.

Retorne JSON:

{
  "type": "livro",
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

/* =========================================================
   GEMINI
========================================================= */

async function callGeminiText(apiKey, model, prompt) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const resposta = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.62,
        topP: 0.9,
        maxOutputTokens: 14000,
        responseMimeType: "application/json"
      }
    })
  });

  const data = await resposta.json().catch(() => null);

  if (!resposta.ok) {
    throw new Error(data?.error?.message || `Erro no modelo Gemini ${model}.`);
  }

  const texto = data?.candidates?.[0]?.content?.parts
    ?.map((p) => p.text || "")
    .join("\n")
    .trim();

  if (!texto) {
    throw new Error(`O modelo Gemini ${model} não retornou texto.`);
  }

  return texto;
}

/* =========================================================
   OPENAI
========================================================= */

async function callOpenAIText(apiKey, model, prompt) {
  const url = "https://api.openai.com/v1/chat/completions";

  const body = {
    model,
    messages: [
      {
        role: "system",
        content:
          "Você é um assistente de escrita cristã, bíblica e editorial. Responda sempre em JSON válido, sem markdown e sem texto fora do JSON."
      },
      {
        role: "user",
        content: prompt
      }
    ],
    temperature: 0.62,
    top_p: 0.9,
    response_format: {
      type: "json_object"
    },
    max_tokens: 14000
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
    throw new Error(data?.error?.message || `Erro no modelo OpenAI ${model}.`);
  }

  const texto = data?.choices?.[0]?.message?.content?.trim();

  if (!texto) {
    throw new Error(`O modelo OpenAI ${model} não retornou texto.`);
  }

  return texto;
}

/* =========================================================
   PARSER JSON
========================================================= */

function parseJson(texto) {
  if (!texto) return null;

  let limpo = String(texto).trim();

  limpo = limpo
    .replace(/^```json/i, "")
    .replace(/^```/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(limpo);
  } catch (e) {
    const inicio = limpo.indexOf("{");
    const fim = limpo.lastIndexOf("}");

    if (inicio >= 0 && fim > inicio) {
      const recorte = limpo.slice(inicio, fim + 1);

      try {
        return JSON.parse(recorte);
      } catch (erro) {
        return null;
      }
    }

    return null;
  }
}

/* =========================================================
   LIMPEZA DE ERROS
========================================================= */

function limparMensagemErro(msg) {
  const texto = String(msg || "").toLowerCase();

  if (
    texto.includes("quota") ||
    texto.includes("exceeded") ||
    texto.includes("billing") ||
    texto.includes("rate limit") ||
    texto.includes("insufficient_quota")
  ) {
    return "A cota da IA acabou ou a API está sem crédito disponível. Aguarde a renovação da cota ou adicione crédito na Gemini/OpenAI. A revista continua sendo gerada por partes, mas precisa de cota disponível para continuar.";
  }

  if (
    texto.includes("api key") ||
    texto.includes("apikey") ||
    texto.includes("invalid key") ||
    texto.includes("unauthorized")
  ) {
    return "A chave da API está inválida ou não foi configurada corretamente na Vercel. Confira GEMINI_API_KEY e OPENAI_API_KEY.";
  }

  if (texto.includes("json")) {
    return "A IA respondeu fora do formato esperado. Tente gerar novamente ou reduza um pouco o tamanho do pedido.";
  }

  if (texto.includes("model") && texto.includes("not found")) {
    return "Um dos modelos configurados não está disponível na sua conta. Verifique os nomes dos modelos nas variáveis da Vercel.";
  }

  return String(msg || "Erro ao gerar material.");
}
