document.addEventListener('DOMContentLoaded', async () => {
    // --- ۱. بررسی امنیتی ---
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { window.location.href = 'index.html'; return; }

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
    
    const allowedRoles = ['root', 'superadmin', 'admin'];
    const isImpersonating = localStorage.getItem('impersonationActive');
    const effectiveRole = isImpersonating ? localStorage.getItem('impersonatedRole') : profile.role;

    if (!allowedRoles.includes(effectiveRole)) {
        window.location.href = 'index.html';
        return;
    }

    document.querySelector('.back-link').href = `${effectiveRole}.html`;

    // --- ۲. دریافت لاگ‌ها ---
    const logTableBody = document.getElementById('log-table-body');
    const loadingMessage = document.getElementById('loading-log');
    const userFilter = document.getElementById('user-filter');

    async function fetchLogs() {
        loadingMessage.style.display = 'block';
        logTableBody.innerHTML = '';

        // دریافت ۵۰ لاگین آخر (نوع action_type = login نداریم چون سوپابیس لاگین را در action_logs ثبت نمی‌کند مگر دستی بنویسیم)
        // اما چون شما فایل جدا خواستید، ما لاگ‌های action_logs را که مربوط به ورود است می‌خوانیم
        // نکته: اگر لاگ ورود اتوماتیک ندارید، فعلا لاگ‌های 'login_as' یا شبیه‌سازی را نشان می‌دهیم
        // یا اگر منظورتان جدول auth.audit_log_entries است که دسترسی مستقیم ندارید.
        
        // فرض: ما می‌خواهیم action_logs را ببینیم
        let query = supabase
            .from('action_logs')
            .select('created_at, action_type, actor:actor_id(username, role)')
            .in('action_type', ['login', 'start_impersonation']) // فقط لاگ‌های مربوط به ورود
            .order('created_at', { ascending: false })
            .limit(50);

        const { data: logs, error } = await query;

        loadingMessage.style.display = 'none';

        if (error) {
            logTableBody.innerHTML = `<tr><td colspan="3">خطا: ${error.message}</td></tr>`;
            return;
        }

        if (logs.length === 0) {
            logTableBody.innerHTML = '<tr><td colspan="3">رکوردی یافت نشد.</td></tr>';
            return;
        }

        logs.forEach(log => {
            const row = document.createElement('tr');
            const username = log.actor ? log.actor.username : 'نامشخص';
            const role = log.actor ? log.actor.role : '-';
            
            // فیلتر کلاینت ساید
            if (userFilter.value && !username.includes(userFilter.value)) return;

            row.innerHTML = `
                <td>${new Date(log.created_at).toLocaleString('fa-IR')}</td>
                <td>${username}</td>
                <td>${role}</td>
            `;
            logTableBody.appendChild(row);
        });
    }

    userFilter.addEventListener('input', fetchLogs);
    fetchLogs();
});
