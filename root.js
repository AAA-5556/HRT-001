document.addEventListener('DOMContentLoaded', async () => {
    // --- بررسی دسترسی ---
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { window.location.href = 'index.html'; return; }

    const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
    if (profile.role !== 'root') { 
        window.location.href = 'index.html'; 
        return; 
    }

    // --- تنظیمات اولیه ---
    document.getElementById('root-title').textContent = `پنل روت (${profile.username})`;
    if (typeof initImpersonationUI === 'function') initImpersonationUI();

    const dashboardContainer = document.getElementById('dashboard-container');
    const superadminListBody = document.getElementById('superadmin-list-body');
    const addModal = document.getElementById('add-user-modal');
    
    // --- ۱. آمار داشبورد ---
    async function loadStats() {
        dashboardContainer.innerHTML = '<p>در حال دریافت آمار...</p>';
        const { data, error } = await supabase.functions.invoke('get-dashboard-stats');
        
        if (error) {
            dashboardContainer.innerHTML = `<p class="error">خطا: ${error.message}</p>`;
            return;
        }

        dashboardContainer.innerHTML = `
            <div class="stat-card"><h3>مدیران ارشد (Superadmin)</h3><p class="highlight">${data.superadminCount}</p></div>
            <div class="stat-card"><h3>مدیران میانی (Admin)</h3><p class="highlight">${data.adminCount}</p></div>
            <div class="stat-card"><h3>موسسات</h3><p class="highlight">${data.institutionCount}</p></div>
            <div class="stat-card"><h3>کل اعضای فعال</h3><p class="highlight">${data.activeUsers}</p></div>
        `;
    }

    // --- ۲. لیست سوپرادمین‌ها ---
    async function loadSuperadmins() {
        superadminListBody.innerHTML = '<tr><td colspan="3">در حال بارگذاری...</td></tr>';
        
        // دریافت لیست سوپرادمین‌ها
        const { data, error } = await supabase.functions.invoke('get-managed-users', {
            body: { userId: session.user.id, targetRole: 'superadmin' }
        });

        if (error) {
            superadminListBody.innerHTML = `<tr><td colspan="3">خطا: ${error.message}</td></tr>`;
            return;
        }

        // فیلتر: فقط آنهایی که فعال هستند را نشان بده (آرشیو شده‌ها می‌روند در لیست جدا)
        const activeUsers = data.filter(u => u.status === 'active');

        superadminListBody.innerHTML = '';
        if (activeUsers.length === 0) {
            superadminListBody.innerHTML = '<tr><td colspan="3">هیچ سوپرادمین فعالی یافت نشد.</td></tr>';
            return;
        }

        activeUsers.forEach(user => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${user.username}</td>
                <td>${new Date(user.created_at).toLocaleDateString('fa-IR')}</td>
                <td class="actions">
                    <button class="impersonate-btn" onclick="startImpersonation('${user.id}', '${user.username}', 'superadmin')">ورود</button>
                    <!-- دکمه آرشیو اضافه شد -->
                    <button onclick="archiveUser('${user.id}', '${user.username}')" style="background-color:orange; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">آرشیو</button>
                    <button class="delete-btn" onclick="deleteUser('${user.id}', '${user.username}')">حذف</button>
                </td>
            `;
            superadminListBody.appendChild(row);
        });
    }

    // --- ۳. تابع آرشیو (امن) ---
    window.archiveUser = async (id, name) => {
        if (!confirm(`آیا مطمئن هستید؟ با آرشیو کردن «${name}»، دسترسی او قطع می‌شود اما زیرمجموعه‌هایش حفظ می‌شوند.`)) return;

        const { error } = await supabase
            .from('profiles')
            .update({ status: 'archived' })
            .eq('id', id);

        if (error) {
            alert('خطا: ' + error.message);
        } else {
            // ثبت لاگ
            await supabase.from('action_logs').insert({
                actor_id: session.user.id,
                target_user_id: id,
                action_type: 'archive_superadmin',
                description: `کاربر سوپرادمین ${name} آرشیو شد.`
            });
            alert('کاربر آرشیو شد.');
            loadSuperadmins();
            loadStats();
        }
    };

    // --- ۴. تابع حذف (خطرناک) ---
    window.deleteUser = async (targetId, name) => {
        if (!confirm(`هشدار قرمز!!\nآیا از حذف کامل «${name}» مطمئن هستید؟\nبا این کار تمام ادمین‌ها و موسسات زیرمجموعه او هم نابود می‌شوند!`)) return;

        const { error } = await supabase.functions.invoke('delete-user', {
            body: { userId: targetId, requesterId: session.user.id }
        });

        if (error) alert('خطا: ' + error.message);
        else {
            alert('کاربر و زیرمجموعه‌هایش حذف شدند.');
            loadSuperadmins();
            loadStats();
        }
    };

    // --- ۵. ساخت کاربر ---
    document.getElementById('add-user-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        const status = document.getElementById('add-user-status');
        const username = document.getElementById('new-username').value;
        const password = document.getElementById('new-password').value;

        btn.disabled = true;
        status.textContent = 'در حال ساخت...';

        const { error } = await supabase.functions.invoke('create-user', {
            body: { username, password, creatorId: session.user.id }
        });

        if (error) {
            status.style.color = 'red';
            status.textContent = error.message;
        } else {
            status.style.color = 'green';
            status.textContent = 'ساخته شد!';
            setTimeout(() => {
                addModal.style.display = 'none';
                e.target.reset();
                status.textContent = '';
                loadSuperadmins();
                loadStats();
            }, 1000);
        }
        btn.disabled = false;
    });

    document.getElementById('add-superadmin-button').onclick = () => addModal.style.display = 'flex';
    document.querySelectorAll('.cancel-btn').forEach(b => b.onclick = () => addModal.style.display = 'none');
    document.getElementById('logout-button').onclick = async () => {
        await supabase.auth.signOut();
        window.location.href = 'index.html';
    };

    loadStats();
    loadSuperadmins();
});
