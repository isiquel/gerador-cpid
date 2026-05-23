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

    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const form = normalizeForm(body);

    const models = [
      process.env.GEMINI_TEXT_MODEL_1 || "gemini-3.5-flash",
      process.env.GEMINI_TEXT_MODEL_2 || "gemini-3.1-flash-lite",
      process.env.GEMINI_TEXT_MODEL_3 || "gemini-2.5-flash",
      process.env.GEMINI_TEXT_MODEL_4 || "gemini-2.5-flash-lite"
    ].filter(Boolean);

    const prompt = buildBookPrompt(form);
    const result = await callTextModel({ apiKey, models, prompt });
    const text = extractText(result.data);
    const book = parseJson(text);

    if (!book || !Array.isArray(book.chapters)) {
      return res.status(500).json({
        ok: false,
        error: "A IA não retornou o formato esperado. Tente gerar novamente."
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
    console.error(error);

    return res.status(500).json({
      ok: false,
      error: error.message || "Erro interno ao gerar material."
    });
  }
};

function normalizeForm(body) {
  return {
    appName: "VERBO IA",
    materialType: String(body.materialType || "ebook"),
    title: String(body.title || "Material bíblico").trim(),
    subtitle: String(body.subtitle || "").trim(),
    theme: String(body.theme || "").trim(),
    biblicalBase: String(body.biblicalBase || "").trim(),
    quantity: Math.max(1, Math.min(Number(body.quantity || 3), 20)),
    targetAudience: String(body.targetAudience || "Igreja em geral").trim(),
    author: String(body.author || "Pr. Isiquel Rodrigues").trim(),
    ministry: String(body.ministry || "CPID - Casa Publicadora da Igreja de Deus").trim(),
    depthLevel: String(body.depthLevel || "muito profundo").trim(),
    visualStyle: String(body.visualStyle || "colorido").trim(),
    coverMode: String(body.coverMode || "com-capa").trim(),
    tone: String(body.tone || "pastoral, bíblico, atual e profundo").trim()
  };
}

function buildBookPrompt(form) {
  const materialNames = {
    ebook: "E-book cristão",
    devocional: "Devocional",
    estudo: "Estudo teológico",
    curso: "Curso cristão",
    revista: "Revista de ensino bíblico"
  };

  const materialName = materialNames[form.materialType] || "Material cristão";

  return `
Você é um especialista em criação de materiais cristãos profundos, modernos, pastorais e prontos para diagramação profissional.

Crie um ${materialName} em português do Brasil.

DADOS:
Nome do app: ${form.appName}
Tipo: ${materialName}
Título: ${form.title}
Subtítulo: ${form.subtitle || "Crie um subtítulo forte e bonito"}
Tema: ${form.theme || form.title}
Texto bíblico base: ${form.biblicalBase || "Escolha textos coerentes com o tema"}
Quantidade exata de capítulos/lições/dias: ${form.quantity}
Público-alvo: ${form.targetAudience}
Autor: ${form.author}
Ministério/Editora: ${form.ministry}
Profundidade: ${form.depthLevel}
Visual: ${form.visualStyle}
Tom: ${form.tone}

REGRAS:
1. Responda APENAS JSON válido.
2. Não use markdown.
3. Não use cercas de código.
4. Não coloque comentários fora do JSON.
5. Não use "nova seção do material".
6. Não repita o nome do autor em todos os capítulos.
7. Crie exatamente ${form.quantity} capítulos, numerados de 1 até ${form.quantity}.
8. O conteúdo deve ser profundo, expandido, bíblico, pastoral, moderno e aplicável.
9. Cada capítulo deve conter 4 seções bem desenvolvidas.
10. Cada capítulo precisa ter um prompt de imagem bonito e específico em "illustrationPrompt".
11. A capa precisa ter um prompt de imagem em "coverIllustrationPrompt".
12. Os prompts de imagem devem pedir imagem sem texto, sem letras e sem palavras dentro da arte.
13. O material precisa parecer e-book profissional.

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
        { "title": "string", "content": "string" },
        { "title": "string", "content": "string" }
      ],
      "highlightQuote": "string",
      "reflectionQuestions": ["string", "string", "string", "string"],
      "practice": "string",
      "prayer": "string",
      "conclusion": "string"
    }
  ],
  "closing": "string",
  "authorBio": "string",
  "backCoverText": "string"
}

Capriche. O conteúdo precisa ser realmente útil, profundo, organizado e bonito.
`.trim();
}

async function callTextModel({ apiKey, models, prompt }) {
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
                parts: [{ text: prompt }]
              }
            ],
            generationConfig: {
              temperature: 0.75,
              topP: 0.95,
              maxOutputTokens: 50000
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
  return parts.map(part => part.text || "").join("\n").trim();
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
      return JSON.parse(cleaned.slice(start, end + 1));
    }
  }

  return null;
}
