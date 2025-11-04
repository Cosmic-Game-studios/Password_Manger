interface AutofillPayload {
  username: string;
  password: string;
  label: string;
}

interface RegistrationPayload {
  username: string;
  email: string;
  password: string;
  domain?: string;
}

interface RegistrationContext {
  form: HTMLFormElement;
  passwordField: HTMLInputElement;
  confirmationField?: HTMLInputElement;
  emailField?: HTMLInputElement;
  usernameField?: HTMLInputElement;
}

type InputElement = HTMLInputElement | HTMLTextAreaElement;

function isVisible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  return style.visibility !== "hidden" && style.display !== "none";
}

function setValue(input: InputElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function guessUsernameField(passwordField: InputElement): InputElement | null {
  const form = passwordField.form;
  if (form) {
    const candidates = Array.from(form.querySelectorAll<HTMLInputElement>(
      'input[type="text"], input[type="email"], input:not([type]), textarea',
    ));
    const visible = candidates.filter((input) => isVisible(input));
    if (visible.length > 0) {
      const preceding = visible.filter((input) => {
        const position = input.compareDocumentPosition(passwordField);
        return (position & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      });
      if (preceding.length > 0) {
        return preceding[preceding.length - 1];
      }
      return visible[0];
    }
  }
  const allInputs = Array.from(document.querySelectorAll<InputElement>(
    'input[type="text"], input[type="email"], input:not([type]), textarea',
  ));
  const index = allInputs.indexOf(passwordField);
  if (index > 0) {
    for (let i = index - 1; i >= 0; i -= 1) {
      const candidate = allInputs[i];
      if (candidate && isVisible(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

function fillCredentials(payload: AutofillPayload): { success: boolean; details: string } {
  const passwordFields = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[type="password" i]'),
  ).filter((input) => isVisible(input));

  if (passwordFields.length === 0) {
    return { success: false, details: "No password field found." };
  }

  const passwordField = passwordFields[0];
  setValue(passwordField, payload.password);

  const usernameField = guessUsernameField(passwordField);
  if (usernameField && payload.username) {
    setValue(usernameField, payload.username);
  }

  return { success: true, details: "Form filled." };
}

function findRegistrationContext(): RegistrationContext | null {
  const forms = Array.from(document.forms) as HTMLFormElement[];
  for (const form of forms) {
    const passwordFields = Array.from(
      form.querySelectorAll<HTMLInputElement>('input[type="password" i]'),
    ).filter((input) => isVisible(input));
    if (passwordFields.length === 0) continue;
    const hasConfirmation =
      passwordFields.length > 1 ||
      passwordFields.some((input) => /confirm|repeat|verify/i.test(input.name));
    if (!hasConfirmation) continue;
    const passwordField = passwordFields[0];
    const confirmationField = passwordFields.find(
      (input) => input !== passwordField && /confirm|repeat|verify/i.test(input.name),
    ) ?? passwordFields[1];
    const emailField =
      form.querySelector<HTMLInputElement>('input[type="email" i]') ??
      Array.from(form.querySelectorAll<HTMLInputElement>('input[type="text" i]')).find((input) =>
        /email|mail/i.test(input.name),
      );
    const usernameField =
      Array.from(form.querySelectorAll<HTMLInputElement>('input[type="text" i], input:not([type])')).find(
        (input) => /user|login|name/i.test(input.name),
      ) ?? guessUsernameField(passwordField);
    return {
      form,
      passwordField,
      confirmationField: confirmationField && confirmationField !== passwordField ? confirmationField : undefined,
      emailField,
      usernameField: usernameField ?? undefined,
    };
  }
  return null;
}

function fillRegistrationForm(payload: RegistrationPayload): { success: boolean; data?: RegistrationPayload } {
  const context = findRegistrationContext();
  if (!context) {
    return { success: false };
  }

  if (context.usernameField) {
    setValue(context.usernameField, payload.username);
  }
  if (context.emailField) {
    setValue(context.emailField, payload.email);
  }
  setValue(context.passwordField, payload.password);
  if (context.confirmationField) {
    setValue(context.confirmationField, payload.password);
  }

  return {
    success: true,
    data: {
      username: context.usernameField?.value || payload.username,
      email: context.emailField?.value || payload.email,
      password: context.passwordField.value || payload.password,
      domain: payload.domain,
    },
  };
}

function isStrongPassword(value: string): boolean {
  if (!value || value.length < 12) {
    return false;
  }
  const hasUpper = /[A-Z]/.test(value);
  const hasLower = /[a-z]/.test(value);
  const hasDigit = /\d/.test(value);
  const hasSymbol = /[^A-Za-z0-9]/.test(value);
  const categories = [hasUpper, hasLower, hasDigit, hasSymbol].filter(Boolean).length;
  return categories >= 3;
}

const guardedForms = new WeakSet<HTMLFormElement>();

function enforceStrongPasswords() {
  const forms = Array.from(document.forms) as HTMLFormElement[];
  forms.forEach((form) => {
    if (guardedForms.has(form)) {
      return;
    }
    const passwordInput = form.querySelector<HTMLInputElement>('input[type="password" i]');
    if (!passwordInput) {
      return;
    }

    const validate = () => {
      if (!isStrongPassword(passwordInput.value)) {
        passwordInput.setCustomValidity(
          "Choose a stronger password (min. 12 characters with mixed character classes).",
        );
      } else {
        passwordInput.setCustomValidity("");
      }
    };

    passwordInput.addEventListener("input", validate);
    form.addEventListener("submit", (event) => {
      validate();
      if (!isStrongPassword(passwordInput.value)) {
        event.preventDefault();
        event.stopPropagation();
        passwordInput.reportValidity();
      }
    });

    guardedForms.add(form);
  });
}

enforceStrongPasswords();

const mutationObserver = new MutationObserver(() => enforceStrongPasswords());
mutationObserver.observe(document.documentElement, { childList: true, subtree: true });

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "vaultlight.autofill") {
    const result = fillCredentials(message.payload as AutofillPayload);
    sendResponse(result);
    return true;
  }

  if (message?.type === "vaultlight.registrationFill") {
    const result = fillRegistrationForm(message.payload as RegistrationPayload);
    sendResponse(result);
    return true;
  }

  return undefined;
});
