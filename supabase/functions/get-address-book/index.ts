import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization')!;
    const supabaseClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: profile } = await supabaseAdmin.from('profiles').select('*').eq('id', user.id).single();

    // 1. Get Hierarchical Contacts
    let hQuery = supabaseAdmin.from('profiles').select('id, username, role');
    if (profile.role === 'root') {
        hQuery = hQuery.eq('role', 'superadmin');
    } else if (profile.role === 'superadmin') {
        hQuery = hQuery.or(`role.eq.admin,role.eq.root`);
    } else if (profile.role === 'admin') {
        hQuery = hQuery.or(`role.eq.institute,id.eq.${profile.created_by}`);
    } else if (profile.role === 'institute') {
        hQuery = hQuery.eq('id', profile.created_by);
    }
    const { data: hierarchical } = await hQuery;

    // 2. Get Custom Address Book Contacts
    const { data: custom } = await supabaseAdmin
        .from('address_book')
        .select('notes, contact:contact_id(id, username, role)')
        .eq('owner_id', user.id);

    return new Response(JSON.stringify({ hierarchical, custom }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
