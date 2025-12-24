document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const errorMessage = document.getElementById('error-message');
    const loginButton = document.getElementById('login-button');

    // چک کردن سشن موجود
    async function checkSession() {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            validateAndRedirect(session.user.id, false); // false یعنی: لاگ جدید ثبت نکن (چون فقط رفرش کرده)
        }
    }

    // اعتبارسنجی و هدایت (با پارامتر recordLog برای ثبت لاگین)
    async function validateAndRedirect(userId, recordLog = false) {
        loginButton.disabled = true;
        loginButton.textContent = 'در حال اعتبارسنجی...';

        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (error || !profile) {
            await supabase.auth.signOut();
            errorMessage.textContent = 'خطا در پروفایل کاربر.';
            loginButton.disabled = false;
            loginButton.textContent = 'ورود';
            return;
        }

        if (profile.status !== 'active') {
            await supabase.auth.signOut();
            errorMessage.textContent = 'حساب شما مسدود یا آرشیو شده است.';
            errorMessage.style.color = 'red';
            loginButton.disabled = false;
            loginButton.textContent = 'ورود';
            return;
        }

        // *** بخش جدید: ثبت لاگ ورود در دیتابیس ***
        if (recordLog) {
            await supabase.from('action_logs').insert({
                actor_id: userId,
                action_type: 'login', // این کلیدواژه مهم است برای فیلتر کردن
                description: 'ورود موفق به سیستم'
            });
        }

        // هدایت
        if (profile.role === 'root') window.location.href = 'root.html';
        else if (profile.role === 'superadmin') window.location.href = 'superadmin.html';
        else if (profile.role === 'admin') window.location.href = 'admin.html';
        else if (profile.role === 'institute') window.location.href = 'attendance.html';
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorMessage.textContent = '';
        loginButton.disabled = true;
        loginButton.textContent = 'در حال ورود...';

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
            // true یعنی: بله، این یک ورود جدید است، لاگش را ثبت کن
            validateAndRedirect(data.user.id, true);
        }
    });

    checkSession();
});
