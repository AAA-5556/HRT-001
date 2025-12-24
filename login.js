document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const errorMessage = document.getElementById('error-message');
    const loginButton = document.getElementById('login-button');

    // اگر کاربر قبلاً لاگین کرده
    async function checkSession() {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            checkStatusAndRedirect(session.user.id);
        }
    }

    // تابع اصلی هدایت (با چک کردن وضعیت فعال/آرشیو)
    async function checkStatusAndRedirect(userId) {
        loginButton.textContent = 'در حال بررسی وضعیت...';
        
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (error || !profile) {
            errorMessage.textContent = 'خطا در دریافت پروفایل.';
            await supabase.auth.signOut();
            loginButton.disabled = false;
            loginButton.textContent = 'ورود';
            return;
        }

        // --- بخش امنیتی جدید: جلوگیری از ورود آرشیو شده‌ها ---
        if (profile.status === 'archived' || profile.status === 'suspended') {
            errorMessage.textContent = 'حساب کاربری شما مسدود یا بایگانی شده است.';
            errorMessage.style.color = 'red';
            await supabase.auth.signOut(); // اخراج فوری
            loginButton.disabled = false;
            loginButton.textContent = 'ورود';
            return;
        }

        // اگر فعال بود، برو داخل
        switch (profile.role) {
            case 'root': window.location.href = 'root.html'; break;
            case 'superadmin': window.location.href = 'superadmin.html'; break;
            case 'admin': window.location.href = 'admin.html'; break;
            case 'institute': window.location.href = 'attendance.html'; break;
            default: errorMessage.textContent = 'نقش نامعتبر.';
        }
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorMessage.textContent = '';
        loginButton.disabled = true;
        loginButton.textContent = 'در حال اعتبارسنجی...';

        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();
        const email = `${username}@system.bir`;

        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) {
            errorMessage.textContent = 'نام کاربری یا رمز عبور اشتباه است.';
            loginButton.disabled = false;
            loginButton.textContent = 'ورود';
        } else {
            checkStatusAndRedirect(data.user.id);
        }
    });

    checkSession();
});
