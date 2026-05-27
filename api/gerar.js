export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Método não permitido. Use POST."
    });
  }

  try {
    const body = req.body || {};

    const geminiApiKey = process.env.GEMINI_API_KEY || "";
    const openaiApiKey = process.env.OPENAI_API_KEY || "";

    if (!geminiApiKey && !openaiApiKey) {
      return res.status(500).json({
        ok: false,
        error: "Nenhuma chave de IA foi configurada. Configure GEMINI_API_KEY ou OPENAI_API_KEY na Vercel."
      });
    }

    /*
      =====================================================
      MODO NOVO — COMPATÍVEL COM INDEX v10.4
      =====================================================
      O index.html v10.4 envia:
      {
        prompt: "...",
        etapa: "...",
        tipo: "revista",
        formato: "html"
      }

      Neste modo, a API NÃO força JSON.
      Ela envia o prompt direto para Gemini/OpenAI
      e devolve texto/HTML para o frontend.
    */

    const promptDireto = String(body.prompt || body.comando || body.texto || "").trim();

    if (promptDireto) {
      const etapa = String(body.etapa || "Geração de conteúdo").trim();
      const tipo = String(body.tipo || body.materialType || body.tipoMaterial || "material").trim();
      const formato = String(body.formato || "html").trim();

      const respostaIA = await gerarComFallbackTextoLivre({
        prompt: montarPromptTextoLivre({
          prompt: promptDireto,
          etapa,
          tipo,
          formato
        }),
        geminiApiKey,
        openaiApiKey
      });

      return res.status(200).json({
        ok: true,
        provider: respostaIA.provider,
        text: respostaIA.text,
        html: respostaIA.text,
        content: respostaIA.text,
        output: respostaIA.text,
        resultado: respostaIA.text
      });
    }

    /*
      =====================================================
      MODO ANTIGO — COMPATIBILIDADE
      =====================================================
      Mantém suporte para chamadas antigas que esperavam JSON.
    */

    const form = normalizarFormulario(body);
    const adminCodeServer = process.env.Isiquel_Admin || "00";

    const tiposReservados = ["ebook", "livro", "curso", "revista"];

    if (tiposReservados.includes(form.materialType)) {
      if (!form.adminCode || form.adminCode !== adminCodeServer) {
        return res.status(401).json({
          ok: false,
          error: "Código de acesso inválido para este material reservado."
        });
      }
    }

    const prompt = criarPrompt(form);

    const respostaIA = await gerarComFallbackJSON({
      prompt,
      geminiApiKey,
      openaiApiKey
    });

    const material = extrairJSON(respostaIA.text);

    return res.status(200).json({
      ok: true,
      provider: respostaIA.provider,
      material,
      text: respostaIA.text,
      content: respostaIA.text,
      output: respostaIA.text,
      resultado: respostaIA.text
    });

  } catch (erro) {
    return res.status(500).json({
      ok: false,
      error: limparMensagemErro(erro?.message || "Erro interno ao gerar material."),
      detalhe: String(erro?.message || "")
    });
  }
}

/* =========================================================
   MODO TEXTO LIVRE / HTML — USADO PELA v10.4
========================================================= */

function montarPromptTextoLivre({ prompt, etapa, tipo, formato }) {
  return `
Você é um pastor, teólogo, escritor cristão, comentarista bíblico e editor de materiais cristãos.

ETAPA:
${etapa}

TIPO DE MATERIAL:
${tipo}

FORMATO DE RESPOSTA:
${formato}

INSTRUÇÕES IMPORTANTES:
- Responda somente com o conteúdo solicitado pelo usuário.
- Não responda em JSON.
- Não use markdown.
- Não use crases.
- Se o pedido solicitar HTML, entregue apenas HTML interno.
- Não inclua <html>, <head> nem <body>.
- Não explique o que você fez.
- Não mencione inteligência artificial.
- Escreva em português do Brasil.
- Use linguagem bíblica, pastoral, pentecostal, didática, reverente e madura.
- Não use conteúdo raso.
- Não repita frases vazias.
- Não use frases genéricas como “a Palavra de Deus orienta a compreensão do tema”.
- Desenvolva o assunto de forma específica conforme o tema, a lição, o tópico e o subtópico.
- Quando for Revista do Aluno, não use linguagem de professor.
- Não escreva “o professor deve”, “conduza a classe”, “explique aos alunos”, “o aluno é levado”, “ajuda o aluno”, “função pedagógica” ou “este tópico aprofunda”.
- Use expressões como “o cristão”, “a igreja”, “o servo de Deus”, “somos chamados”, “nós aprendemos” e “a Palavra de Deus nos ensina”.

PEDIDO DO USUÁRIO:
${prompt}
  `.trim();
}

