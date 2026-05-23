export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

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
        error: "A chave GEMINI_API_KEY não está configurada na Vercel."
      });
    }

    const body = req.body || {};
    const prompt = criarPrompt(body);

    const models = [
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
      "gemini-1.5-pro",
      "gemini-1.5-flash"
    ];

    let ultimoErro = "Erro desconhecido.";

    for (const model of models) {
      try {
        const result = await chamarGemini({ apiKey, model, prompt });

        const texto = extrairTexto(result);
        const json = limparJson(texto);
        const document = JSON.parse(json);

        return res.status(200).json({
          ok: true,
          modelUsed: model,
          document
        });
      } catch (err) {
        ultimoErro = err.message || "Falha ao usar o modelo " + model;
        console.error("Erro com modelo", model, err.message);
        continue;
      }
    }

    return res.status(500).json({
      ok: false,
      error: ultimoErro
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      ok: false,
      error: err.message || "Erro interno no servidor."
    });
  }
}

async function chamarGemini({ apiKey, model, prompt }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const payload = {
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.7,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 65535
    }
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (!response.ok) {
    const msg = data?.error?.message || "Erro ao chamar o Gemini.";
    throw new Error(msg);
  }

  return data;
}

function extrairTexto(data) {
  const text = data?.candidates?.[0]?.content?.parts
    ?.map(p => p.text || "")
    .join("")
    .trim();

  if (!text) {
    throw new Error("O Gemini não retornou conteúdo de texto.");
  }

  return text;
}

