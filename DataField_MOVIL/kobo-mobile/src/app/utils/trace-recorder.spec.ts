import { TraceRecorder } from './trace-recorder';

describe('TraceRecorder', () => {
  const t0 = Date.UTC(2026, 9, 29, 14, 0, 0);
  const fix = (latitude: number, accuracy: number | null, timestamp: number) =>
    async () => ({ latitude, longitude: -80.72, accuracy, timestamp });

  it('guarda un punto por evento y descarta lecturas imprecisas o fallidas', async () => {
    const recorder = new TraceRecorder(undefined, fix(-0.95, 8, t0));
    expect(await recorder.capture('inicio')).toBe(true);
    const imprecise = new TraceRecorder(undefined, fix(-0.95, 250, t0));
    expect(await imprecise.capture('inicio')).toBe(false);
    const failing = new TraceRecorder(undefined, async () => { throw new Error('sin señal'); });
    expect(await failing.capture('inicio')).toBe(false);
    expect(recorder.points).toBe(1);
  });

  it('continúa el trazado al retomar el borrador y marca el fin al enviar', async () => {
    const first = new TraceRecorder(undefined, fix(-0.95, 5, t0));
    await first.capture('inicio');
    const draft = first.snapshot();
    expect(draft.ended_at).toBeNull();

    const resumed = new TraceRecorder(draft, fix(-0.951, 5, t0 + 600000));
    await resumed.capture('reanudar');
    await resumed.capture('fin');
    const final = resumed.snapshot(true);
    expect(final.started_at).toBe(draft.started_at);
    expect(final.points.map(p => p[4])).toEqual(['inicio', 'reanudar', 'fin']);
    expect(final.ended_at).not.toBeNull();
  });
});
