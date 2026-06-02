// api/gerar.js
// VERBO IA — motor universal de texto
// Tenta várias chaves e vários modelos.
// Não usa /api/prompt. Não expõe chaves.

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

function listaUnica(arr) {
  const out = [];
  const seen = new Set();

  for (const item of arr) {
    const v = texto(item);
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }

  return out;
}

function extrairPrompt(req) {
  const body = req.body || {};

  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body);
      return texto(
        parsed.prompt ||
          parsed.texto ||
          parsed.message ||
          parsed.conteudo ||
          parsed.input
      );
    } catch {
      return texto(body);
    }
  }

  return texto(
    body.prompt ||
      body.texto ||
      body.message ||
      body.conteudo ||
      body.input
  );
}

function extrairGemini(data) {
  try {
    const partes = data?.candidates?.[0]?.content?.parts || [];
    return partes.map((p) => p.text || "").join("\n").trim();
  } catch {
    return "";
  }
}

function extrairOpenAIResponses(data) {
  try {
    if (data?.output_text) return String(data.output_text).trim();

    if (Array.isArray(data?.output)) {
      return data.output
        .flatMap((item) => item.content || [])
        .map((c) => c.text || c?.text?.value || "")
        .join("\n")
        .trim();
    }

    return "";
  } catch {
    return "";
  }
}

function extrairOpenAIChat(data) {
  try {
    return String(data?.choices?.[0]?.message?.content || "").trim();
  } catch {
    return "";
  }
}

async function chamarGemini({ apiKey, model, prompt }) {
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
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.75,
        topP: 0.95,
        maxOutputTokens: 8192,
      },
    }),
  });

  const data = await resposta.json().catch(() => ({}));

  if (!resposta.ok) {
    const msg =
      data?.error?.message ||
      data?.error?.status ||
      `Gemini HTTP ${resposta.status}`;

    throw new Error(msg);
  }

  const saida = extrairGemini(data);

  if (!saida) {
    throw new Error("Gemini respondeu vazio.");
  }

  return saida;
}

async function chamarOpenAIResponses({ apiKey, model, prompt }) {
  const resposta = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content:
            "Você é o motor de geração do VERBO IA. Gere conteúdo cristão, bíblico, organizado, fiel ao pedido, com profundidade e em HTML limpo quando solicitado. Não diga que foi gerado por IA.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.75,
      max_output_tokens: 8192,
    }),
  });

  const data = await resposta.json().catch(() => ({}));

  if (!resposta.ok) {
    const msg =
      data?.error?.message ||
      data?.error?.type ||
      `OpenAI Responses HTTP ${resposta.status}`;

    throw new Error(msg);
  }

  const saida = extrairOpenAIResponses(data);

  if (!saida) {
    throw new Error("OpenAI Responses respondeu vazio.");
  }

  return saida;
}

async function chamarOpenAIChat({ apiKey, model, prompt }) {
  const resposta = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.75,
      max_tokens: 8192,
      messages: [
        {
          role: "system",
          content:
            "Você é o motor de geração do VERBO IA. Gere conteúdo cristão, bíblico, organizado, fiel ao pedido, com profundidade e em HTML limpo quando solicitado. Não diga que foi gerado por IA.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  const data = await resposta.json().catch(() => ({}));

  if (!resposta.ok) {
    const msg =
      data?.error?.message ||
      data?.error?.type ||
      `OpenAI Chat HTTP ${resposta.status}`;

    throw new Error(msg);
  }

  const saida = extrairOpenAIChat(data);

  if (!saida) {
    throw new Error("OpenAI Chat respondeu vazio.");
  }

  return saida;
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
      rota: "/api/gerar",
      versao: "verbo-ia-gerar-multichaves-v13.49",
      geminiKeysDetectadas: geminiKeys.map((k) => k.nome),
      openaiKeysDetectadas: openaiKeys.map((k) => k.nome),
      aviso:
        "Esta tela é apenas diagnóstico. Para gerar material, o app envia POST para esta rota.",
    });
  }

  if (req.method !== "POST") {
    return responder(res, 405, {
      ok: false,
      error: "Método não permitido. Use POST.",
    });
  }

  const prompt = extrairPrompt(req);

  if (!prompt) {
    return responder(res, 400, {
      ok: false,
      error: "Prompt vazio.",
    });
  }

  const geminiKeys = pegarChaves("GEMINI_API_KEY");
  const openaiKeys = pegarChaves("OPENAI_API_KEY");

  const geminiModels = listaUnica([
    process.env.GEMINI_MODEL,
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite",
    "gemini-1.5-flash",
  ]);

  const openaiModelsResponses = listaUnica([
    process.env.OPENAI_MODEL,
    "gpt-4o-mini",
  ]);

  const openaiModelsChat = listaUnica([
    process.env.OPENAI_CHAT_MODEL,
    "gpt-4o-mini",
  ]);

  const erros = [];

  for (const key of geminiKeys) {
    for (const model of geminiModels) {
      try {
        const saida = await chamarGemini({
          apiKey: key.valor,
          model,
          prompt,
        });

        return responder(res, 200, {
          ok: true,
          provider: "gemini",
          keyUsed: key.nome,
          modelUsed: model,
          text: saida,
          html: saida,
          content: saida,
          resultado: saida,
          resposta: saida,
        });
      } catch (erro) {
        erros.push(`Gemini ${key.nome} / ${model}: ${erro.message}`);
      }
    }
  }

  for (const key of openaiKeys) {
    for (const model of openaiModelsResponses) {
      try {
        const saida = await chamarOpenAIResponses({
          apiKey: key.valor,
          model,
          prompt,
        });

        return responder(res, 200, {
          ok: true,
          provider: "openai-responses",
          keyUsed: key.nome,
          modelUsed: model,
          text: saida,
          html: saida,
          content: saida,
          resultado: saida,
          resposta: saida,
        });
      } catch (erro) {
        erros.push(`OpenAI Responses ${key.nome} / ${model}: ${erro.message}`);
      }
    }

    for (const model of openaiModelsChat) {
      try {
        const saida = await chamarOpenAIChat({
          apiKey: key.valor,
          model,
          prompt,
        });

        return responder(res, 200, {
          ok: true,
          provider: "openai-chat",
          keyUsed: key.nome,
          modelUsed: model,
          text: saida,
          html: saida,
          content: saida,
          resultado: saida,
          resposta: saida,
        });
      } catch (erro) {
        erros.push(`OpenAI Chat ${key.nome} / ${model}: ${erro.message}`);
      }
    }
  }

  return responder(res, 500, {
    ok: false,
    error:
      "A IA não conseguiu gerar. Todas as chaves/modelos falharam ou estão sem cota/crédito.",
    detalhes: erros.slice(-20),
    chavesDetectadas: {
      gemini: geminiKeys.map((k) => k.nome),
      openai: openaiKeys.map((k) => k.nome),
    },
  });
}
