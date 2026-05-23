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

    const assunto = String(body.assunto || "").trim();
    const tipo = String(body.materialType || "sermao").trim();

    if (!assunto) {
      return res.status(400).json({
        ok: false,
        error: "Digite um tema para criar o prompt automático."
      });
    }

    const prompt = montarPrompt({ assunto, tipo });

    const models = [
      process.env.GEMINI_TEXT_MODEL_1 || "gemini-3.5-flash",
      process.env.GEMINI_TEXT_MODEL_2 || "gemini-3.1-flash-lite",
      process.env.GEMINI_TEXT_MODEL_3 || "gemini-2.5-flash",
      process.env.GEMINI_TEXT_MODEL_4 || "gemini-2.5-flash-lite",
      "gemini-2.0-flash"
    ].filter(Boolean);

    const result = await chamarGemini(apiKey, models, prompt);
    const text = extrairTexto(result.data);
    const dados = parseJson(text);

    if (!dados) {
      return res.status(500).json({
        ok: false,
        error: "A IA não retornou um prompt válido. Tente novamente."
      });
    }

    return res.status(200).json({
      ok: true,
      modelUsed: result.modelUsed,
      promptData: dados
    });

  } catch (error) {
    console.error("Erro em api/prompt.js:", error);

    return res.status(500).json({
      ok: false,
      error: error.message || "Erro interno ao criar prompt automático."
    });
  }
};

function montarPrompt({ assunto, tipo }) {
  return `
Você é um assistente pastoral, teológico, bíblico e editorial.

Sua tarefa é criar um prompt profundo para preencher automaticamente uma ferramenta chamada VERBO IA.

TEMA PEDIDO PELO USUÁRIO:
${assunto}

TIPO DE MATERIAL SELECIONADO:
${tipo}

REGRAS OBRIGATÓRIAS:
1. Responda somente em JSON válido.
2. Não use markdown.
3. Não escreva nada fora do JSON.
4. Crie um título forte, bíblico e chamativo.
5. Crie um subtítulo pastoral e profundo.
6. Crie um tema principal bem completo, expansivo, bíblico, teológico, pastoral e aplicável.
7. Indique textos bíblicos coerentes com o tema.
8. Indique público-alvo adequado.
9. Indique tom do material.
10. Se o tema envolver doutrina, siga a linha bíblica conservadora e, quando envolver dons, Espírito Santo, igreja e escatologia, siga o pentecostalismo clássico.
11. Evite sensacionalismo, exageros, misticismo sem base bíblica, triunfalismo vazio e afirmações sem apoio nas Escrituras.
12. O campo "theme" precisa ser grande, profundo e pronto para gerar um material forte.
13. O conteúdo deve ser adequado ao tipo escolhido pelo usuário.

SE FOR SERMÃO:
O tema deve pedir introdução forte, contexto bíblico, explicação do texto, pontos principais, aplicações, conclusão, apelo e oração.

SE FOR CURSO:
O tema deve pedir aulas organizadas, objetivos, conteúdo expandido, base bíblica, aplicação, atividade e tarefa.

SE FOR REVISTA:
O tema deve pedir lições com texto áureo, verdade prática, leitura bíblica, objetivos, tópicos, aplicação, conclusão e perguntas com respostas.

SE FOR DEVOCIONAL:
O tema deve pedir reflexões curtas, profundas, práticas, com versículo, aplicação, pergunta e oração.

SE FOR LIVRO:
O tema deve pedir capítulos com linguagem literária, reflexão bíblica, profundidade pastoral e aplicação.

SE FOR E-BOOK:
O tema deve pedir capítulos objetivos, modernos, práticos, profundos, com perguntas e oração.

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

async function chamarGemini(apiKey, models, prompt) {
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
              temperature: 0.78,
              topP: 0.9,
              maxOutputTokens: 7000
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

  throw lastError || new Error("Nenhum modelo conseguiu criar o prompt automático.");
}

function extrairTexto(data) {
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
