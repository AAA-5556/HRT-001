// supabase-client.js

// These are the real credentials for the user's Supabase project.
const SUPABASE_URL = 'https://krrxpljixdorkwcqtglc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtycnhwbGppeGRvcmt3Y3F0Z2xjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTU4NDEwMjAsImV4cCI6MjAzMTQxNzAyMH0.09-v4i2ceD6WjN2C-VBnO2YtD3y-y5B-F1I2u22-9-Q';

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
