import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import {
  authenticateUser, getStudents, addStudent, adjustBalance, getAllLessons, createLesson,
  cancelLesson, completeLesson, getMyNextLesson, updateStudentSettings, deleteStudent,
  calculateEarnings, updateTeacherRules, getFeedbacks, sendFeedback, generateRecurringLessons,
  getTeacherRules, getStudentTransactions, getPaymentSettings, updatePaymentSetting, sendPaymentReport,
  getPaymentReports, confirmPaymentReport, getMyProfile
} from './lib/api';
import OnboardingForm from './components/OnboardingForm';

const WebApp = typeof window !== 'undefined' ? (window as any).Telegram?.WebApp : null;

const DEFAULT_RULES = `Правила переноса и отмены занятий:\n1. Неявка без уведомления = урок проведен.\n2. Отмена < 3 часов = урок проведен.\n3. Отмена преподавателем = след. урок бесплатно.\n4. Уважительная причина = индивидуально.\n5. Отмена 1 раз в месяц.\n\nОплата заранее пакетами.`;

// Сегодняшняя дата по ЛОКАЛЬНОМУ времени в формате YYYY-MM-DD
// (toISOString() даёт UTC и около полуночи показывает вчерашнюю дату)
function todayStr() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function App() {
  useEffect(() => {
    if (WebApp) {
      WebApp.ready();
      WebApp.expand();
    }
  }, []);

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'students' | 'lessons' | 'finance' | 'settings'>('students');

  useEffect(() => {
    authenticateUser()
      .then(setUser)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleOnboardingComplete = () => {
    if (user) setUser({ ...user, is_new: false });
  };

  if (loading) return <div className="p-6 text-center text-gray-500">Загрузка...</div>;
  if (error) return <div className="p-6 text-center text-red-500"><p className="text-lg font-bold mb-2">Ошибка</p><p>{error}</p></div>;
  if (!user) return <div className="p-6 text-center text-red-500">Не удалось загрузить профиль</div>;

  if (user.is_new) return <OnboardingForm userId={user.id} onComplete={handleOnboardingComplete} />;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white p-4 shadow-sm sticky top-0 z-10">
        <h1 className="text-xl font-bold">Привет, {user.full_name}! 👋</h1>
        <p className="text-sm text-gray-500 mt-1">
          {user.role === 'tutor' ? '👨‍🏫 Преподаватель' : '🎓 Ученик'} | ID: {user.telegram_id}
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
      <div className="flex border-b bg-white overflow-x-auto sticky top-[73px] z-10">
        <button onClick={() => setActiveTab('students')} className={`flex-1 py-3 font-semibold text-sm whitespace-nowrap ${activeTab === 'students' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}>Ученики</button>
        <button onClick={() => setActiveTab('lessons')} className={`flex-1 py-3 font-semibold text-sm whitespace-nowrap ${activeTab === 'lessons' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}>Расписание</button>
        <button onClick={() => setActiveTab('finance')} className={`flex-1 py-3 font-semibold text-sm whitespace-nowrap ${activeTab === 'finance' ? 'text-green-600 border-b-2 border-green-600' : 'text-gray-500'}`}>Финансы 💰</button>
        <button onClick={() => setActiveTab('settings')} className={`flex-1 py-3 font-semibold text-sm whitespace-nowrap ${activeTab === 'settings' ? 'text-gray-800 border-b-2 border-gray-800' : 'text-gray-500'}`}>Настройки ⚙️</button>
      </div>

      {activeTab === 'students' ? <StudentsTab /> :
       activeTab === 'lessons' ? <LessonsTab /> :
       activeTab === 'finance' ? <FinanceTab /> :
       <SettingsTab />}
    </div>
  );
}

// ================= ФИНАНСЫ: Калькулятор + Заявки =================
function FinanceTab() {
  const [subTab, setSubTab] = useState<'calculator' | 'requests'>('calculator');

  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(todayStr());
  const [calcResult, setCalcResult] = useState<{ totalSum: number, count: number } | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);

  const [requests, setRequests] = useState<any[]>([]);
  const [reqLoading, setReqLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const handleCalculate = async () => {
    setCalcLoading(true);
    try {
      // Период включает весь последний день: с 00:00 первого дня до 23:59:59 последнего
      const from = new Date(`${startDate}T00:00:00`).toISOString();
      const to = new Date(`${endDate}T23:59:59.999`).toISOString();
      const data = await calculateEarnings(from, to);
      setCalcResult({ totalSum: data.totalSum, count: data.count });
    } catch (err: any) {
      alert('Ошибка расчета: ' + (err?.message || ''));
    } finally {
      setCalcLoading(false);
    }
  };

  const loadRequests = async () => {
    setReqLoading(true);
    try {
      setRequests(await getPaymentReports());
    } catch (err: any) {
      alert('Не удалось загрузить заявки: ' + err.message);
    } finally {
      setReqLoading(false);
    }
  };

  useEffect(() => {
    if (subTab === 'requests') loadRequests();
  }, [subTab]);

  const handleConfirmRequest = async (request: any) => {
    if (request.status !== 'pending') return;
    if (!confirm(`Подтвердить оплату от ${request.student_name} на сумму ${request.amount} грн (${request.lessons_count} уроков)?`)) return;
    setProcessingId(request.id);
    try {
      await confirmPaymentReport(request);
      alert('✅ Оплата подтверждена! Уроки начислены.');
      await loadRequests();
    } catch (err: any) {
      alert('Ошибка: ' + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleRejectRequest = async (request: any) => {
    // 1. Проверяем, что заявка еще не обработана
    if (request.status !== 'pending') return;
    
    // 2. Спрашиваем причину (можно оставить пустым)
    const reason = prompt("Причина отклонения (необязательно):") || 'Без причины';
    
    // 3. Спрашиваем подтверждение
    if (!confirm(`Отклонить заявку от ${request.student_name}?`)) return;
    
    // 4. Блокируем кнопку во время обработки
    setProcessingId(request.id);
    
    try {
      // 5. Обновляем статус в базе данных на 'rejected'
      const { error } = await supabase
        .from('payment_reports')
        .update({ status: 'rejected' })
        .eq('id', request.id);
      
      if (error) throw error;
      
      alert(' Заявка отклонена.');
      
      // 6. Перезагружаем список заявок
      await loadRequests();
      
    } catch (err: any) {
      alert('Ошибка: ' + err.message);
    } finally {
      // 7. Разблокируем кнопку
      setProcessingId(null);
    }
  };

  return (
    <div className="p-4 space-y-4 pb-20">
      <div className="flex bg-gray-100 p-1 rounded-lg mb-4">
        <button onClick={() => setSubTab('calculator')} className={`flex-1 py-2 rounded-md text-sm font-semibold transition ${subTab === 'calculator' ? 'bg-white shadow text-green-700' : 'text-gray-500'}`}>Калькулятор</button>
        <button onClick={() => setSubTab('requests')} className={`flex-1 py-2 rounded-md text-sm font-semibold transition ${subTab === 'requests' ? 'bg-white shadow text-green-700' : 'text-gray-500'}`}>Заявки 💰</button>
      </div>

      {subTab === 'calculator' ? (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl shadow">
            <h3 className="font-bold text-lg mb-4">Калькулятор заработка (ГРН) 💰</h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full p-2 border rounded" />
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full p-2 border rounded" />
            </div>
            <button onClick={handleCalculate} disabled={calcLoading} className="w-full bg-green-600 text-white py-3 rounded-lg font-bold disabled:opacity-50">{calcLoading ? '...' : 'Рассчитать'}</button>
          </div>
          {calcResult && (
            <div className="bg-green-50 p-6 rounded-xl shadow border border-green-200 text-center">
              <p className="text-gray-600">Уроков: {calcResult.count}</p>
              <p className="text-4xl font-bold text-green-700 mt-2">{calcResult.totalSum} ₴</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-gray-800">Входящие заявки</h2>
          {reqLoading ? (
            <div className="text-center py-10">Загрузка...</div>
          ) : requests.length === 0 ? (
            <div className="text-center text-gray-500 py-10">Заявок пока нет</div>
          ) : (
            requests.map((req) => (
              <div key={req.id} className={`bg-white p-4 rounded-xl shadow border-l-4 ${req.status === 'confirmed' ? 'border-green-500 opacity-75' : 'border-yellow-500'}`}>
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-bold text-lg">{req.student_name}</h3>
                    <p className="text-sm text-gray-500">Дата: {req.payment_date}</p>
                  </div>
                 
                 <span className={`px-3 py-1 rounded-full text-xs font-bold ${
  req.status === 'confirmed' ? 'bg-green-100 text-green-700' : 
  req.status === 'rejected' ? 'bg-red-100 text-red-700' : 
  'bg-yellow-100 text-yellow-700'
}`}>
  {req.status === 'confirmed' ? 'ОК' : 
   req.status === 'rejected' ? 'Отклонено' : 
   'Новая'}
</span>


                </div>
                <div className="bg-gray-50 p-3 rounded-lg mb-3 flex justify-between items-center">
                  <div>
                    <p className="text-sm text-gray-600">Сумма:</p>
                    <p className="font-bold text-lg">{req.amount} ₴</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">Уроков:</p>
                    <p className="font-bold text-lg text-blue-600">{req.lessons_count}</p>
                  </div>
                </div>
                
                {req.status === 'pending' && (
  <div className="flex gap-2 mt-3">
    {/* Кнопка ПОДТВЕРДИТЬ */}
    <button
      onClick={() => handleConfirmRequest(req)}
      disabled={processingId === req.id}
      className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-semibold transition disabled:opacity-50"
    >
      {processingId === req.id ? '...' : 'Подтвердить ✅'}
    </button>
    
    {/* Кнопка ОТКЛОНИТЬ */}
    <button
      onClick={() => handleRejectRequest(req)}
      disabled={processingId === req.id}
      className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg font-semibold transition disabled:opacity-50"
    >
      {processingId === req.id ? '...' : 'Отклонить ❌'}
    </button>
  </div>
)}



              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ================= НАСТРОЙКИ: Реквизиты + Правила =================
function SettingsTab() {
  const [subTab, setSubTab] = useState<'receipts' | 'rules'>('receipts');

  const [settings, setSettings] = useState<any[]>([]);
  const [loadSettings, setLoadSettings] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  const [rules, setRules] = useState('');
  const [feedbacks, setFeedbacks] = useState<any[]>([]);
  const [loadRules, setLoadRules] = useState(true);

  // Всё грузим один раз при открытии, а не при каждом переключении подвкладки —
  // иначе несохранённые правки в соседней подвкладке пропадали
  useEffect(() => {
    getPaymentSettings()
      .then(data => setSettings(data))
      .catch(err => alert('Не удалось загрузить настройки оплаты: ' + err.message))
      .finally(() => setLoadSettings(false));

    const loadData = async () => {
      try {
        const savedRules = await getTeacherRules();
        setRules(savedRules || DEFAULT_RULES);
      } catch (err) {
        console.error('Ошибка загрузки правил:', err);
        setRules(DEFAULT_RULES);
      }
      try {
        setFeedbacks(await getFeedbacks());
      } catch (err) {
        console.error('Ошибка загрузки отзывов:', err);
      }
      setLoadRules(false);
    };
    loadData();
  }, []);

  const handleToggle = (id: string) => setSettings(prev => prev.map(item => item.id === id ? { ...item, is_active: !item.is_active } : item));
  const handleChange = (id: string, field: string, value: string) => setSettings(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));

  const handleSaveReceipts = async () => {
    setSaving(true);
    setSaveMessage('');
    try {
      for (const item of settings) {
        await updatePaymentSetting(item.id, {
          is_active: item.is_active,
          card_number: item.card_number,
          iban: item.iban,
          swift_code: item.swift_code,
          holder_name: item.holder_name
        });
      }
      setSaveMessage('✅ Все изменения сохранены!');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (err: any) {
      alert('Ошибка сохранения: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRules = async () => {
    try {
      await updateTeacherRules(rules);
      alert('Правила сохранены и обновлены у всех учеников!');
    } catch (err: any) {
      alert('Ошибка: ' + err.message);
    }
  };

  return (
    <div className="p-4 space-y-4 pb-20">
      <div className="flex bg-gray-100 p-1 rounded-lg mb-4">
        <button onClick={() => setSubTab('receipts')} className={`flex-1 py-2 rounded-md text-sm font-semibold transition ${subTab === 'receipts' ? 'bg-white shadow text-purple-700' : 'text-gray-500'}`}>Реквизиты 💳</button>
        <button onClick={() => setSubTab('rules')} className={`flex-1 py-2 rounded-md text-sm font-semibold transition ${subTab === 'rules' ? 'bg-white shadow text-purple-700' : 'text-gray-500'}`}>Правила 📜</button>
      </div>

      {subTab === 'receipts' ? (
        <div className="space-y-6">
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <h3 className="font-bold text-blue-800 mb-1">Управление способами оплаты 💳</h3>
            <p className="text-sm text-blue-600">Здесь вы можете включить/выключить банки и изменить номера карт. Изменения сразу отобразятся у учеников.</p>
          </div>

          {saveMessage && <div className="bg-green-100 text-green-800 p-3 rounded-lg text-center font-medium animate-pulse">{saveMessage}</div>}

          {loadSettings ? <div className="text-center py-10">Загрузка...</div> : settings.length === 0 ? (
            <div className="text-center text-gray-500 py-10">Нет доступных банков для настройки.</div>
          ) : (
            settings.map((item) => (
              <div key={item.id} className={`bg-white p-4 rounded-xl shadow border-l-4 transition-all ${item.is_active ? 'border-green-500' : 'border-gray-300 opacity-75'}`}>
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-bold text-gray-800">{item.bank_name}</span>
                    {item.bank_key === 'revolut' && <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">IBAN</span>}
                  </div>
                  <label className="flex items-center cursor-pointer select-none">
                    <input type="checkbox" checked={!!item.is_active} onChange={() => handleToggle(item.id)} className="sr-only peer" />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600 relative"></div>
                    <span className="ml-3 text-sm font-medium text-gray-900">{item.is_active ? 'Включен' : 'Выключен'}</span>
                  </label>
                </div>
                {item.is_active && (
                  <div className="space-y-3 pt-2 border-t border-gray-100">
                    {item.bank_key !== 'paypal' && item.bank_key !== 'revolut' ? (
                      <div>
                        <label className="text-xs text-gray-500 block mb-1 font-semibold">Номер карты</label>
                        <input type="text" value={item.card_number || ''} onChange={(e) => handleChange(item.id, 'card_number', e.target.value)} className="w-full p-2 border rounded bg-gray-50 font-mono text-sm focus:ring-2 focus:ring-blue-200 outline-none" placeholder="0000 0000 0000 0000" />
                      </div>
                    ) : item.bank_key === 'revolut' ? (
                      <>
                        <div>
                          <label className="text-xs text-gray-500 block mb-1 font-semibold">IBAN</label>
                          <input type="text" value={item.iban || ''} onChange={(e) => handleChange(item.id, 'iban', e.target.value)} className="w-full p-2 border rounded bg-gray-50 font-mono text-sm focus:ring-2 focus:ring-blue-200 outline-none" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block mb-1 font-semibold">SWIFT Code</label>
                          <input type="text" value={item.swift_code || ''} onChange={(e) => handleChange(item.id, 'swift_code', e.target.value)} className="w-full p-2 border rounded bg-gray-50 font-mono text-sm focus:ring-2 focus:ring-blue-200 outline-none" />
                        </div>
                      </>
                    ) : (
                      <div>
                        <label className="text-xs text-gray-500 block mb-1 font-semibold">Email / ID</label>
                        <input type="text" value={item.card_number || ''} onChange={(e) => handleChange(item.id, 'card_number', e.target.value)} className="w-full p-2 border rounded bg-gray-50 text-sm focus:ring-2 focus:ring-blue-200 outline-none" />
                      </div>
                    )}
                    <div>
                      <label className="text-xs text-gray-500 block mb-1 font-semibold">Имя получателя</label>
                      <input type="text" value={item.holder_name || ''} onChange={(e) => handleChange(item.id, 'holder_name', e.target.value)} className="w-full p-2 border rounded bg-gray-50 text-sm focus:ring-2 focus:ring-blue-200 outline-none" />
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
          <button onClick={handleSaveReceipts} disabled={saving} className="w-full bg-purple-600 hover:bg-purple-700 text-white py-4 rounded-xl font-bold shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed">{saving ? 'Сохранение...' : 'Сохранить изменения 💾'}</button>
        </div>
      ) : (
        <div className="space-y-6">
          {loadRules ? <div className="text-center py-10">Загрузка...</div> : (
            <>
              <div className="bg-white p-4 rounded-xl shadow">
                <h3 className="font-bold text-lg mb-2">Редактор Правил 📜</h3>
                <p className="text-xs text-gray-500 mb-2">Текст ниже увидят все ученики в разделе "Правила".</p>
                <textarea value={rules} onChange={(e) => setRules(e.target.value)} className="w-full h-48 p-3 border rounded-lg text-sm font-mono" />
                <button onClick={handleSaveRules} className="w-full mt-2 bg-purple-600 text-white py-2 rounded-lg font-semibold">Сохранить правила</button>
              </div>
              <div className="bg-white p-4 rounded-xl shadow">
                <h3 className="font-bold text-lg mb-4">Отзывы от учеников 💬</h3>
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
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ================= УЧЕНИКИ =================
function StudentsTab() {
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTelegramId, setNewTelegramId] = useState('');
  const [newName, setNewName] = useState('');
  const [viewingHistoryFor, setViewingHistoryFor] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [txLoading, setTxLoading] = useState(false);

  const loadStudents = async () => { try { const data = await getStudents(); setStudents(data || []); } catch (err) { console.error(err); } finally { setLoading(false); } };
  useEffect(() => { loadStudents(); }, []);
  const loadTransactions = async (studentId: string) => { setTxLoading(true); try { const data = await getStudentTransactions(studentId); setTransactions(data || []); } catch (err) { console.error(err); } finally { setTxLoading(false); } };
  const handleAddStudent = async () => { if (!newTelegramId || !newName) return; try { await addStudent(parseInt(newTelegramId), newName); setNewTelegramId(''); setNewName(''); setShowAddForm(false); await loadStudents(); alert('Ученик добавлен!'); } catch (err: any) { alert('Ошибка: ' + err.message); } };
  const handleCustomBalanceChange = async (studentId: string, action: 'add' | 'subtract') => { const amountStr = prompt(action === 'add' ? "Сколько уроков добавить?" : "Сколько уроков списать?"); if (amountStr === null) return; const amount = parseInt(amountStr); if (isNaN(amount) || amount <= 0) { alert("Пожалуйста, введите корректное число больше 0"); return; } const finalAmount = action === 'add' ? amount : -amount; const reason = action === 'add' ? 'Пополнение баланса' : 'Списание урока'; try { await adjustBalance(studentId, finalAmount, reason); await loadStudents(); if (viewingHistoryFor === studentId) { loadTransactions(studentId); } alert(`Успешно: ${action === 'add' ? 'Добавлено' : 'Списано'} ${amount} уроков`); } catch (err: any) { alert('Ошибка: ' + err.message); } };
  const handleDeleteStudent = async (studentId: string, studentName: string) => { if (!confirm(`Вы уверены, что хотите удалить ученика "${studentName}"?`)) return; try { await deleteStudent(studentId); await loadStudents(); alert('Ученик удален'); } catch (err: any) { alert('Ошибка: ' + err.message); } };
  const handleUpdateSettings = async (studentId: string, currentPrice: number, currentMeet: string, currentDoc: string) => { const newPrice = prompt(`Введите цену за урок в ГРН (сейчас ${currentPrice ?? 0}):`, String(currentPrice ?? 0)); if (newPrice === null) return; const newMeet = prompt(`Введите ссылку на Meet:`, currentMeet || ''); if (newMeet === null) return; const newDoc = prompt(`Введите ссылку на Документ:`, currentDoc || ''); if (newDoc === null) return; try { await updateStudentSettings(studentId, { price_per_lesson: parseInt(newPrice) || 0, meet_link: newMeet, google_doc_url: newDoc }); await loadStudents(); alert('Настройки сохранены!'); } catch (err: any) { alert('Ошибка: ' + err.message); } };
  const handleUpdateSchedule = async (studentId: string, currentSchedule: string) => { const newSchedule = prompt("Формат: Пн 15:00, Ср 10:00", currentSchedule); if (newSchedule === null) return; try { await updateStudentSettings(studentId, { fixed_schedule: newSchedule }); await loadStudents(); alert('Расписание сохранено!'); } catch (err: any) { alert('Ошибка: ' + err.message); } };
  const handleGenerateLessons = async (studentId: string) => { const weeksStr = prompt("На сколько недель вперёд создать уроки?", "4"); if (!weeksStr) return; const weeks = parseInt(weeksStr); if (isNaN(weeks) || weeks < 1) return alert("Введите число >= 1"); try { const result = await generateRecurringLessons(studentId, weeks); alert(result.message); await loadStudents(); } catch (err: any) { alert('Ошибка генерации: ' + err.message); } };

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
          <div key={student.id}>
            <div className={`bg-white p-4 rounded-lg mb-3 shadow ${student.is_new ? 'border-l-4 border-yellow-400' : ''}`}>
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
                <button onClick={() => handleCustomBalanceChange(student.id, 'add')} className="flex-1 bg-green-500 text-white py-2 rounded text-sm font-medium">Пополнить 💳</button>
                <button onClick={() => handleCustomBalanceChange(student.id, 'subtract')} className="flex-1 bg-red-500 text-white py-2 rounded text-sm font-medium">Списать ➖</button>
                <button onClick={() => handleDeleteStudent(student.id, student.full_name)} className="flex-1 bg-gray-100 text-red-500 py-2 rounded text-sm border border-red-200">Удалить 🗑️</button>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-3 gap-2">
                <button onClick={() => handleUpdateSettings(student.id, student.price_per_lesson, student.meet_link, student.google_doc_url)} className="bg-purple-50 text-purple-700 py-2 rounded text-xs border border-purple-200">Настройки ⚙️</button>
                <button onClick={() => handleUpdateSchedule(student.id, student.fixed_schedule || '')} className="bg-orange-50 text-orange-700 py-2 rounded text-xs border border-orange-200">Расписание 📅</button>
                <button onClick={() => { if (viewingHistoryFor === student.id) { setViewingHistoryFor(null); } else { setViewingHistoryFor(student.id); loadTransactions(student.id); } }} className={`py-2 rounded text-xs border ${viewingHistoryFor === student.id ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-gray-50 text-gray-700 border-gray-200'}`}>История 📜</button>
              </div>
              {student.fixed_schedule && (
                <button onClick={() => handleGenerateLessons(student.id)} className="w-full mt-2 bg-teal-50 text-teal-700 py-2 rounded text-xs border border-teal-200 font-medium hover:bg-teal-100 transition">Сгенерировать уроки → 📅</button>
              )}
            </div>
            {viewingHistoryFor === student.id && (
              <div className="bg-gray-50 p-4 rounded-lg mb-3 border border-gray-200">
                <h4 className="font-bold text-sm mb-2 text-gray-700">История операций: {student.full_name}</h4>
                {txLoading ? (<p className="text-sm text-gray-500">Загрузка...</p>) : transactions.length === 0 ? (<p className="text-sm text-gray-500">Операций пока нет</p>) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {transactions.map((tx: any) => (
                      <div key={tx.id} className="flex justify-between items-center text-sm bg-white p-3 rounded shadow-sm">
                        <div>
                          <p className="font-medium text-gray-800">{tx.reason}</p>
                          <p className="text-xs text-gray-500">{new Date(tx.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                        <span className={`font-bold ${tx.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>{tx.amount > 0 ? '+' : ''}{tx.amount}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ================= РАСПИСАНИЕ =================
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

  const loadLessons = async () => { try { const [lessonsData, studentsData] = await Promise.all([getAllLessons(), getStudents()]); setLessons(lessonsData || []); setStudents(studentsData || []); } catch (err) { console.error(err); } finally { setLoading(false); } };
  useEffect(() => { loadLessons(); }, []);
  const handleCreateLesson = async () => { if (!selectedStudent || !lessonDate || !lessonTime) return; try { await createLesson(selectedStudent, new Date(`${lessonDate}T${lessonTime}:00`).toISOString(), lessonTopic); setLessonDate(''); setLessonTime(''); setLessonTopic(''); setSelectedStudent(''); setShowAddForm(false); await loadLessons(); alert('Урок создан!'); } catch (err: any) { alert('Ошибка: ' + err.message); } };
  const handleCancel = async (lessonId: string) => { if (!confirm('Отменить урок?')) return; const hasValidReason = confirm('Уважительная причина? (ОК=Да, Отмена=Нет)'); try { const result = await cancelLesson(lessonId, hasValidReason, 'tutor'); if (result === 'canceled_free_with_compensation') alert('Отменено (компенсация +1).'); else alert('Отменено бесплатно.'); await loadLessons(); } catch (err: any) { alert('Ошибка: ' + err.message); } };
  const handleComplete = async (lessonId: string) => { const topic = prompt('Тема урока:'); if (!topic) return; try { await completeLesson(lessonId, topic); await loadLessons(); alert('Урок завершен!'); } catch (err: any) { alert('Ошибка: ' + err.message); } };
  const getStatusText = (status: string) => { const map: any = { 'scheduled': '🕒 Запланирован', 'completed': '✅ Проведен', 'canceled_free': '❌ Отменен (бесплатно)', 'canceled_paid': '❌ Отменен (списан)' }; return map[status] || status; };

  if (loading) return <div className="p-6 text-center">Загрузка...</div>;
  const filteredLessons = showHistory ? lessons : lessons.filter(l => l.status === 'scheduled');
  return (
    <div className="p-4">
      <div className="flex gap-2 mb-4">
        <button onClick={() => setShowAddForm(!showAddForm)} className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-semibold">+ Урок</button>
        <button onClick={() => setShowHistory(!showHistory)} className="px-4 py-3 rounded-lg border bg-white">{showHistory ? 'Скрыть' : 'История 📜'}</button>
      </div>
      {showAddForm && (
        <div className="bg-white p-4 rounded-lg mb-4 shadow">
          <select value={selectedStudent} onChange={(e) => setSelectedStudent(e.target.value)} className="w-full p-2 border rounded mb-2">
            <option value="">Ученик</option>
            {students.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
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
                <button onClick={() => handleCancel(lesson.id)} className="flex-1 bg-red-500 text-white py-2 rounded text-sm">❌</button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ================= КАБИНЕТ УЧЕНИКА =================
function StudentDashboard({ telegramId, user }: { telegramId: string, user: any }) {
  const [nextLesson, setNextLesson] = useState<any>(null);
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState<number>(user.balance ?? 0);
  const [rulesText, setRulesText] = useState(user.rules_text || '');
  const [googleDocUrl, setGoogleDocUrl] = useState<string>(user.google_doc_url || '');
  const [transactions, setTransactions] = useState<any[]>([]);
  const [txLoading, setTxLoading] = useState(true);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedBank, setSelectedBank] = useState<any>(null);
  const [paymentSettings, setPaymentSettings] = useState<any[]>([]);
  const [paymentLoading, setPaymentLoading] = useState(false);

  const [reportAmount, setReportAmount] = useState('');
  const [reportLessons, setReportLessons] = useState('');
  const [reportDate, setReportDate] = useState(todayStr());
  const [reportSending, setReportSending] = useState(false);

  useEffect(() => { const fetchNextLesson = async () => { try { const lesson = await getMyNextLesson(telegramId); setNextLesson(lesson); } catch (err) { console.error(err); } finally { setLoading(false); } }; fetchNextLesson(); }, [telegramId]);
  useEffect(() => { const fetchTransactions = async () => { try { const data = await getStudentTransactions(user.id); setTransactions(data || []); } catch (err) { console.error(err); } finally { setTxLoading(false); } }; fetchTransactions(); }, [user.id]);

  // Свежий баланс, правила и ссылка на документ (раньше брались только из данных при входе)
  useEffect(() => {
    getMyProfile(user.id)
      .then(p => {
        setBalance(p.balance ?? 0);
        if (p.rules_text) setRulesText(p.rules_text);
        setGoogleDocUrl(p.google_doc_url || '');
      })
      .catch(console.error);
  }, [user.id]);

  // Загружаем реквизиты при открытии окна (раньше при пустом списке запрос повторялся бесконечно)
  useEffect(() => {
    if (!showPaymentModal) return;
    setPaymentLoading(true);
    getPaymentSettings()
      .then(data => setPaymentSettings(data))
      .catch(err => alert('Не удалось загрузить реквизиты: ' + err.message))
      .finally(() => setPaymentLoading(false));
  }, [showPaymentModal]);

  useEffect(() => {
    if (!nextLesson) return;
    const updateTimer = () => {
      const diff = new Date(nextLesson.start_time).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft('Урок начался!'); return; }
      // Часы считаем полностью (раньше остаток от 24ч — при уроке через 2 дня показывало бы неверное время)
      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);
      setTimeLeft(`${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
    };
    updateTimer();
    const t = setInterval(updateTimer, 1000);
    return () => clearInterval(t);
  }, [nextLesson]);

  const refreshBalance = async () => {
    try {
      const p = await getMyProfile(user.id);
      setBalance(p.balance ?? 0);
      setTransactions((await getStudentTransactions(user.id)) || []);
    } catch (err) { console.error(err); }
  };

  const handleCancelLesson = async () => {
    if (!nextLesson) return;
    if (!confirm('Отменить урок?')) return;
    const hasValidReason = confirm('Уважительная причина? (ОК=Да)');
    try {
      const res = await cancelLesson(nextLesson.id, hasValidReason, 'student');
      if (res === 'canceled_paid') alert('Списан 1 урок.'); else alert('Отменено бесплатно.');
      setNextLesson(null);
      setTimeLeft('');
      refreshBalance();
    } catch (err: any) { alert('Ошибка: ' + err.message); }
  };

  const handleSendFeedback = async () => {
    const msg = prompt("Напишите ваш отзыв или пожелание:");
    if (!msg) return;
    try { await sendFeedback(user.full_name, msg); alert("Отзыв отправлен преподавателю! 💬"); } catch (err) { alert("Ошибка отправки"); }
  };

  const handleSendReport = async () => {
    if (!reportAmount || !reportLessons || !reportDate) { alert('Пожалуйста, заполните все поля!'); return; }
    const amount = parseFloat(reportAmount);
    const lessons = parseInt(reportLessons);
    if (isNaN(amount) || amount <= 0 || isNaN(lessons) || lessons <= 0) { alert('Сумма и количество уроков должны быть больше 0'); return; }
    setReportSending(true);
    try {
      await sendPaymentReport(user.id, user.full_name, amount, lessons, reportDate);
      alert('✅ Отчет отправлен! Преподаватель получит уведомление.');
      setReportAmount('');
      setReportLessons('');
      setReportDate(todayStr());
    } catch (err: any) {
      alert('❌ Ошибка отправки: ' + err.message);
    } finally {
      setReportSending(false);
    }
  };

  const showMsg = (msg: string) => {
    if (WebApp?.showAlert) WebApp.showAlert(msg); else alert(msg);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        WebApp?.HapticFeedback?.notificationOccurred?.('success');
        showMsg(`✅ ${label} скопирован!`);
      })
      .catch(() => showMsg('❌ Не удалось скопировать'));
  };

  if (loading) return <div className="p-6 text-center">Загрузка...</div>;

  let balClass = 'border-blue-500';
  if (balance <= 2) balClass = 'border-red-500 bg-red-50';
  else if (balance <= 4) balClass = 'border-yellow-500';

  const activeBanks = paymentSettings.filter(b => b.is_active);

  return (
    <div className="p-4 space-y-4 pb-20">
      {/* Баланс */}
      <div className={`bg-white p-4 rounded-xl shadow flex justify-between items-center border-l-4 ${balClass}`}>
        <div>
          <p className="text-sm text-gray-500">Баланс</p>
          <p className="text-3xl font-bold">{balance}</p>
        </div>
        <div className="text-4xl">{balance <= 1 ? '💸' : '📚'}</div>
      </div>

      {/* Ближайший урок */}
      <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-6 rounded-2xl shadow-lg">
        <h2 className="text-lg font-semibold mb-1">Ближайший урок ⏰</h2>
        {nextLesson ? (
          <>
            <h3 className="text-2xl font-bold mb-2">{nextLesson.topic || 'Без темы'}</h3>
            <p className="text-blue-100">{new Date(nextLesson.start_time).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</p>
            <div className="bg-white/20 rounded-xl p-4 text-center my-4">
              <p className="text-4xl font-mono font-bold">{timeLeft}</p>
            </div>
            <div className="flex flex-col gap-3">
              {nextLesson.meet_link ? (
                <a href={nextLesson.meet_link} target="_blank" rel="noopener noreferrer" className="w-full bg-white text-blue-600 py-3 rounded-xl font-bold text-center">Войти в Meet 🎥</a>
              ) : (
                <div className="w-full bg-gray-200 text-gray-500 py-3 rounded-xl font-bold text-center">Ссылка появится перед уроком ⏳</div>
              )}
              <button onClick={handleCancelLesson} className="w-full bg-red-500/80 text-white py-3 rounded-xl font-semibold">Отменить ❌</button>
            </div>
          </>
        ) : (
          <div className="text-center py-4">
            <p className="text-xl font-bold">Нет уроков</p>
          </div>
        )}
      </div>

      {/* Материалы */}
      <div className="bg-white p-6 rounded-xl shadow">
        <h3 className="font-bold text-lg mb-3">Материалы 📚</h3>
        {googleDocUrl ? (
          <a href={googleDocUrl} target="_blank" rel="noopener noreferrer" className="block w-full bg-green-50 text-green-700 py-3 rounded-lg text-center font-semibold border border-green-200">Открыть Документ ↗</a>
        ) : <p className="text-gray-500 text-sm">Нет ссылки</p>}
      </div>

      {/* Правила */}
      <div className="bg-white p-6 rounded-xl shadow">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-bold text-lg">Правила ⚖️</h3>
          <button onClick={handleSendFeedback} className="bg-purple-100 text-purple-700 px-3 py-1 rounded text-xs font-bold">Отзыв 💬</button>
        </div>
        <div className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">{rulesText || 'Правила не загружены'}</div>
      </div>

      {/* История */}
      <div className="bg-white p-6 rounded-xl shadow">
        <h3 className="font-bold text-lg mb-3">История баланса 📜</h3>
        {txLoading ? <p className="text-gray-500 text-sm">Загрузка...</p> : transactions.length === 0 ? (
          <p className="text-gray-500 text-sm">Операций пока нет</p>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {transactions.map((tx: any) => (
              <div key={tx.id} className="flex justify-between items-center text-sm bg-gray-50 p-3 rounded">
                <div>
                  <p className="font-medium text-gray-800">{tx.reason}</p>
                  <p className="text-xs text-gray-500">{new Date(tx.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                <span className={`font-bold ${tx.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>{tx.amount > 0 ? '+' : ''}{tx.amount}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Кнопка оплаты */}
      <div className="bg-white p-6 rounded-xl shadow text-center">
        <h3 className="font-bold text-lg mb-2">Нужно пополнить баланс?</h3>
        <p className="text-sm text-gray-500 mb-4">Нажмите кнопку ниже, чтобы увидеть реквизиты</p>
        <button
          onClick={() => setShowPaymentModal(true)}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl font-bold text-lg shadow-md transition transform active:scale-95"
        >
          Оплатить 💳
        </button>
      </div>

      {/* Сообщить о переводе */}
      <div className="bg-white p-6 rounded-xl shadow border-2 border-green-100">
        <h3 className="font-bold text-lg mb-3 text-green-700">Сообщить о переводе 💰</h3>
        <p className="text-sm text-gray-500 mb-4">Заполните данные после перевода, чтобы я мог начислить уроки.</p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Сумма перевода (грн)</label>
            <input type="number" value={reportAmount} onChange={(e) => setReportAmount(e.target.value)} placeholder="Например: 500" className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-green-200 outline-none" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Количество уроков</label>
            <input type="number" value={reportLessons} onChange={(e) => setReportLessons(e.target.value)} placeholder="Например: 5" className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-green-200 outline-none" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Дата перевода</label>
            <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-green-200 outline-none" />
          </div>
          <button
            onClick={handleSendReport}
            disabled={reportSending}
            className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-bold shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            {reportSending ? 'Отправка...' : 'Отправить отчет 📤'}
          </button>
        </div>
      </div>

      {/* Модальное окно оплаты */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl p-6 max-h-[90vh] overflow-y-auto shadow-2xl animate-slide-up">

            {!selectedBank ? (
              <>
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-bold text-gray-800">Выберите банк</h3>
                  <button onClick={() => setShowPaymentModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl font-bold">&times;</button>
                </div>
                {paymentLoading ? (
                  <p className="text-center text-gray-500 py-4">Загрузка...</p>
                ) : activeBanks.length === 0 ? (
                  <p className="text-center text-gray-500">Нет доступных способов оплаты</p>
                ) : (
                  <div className="space-y-3">
                    {activeBanks.map((bank) => (
                      <button
                        key={bank.id}
                        onClick={() => setSelectedBank(bank)}
                        className="w-full flex justify-between items-center p-4 border border-gray-200 rounded-xl hover:bg-blue-50 hover:border-blue-300 transition text-left group"
                      >
                        <span className="font-semibold text-lg text-gray-700 group-hover:text-blue-700">{bank.bank_name}</span>
                        <span className="text-gray-400 group-hover:text-blue-500 text-xl">→</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex justify-between items-center mb-6">
                  <button onClick={() => setSelectedBank(null)} className="text-blue-600 font-medium flex items-center gap-1 hover:text-blue-800 transition">
                    <span className="text-xl">←</span> Назад
                  </button>
                  <h3 className="text-xl font-bold text-gray-800">{selectedBank.bank_name}</h3>
                  <div className="w-16"></div>
                </div>

                <div className="bg-gray-50 p-5 rounded-xl mb-6 space-y-4 border border-gray-100">
                  <div>
                    <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Получатель</p>
                    <p className="font-medium text-gray-800 text-lg select-all">{selectedBank.holder_name}</p>
                  </div>

                  {selectedBank.card_number && selectedBank.bank_key !== 'revolut' && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">{selectedBank.bank_key === 'paypal' ? 'Email / ID' : 'Номер карты'}</p>
                      <div className="flex justify-between items-center bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                        <code className="font-mono text-sm text-gray-800 break-all">{selectedBank.card_number}</code>
                        <button onClick={() => copyToClipboard(selectedBank.card_number, selectedBank.bank_key === 'paypal' ? 'Email / ID' : 'Номер карты')} className="ml-3 text-blue-600 hover:text-blue-800 text-xs font-bold uppercase bg-blue-50 px-3 py-1.5 rounded-lg transition">Копировать</button>
                      </div>
                    </div>
                  )}

                  {selectedBank.iban && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">IBAN</p>
                      <div className="flex justify-between items-center bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                        <code className="font-mono text-sm text-gray-800 break-all">{selectedBank.iban}</code>
                        <button onClick={() => copyToClipboard(selectedBank.iban, 'IBAN')} className="ml-3 text-blue-600 hover:text-blue-800 text-xs font-bold uppercase bg-blue-50 px-3 py-1.5 rounded-lg transition">Копировать</button>
                      </div>
                    </div>
                  )}

                  {selectedBank.swift_code && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">SWIFT Code</p>
                      <div className="flex justify-between items-center bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                        <code className="font-mono text-sm text-gray-800">{selectedBank.swift_code}</code>
                        <button onClick={() => copyToClipboard(selectedBank.swift_code, 'SWIFT')} className="ml-3 text-blue-600 hover:text-blue-800 text-xs font-bold uppercase bg-blue-50 px-3 py-1.5 rounded-lg transition">Копировать</button>
                      </div>
                    </div>
                  )}
                </div>

                <p className="text-xs text-gray-400 text-center mb-6 italic">После перевода заполните форму выше "Сообщить о переводе".</p>
                <button onClick={() => { setShowPaymentModal(false); setSelectedBank(null); }} className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-xl font-bold transition">Закрыть</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
