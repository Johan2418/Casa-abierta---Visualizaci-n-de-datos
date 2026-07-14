import assert from 'node:assert/strict';
import { QUIZ_DURATION_MS, scoreAnswer, selectSessionQuestions } from '../src/quiz/questionBank.js';

const bank = Array.from({ length: 24 }, (_, index) => ({
  id: `q-${index}`,
  category: `category-${index % 6}`,
  prompt: `Pregunta ${index}`,
  options: ['A', 'B', 'C', 'D'].map((id) => ({ id, label: `${id}-${index}` })),
  correctOptionId: 'A'
}));
const session = selectSessionQuestions(bank);
assert.equal(session.length, 8, 'La sesión debe contener 8 preguntas');
assert.equal(new Set(session.map((item) => item.id)).size, 8, 'No se deben repetir preguntas');
for (const item of session) assert.equal(item.options.length, 4, 'Cada pregunta conserva cuatro opciones');
for (const count of Object.values(Object.groupBy(session, (item) => item.category)).map((items) => items.length)) assert.ok(count <= 2, 'No puede haber más de dos preguntas por categoría');
assert.equal(scoreAnswer(QUIZ_DURATION_MS), 1000, 'Responder al inicio vale 1000');
assert.equal(scoreAnswer(0), 500, 'Responder al límite vale 500');
assert.equal(scoreAnswer(-1), 500, 'No se puntúa por debajo del mínimo');
console.log('Quiz core: OK');
