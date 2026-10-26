import { useEffect, useState } from 'react';
import { authenticateUser, getStudents, addStudent, adjustBalance, getAllLessons, createLesson, cancelLesson, completeLesson, getMyNextLesson, updateStudentDocUrl, deleteStudent } from './lib/api';
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
  const [activeTab, setActiveTab] = useState<'students' | 'lessons'>('students');

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
          {user.role === 'tutor' ? '👨‍🏫 Преподаватель' : '👨‍🎓 Ученик'} | ID: {user.telegram_id}
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

function TutorDashboard({ activeTab, setActiveTab }: { activeTab: 'students' | 'lessons', setActiveTab: (tab: 'students' | 'lessons') => void }) {
  return (
    <div>
      <div className="flex border-b bg-white">
        <button onClick={() => setActiveTab('students')} className={`flex-1 py-3 font-semibold ${activeTab === 'students' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}>
          Ученики
        </button>
        <button onClick={() => setActiveTab('lessons')} className={`flex-1 py-3 font-semibold ${activeTab === 'lessons' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}>
          Расписание
        </button>
      </div>
      {activeTab === 'students' ? <StudentsTab /> : <LessonsTab />}
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
    try {
      const data = await getStudents();
      setStudents(data);
    } catch (err) { console.error(err); } finally { setLoading(false); }
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
    try {
      await adjustBalance(studentId, amount, reason);
      await loadStudents();
    } catch (err: any) { alert('Ошибка: ' + err.message); }
  };

  const handleDeleteStudent = async (studentId: string, studentName: string) => {
    if (!confirm(`Вы уверены, что хотите удалить ученика "${studentName}"?\nЭто действие нельзя отменить.`)) return;
    try {
      await deleteStudent(studentId);
      await loadStudents();
      alert('Ученик удален');
    } catch (err: any) { alert('Ошибка при удалении: ' + err.message); }
  };

  const handleUpdateDocUrl = async (studentId: string, currentUrl: string) => {
    const newUrl = prompt('Вставьте ссылку на Google Документ (конспект и ДЗ):', currentUrl || '');
    if (newUrl === null) return; 
    try {
      await updateStudentDocUrl(studentId, newUrl);
      await loadStudents();
      alert('Ссылка успешно сохранена!');
    } catch (err: any) { alert('Ошибка: ' + err.message); }
  };

  if (loading) return <div className="p-6 text-center">Загрузка...</div>;

  return (
    <div className="p-4">
      <button onClick={() => setShowAddForm(!showAddForm)} className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold mb-4">
        + Добавить ученика
      </button>

      {showAddForm && (
        <div className="bg-white p-4 rounded-lg mb-4 shadow">
          <input type="number" placeholder="Telegram ID ученика" value={newTelegramId} onChange={(e) => setNewTelegramId(e.target.value)} className="w-full p-2 border rounded mb-2" />
          <input type="text" placeholder="Имя ученика" value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full p-2 border rounded mb-2" />
          <button onClick={handleAddStudent} className="w-full bg-green-600 text-white py-2 rounded">Сохранить</button>
        </div>
      )}

      {students.length === 0 ? (
        <p className="text-center text-gray-500">Учеников пока нет</p>
      ) : (
        students.map(student => (
          <div key={student.id} className={`bg-white p-4 rounded-lg mb-3 shadow ${student.is_new ? 'border-l-4 border-yellow-400' : ''}`}>
            <div className="flex justify-between items-start mb-2">
              <div>
                <h3 className="font-bold text-lg">{student.full_name}{student.is_new && <span className="ml-2 text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">Новый</span>}</h3>
                <p className="text-sm text-gray-500">ID: {student.telegram_id} {student.language && `| Язык: ${student.language}`}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-blue-600">{student.balance}</p>
                <p className="text-xs text-gray-500">уроков</p>
              </div>
            </div>
            <div className="flex gap-2 mt-3 flex-wrap">
              <button onClick={() => handleBalanceChange(student.id, 1, 'Пополнение баланса')} className="flex-1 bg-green-500 text-white py-2 rounded text-sm min-w-[60px]">+1 урок</button>
              <button onClick={() => handleBalanceChange(student.id, -1, 'Списание урока')} className="flex-1 bg-red-500 text-white py-2 rounded text-sm min-w-[60px]">-1 урок</button>
              <button onClick={() => handleBalanceChange(student.id, 5, 'Пакет из 5 уроков')} className="flex-1 bg-blue-500 text-white py-2 rounded text-sm min-w-[60px]">+5 уроков</button>
              <button onClick={() => handleUpdateDocUrl(student.id, student.google_doc_url)} className="flex-1 bg-purple-500 text-white py-2 rounded text-sm min-w-[60px] flex items-center justify-center gap-1">📎 Док</button>
              <button onClick={() => handleDeleteStudent(student.id, student.full_name)} className="flex-1 bg-gray-100 text-red-500 py-2 rounded text-sm min-w-[60px] border border-red-200 hover:bg-red-50">🗑 Удалить</button>
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
  const [lessonMeetLink, setLessonMeetLink] = useState(''); // <--- НОВОЕ: Ссылка на Meet

  const loadLessons = async () => {
    try {
      const [lessonsData, studentsData] = await Promise.all([getAllLessons(), getStudents()]);
      setLessons(lessonsData);
      setStudents(studentsData);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => { loadLessons(); }, []);

  const handleCreateLesson = async () => {
    if (!selectedStudent || !lessonDate || !lessonTime) return;
    try {
      const startTime = new Date(`${lessonDate}T${lessonTime}:00`).toISOString();
      // Передаем ссылку в функцию создания
      await createLesson(selectedStudent, startTime, lessonTopic, lessonMeetLink);
      setLessonDate(''); setLessonTime(''); setLessonTopic(''); setLessonMeetLink('');
      setSelectedStudent(''); setShowAddForm(false);
      await loadLessons();
      alert('Урок создан!');
    } catch (err: any) { alert('Ошибка: ' + err.message); }
  };

  const handleCancel = async (lessonId: string) => {
    if (!confirm('Вы уверены, что хотите отменить этот урок?')) return;
    const hasValidReason = confirm('Есть ли уважительная причина отмены (болезнь, ЧП)?\n\nНажмите ОК = Да (бесплатно)\nНажмите Отмена = Нет (списание 1 урока)');
    try {
      const result = await cancelLesson(lessonId, hasValidReason, 'tutor');
      if (result === 'canceled_free_with_compensation') alert('Урок отменен. Ученику начислен 1 бесплатный урок.');
      else alert('Урок отменен бесплатно.');
      await loadLessons();
    } catch (err: any) { alert('Ошибка: ' + err.message); }
  };

  const handleComplete = async (lessonId: string) => {
    const topic = prompt('Тема урока:');
    if (!topic) return;
    try {
      await completeLesson(lessonId, topic);
      await loadLessons();
      alert('Урок завершен!');
    } catch (err: any) { alert('Ошибка: ' + err.message); }
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
        <button onClick={() => setShowAddForm(!showAddForm)} className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-semibold">+ Назначить урок</button>
        <button onClick={() => setShowHistory(!showHistory)} className={`px-4 py-3 rounded-lg font-medium border transition whitespace-nowrap ${showHistory ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
          {showHistory ? 'Скрыть историю' : '📜 История'}
        </button>
      </div>

      {showAddForm && (
        <div className="bg-white p-4 rounded-lg mb-4 shadow">
          <select value={selectedStudent} onChange={(e) => setSelectedStudent(e.target.value)} className="w-full p-2 border rounded mb-2">
            <option value="">Выберите ученика</option>
            {students.map(s => (<option key={s.id} value={s.id}>{s.full_name}</option>))}
          </select>
          <input type="date" value={lessonDate} onChange={(e) => setLessonDate(e.target.value)} className="w-full p-2 border rounded mb-2" />
          <input type="time" value={lessonTime} onChange={(e) => setLessonTime(e.target.value)} className="w-full p-2 border rounded mb-2" />
          <input type="text" placeholder="Тема урока (необязательно)" value={lessonTopic} onChange={(e) => setLessonTopic(e.target.value)} className="w-full p-2 border rounded mb-2" />
          {/* === НОВОЕ ПОЛЕ ДЛЯ ССЫЛКИ === */}
          <input type="url" placeholder="Ссылка на Google Meet (необязательно)" value={lessonMeetLink} onChange={(e) => setLessonMeetLink(e.target.value)} className="w-full p-2 border rounded mb-2" />
          <button onClick={handleCreateLesson} className="w-full bg-green-600 text-white py-2 rounded">Создать урок</button>
        </div>
      )}

      {filteredLessons.length === 0 ? (
        <p className="text-center text-gray-500 py-8">{showHistory ? 'История уроков пуста' : 'Запланированных уроков пока нет 🎉'}</p>
      ) : (
        filteredLessons.map(lesson => (
          <div key={lesson.id} className="bg-white p-4 rounded-lg mb-3 shadow">
            <div className="flex justify-between items-start mb-2">
              <div>
                <h3 className="font-bold">{lesson.student?.full_name || 'Ученик'}</h3>
                <p className="text-sm text-gray-500">{new Date(lesson.start_time).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                {lesson.topic && <p className="text-sm mt-1">📚 {lesson.topic}</p>}
              </div>
              <span className="text-sm font-semibold">{getStatusText(lesson.status)}</span>
            </div>
            {lesson.status === 'scheduled' && (
              <div className="flex gap-2 mt-3">
                <button onClick={() => handleComplete(lesson.id)} className="flex-1 bg-green-500 text-white py-2 rounded text-sm">✅ Проведен</button>
                <button onClick={() => handleCancel(lesson.id)} className="flex-1 bg-red-500 text-white py-2 rounded text-sm">❌ Отменить</button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

function StudentDashboard({ telegramId, user }: { telegramId: string, user: any }) {
  const [nextLesson, setNextLesson] = useState<any>(null);
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNextLesson = async () => {
      try {
        const lesson = await getMyNextLesson(telegramId);
        setNextLesson(lesson);
      } catch (err) { console.error('Ошибка загрузки урока:', err); } finally { setLoading(false); }
    };
    fetchNextLesson();
  }, [telegramId]);

  useEffect(() => {
    if (!nextLesson) return;
    const updateTimer = () => {
      const now = new Date().getTime();
      const difference = new Date(nextLesson.start_time).getTime() - now;
      if (difference <= 0) { setTimeLeft('Урок начался или уже прошёл!'); return; }
      const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((difference % (1000 * 60)) / 1000);
      setTimeLeft(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    };
    updateTimer();
    const timerId = setInterval(updateTimer, 1000);
    return () => clearInterval(timerId);
  }, [nextLesson]);

  const handleCancelLesson = async () => {
    if (!nextLesson) return;
    if (!confirm('Вы уверены, что хотите отменить этот урок?')) return;
    const hasValidReason = confirm('Есть ли уважительная причина отмены (болезнь, ЧП)?\n\nНажмите ОК = Да (бесплатно)\nНажмите Отмена = Нет (списание 1 урока)');
    try {
      const result = await cancelLesson(nextLesson.id, hasValidReason, 'student');
      if (result === 'canceled_paid') alert('Урок отменен. С вашего баланса списан 1 урок.');
      else alert('Урок отменен бесплатно.');
      setNextLesson(null); setTimeLeft('');
    } catch (err: any) { alert('Ошибка: ' + err.message); }
  };

  if (loading) return <div className="p-6 text-center">Загрузка кабинета...</div>;

  let balanceColorClass = 'border-blue-500';
  let balanceTextClass = 'text-blue-600';
  if (user.balance <= 2) { balanceColorClass = 'border-red-500 bg-red-50'; balanceTextClass = 'text-red-600'; } 
  else if (user.balance <= 4) { balanceColorClass = 'border-yellow-500'; }

  return (
    <div className="p-4 space-y-4">
      <div className={`bg-white p-4 rounded-xl shadow flex justify-between items-center border-l-4 ${balanceColorClass}`}>
        <div>
          <p className="text-sm text-gray-500">Ваш баланс</p>
          <p className={`text-3xl font-bold ${balanceTextClass}`}>{user.balance || 0}</p>
          <p className="text-xs text-gray-400 mt-1">уроков осталось</p>
        </div>
        <div className="text-4xl opacity-80">{user.balance <= 1 ? '💸' : '📚'}</div>
      </div>

      <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-6 rounded-2xl shadow-lg">
        <h2 className="text-lg font-semibold opacity-90 mb-1">⏰ Ближайший урок</h2>
        {nextLesson ? (
          <>
            <h3 className="text-2xl font-bold mb-2">{nextLesson.topic || 'Тема не указана'}</h3>
            <p className="text-blue-100 mb-4">{new Date(nextLesson.start_time).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</p>
            <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4 text-center mb-4">
              <p className="text-sm opacity-80 mb-1">До начала осталось:</p>
              <p className="text-4xl font-mono font-bold tracking-wider">{timeLeft}</p>
            </div>
            <div className="flex flex-col gap-3">
              {/* === УМНАЯ КНОПКА MEET === */}
              {nextLesson.meet_link ? (
                <a href={nextLesson.meet_link} target="_blank" rel="noopener noreferrer" className="w-full bg-white text-blue-600 py-3 rounded-xl font-bold text-center shadow hover:bg-blue-50 transition">
                  🎥 Присоединиться к Google Meet
                </a>
              ) : (
                <div className="w-full bg-gray-200 text-gray-500 py-3 rounded-xl font-bold text-center cursor-not-allowed">
                  ⏳ Ссылка на урок появится перед началом
                </div>
              )}
              <button onClick={handleCancelLesson} className="w-full bg-red-500/80 text-white py-3 rounded-xl font-semibold hover:bg-red-600 transition">❌ Отменить урок</button>
            </div>
          </>
        ) : (
          <div className="text-center py-4">
            <p className="text-xl font-semibold mb-2">Уроков пока нет 🎉</p>
            <p className="text-blue-100 text-sm">Преподаватель скоро назначит расписание</p>
          </div>
        )}
      </div>

      <div className="bg-white p-6 rounded-xl shadow">
        <h3 className="font-bold text-lg mb-3 flex items-center gap-2">📚 Конспект и Домашнее задание</h3>
        {user.google_doc_url ? (
          <a href={user.google_doc_url} target="_blank" rel="noopener noreferrer" className="block w-full bg-green-50 text-green-700 border border-green-200 py-3 rounded-lg font-semibold text-center hover:bg-green-100 transition">Открыть Google Документ ↗</a>
        ) : (
          <p className="text-gray-500 text-sm">Преподаватель пока не добавил ссылку на материалы.</p>
        )}
      </div>

      <div className="bg-white p-6 rounded-xl shadow">
        <h3 className="font-bold text-lg mb-3 flex items-center gap-2">⚖️ Правила обучения</h3>
        <ul className="text-sm text-gray-600 space-y-2 list-disc list-inside">
          <li>Отмена урока возможна бесплатно за <b>3+ часа</b> до начала.</li>
          <li>При отмене менее чем за 3 часа без уважительной причины списывается <b>1 урок</b>.</li>
          <li>При болезни или ЧП (уважительная причина) урок отменяется бесплатно в любое время.</li>
          <li>Оплата производится до начала цикла занятий.</li>
        </ul>
      </div>
    </div>
  );
}

export default App;