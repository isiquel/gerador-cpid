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

    let resultado = await gerarComFallback({
      form,
      prompt,
      geminiApiKey,
      openaiApiKey
    });

    if (!resultado.material && form.materialType === "revista" && form.revistaPart === "lesson") {
      const promptCompacto = promptRevistaLicao(form, true);

      resultado = await gerarComFallback({
        form,
        prompt: promptCompacto,
        geminiApiKey,
        openaiApiKey
      });
    }

    if (!resultado.material && form.materialType === "livro" && form.livroPart === "chapter") {
      const promptCompacto = promptLivroCapitulo(form, true);

      resultado = await gerarComFallback({
        form,
        prompt: promptCompacto,
        geminiApiKey,
        openaiApiKey
      });
    }

    if (!resultado.material) {
      return res.status(500).json({
        error:
          resultado.error ||
          "A IA não conseguiu gerar um JSON válido. Tente novamente em alguns instantes."
      });
    }

    return res.status(200).json({
      material: resultado.material,
      provider: resultado.provider
    });
  } catch (erro) {
    return res.status(500).json({
      error: erro?.message || "Erro interno ao gerar material."
    });
  }
}

/* =========================================================
   NORMALIZAÇÃO DOS DADOS
========================================================= */

function normalizeForm(body) {
  const materialType = String(
    body.materialType ||
    body.tipoMaterial ||
    body.tipo ||
    "sermao"
  ).trim().toLowerCase();

  let sermonPoints = Number(body.sermonPoints || 3);

  if (!Number.isFinite(sermonPoints)) {
    sermonPoints = 3;
  }

  sermonPoints = Math.max(3, Math.min(5, sermonPoints));

  let quantity = Number(
    body.quantity ||
    body.quantidadeLicoes ||
    body.qtdLicoes ||
    body.licoes ||
    4
  );

  if (!Number.isFinite(quantity)) {
    quantity = 4;
  }

  if (materialType === "revista") {
    quantity = 4;
  }

  if (materialType === "livro") {
    quantity = Math.max(1, Math.min(20, quantity));
  }

  if (materialType === "ebook") {
    quantity = Math.max(1, Math.min(12, quantity));
  }

  if (materialType === "curso") {
    quantity = Math.max(1, Math.min(20, quantity));
  }

  return {
    adminCode: String(body.adminCode || body.codigoAcesso || "").trim(),

    materialType,

    revistaPart: String(body.revistaPart || "").trim(),
    livroPart: String(body.livroPart || "").trim(),

    lessonNumber: Number(body.lessonNumber || 0),
    chapterNumber: Number(body.chapterNumber || 0),

    lessonTitles: Array.isArray(body.lessonTitles) ? body.lessonTitles : [],
    chapterPlan: Array.isArray(body.chapterPlan) ? body.chapterPlan : [],

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

    depthLevel: String(body.depthLevel || body.profundidade || "profundo").trim(),
    visualStyle: String(body.visualStyle || body.estiloVisual || "colorido").trim(),
    tone: String(body.tone || body.tomMaterial || "").trim(),

    coverMode: String(body.coverMode || body.capa || "com-capa").trim(),

    presentationToTeacher: String(body.presentationToTeacher || "").trim(),
    magazineOverview: String(body.magazineOverview || "").trim(),
    generalTeacherGuidance: String(body.generalTeacherGuidance || "").trim(),

    instrucoesExtras: String(body.instrucoesExtras || "").trim()
  };
}

/* =========================================================
   FALLBACK GEMINI + OPENAI
========================================================= */

