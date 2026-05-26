export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Método não permitido. Use POST."
    });
  }

  try {
    const geminiApiKey = process.env.GEMINI_API_KEY || "";
    const openaiApiKey = process.env.OPENAI_API_KEY || "";

    if (!geminiApiKey && !openaiApiKey) {
      return res.status(500).json({
        ok: false,
        error: "Nenhuma chave de imagem foi configurada. Configure GEMINI_API_KEY ou OPENAI_API_KEY na Vercel."
      });
    }

    const dados = normalizarDados(req.body || {});
    const adminCodeServer = process.env.Isiquel_Admin || "00";

    const tiposReservados = ["revista", "livro", "ebook", "curso"];

    if (tiposReservados.includes(dados.materialType)) {
      if (!dados.adminCode || dados.adminCode !== adminCodeServer) {
        return res.status(401).json({
          ok: false,
          error: "Código de acesso inválido para gerar capa."
        });
      }
    }

    const prompt = criarPromptImagem(dados);
    const erros = [];

    if (geminiApiKey) {
      const modelosGemini = limparLista([
        process.env.GEMINI_IMAGE_MODEL_1 || "gemini-2.5-flash-image-preview",
        process.env.GEMINI_IMAGE_MODEL_2 || "gemini-2.0-flash-preview-image-generation",
        process.env.GEMINI_IMAGE_MODEL_3 || "gemini-2.5-flash-image"
      ]);

      for (const modelo of modelosGemini) {
        try {
          const imageDataUrl = await gerarImagemGemini({
            apiKey: geminiApiKey,
            model: modelo,
            prompt
          });

          if (imageDataUrl) {
            return res.status(200).json({
              ok: true,
              provider: `gemini:${modelo}`,
              imageDataUrl,
              prompt
            });
          }
        } catch (erro) {
          erros.push(`Gemini ${modelo}: ${erro?.message || "erro desconhecido"}`);
        }
      }
    }

    if (openaiApiKey) {
      const modelosOpenAI = limparLista([
        process.env.OPENAI_IMAGE_MODEL_1 || "gpt-image-1",
        process.env.OPENAI_IMAGE_MODEL_2 || "gpt-image-1-mini",
        process.env.OPENAI_IMAGE_MODEL_3 || "dall-e-3"
      ]);

      for (const modelo of modelosOpenAI) {
        try {
          const imageDataUrl = await gerarImagemOpenAI({
            apiKey: openaiApiKey,
            model: modelo,
            prompt,
            size: escolherTamanhoOpenAI(modelo)
          });

          if (imageDataUrl) {
            return res.status(200).json({
              ok: true,
              provider: `openai:${modelo}`,
              imageDataUrl,
              prompt
            });
          }
        } catch (erro) {
          erros.push(`OpenAI ${modelo}: ${erro?.message || "erro desconhecido"}`);
        }
      }
    }

    return res.status(500).json({
      ok: false,
      error: limparMensagemErro(erros.join(" | ") || "Não foi possível gerar a imagem profissional da capa.")
    });
  } catch (erro) {
    return res.status(500).json({
      ok: false,
      error: limparMensagemErro(erro?.message || "Erro interno ao gerar imagem da capa.")
    });
  }
}

/* =========================================================
   NORMALIZAÇÃO
========================================================= */

function normalizarDados(body) {
  const tipoImagem = String(body.tipoImagem || body.imageType || "front").trim().toLowerCase();

  const materialType = String(
    body.materialType ||
    body.tipoMaterial ||
    "revista"
  ).trim().toLowerCase();

  const title = String(body.title || body.titulo || "").trim();
  const subtitle = String(body.subtitle || body.subtitulo || "").trim();
  const theme = String(body.theme || body.tema || body.temaPrincipal || "").trim();
  const author = String(body.author || body.autor || body.comentarista || "").trim();
  const ministry = String(body.ministry || body.editora || body.ministerio || "").trim();
  const revistaVersion = String(body.revistaVersion || body.versaoRevista || "professor").trim();
  const visualTheme = String(body.visualTheme || "").trim();

  const lessonTitles = Array.isArray(body.lessonTitles)
    ? body.lessonTitles
    : [];

  return {
    adminCode: String(body.adminCode || body.codigoAcesso || "").trim(),

    materialType,
    tipoImagem,

    title,
    subtitle,
    theme,
    author,
    ministry,
    revistaVersion,
    visualTheme,
    lessonTitles
  };
}

function limparLista(lista) {
  return [...new Set(lista.filter(Boolean).map((x) => String(x).trim()).filter(Boolean))];
}

