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

    const textModelCandidates = [
      process.env.GEMINI_TEXT_MODEL_1 || "gemini-3.5-flash",
      process.env.GEMINI_TEXT_MODEL_2 || "gemini-2.5-flash",
      process.env.GEMINI_TEXT_MODEL_3 || "gemini-2.0-flash"
    ].filter(Boolean);

    const imageModel = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image-preview";

    const prompt = buildBookPrompt(form);

    const textResult = await callTextModel({
      apiKey,
      models: textModelCandidates,
      prompt
    });

    const rawText = extractTextFromResponse(textResult.data);
    const parsed = parseJsonSafely(rawText);

    if (!parsed || !parsed.chapters || !Array.isArray(parsed.chapters)) {
      return res.status(500).json({
        ok: false,
        error: "A IA não retornou o JSON esperado do material."
      });
    }

    // Garante ordem correta dos capítulos
    parsed.chapters = parsed.chapters
      .map((chapter, index) => ({
        ...chapter,
        number: index + 1
      }));

    // Geração de imagens
    const images = {
      cover: null,
      chapters: {}
    };

    // Capa
    if (form.generateImages !== false && parsed.coverIllustrationPrompt) {
      try {
        images.cover = await generateImage({
          apiKey,
          model: imageModel,
          prompt: enrichIllustrationPrompt(
            parsed.coverIllustrationPrompt,
            form,
            "capa de e-book cristão, elegante, profissional, viva, moderna, editorial, sem texto"
          ),
          aspectRatio: "3:4",
          imageSize: "1K"
        });
      } catch (error) {
        console.error("Erro ao gerar capa:", error.message);
      }
    }

    // Ilustrações dos capítulos
    if (form.generateImages !== false) {
      for (const chapter of parsed.chapters) {
        try {
          const img = await generateImage({
            apiKey,
            model: imageModel,
            prompt: enrichIllustrationPrompt(
              chapter.illustrationPrompt || `Ilustração editorial do capítulo "${chapter.title}"`,
              form,
              "ilustração editorial cristã, bonita, viva, moderna, sem texto, sem letras, sem tipografia"
            ),
            aspectRatio: "4:3",
            imageSize: "512"
          });

          images.chapters[String(chapter.number)] = img;
        } catch (error) {
          console.error(`Erro ao gerar imagem do capítulo ${chapter.number}:`, error.message);
          images.chapters[String(chapter.number)] = null;
        }
      }
    }

    return res.status(200).json({
      ok: true,
      modelUsed: {
        text: textResult.modelUsed,
        image: imageModel
      },
      book: parsed,
      images
    });
  } catch (error) {
    console.error("Erro geral:", error);

    return res.status(500).json({
      ok: false,
      error: error.message || "Erro interno ao gerar o material."
    });
  }
};

function normalizeForm(body) {
  const quantity = Math.max(1, Math.min(Number(body.quantity || 7), 20));

  return {
    appName: "VERBO IA",
    materialType: String(body.materialType || "ebook"),
    title: String(body.title || "Título não informado").trim(),
    subtitle: String(body.subtitle || "").trim(),
    theme: String(body.theme || "").trim(),
    targetAudience: String(body.targetAudience || "Igreja em geral").trim(),
    language: String(body.language || "Português").trim(),
    biblicalBase: String(body.biblicalBase || "").trim(),
    quantity,
    author: String(body.author || "Pr. Isiquel Rodrigues").trim(),
    ministry: String(body.ministry || "CPID - Casa Publicadora da Igreja de Deus").trim(),
    visualStyle: String(body.visualStyle || "colorido").trim(),
    coverMode: String(body.coverMode || "com-capa").trim(),
    depthLevel: String(body.depthLevel || "profundo").trim(),
    tone: String(body.tone || "pastoral, bíblico, atual e inspirador").trim(),
    generateImages: body.generateImages !== false
  };
}

