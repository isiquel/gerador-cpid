module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Método não permitido. Use POST." });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        ok: false,
        error: "A variável GEMINI_API_KEY não foi encontrada na Vercel."
      });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const form = normalizeForm(body);

    const models = [
      process.env.GEMINI_TEXT_MODEL_1 || "gemini-3.5-flash",
      process.env.GEMINI_TEXT_MODEL_2 || "gemini-3.1-flash-lite",
      process.env.GEMINI_TEXT_MODEL_3 || "gemini-2.5-flash",
      process.env.GEMINI_TEXT_MODEL_4 || "gemini-2.5-flash-lite",
      "gemini-2.0-flash"
    ].filter(Boolean);

    const prompt = buildPrompt(form);
    const result = await callGeminiText(apiKey, models, prompt);
    const text = extractText(result.data);
    let material = parseJson(text);

    if (!material && form.materialType === "revista" && form.revistaPart === "lesson") {
      const compactPrompt = promptRevistaLicao(form, true);
      const compactResult = await callGeminiText(apiKey, models, compactPrompt);
      const compactText = extractText(compactResult.data);
      material = parseJson(compactText);
    }

    if (!material) {
      return res.status(500).json({
        ok: false,
        error: "A IA respondeu, mas não entregou um JSON válido. Tente novamente em alguns segundos."
      });
    }

    material.appName = "VERBO IA";
    material.selectedType = form.materialType;
    material.revistaVersion = form.revistaVersion;
    material.bibleVersion = form.bibleVersion;
    material.author = material.author || form.author;
    material.ministry = material.ministry || form.ministry;
    material.visualStyle = form.visualStyle;

    return res.status(200).json({
      ok: true,
      modelUsed: result.modelUsed,
      material
    });

  } catch (error) {
    console.error("Erro em api/gerar.js:", error);

    return res.status(500).json({
      ok: false,
      error: error.message || "Erro interno ao gerar o material."
    });
  }
};

function normalizeForm(body) {
  const tipo = String(body.materialType || "ebook").trim();
  const revistaPart = String(body.revistaPart || "").trim();
  const lessonNumber = Number(body.lessonNumber || 1);

  let quantidade = Number(body.quantity || 3);
  let sermonPoints = Number(body.sermonPoints || 3);

  if (!Number.isFinite(quantidade)) quantidade = 3;
  if (!Number.isFinite(sermonPoints)) sermonPoints = 3;

  sermonPoints = Math.max(3, Math.min(sermonPoints, 5));

  if (tipo === "sermao") {
    quantidade = 1;
  } else if (tipo === "revista") {
    quantidade = 4;
  } else if (tipo === "devocional") {
    quantidade = Math.max(1, Math.min(quantidade, 30));
  } else {
    quantidade = Math.max(1, Math.min(quantidade, 12));
  }

  return {
    appName: "VERBO IA",
    materialType: tipo,
    revistaPart,
    lessonNumber,
    lessonTitles: body.lessonTitles || [],
    revistaVersion: String(body.revistaVersion || "professor").trim(),
    bibleVersion: String(body.bibleVersion || "King James Fiel 1611").trim(),
    sermonPoints,
    title: String(body.title || "Material cristão").trim(),
    subtitle: String(body.subtitle || "").trim(),
    theme: String(body.theme || "").trim(),
    biblicalBase: String(body.biblicalBase || "").trim(),
    quantity: quantidade,
    targetAudience: String(body.targetAudience || "Igreja em geral").trim(),
    author: String(body.author || "Pr. Isiquel Rodrigues").trim(),
    ministry: String(body.ministry || "CPID - Casa Publicadora da Igreja de Deus").trim(),
    depthLevel: String(body.depthLevel || "muito profundo").trim(),
    visualStyle: String(body.visualStyle || "preto e branco").trim(),
    tone: String(body.tone || "pastoral, bíblico, profundo e encorajador").trim()
  };
}

function buildPrompt(form) {
  if (form.materialType === "revista" && form.revistaPart === "meta") return promptRevistaMeta(form);
  if (form.materialType === "revista" && form.revistaPart === "lesson") return promptRevistaLicao(form, false);
  if (form.materialType === "sermao") return promptSermao(form);
  if (form.materialType === "livro") return promptLivro(form);
  if (form.materialType === "devocional") return promptDevocional(form);
  if (form.materialType === "estudo") return promptEstudo(form);
  if (form.materialType === "curso") return promptCurso(form);
  if (form.materialType === "revista") return promptRevistaMeta(form);
  return promptEbook(form);
}