function escolherTamanhoOpenAI(modelo) {
  const m = String(modelo || "").toLowerCase();

  if (m.includes("dall-e-3")) {
    return "1024x1792";
  }

  return "1024x1536";
}

/* =========================================================
   PROMPT DE IMAGEM
========================================================= */

function criarPromptImagem(dados) {
  const isBack = dados.tipoImagem === "back";

  const tipoRevista =
    dados.revistaVersion === "aluno"
      ? "REVISTA DO ALUNO"
      : "REVISTA DO PROFESSOR";

  const titulosLicoes = dados.lessonTitles.length
    ? dados.lessonTitles.map((t, i) => `${i + 1}. ${t}`).join("\n")
    : "";

  const temaVisual = dados.visualTheme
    ? `\nTema visual editorial já definido:\n${dados.visualTheme}\n`
    : "";

  if (isBack) {
    return `
Crie uma arte vertical profissional em proporção 2:3 para a CONTRACAPA de uma revista cristã de Escola Bíblica Dominical.

IMPORTANTE:
A imagem deve ser somente arte visual de fundo editorial.
Não escreva textos pequenos.
Não coloque letras embaralhadas.
Não coloque marca d'água.
Não coloque logotipo de IA.
Não coloque símbolo do Gemini.
Não coloque pessoas.
Não crie aparência infantil.
Não use folhinhas soltas, bloquinhos, cartões ou papeizinhos retangulares espalhados.
Não polua a composição.

Tema da revista:
${dados.title}

Subtítulo:
${dados.subtitle}

Assunto geral:
${dados.theme}

${temaVisual}

Lições da revista:
${titulosLicoes}

Estilo da contracapa:
- revista cristã adulta;
- Escola Bíblica Dominical;
- editorial profissional;
- reverente;
- elegante;
- bíblica;
- visual nobre;
- profundidade visual;
- fundo sofisticado.

Elementos visuais desejados:
- Bíblia antiga aberta ou fechada de forma discreta;
- pergaminhos enrolados;
- rolos antigos das Escrituras;
- manuscritos bíblicos;
- textura de pergaminho antigo;
- luz dourada suave;
- tons marrons profundos, dourados, bege envelhecido e sombras elegantes;
- atmosfera de reverência, estudo bíblico e preservação das Escrituras.

A contracapa deve ter áreas limpas e confortáveis para colocar texto depois.
Deve parecer uma revista impressa profissional, não uma imagem simples.
`.trim();
  }

  return `
Crie uma arte vertical profissional em proporção 2:3 para a CAPA FRONTAL de uma revista mensal cristã de Escola Bíblica Dominical.

A imagem deve ser uma arte de capa profissional, bonita, editorial e madura.
A imagem será usada como fundo principal da capa, e o aplicativo colocará o título por cima depois.

IMPORTANTE:
NÃO escreva o título na imagem.
NÃO escreva palavras pequenas.
NÃO coloque letras embaralhadas.
NÃO coloque marca d'água.
NÃO coloque logotipo de IA.
NÃO coloque símbolo do Gemini.
NÃO coloque pessoas.
NÃO criar aparência infantil.
NÃO use folhinhas soltas.
NÃO use bloquinhos.
NÃO use cartões espalhados.
NÃO use papeizinhos retangulares.
NÃO poluir a capa.
NÃO esconder o espaço central superior onde o título será colocado depois.

Tema principal da revista:
${dados.title}

Subtítulo:
${dados.subtitle}

Assunto geral:
${dados.theme}

${temaVisual}

Tipo de revista:
REVISTA MENSAL DE ESCOLA BÍBLICA DOMINICAL
${tipoRevista}

Ministério:
${dados.ministry}

Autor/comentarista:
${dados.author}

Lições da revista:
${titulosLicoes}

Direção visual obrigatória:
Crie uma composição nobre, bíblica e editorial com:
- Bíblia antiga aberta em posição de destaque;
- páginas antigas com textura realista;
- pergaminhos enrolados;
- rolos antigos das Escrituras;
- manuscritos bíblicos ao fundo;
- luz dourada suave saindo da Bíblia;
- atmosfera de revelação, autoridade divina, inspiração bíblica e preservação das Escrituras;
- profundidade visual;
- fundo escuro elegante com tons marrons, dourados, bronze, bege antigo e luz suave.

A imagem deve transmitir:
- Bibliologia;
- reverência às Escrituras;
- Palavra de Deus;
- inspiração divina;
- formação do cânon;
- preservação bíblica;
- transmissão das Escrituras;
- estudo bíblico sério;
- herança espiritual da Igreja.

Estilo:
- capa de revista cristã impressa profissional;
- acabamento realista ou semi-ilustrado premium;
- aparência editorial moderna;
- composição elegante;
- iluminação cinematográfica suave;
- visual limpo, nobre e bem acabado;
- sem excesso de elementos;
- sem aparência infantil.

Deixe espaço visual organizado para o título e subtítulo serem colocados pelo aplicativo depois.
A imagem deve funcionar como arte de capa profissional, não apenas como fundo simples.
`.trim();
}

