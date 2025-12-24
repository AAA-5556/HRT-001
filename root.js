document.addEventListener('DOMContentLoaded', async () => {
    // --- بررسی دسترسی ---
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { window.location.href = 'index.html'; return; }

    // دریافت پروفایل
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
    if (profile.role !== 'root') { 
        alert('دسترسی غیرمجاز'); 
        window.location.href = 'index.html'; 
        return; 
    }

    // --- تنظیمات اولیه ---
    document.getElementById('root-title').textContent = `پنل روت (${profile.username})`;
    initImpersonationUI(); // فعال‌سازی بنر شبیه‌سازی

    const dashboardContainer = document.getElementById('dashboard-container');
    const superadminListBody = document.getElementById('superadmin-list-body');
    const addModal = document.getElementById('add-user-modal');
    
    // --- دریافت آمار داشبورد ---
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

    // --- دریافت لیست سوپرادمین‌ها ---
    async function loadSuperadmins() {
        superadminListBody.innerHTML = '<tr><td colspan="3">در حال بارگذاری...</td></tr>';
        
        // اگر در حال شبیه‌سازی هستیم، ID آن شخص را بفرست، وگرنه ID خودمان
        const effectiveId = getEffectiveUserId(session.user.id);

        const { data, error } = await supabase.functions.invoke('get-managed-users', {
            body: { userId: effectiveId, targetRole: 'superadmin' }
        });

        if (error) {
            superadminListBody.innerHTML = `<tr><td colspan="3">خطا: ${error.message}</td></tr>`;
            return;
        }

        superadminListBody.innerHTML = '';
        if (data.length === 0) {
            superadminListBody.innerHTML = '<tr><td colspan="3">موردی یافت نشد.</td></tr>';
            return;
        }

        data.forEach(user => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${user.username}</td>
                <td>${new Date(user.created_at).toLocaleDateString('fa-IR')}</td>
                <td class="actions">
                    <button class="impersonate-btn" onclick="startImpersonation('${user.id}', '${user.username}', 'superadmin')">ورود به پنل</button>
                    <button class="delete-btn" onclick="deleteUser('${user.id}')">حذف</button>
                </td>
            `;
            superadminListBody.appendChild(row);
        });
    }

    // --- ایجاد کاربر جدید ---
    document.getElementById('add-user-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        const status = document.getElementById('add-user-status');
        
        const username = document.getElementById('new-username').value;
        const password = document.getElementById('new-password').value;
        const effectiveId = getEffectiveUserId(session.user.id);

        btn.disabled = true;
        status.textContent = 'در حال ساخت کاربر...';

        const { data, error } = await supabase.functions.invoke('create-user', {
            body: { username, password, creatorId: effectiveId }
        });

        if (error) {
            status.style.color = 'red';
            status.textContent = 'خطا: ' + error.message;
        } else {
            status.style.color = 'green';
            status.textContent = 'کاربر با موفقیت ساخته شد!';
            setTimeout(() => {
                addModal.style.display = 'none';
                e.target.reset();
                status.textContent = '';
                loadSuperadmins(); // رفرش لیست
                loadStats(); // رفرش آمار
            }, 1500);
        }
        btn.disabled = false;
    });

    // --- حذف کاربر ---
    window.deleteUser = async (targetId) => {
        if (!confirm('آیا مطمئن هستید؟ حذف کاربر غیرقابل بازگشت است.')) return;

        const { error } = await supabase.functions.invoke('delete-user', {
            body: { userId: targetId, requesterId: session.user.id }
        });

        if (error) alert('خطا در حذف: ' + error.message);
        else {
            alert('کاربر حذف شد.');
            loadSuperadmins();
            loadStats();
        }
    };

    // --- مدیریت مودال و خروج ---
    document.getElementById('add-superadmin-button').onclick = () => addModal.style.display = 'flex';
    document.querySelectorAll('.cancel-btn').forEach(b => b.onclick = () => addModal.style.display = 'none');
    document.getElementById('logout-button').onclick = async () => {
        await supabase.auth.signOut();
        window.location.href = 'index.html';
    };

    // اجرای اولیه
    loadStats();
    loadSuperadmins();
});
