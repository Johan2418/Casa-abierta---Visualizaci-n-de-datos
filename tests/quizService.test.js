// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createLocalQuizClient } from '../src/quiz/quizService.js';
import { QUIZ_DURATION_MS } from '../src/quiz/questionBank.js';

const bank = Array.from({ length: 24 }, (_, index) => ({
  id: `q-${index}`,
  category: `category-${index % 6}`,
  prompt: `Pregunta ${index}`,
  options: ['A', 'B', 'C', 'D'].map((id) => ({ id, label: `${id}-${index}` })),
  correctOptionId: 'A',
  explanation: 'Explicación'
}));

describe('cliente local del quiz', () => {
  it('recupera una sesión activa y permite cancelarla', async () => {
    const client = createLocalQuizClient(bank);
    const created = await client.createSession();
    expect((await client.getActiveHostSession()).code).toBe(created.code);

    const cancelled = await client.cancelSession(created.code);
    expect(cancelled.status).toBe('cancelled');
    expect(await client.getActiveHostSession()).toBeNull();
  });

  it('rechaza opciones inválidas y conserva la idempotencia de una respuesta', async () => {
    const client = createLocalQuizClient(bank);
    const session = await client.createSession();
    await client.joinSession(session.code, 'Ana', 'ana');
    const started = await client.startSession(session.code);

    await expect(client.submitAnswer(session.code, 'ana', 'Z')).rejects.toThrow('Opción inválida');
    await client.submitAnswer(session.code, 'ana', 'A');
    const once = await client.getHostState(session.code);
    await client.submitAnswer(session.code, 'ana', 'A');
    const twice = await client.getHostState(session.code);
    expect(twice.answeredCount).toBe(once.answeredCount);
  });

  it('solo agrega resultados globales con la duración oficial', async () => {
    const client = createLocalQuizClient(bank);
    const session = await client.createSession();
    await client.setQuestionDuration(session.code, 5);
    const state = await client.getHostState(session.code);
    expect(state.questionDurationMs).toBe(5_000);
    expect(state.questionDurationMs).not.toBe(QUIZ_DURATION_MS);
  });
});
