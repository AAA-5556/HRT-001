document.addEventListener('DOMContentLoaded', async () => {
    // ۱. بررسی دسترسی
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

    // ۲. دریافت و نمایش لاگ‌ها
    const logTableBody = document.getElementById('log-table-body');
    const loadingMessage = document.getElementById('loading-log');
    const userFilter = document.getElementById('user-filter');

    async function fetchLogs() {
        loadingMessage.style.display = 'block';
        logTableBody.innerHTML = '';

        // کوئری برای گرفتن لاگ‌هایی که نوعشان 'login' است
        let query = supabase
            .from('action_logs')
            .select(`
                created_at, 
                actor:actor_id(username, role)
            `)
            .eq('action_type', 'login') // فقط لاگین‌ها
            .order('created_at', { ascending: false })
            .limit(50);

        const { data: logs, error } = await query;

        loadingMessage.style.display = 'none';

        if (error) {
            logTableBody.innerHTML = `<tr><td colspan="3">خطا: ${error.message}</td></tr>`;
            return;
        }

        if (!logs || logs.length === 0) {
            logTableBody.innerHTML = '<tr><td colspan="3">هنوز هیچ ورودی ثبت نشده است. (یک بار خارج و وارد شوید)</td></tr>';
            return;
        }

        logs.forEach(log => {
            const username = log.actor ? log.actor.username : 'حذف شده';
            const role = log.actor ? log.actor.role : '-';
            
            // فیلتر جستجو (کلاینت ساید)
            if (userFilter.value && !username.includes(userFilter.value)) return;

            const row = document.createElement('tr');
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
