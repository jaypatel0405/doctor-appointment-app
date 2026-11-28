
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Eye, EyeOff, MailCheck, RotateCw } from "lucide-react";
import AppBar from "./AppBar";
import "./auth.css";
import { apiRequest, saveSession } from "./api";
import { showToast } from "./toast";
import CodeInput from "./ui/CodeInput";

const CODE_LENGTH = 6;

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

  // Email verification step: set when the server asks for the emailed code.
  const [verify, setVerify] = useState(null); // { email, message }
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [resending, setResending] = useState(false);

  const isRegister = mode === "register";

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const timer = setTimeout(() => setResendIn((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  function startVerification(data, fallbackEmail) {
    setVerify({
      email: data.email || fallbackEmail,
      message: data.message || "",
    });
    setCode("");
    setCodeError("");
    setError("");
    setResendIn(Number(data.retryAfter) || 60);
    // focus the first box once it is on screen
    setTimeout(() => document.getElementById("auth-code")?.focus(), 50);
  }

  function finishSignIn(data, welcome) {
    if (!data.token || !data.user) {
      throw new Error("Unexpected response from the server.");
    }

    saveSession("patient", data.token, data.user);
    showToast(welcome(data.user), "success");
    onSuccess(data.user);
  }

  async function submitCode(value = code) {
    if (loading) return;

    if (!new RegExp(`^\\d{${CODE_LENGTH}}$`).test(value)) {
      setCodeError(`Enter the ${CODE_LENGTH}-digit code from the email.`);
      document.getElementById("auth-code")?.focus();
      return;
    }

    setLoading(true);
    setCodeError("");

    try {
      const data = await apiRequest("/api/auth/verify-email", {
        method: "POST",
        auth: false,
        body: { email: verify.email, code: value },
      });

      finishSignIn(data, (user) => `Email verified. Welcome to MediBook+, ${user.name}!`);
    } catch (requestError) {
      if (requestError.status === 409) {
        // already verified (e.g. in another tab): back to sign in
        setVerify(null);
        onModeChange("login");
        setError(requestError.message);
        return;
      }

      setCodeError(requestError.message || "That code did not work. Please try again.");
      setCode("");
      setTimeout(() => document.getElementById("auth-code")?.focus(), 0);
    } finally {
      setLoading(false);
    }
  }

  async function resendCode() {
    if (resending || resendIn > 0) return;

    setResending(true);
    setCodeError("");

    try {
      const data = await apiRequest("/api/auth/resend-code", {
        method: "POST",
        auth: false,
        body: { email: verify.email },
      });

      setResendIn(Number(data.retryAfter) || 60);
      setCode("");
      showToast(data.message || "A new code is on its way.", "success");
      document.getElementById("auth-code")?.focus();
    } catch (requestError) {
      if (requestError.data?.retryAfter) setResendIn(Number(requestError.data.retryAfter));
      setCodeError(requestError.message || "Could not send a new code. Please try again.");
    } finally {
      setResending(false);
    }
  }

  function leaveVerification() {
    setVerify(null);
    setCode("");
    setCodeError("");
    setPassword("");
    setConfirmPassword("");
  }

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

      // New accounts confirm their email with a code before signing in.
      if (data.needsVerification) {
        startVerification(data, cleanEmail);
        return;
      }

      finishSignIn(data, (user) =>
        isRegister
          ? `Account created. Welcome to MediBook+, ${user.name}!`
          : `Welcome back, ${user.name}!`
      );
    } catch (requestError) {
      // Signing in to an account whose email is not verified yet.
      if (requestError?.data?.needsVerification) {
        startVerification(requestError.data, cleanEmail);
        return;
      }

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

  if (verify) {
    return (
      <div className="screen">
        <AppBar onHome={onHome} label="Verify your email">
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
          <div className="panel-box panel-box--light auth__card auth__in">
            <div className="auth__head">
              <span className="auth__icon" aria-hidden="true">
                <MailCheck size={22} />
              </span>
              <p className="eyebrow-label">One more step</p>
              <h1>Check your email</h1>
              <p>
                Enter the {CODE_LENGTH}-digit code we sent to{" "}
                <strong className="auth__email">{verify.email}</strong>. It
                expires in 10 minutes.
              </p>
            </div>

            <form
              className="form auth__form"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                submitCode();
              }}
            >
              <div className="field field--full">
                <label htmlFor="auth-code">Verification code</label>
                <CodeInput
                  length={CODE_LENGTH}
                  idPrefix="auth-code"
                  value={code}
                  onChange={(value) => {
                    setCode(value);
                    if (codeError) setCodeError("");
                  }}
                  onComplete={submitCode}
                  disabled={loading}
                  invalid={Boolean(codeError)}
                  describedBy={codeError ? "auth-code-error" : undefined}
                />
                {codeError && (
                  <span className="field-error" id="auth-code-error" role="alert">
                    {codeError}
                  </span>
                )}
              </div>

              <button
                className="btn btn--primary auth__submit"
                type="submit"
                disabled={loading}
              >
                {loading ? "Checking…" : "Verify and sign in"}
              </button>
            </form>

            <div className="auth__resend">
              <span>Didn&rsquo;t get it? Check your spam folder, or</span>
              <button
                type="button"
                className="link"
                onClick={resendCode}
                disabled={resending || resendIn > 0}
              >
                <RotateCw size={15} aria-hidden="true" className={resending ? "auth__spin" : undefined} />
                {resendIn > 0
                  ? `Send a new code in ${resendIn}s`
                  : resending
                    ? "Sending…"
                    : "Send a new code"}
              </button>
            </div>

            <p className="auth__switch">
              Wrong email address?{" "}
              <button type="button" className="link" onClick={leaveVerification}>
                {isRegister ? "Change it" : "Back to sign in"}
                <ArrowRight size={16} className="ui-nudge" aria-hidden="true" />
              </button>
            </p>
          </div>
        </main>
      </div>
    );
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
