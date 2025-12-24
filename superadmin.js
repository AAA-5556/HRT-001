document.addEventListener('DOMContentLoaded', async () => {
    // --- بررسی دسترسی ---
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { window.location.href = 'index.html'; return; }

    const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
    
    // دسترسی: سوپرادمین واقعی یا روتی که نقش بازی می‌کند
    const allowed = profile.role === 'superadmin' || localStorage.getItem('impersonatedRole') === 'superadmin';
    
    if (!allowed && profile.role !== 'root') { // روت همیشه دسترسی دارد
        window.location.href = 'index.html'; 
        return; 
    }

    document.getElementById('superadmin-title').textContent = `پنل سوپرادمین (${profile.username})`;
    if (typeof initImpersonationUI === 'function') initImpersonationUI();

    const adminListBody = document.getElementById('admin-list-body');
    const addUserModal = document.getElementById('add-user-modal');

    // --- دریافت لیست ادمین‌ها ---
    async function loadAdmins() {
        adminListBody.innerHTML = '<tr><td colspan="4">در حال بارگذاری...</td></tr>';
        
        // شناسه موثر (اگر شبیه‌سازی است، شناسه سوپرادمین جعلی)
        const effectiveId = localStorage.getItem('impersonatedUserId') || session.user.id;

        const { data: admins, error } = await supabase.functions.invoke('get-managed-users', {
            body: { userId: effectiveId, targetRole: 'admin' }
        });

        if (error) {
            adminListBody.innerHTML = `<tr><td colspan="4">خطا: ${error.message}</td></tr>`;
            return;
        }

        adminListBody.innerHTML = '';
        if (admins.length === 0) {
            adminListBody.innerHTML = '<tr><td colspan="4">هیچ ادمینی تعریف نشده است.</td></tr>';
            return;
        }

        for (const admin of admins) {
            // شمارش تعداد موسسات زیرمجموعه این ادمین
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
                    <button class="impersonate-btn" onclick="startImpersonation('${admin.id}', '${admin.username}', 'admin')">ورود به پنل</button>
                    <button class="edit-btn" onclick="editUser('${admin.id}', '${admin.username}')">ویرایش</button>
                    <button class="delete-btn" onclick="deleteUser('${admin.id}')">حذف</button>
                </td>
            `;
            adminListBody.appendChild(row);
        }
    }

    // --- افزودن ادمین جدید ---
    document.getElementById('add-user-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('new-username').value;
        const password = document.getElementById('new-password').value;
        const status = document.getElementById('add-user-status');
        const effectiveId = localStorage.getItem('impersonatedUserId') || session.user.id;

        status.textContent = 'در حال ساخت...';
        
        const { error } = await supabase.functions.invoke('create-user', {
            body: { username, password, creatorId: effectiveId }
        });

        if (error) {
            status.style.color = 'red';
            status.textContent = error.message;
        } else {
            status.style.color = 'green';
            status.textContent = 'ادمین ساخته شد.';
            setTimeout(() => {
                addUserModal.style.display = 'none';
                loadAdmins();
            }, 1000);
        }
    });

    // --- توابع حذف و خروج ---
    window.deleteUser = async (id) => {
        if(!confirm('با حذف ادمین، تمام موسسات زیرمجموعه او هم حذف می‌شوند. ادامه می‌دهید؟')) return;
        const { error } = await supabase.functions.invoke('delete-user', {
            body: { userId: id, requesterId: session.user.id }
        });
        if (!error) { alert('حذف شد.'); loadAdmins(); }
    };

    document.getElementById('add-admin-button').onclick = () => addUserModal.style.display = 'flex';
    document.querySelectorAll('.cancel-btn').forEach(b => b.onclick = () => addUserModal.style.display = 'none');
    document.getElementById('logout-button').onclick = async () => {
        await supabase.auth.signOut();
        window.location.href = 'index.html';
    };

    loadAdmins();
});
