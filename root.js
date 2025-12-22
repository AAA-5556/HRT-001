document.addEventListener('DOMContentLoaded', async () => {
    // --- Authentication and Role Check ---
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
            console.error('Error fetching profile:', profileError);
            await supabase.auth.signOut();
            window.location.href = 'index.html';
            return null;
        }

        if (profile.role !== 'root') {
            alert('Access denied.');
            await supabase.auth.signOut();
            window.location.href = 'index.html';
            return null;
        }

        return { user, profile };
    }

    const authData = await checkAuthAndRole();
    if (!authData) return;

    const { user: currentUser, profile: userProfile } = authData;

    // --- DOM Elements ---
    const dashboardContainer = document.getElementById('dashboard-container');
    const superadminListBody = document.getElementById('superadmin-list-body');
    const loadingMessage = document.getElementById('loading-message');
    const logoutButton = document.getElementById('logout-button');
    const addSuperadminButton = document.getElementById('add-superadmin-button');

    const addUserModal = document.getElementById('add-user-modal');
    const addUserForm = document.getElementById('add-user-form');
    const addUserStatus = document.getElementById('add-user-status');

    const editUserModal = document.getElementById('edit-user-modal');
    const editUserForm = document.getElementById('edit-user-form');
    const editUserStatus = document.getElementById('edit-user-status');
    const editModalTitle = document.getElementById('edit-modal-title');

    document.querySelectorAll('.cancel-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            addUserModal.style.display = 'none';
            editUserModal.style.display = 'none';
        });
    });

    // --- Initial Setup ---
    document.getElementById('root-title').textContent = `پنل کاربری روت (${userProfile.username})`;
    logoutButton.addEventListener('click', async () => {
        await supabase.auth.signOut();
        window.location.href = 'index.html';
    });

    // --- Functions ---
    async function loadDashboardData() {
        try {
            const { count: superadminCount, error: saError } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'superadmin');
            if(saError) throw saError;

            const { count: adminCount, error: aError } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'admin');
             if(aError) throw aError;

            const { count: institutionCount, error: iError } = await supabase.from('institutions').select('*', { count: 'exact', head: true }).eq('is_active', true);
             if(iError) throw iError;

            // Note: Active users in the last 7 days requires more complex query or logs. This is a placeholder.
            const activeUsers = 'N/A';

            dashboardContainer.innerHTML = `
                <div class="stat-card"><h3>Super Admins</h3><p class="highlight">${superadminCount}</p></div>
                <div class="stat-card"><h3>Admins</h3><p class="highlight">${adminCount}</p></div>
                <div class="stat-card"><h3>Institutions</h3><p class="highlight">${institutionCount}</p></div>
                <div class="stat-card"><h3>Active Users (7d)</h3><p class="highlight">${activeUsers}</p></div>
            `;
        } catch (error) {
            dashboardContainer.innerHTML = `<p class="error-message">Error loading dashboard: ${error.message}</p>`;
        }
    }

    async function loadSuperadmins() {
        loadingMessage.style.display = 'block';
        superadminListBody.innerHTML = '';
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, username, created_at')
                .eq('role', 'superadmin');

            if (error) throw error;

            if (data.length === 0) {
                superadminListBody.innerHTML = '<tr><td colspan="3">هیچ کاربر Superadmin یافت نشد.</td></tr>';
            } else {
                data.forEach(sa => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${sa.username}</td>
                        <td>${new Date(sa.created_at).toLocaleDateString('fa-IR')}</td>
                        <td class="actions">
                            <button class="action-btn impersonate-btn" data-user-id="${sa.id}" data-username="${sa.username}" data-user-role="superadmin">ورود به حساب</button>
                            <button class="action-btn edit-btn" data-user-id="${sa.id}" data-username="${sa.username}">ویرایش</button>
                            <button class="action-btn delete-btn" data-user-id="${sa.id}" data-username="${sa.username}">حذف</button>
                        </td>
                    `;
                    superadminListBody.appendChild(row);
                });
            }
        } catch (error) {
            superadminListBody.innerHTML = `<tr><td colspan="3" class="error-message">خطا در بارگذاری لیست: ${error.message}</td></tr>`;
        } finally {
            loadingMessage.style.display = 'none';
        }
    }

    // --- Event Listeners ---
    addSuperadminButton.addEventListener('click', () => {
        addUserForm.reset();
        addUserStatus.textContent = '';
        addUserModal.style.display = 'flex';
    });

    addUserForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('new-username').value.trim();
        const password = document.getElementById('new-password').value.trim();
        if (!username || !password) return;

        addUserStatus.textContent = 'در حال ایجاد...';
        addUserStatus.style.color = 'inherit';

        try {
            const { data, error } = await supabase.functions.invoke('create-user', {
                body: { username, password, creatorId: currentUser.id }
            });
            if (error) throw error;

            await logImpersonatedAction('create_user', { created_username: username, new_role: data.role });

            addUserStatus.style.color = 'green';
            addUserStatus.textContent = 'کاربر Superadmin با موفقیت ایجاد شد.';
            setTimeout(() => {
                addUserModal.style.display = 'none';
                loadSuperadmins();
                loadDashboardData();
            }, 1500);

        } catch (error) {
            console.error('Error creating superadmin:', error);
            addUserStatus.style.color = 'red';
            addUserStatus.textContent = `Error: ${error.message}`;
        }
    });

    superadminListBody.addEventListener('click', async (e) => {
        const target = e.target.closest('button');
        if (!target) return;

        const userId = target.dataset.userId;
        const username = target.dataset.username;

        if (target.classList.contains('delete-btn')) {
            if (confirm(`آیا از حذف کاربر '${username}' مطمئن هستید؟ این عمل غیرقابل بازگشت است.`)) {
                try {
                    const { error } = await supabase.functions.invoke('delete-user', {
                        body: { userId }
                    });
                    if (error) throw error;

                    await logImpersonatedAction('delete_user', { deleted_username: username });

                    alert('کاربر با موفقیت حذف شد.');
                    loadSuperadmins();
                    loadDashboardData();
                } catch (error) {
                    alert(`خطا در حذف کاربر: ${error.message}`);
                    console.error('Delete error:', error);
                }
            }
        }

        if (target.classList.contains('edit-btn')) {
            editUserForm.reset();
            editUserStatus.textContent = '';
            editModalTitle.textContent = `ویرایش کاربر: ${username}`;
            editUserForm.querySelector('#edit-user-id').value = userId;
            editUserModal.style.display = 'flex';
        }

        if (target.classList.contains('impersonate-btn')) {
            const userRole = target.dataset.userRole;
            startImpersonation(userId, username, userRole);
        }
    });

    editUserForm.addEventListener('submit', async(e) => {
        e.preventDefault();
        const userId = document.getElementById('edit-user-id').value;
        const newPassword = document.getElementById('edit-password').value;

        if (!newPassword) {
            editUserStatus.textContent = 'لطفا رمز عبور جدید را وارد کنید.';
            return;
        }

        editUserStatus.textContent = 'در حال بروزرسانی...';
        editUserStatus.style.color = 'inherit';

        try {
            const { error } = await supabase.functions.invoke('update-user-password', {
                body: { userId, newPassword }
            });
            if (error) throw error;

            await logImpersonatedAction('update_password', { target_user_id: userId });

            editUserStatus.style.color = 'green';
            editUserStatus.textContent = 'رمز عبور با موفقیت بروزرسانی شد.';
            setTimeout(() => {
                editUserModal.style.display = 'none';
            }, 1500);

        } catch (error) {
            console.error('Password update error:', error);
            editUserStatus.style.color = 'red';
            editUserStatus.textContent = `Error: ${error.message}`;
        }
    });

    // --- Initial Load ---
    initImpersonationUI();
    loadDashboardData();
    loadSuperadmins();
});
