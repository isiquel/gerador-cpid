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

  const lessonTitles = Array.isArray(body.lessonTitles) ? body.lessonTitles : [];
  const chapterPlan = Array.isArray(body.chapterPlan) ? body.chapterPlan : [];

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

  if (form.materialType === "livro" && form.livroPart === "meta") {
    return promptLivroMeta(form);
  }

  if (form.materialType === "livro" && form.livroPart === "chapter") {
    return promptLivroCapitulo(form);
  }

  if (form.materialType === "livro") return promptLivro(form);
  if (form.materialType === "sermao") return promptSermao(form);
  if (form.materialType === "devocional") return promptDevocional(form);
  if (form.materialType === "estudo") return promptEstudo(form);
  if (form.materialType === "ebook") return promptEbook(form);
  if (form.materialType === "curso") return promptCurso(form);

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
- Escreva em português do Brasil.
- Use linguagem bíblica, pastoral, didática, reverente e adulta.
- Siga uma linha pentecostal clássica quando o assunto permitir.
- Não produza conteúdo raso.
- Não repita frases vazias.
- Não mencione inteligência artificial.
- Não use símbolo do Gemini.
- Não invente dados históricos inseguros.
- Explique os textos bíblicos usados.
- Use fidelidade bíblica e doutrinária.
- Seja profundo, mas não escreva respostas longas demais a ponto de quebrar o JSON.
`.trim();
}

/* =========================================================
   REVISTA EBD
========================================================= */

function promptRevistaMeta(form) {
  return `
${promptBase(form)}

Crie apenas a estrutura inicial de uma revista mensal de Escola Bíblica Dominical, versão do professor.

O modelo deve seguir uma revista pedagógica de EBD do professor, com:
- apresentação ao professor;
- panorama geral da revista;
- orientação geral ao professor;
- quatro lições organizadas.

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

A lição deve seguir o modelo de uma REVISTA DO PROFESSOR de Escola Bíblica Dominical.

FORMATO PEDAGÓGICO OBRIGATÓRIO:
1. Cabeçalho da lição.
2. Texto áureo com referência e versículo por extenso.
3. Verdade prática.
4. Leitura diária de segunda a sábado.
5. Leitura bíblica em classe com referência e texto por extenso.
6. Hinos sugeridos.
7. Plano de aula.
8. Palavra-chave.
9. Comentário da lição com introdução, três tópicos e subtópicos.
10. Sinopse de cada tópico.
11. Auxílio bibliológico ou doutrinário.
12. Ampliando o conhecimento.
13. Aplicação prática.
14. Conclusão.
15. Perguntas e respostas para revisão.

REGRAS PARA NÃO QUEBRAR A GERAÇÃO:
- Não escreva textos enormes.
- Cada subtópico deve ter 1 parágrafo forte, claro e útil ao professor.
- Cada tópico principal deve ter 1 parágrafo introdutório.
- A leitura bíblica em classe deve trazer o texto bíblico por extenso, mas escolha uma leitura moderada, de preferência entre 4 e 8 versículos.
- Não tente escrever uma revista inteira dentro de uma única lição.
- Não deixe o JSON quebrado.
- Não coloque aspas desnecessárias dentro dos textos, para evitar quebrar o JSON.
- Não use quebras exageradas.

REGRAS DE QUALIDADE:
- O conteúdo não pode ser raso.
- Cada subtópico precisa ter explicação bíblica, doutrinária e aplicação pastoral.
- Explique a referência bíblica usada.
- Escreva como material para professor adulto.
- Inclua orientação para o professor conduzir a aula.
- Use linguagem clara, madura, bíblica e reverente.

A LEITURA BÍBLICA EM CLASSE deve seguir este padrão:
[
  {
    "reference": "Referência bíblica",
    "text": "Texto bíblico por extenso"
  }
]

A LEITURA DIÁRIA deve seguir este padrão:
[
  {
    "day": "Segunda",
    "reference": "",
    "theme": ""
  }
]

