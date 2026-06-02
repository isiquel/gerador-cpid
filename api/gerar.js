// api/gerar.js
// VERBO IA — geração de texto com múltiplas chaves Gemini e OpenAI
// Ordem: Gemini 1 → Gemini 2 → OpenAI 1 → OpenAI 2

function json(res, status, data) {
  return res.status(status).json(data);
}

function limparTexto(txt) {
  return String(txt || "").trim();
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

  const chaves = [];

  for (const nome of nomes) {
    const valor = process.env[nome];
    if (valor && String(valor).trim()) {
      chaves.push({
        nome,
        valor: String(valor).trim(),
      });
    }
  }

  const vistas = new Set();

  return chaves.filter((item) => {
    if (vistas.has(item.valor)) return false;
    vistas.add(item.valor);
    return true;
  });
}

function extrairTextoGemini(data) {
  try {
    const partes = data?.candidates?.[0]?.content?.parts || [];
    return partes.map((p) => p.text || "").join("\n").trim();
  } catch {
    return "";
  }
}

function extrairTextoOpenAI(data) {
  try {
    if (data?.choices?.[0]?.message?.content) {
      return String(data.choices[0].message.content).trim();
    }

    if (data?.output_text) {
      return String(data.output_text).trim();
    }

    if (Array.isArray(data?.output)) {
      return data.output
        .flatMap((item) => item.content || [])
        .map((c) => c.text || "")
        .join("\n")
        .trim();
    }

    return "";
  } catch {
    return "";
  }
}

async function chamarGemini(apiKey, prompt) {
  const model =
    process.env.GEMINI_MODEL ||
    "gemini-1.5-flash";

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const resposta = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: prompt,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        topP: 0.95,
        maxOutputTokens: 8192,
      },
    }),
  });

  const data = await resposta.json().catch(() => ({}));

  if (!resposta.ok) {
    const msg =
      data?.error?.message ||
      `Erro Gemini HTTP ${resposta.status}`;
    throw new Error(msg);
  }

  const texto = extrairTextoGemini(data);

  if (!texto) {
    throw new Error("Gemini respondeu vazio.");
  }

  return texto;
}

async function chamarOpenAI(apiKey, prompt) {
  const model =
    process.env.OPENAI_MODEL ||
    "gpt-4o-mini";

  const resposta = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      max_tokens: 8192,
      messages: [
        {
          role: "system",
          content:
            "Você é o motor de geração do VERBO IA. Gere conteúdo cristão, bíblico, organizado, fiel ao pedido e em HTML limpo quando solicitado. Não mencione que foi gerado por IA.",
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
      `Erro OpenAI HTTP ${resposta.status}`;
    throw new Error(msg);
  }

  const texto = extrairTextoOpenAI(data);

  if (!texto) {
    throw new Error("OpenAI respondeu vazio.");
  }

  return texto;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, {
      ok: false,
      error: "Método não permitido. Use POST.",
    });
  }

  try {
    const body = req.body || {};
    const prompt = limparTexto(body.prompt || body.texto || body.message);

    if (!prompt) {
      return json(res, 400, {
        ok: false,
        error: "Prompt vazio.",
      });
    }

    const geminiKeys = pegarChaves("GEMINI_API_KEY");
    const openaiKeys = pegarChaves("OPENAI_API_KEY");

    const erros = [];

    for (const item of geminiKeys) {
      try {
        const texto = await chamarGemini(item.valor, prompt);

        return json(res, 200, {
          ok: true,
          provider: "gemini",
          keyUsed: item.nome,
          text: texto,
          html: texto,
          content: texto,
          resultado: texto,
        });
      } catch (erro) {
        erros.push(`${item.nome}: ${erro.message}`);
      }
    }

    for (const item of openaiKeys) {
      try {
        const texto = await chamarOpenAI(item.valor, prompt);

        return json(res, 200, {
          ok: true,
          provider: "openai",
          keyUsed: item.nome,
          text: texto,
          html: texto,
          content: texto,
          resultado: texto,
        });
      } catch (erro) {
        erros.push(`${item.nome}: ${erro.message}`);
      }
    }

    return json(res, 500, {
      ok: false,
      error:
        "A IA não conseguiu gerar. Todas as chaves Gemini/OpenAI falharam, estão sem cota, sem crédito ou inválidas.",
      detalhes: erros,
    });
  } catch (erro) {
    return json(res, 500, {
      ok: false,
      error: erro.message || "Erro interno ao gerar conteúdo.",
    });
  }
}
