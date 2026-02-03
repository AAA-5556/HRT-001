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
        const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
        if (authError || !user) throw new Error("Unauthorized: Invalid token");

        const { username, password, impersonatedUserId } = await req.json();

        const supabaseAdmin = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        const realUserProfile = await getProfile(supabaseAdmin, user.id);
        let effectiveUser = realUserProfile;

        // If impersonating, verify permission
        if (impersonatedUserId && impersonatedUserId !== user.id) {
            if (realUserProfile.role !== 'root' && realUserProfile.role !== 'superadmin') {
                throw new Error("Unauthorized impersonation attempt.");
            }
            const targetProfile = await getProfile(supabaseAdmin, impersonatedUserId);
            // Check if target is in real user's hierarchy
            if (realUserProfile.role !== 'root') {
                if (!targetProfile.hierarchy_path?.includes(user.id)) {
                    throw new Error("You cannot impersonate this user.");
                }
            }
            effectiveUser = targetProfile;
        }

        // Securely determine the new user's role on the server
        let newUserRole = '';
        switch (effectiveUser.role) {
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

        // Email-like username for Supabase Auth
        const email = `${username.toLowerCase()}@system.bir`;

        const { data: authData, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
            email: email,
            password: password,
            email_confirm: true,
            user_metadata: { username: username }
        });

        if (createUserError) {
            if (createUserError.message.includes("already registered")) {
                throw new Error(`User '${username}' already exists.`);
            }
            throw createUserError;
        }

        const newUserId = authData.user.id;

        // Calculate hierarchy path
        const parentPath = effectiveUser.hierarchy_path ? `${effectiveUser.hierarchy_path}.` : "";
        const newHierarchyPath = `${parentPath}${newUserId}`;

        const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .insert({
                id: newUserId,
                username: username,
                role: newUserRole,
                created_by: effectiveUser.id,
                hierarchy_path: newHierarchyPath,
                status: 'active'
            });

        if (profileError) {
            await supabaseAdmin.auth.admin.deleteUser(newUserId);
            throw profileError;
        }

        // Log the action
        await supabaseAdmin.from('action_logs').insert({
            actor_id: user.id,
            impersonated_user_id: effectiveUser.id !== user.id ? effectiveUser.id : null,
            target_user_id: newUserId,
            action_type: 'create_user',
            description: `ساخت کاربر جدید ${username} با نقش ${newUserRole}`
        });

        return new Response(JSON.stringify({
            message: "User created successfully",
            userId: newUserId,
            role: newUserRole,
            hierarchy_path: newHierarchyPath
        }), {
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
