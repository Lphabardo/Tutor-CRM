import { supabase } from './supabase';

const isTelegram = typeof window !== 'undefined' && 
                   (window as any).Telegram?.WebApp?.initData;
const WebApp = isTelegram ? (window as any).Telegram.WebApp : null;

// Авторизация пользователя
export async function authenticateUser() {
  if (!WebApp) {
    return {
      success: true,
      telegram_id: '830672781',
      role: 'tutor',
      full_name: 'Преподаватель',
      balance: 0,
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

// === ФУНКЦИИ ДЛЯ ПРЕПОДАВАТЕЛЯ ===

// Получить список всех учеников
export async function getStudents() {
  const { data, error } = await supabase
    .from('tutor_profiles')
    .select('*')
    .eq('role', 'student')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// Добавить нового ученика по Telegram ID
export async function addStudent(telegramId: number, fullName: string) {
  const { data, error } = await supabase
    .from('tutor_profiles')
    .insert([{ telegram_id: telegramId, full_name: fullName, role: 'student', balance: 0 }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Изменить баланс ученика (+ или - уроки)
export async function adjustBalance(studentId: string, amount: number, reason: string) {
  const { error } = await supabase.rpc('rpc_adjust_balance', { 
    p_student_id: studentId, 
    p_amount: amount, 
    p_reason: reason 
  });
  if (error) throw error;
}

// Назначить урок ученику
export async function createLesson(studentId: string, startTime: string, topic: string) {
  const { data, error } = await supabase
    .from('tutor_lessons')
    .insert([{ student_id: studentId, start_time: startTime, status: 'scheduled', topic }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Получить все уроки (для преподавателя)
export async function getAllLessons() {
  const { data, error } = await supabase
    .from('tutor_lessons')
    .select(`
      *,
      student:tutor_profiles(full_name, telegram_id)
    `)
    .order('start_time', { ascending: true });
  if (error) throw error;
  return data;
}

// Отменить урок (с правилом 3 часов на сервере)
export async function cancelLesson(lessonId: string) {
  const { data, error } = await supabase.rpc('rpc_cancel_lesson', { 
    p_lesson_id: lessonId 
  });
  if (error) throw error;
  return data;
}

// Завершить урок
export async function completeLesson(lessonId: string, topic: string) {
  const { error } = await supabase.rpc('rpc_complete_lesson', { 
    p_lesson_id: lessonId, 
    p_topic: topic 
  });
  if (error) throw error;
}

// === ФУНКЦИИ ДЛЯ УЧЕНИКА ===

// Получить мои уроки
export async function getMyLessons(telegramId: string) {
  const { data, error } = await supabase
    .from('tutor_lessons')
    .select('*')
    .eq('student_id', (await supabase
      .from('tutor_profiles')
      .select('id')
      .eq('telegram_id', telegramId)
      .single()).data?.id)
    .order('start_time', { ascending: true });
  if (error) throw error;
  return data;
}

// Получить мои домашние задания
export async function getMyHomeworks(telegramId: string) {
  const { data, error } = await supabase
    .from('tutor_homeworks')
    .select(`
      *,
      lesson:tutor_lessons(start_time, topic)
    `)
    .eq('lesson.student_id', (await supabase
      .from('tutor_profiles')
      .select('id')
      .eq('telegram_id', telegramId)
      .single()).data?.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}