async function gerarComFallback({ form, prompt, geminiApiKey, openaiApiKey }) {
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

        erros.push(`Gemini ${model}: retornou texto, mas não retornou JSON válido.`);
      } catch (erro) {
        erros.push(`Gemini ${model}: ${erro?.message || "erro desconhecido"}`);
      }
    }
  }

  if (openaiApiKey) {
    const openaiModels = limparLista([
      process.env.OPENAI_TEXT_MODEL_1 || "gpt-5.5",
      process.env.OPENAI_TEXT_MODEL_2 || "gpt-4.1-mini",
      process.env.OPENAI_TEXT_MODEL_3 || "gpt-4.1",
      process.env.OPENAI_TEXT_MODEL_4 || "gpt-4.1-nano"
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

        erros.push(`OpenAI ${model}: retornou texto, mas não retornou JSON válido.`);
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
    return promptRevistaLicao(form, false);
  }

  if (form.materialType === "revista" && form.revistaPart === "cover") {
    return promptRevistaCapa(form);
  }

  if (form.materialType === "revista" && form.revistaPart === "backcover") {
    return promptRevistaContracapa(form);
  }

  if (form.materialType === "livro" && form.livroPart === "meta") {
    return promptLivroMeta(form);
  }

  if (form.materialType === "livro" && form.livroPart === "chapter") {
    return promptLivroCapitulo(form, false);
  }

  if (form.materialType === "sermao") return promptSermao(form);
  if (form.materialType === "devocional") return promptDevocional(form);
  if (form.materialType === "estudo") return promptEstudo(form);
  if (form.materialType === "ebook") return promptEbook(form);
  if (form.materialType === "curso") return promptCurso(form);

  return promptEstudo(form);
}

function promptBase(form) {
  return `
Você é um escritor cristão, pastor, teólogo, comentarista bíblico, editor de revista de Escola Bíblica Dominical e produtor de materiais cristãos.

Responda exclusivamente em JSON válido.
Não use markdown.
Não use crases.
Não escreva comentários fora do JSON.
Não use campos técnicos em inglês fora do JSON solicitado.
Não escreva nada fora da estrutura pedida.

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
- Use linguagem bíblica, pastoral, didática, profunda, reverente e edificante.
- Desenvolva ideias com profundidade.
- Não escreva de forma rasa.
- Não entregue apenas títulos.
- Sempre que fizer afirmações doutrinárias, use referências bíblicas adequadas.
- As referências bíblicas devem aparecer de forma natural dentro dos argumentos.
- Não invente fontes acadêmicas inexistentes.
- Não invente páginas de livros se não tiver certeza.
- Use materiais reais e conhecidos quando indicar aprofundamento.
- Não use símbolo do Gemini.
- Não mencione inteligência artificial.
- Não diga que o conteúdo foi gerado por IA.
`;
}

/* =========================================================
   REVISTA EBD
========================================================= */

function promptRevistaMeta(form) {
  return `
${promptBase(form)}

Crie apenas a estrutura inicial de uma revista mensal de Escola Bíblica Dominical, versão do professor.

IMPORTANTE:
Nesta etapa, crie somente:
1. Dados gerais da revista.
2. Apresentação ao professor.
3. Panorama geral da revista.
4. Orientações gerais para o professor.
5. Títulos das 4 lições.

Não desenvolva as lições ainda.
Não crie a capa ainda.
Não crie a contracapa ainda.

A revista deve ser:
- Revista mensal de Escola Bíblica Dominical.
- Versão do professor.
- Classe adulta.
- Com 4 lições.
- Com conteúdo coerente do início ao fim.
- Com foco bíblico, doutrinário, pastoral e pentecostal clássico.

A apresentação ao professor deve:
- Falar diretamente ao coração do professor.
- Animar espiritualmente o professor.
- Mostrar a importância do tema.
- Explicar o que será estudado no mês.
- Orientar sobre oração, preparo, leitura prévia e reverência.
- Mostrar que a aula não deve ser apenas informação, mas formação espiritual.

O panorama geral deve:
- Explicar como as quatro lições se conectam.
- Mostrar a progressão do estudo.
- Ser claro, objetivo e edificante.

Retorne JSON neste formato exato:

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

function promptRevistaLicao(form, compacto) {
  const numero = form.lessonNumber || 1;
  const tituloSugerido = form.lessonTitles[numero - 1] || `Lição ${numero}`;

  return `
${promptBase(form)}

Crie somente a LIÇÃO ${numero} da revista mensal de Escola Bíblica Dominical, versão do professor.

Título sugerido da lição:
${tituloSugerido}

A revista completa tem estas lições:
${form.lessonTitles.map((t, i) => `${i + 1}. ${t}`).join("\n")}

Contexto geral da revista:
Apresentação ao professor:
${form.presentationToTeacher}

Panorama geral da revista:
${form.magazineOverview}

Orientações gerais:
${form.generalTeacherGuidance}

INSTRUÇÃO MUITO IMPORTANTE:
Esta etapa deve gerar apenas uma lição completa.
Não gere capa.
Não gere contracapa.
Não gere as outras lições.
Não gere a revista inteira.

A lição deve ser completa e profunda, com começo, meio e fim.

Cada lição deve conter:
- Título da lição
- Subtítulo
- Texto áureo com o versículo escrito por extenso
- Verdade prática
- Leitura bíblica em classe com os textos escritos por extenso
- Objetivos da lição
- Palavra ao professor
- Panorama da lição
- Introdução
- Três tópicos principais
- Cada tópico principal deve ter referência bíblica de cabeçalho
- Cada tópico principal deve ter texto argumentativo
- Cada tópico deve ter três subtópicos
- Cada subtópico deve ter referência bíblica própria
- Cada subtópico deve ter conteúdo desenvolvido, explicação bíblica, doutrinária e aplicação prática
- Aplicação para a vida
- Conclusão
- Auxílio bibliológico ou doutrinário
- Subsídio histórico
- Atenção, professor: cuidado na interpretação
- Apoio doutrinário
- Para aprofundamento
- Orientações para o professor
- Revisando o conteúdo com perguntas e respostas

ORDEM OBRIGATÓRIA DO FINAL DA LIÇÃO:
1. Aplicação para a vida
2. Conclusão
3. Auxílio bibliológico ou doutrinário
4. Subsídio histórico
5. Atenção, professor: cuidado na interpretação
6. Apoio doutrinário
7. Para aprofundamento
8. Orientações para o professor
9. Revisando o conteúdo

REFERÊNCIAS BÍBLICAS:
- Use referência bíblica no cabeçalho de cada tópico principal.
- Use referência bíblica em cada subtópico.
- Use referências bíblicas dentro dos parágrafos, quando estiver explicando doutrina.
- Não coloque todas as referências apenas em um canto isolado.
- As referências precisam estar ligadas ao argumento.

AUXÍLIO BIBLIOLÓGICO OU DOUTRINÁRIO:
- Crie um quadro útil para o professor.
- O auxílio deve aprofundar um ponto importante da lição.
- Pode citar obras reais e conhecidas, mas não invente página se não tiver certeza.
- O texto deve parecer material editorial de apoio ao professor.

PARA APROFUNDAMENTO:
No campo recommendedDeepening, indique materiais reais, úteis e conhecidos para estudo do professor.
Escolha materiais coerentes com esta lição.
Use sugestões como:
- Bíblia de Estudo Pentecostal
- Bíblia de Estudo Aplicação Pessoal
- Bíblia de Estudo Plenitude
- Bíblia de Estudo de Genebra
- Manual Bíblico de Halley
- Introdução Bíblica, de Norman Geisler e William Nix
- Teologia Sistemática Pentecostal
- Teologia Sistemática de Norman Geisler
- Teologia Sistemática de Wayne Grudem
- Comentário Bíblico Beacon
- Comentário Bíblico Moody
- Dicionário Bíblico Wycliffe
- Dicionário Bíblico Baker

Não use indicações vagas como “diversos autores”.
Não invente nomes de livros.

${compacto ? `
MODO COMPACTO:
A resposta anterior pode ter ficado grande demais. Mantenha a lição completa, mas seja mais objetivo em cada campo. Não remova nenhum campo do JSON.
` : ""}

${form.instrucoesExtras ? `Instruções extras:\n${form.instrucoesExtras}` : ""}

Retorne JSON válido exatamente neste formato:

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
      ]
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
      ]
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

