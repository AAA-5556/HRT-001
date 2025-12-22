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
            .select('role, username, institution_id')
            .eq('id', user.id)
            .single();

        if (profileError || !profile) {
            console.error('خطا در دریافت پروفایل:', profileError);
            await supabase.auth.signOut();
            window.location.href = 'index.html';
            return null;
        }

        if (profile.role !== 'institute' || !profile.institution_id) {
            await supabase.auth.signOut();
            window.location.href = 'index.html';
            return null;
        }

        return { user, profile };
    }

    const authData = await checkAuthAndRole();
    if (!authData) return;

    const { user: currentUser, profile: userProfile } = authData;

    // --- شناسایی عناصر عمومی ---
    const instituteNameEl = document.getElementById('institute-name');
    const logoutButton = document.getElementById('logout-button');
    const instMenuContainer = document.getElementById('inst-menu-container');
    const instMenuButton = document.getElementById('inst-menu-button');
    const instMenuDropdown = document.getElementById('inst-menu-dropdown');

    // --- متغیرهای عمومی ---
    let membersMap = {}; 
    let historyInitialized = false;
    
    // =================================================================
    // بخش ۱: راه‌اندازی اولیه صفحه
    // =================================================================
    function initializePage() {
        instituteNameEl.textContent = `پنل موسسه (${userProfile.username})`;
        logoutButton.addEventListener('click', async () => {
            await supabase.auth.signOut();
            window.location.href = 'index.html';
        });

        checkPermissions();
        setupTabs();
        setupModals();
        setupMenus();
        initializeRegisterTab(); 
    }

    async function checkPermissions() {
        // از تابع هوشمند برای دریافت تنظیمات استفاده می‌کنیم
        const { data: canManage, error: manageError } = await supabase.rpc('get_setting_value', { p_user_id: currentUser.id, p_key: 'allowMemberManagement' });
        const { data: canChangePass, error: passError } = await supabase.rpc('get_setting_value', { p_user_id: currentUser.id, p_key: 'allowPasswordChange' });

        let canDoSomething = false;
        if (canManage === true) {
            const manageMembersLink = document.getElementById('manage-members-link');
            manageMembersLink.style.display = 'block';
            manageMembersLink.href = `manage-members.html?id=${userProfile.institution_id}&name=${encodeURIComponent(userProfile.username)}`;
            canDoSomething = true;
        }
        if (canChangePass === true) {
            const changeCredentialsBtn = document.getElementById('change-credentials-btn');
            changeCredentialsBtn.style.display = 'block';
            document.getElementById('change-username').disabled = true;
            document.getElementById('change-username').placeholder = 'تغییر نام کاربری غیرفعال است';
            document.getElementById('change-password').disabled = false;
            canDoSomething = true;
        }
        if (canDoSomething) {
            instMenuContainer.style.display = 'block';
        }
    }

    // =================================================================
    // بخش ۲: مدیریت تب‌ها، مودال‌ها و منوها
    // =================================================================
    function setupTabs() {
        document.querySelectorAll('.tab-button').forEach(button => {
            button.addEventListener('click', () => {
                document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
                button.classList.add('active');
                document.getElementById(button.dataset.tab + '-tab').classList.add('active');
                
                if (button.dataset.tab === 'history' && !historyInitialized) {
                    initializeHistoryTab();
                    historyInitialized = true;
                }
            });
        });
    }

    function setupModals() {
        const changeCredentialsModal = document.getElementById('change-credentials-modal');
        const changeCredentialsForm = document.getElementById('change-credentials-form');
        const changeCredentialsBtn = document.getElementById('change-credentials-btn');
        changeCredentialsBtn.addEventListener('click', () => {
            instMenuDropdown.style.display = 'none';
            changeCredentialsModal.style.display = 'flex';
            document.getElementById('change-creds-status').textContent = '';
            changeCredentialsForm.reset();
        });
        document.querySelectorAll('.cancel-btn').forEach(btn => {
            btn.addEventListener('click', () => { changeCredentialsModal.style.display = 'none'; });
        });
        changeCredentialsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newPassword = document.getElementById('change-password').value.trim();
            const statusEl = document.getElementById('change-creds-status');
            if (!newPassword) return;

            try {
                const { error } = await supabase.auth.updateUser({ password: newPassword });
                if (error) throw error;

                statusEl.style.color = 'green';
                statusEl.textContent = 'رمز عبور با موفقیت تغییر کرد. لطفاً دوباره وارد شوید.';
                setTimeout(async () => {
                    await supabase.auth.signOut();
                    window.location.href = 'index.html';
                }, 3000);
            } catch (error) {
                statusEl.style.color = 'red';
                statusEl.textContent = `خطا: ${error.message}`;
            }
        });
    }
    
    function setupMenus() {
        instMenuButton.addEventListener('click', () => {
            instMenuDropdown.style.display = instMenuDropdown.style.display === 'block' ? 'none' : 'block';
        });
        document.addEventListener('click', (e) => {
            if (!instMenuContainer.contains(e.target)) {
                instMenuDropdown.style.display = 'none';
            }
        });
    }

    // =================================================================
    // بخش ۳: منطق تب ثبت حضور و غیاب
    // =================================================================
    async function initializeRegisterTab() { 
        const currentDateEl = document.getElementById('current-date');
        const memberListBody = document.getElementById('member-list-body');
        
        currentDateEl.textContent = new Date().toLocaleDateString('fa-IR');
        memberListBody.innerHTML = '<tr><td colspan="3">در حال بارگذاری...</td></tr>'; 
        
        try {
            const { data: members, error: membersError } = await supabase
                .from('members')
                .select('id, full_name, national_id')
                .eq('institution_id', userProfile.institution_id)
                .eq('is_active', true);
            if (membersError) throw membersError;

            const today = new Date().toISOString().split('T')[0];
            const { data: todaysAttendanceRaw, error: attendanceError } = await supabase
                .from('attendance')
                .select('member_id, status')
                .eq('institution_id', userProfile.institution_id)
                .eq('date', today);
            if (attendanceError) throw attendanceError;

            members.forEach(m => membersMap[m.id] = m);
            const todaysAttendance = todaysAttendanceRaw.reduce((acc, record) => { acc[record.member_id] = record.status; return acc; }, {});

            memberListBody.innerHTML = '';
            if (members.length === 0) { memberListBody.innerHTML = `<tr><td colspan="3">هیچ عضو فعالی یافت نشد.</td></tr>`; return; }

            members.forEach(member => {
                const row = document.createElement('tr');
                row.dataset.memberId = member.id;
                const previousStatus = todaysAttendance[member.id];
                row.innerHTML = `
                    <td>${member.full_name}</td>
                    <td>${member.national_id || ''}</td>
                    <td><input type="radio" id="present-${member.id}" name="status-${member.id}" value="حاضر" ${previousStatus === 'حاضر' ? 'checked' : ''} required><label for="present-${member.id}">حاضر</label><input type="radio" id="absent-${member.id}" name="status-${member.id}" value="غایب" ${previousStatus === 'غایب' ? 'checked' : ''}><label for="absent-${member.id}">غایب</label></td>
                `;
                memberListBody.appendChild(row);
            });
        } catch (error) {
            memberListBody.innerHTML = `<tr><td colspan="3">خطا در دریافت لیست اعضا: ${error.message}</td></tr>`;
        }
    }
    
    document.getElementById('attendance-form').addEventListener('submit', async (event) => { 
        event.preventDefault(); 
        const saveButton = document.getElementById('submit-attendance');
        const statusMessage = document.getElementById('status-message');
        saveButton.disabled = true; saveButton.textContent = 'در حال ثبت...'; statusMessage.textContent = ''; 

        const rows = document.getElementById('member-list-body').querySelectorAll('tr'); 
        if (rows.length === 0) { saveButton.disabled = false; return; }
        const attendanceData = Array.from(rows).map(row => {
            const memberId = row.dataset.memberId;
            const checkedRadio = row.querySelector('input[type="radio"]:checked');
            return {
                member_id: memberId,
                status: checkedRadio ? checkedRadio.value : null,
                institution_id: userProfile.institution_id,
                date: new Date().toISOString().split('T')[0],
                recorded_by: currentUser.id
            };
        }).filter(d => d.status); // فقط رکوردهایی که وضعیت دارند را ارسال کن

        if (attendanceData.length !== rows.length) {
            statusMessage.textContent = 'لطفاً وضعیت تمام اعضا را مشخص کنید.'; 
            saveButton.disabled = false; saveButton.textContent = 'ثبت نهایی'; 
            return; 
        } 

        try {
            const { error } = await supabase.from('attendance').upsert(attendanceData, { onConflict: 'institution_id, member_id, date' });
            if (error) throw error;
            statusMessage.style.color = 'green'; 
            statusMessage.textContent = 'حضور و غیاب با موفقیت به‌روزرسانی شد!'; 
            saveButton.textContent = 'ثبت شد'; 
        } catch (error) {
            statusMessage.style.color = '#d93025'; 
            statusMessage.textContent = `خطا در ثبت اطلاعات: ${error.message}`;
            saveButton.disabled = false; saveButton.textContent = 'ثبت نهایی'; 
        } 
    });
    
    // =================================================================
    // بخش ۴: منطق تب تاریخچه
    // =================================================================
    function initializeHistoryTab() {
        let fullHistory = [];
        let currentHistoryFilters = { status: 'all' };
        let currentHistoryPage = 1;
        const HISTORY_ITEMS_PER_PAGE = 30;
        const historyTableBody = document.getElementById('history-table-body');
        const historyPaginationContainer = document.getElementById('history-pagination-container');

        function renderHistoryPage() {
            let filteredHistory = fullHistory.filter(r => currentHistoryFilters.status === 'all' || r.status === currentHistoryFilters.status);
            const totalPages = Math.ceil(filteredHistory.length / HISTORY_ITEMS_PER_PAGE);
            currentHistoryPage = Math.min(currentHistoryPage, totalPages || 1);
            const pageRecords = filteredHistory.slice((currentHistoryPage - 1) * HISTORY_ITEMS_PER_PAGE, currentHistoryPage * HISTORY_ITEMS_PER_PAGE);
            renderHistoryTable(pageRecords);
            renderHistoryPagination(totalPages);
        }

        function renderHistoryTable(records) {
            historyTableBody.innerHTML = records.length === 0 ? '<tr><td colspan="4">سابقه‌ای یافت نشد.</td></tr>' : '';
            let lastDate = null;
            records.forEach(record => {
                const recordDate = new Date(record.recorded_at).toLocaleDateString('fa-IR');
                if (recordDate !== lastDate) {
                    historyTableBody.innerHTML += `<tr class="date-group-header"><td colspan="4">تاریخ: ${recordDate}</td></tr>`;
                    lastDate = recordDate;
                }
                historyTableBody.innerHTML += `
                    <tr>
                        <td>${new Date(record.recorded_at).toLocaleString('fa-IR')}</td>
                        <td>${record.members.full_name}</td>
                        <td>${record.members.national_id || ''}</td>
                        <td>${record.status}</td>
                    </tr>`;
            });
        }

        function renderHistoryPagination(totalPages) {
            historyPaginationContainer.innerHTML = '';
            if (totalPages <= 1) return;

            const createButton = (text, page) => {
                const button = document.createElement('button');
                button.textContent = text;
                if (page) {
                    if (page === currentHistoryPage) button.classList.add('active');
                    button.addEventListener('click', () => {
                        currentHistoryPage = page;
                        renderHistoryPage();
                    });
                } else {
                    button.disabled = true;
                }
                return button;
            };

            const prevButton = createButton('قبلی', currentHistoryPage - 1);
            if (currentHistoryPage === 1) prevButton.disabled = true;
            historyPaginationContainer.appendChild(prevButton);

            const pages = new Set();
            pages.add(1);
            pages.add(totalPages);
            pages.add(currentHistoryPage);
            if (currentHistoryPage > 1) pages.add(currentHistoryPage - 1);
            if (currentHistoryPage < totalPages) pages.add(currentHistoryPage + 1);

            const sortedPages = Array.from(pages).sort((a, b) => a - b);
            
            let lastPage = 0;
            sortedPages.forEach(page => {
                if (page > lastPage + 1) {
                    historyPaginationContainer.appendChild(createButton('...'));
                }
                if (page > 0 && page <= totalPages) {
                    historyPaginationContainer.appendChild(createButton(page, page));
                }
                lastPage = page;
            });

            const nextButton = createButton('بعدی', currentHistoryPage + 1);
            if (currentHistoryPage === totalPages) nextButton.disabled = true;
            historyPaginationContainer.appendChild(nextButton);
        }

        async function fetchHistory() {
            historyTableBody.innerHTML = '<tr><td colspan="4">در حال بارگذاری تاریخچه...</td></tr>';
            try {
                const { data, error } = await supabase
                    .from('attendance')
                    .select('*, members(full_name, national_id)')
                    .eq('institution_id', userProfile.institution_id)
                    .order('recorded_at', { ascending: false });
                if (error) throw error;
                fullHistory = data;
                renderHistoryPage();
            } catch (error) {
                 historyTableBody.innerHTML = `<tr><td colspan="4">خطا در بارگذاری تاریخچه: ${error.message}</td></tr>`;
            }
        }
        
        document.querySelectorAll('#history-tab .filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#history-tab .filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentHistoryFilters.status = btn.dataset.status;
                currentHistoryPage = 1;
                renderHistoryPage();
            });
        });
        
        document.getElementById('export-history-excel').addEventListener('click', () => { 
            let dataToExport = fullHistory
                .filter(r => currentHistoryFilters.status === 'all' || r.status === currentHistoryFilters.status)
                .map(record => ({
                    "تاریخ و زمان": new Date(record.recorded_at).toLocaleString('fa-IR'),
                    "نام عضو": record.members.full_name,
                    "کد ملی": record.members.national_id,
                    "وضعیت": record.status
                }));
            if (dataToExport.length === 0) { alert('داده‌ای برای خروجی گرفتن وجود ندارد.'); return; }
            const worksheet = XLSX.utils.json_to_sheet(dataToExport); 
            const workbook = XLSX.utils.book_new(); 
            XLSX.utils.book_append_sheet(workbook, worksheet, "تاریخچه حضور و غیاب"); 
            XLSX.writeFile(workbook, `History_${userProfile.username}.xlsx`);
        });

        fetchHistory();
    }

    // --- اجرای اولیه ---
    initializePage();
});
