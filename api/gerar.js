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
    const book = parseJson(text);

    if (!book || !Array.isArray(book.chapters)) {
      return res.status(500).json({
        ok: false,
        error: "A IA não retornou o formato correto. Tente gerar novamente."
      });
    }

    book.chapters = book.chapters.map((chapter, index) => ({
      ...chapter,
      number: index + 1
    }));

    return res.status(200).json({
      ok: true,
      modelUsed: result.modelUsed,
      book
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

  const quantidadeBruta =
    body.quantity ||
    body.quantidade ||
    body.capitulos ||
    body.dias ||
    3;

  let quantidade = Number(quantidadeBruta);

  if (!Number.isFinite(quantidade)) {
    quantidade = 3;
  }

  if (tipo === "sermao") {
    quantidade = 1;
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
  const materialNames = {
    ebook: "E-book cristão",
    livro: "Livro cristão",
    devocional: "Devocional cristão",
    estudo: "Estudo teológico",
    curso: "Curso cristão",
    revista: "Revista de ensino bíblico",
    sermao: "Sermão cristão"
  };

  const materialName = materialNames[form.materialType] || "E-book cristão";

  if (form.materialType === "sermao") {
    return buildPromptSermao(form, materialName);
  }

  return buildPromptMaterial(form, materialName);
}

function buildPromptMaterial(form, materialName) {
  return `
Você é um escritor cristão, teólogo, pastor, comentarista bíblico e organizador editorial.

Crie um ${materialName} em português do Brasil.

DADOS DO MATERIAL:
Nome do app: ${form.appName}
Tipo: ${materialName}
Título: ${form.title}
Subtítulo: ${form.subtitle || "Crie um subtítulo forte, bonito e moderno"}
Tema: ${form.theme || form.title}
Texto bíblico base: ${form.biblicalBase || "Escolha textos bíblicos coerentes com o tema"}
Quantidade exata de capítulos/lições/dias/aulas: ${form.quantity}
Público-alvo: ${form.targetAudience}
Autor/comentarista: ${form.author}
Ministério/Editora: ${form.ministry}
Profundidade: ${form.depthLevel}
Estilo visual: ${form.visualStyle}
Tom: ${form.tone}

REGRAS DE VELOCIDADE E ORGANIZAÇÃO:
1. Gere somente o conteúdo textual.
2. Não gere imagem.
3. Não gere PDF.
4. Não monte HTML.
5. Não escreva mensagens de processo.
6. Não escreva "estou organizando".
7. Não use markdown.
8. Responda apenas em JSON válido.
9. Crie exatamente ${form.quantity} partes, sem pular numeração.
10. Não repita o nome do autor em todos os capítulos.
11. Não use a frase "nova seção do material".
12. O conteúdo deve ser profundo, mas objetivo o bastante para a resposta terminar.
13. Cada parte deve ter conteúdo expandido, bíblico, pastoral e aplicável.
14. Cada parte deve ter um prompt de imagem em inglês, apenas como texto no campo "illustrationPrompt".
15. A capa deve ter um prompt de imagem em inglês no campo "coverIllustrationPrompt", mas não gere imagem.

FORMATO JSON OBRIGATÓRIO:
{
  "appName": "VERBO IA",
  "materialType": "${materialName}",
  "title": "string",
  "subtitle": "string",
  "coverBadge": "string",
  "coverTagline": "string",
  "theme": "string",
  "targetAudience": "string",
  "language": "Português",
  "author": "string",
  "ministry": "string",
  "visualStyle": "string",
  "biblicalBase": ["string"],
  "summaryIntro": "string",
  "coverIllustrationPrompt": "string",
  "chapters": [
    {
      "number": 1,
      "title": "string",
      "heroCaption": "string",
      "illustrationPrompt": "string",
      "biblicalBase": ["string"],
      "opening": "string",
      "centralIdea": "string",
      "sections": [
        { "title": "string", "content": "string" },
        { "title": "string", "content": "string" },
        { "title": "string", "content": "string" }
      ],
      "highlightQuote": "string",
      "reflectionQuestions": ["string", "string", "string"],
      "practice": "string",
      "prayer": "string",
      "conclusion": "string"
    }
  ],
  "closing": "string",
  "authorBio": "string",
  "backCoverText": "string"
}

IMPORTANTE:
O material precisa ser profundo, edificante, bem organizado e pastoral.
`.trim();
}

function buildPromptSermao(form, materialName) {
  return `
Você é um pregador cristão, expositor bíblico, pastor e teólogo.

Crie um sermão cristão profundo, bíblico, pastoral e organizado em português do Brasil.

DADOS DO SERMÃO:
Título: ${form.title}
Tema: ${form.theme || form.title}
Texto bíblico base: ${form.biblicalBase || "Escolha um texto bíblico coerente com o tema"}
Público-alvo: ${form.targetAudience}
Autor/comentarista: ${form.author}
Ministério/Editora: ${form.ministry}
Profundidade: ${form.depthLevel}
Tom: ${form.tone}

REGRAS:
1. Responda apenas em JSON válido.
2. Não use markdown.
3. Não gere imagem.
4. Não gere capa.
5. Não gere PDF.
6. Não use a frase "nova seção do material".
7. O sermão precisa ser profundo, bíblico, pastoral, aplicável e pregável.
8. O sermão deve conter introdução forte, proposição, frase de transição, pontos principais, aplicações, conclusão, apelo e oração final.

FORMATO JSON OBRIGATÓRIO:
{
  "appName": "VERBO IA",
  "materialType": "${materialName}",
  "title": "string",
  "subtitle": "string",
  "coverBadge": "Sermão",
  "coverTagline": "string",
  "theme": "string",
  "targetAudience": "string",
  "language": "Português",
  "author": "string",
  "ministry": "string",
  "visualStyle": "texto",
  "biblicalBase": ["string"],
  "summaryIntro": "string",
  "coverIllustrationPrompt": "",
  "chapters": [
    {
      "number": 1,
      "title": "string",
      "heroCaption": "Texto base, tema e objetivo do sermão",
      "illustrationPrompt": "",
      "biblicalBase": ["string"],
      "opening": "Introdução forte do sermão",
      "centralIdea": "Proposição central do sermão",
      "sections": [
        { "title": "I - Primeiro ponto do sermão", "content": "string" },
        { "title": "II - Segundo ponto do sermão", "content": "string" },
        { "title": "III - Terceiro ponto do sermão", "content": "string" }
      ],
      "highlightQuote": "Frase de impacto do sermão",
      "reflectionQuestions": ["Aplicação 1", "Aplicação 2", "Aplicação 3"],
      "practice": "Aplicação prática para a igreja",
      "prayer": "Oração final",
      "conclusion": "Conclusão e apelo"
    }
  ],
  "closing": "string",
  "authorBio": "string",
  "backCoverText": "string"
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
              maxOutputTokens: 16000
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
