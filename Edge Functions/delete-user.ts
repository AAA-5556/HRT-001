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
    const { userId, requesterId } = await req.json()

    // اتصال به دیتابیس با دسترسی ادمین
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // ۱. بررسی دسترسی: چک می‌کنیم درخواست‌دهنده کیست
    const { data: requester } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', requesterId)
      .single()
    
    // اگر درخواست کننده پیدا نشد یا نقشش "موسسه" بود، اجازه ندارد
    if (!requester || requester.role === 'institute') {
      throw new Error('دسترسی غیرمجاز برای حذف کاربر.')
    }

    // ۲. حذف کاربر از سیستم Auth
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)
    
    if (deleteError) throw deleteError

    // ۳. ثبت لاگ
    await supabaseAdmin.from('action_logs').insert({
        actor_id: requesterId,
        action_type: 'delete_user',
        description: `کاربر با شناسه ${userId} حذف شد.`
    })

    return new Response(
      JSON.stringify({ message: 'User deleted successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