function limparJson(texto) {
  return String(texto)
    .replace(/^```json/i, "")
    .replace(/^```/i, "")
    .replace(/```$/i, "")
    .trim();
}

function tipoBonito(tipo) {
  const map = {
    ebook: "E-book cristão",
    revista_ebd_professor: "Revista de EBD para professor",
    revista_ebd_aluno: "Revista de EBD para aluno",
    devocional: "Devocional",
    estudo_biblico: "Estudo bíblico",
    curso_teologico: "Curso / estudo teológico",
    apostila: "Apostila",
    livro_cristao: "Livro cristão",
    sermao: "Sermão"
  };
  return map[tipo] || tipo;
}

function definirTomPorTipo(tipo) {
  switch (tipo) {
    case "devocional":
      return "tom devocional, edificante, íntimo, pastoral e profundo";
    case "sermao":
      return "tom de sermão, com introdução, desenvolvimento, aplicações e conclusão";
    case "estudo_biblico":
      return "tom de estudo bíblico, explicativo, doutrinário, prático e organizado";
    case "curso_teologico":
      return "tom de curso teológico, bem estruturado, sequencial, profundo e didático";
    case "revista_ebd_professor":
      return "tom de revista de EBD para professor, com base bíblica, explicação, aplicação, perguntas e respostas";
    case "revista_ebd_aluno":
      return "tom de revista de EBD para aluno, com clareza, organização e linguagem edificante";
    case "apostila":
      return "tom de apostila cristã, organizado, didático e bem dividido";
    case "livro_cristao":
      return "tom de livro cristão, profundo, envolvente, expandido e maduro";
    case "ebook":
    default:
      return "tom de e-book cristão profissional, bonito, profundo, didático, devocional e edificante";
  }
}

function tamanhoDesenvolvimento(tamanho, profundidade) {
  if (tamanho === "muito_grande" || profundidade === "muito_alta") {
    return "Cada capítulo deve ser bem expandido, com várias explicações, bons parágrafos e conteúdo substancial.";
  }
  if (tamanho === "grande" || profundidade === "alta") {
    return "Cada capítulo deve ser desenvolvido com boa profundidade, explicação consistente e aplicação prática.";
  }
  return "Cada capítulo deve ter desenvolvimento claro e equilibrado.";
}

function criarPrompt(dados) {
  const {
    appNome = "VERBO IA",
    tipo = "ebook",
    titulo = "",
    tema = "",
    textoBase = "",
    publico = "",
    linguagem = "",
    quantidade = 7,
    perguntas = 3,
    profundidade = "muito_alta",
    capa = "sim",
    visual = "colorido",
    tamanho = "grande",
    autor = "",
    ministerio = "",
    instrucoes = ""
  } = dados;

  const tipoLabel = tipoBonito(tipo);
  const tom = definirTomPorTipo(tipo);
  const profundidadeTexto = tamanhoDesenvolvimento(tamanho, profundidade);

  return `
Você é um criador profissional de materiais cristãos e deve responder APENAS com JSON válido.
NÃO escreva markdown.
NÃO use crases.
NÃO coloque explicações fora do JSON.
NÃO inclua texto introdutório.
NÃO repita blocos genéricos como "Nova seção do material".
NÃO repita o nome do autor ou do ministério em todos os capítulos.
NÃO coloque placeholders.
NÃO gere sumário confuso.
Numere os capítulos em ordem correta, sem pular.
Se a quantidade pedida for ${quantidade}, gere exatamente ${quantidade} capítulos.

APP:
${appNome}

TIPO DE MATERIAL:
${tipoLabel}

OBJETIVO:
Gerar um material cristão com visual e estrutura profissional, pronto para PDF, bem organizado, bonito, profundo e coerente com o tipo de material solicitado.

ESTILO GERAL:
- ${tom}
- ${profundidadeTexto}
- Linguagem: ${linguagem}
- Público-alvo: ${publico}
- Estilo visual: ${visual === "pb" ? "preto e branco elegante" : "colorido, bonito e profissional"}
- ${capa === "sim" ? "Deve incluir capa." : "Não precisa incluir capa visual."}

REQUISITOS IMPORTANTES:
1. O material precisa ficar bem profissional.
2. A capa precisa ser forte, bonita e com aparência de e-book ou material premium.
3. O sumário deve ficar limpo e organizado.
4. Os capítulos precisam ter sequência correta: 1, 2, 3, 4...
5. Não repetir frases decorativas desnecessárias.
6. Não repetir "nova seção" ou elementos irritantes.
7. O conteúdo precisa ser profundo e expandido, não superficial.
8. Cada capítulo deve ter conteúdo rico, bíblico e prático.
9. Em vez de repetir nomes, use o autor e o ministério principalmente na capa e na ficha final.
10. As seções internas devem ter títulos coerentes, variados e úteis.
11. Para e-book, livro, apostila, estudo ou curso, o conteúdo deve parecer realmente material para venda, ensino ou envio em PDF.
12. Gere também sugestões de ilustração temática dentro de cada capítulo, mas de forma objetiva, sem virar repetição.

DADOS DO MATERIAL:
- Título: ${titulo}
- Tema principal: ${tema}
- Texto bíblico base: ${textoBase}
- Autor / Comentarista: ${autor}
- Editora / Ministério: ${ministerio}
- Quantidade de capítulos/lições/dias/aulas: ${quantidade}
- Perguntas por capítulo: ${perguntas}
- Instruções adicionais do usuário: ${instrucoes || "Nenhuma instrução adicional."}

ESTRUTURA OBRIGATÓRIA DO JSON:
{
  "includeCover": true,
  "documentTypeLabel": "string",
  "documentTitle": "string",
  "theme": "string",
  "textoBase": "string",
  "audience": "string",
  "language": "string",
  "author": "string",
  "ministry": "string",
  "presentation": "string",
  "cover": {
    "subtitle": "string",
    "closingSeal": "string"
  },
  "summary": ["item 1", "item 2"],
  "chapters": [
    {
      "number": 1,
      "title": "string",
      "openingText": "string",
      "centralTruth": "string",
      "sections": [
        {
          "heading": "string",
          "content": "string",
          "scriptures": ["string", "string"],
          "visualCue": "string"
        }
      ],
      "highlightQuote": "string",
      "reflectionExercise": "string",
      "prayer": "string",
      "questions": [
        {
          "question": "string",
          "answer": "string"
        }
      ]
    }
  ],
  "closingText": "string"
}

REGRAS PARA O CONTEÚDO DOS CAPÍTULOS:
- Cada capítulo deve ter título próprio e coerente.
- "openingText" deve ser uma boa abertura do capítulo.
- "centralTruth" deve ser forte e objetiva.
- Cada capítulo deve ter entre 3 e 5 seções bem desenvolvidas.
- "content" deve ter explicação realmente ampla, bem escrita e profunda.
- "scriptures" deve trazer referências bíblicas ligadas à seção.
- "visualCue" deve ser uma frase curta descrevendo a ideia de uma ilustração temática daquele bloco.
- "highlightQuote" deve ser uma frase forte e memorável.
- "reflectionExercise" deve ser útil, específico e prático.
- "prayer" deve ser pastoral, bem escrita e não genérica.
- Gere exatamente ${perguntas} perguntas em cada capítulo, com respostas.
- Não use conteúdo raso.
- Se o tipo for e-book, livro, apostila, curso ou estudo, trate como material mais extenso.
- Não escreva coisas como "continua", "nova sessão", "placeholder" ou marcações de teste.

RETORNE SOMENTE O JSON.
`.trim();
}
