document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const errorMessage = document.getElementById('error-message');
    const loginButton = document.getElementById('login-button');

    // اگر کاربر قبلاً لاگین کرده، مستقیم بفرستش داخل
    async function checkSession() {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            handleRedirect(session.user.id);
        }
    }

    async function handleRedirect(userId) {
        loginButton.textContent = 'در حال انتقال...';
        
        // دریافت نقش کاربر از جدول پروفایل‌ها
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', userId)
            .single();

        if (error || !profile) {
            errorMessage.textContent = 'خطا در دریافت اطلاعات کاربر.';
            await supabase.auth.signOut();
            return;
        }

        // هدایت بر اساس نقش
        switch (profile.role) {
            case 'root': window.location.href = 'root.html'; break;
            case 'superadmin': window.location.href = 'superadmin.html'; break;
            case 'admin': window.location.href = 'admin.html'; break;
            case 'institute': window.location.href = 'attendance.html'; break;
            default: errorMessage.textContent = 'نقش کاربری نامعتبر است.';
        }
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorMessage.textContent = '';
        loginButton.disabled = true;
        loginButton.textContent = 'در حال بررسی...';

        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();

        // ساخت ایمیل سیستمی (چون سوپابیس ایمیل می‌خواهد)
        const email = `${username}@system.bir`;

        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) {
            console.error('Login Error:', error);
            errorMessage.textContent = 'نام کاربری یا رمز عبور اشتباه است.';
            loginButton.disabled = false;
            loginButton.textContent = 'ورود';
        } else {
            handleRedirect(data.user.id);
        }
    });

    checkSession();
});
