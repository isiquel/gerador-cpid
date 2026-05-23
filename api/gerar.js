module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Método não permitido. Use POST."
    });
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
    const material = parseJson(text);

    if (!material) {
      return res.status(500).json({
        ok: false,
        error: "A IA não retornou um JSON válido. Tente gerar novamente."
      });
    }

    material.appName = "VERBO IA";
    material.selectedType = form.materialType;
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
  const tipo = String(body.materialType || body.tipo || "ebook").trim();

  let quantidade = Number(
    body.quantity ||
    body.quantidade ||
    body.capitulos ||
    body.dias ||
    body.aulas ||
    body.licoes ||
    3
  );

  if (!Number.isFinite(quantidade)) quantidade = 3;

  if (tipo === "sermao") {
    quantidade = 1;
  } else if (tipo === "devocional") {
    quantidade = Math.max(1, Math.min(quantidade, 30));
  } else {
    quantidade = Math.max(1, Math.min(quantidade, 10));
  }

  return {
    appName: "VERBO IA",
    materialType: tipo,
    title: String(body.title || body.titulo || "Material cristão").trim(),
    subtitle: String(body.subtitle || body.subtitulo || "").trim(),
    theme: String(body.theme || body.tema || "").trim(),
    biblicalBase: String(body.biblicalBase || body.textoBase || body.baseBiblica || "").trim(),
    quantity: quantidade,
    targetAudience: String(body.targetAudience || body.publicoAlvo || "Igreja em geral").trim(),
    author: String(body.author || body.autor || "Pr. Isiquel Rodrigues").trim(),
    ministry: String(body.ministry || body.ministerio || "CPID - Casa Publicadora da Igreja de Deus").trim(),
    depthLevel: String(body.depthLevel || body.profundidade || "muito profundo").trim(),
    visualStyle: String(body.visualStyle || body.estiloVisual || "colorido").trim(),
    coverMode: String(body.coverMode || body.capa || "sem-capa").trim(),
    tone: String(body.tone || body.tom || "pastoral, bíblico, atual, profundo e encorajador").trim()
  };
}

function buildPrompt(form) {
  if (form.materialType === "sermao") return promptSermao(form);
  if (form.materialType === "livro") return promptLivro(form);
  if (form.materialType === "ebook") return promptEbook(form);
  if (form.materialType === "devocional") return promptDevocional(form);
  if (form.materialType === "estudo") return promptEstudo(form);
  if (form.materialType === "curso") return promptCurso(form);
  if (form.materialType === "revista") return promptRevista(form);

  return promptEbook(form);
}

function baseDados(form, nome) {
  return `
DADOS:
Tipo: ${nome}
Título: ${form.title}
Subtítulo: ${form.subtitle || "Crie se necessário"}
Tema: ${form.theme || form.title}
Texto bíblico base: ${form.biblicalBase || "Escolha textos bíblicos coerentes"}
Quantidade: ${form.quantity}
Público-alvo: ${form.targetAudience}
Autor: ${form.author}
Ministério/Editora: ${form.ministry}
Profundidade: ${form.depthLevel}
Tom: ${form.tone}
Estilo visual: ${form.visualStyle}
`.trim();
}

function regrasJson() {
  return `
REGRAS OBRIGATÓRIAS:
1. Responda somente em JSON válido.
2. Não use markdown.
3. Não escreva explicações fora do JSON.
4. Não diga "estou gerando".
5. Não gere imagem.
6. Não gere PDF.
7. Não monte HTML.
8. Use português do Brasil.
9. O conteúdo precisa ser bíblico, profundo, pastoral, claro e aplicável.
`.trim();
}

function promptSermao(form) {
  return `
Você é um pregador cristão, expositor bíblico, pastor e teólogo.

Crie um SERMÃO CRISTÃO. 
Não faça parecer e-book, livro ou revista. 
O formato precisa ser de sermão pregável no púlpito.

${baseDados(form, "Sermão cristão")}

${regrasJson()}

ESTRUTURA DO SERMÃO:
- Título forte.
- Texto bíblico base.
- Tema.
- Objetivo do sermão.
- Introdução bem expandida.
- Contexto bíblico do texto.
- Explicação do versículo ou passagem.
- Proposição central.
- Frase de transição.
- 3 ou 4 pontos principais.
- Cada ponto deve ter explicação bíblica, aplicação e ilustração pastoral.
- Aplicações práticas para a vida diária.
- Conclusão forte.
- Apelo final.
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
      "biblicalSupport": "",
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
Você é um escritor cristão, pastor, teólogo e autor de livros de formação espiritual.

Crie um LIVRO CRISTÃO.
Não faça parecer e-book curto. 
Um livro precisa ter tom mais literário, capítulos mais densos, abertura editorial, prefácio e desenvolvimento mais maduro.

${baseDados(form, "Livro cristão")}

${regrasJson()}

ESTRUTURA DO LIVRO:
- Capa textual.
- Prefácio.
- Apresentação.
- Introdução geral.
- Capítulos com tom de livro: mais narrativo, profundo e contínuo.
- Cada capítulo deve conter abertura literária, desenvolvimento, base bíblica, aplicação pastoral e fechamento.
- Conclusão final do livro.
- Palavra ao leitor.
- Sobre o autor.

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
`.trim();
}

