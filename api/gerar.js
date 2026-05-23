function toBool(value) {
  return String(value || '').trim().toLowerCase() === 'sim';
}

function clamp(num, min, max) {
  const n = Number(num || 0);
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function normalizeForm(input = {}) {
  return {
    tipoMaterial: input.tipoMaterial || 'E-book cristão',
    titulo: input.titulo || 'Sem título',
    temaPrincipal: input.temaPrincipal || '',
    textoBiblicoBase: input.textoBiblicoBase || '',
    publicoAlvo: input.publicoAlvo || 'Igreja em geral',
    linguagem: input.linguagem || 'Pastoral, bíblica e didática',
    quantidadeCapitulos: clamp(input.quantidadeCapitulos, 1, 12),
    perguntasPorCapitulo: clamp(input.perguntasPorCapitulo, 1, 8),
    profundidade: input.profundidade || 'Muito expandido',
    estiloVisual: input.estiloVisual || 'Colorido',
    gerarCapa: toBool(input.gerarCapa),
    gerarIlustracoes: toBool(input.gerarIlustracoes),
    autor: input.autor || '',
    editoraMinisterio: input.editoraMinisterio || '',
    orientacoesAdicionais: input.orientacoesAdicionais || ''
  };
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cleanJson(text = '') {
  return String(text)
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
}

function textToHtmlParagraphs(text = '') {
  return String(text)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join('');
}

function buildFallbackSvg(prompt, mode = 'Colorido', title = 'Ilustração') {
  const isBW = String(mode).toLowerCase().includes('preto');
  const bg1 = isBW ? '#f4f4f4' : '#f4ead9';
  const bg2 = isBW ? '#e5e5e5' : '#dcb98a';
  const bg3 = isBW ? '#d7d7d7' : '#8a6a46';
  const text = escapeHtml(prompt || 'Ilustração do capítulo');

  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
    <defs>
      <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0%" stop-color="${bg1}"/>
        <stop offset="55%" stop-color="${bg2}"/>
        <stop offset="100%" stop-color="${bg3}"/>
      </linearGradient>
    </defs>
    <rect width="1280" height="720" fill="url(#g)"/>
    <circle cx="180" cy="140" r="90" fill="rgba(255,255,255,0.26)"/>
    <circle cx="1090" cy="160" r="120" fill="rgba(255,255,255,0.18)"/>
    <circle cx="980" cy="560" r="85" fill="rgba(255,255,255,0.16)"/>
    <rect x="110" y="90" rx="40" ry="40" width="1060" height="540" fill="rgba(255,255,255,0.28)" stroke="rgba(255,255,255,0.5)" stroke-width="3"/>
    <text x="140" y="165" font-size="28" font-family="Arial" fill="#ffffff" opacity="0.95">${escapeHtml(title)}</text>
    <text x="140" y="250" font-size="54" font-weight="bold" font-family="Arial" fill="#ffffff">Ilustração provisória</text>
    <foreignObject x="140" y="300" width="980" height="220">
      <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: Arial; font-size: 30px; color: white; line-height: 1.45;">
        ${text}
      </div>
    </foreignObject>
  </svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

async function callGemini(model, body) {
  const apiKey = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      data?.error?.message ||
      `Falha ao chamar o modelo ${model}.`;
    throw new Error(message);
  }

  return data;
}

function extractTextFromGemini(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts
    .filter((part) => typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n')
    .trim();
}

function extractImageDataUrl(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData?.data && part.inlineData?.mimeType) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }
  return null;
}

function buildSchema(form) {
  return {
    type: 'object',
    properties: {
      title: { type: 'string' },
      subtitle: { type: 'string' },
      shortDescription: { type: 'string' },
      coverImagePrompt: { type: 'string' },
      summaryIntro: { type: 'string' },
      introduction: { type: 'string' },
      conclusion: { type: 'string' },
      chapters: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            number: { type: 'integer' },
            title: { type: 'string' },
            verseTags: {
              type: 'array',
              items: { type: 'string' }
            },
            illustrationPrompt: { type: 'string' },
            opening: { type: 'string' },
            sections: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  heading: { type: 'string' },
                  body: { type: 'string' }
                },
                required: ['heading', 'body']
              }
            },
            highlightQuote: { type: 'string' },
            reflectionTitle: { type: 'string' },
            reflectionBody: { type: 'string' },
            prayer: { type: 'string' },
            questions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  question: { type: 'string' },
                  answer: { type: 'string' }
                },
                required: ['question', 'answer']
              }
            }
          },
          required: [
            'number',
            'title',
            'verseTags',
            'illustrationPrompt',
            'opening',
            'sections',
            'highlightQuote',
            'reflectionTitle',
            'reflectionBody',
            'prayer',
            'questions'
          ]
        }
      }
    },
    required: [
      'title',
      'subtitle',
      'shortDescription',
      'coverImagePrompt',
      'summaryIntro',
      'introduction',
      'conclusion',
      'chapters'
    ]
  };
}

