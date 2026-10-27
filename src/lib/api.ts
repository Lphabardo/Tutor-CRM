import { supabase } from './supabase';

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
      price_per_lesson: 0,
      fixed_schedule: '',
      rules_text: ''
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
          price_per_lesson: data.price_per_lesson || 0,
          fixed_schedule: data.fixed_schedule || '',
          rules_text: data.rules_text || ''
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
      price_per_lesson: existingUser.price_per_lesson || 0,
      fixed_schedule: existingUser.fixed_schedule || '',
      rules_text: existingUser.rules_text || ''
    };
  }

  const { data: tutorRules } = await supabase.from('tutor_profiles').select('rules_text').eq('role', 'tutor').single();

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
      price_per_lesson: 0,
      fixed_schedule: '',
      rules_text: tutorRules?.rules_text || ''
    }])
    .select()
    .single();

  if (insertError) throw insertError;

  return {
    success: true,
    ...newUser,
    telegram_id: telegramId,
    user_id: newUser.id,
    price_per_lesson: newUser.price_per_lesson || 0,
    fixed_schedule: newUser.fixed_schedule || '',
    rules_text: newUser.rules_text || ''
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
  const { data: tutorRules } = await supabase.from('tutor_profiles').select('rules_text').eq('role', 'tutor').single();

  const { data, error } = await supabase
    .from('tutor_profiles')
    .insert([{ 
      telegram_id: telegramId, 
      full_name: fullName, 
      role: 'student', 
      balance: 0, 
      is_new: true, 
      price_per_lesson: 0, 
      fixed_schedule: '',
      rules_text: tutorRules?.rules_text || ''
    }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function adjustBalance(studentId: string, amount: number, reason: string) {
  const { error: rpcError } = await supabase.rpc('rpc_adjust_balance', { 
    p_student_id: studentId, 
    p_amount: amount, 
    p_reason: reason 
  });
  if (rpcError) throw rpcError;

  const { error: txError } = await supabase
    .from('transactions')
    .insert({
      student_id: studentId,
      amount: amount,
      reason: reason
    });
  
  if (txError) throw txError;
}

export async function getStudentTransactions(studentId: string) {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data;
}

export async function updateStudentSettings(studentId: string, settings: { price_per_lesson?: number, meet_link?: string, google_doc_url?: string, fixed_schedule?: string }) {
  const { error } = await supabase
    .from('tutor_profiles')
    .update(settings)
    .eq('id', studentId);
  if (error) throw error;
}

export async function getTeacherRules() {
  const { data, error } = await supabase
    .from('tutor_profiles')
    .select('rules_text')
    .eq('role', 'tutor')
    .single();
  if (error) throw error;
  return data?.rules_text || '';
}

export async function updateTeacherRules(rulesText: string) {
  await supabase.from('tutor_profiles').update({ rules_text: rulesText }).eq('role', 'tutor');
  await supabase.from('tutor_profiles').update({ rules_text: rulesText }).eq('role', 'student');
}

export async function getFeedbacks() {
  const { data, error } = await supabase
    .from('student_feedback')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function sendFeedback(studentName: string, message: string) {
  await supabase.from('student_feedback').insert({ student_name: studentName, message });

  const text = `💬 НОВЫЙ ОТЗЫВ!\n\nОт: ${studentName}\nСообщение:\n${message}`;
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TEACHER_CHAT_ID, text })
  });
}

