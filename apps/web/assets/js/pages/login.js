/** Page bootstrap for the login screen. */
import { initTheme } from "../core/preferences.js";
import { createField } from "../ui/inputs.js";
import { initToasts } from "../components/toast.js";
import { login, restoreSession, redirectIfAuthenticated, requestPasswordReset } from "../core/auth.js";
import { handleError } from "../core/error-handler.js";
import { validateEmail } from "../shared/validation-rules.js";
import { notifySuccess } from "../ui/notifications.js";
import { openDialog } from "../ui/dialogs.js";

initTheme();
initToasts();

const form = document.querySelector("[data-login-form]");
const alertBox = document.querySelector("[data-auth-alert]");
const submitBtn = document.querySelector("[data-login-submit]");

const emailField = createField({
  label: "Email address",
  type: "email",
  placeholder: "you@company.com",
  required: true,
  autocomplete: "username",
});
const passwordField = createField({
  label: "Password",
  type: "password",
  placeholder: "Your password",
  required: true,
  autocomplete: "current-password",
  togglePassword: true,
});

document.querySelector("[data-field-email]").append(emailField.element);
document.querySelector("[data-field-password]").append(passwordField.element);

function showAlert(message, tone = "danger") {
  alertBox.hidden = !message;
  alertBox.className = `auth-alert badge badge--${tone}`;
  alertBox.textContent = message || "";
}

function setBusy(busy) {
  submitBtn.disabled = busy;
  submitBtn.classList.toggle("is-loading", busy);
  submitBtn.querySelector("span").textContent = busy ? "Signing in…" : "Sign in";
}

// If already signed in, skip the login screen.
restoreSession().then((authenticated) => {
  if (authenticated) {
    const params = new URLSearchParams(window.location.search);
    window.location.replace(params.get("next") || "/dialer.html");
  }
});

const params = new URLSearchParams(window.location.search);
if (params.get("expired")) showAlert("Your session expired. Please sign in again.", "warning");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showAlert("");

  const email = emailField.getValue().trim();
  const password = passwordField.getValue();
  const emailCheck = validateEmail(email);
  if (!emailCheck.valid) {
    emailField.setError(emailCheck.message);
    return;
  }
  if (!password) {
    passwordField.setError("Enter your password.");
    return;
  }

  setBusy(true);
  try {
    await login({ email, password });
    const next = new URLSearchParams(window.location.search).get("next") || "/dialer.html";
    window.location.replace(next);
  } catch (error) {
    const info = handleError(error, { silent: true });
    if (info.status === 401) showAlert("Incorrect email or password.");
    else if (info.status === 429) showAlert("Too many attempts. Please wait and try again.", "warning");
    else showAlert(info.message);
    if (info.fields) {
      if (info.fields.email) emailField.setError(info.fields.email);
      if (info.fields.password) passwordField.setError(info.fields.password);
    }
  } finally {
    setBusy(false);
  }
});

document.querySelector("[data-forgot-password]")?.addEventListener("click", () => {
  const resetEmail = createField({ label: "Email address", type: "email", value: emailField.getValue(), required: true });
  const body = document.createElement("div");
  body.className = "stack";
  const help = document.createElement("p");
  help.className = "text-sm text-muted";
  help.textContent = "Enter your email address and we will send password reset instructions.";
  body.append(help, resetEmail.element);

  openDialog({
    title: "Reset password",
    body: [body],
    actions: [
      { label: "Cancel", variant: "secondary", value: "cancel" },
      { label: "Send instructions", variant: "primary", value: "send" },
    ],
  }).promise.then(async (value) => {
    if (value !== "send") return;
    const email = resetEmail.getValue().trim();
    const check = validateEmail(email);
    if (!check.valid) {
      resetEmail.setError(check.message);
      return;
    }
    try {
      await requestPasswordReset(email);
      notifySuccess("If that email exists, reset instructions are on their way.");
    } catch (error) {
      handleError(error);
    }
  });
});
