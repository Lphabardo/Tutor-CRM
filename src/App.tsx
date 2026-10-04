import { useEffect, useState } from 'react';
import { authenticateUser, getStudents, addStudent, adjustBalance, getAllLessons, createLesson, cancelLesson, completeLesson } from './lib/api';

const WebApp = typeof window !== 'undefined' ? (window as any).Telegram?.WebApp : null;

function App() {
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

  if (loading) return <div className="p-6 text-center text-gray-500">Загрузка...</div>;
  if (error) return <div className="p-6 text-center text-red-500"><p className="text-lg font-bold mb-2">Ошибка</p><p>{error}</p></div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white p-4 shadow-sm">
        <h1 className="text-xl font-bold">Привет, {user.full_name}! 👋</h1>
        <p className="text-sm text-gray-500 mt-1">
          {user.role === 'tutor' ? '👨‍ Преподаватель' : '👨‍🎓 Ученик'} | ID: {user.telegram_id}
        </p>
      </div>

      {user.role === 'tutor' ? (
        <TutorDashboard activeTab={activeTab} setActiveTab={setActiveTab} />
      ) : (
        <StudentDashboard telegramId={user.telegram_id} />
      )}
    </div>
  );
}

// === ПАНЕЛЬ ПРЕПОДАВАТЕЛЯ ===
function TutorDashboard({ activeTab, setActiveTab }: { activeTab: 'students' | 'lessons', setActiveTab: (tab: 'students' | 'lessons') => void }) {
  return (
    <div>
      <div className="flex border-b bg-white">
        <button 
          onClick={() => setActiveTab('students')}
          className={`flex-1 py-3 font-semibold ${activeTab === 'students' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}
        >
          Ученики
        </button>
        <button 
          onClick={() => setActiveTab('lessons')}
          className={`flex-1 py-3 font-semibold ${activeTab === 'lessons' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}
        >
          Расписание
        </button>
      </div>
      
      {activeTab === 'students' ? <StudentsTab /> : <LessonsTab />}
    </div>
  );
}

// Вкладка "Ученики"
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
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStudents(); }, []);

  const handleAddStudent = async () => {
    if (!newTelegramId || !newName) return;
    try {
      await addStudent(parseInt(newTelegramId), newName);
      setNewTelegramId('');
      setNewName('');
      setShowAddForm(false);
      await loadStudents();
      alert('Ученик добавлен!');
    } catch (err: any) {
      alert('Ошибка: ' + err.message);
    }
  };

  const handleBalanceChange = async (studentId: string, amount: number, reason: string) => {
    try {
      await adjustBalance(studentId, amount, reason);
      await loadStudents();
    } catch (err: any) {
      alert('Ошибка: ' + err.message);
    }
  };

  if (loading) return <div className="p-6 text-center">Загрузка...</div>;

  return (
    <div className="p-4">
      <button 
        onClick={() => setShowAddForm(!showAddForm)}
        className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold mb-4"
      >
        + Добавить ученика
      </button>

      {showAddForm && (
        <div className="bg-white p-4 rounded-lg mb-4 shadow">
          <input 
            type="number" 
            placeholder="Telegram ID ученика"
            value={newTelegramId}
            onChange={(e) => setNewTelegramId(e.target.value)}
            className="w-full p-2 border rounded mb-2"
          />
          <input 
            type="text" 
            placeholder="Имя ученика"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full p-2 border rounded mb-2"
          />
          <button 
            onClick={handleAddStudent}
            className="w-full bg-green-600 text-white py-2 rounded"
          >
            Сохранить
          </button>
        </div>
      )}

      {students.length === 0 ? (
        <p className="text-center text-gray-500">Учеников пока нет</p>
      ) : (
        students.map(student => (
          <div key={student.id} className="bg-white p-4 rounded-lg mb-3 shadow">
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
            
            <div className="flex gap-2 mt-3">
              <button 
                onClick={() => handleBalanceChange(student.id, 1, 'Пополнение баланса')}
                className="flex-1 bg-green-500 text-white py-2 rounded text-sm"
              >
                +1 урок
              </button>
              <button 
                onClick={() => handleBalanceChange(student.id, -1, 'Списание урока')}
                className="flex-1 bg-red-500 text-white py-2 rounded text-sm"
              >
                -1 урок
              </button>
              <button 
                onClick={() => handleBalanceChange(student.id, 5, 'Пакет из 5 уроков')}
                className="flex-1 bg-blue-500 text-white py-2 rounded text-sm"
              >
                +5 уроков
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// Вкладка "Расписание"
function LessonsTab() {
  const [lessons, setLessons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [students, setStudents] = useState<any[]>([]);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [lessonDate, setLessonDate] = useState('');
  const [lessonTime, setLessonTime] = useState('');
  const [lessonTopic, setLessonTopic] = useState('');

  const loadLessons = async () => {
    try {
      const [lessonsData, studentsData] = await Promise.all([getAllLessons(), getStudents()]);
      setLessons(lessonsData);
      setStudents(studentsData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadLessons(); }, []);

  const handleCreateLesson = async () => {
    if (!selectedStudent || !lessonDate || !lessonTime) return;
    try {
      const startTime = new Date(`${lessonDate}T${lessonTime}:00`).toISOString();
      await createLesson(selectedStudent, startTime, lessonTopic);
      setLessonDate('');
      setLessonTime('');
      setLessonTopic('');
      setSelectedStudent('');
      setShowAddForm(false);
      await loadLessons();
      alert('Урок создан!');
    } catch (err: any) {
      alert('Ошибка: ' + err.message);
    }
  };

  const handleCancel = async (lessonId: string) => {
    if (!confirm('Отменить урок?')) return;
    try {
      const result = await cancelLesson(lessonId);
      alert(result === 'canceled_paid' ? 'Урок отменен со списанием баланса' : 'Урок отменен бесплатно');
      await loadLessons();
    } catch (err: any) {
      alert('Ошибка: ' + err.message);
    }
  };

  const handleComplete = async (lessonId: string) => {
    const topic = prompt('Тема урока:');
    if (!topic) return;
    try {
      await completeLesson(lessonId, topic);
      await loadLessons();
      alert('Урок завершен!');
    } catch (err: any) {
      alert('Ошибка: ' + err.message);
    }
  };

  const getStatusText = (status: string) => {
    const map: any = {
      'scheduled': ' Запланирован',
      'completed': '✅ Проведен',
      'canceled_free': '❌ Отменен (бесплатно)',
      'canceled_paid': '❌ Отменен (списан)'
    };
    return map[status] || status;
  };

  if (loading) return <div className="p-6 text-center">Загрузка...</div>;

  return (
    <div className="p-4">
      <button 
        onClick={() => setShowAddForm(!showAddForm)}
        className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold mb-4"
      >
        + Назначить урок
      </button>

      {showAddForm && (
        <div className="bg-white p-4 rounded-lg mb-4 shadow">
          <select 
            value={selectedStudent}
            onChange={(e) => setSelectedStudent(e.target.value)}
            className="w-full p-2 border rounded mb-2"
          >
            <option value="">Выберите ученика</option>
            {students.map(s => (
              <option key={s.id} value={s.id}>{s.full_name}</option>
            ))}
          </select>
          <input 
            type="date" 
            value={lessonDate}
            onChange={(e) => setLessonDate(e.target.value)}
            className="w-full p-2 border rounded mb-2"
          />
          <input 
            type="time" 
            value={lessonTime}
            onChange={(e) => setLessonTime(e.target.value)}
            className="w-full p-2 border rounded mb-2"
          />
          <input 
            type="text" 
            placeholder="Тема урока (необязательно)"
            value={lessonTopic}
            onChange={(e) => setLessonTopic(e.target.value)}
            className="w-full p-2 border rounded mb-2"
          />
          <button 
            onClick={handleCreateLesson}
            className="w-full bg-green-600 text-white py-2 rounded"
          >
            Создать урок
          </button>
        </div>
      )}

      {lessons.length === 0 ? (
        <p className="text-center text-gray-500">Уроков пока нет</p>
      ) : (
        lessons.map(lesson => (
          <div key={lesson.id} className="bg-white p-4 rounded-lg mb-3 shadow">
            <div className="flex justify-between items-start mb-2">
              <div>
                <h3 className="font-bold">{lesson.student?.full_name || 'Ученик'}</h3>
                <p className="text-sm text-gray-500">
                  {new Date(lesson.start_time).toLocaleString('ru-RU', { 
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                  })}
                </p>
                {lesson.topic && <p className="text-sm mt-1">📚 {lesson.topic}</p>}
              </div>
              <span className="text-sm font-semibold">{getStatusText(lesson.status)}</span>
            </div>
            
            {lesson.status === 'scheduled' && (
              <div className="flex gap-2 mt-3">
                <button 
                  onClick={() => handleComplete(lesson.id)}
                  className="flex-1 bg-green-500 text-white py-2 rounded text-sm"
                >
                  ✅ Проведен
                </button>
                <button 
                  onClick={() => handleCancel(lesson.id)}
                  className="flex-1 bg-red-500 text-white py-2 rounded text-sm"
                >
                  ❌ Отменить
                </button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// === ПАНЕЛЬ УЧЕНИКА ===
function StudentDashboard({ telegramId }: { telegramId: string }) {
  return (
    <div className="p-4">
      <div className="bg-white p-6 rounded-lg shadow mb-4">
        <h2 className="text-xl font-bold mb-2">👨‍🎓 Кабинет ученика</h2>
        <p className="text-gray-500">Здесь будет:</p>
        <ul className="list-disc list-inside mt-2 text-gray-600">
          <li>Ближайший урок с обратным отсчетом</li>
          <li>Кнопка "Присоединиться к Meet"</li>
          <li>Отмена/перенос урока (правило 3 часов)</li>
          <li>Домашние задания</li>
        </ul>
        <p className="text-sm text-yellow-600 mt-4">⚠️ Эта часть будет добавлена на следующем этапе</p>
      </div>
    </div>
  );
}

export default App;