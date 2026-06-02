// api/capa.js
// VERBO IA — gerador de capa por IA
// Tenta Gemini e OpenAI com múltiplas chaves.
// Se falhar, devolve erro limpo para o app usar capa HTML/placeholder.

function responder(res, status, data) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(data);
}

function texto(valor) {
  return String(valor || "").trim();
}

function pegarChaves(prefixo) {
  const nomes = [
    prefixo,
    `${prefixo}_1`,
    `${prefixo}_2`,
    `${prefixo}_3`,
    `${prefixo}_4`,
    `${prefixo}_5`,
  ];

  const vistas = new Set();
  const chaves = [];

  for (const nome of nomes) {
    const valor = process.env[nome];
    if (!valor) continue;

    const chave = String(valor).trim();
    if (!chave) continue;
    if (vistas.has(chave)) continue;

    vistas.add(chave);
    chaves.push({ nome, valor: chave });
  }

  return chaves;
}

function extrairPrompt(req) {
  const body = req.body || {};

  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body);
      return texto(
        parsed.prompt ||
          parsed.texto ||
          parsed.descricao ||
          parsed.description ||
          parsed.titulo ||
          parsed.title
      );
    } catch {
      return texto(body);
    }
  }

  return texto(
    body.prompt ||
      body.texto ||
      body.descricao ||
      body.description ||
      body.titulo ||
      body.title
  );
}

function limparLista(lista) {
  const out = [];
  const seen = new Set();

  for (const item of lista) {
    const v = texto(item);
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }

  return out;
}

function normalizarBase64(valor) {
  const s = texto(valor);
  if (!s) return "";

  if (s.startsWith("data:image/")) return s;

  return `data:image/png;base64,${s}`;
}

async function chamarGeminiImagem({ apiKey, model, prompt }) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const resposta = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                "Crie uma imagem de capa profissional, sem textos escritos dentro da imagem, sem logotipos falsos, sem marcas d'água. " +
                "Estilo editorial cristão, bonito, limpo, premium, adequado para material impresso. " +
                "Descrição da capa: " +
                prompt,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.8,
        topP: 0.95,
        maxOutputTokens: 2048,
        responseModalities: ["TEXT", "IMAGE"],
      },
    }),
  });

  const data = await resposta.json().catch(() => ({}));

  if (!resposta.ok) {
    const msg =
      data?.error?.message ||
      data?.error?.status ||
      `Gemini imagem HTTP ${resposta.status}`;
    throw new Error(msg);
  }

  const partes = data?.candidates?.[0]?.content?.parts || [];

  for (const parte of partes) {
    const inline = parte?.inlineData || parte?.inline_data;
    if (inline?.data) {
      const mime = inline.mimeType || inline.mime_type || "image/png";
      return `data:${mime};base64,${inline.data}`;
    }
  }

  throw new Error("Gemini não retornou imagem.");
}

async function chamarOpenAIImagem({ apiKey, model, prompt }) {
  const resposta = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt:
        "Capa profissional cristã editorial, sem texto dentro da imagem, sem marcas d'água, sem logotipos falsos. " +
        "Visual premium para revista/livro/apostila. " +
        prompt,
      size: "1024x1536",
      n: 1,
      response_format: "b64_json",
    }),
  });

  const data = await resposta.json().catch(() => ({}));

  if (!resposta.ok) {
    const msg =
      data?.error?.message ||
      data?.error?.type ||
      `OpenAI imagem HTTP ${resposta.status}`;
    throw new Error(msg);
  }

  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("OpenAI não retornou imagem.");
  }

  return normalizarBase64(b64);
}

function criarPromptCapaSeguro(promptOriginal) {
  const p = texto(promptOriginal);

  if (!p) {
    return "Capa cristã profissional com Bíblia aberta, luz suave, ambiente reverente, composição editorial premium.";
  }

  return `
${p}

Regras visuais:
- Não colocar textos escritos dentro da imagem.
- Não escrever título na imagem.
- Não usar logotipo real.
- Não usar marca d'água.
- Não distorcer rostos, mãos ou Bíblia.
- Criar composição elegante, editorial, cristã, com aparência de capa profissional para impressão.
- Preferir luz acolhedora, profundidade, qualidade premium e boa composição.
`.trim();
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    return responder(res, 200, { ok: true });
  }

  if (req.method === "GET") {
    const geminiKeys = pegarChaves("GEMINI_API_KEY");
    const openaiKeys = pegarChaves("OPENAI_API_KEY");

    return responder(res, 200, {
      ok: true,
      rota: "/api/capa",
      versao: "verbo-ia-capa-multichaves-v13.51",
      geminiKeysDetectadas: geminiKeys.map((k) => k.nome),
      openaiKeysDetectadas: openaiKeys.map((k) => k.nome),
      aviso:
        "Esta rota gera imagem por POST. Se falhar, o app deve usar capa HTML.",
    });
  }

  if (req.method !== "POST") {
    return responder(res, 405, {
      ok: false,
      error: "Método não permitido. Use POST.",
    });
  }

  const promptOriginal = extrairPrompt(req);
  const prompt = criarPromptCapaSeguro(promptOriginal);

  const geminiKeys = pegarChaves("GEMINI_API_KEY");
  const openaiKeys = pegarChaves("OPENAI_API_KEY");

  const geminiModels = limparLista([
    process.env.GEMINI_IMAGE_MODEL,
    process.env.GEMINI_IMAGE_MODEL_1,
    "gemini-2.5-flash-image-preview",
    "gemini-2.0-flash-preview-image-generation",
  ]);

  const openaiModels = limparLista([
    process.env.OPENAI_IMAGE_MODEL,
    process.env.OPENAI_IMAGE_MODEL_1,
    "gpt-image-1",
    "dall-e-3",
  ]);

  const erros = [];

  for (const key of geminiKeys) {
    for (const model of geminiModels) {
      try {
        const image = await chamarGeminiImagem({
          apiKey: key.valor,
          model,
          prompt,
        });

        return responder(res, 200, {
          ok: true,
          provider: "gemini",
          keyUsed: key.nome,
          modelUsed: model,
          image,
          url: image,
          dataUrl: image,
        });
      } catch (erro) {
        erros.push(`Gemini ${key.nome} / ${model}: ${erro.message}`);
      }
    }
  }

  for (const key of openaiKeys) {
    for (const model of openaiModels) {
      try {
        const image = await chamarOpenAIImagem({
          apiKey: key.valor,
          model,
          prompt,
        });

        return responder(res, 200, {
          ok: true,
          provider: "openai",
          keyUsed: key.nome,
          modelUsed: model,
          image,
          url: image,
          dataUrl: image,
        });
      } catch (erro) {
        erros.push(`OpenAI ${key.nome} / ${model}: ${erro.message}`);
      }
    }
  }

  return responder(res, 500, {
    ok: false,
    error:
      "Não foi possível gerar a capa por IA. Use a capa HTML de segurança.",
    detalhes: erros.slice(-20),
    chavesDetectadas: {
      gemini: geminiKeys.map((k) => k.nome),
      openai: openaiKeys.map((k) => k.nome),
    },
  });
}
