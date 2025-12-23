// Import necessary libraries
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// Helper function to get the creator's profile
async function getCreatorProfile(supabase: SupabaseClient, creatorId: string) {
    const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', creatorId)
        .single();
    if (error) throw new Error(`Failed to get creator profile: ${error.message}`);
    return data;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }
    try {
        const { username, password, creatorId, originalUserId } = await req.json();
        const effectiveCreatorId = originalUserId || creatorId;

        // Create a Supabase client with the service role key
        const supabaseAdmin = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        // Determine the new user's role based on the creator's role
        const creatorProfile = await getCreatorProfile(supabaseAdmin, effectiveCreatorId);
        let newUserRole = '';
        switch (creatorProfile.role) {
            case 'root':
                newUserRole = 'superadmin';
                break;
            case 'superadmin':
                newUserRole = 'admin';
                break;
            case 'admin':
                newUserRole = 'institute';
                break;
            default:
                throw new Error('Unauthorized user creation attempt.');
        }

        // 1. Create the user in auth.users
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: username,
            password: password,
            email_confirm: true, // Auto-confirm the email
        });

        if (authError) throw authError;
        const newUserId = authData.user.id;
        let institutionId = null;

        // 2. Create an institution if the new user is an institute
        if (newUserRole === 'institute') {
            const { data: instData, error: instError } = await supabaseAdmin
                .from('institutions')
                .insert({ name: username, created_by: creatorId, is_active: true })
                .select('id')
                .single();
            if (instError) {
                await supabaseAdmin.auth.admin.deleteUser(newUserId);
                throw instError;
            }
            institutionId = instData.id;
        }

        // 3. Create the user's profile
        const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .upsert({
                id: newUserId,
                username: username,
                role: newUserRole,
                created_by: creatorId,
                institution_id: institutionId,
            });

        if (profileError) {
            await supabaseAdmin.auth.admin.deleteUser(newUserId);
            if (institutionId) {
                await supabaseAdmin.from('institutions').delete().eq('id', institutionId);
            }
            throw profileError;
        }

        return new Response(JSON.stringify({ message: "User created successfully", userId: newUserId, role: newUserRole }), {
            headers: { "Content-Type": "application/json" },
            status: 200,
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { "Content-Type": "application/json" },
            status: 400,
        });
    }
});
