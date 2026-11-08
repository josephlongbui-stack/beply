"use client";
import { sendSource } from "./cloud-upload";
import { useEffect, useState } from "react";
import {
  useApp,
  Card,
  Button,
  Badge,
  Field,
  Note,
  Modal,
  dateTime,
} from "./ui";
type BackupStatus = { last_success: string | null; last_error: string | null };
export default function AccountPanel() {
  const { state: s, reload, setPayload, setNotice, cloud } = useApp();
  const [account, setAccount] = useState<{ username: string } | null>(null),
    [loaded, setLoaded] = useState(false),
    [mode, setMode] = useState<"login" | "register" | null>(null),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState<BackupStatus | null>(null),
    [workspaces, setWorkspaces] = useState<
      { id: string; name: string; kind: string }[]
    >([]),
    [file, setFile] = useState<File | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch("/api/account", { signal: controller.signal }).then((r) =>
        r.json(),
      ),
      fetch("/api/backup?status=1", { signal: controller.signal }).then((r) =>
        r.json(),
      ),
    ])
      .then(([a, b]) => {
        if (a.error || b.error) throw new Error(a.error || b.error);
        setAccount(a.account);
        setLoaded(true);
        setStatus(b.status);
        setWorkspaces(b.workspaces);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [s.id, s.revision]);
  async function auth(action: "login" | "register" | "logout") {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPassword("");
      window.location.reload();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  async function restore() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const res = await sendSource(
          file,
          "backup",
          { confirmation: "RESTORE COPY" },
          cloud,
        ),
        data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPayload(data);
      setFile(null);
      setNotice(
        "Backup restored into a separate workspace. Your previous records are preserved.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="account-card">
      <div className="section-head">
        <div>
          <div className="eyebrow">A HOME FOR YOUR BUSINESS RECORDS</div>
          <h2>Account & recovery</h2>
        </div>
        <Badge>
          {account
            ? `Signed in · ${account.username}`
            : loaded
              ? "Guest workspace"
              : "Loading account…"}
        </Badge>
      </div>
      <div className="two-column">
        <section>
          <h3>Keep your workspace</h3>
          <p>
            {account
              ? cloud
                ? "Sign in with this account from your phone or computer. Your records are stored in the cloud."
                : "Sign in with this account to recover these workspaces on this same server."
              : "Create a local account to keep access to this workspace after signing out or clearing your browser cookies."}
          </p>
          <div className="button-row">
            {account ? (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void auth("logout")}
              >
                Sign out
              </Button>
            ) : (
              <>
                <Button
                  disabled={!loaded}
                  onClick={() => {
                    setMode("register");
                    setError("");
                  }}
                >
                  Create local account
                </Button>
                <Button
                  disabled={!loaded}
                  variant="secondary"
                  onClick={() => {
                    setMode("login");
                    setError("");
                  }}
                >
                  Sign in
                </Button>
              </>
            )}
          </div>
          <p className="caption">
            {cloud
              ? "Private cloud pilot. Team access, email verification and password recovery are not connected."
              : "Private single-owner pilot on this server. Public hosting, team access, email verification and password recovery are not connected."}
          </p>
        </section>
        <section>
          <h3>Backups you can restore</h3>
          <p>
            {cloud
              ? "Each saved change keeps a snapshot linked to private source files. The five latest copies stay in cloud storage."
              : "Each saved change keeps a snapshot, including uploaded sources. The five latest copies stay on this server."}
          </p>
          <p className="caption">
            {status?.last_success
              ? `Last successful snapshot: ${dateTime(status.last_success, s.timezone)}`
              : "No automatic snapshot yet. The first saved change creates one."}
          </p>
          {status?.last_error && (
            <Note tone="danger">
              Automatic backup failed: {status.last_error}. Export a copy now.
            </Note>
          )}
          <a className="button secondary" href="/api/backup">
            Download complete backup
          </a>
          <p className="caption">
            Keep a copy somewhere separate from this computer. Backup files
            contain your private records and source documents; they are not
            encrypted.
          </p>
        </section>
      </div>
      <details>
        <summary>Restore a backup or reopen a workspace</summary>
        <Field label="Backup file">
          <input
            type="file"
            accept="application/json,.json"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </Field>
        {file && (
          <Note>
            Restore {file.name} into a new workspace. Existing workspaces stay
            intact. Review purchases in the restored copy before taking action.
          </Note>
        )}
        <Button disabled={busy || !file} onClick={() => void restore()}>
          {busy ? "Working…" : "Restore as a separate copy"}
        </Button>
        <div className="workspace-recovery-list">
          {workspaces.map((w) => (
            <Button
              key={w.id}
              variant="ghost"
              disabled={busy || w.id === s.id}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const res = await fetch("/api/state", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      type: "activate_workspace",
                      id: w.id,
                    }),
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error);
                  await reload();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {w.name}
              {w.id === s.id ? " · current" : ""}
            </Button>
          ))}
        </div>
      </details>
      {error && !mode && <Note tone="danger">{error}</Note>}
      {mode && (
        <Modal
          title={
            mode === "register" ? "Create a local account" : "Sign in to beply"
          }
          onClose={() => {
            setMode(null);
            setPassword("");
            setError("");
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void auth(mode);
            }}
          >
            <p>
              {mode === "register"
                ? "Your current workspace and its records will belong to this account. Save your credentials; password recovery is not connected."
                : "Sign in to an account on this server. Your current guest workspace is not merged into that account."}
            </p>
            <Field label="Username">
              <input
                required
                autoComplete="username"
                minLength={3}
                maxLength={60}
                pattern="[a-zA-Z0-9_.-]+"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </Field>
            <Field
              label="Password"
              hint="At least 12 characters. Use a password manager to save it."
            >
              <input
                required
                type="password"
                autoComplete={
                  mode === "register" ? "new-password" : "current-password"
                }
                minLength={12}
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            {error && <Note tone="danger">{error}</Note>}
            <div className="modal-actions">
              <Button disabled={busy}>
                {busy
                  ? "Working…"
                  : mode === "register"
                    ? "Create account & keep this workspace"
                    : "Sign in"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </Card>
  );
}
