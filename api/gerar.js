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
    const form = normalizeForm(body);

    if (isMaterialReservado(form.materialType) && !codigoAdminValido(form.adminCode)) {
      return res.status(403).json({
        ok: false,
        error: "Este recurso é reservado. Digite o código de acesso correto."
      });
    }

    const models = [
      process.env.GEMINI_TEXT_MODEL_1 || "gemini-3.5-flash",
      process.env.GEMINI_TEXT_MODEL_2 || "gemini-3.1-flash-lite",
      process.env.GEMINI_TEXT_MODEL_3 || "gemini-2.5-flash",
      process.env.GEMINI_TEXT_MODEL_4 || "gemini-2.5-flash-lite",
      "gemini-2.0-flash"
    ].filter(Boolean);

    const prompt = buildPrompt(form);
    const result = await callGeminiText(apiKey, models, prompt);
    const text = extractText(result.data);
    let material = parseJson(text);

    if (!material && form.materialType === "revista" && form.revistaPart === "lesson") {
      const compactPrompt = promptRevistaLicao(form, true);
      const compactResult = await callGeminiText(apiKey, models, compactPrompt);
      const compactText = extractText(compactResult.data);
      material = parseJson(compactText);
    }

    if (!material && form.materialType === "livro" && form.livroPart === "chapter") {
      const compactPrompt = promptLivroCapitulo(form, true);
      const compactResult = await callGeminiText(apiKey, models, compactPrompt);
      const compactText = extractText(compactResult.data);
      material = parseJson(compactText);
    }

    if (!material) {
      return res.status(500).json({
        ok: false,
        error: "A IA respondeu, mas não entregou um JSON válido. Tente novamente em alguns segundos."
      });
    }

    material.appName = "VERBO IA";
    material.selectedType = form.materialType;
    material.revistaVersion = form.revistaVersion;
    material.bibleVersion = form.bibleVersion;
    material.author = material.author || form.author;
    material.ministry = material.ministry || form.ministry;
    material.visualStyle = form.visualStyle;

    return res.status(200).json({
      ok: true,
      modelUsed: result.modelUsed,
      material
    });

  } catch (error) {
    console.error("Erro em api/gerar.js:", error);

    return res.status(500).json({
      ok: false,
      error: error.message || "Erro interno ao gerar o material."
    });
  }
};

function codigoAdminValido(codigoRecebido) {
  const codigoCorreto = process.env.Isiquel_Admin || "00";
  return String(codigoRecebido || "").trim() === String(codigoCorreto).trim();
}

function isMaterialReservado(tipo) {
  return ["ebook", "livro", "curso", "revista"].includes(String(tipo || "").trim());
}

function normalizeForm(body) {
  const tipo = String(body.materialType || "sermao").trim();
  const revistaPart = String(body.revistaPart || "").trim();
  const livroPart = String(body.livroPart || "").trim();
  const lessonNumber = Number(body.lessonNumber || 1);
  const chapterNumber = Number(body.chapterNumber || 1);

  let quantidade = Number(body.quantity || 3);
  let sermonPoints = Number(body.sermonPoints || 3);

  if (!Number.isFinite(quantidade)) quantidade = 3;
  if (!Number.isFinite(sermonPoints)) sermonPoints = 3;

  sermonPoints = Math.max(3, Math.min(sermonPoints, 5));

  if (tipo === "sermao") {
    quantidade = 1;
  } else if (tipo === "revista") {
    quantidade = 4;
  } else if (tipo === "devocional") {
    quantidade = Math.max(1, Math.min(quantidade, 30));
  } else if (tipo === "livro") {
    quantidade = Math.max(1, Math.min(quantidade, 20));
  } else {
    quantidade = Math.max(1, Math.min(quantidade, 12));
  }

  return {
    adminCode: String(body.adminCode || "").trim(),
    appName: "VERBO IA",
    materialType: tipo,
    revistaPart,
    livroPart,
    lessonNumber,
    chapterNumber,
    lessonTitles: body.lessonTitles || [],
    chapterPlan: body.chapterPlan || [],
    previousChapterSummary: String(body.previousChapterSummary || "").trim(),
    bookCentralThesis: String(body.bookCentralThesis || "").trim(),
    readingPath: String(body.readingPath || "").trim(),
    revistaVersion: String(body.revistaVersion || "professor").trim(),
    bibleVersion: String(body.bibleVersion || "King James Fiel 1611").trim(),
    sermonPoints,
    title: String(body.title || "Material cristão").trim(),
    subtitle: String(body.subtitle || "").trim(),
    theme: String(body.theme || "").trim(),
    biblicalBase: String(body.biblicalBase || "").trim(),
    quantity: quantidade,
    targetAudience: String(body.targetAudience || "Igreja em geral").trim(),
    author: String(body.author || "Pr. Isiquel Rodrigues").trim(),
    ministry: String(body.ministry || "CPID - Casa Publicadora da Igreja de Deus").trim(),
    depthLevel: String(body.depthLevel || "muito profundo").trim(),
    visualStyle: String(body.visualStyle || "preto e branco").trim(),
    tone: String(body.tone || "pastoral, bíblico, profundo e encorajador").trim()
  };
}

