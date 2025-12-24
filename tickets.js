document.addEventListener('DOMContentLoaded', async () => {
    // --- ۱. بررسی دسترسی ---
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { window.location.href = 'index.html'; return; }
    
    // شناسایی نقش برای دکمه بازگشت
    const { data: profile } = await supabase.from('profiles').select('role, username').eq('id', session.user.id).single();
    
    // دکمه بازگشت
    document.getElementById('back-btn').onclick = () => {
        if (profile.role === 'root') window.location.href = 'root.html';
        else if (profile.role === 'superadmin') window.location.href = 'superadmin.html';
        else if (profile.role === 'admin') window.location.href = 'admin.html';
        else window.location.href = 'attendance.html';
    };

    // --- ۲. متغیرها ---
    let activeTicketId = null;
    const ticketListEl = document.getElementById('ticket-list');
    const messagesBox = document.getElementById('messages-box');
    const inputArea = document.getElementById('input-area');
    const msgInput = document.getElementById('msg-input');
    const sendBtn = document.getElementById('send-msg-btn');
    
    // --- ۳. دریافت لیست تیکت‌ها ---
    async function loadTickets() {
        // دریافت تیکت‌هایی که من فرستادم یا برای من آمده
        const { data: tickets, error } = await supabase
            .from('tickets')
            .select(`
                id, subject, status, created_at,
                sender:creator_id(username),
                receiver:recipient_id(username)
            `)
            .or(`creator_id.eq.${session.user.id},recipient_id.eq.${session.user.id}`)
            .order('updated_at', { ascending: false });

        if (error) {
            ticketListEl.innerHTML = `<p style="color:red; padding:10px;">خطا: ${error.message}</p>`;
            return;
        }

        if (tickets.length === 0) {
            ticketListEl.innerHTML = '<p style="padding:10px;">هیچ تیکتی ندارید.</p>';
            return;
        }

        ticketListEl.innerHTML = '';
        tickets.forEach(t => {
            const isMeSender = t.sender.username === profile.username;
            const otherParty = isMeSender ? t.receiver.username : t.sender.username;
            
            const div = document.createElement('div');
            div.className = `ticket-item ${activeTicketId === t.id ? 'active' : ''}`;
            div.onclick = () => selectTicket(t.id);
            div.innerHTML = `
                <h4>${t.subject}</h4>
                <p>طرف حساب: ${otherParty}</p>
                <p style="font-size:10px; color:#999;">${new Date(t.created_at).toLocaleDateString('fa-IR')}</p>
                <p>وضعیت: ${t.status}</p>
            `;
            ticketListEl.appendChild(div);
        });
    }

    // --- ۴. انتخاب تیکت و لود پیام‌ها ---
    async function selectTicket(ticketId) {
        activeTicketId = ticketId;
        loadTickets(); // برای آپدیت استایل Active
        inputArea.style.display = 'flex';
        messagesBox.innerHTML = '<p style="text-align:center;">در حال دریافت پیام‌ها...</p>';

        const { data: msgs, error } = await supabase
            .from('ticket_messages')
            .select('*')
            .eq('ticket_id', ticketId)
            .order('created_at', { ascending: true });

        if (error) {
            messagesBox.innerHTML = 'خطا در لود پیام‌ها';
            return;
        }

        messagesBox.innerHTML = '';
        msgs.forEach(m => {
            const isMe = m.sender_id === session.user.id;
            const bubble = document.createElement('div');
            bubble.className = `message-bubble ${isMe ? 'msg-me' : 'msg-other'}`;
            bubble.textContent = m.message_body;
            messagesBox.appendChild(bubble);
        });

        // اسکرول به پایین
        messagesBox.scrollTop = messagesBox.scrollHeight;
    }

    // --- ۵. ارسال پیام در چت ---
    sendBtn.onclick = async () => {
        const text = msgInput.value.trim();
        if (!text || !activeTicketId) return;

        sendBtn.disabled = true;
        const { error } = await supabase.from('ticket_messages').insert({
            ticket_id: activeTicketId,
            sender_id: session.user.id,
            message_body: text
        });

        if (!error) {
            // آپدیت زمان تیکت
            await supabase.from('tickets').update({ updated_at: new Date() }).eq('id', activeTicketId);
            msgInput.value = '';
            selectTicket(activeTicketId); // رفرش پیام‌ها
        } else {
            alert('خطا در ارسال: ' + error.message);
        }
        sendBtn.disabled = false;
    };

    // --- ۶. ایجاد تیکت جدید (شروع گفتگو) ---
    const modal = document.getElementById('new-ticket-modal');
    document.getElementById('new-ticket-btn').onclick = () => modal.style.display = 'flex';
    document.querySelector('.cancel-btn').onclick = () => modal.style.display = 'none';

    document.getElementById('new-ticket-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const targetUsername = document.getElementById('target-username').value.trim();
        const subject = document.getElementById('ticket-subject').value.trim();
        const msg = document.getElementById('first-message').value.trim();
        const statusEl = document.getElementById('new-ticket-status');

        statusEl.textContent = 'در حال جستجوی کاربر...';

        // پیدا کردن ID کاربر گیرنده از روی یوزرنیم
        const { data: targetUser, error: findError } = await supabase
            .from('profiles')
            .select('id')
            .eq('username', targetUsername)
            .single();

        if (findError || !targetUser) {
            statusEl.textContent = 'کاربر مورد نظر یافت نشد.';
            return;
        }

        // ساخت تیکت
        const { data: ticket, error: ticketError } = await supabase
            .from('tickets')
            .insert({
                creator_id: session.user.id,
                recipient_id: targetUser.id,
                subject: subject,
                status: 'open'
            })
            .select()
            .single();

        if (ticketError) {
            statusEl.textContent = 'خطا در ساخت تیکت: ' + ticketError.message;
            return;
        }

        // ثبت پیام اول
        await supabase.from('ticket_messages').insert({
            ticket_id: ticket.id,
            sender_id: session.user.id,
            message_body: msg
        });

        statusEl.style.color = 'green';
        statusEl.textContent = 'تیکت ارسال شد!';
        setTimeout(() => {
            modal.style.display = 'none';
            document.getElementById('new-ticket-form').reset();
            loadTickets();
        }, 1000);
    });

    loadTickets();
});
