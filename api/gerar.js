// api/gerar.js
// VERBO IA — motor de geração com múltiplas chaves Gemini e OpenAI
// Ordem de tentativa:
// 1. GEMINI_API_KEY
// 2. GEMINI_API_KEY_2
// 3. OPENAI_API_KEY
// 4. OPENAI_API_KEY_2

function responder(res, status, data) {
  return res.status(status).json(data);
}

function limparTexto(valor) {
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

  const chaves = [];
  const vistas = new Set();

  for (const nome of nomes) {
    const valor = process.env[nome];

    if (!valor) continue;

    const chave = String(valor).trim();

    if (!chave) continue;
    if (vistas.has(chave)) continue;

    vistas.add(chave);

    chaves.push({
      nome,
      valor: chave,
    });
  }

  return chaves;
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
  const modelo = process.env.GEMINI_MODEL || "gemini-1.5-flash";

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`;

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
    const mensagem =
      data?.error?.message ||
      `Erro Gemini HTTP ${resposta.status}`;

    throw new Error(mensagem);
  }

  const texto = extrairTextoGemini(data);

  if (!texto) {
    throw new Error("Gemini respondeu vazio.");
  }

  return texto;
}

async function chamarOpenAI(apiKey, prompt) {
  const modelo = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const resposta = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelo,
      temperature: 0.7,
      max_tokens: 8192,
      messages: [
        {
          role: "system",
          content:
            "Você é o motor de geração do VERBO IA. Gere conteúdo cristão, bíblico, organizado, fiel ao pedido do usuário e em HTML limpo quando solicitado. Não diga que foi gerado por IA.",
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
    const mensagem =
      data?.error?.message ||
      `Erro OpenAI HTTP ${resposta.status}`;

    throw new Error(mensagem);
  }

  const texto = extrairTextoOpenAI(data);

  if (!texto) {
    throw new Error("OpenAI respondeu vazio.");
  }

  return texto;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return responder(res, 405, {
      ok: false,
      error: "Método não permitido. Use POST.",
    });
  }

  try {
    const body = req.body || {};

    const prompt = limparTexto(
      body.prompt ||
      body.texto ||
      body.message ||
      body.conteudo ||
      body.input
    );

    if (!prompt) {
      return responder(res, 400, {
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

        return responder(res, 200, {
          ok: true,
          provider: "gemini",
          keyUsed: item.nome,
          text: texto,
          html: texto,
          content: texto,
          resultado: texto,
          resposta: texto,
        });
      } catch (erro) {
        erros.push(`${item.nome}: ${erro.message}`);
      }
    }

    for (const item of openaiKeys) {
      try {
        const texto = await chamarOpenAI(item.valor, prompt);

        return responder(res, 200, {
          ok: true,
          provider: "openai",
          keyUsed: item.nome,
          text: texto,
          html: texto,
          content: texto,
          resultado: texto,
          resposta: texto,
        });
      } catch (erro) {
        erros.push(`${item.nome}: ${erro.message}`);
      }
    }

    return responder(res, 500, {
      ok: false,
      error:
        "A IA não conseguiu gerar. Todas as chaves Gemini/OpenAI falharam, estão sem cota, sem crédito ou inválidas.",
      detalhes: erros,
    });
  } catch (erro) {
    return responder(res, 500, {
      ok: false,
      error: erro.message || "Erro interno ao gerar conteúdo.",
    });
  }
}
