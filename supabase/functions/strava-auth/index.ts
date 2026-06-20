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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET) {
      return new Response(JSON.stringify({ error: 'strava_credentials_missing' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { code, user_email } = await req.json();
    if (!code || !user_email) {
      return new Response(JSON.stringify({ error: 'missing code or user_email' }), {
        status: 400, headers: corsHeaders
      });
    }

    const tokenRes = await fetch('https://www.strava.com/api/v3/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: STRAVA_CLIENT_ID,
        client_secret: STRAVA_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code'
      })
    });

    if (!tokenRes.ok) {
      const txt = await tokenRes.text();
      return new Response(JSON.stringify({ error: 'strava_token_error', detail: txt }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const tokenData = await tokenRes.json();
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

    await sb.from('strava_tokens').upsert({
      user_email,
      athlete_id: tokenData.athlete?.id || null,
      athlete_name: tokenData.athlete?.firstname + ' ' + (tokenData.athlete?.lastname || ''),
      athlete_avatar: tokenData.athlete?.profile_medium || null,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: new Date(tokenData.expires_at * 1000).toISOString(),
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_email' });

    return new Response(JSON.stringify({
      ok: true,
      athlete: {
        id: tokenData.athlete?.id,
        name: (tokenData.athlete?.firstname || '') + ' ' + (tokenData.athlete?.lastname || ''),
        avatar: tokenData.athlete?.profile_medium
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
