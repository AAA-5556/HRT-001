// supabase-client.js

// These are the real credentials for the user's Supabase project.
const SUPABASE_URL = 'https://lezdnplqsgyehfrkpmlx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxlemRucGxxc2d5ZWhmcmtwbWx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY1MzUwOTAsImV4cCI6MjA4MjExMTA5MH0.O1aSmQ6ZihzlJ70Nxqgm9PsysYelwsdp6b0yh-ntCm4';

/**
 * Creates a new Supabase client instance.
 *
 * The `supabase` global object is made available by the Supabase CDN script.
 * We are calling the `createClient` function on that global object and then
 * overwriting the global `supabase` variable with the initialized client instance.
 * This is the recommended pattern and makes the initialized client available to all
 * subsequent scripts.
 */
window.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
