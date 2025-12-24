document.addEventListener('DOMContentLoaded', async () => {
    // --- ۱. بررسی امنیتی ---
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { window.location.href = 'index.html'; return; }

    const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
    const isImpersonating = localStorage.getItem('impersonationActive');
    const effectiveRole = isImpersonating ? localStorage.getItem('impersonatedRole') : profile.role;
    
    if (effectiveRole !== 'admin') { 
        window.location.href = 'index.html'; return; 
    }

    // --- ۲. تنظیمات اولیه ---
    document.getElementById('admin-title').textContent = `پنل مدیریت (${isImpersonating ? localStorage.getItem('impersonatedUsername') : profile.username})`;
    if (typeof initImpersonationUI === 'function') initImpersonationUI();
    addTicketButtonToHeader(); // دکمه تیکت

    const dashboardContainer = document.getElementById('dashboard-container');
    const adminDataBody = document.getElementById('admin-data-body');
    const loadingMessage = document.getElementById('loading-message');
    const institutionFilter = document.getElementById('institution-filter');
    const addUserModal = document.getElementById('add-user-modal');

    // منوی اصلی
    const mainMenuButton = document.getElementById('main-menu-button');
    const mainMenuDropdown = document.getElementById('main-menu-dropdown');
    if (mainMenuButton) {
        mainMenuButton.addEventListener('click', (e) => {
            e.stopPropagation();
            mainMenuDropdown.style.display = mainMenuDropdown.style.display === 'block' ? 'none' : 'block';
        });
    }
    document.addEventListener('click', () => {
        if (mainMenuDropdown) mainMenuDropdown.style.display = 'none';
        document.querySelectorAll('.card-menu-dropdown').forEach(m => m.style.display = 'none');
    });

    // --- ۳. لود داشبورد ---
    async function loadDashboard() {
        dashboardContainer.innerHTML = '<p>در حال بارگذاری موسسات...</p>';
        const effectiveId = isImpersonating ? localStorage.getItem('impersonatedUserId') : session.user.id;

        const { data: institutions, error } = await supabase.functions.invoke('get-managed-users', {
            body: { userId: effectiveId, targetRole: 'institute' }
        });

        if (error) { dashboardContainer.innerHTML = `<p class="error">${error.message}</p>`; return; }

        dashboardContainer.innerHTML = '';
        institutionFilter.innerHTML = '<option value="all">همه موسسات</option>';

        // دکمه افزودن
        const addCard = document.createElement('div');
        addCard.className = 'stat-card add-inst-card';
        addCard.innerHTML = `<h3>افزودن موسسه</h3><div class="plus-sign">+</div>`;
        addCard.onclick = () => {
            document.getElementById('add-user-form').reset();
            document.getElementById('add-user-status').textContent = '';
            addUserModal.style.display = 'flex';
        };
        dashboardContainer.appendChild(addCard);

        const activeInsts = institutions.filter(i => i.status === 'active');

        for (const inst of activeInsts) {
            const { count } = await supabase.from('members').select('*', { count: 'exact', head: true }).eq('institution_id', inst.id).eq('is_active', true);
            const option = document.createElement('option');
            option.value = inst.id; option.textContent = inst.username; institutionFilter.appendChild(option);

            const card = document.createElement('div');
            card.className = 'stat-card';
            card.innerHTML = `
                <div class="card-header" style="display:flex; justify-content:space-between;">
                    <h3>${inst.username}</h3>
                    <button class="card-menu-button" onclick="toggleMenu(event, '${inst.id}')">⋮</button>
                    <div id="menu-${inst.id}" class="card-menu-dropdown">
                        <button onclick="editUser('${inst.id}', '${inst.username}')">ویرایش</button>
                        <a href="manage-members.html?id=${inst.id}&name=${encodeURIComponent(inst.username)}">مدیریت اعضا</a>
                        <button onclick="archiveUser('${inst.id}', '${inst.username}')" style="color:orange;">آرشیو</button>
                    </div>
                </div>
                <p>تعداد اعضا: <span class="highlight">${count || 0}</span></p>
                <p class="status-active">فعال</p>
            `;
            dashboardContainer.appendChild(card);
        }
    }

    // --- ۴. توابع کمکی ---
    window.toggleMenu = (e, id) => {
        e.stopPropagation();
        document.querySelectorAll('.card-menu-dropdown').forEach(m => m.style.display = 'none');
        document.getElementById(`menu-${id}`).style.display = 'block';
    };

    window.archiveUser = async (id, name) => {
        if (!confirm(`آرشیو کردن موسسه «${name}»؟`)) return;
        const { error } = await supabase.from('profiles').update({ status: 'archived' }).eq('id', id);
        if (error) alert(error.message);
        else { 
            // لاگ
            const effectiveId = isImpersonating ? localStorage.getItem('impersonatedUserId') : session.user.id;
            await supabase.from('action_logs').insert({
                actor_id: effectiveId,
                target_user_id: id,
                action_type: 'archive_institution',
                description: `موسسه ${name} آرشیو شد`
            });
            loadDashboard(); 
        }
    };

    document.getElementById('add-user-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('new-username').value;
        const password = document.getElementById('new-password').value;
        const effectiveId = isImpersonating ? localStorage.getItem('impersonatedUserId') : session.user.id;
        
        const { error } = await supabase.functions.invoke('create-user', { body: { username, password, creatorId: effectiveId } });
        if(error) alert(error.message);
        else { addUserModal.style.display = 'none'; loadDashboard(); }
    });

    window.editUser = (id, name) => {
        document.getElementById('edit-user-id').value = id;
        document.getElementById('edit-modal-title').textContent = name;
        document.getElementById('edit-user-modal').style.display = 'flex';
    };

    document.getElementById('edit-user-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-user-id').value;
        const pass = document.getElementById('edit-password').value;
        const effectiveId = isImpersonating ? localStorage.getItem('impersonatedUserId') : session.user.id;

        const { error } = await supabase.functions.invoke('update-user-password', { body: { userId: id, newPassword: pass, requesterId: effectiveId } });
        if(error) alert(error.message);
        else document.getElementById('edit-user-modal').style.display = 'none';
    });

    document.getElementById('logout-button').onclick = async () => { await supabase.auth.signOut(); window.location.href = 'index.html'; };
    document.querySelectorAll('.cancel-btn').forEach(b => b.onclick = () => document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none'));

    function addTicketButtonToHeader() {
        const actionsDiv = document.querySelector('.header-actions');
        if (actionsDiv && !document.getElementById('tickets-btn')) {
            const btn = document.createElement('button');
            btn.id = 'tickets-btn'; btn.textContent = '📩 تیکت‌ها'; btn.style.marginRight = '10px'; btn.style.backgroundColor = '#17a2b8';
            btn.onclick = () => window.location.href = 'tickets.html';
            actionsDiv.prepend(btn);
        }
    }

    loadDashboard();
    // loadAttendanceReport(); // اگر نیاز بود فعال کنید
});