Crie somente o conceito editorial da CAPA FRONTAL da revista.

IMPORTANTE:
Não gere a revista inteira.
Não gere lições.
Não gere contracapa.
Crie apenas os dados da capa frontal.

A capa deve parecer capa profissional de revista cristã de Escola Bíblica Dominical.
Deve ser viva, bonita, temática, editorial e coerente com o tema.
Não deve ser genérica.
Não deve parecer um cartão simples.
Não deve usar símbolo do Gemini.
Não copiar CPAD, mas pode ter acabamento editorial inspirado em revista cristã.

Tema da revista:
${form.title}
${form.subtitle}
${form.theme}

A capa deve ter uma ilustração/conceito visual baseado no tema.
Se o tema for Bibliologia ou Bíblia, use ideias como:
- Bíblia aberta
- pergaminhos
- manuscritos
- mesa de estudo
- luz dourada
- atmosfera de reverência
- páginas antigas
- brilho suave
- sensação de conhecimento e autoridade da Palavra

Retorne JSON válido neste formato:

{
  "type": "revistaCover",
  "title": "",
  "subtitle": "",
  "topLabel": "Revista Mensal de Escola Bíblica Dominical",
  "versionLabel": "Revista do Professor",
  "author": "",
  "ministry": "",
  "visualTheme": "",
  "illustrationType": "bibliologia",
  "frontIllustrationDescription": "",
  "mainColor": "",
  "secondaryColor": "",
  "accentColor": "",
  "atmosphere": "",
  "coverPhrase": ""
}
`;
}

function promptRevistaContracapa(form) {
  return `
