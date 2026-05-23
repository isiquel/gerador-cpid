module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Método não permitido. Use POST."
    });
  }

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : req.body || {};

    const form = normalizarFormulario(body);
    const apiKey = process.env.GEMINI_API_KEY || "";
    const textModel =
      process.env.GEMINI_TEXT_MODEL_1 ||
      process.env.GEMINI_TEXT_MODEL ||
      "gemini-1.5-flash";

    let ebook;

    try {
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY não encontrada.");
      }

      const rawText = await gerarTextoJson(form, apiKey, textModel);
      ebook = normalizarEbook(parseJsonSeguro(rawText), form);
    } catch (err) {
      console.error("[api/gerar.js] Falha ao gerar texto IA. Usando fallback.", err.message);
      ebook = criarEbookFallback(form);
    }

    const baseUrl = descobrirBaseUrl(req);

    // Gera a capa
    const coverPrompt =
      ebook.coverPrompt ||
      `${ebook.title}, Christian ebook cover, elegant, spiritual, cinematic light, modern, peaceful, premium illustration`;

    const capa = await pedirImagem(baseUrl, {
      prompt: coverPrompt,
      kind: "cover",
      estilo: form.estiloVisual
    });

    ebook.coverImage = capa?.dataUrl || "";

    // Gera imagens dos capítulos
    for (const chapter of ebook.chapters) {
      const prompt =
        chapter.imagePrompt ||
        `${chapter.title}, beautiful Christian illustration, elegant, modern, no text`;

      const img = await pedirImagem(baseUrl, {
        prompt,
        kind: "section",
        estilo: form.estiloVisual
      });

      chapter.image = img?.dataUrl || "";
    }

    const html = montarHtmlEbook(ebook, form);

    return res.status(200).json({
      ok: true,
      title: ebook.title,
      html
    });
  } catch (err) {
    console.error("[api/gerar.js] Erro geral:", err);

    return res.status(500).json({
      ok: false,
      error: "Não foi possível gerar o e-book agora."
    });
  }
};

function normalizarFormulario(body) {
  return {
    titulo:
      body.titulo ||
      body.title ||
      body.nomeEbook ||
      "",
    subtitulo:
      body.subtitulo ||
      body.subtitle ||
      "",
    tema:
      body.tema ||
      body.temaCentral ||
      body.assunto ||
      "",
    publicoAlvo:
      body.publicoAlvo ||
      body.publico ||
      body.audience ||
      "Igreja em geral",
    autor:
      body.autor ||
      body.comentarista ||
      "Pr. Isiquel Rodrigues",
    ministerio:
      body.ministerio ||
      body.editora ||
      "CPID - Casa Publicadora da Igreja de Deus",
    textoBase:
      body.textoBase ||
      body.textoBiblico ||
      body.baseBiblica ||
      body.versiculoBase ||
      "",
    linguagem:
      body.linguagem ||
      "Português do Brasil",
    estiloVisual:
      body.estiloVisual ||
      body.estilo ||
      "Colorido",
    capitulos: clampInt(
      body.capitulos || body.quantidadeCapitulos || 4,
      2,
      8
    ),
    observacoes:
      body.observacoes ||
      body.instrucoes ||
      ""
  };
}

async function gerarTextoJson(form, apiKey, model) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const prompt = montarPromptConteudo(form);

  const payload = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ]
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
    throw new Error(data?.error?.message || `Erro HTTP ${response.status}`);
  }

  const text =
    data?.candidates?.[0]?.content?.parts
      ?.map((part) => part?.text || "")
      .join("\n")
      .trim() || "";

  if (!text) {
    throw new Error("A IA não retornou texto.");
  }

  return text;
}

