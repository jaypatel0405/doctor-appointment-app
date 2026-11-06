
import { useState } from "react";
import { ArrowLeft, ArrowRight, Eye, EyeOff } from "lucide-react";
import AppBar from "./AppBar";
import "./auth.css";
import { apiRequest, saveSession } from "./api";
import { showToast } from "./toast";

export default function Auth({
  mode,
  onModeChange,
  onSuccess,
  onHome,
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isRegister = mode === "register";

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    // Validate email
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    // Validate password
    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    // Registration validation
    if (isRegister) {
      if (cleanName.length < 2) {
        setError("Please enter your full name.");
        return;
      }

      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
    }

    setLoading(true);

    try {
      const data = await apiRequest(
        isRegister
          ? "/api/auth/register"
          : "/api/auth/login",
        {
          method: "POST",
          auth: false,
          body: isRegister
            ? {
                name: cleanName,
                email: cleanEmail,
                password,
              }
            : {
                email: cleanEmail,
                password,
              },
        }
      );

      if (!data.token || !data.user) {
        throw new Error("Unexpected response from the server.");
      }

      // Save patient login session
      saveSession("patient", data.token, data.user);

      showToast(
        isRegister
          ? `Account created. Welcome to MediBook+, ${data.user.name}!`
          : `Welcome back, ${data.user.name}!`,
        "success"
      );

      onSuccess(data.user);
    } catch (requestError) {
      setError(
        requestError.message ||
          "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  function switchMode() {
    setError("");
    setPassword("");
    setConfirmPassword("");
    onModeChange(isRegister ? "login" : "register");
  }

  return (
    <div className="screen">
      <AppBar
        onHome={onHome}
        label={isRegister ? "Create an account" : "Sign in"}
      >
        <button
          className="btn btn--secondary btn--sm"
          type="button"
          onClick={onHome}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back to home
        </button>
      </AppBar>

      <main className="screen__main wrap auth__main">
        <div className="panel-box panel-box--light auth__card">
          <div className="auth__head">
            <p className="eyebrow-label">
              {isRegister ? "New to MediBook+" : "Patients"}
            </p>

            <h1>
              {isRegister ? "Create an account" : "Sign in"}
            </h1>

            <p>
              {isRegister
                ? "Register to book and manage your doctor appointments."
                : "Use the email and password you registered with."}
            </p>
          </div>

          <form
            className="form auth__form"
            onSubmit={handleSubmit}
            noValidate
          >
            {isRegister && (
              <label className="field field--full auth__in" htmlFor="auth-name">
                Full name
                <input
                  id="auth-name"
                  type="text"
                  placeholder="Enter your full name"
                  value={name}
                  onChange={(event) =>
                    setName(event.target.value)
                  }
                  autoComplete="name"
                  required
                />
              </label>
            )}

            <label className="field field--full" htmlFor="auth-email">
              Email address
              <input
                id="auth-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
                autoComplete="email"
                required
              />
            </label>

            <label className="field field--full" htmlFor="auth-password">
              Password
              <span className="ui-affix ui-affix--trail">
                <input
                  id="auth-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(event) =>
                    setPassword(event.target.value)
                  }
                  autoComplete={
                    isRegister
                      ? "new-password"
                      : "current-password"
                  }
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  className="ui-affix__btn"
                  aria-label="Show password"
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? (
                    <EyeOff size={18} aria-hidden="true" />
                  ) : (
                    <Eye size={18} aria-hidden="true" />
                  )}
                </button>
              </span>
            </label>

            {isRegister && (
              <label
                className="field field--full auth__in"
                htmlFor="auth-confirm-password"
              >
                Confirm password
                <input
                  id="auth-confirm-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter password again"
                  value={confirmPassword}
                  onChange={(event) =>
                    setConfirmPassword(event.target.value)
                  }
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </label>
            )}


            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}

            <button
              className="btn btn--primary auth__submit"
              type="submit"
              disabled={loading}
            >
              {loading
                ? "Please wait…"
                : isRegister
                  ? "Create account"
                  : "Sign in"}
            </button>
          </form>

          <p className="auth__switch">
            {isRegister
              ? "Already have an account?"
              : "New to MediBook+?"}{" "}
            <button
              type="button"
              className="link"
              onClick={switchMode}
            >
              {isRegister ? "Sign in" : "Create an account"}
              <ArrowRight size={16} className="ui-nudge" aria-hidden="true" />
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}