async function gerarComFallbackTextoLivre({ prompt, geminiApiKey, openaiApiKey }) {
  const erros = [];

  if (geminiApiKey) {
    const modelosGemini = limparLista([
      process.env.GEMINI_TEXT_MODEL_1 || "gemini-2.5-flash-lite",
      process.env.GEMINI_TEXT_MODEL_2 || "gemini-2.5-flash",
      process.env.GEMINI_TEXT_MODEL_3 || "gemini-2.0-flash"
    ]);

    for (const modelo of modelosGemini) {
      try {
        const text = await callGeminiTextLivre(geminiApiKey, modelo, prompt);

        if (text && text.trim()) {
          return {
            provider: `gemini:${modelo}`,
            text: limparRespostaTexto(text)
          };
        }
      } catch (erro) {
        erros.push(`Gemini ${modelo}: ${erro?.message || "erro desconhecido"}`);

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

    for (const modelo of modelosOpenAI) {
      try {
        const text = await callOpenAITextLivre(openaiApiKey, modelo, prompt);

        if (text && text.trim()) {
          return {
            provider: `openai:${modelo}`,
            text: limparRespostaTexto(text)
          };
        }
      } catch (erro) {
        erros.push(`OpenAI ${modelo}: ${erro?.message || "erro desconhecido"}`);

        if (ehErroDeCota(erro?.message)) {
          break;
        }
      }
    }
  }

  throw new Error(erros.join(" | ") || "Nenhuma IA conseguiu gerar o conteúdo.");
}

async function callGeminiTextLivre(apiKey, model, prompt) {
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
      temperature: 0.72,
      topP: 0.9,
      maxOutputTokens: 12000
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
    throw new Error(data?.error?.message || `Erro ao chamar Gemini ${model}.`);
  }

  const text =
    data?.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("\n")
      .trim() || "";

  if (!text) {
    throw new Error(`Gemini ${model} não retornou texto.`);
  }

  return text;
}

async function callOpenAITextLivre(apiKey, model, prompt) {
  const url = "https://api.openai.com/v1/chat/completions";

  const body = {
    model,
    messages: [
      {
        role: "system",
        content: "Você é um pastor, teólogo, escritor cristão e editor de materiais bíblicos. Responda somente com o conteúdo solicitado, sem JSON, sem markdown e sem explicações extras."
      },
      {
        role: "user",
        content: prompt
      }
    ],
    temperature: 0.72,
    max_tokens: 12000
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
    throw new Error(data?.error?.message || `Erro ao chamar OpenAI ${model}.`);
  }

  const text = data?.choices?.[0]?.message?.content?.trim() || "";

  if (!text) {
    throw new Error(`OpenAI ${model} não retornou texto.`);
  }

  return text;
}

function limparRespostaTexto(texto) {
  return String(texto || "")
    .replace(/^```html\s*/i, "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

/* =========================================================
   MODO JSON ANTIGO
========================================================= */

function normalizarFormulario(body) {
  const materialType = String(
    body.materialType ||
    body.tipoMaterial ||
    "sermao"
  ).trim().toLowerCase();

  const lessonTitles = Array.isArray(body.lessonTitles) ? body.lessonTitles : [];
  const chapterPlan = Array.isArray(body.chapterPlan) ? body.chapterPlan : [];

  return {
    adminCode: String(body.adminCode || body.codigoAcesso || "").trim(),

    materialType,

    revistaPart: String(body.revistaPart || "").trim(),
    livroPart: String(body.livroPart || "").trim(),

    lessonNumber: Number(body.lessonNumber || 1),
    chapterNumber: Number(body.chapterNumber || 1),

    lessonTitles,
    chapterPlan,

    presentationToTeacher: String(body.presentationToTeacher || "").trim(),
    magazineOverview: String(body.magazineOverview || "").trim(),
    generalTeacherGuidance: String(body.generalTeacherGuidance || "").trim(),

    bookCentralThesis: String(body.bookCentralThesis || "").trim(),
    readingPath: String(body.readingPath || "").trim(),
    previousChapterSummary: String(body.previousChapterSummary || "").trim(),

    instrucoesExtras: String(body.instrucoesExtras || "").trim(),

    revistaVersion: String(body.revistaVersion || body.versaoRevista || "professor").trim(),
    bibleVersion: String(body.bibleVersion || body.traducao || "King James Fiel 1611").trim(),

    sermonPoints: Number(body.sermonPoints || 3),

    title: String(body.title || body.titulo || "").trim(),
    subtitle: String(body.subtitle || body.subtitulo || "").trim(),

    theme: String(
      body.theme ||
      body.tema ||
      body.temaPrincipal ||
      ""
    ).trim(),

    biblicalBase: String(
      body.biblicalBase ||
      body.textoBase ||
      body.textoBiblicoBase ||
      ""
    ).trim(),

    quantity: Number(body.quantity || body.quantidadeLicoes || 4),

    targetAudience: String(
      body.targetAudience ||
      body.publicoAlvo ||
      ""
    ).trim(),

    author: String(
      body.author ||
      body.autor ||
      body.comentarista ||
      ""
    ).trim(),

    ministry: String(
      body.ministry ||
      body.editora ||
      body.ministerio ||
      ""
    ).trim(),

    depthLevel: String(
      body.depthLevel ||
      body.profundidade ||
      "profundo"
    ).trim(),

    visualStyle: String(
      body.visualStyle ||
      body.estiloVisual ||
      "preto e branco"
    ).trim(),

    coverMode: String(
      body.coverMode ||
      body.capa ||
      "sem-capa"
    ).trim(),

    tone: String(
      body.tone ||
      body.tomMaterial ||
      "bíblico, pastoral, profundo, didático, reverente e edificante"
    ).trim()
  };
}

async function gerarComFallbackJSON({ prompt, geminiApiKey, openaiApiKey }) {
  const erros = [];

  if (geminiApiKey) {
    const modelosGemini = limparLista([
      process.env.GEMINI_TEXT_MODEL_1 || "gemini-2.5-flash-lite",
      process.env.GEMINI_TEXT_MODEL_2 || "gemini-2.5-flash",
      process.env.GEMINI_TEXT_MODEL_3 || "gemini-2.0-flash"
    ]);

    for (const modelo of modelosGemini) {
      try {
        const text = await callGeminiTextJSON(geminiApiKey, modelo, prompt);

        if (text && text.trim()) {
          return {
            provider: `gemini:${modelo}`,
            text
          };
        }
      } catch (erro) {
        erros.push(`Gemini ${modelo}: ${erro?.message || "erro desconhecido"}`);
      }
    }
  }

  if (openaiApiKey) {
    const modelosOpenAI = limparLista([
      process.env.OPENAI_TEXT_MODEL_1 || "gpt-4.1-mini",
      process.env.OPENAI_TEXT_MODEL_2 || "gpt-4.1",
      process.env.OPENAI_TEXT_MODEL_3 || "gpt-4.1-nano"
    ]);

    for (const modelo of modelosOpenAI) {
      try {
        const text = await callOpenAITextJSON(openaiApiKey, modelo, prompt);

        if (text && text.trim()) {
          return {
            provider: `openai:${modelo}`,
            text
          };
        }
      } catch (erro) {
        erros.push(`OpenAI ${modelo}: ${erro?.message || "erro desconhecido"}`);
      }
    }
  }

  throw new Error(erros.join(" | ") || "Nenhuma IA conseguiu gerar o conteúdo.");
}

function limparLista(lista) {
  return [...new Set(lista.filter(Boolean).map(x => String(x).trim()).filter(Boolean))];
}

function criarPrompt(form) {
  if (form.materialType === "revista") return promptRevistaCompleta(form);
  if (form.materialType === "livro") return promptLivro(form);
  if (form.materialType === "sermao") return promptSermao(form);
  if (form.materialType === "devocional") return promptDevocional(form);
  if (form.materialType === "estudo") return promptEstudo(form);
  if (form.materialType === "ebook") return promptEbook(form);
  if (form.materialType === "curso") return promptCurso(form);

  return promptEstudo(form);
}

function promptBase(form) {
  return `
Você é um pastor, teólogo, escritor cristão, comentarista bíblico, professor de Escola Bíblica Dominical e editor de materiais cristãos.

RESPONDA SOMENTE EM JSON VÁLIDO.
NÃO use markdown.
NÃO use crases.
NÃO escreva comentários fora do JSON.
NÃO escreva texto antes nem depois do JSON.

Dados do material:
Título: ${form.title}
Subtítulo: ${form.subtitle}
Tema: ${form.theme}
Texto bíblico base: ${form.biblicalBase}
Público-alvo: ${form.targetAudience}
Autor/comentarista: ${form.author}
Editora/ministério: ${form.ministry}
Profundidade: ${form.depthLevel}
Tom: ${form.tone}
Tradução bíblica padrão: ${form.bibleVersion}

Regras gerais:
- Escreva em português do Brasil.
- Use linguagem bíblica, pastoral, didática, reverente e adulta.
- Siga uma linha pentecostal clássica quando o assunto permitir.
- Não produza conteúdo raso.
- Não repita frases vazias.
- Não mencione inteligência artificial.
- Não invente dados históricos inseguros.
- Explique os textos bíblicos usados.
- Use fidelidade bíblica e doutrinária.
`.trim();
}

function promptRevistaCompleta(form) {
  return `
${promptBase(form)}

Crie uma revista mensal de Escola Bíblica Dominical com exatamente 4 lições.

Retorne JSON:

{
  "type": "revista",
  "title": "",
  "subtitle": "",
  "author": "",
  "ministry": "",
  "presentation": "",
  "lessonTitles": ["", "", "", ""],
  "lessons": []
}
`;
}

function promptSermao(form) {
  return `
${promptBase(form)}

Crie um sermão completo com introdução, ${form.sermonPoints} tópicos, aplicação, conclusão e oração.

Retorne JSON:

{
  "type": "sermao",
  "title": "",
  "subtitle": "",
  "biblicalBase": "",
  "introduction": "",
  "topics": [
    {
      "number": 1,
      "title": "",
      "reference": "",
      "text": ""
    }
  ],
  "application": "",
  "conclusion": "",
  "prayer": ""
}
`;
}

function promptDevocional(form) {
  return `
${promptBase(form)}

Crie um devocional cristão.

Retorne JSON:

{
  "type": "devocional",
  "title": "",
  "subtitle": "",
  "biblicalBase": "",
  "reflection": "",
  "application": "",
  "prayer": ""
}
`;
}

function promptEstudo(form) {
  return `
${promptBase(form)}

Crie um estudo bíblico/teológico profundo.

Retorne JSON:

{
  "type": "estudo",
  "title": "",
  "subtitle": "",
  "biblicalBase": "",
  "introduction": "",
  "topics": [
    {
      "number": 1,
      "title": "",
      "reference": "",
      "text": ""
    }
  ],
  "application": "",
  "conclusion": ""
}
`;
}

function promptEbook(form) {
  return `
${promptBase(form)}

Crie um e-book cristão com ${form.quantity} capítulos.

Retorne JSON:

{
  "type": "ebook",
  "title": "",
  "subtitle": "",
  "introduction": "",
  "chapters": [
    {
      "number": 1,
      "title": "",
      "text": ""
    }
  ],
  "conclusion": ""
}
`;
}

function promptCurso(form) {
  return `
${promptBase(form)}

Crie um curso cristão com ${form.quantity} aulas.

Retorne JSON:

{
  "type": "curso",
  "title": "",
  "subtitle": "",
  "introduction": "",
  "lessons": [
    {
      "number": 1,
      "title": "",
      "objective": "",
      "content": "",
      "activity": "",
      "application": ""
    }
  ],
  "conclusion": ""
}
`;
}

function promptLivro(form) {
  return `
${promptBase(form)}

Crie um livro cristão com ${form.quantity || 10} capítulos.

Retorne JSON:

{
  "type": "livro",
  "title": "",
  "subtitle": "",
  "author": "",
  "ministry": "",
  "presentation": "",
  "chapters": [
    {
      "number": 1,
      "title": "",
      "text": ""
    }
  ],
  "finalConclusion": "",
  "backCoverText": ""
}
`;
}

async function callGeminiTextJSON(apiKey, model, prompt) {
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
      temperature: 0.65,
      topP: 0.9,
      maxOutputTokens: 12000,
      responseMimeType: "application/json"
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
    throw new Error(data?.error?.message || `Erro ao chamar Gemini ${model}.`);
  }

  const text =
    data?.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim() || "";

  if (!text) {
    throw new Error(`Gemini ${model} não retornou texto.`);
  }

  return text;
}

async function callOpenAITextJSON(apiKey, model, prompt) {
  const url = "https://api.openai.com/v1/chat/completions";

  const body = {
    model,
    messages: [
      {
        role: "system",
        content: "Você é um pastor, teólogo, escritor cristão e editor de materiais bíblicos. Responda somente em JSON válido."
      },
      {
        role: "user",
        content: prompt
      }
    ],
    temperature: 0.65,
    max_tokens: 12000,
    response_format: {
      type: "json_object"
    }
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
    throw new Error(data?.error?.message || `Erro ao chamar OpenAI ${model}.`);
  }

  const text = data?.choices?.[0]?.message?.content?.trim() || "";

  if (!text) {
    throw new Error(`OpenAI ${model} não retornou texto.`);
  }

  return text;
}

function extrairJSON(texto) {
  if (!texto || typeof texto !== "string") {
    throw new Error("A IA não retornou texto para converter em JSON.");
  }

  let limpo = texto.trim();

  limpo = limpo
    .replace(/^```json/i, "")
    .replace(/^```/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(limpo);
  } catch (erroInicial) {
    const primeiro = limpo.indexOf("{");
    const ultimo = limpo.lastIndexOf("}");

    if (primeiro !== -1 && ultimo !== -1 && ultimo > primeiro) {
      const recorte = limpo.slice(primeiro, ultimo + 1);

      try {
        return JSON.parse(recorte);
      } catch (erroRecorte) {
        throw new Error("A IA respondeu, mas o JSON veio quebrado. Tente gerar novamente.");
      }
    }

    throw new Error("A IA não retornou JSON válido. Tente novamente.");
  }
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
    return "A cota da IA acabou ou a API está sem crédito disponível. O sistema tentou Gemini e OpenAI/GPT, mas não conseguiu gerar agora.";
  }

  if (
    texto.includes("api key") ||
    texto.includes("apikey") ||
    texto.includes("invalid key") ||
    texto.includes("unauthorized")
  ) {
    return "A chave da API está inválida ou não foi configurada corretamente na Vercel. Confira GEMINI_API_KEY e OPENAI_API_KEY.";
  }

  if (
    texto.includes("maximum context") ||
    texto.includes("max_tokens") ||
    texto.includes("token") ||
    texto.includes("json veio quebrado")
  ) {
    return "A resposta ficou grande demais ou foi cortada pela IA. Tente gerar novamente.";
  }

  if (texto.includes("json")) {
    return "A IA respondeu fora do formato esperado. Tente gerar novamente.";
  }

  if (texto.includes("model") && texto.includes("not found")) {
    return "Um dos modelos configurados não está disponível na sua conta. Verifique os nomes dos modelos nas variáveis da Vercel.";
  }

  return String(msg || "Erro ao gerar material.");
}
