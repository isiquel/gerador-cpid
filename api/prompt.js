module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Método não permitido. Use POST." });
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
    const assunto = String(body.assunto || "").trim();
    const materialType = String(body.materialType || "sermao").trim();
    const adminCode = String(body.adminCode || "").trim();

    if (!codigoAdminValido(adminCode)) {
      return res.status(403).json({
        ok: false,
        error: "O Gerador de Prompt Automático é reservado. Digite o código de acesso correto."
      });
    }

    if (!assunto) {
      return res.status(400).json({
        ok: false,
        error: "Digite um assunto para gerar o prompt automático."
      });
    }

    const models = [
      process.env.GEMINI_TEXT_MODEL_1 || "gemini-3.5-flash",
      process.env.GEMINI_TEXT_MODEL_2 || "gemini-3.1-flash-lite",
      process.env.GEMINI_TEXT_MODEL_3 || "gemini-2.5-flash",
      process.env.GEMINI_TEXT_MODEL_4 || "gemini-2.5-flash-lite",
      "gemini-2.0-flash"
    ].filter(Boolean);

    const prompt = buildPromptAutomatico(assunto, materialType);
    const result = await callGeminiText(apiKey, models, prompt);
    const text = extractText(result.data);
    const promptData = parseJson(text);

    if (!promptData) {
      return res.status(500).json({
        ok: false,
        error: "A IA respondeu, mas não entregou um JSON válido para o prompt automático."
      });
    }

    return res.status(200).json({
      ok: true,
      modelUsed: result.modelUsed,
      promptData
    });

  } catch (error) {
    console.error("Erro em api/prompt.js:", error);

    return res.status(500).json({
      ok: false,
      error: error.message || "Erro interno ao gerar prompt automático."
    });
  }
};

function codigoAdminValido(codigoRecebido) {
  const codigoCorreto = process.env.Isiquel_Admin || "00";
  return String(codigoRecebido || "").trim() === String(codigoCorreto).trim();
}

function buildPromptAutomatico(assunto, materialType) {
  return `
Você é um assistente pastoral, teológico, bíblico e editorial.

Crie um prompt automático para preencher os campos de um aplicativo chamado VERBO IA.

ASSUNTO INFORMADO PELO USUÁRIO:
${assunto}

TIPO DE MATERIAL:
${materialType}

REGRAS:
1. Responda somente em JSON válido.
2. Não use markdown.
3. Não escreva nada fora do JSON.
4. Use português do Brasil.
5. Crie um título forte, bíblico e pastoral.
6. Crie subtítulo coerente.
7. Crie tema principal bem explicado.
8. Crie base bíblica com várias referências.
9. Crie público-alvo adequado.
10. Crie tom do material.
11. Seja bíblico, pastoral, profundo e seguro.
12. Para revista, pense em revista mensal de EBD.
13. Para sermão, pense em pregação de púlpito.
14. Para curso, pense em aulas organizadas.
15. Para e-book e livro, pense em material editorial cristão.

FORMATO JSON:
{
  "title": "",
  "subtitle": "",
  "theme": "",
  "biblicalBase": "",
  "targetAudience": "",
  "tone": ""
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
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.55,
              topP: 0.88,
              maxOutputTokens: 4000
            }
          })
        }
      );

      const rawText = await response.text();
      const data = safeJson(rawText);

      if (!response.ok) {
        const msg = data?.error?.message || rawText || `Erro no modelo ${model}`;
        throw new Error(msg.slice(0, 900));
      }

      if (!data) {
        throw new Error("O modelo respondeu em formato inválido.");
      }

      return { modelUsed: model, data };

    } catch (error) {
      lastError = error;
      console.error("Falha no modelo", model, error.message);
    }
  }

  throw lastError || new Error("Nenhum modelo conseguiu gerar o prompt automático.");
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
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
      } catch (_) {
        return null;
      }
    }
  }

  return null;
}
