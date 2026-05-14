import { createClient } from '@supabase/supabase-js';

/**
 * ⚠️ WARNING: SERVICE ROLE CLIENT - WORKER ONLY
 * 
 * DO NOT IMPORT THIS IN:
 * - API routes (/app/api/**)
 * - Server components
 * - Client components
 * - Middleware
 * 
 * This bypasses ALL Row Level Security (RLS).
 * Only use in Trigger.dev background jobs.
 */

if (!process.env.SUPABASE_SERVICE_KEY) {
  throw new Error('SUPABASE_WORKER_SERVICE_ROLE_KEY not set - worker cannot start');
}

export const supabaseWorker = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);
