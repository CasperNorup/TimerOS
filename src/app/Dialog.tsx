import { useEffect, useId, useRef, type ReactNode } from "react";
import { useLocale } from "./locale";

export function Dialog({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const { t } = useLocale();
  useEffect(() => {
    const element = ref.current!;
    const opener = document.activeElement;
    element.showModal();
    return () => {
      element.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);
  return <dialog ref={ref} className="app-dialog" aria-labelledby={id}
    onCancel={event => { event.preventDefault(); close(); }}>
    <header><h2 id={id}>{title}</h2>
      <button type="button" className="icon-button" aria-label={t("Close")} onClick={close}>×</button>
    </header>
    <div className="dialog-body">{children}</div>
  </dialog>;
}
