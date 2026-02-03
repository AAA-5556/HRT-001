import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // دریافت تعداد کاربران از هر نقش
    const { count: superadminCount } = await supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'superadmin')
    const { count: adminCount } = await supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'admin')
    const { count: institutionCount } = await supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'institute')
    
    // تعداد کل اعضای فعال (مددجویان)
    const { count: membersCount } = await supabaseAdmin.from('members').select('*', { count: 'exact', head: true }).eq('is_active', true)

    const stats = {
      superadminCount: superadminCount || 0,
      adminCount: adminCount || 0,
      institutionCount: institutionCount || 0,
      activeUsers: membersCount || 0
    }

    return new Response(
      JSON.stringify(stats),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