function buildPrompt(form) {
  if (form.materialType === "revista" && form.revistaPart === "cover") return promptRevistaCapa(form);
  if (form.materialType === "revista" && form.revistaPart === "meta") return promptRevistaMeta(form);
  if (form.materialType === "revista" && form.revistaPart === "lesson") return promptRevistaLicao(form, false);

  if (form.materialType === "livro" && form.livroPart === "meta") return promptLivroMeta(form);
  if (form.materialType === "livro" && form.livroPart === "chapter") return promptLivroCapitulo(form, false);

  if (form.materialType === "sermao") return promptSermao(form);
  if (form.materialType === "livro") return promptLivroMeta(form);
  if (form.materialType === "devocional") return promptDevocional(form);
  if (form.materialType === "estudo") return promptEstudo(form);
  if (form.materialType === "curso") return promptCurso(form);
  if (form.materialType === "revista") return promptRevistaMeta(form);
  return promptEbook(form);
}

function baseDados(form, nome) {
  return `
DADOS DO MATERIAL:
Tipo: ${nome}
Título: ${form.title}
Subtítulo: ${form.subtitle || "Crie se for necessário"}
Tema: ${form.theme || form.title}
Texto bíblico base: ${form.biblicalBase || "Escolha textos bíblicos coerentes"}
Quantidade: ${form.quantity}
Versão da revista: ${form.revistaVersion}
Tradução bíblica padrão: ${form.bibleVersion}
Público-alvo: ${form.targetAudience}
Autor: ${form.author}
Ministério/Editora: ${form.ministry}
Profundidade: ${form.depthLevel}
Tom: ${form.tone}
`.trim();
}

function regrasJson() {
  return `
REGRAS OBRIGATÓRIAS:
1. Responda somente em JSON válido.
2. Não use markdown.
3. Não escreva nada fora do JSON.
4. Não gere HTML.
5. Não gere PDF.
6. Não gere imagem binária.
7. Use português do Brasil.
8. O conteúdo precisa ser bíblico, profundo, pastoral, claro e aplicável.
9. Não use aspas duplas dentro dos textos, a não ser que estejam escapadas corretamente.
10. Evite caracteres que quebrem JSON.
11. Não invente citações literais de autores.
12. Não invente número de página, editora ou frase exata de livro.
13. Quando citar autores, cite apenas como referência de aprofundamento, sem aspas diretas.
14. As referências bíblicas devem ser coerentes com o assunto tratado.
15. Não coloque referências aleatórias. Toda referência precisa apoiar a ideia ensinada.
16. Não entregue conteúdo raso, genérico ou sem desenvolvimento.
17. Não escreva como se estivesse preenchendo formulário.
18. Não use linguagem robótica.
`.trim();
}

