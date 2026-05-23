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

  /*
    Para acelerar:
    - E-book/teste: até 10 capítulos por geração.
    - Se quiser 30, 50 ou 100 capítulos, o ideal é depois fazermos geração por partes.
    - Gerar 100 capítulos de uma vez trava ou estoura limite.
  */
  quantidade = Math.max(1, Math.min(quantidade, 10));

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
    devocional: "Devocional cristão",
    estudo: "Estudo teológico",
    curso: "Curso cristão",
    revista: "Revista de ensino bíblico",
    sermão: "Sermão cristão",
    sermao: "Sermão cristão"
  };

  const materialName = materialNames[form.materialType] || "E-book cristão";

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
Quantidade exata de capítulos/lições/dias: ${form.quantity}
Público-alvo: ${form.targetAudience}
Autor/comentarista: ${form.author}
Ministério/Editora: ${form.ministry}
Profundidade: ${form.depthLevel}
Estilo visual: ${form.visualStyle}
Tom: ${form.tone}

REGRAS DE VELOCIDADE E ORGANIZAÇÃO:
1. Gere somente o conteúdo textual.
2. Não tente gerar imagem.
3. Não tente criar arquivo PDF.
4. Não tente montar HTML completo.
5. Não escreva mensagens de processo.
6. Não escreva "estou organizando".
7. Não use markdown.
8. Responda apenas em JSON válido.
9. Crie exatamente ${form.quantity} capítulos, sem pular numeração.
10. Se o usuário pedir muitos capítulos, entregue os ${form.quantity} primeiros capítulos com profundidade.
11. Não repita o nome do autor em todos os capítulos.
12. Não use a frase "nova seção do material".
13. Cada capítulo precisa ser profundo, mas objetivo o bastante para a resposta terminar.
14. Cada capítulo deve ter conteúdo expandido, bíblico, pastoral e aplicável.
15. Cada capítulo deve ter um prompt de imagem em inglês, mas apenas como texto no campo "illustrationPrompt".
16. A capa deve ter um prompt de imagem em inglês no campo "coverIllustrationPrompt", mas não gere imagem.

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
Mas não prolongue demais a ponto de travar.
Entregue uma versão completa, clara e útil.
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
