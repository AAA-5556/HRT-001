document.addEventListener('DOMContentLoaded', async () => {
    // --- ۱. بررسی امنیتی و ورود ---
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { window.location.href = 'index.html'; return; }

    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

    if (!profile || profile.role !== 'institute') {
        // اگر نقش موسسه نیست، اخراج شود
        await supabase.auth.signOut();
        window.location.href = 'index.html';
        return;
    }

    // --- ۲. تنظیمات اولیه ---
    const instituteId = session.user.id; // شناسه موسسه همان شناسه کاربر است
    document.getElementById('institute-name').textContent = `پنل موسسه (${profile.username})`;
    
    // اضافه کردن دکمه تیکت به هدر (اگر در HTML نیست، اینجا تزریق می‌شود)
    addTicketButtonToHeader();

    // مدیریت خروج
    document.getElementById('logout-button').onclick = async () => {
        await supabase.auth.signOut();
        window.location.href = 'index.html';
    };

    // مدیریت تب‌ها
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            tabButtons.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab + '-tab').classList.add('active');
            
            if (btn.dataset.tab === 'history') loadHistory();
        });
    });

    // --- ۳. تب ثبت حضور و غیاب ---
    const currentDateEl = document.getElementById('current-date');
    const memberListBody = document.getElementById('member-list-body');
    const attendanceForm = document.getElementById('attendance-form');
    const statusMessage = document.getElementById('status-message');

    currentDateEl.textContent = new Date().toLocaleDateString('fa-IR');

    async function loadMembersForAttendance() {
        memberListBody.innerHTML = '<tr><td colspan="3">در حال بارگذاری اعضا...</td></tr>';
        
        // دریافت اعضای فعال این موسسه
        const { data: members, error } = await supabase
            .from('members')
            .select('*')
            .eq('institution_id', instituteId)
            .eq('is_active', true);

        if (error) {
            memberListBody.innerHTML = `<tr><td colspan="3">خطا: ${error.message}</td></tr>`;
            return;
        }

        if (!members || members.length === 0) {
            memberListBody.innerHTML = '<tr><td colspan="3">هیچ عضو فعالی ثبت نشده است.</td></tr>';
            return;
        }

        // چک کنیم آیا برای امروز قبلاً ثبت شده؟
        const today = new Date().toISOString().split('T')[0];
        const { data: todayRecords } = await supabase
            .from('attendance_records')
            .select('member_id, status')
            .eq('institution_id', instituteId)
            .eq('date', today);
        
        const recordsMap = {};
        if (todayRecords) {
            todayRecords.forEach(r => recordsMap[r.member_id] = r.status);
        }

        memberListBody.innerHTML = '';
        members.forEach(member => {
            const prevStatus = recordsMap[member.id];
            const row = document.createElement('tr');
            row.dataset.memberId = member.id;
            
            row.innerHTML = `
                <td>${member.full_name}</td>
                <td>${member.national_id || '-'}</td>
                <td>
                    <div style="display:flex; gap:10px;">
                        <label><input type="radio" name="status-${member.id}" value="حاضر" ${prevStatus === 'حاضر' ? 'checked' : ''} required> حاضر</label>
                        <label><input type="radio" name="status-${member.id}" value="غایب" ${prevStatus === 'غایب' ? 'checked' : ''}> غایب</label>
                        <label><input type="radio" name="status-${member.id}" value="موجه" ${prevStatus === 'موجه' ? 'checked' : ''}> موجه</label>
                    </div>
                </td>
            `;
            memberListBody.appendChild(row);
        });
    }

    // ثبت نهایی حضور و غیاب
    attendanceForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('submit-attendance');
        btn.disabled = true;
        btn.textContent = 'در حال ثبت...';
        statusMessage.textContent = '';

        const rows = memberListBody.querySelectorAll('tr');
        const updates = [];
        const today = new Date().toISOString().split('T')[0];

        rows.forEach(row => {
            const memberId = row.dataset.memberId;
            const statusInput = row.querySelector(`input[name="status-${memberId}"]:checked`);
            if (statusInput) {
                updates.push({
                    member_id: memberId,
                    institution_id: instituteId,
                    date: today,
                    status: statusInput.value,
                    recorded_by: session.user.id // لاگ: چه کسی ثبت کرد
                });
            }
        });

        if (updates.length === 0) {
            statusMessage.textContent = 'هیچ وضعیتی انتخاب نشده است.';
            btn.disabled = false;
            btn.textContent = 'ثبت نهایی';
            return;
        }

        // Upsert: اگر هست آپدیت کن، اگر نیست بساز
        const { error } = await supabase
            .from('attendance_records')
            .upsert(updates, { onConflict: 'member_id, date' });

        if (error) {
            statusMessage.style.color = 'red';
            statusMessage.textContent = 'خطا در ثبت: ' + error.message;
        } else {
            statusMessage.style.color = 'green';
            statusMessage.textContent = 'اطلاعات با موفقیت ثبت شد.';
        }
        btn.disabled = false;
        btn.textContent = 'ثبت نهایی';
    });

    // --- ۴. تب تاریخچه ---
    const historyBody = document.getElementById('history-table-body');
    async function loadHistory() {
        historyBody.innerHTML = '<tr><td colspan="4">در حال بارگذاری...</td></tr>';
        
        // دریافت ۵۰ رکورد آخر
        const { data: records, error } = await supabase
            .from('attendance_records')
            .select('date, status, created_at, members(full_name, national_id)')
            .eq('institution_id', instituteId)
            .order('date', { ascending: false })
            .limit(50);

        if (error) {
            historyBody.innerHTML = `<tr><td colspan="4">خطا: ${error.message}</td></tr>`;
            return;
        }

        if (records.length === 0) {
            historyBody.innerHTML = '<tr><td colspan="4">سابقه‌ای یافت نشد.</td></tr>';
            return;
        }

        historyBody.innerHTML = '';
        records.forEach(r => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${new Date(r.date).toLocaleDateString('fa-IR')}</td>
                <td>${r.members ? r.members.full_name : 'حذف شده'}</td>
                <td>${r.members ? r.members.national_id : '-'}</td>
                <td>${r.status}</td>
            `;
            historyBody.appendChild(row);
        });
    }

    // --- تابع کمکی: دکمه تیکت ---
    function addTicketButtonToHeader() {
        const actionsDiv = document.querySelector('.header-actions');
        if (actionsDiv && !document.getElementById('tickets-btn')) {
            const btn = document.createElement('button');
            btn.id = 'tickets-btn';
            btn.textContent = '📩 تیکت‌ها';
            btn.style.marginRight = '10px';
            btn.style.backgroundColor = '#17a2b8';
            btn.onclick = () => window.location.href = 'tickets.html';
            actionsDiv.prepend(btn);
        }
    }

    // شروع
    loadMembersForAttendance();
});
