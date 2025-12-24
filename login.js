document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const errorMessage = document.getElementById('error-message');
    const loginButton = document.getElementById('login-button');

    // چک کردن وضعیت کاربر در لحظه لود شدن صفحه
    async function checkSession() {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            // سشن هست، اما آیا کاربر فعال است؟
            validateAndRedirect(session.user.id);
        }
    }

    async function validateAndRedirect(userId) {
        loginButton.disabled = true;
        loginButton.textContent = 'در حال اعتبارسنجی...';

        const { data: profile, error } = await supabase
            .from('profiles')
            .select('role, status') // وضعیت را حتما می‌گیریم
            .eq('id', userId)
            .single();

        if (error || !profile) {
            console.error('Profile Error:', error);
            await supabase.auth.signOut();
            errorMessage.textContent = 'خطا در شناسایی کاربر.';
            loginButton.disabled = false;
            loginButton.textContent = 'ورود';
            return;
        }

        // *** شرط حیاتی: اگر آرشیو یا مسدود است، اخراج شود ***
        if (profile.status !== 'active') {
            await supabase.auth.signOut();
            errorMessage.textContent = 'حساب کاربری شما غیرفعال یا بایگانی شده است.';
            errorMessage.style.color = 'red';
            loginButton.disabled = false;
            loginButton.textContent = 'ورود';
            return;
        }

        // هدایت بر اساس نقش
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
            validateAndRedirect(data.user.id);
        }
    });

    checkSession();
});
