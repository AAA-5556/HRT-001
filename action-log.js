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

    async function fetchActionLogs() {
        loadingMessage.textContent = 'در حال دریافت...';
        
        const { data: logs, error } = await supabase
            .from('action_logs')
            .select(`
                created_at, action_type, description,
                actor:actor_id(username, role)
            `)
            .order('created_at', { ascending: false })
            .limit(100);

        loadingMessage.style.display = 'none';

        if (error) {
            logTableBody.innerHTML = `<tr><td colspan="5">خطا: ${error.message}</td></tr>`;
            return;
        }

        logTableBody.innerHTML = '';
        logs.forEach(log => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${new Date(log.created_at).toLocaleString('fa-IR')}</td>
                <td>${log.actor ? log.actor.username : '?'}</td>
                <td>${log.actor ? log.actor.role : '?'}</td>
                <td>${log.action_type}</td>
                <td>${log.description || ''}</td>
            `;
            logTableBody.appendChild(row);
        });
    }

    fetchActionLogs();
});
