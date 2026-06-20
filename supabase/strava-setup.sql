-- Tabela pra armazenar tokens Strava por usuário
create table if not exists strava_tokens (
  user_email text primary key,
  athlete_id bigint,
  athlete_name text,
  athlete_avatar text,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table strava_tokens enable row level security;

create policy "user reads own strava tokens" on strava_tokens
  for select using (auth.jwt() ->> 'email' = user_email);
