import assert from 'node:assert/strict';
import { createLocalQuizClient } from '../src/quiz/quizService.js';

const bank = Array.from({ length: 24 }, (_, index) => ({
  id: `q-${index}`,
  category: `category-${index % 6}`,
  prompt: `Pregunta ${index}`,
  options: ['A', 'B', 'C', 'D'].map((id) => ({ id, label: `${id}-${index}` })),
  correctOptionId: 'A',
  explanation: 'Explicación'
}));

const client = createLocalQuizClient(bank);
const session = await client.createSession();
assert.equal((await client.getActiveHostSession()).code, session.code, 'La sesión activa se recupera para el anfitrión');
await client.joinSession(session.code, 'Ana', 'ana');
const started = await client.startSession(session.code);
await assert.rejects(() => client.submitAnswer(session.code, 'ana', 'Z'), /Opción inválida/, 'Se rechazan opciones fuera de la pregunta');
await client.submitAnswer(session.code, 'ana', 'A');
const once = await client.getHostState(session.code);
await client.submitAnswer(session.code, 'ana', 'A');
const twice = await client.getHostState(session.code);
assert.equal(twice.answeredCount, once.answeredCount, 'Una respuesta repetida no altera el marcador');
const cancelled = await client.cancelSession(session.code);
assert.equal(cancelled.status, 'cancelled', 'El anfitrión puede cancelar una sesión activa');
assert.equal(await client.getActiveHostSession(), null, 'Una sesión cancelada deja de bloquear una nueva sala');
console.log('Quiz service: OK');