function promptRevistaCapa(form) {
  const versaoTexto = form.revistaVersion === "aluno" ? "REVISTA DO ALUNO" : "REVISTA DO PROFESSOR";

  return `
Você é diretor de arte cristão, designer editorial e capista profissional de revistas bíblicas.

Crie o CONCEITO COMPLETO DE CAPA para uma revista mensal de Escola Bíblica Dominical.
A capa será renderizada pelo sistema em formato visual, por isso você deve entregar um projeto de capa em JSON.
Não escreva a revista. Não escreva as lições. Crie apenas a capa.

${baseDados(form, "Capa de revista de Escola Bíblica Dominical")}
${regrasJson()}

VERSÃO DA REVISTA:
${versaoTexto}

OBJETIVO DA CAPA:
Criar uma capa bonita, séria, cristã, editorial, elegante e adequada para revista de EBD.
A capa deve parecer profissional, não infantil, não genérica e não amadora.
A capa deve comunicar visualmente o tema da revista.

REGRAS VISUAIS:
1. A capa deve ter aparência editorial cristã.
2. A imagem central deve representar o tema de modo simbólico e respeitoso.
3. Use símbolos como Bíblia aberta, luz, mesa de estudo, pergaminho, páginas antigas, pena, rolo, manuscritos, igreja, raios de luz, textura de papel antigo, mas sem exagero.
4. Não use cruz de forma excessiva se não for necessária.
5. Não use imagens confusas.
6. Não use excesso de elementos.
7. Priorize leitura clara do título.
8. A capa deve funcionar em celular e em PDF.
9. A capa deve ter uma composição vertical de revista.
10. A capa deve combinar com a identidade CPID e com a seriedade da Escola Bíblica Dominical.

TIPOS DE CAPA POSSÍVEIS:
Escolha a melhor direção para o tema:
- Bíblia aberta iluminada sobre uma mesa de estudo.
- Bíblia com páginas antigas e luz suave.
- Manuscritos antigos em transição para uma Bíblia moderna.
- Rolo antigo, pergaminho e Bíblia atual juntos.
- Estudante cristão olhando para a Bíblia aberta, sem rosto muito detalhado.
- Composição simbólica mostrando Palavra, história e preservação.

ENTREGUE TAMBÉM:
1. Um prompt de imagem profissional para futura geração de imagem.
2. Uma descrição curta para o professor entender a ideia da capa.
3. Uma paleta de cores.
4. Um símbolo principal.
5. Um símbolo secundário.
6. Um fundo.
7. Um estilo editorial.
8. Uma frase de impacto curta para a capa, se fizer sentido.

FORMATO JSON:
{
  "type": "revistaCover",
  "title": "",
  "subtitle": "",
  "editionLabel": "${versaoTexto}",
  "monthlyLabel": "Revista mensal de Escola Bíblica Dominical",
  "author": "",
  "ministry": "",
  "visualConcept": "",
  "coverDescription": "",
  "mainSymbol": "",
  "secondarySymbol": "",
  "backgroundStyle": "",
  "editorialStyle": "",
  "colorPalette": {
    "primary": "",
    "secondary": "",
    "accent": "",
    "background": ""
  },
  "coverPhrase": "",
  "imagePrompt": "",
  "negativePrompt": "",
  "teacherNoteAboutCover": ""
}
`.trim();
}

function promptLivroMeta(form) {
  return `
Você é um escritor cristão experiente, pastor, teólogo, expositor bíblico e autor de livros de formação espiritual.

Crie apenas o PLANO GERAL de um LIVRO CRISTÃO.
Não escreva os capítulos completos agora.
O livro será gerado depois capítulo por capítulo.

${baseDados(form, "Livro cristão - planejamento")}
${regrasJson()}

OBJETIVO:
Criar um plano de livro com unidade, progressão e linha de pensamento.
O livro precisa ter começo, meio e fim.
Cada capítulo precisa nascer do anterior e preparar o próximo.
Não crie capítulos aleatórios.
Não crie uma sequência de estudos independentes.
Não faça parecer revista, apostila, curso ou sermão.

COMO UM LIVRO DEVE FUNCIONAR:
1. O livro precisa ter uma tese central.
2. Cada capítulo deve trabalhar uma parte da tese do autor.
3. Cada capítulo deve avançar o argumento geral.
4. O capítulo 1 deve abrir o problema, a necessidade ou a visão central do livro.
5. Os capítulos do meio devem desenvolver camadas do argumento.
6. O último capítulo deve concluir a jornada do leitor.
7. A progressão deve ser clara: o leitor precisa perceber que está caminhando.
8. O livro deve ensinar e formar o leitor sem parecer roteiro de aula.
9. O livro precisa ser agradável de ler, com linguagem fluida e madura.
10. As referências bíblicas devem aparecer naturalmente dentro dos argumentos dos capítulos, não como listas isoladas.

REGRAS DO PLANO:
1. Crie uma tese central forte para o livro inteiro.
2. Crie um caminho de leitura progressivo.
3. Planeje exatamente ${form.quantity} capítulos.
4. Cada capítulo deve responder uma pergunta importante dentro do tema geral.
5. Cada capítulo deve ter uma ideia central clara.
6. Cada capítulo deve ter relação com o capítulo anterior.
7. O último capítulo deve concluir a caminhada do livro.
8. O plano deve permitir desenvolvimento profundo, bíblico e prazeroso.
9. Não faça títulos soltos.
10. Não crie assuntos desconectados.

FORMATO JSON:
{
  "type": "livro",
  "title": "",
  "subtitle": "",
  "theme": "",
  "targetAudience": "",
  "author": "",
  "ministry": "",
  "preface": "",
  "presentation": "",
  "generalIntroduction": "",
  "bookCentralThesis": "",
  "readingPath": "",
  "chapterPlan": [
    {
      "number": 1,
      "title": "",
      "chapterQuestion": "",
      "centralIdea": "",
      "purpose": "",
      "connectionWithPrevious": "",
      "preparesNext": "",
      "mainBiblicalBase": "",
      "argumentRoleInBook": ""
    }
  ],
  "finalConclusion": "",
  "wordToReader": "",
  "authorBio": "",
  "backCoverText": ""
}
`.trim();
}

