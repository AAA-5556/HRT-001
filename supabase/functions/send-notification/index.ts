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

    const { data: { user: realUser }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !realUser) throw new Error("Unauthorized");

    const { title, message, recipientId, isBroadcast, impersonatedUserId } = await req.json();

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: profile } = await supabaseAdmin.from('profiles').select('*').eq('id', realUser.id).single();
    let effectiveUserId = realUser.id;
    let effectiveUserRole = profile.role;

    if (impersonatedUserId && impersonatedUserId !== realUser.id) {
        const { data: targetProfile } = await supabaseAdmin.from('profiles').select('*').eq('id', impersonatedUserId).single();
        effectiveUserId = impersonatedUserId;
        effectiveUserRole = targetProfile.role;
    }

    if (isBroadcast) {
        // Broadcast logic based on hierarchy
        let query = supabaseAdmin.from('profiles').select('id');
        if (effectiveUserRole === 'root') {
            // Root sends to everyone
        } else if (effectiveUserRole === 'superadmin') {
            query = query.like('hierarchy_path', `%${effectiveUserId}%`);
        } else if (effectiveUserRole === 'admin') {
            query = query.eq('created_by', effectiveUserId);
        } else {
            throw new Error("Institutes cannot broadcast.");
        }

        const { data: recipients } = await query;
        if (recipients) {
            const notifications = recipients.map(r => ({
                recipient_id: r.id,
                sender_id: realUser.id,
                title,
                message
            }));
            await supabaseAdmin.from('notifications').insert(notifications);
        }
    } else {
        // Direct notification
        await supabaseAdmin.from('notifications').insert({
            recipient_id: recipientId,
            sender_id: realUser.id,
            title,
            message
        });
    }

    return new Response(JSON.stringify({ message: "Notification(s) sent" }), {
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
