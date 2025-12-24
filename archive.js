document.addEventListener('DOMContentLoaded', async () => {
    // --- بررسی هویت ---
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { window.location.href = 'index.html'; return; }

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
    const isImpersonating = localStorage.getItem('impersonationActive');
    const effectiveRole = isImpersonating ? localStorage.getItem('impersonatedRole') : profile.role;

    // تعیین نوع زیرمجموعه بر اساس نقش فعلی
    let targetChildRole = '';
    let pageTitle = '';

    if (effectiveRole === 'root') { targetChildRole = 'superadmin'; pageTitle = 'بایگانی سوپرادمین‌ها'; }
    else if (effectiveRole === 'superadmin') { targetChildRole = 'admin'; pageTitle = 'بایگانی ادمین‌ها'; }
    else if (effectiveRole === 'admin') { targetChildRole = 'institute'; pageTitle = 'بایگانی موسسات'; }
    else { window.location.href = 'index.html'; return; }

    document.querySelector('.page-header h2').textContent = pageTitle;
    document.querySelector('.back-link').href = `${effectiveRole}.html`;

    // --- لود لیست ---
    const archiveTableBody = document.getElementById('archive-table-body');
    const effectiveId = isImpersonating ? localStorage.getItem('impersonatedUserId') : session.user.id;

    async function loadArchives() {
        archiveTableBody.innerHTML = '<tr><td colspan="4">در حال بارگذاری...</td></tr>';
        
        // دریافت تمام زیرمجموعه‌های من
        const { data: list, error } = await supabase.functions.invoke('get-managed-users', {
            body: { userId: effectiveId, targetRole: targetChildRole }
        });

        if (error) {
            archiveTableBody.innerHTML = `<tr><td colspan="4">خطا: ${error.message}</td></tr>`;
            return;
        }

        // فیلتر کردن آنهایی که واقعاً آرشیو هستند
        const archived = list.filter(item => item.status === 'archived');
        
        // اعمال فیلتر جستجوی متنی (اختیاری اگر اضافه کردید)
        // const searchTerm = document.getElementById('search-box').value;
        // const filtered = archived.filter(i => i.username.includes(searchTerm));

        renderTable(archived);
    }

    function renderTable(items) {
        archiveTableBody.innerHTML = '';
        if (items.length === 0) {
            archiveTableBody.innerHTML = '<tr><td colspan="4">موردی در بایگانی یافت نشد.</td></tr>';
            return;
        }

        items.forEach(item => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${item.username}</td>
                <td>${new Date(item.created_at).toLocaleDateString('fa-IR')}</td>
                <td>${item.role}</td>
                <td>
                    <button class="restore-btn" onclick="restoreUser('${item.id}', '${item.username}')">بازگردانی (Restore)</button>
                </td>
            `;
            archiveTableBody.appendChild(row);
        });
    }

    window.restoreUser = async (id, name) => {
        if (!confirm(`بازگردانی «${name}» به لیست فعال؟`)) return;

        const { error } = await supabase.from('profiles').update({ status: 'active' }).eq('id', id);
        
        if (error) alert(error.message);
        else {
            const actorId = isImpersonating ? localStorage.getItem('impersonatedUserId') : session.user.id;
            await supabase.from('action_logs').insert({
                actor_id: actorId,
                target_user_id: id,
                action_type: 'restore_user',
                description: `بازگردانی ${name}`
            });
            alert('بازگردانی شد.');
            loadArchives();
        }
    };

    loadArchives();
});