function promptLivroCapitulo(form, compacto) {
  const chapterPlanText = JSON.stringify(form.chapterPlan || [], null, 2);
  const capituloAtual = Array.isArray(form.chapterPlan)
    ? form.chapterPlan.find((c) => Number(c.number) === Number(form.chapterNumber))
    : null;

  const capituloPlanejado = capituloAtual ? JSON.stringify(capituloAtual, null, 2) : "Crie conforme o tema geral.";

  const limite = compacto
    ? `
MODO COMPACTO DE SEGURANÇA:
1. opening: 120 a 180 palavras.
2. thesisPresentation: 90 a 140 palavras.
3. developmentBlocks: cada bloco com 180 a 260 palavras.
4. chapterConclusion: 100 a 160 palavras.
5. transitionToNextChapter: 40 a 80 palavras.
`
    : `
REGRAS DE TAMANHO:
1. opening: 180 a 280 palavras.
2. thesisPresentation: 120 a 190 palavras.
3. Cada bloco de developmentBlocks deve ter de 260 a 420 palavras.
4. O capítulo deve conter 4 blocos de desenvolvimento.
5. chapterConclusion: 160 a 240 palavras.
6. transitionToNextChapter: 60 a 100 palavras.
`;

  return `
Você é um escritor cristão experiente, pastor, teólogo, expositor bíblico e autor de livros de formação espiritual.

Crie SOMENTE O CAPÍTULO ${form.chapterNumber} do livro.
Não crie os outros capítulos.
Este livro está sendo gerado por partes para ficar mais profundo e organizado.

${baseDados(form, "Livro cristão - capítulo individual")}
${regrasJson()}

TESE CENTRAL DO LIVRO:
${form.bookCentralThesis || "Siga a tese central do tema informado."}

CAMINHO DE LEITURA DO LIVRO:
${form.readingPath || "Construa uma progressão lógica e espiritual."}

RESUMO DO CAPÍTULO ANTERIOR:
${form.previousChapterSummary || "Este é o primeiro capítulo ou não há resumo anterior."}

PLANO GERAL DOS CAPÍTULOS:
${chapterPlanText}

CAPÍTULO QUE DEVE SER ESCRITO AGORA:
${capituloPlanejado}

MUITO IMPORTANTE SOBRE O FORMATO:
1. Este capítulo precisa parecer capítulo de LIVRO, não apostila.
2. Não escreva com cara de estudo bíblico em tópicos.
3. Não crie seções chamadas "Base bíblica", "Referências cruzadas", "Aplicação pastoral", "Resumo do capítulo" ou "Fechamento reflexivo".
4. Não coloque listas de referências bíblicas separadas.
5. As referências bíblicas devem aparecer naturalmente dentro dos parágrafos.
6. As referências cruzadas devem estar no meio do argumento.
7. Não coloque "Aplicação pastoral" como título.
8. A aplicação deve estar misturada ao desenvolvimento do argumento.
9. O capítulo deve ter leitura fluida, como um livro publicado.
10. Escreva como autor conduzindo o leitor, não como professor preenchendo campos.

IDENTIDADE DO CAPÍTULO:
1. O capítulo precisa trabalhar uma única ideia central.
2. O capítulo precisa começar essa ideia, desenvolver essa ideia e concluir essa ideia.
3. Não mude de assunto sem ligação.
4. Não escreva parágrafos soltos.
5. O leitor precisa sentir que está sendo conduzido por um caminho.
6. O capítulo precisa ter começo, meio e fim.
7. Cada seção deve nascer da anterior.
8. A conclusão precisa retomar a tese inicial do capítulo.
9. Este capítulo deve cumprir seu papel dentro do argumento maior do livro.
10. Se o livro tiver muitos capítulos, este capítulo deve desenvolver apenas a parte que lhe cabe, sem tentar resolver tudo de uma vez.

COMO DESENVOLVER O ARGUMENTO:
1. Comece com uma abertura envolvente, pastoral, literária ou reflexiva.
2. Apresente a tese do capítulo com clareza.
3. Desenvolva a ideia em blocos de pensamento progressivos.
4. Cada bloco precisa aprofundar um aspecto da mesma ideia.
5. Use textos bíblicos dentro da explicação, não como lista isolada.
6. Use referências cruzadas naturalmente dentro do raciocínio.
7. Faça conexões entre Antigo e Novo Testamento quando isso fortalecer o argumento.
8. Mostre o problema humano ou espiritual relacionado à tese.
9. Mostre como a Escritura responde a esse problema.
10. Conduza o leitor até uma conclusão clara.

REGRAS DE ESTILO:
1. Escreva como livro, não como sermão.
2. Escreva como livro, não como revista.
3. Escreva como livro, não como estudo bíblico em tópicos.
4. Evite títulos técnicos demais.
5. Evite linguagem seca.
6. Use transições naturais entre os parágrafos.
7. O texto deve ser prazeroso de ler, mas com peso bíblico.
8. Use linguagem pastoral, madura e fluida.
9. Não repita a mesma ideia apenas com outras palavras.

REGRAS BÍBLICAS:
1. Use a Bíblia como fundamento do argumento.
2. Não coloque referência bíblica apenas enfeitando o texto.
3. Explique o sentido bíblico dentro do desenvolvimento.
4. As referências cruzadas devem estar integradas ao texto.
5. Não use versículos fora de contexto.
6. Siga linha bíblica conservadora.
7. Em temas sobre Espírito Santo, dons, santificação, igreja, missões e escatologia, siga o pentecostalismo clássico.
8. Ao citar textos bíblicos, use referências no próprio parágrafo, como: em João 15, em Romanos 8, em Isaías 6, em Lucas 5.
9. Não crie uma seção separada apenas para referências.
10. Não escreva versículos longos por extenso; cite e explique.

${limite}

FORMATO JSON:
{
  "number": ${form.chapterNumber},
  "title": "",
  "chapterQuestion": "",
  "opening": "",
  "thesisPresentation": "",
  "developmentBlocks": [
    {
      "heading": "",
      "content": ""
    },
    {
      "heading": "",
      "content": ""
    },
    {
      "heading": "",
      "content": ""
    },
    {
      "heading": "",
      "content": ""
    }
  ],
  "chapterConclusion": "",
  "transitionToNextChapter": "",
  "chapterSummary": ""
}

ATENÇÃO FINAL:
O capítulo não deve exibir listas de referências.
As referências bíblicas e referências cruzadas devem aparecer dentro dos parágrafos.
Não use o título "Aplicação pastoral".
Não use o título "Base bíblica".
Não use o título "Referências cruzadas".
Não use o título "Resumo do capítulo" dentro do texto do capítulo.
O campo chapterSummary é apenas resumo interno para ajudar a gerar o próximo capítulo; escreva curto e objetivo.
`.trim();
}

