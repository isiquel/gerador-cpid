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

    /*
      IMPORTANTE:
      O index.html já controla o acesso aos recursos reservados pela interface.
      Por padrão, esta API não bloqueia a capa por adminCode para não impedir a geração.
      Se quiser obrigar código também no servidor, crie na Vercel:
      REQUIRE_IMAGE_ADMIN=true
      e configure:
      Isiquel_Admin=seu_codigo
    */
    const exigirAdminNaImagem = String(process.env.REQUIRE_IMAGE_ADMIN || "false").toLowerCase() === "true";
    const adminCodeServer = process.env.Isiquel_Admin || "";

    const tiposReservados = ["revista", "revista-ebd", "livro", "ebook", "curso"];

    if (exigirAdminNaImagem && tiposReservados.includes(dados.materialType)) {
      if (!dados.adminCode || dados.adminCode !== adminCodeServer) {
        return res.status(401).json({
          ok: false,
          error: "Código de acesso inválido para gerar capa."
        });
      }
    }

    const prompt = criarPromptImagem(dados);
    const erros = [];

    /*
      1) Tenta Gemini primeiro.
      2) Se não conseguir, tenta OpenAI.
      3) Se gerar, devolve em vários nomes compatíveis:
         imageUrl, dataUrl, imageDataUrl, image
      Assim o index.html reconhece a capa sem precisar mexer de novo.
    */

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
            return responderImagem(res, {
              provider: `gemini:${modelo}`,
              imageDataUrl
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
        process.env.OPENAI_IMAGE_MODEL_2 || "dall-e-3"
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
            return responderImagem(res, {
              provider: `openai:${modelo}`,
              imageDataUrl
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
   RESPOSTA COMPATÍVEL COM O INDEX.HTML
========================================================= */

function responderImagem(res, { provider, imageDataUrl }) {
  return res.status(200).json({
    ok: true,
    provider,

    // Compatibilidade com o index.html atual
    imageUrl: imageDataUrl,
    dataUrl: imageDataUrl,
    imageDataUrl,
    image: imageDataUrl
  });
}

/* =========================================================
   NORMALIZAÇÃO
========================================================= */

function normalizarDados(body) {
  const tipoImagem = String(
    body.tipoImagem ||
    body.imageType ||
    body.etapa ||
    "front"
  ).trim().toLowerCase();

  const materialType = String(
    body.materialType ||
    body.tipoMaterial ||
    body.tipo ||
    "revista"
  ).trim().toLowerCase();

  const title = String(body.title || body.titulo || "").trim();
  const subtitle = String(body.subtitle || body.subtitulo || "").trim();
  const theme = String(body.theme || body.tema || body.temaPrincipal || "").trim();
  const author = String(body.author || body.autor || body.comentarista || "").trim();
  const ministry = String(body.ministry || body.editora || body.ministerio || "").trim();

  const revistaVersion = String(
    body.revistaVersion ||
    body.versaoRevista ||
    body.revistaTipo ||
    "professor"
  ).trim().toLowerCase();

  const revistaClasse = String(
    body.revistaClasse ||
    body.classe ||
    body.publico ||
    "adultos"
  ).trim();

  const revistaMes = String(body.revistaMes || body.mes || "").trim();
  const revistaAno = String(body.revistaAno || body.ano || "").trim();

  const visualTheme = String(body.visualTheme || "").trim();

  const promptDireto = String(
    body.prompt ||
    body.imagePrompt ||
    body.promptImagem ||
    ""
  ).trim();

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
    revistaClasse,
    revistaMes,
    revistaAno,

    visualTheme,
    promptDireto,
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
  /*
    Se o index.html já mandou o prompt pronto,
    usamos ele e apenas reforçamos a regra de NÃO colocar texto.
  */
  if (dados.promptDireto && dados.promptDireto.length > 50) {
    return reforcarPromptSemTexto(dados.promptDireto);
  }

  const isBack =
    dados.tipoImagem === "back" ||
    dados.tipoImagem.includes("contracapa");

  const tipoRevista =
    dados.revistaVersion.includes("aluno")
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
Crie SOMENTE A ARTE DE FUNDO de uma contracapa profissional para uma revista cristã mensal de Escola Bíblica Dominical.

NÃO escreva nenhum texto na imagem.
NÃO coloque título, subtítulo, letras, palavras, logotipos, marcas, selos, assinatura ou nomes.
A imagem será usada como fundo visual, e o aplicativo colocará os textos depois.

Tema da revista:
${dados.title || "Bibliologia"}

Subtítulo:
${dados.subtitle || "A origem, formação, preservação e transmissão da Bíblia"}

Assunto geral:
${dados.theme || "Bibliologia e o valor das Escrituras"}

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
- tons marrons profundos, dourados, bege envelhecido, azul escuro e sombras elegantes;
- atmosfera de reverência, estudo bíblico e preservação das Escrituras.

A contracapa deve ter áreas limpas e confortáveis para o app colocar texto depois.
Deve parecer uma revista impressa profissional, não uma imagem simples.

Formato vertical 2:3.
Sem texto.
Sem letras legíveis.
Sem marca d'água.
Sem logotipo.
`.trim();
  }

  return `
Crie SOMENTE A ARTE DE FUNDO de uma capa frontal profissional para uma revista mensal cristã de Escola Bíblica Dominical.

NÃO escreva nenhum texto na imagem.
NÃO coloque título, subtítulo, letras, palavras, logotipos, marcas, selos, assinatura ou nomes.
A imagem será usada como fundo principal da capa, e o aplicativo colocará todos os textos por cima depois.

Tema principal da revista:
${dados.title || "O Livro que Carregamos"}

Subtítulo:
${dados.subtitle || "A origem, formação, preservação e transmissão da Bíblia"}

Assunto geral:
${dados.theme || "Bibliologia: a origem, formação, preservação e transmissão das Escrituras"}

${temaVisual}

Tipo de revista:
REVISTA MENSAL DE ESCOLA BÍBLICA DOMINICAL
${tipoRevista}

Classe:
${dados.revistaClasse || "adultos"}

Mês/Ano:
${[dados.revistaMes, dados.revistaAno].filter(Boolean).join(" de ")}

Ministério:
${dados.ministry || "CPID — Casa Publicadora da Igreja de Deus"}

Autor/comentarista:
${dados.author || "Isiquel Rodrigues"}

Lições da revista:
${titulosLicoes}

DIREÇÃO VISUAL OBRIGATÓRIA:
Crie uma composição nobre, bíblica e editorial com:
- uma Bíblia antiga aberta em posição de destaque;
- páginas antigas com textura realista;
- luz dourada celestial saindo da Bíblia;
- pergaminhos enrolados;
- rolos antigos das Escrituras;
- papiros e manuscritos ao fundo;
- textura sutil de manuscritos hebraicos e gregos, mas sem letras legíveis;
- atmosfera de revelação, autoridade divina, inspiração bíblica e preservação das Escrituras;
- profundidade visual;
- fundo escuro elegante com tons azul profundo, marrom, dourado, bronze, bege antigo e luz quente.

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

ESTILO:
- capa de revista cristã impressa profissional;
- acabamento realista ou semi-ilustrado premium;
- aparência editorial moderna;
- composição elegante;
- iluminação cinematográfica;
- visual limpo, nobre e bem acabado;
- sem excesso de elementos;
- sem aparência infantil;
- sem pessoas;
- sem cartões, papeizinhos, bloquinhos ou elementos soltos bagunçados.

COMPOSIÇÃO:
- deixe espaço visual organizado no topo e no centro para o app aplicar título e subtítulo;
- a Bíblia aberta deve ficar como elemento principal;
- o fundo deve ser rico, mas não poluído;
- a capa deve parecer uma arte premium de revista cristã real.

Formato vertical 2:3.
Sem texto.
Sem letras legíveis.
Sem marca d'água.
Sem logotipo.
`.trim();
}

function reforcarPromptSemTexto(promptOriginal) {
  return `
${promptOriginal}

REFORÇO OBRIGATÓRIO PARA A GERAÇÃO:
- Gere somente a arte/fundo visual da capa.
- Não escreva nenhum texto na imagem.
- Não coloque título.
- Não coloque subtítulo.
- Não coloque letras legíveis.
- Não coloque nome de autor.
- Não coloque nome de ministério.
- Não coloque logotipo.
- Não coloque marca d'água.
- Não coloque selo com texto.
- Não coloque assinatura.
- A arte precisa ter espaço limpo para o aplicativo colocar os textos por cima.
- Visual profissional, premium, editorial, reverente e adequado para revista cristã impressa.
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

  const m = String(model || "").toLowerCase();

  const body = {
    model,
    prompt,
    size: size || "1024x1536",
    n: 1
  };

  /*
    gpt-image-1 aceita quality: low, medium, high em muitas contas.
    dall-e-3 usa standard/hd.
    Se a conta/modelo não aceitar quality, o código tenta de novo sem quality.
  */
  if (m.includes("dall-e-3")) {
    body.quality = "standard";
  } else {
    body.quality = "medium";
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

    if (msg.toLowerCase().includes("quality") || msg.toLowerCase().includes("unsupported")) {
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
    texto.includes("unauthorized") ||
    texto.includes("permission")
  ) {
    return "A chave da API de imagem está inválida, sem permissão ou não foi configurada corretamente na Vercel. Confira GEMINI_API_KEY e OPENAI_API_KEY.";
  }

  if (
    texto.includes("model") &&
    (
      texto.includes("not found") ||
      texto.includes("does not exist") ||
      texto.includes("not supported") ||
      texto.includes("unsupported")
    )
  ) {
    return "Um dos modelos de imagem configurados não está disponível na sua conta. Verifique GEMINI_IMAGE_MODEL_1 ou OPENAI_IMAGE_MODEL_1 na Vercel.";
  }

  if (texto.includes("safety") || texto.includes("policy")) {
    return "A API bloqueou a geração da imagem por política de segurança. Tente um tema visual mais simples e menos sensível.";
  }

  return String(msg || "Erro ao gerar imagem da capa.");
}
