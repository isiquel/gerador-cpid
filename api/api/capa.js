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

    const body = req.body || {};
    const dados = normalizarDados(body);

    const tiposReservados = ["revista", "livro", "ebook", "curso"];
    const adminCodeServer = process.env.Isiquel_Admin || "00";

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
        process.env.GEMINI_IMAGE_MODEL_1 || "gemini-2.5-flash-image",
        process.env.GEMINI_IMAGE_MODEL_2 || "gemini-3.1-flash-image-preview",
        process.env.GEMINI_IMAGE_MODEL_3 || "gemini-3-pro-image-preview"
      ]);

      for (const modelo of modelosGemini) {
        try {
          const imageDataUrl = await gerarImagemGemini({
            apiKey: geminiApiKey,
            model: modelo,
            prompt,
            aspectRatio: dados.aspectRatio
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
        process.env.OPENAI_IMAGE_MODEL_2 || "gpt-image-1-mini"
      ]);

      for (const modelo of modelosOpenAI) {
        try {
          const imageDataUrl = await gerarImagemOpenAI({
            apiKey: openaiApiKey,
            model: modelo,
            prompt,
            size: dados.openaiSize
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
      error: erros.join(" | ") || "Não foi possível gerar a imagem da capa."
    });
  } catch (erro) {
    return res.status(500).json({
      ok: false,
      error: erro?.message || "Erro interno ao gerar imagem da capa."
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
  const lessonTitles = Array.isArray(body.lessonTitles) ? body.lessonTitles : [];

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
    lessonTitles,

    aspectRatio: tipoImagem === "back" ? "2:3" : "2:3",
    openaiSize: "1024x1536"
  };
}

function limparLista(lista) {
  return [...new Set(lista.filter(Boolean).map((x) => String(x).trim()).filter(Boolean))];
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

  if (isBack) {
    return `
Crie uma imagem vertical em proporção 2:3 para a CONTRACAPA de uma revista cristã de Escola Bíblica Dominical.

NÃO coloque texto pequeno ilegível.
NÃO coloque marca d'água.
NÃO coloque logotipo de IA.
NÃO coloque símbolo do Gemini.
NÃO use folhinhas soltas, bloquinhos ou papeizinhos retangulares.

Tema da revista:
${dados.title}

Subtítulo:
${dados.subtitle}

Assunto geral:
${dados.theme}

Lições da revista:
${titulosLicoes}

Estilo visual:
Contracapa profissional, elegante, editorial, cristã, reverente, bíblica e harmoniosa com uma capa sobre Bibliologia.

Elementos visuais desejados:
- fundo profundo e sofisticado;
- luz dourada suave;
- textura de pergaminho antigo;
- Bíblia aberta ou fechada de forma discreta;
- rolos antigos das Escrituras;
- manuscritos bíblicos;
- atmosfera espiritual, nobre e reverente.

A contracapa deve parecer material impresso profissional, com composição limpa, bonita e equilibrada.
Deve ter espaço visual confortável para inserir posteriormente textos como ministério, autor e frase de fechamento.
Não colocar pessoas.
Não criar aparência infantil.
Não poluir a imagem.
`.trim();
  }

  return `
Crie uma imagem vertical em proporção 2:3 para a CAPA FRONTAL de uma revista mensal cristã de Escola Bíblica Dominical.

A capa precisa parecer capa profissional de revista impressa, com visual editorial, reverente, moderno, bíblico e muito bem acabado.

IMPORTANTE:
NÃO use folhinhas soltas.
NÃO use bloquinhos.
NÃO use papeizinhos retangulares.
NÃO use cartões espalhados.
NÃO use símbolo do Gemini.
NÃO use marca d'água.
NÃO coloque logotipo de IA.
NÃO criar imagem infantil.
NÃO poluir a capa.
NÃO esconder o espaço do título.

Tema principal da revista:
${dados.title}

Subtítulo:
${dados.subtitle}

Assunto geral:
${dados.theme}

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
No centro da capa, criar uma composição nobre e bonita com:
- Bíblia aberta com aparência antiga e sagrada;
- pergaminhos enrolados;
- rolos antigos das Escrituras;
- manuscritos bíblicos;
- páginas antigas;
- luz dourada suave saindo da Bíblia;
- atmosfera de revelação, Palavra de Deus, estudo bíblico e autoridade divina.

A imagem deve transmitir:
- Bibliologia;
- reverência às Escrituras;
- Palavra de Deus;
- inspiração;
- preservação;
- estudo bíblico;
- herança espiritual.

Estilo:
- editorial cristão profissional;
- acabamento realista ou semi-ilustrado;
- tons dourados, marrons profundos, bege antigo e luz suave;
- composição elegante;
- aparência de revista de EBD bem produzida;
- fundo sofisticado;
- profundidade visual.

Deixe área visual organizada para que o título e subtítulo sejam colocados depois pelo aplicativo.
A imagem deve funcionar como arte de capa profissional, não apenas como fundo simples.
`.trim();
}

/* =========================================================
   GEMINI IMAGE
========================================================= */

async function gerarImagemGemini({ apiKey, model, prompt, aspectRatio }) {
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
      responseFormat: {
        image: {
          aspectRatio: aspectRatio || "2:3"
        }
      }
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
    quality: "medium",
    n: 1,
    response_format: "b64_json"
  };

  const resposta = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  const data = await resposta.json().catch(() => null);

  if (!resposta.ok) {
    throw new Error(data?.error?.message || `Erro ao gerar imagem com OpenAI ${model}.`);
  }

  const b64 = data?.data?.[0]?.b64_json;

  if (!b64) {
    throw new Error(`OpenAI ${model} não retornou imagem em base64.`);
  }

  return `data:image/png;base64,${b64}`;
}