function promptRevistaMeta(form) {
  const versaoTexto = form.revistaVersion === "aluno" ? "REVISTA DO ALUNO" : "REVISTA DO PROFESSOR";

  return `
Você é um comentarista de revista bíblica, pastor, teólogo e professor de Escola Bíblica Dominical.

Crie apenas os DADOS GERAIS de uma REVISTA MENSAL DE EBD.
Não crie as lições completas agora. Apenas organize a revista e planeje os títulos das 4 lições.

VERSÃO:
${versaoTexto}

${baseDados(form, "Revista mensal de ensino bíblico")}
${regrasJson()}

REGRAS:
1. A revista é mensal.
2. Deve ter exatamente 4 lições, uma por semana.
3. Cada título de lição deve seguir o tema geral.
4. A revista do aluno e a revista do professor devem ter a mesma linha temática.
5. O conteúdo deve seguir linha bíblica conservadora.
6. Em temas sobre Espírito Santo, dons espirituais, igreja, santificação, escatologia e missão, siga o pentecostalismo clássico.
7. A apresentação deve ser boa, mas objetiva, com no máximo 220 palavras.
8. Planeje lições que permitam muitas referências bíblicas e referências cruzadas.

FORMATO JSON:
{
  "type": "revista",
  "revistaVersion": "${form.revistaVersion}",
  "bibleVersion": "${form.bibleVersion}",
  "title": "",
  "subtitle": "",
  "targetAudience": "",
  "author": "",
  "ministry": "",
  "quarterPresentation": "",
  "lessonTitles": [
    { "lesson": 1, "title": "" },
    { "lesson": 2, "title": "" },
    { "lesson": 3, "title": "" },
    { "lesson": 4, "title": "" }
  ],
  "finalWord": ""
}
`.trim();
}

