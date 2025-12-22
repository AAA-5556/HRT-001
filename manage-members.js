document.addEventListener('DOMContentLoaded', async () => {
    // =================================================================
    // بخش ۱: کد نگهبان و بررسی هویت با Supabase
    // =================================================================
    let currentUser, userProfile, impersonatedInstitutionId = null;

    async function checkAuthAndRole() {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error || !session) {
            window.location.href = 'index.html';
            return false;
        }

        currentUser = session.user;
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('role, username, institution_id')
            .eq('id', currentUser.id)
            .single();

        if (profileError || !profile) {
            console.error('Error fetching profile:', profileError);
            await supabase.auth.signOut();
            window.location.href = 'index.html';
            return false;
        }
        userProfile = profile;

        const urlParams = new URLSearchParams(window.location.search);
        const institutionIdFromUrl = urlParams.get('id');

        if (userProfile.role === 'admin' && institutionIdFromUrl) {
            impersonatedInstitutionId = institutionIdFromUrl;
        } else if (userProfile.role === 'institute') {
            impersonatedInstitutionId = userProfile.institution_id;
        }

        if (!impersonatedInstitutionId) {
            alert("خطا: موسسه مشخص نشده یا شما اجازه دسترسی ندارید.");
            window.location.href = userProfile.role === 'admin' ? 'admin.html' : 'attendance.html';
            return false;
        }

        return true;
    }

    if (!await checkAuthAndRole()) return;

    // =================================================================
    // بخش ۲: شناسایی عناصر و مقداردهی اولیه
    // =================================================================
    const pageTitle = document.getElementById('manage-page-title');
    const addForm = document.getElementById('add-members-form');
    const namesTextarea = document.getElementById('names-textarea');
    const idsTextarea = document.getElementById('ids-textarea');
    const mobilesTextarea = document.getElementById('mobiles-textarea');
    const addStatusMessage = document.getElementById('add-status-message');
    const activeMembersBody = document.querySelector('#active-members-table tbody');
    const inactiveMembersBody = document.querySelector('#inactive-members-table tbody');
    const editModal = document.getElementById('edit-member-modal');
    const editForm = document.getElementById('edit-member-form');
    const cancelEditBtn = document.getElementById('cancel-member-edit');

    const institutionName = new URLSearchParams(window.location.search).get('name');
    pageTitle.textContent = `مدیریت اعضای موسسه: ${institutionName || 'نامشخص'}`;

    // =================================================================
    // بخش ۳: توابع اصلی
    // =================================================================
    async function fetchAllMembers() {
        activeMembersBody.innerHTML = '<tr><td colspan="5">در حال بارگذاری...</td></tr>';
        inactiveMembersBody.innerHTML = '<tr><td colspan="5">در حال بارگذاری...</td></tr>';

        try {
            const { data: members, error } = await supabase
                .from('members')
                .select('*')
                .eq('institution_id', impersonatedInstitutionId)
                .order('created_at', { ascending: false });

            if (error) throw error;

            const activeMembers = members.filter(m => m.is_active);
            const inactiveMembers = members.filter(m => !m.is_active);
            renderTable(activeMembersBody, activeMembers, true);
            renderTable(inactiveMembersBody, inactiveMembers, false);

        } catch (error) {
            alert('خطا در دریافت لیست اعضا: ' + error.message);
        }
    }

    function renderTable(tbody, members, isActive) {
        tbody.innerHTML = '';
        if (members.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5">هیچ عضوی یافت نشد.</td></tr>`;
            return;
        }

        members.forEach(member => {
            const row = tbody.insertRow();
            row.dataset.member = JSON.stringify(member);
            row.innerHTML = `
                <td>${member.id}</td>
                <td>${member.full_name || ''}</td>
                <td>${member.national_id || ''}</td>
                <td>${member.mobile || ''}</td>
                <td>
                    ${isActive
                        ? `<button class="edit-btn" data-id="${member.id}">ویرایش</button><button class="delete-btn" data-id="${member.id}">حذف</button>`
                        : `<button class="restore-btn" data-id="${member.id}">بازگردانی</button>`
                    }
                </td>
            `;
        });
    }
    
    // =================================================================
    // بخش ۴: مدیریت رویدادها
    // =================================================================
    addForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const names = namesTextarea.value.trim().split('\n').filter(Boolean);
        if (names.length === 0) return;

        const ids = idsTextarea.value.trim().split('\n');
        const mobiles = mobilesTextarea.value.trim().split('\n');

        const newMembers = names.map((name, i) => ({
            institution_id: impersonatedInstitutionId,
            full_name: name,
            national_id: ids[i] || null,
            mobile: mobiles[i] || null,
            created_by: currentUser.id,
            is_active: true
        }));

        addStatusMessage.textContent = 'در حال افزودن...';

        try {
            const { data, error } = await supabase.from('members').insert(newMembers).select();
            if (error) throw error;

            addStatusMessage.style.color = 'green';
            addStatusMessage.textContent = `${data.length} عضو با موفقیت اضافه شد.`;
            addForm.reset();
            fetchAllMembers();

        } catch (error) {
            addStatusMessage.style.color = 'red';
            addStatusMessage.textContent = 'خطا در افزودن اعضا: ' + error.message;
        }
    });

    document.body.addEventListener('click', async (e) => {
        const target = e.target;
        const memberId = target.dataset.id;
        if (!memberId) return;

        target.disabled = true;

        try {
            if (target.classList.contains('delete-btn')) {
                if (!confirm(`آیا از حذف (غیرفعال کردن) این عضو مطمئن هستید؟`)) return;
                const { error } = await supabase.from('members').update({ is_active: false }).eq('id', memberId);
                if (error) throw error;
            } else if (target.classList.contains('restore-btn')) {
                const { error } = await supabase.from('members').update({ is_active: true }).eq('id', memberId);
                if (error) throw error;
            } else if (target.classList.contains('edit-btn')) {
                const memberData = JSON.parse(target.closest('tr').dataset.member);
                document.getElementById('edit-member-id').value = memberData.id;
                document.getElementById('edit-fullname').value = memberData.full_name;
                document.getElementById('edit-nationalid').value = memberData.national_id;
                document.getElementById('edit-mobile').value = memberData.mobile;
                editModal.style.display = 'flex';
                return; // از fetchAllMembers جلوگیری می‌کند
            }
            fetchAllMembers();
        } catch (error) {
            alert(`خطا در انجام عملیات: ${error.message}`);
        } finally {
            if (target) target.disabled = false;
        }
    });

    cancelEditBtn.addEventListener('click', () => {
        editModal.style.display = 'none';
    });

    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const memberId = document.getElementById('edit-member-id').value;
        const updatedDetails = {
            full_name: document.getElementById('edit-fullname').value,
            national_id: document.getElementById('edit-nationalid').value,
            mobile: document.getElementById('edit-mobile').value
        };

        try {
            const { error } = await supabase.from('members').update(updatedDetails).eq('id', memberId);
            if (error) throw error;
            editModal.style.display = 'none';
            fetchAllMembers();
        } catch (error) {
            alert(`خطا در ویرایش عضو: ${error.message}`);
        }
    });

    // --- اجرای اولیه ---
    fetchAllMembers();
});