function baseDados(form, nome) {
  return `
DADOS DO MATERIAL:
Tipo: ${nome}
Título: ${form.title}
Subtítulo: ${form.subtitle || "Crie se for necessário"}
Tema: ${form.theme || form.title}
Texto bíblico base: ${form.biblicalBase || "Escolha textos bíblicos coerentes"}
Quantidade: ${form.quantity}
Versão da revista: ${form.revistaVersion}
Tradução bíblica padrão: ${form.bibleVersion}
Público-alvo: ${form.targetAudience}
Autor: ${form.author}
Ministério/Editora: ${form.ministry}
Profundidade: ${form.depthLevel}
Tom: ${form.tone}
`.trim();
}

function regrasJson() {
  return `
REGRAS OBRIGATÓRIAS:
1. Responda somente em JSON válido.
2. Não use markdown.
3. Não escreva nada fora do JSON.
4. Não gere HTML.
5. Não gere PDF.
6. Não gere imagem.
7. Use português do Brasil.
8. O conteúdo precisa ser bíblico, profundo, pastoral, claro e aplicável.
9. Não use aspas duplas dentro dos textos, a não ser que estejam escapadas corretamente.
10. Evite caracteres que quebrem JSON.
11. Não use travessões longos demais, símbolos decorativos ou listas enormes dentro de um único campo.
`.trim();
}

function promptRevistaMeta(form) {
  const versaoTexto = form.revistaVersion === "aluno" ? "REVISTA DO ALUNO" : "REVISTA DO PROFESSOR";

  return `
Você é um comentarista de revista bíblica, pastor, teólogo e professor de Escola Bíblica Dominical.

Crie apenas os DADOS GERAIS de uma REVISTA MENSAL DE EBD.
Não crie as lições completas agora. Apenas organize a revista e planeje os títulos das 4 lições.

VERSÃO:
${versaoTexto}

${baseDados(form, "Revista mensal de ensino bíblico")}
${regrasJson()}

REGRAS:
1. A revista é mensal.
2. Deve ter exatamente 4 lições, uma por semana.
3. Cada título de lição deve seguir o tema geral.
4. A revista do aluno e a revista do professor devem ter a mesma linha temática.
5. O conteúdo deve seguir linha bíblica conservadora e pentecostal clássica quando envolver Espírito Santo, dons, igreja e escatologia.
6. A apresentação deve ser boa, mas objetiva, com no máximo 220 palavras.

FORMATO JSON:
{
  "type": "revista",
  "revistaVersion": "${form.revistaVersion}",
  "bibleVersion": "${form.bibleVersion}",
  "title": "",
  "subtitle": "",
  "targetAudience": "",
  "author": "",
  "ministry": "",
  "quarterPresentation": "",
  "lessonTitles": [
    { "lesson": 1, "title": "" },
    { "lesson": 2, "title": "" },
    { "lesson": 3, "title": "" },
    { "lesson": 4, "title": "" }
  ],
  "finalWord": ""
}
`.trim();
}