function promptRevistaLicao(form, compacto) {
  const isProfessor = form.revistaVersion === "professor";
  const versaoTexto = isProfessor ? "REVISTA DO PROFESSOR" : "REVISTA DO ALUNO";

  const tituloPlanejado = Array.isArray(form.lessonTitles)
    ? (form.lessonTitles.find(x => Number(x.lesson) === Number(form.lessonNumber))?.title || "")
    : "";

  const controleProfessor = isProfessor
    ? `
REGRAS EXTRAS PARA A VERSÃO DO PROFESSOR:
1. O conteúdo principal da lição deve continuar profundo.
2. As respostas das perguntas devem ser objetivas, com no máximo 35 palavras cada.
3. Orientações para o professor: máximo 130 palavras.
4. Sugestão de abordagem em classe: máximo 130 palavras.
5. Observação pastoral: máximo 110 palavras.
6. Não repita o conteúdo dos tópicos nas orientações do professor.
7. Acrescente apoio doutrinário seguro dentro de teacherNotes, pastoralObservation ou doctrinalSupport.
8. O professor precisa ter mais referências bíblicas de apoio para conduzir a aula com segurança.
9. Inclua subsídios úteis para o professor quando o tema exigir aprofundamento histórico, bíblico ou doutrinário.
`
    : `
REGRAS EXTRAS PARA A VERSÃO DO ALUNO:
1. Não inclua gabarito.
2. Não inclua orientação interna do professor.
3. As perguntas devem vir sem respostas.
4. A versão do aluno deve continuar bem explicada, bíblica e profunda.
5. Mesmo na versão do aluno, inclua referências bíblicas e referências cruzadas para fortalecer o estudo.
`;

  const limites = compacto
    ? `
MODO COMPACTO DE SEGURANÇA:
1. Introdução: 80 a 120 palavras.
2. Cada tópico principal: 45 a 75 palavras.
3. Cada subtópico: 60 a 90 palavras.
4. Conclusão: 70 a 100 palavras.
5. Leitura bíblica em classe: no máximo 4 versículos.
`
    : `
LIMITES DE TAMANHO:
1. Introdução: 95 a 145 palavras.
2. Cada tópico principal: 55 a 85 palavras.
3. Cada subtópico: 75 a 110 palavras.
4. Conclusão: 80 a 120 palavras.
5. Leitura bíblica em classe: no máximo 5 versículos.
`;

  return `
Você é um comentarista de revista bíblica, pastor, teólogo e professor de Escola Bíblica Dominical.

Crie SOMENTE A LIÇÃO ${form.lessonNumber} de uma revista mensal de EBD.
Não crie as outras lições.
Esta chamada faz parte de uma geração por partes.

VERSÃO:
${versaoTexto}

TÍTULO PLANEJADO DA LIÇÃO:
${tituloPlanejado || "Crie um título coerente com o tema"}

${baseDados(form, "Revista mensal de ensino bíblico - lição individual")}
${regrasJson()}

REGRAS DA LIÇÃO:
1. Crie somente a lição ${form.lessonNumber}.
2. A lição deve ser profunda, didática, bíblica e aplicável.
3. Deve seguir padrão de revista de EBD.
4. Deve conter exatamente 3 tópicos principais.
5. Cada tópico principal deve conter exatamente 3 subtópicos.
6. Cada tópico principal deve ter uma abertura explicativa.
7. Cada tópico principal deve ter um campo topicReferences com 4 a 6 referências bíblicas relacionadas ao assunto.
8. Cada subtópico deve conter:
   - título;
   - referência bíblica principal;
   - explicação bíblica;
   - aplicação prática;
   - supportReferences com 3 a 5 referências bíblicas de apoio;
   - crossReferences com 3 a 5 referências cruzadas relacionadas.
9. Não encha a lição de versículos soltos sem explicar.
10. As referências cruzadas devem conectar Antigo e Novo Testamento quando possível.
11. A revista do aluno também deve ser completa, explicativa e profunda.
12. A versão do professor deve ter o mesmo conteúdo principal da versão do aluno, mas com recursos extras controlados.
13. Use como padrão textual a King James Fiel 1611.
14. Siga linha bíblica conservadora.
15. Em temas sobre Espírito Santo, dons, igreja, santificação, missões e escatologia, siga o pentecostalismo clássico.
16. Não crie doutrinas estranhas, especulativas ou sensacionalistas.
17. Inclua referências bíblicas junto ao argumento quando isso fortalecer a explicação.

${limites}

${controleProfessor}

FORMATO JSON:
{
  "lesson": ${form.lessonNumber},
  "title": "",
  "goldenText": "",
  "practicalTruth": "",
  "biblicalReadingReference": "",
  "biblicalReadingFull": [
    {
      "reference": "",
      "text": ""
    }
  ],
  "objectives": ["", "", ""],
  "introduction": "",
  "topics": [
    {
      "title": "",
      "topicReferences": ["", "", "", ""],
      "content": "",
      "subtopics": [
        { "title": "", "reference": "", "supportReferences": ["", "", "", ""], "crossReferences": ["", "", "", ""], "content": "" },
        { "title": "", "reference": "", "supportReferences": ["", "", "", ""], "crossReferences": ["", "", "", ""], "content": "" },
        { "title": "", "reference": "", "supportReferences": ["", "", "", ""], "crossReferences": ["", "", "", ""], "content": "" }
      ]
    },
    {
      "title": "",
      "topicReferences": ["", "", "", ""],
      "content": "",
      "subtopics": [
        { "title": "", "reference": "", "supportReferences": ["", "", "", ""], "crossReferences": ["", "", "", ""], "content": "" },
        { "title": "", "reference": "", "supportReferences": ["", "", "", ""], "crossReferences": ["", "", "", ""], "content": "" },
        { "title": "", "reference": "", "supportReferences": ["", "", "", ""], "crossReferences": ["", "", "", ""], "content": "" }
      ]
    },
    {
      "title": "",
      "topicReferences": ["", "", "", ""],
      "content": "",
      "subtopics": [
        { "title": "", "reference": "", "supportReferences": ["", "", "", ""], "crossReferences": ["", "", "", ""], "content": "" },
        { "title": "", "reference": "", "supportReferences": ["", "", "", ""], "crossReferences": ["", "", "", ""], "content": "" },
        { "title": "", "reference": "", "supportReferences": ["", "", "", ""], "crossReferences": ["", "", "", ""], "content": "" }
      ]
    }
  ],
  "lifeApplication": "",
  "teacherNotes": "",
  "classApproach": "",
  "pastoralObservation": "",
  "teacherSubsidies": [
    { "title": "", "content": "" },
    { "title": "", "content": "" }
  ],
  "doctrinalSupport": "",
  "recommendedDeepening": ["", "", ""],
  "bibliographicReferences": ["", "", "", ""],
  "studentNotesSpace": "",
  "conclusion": "",
  "questionsAndAnswers": [
    { "question": "", "answer": "" },
    { "question": "", "answer": "" },
    { "question": "", "answer": "" },
    { "question": "", "answer": "" }
  ],
  "questionsOnly": ["", "", "", ""]
}
`.trim();
}

