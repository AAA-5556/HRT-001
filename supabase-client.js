// تنظیمات اتصال به Supabase
const SUPABASE_URL = 'https://lezdnplqsgyehfrkpmlx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxlemRucGxxc2d5ZWhmcmtwbWx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY1MzUwOTAsImV4cCI6MjA4MjExMTA5MH0.O1aSmQ6ZihzlJ70Nxqgm9PsysYelwsdp6b0yh-ntCm4';

// ایجاد کلاینت و در دسترس قرار دادن آن برای همه فایل‌ها
window.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

console.log("Supabase Client Initialized");
