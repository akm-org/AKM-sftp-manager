-- AKM SFTP Manager Database Schema for Supabase
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/sphbqsrqotjedpskmgcx/sql/new

CREATE TABLE IF NOT EXISTS public.users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.connections (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 22,
  username TEXT NOT NULL,
  password_encrypted TEXT,
  auth_type TEXT NOT NULL DEFAULT 'password',
  private_key_encrypted TEXT,
  default_path TEXT DEFAULT '/',
  last_connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.active_sessions (
  session_id TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  host TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 22,
  username TEXT NOT NULL,
  password_encrypted TEXT,
  private_key_encrypted TEXT,
  initial_path TEXT DEFAULT '/',
  current_path TEXT DEFAULT '/',
  last_used_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_connections_user_id ON public.connections(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON public.active_sessions(user_id);

-- Disable Row Level Security (RLS) or enable service role access so backend can query
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.connections DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_sessions DISABLE ROW LEVEL SECURITY;
