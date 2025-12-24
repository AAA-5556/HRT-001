// Import necessary libraries
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Authorization check: Ensure the requester has the authority to delete the target user
async function canDeleteUser(supabase: SupabaseClient, requesterId: string, targetUserId: string) {
    // First, get the requester's profile to determine their role
    const { data: requesterProfile, error: requesterError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', requesterId)
        .single();

    if (requesterError) throw new Error("Could not verify requester's permissions.");

    // Root can delete anyone (except themselves)
    if (requesterProfile.role === 'root' && requesterId !== targetUserId) return true;

    // Now, get the target user's profile to check the 'created_by' relationship
    const { data: targetProfile, error: targetError } = await supabase
        .from('profiles')
        .select('created_by')
        .eq('id', targetUserId)
        .single();

    if (targetError) throw new Error("Could not find the target user.");

    // Check if the requester is the one who created the target user
    return targetProfile.created_by === requesterId;
}


serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    const { userId, requesterId } = await req.json();

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const isAuthorized = await canDeleteUser(supabaseAdmin, requesterId, userId);
    if (!isAuthorized) {
        throw new Error("You are not authorized to delete this user.");
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw error;

    return new Response(JSON.stringify({ message: "User deleted successfully" }), {
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