function promptRevistaLicao(form, compacto) {
  const isProfessor = form.revistaVersion === "professor";
  const versaoTexto = isProfessor ? "REVISTA DO PROFESSOR" : "REVISTA DO ALUNO";

  const tituloPlanejado = Array.isArray(form.lessonTitles)
    ? (form.lessonTitles.find(x => Number(x.lesson) === Number(form.lessonNumber))?.title || "")
    : "";

  const controleProfessor = isProfessor
    ? `
REGRAS EXTRAS PARA A VERSÃO DO PROFESSOR:
1. O conteúdo principal da lição deve continuar profundo.
2. As respostas das perguntas devem ser objetivas, com no máximo 35 palavras cada.
3. Orientações para o professor: máximo 80 palavras.
4. Sugestão de abordagem em classe: máximo 80 palavras.
5. Observação pastoral: máximo 70 palavras.
6. Não repita o conteúdo dos tópicos nas orientações do professor.
7. Não escreva comentários longos demais nos campos teacherNotes, classApproach e pastoralObservation.
`
    : `
REGRAS EXTRAS PARA A VERSÃO DO ALUNO:
1. Não inclua gabarito.
2. Não inclua orientação interna do professor.
3. As perguntas devem vir sem respostas.
`;

  const limites = compacto
    ? `
MODO COMPACTO DE SEGURANÇA:
1. Esta geração precisa ser mais leve para não quebrar a API.
2. Introdução: 80 a 120 palavras.
3. Cada tópico principal: 40 a 70 palavras.
4. Cada subtópico: 55 a 85 palavras.
5. Conclusão: 70 a 100 palavras.
6. Leitura bíblica em classe: no máximo 4 versículos.
7. Perguntas e respostas: objetivas.
`
    : `
LIMITES DE TAMANHO:
1. Introdução: 90 a 140 palavras.
2. Cada tópico principal: 50 a 80 palavras.
3. Cada subtópico: 65 a 100 palavras.
4. Conclusão: 75 a 110 palavras.
5. Leitura bíblica em classe: no máximo 5 versículos.
6. Não escreva textos longos demais em um único campo.
`;

  return `
Você é um comentarista de revista bíblica, pastor, teólogo e professor de Escola Bíblica Dominical.

Crie SOMENTE A LIÇÃO ${form.lessonNumber} de uma revista mensal de EBD.
Não crie as outras lições.
Esta chamada faz parte de uma geração por partes.

VERSÃO:
${versaoTexto}

TÍTULO PLANEJADO DA LIÇÃO:
${tituloPlanejado || "Crie um título coerente com o tema"}

${baseDados(form, "Revista mensal de ensino bíblico - lição individual")}
${regrasJson()}

REGRAS DA LIÇÃO:
1. Crie somente a lição ${form.lessonNumber}.
2. A lição deve ser profunda, didática, bíblica e aplicável.
3. Deve seguir padrão de revista de EBD.
4. Deve conter exatamente 3 tópicos principais.
5. Cada tópico principal deve conter exatamente 3 subtópicos.
6. Cada subtópico deve conter título, referência bíblica relacionada, explicação bíblica e aplicação prática.
7. A revista do aluno também deve ser completa, explicativa e profunda.
8. A versão do professor deve ter o mesmo conteúdo principal da versão do aluno, mas com recursos extras controlados.
9. Use como padrão textual a King James Fiel 1611.
10. Siga linha bíblica conservadora e pentecostal clássica quando envolver Espírito Santo, dons, igreja e escatologia.
11. Antes de publicação oficial, o texto bíblico deve ser revisado conforme a edição autorizada da tradução usada.

${limites}

${controleProfessor}

FORMATO JSON:
{
  "lesson": ${form.lessonNumber},
  "title": "",
  "goldenText": "",
  "practicalTruth": "",
  "biblicalReadingReference": "",
  "biblicalReadingFull": [
    {
      "reference": "",
      "text": ""
    }
  ],
  "objectives": ["", "", ""],
  "introduction": "",
  "topics": [
    {
      "title": "",
      "content": "",
      "subtopics": [
        { "title": "", "reference": "", "content": "" },
        { "title": "", "reference": "", "content": "" },
        { "title": "", "reference": "", "content": "" }
      ]
    },
    {
      "title": "",
      "content": "",
      "subtopics": [
        { "title": "", "reference": "", "content": "" },
        { "title": "", "reference": "", "content": "" },
        { "title": "", "reference": "", "content": "" }
      ]
    },
    {
      "title": "",
      "content": "",
      "subtopics": [
        { "title": "", "reference": "", "content": "" },
        { "title": "", "reference": "", "content": "" },
        { "title": "", "reference": "", "content": "" }
      ]
    }
  ],
  "lifeApplication": "",
  "teacherNotes": "",
  "classApproach": "",
  "pastoralObservation": "",
  "studentNotesSpace": "",
  "conclusion": "",
  "questionsAndAnswers": [
    { "question": "", "answer": "" },
    { "question": "", "answer": "" },
    { "question": "", "answer": "" },
    { "question": "", "answer": "" }
  ],
  "questionsOnly": ["", "", "", ""]
}
`.trim();
}

function promptSermao(form) {
  return `
Você é um pregador cristão, expositor bíblico, pastor e teólogo.

Crie um SERMÃO CRISTÃO pregável no púlpito.
Não faça parecer e-book, livro ou revista.

${baseDados(form, "Sermão cristão")}
${regrasJson()}

ESTRUTURA:
- Título.
- Texto bíblico base.
- Tema.
- Objetivo.
- Introdução expandida.
- Contexto bíblico.
- Explicação do texto.
- Proposição central.
- Frase de transição.
- Exatamente ${form.sermonPoints} pontos.
- Aplicações práticas.
- Conclusão.
- Apelo.
- Oração final.

FORMATO JSON:
{
  "type": "sermao",
  "title": "",
  "subtitle": "",
  "theme": "",
  "biblicalText": "",
  "targetAudience": "",
  "author": "",
  "ministry": "",
  "objective": "",
  "introduction": "",
  "biblicalContext": "",
  "textExplanation": "",
  "centralProposition": "",
  "transitionPhrase": "",
  "points": [
    {
      "title": "",
      "explanation": "",
      "pastoralApplication": "",
      "illustration": ""
    }
  ],
  "dailyApplications": ["", "", "", ""],
  "conclusion": "",
  "appeal": "",
  "finalPrayer": ""
}
`.trim();
}

function promptLivro(form) {
  return `
Você é um escritor cristão, pastor e autor de livros de formação espiritual.

Crie um LIVRO CRISTÃO com tom literário, maduro e capítulos densos.

${baseDados(form, "Livro cristão")}
${regrasJson()}

FORMATO JSON:
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
  "chapters": [
    {
      "number": 1,
      "title": "",
      "openingNarrative": "",
      "biblicalBase": ["", ""],
      "development": "",
      "theologicalReflection": "",
      "pastoralApplication": "",
      "chapterClosing": ""
    }
  ],
  "finalConclusion": "",
  "wordToReader": "",
  "authorBio": "",
  "backCoverText": ""
}

Crie exatamente ${form.quantity} capítulos.
`.trim();
}

