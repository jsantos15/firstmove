'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/app/providers';
import { useAllProgress } from '@/hooks/useProgress';
import { useOpenings } from '@/hooks/useOpenings';
import { getOpeningProgress } from '@/hooks/useProgress';
import { updateDisplayName, updatePassword } from '@/lib/supabase/auth';

export default function AccountPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { data: progress } = useAllProgress();
  const { data: openings = [] } = useOpenings();

  const displayName = (user?.user_metadata?.full_name as string) || '';
  const email = user?.email ?? '';
  const initial = displayName?.[0]?.toUpperCase() ?? email[0]?.toUpperCase() ?? '?';
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;

  // ── Opening progress stats ────────────────────────────────────────────────
  const openingStats = openings.reduce(
    (acc, o) => {
      const { status } = getOpeningProgress(progress, o.id, o.variations.map(v => v.id));
      if (status === 'mastered') acc.mastered++;
      else if (status === 'completed') acc.completed++;
      else if (status === 'learned') acc.learned++;
      else acc.notStarted++;
      return acc;
    },
    { mastered: 0, completed: 0, learned: 0, notStarted: 0 }
  );
  const totalStarted = openingStats.mastered + openingStats.completed + openingStats.learned;

  // ── Name editing ──────────────────────────────────────────────────────────
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(displayName);
  const [nameSuccess, setNameSuccess] = useState(false);

  const nameMutation = useMutation({
    mutationFn: updateDisplayName,
    onSuccess: () => {
      setEditingName(false);
      setNameSuccess(true);
      setTimeout(() => setNameSuccess(false), 3000);
      router.refresh();
    },
  });

  // ── Password change ───────────────────────────────────────────────────────
  const [changingPassword, setChangingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const passwordMutation = useMutation({
    mutationFn: updatePassword,
    onSuccess: () => {
      setChangingPassword(false);
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSuccess(true);
      setTimeout(() => setPasswordSuccess(false), 3000);
    },
  });

  const passwordError =
    passwordMutation.error instanceof Error
      ? passwordMutation.error.message
      : newPassword && confirmPassword && newPassword !== confirmPassword
      ? 'Passwords do not match'
      : null;

  function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword || newPassword.length < 6) return;
    passwordMutation.mutate(newPassword);
  }

  return (
    <div className="h-full overflow-y-auto bg-[var(--bg-base)]">
      <div className="mx-auto max-w-2xl px-6 py-10 pb-16 flex flex-col gap-6">

        <h1 className="text-2xl font-bold text-white">Profile</h1>

        {/* ── Avatar + info ──────────────────────────────────── */}
        <section className="rounded-xl border border-white/5 bg-[var(--bg-panel)] p-6 flex items-center gap-5">
          <div className="w-16 h-16 rounded-full bg-amber-400/15 border-2 border-amber-400/30 flex items-center justify-center text-2xl font-bold text-amber-400 shrink-0 select-none">
            {initial}
          </div>
          <div className="min-w-0">
            <p className="text-lg font-semibold text-white truncate">{displayName || 'No name set'}</p>
            <p className="text-sm text-gray-400 truncate">{email}</p>
            {memberSince && (
              <p className="text-xs text-gray-600 mt-1">Member since {memberSince}</p>
            )}
          </div>
        </section>

        {/* ── Openings progress ─────────────────────────────── */}
        <section className="rounded-xl border border-white/5 bg-[var(--bg-panel)] overflow-hidden">
          <div className="px-6 py-5 border-b border-white/5">
            <h2 className="text-base font-semibold text-white">Openings</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {totalStarted} of {openings.length} openings started
            </p>
          </div>
          <div className="grid grid-cols-3 divide-x divide-white/5">
            {[
              { label: 'Learned',   value: openingStats.learned,   color: 'text-amber-400' },
              { label: 'Completed', value: openingStats.completed, color: 'text-blue-400'  },
              { label: 'Mastered', value: openingStats.mastered, color: 'text-green-400' },
            ].map(stat => (
              <div key={stat.label} className="px-6 py-5 flex flex-col items-center gap-1">
                <span className={`text-3xl font-bold ${stat.color}`}>{stat.value}</span>
                <span className="text-xs text-gray-500">{stat.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Account settings ──────────────────────────────── */}
        <section className="rounded-xl border border-white/5 bg-[var(--bg-panel)] overflow-hidden">
          <div className="px-6 py-5 border-b border-white/5">
            <h2 className="text-base font-semibold text-white">Account</h2>
          </div>

          {/* Display name */}
          <div className="px-6 py-5 border-b border-white/5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs text-gray-500 mb-1">Display name</p>
                {editingName ? (
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      autoFocus
                      value={nameValue}
                      onChange={e => setNameValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') nameMutation.mutate(nameValue);
                        if (e.key === 'Escape') { setEditingName(false); setNameValue(displayName); }
                      }}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder-gray-600 outline-none focus:border-amber-400/50 focus:ring-0 w-52"
                      placeholder="Your name"
                    />
                    <button
                      onClick={() => nameMutation.mutate(nameValue)}
                      disabled={nameMutation.isPending || !nameValue.trim()}
                      className="rounded-lg bg-amber-400/20 px-3 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-400/30 transition-colors disabled:opacity-40"
                    >
                      {nameMutation.isPending ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onClick={() => { setEditingName(false); setNameValue(displayName); }}
                      className="rounded-lg px-3 py-1.5 text-xs text-gray-500 hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-white">{displayName || <span className="text-gray-600">Not set</span>}</p>
                )}
                {nameSuccess && <p className="text-xs text-green-400 mt-1">Name updated.</p>}
                {nameMutation.isError && (
                  <p className="text-xs text-red-400 mt-1">
                    {nameMutation.error instanceof Error ? nameMutation.error.message : 'Failed to update.'}
                  </p>
                )}
              </div>
              {!editingName && (
                <button
                  onClick={() => setEditingName(true)}
                  className="shrink-0 text-xs text-gray-500 hover:text-white border border-white/10 rounded-lg px-3 py-1.5 transition-colors"
                >
                  Edit
                </button>
              )}
            </div>
          </div>

          {/* Email — read-only */}
          <div className="px-6 py-5 border-b border-white/5">
            <p className="text-xs text-gray-500 mb-1">Email</p>
            <p className="text-sm text-white">{email}</p>
            <p className="text-xs text-gray-600 mt-1">Email changes require verification — contact support.</p>
          </div>

          {/* Password */}
          <div className="px-6 py-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-gray-500 mb-1">Password</p>
                <p className="text-sm text-white">••••••••</p>
              </div>
              {!changingPassword && (
                <button
                  onClick={() => setChangingPassword(true)}
                  className="shrink-0 text-xs text-gray-500 hover:text-white border border-white/10 rounded-lg px-3 py-1.5 transition-colors"
                >
                  Change
                </button>
              )}
            </div>

            {changingPassword && (
              <form onSubmit={handlePasswordSubmit} className="mt-4 flex flex-col gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">New password</label>
                  <input
                    autoFocus
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    minLength={6}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-amber-400/50"
                    placeholder="Min. 6 characters"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">Confirm password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-amber-400/50"
                    placeholder="Repeat new password"
                  />
                </div>
                {passwordError && (
                  <p className="text-xs text-red-400">{passwordError}</p>
                )}
                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={
                      passwordMutation.isPending ||
                      newPassword.length < 6 ||
                      newPassword !== confirmPassword
                    }
                    className="rounded-lg bg-amber-400/20 px-4 py-2 text-xs font-medium text-amber-400 hover:bg-amber-400/30 transition-colors disabled:opacity-40"
                  >
                    {passwordMutation.isPending ? 'Updating…' : 'Update password'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setChangingPassword(false); setNewPassword(''); setConfirmPassword(''); passwordMutation.reset(); }}
                    className="rounded-lg px-4 py-2 text-xs text-gray-500 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                </div>
                {passwordSuccess && <p className="text-xs text-green-400">Password updated successfully.</p>}
              </form>
            )}
            {passwordSuccess && !changingPassword && (
              <p className="text-xs text-green-400 mt-2">Password updated successfully.</p>
            )}
          </div>
        </section>

        {/* ── Sections coming soon ──────────────────────────── */}
        {(['Tactics', 'Puzzles', 'Endgames'] as const).map(section => (
          <section key={section} className="rounded-xl border border-white/5 bg-[var(--bg-panel)] overflow-hidden opacity-50">
            <div className="px-6 py-5 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-white">{section}</h2>
                <p className="text-xs text-gray-500 mt-0.5">Progress tracking coming soon</p>
              </div>
              <span className="text-xs text-gray-600 border border-white/5 rounded-full px-2.5 py-1">
                Coming soon
              </span>
            </div>
          </section>
        ))}

        {/* ── Membership ────────────────────────────────────── */}
        <section className="rounded-xl border border-white/5 bg-[var(--bg-panel)] overflow-hidden">
          <div className="px-6 py-5 border-b border-white/5">
            <h2 className="text-base font-semibold text-white">Membership</h2>
          </div>
          <div className="px-6 py-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">Free</p>
              <p className="text-xs text-gray-500 mt-0.5">Access to the first line of every opening</p>
            </div>
            <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-400">
              Current plan
            </span>
          </div>
          <div className="px-6 pb-5">
            <p className="text-xs text-gray-600">Premium membership — coming soon.</p>
          </div>
        </section>

      </div>
    </div>
  );
}
