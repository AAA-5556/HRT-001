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

        // Allow both superadmin and root (for impersonation)
        const impersonatedRole = localStorage.getItem('impersonatedUserRole');
        const effectiveRole = impersonatedRole || profile.role;

        if (effectiveRole !== 'superadmin' && profile.role !== 'root') {
            alert('Access denied.');
            // Clear impersonation on error
            if(impersonatedRole) stopImpersonation();
            else await supabase.auth.signOut();
            window.location.href = 'index.html';
            return null;
        }

        return { user, profile };
    }

    const authData = await checkAuthAndRole();
    if (!authData) return;

    const { user: currentUser, profile: userProfile } = authData;

    // --- DOM Elements ---
    const adminListBody = document.getElementById('admin-list-body');
    const loadingMessage = document.getElementById('loading-message');
    const logoutButton = document.getElementById('logout-button');
    const addAdminButton = document.getElementById('add-admin-button');

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
    document.getElementById('superadmin-title').textContent = `پنل Superadmin (${userProfile.username})`;
    logoutButton.addEventListener('click', async () => {
        await supabase.auth.signOut();
        window.location.href = 'index.html';
    });

    // --- Functions ---
    async function loadAdmins() {
        loadingMessage.style.display = 'block';
        adminListBody.innerHTML = '';
        try {
            // Fetch admins created by the current superadmin
            const { data: admins, error } = await supabase
                .from('profiles')
                .select('id, username, created_at')
                .eq('role', 'admin')
                .eq('created_by', currentUser.id);

            if (error) throw error;

            if (admins.length === 0) {
                adminListBody.innerHTML = '<tr><td colspan="4">هیچ کاربر Admin یافت نشد.</td></tr>';
                return;
            }

            // Fetch institution counts for each admin
            const institutionCounts = await Promise.all(
                admins.map(async (admin) => {
                    const { count, error: countError } = await supabase
                        .from('institutions')
                        .select('*', { count: 'exact', head: true })
                        .eq('created_by', admin.id);
                    return { adminId: admin.id, count: countError ? 0 : count };
                })
            );

            const countsMap = institutionCounts.reduce((acc, item) => {
                acc[item.adminId] = item.count;
                return acc;
            }, {});

            admins.forEach(admin => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${admin.username}</td>
                    <td>${new Date(admin.created_at).toLocaleDateString('fa-IR')}</td>
                    <td>${countsMap[admin.id] || 0}</td>
                    <td class="actions">
                        <button class="action-btn impersonate-btn" data-user-id="${admin.id}" data-username="${admin.username}" data-user-role="admin">ورود به حساب</button>
                        <button class="action-btn edit-btn" data-user-id="${admin.id}" data-username="${admin.username}">ویرایش</button>
                        <button class="action-btn delete-btn" data-user-id="${admin.id}" data-username="${admin.username}">حذف</button>
                    </td>
                `;
                adminListBody.appendChild(row);
            });

        } catch (error) {
            adminListBody.innerHTML = `<tr><td colspan="4" class="error-message">خطا در بارگذاری لیست: ${error.message}</td></tr>`;
        } finally {
            loadingMessage.style.display = 'none';
        }
    }

    // --- Event Listeners ---
    addAdminButton.addEventListener('click', () => {
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
            addUserStatus.textContent = 'کاربر Admin با موفقیت ایجاد شد.';
            setTimeout(() => {
                addUserModal.style.display = 'none';
                loadAdmins();
            }, 1500);

        } catch (error) {
            console.error('Error creating admin:', error);
            addUserStatus.style.color = 'red';
            addUserStatus.textContent = `Error: ${error.message}`;
        }
    });

    adminListBody.addEventListener('click', async (e) => {
        const target = e.target.closest('button');
        if (!target) return;

        const userId = target.dataset.userId;
        const username = target.dataset.username;

        if (target.classList.contains('delete-btn')) {
            if (confirm(`آیا از حذف کاربر '${username}' مطمئن هستید؟ این عمل تمام موسسات زیرمجموعه او را نیز حذف خواهد کرد.`)) {
                try {
                    const { error } = await supabase.functions.invoke('delete-user', {
                        body: { userId }
                    });
                    if (error) throw error;

                    await logImpersonatedAction('delete_user', { deleted_username: username });

                    alert('کاربر با موفقیت حذف شد.');
                    loadAdmins();
                } catch (error) {
                    alert(`خطا در حذف کاربر: ${error.message}`);
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
    loadAdmins();
});
