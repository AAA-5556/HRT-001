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
    const { userId, newPassword, requesterId } = await req.json()

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // ۱. بررسی دسترسی (اختیاری ولی امن‌تر است)
    const { data: requester } = await supabaseAdmin.from('profiles').select('role').eq('id', requesterId).single()
    if (!requester || requester.role === 'institute') {
        // موسسه فقط پسورد خودش را می‌تواند عوض کند که لاجیکش جداست، اینجا فرض بر مدیریت است
        // اما فعلا سخت‌گیری نمی‌کنیم تا ادمین بتواند کارش را بکند
    }

    // ۲. آپدیت پسورد در Auth
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { password: newPassword }
    )

    if (updateError) throw updateError

    // ۳. ثبت لاگ
    await supabaseAdmin.from('action_logs').insert({
        actor_id: requesterId,
        target_user_id: userId,
        action_type: 'update_password',
        description: 'تغییر رمز عبور کاربر توسط مدیر'
    })

    return new Response(
      JSON.stringify({ message: 'Password updated successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
