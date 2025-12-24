document.addEventListener('DOMContentLoaded', async () => {
    // --- ۱. کد نگهبان هوشمند ---
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { window.location.href = 'index.html'; return; }

    const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
    
    // دریافت ID موسسه هدف از URL
    const urlParams = new URLSearchParams(window.location.search);
    const targetInstId = urlParams.get('id');
    const targetInstName = urlParams.get('name');

    // تعیین اینکه روی چه موسسه‌ای کار می‌کنیم
    let workingInstituteId = null;

    if (profile.role === 'institute') {
        workingInstituteId = session.user.id; // خود موسسه
    } else if (profile.role === 'admin') {
        if (!targetInstId) {
            alert('شناسه موسسه مشخص نیست.');
            window.location.href = 'admin.html';
            return;
        }
        workingInstituteId = targetInstId; // ادمین روی موسسه خاص کار می‌کند
    } else {
        // روت یا سوپرادمین اگر وارد شوند (برای آینده)
        if (targetInstId) workingInstituteId = targetInstId;
        else { window.location.href = 'index.html'; return; }
    }

    // --- ۲. تنظیمات صفحه ---
    document.getElementById('manage-page-title').textContent = 
        `مدیریت اعضا: ${targetInstName ? decodeURIComponent(targetInstName) : profile.username}`;
    
    document.querySelector('.back-link').href = profile.role === 'admin' ? 'admin.html' : 'attendance.html';

    const activeTable = document.querySelector('#active-members-table tbody');
    const inactiveTable = document.querySelector('#inactive-members-table tbody');
    const addForm = document.getElementById('add-members-form');
    const addStatus = document.getElementById('add-status-message');

    // --- ۳. دریافت لیست اعضا ---
    async function loadMembers() {
        activeTable.innerHTML = '<tr><td colspan="5">در حال بارگذاری...</td></tr>';
        inactiveTable.innerHTML = '';

        const { data: members, error } = await supabase
            .from('members')
            .select('*')
            .eq('institution_id', workingInstituteId)
            .order('created_at', { ascending: false });

        if (error) {
            activeTable.innerHTML = `<tr><td colspan="5">خطا: ${error.message}</td></tr>`;
            return;
        }

        activeTable.innerHTML = '';
        inactiveTable.innerHTML = '';

        if (members.length === 0) {
            activeTable.innerHTML = '<tr><td colspan="5">هیچ عضوی یافت نشد.</td></tr>';
            return;
        }

        members.forEach(m => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${m.id}</td>
                <td>${m.full_name}</td>
                <td>${m.national_id || '-'}</td>
                <td>${m.mobile || '-'}</td>
                <td>
                    ${m.is_active 
                        ? `<button onclick="toggleMemberStatus(${m.id}, false)" class="delete-btn">غیرفعال</button>` 
                        : `<button onclick="toggleMemberStatus(${m.id}, true)" class="restore-btn">فعال‌سازی</button>`
                    }
                </td>
            `;

            if (m.is_active) activeTable.appendChild(row);
            else inactiveTable.appendChild(row);
        });
    }

    // --- ۴. افزودن اعضای جدید (چند خطی) ---
    addForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const names = document.getElementById('names-textarea').value.trim().split('\n');
        const nids = document.getElementById('ids-textarea').value.trim().split('\n');
        const mobiles = document.getElementById('mobiles-textarea').value.trim().split('\n');

        if (!names[0]) return;

        addStatus.textContent = 'در حال افزودن...';
        
        const newMembers = names.map((name, index) => ({
            institution_id: workingInstituteId,
            full_name: name.trim(),
            national_id: nids[index] ? nids[index].trim() : null,
            mobile: mobiles[index] ? mobiles[index].trim() : null,
            created_by: session.user.id,
            is_active: true
        })).filter(m => m.full_name);

        const { error } = await supabase.from('members').insert(newMembers);

        if (error) {
            addStatus.style.color = 'red';
            addStatus.textContent = 'خطا: ' + error.message;
        } else {
            addStatus.style.color = 'green';
            addStatus.textContent = 'اعضا با موفقیت اضافه شدند.';
            addForm.reset();
            loadMembers();
        }
    });

    // --- ۵. تغییر وضعیت عضو (حذف/بازگردانی) ---
    window.toggleMemberStatus = async (memberId, newStatus) => {
        if (!confirm(`آیا وضعیت عضو تغییر کند؟`)) return;

        const { error } = await supabase
            .from('members')
            .update({ is_active: newStatus })
            .eq('id', memberId);

        if (error) alert('خطا: ' + error.message);
        else loadMembers();
    };

    loadMembers();
});