${promptBase(form)}

Crie somente o conceito editorial da CONTRACAPA da revista.

IMPORTANTE:
Não gere a revista inteira.
Não gere lições.
Não gere capa frontal.
Crie apenas a contracapa.

A contracapa deve combinar com a capa frontal e com o tema da revista.
Pode conter uma frase curta, bonita e espiritual sobre o tema.
Deve ter aparência de fechamento editorial, limpa, bonita e profissional.

Retorne JSON válido neste formato:

{
  "type": "revistaBackCover",
  "title": "",
  "subtitle": "",
  "ministry": "",
  "author": "",
  "backCoverPhrase": "",
  "backCoverText": "",
  "visualTheme": "",
  "mainColor": "",
  "secondaryColor": "",
  "accentColor": ""
}
`;
}

/* =========================================================
   LIVRO
========================================================= */

function promptLivroMeta(form) {
  return `
${promptBase(form)}

Crie o planejamento geral de um livro cristão.

Não escreva os capítulos completos ainda.
Crie apenas a estrutura, tese central, caminho de leitura e plano dos capítulos.

Retorne JSON válido neste formato:

{
  "type": "livro",
  "title": "",
  "subtitle": "",
  "theme": "",
  "targetAudience": "",
  "author": "",
  "ministry": "",
  "preface": "",
  "presentation": "",
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

Quantidade de capítulos: ${form.quantity}
`;
}

function promptLivroCapitulo(form, compacto) {
  return `
${promptBase(form)}

Crie apenas o capítulo ${form.chapterNumber} do livro cristão.

Tese central do livro:
${form.bookCentralThesis}

Caminho de leitura:
${form.readingPath}

Resumo do capítulo anterior:
${form.previousChapterSummary}

Plano geral dos capítulos:
${JSON.stringify(form.chapterPlan, null, 2)}

IMPORTANTE:
Livro não deve parecer apostila.
Não coloque referências bíblicas em bloco solto.
As referências bíblicas devem aparecer integradas no argumento, nos parágrafos e nas citações.
O capítulo deve desenvolver uma ideia como um autor escrevendo um livro.

${compacto ? `
MODO COMPACTO:
Seja mais objetivo, mas mantenha o capítulo com formato de livro e com todos os campos do JSON.
` : ""}

Retorne JSON válido:

{
  "type": "livroChapter",
  "number": ${form.chapterNumber},
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
   OUTROS MATERIAIS
========================================================= */

function promptSermao(form) {
  return `
${promptBase(form)}

Crie um sermão completo com:
- introdução
- ${form.sermonPoints} tópicos principais
- referências bíblicas
- aplicação
- conclusão
- apelo ou oração final

Retorne JSON válido:

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

Retorne JSON válido:

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

Retorne JSON válido:

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

Retorne JSON válido:

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

Retorne JSON válido:

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
        maxOutputTokens: 18000,
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
   OPENAI / CHATGPT
========================================================= */

async function callOpenAIText(apiKey, model, prompt) {
  const primeiraTentativa = await tentarOpenAIChat({
    apiKey,
    model,
    prompt,
    usarMaxCompletionTokens: true,
    usarTemperatura: true
  });

  if (primeiraTentativa.ok) {
    return primeiraTentativa.texto;
  }

  const mensagem = primeiraTentativa.erro || "";

  const precisaTentarSemTemperatura =
    mensagem.toLowerCase().includes("temperature") ||
    mensagem.toLowerCase().includes("top_p") ||
    mensagem.toLowerCase().includes("unsupported");

  if (precisaTentarSemTemperatura) {
    const segundaTentativa = await tentarOpenAIChat({
      apiKey,
      model,
      prompt,
      usarMaxCompletionTokens: true,
      usarTemperatura: false
    });

    if (segundaTentativa.ok) {
      return segundaTentativa.texto;
    }

    const terceiraTentativa = await tentarOpenAIChat({
      apiKey,
      model,
      prompt,
      usarMaxCompletionTokens: false,
      usarTemperatura: false
    });

    if (terceiraTentativa.ok) {
      return terceiraTentativa.texto;
    }

    throw new Error(terceiraTentativa.erro || segundaTentativa.erro || primeiraTentativa.erro);
  }

  const tentarMaxTokensAntigo =
    mensagem.toLowerCase().includes("max_completion_tokens") ||
    mensagem.toLowerCase().includes("max_tokens");

  if (tentarMaxTokensAntigo) {
    const segundaTentativa = await tentarOpenAIChat({
      apiKey,
      model,
      prompt,
      usarMaxCompletionTokens: false,
      usarTemperatura: true
    });

    if (segundaTentativa.ok) {
      return segundaTentativa.texto;
    }

    throw new Error(segundaTentativa.erro || primeiraTentativa.erro);
  }

  throw new Error(primeiraTentativa.erro || `Erro no modelo OpenAI ${model}.`);
}

async function tentarOpenAIChat({
  apiKey,
  model,
  prompt,
  usarMaxCompletionTokens,
  usarTemperatura
}) {
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
    response_format: {
      type: "json_object"
    }
  };

  if (usarTemperatura) {
    body.temperature = 0.62;
    body.top_p = 0.9;
  }

  if (usarMaxCompletionTokens) {
    body.max_completion_tokens = 16000;
  } else {
    body.max_tokens = 16000;
  }

  try {
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
      return {
        ok: false,
        texto: "",
        erro: data?.error?.message || `Erro no modelo OpenAI ${model}.`
      };
    }

    const texto = data?.choices?.[0]?.message?.content?.trim();

    if (!texto) {
      return {
        ok: false,
        texto: "",
        erro: `O modelo OpenAI ${model} não retornou texto.`
      };
    }

    return {
      ok: true,
      texto,
      erro: ""
    };
  } catch (erro) {
    return {
      ok: false,
      texto: "",
      erro: erro?.message || `Erro ao chamar OpenAI ${model}.`
    };
  }
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
