export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Método não permitido. Use POST."
    });
  }

  try {
    const body = req.body || {};

    const adminCodeServer = process.env.Isiquel_Admin || "00";
    const adminCode = String(body.adminCode || body.codigoAcesso || "").trim();

    if (!adminCode || adminCode !== adminCodeServer) {
      return res.status(401).json({
        error: "Código de acesso inválido para gerar prompt automático."
      });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY || "";
    const openaiApiKey = process.env.OPENAI_API_KEY || "";

    if (!geminiApiKey && !openaiApiKey) {
      return res.status(500).json({
        error: "Nenhuma chave de IA configurada. Configure GEMINI_API_KEY ou OPENAI_API_KEY na Vercel."
      });
    }

    const tipo = String(body.materialType || body.tipoMaterial || "sermao").trim();
    const tema = String(body.theme || body.tema || body.temaPrincipal || "").trim();
    const titulo = String(body.title || body.titulo || "").trim();
    const subtitulo = String(body.subtitle || body.subtitulo || "").trim();
    const textoBase = String(body.biblicalBase || body.textoBase || body.textoBiblicoBase || "").trim();
    const publico = String(body.targetAudience || body.publicoAlvo || "").trim();
    const profundidade = String(body.depthLevel || body.profundidade || "muito profundo").trim();
    const tom = String(body.tone || body.tomMaterial || "").trim();
    const traducao = String(body.bibleVersion || body.traducao || "King James Fiel 1611").trim();

    if (!tema) {
      return res.status(400).json({
        error: "Digite um tema para gerar o prompt."
      });
    }

    const promptDeComando = criarPromptDeComando({
      tipo,
      tema,
      titulo,
      subtitulo,
      textoBase,
      publico,
      profundidade,
      tom,
      traducao
    });

    const resultado = await gerarComFallback({
      prompt: promptDeComando,
      geminiApiKey,
      openaiApiKey
    });

    if (!resultado.text) {
      return res.status(500).json({
        error: limparMensagemErro(resultado.error || "Não foi possível gerar o prompt automático.")
      });
    }

    return res.status(200).json({
      prompt: resultado.text,
      text: resultado.text,
      content: resultado.text,
      provider: resultado.provider
    });
  } catch (erro) {
    return res.status(500).json({
      error: limparMensagemErro(erro?.message || "Erro interno ao gerar prompt automático.")
    });
  }
}

function criarPromptDeComando(dados) {
  const nomeTipo = nomesTipo(dados.tipo);

  return `
Você é um pastor, teólogo, escritor cristão e editor de materiais bíblicos.

Crie um PROMPT DE COMANDO profundo, completo e pronto para ser usado em uma IA geradora de conteúdo cristão.

Tipo de material que o usuário quer criar:
${nomeTipo}

Tema informado pelo usuário:
${dados.tema}

Dados complementares:
Título: ${dados.titulo || "não informado"}
Subtítulo: ${dados.subtitulo || "não informado"}
Texto bíblico base: ${dados.textoBase || "não informado"}
Público-alvo: ${dados.publico || "não informado"}
Profundidade: ${dados.profundidade || "muito profundo"}
Tom: ${dados.tom || "bíblico, pastoral, profundo, didático, reverente e edificante"}
Tradução bíblica preferida: ${dados.traducao || "King James Fiel 1611"}

O prompt final deve:
- ser escrito em português do Brasil;
- ser profundo, organizado, bíblico, pastoral, didático e reverente;
- pedir referências bíblicas coerentes;
- pedir explicação dos textos bíblicos;
- pedir aplicação espiritual;
- evitar conteúdo raso, genérico ou repetitivo;
- ser específico para o tipo de material selecionado;
- sair pronto para ser colado no campo "Tema principal";
- orientar a IA a criar conteúdo cristão fiel, claro e edificante.

Regras por tipo de material:

Se for SERMÃO:
Peça um sermão completo com título, subtítulo, texto bíblico base, introdução forte, desenvolvimento, tópicos organizados, explicação bíblica, aplicação para a igreja, conclusão e oração final.

Se for DEVOCIONAL:
Peça um devocional com texto bíblico, reflexão, aplicação pessoal, direção espiritual e oração.

Se for ESTUDO BÍBLICO/TEOLÓGICO:
Peça introdução, contexto bíblico, explicação dos textos, tópicos doutrinários, aplicação prática, conclusão e perguntas para reflexão.

Se for E-BOOK:
Peça introdução, capítulos organizados, desenvolvimento profundo, aplicações, conclusão e linguagem pastoral.

Se for LIVRO:
Peça estrutura de livro cristão com capítulos, introdução geral, desenvolvimento progressivo, base bíblica, aplicações pastorais e conclusão final.

Se for CURSO:
Peça aulas organizadas, objetivos, conteúdo, atividades, perguntas, aplicação prática e conclusão.

Se for REVISTA DE ENSINO BÍBLICO:
Peça revista mensal de Escola Bíblica Dominical com capa, apresentação ao professor, panorama geral, orientações ao professor, 4 lições completas, texto áureo, verdade prática, leitura bíblica em classe, objetivos, introdução, tópicos, subtópicos, aplicação, conclusão, auxílios, subsídios, perguntas e respostas, capa e contracapa.

Responda SOMENTE com o prompt final.
Não use JSON.
Não use markdown.
Não explique o que você fez.
`;
}

