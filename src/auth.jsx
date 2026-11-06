
import { useState } from "react";
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
    <main className="auth-page">
      <div className="auth-card">
        <button
          className="auth-back"
          type="button"
          onClick={onHome}
        >
          ← Back to Home
        </button>

        <div className="auth-logo">+</div>

        <p className="auth-eyebrow">
          WELCOME TO MEDIBOOK+
        </p>

        <h1>
          {isRegister
            ? "Create your account"
            : "Welcome back!"}
        </h1>

        <p className="auth-subtitle">
          {isRegister
            ? "Register to book and manage your doctor appointments."
            : "Log in with your registered email and password."}
        </p>

        <form
          className="auth-form"
          onSubmit={handleSubmit}
          noValidate
        >
          {isRegister && (
            <>
              <label htmlFor="auth-name">
                Full name
              </label>

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
            </>
          )}

          <label htmlFor="auth-email">
            Email address
          </label>

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

          <label htmlFor="auth-password">
            Password
          </label>

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

          {isRegister && (
            <>
              <label htmlFor="auth-confirm-password">
                Confirm password
              </label>

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
            </>
          )}

          <label className="show-password">
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(event) =>
                setShowPassword(event.target.checked)
              }
            />
            Show password
          </label>

          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}

          <button
            className="primary-button auth-submit"
            type="submit"
            disabled={loading}
          >
            {loading
              ? "Please wait..."
              : isRegister
                ? "Create Account"
                : "Login"}
          </button>
        </form>

        <p className="auth-switch">
          {isRegister
            ? "Already have an account?"
            : "Don't have an account?"}{" "}

          <button
            type="button"
            onClick={switchMode}
          >
            {isRegister ? "Login" : "Register"}
          </button>
        </p>
      </div>
    </main>
  );
}
