import { useEffect, useRef } from "react";

// Six boxes for a one-time code. Typing moves to the next box, Backspace moves
// back, and pasting (or the phone's "from Messages/Mail" suggestion in the
// first box) fills every box at once.
export default function CodeInput({
  length = 6,
  value,
  onChange,
  onComplete,
  disabled = false,
  invalid = false,
  idPrefix = "code",
  describedBy,
}) {
  const refs = useRef([]);
  // value keeps each box in place; an empty box in the middle is a space.
  const digits = Array.from({ length }, (_, i) => (value[i] || "").trim());

  // The latest digits, updated at once on every keystroke: fast typing (or a
  // password manager) can fire several keys before React re-renders.
  // Synced from the value prop after each render (e.g. cleared by the parent).
  const current = useRef(digits);
  useEffect(() => {
    current.current = Array.from({ length }, (_, i) => (value[i] || "").trim());
  }, [value, length]);

  function commit(next) {
    current.current = next;
    const joined = next.map((digit) => digit || " ").join("").trimEnd();
    onChange(joined);
    return joined;
  }

  function focusBox(index) {
    const box = refs.current[Math.max(0, Math.min(length - 1, index))];
    box?.focus();
    box?.select();
  }

  function setFrom(index, text) {
    const clean = text.replace(/\D/g, "");
    if (!clean) return;

    const next = current.current.slice();
    for (let i = 0; i < clean.length && index + i < length; i++) {
      next[index + i] = clean[i];
    }

    const joined = commit(next);
    focusBox(Math.min(index + clean.length, length - 1));

    if (joined.length === length && !next.includes("")) onComplete?.(joined);
  }

  function handleKeyDown(event, index) {
    if (event.key === "Backspace") {
      event.preventDefault();
      const next = current.current.slice();

      if (next[index]) {
        next[index] = "";
      } else if (index > 0) {
        next[index - 1] = "";
        focusBox(index - 1);
      }

      commit(next);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusBox(index - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      focusBox(index + 1);
    }
  }

  return (
    <div className="code-input" role="group" aria-label={`${length}-digit code`}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => { refs.current[index] = el; }}
          id={index === 0 ? idPrefix : `${idPrefix}-${index}`}
          className="code-input__box"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={index === 0 ? length : 1}
          aria-label={`Digit ${index + 1} of ${length}`}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          value={digit}
          disabled={disabled}
          onFocus={(event) => event.target.select()}
          onChange={(event) => setFrom(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(event, index)}
          onPaste={(event) => {
            event.preventDefault();
            setFrom(index, event.clipboardData.getData("text"));
          }}
        />
      ))}
    </div>
  );
}
