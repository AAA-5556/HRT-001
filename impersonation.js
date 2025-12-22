// This file will be created in a later step. It is here for reference.
function startImpersonation(targetUserId, targetUsername, targetRole) {
    const originalUserId = localStorage.getItem('originalUserId');

    // Prevent nested impersonation
    if (originalUserId) {
        alert('Cannot start a new impersonation session while another is active.');
        return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session) {
            alert('Authentication error.');
            return;
        }
        const currentUser = session.user;

        supabase.from('profiles').select('role').eq('id', currentUser.id).single().then(({ data: profile }) => {
            localStorage.setItem('originalUserId', currentUser.id);
            localStorage.setItem('originalUserRole', profile.role);
            localStorage.setItem('impersonatedUserId', targetUserId);
            localStorage.setItem('impersonatedUsername', targetUsername);
            localStorage.setItem('impersonatedUserRole', targetRole);

            // Log the event
            supabase.from('impersonation_log').insert({
                admin_id: currentUser.id,
                target_user_id: targetUserId,
                action: 'start_impersonation'
            }).then(({ error }) => {
                if (error) console.error('Failed to log impersonation start:', error);
            });

            // Redirect to the appropriate panel
            if (targetRole === 'superadmin') {
        window.location.href = 'superadmin.html';
    } else if (targetRole === 'admin') {
        window.location.href = 'admin.html';
    } else {
        alert('Invalid target role for impersonation.');
        stopImpersonation();
    }
}

function stopImpersonation() {
    const originalUserId = localStorage.getItem('originalUserId');
    const originalUserRole = localStorage.getItem('originalUserRole');

    if (!originalUserId) return;

    // Log the event
    supabase.from('impersonation_log').insert({
        admin_id: originalUserId,
        target_user_id: localStorage.getItem('impersonatedUserId'),
        action: 'stop_impersonation'
    }).then(({ error }) => {
        if (error) console.error('Failed to log impersonation stop:', error);
    });

    localStorage.removeItem('originalUserId');
    localStorage.removeItem('originalUserRole');
    localStorage.removeItem('impersonatedUserId');
    localStorage.removeItem('impersonatedUsername');
    localStorage.removeItem('impersonatedUserRole');

    if (originalUserRole === 'root') {
        window.location.href = 'root.html';
    } else if (originalUserRole === 'superadmin') {
        window.location.href = 'superadmin.html';
    } else {
        window.location.href = 'index.html'; // Fallback
    }
}

function initImpersonationUI() {
    const impersonatedUsername = localStorage.getItem('impersonatedUsername');
    if (!impersonatedUsername) return;

    const banner = document.createElement('div');
    banner.id = 'impersonation-banner';
    banner.innerHTML = `
        <span>شما در حال مشاهده به عنوان <strong>${impersonatedUsername}</strong> هستید.</span>
        <button id="stop-impersonation-btn">پایان مشاهده</button>
    `;
    document.body.prepend(banner);

    document.getElementById('stop-impersonation-btn').addEventListener('click', stopImpersonation);
}

async function logImpersonatedAction(action, details) {
    const admin_id = localStorage.getItem('originalUserId');
    const target_user_id = localStorage.getItem('impersonatedUserId');

    if (!admin_id || !target_user_id) {
        // Not in an impersonation session, so do nothing.
        return;
    }

    try {
        const { error } = await supabase.from('impersonation_log').insert({
            admin_id,
            target_user_id,
            action,
            details: details || null
        });
        if (error) {
            console.error('Failed to log impersonated action:', error);
        }
    } catch (e) {
        console.error('Error in logImpersonatedAction:', e);
    }
}
