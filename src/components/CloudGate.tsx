"use client";
import { useState, useEffect } from "react";
import App from "./App";
import Logo from "./Logo";
import { Button, Field } from "./ui";
export default function CloudGate() {
  const [ready, setReady] = useState(false),
    [signedIn, setSignedIn] = useState(false),
    [register, setRegister] = useState(false),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [invite, setInvite] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/account", { cache: "no-store", signal: controller.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setSignedIn(!!d.account);
        setReady(true);
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setError(e.message);
          setReady(true);
        }
      });
    return () => controller.abort();
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/account", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: register ? "register" : "login",
            username,
            password,
            invite,
          }),
        }),
        d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setPassword("");
      setInvite("");
      setSignedIn(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (signedIn) return <App cloud />;
  return (
    <main className="cloud-auth">
      <section className="cloud-auth-story">
        <Logo />
        <div className="eyebrow">YOUR KITCHEN. ANYWHERE.</div>
        <h1>
          Good food.
          <br />
          <em>Better numbers.</em>
        </h1>
        <p>
          Private purchasing, stock and prep plans for your food business. Sign
          in from your phone or computer.
        </p>
      </section>
      <section className="cloud-auth-form">
        <div className="eyebrow">BEPly · PRIVATE CLOUD WORKSPACE</div>
        <h2>{register ? "Make yourself at home." : "Welcome back."}</h2>
        {!ready ? (
          <p>Checking your sign-in…</p>
        ) : (
          <form onSubmit={submit}>
            <Field label="Username">
              <input
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </Field>
            <Field label="Password" hint="At least 12 characters.">
              <input
                type="password"
                autoComplete={register ? "new-password" : "current-password"}
                required
                minLength={12}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            {register && (
              <Field
                label="Owner setup code"
                hint="Used once to create the private owner account."
              >
                <input
                  type="password"
                  autoComplete="off"
                  required
                  value={invite}
                  onChange={(e) => setInvite(e.target.value)}
                />
              </Field>
            )}
            {error && (
              <p className="error-banner" role="alert">
                {error}
              </p>
            )}
            <Button disabled={busy}>
              {busy
                ? "Please wait…"
                : register
                  ? "Create owner account"
                  : "Sign in"}
            </Button>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setRegister(!register);
                setError("");
              }}
            >
              {register
                ? "Already have an account? Sign in"
                : "First visit? Set up your account"}
            </button>
          </form>
        )}
        <p className="caption">
          Records and uploads stay private to your account. External AI reading
          is not connected. Password recovery is not yet available; keep your
          login in a password manager.
        </p>
      </section>
    </main>
  );
}