function buildBookPrompt(form) {
  const materialNames = {
    ebook: "E-book cristão",
    devocional: "Devocional",
    curso: "Curso cristão",
    estudo: "Estudo teológico",
    revista: "Revista de ensino bíblico"
  };

  const materialName = materialNames[form.materialType] || "Material cristão";

  const paletteInstruction =
    form.visualStyle.toLowerCase().includes("preto")
      ? "visual sóbrio, elegante, monocromático e limpo"
      : "visual colorido, bonito, vivo, moderno, editorial e harmonioso";

  return `
Você é um especialista em criação de materiais cristãos profundos, organizados, bonitos e prontos para diagramação profissional.

Crie um ${materialName} em PORTUGUÊS com alta qualidade, profundidade bíblica e aplicação prática.

DADOS DO PROJETO:
- Nome do app: ${form.appName}
- Tipo de material: ${materialName}
- Título: ${form.title}
- Subtítulo/apoio: ${form.subtitle || "Criar um subtítulo forte e bonito"}
- Tema principal: ${form.theme || form.title}
- Público-alvo: ${form.targetAudience}
- Linguagem: ${form.language}
- Texto bíblico base: ${form.biblicalBase || "Escolha textos bíblicos adequados ao tema"}
- Quantidade de capítulos/lições/dias: ${form.quantity}
- Autor/comentarista: ${form.author}
- Ministério/Editora: ${form.ministry}
- Nível de profundidade: ${form.depthLevel}
- Tom: ${form.tone}
- Direção visual: ${paletteInstruction}
- Capa: ${form.coverMode === "com-capa" ? "com capa ilustrada" : "sem capa ilustrada"}

REGRAS IMPORTANTES:
1. Retorne APENAS JSON válido.
2. Não use markdown.
3. Não escreva cercas de código.
4. Não use placeholders como "nova seção do material".
5. Não repita desnecessariamente o nome do autor em todo o material.
6. O conteúdo deve ser realmente profundo, expandido e útil.
7. Crie EXATAMENTE ${form.quantity} capítulos numerados de 1 até ${form.quantity}, sem pular nenhum número.
8. Cada capítulo precisa ter conteúdo completo e não resumido.
9. Cada capítulo deve conter:
   - number
   - title
   - heroCaption
   - illustrationPrompt
   - biblicalBase (array)
   - opening
   - centralIdea
   - sections (array com 4 itens; cada item com title e content)
   - highlightQuote
   - reflectionQuestions (array com 4 perguntas)
   - practice
   - prayer
   - conclusion
10. Cada ilustração deve ser descritiva, bonita e pensada para gerar imagem de verdade.
11. A capa precisa ser muito mais profissional, bonita e chamativa, como um e-book vendido na internet.
12. O sumário deve ficar limpo e profissional.
13. O conteúdo deve ser atual, moderno, relevante para as necessidades das pessoas hoje.
14. Use subtítulos fortes e úteis.
15. Não deixe blocos vazios.

ESTRUTURA OBRIGATÓRIA DO JSON:
{
  "appName": "${form.appName}",
  "materialType": "${materialName}",
  "title": "string",
  "subtitle": "string",
  "coverBadge": "string",
  "coverTagline": "string",
  "theme": "string",
  "targetAudience": "string",
  "language": "string",
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

Capriche de verdade. Quero um material bonito, bíblico, profundo, moderno, organizado e pronto para virar um e-book profissional.
`.trim();
}

function enrichIllustrationPrompt(basePrompt, form, styleTail) {
  const colorInstruction =
    form.visualStyle.toLowerCase().includes("preto")
      ? "paleta monocromática elegante, com ótimo contraste, aparência refinada"
      : "paleta viva, bonita, sofisticada, acolhedora, com cores harmoniosas e aparência premium";

  return `
${basePrompt}.
Estilo visual: ${colorInstruction}.
Composição editorial profissional.
Ilustração de alta qualidade.
Sem texto escrito dentro da imagem.
Sem letras.
Sem tipografia.
Visual cristão moderno, profundo e inspirador.
${styleTail}.
`.trim();
}

async function callTextModel({ apiKey, models, prompt }) {
  let lastError = null;

  for (const model of models) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
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
              maxOutputTokens: 65535
            }
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error?.message || `Erro no modelo ${model}`);
      }

      return { modelUsed: model, data };
    } catch (error) {
      lastError = error;
      console.error(`Falha no modelo de texto ${model}:`, error.message);
    }
  }

  throw lastError || new Error("Nenhum modelo de texto conseguiu responder.");
}

async function generateImage({ apiKey, model, prompt, aspectRatio = "4:3", imageSize = "512" }) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
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
          responseModalities: ["IMAGE"],
          responseFormat: {
            image: {
              aspectRatio,
              imageSize
            }
          }
        }
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || "Erro ao gerar imagem.");
  }

  const imageDataUrl = extractImageDataUrlFromResponse(data);

  if (!imageDataUrl) {
    throw new Error("A API não retornou imagem.");
  }

  return imageDataUrl;
}

function extractTextFromResponse(data) {
  const parts = getAllParts(data);
  return parts
    .filter((part) => typeof part.text === "string")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function extractImageDataUrlFromResponse(data) {
  const parts = getAllParts(data);
  const imagePart = parts.find((part) => part?.inlineData?.data);

  if (!imagePart) return null;

  const mimeType = imagePart.inlineData.mimeType || "image/png";
  return `data:${mimeType};base64,${imagePart.inlineData.data}`;
}

function getAllParts(data) {
  const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
  const allParts = [];

  for (const candidate of candidates) {
    const parts = candidate?.content?.parts || [];
    for (const part of parts) {
      allParts.push(part);
    }
  }

  return allParts;
}

function parseJsonSafely(text) {
  if (!text) return null;

  const cleaned = text
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

    if (start !== -1 && end !== -1) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch (error) {
        console.error("Falha ao interpretar JSON:", error.message);
      }
    }
  }

  return null;
}
