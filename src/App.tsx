import { useEffect, useState } from 'react';
import { authenticateUser, getStudents, addStudent, adjustBalance, getAllLessons, createLesson, cancelLesson, completeLesson, getMyNextLesson, updateStudentSettings, deleteStudent, calculateEarnings, updateTeacherRules, getFeedbacks, sendFeedback } from './lib/api';
import OnboardingForm from './components/OnboardingForm';

const WebApp = typeof window !== 'undefined' ? (window as any).Telegram?.WebApp : null;

function App() {
  useEffect(() => {
    console.log("=== ПРОВЕРКА TELEGRAM ===");
    console.log("1. window.Telegram:", (window as any).Telegram);
    console.log("2. window.Telegram?.WebApp:", (window as any).Telegram?.WebApp);
    console.log("3. initData:", (window as any).Telegram?.WebApp?.initData ? "ЕСТЬ" : "ОТСУТСТВУЕТ");
    console.log("========================");
  }, []);

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'students' | 'lessons' | 'finance' | 'settings'>('students');

  useEffect(() => {
    if (WebApp) {
      WebApp.ready();
      WebApp.expand();
    }
    authenticateUser()
      .then(setUser)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleOnboardingComplete = () => {
    if (user) {
      setUser({ ...user, is_new: false });
    }
  };

  if (loading) return <div className="p-6 text-center text-gray-500">Загрузка...</div>;
  if (error) return <div className="p-6 text-center text-red-500"><p className="text-lg font-bold mb-2">Ошибка</p><p>{error}</p></div>;

  if (user?.is_new) {
    return <OnboardingForm userId={user.id} onComplete={handleOnboardingComplete} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white p-4 shadow-sm">
        <h1 className="text-xl font-bold">Привет, {user.full_name}! 👋</h1>
        <p className="text-sm text-gray-500 mt-1">
          {user.role === 'tutor' ? '👨‍🏫 Преподаватель' : '👨‍ Ученик'} | ID: {user.telegram_id}
          {user.language && ` | Язык: ${user.language}`}
        </p>
      </div>

      {user.role === 'tutor' ? (
        <TutorDashboard activeTab={activeTab} setActiveTab={setActiveTab} />
      ) : (
        <StudentDashboard telegramId={user.telegram_id} user={user} />
      )}
    </div>
  );
}

function TutorDashboard({ activeTab, setActiveTab }: { activeTab: string, setActiveTab: (tab: any) => void }) {
  return (
    <div>
      <div className="flex border-b bg-white overflow-x-auto">
        <button onClick={() => setActiveTab('students')} className={`flex-1 py-3 font-semibold text-sm whitespace-nowrap ${activeTab === 'students' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}>Ученики</button>
        <button onClick={() => setActiveTab('lessons')} className={`flex-1 py-3 font-semibold text-sm whitespace-nowrap ${activeTab === 'lessons' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}>Расписание</button>
        <button onClick={() => setActiveTab('finance')} className={`flex-1 py-3 font-semibold text-sm whitespace-nowrap ${activeTab === 'finance' ? 'text-green-600 border-b-2 border-green-600' : 'text-gray-500'}`}>💰 Финансы</button>
        <button onClick={() => setActiveTab('settings')} className={`flex-1 py-3 font-semibold text-sm whitespace-nowrap ${activeTab === 'settings' ? 'text-purple-600 border-b-2 border-purple-600' : 'text-gray-500'}`}>⚙️ Настройки</button>
      </div>
      {activeTab === 'students' ? <StudentsTab /> : activeTab === 'lessons' ? <LessonsTab /> : activeTab === 'finance' ? <FinanceTab /> : <SettingsTab />}
    </div>
  );
}

function StudentsTab() {
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTelegramId, setNewTelegramId] = useState('');
  const [newName, setNewName] = useState('');

  const loadStudents = async () => {
    try { const data = await getStudents(); setStudents(data); } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => { loadStudents(); }, []);

  const handleAddStudent = async () => {
    if (!newTelegramId || !newName) return;
    try {
      await addStudent(parseInt(newTelegramId), newName);
      setNewTelegramId(''); setNewName(''); setShowAddForm(false);
      await loadStudents();
      alert('Ученик добавлен!');
    } catch (err: any) { alert('Ошибка: ' + err.message); }
  };

  const handleBalanceChange = async (studentId: string, amount: number, reason: string) => {
    try { await adjustBalance(studentId, amount, reason); await loadStudents(); } catch (err: any) { alert('Ошибка: ' + err.message); }
  };

  const handleDeleteStudent = async (studentId: string, studentName: string) => {
    if (!confirm(`Вы уверены, что хотите удалить ученика "${studentName}"?`)) return;
    try { await deleteStudent(studentId); await loadStudents(); alert('Ученик удален'); } catch (err: any) { alert('Ошибка: ' + err.message); }
  };

  const handleUpdateSettings = async (studentId: string, currentPrice: number, currentMeet: string, currentDoc: string) => {
    const newPrice = prompt(`Введите цену за урок (сейчас ${currentPrice}):`, String(currentPrice));
    if (newPrice === null) return;
    const newMeet = prompt(`Введите ссылку на Meet:`, currentMeet);
    if (newMeet === null) return;
    const newDoc = prompt(`Введите ссылку на Документ:`, currentDoc);
    if (newDoc === null) return;

    try {
      await updateStudentSettings(studentId, { price_per_lesson: parseInt(newPrice) || 0, meet_link: newMeet, google_doc_url: newDoc });
      await loadStudents();
      alert('Настройки сохранены!');
    } catch (err: any) { alert('Ошибка: ' + err.message); }
  };

  if (loading) return <div className="p-6 text-center">Загрузка...</div>;

  return (
    <div className="p-4">
      <button onClick={() => setShowAddForm(!showAddForm)} className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold mb-4">+ Добавить ученика</button>
      {showAddForm && (
        <div className="bg-white p-4 rounded-lg mb-4 shadow">
          <input type="number" placeholder="Telegram ID ученика" value={newTelegramId} onChange={(e) => setNewTelegramId(e.target.value)} className="w-full p-2 border rounded mb-2" />
          <input type="text" placeholder="Имя ученика" value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full p-2 border rounded mb-2" />
          <button onClick={handleAddStudent} className="w-full bg-green-600 text-white py-2 rounded">Сохранить</button>
        </div>
      )}
      {students.length === 0 ? <p className="text-center text-gray-500">Учеников пока нет</p> : (
        students.map(student => (
          <div key={student.id} className={`bg-white p-4 rounded-lg mb-3 shadow ${student.is_new ? 'border-l-4 border-yellow-400' : ''}`}>
            <div className="flex justify-between items-start mb-2">
              <div>
                <h3 className="font-bold text-lg">{student.full_name}</h3>
                <p className="text-sm text-gray-500">ID: {student.telegram_id}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-blue-600">{student.balance}</p>
                <p className="text-xs text-gray-500">уроков</p>
              </div>
            </div>
            <div className="flex gap-2 mt-3 flex-wrap">
              <button onClick={() => handleBalanceChange(student.id, 1, 'Пополнение')} className="flex-1 bg-green-500 text-white py-2 rounded text-sm">+1</button>
              <button onClick={() => handleBalanceChange(student.id, -1, 'Списание')} className="flex-1 bg-red-500 text-white py-2 rounded text-sm">-1</button>
              <button onClick={() => handleBalanceChange(student.id, 5, 'Пакет')} className="flex-1 bg-blue-500 text-white py-2 rounded text-sm">+5</button>
              <button onClick={() => handleDeleteStudent(student.id, student.full_name)} className="flex-1 bg-gray-100 text-red-500 py-2 rounded text-sm border border-red-200">🗑</button>
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100">
              <button onClick={() => handleUpdateSettings(student.id, student.price_per_lesson, student.meet_link, student.google_doc_url)} className="w-full bg-purple-50 text-purple-700 py-2 rounded text-xs border border-purple-200">️ Настройки (Цена/Meet)</button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function LessonsTab() {
  const [lessons, setLessons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [students, setStudents] = useState<any[]>([]);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [lessonDate, setLessonDate] = useState('');
  const [lessonTime, setLessonTime] = useState('');
  const [lessonTopic, setLessonTopic] = useState('');

  const loadLessons = async () => {
    try {
      const [lessonsData, studentsData] = await Promise.all([getAllLessons(), getStudents()]);
      setLessons(lessonsData); setStudents(studentsData);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => { loadLessons(); }, []);

  const handleCreateLesson = async () => {
    if (!selectedStudent || !lessonDate || !lessonTime) return;
    try {
      await createLesson(selectedStudent, new Date(`${lessonDate}T${lessonTime}:00`).toISOString(), lessonTopic);
      setLessonDate(''); setLessonTime(''); setLessonTopic(''); setSelectedStudent(''); setShowAddForm(false);
      await loadLessons();
      alert('Урок создан!');
    } catch (err: any) { alert('Ошибка: ' + err.message); }
  };

  const handleCancel = async (lessonId: string) => {
    if (!confirm('Отменить урок?')) return;
    const hasValidReason = confirm('Уважительная причина? (ОК=Да, Отмена=Нет)');
    try {
      const result = await cancelLesson(lessonId, hasValidReason, 'tutor');
      if (result === 'canceled_free_with_compensation') alert('Отменено (компенсация +1).');
      else alert('Отменено бесплатно.');
      await loadLessons();
    } catch (err: any) { alert('Ошибка: ' + err.message); }
  };

  const handleComplete = async (lessonId: string) => {
    const topic = prompt('Тема урока:');
    if (!topic) return;
    try { await completeLesson(lessonId, topic); await loadLessons(); alert('Урок завершен!'); } catch (err: any) { alert('Ошибка: ' + err.message); }
  };

  const getStatusText = (status: string) => {
    const map: any = { 'scheduled': '🕒 Запланирован', 'completed': '✅ Проведен', 'canceled_free': '❌ Отменен (бесплатно)', 'canceled_paid': '❌ Отменен (списан)' };
    return map[status] || status;
  };

  if (loading) return <div className="p-6 text-center">Загрузка...</div>;
  const filteredLessons = showHistory ? lessons : lessons.filter(l => l.status === 'scheduled');

  return (
    <div className="p-4">
      <div className="flex gap-2 mb-4">
        <button onClick={() => setShowAddForm(!showAddForm)} className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-semibold">+ Урок</button>
        <button onClick={() => setShowHistory(!showHistory)} className="px-4 py-3 rounded-lg border bg-white">{showHistory ? 'Скрыть' : '📜 История'}</button>
      </div>
      {showAddForm && (
        <div className="bg-white p-4 rounded-lg mb-4 shadow">
          <select value={selectedStudent} onChange={(e) => setSelectedStudent(e.target.value)} className="w-full p-2 border rounded mb-2"><option value="">Ученик</option>{students.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select>
          <input type="date" value={lessonDate} onChange={(e) => setLessonDate(e.target.value)} className="w-full p-2 border rounded mb-2" />
          <input type="time" value={lessonTime} onChange={(e) => setLessonTime(e.target.value)} className="w-full p-2 border rounded mb-2" />
          <input type="text" placeholder="Тема" value={lessonTopic} onChange={(e) => setLessonTopic(e.target.value)} className="w-full p-2 border rounded mb-2" />
          <button onClick={handleCreateLesson} className="w-full bg-green-600 text-white py-2 rounded">Создать</button>
        </div>
      )}
      {filteredLessons.length === 0 ? <p className="text-center text-gray-500 py-8">Пусто</p> : (
        filteredLessons.map(lesson => (
          <div key={lesson.id} className="bg-white p-4 rounded-lg mb-3 shadow">
            <div className="flex justify-between items-start mb-2">
              <div>
                <h3 className="font-bold">{lesson.student?.full_name}</h3>
                <p className="text-sm text-gray-500">{new Date(lesson.start_time).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                {lesson.topic && <p className="text-sm mt-1">📚 {lesson.topic}</p>}
              </div>
              <span className="text-sm font-semibold">{getStatusText(lesson.status)}</span>
            </div>
            {lesson.status === 'scheduled' && (
              <div className="flex gap-2 mt-3">
                <button onClick={() => handleComplete(lesson.id)} className="flex-1 bg-green-500 text-white py-2 rounded text-sm">✅</button>
                <button onClick={() => handleCancel(lesson.id)} className="flex-1 bg-red-500 text-white py-2 rounded text-sm"></button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

function FinanceTab() {
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [result, setResult] = useState<{ totalSum: number, count: number } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCalculate = async () => {
    setLoading(true);
    try {
      const data = await calculateEarnings(new Date(startDate).toISOString(), new Date(endDate).toISOString());
      setResult({ totalSum: data.totalSum, count: data.count });
    } catch (err) { alert('Ошибка'); } finally { setLoading(false); }
  };

  return (
    <div className="p-4 space-y-6">
      <div className="bg-white p-6 rounded-xl shadow">
        <h3 className="font-bold text-lg mb-4">💰 Калькулятор</h3>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full p-2 border rounded" />
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full p-2 border rounded" />
        </div>
        <button onClick={handleCalculate} disabled={loading} className="w-full bg-green-600 text-white py-3 rounded-lg font-bold">{loading ? '...' : 'Рассчитать'}</button>
      </div>
      {result && (
        <div className="bg-green-50 p-6 rounded-xl shadow border border-green-200 text-center">
          <p className="text-gray-600">Уроков: {result.count}</p>
          <p className="text-4xl font-bold text-green-700 mt-2">{result.totalSum} ₽</p>
        </div>
      )}
    </div>
  );
}

// === НОВАЯ ВКЛАДКА НАСТРОЕК ===
function SettingsTab() {
  const [rules, setRules] = useState('');
  const [feedbacks, setFeedbacks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      // Загружаем правила (берем от первого попавшегося ученика или преподавателя, они синхронизированы)
      // Для простоты, загрузим профиль преподавателя
      // Но у нас нет прямой функции getTutorProfile, поэтому используем хак: загрузим список учеников и возьмем правила оттуда,
      // так как они копируются при updateTeacherRules.
      const students = await getStudents();
      if (students.length > 0 && students[0].rules_text) {
        setRules(students[0].rules_text);
      } else {
        // Дефолтные правила если пусто
        setRules(`Правила переноса и отмены занятий:
1. Неявка без уведомления = урок проведен.
2. Отмена < 3 часов = урок проведен.
3. Отмена преподавателем = след. урок бесплатно.
4. Уважительная причина = индивидуально.
5. Отмена 1 раз в месяц.

Оплата заранее пакетами.`);
      }

      const feedbacksData = await getFeedbacks();
      setFeedbacks(feedbacksData);
      setLoading(false);
    };
    loadData();
  }, []);

  const handleSaveRules = async () => {
    try {
      await updateTeacherRules(rules);
      alert('Правила сохранены и обновлены у всех учеников!');
    } catch (err: any) { alert('Ошибка: ' + err.message); }
  };

  if (loading) return <div className="p-6 text-center">Загрузка...</div>;

  return (
    <div className="p-4 space-y-6">
      <div className="bg-white p-4 rounded-xl shadow">
        <h3 className="font-bold text-lg mb-2">📜 Редактор Правил</h3>
        <p className="text-xs text-gray-500 mb-2">Текст ниже увидят все ученики в разделе "Правила".</p>
        <textarea 
          value={rules} 
          onChange={(e) => setRules(e.target.value)} 
          className="w-full h-48 p-3 border rounded-lg text-sm font-mono"
        />
        <button onClick={handleSaveRules} className="w-full mt-2 bg-purple-600 text-white py-2 rounded-lg font-semibold">Сохранить правила</button>
      </div>

      <div className="bg-white p-4 rounded-xl shadow">
        <h3 className="font-bold text-lg mb-4">💬 Отзывы от учеников</h3>
        {feedbacks.length === 0 ? <p className="text-gray-500 text-sm">Пока нет отзывов</p> : (
          feedbacks.map((f, i) => (
            <div key={i} className="border-b border-gray-100 py-3 last:border-0">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>От: {f.student_name}</span>
                <span>{new Date(f.created_at).toLocaleDateString()}</span>
              </div>
              <p className="text-gray-800 text-sm">{f.message}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function StudentDashboard({ telegramId, user }: { telegramId: string, user: any }) {
  const [nextLesson, setNextLesson] = useState<any>(null);
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [rulesText, setRulesText] = useState(user.rules_text || "Загрузка правил...");

  useEffect(() => {
    const fetchNextLesson = async () => {
      try { const lesson = await getMyNextLesson(telegramId); setNextLesson(lesson); } catch (err) { console.error(err); } finally { setLoading(false); }
    };
    fetchNextLesson();
  }, [telegramId]);

  useEffect(() => {
    if (!nextLesson) return;
    const updateTimer = () => {
      const diff = new Date(nextLesson.start_time).getTime() - new Date().getTime();
      if (diff <= 0) { setTimeLeft('Урок начался!'); return; }
      const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);
      setTimeLeft(`${h}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`);
    };
    updateTimer();
    const t = setInterval(updateTimer, 1000);
    return () => clearInterval(t);
  }, [nextLesson]);

  const handleCancelLesson = async () => {
    if (!nextLesson) return;
    if (!confirm('Отменить урок?')) return;
    const hasValidReason = confirm('Уважительная причина? (ОК=Да)');
    try {
      const res = await cancelLesson(nextLesson.id, hasValidReason, 'student');
      if (res === 'canceled_paid') alert('Списан 1 урок.');
      else alert('Отменено бесплатно.');
      setNextLesson(null); setTimeLeft('');
    } catch (err: any) { alert('Ошибка: ' + err.message); }
  };

  const handleSendFeedback = async () => {
    const msg = prompt("Напишите ваш отзыв или пожелание:");
    if (!msg) return;
    try {
      await sendFeedback(user.full_name, msg);
      alert("Отзыв отправлен преподавателю! 💬");
    } catch (err) { alert("Ошибка отправки"); }
  };

  if (loading) return <div className="p-6 text-center">Загрузка...</div>;

  let balClass = 'border-blue-500';
  if (user.balance <= 2) balClass = 'border-red-500 bg-red-50';
  else if (user.balance <= 4) balClass = 'border-yellow-500';

  return (
    <div className="p-4 space-y-4">
      <div className={`bg-white p-4 rounded-xl shadow flex justify-between items-center border-l-4 ${balClass}`}>
        <div><p className="text-sm text-gray-500">Баланс</p><p className="text-3xl font-bold">{user.balance}</p></div>
        <div className="text-4xl">{user.balance <= 1 ? '' : '📚'}</div>
      </div>

      <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-6 rounded-2xl shadow-lg">
        <h2 className="text-lg font-semibold mb-1">⏰ Ближайший урок</h2>
        {nextLesson ? (
          <>
            <h3 className="text-2xl font-bold mb-2">{nextLesson.topic || 'Без темы'}</h3>
            <p className="text-blue-100">{new Date(nextLesson.start_time).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</p>
            <div className="bg-white/20 rounded-xl p-4 text-center my-4"><p className="text-4xl font-mono font-bold">{timeLeft}</p></div>
            <div className="flex flex-col gap-3">
              {nextLesson.meet_link ? (
                <a href={nextLesson.meet_link} target="_blank" className="w-full bg-white text-blue-600 py-3 rounded-xl font-bold text-center">🎥 Войти в Meet</a>
              ) : (
                <div className="w-full bg-gray-200 text-gray-500 py-3 rounded-xl font-bold text-center">⏳ Ссылка появится перед уроком</div>
              )}
              <button onClick={handleCancelLesson} className="w-full bg-red-500/80 text-white py-3 rounded-xl font-semibold">❌ Отменить</button>
            </div>
          </>
        ) : (
          <div className="text-center py-4"><p className="text-xl font-bold">Нет уроков</p></div>
        )}
      </div>

      <div className="bg-white p-6 rounded-xl shadow">
        <h3 className="font-bold text-lg mb-3">📚 Материалы</h3>
        {user.google_doc_url ? <a href={user.google_doc_url} target="_blank" className="block w-full bg-green-50 text-green-700 py-3 rounded-lg text-center font-semibold border border-green-200">Открыть Документ ↗</a> : <p className="text-gray-500 text-sm">Нет ссылки</p>}
      </div>

      <div className="bg-white p-6 rounded-xl shadow">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-bold text-lg">⚖️ Правила</h3>
          <button onClick={handleSendFeedback} className="bg-purple-100 text-purple-700 px-3 py-1 rounded text-xs font-bold">💬 Отзыв</button>
        </div>
        <div className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
          {rulesText || "Правила не загружены"}
        </div>
      </div>
    </div>
  );
}

export default App;