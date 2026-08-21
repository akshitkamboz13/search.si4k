import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchConfig, saveConfig, ConfigEntry, ConfigResponse } from '../services/api.js';
import { Lock, Unlock, Save, RefreshCw, AlertTriangle, CheckCircle, ChevronDown, ChevronRight, Settings2 } from 'lucide-react';

interface ConfigPageProps {
  onClose: () => void;
}

type Toast = { type: 'success' | 'error'; message: string } | null;

export const ConfigPage: React.FC<ConfigPageProps> = ({ onClose }) => {
  const [configData, setConfigData] = useState<ConfigResponse | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [originalValues, setOriginalValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchConfig();
      setConfigData(data);
      const vals: Record<string, string> = {};
      data.fields.forEach((f) => { vals[f.key] = f.value; });
      setValues(vals);
      setOriginalValues(vals);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to load config');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const handleChange = (key: string, val: string) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  };

  const dirtyKeys = useMemo(() =>
    Object.keys(values).filter((k) => values[k] !== originalValues[k]),
    [values, originalValues]
  );

  const handleSave = async () => {
    if (!configData?.isLan || dirtyKeys.length === 0) return;
    setSaving(true);
    const updates: Record<string, string> = {};
    dirtyKeys.forEach((k) => { updates[k] = values[k]; });
    try {
      const result = await saveConfig(updates);
      setOriginalValues((prev) => ({ ...prev, ...updates }));
      showToast('success', result.message);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setValues(originalValues);
  };

  const toggleGroup = (group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      next.has(group) ? next.delete(group) : next.add(group);
      return next;
    });
  };

  // Group fields
  const grouped = useMemo(() => {
    if (!configData) return {};
    const map: Record<string, ConfigEntry[]> = {};
    configData.fields.forEach((f) => {
      if (!map[f.group]) map[f.group] = [];
      map[f.group].push(f);
    });
    return map;
  }, [configData]);

  const isReadOnly = !configData?.isLan;

  return (
    <div className="config-page-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="config-page-panel">
        {/* Header */}
        <div className="config-page-header">
          <div className="config-page-title">
            <Settings2 size={22} style={{ color: 'var(--brand-color)' }} />
            <span>Search Engine Config</span>
            <span
              className={`config-access-badge ${isReadOnly ? 'badge-readonly' : 'badge-editable'}`}
            >
              {isReadOnly
                ? <><Lock size={11} /> Internet — Read-only</>
                : <><Unlock size={11} /> LAN — Editable</>
              }
            </span>
          </div>
          <button className="config-close-btn" onClick={onClose} title="Close">✕</button>
        </div>

        {/* Read-only banner */}
        {isReadOnly && (
          <div className="config-readonly-banner">
            <Lock size={15} />
            <span>You are connected from the <strong>internet</strong>. Config is read-only. Connect via LAN to make changes.</span>
          </div>
        )}

        {/* Body */}
        <div className="config-page-body">
          {loading ? (
            <div className="config-loading">
              <div className="config-spinner" />
              <span>Loading config…</span>
            </div>
          ) : (
            Object.entries(grouped).map(([group, fields]) => {
              const isCollapsed = collapsedGroups.has(group);
              const groupHasDirty = fields.some((f) => dirtyKeys.includes(f.key));
              return (
                <div key={group} className="config-group">
                  <button
                    className="config-group-header"
                    onClick={() => toggleGroup(group)}
                  >
                    <span className="config-group-toggle">
                      {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                    </span>
                    <span className="config-group-name">{group}</span>
                    {groupHasDirty && <span className="config-dirty-dot" title="Unsaved changes" />}
                  </button>

                  {!isCollapsed && (
                    <div className="config-group-fields">
                      {fields.map((field) => {
                        const isDirty = dirtyKeys.includes(field.key);
                        const val = values[field.key] ?? '';

                        return (
                          <div key={field.key} className={`config-field ${isDirty ? 'config-field-dirty' : ''}`}>
                            <label className="config-field-label" htmlFor={`cfg-${field.key}`}>
                              {field.label}
                              {field.lanOnly && isReadOnly && (
                                <span className="config-lan-only-tag" title="Only visible on LAN">🔒 LAN only</span>
                              )}
                              {isDirty && <span className="config-unsaved-tag">unsaved</span>}
                            </label>
                            <div className="config-field-description">{field.description}</div>

                            {field.type === 'boolean' ? (
                              <div className="config-toggle-row">
                                <button
                                  id={`cfg-${field.key}`}
                                  type="button"
                                  disabled={isReadOnly}
                                  className={`config-toggle-btn ${val === 'true' ? 'toggle-on' : 'toggle-off'}`}
                                  onClick={() => !isReadOnly && handleChange(field.key, val === 'true' ? 'false' : 'true')}
                                >
                                  <span className="toggle-thumb" />
                                </button>
                                <span className="config-toggle-label">{val === 'true' ? 'Enabled' : 'Disabled'}</span>
                              </div>
                            ) : field.type === 'select' ? (
                              <select
                                id={`cfg-${field.key}`}
                                disabled={isReadOnly}
                                value={val}
                                onChange={(e) => handleChange(field.key, e.target.value)}
                                className="config-input config-select"
                              >
                                {(field.options ?? []).map((opt) => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            ) : (
                              <input
                                id={`cfg-${field.key}`}
                                type={field.type === 'number' ? 'number' : 'text'}
                                disabled={isReadOnly}
                                value={val}
                                onChange={(e) => handleChange(field.key, e.target.value)}
                                className="config-input"
                                spellCheck={false}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer actions */}
        {!loading && (
          <div className="config-page-footer">
            <div className="config-footer-info">
              {configData && (
                <span className="config-client-ip">
                  Your IP: <code>{configData.clientIp}</code>
                </span>
              )}
            </div>
            <div className="config-footer-actions">
              <button
                type="button"
                className="config-btn config-btn-secondary"
                onClick={loadConfig}
                disabled={saving}
                title="Reload from server"
              >
                <RefreshCw size={14} />
                Reload
              </button>
              {!isReadOnly && (
                <>
                  <button
                    type="button"
                    className="config-btn config-btn-secondary"
                    onClick={handleReset}
                    disabled={saving || dirtyKeys.length === 0}
                  >
                    Reset Changes
                  </button>
                  <button
                    type="button"
                    className={`config-btn config-btn-primary ${dirtyKeys.length === 0 ? 'btn-disabled' : ''}`}
                    onClick={handleSave}
                    disabled={saving || dirtyKeys.length === 0}
                  >
                    {saving ? <RefreshCw size={14} className="spin" /> : <Save size={14} />}
                    {saving ? 'Saving…' : `Save${dirtyKeys.length > 0 ? ` (${dirtyKeys.length})` : ''}`}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div className={`config-toast ${toast.type === 'success' ? 'toast-success' : 'toast-error'}`}>
            {toast.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
            <span>{toast.message}</span>
          </div>
        )}
      </div>
    </div>
  );
};