function buildPrompt(form) {
  return `
Você é um especialista em criação de materiais cristãos premium, diagramados e prontos para PDF.

Crie um material em PORTUGUÊS DO BRASIL no formato JSON.

DADOS DO PROJETO:
- Tipo de material: ${form.tipoMaterial}
- Título: ${form.titulo}
- Tema principal: ${form.temaPrincipal}
- Texto bíblico base: ${form.textoBiblicoBase}
- Público-alvo: ${form.publicoAlvo}
- Linguagem: ${form.linguagem}
- Quantidade de capítulos: ${form.quantidadeCapitulos}
- Perguntas por capítulo: ${form.perguntasPorCapitulo}
- Profundidade: ${form.profundidade}
- Estilo visual: ${form.estiloVisual}
- Autor / Comentarista: ${form.autor}
- Editora / Ministério: ${form.editoraMinisterio}
- Orientações adicionais: ${form.orientacoesAdicionais}

REGRAS IMPORTANTES:
1. O material precisa ser profundo, bonito, bem organizado e pastoralmente rico.
2. O texto precisa estar expandido e não superficial.
3. NÃO repita o nome do autor em todos os capítulos.
4. NÃO use frases como "nova seção do material".
5. O sumário deve ficar limpo e profissional.
6. Cada capítulo precisa conter:
   - título forte;
   - tags curtas de referências bíblicas (verseTags);
   - opening (abertura do capítulo);
   - sections (3 a 5 seções com heading e body);
   - highlightQuote;
   - reflectionTitle;
   - reflectionBody;
   - prayer;
   - questions com perguntas e respostas.
7. Gere um "coverImagePrompt" forte para capa ilustrada.
8. Gere também um "illustrationPrompt" forte para cada capítulo.
9. Os prompts de imagem devem pedir ilustrações cristãs editoriais, belas, reverentes, profissionais e sem texto dentro da imagem.
10. Responda SOMENTE em JSON válido.

IMPORTANTE:
- Crie exatamente ${form.quantidadeCapitulos} capítulos.
- Crie exatamente ${form.perguntasPorCapitulo} perguntas em cada capítulo.
`;
}

async function generateStructuredEbook(form) {
  const model = process.env.GEMINI_TEXT_MODEL || 'gemini-3.5-flash';

  const body = {
    contents: [
      {
        parts: [{ text: buildPrompt(form) }]
      }
    ],
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 65535,
      responseFormat: {
        text: {
          mimeType: 'application/json',
          schema: buildSchema(form)
        }
      }
    }
  };

  const data = await callGemini(model, body);
  const rawText = extractTextFromGemini(data);
  const jsonText = cleanJson(rawText);
  return JSON.parse(jsonText);
}

async function generateImage(prompt, aspectRatio, styleMode, title = 'Ilustração') {
  try {
    const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image-preview';

    const body = {
      contents: [
        {
          parts: [
            {
              text: `
Crie uma imagem editorial cristã, elegante, bonita, bem iluminada, refinada e pronta para compor um e-book profissional.
Evite inserir textos escritos dentro da imagem.
Estilo visual desejado: ${styleMode}.
Prompt principal: ${prompt}
              `.trim()
            }
          ]
        }
      ],
      generationConfig: {
        responseFormat: {
          image: {
            aspectRatio,
            imageSize: '2K'
          }
        }
      }
    };

    const data = await callGemini(model, body);
    const image = extractImageDataUrl(data);
    if (image) return image;

    return buildFallbackSvg(prompt, styleMode, title);
  } catch (error) {
    return buildFallbackSvg(prompt, styleMode, title);
  }
}