function promptSermao(form) {
  return `
Você é um pregador cristão, expositor bíblico, pastor e teólogo.

Crie um SERMÃO CRISTÃO pregável no púlpito.
Não faça parecer e-book, livro ou revista.

${baseDados(form, "Sermão cristão")}
${regrasJson()}

REGRAS:
1. O sermão deve ser bíblico, profundo e pregável.
2. Cada ponto deve ter base bíblica clara.
3. Cada ponto deve conter referências bíblicas de apoio.
4. Cada ponto deve conter referências cruzadas conectando o tema com outros textos bíblicos.
5. Não crie um texto com cara de e-book.
6. Use linguagem de púlpito, pastoral e aplicável.

FORMATO JSON:
{
  "type": "sermao",
  "title": "",
  "subtitle": "",
  "theme": "",
  "biblicalText": "",
  "targetAudience": "",
  "author": "",
  "ministry": "",
  "objective": "",
  "introduction": "",
  "biblicalContext": "",
  "textExplanation": "",
  "centralProposition": "",
  "transitionPhrase": "",
  "points": [
    {
      "title": "",
      "references": ["", "", "", ""],
      "crossReferences": ["", "", "", ""],
      "explanation": "",
      "pastoralApplication": "",
      "illustration": ""
    }
  ],
  "dailyApplications": ["", "", "", ""],
  "conclusion": "",
  "appeal": "",
  "finalPrayer": ""
}
`.trim();
}

function promptEbook(form) {
  return `
Você é um escritor cristão, pastor e organizador editorial.

Crie um E-BOOK CRISTÃO moderno, prático, profundo e organizado.

${baseDados(form, "E-book cristão")}
${regrasJson()}

REGRAS:
1. E-book deve ser moderno, claro e prático.
2. Cada capítulo deve ter base bíblica.
3. Inclua referências bíblicas de apoio em cada capítulo.
4. Inclua referências cruzadas em cada capítulo.
5. Não faça parecer revista de EBD.
6. Mesmo sendo e-book, cada capítulo deve ter começo, desenvolvimento e conclusão.
7. Não faça comentários rasos.
8. Desenvolva uma ideia por capítulo de modo claro e progressivo.

FORMATO JSON:
{
  "type": "ebook",
  "title": "",
  "subtitle": "",
  "theme": "",
  "targetAudience": "",
  "author": "",
  "ministry": "",
  "summaryIntro": "",
  "chapters": [
    {
      "number": 1,
      "title": "",
      "heroCaption": "",
      "biblicalBase": ["", "", "", ""],
      "crossReferences": ["", "", "", ""],
      "opening": "",
      "centralIdea": "",
      "sections": [
        { "title": "", "content": "" },
        { "title": "", "content": "" },
        { "title": "", "content": "" }
      ],
      "highlightQuote": "",
      "reflectionQuestions": ["", "", ""],
      "practice": "",
      "prayer": "",
      "conclusion": ""
    }
  ],
  "closing": ""
}

Crie exatamente ${form.quantity} capítulos.
`.trim();
}

