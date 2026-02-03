document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { window.location.href = 'index.html'; return; }

    const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
    const isImpersonating = localStorage.getItem('impersonationActive');
    const effectiveRole = isImpersonating ? localStorage.getItem('impersonatedRole') : profile.role;

    if (effectiveRole !== 'superadmin' && profile.role !== 'root') { window.location.href = 'index.html'; return; }

    document.getElementById('superadmin-title').textContent = `پنل سوپرادمین (${profile.username})`;
    if (typeof initImpersonationUI === 'function') initImpersonationUI();
    addTicketButtonToHeader();

    const mainMenuButton = document.getElementById('main-menu-button');
    const mainMenuDropdown = document.getElementById('main-menu-dropdown');
    if (mainMenuButton) {
        mainMenuButton.onclick = (e) => { e.stopPropagation(); mainMenuDropdown.style.display = mainMenuDropdown.style.display === 'block' ? 'none' : 'block'; };
    }
    document.addEventListener('click', () => { if(mainMenuDropdown) mainMenuDropdown.style.display = 'none'; });

    const adminListBody = document.getElementById('admin-list-body');
    const addUserModal = document.getElementById('add-user-modal');

    async function loadAdmins() {
        adminListBody.innerHTML = '<tr><td colspan="4">در حال بارگذاری...</td></tr>';
        const impData = getImpersonationData();
        const { data, error } = await supabase.functions.invoke('get-managed-users', {
            body: {
                impersonatedUserId: impData.impersonatedUserId,
                targetRole: 'admin'
            }
        });

        if (error) { adminListBody.innerHTML = `<tr><td colspan="4">${error.message}</td></tr>`; return; }
        const activeAdmins = data.filter(u => u.status === 'active');
        adminListBody.innerHTML = '';

        for (const admin of activeAdmins) {
            const { count } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('created_by', admin.id);
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${admin.username}</td>
                <td>${new Date(admin.created_at).toLocaleDateString('fa-IR')}</td>
                <td>${count || 0} موسسه</td>
                <td class="actions">
                    <button class="impersonate-btn" onclick="startImpersonation('${admin.id}', '${admin.username}', 'admin')">ورود</button>
                    <button onclick="archiveUser('${admin.id}', '${admin.username}')" style="background:orange; border:none; padding:5px; border-radius:4px; cursor:pointer;">آرشیو</button>
                    <button class="edit-btn" onclick="editUser('${admin.id}', '${admin.username}')">ویرایش</button>
                    <button class="delete-btn" onclick="deleteUser('${admin.id}', '${admin.username}')">حذف</button>
                </td>
            `;
            adminListBody.appendChild(row);
        }
    }

    window.archiveUser = async (id, name) => {
        if (!confirm(`آرشیو کردن ادمین «${name}»؟`)) return;
        const { error } = await supabase.from('profiles').update({ status: 'archived' }).eq('id', id);
        if (!error) {
            const effectiveId = isImpersonating ? localStorage.getItem('impersonatedUserId') : session.user.id;
            await supabase.from('action_logs').insert({ actor_id: effectiveId, target_user_id: id, action_type: 'archive_admin' });
            loadAdmins();
        } else alert(error.message);
    };

    window.deleteUser = async (id, name) => {
        if(!confirm(`حذف کامل ادمین «${name}»؟`)) return;
        const impData = getImpersonationData();
        const { error } = await supabase.functions.invoke('delete-user', {
            body: {
                userId: id,
                impersonatedUserId: impData.impersonatedUserId
            }
        });
        if(!error) loadAdmins(); else alert(error.message);
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
        if(!error) { addUserModal.style.display = 'none'; loadAdmins(); } else alert(error.message);
    });

    window.editUser = (id, name) => {
        document.getElementById('edit-user-id').value = id;
        document.getElementById('edit-modal-title').textContent = name;
        document.getElementById('edit-user-modal').style.display = 'flex';
    };

    document.getElementById('edit-user-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-user-id').value;
        const pass = document.getElementById('edit-password').value;
        const impData = getImpersonationData();
        const { error } = await supabase.functions.invoke('update-user-password', {
            body: {
                userId: id,
                newPassword: pass,
                impersonatedUserId: impData.impersonatedUserId
            }
        });
        if(!error) document.getElementById('edit-user-modal').style.display = 'none'; else alert(error.message);
    });

    document.getElementById('add-admin-button').onclick = () => addUserModal.style.display = 'flex';
    document.querySelectorAll('.cancel-btn').forEach(b => b.onclick = () => document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none'));
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

    loadAdmins();
});
