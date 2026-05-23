module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Método não permitido. Use POST."
    });
  }

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : req.body || {};

    const prompt = String(body.prompt || "").trim();
    const kind = String(body.kind || "section").trim().toLowerCase();
    const estilo = String(body.estilo || "colorido").trim().toLowerCase();

    if (!prompt) {
      return res.status(400).json({
        ok: false,
        error: "Prompt da imagem não informado."
      });
    }

    const apiKey = process.env.GEMINI_API_KEY || "";
    const model =
      process.env.GEMINI_IMAGE_MODEL ||
      "gemini-3.1-flash-image";

    // Se não houver chave, já devolve fallback bonito
    if (!apiKey) {
      const fallbackDataUrl = buildFallbackSvg(prompt, {
        kind,
        estilo
      });

      return res.status(200).json({
        ok: true,
        source: "fallback",
        warning: "GEMINI_API_KEY não encontrada. Usando ilustração de fallback.",
        dataUrl: fallbackDataUrl
      });
    }

    try {
      const dataUrl = await gerarImagemGemini({
        apiKey,
        model,
        prompt,
        kind
      });

      return res.status(200).json({
        ok: true,
        source: "ai",
        dataUrl
      });
    } catch (err) {
      // Nunca mostrar erro cru na capa ou no quadrinho
      console.error("[api/imagem.js] Falha na geração da imagem:", err.message);

      const fallbackDataUrl = buildFallbackSvg(prompt, {
        kind,
        estilo
      });

      return res.status(200).json({
        ok: true,
        source: "fallback",
        warning: traduzirErroImagem(err.message),
        dataUrl: fallbackDataUrl
      });
    }
  } catch (err) {
    console.error("[api/imagem.js] Erro geral:", err);

    const fallbackDataUrl = buildFallbackSvg("Ilustração cristã elegante", {
      kind: "section",
      estilo: "colorido"
    });

    return res.status(200).json({
      ok: true,
      source: "fallback",
      warning: "Erro interno ao gerar imagem. Usando fallback.",
      dataUrl: fallbackDataUrl
    });
  }
};

