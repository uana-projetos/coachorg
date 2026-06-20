import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || '';
const STRAVA_CLIENT_ID = Deno.env.get('STRAVA_CLIENT_ID') || '';
const STRAVA_CLIENT_SECRET = Deno.env.get('STRAVA_CLIENT_SECRET') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

async function refreshToken(refresh_token: string) {
  const res = await fetch('https://www.strava.com/api/v3/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      refresh_token,
      grant_type: 'refresh_token'
    })
  });
  if (!res.ok) throw new Error('refresh_failed');
  return await res.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { user_email, days = 7 } = await req.json();
    if (!user_email) {
      return new Response(JSON.stringify({ error: 'missing user_email' }), { status: 400, headers: corsHeaders });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data: tokens } = await sb.from('strava_tokens').select('*').eq('user_email', user_email).maybeSingle();

    if (!tokens) {
      return new Response(JSON.stringify({ error: 'not_connected', activities: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let accessToken = tokens.access_token;
    const expiresAt = new Date(tokens.expires_at).getTime();
    if (expiresAt < Date.now() + 5 * 60 * 1000) {
      const refreshed = await refreshToken(tokens.refresh_token);
      accessToken = refreshed.access_token;
      await sb.from('strava_tokens').update({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        expires_at: new Date(refreshed.expires_at * 1000).toISOString(),
        updated_at: new Date().toISOString()
      }).eq('user_email', user_email);
    }

    const afterTs = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);
    const actsRes = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?after=${afterTs}&per_page=50`,
      { headers: { Authorization: 'Bearer ' + accessToken } }
    );

    if (!actsRes.ok) {
      const txt = await actsRes.text();
      return new Response(JSON.stringify({ error: 'strava_api_error', detail: txt, activities: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const acts = await actsRes.json();
    const activities = (acts || []).map((a: any) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      sport_type: a.sport_type,
      start_date: a.start_date_local,
      distance_km: a.distance ? +(a.distance / 1000).toFixed(2) : 0,
      moving_time_min: Math.round((a.moving_time || 0) / 60),
      calories: a.calories || Math.round((a.kilojoules || 0) * 0.239),
      hr_avg: a.average_heartrate || null,
      hr_max: a.max_heartrate || null,
      elevation: a.total_elevation_gain || 0
    }));

    let weekCalories = 0, weekMinutes = 0;
    activities.forEach((a: any) => {
      weekCalories += a.calories || 0;
      weekMinutes += a.moving_time_min || 0;
    });

    return new Response(JSON.stringify({
      activities,
      summary: {
        athlete_name: tokens.athlete_name,
        athlete_avatar: tokens.athlete_avatar,
        total_sessions: activities.length,
        total_calories: weekCalories,
        total_minutes: weekMinutes,
        period_days: days
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e), activities: [] }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