function promptDevocional(form) {
  return `
Você é um escritor devocional cristão e pastor.

Crie um DEVOCIONAL CRISTÃO bíblico, reflexivo e aplicável.

${baseDados(form, "Devocional cristão")}
${regrasJson()}

REGRAS:
1. Devocional deve ser claro e direto.
2. Cada dia deve ter versículo, reflexão, aplicação e oração.
3. Inclua referências bíblicas de apoio e referências cruzadas curtas quando possível.
4. Não faça parecer revista ou sermão.

FORMATO JSON:
{
  "type": "devocional",
  "title": "",
  "subtitle": "",
  "theme": "",
  "targetAudience": "",
  "author": "",
  "ministry": "",
  "presentation": "",
  "days": [
    {
      "day": 1,
      "title": "",
      "verse": "",
      "supportReferences": ["", "", ""],
      "crossReferences": ["", "", ""],
      "reflection": "",
      "practicalApplication": "",
      "meditationQuestion": "",
      "prayer": ""
    }
  ],
  "finalWord": ""
}

Crie exatamente ${form.quantity} dias devocionais.
`.trim();
}

function promptEstudo(form) {
  return `
Você é um professor de Bíblia e teólogo.

Crie um ESTUDO BÍBLICO/TEOLÓGICO didático, analítico e bíblico.

${baseDados(form, "Estudo bíblico/teológico")}
${regrasJson()}

REGRAS:
1. O estudo deve ser bíblico, analítico e pastoral.
2. Inclua referências bíblicas de apoio em cada parte.
3. Inclua referências cruzadas em cada parte.
4. Quando necessário, explique termos doutrinários com clareza.
5. Cada parte precisa trabalhar uma ideia com começo, desenvolvimento e conclusão.
6. Não entregue comentário curto.

FORMATO JSON:
{
  "type": "estudo",
  "title": "",
  "theme": "",
  "biblicalText": "",
  "supportReferences": ["", "", "", ""],
  "crossReferences": ["", "", "", ""],
  "objective": "",
  "introduction": "",
  "biblicalContext": "",
  "parts": [
    {
      "number": 1,
      "title": "",
      "references": ["", "", "", ""],
      "crossReferences": ["", "", "", ""],
      "explanation": "",
      "theologicalAnalysis": "",
      "practicalApplication": ""
    }
  ],
  "reviewQuestions": ["", "", "", ""],
  "conclusion": ""
}

Crie exatamente ${form.quantity} partes.
`.trim();
}

function promptCurso(form) {
  return `
Você é um professor cristão e organizador de cursos bíblicos.

Crie um CURSO CRISTÃO em formato de aulas.

${baseDados(form, "Curso cristão")}
${regrasJson()}

REGRAS:
1. O curso deve ser didático.
2. Cada aula deve ter objetivo, introdução, conteúdo, atividade e resumo.
3. Inclua referências bíblicas de apoio em cada aula.
4. Inclua referências cruzadas em cada aula.
5. Mantenha linguagem clara para ensino em igreja local.
6. Cada aula precisa ter progressão didática: começo, desenvolvimento e conclusão.

FORMATO JSON:
{
  "type": "curso",
  "title": "",
  "subtitle": "",
  "targetAudience": "",
  "author": "",
  "ministry": "",
  "courseDescription": "",
  "generalObjective": "",
  "lessons": [
    {
      "lesson": 1,
      "title": "",
      "objective": "",
      "introduction": "",
      "biblicalTexts": ["", "", "", ""],
      "crossReferences": ["", "", "", ""],
      "content": "",
      "classActivity": "",
      "homework": "",
      "summary": ""
    }
  ],
  "finalEvaluation": "",
  "finalWord": ""
}

Crie exatamente ${form.quantity} aulas.
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
              temperature: 0.62,
              topP: 0.9,
              maxOutputTokens: 18000
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

  throw lastError || new Error("Nenhum modelo conseguiu gerar o texto.");
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