/* =========================================================
   GEMINI IMAGE
========================================================= */

async function gerarImagemGemini({ apiKey, model, prompt }) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: prompt
          }
        ]
      }
    ],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"]
    }
  };

  const resposta = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const data = await resposta.json().catch(() => null);

  if (!resposta.ok) {
    throw new Error(data?.error?.message || `Erro ao gerar imagem com Gemini ${model}.`);
  }

  const parts = data?.candidates?.[0]?.content?.parts || [];

  for (const part of parts) {
    const inlineData = part?.inlineData || part?.inline_data;

    if (inlineData?.data) {
      const mimeType = inlineData.mimeType || inlineData.mime_type || "image/png";
      return `data:${mimeType};base64,${inlineData.data}`;
    }
  }

  throw new Error(`Gemini ${model} não retornou imagem.`);
}

/* =========================================================
   OPENAI IMAGE
========================================================= */

async function gerarImagemOpenAI({ apiKey, model, prompt, size }) {
  const url = "https://api.openai.com/v1/images/generations";

  const body = {
    model,
    prompt,
    size: size || "1024x1536",
    n: 1
  };

  if (!String(model).toLowerCase().includes("dall-e-3")) {
    body.quality = "medium";
  } else {
    body.quality = "standard";
  }

  let resposta = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  let data = await resposta.json().catch(() => null);

  if (!resposta.ok) {
    const msg = data?.error?.message || "";

    if (msg.toLowerCase().includes("quality")) {
      delete body.quality;

      resposta = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
      });

      data = await resposta.json().catch(() => null);
    }
  }

  if (!resposta.ok) {
    throw new Error(data?.error?.message || `Erro ao gerar imagem com OpenAI ${model}.`);
  }

  const item = data?.data?.[0];

  if (item?.b64_json) {
    return `data:image/png;base64,${item.b64_json}`;
  }

  if (item?.url) {
    return await baixarImagemComoDataUrl(item.url);
  }

  throw new Error(`OpenAI ${model} não retornou imagem em base64 nem URL.`);
}

async function baixarImagemComoDataUrl(url) {
  const resposta = await fetch(url);

  if (!resposta.ok) {
    throw new Error("A imagem foi gerada, mas não foi possível baixar a URL retornada pela OpenAI.");
  }

  const contentType = resposta.headers.get("content-type") || "image/png";
  const arrayBuffer = await resposta.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");

  return `data:${contentType};base64,${base64}`;
}

/* =========================================================
   ERROS
========================================================= */

function limparMensagemErro(msg) {
  const texto = String(msg || "").toLowerCase();

  if (
    texto.includes("quota") ||
    texto.includes("exceeded") ||
    texto.includes("billing") ||
    texto.includes("rate limit") ||
    texto.includes("insufficient_quota")
  ) {
    return "A imagem da capa não foi gerada porque a cota/crédito da API de imagem acabou ou o limite foi atingido. O texto da revista pode ser gerado, mas a capa com imagem precisa de cota disponível.";
  }

  if (
    texto.includes("api key") ||
    texto.includes("apikey") ||
    texto.includes("invalid key") ||
    texto.includes("unauthorized")
  ) {
    return "A chave da API de imagem está inválida ou não foi configurada corretamente na Vercel. Confira GEMINI_API_KEY e OPENAI_API_KEY.";
  }

  if (
    texto.includes("model") &&
    (
      texto.includes("not found") ||
      texto.includes("does not exist") ||
      texto.includes("not supported")
    )
  ) {
    return "Um dos modelos de imagem configurados não está disponível na sua conta. Verifique GEMINI_IMAGE_MODEL ou OPENAI_IMAGE_MODEL na Vercel.";
  }

  if (texto.includes("safety") || texto.includes("policy")) {
    return "A API bloqueou a geração da imagem por política de segurança. Tente um tema visual mais simples e menos sensível.";
  }

  return String(msg || "Erro ao gerar imagem da capa.");
}
