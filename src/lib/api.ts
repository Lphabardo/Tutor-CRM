import { supabase } from './supabase';

const isTelegram = typeof window !== 'undefined' && 
                   (window as any).Telegram?.WebApp?.initData;
const WebApp = isTelegram ? (window as any).Telegram.WebApp : null;

// Парсинг initData Telegram для получения имени пользователя
function parseTelegramInitData(initData: string) {
  const params = new URLSearchParams(initData);
  const userStr = params.get('user');
  if (!userStr) return null;
  
  try {
    return JSON.parse(decodeURIComponent(userStr));
  } catch {
    return null;
  }
}

// Авторизация пользователя с авто-регистрацией
export async function authenticateUser() {
  // Режим тестирования (в браузере без Telegram)
  if (!WebApp) {
    return {
      success: true,
      telegram_id: '830672781',
      role: 'tutor',
      full_name: 'Преподаватель',
      balance: 0,
      user_id: 'test-user-id',
      is_new: false,
      language: null,
      google_doc_url: null
    };
  }

  const initData = WebApp.initData;
  if (!initData) throw new Error("Нет данных инициализации Telegram");

  // Получаем данные пользователя из Telegram
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

  // Парсим initData для получения реального имени
  const telegramUser = parseTelegramInitData(initData);
  const fullName = telegramUser 
    ? `${telegramUser.first_name || ''} ${telegramUser.last_name || ''}`.trim() || 'Ученик'
    : 'Ученик';

  // Проверяем, есть ли пользователь уже в БД
  const { data: existingUser, error: fetchError } = await supabase
    .from('tutor_profiles')
    .select('*')
    .eq('telegram_id', data.telegram_id)
    .single();

  // Если пользователь найден — возвращаем ВСЕ его поля из БД
  if (existingUser) {
    return {
      success: true,
      ...existingUser,
      telegram_id: data.telegram_id,
      user_id: existingUser.id
    };
  }

  // Если пользователя нет — создаём автоматически как ученика
  const { data: newUser, error: insertError } = await supabase
    .from('tutor_profiles')
    .insert([{
      telegram_id: data.telegram_id,
      full_name: fullName,
      role: 'student',
      balance: 0,
      is_new: true,
      language: null,
      google_doc_url: null
    }])
    .select()
    .single();

  if (insertError) throw insertError;

  return {
    success: true,
    ...newUser,
    telegram_id: data.telegram_id,
    user_id: newUser.id
  };
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
    .insert([{ telegram_id: telegramId, full_name: fullName, role: 'student', balance: 0, is_new: true }])
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
      student:tutor_profiles(full_name, telegram_id, language)
    `)
    .order('start_time', { ascending: true });
  if (error) throw error;
  return data;
}

// Отменить урок (с правилом 3 часов и уважительной причиной)
export async function cancelLesson(
  lessonId: string, 
  hasValidReason: boolean = false,
  canceledBy: 'student' | 'tutor' = 'student'
) {
  const { data, error } = await supabase.rpc('rpc_cancel_lesson', { 
    p_lesson_id: lessonId,
    p_has_valid_reason: hasValidReason,
    p_canceled_by: canceledBy
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

// Получить ближайший запланированный урок ученика
export async function getMyNextLesson(telegramId: string) {
  const { data: profile, error: profileError } = await supabase
    .from('tutor_profiles')
    .select('id')
    .eq('telegram_id', telegramId)
    .eq('role', 'student')
    .single();
  
  if (profileError || !profile) return null;

  const { data, error } = await supabase
    .from('tutor_lessons')
    .select('*')
    .eq('student_id', profile.id)
    .eq('status', 'scheduled')
    .gte('start_time', new Date().toISOString())
    .order('start_time', { ascending: true })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Уроков нет — это нормально
    throw error;
  }
  
  return data;
}

// Получить мои уроки
export async function getMyLessons(telegramId: string) {
  const { data: profile } = await supabase
    .from('tutor_profiles')
    .select('id')
    .eq('telegram_id', telegramId)
    .single();

  if (!profile) return [];

  const { data, error } = await supabase
    .from('tutor_lessons')
    .select('*')
    .eq('student_id', profile.id)
    .order('start_time', { ascending: true });
  if (error) throw error;
  return data;
}

// Получить мои домашние задания
export async function getMyHomeworks(telegramId: string) {
  const { data: profile } = await supabase
    .from('tutor_profiles')
    .select('id')
    .eq('telegram_id', telegramId)
    .single();

  if (!profile) return [];

  const { data, error } = await supabase
    .from('tutor_homeworks')
    .select(`
      *,
      lesson:tutor_lessons(start_time, topic)
    `)
    .eq('lesson.student_id', profile.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}