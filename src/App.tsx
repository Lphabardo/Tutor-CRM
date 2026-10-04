import { useEffect, useState } from 'react';
import { authenticateUser } from './lib/api';

// Проверяем, запущено ли приложение внутри Telegram
const WebApp = typeof window !== 'undefined' ? (window as any).Telegram?.WebApp : null;

function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    // Инициализация WebApp только если мы в Telegram
    if (WebApp) {
      WebApp.ready();
      WebApp.expand();
    }
    
    authenticateUser()
      .then(setUser)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="p-6 text-center text-gray-500">Загрузка...</div>
  );
  
  if (error) return (
    <div className="p-6 text-center text-red-500">
      <p className="text-lg font-bold mb-2">Ошибка</p>
      <p>{error}</p>
    </div>
  );

  return (
    <div className="p-4 min-h-screen bg-gray-50">
      <h1 className="text-2xl font-bold mb-4">Привет, {user.full_name}! 👋</h1>
      
      <div className="bg-white p-4 rounded-xl mb-4 shadow">
        <p className="text-gray-500 text-sm">Ваша роль:</p>
        <p className="text-xl font-semibold">
          {user.role === 'tutor' ? '👨‍🏫 Преподаватель' : '👨‍🎓 Ученик'}
        </p>
        <p className="text-gray-500 text-sm mt-3">Telegram ID: {user.telegram_id}</p>
        <p className="text-gray-500 text-sm">Баланс уроков: {user.balance}</p>
      </div>

      <div className="bg-white p-4 rounded-xl shadow">
        <p className="text-green-600 font-semibold">✅ Приложение подключено к Supabase!</p>
        {!WebApp && (
          <p className="text-yellow-600 text-sm mt-2">
            ️ Открыто в браузере (не в Telegram). В Telegram будет работать полная авторизация.
          </p>
        )}
      </div>
    </div>
  );
}

export default App;