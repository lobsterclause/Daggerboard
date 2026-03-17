import React, { useEffect, useState } from 'react';
import { SetupInfo } from '../types';
import { CheckCircle, AlertCircle, Copy, Check, Terminal, Trash2 } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function DaggerSetup() {
  const [info, setInfo] = useState<SetupInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [actionResult, setActionResult] = useState<{ ok: boolean; message: string } | null>(null);

  const fetchStatus = () => {
    setLoading(true);
    fetch('/api/setup/dagger')
      .then(r => r.json())
      .then(data => {
        setInfo(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch setup info:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleCopy = () => {
    if (!info) return;
    navigator.clipboard.writeText(info.snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApply = () => {
    setApplying(true);
    setActionResult(null);
    fetch('/api/setup/dagger/apply', { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        setApplying(false);
        if (data.success) {
          setActionResult({
            ok: true,
            message: `Applied to ${data.profilePath}. Run: source ${data.profilePath}`
          });
          fetchStatus();
        } else {
          setActionResult({ ok: false, message: data.error || 'Unknown error' });
        }
      })
      .catch(err => {
        setApplying(false);
        setActionResult({ ok: false, message: String(err) });
      });
  };

  const handleRemove = () => {
    setRemoving(true);
    setActionResult(null);
    fetch('/api/setup/dagger/remove', { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        setRemoving(false);
        if (data.success) {
          setActionResult({ ok: true, message: `Removed from ${data.profilePath}` });
          fetchStatus();
        } else {
          setActionResult({ ok: false, message: data.error || 'Unknown error' });
        }
      })
      .catch(err => {
        setRemoving(false);
        setActionResult({ ok: false, message: String(err) });
      });
  };

  if (loading) {
    return (
      <div className="flex-1 overflow-auto p-4 flex items-center justify-center">
        <div className="text-slate-400">Loading setup info...</div>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="flex-1 overflow-auto p-4 flex items-center justify-center">
        <div className="text-red-400">Failed to load setup information</div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4 space-y-6">
      {/* Status Row */}
      <div className="bg-slate-900/50 rounded-lg border border-slate-800 p-4">
        <div className="flex items-center gap-3 mb-2">
          {info.installed ? (
            <>
              <CheckCircle size={20} className="text-emerald-500" />
              <span className="font-semibold text-slate-200">Dagger Detected</span>
            </>
          ) : (
            <>
              <AlertCircle size={20} className="text-amber-500" />
              <span className="font-semibold text-slate-200">Dagger Not Found</span>
            </>
          )}
        </div>
        <div className="space-y-1 text-sm text-slate-400">
          {info.installed && (
            <div>Version: <span className="text-slate-300 font-mono">{info.version}</span></div>
          )}
          <div>Shell: <span className="text-slate-300 font-mono">{info.shell}</span></div>
          <div>Profile: <span className="text-slate-300 font-mono">{info.profilePath}</span></div>
        </div>
      </div>

      {/* Snippet Block */}
      <div className="space-y-2">
        <div className="text-sm text-slate-400 uppercase tracking-wider">Export Configuration</div>
        <div className="relative">
          <pre className="bg-slate-900/50 rounded-lg border border-slate-800 p-4 font-mono text-sm text-slate-300 overflow-x-auto">
            {info.snippet}
          </pre>
          <button
            onClick={handleCopy}
            className="absolute top-2 right-2 p-2 text-slate-400 hover:text-white hover:bg-slate-800/50 rounded transition-colors"
            title="Copy to clipboard"
          >
            {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
          </button>
          {copied && (
            <div className="absolute top-2 right-12 text-xs text-emerald-400 whitespace-nowrap">
              Copied!
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2">
        {!info.snippetApplied ? (
          <button
            onClick={handleApply}
            disabled={applying}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded transition-colors",
              applying
                ? "bg-slate-700 text-slate-400 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700"
            )}
          >
            <Terminal size={16} />
            {applying ? 'Applying...' : `Auto-apply to ${info.shell}`}
          </button>
        ) : (
          <button
            onClick={handleRemove}
            disabled={removing}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded transition-colors",
              removing
                ? "bg-slate-700 text-slate-400 cursor-not-allowed"
                : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            )}
          >
            <Trash2 size={16} />
            {removing ? 'Removing...' : 'Remove'}
          </button>
        )}
      </div>

      {/* Warning Banner */}
      {info.snippetApplied && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 flex gap-3">
          <AlertCircle size={18} className="text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-200">
            <strong>Keep Daggerboard running</strong> while using Dagger. If{' '}
            <code className="bg-amber-500/20 px-1 rounded text-amber-100">
              OTEL_EXPORTER_OTLP_ENDPOINT
            </code>{' '}
            points to a stopped server, Dagger will time out on every command (Dagger issue #8605).
          </div>
        </div>
      )}

      {/* Action Result */}
      {actionResult && (
        <div
          className={cn(
            'rounded-lg p-3 text-sm font-mono',
            actionResult.ok
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/10 border border-red-500/30 text-red-300'
          )}
        >
          {actionResult.message}
        </div>
      )}
    </div>
  );
}
