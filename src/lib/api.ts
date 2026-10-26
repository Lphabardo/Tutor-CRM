import { supabase } from './supabase';

// ТВОЙ БОТ ТОКЕН (Для отправки отзывов)
const BOT_TOKEN = "8930796552:AAGaXKS89TcPsz7vrkZeSQbWxwYL18gSry0";
const TEACHER_CHAT_ID = "830672781";

const WebApp = typeof window !== 'undefined' ? (window as any).Telegram?.WebApp : null;

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

export async function authenticateUser() {
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
      google_doc_url: null,
      price_per_lesson: 0
    };
  }

  WebApp.ready();
  WebApp.expand();

  let telegramId: string | null = null;
  let fullName = 'Ученик';
  const initData = WebApp.initData;

  if (initData) {
    const telegramUser = parseTelegramInitData(initData);
    if (telegramUser) {
      telegramId = telegramUser.id?.toString() || null;
      fullName = `${telegramUser.first_name || ''} ${telegramUser.last_name || ''}`.trim() || 'Ученик';
    }
  }

  if (!telegramId && WebApp.initDataUnsafe?.user) {
    const unsafeUser = WebApp.initDataUnsafe.user;
    telegramId = unsafeUser.id?.toString() || null;
    fullName = `${unsafeUser.first_name || ''} ${unsafeUser.last_name || ''}`.trim() || 'Ученик';
  }

  if (!telegramId) {
    throw new Error("Не удалось получить данные пользователя Telegram. Пожалуйста, закройте и откройте приложение заново через бота.");
  }

  if (initData) {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-telegram`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData }) }
      );
      const data = await response.json();
      if (data.success && data.role) {
        return {
          success: true,
          telegram_id: data.telegram_id,
          role: data.role,
          full_name: data.full_name,
          balance: data.balance,
          user_id: data.user_id,
          is_new: data.is_new,
          language: data.language,
          google_doc_url: data.google_doc_url,
          price_per_lesson: data.price_per_lesson || 0
        };
      }
    } catch (err) { console.error("Ошибка проверки initData:", err); }
  }

  const { data: existingUser, error: fetchError } = await supabase
    .from('tutor_profiles')
    .select('*')
    .eq('telegram_id', telegramId)
    .single();

  if (existingUser) {
    return {
      success: true,
      ...existingUser,
      telegram_id: telegramId,
      user_id: existingUser.id,
      price_per_lesson: existingUser.price_per_lesson || 0
    };
  }

  const { data: newUser, error: insertError } = await supabase
    .from('tutor_profiles')
    .insert([{
      telegram_id: telegramId,
      full_name: fullName,
      role: 'student',
      balance: 0,
      is_new: true,
      language: null,
      google_doc_url: null,
      price_per_lesson: 0
    }])
    .select()
    .single();

  if (insertError) throw insertError;

  return {
    success: true,
    ...newUser,
    telegram_id: telegramId,
    user_id: newUser.id,
    price_per_lesson: newUser.price_per_lesson || 0
  };
}

export async function getStudents() {
  const { data, error } = await supabase
    .from('tutor_profiles')
    .select('*')
    .eq('role', 'student')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function addStudent(telegramId: number, fullName: string) {
  const { data, error } = await supabase
    .from('tutor_profiles')
    .insert([{ telegram_id: telegramId, full_name: fullName, role: 'student', balance: 0, is_new: true, price_per_lesson: 0 }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function adjustBalance(studentId: string, amount: number, reason: string) {
  const { error } = await supabase.rpc('rpc_adjust_balance', { 
    p_student_id: studentId, 
    p_amount: amount, 
    p_reason: reason 
  });
  if (error) throw error;
}

export async function updateStudentSettings(studentId: string, settings: { price_per_lesson?: number, meet_link?: string, google_doc_url?: string }) {
  const { error } = await supabase
    .from('tutor_profiles')
    .update(settings)
    .eq('id', studentId);
  if (error) throw error;
}

// === НОВОЕ: Обновление правил преподавателя ===
export async function updateTeacherRules(rulesText: string) {
  // Обновляем правила у ВСЕХ учеников и преподавателя для синхронизации
  // Но проще обновить только у преподавателя, а ученики будут читать оттуда
  // В рамках текущей логики обновим у текущего юзера (преподавателя)
  // И также обновим глобальную настройку, если бы она была.
  // Сейчас просто обновим запись преподавателя.
  const { data: tutor } = await supabase.from('tutor_profiles').select('id').eq('role', 'tutor').single();
  
  if (tutor) {
     await supabase.from('tutor_profiles').update({ rules_text: rulesText }).eq('id', tutor.id);
  }
  
  // Также обновим у всех студентов, чтобы они видели изменения сразу при входе
  await supabase.from('tutor_profiles').update({ rules_text: rulesText }).eq('role', 'student');
}

// === НОВОЕ: Получение отзывов ===
export async function getFeedbacks() {
  const { data, error } = await supabase
    .from('student_feedback')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// === НОВОЕ: Отправка отзыва (в бот и в базу) ===
export async function sendFeedback(studentName: string, message: string) {
  // 1. Сохраняем в базу
  await supabase.from('student_feedback').insert({ student_name: studentName, message });

  // 2. Отправляем в Телеграм Преподавателю
  const text = `💬 НОВЫЙ ОТЗЫВ!\n\nОт: ${studentName}\nСообщение:\n${message}`;
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TEACHER_CHAT_ID, text })
  });
}

export async function createLesson(studentId: string, startTime: string, topic: string) {
  const { data: student } = await supabase.from('tutor_profiles').select('meet_link').eq('id', studentId).single();
  const meetLink = student?.meet_link || null;

  const { data, error } = await supabase
    .from('tutor_lessons')
    .insert([{ 
      student_id: studentId, 
      start_time: startTime, 
      status: 'scheduled', 
      topic,
      meet_link: meetLink 
    }])
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function getAllLessons() {
  const { data, error } = await supabase
    .from('tutor_lessons')
    .select(`
      *,
      student:tutor_profiles(full_name, telegram_id, language, price_per_lesson)
    `)
    .order('start_time', { ascending: true });
  if (error) throw error;
  return data;
}

export async function cancelLesson(lessonId: string, hasValidReason: boolean = false, canceledBy: 'student' | 'tutor' = 'student') {
  const { data, error } = await supabase.rpc('rpc_cancel_lesson', { 
    p_lesson_id: lessonId,
    p_has_valid_reason: hasValidReason,
    p_canceled_by: canceledBy
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

export async function deleteStudent(studentId: string) {
  const { error } = await supabase
    .from('tutor_profiles')
    .delete()
    .eq('id', studentId);
  if (error) throw error;
}

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
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data;
}

export async function getMyLessons(telegramId: string) {
  const { data: profile } = await supabase.from('tutor_profiles').select('id').eq('telegram_id', telegramId).single();
  if (!profile) return [];
  const { data, error } = await supabase.from('tutor_lessons').select('*').eq('student_id', profile.id).order('start_time', { ascending: true });
  if (error) throw error;
  return data;
}

export async function getMyHomeworks(telegramId: string) {
  const { data: profile } = await supabase.from('tutor_profiles').select('id').eq('telegram_id', telegramId).single();
  if (!profile) return [];
  const { data, error } = await supabase.from('tutor_homeworks').select(`*, lesson:tutor_lessons(start_time, topic)`).eq('lesson.student_id', profile.id).order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function calculateEarnings(startDate: string, endDate: string) {
  const { data, error } = await supabase
    .from('tutor_lessons')
    .select(`*, student:tutor_profiles(price_per_lesson, full_name)`)
    .eq('status', 'completed')
    .gte('start_time', startDate)
    .lte('start_time', endDate)
    .order('start_time', { ascending: false });

  if (error) throw error;

  let totalSum = 0;
  const earningsDetails: any[] = [];

  data.forEach((lesson: any) => {
    const price = lesson.student?.price_per_lesson || 0;
    totalSum += price;
    earningsDetails.push({ date: lesson.start_time, studentName: lesson.student?.full_name, price: price });
  });

  return { totalSum, count: data.length, details: earningsDetails };
}