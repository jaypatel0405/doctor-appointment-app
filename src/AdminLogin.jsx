
import { useState } from "react";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import AppBar from "./AppBar";
import "./auth.css";
import { apiRequest, saveSession } from "./api";
import { showToast } from "./toast";

export default function AdminLogin({ onLogin, onBack }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    const cleanEmail = email.trim().toLowerCase();

    // Validate email
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError("Please enter a valid admin email address.");
      return;
    }

    // Validate password
    if (!password) {
      setError("Please enter your admin password.");
      return;
    }

    setLoading(true);

    try {
      const data = await apiRequest("/api/auth/admin-login", {
        method: "POST",
        auth: false,
        body: {
          email: cleanEmail,
          password,
        },
      });

      const adminUser = data.user || data.admin;

      if (!data.token || !adminUser) {
        throw new Error(
          "Admin information was not received from the server."
        );
      }

      if (adminUser.role !== "admin") {
        throw new Error("This account does not have admin access.");
      }

      // Save admin session separately from patient session
      saveSession("admin", data.token, adminUser);

      showToast(
        `Signed in as ${adminUser.name}.`,
        "success"
      );

      onLogin(adminUser);
    } catch (requestError) {
      setError(
        requestError.message ||
          "Unable to sign in. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="screen">
      <AppBar onHome={onBack} label="Staff sign in">
        <button
          className="btn btn--secondary btn--sm"
          type="button"
          onClick={onBack}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back to home
        </button>
      </AppBar>

      <main className="screen__main wrap auth__main">
        <div className="panel-box panel-box--light auth__card">
          <div className="auth__head">
            <p className="eyebrow-label">Clinic staff</p>
            <h1>Staff sign in</h1>
            <p>Manage doctors, patients and appointment requests.</p>
          </div>

          <form
            className="form auth__form"
            onSubmit={handleSubmit}
            noValidate
          >
            <label className="field field--full" htmlFor="admin-email">
              Staff email
              <input
                id="admin-email"
                type="email"
                placeholder="admin@medibook.com"
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
                autoComplete="username"
                required
              />
            </label>

            <label className="field field--full" htmlFor="admin-password">
              Password
              <span className="ui-affix ui-affix--trail">
                <input
                  id="admin-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter password"
                  value={password}
                  onChange={(event) =>
                    setPassword(event.target.value)
                  }
                  autoComplete="current-password"
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
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="auth__note">
            Only clinic staff can sign in here. Patients sign in from the home page.
          </p>
        </div>
      </main>
    </div>
  );
}
