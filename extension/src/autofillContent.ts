interface AutofillPayload {
  username: string;
  password: string;
  label: string;
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
  // fallback: closest previous input in DOM
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "vaultlight.autofill") {
    const result = fillCredentials(message.payload as AutofillPayload);
    sendResponse(result);
    return true;
  }
  return undefined;
});
