import { supabase } from './supabase';

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
      google_doc_url: null
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
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData })
        }
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
          google_doc_url: data.google_doc_url
        };
      }
    } catch (err) {
      console.error("Ошибка проверки initData:", err);
    }
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
      user_id: existingUser.id
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
      google_doc_url: null
    }])
    .select()
    .single();

  if (insertError) throw insertError;

  return {
    success: true,
    ...newUser,
    telegram_id: telegramId,
    user_id: newUser.id
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
    .insert([{ telegram_id: telegramId, full_name: fullName, role: 'student', balance: 0, is_new: true }])
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

export async function updateStudentDocUrl(studentId: string, docUrl: string) {
  const { error } = await supabase
    .from('tutor_profiles')
    .update({ google_doc_url: docUrl })
    .eq('id', studentId);
  if (error) throw error;
}

// === ОБНОВЛЕНО: Добавлен параметр meetLink ===
export async function createLesson(studentId: string, startTime: string, topic: string, meetLink?: string) {
  const { data, error } = await supabase
    .from('tutor_lessons')
    .insert([{ 
      student_id: studentId, 
      start_time: startTime, 
      status: 'scheduled', 
      topic,
      meet_link: meetLink || null // Сохраняем ссылку, если она есть
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
      student:tutor_profiles(full_name, telegram_id, language)
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
    .select('*') // * автоматически заберет и новое поле meet_link
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