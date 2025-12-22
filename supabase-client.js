// supabase-client.js

// These are the real credentials for the user's Supabase project.
const SUPABASE_URL = 'https://ndkclrxdkbclesxiyntk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ka2Nscnhka2JjbGVzeGl5bnRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzNzQ3MDQsImV4cCI6MjA4MTk1MDcwNH0.7UdAqUu1FRp-cSaIA1Q-xO89-OPaFE2CVSESnkLaHdE';

/**
 * Creates a new Supabase client instance.
 *
 * The `supabase` global object is made available by the Supabase CDN script.
 * We are calling the `createClient` function on that global object and then
 * overwriting the global `supabase` variable with the initialized client instance.
 * This is the recommended pattern and makes the initialized client available to all
 * subsequent scripts.
 */
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
