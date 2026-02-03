// Import necessary libraries
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getProfile(supabase: SupabaseClient, userId: string) {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
    if (error) throw new Error(`Failed to get profile: ${error.message}`);
    return data;
}

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

    // Get the real user from JWT
    const { data: { user: realUser }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !realUser) throw new Error("Unauthorized");

    const { userId, impersonatedUserId } = await req.json();

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const realUserProfile = await getProfile(supabaseAdmin, realUser.id);
    let effectiveUser = realUserProfile;

    // Impersonation check
    if (impersonatedUserId && impersonatedUserId !== realUser.id) {
        if (realUserProfile.role !== 'root' && realUserProfile.role !== 'superadmin') {
            throw new Error("Unauthorized impersonation.");
        }
        const targetProfile = await getProfile(supabaseAdmin, impersonatedUserId);
        if (realUserProfile.role !== 'root' && !targetProfile.hierarchy_path?.includes(realUser.id)) {
            throw new Error("You cannot impersonate this user.");
        }
        effectiveUser = targetProfile;
    }

    const targetUserToDelete = await getProfile(supabaseAdmin, userId);

    // Authorization: Root can delete anyone except self.
    // Others can only delete their direct subordinates.
    let isAuthorized = false;
    if (effectiveUser.role === 'root' && effectiveUser.id !== userId) {
        isAuthorized = true;
    } else if (targetUserToDelete.created_by === effectiveUser.id) {
        isAuthorized = true;
    }

    if (!isAuthorized) {
        throw new Error("You are not authorized to delete this user.");
    }

    // Recursive deletion: find all users that have this user in their hierarchy path
    const { data: subordinates, error: subError } = await supabaseAdmin
        .from('profiles')
        .select('id, username')
        .like('hierarchy_path', `%${userId}%`);

    if (subError) throw subError;

    // Delete all subordinates from Auth
    for (const sub of subordinates) {
        await supabaseAdmin.auth.admin.deleteUser(sub.id);
        // Note: profiles and other data should be deleted by DB cascade or manual triggers
    }

    // Also delete the target user themselves (if not already in subordinates list)
    if (!subordinates.find(s => s.id === userId)) {
        await supabaseAdmin.auth.admin.deleteUser(userId);
    }

    // Log the action
    await supabaseAdmin.from('action_logs').insert({
        actor_id: realUser.id,
        impersonated_user_id: effectiveUser.id !== realUser.id ? effectiveUser.id : null,
        target_user_id: userId,
        action_type: 'delete_user',
        description: `حذف کاربر ${targetUserToDelete.username} و تمام زیرمجموعه‌های آن`
    });

    return new Response(JSON.stringify({ message: "User and all subordinates deleted successfully" }), {
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
