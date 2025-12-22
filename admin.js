document.addEventListener('DOMContentLoaded', async () => {
    // --- کد نگهبان جدید با استفاده از Supabase ---
    async function checkAuthAndRole() {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error || !session) {
            window.location.href = 'index.html';
            return null;
        }

        const user = session.user;
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('role, username')
            .eq('id', user.id)
            .single();

        if (profileError || !profile) {
            console.error('خطا در دریافت پروفایل:', profileError);
            await supabase.auth.signOut();
            window.location.href = 'index.html';
            return null;
        }

        const allowedRoles = ['admin', 'superadmin', 'root'];
        if (!allowedRoles.includes(profile.role)) {
            await supabase.auth.signOut();
            window.location.href = 'index.html';
            return null;
        }

        return { user, profile };
    }

    const authData = await checkAuthAndRole();
    if (!authData) return;

    const { user: currentUser, profile: userProfile } = authData;

    // --- توابع کمکی ---
    const persianNumbers = [/۰/g, /۱/g, /۲/g, /۳/g, /۴/g, /۵/g, /۶/g, /۷/g, /۸/g, /۹/g];
    const arabicNumbers  = [/٠/g, /١/g, /٢/g, /٣/g, /٤/g, /٥/g, /٦/g, /٧/g, /٨/g, /٩/g];
    function normalizeNumbers(str) {
        if(typeof str !== 'string') return '';
        for(let i = 0; i < 10; i++) {
            str = str.replace(persianNumbers[i], i).replace(arabicNumbers[i], i);
        }
        return str;
    }
    
    function formatDateInput(input) {
        let value = normalizeNumbers(input.value).replace(/[^\d]/g, '');
        if (value.length > 8) value = value.slice(0, 8);
        if (value.length > 6) {
            value = value.slice(0, 4) + '/' + value.slice(4, 6) + '/' + value.slice(6);
        } else if (value.length > 4) {
            value = value.slice(0, 4) + '/' + value.slice(4);
        }
        input.value = value;
    }

    // --- شناسایی عناصر صفحه ---
    const dashboardContainer = document.getElementById('dashboard-container');
    const adminDataBody = document.getElementById('admin-data-body');
    const loadingMessage = document.getElementById('loading-message');
    const logoutButton = document.getElementById('logout-button');
    const institutionFilter = document.getElementById('institution-filter');
    const startDateFilter = document.getElementById('start-date-filter');
    const endDateFilter = document.getElementById('end-date-filter');
    const resetFiltersButton = document.getElementById('reset-filters');
    const exportExcelButton = document.getElementById('export-excel');
    const paginationContainer = document.getElementById('pagination-container');
    const statusFilterButtons = document.querySelectorAll('.filter-btn');
    const memberProfileView = document.getElementById('member-profile-view');
    const memberProfileName = document.getElementById('member-profile-name');
    const memberProfileCard = document.getElementById('member-profile-card');
    const editUserModal = document.getElementById('edit-user-modal');
    const editUserForm = document.getElementById('edit-user-form');
    const addInstitutionModal = document.getElementById('add-institution-modal');
    const addInstitutionForm = document.getElementById('add-institution-form');
    const addInstStatus = document.getElementById('add-inst-status');
    const mainMenuButton = document.getElementById('main-menu-button');
    const mainMenuDropdown = document.getElementById('main-menu-dropdown');
    document.querySelectorAll('.cancel-btn').forEach(btn => { btn.addEventListener('click', () => { editUserModal.style.display = 'none'; addInstitutionModal.style.display = 'none'; }); });

    // --- متغیرهای وضعیت ---
    let allRecords = []; 
    let memberNames = {}; 
    let institutionNames = {};
    let currentFilters = { institution: 'all', startDate: '', endDate: '', status: 'all', memberId: null };
    let currentPage = 1; 
    const ITEMS_PER_PAGE = 30;

    // --- تنظیمات اولیه ---
    document.querySelector('.page-header h2#admin-title').textContent = `پنل مدیریت (${userProfile.username})`;
    logoutButton.addEventListener('click', async () => {
        await supabase.auth.signOut();
        window.location.href = 'index.html';
    });

    // --- توابع نمایش ---
    function renderDashboard(stats) {
        dashboardContainer.innerHTML = '';
        stats.forEach(stat => {
            const card = document.createElement('div'); 
            card.className = 'stat-card';
            card.innerHTML = `<button class="card-menu-button" data-inst-id="${stat.id}">⋮</button><div class="card-menu-dropdown" id="menu-${stat.id}"><button data-action="edit-user" data-inst-id="${stat.id}" data-username="${stat.name}">ویرایش اطلاعات</button><button data-action="manage-members" data-inst-id="${stat.id}" data-username="${stat.name}">مدیریت اعضا</button><button data-action="archive-inst" data-inst-id="${stat.id}" data-username="${stat.name}">آرشیو موسسه</button></div><h3>${stat.name}</h3><p>تعداد کل اعضا: <span class="highlight">${stat.memberCount}</span></p><p>آخرین بروزرسانی: <span class="highlight">${stat.lastUpdate}</span></p><p>آمار آخرین روز: <span class="highlight present">${stat.present} حاضر</span> / <span class="highlight absent">${stat.absent} غایب</span></p>`;
            dashboardContainer.appendChild(card);
            institutionNames[stat.id] = stat.name;
        });
        const adminCard = document.createElement('div');
        adminCard.className = 'stat-card admin-card';
        adminCard.innerHTML = `<h3>${userProfile.username} (مدیر)</h3><button data-action="edit-user" data-inst-id="0" data-username="${userProfile.username}" class="admin-edit-btn">ویرایش اطلاعات ورود من</button>`;
        dashboardContainer.appendChild(adminCard);
        const addCard = document.createElement('div');
        addCard.className = 'stat-card add-inst-card';
        addCard.innerHTML = `<h3>افزودن موسسه</h3><div class="plus-sign">+</div>`;
        addCard.addEventListener('click', () => { addInstitutionForm.reset(); addInstStatus.textContent = ''; addInstitutionModal.style.display = 'flex'; });
        dashboardContainer.appendChild(addCard);
        populateFilters();
    }
    
    function populateFilters() { const currentSelection = institutionFilter.value; institutionFilter.innerHTML = '<option value="all">همه موسسات</option>'; Object.keys(institutionNames).forEach(id => { const option = document.createElement('option'); option.value = id; option.textContent = institutionNames[id]; institutionFilter.appendChild(option); }); institutionFilter.value = currentSelection; }
    function renderPage() { memberProfileView.style.display = currentFilters.memberId ? 'block' : 'none'; const filteredRecords = applyAllFilters(); const totalPages = Math.ceil(filteredRecords.length / ITEMS_PER_PAGE); currentPage = Math.min(currentPage, totalPages || 1); const startIndex = (currentPage - 1) * ITEMS_PER_PAGE; const pageRecords = filteredRecords.slice(startIndex, startIndex + ITEMS_PER_PAGE); renderTable(pageRecords); renderPagination(totalPages); }
    function renderTable(records) { adminDataBody.innerHTML = ''; let lastDate = null; if (records.length === 0) { adminDataBody.innerHTML = '<tr><td colspan="4">رکوردی یافت نشد.</td></tr>'; return; } records.forEach(record => { const recordDate = record.date.split(/,|،/)[0].trim(); if (recordDate !== lastDate && !currentFilters.memberId) { const dateRow = document.createElement('tr'); dateRow.innerHTML = `<td colspan="4" class="date-group-header">تاریخ: ${recordDate}</td>`; adminDataBody.appendChild(dateRow); lastDate = recordDate; } const row = document.createElement('tr'); const memberName = memberNames[record.memberId] || `(شناسه: ${record.memberId})`; const instName = institutionNames[record.institutionId] || `(شناسه: ${record.institutionId})`; row.innerHTML = `<td>${instName}</td><td><a href="#" class="clickable-member" data-member-id="${record.memberId}">${memberName}</a></td><td>${record.date}</td><td>${record.status}</td>`; adminDataBody.appendChild(row); }); }
    
    function renderPagination(totalPages) {
        paginationContainer.innerHTML = '';
        if (totalPages <= 1) return;
        const createButton = (text, page) => { const button = document.createElement('button'); button.textContent = text; if (page) { if (page === currentPage) button.classList.add('active'); button.addEventListener('click', () => { currentPage = page; renderPage(); }); } else { button.disabled = true; } return button; };
        const prevButton = createButton('قبلی', currentPage - 1);
        if (currentPage === 1) prevButton.disabled = true;
        paginationContainer.appendChild(prevButton);
        const pages = new Set();
        pages.add(1); pages.add(totalPages); pages.add(currentPage);
        if (currentPage > 1) pages.add(currentPage - 1);
        if (currentPage < totalPages) pages.add(currentPage + 1);
        const sortedPages = Array.from(pages).sort((a, b) => a - b);
        let lastPage = 0;
        sortedPages.forEach(page => {
            if (page > lastPage + 1) { paginationContainer.appendChild(createButton('...')); }
            if (page > 0 && page <= totalPages) { paginationContainer.appendChild(createButton(page, page)); }
            lastPage = page;
        });
        const nextButton = createButton('بعدی', currentPage + 1);
        if (currentPage === totalPages) nextButton.disabled = true;
        paginationContainer.appendChild(nextButton);
    }
    
    function applyAllFilters() {
        let filtered = [...allRecords];
        if (currentFilters.institution !== 'all') { filtered = filtered.filter(r => r.institutionId == currentFilters.institution); }
        const startDate = normalizeNumbers(startDateFilter.value.trim());
        if (startDate) {
            filtered = filtered.filter(record => normalizeNumbers(record.date.split(/,|،/)[0].trim()) >= startDate);
        }
        const endDate = normalizeNumbers(endDateFilter.value.trim());
        if (endDate) {
            filtered = filtered.filter(record => normalizeNumbers(record.date.split(/,|،/)[0].trim()) <= endDate);
        }
        if (currentFilters.status !== 'all') { filtered = filtered.filter(r => r.status === currentFilters.status); }
        if (currentFilters.memberId) { filtered = filtered.filter(r => r.memberId == currentFilters.memberId); }
        return filtered;
    }

    // --- Event Listeners ---
    function setupEventListeners() {
        institutionFilter.addEventListener('change', (e) => { currentFilters.institution = e.target.value; currentFilters.memberId = null; currentPage = 1; renderPage(); });
        startDateFilter.addEventListener('input', () => { formatDateInput(startDateFilter); currentPage = 1; renderPage(); });
        endDateFilter.addEventListener('input', () => { formatDateInput(endDateFilter); currentPage = 1; renderPage(); });
        statusFilterButtons.forEach(btn => { btn.addEventListener('click', () => { statusFilterButtons.forEach(b => b.classList.remove('active')); btn.classList.add('active'); currentFilters.status = btn.dataset.status; currentPage = 1; renderPage(); }); });
        resetFiltersButton.addEventListener('click', () => { institutionFilter.value = 'all'; startDateFilter.value = ''; endDateFilter.value = ''; statusFilterButtons.forEach(b => b.classList.remove('active')); document.querySelector('.filter-btn[data-status="all"]').classList.add('active'); currentFilters = { institution: 'all', startDate: '', endDate: '', status: 'all', memberId: null }; currentPage = 1; renderPage(); });

        adminDataBody.addEventListener('click', async (e) => {
            if (e.target.classList.contains('clickable-member')) {
                e.preventDefault();
                const memberId = e.target.dataset.memberId;
                currentFilters.memberId = memberId;
                memberProfileName.textContent = `پروفایل عضو: ${e.target.textContent}`;
                memberProfileCard.innerHTML = `<p>در حال دریافت آمار...</p>`;
                memberProfileView.style.display = 'block';
                currentPage = 1;
                renderPage();

                try {
                    const { data: member, error: memberError } = await supabase.from('members').select('*').eq('id', memberId).single();
                    if (memberError) throw memberError;

                    const { count: totalPresents, error: presentError } = await supabase.from('attendance').select('*', { count: 'exact', head: true }).eq('member_id', memberId).eq('status', 'حاضر');
                    if (presentError) throw presentError;

                    const { count: totalAbsents, error: absentError } = await supabase.from('attendance').select('*', { count: 'exact', head: true }).eq('member_id', memberId).eq('status', 'غایب');
                    if (absentError) throw absentError;

                    const { data: lastPresentRec, error: lpError } = await supabase.from('attendance').select('recorded_at').eq('member_id', memberId).eq('status', 'حاضر').order('recorded_at', { ascending: false }).limit(1).single();
                    const { data: lastAbsentRec, error: laError } = await supabase.from('attendance').select('recorded_at').eq('member_id', memberId).eq('status', 'غایب').order('recorded_at', { ascending: false }).limit(1).single();

                    memberProfileCard.innerHTML = `
                        <p>تاریخ ثبت نام: <span class="highlight">${new Date(member.created_at).toLocaleDateString('fa-IR')}</span></p>
                        <p>کد ملی: <span class="highlight">${member.national_id || 'ثبت نشده'}</span></p>
                        <p>شماره موبایل: <span class="highlight">${member.mobile || 'ثبت نشده'}</span></p><hr>
                        <p>تعداد کل حضور: <span class="highlight present">${totalPresents}</span></p>
                        <p>تعداد کل غیبت: <span class="highlight absent">${totalAbsents}</span></p>
                        <p>آخرین حضور: <span class="highlight">${lastPresentRec ? new Date(lastPresentRec.recorded_at).toLocaleString('fa-IR') : 'سابقه‌ای یافت نشد'}</span></p>
                        <p>آخرین غیبت: <span class="highlight">${lastAbsentRec ? new Date(lastAbsentRec.recorded_at).toLocaleString('fa-IR') : 'سابقه‌ای یافت نشد'}</span></p>`;
                } catch (error) {
                    memberProfileCard.innerHTML = `<p class="error-message">خطا در دریافت اطلاعات: ${error.message}</p>`;
                }
            }
        });

        mainMenuButton.addEventListener('click', () => { mainMenuDropdown.style.display = mainMenuDropdown.style.display === 'block' ? 'none' : 'block'; });

        addInstitutionForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('new-inst-username').value.trim();
            const password = document.getElementById('new-inst-password').value.trim();
            if (!email || !password) return;

            addInstStatus.textContent = 'در حال ایجاد...';
            try {
                const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
                if (authError) throw authError;
                if (!authData.user) throw new Error('کاربر ایجاد نشد.');

                const { data: instData, error: instError } = await supabase
                    .from('institutions')
                    .insert({ name: email, created_by: currentUser.id })
                    .select()
                    .single();
                if (instError) throw instError;

                const { error: profileError } = await supabase
                    .from('profiles')
                    .update({
                        username: email,
                        role: 'institute',
                        institution_id: instData.id,
                        parent_id: currentUser.id
                    })
                    .eq('id', authData.user.id);
                if (profileError) throw profileError;

                addInstStatus.style.color = 'green';
                addInstStatus.textContent = `موسسه '${email}' با موفقیت ایجاد شد. صفحه در حال بارگذاری مجدد است...`;
                setTimeout(() => location.reload(), 2500);
            } catch (error) {
                console.error("خطا در ایجاد موسسه:", error);
                addInstStatus.style.color = 'red';
                addInstStatus.textContent = error.message;
            }
        });
        
        dashboardContainer.addEventListener('click', async (e) => {
            const menuButton = e.target.closest('.card-menu-button');
            if (menuButton) {
                const instId = menuButton.dataset.instId;
                const menu = document.getElementById(`menu-${instId}`);
                document.querySelectorAll('.card-menu-dropdown').forEach(m => { if (m && m.id !== menu.id) m.style.display = 'none'; });
                if (menu) menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
                return;
            }
            const actionButton = e.target.closest('[data-action]');
            if (actionButton) {
                const action = actionButton.dataset.action;
                const instId = actionButton.dataset.instId;
                const username = actionButton.dataset.username;
                document.querySelectorAll('.card-menu-dropdown').forEach(m => m.style.display = 'none');
                if (action === 'edit-user') {
                    openEditModal(instId, username);
                } else if (action === 'manage-members') {
                    window.location.href = `manage-members.html?id=${instId}&name=${encodeURIComponent(username)}`;
                } else if (action === 'archive-inst') {
                    if (confirm(`آیا از آرشیو کردن موسسه "${username}" مطمئن هستید؟`)) {
                        const { error } = await supabase
                            .from('institutions')
                            .update({ status: 'Archived', archived_at: new Date(), archived_by: currentUser.id })
                            .eq('id', instId);
                        if (error) { alert(`خطا: ${error.message}`); }
                        else { alert('موسسه با موفقیت آرشیو شد.'); location.reload(); }
                    }
                }
            }
        });

        function openEditModal(id, currentUsername) {
            const modalStatusMessage = document.getElementById('modal-status-message');
            modalStatusMessage.textContent = '';
            editUserForm.reset();
            document.getElementById('edit-user-id').value = id;
            document.getElementById('modal-title').textContent = `ویرایش اطلاعات: ${currentUsername}`;
            const usernameInput = document.getElementById('edit-username');
            usernameInput.value = currentUsername;
            usernameInput.disabled = true;
            editUserModal.style.display = 'flex';
        }
        
        editUserForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const saveButton = document.getElementById('save-user-button');
            saveButton.disabled = true;
            saveButton.textContent = 'در حال ذخیره...';

            const newPassword = document.getElementById('edit-password').value;
            const institutionId = document.getElementById('edit-user-id').value;
            const modalStatusMessage = document.getElementById('modal-status-message');

            try {
                if (!newPassword) {
                    modalStatusMessage.style.color = 'black';
                    modalStatusMessage.textContent = 'تغییری برای ذخیره وجود ندارد.';
                    return;
                }

                const { data: profile, error: profileError } = await supabase
                    .from('profiles')
                    .select('id')
                    .eq('institution_id', institutionId)
                    .single();
                if (profileError) throw profileError;

                const { error: functionError } = await supabase.functions.invoke('update-user-password', {
                    body: { userId: profile.id, newPassword: newPassword }
                });

                if (functionError) throw functionError;

                modalStatusMessage.style.color = 'green';
                modalStatusMessage.textContent = 'رمز عبور با موفقیت به‌روزرسانی شد! صفحه تا ۲ ثانیه دیگر رفرش می‌شود...';
                setTimeout(() => { location.reload(); }, 2000);

            } catch (error) {
                console.error("خطا در ویرایش کاربر:", error);
                modalStatusMessage.style.color = '#d93025';
                modalStatusMessage.textContent = error.message;
            } finally {
                saveButton.disabled = false;
                saveButton.textContent = 'ذخیره تغییرات';
            }
        });
        
        exportExcelButton.addEventListener('click', () => {
            const dataToExport = applyAllFilters().map(record => ({
                "موسسه": institutionNames[record.institutionId] || `(شناسه: ${record.institutionId})`,
                "نام عضو": memberNames[record.memberId] || `(شناسه: ${record.memberId})`,
                "تاریخ و زمان": record.date,
                "وضعیت": record.status,
            }));
            if (dataToExport.length === 0) {
                alert("داده‌ای برای خروجی گرفتن وجود ندارد.");
                return;
            }
            const worksheet = XLSX.utils.json_to_sheet(dataToExport);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "گزارش حضور و غیاب");
            XLSX.writeFile(workbook, "AttendanceReport.xlsx");
        });
    }
    
    // --- بارگذاری اولیه ---
    async function initializeAdminPanel() {
        loadingMessage.textContent = 'در حال بارگذاری...';
        try {
            const { data: institutions, error: instError } = await supabase
                .from('institutions')
                .select('id, name')
                .eq('status', 'Active');
            if (instError) throw instError;

            const statsPromises = institutions.map(async (inst) => {
                const { count: memberCount, error: countError } = await supabase
                    .from('members')
                    .select('*', { count: 'exact', head: true })
                    .eq('institution_id', inst.id)
                    .eq('is_active', true);
                if (countError) throw countError;

                const { data: lastAttendance, error: lastAttError } = await supabase
                    .from('attendance')
                    .select('recorded_at, date')
                    .eq('institution_id', inst.id)
                    .order('recorded_at', { ascending: false })
                    .limit(1)
                    .single();

                let present = 0, absent = 0;
                if (lastAttendance) {
                    const { data: dailyStats, error: dailyStatError } = await supabase
                        .rpc('count_attendance_status', { p_institution_id: inst.id, p_date: lastAttendance.date });
                    if (dailyStatError) throw dailyStatError;
                    present = dailyStats.find(s => s.status === 'حاضر')?.count || 0;
                    absent = dailyStats.find(s => s.status === 'غایب')?.count || 0;
                }

                return {
                    id: inst.id,
                    name: inst.name,
                    memberCount: memberCount,
                    lastUpdate: lastAttendance ? new Date(lastAttendance.recorded_at).toLocaleString('fa-IR') : 'بدون سابقه',
                    present: present,
                    absent: absent
                };
            });

            const stats = await Promise.all(statsPromises);
            renderDashboard(stats);

            const { data: allMembers, error: membersError } = await supabase.from('members').select('id, full_name');
            if (membersError) throw membersError;
            memberNames = allMembers.reduce((acc, member) => { acc[member.id] = member.full_name; return acc; }, {});

            const { data: allAttendance, error: attendanceError } = await supabase
                .from('attendance')
                .select('*, members(full_name), institutions(name)')
                .order('recorded_at', { ascending: false });
            if (attendanceError) throw attendanceError;

            allRecords = allAttendance.map(r => ({
                date: new Date(r.recorded_at).toLocaleString('fa-IR'),
                memberId: r.member_id,
                status: r.status,
                institutionId: r.institution_id
            }));
            
            renderPage();
            loadingMessage.style.display = 'none';

        } catch (error) {
            console.error('خطا در بارگذاری پنل مدیر:', error);
            loadingMessage.textContent = `خطا در ارتباط با سرور: ${error.message}`;
        }
    }
    
    setupEventListeners();
    initializeAdminPanel();
});
