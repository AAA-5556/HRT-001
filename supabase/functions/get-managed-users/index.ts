// Import necessary libraries
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    const authHeader = req.headers.get('Authorization')!;
    const supabaseClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: realUser }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !realUser) throw new Error("Unauthorized");

    const { targetRole, impersonatedUserId } = await req.json();

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: realUserProfile } = await supabaseAdmin.from('profiles').select('*').eq('id', realUser.id).single();
    let effectiveUserId = realUser.id;
    let effectiveUserRole = realUserProfile.role;

    if (impersonatedUserId && impersonatedUserId !== realUser.id) {
        if (realUserProfile.role !== 'root' && realUserProfile.role !== 'superadmin') {
            throw new Error("Unauthorized impersonation.");
        }
        const { data: targetProfile } = await supabaseAdmin.from('profiles').select('*').eq('id', impersonatedUserId).single();
        if (realUserProfile.role !== 'root' && !targetProfile.hierarchy_path?.includes(realUser.id)) {
            throw new Error("You cannot impersonate this user.");
        }
        effectiveUserId = impersonatedUserId;
        effectiveUserRole = targetProfile.role;
    }

    // Logic: Return users where created_by is effectiveUserId and role is targetRole
    // EXCEPT for root who can see all superadmins even if not created by them (though usually root creates them)

    let query = supabaseAdmin
      .from('profiles')
      .select('id, username, created_at, status')
      .eq('role', targetRole);

    if (effectiveUserRole === 'root' && targetRole === 'superadmin') {
        // Root sees all superadmins
    } else {
        query = query.eq('created_by', effectiveUserId);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    return new Response(JSON.stringify(data), {
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
