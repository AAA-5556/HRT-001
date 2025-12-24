document.addEventListener('DOMContentLoaded', async () => {
    // --- بررسی دسترسی ---
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { window.location.href = 'index.html'; return; }

    const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
    
    // دسترسی: سوپرادمین یا روت (شبیه‌سازی)
    const isImpersonating = localStorage.getItem('impersonationActive');
    const effectiveRole = isImpersonating ? localStorage.getItem('impersonatedRole') : profile.role;

    if (effectiveRole !== 'superadmin' && profile.role !== 'root') {
        window.location.href = 'index.html'; 
        return; 
    }

    document.getElementById('superadmin-title').textContent = `پنل سوپرادمین (${profile.username})`;
    if (typeof initImpersonationUI === 'function') initImpersonationUI();

    const adminListBody = document.getElementById('admin-list-body');
    const addUserModal = document.getElementById('add-user-modal');

    // --- ۱. لیست ادمین‌ها ---
    async function loadAdmins() {
        adminListBody.innerHTML = '<tr><td colspan="4">در حال بارگذاری...</td></tr>';
        
        const effectiveId = isImpersonating ? localStorage.getItem('impersonatedUserId') : session.user.id;

        const { data: admins, error } = await supabase.functions.invoke('get-managed-users', {
            body: { userId: effectiveId, targetRole: 'admin' }
        });

        if (error) {
            adminListBody.innerHTML = `<tr><td colspan="4">خطا: ${error.message}</td></tr>`;
            return;
        }

        const activeAdmins = admins.filter(u => u.status === 'active');

        adminListBody.innerHTML = '';
        if (activeAdmins.length === 0) {
            adminListBody.innerHTML = '<tr><td colspan="4">هیچ ادمین فعالی یافت نشد.</td></tr>';
            return;
        }

        for (const admin of activeAdmins) {
            const { count } = await supabase
                .from('profiles')
                .select('*', { count: 'exact', head: true })
                .eq('created_by', admin.id);

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${admin.username}</td>
                <td>${new Date(admin.created_at).toLocaleDateString('fa-IR')}</td>
                <td>${count || 0} موسسه</td>
                <td class="actions">
                    <button class="impersonate-btn" onclick="startImpersonation('${admin.id}', '${admin.username}', 'admin')">ورود</button>
                    <!-- دکمه آرشیو -->
                    <button onclick="archiveUser('${admin.id}', '${admin.username}')" style="background-color:orange; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">آرشیو</button>
                    <button class="edit-btn" onclick="editUser('${admin.id}', '${admin.username}')">ویرایش</button>
                    <button class="delete-btn" onclick="deleteUser('${admin.id}', '${admin.username}')">حذف</button>
                </td>
            `;
            adminListBody.appendChild(row);
        }
    }

    // --- ۲. تابع آرشیو ---
    window.archiveUser = async (id, name) => {
        if (!confirm(`آیا مطمئن هستید؟ ادمین «${name}» دیگر نمی‌تواند وارد شود، اما موسساتش سرجایشان می‌مانند.`)) return;

        const { error } = await supabase
            .from('profiles')
            .update({ status: 'archived' })
            .eq('id', id);

        if (error) alert('خطا: ' + error.message);
        else {
            const effectiveId = isImpersonating ? localStorage.getItem('impersonatedUserId') : session.user.id;
            await supabase.from('action_logs').insert({
                actor_id: effectiveId,
                target_user_id: id,
                action_type: 'archive_admin',
                description: `ادمین ${name} آرشیو شد.`
            });
            alert('ادمین آرشیو شد.');
            loadAdmins();
        }
    };

    // --- ۳. توابع دیگر (حذف، ساخت، ویرایش) ---
    window.deleteUser = async (id, name) => {
        if(!confirm(`خطر!!!\nحذف ادمین «${name}» باعث حذف تمام موسسات او می‌شود!\nآیا مطمئن هستید؟`)) return;
        
        const { error } = await supabase.functions.invoke('delete-user', {
            body: { userId: id, requesterId: session.user.id }
        });
        if (!error) { alert('حذف شد.'); loadAdmins(); }
    };

    document.getElementById('add-user-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('new-username').value;
        const password = document.getElementById('new-password').value;
        const status = document.getElementById('add-user-status');
        const effectiveId = isImpersonating ? localStorage.getItem('impersonatedUserId') : session.user.id;

        status.textContent = 'در حال ساخت...';
        const { error } = await supabase.functions.invoke('create-user', {
            body: { username, password, creatorId: effectiveId }
        });

        if (error) {
            status.style.color = 'red';
            status.textContent = error.message;
        } else {
            status.style.color = 'green';
            status.textContent = 'ساخته شد.';
            setTimeout(() => {
                addUserModal.style.display = 'none';
                loadAdmins();
            }, 1000);
        }
    });

    window.editUser = (id, name) => {
        const modal = document.getElementById('edit-user-modal');
        document.getElementById('edit-user-id').value = id;
        document.getElementById('edit-modal-title').textContent = `ویرایش: ${name}`;
        modal.style.display = 'flex';
    };

    document.getElementById('edit-user-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-user-id').value;
        const pass = document.getElementById('edit-password').value;
        if(!pass) return;
        
        const { error } = await supabase.functions.invoke('update-user-password', {
            body: { userId: id, newPassword: pass, requesterId: session.user.id }
        });
        if(error) alert('خطا: ' + error.message);
        else {
            alert('رمز تغییر کرد.');
            document.getElementById('edit-user-modal').style.display = 'none';
        }
    });

    document.getElementById('add-admin-button').onclick = () => addUserModal.style.display = 'flex';
    document.querySelectorAll('.cancel-btn').forEach(b => b.onclick = () => document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none'));
    document.getElementById('logout-button').onclick = async () => {
        await supabase.auth.signOut();
        window.location.href = 'index.html';
    };

    loadAdmins();
});
