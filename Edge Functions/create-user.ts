import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // این بخش اجازه می‌دهد مرورگر درخواست بفرستد (رفع خطای CORS)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // دریافت اطلاعاتی که از فرم سایت ارسال شده (نام کاربری، رمز، شناسه سازنده)
    const { username, password, creatorId } = await req.json()

    // ساخت یک "کلید جادویی" برای دسترسی ادمین به دیتابیس
    // این خط از تنظیمات مخفی سوپابیس استفاده می‌کند
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // ۱. بررسی می‌کنیم کسی که دستور ساخت داده، چه کاره است؟ (Root؟ Superadmin؟)
    const { data: creatorProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', creatorId)
      .single()

    if (profileError || !creatorProfile) {
      throw new Error('سازنده کاربر شناسایی نشد.')
    }

    // ۲. تعیین نقش کاربر جدید بر اساس قانون سلسله مراتب
    let newRole = ''
    if (creatorProfile.role === 'root') newRole = 'superadmin'
    else if (creatorProfile.role === 'superadmin') newRole = 'admin'
    else if (creatorProfile.role === 'admin') newRole = 'institute'
    else {
      throw new Error('شما اجازه ساخت کاربر جدید ندارید.')
    }

    // ۳. چک می‌کنیم نام کاربری تکراری نباشد
    const { data: existingUser } = await supabaseAdmin
      .from('profiles')
      .select('username')
      .eq('username', username)
      .single()
    
    if (existingUser) {
      throw new Error('این نام کاربری قبلاً استفاده شده است.')
    }

    // ۴. ساخت ایمیل سیستمی (چون سوپابیس ایمیل می‌خواهد)
    const email = `${username}@system.bir`

    // ۵. دستور نهایی ساخت کاربر در سیستم امنیتی سوپابیس
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true, // ایمیل را خودکار تایید می‌کنیم
      user_metadata: { role: newRole }
    })

    if (authError) throw authError

    // ۶. ثبت اطلاعات تکمیلی در جدول پروفایل‌ها
    const { error: insertError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: authData.user.id,
        username: username,
        role: newRole,
        created_by: creatorId,
        status: 'active'
      })

    if (insertError) {
      // اگر اینجا خطا داد، کاربر ساخته شده را پاک می‌کنیم تا اطلاعات ناقص نماند
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      throw insertError
    }

    // ۷. ثبت در لاگ سیستم (که چه کسی، چه کسی را ساخت)
    await supabaseAdmin.from('action_logs').insert({
        actor_id: creatorId,
        target_user_id: authData.user.id,
        action_type: 'create_user',
        description: `کاربر ${username} با نقش ${newRole} ساخته شد.`
    })

    // پاسخ موفقیت به سایت برمی‌گردانیم
    return new Response(
      JSON.stringify({ message: 'User created successfully', role: newRole }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    // اگر هر جای کار خطا داد، پیام خطا را به سایت برمی‌گردانیم
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