function nomesTipo(tipo) {
  const mapa = {
    sermao: "Sermão",
    devocional: "Devocional",
    estudo: "Estudo bíblico/teológico",
    ebook: "E-book cristão",
    livro: "Livro cristão",
    curso: "Curso cristão",
    revista: "Revista de ensino bíblico"
  };

  return mapa[tipo] || tipo || "Material cristão";
}

async function gerarComFallback({ prompt, geminiApiKey, openaiApiKey }) {
  const erros = [];

  if (geminiApiKey) {
    const modelosGemini = limparLista([
      process.env.GEMINI_TEXT_MODEL_1 || "gemini-2.5-flash-lite",
      process.env.GEMINI_TEXT_MODEL_2 || "gemini-2.5-flash",
      process.env.GEMINI_TEXT_MODEL_3 || "gemini-2.0-flash"
    ]);

    for (const model of modelosGemini) {
      try {
        const text = await callGeminiText(geminiApiKey, model, prompt);

        if (text) {
          return {
            text,
            provider: `gemini:${model}`
          };
        }
      } catch (erro) {
        erros.push(`Gemini ${model}: ${erro?.message || "erro desconhecido"}`);

        if (ehErroDeCota(erro?.message)) {
          break;
        }
      }
    }
  }

  if (openaiApiKey) {
    const modelosOpenAI = limparLista([
      process.env.OPENAI_TEXT_MODEL_1 || "gpt-4.1-mini",
      process.env.OPENAI_TEXT_MODEL_2 || "gpt-4.1",
      process.env.OPENAI_TEXT_MODEL_3 || "gpt-4.1-nano"
    ]);

    for (const model of modelosOpenAI) {
      try {
        const text = await callOpenAIText(openaiApiKey, model, prompt);

        if (text) {
          return {
            text,
            provider: `openai:${model}`
          };
        }
      } catch (erro) {
        erros.push(`OpenAI ${model}: ${erro?.message || "erro desconhecido"}`);

        if (ehErroDeCota(erro?.message)) {
          break;
        }
      }
    }
  }

  return {
    text: "",
    provider: "",
    error: erros.join(" | ")
  };
}

function limparLista(lista) {
  return [...new Set(lista.filter(Boolean).map((x) => String(x).trim()).filter(Boolean))];
}

async function callGeminiText(apiKey, model, prompt) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const resposta = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.75,
        topP: 0.9,
        maxOutputTokens: 6000
      }
    })
  });

  const data = await resposta.json().catch(() => null);

  if (!resposta.ok) {
    throw new Error(data?.error?.message || `Erro no Gemini ${model}.`);
  }

  const texto = data?.candidates?.[0]?.content?.parts
    ?.map((p) => p.text || "")
    .join("\n")
    .trim();

  if (!texto) {
    throw new Error(`O Gemini ${model} não retornou texto.`);
  }

  return texto;
}

async function callOpenAIText(apiKey, model, prompt) {
  const resposta = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: "Você cria prompts cristãos profundos, bíblicos, pastorais e editoriais. Responda somente com o prompt final."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.75,
      max_tokens: 6000
    })
  });

  const data = await resposta.json().catch(() => null);

  if (!resposta.ok) {
    throw new Error(data?.error?.message || `Erro na OpenAI ${model}.`);
  }

  const texto = data?.choices?.[0]?.message?.content?.trim();

  if (!texto) {
    throw new Error(`A OpenAI ${model} não retornou texto.`);
  }

  return texto;
}

function ehErroDeCota(msg) {
  const texto = String(msg || "").toLowerCase();

  return (
    texto.includes("quota") ||
    texto.includes("exceeded") ||
    texto.includes("billing") ||
    texto.includes("rate limit") ||
    texto.includes("insufficient_quota")
  );
}

function limparMensagemErro(msg) {
  const texto = String(msg || "").toLowerCase();

  if (ehErroDeCota(texto)) {
    return "A cota da IA acabou ou a API está sem crédito disponível. Aguarde a renovação da cota ou adicione crédito na Gemini/OpenAI.";
  }

  if (
    texto.includes("api key") ||
    texto.includes("apikey") ||
    texto.includes("invalid key") ||
    texto.includes("unauthorized")
  ) {
    return "A chave da API está inválida ou não foi configurada corretamente na Vercel.";
  }

  if (texto.includes("not found") || texto.includes("model")) {
    return "Um dos modelos configurados não está disponível na sua conta.";
  }

  return String(msg || "Erro ao gerar prompt automático.");
}
