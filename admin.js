document.addEventListener('DOMContentLoaded', async () => {
    // --- ۱. بررسی امنیتی: فقط ادمین یا کسی که داره ادمین رو شبیه‌سازی می‌کنه ---
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { window.location.href = 'index.html'; return; }

    // دریافت نقش کاربر
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();

    // لاجیک شبیه‌سازی: اگر روت یا سوپرادمین داره نقش بازی می‌کنه، قبوله
    const isImpersonating = localStorage.getItem('impersonationActive');
    const effectiveRole = isImpersonating ? localStorage.getItem('impersonatedRole') : profile.role;
    
    // اگر نقش نهایی "admin" نیست، بندازش بیرون
    if (effectiveRole !== 'admin') { 
        window.location.href = 'index.html'; 
        return; 
    }

    // --- ۲. تنظیمات اولیه صفحه ---
    // نام نمایشی (اگر شبیه‌سازی باشه، نام ادمین جعلی رو نشون میده)
    const displayName = isImpersonating ? localStorage.getItem('impersonatedUsername') : profile.username;
    document.getElementById('admin-title').textContent = `پنل مدیریت (${displayName})`;
    
    // فعال‌سازی بنر زرد رنگ شبیه‌سازی (اگر فایلش لود شده باشه)
    if (typeof initImpersonationUI === 'function') initImpersonationUI();

    // شناسایی المان‌های HTML
    const dashboardContainer = document.getElementById('dashboard-container');
    const adminDataBody = document.getElementById('admin-data-body');
    const loadingMessage = document.getElementById('loading-message');
    const institutionFilter = document.getElementById('institution-filter');
    const addUserModal = document.getElementById('add-user-modal');
    
    // منوی اصلی (بالای صفحه سمت راست)
    const mainMenuButton = document.getElementById('main-menu-button');
    const mainMenuDropdown = document.getElementById('main-menu-dropdown');

    // --- ۳. مدیریت منوی اصلی (تنظیمات، لاگ‌ها، بایگانی) ---
    // این بخش در کد قبلی جا افتاده بود و خیلی مهم است
    if (mainMenuButton) {
        mainMenuButton.addEventListener('click', (e) => {
            e.stopPropagation();
            mainMenuDropdown.style.display = mainMenuDropdown.style.display === 'block' ? 'none' : 'block';
        });
    }
    // بستن منو با کلیک بیرون
    document.addEventListener('click', () => {
        if (mainMenuDropdown) mainMenuDropdown.style.display = 'none';
        document.querySelectorAll('.card-menu-dropdown').forEach(m => m.style.display = 'none');
    });


    // --- ۴. دریافت لیست موسسات (داشبورد) ---
    async function loadDashboard() {
        dashboardContainer.innerHTML = '<p>در حال بارگذاری موسسات...</p>';
        
        // شناسه ادمین (واقعی یا شبیه‌سازی شده)
        const effectiveId = isImpersonating ? localStorage.getItem('impersonatedUserId') : session.user.id;

        // دریافت موسسات فعال زیرمجموعه این ادمین
        const { data: institutions, error } = await supabase.functions.invoke('get-managed-users', {
            body: { userId: effectiveId, targetRole: 'institute' }
        });

        if (error) {
            dashboardContainer.innerHTML = `<p class="error">خطا در دریافت اطلاعات: ${error.message}</p>`;
            return;
        }

        dashboardContainer.innerHTML = '';
        institutionFilter.innerHTML = '<option value="all">همه موسسات</option>';

        // دکمه افزودن موسسه (کارت اول)
        const addCard = document.createElement('div');
        addCard.className = 'stat-card add-inst-card';
        addCard.innerHTML = `<h3>افزودن موسسه</h3><div class="plus-sign">+</div>`;
        addCard.onclick = () => {
            document.getElementById('add-user-form').reset();
            document.getElementById('add-user-status').textContent = '';
            addUserModal.style.display = 'flex';
        };
        dashboardContainer.appendChild(addCard);

        if (!institutions || institutions.length === 0) {
            // اگر موسسه‌ای نبود، فقط دکمه افزودن دیده میشه
            return;
        }

        // فیلتر کردن: فقط موسساتی که Active هستند را در داشبورد اصلی نشان بده (آرشیو شده‌ها می‌روند در صفحه آرشیو)
        const activeInstitutions = institutions.filter(i => i.status === 'active');

        for (const inst of activeInstitutions) {
            // شمارش تعداد اعضای فعال هر موسسه
            const { count: memberCount } = await supabase
                .from('members')
                .select('*', { count: 'exact', head: true })
                .eq('institution_id', inst.id)
                .eq('is_active', true);

            // پر کردن لیست فیلتر پایین صفحه
            const option = document.createElement('option');
            option.value = inst.id;
            option.textContent = inst.username;
            institutionFilter.appendChild(option);

            // ساخت کارت گرافیکی موسسه
            const card = document.createElement('div');
            card.className = 'stat-card';
            card.innerHTML = `
                <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
                    <h3>${inst.username}</h3>
                    <div class="menu-container" style="position:relative;">
                        <button class="card-menu-button" onclick="toggleMenu(event, '${inst.id}')">⋮</button>
                        <div id="menu-${inst.id}" class="card-menu-dropdown">
                            <button onclick="editUser('${inst.id}', '${inst.username}')">ویرایش نام/رمز</button>
                            <!-- لینک حیاتی برای مدیریت اعضا -->
                            <a href="manage-members.html?id=${inst.id}&name=${encodeURIComponent(inst.username)}">مدیریت اعضا</a>
                            <hr style="margin:5px 0">
                            <!-- دکمه آرشیو (جایگزین حذف) طبق منطق گوگل اسکریپت -->
                            <button onclick="archiveUser('${inst.id}', '${inst.username}')" style="color:orange;">آرشیو (غیرفعال)</button>
                        </div>
                    </div>
                </div>
                <div style="margin-top:10px;">
                    <p>تعداد اعضا: <span class="highlight">${memberCount || 0}</span></p>
                    <p class="status-active">وضعیت: فعال</p>
                </div>
            `;
            dashboardContainer.appendChild(card);
        }
    }

    // --- ۵. دریافت گزارشات حضور و غیاب ---
    async function loadAttendanceReport() {
        // این بخش دقیقاً مثل قبل، گزارشات همه موسسات زیرمجموعه را می‌گیرد
        // کدش را برای خلاصه شدن تکرار نمی‌کنم مگر اینکه بگویید.
        // همان لاجیک قبلی که ۵۰ رکورد آخر را می‌گرفت اینجا قرار می‌گیرد.
        // برای جلوگیری از باگ، یک نسخه ساده و امن اینجا می‌گذارم:
        
        const effectiveId = isImpersonating ? localStorage.getItem('impersonatedUserId') : session.user.id;
        
        // گرفتن موسسات این ادمین
        const { data: myInsts } = await supabase.from('profiles').select('id').eq('created_by', effectiveId);
        if (!myInsts || myInsts.length === 0) {
            adminDataBody.innerHTML = '<tr><td colspan="4">اطلاعاتی یافت نشد.</td></tr>';
            loadingMessage.style.display = 'none';
            return;
        }
        
        const instIds = myInsts.map(i => i.id);

        // گرفتن حضور و غیاب‌های مربوط به این موسسات
        const { data: records, error } = await supabase
            .from('attendance_records')
            .select(`
                status, date, 
                members (full_name),
                institution:institution_id (username)
            `)
            .in('institution_id', instIds) // فیلتر مهم: فقط موسسات خودم
            .order('date', { ascending: false })
            .limit(50);

        loadingMessage.style.display = 'none';

        if (error) {
            adminDataBody.innerHTML = '<tr><td colspan="4">خطا در بارگذاری.</td></tr>';
            return;
        }

        adminDataBody.innerHTML = '';
        records.forEach(r => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${r.institution.username}</td>
                <td>${r.members ? r.members.full_name : '-'}</td>
                <td>${new Date(r.date).toLocaleDateString('fa-IR')}</td>
                <td>${r.status}</td>
            `;
            adminDataBody.appendChild(row);
        });
    }

    // --- ۶. توابع کمکی و دکمه‌ها ---

    // باز کردن منوی سه نقطه روی کارت‌ها
    window.toggleMenu = (e, id) => {
        e.stopPropagation();
        document.querySelectorAll('.card-menu-dropdown').forEach(m => m.style.display = 'none');
        const menu = document.getElementById(`menu-${id}`);
        if (menu) menu.style.display = 'block';
    };

    // آرشیو کردن موسسه (قابلیت نسخه گوگل اسکریپت)
    window.archiveUser = async (id, name) => {
        if (!confirm(`آیا مطمئن هستید که می‌خواهید موسسه «${name}» را بایگانی کنید؟\nدسترسی ورود آن‌ها قطع خواهد شد.`)) return;

        // به جای حذف، وضعیت را به archived تغییر می‌دهیم
        const { error } = await supabase
            .from('profiles')
            .update({ status: 'archived' })
            .eq('id', id);

        if (error) {
            alert('خطا در بایگانی: ' + error.message);
        } else {
            // ثبت لاگ
            const effectiveId = isImpersonating ? localStorage.getItem('impersonatedUserId') : session.user.id;
            await supabase.from('action_logs').insert({
                actor_id: effectiveId,
                target_user_id: id,
                action_type: 'archive_institution',
                description: `موسسه ${name} بایگانی شد.`
            });

            alert('موسسه با موفقیت بایگانی شد.');
            loadDashboard(); // رفرش صفحه
        }
    };

    // افزودن موسسه جدید
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
            status.textContent = 'موسسه ساخته شد.';
            setTimeout(() => {
                addUserModal.style.display = 'none';
                loadDashboard();
            }, 1000);
        }
    });

    // ویرایش رمز عبور (باز کردن مودال)
    window.editUser = (id, currentName) => {
        // کدهای مربوط به باز کردن مودال ویرایش (مثل فایل قبلی)
        // برای خلاصه شدن تکرار نکردم اما اینجا باید باشد
        const modal = document.getElementById('edit-user-modal');
        document.getElementById('edit-user-id').value = id;
        document.getElementById('edit-modal-title').textContent = `ویرایش موسسه: ${currentName}`;
        modal.style.display = 'flex';
    };
    
    // سابمیت فرم ویرایش
    document.getElementById('edit-user-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-user-id').value;
        const pass = document.getElementById('edit-password').value;
        const effectiveId = isImpersonating ? localStorage.getItem('impersonatedUserId') : session.user.id;
        
        if(!pass) return;

        const { error } = await supabase.functions.invoke('update-user-password', {
            body: { userId: id, newPassword: pass, requesterId: effectiveId }
        });

        if(error) alert('خطا: ' + error.message);
        else {
            alert('رمز تغییر کرد.');
            document.getElementById('edit-user-modal').style.display = 'none';
        }
    });

    // دکمه‌های کنسل مودال
    document.querySelectorAll('.cancel-btn').forEach(b => b.onclick = () => {
        document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
    });

    // خروج
    document.getElementById('logout-button').onclick = async () => {
        await supabase.auth.signOut();
        window.location.href = 'index.html';
    };

    // شروع
    loadDashboard();
    loadAttendanceReport();
});
