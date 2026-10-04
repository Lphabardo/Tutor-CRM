import { supabase } from './supabase';

// Проверяем, запущено ли приложение внутри Telegram
const isTelegram = typeof window !== 'undefined' && 
                   (window as any).Telegram?.WebApp?.initData;

// Получаем данные WebApp (или мок для браузера)
const WebApp = isTelegram ? (window as any).Telegram.WebApp : null;

export async function authenticateUser() {
  // Если не в Telegram — возвращаем тестовые данные
  if (!WebApp) {
    console.log('⚠️ Приложение открыто вне Telegram. Используем тестовые данные.');
    return {
      success: true,
      telegram_id: '123456789',
      role: 'tutor', // или 'student' для теста
      full_name: 'Тестовый Пользователь',
      balance: 5,
      user_id: 'test-user-id'
    };
  }

  const initData = WebApp.initData;
  if (!initData) throw new Error("Нет данных инициализации Telegram");

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-telegram`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData })
    }
  );

  const data = await response.json();
  if (!data.success) throw new Error(data.error || "Ошибка авторизации");
  return data;
}

export async function cancelLesson(lessonId: string) {
  const { data, error } = await supabase.rpc('rpc_cancel_lesson', { 
    p_lesson_id: lessonId 
  });
  if (error) throw error;
  return data;
}

export async function completeLesson(lessonId: string, topic: string) {
  const { error } = await supabase.rpc('rpc_complete_lesson', { 
    p_lesson_id: lessonId, 
    p_topic: topic 
  });
  if (error) throw error;
}

export async function adjustBalance(studentId: string, amount: number, reason: string) {
  const { error } = await supabase.rpc('rpc_adjust_balance', { 
    p_student_id: studentId, 
    p_amount: amount, 
    p_reason: reason 
  });
  if (error) throw error;
}