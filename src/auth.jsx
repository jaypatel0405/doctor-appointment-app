
import { useState } from "react";
import { ArrowLeft, ArrowRight, Eye, EyeOff } from "lucide-react";
import AppBar from "./AppBar";
import "./auth.css";
import { apiRequest, saveSession } from "./api";
import { showToast } from "./toast";

const FIELD_IDS = {
  name: "auth-name",
  email: "auth-email",
  password: "auth-password",
  confirmPassword: "auth-confirm-password",
};

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
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const isRegister = mode === "register";

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    // Every field is checked at once; each message sits under its field.
    const errors = {};

    if (isRegister && cleanName.length < 2) {
      errors.name = "Full name needs at least 2 characters.";
    } else if (isRegister && cleanName.length > 100) {
      errors.name = "Name must be at most 100 characters.";
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      errors.email = "Enter an email address like name@example.com.";
    }

    if (!password || password.length < 8) {
      errors.password = "Password must be at least 8 characters long.";
    } else if (isRegister && password.length > 128) {
      errors.password = "Password must be at most 128 characters long.";
    }

    if (isRegister && !errors.password && password !== confirmPassword) {
      errors.confirmPassword = "Passwords do not match.";
    }

    setFieldErrors(errors);

    const first = ["name", "email", "password", "confirmPassword"].find(
      (key) => errors[key]
    );

    if (first) {
      document.getElementById(FIELD_IDS[first])?.focus();
      return;
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
      // The server's validator names the field ({ errors: [{ field, message }] }).
      const list = requestError?.data?.errors;
      const serverErrors = Array.isArray(list)
        ? list.reduce((map, item) => {
            if (FIELD_IDS[item?.field] && !map[item.field]) {
              map[item.field] = item.message;
            }
            return map;
          }, {})
        : {};

      if (Object.keys(serverErrors).length > 0) {
        setFieldErrors(serverErrors);
        const firstServer = Object.keys(FIELD_IDS).find((key) => serverErrors[key]);
        document.getElementById(FIELD_IDS[firstServer])?.focus();
      } else {
        setError(
          requestError.message ||
            "Something went wrong. Please try again."
        );
      }
    } finally {
      setLoading(false);
    }
  }

  function switchMode() {
    setError("");
    setFieldErrors({});
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
                  aria-invalid={Boolean(fieldErrors.name)}
                  aria-describedby={fieldErrors.name ? "auth-name-error" : undefined}
                  type="text"
                  placeholder="Enter your full name"
                  value={name}
                  onChange={(event) =>
                    setName(event.target.value)
                  }
                  autoComplete="name"
                  required
                />
                {fieldErrors.name && (
                  <span className="field-error" id="auth-name-error">
                    {fieldErrors.name}
                  </span>
                )}
              </label>
            )}

            <label className="field field--full" htmlFor="auth-email">
              Email address
              <input
                id="auth-email"
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? "auth-email-error" : undefined}
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
                autoComplete="email"
                required
              />
              {fieldErrors.email && (
                <span className="field-error" id="auth-email-error">
                  {fieldErrors.email}
                </span>
              )}
            </label>

            <label className="field field--full" htmlFor="auth-password">
              Password
              <span className="ui-affix ui-affix--trail">
                <input
                  id="auth-password"
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={fieldErrors.password ? "auth-password-error" : undefined}
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
              {fieldErrors.password && (
                <span className="field-error" id="auth-password-error">
                  {fieldErrors.password}
                </span>
              )}
            </label>

            {isRegister && (
              <label
                className="field field--full auth__in"
                htmlFor="auth-confirm-password"
              >
                Confirm password
                <input
                  id="auth-confirm-password"
                  aria-invalid={Boolean(fieldErrors.confirmPassword)}
                  aria-describedby={fieldErrors.confirmPassword ? "auth-confirm-password-error" : undefined}
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
                {fieldErrors.confirmPassword && (
                  <span className="field-error" id="auth-confirm-password-error">
                    {fieldErrors.confirmPassword}
                  </span>
                )}
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