${form.instrucoesExtras ? `Instruções extras do usuário:\n${form.instrucoesExtras}` : ""}

Retorne JSON válido neste formato:

{
  "type": "revistaLesson",
  "number": ${numero},
  "date": "",
  "title": "",
  "subtitle": "",
  "imagePrompt": "",
  "goldenText": "",
  "practicalTruth": "",
  "dailyReading": [
    {
      "day": "Segunda",
      "reference": "",
      "theme": ""
    },
    {
      "day": "Terça",
      "reference": "",
      "theme": ""
    },
    {
      "day": "Quarta",
      "reference": "",
      "theme": ""
    },
    {
      "day": "Quinta",
      "reference": "",
      "theme": ""
    },
    {
      "day": "Sexta",
      "reference": "",
      "theme": ""
    },
    {
      "day": "Sábado",
      "reference": "",
      "theme": ""
    }
  ],
  "bibleReading": [
    {
      "reference": "",
      "text": ""
    }
  ],
  "hymns": ["", "", ""],
  "lessonPlan": {
    "introduction": "",
    "objectives": ["", "", ""],
    "methodology": "",
    "application": "",
    "conclusion": ""
  },
  "keyword": "",
  "teacherWord": "",
  "lessonOverview": "",
  "introduction": "",
  "topics": [
    {
      "title": "",
      "reference": "",
      "text": "",
      "subtopics": [
        {
          "title": "",
          "reference": "",
          "text": ""
        },
        {
          "title": "",
          "reference": "",
          "text": ""
        },
        {
          "title": "",
          "reference": "",
          "text": ""
        }
      ],
      "synopsis": "",
      "teacherAid": "",
      "expandingKnowledge": ""
    },
    {
      "title": "",
      "reference": "",
      "text": "",
      "subtopics": [
        {
          "title": "",
          "reference": "",
          "text": ""
        },
        {
          "title": "",
          "reference": "",
          "text": ""
        },
        {
          "title": "",
          "reference": "",
          "text": ""
        }
      ],
      "synopsis": "",
      "teacherAid": "",
      "expandingKnowledge": ""
    },
    {
      "title": "",
      "reference": "",
      "text": "",
      "subtopics": [
        {
          "title": "",
          "reference": "",
          "text": ""
        },
        {
          "title": "",
          "reference": "",
          "text": ""
        },
        {
          "title": "",
          "reference": "",
          "text": ""
        }
      ],
      "synopsis": "",
      "teacherAid": "",
      "expandingKnowledge": ""
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
    {
      "question": "",
      "answer": ""
    },
    {
      "question": "",
      "answer": ""
    },
    {
      "question": "",
      "answer": ""
    },
    {
      "question": "",
      "answer": ""
    },
    {
      "question": "",
      "answer": ""
    }
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

Crie uma revista de EBD em formato resumido. O modo principal do sistema gera a revista por partes.

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
  "conclusion": "",
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

/* =========================================================
   EBOOK / CURSO / LIVRO
========================================================= */

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
      temperature: 0.65,
      topP: 0.9,
      maxOutputTokens: 12000,
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
    temperature: 0.65,
    max_tokens: 12000,
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
        throw new Error("A IA respondeu, mas o JSON veio quebrado. A lição ficou grande demais. Tente gerar novamente.");
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

  if (
    texto.includes("maximum context") ||
    texto.includes("max_tokens") ||
    texto.includes("token") ||
    texto.includes("json veio quebrado")
  ) {
    return "A lição ficou grande demais e a IA cortou a resposta. O código foi ajustado para reduzir o tamanho, mas tente gerar novamente.";
  }

  if (texto.includes("json")) {
    return "A IA respondeu fora do formato esperado. Tente gerar novamente.";
  }

  if (texto.includes("model") && texto.includes("not found")) {
    return "Um dos modelos configurados não está disponível na sua conta. Verifique os nomes dos modelos nas variáveis da Vercel.";
  }

  return String(msg || "Erro ao gerar material.");
}
