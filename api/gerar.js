export const config = {
  maxDuration: 60
};

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

    /*
      Ordem dos modelos:
      1. Primeiro tenta o Pro, que é mais forte.
      2. Depois tenta o 3.5 Flash.
      3. Depois cai para o 3.1 Flash-Lite.
      4. Depois tenta alternativas 2.5.
      
      Se um modelo der cota excedida, indisponível, sem acesso,
      modelo não encontrado ou qualquer erro, o código tenta o próximo.
    */
    const modelos = [
      "gemini-3.1-pro-preview",
      "gemini-3.5-flash",
      "gemini-3.1-flash-lite",
      "gemini-3.1-flash-lite-preview",
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite"
    ];

    let ultimoErro = "";
    const errosDosModelos = [];

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
              temperature: 0.45,
              topP: 0.9,
              maxOutputTokens: 8192
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

          errosDosModelos.push({
            modelo,
            erro: mensagem
          });

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

          errosDosModelos.push({
            modelo,
            erro: "O modelo respondeu, mas não retornou texto."
          });

          continue;
        }

        return res.status(200).json({
          sucesso: true,
          modelo,
          texto
        });

      } catch (erroModelo) {
        const mensagemErro =
          erroModelo && erroModelo.message
            ? erroModelo.message
            : "Erro desconhecido com o modelo " + modelo;

        ultimoErro = mensagemErro;

        errosDosModelos.push({
          modelo,
          erro: mensagemErro
        });
      }
    }

    return res.status(500).json({
      sucesso: false,
      erro:
        "Nenhum modelo conseguiu gerar o material.\n\nÚltimo erro:\n" +
        (ultimoErro || "Erro desconhecido.") +
        "\n\nModelos tentados:\n" +
        errosDosModelos
          .map(function (item) {
            return "- " + item.modelo + ": " + item.erro;
          })
          .join("\n")
    });

  } catch (erro) {
    return res.status(500).json({
      sucesso: false,
      erro: erro.message || "Erro interno ao gerar material."
    });
  }
}
