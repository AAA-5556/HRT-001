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

    const { impersonatedUserId } = await req.json();

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

    let superadminCount = 0;
    let adminCount = 0;
    let institutionCount = 0;
    let activeUsers = 0;

    if (effectiveUserRole === 'root') {
        const { count: sa } = await supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'superadmin');
        const { count: a } = await supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'admin');
        const { count: i } = await supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'institute');
        const { count: active } = await supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).eq('status', 'active');
        superadminCount = sa || 0;
        adminCount = a || 0;
        institutionCount = i || 0;
        activeUsers = active || 0;
    } else if (effectiveUserRole === 'superadmin') {
        const { count: a } = await supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'admin').eq('created_by', effectiveUserId);
        const { count: i } = await supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'institute').like('hierarchy_path', `%${effectiveUserId}%`);
        adminCount = a || 0;
        institutionCount = i || 0;
        activeUsers = (a || 0) + (i || 0);
    } else if (effectiveUserRole === 'admin') {
        const { count: i } = await supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'institute').eq('created_by', effectiveUserId);
        institutionCount = i || 0;
        activeUsers = i || 0;
    }

    const stats = {
        superadminCount,
        adminCount,
        institutionCount,
        activeUsers
    };

    return new Response(JSON.stringify(stats), {
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