async function gerarImagemGemini({ apiKey, model, prompt, kind }) {
  const finalPrompt =
    kind === "cover"
      ? `${prompt}. Create a premium Christian ebook cover illustration. Elegant, modern, beautiful, soft cinematic lighting, rich composition, no text, no words, no letters, no typography.`
      : `${prompt}. Create a beautiful illustration for a Christian ebook section. Elegant, modern, refined, clean, no text, no words, no letters, no typography.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  // IMPORTANTE:
  // NÃO mandar aspect_ratio inválido nem image_size inválido.
  // Isso foi um dos erros das imagens anteriores.
  const payload = {
    contents: [
      {
        role: "user",
        parts: [{ text: finalPrompt }]
      }
    ],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"]
    }
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  let data = {};
  try {
    data = await response.json();
  } catch (_) {
    data = {};
  }

  if (!response.ok) {
    throw new Error(extrairMensagemErro(data) || `Erro HTTP ${response.status}`);
  }

  const dataUrl = extrairDataUrlDaResposta(data);

  if (!dataUrl) {
    throw new Error("A resposta da API não trouxe imagem inline.");
  }

  return dataUrl;
}

function extrairDataUrlDaResposta(data) {
  const candidates = Array.isArray(data?.candidates) ? data.candidates : [];

  for (const candidate of candidates) {
    const parts = candidate?.content?.parts || [];
    for (const part of parts) {
      if (part?.inlineData?.data && part?.inlineData?.mimeType?.startsWith("image/")) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
  }

  return null;
}

function extrairMensagemErro(data) {
  if (typeof data?.error?.message === "string") return data.error.message;
  if (typeof data?.message === "string") return data.message;

  try {
    return JSON.stringify(data);
  } catch (_) {
    return "Erro desconhecido ao gerar imagem.";
  }
}

function traduzirErroImagem(message = "") {
  const msg = String(message).toLowerCase();

  if (
    msg.includes("quota") ||
    msg.includes("rate limit") ||
    msg.includes("exceeded your current quota")
  ) {
    return "O limite de geração de imagens da API foi atingido. Foi usada uma ilustração de fallback.";
  }

  if (msg.includes("api key")) {
    return "A chave da API não está configurada corretamente. Foi usada uma ilustração de fallback.";
  }

  if (msg.includes("aspect_ratio") || msg.includes("image_size")) {
    return "Havia um parâmetro inválido na geração da imagem. Foi usada uma ilustração de fallback.";
  }

  return "Não foi possível gerar a imagem por IA agora. Foi usada uma ilustração de fallback.";
}

function buildFallbackSvg(prompt, { kind = "section", estilo = "colorido" } = {}) {
  const isMono =
    estilo.includes("preto") ||
    estilo.includes("branco") ||
    estilo.includes("mono");

  const palette = escolherPaleta(prompt, isMono);
  const width = kind === "cover" ? 1200 : 1200;
  const height = kind === "cover" ? 1600 : 800;

  const scenic =
    kind === "cover"
      ? `
        <path d="M0 ${height * 0.78} C ${width * 0.15} ${height * 0.68}, ${width * 0.25} ${height * 0.88}, ${width * 0.4} ${height * 0.76} S ${width * 0.7} ${height * 0.66}, ${width} ${height * 0.82} L ${width} ${height} L 0 ${height} Z"
              fill="${palette.layer1}" opacity="0.95"/>
        <path d="M0 ${height * 0.84} C ${width * 0.18} ${height * 0.74}, ${width * 0.38} ${height * 0.97}, ${width * 0.56} ${height * 0.79} S ${width * 0.82} ${height * 0.72}, ${width} ${height * 0.88} L ${width} ${height} L 0 ${height} Z"
              fill="${palette.layer2}" opacity="0.95"/>
        <circle cx="${width * 0.78}" cy="${height * 0.22}" r="${height * 0.08}" fill="${palette.sun}" opacity="0.9"/>
        <path d="M${width * 0.5} ${height * 0.58} l-20 85 h40 Z" fill="${palette.accent}" opacity="0.95"/>
        <path d="M${width * 0.49} ${height * 0.61} h22" stroke="${palette.accent}" stroke-width="10" stroke-linecap="round"/>
      `
      : `
        <path d="M0 ${height * 0.72} C ${width * 0.16} ${height * 0.58}, ${width * 0.36} ${height * 0.88}, ${width * 0.52} ${height * 0.7} S ${width * 0.78} ${height * 0.58}, ${width} ${height * 0.75} L ${width} ${height} L 0 ${height} Z"
              fill="${palette.layer1}" opacity="0.94"/>
        <path d="M0 ${height * 0.82} C ${width * 0.14} ${height * 0.68}, ${width * 0.34} ${height * 0.96}, ${width * 0.58} ${height * 0.79} S ${width * 0.84} ${height * 0.7}, ${width} ${height * 0.88} L ${width} ${height} L 0 ${height} Z"
              fill="${palette.layer2}" opacity="0.98"/>
        <circle cx="${width * 0.16}" cy="${height * 0.24}" r="${height * 0.08}" fill="${palette.sun}" opacity="0.85"/>
      `;

  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${palette.bg1}"/>
        <stop offset="100%" stop-color="${palette.bg2}"/>
      </linearGradient>

      <radialGradient id="glow1" cx="20%" cy="20%" r="45%">
        <stop offset="0%" stop-color="${palette.glow1}" stop-opacity="0.95"/>
        <stop offset="100%" stop-color="${palette.glow1}" stop-opacity="0"/>
      </radialGradient>

      <radialGradient id="glow2" cx="82%" cy="18%" r="42%">
        <stop offset="0%" stop-color="${palette.glow2}" stop-opacity="0.8"/>
        <stop offset="100%" stop-color="${palette.glow2}" stop-opacity="0"/>
      </radialGradient>

      <filter id="blur">
        <feGaussianBlur stdDeviation="60"/>
      </filter>
    </defs>

    <rect width="100%" height="100%" fill="url(#bg)"/>
    <circle cx="${width * 0.22}" cy="${height * 0.18}" r="${height * 0.22}" fill="url(#glow1)" filter="url(#blur)"/>
    <circle cx="${width * 0.84}" cy="${height * 0.2}" r="${height * 0.2}" fill="url(#glow2)" filter="url(#blur)"/>

    <g opacity="0.16">
      <circle cx="${width * 0.12}" cy="${height * 0.16}" r="46" fill="#ffffff"/>
      <circle cx="${width * 0.86}" cy="${height * 0.18}" r="68" fill="#ffffff"/>
      <circle cx="${width * 0.18}" cy="${height * 0.72}" r="34" fill="#ffffff"/>
      <circle cx="${width * 0.82}" cy="${height * 0.74}" r="52" fill="#ffffff"/>
    </g>

    ${scenic}
  </svg>
  `;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function escolherPaleta(prompt, mono = false) {
  if (mono) {
    return {
      bg1: "#f1f1f1",
      bg2: "#dcdcdc",
      glow1: "#ffffff",
      glow2: "#eeeeee",
      layer1: "#bdbdbd",
      layer2: "#9d9d9d",
      sun: "#fafafa",
      accent: "#6c6c6c"
    };
  }

  const text = String(prompt || "").toLowerCase();

  if (text.includes("ansiedade") || text.includes("descanso") || text.includes("paz")) {
    return {
      bg1: "#dcecff",
      bg2: "#a8c7ff",
      glow1: "#ffffff",
      glow2: "#fff2bf",
      layer1: "#688fc7",
      layer2: "#355c99",
      sun: "#ffe39a",
      accent: "#f4d06f"
    };
  }

  if (text.includes("oração") || text.includes("presença") || text.includes("intimidade")) {
    return {
      bg1: "#e7dcff",
      bg2: "#baa7ff",
      glow1: "#fff8d9",
      glow2: "#f3e7ff",
      layer1: "#7260c7",
      layer2: "#4c378f",
      sun: "#ffe7a3",
      accent: "#f4d06f"
    };
  }

  if (text.includes("família") || text.includes("lar")) {
    return {
      bg1: "#fff0da",
      bg2: "#ffcfa0",
      glow1: "#fff8ee",
      glow2: "#ffe2c4",
      layer1: "#c98c54",
      layer2: "#9e6437",
      sun: "#ffe29a",
      accent: "#f0b35a"
    };
  }

  return {
    bg1: "#efe2cf",
    bg2: "#d0b08e",
    glow1: "#fff5e8",
    glow2: "#f9e0b8",
    layer1: "#b38b63",
    layer2: "#8a6442",
    sun: "#ffe0a0",
    accent: "#f4d06f"
  };
}
