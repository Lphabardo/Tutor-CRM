import { useState } from 'react';
import { supabase } from '../lib/supabase';

interface OnboardingFormProps {
  userId: string;
  onComplete: () => void;
}

export default function OnboardingForm({ userId, onComplete }: OnboardingFormProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [language, setLanguage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!firstName || !language) {
      alert('Пожалуйста, заполни имя и язык изучения');
      return;
    }

    setLoading(true);

    const fullName = `${firstName} ${lastName}`.trim();

    const { error } = await supabase
      .from('tutor_profiles')
      .update({
        full_name: fullName,
        language: language,
        is_new: false
      })
      .eq('id', userId);

    if (error) {
      alert('Ошибка: ' + error.message);
    } else {
      onComplete();
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white p-6 rounded-lg shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold mb-2">Добро пожаловать! 👋</h1>
        <p className="text-gray-600 mb-6">Заполни анкету, чтобы начать</p>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-semibold mb-2">Имя *</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full p-3 border rounded-lg"
              placeholder="Иван"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-semibold mb-2">Фамилия</label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full p-3 border rounded-lg"
              placeholder="Иванов"
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-semibold mb-2">Язык изучения *</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full p-3 border rounded-lg"
              required
            >
              <option value="">Выбери язык</option>
              <option value="Английский">Английский</option>
              <option value="Немецкий">Немецкий</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold disabled:bg-gray-400"
          >
            {loading ? 'Сохранение...' : 'Начать обучение'}
          </button>
        </form>
      </div>
    </div>
  );
}