function montarPromptConteudo(form) {
  const temaFinal = form.tema || form.titulo || "Vida cristã";
  const tituloBase = form.titulo || "";
  const subtituloBase = form.subtitulo || "";
  const baseBiblica = form.textoBase || "Escolha textos bíblicos coerentes com o tema";

  return `
Você é um escritor, teólogo e diagramador editorial cristão.

Crie o conteúdo de um e-book cristão moderno, profundo, bonito, bíblico e prático.
Escreva em ${form.linguagem}.

DADOS:
- Tema: ${temaFinal}
- Título sugerido: ${tituloBase}
- Subtítulo sugerido: ${subtituloBase}
- Público-alvo: ${form.publicoAlvo}
- Autor: ${form.autor}
- Ministério/Editora: ${form.ministerio}
- Texto bíblico base: ${baseBiblica}
- Quantidade de capítulos: ${form.capitulos}
- Estilo visual: ${form.estiloVisual}
- Observações extras: ${form.observacoes || "Nenhuma"}

OBJETIVO:
Gerar um e-book com linguagem pastoral, edificante, atual, teologicamente equilibrada, com aplicação prática e profundidade espiritual.

REGRAS IMPORTANTES:
1. Responda APENAS em JSON.
2. Não escreva explicações fora do JSON.
3. O campo "coverPrompt" e os "imagePrompt" dos capítulos devem ser APENAS descrições visuais para gerar imagem.
4. Os prompts visuais devem vir em inglês.
5. Os prompts visuais devem dizer que a imagem NÃO deve conter textos, palavras ou letras.
6. Cada capítulo deve ter:
   - title
   - opening
   - verses (array com 2 ou 3 referências)
   - imagePrompt
   - sections (array com 3 itens, cada item com heading e body)
   - highlight
   - reflectionQuestions (array com 3 perguntas)
   - prayer
7. O e-book deve ter:
   - title
   - subtitle
   - audience
   - summary
   - coverPrompt
   - chapters

FORMATO EXATO DO JSON:
{
  "title": "",
  "subtitle": "",
  "audience": "",
  "summary": "",
  "coverPrompt": "",
  "chapters": [
    {
      "title": "",
      "opening": "",
      "verses": ["", ""],
      "imagePrompt": "",
      "sections": [
        { "heading": "", "body": "" },
        { "heading": "", "body": "" },
        { "heading": "", "body": "" }
      ],
      "highlight": "",
      "reflectionQuestions": ["", "", ""],
      "prayer": ""
    }
  ]
}
`.trim();
}

function parseJsonSeguro(raw) {
  const text = String(raw || "").trim();

  try {
    return JSON.parse(text);
  } catch (_) {}

  const semBloco = text
    .replace(/^```json/i, "")
    .replace(/^```/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(semBloco);
  } catch (_) {}

  const first = semBloco.indexOf("{");
  const last = semBloco.lastIndexOf("}");

  if (first >= 0 && last > first) {
    const maybe = semBloco.slice(first, last + 1);
    return JSON.parse(maybe);
  }

  throw new Error("Não foi possível converter a resposta em JSON.");
}

function normalizarEbook(data, form) {
  const title =
    safeText(data?.title) ||
    safeText(form.titulo) ||
    safeText(form.tema) ||
    "E-book Cristão";

  const subtitle =
    safeText(data?.subtitle) ||
    safeText(form.subtitulo) ||
    "Uma jornada de fé, transformação e crescimento espiritual";

  const audience =
    safeText(data?.audience) ||
    safeText(form.publicoAlvo);

  const summary =
    safeText(data?.summary) ||
    `Este material foi desenvolvido para fortalecer a fé, aprofundar a caminhada com Deus e trazer aplicação prática à vida cristã no dia a dia.`;

  const coverPrompt =
    safeText(data?.coverPrompt) ||
    `${title}, elegant Christian ebook cover, soft cinematic light, premium illustration, no text, no words, no letters`;

  const chaptersRaw = Array.isArray(data?.chapters) ? data.chapters : [];

  let chapters = chaptersRaw.map((ch, index) => ({
    title: safeText(ch?.title) || `Capítulo ${index + 1}`,
    opening: safeText(ch?.opening) || "",
    verses: Array.isArray(ch?.verses) ? ch.verses.map(safeText).filter(Boolean) : [],
    imagePrompt:
      safeText(ch?.imagePrompt) ||
      `Christian illustration for chapter ${index + 1}, elegant, spiritual, beautiful, no text, no letters`,
    sections: Array.isArray(ch?.sections)
      ? ch.sections
          .slice(0, 3)
          .map((s) => ({
            heading: safeText(s?.heading) || "",
            body: safeText(s?.body) || ""
          }))
      : [],
    highlight: safeText(ch?.highlight) || "",
    reflectionQuestions: Array.isArray(ch?.reflectionQuestions)
      ? ch.reflectionQuestions.map(safeText).filter(Boolean)
      : [],
    prayer: safeText(ch?.prayer) || ""
  }));

  if (!chapters.length) {
    chapters = criarEbookFallback(form).chapters;
  }

  return {
    title,
    subtitle,
    audience,
    summary,
    coverPrompt,
    chapters
  };
}

