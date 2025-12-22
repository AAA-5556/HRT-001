document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const errorMessage = document.getElementById('error-message');
    const loginButton = document.getElementById('login-button');

    // بررسی می‌کند آیا کاربر از قبل وارد شده است یا خیر
    async function checkExistingSession() {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
            console.error('خطا در بررسی نشست:', error);
            return;
        }

        if (session) {
            loginButton.disabled = true;
            loginButton.textContent = 'در حال هدایت به پنل...';
            await redirectToPanel(session.user.id);
        }
    }

    // کاربر را بر اساس نقش به پنل مربوطه هدایت می‌کند
    async function redirectToPanel(userId) {
        try {
            const { data: profile, error } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', userId)
                .single();

            if (error || !profile) {
                throw error || new Error('پروفایل کاربری یافت نشد.');
            }

            const adminRoles = ['admin', 'superadmin', 'root'];
            if (adminRoles.includes(profile.role)) {
                window.location.href = 'admin.html';
            } else if (profile.role === 'institute') {
                window.location.href = 'attendance.html';
            } else {
                errorMessage.textContent = 'نقش کاربری شما تعریف نشده است.';
            }
        } catch (error) {
            errorMessage.textContent = 'خطا در دریافت اطلاعات کاربری.';
            console.error('خطای هدایت:', error);
            await supabase.auth.signOut();
            loginButton.disabled = false;
            loginButton.textContent = 'ورود';
        }
    }

    // مدیریت فرم ورود
    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const email = usernameInput.value; // در Supabase، نام کاربری همان ایمیل است
        const password = passwordInput.value;

        loginButton.disabled = true;
        loginButton.textContent = 'در حال بررسی...';
        errorMessage.textContent = '';

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email: email,
                password: password,
            });

            if (error) {
                throw error;
            }

            if (data.user) {
                await redirectToPanel(data.user.id);
            } else {
                 errorMessage.textContent = "اطلاعات ورود نامعتبر است.";
            }

        } catch (error) {
            console.error('خطای ورود:', error);
            errorMessage.textContent = 'نام کاربری یا رمز عبور اشتباه است.';
            loginButton.disabled = false;
            loginButton.textContent = 'ورود';
        }
    });

    // اجرای اولیه: بررسی نشست موجود
    checkExistingSession();
});
