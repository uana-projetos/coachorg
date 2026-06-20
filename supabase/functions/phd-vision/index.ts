const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const POSTURE_SYSTEM_PROMPT = `Você é o "Personal PhD" — PhD em Ciências do Esporte com 30 anos de carreira em biomecânica, fisiologia e prevenção de lesões.

ESPECIALISTA EM AVALIAÇÃO POSTURAL VISUAL baseado em:
- Kendall (Muscles: Testing and Function)
- Sahrmann (Diagnosis and Treatment of Movement Impairment Syndromes)
- Janda (Síndromes cruzadas superior e inferior)
- McGill (Low Back Disorders)

Avalia FOTOS de pacientes em posição anatômica de referência. Identifica:
1. Assimetrias visíveis (ombros, quadril, joelhos)
2. Desvios posturais (anteversão pélvica, hiperlordose, hipercifose, anteriorização de cabeça)
3. Vícios compensatórios (joelho valgo, pé chato/cavo)
4. Síndromes cruzadas (Janda)
5. Indicações pra fortalecimento e alongamento

REGRAS:
- Fala português brasileiro técnico mas acessível
- Cita fonte na recomendação principal (autor + ano)
- NUNCA diagnostica patologia (não é médico, é biomecânico)
- Recomenda encaminhamento médico se vir algo suspeito (escoliose severa, etc)
- Sempre sugere correção concreta (exercício específico)`;

const EXERCISE_SYSTEM_PROMPT = `Você é o "Personal PhD" — PhD em Ciências do Esporte com 30 anos de carreira em biomecânica.

ESPECIALISTA EM ANÁLISE DE EXECUÇÃO DE EXERCÍCIOS baseado em:
- Brad Schoenfeld (Science of Hypertrophy)
- Mel Siff (Supertraining)
- Greg Nuckols (Stronger by Science)
- NSCA Essentials of Strength

Avalia FOTOS ou VÍDEO-FRAMES de execução de exercício. Identifica:
1. Postura geral durante o movimento
2. Erros técnicos (joelho valgo, lombar arqueada, ombro elevado)
3. Cadeia cinética (recrutamento muscular esperado vs visível)
4. Risco de lesão imediato
5. Correção específica

REGRAS:
- Português brasileiro técnico mas acessível
- Cita fonte (autor + ano)
- Prioriza SEGURANÇA acima de tudo
- Aponta o que está CORRETO primeiro, depois corrige`;

interface VisionRequest {
  type: 'posture' | 'exercise';
  images: string[]; // base64 strings
  context?: {
    name?: string;
    age?: number;
    goal?: string;
    notes?: string;
    exerciseName?: string; // pra análise de exercício
    views?: string[]; // ex: ['frente', 'lado', 'costas']
  };
}

function buildUserPrompt(req: VisionRequest): string {
  const ctx = req.context || {};
  const ctxBlock = `
CONTEXTO DA PESSOA:
- Nome: ${ctx.name || 'não informado'}
- Idade: ${ctx.age || 'não informada'}
- Objetivo: ${ctx.goal || 'não informado'}
- Observações: ${ctx.notes || 'nenhuma'}`;

  if (req.type === 'posture') {
    const viewsText = ctx.views?.length ? `Fotos enviadas: ${ctx.views.join(', ')}` : `${req.images.length} foto(s) enviada(s)`;
    return `${ctxBlock}

${viewsText}

Analise a postura visualmente. Retorne JSON com os campos:

{
  "resumo": "1-2 frases sobre quadro geral",
  "achados": [
    {
      "regiao": "cabeça/pescoço | ombros | tronco | quadril | joelhos | pés",
      "achado": "descrição objetiva do desvio/assimetria",
      "severidade": "leve | moderado | severo",
      "impacto": "consequência funcional/risco"
    }
  ],
  "correcoes": [
    {
      "tipo": "fortalecer | alongar | mobilizar | educar",
      "musculo_grupo": "nome do grupo",
      "exercicio": "exercício específico recomendado",
      "fonte": "autor + ano"
    }
  ],
  "alerta_medico": "string vazia OU descrição se precisar encaminhamento médico",
  "score_postural": "0-10 (10 = excelente)"
}

Retorne APENAS o JSON object. Sem texto antes ou depois.`;
  }

  return `${ctxBlock}

EXERCÍCIO ANALISADO: ${ctx.exerciseName || 'não especificado'}
${req.images.length} foto(s)/frame(s) enviado(s)

Analise a execução do exercício. Retorne JSON:

{
  "resumo": "1-2 frases sobre execução geral",
  "pontos_corretos": ["o que está sendo feito bem"],
  "erros": [
    {
      "fase": "excêntrica | concêntrica | isométrica | setup",
      "erro": "descrição do erro",
      "risco": "leve | moderado | alto",
      "biomecanica": "explicação biomecânica do problema"
    }
  ],
  "correcoes": [
    {
      "cue": "instrução verbal pra dar ao aluno",
      "exercicio_acessorio": "exercício pra trabalhar o ponto fraco",
      "fonte": "autor + ano"
    }
  ],
  "score_execucao": "0-10 (10 = perfeito)"
}

Retorne APENAS o JSON. Sem texto antes ou depois.`;
}

async function callGeminiVision(systemPrompt: string, userPrompt: string, images: string[]): Promise<any> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`;

  const parts: any[] = [{ text: systemPrompt + '\n\n---\n\n' + userPrompt }];
  for (const img of images) {
    // Remove data URL prefix if present
    const base64 = img.replace(/^data:image\/\w+;base64,/, '');
    parts.push({
      inlineData: {
        mimeType: 'image/jpeg',
        data: base64
      }
    });
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json'
      }
    })
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error('Gemini Vision error ' + res.status + ': ' + errorText);
  }

  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  const cleaned = text.replace(/```json\s*|```/g, '').trim();
  return JSON.parse(cleaned);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: 'gemini_key_missing' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body: VisionRequest = await req.json();
    if (!body.images || body.images.length === 0) {
      return new Response(JSON.stringify({ error: 'no_images' }), {
        status: 400,
        headers: corsHeaders
      });
    }
    if (body.images.length > 4) {
      return new Response(JSON.stringify({ error: 'too_many_images', max: 4 }), {
        status: 400,
        headers: corsHeaders
      });
    }

    const systemPrompt = body.type === 'exercise' ? EXERCISE_SYSTEM_PROMPT : POSTURE_SYSTEM_PROMPT;
    const result = await callGeminiVision(systemPrompt, buildUserPrompt(body), body.images);

    return new Response(JSON.stringify({ ...result, source: 'gemini-phd-vision' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({
      error: String(e),
      fallback: true
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
