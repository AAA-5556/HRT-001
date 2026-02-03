document.addEventListener('DOMContentLoaded', async () => {
    // --- بررسی دسترسی ---
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { window.location.href = 'index.html'; return; }

    const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
    if (profile.role !== 'root') { window.location.href = 'index.html'; return; }

    document.getElementById('root-title').textContent = `پنل روت (${profile.username})`;
    if (typeof initImpersonationUI === 'function') initImpersonationUI();
    addTicketButtonToHeader(); // دکمه تیکت اضافه شد

    // منوی اصلی
    const mainMenuButton = document.getElementById('main-menu-button');
    const mainMenuDropdown = document.getElementById('main-menu-dropdown');
    if (mainMenuButton) {
        mainMenuButton.onclick = (e) => { e.stopPropagation(); mainMenuDropdown.style.display = mainMenuDropdown.style.display === 'block' ? 'none' : 'block'; };
    }
    document.addEventListener('click', () => { if(mainMenuDropdown) mainMenuDropdown.style.display = 'none'; });

    // --- لود آمار ---
    const dashboardContainer = document.getElementById('dashboard-container');
    const superadminListBody = document.getElementById('superadmin-list-body');
    const addModal = document.getElementById('add-user-modal');

    async function loadStats() {
        dashboardContainer.innerHTML = '<p>در حال دریافت آمار...</p>';
        const impData = getImpersonationData();
        const { data, error } = await supabase.functions.invoke('get-dashboard-stats', {
            body: { impersonatedUserId: impData.impersonatedUserId }
        });
        if (error) { dashboardContainer.innerHTML = `<p class="error">${error.message}</p>`; return; }
        dashboardContainer.innerHTML = `
            <div class="stat-card"><h3>Superadmins</h3><p class="highlight">${data.superadminCount}</p></div>
            <div class="stat-card"><h3>Admins</h3><p class="highlight">${data.adminCount}</p></div>
            <div class="stat-card"><h3>Institutions</h3><p class="highlight">${data.institutionCount}</p></div>
            <div class="stat-card"><h3>Active Users</h3><p class="highlight">${data.activeUsers}</p></div>
        `;
    }

    async function loadSuperadmins() {
        superadminListBody.innerHTML = '<tr><td colspan="3">در حال بارگذاری...</td></tr>';
        const impData = getImpersonationData();
        const { data, error } = await supabase.functions.invoke('get-managed-users', {
            body: {
                impersonatedUserId: impData.impersonatedUserId,
                targetRole: 'superadmin'
            }
        });
        if (error) { superadminListBody.innerHTML = `<tr><td colspan="3">خطا: ${error.message}</td></tr>`; return; }

        const activeUsers = data.filter(u => u.status === 'active');
        superadminListBody.innerHTML = '';
        if (activeUsers.length === 0) { superadminListBody.innerHTML = '<tr><td colspan="3">موردی یافت نشد.</td></tr>'; return; }

        activeUsers.forEach(user => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${user.username}</td>
                <td>${new Date(user.created_at).toLocaleDateString('fa-IR')}</td>
                <td class="actions">
                    <button class="impersonate-btn" onclick="startImpersonation('${user.id}', '${user.username}', 'superadmin')">ورود</button>
                    <button onclick="archiveUser('${user.id}', '${user.username}')" style="background:orange; border:none; padding:5px; border-radius:4px; cursor:pointer;">آرشیو</button>
                    <button class="delete-btn" onclick="deleteUser('${user.id}', '${user.username}')">حذف</button>
                </td>
            `;
            superadminListBody.appendChild(row);
        });
    }

    window.archiveUser = async (id, name) => {
        if (!confirm(`آرشیو کردن سوپرادمین «${name}»؟`)) return;
        const { error } = await supabase.from('profiles').update({ status: 'archived' }).eq('id', id);
        if (error) alert(error.message);
        else { await supabase.from('action_logs').insert({ actor_id: session.user.id, target_user_id: id, action_type: 'archive_superadmin' }); loadSuperadmins(); }
    };

    window.deleteUser = async (id, name) => {
        if (!confirm(`حذف کامل «${name}» و تمام زیرمجموعه‌ها؟`)) return;
        const impData = getImpersonationData();
        const { error } = await supabase.functions.invoke('delete-user', {
            body: {
                userId: id,
                impersonatedUserId: impData.impersonatedUserId
            }
        });
        if (!error) loadSuperadmins(); else alert(error.message);
    };

    document.getElementById('add-user-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('new-username').value;
        const password = document.getElementById('new-password').value;
        const impData = getImpersonationData();
        const { error } = await supabase.functions.invoke('create-user', {
            body: {
                username,
                password,
                impersonatedUserId: impData.impersonatedUserId
            }
        });
        if (!error) { addModal.style.display = 'none'; loadSuperadmins(); loadStats(); } else alert(error.message);
    });

    document.getElementById('add-superadmin-button').onclick = () => addModal.style.display = 'flex';
    document.querySelectorAll('.cancel-btn').forEach(b => b.onclick = () => addModal.style.display = 'none');
    document.getElementById('logout-button').onclick = async () => { await supabase.auth.signOut(); window.location.href = 'index.html'; };

    function addTicketButtonToHeader() {
        const actionsDiv = document.querySelector('.header-actions');
        if (actionsDiv && !document.getElementById('tickets-btn')) {
            const btn = document.createElement('button');
            btn.id = 'tickets-btn'; btn.textContent = '📩 تیکت‌ها'; btn.style.marginRight = '10px'; btn.style.backgroundColor = '#17a2b8';
            btn.onclick = () => window.location.href = 'tickets.html';
            actionsDiv.prepend(btn);
        }
    }

    loadStats(); loadSuperadmins();
});
