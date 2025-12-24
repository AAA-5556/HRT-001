// شروع شبیه‌سازی: وقتی روت یا سوپرادمین دکمه "ورود به حساب" را می‌زند
async function startImpersonation(targetUserId, targetUsername, targetRole) {
    // جلوگیری از شبیه‌سازی تو در تو
    if (localStorage.getItem('impersonationActive')) {
        alert('شما در حال حاضر در یک جلسه شبیه‌سازی هستید. ابتدا خارج شوید.');
        return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // دریافت نقش واقعی کاربر جاری
    const { data: myProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    // ذخیره وضعیت واقعی در حافظه مرورگر
    localStorage.setItem('impersonationActive', 'true');
    localStorage.setItem('realUserId', user.id);
    localStorage.setItem('realUserRole', myProfile.role);
    
    // ذخیره وضعیت جعلی (کسی که ادایش را در می‌آوریم)
    localStorage.setItem('impersonatedUserId', targetUserId);
    localStorage.setItem('impersonatedRole', targetRole);
    localStorage.setItem('impersonatedUsername', targetUsername);

    // ثبت لاگ در سرور
    await supabase.from('action_logs').insert({
        actor_id: user.id,
        impersonated_user_id: targetUserId,
        action_type: 'start_impersonation',
        description: `شروع شبیه‌سازی کاربر ${targetUsername}`
    });

    // هدایت به صفحه مربوطه
    redirectBasedOnRole(targetRole);
}

// پایان شبیه‌سازی: دکمه "خروج از حالت مشاهده"
async function stopImpersonation() {
    const realUserId = localStorage.getItem('realUserId');
    const realUserRole = localStorage.getItem('realUserRole');
    const targetUserId = localStorage.getItem('impersonatedUserId');

    if (!realUserId) return;

    // ثبت لاگ پایان
    await supabase.from('action_logs').insert({
        actor_id: realUserId,
        impersonated_user_id: targetUserId,
        action_type: 'stop_impersonation',
        description: 'پایان شبیه‌سازی'
    });

    // پاک کردن حافظه
    localStorage.removeItem('impersonationActive');
    localStorage.removeItem('realUserId');
    localStorage.removeItem('realUserRole');
    localStorage.removeItem('impersonatedUserId');
    localStorage.removeItem('impersonatedRole');
    localStorage.removeItem('impersonatedUsername');

    // بازگشت به پنل اصلی
    redirectBasedOnRole(realUserRole);
}

// نمایش بنر بالای صفحه وقتی در حالت شبیه‌سازی هستیم
function initImpersonationUI() {
    const isImpersonating = localStorage.getItem('impersonationActive');
    const targetName = localStorage.getItem('impersonatedUsername');

    if (isImpersonating && targetName) {
        const banner = document.createElement('div');
        banner.style.cssText = `
            background-color: #ff9800; color: white; padding: 10px; 
            text-align: center; position: sticky; top: 0; z-index: 1000;
            display: flex; justify-content: center; align-items: center; gap: 15px;
            font-weight: bold; box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        `;
        banner.innerHTML = `
            <span>⚠️ شما در حال مشاهده پنل کاربر «${targetName}» هستید.</span>
            <button id="stop-impersonation-btn" style="background: white; color: #e65100; border: none; padding: 5px 15px; border-radius: 4px; cursor: pointer;">خروج از مشاهده</button>
        `;
        document.body.prepend(banner);

        document.getElementById('stop-impersonation-btn').addEventListener('click', stopImpersonation);
    }
}

// تابع کمکی برای دریافت ID معتبر (اگر شبیه‌سازی باشد، ID هدف را می‌دهد، وگرنه ID خودمان)
function getEffectiveUserId(currentUserId) {
    const impersonatedId = localStorage.getItem('impersonatedUserId');
    return impersonatedId ? impersonatedId : currentUserId;
}

function redirectBasedOnRole(role) {
    if (role === 'root') window.location.href = 'root.html';
    else if (role === 'superadmin') window.location.href = 'superadmin.html';
    else if (role === 'admin') window.location.href = 'admin.html';
    else if (role === 'institute') window.location.href = 'attendance.html';
}
