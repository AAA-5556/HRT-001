document.addEventListener('DOMContentLoaded', async () => {
    // --- ۱. بررسی امنیتی (اصلاح شده) ---
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { window.location.href = 'index.html'; return; }

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
    
    // نقش‌هایی که اجازه دیدن تنظیمات را دارند
    const allowedRoles = ['root', 'superadmin', 'admin'];
    const isImpersonating = localStorage.getItem('impersonationActive');
    const effectiveRole = isImpersonating ? localStorage.getItem('impersonatedRole') : profile.role;

    // اگر نقش جزو مجازها نیست، برو بیرون
    if (!allowedRoles.includes(effectiveRole)) {
        window.location.href = 'index.html';
        return;
    }

    // تنظیم لینک بازگشت
    document.querySelector('.back-link').href = `${effectiveRole}.html`;

    // --- ۲. منطق تنظیمات ---
    const allowMemberManagementCheck = document.getElementById('allowMemberManagement');
    const allowUsernameChangeCheck = document.getElementById('allowUsernameChange');
    const allowPasswordChangeCheck = document.getElementById('allowPasswordChange');
    const saveButton = document.getElementById('save-settings-btn');
    const statusMessage = document.getElementById('settings-status');

    // دریافت شناسه صاحب تنظیمات (اگر روت باشد، تنظیمات کل را می‌بیند، اگر ادمین باشد تنظیمات خودش)
    const ownerId = isImpersonating ? localStorage.getItem('impersonatedUserId') : session.user.id;

    async function loadSettings() {
        statusMessage.textContent = 'در حال بارگذاری...';
        
        // دریافت تمام تنظیمات مربوط به این کاربر
        const { data: settings, error } = await supabase
            .from('settings')
            .select('key, value')
            .eq('owner_id', ownerId);

        if (error) { console.error(error); return; }

        // تبدیل آرایه به آبجکت برای استفاده راحت‌تر
        const config = {};
        settings.forEach(item => config[item.key] = item.value);

        // تیک زدن چک‌باکس‌ها
        if (allowMemberManagementCheck) allowMemberManagementCheck.checked = config['allowMemberManagement'] === true;
        if (allowUsernameChangeCheck) allowUsernameChangeCheck.checked = config['allowUsernameChange'] === true;
        if (allowPasswordChangeCheck) allowPasswordChangeCheck.checked = config['allowPasswordChange'] === true;
        
        statusMessage.textContent = '';
    }

    saveButton.addEventListener('click', async () => {
        saveButton.disabled = true;
        saveButton.textContent = 'در حال ذخیره...';
        
        const updates = [
            { owner_id: ownerId, key: 'allowMemberManagement', value: allowMemberManagementCheck.checked },
            { owner_id: ownerId, key: 'allowUsernameChange', value: allowUsernameChangeCheck.checked },
            { owner_id: ownerId, key: 'allowPasswordChange', value: allowPasswordChangeCheck.checked }
        ];

        const { error } = await supabase.from('settings').upsert(updates, { onConflict: 'owner_id, key' });

        if (error) {
            statusMessage.style.color = 'red';
            statusMessage.textContent = 'خطا: ' + error.message;
        } else {
            // ثبت لاگ
            await supabase.from('action_logs').insert({
                actor_id: session.user.id,
                action_type: 'update_settings',
                description: 'بروزرسانی تنظیمات سیستم'
            });
            statusMessage.style.color = 'green';
            statusMessage.textContent = 'تنظیمات ذخیره شد.';
        }
        saveButton.disabled = false;
        saveButton.textContent = 'ذخیره تنظیمات';
    });

    loadSettings();
});