function promptEbook(form) {
  return `
Você é um escritor cristão, pastor e organizador editorial.

Crie um E-BOOK CRISTÃO moderno, prático, profundo e organizado.

${baseDados(form, "E-book cristão")}
${regrasJson()}

FORMATO JSON:
{
  "type": "ebook",
  "title": "",
  "subtitle": "",
  "theme": "",
  "targetAudience": "",
  "author": "",
  "ministry": "",
  "summaryIntro": "",
  "chapters": [
    {
      "number": 1,
      "title": "",
      "heroCaption": "",
      "biblicalBase": ["", ""],
      "opening": "",
      "centralIdea": "",
      "sections": [
        { "title": "", "content": "" },
        { "title": "", "content": "" },
        { "title": "", "content": "" }
      ],
      "highlightQuote": "",
      "reflectionQuestions": ["", "", ""],
      "practice": "",
      "prayer": "",
      "conclusion": ""
    }
  ],
  "closing": ""
}

Crie exatamente ${form.quantity} capítulos.
`.trim();
}

function promptDevocional(form) {
  return `
Você é um escritor devocional cristão e pastor.

Crie um DEVOCIONAL CRISTÃO curto, bíblico, reflexivo e aplicável.

${baseDados(form, "Devocional cristão")}
${regrasJson()}

FORMATO JSON:
{
  "type": "devocional",
  "title": "",
  "subtitle": "",
  "theme": "",
  "targetAudience": "",
  "author": "",
  "ministry": "",
  "presentation": "",
  "days": [
    {
      "day": 1,
      "title": "",
      "verse": "",
      "reflection": "",
      "practicalApplication": "",
      "meditationQuestion": "",
      "prayer": ""
    }
  ],
  "finalWord": ""
}

Crie exatamente ${form.quantity} dias devocionais.
`.trim();
}

function promptEstudo(form) {
  return `
Você é um professor de Bíblia e teólogo.

Crie um ESTUDO BÍBLICO/TEOLÓGICO didático, analítico e bíblico.

${baseDados(form, "Estudo bíblico/teológico")}
${regrasJson()}

FORMATO JSON:
{
  "type": "estudo",
  "title": "",
  "theme": "",
  "biblicalText": "",
  "objective": "",
  "introduction": "",
  "biblicalContext": "",
  "parts": [
    {
      "number": 1,
      "title": "",
      "explanation": "",
      "theologicalAnalysis": "",
      "practicalApplication": ""
    }
  ],
  "reviewQuestions": ["", "", "", ""],
  "conclusion": ""
}

Crie exatamente ${form.quantity} partes.
`.trim();
}

function promptCurso(form) {
  return `
Você é um professor cristão e organizador de cursos bíblicos.

Crie um CURSO CRISTÃO em formato de aulas.

${baseDados(form, "Curso cristão")}
${regrasJson()}

FORMATO JSON:
{
  "type": "curso",
  "title": "",
  "subtitle": "",
  "targetAudience": "",
  "author": "",
  "ministry": "",
  "courseDescription": "",
  "generalObjective": "",
  "lessons": [
    {
      "lesson": 1,
      "title": "",
      "objective": "",
      "introduction": "",
      "biblicalTexts": ["", ""],
      "content": "",
      "classActivity": "",
      "homework": "",
      "summary": ""
    }
  ],
  "finalEvaluation": "",
  "finalWord": ""
}

Crie exatamente ${form.quantity} aulas.
`.trim();
}

async function callGeminiText(apiKey, models, prompt) {
  let lastError = null;

  for (const model of models) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.58,
              topP: 0.88,
              maxOutputTokens: 16000
            }
          })
        }
      );

      const rawText = await response.text();
      const data = safeJson(rawText);

      if (!response.ok) {
        const msg = data?.error?.message || rawText || `Erro no modelo ${model}`;
        throw new Error(msg.slice(0, 900));
      }

      if (!data) {
        throw new Error("O modelo respondeu em formato inválido.");
      }

      return { modelUsed: model, data };

    } catch (error) {
      lastError = error;
      console.error("Falha no modelo", model, error.message);
    }
  }

  throw lastError || new Error("Nenhum modelo conseguiu gerar o texto.");
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function extractText(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map((part) => part.text || "").join("\n").trim();
}

function parseJson(text) {
  const cleaned = String(text || "")
    .trim()
    .replace(/^```json/i, "")
    .replace(/^```/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (_) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");

    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch (_) {
        return null;
      }
    }
  }

  return null;
}
