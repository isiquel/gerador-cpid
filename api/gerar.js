export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      sucesso: false,
      erro: "Método não permitido. Use POST."
    });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        sucesso: false,
        erro: "A chave GEMINI_API_KEY não foi configurada na Vercel."
      });
    }

    const { prompt } = req.body || {};

    if (!prompt || typeof prompt !== "string" || prompt.trim().length < 10) {
      return res.status(400).json({
        sucesso: false,
        erro: "O prompt está vazio ou muito curto."
      });
    }

    const modelos = [
      "gemini-3.1-flash-lite",
      "gemini-3.1-flash-lite-preview",
      "gemini-2.5-flash-lite",
      "gemini-2.5-flash"
    ];

    let ultimoErro = "";

    for (const modelo of modelos) {
      try {
        const url =
          "https://generativelanguage.googleapis.com/v1beta/models/" +
          modelo +
          ":generateContent?key=" +
          encodeURIComponent(apiKey);

        const resposta = await fetch(url, {
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
              temperature: 0.7,
              topP: 0.95,
              maxOutputTokens: 4096
            }
          })
        });

        const dados = await resposta.json();

        if (!resposta.ok) {
          const mensagem =
            dados &&
            dados.error &&
            dados.error.message
              ? dados.error.message
              : "Erro desconhecido na API do Gemini.";

          ultimoErro = "Erro com o modelo " + modelo + ": " + mensagem;
          continue;
        }

        const texto =
          dados &&
          dados.candidates &&
          dados.candidates[0] &&
          dados.candidates[0].content &&
          dados.candidates[0].content.parts &&
          dados.candidates[0].content.parts[0] &&
          dados.candidates[0].content.parts[0].text
            ? dados.candidates[0].content.parts[0].text
            : "";

        if (!texto) {
          ultimoErro = "O modelo " + modelo + " respondeu, mas não retornou texto.";
          continue;
        }

        return res.status(200).json({
          sucesso: true,
          modelo,
          texto
        });

      } catch (erroModelo) {
        ultimoErro = erroModelo.message || "Erro desconhecido com o modelo " + modelo;
      }
    }

    return res.status(500).json({
      sucesso: false,
      erro: ultimoErro || "Nenhum modelo conseguiu gerar o material."
    });

  } catch (erro) {
    return res.status(500).json({
      sucesso: false,
      erro: erro.message || "Erro interno ao gerar material."
    });
  }
}
