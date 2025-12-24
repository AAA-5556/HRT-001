document.addEventListener('DOMContentLoaded', async () => {
    // --- ۱. بررسی امنیتی ---
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { window.location.href = 'index.html'; return; }

    // بررسی دسترسی ادمین
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
    const isImpersonating = localStorage.getItem('impersonationActive');
    const effectiveRole = isImpersonating ? localStorage.getItem('impersonatedRole') : profile.role;

    if (effectiveRole !== 'admin') { 
        window.location.href = 'index.html'; 
        return; 
    }

    // --- ۲. تنظیمات صفحه ---
    const archiveTableBody = document.getElementById('archive-table-body');
    const loadingMessage = document.getElementById('loading-archive');
    
    // المان‌های پروفایل (برای مشاهده جزئیات موسسه آرشیو شده)
    const archiveListView = document.getElementById('archive-list-view');
    const profileView = document.getElementById('profile-view');
    const backToListBtn = document.getElementById('back-to-list-btn');
    const profileMembersBody = document.getElementById('profile-members-body');
    const profileHistoryBody = document.getElementById('profile-history-body');

    // --- ۳. دریافت لیست آرشیو شده‌ها از بک‌اند ---
    async function loadArchivedInstitutions() {
        loadingMessage.style.display = 'block';
        archiveTableBody.innerHTML = '';

        const effectiveId = isImpersonating ? localStorage.getItem('impersonatedUserId') : session.user.id;

        // فراخوانی تابع get-managed-users (همان تابعی که ۵ دقیقه پیش دیپلوی کردیم)
        // این تابع همه موسسات را می‌دهد، ما سمت کاربر فیلتر می‌کنیم
        const { data: institutions, error } = await supabase.functions.invoke('get-managed-users', {
            body: { userId: effectiveId, targetRole: 'institute' }
        });

        if (error) {
            archiveTableBody.innerHTML = `<tr><td colspan="4">خطا: ${error.message}</td></tr>`;
            return;
        }

        // فیلتر: فقط آنهایی که وضعیتشان archived است
        const archivedList = institutions.filter(i => i.status === 'archived');

        loadingMessage.style.display = 'none';

        if (archivedList.length === 0) {
            archiveTableBody.innerHTML = '<tr><td colspan="4">هیچ موسسه آرشیو شده‌ای وجود ندارد.</td></tr>';
            return;
        }

        // نمایش در جدول
        for (const inst of archivedList) {
            // دریافت اطلاعات لاگ برای اینکه بفهمیم کی آرشیو شده (اختیاری ولی حرفه‌ای)
            // این کوئری آخرین لاگ آرشیو مربوط به این کاربر را می‌گیرد
            const { data: logs } = await supabase
                .from('action_logs')
                .select('created_at, actor_id')
                .eq('target_user_id', inst.id)
                .eq('action_type', 'archive_institution')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            const archiveDate = logs ? new Date(logs.created_at).toLocaleDateString('fa-IR') : 'نامشخص';

            const row = document.createElement('tr');
            row.innerHTML = `
                <td><a href="#" class="view-profile" data-id="${inst.id}" data-name="${inst.username}">${inst.username}</a></td>
                <td>${archiveDate}</td>
                <td>${inst.role === 'institute' ? 'موسسه' : '-'}</td>
                <td>
                    <button class="restore-btn" onclick="restoreInstitution('${inst.id}', '${inst.username}')">بازگردانی (Restore)</button>
                </td>
            `;
            archiveTableBody.appendChild(row);
        }

        // فعال‌سازی لینک‌های مشاهده پروفایل
        document.querySelectorAll('.view-profile').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                showProfile(e.target.dataset.id, e.target.dataset.name);
            });
        });
    }

    // --- ۴. تابع بازگردانی (Restore) ---
    window.restoreInstitution = async (id, name) => {
        if (!confirm(`آیا مطمئن هستید که می‌خواهید موسسه «${name}» را فعال کنید؟`)) return;

        // تغییر وضعیت در دیتابیس از archived به active
        const { error } = await supabase
            .from('profiles')
            .update({ status: 'active' })
            .eq('id', id);

        if (error) {
            alert('خطا در بازگردانی: ' + error.message);
        } else {
            // ثبت لاگ بازگردانی
            const effectiveId = isImpersonating ? localStorage.getItem('impersonatedUserId') : session.user.id;
            await supabase.from('action_logs').insert({
                actor_id: effectiveId,
                target_user_id: id,
                action_type: 'restore_institution',
                description: `موسسه ${name} بازگردانی شد.`
            });

            alert('موسسه با موفقیت بازگردانی شد و به لیست اصلی برگشت.');
            loadArchivedInstitutions(); // رفرش لیست
        }
    };

    // --- ۵. نمایش پروفایل و تاریخچه (برای موسسات آرشیو شده) ---
    async function showProfile(instId, instName) {
        archiveListView.style.display = 'none';
        profileView.style.display = 'block';
        document.getElementById('profile-title').textContent = `پروفایل آرشیو: ${instName}`;
        
        // لود کردن اعضا
        profileMembersBody.innerHTML = '<tr><td colspan="3">در حال بارگذاری...</td></tr>';
        const { data: members } = await supabase.from('members').select('*').eq('institution_id', instId);
        
        profileMembersBody.innerHTML = '';
        if (members && members.length > 0) {
            members.forEach(m => {
                profileMembersBody.innerHTML += `<tr><td>${m.id}</td><td>${m.full_name}</td><td>${m.is_active ? 'فعال' : 'حذف شده'}</td></tr>`;
            });
        } else {
            profileMembersBody.innerHTML = '<tr><td colspan="3">عضوی یافت نشد.</td></tr>';
        }

        // لود کردن تاریخچه حضور و غیاب (۵۰ تای آخر)
        profileHistoryBody.innerHTML = '<tr><td colspan="3">در حال بارگذاری...</td></tr>';
        const { data: history } = await supabase
            .from('attendance_records')
            .select('date, status, members(full_name)')
            .eq('institution_id', instId)
            .order('date', { ascending: false })
            .limit(50);

        profileHistoryBody.innerHTML = '';
        if (history && history.length > 0) {
            history.forEach(h => {
                profileHistoryBody.innerHTML += `<tr><td>${new Date(h.date).toLocaleDateString('fa-IR')}</td><td>${h.members.full_name}</td><td>${h.status}</td></tr>`;
            });
        } else {
            profileHistoryBody.innerHTML = '<tr><td colspan="3">سابقه‌ای یافت نشد.</td></tr>';
        }
    }

    // دکمه بازگشت به لیست
    backToListBtn.addEventListener('click', () => {
        profileView.style.display = 'none';
        archiveListView.style.display = 'block';
    });
    
    // مدیریت تب‌های پروفایل
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab + '-tab').classList.add('active');
        });
    });

    // شروع
    loadArchivedInstitutions();
});