function criarEbookFallback(form) {
  const title =
    form.titulo ||
    temaParaTitulo(form.tema) ||
    "E-book Cristão";

  const subtitle =
    form.subtitulo ||
    "Fé, esperança e direção para os desafios da vida atual";

  const summary =
    "Este e-book foi elaborado para ajudar o leitor a crescer espiritualmente, discernir os desafios da vida moderna à luz da Palavra de Deus e aplicar princípios bíblicos com profundidade e praticidade.";

  const tema = form.tema || title;

  const chapters = [
    {
      title: "A Realidade do Tema na Vida Atual",
      opening:
        `Antes de vencer qualquer batalha espiritual e emocional, precisamos reconhecer com sinceridade como o tema "${tema}" se manifesta em nossa rotina, pensamentos e relacionamentos. A graça de Deus começa a operar quando paramos de fugir da verdade e nos abrimos à transformação.`,
      verses: ["Salmos 139.23-24", "João 8.32"],
      imagePrompt:
        "A contemplative Christian illustration of a person in reflection at sunrise, peaceful atmosphere, soft golden light, elegant, no text, no words, no letters",
      sections: [
        {
          heading: "Enxergando o coração com sinceridade",
          body:
            "O primeiro passo para a restauração é a honestidade diante de Deus. Não existe cura profunda onde a alma continua se escondendo. O Espírito Santo nos conduz a um exame interior que não nos humilha para destruição, mas nos revela para cura.\n\nQuando reconhecemos a nossa fragilidade, abrimos espaço para a graça nos fortalecer. A confissão sincera nos aproxima do Pai e nos tira do peso de fingir que está tudo bem."
        },
        {
          heading: "O mundo moderno e a pressão sobre a alma",
          body:
            "Vivemos em uma cultura marcada por pressa, comparação, excesso de informação e desgaste emocional. Isso produz um ambiente em que muitos vivem cheios por fora, mas vazios por dentro. A vida espiritual acaba sufocada quando o coração perde o ritmo da presença de Deus.\n\nPor isso, discernir os sinais do cansaço, da ansiedade e da superficialidade é um ato de sabedoria espiritual."
        },
        {
          heading: "Deus nos chama para a verdade libertadora",
          body:
            "Cristo não nos chama para uma religiosidade de aparência, mas para uma vida transformada pela verdade. O Evangelho confronta aquilo que está torto, mas sempre oferece um caminho de redenção, reconciliação e esperança.\n\nQuando a verdade de Deus entra, a mentira perde força, a culpa perde domínio e a alma começa a respirar novamente."
        }
      ],
      highlight:
        "A transformação começa quando temos coragem de olhar para dentro à luz da presença de Deus.",
      reflectionQuestions: [
        "O que em minha vida eu preciso encarar com mais sinceridade diante de Deus?",
        "Que pressões externas têm afetado minha saúde espiritual?",
        "Quais áreas da minha alma precisam da verdade libertadora de Cristo?"
      ],
      prayer:
        "Senhor, sonda o meu coração e revela o que precisa ser tratado. Livra-me da superficialidade e guia-me por um caminho de verdade, arrependimento e cura. Em nome de Jesus, amém."
    },
    {
      title: "A Palavra de Deus como resposta e direção",
      opening:
        "A Bíblia não é apenas um livro devocional; ela é a voz de Deus soprando direção para o coração humano. Nela encontramos discernimento, consolo, correção e esperança para enfrentar a vida com firmeza espiritual.",
      verses: ["Salmos 119.105", "2 Timóteo 3.16-17"],
      imagePrompt:
        "Beautiful Christian illustration of an open Bible illuminated by warm heavenly light, elegant, refined, spiritual, no text, no words, no letters",
      sections: [
        {
          heading: "A Escritura ilumina o caminho",
          body:
            "Em tempos de confusão, a Palavra de Deus se torna lâmpada para os pés e luz para o caminho. Ela não apenas informa; ela forma. Ao mergulharmos nas Escrituras, nossa mente é renovada e nosso coração é alinhado com a vontade do Senhor.\n\nQuem vive sem Palavra vive sem direção segura."
        },
        {
          heading: "A Palavra confronta e consola",
          body:
            "A mesma Palavra que corrige também consola. Ela expõe pecados, trata intenções e confronta atitudes erradas, mas faz isso conduzindo o homem ao arrependimento e à restauração.\n\nEla também cura feridas, conforta os abatidos e derrama esperança onde havia desânimo."
        },
        {
          heading: "Aplicando a verdade na rotina",
          body:
            "O poder da Palavra não está apenas em ouvi-la, mas em praticá-la. Quando obedecemos, a verdade deixa de ser conceito e se torna experiência viva. O discipulado verdadeiro nasce da prática diária da obediência.\n\nA fé amadurece quando a verdade entra na rotina."
        }
      ],
      highlight:
        "Quem se alimenta da Palavra encontra firmeza para permanecer quando tudo ao redor parece instável.",
      reflectionQuestions: [
        "Tenho aberto espaço real para a Palavra de Deus em minha rotina?",
        "Que área da minha vida precisa ser corrigida pela verdade bíblica?",
        "Como posso praticar esta semana aquilo que Deus já me mostrou?"
      ],
      prayer:
        "Pai, dá-me fome da Tua Palavra. Que ela ilumine meus passos, corrija meu coração e fortaleça a minha fé. Em nome de Jesus, amém."
    },
    {
      title: "A vida de oração e a reconstrução interior",
      opening:
        "A oração não é um ritual vazio, mas um encontro com o Deus vivo. É no lugar da intimidade que a alma desacelera, o coração é reorganizado e a fé é restaurada.",
      verses: ["Mateus 6.6", "Filipenses 4.6-7"],
      imagePrompt:
        "Elegant Christian illustration of a person praying in a peaceful room with soft window light, deep spiritual atmosphere, no text, no words, no letters",
      sections: [
        {
          heading: "O lugar secreto transforma o interior",
          body:
            "No lugar secreto, deixamos de sustentar aparências e passamos a nos apresentar como realmente estamos. É ali que o coração encontra refúgio, correção e descanso. A oração nos leva para além das palavras; ela nos coloca diante da presença.\n\nQuando a presença de Deus enche o coração, o caos interior perde força."
        },
        {
          heading: "A oração cura a ansiedade da alma",
          body:
            "A ansiedade nos empurra para o controle; a oração nos conduz à entrega. Em vez de alimentar o medo, somos convidados a derramar diante de Deus o que nos inquieta. O Senhor não despreza um coração sincero.\n\nAo orarmos, transferimos o peso para quem pode sustentá-lo."
        },
        {
          heading: "Constância e disciplina espiritual",
          body:
            "Uma vida de oração não nasce do improviso, mas da decisão. Precisamos cultivar ritmo, prioridade e perseverança. Nem sempre haverá emoção intensa, mas sempre haverá fruto onde existe fidelidade.\n\nA constância no secreto gera estabilidade no público."
        }
      ],
      highlight:
        "Aquilo que a ansiedade aperta, a presença de Deus pode acalmar.",
      reflectionQuestions: [
        "Minha vida de oração tem sido prioridade ou apenas emergência?",
        "O que preciso entregar a Deus hoje com sinceridade?",
        "Como posso criar um ritmo mais saudável de intimidade com Deus?"
      ],
      prayer:
        "Senhor, ensina-me a orar com profundidade e constância. Acalma meu coração, cura minha alma e faz do meu interior um lugar de paz. Em nome de Jesus, amém."
    },
    {
      title: "Vivendo a resposta de Deus no cotidiano",
      opening:
        "O objetivo final do crescimento espiritual não é apenas sentir-se melhor, mas viver de forma transformada. Deus deseja que aquilo que recebemos no secreto seja visível nas atitudes, decisões e relacionamentos.",
      verses: ["Tiago 1.22", "Gálatas 5.22-23"],
      imagePrompt:
        "Beautiful Christian illustration of a person walking forward under warm sunrise light, symbolizing hope, transformation and faith, elegant, no text, no words, no letters",
      sections: [
        {
          heading: "Da reflexão para a prática",
          body:
            "A fé bíblica não se limita à inspiração; ela exige encarnação prática. O coração tocado por Deus começa a responder com atitudes novas, escolhas mais sábias e uma postura mais semelhante à de Cristo.\n\nToda verdade que não desce para a prática corre o risco de virar apenas discurso."
        },
        {
          heading: "Frutos visíveis da maturidade",
          body:
            "A maturidade espiritual se percebe na maneira como reagimos sob pressão, servimos com amor, perdoamos, perseveramos e escolhemos a santidade. O fruto do Espírito é uma evidência de que Deus está trabalhando no interior.\n\nNão se trata de perfeição instantânea, mas de transformação contínua."
        },
        {
          heading: "Persistindo no caminho",
          body:
            "Haverá dias difíceis, recaídas emocionais e momentos de cansaço, mas a perseverança em Deus produz crescimento real. O Pai não abandona a obra que começou. Quem permanece nEle aprende a caminhar com esperança até mesmo em tempos incertos.\n\nA fidelidade diária constrói uma vida sólida."
        }
      ],
      highlight:
        "A resposta de Deus não é apenas um alívio momentâneo; é um novo modo de viver.",
      reflectionQuestions: [
        "Que mudança prática Deus está me pedindo hoje?",
        "Que frutos espirituais preciso desenvolver com mais intencionalidade?",
        "O que me ajudará a permanecer firme no processo de crescimento?"
      ],
      prayer:
        "Pai, ajuda-me a viver na prática aquilo que tenho recebido de Ti. Dá-me perseverança, maturidade e fidelidade para caminhar contigo todos os dias. Em nome de Jesus, amém."
    }
  ];

  return {
    title,
    subtitle,
    audience: form.publicoAlvo,
    summary,
    coverPrompt:
      `${title}, elegant Christian ebook cover, premium, beautiful, spiritual atmosphere, soft cinematic light, refined composition, no text, no words, no letters`,
    chapters: chapters.slice(0, form.capitulos)
  };
}

