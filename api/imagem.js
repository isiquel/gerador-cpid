module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Método não permitido. Use POST.",
      fallback: buildFallbackSvg("Método não permitido. Use POST.", "Imagem não gerada")
    });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        ok: false,
        error: "A variável GEMINI_API_KEY não foi encontrada.",
        fallback: buildFallbackSvg("A variável GEMINI_API_KEY não foi encontrada na Vercel.", "Erro de configuração")
      });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const prompt = String(body.prompt || "").trim();

    if (!prompt) {
      return res.status(400).json({
        ok: false,
        error: "Prompt de imagem vazio.",
        fallback: buildFallbackSvg("Prompt de imagem vazio.", "Imagem não gerada")
      });
    }

    const finalPrompt = buildImagePrompt({
      prompt,
      title: body.title || "",
      theme: body.theme || "",
      visualStyle: body.visualStyle || "colorido"
    });

    const models = [
      "gemini-2.0-flash-preview-image-generation",
      "gemini-2.5-flash-image-preview",
      "gemini-3.0-flash-image-preview",
      "gemini-3.1-flash-image-preview"
    ];

    const result = await callImageModels({
      apiKey,
      models,
      prompt: finalPrompt
    });

    return res.status(200).json({
      ok: true,
      modelUsed: result.modelUsed,
      image: result.image
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      ok: false,
      error: error.message || "Erro ao gerar imagem.",
      fallback: buildFallbackSvg(
        error.message || "A imagem não foi retornada pela API.",
        "Falha na imagem"
      )
    });
  }
};

function buildImagePrompt({ prompt, title, theme, visualStyle }) {
  const style =
    String(visualStyle).toLowerCase().includes("preto")
      ? "paleta monocromática elegante, alto contraste, refinada, editorial"
      : "cores vivas, bonitas, sofisticadas, iluminação suave, aparência premium";

  return `
Crie uma imagem editorial cristã profissional para um e-book.

Título do e-book: ${title}
Tema: ${theme}

Descrição principal da imagem:
${prompt}

Requisitos visuais:
- ${style}
- composição moderna, bonita e profissional
- atmosfera espiritual, reverente, emocional e acolhedora
- aparência de capa ou ilustração de e-book premium
- sem texto escrito dentro da imagem
- sem letras
- sem palavras
- sem logotipo
- sem marca d'água
- imagem limpa, forte, inspiradora e bem iluminada
`.trim();
}

async function callImageModels({ apiKey, models, prompt }) {
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
              responseModalities: ["TEXT", "IMAGE"]
            }
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error?.message || `Erro ao gerar imagem com ${model}`);
      }

      const image = extractImage(data);

      if (!image) {
        throw new Error(`O modelo ${model} respondeu, mas não retornou imagem.`);
      }

      return {
        modelUsed: model,
        image
      };

    } catch (error) {
      lastError = error;
      console.error("Falha ao gerar imagem com", model, error.message);
    }
  }

  throw lastError || new Error("Nenhum modelo de imagem conseguiu gerar imagem.");
}

function extractImage(data) {
  const candidates = Array.isArray(data?.candidates) ? data.candidates : [];

  for (const candidate of candidates) {
    const parts = candidate?.content?.parts || [];

    for (const part of parts) {
      const inlineData = part.inlineData || part.inline_data;

      if (inlineData?.data) {
        const mimeType = inlineData.mimeType || inlineData.mime_type || "image/png";
        return `data:${mimeType};base64,${inlineData.data}`;
      }
    }
  }

  return null;
}

function buildFallbackSvg(message, title) {
  const safeTitle = escapeXml(title || "Imagem não gerada");
  const safeMsg = escapeXml(message || "A imagem não foi retornada pela API.");

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fff7ec"/>
      <stop offset="55%" stop-color="#e6c99d"/>
      <stop offset="100%" stop-color="#8c6239"/>
    </linearGradient>
  </defs>

  <rect width="1200" height="900" rx="36" fill="url(#g)"/>

  <circle cx="190" cy="160" r="90" fill="rgba(255,255,255,0.25)"/>
  <circle cx="1010" cy="180" r="130" fill="rgba(255,255,255,0.18)"/>
  <circle cx="920" cy="700" r="100" fill="rgba(255,255,255,0.14)"/>

  <rect x="90" y="120" width="1020" height="660" rx="36" fill="rgba(255,255,255,0.35)" stroke="rgba(255,255,255,0.55)" stroke-width="3"/>

  <text x="140" y="225" font-family="Arial" font-size="44" font-weight="bold" fill="#5b3a24">${safeTitle}</text>

  <foreignObject x="140" y="280" width="900" height="340">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Arial;font-size:30px;line-height:1.45;color:#5b3a24;">
      ${safeMsg}
    </div>
  </foreignObject>

  <text x="140" y="715" font-family="Arial" font-size="26" font-weight="bold" fill="#5b3a24">VERBO IA</text>
</svg>`.trim();

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