export async function createLesson(studentId: string, startTime: string, topic: string) {
  const { data: student } = await supabase
    .from('tutor_profiles')
    .select('meet_link, price_per_lesson')
    .eq('id', studentId)
    .single();

  const meetLink = student?.meet_link || null;
  const priceSnapshot = student?.price_per_lesson || 0;

  const { data, error } = await supabase
    .from('tutor_lessons')
    .insert([{ 
      student_id: studentId, 
      start_time: startTime, 
      status: 'scheduled', 
      topic,
      meet_link: meetLink,
      price_snapshot: priceSnapshot
    }])
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function generateRecurringLessons(studentId: string, weeks: number = 4) {
  const { data: student, error: sErr } = await supabase
    .from('tutor_profiles')
    .select('fixed_schedule, price_per_lesson, meet_link')
    .eq('id', studentId)
    .single();
    
  if (sErr || !student) throw new Error("Ученик не найден");
  if (!student.fixed_schedule?.trim()) throw new Error("Сначала укажите расписание в настройках ученика");

  const dayMap: Record<string, number> = { 'Пн': 1, 'Вт': 2, 'Ср': 3, 'Чт': 4, 'Пт': 5, 'Сб': 6, 'Вс': 0 };
  const slots = student.fixed_schedule.split(',').map(s => s.trim()).filter(Boolean);
  const now = new Date(); 
  now.setHours(0, 0, 0, 0);
  const endDate = new Date(now); 
  endDate.setDate(endDate.getDate() + weeks * 7);
  
  const { data: existing } = await supabase
    .from('tutor_lessons')
    .select('start_time')
    .eq('student_id', studentId)
    .eq('status', 'scheduled')
    .gte('start_time', now.toISOString())
    .lte('start_time', endDate.toISOString());
    
  const existingTimes = new Set(existing?.map(l => l.start_time) || []);
  const toInsert: any[] = [];

  for (let w = 0; w < weeks; w++) {
    for (const slot of slots) {
      const parts = slot.split(' ');
      if (parts.length < 2) continue;
      
      const dayStr = parts[0].replace(/[.,]/g, '');
      const timeStr = parts[1];
      const dayIdx = dayMap[dayStr];
      if (dayIdx === undefined) continue;

      const target = new Date(now);
      const daysUntil = (dayIdx - now.getDay() + 7) % 7;
      target.setDate(now.getDate() + daysUntil + (w * 7));
      
      const [h, m] = timeStr.split(':').map(Number);
      target.setHours(h, m, 0, 0);

      if (target < now) continue;
      
      const iso = target.toISOString();
      if (!existingTimes.has(iso)) {
        toInsert.push({ 
          student_id: studentId, 
          start_time: iso, 
          status: 'scheduled', 
          topic: 'Занятие по расписанию', 
          meet_link: student.meet_link || null, 
          price_snapshot: student.price_per_lesson || 0 
        });
        existingTimes.add(iso);
      }
    }
  }

  if (toInsert.length === 0) return { created: 0, message: "Уроки на этот период уже существуют" };
  
  const { error: iErr } = await supabase.from('tutor_lessons').insert(toInsert);
  if (iErr) throw iErr;
  
  return { created: toInsert.length, message: `✅ Создано ${toInsert.length} уроков` };
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

// === ИСПРАВЛЕНО: Теперь при завершении урока создается запись в журнале транзакций ===
export async function completeLesson(lessonId: string, topic: string) {
  // 1. Сначала получаем информацию об уроке, чтобы узнать student_id
  const { data: lesson } = await supabase
    .from('tutor_lessons')
    .select('student_id')
    .eq('id', lessonId)
    .single();

  if (!lesson) throw new Error("Урок не найден");

  // 2. Завершаем урок (это спишет баланс через RPC)
  const { error } = await supabase.rpc('rpc_complete_lesson', { 
    p_lesson_id: lessonId, 
    p_topic: topic 
  });
  if (error) throw error;

  // 3. Создаем запись в журнале транзакций
  const { error: txError } = await supabase
    .from('transactions')
    .insert({
      student_id: lesson.student_id,
      amount: -1, // списание 1 урока
      reason: `Урок проведен: ${topic}`
    });
  
  if (txError) {
    console.error("Не удалось создать запись в журнале:", txError);
    // Не выбрасываем ошибку, чтобы не сломать завершение урока
  }
}

export async function deleteStudent(studentId: string) {
  const { error } = await supabase
    .from('tutor_profiles')
    .delete()
    .eq('id', studentId);
  if (error) throw error;
}

// === ИСПРАВЛЕНО: Даем "окно" в 2 часа, чтобы опоздавший ученик всё ещё видел урок ===
export async function getMyNextLesson(telegramId: string) {
  const { data: profile, error: profileError } = await supabase
    .from('tutor_profiles')
    .select('id')
    .eq('telegram_id', telegramId)
    .eq('role', 'student')
    .single();
  
  if (profileError || !profile) return null;

  // Смотрим на 2 часа назад, чтобы карточка не исчезала при опоздании
  const gracePeriod = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('tutor_lessons')
    .select('*')
    .eq('student_id', profile.id)
    .eq('status', 'scheduled')
    .gte('start_time', gracePeriod) 
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
    const price = lesson.price_snapshot || lesson.student?.price_per_lesson || 0;
    totalSum += price;
    earningsDetails.push({ date: lesson.start_time, studentName: lesson.student?.full_name, price: price });
  });

  return { totalSum, count: data.length, details: earningsDetails };
}