function temaParaTitulo(tema = "") {
  const t = String(tema || "").trim();
  if (!t) return "";
  return `Caminhos de Deus para ${t}`;
}

async function pedirImagem(baseUrl, payload) {
  try {
    const response = await fetch(`${baseUrl}/api/imagem`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      return { ok: false, dataUrl: "" };
    }

    return data;
  } catch (err) {
    console.error("[api/gerar.js] Erro ao pedir imagem:", err.message);
    return { ok: false, dataUrl: "" };
  }
}

function descobrirBaseUrl(req) {
  const protocol = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${protocol}://${host}`;
}

function montarHtmlEbook(ebook, form) {
  const estiloMono =
    String(form.estiloVisual || "").toLowerCase().includes("preto") ||
    String(form.estiloVisual || "").toLowerCase().includes("branco");

  const accent = estiloMono ? "#6b6b6b" : "#b78853";
  const accentSoft = estiloMono ? "#f1f1f1" : "#f7efe5";
  const border = estiloMono ? "#d8d8d8" : "#eadfce";
  const ink = estiloMono ? "#2f2f2f" : "#3d2d1f";
  const bodyInk = estiloMono ? "#505050" : "#5a4a3f";
  const pageBg = estiloMono ? "#fbfbfb" : "#fcf9f5";

  const chaptersHtml = ebook.chapters
    .map((chapter, index) => {
      const sections = (chapter.sections || [])
        .map(
          (section) => `
            <div class="section-block">
              <h3>${escapeHtml(section.heading || "")}</h3>
              ${renderParagraphs(section.body || "")}
            </div>
          `
        )
        .join("");

      const verses = (chapter.verses || [])
        .map((v) => `<span class="verse-tag">${escapeHtml(v)}</span>`)
        .join("");

      const questions = (chapter.reflectionQuestions || [])
        .map((q) => `<li>${escapeHtml(q)}</li>`)
        .join("");

      return `
        <section class="page chapter-page" id="cap-${index + 1}">
          <div class="chapter-head">
            <div class="chapter-kicker">CAPÍTULO ${index + 1}</div>
            <h2>${escapeHtml(chapter.title || "")}</h2>
            ${chapter.opening ? `<div class="opening">${renderParagraphs(chapter.opening)}</div>` : ""}
          </div>

          ${verses ? `<div class="verse-row">${verses}</div>` : ""}

          ${
            chapter.image
              ? `
              <div class="image-card">
                <img src="${chapter.image}" alt="Ilustração do capítulo ${index + 1}" />
              </div>
            `
              : ""
          }

          ${sections}

          ${
            chapter.highlight
              ? `
              <div class="highlight-box">
                <div class="highlight-title">Caixa de Destaque</div>
                <blockquote>${escapeHtml(chapter.highlight)}</blockquote>
              </div>
            `
              : ""
          }

          ${
            questions
              ? `
              <div class="reflection-box">
                <h4>Exercício de Reflexão</h4>
                <ol>${questions}</ol>
              </div>
            `
              : ""
          }

          ${
            chapter.prayer
              ? `
              <div class="prayer-box">
                <h4>Oração Final</h4>
                ${renderParagraphs(chapter.prayer)}
              </div>
            `
              : ""
          }

          <div class="footer-mark">VERBO IA</div>
        </section>
      `;
    })
    .join("");

  const toc = ebook.chapters
    .map(
      (chapter, index) => `
      <li>
        <a href="#cap-${index + 1}">
          <span>${index + 1}. ${escapeHtml(chapter.title || "")}</span>
        </a>
      </li>
    `
    )
    .join("");

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(ebook.title)}</title>
  <style>
    :root {
      --accent: ${accent};
      --accent-soft: ${accentSoft};
      --border: ${border};
      --ink: ${ink};
      --body-ink: ${bodyInk};
      --page-bg: ${pageBg};
      --white: #ffffff;
    }

    * {
      box-sizing: border-box;
    }

    html, body {
      margin: 0;
      padding: 0;
      background: #ebe7e2;
      color: var(--body-ink);
      font-family: Arial, Helvetica, sans-serif;
      line-height: 1.7;
    }

    body {
      padding: 24px;
    }

    .ebook {
      max-width: 980px;
      margin: 0 auto;
    }

    .page {
      background: var(--page-bg);
      border: 1px solid var(--border);
      border-radius: 28px;
      padding: 34px;
      margin-bottom: 24px;
      box-shadow: 0 14px 40px rgba(0,0,0,0.05);
      overflow: hidden;
      position: relative;
    }

    .cover-page {
      padding: 0;
      overflow: hidden;
    }

    .cover-visual {
      position: relative;
      min-height: 520px;
      background: linear-gradient(135deg, #d9c1a4, #9d7a59);
      display: flex;
      align-items: stretch;
      justify-content: stretch;
    }

    .cover-visual img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      ${estiloMono ? "filter: grayscale(100%);" : ""}
    }

    .cover-overlay {
      position: absolute;
      inset: 0;
      background: linear-gradient(
        to bottom,
        rgba(0,0,0,0.20),
        rgba(0,0,0,0.38)
      );
    }

    .cover-content {
      position: relative;
      z-index: 2;
      width: 100%;
      padding: 42px 38px;
      color: #fff;
      text-align: center;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 14px;
    }

    .brand {
      font-size: 16px;
      font-weight: 700;
      letter-spacing: 1px;
      opacity: 0.95;
    }

    .tag {
      display: inline-block;
      align-self: center;
      padding: 8px 16px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.35);
      background: rgba(255,255,255,0.14);
      font-size: 14px;
      font-weight: 600;
    }

    .cover-content h1 {
      margin: 4px 0 0;
      font-size: clamp(32px, 4vw, 56px);
      line-height: 1.08;
      font-weight: 800;
    }

    .cover-content .subtitle {
      font-size: clamp(18px, 2.2vw, 28px);
      line-height: 1.35;
      font-weight: 600;
      max-width: 820px;
      margin: 0 auto;
      opacity: 0.98;
    }

    .cover-meta {
      margin-top: 8px;
      font-size: 15px;
      line-height: 1.7;
      opacity: 0.98;
    }

    .summary-page h2,
    .chapter-page h2 {
      margin-top: 0;
      color: var(--ink);
      line-height: 1.15;
    }

    .summary-box {
      background: #fff;
      border: 1px solid var(--border);
      border-radius: 22px;
      padding: 24px;
      margin-top: 20px;
    }

    .summary-box ul {
      margin: 0;
      padding-left: 20px;
    }

    .summary-box li {
      margin-bottom: 12px;
    }

    .summary-box a {
      color: var(--ink);
      text-decoration: none;
      font-weight: 600;
    }

    .chapter-head {
      margin-bottom: 22px;
    }

    .chapter-kicker {
      color: var(--accent);
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 1.4px;
      margin-bottom: 8px;
    }

    .opening p,
    .section-block p,
    .prayer-box p,
    .summary-page p {
      margin: 0 0 14px;
    }

    .verse-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 22px;
    }

    .verse-tag {
      display: inline-flex;
      align-items: center;
      padding: 10px 16px;
      border-radius: 999px;
      background: #fff;
      border: 1px solid var(--border);
      color: var(--ink);
      font-size: 14px;
      font-weight: 700;
    }

    .image-card {
      background: linear-gradient(135deg, #f1e6d7, #e0c7ad);
      border-radius: 24px;
      padding: 16px;
      margin-bottom: 24px;
      border: 1px solid var(--border);
    }

    .image-card img {
      width: 100%;
      height: auto;
      display: block;
      border-radius: 18px;
      ${estiloMono ? "filter: grayscale(100%);" : ""}
    }

    .section-block {
      background: #fff;
      border: 1px solid var(--border);
      border-radius: 22px;
      padding: 22px;
      margin-bottom: 18px;
    }

    .section-block h3 {
      margin-top: 0;
      margin-bottom: 10px;
      color: var(--ink);
    }

    .highlight-box,
    .reflection-box,
    .prayer-box {
      border-radius: 22px;
      padding: 22px;
      margin-top: 20px;
      border: 1px solid var(--border);
      background: #fff;
    }

    .highlight-box {
      background: linear-gradient(180deg, var(--accent-soft), #fff);
    }

    .highlight-title {
      color: var(--accent);
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 1.2px;
      margin-bottom: 8px;
      text-transform: uppercase;
    }

    blockquote {
      margin: 0;
      font-size: 20px;
      line-height: 1.5;
      font-weight: 700;
      color: var(--ink);
    }

    .reflection-box h4,
    .prayer-box h4 {
      margin-top: 0;
      color: var(--ink);
    }

    .reflection-box ol {
      margin: 0;
      padding-left: 20px;
    }

    .reflection-box li {
      margin-bottom: 10px;
    }

    .footer-mark {
      margin-top: 24px;
      font-size: 12px;
      letter-spacing: 1px;
      font-weight: 700;
      color: var(--accent);
      opacity: 0.8;
    }

    @media print {
      body {
        background: #fff;
        padding: 0;
      }

      .page {
        box-shadow: none;
        break-inside: avoid;
        page-break-inside: avoid;
      }
    }

    @media (max-width: 768px) {
      body {
        padding: 12px;
      }

      .page {
        padding: 22px;
        border-radius: 20px;
      }

      .cover-content {
        padding: 30px 22px;
      }

      .cover-visual {
        min-height: 460px;
      }
    }
  </style>
</head>
<body>
  <div class="ebook">

    <section class="page cover-page">
      <div class="cover-visual">
        ${ebook.coverImage ? `<img src="${ebook.coverImage}" alt="Capa do e-book" />` : ""}
        <div class="cover-overlay"></div>
        <div class="cover-content">
          <div class="brand">VERBO IA</div>
          <div class="tag">${escapeHtml(form.tema || "E-book cristão")}</div>
          <h1>${escapeHtml(ebook.title)}</h1>
          <div class="subtitle">${escapeHtml(ebook.subtitle)}</div>

          <div class="cover-meta">
            ${
              form.textoBase
                ? `<div><strong>Texto bíblico base:</strong> ${escapeHtml(form.textoBase)}</div>`
                : ""
            }
            <div><strong>Autor / Comentarista:</strong> ${escapeHtml(form.autor)}</div>
            <div><strong>Editora / Ministério:</strong> ${escapeHtml(form.ministerio)}</div>
            <div><strong>Público-alvo:</strong> ${escapeHtml(ebook.audience)}</div>
          </div>
        </div>
      </div>
    </section>

    <section class="page summary-page">
      <h2>Apresentação</h2>
      ${renderParagraphs(ebook.summary)}

      <div class="summary-box">
        <h3>Sumário</h3>
        <ul>${toc}</ul>
      </div>
    </section>

    ${chaptersHtml}

  </div>
</body>
</html>
  `.trim();
}

function renderParagraphs(text) {
  const safe = safeText(text);
  if (!safe) return "";

  const parts = safe
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (!parts.length) {
    return `<p>${escapeHtml(safe)}</p>`;
  }

  return parts.map((p) => `<p>${escapeHtml(p)}</p>`).join("");
}

function safeText(value) {
  return String(value || "").trim();
}

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function clampInt(value, min, max) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}
