// شروع شبیه‌سازی (هوشمند و تو در تو)
async function startImpersonation(targetUserId, targetUsername, targetRole) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // بررسی وضعیت فعلی
    const isAlreadyImpersonating = localStorage.getItem('impersonationActive');
    let realUserId = user.id;
    let realUserRole = '';

    if (isAlreadyImpersonating) {
        // اگر الان در حال شبیه‌سازی هستیم، شناسه واقعی را از حافظه می‌خوانیم
        realUserId = localStorage.getItem('realUserId');
        realUserRole = localStorage.getItem('realUserRole');
        
        // لاجیک امنیتی: فقط روت یا سوپرادمین اجازه پرش دارند
        if (realUserRole !== 'root' && realUserRole !== 'superadmin') {
            alert('شما اجازه تغییر هویت مجدد ندارید.');
            return;
        }
    } else {
        // اگر بار اول است، نقش واقعی را از دیتابیس می‌گیریم
        const { data: myProfile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();
        realUserRole = myProfile.role;
        
        // ذخیره هویت اصلی برای بازگشت
        localStorage.setItem('impersonationActive', 'true');
        localStorage.setItem('realUserId', realUserId);
        localStorage.setItem('realUserRole', realUserRole);
    }

    // آپدیت کردن هویت جعلی (هدف جدید)
    localStorage.setItem('impersonatedUserId', targetUserId);
    localStorage.setItem('impersonatedRole', targetRole);
    localStorage.setItem('impersonatedUsername', targetUsername);

    // ثبت لاگ (می‌گوییم کاربر واقعی، وارد جلد کاربر هدف شد)
    await supabase.from('action_logs').insert({
        actor_id: realUserId, // همیشه روت (یا کاربر اصلی) ثبت می‌شود
        impersonated_user_id: targetUserId,
        action_type: 'start_impersonation',
        description: `شبیه‌سازی کاربر ${targetUsername} (تغییر سطح)`
    });

    // هدایت به پنل مربوطه
    redirectBasedOnRole(targetRole);
}

// پایان شبیه‌سازی (بازگشت به اصل)
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
        description: 'خروج از حالت شبیه‌سازی'
    });

    // پاک کردن تمام حافظه شبیه‌سازی
    localStorage.removeItem('impersonationActive');
    localStorage.removeItem('realUserId');
    localStorage.removeItem('realUserRole');
    localStorage.removeItem('impersonatedUserId');
    localStorage.removeItem('impersonatedRole');
    localStorage.removeItem('impersonatedUsername');

    // بازگشت به پنل کاربری خودِ شخص
    redirectBasedOnRole(realUserRole);
}

function initImpersonationUI() {
    const isImpersonating = localStorage.getItem('impersonationActive');
    const targetName = localStorage.getItem('impersonatedUsername');

    if (isImpersonating && targetName) {
        // حذف بنر قبلی اگر وجود دارد (برای جلوگیری از تکرار)
        const oldBanner = document.getElementById('impersonation-banner');
        if (oldBanner) oldBanner.remove();

        const banner = document.createElement('div');
        banner.id = 'impersonation-banner';
        banner.style.cssText = `
            background-color: #ff9800; color: white; padding: 10px; 
            text-align: center; position: sticky; top: 0; z-index: 1000;
            display: flex; justify-content: center; align-items: center; gap: 15px;
            font-weight: bold; box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        `;
        banner.innerHTML = `
            <span>👀 مشاهده به عنوان: ${targetName}</span>
            <button id="stop-impersonation-btn" style="background: white; color: #e65100; border: none; padding: 5px 15px; border-radius: 4px; cursor: pointer;">خروج</button>
        `;
        document.body.prepend(banner);

        document.getElementById('stop-impersonation-btn').addEventListener('click', stopImpersonation);
    }
}

function redirectBasedOnRole(role) {
    if (role === 'root') window.location.href = 'root.html';
    else if (role === 'superadmin') window.location.href = 'superadmin.html';
    else if (role === 'admin') window.location.href = 'admin.html';
    else if (role === 'institute') window.location.href = 'attendance.html';
}

function getImpersonationData() {
    if (localStorage.getItem('impersonationActive') === 'true') {
        return {
            isImpersonating: true,
            impersonatedUserId: localStorage.getItem('impersonatedUserId'),
            impersonatedRole: localStorage.getItem('impersonatedRole'),
            realUserId: localStorage.getItem('realUserId')
        };
    }
    return { isImpersonating: false };
}
