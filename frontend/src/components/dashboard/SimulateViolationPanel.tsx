import { useEffect, useRef, useState } from 'react';
import {
  getJob,
  simulateViolation,
  type JobStatus,
  type SimulateViolationPayload,
  type ViolationSeverity,
  type ViolationType,
} from '../../lib/api';
import { useTenantInfo } from '../../hooks/useBackendLive';

/**
 * Painel interativo: o avaliador clica, dispara um POST real em
 * /webhook/violation e vê o job percorrer waiting → active → completed/failed
 * em tempo real. Esse é o coração do "produto funcionando".
 */

const VIOLATION_TYPES: { value: ViolationType; label: string }[] = [
  { value: 'PROHIBITED_TERM', label: 'Termo proibido' },
  { value: 'BRAND_VIOLATION', label: 'Violação de marca' },
  { value: 'COMPLIANCE_FAIL', label: 'Falha de compliance' },
];

const SEVERITIES: { value: ViolationSeverity; label: string; color: string }[] = [
  { value: 'LOW', label: 'Baixa', color: '#7a9' },
  { value: 'MEDIUM', label: 'Média', color: '#f5b942' },
  { value: 'HIGH', label: 'Alta', color: '#ff7a18' },
  { value: 'CRITICAL', label: 'Crítica', color: '#ff3d2e' },
];

function randomAdId(): string {
  return `ad_${Math.random().toString(36).slice(2, 8)}`;
}

export function SimulateViolationPanel(): JSX.Element {
  const { data: tenant } = useTenantInfo();
  const [adId, setAdId] = useState(randomAdId());
  const [violationType, setViolationType] = useState<ViolationType>('PROHIBITED_TERM');
  const [severity, setSeverity] = useState<ViolationSeverity>('HIGH');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* Polling do job ativo — para quando completed/failed */
  useEffect(() => {
    if (!job?.jobId) return;
    if (job.status === 'completed' || job.status === 'failed') {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    if (pollRef.current) return;
    pollRef.current = setInterval(() => {
      getJob(job.jobId)
        .then((next) => setJob(next))
        .catch(() => undefined);
    }, 800);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [job?.jobId, job?.status]);

  async function onSubmit(): Promise<void> {
    if (!tenant) return;
    setSubmitting(true);
    setError(null);
    setJob(null);
    const payload: SimulateViolationPayload = {
      adId,
      tenantId: tenant.slug, /* slug é mais reconhecível que o cuid no jobId */
      violationType,
      severity,
      detectedAt: new Date().toISOString(),
    };
    try {
      const enqueueRes = await simulateViolation(payload);
      /* primeira leitura imediata pra mostrar status "queued" antes do polling */
      const initial = await getJob(enqueueRes.jobId).catch(() => null);
      setJob(
        initial ?? {
          jobId: enqueueRes.jobId,
          status: 'queued',
          attempts: 0,
          result: null,
          error: null,
        },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'erro inesperado');
    } finally {
      setSubmitting(false);
    }
  }

  const statusOrder: JobStatus['status'][] = ['queued', 'active', 'completed'];
  const isFailed = job?.status === 'failed';

  return (
    <section className="simviol">
      <header className="simviol__head">
        <div>
          <h3 className="simviol__title">
            <span className="gradient-text">Simular violação</span>
          </h3>
          <p className="simviol__sub">
            Dispara o webhook real do FURY e acompanha o job sendo processado em tempo real.
          </p>
        </div>
        <div className="simviol__tenant mono">
          {tenant ? (
            <>
              <span className="dim">tenantId:</span>{' '}
              <span className="simviol__tenant-slug">{tenant.slug}</span>
            </>
          ) : (
            <span className="dim">carregando workspace…</span>
          )}
        </div>
      </header>

      <div className="simviol__form">
        <label className="simviol__field">
          <span className="simviol__label">adId</span>
          <div className="simviol__input-row">
            <input
              type="text"
              value={adId}
              onChange={(e) => setAdId(e.target.value)}
              className="simviol__input mono"
              placeholder="ad_001"
            />
            <button
              type="button"
              className="simviol__shuffle"
              onClick={() => setAdId(randomAdId())}
              title="Gerar adId aleatório"
              aria-label="Gerar adId aleatório"
            >
              ⟳
            </button>
          </div>
        </label>

        <label className="simviol__field">
          <span className="simviol__label">violationType</span>
          <select
            value={violationType}
            onChange={(e) => setViolationType(e.target.value as ViolationType)}
            className="simviol__input"
          >
            {VIOLATION_TYPES.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
        </label>

        <div className="simviol__field">
          <span className="simviol__label">severity</span>
          <div className="simviol__severity-grid">
            {SEVERITIES.map((s) => (
              <button
                key={s.value}
                type="button"
                className={`simviol__severity ${severity === s.value ? 'is-on' : ''}`}
                onClick={() => setSeverity(s.value)}
                style={
                  severity === s.value
                    ? { borderColor: s.color, color: s.color, background: `${s.color}15` }
                    : undefined
                }
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="simviol__submit btn btn--primary"
          disabled={submitting || !tenant}
          onClick={onSubmit}
        >
          {submitting ? 'Enfileirando…' : '🔥 Disparar violação'}
        </button>
      </div>

      {error && (
        <div className="simviol__error" role="alert">
          {error}
        </div>
      )}

      {job && (
        <div className="simviol__job">
          <div className="simviol__job-head">
            <span className="mono dim">jobId:</span>
            <span className="mono simviol__job-id">{job.jobId}</span>
            <span className="mono dim">· attempts: {job.attempts}</span>
          </div>

          <div className="simviol__timeline">
            {(isFailed
              ? (['queued', 'active', 'failed'] as JobStatus['status'][])
              : statusOrder
            ).map((step, _idx, arr) => {
              const stepIdx = arr.indexOf(step);
              const currentIdx = arr.indexOf(job.status);
              const isPast = currentIdx > stepIdx;
              const isCurrent = job.status === step;
              return (
                <div
                  key={step}
                  className={`simviol__step ${isPast ? 'is-past' : ''} ${isCurrent ? 'is-current' : ''} ${step === 'failed' && isCurrent ? 'is-failed' : ''}`}
                >
                  <span className="simviol__step-dot" />
                  <span className="simviol__step-label">{step}</span>
                </div>
              );
            })}
          </div>

          {job.status === 'completed' && job.result && (
            <div className="simviol__result">
              <div className="mono dim">upstream</div>
              <div className="simviol__result-row">
                <span className="simviol__chip simviol__chip--ok">
                  {job.result.upstreamStatus} OK
                </span>
                <span className="simviol__chip">{job.result.upstreamLatencyMs}ms</span>
              </div>
            </div>
          )}

          {job.status === 'failed' && (
            <div className="simviol__result">
              <div className="mono dim">erro</div>
              <div className="simviol__result-row">
                <span className="simviol__chip simviol__chip--err">
                  {job.error ?? 'falha não documentada'}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