function promptEbook(form) {
  return `
Você é um escritor cristão, pastor, teólogo e organizador editorial.

Crie um E-BOOK CRISTÃO.
O e-book deve ser moderno, prático, profundo, organizado e fácil de ler.
Não faça parecer sermão nem livro longo.

${baseDados(form, "E-book cristão")}

${regrasJson()}

ESTRUTURA DO E-BOOK:
- Capa textual.
- Apresentação.
- Sumário.
- Capítulos objetivos, profundos e práticos.
- Cada capítulo com abertura, ideia central, 3 seções, destaque, perguntas, aplicação e oração.

FORMATO JSON:
{
  "type": "ebook",
  "title": "",
  "subtitle": "",
  "theme": "",
  "targetAudience": "",
  "author": "",
  "ministry": "",
  "coverBadge": "",
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
  "closing": "",
  "authorBio": "",
  "backCoverText": ""
}
`.trim();
}

function promptDevocional(form) {
  return `
Você é um escritor devocional cristão, pastor e conselheiro espiritual.

Crie um DEVOCIONAL CRISTÃO.
Devocional não é e-book, não é livro e não é sermão.
Precisa ser mais curto, direto, reflexivo, bíblico, acolhedor e aplicável ao dia.

${baseDados(form, "Devocional cristão")}

${regrasJson()}

ESTRUTURA DO DEVOCIONAL:
- Título geral.
- Apresentação curta.
- Dias devocionais.
- Cada dia deve conter: título, versículo, reflexão breve, aplicação prática, pergunta de meditação e oração curta.

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
`.trim();
}

function promptEstudo(form) {
  return `
Você é um professor de Bíblia, teólogo e expositor das Escrituras.

Crie um ESTUDO BÍBLICO/TEOLÓGICO.
Não faça parecer e-book, livro ou sermão.
O estudo precisa ser didático, analítico, explicativo e com profundidade bíblica.

${baseDados(form, "Estudo bíblico/teológico")}

${regrasJson()}

ESTRUTURA DO ESTUDO:
- Tema.
- Objetivo.
- Texto base.
- Introdução.
- Contexto bíblico.
- Exposição em partes.
- Análise teológica.
- Aplicações práticas.
- Perguntas de revisão.
- Conclusão.

FORMATO JSON:
{
  "type": "estudo",
  "title": "",
  "theme": "",
  "biblicalText": "",
  "targetAudience": "",
  "author": "",
  "ministry": "",
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
`.trim();
}

function promptCurso(form) {
  return `
Você é um professor cristão, pastor e organizador de cursos bíblicos.

Crie um CURSO CRISTÃO.
Não faça parecer e-book, livro ou sermão.
Curso precisa vir em formato de aulas, com objetivos, conteúdo, atividades e tarefas.

${baseDados(form, "Curso cristão")}

${regrasJson()}

ESTRUTURA DO CURSO:
- Nome do curso.
- Descrição.
- Público-alvo.
- Objetivo geral.
- Aulas.
- Cada aula deve conter: objetivo, introdução, conteúdo, textos bíblicos, atividade, tarefa e resumo.

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
`.trim();
}

function promptRevista(form) {
  return `
Você é um comentarista de revista bíblica, pastor, teólogo e professor de EBD.

Crie uma REVISTA DE ENSINO BÍBLICO.
Não faça parecer e-book nem livro.
Precisa parecer lição de revista bíblica, com estrutura de professor.

${baseDados(form, "Revista de ensino bíblico")}

${regrasJson()}

ESTRUTURA DA REVISTA:
- Título da revista.
- Apresentação do trimestre.
- Lições.
- Cada lição deve conter: título, texto áureo, verdade prática, leitura bíblica, objetivos, introdução, tópicos, aplicação, conclusão e perguntas com respostas.

FORMATO JSON:
{
  "type": "revista",
  "title": "",
  "subtitle": "",
  "targetAudience": "",
  "author": "",
  "ministry": "",
  "quarterPresentation": "",
  "lessons": [
    {
      "lesson": 1,
      "title": "",
      "goldenText": "",
      "practicalTruth": "",
      "biblicalReading": "",
      "objectives": ["", "", ""],
      "introduction": "",
      "topics": [
        {
          "title": "",
          "content": ""
        },
        {
          "title": "",
          "content": ""
        },
        {
          "title": "",
          "content": ""
        }
      ],
      "lifeApplication": "",
      "conclusion": "",
      "questionsAndAnswers": [
        {
          "question": "",
          "answer": ""
        }
      ]
    }
  ],
  "finalWord": ""
}
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
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: prompt
                  }
                ]
              }
            ],
            generationConfig: {
              temperature: 0.72,
              topP: 0.9,
              maxOutputTokens: 18000
            }
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error?.message || `Erro no modelo ${model}`);
      }

      return {
        modelUsed: model,
        data
      };

    } catch (error) {
      lastError = error;
      console.error("Falha no modelo", model, error.message);
    }
  }

  throw lastError || new Error("Nenhum modelo conseguiu gerar o texto.");
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
      } catch (error) {
        return null;
      }
    }
  }

  return null;
}
