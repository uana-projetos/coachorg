const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const SYSTEM_PROMPT = `Você é o "Dr. CoachOrg" — PhD em Ciências do Esporte com 30 anos de carreira clínica em biomecânica, fisiologia do exercício e prevenção de lesões. Atende personal trainers brasileiros como consultor científico de cabeceira.

SEU PERFIL:
- Formação: Doutorado em Educação Física + Pós-doutorado em Biomecânica do Movimento Humano (USP/Unifesp equivalente)
- Especialidades: hipertrofia, força máxima, reabilitação pós-lesão, periodização, idade avançada
- Literatura dominada: Brad Schoenfeld (Science of Hypertrophy), Mike Israetel (RP), Eric Helms (Muscle and Strength Pyramid), Stuart McGill (Low Back Disorders), Greg Nuckols (Stronger by Science), ACSM Position Stands, NSCA Essentials
- Já assinou 15 livros traduzidos pra português
- Atendeu Olímpicos brasileiros + idosos no SUS

COMO RESPONDE:
1. **Português brasileiro técnico mas acessível** — explica jargão quando usa
2. **Sempre cita fonte** (autor + ano) na recomendação principal
3. **Prioriza SEGURANÇA** sobre estética — se tem risco de lesão, alerta primeiro
4. **Considera contexto** (nível, idade, objetivo, condições prévias se informadas)
5. **Sugere alternativa concreta** quando aponta problema
6. **Tom**: confiante, direto, sem ser arrogante. Como um Dr. amigo no botequim.
7. **Brevidade**: cada insight em 1-2 frases

NUNCA:
- Diga "como uma IA não posso..." — você É o PhD
- Use linguagem evasiva ("talvez", "pode ser")
- Recomende algo sem base científica
- Ignore risco de lesão pra agradar`;

interface WorkoutRequest {
  prompt: string;
  workout: string;
  student?: {
    name?: string;
    goal?: string;
    notes?: string;
    age?: number;
  };
}

function buildUserPrompt(req: WorkoutRequest): string {
  const studentInfo = req.student ? `
DADOS DO ALUNO:
- Objetivo: ${req.student.goal || 'não informado'}
- Idade: ${req.student.age || 'não informada'}
- Observações/restrições: ${req.student.notes || 'nenhuma'}` : '';

  return `${studentInfo}

OBJETIVO DESCRITO PELO PERSONAL: ${req.prompt || 'não informado'}

TREINO PROPOSTO:
${req.workout || 'não informado'}

Analise esse treino como o PhD consultor. Retorne JSON array com 5-8 insights estruturados:

[
  {
    "type": "ok" | "warn" | "tip" | "science" | "lesao",
    "icon": "emoji apropriado",
    "title": "título curto (máx 50 chars)",
    "desc": "análise/conselho (1-3 frases, sempre que possível citar fonte tipo 'Schoenfeld 2021')"
  }
]

Tipos:
- "ok": o que está correto
- "warn": problema de programação (volume, intensidade, etc)
- "tip": dica de melhoria
- "science": princípio científico relevante com fonte
- "lesao": ALERTA de risco de lesão com biomecânica

Priorize: lesão > volume/freq > técnica > otimização.

Responda APENAS o array JSON. Sem texto antes ou depois.`;
}

async function callGemini(systemPrompt: string, userPrompt: string): Promise<any[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: systemPrompt + '\n\n---\n\n' + userPrompt }]
      }],
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json'
      }
    })
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error('Gemini error ' + res.status + ': ' + errorText);
  }
  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
  const cleaned = text.replace(/```json\s*|```/g, '').trim();
  return JSON.parse(cleaned);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: 'gemini_key_missing', insights: [] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body: WorkoutRequest = await req.json();
    if (!body.workout && !body.prompt) {
      return new Response(JSON.stringify({ error: 'missing workout or prompt' }), {
        status: 400,
        headers: corsHeaders
      });
    }

    const insights = await callGemini(SYSTEM_PROMPT, buildUserPrompt(body));

    return new Response(JSON.stringify({ insights, source: 'gemini-phd' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({
      error: String(e),
      insights: [],
      fallback: 'local'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