function palette(mode) {
  const isBW = String(mode).toLowerCase().includes('preto');
  if (isBW) {
    return {
      bg: '#f4f4f4',
      paper: '#ffffff',
      ink: '#222222',
      muted: '#5f5f5f',
      line: '#dddddd',
      accent: '#666666',
      accent2: '#2f2f2f',
      soft: '#f8f8f8'
    };
  }

  return {
    bg: '#f7efe5',
    paper: '#ffffff',
    ink: '#2c241d',
    muted: '#6f6256',
    line: '#eadcca',
    accent: '#b38b52',
    accent2: '#7a5b3a',
    soft: '#fbf7f1'
  };
}

function buildHtml(ebook, form) {
  const colors = palette(form.estiloVisual);

  const summaryItems = ebook.chapters
    .map((chapter) => `
      <div class="toc-item">
        <span class="toc-num">${chapter.number}</span>
        <span class="toc-title">${escapeHtml(chapter.title)}</span>
      </div>
    `)
    .join('');

  const chapterHtml = ebook.chapters
    .map((chapter) => {
      const verseTags = (chapter.verseTags || [])
        .map((tag) => `<span class="pill">${escapeHtml(tag)}</span>`)
        .join('');

      const sections = (chapter.sections || [])
        .map(
          (section) => `
          <section class="content-block">
            <h3>${escapeHtml(section.heading)}</h3>
            ${textToHtmlParagraphs(section.body)}
          </section>
        `
        )
        .join('');

      const questions = (chapter.questions || [])
        .map(
          (qa, index) => `
          <div class="qa-item">
            <div class="qa-q"><strong>${index + 1}.</strong> ${escapeHtml(qa.question)}</div>
            <div class="qa-a"><strong>Resposta:</strong> ${escapeHtml(qa.answer)}</div>
          </div>
        `
        )
        .join('');

      return `
        <article class="chapter page-break">
          <div class="chapter-head">
            <div class="chapter-badge">CAPÍTULO ${chapter.number}</div>
            <h2>${escapeHtml(chapter.title)}</h2>
            <div class="verse-tags">${verseTags}</div>
          </div>

          <div class="chapter-image">
            <img src="${chapter.image || ''}" alt="Ilustração do capítulo ${chapter.number}" />
          </div>

          <div class="chapter-opening">
            ${textToHtmlParagraphs(chapter.opening)}
          </div>

          ${sections}

          <blockquote class="quote-box">“${escapeHtml(chapter.highlightQuote)}”</blockquote>

          <section class="reflection-box">
            <h3>${escapeHtml(chapter.reflectionTitle)}</h3>
            ${textToHtmlParagraphs(chapter.reflectionBody)}
          </section>

          <section class="prayer-box">
            <h3>Oração final</h3>
            ${textToHtmlParagraphs(chapter.prayer)}
          </section>

          <section class="questions-box">
            <h3>Perguntas e respostas</h3>
            ${questions}
          </section>
        </article>
      `;
    })
    .join('');

  const coverImageLayer = form.gerarCapa && ebook.coverImage
    ? `<div class="cover-bg-image" style="background-image:url('${ebook.coverImage}')"></div>`
    : '';

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${escapeHtml(ebook.title)}</title>
  <style>
    :root {
      --bg: ${colors.bg};
      --paper: ${colors.paper};
      --ink: ${colors.ink};
      --muted: ${colors.muted};
      --line: ${colors.line};
      --accent: ${colors.accent};
      --accent2: ${colors.accent2};
      --soft: ${colors.soft};
      --radius: 26px;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      font-family: Arial, Helvetica, sans-serif;
      background: var(--bg);
      color: var(--ink);
      line-height: 1.7;
    }

    .book {
      max-width: 960px;
      margin: 0 auto;
      padding: 32px 20px 60px;
    }

    .page {
      background: var(--paper);
      border-radius: var(--radius);
      box-shadow: 0 22px 60px rgba(0,0,0,0.09);
      overflow: hidden;
      margin-bottom: 28px;
      border: 1px solid rgba(0,0,0,0.04);
    }

    .cover {
      position: relative;
      min-height: 1180px;
      color: white;
      display: flex;
      align-items: end;
      justify-content: center;
      text-align: center;
      padding: 50px;
      background:
        radial-gradient(circle at top right, rgba(255,255,255,0.20), transparent 18%),
        radial-gradient(circle at bottom left, rgba(255,255,255,0.14), transparent 22%),
        linear-gradient(135deg, var(--accent2), var(--accent));
      isolation: isolate;
    }

    .cover-bg-image {
      position: absolute;
      inset: 0;
      background-size: cover;
      background-position: center;
      filter: saturate(1.05) brightness(0.72);
      z-index: -2;
    }

    .cover::after {
      content: "";
      position: absolute;
      inset: 0;
      background: linear-gradient(180deg, rgba(0,0,0,0.18), rgba(0,0,0,0.52));
      z-index: -1;
    }

    .cover-card {
      width: 100%;
      max-width: 760px;
      background: rgba(255,255,255,0.12);
      border: 1px solid rgba(255,255,255,0.25);
      border-radius: 28px;
      padding: 34px 34px 40px;
      backdrop-filter: blur(12px);
      box-shadow: 0 18px 40px rgba(0,0,0,0.22);
    }

    .brand {
      font-weight: bold;
      font-size: 20px;
      letter-spacing: 1px;
      margin-bottom: 10px;
    }

    .tag {
      display: inline-block;
      padding: 8px 16px;
      border-radius: 999px;
      background: rgba(255,255,255,0.16);
      border: 1px solid rgba(255,255,255,0.26);
      margin-bottom: 22px;
      font-size: 14px;
    }

    .cover h1 {
      font-size: 52px;
      line-height: 1.16;
      margin: 0 0 14px;
      text-transform: uppercase;
    }

    .cover h2 {
      margin: 0 0 18px;
      font-size: 24px;
      font-weight: normal;
      opacity: 0.98;
    }

    .cover .meta {
      margin-top: 18px;
      font-size: 16px;
      opacity: 0.97;
    }

    .simple-page {
      padding: 36px 40px 42px;
    }

    .simple-page h2 {
      margin: 0 0 12px;
      color: var(--accent2);
      font-size: 34px;
    }

    .intro-block {
      background: var(--soft);
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 22px;
      margin-top: 18px;
    }

    .toc-grid {
      display: grid;
      gap: 12px;
      margin-top: 24px;
    }

    .toc-item {
      display: flex;
      gap: 14px;
      align-items: center;
      padding: 16px 18px;
      border: 1px solid var(--line);
      border-radius: 16px;
      background: #fff;
    }

    .toc-num {
      width: 38px;
      height: 38px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--accent), var(--accent2));
      color: white;
      font-weight: bold;
      flex-shrink: 0;
    }

    .toc-title {
      font-size: 18px;
      font-weight: bold;
      color: var(--ink);
    }

    .chapter {
      padding: 34px 34px 40px;
    }

    .chapter-badge {
      display: inline-block;
      font-size: 13px;
      font-weight: bold;
      color: var(--accent2);
      letter-spacing: 1px;
      margin-bottom: 12px;
    }

    .chapter h2 {
      margin: 0 0 14px;
      font-size: 40px;
      line-height: 1.15;
      color: var(--accent2);
    }

    .verse-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 24px;
    }

    .pill {
      display: inline-flex;
      align-items: center;
      padding: 8px 14px;
      border-radius: 999px;
      background: #fff;
      border: 1px solid var(--line);
      color: var(--accent2);
      font-size: 14px;
      font-weight: bold;
    }

    .chapter-image {
      margin-bottom: 22px;
      border: 1px solid var(--line);
      border-radius: 22px;
      overflow: hidden;
      background: #faf7f1;
    }

    .chapter-image img {
      width: 100%;
      display: block;
      aspect-ratio: 16 / 9;
      object-fit: cover;
    }

    .chapter-opening,
    .content-block,
    .reflection-box,
    .prayer-box,
    .questions-box {
      margin-top: 18px;
      padding: 22px;
      border-radius: 18px;
      border: 1px solid var(--line);
      background: #fff;
    }

    .content-block h3,
    .reflection-box h3,
    .prayer-box h3,
    .questions-box h3 {
      margin: 0 0 10px;
      font-size: 24px;
      color: var(--accent2);
    }

    .quote-box {
      margin: 20px 0 0;
      padding: 24px 26px;
      border-left: 6px solid var(--accent);
      border-radius: 18px;
      background: linear-gradient(180deg, #fffdf8, #fbf6ed);
      color: var(--accent2);
      font-size: 22px;
      font-weight: bold;
    }

    .qa-item + .qa-item {
      margin-top: 14px;
      padding-top: 14px;
      border-top: 1px dashed var(--line);
    }

    .qa-q {
      font-weight: bold;
      margin-bottom: 6px;
    }

    .footer-note {
      margin-top: 18px;
      font-size: 13px;
      color: var(--muted);
    }

    .end-note {
      background: linear-gradient(180deg, #fffdf9, #f7efe3);
    }

    @media print {
      body {
        background: white;
      }
      .book {
        max-width: none;
        padding: 0;
      }
      .page {
        margin: 0 0 10mm 0;
        box-shadow: none;
        border-radius: 0;
        border: 0;
      }
      .page-break {
        page-break-before: always;
      }
    }
  </style>
</head>
<body>
  <main class="book">

    <section class="page cover">
      ${coverImageLayer}
      <div class="cover-card">
        <div class="brand">VERBO IA</div>
        <div class="tag">${escapeHtml(form.tipoMaterial)}</div>
        <h1>${escapeHtml(ebook.title)}</h1>
        <h2>${escapeHtml(ebook.subtitle)}</h2>
        <div class="meta"><strong>Tema:</strong> ${escapeHtml(form.temaPrincipal)}</div>
        <div class="meta"><strong>Texto bíblico base:</strong> ${escapeHtml(form.textoBiblicoBase)}</div>
        ${form.autor ? `<div class="meta"><strong>Autor / Comentarista:</strong> ${escapeHtml(form.autor)}</div>` : ''}
        ${form.editoraMinisterio ? `<div class="meta"><strong>Editora / Ministério:</strong> ${escapeHtml(form.editoraMinisterio)}</div>` : ''}
        ${form.publicoAlvo ? `<div class="meta"><strong>Público-alvo:</strong> ${escapeHtml(form.publicoAlvo)}</div>` : ''}
      </div>
    </section>

    <section class="page simple-page">
      <h2>Apresentação</h2>
      ${textToHtmlParagraphs(ebook.shortDescription)}
      <div class="intro-block">
        ${textToHtmlParagraphs(ebook.introduction)}
      </div>
      <div class="footer-note">Material gerado no VERBO IA • pronto para leitura, impressão e PDF.</div>
    </section>

    <section class="page simple-page">
      <h2>Sumário</h2>
      ${textToHtmlParagraphs(ebook.summaryIntro)}
      <div class="toc-grid">
        ${summaryItems}
      </div>
    </section>

    ${chapterHtml}

    <section class="page simple-page end-note page-break">
      <h2>Conclusão</h2>
      ${textToHtmlParagraphs(ebook.conclusion)}
    </section>
  </main>
</body>
</html>
  `;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido.' });
    return;
  }

  if (!process.env.GEMINI_API_KEY) {
    res.status(500).json({
      error: 'A variável GEMINI_API_KEY não foi encontrada.'
    });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const form = normalizeForm(body || {});
    const ebook = await generateStructuredEbook(form);

    if (form.gerarCapa) {
      ebook.coverImage = await generateImage(
        ebook.coverImagePrompt || `Capa editorial cristã para o tema ${form.temaPrincipal}`,
        '2:3',
        form.estiloVisual,
        'Capa'
      );
    } else {
      ebook.coverImage = '';
    }

    if (form.gerarIlustracoes) {
      for (const chapter of ebook.chapters) {
        chapter.image = await generateImage(
          chapter.illustrationPrompt || `Ilustração do capítulo ${chapter.title}`,
          '16:9',
          form.estiloVisual,
          `Capítulo ${chapter.number}`
        );
      }
    } else {
      for (const chapter of ebook.chapters) {
        chapter.image = buildFallbackSvg(
          `Ilustração desativada para o capítulo "${chapter.title}".`,
          form.estiloVisual,
          `Capítulo ${chapter.number}`
        );
      }
    }

    const html = buildHtml(ebook, form);

    res.status(200).json({
      ok: true,
      ebook,
      html
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error.message || 'Erro interno ao gerar material.'
    });
  }
};
